import React from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ title = 'No items found', description = 'Add your first note or URL to build your knowledge base.', icon: Icon = Inbox }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={32} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
    </div>
  );
}
