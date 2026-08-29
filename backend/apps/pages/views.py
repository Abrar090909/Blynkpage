"""
API views for PromptLaunch — Phase 1.

Endpoints:
  POST /api/projects/              — Create project + run enhancement
  GET  /api/projects/<id>/         — Get project state + chat history
  GET  /api/projects/<id>/stream/  — SSE: stream Gemini generation tokens
  POST /api/projects/<id>/chat/    — Append refinement message + re-stream
  POST /api/projects/<id>/publish/ — Publish to a public slug URL
"""
import json
import logging
import uuid

from django.http import StreamingHttpResponse, JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.shortcuts import get_object_or_404
from django.conf import settings

from .models import Project, Generation, ChatMessage, PublishedPage
from .gemini_service import enhance_prompt, stream_generation, strip_markdown_fences

logger = logging.getLogger(__name__)


def _json_body(request) -> dict:
    """Parse JSON request body, return empty dict on failure."""
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, AttributeError):
        return {}


def _project_to_dict(project: Project) -> dict:
    """Serialize a Project for API responses."""
    current_gen = project.generations.filter(is_current=True).first()
    messages = list(
        project.messages.values('id', 'role', 'content', 'created_at')
    )
    # Format datetimes as ISO strings
    for m in messages:
        m['id'] = str(m['id'])
        m['created_at'] = m['created_at'].isoformat()

    published_url = None
    try:
        published_url = f"/p/{project.published_page.public_url_slug}"
    except PublishedPage.DoesNotExist:
        pass

    return {
        'id': str(project.id),
        'name': project.name,
        'original_prompt': project.original_prompt,
        'enhanced_brief': project.enhanced_brief,
        'status': project.status,
        'current_html': current_gen.html_output if current_gen else '',
        'messages': messages,
        'published_url': published_url,
        'created_at': project.created_at.isoformat(),
        'updated_at': project.updated_at.isoformat(),
    }


# ─── POST /api/projects/ ──────────────────────────────────────────────────────

@method_decorator(csrf_exempt, name='dispatch')
class ProjectListCreateView(View):
    """
    POST: Create a new project from a raw prompt.
    Runs the enhancement step synchronously before returning,
    so the frontend immediately has the enhanced_brief available.
    """

    def post(self, request):
        data = _json_body(request)
        raw_prompt = (data.get('prompt') or '').strip()
        if not raw_prompt:
            return JsonResponse({'error': 'prompt is required'}, status=400)

        project = Project.objects.create(
            original_prompt=raw_prompt,
            name=raw_prompt[:80],
            slug=str(uuid.uuid4())[:8],
            status=Project.Status.ENHANCING,
        )

        # Record user's opening message in chat history
        ChatMessage.objects.create(
            project=project,
            role=ChatMessage.Role.USER,
            content=raw_prompt,
        )

        # Enhancement step — fast non-streamed call
        try:
            enhanced = enhance_prompt(raw_prompt)
            project.enhanced_brief = enhanced
            project.status = Project.Status.GENERATING
            project.save(update_fields=['enhanced_brief', 'status', 'updated_at'])
        except Exception as e:
            logger.exception("Enhancement failed: %s", e)
            project.enhanced_brief = raw_prompt  # Fall back to raw prompt
            project.status = Project.Status.GENERATING
            project.save(update_fields=['enhanced_brief', 'status', 'updated_at'])

        return JsonResponse(_project_to_dict(project), status=201)


# ─── GET /api/projects/<id>/ ──────────────────────────────────────────────────

@method_decorator(csrf_exempt, name='dispatch')
class ProjectDetailView(View):
    """GET: Retrieve full project state including current HTML and chat history."""

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        return JsonResponse(_project_to_dict(project))


# ─── GET /api/projects/<id>/stream/ ──────────────────────────────────────────

