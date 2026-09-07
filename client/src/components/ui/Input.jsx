import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';
import { AlertCircle, X } from 'lucide-react';

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    onClear,
    className,
    containerClassName,
    id,
    type = 'text',
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('w-full space-y-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary select-none"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3 text-app-muted pointer-events-none flex items-center justify-center">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            'w-full rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app placeholder:text-app-muted text-sm transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed',
            leftIcon ? 'pl-9' : 'pl-3.5',
            rightIcon || onClear ? 'pr-9' : 'pr-3.5',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            'h-10',
            className
          )}
          {...props}
        />

        {onClear && props.value && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 text-app-muted hover:text-app transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {rightIcon && !onClear && (
          <div className="absolute right-3 text-app-muted pointer-events-none flex items-center justify-center">
            {rightIcon}
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {helperText && !error && (
        <p className="text-xs text-app-muted">{helperText}</p>
      )}
    </div>
  );
});
