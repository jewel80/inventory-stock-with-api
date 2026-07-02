import React from 'react';

const CONFIG = {
  in_stock:    { label: 'In Stock',    cls: 'badge-success' },
  low_stock:   { label: 'Low Stock',   cls: 'badge-warning' },
  out_of_stock:{ label: 'Out of Stock',cls: 'badge-danger' },
  requested:   { label: 'Requested',   cls: 'badge-secondary' },
  approved:    { label: 'Approved',    cls: 'badge-primary' },
  ordered:     { label: 'Ordered',     cls: 'badge-info' },
  received:    { label: 'Received',    cls: 'badge-success' },
};

export default function StatusBadge({ status }) {
  const cfg = CONFIG[status] || { label: status, cls: 'badge-secondary' };
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
}
