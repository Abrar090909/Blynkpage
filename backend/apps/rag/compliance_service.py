"""
compliance_service.py — RAG-grounded ad policy compliance checking.

Use Case A from RAG_ADDON_SPEC.md.

Pipeline for each generated page:
  1. extract_claims()  — pull high-risk copy patterns from HTML text.
  2. For each claim → retrieve top-k matching policy chunks via RAG.
  3. For each (claim, policy_chunks) → ask Gemini: does this violate policy?
  4. Return structured results with severity: 'red' | 'yellow' | 'green'.

Severity semantics:
  red    — clearly prohibited (before/after claims, guaranteed returns,
            implied FDA approval, invented verifiable stats). Blocks publish.
  yellow — borderline / platform-dependent (unverified social proof,
            superlatives, implicit health-benefit language). Requires acknowledgment.
  green  — retrieved policy context found but Gemini determined no violation.

Fallback chain (most to least capable):
  1. Full RAG check (embedding + retrieval + Gemini classification).
  2. If pgvector corpus is empty → regex-only check (existing html_sanitizer logic).
  3. If all Gemini calls fail → regex-only check with a warning note.
"""
import json
import logging
import re

from django.conf import settings

logger = logging.getLogger(__name__)

# ─── Claim extraction ─────────────────────────────────────────────────────────

# Patterns that reliably pull high-risk claim text out of HTML.
# Order matters: more specific patterns first.
_CLAIM_PATTERNS = [
    # Invented numeric social proof (FTC: must be substantiated)
    re.compile(
        r'(?:(?:\d[\d,]+)\+?\s*(?:customers?|brands?|creators?|reviews?|users?|orders?|clients?|members?))',
        re.IGNORECASE,
    ),
    # Fabricated star/rating claims
    re.compile(r'\d+(?:\.\d+)?(?:/5|/10|\s*stars?|\s*out\s+of\s+5)', re.IGNORECASE),
    # Health authority claims (biggest compliance risk for Meta)
    re.compile(
        r'(?:FDA[- ]?approved|clinically[- ]?(?:proven|tested|studied)|'
        r'doctor[- ]?recommended|medically[- ]?(?:tested|certified)|'
        r'dermatologist[- ]?tested|lab[- ]?tested|scientifically[- ]?proven)',
        re.IGNORECASE,
    ),
    # Before/after framing (restricted on Meta)
    re.compile(
        r'(?:before\s+and\s+after|before\s*/\s*after|transformation\s+results?)',
        re.IGNORECASE,
    ),
    # Guaranteed financial return language
    re.compile(
        r'(?:guaranteed?\s+(?:returns?|income|profits?|earnings?)|'
        r'make\s+\$[\d,]+\s+(?:per|a)\s+(?:day|week|month)|'
        r'earn\s+\$[\d,]+)',
        re.IGNORECASE,
    ),
    # Personal attribute targeting (Meta-prohibited in ad copy)
    re.compile(
        r'(?:if\s+you(?:\'re|\s+are)\s+(?:struggling\s+with|suffering\s+from|'
        r'dealing\s+with|diagnosed\s+with|have\s+(?:diabetes|anxiety|depression)))',
        re.IGNORECASE,
    ),
    # Implicit health/safety claims
    re.compile(
        r'(?:zero[- ]?crash|jitter[- ]?free|no[- ]?crash|100%\s*natural|'
        r'clinically\s+safe|acid[- ]?free|sugar[- ]?free\s+and\s+(?:healthy|safe))',
        re.IGNORECASE,
    ),
]

# Strip HTML tags before scanning
_HTML_TAG_RE = re.compile(r'<[^>]+>', re.DOTALL)


def _strip_html(html: str) -> str:
    return _HTML_TAG_RE.sub(' ', html)


def extract_claims(html: str) -> list[str]:
    """
    Extract high-risk ad copy claims from HTML.

    Returns deduplicated list of matched claim strings. Each will be
    independently checked against policy via RAG.
    """
    text = _strip_html(html)
    claims = []
    seen = set()
    for pattern in _CLAIM_PATTERNS:
        for match in pattern.finditer(text):
            claim = match.group(0).strip()
            lower = claim.lower()
            if lower not in seen and len(claim) >= 5:
                claims.append(claim)
                seen.add(lower)
    return claims[:20]  # Cap at 20 to bound Gemini call count


# ─── Gemini compliance classification ────────────────────────────────────────

_COMPLIANCE_CHECK_PROMPT = """You are an expert in ad platform compliance reviewing copy for a landing page.

POLICY SECTION(S):
{policy_text}

AD COPY CLAIM TO REVIEW:
"{claim}"

Task: Determine if this claim violates the policy above as written.
Respond with ONLY a valid JSON object (no markdown, no extra text):

{{
  "verdict": "VIOLATION" | "BORDERLINE" | "COMPLIANT",
  "severity": "red" | "yellow" | "green",
  "explanation": "1-2 sentence explanation, citing the relevant policy section",
  "policy_section": "Name or short quote of the most relevant policy section"
}}

Severity guide:
- red: Clear violation that would get the ad rejected or account flagged (invented stats, FDA claims, before/after, guaranteed returns).
- yellow: Borderline — platform-dependent or requires substantiation (superlatives, unverified social proof, implicit health claims).
- green: Compliant based on the retrieved policy context.
"""


