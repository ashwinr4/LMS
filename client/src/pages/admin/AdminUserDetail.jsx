import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ROUTES } from '../../routes/routeMap.js';
import { api } from '../../services/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import {
  ArrowLeft,
  User,
  Shield,
  ShieldCheck,
  BookOpen,
  Award,
  CheckCircle2,
  AlertCircle,
  Clock,
  KeyRound,
  Unlock,
  ExternalLink,
  RefreshCw,
  Sliders,
  History,
} from 'lucide-react';
import { ModeratorPermissionModal, MODERATOR_MODULES } from '../../components/admin/ModeratorPermissionModal.jsx';

export default function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const activeTab = searchParams.get('tab') || 'profile';
  const setActiveTab = (tabId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tabId);
        return next;
      },
      { replace: true }
    );
  };
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permissionHistory, setPermissionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchUserDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/admin/users/${userId}`);
      if (data.user) {
        setUserData(data.user);
      }
    } catch (err) {
      console.error('Failed to load user detail:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load user profile.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissionHistory = async () => {
    if (!userId || userData?.role !== 'MODERATOR') return;
    setLoadingHistory(true);
    try {
      const { data } = await api.get(`/admin/users/${userId}/moderator-permissions/history`);
      setPermissionHistory(data.history || []);
    } catch (err) {
      console.error('Failed to load permission history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'permissions' && userData?.role === 'MODERATOR') {
      fetchPermissionHistory();
    }
  }, [activeTab, userData?.role]);

  const handleGenerateTempPassword = async () => {
    setResettingPassword(true);
    setError(null);
    setSuccess(null);
    try {
      const { data } = await api.post(`/admin/users/${userId}/reset-password`);
      setSuccess(
        data.message || `A new temporary password has been generated and dispatched to ${userData?.email}.`
      );
      setUserData((prev) => ({
        ...prev,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockUntil: null,
      }));
      setTimeout(() => setSuccess(null), 6000);
    } catch (err) {
      console.error('Failed to reset user password:', err);
      setError(err.response?.data?.message || 'Failed to generate and dispatch temporary password.');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleResetLockout = async () => {
    setUnlocking(true);
    setError(null);
    try {
      await api.put(`/admin/users/${userId}`, {
        resetLockout: true,
        status: 'ACTIVE',
      });
      setUserData((prev) => ({
        ...prev,
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockUntil: null,
      }));
      setSuccess('Account lockout released and failed attempts counter cleared.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset lockout.');
    } finally {
      setUnlocking(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile & Organization', icon: <User className="h-4 w-4" /> },
    { id: 'security', label: 'Security & Access', icon: <Shield className="h-4 w-4" /> },
    ...(userData?.role === 'MODERATOR'
      ? [
          {
            id: 'permissions',
            label: 'Moderator Permissions',
            icon: <ShieldCheck className="h-4 w-4" />,
          },
        ]
      : []),
    {
      id: 'courses',
      label: 'Enrolled Courses',
      icon: <BookOpen className="h-4 w-4" />,
      count: userData?.assignments?.length || 0,
    },
    {
      id: 'certificates',
      label: 'Certificates & Exams',
      icon: <Award className="h-4 w-4" />,
      count: userData?.certificates?.length || 0,
    },
  ];

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center text-app-muted text-sm space-y-3">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-brand-500" />
        <p>Loading user profile...</p>
      </div>
    );
  }

  if (error && !userData) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
        <h2 className="text-base font-bold text-app">User Record Unavailable</h2>
        <p className="text-xs text-app-secondary max-w-md mx-auto">{error}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.ADMIN_USERS)}>
          Return to User Directory
        </Button>
      </div>
    );
  }

  const roleLabel =
    userData?.role === 'ADMIN'
      ? 'Administrator'
      : userData?.role === 'COURSE_CREATOR'
      ? 'Course Creator'
      : userData?.role === 'MODERATOR'
      ? 'Moderator'
      : 'Learner';

  const initials = (userData?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-fade-in text-app">
      {/* ── Top Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app">
        <div className="flex items-center gap-3">
          <Link
            to={ROUTES.ADMIN_USERS}
            className="-ml-1.5 -mt-1 p-1.5 rounded text-app-muted hover:text-app hover:bg-surface-tertiary transition-colors"
            title="Return to User Directory"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          {/* Profile Picture */}
          <Avatar
            src={userData?.avatar}
            name={userData?.name}
            size="md"
          />

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-app tracking-tight">{userData?.name}</h1>
              <span className="h-3.5 w-px bg-slate-300 dark:bg-white/20 inline-block self-center mx-1" />
              <span className="text-xs text-app-secondary font-medium">{roleLabel}</span>
              <span className="h-3.5 w-px bg-slate-300 dark:bg-white/20 inline-block self-center mx-1" />
              <span className="inline-flex items-center gap-1.5 text-xs text-app-secondary">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    userData?.status === 'ACTIVE'
                      ? 'bg-emerald-500'
                      : userData?.status === 'PENDING_APPROVAL'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                />
                <span>{userData?.status === 'ACTIVE' ? 'Active' : userData?.status}</span>
              </span>
            </div>
            <p className="text-xs text-app-muted font-mono mt-0.5">{userData?.email}</p>
          </div>
        </div>
      </div>

      {/* ── Status Feedback Banners ───────────────────────── */}
      {success && (
        <div className="p-3.5 rounded-card bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-card bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-300 text-xs flex items-center gap-2.5 shadow-sm">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Navigation Tabs ───────────────────────────────── */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── TAB 1: PROFILE & ORGANIZATION (READ-ONLY) ────── */}
      {activeTab === 'profile' && (
        <div className="bg-card border border-app rounded-card p-6 space-y-6">
          <h2 className="text-sm font-bold text-app border-b border-app pb-2">
            Identity & Organizational Details
          </h2>

          <div className="grid sm:grid-cols-2 gap-y-5 gap-x-8 text-xs">
            <div className="space-y-1">
              <span className="text-app-muted font-medium block">Full Legal Name</span>
              <span className="text-sm font-semibold text-app block">{userData?.name || '—'}</span>
            </div>

            <div className="space-y-1">
              <span className="text-app-muted font-medium block">Email Address</span>
              <span className="text-sm font-mono font-medium text-app block">{userData?.email || '—'}</span>
            </div>

            {userData?.role !== 'USER' && (
              <div className="space-y-1">
                <span className="text-app-muted font-medium block">Department</span>
                <span className="text-sm text-app block">{userData?.department || 'Not Assigned'}</span>
              </div>
            )}

            <div className="space-y-1">
              <span className="text-app-muted font-medium block">System Role (RBAC)</span>
              <span className="text-sm text-app block">{roleLabel}</span>
            </div>

            <div className="space-y-1">
              <span className="text-app-muted font-medium block">Account Status</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-app">
                <span
                  className={`w-2 h-2 rounded-full ${
                    userData?.status === 'ACTIVE'
                      ? 'bg-emerald-500'
                      : userData?.status === 'PENDING_APPROVAL'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                />
                <span>{userData?.status === 'ACTIVE' ? 'Active' : userData?.status}</span>
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-app-muted font-medium block">Phone Number</span>
              <span className="text-sm text-app font-mono block">{userData?.phone || 'Not Provided'}</span>
            </div>

            <div className="space-y-1">
              <span className="text-app-muted font-medium block">Account Created</span>
              <span className="text-sm text-app block">
                {userData?.createdAt
                  ? new Date(userData.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-app-muted font-medium block">Last Active</span>
              <span className="text-sm text-app font-mono block">
                {userData?.lastActive ? new Date(userData.lastActive).toLocaleString() : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: SECURITY & CREDENTIALS ─────────────────── */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security Flags & Administrative Reset */}
          <div className="bg-card border border-app rounded-card p-6 space-y-5">
            <h2 className="text-sm font-bold text-app border-b border-app pb-2">
              Credential Controls
            </h2>

            <div className="space-y-4 max-w-xl">
              <div className="p-4 bg-elevated rounded-card border border-app space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-app">Temporary Password Status</span>
                  <span className="text-xs font-mono text-app-secondary">
                    {userData?.mustChangePassword ? 'Pending Password Reset' : 'Permanent Password Active'}
                  </span>
                </div>
                <p className="text-xs text-app-secondary leading-relaxed">
                  Generate a randomized temporary password and automatically email it to{' '}
                  <strong className="text-app">{userData?.email}</strong>. When the user logs in using
                  these credentials, they will be required to create a new permanent password immediately.
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    isLoading={resettingPassword}
                    onClick={handleGenerateTempPassword}
                    leftIcon={<KeyRound className="h-4 w-4" />}
                    className="bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                  >
                    Require Reset & Send Temporary Password
                  </Button>
                </div>
              </div>

              {userData?.failedLoginAttempts > 0 && (
                <div className="flex items-center justify-between p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-btn">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 block">
                      {userData.failedLoginAttempts} Failed Login Attempts Recorded
                    </span>
                    <span className="text-[11px] text-app-muted block">
                      Account lock will release automatically or can be reset immediately.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={unlocking}
                    onClick={handleResetLockout}
                    leftIcon={<Unlock className="h-3.5 w-3.5" />}
                  >
                    Reset Attempts
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Account Authentication Metadata */}
          <div className="bg-card border border-app rounded-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-app border-b border-app pb-2">
              Authentication Metadata
            </h2>

            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded border border-app bg-elevated space-y-1">
                <span className="text-app-muted text-[11px] uppercase tracking-wider block font-semibold">
                  Account Created
                </span>
                <span className="font-mono text-app font-medium">
                  {new Date(userData?.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="p-3 rounded border border-app bg-elevated space-y-1">
                <span className="text-app-muted text-[11px] uppercase tracking-wider block font-semibold">
                  Last Active Timestamp
                </span>
                <span className="font-mono text-app font-medium">
                  {new Date(userData?.lastActive).toLocaleString()}
                </span>
              </div>

              <div className="p-3 rounded border border-app bg-elevated space-y-1">
                <span className="text-app-muted text-[11px] uppercase tracking-wider block font-semibold">
                  Single Sign-On (Google OAuth)
                </span>
                <span className="text-app font-medium">
                  {userData?.googleId ? 'Linked (Google ID present)' : 'Standard Email & Password'}
                </span>
              </div>

              <div className="p-3 rounded border border-app bg-elevated space-y-1">
                <span className="text-app-muted text-[11px] uppercase tracking-wider block font-semibold">
                  Initial Setup Status
                </span>
                <span className="text-app font-medium">
                  {userData?.isFirstLogin ? 'Pending first initial onboarding' : 'Completed initial login'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODERATOR PERMISSIONS & GOVERNANCE TAB ──────────── */}
      {activeTab === 'permissions' && userData?.role === 'MODERATOR' && (
        <div className="space-y-6">
          {/* Active Permissions Overview */}
          <div className="bg-card border border-app rounded-card p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-app">
              <div>
                <h2 className="text-sm font-bold text-app flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  Configured Operational Permissions
                </h2>
                <p className="text-xs text-app-secondary mt-0.5">
                  Granular module capabilities authorized by platform administrators. Unticked modules remain strictly inaccessible to this Moderator.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setPermModalOpen(true)}
                leftIcon={<Sliders className="h-4 w-4" />}
              >
                Edit Permissions
              </Button>
            </div>

            {/* Modules Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MODERATOR_MODULES.map((mod) => {
                const modPerms = (() => {
                  try {
                    const parsed = typeof userData?.moderatorPermissions === 'string'
                      ? JSON.parse(userData.moderatorPermissions)
                      : userData?.moderatorPermissions;
                    return parsed?.[mod.id] || {};
                  } catch {
                    return {};
                  }
                })();

                const hasAnyActive = Object.values(modPerms).some(Boolean);
                const ModIcon = mod.icon;

                return (
                  <div
                    key={mod.id}
                    className={`p-4 rounded-btn border transition-all ${
                      hasAnyActive
                        ? 'border-brand-200 dark:border-brand-800/60 bg-surface dark:bg-dark-surface'
                        : 'border-app bg-elevated/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <div
                        className={`p-1.5 rounded ${
                          hasAnyActive
                            ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400'
                            : 'bg-elevated text-app-muted'
                        }`}
                      >
                        <ModIcon className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold text-app leading-tight">{mod.label}</h4>
                    </div>
                    <p className="text-[11px] text-app-secondary mb-3 line-clamp-2">
                      {mod.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {mod.actions.map((act) => {
                        const isGranted = Boolean(modPerms[act.id]);
                        return (
                          <span
                            key={act.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                              isGranted
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                : 'bg-elevated/60 text-app-muted border-app'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isGranted ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600'
                              }`}
                            />
                            {act.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit History Card */}
          <div className="bg-card border border-app rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-app flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-app flex items-center gap-2">
                  <History className="h-4 w-4 text-app-muted" />
                  Permission History & Audit Trail
                </h2>
                <p className="text-xs text-app-secondary mt-0.5">
                  Chronological record of permissions granted, modified, or revoked for this Moderator account.
                </p>
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={fetchPermissionHistory}
                leftIcon={<RefreshCw className={`h-3 w-3 ${loadingHistory ? 'animate-spin' : ''}`} />}
              >
                Refresh
              </Button>
            </div>

            {loadingHistory ? (
              <div className="p-8 text-center text-xs text-app-muted">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-brand-500 mb-2" />
                Loading governance audit trail...
              </div>
            ) : permissionHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-app-muted space-y-2">
                <Shield className="h-8 w-8 mx-auto text-app-muted" />
                <p>No permission adjustments recorded for this Moderator yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-app bg-elevated/50 text-[11px] uppercase tracking-wider text-app-secondary">
                      <th className="py-3 px-5 font-semibold">Timestamp</th>
                      <th className="py-3 px-5 font-semibold">Action</th>
                      <th className="py-3 px-5 font-semibold">Details / Diffs</th>
                      <th className="py-3 px-5 font-semibold">Admin Actor</th>
                      <th className="py-3 px-5 font-semibold">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {permissionHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-elevated/40 transition-colors">
                        <td className="py-3.5 px-5 font-mono text-app-muted whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-5 font-semibold text-app whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-elevated border border-app font-mono text-[10px]">
                            {item.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-app max-w-xs truncate">
                          {item.details || 'Permissions updated'}
                        </td>
                        <td className="py-3.5 px-5 text-app-secondary whitespace-nowrap">
                          {item.actor ? (
                            <div>
                              <span className="font-semibold text-app">{item.actor.name}</span>
                              <span className="text-[11px] text-app-muted block">{item.actor.email}</span>
                            </div>
                          ) : (
                            <span className="text-app-muted italic">System Automated</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 font-mono text-app-muted whitespace-nowrap">
                          {item.ipAddress || 'Internal'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal */}
          <ModeratorPermissionModal
            isOpen={permModalOpen}
            onClose={() => setPermModalOpen(false)}
            user={userData}
            onSaved={(updatedUser) => {
              setUserData(updatedUser);
              fetchPermissionHistory();
            }}
          />
        </div>
      )}

      {/* ── TAB 3: ENROLLED COURSES ───────────────────────── */}
      {activeTab === 'courses' && (
        <div className="bg-card border border-app rounded-card overflow-hidden">
          <div className="px-6 py-4 border-b border-app flex items-center justify-between">
            <h2 className="text-sm font-bold text-app">Course Enrollments & Curriculum Progress</h2>
            <span className="text-xs text-app-muted">
              {userData?.assignments?.length || 0} Total Courses
            </span>
          </div>

          {!userData?.assignments || userData.assignments.length === 0 ? (
            <div className="p-10 text-center text-xs text-app-muted space-y-2">
              <BookOpen className="h-8 w-8 mx-auto text-app-muted" />
              <p>No course enrollments found for this user.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-app bg-elevated/50 text-[11px] uppercase tracking-wider text-app-secondary">
                    <th className="py-3 px-5 font-semibold">Course</th>
                    <th className="py-3 px-5 font-semibold">Department</th>
                    <th className="py-3 px-5 font-semibold">Progress</th>
                    <th className="py-3 px-5 font-semibold">Status</th>
                    <th className="py-3 px-5 font-semibold">Enrolled Date</th>
                    <th className="py-3 px-5 font-semibold">Completed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app">
                  {userData.assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-elevated/40 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400 block">
                          {a.module?.code}
                        </span>
                        <span className="font-medium text-app block">{a.module?.title}</span>
                      </td>
                      <td className="py-3.5 px-5 text-app-secondary">
                        {a.module?.department || 'General'}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-surface-tertiary h-1.5 rounded-full overflow-hidden border border-app">
                            <div
                              className="bg-brand-600 h-full rounded-full"
                              style={{ width: `${a.progress}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-app">
                            {a.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-app-secondary">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              a.status === 'COMPLETED'
                                ? 'bg-emerald-500'
                                : a.status === 'UNDER_REVIEW'
                                ? 'bg-amber-500'
                                : 'bg-blue-500'
                            }`}
                          />
                          <span>
                            {a.status === 'UNDER_REVIEW'
                              ? 'Under Review'
                              : a.status === 'COMPLETED'
                              ? 'Completed'
                              : a.status === 'IN_PROGRESS'
                              ? 'In Progress'
                              : a.status}
                          </span>
                        </span>
                      </td>
                      <td className="py-3.5 px-5 font-mono text-app-muted">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-5 font-mono text-app-muted">
                        {a.completedAt ? new Date(a.completedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: CERTIFICATES & EXAM SUBMISSIONS ────────── */}
      {activeTab === 'certificates' && (
        <div className="space-y-6">
          {/* Issued Certificates */}
          <div className="bg-card border border-app rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-app flex items-center justify-between">
              <h2 className="text-sm font-bold text-app">Issued Certificates</h2>
              <span className="text-xs text-app-muted">
                {userData?.certificates?.length || 0} Certificates
              </span>
            </div>

            {!userData?.certificates || userData.certificates.length === 0 ? (
              <div className="p-8 text-center text-xs text-app-muted space-y-2">
                <Award className="h-8 w-8 mx-auto text-app-muted" />
                <p>No certificates issued for this user yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-app bg-elevated/50 text-[11px] uppercase tracking-wider text-app-secondary">
                      <th className="py-3 px-5 font-semibold">Certificate ID</th>
                      <th className="py-3 px-5 font-semibold">Course Title</th>
                      <th className="py-3 px-5 font-semibold">Exam Score</th>
                      <th className="py-3 px-5 font-semibold">Issue Date</th>
                      <th className="py-3 px-5 font-semibold text-right">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {userData.certificates.map((c) => (
                      <tr key={c.id} className="hover:bg-elevated/40 transition-colors">
                        <td className="py-3.5 px-5 font-mono font-bold text-brand-600 dark:text-brand-400">
                          {c.certificateCode}
                        </td>
                        <td className="py-3.5 px-5 font-medium text-app">{c.courseTitle}</td>
                        <td className="py-3.5 px-5 font-mono font-semibold text-emerald-600">
                          {c.scoreAchieved}%
                        </td>
                        <td className="py-3.5 px-5 text-app-secondary font-mono">
                          {new Date(c.issuedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <Link
                            to={`/verify?code=${c.certificateCode}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-[11px] text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                          >
                            Verify Credential <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Assessment Attempts & Scores */}
          <div className="bg-card border border-app rounded-card overflow-hidden">
            <div className="px-6 py-4 border-b border-app flex items-center justify-between">
              <h2 className="text-sm font-bold text-app">Assessment Exam Submissions</h2>
              <span className="text-xs text-app-muted">
                {userData?.submissions?.length || 0} Submissions
              </span>
            </div>

            {!userData?.submissions || userData.submissions.length === 0 ? (
              <div className="p-8 text-center text-xs text-app-muted space-y-2">
                <Clock className="h-8 w-8 mx-auto text-app-muted" />
                <p>No assessment submissions on record.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-app bg-elevated/50 text-[11px] uppercase tracking-wider text-app-secondary">
                      <th className="py-3 px-5 font-semibold">Assessment</th>
                      <th className="py-3 px-5 font-semibold">Score Achieved</th>
                      <th className="py-3 px-5 font-semibold">Passing Threshold</th>
                      <th className="py-3 px-5 font-semibold">Result</th>
                      <th className="py-3 px-5 font-semibold">Date Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {userData.submissions.map((s) => (
                      <tr key={s.id} className="hover:bg-elevated/40 transition-colors">
                        <td className="py-3.5 px-5 font-medium text-app">
                          {s.assessment?.title || 'Course Final Assessment'}
                        </td>
                        <td className="py-3.5 px-5 font-mono font-bold text-app">
                          {s.score}%
                        </td>
                        <td className="py-3.5 px-5 font-mono text-app-muted">
                          {s.assessment?.passingScore || 80}%
                        </td>
                        <td className="py-3.5 px-5">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                s.passed ? 'bg-emerald-500' : 'bg-red-500'
                              }`}
                            />
                            <span
                              className={
                                s.passed
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'text-red-600 dark:text-red-400 font-medium'
                              }
                            >
                              {s.passed ? 'Passed' : 'Failed'}
                            </span>
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-app-secondary font-mono">
                          {new Date(s.submittedAt || s.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
