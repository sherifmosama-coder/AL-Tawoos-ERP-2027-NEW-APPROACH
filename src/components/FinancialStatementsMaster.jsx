import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp,
  Scale,
  ArrowDownUp,
  Layers,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Landmark,
  Eye,
  X,
  PieChart,
  Factory,
  Truck,
  Wrench,
  Briefcase,
  FileText,
  SlidersHorizontal
} from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  ACCOUNT_REPORT_CATEGORIES,
  DEFAULT_ACCOUNTING_LINKS,
  normalizeAccountAttributes,
  buildAccountHierarchyMap,
  resolveCashTransactionPostingLegs,
  computeRollupSectionItems,
  resolveEquityRolloverAccountCodes
} from '../utils/cashLedgerEngine.js';
import SecretDoorModal from './SecretDoorModal.jsx';
import SecretLockButton from './SecretLockButton.jsx';
import FinancialStatementPrintSlip from './FinancialStatementPrintSlip.jsx';
import { useCompanyProfile } from '../hooks/useCompanyProfile.js';
import {
  LEDGER_MODES,
  getActiveLedgerMode,
  isMasterUnlocked,
  setActiveLedgerMode,
  lockMasterLedger,
  subscribeToLedgerModeChange,
  isTransactionTaxOfficial
} from '../utils/dualLedgerEngine.js';

