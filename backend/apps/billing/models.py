from datetime import timedelta
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class UserSubscription(models.Model):
    """
    Tracks a user's subscription tier, usage, and limits.
    Enforces the free tier quota: max 3 generations per calendar month.
    """
    class Plan(models.TextChoices):
        FREE = 'free', 'Free Tier (3 gens/mo)'
        STARTER = 'starter', 'Starter ($29/mo, 30 gens)'
        PRO = 'pro', 'Pro ($79/mo, Unlimited + CAPI)'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        PAST_DUE = 'past_due', 'Past Due'
        CANCELED = 'canceled', 'Canceled'
        TRIALING = 'trialing', 'Trialing'

    PLAN_LIMITS = {
        Plan.FREE: 3,
        Plan.STARTER: 30,
        Plan.PRO: None,  # Unlimited
    }

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='subscription')
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    monthly_generations_used = models.PositiveIntegerField(default=0)
    generation_reset_date = models.DateTimeField(default=timezone.now)
    stripe_customer_id = models.CharField(max_length=100, blank=True)
    stripe_subscription_id = models.CharField(max_length=100, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'User Subscription'
        verbose_name_plural = 'User Subscriptions'

    def __str__(self):
        return f"{self.user.email} [{self.plan.upper()}] ({self.monthly_generations_used}/{self.get_limit_display()})"

    def check_and_reset_month(self):
        """Automatically resets the generation count if 30 days have passed."""
        now = timezone.now()
        if now - self.generation_reset_date >= timedelta(days=30):
            self.monthly_generations_used = 0
            self.generation_reset_date = now
            self.save(update_fields=['monthly_generations_used', 'generation_reset_date'])

    def get_limit(self) -> int | None:
        return self.PLAN_LIMITS.get(self.plan, 3)

    def get_limit_display(self) -> str:
        limit = self.get_limit()
        return "Unlimited" if limit is None else str(limit)

    def can_generate(self) -> tuple[bool, int, int | None, str]:
        """
        Returns (allowed, used, limit, message).
        Checks if the user has quota remaining for this month.
        """
        self.check_and_reset_month()
        limit = self.get_limit()

        if limit is None:
            return True, self.monthly_generations_used, None, "Unlimited quota"

        if self.monthly_generations_used >= limit:
            return False, self.monthly_generations_used, limit, (
                f"Monthly generation limit reached ({self.monthly_generations_used}/{limit} used). "
                f"Upgrade your plan to unlock more generations."
            )

        return True, self.monthly_generations_used, limit, "Quota available"

    def increment_generation(self):
        """Increments the generation counter by 1."""
        self.check_and_reset_month()
        self.monthly_generations_used += 1
        self.save(update_fields=['monthly_generations_used', 'updated_at'])


def get_or_create_subscription(user: User) -> UserSubscription:
    """Helper to safely obtain a user's subscription record, creating free tier if missing."""
    sub, _ = UserSubscription.objects.get_or_create(user=user)
    return sub
