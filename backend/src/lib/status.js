function computeStatus(internalStock, threshold) {
  if (internalStock === 0) return 'out_of_stock';
  if (threshold != null && internalStock <= threshold) return 'low_stock';
  return 'in_stock';
}

module.exports = { computeStatus };
