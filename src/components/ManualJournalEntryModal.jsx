import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  FileCheck,
  AlertTriangle,
  Scale,
  Paperclip,
  Upload,
  Calendar,
  Layers,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  CornerDownRight,
  Sparkles
} from 'lucide-react';
import { db, functions, fileToDataUrl } from '../firebase.js';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import SearchableSelect from './SearchableSelect.jsx';

export const MANUAL_ENTRY_CATEGORIES = [
  { id: 'adjustment', labelAr: 'تسوية حسابات عامة', labelEn: 'General Adjustment' },
  { id: 'depreciation', labelAr: 'إهلاك أصول ثابتة', labelEn: 'Asset Depreciation' },
  { id: 'accrual', labelAr: 'استحقاقات ومصروفات مقدمة', labelEn: 'Accrual / Prepayment' },
  { id: 'opening_balance', labelAr: 'تسوية أرصدة افتتاحية', labelEn: 'Opening Balance Correction' },
  { id: 'correction', labelAr: 'تصحيح خطأ قيد محاسبي', labelEn: 'Journal Error Correction' },
  { id: 'reclassification', labelAr: 'إعادة تبويب محاسبي', labelEn: 'Account Reclassification' },
  { id: 'general', labelAr: 'قيد يومية يدوي عام', labelEn: 'General Journal Entry' }
];

export const DEFAULT_COST_CENTERS = [
  { id: 'CC-PROD-01', code: 'CC-PROD-01', nameAr: 'خط الإنتاج والتصنيع 1', nameEn: 'Production Line 1' },
  { id: 'CC-PROD-02', code: 'CC-PROD-02', nameAr: 'عنبر خلط وتعبئة الخل 2', nameEn: 'Vinegar Compounding & Bottling 2' },
  { id: 'CC-MAINT', code: 'CC-MAINT', nameAr: 'ورشة الصيانة وقطع الغيار', nameEn: 'Maintenance & Spare Parts' },
  { id: 'CC-FLEET', code: 'CC-FLEET', nameAr: 'أسطول النقل والتوزيع اللوجستي', nameEn: 'Fleet & Logistics' },
  { id: 'CC-ADMIN', code: 'CC-ADMIN', nameAr: 'إدارة المصنع والمرافق العامة', nameEn: 'Plant Admin & Facilities' }
];

