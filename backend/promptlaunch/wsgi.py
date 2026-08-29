"""WSGI config for promptlaunch project."""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'promptlaunch.settings.local')
application = get_wsgi_application()
