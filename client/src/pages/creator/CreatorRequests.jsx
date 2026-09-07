import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import {
  CheckSquare, Check, X, ArrowRight, Clock, BookOpen,
  User, RefreshCw, AlertCircle, Sparkles, Send
} from 'lucide-react';

export default function CreatorRequests() {
  const { socket } = useSocket();
  const { addToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [endorseModal, setEndorseModal] = useState({ open: false, req: null });
  const [recommendation, setRecommendation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await api.get('/enrollments/creator-queue');
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Real-time socket listener
  useEffect(() => {
    if (!socket) return;
    const handleNew = (data) => {
      if (data?.request) {
        setRequests((prev) => [data.request, ...prev.filter((r) => r.id !== data.request.id)]);
      } else {
        fetchQueue();
      }
    };
    socket.on('creator_new_request', handleNew);
    return () => socket.off('creator_new_request', handleNew);
  }, [socket, fetchQueue]);

  // Handle Endorsement & Forward to Admin
  const handleEndorse = async (e) => {
    e.preventDefault();
    if (!endorseModal.req) return;
    const targetId = endorseModal.req.id;
    setSubmitting(true);
    try {
      await api.patch(`/enrollments/${targetId}/forward`, {
        creatorRecommendation: recommendation,
      });
      addToast({
        type: 'success',
        title: 'Application Endorsed',
        message: 'Successfully forwarded candidate to Administrator for final authorization.',
      });
      setRequests((prev) => prev.filter((r) => r.id !== targetId));
      setEndorseModal({ open: false, req: null });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to endorse',
        message: err.response?.data?.message || 'Could not forward application.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Rejection
  const handleReject = async (reqId) => {
    const reason = window.prompt('Enter reason for declining application:');
    if (!reason) return;
    try {
      await api.patch(`/enrollments/${reqId}/reject`, { rejectionReason: reason });
      addToast({
        type: 'info',
        title: 'Application Declined',
        message: 'Student has been notified.',
      });
      fetchQueue();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Student Enrollment Review Queue"
        description="Stage 1: Review student motivations, verify department prerequisites, and endorse candidate applications to the Administrator."
        badge={
          <StatusBadge
            status={requests.length > 0 ? 'PENDING' : 'ACTIVE'}
            label={`${requests.length} Pending Review${requests.length !== 1 ? 's' : ''}`}
            size="xs"
          />
        }
        actions={
          <Button variant="outline" size="sm" onClick={fetchQueue} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-card border border-dashed border-app rounded-card p-12 text-center space-y-3">
          <CheckSquare className="h-12 w-12 text-app-muted mx-auto" />
          <h3 className="text-base font-bold text-app">Review Queue is Clear</h3>
          <p className="text-xs text-app-secondary max-w-sm mx-auto">
            All submitted student applications have been processed and forwarded to Administrators.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((item) => (
            <div
              key={item.id}
              className="bg-card border border-app rounded-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm hover:shadow-dialog transition-all"
            >
              <div className="space-y-3 flex-1">
                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={item.student?.avatar} name={item.student?.name || 'Student'} size="sm" />
                    <div>
                      <h4 className="text-sm font-bold text-app leading-none">{item.student?.name}</h4>
                      <p className="text-[11px] text-app-muted mt-0.5">
                        {item.student?.department} · {item.student?.email}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={item.status} size="xs" />
                </div>

                {/* Course Target */}
                <div className="p-3 bg-elevated rounded-btn border border-app space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400">
                      {item.module?.code}
                    </span>
                    <span className="text-xs font-semibold text-app">{item.module?.title}</span>
                  </div>
                  <p className="text-xs text-app-secondary italic">
                    "{item.studentReason || 'Requesting course enrollment for skill development.'}"
                  </p>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-app-muted">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Submitted: {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <span>·</span>
                  <span>Target: {item.module?.department} Track</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReject(item.id)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setRecommendation(
                      `Candidate ${item.student?.name} has verified prerequisite alignment with the ${item.module?.department} team. Endorsed for enrollment.`
                    );
                    setEndorseModal({ open: true, req: item });
                  }}
                  leftIcon={<Check className="h-4 w-4" />}
                >
                  Endorse & Forward
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Endorse Modal */}
      <Modal
        isOpen={endorseModal.open}
        onClose={() => setEndorseModal({ open: false, req: null })}
        title="Endorse & Forward to Administrator"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleEndorse} className="space-y-4">
          <div className="p-3 bg-elevated rounded-btn border border-app text-xs space-y-1">
            <p className="font-bold text-app">
              Candidate: {endorseModal.req?.student?.name} ({endorseModal.req?.student?.department})
            </p>
            <p className="text-app-secondary">
              Course: {endorseModal.req?.module?.code} — {endorseModal.req?.module?.title}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
              Instructor Recommendation Notes for Administrator
            </label>
            <textarea
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              rows={4}
              required
              className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEndorseModal({ open: false, req: null })}
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
              Submit Endorsement
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
