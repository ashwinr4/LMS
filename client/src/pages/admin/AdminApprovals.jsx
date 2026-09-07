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
import { Tabs } from '../../components/ui/Tabs.jsx';
import {
  CheckSquare, ShieldCheck, Check, X, Clock, Calendar,
  User, RefreshCw, AlertCircle, Sparkles, Building2, Send,
} from 'lucide-react';

export default function AdminApprovals() {
  const { socket } = useSocket();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('enrollments');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Approval Modal state
  const [approvalModal, setApprovalModal] = useState({ open: false, req: null });
  const [adminNotes, setAdminNotes] = useState('Authorized for enterprise curriculum track. Standard 14-day completion SLA.');
  const [dueDateDays, setDueDateDays] = useState(14);
  const [submitting, setSubmitting] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await api.get('/enrollments/admin-queue?status=FORWARDED_TO_ADMIN');
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Failed to load admin approvals:', err);
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
    socket.on('admin_new_request', handleNew);
    return () => socket.off('admin_new_request', handleNew);
  }, [socket, fetchQueue]);

  // Handle Admin Authorization
  const handleApprove = async (e) => {
    e.preventDefault();
    if (!approvalModal.req) return;
    const targetId = approvalModal.req.id;
    const studentName = approvalModal.req.student?.name;
    setSubmitting(true);
    try {
      await api.patch(`/enrollments/${targetId}/approve`, {
        adminNotes,
        dueDateDays: Number(dueDateDays),
      });
      addToast({
        type: 'success',
        title: 'Enrollment Authorized & Provisioned',
        message: `Student ${studentName} has been provisioned with a ${dueDateDays}-day curriculum track.`,
      });
      setRequests((prev) => prev.filter((r) => r.id !== targetId));
      setApprovalModal({ open: false, req: null });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Approval failed',
        message: err.response?.data?.message || 'Could not authorize enrollment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Rejection
  const handleReject = async (reqId) => {
    const reason = window.prompt('Enter reason for administrative rejection:');
    if (!reason) return;
    try {
      await api.patch(`/enrollments/${reqId}/reject`, { rejectionReason: reason });
      addToast({
        type: 'info',
        title: 'Application Rejected',
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
        title="Administrative Approvals Hub"
        description="Stage 3: Review instructor endorsements, set course SLA deadlines, authorize student assignments, and broadcast real-time provisionings."
        badge={
          <StatusBadge
            status={requests.length > 0 ? 'PENDING' : 'ACTIVE'}
            label={`${requests.length} Pending Approval${requests.length !== 1 ? 's' : ''}`}
            size="xs"
          />
        }
        actions={
          <Button variant="outline" size="sm" onClick={fetchQueue} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh Queue
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'enrollments', label: 'Enrollment Authorizations', count: requests.length },
          { id: 'transfers', label: 'Transfer & SLA Extensions', count: 0 },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'enrollments' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-card border border-dashed border-app rounded-card p-12 text-center space-y-3">
              <ShieldCheck className="h-12 w-12 text-app-muted mx-auto" />
              <h3 className="text-base font-bold text-app">No Pending Approvals</h3>
              <p className="text-xs text-app-secondary max-w-sm mx-auto">
                All instructor-endorsed applications have been authorized and provisioned.
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
                      <StatusBadge status="PENDING" label="Endorsed by Instructor" size="xs" />
                    </div>

                    {/* Course & Recommendation */}
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-elevated rounded-btn border border-app space-y-1">
                        <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider">
                          Target Module
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400">
                            {item.module?.code}
                          </span>
                          <span className="text-xs font-semibold text-app truncate">{item.module?.title}</span>
                        </div>
                        <p className="text-[11px] text-app-secondary">
                          Student Reason: "{item.studentReason || 'Professional training.'}"
                        </p>
                      </div>

                      <div className="p-3 bg-brand-50/50 dark:bg-brand-950/20 rounded-btn border border-brand-200 dark:border-brand-800 space-y-1">
                        <span className="text-[10px] text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Instructor Recommendation
                        </span>
                        <p className="text-xs text-app italic">
                          "{item.creatorRecommendation || 'Verified prerequisites and endorsed.'}"
                        </p>
                        <span className="text-[10px] text-app-muted block">
                          Reviewed: {item.reviewedByCreatorAt ? new Date(item.reviewedByCreatorAt).toLocaleDateString() : 'Today'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(item.id)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setApprovalModal({ open: true, req: item });
                      }}
                      leftIcon={<ShieldCheck className="h-4 w-4" />}
                    >
                      Authorize & Provision
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'transfers' && (
        <div className="bg-card border border-dashed border-app rounded-card p-12 text-center space-y-3">
          <Clock className="h-12 w-12 text-app-muted mx-auto" />
          <h3 className="text-base font-bold text-app">No Active SLA Transfer Requests</h3>
          <p className="text-xs text-app-secondary max-w-sm mx-auto">
            All student course deadline extension requests will be queued here for administrative audit.
          </p>
        </div>
      )}

      {/* Admin Authorization Modal */}
      <Modal
        isOpen={approvalModal.open}
        onClose={() => setApprovalModal({ open: false, req: null })}
        title="Authorize Course Enrollment & Provision Assignment"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleApprove} className="space-y-4">
          <div className="p-3.5 bg-elevated rounded-btn border border-app text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-app-muted">Candidate:</span>
              <span className="font-bold text-app">
                {approvalModal.req?.student?.name} ({approvalModal.req?.student?.department})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-app-muted">Course:</span>
              <span className="font-semibold text-app">
                {approvalModal.req?.module?.code} — {approvalModal.req?.module?.title}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Curriculum Track SLA (Days)"
              type="number"
              min="1"
              max="90"
              value={dueDateDays}
              onChange={(e) => setDueDateDays(e.target.value)}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
                Computed Due Date
              </label>
              <div className="h-10 px-3 flex items-center bg-elevated border border-app rounded-btn text-xs font-mono text-app">
                {new Date(Date.now() + Number(dueDateDays) * 24 * 60 * 60 * 1000).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary">
              Administrator Audit Notes
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              required
              className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApprovalModal({ open: false, req: null })}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={submitting}
              leftIcon={<ShieldCheck className="h-4 w-4" />}
              className="flex-1"
            >
              Authorize & Broadcast
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
