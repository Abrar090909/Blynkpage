import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './PricingModal.css';

export default function PricingModal({ onClose, reason }) {
  const { authFetch, user } = useAuth();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/billing/me/');
      if (res.ok) {
        const data = await res.json();
        setSub(data);
      }
    } catch (err) {
      console.error('Failed to load subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planKey) => {
    try {
      setUpgradingPlan(planKey);
      setError(null);
      const res = await authFetch('/api/billing/checkout/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: planKey,
          success_url: window.location.origin + '/',
          cancel_url: window.location.origin + '/',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start upgrade session');
      }

      if (data.url) {
        if (data.session_id === 'test_simulated_session') {
          // Development simulated upgrade
          await fetchSubscription();
          setUpgradingPlan(null);
        } else {
          window.location.href = data.url;
        }
      }
    } catch (err) {
      setError(err.message);
      setUpgradingPlan(null);
    }
  };

  const handleManage = async () => {
    try {
      const res = await authFetch('/api/billing/portal/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: window.location.origin + '/' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError('Could not open billing portal.');
    }
  };

  return (
    <div className="pricing-overlay" onClick={onClose}>
      <div className="pricing-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pricing-close-btn" onClick={onClose} aria-label="Close modal">
          &times;
        </button>

        <div className="pricing-header">
          {reason === 'quota_exceeded' ? (
            <div className="quota-warning-banner">
              <span className="quota-icon">⚡</span>
              <span>You've reached your free monthly limit (3/3 generations used). Upgrade to continue building!</span>
            </div>
          ) : null}
          <h2 className="pricing-title">Scale Your Paid Ad Conversions</h2>
          <p className="pricing-sub">
            Built for direct response marketers running Meta, TikTok, and Google Ads.
          </p>

          {sub && (
            <div className="current-usage-badge">
              <span>Current Plan: <strong>{sub.plan_display || 'Free Tier'}</strong></span>
              <span className="usage-divider">·</span>
              <span>Monthly Usage: <strong>{sub.used} / {sub.limit_display}</strong> used</span>
            </div>
          )}
        </div>

        {error && <div className="pricing-error">{error}</div>}

        <div className="pricing-grid">
          {/* Free Tier */}
          <div className={`pricing-card ${sub?.plan === 'free' ? 'pricing-card--current' : ''}`}>
            <div className="pricing-card-header">
              <h3 className="plan-name">Free</h3>
              <div className="plan-price">
                <span className="price-amount">$0</span>
                <span className="price-period">/ month</span>
              </div>
              <p className="plan-desc">For testing single ad creative angles.</p>
            </div>
            <ul className="plan-features">
              <li><strong>3 free generations</strong> per month</li>
              <li>1:1 Ad Congruence & Headline match</li>
              <li>Dynamic URL headline testing</li>
              <li>Standard mobile responsiveness</li>
              <li className="feature-disabled">Custom Domains (CNAME)</li>
              <li className="feature-disabled">Meta Conversions API (CAPI)</li>
            </ul>
            <button className="plan-btn plan-btn--muted" disabled>
              {sub?.plan === 'free' ? 'Current Plan' : 'Free Tier'}
            </button>
          </div>

          {/* Starter Tier */}
          <div className={`pricing-card ${sub?.plan === 'starter' ? 'pricing-card--current' : ''}`}>
            <div className="pricing-card-header">
              <h3 className="plan-name">Starter</h3>
              <div className="plan-price">
                <span className="price-amount">$29</span>
                <span className="price-period">/ month</span>
              </div>
              <p className="plan-desc">For DTC brands testing 10–30 ad variations.</p>
            </div>
            <ul className="plan-features">
              <li><strong>30 generations</strong> per month</li>
              <li>Native COD & Lead Capture modal</li>
              <li>Custom Checkout URL forwarding (Shopify/Stripe)</li>
              <li>Version history & rollback</li>
              <li>1:1 Dynamic UTM engine</li>
              <li className="feature-disabled">Meta CAPI server forwarding</li>
            </ul>
            <button
              className="plan-btn plan-btn--primary"
              disabled={sub?.plan === 'starter' || upgradingPlan !== null}
              onClick={() => handleUpgrade('starter')}
            >
              {upgradingPlan === 'starter' ? 'Connecting to Stripe…' : sub?.plan === 'starter' ? 'Current Plan' : 'Upgrade to Starter'}
            </button>
          </div>

          {/* Pro Tier (Featured) */}
          <div className={`pricing-card pricing-card--featured ${sub?.plan === 'pro' ? 'pricing-card--current' : ''}`}>
            <div className="featured-badge">MOST POPULAR</div>
            <div className="pricing-card-header">
              <h3 className="plan-name">Pro</h3>
              <div className="plan-price">
                <span className="price-amount">$79</span>
                <span className="price-period">/ month</span>
              </div>
              <p className="plan-desc">For high-spend media buyers & agencies.</p>
            </div>
            <ul className="plan-features">
              <li><strong>Unlimited generations</strong> & chat revisions</li>
              <li><strong>Meta Pixel & CAPI server injection</strong> (iOS bypass)</li>
              <li><strong>Custom Domains & CNAME routing</strong> (drop.brand.com)</li>
              <li><strong>Real-time live analytics</strong> (views, clicks, CTR%)</li>
              <li>Native COD Order capture + CSV export</li>
              <li>Priority Gemini Flash generation queue</li>
            </ul>
            <button
              className="plan-btn plan-btn--accent"
              disabled={sub?.plan === 'pro' || upgradingPlan !== null}
              onClick={() => handleUpgrade('pro')}
            >
              {upgradingPlan === 'pro' ? 'Connecting to Stripe…' : sub?.plan === 'pro' ? 'Active Plan ✓' : 'Upgrade to Pro'}
            </button>
          </div>
        </div>

        {sub && sub.plan !== 'free' && (
          <div className="pricing-footer">
            <button className="manage-billing-btn" onClick={handleManage}>
              Manage Billing & Invoices ↗
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
