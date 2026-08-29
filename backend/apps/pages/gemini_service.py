"""
Gemini API service for PromptLaunch.
Uses the `google.genai` SDK (google-genai >= 2.0).

Two responsibilities:
  1. enhance_prompt()   — fast, non-streamed call to expand a raw user prompt
                          into a structured brief used by the generation step.
  2. stream_generation() — synchronous generator that yields HTML chunks from
                           Gemini streaming endpoint in real-time.
"""
import logging
from pathlib import Path
from typing import Generator

from google import genai
from google.genai import types
from django.conf import settings

logger = logging.getLogger(__name__)

# ─── System prompt loading ────────────────────────────────────────────────────

PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / 'prompts'
_system_prompt_cache: dict[str, str] = {}


def _load_system_prompt(filename: str = 'landing_page_system_v1.md') -> str:
    """Load and cache the versioned system prompt from disk."""
    if filename not in _system_prompt_cache:
        prompt_path = PROMPTS_DIR / filename
        _system_prompt_cache[filename] = prompt_path.read_text(encoding='utf-8')
    return _system_prompt_cache[filename]


def _get_client() -> genai.Client:
    """Return a configured google.genai Client."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


# ─── Markdown fence stripping ─────────────────────────────────────────────────

def strip_markdown_fences(html: str) -> str:
    """
    Gemini sometimes wraps output in ```html ... ``` fences.
    Strip them so the iframe gets clean HTML.
    Also ensures HTML is validly closed if generation ends cleanly.
    """
    stripped = html.strip()
    if stripped.startswith('```'):
        # Remove opening fence line (e.g. ```html)
        first_newline = stripped.find('\n')
        if first_newline != -1:
            stripped = stripped[first_newline + 1:]
        # Remove closing fence
        if stripped.rstrip().endswith('```'):
            stripped = stripped.rstrip()[:-3].rstrip()

    # Safety check: ensure </body> and </html> are closed
    if '</html>' not in stripped:
        if '</body>' not in stripped:
            stripped += '\n</body>'
        stripped += '\n</html>'

    return stripped


# ─── Enhancement step ─────────────────────────────────────────────────────────

ENHANCEMENT_PROMPT = """
You are a senior digital conversion strategist and brand creative director.
A user has typed a product description to generate a high-converting web page.
Your job is to expand it into an inspiring, concrete, structured creative brief.

USER PROMPT:
{raw_prompt}

Output a structured brief with these exact sections (plain text, no markdown headers):

PAGE_TYPE: [Either "E-Commerce Product Page" (for apparel, coffee, physical goods, gadgets) or "SaaS/Service Landing Page" (for apps, subscriptions, B2B tools, agencies)]
PRODUCT_NAME: [Punchy, memorable brand/product name]
PRODUCT: [What is it, in one compelling, vivid sentence]
AUDIENCE: [Who is the ideal buyer — demographics, mindset, taste level]
PRICE_OFFER: [Exact price and offer structure, e.g. "$120 (Limited Drop 004)" or "$39/mo with 14-day trial"]
CATEGORY: [One of: Streetwear/Fashion / Food & Beverage / Tech Gadgets / SaaS / Wellness / Other]
TONE: [One of: Underground & Bold / Premium Minimalist / Vibrant & Punchy / High-Trust Professional]
LIKELY_OBJECTION: [The single biggest hesitation the buyer has, e.g. "Is the fabric actually 450 GSM heavyweight?"]
PROOF_POINT: [Concrete proof, e.g. "Milled in Portugal from 100% organic combed cotton, 300 pieces worldwide"]
HOOK_IDEA: [A punchy, unignorable headline angle]

Be specific. Add sharp, realistic details that make this brand feel like a real $10M company.
""".strip()


def _get_model_candidates() -> list[str]:
    """Return an ordered list of active flash models to attempt with failover."""
    return ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.7-flash']


def enhance_prompt(raw_prompt: str) -> str:
    """
    Non-streamed Gemini call to expand a thin user prompt into a structured brief.
    Includes automatic failover across active Flash models if quota is reached.
    """
    client = _get_client()
    last_error = None

    for model_name in _get_model_candidates():
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=ENHANCEMENT_PROMPT.format(raw_prompt=raw_prompt),
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=1024,
                ),
            )
            return response.text.strip()
        except Exception as e:
            logger.warning("enhance_prompt failed with %s: %s, trying fallback...", model_name, e)
            last_error = e

    raise last_error or RuntimeError("All model attempts failed.")


# ─── Generation step (real-time streaming) ───────────────────────────────────

def _build_generation_prompt(
    enhanced_brief: str,
    refinement_instruction: str | None = None,
    current_html: str | None = None,
) -> str:
    """
    Combine the versioned system prompt with the enhanced brief.
    If refinement_instruction is provided, append it and the current HTML.
    """
    system_template = _load_system_prompt()
    prompt = system_template.replace('{enhanced_brief}', enhanced_brief)

    if refinement_instruction and current_html:
        prompt += (
            f"\n\n--- REFINEMENT INSTRUCTION ---\n"
            f"{refinement_instruction}\n\n"
            f"--- CURRENT HTML (refine this, regenerate the full page) ---\n"
            f"{current_html}"
        )
    return prompt


def stream_generation(
    enhanced_brief: str,
    refinement_instruction: str | None = None,
    current_html: str | None = None,
) -> Generator[str, None, None]:
    """
    Synchronous generator that streams HTML chunks from Gemini's streaming API in real time.
    Includes automatic model failover if one model hits quota or capacity limits.
    """
    client = _get_client()
    prompt = _build_generation_prompt(enhanced_brief, refinement_instruction, current_html)
    last_error = None

    for model_name in _get_model_candidates():
        try:
            response_stream = client.models.generate_content_stream(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.75,
                    max_output_tokens=32768,
                ),
            )
            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
            return  # Stream succeeded completely

        except Exception as e:
            logger.warning("stream_generation failed with %s: %s, trying alternate model...", model_name, e)
            last_error = e

    logger.exception("All Gemini stream attempts failed: %s", last_error)
    yield f"<!-- GENERATION ERROR: {last_error} -->"
