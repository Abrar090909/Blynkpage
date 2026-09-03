from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.http import HttpResponse

from .models import get_or_create_subscription, UserSubscription
from . import stripe_service


class SubscriptionStatusView(APIView):
    """
    GET: Retrieve current user's subscription tier, usage, remaining limit, and reset date.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sub = get_or_create_subscription(request.user)
        sub.check_and_reset_month()
        limit = sub.get_limit()
        used = sub.monthly_generations_used
        remaining = max(0, limit - used) if limit is not None else None

        return Response({
            'plan': sub.plan,
            'plan_display': sub.get_plan_display(),
            'status': sub.status,
            'used': used,
            'limit': limit,
            'limit_display': sub.get_limit_display(),
            'remaining': remaining,
            'can_generate': (used < limit) if limit is not None else True,
            'reset_date': sub.generation_reset_date,
            'is_pro': sub.plan == UserSubscription.Plan.PRO,
        }, status=status.HTTP_200_OK)


class CreateCheckoutSessionView(APIView):
    """
    POST: Initialize a Stripe Checkout session to upgrade to Starter or Pro.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        target_plan = request.data.get('plan', 'starter')
        if target_plan not in ('starter', 'pro'):
            return Response({'error': 'Invalid plan selected. Choose "starter" or "pro".'}, status=status.HTTP_400_BAD_REQUEST)

        origin = request.headers.get('Origin') or 'http://localhost:5173'
        success_url = request.data.get('success_url') or f"{origin}/"
        cancel_url = request.data.get('cancel_url') or f"{origin}/"

        try:
            session_data = stripe_service.create_checkout_session(
                user=request.user,
                plan=target_plan,
                success_url=success_url,
                cancel_url=cancel_url,
            )
            return Response(session_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CreateCustomerPortalView(APIView):
    """
    POST: Generate a Stripe Customer Portal link to manage active subscription.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        origin = request.headers.get('Origin') or 'http://localhost:5173'
        return_url = request.data.get('return_url') or f"{origin}/"

        try:
            portal_data = stripe_service.create_portal_session(request.user, return_url)
            return Response(portal_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StripeWebhookView(APIView):
    """
    POST: Inbound Stripe webhook endpoint for asynchronous payment and subscription lifecycle events.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        payload = request.body
        sig_header = request.headers.get('Stripe-Signature')

        success = stripe_service.handle_webhook_event(payload, sig_header)
        if success:
            return HttpResponse(status=200)
        return HttpResponse(status=400)
