import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { GoogleSignInButton } from '../../components/ui/GoogleSignInButton.jsx';
import {
  User,
  Mail,
  Lock,
  Building2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  Check,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export default function Register() {
  const { register, googleAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: 'Engineering',
    role: 'USER',
    password: '',
    confirmPassword: '',
    otp: '',
  });

  // Google Onboarding State for new Google accounts
  const [googleOnboarding, setGoogleOnboarding] = useState({
    active: false,
    step: 'ROLE', // 'ROLE' | 'OTP'
    credential: '',
    profile: null,
    role: 'USER',
    department: 'Engineering',
    otp: '',
    loading: false,
    cooldown: 0,
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const departments = [
    'Engineering',
    'Security',
    'Data Science',
    'Operations',
    'Product Management',
    'Administration',
  ];

  const roles = [
    { value: 'USER', label: 'Student / Learner' },
    { value: 'COURSE_CREATOR', label: 'Course Creator / Instructor' },
    { value: 'MODERATOR', label: 'Moderator / Compliance' },
    { value: 'ADMIN', label: 'Administrator / System Governance' },
  ];

  // Password Strength Evaluation
  const calculateStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 8) score += 25;
    if (/[A-Z]/.test(pwd)) score += 25;
    if (/[0-9]/.test(pwd)) score += 25;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 25;
    return score;
  };

  const pwdStrength = calculateStrength(formData.password);

  const getStrengthColor = (score) => {
    if (score <= 25) return 'bg-red-500';
    if (score <= 50) return 'bg-amber-500';
    if (score <= 75) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const handleNext = (e) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      if (!formData.name.trim() || !formData.email.trim()) {
        setError('Please fill in your full name and email address.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setStep(3);
    }
  };

  // Countdown timer for Google OTP resend cooldown
  useEffect(() => {
    let timer;
    if (googleOnboarding.cooldown > 0) {
      timer = setTimeout(() => {
        setGoogleOnboarding((prev) => ({ ...prev, cooldown: prev.cooldown - 1 }));
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [googleOnboarding.cooldown]);

  // Handle incoming redirect from Login page with Google onboarding state
  useEffect(() => {
    if (location.state?.googleOnboarding) {
      const { credential, profile } = location.state.googleOnboarding;
      setGoogleOnboarding((prev) => ({
        ...prev,
        active: true,
        step: 'ROLE',
        credential: credential || '',
        profile: profile || null,
      }));
    }
  }, [location.state]);

  const redirectByRole = (role) => {
    if (role === 'ADMIN') navigate('/admin');
    else if (role === 'COURSE_CREATOR') navigate('/creator');
    else if (role === 'MODERATOR') navigate('/moderator');
    else navigate('/catalog');
  };

  const handleGoogleAuthSuccess = (data, credential) => {
    setError(null);
    if (data.requiresOnboarding) {
      setGoogleOnboarding({
        active: true,
        step: 'ROLE',
        credential: credential || '',
        profile: data.googleProfile || null,
        role: 'USER',
        department: 'Engineering',
        otp: '',
        loading: false,
        cooldown: 0,
      });
    } else if (data.user) {
      redirectByRole(data.user.role);
    }
  };

  const handleSendGoogleOtp = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setGoogleOnboarding((prev) => ({ ...prev, loading: true }));
    try {
      const res = await googleAuth(googleOnboarding.credential, {
        role: googleOnboarding.role,
        department: googleOnboarding.department,
      });
      if (res.requiresOtp) {
        setGoogleOnboarding((prev) => ({
          ...prev,
          step: 'OTP',
          loading: false,
          cooldown: 60,
        }));
      } else if (res.user) {
        redirectByRole(res.user.role);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to dispatch verification code.');
      setGoogleOnboarding((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleVerifyGoogleOtp = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    if (!googleOnboarding.otp || googleOnboarding.otp.trim().length !== 6) {
      setError('Please enter the complete 6-digit verification passcode.');
      return;
    }
    setGoogleOnboarding((prev) => ({ ...prev, loading: true }));
    try {
      const res = await googleAuth(googleOnboarding.credential, {
        role: googleOnboarding.role,
        department: googleOnboarding.department,
        otpCode: googleOnboarding.otp.trim(),
      });
      if (res.user) {
        redirectByRole(res.user.role);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Invalid or expired verification code.');
      setGoogleOnboarding((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleResendGoogleOtp = async () => {
    if (googleOnboarding.cooldown > 0) return;
    setError(null);
    try {
      await handleSendGoogleOtp();
    } catch (err) {
      setError('Could not resend code. Please try again.');
    }
  };

  const cancelGoogleOnboarding = () => {
    setGoogleOnboarding({
      active: false,
      step: 'ROLE',
      credential: '',
      profile: null,
      role: 'USER',
      department: 'Engineering',
      otp: '',
      loading: false,
      cooldown: 0,
    });
    setError(null);
  };

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        department: formData.department,
        role: formData.role,
      });

      redirectByRole(formData.role);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-app">
            {googleOnboarding.active
              ? googleOnboarding.step === 'ROLE'
                ? 'Complete Google Account Setup'
                : 'Two-Factor Verification'
              : 'Create Qualiva Account'}
          </h1>
          <p className="text-xs sm:text-sm text-app-secondary">
            {googleOnboarding.active
              ? googleOnboarding.step === 'ROLE'
                ? 'Select your target organizational role and verify your corporate identity'
                : `Enter the 6-digit passcode dispatched to ${googleOnboarding.profile?.email || 'your email'}`
              : 'Join the Qualiva Secure Learning & Governance Network'}
          </p>
        </div>

        {/* Wizard Progress Bar */}
        {googleOnboarding.active ? (
          <div className="bg-card border border-app rounded-card p-4 shadow-md">
            <div className="flex items-center justify-between text-xs font-semibold">
              {[
                { key: 'ROLE', num: 1, title: 'Role & Department' },
                { key: 'OTP', num: 2, title: 'Email Passcode Verification' },
              ].map((s) => {
                const isCurrent = googleOnboarding.step === s.key;
                const isDone = s.key === 'ROLE' && googleOnboarding.step === 'OTP';
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-2 ${
                      isCurrent || isDone
                        ? 'text-brand-600 dark:text-brand-400 font-bold'
                        : 'text-app-muted'
                    }`}
                  >
                    <span
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-mono transition-colors ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-brand-600 text-white'
                          : 'bg-elevated text-app-muted border border-app'
                      }`}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : s.num}
                    </span>
                    <span>{s.title}</span>
                  </div>
                );
              })}
            </div>
            <div className="w-full bg-slate-200 dark:bg-dark-border h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-brand-600 h-full transition-all duration-300 rounded-full"
                style={{ width: googleOnboarding.step === 'ROLE' ? '50%' : '100%' }}
              />
            </div>
          </div>
        ) : (
          <div className="bg-card border border-app rounded-card p-4 shadow-md">
            <div className="flex items-center justify-between text-xs font-semibold">
              {[
                { num: 1, title: 'Profile & Role' },
                { num: 2, title: 'Security & Auth' },
                { num: 3, title: 'Verification' },
              ].map((s) => (
                <div
                  key={s.num}
                  className={`flex items-center gap-2 ${
                    step >= s.num
                      ? 'text-brand-600 dark:text-brand-400 font-bold'
                      : 'text-app-muted'
                  }`}
                >
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-mono transition-colors ${
                      step > s.num
                        ? 'bg-emerald-500 text-white'
                        : step === s.num
                        ? 'bg-brand-600 text-white'
                        : 'bg-elevated text-app-muted border border-app'
                    }`}
                  >
                    {step > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
                  </span>
                  <span className="hidden sm:inline">{s.title}</span>
                </div>
              ))}
            </div>

            <div className="w-full bg-slate-200 dark:bg-dark-border h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-brand-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Wizard Form Container */}
        <div className="bg-card border border-app rounded-card p-6 sm:p-8 space-y-6 shadow-md">
          {error && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5 animate-slide-up">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ────────── GOOGLE ONBOARDING FLOW ────────── */}
          {googleOnboarding.active ? (
            <div className="space-y-5 animate-fade-in">
              {/* Google Profile Card */}
              <div className="p-3.5 rounded-btn bg-slate-50 dark:bg-dark-elevated border border-app flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={googleOnboarding.profile?.avatar}
                    name={googleOnboarding.profile?.name}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-app truncate">
                      {googleOnboarding.profile?.name}
                    </p>
                    <p className="text-[11px] font-mono text-app-secondary truncate">
                      {googleOnboarding.profile?.email}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                  Google Verified
                </span>
              </div>

              {/* Step 1: Role & Department Selection */}
              {googleOnboarding.step === 'ROLE' && (
                <form onSubmit={handleSendGoogleOtp} className="space-y-4">
                  <Select
                    label="Target Role Access"
                    value={googleOnboarding.role}
                    onChange={(e) =>
                      setGoogleOnboarding((prev) => ({ ...prev, role: e.target.value }))
                    }
                    options={roles}
                  />

                  <Select
                    label="Department"
                    value={googleOnboarding.department}
                    onChange={(e) =>
                      setGoogleOnboarding((prev) => ({ ...prev, department: e.target.value }))
                    }
                    options={departments}
                  />

                  <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-btn text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                    <span>
                      To verify ownership and role provisioning, a 6-digit one-time passcode will be sent to your Google corporate email.
                    </span>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    isLoading={googleOnboarding.loading}
                    className="w-full mt-2 shadow-sm"
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Send Verification Passcode
                  </Button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={cancelGoogleOnboarding}
                      className="text-xs text-app-secondary hover:text-app transition-colors"
                    >
                      ← Cancel & Return to Standard Sign Up
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: OTP Verification */}
              {googleOnboarding.step === 'OTP' && (
                <form onSubmit={handleVerifyGoogleOtp} className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-app select-none">
                      6-Digit Verification Passcode
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="••••••"
                        value={googleOnboarding.otp}
                        onChange={(e) =>
                          setGoogleOnboarding((prev) => ({
                            ...prev,
                            otp: e.target.value.replace(/\D/g, ''),
                          }))
                        }
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
                    isLoading={googleOnboarding.loading}
                    className="w-full shadow-sm"
                    rightIcon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Verify Passcode & Enter Platform
                  </Button>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-app">
                    <button
                      type="button"
                      onClick={() =>
                        setGoogleOnboarding((prev) => ({
                          ...prev,
                          step: 'ROLE',
                          otp: '',
                        }))
                      }
                      className="text-app-muted hover:text-app transition-colors"
                    >
                      ← Change Role
                    </button>

                    <button
                      type="button"
                      onClick={handleResendGoogleOtp}
                      disabled={googleOnboarding.cooldown > 0 || googleOnboarding.loading}
                      className="text-brand-600 dark:text-brand-400 font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>
                        {googleOnboarding.cooldown > 0
                          ? `Resend Code (${googleOnboarding.cooldown}s)`
                          : 'Resend Code'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* ────────── STANDARD 3-STEP FORM ────────── */
            <>
              {/* STEP 1: Profile & Role */}
              {step === 1 && (
                <div className="space-y-5 animate-fade-in">
                  <form onSubmit={handleNext} className="space-y-4">
                    <Input
                      label="Full Name"
                      placeholder="e.g. Alex Morgan"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      leftIcon={<User className="h-4 w-4" />}
                      required
                    />

                    <Input
                      label="Corporate Email"
                      type="email"
                      placeholder="alex.morgan@qualiva.io"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      leftIcon={<Mail className="h-4 w-4" />}
                      required
                    />

                    <Select
                      label="Department"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      options={departments}
                    />

                    <Select
                      label="Target Role Access"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      options={roles}
                    />

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full mt-4"
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      Continue to Security Setup
                    </Button>
                  </form>

                  {/* Google SSO 1-Click Registration at Bottom */}
                  <div className="space-y-4 pt-1">
                    <div className="flex items-center gap-3 my-2">
                      <div className="flex-1 border-t border-slate-300 dark:border-dark-border" />
                      <span className="text-[11px] font-bold text-slate-500 dark:text-dark-text-muted uppercase tracking-wider whitespace-nowrap">
                        or sign up with
                      </span>
                      <div className="flex-1 border-t border-slate-300 dark:border-dark-border" />
                    </div>

                    <GoogleSignInButton
                      text="Sign Up with Google"
                      onAuthSuccess={handleGoogleAuthSuccess}
                      onError={(err) => setError(err)}
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Password & Auth Security */}
              {step === 2 && (
                <form onSubmit={handleNext} className="space-y-4 animate-fade-in">
                  <Input
                    label="Master Password"
                    type="password"
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    leftIcon={<Lock className="h-4 w-4" />}
                    required
                  />

                  {/* Password Strength Meter */}
                  {formData.password && (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-app-secondary">Password Security Strength</span>
                        <span className="font-mono font-semibold text-app">{pwdStrength}%</span>
                      </div>
                      <div className="w-full bg-elevated h-1.5 rounded-full overflow-hidden border border-app">
                        <div
                          className={`h-full transition-all duration-200 ${getStrengthColor(pwdStrength)}`}
                          style={{ width: `${pwdStrength}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px] text-app-muted pt-1">
                        <span className={formData.password.length >= 8 ? 'text-emerald-500 font-semibold' : ''}>
                          • At least 8 characters
                        </span>
                        <span className={/[A-Z]/.test(formData.password) ? 'text-emerald-500 font-semibold' : ''}>
                          • 1 uppercase letter
                        </span>
                        <span className={/[0-9]/.test(formData.password) ? 'text-emerald-500 font-semibold' : ''}>
                          • 1 numeric digit
                        </span>
                        <span className={/[^A-Za-z0-9]/.test(formData.password) ? 'text-emerald-500 font-semibold' : ''}>
                          • 1 special symbol
                        </span>
                      </div>
                    </div>
                  )}

                  <Input
                    label="Confirm Password"
                    type="password"
                    placeholder="••••••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    leftIcon={<Lock className="h-4 w-4" />}
                    required
                  />

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => setStep(1)}
                      leftIcon={<ArrowLeft className="h-4 w-4" />}
                      className="w-1/3"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      size="lg"
                      className="w-2/3"
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      Review Details
                    </Button>
                  </div>
                </form>
              )}

              {/* STEP 3: Summary & Confirmation */}
              {step === 3 && (
                <form onSubmit={handleCompleteRegistration} className="space-y-4 animate-fade-in">
                  <div className="p-4 rounded-btn bg-elevated border border-app space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-app">
                      <span className="text-app-secondary">Account Name</span>
                      <span className="font-bold text-app">{formData.name}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-app">
                      <span className="text-app-secondary">Corporate Email</span>
                      <span className="font-mono text-app">{formData.email}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-app">
                      <span className="text-app-secondary">Department</span>
                      <span className="text-app">{formData.department}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-app-secondary">Requested Role</span>
                      <span className="font-bold text-brand-600 dark:text-brand-400">{formData.role}</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-btn text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Zero-Trust Dual-Token security and audit logging will be activated for this profile upon creation.
                    </span>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => setStep(2)}
                      leftIcon={<ArrowLeft className="h-4 w-4" />}
                      className="w-1/3"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      size="lg"
                      isLoading={loading}
                      className="w-2/3"
                      rightIcon={<CheckCircle2 className="h-4 w-4" />}
                    >
                      Create Account
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}

          <div className="pt-4 border-t border-app text-center text-xs text-app-secondary">
            <span>Already have an account? </span>
            <Link
              to="/login"
              className="font-bold text-brand-600 dark:text-brand-400 hover:underline"
            >
              Sign In Instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
