import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, CheckCircle2, ShieldCheck, QrCode, FileText } from 'lucide-react';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import VatNumberDisplay from './VatNumberDisplay.jsx';

/**
 * GoodsReceiptPrintSlip
 * Reusable, isolated printable document component for:
 * 1. Goods Receipt Notes (GRN - إذن استلام وتوريد خامات)
 * 2. Supplier Return Notes (RTN / RTV - إذن مرتجع خامات لمورد)
 * 
 * Works in both Screen Modal (Preview) and Print (1-Page A4 Portrait) modes.
 */
export default function GoodsReceiptPrintSlip({
  grn,
  printLang = 'ar',
  onClose
}) {
  const { i18n } = useTranslation();
  const isAr = printLang === 'ar' || i18n.language === 'ar';
  const { companyProfile } = useCompanyProfile();

  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (grn?.id) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://al-tawoos-erp.web.app';
      const link = `${currentOrigin}/?tab=procurement_receipts&grnId=${encodeURIComponent(grn.id)}`;
      generateQRCodeDataURL(link, { width: 140, margin: 1, errorCorrectionLevel: 'M' }).then(setQrDataUrl);
    }
  }, [grn]);

  if (!grn) return null;

  const isPrintReturn = grn.docType === 'return' || grn.docType === 'supplier_return' || grn.id?.startsWith('RTN');

  const formatVersionTag = (ver) => {
    if (!ver) return 'v1.0';
    const num = parseFloat(ver);
    return isNaN(num) ? `v${ver}` : `v${num.toFixed(1)}`;
  };

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
          .grn-print-modal-overlay {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: transparent !important;
          }
          #printable-grn-slip {
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
      <div className="grn-print-modal-overlay fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-[99999] flex flex-col items-center justify-start overflow-y-auto p-4 md:p-6 print:p-0">
        
        {/* Screen Toolbar */}
        <div className="screen-only-toolbar w-full max-w-4xl bg-slate-800 text-white rounded-2xl p-4 mb-4 flex items-center justify-between shadow-2xl border border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isPrintReturn ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm md:text-base text-white">
                {isPrintReturn
                  ? (isAr ? 'معاينة إذن مرتجع خامات ومستلزمات لمورد' : 'Supplier Return Note Preview')
                  : (isAr ? 'معاينة إذن استلام وفحص خامات رسمي' : 'Goods Receipt & Inspection Note Preview')
                }
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {grn.id} {grn.version ? `(${formatVersionTag(grn.version)})` : ''} - {grn.supplierName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg hover:shadow-blue-500/25 transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>{isAr ? 'طباعة الإذن المعتمد (A4)' : 'Print Voucher (A4)'}</span>
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
          id="printable-grn-slip"
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
                  {isPrintReturn
                    ? (isAr ? 'إذن مرتجع مورد' : 'Supplier Return Note')
                    : (isAr ? 'إذن استلام مخزني' : 'Goods Receipt Note')
                  }
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
              <span className="text-sm md:text-base font-mono font-extrabold text-slate-900 block">{grn.id}</span>
              <span className="text-[11px] font-bold text-slate-600 block">
                {formatVersionTag(grn.version)}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                {isAr ? 'تاريخ:' : 'Date:'} {grn.receiptDate || grn.date || grn.createdAt?.slice(0, 10)}
              </span>
              {grn.poId && (
                <span className="text-[11px] font-mono font-bold text-blue-700 block">
                  PO: {grn.poId}
                </span>
              )}
            </div>
          </div>

          {/* Supplier & Delivery / Tax Invoicing Info */}
          <div className="grid grid-cols-2 gap-3.5 p-3 mb-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">{isAr ? 'المورد:' : 'Supplier:'}</span>
              <span className="font-bold text-slate-900 text-sm block">{grn.supplierName}</span>
              {grn.supplierDeliveryNote && (
                <span className="text-slate-600 block mt-0.5 font-mono text-[11px]">
                  {isAr ? 'إذن تسليم:' : 'D/N:'} {grn.supplierDeliveryNote}
                </span>
              )}
            </div>
            <div className="text-end space-y-0.5">
              {isPrintReturn ? (
                grn.isTaxOfficial ? (
                  grn.creditNoteNumber ? (
                    <>
                      <span className="text-slate-800 block font-mono font-bold text-xs">
                        {isAr ? 'إشعار دائن:' : 'Credit Note:'} {grn.creditNoteNumber}
                      </span>
                      {grn.creditNoteDate && (
                        <span className="text-slate-500 block font-mono text-[10px]">
                          {isAr ? 'التاريخ:' : 'Date:'} {grn.creditNoteDate}
                        </span>
                      )}
                      {grn.etaPortalRegistered && (
                        <span className="text-emerald-700 block font-semibold text-[10px]">
                          ✓ ETA
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-800 font-semibold block text-[11px]">
                      {isAr ? 'بانتظار إشعار الخصم' : 'Credit Note Pending'}
                    </span>
                  )
                ) : (
                  <span className="text-slate-500 italic block text-[11px]">
                    {isAr ? 'غير ضريبي' : 'Non-Taxable'}
                  </span>
                )
              ) : (
                grn.isTaxOfficial ? (
                  grn.taxInvoiceNumber ? (
                    <>
                      <span className="text-slate-800 block font-mono font-bold text-xs">
                        {isAr ? 'الفاتورة:' : 'Invoice:'} {grn.taxInvoiceNumber}
                      </span>
                      {grn.etaPortalRegistered && (
                        <span className="text-emerald-700 block font-semibold text-[10px]">
                          ✓ ETA
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-800 font-semibold block text-[11px]">
                      {isAr ? 'بانتظار الفاتورة' : 'Invoice Pending'}
                    </span>
                  )
                ) : (
                  <span className="text-slate-500 italic block text-[11px]">
                    {isAr ? 'غير ضريبي' : 'Non-Taxable'}
                  </span>
                )
              )}
              <span className="text-slate-600 block pt-0.5 text-[11px]">
                {isPrintReturn
                  ? (isAr ? 'المحرر:' : 'By:')
                  : (isAr ? 'المستلم:' : 'Received By:')
                } <b className="text-slate-900">{grn.receivedBy || grn.issuedBy || 'أمين المخزن'}</b>
              </span>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden mb-3.5">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2 text-start border-e border-slate-200 w-8">{isAr ? 'م' : '#'}</th>
                  <th className="p-2 text-start border-e border-slate-200">{isAr ? 'الكود' : 'Code'}</th>
                  <th className="p-2 text-start border-e border-slate-200">{isAr ? 'الصنف' : 'Item'}</th>
                  <th className="p-2 text-start border-e border-slate-200">
                    {isAr ? 'المخزن' : 'Warehouse'}
                  </th>
                  <th className="p-2 text-center border-e border-slate-200">{isAr ? 'الكمية' : 'Qty'}</th>
                  <th className="p-2 text-end border-e border-slate-200">{isAr ? 'السعر' : 'Price'}</th>
                  <th className="p-2 text-end">{isAr ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(grn.lines || []).map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-2 font-mono border-e border-slate-100 text-slate-500 text-center">{idx + 1}</td>
                    <td className="p-2 font-mono font-bold text-slate-800 border-e border-slate-100">
                      <div>{line.code || line.itemId}</div>
                      {line.lotNumber && (
                        <div className="text-[9px] text-indigo-700 font-mono font-extrabold">
                          Lot: {line.lotNumber}
                        </div>
                      )}
                    </td>
                    <td className="p-2 border-e border-slate-100">
                      <div className="font-bold text-slate-900">{line.nameAr}</div>
                      {line.specs && <div className="text-[10px] text-slate-500 mt-0.5">{line.specs}</div>}
                      {line.packagingRatio > 1 && (
                        <div className="text-[10px] text-emerald-800 font-medium">
                          {isAr ? `شدة: ${line.packagingRatio} ${line.smallUnit} / ${line.largeUnitName}` : `Pack: ${line.packagingRatio}`}
                        </div>
                      )}
                      {line.rejectionReason && (
                        <div className="text-[10px] text-rose-700 font-medium">
                          {isAr ? `سبب الارتجاع: ${line.rejectionReason}` : `Reason: ${line.rejectionReason}`}
                        </div>
                      )}
                    </td>
                    <td className="p-2 border-e border-slate-100 text-slate-700">{line.targetWarehouse || '-'}</td>
                    <td className="p-2 text-center font-mono font-bold text-slate-900 border-e border-slate-100 whitespace-nowrap">
                      {isPrintReturn ? '-' : ''}{Number(line.receivedSmallUnits || 0).toLocaleString()} {line.smallUnit}
                      {line.receivedLargeUnits > 0 && (
                        <span className="block text-[9px] text-slate-400 font-normal">
                          ({line.receivedLargeUnits} {line.largeUnitName})
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-end font-mono border-e border-slate-100 text-slate-800 whitespace-nowrap">
                      {Number(line.unitPrice || 0).toFixed(2)} {line.currency || 'EGP'}
                    </td>
                    <td className="p-2 text-end font-mono font-bold text-slate-900 whitespace-nowrap">
                      {isPrintReturn ? '-' : ''}{(Number(line.unitPrice || 0) * Number(line.receivedSmallUnits || 0)).toFixed(2)} {line.currency || 'EGP'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Summary & QR Code */}
          <div className="flex justify-between items-start gap-4 mb-3.5">
            {/* QR Code and System Seal */}
            <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-200 bg-slate-50/40 shrink-0">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR" className="w-16 h-16 rounded border border-slate-200" />
              ) : (
                <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center">
                  <QrCode className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <span className="text-[8.5px] font-black text-slate-900">{isAr ? 'للنظام' : 'ERP'}</span>
              <span className="text-[8px] font-mono text-slate-400">{grn.id}</span>
            </div>

            {/* Financial Box */}
            {grn.financials?.hasPricing && (
              <div className="w-72 space-y-1 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs">
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>{isAr ? 'قبل الضريبة:' : 'Subtotal:'}</span>
                  <span className="font-mono font-bold text-slate-800">
                    {isPrintReturn ? '-' : ''}{grn.financials.subtotal.toFixed(2)} {grn.financials.currency || 'EGP'}
                  </span>
                </div>
                {grn.isTaxOfficial && (
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>{isAr ? 'ض.ق.م (14%):' : 'VAT (14%):'}</span>
                    <span className="font-mono font-bold text-slate-800">
                      {isPrintReturn ? '-' : ''}{grn.financials.totalVat.toFixed(2)} {grn.financials.currency || 'EGP'}
                    </span>
                  </div>
                )}
                {grn.isTaxOfficial && grn.financials.totalWht > 0 && (
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>{isAr ? 'خصم ضريبي:' : 'WHT:'}</span>
                    <span className="font-mono font-bold text-slate-800">
                      {isPrintReturn ? '+' : '-'}{grn.financials.totalWht.toFixed(2)} {grn.financials.currency || 'EGP'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-extrabold text-xs text-slate-900">
                  <span>{isAr ? 'الصافي:' : 'Net:'}</span>
                  <span className={`font-mono ${isPrintReturn ? 'text-rose-700' : 'text-slate-900'}`}>
                    {isPrintReturn ? '-' : ''}{grn.financials.netPayable.toFixed(2)} {grn.financials.currency || 'EGP'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes if Present */}
          {grn.notes && (
            <div className="p-2 mb-3 rounded-lg border border-slate-200 bg-slate-50/30 text-[11px]">
              <span className="font-bold text-slate-700 block mb-0.5">{isAr ? 'ملاحظات:' : 'Notes:'}</span>
              <span className="text-slate-600 whitespace-pre-wrap">{grn.notes}</span>
            </div>
          )}

          {/* Signatures & Approvals Footer */}
          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-slate-200 text-xs text-center">
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'المخزن' : 'Warehouse'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px] truncate">
                {grn.receivedBy || grn.issuedBy || (isAr ? 'أمين المخزن' : 'Storekeeper')}
              </span>
            </div>
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isPrintReturn
                  ? (isAr ? 'المشتريات' : 'Purchasing')
                  : (isAr ? 'الجودة' : 'QC')
                }
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">........................</span>
            </div>
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'مراقبة المخزون' : 'Inventory'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">........................</span>
            </div>
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'الحسابات' : 'Finance'}
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
