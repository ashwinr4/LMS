import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';
import { ChevronDown, AlertCircle } from 'lucide-react';

export const Select = forwardRef(function Select(
  {
    label,
    error,
    options = [],
    className,
    containerClassName,
    id,
    placeholder = 'Select an option',
    ...props
  },
  ref
) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('w-full space-y-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-gray-700 dark:text-dark-text-secondary select-none"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full appearance-none rounded-btn border border-app bg-surface dark:bg-dark-elevated text-app text-sm transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed h-10 pl-3.5 pr-9',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const labelText = typeof opt === 'string' ? opt : opt.label;
            return (
              <option key={val} value={val}>
                {labelText}
              </option>
            );
          })}
        </select>

        <div className="absolute right-3 pointer-events-none text-app-muted flex items-center">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});
