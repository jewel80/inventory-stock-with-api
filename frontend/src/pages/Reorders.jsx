import React, { useState, useEffect, useCallback } from 'react';
import { reordersApi } from '../api';
import StatusBadge from '../components/StatusBadge';
import Toast from '../components/Toast';

const STATUS_ADVANCE_LABEL = {
  requested: 'Approve',
  approved: 'Mark Ordered',
};

const ALL_STATUSES = ['all', 'requested', 'approved', 'ordered', 'received'];

export default function Reorders() {
  const [reorders, setReorders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await reordersApi.list(params);
      setReorders(data);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleAdvance(id) {
    try {
      await reordersApi.advanceStatus(id);
      setToast({ type: 'success', message: 'Status advanced' });
      load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to update status' });
    }
  }

  async function handleReceive(id) {
    try {
      await reordersApi.receive(id);
      setToast({ type: 'success', message: 'Reorder received — stock updated' });
      load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to receive reorder' });
    }
  }

  return (
    <div className="page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <h1>Reorders</h1>
        <div className="filter-tabs">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading reorders...</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Requested By</th>
                <th>Created</th>
                <th>Received</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reorders.length === 0 && (
                <tr><td colSpan={8} className="empty-row">No reorders found.</td></tr>
              )}
              {reorders.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="product-title">{r.product.title}</div>
                    <div className="text-muted text-sm">Stock: {r.product.internal_stock}</div>
                  </td>
                  <td><span className="category-tag">{r.product.category}</span></td>
                  <td className="stock-cell">{r.quantity_requested}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.requested_by}</td>
                  <td className="text-muted text-sm">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="text-muted text-sm">
                    {r.received_at ? new Date(r.received_at).toLocaleString() : '—'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      {STATUS_ADVANCE_LABEL[r.status] && (
                        <button
                          onClick={() => handleAdvance(r.id)}
                          className="btn btn-secondary btn-sm"
                        >
                          {STATUS_ADVANCE_LABEL[r.status]}
                        </button>
                      )}
                      {r.status === 'ordered' && (
                        <button
                          onClick={() => handleReceive(r.id)}
                          className="btn btn-success btn-sm"
                        >
                          Receive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
