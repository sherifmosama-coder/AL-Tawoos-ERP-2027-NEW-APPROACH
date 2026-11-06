import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Edit,
  Save,
  AlertTriangle,
  FileText,
  Paperclip,
  Trash2,
  Upload,
  User,
  Hash,
  Copy,
  Check,
  ShieldCheck,
  Eye
} from 'lucide-react';
import { updateCustodyOrAdvanceRecord } from '../utils/cashLedgerEngine.js';
import { fileToDataUrl } from '../firebase.js';
import SearchableSelect from './SearchableSelect.jsx';

export default function EditCustodyModal({
  item,
  isOpen,
  onClose,
  currentUser,
  workersList = [],
  onSuccess
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [workerId, setWorkerId] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [signedDocument, setSignedDocument] = useState(null);
  const [reason, setReason] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (item) {
      setWorkerId(item.workerId || '');
      setNotes(item.notes || '');
      setAttachments(Array.isArray(item.attachments) ? [...item.attachments] : []);
      setSignedDocument(item.signedDocument || null);
      setReason('');
      setErrorMsg('');
    }
  }, [item]);

  const workerOptions = useMemo(() => {
    return workersList.map((w) => ({
      value: w.id,
      label: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
      sublabel: w.role || (isAr ? 'عامل' : 'Worker')
    }));
  }, [workersList, isAr]);

  if (!isOpen || !item) return null;

  const handleCopyId = () => {
    if (!item.id) return;
    navigator.clipboard.writeText(item.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

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
      console.error('File upload error:', err);
    } finally {
      if (e.target) e.target.value = '';
      setIsUploading(false);
    }
  };

  const handleSignedDocUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileData = await fileToDataUrl(file);
      if (fileData) {
        setSignedDocument({
          ...fileData,
          isSignedAcknowledgement: true,
          uploadedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Signed doc upload error:', err);
    } finally {
      if (e.target) e.target.value = '';
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال سبب التعديل للرقابة المالية' : 'Please provide reason for edit');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const selectedWorker = workersList.find((w) => w.id === workerId);
      const workerName = isAr
        ? (selectedWorker?.nameAr || selectedWorker?.name || workerId)
        : (selectedWorker?.name || selectedWorker?.nameAr || workerId);

      // Merge signedDocument into attachments if present
      let finalAttachments = [...attachments];
      if (signedDocument && !finalAttachments.some((a) => a.url === signedDocument.url || a.dataUrl === signedDocument.dataUrl)) {
        finalAttachments.push(signedDocument);
      }

      await updateCustodyOrAdvanceRecord({
        recordId: item.id,
        workerId: item.workerId,
        newWorkerId: workerId !== item.workerId ? workerId : null,
        newWorkerName: workerId !== item.workerId ? workerName : null,
        notes,
        attachments: finalAttachments,
        signedDocument,
        reason,
        currentUser
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'فشل حفظ التعديلات' : 'Failed to save changes'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCustody = item.type === 'custody_issue';
  const remaining = Number(item.remainingAmount) || Number(item.originalAmount) || 0;
  const original = Number(item.originalAmount) || 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto ${
          isAr ? 'text-right' : 'text-left'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/15">
              <Edit className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold">
                  {isAr
                    ? (isCustody ? 'تعديل بيانات العهدة النقدية' : 'تعديل بيانات السلفة الشخصية')
                    : (isCustody ? 'Edit Cash Custody Record' : 'Edit Salary Advance Record')}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {isCustody ? (isAr ? 'عهدة تشغيل' : 'Custody') : (isAr ? 'سلفة على الراتب' : 'Advance')}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {isAr
                  ? 'تعديل البيان والموظف المسؤول والمستندات الداعمة مع التوثيق الرقابي'
                  : 'Update statement notes, beneficiary worker, and supporting files with audit trail'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 cursor-pointer transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SSOT Identifier & Status Banner */}
          <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 font-mono">
                <Hash className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
                  {isAr ? 'كود السند الموحد (SSOT ID)' : 'Single Source of Truth ID'}
                </span>
                <span className="text-xs font-mono font-black text-amber-300">{item.id}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyId}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                title={isAr ? 'نسخ الكود' : 'Copy ID'}
              >
                {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{isAr ? 'نسخ' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Amount Overview Card (Fixed/Audited) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 block">{isAr ? 'القيمة الأصلية للصرف:' : 'Original Disbursed:'}</span>
              <span className="font-mono font-bold text-slate-800 text-sm">{original.toLocaleString()} ج.م</span>
            </div>
            <div className="text-end">
              <span className="text-[11px] text-slate-500 block">{isAr ? 'الرصيد المعلق المتبقي:' : 'Remaining Balance:'}</span>
              <span className="font-mono font-black text-amber-700 text-sm">{remaining.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* Beneficiary Worker Selector */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isAr ? 'الموظف / صاحب العهدة *:' : 'Beneficiary Worker *:'}
            </label>
            <SearchableSelect
              options={workerOptions}
              value={workerId}
              onChange={(val) => setWorkerId(val)}
              placeholder={isAr ? '-- اختر الموظف --' : '-- Select Worker --'}
              isAr={isAr}
              className="w-full font-bold"
            />
            {workerId !== item.workerId && (
              <p className="text-[10px] text-amber-700 font-bold mt-1">
                ⚠️ {isAr ? 'سيتم نقل رصيد هذه العهدة إلى الموظف الجديد في كشف الحساب.' : 'Custody ledger balance will be reassigned to the selected worker.'}
              </p>
            )}
          </div>

          {/* Description & Purpose Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isAr ? 'البيان والغرض من الصرف:' : 'Statement Purpose & Notes:'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAr ? 'شرح تفاصيل العهدة أو السلفة' : 'Purpose / Notes'}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          {/* Signed Document Section */}
          <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-700" />
                <span>{isAr ? 'إقرار الاستلام والتعهد الموقع من المستفيد:' : 'Signed Beneficiary Acknowledgment:'}</span>
              </span>
              <label className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold cursor-pointer transition flex items-center gap-1">
                <Upload className="h-3 w-3" />
                <span>{signedDocument ? (isAr ? 'استبدال الإقرار' : 'Replace Signed Doc') : (isAr ? 'رفع الإقرار الموقع' : 'Upload Signed Doc')}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleSignedDocUpload}
                  className="hidden"
                />
              </label>
            </div>
            {signedDocument ? (
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-indigo-200 text-[11px]">
                <div className="flex items-center gap-1.5 truncate max-w-[280px]">
                  <FileText className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span className="font-bold text-slate-800 truncate">
                    {signedDocument.name || (isAr ? 'إقرار استلام موقع' : 'Signed Document')}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {isAr ? 'مرفق وموثق ✓' : 'Attached ✓'}
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                {isAr ? 'لم يتم إرفاق إقرار توقيع بعد. يمكنك رفعه الآن لتوثيق السند.' : 'No signed document attached yet.'}
              </p>
            )}
          </div>

          {/* General Supporting Attachments */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-bold text-slate-700">
                {isAr ? 'المستندات المؤيدة الإضافية:' : 'Additional Supporting Attachments:'}
              </label>
              <label className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1">
                <Upload className="h-3 w-3" />
                <span>{isAr ? 'إرفاق ملفات' : 'Add Files'}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] text-slate-700 border border-slate-200">
                    <Paperclip className="h-3 w-3 text-slate-500 shrink-0" />
                    <span className="truncate max-w-[150px] font-medium">{a.name || `مستند ${i + 1}`}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer transition"
                      title={isAr ? 'حذف الملف' : 'Remove'}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">{isAr ? 'لا توجد مرفقات إضافية' : 'No additional attachments'}</p>
            )}
          </div>

          {/* Reason for Modification (Mandatory for Audit Trail) */}
          <div className="pt-2 border-t border-slate-200">
            <label className="block font-bold text-slate-800 mb-1">
              {isAr ? 'سبب التعديل (إلزامي للرقابة والتدقيق الداخلي) *:' : 'Reason for Modification (Mandatory for Audit Trail) *:'}
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAr ? 'مثال: تصحيح كود الموظف المستفيد / استيفاء إقرار الاستلام الموقع' : 'e.g. Corrected beneficiary worker code / added signed acknowledgment'}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:outline-none text-xs"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={isSubmitting || !reason.trim()}
            onClick={handleSubmit}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 font-bold rounded-xl text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="h-4 w-4" />
            <span>{isSubmitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ التعديلات' : 'Save Changes')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
