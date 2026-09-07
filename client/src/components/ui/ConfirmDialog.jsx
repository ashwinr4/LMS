import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';
import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed with this action?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="max-w-md">
      <div className="space-y-4 pt-1">
        <div className="flex items-start gap-3.5">
          <div className={`p-2.5 rounded-full shrink-0 ${
            variant === 'danger'
              ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900'
              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
          }`}>
            {variant === 'danger' ? (
              <Trash2 className="h-5 w-5 animate-icon-trash" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-app leading-snug">{title}</h3>
            <p className="text-xs text-app-secondary mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-app">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
