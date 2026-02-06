import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7011/api';

const anonymousApi = axios.create({
  baseURL: `${API_URL}/anonymous`,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add anonymous token to requests if available
anonymousApi.interceptors.request.use(
  (config) => {
    // Get token from sessionStorage based on the join code
    // The join code should be stored in the request config or we extract from URL
    const joinCode = sessionStorage.getItem('currentJoinCode');
    if (joinCode) {
      const token = sessionStorage.getItem(`anonymousToken_${joinCode}`);
      if (token) {
        config.headers['X-Anonymous-Token'] = token;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const anonymousService = {
  // Get session by join code (public)
  getSessionByCode: (code) => anonymousApi.get(`/session/${code}`),

  // Join a session anonymously (public)
  joinSession: (joinCode, displayName) =>
    anonymousApi.post('/join', { joinCode, displayName }),

  // Submit a response (requires token)
  submitResponse: (questionId, answerText, responseTime = null) =>
    anonymousApi.post('/response', { questionId, answerText, responseTime }),

  // Check if already responded to a question (requires token)
  getMyResponse: (questionId) => anonymousApi.get(`/my-response/${questionId}`)
};

// Helper to set the current join code for token lookup
export const setCurrentJoinCode = (code) => {
  sessionStorage.setItem('currentJoinCode', code);
};

// Helper to store anonymous token
export const storeAnonymousToken = (joinCode, token) => {
  sessionStorage.setItem(`anonymousToken_${joinCode}`, token);
};

// Helper to get anonymous token
export const getAnonymousToken = (joinCode) => {
  return sessionStorage.getItem(`anonymousToken_${joinCode}`);
};

// Helper to store display name
export const storeDisplayName = (joinCode, name) => {
  sessionStorage.setItem(`displayName_${joinCode}`, name);
};

// Helper to get display name
export const getDisplayName = (joinCode) => {
  return sessionStorage.getItem(`displayName_${joinCode}`);
};

export default anonymousApi;
