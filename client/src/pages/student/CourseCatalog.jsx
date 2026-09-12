import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { SegmentedToggle } from '../../components/ui/SegmentedToggle.jsx';
import {
  BookOpen, Clock, User, Star, Search, Filter,
  ArrowRight, Sparkles, ShieldCheck, CheckCircle2, Play, RefreshCw, Send
} from 'lucide-react';

export default function CourseCatalog() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [search, setSearch] = useState('');

  // Enrollment Modal
  const [modalCourse, setModalCourse] = useState(null);
  const [motivation, setMotivation] = useState('Seeking advanced mastery for enterprise infrastructure deployment.');
  const [submitting, setSubmitting] = useState(false);

  // User assignments & request map
  const [userAssignments, setUserAssignments] = useState({});
  const [userRequests, setUserRequests] = useState({});

  const fetchCoursesAndStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/modules?status=ACTIVE');
      setCourses(data.modules || []);

      if (user) {
        try {
          const [assignRes, reqRes] = await Promise.all([
            api.get('/modules/my-courses'),
            api.get('/enrollments/my-requests'),
          ]);

          const aMap = {};
          (assignRes.data.assignments || []).forEach((a) => {
            aMap[a.moduleId] = a;
          });
          setUserAssignments(aMap);

          const rMap = {};
          (reqRes.data.requests || []).forEach((r) => {
            rMap[r.moduleId] = r;
          });
          setUserRequests(rMap);
        } catch {
          // Non-critical if requests fail
        }
      }
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCoursesAndStatus();
  }, [fetchCoursesAndStatus]);

  // Real-time synchronization for course enrollment changes
  useEffect(() => {
    if (!socket) return;

    const handleApproved = (data) => {
      if (data?.moduleId) {
        setUserAssignments((prev) => ({
          ...prev,
          [data.moduleId]: {
            id: data.assignmentId,
            moduleId: data.moduleId,
            status: 'IN_PROGRESS',
            progress: 0,
          },
        }));
        setUserRequests((prev) => {
          const copy = { ...prev };
          delete copy[data.moduleId];
          return copy;
        });
      }
    };

    const handleStatusUpdated = () => {
      fetchCoursesAndStatus();
    };

    socket.on('enrollment_approved', handleApproved);
    socket.on('enrollment_status_updated', handleStatusUpdated);

    return () => {
      socket.off('enrollment_approved', handleApproved);
      socket.off('enrollment_status_updated', handleStatusUpdated);
    };
  }, [socket, fetchCoursesAndStatus]);

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    if (!modalCourse) return;
    setSubmitting(true);
    try {
      await api.post('/enrollments/request', {
        moduleId: modalCourse.id,
        studentReason: motivation,
      });
      addToast({
        type: 'success',
        title: 'Application Submitted',
        message: 'Your 3-stage enrollment request is now in the Instructor review queue.',
      });
      const cId = modalCourse.id;
      setModalCourse(null);
      navigate(`/waiting-approval/${cId}`);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Submission failed',
        message: err.response?.data?.message || 'Could not submit application.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = courses.filter((c) => {
    const matchesDept = selectedDept === 'ALL' || c.department.toUpperCase() === selectedDept.toUpperCase();
    const matchesSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase());
    return matchesDept && matchesSearch;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Enterprise Course Catalog"
        description="Browse certified technical curricula. Submit 3-stage enrollment requests, track instructor endorsements, and complete proctored exams."
      />

      {/* Guest View-Only Banner */}
      {!user && (
        <div className="p-4 rounded-card bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-900 dark:text-blue-200">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              <strong>Guest Catalog Preview</strong> — You are viewing the public course catalog. Sign in to view comprehensive learning modules, track instructor endorsements, and apply for enrollment.
            </span>
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0"
            onClick={() => navigate('/login', { state: { from: { pathname: '/catalog' } } })}
          >
            Sign In to Enroll
          </Button>
        </div>
      )}

      {/* Sleek Minimal Segmented Track Filter & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <SegmentedToggle
          options={[
            { id: 'ALL', label: 'All Tracks' },
            { id: 'ENGINEERING', label: 'Engineering' },
            { id: 'SECURITY', label: 'Security' },
            { id: 'DATA SCIENCE', label: 'Data Science' },
          ]}
          value={selectedDept}
          onChange={setSelectedDept}
          size="sm"
          color="blue"
        />

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-btn bg-card border border-app text-app text-xs focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((course) => {
            const isEnrolled = !!userAssignments[course.id];
            const activeRequest = userRequests[course.id];
            const isUnderReview =
              activeRequest &&
              (activeRequest.status === 'PENDING_CREATOR' ||
                activeRequest.status === 'FORWARDED_TO_ADMIN');

            return (
              <div
                key={course.id}
                className="bg-card border border-app rounded-card p-6 flex flex-col justify-between space-y-4 hover:shadow-card-hover transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white bg-blue-600 px-2.5 py-0.5 rounded shadow-xs">
                      {course.code}
                    </span>
                    <span className="text-[11px] font-semibold text-app-muted uppercase tracking-wider">
                      {course.level || 'Beginner'}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-app line-clamp-1">{course.title}</h3>
                  <p className="text-xs text-app-secondary line-clamp-2 leading-relaxed">
                    {course.description || 'Comprehensive module curriculum.'}
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-app">
                  <div className="flex items-center justify-between text-xs text-app-muted">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {course.duration || '4-6 Weeks'}
                    </span>
                    {course.ratingCount > 0 ? (
                      <span className="flex items-center gap-1 text-amber-500 font-semibold">
                        <Star className="h-3.5 w-3.5 fill-amber-500" />
                        {course.rating.toFixed(1)} ({course.ratingCount})
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-app-muted">
                        New Curriculum
                      </span>
                    )}
                  </div>

                  {isEnrolled ? (
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full"
                      leftIcon={<Play className="h-4 w-4" />}
                      onClick={() => navigate(`/courses/${course.id}/learn`)}
                    >
                      Resume Learning
                    </Button>
                  ) : isUnderReview ? (
                    <Button
                      variant="outline"
                      size="md"
                      className="w-full text-brand-600 dark:text-brand-400 border-brand-500/50"
                      onClick={() => navigate(`/waiting-approval/${course.id}`)}
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      View Pipeline Status
                    </Button>
                  ) : !user ? (
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                      onClick={() => navigate('/login', { state: { from: { pathname: '/catalog' } } })}
                    >
                      Sign In to Enroll
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full"
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                      onClick={() => setModalCourse(course)}
                    >
                      Request Enrollment
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Enrollment Request Modal */}
      <Modal
        isOpen={!!modalCourse}
        onClose={() => setModalCourse(null)}
        title="Apply for Course Enrollment"
        maxWidth="max-w-lg"
      >
        {modalCourse && (
          <form onSubmit={handleEnrollSubmit} className="space-y-4">
            <div className="p-4 bg-elevated rounded-btn border border-app space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                  {modalCourse.code}
                </span>
                <span className="text-xs font-semibold text-app">{modalCourse.title}</span>
              </div>
              <p className="text-xs text-app-secondary">{modalCourse.description}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-app-muted pt-1 border-t border-app/60">
                <span>Duration: {modalCourse.duration}</span>
                <span className="meta-divider" />
                <span>Track: {modalCourse.department}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
                Applicant Motivation & Prerequisite Justification
              </label>
              <textarea
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                rows={3}
                required
                placeholder="Explain why you wish to enroll and your background..."
                className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <p className="text-[11px] text-app-muted">
                This note will be verified by the course instructor before administrative approval.
              </p>
            </div>

            <div className="p-3 bg-brand-50/50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800 rounded-btn text-xs text-brand-800 dark:text-brand-300 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
              <span>
                Enterprise Policy: Upon Admin approval, a 14-day SLA deadline will be assigned.
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalCourse(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={submitting}
                leftIcon={<Send className="h-4 w-4" />}
                className="flex-1"
              >
                Submit Application
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
