import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, QrCode, ArrowRightLeft } from 'lucide-react';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import VatNumberDisplay from './VatNumberDisplay.jsx';

/**
 * StockTransferPrintSlip
 * Reusable, isolated printable document component for:
 * Internal Stock Transfer Notes (TRN - إذن تحويل وصرف مخزني داخلي)
 */
export default function StockTransferPrintSlip({
  trn,
  warehouses = [],
  printLang = 'ar',
  onClose
}) {
  const { i18n } = useTranslation();
  const isAr = printLang === 'ar' || i18n.language === 'ar';
  const { companyProfile } = useCompanyProfile();

  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (trn?.id) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://al-tawoos-erp.web.app';
      const link = `${currentOrigin}/?tab=stock_transfers&trnId=${encodeURIComponent(trn.id)}`;
      generateQRCodeDataURL(link, { width: 140, margin: 1, errorCorrectionLevel: 'M' }).then(setQrDataUrl);
    }
  }, [trn]);

  if (!trn) return null;

  const handlePrint = () => {
    window.print();
  };

  const getWarehouseName = (whId) => {
    if (!whId) return '-';
    const found = warehouses.find((w) => w.id === whId || w.code === whId);
    return found ? (isAr ? found.nameAr : (found.nameEn || found.nameAr)) : whId;
  };

  const companyName = isAr
    ? (companyProfile.tradeNameAr || companyProfile.legalName)
    : (companyProfile.tradeNameEn || companyProfile.legalName);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div id="isolated-financial-print-portal">
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
          .trn-print-modal-overlay {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: transparent !important;
          }
          #printable-trn-slip {
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

      <div className="trn-print-modal-overlay fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-[99999] flex flex-col items-center justify-start overflow-y-auto p-4 md:p-6 print:p-0">
        
        {/* Screen Toolbar */}
        <div className="screen-only-toolbar w-full max-w-4xl bg-slate-800 text-white rounded-2xl p-4 mb-4 flex items-center justify-between shadow-2xl border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm md:text-base text-white">
                {isAr ? 'معاينة إذن التحويل والصرف المخزني الداخلي' : 'Internal Stock Transfer Note Preview'}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {trn.id} - {trn.transferDate || trn.date}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg hover:shadow-indigo-500/25 transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>{isAr ? 'طباعة إذن التحويل (A4)' : 'Print Transfer (A4)'}</span>
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

        {/* Paper Document */}
        <div
          id="printable-trn-slip"
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
                  {isAr ? 'إذن تحويل وصرف مخزني داخلي (TRN)' : 'Internal Stock Transfer Voucher (TRN)'}
                </h2>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                  <span>{companyProfile.registeredAddress || 'المنطقة الصناعية، السادس من أكتوبر، الجيزة، مصر'}</span>
                </div>
              </div>
            </div>

            <div className="text-end">
              <span className="text-sm md:text-base font-mono font-extrabold text-slate-900 block">{trn.id}</span>
              <span className="text-[11px] font-bold text-slate-600 block">
                {isAr ? `(الإصدار ${trn.version || '1.0'})` : `(Rev ${trn.version || '1.0'})`}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                {isAr ? 'تاريخ التحويل:' : 'Date:'} {trn.transferDate || trn.date}
              </span>
              {trn.productionOrderRef && (
                <span className="text-[11px] font-mono font-bold text-indigo-700 block">
                  MO Ref: {trn.productionOrderRef}
                </span>
              )}
            </div>
          </div>

          {/* Route Card */}
          <div className="grid grid-cols-2 gap-3.5 p-3 mb-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">{isAr ? 'المخزن المنصرف منه (المصدر):' : 'Source WH:'}</span>
              <span className="font-bold text-slate-900 text-sm block">{getWarehouseName(trn.sourceWarehouse)}</span>
              <span className="text-slate-600 block mt-0.5 text-[11px]">
                {isAr ? 'المسؤول / محرر الإذن:' : 'Issued By:'} <b className="text-slate-900">{trn.issuedBy || '-'}</b>
              </span>
            </div>
            <div className="text-end">
              <span className="text-slate-400 block mb-0.5">{isAr ? 'المخزن المحول إليه (الوجهة):' : 'Destination WH:'}</span>
              <span className="font-bold text-slate-900 text-sm block">{getWarehouseName(trn.targetWarehouse)}</span>
              {trn.verifiedBy && (
                <span className="text-emerald-800 font-bold block mt-0.5 text-[11px]">
                  {isAr ? 'اعتماد واستلام أمين العهدة:' : 'Verified By:'} {trn.verifiedBy}
                </span>
              )}
            </div>
          </div>

          {/* Lines Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden mb-3.5">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2 text-start border-e border-slate-200 w-8">{isAr ? 'م' : 'No.'}</th>
                  <th className="p-2 text-start border-e border-slate-200">{isAr ? 'الكود والتنوع' : 'Code & Var'}</th>
                  <th className="p-2 text-start border-e border-slate-200">{isAr ? 'اسم الخامة والمواصفات والشدة' : 'Description & Specs'}</th>
                  <th className="p-2 text-center border-e border-slate-200">{isAr ? 'الكمية المحولة' : 'Transferred Qty'}</th>
                  <th className="p-2 text-start">{isAr ? 'رقم التشغيلة' : 'Batch #'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(trn.lines || []).map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-2 font-mono border-e border-slate-100 text-slate-500 text-center">{idx + 1}</td>
                    <td className="p-2 font-mono font-bold text-slate-800 border-e border-slate-100">{line.code || line.variantCode || line.itemId}</td>
                    <td className="p-2 border-e border-slate-100">
                      <div className="font-bold text-slate-900">{line.nameAr}</div>
                      {line.specs && <div className="text-[10px] text-slate-500 mt-0.5">{line.specs}</div>}
                      {line.packagingRatio > 1 && (
                        <div className="text-[10px] text-indigo-800 font-medium">
                          {isAr ? `شدة: ${line.packagingRatio} ${line.smallUnit} / ${line.largeUnitName}` : `Pack: ${line.packagingRatio}`}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-slate-900 border-e border-slate-100 whitespace-nowrap">
                      {Number(line.qtySmallUnits || 0).toLocaleString()} {line.smallUnit}
                      {line.qtyLargeUnits > 0 && (
                        <span className="block text-[9px] text-slate-400 font-normal">
                          ({line.qtyLargeUnits} {line.largeUnitName})
                        </span>
                      )}
                    </td>
                    <td className="p-2 font-mono text-slate-700 text-[11px]">{line.lotNumber || line.batchNumber || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* QR Code & Notes */}
          <div className="flex justify-between items-start gap-4 mb-4">
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/40">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="TRN QR Verification" className="w-16 h-16 rounded border border-slate-200" />
              ) : (
                <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center">
                  <QrCode className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <div className="text-[10px] text-slate-500 space-y-0.5">
                <span className="font-bold text-slate-800 block text-[11px]">
                  {isAr ? 'التحقق المخزني الرقمي' : 'Digital Verification'}
                </span>
                <span>{isAr ? 'رمز QR يربط بسجل التحويل الموثق' : 'QR links to verified transfer record'}</span>
                <span className="font-mono block text-slate-400">{trn.id}</span>
              </div>
            </div>

            {trn.notes && (
              <div className="flex-1 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs">
                <span className="font-bold text-slate-700 block mb-0.5 text-[11px]">{isAr ? 'ملاحظات:' : 'Notes:'}</span>
                <p className="text-slate-600 whitespace-pre-wrap text-[11px]">{trn.notes}</p>
              </div>
            )}
          </div>

          {/* Signatures Footer */}
          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-slate-200 text-xs text-center">
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'أمين مخزن المصدر' : 'Source Storekeeper'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">{trn.issuedBy || '................'}</span>
            </div>
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'أمين مخزن الوجهة' : 'Target Storekeeper'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">{trn.verifiedBy || '................'}</span>
            </div>
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'مسؤول الحركة / النقل' : 'Logistics / Transport'}
              </span>
              <span className="font-bold text-slate-900 block text-[11px]">........................</span>
            </div>
            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1 text-[10px]">
                {isAr ? 'إدارة مراقبة المخزون' : 'Inventory Manager'}
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
