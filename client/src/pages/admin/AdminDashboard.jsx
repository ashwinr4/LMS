import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  Users,
  BookOpen,
  CheckSquare,
  Activity,
  ArrowRight,
  UserPlus,
  FileSpreadsheet,
  CheckCircle2,
  LogIn,
  LogOut,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

function formatRelativeTime(dateString) {
  if (!dateString) return 'Just now';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getHumanActivity(log) {
  const actor = log.actorName || log.actorEmail || 'System';
  const action = log.action || '';

  if (action.startsWith('USER_LOGIN')) {
    return {
      message: `${actor} logged into the portal`,
      subtext: log.details || (log.actorEmail ? `Account: ${log.actorEmail}` : undefined),
      icon: <LogIn className="h-4 w-4 text-brand-500" />,
    };
  }

  switch (action) {
    case 'USER_LOGOUT':
      return {
        message: `${actor} logged out`,
        subtext: undefined,
        icon: <LogOut className="h-4 w-4 text-app-muted" />,
      };
    case 'COURSE_LIFECYCLE_UPDATED':
      return {
        message: `Course lifecycle updated`,
        subtext: log.resource,
        icon: <BookOpen className="h-4 w-4 text-amber-500" />,
      };
    case 'MODULE_CREATED':
      return {
        message: `New module created by ${actor}`,
        subtext: log.resource,
        icon: <BookOpen className="h-4 w-4 text-emerald-500" />,
      };
    case 'ENROLLMENT_REQUEST':
      return {
        message: `New enrollment application submitted`,
        subtext: log.resource,
        icon: <CheckSquare className="h-4 w-4 text-brand-500" />,
      };
    case 'ENROLLMENT_FORWARD':
      return {
        message: `Instructor endorsed student enrollment`,
        subtext: log.resource,
        icon: <CheckSquare className="h-4 w-4 text-purple-500" />,
      };
    case 'ENROLLMENT_APPROVE':
      return {
        message: `Admin authorized enrollment`,
        subtext: log.resource,
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      };
    case 'PASSWORD_RESET_REQUESTED':
    case 'PASSWORD_RESET_COMPLETED':
      return {
        message: `Password reset by ${actor}`,
        subtext: undefined,
        icon: <ShieldCheck className="h-4 w-4 text-blue-500" />,
      };
    default:
      return {
        message: action ? action.replace(/_/g, ' ') : 'Platform operation',
        subtext: log.details || log.resource || (log.actorEmail && `By ${log.actorEmail}`),
        icon: <Activity className="h-4 w-4 text-app-muted" />,
      };
  }
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    stats: {
      totalUsers: 0,
      activeModules: 0,
      underReviewModules: 0,
      pendingApprovals: 0,
      todayActivityCount: 0,
    },
    recentApprovals: [],
    recentActivity: [],
  });

  const fetchDashboardSummary = useCallback(async () => {
    try {
      const res = await api.get('/admin/dashboard-summary');
      if (res.data?.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard summary:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardSummary();
  }, [fetchDashboardSummary]);

  // Real-time socket event listener to keep counts fresh
  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => {
      fetchDashboardSummary();
    };
    socket.on('admin_new_request', handleRefresh);
    socket.on('chat_announcement', handleRefresh);
    return () => {
      socket.off('admin_new_request', handleRefresh);
      socket.off('chat_announcement', handleRefresh);
    };
  }, [socket, fetchDashboardSummary]);

  const stats = data?.stats || {};
  const recentApprovals = data?.recentApprovals || [];
  const recentActivity = data?.recentActivity || [];

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Enterprise Administration"
        description="System governance, user provisioning, role assignments, enrollment approvals, and live platform activity."
        badge={<StatusBadge status="ACTIVE" label="System Live" size="xs" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/admin/users')}
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-emerald-500" />}
            >
              Bulk Excel Import
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/admin/users')}
              leftIcon={<UserPlus className="h-4 w-4" />}
            >
              Add User
            </Button>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Provisioned Users',
            val: loading ? '...' : stats.totalUsers,
            change: 'Active enterprise accounts',
            changeColor: 'text-emerald-600 dark:text-emerald-400',
            icon: <Users className="h-6 w-6 text-purple-500 shrink-0" />,
          },
          {
            label: 'Active Course Modules',
            val: loading ? '...' : stats.activeModules,
            change: `${stats.underReviewModules || 0} in review / draft`,
            changeColor: 'text-brand-600 dark:text-brand-400',
            icon: <BookOpen className="h-6 w-6 text-brand-500 shrink-0" />,
          },
          {
            label: 'Pending Approvals',
            val: loading ? '...' : stats.pendingApprovals,
            change: stats.pendingApprovals > 0 ? 'Requires action' : 'All queues cleared',
            hasAlert: stats.pendingApprovals > 0,
            changeColor: stats.pendingApprovals > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
            icon: <CheckSquare className="h-6 w-6 text-amber-500 shrink-0" />,
          },
          {
            label: 'Platform Activity Today',
            val: loading ? '...' : stats.todayActivityCount,
            change: 'Total member actions & logins',
            changeColor: 'text-teal-600 dark:text-teal-400',
            icon: <Activity className="h-6 w-6 text-teal-500 shrink-0" />,
          },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm transition-all hover:border-brand-500/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-app-secondary">{kpi.label}</span>
              {kpi.icon}
            </div>
            <div className="text-3xl font-black text-app font-mono tracking-tight">{kpi.val}</div>
            <div className="flex items-center gap-1.5">
              {kpi.hasAlert && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
              <span className={`text-xs font-semibold ${kpi.changeColor}`}>{kpi.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Governance Hub */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Card: Pending Enrollment Approvals */}
        <div className="bg-card border border-app rounded-card p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-app">
            <div className="flex items-center gap-2.5">
              <h3 className="font-bold text-base text-app">Pending Enrollment Approvals</h3>
              {recentApprovals.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  Action Required
                </span>
              )}
            </div>
            <Link
              to="/admin/approvals"
              className="text-sm text-brand-600 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-app">
            {recentApprovals.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-semibold text-app">All approvals up to date</p>
                <p className="text-xs text-app-secondary">There are currently no course enrollment requests awaiting admin authorization.</p>
              </div>
            ) : (
              recentApprovals.slice(0, 3).map((req) => (
                <div
                  key={req.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-app truncate">{req.student?.name || 'Member'}</p>
                      <span className="text-xs text-app-muted font-normal truncate">• {req.student?.department || req.student?.email}</span>
                    </div>
                    <p className="text-xs text-app-secondary truncate">
                      Applied for: <span className="font-semibold text-app">{req.module?.title || 'Course Module'}</span>
                    </p>
                    <p className="text-xs text-app-muted">Submitted {formatRelativeTime(req.createdAt)}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span>Awaiting Sign-off</span>
                    </div>
                    <Link
                      to="/admin/approvals"
                      className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Review →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Card: Recent Platform Activity (Replaced Security Audit Events) */}
        <div className="bg-card border border-app rounded-card p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-app">
            <h3 className="font-bold text-base text-app">Recent Platform Activity</h3>
            <Link
              to="/admin/audit"
              className="text-sm text-brand-600 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1"
            >
              Audit Ledger <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-app">
            {recentActivity.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Activity className="h-8 w-8 text-app-muted mx-auto" />
                <p className="text-sm font-semibold text-app">No recent activity</p>
                <p className="text-xs text-app-secondary">System actions and user sign-ins will appear here in real time.</p>
              </div>
            ) : (
              recentActivity.slice(0, 3).map((log) => {
                const { message, subtext, icon } = getHumanActivity(log);
                return (
                  <div
                    key={log.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-app-secondary shrink-0">{icon}</div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-app truncate">{message}</p>
                        {subtext && <p className="text-xs text-app-secondary truncate">{subtext}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-app-muted shrink-0 font-medium">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
