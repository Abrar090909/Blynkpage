"""
Public view — serves the raw generated HTML for published landing pages.
Route: GET /p/<slug>/
"""
from django.http import HttpResponse, Http404
from django.views import View
from .models import PublishedPage


class PublishedPageView(View):
    """Serve the raw generated HTML for a published page."""

    def get(self, request, slug):
        try:
            page = PublishedPage.objects.select_related('generation').get(
                public_url_slug=slug
            )
        except PublishedPage.DoesNotExist:
            raise Http404("Page not found")

        html = page.generation.html_output
        if not html:
            raise Http404("Page has no content")

        return HttpResponse(html, content_type='text/html; charset=utf-8')
