import api from './client';

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
};

export const syncApi = {
  run: () => api.post('/sync'),
};

export const dashboardApi = {
  getSummary: () => api.get('/dashboard/summary'),
};

export const productsApi = {
  list: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  setThreshold: (id, threshold) => api.patch(`/products/${id}/threshold`, { threshold }),
  getCategories: () => api.get('/products/categories'),
};

export const reordersApi = {
  list: (params) => api.get('/reorders', { params }),
  create: (data) => api.post('/reorders', data),
  advanceStatus: (id) => api.patch(`/reorders/${id}/status`),
  receive: (id) => api.post(`/reorders/${id}/receive`),
};
