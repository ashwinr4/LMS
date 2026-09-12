import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../services/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { ShieldCheck, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

export function MustChangePasswordModal() {
  const { user, updateUser } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!user?.mustChangePassword) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        newPassword: newPassword.trim(),
      });
      setSuccess('Your permanent password has been saved.');
      setTimeout(() => {
        updateUser({ mustChangePassword: false });
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-card border border-app rounded-card max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-btn bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-app">Set Permanent Password</h2>
            <p className="text-xs text-app-secondary mt-1 leading-relaxed">
              Your account is using a temporary password assigned by an administrator. Please establish your new permanent password to secure your account.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-btn text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New Permanent Password"
            type="password"
            placeholder="••••••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
            autoFocus
          />

          <Input
            label="Confirm New Password"
            type="password"
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
          />

          <div className="pt-2">
            <Button
              type="submit"
              isLoading={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold"
              leftIcon={<ShieldCheck className="h-4 w-4" />}
            >
              Update Password & Continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
