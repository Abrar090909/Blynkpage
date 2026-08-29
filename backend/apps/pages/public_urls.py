"""
Public URL patterns — serve published landing pages at /p/<slug>/.
"""
from django.urls import path
from .public_views import PublishedPageView

urlpatterns = [
    path('<slug:slug>/', PublishedPageView.as_view(), name='published-page'),
]