@method_decorator(csrf_exempt, name='dispatch')
class ProjectStreamView(View):
    """
    Server-Sent Events endpoint — synchronous, WSGI-compatible.
    Streams Gemini generation tokens to the frontend in real time.

    SSE message format:
      data: <token_chunk>\n\n
      data: [DONE]\n\n   (signals stream completion)
    """

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        # Mark any old generations as not current
        project.generations.update(is_current=False)

        # Create a new Generation record
        generation = Generation.objects.create(
            project=project,
            prompt_used=project.enhanced_brief,
            model_used=settings.GEMINI_MODEL,
            is_current=True,
        )

        def event_stream():
            html_chunks = []
            try:
                # Send immediate connection signal
                yield "data: [STATUS] Building your custom page with Gemini 3.6 Flash...\n\n"

                for chunk in stream_generation(project.enhanced_brief):
                    html_chunks.append(chunk)
                    # Escape newlines so each SSE message is a single line
                    safe_chunk = chunk.replace('\n', '\\n')
                    yield f"data: {safe_chunk}\n\n"

                # Save full HTML cleanly stripped of any markdown fences
                full_html = strip_markdown_fences(''.join(html_chunks))
                generation.html_output = full_html
                generation.save(update_fields=['html_output'])

                # Mark project ready
                project.status = Project.Status.READY
                project.save(update_fields=['status', 'updated_at'])

                # Add assistant message to chat
                ChatMessage.objects.create(
                    project=project,
                    role=ChatMessage.Role.ASSISTANT,
                    content='Your page has been generated! You can preview it, inspect the code, or ask me to refine any details.',
                )

                yield "data: [DONE]\n\n"

            except Exception as e:
                logger.exception("SSE stream error: %s", e)
                yield f"data: [ERROR] {e}\n\n"

        return StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
            },
        )


# ─── POST /api/projects/<id>/chat/ ───────────────────────────────────────────

@method_decorator(csrf_exempt, name='dispatch')
class ProjectChatView(View):
    """
    POST: Append a user refinement message, trigger a new generation stream.
    Synchronous WSGI implementation.
    """

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        data = _json_body(request)
        instruction = (data.get('message') or '').strip()
        if not instruction:
            return JsonResponse({'error': 'message is required'}, status=400)

        # Record user message
        ChatMessage.objects.create(
            project=project,
            role=ChatMessage.Role.USER,
            content=instruction,
        )

        # Get current HTML
        current_gen = project.generations.filter(is_current=True).first()
        current_html = current_gen.html_output if current_gen else ''

        # Update enhanced_brief to include the refinement context
        refinement_brief = (
            f"{project.enhanced_brief}\n\n"
            f"--- USER REFINEMENT REQUEST ---\n"
            f"{instruction}"
        )
        project.enhanced_brief = refinement_brief
        project.status = Project.Status.GENERATING
        project.save(update_fields=['enhanced_brief', 'status', 'updated_at'])

        return JsonResponse({
            'status': 'generating',
            'project_id': str(project.id),
            'stream_url': f'/api/projects/{project.id}/stream/',
        })


# ─── POST /api/projects/<id>/publish/ ────────────────────────────────────────

@method_decorator(csrf_exempt, name='dispatch')
class ProjectPublishView(View):
    """POST: Publish the current generation to a public slug URL."""

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        current_gen = project.generations.filter(is_current=True).first()

        if not current_gen or not current_gen.html_output:
            return JsonResponse({'error': 'No generated HTML to publish'}, status=400)

        # Create or update the PublishedPage
        try:
            published = project.published_page
            published.generation = current_gen
            published.save(update_fields=['generation'])
        except PublishedPage.DoesNotExist:
            slug = str(uuid.uuid4())[:10]
            published = PublishedPage.objects.create(
                project=project,
                public_url_slug=slug,
                generation=current_gen,
            )

        project.status = Project.Status.PUBLISHED
        project.save(update_fields=['status', 'updated_at'])

        return JsonResponse({
            'published_url': f'/p/{published.public_url_slug}',
            'public_url_slug': published.public_url_slug,
        })
