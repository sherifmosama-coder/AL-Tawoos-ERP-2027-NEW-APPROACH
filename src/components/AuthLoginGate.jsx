import React, { useState } from 'react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  ShieldCheck,
  Mail,
  Lock,
  LogIn,
  AlertTriangle,
  Globe,
  CheckCircle2,
  Loader2,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';

export default function AuthLoginGate({
  isAr = true,
  onToggleLanguage = () => {},
  authError = '',
  isVerifying = false,
  unauthorizedEmail = '',
  onSignOutUnauthorized = null,
  useEmulators = false,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setLocalError(
          isAr ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Invalid email or password.'
        );
      } else if (code === 'auth/too-many-requests') {
        setLocalError(
          isAr ? 'تم إيقاف المحاولات مؤقتاً لكثرة المحاولات الخاطئة.' : 'Too many attempts; try again later.'
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
        isAr ? 'أدخل بريدك الإلكتروني أولاً لإرسال رابط إعادة التعيين.' : 'Enter your email first to receive a password reset link.'
      );
      return;
    }
    setLocalError('');
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetMsg(
        isAr
          ? `تم إرسال رابط إعادة تعيين كلمة المرور إلى ${cleanEmail}`
          : `Password reset email sent to ${cleanEmail}`
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
      style={{ fontFamily: "'Cairo', sans-serif" }}
      className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
        {/* Top Header Strip */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight">
                {isAr ? 'منظومة الطاووس ERP' : 'Al-Tawoos ERP'}
              </h1>
              <p className="text-[11px] text-slate-300 font-medium">
                {isAr ? 'تسجيل دخول معتمد للموظفين والإدارة' : 'Authenticated Enterprise Portal'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleLanguage}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-300" />
            <span>{isAr ? 'EN' : 'عربي'}</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {useEmulators && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold text-center">
              {isAr ? 'وضع المحاكي المحلي (Firebase Emulators Active)' : 'Local Firebase Emulator Mode Active'}
            </div>
          )}

          {unauthorizedEmail && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs font-bold leading-relaxed">
                  {isAr
                    ? `البريد (${unauthorizedEmail}) غير مسجل ضمن حسابات الموظفين النشطة بالنظام.`
                    : `Email (${unauthorizedEmail}) is not linked to any active ERP user account.`}
                </div>
              </div>
              <p className="text-[11px] text-rose-800 font-medium">
                {isAr
                  ? 'يمكن لكل موظف ربط بريد واحد أو بريدين (Gmail أو بريد الشركة) من شاشة الموظفين بواسطة المدير العام.'
                  : 'Ask your General Admin to link your Gmail or Company email in Staff, Workers & Users.'}
              </p>
              {onSignOutUnauthorized && (
                <button
                  type="button"
                  onClick={onSignOutUnauthorized}
                  className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تسجيل الخروج وتجربة بريد آخر' : 'Sign Out & Try Another Email'}</span>
                </button>
              )}
            </div>
          )}

          {combinedError && !unauthorizedEmail && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{combinedError}</span>
            </div>
          )}

          {resetMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resetMsg}</span>
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleSignIn}
            className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 text-slate-900 text-xs font-black flex items-center justify-center gap-2.5 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
              </svg>
            )}
            <span>{isAr ? 'الدخول بحساب Google (Gmail)' : 'Sign in with Google'}</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-black text-slate-400 uppercase">
              {isAr ? 'أو ببريد الشركة وكلمة المرور' : 'Or Company Email & Password'}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailPasswordSignIn} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isAr ? 'البريد الإلكتروني المرتبط' : 'Linked Email Address'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full ps-9 pe-3 py-2.5 border border-slate-300 rounded-xl font-mono font-bold outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="text-[11px] font-bold text-indigo-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>{isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</span>
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-9 pe-3 py-2.5 border border-slate-300 rounded-xl font-mono outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer transition"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              <span>
                {isVerifying
                  ? (isAr ? 'جاري التحقق من صلاحيات الحساب...' : 'Verifying ERP access...')
                  : (isAr ? 'دخول للنظام' : 'Sign In')}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
