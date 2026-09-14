import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper for resilient persistent storage with fallback
const getStoredToken = () => {
  try {
    return localStorage.getItem('esmms_access_token') || sessionStorage.getItem('esmms_access_token');
  } catch {
    return null;
  }
};

const setStoredToken = (token) => {
  try {
    localStorage.setItem('esmms_access_token', token);
    sessionStorage.setItem('esmms_access_token', token);
  } catch {}
};

const clearStoredTokens = () => {
  try {
    localStorage.removeItem('esmms_access_token');
    localStorage.removeItem('esmms_user');
    sessionStorage.removeItem('esmms_access_token');
    sessionStorage.removeItem('esmms_user');
  } catch {}
};

// Request interceptor: attaches Bearer token from storage if present
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handles 401 Unauthorized by rotating refresh token
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/login')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (token && originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        if (data.accessToken) {
          setStoredToken(data.accessToken);
          api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          }
          processQueue(null, data.accessToken);
          return api(originalRequest);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Only clear credentials if refresh endpoint definitively returned 401 (expired/revoked)
        if (refreshError.response?.status === 401) {
          clearStoredTokens();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
