"""
load_policy_docs — Django management command to chunk and embed policy documents.

Usage:
    python manage.py load_policy_docs --source backend/corpus/meta_ad_policy.txt --platform meta
    python manage.py load_policy_docs --source backend/corpus/rejected_copy.txt --platform internal
    python manage.py load_policy_docs --clear-platform meta   # Delete all Meta chunks and reload

Chunking strategy:
    Structure-aware — splits on natural section boundaries (heading lines like
    "## 4.3 Restricted Content") rather than fixed token windows, as recommended
    by the spec. Falls back to paragraph splitting (double newlines) if no
    headers are detected.

File format:
    Plain text (.txt) or markdown (.md). UTF-8 encoding.
    For Meta policy: paste the text from https://www.facebook.com/policies/ads/
    For TikTok policy: from https://ads.tiktok.com/help/article/advertising-policies-overview
"""
import re
import logging
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)


# ─── Chunking ─────────────────────────────────────────────────────────────────

_HEADING_RE = re.compile(r'^#{1,4}\s+.+|^\d+\.\s+[A-Z].+|^[A-Z][A-Z\s]{10,}$', re.MULTILINE)


def _chunk_document(text: str) -> list[tuple[str, str]]:
    """
    Split a policy document into (section_title, content) tuples.

    Uses heading markers as section boundaries. If no headings detected,
    falls back to paragraph splitting.

    Returns list of (section_title, content) tuples. content is stripped.
    """
    text = text.strip()
    heading_matches = list(_HEADING_RE.finditer(text))

    if len(heading_matches) >= 2:
        # Structure-aware split: each heading starts a new chunk
        chunks = []
        for i, match in enumerate(heading_matches):
            title = match.group(0).lstrip('#').strip()
            start = match.end()
            end = heading_matches[i + 1].start() if i + 1 < len(heading_matches) else len(text)
            content = text[start:end].strip()
            if content and len(content) >= 50:  # Skip trivially short sections
                chunks.append((title, content))
        if chunks:
            return chunks

    # Fallback: split on blank lines (paragraphs)
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if len(p.strip()) >= 50]
    return [('', para) for para in paragraphs]


# ─── Management command ───────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Chunk and embed a policy document into the RAG corpus.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--source',
            type=str,
            help='Path to the policy document file (txt or md).',
        )
        parser.add_argument(
            '--platform',
            type=str,
            choices=['meta', 'tiktok', 'google', 'internal'],
            default='meta',
            help='Platform this policy applies to (default: meta).',
        )
        parser.add_argument(
            '--clear-platform',
            type=str,
            choices=['meta', 'tiktok', 'google', 'internal'],
            help='Delete all chunks for a platform before loading (for full reload).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Parse and chunk the document but do not write to DB or call embeddings.',
        )

    def handle(self, *args, **options):
        from apps.rag.models import PolicyChunk
        from apps.rag.embedding_service import embed_text

        dry_run = options['dry_run']

        # Clear platform if requested
        clear_platform = options.get('clear_platform')
        if clear_platform:
            count, _ = PolicyChunk.objects.filter(platform=clear_platform).delete()
            self.stdout.write(self.style.WARNING(f'Deleted {count} existing chunks for platform={clear_platform}'))

        source_path = options.get('source')
        if not source_path:
            if clear_platform:
                return  # Clear-only run, done
            raise CommandError('--source is required unless using --clear-platform alone.')

        path = Path(source_path)
        if not path.exists():
            raise CommandError(f'File not found: {path}')

        try:
            text = path.read_text(encoding='utf-8')
        except Exception as e:
            raise CommandError(f'Failed to read {path}: {e}')

        platform = options['platform']
        chunks = _chunk_document(text)

        self.stdout.write(f'Parsed {len(chunks)} chunks from {path.name} [{platform}]')

        if dry_run:
            for i, (title, content) in enumerate(chunks):
                short_title = repr(title[:60])
                self.stdout.write(f'  [{i}] {short_title} — {len(content)} chars')
            self.stdout.write(self.style.SUCCESS('Dry run complete — no writes made.'))
            return

        created = 0
        skipped = 0
        for i, (title, content) in enumerate(chunks):
            # Skip if an identical chunk already exists (idempotent)
            if PolicyChunk.objects.filter(platform=platform, source_file=path.name, chunk_index=i).exists():
                skipped += 1
                continue

            vector = embed_text(content[:2048], task_type='RETRIEVAL_DOCUMENT')
            if vector is None:
                self.stdout.write(self.style.WARNING(f'  Embedding failed for chunk {i} — stored without embedding.'))

            chunk = PolicyChunk(
                platform=platform,
                section_title=title[:500],
                content=content,
                source_file=path.name,
                chunk_index=i,
            )
            if vector:
                chunk.set_embedding_vector(vector)
            chunk.save()
            created += 1

            if i % 10 == 0 and i > 0:
                self.stdout.write(f'  ...processed {i}/{len(chunks)} chunks')

        self.stdout.write(
            self.style.SUCCESS(
                f'Done: {created} chunks created, {skipped} skipped (already exist). '
                f'Platform: {platform}, source: {path.name}'
            )
        )
