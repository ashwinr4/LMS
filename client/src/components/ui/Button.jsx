import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';
import { Loader2 } from 'lucide-react';

export const Button = forwardRef(function Button(
  {
    children,
    className,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled = false,
    leftIcon = null,
    rightIcon = null,
    type = 'button',
    ...props
  },
  ref
) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-btn transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:pointer-events-none select-none';

  const variants = {
    primary:
      'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-sm',
    secondary:
      'bg-surface-tertiary hover:bg-surface-border text-gray-800 dark:bg-dark-elevated dark:hover:bg-dark-border dark:text-dark-text border border-app',
    outline:
      'border border-app hover:bg-surface-tertiary text-gray-700 dark:text-dark-text dark:hover:bg-dark-elevated bg-transparent',
    ghost:
      'hover:bg-surface-tertiary dark:hover:bg-dark-elevated text-gray-700 dark:text-dark-text bg-transparent',
    danger:
      'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
    success:
      'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-base gap-2.5',
    icon: 'h-9 w-9 p-0',
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});
