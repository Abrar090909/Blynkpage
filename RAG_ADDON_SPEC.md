# Blynkpages — RAG Add-On Spec

Companion to `BLYNKPAGES_PRODUCTION_FIX_SPEC.md` and `BLYNKPAGES_FEATURE_EXPANSION.md`. This covers adding a retrieval layer to the product. Assumption made here: since compliance-checking, brand-memory, and winning-angle retrieval all share the same underlying infrastructure (embeddings + vector store + retrieval API), this spec builds one retrieval layer that serves all three use cases rather than three separate systems. If you only want one of the three to start, Section 2 is the one to build first — it's the safety-critical one and the cleanest to ship and evaluate independently.

---

## 1. Why RAG Here (Not Just a Bigger System Prompt)

The generation pipeline currently relies on a single system prompt (`landing_page_system_v1.md`) plus the 11-part enhancement brief. That works for generic direct-response structure, but it can't scale to three things that are inherently retrieval problems:

- **Policy changes over time** (Meta/TikTok ad rules) — can't be baked into a static prompt without redeploying every time policy changes.
- **Per-project history** (a user's past pages/tone/offers) — grows per-user, can't live in a shared prompt.
- **A large library of proven ad angles/frameworks by vertical** — too much to stuff into one prompt without diluting it for every generation regardless of relevance.

All three need: embed a corpus, retrieve the relevant slice at generation time, inject only that slice into the prompt.

---

## 2. Use Case A — Ad Compliance Grounding (build this first)

**Goal:** before a page is marked "READY" to publish, check generated copy against actual platform ad policy and flag risky claims with citations, instead of shipping fabricated stats and restricted claims straight to a live ad (the "60-Day Promise," invented review counts, unverified health claims problem flagged in the fix spec).

**Corpus:**
- Meta Ad Policy (restricted content categories: health, financial services, before/after claims, personal attributes)
- TikTok Ads policy, if TikTok is a launch target
- A small internal set of previously-rejected ad copy examples (start manually curated, grow from real rejections over time)

**Pipeline:**
1. Chunk policy docs by rule/section (not fixed token windows — policy docs have natural section boundaries, use those).
2. Embed chunks, store in a vector DB (pgvector is the pragmatic choice here since you're already on Postgres — no need for a separate vector store at this scale).
3. At publish-check time, run the generated page's copy through: extract claims (superlative statements, numeric stats, health/financial language) → embed each claim → retrieve top-k matching policy chunks → pass claim + retrieved policy text to the model with an explicit instruction: "does this claim violate this policy, and why — cite the section."
4. Surface results as a checklist in the workspace before the "Publish" button is enabled: green (no issues), yellow (borderline, user can override with acknowledgment), red (blocks publish until edited).

**Evaluation (this is what makes it credible, not just a feature):**
- Build a small labeled set: 30–50 real ad copy examples, manually tagged pass/fail against the actual policy.
- Track precision (of flagged claims, how many are real violations) and recall (of real violations, how many get caught) before shipping. A compliance checker with high false-positive rate will just get overridden and ignored; a low-recall one gives false confidence. Report both numbers, don't just ship on vibes.

---

## 3. Use Case B — Brand Memory (per-project retrieval)

**Goal:** keep a user's 5th, 10th, 50th generated page consistent with their established voice, offers, and tone instead of treating every generation as a cold start.

**Corpus:** per-project, built automatically from existing data — every prior `Generation.html_output`, `Project.enhanced_brief`, and any brand assets uploaded (ties into the Asset Panel from the feature-expansion doc).

**Pipeline:**
1. On each successful generation, embed the enhanced brief + key extracted copy (headline, offer, tone descriptors) and store against the project.
2. On a new generation request for the same project, retrieve the top-k most relevant past entries (by recency + similarity) and inject a short "brand consistency" block into the enhancement stage: "this brand's established tone is X, prior offers used were Y, avoid contradicting Z."
3. Make this visible to the user, not silent — a small "Using brand memory from 3 past pages" indicator with the option to turn it off per generation (some users will want a clean-slate variant test).

**Note:** this is the cheapest of the three to build since the data already exists in your schema — it's mostly plumbing (embed-on-write, retrieve-on-generate), not new data acquisition.

---

## 4. Use Case C — Winning Angle Retrieval

**Goal:** ground generation in proven direct-response structures by vertical, instead of one generic prompt trying to handle supplements, SaaS, e-commerce, and coaching equally well.

**Corpus:** a curated library of angle frameworks/structures tagged by vertical and by psychological mechanism (scarcity, social proof, problem-agitate-solve, before/after, comparison-table-driven) — this needs to be built/curated, it doesn't already exist in your data like Use Case B does. Start small (10–15 frameworks per major vertical) and expand based on what verticals your users actually generate for.

**Pipeline:**
1. Classify the incoming ad hook's vertical + likely mechanism at the `enhance_prompt` stage (a cheap classification call, not full retrieval).
2. Retrieve the 2–3 closest-matching frameworks for that vertical/mechanism.
3. Inject as structural guidance (not verbatim copy) into the generation prompt — this shapes structure and psychological approach, not literal wording, to avoid every generated page in the same vertical converging on identical phrasing.

**Risk to watch:** if retrieval isn't diverse enough, pages in the same vertical will start looking templated to each other — the opposite of what the visual-identity work in the fix spec is trying to solve. Deliberately retrieve with some randomness/diversity sampling among close matches, not just the single top result every time.

---

## 5. Shared Infrastructure (build once, use for all three)

| Component | Choice | Why |
|---|---|---|
| Vector store | pgvector on existing Postgres | Avoids adding a new infra dependency (Pinecone/Weaviate/etc.) for a corpus size that doesn't need it yet — revisit only if corpus/query volume outgrows Postgres. |
| Embedding model | Whatever your Gemini tier already gives you access to (check current embedding model ID the same way the fix spec flagged checking Flash model IDs — embedding model names drift too) | Keeps you on one provider/billing relationship instead of adding a second API dependency. |
| Chunking | Structure-aware (by policy section, by generation record, by framework), not fixed-token windows | Fixed-window chunking on structured docs like policy text is where most naive RAG implementations quietly lose quality. |
| Retrieval | Start with plain cosine similarity top-k; add a reranking pass only for Use Case A (compliance) where precision matters most | Don't over-engineer retrieval for B and C where the corpora are small and the cost of a slightly-off match is low. |

---

## 6. Build Order

1. **Use Case A (compliance)** — safety-critical, cleanest to evaluate independently, most directly fixes an already-identified risk.
2. **Use Case B (brand memory)** — cheapest to build, immediate quality-of-life win, no new corpus needed.
3. **Use Case C (winning angles)** — highest curation effort (needs a real framework library built by hand first), do this once A and B are stable and you have bandwidth to build/maintain the corpus.

Don't build all three in parallel — the shared infra (pgvector setup, chunking pipeline, retrieval API) is the same work either way, so sequencing lets you validate the pattern on the highest-value case before extending it.