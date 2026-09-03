"""
Root URL configuration for PromptLaunch.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
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
