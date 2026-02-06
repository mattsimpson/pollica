import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7011/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  register: (userData) => api.post('/auth/register', userData),
  login: (credentials) => api.post('/auth/login', credentials),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.post('/auth/change-password', data)
};

export const sessionService = {
  createSession: (sessionData) => api.post('/sessions', sessionData),
  getMySessions: () => api.get('/sessions/my-sessions'),
  getActiveSessions: () => api.get('/sessions/active'),
  getSession: (sessionId) => api.get(`/sessions/${sessionId}`),
  updateSession: (sessionId, updates) => api.put(`/sessions/${sessionId}`, updates),
  selectQuestion: (sessionId, questionId) => api.put(`/sessions/${sessionId}/select-question`, { questionId })
};

export const questionService = {
  createQuestion: (questionData) => api.post('/questions', questionData),
  getQuestions: (sessionId) => api.get(`/questions?sessionId=${sessionId}`),
  getActiveQuestions: (sessionId) => api.get(`/questions/active?sessionId=${sessionId}`),
  getQuestion: (questionId) => api.get(`/questions/${questionId}`),
  updateQuestion: (questionId, updates) => api.put(`/questions/${questionId}`, updates),
  deleteQuestion: (questionId) => api.delete(`/questions/${questionId}`),
  closeQuestion: (questionId) => api.put(`/questions/${questionId}/close`),
  cancelCloseQuestion: (questionId) => api.put(`/questions/${questionId}/cancel-close`),
  reopenQuestion: (questionId) => api.put(`/questions/${questionId}/reopen`)
};

export const responseService = {
  getResponsesByQuestion: (questionId) => api.get(`/responses/question/${questionId}`),
  getResponseStats: (questionId) => api.get(`/responses/question/${questionId}/stats`)
};

export const adminService = {
  getUsers: () => api.get('/admin/users'),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  resetPassword: (id, newPassword) => api.post(`/admin/users/${id}/reset-password`, { newPassword }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getAllSessions: (params) => api.get('/admin/sessions', { params })
};

export default api;
