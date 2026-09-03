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
    checkout_url = models.URLField(max_length=500, blank=True, help_text="Direct checkout redirect URL (Shopify, Stripe, Razorpay, WhatsApp)")
    enable_lead_capture = models.BooleanField(default=True, help_text="Enable native COD / inquiry capture drawer on published page")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['slug']),
        ]

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
        indexes = [
            models.Index(fields=['project', '-created_at']),
            models.Index(fields=['project', 'is_current']),
        ]

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
        indexes = [
            models.Index(fields=['project', 'created_at']),
        ]

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


class UserPixelConfig(models.Model):
    """
    Per-user Meta Pixel configuration.
    Stored once; injected into every page the user publishes.
    The access_token is used for server-side Conversions API (CAPI) forwarding
    to maintain tracking through iOS content blockers and browser ITP.
    """
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='pixel_config'
    )
    meta_pixel_id = models.CharField(
        max_length=20,
        blank=True,
        help_text='15–20 digit Meta Pixel ID from Events Manager.',
    )
    meta_access_token = models.CharField(
        max_length=500,
        blank=True,
        help_text='Meta System User access token for CAPI forwarding.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'User Pixel Config'

    def __str__(self):
        return f'Pixel config for {self.user.email} (pixel: {self.meta_pixel_id or "not set"})'


class LeadOrder(models.Model):
    """
    Direct response customer inquiry or Cash-on-Delivery (COD) order
    captured directly from the published landing page.
    """
    class Status(models.TextChoices):
        NEW = 'new', 'New Lead / Order'
        CONTACTED = 'contacted', 'Contacted / Confirmed'
        COMPLETED = 'completed', 'Completed / Shipped'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='leads')
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=50)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True, help_text="Delivery address for COD orders")
    variant = models.CharField(max_length=150, blank=True, help_text="Selected variant, size, or color")
    quantity = models.PositiveIntegerField(default=1)
    utm_source = models.CharField(max_length=100, blank=True)
    utm_medium = models.CharField(max_length=100, blank=True)
    utm_campaign = models.CharField(max_length=100, blank=True)
    utm_content = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.NEW)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', '-created_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"Order from {self.name} ({self.phone}) for {self.project.name or self.project.id}"


class CustomDomain(models.Model):
    """
    Maps a custom subdomain (e.g. drop.brand.com) to a Project's published page.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Verification'
        ACTIVE = 'active', 'Active'
        FAILED = 'failed', 'Verification Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name='custom_domain')
    domain = models.CharField(max_length=255, unique=True, help_text="e.g. drop.yourbrand.com")
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING)
    verification_token = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.domain} [{self.status}] -> {self.project}"


class AnalyticsEvent(models.Model):
    """
    High-speed tracking event for Page Views, CTA Clicks, and Leads.
    """
    class EventType(models.TextChoices):
        VIEW = 'view', 'Page View'
        CLICK = 'click', 'CTA Click'
        LEAD = 'lead', 'Lead Submitted'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='analytics_events')
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    utm_source = models.CharField(max_length=100, blank=True)
    utm_medium = models.CharField(max_length=100, blank=True)
    utm_campaign = models.CharField(max_length=100, blank=True)
    utm_content = models.CharField(max_length=100, blank=True)
    ip_hash = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['project', 'event_type', '-created_at']),
            models.Index(fields=['project', 'utm_campaign']),
        ]
