import React, { useState } from 'react';
import { ingestUrl } from '../services/api.js';
import { Globe, Loader2 } from 'lucide-react';
import { ErrorMessage } from './ErrorMessage.jsx';

export function UrlForm({ onItemAdded }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const item = await ingestUrl({ title, url });
      setTitle('');
      setUrl('');
      if (onItemAdded) onItemAdded(item);
    } catch (err) {
      setError(err.message || 'Failed to submit URL');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ingest-form">
      <ErrorMessage message={error} onDismiss={() => setError(null)} />

      <div className="form-group">
        <label htmlFor="url-title" className="form-label">
          Title <span className="label-sub">(optional)</span>
        </label>
        <input
          id="url-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Documentation"
          className="form-input"
          disabled={submitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="url-input" className="form-label">
          URL <span className="label-required">*</span>
        </label>
        <input
          id="url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          required
          className="form-input"
          disabled={submitting}
        />
      </div>

      <div className="form-actions">
        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="btn btn-primary"
        >
          {submitting ? (
            <>
              <Loader2 size={15} className="icon-spin" />
              <span>Fetching...</span>
            </>
          ) : (
            <>
              <Globe size={15} />
              <span>Add URL</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
