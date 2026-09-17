import json
import hmac, hashlib, logging
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from .events import dispatch_payment_event

logger = logging.getLogger(__name__)

@csrf_exempt
def stripe_webhook_endpoint(request):
    """Ingests Stripe webhook notifications and dispatches domain events."""
    if request.method != "POST":
        return HttpResponseBadRequest("Method not allowed")

    # Verify Stripe signature
    sig = request.headers.get("Stripe-Signature", "")
    secret = settings.STRIPE_WEBHOOK_SECRET
    try:
        payload = json.loads(request.body)
        mac = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(mac, sig.split(",")[1].split("=")[1]):
            return HttpResponseBadRequest("Invalid signature")
    except Exception:
        return HttpResponseBadRequest("Malformed payload")

    event_type = payload.get("type")
    logger.info(f"Received billing webhook: {event_type}")

    if event_type == "checkout.session.completed":
        data = payload.get("data", {}).get("object", {})
        dispatch_payment_event(data.get("customer"), data.get("amount_total", 0), "paid")
    elif event_type == "customer.subscription.deleted":
        data = payload.get("data", {}).get("object", {})
        dispatch_payment_event(data.get("customer"), 0, "canceled")
    elif event_type == "invoice.payment_failed":
        data = payload.get("data", {}).get("object", {})
        dispatch_payment_event(data.get("customer"), 0, "failed")

    return JsonResponse({"status": "received"})
