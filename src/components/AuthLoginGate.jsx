import React, { useId, useState } from 'react';
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
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Building2,
  Layers,
  Clock3,
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
      style={{ fontFamily: "'Cairo', sans-serif" }}
      className="min-h-screen bg-slate-100 relative flex items-center justify-center p-3 sm:p-6 overflow-hidden"
    >
      {/* Subtle Corporate Ambient Geometry */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(1,78,168,0.10),transparent_48%),radial-gradient(circle_at_bottom_left,rgba(13,108,186,0.09),transparent_46%)]"
      />

      <div className="relative z-10 w-full max-w-5xl bg-white rounded-3xl border border-slate-200/90 shadow-[0_24px_70px_-20px_rgba(1,43,102,0.22)] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Executive Brand Showcase Panel */}
        <section className="lg:col-span-5 relative bg-gradient-to-br from-slate-950 via-[#022A63] to-[#014EA8] text-white p-7 sm:p-9 flex flex-col justify-between overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -end-20 w-72 h-72 rounded-full bg-sky-400/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -start-16 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl"
          />

          {/* Top Bar */}
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-xs text-[11px] font-bold text-sky-100">
              <Building2 className="w-3.5 h-3.5 text-sky-300" />
              <span>{isAr ? 'بوابة موارد المؤسسة' : 'Enterprise Portal'}</span>
            </div>
            <button
              type="button"
              onClick={onToggleLanguage}
              className="lg:hidden px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Globe className="w-3.5 h-3.5 text-sky-300" />
              <span>{isAr ? 'EN' : 'عربي'}</span>
            </button>
          </div>

          {/* Centered Brand Logo & Headline */}
          <div className="relative z-10 my-6 lg:my-8 space-y-5">
            <div className="inline-flex items-center justify-center rounded-2xl bg-white/10 border border-white/15 px-5 py-3.5 backdrop-blur-xs shadow-inner">
              <img
                src="/logo-inverted.svg"
                alt={isAr ? 'شعار شركة الطاووس' : 'Al-Tawoos Corporate Logo'}
                className="h-14 sm:h-16 w-auto object-contain select-none"
              />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-snug">
                {isAr
                  ? 'منظومة الطاووس المتكاملة لإدارة موارد المؤسسة'
                  : 'Al-Tawoos Enterprise Resource Planning'}
              </h1>
              <p className="text-xs sm:text-sm text-sky-100/85 font-medium leading-relaxed">
                {isAr
                  ? 'منصة سحابية موحدة لإدارة المبيعات، التشغيل، المخازن، والقيود المحاسبية بحوكمة وصلاحيات دقيقة.'
                  : 'Unified cloud platform orchestrating production, warehousing, fleet dispatch, sales, and corporate finance.'}
              </p>
            </div>

            {/* Enterprise Pillars */}
            <div className="hidden sm:grid grid-cols-1 gap-2.5 pt-2">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.07] border border-white/10">
                <div className="w-8 h-8 rounded-xl bg-sky-400/15 border border-sky-300/25 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-sky-200" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-white">
                    {isAr ? 'دخول مصرح ومشفر' : 'Zero-Trust Access Control'}
                  </div>
                  <div className="text-[11px] text-sky-100/75 truncate">
                    {isAr ? 'مقتصر على الحسابات المعتمدة بإدارة الموارد' : 'Restricted to approved active company personnel'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.07] border border-white/10">
                <div className="w-8 h-8 rounded-xl bg-sky-400/15 border border-sky-300/25 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-sky-200" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-white">
                    {isAr ? 'فصل الصلاحيات والمسؤوليات' : 'Department Separation of Duties'}
                  </div>
                  <div className="text-[11px] text-sky-100/75 truncate">
                    {isAr ? 'حوكمة ثلاثية المستويات للإدارات والمستخدمين' : 'Three-layer governance across modules & vouchers'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.07] border border-white/10">
                <div className="w-8 h-8 rounded-xl bg-sky-400/15 border border-sky-300/25 flex items-center justify-center shrink-0">
                  <Clock3 className="w-4 h-4 text-sky-200" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-white">
                    {isAr ? 'مزامنة سحابية وحفظ دوري' : '24/7 Cloud Sync & Time Machine'}
                  </div>
                  <div className="text-[11px] text-sky-100/75 truncate">
                    {isAr ? 'نسخ احتياطية آلية واستعادة دقيقة للبيانات' : 'Automated cloud snapshots & granular point recovery'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Mark */}
          <div className="relative z-10 hidden lg:flex items-center justify-between pt-4 border-t border-white/10 text-[11px] text-sky-100/70 font-semibold">
            <span>© {new Date().getFullYear()} Al-Tawoos ERP</span>
            <span>{isAr ? 'إصدار المؤسسات السحابي' : 'Cloud Enterprise Edition'}</span>
          </div>
        </section>

        {/* Sign-In Form Surface */}
        <section className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-white">
          <div className="w-full max-w-md mx-auto space-y-6">
            {/* Desktop Header & Official Logo */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.svg"
                  alt={isAr ? 'الطاووس' : 'Al-Tawoos'}
                  className="h-9 sm:h-10 w-auto object-contain select-none"
                />
              </div>
              <button
                type="button"
                onClick={onToggleLanguage}
                className="hidden lg:inline-flex px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold items-center gap-1.5 cursor-pointer transition"
              >
                <Globe className="w-3.5 h-3.5 text-[#014EA8]" />
                <span>{isAr ? 'English' : 'العربية'}</span>
              </button>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {isAr ? 'تسجيل الدخول إلى المنظومة' : 'Sign In to Your Workspace'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                {isAr
                  ? 'سجل الدخول بحساب Google أو ببريد الشركة وكلمة المرور المعينين لحسابك.'
                  : 'Authenticate with your approved Google account or corporate domain credentials.'}
              </p>
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
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{combinedError}</span>
              </div>
            )}

            {resetMsg && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{resetMsg}</span>
              </div>
            )}

            {isVerifying && (
              <div className="p-4 rounded-2xl bg-sky-50/90 border border-sky-200 flex items-center justify-center">
                <PeacockLoader
                  size="sm"
                  inline
                  variant="royal"
                  text={
                    isAr
                      ? 'جاري التحقق من الصلاحيات واعتماد الجلسة...'
                      : 'Verifying ERP allowlist & security claims...'
                  }
                />
              </div>
            )}

            {/* Primary Google Auth Action */}
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="w-full py-3 px-4 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] text-slate-800 text-sm font-black shadow-xs flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 transition"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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

            <div className="relative flex items-center py-0.5">
              <div className="flex-grow border-t border-slate-200" />
              <span className="shrink mx-3 text-[11px] font-bold text-slate-400">
                {isAr ? 'أو باستخدام بريد الشركة وكلمة المرور' : 'OR COMPANY EMAIL & PASSWORD'}
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            {/* Email & Password Form (Autofill + Accessibility Best Practices) */}
            <form onSubmit={handleEmailPasswordSignIn} className="space-y-4">
              <div>
                <label htmlFor={emailInputId} className="block text-xs font-bold text-slate-700 mb-1.5">
                  {isAr ? 'البريد الإلكتروني المعتمد' : 'Corporate / Linked Email'}
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
                <div className="flex items-center justify-between mb-1.5">
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
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#014EA8] to-[#0D6CBA] hover:from-[#013F8B] hover:to-[#0A5AA0] active:scale-[0.99] text-white text-sm font-black shadow-lg shadow-[#014EA8]/20 inline-flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 transition"
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

            <div className="pt-2 text-center text-[11px] text-slate-400 font-medium leading-relaxed">
              {isAr
                ? 'محمي بنظام صلاحيات الطاووس وقواعد أمان Firebase المستندة للهوية.'
                : 'Secured by Firebase Identity Custom Claims & Server-Verified Access Rules.'}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
