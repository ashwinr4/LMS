import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../../services/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import {
  ArrowLeft,
  User,
  BookOpen,
  Award,
  AlertCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Calendar,
  Mail,
  Building,
  Phone,
} from 'lucide-react';

export default function ModeratorUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const fetchUserDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/moderator/users/${userId}`);
      if (data.user) {
        if (data.user.role === 'ADMIN') {
          setError('Administrator profiles and records are confidential and restricted to Administrators only.');
          setUserData(null);
        } else {
          setUserData(data.user);
        }
      }
    } catch (err) {
      console.error('Failed to load user detail for moderator:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load user profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);

  const tabs = [
    { id: 'profile', label: 'Profile & Organization', icon: <User className="h-4 w-4" /> },
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
        <Button variant="outline" size="sm" onClick={() => navigate('/moderator/users')}>
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
            to="/moderator/users"
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
              <span className="text-app-muted font-medium flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-app-muted" />
                Full Legal Name
              </span>
              <span className="text-sm font-semibold text-app block">{userData?.name || '—'}</span>
            </div>

            <div className="space-y-1">
              <span className="text-app-muted font-medium flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-app-muted" />
                Email Address
              </span>
              <span className="text-sm font-mono font-medium text-app block">{userData?.email || '—'}</span>
            </div>

            {userData?.role !== 'USER' && (
              <div className="space-y-1">
                <span className="text-app-muted font-medium flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-app-muted" />
                  Department
                </span>
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
              <span className="text-app-muted font-medium flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-app-muted" />
                Phone Number
              </span>
              <span className="text-sm text-app font-mono block">{userData?.phone || 'Not Provided'}</span>
            </div>

            <div className="space-y-1">
              <span className="text-app-muted font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-app-muted" />
                Account Created
              </span>
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
              <span className="text-app-muted font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-app-muted" />
                Last Active
              </span>
              <span className="text-sm text-app font-mono block">
                {userData?.lastActive ? new Date(userData.lastActive).toLocaleString() : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: ENROLLED COURSES ───────────────────────── */}
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

      {/* ── TAB 3: CERTIFICATES & EXAM SUBMISSIONS ────────── */}
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
