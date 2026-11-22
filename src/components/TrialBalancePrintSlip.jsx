import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, Scale, ShieldCheck, AlertTriangle } from 'lucide-react';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import VatNumberDisplay from './VatNumberDisplay.jsx';

export default function TrialBalancePrintSlip({
  trialBalanceData,
  onClose,
  activeLedgerMode = 'official',
  currentUser = null
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { companyProfile } = useCompanyProfile();
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://al-tawoos-erp.web.app';
    const link = `${currentOrigin}/?tab=accounts&subTab=trial_balance`;
    generateQRCodeDataURL(link, { width: 140, margin: 1, errorCorrectionLevel: 'M' }).then(setQrDataUrl);
  }, []);

  if (!trialBalanceData) return null;

  const handlePrint = () => {
    window.print();
  };

  const companyName = isAr
    ? companyProfile.tradeNameAr || companyProfile.legalName
    : companyProfile.tradeNameEn || companyProfile.legalName;

  const isBalanced = trialBalanceData.isBalanced;
  const totalDebits = trialBalanceData.totalDebits || 0;
  const totalCredits = trialBalanceData.totalCredits || 0;
  const variance = Math.abs(totalDebits - totalCredits);
  const rows = trialBalanceData.rows || [];

  const printTimestamp = new Date().toLocaleString(isAr ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div id="isolated-financial-print-portal">
      {/* Scoped Print CSS */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media screen {
          #isolated-financial-print-portal {
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
          .a4-print-canvas {
            background-color: #ffffff;
            width: 100%;
            max-width: 210mm;
            min-height: 297mm;
            padding: 12mm 14mm;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            border-radius: 1rem;
            margin: auto;
            color: #0f172a;
          }
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          #isolated-financial-print-portal,
          #isolated-financial-print-portal * {
            visibility: visible !important;
          }
          #isolated-financial-print-portal {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .a4-print-canvas {
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
          }
        }
      `
        }}
      />

      <div className="flex flex-col items-center w-full max-h-[96vh]">
        {/* Floating Screen Actions */}
        <div className="no-print w-full max-w-[210mm] mb-3 flex items-center justify-between bg-slate-900/90 text-white px-4 py-2.5 rounded-2xl shadow-lg border border-slate-700">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold">
              {isAr ? 'معاينة طباعة ميزان المراجعة (A4)' : 'Trial Balance A4 Print Preview'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer shadow-sm active:scale-95"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isAr ? 'طباعة المستند' : 'Print Now'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Canvas */}
        <div className="a4-print-canvas overflow-y-auto max-h-[85vh] text-slate-900 font-sans">
          {/* 1. Header */}
          <div className="border-b-2 border-slate-900 pb-3 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {companyName}
                </h1>
                <p className="text-[11px] text-slate-600 font-bold">
                  {companyProfile.legalName}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                  <span>س.ت: {companyProfile.commercialRegister}</span>
                  <span>•</span>
                  <span>
                    ب.ض: <VatNumberDisplay vatNumber={companyProfile.taxCardNumber} />
                  </span>
                </div>
              </div>

              {/* QR Code and Title Pill */}
              <div className="flex items-center gap-3">
                <div className="text-end">
                  <span className="inline-block px-3 py-1 bg-slate-100 text-slate-900 border-2 border-slate-900 rounded-lg text-xs font-black">
                    {isAr ? 'ميزان المراجعة' : 'Trial Balance'}
                  </span>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    {printTimestamp}
                  </div>
                </div>
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <img
                      src={qrDataUrl}
                      alt="QR"
                      className="w-16 h-16 rounded border border-slate-200 p-0.5 object-contain"
                    />
                    <span className="text-[8.5px] font-black text-slate-900">{isAr ? 'للنظام' : 'ERP'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Equilibrium Summary Banner */}
            <div
              className={`mt-3 p-2 rounded-xl border flex items-center justify-between text-xs font-bold ${
                isBalanced
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                )}
                <span>
                  {isBalanced
                    ? isAr
                      ? 'متزن 100%'
                      : 'Balanced 100%'
                    : isAr
                    ? `فرق اتزان: (${variance.toLocaleString()} ج.م)`
                    : `Variance: (${variance.toLocaleString()} EGP)`}
                </span>
              </div>
              <div className="text-[11px] font-mono">
                {isAr ? 'معتمد' : 'Certified'}
              </div>
            </div>
          </div>

          {/* 2. Structured Table */}
          <div className="mb-4">
            <table className="w-full text-[11px] text-start border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                  <th className="py-2 px-2.5 text-start border-e border-slate-300 w-16">
                    {isAr ? 'الكود' : 'Code'}
                  </th>
                  <th className="py-2 px-2.5 text-start border-e border-slate-300">
                    {isAr ? 'الحساب' : 'Account'}
                  </th>
                  <th className="py-2 px-2 text-center border-e border-slate-300 w-20">
                    {isAr ? 'القائمة' : 'Stmt'}
                  </th>
                  <th className="py-2 px-2 text-center border-e border-slate-300 w-16">
                    {isAr ? 'الطبيعة' : 'Nature'}
                  </th>
                  <th className="py-2 px-2.5 text-end border-e border-slate-300 w-28 text-emerald-900">
                    {isAr ? 'مدين' : 'Debit'}
                  </th>
                  <th className="py-2 px-2.5 text-end border-e border-slate-300 w-28 text-indigo-900">
                    {isAr ? 'دائن' : 'Credit'}
                  </th>
                  <th className="py-2 px-2.5 text-end w-28">
                    {isAr ? 'الصافي' : 'Net'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {rows.map((row) => {
                  const isParent = Boolean(row.hasChildren);
                  const dispDebit = isParent ? (row.rollupDebit !== undefined ? row.rollupDebit : row.debit) : row.debit;
                  const dispCredit = isParent ? (row.rollupCredit !== undefined ? row.rollupCredit : row.credit) : row.credit;
                  const dispNet = isParent ? (row.rollupNetBalance !== undefined ? row.rollupNetBalance : row.netBalance) : row.netBalance;
                  const indentMm = Math.max(0, (Number(row.level || 1) - 1) * 3);
                  const isL1 = Number(row.level) === 1;
                  const isL2 = Number(row.level) === 2;

                  return (
                    <tr
                      key={row.code}
                      className={`hover:bg-slate-50 ${isL1 ? 'border-t-2 border-slate-900 font-black' : isL2 ? 'border-t border-slate-400 font-bold' : ''}`}
                    >
                      <td className="py-1 px-2.5 font-bold text-slate-900 border-e border-slate-200">
                        <div style={{ [isAr ? 'paddingRight' : 'paddingLeft']: `${indentMm}mm` }}>
                          {row.code}
                        </div>
                      </td>
                      <td className="py-1 px-2.5 font-sans text-slate-800 border-e border-slate-200">
                        <div
                          style={{ [isAr ? 'paddingRight' : 'paddingLeft']: `${indentMm}mm` }}
                          className="flex items-center gap-1.5"
                        >
                          <span className={isL1 ? 'font-black text-slate-950 text-xs' : isL2 ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}>
                            {row.nameAr || row.nameEn}
                          </span>
                          {isParent && (
                            <span className="text-[9px] text-slate-500 font-normal">
                              ({isAr ? `تجميعي: ${row.childrenCount || 0}` : `Rollup: ${row.childrenCount || 0}`})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-center font-sans text-[10px] border-e border-slate-200">
                        {row.statement === 'balance_sheet'
                          ? isAr
                            ? 'المركز المالي'
                            : 'BS'
                          : isAr
                          ? 'الدخل'
                          : 'P&L'}
                      </td>
                      <td className="py-1 px-2 text-center font-sans text-[10px] border-e border-slate-200">
                        {row.nature === 'debit'
                          ? isAr
                            ? 'مدين'
                            : 'Dr'
                          : isAr
                          ? 'دائن'
                          : 'Cr'}
                      </td>
                      <td className={`py-1 px-2.5 text-end border-e border-slate-200 ${isL1 ? 'font-black text-slate-950' : 'text-slate-900'}`}>
                        {dispDebit > 0
                          ? dispDebit.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })
                          : '-'}
                      </td>
                      <td className={`py-1 px-2.5 text-end border-e border-slate-200 ${isL1 ? 'font-black text-slate-950' : 'text-slate-900'}`}>
                        {dispCredit > 0
                          ? dispCredit.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })
                          : '-'}
                      </td>
                      <td
                        className={`py-1 px-2.5 text-end ${isL1 ? 'font-black' : 'font-bold'} ${
                          dispNet >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        {dispNet.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}{' '}
                        <span className="text-[9px] font-sans">ج.م</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-mono font-black border-t-2 border-slate-900">
                <tr>
                  <td
                    colSpan="4"
                    className="py-2.5 px-3 text-slate-900 font-sans text-xs border-e border-slate-300"
                  >
                    {isAr ? 'الإجمالي:' : 'Totals:'}
                  </td>
                  <td className="py-2.5 px-2.5 text-end text-emerald-900 text-xs border-e border-slate-300">
                    {totalDebits.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}{' '}
                    <span className="text-[9px] font-sans">ج.م</span>
                  </td>
                  <td className="py-2.5 px-2.5 text-end text-indigo-900 text-xs border-e border-slate-300">
                    {totalCredits.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}{' '}
                    <span className="text-[9px] font-sans">ج.م</span>
                  </td>
                  <td
                    className={`py-2.5 px-2.5 text-end text-xs ${
                      variance < 0.01 ? 'text-slate-900' : 'text-rose-700'
                    }`}
                  >
                    {variance < 0.01
                      ? '0.00 ج.م (متزن)'
                      : `${variance.toLocaleString()} ج.م (فرق)`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 3. Formal Signatures Footer */}
          <div className="pt-6 mt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs">
            <div className="space-y-8">
              <span className="font-bold text-slate-700 block">
                {isAr ? 'المحاسب' : 'Prepared by'}
              </span>
              <div className="border-b border-dashed border-slate-400 w-36 mx-auto"></div>
              <span className="text-[10px] text-slate-500 block">
                {currentUser?.name || currentUser?.nameAr || '—'}
              </span>
            </div>

            <div className="space-y-8">
              <span className="font-bold text-slate-700 block">
                {isAr ? 'رئيس الحسابات' : 'Chief Accountant'}
              </span>
              <div className="border-b border-dashed border-slate-400 w-36 mx-auto"></div>
            </div>

            <div className="space-y-8">
              <span className="font-bold text-slate-700 block">
                {isAr ? 'المدير المالي' : 'CFO'}
              </span>
              <div className="border-b border-dashed border-slate-400 w-36 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
