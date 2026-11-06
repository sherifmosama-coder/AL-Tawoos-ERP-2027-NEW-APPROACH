import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, CheckCircle2, ShieldCheck, QrCode, BookOpen, FileCheck } from 'lucide-react';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import { tafqeetArabic } from '../utils/tafqeet.js';
import VatNumberDisplay from './VatNumberDisplay.jsx';

/**
 * JournalVoucherPrintSlip
 * Official General Accounting Journal Voucher (سند قيد يومية محاسبي معتمد)
 * Renders strict 1-page A4 double-entry ledger document for internal & external audit.
 */
export default function JournalVoucherPrintSlip({
  entry,
  onClose,
  printLang = 'ar'
}) {
  const { i18n } = useTranslation();
  const isAr = printLang === 'ar' || i18n.language === 'ar';
  const { companyProfile } = useCompanyProfile();

  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (entry?.id) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://al-tawoos-erp.web.app';
      const link = `${currentOrigin}/?tab=chart_of_accounts&subTab=journal&entryId=${encodeURIComponent(entry.id)}`;
      generateQRCodeDataURL(link, { width: 140, margin: 1, errorCorrectionLevel: 'M' }).then(setQrDataUrl);
    }
  }, [entry]);

  if (!entry) return null;

  const totalDebit = Number(entry.totalDebit) || 0;
  const totalCredit = Number(entry.totalCredit) || 0;
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const tafqeetText = tafqeetArabic(totalDebit, 'EGP');
  const isReversed = entry.status === 'reversed';

  const handlePrint = () => {
    window.print();
  };

  const companyName = isAr
    ? (companyProfile.tradeNameAr || companyProfile.legalName)
    : (companyProfile.tradeNameEn || companyProfile.legalName);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div id="isolated-financial-print-portal">
      {/* Scoped CSS for strict 1-page A4 print */}
      <style dangerouslySetInnerHTML={{__html: `
        @media screen {
          #isolated-financial-print-portal {
            position: fixed;
            inset: 0;
            z-index: 99999;
          }
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #root,
          body > *:not(#isolated-financial-print-portal) {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          #isolated-financial-print-portal {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .journal-print-modal-overlay {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: transparent !important;
          }
          #printable-journal-slip {
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 195mm !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            display: block !important;
          }
          .screen-only-toolbar {
            display: none !important;
          }
        }
      `}} />

      {/* Screen Overlay Modal Wrapper */}
      <div className="journal-print-modal-overlay fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-[99999] flex flex-col items-center justify-start overflow-y-auto p-4 md:p-6 print:p-0">
        
        {/* Screen Toolbar */}
        <div className="screen-only-toolbar w-full max-w-4xl bg-slate-800 text-white rounded-2xl p-4 mb-4 flex items-center justify-between shadow-2xl border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm md:text-base text-white">
                {isAr ? 'معاينة سند قيد اليومية المحاسبي المعتمد' : 'Accounting Journal Voucher Preview'}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {entry.entryNumber || entry.id} - {entry.docLabelAr || entry.sourceDocType}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg hover:shadow-purple-500/25 transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>{isAr ? 'طباعة سند القيد (A4)' : 'Print Voucher (A4)'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition cursor-pointer"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Document (A4 Styled on Screen & Print) */}
        <div
          id="printable-journal-slip"
          dir={isAr ? 'rtl' : 'ltr'}
          className="w-full max-w-4xl bg-white p-6 md:p-8 rounded-2xl shadow-2xl print:shadow-none print:p-0 text-slate-800"
        >
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3.5 mb-3.5">
            <div className="flex items-center gap-3.5">
              <img
                src="/logo.svg"
                alt="Al Tawoos Logo"
                className="h-14 w-auto max-w-[170px] object-contain"
              />
              <div>
                <h1 className="text-sm md:text-base font-extrabold text-slate-900 leading-tight">
                  {companyName}
                </h1>
                <h2 className="text-xs text-slate-700 font-bold mt-0.5">
                  {isAr ? 'سند قيد يومية محاسبي معتمد (Journal Entry Voucher)' : 'Official Journal Entry Voucher'}
                </h2>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                  <span>{companyProfile.registeredAddress || 'المنطقة الصناعية، السادس من أكتوبر، الجيزة، مصر'}</span>
                  {companyProfile.taxCardNumber && (
                    <>
                      <span>•</span>
                      <span>{isAr ? 'ب.ض:' : 'Tax ID:'} <VatNumberDisplay vatNumber={companyProfile.taxCardNumber} /></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="text-end">
              <span className="text-sm md:text-base font-mono font-extrabold text-slate-900 block">
                {entry.entryNumber || entry.id}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${
                isReversed ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isReversed ? (isAr ? 'قيد ملغي / معكوس' : 'Reversed') : (isAr ? 'قيد معتمد ومرحل' : 'Posted')}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {isAr ? 'تاريخ القيد:' : 'Posting Date:'} {entry.entryDate || entry.createdAt?.slice(0, 10)}
              </span>
            </div>
          </div>

          {/* Metadata Card */}
          <div className="grid grid-cols-3 gap-3 p-3 mb-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">{isAr ? 'نوع الحركة والمستند:' : 'Doc Type:'}</span>
              <span className="font-bold text-slate-900 block">{entry.docLabelAr || entry.sourceDocType}</span>
              {entry.referenceNumber && (
                <span className="text-slate-600 block mt-0.5 font-mono text-[11px]">
                  {isAr ? 'المرجع:' : 'Ref:'} {entry.referenceNumber}
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">{isAr ? 'الطرف المقابل / التحليلي:' : 'Counterparty:'}</span>
              <span className="font-bold text-slate-900 block truncate">
                {entry.supplierName || entry.subAccountName || entry.safeId || '—'}
              </span>
              <span className="text-slate-500 block text-[10px]">
                {entry.streamType === 'cash' ? (isAr ? 'حركة نقدية / خزينة' : 'Cash Stream') : (isAr ? 'استحقاق / عمليات' : 'Accrual Stream')}
              </span>
            </div>
            <div className="text-end">
              <span className="text-slate-400 block mb-0.5">{isAr ? 'المعاملة الضريبية:' : 'Tax Status:'}</span>
              {entry.isTaxOfficial ? (
                <span className="font-bold text-blue-700 block text-[11px]">
                  {isAr ? 'خاضع للضريبة (رسمي)' : 'Taxable Official'}
                  {entry.taxInvoiceNumber && <span className="font-mono block text-slate-600 font-normal">فاتورة #{entry.taxInvoiceNumber}</span>}
                </span>
              ) : (
                <span className="text-slate-500 italic block text-[11px]">
                  {isAr ? 'غير ضريبي / داخلي' : 'Non-Taxable'}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {(entry.descriptionAr || entry.description) && (
            <div className="p-2 mb-3 rounded-lg border border-slate-200 bg-slate-50/30 text-xs">
              <span className="font-bold text-slate-700 block mb-0.5">{isAr ? 'البيان والملاحظات:' : 'Description:'}</span>
              <span className="text-slate-700">{entry.descriptionAr || entry.description}</span>
            </div>
          )}

          {/* Journal Legs Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden mb-3.5">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2 text-start border-e border-slate-200 w-8">{isAr ? 'م' : 'No.'}</th>
                  <th className="p-2 text-start border-e border-slate-200 w-24">{isAr ? 'كود الحساب' : 'Code'}</th>
                  <th className="p-2 text-start border-e border-slate-200">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                  <th className="p-2 text-start border-e border-slate-200">{isAr ? 'الحساب المساعد / التحليلي' : 'Subledger'}</th>
                  <th className="p-2 text-end border-e border-slate-200 w-28">{isAr ? 'مدين (ج.م)' : 'Debit (EGP)'}</th>
                  <th className="p-2 text-end border-e border-slate-200 w-28">{isAr ? 'دائن (ج.م)' : 'Credit (EGP)'}</th>
                  <th className="p-2 text-start">{isAr ? 'البيان التفصيلي' : 'Memo'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(entry.lines || []).map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-2 font-mono border-e border-slate-100 text-slate-500 text-center">{idx + 1}</td>
                    <td className="p-2 font-mono font-bold text-slate-800 border-e border-slate-100 whitespace-nowrap">
                      <div>{line.accountCode}</div>
                      {line.subAccountCode && line.subAccountCode !== line.accountCode && (
                        <div className="text-[10px] text-indigo-700 font-mono">↳ {line.subAccountCode}</div>
                      )}
                    </td>
                    <td className="p-2 border-e border-slate-100 font-bold text-slate-900">
                      <div>{line.accountNameAr || line.accountName}</div>
                      {line.subAccountName && line.subAccountName !== (line.accountNameAr || line.accountName) && (
                        <div className="text-[11px] text-indigo-800 font-normal">↳ {line.subAccountName}</div>
                      )}
                    </td>
                    <td className="p-2 border-e border-slate-100 text-slate-700 font-medium text-[11px]">
                      {line.subledgerName || line.subAccountName || line.subledgerId || '—'}
                    </td>
                    <td className="p-2 text-end font-mono font-bold text-slate-900 border-e border-slate-100 whitespace-nowrap">
                      {line.debit > 0 ? Number(line.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="p-2 text-end font-mono font-bold text-slate-900 border-e border-slate-100 whitespace-nowrap">
                      {line.credit > 0 ? Number(line.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="p-2 text-slate-500 text-[11px] truncate max-w-[150px]">{line.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-xs">
                <tr>
                  <td colSpan={4} className="p-2.5 text-start text-slate-800">
                    <div className="flex items-center gap-2">
                      <span>{isAr ? 'الإجمالي العام للقيد:' : 'Total:'}</span>
                      {isBalanced ? (
                        <span className="text-emerald-700 text-[11px] flex items-center gap-1 font-bold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{isAr ? 'القيد متزن محاسبياً 100%' : 'Balanced'}</span>
                        </span>
                      ) : (
                        <span className="text-rose-700 text-[11px] font-bold">
                          {isAr ? 'تنبيه: القيد غير متزن' : 'Imbalanced'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-end font-mono font-black text-slate-900 border-e border-slate-200">
                    {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 text-end font-mono font-black text-slate-900 border-e border-slate-200">
                    {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 text-slate-400 font-mono text-[10px]">EGP</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tafqeet & Verification Footer Box */}
          <div className="flex justify-between items-start gap-4 mb-4">
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/40">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Voucher QR Verification" className="w-16 h-16 rounded border border-slate-200" />
              ) : (
                <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center">
                  <QrCode className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <div className="text-[10px] text-slate-500 space-y-0.5">
                <span className="font-bold text-slate-800 block text-[11px]">
                  {isAr ? 'توثيق قيود دفتر اليومية' : 'Audit Verification'}
                </span>
                <span>{isAr ? 'كود التحقق الرقمي يطابق السجلات بدقة' : 'Verified Digital Audit Record'}</span>
                <span className="font-mono block text-slate-400">{entry.id}</span>
              </div>
            </div>

            <div className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs">
              <span className="font-bold text-slate-700 block mb-0.5 text-[11px]">
                {isAr ? 'المبلغ بالحروف والتفقيط:' : 'Amount in Words:'}
              </span>
              <p className="font-bold text-purple-950 font-serif leading-relaxed text-xs">
                {tafqeetText}
              </p>
            </div>
          </div>

          {/* Signatures & Approvals Footer */}
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-200 text-xs text-center">
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'المحاسب / محرر القيد' : 'Prepared By Accountant'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">........................</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'المراجع المالي الداخلي' : 'Internal Auditor'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">........................</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'اعتماد المدير المالي' : 'Chief Financial Officer'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">........................</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
