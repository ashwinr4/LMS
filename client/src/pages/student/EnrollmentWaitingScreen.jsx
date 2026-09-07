import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { api } from '../../services/api.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  CheckCircle2, Clock, ShieldCheck, UserCheck, BookOpen,
  ArrowRight, AlertCircle, Sparkles, RefreshCw, Calendar, FileText
} from 'lucide-react';

export default function EnrollmentWaitingScreen() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState(null);
  const [request, setRequest] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [approvedCelebration, setApprovedCelebration] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(null);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const [modRes, statRes] = await Promise.all([
        api.get(`/modules/${moduleId}`),
        api.get(`/enrollments/status/${moduleId}`),
      ]);
      setModule(modRes.data.module);

      if (statRes.data.enrolled && statRes.data.assignment) {
        setAssignment(statRes.data.assignment);
        setRequest(statRes.data.request);
      } else {
        setRequest(statRes.data.request);
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Trigger Confetti Celebration
  const triggerCelebration = useCallback(() => {
    setApprovedCelebration(true);
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
    });

    let count = 4;
    setRedirectCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      setRedirectCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        navigate(`/courses/${moduleId}/learn`);
      }
    }, 1000);
  }, [moduleId, navigate]);

  // WebSocket Live Listeners
  useEffect(() => {
    if (!socket) return;

    const handleApproved = (data) => {
      if (data.moduleId === moduleId) {
        setRequest((prev) => ({ ...prev, status: 'APPROVED' }));
        triggerCelebration();
      }
    };

    const handleUpdated = (data) => {
      if (data.requestId === request?.id || !request) {
        fetchStatus();
      }
    };

    socket.on('enrollment_approved', handleApproved);
    socket.on('enrollment_status_updated', handleUpdated);

    return () => {
      socket.off('enrollment_approved', handleApproved);
      socket.off('enrollment_status_updated', handleUpdated);
    };
  }, [socket, moduleId, request?.id, triggerCelebration, fetchStatus]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  const isApproved = request?.status === 'APPROVED' || !!assignment;
  const isForwarded = request?.status === 'FORWARDED_TO_ADMIN' || isApproved;
  const isPendingCreator = request?.status === 'PENDING_CREATOR';

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <PageHeader
        title="Enrollment Pipeline Status"
        description="Live multi-stage verification for certified enterprise training."
        badge={
          <StatusBadge
            status={isApproved ? 'ACTIVE' : request?.status || 'PENDING'}
            label={isApproved ? 'Approved & Enrolled' : isForwarded ? 'Stage 2: Admin Review' : 'Stage 1: Instructor Review'}
            size="xs"
          />
        }
      />

      {/* Course Summary Card */}
      {module && (
        <div className="bg-card border border-app rounded-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800">
                {module.code}
              </span>
              <span className="text-xs text-app-muted">{module.department} · {module.level}</span>
            </div>
            <h2 className="text-lg font-bold text-app">{module.title}</h2>
            <p className="text-xs text-app-secondary mt-1 max-w-xl">{module.description}</p>
          </div>
          {isApproved && (
            <Button
              size="md"
              onClick={() => navigate(`/courses/${moduleId}/learn`)}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Start Learning Now
            </Button>
          )}
        </div>
      )}

      {/* Celebration Banner */}
      {approvedCelebration && (
        <div className="p-6 bg-gradient-to-r from-teal-500/10 via-emerald-500/15 to-brand-500/10 border border-teal-500/40 rounded-card animate-slide-up text-center space-y-3">
          <div className="inline-flex p-3 rounded-full bg-emerald-500 text-white shadow-lg animate-bounce">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-black text-app">Application Approved & Enrolled!</h3>
          <p className="text-sm text-app-secondary max-w-md mx-auto">
            Your course access is now active with a standard 14-day completion track.
          </p>
          {redirectCountdown !== null && (
            <p className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400">
              Auto-redirecting to learning player in {redirectCountdown}s...
            </p>
          )}
        </div>
      )}

      {/* 3-Stage Stepper */}
      <div className="bg-card border border-app rounded-card p-6 sm:p-8 space-y-8 shadow-sm">
        <h3 className="text-sm font-bold text-app uppercase tracking-wider">
          3-Stage Enrollment Verification Stepper
        </h3>

        <div className="relative border-l-2 border-app pl-6 sm:pl-8 space-y-8 ml-3">
          {/* Stage 1: Student Submission */}
          <div className="relative group">
            <div className="absolute -left-[35px] sm:-left-[43px] top-0 h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">
                  Stage 1: Application Submitted
                </span>
                <span className="text-[10px] text-app-muted font-mono">
                  {request?.createdAt ? new Date(request.createdAt).toLocaleTimeString() : 'Done'}
                </span>
              </div>
              <h4 className="text-sm font-bold text-app mt-0.5">Student Motivation & Prerequisite Review</h4>
              <p className="text-xs text-app-secondary mt-1 bg-elevated border border-app rounded-btn p-3">
                "{request?.studentReason || 'Requesting course enrollment for professional skill development.'}"
              </p>
            </div>
          </div>

          {/* Stage 2: Creator Endorsement */}
          <div className="relative group">
            <div
              className={`absolute -left-[35px] sm:-left-[43px] top-0 h-8 w-8 rounded-full flex items-center justify-center shadow-md ${
                isForwarded
                  ? 'bg-emerald-500 text-white'
                  : 'bg-amber-500 text-white animate-pulse'
              }`}
            >
              {isForwarded ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold uppercase ${
                    isForwarded
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  Stage 2: Instructor Endorsement & Verification
                </span>
                <StatusBadge status={isForwarded ? 'APPROVED' : 'PENDING'} size="xs" />
              </div>
              <h4 className="text-sm font-bold text-app mt-0.5">
                Instructor Recommendation Notes
              </h4>
              {isForwarded ? (
                <p className="text-xs text-app-secondary mt-1 bg-elevated border border-app rounded-btn p-3">
                  "{request?.creatorRecommendation || 'Verified prerequisites and endorsed for administrative provisioning.'}"
                </p>
              ) : (
                <p className="text-xs text-app-muted mt-1 italic">
                  Awaiting review from course instructor (James Mitchell)...
                </p>
              )}
            </div>
          </div>

          {/* Stage 3: Admin Final Authorization */}
          <div className="relative group">
            <div
              className={`absolute -left-[35px] sm:-left-[43px] top-0 h-8 w-8 rounded-full flex items-center justify-center shadow-md ${
                isApproved
                  ? 'bg-emerald-500 text-white'
                  : isForwarded
                  ? 'bg-amber-500 text-white animate-pulse'
                  : 'bg-elevated border border-app text-app-muted'
              }`}
            >
              {isApproved ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold uppercase ${
                    isApproved
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isForwarded
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-app-muted'
                  }`}
                >
                  Stage 3: Administrative Authorization & Provisioning
                </span>
                <StatusBadge status={isApproved ? 'APPROVED' : 'PENDING'} size="xs" />
              </div>
              <h4 className="text-sm font-bold text-app mt-0.5">
                14-Day Curriculum Track Provisioning
              </h4>
              {isApproved ? (
                <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-btn text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                  <p className="font-semibold">Assignment Created & Ready</p>
                  <p className="text-[11px] opacity-90">
                    Administrator notes: "{request?.adminNotes || 'Approved for enterprise curriculum track.'}"
                  </p>
                </div>
              ) : (
                <p className="text-xs text-app-muted mt-1 italic">
                  {isForwarded
                    ? 'In Administrator Queue (Sarah Chen). Final authorization in progress...'
                    : 'Unlocks once instructor endorsement is submitted.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Live WebSocket Status Footer */}
        <div className="pt-4 border-t border-app flex items-center justify-between text-xs text-app-muted">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Live WebSocket connected — Updates will appear in real time</span>
          </div>
          <Button variant="ghost" size="xs" onClick={fetchStatus} leftIcon={<RefreshCw className="h-3 w-3" />}>
            Refresh Status
          </Button>
        </div>
      </div>
    </div>
  );
}
