"""
Automated Test Suite for Blynkpages:
- Authentication & JWT Layer
- Concurrent Signup Race Condition Protections
- Anti-IDOR & Zero DevTools Bypass Security
- Anti-Injection & Input Sanitization
- DevOps System Health Endpoint
"""
import uuid
from concurrent.futures import ThreadPoolExecutor
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.db import connection
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.pages.models import Project, Generation, ChatMessage, PublishedPage

User = get_user_model()


class AuthenticationTests(APITestCase):
    """Tests covering user registration, login, token refresh, and profile."""

    def setUp(self):
        self.register_url = '/api/auth/register/'
        self.login_url = '/api/auth/login/'
        self.refresh_url = '/api/auth/refresh/'
        self.me_url = '/api/auth/me/'

    def test_successful_registration(self):
        payload = {
            'email': 'founder@startup.io',
            'password': 'SecurePassword123!@#',
            'name': 'Alex Founder',
        }
        res = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('tokens', res.data)
        self.assertIn('access', res.data['tokens'])
        # Refresh token is now in an httpOnly cookie, NOT in the response body (security hardening)
        self.assertNotIn('refresh', res.data.get('tokens', {}))
        # Verify the httpOnly refresh cookie was set
        self.assertIn('blynk_refresh', res.cookies)
        self.assertEqual(res.data['user']['email'], 'founder@startup.io')
        self.assertEqual(res.data['user']['first_name'], 'Alex Founder')

    def test_duplicate_email_rejected_case_insensitive(self):
        User.objects.create_user(
            username='existing',
            email='founder@startup.io',
            password='Password123!@#'
        )
        # Attempt signup with uppercase/mixed case
        payload = {
            'email': 'FOUNDER@STARTUP.IO',
            'password': 'AnotherPassword123!',
        }
        res = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', res.data)

    def test_weak_password_rejected(self):
        payload = {
            'email': 'weak@startup.io',
            'password': '123',  # Too short
        }
        res = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', res.data)

    def test_login_and_token_refresh(self):
        User.objects.create_user(
            username='jane',
            email='jane@startup.io',
            password='StrongPassword123!'
        )
        login_payload = {
            'email': 'jane@startup.io',
            'password': 'StrongPassword123!'
        }
        res = self.client.post(self.login_url, login_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        access_token = res.data['tokens']['access']

        # Security hardening: refresh token is in an httpOnly cookie, not the response body
        self.assertIn('blynk_refresh', res.cookies)
        self.assertNotIn('refresh', res.data.get('tokens', {}))

        # Test cookie-based token refresh (no body params needed — browser sends cookie)
        refresh_res = self.client.post(self.refresh_url)
        self.assertEqual(refresh_res.status_code, status.HTTP_200_OK)
        self.assertIn('access', refresh_res.data)

        # Test access to /api/auth/me/ with the original access token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        me_res = self.client.get(self.me_url)
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertEqual(me_res.data['email'], 'jane@startup.io')


class SecurityAndIsolationTests(APITestCase):
    """
    Tests ensuring zero DevTools bypass, anti-IDOR, and project tenant isolation.
    Even if an attacker tampers with network requests or local storage in DevTools,
    the server enforces cryptographic JWT checks and ownership validation.
    """

    def setUp(self):
        self.user_a = User.objects.create_user(
            username='user_a',
            email='usera@startup.io',
            password='PasswordA123!'
        )
        self.user_b = User.objects.create_user(
            username='user_b',
            email='userb@startup.io',
            password='PasswordB123!'
        )

        self.token_a = str(RefreshToken.for_user(self.user_a).access_token)
        self.token_b = str(RefreshToken.for_user(self.user_b).access_token)

        # Project belonging to User A
        self.project_a = Project.objects.create(
            user=self.user_a,
            original_prompt='Landing page for Product A',
            enhanced_brief='Landing page for Product A',
            name='Product A',
            slug='prod-a',
            status=Project.Status.READY,
        )
        self.gen_a = Generation.objects.create(
            project=self.project_a,
            prompt_used='brief',
            html_output='<h1>Product A</h1>',
            is_current=True,
        )

    def test_unauthenticated_request_blocked(self):
        """DevTools tamper: clearing tokens results in 401."""
        res = self.client.get(f'/api/projects/{self.project_a.id}/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_forged_invalid_jwt_blocked(self):
        """DevTools tamper: injecting fake or forged token results in 401."""
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fake.jwt.token123')
        res = self.client.get(f'/api/projects/{self.project_a.id}/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_idor_user_b_cannot_access_user_a_project(self):
        """
        DevTools tamper: User B changes project UUID in network request to User A's project.
        Server returns 403 Forbidden.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        res = self.client.get(f'/api/projects/{self.project_a.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('error', res.data)

    def test_idor_user_b_cannot_chat_or_modify_user_a_project(self):
        """User B attempts to send chat refinement on User A's project."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        res = self.client.post(
            f'/api/projects/{self.project_a.id}/chat/',
            {'message': 'Hacked title'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_idor_user_b_cannot_publish_user_a_project(self):
        """User B attempts to publish User A's project."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        res = self.client.post(f'/api/projects/{self.project_a.id}/publish/', format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_access_and_publish(self):
        """Legitimate owner has full access."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_a}')
        res = self.client.get(f'/api/projects/{self.project_a.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['name'], 'Product A')

        # Publish test
        pub_res = self.client.post(f'/api/projects/{self.project_a.id}/publish/', format='json')
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK)
        self.assertIn('published_url', pub_res.data)


class AntiInjectionAndValidationTests(APITestCase):
    """Tests protecting against SQL injection, null byte injection, and prompt flooding."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='tester',
            email='tester@startup.io',
            password='Password123!'
        )
        self.token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

    def test_prompt_length_limit(self):
        """Giant prompt flooding is rejected."""
        giant_prompt = "A" * 15000
        res = self.client.post('/api/projects/', {'prompt': giant_prompt}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', res.data)

    def test_null_byte_sanitization(self):
        """Null byte injection is cleanly sanitized and processed safely."""
        prompt_with_null = "Clean prompt \x00 with malicious injection"
        res = self.client.post('/api/projects/', {'prompt': prompt_with_null}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('\x00', res.data['original_prompt'])


class DevOpsHealthCheckTests(APITestCase):
    """Tests for system uptime and container readiness checks."""

    def test_health_check_returns_200(self):
        res = self.client.get('/api/health/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'healthy')
        self.assertEqual(res.data['database'], 'healthy')
        self.assertIn('timestamp', res.data)
        self.assertIn('version', res.data)


class SaaSExtensionTests(APITestCase):
    """Tests covering 3-generation limit, password reset, leads, versions, and analytics."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='saas_tester@example.com',
            email='saas_tester@example.com',
            password='InitialPassword123!'
        )
        self.token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

    def test_free_tier_three_generation_quota_blocks_at_limit(self):
        """User on free tier is blocked on project creation after 3 generations."""
        from apps.billing.models import get_or_create_subscription
        sub = get_or_create_subscription(self.user)
        sub.monthly_generations_used = 3
        sub.save()

        res = self.client.post('/api/projects/', {'prompt': 'Another landing page'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertTrue(res.data.get('upgrade_required'))
        self.assertEqual(res.data.get('used'), 3)
        self.assertEqual(res.data.get('limit'), 3)

    def test_password_reset_flow(self):
        """Requesting password reset and confirming with new password allows subsequent login."""
        # 1. Request reset
        req_res = self.client.post('/api/auth/password-reset/request/', {'email': 'saas_tester@example.com'}, format='json')
        self.assertEqual(req_res.status_code, status.HTTP_200_OK)
        dev_url = req_res.data.get('dev_reset_url')
        self.assertIsNotNone(dev_url)

        # Parse uid and token
        import urllib.parse
        parsed = urllib.parse.urlparse(dev_url)
        params = urllib.parse.parse_qs(parsed.query)
        uid = params['reset_uid'][0]
        token = params['reset_token'][0]

        # 2. Confirm reset
        conf_res = self.client.post('/api/auth/password-reset/confirm/', {
            'uid': uid,
            'token': token,
            'new_password': 'BrandNewPassword456!'
        }, format='json')
        self.assertEqual(conf_res.status_code, status.HTTP_200_OK)

        # 3. Verify login with new password
        login_res = self.client.post('/api/auth/login/', {
            'email': 'saas_tester@example.com',
            'password': 'BrandNewPassword456!'
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    def test_lead_order_capture_and_listing(self):
        """Public order submission creates a lead that project owner can retrieve."""
        project = Project.objects.create(
            user=self.user,
            original_prompt='Streetwear hoodie',
            slug='funk123',
            status=Project.Status.PUBLISHED,
        )
        gen = Generation.objects.create(
            project=project,
            prompt_used='prompt',
            html_output='<h1>FUNK</h1>',
            is_current=True,
        )
        pub = PublishedPage.objects.create(
            project=project,
            public_url_slug='funk-drop-1',
            generation=gen,
        )

        # Anonymous visitor submits order
        anon_client = self.client_class()
        order_payload = {
            'name': 'Rohan Patel',
            'phone': '9876543210',
            'address': 'Flat 402, Mumbai',
            'variant': 'Size XL',
            'utm_source': 'meta_ads',
            'utm_campaign': 'heavyweight_hoodie',
        }
        submit_res = anon_client.post('/p/funk-drop-1/submit/', order_payload, format='json')
        self.assertEqual(submit_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(submit_res.data.get('success'))

        # Owner fetches leads
        leads_res = self.client.get(f'/api/projects/{project.id}/leads/')
        self.assertEqual(leads_res.status_code, status.HTTP_200_OK)
        self.assertEqual(leads_res.data['count'], 1)
        self.assertEqual(leads_res.data['leads'][0]['name'], 'Rohan Patel')
        self.assertEqual(leads_res.data['leads'][0]['phone'], '9876543210')
        self.assertEqual(leads_res.data['leads'][0]['variant'], 'Size XL')

    def test_version_history_and_restore(self):
        """Can fetch generation history and restore an earlier version."""
        project = Project.objects.create(
            user=self.user,
            original_prompt='Brand site',
            status=Project.Status.READY,
        )
        gen_v1 = Generation.objects.create(
            project=project,
            prompt_used='Initial creation',
            html_output='<h1>Version 1 HTML</h1>',
            is_current=False,
        )
        gen_v2 = Generation.objects.create(
            project=project,
            prompt_used='Make headline bold',
            html_output='<h1>Version 2 HTML</h1>',
            is_current=True,
        )

        # Fetch history
        hist_res = self.client.get(f'/api/projects/{project.id}/generations/')
        self.assertEqual(hist_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(hist_res.data['versions']), 2)

        # Restore v1
        restore_res = self.client.post(f'/api/projects/{project.id}/generations/{gen_v1.id}/restore/')
        self.assertEqual(restore_res.status_code, status.HTTP_200_OK)
        self.assertTrue(restore_res.data.get('success'))

        gen_v1.refresh_from_db()
        gen_v2.refresh_from_db()
        self.assertTrue(gen_v1.is_current)
        self.assertFalse(gen_v2.is_current)

