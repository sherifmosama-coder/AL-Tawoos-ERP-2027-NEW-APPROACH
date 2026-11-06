import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Coins,
  ShieldCheck,
  FileText,
  Paperclip,
  ExternalLink,
  Lock,
  ArrowRight
} from 'lucide-react';
import { approveCashVoucher, rejectCashVoucher, canAuthorizeCashVoucher } from '../utils/cashLedgerEngine';

export default function CashVoucherApprovalModal({
  isOpen = false,
  voucher = null,
  safe = null,
  currentUser = {},
  treasuryConfig = {},
  initialMode = 'approve', // 'approve' | 'reject'
  onClose = () => {},
  onSuccess = () => {}
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [mode, setMode] = useState(initialMode);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !voucher) return null;

  const isGeneralAdmin = Boolean(currentUser.isGeneralAdmin || currentUser.role === 'general_admin');
  const authCheck = canAuthorizeCashVoucher({ voucher, safe, currentUser, treasuryConfig });

  const currency = voucher.currency || 'EGP';
  const amount = Number(voucher.amount) || 0;
  const isOut = voucher.direction === 'out';
  const isIn = voucher.direction === 'in';

  // Current safe balance check
  const currentBal = Number(safe?.balances?.[currency]?.currentBalance ?? safe?.balance ?? safe?.currentBalance ?? 0);
  const projectedBal = isOut ? currentBal - amount : (isIn ? currentBal + amount : currentBal);
  const hasShortfall = isOut && currentBal < amount;
  const shortfallAmount = isOut ? Math.max(0, amount - currentBal) : 0;

  const handleApprove = async () => {
    if (!authCheck.canAuthorize) {
      setErrorMsg(isAr ? 'عفواً، ليس لديك صلاحية اعتماد هذا السند' : 'You do not have authorization rights for this voucher');
      return;
    }

    if (hasShortfall && !allowOverdraft) {
      setErrorMsg(
        isAr
          ? `رصيد الخزينة الحالي (${currentBal.toLocaleString()} ${currency}) لا يكفي لصرف مبلغ السند (${amount.toLocaleString()} ${currency}). يرجى تغذية الخزينة أولاً أو تفعيل التجاوز الاستثنائي.`
          : `Current safe balance (${currentBal.toLocaleString()} ${currency}) is insufficient for ${amount.toLocaleString()} ${currency}.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await approveCashVoucher({
        voucherId: voucher.id,
        currentUser,
        approvalNotes: approvalNotes.trim(),
        allowOverdraft
      });
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      console.error('[Approval Error]:', err);
      setErrorMsg(err.message || 'Error approving voucher');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!authCheck.canAuthorize) {
      setErrorMsg(isAr ? 'عفواً، ليس لديك صلاحية رفض هذا السند' : 'You do not have authorization rights for this voucher');
      return;
    }

    if (!rejectionReason.trim()) {
      setErrorMsg(isAr ? 'يرجى كتابة سبب الرفض لتوثيق السجل الرقابي' : 'Please provide a rejection reason for the audit log');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await rejectCashVoucher({
        voucherId: voucher.id,
        currentUser,
        rejectionReason: rejectionReason.trim()
      });
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      console.error('[Rejection Error]:', err);
      setErrorMsg(err.message || 'Error rejecting voucher');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div
        className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden transition-all my-auto max-h-[92vh] flex flex-col ${
          isAr ? 'text-right' : 'text-left'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 text-white flex items-center justify-between shrink-0 ${
            mode === 'approve'
              ? 'bg-gradient-to-r from-emerald-900 via-slate-900 to-emerald-950'
              : 'bg-gradient-to-r from-rose-900 via-slate-900 to-rose-950'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl border ${
                mode === 'approve'
                  ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                  : 'bg-rose-500/20 border-rose-400/30 text-rose-300'
              }`}
            >
              {mode === 'approve' ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base">
                  {mode === 'approve'
                    ? (isAr ? 'اعتماد وصرف السند المالي' : 'Approve & Post Cash Voucher')
                    : (isAr ? 'رفض السند المالي المعلق' : 'Reject Cash Voucher')}
                </h3>
                <span className="text-[10px] bg-amber-500/30 border border-amber-400/40 text-amber-200 px-2 py-0.5 rounded-full font-bold">
                  {isAr ? 'معلق للاعتماد' : 'Pending Approval'}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                {voucher.id} • {safe?.nameAr || voucher.safeId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Authorization Role Badge */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-bold text-slate-700">
                {isAr ? 'صلاحية الاعتماد:' : 'Approval Authority:'}{' '}
                <strong className="text-slate-900">
                  {authCheck.labelAr || (isAr ? 'غير مصرح' : 'Unauthorized')}
                </strong>
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {currentUser?.name || currentUser?.nameAr || currentUser?.id}
            </span>
          </div>

          {/* Amount & Direction Card */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                {isAr ? 'نوع الحركة والمبلغ المطلوب:' : 'Transaction & Amount:'}
              </span>
              <span
                className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                  isOut ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {voucher.typeAr || (isOut ? (isAr ? 'صرف نقدية' : 'Disbursement') : (isAr ? 'قبض نقدية' : 'Receipt'))}
              </span>
            </div>

            <div className="text-center py-2">
              <div
                className={`text-3xl font-black font-mono tracking-tight ${
                  isOut ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {isOut ? '-' : '+'}{amount.toLocaleString()} {currency}
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {isAr ? 'مُحرر السند:' : 'Issued by:'}{' '}
                <strong className="text-slate-800">{voucher.issuedByName || voucher.issuedByUserId || '—'}</strong>
                {' • '}
                {voucher.createdAt ? new Date(voucher.createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-US') : ''}
              </p>
            </div>

            {/* Safe Liquidity Status */}
            <div className="pt-2 border-t border-slate-200/70 grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-500 block">{isAr ? 'رصيد الخزينة الحالي:' : 'Current Safe Balance:'}</span>
                <span className="font-mono font-bold text-slate-900 text-xs">
                  {currentBal.toLocaleString()} {currency}
                </span>
              </div>
              <div
                className={`p-2 rounded-xl border ${
                  projectedBal < 0
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <span className="block opacity-80">{isAr ? 'الرصيد بعد الاعتماد:' : 'Balance After Posting:'}</span>
                <span className="font-mono font-bold text-xs">
                  {projectedBal.toLocaleString()} {currency}
                </span>
              </div>
            </div>

            {/* Shortfall Alert */}
            {hasShortfall && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    {isAr
                      ? `عجز في رصيد الخزينة بمبلغ (${shortfallAmount.toLocaleString()} ${currency})!`
                      : `Safe balance deficit of (${shortfallAmount.toLocaleString()} ${currency})!`}
                  </span>
                </div>
                {isGeneralAdmin && (
                  <label className="flex items-center gap-2 pt-1 border-t border-rose-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowOverdraft}
                      onChange={(e) => setAllowOverdraft(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-[11px] font-bold text-rose-900">
                      {isAr
                        ? 'تجاوز استثنائي للمسؤول العام: السماح بالصرف دفترياً بعجز مؤقت'
                        : 'Admin Override: Allow posting with temporary ledger overdraft'}
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Account Details & Description */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] font-bold">{isAr ? 'حساب الأستاذ العام:' : 'General Ledger Account:'}</span>
                <span className="font-mono font-bold text-slate-800">
                  {voucher.mainAccount} {voucher.mainAccountAr ? `• ${voucher.mainAccountAr}` : ''}
                </span>
              </div>
              {voucher.subAccountName && (
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold">{isAr ? 'الحساب المساعد / المستفيد:' : 'Sub-Account / Payee:'}</span>
                  <span className="font-bold text-slate-800">{voucher.subAccountName}</span>
                </div>
              )}
            </div>

            {voucher.description && (
              <div className="pt-2 border-t border-slate-200 text-xs">
                <span className="text-slate-500 block text-[10px] font-bold mb-0.5">{isAr ? 'البيان وملاحظات الصرف:' : 'Description:'}</span>
                <p className="text-slate-800 font-medium bg-white p-2 rounded-xl border border-slate-200">
                  {voucher.description}
                </p>
              </div>
            )}

            {/* Attachments */}
            {Array.isArray(voucher.attachments) && voucher.attachments.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold mb-1.5 flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  <span>{isAr ? `المرفقات والمستندات المؤيدة (${voucher.attachments.length}):` : `Attachments (${voucher.attachments.length}):`}</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {voucher.attachments.map((att, idx) => {
                    const url = typeof att === 'string' ? att : att?.url;
                    const name = typeof att === 'object' && att?.name ? att.name : `${isAr ? 'مرفق' : 'Attachment'} ${idx + 1}`;
                    return (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-indigo-700 transition"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>{name}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Mode-Specific Input: Approval Notes vs Rejection Reason */}
          {mode === 'approve' ? (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                {isAr ? 'ملاحظات وتأشيرة الاعتماد المالي (اختياري):' : 'Approval Note / Memo (Optional):'}
              </label>
              <textarea
                rows={2}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder={isAr ? 'أدخل أي ملاحظات على اعتماد الصرف...' : 'Enter approval notes...'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium resize-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-rose-800 mb-1">
                {isAr ? 'سبب رفض السند (إلزامي للتوثيق الرقابي):' : 'Rejection Reason (Mandatory):'} *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={isAr ? 'يرجى توضيح سبب رفض السند بدقة...' : 'Explain the reason for rejecting the voucher...'}
                className="w-full px-3 py-2 bg-rose-50/50 border border-rose-300 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-rose-500 font-medium resize-none text-rose-950"
              />
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center justify-between pt-1">
            {mode === 'approve' ? (
              <button
                type="button"
                onClick={() => { setMode('reject'); setErrorMsg(''); }}
                className="text-[11px] text-rose-600 hover:text-rose-800 underline font-bold cursor-pointer"
              >
                {isAr ? 'التحويل إلى وضع الرفض بدلاً من ذلك ←' : 'Switch to Reject Mode instead ←'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMode('approve'); setErrorMsg(''); }}
                className="text-[11px] text-emerald-600 hover:text-emerald-800 underline font-bold cursor-pointer"
              >
                {isAr ? 'العودة إلى وضع الاعتماد والصرف ←' : 'Switch to Approve Mode instead ←'}
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          {mode === 'approve' ? (
            <button
              type="button"
              disabled={isSubmitting || !authCheck.canAuthorize || (hasShortfall && !allowOverdraft)}
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-md transition cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isSubmitting ? (isAr ? 'جاري الاعتماد...' : 'Approving...') : (isAr ? 'تأكيد الاعتماد والصرف' : 'Confirm & Post Voucher')}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting || !authCheck.canAuthorize || !rejectionReason.trim()}
              onClick={handleReject}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-md transition cursor-pointer"
            >
              <XCircle className="h-4 w-4" />
              <span>{isSubmitting ? (isAr ? 'جاري الرفض...' : 'Rejecting...') : (isAr ? 'تأكيد رفض السند' : 'Confirm Rejection')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
