import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Wand2,
  Paperclip,
  Trash2,
  Upload,
  Building2,
  ShieldCheck
} from 'lucide-react';
import {
  EGP_DENOMINATIONS,
  SAFE_THEMES,
  calculateBanknoteTotal,
  validateBanknoteMatch,
  checkSufficientBanknotes,
  initiateInterSafeTransfer
} from '../utils/cashLedgerEngine.js';
import { fileToDataUrl } from '../firebase.js';
import SearchableSelect from './SearchableSelect.jsx';

export default function InterSafeTransferModal({
  sourceSafe,
  allSafes = [],
  currentUser,
  isOpen,
  onClose,
  onSuccess
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [targetSafeId, setTargetSafeId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Banknotes breakdown state
  const [denominations, setDenominations] = useState(() => {
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    return init;
  });

  // Filter available target safes (excluding source safe and must be active)
  const availableTargetSafes = useMemo(() => {
    return allSafes.filter((s) => s.id !== sourceSafe?.id && s.isActive !== false);
  }, [allSafes, sourceSafe]);

  const targetSafeOptions = useMemo(() => {
    return availableTargetSafes.map((s) => ({
      value: s.id,
      label: `${isAr ? s.nameAr : (s.nameEn || s.nameAr)} (${s.id})`,
      sublabel: `[${(Number(s.balances?.EGP?.currentBalance) || 0).toLocaleString()} ${isAr ? 'ج' : 'EGP'}]`,
      badgeText: isAr ? 'خزينة' : 'Vault'
    }));
  }, [availableTargetSafes, isAr]);

  // Set default target safe if available
  useEffect(() => {
    if (availableTargetSafes.length > 0 && !targetSafeId) {
      setTargetSafeId(availableTargetSafes[0].id);
    }
  }, [availableTargetSafes, targetSafeId]);

  const targetSafe = useMemo(() => {
    return allSafes.find((s) => s.id === targetSafeId) || null;
  }, [allSafes, targetSafeId]);

  // Source safe balances & note inventory
  const sourceWallet = sourceSafe?.balances?.EGP || { currentBalance: 0, denominations: {} };
  const sourceBalance = Number(sourceWallet.currentBalance) || 0;
  const sourceDenoms = sourceWallet.denominations || {};

  const targetWallet = targetSafe?.balances?.EGP || { currentBalance: 0, denominations: {} };
  const targetBalance = Number(targetWallet.currentBalance) || 0;
  const targetDenoms = targetWallet.denominations || {};

  // Banknote calculations
  const numAmount = Number(amount) || 0;
  const countedTotal = useMemo(() => calculateBanknoteTotal(denominations), [denominations]);
  const banknoteDiff = countedTotal - numAmount;
  const isBanknoteBalanced = validateBanknoteMatch(numAmount, denominations);

  // Sufficiency checks: Source safe must have positive notes, Target safe must have negative change notes
  const sourceSufficiency = useMemo(() => {
    return checkSufficientBanknotes(sourceDenoms, denominations, true);
  }, [sourceDenoms, denominations]);

  const targetSufficiency = useMemo(() => {
    const shortages = [];
    for (const denom of EGP_DENOMINATIONS) {
      const count = Number(denominations[denom]) || 0;
      if (count < 0) {
        const needed = -count;
        const available = Number(targetDenoms[denom]) || 0;
        if (needed > available) {
          shortages.push({ denom, requested: needed, available, shortage: needed - available });
        }
      }
    }
    return {
      isSufficient: shortages.length === 0,
      shortages
    };
  }, [targetDenoms, denominations]);

  const isOverallSufficient = sourceSufficiency.isSufficient && targetSufficiency.isSufficient;

  // Auto-Fill banknote algorithm
  const handleAutoFillBanknotes = () => {
    if (numAmount <= 0) {
      setErrorMsg(isAr ? 'يرجى إدخال مبلغ التحويل أولاً' : 'Please enter the transfer amount first');
      return;
    }

    let remaining = numAmount;
    const proposed = {};
    EGP_DENOMINATIONS.forEach((d) => (proposed[d] = 0));

    for (const denom of EGP_DENOMINATIONS) {
      if (remaining <= 0) break;
      const available = Number(sourceDenoms[denom]) || 0;
      if (available > 0 && denom <= remaining) {
        const countNeeded = Math.floor(remaining / denom);
        const countToTake = Math.min(countNeeded, available);
        proposed[denom] = countToTake;
        remaining -= countToTake * denom;
        remaining = Math.round(remaining * 100) / 100;
      }
    }

    setDenominations(proposed);
    setErrorMsg('');
  };

  const handleDenominationChange = (denom, val) => {
    if (val === '' || val === undefined) {
      setDenominations((prev) => ({ ...prev, [denom]: 0 }));
      setErrorMsg('');
      return;
    }
    if (val === '-' || val === '-0') {
      setDenominations((prev) => ({ ...prev, [denom]: '-' }));
      return;
    }
    const clean = String(val).replace(/[^0-9-]/g, '');
    const count = parseInt(clean, 10);
    setDenominations((prev) => ({ ...prev, [denom]: isNaN(count) ? 0 : count }));
    setErrorMsg('');
  };

  const handleToggleSign = (denom) => {
    setDenominations((prev) => {
      const current = Number(prev[denom]) || 0;
      if (current === 0) return { ...prev, [denom]: -1 };
      return { ...prev, [denom]: -current };
    });
    setErrorMsg('');
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const fileData = await fileToDataUrl(file);
        if (fileData) uploaded.push(fileData);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'فشل تحميل الملف' : 'File upload failed'));
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetSafeId) {
      setErrorMsg(isAr ? 'يرجى اختيار الخزينة المستلمة' : 'Please select target safe');
      return;
    }
    if (numAmount <= 0) {
      setErrorMsg(isAr ? 'يرجى إدخال مبلغ تحويل صحيح أكبر من الصفر' : 'Please enter a valid transfer amount');
      return;
    }
    if (numAmount > sourceBalance) {
      setErrorMsg(
        isAr
          ? `رصيد الخزينة المصدر (${sourceBalance.toLocaleString()} ج.م) لا يكفي لإتمام تحويل (${numAmount.toLocaleString()} ج.م)`
          : `Source safe balance (${sourceBalance.toLocaleString()} EGP) is insufficient for (${numAmount.toLocaleString()} EGP)`
      );
      return;
    }
    if (!isBanknoteBalanced) {
      setErrorMsg(
        isAr
          ? `تفقيط الفئات الورقية (${countedTotal.toLocaleString()} ج.م) لا يتطابق مع إجمالي التحويل (${numAmount.toLocaleString()} ج.م)`
          : `Banknotes total (${countedTotal.toLocaleString()} EGP) does not match transfer amount`
      );
      return;
    }
    if (!sourceSufficiency.isSufficient) {
      const detailStr = sourceSufficiency.shortages
        .map((s) => `فئة ${s.denom} ج (المطلوب: ${s.requested}، المتوفر بالخزينة: ${s.available})`)
        .join('، ');
      setErrorMsg(
        isAr
          ? `الفئات الورقية المتوفرة بالخزينة المصدر لا تكفي: ${detailStr}`
          : `Insufficient notes in source safe: ${detailStr}`
      );
      return;
    }
    if (!targetSufficiency.isSufficient) {
      const detailStr = targetSufficiency.shortages
        .map((s) => `فئة ${s.denom} ج (المطلوب كفكة من المستلم: ${s.requested}، المتوفر لديه: ${s.available})`)
        .join('، ');
      setErrorMsg(
        isAr
          ? `فئات الفكة المطلوب استردادها غير متوفرة بالخزينة المستلمة: ${detailStr}`
          : `Insufficient change notes in target safe: ${detailStr}`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const sourceName = isAr ? sourceSafe.nameAr : (sourceSafe.nameEn || sourceSafe.nameAr);
      const targetName = isAr ? targetSafe?.nameAr : (targetSafe?.nameEn || targetSafe?.nameAr);
      const defaultDesc = isAr
        ? `تحويل سيولة نقدية من ${sourceName} إلى ${targetName}`
        : `Cash liquidity transfer from ${sourceName} to ${targetName}`;

      const cleanDenominations = Object.fromEntries(
        Object.entries(denominations).map(([k, v]) => [k, Number(v) || 0])
      );

      await initiateInterSafeTransfer({
        sourceSafeId: sourceSafe.id,
        targetSafeId,
        amount: numAmount,
        currency: 'EGP',
        denominations: cleanDenominations,
        description: description.trim() || defaultDesc,
        attachments,
        currentUser
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'حدث خطأ أثناء تنفيذ التحويل' : 'Transfer execution error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const sourceTheme = SAFE_THEMES[sourceSafe?.color] || SAFE_THEMES.blue;
  const targetTheme = SAFE_THEMES[targetSafe?.color] || SAFE_THEMES.emerald;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto ${
          isAr ? 'text-right' : 'text-left'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <ArrowRightLeft className="h-5 w-5 text-blue-200" />
            </div>
            <div>
              <h3 className="text-base font-extrabold">
                {isAr ? 'تحويل نقدية بين الخزائن (اعتماد مشترك)' : 'Inter-Safe Transfer (Two-Party Handshake)'}
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {isAr
                  ? 'يتم خصم النقدية من الخزينة المصدر فوراً وإرسال إشعار للمسؤول عن الخزينة المستلمة لتأكيد الاستلام'
                  : 'Funds are deducted from source vault immediately and sent to receiver custodian for receipt confirmation'}
              </p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-2.5 font-bold animate-shake">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

          {/* Safe Transfer Flow Visualizer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            {/* Source Safe (From) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isAr ? 'الخزينة المحول منها (المصدر)' : 'Source Vault (Debit)'}
              </span>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-slate-900">
                  {isAr ? sourceSafe?.nameAr : (sourceSafe?.nameEn || sourceSafe?.nameAr)}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-200 text-slate-700 rounded-lg">
                  {sourceSafe?.id}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1 border-t border-slate-200">
                <span>{isAr ? 'الرصيد المتاح:' : 'Available Balance:'}</span>
                <span className="font-mono font-bold text-blue-700">
                  {sourceBalance.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                </span>
              </div>
            </div>

            {/* Target Safe (To) */}
            <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-1.5">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                {isAr ? 'الخزينة المحول إليها (المستلم)' : 'Destination Vault (Credit)'}
              </span>
              {availableTargetSafes.length === 0 ? (
                <div className="text-rose-600 font-bold py-1">
                  {isAr ? 'لا توجد خزينة أخرى متاحة للتحويل إليها' : 'No other vaults available'}
                </div>
              ) : (
                <SearchableSelect
                  options={targetSafeOptions}
                  value={targetSafeId}
                  onChange={(val) => setTargetSafeId(val)}
                  isAr={isAr}
                  placeholder={isAr ? '-- اختر الخزينة المستلمة --' : '-- Select Destination Vault --'}
                />
              )}
              {targetSafe && (
                <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1 border-t border-indigo-100">
                  <span>{isAr ? 'الرصيد الحالي:' : 'Current Balance:'}</span>
                  <span className="font-mono font-bold text-indigo-700">
                    {targetBalance.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Transfer Amount */}
          <div className="bg-white p-4 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-extrabold text-slate-800">
                {isAr ? 'مبلغ التحويل النقدي (EGP):' : 'Transfer Amount (EGP):'}
              </label>
              <button
                type="button"
                onClick={handleAutoFillBanknotes}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                <Wand2 className="h-3.5 w-3.5 text-indigo-600" />
                <span>{isAr ? 'توزيع تلقائي للفئات' : 'Auto-Fill Banknotes'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`w-full py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-base font-mono font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition ${
                  isAr ? 'pl-20 pr-4' : 'pr-16 pl-4'
                }`}
              />
              <span className={`absolute top-1/2 -translate-y-1/2 ${isAr ? 'left-3.5' : 'right-3.5'} text-xs font-bold text-slate-400 pointer-events-none select-none`}>
                {isAr ? 'جنيه مصري' : 'EGP'}
              </span>
            </div>
          </div>

          {/* Banknotes Breakdown Grid */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-blue-600" />
                <span className="font-extrabold text-slate-800">
                  {isAr ? 'تفقيط الفئات الورقية المحولة' : 'Banknotes Count Breakdown'}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-[11px] text-slate-500">{isAr ? 'المحدد:' : 'Counted:'}</span>
                <span className={`font-black ${isBanknoteBalanced ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {countedTotal.toLocaleString()} {isAr ? 'ج' : 'EGP'}
                </span>
                {isBanknoteBalanced && numAmount > 0 && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {EGP_DENOMINATIONS.map((denom) => {
                const rawCount = denominations[denom];
                const numCount = Number(rawCount) || 0;
                const isNegative = typeof rawCount === 'string' && rawCount.startsWith('-') ? true : numCount < 0;
                const availSource = Number(sourceDenoms[denom]) || 0;
                const availTarget = Number(targetDenoms[denom]) || 0;
                const isShort = isNegative ? Math.abs(numCount) > availTarget : numCount > availSource;

                return (
                  <div
                    key={denom}
                    className={`p-2.5 rounded-xl border flex flex-col justify-between transition relative ${
                      isShort
                        ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-400'
                        : isNegative
                        ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/50'
                        : numCount > 0
                        ? 'bg-blue-50/80 border-blue-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-extrabold text-slate-800">{denom} {isAr ? 'ج' : 'EGP'}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleSign(denom)}
                          title={isAr ? 'تبديل الإشارة (+ محول أو - فكة مرتدة)' : 'Toggle sign (+ transferred or - change return)'}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black transition cursor-pointer ${
                            isNegative ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                        >
                          {isNegative ? '-' : '+'}
                        </button>
                      </div>
                    </div>

                    <div className="relative my-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={rawCount === 0 ? '' : rawCount}
                        placeholder="0"
                        onChange={(e) => handleDenominationChange(denom, e.target.value)}
                        className={`w-full px-2 py-1 text-center font-mono font-black text-xs border rounded-lg focus:outline-none transition ${
                          isNegative
                            ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-1 focus:ring-amber-500'
                            : 'border-slate-300 bg-white text-slate-900 focus:ring-1 focus:ring-blue-500'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] mt-0.5">
                      <span className="text-slate-400 font-mono">
                        {isNegative
                          ? `${isAr ? 'فكة بالمستلم:' : 'Target chg:'} ${availTarget}`
                          : `${isAr ? 'متاح:' : 'Avail:'} ${availSource}`}
                      </span>
                      <span className={`font-mono font-bold ${isNegative ? 'text-amber-800' : 'text-slate-600'}`}>
                        {(numCount * denom).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Description & Memo */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isAr ? 'بيان / سبب التحويل (اختياري):' : 'Transfer Memo / Reason (Optional):'}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isAr ? 'مثال: تغذية خزينة المبيعات للسيولة النقدية' : 'e.g., Replenishing sales vault for cash operations'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                <span>{isAr ? 'مستندات داعمة / إذن تحويل داخلي:' : 'Supporting Documents / Transfer Slip:'}</span>
              </label>
              <label className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1">
                <Upload className="h-3.5 w-3.5" />
                <span>{isAr ? 'رفع مستند' : 'Upload File'}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1.5">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px]"
                  >
                    <span className="truncate max-w-[300px] font-medium text-slate-700">
                      {att.name || `مستند ${idx + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 p-4 sm:px-6 bg-slate-50 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isUploading || !isBanknoteBalanced || !isOverallSufficient || numAmount <= 0}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-extrabold shadow-md hover:shadow-blue-600/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <span>{isAr ? 'جاري ترحيل التحويل...' : 'Dispatching Transfer...'}</span>
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4" />
                <span>{isAr ? 'خصم وترحيل التحويل إلى الخزينة المستلمة' : 'Dispatch Transfer to Target Safe'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  </div>
);
}
