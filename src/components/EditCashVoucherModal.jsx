import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Edit,
  Save,
  AlertTriangle,
  FileText,
  Receipt,
  Paperclip,
  Trash2,
  Upload,
  Building2,
  ShieldAlert,
  Info
} from 'lucide-react';
import { MAIN_GL_ACCOUNTS, updateCashVoucher, normalizeAccountAttributes, resolveAccountMasterRole } from '../utils/cashLedgerEngine.js';
import SearchableSelect from './SearchableSelect.jsx';
import { fileToDataUrl } from '../firebase.js';

export default function EditCashVoucherModal({
  voucher,
  currentUser,
  accountsMaster = [],
  accountingLinks = null,
  suppliersList = [],
  workersList = [],
  clientsList = [],
  allSafes = [],
  isOpen,
  onClose,
  onSuccess
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const canEdit =
    currentUser?.isGeneralAdmin ||
    currentUser?.role === 'general_admin' ||
    currentUser?.role === 'treasury_manager' ||
    currentUser?.role === 'financial_manager' ||
    currentUser?.permissions?.includes('edit_cash_voucher');

  const [description, setDescription] = useState('');
  const [mainAccount, setMainAccount] = useState('');
  const [subAccountId, setSubAccountId] = useState('');
  const [subAccountName, setSubAccountName] = useState('');
  const [costCenterName, setCostCenterName] = useState('');
  const [taxDocumentType, setTaxDocumentType] = useState('no_document');
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('');
  const [vendorTaxId, setVendorTaxId] = useState('');
  const [vatRate, setVatRate] = useState(14);
  const [withholdingRate, setWithholdingRate] = useState(1);
  const [attachments, setAttachments] = useState([]);
  const [reason, setReason] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initialize fields from voucher
  useEffect(() => {
    if (voucher) {
      setDescription(voucher.description || '');
      setMainAccount(voucher.mainAccount || 'opex');
      setSubAccountId(voucher.subAccountId || '');
      setSubAccountName(voucher.subAccountName || '');
      setCostCenterName(voucher.costCenterName || '');
      setTaxDocumentType(voucher.taxDocumentType || 'no_document');
      setTaxInvoiceNumber(voucher.taxDetails?.invoiceNumber || '');
      setVendorTaxId(voucher.taxDetails?.vendorTaxId || '');
      setVatRate(voucher.taxDetails?.vatRate ?? 14);
      setWithholdingRate(voucher.taxDetails?.withholdingRate ?? 1);
      setAttachments(Array.isArray(voucher.attachments) ? [...voucher.attachments] : []);
      setReason('');
      setErrorMsg('');
    }
  }, [voucher]);

  // Derive account role dynamically
  const accountRole = useMemo(() => {
    if (voucher?.type === 'safe_transfer') return 'safe';
    return resolveAccountMasterRole(mainAccount, accountsMaster, accountingLinks);
  }, [voucher, mainAccount, accountsMaster, accountingLinks]);

  // Parent account codes detection (to separate summary headers from posting accounts)
  const parentCodeSet = useMemo(() => {
    const set = new Set();
    accountsMaster.forEach((acc) => {
      if (acc.parentCode) set.add(String(acc.parentCode).trim());
      if (acc.parentAccountId) set.add(String(acc.parentAccountId).trim());
    });
    return set;
  }, [accountsMaster]);

  // Main GL Account Options (Dynamically built from Chart of Accounts)
  const mainAccountOptions = useMemo(() => {
    if (!accountsMaster || accountsMaster.length === 0) {
      return MAIN_GL_ACCOUNTS.map((acc) => ({
        value: acc.id,
        label: isAr ? acc.nameAr : acc.nameEn,
        sublabel: acc.id,
        group: isAr ? 'الحسابات القياسية' : 'Standard Accounts'
      }));
    }

    const selectable = accountsMaster.filter((acc) => {
      if (acc.isActive === false) return false;
      const code = String(acc.code || acc.id).trim();
      const isParent = parentCodeSet.has(code);
      const role = resolveAccountMasterRole(code, accountsMaster, accountingLinks);
      return !isParent || Boolean(role);
    });

    const sorted = [...selectable].sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));

    const list = sorted.map((acc) => {
      const code = String(acc.code || acc.id).trim();
      const role = resolveAccountMasterRole(code, accountsMaster, accountingLinks);
      let group = isAr ? 'دليل الحسابات' : 'Chart of Accounts';

      if (role === 'supplier') {
        group = isAr ? 'حسابات الموردين (مشتريات)' : 'Suppliers & Purchases';
      } else if (role === 'client') {
        group = isAr ? 'حسابات العملاء (مبيعات)' : 'Clients & Sales';
      } else if (role === 'worker') {
        group = isAr ? 'حسابات الأجور والعاملين' : 'Payroll & Staff';
      } else if (acc.statement === 'income_statement' || ['3', '4', '5'].includes(code.charAt(0))) {
        group = isAr ? 'المصروفات والتكاليف' : 'Expenses & Operations';
      } else if (['1'].includes(code.charAt(0))) {
        group = isAr ? 'الأصول النقدية والمتداولة' : 'Assets & Current Accounts';
      } else if (['2'].includes(code.charAt(0))) {
        group = isAr ? 'الالتزامات والخصوم' : 'Liabilities & Payables';
      }

      return {
        value: code,
        label: `[${code}] ${isAr ? acc.nameAr : (acc.nameEn || acc.nameAr)}`,
        sublabel: code,
        group
      };
    });

    // Ensure currently selected mainAccount from voucher is included even if custom
    if (mainAccount && !list.some((o) => o.value === mainAccount)) {
      list.unshift({
        value: mainAccount,
        label: voucher?.mainAccountAr ? `[${mainAccount}] ${voucher.mainAccountAr}` : mainAccount,
        sublabel: mainAccount,
        group: isAr ? 'الحساب الحالي للسند' : 'Current Voucher Account'
      });
    }

    return list;
  }, [accountsMaster, parentCodeSet, accountingLinks, mainAccount, voucher, isAr]);

  // Sub-Ledger / Beneficiary Options dynamically resolved by accountRole
  const subAccountOptions = useMemo(() => {
    if (accountRole === 'supplier') {
      const fromSuppliers = suppliersList.map((s) => ({
        value: s.id,
        label: s.name || s.taxpayerLegalName || s.id,
        sublabel: s.id,
        badgeText: isAr ? 'مورد معتمد' : 'Vendor',
        isLinked: true
      }));
      const fromCOA = accountsMaster
        .filter((a) => a.subType === 'supplier' && !suppliersList.some((s) => s.id === a.id || s.id === a.code) && String(a.code || a.id) !== String(mainAccount))
        .map((a) => ({
          value: a.code || a.id,
          label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
          sublabel: a.code || a.id,
          badgeText: isAr ? 'دليل الحسابات' : 'COA'
        }));
      return [...fromSuppliers, ...fromCOA];
    }

    if (accountRole === 'worker') {
      const fromWorkers = workersList.map((w) => ({
        value: w.id,
        label: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
        sublabel: w.role || (isAr ? 'موظف' : 'Staff'),
        badgeText: isAr ? 'موظف' : 'Staff'
      }));
      const fromCOA = accountsMaster
        .filter((a) => a.subType === 'worker' && !workersList.some((w) => w.id === a.id || w.id === a.code) && String(a.code || a.id) !== String(mainAccount))
        .map((a) => ({
          value: a.code || a.id,
          label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
          sublabel: a.code || a.id,
          badgeText: isAr ? 'دليل الحسابات' : 'COA'
        }));
      return [...fromWorkers, ...fromCOA];
    }

    if (accountRole === 'client') {
      const fromClients = clientsList.map((c) => ({
        value: c.id,
        label: isAr ? (c.tradeName || c.clientName || c.name || c.id) : (c.clientName || c.tradeName || c.name || c.id),
        sublabel: c.id,
        badgeText: isAr ? 'عميل معتمد' : 'Client',
        isLinked: true
      }));
      const fromCOA = accountsMaster
        .filter((a) => (a.subType === 'client' || a.parentAccountId === 'clients') && !clientsList.some((c) => c.id === a.id || c.id === a.code) && String(a.code || a.id) !== String(mainAccount))
        .map((a) => ({
          value: a.code || a.id,
          label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
          sublabel: a.code || a.id,
          badgeText: isAr ? 'عميل' : 'Client'
        }));
      return [...fromClients, ...fromCOA];
    }

    if (voucher?.type === 'safe_transfer' || accountRole === 'safe') {
      return allSafes
        .filter((s) => s.id !== voucher?.safeId)
        .map((s) => ({
          value: s.id,
          label: isAr ? s.nameAr : (s.nameEn || s.nameAr),
          sublabel: s.id,
          badgeText: isAr ? 'خزينة' : 'Vault'
        }));
    }

    return accountsMaster
      .filter((a) => (a.parentAccountId === mainAccount || a.parentCode === mainAccount) && String(a.code || a.id) !== String(mainAccount))
      .map((a) => ({
        value: a.code || a.id,
        label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
        sublabel: a.code || a.id,
        badgeText: isAr ? 'مركز تكلفة' : 'Cost Center'
      }));
  }, [accountRole, mainAccount, voucher, suppliersList, workersList, clientsList, accountsMaster, allSafes, isAr]);

  if (!isOpen || !voucher) return null;

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
    if (!reason.trim()) {
      setErrorMsg(isAr ? 'يرجى كتابة سبب التعديل لتوثيق الرقابة المالية' : 'Please provide an edit rationale for audit');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const matchedMaster = Array.isArray(accountsMaster)
        ? accountsMaster.find((a) => String(a.code || a.id).trim() === String(mainAccount).trim())
        : null;
      const matchedGl = matchedMaster || MAIN_GL_ACCOUNTS.find((a) => a.id === mainAccount);

      const normalizedAccountInfo = normalizeAccountAttributes({
        code: mainAccount,
        statement: matchedMaster?.statement || matchedGl?.statement,
        reportCategory: matchedMaster?.reportCategory || matchedGl?.reportCategory,
        cashFlowCategory: matchedMaster?.cashFlowCategory || matchedGl?.cashFlowCategory,
        nature: matchedMaster?.nature || matchedGl?.nature
      });

      const taxDetails = taxDocumentType === 'taxable' ? {
        invoiceNumber: taxInvoiceNumber.trim(),
        vendorTaxId: vendorTaxId.trim(),
        vatRate: Number(vatRate) || 0,
        withholdingRate: Number(withholdingRate) || 0
      } : null;

      await updateCashVoucher({
        voucherId: voucher.id,
        updates: {
          description: description.trim(),
          mainAccount,
          mainAccountAr: matchedMaster?.nameAr || matchedGl?.nameAr || mainAccount,
          statement: normalizedAccountInfo.statement,
          reportCategory: normalizedAccountInfo.reportCategory,
          cashFlowCategory: normalizedAccountInfo.cashFlowCategory,
          nature: normalizedAccountInfo.nature,
          subAccountId: subAccountId || null,
          subAccountName: subAccountName.trim(),
          costCenterName: costCenterName.trim(),
          taxDocumentType,
          taxDetails,
          attachments
        },
        reason: reason.trim(),
        currentUser
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'حدث خطأ أثناء تعديل السند' : 'Error updating voucher'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col ${
          isAr ? 'text-right' : 'text-left'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Edit className="h-5 w-5 text-amber-200" />
            </div>
            <div>
              <h3 className="text-base font-extrabold">
                {isAr ? 'تعديل بيانات السند المالي' : 'Edit Cash Voucher Metadata'}
              </h3>
              <p className="text-xs text-amber-100 font-mono">
                {voucher.id} — [{voucher.amount?.toLocaleString()} {voucher.currency || 'EGP'}]
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

        {/* Unauthorized Protection */}
        {!canEdit ? (
          <div className="p-8 text-center space-y-4 overflow-y-auto flex-1">
            <div className="inline-flex p-3 bg-rose-50 text-rose-600 rounded-full border border-rose-200">
              <ShieldAlert className="h-10 w-10" />
            </div>
            <h4 className="text-base font-extrabold text-slate-900">
              {isAr ? 'غير مصرح لك بتعديل بيانات السندات' : 'Access Restricted: Permission Required'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {isAr
                ? 'تعديل السندات المالية بعد ترحيلها يتطلب صلاحيات رقابية خاصة (المدير العام، مدير الخزانة، أو المدير المالي) لضمان النزاهة المحاسبية وتتبع الأثر المالي.'
                : 'Editing posted financial vouchers requires audit privileges (General Admin, Treasury Manager, or Financial Manager) to maintain accounting integrity.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2 font-bold animate-shake">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

            {/* Note about locked monetary values */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-blue-600" />
              <span>
                {isAr
                  ? 'تنبيه رقابي: المبلغ النقدي والخزينة وفئات العملة مقفلة لمنع الإخلال بتوازن الخزينة الفعلي. لتعديل المبلغ يلزم إلغاء السند وعكسه.'
                  : 'Notice: Monetary amounts, vault assignment, and banknotes are locked to safeguard vault integrity. Use reversal to modify values.'}
              </span>
            </div>

            {/* GL Account & Sub-Account (SearchableSelect) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'حساب الأستاذ العام (GL Account):' : 'Main GL Account:'}
                </label>
                <SearchableSelect
                  options={mainAccountOptions}
                  value={mainAccount}
                  onChange={(val) => {
                    setMainAccount(val);
                    setSubAccountId('');
                    setSubAccountName('');
                  }}
                  isAr={isAr}
                  placeholder={isAr ? '-- اختر حساب الأستاذ العام --' : '-- Select GL Account --'}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الحساب المساعد / الطرف المستفيد:' : 'Sub-Account / Payee:'}
                </label>
                <SearchableSelect
                  options={subAccountOptions}
                  value={subAccountId || subAccountName}
                  onChange={(val) => {
                    const opt = subAccountOptions.find((o) => String(o.value) === String(val));
                    setSubAccountId(val);
                    setSubAccountName(opt?.label || val);
                  }}
                  isAr={isAr}
                  placeholder={
                    accountRole === 'supplier'
                      ? (isAr ? '-- اختر المورد المعتمد --' : '-- Select Approved Supplier --')
                      : accountRole === 'worker'
                      ? (isAr ? '-- اختر العامل / الموظف --' : '-- Select Staff Member --')
                      : accountRole === 'client'
                      ? (isAr ? '-- اختر العميل / شركة التوزيع --' : '-- Select Client / Distributor --')
                      : (isAr ? '-- اختر الحساب المساعد / مركز التكلفة --' : '-- Select Sub-Ledger / Cost Center --')
                  }
                  onCreateNew={(customVal) => {
                    setSubAccountId(customVal);
                    setSubAccountName(customVal);
                  }}
                  createLabel={isAr ? '+ استخدام اسم مخصص' : '+ Use custom name'}
                />
              </div>
            </div>

            {/* Cost Center */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isAr ? 'مركز التكلفة / الإدارة:' : 'Cost Center / Department:'}
              </label>
              <input
                type="text"
                value={costCenterName}
                onChange={(e) => setCostCenterName(e.target.value)}
                placeholder={isAr ? 'مثال: خط إنتاج 1، صيانة المعدات، الإدارة المالية' : 'e.g., Line 1, Maintenance, Administration'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Tax Document Type */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
              <label className="block font-bold text-slate-800">
                {isAr ? 'نوع المستند الضريبي:' : 'Tax Document Type:'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'taxable', labelAr: 'ضريبي رسمي', labelEn: 'Tax Invoice' },
                  { id: 'non_taxable', labelAr: 'إيصال عرفي', labelEn: 'Informal' },
                  { id: 'no_document', labelAr: 'بدون مستند', labelEn: 'No Document' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTaxDocumentType(t.id)}
                    className={`p-2 rounded-xl font-bold border transition text-center cursor-pointer ${
                      taxDocumentType === t.id
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? t.labelAr : t.labelEn}
                  </button>
                ))}
              </div>

              {taxDocumentType === 'taxable' && (
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 animate-fadeIn">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">{isAr ? 'رقم الفاتورة الضريبية:' : 'Invoice Number:'}</label>
                    <input
                      type="text"
                      value={taxInvoiceNumber}
                      onChange={(e) => setTaxInvoiceNumber(e.target.value)}
                      placeholder="INV-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">{isAr ? 'رقم التسجيل الضريبي للمورد:' : 'Vendor Tax ID:'}</label>
                    <input
                      type="text"
                      value={vendorTaxId}
                      onChange={(e) => setVendorTaxId(e.target.value)}
                      placeholder="123-456-789"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Description / Memo */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isAr ? 'البيان والشرح التفصيلي:' : 'Description / Memo:'}
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isAr ? 'بيان الحركة والسبب المحاسبي...' : 'Transaction notes and memo...'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Attachments Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                  <span>{isAr ? 'المرفقات الداعمة:' : 'Supporting Attachments:'}</span>
                </label>
                <label className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isAr ? 'إضافة مستند' : 'Add File'}</span>
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
                  {attachments.map((att, idx) => {
                    const attName = typeof att === 'string' ? `مستند ${idx + 1}` : (att.name || `مستند ${idx + 1}`);
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px]"
                      >
                        <span className="truncate max-w-[300px] font-medium text-slate-700">{attName}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mandatory Reason for Edit (Audit Compliance) */}
            <div className="p-3 bg-amber-50/60 border border-amber-300 rounded-2xl space-y-1.5">
              <label className="block font-extrabold text-amber-950 flex items-center gap-1.5">
                <span>{isAr ? 'سبب التعديل (إلزامي للرقابة والمراجعة):' : 'Edit Rationale (Mandatory for Audit):'}</span>
                <span className="text-rose-600 font-bold">*</span>
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isAr ? 'مثال: تصحيح مركز التكلفة بعد مراجعة الإدارة المالية / إضافة الفاتورة الأصلية' : 'e.g., Reclassified cost center per audit'}
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none font-medium"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploading || !reason.trim()}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-extrabold shadow-md hover:shadow-amber-600/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>{isAr ? 'حفظ التعديلات وتوثيق السجل' : 'Save Changes & Log Audit'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  </div>
);
}
