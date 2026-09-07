import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem('esmms_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [accessToken, setAccessToken] = useState(() => {
    return sessionStorage.getItem('esmms_access_token') || null;
  });

  const [loading, setLoading] = useState(true);

  const saveAuth = useCallback((userData, token) => {
    setUser(userData);
    setAccessToken(token);
    sessionStorage.setItem('esmms_user', JSON.stringify(userData));
    sessionStorage.setItem('esmms_access_token', token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    sessionStorage.removeItem('esmms_user');
    sessionStorage.removeItem('esmms_access_token');
    delete api.defaults.headers.common.Authorization;
  }, []);

  // Check current session on initial mount
  useEffect(() => {
    async function initAuth() {
      const token = sessionStorage.getItem('esmms_access_token');
      if (token) {
        try {
          api.defaults.headers.common.Authorization = `Bearer ${token}`;
          const { data } = await api.get('/auth/me');
          if (data.user) {
            setUser(data.user);
            sessionStorage.setItem('esmms_user', JSON.stringify(data.user));
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
      sessionStorage.setItem('esmms_user', JSON.stringify(merged));
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
