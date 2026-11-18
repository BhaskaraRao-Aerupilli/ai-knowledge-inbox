import React from 'react';
import { Clock, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export function StatusBadge({ status }) {
  switch (status) {
    case 'pending':
      return (
        <span className="badge badge-pending">
          <Clock size={12} className="icon-pulse" />
          <span>Pending</span>
        </span>
      );
    case 'processing':
      return (
        <span className="badge badge-processing">
          <RefreshCw size={12} className="icon-spin" />
          <span>Processing</span>
        </span>
      );
    case 'completed':
      return (
        <span className="badge badge-completed">
          <CheckCircle2 size={12} />
          <span>Ready</span>
        </span>
      );
    case 'failed':
      return (
        <span className="badge badge-failed">
          <AlertCircle size={12} />
          <span>Failed</span>
        </span>
      );
    default:
      return <span className="badge">{status}</span>;
  }
}
