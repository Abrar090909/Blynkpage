"""
html_sanitizer.py — AI output security layer for Blynkpages.

All AI-generated HTML passes through this module before being saved or served.
This module is the only place where scripts are added to published pages.
"""
import re
import logging

logger = logging.getLogger(__name__)

# ─── Script & Event Handler Stripping ────────────────────────────────────────

_SCRIPT_TAG_RE = re.compile(r'<script\b[^>]*>.*?</script\s*>', re.DOTALL | re.IGNORECASE)
_INLINE_EVENT_RE = re.compile(r"""\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)""", re.IGNORECASE)


def strip_scripts(html: str) -> str:
    """Remove all <script> tags and inline on* event handlers from AI output."""
    html = _SCRIPT_TAG_RE.sub('', html)
    html = _INLINE_EVENT_RE.sub('', html)
    return html


# ─── Vetted UTM Parameter Reader ─────────────────────────────────────────────

UTM_READER_SCRIPT = (
    '<script>'
    "(function(){'use strict';"
    "var p=new URLSearchParams(window.location.search);"
    "var h=p.get('headline')||p.get('utm_content')||p.get('angle');"
    "if(h){var u=function(){var e=document.querySelector('[data-dynamic=\"headline\"]')||document.querySelector('h1');if(e)e.textContent=h;};"
    "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',u);}else{u();}}"
    "})();"
    '</script>'
)


def inject_utm_reader(html: str) -> str:
    """Re-inject the backend-controlled UTM reader after stripping model scripts."""
    if '</body>' in html:
        return html.replace('</body>', UTM_READER_SCRIPT + '\n</body>', 1)
    return html + '\n' + UTM_READER_SCRIPT


# ─── Meta Pixel Injection ─────────────────────────────────────────────────────

def inject_meta_pixel(html: str, pixel_id: str) -> str:
    """
    Inject Meta Pixel base code into the page <head>.
    Only called when user has a validated pixel_id configured.
    """
    if not pixel_id or not re.match(r'^\d{10,20}$', pixel_id.strip()):
        logger.warning('inject_meta_pixel: invalid pixel_id %r — skipping', pixel_id)
        return html

    pid = pixel_id.strip()
    snippet = (
        '\n<!-- Meta Pixel Code — Blynkpages -->\n'
        '<script>\n'
        '!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n'
        'n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;\n'
        'n.push=n;n.loaded=!0;n.version=\'2.0\';n.queue=[];t=b.createElement(e);t.async=!0;\n'
        't.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,\n'
        'document,\'script\',\'https://connect.facebook.net/en_US/fbevents.js\');\n'
        f"fbq('init','{pid}');fbq('track','PageView');\n"
        'document.addEventListener(\'DOMContentLoaded\',function(){'
        'var c=document.getElementById(\'main-cta\');'
        "if(c){c.addEventListener('click',function(){fbq('track','InitiateCheckout');});}});\n"
        '</script>\n'
        f'<noscript><img height="1" width="1" style="display:none" '
        f'src="https://www.facebook.com/tr?id={pid}&ev=PageView&noscript=1"/></noscript>\n'
        '<!-- End Meta Pixel Code -->\n'
    )

    if '</head>' in html:
        return html.replace('</head>', snippet + '</head>', 1)
    return snippet + html


# ─── Compliance Flag Detection ────────────────────────────────────────────────

_COMPLIANCE_CHECKS = [
    (
        re.compile(r'\b(\d[\d,]+)\+?\s*(customers?|creators?|brands?|reviews?|users?|orders?)\b', re.IGNORECASE),
        'AI-generated customer count',
        'Fabricated social proof number detected (e.g. "4,200+ customers"). '
        'Replace with real numbers or remove. FTC requires substantiation.',
    ),
    (
        re.compile(r'\b\d+(\.\d+)?/\d+\s*stars?\b', re.IGNORECASE),
        'AI-generated star rating',
        'Fabricated star rating detected (e.g. "4.9/5 stars"). '
        'Only include ratings backed by verified real reviews.',
    ),
    (
        re.compile(
            r'\b(FDA[- ]?approved|clinically[- ]?proven|doctor[- ]?recommended'
            r'|medically[- ]?tested|dermatologist[- ]?tested)\b',
            re.IGNORECASE,
        ),
        'Unverified health authority claim',
        'Health authority claim detected. Requires substantiation or will '
        'violate Meta ad policy and FTC regulations.',
    ),
    (
        re.compile(
            r'\b(jitter[- ]?free|zero[- ]?crash|no[- ]?crash|zero[- ]?acid'
            r'|acid[- ]?free|100%\s*natural|clinically\s*safe)\b',
            re.IGNORECASE,
        ),
        'Implicit health/safety claim',
        'Meta restricts health-benefit claims without substantiation. '
        'Review before publishing to a paid ad.',
    ),
]


