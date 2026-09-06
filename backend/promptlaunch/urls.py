"""
Root URL configuration for PromptLaunch.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    """Lightweight keep-alive endpoint. No auth, no DB. Used by Cloudflare Worker cron."""
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('admin/', admin.site.urls),
    # Keep-alive / health check (unauthenticated, no DB)
    path('health/', health_check, name='health-check'),
    # Core & Auth routes
    path('api/', include('apps.core.urls')),
    # API routes
    path('api/', include('apps.pages.urls')),
    path('api/billing/', include('apps.billing.urls')),
    # Public published pages
    path('p/', include('apps.pages.public_urls')),
    # Marketing site (catch-all — must be last)
    path('', include('apps.marketing.urls')),
]
