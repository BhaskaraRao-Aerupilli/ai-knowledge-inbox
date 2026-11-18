import React from 'react';
import ReactMarkdown from 'react-markdown';
import { SourceCard } from './SourceCard.jsx';
import { AlertCircle } from 'lucide-react';

export function AnswerView({ question, answer, sources = [] }) {
  if (!answer) return null;

  const isInsufficient =
    sources.length === 0 &&
    answer.toLowerCase().includes('does not contain enough information');

  return (
    <div className="answer-container">
      <div className="answer-header">
        <div className="answer-badge">
          <span>Answer</span>
        </div>
        <div className="query-recap">"{question}"</div>
      </div>

      <div className="answer-body">
        {isInsufficient ? (
          <div className="insufficient-alert">
            <AlertCircle size={15} />
            <p>{answer}</p>
          </div>
        ) : (
          <div className="markdown-prose">
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div className="sources-section">
          <div className="sources-title">
            <span>Sources ({sources.length})</span>
          </div>
          <div className="sources-grid">
            {sources.map((src, i) => (
              <SourceCard key={`${src.id}-${src.label || i}`} source={src} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