export default function ManualJournalEntryModal({
  isOpen,
  onClose,
  onSuccess,
  accountsList = [],
  suppliersList = [],
  clientsList = [],
  workersList = [],
  safesList = [],
  banksList = [],
  currentUser = null,
  isAr = true
}) {
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('adjustment');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [isTaxOfficial, setIsTaxOfficial] = useState(true);

  // Dynamic Cost Centers loaded from Firestore
  const [costCenters, setCostCenters] = useState(DEFAULT_COST_CENTERS);

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'system_config', 'cost_centers'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.list) && data.list.length > 0) {
            setCostCenters(data.list);
          }
        }
      });
      return () => unsub();
    } catch (err) {
      console.warn('Silent note: Could not load cost_centers config:', err);
    }
  }, []);

  // Dynamic Journal Rows (minimum 2 rows)
  const [lines, setLines] = useState([
    {
      id: 'line_1',
      accountCode: '',
      accountNameAr: '',
      accountNameEn: '',
      nature: 'debit',
      debit: '',
      credit: '',
      subledgerType: '',
      subledgerId: '',
      subledgerName: '',
      costCenterId: '',
      notes: ''
    },
    {
      id: 'line_2',
      accountCode: '',
      accountNameAr: '',
      accountNameEn: '',
      nature: 'credit',
      debit: '',
      credit: '',
      subledgerType: '',
      subledgerId: '',
      subledgerName: '',
      costCenterId: '',
      notes: ''
    }
  ]);

  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Formatted Options for GL Accounts SearchableSelect
  const accountOptions = useMemo(() => {
    return accountsList.map((acc) => ({
      value: acc.code,
      code: acc.code,
      label: `${acc.code} - ${acc.nameAr || acc.nameEn}`,
      sublabel: acc.statement === 'balance_sheet' ? (isAr ? 'المركز المالي' : 'BS') : (isAr ? 'قائمة الدخل' : 'P&L'),
      nameAr: acc.nameAr,
      nameEn: acc.nameEn,
      subType: acc.subType
    }));
  }, [accountsList, isAr]);

  // Formatted Options for Cost Centers SearchableSelect
  const costCenterOptions = useMemo(() => {
    return costCenters.map((cc) => ({
      value: cc.code || cc.id,
      label: `${cc.code || cc.id} • ${cc.nameAr || cc.nameEn}`,
      sublabel: cc.nameEn || ''
    }));
  }, [costCenters]);

  // Handle Inline Creation of a New Cost Center
  const handleCreateCostCenter = async (newInput) => {
    const trimmed = String(newInput || '').trim();
    if (!trimmed) return;

    const generatedId = `CC-${Date.now().toString().slice(-4)}`;
    const newCenter = {
      id: generatedId,
      code: generatedId,
      nameAr: trimmed,
      nameEn: trimmed,
      createdAt: new Date().toISOString()
    };

    const updatedList = [...costCenters, newCenter];
    setCostCenters(updatedList);

    try {
      await setDoc(doc(db, 'system_config', 'cost_centers'), {
        list: updatedList,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || currentUser?.nameAr || 'Admin'
      }, { merge: true });
    } catch (err) {
      console.warn('Note: Could not persist new cost center to Firestore:', err);
    }
  };

  // Live Totals and Double-Entry Calculations
  const { totalDebits, totalCredits, variance, isBalanced, hasValidLines } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    let validCount = 0;

    lines.forEach((l) => {
      const d = parseFloat(l.debit) || 0;
      const c = parseFloat(l.credit) || 0;
      debits += d;
      credits += c;
      if (l.accountCode && (d > 0 || c > 0)) {
        validCount++;
      }
    });

    const diff = Math.round(Math.abs(debits - credits) * 100) / 100;
    const balanced = diff < 0.01 && debits > 0 && validCount >= 2;

    return {
      totalDebits: Math.round(debits * 100) / 100,
      totalCredits: Math.round(credits * 100) / 100,
      variance: diff,
      isBalanced: balanced,
      hasValidLines: validCount >= 2
    };
  }, [lines]);

  if (!isOpen) return null;

  // Add a new row to the entry
  const handleAddLine = () => {
    const newId = `line_${Date.now().toString().slice(-6)}_${lines.length + 1}`;
    setLines((prev) => [
      ...prev,
      {
        id: newId,
        accountCode: '',
        accountNameAr: '',
        accountNameEn: '',
        nature: totalDebits > totalCredits ? 'credit' : 'debit',
        debit: '',
        credit: '',
        subledgerType: '',
        subledgerId: '',
        subledgerName: '',
        costCenterId: '',
        notes: ''
      }
    ]);
  };

  // Remove a row (prevent reducing below 2 rows)
  const handleRemoveLine = (idx) => {
    if (lines.length <= 2) {
      alert(isAr ? 'يجب أن يحتوي القيد على طرفين على الأقل (مدين ودائن)' : 'A journal entry must contain at least 2 legs');
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Update a line field
  const handleLineChange = (idx, field, value) => {
    setLines((prev) => {
      const updated = [...prev];
      const target = { ...updated[idx] };

      if (field === 'accountCode') {
        const found = accountsList.find((a) => a.code === value);
        target.accountCode = value;
        target.accountNameAr = found?.nameAr || '';
        target.accountNameEn = found?.nameEn || found?.nameAr || '';
        target.subledgerType = found?.subType || '';
        target.subledgerId = '';
        target.subledgerName = '';
      } else if (field === 'debit') {
        const cleanVal = value === '' ? '' : Math.max(0, parseFloat(value) || 0);
        target.debit = cleanVal;
        if (cleanVal > 0) {
          target.credit = '';
          target.nature = 'debit';
        }
      } else if (field === 'credit') {
        const cleanVal = value === '' ? '' : Math.max(0, parseFloat(value) || 0);
        target.credit = cleanVal;
        if (cleanVal > 0) {
          target.debit = '';
          target.nature = 'credit';
        }
      } else if (field === 'subledgerId') {
        target.subledgerId = value;
        let entName = '';
        if (target.subledgerType === 'supplier') {
          entName = suppliersList.find((s) => s.id === value)?.name || '';
        } else if (target.subledgerType === 'client') {
          entName = clientsList.find((c) => c.id === value)?.name || '';
        } else if (target.subledgerType === 'worker') {
          entName = workersList.find((w) => w.id === value)?.name || '';
        } else if (target.subledgerType === 'safe') {
          entName = safesList.find((s) => s.id === value)?.nameAr || '';
        } else if (target.subledgerType === 'bank') {
          entName = banksList.find((b) => b.id === value)?.nameAr || '';
        }
        target.subledgerName = entName;
      } else {
        target[field] = value;
      }

      updated[idx] = target;
      return updated;
    });
  };

  // Auto-balance helper
  const handleAutoBalance = () => {
    if (variance <= 0) return;

    if (totalDebits > totalCredits) {
      const emptyCreditIdx = lines.findIndex((l) => !l.debit && (!l.credit || l.credit === ''));
      if (emptyCreditIdx >= 0) {
        handleLineChange(emptyCreditIdx, 'credit', variance);
      } else {
        const newId = `line_${Date.now().toString().slice(-6)}`;
        setLines((prev) => [
          ...prev,
          {
            id: newId,
            accountCode: '',
            accountNameAr: '',
            accountNameEn: '',
            nature: 'credit',
            debit: '',
            credit: variance,
            subledgerType: '',
            subledgerId: '',
            subledgerName: '',
            costCenterId: '',
            notes: ''
          }
        ]);
      }
    } else {
      const emptyDebitIdx = lines.findIndex((l) => !l.credit && (!l.debit || l.debit === ''));
      if (emptyDebitIdx >= 0) {
        handleLineChange(emptyDebitIdx, 'debit', variance);
      } else {
        const newId = `line_${Date.now().toString().slice(-6)}`;
        setLines((prev) => [
          ...prev,
          {
            id: newId,
            accountCode: '',
            accountNameAr: '',
            accountNameEn: '',
            nature: 'debit',
            debit: variance,
            credit: '',
            subledgerType: '',
            subledgerId: '',
            subledgerName: '',
            costCenterId: '',
            notes: ''
          }
        ]);
      }
    }
  };

  // File Upload Handling
  const handleFileUpload = async (e) => {
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

  // Save and Post Entry
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!descriptionAr.trim()) {
      setErrorMsg(isAr ? 'يرجى كتابة شرح وبيان القيد المحاسبي' : 'Please provide entry description');
      return;
    }

    if (!isBalanced) {
      setErrorMsg(
        isAr
          ? `لا يمكن حفظ القيد: القيد غير متزن! يوجد فرق قدره (${variance.toLocaleString()} ج.م)`
          : `Cannot post entry: Unbalanced! Variance of (${variance.toLocaleString()} EGP)`
      );
      return;
    }

    const invalidLines = lines.filter((l) => (Number(l.debit) > 0 || Number(l.credit) > 0) && !l.accountCode);
    if (invalidLines.length > 0) {
      setErrorMsg(isAr ? 'يرجى اختيار الحساب المحاسبي لجميع أطراف القيد' : 'Please select an account for all lines');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const entryId = `JE-MAN-${Date.now().toString().slice(-6)}`;
      const now = new Date().toISOString();
      const currentUserName = currentUser?.name || currentUser?.nameAr || 'المحاسب المالي';

      const cleanLines = lines
        .filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0)
        .map((l) => ({
          accountCode: l.accountCode,
          accountNameAr: l.accountNameAr || l.accountCode,
          accountNameEn: l.accountNameEn || l.accountNameAr || l.accountCode,
          nature: Number(l.debit) > 0 ? 'debit' : 'credit',
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          subledgerType: l.subledgerType || '',
          subledgerId: l.subledgerId || '',
          subledgerName: l.subledgerName || '',
          costCenterId: l.costCenterId || '',
          notes: l.notes || ''
        }));

      const catObj = MANUAL_ENTRY_CATEGORIES.find((c) => c.id === category);

      const entryPayload = {
        id: entryId,
        entryNumber: entryId,
        sourceDocType: 'manual_adjustment',
        docLabelAr: catObj?.labelAr || 'قيد تسوية وتصحيح يدوي',
        docLabelEn: catObj?.labelEn || 'Manual Adjustment Entry',
        entryDate,
        category,
        referenceNumber: referenceNumber.trim() || entryId,
        descriptionAr: descriptionAr.trim(),
        descriptionEn: descriptionEn.trim() || descriptionAr.trim(),
        status: 'posted',
        streamType: 'accrual',
        totalDebit: totalDebits,
        totalCredit: totalCredits,
        isBalanced: true,
        lines: cleanLines,
        attachments: attachments || [],
        isTaxOfficial: Boolean(isTaxOfficial),
        createdBy: currentUserName,
        createdAt: now,
        updatedAt: now
      };

      const postManualJeFn = httpsCallable(functions, 'financePostManualJournalEntry');
      const res = await postManualJeFn({
        entry: entryPayload,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null
      });
      const persistedEntry = res?.data?.entryPayload || entryPayload;

      if (onSuccess) {
        onSuccess(persistedEntry);
      }
      onClose();
    } catch (err) {
      console.error('Error posting manual adjustment entry:', err);
      setErrorMsg(err.message || 'Error posting journal entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to resolve Sub-Ledger options based on type
  const getSubLedgerOptions = (subType) => {
    if (subType === 'supplier') {
      return suppliersList.map((s) => ({ value: s.id, label: s.name, sublabel: s.id }));
    }
    if (subType === 'client') {
      return clientsList.map((c) => ({ value: c.id, label: c.name, sublabel: c.id }));
    }
    if (subType === 'worker') {
      return workersList.map((w) => ({ value: w.id, label: w.name, sublabel: w.role || w.id }));
    }
    if (subType === 'safe') {
      return safesList.map((s) => ({ value: s.id, label: s.nameAr || s.name, sublabel: s.id }));
    }
    if (subType === 'bank') {
      return banksList.map((b) => ({ value: b.id, label: b.nameAr || b.name, sublabel: b.id }));
    }
    return [];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden text-slate-900 flex flex-col max-h-[94vh] my-auto">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 text-emerald-400">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">
                {isAr ? 'تسجيل قيد تسوية وتصحيح يدوي (Manual Journal Entry)' : 'New Manual Adjustment Journal Entry'}
              </h3>
              <p className="text-[11px] text-slate-300">
                {isAr
                  ? 'قيد مزدوج معتمد بتوازن إلزامي بين المدين والدائن مع إرفاق المستندات المؤيدة'
                  : 'Zero-variance double-entry journal voucher with supporting document attachments'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {errorMsg && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

          {/* Section 1: Header Details */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isAr ? 'تاريخ القيد:' : 'Entry Date:'}
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isAr ? 'نوع وتبويب القيد:' : 'Entry Category:'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer"
              >
                {MANUAL_ENTRY_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {isAr ? cat.labelAr : cat.labelEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isAr ? 'رقم المرجع / المستند:' : 'Reference #:'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: MEMO-2026-04' : 'e.g. MEMO-2026-04'}
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {isAr ? 'المستوى المعتمد للقيد:' : 'Visibility Tier:'}
              </label>
              <div className="flex items-center gap-2 pt-1.5">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isTaxOfficial}
                    onChange={(e) => setIsTaxOfficial(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span>{isAr ? 'معتمد بالعرض القياسي' : 'Standard View Certified'}</span>
                </label>
              </div>
            </div>

            {/* Spacious Multi-line Description Field */}
            <div className="sm:col-span-2 md:col-span-4">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                {isAr ? 'بيان وشرح القيد المحاسبي بالتفصيل (إلزامي):' : 'Journal Description / Memo (Detailed, Required):'}
              </label>
              <textarea
                rows={3}
                placeholder={
                  isAr
                    ? 'اكتب شرح القيد بالتفصيل، مثال: إثبات إهلاك خط تعبئة السوائل عن شهر أكتوبر ٢٠٢٦ وفق المعايير المحاسبية المعتمدة ومحاضر الجرد...'
                    : 'Write a comprehensive narrative for the journal entry...'
                }
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none resize-y min-h-[75px] leading-relaxed"
                required
              />
            </div>
          </div>

          {/* Section 2: Dynamic Double-Entry Multi-Row Grid with SearchableSelect */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                <span className="font-extrabold text-xs text-slate-800">
                  {isAr ? 'أطراف القيد المحاسبي المزدوج (المدين والدائن)' : 'Journal Entry Debit / Credit Legs'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                  {lines.length} {isAr ? 'أطراف' : 'legs'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {variance > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoBalance}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition cursor-pointer shadow-2xs"
                    title={isAr ? 'تصفير الفرق بالطرف المقابل تلقائياً' : 'Auto-balance difference'}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    <span>{isAr ? `موازنة الفرق (${variance.toLocaleString()} ج.م)` : `Balance (${variance})`}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddLine}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{isAr ? 'إضافة طرف / سطر' : 'Add Line'}</span>
                </button>
              </div>
            </div>

            {/* Rows Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 text-start min-w-[240px]">{isAr ? 'الحساب المحاسبي (بحث)' : 'GL Account'}</th>
                    <th className="py-2.5 px-3 text-start min-w-[170px]">{isAr ? 'الأستاذ المساعد / الجهة' : 'Sub-Ledger'}</th>
                    <th className="py-2.5 px-3 text-start min-w-[160px]">{isAr ? 'مركز التكلفة' : 'Cost Center'}</th>
                    <th className="py-2.5 px-3 text-end min-w-[110px] text-emerald-800">{isAr ? 'مدين (ج.م)' : 'Debit'}</th>
                    <th className="py-2.5 px-3 text-end min-w-[110px] text-indigo-800">{isAr ? 'دائن (ج.م)' : 'Credit'}</th>
                    <th className="py-2.5 px-3 text-start min-w-[180px]">{isAr ? 'ملاحظة السطر' : 'Memo'}</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => {
                    const accObj = accountsList.find((a) => a.code === line.accountCode);
                    const subType = line.subledgerType || accObj?.subType;
                    const subOptions = getSubLedgerOptions(subType);

                    return (
                      <tr key={line.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>

                        {/* SearchableSelect GL Account */}
                        <td className="py-2 px-3">
                          <SearchableSelect
                            options={accountOptions}
                            value={line.accountCode}
                            onChange={(val) => handleLineChange(idx, 'accountCode', val)}
                            placeholder={isAr ? '-- اختر الحساب --' : '-- Select Account --'}
                            isAr={isAr}
                            className="w-full text-xs font-bold"
                          />
                        </td>

                        {/* SearchableSelect Subledger */}
                        <td className="py-2 px-3">
                          {subOptions.length > 0 ? (
                            <SearchableSelect
                              options={subOptions}
                              value={line.subledgerId}
                              onChange={(val) => handleLineChange(idx, 'subledgerId', val)}
                              placeholder={isAr ? '-- اختر الجهة --' : '-- Select Entity --'}
                              isAr={isAr}
                              className="w-full text-xs"
                            />
                          ) : (
                            <input
                              type="text"
                              placeholder={isAr ? 'جهة / أستاذ مساعد' : 'Sub-entity'}
                              value={line.subledgerName}
                              onChange={(e) => handleLineChange(idx, 'subledgerName', e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none"
                            />
                          )}
                        </td>

                        {/* SearchableSelect Cost Center with Inline Creation */}
                        <td className="py-2 px-3">
                          <SearchableSelect
                            options={costCenterOptions}
                            value={line.costCenterId}
                            onChange={(val) => handleLineChange(idx, 'costCenterId', val)}
                            placeholder={isAr ? '-- مركز التكلفة --' : '-- Cost Center --'}
                            isAr={isAr}
                            className="w-full text-xs"
                            onCreateNew={handleCreateCostCenter}
                            createLabel={isAr ? '+ إضافة مركز تكلفة جديد' : '+ Add New Cost Center'}
                          />
                        </td>

                        {/* Debit Input */}
                        <td className="py-2 px-3 text-end">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={line.debit}
                            onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-end font-mono font-black text-emerald-700 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>

                        {/* Credit Input */}
                        <td className="py-2 px-3 text-end">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={line.credit}
                            onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-end font-mono font-black text-indigo-700 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>

                        {/* Line Notes (Wide & Spacious) */}
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder={isAr ? 'ملاحظة تفصيلية للسطر...' : 'Line item memo...'}
                            value={line.notes}
                            onChange={(e) => handleLineChange(idx, 'notes', e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                          />
                        </td>

                        {/* Remove Action */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={lines.length <= 2}
                            className="p-1 text-slate-300 hover:text-rose-600 disabled:opacity-20 transition cursor-pointer"
                            title={isAr ? 'حذف السطر' : 'Remove row'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Table Footer with Live Totals & Balance Lock */}
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-mono font-black">
                  <tr>
                    <td colSpan="4" className="py-3 px-4 text-start font-sans text-slate-800 text-xs font-black">
                      {isAr ? 'إجمالي أطراف القيد المحاسبي:' : 'Total Double-Entry Leg Sums:'}
                    </td>
                    <td className="py-3 px-3 text-end text-emerald-800 font-mono text-sm">
                      {totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      <span className="text-[10px] font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
                    </td>
                    <td className="py-3 px-3 text-end text-indigo-800 font-mono text-sm">
                      {totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      <span className="text-[10px] font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
                    </td>
                    <td colSpan="2" className="py-3 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Strict Zero-Variance Lock Indicator */}
            <div
              className={`p-3.5 border-t flex items-center justify-between flex-wrap gap-3 ${
                isBalanced
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950 animate-pulse'
              }`}
            >
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                )}
                <div>
                  <h4 className="font-extrabold text-xs">
                    {isBalanced
                      ? isAr
                        ? '✓ القيد متزن تماماً (المدين = الدائن) • جاهز للاعتماد والترحيل الدفتري'
                        : '✓ Entry perfectly balanced (Debits == Credits) • Ready to post'
                      : isAr
                      ? `⚠️ القيد غير متزن! يوجد فرق قدره (${variance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م)`
                      : `⚠️ Entry Unbalanced! Difference of (${variance.toLocaleString()} EGP)`}
                  </h4>
                  <p className="text-[10px] opacity-80">
                    {isBalanced
                      ? isAr
                        ? 'تطابق كامل بنسبة 100% وفق المعايير المحاسبية الدولية'
                        : '100% mathematical zero-variance balance enforced'
                      : isAr
                      ? 'لا يمكن ترحيل القيد إلى دفتر اليومية إلا بعد تصفير الفرق بين المدين والدائن'
                      : 'Posting to General Ledger is locked until debits equal credits'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs font-black">
                <span className="text-[11px] opacity-75 font-sans">{isAr ? 'الفرق المتبقي:' : 'Variance:'}</span>
                <span
                  className={`px-2.5 py-1 rounded-xl border ${
                    isBalanced
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-rose-100 text-rose-900 border-rose-300'
                  }`}
                >
                  {variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  {isAr ? 'ج.م' : 'EGP'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Supporting Attachments */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'المستندات والمرفقات المؤيدة للقيد (مذكرات معتمدة، كشوف بنك، إشعارات):' : 'Supporting Documents (Memos, Invoices, Bank Statements):'}</span>
              </label>
              <span className="text-[11px] text-slate-500 font-bold">
                {attachments.length} {isAr ? 'ملفات مرفقة' : 'files attached'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition cursor-pointer text-slate-700 font-bold text-xs bg-white">
                <Upload className="h-4 w-4 text-slate-400" />
                <span>{isUploading ? (isAr ? 'جاري التحميل...' : 'Uploading...') : (isAr ? 'إرفاق ملفات' : 'Attach Files')}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
              <span className="text-[10px] text-slate-400">
                {isAr ? 'يدعم صور المستندات وملفات PDF' : 'Supports image slips and PDF files'}
              </span>
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-slate-700 text-xs shadow-2xs"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="truncate max-w-[160px] font-medium">{file.name || `Attachment-${idx + 1}`}</span>
                    <span className="text-[10px] text-slate-400">({file.size})</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="text-slate-400 hover:text-rose-600 p-0.5 transition cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="submit"
            disabled={!isBalanced || isSubmitting || !descriptionAr.trim()}
            className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white transition cursor-pointer shadow-md flex items-center gap-2"
          >
            <FileCheck className="h-4 w-4 text-emerald-400" />
            <span>
              {isSubmitting
                ? isAr
                  ? 'جاري ترحيل القيد...'
                  : 'Posting Entry...'
                : isAr
                ? 'حفظ وترحيل القيد الدفتري ✓'
                : 'Post Journal Entry ✓'}
            </span>
          </button>
        </div>
      </form>
    </div>
  </div>
);
}
