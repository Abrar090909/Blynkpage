"""
retrieval.py — Core retrieval functions for all three RAG use cases.

All functions degrade gracefully:
- If pgvector is unavailable → cosine similarity in Python (dev mode).
- If embeddings fail → return empty list (callers skip injection, generation continues).
- If DB has no corpus yet → return empty list (expected during onboarding).

This module is the only place that touches the vector DB; callers (compliance_service,
gemini_service) should not query RAG models directly.
"""
import logging
import math
import uuid
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)

# ─── pgvector availability ────────────────────────────────────────────────────

_PGVECTOR_ENABLED = getattr(settings, 'PGVECTOR_ENABLED', False)
try:
    from pgvector.django import CosineDistance  # type: ignore
    _HAS_PGVECTOR_LIB = True
except ImportError:
    _HAS_PGVECTOR_LIB = False

_USE_PGVECTOR = _PGVECTOR_ENABLED and _HAS_PGVECTOR_LIB


# ─── Python-level cosine similarity (SQLite fallback) ────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Pure Python cosine similarity for SQLite dev fallback."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _retrieve_python_fallback(queryset, query_vector: list[float], top_k: int) -> list:
    """
    Retrieve top-k items by cosine similarity using Python — used when pgvector
    is not available. Loads all embeddings into memory; fine for small corpora
    in local dev, not for production at scale.
    """
    candidates = []
    for obj in queryset:
        vec = obj.get_embedding_vector()
        if vec is None:
            continue
        sim = _cosine_similarity(query_vector, vec)
        candidates.append((sim, obj))
    candidates.sort(key=lambda x: x[0], reverse=True)
    return [obj for _, obj in candidates[:top_k]]


# ─── Use Case A — Policy chunk retrieval ──────────────────────────────────────

def retrieve_policy_chunks(claim_text: str, top_k: int = 3, platform: str | None = None) -> list[dict]:
    """
    Retrieve the most relevant policy chunks for a given ad copy claim.

    Args:
        claim_text: The specific claim to check (e.g. "4,200+ satisfied customers").
        top_k: Number of chunks to retrieve.
        platform: Optional platform filter ('meta', 'tiktok', 'google', 'internal').

    Returns:
        List of dicts: [{section_title, content, platform, chunk_index}].
        Empty list if corpus is empty or embedding fails.
    """
    from .embedding_service import embed_query
    from .models import PolicyChunk

    query_vector = embed_query(claim_text)
    if query_vector is None:
        return []

    qs = PolicyChunk.objects.all()
    if platform:
        qs = qs.filter(platform=platform)

    if not qs.exists():
        return []

    if _USE_PGVECTOR:
        try:
            results = (
                qs.annotate(distance=CosineDistance('embedding', query_vector))
                .order_by('distance')[:top_k]
            )
        except Exception as e:
            logger.warning('pgvector retrieval failed, falling back to Python: %s', e)
            results = _retrieve_python_fallback(qs, query_vector, top_k)
    else:
        results = _retrieve_python_fallback(qs, query_vector, top_k)

    return [
        {
            'section_title': chunk.section_title,
            'content': chunk.content,
            'platform': chunk.platform,
            'chunk_index': chunk.chunk_index,
        }
        for chunk in results
    ]


# ─── Use Case B — Brand memory retrieval ─────────────────────────────────────

def retrieve_brand_memory(project_id: str, query: str, top_k: int = 3) -> list[dict]:
    """
    Retrieve the most relevant past brand memory entries for a project.

    Called before generation to inject brand consistency context.

    Args:
        project_id: UUID string of the project.
        query: The new generation prompt/brief to match against past memories.
        top_k: Max memories to retrieve.

    Returns:
        List of dicts: [{brief_summary, headline, offer_text, created_at}].
        Empty list if no memories exist yet or embedding fails.
    """
    from .embedding_service import embed_query
    from .models import BrandMemoryEntry

    query_vector = embed_query(query)
    if query_vector is None:
        return []

    try:
        project_uuid = uuid.UUID(str(project_id))
    except (ValueError, AttributeError):
        return []

    qs = BrandMemoryEntry.objects.filter(project_id=project_uuid)
    if not qs.exists():
        return []

    if _USE_PGVECTOR:
        try:
            results = (
                qs.annotate(distance=CosineDistance('embedding', query_vector))
                .order_by('distance')[:top_k]
            )
        except Exception as e:
            logger.warning('pgvector brand retrieval failed, falling back to Python: %s', e)
            results = _retrieve_python_fallback(qs, query_vector, top_k)
    else:
        results = _retrieve_python_fallback(qs, query_vector, top_k)

    return [
        {
            'brief_summary': entry.brief_summary,
            'headline': entry.headline,
            'offer_text': entry.offer_text,
            'created_at': entry.created_at.isoformat(),
        }
        for entry in results
    ]


def store_brand_memory(
    project_id: str,
    enhanced_brief: str,
    headline: str = '',
    offer_text: str = '',
) -> None:
    """
    Store a brand memory entry after a successful generation.

    Called from the stream view after html is saved. Failures are logged and
    swallowed — never let memory storage break the generation response.
    """
    from .embedding_service import embed_text
    from .models import BrandMemoryEntry

    try:
        project_uuid = uuid.UUID(str(project_id))
    except (ValueError, AttributeError):
        logger.warning('store_brand_memory: invalid project_id %r', project_id)
        return

    summary = f'{enhanced_brief[:800]}\nHeadline: {headline}\nOffer: {offer_text}'.strip()

    vector = embed_text(summary, task_type='RETRIEVAL_DOCUMENT')

    try:
        entry = BrandMemoryEntry(
            project_id=project_uuid,
            brief_summary=enhanced_brief[:2000],
            headline=headline[:500],
            offer_text=offer_text[:500],
        )
        if vector:
            entry.set_embedding_vector(vector)
        entry.save()
        logger.debug('Stored brand memory for project %s', project_id)
    except Exception as e:
        logger.warning('store_brand_memory: DB write failed: %s', e)


def build_brand_context_block(memories: list[dict]) -> str:
    """
    Format retrieved brand memories into a concise prompt injection block.

    Returns an empty string if no memories — callers should check before injecting.
    """
    if not memories:
        return ''

    lines = ['Brand memory from your past pages (stay consistent with these):']
    for i, mem in enumerate(memories, 1):
        if mem.get('headline'):
            lines.append(f'  Past page {i} headline: {mem["headline"]}')
        if mem.get('offer_text'):
            lines.append(f'  Past page {i} offer: {mem["offer_text"]}')

    return '\n'.join(lines)


# ─── Use Case C — Winning angle retrieval (stub) ─────────────────────────────

def retrieve_winning_angles(vertical: str, mechanism: str, top_k: int = 2) -> list[dict]:
    """
    Retrieve winning angle frameworks by vertical and psychological mechanism.

    Use Case C — STUB. Returns empty list until corpus is built and this is
    fully implemented post-A and post-B stabilisation.
    """
    logger.debug('retrieve_winning_angles: Use Case C is a stub — returning empty.')
    return []
