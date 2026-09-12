import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { cn } from '../../utils/cn.js';

/**
 * SegmentedToggle
 * Hardware-accelerated sliding pill / capsule toggle component.
 * Features a fluid sliding active backdrop indicator with cubic-bezier easing.
 */
export function SegmentedToggle({
  options = [],
  value,
  onChange,
  size = 'sm',
  color = 'brand',
  className,
}) {
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, isReady: false });

  const updateIndicator = () => {
    const activeEl = buttonRefs.current[value];
    if (activeEl && containerRef.current) {
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
  }, [value, options]);

  useEffect(() => {
    const handleResize = () => updateIndicator();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [value]);

  const handleSelect = (optionId) => {
    const targetEl = buttonRefs.current[optionId];
    if (targetEl) {
      setIndicator({
        left: targetEl.offsetLeft,
        width: targetEl.offsetWidth,
        isReady: true,
      });
    }
    if (onChange) {
      onChange(optionId);
    }
  };

  const getPillColor = () => {
    switch (color) {
      case 'emerald':
        return 'bg-emerald-600 text-white shadow-xs';
      case 'purple':
        return 'bg-purple-600 text-white shadow-xs';
      case 'blue':
      case 'brand':
      default:
        return 'bg-blue-600 text-white shadow-xs';
    }
  };

  const sizeStyles = {
    xs: 'p-0.5 text-xs',
    sm: 'p-1 text-xs',
    md: 'p-1 text-sm',
  };

  const pillInsetStyles = {
    xs: 'top-0.5 bottom-0.5',
    sm: 'top-1 bottom-1',
    md: 'top-1 bottom-1',
  };

  const buttonSizeStyles = {
    xs: 'px-2.5 py-1',
    sm: 'px-3 py-1.5',
    md: 'px-4 py-2',
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-flex items-center rounded-btn bg-elevated border border-app select-none overflow-x-auto scrollbar-none',
        sizeStyles[size] || sizeStyles.sm,
        className
      )}
    >
      {/* Hardware-accelerated Smooth Sliding Active Capsule with Perfect Vertical Centering */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute rounded-md pointer-events-none will-change-transform z-0',
          pillInsetStyles[size] || pillInsetStyles.sm,
          getPillColor()
        )}
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`,
          opacity: indicator.isReady && indicator.width > 0 ? 1 : 0,
          transition: indicator.isReady
            ? 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1), width 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease-out'
            : 'none',
        }}
      />

      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              if (el) buttonRefs.current[opt.id] = el;
            }}
            type="button"
            onClick={() => handleSelect(opt.id)}
            className={cn(
              'relative z-10 font-semibold rounded-md transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap bg-transparent cursor-pointer',
              buttonSizeStyles[size] || buttonSizeStyles.sm,
              isActive
                ? 'text-white'
                : 'text-app-secondary hover:text-app'
            )}
          >
            {opt.icon && (
              <span className={cn('shrink-0', isActive ? 'text-white' : 'text-app-muted')}>
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold leading-tight transition-colors',
                  isActive
                    ? 'bg-white/25 text-white'
                    : 'bg-surface-tertiary text-app-muted'
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
