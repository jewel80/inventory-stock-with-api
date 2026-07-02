import React, { useState, useEffect, useCallback } from 'react';
import { dashboardApi, productsApi, syncApi } from '../api';
import ProductTable from '../components/ProductTable';
import Toast from '../components/Toast';

function SummaryCard({ label, value, accent }) {
  return (
    <div className={`summary-card${accent ? ` accent-${accent}` : ''}`}>
      <div className="summary-value">{value}</div>
      <div className="summary-label">{label}</div>
    </div>
  );
}

const LIMIT = 20;

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ status: 'all', category: 'all', search: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await dashboardApi.getSummary();
      setSummary(data);
    } catch {
      // non-blocking; summary is secondary to the table
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.category !== 'all') params.category = filters.category;
      if (filters.search) params.search = filters.search;
      const { data } = await productsApi.list(params);
      setProducts(data.products);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadSummary();
    productsApi.getCategories().then(({ data }) => setCategories(data)).catch(() => {});
  }, [loadSummary]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  async function handleSync() {
    setSyncing(true);
    try {
      const { data } = await syncApi.run();
      setToast({
        type: 'success',
        message: `Sync complete: ${data.created} created, ${data.updated} updated${data.errors?.length ? ` (${data.errors.length} errors)` : ''}`,
      });
      await loadSummary();
      await loadProducts();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'Sync failed — check server logs' });
    } finally {
      setSyncing(false);
    }
  }

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleProductUpdate(updated) {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
    loadSummary();
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <h1>Dashboard</h1>
        <button onClick={handleSync} disabled={syncing} className="btn btn-primary">
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {summary && (
        <div className="summary-grid">
          <SummaryCard label="Total Products" value={summary.totalProducts} />
          <SummaryCard label="Low Stock" value={summary.lowStockCount} accent="warning" />
          <SummaryCard label="Out of Stock" value={summary.outOfStockCount} accent="danger" />
          <SummaryCard label="Open Reorders" value={summary.openReordersCount} accent="info" />
          <div className="summary-card accent-subtle">
            <div className="summary-value summary-value-sm">
              {summary.lastSync
                ? new Date(summary.lastSync.finished_at).toLocaleString()
                : 'Never'}
            </div>
            <div className="summary-label">Last Sync</div>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search by name or brand..."
          value={filters.search}
          onChange={e => handleFilterChange('search', e.target.value)}
          className="input filter-search"
        />
        <select
          value={filters.status}
          onChange={e => handleFilterChange('status', e.target.value)}
          className="select"
        >
          <option value="all">All statuses</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
        <select
          value={filters.category}
          onChange={e => handleFilterChange('category', e.target.value)}
          className="select"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="result-count text-muted">{total} product{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="loading">Loading products...</div>
      ) : (
        <>
          <ProductTable
            products={products}
            onProductUpdate={handleProductUpdate}
            onReorderCreated={loadSummary}
          />
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-ghost btn-sm"
              >
                Prev
              </button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-ghost btn-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
