import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  ShieldCheck,
  Clock,
  User,
  Calendar,
  Building2,
  FileText,
  Receipt,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Coins,
  Paperclip,
  Copy,
  Check,
  Layers,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { EGP_DENOMINATIONS } from '../utils/cashLedgerEngine.js';

export default function VoucherAuditLogModal({
  voucher,
  safe,
  activeSafeId,
  isOpen,
  onClose,
  onViewAttachment
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [copiedId, setCopiedId] = useState(false);
  const [expandedDiffs, setExpandedDiffs] = useState({});

  if (!isOpen || !voucher) return null;

  const handleCopyId = () => {
    if (!voucher.id) return;
    navigator.clipboard.writeText(voucher.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const toggleDiff = (idx) => {
    setExpandedDiffs((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const isTransfer = voucher.type === 'safe_transfer';
  const effectiveSafeId = activeSafeId || safe?.id;
  const isTargetSafe = isTransfer && Boolean(effectiveSafeId && voucher.targetSafeId === effectiveSafeId);
  const isOut = isTransfer ? !isTargetSafe : (voucher.direction === 'out');
  const isIn = isTransfer ? isTargetSafe : (voucher.direction === 'in');
  const isVoid = voucher.status === 'void';
  const isPending = voucher.status === 'pending_approval' || voucher.status === 'pending_receiver_approval';

  let typeLabel = isAr ? (voucher.typeAr || voucher.type) : (voucher.typeEn || voucher.typeAr || voucher.type);
  if (isTransfer) {
    typeLabel = isTargetSafe
      ? (isAr ? 'تحويل وارد (استلام)' : 'Inter-Safe Transfer (In)')
      : (isAr ? 'تحويل صادر (إرسال)' : 'Inter-Safe Transfer (Out)');
  }

  const auditLog = Array.isArray(voucher.auditLog) ? voucher.auditLog : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-auto max-h-[90vh] flex flex-col ${
          isAr ? 'text-right' : 'text-left'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl">
              <ShieldCheck className="h-6 w-6 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold">
                  {isAr ? 'سجل الرقابة والتتبع المالي (Audit Trail)' : 'Voucher Financial Audit Trail'}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isVoid
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : isPending
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {isVoid ? (isAr ? 'ملغي / معكوس' : 'Void') : isPending ? (isAr ? 'معلق' : 'Pending') : (isAr ? 'معتمد' : 'Posted')}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-300">
                <span className="font-mono">{voucher.id}</span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="p-1 hover:bg-white/10 rounded transition cursor-pointer text-slate-300 hover:text-white"
                  title={isAr ? 'نسخ رقم السند' : 'Copy Voucher ID'}
                >
                  {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs flex-1">
          {/* 1. Quick Stats Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                {isAr ? 'نوع الحركة والاتجاه' : 'Type & Direction'}
              </span>
              <div className="flex items-center gap-1.5 font-extrabold text-slate-800 text-xs">
                {isOut ? (
                  <ArrowUpRight className="h-4 w-4 text-rose-600" />
                ) : isIn ? (
                  <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                )}
                <span>{typeLabel}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                {isAr ? 'المبلغ المالي' : 'Voucher Amount'}
              </span>
              <div className="font-mono font-black text-sm">
                <span className={isOut ? 'text-rose-600' : isIn ? 'text-emerald-600' : 'text-slate-900'}>
                  {isOut ? `-${voucher.amount?.toLocaleString()}` : isIn ? `+${voucher.amount?.toLocaleString()}` : voucher.amount?.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400 font-normal ms-1">{voucher.currency || 'EGP'}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                {isTransfer
                  ? (isTargetSafe ? (isAr ? 'الخزينة المستلمة' : 'Recipient Safe') : (isAr ? 'الخزينة المصدر' : 'Source Safe'))
                  : (isAr ? 'الخزينة المربوطة' : 'Linked Safe')}
              </span>
              <div className="font-extrabold text-slate-800 truncate" title={safe?.nameAr || voucher.safeId}>
                {safe ? (isAr ? safe.nameAr : (safe.nameEn || safe.nameAr)) : voucher.safeId}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                {isAr ? 'الرصيد بعدها' : 'Balance After'}
              </span>
              <div className="font-mono font-extrabold text-slate-800">
                {(() => {
                  const bal = isTargetSafe
                    ? (voucher.targetBalanceAfter !== undefined ? voucher.targetBalanceAfter : (voucher.status === 'pending_receiver_approval' ? undefined : voucher.balanceAfter))
                    : voucher.balanceAfter;
                  return bal !== undefined
                    ? `${bal.toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}`
                    : '—';
                })()}
              </div>
            </div>
          </div>

          {/* 2. Chronological Timeline */}
          <div>
            <h4 className="font-extrabold text-sm text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              <span>{isAr ? 'دورة حياة السند والتوثيق الزمني' : 'Life-Cycle Chronological Timeline'}</span>
            </h4>

            <div className="relative border-s-2 border-indigo-100 ms-3 space-y-5">
              {/* Event 1: Creation */}
              <div className="relative ms-5">
                <span className="absolute -start-7.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 ring-4 ring-white">
                  <User className="h-3 w-3" />
                </span>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-slate-900">
                      {isAr ? 'إنشاء وإصدار السند' : 'Voucher Created & Issued'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {voucher.createdAt ? new Date(voucher.createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-US') : '—'}
                    </span>
                  </div>
                  <div className="text-slate-600 text-[11px]">
                    {isAr ? 'تم الإنشاء بواسطة:' : 'Issued by:'}{' '}
                    <strong className="text-slate-800">{voucher.issuedByName || voucher.issuedByUserId || 'المستخدم'}</strong>
                    {voucher.issuedByUserId && (
                      <span className="font-mono text-slate-400 ms-1">({voucher.issuedByUserId})</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Event 2: Approval (if present) */}
              {voucher.approvedAt && (
                <div className="relative ms-5">
                  <span className="absolute -start-7.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-4 ring-white">
                    <CheckCircle2 className="h-3 w-3" />
                  </span>
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-emerald-900">
                        {isAr ? 'اعتماد وترحيل السند المالي' : 'Voucher Approved & Posted'}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-mono">
                        {new Date(voucher.approvedAt).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                      </span>
                    </div>
                    <div className="text-emerald-800 text-[11px]">
                      {isAr ? 'اعتمد بواسطة:' : 'Approved by:'}{' '}
                      <strong>{voucher.approvedByName || voucher.approvedByUserId || 'المدير المعتمد'}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Event 3: Edits History */}
              {auditLog.map((entry, idx) => (
                <div key={idx} className="relative ms-5">
                  <span className="absolute -start-7.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-4 ring-white">
                    <FileText className="h-3 w-3" />
                  </span>
                  <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-amber-900">
                        {isAr ? `تعديل على بيانات السند (#${idx + 1})` : `Voucher Modified (#${idx + 1})`}
                      </span>
                      <span className="text-[10px] text-amber-700 font-mono">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US') : '—'}
                      </span>
                    </div>
                    <div className="text-slate-700 text-[11px] flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div>
                        {isAr ? 'المعدل:' : 'Editor:'} <strong>{entry.userName || entry.userId}</strong>
                      </div>
                      {entry.reason && (
                        <div>
                          {isAr ? 'سبب التعديل:' : 'Reason:'}{' '}
                          <span className="italic text-slate-600 bg-white/70 px-2 py-0.5 rounded border border-amber-200">
                            {entry.reason}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Diff Viewer Button */}
                    {entry.diff && Object.keys(entry.diff).length > 0 && (
                      <div className="pt-1.5 border-t border-amber-200/60">
                        <button
                          type="button"
                          onClick={() => toggleDiff(idx)}
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-950 cursor-pointer"
                        >
                          {expandedDiffs[idx] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <span>
                            {expandedDiffs[idx]
                              ? (isAr ? 'إخفاء الفروقات المعدلة' : 'Hide Modified Diffs')
                              : (isAr ? `عرض التغييرات (${Object.keys(entry.diff).length} حقول)` : `Show Diffs (${Object.keys(entry.diff).length} fields)`)}
                          </span>
                        </button>

                        {expandedDiffs[idx] && (
                          <div className="mt-2 bg-white rounded-xl border border-amber-200 p-2.5 space-y-1.5 overflow-x-auto">
                            {Object.entries(entry.diff).map(([key, val]) => (
                              <div key={key} className="text-[10px] font-mono grid grid-cols-3 gap-2 py-1 border-b border-slate-100 last:border-none">
                                <span className="font-bold text-slate-700 truncate">{key}:</span>
                                <span className="text-rose-600 line-through truncate" title={JSON.stringify(val.before)}>
                                  {JSON.stringify(val.before) || 'null'}
                                </span>
                                <span className="text-emerald-700 font-bold truncate" title={JSON.stringify(val.after)}>
                                  {JSON.stringify(val.after) || 'null'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Event 4: Reversal / Void (if reversed) */}
              {isVoid && (
                <div className="relative ms-5">
                  <span className="absolute -start-7.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 ring-4 ring-white">
                    <RotateCcw className="h-3 w-3" />
                  </span>
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-rose-900">
                        {isAr ? 'إلغاء وعكس الأثر المالي للسند' : 'Voucher Voided & Reversed'}
                      </span>
                      <span className="text-[10px] text-rose-700 font-mono">
                        {voucher.reversedAt ? new Date(voucher.reversedAt).toLocaleString(isAr ? 'ar-EG' : 'en-US') : '—'}
                      </span>
                    </div>
                    <div className="text-rose-800 text-[11px]">
                      {isAr ? 'ألغي بواسطة:' : 'Voided by:'}{' '}
                      <strong>{voucher.reversedByName || voucher.reversedByUserId || 'المدير العام'}</strong>
                    </div>
                    {voucher.reversalReason && (
                      <div className="text-[11px] text-rose-700 bg-rose-100/50 p-2 rounded-xl mt-1">
                        <strong>{isAr ? 'سبب الإلغاء:' : 'Reason:'}</strong> {voucher.reversalReason}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Accounting & Tax Attributes Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <h4 className="font-extrabold text-slate-800 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              <span>{isAr ? 'التوجيه المحاسبي والضريبي' : 'Accounting & Tax Attribution'}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-slate-400 block">{isAr ? 'حساب الأستاذ العام (GL):' : 'Main GL Account:'}</span>
                <span className="font-extrabold text-slate-900">
                  {isAr ? (voucher.mainAccountAr || voucher.mainAccount) : (voucher.mainAccount || voucher.mainAccountAr)}
                </span>
                {voucher.statement && (
                  <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                    [{voucher.statement === 'balance_sheet' ? (isAr ? 'ميزانية عمومية' : 'Balance Sheet') : (isAr ? 'قائمة دخل' : 'Income Statement')}]
                  </span>
                )}
              </div>

              <div>
                <span className="text-slate-400 block">{isAr ? 'الحساب المساعد / الطرف الآخر:' : 'Sub-Account / Counterparty:'}</span>
                <span className="font-extrabold text-slate-800">
                  {isTransfer
                    ? (isTargetSafe
                        ? `${isAr ? 'من خزينة:' : 'From Safe:'} ${voucher.sourceSafeNameAr || voucher.sourceSafeNameEn || voucher.sourceSafeId}`
                        : `${isAr ? 'إلى خزينة:' : 'To Safe:'} ${voucher.targetSafeNameAr || voucher.targetSafeNameEn || voucher.targetSafeId}`)
                    : (voucher.subAccountName || voucher.subAccountId || '—')}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block">{isAr ? 'مركز التكلفة:' : 'Cost Center:'}</span>
                <span className="font-bold text-slate-700">
                  {voucher.costCenterName || voucher.costCenterId || (isAr ? 'عام' : 'General')}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block">{isAr ? 'المستند الضريبي:' : 'Tax Document:'}</span>
                <span className="font-bold text-slate-800">
                  {voucher.taxDocumentType === 'taxable'
                    ? (isAr ? 'فاتورة ضريبية رسمية' : 'Tax Invoice')
                    : voucher.taxDocumentType === 'non_taxable'
                    ? (isAr ? 'إيصال عرفي' : 'Informal Receipt')
                    : (isAr ? 'بدون مستند ضريبي' : 'No Document')}
                </span>
                {voucher.taxDetails?.invoiceNumber && (
                  <span className="block text-[10px] text-purple-700 font-mono mt-0.5">
                    {isAr ? 'رقم الفاتورة:' : 'Inv #:'} {voucher.taxDetails.invoiceNumber}
                  </span>
                )}
              </div>
            </div>

            {voucher.description && (
              <div className="pt-2 border-t border-slate-200 text-[11px]">
                <span className="text-slate-400 block mb-0.5">{isAr ? 'البيان والشرح:' : 'Description / Memo:'}</span>
                <p className="text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
                  {voucher.description}
                </p>
              </div>
            )}
          </div>

          {/* 4. Banknotes Denominations Count Snapshot */}
          {voucher.denominations && Object.keys(voucher.denominations).length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <h4 className="font-extrabold text-slate-800 flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-600" />
                <span>{isAr ? 'تفقيط الفئات الورقية بالسند' : 'Banknotes Count Breakdown'}</span>
              </h4>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {EGP_DENOMINATIONS.map((d) => {
                  const count = Number(voucher.denominations[d]) || 0;
                  const isNegative = count < 0;
                  return (
                    <div
                      key={d}
                      className={`p-2 rounded-xl text-center border ${
                        isNegative
                          ? 'bg-amber-100/90 border-amber-400 font-black text-amber-950'
                          : count > 0
                          ? 'bg-emerald-50/80 border-emerald-300 font-bold text-emerald-900'
                          : 'bg-white border-slate-200 text-slate-300'
                      }`}
                    >
                      <div className="text-[10px] text-slate-500 font-mono">{d} ج</div>
                      <div className="text-xs font-mono font-black mt-0.5">{count}</div>
                      {isNegative && (
                        <div className="text-[9px] font-bold text-amber-800">{isAr ? 'فكة' : 'chg'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Supporting Attachments */}
          {voucher.attachments && voucher.attachments.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <h4 className="font-extrabold text-slate-800 flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-blue-600" />
                <span>{isAr ? `المرفقات الداعمة (${voucher.attachments.length})` : `Attachments (${voucher.attachments.length})`}</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {voucher.attachments.map((att, idx) => {
                  const attName = typeof att === 'string' ? `مستند ${idx + 1}` : (att.name || `مستند ${idx + 1}`);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onViewAttachment(att)}
                      className="flex items-center justify-between p-2.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-xl transition cursor-pointer text-[11px]"
                    >
                      <span className="truncate max-w-[200px] font-bold text-slate-800">{attName}</span>
                      <span className="text-[10px] text-blue-600 font-bold">{isAr ? 'عرض' : 'View'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
