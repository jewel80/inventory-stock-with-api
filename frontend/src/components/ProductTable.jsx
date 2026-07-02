import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import ThresholdEditor from './ThresholdEditor';
import ReorderModal from './ReorderModal';

export default function ProductTable({ products, onProductUpdate, onReorderCreated }) {
  const [reorderTarget, setReorderTarget] = useState(null);

  return (
    <>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Internal Stock</th>
              <th>Supplier Stock</th>
              <th>Threshold</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">No products found.</td>
              </tr>
            )}
            {products.map(product => (
              <tr key={product.id}>
                <td>
                  <div className="product-cell">
                    {product.thumbnail_url && (
                      <img src={product.thumbnail_url} alt="" className="product-thumb" />
                    )}
                    <span className="product-title">{product.title}</span>
                  </div>
                </td>
                <td>{product.brand || <span className="text-muted">—</span>}</td>
                <td><span className="category-tag">{product.category}</span></td>
                <td className="stock-cell">{product.internal_stock}</td>
                <td className="stock-cell text-muted">{product.supplier_stock}</td>
                <td>
                  <ThresholdEditor product={product} onUpdate={onProductUpdate} />
                </td>
                <td><StatusBadge status={product.status} /></td>
                <td>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setReorderTarget(product)}
                  >
                    Reorder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reorderTarget && (
        <ReorderModal
          product={reorderTarget}
          onClose={() => setReorderTarget(null)}
          onSuccess={onReorderCreated}
        />
      )}
    </>
  );
}
