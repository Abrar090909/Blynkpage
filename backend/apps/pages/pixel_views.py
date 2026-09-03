"""
Pixel configuration API views for Blynkpages.

GET  /api/account/pixel/  — retrieve the user's current pixel config
PATCH /api/account/pixel/ — save/update pixel ID and access token
"""
import re
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from apps.pages.models import UserPixelConfig

logger = logging.getLogger(__name__)

_PIXEL_ID_RE = re.compile(r'^\d{10,20}$')


class PixelConfigView(APIView):
    """
    GET  /api/account/pixel/  — returns pixel config for the authenticated user.
    PATCH /api/account/pixel/ — updates pixel_id and/or access_token.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            config = request.user.pixel_config
            return Response({
                'meta_pixel_id': config.meta_pixel_id,
                # Mask all but last 4 chars of the access token for security
                'meta_access_token_masked': (
                    '••••' + config.meta_access_token[-4:]
                    if config.meta_access_token and len(config.meta_access_token) > 4
                    else ('set' if config.meta_access_token else '')
                ),
                'has_pixel': bool(config.meta_pixel_id),
                'has_capi_token': bool(config.meta_access_token),
                'updated_at': config.updated_at.isoformat(),
            }, status=status.HTTP_200_OK)
        except UserPixelConfig.DoesNotExist:
            return Response({
                'meta_pixel_id': '',
                'meta_access_token_masked': '',
                'has_pixel': False,
                'has_capi_token': False,
                'updated_at': None,
            }, status=status.HTTP_200_OK)

    def patch(self, request):
        pixel_id = (request.data.get('meta_pixel_id') or '').strip()
        access_token = (request.data.get('meta_access_token') or '').strip()

        # Validate pixel ID format (10–20 digits)
        if pixel_id and not _PIXEL_ID_RE.match(pixel_id):
            return Response(
                {'error': 'Invalid Pixel ID format. Must be a 10–20 digit number from Meta Events Manager.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        config, _ = UserPixelConfig.objects.get_or_create(user=request.user)

        if pixel_id is not None:
            config.meta_pixel_id = pixel_id
        if access_token:
            config.meta_access_token = access_token

        config.save()
        logger.info('User %s updated pixel config. Pixel set: %s', request.user.id, bool(pixel_id))

        return Response({
            'meta_pixel_id': config.meta_pixel_id,
            'has_pixel': bool(config.meta_pixel_id),
            'has_capi_token': bool(config.meta_access_token),
            'updated_at': config.updated_at.isoformat(),
        }, status=status.HTTP_200_OK)
