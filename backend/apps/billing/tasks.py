from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def send_billing_notification(self, customer_id: str, status: str, amount: int) -> None:
    """Celery task: sends billing notification emails via SES."""
    try:
        from .email import send_billing_email
        send_billing_email(customer_id, status, amount)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
