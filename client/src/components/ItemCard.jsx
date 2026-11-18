import React, { useState } from 'react';
import { StatusBadge } from './StatusBadge.jsx';
import { FileText, Globe, Trash2, ExternalLink, AlertOctagon, Layers } from 'lucide-react';

export function ItemCard({ item, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (window.confirm(`Delete "${item.title || 'this item'}" and all its vector chunks?`)) {
      setDeleting(true);
      try {
        await onDelete(item.id);
      } catch {
        setDeleting(false);
      }
    }
  };

  const formattedDate = new Date(item.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`item-card item-card-${item.processing_status}`}>
      <div className="item-header">
        <div className="item-title-wrapper">
          {item.source_type === 'url' ? (
            <span className="source-icon-badge url-badge" title="Web URL">
              <Globe size={14} />
            </span>
          ) : (
            <span className="source-icon-badge note-badge" title="Note">
              <FileText size={14} />
            </span>
          )}
          <h4 className="item-title" title={item.title}>
            {item.title || 'Untitled Item'}
          </h4>
        </div>

        <div className="item-actions">
          <StatusBadge status={item.processing_status} />
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-delete"
            title="Delete item"
            aria-label="Delete item"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="item-link"
        >
          <span>{item.source_url}</span>
          <ExternalLink size={12} />
        </a>
      )}

      {item.preview && (
        <p className="item-preview">{item.preview}</p>
      )}

      {item.processing_status === 'failed' && item.error_message && (
        <div className="item-failure-box">
          <AlertOctagon size={14} />
          <span>{item.error_message}</span>
        </div>
      )}

      <div className="item-footer">
        <span className="item-time">{formattedDate}</span>
        {item.chunk_count > 0 && (
          <span className="item-chunks">
            <Layers size={12} />
            <span>{item.chunk_count} {item.chunk_count === 1 ? 'chunk' : 'chunks'}</span>
          </span>
        )}
      </div>
    </div>
  );
}
