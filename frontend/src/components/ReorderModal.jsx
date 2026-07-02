import React, { useState } from 'react';
import { reordersApi } from '../api';
import { useAuth } from '../context/AuthContext';

export default function ReorderModal({ product, onClose, onSuccess }) {
  const { username } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) return;
    setLoading(true);
    setError(null);
    try {
      await reordersApi.create({ product_id: product.id, quantity_requested: qty, requested_by: username });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create reorder');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Raise Reorder</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">x</button>
        </div>
        <div className="modal-body">
          <p className="modal-product-name">{product.title}</p>
          <p className="text-muted">
            Current stock: <strong>{product.internal_stock}</strong>
            {product.threshold != null && (
              <> &nbsp;|&nbsp; Threshold: <strong>{product.threshold}</strong></>
            )}
          </p>
          <form onSubmit={handleSubmit}>
            <label className="form-label">
              Quantity to order
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="input"
                autoFocus
                required
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button type="submit" disabled={loading || parseInt(quantity) < 1} className="btn btn-primary">
                {loading ? 'Submitting...' : 'Submit Reorder'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
