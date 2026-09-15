import axios from 'axios';
import { secureStorage, STORAGE_KEYS } from '../utils/secureStorage.js';

const rawApiUrl = import.meta.env.VITE_API_URL || '';
const cleanApiUrl = rawApiUrl.replace(/\/$/, '');
const API_BASE_URL = cleanApiUrl
  ? (cleanApiUrl.endsWith('/api/v1') ? cleanApiUrl : `${cleanApiUrl}/api/v1`)
  : '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 25000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper for resilient persistent storage with fallback
const getStoredToken = () => {
  return secureStorage.getItem(STORAGE_KEYS.TOKEN);
};

const setStoredToken = (token) => {
  secureStorage.setItem(STORAGE_KEYS.TOKEN, token);
};

const clearStoredTokens = () => {
  secureStorage.clear();
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
    const currentToken = getStoredToken();

    if (
      currentToken &&
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login')
    ) {
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
        const refreshUrl = `${API_BASE_URL}/auth/refresh`;
        const { data } = await axios.post(refreshUrl, {}, { withCredentials: true });
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
