import React, { useState, useMemo } from 'react';
import {
  X,
  Scale,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  FileText,
  ExternalLink,
  ShieldCheck,
  Printer,
  ChevronRight,
  Database,
  Layers,
  ArrowRight
} from 'lucide-react';
import { LEDGER_MODES, isTransactionTaxOfficial } from '../utils/dualLedgerEngine.js';

export default function TrialBalanceDiagnosticModal({
  isOpen,
  onClose,
  accountsList = [],
  transactionsList = [],
  journalEntries = [],
  accountingLinks = {},
  activeLedgerMode = LEDGER_MODES.OFFICIAL,
  trialBalanceData = null,
  onInspectEntry = () => {},
  isAr = true
}) {
  const [filterSeverity, setFilterSeverity] = useState('all'); // 'all' | 'critical' | 'warning'
  const [searchTerm, setSearchTerm] = useState('');

  // Diagnostic Engine: Deep Audit Scan across all Ledger Data
  const diagnostics = useMemo(() => {
    const findings = [];
    const accountsMap = new Map();
    accountsList.forEach((acc) => {
      accountsMap.set(String(acc.code || acc.id).trim(), acc);
    });

    const safeCode = accountingLinks.cashSafesAccount?.code || '1020101';
    let scannedTxCount = 0;
    let scannedJeCount = 0;

    // 1. Audit Cash Transactions Stream
    transactionsList.forEach((tx) => {
      if (tx.status !== 'posted') return;
      if (activeLedgerMode === LEDGER_MODES.OFFICIAL && !isTransactionTaxOfficial(tx)) return;
      scannedTxCount++;

      const amt = Number(tx.amountInEGP) || Number(tx.amount);
      let accCode = String(tx.mainAccount || '').trim();
      const subCode = String(tx.subAccountId || tx.subAccountCode || tx.childAccountCode || '').trim();
      const isSurplus = tx.type === 'balance_adjustment' && tx.direction === 'in';
      if (subCode && accountsMap.has(subCode)) {
        accCode = subCode;
      } else if (!accCode || accCode === 'discrepancy') {
        accCode = accountingLinks.cashDiscrepancyAccount?.primaryCode || (isSurplus ? '4010204' : '3020209');
      } else if (accCode === 'custody' || accCode === 'advances') {
        accCode = accountingLinks.workersCustodyAccount?.primaryCode || '1020401';
      } else if (accCode === 'internal_transfer') {
        accCode = accountingLinks.internalTransfersAccount?.primaryCode || safeCode;
      } else if (accCode === 'suppliers') {
        accCode = accountingLinks.suppliersAccount?.primaryCode || '2020101';
      } else if (accCode === 'clients') {
        accCode = accountingLinks.clientsAccount?.primaryCode || '1020301';
      } else if (accCode === 'salaries') {
        accCode = accountsMap.has('3010201') ? '3010201' : '3020201';
      } else if (accCode === 'opex' || accCode === 'general_admin_exp') {
        accCode = accountsMap.has('3010207') ? '3010207' : '3020213';
      }

      // Check 1.1: Missing or invalid amount
      if (isNaN(amt) || amt <= 0) {
        findings.push({
          id: `diag_tx_amt_${tx.id}`,
          severity: 'critical',
          category: 'invalid_amount',
          docId: tx.id,
          date: tx.createdAt?.slice(0, 10) || tx.date || '',
          typeAr: 'سند نقدية',
          typeEn: 'Cash Voucher',
          description: tx.description || tx.typeAr || 'سند نقدية بدون وصف',
          titleAr: 'مبلغ مالي غير صالح أو مساوٍ للصفر',
          titleEn: 'Invalid or zero voucher amount',
          detailAr: `قيمة السند (${tx.amountInEGP || tx.amount}) غير صحيحة مما يخل بترحيل الأرصدة.`,
          detailEn: `Transaction amount is invalid (${tx.amountInEGP || tx.amount}).`,
          entry: tx
        });
      }

      // Check 1.2: Unlinked main account
      if (!accCode) {
        findings.push({
          id: `diag_tx_no_acc_${tx.id}`,
          severity: 'critical',
          category: 'missing_account',
          docId: tx.id,
          date: tx.createdAt?.slice(0, 10) || tx.date || '',
          typeAr: 'سند نقدية',
          typeEn: 'Cash Voucher',
          description: tx.description || tx.typeAr || 'سند نقدية بدون وصف',
          titleAr: 'سند غير مربوط بحساب رئيسي في الشجرة',
          titleEn: 'Voucher missing linked GL account',
          detailAr: 'السند لا يحمل كود حساب محاسبي رئيسي، وبالتالي يتعذر ترحيل أحد طرفي القيد.',
          detailEn: 'Transaction does not specify a valid GL account code.',
          entry: tx
        });
      } else if (!accountsMap.has(accCode)) {
        findings.push({
          id: `diag_tx_unlinked_acc_${tx.id}`,
          severity: 'critical',
          category: 'unlinked_account',
          docId: tx.id,
          date: tx.createdAt?.slice(0, 10) || tx.date || '',
          typeAr: 'سند نقدية',
          typeEn: 'Cash Voucher',
          description: tx.description || tx.typeAr || 'سند نقدية بدون وصف',
          titleAr: `كود الحساب (${accCode}) غير موجود في شجرة الحسابات`,
          titleEn: `Account code (${accCode}) not found in COA`,
          detailAr: `السند يشير إلى كود حساب (${accCode}) غير مسجل في الدليل المحاسبي.`,
          detailEn: `Referenced account code (${accCode}) is not registered in the Chart of Accounts.`,
          entry: tx
        });
      }

      // Check 1.3: Cash safe account validity
      if (!accountsMap.has(safeCode)) {
        findings.push({
          id: `diag_tx_safe_acc_${tx.id}`,
          severity: 'warning',
          category: 'system_link',
          docId: tx.id,
          date: tx.createdAt?.slice(0, 10) || '',
          typeAr: 'إعدادات النظام',
          typeEn: 'System Links',
          description: 'حساب الخزينة الرئيسي',
          titleAr: `حساب الخزينة الرئيسي (${safeCode}) غير موجود بالشجرة`,
          titleEn: `Cash safes control account (${safeCode}) missing in COA`,
          detailAr: 'يرجى مراجعة محرك الربط الآلي للحسابات وتعيين حساب خزينة ساري.',
          detailEn: 'Verify Cash Safes Account in Master Accounting Links.',
          entry: tx
        });
      }
    });

    // 2. Audit Journal Entries Stream (Accruals & Manual Adjustments)
    journalEntries.forEach((je) => {
      if (je.status !== 'posted') return;
      if (activeLedgerMode === LEDGER_MODES.OFFICIAL && !isTransactionTaxOfficial(je)) return;
      scannedJeCount++;

      let jeDebits = 0;
      let jeCredits = 0;
      const lines = Array.isArray(je.lines) ? je.lines : [];

      lines.forEach((l, idx) => {
        const d = Number(l.debit) || 0;
        const c = Number(l.credit) || 0;
        jeDebits += d;
        jeCredits += c;
        const lCode = String(l.accountCode || '').trim();

        // Check 2.1: Line missing account code
        if (!lCode) {
          findings.push({
            id: `diag_je_line_acc_${je.id}_${idx}`,
            severity: 'critical',
            category: 'missing_account',
            docId: je.entryNumber || je.id,
            date: je.entryDate || je.createdAt?.slice(0, 10) || '',
            typeAr: je.docLabelAr || 'قيد محاسبي',
            typeEn: je.docLabelEn || 'Journal Entry',
            description: je.descriptionAr || je.entryNumber || '',
            titleAr: `الطرف رقم (${idx + 1}) لا يحمل كود حساب محاسبي`,
            titleEn: `Leg #${idx + 1} is missing GL account code`,
            detailAr: `قيمة الطرف: ${d > 0 ? `مدين ${d} ج.م` : `دائن ${c} ج.م`}`,
            detailEn: `Leg amount: ${d > 0 ? `Debit ${d}` : `Credit ${c}`}`,
            entry: je
          });
        } else if (!accountsMap.has(lCode)) {
          findings.push({
            id: `diag_je_unlinked_acc_${je.id}_${idx}`,
            severity: 'warning',
            category: 'unlinked_account',
            docId: je.entryNumber || je.id,
            date: je.entryDate || je.createdAt?.slice(0, 10) || '',
            typeAr: je.docLabelAr || 'قيد محاسبي',
            typeEn: je.docLabelEn || 'Journal Entry',
            description: je.descriptionAr || je.entryNumber || '',
            titleAr: `كود الحساب (${lCode}) غير مسجل في شجرة الحسابات`,
            titleEn: `Account (${lCode}) not found in COA`,
            detailAr: `تم إنشاء حساب مؤقت له آلياً ولكن يفضل تعريفه رسمياً في الدليل.`,
            detailEn: `Auto-inferred fallback used; define properly in Chart of Accounts.`,
            entry: je
          });
        }
      });

      // Check 2.2: Double-Entry Unbalanced Legs
      const legDiff = Math.round(Math.abs(jeDebits - jeCredits) * 100) / 100;
      if (legDiff > 0.01) {
        findings.push({
          id: `diag_je_unbalanced_${je.id}`,
          severity: 'critical',
          category: 'unbalanced_entry',
          docId: je.entryNumber || je.id,
          date: je.entryDate || je.createdAt?.slice(0, 10) || '',
          typeAr: je.docLabelAr || 'قيد محاسبي',
          typeEn: je.docLabelEn || 'Journal Entry',
          description: je.descriptionAr || je.entryNumber || '',
          titleAr: `قيد غير متزن: فرق (${legDiff.toLocaleString()} ج.م)`,
          titleEn: `Unbalanced Journal Entry: diff of (${legDiff.toLocaleString()} EGP)`,
          detailAr: `إجمالي المدين: ${jeDebits.toLocaleString()} ج.م | إجمالي الدائن: ${jeCredits.toLocaleString()} ج.م`,
          detailEn: `Debits: ${jeDebits.toLocaleString()} EGP | Credits: ${jeCredits.toLocaleString()} EGP`,
          entry: je
        });
      }
    });

    const totalVariance = trialBalanceData
      ? Math.round(Math.abs(trialBalanceData.totalDebits - trialBalanceData.totalCredits) * 100) / 100
      : 0;

    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;

    return {
      findings,
      totalVariance,
      isBalanced: totalVariance < 0.01 && criticalCount === 0,
      scannedTxCount,
      scannedJeCount,
      scannedAccountsCount: accountsList.length,
      criticalCount,
      warningCount
    };
  }, [accountsList, transactionsList, journalEntries, accountingLinks, activeLedgerMode, trialBalanceData]);

  if (!isOpen) return null;

  // Filtered Findings
  const filteredFindings = diagnostics.findings.filter((f) => {
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        f.docId.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.titleAr.toLowerCase().includes(q) ||
        f.titleEn.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      {/* Scoped Print CSS */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #diagnostic-print-card,
          #diagnostic-print-card * {
            visibility: visible !important;
          }
          #diagnostic-print-card {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `
        }}
      />

      <div id="diagnostic-print-card" className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden text-slate-900 flex flex-col my-auto max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl border ${
                diagnostics.isBalanced
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
                  : 'bg-rose-500/20 border-rose-400 text-rose-400 animate-pulse'
              }`}
            >
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <span>{isAr ? 'فاحص وتشخيص صحة واتزان ميزان المراجعة' : 'Trial Balance Diagnostic Assistant'}</span>
                {diagnostics.isBalanced ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-[10px] font-bold">
                    {isAr ? 'متزن 100%' : '100% Balanced'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400 text-rose-300 text-[10px] font-bold">
                    {isAr ? 'يوجد فرق' : 'Imbalance'}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-300">
                {isAr
                  ? 'فحص شامل في الوقت الفعلي لجميع قيود وسندات اليومية ورصد أي أطراف غير متزنة أو حسابات غير معرفة'
                  : 'Real-time diagnostic scan identifying unbalanced entries, missing accounts, and mathematical variances'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="no-print p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Executive Diagnostic KPI Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-4 ${
              diagnostics.isBalanced
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-3">
              {diagnostics.isBalanced ? (
                <ShieldCheck className="h-8 w-8 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-rose-600 shrink-0 animate-bounce" />
              )}
              <div>
                <h4 className="font-extrabold text-sm sm:text-base">
                  {diagnostics.isBalanced
                    ? isAr
                      ? '✓ ميزان المراجعة سليم تماماً وخالٍ من الأخطاء الهيكلية'
                      : '✓ Trial Balance Perfectly Balanced & Structurally Sound'
                    : isAr
                    ? `⚠️ تم رصد عدم اتزان بمقدار (${diagnostics.totalVariance.toLocaleString()} ج.م)`
                    : `⚠️ Imbalance Detected: Variance of (${diagnostics.totalVariance.toLocaleString()} EGP)`}
                </h4>
                <p className="text-xs opacity-85">
                  {diagnostics.isBalanced
                    ? isAr
                      ? 'تطابق كامل بين إجمالي المدين وإجمالي الدائن. جميع الحسابات والسندات مربوطة بشكل صحيح.'
                      : 'Total Debits equal Total Credits across all streams. All entries have valid COA links.'
                    : isAr
                    ? 'يوجد فرق بين إجمالي المدين والدائن. راجع قائمة الملاحظات أدناه لمعالجة القيود المتسببة بالفرق.'
                    : 'Discrepancy detected between debits and credits. Review flagged items below to resolve.'}
                </p>
              </div>
            </div>

            {/* Diagnostic Metrics Pills */}
            <div className="flex items-center gap-2 flex-wrap font-mono font-bold text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="block text-[10px] text-slate-500 font-sans">{isAr ? 'حسابات مفحوصة:' : 'Accounts:'}</span>
                <span className="text-slate-900">{diagnostics.scannedAccountsCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="block text-[10px] text-slate-500 font-sans">{isAr ? 'سندات نقدية:' : 'Vouchers:'}</span>
                <span className="text-slate-900">{diagnostics.scannedTxCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="block text-[10px] text-slate-500 font-sans">{isAr ? 'قيود يومية:' : 'Journals:'}</span>
                <span className="text-slate-900">{diagnostics.scannedJeCount}</span>
              </div>
              {diagnostics.totalVariance > 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-rose-600 text-white shadow-2xs">
                  <span className="block text-[10px] opacity-80 font-sans">{isAr ? 'قيمة الفرق:' : 'Variance:'}</span>
                  <span>{diagnostics.totalVariance.toLocaleString()} ج.م</span>
                </div>
              )}
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="no-print flex items-center justify-between flex-wrap gap-3 pt-1">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFilterSeverity('all')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    filterSeverity === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? `الكل (${diagnostics.findings.length})` : `All (${diagnostics.findings.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSeverity('critical')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    filterSeverity === 'critical' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>{isAr ? `حرج (${diagnostics.criticalCount})` : `Critical (${diagnostics.criticalCount})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSeverity('warning')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    filterSeverity === 'warning' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>{isAr ? `تنبيهات (${diagnostics.warningCount})` : `Warnings (${diagnostics.warningCount})`}</span>
                </button>
              </div>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              <input
                type="text"
                placeholder={isAr ? 'بحث برقم السند، الوصف، أو الخطأ...' : 'Search findings...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full ps-9 pe-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Findings List */}
          <div className="space-y-2.5">
            {filteredFindings.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                <h4 className="font-extrabold text-sm text-emerald-950">
                  {isAr ? 'لم يتم العثور على أي ملاحظات أو أخطاء!' : 'No Issues or Variances Found!'}
                </h4>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                  {isAr
                    ? 'كافة القيود وسندات الصرف والتحصيل متوافقة تماماً مع معايير القيد المزدوج الإلزامي وميزان المراجعة متزن 100%.'
                    : 'All journal entries and cash vouchers strictly adhere to double-entry rules. The Trial Balance is 100% in equilibrium.'}
                </p>
              </div>
            ) : (
              filteredFindings.map((finding) => (
                <div
                  key={finding.id}
                  className={`p-3.5 rounded-2xl border transition flex items-start justify-between gap-3 shadow-2xs ${
                    finding.severity === 'critical'
                      ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                      : 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        finding.severity === 'critical'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {finding.severity === 'critical' ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                            finding.severity === 'critical'
                              ? 'bg-rose-200/80 text-rose-900'
                              : 'bg-amber-200/80 text-amber-900'
                          }`}
                        >
                          {finding.severity === 'critical' ? (isAr ? 'حرج' : 'Critical') : (isAr ? 'تنبيه' : 'Warning')}
                        </span>
                        <span className="font-mono font-bold text-xs text-slate-900">{finding.docId}</span>
                        <span className="text-[11px] text-slate-400">• {finding.date}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
                          {isAr ? finding.typeAr : finding.typeEn}
                        </span>
                      </div>

                      <h5 className="font-bold text-xs text-slate-900">
                        {isAr ? finding.titleAr : finding.titleEn}
                      </h5>
                      <p className="text-[11px] text-slate-600">
                        {isAr ? finding.detailAr : finding.detailEn}
                      </p>
                      {finding.description && (
                        <p className="text-[10px] text-slate-400 font-sans">
                          {isAr ? 'البيان: ' : 'Memo: '} {finding.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="no-print shrink-0 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onInspectEntry(finding.entry);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition shadow-2xs cursor-pointer group"
                      title={isAr ? 'معاينة القيد في اليومية العامة' : 'Inspect in Journal Ledger'}
                    >
                      <span>{isAr ? 'فحص القيد' : 'Inspect'}</span>
                      <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            {isAr
              ? `تم رصد (${diagnostics.findings.length}) ملاحظة فحص عبر (${diagnostics.scannedAccountsCount}) حساب و(${diagnostics.scannedTxCount + diagnostics.scannedJeCount}) مستند`
              : `Found (${diagnostics.findings.length}) issues across (${diagnostics.scannedAccountsCount}) accounts and (${diagnostics.scannedTxCount + diagnostics.scannedJeCount}) records`}
          </div>

          <div className="no-print flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 transition cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isAr ? 'طباعة تقرير الفحص' : 'Print Report'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer shadow-xs"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
