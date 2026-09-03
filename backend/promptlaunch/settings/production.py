"""
Production settings for Blynkpages.

USAGE: Set DJANGO_SETTINGS_MODULE=promptlaunch.settings.production

Critical guards:
  - Raises ImproperlyConfigured if DATABASE_URL is not set (prevents silent SQLite fallback).
  - Raises ImproperlyConfigured if SECRET_KEY is insecure default.
  - CORS restricted to CORS_ALLOWED_ORIGINS from environment.
  - Sentry enabled if SENTRY_DSN is configured.
  - DEBUG is always False.
"""
import dj_database_url
from decouple import config, Csv
from django.core.exceptions import ImproperlyConfigured
from .base import *  # noqa: F401, F403

# ─── Safety Overrides ─────────────────────────────────────────────────────────

DEBUG = False  # Never True in production
IS_DEV_OR_TEST = False

# Enforce a real SECRET_KEY
_secret_key = config('SECRET_KEY', default='')
if not _secret_key or 'insecure' in _secret_key.lower() or len(_secret_key) < 32:
    raise ImproperlyConfigured(
        'SECRET_KEY is missing, too short, or contains "insecure". '
        'Set a cryptographically strong key (50+ chars) in your environment or secrets manager.'
    )
SECRET_KEY = _secret_key

# ─── Database: Enforce PostgreSQL only ────────────────────────────────────────

_database_url = config('DATABASE_URL', default=None)
if not _database_url:
    raise ImproperlyConfigured(
        'DATABASE_URL environment variable is required in production. '
        'Set it to a PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/dbname). '
        'SQLite is NOT supported in production — it will corrupt data under concurrent writes.'
    )

DATABASES = {
    'default': dj_database_url.config(
        default=_database_url,
        conn_max_age=600,  # Persistent connections
        ssl_require=True,  # Require SSL for database connections
    )
}

# ─── Allowed Hosts ────────────────────────────────────────────────────────────

ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=Csv(), default='')
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        'ALLOWED_HOSTS must be set in production. '
        'Set it to your domain(s) e.g. "blynkpages.com,www.blynkpages.com"'
    )

# ─── CORS: Restrict to specific origins ───────────────────────────────────────

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', cast=Csv(), default='')

# ─── Security Headers ─────────────────────────────────────────────────────────

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = 'Strict'
CSRF_COOKIE_SAMESITE = 'Strict'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# ─── Sentry Error Tracking (optional but strongly recommended) ────────────────

_sentry_dsn = config('SENTRY_DSN', default='')
if _sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration
        sentry_sdk.init(
            dsn=_sentry_dsn,
            integrations=[DjangoIntegration()],
            traces_sample_rate=0.1,
            profiles_sample_rate=0.05,
            send_default_pii=False,
        )
    except ImportError:
        pass  # sentry-sdk not installed; add it to requirements.txt
