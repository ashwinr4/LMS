import { useState, useEffect } from 'react';
import { Button } from '../ui/Button.jsx';
import {
  ShieldCheck,
  Users,
  BookOpen,
  CheckSquare,
  FileCheck2,
  ArrowRightLeft,
  Mail,
  FileText,
  X,
  AlertCircle,
  Check,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../services/api.js';

export const MODERATOR_MODULES = [
  {
    id: 'users',
    label: 'User Directory',
    description: 'Inspect user identities and oversee directory accounts.',
    icon: Users,
    actions: [
      { id: 'view', label: 'View', description: 'Search and inspect user profiles and directory records' },
      { id: 'manage', label: 'Manage', description: 'Update department and general user details' },
    ],
  },
  {
    id: 'courses',
    label: 'Courses & Curriculum',
    description: 'Audit course quality, review lesson modules, and enforce standards.',
    icon: BookOpen,
    actions: [
      { id: 'view', label: 'View', description: 'Open courses, inspect modules, sections, and lessons' },
      { id: 'manage', label: 'Manage', description: 'Update course status, publish or archive modules' },
    ],
  },
  {
    id: 'enrollments',
    label: 'Course Enrollments',
    description: 'Review student applications and process course admissions.',
    icon: CheckSquare,
    actions: [
      { id: 'view', label: 'View', description: 'Inspect pending student applications and review justifications' },
      { id: 'manage', label: 'Manage', description: 'Assign due dates and update enrollment terms' },
      { id: 'approve', label: 'Approve', description: 'Authorize or reject student enrollment requests' },
    ],
  },
  {
    id: 'assessments',
    label: 'Assessments & Question Banks',
    description: 'Verify passing thresholds and examination questions.',
    icon: FileCheck2,
    actions: [
      { id: 'view', label: 'View', description: 'Inspect exams, randomized question banks, and attempts' },
      { id: 'manage', label: 'Manage', description: 'Adjust questions, passing thresholds, and durations' },
    ],
  },
  {
    id: 'transfers',
    label: 'Transfers & Reassignments',
    description: 'Handle employee course reallocations and department moves.',
    icon: ArrowRightLeft,
    actions: [
      { id: 'view', label: 'View', description: 'Inspect pending reassignments and transfer requests' },
      { id: 'manage', label: 'Manage', description: 'Edit transfer justifications and target curriculums' },
      { id: 'approve', label: 'Approve', description: 'Sign off on course reallocations and department moves' },
    ],
  },
  {
    id: 'messages',
    label: 'Enterprise Messages',
    description: 'Engage with learners, moderators, and support inquiries.',
    icon: Mail,
    actions: [
      { id: 'view', label: 'View', description: 'Read incoming community announcements and queries' },
      { id: 'manage', label: 'Manage', description: 'Dispatch replies and post announcements' },
    ],
  },
  {
    id: 'auditLogs',
    label: 'Security & Audit Logs',
    description: 'Review compliance trails and system access logs.',
    icon: FileText,
    actions: [
      { id: 'view', label: 'View Only', description: 'Inspect immutable actor activities and security timestamps' },
    ],
  },
];

export function ModeratorPermissionModal({ isOpen, onClose, user, onSaved }) {
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      let initialPerms = {};
      if (user.moderatorPermissions) {
        try {
          initialPerms = typeof user.moderatorPermissions === 'string'
            ? JSON.parse(user.moderatorPermissions)
            : user.moderatorPermissions;
        } catch {
          initialPerms = {};
        }
      }
      setPermissions(initialPerms || {});
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleToggleAction = (moduleId, actionId) => {
    setPermissions((prev) => {
      const modulePerms = prev[moduleId] || {};
      const nextVal = !modulePerms[actionId];

      const updatedModule = { ...modulePerms, [actionId]: nextVal };

      // If manage or approve is enabled, auto-enable view
      if ((actionId === 'manage' || actionId === 'approve') && nextVal) {
        updatedModule.view = true;
      }

      // If view is disabled, auto-disable manage and approve
      if (actionId === 'view' && !nextVal) {
        updatedModule.manage = false;
        if (updatedModule.approve !== undefined) updatedModule.approve = false;
      }

      return {
        ...prev,
        [moduleId]: updatedModule,
      };
    });
  };

  const handleSelectAll = () => {
    const all = {};
    MODERATOR_MODULES.forEach((mod) => {
      all[mod.id] = {};
      mod.actions.forEach((act) => {
        all[mod.id][act.id] = true;
      });
    });
    setPermissions(all);
  };

  const handleClearAll = () => {
    setPermissions({});
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put(`/admin/users/${user.id}/moderator-permissions`, {
        permissions,
        activate: true,
      });
      if (onSaved) {
        onSaved(data.user || { ...user, moderatorPermissions: permissions, status: 'ACTIVE' });
      }
      onClose();
    } catch (err) {
      console.error('Failed to update moderator permissions:', err);
      setError(err.response?.data?.message || err.message || 'Failed to save moderator permissions.');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = Object.values(permissions).reduce((total, mod) => {
    return total + Object.values(mod || {}).filter(Boolean).length;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-card border border-app rounded-card max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-app">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-app flex items-center justify-between bg-surface dark:bg-dark-surface shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-amber-500 dark:text-amber-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-app">Configure Moderator Permissions</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-elevated border border-app text-app-secondary">
                  {user.name}
                </span>
              </div>
              <p className="text-xs text-app-secondary mt-0.5">
                Assign granular module capabilities for {user.email}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-app-muted hover:text-app hover:bg-slate-200 dark:hover:bg-dark-elevated transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Global Toolbar & Info */}
        <div className="px-6 py-2.5 bg-elevated/40 border-b border-app flex items-center justify-between text-xs shrink-0">
          <span className="text-app-secondary">
            Active permissions: <strong className="text-app font-mono">{activeCount}</strong> selected
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-brand-600 dark:text-brand-400 hover:underline font-semibold"
            >
              Select All
            </button>
            <span className="text-app-muted">·</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-app-muted hover:text-app transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-btn text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Module Checklist Body (Scrollable with dark/light matching scrollbar) */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {MODERATOR_MODULES.map((mod) => {
            const ModIcon = mod.icon;
            const currentModulePerms = permissions[mod.id] || {};
            const isModuleActive = Object.values(currentModulePerms).some(Boolean);

            return (
              <div
                key={mod.id}
                className={`p-4 rounded-card border transition-all ${
                  isModuleActive
                    ? 'border-brand-500/40 bg-surface dark:bg-dark-surface'
                    : 'border-app bg-elevated/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <ModIcon className={`h-4 w-4 ${isModuleActive ? 'text-brand-600 dark:text-brand-400' : 'text-app-muted'}`} />
                    <span className="font-semibold text-xs text-app">{mod.label}</span>
                  </div>
                  <span className="text-[11px] text-app-muted">{mod.description}</span>
                </div>

                <div className="grid sm:grid-cols-3 gap-2.5 pt-1">
                  {mod.actions.map((act) => {
                    const isChecked = Boolean(currentModulePerms[act.id]);

                    return (
                      <label
                        key={act.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-btn border cursor-pointer select-none transition-colors ${
                          isChecked
                            ? 'bg-brand-500/10 border-brand-500/30 text-app'
                            : 'bg-elevated/60 border-app text-app-secondary hover:border-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleAction(mod.id, act.id)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-app text-brand-600 focus:ring-brand-500"
                        />
                        <div className="space-y-0.5 min-w-0">
                          <span className={`text-xs font-semibold block ${isChecked ? 'text-brand-600 dark:text-brand-400' : 'text-app'}`}>
                            {act.label}
                          </span>
                          <span className="text-[10px] text-app-muted block leading-tight truncate" title={act.description}>
                            {act.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-app flex items-center justify-between bg-surface dark:bg-dark-surface shrink-0 gap-4">
          <p className="text-[11px] text-app-muted hidden sm:block">
            Saving activates the Moderator account and records an immutable audit log.
          </p>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="h-10 px-4 rounded-btn border border-app hover:bg-slate-200/70 dark:hover:bg-dark-elevated text-app text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="h-10 px-5 rounded-btn bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Check className="h-4 w-4 shrink-0 stroke-[2.5]" />
              )}
              <span>Confirm Permissions & Activate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
