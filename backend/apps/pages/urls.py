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

urlpatterns = [
    path('projects/', ProjectListCreateView.as_view(), name='project-list-create'),
    path('projects/<uuid:project_id>/', ProjectDetailView.as_view(), name='project-detail'),
    path('projects/<uuid:project_id>/stream/', ProjectStreamView.as_view(), name='project-stream'),
    path('projects/<uuid:project_id>/chat/', ProjectChatView.as_view(), name='project-chat'),
    path('projects/<uuid:project_id>/publish/', ProjectPublishView.as_view(), name='project-publish'),
]
