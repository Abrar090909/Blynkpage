import csv
import logging
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import Project, PublishedPage, LeadOrder, AnalyticsEvent
from .views import verify_project_ownership

logger = logging.getLogger(__name__)


class PublicLeadSubmitView(APIView):
    """
    POST: Public endpoint to capture a customer lead or Cash-on-Delivery (COD) order
    submitted directly from the published landing page.
    """
    permission_classes = [AllowAny]

    def post(self, request, slug):
        published = get_object_or_404(PublishedPage, public_url_slug=slug)
        project = published.project

        name = (request.data.get('name') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        email = (request.data.get('email') or '').strip()
        address = (request.data.get('address') or '').strip()
        variant = (request.data.get('variant') or '').strip()
        quantity = request.data.get('quantity', 1)

        if not name or not phone:
            return Response({'error': 'Name and phone number are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Extract UTM params
        utm_source = request.data.get('utm_source') or request.query_params.get('utm_source', '')
        utm_medium = request.data.get('utm_medium') or request.query_params.get('utm_medium', '')
        utm_campaign = request.data.get('utm_campaign') or request.query_params.get('utm_campaign', '')
        utm_content = request.data.get('utm_content') or request.query_params.get('utm_content', '')

        try:
            qty = max(1, int(quantity))
        except (ValueError, TypeError):
            qty = 1

        lead = LeadOrder.objects.create(
            project=project,
            name=name[:150],
            phone=phone[:50],
            email=email[:254],
            address=address,
            variant=variant[:150],
            quantity=qty,
            utm_source=utm_source[:100],
            utm_medium=utm_medium[:100],
            utm_campaign=utm_campaign[:100],
            utm_content=utm_content[:100],
            status=LeadOrder.Status.NEW,
        )

        # Log lead analytics event
        try:
            AnalyticsEvent.objects.create(
                project=project,
                event_type=AnalyticsEvent.EventType.LEAD,
                utm_source=utm_source[:100],
                utm_campaign=utm_campaign[:100],
                utm_content=utm_content[:100],
            )
        except Exception as e:
            logger.warning("Failed to record lead analytics event: %s", e)

        return Response({
            'success': True,
            'message': 'Order / inquiry received successfully!',
            'order_id': str(lead.id),
        }, status=status.HTTP_201_CREATED)


class ProjectLeadsListView(APIView):
    """
    GET: List all captured leads/orders for a project (authenticated project owner).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        leads = project.leads.all()
        data = [
            {
                'id': str(l.id),
                'name': l.name,
                'phone': l.phone,
                'email': l.email,
                'address': l.address,
                'variant': l.variant,
                'quantity': l.quantity,
                'utm_source': l.utm_source,
                'utm_campaign': l.utm_campaign,
                'utm_content': l.utm_content,
                'status': l.status,
                'status_display': l.get_status_display(),
                'created_at': l.created_at,
            }
            for l in leads
        ]
        return Response({'leads': data, 'count': len(data)}, status=status.HTTP_200_OK)


class ProjectLeadsExportView(APIView):
    """
    GET: Download CSV export of all leads/orders for this project.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="leads-{project.slug or project.id}.csv"'

        writer = csv.writer(response)
        writer.writerow(['Order ID', 'Date', 'Name', 'Phone', 'Email', 'Address', 'Variant', 'Qty', 'UTM Source', 'UTM Campaign', 'Status'])

        for l in project.leads.all():
            writer.writerow([
                str(l.id),
                l.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                l.name,
                l.phone,
                l.email,
                l.address,
                l.variant,
                l.quantity,
                l.utm_source,
                l.utm_campaign,
                l.status,
            ])

        return response
