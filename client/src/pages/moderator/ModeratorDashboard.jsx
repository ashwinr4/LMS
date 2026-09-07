import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
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
} from 'lucide-react';

export default function ModeratorDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [usersCount, setUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModeratorOverview();
  }, []);

  const fetchModeratorOverview = async () => {
    setLoading(true);
    try {
      const [cRes, uRes] = await Promise.all([
        api.get('/moderator/courses'),
        api.get('/moderator/users?limit=1'),
      ]);
      if (cRes.data.success) setCourses(cRes.data.courses || []);
      if (uRes.data.success) setUsersCount(uRes.data.pagination?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Moderation & Quality Assurance"
        description="Review curriculum quality scores, monitor student directories in read-only mode, and ensure enterprise course compliance."
        badge={<StatusBadge status="ACTIVE" label="Quality Gate Active" size="xs" />}
      />

      {/* KPI Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-secondary">Courses Under Review</span>
            <div className="p-2 rounded-btn bg-brand-500/10 border border-brand-500/20">
              <BookOpen className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-app font-mono">{courses.length}</div>
          <span className="text-[11px] text-brand-600 dark:text-brand-400 font-semibold">Active in Catalog</span>
        </div>

        <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-secondary">Provisioned Users (Read-Only)</span>
            <div className="p-2 rounded-btn bg-purple-500/10 border border-purple-500/20">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-app font-mono">{usersCount}</div>
          <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">Total Verified</span>
        </div>

        <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-secondary">Avg Quality Score</span>
            <div className="p-2 rounded-btn bg-teal-500/10 border border-teal-500/20">
              <Award className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-app font-mono">
            {courses.length > 0
              ? Math.round(courses.reduce((sum, c) => sum + (c.qualityScore || 0), 0) / courses.length)
              : 100}
            %
          </div>
          <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">Compliance Rating</span>
        </div>
      </div>

      {/* Quick Action Navigation Cards */}
      <div className="grid md:grid-cols-2 gap-6">
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
      </div>
    </div>
  );
}
