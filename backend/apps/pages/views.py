"""
API views for PromptLaunch / Blynkpages.
Hardened with JWT authentication, multi-tenant isolation (anti-IDOR),
input sanitization (anti-injection), and protection against DevTools bypass.
"""
import json
import logging
import uuid

from django.http import StreamingHttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle, AnonRateThrottle
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from .models import Project, Generation, ChatMessage, PublishedPage
from .gemini_service import enhance_prompt, stream_generation, strip_markdown_fences
from .html_sanitizer import sanitize_for_publish, flag_compliance_issues

logger = logging.getLogger(__name__)


def _project_to_dict(project: Project) -> dict:
    """Serialize a Project for API responses."""
    current_gen = project.generations.filter(is_current=True).first()
    messages = list(
        project.messages.values('id', 'role', 'content', 'created_at')
    )
    for m in messages:
        m['id'] = str(m['id'])
        m['created_at'] = m['created_at'].isoformat()

    published_url = None
    try:
        published_url = f"/p/{project.published_page.public_url_slug}"
    except (PublishedPage.DoesNotExist, AttributeError):
        pass

    # Compute compliance flags on the current HTML so the frontend can show review prompt
    current_html = current_gen.html_output if current_gen else ''
    compliance_flags = flag_compliance_issues(current_html) if current_html else []

    return {
        'id': str(project.id),
        'name': project.name,
        'original_prompt': project.original_prompt,
        'enhanced_brief': project.enhanced_brief,
        'status': project.status,
        'current_html': current_html,
        'messages': messages,
        'published_url': published_url,
        'compliance_flags': compliance_flags,
        'checkout_url': project.checkout_url,
        'enable_lead_capture': project.enable_lead_capture,
        'user_id': project.user_id,
        'created_at': project.created_at.isoformat(),
        'updated_at': project.updated_at.isoformat(),
    }


def get_authenticated_user_from_request(request):
    """
    Authenticate user via DRF request or JWT token from header / query param.
    Essential for SSE streaming where browsers cannot send Authorization headers natively.
    """
    if hasattr(request, 'user') and request.user and request.user.is_authenticated:
        return request.user

    token = None
    auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1].strip()
    elif 'token' in request.GET:
        token = request.GET.get('token')

    if token:
        try:
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(token)
            return jwt_auth.get_user(validated_token)
        except (InvalidToken, TokenError, Exception):
            return None

    return None


def verify_project_ownership(project: Project, user):
    """
    Strict ownership verification to prevent IDOR and DevTools bypass.
    If the project has an assigned user, the requesting user MUST be that exact user.
    """
    if project.user is not None:
        if not user or not user.is_authenticated:
            return False, 'Authentication required to access this project.', 401
        if project.user_id != user.id:
            return False, 'Forbidden: You do not have permission to access this project.', 403
    return True, None, 200


# ─── /api/projects/ ───────────────────────────────────────────────────────────

