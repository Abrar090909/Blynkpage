"""
API URL patterns for the pages app.
Mounted at /api/ in the root urlconf.
"""
from django.urls import path
from .views import (
    ProjectListCreateView,
    ProjectDetailView,
    ProjectStreamView,
    ProjectChatView,
    ProjectPublishView,
)
from .pixel_views import PixelConfigView
from .lead_views import ProjectLeadsListView, ProjectLeadsExportView
from .version_views import ProjectGenerationsListView, ProjectGenerationRestoreView
from .analytics_views import ProjectAnalyticsView
from .domain_views import ProjectCustomDomainView, ProjectCustomDomainVerifyView

urlpatterns = [
    path('projects/', ProjectListCreateView.as_view(), name='project-list-create'),
    path('projects/<uuid:project_id>/', ProjectDetailView.as_view(), name='project-detail'),
    path('projects/<uuid:project_id>/stream/', ProjectStreamView.as_view(), name='project-stream'),
    path('projects/<uuid:project_id>/chat/', ProjectChatView.as_view(), name='project-chat'),
    path('projects/<uuid:project_id>/publish/', ProjectPublishView.as_view(), name='project-publish'),
    # Leads & Order capture
    path('projects/<uuid:project_id>/leads/', ProjectLeadsListView.as_view(), name='project-leads-list'),
    path('projects/<uuid:project_id>/leads/export/', ProjectLeadsExportView.as_view(), name='project-leads-export'),
    # Version history & rollback
    path('projects/<uuid:project_id>/generations/', ProjectGenerationsListView.as_view(), name='project-generations-list'),
    path('projects/<uuid:project_id>/generations/<uuid:generation_id>/restore/', ProjectGenerationRestoreView.as_view(), name='project-generation-restore'),
    # Live analytics
    path('projects/<uuid:project_id>/analytics/', ProjectAnalyticsView.as_view(), name='project-analytics'),
    # Custom domain & CNAME mapping
    path('projects/<uuid:project_id>/custom-domain/', ProjectCustomDomainView.as_view(), name='project-custom-domain'),
    path('projects/<uuid:project_id>/custom-domain/verify/', ProjectCustomDomainVerifyView.as_view(), name='project-custom-domain-verify'),
    # Meta Pixel configuration
    path('account/pixel/', PixelConfigView.as_view(), name='account-pixel'),
]
