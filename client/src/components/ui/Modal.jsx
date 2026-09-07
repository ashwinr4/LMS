import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn.js';
import { X } from 'lucide-react';

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
  showClose = true,
  className,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in"
      />

      {/* Modal Card - Constrained to 88vh so top and bottom never clip */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full max-h-[88vh] flex flex-col bg-surface dark:bg-dark-surface border border-app rounded-dialog shadow-dialog p-5 sm:p-6 z-10 animate-slide-up my-auto',
          maxWidth,
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 mb-3 shrink-0">
          <div>
            {title && (
              <h3 className="text-lg font-bold text-app tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-app-secondary mt-0.5">{description}</p>
            )}
          </div>

          {showClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-btn text-app-muted hover:text-app hover:bg-elevated transition-colors -mr-1 -mt-1"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