def flag_compliance_issues(html: str) -> list:
    """
    Scan HTML for AI-invented compliance risks.
    Returns list of issues — NOT auto-blocked, surfaced to user for review.
    """
    issues = []
    seen = set()
    for pattern, issue_type, description in _COMPLIANCE_CHECKS:
        if issue_type in seen:
            continue
        m = pattern.search(html)
        if m:
            issues.append({
                'type': issue_type,
                'description': description,
                'matched_text': m.group(0)[:100],
            })
            seen.add(issue_type)
    return issues


# ─── Conversion & Lead Capture Injection ─────────────────────────────────────

def build_conversion_script(slug: str, checkout_url: str = '', enable_lead_capture: bool = True) -> str:
    """
    Builds client-side analytics beacon and high-converting checkout/lead capture handler.
    """
    script = f"""
<!-- Blynkpages Conversion Engine & Analytics -->
<script>
(function() {{
    'use strict';
    var slug = '{slug}';
    var checkoutUrl = '{checkout_url}';
    var enableLeadCapture = {'true' if enable_lead_capture else 'false'};
    var p = new URLSearchParams(window.location.search);
    var utmData = {{
        utm_source: p.get('utm_source') || '',
        utm_medium: p.get('utm_medium') || '',
        utm_campaign: p.get('utm_campaign') || p.get('angle') || p.get('headline') || '',
        utm_content: p.get('utm_content') || ''
    }};

    // 1. Fire Page View Beacon
    function sendBeacon(eventType) {{
        var payload = JSON.stringify(Object.assign({{}}, utmData, {{ event_type: eventType }}));
        if (navigator.sendBeacon) {{
            navigator.sendBeacon('/p/' + slug + '/track/', new Blob([payload], {{ type: 'application/json' }}));
        }} else {{
            fetch('/p/' + slug + '/track/', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: payload }});
        }}
    }}
    sendBeacon('view');

    document.addEventListener('DOMContentLoaded', function() {{
        // Track CTA clicks
        document.addEventListener('click', function(e) {{
            var el = e.target.closest('#main-cta, .cta-btn, [data-action="buy"], a[href="#"], button.buy-now');
            if (el) {{
                sendBeacon('click');
            }}
        }});

        // If custom checkout URL is configured, forward with UTMs
        if (checkoutUrl) {{
            var ctaElements = document.querySelectorAll('#main-cta, .cta-btn, [data-action="buy"], a[href="#"]');
            ctaElements.forEach(function(el) {{
                el.addEventListener('click', function(ev) {{
                    ev.preventDefault();
                    try {{
                        var target = new URL(checkoutUrl, window.location.href);
                        p.forEach(function(val, key) {{ target.searchParams.set(key, val); }});
                        window.location.href = target.toString();
                    }} catch(err) {{
                        window.location.href = checkoutUrl;
                    }}
                }});
            }});
        }} else if (enableLeadCapture) {{
            // Create and inject quick COD / lead order modal
            injectOrderModal(slug, utmData);
        }}
    }});

    function injectOrderModal(pageSlug, utm) {{
        var style = document.createElement('style');
        style.textContent = `
            .bp-modal-backdrop {{ position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 99999; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .bp-modal-backdrop.open {{ display: flex; animation: bpFadeIn 0.2s ease; }}
            .bp-modal-card {{ background: #111116; border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; width: 100%; max-width: 440px; padding: 24px; color: #fff; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); position: relative; }}
            .bp-modal-close {{ position: absolute; top: 16px; right: 16px; background: none; border: none; color: #a1a1aa; font-size: 20px; cursor: pointer; padding: 4px; }}
            .bp-modal-title {{ font-size: 20px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em; color: #fff; }}
            .bp-modal-sub {{ font-size: 13px; color: #a1a1aa; margin: 0 0 20px; }}
            .bp-form-group {{ margin-bottom: 14px; text-align: left; }}
            .bp-form-group label {{ display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; margin-bottom: 6px; }}
            .bp-form-input {{ width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 14px; font-family: inherit; }}
            .bp-form-input:focus {{ outline: none; border-color: #8b5cf6; }}
            .bp-btn-submit {{ width: 100%; background: #ffffff; color: #000; font-weight: 700; font-size: 15px; padding: 12px; border-radius: 9999px; border: none; cursor: pointer; margin-top: 10px; transition: transform 0.15s ease; }}
            .bp-btn-submit:hover {{ transform: scale(1.02); }}
            .bp-success-box {{ text-align: center; padding: 20px 0; display: none; }}
            .bp-success-check {{ font-size: 44px; color: #10b981; margin-bottom: 12px; }}
            @keyframes bpFadeIn {{ from {{ opacity: 0; transform: scale(0.96); }} to {{ opacity: 1; transform: scale(1); }} }}
        `;
        document.head.appendChild(style);

        var modal = document.createElement('div');
        modal.className = 'bp-modal-backdrop';
        modal.innerHTML = `
            <div class="bp-modal-card">
                <button class="bp-modal-close" aria-label="Close">&times;</button>
                <div id="bp-form-container">
                    <h3 class="bp-modal-title">Complete Your Order</h3>
                    <p class="bp-modal-sub">Fast Cash on Delivery (COD) · Free Express Shipping</p>
                    <form id="bp-order-form">
                        <div class="bp-form-group">
                            <label>Full Name *</label>
                            <input class="bp-form-input" id="bp-name" required placeholder="e.g. Rahul Sharma" />
                        </div>
                        <div class="bp-form-group">
                            <label>Phone Number (WhatsApp) *</label>
                            <input class="bp-form-input" id="bp-phone" required type="tel" placeholder="e.g. 9876543210" />
                        </div>
                        <div class="bp-form-group">
                            <label>Delivery Address *</label>
                            <textarea class="bp-form-input" id="bp-address" rows="2" required placeholder="House/Flat, Street, City, Pincode"></textarea>
                        </div>
                        <div class="bp-form-group">
                            <label>Select Size / Variant</label>
                            <select class="bp-form-input" id="bp-variant">
                                <option value="S">Size S (Small)</option>
                                <option value="M" selected>Size M (Medium)</option>
                                <option value="L">Size L (Large)</option>
                                <option value="XL">Size XL (Extra Large)</option>
                                <option value="XXL">Size XXL (Oversized)</option>
                            </select>
                        </div>
                        <button type="submit" class="bp-btn-submit" id="bp-submit-btn">CONFIRM ORDER (COD)</button>
                    </form>
                </div>
                <div id="bp-success-box" class="bp-success-box">
                    <div class="bp-success-check">✓</div>
                    <h3 class="bp-modal-title">Order Confirmed!</h3>
                    <p class="bp-modal-sub">Thank you! Our team will contact you on WhatsApp to confirm your dispatch.</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.bp-modal-close').addEventListener('click', function() {{
            modal.classList.remove('open');
        }});
        modal.addEventListener('click', function(e) {{
            if (e.target === modal) modal.classList.remove('open');
        }});

        // Wire up CTA buttons to open this modal
        var ctaElements = document.querySelectorAll('#main-cta, .cta-btn, [data-action="buy"], a[href="#"], button.buy-now');
        ctaElements.forEach(function(el) {{
            el.addEventListener('click', function(ev) {{
                ev.preventDefault();
                modal.classList.add('open');
            }});
        }});

        // Handle order form submission
        modal.querySelector('#bp-order-form').addEventListener('submit', function(ev) {{
            ev.preventDefault();
            var submitBtn = modal.querySelector('#bp-submit-btn');
            submitBtn.textContent = 'Processing…';
            submitBtn.disabled = true;

            var payload = {{
                name: modal.querySelector('#bp-name').value,
                phone: modal.querySelector('#bp-phone').value,
                address: modal.querySelector('#bp-address').value,
                variant: modal.querySelector('#bp-variant').value,
                utm_source: utm.utm_source,
                utm_medium: utm.utm_medium,
                utm_campaign: utm.utm_campaign,
                utm_content: utm.utm_content
            }};

            fetch('/p/' + pageSlug + '/submit/', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify(payload)
            }})
            .then(function(res) {{ return res.json(); }})
            .then(function(data) {{
                modal.querySelector('#bp-form-container').style.display = 'none';
                modal.querySelector('#bp-success-box').style.display = 'block';
            }})
            .catch(function(err) {{
                alert('Order could not be processed. Please try again.');
                submitBtn.textContent = 'CONFIRM ORDER (COD)';
                submitBtn.disabled = false;
            }});
        }});
    }}
}})();
</script>
"""
    return script


# ─── Main Sanitization Pipeline ──────────────────────────────────────────────

def sanitize_for_publish(html: str, pixel_id: str = None, slug: str = '', checkout_url: str = '', enable_lead_capture: bool = True):
    """
    Full pipeline run at publish time.
    Returns (sanitized_html, compliance_flags).

    Order:
      1. Strip model-generated scripts and event handlers.
      2. Flag compliance issues for user review.
      3. Inject backend-controlled UTM reader script.
      4. Inject Meta Pixel if configured by user.
      5. Inject Conversion Engine (Analytics Beacon + Checkout Redirect or Order Modal).
    """
    sanitized = strip_scripts(html)
    flags = flag_compliance_issues(sanitized)
    sanitized = inject_utm_reader(sanitized)
    if pixel_id:
        sanitized = inject_meta_pixel(sanitized, pixel_id)

    if slug:
        conv_script = build_conversion_script(slug, checkout_url=checkout_url, enable_lead_capture=enable_lead_capture)
        if '</body>' in sanitized:
            sanitized = sanitized.replace('</body>', conv_script + '\n</body>', 1)
        else:
            sanitized = sanitized + '\n' + conv_script

    return sanitized, flags

