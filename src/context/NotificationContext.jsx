import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [alertDialog, setAlertDialog] = useState(null);

  // 1. Toast Notification Manager
  const showToast = useCallback(({ type = 'info', title = '', message = '', duration = 4000 }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newToast = { id, type, title, message, duration };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Quick Toast Helpers
  const toast = {
    success: (message, title = '') => showToast({ type: 'success', title, message }),
    error: (message, title = '') => showToast({ type: 'error', title, message }),
    warning: (message, title = '') => showToast({ type: 'warning', title, message }),
    info: (message, title = '') => showToast({ type: 'info', title, message }),
  };

  // 2. Custom Confirmation Modal (replaces window.confirm)
  const showConfirm = useCallback(
    ({
      title = '',
      message = '',
      confirmText = 'تأكيد',
      cancelText = 'إلغاء',
      variant = 'primary', // 'primary' | 'danger' | 'warning'
      onConfirm,
      onCancel,
    }) => {
      return new Promise((resolve) => {
        setConfirmDialog({
          title,
          message,
          confirmText,
          cancelText,
          variant,
          onConfirm: () => {
            setConfirmDialog(null);
            if (onConfirm) onConfirm();
            resolve(true);
          },
          onCancel: () => {
            setConfirmDialog(null);
            if (onCancel) onCancel();
            resolve(false);
          },
        });
      });
    },
    []
  );

  // 3. Custom Alert Modal (replaces native window.alert)
  const showAlert = useCallback(
    ({
      title = '',
      message = '',
      variant = 'warning', // 'warning' | 'error' | 'info' | 'success'
      buttonText = 'حسناً',
      onClose,
    }) => {
      return new Promise((resolve) => {
        setAlertDialog({
          title,
          message,
          variant,
          buttonText,
          onClose: () => {
            setAlertDialog(null);
            if (onClose) onClose();
            resolve(true);
          },
        });
      });
    },
    []
  );

  return (
    <NotificationContext.Provider
      value={{
        showToast,
        removeToast,
        toast,
        showConfirm,
        showAlert,
      }}
    >
      {children}

      {/* FLOATING TOASTS CONTAINER */}
      <div className="fixed top-4 end-4 z-9999 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-3">
        {toasts.map((t) => {
          const config = {
            success: {
              border: 'border-emerald-200 bg-emerald-50/95 text-emerald-950',
              icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />,
              bar: 'bg-emerald-500',
            },
            error: {
              border: 'border-rose-200 bg-rose-50/95 text-rose-950',
              icon: <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />,
              bar: 'bg-rose-500',
            },
            warning: {
              border: 'border-amber-200 bg-amber-50/95 text-amber-950',
              icon: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />,
              bar: 'bg-amber-500',
            },
            info: {
              border: 'border-indigo-200 bg-indigo-50/95 text-indigo-950',
              icon: <Info className="h-5 w-5 text-indigo-600 shrink-0" />,
              bar: 'bg-indigo-500',
            },
          }[t.type] || {
            border: 'border-slate-200 bg-white/95 text-slate-900',
            icon: <Info className="h-5 w-5 text-slate-600 shrink-0" />,
            bar: 'bg-slate-500',
          };

          return (
            <div
              key={t.id}
              className={`pointer-events-auto p-4 rounded-2xl border shadow-xl backdrop-blur-md flex items-start gap-3 transition-all animate-in slide-in-from-top-3 fade-in duration-200 ${config.border}`}
            >
              {config.icon}
              <div className="flex-1 min-w-0 text-start">
                {t.title && <div className="font-extrabold text-xs mb-0.5">{t.title}</div>}
                <div className="text-xs font-semibold leading-relaxed whitespace-pre-line">{t.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* THEMED CONFIRMATION MODAL */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-9999 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in zoom-in-95 duration-150 text-start">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl shrink-0 ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-rose-100 text-rose-700'
                    : confirmDialog.variant === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {confirmDialog.variant === 'danger' ? (
                  <AlertCircle className="h-6 w-6" />
                ) : confirmDialog.variant === 'warning' ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <HelpCircle className="h-6 w-6" />
                )}
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {confirmDialog.title || 'تأكيد الإجراء'}
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-semibold leading-relaxed whitespace-pre-line bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              {confirmDialog.message}
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={confirmDialog.onCancel}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : confirmDialog.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THEMED ALERT MODAL (Replaces native alert) */}
      {alertDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-9999 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in zoom-in-95 duration-150 text-start">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl shrink-0 ${
                  alertDialog.variant === 'error'
                    ? 'bg-rose-100 text-rose-700'
                    : alertDialog.variant === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : alertDialog.variant === 'success'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {alertDialog.variant === 'error' ? (
                  <AlertCircle className="h-6 w-6" />
                ) : alertDialog.variant === 'warning' ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : alertDialog.variant === 'success' ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <Info className="h-6 w-6" />
                )}
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {alertDialog.title || 'تنبيه النظام'}
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-700 font-semibold leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-2xl border border-slate-200/80 max-h-72 overflow-y-auto">
              {alertDialog.message}
            </p>

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={alertDialog.onClose}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {alertDialog.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    // Graceful fallback to browser primitives if used outside provider
    return {
      showToast: ({ message }) => console.log(message),
      removeToast: () => {},
      toast: {
        success: (m) => console.log(m),
        error: (m) => console.error(m),
        warning: (m) => console.warn(m),
        info: (m) => console.info(m),
      },
      showConfirm: ({ message, onConfirm }) => {
        const res = window.confirm(message);
        if (res && onConfirm) onConfirm();
        return Promise.resolve(res);
      },
      showAlert: ({ message, onClose }) => {
        window.alert(message);
        onClose?.();
        return Promise.resolve(true);
      },
    };
  }
  return context;
};
