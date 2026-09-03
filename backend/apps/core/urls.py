"""
Core application URLs including authentication and system health.
"""
from django.urls import path
from .auth_views import (
    RegisterView, LoginView, CookieRefreshView,
    LogoutView, MeView, AccountDeleteView, HealthCheckView,
    PasswordResetRequestView, PasswordResetConfirmView,
)

urlpatterns = [
    # Auth endpoints
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/refresh/', CookieRefreshView.as_view(), name='auth-refresh'),  # cookie-based
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('auth/account/', AccountDeleteView.as_view(), name='auth-account-delete'),
    path('auth/password-reset/request/', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('auth/password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),

    # DevOps & System Health
    path('health/', HealthCheckView.as_view(), name='system-health'),
]
