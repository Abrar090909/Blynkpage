"""
RAG data models for Blynkpages.

Three model families:
  1. PolicyChunk       — chunked ad policy sections (Meta, TikTok) + embeddings.
  2. BrandMemoryEntry  — per-project generation summaries + embeddings.
  3. ComplianceCheckResult — cached RAG compliance results per generation.
  4. AngleFramework    — winning direct-response angle library (Use Case C, stub).

VectorField is only added when pgvector is available on Postgres.
When running on SQLite (local dev), embeddings are stored as JSON text and
cosine similarity is computed in Python (slow but functional for dev).

PGVECTOR_ENABLED=True in settings activates the full Postgres/pgvector path.
"""
import json
import logging
import uuid

from django.db import models
from django.conf import settings

logger = logging.getLogger(__name__)

# ─── pgvector availability check ─────────────────────────────────────────────

_PGVECTOR_AVAILABLE = False
try:
    from pgvector.django import VectorField, CosineDistance  # type: ignore
    _PGVECTOR_AVAILABLE = getattr(settings, 'PGVECTOR_ENABLED', False)
except ImportError:
    pass

if _PGVECTOR_AVAILABLE:
    _EmbeddingField = lambda: VectorField(dimensions=768, null=True, blank=True)  # noqa: E731
else:
    # Fallback: store as JSON text; cosine retrieval done in Python
    _EmbeddingField = lambda: models.TextField(null=True, blank=True, help_text='JSON-encoded embedding vector (fallback when pgvector unavailable)')  # noqa: E731


# ─── PolicyChunk ─────────────────────────────────────────────────────────────

class PolicyChunk(models.Model):
    """
    One section of an ad platform policy document.

    Chunked by natural section boundary (not fixed token windows) as the spec
    recommends. Loaded via `python manage.py load_policy_docs`.
    """
    class Platform(models.TextChoices):
        META = 'meta', 'Meta (Facebook/Instagram)'
        TIKTOK = 'tiktok', 'TikTok'
        GOOGLE = 'google', 'Google Ads'
        INTERNAL = 'internal', 'Internal Rejected Copy'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    platform = models.CharField(max_length=20, choices=Platform.choices, db_index=True)
    section_title = models.CharField(max_length=500, blank=True)
    content = models.TextField()
    source_file = models.CharField(max_length=255, blank=True, help_text='Original filename this chunk was extracted from')
    chunk_index = models.PositiveIntegerField(default=0, help_text='Chunk position within source document')
    embedding = _EmbeddingField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['platform', 'chunk_index']
        indexes = [
            models.Index(fields=['platform']),
        ]
        verbose_name = 'Policy Chunk'
        verbose_name_plural = 'Policy Chunks'

    def __str__(self):
        return f'[{self.platform}] {self.section_title or "chunk"} #{self.chunk_index}'

    def get_embedding_vector(self) -> list[float] | None:
        """Return embedding as list[float], handling both pgvector and JSON fallback."""
        if _PGVECTOR_AVAILABLE:
            return self.embedding
        if self.embedding:
            try:
                return json.loads(self.embedding)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    def set_embedding_vector(self, vector: list[float]) -> None:
        """Store embedding, handling both pgvector and JSON fallback."""
        if _PGVECTOR_AVAILABLE:
            self.embedding = vector
        else:
            self.embedding = json.dumps(vector)


# ─── BrandMemoryEntry ─────────────────────────────────────────────────────────

