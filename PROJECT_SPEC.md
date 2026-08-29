# Project: PromptLaunch (working name)
### One-prompt AI landing page generator that doubles as a self-contained ad

---

## 0. Positioning reference — what we're aligning with

Reviewed [blynkads.com](https://blynkads.com/) directly. Their core value props we are deliberately mirroring for the landing-page-generation slice of the product:

- **Single prompt → deployable output.** No forms, no builder, no drag-and-drop. One text box is the entire input surface.
- **"Zero experience required."** The user should never see a technical term. No "hero section," no "CTA block" — just their product, described.
- **The output IS the ad, not a brochure.** Blynk's whole thesis is that the asset needs to convert on its own, cold, with paid traffic landing on it — not just "look nice." Our landing pages must be written and structured like a direct-response ad: one product, one promise, one CTA, urgency/proof baked in — not a generic "About / Features / Contact" template.
- **Meta integration is the natural end-state**, not a bolt-on. Blynk's pitch is "run ads in 1 prompt" — we're building the landing-page half of that loop, so once the page exists, pushing it live as a Meta campaign destination should feel like the obvious next click, not a separate product.
- **Prompt enhancement** — Blynk auto-expands a thin prompt into a full creative brief before generating. We do the same before we ever call Gemini for the actual page.

We are **not** cloning Blynk's ad-buying/audience/creative-image engine — we're building the landing-page-generation piece, done to the same "converts cold traffic, zero user skill required" standard, with Meta Ads as a connected output rather than the core product.

---

## 1. One-line pitch

> Type what you're selling. Get a live, conversion-built landing page in under a minute — streamed in front of you like it's being built by hand — and push it straight to a Meta ad campaign in one click.

---

## 2. Core user flow

1. **Marketing site** (`promptlaunch.com`) — a single hero with one big prompt input. No signup wall to *try* it — signup is triggered only when they hit generate (or after a preview, TBD by growth testing).
2. User types one prompt, e.g. *"A subscription box for cold-brew coffee beans, ships every 2 weeks, $24/mo, targeting busy professionals."*
3. On submit, the UI **transitions in place** from marketing page → app dashboard (no jarring redirect/reload — animate the same input bar into the chat panel).
4. **Dashboard layout** (Google AI Studio–style two-pane):
   - **Left panel — Chat/Command bar.** Conversation history with the AI: the original prompt, follow-up refinement messages ("make the headline punchier," "swap the CTA color," "add a testimonial section"), and the AI's short text responses.
   - **Right panel — Workspace.** Two tabs/toggle: **Code** (live-streaming raw HTML/CSS/JS as tokens arrive, monospace, syntax-highlighted, auto-scrolling) and **Preview** (rendered iframe). Default view during generation = Code streaming; auto-switch to Preview when the stream finishes (or let the user toggle manually, remembering their last choice).
5. Once generated, action bar above the workspace: **Publish**, **Download**, **Connect to Meta Ads**, **Share preview link**.
6. **Connect to Meta Ads** (one click, OAuth to Meta already done at account level) — auto-creates a campaign shell (objective: Leads or Conversions based on prompt content), sets the generated page's published URL as the destination, and drops the user into a lightweight review screen (budget, audience suggestion, ad copy pulled from the same Gemini generation) before they hit launch. We are not rebuilding Meta's Ads Manager — we're pre-filling it and handing off responsibility for spend confirmation to the user inside Meta's own compliance flow.

---

## 3. Why streaming code (not just a spinner)

Two reasons, both intentional, not just aesthetic:
- **Trust/perceived intelligence** — watching real HTML/CSS appear token-by-token reads as "this is actually being built for me," which is a large part of the AI Studio / Cursor / v0 magic. A blank loading spinner for 20–40 seconds reads as broken.
- **Debuggability for power users** — freelancers/agencies (our early ICP, similar to Abrar's own PixelOwl client base) will want to grab the raw code and hand-edit or embed it, so showing it as it's built also functions as the export step.

---

## 4. Anti-"AI slop" system prompt — design principles

This is the single highest-leverage part of the product. Generic LLM-generated landing pages have a extremely recognizable visual signature that reads as cheap and kills conversion trust. The system prompt sent to Gemini must **explicitly forbid** the following, not just "encourage good design":

**Hard bans (never allowed, checked in the prompt as explicit negative constraints):**
- Purple-to-blue or purple-to-pink gradient hero backgrounds
- Generic rounded-corner "glassmorphism" cards with soft drop shadows everywhere
- Emoji used as section icons (📈 🚀 💡 ✅) instead of real iconography or none at all
- Centered-everything layouts with no asymmetry or visual hierarchy
- Three-column "feature grid" with icon-above-heading-above-paragraph as the only content pattern on the page
- Generic stock-photo-style AI hero illustrations (floating 3D blobs, abstract mesh gradients, isometric people at laptops)
- Placeholder/lorem-ipsum-adjacent copy — vague claims like "Revolutionize your workflow," "Take your business to the next level," "Powerful features for modern teams"
- Overuse of large font-weight-800 headlines with no supporting proof underneath
- Identical button style/size repeated 4+ times per page ("Get Started" spam)
- Generic testimonial cards with fake 5-star ratings and no specific claim

**Required instead (positive constraints):**
- Copy must be specific to the actual prompt: real numbers, real product mechanics, real objections addressed. If the prompt lacks specifics, the model should invent plausible, concrete specifics rather than staying vague.
- One single, unmistakable primary CTA repeated at most 2–3 times (hero, mid-page, final), each contextually worded (not just "Get Started" every time).
- Direct-response structure, not brochure structure. Required page skeleton (model may reorder/merge but not drop core beats):
  1. Hook headline + one-sentence value prop matched to the exact audience in the prompt
  2. Immediate proof/credibility signal (a number, a guarantee, a specific outcome)
  3. The offer, stated plainly (what they get, what it costs, what happens next)
  4. Objection-handling section (addresses the #1 reason someone wouldn't buy)
  5. Social proof (specific, not generic — a named use-case or a real-feeling detail)
  6. Urgency/scarcity or a clear next step
  7. Final CTA with restated offer
- Typography: pick one distinctive typeface pairing per generation (not the default system-ui/Inter-everywhere look) and one accent color derived from the product's category (not a random purple).
- Layout must include at least one asymmetric or non-grid section to avoid the "template" feel.
- Every generation must be a **single self-contained HTML file** (inline `<style>`, inline or CDN-linked minimal JS) so it can be dropped straight onto any host or Meta's landing-page destination with zero build step.

**Implementation detail:** maintain this as a versioned system-prompt file (`prompts/landing_page_system_v1.md`) in the repo, not hardcoded in application code, so it can be iterated on and A/B tested (this matches the iterative testing approach Abrar already prefers for PixelOwl/other projects) without a deploy.

---

## 5. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Backend framework | Django 5.x | Chosen per requirement. Use Django REST Framework only if a separate frontend SPA is used; if server-rendered + HTMX/Alpine, DRF may be unnecessary. |
| Realtime/streaming | Django Channels (ASGI) + WebSockets, or Server-Sent Events via `StreamingHttpResponse` | SSE is simpler and sufficient for one-directional token streaming (server → client); recommend SSE first, upgrade to Channels only if bidirectional needs emerge (e.g. live collaborative editing later). |
| LLM | Gemini API (`gemini-2.x-flash` or `-pro` depending on cost/quality tradeoff testing) | Use the streaming generate-content endpoint so tokens can be piped straight through to the SSE connection. |
| Database | PostgreSQL | Stores users, projects, generation history, prompt versions, published pages. |
| Task queue | Celery + Redis | For Meta Ads API calls (campaign creation, async), page publishing/CDN push, and any long-running generation retries. |
| Frontend | Django templates + HTMX + Alpine.js, OR a lightweight React/Vite SPA served by Django | Given the two-pane streaming UI with live code + toggling preview, a small React/Vite frontend will likely be far less painful than HTMX for this specific screen. Recommend: Django as pure API + auth + Meta integration backend; React SPA for the dashboard/chat/workspace UI. Marketing landing page itself can stay server-rendered Django template for SEO. |
| Published-page hosting | Store generated HTML in DB/S3, serve via a dedicated Django view at a clean slug URL (`promptlaunch.com/p/<slug>`) or allow custom domain/CNAME later | Needed as the Meta ad destination URL. |
| Auth | Django allauth (email) + Meta OAuth (for the Ads connection, separate from login) | |
| Ads integration | Meta Marketing API (Graph API) via `facebook-business` Python SDK | Requires a Meta App with `ads_management` permission, App Review, and a Business verification — flag this as a real lead-time item, not a weekend task. |

---

## 6. Data model (initial)

```
User
 └── has many Projects

Project
 - id, user, name, slug
 - original_prompt (text)
 - enhanced_brief (text, the AI-expanded version of the prompt — like Blynk's "Intelligent Prompt Enhancement")
 - status (draft | generating | ready | published)
 - created_at, updated_at

Generation
 - id, project (FK)
 - prompt_used (text) -- the exact prompt sent to Gemini for this specific run, including refinement instructions
 - html_output (text/long)
 - model_used, token_count, cost_estimate
 - created_at
 - is_current (bool) -- which generation is the live one for the project

ChatMessage
 - id, project (FK)
 - role (user | assistant)
 - content (text)
 - created_at

PublishedPage
 - id, project (FK, one-to-one)
 - public_url_slug
 - generation (FK -> the Generation currently live)
 - published_at

MetaAdConnection
 - id, user (FK)
 - meta_ad_account_id
 - access_token (encrypted)
 - connected_at

MetaCampaign
 - id, project (FK)
 - meta_campaign_id, meta_adset_id, meta_ad_id
 - destination_url (-> PublishedPage url)
 - status, budget, objective
 - created_at
```

---

## 7. Backend flow: generation request

1. `POST /api/projects/` with `{prompt}` → creates `Project`, kicks off enhancement step.
2. **Enhancement step** (fast, non-streamed call to Gemini): expand the raw prompt into a structured brief — product, audience, price/offer if mentioned, tone, one likely objection, one likely proof point to invent if none given. Store as `enhanced_brief`. This step also decides page category (SaaS / physical product / service / event / etc.) so the system prompt can nudge design conventions appropriately (e.g. a local service business ad differs from a SaaS ad).
3. **Generation step**: combine `landing_page_system_v1.md` + `enhanced_brief` → send to Gemini streaming endpoint.
4. Backend relays each incoming chunk over SSE (`/api/projects/<id>/stream/`) to the frontend, which appends to the code pane in real time.
5. On stream completion: save `Generation`, mark `Project.status = ready`, auto-render preview iframe (via `srcdoc`, sandboxed).
6. **Refinement messages** (left-panel chat) after the first generation: append the user's instruction + the current HTML as context, re-run generation (full regenerate is simpler and more reliable than true patch/diff editing for v1; diff-based editing is a v2 optimization to reduce token cost and preserve unrelated sections).

---

## 8. Meta Ads one-click flow

1. Prerequisite: user has connected their Meta Business account once (standard OAuth flow, stored in `MetaAdConnection`).
2. User clicks **Connect to Meta Ads** on a published project.
3. Backend (Celery task, since Meta API calls can be slow):
   - Creates a Campaign (objective inferred from `enhanced_brief` — Leads vs. Conversions vs. Traffic).
   - Creates an Ad Set with a first-pass audience suggestion (age/gender/location/interest keywords pulled from the same `enhanced_brief` used for the page copy — reuse, don't regenerate).
   - Creates the Ad creative: headline + primary text pulled/derived from the landing page's own hook and offer (so ad and page message-match, which materially affects Meta's relevance/quality score), destination = `PublishedPage.public_url_slug`.
   - Leaves campaign in **paused/draft** state — user must review budget and hit launch inside our review screen or in Meta Ads Manager directly. **Never auto-spend without explicit human confirmation.**
4. Review screen shows: proposed budget (editable), proposed audience (editable), ad preview, campaign objective — then a single "Launch Campaign" button that flips status to active via the API.

---

## 9. MVP scope (build order)

**Phase 1 — Core generation loop (no auth complexity, no Meta yet)**
- Marketing page with single prompt input
- Django backend: prompt → enhancement → Gemini streaming → SSE → dashboard UI showing code stream → preview
- Refinement chat (regenerate-on-instruction)
- Publish to a slug URL

**Phase 2 — Accounts & persistence**
- Signup/login, project history/dashboard list
- Save/version generations, allow reverting to a previous version

**Phase 3 — Meta Ads connection**
- Meta OAuth, campaign/ad set/ad creation, paused-draft-then-launch review flow

**Phase 4 — Monetization & scale**
- Usage-based or tiered pricing (generation credits), team/agency seats (relevant given PixelOwl's agency-client use case — could double as a white-label tool sold to Abrar's own web-dev clients later)
- Custom domain support for published pages
- A/B variant generation (generate 2–3 headline/CTA variants automatically, common ask for a tool that positions itself as ad-focused)

---

## 10. Open questions to decide before/while building

- Full-page regenerate vs. section-level diff editing for refinements — start with full regenerate (simpler, more reliable), revisit for cost/speed once volume is real.
- Gemini model tier (Flash vs Pro) — needs a real cost-per-generation vs. quality A/B test before committing, in line with the iterative-testing approach preferred over picking one on theory.
- Whether the free/trial tier generates a lower-fidelity page (e.g. watermarked, no custom domain, capped refinements) to protect margins on the Gemini API cost per generation.
- Google Ads as a second one-click destination alongside Meta — likely a natural Phase 5, not MVP.
