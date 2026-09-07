import { cn } from '../../utils/cn.js';

export function PageHeader({ title, description, actions, badge, className }) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-app',
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-app">
          {title}
        </h1>
        {description && (
          <p className="text-xs sm:text-sm text-app-secondary leading-relaxed max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  );
}
