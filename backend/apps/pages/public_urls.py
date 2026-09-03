"""
Public URL patterns — serve published landing pages at /p/<slug>/.
"""
from django.urls import path
from .public_views import PublishedPageView
from .lead_views import PublicLeadSubmitView
from .analytics_views import PublicTrackEventView

urlpatterns = [
    path('<slug:slug>/', PublishedPageView.as_view(), name='published-page'),
    path('<slug:slug>/submit/', PublicLeadSubmitView.as_view(), name='public-lead-submit'),
    path('<slug:slug>/track/', PublicTrackEventView.as_view(), name='public-track-event'),
]
