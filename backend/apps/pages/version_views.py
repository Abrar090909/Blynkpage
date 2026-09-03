import logging
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Project, Generation, ChatMessage
from .views import verify_project_ownership, _project_to_dict

logger = logging.getLogger(__name__)


class ProjectGenerationsListView(APIView):
    """
    GET: List all generation revisions (v1, v2, v3...) for a project.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        generations = project.generations.all().order_by('created_at')
        total_count = generations.count()

        data = []
        for idx, gen in enumerate(generations, start=1):
            data.append({
                'id': str(gen.id),
                'version_number': idx,
                'version_label': f"v{idx}",
                'is_current': gen.is_current,
                'prompt_preview': gen.prompt_used[:120] if gen.prompt_used else '',
                'created_at': gen.created_at,
                'model_used': gen.model_used,
            })

        # Return latest versions first for UI dropdown
        data.reverse()
        return Response({'versions': data, 'current_version': next((v['version_number'] for v in data if v['is_current']), total_count)}, status=status.HTTP_200_OK)


class ProjectGenerationRestoreView(APIView):
    """
    POST: Restore any prior generation as the active current version.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id, generation_id):
        project = get_object_or_404(Project, id=project_id)
        has_access, err_msg, err_code = verify_project_ownership(project, request.user)
        if not has_access:
            return Response({'error': err_msg}, status=err_code)

        target_gen = get_object_or_404(Generation, id=generation_id, project=project)

        # Mark all other generations as not current, and target as current
        project.generations.update(is_current=False)
        target_gen.is_current = True
        target_gen.save(update_fields=['is_current'])

        # Calculate version number
        all_gens = list(project.generations.order_by('created_at').values_list('id', flat=True))
        version_num = all_gens.index(target_gen.id) + 1 if target_gen.id in all_gens else 1

        # Record audit message in chat
        ChatMessage.objects.create(
            project=project,
            role=ChatMessage.Role.ASSISTANT,
            content=f"Restored page to Version {version_num} (from {target_gen.created_at.strftime('%b %d, %H:%M')}).",
        )

        project.status = Project.Status.READY
        project.save(update_fields=['status', 'updated_at'])

        return Response({
            'success': True,
            'message': f'Successfully restored version {version_num}',
            'restored_version': version_num,
            'project': _project_to_dict(project),
        }, status=status.HTTP_200_OK)
