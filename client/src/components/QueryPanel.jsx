import React, { useState } from 'react';
import { askQuestion } from '../services/api.js';
import { AnswerView } from './AnswerView.jsx';
import { ErrorMessage } from './ErrorMessage.jsx';
import { Search, Loader2, HelpCircle } from 'lucide-react';

const SUGGESTIONS = [
  'How does SQLite WAL mode improve concurrency?',
  'Why is 384 dimensions used for MiniLM embeddings?',
  'How does the system defend against prompt injection?',
];

export function QueryPanel() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [lastQuestion, setLastQuestion] = useState('');

  const handleQuery = async (queryText) => {
    const q = (queryText || question).trim();
    if (!q) return;

    setLoading(true);
    setError(null);

    try {
      const data = await askQuestion(q);
      setResult(data);
      setLastQuestion(q);
    } catch (err) {
      setError(err.message || 'Failed to retrieve answer from knowledge base');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleQuery(question);
  };

  const handleSuggestionClick = (suggested) => {
    setQuestion(suggested);
    handleQuery(suggested);
  };

  return (
    <div className="query-panel">
      <div className="query-panel-header">
        <div className="query-title-wrapper">
          <HelpCircle size={20} className="text-accent" />
          <div>
            <h3>Ask Knowledge Base</h3>
            <p className="query-subtitle">
              Retrieves top semantic chunks via MiniLM embeddings and answers via Groq LLM.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="query-form">
        <div className="query-input-wrapper">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your saved notes or pages..."
            disabled={loading}
            className="query-input"
            required
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="btn btn-primary btn-query"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="icon-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>Query</span>
              </>
            )}
          </button>
        </div>
      </form>

      <div className="query-suggestions">
        <span className="suggestions-label">Try:</span>
        <div className="suggestions-list">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSuggestionClick(s)}
              disabled={loading}
              className="suggestion-pill"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError(null)} />

      {loading && !result && (
        <div className="query-searching-box">
          <Loader2 size={24} className="icon-spin text-accent" />
          <p>Scanning 384-dimensional vectors and synthesizing answer...</p>
        </div>
      )}

      {result && (
        <AnswerView
          question={lastQuestion}
          answer={result.answer}
          sources={result.sources}
        />
      )}
    </div>
  );
}
