"""
embedding_service.py — Gemini text-embedding-004 wrapper.

Provides a single embed_text() function used by all three RAG use cases.

Design decisions:
- Uses text-embedding-004 (768 dimensions, available on all Gemini tiers including free).
- Silently returns None on failure rather than raising — callers must handle None,
  which lets the whole RAG layer degrade gracefully without breaking generation.
- Result is a plain Python list[float] to stay compatible with pgvector's VectorField.
"""
import logging
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)

# Embedding model — 768 dimensions, free tier accessible.
EMBEDDING_MODEL = 'models/text-embedding-004'
EMBEDDING_DIMENSIONS = 768


def embed_text(text: str, task_type: str = 'RETRIEVAL_DOCUMENT') -> Optional[list[float]]:
    """
    Embed text using Gemini text-embedding-004.

    Args:
        text: The text to embed. Truncated to 2048 chars if longer (model limit).
        task_type: One of RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY, SEMANTIC_SIMILARITY.
                   Use RETRIEVAL_QUERY when embedding a query, RETRIEVAL_DOCUMENT for corpus.

    Returns:
        list[float] of length 768, or None if embedding fails.
    """
    if not text or not text.strip():
        return None

    api_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not api_key:
        logger.warning('embed_text: GEMINI_API_KEY not set — skipping embedding.')
        return None

    # Truncate to avoid hitting model input limits
    text = text[:2048].strip()

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type=task_type),
        )
        return result.embeddings[0].values

    except Exception as exc:
        logger.warning('embed_text failed: %s — RAG will degrade gracefully.', exc)
        return None


def embed_query(text: str) -> Optional[list[float]]:
    """Convenience wrapper for embedding a retrieval query (not a document)."""
    return embed_text(text, task_type='RETRIEVAL_QUERY')
