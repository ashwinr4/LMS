import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  User, RefreshCw, AlertCircle, Sparkles, Building2, Send, Shield,
  ArrowRightLeft, Hourglass, BookOpen, ArrowRight,
} from 'lucide-react';
import { ModeratorPermissionModal } from '../../components/admin/ModeratorPermissionModal.jsx';

export default function AdminApprovals() {
  const { socket } = useSocket();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlTab = searchParams.get('tab');
  const validTabs = ['enrollments', 'moderators', 'transfers'];
  const [activeTab, setActiveTab] = useState(validTabs.includes(urlTab) ? urlTab : 'enrollments');

  // Keep state synced with URL changes
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab && validTabs.includes(currentTab) && currentTab !== activeTab) {
      setActiveTab(currentTab);
    }
  }, [searchParams]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
  };
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Moderator Approval state
  const [moderatorRequests, setModeratorRequests] = useState([]);
  const [loadingModerators, setLoadingModerators] = useState(true);
  const [modModalOpen, setModModalOpen] = useState(false);
  const [selectedModUser, setSelectedModUser] = useState(null);

  // Transfer & SLA Extension state
  const [transferRequests, setTransferRequests] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [transferCounts, setTransferCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

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

  const fetchModeratorRequests = useCallback(async () => {
    try {
      setLoadingModerators(true);
      const { data } = await api.get('/admin/users?status=PENDING_APPROVAL');
      const mods = (data.users || []).filter(
        (u) => u.requestedRole === 'MODERATOR' || u.role === 'MODERATOR'
      );
      setModeratorRequests(mods);
    } catch (err) {
      console.error('Failed to load pending moderator requests:', err);
    } finally {
      setLoadingModerators(false);
    }
  }, []);

  const fetchTransfers = useCallback(async () => {
    try {
      setLoadingTransfers(true);
      const { data } = await api.get('/transfers');
      if (data?.success) {
        setTransferRequests(data.requests || []);
        if (data.counts) {
          setTransferCounts(data.counts);
        }
      }
    } catch (err) {
      console.error('Failed to load transfers:', err);
    } finally {
      setLoadingTransfers(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    fetchModeratorRequests();
    fetchTransfers();
  }, [fetchQueue, fetchModeratorRequests, fetchTransfers]);

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

    const handleResolved = (data) => {
      if (data?.requestId) {
        setRequests((prev) => prev.filter((r) => r.id !== data.requestId));
      }
      if (data?.userId) {
        setModeratorRequests((prev) => prev.filter((u) => u.id !== data.userId));
      }
      fetchQueue();
      fetchModeratorRequests();
    };

    const handleTransferUpdated = () => fetchTransfers();

    socket.on('admin_new_request', handleNew);
    socket.on('admin_request_resolved', handleResolved);
    socket.on('transfer:created', handleTransferUpdated);
    socket.on('transfer:updated', handleTransferUpdated);

    return () => {
      socket.off('admin_new_request', handleNew);
      socket.off('admin_request_resolved', handleResolved);
      socket.off('transfer:created', handleTransferUpdated);
      socket.off('transfer:updated', handleTransferUpdated);
    };
  }, [socket, fetchQueue, fetchModeratorRequests, fetchTransfers]);

  const handleApproveTransfer = async (transferId, candidateName) => {
    try {
      await api.patch(`/transfers/${transferId}/approve`, {});
      addToast({
        type: 'success',
        title: 'Transfer Request Authorized',
        message: `Request for ${candidateName} has been approved.`,
      });
      fetchTransfers();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.response?.data?.message || 'Could not approve transfer request.',
      });
    }
  };

  const handleRejectTransfer = async (transferId, candidateName) => {
    const reason = window.prompt(`Enter reason for rejecting request from ${candidateName}:`);
    if (!reason) return;
    try {
      await api.patch(`/transfers/${transferId}/reject`, { reason });
      addToast({
        type: 'info',
        title: 'Transfer Request Rejected',
        message: `Candidate has been notified.`,
      });
      fetchTransfers();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.response?.data?.message || 'Could not reject transfer request.',
      });
    }
  };

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

  // Moderator Handlers
  const handleRejectModerator = async (userId, userName) => {
    const confirm = window.confirm(`Reject Moderator role request for ${userName}? The account will be marked SUSPENDED.`);
    if (!confirm) return;
    try {
      await api.patch(`/admin/users/${userId}/status`, { status: 'SUSPENDED' });
      addToast({
        type: 'info',
        title: 'Moderator Request Rejected',
        message: `${userName}'s account status set to Suspended.`,
      });
      fetchModeratorRequests();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.response?.data?.message || 'Failed to update user status.',
      });
    }
  };

  const handleOpenModeratorModal = (user) => {
    setSelectedModUser(user);
    setModModalOpen(true);
  };

  const handleModeratorSaved = (updatedUser) => {
    addToast({
      type: 'success',
      title: 'Moderator Approved & Permissions Assigned',
      message: `${updatedUser.name} has been activated as an operational Moderator.`,
    });
    if (updatedUser?.id) {
      setModeratorRequests((prev) => prev.filter((u) => u.id !== updatedUser.id));
    }
    fetchModeratorRequests();
  };

  const totalPending = requests.length + moderatorRequests.length + transferCounts.pending;

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Administrative Approvals Hub"
        description="Stage 3: Review instructor endorsements, configure operational Moderator permissions, authorize student assignments, and broadcast real-time provisionings."
        badge={
          <StatusBadge
            status={totalPending > 0 ? 'PENDING' : 'ACTIVE'}
            label={`${totalPending} Pending Approval${totalPending !== 1 ? 's' : ''}`}
            size="xs"
          />
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchQueue();
              fetchModeratorRequests();
              fetchTransfers();
            }}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh Queue
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'enrollments', label: 'Enrollment Authorizations', count: requests.length },
          { id: 'moderators', label: 'Moderator Role Requests', count: moderatorRequests.length },
          { id: 'transfers', label: 'Transfer & SLA Extensions', count: transferCounts.pending },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === 'enrollments' && (
        <div key="enrollments" className="animate-fade-in space-y-4">
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
                            {item.student?.role !== 'USER' && item.student?.department ? `${item.student.department} · ` : ''}{item.student?.email}
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

                      <div className="p-3 bg-brand-500/10 dark:bg-brand-500/15 rounded-btn border border-brand-200 dark:border-brand-800 space-y-1">
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
        </div>
      )}

      {/* Moderator Role Requests Tab */}
      {activeTab === 'moderators' && (
        <div key="moderators" className="animate-fade-in space-y-4">
          {loadingModerators ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
            </div>
          ) : moderatorRequests.length === 0 ? (
            <div className="bg-card border border-dashed border-app rounded-card p-12 text-center space-y-3">
              <ShieldCheck className="h-12 w-12 text-app-muted mx-auto" />
              <h3 className="text-base font-bold text-app">No Pending Moderator Requests</h3>
              <p className="text-xs text-app-secondary max-w-sm mx-auto">
                All users who requested the Moderator role during registration have been reviewed and provisioned.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {moderatorRequests.map((modUser) => (
                <div
                  key={modUser.id}
                  className="bg-card border border-app rounded-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm hover:shadow-dialog transition-all"
                >
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center justify-between sm:justify-start gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={modUser.avatar} name={modUser.name || 'User'} size="sm" />
                        <div>
                          <h4 className="text-sm font-bold text-app leading-none">{modUser.name}</h4>
                          <p className="text-[11px] text-app-muted mt-0.5">
                            {modUser.department || 'General'} · {modUser.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <Shield className="h-3 w-3" /> Requested Role: Moderator
                        </span>
                        <StatusBadge status="PENDING" label="Pending Approval" size="xs" />
                      </div>
                    </div>

                    <div className="p-3.5 bg-elevated rounded-btn border border-app text-xs text-app-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-app">Governance Policy: </span>
                        Moderator privileges are dormant until configured. Click "Approve & Configure Permissions" to set granular operational scopes.
                      </div>
                      <span className="text-[11px] text-app-muted whitespace-nowrap">
                        Registered: {new Date(modUser.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRejectModerator(modUser.id, modUser.name)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenModeratorModal(modUser)}
                      leftIcon={<ShieldCheck className="h-4 w-4" />}
                    >
                      Approve & Configure Permissions
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'transfers' && (
        <div key="transfers" className="animate-fade-in space-y-4">
          {loadingTransfers ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-8 w-8 text-brand-500 animate-spin" />
            </div>
          ) : transferRequests.length === 0 ? (
            <div className="bg-card border border-dashed border-app rounded-card p-12 text-center space-y-3">
              <Clock className="h-12 w-12 text-app-muted mx-auto" />
              <h3 className="text-base font-bold text-app">No Active SLA Transfer Requests</h3>
              <p className="text-xs text-app-secondary max-w-sm mx-auto">
                All student course deadline extension requests will be queued here for administrative audit.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {transferRequests.map((item) => {
                const isPending = item.status === 'PENDING';
                const isUserStudent = item.user?.role === 'USER';

                return (
                  <div
                    key={item.id}
                    className="bg-card border border-app rounded-card p-6 flex flex-col md:flex-row md:items-start justify-between gap-6 shadow-sm hover:shadow-dialog transition-all"
                  >
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center justify-between sm:justify-start gap-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={item.user?.avatar} name={item.user?.name || 'Student'} size="sm" />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-app leading-none">{item.user?.name || 'Candidate'}</h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-surface border border-app text-app-secondary uppercase tracking-wider">
                                {item.type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-[11px] text-app-muted mt-0.5">
                              {!isUserStudent && item.user?.department ? `${item.user.department} · ` : ''}{item.user?.email}
                            </p>
                          </div>
                        </div>
                        <StatusBadge
                          status={item.status}
                          label={item.status === 'PENDING' ? 'Awaiting Audit' : item.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                          size="xs"
                        />
                      </div>

                      {/* Request details */}
                      <div className="grid sm:grid-cols-2 gap-3">
                        {item.type === 'SLA_EXTENSION' && (
                          <>
                            <div className="p-3 bg-elevated rounded-btn border border-app space-y-1">
                              <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <BookOpen className="h-3 w-3 text-brand-500" />
                                Target Course
                              </span>
                              <p className="text-xs font-semibold text-app">{item.course?.title || 'Enrolled Curriculum'}</p>
                            </div>
                            <div className="p-3 bg-elevated rounded-btn border border-app space-y-1">
                              <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Hourglass className="h-3 w-3 text-amber-500" />
                                Requested Extension
                              </span>
                              <p className="text-xs font-semibold text-amber-500 font-mono">+{item.requestedDays || 14} Days SLA</p>
                            </div>
                          </>
                        )}
                        {item.type === 'COURSE_TRANSFER' && (
                          <>
                            <div className="p-3 bg-elevated rounded-btn border border-app space-y-1">
                              <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <BookOpen className="h-3 w-3 text-red-400" />
                                Current Course
                              </span>
                              <p className="text-xs font-medium text-app-secondary">{item.course?.title || 'Initial Track'}</p>
                            </div>
                            <div className="p-3 bg-elevated rounded-btn border border-app space-y-1">
                              <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <ArrowRight className="h-3 w-3 text-emerald-500" />
                                Requested Track
                              </span>
                              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{item.targetCourse?.title || 'Target Track'}</p>
                            </div>
                          </>
                        )}
                        {item.type === 'DEPARTMENT_TRANSFER' && (
                          <>
                            <div className="p-3 bg-elevated rounded-btn border border-app space-y-1">
                              <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Building2 className="h-3 w-3 text-app-muted" />
                                Current Department
                              </span>
                              <p className="text-xs font-medium text-app">{item.fromDepartment || 'General'}</p>
                            </div>
                            <div className="p-3 bg-elevated rounded-btn border border-app space-y-1">
                              <span className="text-[10px] text-app-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <ArrowRight className="h-3 w-3 text-brand-500" />
                                Target Department
                              </span>
                              <p className="text-xs font-semibold text-brand-500">{item.toDepartment || 'Target Department'}</p>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Reason */}
                      <div className="p-3 bg-elevated rounded-btn border border-app text-xs space-y-1">
                        <span className="font-semibold text-app">Justification:</span>
                        <p className="text-app-secondary whitespace-pre-line leading-relaxed">{item.reason}</p>
                        <div className="pt-2 flex items-center gap-4 text-[11px] text-app-muted border-t border-app/60">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Submitted: {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                          {item.reviewedBy && (
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3 text-emerald-500" />
                              Audited by: {item.reviewedBy.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {isPending && (
                      <div className="flex md:flex-col items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransfer(item.id, item.user?.name || 'Candidate')}
                          leftIcon={<ShieldCheck className="h-4 w-4" />}
                          className="w-full"
                        >
                          Authorize
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRejectTransfer(item.id, item.user?.name || 'Candidate')}
                          className="w-full text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
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
        </div>
      )}

      {/* Moderator Permission Checklist Modal */}
      <ModeratorPermissionModal
        isOpen={modModalOpen}
        onClose={() => {
          setModModalOpen(false);
          setSelectedModUser(null);
        }}
        user={selectedModUser}
        onSaved={handleModeratorSaved}
      />

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
                {approvalModal.req?.student?.name} {approvalModal.req?.student?.role !== 'USER' && approvalModal.req?.student?.department ? `(${approvalModal.req.student.department})` : ''}
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
