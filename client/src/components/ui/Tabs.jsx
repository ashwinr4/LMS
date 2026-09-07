import { cn } from '../../utils/cn.js';

export function Tabs({ tabs, activeTab, onChange, className }) {
  return (
    <div className={cn('border-b border-app flex items-center gap-2 overflow-x-auto scrollbar-thin', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative py-3 px-3.5 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap select-none',
              isActive
                ? 'text-blue-600 dark:text-blue-400 font-bold'
                : 'text-app-secondary hover:text-app hover:bg-elevated/60 rounded-t-btn'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>

            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[11px] font-mono font-bold',
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'bg-elevated text-app-muted border border-app'
                )}
              >
                {tab.count}
              </span>
            )}

            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
