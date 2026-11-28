import React, { useState, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  X,
  Printer,
  Download,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Languages,
  EyeOff,
  Paperclip,
  Split,
  ShieldAlert,
  RefreshCw,
  FileCheck2,
} from 'lucide-react';
import { functions, openBase64Document } from '../../firebase';
import { useCompanyProfile } from '../../hooks/useCompanyProfile';
import {
  DOC_TYPES,
  buildInvoiceDocumentModel,
  isValidSplitLoadShare,
} from '../../utils/salesInvoicingEngine';
import {
  renderInvoiceDocumentHtml,
  openInvoicePrintWindow,
} from '../../utils/invoicePrintBuilder';

/**
 * Stacked A4 Invoice & Delivery Note Preview / Commit Modal.
 * Enforces:
 *  - Save-First workflow: Print & Save-as-PDF unlock strictly after server-side commit.
 *  - Cash Sales (`بيع نقدي`) guard when client Tax Card is blank on Tawoos/PL Tax Invoices.
 *  - Live Bilingual AR / EN switching & Delivery Note `Hide Bonus` toggle.
 *  - Non-printed internal notes & order PO/buyer attachment quick-strip.
 */
export default function InvoicePreviewModal({
  isOpen,
  onClose,
  order = null,
  docType = DOC_TYPES.TAWOOS,
  serialNo = '',
  invoiceDate = '',
  isSplitLoad = false,
  isRevisionMode = false,
  existingCommittedDoc = null,
  client = null,
  productsMap = {},
  allActiveDocs = [],
  currentUser = {},
  isAr = true,
  onCommitted = null,
  zIndexClass = 'z-[75]',
}) {
  const { companyProfile } = useCompanyProfile();

  const [previewLang, setPreviewLang] = useState(isAr ? 'ar' : 'en');
  const [hideBonus, setHideBonus] = useState(false);
  const [cashSales, setCashSales] = useState(false);
  const [splitLoadFlag, setSplitLoadFlag] = useState(Boolean(isSplitLoad));
  const [revisionReason, setRevisionReason] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [commitError, setCommitError] = useState('');
  const [justCommittedDoc, setJustCommittedDoc] = useState(null);

  const effectiveCommittedDoc = justCommittedDoc || (!isRevisionMode ? existingCommittedDoc : null);
  const isCommittedAndLocked = Boolean(effectiveCommittedDoc && !isRevisionMode);

  // Sync state when opened for a new order/docType
  useEffect(() => {
    if (!isOpen) return;
    setJustCommittedDoc(null);
    setCommitError('');
    setIsSaving(false);

    if (existingCommittedDoc && !isRevisionMode) {
      setPreviewLang(existingCommittedDoc.lang || (isAr ? 'ar' : 'en'));
      setHideBonus(Boolean(existingCommittedDoc.hideBonus));
      setCashSales(Boolean(existingCommittedDoc.cashSales));
      setSplitLoadFlag(Boolean(existingCommittedDoc.isSplitLoad));
      setCustomNotes(existingCommittedDoc.modelSnapshot?.notes || order?.externalComments || '');
      setRevisionReason(existingCommittedDoc.revisionReason || '');
    } else {
      setPreviewLang(isAr ? 'ar' : 'en');
      setHideBonus(Boolean(existingCommittedDoc?.hideBonus));
      setCashSales(Boolean(existingCommittedDoc?.cashSales));
      setSplitLoadFlag(Boolean(isSplitLoad || existingCommittedDoc?.isSplitLoad));
      setCustomNotes(order?.externalComments || '');
      setRevisionReason(
        isRevisionMode
          ? isAr
            ? 'تحديث الفاتورة بعد تعديل بيانات أو كميات الطلب'
            : 'Revised invoice after post-dispatch order update'
          : ''
      );
    }
  }, [isOpen, order?.id, docType, serialNo, isRevisionMode, existingCommittedDoc?.id]);

  // Escape key closes modal cleanly
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, onClose]);

  const effectiveSerial = effectiveCommittedDoc?.serialNo || serialNo;
  const effectiveDate = effectiveCommittedDoc?.invoiceDate || invoiceDate || order?.invoiceDate || order?.loadingDate || '';

  const serialValidation = useMemo(() => {
    if (isCommittedAndLocked) {
      return {
        allowed: true,
        isRevision: false,
        nextVersion: Number(effectiveCommittedDoc?.version || 1),
        isSplitLoadShare: Boolean(effectiveCommittedDoc?.isSplitLoad),
      };
    }
    return isValidSplitLoadShare(
      {
        docType,
        serialNo: effectiveSerial,
        orderId: order?.id || '',
        clientId: order?.clientId || '',
        invoiceDate: effectiveDate,
        isSplitLoad: splitLoadFlag,
      },
      allActiveDocs
    );
  }, [
    isCommittedAndLocked,
    effectiveCommittedDoc,
    docType,
    effectiveSerial,
    order?.id,
    order?.clientId,
    effectiveDate,
    splitLoadFlag,
    allActiveDocs,
  ]);

  const liveModel = useMemo(() => {
    if (!order) return null;
    // Viewing frozen snapshot (with optional live language/hideBonus display re-render)
    if (isCommittedAndLocked && effectiveCommittedDoc?.modelSnapshot) {
      return {
        ...effectiveCommittedDoc.modelSnapshot,
        status: effectiveCommittedDoc.status,
        lang: previewLang,
        hideBonus: docType === DOC_TYPES.DELIVERY_NOTE ? hideBonus : false,
      };
    }

    return buildInvoiceDocumentModel({
      order,
      docType,
      serialNo: effectiveSerial,
      invoiceDate: effectiveDate,
      client,
      productsMap,
      companyProfile,
      options: {
        lang: previewLang,
        hideBonus: docType === DOC_TYPES.DELIVERY_NOTE ? hideBonus : false,
        cashSales,
        isSplitLoad: splitLoadFlag,
        version: serialValidation.nextVersion || (existingCommittedDoc ? Number(existingCommittedDoc.version || 1) + 1 : 1),
        revisionReason,
        notes: customNotes,
      },
    });
  }, [
    order,
    isCommittedAndLocked,
    effectiveCommittedDoc,
    docType,
    effectiveSerial,
    effectiveDate,
    client,
    productsMap,
    companyProfile,
    previewLang,
    hideBonus,
    cashSales,
    splitLoadFlag,
    serialValidation.nextVersion,
    existingCommittedDoc,
    revisionReason,
    customNotes,
  ]);

  const previewHtml = useMemo(() => {
    if (!liveModel) return '';
    return renderInvoiceDocumentHtml(liveModel, companyProfile, {
      lang: previewLang,
      hideBonus,
      isVoided: String(effectiveCommittedDoc?.status || '').toLowerCase() === 'voided',
    });
  }, [liveModel, companyProfile, previewLang, hideBonus, effectiveCommittedDoc?.status]);

  if (!isOpen || !order || !liveModel) return null;

  const isDN = docType === DOC_TYPES.DELIVERY_NOTE;
  const isPL = docType === DOC_TYPES.PL;
  const needsCashGuard = Boolean(liveModel.requiresCashSalesGuard);
  const cashGuardBlocking = !isCommittedAndLocked && needsCashGuard && !cashSales;
  const canCommit =
    !isCommittedAndLocked &&
    !isSaving &&
    serialValidation.allowed &&
    !cashGuardBlocking;

  const attachments = [
    ...(Array.isArray(order.poAttachments) ? order.poAttachments : []),
    ...(Array.isArray(order.retailBuyerAttachments) ? order.retailBuyerAttachments : []),
  ];

  const handleCommitInvoice = async () => {
    if (!canCommit) return;
    setCommitError('');
    setIsSaving(true);
    try {
      const commitFn = httpsCallable(functions, 'salesCommitInvoiceDocument');
      const res = await commitFn({
        orderId: order.id,
        docType,
        serialNo: effectiveSerial,
        invoiceDate: effectiveDate,
        isSplitLoad: splitLoadFlag,
        cashSales,
        hideBonus: isDN ? hideBonus : false,
        lang: previewLang,
        revisionReason,
        sourceOrderFingerprint: liveModel.sourceOrderFingerprint,
        modelSnapshot: liveModel,
        currentUser: {
          id: currentUser?.id || currentUser?.uid || '',
          name: currentUser?.nameAr || currentUser?.name || '',
        },
      });
      const payload = res?.data || {};
      const committed = {
        id: payload.docId,
        docId: payload.docId,
        orderId: order.id,
        docType,
        serialNo: payload.serialNo || effectiveSerial,
        version: payload.version || liveModel.version,
        invoiceDate: effectiveDate,
        isSplitLoad: splitLoadFlag,
        cashSales,
        hideBonus: isDN ? hideBonus : false,
        lang: previewLang,
        status: 'issued',
        modelSnapshot: {
          ...liveModel,
          version: payload.version || liveModel.version,
          serialNo: payload.serialNo || effectiveSerial,
        },
      };
      setJustCommittedDoc(committed);
      if (typeof onCommitted === 'function') {
        onCommitted(committed);
      }
    } catch (err) {
      console.error('Failed to commit invoice:', err);
      setCommitError(
        err?.message ||
          (isAr ? 'تعذر حفظ واعتماد المستند على الخادم.' : 'Failed to commit invoice document.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const docTypeLabel = isDN
    ? isAr
      ? 'إذن تسليم'
      : 'Delivery Note'
    : isPL
      ? isAr
        ? 'فاتورة ضريبية (علامة خاصة)'
        : 'Tax Invoice (Private Label)'
      : isAr
        ? 'فاتورة ضريبية (طاووس)'
        : 'Tax Invoice (Tawoos)';

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4`}
      onClick={() => !isSaving && onClose?.()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
        dir={isAr ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black border ${
                isDN
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : isPL
                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                    : 'bg-blue-100 text-blue-900 border-blue-300'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>{docTypeLabel}</span>
            </span>
            <span className="font-mono font-black text-base text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-300">
              #{effectiveSerial || '—'}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-800">
              v{liveModel.version}
            </span>
            {isCommittedAndLocked ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Lock className="w-3 h-3" />
                <span>{isAr ? 'معتمد ومحفوظ' : 'Committed & Locked'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                <span>
                  {isRevisionMode
                    ? isAr
                      ? `مراجعة جديدة (v${liveModel.version})`
                      : `New Revision (v${liveModel.version})`
                    : isAr
                      ? 'مسودة — احفظ أولاً للطباعة'
                      : 'Draft — Commit First to Print'}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <button
              type="button"
              onClick={() => setPreviewLang((p) => (p === 'ar' ? 'en' : 'ar'))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
              title={isAr ? 'تبديل لغة المستند المطبوع' : 'Toggle print document language'}
            >
              <Languages className="w-3.5 h-3.5 text-indigo-600" />
              <span>{previewLang === 'ar' ? 'العربية (RTL)' : 'English (LTR)'}</span>
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Interactive Controls, Cash Sales Guard, Split-Load & Internal Reference Strip */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-200 space-y-2 shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Hide Bonus Toggle (Delivery Note Only) */}
            {isDN && (
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideBonus}
                  onChange={(e) => setHideBonus(e.target.checked)}
                  className="accent-amber-600"
                />
                <EyeOff className="w-3.5 h-3.5" />
                <span>{isAr ? 'إخفاء البونص في الإذن' : 'Hide Bonus on DN'}</span>
              </label>
            )}

            {/* Split-Load Share Toggle (only editable before commit) */}
            {!isCommittedAndLocked && (
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitLoadFlag}
                  onChange={(e) => setSplitLoadFlag(e.target.checked)}
                  className="accent-sky-600"
                />
                <Split className="w-3.5 h-3.5" />
                <span>{isAr ? 'مشاركة مسلسل (تحميل مجزأ)' : 'Split-Load Serial Share'}</span>
              </label>
            )}

            {/* Print Note / Comment */}
            {!isCommittedAndLocked && (
              <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                <span className="text-slate-500 font-bold shrink-0">
                  {isAr ? 'ملاحظات المطبوع:' : 'Doc Note:'}
                </span>
                <input
                  type="text"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder={isAr ? 'ملاحظة اختيارية تظهر أسفل الفاتورة...' : 'Optional footer note...'}
                  className="w-full px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-800"
                />
              </div>
            )}

            {isRevisionMode && !isCommittedAndLocked && (
              <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                <span className="text-amber-700 font-bold shrink-0">
                  {isAr ? 'سبب المراجعة:' : 'Revision Reason:'}
                </span>
                <input
                  type="text"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  className="w-full px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50/50 text-xs font-medium text-slate-800"
                />
              </div>
            )}
          </div>

          {/* Cash Sales Guard Banner */}
          {needsCashGuard && !isCommittedAndLocked && (
            <div
              className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                cashSales
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? 'البطاقة الضريبية للعميل غير مسجلة: يلزم تفعيل خيار "بيع نقدي" لحجب بيانات المشتري وحفظ الفاتورة الضريبية.'
                    : 'Buyer Tax Card is blank: confirm "Cash Sales" to mask buyer details before saving this Tax Invoice.'}
                </span>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-current font-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={cashSales}
                  onChange={(e) => setCashSales(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span>{isAr ? 'تأكيد بيع نقدي (Cash Sales)' : 'Confirm Cash Sales'}</span>
              </label>
            </div>
          )}

          {/* Serial Validation Error Banner */}
          {!serialValidation.allowed && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{isAr ? serialValidation.reasonAr : serialValidation.reason}</span>
            </div>
          )}

          {/* Server Commit Error */}
          {commitError && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{commitError}</span>
            </div>
          )}

          {/* Non-printed Internal Notes & Attachments Strip */}
          {(order.internalComments || order.retailSettlementNotes || attachments.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
              {order.internalComments && (
                <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5 rounded font-semibold">
                  <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>{order.internalComments}</span>
                </span>
              )}
              {order.retailSettlementNotes && (
                <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-900 px-2 py-0.5 rounded font-semibold">
                  <span>{isAr ? 'ملاحظة تسوية:' : 'Settlement:'} {order.retailSettlementNotes}</span>
                </span>
              )}
              {attachments.map((att, idx) => (
                <button
                  key={att.id || idx}
                  type="button"
                  onClick={() => att.url && openBase64Document(att.url, att.name || 'attachment')}
                  className="inline-flex items-center gap-1 bg-white hover:bg-indigo-50 border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-700 hover:text-indigo-700 cursor-pointer"
                  title={att.poLabel || att.name}
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate max-w-[140px]">{att.poLabel || att.name || `#${idx + 1}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live A4 Preview Iframe */}
        <div className="flex-1 bg-slate-200/70 p-2 sm:p-4 overflow-hidden">
          <iframe
            title="invoice-a4-preview"
            srcDoc={previewHtml}
            className="w-full h-full rounded-xl border border-slate-300 bg-white shadow-inner"
          />
        </div>

        {/* Modal Footer (Save-First -> Unlock Print / Save PDF) */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
            {isCommittedAndLocked ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isAr
                    ? `تم اعتماد المستند #${effectiveSerial} (v${liveModel.version}) — الطباعة وحفظ PDF متاحان الآن.`
                    : `Document #${effectiveSerial} (v${liveModel.version}) committed — Print & Save as PDF unlocked.`}
                </span>
              </span>
            ) : (
              <span>
                {isAr
                  ? 'سيتم تجميد نسخة المستند داخل النظام وربطها بأمر البيع فور الاعتماد.'
                  : 'Document snapshot will be frozen in Firestore and linked to the sales order upon commit.'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>

            {!isCommittedAndLocked && (
              <button
                type="button"
                disabled={!canCommit}
                onClick={handleCommitInvoice}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  canCommit
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {isRevisionMode
                    ? isAr
                      ? `اعتماد وحفظ المراجعة (v${liveModel.version})`
                      : `Commit Revision (v${liveModel.version})`
                    : isAr
                      ? 'اعتماد وحفظ المستند'
                      : 'Commit & Lock Invoice'}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={!isCommittedAndLocked}
              onClick={() => openInvoicePrintWindow(previewHtml)}
              title={
                isCommittedAndLocked
                  ? isAr
                    ? 'طباعة المستند'
                    : 'Print Document'
                  : isAr
                    ? 'قم باعتماد المستند أولاً لفتح الطباعة'
                    : 'Commit invoice first to unlock printing'
              }
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition ${
                isCommittedAndLocked
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>

            <button
              type="button"
              disabled={!isCommittedAndLocked}
              onClick={() => openInvoicePrintWindow(previewHtml)}
              title={
                isCommittedAndLocked
                  ? isAr
                    ? 'حفظ كملف PDF'
                    : 'Save as PDF'
                  : isAr
                    ? 'قم باعتماد المستند أولاً لفتح الحفظ كـ PDF'
                    : 'Commit invoice first to unlock Save as PDF'
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition ${
                isCommittedAndLocked
                  ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'PDF' : 'Save PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
