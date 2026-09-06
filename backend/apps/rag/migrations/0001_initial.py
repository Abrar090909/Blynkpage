"""
Initial migration for the RAG app.

Creates tables for: PolicyChunk, BrandMemoryEntry, ComplianceCheckResult, AngleFramework.

The embedding column is:
  - VectorField(768) when PGVECTOR_ENABLED=True and psql has pgvector extension.
  - TextField (JSON fallback) otherwise.

The migration itself always creates a TextField for the embedding column.
When deploying to Postgres with pgvector, run:
    python manage.py migrate_pgvector   (see apps/rag/management/commands/)
or manually:
    CREATE EXTENSION IF NOT EXISTS vector;
    ALTER TABLE rag_policychunk ALTER COLUMN embedding TYPE vector(768) USING embedding::vector;
    ALTER TABLE rag_brandmemoryentry ALTER COLUMN embedding TYPE vector(768) USING embedding::vector;
    ALTER TABLE rag_angleframework ALTER COLUMN embedding TYPE vector(768) USING embedding::vector;

This two-step approach (create as text, cast to vector) keeps the migration
compatible with both SQLite (local dev) and Postgres (production).
"""
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='PolicyChunk',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('platform', models.CharField(
                    choices=[
                        ('meta', 'Meta (Facebook/Instagram)'),
                        ('tiktok', 'TikTok'),
                        ('google', 'Google Ads'),
                        ('internal', 'Internal Rejected Copy'),
                    ],
                    db_index=True,
                    max_length=20,
                )),
                ('section_title', models.CharField(blank=True, max_length=500)),
                ('content', models.TextField()),
                ('source_file', models.CharField(blank=True, max_length=255,
                    help_text='Original filename this chunk was extracted from')),
                ('chunk_index', models.PositiveIntegerField(default=0,
                    help_text='Chunk position within source document')),
                ('embedding', models.TextField(blank=True, null=True,
                    help_text='JSON-encoded embedding vector (upgrade to vector type on Postgres)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Policy Chunk',
                'verbose_name_plural': 'Policy Chunks',
                'ordering': ['platform', 'chunk_index'],
            },
        ),
        migrations.CreateModel(
            name='BrandMemoryEntry',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('project_id', models.UUIDField(db_index=True)),
                ('brief_summary', models.TextField(
                    help_text='Enhanced brief text used for this generation')),
                ('headline', models.CharField(blank=True, max_length=500,
                    help_text='Extracted H1/hero headline from generated HTML')),
                ('offer_text', models.CharField(blank=True, max_length=500,
                    help_text='Extracted pricing/offer line')),
                ('embedding', models.TextField(blank=True, null=True,
                    help_text='JSON-encoded embedding vector (upgrade to vector type on Postgres)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Brand Memory Entry',
                'verbose_name_plural': 'Brand Memory Entries',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ComplianceCheckResult',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('generation_id', models.UUIDField(db_index=True, unique=True)),
                ('project_id', models.UUIDField(db_index=True, null=True)),
                ('results_json', models.TextField(default='[]')),
                ('has_red_flags', models.BooleanField(db_index=True, default=False)),
                ('has_yellow_flags', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Compliance Check Result',
            },
        ),
        migrations.CreateModel(
            name='AngleFramework',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('vertical', models.CharField(
                    choices=[
                        ('ecommerce', 'E-Commerce / DTC'),
                        ('saas', 'SaaS / Digital'),
                        ('health', 'Health & Wellness'),
                        ('coaching', 'Coaching / Info Products'),
                        ('fashion', 'Fashion / Streetwear'),
                        ('finance', 'Financial Services'),
                        ('other', 'Other'),
                    ],
                    db_index=True,
                    max_length=30,
                )),
                ('mechanism', models.CharField(
                    choices=[
                        ('scarcity', 'Scarcity / Urgency'),
                        ('social_proof', 'Social Proof'),
                        ('pas', 'Problem-Agitate-Solve'),
                        ('before_after', 'Before / After'),
                        ('comparison', 'Comparison / Versus'),
                        ('authority', 'Authority / Expert'),
                    ],
                    db_index=True,
                    max_length=30,
                )),
                ('title', models.CharField(max_length=255)),
                ('structure_text', models.TextField(
                    help_text='Structural guidance for the angle — NOT verbatim copy.')),
                ('embedding', models.TextField(blank=True, null=True,
                    help_text='JSON-encoded embedding vector (upgrade to vector type on Postgres)')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Angle Framework',
                'verbose_name_plural': 'Angle Frameworks',
                'ordering': ['vertical', 'mechanism'],
            },
        ),
        migrations.AddIndex(
            model_name='policychunk',
            index=models.Index(fields=['platform'], name='rag_policy_platform_idx'),
        ),
        migrations.AddIndex(
            model_name='brandmemoryentry',
            index=models.Index(fields=['project_id', '-created_at'], name='rag_brand_project_idx'),
        ),
    ]