class BrandMemoryEntry(models.Model):
    """
    One memory snapshot from a successful generation for a project.

    Stored after every successful generation. Retrieved at enhance_prompt time
    to inject brand consistency context into new generations for the same project.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # FK to Project by UUID string (avoids a cross-app model import)
    project_id = models.UUIDField(db_index=True)
    # Extracted summary: tone descriptors, headline, offer, key brand identifiers
    brief_summary = models.TextField(help_text='Enhanced brief text used for this generation')
    headline = models.CharField(max_length=500, blank=True, help_text='Extracted H1/hero headline from generated HTML')
    offer_text = models.CharField(max_length=500, blank=True, help_text='Extracted pricing/offer line')
    embedding = _EmbeddingField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project_id', '-created_at']),
        ]
        verbose_name = 'Brand Memory Entry'
        verbose_name_plural = 'Brand Memory Entries'

    def __str__(self):
        return f'BrandMemory[{self.project_id}] — {self.headline[:60]}'

    def get_embedding_vector(self) -> list[float] | None:
        if _PGVECTOR_AVAILABLE:
            return self.embedding
        if self.embedding:
            try:
                return json.loads(self.embedding)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    def set_embedding_vector(self, vector: list[float]) -> None:
        if _PGVECTOR_AVAILABLE:
            self.embedding = vector
        else:
            self.embedding = json.dumps(vector)


# ─── ComplianceCheckResult ────────────────────────────────────────────────────

class ComplianceCheckResult(models.Model):
    """
    Cached result of a RAG compliance check for one generation.

    Keyed by generation_id so re-opening the same project doesn't re-run
    the Gemini compliance calls unnecessarily.
    """
    class Severity(models.TextChoices):
        RED = 'red', 'Red — Blocks Publish'
        YELLOW = 'yellow', 'Yellow — Requires Acknowledgment'
        GREEN = 'green', 'Green — Cleared'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Stored as UUID string to avoid cross-app FK
    generation_id = models.UUIDField(unique=True, db_index=True)
    project_id = models.UUIDField(db_index=True)
    # JSON-encoded list of {claim, severity, policy_section, explanation}
    results_json = models.TextField(default='[]')
    has_red_flags = models.BooleanField(default=False, db_index=True)
    has_yellow_flags = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Compliance Check Result'

    def __str__(self):
        return f'Compliance[gen={self.generation_id}] red={self.has_red_flags}'

    def get_results(self) -> list[dict]:
        try:
            return json.loads(self.results_json)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_results(self, results: list[dict]) -> None:
        self.results_json = json.dumps(results)
        self.has_red_flags = any(r.get('severity') == 'red' for r in results)
        self.has_yellow_flags = any(r.get('severity') == 'yellow' for r in results)


# ─── AngleFramework — Use Case C stub ────────────────────────────────────────

class AngleFramework(models.Model):
    """
    A curated direct-response angle/structure tagged by vertical and mechanism.

    Use Case C (Winning Angle Retrieval) — stub model, full implementation
    deferred until Use Cases A and B are stable. Corpus needs to be built by
    hand (10-15 frameworks per major vertical) before this is useful.
    """
    class Vertical(models.TextChoices):
        ECOMMERCE = 'ecommerce', 'E-Commerce / DTC'
        SAAS = 'saas', 'SaaS / Digital'
        HEALTH = 'health', 'Health & Wellness'
        COACHING = 'coaching', 'Coaching / Info Products'
        FASHION = 'fashion', 'Fashion / Streetwear'
        FINANCE = 'finance', 'Financial Services'
        OTHER = 'other', 'Other'

    class Mechanism(models.TextChoices):
        SCARCITY = 'scarcity', 'Scarcity / Urgency'
        SOCIAL_PROOF = 'social_proof', 'Social Proof'
        PAS = 'pas', 'Problem-Agitate-Solve'
        BEFORE_AFTER = 'before_after', 'Before / After'
        COMPARISON = 'comparison', 'Comparison / Versus'
        AUTHORITY = 'authority', 'Authority / Expert'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vertical = models.CharField(max_length=30, choices=Vertical.choices, db_index=True)
    mechanism = models.CharField(max_length=30, choices=Mechanism.choices, db_index=True)
    title = models.CharField(max_length=255)
    structure_text = models.TextField(help_text='Structural guidance for the angle — NOT verbatim copy.')
    embedding = _EmbeddingField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['vertical', 'mechanism']
        verbose_name = 'Angle Framework'
        verbose_name_plural = 'Angle Frameworks'

    def __str__(self):
        return f'[{self.vertical}/{self.mechanism}] {self.title}'

    def get_embedding_vector(self) -> list[float] | None:
        if _PGVECTOR_AVAILABLE:
            return self.embedding
        if self.embedding:
            try:
                return json.loads(self.embedding)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    def set_embedding_vector(self, vector: list[float]) -> None:
        if _PGVECTOR_AVAILABLE:
            self.embedding = vector
        else:
            self.embedding = json.dumps(vector)
