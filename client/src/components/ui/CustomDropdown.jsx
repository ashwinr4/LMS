import { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn.js';
import { ChevronDown, Check } from 'lucide-react';

export function CustomDropdown({
  value,
  onChange,
  options = [],
  placeholder = 'Select option',
  className,
  id,
  'aria-label': ariaLabel,
  size = 'md',
  direction = 'down',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption = options.find((opt) => (typeof opt === 'string' ? opt : opt.value) === value);
  const selectedLabel = selectedOption
    ? typeof selectedOption === 'string'
      ? selectedOption
      : selectedOption.label
    : placeholder;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={dropdownRef} className={cn('relative inline-block text-left', className)} id={id}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'rounded-btn border border-app bg-elevated/70 hover:border-brand-500/50 text-app font-medium flex items-center justify-between gap-2.5 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all select-none shadow-xs w-full min-w-[140px]',
          size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-xs'
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-app-muted transition-transform duration-200 shrink-0',
            isOpen && 'rotate-180 text-brand-500'
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute right-0 w-full min-w-[175px] rounded-card bg-surface dark:bg-[#1a1d1d] border border-app shadow-2xl py-1.5 z-50 backdrop-blur-md overflow-hidden',
            direction === 'up' ? 'bottom-full mb-1.5 animate-slide-up' : 'mt-1.5 animate-slide-down'
          )}
        >
          <div className="max-h-64 overflow-y-auto scrollbar-thin py-0.5 space-y-0.5">
            {options.map((opt) => {
              const val = typeof opt === 'string' ? opt : opt.value;
              const label = typeof opt === 'string' ? opt : opt.label;
              const isSelected = val === value;

              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    onChange(val);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-[calc(100%-8px)] mx-1 text-left px-3 py-2 text-xs rounded-btn flex items-center justify-between transition-all duration-150 select-none',
                    isSelected
                      ? 'bg-brand-500/15 dark:bg-brand-500/25 text-brand-600 dark:text-brand-400 font-semibold shadow-2xs'
                      : 'text-app hover:bg-slate-100/90 dark:hover:bg-white/[0.07] hover:text-app'
                  )}
                >
                  <span className="truncate">{label}</span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
