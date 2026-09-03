import hashlib
import logging
from django.shortcuts import get_object_or_404
from django.db.models import Count
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import Project, PublishedPage, AnalyticsEvent
from .views import verify_project_ownership

logger = logging.getLogger(__name__)


class PublicTrackEventView(APIView):
    """
    POST: High-speed beacon endpoint to record page views and CTA clicks from live landing pages.
    """
    permission_classes = [AllowAny]

    def post(self, request, slug):
        published = get_object_or_404(PublishedPage, public_url_slug=slug)
        project = published.project

        event_type = request.data.get('event_type', 'view')
        if event_type not in ('view', 'click', 'lead'):
            event_type = 'view'

        utm_source = request.data.get('utm_source') or request.query_params.get('utm_source', '')
        utm_medium = request.data.get('utm_medium') or request.query_params.get('utm_medium', '')
        utm_campaign = request.data.get('utm_campaign') or request.query_params.get('utm_campaign', '')
        utm_content = request.data.get('utm_content') or request.query_params.get('utm_content', '')

        # Anonymized IP hash for unique visitor calculations
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')
        ip_hash = hashlib.sha256(ip.encode('utf-8')).hexdigest()[:16] if ip else ''

        AnalyticsEvent.objects.create(
            project=project,
            event_type=event_type,
            utm_source=utm_source[:100],
            utm_medium=utm_medium[:100],
            utm_campaign=utm_campaign[:100],
            utm_content=utm_content[:100],
            ip_hash=ip_hash,
        )

        return Response({'status': 'ok'}, status=status.HTTP_200_OK)


class ProjectAnalyticsView(APIView):
    """
    GET: Aggregate performance stats for a project (views, unique visitors, clicks, CTR%, top ad angles).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        events = project.analytics_events.all()
        total_views = events.filter(event_type=AnalyticsEvent.EventType.VIEW).count()
        unique_views = events.filter(event_type=AnalyticsEvent.EventType.VIEW).values('ip_hash').distinct().count()
        total_clicks = events.filter(event_type=AnalyticsEvent.EventType.CLICK).count()
        total_leads = project.leads.count()

        ctr = round((total_clicks / total_views * 100), 1) if total_views > 0 else 0.0

        # Breakdown by top ad campaigns / angles
        campaign_views = (
            events.filter(event_type=AnalyticsEvent.EventType.VIEW)
            .exclude(utm_campaign='')
            .values('utm_campaign')
            .annotate(views=Count('id'))
            .order_by('-views')[:5]
        )

        top_angles = []
        for cv in campaign_views:
            camp = cv['utm_campaign']
            v_count = cv['views']
            c_count = events.filter(event_type=AnalyticsEvent.EventType.CLICK, utm_campaign=camp).count()
            top_angles.append({
                'campaign': camp,
                'views': v_count,
                'clicks': c_count,
                'ctr': round((c_count / v_count * 100), 1) if v_count > 0 else 0.0,
            })

        return Response({
            'total_views': total_views,
            'unique_views': unique_views,
            'total_clicks': total_clicks,
            'total_leads': total_leads,
            'ctr': ctr,
            'top_angles': top_angles,
        }, status=status.HTTP_200_OK)
