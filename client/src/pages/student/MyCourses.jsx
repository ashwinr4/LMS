import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import {
  BookOpen,
  Clock,
  Play,
  Calendar,
  AlertCircle,
  Award,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  Send,
} from 'lucide-react';

export default function MyCourses() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Extension / Transfer Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [requestType, setRequestType] = useState('SLA_EXTENSION');
  const [requestedDays, setRequestedDays] = useState(14);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadAssignments() {
      try {
        const { data } = await api.get('/modules/my-courses');
        setAssignments(data.assignments || []);
      } catch (err) {
        console.error('Failed to load courses:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAssignments();
  }, []);

  const formatDueDate = (dateStr) => {
    if (!dateStr) return 'No deadline';
    const due = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Overdue';
    return `In ${diffDays} day${diffDays > 1 ? 's' : ''}`;
  };

  const handleOpenExtensionModal = (courseItem) => {
    setSelectedCourse(courseItem);
    setRequestType('SLA_EXTENSION');
    setRequestedDays(14);
    setReason('');
    setModalOpen(true);
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      addToast({ type: 'error', title: 'Reason required', message: 'Please provide a brief justification.' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        type: requestType,
        courseId: selectedCourse?.moduleId,
        requestedDays: Number(requestedDays),
        reason: reason.trim(),
      };
      await api.post('/transfers', payload);
      addToast({
        type: 'success',
        title: 'Request Submitted',
        message: 'Your extension request has been sent for administrative review.',
      });
      setModalOpen(false);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Submission Failed',
        message: err.response?.data?.message || 'Could not submit request.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="My Learning & Enrolled Courses"
        description="Track active course assignments, sequential lesson completion, upcoming deadlines, and certification exams."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-card border border-dashed border-app rounded-card p-12 text-center space-y-4">
          <BookOpen className="h-12 w-12 text-app-muted mx-auto" />
          <div>
            <h3 className="font-bold text-base text-app">No Enrolled Courses Yet</h3>
            <p className="text-xs text-app-secondary mt-1">
              Explore the Course Catalog and submit an enrollment application to start learning.
            </p>
          </div>
          <Link to="/catalog">
            <Button size="sm">Browse Course Catalog</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((item) => (
            <div
              key={item.id}
              className="bg-card border border-app rounded-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm hover:shadow-dialog transition-all"
            >
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-white bg-blue-600 px-2.5 py-0.5 rounded shadow-xs">
                    {item.code}
                  </span>
                  <StatusBadge status={item.status} size="xs" />
                  <span className="text-xs text-app-muted flex items-center gap-1 font-mono">
                    <Calendar className="h-3.5 w-3.5" /> Due: {formatDueDate(item.dueDate)}
                  </span>
                </div>

                <h3 className="font-bold text-base sm:text-lg text-app">{item.title}</h3>

                {/* Progress Bar */}
                <div className="space-y-1 max-w-md">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-app-secondary">Curriculum Progress</span>
                    <span className="text-brand-600 dark:text-brand-400 font-mono">{item.progress}%</span>
                  </div>
                  <div className="w-full bg-elevated h-2 rounded-full overflow-hidden border border-app">
                    <div
                      className="bg-brand-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-app-muted">
                    {item.completedLessonsCount} of {item.totalLessons} lessons completed
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <Button variant="outline" size="sm" onClick={() => handleOpenExtensionModal(item)}>
                  Request Extension
                </Button>
                <Button
                  size="md"
                  leftIcon={<Play className="h-4 w-4" />}
                  onClick={() => navigate(`/courses/${item.moduleId}/learn`)}
                >
                  Resume Learning
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SLA Extension / Transfer Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Request SLA Extension"
        description={`Submit a deadline adjustment for ${selectedCourse?.title || 'course'}`}
      >
        <form onSubmit={handleSubmitRequest} className="space-y-4 text-app">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-app">Request Type</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
            >
              <option value="SLA_EXTENSION">SLA Deadline Extension</option>
              <option value="COURSE_TRANSFER">Course / Track Transfer</option>
            </select>
          </div>

          {requestType === 'SLA_EXTENSION' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-app">Additional Days Needed</label>
              <select
                value={requestedDays}
                onChange={(e) => setRequestedDays(Number(e.target.value))}
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
              >
                <option value={7}>+7 Days (1 Week Extension)</option>
                <option value={14}>+14 Days (Standard 2-Week Extension)</option>
                <option value={30}>+30 Days (1 Month Extension)</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-app">Statement & Justification</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reason for this extension (e.g. project workload, medical, scheduling conflict)..."
              rows={3}
              required
              className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2.5 text-xs text-app resize-none placeholder:text-app-muted"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={submitting} leftIcon={<Send className="h-3.5 w-3.5" />}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
