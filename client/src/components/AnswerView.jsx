import React from 'react';
import ReactMarkdown from 'react-markdown';
import { SourceCard } from './SourceCard.jsx';
import { Sparkles, BookOpen, AlertCircle } from 'lucide-react';

export function AnswerView({ question, answer, sources = [] }) {
  if (!answer) return null;

  const isInsufficient =
    sources.length === 0 &&
    answer.toLowerCase().includes('does not contain enough information');

  return (
    <div className="answer-container">
      <div className="answer-header">
        <div className="answer-badge">
          <Sparkles size={14} />
          <span>Synthesis</span>
        </div>
        <div className="query-recap">Q: "{question}"</div>
      </div>

      <div className="answer-body">
        {isInsufficient ? (
          <div className="insufficient-alert">
            <AlertCircle size={16} />
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
            <BookOpen size={14} />
            <span>Cited Sources ({sources.length})</span>
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
