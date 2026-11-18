import React from 'react';
import { Loader2 } from 'lucide-react';

export function StatusBadge({ status }) {
  switch (status) {
    case 'pending':
      return (
        <span className="badge badge-pending">
          <span>Pending</span>
        </span>
      );
    case 'processing':
      return (
        <span className="badge badge-processing">
          <Loader2 size={11} className="icon-spin" />
          <span>Processing</span>
        </span>
      );
    case 'completed':
      return (
        <span className="badge badge-completed">
          <span>Ready</span>
        </span>
      );
    case 'failed':
      return (
        <span className="badge badge-failed">
          <span>Failed</span>
        </span>
      );
    default:
      return <span className="badge">{status}</span>;
  }
}
