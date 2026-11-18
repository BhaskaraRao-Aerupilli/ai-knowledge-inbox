import React from 'react';
import { ItemCard } from './ItemCard.jsx';
import { EmptyState } from './EmptyState.jsx';
import { RefreshCw, Loader2 } from 'lucide-react';

export function ItemList({ items, loading, isPolling, onRefresh, onDelete }) {
  if (loading && items.length === 0) {
    return (
      <div className="loading-state">
        <Loader2 size={24} className="icon-spin text-accent" />
        <p>Loading knowledge items...</p>
      </div>
    );
  }

  return (
    <div className="item-list-container">
      <div className="item-list-header">
        <div className="item-list-heading">
          <h3>Saved Knowledge</h3>
          <span className="count-pill">{items.length}</span>
        </div>

        <div className="item-list-actions">
          {isPolling && (
            <span className="polling-indicator">
              <RefreshCw size={12} className="icon-spin text-accent" />
              <span>Indexing...</span>
            </span>
          )}
          <button
            onClick={onRefresh}
            className="btn-refresh"
            title="Refresh knowledge base"
            aria-label="Refresh items"
          >
            <RefreshCw size={14} className={loading ? 'icon-spin' : ''} />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Inbox is empty"
          description="Submit a plain text note or a web URL above to build your private retrieval knowledge base."
        />
      ) : (
        <div className="items-stack">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
