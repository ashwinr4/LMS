import { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn.js';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ title, message, type = 'info', duration = 4000 }) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
      const newToast = { id, title, message, type };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const toast = {
    success: (title, message) => addToast({ title, message, type: 'success' }),
    error: (title, message) => addToast({ title, message, type: 'error' }),
    warning: (title, message) => addToast({ title, message, type: 'warning' }),
    info: (title, message) => addToast({ title, message, type: 'info' }),
  };

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
    info: <Info className="h-5 w-5 text-brand-500 shrink-0" />,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="alert"
                className={cn(
                  'pointer-events-auto bg-surface dark:bg-dark-surface border border-app rounded-card p-4 shadow-dialog flex items-start gap-3 animate-slide-up transition-all'
                )}
              >
                {icons[t.type]}
                <div className="flex-1 min-w-0">
                  {t.title && (
                    <h4 className="text-sm font-semibold text-app leading-tight mb-0.5">
                      {t.title}
                    </h4>
                  )}
                  {t.message && (
                    <p className="text-xs text-app-secondary leading-relaxed">
                      {t.message}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(t.id)}
                  className="text-app-muted hover:text-app p-0.5 rounded transition-colors shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