class ProjectListCreateView(APIView):
    """
    GET: List all projects owned by the authenticated user.
    POST: Create a new project attached to the authenticated user.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'generation'  # 10/hour per user — this is the Gemini cost driver

    def get(self, request):
        projects = Project.objects.filter(user=request.user).order_by('-created_at')
        data = [
            {
                'id': str(p.id),
                'name': p.name,
                'status': p.status,
                'created_at': p.created_at.isoformat(),
                'updated_at': p.updated_at.isoformat(),
                'published_url': f"/p/{p.published_page.public_url_slug}" if hasattr(p, 'published_page') else None,
            }
            for p in projects
        ]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        raw_prompt = (request.data.get('prompt') or '').strip()

        # Anti-injection: length checks and character sanitation
        if not raw_prompt:
            return Response({'error': 'prompt is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(raw_prompt) > 10000:
            return Response({'error': 'prompt exceeds maximum length of 10,000 characters'}, status=status.HTTP_400_BAD_REQUEST)

        # Sanitize null bytes
        raw_prompt = raw_prompt.replace('\x00', '')

        # Subscription Monthly Quota Check (Enforces 3 free generations/month on Free tier)
        if request.user.is_authenticated:
            from apps.billing.models import get_or_create_subscription
            sub = get_or_create_subscription(request.user)
            allowed, used, limit, msg = sub.can_generate()
            if not allowed:
                return Response({
                    'error': msg,
                    'upgrade_required': True,
                    'plan': sub.plan,
                    'used': used,
                    'limit': limit,
                }, status=status.HTTP_402_PAYMENT_REQUIRED)

        # Daily generation quota enforcement
        from django.utils import timezone
        from datetime import timedelta
        daily_quota = getattr(settings, 'DAILY_GENERATION_QUOTA', 20)
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = Project.objects.filter(
            user=request.user,
            created_at__gte=today_start,
        ).count()
        if today_count >= daily_quota:
            return Response({
                'error': f'Daily generation quota of {daily_quota} pages reached. '
                         'Upgrade your plan for more generations.',
                'quota_exceeded': True,
                'daily_quota': daily_quota,
                'used_today': today_count,
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        project = Project.objects.create(
            user=request.user,
            original_prompt=raw_prompt,
            enhanced_brief=raw_prompt,
            name=raw_prompt[:80],
            slug=str(uuid.uuid4())[:8],
            status=Project.Status.GENERATING,
        )

        ChatMessage.objects.create(
            project=project,
            role=ChatMessage.Role.USER,
            content=raw_prompt,
        )

        return Response(_project_to_dict(project), status=status.HTTP_201_CREATED)


# ─── GET /api/projects/<id>/ ──────────────────────────────────────────────────

class ProjectDetailView(APIView):
    """
    GET: Retrieve full project state including current HTML and chat history.
    Strictly verifies ownership to prevent IDOR / DevTools hijacking.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        # If project has no user assigned yet, claim it for this user
        if project.user is None and request.user.is_authenticated:
            project.user = request.user
        return Response(_project_to_dict(project), status=status.HTTP_200_OK)

    def patch(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        fields_to_update = []
        if 'name' in request.data:
            project.name = (request.data['name'] or '').strip()[:255]
            fields_to_update.append('name')
        if 'checkout_url' in request.data:
            project.checkout_url = (request.data['checkout_url'] or '').strip()[:500]
            fields_to_update.append('checkout_url')
        if 'enable_lead_capture' in request.data:
            project.enable_lead_capture = bool(request.data['enable_lead_capture'])
            fields_to_update.append('enable_lead_capture')

        if fields_to_update:
            fields_to_update.append('updated_at')
            project.save(update_fields=fields_to_update)

        return Response(_project_to_dict(project), status=status.HTTP_200_OK)


# ─── GET /api/projects/<id>/stream/ ──────────────────────────────────────────

from rest_framework.renderers import BaseRenderer, JSONRenderer

class ServerSentEventRenderer(BaseRenderer):
    media_type = 'text/event-stream'
    format = 'event-stream'
    charset = 'utf-8'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class ProjectStreamView(APIView):
    """
    Server-Sent Events endpoint — synchronous, WSGI-compatible.
    Streams Gemini generation tokens to the frontend in real time.
    Secured with JWT verification via Bearer header or query token.
    """
    permission_classes = [AllowAny]  # Handled inside view to accommodate EventSource tokens
    renderer_classes = [ServerSentEventRenderer, JSONRenderer]

    def perform_content_negotiation(self, request, force=False):
        for r in self.get_renderers():
            if r.media_type == 'text/event-stream':
                return (r, 'text/event-stream')
        return super().perform_content_negotiation(request, force=force)

    def get(self, request, project_id):
        user = get_authenticated_user_from_request(request)
        project = get_object_or_404(Project, id=project_id)

        has_access, err_msg, err_code = verify_project_ownership(project, user)
        if not has_access:
            return JsonResponse({'error': err_msg}, status=err_code)

        # Check if there is an existing generation to refine from
        previous_gen = project.generations.filter(is_current=True).first()
        if not previous_gen:
            previous_gen = project.generations.order_by('-created_at').first()
        previous_html = previous_gen.html_output if previous_gen else None

        # Check if this is a chat refinement (more than 1 user message and prior HTML exists)
        user_messages = list(project.messages.filter(role=ChatMessage.Role.USER).order_by('created_at'))
        is_refinement = len(user_messages) > 1 and bool(previous_html)
        refinement_instruction = user_messages[-1].content if is_refinement else None

        # Mark any old generations as not current
        project.generations.update(is_current=False)

        # Enhance brief on initial generation if needed
        if not is_refinement and project.enhanced_brief == project.original_prompt:
            try:
                project.enhanced_brief = enhance_prompt(project.original_prompt)
                project.save(update_fields=['enhanced_brief'])
            except Exception as e:
                logger.warning("Prompt enhancement skipped or failed: %s", e)

        # Create a new Generation record
        generation = Generation.objects.create(
            project=project,
            prompt_used=refinement_instruction if is_refinement else project.enhanced_brief,
            model_used=getattr(settings, 'GEMINI_MODEL', 'gemini-2.0-flash'),
            is_current=True,
        )

        def event_stream():
            html_chunks = []
            try:
                status_label = "Refining your page with Gemini Flash…" if is_refinement else "Building your custom page with Gemini Flash…"
                yield f"data: [STATUS] {status_label}\n\n"

                is_first_chunk = True
                for chunk in stream_generation(
                    raw_prompt=project.original_prompt,
                    enhanced_brief=project.enhanced_brief,
                    refinement_instruction=refinement_instruction,
                    current_html=previous_html if is_refinement else None,
                ):
                    if not chunk:
                        continue
                    if is_first_chunk:
                        chunk = chunk.replace('```html', '').replace('```', '').lstrip()
                        is_first_chunk = False
                    elif '```' in chunk:
                        chunk = chunk.replace('```', '')

                    if chunk:
                        html_chunks.append(chunk)
                        safe_chunk = chunk.replace('\n', '\\n')
                        yield f"data: {safe_chunk}\n\n"

                full_html = strip_markdown_fences(''.join(html_chunks))
                generation.html_output = full_html
                generation.save(update_fields=['html_output'])

                # Increment user's monthly generation count
                if user and user.is_authenticated:
                    try:
                        from apps.billing.models import get_or_create_subscription
                        sub = get_or_create_subscription(user)
                        sub.increment_generation()
                    except Exception as sub_err:
                        logger.warning("Failed to increment subscription count: %s", sub_err)

                project.status = Project.Status.READY
                project.save(update_fields=['status', 'updated_at'])

                assistant_reply = (
                    "Your page has been updated with the requested changes! You can preview the result or ask for further refinements."
                    if is_refinement
                    else "Your page has been generated! You can preview it, inspect the code, or ask me to refine any details."
                )
                ChatMessage.objects.create(
                    project=project,
                    role=ChatMessage.Role.ASSISTANT,
                    content=assistant_reply,
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

class ProjectChatView(APIView):
    """
    POST: Append a user refinement message, trigger a new generation stream.
    Strictly protected with user ownership verification and message sanitization.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        # Enforce monthly generation limit (3/month on Free tier)
        from apps.billing.models import get_or_create_subscription
        sub = get_or_create_subscription(request.user)
        allowed, used, limit, msg = sub.can_generate()
        if not allowed:
            return Response({
                'error': msg,
                'upgrade_required': True,
                'plan': sub.plan,
                'used': used,
                'limit': limit,
            }, status=status.HTTP_402_PAYMENT_REQUIRED)

        instruction = (request.data.get('message') or '').strip()
        if not instruction:
            return Response({'error': 'message is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(instruction) > 5000:
            return Response({'error': 'message exceeds maximum limit of 5,000 characters'}, status=status.HTTP_400_BAD_REQUEST)

        # Anti-injection: sanitize null bytes
        instruction = instruction.replace('\x00', '')

        ChatMessage.objects.create(
            project=project,
            role=ChatMessage.Role.USER,
            content=instruction,
        )

        refinement_brief = (
            f"{project.enhanced_brief}\n\n"
            f"--- USER REFINEMENT REQUEST ---\n"
            f"{instruction}"
        )
        project.enhanced_brief = refinement_brief
        project.status = Project.Status.GENERATING
        project.save(update_fields=['enhanced_brief', 'status', 'updated_at'])

        return Response({
            'status': 'generating',
            'project_id': str(project.id),
            'stream_url': f'/api/projects/{project.id}/stream/',
        }, status=status.HTTP_200_OK)


# ─── POST /api/projects/<id>/publish/ ────────────────────────────────────────

class ProjectPublishView(APIView):
    """
    POST: Publish the current generation to a public slug URL.
    Only the verified project owner can publish.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        current_gen = project.generations.filter(is_current=True).first()
        if not current_gen or not current_gen.html_output:
            return Response({'error': 'No generated HTML to publish'}, status=status.HTTP_400_BAD_REQUEST)

        # Security: sanitize AI output and get any compliance flags.
        # Retrieve the user's pixel config if available.
        pixel_id = None
        try:
            pixel_id = request.user.pixel_config.meta_pixel_id or None
        except Exception:
            pass

        # Determine public slug
        try:
            slug = project.published_page.public_url_slug
        except (PublishedPage.DoesNotExist, AttributeError):
            slug = str(uuid.uuid4())[:10]

        sanitized_html, compliance_flags = sanitize_for_publish(
            current_gen.html_output,
            pixel_id=pixel_id,
            slug=slug,
            checkout_url=project.checkout_url,
            enable_lead_capture=project.enable_lead_capture,
        )

        # Save the sanitized HTML back to the generation record
        current_gen.html_output = sanitized_html
        current_gen.save(update_fields=['html_output'])

        try:
            published = project.published_page
            published.generation = current_gen
            published.save(update_fields=['generation'])
        except (PublishedPage.DoesNotExist, AttributeError):
            published = PublishedPage.objects.create(
                project=project,
                public_url_slug=slug,
                generation=current_gen,
            )

        project.status = Project.Status.PUBLISHED
        project.save(update_fields=['status', 'updated_at'])

        return Response({
            'published_url': f'/p/{published.public_url_slug}',
            'public_url_slug': published.public_url_slug,
            'compliance_flags': compliance_flags,
        }, status=status.HTTP_200_OK)
