import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, CheckCircle2, ShieldCheck, QrCode, Receipt } from 'lucide-react';
import { tafqeetArabic } from '../utils/tafqeet.js';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import { EGP_DENOMINATIONS } from '../utils/cashLedgerEngine.js';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import VatNumberDisplay from './VatNumberDisplay.jsx';

export default function CashVoucherPrintSlip({ voucher, safe, activeSafeId, onClose }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { companyProfile } = useCompanyProfile();

  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (voucher?.id) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://al-tawoos-erp.web.app';
      const safeId = voucher.safeId || safe?.id || 'SAFE-01';
      // Direct navigation link to the exact transaction record in Tawoos ERP
      const link = `${currentOrigin}/?tab=cash_safes&safeId=${encodeURIComponent(safeId)}&voucherId=${encodeURIComponent(voucher.id)}`;
      generateQRCodeDataURL(link, { width: 150, margin: 1, errorCorrectionLevel: 'M' }).then(setQrDataUrl);
    }
  }, [voucher, safe]);

  if (!voucher) return null;

  const isTransfer = voucher.type === 'safe_transfer';
  const effectiveSafeId = activeSafeId || safe?.id;
  const isTargetSafe = isTransfer && Boolean(effectiveSafeId && voucher.targetSafeId === effectiveSafeId);
  const isOutflow = isTransfer ? !isTargetSafe : (voucher.direction === 'out');
  const isInflow = isTransfer ? isTargetSafe : (voucher.direction === 'in');

  const tafqeetText = tafqeetArabic(voucher.amount, voucher.currency || 'EGP');

  const handlePrint = () => {
    window.print();
  };

  const companyName = isAr
    ? (companyProfile.tradeNameAr || companyProfile.legalName)
    : (companyProfile.tradeNameEn || companyProfile.legalName);

  const safeName = isAr ? (safe?.nameAr || voucher.safeId) : (safe?.nameEn || safe?.nameAr || voucher.safeId);

  let typeName = isAr ? (voucher.typeAr || voucher.type) : (voucher.typeEn || voucher.typeAr || voucher.type);
  if (isTransfer) {
    typeName = isTargetSafe
      ? (isAr ? 'سند تحويل نقدية وارد (استلام)' : 'Inter-Safe Transfer Receipt Slip')
      : (isAr ? 'سند تحويل نقدية صادر (إرسال)' : 'Inter-Safe Transfer Outflow Slip');
  }

  let mainAccName = isAr ? (voucher.mainAccountAr || voucher.mainAccount) : (voucher.mainAccountEn || voucher.mainAccountAr || voucher.mainAccount);
  if (isTransfer) {
    mainAccName = isTargetSafe
      ? (isAr ? 'تحويل وارد من خزينة' : 'Transfer from Safe')
      : (isAr ? 'تحويل صادر إلى خزينة' : 'Transfer to Safe');
  }

  let counterpartyLabel = isOutflow ? (isAr ? 'المنصرف إليه:' : 'Paid To:') : (isAr ? 'المستلم منه:' : 'Received From:');
  let counterpartyName = voucher.subAccountName || voucher.subAccountId || (isAr ? 'غير محدد' : 'Unspecified');
  let counterpartySub = voucher.subAccountId;

  if (isTransfer) {
    if (isTargetSafe) {
      counterpartyLabel = isAr ? 'الخزينة المحولة (المصدر):' : 'Source Vault:';
      counterpartyName = voucher.sourceSafeNameAr || voucher.sourceSafeNameEn || voucher.sourceSafeId;
      counterpartySub = voucher.sourceSafeId;
    } else {
      counterpartyLabel = isAr ? 'الخزينة المستلمة (الوجهة):' : 'Destination Vault:';
      counterpartyName = voucher.targetSafeNameAr || voucher.targetSafeNameEn || voucher.targetSafeId;
      counterpartySub = voucher.targetSafeId;
    }
  }

  // Filter denominations with count !== 0 for non-dense breakdown (including negative change notes)
  const activeDenominations = voucher.denominations
    ? EGP_DENOMINATIONS.filter((d) => (Number(voucher.denominations[d]) || 0) !== 0)
    : [];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div id="isolated-financial-print-portal">
      {/* Dynamic Scoped Print CSS Styles for STRICT 1-Page Portrait A4 */}
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
            margin: 6mm 10mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            max-height: 100% !important;
            min-height: 0 !important;
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
            max-height: 0 !important;
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
          .voucher-print-modal-overlay {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: transparent !important;
          }
          #printable-cash-voucher {
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 190mm !important;
            height: auto !important;
            max-height: 270mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            break-inside: avoid !important;
            break-after: avoid !important;
            break-before: avoid !important;
          }
          .no-print-area {
            display: none !important;
          }
        }
      `}} />

      {/* Screen Overlay Modal */}
      <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto voucher-print-modal-overlay print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:w-full print:h-auto">
        {/* Top Floating Control Bar (Hidden during print) */}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900/95 text-white px-5 py-2.5 rounded-2xl shadow-2xl border border-slate-700 no-print-area">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-lg active:scale-95"
          >
            <Printer className="h-4 w-4" />
            <span>{isAr ? 'طباعة السند (A4 فردي)' : 'Print Voucher (Single A4)'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition cursor-pointer"
          >
            <X className="h-4 w-4" />
            <span>{isAr ? 'إغلاق' : 'Close'}</span>
          </button>
        </div>

        {/* A4 Printable Document Container - Fitted to single portrait A4 */}
        <div
          id="printable-cash-voucher"
          className="bg-white text-slate-900 w-full max-w-[210mm] max-h-[297mm] p-6 sm:p-7 rounded-2xl shadow-2xl border border-slate-200 text-right font-sans my-auto print:my-0 flex flex-col justify-between print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full print:rounded-none"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <div>
            {/* 1. Header: Authentic Brand Logo, System_config SSOT & Voucher Meta */}
            <div className="border-b border-slate-300 pb-2.5 mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.svg"
                  alt="Logo"
                  onError={(e) => { e.currentTarget.src = '/logo-inverted.svg'; }}
                  className="h-11 w-auto max-w-[140px] object-contain shrink-0"
                />
                <div>
                  <h1 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                    {companyName}
                  </h1>
                  <div className="text-[10px] text-slate-600 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{isAr ? 'رقم ضريبي:' : 'Tax ID:'}</span>
                    {companyProfile.taxCardNumber ? (
                      <VatNumberDisplay value={companyProfile.taxCardNumber} />
                    ) : (
                      <span>—</span>
                    )}
                    <span className="text-slate-300">|</span>
                    <span>{isAr ? 'س.ت:' : 'CR:'}</span>
                    <span>{companyProfile.commercialRegister || '—'}</span>
                  </div>
                  <p className="text-[9.5px] text-slate-400">
                    {isAr ? 'الإدارة المالية — قطاع الخزينة' : 'Finance Dept. — Treasury'}
                  </p>
                </div>
              </div>

            <div className="text-left border-s border-slate-200 ps-4">
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-block ${
                isOutflow ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                isInflow ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {typeName}
              </span>
              <div className="text-xs font-mono font-black text-slate-900 mt-1">
                <span className="text-[10px] font-normal text-slate-400 me-1">{isAr ? 'رقم السند:' : 'No:'}</span>
                {voucher.id}
              </div>
              <div className="text-[9.5px] text-slate-500 mt-0.5 font-mono">
                {voucher.createdAt ? new Date(voucher.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : ''} • {voucher.createdAt ? new Date(voucher.createdAt).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          </div>

          {/* 2. Primary Financial Block: Amount & Tafqeet (Light, Simple outline) */}
          <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-2.5 mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 flex-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">
                {isAr ? 'المبلغ كتابة:' : 'In Words:'}
              </span>
              <p className="text-xs sm:text-sm font-black text-slate-900 font-serif leading-relaxed">
                {tafqeetText}
              </p>
            </div>

            <div className="text-start sm:text-end shrink-0 sm:border-s sm:border-slate-200 sm:ps-4">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">
                {isAr ? 'المبلغ:' : 'Amount:'}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono text-slate-900">
                  {Number(voucher.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-bold text-slate-600">{voucher.currency || 'EGP'}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">
                {isAr ? 'الخزينة:' : 'Safe:'} <strong className="text-slate-800">{safeName}</strong>
              </span>
            </div>
          </div>

          {/* 3. Transaction Details Specs Grid (Concise & Clean) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-2.5 text-xs">
            <div className="grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 border-b border-slate-200 bg-slate-50/50">
              <div className="p-2">
                <span className="text-[10px] text-slate-400 block font-bold mb-0.5">
                  {counterpartyLabel}
                </span>
                <span className="font-extrabold text-slate-900 block text-xs">
                  {counterpartyName}
                </span>
                {counterpartySub && counterpartyName !== counterpartySub && (
                  <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">{counterpartySub}</span>
                )}
              </div>

              <div className="p-2">
                <span className="text-[10px] text-slate-400 block font-bold mb-0.5">
                  {isAr ? 'التوجيه المحاسبي:' : 'GL Account:'}
                </span>
                <span className="font-extrabold text-slate-800 block text-xs">
                  {mainAccName || (isAr ? 'خزينة رئيسية' : 'Main Cash Safe')}
                </span>
                <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                  {voucher.sourceSafeId || voucher.safeId || 'SAFE-01'}
                </span>
              </div>
            </div>

            {/* Description Row */}
            <div className="p-2 bg-white">
              <span className="text-[10px] text-slate-400 block font-bold mb-0.5">
                {isAr ? 'البيان:' : 'Description:'}
              </span>
              <p className="text-slate-800 font-medium leading-relaxed text-xs">
                {voucher.description || (isAr ? 'صرف نقدية' : 'Cash transaction')}
              </p>
            </div>
          </div>

          {/* 4. Banknote Breakdown (Compact, non-dense) */}
          {activeDenominations.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-1.5 mb-2 bg-slate-50/50 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-600">
                  {isAr ? 'فئات النقدية:' : 'Cash Breakdown:'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeDenominations.map((denom) => {
                  const count = Number(voucher.denominations[denom]) || 0;
                  const isChange = count < 0;
                  const totalForDenom = count * denom;
                  return (
                    <div
                      key={denom}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono border ${
                        isChange ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <span className="font-black text-slate-900">{denom} {isAr ? 'ج' : 'EGP'}</span>
                      <span className="text-slate-400">×</span>
                      <span className={`font-extrabold ${isChange ? 'text-amber-800' : 'text-emerald-800'}`}>{count}</span>
                      <span className="text-slate-400">=</span>
                      <span className="text-slate-700 font-bold">{totalForDenom.toLocaleString()}</span>
                      {isChange && (
                        <span className="text-[9px] px-1 bg-amber-200/80 text-amber-900 rounded font-semibold ml-0.5">
                          {isAr ? 'فكة' : 'Chg'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Change Exchange Breakdown (if present) */}
          {voucher.type === 'change_exchange' && voucher.changeExchangeDetails && (
            <div className="grid grid-cols-2 gap-2 mb-2 p-2 bg-amber-50/50 rounded-xl border border-amber-200 text-xs">
              <div>
                <span className="font-bold text-rose-700 block mb-0.5 text-[10px]">{isAr ? 'فئات منصرفة:' : 'Outflow Notes:'}</span>
                <div className="space-y-0.5">
                  {Object.entries(voucher.changeExchangeDetails.notesGivenOut || {}).map(([d, c]) => (
                    Number(c) > 0 && <span key={d} className="inline-block bg-white px-1.5 py-0.5 rounded border border-rose-200 text-rose-800 font-mono text-[10px] ml-1">{c}x {d}</span>
                  ))}
                </div>
              </div>
              <div>
                <span className="font-bold text-emerald-700 block mb-0.5 text-[10px]">{isAr ? 'فئات مستلمة:' : 'Inflow Notes:'}</span>
                <div className="space-y-0.5">
                  {Object.entries(voucher.changeExchangeDetails.notesTakenIn || {}).map(([d, c]) => (
                    Number(c) > 0 && <span key={d} className="inline-block bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800 font-mono text-[10px] ml-1">{c}x {d}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tax Details (if present) */}
          {voucher.taxDocumentType === 'taxable' && voucher.taxDetails && (
            <div className="border border-purple-200 bg-purple-50/30 p-2 rounded-xl mb-2 flex items-center justify-between text-[11px] text-purple-950">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-purple-700 shrink-0" />
                <span className="font-bold">{isAr ? 'مستند ضريبي' : 'Tax Invoice'}</span>
                {voucher.taxDetails.invoiceNumber && (
                  <span className="font-mono text-slate-700 ms-1">(#{voucher.taxDetails.invoiceNumber})</span>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px]">
                {voucher.taxDetails.vatAmount > 0 && <span>{isAr ? 'ض.ق.م:' : 'VAT:'} {voucher.taxDetails.vatAmount}</span>}
                {voucher.taxDetails.withholdingAmount > 0 && <span>{isAr ? 'خصم:' : 'WHT:'} {voucher.taxDetails.withholdingAmount}</span>}
              </div>
            </div>
          )}
        </div>

        {/* 5. Bottom Section: QR Code & 3 Signatures */}
        <div className="pt-2 border-t border-slate-300">
          <div className="flex items-end justify-between gap-4">
            {/* QR Code Deep-Link */}
            <div className="flex items-center gap-2">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR"
                  className="h-16 w-16 border border-slate-200 rounded-lg p-1 bg-white shrink-0"
                />
              ) : (
                <div className="h-16 w-16 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-300 shrink-0">
                  <QrCode className="h-5 w-5" />
                </div>
              )}
              <div className="text-[9.5px] text-slate-500">
                <span className="font-bold text-slate-800 block">
                  {isAr ? 'التحقق المباشر' : 'Direct Link'}
                </span>
                <p className="text-[9px] text-slate-400">
                  {isAr ? 'مسح الرمز للمطابقة بالنظام' : 'Scan to view in ERP'}
                </p>
              </div>
            </div>

            {/* 3 Dedicated Airy Signature Blocks */}
            <div className="flex items-end gap-2.5 text-center text-xs flex-1 max-w-[420px]">
              {/* 1. Recipient Signature */}
              <div className="flex-1 border border-slate-200 rounded-xl p-2 bg-slate-50/30 flex flex-col justify-between h-20">
                <div className="font-bold text-slate-700 text-[10.5px]">
                  {isAr ? 'المستلم' : 'Recipient'}
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1 text-[9px] text-slate-400">
                  {isAr ? 'التوقيع' : 'Signature'}
                </div>
              </div>

              {/* 2. Vault Custodian */}
              <div className="flex-1 border border-slate-200 rounded-xl p-2 bg-slate-50/30 flex flex-col justify-between h-20">
                <div className="font-bold text-slate-700 text-[10.5px]">
                  {isAr ? 'أمين الخزينة' : 'Cashier'}
                </div>
                <div className="text-[9.5px] font-bold text-emerald-700 truncate">
                  {voucher.issuedByName || ''}
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1 text-[9px] text-slate-400">
                  {isAr ? 'التوقيع' : 'Signature'}
                </div>
              </div>

              {/* 3. Authorized Approval */}
              <div className="flex-1 border border-slate-200 rounded-xl p-2 bg-slate-50/30 flex flex-col justify-between h-20">
                <div className="font-bold text-slate-700 text-[10.5px]">
                  {isAr ? 'الاعتماد المالي' : 'Finance Approval'}
                </div>
                <div className="text-[9.5px] font-bold text-blue-700 truncate">
                  {voucher.approvedByName || ''}
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1 text-[9px] text-slate-400">
                  {isAr ? 'الاعتماد' : 'Approval'}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div className="mt-2 pt-1 border-t border-slate-200 text-center text-[9px] text-slate-400 flex items-center justify-between">
            <span>{isAr ? 'نظام الطاووس لإدارة الموارد • نسخة أصلية معتمدة' : 'Al Tawoos ERP • Official Certified Document'}</span>
            <span>{isAr ? 'صفحة 1 من 1' : 'Page 1 of 1'}</span>
          </div>
        </div>
      </div>
    </div>
    </div>,
    document.body
  );
}
