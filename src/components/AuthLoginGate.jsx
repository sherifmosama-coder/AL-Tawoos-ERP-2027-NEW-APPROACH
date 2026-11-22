import React, { useId, useState } from 'react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  Mail,
  Lock,
  LogIn,
  AlertTriangle,
  Globe,
  CheckCircle2,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import PeacockLoader from './PeacockLoader';

export default function AuthLoginGate({
  isAr = true,
  onToggleLanguage = () => {},
  authError = '',
  isVerifying = false,
  unauthorizedEmail = '',
  onSignOutUnauthorized = null,
  useEmulators = false,
}) {
  const emailInputId = useId();
  const passwordInputId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setLocalError('');
    setResetMsg('');
    setIsSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setLocalError(
          isAr
            ? `تعذر تسجيل الدخول بحساب Google: ${err?.message || err?.code}`
            : `Google sign-in failed: ${err?.message || err?.code}`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailPasswordSignIn = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setLocalError(
        isAr ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' : 'Please enter your email and password.'
      );
      return;
    }
    setLocalError('');
    setResetMsg('');
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err) {
      const code = err?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setLocalError(
          isAr ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Invalid email or password.'
        );
      } else if (code === 'auth/too-many-requests') {
        setLocalError(
          isAr
            ? 'تم إيقاف المحاولات مؤقتاً لكثرة المحاولات الخاطئة.'
            : 'Too many attempts; please try again later.'
        );
      } else {
        setLocalError(err?.message || 'Sign-in failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setLocalError(
        isAr
          ? 'أدخل بريدك الإلكتروني أولاً لإرسال رابط تعيين كلمة المرور.'
          : 'Enter your email address first to receive a password reset link.'
      );
      return;
    }
    setLocalError('');
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetMsg(
        isAr
          ? `تم إرسال رابط تعيين / استعادة كلمة المرور إلى ${cleanEmail}`
          : `Password reset link sent to ${cleanEmail}`
      );
    } catch (err) {
      setLocalError(err?.message || 'Could not send reset email.');
    }
  };

  const combinedError = authError || localError;
  const busy = isSubmitting || isVerifying;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        fontFamily: "'Cairo', sans-serif",
        background:
          'linear-gradient(90deg, #062147 0%, rgba(6, 33, 71, 0.22) 15%, #ffffff 34%, #ffffff 100%)',
      }}
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
    >
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-[0_20px_50px_-15px_rgba(2,42,99,0.16)] p-6 sm:p-8 space-y-5">
        {/* Compact Brand Header with Animated Partial Peacock Logo */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PeacockLoader
              size="sm"
              inline
              animate={busy}
              variant="royal"
              className="!gap-0"
            />
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                {isAr ? 'منظومة الطاووس ERP' : 'Al-Tawoos ERP'}
              </h1>
              <p className="text-[11px] text-slate-500 font-semibold">
                {isAr ? 'تسجيل دخول معتمد للموظفين' : 'Authorized Staff Sign-In'}
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

        {useEmulators && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold text-center">
            {isAr ? 'وضع المحاكي المحلي (Firebase Emulators Active)' : 'Local Firebase Emulator Mode Active'}
          </div>
        )}

        {unauthorizedEmail && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs font-bold leading-relaxed">
                {isAr
                  ? `البريد (${unauthorizedEmail}) غير مسجل ضمن حسابات الموظفين النشطة بالنظام.`
                  : `Email (${unauthorizedEmail}) is not linked to any active ERP user account.`}
              </div>
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              {isAr
                ? 'يرجى التواصل مع الإدارة العامة لإضافة بريدك في سجل الموظفين، أو تسجيل الخروج والمحاولة ببريد معتمد.'
                : 'Ask General Admin to link this address to an active Employees profile, or sign out and retry.'}
            </p>
            {onSignOutUnauthorized && (
              <button
                type="button"
                onClick={onSignOutUnauthorized}
                className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isAr ? 'تسجيل الخروج والمحاولة بحساب آخر' : 'Sign Out & Try Another Account'}</span>
              </button>
            )}
          </div>
        )}

        {combinedError && !unauthorizedEmail && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{combinedError}</span>
          </div>
        )}

        {resetMsg && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{resetMsg}</span>
          </div>
        )}

        {isVerifying && (
          <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-[#014EA8] text-xs font-bold text-center">
            {isAr
              ? 'جاري التحقق من الصلاحيات واعتماد الجلسة...'
              : 'Verifying ERP allowlist & security claims...'}
          </div>
        )}

        {/* Google Sign-In */}
        <button
          type="button"
          disabled={busy}
          onClick={handleGoogleSignIn}
          className="w-full py-2.5 px-4 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] text-slate-800 text-sm font-black shadow-xs flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 transition"
        >
          <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 5c1.61 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.49 14.97 0 12 0 7.31 0 3.26 2.69 1.29 6.6l3.66 2.84C5.83 6.72 8.67 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.17-2 3.71-4.95 3.71-8.7z"
            />
            <path
              fill="#FBBC05"
              d="M4.95 14.56A7.18 7.18 0 0 1 4.58 12c0-.89.15-1.76.37-2.56L1.29 6.6A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.29 5.4l3.66-2.84z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.08.72-2.45 1.16-4.22 1.16-3.33 0-6.17-1.72-7.05-4.37L1.29 17.84C3.26 21.75 7.31 24 12 24z"
            />
          </svg>
          <span>{isAr ? 'تسجيل الدخول بواسطة Google' : 'Sign in with Google'}</span>
        </button>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-slate-200" />
          <span className="shrink mx-3 text-[11px] font-bold text-slate-400">
            {isAr ? 'أو ببريد الشركة وكلمة المرور' : 'OR COMPANY EMAIL'}
          </span>
          <div className="flex-grow border-t border-slate-200" />
        </div>

        {/* Company Email & Password Sign-In Form */}
        <form onSubmit={handleEmailPasswordSignIn} className="space-y-3.5">
          <div>
            <label htmlFor={emailInputId} className="block text-xs font-bold text-slate-700 mb-1">
              {isAr ? 'البريد الإلكتروني المعتمد' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id={emailInputId}
                name="email"
                type="email"
                dir="ltr"
                required
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="next"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@altawoos.com"
                className="w-full ps-10 pe-3.5 py-2.5 border border-slate-300 rounded-2xl text-sm font-mono text-slate-900 bg-slate-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D6CBA]/30 focus:border-[#014EA8] transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={passwordInputId} className="text-xs font-bold text-slate-700">
                {isAr ? 'كلمة المرور' : 'Password'}
              </label>
              <button
                type="button"
                onClick={handlePasswordReset}
                className="text-[11px] font-bold text-[#014EA8] hover:text-[#0D6CBA] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <KeyRound className="w-3 h-3" />
                <span>{isAr ? 'نسيت / تعيين كلمة المرور؟' : 'Forgot / Set password?'}</span>
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id={passwordInputId}
                name="password"
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                required
                autoComplete="current-password"
                enterKeyHint="done"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            disabled={busy}
            className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#014EA8] to-[#0D6CBA] hover:from-[#013F8B] hover:to-[#0A5AA0] active:scale-[0.99] text-white text-sm font-black shadow-lg shadow-[#014EA8]/20 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition"
          >
            {busy ? (
              <PeacockLoader size="xs" inline variant="white" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>
              {busy
                ? (isAr ? 'جاري التحقق...' : 'Signing in...')
                : (isAr ? 'تسجيل الدخول' : 'Sign In')}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
