import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../services/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { CustomDropdown } from '../../components/ui/CustomDropdown.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import {
  CheckSquare,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  ShieldAlert,
  Calendar,
  RefreshCw,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Building2,
  Hourglass,
} from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All Request Types' },
  { value: 'SLA_EXTENSION', label: 'SLA Deadline Extension' },
  { value: 'COURSE_TRANSFER', label: 'Course / Track Transfer' },
  { value: 'DEPARTMENT_TRANSFER', label: 'Department Reallocation' },
];

export default function ModeratorTransfers() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // Rejection modal state
  const [rejectModal, setRejectModal] = useState({ open: false, req: null });
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Approval modal state
  const [approveModal, setApproveModal] = useState({ open: false, req: null });
  const [approvalNotes, setApprovalNotes] = useState('');

  // Moderator Permission Check
  const perms = useMemo(() => {
    try {
      return typeof user?.moderatorPermissions === 'string'
        ? JSON.parse(user.moderatorPermissions)
        : user?.moderatorPermissions || {};
    } catch {
      return {};
    }
  }, [user?.moderatorPermissions]);

  const canView = user?.role === 'ADMIN' || Boolean(perms.transfers?.view);
  const canApprove = user?.role === 'ADMIN' || Boolean(perms.transfers?.approve);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeTab !== 'ALL') {
        params.status = activeTab;
      }
      if (typeFilter !== 'ALL') {
        params.type = typeFilter;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const { data } = await api.get('/transfers', { params });
      if (data?.success) {
        setRequests(data.requests || []);
        if (data.counts) {
          setCounts(data.counts);
        }
      }
    } catch (err) {
      console.error('Failed to load transfers:', err);
      addToast({
        type: 'error',
        title: 'Error loading transfers',
        message: err.response?.data?.message || 'Could not fetch transfer requests.',
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, typeFilter, searchTerm, addToast]);

  useEffect(() => {
    if (canView) {
      fetchRequests();
    }
  }, [canView, fetchRequests]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;

    const handleCreated = () => fetchRequests();
    const handleUpdated = () => fetchRequests();

    socket.on('transfer:created', handleCreated);
    socket.on('transfer:updated', handleUpdated);

    return () => {
      socket.off('transfer:created', handleCreated);
      socket.off('transfer:updated', handleUpdated);
    };
  }, [socket, fetchRequests]);

  // Approve action
  const handleConfirmApprove = async () => {
    if (!approveModal.req) return;
    setActionLoading(true);
    try {
      await api.patch(`/transfers/${approveModal.req.id}/approve`, {
        notes: approvalNotes,
      });
      addToast({
        type: 'success',
        title: 'Request Approved',
        message: `The request for ${approveModal.req.user?.name || 'student'} has been authorized.`,
      });
      setApproveModal({ open: false, req: null });
      setApprovalNotes('');
      fetchRequests();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Approval Failed',
        message: err.response?.data?.message || 'Could not approve request.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Reject action
  const handleConfirmReject = async () => {
    if (!rejectModal.req) return;
    setActionLoading(true);
    try {
      await api.patch(`/transfers/${rejectModal.req.id}/reject`, {
        reason: rejectionReason || 'Request rejected by moderator.',
      });
      addToast({
        type: 'info',
        title: 'Request Rejected',
        message: `The request has been rejected.`,
      });
      setRejectModal({ open: false, req: null });
      setRejectionReason('');
      fetchRequests();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Rejection Failed',
        message: err.response?.data?.message || 'Could not reject request.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (!canView) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="text-base font-bold text-app">Transfer Management Scope Restricted</h2>
        <p className="text-xs text-app-secondary max-w-sm mx-auto">
          Your moderator role does not currently include the <code className="text-brand-500 font-mono">transfers:view</code> authorization scope. Contact an administrator to request access.
        </p>
      </div>
    );
  }

  const tabsConfig = [
    { id: 'PENDING', label: 'Pending Review', count: counts.pending },
    { id: 'APPROVED', label: 'Approved', count: counts.approved },
    { id: 'REJECTED', label: 'Rejected', count: counts.rejected },
    { id: 'ALL', label: 'All Submissions', count: counts.total },
  ];

  return (
    <div className="space-y-8 pb-16 animate-fade-in text-app">
      {/* ── Page Header (Approvals Hub Styling) ───────────────── */}
      <PageHeader
        title="Transfer Requests & SLA Extensions"
        description="Audit student track reallocations, cohort schedule shifts, and SLA course completion deadline extensions in real time."
        badge={
          <StatusBadge
            status={counts.pending > 0 ? 'PENDING' : 'ACTIVE'}
            label={`${counts.pending} Pending Review${counts.pending !== 1 ? 's' : ''}`}
            size="xs"
          />
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRequests}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh Queue
          </Button>
        }
      />

      {/* ── Metric Summary Cards ──────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-secondary">Pending Reviews</span>
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-app font-mono">{counts.pending}</div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Awaiting Audit</span>
        </div>

        <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-secondary">Approved Requests</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-app font-mono">{counts.approved}</div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Authorized & Applied</span>
        </div>

        <div className="bg-card border border-app rounded-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-secondary">Total Submissions</span>
            <ArrowRightLeft className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-2xl font-extrabold text-app font-mono">{counts.total}</div>
          <span className="text-[11px] text-app-secondary font-medium">Database Recorded</span>
        </div>
      </div>

      {/* ── Sliding Tabs ──────────────────────────────────── */}
      <Tabs
        tabs={tabsConfig}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId)}
      />

      {/* ── Search & Filter Controls ──────────────────────── */}
      <div className="bg-card border border-app rounded-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              id="transfer-search"
              placeholder="Search candidate name, email, or request reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Search className="h-4 w-4 text-app-muted" />}
            />
          </div>

          <div className="w-full sm:w-64">
            <CustomDropdown
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={(val) => setTypeFilter(val)}
              placeholder="Filter by Request Type"
            />
          </div>
        </div>
      </div>

      {/* ── Requests Queue Content ────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-card border border-dashed border-app rounded-card p-12 text-center space-y-3">
          <CheckSquare className="h-12 w-12 text-app-muted mx-auto" />
          <h3 className="text-base font-bold text-app">No Transfer Requests Found</h3>
          <p className="text-xs text-app-secondary max-w-sm mx-auto">
            {activeTab === 'PENDING'
              ? 'All candidate SLA extensions and curriculum transfer requests have been reviewed.'
              : `No ${activeTab.toLowerCase()} records match your current filter criteria.`}
          </p>
        </div>
      ) : (
        <div key={activeTab} className="space-y-4 animate-fade-in">
          {requests.map((item) => {
            const isPending = item.status === 'PENDING';
            const isUserStudent = item.user?.role === 'USER';

            return (
              <div
                key={item.id}
                className="bg-card border border-app rounded-card p-6 flex flex-col md:flex-row md:items-start justify-between gap-6 shadow-sm hover:shadow-dialog transition-all"
              >
                <div className="space-y-4 flex-1">
                  {/* Requester Identity & Status */}
                  <div className="flex items-center justify-between sm:justify-start gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={item.user?.avatar}
                        name={item.user?.name || 'Student'}
                        size="md"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-app leading-none">
                            {item.user?.name || 'Unnamed Candidate'}
                          </h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-surface border border-app text-app-secondary uppercase tracking-wider">
                            {item.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-app-muted mt-1 flex items-center gap-2">
                          <span>{item.user?.email}</span>
                          {!isUserStudent && item.user?.department && (
                            <>
                              <span>·</span>
                              <span>{item.user.department}</span>
                            </>
                          )}
                          {isUserStudent && (
                            <>
                              <span>·</span>
                              <span className="italic text-app-secondary">Learner</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <StatusBadge
                      status={item.status}
                      label={
                        item.status === 'PENDING'
                          ? 'Awaiting Audit'
                          : item.status === 'APPROVED'
                          ? 'Approved'
                          : 'Rejected'
                      }
                      size="xs"
                    />
                  </div>

                  {/* Transfer Details Card */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {item.type === 'SLA_EXTENSION' && (
                      <>
                        <div className="p-3.5 bg-elevated rounded-btn border border-app space-y-1">
                          <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen className="h-3 w-3 text-brand-500" />
                            Target Course
                          </span>
                          <p className="text-xs font-semibold text-app">
                            {item.course?.title || 'Enrolled Course Curriculum'}
                          </p>
                        </div>
                        <div className="p-3.5 bg-elevated rounded-btn border border-app space-y-1">
                          <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Hourglass className="h-3 w-3 text-amber-500" />
                            Requested SLA Extension
                          </span>
                          <p className="text-xs font-semibold text-amber-500 font-mono">
                            +{item.requestedDays || 14} Days Additional Time
                          </p>
                        </div>
                      </>
                    )}

                    {item.type === 'COURSE_TRANSFER' && (
                      <>
                        <div className="p-3.5 bg-elevated rounded-btn border border-app space-y-1">
                          <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen className="h-3 w-3 text-red-400" />
                            Current Course
                          </span>
                          <p className="text-xs font-medium text-app-secondary">
                            {item.course?.title || 'Initial Track'}
                          </p>
                        </div>
                        <div className="p-3.5 bg-elevated rounded-btn border border-app space-y-1">
                          <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <ArrowRight className="h-3 w-3 text-emerald-500" />
                            Target Reallocation Track
                          </span>
                          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.targetCourse?.title || 'Requested Track'}
                          </p>
                        </div>
                      </>
                    )}

                    {item.type === 'DEPARTMENT_TRANSFER' && (
                      <>
                        <div className="p-3.5 bg-elevated rounded-btn border border-app space-y-1">
                          <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 text-app-muted" />
                            Previous Department
                          </span>
                          <p className="text-xs font-medium text-app">
                            {item.fromDepartment || 'General Operations'}
                          </p>
                        </div>
                        <div className="p-3.5 bg-elevated rounded-btn border border-app space-y-1">
                          <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <ArrowRight className="h-3 w-3 text-brand-500" />
                            Target Department
                          </span>
                          <p className="text-xs font-semibold text-brand-500">
                            {item.toDepartment || 'Cloud Infrastructure'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Justification / Reason */}
                  <div className="p-3.5 bg-elevated rounded-btn border border-app text-xs space-y-1.5">
                    <span className="font-semibold text-app">Statement & Justification:</span>
                    <p className="text-app-secondary whitespace-pre-line leading-relaxed">
                      {item.reason}
                    </p>
                    <div className="pt-2 flex flex-wrap items-center gap-4 text-[11px] text-app-muted border-t border-app/60">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Submitted: {new Date(item.createdAt).toLocaleDateString()} at{' '}
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {item.reviewedBy && (
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3 text-emerald-500" />
                          Audited by: {item.reviewedBy.name} ({new Date(item.reviewedAt).toLocaleDateString()})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Audit Action Buttons */}
                {isPending && canApprove && (
                  <div className="flex md:flex-col items-center gap-2 shrink-0 pt-2 md:pt-0">
                    <Button
                      size="sm"
                      onClick={() => setApproveModal({ open: true, req: item })}
                      leftIcon={<ShieldCheck className="h-4 w-4" />}
                      className="w-full sm:w-auto"
                    >
                      Authorize Request
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRejectModal({ open: true, req: item })}
                      className="w-full sm:w-auto text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Authorize Request Modal ──────────────────────── */}
      <Modal
        isOpen={approveModal.open}
        onClose={() => setApproveModal({ open: false, req: null })}
        title="Authorize Curriculum / SLA Request"
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmApprove();
          }}
          className="space-y-4"
        >
          <div className="p-3.5 bg-elevated rounded-btn border border-app text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-app-muted">Candidate:</span>
              <span className="font-bold text-app">{approveModal.req?.user?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-app-muted">Request Type:</span>
              <span className="font-semibold text-brand-500">
                {approveModal.req?.type?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-app">
              Audit Endorsement Notes (Optional)
            </label>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={3}
              placeholder="E.g. Approved per medical verification or mentor recommendation..."
              className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveModal({ open: false, req: null })}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={actionLoading}
              leftIcon={<ShieldCheck className="h-4 w-4" />}
              className="flex-1"
            >
              Confirm & Authorize
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Reject Request Modal ─────────────────────────── */}
      <Modal
        isOpen={rejectModal.open}
        onClose={() => setRejectModal({ open: false, req: null })}
        title="Reject Request"
        maxWidth="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmReject();
          }}
          className="space-y-4"
        >
          <div className="p-3.5 bg-elevated rounded-btn border border-app text-xs space-y-1.5">
            <p className="text-app-secondary">
              Please enter the reason for rejecting {rejectModal.req?.user?.name}'s{' '}
              {rejectModal.req?.type?.replace(/_/g, ' ').toLowerCase()} request.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-app">
              Rejection Justification
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              required
              placeholder="E.g. Insufficient documentation or SLA extension criteria not met..."
              className="w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm p-3 resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectModal({ open: false, req: null })}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={actionLoading}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
