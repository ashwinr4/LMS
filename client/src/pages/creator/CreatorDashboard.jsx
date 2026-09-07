import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { api } from '../../services/api.js';
import {
  BookOpen,
  FileCheck2,
  CheckSquare,
  Users,
  Plus,
  ArrowRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Layers,
  Clock,
  Calendar,
} from 'lucide-react';

// ─── Duration from Calendar Date Helper ──────────────────────
function computeDurationFromDate(targetDateStr) {
  if (!targetDateStr) return '';
  const target = new Date(targetDateStr);
  const now = new Date();
  const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 'Immediate Completion';
  
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const formattedDate = target.toLocaleDateString('en-US', options);

  if (diffDays < 7) {
    return `${diffDays} Day${diffDays !== 1 ? 's' : ''} (Ends ${formattedDate})`;
  } else if (diffDays < 30) {
    const weeks = Math.ceil(diffDays / 7);
    return `${weeks} Week${weeks !== 1 ? 's' : ''} (Ends ${formattedDate})`;
  } else {
    const months = Math.round(diffDays / 30);
    return `${months} Month${months !== 1 ? 's' : ''} (Ends ${formattedDate})`;
  }
}

function getTodayDateString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// ─── Quick Create Course Modal with Calendar Date Picker ─────
function QuickNewCourseModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({
    code: '',
    title: '',
    department: 'Engineering',
    level: 'Intermediate',
    targetDate: '',
    duration: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDateChange = (e) => {
    const dateVal = e.target.value;
    const computed = computeDurationFromDate(dateVal);
    setForm((prev) => ({ ...prev, targetDate: dateVal, duration: computed }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/modules', {
        ...form,
        duration: form.duration || '4 Weeks',
        expiresAt: form.targetDate ? new Date(form.targetDate) : undefined,
      });
      onCreated(data.module);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create course.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Course" maxWidth="max-w-lg">
      <form onSubmit={handleCreate} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Course Code"
            placeholder="e.g. CORS-101"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            required
          />
          <Select
            label="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            options={['Engineering', 'Security', 'Data Science', 'Operations', 'Product', 'Administration']}
          />
        </div>

        <Input
          label="Course Title"
          placeholder="e.g. Cloud Security Architecture"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Difficulty Level"
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
            options={['Beginner', 'Intermediate', 'Advanced']}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-app select-none">
              Target Completion Date
            </label>
            <input
              type="date"
              min={getTodayDateString()}
              value={form.targetDate}
              onChange={handleDateChange}
              className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm h-10 px-3 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>
        </div>

        {form.duration && (
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-btn text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span><strong>Calculated Duration:</strong> {form.duration}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
            Course Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Provide a comprehensive overview for students..."
            className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-app-muted shadow-xs"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" isLoading={loading} className="flex-1">
            Create & Open Studio
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CreatorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [modulesRes, draftRes, reqRes] = await Promise.all([
        api.get('/modules?status=ACTIVE').catch(() => ({ data: { modules: [] } })),
        api.get('/modules?status=DRAFT').catch(() => ({ data: { modules: [] } })),
        api.get('/modules/enrollment-requests/pending').catch(() => ({ data: { requests: [] } })),
      ]);

      const activeList = modulesRes.data.modules || [];
      const draftList = draftRes.data.modules || [];
      const combined = [...activeList, ...draftList].filter(
        (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i
      );

      setCourses(combined);
      setPendingCount(reqRes.data.requests ? reqRes.data.requests.length : 0);
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const totalEnrolled = courses.reduce((sum, c) => sum + (c.enrolledCount || 0), 0);
  const publishedCount = courses.filter((c) => c.status === 'ACTIVE').length;

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="My Authored Courses"
        description="Design curriculum sections, author multi-modal lessons (Video, PDF, Articles & Diagrams), and manage student enrollment applications."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Layers className="h-4 w-4" />}
              onClick={() => navigate('/creator/studio')}
            >
              Open Studio Builder
            </Button>
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4 animate-icon-plus" />}
              onClick={() => setShowCreateModal(true)}
            >
              New Course
            </Button>
          </div>
        }
      />

      {/* Real-Time KPI Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Published Courses', val: publishedCount, icon: <BookOpen className="h-5 w-5 text-brand-500" /> },
          { label: 'Enrolled Students', val: totalEnrolled, icon: <Users className="h-5 w-5 text-purple-500" /> },
          { label: 'Total Courses in Studio', val: courses.length, icon: <Layers className="h-5 w-5 text-teal-500" /> },
          { label: 'Applications to Review', val: pendingCount, icon: <CheckSquare className="h-5 w-5 text-amber-500" /> },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-app-secondary">{kpi.label}</span>
              <div className="p-2 rounded-btn bg-elevated border border-app">{kpi.icon}</div>
            </div>
            <div className="text-2xl font-extrabold text-app font-mono">{kpi.val}</div>
          </div>
        ))}
      </div>

      {/* Authored Courses List */}
      <div className="bg-card border border-app rounded-card p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-app">Authored Courses</h3>
            <p className="text-xs text-app-muted">Click any course to open and edit its curriculum in Course Studio.</p>
          </div>
          <Button
            size="xs"
            variant="outline"
            leftIcon={<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />}
            onClick={fetchDashboardData}
          >
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 text-brand-500 animate-spin" />
          </div>
        ) : courses.length > 0 ? (
          <div className="space-y-3">
            {courses.map((course) => (
              <div
                key={course.id}
                className="p-4 rounded-btn bg-elevated border border-app flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-brand-500/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-white bg-blue-600 px-2.5 py-0.5 rounded shadow-xs">
                      {course.code}
                    </span>
                    <StatusBadge status={course.status} size="xs" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">• {course.department}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{course.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 flex items-center gap-2">
                    <span>{course.duration || 'Flexible duration'}</span>
                    <span>•</span>
                    <span>{course.level || 'Intermediate'}</span>
                    <span>•</span>
                    <span>{course.enrolledCount || 0} Students Enrolled</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                    onClick={() => navigate('/creator/studio')}
                  >
                    Open in Course Studio
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-app rounded-btn p-8 space-y-3">
            <Layers className="h-10 w-10 text-app-muted mx-auto" />
            <p className="text-sm font-semibold text-app">No courses authored yet</p>
            <p className="text-xs text-app-muted max-w-sm mx-auto">
              Get started by creating your first course. You can add video lectures, PDF documents, reading notes, and diagrams.
            </p>
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4 animate-icon-plus" />}
              onClick={() => setShowCreateModal(true)}
              className="mt-2"
            >
              Create First Course
            </Button>
          </div>
        )}
      </div>

      {/* Quick Create Course Modal */}
      <QuickNewCourseModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(newCourse) => {
          navigate('/creator/studio');
        }}
      />
    </div>
  );
}
