from django.test import TestCase
from django.contrib.auth.models import User
from apps.billing.models import UserSubscription, get_or_create_subscription


class UserSubscriptionQuotaTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tester@example.com', email='tester@example.com', password='Password123!')
        self.sub = get_or_create_subscription(self.user)

    def test_free_tier_limits_to_three_generations(self):
        """Verify that free users can generate 3 times, but are blocked on the 4th."""
        self.assertEqual(self.sub.plan, UserSubscription.Plan.FREE)
        self.assertEqual(self.sub.get_limit(), 3)

        # 1st generation
        allowed, used, limit, _ = self.sub.can_generate()
        self.assertTrue(allowed)
        self.sub.increment_generation()

        # 2nd generation
        allowed, used, limit, _ = self.sub.can_generate()
        self.assertTrue(allowed)
        self.sub.increment_generation()

        # 3rd generation
        allowed, used, limit, _ = self.sub.can_generate()
        self.assertTrue(allowed)
        self.sub.increment_generation()

        # 4th generation must be BLOCKED
        allowed, used, limit, msg = self.sub.can_generate()
        self.assertFalse(allowed)
        self.assertEqual(used, 3)
        self.assertEqual(limit, 3)
        self.assertIn("Monthly generation limit reached", msg)

    def test_pro_tier_unlimited(self):
        """Verify Pro users have unlimited quota."""
        self.sub.plan = UserSubscription.Plan.PRO
        self.sub.monthly_generations_used = 100
        self.sub.save()

        allowed, used, limit, _ = self.sub.can_generate()
        self.assertTrue(allowed)
        self.assertIsNone(limit)
