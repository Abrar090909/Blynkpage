from django.urls import path
from .views import (
    SubscriptionStatusView,
    CreateCheckoutSessionView,
    CreateCustomerPortalView,
    StripeWebhookView,
)

urlpatterns = [
    path('me/', SubscriptionStatusView.as_view(), name='billing-me'),
    path('checkout/', CreateCheckoutSessionView.as_view(), name='billing-checkout'),
    path('portal/', CreateCustomerPortalView.as_view(), name='billing-portal'),
    path('webhook/', StripeWebhookView.as_view(), name='billing-webhook'),
]
