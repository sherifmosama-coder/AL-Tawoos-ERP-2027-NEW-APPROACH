import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

/**
 * In-App 15-second Auto-Dismissing Alert Popup
 * Shows when new Actions Required or Notifications arrive while the user is online inside the ERP.
 * Features:
 * - 15-second smooth countdown progress bar
 * - Pause countdown on hover
 * - Direct "Inspect / View" CTA button
 * - Manual close button
 */
export default function InAppAlertToast({
  alerts = [],
  onDismiss = () => {},
  onNavigate = () => {}
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  if (!alerts || alerts.length === 0) return null;

  return (
    <div
      className={`fixed top-16 inset-x-3 sm:inset-x-auto ${
        isAr ? 'sm:start-5' : 'sm:end-5'
      } sm:w-96 z-9999 flex flex-col gap-2.5 pointer-events-none`}
    >
      {alerts.map((alert) => (
        <SingleToastItem
          key={alert.id}
          alert={alert}
          isAr={isAr}
          onDismiss={onDismiss}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function SingleToastItem({ alert, isAr, onDismiss, onNavigate }) {
  const DURATION_MS = 15000; // 15 seconds auto-dismiss
  const [timeLeft, setTimeLeft] = useState(DURATION_MS);
  const [isPaused, setIsPaused] = useState(false);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    lastTickRef.current = Date.now();
    const interval = setInterval(() => {
      if (!isPaused) {
        const now = Date.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;

        setTimeLeft((prev) => {
          const next = prev - delta;
          if (next <= 0) {
            clearInterval(interval);
            onDismiss(alert.id);
            return 0;
          }
          return next;
        });
      } else {
        lastTickRef.current = Date.now();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPaused, alert.id, onDismiss]);

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / DURATION_MS) * 100));

  const isAction = alert.kind === 'action_required';
  const title = isAr ? (alert.title || alert.titleEn) : (alert.titleEn || alert.title);
  const message = isAr ? (alert.message || alert.messageEn) : (alert.messageEn || alert.message);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="pointer-events-auto relative overflow-hidden bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 p-4 transition-all duration-300 animate-in slide-in-from-top-4 fade-in group"
      style={{
        boxShadow: isAction
          ? '0 10px 25px -5px rgba(245, 158, 11, 0.25), 0 8px 10px -6px rgba(245, 158, 11, 0.2)'
          : '0 10px 25px -5px rgba(16, 185, 129, 0.25), 0 8px 10px -6px rgba(16, 185, 129, 0.2)'
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
            isAction
              ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {isAction ? (
            <AlertCircle className="h-5 w-5 animate-pulse" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isAction
                  ? 'bg-amber-100/90 text-amber-800'
                  : 'bg-emerald-100/90 text-emerald-800'
              }`}
            >
              {isAction
                ? (isAr ? 'إجراء مطلوب منك' : 'Action Required')
                : (isAr ? 'إشعار جديد' : 'New Notification')}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {Math.ceil(timeLeft / 1000)}s
            </span>
          </div>

          <h4 className="text-xs font-black text-slate-900 mt-1 truncate">
            {title}
          </h4>

          {message && (
            <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed font-medium">
              {message}
            </p>
          )}

          {/* Action CTAs */}
          <div className="flex items-center gap-2 mt-2.5">
            {alert.targetTab && (
              <button
                type="button"
                onClick={() => {
                  onNavigate(alert);
                  onDismiss(alert.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                  isAction
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <span>{isAr ? 'معاينة واتخاذ إجراء' : 'View & Take Action'}</span>
                {isAr ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => onDismiss(alert.id)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
            >
              {isAr ? 'تجاهل' : 'Dismiss'}
            </button>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0 cursor-pointer"
          title={isAr ? 'إغلاق' : 'Close'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 15-Second Progress Countdown Bar */}
      <div className="absolute bottom-0 inset-x-0 h-1 bg-slate-100 overflow-hidden">
        <div
          className={`h-full transition-all ease-linear ${
            isAction ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{
            width: `${progressPercent}%`,
            transitionDuration: '100ms'
          }}
        />
      </div>
    </div>
  );
}
