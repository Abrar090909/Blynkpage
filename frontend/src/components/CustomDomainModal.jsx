import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './CustomDomainModal.css';

export default function CustomDomainModal({ projectId, onClose }) {
  const { authFetch } = useAuth();
  const [domainInfo, setDomainInfo] = useState(null);
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDomain();
  }, [projectId]);

  const fetchDomain = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/projects/${projectId}/custom-domain/`);
      if (res.ok) {
        const data = await res.json();
        if (data.custom_domain) {
          setDomainInfo(data.custom_domain);
          setDomainInput(data.custom_domain.domain);
        }
      }
    } catch (err) {
      console.error('Failed to load custom domain:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDomain = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setStatusMessage(null);
      const res = await authFetch(`/api/projects/${projectId}/custom-domain/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save custom domain');

      setDomainInfo(data);
      setStatusMessage('Domain added! Please configure your DNS CNAME record below.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    try {
      setVerifying(true);
      setError(null);
      setStatusMessage(null);
      const res = await authFetch(`/api/projects/${projectId}/custom-domain/verify/`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(data.message || 'Domain verified successfully!');
        await fetchDomain();
      } else {
        setError(data.message || 'DNS verification failed. Please check your CNAME settings.');
      }
    } catch (err) {
      setError('Verification check failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Remove this custom domain?')) return;
    try {
      const res = await authFetch(`/api/projects/${projectId}/custom-domain/`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDomainInfo(null);
        setDomainInput('');
        setStatusMessage('Domain removed.');
      }
    } catch (err) {
      setError('Failed to remove domain.');
    }
  };

  return (
    <div className="domain-overlay" onClick={onClose}>
      <div className="domain-modal" onClick={(e) => e.stopPropagation()}>
        <div className="domain-header">
          <div>
            <h2 className="domain-title">Custom Domain & Branding</h2>
            <p className="domain-sub">Serve your landing page on your own branded subdomain</p>
          </div>
          <button className="domain-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {error && <div className="domain-error">{error}</div>}
        {statusMessage && <div className="domain-status-box">{statusMessage}</div>}

        <div className="domain-body">
          <form className="domain-form" onSubmit={handleSaveDomain}>
            <label className="domain-label">Subdomain Name</label>
            <div className="domain-input-group">
              <input
                type="text"
                className="domain-input"
                placeholder="e.g. drop.yourbrand.com or buy.brand.store"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                required
              />
              <button type="submit" className="domain-save-btn" disabled={saving}>
                {saving ? 'Saving…' : domainInfo ? 'Update' : 'Add Domain'}
              </button>
            </div>
          </form>

          {domainInfo && (
            <div className="dns-instructions-card">
              <div className="dns-status-row">
                <span className="dns-status-label">DNS Status:</span>
                <span className={`dns-status-tag dns-status--${domainInfo.status}`}>
                  {domainInfo.status === 'active' ? 'ACTIVE & ROUTING ✓' : 'PENDING CNAME'}
                </span>
                {domainInfo.status !== 'active' && (
                  <button className="dns-verify-btn" onClick={handleVerify} disabled={verifying}>
                    {verifying ? 'Checking DNS…' : 'Verify CNAME Now'}
                  </button>
                )}
              </div>

              <div className="dns-table-box">
                <div className="dns-row dns-row--header">
                  <span>Type</span>
                  <span>Host / Name</span>
                  <span>Points To (Target)</span>
                  <span>TTL</span>
                </div>
                <div className="dns-row">
                  <code>CNAME</code>
                  <code>{domainInfo.domain.split('.')[0]}</code>
                  <code>cname.blynkpages.com</code>
                  <span>Automatic (300s)</span>
                </div>
              </div>

              <p className="dns-help-text">
                Add the CNAME record above in your domain registrar (GoDaddy, Namecheap, Cloudflare, AWS Route53).
                Traffic will automatically route to your published page once verified.
              </p>

              <button className="domain-remove-btn" onClick={handleDelete}>
                Remove Custom Domain
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
