import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function ErrorMessage({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="error-banner" role="alert">
      <AlertTriangle size={16} className="error-icon" />
      <span className="error-text">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="btn-icon" aria-label="Dismiss error">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
