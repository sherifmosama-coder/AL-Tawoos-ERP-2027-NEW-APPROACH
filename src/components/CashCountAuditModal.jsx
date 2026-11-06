import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Scale, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, ClipboardCheck } from 'lucide-react';
import {
  EGP_DENOMINATIONS,
  calculateBanknoteTotal,
  executeSafeCountAuditAndAdjustment
} from '../utils/cashLedgerEngine.js';

export default function CashCountAuditModal({ safe, currentUser, isOpen, onClose, onSuccess }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const currentWallet = safe?.balances?.EGP || { currentBalance: 0, denominations: {} };
  const bookTotal = Number(currentWallet.currentBalance) || 0;
  const currentDenoms = currentWallet.denominations || {};

  // Initialize counted inputs with current safe denominations as starting values
  const [countedDenoms, setCountedDenoms] = useState(() => ({ ...currentDenoms }));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !safe) return null;

  const countedTotal = calculateBanknoteTotal(countedDenoms);
  const variance = countedTotal - bookTotal;
  const isExactMatch = Math.abs(variance) < 0.005;
  const isSurplus = variance > 0.005;
  const isDeficit = variance < -0.005;

  const handleUpdateCount = (denom, val) => {
    const count = Math.max(0, parseInt(val, 10) || 0);
    setCountedDenoms((prev) => ({ ...prev, [denom]: count }));
    setErrorMsg('');
  };

  const handleResetToZero = () => {
    const zeroed = {};
    EGP_DENOMINATIONS.forEach((d) => (zeroed[d] = 0));
    setCountedDenoms(zeroed);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isExactMatch && !notes.trim()) {
      setErrorMsg(
        isAr
          ? 'يرجى تدوين بيان وسبب الفارق (عجز أو زيادة) قبل اعتماد تسوية الجرد'
          : 'Please provide an audit explanation for the discrepancy before proceeding'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await executeSafeCountAuditAndAdjustment({
        safeId: safe.id,
        countedDenominations: countedDenoms,
        notes,
        currentUser
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'فشلت عملية اعتماد الجرد' : 'Safe count audit failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const safeDisplayName = isAr ? safe.nameAr : (safe.nameEn || safe.nameAr);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Scale className="h-6 w-6 text-indigo-300" />
            <div>
              <h3 className="text-base font-extrabold">
                {isAr ? 'جرد الخزينة الفعلي وتظبيط الرصيد' : 'Physical Safe Audit & Ledger Adjustment'}
              </h3>
              <p className="text-xs text-indigo-200">
                {safeDisplayName} — {isAr ? 'مطابقة النقدية الفعلية مع السجلات الدفترية' : 'Reconciling physical banknotes with ledger books'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Variance KPI Comparison Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block mb-1">
                {isAr ? 'الرصيد الدفتري المسجل' : 'Recorded Book Balance'}
              </span>
              <div className="text-lg font-mono font-black text-slate-800">
                {bookTotal.toLocaleString()} <span className="text-xs font-normal text-slate-500">{isAr ? 'ج.م' : 'EGP'}</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block mb-1">
                {isAr ? 'إجمالي الجرد الفعلي' : 'Total Counted Cash'}
              </span>
              <div className="text-lg font-mono font-black text-indigo-700">
                {countedTotal.toLocaleString()} <span className="text-xs font-normal text-slate-500">{isAr ? 'ج.م' : 'EGP'}</span>
              </div>
            </div>

            <div className={`p-3 rounded-lg border shadow-2xs ${
              isExactMatch ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
              isSurplus ? 'bg-blue-50 border-blue-200 text-blue-900' :
              'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <span className="text-[11px] font-bold block mb-1">
                {isExactMatch ? (isAr ? 'حالة المطابقة' : 'Reconciliation Status') : isSurplus ? (isAr ? 'فارق بالزيادة (+)' : 'Surplus (+)') : (isAr ? 'فارق بالعجز (-)' : 'Deficit (-)')}
              </span>
              <div className="text-lg font-mono font-black flex items-center justify-center gap-1">
                {isExactMatch && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {isSurplus && <ArrowUpRight className="h-4 w-4 text-blue-600" />}
                {isDeficit && <ArrowDownRight className="h-4 w-4 text-rose-600" />}
                <span>{Math.abs(variance).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}</span>
              </div>
            </div>
          </div>

          {/* Denominations Counting Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-700">
                {isAr ? 'عد الفئات الورقية الفعلية بالخزينة:' : 'Physical Banknote Inventory Count:'}
              </span>
              <button
                type="button"
                onClick={handleResetToZero}
                className="text-[11px] text-slate-400 hover:text-slate-600 font-bold underline cursor-pointer"
              >
                {isAr ? 'تصفير كافة العدادات' : 'Reset All Counts'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {EGP_DENOMINATIONS.map((denom) => {
                const count = countedDenoms[denom] || '';
                const subTotal = (Number(denom) * (Number(count) || 0)).toLocaleString();
                const systemCount = Number(currentDenoms[denom]) || 0;
                const diff = (Number(count) || 0) - systemCount;
                return (
                  <div key={denom} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-extrabold text-slate-900">{denom} {isAr ? 'ج.م' : 'EGP'}</span>
                      <span className="text-[10px] text-slate-400">
                        {isAr ? 'دفتر:' : 'Book:'} {systemCount}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 my-1">
                      <input
                        type="number"
                        min="0"
                        value={count}
                        onChange={(e) => handleUpdateCount(denom, e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-center font-mono font-black text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span className="font-mono text-indigo-700 font-bold">{subTotal} {isAr ? 'ج' : 'EGP'}</span>
                      {diff !== 0 && (
                        <span className={`font-mono font-bold ${diff > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Variance Warning Notice */}
          {!isExactMatch && (
            <div className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 ${
              isSurplus ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${isSurplus ? 'text-blue-600' : 'text-rose-600'}`} />
              <div>
                <p className="font-extrabold mb-0.5">
                  {isSurplus
                    ? (isAr ? `تنبيه زيادة نقدية: يوجد فائض بمقدار ${variance.toLocaleString()} ج.م عن الدفاتر.` : `Cash Surplus Alert: Found excess of ${variance.toLocaleString()} EGP over book records.`)
                    : (isAr ? `تنبيه عجز نقدي: يوجد نقص بمقدار ${Math.abs(variance).toLocaleString()} ج.م عن الدفاتر.` : `Cash Deficit Alert: Found shortage of ${Math.abs(variance).toLocaleString()} EGP under book records.`)}
                </p>
                <p className="text-[11px] font-normal leading-relaxed opacity-90">
                  {isAr
                    ? `سيقوم النظام تلقائياً بإصدار سند تسوية وتظبيط رصيد (${isSurplus ? 'سند زيادة في الخزينة' : 'سند عجز في الخزينة'}) بقيمة الفارق، وتعديل أرصدة وفئات الخزينة لتطابق هذا الجرد الفعلي.`
                    : `The system will automatically record an adjustment voucher (${isSurplus ? 'Cash Surplus' : 'Cash Deficit'}) for the difference and update the safe balances to match this physical count.`}
                </p>
              </div>
            </div>
          )}

          {/* Justification & Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isAr ? 'ملاحظات وتبرير الجرد' : 'Audit Notes & Justification'} {!isExactMatch && <span className="text-rose-500">* ({isAr ? 'مطلوب عند وجود فارق' : 'Required for variance'})</span>}:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isExactMatch ? (isAr ? 'جرد فعلي دوري مطابق' : 'Routine physical audit match') : (isAr ? 'مثال: تسوية عجز بسبب خطأ في رد الباقي / تم تحميله على عهدة أمين الخزينة' : 'e.g., Change calculation variance / Charged to custodian')}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-600 transition cursor-pointer flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            <ClipboardCheck className="h-4 w-4" />
            <span>
              {isSubmitting
                ? (isAr ? 'جاري الاعتماد...' : 'Approving...')
                : (isExactMatch
                    ? (isAr ? 'اعتماد الجرد المطابق' : 'Approve Matching Audit')
                    : (isAr ? 'اعتماد وتسوية الفارق تلقائياً' : 'Approve & Reconcile Variance'))}
            </span>
          </button>
        </div>
      </form>
    </div>
  </div>
);
}