export default function FinancialStatementsMaster({
  currentUser,
  onNavigateToAccounts = () => {},
  onNavigateToCash = () => {}
}) {
  const { companyProfile } = useCompanyProfile();
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // Active Financial Statement Tab (Synchronized with URL hash subTab)
  // 'income_statement' | 'balance_sheet' | 'cash_flow' | 'cost_centers'
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const raw = window.location.hash || '';
      if (raw.includes('?')) {
        const p = new URLSearchParams(raw.split('?')[1]);
        const s = p.get('subTab');
        if (s && ['income_statement', 'balance_sheet', 'cash_flow', 'cost_centers'].includes(s)) {
          return s;
        }
      }
    }
    return 'income_statement';
  });

  // Sync activeTab into URL hash subTab so refresh returns to same view
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash || '#financial_statements';
    const [base, queryStr] = raw.split('?');
    const params = new URLSearchParams(queryStr || '');
    if (params.get('subTab') !== activeTab || !params.has('module')) {
      params.set('subTab', activeTab);
      if (!params.has('module')) params.set('module', 'finance');
      const newHash = `${base || '#financial_statements'}?${params.toString()}`;
      window.history.replaceState(null, '', newHash);
    }
  }, [activeTab]);

  // Filters & Hierarchy Display Controls State
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [periodPreset, setPeriodPreset] = useState('all'); // 'all', 'ytd', 'q1', 'q2', 'q3', 'q4', 'this_month', 'last_month', 'custom'
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [selectedCostCenter, setSelectedCostCenter] = useState('all');
  const [selectedSafe, setSelectedSafe] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Customizable COA Display Level ('summary' | '2' | '3' | '4' | 'all') & Zero-Balance Toggle
  const [displayLevel, setDisplayLevel] = useState('3');
  const [showZeroBalances, setShowZeroBalances] = useState(false);

  // Dual-Ledger Architecture State (Official Tax Books vs. Master Comprehensive Books)
  const [activeLedgerMode, setLedgerModeState] = useState(getActiveLedgerMode);
  const [isMasterDoorUnlocked, setIsMasterDoorUnlocked] = useState(isMasterUnlocked);
  const [showSecretDoorModal, setShowSecretDoorModal] = useState(false);

  useEffect(() => {
    const unsub = subscribeToLedgerModeChange(({ mode, isUnlocked }) => {
      setLedgerModeState(mode);
      setIsMasterDoorUnlocked(isUnlocked);
    });
    return () => unsub();
  }, []);

  const handleToggleLedgerMode = (newMode) => {
    setActiveLedgerMode(newMode);
  };

  const handleLockMaster = () => {
    lockMasterLedger();
  };

  // Live Firestore Data State
  const [accountsList, setAccountsList] = useState([]);
  const [transactionsList, setTransactionsList] = useState([]);
  const [journalEntriesList, setJournalEntriesList] = useState([]);
  const [receiptsList, setReceiptsList] = useState([]);
  const [safesList, setSafesList] = useState([]);
  const [accountingLinks, setAccountingLinks] = useState(DEFAULT_ACCOUNTING_LINKS);
  const [customCostCenters, setCustomCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPrintSlip, setShowPrintSlip] = useState(false);

  // Drilldown Modal State
  const [drilldownModal, setDrilldownModal] = useState({
    isOpen: false,
    titleAr: '',
    titleEn: '',
    accountCode: null,
    categoryKey: null,
    transactions: []
  });

  // Expanded Row Categories in Tables
  const [expandedSections, setExpandedSections] = useState({
    revenues: true,
    cogs: true,
    opex_selling: true,
    opex_admin: true,
    financing_expense: true,
    other_revenue_expense: true,
    current_assets: true,
    fixed_assets: true,
    current_liabilities: true,
    long_term_liabilities: true,
    equity: true,
    cf_operating: true,
    cf_investing: true,
    cf_financing: true
  });

  const toggleSection = (secKey) => {
    setExpandedSections((prev) => ({ ...prev, [secKey]: !prev[secKey] }));
  };

  // 1. Listen to chart_of_accounts (normalized via normalizeAccountAttributes)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'chart_of_accounts'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) =>
          normalizeAccountAttributes({ id: docSnap.id, ...docSnap.data() })
        );
        setAccountsList(list);
      },
      (err) => console.error('Error listening to chart_of_accounts:', err)
    );
    return () => unsub();
  }, []);

  // 2. Listen to cash_transactions (without restrictive orderBy('date') so createdAt docs are never dropped)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cash_transactions'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        setTransactionsList(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to cash_transactions:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // 3. Listen to journal_entries
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'journal_entries'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        setJournalEntriesList(list);
      },
      (err) => console.error('Error listening to journal_entries:', err)
    );
    return () => unsub();
  }, []);

  // 4. Listen to goods_receipts (for accurate Official vs Master scope resolution on linked journal entries)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'goods_receipts'),
      (snapshot) => {
        setReceiptsList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error('Error listening to goods_receipts:', err)
    );
    return () => unsub();
  }, []);

  // 5. Listen to system_config/accounting_links
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'system_config', 'accounting_links'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const merged = { ...DEFAULT_ACCOUNTING_LINKS };
          Object.keys(DEFAULT_ACCOUNTING_LINKS).forEach((k) => {
            if (data[k]) merged[k] = { ...DEFAULT_ACCOUNTING_LINKS[k], ...data[k] };
          });
          setAccountingLinks(merged);
        } else {
          setAccountingLinks(DEFAULT_ACCOUNTING_LINKS);
        }
      },
      (err) => console.error('Error listening to accounting_links:', err)
    );
    return () => unsub();
  }, []);

  // 6. Listen to cash_safes and system_config/cost_centers
  useEffect(() => {
    const unsubSafes = onSnapshot(
      collection(db, 'cash_safes'),
      (snapshot) => {
        setSafesList(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      },
      (err) => console.error('Error listening to cash_safes:', err)
    );
    const unsubCC = onSnapshot(
      doc(db, 'system_config', 'cost_centers'),
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.items)) {
          setCustomCostCenters(snap.data().items);
        }
      },
      () => {}
    );
    return () => {
      unsubSafes();
      unsubCC();
    };
  }, []);

  // Set default dates when preset changes
  useEffect(() => {
    const now = new Date();
    const y = parseInt(selectedYear, 10) || now.getFullYear();

    if (periodPreset === 'all') {
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-12-31`);
    } else if (periodPreset === 'ytd') {
      setStartDate(`${y}-01-01`);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setEndDate(`${y}-${month}-${day}`);
    } else if (periodPreset === 'q1') {
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-03-31`);
    } else if (periodPreset === 'q2') {
      setStartDate(`${y}-04-01`);
      setEndDate(`${y}-06-30`);
    } else if (periodPreset === 'q3') {
      setStartDate(`${y}-07-01`);
      setEndDate(`${y}-09-30`);
    } else if (periodPreset === 'q4') {
      setStartDate(`${y}-10-01`);
      setEndDate(`${y}-12-31`);
    } else if (periodPreset === 'this_month') {
      const month = String(now.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${month}-01`);
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setEndDate(`${y}-${month}-${String(lastDay).padStart(2, '0')}`);
    } else if (periodPreset === 'last_month') {
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? y - 1 : y;
      const mStr = String(prevMonth + 1).padStart(2, '0');
      setStartDate(`${prevYear}-${mStr}-01`);
      const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
      setEndDate(`${prevYear}-${mStr}-${String(lastDay).padStart(2, '0')}`);
    }
  }, [periodPreset, selectedYear]);

  // Complete COA Hierarchy Map (parent-child links, levels, displayOrder)
  const hierarchyMap = useMemo(() => {
    return buildAccountHierarchyMap(accountsList);
  }, [accountsList]);

  // Fast Lookup Map for GRNs
  const receiptsMap = useMemo(() => {
    const map = new Map();
    receiptsList.forEach((r) => {
      if (r.id) map.set(r.id, r);
    });
    return map;
  }, [receiptsList]);

  // Helper to extract normalized YYYY-MM-DD date from any transaction or journal entry
  const resolveDocDate = (docObj) => {
    const raw = docObj?.entryDate || docObj?.date || docObj?.createdAt || '';
    return typeof raw === 'string' ? raw.slice(0, 10) : '';
  };

  // Scope-Filtered & Posted-Only Cash Transactions and Journal Entries (Before Date Split)
  const scopedPostedData = useMemo(() => {
    const validCashTxs = transactionsList.filter((tx) => {
      if (tx.status === 'reversed' || tx.status === 'pending_approval' || tx.status === 'rejected') return false;
      if (tx.status && tx.status !== 'posted') return false;
      if (activeLedgerMode === LEDGER_MODES.OFFICIAL && !isTransactionTaxOfficial(tx)) return false;
      if (selectedCostCenter !== 'all' && tx.costCenterId !== selectedCostCenter) return false;
      if (selectedSafe !== 'all' && tx.safeId !== selectedSafe) return false;
      return true;
    });

    const validJournalEntries = journalEntriesList
      .map((je) => {
        const sourceGrnId = je.sourceDocId || String(je.id || '').replace('JE-REV-', '').replace('JE-', '');
        const sourceGrn = receiptsMap.get(sourceGrnId);
        return {
          ...je,
          isTaxOfficial: Boolean(je.isTaxOfficial !== undefined ? je.isTaxOfficial : sourceGrn?.isTaxOfficial),
          taxInvoiceNumber: je.taxInvoiceNumber || sourceGrn?.taxInvoiceNumber || ''
        };
      })
      .filter((je) => {
        if (je.status === 'reversed' || je.isReversed === true) return false;
        if (je.status && je.status !== 'posted') return false;
        if (activeLedgerMode === LEDGER_MODES.OFFICIAL && !isTransactionTaxOfficial(je)) return false;
        if (selectedCostCenter !== 'all' && je.costCenterId && je.costCenterId !== selectedCostCenter) return false;
        return true;
      });

    return { validCashTxs, validJournalEntries };
  }, [transactionsList, journalEntriesList, receiptsMap, activeLedgerMode, selectedCostCenter, selectedSafe]);

  // Core Double-Entry Balance Accumulator across 3 Horizons:
  // 1) priorBalancesMap (date < startDate)
  // 2) periodBalancesMap (startDate <= date <= endDate) -> Income Statement
  // 3) cumulativeBalancesMap (date <= endDate) -> Balance Sheet
  const {
    priorBalancesMap,
    periodBalancesMap,
    cumulativeBalancesMap,
    periodCashTxs,
    priorCashTxs,
    periodJournalEntries
  } = useMemo(() => {
    const priorMap = {};
    const periodMap = {};
    const cumulativeMap = {};

    const pCashTxs = [];
    const prCashTxs = [];
    const pJournalEntries = [];

    const ensureSlot = (targetMap, code) => {
      if (!targetMap[code]) {
        targetMap[code] = { debit: 0, credit: 0, transactions: [] };
      }
      return targetMap[code];
    };

    const postDoubleEntryCashTx = (targetMap, tx, legs, amt, isOut, txDate) => {
      const { mainAccountCode, mainAccountNameAr, counterAccountCode, counterAccountNameAr, isTransfer } = legs;
      const drillEntry = {
        id: tx.id,
        voucherNumber: tx.voucherNumber || tx.id,
        date: txDate,
        safeName: tx.safeName || tx.bankAccountNameAr || tx.safeId || (isAr ? 'الخزينة' : 'Safe'),
        type: tx.typeAr || tx.type || (isOut ? 'disbursement' : 'collection'),
        direction: isOut ? 'out' : 'in',
        description: tx.description || tx.notes || mainAccountNameAr || '-',
        amount: amt
      };

      if (isTransfer) {
        const slot = ensureSlot(targetMap, counterAccountCode);
        slot.debit += amt;
        slot.credit += amt;
        slot.transactions.push(drillEntry);
        return;
      }

      if (isOut) {
        if (mainAccountCode) {
          const mainSlot = ensureSlot(targetMap, mainAccountCode);
          mainSlot.debit += amt;
          mainSlot.transactions.push({ ...drillEntry, legNature: 'debit', accountCode: mainAccountCode });
        }
        if (counterAccountCode) {
          const counterSlot = ensureSlot(targetMap, counterAccountCode);
          counterSlot.credit += amt;
          counterSlot.transactions.push({ ...drillEntry, legNature: 'credit', accountCode: counterAccountCode, description: `${drillEntry.description} (${counterAccountNameAr})` });
        }
      } else {
        if (counterAccountCode) {
          const counterSlot = ensureSlot(targetMap, counterAccountCode);
          counterSlot.debit += amt;
          counterSlot.transactions.push({ ...drillEntry, legNature: 'debit', accountCode: counterAccountCode, description: `${drillEntry.description} (${counterAccountNameAr})` });
        }
        if (mainAccountCode) {
          const mainSlot = ensureSlot(targetMap, mainAccountCode);
          mainSlot.credit += amt;
          mainSlot.transactions.push({ ...drillEntry, legNature: 'credit', accountCode: mainAccountCode });
        }
      }
    };

    // 1. Process Scoped Posted Cash Vouchers
    scopedPostedData.validCashTxs.forEach((tx) => {
      const txDate = resolveDocDate(tx);
      if (endDate && txDate > endDate) return;

      const amt = Number(tx.amountInEGP) || Number(tx.amount) || 0;
      if (amt <= 0) return;

      const isOut = tx.direction
        ? tx.direction === 'out'
        : !(tx.type === 'cash_in' || tx.type === 'collection' || tx.type === 'transfer_in' || tx.type === 'advance_settle' || tx.type === 'custody_settle');

      const normalizedTx = {
        ...tx,
        mainAccount: tx.mainAccount || tx.generalLedgerId || '',
        subAccountId: tx.subAccountId || tx.subLedgerId || ''
      };
      const legs = resolveCashTransactionPostingLegs(normalizedTx, accountingLinks, hierarchyMap);

      // Always post to cumulative (date <= endDate)
      postDoubleEntryCashTx(cumulativeMap, tx, legs, amt, isOut, txDate);

      if (startDate && txDate < startDate) {
        postDoubleEntryCashTx(priorMap, tx, legs, amt, isOut, txDate);
        prCashTxs.push({ ...tx, resolvedLegs: legs, resolvedAmount: amt, resolvedIsOut: isOut, resolvedDate: txDate });
      } else {
        postDoubleEntryCashTx(periodMap, tx, legs, amt, isOut, txDate);
        pCashTxs.push({ ...tx, resolvedLegs: legs, resolvedAmount: amt, resolvedIsOut: isOut, resolvedDate: txDate });
      }
    });

    // 2. Process Scoped Posted Journal Entries
    const postJournalEntryLines = (targetMap, je, jeDate) => {
      const lines = Array.isArray(je.lines) ? je.lines : [];
      lines.forEach((line, idx) => {
        if (selectedCostCenter !== 'all' && line.costCenterId && line.costCenterId !== selectedCostCenter) return;
        const code = String(line.accountCode || '').trim();
        if (!code) return;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (debit === 0 && credit === 0) return;

        const slot = ensureSlot(targetMap, code);
        slot.debit += debit;
        slot.credit += credit;
        slot.transactions.push({
          id: `${je.id}-${idx}`,
          voucherNumber: je.entryNumber || je.id,
          date: jeDate,
          safeName: isAr ? 'قيد يومية استحقاق (GL)' : 'General Journal (GL)',
          type: je.sourceDocType === 'goods_receipt' || je.sourceModule === 'procurement'
            ? (isAr ? 'استحقاق توريد مخزني' : 'GRN Accrual')
            : (isAr ? 'قيد يومية' : 'Journal Entry'),
          direction: debit > 0 ? 'out' : 'in',
          description: line.notes || line.description || je.descriptionAr || je.description || line.accountNameAr || '-',
          amount: debit > 0 ? debit : credit,
          debit,
          credit,
          isJournalEntry: true
        });
      });
    };

    scopedPostedData.validJournalEntries.forEach((je) => {
      const jeDate = resolveDocDate(je);
      if (endDate && jeDate > endDate) return;

      // Always post to cumulative (date <= endDate)
      postJournalEntryLines(cumulativeMap, je, jeDate);

      if (startDate && jeDate < startDate) {
        postJournalEntryLines(priorMap, je, jeDate);
      } else {
        postJournalEntryLines(periodMap, je, jeDate);
        pJournalEntries.push(je);
      }
    });

    return {
      priorBalancesMap: priorMap,
      periodBalancesMap: periodMap,
      cumulativeBalancesMap: cumulativeMap,
      periodCashTxs: pCashTxs,
      priorCashTxs: prCashTxs,
      periodJournalEntries: pJournalEntries
    };
  }, [scopedPostedData, startDate, endDate, accountingLinks, hierarchyMap, selectedCostCenter, isAr]);

  // Helper to filter rolled-up section items by searchQuery if entered
  const filterItemsBySearch = (items = []) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const str = `${item.code} ${item.nameAr || ''} ${item.nameEn || ''} ${item.descriptionAr || ''}`.toLowerCase();
      return str.includes(q);
    });
  };

  // Helper to compute Net Income for any balances map strictly from COA setup
  const computeNetIncomeForMap = (balancesMap) => {
    const rev = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'operating_revenue',
      hierarchyMap,
      rawBalancesMap: balancesMap,
      maxDisplayLevel: 'summary',
      showZeroBalances: false
    }).total;
    const cogs = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'cogs_direct',
      hierarchyMap,
      rawBalancesMap: balancesMap,
      maxDisplayLevel: 'summary',
      showZeroBalances: false
    }).total;
    const selling = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'selling_expense',
      hierarchyMap,
      rawBalancesMap: balancesMap,
      maxDisplayLevel: 'summary',
      showZeroBalances: false
    }).total;
    const admin = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'admin_expense',
      hierarchyMap,
      rawBalancesMap: balancesMap,
      maxDisplayLevel: 'summary',
      showZeroBalances: false
    }).total;
    const financing = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'financing_expense',
      hierarchyMap,
      rawBalancesMap: balancesMap,
      maxDisplayLevel: 'summary',
      showZeroBalances: false
    }).total;
    const other = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'other_revenue_expense',
      hierarchyMap,
      rawBalancesMap: balancesMap,
      maxDisplayLevel: 'summary',
      showZeroBalances: false
    }).total;

    return rev - cogs - selling - admin - financing + other;
  };

  // --------------------------------------------------------------------------
  // FINANCIAL STATEMENT 1: INCOME STATEMENT (قائمة الدخل — 100% Setup-Driven)
  // --------------------------------------------------------------------------
  const incomeStatementData = useMemo(() => {
    const mapItemProps = (sec) =>
      filterItemsBySearch(sec.items).map((item) => ({
        ...item,
        amount: item.balance,
        txs: item.transactions || []
      }));

    const revSec = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'operating_revenue',
      hierarchyMap,
      rawBalancesMap: periodBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const cogsSec = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'cogs_direct',
      hierarchyMap,
      rawBalancesMap: periodBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const sellingSec = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'selling_expense',
      hierarchyMap,
      rawBalancesMap: periodBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const adminSec = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'admin_expense',
      hierarchyMap,
      rawBalancesMap: periodBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const financingSec = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'financing_expense',
      hierarchyMap,
      rawBalancesMap: periodBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const otherSec = computeRollupSectionItems({
      statementId: 'income_statement',
      categoryId: 'other_revenue_expense',
      hierarchyMap,
      rawBalancesMap: periodBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const totalRevenue = revSec.total;
    const totalCogs = cogsSec.total;
    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPct = totalRevenue !== 0 ? ((grossProfit / Math.abs(totalRevenue)) * 100).toFixed(1) : '0.0';

    const totalSelling = sellingSec.total;
    const totalAdmin = adminSec.total;
    const totalFinancing = financingSec.total;
    const totalOpex = totalSelling + totalAdmin + totalFinancing;
    const operatingProfit = grossProfit - totalOpex;
    const operatingMarginPct = totalRevenue !== 0 ? ((operatingProfit / Math.abs(totalRevenue)) * 100).toFixed(1) : '0.0';

    const totalOther = otherSec.total;
    const netProfit = operatingProfit + totalOther;
    const netProfitMarginPct = totalRevenue !== 0 ? ((netProfit / Math.abs(totalRevenue)) * 100).toFixed(1) : '0.0';

    return {
      revenueItems: mapItemProps(revSec),
      revenuesItems: mapItemProps(revSec),
      totalRevenue,
      totalRevenues: totalRevenue,
      cogsItems: mapItemProps(cogsSec),
      totalCogs,
      grossProfit,
      grossMarginPct,
      sellingItems: mapItemProps(sellingSec),
      sellingExpensesItems: mapItemProps(sellingSec),
      totalSelling,
      totalSellingExpenses: totalSelling,
      adminItems: mapItemProps(adminSec),
      adminExpensesItems: mapItemProps(adminSec),
      totalAdmin,
      totalAdminExpenses: totalAdmin,
      financingItems: mapItemProps(financingSec),
      financingExpensesItems: mapItemProps(financingSec),
      totalFinancing,
      totalOpex,
      operatingProfit,
      ebit: operatingProfit,
      operatingMarginPct,
      otherItems: mapItemProps(otherSec),
      otherRevExpItems: mapItemProps(otherSec),
      totalOther,
      otherNet: totalOther,
      netProfit,
      netIncome: netProfit,
      netProfitMarginPct,
      netMargin: Number(netProfitMarginPct),
      // Aliases for Print Slip compatibility
      revenues: mapItemProps(revSec),
      cogs: mapItemProps(cogsSec),
      sellingExpenses: mapItemProps(sellingSec),
      adminExpenses: mapItemProps(adminSec),
      financingExpenses: mapItemProps(financingSec),
      otherExpenses: mapItemProps(otherSec),
      totalOtherExpenses: totalOther
    };
  }, [hierarchyMap, periodBalancesMap, displayLevel, showZeroBalances, searchQuery]);

  // --------------------------------------------------------------------------
  // FINANCIAL STATEMENT 2: BALANCE SHEET (الميزانية العمومية — 100% Setup-Driven & Cumulative)
  // --------------------------------------------------------------------------
  const balanceSheetData = useMemo(() => {
    const mapItemProps = (sec) =>
      filterItemsBySearch(sec.items).map((item) => ({
        ...item,
        amount: item.balance,
        txs: item.transactions || []
      }));

    const currentAssetSec = computeRollupSectionItems({
      statementId: 'balance_sheet',
      categoryId: 'current_asset',
      hierarchyMap,
      rawBalancesMap: cumulativeBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const fixedAssetSec = computeRollupSectionItems({
      statementId: 'balance_sheet',
      categoryId: 'fixed_asset',
      hierarchyMap,
      rawBalancesMap: cumulativeBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const currentLiabSec = computeRollupSectionItems({
      statementId: 'balance_sheet',
      categoryId: 'current_liability',
      hierarchyMap,
      rawBalancesMap: cumulativeBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const longTermLiabSec = computeRollupSectionItems({
      statementId: 'balance_sheet',
      categoryId: 'long_term_liability',
      hierarchyMap,
      rawBalancesMap: cumulativeBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    // 1. Resolve dynamic Balance Sheet equity rollover accounts (Zero-Hardcoding Hybrid)
    const { currentYearEarningsCode, retainedEarningsCode } = resolveEquityRolloverAccountCodes(
      accountingLinks,
      hierarchyMap
    );

    const priorRetainedNetIncome = computeNetIncomeForMap(priorBalancesMap);
    const periodNetIncome = incomeStatementData.netProfit;

    // 2. Build Balance Sheet working balances map that organically attributes period & prior net income to the designated accounts
    const bsBalancesMap = {};
    Object.keys(cumulativeBalancesMap).forEach((code) => {
      bsBalancesMap[code] = {
        ...cumulativeBalancesMap[code],
        transactions: [...(cumulativeBalancesMap[code]?.transactions || [])]
      };
    });

    // Attribute Current Period Net Income to designated account (e.g., 20103)
    if (!bsBalancesMap[currentYearEarningsCode]) {
      bsBalancesMap[currentYearEarningsCode] = { debit: 0, credit: 0, transactions: [] };
    }
    if (Math.abs(periodNetIncome) >= 0.005) {
      if (periodNetIncome >= 0) {
        bsBalancesMap[currentYearEarningsCode].credit += periodNetIncome;
      } else {
        bsBalancesMap[currentYearEarningsCode].debit += Math.abs(periodNetIncome);
      }
      bsBalancesMap[currentYearEarningsCode].transactions = [
        {
          id: 'ROLLED_PERIOD_NET_INCOME',
          voucherNumber: isAr ? 'ترحيل قائمة الدخل' : 'P&L Rollover',
          date: endDate,
          safeName: isAr ? 'قائمة الدخل' : 'Income Statement',
          type: isAr ? 'صافي ربح / (خسارة) الفترة' : 'Period Net Profit / (Loss)',
          direction: periodNetIncome >= 0 ? 'in' : 'out',
          description: isAr
            ? `صافي أرباح / (خسائر) الفترة من ${startDate} إلى ${endDate} مرحل آلياً من قائمة الدخل`
            : `Net Income / (Loss) for period ${startDate} to ${endDate} rolled from Income Statement`,
          amount: Math.abs(periodNetIncome),
          isIncomeStatementRolled: true
        },
        ...bsBalancesMap[currentYearEarningsCode].transactions
      ];
    }

    // Attribute Prior Periods Retained Net Income to designated account (e.g., 20102)
    if (!bsBalancesMap[retainedEarningsCode]) {
      bsBalancesMap[retainedEarningsCode] = { debit: 0, credit: 0, transactions: [] };
    }
    if (Math.abs(priorRetainedNetIncome) >= 0.005) {
      if (priorRetainedNetIncome >= 0) {
        bsBalancesMap[retainedEarningsCode].credit += priorRetainedNetIncome;
      } else {
        bsBalancesMap[retainedEarningsCode].debit += Math.abs(priorRetainedNetIncome);
      }
      bsBalancesMap[retainedEarningsCode].transactions = [
        {
          id: 'ROLLED_PRIOR_RETAINED_EARNINGS',
          voucherNumber: isAr ? 'أرباح مرحلة سابقة' : 'Prior Retained Earnings',
          date: startDate,
          safeName: isAr ? 'فترات سابقة' : 'Prior Periods',
          type: isAr ? 'أرباح / (خسائر) مرحلة' : 'Retained Earnings',
          direction: priorRetainedNetIncome >= 0 ? 'in' : 'out',
          description: isAr
            ? `صافي أرباح / (خسائر) مرحلة من فترات سابقة قبل ${startDate}`
            : `Retained net income / (loss) from prior periods before ${startDate}`,
          amount: Math.abs(priorRetainedNetIncome),
          isPriorRetainedRolled: true
        },
        ...bsBalancesMap[retainedEarningsCode].transactions
      ];
    }

    const equitySec = computeRollupSectionItems({
      statementId: 'balance_sheet',
      categoryId: 'equity',
      hierarchyMap,
      rawBalancesMap: bsBalancesMap,
      maxDisplayLevel: displayLevel,
      showZeroBalances
    });

    const totalCurrentAssets = currentAssetSec.total;
    const totalFixedAssets = fixedAssetSec.total;
    const totalAssets = totalCurrentAssets + totalFixedAssets;

    const totalCurrentLiabilities = currentLiabSec.total;
    const totalLongTermLiabilities = longTermLiabSec.total;
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

    const baseEquity = equitySec.total;
    const totalEquity = equitySec.total;

    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const balanceDifference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = balanceDifference < 0.05;

    return {
      currentAssetItems: mapItemProps(currentAssetSec),
      totalCurrentAssets,
      fixedAssetItems: mapItemProps(fixedAssetSec),
      totalFixedAssets,
      totalAssets,
      currentLiabilityItems: mapItemProps(currentLiabSec),
      totalCurrentLiabilities,
      longTermLiabilityItems: mapItemProps(longTermLiabSec),
      totalLongTermLiabilities,
      totalLiabilities,
      equityItems: mapItemProps(equitySec),
      baseEquity,
      priorRetainedNetIncome,
      periodNetIncome,
      currentYearEarningsCode,
      retainedEarningsCode,
      totalEquity,
      totalLiabilitiesAndEquity,
      balanceDifference,
      isBalanced,
      // Aliases for Print Slip compatibility
      currentAssets: mapItemProps(currentAssetSec),
      fixedAssets: mapItemProps(fixedAssetSec),
      currentLiabilities: mapItemProps(currentLiabSec),
      longTermLiabilities: mapItemProps(longTermLiabSec),
      equity: mapItemProps(equitySec),
      retainedEarnings: priorRetainedNetIncome + periodNetIncome
    };
  }, [
    hierarchyMap,
    cumulativeBalancesMap,
    priorBalancesMap,
    incomeStatementData.netProfit,
    accountingLinks,
    displayLevel,
    showZeroBalances,
    searchQuery,
    isAr,
    startDate,
    endDate
  ]);

  // --------------------------------------------------------------------------
  // FINANCIAL STATEMENT 3: STATEMENT OF CASH FLOWS (قائمة التدفقات النقدية — Setup & Scope Driven)
  // --------------------------------------------------------------------------
  const cashFlowData = useMemo(() => {
    let operatingInflows = 0;
    let operatingOutflows = 0;
    const operatingItems = [];

    let investingInflows = 0;
    let investingOutflows = 0;
    const investingItems = [];

    let financingInflows = 0;
    let financingOutflows = 0;
    const financingItems = [];

    // Beginning Cash from prior scoped transactions (< startDate)
    let beginningCash = 0;
    priorCashTxs.forEach((tx) => {
      if (tx.resolvedLegs?.isTransfer) return;
      if (tx.resolvedIsOut) beginningCash -= tx.resolvedAmount;
      else beginningCash += tx.resolvedAmount;
    });

    // Period Cash Flows (startDate <= date <= endDate) classified by account setup
    periodCashTxs.forEach((tx) => {
      if (tx.resolvedLegs?.isTransfer) return;
      const amount = tx.resolvedAmount;
      const isCashIn = !tx.resolvedIsOut;
      const matchedAcc = hierarchyMap.get(tx.resolvedLegs?.mainAccountCode);
      const cat = matchedAcc?.cashFlowCategory || tx.cashFlowCategory || 'operating';

      const drillTx = {
        id: tx.id,
        voucherNumber: tx.voucherNumber || tx.id,
        date: tx.resolvedDate,
        safeName: tx.safeName || tx.bankAccountNameAr || tx.safeId || '-',
        type: tx.typeAr || tx.type || (isCashIn ? 'collection' : 'disbursement'),
        direction: isCashIn ? 'in' : 'out',
        description: tx.description || matchedAcc?.nameAr || '-',
        amount,
        flowType: isCashIn ? 'inflow' : 'outflow'
      };

      if (cat === 'investing') {
        if (isCashIn) investingInflows += amount;
        else investingOutflows += amount;
        investingItems.push(drillTx);
      } else if (cat === 'financing') {
        if (isCashIn) financingInflows += amount;
        else financingOutflows += amount;
        financingItems.push(drillTx);
      } else {
        if (isCashIn) operatingInflows += amount;
        else operatingOutflows += amount;
        operatingItems.push(drillTx);
      }
    });

    const netOperatingCash = operatingInflows - operatingOutflows;
    const netInvestingCash = investingInflows - investingOutflows;
    const netFinancingCash = financingInflows - financingOutflows;
    const netChangeInCash = netOperatingCash + netInvestingCash + netFinancingCash;
    const endingCash = beginningCash + netChangeInCash;

    return {
      operatingInflows,
      operatingOutflows,
      netOperatingCash,
      operatingItems,
      investingInflows,
      investingOutflows,
      netInvestingCash,
      investingItems,
      financingInflows,
      financingOutflows,
      netFinancingCash,
      financingItems,
      netChangeInCash,
      beginningCash,
      endingCash,
      // Aliases for Print Slip compatibility
      operatingCashFlow: netOperatingCash,
      investingCashFlow: netInvestingCash,
      financingCashFlow: netFinancingCash,
      openingCashBalance: beginningCash,
      closingCashBalance: endingCash
    };
  }, [periodCashTxs, priorCashTxs, hierarchyMap]);

  // --------------------------------------------------------------------------
  // FINANCIAL STATEMENT 4: COST CENTER PERFORMANCE (تحليل مراكز التكلفة — Setup-Driven)
  // --------------------------------------------------------------------------
  const costCenterData = useMemo(() => {
    const centers = {
      'CC-PROD-01': {
        id: 'CC-PROD-01',
        nameAr: 'خط الإنتاج والتصنيع 1',
        nameEn: 'Production Line 1',
        icon: Factory,
        color: 'emerald',
        revenue: 0,
        directCosts: 0,
        opex: 0,
        txCount: 0,
        txs: []
      },
      'CC-PROD-02': {
        id: 'CC-PROD-02',
        nameAr: 'خط الإنتاج والتصنيع 2',
        nameEn: 'Production Line 2',
        icon: Factory,
        color: 'teal',
        revenue: 0,
        directCosts: 0,
        opex: 0,
        txCount: 0,
        txs: []
      },
      'CC-FLEET': {
        id: 'CC-FLEET',
        nameAr: 'أسطول النقل واللوجستيات',
        nameEn: 'Logistics & Transport Fleet',
        icon: Truck,
        color: 'blue',
        revenue: 0,
        directCosts: 0,
        opex: 0,
        txCount: 0,
        txs: []
      },
      'CC-MAINT': {
        id: 'CC-MAINT',
        nameAr: 'ورشة الصيانة وقطع الغيار',
        nameEn: 'Maintenance Workshop',
        icon: Wrench,
        color: 'amber',
        revenue: 0,
        directCosts: 0,
        opex: 0,
        txCount: 0,
        txs: []
      },
      'CC-ADMIN': {
        id: 'CC-ADMIN',
        nameAr: 'الإدارة العامة للمصنع',
        nameEn: 'Factory Administration',
        icon: Briefcase,
        color: 'purple',
        revenue: 0,
        directCosts: 0,
        opex: 0,
        txCount: 0,
        txs: []
      },
      'CC-GENERAL': {
        id: 'CC-GENERAL',
        nameAr: 'عام / غير مخصص',
        nameEn: 'General / Unallocated',
        icon: Building2,
        color: 'gray',
        revenue: 0,
        directCosts: 0,
        opex: 0,
        txCount: 0,
        txs: []
      }
    };

    customCostCenters.forEach((cc) => {
      if (cc.id && !centers[cc.id]) {
        centers[cc.id] = {
          id: cc.id,
          nameAr: cc.nameAr || cc.name || cc.id,
          nameEn: cc.nameEn || cc.name || cc.id,
          icon: Building2,
          color: 'indigo',
          revenue: 0,
          directCosts: 0,
          opex: 0,
          txCount: 0,
          txs: []
        };
      }
    });

    const routeAccountToCostCenterBucket = (targetCenter, accObj, amount) => {
      if (!accObj || accObj.statement !== 'income_statement') return;
      const cat = accObj.reportCategory;
      const sign = accObj.statementEffect === 'deduct' ? -1 : 1;
      if (cat === 'operating_revenue' || cat === 'other_revenue_expense') {
        targetCenter.revenue += sign * amount;
      } else if (cat === 'cogs_direct') {
        targetCenter.directCosts += sign * amount;
      } else if (['selling_expense', 'admin_expense', 'financing_expense'].includes(cat)) {
        targetCenter.opex += sign * amount;
      }
    };

    periodCashTxs.forEach((tx) => {
      const cId = tx.costCenterId || 'CC-GENERAL';
      const target = centers[cId] || centers['CC-GENERAL'];
      const accObj = hierarchyMap.get(tx.resolvedLegs?.mainAccountCode);
      if (!accObj || accObj.statement !== 'income_statement') return;

      target.txCount += 1;
      target.txs.push({
        id: tx.id,
        voucherNumber: tx.voucherNumber || tx.id,
        date: tx.resolvedDate,
        safeName: tx.safeName || tx.safeId || '-',
        type: tx.typeAr || tx.type,
        direction: tx.resolvedIsOut ? 'out' : 'in',
        description: tx.description || accObj.nameAr,
        amount: tx.resolvedAmount
      });
      routeAccountToCostCenterBucket(target, accObj, tx.resolvedAmount);
    });

    periodJournalEntries.forEach((je) => {
      const jeDate = resolveDocDate(je);
      (je.lines || []).forEach((line, idx) => {
        const accObj = hierarchyMap.get(String(line.accountCode || '').trim());
        if (!accObj || accObj.statement !== 'income_statement') return;
        const cId = line.costCenterId || je.costCenterId || 'CC-GENERAL';
        const target = centers[cId] || centers['CC-GENERAL'];
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        const naturalAmt = accObj.nature === 'debit' ? (debit - credit) : (credit - debit);
        if (Math.abs(naturalAmt) < 0.005) return;

        target.txCount += 1;
        target.txs.push({
          id: `${je.id}-${idx}`,
          voucherNumber: je.entryNumber || je.id,
          date: jeDate,
          safeName: isAr ? 'قيد يومية (GL)' : 'Journal Entry',
          type: isAr ? 'قيد استحقاق' : 'Accrual JE',
          direction: debit > 0 ? 'out' : 'in',
          description: line.notes || line.description || je.descriptionAr || accObj.nameAr,
          amount: Math.abs(naturalAmt)
        });
        routeAccountToCostCenterBucket(target, accObj, naturalAmt);
      });
    });

    return Object.values(centers).map((c) => {
      const margin = c.revenue - (c.directCosts + c.opex);
      const marginPct = c.revenue > 0 ? ((margin / c.revenue) * 100).toFixed(1) : '0.0';
      return {
        ...c,
        margin,
        marginPct
      };
    });
  }, [periodCashTxs, periodJournalEntries, hierarchyMap, customCostCenters, isAr]);

  // Drilldown Click Handler
  const openDrilldown = (titleAr, titleEn, txs = []) => {
    setDrilldownModal({
      isOpen: true,
      titleAr,
      titleEn,
      transactions: txs
    });
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    let csvContent = '\uFEFF';
    const scopeLabel = activeLedgerMode === LEDGER_MODES.MASTER
      ? (isAr ? 'مجمع شامل (Consolidated)' : 'Consolidated')
      : (isAr ? 'قياسي معتمد (Standard)' : 'Standard');
    const headerTitle =
      activeTab === 'income_statement'
        ? (isAr ? 'قائمة الدخل والأرباح والخسائر' : 'Income Statement (P&L)')
        : activeTab === 'balance_sheet'
        ? (isAr ? 'الميزانية العمومية والمركز المالي (عرض رأسي)' : 'Vertical Balance Sheet')
        : activeTab === 'cash_flow'
        ? (isAr ? 'قائمة التدفقات النقدية' : 'Statement of Cash Flows')
        : (isAr ? 'تقرير أداء مراكز التكلفة' : 'Cost Center Performance');

    const companyDisplayName = isAr
      ? (companyProfile.tradeNameAr || companyProfile.legalName)
      : (companyProfile.tradeNameEn || companyProfile.legalName);
    csvContent += `"${headerTitle} (${scopeLabel}) - ${companyDisplayName}"\n`;
    csvContent += `"${isAr ? 'الفترة من' : 'Period from'}: ${startDate} ${isAr ? 'إلى' : 'to'} ${endDate} | ${isAr ? 'مستوى العرض' : 'Display Level'}: ${displayLevel}"\n\n`;

    if (activeTab === 'income_statement') {
      csvContent += `"${isAr ? 'البند' : 'Item'}","${isAr ? 'الكود' : 'Code'}","${isAr ? 'المستوى' : 'Level'}","${isAr ? 'التصنيف' : 'Category'}","${isAr ? 'التأثير' : 'Effect'}","${isAr ? 'القيمة (ج.م)' : 'Amount (EGP)'}"\n`;
      const appendRows = (items, catLabel) => {
        items.forEach((r) => {
          if (r.isGroupParent) return;
          csvContent += `"${isAr ? r.nameAr : r.nameEn}","${r.code}","L${r.level || 1}","${catLabel}","${r.isContra ? '(-)' : '(+)'}","${r.amount}"\n`;
        });
      };
      appendRows(incomeStatementData.revenueItems, isAr ? 'إيرادات النشاط' : 'Operating Revenue');
      csvContent += `"${isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}","","","","","${incomeStatementData.totalRevenue}"\n`;
      appendRows(incomeStatementData.cogsItems, isAr ? 'تكلفة المبيعات' : 'COGS');
      csvContent += `"${isAr ? 'إجمالي تكلفة المبيعات' : 'Total COGS'}","","","","","${incomeStatementData.totalCogs}"\n`;
      csvContent += `"${isAr ? 'مجمل الربح' : 'Gross Profit'}","","","","","${incomeStatementData.grossProfit}"\n`;
      appendRows(incomeStatementData.sellingItems, isAr ? 'مصروفات بيعية' : 'Selling Expenses');
      appendRows(incomeStatementData.adminItems, isAr ? 'مصروفات إدارية' : 'Admin Expenses');
      appendRows(incomeStatementData.financingItems, isAr ? 'مصروفات تمويلية' : 'Financing Expenses');
      csvContent += `"${isAr ? 'الربح التشغيلي (Operating Profit)' : 'Operating Profit'}","","","","","${incomeStatementData.operatingProfit}"\n`;
      appendRows(incomeStatementData.otherItems, isAr ? 'إيرادات/مصروفات أخرى' : 'Other Rev/Exp');
      csvContent += `"${isAr ? 'صافي ربح / (خسارة) الفترة' : 'Net Profit / (Loss)'}","","","","","${incomeStatementData.netProfit}"\n`;
    } else if (activeTab === 'balance_sheet') {
      csvContent += `"${isAr ? 'البند' : 'Item'}","${isAr ? 'الكود' : 'Code'}","${isAr ? 'المستوى' : 'Level'}","${isAr ? 'التصنيف' : 'Category'}","${isAr ? 'التأثير' : 'Effect'}","${isAr ? 'القيمة (ج.م)' : 'Amount (EGP)'}"\n`;
      const appendRows = (items, catLabel) => {
        items.forEach((r) => {
          if (r.isGroupParent) return;
          csvContent += `"${isAr ? r.nameAr : r.nameEn}","${r.code}","L${r.level || 1}","${catLabel}","${r.isContra ? '(-)' : '(+)'}","${r.amount}"\n`;
        });
      };
      appendRows(balanceSheetData.currentAssetItems, isAr ? 'أصول متداولة' : 'Current Assets');
      csvContent += `"${isAr ? 'إجمالي الأصول المتداولة' : 'Total Current Assets'}","","","","","${balanceSheetData.totalCurrentAssets}"\n`;
      appendRows(balanceSheetData.fixedAssetItems, isAr ? 'أصول غير متداولة' : 'Fixed Assets');
      csvContent += `"${isAr ? 'صافي الأصول الثابتة وغير المتداولة' : 'Net Fixed Assets'}","","","","","${balanceSheetData.totalFixedAssets}"\n`;
      csvContent += `"${isAr ? 'إجمالي الأصول' : 'Total Assets'}","","","","","${balanceSheetData.totalAssets}"\n`;
      appendRows(balanceSheetData.currentLiabilityItems, isAr ? 'التزامات متداولة' : 'Current Liabilities');
      csvContent += `"${isAr ? 'إجمالي الالتزامات المتداولة' : 'Total Current Liabilities'}","","","","","${balanceSheetData.totalCurrentLiabilities}"\n`;
      appendRows(balanceSheetData.longTermLiabilityItems, isAr ? 'التزامات طويلة الأجل' : 'Long-Term Liabilities');
      csvContent += `"${isAr ? 'إجمالي الالتزامات' : 'Total Liabilities'}","","","","","${balanceSheetData.totalLiabilities}"\n`;
      appendRows(balanceSheetData.equityItems, isAr ? 'حقوق الملكية' : 'Equity');
      csvContent += `"${isAr ? 'إجمالي حقوق الملكية' : 'Total Equity'}","","","","","${balanceSheetData.totalEquity}"\n`;
      csvContent += `"${isAr ? 'إجمالي الالتزامات وحقوق الملكية' : 'Total Liabilities & Equity'}","","","","","${balanceSheetData.totalLiabilitiesAndEquity}"\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `financial_statement_${activeTab}_${activeLedgerMode === 'master' ? 'consolidated' : 'standard'}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (val) => {
    return Number(val || 0).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Shared Renderer for Account Rows inside Income Statement & Vertical Balance Sheet
  const renderStatementAccountRows = (items = []) => {
    if (displayLevel === 'summary') return null;
    if (items.length === 0) {
      return (
        <tr>
          <td colSpan={5} className="py-3 px-6 text-center text-xs text-slate-400 italic">
            {isAr
              ? 'لا توجد حسابات ذات رصيد مسجل في هذا القسم خلال الفترة (فعّل "إظهار الحسابات الصفرية" لاستعراض كافة حسابات الدليل المربوطة بهذا القسم)'
              : 'No active balances in this section for the selected period (toggle "Show Zero-Balance Accounts" to inspect all configured accounts)'}
          </td>
        </tr>
      );
    }

    return items.map((item) => {
      const isContra = item.isContra || item.statementEffect === 'deduct';
      const isNegativeContribution = item.amount < -0.005;
      const absDisplayAmount = formatCurrency(Math.abs(item.amount));
      const indentPx = (Number(item.visualIndent) || 0) * 18;

      if (item.isGroupParent) {
        return (
          <tr key={`grp-${item.code}`} className="bg-slate-50/90 font-bold text-slate-800 border-t border-slate-200/70">
            <td className="py-2 px-4 ps-8" style={{ paddingInlineStart: `${32 + indentPx}px` }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] text-slate-600 bg-slate-200/80 px-1.5 py-0.5 rounded font-black">
                  {item.code}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-100 text-indigo-800">
                  L{item.level || 1}
                </span>
                <span>{isAr ? item.nameAr : (item.nameEn || item.nameAr)}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-600">
                  {isAr ? `مجموعة أب (${item.aggregatedChildrenCount} فرعي)` : `Parent Group (${item.aggregatedChildrenCount})`}
                </span>
              </div>
            </td>
            <td className="py-2 px-4 text-slate-500 text-[11px]">
              {isAr ? 'إجمالي تجميعي للحسابات الفرعية التابعة أدناه (غير مكرر في الجمع)' : 'Group subtotal of child accounts below'}
            </td>
            <td className="py-2 px-4 text-end font-mono text-xs text-slate-500 font-bold">
              {isNegativeContribution || isContra ? `(${absDisplayAmount})` : absDisplayAmount}
            </td>
            <td className="py-2 px-4 text-end text-slate-300">-</td>
            <td className="py-2 px-4 text-center">
              {item.txs?.length > 0 && (
                <button
                  type="button"
                  onClick={() => openDrilldown(item.nameAr, item.nameEn || item.nameAr, item.txs)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 inline" />
                </button>
              )}
            </td>
          </tr>
        );
      }

      return (
        <tr key={item.code} className="hover:bg-slate-50 text-slate-700 transition">
          <td className="py-2.5 px-4 ps-8" style={{ paddingInlineStart: `${32 + indentPx}px` }}>
            <div className="flex items-center gap-2 flex-wrap">
              {indentPx > 0 && <span className="text-slate-300 font-mono">└</span>}
              <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-bold">
                {item.code}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                L{item.level || 1}
              </span>
              <span className="font-bold text-slate-800">{isAr ? item.nameAr : (item.nameEn || item.nameAr)}</span>
              {isContra && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                  {isAr ? '(-) حساب عكسي يخصم' : '(-) Contra / Deduct'}
                </span>
              )}
              {item.aggregatedChildrenCount > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {isAr ? `شامل ${item.aggregatedChildrenCount} حساب فرعي` : `Includes ${item.aggregatedChildrenCount} sub-accounts`}
                </span>
              )}
              {item.txs?.some((t) => t.isIncomeStatementRolled) && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {isAr ? 'مرحل من قائمة الدخل' : 'Rolled from Income Statement'}
                </span>
              )}
              {item.txs?.some((t) => t.isPriorRetainedRolled) && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {isAr ? 'أرباح مرحلة سابقة' : 'Prior Retained'}
                </span>
              )}
            </div>
          </td>
          <td className="py-2.5 px-4 text-slate-500 text-xs">
            {isAr ? (item.descriptionAr || (item.nature === 'debit' ? 'طبيعة مدينة' : 'طبيعة دائنة')) : (item.descriptionEn || item.nature)}
          </td>
          <td className={`py-2.5 px-4 text-end font-mono font-bold ${
            isNegativeContribution || (isContra && Math.abs(item.amount) > 0) ? 'text-rose-700' : 'text-slate-800'
          }`}>
            {isNegativeContribution || (isContra && Math.abs(item.amount) > 0) ? `(${absDisplayAmount})` : absDisplayAmount}
          </td>
          <td className="py-2.5 px-4 text-end text-slate-300">-</td>
          <td className="py-2.5 px-4 text-center">
            <button
              type="button"
              onClick={() => openDrilldown(item.nameAr, item.nameEn || item.nameAr, item.txs)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
              title={isAr ? `عرض الحركات (${item.txs?.length || 0})` : `View Vouchers (${item.txs?.length || 0})`}
            >
              <Eye className="w-3.5 h-3.5 inline" />
            </button>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="space-y-4 text-start">
      {/* Scope, Actions & Reporting Controls Ribbon */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${
            activeLedgerMode === LEDGER_MODES.MASTER
              ? 'bg-amber-50 text-amber-900 border-amber-300'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            {activeLedgerMode === LEDGER_MODES.MASTER
              ? (isAr ? 'نطاق الدفاتر: مجمع شامل (Consolidated)' : 'Ledger Scope: Consolidated')
              : (isAr ? 'نطاق الدفاتر: قياسي رسمي (Standard)' : 'Ledger Scope: Standard Official')}
          </span>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            {isAr
              ? 'توجيه شجري 100% مستند إلى إعدادات الحسابات'
              : '100% setup-driven account placement'}
          </span>
        </div>

        {/* Functional Actions & Discreet Lock Access */}
        <div className="flex items-center gap-2 flex-wrap">
          <SecretLockButton
            isUnlocked={isMasterDoorUnlocked}
            activeMode={activeLedgerMode}
            onLongPress={() => setShowSecretDoorModal(true)}
            onLock={handleLockMaster}
            onToggleMode={handleToggleLedgerMode}
            isAr={isAr}
          />

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition cursor-pointer shadow-2xs"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'تصدير إكسيل (CSV)' : 'Export CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintSlip(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition cursor-pointer shadow-2xs active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>{isAr ? 'طباعة القائمة (A4)' : 'Print (A4)'}</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Advanced Filters & Hierarchy Level Control Bar */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-3 sm:p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* Year Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'السنة المالية' : 'Fiscal Year'}
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="2027">2027</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          {/* Period Presets */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'الفترة المحاسبية' : 'Accounting Period'}
            </label>
            <select
              value={periodPreset}
              onChange={(e) => setPeriodPreset(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{isAr ? 'كامل السنة المالية' : 'Full Fiscal Year'}</option>
              <option value="ytd">{isAr ? 'من بداية العام حتى اليوم (YTD)' : 'Year to Date (YTD)'}</option>
              <option value="q1">{isAr ? 'الربع الأول (Jan - Mar)' : 'Q1 (Jan - Mar)'}</option>
              <option value="q2">{isAr ? 'الربع الثاني (Apr - Jun)' : 'Q2 (Apr - Jun)'}</option>
              <option value="q3">{isAr ? 'الربع الثالث (Jul - Sep)' : 'Q3 (Jul - Sep)'}</option>
              <option value="q4">{isAr ? 'الربع الرابع (Oct - Dec)' : 'Q4 (Oct - Dec)'}</option>
              <option value="this_month">{isAr ? 'الشهر الحالي' : 'This Month'}</option>
              <option value="last_month">{isAr ? 'الشهر السابق' : 'Last Month'}</option>
              <option value="custom">{isAr ? 'تخصيص يدوي للتواريخ' : 'Custom Range'}</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'من تاريخ' : 'From Date'}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'إلى تاريخ' : 'To Date'}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* COA Hierarchy Display Level Selector */}
          <div>
            <label className="block text-[11px] font-extrabold text-indigo-900 mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-600" />
              <span>{isAr ? 'مستوى عرض شجرة الحسابات' : 'COA Display Level'}</span>
            </label>
            <select
              value={displayLevel}
              onChange={(e) => setDisplayLevel(e.target.value)}
              className="w-full text-xs bg-indigo-50/70 border border-indigo-200 rounded-xl px-2.5 py-1.5 text-indigo-950 font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="summary">{isAr ? 'ملخص الأقسام الرئيسية فقط' : 'Section Totals Only'}</option>
              <option value="2">{isAr ? 'المستوى ٢ — المجموعات العامة (L2)' : 'Level 2 — General Groups'}</option>
              <option value="3">{isAr ? 'المستوى ٣ — الحسابات المجمعة (L3 افتراضي)' : 'Level 3 — Consolidated Lines'}</option>
              <option value="4">{isAr ? 'المستوى ٤ — الحسابات التحليلية (L4)' : 'Level 4 — Analytical Sub-Accounts'}</option>
              <option value="all">{isAr ? 'كافة المستويات التفصيلية (شامل الفروع)' : 'All Levels (Full Tree)'}</option>
            </select>
          </div>

          {/* Cost Center Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'مركز التكلفة' : 'Cost Center'}
            </label>
            <select
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{isAr ? 'كافة المراكز' : 'All Cost Centers'}</option>
              <option value="CC-PROD-01">{isAr ? 'خط الإنتاج 1' : 'Production Line 1'}</option>
              <option value="CC-PROD-02">{isAr ? 'خط الإنتاج 2' : 'Production Line 2'}</option>
              <option value="CC-FLEET">{isAr ? 'أسطول النقل' : 'Transport Fleet'}</option>
              <option value="CC-MAINT">{isAr ? 'ورشة الصيانة' : 'Maintenance Workshop'}</option>
              <option value="CC-ADMIN">{isAr ? 'إدارة المصنع' : 'Factory Admin'}</option>
              {customCostCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>{isAr ? (cc.nameAr || cc.name) : (cc.nameEn || cc.name)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Control Row: Search, Safe Filter, Show Zero-Balance Accounts Toggle */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث بكود أو اسم الحساب داخل القائمة...' : 'Search by account code or name...'}
              className="w-full ps-8 pe-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Safe Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? 'الخزينة/البنك:' : 'Safe/Bank:'}</span>
              <select
                value={selectedSafe}
                onChange={(e) => setSelectedSafe(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-700 font-bold focus:outline-none"
              >
                <option value="all">{isAr ? 'الكل' : 'All'}</option>
                {safesList.map((safe) => (
                  <option key={safe.id} value={safe.id}>
                    {safe.nameAr || safe.name || safe.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Show Zero-Balance Accounts Toggle */}
            <label className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-bold cursor-pointer transition select-none ${
              showZeroBalances
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}>
              <input
                type="checkbox"
                checked={showZeroBalances}
                onChange={(e) => setShowZeroBalances(e.target.checked)}
                className="hidden"
              />
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{isAr ? 'إظهار الحسابات الصفرية (فحص هيكل الدليل)' : 'Show Zero-Balance Accounts'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. Sub-tab Navigation Dock */}
      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('income_statement')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeTab === 'income_statement'
              ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <TrendingUp className={`w-4 h-4 ${activeTab === 'income_statement' ? 'text-emerald-600' : 'text-slate-500'}`} />
          <span>{isAr ? '١. قائمة الدخل (الأرباح والخسائر)' : '1. Income Statement (P&L)'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('balance_sheet')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeTab === 'balance_sheet'
              ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Scale className={`w-4 h-4 ${activeTab === 'balance_sheet' ? 'text-emerald-600' : 'text-slate-500'}`} />
          <span>{isAr ? '٢. الميزانية العمومية الرأسية (المركز المالي)' : '2. Vertical Balance Sheet'}</span>
          {balanceSheetData.isBalanced ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" title={isAr ? 'الميزانية متزنة' : 'Balanced'} />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-200" title={isAr ? 'ملاحظة اتزان' : 'Equation note'} />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cash_flow')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeTab === 'cash_flow'
              ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <ArrowDownUp className={`w-4 h-4 ${activeTab === 'cash_flow' ? 'text-emerald-600' : 'text-slate-500'}`} />
          <span>{isAr ? '٣. قائمة التدفقات النقدية' : '3. Statement of Cash Flows'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cost_centers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeTab === 'cost_centers'
              ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <PieChart className={`w-4 h-4 ${activeTab === 'cost_centers' ? 'text-emerald-600' : 'text-slate-500'}`} />
          <span>{isAr ? '٤. أداء مراكز التكلفة' : '4. Cost Centers & Segments'}</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 4. CONTENT OF SUBTAB 1: INCOME STATEMENT (قائمة الدخل)                     */}
      {/* ========================================================================= */}
      {activeTab === 'income_statement' && (
        <div className="space-y-4">
          {/* Executive KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isAr ? 'صافي الإيرادات التشغيلية' : 'Net Operating Revenue'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl sm:text-2xl font-black font-mono text-slate-900">
                  {formatCurrency(incomeStatementData.totalRevenue)}
                </span>
                <span className="text-xs text-slate-400 font-bold">EGP</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                <span>{isAr ? 'مبيعات النشاط بعد خصم المرتجعات والخصومات' : 'Operating revenue net of contra accounts'}</span>
              </p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isAr ? 'تكلفة المبيعات (COGS)' : 'Cost of Goods Sold'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl sm:text-2xl font-black font-mono text-amber-600">
                  {formatCurrency(incomeStatementData.totalCogs)}
                </span>
                <span className="text-xs text-slate-400 font-bold">EGP</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {isAr ? 'خامات ومستلزمات وتكاليف إنتاج مباشرة' : 'Direct materials & manufacturing costs'}
              </p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  {isAr ? 'مجمل الربح' : 'Gross Profit'}
                </span>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                  {incomeStatementData.grossMarginPct}%
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl sm:text-2xl font-black font-mono ${incomeStatementData.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {formatCurrency(incomeStatementData.grossProfit)}
                </span>
                <span className="text-xs text-slate-400 font-bold">EGP</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {isAr ? 'الإيرادات ناقص تكلفة المبيعات' : 'Revenue minus COGS'}
              </p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  {isAr ? 'صافي ربح / (خسارة) الفترة' : 'Net Profit / (Loss)'}
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${incomeStatementData.netProfit >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  {incomeStatementData.netProfitMarginPct}%
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl sm:text-2xl font-black font-mono ${incomeStatementData.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                  {formatCurrency(incomeStatementData.netProfit)}
                </span>
                <span className="text-xs text-slate-400 font-bold">EGP</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {isAr ? 'يرحل آلياً إلى حقوق الملكية بالميزانية' : 'Auto-rolled into Balance Sheet Equity'}
              </p>
            </div>
          </div>

          {/* Detailed Multi-Tier Income Statement Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  {isAr ? 'قائمة الدخل التفصيلية (الأرباح والخسائر عن الفترة)' : 'Detailed Income Statement (P&L)'}
                </h3>
              </div>
              <span className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold">
                {isAr ? `مستوى العرض النشط: ${displayLevel === 'all' ? 'كافة المستويات' : displayLevel === 'summary' ? 'ملخص الأقسام' : `المستوى L${displayLevel}`}` : `Display Level: ${displayLevel}`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4 text-start">{isAr ? 'البند المحاسبي / الكود والمستوى' : 'Account Item / Code & Level'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'البيان الوصفي' : 'Description'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'الجزئي (EGP)' : 'Partial (EGP)'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'الكلي (EGP)' : 'Total (EGP)'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'تدقيق' : 'Audit'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* --- SECTION 1: OPERATING REVENUE --- */}
                  <tr
                    onClick={() => toggleSection('revenues')}
                    className="bg-emerald-50/60 hover:bg-emerald-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.revenues ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4 text-emerald-600" />}
                      <span>{isAr ? '١- إيرادات النشاط التشغيلي والمبيعات' : '1. Operating Revenues & Sales'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الحسابات المربوطة بتبويب (إيرادات النشاط التشغيلي)' : 'Accounts configured as operating_revenue'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-emerald-700 font-bold font-mono">
                      {formatCurrency(incomeStatementData.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = incomeStatementData.revenueItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'إيرادات النشاط التشغيلي' : 'Operating Revenues', 'Operating Revenues', allTxs);
                        }}
                        className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.revenues && renderStatementAccountRows(incomeStatementData.revenueItems)}

                  {/* --- SECTION 2: COGS --- */}
                  <tr
                    onClick={() => toggleSection('cogs')}
                    className="bg-amber-50/60 hover:bg-amber-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.cogs ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
                      <span>{isAr ? '٢- تكلفة المبيعات والتكاليف المباشرة للإنتاج (COGS)' : '2. Cost of Goods Sold (Direct Costs)'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الحسابات المربوطة بتبويب (تكلفة المبيعات والإنتاج المباشر)' : 'Accounts configured as cogs_direct'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-amber-700 font-bold font-mono">
                      ({formatCurrency(incomeStatementData.totalCogs)})
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = incomeStatementData.cogsItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'تكلفة المبيعات' : 'Cost of Goods Sold', 'Cost of Goods Sold', allTxs);
                        }}
                        className="text-amber-600 hover:text-amber-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.cogs && renderStatementAccountRows(incomeStatementData.cogsItems)}

                  {/* GROSS PROFIT ROW */}
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-b-2 border-slate-300">
                    <td className="py-3.5 px-4 text-sm" colSpan={2}>
                      <div className="flex items-center justify-between">
                        <span>{isAr ? '= مجمل الربح (Gross Profit)' : '= Gross Profit'}</span>
                        <span className="text-xs font-normal text-slate-500">
                          {isAr ? 'هامش مجمل الربح:' : 'Gross Margin:'} {incomeStatementData.grossMarginPct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-end text-slate-400">-</td>
                    <td className={`py-3.5 px-4 text-end font-bold font-mono text-sm ${incomeStatementData.grossProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                      {formatCurrency(incomeStatementData.grossProfit)}
                    </td>
                    <td className="py-3.5 px-4"></td>
                  </tr>

                  {/* --- SECTION 3: SELLING EXPENSES --- */}
                  <tr
                    onClick={() => toggleSection('opex_selling')}
                    className="bg-blue-50/50 hover:bg-blue-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.opex_selling ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />}
                      <span>{isAr ? '٣- المصروفات البيعية والتسويقية والتوزيع' : '3. Selling & Distribution Expenses'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الحسابات المربوطة بتبويب (مصروفات بيعية وتوزيع)' : 'Accounts configured as selling_expense'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-blue-700 font-bold font-mono">
                      ({formatCurrency(incomeStatementData.totalSelling)})
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = incomeStatementData.sellingItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'المصروفات البيعية والتسويقية' : 'Selling Expenses', 'Selling Expenses', allTxs);
                        }}
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.opex_selling && renderStatementAccountRows(incomeStatementData.sellingItems)}

                  {/* --- SECTION 4: ADMIN EXPENSES --- */}
                  <tr
                    onClick={() => toggleSection('opex_admin')}
                    className="bg-indigo-50/50 hover:bg-indigo-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.opex_admin ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-600" />}
                      <span>{isAr ? '٤- المصروفات العمومية والإدارية' : '4. General & Administrative Expenses'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الحسابات المربوطة بتبويب (مصروفات إدارية وعمومية)' : 'Accounts configured as admin_expense'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-indigo-700 font-bold font-mono">
                      ({formatCurrency(incomeStatementData.totalAdmin)})
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = incomeStatementData.adminItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'المصروفات العمومية والإدارية' : 'Administrative Expenses', 'Administrative Expenses', allTxs);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.opex_admin && renderStatementAccountRows(incomeStatementData.adminItems)}

                  {/* --- SECTION 5: FINANCING EXPENSES --- */}
                  <tr
                    onClick={() => toggleSection('financing_expense')}
                    className="bg-purple-50/50 hover:bg-purple-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.financing_expense ? <ChevronUp className="w-4 h-4 text-purple-600" /> : <ChevronDown className="w-4 h-4 text-purple-600" />}
                      <span>{isAr ? '٥- المصروفات التمويلية والعمولات البنكية' : '5. Financing & Bank Expenses'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الحسابات المربوطة بتبويب (مصروفات تمويلية وبنكية)' : 'Accounts configured as financing_expense'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-purple-700 font-bold font-mono">
                      ({formatCurrency(incomeStatementData.totalFinancing)})
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = incomeStatementData.financingItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'المصروفات التمويلية والبنكية' : 'Financing Expenses', 'Financing Expenses', allTxs);
                        }}
                        className="text-purple-600 hover:text-purple-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.financing_expense && renderStatementAccountRows(incomeStatementData.financingItems)}

                  {/* OPERATING PROFIT ROW */}
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-b-2 border-slate-300">
                    <td className="py-3.5 px-4 text-sm" colSpan={2}>
                      <div className="flex items-center justify-between">
                        <span>{isAr ? '= صافي الربح التشغيلي للنشاط (Operating Profit)' : '= Operating Profit'}</span>
                        <span className="text-xs font-normal text-slate-500">
                          {isAr ? 'الهامش التشغيلي:' : 'Operating Margin:'} {incomeStatementData.operatingMarginPct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-end text-slate-400">-</td>
                    <td className={`py-3.5 px-4 text-end font-bold font-mono text-sm ${incomeStatementData.operatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                      {formatCurrency(incomeStatementData.operatingProfit)}
                    </td>
                    <td className="py-3.5 px-4"></td>
                  </tr>

                  {/* --- SECTION 6: OTHER REVENUES & EXPENSES --- */}
                  <tr
                    onClick={() => toggleSection('other_revenue_expense')}
                    className="bg-teal-50/50 hover:bg-teal-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.other_revenue_expense ? <ChevronUp className="w-4 h-4 text-teal-600" /> : <ChevronDown className="w-4 h-4 text-teal-600" />}
                      <span>{isAr ? '٦- إيرادات ومصروفات أخرى غير تشغيلية (صافي)' : '6. Other Non-Operating Revenue / Expense (Net)'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الحسابات المربوطة بتبويب (إيرادات ومصروفات أخرى)' : 'Accounts configured as other_revenue_expense'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className={`py-3 px-4 text-end font-bold font-mono ${incomeStatementData.totalOther >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                      {formatCurrency(incomeStatementData.totalOther)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = incomeStatementData.otherItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'إيرادات ومصروفات أخرى' : 'Other Revenue & Expense', 'Other Revenue & Expense', allTxs);
                        }}
                        className="text-teal-600 hover:text-teal-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.other_revenue_expense && renderStatementAccountRows(incomeStatementData.otherItems)}

                  {/* NET PROFIT FINAL ROW */}
                  <tr className="bg-emerald-100 font-black text-slate-950 border-t-4 border-emerald-600">
                    <td className="py-4 px-4 text-base" colSpan={2}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span>{isAr ? '== صافي ربح / (خسارة) الفترة المحاسبية قبل الضريبة' : '== Net Income / (Loss) Before Tax'}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">
                          {isAr ? 'صافي العائد على الإيرادات:' : 'Return on Sales:'} {incomeStatementData.netProfitMarginPct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-end text-slate-400">-</td>
                    <td className={`py-4 px-4 text-end font-black font-mono text-base ${incomeStatementData.netProfit >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                      {formatCurrency(incomeStatementData.netProfit)} EGP
                    </td>
                    <td className="py-4 px-4"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. CONTENT OF SUBTAB 2: VERTICAL BALANCE SHEET (الميزانية العمومية الرأسية) */}
      {/* ========================================================================= */}
      {activeTab === 'balance_sheet' && (
        <div className="space-y-4">
          {/* Accounting Equation Verification Banner */}
          <div className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs ${
            balanceSheetData.isBalanced
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center gap-3">
              {balanceSheetData.isBalanced ? (
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              )}
              <div>
                <h4 className="font-bold text-sm sm:text-base">
                  {balanceSheetData.isBalanced
                    ? (isAr ? 'معادلة الميزانية العمومية الرأسية متزنة تماماً (Balanced GAAP)' : 'Vertical Balance Sheet Equation is Fully Balanced')
                    : (isAr ? 'ملاحظة تسوية: يوجد فارق في المعادلة المحاسبية' : 'Equation Variance Note')}
                </h4>
                <p className="text-xs opacity-80 mt-0.5">
                  {isAr
                    ? `الأرصدة تراكمية حتى تاريخ (${endDate}) • إجمالي الأصول = إجمالي الالتزامات + حقوق الملكية`
                    : `Cumulative balances as of (${endDate}) • Total Assets = Total Liabilities + Shareholders' Equity`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs sm:text-sm font-mono font-bold flex-wrap">
              <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-xs font-sans block">{isAr ? 'إجمالي الأصول' : 'Total Assets'}</span>
                <span>{formatCurrency(balanceSheetData.totalAssets)}</span>
              </div>
              <span className="text-slate-400">=</span>
              <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-xs font-sans block">{isAr ? 'الالتزامات + الملكية' : 'Liab + Equity'}</span>
                <span>{formatCurrency(balanceSheetData.totalLiabilitiesAndEquity)}</span>
              </div>
              <span className="text-slate-400">|</span>
              <div className="text-xs font-sans">
                <span className="text-slate-500 block">{isAr ? 'الفارق:' : 'Variance:'}</span>
                <span className={balanceSheetData.isBalanced ? 'text-emerald-700' : 'text-amber-700'}>
                  {formatCurrency(balanceSheetData.balanceDifference)} EGP
                </span>
              </div>
            </div>
          </div>

          {/* Standard Vertical Report Format Balance Sheet Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-700" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  {isAr ? `قائمة المركز المالي الرأسية كما في ${endDate}` : `Vertical Statement of Financial Position as of ${endDate}`}
                </h3>
              </div>
              <span className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold">
                {isAr ? `الهيكل الرأسي المعتمد • المستوى: ${displayLevel === 'all' ? 'كافة المستويات' : displayLevel === 'summary' ? 'ملخص' : `L${displayLevel}`}` : `Vertical Report • Level: ${displayLevel}`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4 text-start">{isAr ? 'البند المحاسبي / الكود والمستوى' : 'Account Item / Code & Level'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'البيان والتأثير' : 'Description & Effect'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'الجزئي (EGP)' : 'Partial (EGP)'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'الكلي (EGP)' : 'Total (EGP)'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'تدقيق' : 'Audit'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* ======================================================= */}
                  {/* PART 1: ASSETS (أولاً: الأصول والموجودات)                */}
                  {/* ======================================================= */}
                  <tr className="bg-slate-900 text-white font-black">
                    <td colSpan={5} className="py-3 px-4 text-sm tracking-wide">
                      {isAr ? 'أولاً: الأصول والموجودات (ASSETS)' : 'I. ASSETS'}
                    </td>
                  </tr>

                  {/* 1. Current Assets */}
                  <tr
                    onClick={() => toggleSection('current_assets')}
                    className="bg-emerald-50/60 hover:bg-emerald-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.current_assets ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4 text-emerald-600" />}
                      <span>{isAr ? '١- الأصول المتداولة (Current Assets)' : '1. Current Assets'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'النقدية بالصناديق والبنوك، المخزون، العملاء، والأرصدة المدينة' : 'Cash, banks, inventory, receivables & short-term assets'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-emerald-700 font-bold font-mono">
                      {formatCurrency(balanceSheetData.totalCurrentAssets)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = balanceSheetData.currentAssetItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'الأصول المتداولة' : 'Current Assets', 'Current Assets', allTxs);
                        }}
                        className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.current_assets && renderStatementAccountRows(balanceSheetData.currentAssetItems)}

                  {/* 2. Fixed / Non-Current Assets */}
                  <tr
                    onClick={() => toggleSection('fixed_assets')}
                    className="bg-teal-50/60 hover:bg-teal-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.fixed_assets ? <ChevronUp className="w-4 h-4 text-teal-600" /> : <ChevronDown className="w-4 h-4 text-teal-600" />}
                      <span>{isAr ? '٢- الأصول الثابتة وغير المتداولة — بالصافي (Fixed / Non-Current Assets)' : '2. Fixed / Non-Current Assets (Net)'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الأصول الثابتة مطروحاً منها مجمع الإهلاك (الحسابات العكسية)' : 'Property, plant & equipment net of accumulated depreciation'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-teal-700 font-bold font-mono">
                      {formatCurrency(balanceSheetData.totalFixedAssets)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = balanceSheetData.fixedAssetItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'الأصول الثابتة وغير المتداولة' : 'Fixed Assets', 'Fixed Assets', allTxs);
                        }}
                        className="text-teal-600 hover:text-teal-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.fixed_assets && renderStatementAccountRows(balanceSheetData.fixedAssetItems)}

                  {/* TOTAL ASSETS ROW */}
                  <tr className="bg-emerald-100/90 font-black text-slate-950 border-t-2 border-b-4 border-emerald-600">
                    <td className="py-3.5 px-4 text-sm sm:text-base" colSpan={2}>
                      {isAr ? '= إجمالي الأصول (Total Assets)' : '= Total Assets'}
                    </td>
                    <td className="py-3.5 px-4 text-end text-slate-400">-</td>
                    <td className="py-3.5 px-4 text-end font-black font-mono text-sm sm:text-base text-emerald-900">
                      {formatCurrency(balanceSheetData.totalAssets)} EGP
                    </td>
                    <td className="py-3.5 px-4"></td>
                  </tr>

                  {/* ======================================================= */}
                  {/* PART 2: LIABILITIES & EQUITY (ثانياً: الالتزامات وحقوق الملكية) */}
                  {/* ======================================================= */}
                  <tr className="bg-slate-900 text-white font-black">
                    <td colSpan={5} className="py-3 px-4 text-sm tracking-wide">
                      {isAr ? 'ثانياً: الالتزامات وحقوق الملكية (LIABILITIES & SHAREHOLDERS\' EQUITY)' : 'II. LIABILITIES & SHAREHOLDERS\' EQUITY'}
                    </td>
                  </tr>

                  {/* 1. Current Liabilities */}
                  <tr
                    onClick={() => toggleSection('current_liabilities')}
                    className="bg-blue-50/60 hover:bg-blue-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.current_liabilities ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />}
                      <span>{isAr ? '١- الالتزامات المتداولة قصيرة الأجل (Current Liabilities)' : '1. Current Liabilities'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'الموردين، مصلحة الضرائب، التأمينات، والمصروفات المستحقة' : 'Suppliers, tax authority, accrued expenses & short-term payables'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-blue-700 font-bold font-mono">
                      {formatCurrency(balanceSheetData.totalCurrentLiabilities)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = balanceSheetData.currentLiabilityItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'الالتزامات المتداولة' : 'Current Liabilities', 'Current Liabilities', allTxs);
                        }}
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.current_liabilities && renderStatementAccountRows(balanceSheetData.currentLiabilityItems)}

                  {/* 2. Long-Term Liabilities */}
                  <tr
                    onClick={() => toggleSection('long_term_liabilities')}
                    className="bg-indigo-50/60 hover:bg-indigo-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.long_term_liabilities ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-600" />}
                      <span>{isAr ? '٢- الالتزامات غير المتداولة طويلة الأجل (Long-Term Liabilities)' : '2. Long-Term Liabilities'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'القروض والتسهيلات الائتمانية طويلة الأجل' : 'Long-term bank loans & credit facilities'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-indigo-700 font-bold font-mono">
                      {formatCurrency(balanceSheetData.totalLongTermLiabilities)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = balanceSheetData.longTermLiabilityItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'الالتزامات طويلة الأجل' : 'Long-Term Liabilities', 'Long-Term Liabilities', allTxs);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.long_term_liabilities && renderStatementAccountRows(balanceSheetData.longTermLiabilityItems)}

                  {/* SUBTOTAL: TOTAL LIABILITIES */}
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t border-b border-slate-300">
                    <td className="py-3 px-4 text-xs sm:text-sm" colSpan={2}>
                      {isAr ? '= إجمالي الالتزامات (Total Liabilities)' : '= Total Liabilities'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end font-bold font-mono text-blue-900">
                      {formatCurrency(balanceSheetData.totalLiabilities)} EGP
                    </td>
                    <td className="py-3 px-4"></td>
                  </tr>

                  {/* 3. Shareholders' Equity */}
                  <tr
                    onClick={() => toggleSection('equity')}
                    className="bg-purple-50/60 hover:bg-purple-50 font-bold text-slate-900 cursor-pointer"
                  >
                    <td className="py-3 px-4 flex items-center gap-2">
                      {expandedSections.equity ? <ChevronUp className="w-4 h-4 text-purple-600" /> : <ChevronDown className="w-4 h-4 text-purple-600" />}
                      <span>{isAr ? '٣- حقوق الملكية ورأس المال (Shareholders\' Equity)' : '3. Shareholders\' Equity'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {isAr ? 'رأس المال، الاحتياطيات، الأرباح المحتجزة، وصافي ربح الفترة الحالية' : 'Capital, reserves, retained earnings & current period net income'}
                    </td>
                    <td className="py-3 px-4 text-end text-slate-400">-</td>
                    <td className="py-3 px-4 text-end text-purple-800 font-bold font-mono">
                      {formatCurrency(balanceSheetData.totalEquity)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTxs = balanceSheetData.equityItems.filter((i) => !i.isGroupParent).flatMap((i) => i.txs);
                          openDrilldown(isAr ? 'حقوق الملكية' : 'Shareholders Equity', 'Shareholders Equity', allTxs);
                        }}
                        className="text-purple-600 hover:text-purple-800 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedSections.equity && renderStatementAccountRows(balanceSheetData.equityItems)}

                  {/* FINAL GRAND TOTAL: TOTAL LIABILITIES & SHAREHOLDERS' EQUITY */}
                  <tr className="bg-blue-100/90 font-black text-slate-950 border-t-4 border-blue-700">
                    <td className="py-4 px-4 text-sm sm:text-base" colSpan={2}>
                      {isAr ? '== إجمالي الالتزامات وحقوق الملكية (Total Liabilities & Shareholders\' Equity)' : '== Total Liabilities & Shareholders\' Equity'}
                    </td>
                    <td className="py-4 px-4 text-end text-slate-400">-</td>
                    <td className="py-4 px-4 text-end font-black font-mono text-sm sm:text-base text-blue-950">
                      {formatCurrency(balanceSheetData.totalLiabilitiesAndEquity)} EGP
                    </td>
                    <td className="py-4 px-4"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CONTENT OF SUBTAB 3: STATEMENT OF CASH FLOWS (قائمة التدفقات النقدية)    */}
      {/* ========================================================================= */}
      {activeTab === 'cash_flow' && (
        <div className="space-y-4">
          {/* Executive Flow Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isAr ? 'التدفقات التشغيلية' : 'Operating Cash Flow'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl sm:text-2xl font-black font-mono ${cashFlowData.netOperatingCash >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {formatCurrency(cashFlowData.netOperatingCash)}
                </span>
                <span className="text-xs text-slate-400 font-bold">EGP</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {isAr ? 'المقبوضات التشغيلية ناقص المدفوعات للموردين والمصروفات' : 'Operating inflows minus supplier & expense outflows'}
              </p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isAr ? 'التدفقات الاستثمارية' : 'Investing Cash Flow'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl sm:text-2xl font-black font-mono ${cashFlowData.netInvestingCash >= 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {formatCurrency(cashFlowData.netInvestingCash)}
                </span>
                <span className="text-xs text-slate-400 font-bold">EGP</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {isAr ? 'شراء وبيع الأصول الثابتة والخطوط الإنتاجية' : 'CapEx, machinery & fixed asset movements'}
              </p>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isAr ? 'التدفقات التمويلية' : 'Financing Cash Flow'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl sm:text-2xl font-black font-mono ${cashFlowData.netFinancingCash >= 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                  {formatCurrency(cashFlowData.netFinancingCash)}
                </span>
                <span className="text-xs text-slate-400 font-bold">EGP</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {isAr ? 'رأس المال، جاري الشركاء، والقروض التمويلية' : 'Capital, partner current accounts & financing'}
              </p>
            </div>
          </div>

          {/* Cash Reconciliation Waterfall Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  {isAr ? 'تسوية التدفقات النقدية وفق النطاق المعتمد' : 'Scoped Cash Flow Reconciliation'}
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">Direct Method Presentation</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs sm:text-sm">
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50 font-bold text-slate-800">
                    <td className="py-3.5 px-4">{isAr ? 'النقدية وما في حكمها أول الفترة' : 'Cash & Cash Equivalents at Beginning of Period'}</td>
                    <td className="py-3.5 px-4 text-end font-mono text-slate-800">
                      {formatCurrency(cashFlowData.beginningCash)} EGP
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 ps-8">
                      <div className="flex items-center justify-between">
                        <span>{isAr ? '+ صافي التدفقات النقدية من الأنشطة التشغيلية' : '+ Net Cash from Operating Activities'}</span>
                        <button
                          type="button"
                          onClick={() => openDrilldown(
                            isAr ? 'التدفقات النقدية التشغيلية' : 'Operating Cash Flow',
                            'Operating Cash Flow',
                            cashFlowData.operatingItems
                          )}
                          className="text-xs text-emerald-600 hover:underline cursor-pointer"
                        >
                          {isAr ? `عرض الحركات (${cashFlowData.operatingItems.length})` : `View Vouchers (${cashFlowData.operatingItems.length})`}
                        </button>
                      </div>
                    </td>
                    <td className={`py-3 px-4 text-end font-mono font-semibold ${cashFlowData.netOperatingCash >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatCurrency(cashFlowData.netOperatingCash)} EGP
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 ps-8">
                      <div className="flex items-center justify-between">
                        <span>{isAr ? '+ صافي التدفقات النقدية من الأنشطة الاستثمارية' : '+ Net Cash from Investing Activities'}</span>
                        <button
                          type="button"
                          onClick={() => openDrilldown(
                            isAr ? 'التدفقات النقدية الاستثمارية' : 'Investing Cash Flow',
                            'Investing Cash Flow',
                            cashFlowData.investingItems
                          )}
                          className="text-xs text-emerald-600 hover:underline cursor-pointer"
                        >
                          {isAr ? `عرض الحركات (${cashFlowData.investingItems.length})` : `View Vouchers (${cashFlowData.investingItems.length})`}
                        </button>
                      </div>
                    </td>
                    <td className={`py-3 px-4 text-end font-mono font-semibold ${cashFlowData.netInvestingCash >= 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {formatCurrency(cashFlowData.netInvestingCash)} EGP
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 ps-8">
                      <div className="flex items-center justify-between">
                        <span>{isAr ? '+ صافي التدفقات النقدية من الأنشطة التمويلية' : '+ Net Cash from Financing Activities'}</span>
                        <button
                          type="button"
                          onClick={() => openDrilldown(
                            isAr ? 'التدفقات النقدية التمويلية' : 'Financing Cash Flow',
                            'Financing Cash Flow',
                            cashFlowData.financingItems
                          )}
                          className="text-xs text-emerald-600 hover:underline cursor-pointer"
                        >
                          {isAr ? `عرض الحركات (${cashFlowData.financingItems.length})` : `View Vouchers (${cashFlowData.financingItems.length})`}
                        </button>
                      </div>
                    </td>
                    <td className={`py-3 px-4 text-end font-mono font-semibold ${cashFlowData.netFinancingCash >= 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {formatCurrency(cashFlowData.netFinancingCash)} EGP
                    </td>
                  </tr>

                  <tr className="bg-slate-100 font-bold text-slate-900 border-t border-b border-slate-300">
                    <td className="py-3.5 px-4">{isAr ? '= صافي التغير في النقدية خلال الفترة' : '= Net Increase / (Decrease) in Cash'}</td>
                    <td className={`py-3.5 px-4 text-end font-mono font-bold ${cashFlowData.netChangeInCash >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                      {formatCurrency(cashFlowData.netChangeInCash)} EGP
                    </td>
                  </tr>

                  <tr className="bg-emerald-100 font-black text-slate-950">
                    <td className="py-4 px-4 text-sm sm:text-base">
                      <div className="flex items-center justify-between">
                        <span>{isAr ? '== رصيد النقدية وما في حكمها نهاية الفترة (وفق النطاق النشط)' : '== Cash & Equivalents at End of Period'}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">
                          {activeLedgerMode === LEDGER_MODES.MASTER ? (isAr ? 'مجمع شامل' : 'Consolidated') : (isAr ? 'قياسي معتمد' : 'Standard')}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-end font-mono font-black text-sm sm:text-base text-emerald-950">
                      {formatCurrency(cashFlowData.endingCash)} EGP
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. CONTENT OF SUBTAB 4: COST CENTER PERFORMANCE (مراكز التكلفة)            */}
      {/* ========================================================================= */}
      {activeTab === 'cost_centers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {costCenterData.map((center) => {
              const IconComponent = center.icon || Building2;
              return (
                <div
                  key={center.id}
                  className="bg-white rounded-xl shadow-2xs border border-slate-200 p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                        <IconComponent className="w-5 h-5 text-emerald-600" />
                      </div>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {center.id}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-base mt-3">
                      {isAr ? center.nameAr : center.nameEn}
                    </h4>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>{isAr ? 'الإيرادات المحققة:' : 'Revenue:'}</span>
                        <span className="font-mono font-semibold text-emerald-700">
                          {formatCurrency(center.revenue)} EGP
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>{isAr ? 'التكاليف المباشرة:' : 'Direct COGS:'}</span>
                        <span className="font-mono font-semibold text-amber-700">
                          {formatCurrency(center.directCosts)} EGP
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>{isAr ? 'المصروفات التشغيلية:' : 'OPEX:'}</span>
                        <span className="font-mono font-semibold text-blue-700">
                          {formatCurrency(center.opex)} EGP
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 block">{isAr ? 'هامش المساهمة:' : 'Contribution Margin:'}</span>
                      <span className={`font-mono font-bold text-sm ${center.margin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {formatCurrency(center.margin)} EGP ({center.marginPct}%)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openDrilldown(center.nameAr, center.nameEn, center.txs)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
                    >
                      {isAr ? 'القيود' : 'Vouchers'} ({center.txCount})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. DRILLDOWN MODAL (Underlying Posted Vouchers)                            */}
      {/* ========================================================================= */}
      {drilldownModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full my-auto max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                  {isAr ? drilldownModal.titleAr : drilldownModal.titleEn}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? `تفاصيل القيود والسندات المعتمدة المرتبطة بهذا البند (${drilldownModal.transactions.length} حركة)`
                    : `Approved vouchers linked to this statement line (${drilldownModal.transactions.length} entries)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrilldownModal({ isOpen: false, titleAr: '', titleEn: '', transactions: [] })}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {drilldownModal.transactions.some((tx) => tx.isIncomeStatementRolled) && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950 font-bold">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {isAr
                        ? 'هذا الرصيد ناتج عن الترحيل التلقائي لصافي أرباح / (خسائر) الفترة من قائمة الدخل'
                        : 'This balance reflects the automatic rollover of net profit / (loss) from the Income Statement'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDrilldownModal({ isOpen: false, titleAr: '', titleEn: '', transactions: [] });
                      setActiveTab('income_statement');
                    }}
                    className="px-3 py-1 bg-emerald-700 text-white rounded-lg text-xs hover:bg-emerald-800 transition cursor-pointer"
                  >
                    {isAr ? 'عرض تفاصيل قائمة الدخل ←' : 'View Income Statement Details →'}
                  </button>
                </div>
              )}
              {drilldownModal.transactions.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>{isAr ? 'لا توجد حركات مسجلة لهذا البند خلال الفترة المحددة' : 'No recorded transactions in selected period'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                        <th className="py-2.5 px-3 text-start">{isAr ? 'رقم السند / القيد' : 'Voucher #'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'المصدر / الخزينة' : 'Source / Safe'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'البيان' : 'Description'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'المبلغ (EGP)' : 'Amount (EGP)'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {drilldownModal.transactions.map((tx, idx) => (
                        <tr key={`${tx.id || tx.voucherNumber}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                            {tx.voucherNumber || tx.id}
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-mono text-xs">
                            {tx.date ? tx.date.slice(0, 10) : '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {tx.safeName || '-'}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              tx.direction === 'in'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-600 max-w-xs truncate">
                            {tx.description || tx.notes || '-'}
                          </td>
                          <td className="py-2 px-3 text-end font-mono font-bold text-slate-900">
                            {formatCurrency(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setDrilldownModal({ isOpen: false, titleAr: '', titleEn: '', transactions: [] })}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secret Secured Door Modal */}
      <SecretDoorModal
        isOpen={showSecretDoorModal}
        onClose={() => setShowSecretDoorModal(false)}
        onSuccess={() => {}}
        isAr={isAr}
        currentUser={currentUser}
      />

      {/* Official Financial Statement A4 Print Preview Slip */}
      {showPrintSlip && (
        <FinancialStatementPrintSlip
          statementType={activeTab}
          startDate={startDate}
          endDate={endDate}
          selectedYear={selectedYear}
          displayLevel={displayLevel}
          incomeStatementData={incomeStatementData}
          balanceSheetData={balanceSheetData}
          cashFlowData={cashFlowData}
          costCenterData={costCenterData}
          activeLedgerMode={activeLedgerMode}
          currentUser={currentUser}
          onClose={() => setShowPrintSlip(false)}
        />
      )}
    </div>
  );
}
