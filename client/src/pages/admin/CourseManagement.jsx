import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import {
  BookOpen,
  Calendar,
  Clock,
  Archive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Layers,
  FileCheck2,
  X,
} from 'lucide-react';

function formatExpiration(expiresAt) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const formattedDate = expiry.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (diffDays <= 0) {
    return {
      isExpired: true,
      text: `Expired on ${formattedDate}`,
      statusColor: 'text-red-600 dark:text-red-400 font-medium',
      icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />,
    };
  }

  if (diffDays <= 30) {
    return {
      isExpired: false,
      text: `Expires on ${formattedDate} (${diffDays} days left)`,
      statusColor: 'text-amber-600 dark:text-amber-400 font-medium',
      icon: <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />,
    };
  }

  return {
    isExpired: false,
    text: `Expires on ${formattedDate} (${diffDays} days left)`,
    statusColor: 'text-app-secondary',
    icon: <Calendar className="h-3.5 w-3.5 text-app-muted shrink-0" />,
  };
}

export default function CourseManagement() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [sweepResult, setSweepResult] = useState(null);

  // Interactive Calendar / Expiration Modal State
  const [calendarModal, setCalendarModal] = useState({
    open: false,
    course: null,
    date: '',
    submitting: false,
  });

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/courses');
      if (res.data.success) {
        setCourses(res.data.courses || []);
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
      setError(err.response?.data?.message || 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (courseId, status) => {
    try {
      const res = await api.patch(`/admin/courses/${courseId}/status`, { status });
      if (res.data.success) fetchCourses();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update course status.');
    }
  };

  const openCalendarModal = (course) => {
    let initialDate = '';
    if (course.expiresAt) {
      initialDate = new Date(course.expiresAt).toISOString().split('T')[0];
    } else {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      initialDate = d.toISOString().split('T')[0];
    }
    setCalendarModal({
      open: true,
      course,
      date: initialDate,
      submitting: false,
    });
  };

  const applyPresetMonths = (months) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setCalendarModal((prev) => ({
      ...prev,
      date: d.toISOString().split('T')[0],
    }));
  };

  const handleSaveExpiration = async (e) => {
    e.preventDefault();
    if (!calendarModal.course || !calendarModal.date) return;

    setCalendarModal((prev) => ({ ...prev, submitting: true }));
    try {
      const res = await api.patch(`/admin/courses/${calendarModal.course.id}/status`, {
        expiresAt: calendarModal.date,
      });
      if (res.data.success) {
        setCalendarModal({ open: false, course: null, date: '', submitting: false });
        fetchCourses();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update expiration date.');
      setCalendarModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleRunExpirationSweep = async () => {
    setSweepLoading(true);
    try {
      const res = await api.post('/admin/courses/check-expirations');
      if (res.data.success) {
        setSweepResult(res.data);
        fetchCourses();
      }
    } catch (err) {
      alert('Failed to run expiration sweep.');
    } finally {
      setSweepLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Course Management & Lifecycle Governance"
        description="Monitor curriculum health, manage enrollment access statuses, and enforce platform 12-month automated expiration and archiving policies."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRunExpirationSweep}
            disabled={sweepLoading}
            leftIcon={<RefreshCw className={`h-4 w-4 text-brand-500 ${sweepLoading ? 'animate-spin' : ''}`} />}
          >
            {sweepLoading ? 'Sweeping...' : 'Run Expiration Sweep'}
          </Button>
        }
      />

      {sweepResult && (
        <div className="p-4 rounded-card bg-brand-500/10 border border-brand-500/20 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-500" />
            <span>
              <strong>Sweep Completed:</strong> {sweepResult.message}
            </span>
          </div>
          <button onClick={() => setSweepResult(null)} className="text-app-secondary hover:text-app font-bold">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-card border border-app rounded-card animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-red-500/10 border border-red-500/30 rounded-card text-xs text-red-600 font-semibold">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((c) => {
            const expiryInfo = formatExpiration(c.expiresAt);

            return (
              <div
                key={c.id}
                className="bg-card border border-app rounded-card p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm hover:border-brand-500/20 transition-all"
              >
                <div className="space-y-2 flex-1">
                  {/* Humanized Tagline: Code | Status | Live Expiration */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">
                      {c.code}
                    </span>
                    <span className="meta-divider" />
                    <StatusBadge status={c.status} size="xs" />

                    {expiryInfo && (
                      <>
                        <span className="meta-divider" />
                        <span className={`flex items-center gap-1.5 text-xs ${expiryInfo.statusColor}`}>
                          {expiryInfo.icon}
                          <span>{expiryInfo.text}</span>
                        </span>
                      </>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-app">{c.title}</h3>
                    <p className="text-xs text-app-secondary mt-0.5 flex items-center flex-wrap">
                      <span>{c.department}</span>
                      <span className="meta-divider" />
                      <span>Instructor: <span className="font-medium text-app">{c.instructorName || 'Faculty'}</span></span>
                    </p>
                  </div>

                  {/* Course Metrics */}
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-app-secondary pt-1">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-purple-500" />
                      {c.studentCount} Students Enrolled
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-brand-500" />
                      {c.sectionCount} Sections
                    </span>
                    <span className="flex items-center gap-1">
                      <FileCheck2 className="h-3.5 w-3.5 text-teal-500" />
                      {c.assessmentCount} Assessments
                    </span>
                  </div>
                </div>

                {/* Clean, Non-Clumsy Actions (No Heavy Borders) */}
                <div className="flex items-center gap-4 shrink-0">
                  {c.status !== 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(c.id, 'ACTIVE')}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline transition-colors"
                      title="Activate Course"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Activate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(c.id, 'ARCHIVED')}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline transition-colors"
                      title="Archive Course"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openCalendarModal(c)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline transition-colors"
                    title="Set Custom Expiration Date"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Set Expiration
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Calendar Modal */}
      {calendarModal.open && (
        <Modal
          isOpen={calendarModal.open}
          onClose={() => setCalendarModal({ open: false, course: null, date: '', submitting: false })}
          title="Set Course Expiration Date"
          size="sm"
        >
          <form onSubmit={handleSaveExpiration} className="space-y-4 pt-1">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-app-secondary">Course Code & Title</p>
              <p className="text-sm font-bold text-app">
                <span className="font-mono text-brand-500 mr-2">{calendarModal.course?.code}</span>
                {calendarModal.course?.title}
              </p>
            </div>

            {/* Quick Adjustment Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-app-secondary">Quick Presets</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyPresetMonths(6)}
                  className="px-2.5 py-1 text-xs rounded-btn bg-elevated border border-app text-app hover:border-brand-500 transition-colors"
                >
                  +6 Months
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetMonths(12)}
                  className="px-2.5 py-1 text-xs rounded-btn bg-elevated border border-app text-app hover:border-brand-500 transition-colors"
                >
                  +1 Year
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetMonths(24)}
                  className="px-2.5 py-1 text-xs rounded-btn bg-elevated border border-app text-app hover:border-brand-500 transition-colors"
                >
                  +2 Years
                </button>
              </div>
            </div>

            {/* Interactive Calendar Date Picker */}
            <div className="space-y-1.5">
              <label htmlFor="course-expiry-calendar" className="text-xs font-semibold text-app">
                Select Calendar Expiration Date
              </label>
              <input
                id="course-expiry-calendar"
                type="date"
                min={todayStr}
                value={calendarModal.date}
                onChange={(e) => setCalendarModal((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full h-10 px-3 rounded-btn bg-elevated border border-app text-app text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-app">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setCalendarModal({ open: false, course: null, date: '', submitting: false })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="xs"
                disabled={calendarModal.submitting}
              >
                {calendarModal.submitting ? 'Saving...' : 'Save Expiration'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
