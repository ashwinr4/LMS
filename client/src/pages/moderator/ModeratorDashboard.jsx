import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  Users,
  BookOpen,
  CheckSquare,
  ShieldCheck,
  Award,
  ArrowRight,
  Sparkles,
  FileCheck2,
  Shield,
  Info,
} from 'lucide-react';

export default function ModeratorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [usersCount, setUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Parse granular moderator permissions
  const perms = (() => {
    if (!user?.moderatorPermissions) return {};
    try {
      return typeof user.moderatorPermissions === 'string'
        ? JSON.parse(user.moderatorPermissions)
        : user.moderatorPermissions;
    } catch {
      return {};
    }
  })();

  const canViewCourses = user?.role === 'ADMIN' || Boolean(perms.courses?.view);
  const canViewUsers = user?.role === 'ADMIN' || Boolean(perms.users?.view);
  const canViewTransfers = user?.role === 'ADMIN' || Boolean(perms.transfers?.view);
  const canViewEnrollments = user?.role === 'ADMIN' || Boolean(perms.enrollments?.view);

  useEffect(() => {
    fetchModeratorOverview();
  }, [user]);

  const fetchModeratorOverview = async () => {
    setLoading(true);
    try {
      const promises = [];
      if (canViewCourses) {
        promises.push(
          api.get('/moderator/courses').then((res) => {
            if (res.data?.success) setCourses(res.data.courses || []);
          }).catch(() => {})
        );
      }
      if (canViewUsers) {
        promises.push(
          api.get('/moderator/users?limit=1').then((res) => {
            if (res.data?.success) setUsersCount(res.data.pagination?.total || 0);
          }).catch(() => {})
        );
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    } catch (err) {
      console.error('Moderator dashboard overview error:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasAnyScope = canViewCourses || canViewUsers || canViewTransfers || canViewEnrollments;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Moderation & Quality Assurance"
        description="Review curriculum quality scores, monitor assigned operational modules, and ensure enterprise compliance."
        badge={<StatusBadge status="ACTIVE" label="Quality Gate Active" size="xs" />}
      />

      {/* Scope Advisory if restricted */}
      {!hasAnyScope && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-card p-5 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
          <Info className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm">Awaiting Operational Capability Assignment</h4>
            <p>
              Your Moderator account is active, but platform administrators have not yet assigned operational module privileges. Contact your administrator to request permissions for course quality review, user directory inspection, or enrollment moderation.
            </p>
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {canViewCourses && (
          <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-app-secondary">Courses Under Review</span>
              <BookOpen className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div className="text-2xl font-extrabold text-app font-mono">{courses.length}</div>
            <span className="text-[11px] text-brand-600 dark:text-brand-400 font-semibold">Active in Catalog</span>
          </div>
        )}

        {canViewUsers && (
          <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-app-secondary">Provisioned Users</span>
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-2xl font-extrabold text-app font-mono">{usersCount}</div>
            <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">Total Verified</span>
          </div>
        )}

        {canViewCourses && (
          <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-app-secondary">Avg Quality Score</span>
              <Award className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="text-2xl font-extrabold text-app font-mono">
              {courses.length > 0
                ? Math.round(courses.reduce((sum, c) => sum + (c.qualityScore || 0), 0) / courses.length)
                : 100}
              %
            </div>
            <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">Compliance Rating</span>
          </div>
        )}

        {/* Assigned Operational Scope summary card */}
        <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-secondary">Assigned Permissions</span>
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-app font-mono">
            {Object.values(perms).reduce((acc, m) => acc + Object.values(m || {}).filter(Boolean).length, 0)}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Active Action Scopes</span>
        </div>
      </div>

      {/* Quick Action Navigation Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {canViewCourses && (
          <div
            onClick={() => navigate('/moderator/courses')}
            className="bg-card border border-app rounded-card p-6 space-y-3 cursor-pointer hover:border-brand-500/50 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-app flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-brand-500" />
                Course Quality Review
              </h3>
              <ArrowRight className="h-4 w-4 text-app-secondary" />
            </div>
            <p className="text-xs text-app-secondary">
              Inspect lesson structures, verify curriculum prerequisites, and audit proctored assessment coverage for all courses.
            </p>
          </div>
        )}

        {canViewUsers && (
          <div
            onClick={() => navigate('/moderator/users')}
            className="bg-card border border-app rounded-card p-6 space-y-3 cursor-pointer hover:border-purple-500/50 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-app flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-500" />
                User Directory (Read-Only)
              </h3>
              <ArrowRight className="h-4 w-4 text-app-secondary" />
            </div>
            <p className="text-xs text-app-secondary">
              Search enterprise users, view departmental affiliations, and verify account security statuses without modification rights.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
