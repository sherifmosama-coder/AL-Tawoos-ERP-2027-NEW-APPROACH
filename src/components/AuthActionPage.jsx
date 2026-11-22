import React, { useEffect, useId, useState } from 'react';
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from 'firebase/auth';
import {
  Lock,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { auth } from '../firebase';
import PeacockLoader from './PeacockLoader';
import AuthPortalBackdrop from './AuthPortalBackdrop';

export default function AuthActionPage({
  mode = 'resetPassword',
  oobCode = '',
  continueUrl = '',
  isAr = true,
  onToggleLanguage = () => {},
  onReturnToLogin = () => {},
}) {
  const newPwdId = useId();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'ready' | 'saving' | 'done' | 'error'
  const [targetEmail, setTargetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    async function inspectActionCode() {
      if (!oobCode) {
        if (!active) return;
        setStatus('error');
        setErrorMsg(
          isAr ? 'رابط الاستعادة غير مكتمل أو غير صالح.' : 'Missing or invalid action code.'
        );
        return;
      }

      try {
        if (mode === 'resetPassword') {
          const emailAddr = await verifyPasswordResetCode(auth, oobCode);
          if (!active) return;
          setTargetEmail(emailAddr || '');
          setStatus('ready');
        } else if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          if (!active) return;
          setStatus('done');
        } else {
          if (!active) return;
          setStatus('error');
          setErrorMsg(
            isAr ? 'نوع الإجراء غير مدعوم في هذه الصفحة.' : `Unsupported action mode: ${mode}`
          );
        }
      } catch (err) {
        if (!active) return;
        const code = err?.code || '';
        setStatus('error');
        if (code === 'auth/expired-action-code') {
          setErrorMsg(
            isAr
              ? 'انتهت صلاحية رابط تعيين كلمة المرور. يرجى طلب رابط جديد من شاشة الدخول.'
              : 'This password reset link has expired. Please request a new one.'
          );
        } else {
          setErrorMsg(
            isAr
              ? 'الرابط غير صالح أو تم استخدامه مسبقاً.'
              : err?.message || 'Invalid or already used action link.'
          );
        }
      }
    }
    inspectActionCode();
    return () => {
      active = false;
    };
  }, [mode, oobCode, isAr]);

  const handleConfirmReset = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg(
        isAr
          ? 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.'
          : 'New password must be at least 6 characters.'
      );
      return;
    }

    setErrorMsg('');
    setStatus('saving');
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus('done');
    } catch (err) {
      setStatus('ready');
      const code = err?.code || '';
      if (code === 'auth/weak-password') {
        setErrorMsg(
          isAr
            ? 'كلمة المرور ضعيفة جداً، يرجى اختيار كلمة مرور أقوى (6 أحرف فأكثر).'
            : 'Password is too weak. Please choose at least 6 characters.'
        );
      } else {
        setErrorMsg(err?.message || (isAr ? 'تعذر حفظ كلمة المرور الجديدة.' : 'Failed resetting password.'));
      }
    }
  };

  const handleGoToSignIn = () => {
    if (continueUrl) {
      try {
        const parsed = new URL(continueUrl);
        if (parsed.origin === window.location.origin) {
          window.history.replaceState({}, '', parsed.pathname + parsed.search);
          onReturnToLogin();
          return;
        }
      } catch {
        // Ignore malformed continueUrl and return locally
      }
    }
    window.history.replaceState({}, '', '/');
    onReturnToLogin();
  };

  const isBusy = status === 'verifying' || status === 'saving';
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  return (
    <AuthPortalBackdrop isAr={isAr}>
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_50px_-15px_rgba(2,42,99,0.14)] p-6 sm:p-8 space-y-5">
        {/* Compact Brand Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PeacockLoader
              size="sm"
              inline
              animate={isBusy}
              variant="royal"
              className="!gap-0"
            />
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                {mode === 'verifyEmail'
                  ? (isAr ? 'تأكيد البريد الإلكتروني' : 'Email Verification')
                  : (isAr ? 'تعيين كلمة المرور الجديدة' : 'Reset Your Password')}
              </h1>
              <p className="text-[11px] text-slate-500 font-semibold">
                {isAr ? 'منظومة الطاووس ERP' : 'Al-Tawoos ERP'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleLanguage}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-[#014EA8]" />
            <span>{isAr ? 'EN' : 'عربي'}</span>
          </button>
        </div>

        {status === 'verifying' && (
          <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-xs font-bold text-[#014EA8]">
              {isAr ? 'جاري التحقق من صلاحية رابط الاستعادة...' : 'Verifying reset link...'}
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {(status === 'ready' || status === 'saving') && (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            {targetEmail && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 font-bold">
                  {isAr ? 'الحساب المستهدف:' : 'Account:'}
                </span>
                <span className="font-mono font-black text-[#014EA8]" dir="ltr">
                  {targetEmail}
                </span>
              </div>
            )}

            <div>
              <label htmlFor={newPwdId} className="block text-xs font-bold text-slate-700 mb-1.5">
                {isAr ? 'كلمة المرور الجديدة (6 أحرف فأكثر)' : 'New Password (min 6 characters)'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id={newPwdId}
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  enterKeyHint="done"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-10 pe-10 py-2.5 border border-slate-300 rounded-2xl text-sm font-mono text-slate-900 bg-slate-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D6CBA]/30 focus:border-[#014EA8] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword
                      ? (isAr ? 'إخفاء كلمة المرور' : 'Hide password')
                      : (isAr ? 'إظهار كلمة المرور' : 'Show password')
                  }
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 absolute end-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={status === 'saving'}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#014EA8] to-[#0D6CBA] hover:from-[#013F8B] hover:to-[#0A5AA0] active:scale-[0.99] text-white text-sm font-black shadow-lg shadow-[#014EA8]/20 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition"
            >
              {status === 'saving' ? (
                <PeacockLoader size="xs" inline variant="white" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>
                {status === 'saving'
                  ? (isAr ? 'جاري الحفظ...' : 'Saving Password...')
                  : (isAr ? 'حفظ كلمة المرور الجديدة' : 'Save New Password')}
              </span>
            </button>
          </form>
        )}

        {status === 'done' && (
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-black text-slate-900">
                {mode === 'verifyEmail'
                  ? (isAr ? 'تم تأكيد البريد الإلكتروني بنجاح ✓' : 'Email Verified ✓')
                  : (isAr ? 'تم تحديث كلمة المرور بنجاح ✓' : 'Password Updated Successfully ✓')}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {isAr
                  ? 'يمكنك الآن تسجيل الدخول إلى حسابك باستخدام كلمة المرور الجديدة.'
                  : 'You can now sign in to Al-Tawoos ERP with your new password.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleGoToSignIn}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#014EA8] to-[#0D6CBA] hover:from-[#013F8B] hover:to-[#0A5AA0] text-white text-sm font-black shadow-lg shadow-[#014EA8]/20 inline-flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <BackArrow className="w-4 h-4" />
              <span>{isAr ? 'الانتقال لتسجيل الدخول' : 'Continue to Sign In'}</span>
            </button>
          </div>
        )}

        {status === 'error' && (
          <button
            type="button"
            onClick={handleGoToSignIn}
            className="w-full py-2.5 px-4 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <BackArrow className="w-4 h-4" />
            <span>{isAr ? 'العودة إلى صفحة تسجيل الدخول' : 'Return to Sign In'}</span>
          </button>
        )}
      </div>
    </AuthPortalBackdrop>
  );
}
