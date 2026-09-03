import React, { useState } from 'react';
import './PasswordResetModal.css';

export default function PasswordResetModal({ onClose, initialUid, initialToken, onPasswordResetSuccess }) {
  const [step, setStep] = useState(initialUid && initialToken ? 'confirm' : 'request');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [devLink, setDevLink] = useState(null);
  const [error, setError] = useState(null);

  const handleRequest = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      const res = await fetch('/api/auth/password-reset/request/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      setMessage(data.detail || 'Reset link dispatched.');
      if (data.dev_reset_url) {
        setDevLink(data.dev_reset_url);
      }
    } catch (err) {
      setError('Could not process reset request. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/auth/password-reset/confirm/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: initialUid,
          token: initialToken,
          new_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password.');

      setMessage(data.detail);
      setTimeout(() => {
        if (onPasswordResetSuccess) onPasswordResetSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-overlay" onClick={onClose}>
      <div className="reset-modal" onClick={(e) => e.stopPropagation()}>
        <button className="reset-close-btn" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <h2 className="reset-title">
          {step === 'confirm' ? 'Set New Password' : 'Reset Your Password'}
        </h2>
        <p className="reset-sub">
          {step === 'confirm'
            ? 'Enter your new strong password below.'
            : 'Enter your email address and we will send you a secure link to reset your password.'}
        </p>

        {error && <div className="reset-error">{error}</div>}
        {message && <div className="reset-success">{message}</div>}

        {step === 'request' ? (
          <form onSubmit={handleRequest}>
            <div className="reset-form-group">
              <label>Account Email</label>
              <input
                type="email"
                required
                className="reset-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="reset-submit-btn" disabled={loading}>
              {loading ? 'Sending link…' : 'Send Reset Link'}
            </button>

            {devLink && (
              <div className="reset-dev-box">
                <span className="reset-dev-badge">DEV ENVIRONMENT</span>
                <p>Click below to test the reset flow directly:</p>
                <a href={devLink} className="reset-dev-link">
                  Open Reset Page ↗
                </a>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleConfirm}>
            <div className="reset-form-group">
              <label>New Password (min 8 chars)</label>
              <input
                type="password"
                required
                className="reset-input"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="reset-form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                required
                className="reset-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="reset-submit-btn" disabled={loading}>
              {loading ? 'Saving password…' : 'Update Password & Login'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
