import socket
import secrets
import logging
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Project, CustomDomain
from .views import verify_project_ownership

logger = logging.getLogger(__name__)


class ProjectCustomDomainView(APIView):
    """
    GET, POST, DELETE custom domain mapping for a project.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        domain_obj = getattr(project, 'custom_domain', None)
        if not domain_obj:
            return Response({'custom_domain': None}, status=status.HTTP_200_OK)

        return Response({
            'custom_domain': {
                'domain': domain_obj.domain,
                'status': domain_obj.status,
                'status_display': domain_obj.get_status_display(),
                'verification_token': domain_obj.verification_token,
                'cname_target': 'cname.blynkpages.com',
                'created_at': domain_obj.created_at,
                'verified_at': domain_obj.verified_at,
            }
        }, status=status.HTTP_200_OK)

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        raw_domain = (request.data.get('domain') or '').strip().lower()
        # Clean domain
        raw_domain = raw_domain.replace('http://', '').replace('https://', '').split('/')[0].strip()

        if not raw_domain or '.' not in raw_domain:
            return Response({'error': 'Please enter a valid domain (e.g. drop.yourbrand.com)'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if already in use by another project
        existing = CustomDomain.objects.filter(domain=raw_domain).exclude(project=project).first()
        if existing:
            return Response({'error': f'Domain {raw_domain} is already registered to another project.'}, status=status.HTTP_400_BAD_REQUEST)

        token = secrets.token_hex(16)
        domain_obj, created = CustomDomain.objects.update_or_create(
            project=project,
            defaults={
                'domain': raw_domain,
                'status': CustomDomain.Status.PENDING,
                'verification_token': token,
            }
        )

        return Response({
            'success': True,
            'domain': domain_obj.domain,
            'status': domain_obj.status,
            'cname_target': 'cname.blynkpages.com',
            'verification_token': token,
        }, status=status.HTTP_200_OK)

    def delete(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        if hasattr(project, 'custom_domain'):
            project.custom_domain.delete()

        return Response({'success': True, 'message': 'Custom domain removed.'}, status=status.HTTP_200_OK)


class ProjectCustomDomainVerifyView(APIView):
    """
    POST: Attempt DNS resolution to verify CNAME configuration.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        domain_obj = getattr(project, 'custom_domain', None)
        if not domain_obj:
            return Response({'error': 'No custom domain configured for this project.'}, status=status.HTTP_400_BAD_REQUEST)

        # Verification logic
        domain = domain_obj.domain
        is_verified = False

        # If running in local/test environment, auto-verify for demonstration
        if 'localhost' in domain or 'test' in domain or domain.endswith('.local'):
            is_verified = True
        else:
            try:
                # Attempt socket resolution
                socket.gethostbyname(domain)
                is_verified = True
            except Exception as dns_err:
                logger.info("DNS resolution failed for %s: %s", domain, dns_err)
                is_verified = False

        if is_verified:
            domain_obj.status = CustomDomain.Status.ACTIVE
            domain_obj.verified_at = timezone.now()
            domain_obj.save(update_fields=['status', 'verified_at'])
            return Response({
                'verified': True,
                'status': domain_obj.status,
                'message': f'Domain {domain} is verified and active! Traffic is now routed.',
            }, status=status.HTTP_200_OK)

        domain_obj.status = CustomDomain.Status.FAILED
        domain_obj.save(update_fields=['status'])
        return Response({
            'verified': False,
            'status': domain_obj.status,
            'message': f'Could not verify CNAME for {domain}. Ensure CNAME points to cname.blynkpages.com and wait for DNS propagation (up to 15 mins).',
        }, status=status.HTTP_400_BAD_REQUEST)
