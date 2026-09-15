import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import { secureStorage, STORAGE_KEYS } from '../utils/secureStorage.js';

const AuthContext = createContext(null);

function getStoredUser() {
  return secureStorage.getJSON(STORAGE_KEYS.USER);
}

function getStoredToken() {
  return secureStorage.getItem(STORAGE_KEYS.TOKEN);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [accessToken, setAccessToken] = useState(getStoredToken);
  const [loading, setLoading] = useState(true);

  const saveAuth = useCallback((userData, token) => {
    setUser(userData);
    setAccessToken(token);
    secureStorage.setItem(STORAGE_KEYS.USER, userData);
    secureStorage.setItem(STORAGE_KEYS.TOKEN, token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    secureStorage.clear();
    delete api.defaults.headers.common.Authorization;
  }, []);

  // Sync session across multiple browser tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEYS.USER) {
        setUser(secureStorage.getJSON(STORAGE_KEYS.USER));
      }
      if (e.key === STORAGE_KEYS.TOKEN) {
        const decrypted = secureStorage.getItem(STORAGE_KEYS.TOKEN);
        setAccessToken(decrypted);
        if (decrypted) {
          api.defaults.headers.common.Authorization = `Bearer ${decrypted}`;
        } else {
          delete api.defaults.headers.common.Authorization;
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Check current session on initial mount
  useEffect(() => {
    async function initAuth() {
      const token = getStoredToken();
      if (token) {
        try {
          api.defaults.headers.common.Authorization = `Bearer ${token}`;
          const { data } = await api.get('/auth/me');
          if (data.user) {
            setUser(data.user);
            secureStorage.setItem(STORAGE_KEYS.USER, data.user);
          } else {
            clearAuth();
          }
        } catch {
          // Token might have expired, attempt refresh
          try {
            const { data } = await api.post('/auth/refresh');
            if (data.accessToken && data.user) {
              saveAuth(data.user, data.accessToken);
            } else {
              clearAuth();
            }
          } catch {
            clearAuth();
          }
        }
      } else {
        clearAuth();
      }
      setLoading(false);
    }
    initAuth();
  }, [clearAuth, saveAuth]);

  // Step 1 Login: Initiates 2FA OTP Challenge
  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.user && data.accessToken) {
      saveAuth(data.user, data.accessToken);
    }
    return data;
  };

  // Step 2 Login: Verifies 6-digit OTP & issues session
  const verifyLoginOtp = async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    if (data.user && data.accessToken) {
      saveAuth(data.user, data.accessToken);
    }
    return data;
  };

  // Resend 2FA Passcode
  const resendOtp = async (email) => {
    const { data } = await api.post('/auth/request-otp', { email });
    return data;
  };

  // Register New User
  const register = async (userData) => {
    const { data } = await api.post('/auth/register', userData);
    if (data.user && data.accessToken) {
      saveAuth(data.user, data.accessToken);
    }
    return data;
  };

  // Google SSO Authentication
  const googleAuth = async (credential, extra = {}) => {
    const payload =
      typeof extra === 'object' && extra !== null && !extra.email
        ? { credential, ...extra }
        : { credential, profile: extra };
    const { data } = await api.post('/auth/google', payload);
    if (data.user && data.accessToken) {
      saveAuth(data.user, data.accessToken);
    }
    return data;
  };

  // Logout
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Proceed with local cleanup regardless
    } finally {
      clearAuth();
    }
  };

  const updateUser = useCallback((updatedUserData) => {
    setUser((prev) => {
      const merged = { ...prev, ...updatedUserData };
      try {
        localStorage.setItem('esmms_user', JSON.stringify(merged));
        sessionStorage.setItem('esmms_user', JSON.stringify(merged));
      } catch {}
      return merged;
    });
  }, []);

  const value = {
    user,
    accessToken,
    loading,
    isAuthenticated: !!user,
    login,
    verifyLoginOtp,
    resendOtp,
    register,
    googleAuth,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
