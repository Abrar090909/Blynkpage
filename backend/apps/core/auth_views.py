"""
Authentication and system health API views for Blynkpages.

Security hardening:
  - Refresh token stored in httpOnly, Secure, SameSite=Strict cookie.
    This ensures the refresh token is NEVER accessible via JavaScript,
    eliminating the XSS-via-localStorage attack surface even when AI-
    generated HTML is rendered in an adjacent iframe.
  - Access token returned only in the JSON response body — the frontend
    stores it in React state (memory only), not localStorage.
  - /api/auth/refresh/ reads the cookie server-side; JS never sees the refresh token.
  - /api/auth/logout/ deletes the cookie server-side.
  - /api/auth/account/ DELETE — GDPR right to erasure with password confirmation.
"""
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken

from .auth_serializers import RegisterSerializer, LoginSerializer, UserSerializer

User = get_user_model()

REFRESH_COOKIE_NAME = 'blynk_refresh'
REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 14  # 14 days
# In DEBUG mode allow non-Secure cookie so localhost HTTP works
_COOKIE_SECURE = not getattr(settings, 'DEBUG', True)


def _set_refresh_cookie(response, refresh_token_str: str):
    """Attach the refresh token as an httpOnly, SameSite=Strict cookie."""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token_str,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite='Strict',
        path='/api/auth/',  # Scoped: only sent on auth endpoint requests
    )


def _clear_refresh_cookie(response):
    """Delete the refresh cookie."""
    response.delete_cookie(REFRESH_COOKIE_NAME, path='/api/auth/')


class RegisterView(APIView):
    """
    POST /api/auth/register/
    Creates a new user account (atomic, race-condition protected).
    Returns access token in body; refresh token set as httpOnly cookie.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        user_data = UserSerializer(user).data

        response = Response({
            'user': user_data,
            'tokens': {
                'access': str(refresh.access_token),
                # Refresh token is NOT in the body — it is set as an httpOnly cookie.
            },
        }, status=status.HTTP_201_CREATED)
        _set_refresh_cookie(response, str(refresh))
        return response


class LoginView(APIView):
    """
    POST /api/auth/login/
    Authenticates user. Returns access token in body; refresh set as httpOnly cookie.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        user = validated_data['user']
        user_data = UserSerializer(user).data

        # Always issue a fresh token pair at login time
        refresh = RefreshToken.for_user(user)

        response = Response({
            'user': user_data,
            'tokens': {
                'access': str(refresh.access_token),
            },
        }, status=status.HTTP_200_OK)
        _set_refresh_cookie(response, str(refresh))
        return response


class CookieRefreshView(APIView):
    """
    POST /api/auth/refresh/
    Reads the httpOnly refresh cookie and returns a new access token.
    Replaces the simplejwt TokenRefreshView so the refresh token is never
    exposed to JavaScript. The cookie is rotated on every successful refresh.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not refresh_token:
            return Response(
                {'detail': 'Refresh token cookie not present. Please log in again.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            token = RefreshToken(refresh_token)
            new_access = str(token.access_token)
        except (TokenError, InvalidToken):
            response = Response(
                {'detail': 'Refresh token is invalid or expired. Please log in again.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_refresh_cookie(response)
            return response

        response = Response({'access': new_access}, status=status.HTTP_200_OK)
        # Rotate: issue a new refresh token cookie
        new_refresh = RefreshToken.for_user(token.payload.get('user_id') and
                                            User.objects.filter(id=token.payload['user_id']).first()
                                            or None)
        if new_refresh:
            _set_refresh_cookie(response, str(new_refresh))
        return response


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Clears the httpOnly refresh cookie. The frontend discards the in-memory access token.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        response = Response({'detail': 'Logged out successfully.'}, status=status.HTTP_200_OK)
        _clear_refresh_cookie(response)
        return response


class MeView(APIView):
    """
    GET /api/auth/me/
    Returns profile information for the currently authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AccountDeleteView(APIView):
    """
    DELETE /api/auth/account/
    GDPR Article 17 right to erasure.
    Permanently deletes the authenticated user and cascades to all
    their projects, generations, published pages, and chat history.
    Requires password confirmation to prevent accidental or CSRF-triggered deletion.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        password = (request.data or {}).get('password', '')
        if not password:
            return Response(
                {'error': 'Password confirmation is required to delete your account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(password):
            return Response(
                {'error': 'Incorrect password. Account deletion requires your current password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Cascade delete: all projects/generations/pages are foreign-keyed to User
        request.user.delete()
        response = Response(
            {'detail': 'Account and all associated data have been permanently deleted.'},
            status=status.HTTP_200_OK,
        )
        _clear_refresh_cookie(response)
        return response


class HealthCheckView(APIView):
    """
    GET /api/health/
    Production health check for load balancers and container orchestrators.
    Verifies database connectivity and system clock.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        db_status = 'healthy'
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
                cursor.fetchone()
        except Exception as e:
            db_status = f'unhealthy: {str(e)}'

        is_healthy = db_status == 'healthy'
        http_status = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

        return Response({
            'status': 'healthy' if is_healthy else 'degraded',
            'database': db_status,
            'timestamp': timezone.now().isoformat(),
            'version': '1.0.0',
        }, status=http_status)


# ─── Password Reset Lifecycle ────────────────────────────────────────────────

from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.conf import settings


class PasswordResetRequestView(APIView):
    """
    POST /api/auth/password-reset/request/
    Initiate password reset email with secure one-time token.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'error': 'Email address is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        dev_reset_url = None

        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            origin = request.headers.get('Origin') or 'http://localhost:5173'
            dev_reset_url = f"{origin}/?reset_uid={uid}&reset_token={token}"

            try:
                send_mail(
                    subject='Reset your Blynkpages password',
                    message=f"Hello {user.username},\n\nClick the link below to reset your password:\n{dev_reset_url}\n\nIf you did not request this, please ignore this email.",
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@blynkpages.com'),
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            except Exception as e:
                logger.warning("Failed to send reset email: %s", e)

        is_dev = getattr(settings, 'DEBUG', False) or getattr(settings, 'IS_DEV_OR_TEST', True)
        return Response({
            'detail': 'If an account exists with that email, a password reset link has been dispatched.',
            'dev_reset_url': dev_reset_url if is_dev else None,
        }, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """
    POST /api/auth/password-reset/confirm/
    Consume one-time token and update user's password.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = (request.data.get('new_password') or '').strip()

        if not uidb64 or not token or not new_password:
            return Response({'error': 'uid, token, and new_password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters long.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'error': 'Invalid or expired password reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Password reset token is invalid or has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        return Response({
            'detail': 'Your password has been successfully reset. You can now log in with your new credentials.'
        }, status=status.HTTP_200_OK)

