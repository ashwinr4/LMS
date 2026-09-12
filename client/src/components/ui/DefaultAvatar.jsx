import { cn } from '../../utils/cn.js';

export function DefaultAvatar({ className, size = 'md' }) {
  const sizeClasses = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden bg-slate-200 dark:bg-[#202327] border border-app flex items-center justify-center shrink-0 select-none shadow-xs',
        typeof size === 'string' ? sizeClasses[size] || sizeClasses.md : '',
        className
      )}
    >
      <svg
        className="w-full h-full text-slate-400 dark:text-slate-500 scale-[0.85] translate-y-[8%]"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  );
}
