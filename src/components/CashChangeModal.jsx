import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowLeftRight, CheckCircle2, AlertTriangle, Coins } from 'lucide-react';
import {
  EGP_DENOMINATIONS,
  calculateBanknoteTotal,
  checkSufficientBanknotes,
  executeChangeExchange
} from '../utils/cashLedgerEngine.js';

export default function CashChangeModal({ safe, currentUser, isOpen, onClose, onSuccess }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [notesGivenOut, setNotesGivenOut] = useState({});
  const [notesTakenIn, setNotesTakenIn] = useState({});
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !safe) return null;

  const currentDenoms = safe.balances?.EGP?.denominations || {};

  const totalOut = calculateBanknoteTotal(notesGivenOut);
  const totalIn = calculateBanknoteTotal(notesTakenIn);
  const isBalanced = totalOut > 0 && Math.abs(totalOut - totalIn) < 0.005;

  const sufficiency = checkSufficientBanknotes(currentDenoms, notesGivenOut);

  const handleUpdateOut = (denom, val) => {
    const count = Math.max(0, parseInt(val, 10) || 0);
    setNotesGivenOut((prev) => ({ ...prev, [denom]: count }));
    setErrorMsg('');
  };

  const handleUpdateIn = (denom, val) => {
    const count = Math.max(0, parseInt(val, 10) || 0);
    setNotesTakenIn((prev) => ({ ...prev, [denom]: count }));
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isBalanced) {
      setErrorMsg(
        isAr
          ? 'عملية الفكة يجب أن تكون متوازنة القيمة تماماً بين الفئات الخارجة والداخلة'
          : 'Change exchange must be an exact zero-sum match between outflow and inflow'
      );
      return;
    }

    if (!sufficiency.isSufficient) {
      setErrorMsg(
        isAr
          ? 'الفئات الورقية المراد إخراجها غير متوفرة بالكامل في الخزينة حالياً'
          : 'Selected outflow banknotes are not sufficiently available in the safe'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await executeChangeExchange({
        safeId: safe.id,
        notesGivenOut,
        notesTakenIn,
        notes,
        currentUser
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'فشلت عملية الفكة' : 'Change exchange failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const safeDisplayName = isAr ? safe.nameAr : (safe.nameEn || safe.nameAr);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Coins className="h-6 w-6 text-amber-200" />
            <div>
              <h3 className="text-base font-extrabold">
                {isAr ? 'عملية فكة وتظبيط فئات ورقية' : 'Change Exchange & Banknote Rebalance'}
              </h3>
              <p className="text-xs text-amber-100">
                {safeDisplayName} — {isAr ? 'تبديل فئات متكافئة بدون تغيير الرصيد الإجمالي' : 'Equal-value denomination swap (Zero-Sum)'}
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

          {/* Dual Columns: Out vs In */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* 1. Notes Given Out (الخارج من الخزينة) */}
            <div className="bg-rose-50/50 border border-rose-200 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-rose-200">
                <span className="text-xs font-extrabold text-rose-900">
                  {isAr ? 'الفئات المنصرفة (الخارجة)' : 'Banknotes Given Out'}
                </span>
                <span className="text-xs font-mono font-black text-rose-700">
                  {totalOut.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {EGP_DENOMINATIONS.map((denom) => {
                  const available = Number(currentDenoms[denom]) || 0;
                  const count = notesGivenOut[denom] || '';
                  return (
                    <div key={denom} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-rose-100">
                      <div>
                        <span className="font-extrabold text-slate-800">{denom} {isAr ? 'ج.م' : 'EGP'}</span>
                        <span className="text-[10px] text-slate-400 block">
                          {isAr ? `المتوفر: ${available} ورقة` : `In safe: ${available}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max={available}
                          value={count}
                          onChange={(e) => handleUpdateOut(denom, e.target.value)}
                          placeholder="0"
                          className="w-16 px-2 py-1 text-center font-mono font-bold border border-rose-200 rounded-md focus:ring-1 focus:ring-rose-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">{isAr ? 'ورقة' : 'Bills'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Notes Taken In (الداخل إلى الخزينة) */}
            <div className="bg-emerald-50/50 border border-emerald-200 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                <span className="text-xs font-extrabold text-emerald-900">
                  {isAr ? 'الفئات المستلمة (الداخلة)' : 'Banknotes Received In'}
                </span>
                <span className="text-xs font-mono font-black text-emerald-700">
                  {totalIn.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {EGP_DENOMINATIONS.map((denom) => {
                  const count = notesTakenIn[denom] || '';
                  return (
                    <div key={denom} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-emerald-100">
                      <div>
                        <span className="font-extrabold text-slate-800">{denom} {isAr ? 'ج.م' : 'EGP'}</span>
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'فئة نقدية' : 'Banknote'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={count}
                          onChange={(e) => handleUpdateIn(denom, e.target.value)}
                          placeholder="0"
                          className="w-16 px-2 py-1 text-center font-mono font-bold border border-emerald-200 rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">{isAr ? 'ورقة' : 'Bills'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Balance Indicator */}
          <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
            isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center gap-2">
              <ArrowLeftRight className={`h-4 w-4 ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span>
                {isBalanced
                  ? (isAr ? 'القيم متطابقة تماماً — العملية متوازنة (صافي التغير = 0 ج.م)' : 'Values match perfectly — Balanced exchange (Net Change = 0 EGP)')
                  : (isAr ? `الفارق بين الخارج والداخل: ${Math.abs(totalOut - totalIn).toLocaleString()} ج.م` : `Variance between In & Out: ${Math.abs(totalOut - totalIn).toLocaleString()} EGP`)}
              </span>
            </div>
            {isBalanced && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isAr ? 'ملاحظات العملية / سبب الفكة:' : 'Exchange Notes / Purpose:'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAr ? 'مثال: فكة 5000 ج إلى فئات صغيرة لتسليم سلف العمالة' : 'e.g., Breaking 5,000 EGP into smaller notes for worker advances'}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none"
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
            disabled={!isBalanced || !sufficiency.isSufficient || isSubmitting}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white transition cursor-pointer flex items-center gap-2 shadow-md ${
              isBalanced && sufficiency.isSufficient && !isSubmitting
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-slate-300 cursor-not-allowed text-slate-500'
            }`}
          >
            {isSubmitting
              ? (isAr ? 'جاري المعالجة...' : 'Processing...')
              : (isAr ? 'تأكيد عملية الفكة' : 'Confirm Change Exchange')}
          </button>
        </div>
      </form>
    </div>
  </div>
);
}
