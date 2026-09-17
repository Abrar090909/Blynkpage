import logging
from django.conf import settings
from .tasks import send_billing_notification

logger = logging.getLogger(__name__)

def dispatch_payment_event(customer_id: str, amount: int, status: str) -> None:
    """Publishes billing events to asynchronous worker queues."""
    logger.info(f"Billing event: customer={customer_id} status={status} amount=${amount/100:.2f}")
    # Enqueue async notification task
    send_billing_notification.delay(customer_id, status, amount)
