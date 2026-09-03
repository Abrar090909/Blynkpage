import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './OrdersDrawer.css';

export default function OrdersDrawer({ projectId, project, onClose, onProjectUpdated }) {
  const { authFetch } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState(project?.checkout_url || '');
  const [savingCheckout, setSavingCheckout] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, [projectId]);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/projects/${projectId}/leads/`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCheckoutUrl = async (e) => {
    e.preventDefault();
    try {
      setSavingCheckout(true);
      const res = await authFetch(`/api/projects/${projectId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_url: checkoutUrl.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (onProjectUpdated) onProjectUpdated(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save checkout URL:', err);
    } finally {
      setSavingCheckout(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await authFetch(`/api/projects/${projectId}/leads/export/`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-leads-${project?.name || projectId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error('CSV export failed:', err);
    }
  };

  return (
    <div className="orders-overlay" onClick={onClose}>
      <div className="orders-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="orders-drawer-header">
          <div>
            <h2 className="orders-title">Orders & Lead Conversions</h2>
            <p className="orders-sub">Captured from live ad traffic on your published page</p>
          </div>
          <div className="orders-header-actions">
            {leads.length > 0 && (
              <button className="btn-export-csv" onClick={handleExportCSV} title="Download CSV spreadsheet">
                ↓ Export CSV ({leads.length})
              </button>
            )}
            <button className="orders-close-btn" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        {/* Custom Checkout Routing Box */}
        <div className="orders-config-box">
          <h4 className="config-title">Destination & Conversion Action</h4>
          <p className="config-desc">
            Want clicks to go to your existing Shopify cart, Stripe payment link, or WhatsApp instead of the built-in COD form?
          </p>
          <form className="config-form" onSubmit={handleSaveCheckoutUrl}>
            <input
              type="url"
              className="config-input"
              placeholder="e.g. https://yourbrand.com/cart/43921... or https://buy.stripe.com/..."
              value={checkoutUrl}
              onChange={(e) => setCheckoutUrl(e.target.value)}
            />
            <button type="submit" className="config-btn" disabled={savingCheckout}>
              {savingCheckout ? 'Saving…' : saveSuccess ? 'Saved ✓' : 'Save URL'}
            </button>
          </form>
          {checkoutUrl ? (
            <p className="config-status-note">
              ✓ Direct Redirect active: CTA clicks will forward to this checkout URL with UTM ad tracking preserved.
            </p>
          ) : (
            <p className="config-status-note">
              ✓ Built-in COD Order Drawer active: Visitors can order directly on the page without leaving.
            </p>
          )}
        </div>

        {/* Orders Table */}
        <div className="orders-content">
          {loading ? (
            <div className="orders-loading">Loading captured orders…</div>
          ) : leads.length === 0 ? (
            <div className="orders-empty">
              <div className="empty-icon">📦</div>
              <h3>No Orders Captured Yet</h3>
              <p>
                When you publish your page and visitors submit their details or order via Cash on Delivery, their name, WhatsApp number, address, and selected variant will appear here instantly.
              </p>
            </div>
          ) : (
            <div className="orders-table-wrapper">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>WhatsApp / Phone</th>
                    <th>Variant</th>
                    <th>Address</th>
                    <th>Ad Angle (UTM)</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td className="lead-name">
                        <strong>{l.name}</strong>
                        {l.email && <div className="lead-email">{l.email}</div>}
                      </td>
                      <td>
                        <a href={`https://wa.me/${l.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="whatsapp-link">
                          {l.phone} ↗
                        </a>
                      </td>
                      <td><span className="variant-tag">{l.variant || 'Standard'}</span></td>
                      <td className="lead-address">{l.address || '—'}</td>
                      <td>
                        <span className="utm-tag">{l.utm_campaign || l.utm_source || 'Direct'}</span>
                      </td>
                      <td className="lead-date">
                        {new Date(l.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
