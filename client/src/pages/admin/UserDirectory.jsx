import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../routes/routeMap.js';
import { api } from '../../services/api.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import {
  Users,
  UserPlus,
  FileSpreadsheet,
  Search,
  Lock,
  Unlock,
  Shield,
  KeyRound,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Upload,
  Download,
  Filter,
  RefreshCw,
  MoreVertical,
  Building2,
  Mail,
  UserCheck,
  UserX,
} from 'lucide-react';
import { CustomDropdown } from '../../components/ui/CustomDropdown.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { SegmentedToggle } from '../../components/ui/SegmentedToggle.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function UserDirectory() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & Search State
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState('USER');

  // Create Form State
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    department: 'Engineering',
    role: 'USER',
    temporaryPassword: '',
    phone: '',
    location: '',
  });

  // Bulk Import State
  const [importFile, setImportFile] = useState(null);
  const [importDryRun, setImportDryRun] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchUsers();
  }, [selectedRole, selectedStatus]);

  // Real-time synchronization for password resets & account locks
  useEffect(() => {
    if (!socket) return;

    const handlePasswordResetReq = (data) => {
      if (data?.userId) {
        setUsers((prev) =>
          prev.map((u) => (u.id === data.userId ? { ...u, passwordResetRequested: true } : u))
        );
      }
    };

    const handlePasswordResetDone = (data) => {
      if (data?.userId) {
        setUsers((prev) =>
          prev.map((u) => (u.id === data.userId ? { ...u, passwordResetRequested: false } : u))
        );
      }
    };

    const handleStatusUpdated = (data) => {
      if (data?.userId) {
        setUsers((prev) =>
          prev.map((u) => (u.id === data.userId ? { ...u, status: data.status } : u))
        );
      }
    };

    socket.on('password_reset_requested', handlePasswordResetReq);
    socket.on('password_reset_completed', handlePasswordResetDone);
    socket.on('user_status_updated', handleStatusUpdated);

    return () => {
      socket.off('password_reset_requested', handlePasswordResetReq);
      socket.off('password_reset_completed', handlePasswordResetDone);
      socket.off('user_status_updated', handleStatusUpdated);
    };
  }, [socket]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        role: selectedRole,
        status: selectedStatus,
        search: search.trim() || undefined,
      };
      const res = await api.get('/admin/users', { params });
      if (res.data.success) {
        const rawUsers = res.data.users || [];
        const filtered = rawUsers.filter(
          (u) => u.id !== currentUser?.id && u.email?.toLowerCase() !== currentUser?.email?.toLowerCase()
        );
        setUsers(filtered);
        setStats(res.data.stats || null);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.response?.data?.message || 'Failed to fetch user directory.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsers();
  };

  // Status Action (Lock, Unlock, Suspend, Activate)
  const handleUpdateStatus = async (userId, newStatus) => {
    try {
      const res = await api.patch(`/admin/users/${userId}/status`, { status: newStatus });
      if (res.data.success) {
        fetchUsers();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update user status.');
    }
  };

  // Role Action
  const handleOpenRoleModal = (user) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setShowRoleModal(true);
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const res = await api.patch(`/admin/users/${selectedUser.id}/role`, { role: newRole });
      if (res.data.success) {
        setShowRoleModal(false);
        fetchUsers();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update user role.');
    }
  };

  // Password Reset Action
  const handleResetPassword = async (user) => {
    if (!confirm(`Trigger password reset for ${user.name} (${user.email})?`)) return;
    try {
      const res = await api.post(`/admin/users/${user.id}/reset-password`);
      if (res.data.success) {
        alert(`Password reset successfully!\nTemporary Password: ${res.data.temporaryPassword}`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reset password.');
    }
  };

  // Single User Create
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/users', createForm);
      if (res.data.success) {
        setShowCreateModal(false);
        setCreateForm({
          name: '',
          email: '',
          department: 'Engineering',
          role: 'USER',
          temporaryPassword: '',
          phone: '',
          location: '',
        });
        fetchUsers();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create user.');
    }
  };

  // Bulk File Upload & Dry Run
  const handleFileChange = async (file) => {
    if (!file) return;
    setImportFile(file);
    setImportResult(null);
    setImportDryRun(null);
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dryRun', 'true');

      const res = await api.post('/admin/users/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        setImportDryRun(res.data);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to parse import file.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleExecuteLiveImport = async () => {
    if (!importFile) return;
    setImportLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('dryRun', 'false');

      const res = await api.post('/admin/users/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        setImportResult(res.data);
        setImportDryRun(null);
        fetchUsers();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to execute bulk import.');
    } finally {
      setImportLoading(false);
    }
  };

  const downloadSampleTemplate = () => {
    const csvContent =
      'name,email,department,role,location\n' +
      'Alex Mercer,alex.mercer@qualiva.io,Cloud Engineering,USER,San Francisco\n' +
      'Maria Gonzalez,maria.g@qualiva.io,Cybersecurity,COURSE_CREATOR,Austin\n' +
      'Liam Vance,liam.vance@qualiva.io,DevOps,USER,New York\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'qualiva_users_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const displayUsers = users.filter(
    (u) => u.id !== currentUser?.id && u.email?.toLowerCase() !== currentUser?.email?.toLowerCase()
  );

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Enterprise User Directory"
        description="Provision accounts, assign RBAC security roles, enforce account lockouts, and execute bulk XLSX employee imports."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setImportFile(null);
                setImportDryRun(null);
                setImportResult(null);
                setShowImportModal(true);
              }}
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-emerald-500" />}
            >
              Bulk XLSX Import
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              leftIcon={<UserPlus className="h-4 w-4" />}
            >
              Provision User
            </Button>
          </div>
        }
      />

      {/* Filter & Search Bar */}
      <div className="bg-card border border-app rounded-card p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-80">
          <Input
            placeholder="Search by name, email, or dept..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="text-xs h-9"
          />
          <Button type="submit" variant="secondary" size="xs" className="h-9 px-3">
            Search
          </Button>
        </form>

        {/* Filter Controls: Role Dropdown & Status Toggle */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Role Custom Dropdown Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="role-filter" className="text-xs font-semibold text-app-secondary">
              Role:
            </label>
            <CustomDropdown
              id="role-filter"
              value={selectedRole}
              onChange={setSelectedRole}
              options={[
                { value: 'ALL', label: 'All Roles' },
                { value: 'ADMIN', label: 'Administrator' },
                { value: 'COURSE_CREATOR', label: 'Course Creator' },
                { value: 'MODERATOR', label: 'Moderator' },
                { value: 'USER', label: 'User / Learner' },
              ]}
            />
          </div>

          {/* All / Active Segmented Sliding Toggle */}
          <SegmentedToggle
            options={[
              { id: 'ALL', label: 'All' },
              { id: 'ACTIVE', label: 'Active' },
            ]}
            value={selectedStatus}
            onChange={setSelectedStatus}
            size="xs"
            color="brand"
          />
        </div>
      </div>

      {/* User Directory Table */}
      <div className="bg-card border border-app rounded-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-surface-tertiary rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{error}</p>
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="h-10 w-10 text-app-muted mx-auto" />
            <h4 className="text-sm font-bold text-app">No Users Match Filters</h4>
            <p className="text-xs text-app-secondary">Try adjusting your search query or role filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-app bg-surface-tertiary/40 dark:bg-dark-elevated/20 text-app-secondary uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Department & Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Enrollments / Certs</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayUsers.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(ROUTES.ADMIN_USER_DETAIL(u.id))}
                    className="table-row-inset-divider hover:bg-surface-tertiary/40 dark:hover:bg-dark-elevated/40 transition-colors cursor-pointer group"
                    title="Click to view and edit user details"
                  >
                    {/* User Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={u.avatar}
                          name={u.name}
                          size="sm"
                        />
                        <div>
                          <p className="font-bold text-app group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                            {u.name}
                          </p>
                          <p className="text-app-secondary font-mono text-[11px]">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Department & Role */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        {u.role === 'USER' ? (
                          <span className="text-app-muted italic text-[11px] block">Learner</span>
                        ) : (
                          <p className="font-semibold text-sm text-app">{u.department || 'General'}</p>
                        )}
                        <p
                          className={`text-xs ${
                            u.role === 'ADMIN'
                              ? 'text-purple-600 dark:text-purple-400 font-semibold'
                              : u.role === 'COURSE_CREATOR'
                              ? 'text-brand-600 dark:text-brand-400 font-semibold'
                              : u.role === 'MODERATOR'
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-app-muted font-normal'
                          }`}
                        >
                          {u.role === 'ADMIN'
                            ? 'Administrator'
                            : u.role === 'COURSE_CREATOR'
                            ? 'Course Creator'
                            : u.role === 'MODERATOR'
                            ? 'Moderator'
                            : 'Learner'}
                        </p>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <StatusBadge status={u.status} size="xs" />
                      {u.status === 'LOCKED' && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {u.failedLoginAttempts} failed attempts
                        </p>
                      )}
                    </td>

                    {/* Stats */}
                    <td className="py-3.5 px-4 font-mono text-xs text-app-secondary">
                      <span>{u._count?.assignments || 0} courses</span> •{' '}
                      <span className="text-teal-600 dark:text-teal-400 font-bold">
                        {u._count?.certificates || 0} certs
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-3">
                        {u.status === 'LOCKED' || u.status === 'SUSPENDED' ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(u.id, 'ACTIVE')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline transition-colors"
                            title="Unlock Account"
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            Unlock
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(u.id, 'LOCKED')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline transition-colors"
                            title="Lock Account"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Lock
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenRoleModal(u)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline transition-colors"
                          title="Modify Security Role"
                        >
                          <Shield className="h-3.5 w-3.5" />
                          Role
                        </button>

                        {u.passwordResetRequested && (
                          <button
                            type="button"
                            onClick={() => handleResetPassword(u)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline transition-colors"
                            title="User requested a password reset"
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <KeyRound className="h-3.5 w-3.5" />
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual User Creation Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Provision New Enterprise User"
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-app-secondary uppercase">Full Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Jordan Hayes"
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-app-secondary uppercase">Email Address</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="e.g. jordan.h@qualiva.io"
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-app-secondary uppercase">Department</label>
              <input
                type="text"
                value={createForm.department}
                onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-app-secondary uppercase">RBAC Role</label>
              <CustomDropdown
                value={createForm.role}
                onChange={(val) => setCreateForm({ ...createForm, role: val })}
                options={[
                  { value: 'USER', label: 'Student / Standard User' },
                  { value: 'COURSE_CREATOR', label: 'Course Creator' },
                  { value: 'MODERATOR', label: 'Moderator' },
                  { value: 'ADMIN', label: 'Administrator' },
                ]}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-app-secondary uppercase">
              Temporary Password (Optional)
            </label>
            <input
              type="text"
              value={createForm.temporaryPassword}
              onChange={(e) => setCreateForm({ ...createForm, temporaryPassword: e.target.value })}
              placeholder="Default: QualivaPass2026!"
              className="w-full bg-surface dark:bg-dark-surface border border-app rounded-btn p-2 text-xs text-app font-mono"
            />
            <p className="text-[11px] text-app-muted">User will be prompted to reset password on first login.</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Role Assignment Modal */}
      {selectedUser && (
        <Modal
          isOpen={showRoleModal}
          onClose={() => setShowRoleModal(false)}
          title="Update RBAC Role"
        >
          <form onSubmit={handleUpdateRole} className="space-y-4 text-sm">
            <p className="text-xs text-app-secondary">
              Modify security role and access privileges for{' '}
              <strong className="text-app">{selectedUser.name}</strong> ({selectedUser.email}).
            </p>

            <div className="space-y-2">
              {[
                { r: 'USER', label: 'Student / User', desc: 'Can browse catalog, request enrollments, learn, and take exams.' },
                { r: 'COURSE_CREATOR', label: 'Course Creator', desc: 'Can author courses, manage curriculum, build question banks, and endorse enrollments.' },
                { r: 'MODERATOR', label: 'Moderator', desc: 'Can review course quality, view directory, and approve transfer requests.' },
                { r: 'ADMIN', label: 'System Administrator', desc: 'Full root access to user management, approvals, course lifecycle, and security logs.' },
              ].map((opt) => (
                <label
                  key={opt.r}
                  className={`p-3 rounded-card border text-xs flex items-start gap-3 cursor-pointer transition-all ${
                    newRole === opt.r
                      ? 'border-brand-500 bg-brand-500/[0.08] font-bold'
                      : 'border-app bg-card hover:bg-surface-tertiary/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="rbac_role"
                    checked={newRole === opt.r}
                    onChange={() => setNewRole(opt.r)}
                    className="mt-0.5 text-brand-600"
                  />
                  <div>
                    <p className="text-app font-bold">{opt.label}</p>
                    <p className="text-app-secondary font-normal text-[11px] mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-app">
              <Button type="button" variant="secondary" onClick={() => setShowRoleModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Role
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk XLSX Import Modal with Drag-and-Drop & Dry Run */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Bulk Enterprise User Import (.xlsx / .csv)"
        className="max-w-3xl"
      >
        <div className="space-y-5 text-xs">
          {/* Top Info & Download Template */}
          <div className="flex items-center justify-between p-3 rounded-card bg-surface-tertiary/50 dark:bg-dark-elevated/30 border border-app">
            <div>
              <p className="font-bold text-app">Required Columns: name, email, department, role</p>
              <p className="text-[11px] text-app-muted">Supports Microsoft Excel (.xlsx, .xls) and CSV files.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={downloadSampleTemplate}
              leftIcon={<Download className="h-3.5 w-3.5" />}
            >
              Template
            </Button>
          </div>

          {/* Upload Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-app hover:border-brand-500 rounded-card p-6 text-center cursor-pointer space-y-2 transition-colors bg-card"
          >
            <Upload className="h-8 w-8 text-brand-500 mx-auto" />
            <p className="font-bold text-app">
              {importFile ? importFile.name : 'Click or Drag & Drop Excel/CSV File here'}
            </p>
            <p className="text-[11px] text-app-secondary">
              {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : 'Up to 10MB per batch'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
              className="hidden"
            />
          </div>

          {importLoading && (
            <div className="p-4 text-center text-app-secondary font-semibold animate-pulse">
              Parsing & Validating Rows...
            </div>
          )}

          {/* Dry Run Validation Table */}
          {importDryRun && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-app uppercase tracking-wider text-[11px]">
                  Dry-Run Validation Report
                </h4>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                    {importDryRun.summary?.validRows} Valid
                  </span>
                  <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-600 font-bold">
                    {importDryRun.summary?.invalidRows} Invalid
                  </span>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto border border-app rounded-card">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-surface-tertiary/60 dark:bg-dark-elevated sticky top-0">
                    <tr className="border-b border-app font-bold">
                      <th className="p-2">Row</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Role</th>
                      <th className="p-2">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {(importDryRun.rows || []).map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'bg-emerald-500/[0.02]' : 'bg-red-500/[0.04]'}>
                        <td className="p-2 font-mono">{row.rowNumber}</td>
                        <td className="p-2 font-medium text-app">{row.name || '—'}</td>
                        <td className="p-2 font-mono text-app-secondary">{row.email || '—'}</td>
                        <td className="p-2 font-mono">{row.role}</td>
                        <td className="p-2">
                          {row.isValid ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Valid
                            </span>
                          ) : (
                            <span className="text-red-500 font-semibold">{row.errors?.join(', ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Success Notification */}
          {importResult && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-card text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
              <h4 className="font-bold text-sm text-emerald-700 dark:text-emerald-300">
                Bulk Import Completed!
              </h4>
              <p className="text-xs text-app-secondary">
                Successfully provisioned <strong>{importResult.summary?.importedCount}</strong> enterprise users.
              </p>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-app">
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              Close
            </Button>
            {importDryRun && importDryRun.summary?.validRows > 0 && (
              <Button
                variant="primary"
                onClick={handleExecuteLiveImport}
                disabled={importLoading}
                leftIcon={<UserCheck className="h-4 w-4" />}
              >
                Execute Import ({importDryRun.summary?.validRows} Users)
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
