import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { GoogleSignInButton } from '../../components/ui/GoogleSignInButton.jsx';
import { api } from '../../services/api.js';
import {
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';

export default function Login() {
  const { login, verifyLoginOtp, resendOtp, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('CREDENTIALS'); // 'CREDENTIALS' | 'OTP'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Password Reset Request Modal State
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleRequestPasswordReset = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetMsg(null);
    try {
      const res = await api.post('/auth/request-password-reset', { email: resetEmail.trim() });
      setResetMsg({ type: 'success', text: res.data.message || 'Password reset request submitted. An administrator has been notified.' });
    } catch (err) {
      setResetMsg({ type: 'error', text: err.response?.data?.message || 'Failed to submit reset request.' });
    } finally {
      setResetLoading(false);
    }
  };

  const redirectByRole = (role) => {
    const from = location.state?.from?.pathname;
    if (from) {
      navigate(from, { replace: true });
      return;
    }
    if (role === 'ADMIN') navigate('/admin');
    else if (role === 'COURSE_CREATOR') navigate('/creator');
    else if (role === 'MODERATOR') navigate('/moderator');
    else navigate('/courses');
  };

  // Step 1: Submit email & password -> Triggers OTP dispatch
  const handleSubmitCredentials = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.requiresOtp) {
        setStep('OTP');
        setResendCooldown(60);
        setSuccessMsg(`Verification passcode dispatched to ${email}`);
      } else if (data.user) {
        redirectByRole(data.user.role);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      if (serverMsg) {
        setError(serverMsg);
      } else if (err.response?.status === 500 || err.response?.status === 502 || err.response?.status === 503) {
        setError('Server is reconnecting. Please click Verify & Continue again in a moment.');
      } else {
        setError(err.message || 'Invalid email or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit 6-digit OTP passcode
  const handleSubmitOtp = async (e) => {
    e.preventDefault();
    setError(null);
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }
    setLoading(true);
    try {
      const data = await verifyLoginOtp(email, otp.trim());
      redirectByRole(data.user.role);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Invalid verification code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await resendOtp(email);
      setSuccessMsg('A fresh verification code has been dispatched to your email.');
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend code. Please try again.');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header Title */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-app">
            {step === 'CREDENTIALS' ? 'Sign In to Qualiva' : 'Two-Factor Authentication'}
          </h1>
          <p className="text-xs sm:text-sm text-app-secondary">
            {step === 'CREDENTIALS'
              ? 'Enterprise Module Management & Certified Learning'
              : 'Enter the 6-digit passcode dispatched to your email'}
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-card border border-app rounded-card p-6 sm:p-8 space-y-5 shadow-md">
          {error && (
            <div
              className={`p-3.5 rounded-btn text-xs flex items-start gap-2.5 animate-slide-up border ${
                error.toLowerCase().includes('temporary password')
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {error.toLowerCase().includes('temporary password') ? (
                <KeyRound className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {successMsg && !error && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-btn text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2.5 animate-slide-up">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* STEP 1: Email & Password */}
          {step === 'CREDENTIALS' && (
            <div className="space-y-5 animate-fade-in">
              <form onSubmit={handleSubmitCredentials} className="space-y-4">
                <Input
                  label="Corporate Email Address"
                  type="email"
                  placeholder="name@organisation.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                  autoFocus
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-app-secondary">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                    />
                    <span>Remember active session</span>
                  </label>

                  <span
                    onClick={() => {
                      setResetEmail(email);
                      setResetMsg(null);
                      setResetModalOpen(true);
                    }}
                    className="text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </span>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  isLoading={loading}
                  className="w-full mt-2 shadow-sm"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  Verify & Continue
                </Button>
              </form>

              {/* Balanced 3-Part Divider & Google SSO at Bottom */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-300 dark:border-dark-border" />
                  <span className="text-[11px] font-bold text-slate-500 dark:text-dark-text-muted uppercase tracking-wider whitespace-nowrap">
                    or continue with
                  </span>
                  <div className="flex-1 border-t border-slate-300 dark:border-dark-border" />
                </div>

                <GoogleSignInButton
                  onAuthSuccess={(data, credential) => {
                    if (data.requiresOnboarding) {
                      navigate('/register', {
                        state: {
                          googleOnboarding: {
                            credential,
                            profile: data.googleProfile,
                          },
                        },
                      });
                    } else if (data.user) {
                      redirectByRole(data.user.role);
                    }
                  }}
                  onError={(err) => setError(err)}
                />
              </div>

              <div className="pt-4 border-t border-app text-center text-xs text-app-secondary">
                <span>Don't have an account yet? </span>
                <Link
                  to="/register"
                  className="font-bold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Create Account
                </Link>
              </div>
            </div>
          )}

          {/* STEP 2: 6-Digit 2FA OTP Passcode */}
          {step === 'OTP' && (
            <form onSubmit={handleSubmitOtp} className="space-y-5 animate-fade-in">
              <div className="p-3 bg-slate-50 dark:bg-dark-elevated rounded-btn border border-slate-200 dark:border-dark-border flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="text-xs">
                  <span className="text-app-muted block">Passcode dispatched to:</span>
                  <span className="font-mono font-bold text-app truncate block">{email}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-app select-none">
                  6-Digit Verification Code
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[10px] font-mono text-2xl font-black h-12 rounded-btn border border-slate-300 dark:border-dark-border bg-white dark:bg-dark-elevated text-app focus:border-brand-500 focus:ring-1 focus:ring-brand-500 shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    autoFocus
                    required
                  />
                </div>
                <p className="text-[11px] text-app-muted text-center">
                  Valid for 10 minutes. Check your inbox or spam folder.
                </p>
              </div>

              <Button
                type="submit"
                size="lg"
                isLoading={loading}
                className="w-full shadow-sm"
                rightIcon={<KeyRound className="h-4 w-4" />}
              >
                Verify & Enter Dashboard
              </Button>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-app">
                <button
                  type="button"
                  onClick={() => {
                    setStep('CREDENTIALS');
                    setOtp('');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-app-muted hover:text-app transition-colors"
                >
                  ← Back to Login
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0}
                  className="text-brand-600 dark:text-brand-400 font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend Code'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Password Reset Request Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Request Administrator Credential Reset"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRequestPasswordReset} className="space-y-4">
          <p className="text-xs text-app-secondary">
            Enter your enterprise email address. An alert will be dispatched to Platform Administrators in real-time to review your identity and issue temporary credentials.
          </p>

          {resetMsg && (
            <div
              className={`p-3 rounded-btn text-xs border ${
                resetMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
              }`}
            >
              {resetMsg.text}
            </div>
          )}

          <Input
            label="Enterprise Email Address"
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="user@enterprise.com"
            required
            leftIcon={<Mail className="h-4 w-4" />}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setResetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={resetLoading}
              leftIcon={<KeyRound className="h-4 w-4" />}
            >
              Submit Reset Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