def _call_gemini_compliance(claim: str, policy_chunks: list[dict]) -> dict | None:
    """
    Call Gemini to classify a claim against retrieved policy chunks.
    Returns parsed result dict or None on failure.
    """
    api_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not api_key:
        return None

    policy_text = '\n\n---\n\n'.join(
        f"[{c.get('platform', '').upper()} — {c.get('section_title', 'Policy')}]\n{c['content']}"
        for c in policy_chunks
    )

    prompt = _COMPLIANCE_CHECK_PROMPT.format(claim=claim, policy_text=policy_text)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Use a cheap, fast model for the classification pass
        for model in ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']:
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.1,  # Low temp for consistent classification
                        max_output_tokens=256,
                    ),
                )
                raw = response.text.strip()
                # Strip accidental markdown fences
                if raw.startswith('```'):
                    raw = re.sub(r'^```[a-z]*\n?', '', raw).rstrip('`').strip()
                return json.loads(raw)
            except json.JSONDecodeError:
                logger.warning('Compliance Gemini response was not valid JSON: %s', response.text[:200])
                return None
            except Exception as e:
                logger.warning('Compliance Gemini call failed with %s: %s', model, e)
                continue

    except Exception as e:
        logger.warning('Gemini compliance check outer error: %s', e)

    return None


# ─── Regex-only fallback ──────────────────────────────────────────────────────

def _regex_fallback_check(html: str) -> list[dict]:
    """
    Fallback to the existing regex-based compliance checks from html_sanitizer.
    Returns results in the same format as the full RAG check.
    """
    try:
        from apps.pages.html_sanitizer import flag_compliance_issues
        flags = flag_compliance_issues(html)
        return [
            {
                'claim': f['matched_text'],
                'severity': 'yellow',
                'verdict': 'BORDERLINE',
                'explanation': f['description'],
                'policy_section': f['type'],
                'source': 'regex-fallback',
            }
            for f in flags
        ]
    except Exception as e:
        logger.warning('Regex fallback compliance check failed: %s', e)
        return []


# ─── Main compliance check entry point ───────────────────────────────────────

def run_compliance_check(html: str, generation_id: str | None = None, project_id: str | None = None) -> list[dict]:
    """
    Run a full compliance check on generated HTML.

    Returns a list of compliance result dicts, each with:
      {claim, severity, verdict, explanation, policy_section, source}

    source is 'rag' for full RAG checks, 'regex-fallback' for degraded mode.

    Results are cached in ComplianceCheckResult if generation_id is provided.
    """
    # Check cache first
    if generation_id:
        try:
            from .models import ComplianceCheckResult
            import uuid
            gen_uuid = uuid.UUID(str(generation_id))
            cached = ComplianceCheckResult.objects.filter(generation_id=gen_uuid).first()
            if cached:
                logger.debug('Returning cached compliance results for generation %s', generation_id)
                return cached.get_results()
        except Exception as e:
            logger.warning('Cache lookup failed: %s', e)

    # Extract claims
    claims = extract_claims(html)

    if not claims:
        results = []
        _cache_results(results, generation_id, project_id)
        return results

    # Check if we have any policy corpus at all
    from .retrieval import retrieve_policy_chunks
    try:
        from .models import PolicyChunk
        has_corpus = PolicyChunk.objects.exists()
    except Exception:
        has_corpus = False

    if not has_corpus:
        logger.info('No policy corpus loaded — falling back to regex compliance check.')
        results = _regex_fallback_check(html)
        _cache_results(results, generation_id, project_id)
        return results

    # Full RAG check: retrieve + classify each claim
    results = []
    rag_succeeded = False

    for claim in claims:
        policy_chunks = retrieve_policy_chunks(claim, top_k=3)

        if not policy_chunks:
            # No relevant chunks found — mark as green (no policy violation found)
            results.append({
                'claim': claim,
                'severity': 'green',
                'verdict': 'COMPLIANT',
                'explanation': 'No matching policy restriction found in corpus for this claim.',
                'policy_section': '',
                'source': 'rag-no-match',
            })
            continue

        gemini_result = _call_gemini_compliance(claim, policy_chunks)

        if gemini_result:
            rag_succeeded = True
            results.append({
                'claim': claim,
                'severity': gemini_result.get('severity', 'yellow'),
                'verdict': gemini_result.get('verdict', 'BORDERLINE'),
                'explanation': gemini_result.get('explanation', ''),
                'policy_section': gemini_result.get('policy_section', ''),
                'source': 'rag',
            })
        else:
            # Individual claim Gemini call failed — use conservative yellow
            results.append({
                'claim': claim,
                'severity': 'yellow',
                'verdict': 'BORDERLINE',
                'explanation': 'Could not complete policy check — review this claim manually before publishing.',
                'policy_section': '',
                'source': 'rag-degraded',
            })

    # If all Gemini calls failed, supplement with regex fallback
    if claims and not rag_succeeded:
        logger.warning('All compliance Gemini calls failed — supplementing with regex fallback.')
        regex_results = _regex_fallback_check(html)
        # Merge: add regex results for claims not already covered
        covered_claims = {r['claim'].lower() for r in results}
        for rr in regex_results:
            if rr['claim'].lower() not in covered_claims:
                results.append(rr)

    _cache_results(results, generation_id, project_id)
    return results


def _cache_results(results: list[dict], generation_id: str | None, project_id: str | None) -> None:
    """Persist compliance results to DB cache if generation_id is available."""
    if not generation_id:
        return
    try:
        from .models import ComplianceCheckResult
        import uuid
        gen_uuid = uuid.UUID(str(generation_id))
        proj_uuid = uuid.UUID(str(project_id)) if project_id else None
        obj, _ = ComplianceCheckResult.objects.get_or_create(
            generation_id=gen_uuid,
            defaults={'project_id': proj_uuid},
        )
        obj.set_results(results)
        obj.save()
    except Exception as e:
        logger.warning('Failed to cache compliance results: %s', e)
