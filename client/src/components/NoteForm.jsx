import React, { useState } from 'react';
import { ingestNote } from '../services/api.js';
import { PlusCircle, Loader2 } from 'lucide-react';
import { ErrorMessage } from './ErrorMessage.jsx';

export function NoteForm({ onItemAdded }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const item = await ingestNote({ title, content });
      setTitle('');
      setContent('');
      if (onItemAdded) onItemAdded(item);
    } catch (err) {
      setError(err.message || 'Failed to submit note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ingest-form">
      <ErrorMessage message={error} onDismiss={() => setError(null)} />

      <div className="form-group">
        <label htmlFor="note-title" className="form-label">
          Title <span className="label-sub">(optional)</span>
        </label>
        <input
          id="note-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. SQLite WAL mode notes"
          className="form-input"
          disabled={submitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="note-content" className="form-label">
          Content <span className="label-required">*</span>
        </label>
        <textarea
          id="note-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste or write raw markdown/text notes here..."
          rows={4}
          required
          className="form-textarea"
          disabled={submitting}
        />
      </div>

      <div className="form-actions">
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="btn btn-primary"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="icon-spin" />
              <span>Ingesting...</span>
            </>
          ) : (
            <>
              <PlusCircle size={16} />
              <span>Add Note</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
