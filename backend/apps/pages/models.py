"""
Data models for PromptLaunch — Phase 1.

Covers: Project, Generation, ChatMessage, PublishedPage.
Auth (User FK) is nullable in Phase 1 (anonymous generation allowed).
"""
import uuid
from django.db import models
from django.contrib.auth.models import User


class Project(models.Model):
    """Top-level entity for a user's landing page campaign."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ENHANCING = 'enhancing', 'Enhancing'
        GENERATING = 'generating', 'Generating'
        READY = 'ready', 'Ready'
        PUBLISHED = 'published', 'Published'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Nullable FK: Phase 1 allows anonymous generation; Phase 2 will enforce auth.
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='projects'
    )
    name = models.CharField(max_length=255, blank=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    original_prompt = models.TextField()
    enhanced_brief = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name or f'Project {self.id}'


class Generation(models.Model):
    """A single Gemini generation run for a Project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='generations')
    # The exact prompt sent to Gemini for this run (system + brief + any refinement).
    prompt_used = models.TextField()
    html_output = models.TextField(blank=True)
    model_used = models.CharField(max_length=100, blank=True)
    token_count = models.IntegerField(null=True, blank=True)
    cost_estimate = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Generation {self.id} for {self.project}'

    def save(self, *args, **kwargs):
        """Ensure only one generation per project is marked is_current."""
        if self.is_current:
            Generation.objects.filter(project=self.project, is_current=True).exclude(
                pk=self.pk
            ).update(is_current=False)
        super().save(*args, **kwargs)


class ChatMessage(models.Model):
    """A single message in the project's refinement conversation."""

    class Role(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'[{self.role}] {self.content[:60]}'


class PublishedPage(models.Model):
    """The live, publicly accessible version of a project's landing page."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name='published_page')
    public_url_slug = models.SlugField(max_length=100, unique=True)
    generation = models.ForeignKey(
        Generation, on_delete=models.PROTECT, related_name='published_as'
    )
    published_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Published: /p/{self.public_url_slug}'
