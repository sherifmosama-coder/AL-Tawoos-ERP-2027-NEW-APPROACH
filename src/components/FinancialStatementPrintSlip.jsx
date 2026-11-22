import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Printer, X, FileText, ShieldCheck, Scale, TrendingUp, Landmark, PieChart } from 'lucide-react';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import VatNumberDisplay from './VatNumberDisplay.jsx';

export default function FinancialStatementPrintSlip({
  statementType = 'income_statement',
  startDate = '',
  endDate = '',
  selectedYear = '2026',
  displayLevel = 'all',
  incomeStatementData,
  balanceSheetData,
  cashFlowData,
  costCenterData,
  activeLedgerMode = 'official',
  currentUser = null,
  onClose
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { companyProfile } = useCompanyProfile();
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://al-tawoos-erp.web.app';
    const link = `${currentOrigin}/?tab=financial_statements&type=${statementType}`;
    generateQRCodeDataURL(link, { width: 140, margin: 1, errorCorrectionLevel: 'M' }).then(setQrDataUrl);
  }, [statementType]);

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

  const getStatementTitle = () => {
    if (statementType === 'income_statement') return isAr ? 'قائمة الأرباح والخسائر (Income Statement)' : 'Income Statement (P&L)';
    if (statementType === 'balance_sheet') return isAr ? 'قائمة المركز المالي والميزانية العمومية (Balance Sheet)' : 'Balance Sheet';
    if (statementType === 'cash_flow') return isAr ? 'قائمة التدفقات النقدية (Cash Flow Statement)' : 'Cash Flow Statement';
    if (statementType === 'cost_centers') return isAr ? 'تقرير أداء مراكز التكلفة التشغيلية (Cost Centers)' : 'Cost Center Performance';
    return isAr ? 'القوائم المالية' : 'Financial Statement';
  };

  const formatEGP = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatStatementMoney = (val) => {
    const num = Number(val) || 0;
    if (num < -0.0001) {
      return `(${formatEGP(Math.abs(num))})`;
    }
    return formatEGP(num);
  };

  const renderPrintAccountItems = (items = []) => {
    if (displayLevel === 'summary' || !Array.isArray(items) || items.length === 0) return null;
    return items.map((item) => {
      const indentPx = Math.max(0, ((item.level || 2) - 2) * 14);
      const isNegativeEffect = item.sectionContribution < -0.0001;
      return (
        <tr key={item.code} className="text-[11px] border-b border-slate-100">
          <td className="py-1.5 px-3 text-slate-700" style={{ paddingInlineStart: `${16 + indentPx}px` }}>
            <span className="font-mono text-[10px] text-slate-500 me-1.5">[{item.code}]</span>
            <span className={item.hasRolledUpChildren ? 'font-bold text-slate-900' : 'font-medium'}>
              {isAr ? item.nameAr : item.nameEn || item.nameAr}
            </span>
            {item.isContra && (
              <span className="ms-1.5 text-[9px] text-rose-700 font-bold">
                ({isAr ? 'حساب عكسي / يخصم' : 'Contra'})
              </span>
            )}
          </td>
          <td className={`py-1.5 px-3 text-end font-mono ${isNegativeEffect ? 'text-rose-700 font-bold' : 'text-slate-800'}`}>
            {formatStatementMoney(item.sectionContribution)}
          </td>
        </tr>
      );
    });
  };

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
            <FileText className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold">
              {getStatementTitle()} — {isAr ? 'معاينة الطباعة A4' : 'A4 Print Preview'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer shadow-sm active:scale-95"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isAr ? 'طباعة القائمة' : 'Print Now'}</span>
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
          {/* Header */}
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
                <div className="pt-0.5">
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700">
                    {activeLedgerMode === 'official'
                      ? (isAr ? 'الدفتر الضريبي الرسمي' : 'Official Tax Ledger')
                      : (isAr ? 'الدفتر الشامل الموحد' : 'Consolidated Ledger')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-end">
                  <span className="inline-block px-3 py-1 bg-slate-100 text-slate-900 border-2 border-slate-900 rounded-lg text-xs font-black">
                    {getStatementTitle()}
                  </span>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    {statementType === 'balance_sheet'
                      ? (isAr ? `حتى: ${endDate || selectedYear}` : `As Of: ${endDate}`)
                      : (isAr ? `الفترة: ${startDate || selectedYear} — ${endDate || selectedYear}` : `Period: ${startDate} — ${endDate}`)}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">
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
          </div>

          {/* Statement Body */}
          <div className="mb-4 space-y-4">
            {/* 1. INCOME STATEMENT VIEW */}
            {statementType === 'income_statement' && incomeStatementData && (
              <div className="border border-slate-300 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 font-black border-b border-slate-300">
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الحساب' : 'Line Item'}</th>
                      <th className="py-2.5 px-3 text-end w-36">{isAr ? 'القيمة' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans">
                    <tr className="bg-slate-50/70 font-bold">
                      <td className="py-2 px-3 text-emerald-800">{isAr ? '١. الإيرادات' : '1. Revenues'}</td>
                      <td className="py-2 px-3 text-end font-mono text-emerald-800">{formatStatementMoney(incomeStatementData.totalRevenue ?? incomeStatementData.totalRevenues)}</td>
                    </tr>
                    {renderPrintAccountItems(incomeStatementData.revenueItems ?? incomeStatementData.revenuesItems)}

                    <tr className="bg-slate-50/70 font-bold">
                      <td className="py-2 px-3 text-amber-800">{isAr ? '٢. (-) تكلفة المبيعات' : '2. (-) COGS'}</td>
                      <td className="py-2 px-3 text-end font-mono text-amber-800">({formatEGP(incomeStatementData.totalCogs)})</td>
                    </tr>
                    {renderPrintAccountItems(incomeStatementData.cogsItems)}

                    <tr className="bg-emerald-50/50 font-black text-emerald-950 border-t border-b border-emerald-200">
                      <td className="py-2 px-3">{isAr ? '= مجمل الربح' : '= Gross Profit'}</td>
                      <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(incomeStatementData.grossProfit)}</td>
                    </tr>

                    <tr className="bg-slate-50/70 font-bold">
                      <td className="py-2 px-3 text-slate-700">{isAr ? '٣. (-) مصروفات بيعية' : '3. (-) Selling Expenses'}</td>
                      <td className="py-2 px-3 text-end font-mono text-slate-700">({formatEGP(incomeStatementData.totalSelling ?? incomeStatementData.totalSellingExpenses)})</td>
                    </tr>
                    {renderPrintAccountItems(incomeStatementData.sellingItems ?? incomeStatementData.sellingExpensesItems)}

                    <tr className="bg-slate-50/70 font-bold">
                      <td className="py-2 px-3 text-slate-700">{isAr ? '٤. (-) مصروفات إدارية' : '4. (-) Admin Expenses'}</td>
                      <td className="py-2 px-3 text-end font-mono text-slate-700">({formatEGP(incomeStatementData.totalAdmin ?? incomeStatementData.totalAdminExpenses)})</td>
                    </tr>
                    {renderPrintAccountItems(incomeStatementData.adminItems ?? incomeStatementData.adminExpensesItems)}

                    <tr className="bg-slate-50/70 font-bold">
                      <td className="py-2 px-3 text-purple-800">{isAr ? '٥. (-) مصروفات تمويلية' : '5. (-) Financing Expenses'}</td>
                      <td className="py-2 px-3 text-end font-mono text-purple-800">({formatEGP(incomeStatementData.totalFinancing)})</td>
                    </tr>
                    {renderPrintAccountItems(incomeStatementData.financingItems ?? incomeStatementData.financingExpensesItems)}

                    <tr className="bg-blue-50/50 font-black text-blue-950 border-t border-b border-blue-200">
                      <td className="py-2 px-3">{isAr ? '= الربح التشغيلي' : '= Operating Profit'}</td>
                      <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(incomeStatementData.operatingProfit ?? incomeStatementData.ebit)}</td>
                    </tr>

                    <tr className="bg-slate-50/70 font-bold">
                      <td className="py-2 px-3 text-slate-600">{isAr ? '٦. بنود أخرى' : '6. Other Net'}</td>
                      <td className="py-2 px-3 text-end font-mono text-slate-600">{formatStatementMoney(incomeStatementData.totalOther ?? incomeStatementData.otherNet)}</td>
                    </tr>
                    {renderPrintAccountItems(incomeStatementData.otherItems ?? incomeStatementData.otherRevExpItems)}
                  </tbody>
                  <tfoot className="bg-slate-200 text-slate-900 font-black text-xs border-t-2 border-slate-900">
                    <tr>
                      <td className="py-3 px-3">{isAr ? 'صافي الربح / الخسارة:' : 'Net Profit / Loss:'}</td>
                      <td className="py-3 px-3 text-end font-mono text-sm text-slate-950">
                        {formatStatementMoney(incomeStatementData.netProfit)} ج.م
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* 2. VERTICAL BALANCE SHEET VIEW */}
            {statementType === 'balance_sheet' && balanceSheetData && (
              <div className="space-y-3 text-xs">
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-start border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-black border-b border-slate-300">
                        <th className="py-2.5 px-3 text-start">{isAr ? 'الحساب' : 'Line Item'}</th>
                        <th className="py-2.5 px-3 text-end w-40">{isAr ? 'الرصيد' : 'Balance'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-sans">
                      {/* SECTION I: ASSETS */}
                      <tr className="bg-emerald-100/70 font-black text-emerald-950">
                        <td colSpan={2} className="py-2 px-3">{isAr ? 'أولاً: الأصول' : 'I. Assets'}</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2 px-3">{isAr ? '١. أصول ثابتة' : '1. Fixed Assets'}</td>
                        <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(balanceSheetData.fixedAssets)}</td>
                      </tr>
                      {renderPrintAccountItems(balanceSheetData.fixedAssetsItems)}

                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2 px-3">{isAr ? '٢. أصول متداولة' : '2. Current Assets'}</td>
                        <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(balanceSheetData.currentAssets)}</td>
                      </tr>
                      {renderPrintAccountItems(balanceSheetData.currentAssetsItems)}

                      <tr className="bg-emerald-50 font-black border-t-2 border-b-2 border-emerald-300 text-emerald-950">
                        <td className="py-2.5 px-3">{isAr ? '= إجمالي الأصول' : '= Total Assets'}</td>
                        <td className="py-2.5 px-3 text-end font-mono text-sm">{formatStatementMoney(balanceSheetData.totalAssets)} ج.م</td>
                      </tr>

                      {/* SECTION II: LIABILITIES & EQUITY */}
                      <tr className="bg-blue-100/70 font-black text-blue-950">
                        <td colSpan={2} className="py-2 px-3">{isAr ? 'ثانياً: الالتزامات وحقوق الملكية' : 'II. Liabilities & Equity'}</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2 px-3">{isAr ? '١. التزامات متداولة' : '1. Current Liabilities'}</td>
                        <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(balanceSheetData.currentLiabilities)}</td>
                      </tr>
                      {renderPrintAccountItems(balanceSheetData.currentLiabilitiesItems)}

                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2 px-3">{isAr ? '٢. التزامات طويلة الأجل' : '2. Long-Term Liabilities'}</td>
                        <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(balanceSheetData.longTermLiabilities)}</td>
                      </tr>
                      {renderPrintAccountItems(balanceSheetData.longTermLiabilitiesItems)}

                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td className="py-1.5 px-3">{isAr ? '= إجمالي الالتزامات' : '= Total Liabilities'}</td>
                        <td className="py-1.5 px-3 text-end font-mono">{formatStatementMoney(balanceSheetData.totalLiabilities)}</td>
                      </tr>

                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2 px-3">{isAr ? '٣. حقوق الملكية' : '3. Equity'}</td>
                        <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(balanceSheetData.totalEquity)}</td>
                      </tr>
                      {renderPrintAccountItems(balanceSheetData.equityItems)}
                    </tbody>
                    <tfoot className="bg-slate-200 text-slate-900 font-black text-xs border-t-2 border-slate-900">
                      <tr>
                        <td className="py-2.5 px-3">{isAr ? '= إجمالي الالتزامات والملكية:' : '= Total Liabilities & Equity:'}</td>
                        <td className="py-2.5 px-3 text-end font-mono text-sm text-slate-950">
                          {formatStatementMoney(balanceSheetData.totalLiabilitiesAndEquity)} ج.م
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Equilibrium Balance Badge */}
                <div className="p-2.5 rounded-xl border border-slate-300 bg-slate-50 flex items-center justify-between font-mono font-bold">
                  <span>{isAr ? 'التوازن:' : 'Balance Check:'}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${Math.abs(balanceSheetData.variance || 0) < 0.01 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {formatEGP(balanceSheetData.variance || 0)} ج.م ({Math.abs(balanceSheetData.variance || 0) < 0.01 ? (isAr ? 'متزن' : 'Balanced') : (isAr ? 'غير متزن' : 'Out of Balance')})
                  </span>
                </div>
              </div>
            )}

            {/* 3. CASH FLOW STATEMENT VIEW */}
            {statementType === 'cash_flow' && cashFlowData && (
              <div className="border border-slate-300 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 font-black border-b border-slate-300">
                      <th className="py-2.5 px-3 text-start">{isAr ? 'النشاط' : 'Activity'}</th>
                      <th className="py-2.5 px-3 text-end w-36">{isAr ? 'التدفق' : 'Net Flow'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2 px-3 font-bold">{isAr ? '١. تشغيلي' : '1. Operating'}</td>
                      <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(cashFlowData.operatingFlow)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold">{isAr ? '٢. استثماري' : '2. Investing'}</td>
                      <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(cashFlowData.investingFlow)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold">{isAr ? '٣. تمويلي' : '3. Financing'}</td>
                      <td className="py-2 px-3 text-end font-mono">{formatStatementMoney(cashFlowData.financingFlow)}</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-200 text-slate-900 font-black text-xs border-t-2 border-slate-900">
                    <tr>
                      <td className="py-2.5 px-3">{isAr ? 'صافي التغير في النقدية:' : 'Net Change in Cash:'}</td>
                      <td className="py-2.5 px-3 text-end font-mono text-slate-950">{formatStatementMoney(cashFlowData.netChangeInCash)} ج.م</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* 4. COST CENTERS STATEMENT VIEW */}
            {statementType === 'cost_centers' && Array.isArray(costCenterData) && (
              <div className="border border-slate-300 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 font-black border-b border-slate-300">
                      <th className="py-2 px-2.5 text-start">{isAr ? 'الكود' : 'Code'}</th>
                      <th className="py-2 px-2.5 text-start">{isAr ? 'مركز التكلفة' : 'Cost Center'}</th>
                      <th className="py-2 px-2.5 text-end">{isAr ? 'الإيرادات' : 'Revenues'}</th>
                      <th className="py-2 px-2.5 text-end">{isAr ? 'التكاليف المباشرة' : 'Direct Cost'}</th>
                      <th className="py-2 px-2.5 text-end">{isAr ? 'المصروفات' : 'OpEx'}</th>
                      <th className="py-2 px-2.5 text-end">{isAr ? 'صافي العائد' : 'Net Margin'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans">
                    {costCenterData.map((cc) => (
                      <tr key={cc.code}>
                        <td className="py-1.5 px-2.5 font-mono font-bold">{cc.code}</td>
                        <td className="py-1.5 px-2.5 font-bold">{isAr ? cc.nameAr : cc.nameEn || cc.nameAr}</td>
                        <td className="py-1.5 px-2.5 text-end font-mono">{formatEGP(cc.revenues)}</td>
                        <td className="py-1.5 px-2.5 text-end font-mono">{formatEGP(cc.directExpenses)}</td>
                        <td className="py-1.5 px-2.5 text-end font-mono">{formatEGP(cc.operatingExpenses)}</td>
                        <td className="py-1.5 px-2.5 text-end font-mono font-bold">{formatStatementMoney(cc.netMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Formal Signatures Footer */}
          <div className="pt-6 mt-6 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs">
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
