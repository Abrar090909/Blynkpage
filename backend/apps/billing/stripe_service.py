"""
Stripe service for Blynkpages subscription billing.
Handles checkout session creation, customer portal sessions, and webhooks.
Gracefully operates in test/mock mode if STRIPE_SECRET_KEY is not configured.
"""
import logging
from django.conf import settings
from django.utils import timezone
from .models import UserSubscription

logger = logging.getLogger(__name__)

# Plan price IDs (configurable in settings or environment)
PLAN_PRICE_MAP = {
    'starter': getattr(settings, 'STRIPE_PRICE_STARTER', 'price_starter_monthly'),
    'pro': getattr(settings, 'STRIPE_PRICE_PRO', 'price_pro_monthly'),
}


def _get_stripe():
    """Import and configure stripe SDK if installed and configured."""
    try:
        import stripe
        api_key = getattr(settings, 'STRIPE_SECRET_KEY', None)
        if api_key and not api_key.startswith('sk_test_placeholder'):
            stripe.api_key = api_key
            return stripe
        return None
    except ImportError:
        return None


def create_checkout_session(user, plan: str, success_url: str, cancel_url: str) -> dict:
    """
    Creates a Stripe Checkout Session for upgrading to Starter or Pro.
    Returns {'url': session_url, 'session_id': id}.
    """
    sub = user.subscription if hasattr(user, 'subscription') else None
    stripe_lib = _get_stripe()

    if stripe_lib:
        try:
            # Ensure customer exists in Stripe
            customer_id = sub.stripe_customer_id if sub and sub.stripe_customer_id else None
            if not customer_id:
                customer = stripe_lib.Customer.create(
                    email=user.email,
                    name=user.get_full_name() or user.username,
                    metadata={'user_id': str(user.id)},
                )
                customer_id = customer.id
                if sub:
                    sub.stripe_customer_id = customer_id
                    sub.save(update_fields=['stripe_customer_id'])

            price_id = PLAN_PRICE_MAP.get(plan, PLAN_PRICE_MAP['starter'])

            session = stripe_lib.checkout.Session.create(
                customer=customer_id,
                payment_method_types=['card'],
                line_items=[{'price': price_id, 'quantity': 1}],
                mode='subscription',
                success_url=success_url + '?session_id={CHECKOUT_SESSION_ID}&upgraded=true',
                cancel_url=cancel_url,
                metadata={'user_id': str(user.id), 'target_plan': plan},
            )
            return {'url': session.url, 'session_id': session.id}
        except Exception as e:
            logger.exception("Stripe checkout creation error: %s", e)
            raise

    # Test / Dev Fallback: Simulate successful upgrade redirect
    logger.info("Operating in Stripe test simulation mode for user %s, plan %s", user.email, plan)
    if sub:
        sub.plan = plan
        sub.status = UserSubscription.Status.ACTIVE
        sub.save(update_fields=['plan', 'status'])
    return {'url': success_url + '?test_upgraded=true', 'session_id': 'test_simulated_session'}


def create_portal_session(user, return_url: str) -> dict:
    """Creates a Stripe Customer Portal session so users can manage their subscription."""
    sub = getattr(user, 'subscription', None)
    stripe_lib = _get_stripe()

    if stripe_lib and sub and sub.stripe_customer_id:
        try:
            portal = stripe_lib.billing_portal.Session.create(
                customer=sub.stripe_customer_id,
                return_url=return_url,
            )
            return {'url': portal.url}
        except Exception as e:
            logger.exception("Stripe portal creation error: %s", e)
            raise

    return {'url': return_url}


def handle_webhook_event(payload: bytes, sig_header: str | None = None) -> bool:
    """
    Processes incoming Stripe webhook events to keep subscription state synchronized.
    """
    stripe_lib = _get_stripe()
    webhook_secret = getattr(settings, 'STRIPE_WEBHOOK_SECRET', None)

    if stripe_lib and webhook_secret and sig_header:
        try:
            event = stripe_lib.Webhook.construct_event(payload, sig_header, webhook_secret)
        except Exception as e:
            logger.error("Invalid Stripe webhook signature: %s", e)
            return False
    else:
        import json
        try:
            event = json.loads(payload.decode('utf-8'))
        except Exception:
            return False

    event_type = event.get('type')
    data_object = event.get('data', {}).get('object', {})

    logger.info("Processing Stripe webhook event: %s", event_type)

    if event_type == 'checkout.session.completed':
        customer_id = data_object.get('customer')
        sub_id = data_object.get('subscription')
        target_plan = data_object.get('metadata', {}).get('target_plan', 'starter')
        user_id = data_object.get('metadata', {}).get('user_id')

        try:
            sub = None
            if user_id:
                sub = UserSubscription.objects.filter(user_id=user_id).first()
            if not sub and customer_id:
                sub = UserSubscription.objects.filter(stripe_customer_id=customer_id).first()

            if sub:
                sub.plan = target_plan
                sub.status = UserSubscription.Status.ACTIVE
                if sub_id:
                    sub.stripe_subscription_id = sub_id
                sub.save(update_fields=['plan', 'status', 'stripe_subscription_id'])
                logger.info("User %s successfully upgraded to %s", sub.user.email, target_plan)
        except Exception as e:
            logger.error("Error handling checkout.session.completed: %s", e)

    elif event_type in ('customer.subscription.updated', 'customer.subscription.deleted'):
        sub_id = data_object.get('id')
        sub_status = data_object.get('status')
        sub = UserSubscription.objects.filter(stripe_subscription_id=sub_id).first()
        if sub:
            if event_type == 'customer.subscription.deleted' or sub_status in ('canceled', 'unpaid'):
                sub.plan = UserSubscription.Plan.FREE
                sub.status = UserSubscription.Status.CANCELED
            elif sub_status == 'active':
                sub.status = UserSubscription.Status.ACTIVE
            sub.save(update_fields=['plan', 'status'])

    return True
