"""
Custom Domain Middleware for Blynkpages.
Inspects incoming request Host headers. If a request arrives on a verified custom domain
(e.g., drop.funkwear.com), routes the request directly to the project's published page HTML.
"""
import logging
from django.http import HttpResponse, Http404
from apps.pages.models import CustomDomain

logger = logging.getLogger(__name__)

# Reserved platform hosts that should never be mapped to a custom domain
PLATFORM_HOSTS = {
    'localhost', '127.0.0.1', 'blynkpages.com', 'www.blynkpages.com',
    'api.blynkpages.com', 'blynkpage.link', 'cname.blynkpages.com',
}


class CustomDomainRoutingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host().split(':')[0].lower()

        # Only process if host is not one of our standard platform hosts and path is root
        if host not in PLATFORM_HOSTS and request.path in ('/', ''):
            try:
                custom_domain = CustomDomain.objects.select_related(
                    'project__published_page__generation'
                ).filter(domain=host, status=CustomDomain.Status.ACTIVE).first()

                if custom_domain and hasattr(custom_domain.project, 'published_page'):
                    pub_page = custom_domain.project.published_page
                    html = pub_page.generation.html_output
                    if html:
                        return HttpResponse(html, content_type='text/html; charset=utf-8')
            except Exception as e:
                logger.error("Error in CustomDomainRoutingMiddleware for %s: %s", host, e)

        return self.get_response(request)
