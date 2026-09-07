import { cn } from '../../utils/cn.js';

export function StatusBadge({ status, size = 'sm', className, label }) {
  if (!status) return null;

  const normalized = String(status).toUpperCase();

  const configs = {
    // Platform / Course statuses
    ACTIVE: {
      dot: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400 font-medium',
      text: label || 'Active',
    },
    DRAFT: {
      dot: 'bg-slate-400 dark:bg-slate-300',
      textColor: 'text-slate-600 dark:text-slate-400 font-medium',
      text: label || 'Draft',
    },
    PUBLISHED: {
      dot: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400 font-medium',
      text: label || 'Published',
    },
    LOCKED: {
      dot: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400 font-medium',
      text: label || 'Locked',
    },
    SUSPENDED: {
      dot: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400 font-medium',
      text: label || 'Suspended',
    },
    PENDING_APPROVAL: {
      dot: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400 font-medium',
      text: label || 'Pending Approval',
    },

    // 3-Stage Course Enrollment Pipeline
    PENDING_CREATOR: {
      dot: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400 font-medium',
      text: label || 'Under Creator Review',
    },
    FORWARDED_TO_ADMIN: {
      dot: 'bg-purple-500',
      textColor: 'text-purple-600 dark:text-purple-400 font-medium',
      text: label || 'Pending Admin Approval',
    },
    APPROVED: {
      dot: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400 font-medium',
      text: label || 'Approved',
    },
    REJECTED: {
      dot: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400 font-medium',
      text: label || 'Rejected',
    },

    // Assignments
    ASSIGNED: {
      dot: 'bg-indigo-500',
      textColor: 'text-indigo-600 dark:text-indigo-400 font-medium',
      text: label || 'Assigned',
    },
    IN_PROGRESS: {
      dot: 'bg-sky-500',
      textColor: 'text-sky-600 dark:text-sky-400 font-medium',
      text: label || 'In Progress',
    },
    UNDER_REVIEW: {
      dot: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400 font-medium',
      text: label || 'Under Review',
    },
    COMPLETED: {
      dot: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400 font-medium',
      text: label || 'Completed',
    },
    OVERDUE: {
      dot: 'bg-red-500 animate-pulse',
      textColor: 'text-red-600 dark:text-red-400 font-semibold',
      text: label || 'Overdue',
    },
    EXPIRED: {
      dot: 'bg-slate-400',
      textColor: 'text-slate-500 dark:text-slate-400 font-medium',
      text: label || 'Expired',
    },

    // Certificates
    VERIFIED: {
      dot: 'bg-teal-500',
      textColor: 'text-teal-600 dark:text-teal-400 font-medium',
      text: label || 'Verified Authentic',
    },
    REVOKED: {
      dot: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400 font-medium',
      text: label || 'Revoked',
    },

    // Risk Levels
    LOW: {
      dot: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400 font-medium',
      text: label || 'Low Risk',
    },
    MEDIUM: {
      dot: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400 font-medium',
      text: label || 'Medium Risk',
    },
    HIGH: {
      dot: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400 font-medium',
      text: label || 'High Risk',
    },
  };

  const config = configs[normalized] || {
    dot: 'bg-slate-400',
    textColor: 'text-app-secondary font-medium',
    text: label || status,
  };

  const sizeClasses = {
    xs: 'text-[11px] gap-1.5',
    sm: 'text-xs gap-1.5',
    md: 'text-sm gap-2',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center select-none shrink-0',
        config.textColor,
        sizeClasses[size] || sizeClasses.sm,
        className
      )}
    >
      <span className={cn('rounded-full shrink-0', config.dot, size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2')} />
      <span>{config.text}</span>
    </span>
  );
}
