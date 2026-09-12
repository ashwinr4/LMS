import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { cn } from '../../utils/cn.js';

export function Tabs({ tabs, activeTab, onChange, className }) {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, isReady: false });

  const updateIndicator = () => {
    const activeEl = tabRefs.current[activeTab];
    if (activeEl) {
      setIndicator({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        isReady: true,
      });
    }
  };

  useLayoutEffect(() => {
    updateIndicator();
    const rafId = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(rafId);
  }, [activeTab, tabs]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab]);

  const handleTabClick = (tabId) => {
    const targetEl = tabRefs.current[tabId];
    if (targetEl) {
      setIndicator({
        left: targetEl.offsetLeft,
        width: targetEl.offsetWidth,
        isReady: true,
      });
    }
    onChange(tabId);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative border-b border-app flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none select-none',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current[tab.id] = el;
            }}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'relative py-3 px-3.5 text-xs sm:text-sm font-semibold transition-colors duration-150 flex items-center gap-2 whitespace-nowrap select-none rounded-t-btn',
              isActive
                ? 'text-brand-600 dark:text-brand-400 font-bold'
                : 'text-app-secondary hover:text-app hover:bg-elevated/50'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>

            {tab.count !== undefined && Number(tab.count) > 0 && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10.5px] font-mono font-bold leading-tight shadow-xs transition-colors',
                  tab.badgeStyle === 'neutral'
                    ? isActive
                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'bg-elevated text-app-muted border border-app'
                    : 'bg-red-500 text-white border border-red-600/30'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}

      {/* Hardware-accelerated Smooth Sliding Active Indicator Bar */}
      <span
        className="absolute bottom-0 h-[2.5px] bg-brand-500 dark:bg-brand-400 rounded-full pointer-events-none shadow-xs shadow-brand-500/40"
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`,
          opacity: indicator.isReady && indicator.width > 0 ? 1 : 0,
          transition: indicator.isReady
            ? 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease-out'
            : 'none',
        }}
      />
    </div>
  );
}
