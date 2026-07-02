import React, { useState } from 'react';
import { productsApi } from '../api';

export default function ThresholdEditor({ product, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(product.threshold ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const threshold = value === '' ? null : parseInt(value, 10);
      const { data } = await productsApi.setThreshold(product.id, threshold);
      onUpdate(data);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <button
        className="threshold-display"
        onClick={() => setEditing(true)}
        title="Click to set threshold"
      >
        {product.threshold != null ? product.threshold : <em className="text-muted">—</em>}
        <span className="edit-hint"> [edit]</span>
      </button>
    );
  }

  return (
    <div className="threshold-editor">
      <input
        type="number"
        min="0"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="input input-sm"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="none"
      />
      <button onClick={handleSave} disabled={loading} className="btn btn-primary btn-xs">
        {loading ? '...' : 'Save'}
      </button>
      <button onClick={() => { setEditing(false); setError(null); }} className="btn btn-ghost btn-xs">
        Cancel
      </button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
