# Policy Document Corpus

Drop ad platform policy documents here before running `load_policy_docs`.

---

## Where to get the policy text

### Meta Ad Policies
1. Go to https://www.facebook.com/policies/ads/
2. Select all text on the page and copy, or use a browser extension to export as plain text.
3. Save as `meta_ad_policy.txt` in this directory.

### TikTok Ads Policy
1. Go to https://ads.tiktok.com/help/article/advertising-policies-overview
2. Copy the full policy text.
3. Save as `tiktok_ad_policy.txt` in this directory.

### Internal Rejected Copy (optional, highest value)
Create a file `rejected_copy.txt` with examples of real ad copy that was rejected.
Format:
```
## Rejected Example: Health claim without substantiation
Copy: "Our supplement is FDA-approved and clinically proven to boost testosterone by 40%."
Reason: Fabricated FDA claim, no substantiation.

## Rejected Example: Invented social proof
Copy: "Join 14,200+ satisfied customers..."
Reason: Number fabricated, not backed by real data.
```

---

## Loading the corpus

```bash
# Preview what chunks will be created (dry run, no DB writes):
python manage.py load_policy_docs --source backend/corpus/meta_ad_policy.txt --platform meta --dry-run

# Load Meta policy:
python manage.py load_policy_docs --source backend/corpus/meta_ad_policy.txt --platform meta

# Load TikTok policy:
python manage.py load_policy_docs --source backend/corpus/tiktok_ad_policy.txt --platform tiktok

# Load internal rejected copy:
python manage.py load_policy_docs --source backend/corpus/rejected_copy.txt --platform internal

# Full reload of Meta chunks (clear + re-embed):
python manage.py load_policy_docs --clear-platform meta --source backend/corpus/meta_ad_policy.txt --platform meta
```

---

## Evaluation set

Per the spec: track **precision** and **recall** against a labeled set before relying on the
compliance checker in production. Aim for 30–50 examples.

Create `evaluation_set.json`:
```json
[
  {
    "claim": "Join 4,200+ satisfied customers",
    "expected_severity": "red",
    "note": "Fabricated social proof number"
  },
  {
    "claim": "Free shipping on all orders",
    "expected_severity": "green",
    "note": "No compliance risk"
  }
]
```

Run the compliance checker against it and measure:
- **Precision**: of claims flagged red/yellow, what fraction are true violations?
- **Recall**: of true violations, what fraction were caught?

A checker with high false-positive rate gets ignored. A low-recall one gives false confidence.
Don't ship until you've measured both on at least 30 real examples.

---

## Files in this directory

| File | Platform | Status |
|------|----------|--------|
| `meta_ad_policy.txt` | Meta | ❌ Not yet added — see instructions above |
| `tiktok_ad_policy.txt` | TikTok | ❌ Not yet added |
| `rejected_copy.txt` | Internal | ❌ Not yet added |
| `evaluation_set.json` | N/A | ❌ Not yet added |
