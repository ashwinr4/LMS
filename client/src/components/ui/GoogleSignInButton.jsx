import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';

export function GoogleSignInButton({ onAuthSuccess, onError, text = 'Continue with Google' }) {
  const { googleAuth } = useAuth();
  const { theme } = useTheme();
  const googleBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1063461174979-v1s5a3e5dn8c25v4m12rnidg6p9pl2h2.apps.googleusercontent.com';

  const isDark = theme === 'dark';

  const handleCredentialResponse = async (response) => {
    setLoading(true);
    try {
      if (response && response.credential) {
        const data = await googleAuth(response.credential);
        if (onAuthSuccess) onAuthSuccess(data, response.credential);
      } else {
        throw new Error('No Google credential returned.');
      }
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      if (onError) onError(err.response?.data?.message || err.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let pollInterval = null;

    function renderGoogleButton() {
      if (!isMounted || !googleBtnRef.current) return false;
      try {
        if (window.google?.accounts?.id) {
          googleBtnRef.current.innerHTML = '';

          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: isDark ? 'filled_black' : 'outline',
            size: 'large',
            type: 'standard',
            text: text?.toLowerCase().includes('sign up') ? 'signup_with' : 'signin_with',
            shape: 'pill',
            width: 240,
            logo_alignment: 'left',
          });
          return true;
        }
      } catch (err) {
        console.warn('Google GSI render error:', err);
      }
      return false;
    }

    // Check if script is already fully loaded
    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else {
      // If script tag doesn't exist, inject it
      const existingScript = document.getElementById('google-gsi-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) renderGoogleButton();
        };
        document.body.appendChild(script);
      }

      // Robust fallback polling in case script is in DOM but initializing asynchronously
      let attempts = 0;
      pollInterval = setInterval(() => {
        attempts++;
        if (renderGoogleButton() || attempts > 50) {
          clearInterval(pollInterval);
        }
      }, 80);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [clientId, isDark, text]);

  const handleFallbackClick = () => {
    try {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt();
      }
    } catch (err) {
      console.warn('Google prompt fallback:', err);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Official Google GSI Render Target with theme key and color-scheme isolation */}
      <div
        key={theme}
        style={{ colorScheme: 'light' }}
        className="w-full flex justify-center items-center min-h-[44px]"
      >
        <div ref={googleBtnRef} className="flex justify-center w-full min-h-[44px]" />
      </div>

      {/* Modern Fallback Button (visible if GSI wrapper takes time or customized) */}
      <noscript>
        <button
          type="button"
          onClick={handleFallbackClick}
          disabled={loading}
          className="w-full h-10 px-4 rounded-full border border-app bg-card hover:bg-elevated transition-all flex items-center justify-center gap-3 text-xs font-bold text-app shadow-xs"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{loading ? 'Authenticating...' : text}</span>
        </button>
      </noscript>
    </div>
  );
}
