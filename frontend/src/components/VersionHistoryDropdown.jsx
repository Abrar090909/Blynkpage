import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import './VersionHistoryDropdown.css';

export default function VersionHistoryDropdown({ projectId, onVersionRestored, isStreaming }) {
  const { authFetch } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (projectId) {
      fetchVersions();
    }
  }, [projectId, isStreaming]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/projects/${projectId}/generations/`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (err) {
      console.error('Failed to fetch generations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (genId) => {
    try {
      setRestoringId(genId);
      const res = await authFetch(`/api/projects/${projectId}/generations/${genId}/restore/`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.project && onVersionRestored) {
          onVersionRestored(data.project);
        }
        await fetchVersions();
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Failed to restore generation:', err);
    } finally {
      setRestoringId(null);
    }
  };

  const currentVersion = versions.find((v) => v.is_current) || versions[0];
  const label = currentVersion ? `v${currentVersion.version_number}` : 'v1';

  return (
    <div className="version-dropdown-container" ref={dropdownRef}>
      <button
        id="version-history-toggle"
        className="version-pill-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="View iteration history or rollback to a previous version"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
        <span>{label}</span>
        <svg className={`version-arrow ${isOpen ? 'version-arrow--open' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="version-menu-popup">
          <div className="version-menu-header">
            <span className="version-menu-title">Iteration History</span>
            <span className="version-count-badge">{versions.length} versions</span>
          </div>

          <div className="version-list-scroll">
            {versions.map((ver) => {
              const dateStr = ver.created_at
                ? new Date(ver.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <div
                  key={ver.id}
                  className={`version-item ${ver.is_current ? 'version-item--current' : ''}`}
                >
                  <div className="version-item-meta">
                    <div className="version-item-top">
                      <span className="version-badge">v{ver.version_number}</span>
                      {ver.is_current && <span className="version-current-tag">ACTIVE</span>}
                      <span className="version-time">{dateStr}</span>
                    </div>
                    {ver.prompt_preview && (
                      <p className="version-prompt-snippet">"{ver.prompt_preview}"</p>
                    )}
                  </div>

                  {!ver.is_current && (
                    <button
                      className="version-restore-btn"
                      disabled={restoringId !== null}
                      onClick={() => handleRestore(ver.id)}
                      title="Revert page to this version"
                    >
                      {restoringId === ver.id ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
