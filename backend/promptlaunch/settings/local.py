"""Local development settings."""
from .base import *  # noqa: F401,F403

DEBUG = True

# Use SQLite for local dev if Postgres isn't configured
import os
if not os.environ.get('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',  # noqa: F405
        }
    }
