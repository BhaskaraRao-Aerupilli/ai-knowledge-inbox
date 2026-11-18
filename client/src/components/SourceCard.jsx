import React from 'react';
import { ExternalLink, FileText, Globe } from 'lucide-react';

export function SourceCard({ source }) {
  const { label, title, url, snippet, similarity, sourceType } = source;
  const similarityPercent = Math.round((similarity || 0) * 100);

  return (
    <div className="source-card">
      <div className="source-header">
        <div className="source-title-group">
          <span className="source-label">[{label}]</span>
          {sourceType === 'url' ? <Globe size={14} className="source-type-icon" /> : <FileText size={14} className="source-type-icon" />}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-title-link"
              title={title}
            >
              <span>{title}</span>
              <ExternalLink size={12} />
            </a>
          ) : (
            <span className="source-title">{title}</span>
          )}
        </div>
        <span className="similarity-pill" title="Cosine similarity score">
          {similarityPercent}% match
        </span>
      </div>
      <p className="source-snippet">"{snippet}"</p>
    </div>
  );
}
