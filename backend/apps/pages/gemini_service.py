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
You are a senior direct-response marketing director and high-ROAS paid ads strategist.
A performance marketer or brand founder has provided an ad hook, creative angle, or product description.
Your job is to expand it into an elite, structured creative brief for a 1:1 Ad-Congruent Landing Page.

USER AD HOOK / PRODUCT BRIEF:
{raw_prompt}

Output a structured brief with these exact sections (plain text, no markdown headers):

PAGE_TYPE: [Either "E-Commerce Product Drop / DTC Presell Page" (streetwear, fashion, physical products, consumables) or "SaaS / High-Ticket Lead Gen Presell Page" (software, digital services)]
BRAND_OR_PRODUCT_NAME: [Exact brand name from prompt, e.g. "funk"]
EXACT_PRICE_AND_CURRENCY: [Exact price and currency requested e.g. "₹2,999 / 2999/-" — NEVER change or hallucinate a different price]
EXACT_VISUAL_AESTHETICS: [Specific visual motifs requested, e.g. "cool stickers, hoodie cartoon character mascot, funky Gen Z streetwear, bold typography, acid/neon accents"]
CORE_AD_HOOK: [The primary creative angle / promise from the ad that MUST be mirrored above the fold]
CONGRUENCE_HEADLINE: [The exact high-converting H1 matching the ad hook]
TARGET_AUDIENCE: [The exact high-intent buyer persona clicking from Meta / TikTok / Google Ads]
PRODUCT_HIGHLIGHTS: [3-4 specific craftsmanship or feature highlights, e.g. 420 GSM Terry Cotton, High-Density Cartoon Mascot Puff Print, Boxy Fit]
IRRESISTIBLE_OFFER: [Exact pricing, drop specials, or incentives e.g. "₹2,999 Drop Special • Free Shipping Across India • Limited Run"]
PRIMARY_OBJECTION_CRUSHER: [The biggest skepticism the buyer has and the proof point that crushes it]

Be extremely concrete, direct-response focused, and conversion-engineered.
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
    raw_prompt: str,
    enhanced_brief: str | None = None,
    refinement_instruction: str | None = None,
    current_html: str | None = None,
) -> str:
    """
    Combine the versioned system prompt with the raw prompt and enhanced brief.
    If refinement_instruction is provided, append it and the current HTML.
    """
    system_template = _load_system_prompt()
    brief_text = enhanced_brief or raw_prompt
    prompt = system_template.replace('{raw_prompt}', raw_prompt).replace('{enhanced_brief}', brief_text)

    if refinement_instruction:
        prompt += (
            f"\n\n# ─────────────────────────────────────────────────────────────────────────────\n"
            f"# USER REFINEMENT DIRECTIVE (CRITICAL - APPLY THESE CHANGES TO THE PAGE)\n"
            f"# ─────────────────────────────────────────────────────────────────────────────\n"
            f"{refinement_instruction}\n"
        )
        if current_html:
            prompt += (
                f"\n\n# PREVIOUS HTML CODE TO REFINE (Preserve all working sections, CSS, and functionality; modify specifically according to user instructions):\n"
                f"{current_html}\n"
            )
    return prompt


def stream_generation(
    raw_prompt: str,
    enhanced_brief: str | None = None,
    refinement_instruction: str | None = None,
    current_html: str | None = None,
) -> Generator[str, None, None]:
    """
    Synchronous generator that streams HTML chunks from Gemini's streaming API in real time.
    Includes automatic model failover if one model hits quota or capacity limits.
    """
    client = _get_client()
    prompt = _build_generation_prompt(raw_prompt, enhanced_brief, refinement_instruction, current_html)
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
