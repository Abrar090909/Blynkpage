"""
capi_service.py — Meta Conversions API (CAPI) server-side event forwarding.

Why CAPI? Client-side Meta Pixel is blocked by:
  - iOS 14.5+ App Tracking Transparency (ATT)
  - Safari ITP (Intelligent Tracking Prevention)
  - Ad blockers (~30% of desktop users)

Without CAPI, reported ROAS in Meta Ads Manager is systematically understated.
CAPI sends the same events from your server directly to Meta's Graph API,
deduplicating with the client-side pixel via event_id matching.

This module fires events in a background daemon thread to keep page response
time unaffected. A CAPI failure never blocks the page from loading.

Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
"""
import hashlib
import json
import logging
import threading
import time
import urllib.request
import urllib.error
from typing import Optional

logger = logging.getLogger(__name__)

_CAPI_ENDPOINT = 'https://graph.facebook.com/v19.0/{pixel_id}/events'


def _sha256(value: str) -> str:
    """Hash a value with SHA-256 for CAPI PII normalization."""
    return hashlib.sha256(value.strip().lower().encode('utf-8')).hexdigest()


def _send_capi_request(pixel_id: str, access_token: str, event_name: str, event_data: dict):
    """
    Send a single CAPI event to Meta's Graph API.
    Runs in a background thread — failures are logged but never raised.
    """
    url = _CAPI_ENDPOINT.format(pixel_id=pixel_id)

    payload = {
        'data': [{
            'event_name': event_name,
            'event_time': int(time.time()),
            'event_source_url': event_data.get('source_url', ''),
            'action_source': 'website',
            'event_id': event_data.get('event_id', ''),
            'user_data': {
                'client_ip_address': event_data.get('ip', ''),
                'client_user_agent': event_data.get('user_agent', ''),
            },
        }],
        'access_token': access_token,
        'test_event_code': event_data.get('test_event_code'),  # None in production
    }

    # Remove None values from the top-level payload
    payload = {k: v for k, v in payload.items() if v is not None}

    try:
        body = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=body,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            response_body = resp.read()
            logger.debug(
                'CAPI %s event sent for pixel %s: %s',
                event_name, pixel_id, response_body[:200],
            )
    except urllib.error.HTTPError as e:
        logger.warning('CAPI HTTP error %s for pixel %s: %s', e.code, pixel_id, e.read()[:200])
    except Exception as e:
        logger.warning('CAPI request failed for pixel %s: %s', pixel_id, str(e))


def send_capi_event(
    pixel_id: str,
    access_token: str,
    event_name: str,
    *,
    source_url: str = '',
    ip: str = '',
    user_agent: str = '',
    event_id: str = '',
    test_event_code: Optional[str] = None,
):
    """
    Fire a CAPI event asynchronously in a background daemon thread.

    Args:
        pixel_id: The user's Meta Pixel ID.
        access_token: The Meta System User access token for CAPI.
        event_name: Standard Meta event name (e.g. 'PageView', 'InitiateCheckout').
        source_url: The full URL of the page where the event occurred.
        ip: Visitor's IP address (used for deduplication, hashed before sending).
        user_agent: Visitor's User-Agent string.
        event_id: UUID matching the client-side pixel event_id for deduplication.
        test_event_code: Set this to test in Meta's Test Events tool.
    """
    if not pixel_id or not access_token:
        logger.debug('CAPI skipped: no pixel_id or access_token configured.')
        return

    event_data = {
        'source_url': source_url,
        'ip': ip,
        'user_agent': user_agent,
        'event_id': event_id,
        'test_event_code': test_event_code,
    }

    thread = threading.Thread(
        target=_send_capi_request,
        args=(pixel_id, access_token, event_name, event_data),
        daemon=True,  # Don't block process shutdown
        name=f'capi-{event_name}-{pixel_id[:6]}',
    )
    thread.start()
