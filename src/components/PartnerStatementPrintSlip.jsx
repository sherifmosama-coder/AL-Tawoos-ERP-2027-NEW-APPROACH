import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, FileText, ShieldCheck, Scale, CheckCircle2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import { tafqeetArabic } from '../utils/tafqeet.js';
import VatNumberDisplay from './VatNumberDisplay.jsx';

export default function PartnerStatementPrintSlip({
  partyType = 'supplier', // 'supplier' | 'client'
  party = null,
  fromDate = '',
  toDate = '',
  openingBalance = 0,
  transactions = [],
  closingBalance = 0,
  totalDebit = 0,
  totalCredit = 0,
  showReversed = false,
  currentUser = null,
  onClose
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { companyProfile } = useCompanyProfile();
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://al-tawoos-erp.web.app';
    const link = `${currentOrigin}/?tab=party_statements&partyType=${partyType}&id=${party?.id || ''}`;
    generateQRCodeDataURL(link, { width: 140, margin: 1, errorCorrectionLevel: 'M' }).then(setQrDataUrl);
  }, [partyType, party]);

  const handlePrint = () => {
    window.print();
  };

  const companyName = isAr
    ? companyProfile.tradeNameAr || companyProfile.legalName
    : companyProfile.tradeNameEn || companyProfile.legalName;

  const printTimestamp = new Date().toLocaleString(isAr ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const isSupplier = partyType === 'supplier';
  const partyTitle = isSupplier
    ? (isAr ? 'كشف حساب مورد (Accounts Payable)' : 'Supplier Statement of Account')
    : (isAr ? 'كشف حساب عميل (Accounts Receivable)' : 'Client Statement of Account');

  const formatEGP = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const taxSummary = React.useMemo(() => {
    let invoicesCount = 0;
    let invoicesTotal = 0;
    let creditNotesCount = 0;
    let creditNotesTotal = 0;
    let debitNotesCount = 0;
    let debitNotesTotal = 0;

    transactions.forEach((tx) => {
      const isRev = tx.isReversed || tx.status === 'reversed' || tx.status === 'cancelled';
      if (isRev) return;
      const amt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0);
      if (tx.taxDocType === 'credit_note') {
        creditNotesCount++;
        creditNotesTotal += amt;
      } else if (tx.taxDocType === 'debit_note') {
        debitNotesCount++;
        debitNotesTotal += amt;
      } else if (tx.taxDocType === 'invoice' || tx.taxDocNumber) {
        invoicesCount++;
        invoicesTotal += amt;
      }
    });

    return {
      invoicesCount,
      invoicesTotal,
      creditNotesCount,
      creditNotesTotal,
      debitNotesCount,
      debitNotesTotal,
      totalTaxDocsCount: invoicesCount + creditNotesCount + debitNotesCount
    };
  }, [transactions]);

  const tafqeetText = tafqeetArabic(Math.abs(closingBalance), 'EGP');

  const getPositionText = () => {
    if (Math.abs(closingBalance) < 0.01) {
      return isAr ? 'الحساب متوازن (رصيد صفري)' : 'Zero Balanced Account';
    }
    if (isSupplier) {
      return closingBalance > 0
        ? (isAr ? 'رصيد دائن (مستحق للمورد طرف الشركة)' : 'Credit Balance (Payable to Supplier)')
        : (isAr ? 'رصيد مدين (دفعة مقدمة للشركة طرف المورد)' : 'Debit Balance (Advance Payment to Supplier)');
    } else {
      return closingBalance > 0
        ? (isAr ? 'رصيد مدين (مستحق على العميل لصالح الشركة)' : 'Debit Balance (Receivable from Client)')
        : (isAr ? 'رصيد دائن (دفعة مقدمة من العميل طرف الشركة)' : 'Credit Balance (Advance Deposit from Client)');
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div id="isolated-partner-statement-print-portal">
      {/* Scoped Print CSS */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media screen {
          #isolated-partner-statement-print-portal {
            position: fixed;
            inset: 0;
            z-index: 99999;
            background-color: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            overflow-y: auto;
          }
          .a4-statement-canvas {
            background-color: #ffffff;
            width: 100%;
            max-width: 210mm;
            min-height: 297mm;
            padding: 12mm 14mm;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            border-radius: 8px;
            box-sizing: border-box;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #isolated-partner-statement-print-portal,
          #isolated-partner-statement-print-portal * {
            visibility: visible !important;
          }
          #isolated-partner-statement-print-portal {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .a4-statement-canvas {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `
        }}
      />

      {/* Screen Floating Action Bar */}
      <div className="fixed top-4 right-4 left-4 z-50 flex items-center justify-between max-w-4xl mx-auto px-4 py-2.5 bg-slate-900/90 text-white rounded-2xl shadow-xl backdrop-blur-md no-print">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-400" />
          <span className="font-extrabold text-xs sm:text-sm">
            {isAr ? 'معاينة كشف الحساب المعتمد للطباعة (A4)' : 'Official Partner Statement Print Preview (A4)'}
          </span>
          <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
            {transactions.length} {isAr ? 'حركة' : 'txs'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-md transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>{isAr ? 'طباعة الآن' : 'Print Now'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* The Printable A4 Sheet */}
      <div className={`a4-statement-canvas text-slate-900 text-xs font-sans ${isAr ? 'text-right' : 'text-left'}`} dir={isAr ? 'rtl' : 'ltr'}>
        {/* 1. Header with Company Branding & QR Code */}
        <div className="border-b-2 border-slate-900 pb-3 mb-3 flex items-start justify-between gap-4">
          <div className="space-y-1 max-w-[65%]">
            <h1 className="text-base sm:text-lg font-black text-slate-950 tracking-tight leading-snug">
              {companyName}
            </h1>
            <p className="text-[11px] font-bold text-indigo-900">
              {partyTitle}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-600 font-mono pt-0.5">
              <span>س.ت: {companyProfile.commercialRegister}</span>
              <span>•</span>
              <span>ب.ض: {companyProfile.taxCardNumber}</span>
              <span>•</span>
              <span className="font-sans">{companyProfile.taxDistrict}</span>
            </div>
            <p className="text-[9px] text-slate-500">{companyProfile.registeredAddress}</p>
          </div>

          <div className="flex items-center gap-3">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-16 h-16 border border-slate-300 rounded p-0.5 bg-white shrink-0"
              />
            )}
            <div className="text-end text-[10px] text-slate-500 space-y-0.5 font-mono shrink-0">
              <div className="font-bold text-slate-900">{isAr ? 'تاريخ الطباعة:' : 'Print Date:'}</div>
              <div>{printTimestamp}</div>
              <div className="text-[9px] text-indigo-700 font-sans font-bold">
                {isAr ? 'منظومة الطاووس ERP' : 'Tawoos ERP System'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Partner Profile & Statement Scope Box */}
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div>
            <span className="text-slate-500 block text-[10px]">{isSupplier ? (isAr ? 'اسم المورد:' : 'Supplier:') : (isAr ? 'اسم العميل:' : 'Client:')}</span>
            <strong className="text-slate-900 text-xs">{party?.name || party?.tradeName || party?.id || '—'}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">{isAr ? 'كود الطرف:' : 'Partner Code:'}</span>
            <strong className="font-mono text-slate-800">{party?.code || party?.id || '—'}</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">{isAr ? 'الرقم الضريبي:' : 'Tax Number:'}</span>
            <strong className="font-mono text-slate-800">
              {party?.taxNumber || party?.vatNumber || party?.taxCardNumber || '—'}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">{isAr ? 'فترة كشف الحساب:' : 'Statement Period:'}</span>
            <strong className="font-mono text-indigo-900 text-[10px]">
              {fromDate ? fromDate : (isAr ? 'البداية' : 'Start')} ➔ {toDate ? toDate : (isAr ? 'حتى تاريخه' : 'To Date')}
            </strong>
          </div>
        </div>

        {/* Taxable Documents Period Summary Strip */}
        {taxSummary.totalTaxDocsCount > 0 && (
          <div className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 mb-2.5 flex items-center justify-between text-[10px] flex-wrap gap-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <FileText className="h-3.5 w-3.5 text-indigo-700" />
              <span>{isAr ? 'حصر المستندات الضريبية للفترة:' : 'Tax Documents Period Summary:'}</span>
            </div>
            <div className="flex items-center gap-2.5 font-mono text-[9px]">
              <span className="bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-900">
                {isAr ? 'فواتير ضريبية:' : 'Tax Invoices:'} <strong className="font-bold text-indigo-900">{taxSummary.invoicesCount}</strong> ({formatEGP(taxSummary.invoicesTotal)} {isAr ? 'ج.م' : 'EGP'})
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-900">
                {isAr ? 'إشعارات دائنة (خصم):' : 'Credit Notes:'} <strong className="font-bold text-emerald-800">{taxSummary.creditNotesCount}</strong> ({formatEGP(taxSummary.creditNotesTotal)} {isAr ? 'ج.م' : 'EGP'})
              </span>
              {taxSummary.debitNotesCount > 0 && (
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-900">
                  {isAr ? 'إشعارات مدينة (إضافة):' : 'Debit Notes:'} <strong className="font-bold text-amber-800">{taxSummary.debitNotesCount}</strong> ({formatEGP(taxSummary.debitNotesTotal)} {isAr ? 'ج.م' : 'EGP'})
                </span>
              )}
            </div>
          </div>
        )}

        {/* 3. Statement Ledger Table */}
        <table className="w-full text-start border-collapse text-[10px] mb-3">
          <thead>
            <tr className="bg-slate-900 text-white font-bold">
              <th className="py-2 px-1.5 text-center w-7">#</th>
              <th className="py-2 px-1.5 text-start w-20">{isAr ? 'التاريخ' : 'Date'}</th>
              <th className="py-2 px-1.5 text-start min-w-[130px]">{isAr ? 'المستند الضريبي المعتمد (فاتورة / إشعار)' : 'Taxable Document (Inv / CN / DN)'}</th>
              <th className="py-2 px-1.5 text-start w-24">{isAr ? 'نوع الحركة الداخلي' : 'Internal Type'}</th>
              <th className="py-2 px-1.5 text-start w-24">{isAr ? 'رقم الإذن / المرجع' : 'Internal Ref'}</th>
              <th className="py-2 px-1.5 text-start">{isAr ? 'البيان والشرح' : 'Description'}</th>
              <th className="py-2 px-1.5 text-end w-20">{isAr ? 'مدين (ج.م)' : 'Debit'}</th>
              <th className="py-2 px-1.5 text-end w-20">{isAr ? 'دائن (ج.م)' : 'Credit'}</th>
              <th className="py-2 px-1.5 text-end w-24">{isAr ? 'الرصيد (ج.م)' : 'Balance'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {/* Opening Balance Row */}
            <tr className="bg-indigo-50/70 font-bold text-slate-900">
              <td className="py-1.5 px-1.5 text-center font-mono">0</td>
              <td className="py-1.5 px-1.5 font-mono">{fromDate || '—'}</td>
              <td className="py-1.5 px-1.5 text-indigo-950" colSpan={4}>
                {isAr ? 'الرصيد الافتتاحي السابق للفترة' : 'Opening Balance Prior to Period'}
              </td>
              <td className="py-1.5 px-1.5 text-end font-mono">—</td>
              <td className="py-1.5 px-1.5 text-end font-mono">—</td>
              <td className="py-1.5 px-1.5 text-end font-mono font-black text-indigo-950">
                {formatEGP(openingBalance)}
              </td>
            </tr>

            {/* Transactions */}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  {isAr ? 'لا توجد حركات مسجلة خلال الفترة المحددة' : 'No transactions recorded during this period'}
                </td>
              </tr>
            ) : (
              transactions.map((tx, idx) => {
                const isRev = tx.isReversed || tx.status === 'reversed' || tx.status === 'cancelled';
                return (
                  <tr
                    key={tx.id || idx}
                    className={`border-b border-slate-100 ${
                      isRev
                        ? 'bg-rose-50/50 text-slate-400 line-through'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-slate-50/50'
                    }`}
                  >
                    <td className="py-1.5 px-1.5 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-1.5 px-1.5 font-mono whitespace-nowrap">{tx.date}</td>
                    <td className="py-1.5 px-1.5 whitespace-nowrap">
                      {tx.taxDocNumber ? (
                        <div>
                          <div className={`font-mono font-black text-[10px] ${
                            tx.taxDocType === 'credit_note'
                              ? 'text-emerald-800'
                              : tx.taxDocType === 'debit_note'
                              ? 'text-amber-800'
                              : 'text-indigo-950'
                          }`}>
                            #{tx.taxDocNumber}
                          </div>
                          <div className="text-[8px] text-slate-600 font-bold">
                            {tx.taxDocType === 'credit_note'
                              ? (isAr ? 'إشعار دائن (خصم)' : 'Credit Note')
                              : tx.taxDocType === 'debit_note'
                              ? (isAr ? 'إشعار مدين (إضافة)' : 'Debit Note')
                              : (isAr ? 'فاتورة ضريبية' : 'Tax Invoice')}
                            {tx.etaPortalRegistered && (
                              <span className="ms-1 text-emerald-700 font-bold">✓ ETA</span>
                            )}
                          </div>
                          {tx.taxDocDate && tx.taxDocDate !== tx.date && (
                            <div className="text-[8px] text-slate-400 font-mono">
                              {tx.taxDocDate}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[9px] italic font-sans">
                          {isAr ? 'مستند داخلي' : 'Internal'}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-1.5 font-bold whitespace-nowrap">
                      {tx.typeLabel}
                      {isRev && <span className="text-[8px] text-rose-600 font-bold ms-1 no-underline">({isAr ? 'ملغي' : 'Void'})</span>}
                    </td>
                    <td className="py-1.5 px-1.5 font-mono text-slate-700 whitespace-nowrap">
                      <div className="font-bold text-[9px]">{tx.docNo}</div>
                      {tx.reference && tx.reference !== '—' && tx.reference !== tx.docNo && (
                        <div className="text-[8px] text-slate-400">{tx.reference}</div>
                      )}
                    </td>
                    <td className="py-1.5 px-1.5 text-slate-800 break-words max-w-[200px]">
                      {tx.description}
                    </td>
                    <td className="py-1.5 px-1.5 text-end font-mono">
                      {Number(tx.debit) > 0 ? formatEGP(tx.debit) : '—'}
                    </td>
                    <td className="py-1.5 px-1.5 text-end font-mono">
                      {Number(tx.credit) > 0 ? formatEGP(tx.credit) : '—'}
                    </td>
                    <td className={`py-1.5 px-1.5 text-end font-mono font-bold ${
                      tx.runningBalance >= 0 ? 'text-slate-900' : 'text-rose-700'
                    }`}>
                      {formatEGP(tx.runningBalance)}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Closing Balance & Totals Summary Row */}
            <tr className="bg-slate-900 text-white font-extrabold text-[11px]">
              <td colSpan={6} className="py-2.5 px-2 text-start">
                <span>{isAr ? 'إجمالي حركة الفترة والرصيد الختامي المستحق:' : 'Period Movement Totals & Closing Balance:'}</span>
              </td>
              <td className="py-2.5 px-1.5 text-end font-mono">
                {formatEGP(totalDebit)}
              </td>
              <td className="py-2.5 px-1.5 text-end font-mono">
                {formatEGP(totalCredit)}
              </td>
              <td className="py-2.5 px-1.5 text-end font-mono text-amber-300 font-black text-xs">
                {formatEGP(closingBalance)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 4. Arabic Tafqeet & Account Position Banner */}
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-4 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-600">{isAr ? 'التفقيط المالي للرصيد الختامي:' : 'Amount in Words:'}</span>
            <span className="font-bold text-indigo-900 font-sans">{getPositionText()}</span>
          </div>
          <p className="text-xs font-black font-serif text-slate-950">
            {isAr ? `فقط وقدره ${tafqeetText} لا غير.` : `Closing Balance: ${formatEGP(closingBalance)} EGP.`}
          </p>
        </div>

        {/* 5. Official Signatures Block */}
        <div className="pt-3 border-t border-slate-300 grid grid-cols-4 gap-4 text-center text-[10px]">
          <div>
            <span className="text-slate-500 block mb-6">{isAr ? 'المحاسب المسؤول' : 'Accountant'}</span>
            <div className="border-b border-dotted border-slate-400 w-3/4 mx-auto" />
            <span className="text-[9px] text-slate-400 mt-1 block">
              {currentUser?.name || currentUser?.nameAr || '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-6">{isAr ? 'المراجع المالي' : 'Internal Auditor'}</span>
            <div className="border-b border-dotted border-slate-400 w-3/4 mx-auto" />
          </div>
          <div>
            <span className="text-slate-500 block mb-6">{isAr ? 'أمين الخزينة / الحسابات' : 'Treasury Custodian'}</span>
            <div className="border-b border-dotted border-slate-400 w-3/4 mx-auto" />
          </div>
          <div>
            <span className="text-slate-500 block mb-6">{isAr ? 'اعتماد المدير المالي' : 'Financial Director'}</span>
            <div className="border-b border-dotted border-slate-400 w-3/4 mx-auto" />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
