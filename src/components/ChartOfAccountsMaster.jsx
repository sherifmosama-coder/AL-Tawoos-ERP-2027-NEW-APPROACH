import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeDollarSign,
  BookOpen,
  FileSpreadsheet,
  Download,
  Upload,
  PlusCircle,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  ArrowRight,
  TrendingUp,
  Landmark,
  Coins,
  ShieldCheck,
  Scale,
  RefreshCw,
  FolderTree,
  Calendar,
  Folder,
  FolderOpen,
  PieChart,
  ExternalLink,
  X,
  Link2,
  Database,
  Sliders,
  Users,
  Truck,
  Factory,
  Package,
  ArrowDownLeft,
  Save,
  RotateCcw,
  Building2,
  Paperclip,
  Eye,
  Printer,
  Receipt,
  ArrowRightLeft,
  FileCheck,
  Lock,
  Unlock,
  KeyRound,
  Star
} from 'lucide-react';
import AttachmentViewerModal from './AttachmentViewerModal.jsx';
import CashVoucherPrintSlip from './CashVoucherPrintSlip.jsx';
import CustodyAcknowledgmentPrintSlip from './CustodyAcknowledgmentPrintSlip.jsx';
import GoodsReceiptPrintSlip from './GoodsReceiptPrintSlip.jsx';
import JournalVoucherPrintSlip from './JournalVoucherPrintSlip.jsx';
import StockTransferPrintSlip from './StockTransferPrintSlip.jsx';
import SecretDoorModal from './SecretDoorModal.jsx';
import SecretLockButton from './SecretLockButton.jsx';
import ManualJournalEntryModal from './ManualJournalEntryModal.jsx';
import TrialBalanceDiagnosticModal from './TrialBalanceDiagnosticModal.jsx';
import TrialBalancePrintSlip from './TrialBalancePrintSlip.jsx';
import SearchableSelect from './SearchableSelect.jsx';
import {
  LEDGER_MODES,
  getActiveLedgerMode,
  isMasterUnlocked,
  setActiveLedgerMode,
  lockMasterLedger,
  subscribeToLedgerModeChange,
  isTransactionTaxOfficial
} from '../utils/dualLedgerEngine.js';
import { collection, doc, setDoc, onSnapshot, query, orderBy, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  generateAccountsCSVTemplate,
  parseAccountsCSV,
  batchImportChartOfAccounts,
  saveChartAccount,
  deleteChartAccount,
  MAIN_GL_ACCOUNTS,
  ACCOUNT_STATEMENTS,
  ACCOUNT_REPORT_CATEGORIES,
  ACCOUNT_STATEMENT_EFFECTS,
  ACCOUNT_CASH_FLOW_CATEGORIES,
  ACCOUNT_NATURES,
  ACCOUNT_SUBTYPES,
  DEFAULT_ACCOUNTING_LINKS,
  saveAccountingLinks,
  normalizeAccountAttributes,
  reverseCashVoucher,
  buildGrnReversalJournalEntry,
  checkParentChildConflict,
  resolveAccountMasterRole
} from '../utils/cashLedgerEngine.js';
import { UPLOADED_CHART_OF_ACCOUNTS_ROWS } from '../utils/preconfiguredChartOfAccounts.js';

export default function ChartOfAccountsMaster({
  currentUser,
  onNavigateToStatements = () => {},
  onNavigateToCash = () => {}
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [activeSubTab, setActiveSubTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const raw = window.location.hash || '';
      if (raw.includes('?')) {
        const params = new URLSearchParams(raw.split('?')[1]);
        const s = params.get('subTab');
        if (s && ['journal', 'trial_balance', 'directory', 'master_links'].includes(s)) {
          return s;
        }
      }
    }
    return 'journal';
  });

  // Sync activeSubTab into URL hash query param so database refresh returns to same subtab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash || '#accounts';
    const [base, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    if (params.get('subTab') !== activeSubTab || !params.has('module')) {
      params.set('subTab', activeSubTab);
      if (!params.has('module')) params.set('module', 'finance');
      const targetHash = `${base || '#accounts'}?${params.toString()}`;
      window.history.replaceState(null, '', targetHash);
    }
  }, [activeSubTab]);
  const [accountsList, setAccountsList] = useState([]);
  const [transactionsList, setTransactionsList] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [accountingLinks, setAccountingLinks] = useState(DEFAULT_ACCOUNTING_LINKS);
  const [localLinks, setLocalLinks] = useState(DEFAULT_ACCOUNTING_LINKS);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedAttachmentForView, setSelectedAttachmentForView] = useState(null);

  // Journal Ledger Popover & Print Slips State
  const [activeAttachmentPopover, setActiveAttachmentPopover] = useState(null); // { entry, systemDocs, uploadedDocs }
  const [selectedJournalVoucherForPrint, setSelectedJournalVoucherForPrint] = useState(null);
  const [selectedCashVoucherForPrint, setSelectedCashVoucherForPrint] = useState(null);
  const [selectedCustodyForPrint, setSelectedCustodyForPrint] = useState(null);
  const [selectedGrnForPrint, setSelectedGrnForPrint] = useState(null);
  const [selectedTrnForPrint, setSelectedTrnForPrint] = useState(null);
  const [selectedTrialBalanceForPrint, setSelectedTrialBalanceForPrint] = useState(null);

  // Master Lists State for Dynamic Sub-Ledger linking
  const [suppliersList, setSuppliersList] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [workersList, setWorkersList] = useState([]);
  const [safesList, setSafesList] = useState([]);
  const [banksList, setBanksList] = useState([]);
  const [warehousesList, setWarehousesList] = useState([]);
  const [receiptsList, setReceiptsList] = useState([]);
  const [purchaseOrdersList, setPurchaseOrdersList] = useState([]);
  const [stockTransfersList, setStockTransfersList] = useState([]);

  // Sub-Ledger Auxiliary Drill-down Modal State
  const [subLedgerModal, setSubLedgerModal] = useState({
    isOpen: false,
    account: null,
    targetRole: null, // 'supplier' | 'client' | 'worker' | 'safe' | 'bank' | 'inventory'
    searchTerm: '',
    selectedEntity: null // For viewing detailed statement of account
  });

  // Journal Stream State & Filters
  const [journalStreamFilter, setJournalStreamFilter] = useState('all'); // 'all' | 'cash' | 'accrual'
  const [journalSearchTerm, setJournalSearchTerm] = useState('');
  const [journalStatusFilter, setJournalStatusFilter] = useState('all'); // 'all' | 'posted' | 'reversed'
  const [journalStartDate, setJournalStartDate] = useState('');
  const [journalEndDate, setJournalEndDate] = useState('');
  const [expandedJournalEntries, setExpandedJournalEntries] = useState({});

  // Trial Balance Comprehensive Filters State
  const [tbSearchTerm, setTbSearchTerm] = useState('');
  const [tbLevelFilter, setTbLevelFilter] = useState('all'); // 'all' | '1' | '2' | '3' | '4'
  const [tbStatementFilter, setTbStatementFilter] = useState('all'); // 'all' | 'balance_sheet' | 'income_statement'
  const [tbBalanceFilter, setTbBalanceFilter] = useState('all'); // 'all' | 'with_movement' | 'non_zero' | 'zero_only' | 'debit_only' | 'credit_only'
  const [tbPeriodPreset, setTbPeriodPreset] = useState('all_time'); // 'all_time' | 'today' | 'this_month' | 'this_quarter' | 'this_year' | 'custom'
  const [tbStartDate, setTbStartDate] = useState('');
  const [tbEndDate, setTbEndDate] = useState('');
  const [tbCostCenterFilter, setTbCostCenterFilter] = useState('all');
  const [tbViewMode, setTbViewMode] = useState('hierarchy'); // 'hierarchy' | 'flat'
  const [costCentersList, setCostCentersList] = useState([]);

  useEffect(() => {
    const unsubCC = onSnapshot(doc(db, 'system_config', 'cost_centers'), (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.items)) {
        setCostCentersList(snap.data().items);
      } else if (snap.exists() && Array.isArray(snap.data()?.list)) {
        setCostCentersList(snap.data().list);
      }
    });
    return () => unsubCC();
  }, []);

  const handleTbPeriodPresetChange = (preset) => {
    setTbPeriodPreset(preset);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    if (preset === 'all_time') {
      setTbStartDate('');
      setTbEndDate('');
    } else if (preset === 'today') {
      const todayStr = `${y}-${pad(m + 1)}-${pad(d)}`;
      setTbStartDate(todayStr);
      setTbEndDate(todayStr);
    } else if (preset === 'this_month') {
      const startStr = `${y}-${pad(m + 1)}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const endStr = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
      setTbStartDate(startStr);
      setTbEndDate(endStr);
    } else if (preset === 'this_quarter') {
      const qMonthStart = Math.floor(m / 3) * 3;
      const startStr = `${y}-${pad(qMonthStart + 1)}-01`;
      const qMonthEnd = qMonthStart + 2;
      const lastDay = new Date(y, qMonthEnd + 1, 0).getDate();
      const endStr = `${y}-${pad(qMonthEnd + 1)}-${pad(lastDay)}`;
      setTbStartDate(startStr);
      setTbEndDate(endStr);
    } else if (preset === 'this_year') {
      setTbStartDate(`${y}-01-01`);
      setTbEndDate(`${y}-12-31`);
    }
  };

  const handleResetTbFilters = () => {
    setTbSearchTerm('');
    setTbLevelFilter('all');
    setTbStatementFilter('all');
    setTbBalanceFilter('all');
    setTbPeriodPreset('all_time');
    setTbStartDate('');
    setTbEndDate('');
    setTbCostCenterFilter('all');
    setTbViewMode('flat');
  };

  const hasActiveTbFilters = useMemo(() => {
    return Boolean(
      tbSearchTerm ||
      tbLevelFilter !== 'all' ||
      tbStatementFilter !== 'all' ||
      tbBalanceFilter !== 'all' ||
      tbPeriodPreset !== 'all_time' ||
      tbStartDate ||
      tbEndDate ||
      tbCostCenterFilter !== 'all' ||
      tbViewMode !== 'flat'
    );
  }, [tbSearchTerm, tbLevelFilter, tbStatementFilter, tbBalanceFilter, tbPeriodPreset, tbStartDate, tbEndDate, tbCostCenterFilter, tbViewMode]);

  const availableCostCenters = useMemo(() => {
    if (costCentersList.length > 0) return costCentersList;
    return [
      { id: 'CC-PROD-01', nameAr: 'خط الإنتاج والتصنيع 1', nameEn: 'Production Line 1' },
      { id: 'CC-PROD-02', nameAr: 'خط الإنتاج والتصنيع 2', nameEn: 'Production Line 2' },
      { id: 'CC-FLEET', nameAr: 'أسطول النقل واللوجستيات', nameEn: 'Logistics Fleet' },
      { id: 'CC-MAINT', nameAr: 'ورشة الصيانة وقطع الغيار', nameEn: 'Maintenance Workshop' },
      { id: 'CC-ADMIN', nameAr: 'الإدارة العامة للمصنع', nameEn: 'Factory Administration' },
      { id: 'CC-GENERAL', nameAr: 'مركز تكلفة عام ومصروفات مشتركة', nameEn: 'General & Overhead' }
    ];
  }, [costCentersList]);

  // Journal Reversal Modal State
  const [reversalModal, setReversalModal] = useState({
    isOpen: false,
    entry: null,
    reason: '',
    isSubmitting: false,
    error: ''
  });

  // Dual-Ledger Architecture (Official Tax Books vs. Master Comprehensive Books)
  const [activeLedgerMode, setLedgerModeState] = useState(getActiveLedgerMode);
  const [isMasterDoorUnlocked, setIsMasterDoorUnlocked] = useState(isMasterUnlocked);
  const [showSecretDoorModal, setShowSecretDoorModal] = useState(false);
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);

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

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'main' | 'sub'
  const [filterStatement, setFilterStatement] = useState('all'); // 'all' | 'balance_sheet' | 'income_statement'
  const [filterCategory, setFilterCategory] = useState('all');
  const [showGuide, setShowGuide] = useState(false);

  // Modals state
  const [importPreview, setImportPreview] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [accountModal, setAccountModal] = useState({
    isOpen: false,
    isEdit: false,
    originalCode: '',
    code: '',
    nameAr: '',
    nameEn: '',
    level: 1,
    type: 'main',
    statement: 'balance_sheet',
    reportCategory: 'current_asset',
    statementEffect: 'add',
    cashFlowCategory: 'operating',
    nature: 'debit',
    subType: 'cost_center',
    parentCode: '',
    requiresCostCenter: false,
    displayOrder: 0,
    descriptionAr: '',
    descriptionEn: '',
    linkedMasterCollection: 'none'
  });

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // 1. Real-time listener for chart_of_accounts
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'chart_of_accounts'), (snap) => {
      const list = snap.docs.map((d) => normalizeAccountAttributes({ id: d.id, ...d.data() }));
      setAccountsList(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Real-time listener for cash_transactions for Journal and Trial Balance
  useEffect(() => {
    const q = query(collection(db, 'cash_transactions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTransactionsList(list);
    });
    return () => unsub();
  }, []);

  // 3. Real-time listener for journal_entries (Procurement 4-leg Accruals & Adjustments)
  useEffect(() => {
    const q = query(collection(db, 'journal_entries'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setJournalEntries(list);
    });
    return () => unsub();
  }, []);

  // 4. Real-time listener for system_config/accounting_links
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'accounting_links'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const merged = { ...DEFAULT_ACCOUNTING_LINKS };
        Object.keys(DEFAULT_ACCOUNTING_LINKS).forEach((k) => {
          if (data[k]) merged[k] = { ...DEFAULT_ACCOUNTING_LINKS[k], ...data[k] };
        });

        // Auto-heal legacy typo if finishedGoodsInventoryAccount was seeded with 1020202 (WIP) instead of 1020203 (Finished Goods)
        if (
          merged.finishedGoodsInventoryAccount &&
          (merged.finishedGoodsInventoryAccount.primaryCode === '1020202' || merged.finishedGoodsInventoryAccount.code === '1020202') &&
          (!merged.finishedGoodsInventoryAccount.linkedCodes || !merged.finishedGoodsInventoryAccount.linkedCodes.includes('1020203'))
        ) {
          merged.finishedGoodsInventoryAccount = {
            ...merged.finishedGoodsInventoryAccount,
            primaryCode: '1020203',
            code: '1020203',
            linkedCodes: ['1020203'],
            nameAr: 'مخزون الإنتاج التام',
            nameEn: 'Finished Goods Inventory'
          };
        }

        setAccountingLinks(merged);
        setLocalLinks(merged);
      } else {
        setAccountingLinks(DEFAULT_ACCOUNTING_LINKS);
        setLocalLinks(DEFAULT_ACCOUNTING_LINKS);
      }
    });
    return () => unsub();
  }, []);

  // 5. Real-time listeners for Master Registries (Suppliers, Clients, Workers, Safes, Banks, Warehouses, Receipts)
  useEffect(() => {
    const unsubSup = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClientsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubWorkers = onSnapshot(collection(db, 'production_workers'), (snap) => {
      setWorkersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubSafes = onSnapshot(collection(db, 'cash_safes'), (snap) => {
      setSafesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubBanks = onSnapshot(collection(db, 'corporate_banks'), (snap) => {
      setBanksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehousesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubReceipts = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setReceiptsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubPo = onSnapshot(collection(db, 'purchase_orders'), (snap) => {
      setPurchaseOrdersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setStockTransfersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubSup();
      unsubClients();
      unsubWorkers();
      unsubSafes();
      unsubBanks();
      unsubWh();
      unsubReceipts();
      unsubPo();
      unsubTransfers();
    };
  }, []);

  // Download pre-filled 127-account sheet in the new 16-column structure
  const handleDownloadTemplate = () => {
    const csvContent = generateAccountsCSVTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'corrected_chart_of_accounts_16col.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export currently active Firestore COA in the new 16-column structure
  const handleExportCurrentCOA = () => {
    const csvContent = generateAccountsCSVTemplate(accountsList.length > 0 ? accountsList : null);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'tawoos_live_chart_of_accounts.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preview & apply the pre-configured 127-account Egyptian Unified COA in 1 click
  const handlePreviewPreconfigured127 = () => {
    const normalized127 = UPLOADED_CHART_OF_ACCOUNTS_ROWS.map((r) => normalizeAccountAttributes(r));
    setImportPreview({
      accounts: normalized127,
      errors: [],
      fileName: 'corrected_chart_of_accounts_16col.csv (127 حساب قياسي)'
    });
  };

  // Handle CSV file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      const parsed = parseAccountsCSV(text);
      setImportPreview({
        accounts: parsed.accounts,
        errors: parsed.errors,
        fileName: file.name
      });
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  // Confirm CSV import
  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.accounts.length === 0) return;
    setIsImporting(true);
    setErrorMsg('');
    try {
      const res = await batchImportChartOfAccounts(importPreview.accounts);
      setSuccessMsg(
        isAr
          ? `تم استيراد وتحديث ${res.count} حساب بنجاح في شجرة الحسابات ✓`
          : `Successfully imported ${res.count} accounts into Chart of Accounts ✓`
      );
      setImportPreview(null);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to import accounts');
    } finally {
      setIsImporting(false);
    }
  };

  // Open modal to create
  const handleOpenCreate = (parentCode = '') => {
    let nextCode = '';
    if (parentCode) {
      const parent = accountsList.find((a) => (a.code || a.id) === parentCode);
      const subCount = accountsList.filter((a) => (a.parentCode || a.parentAccountId) === parentCode).length + 1;
      nextCode = `${parentCode}${String(subCount).padStart(2, '0')}`;
      const parentLevel = Number(parent?.level) || 1;
      const inheritedCat = parent?.reportCategory === 'section_header'
        ? (parent?.statement === 'balance_sheet' ? 'current_asset' : 'operating_revenue')
        : (parent?.reportCategory || 'current_asset');
      setAccountModal({
        isOpen: true,
        isEdit: false,
        originalCode: '',
        code: nextCode,
        nameAr: '',
        nameEn: '',
        level: parentLevel + 1,
        type: 'sub',
        statement: parent?.statement || 'balance_sheet',
        reportCategory: inheritedCat,
        statementEffect: parent?.statementEffect || 'add',
        cashFlowCategory: parent?.cashFlowCategory || 'operating',
        nature: parent?.nature || 'debit',
        subType: parent?.subType || 'cost_center',
        parentCode,
        requiresCostCenter: Boolean(parent?.requiresCostCenter),
        displayOrder: (accountsList.length + 1) * 10,
        descriptionAr: '',
        descriptionEn: ''
      });
    } else {
      nextCode = String(accountsList.length + 5100);
      setAccountModal({
        isOpen: true,
        isEdit: false,
        originalCode: '',
        code: nextCode,
        nameAr: '',
        nameEn: '',
        level: 1,
        type: 'main',
        statement: 'balance_sheet',
        reportCategory: 'current_asset',
        statementEffect: 'add',
        cashFlowCategory: 'operating',
        nature: 'debit',
        subType: 'cost_center',
        parentCode: '',
        requiresCostCenter: false,
        displayOrder: (accountsList.length + 1) * 10,
        descriptionAr: '',
        descriptionEn: ''
      });
    }
  };

  // Open modal to edit
  const handleOpenEdit = (acc) => {
    const normalized = normalizeAccountAttributes(acc);
    setAccountModal({
      isOpen: true,
      isEdit: true,
      originalCode: normalized.code || normalized.id,
      code: normalized.code || normalized.id,
      nameAr: normalized.nameAr || '',
      nameEn: normalized.nameEn || '',
      level: normalized.level || 1,
      type: normalized.type || 'main',
      statement: normalized.statement || 'balance_sheet',
      reportCategory: normalized.reportCategory || 'current_asset',
      statementEffect: normalized.statementEffect || 'add',
      cashFlowCategory: normalized.cashFlowCategory || 'operating',
      nature: normalized.nature || 'debit',
      subType: normalized.subType || 'cost_center',
      parentCode: normalized.parentCode || '',
      requiresCostCenter: Boolean(normalized.requiresCostCenter),
      displayOrder: normalized.displayOrder || 0,
      descriptionAr: normalized.descriptionAr || '',
      descriptionEn: normalized.descriptionEn || ''
    });
  };

  // Save account
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    const cleanCode = accountModal.code.trim();
    const cleanParentCode = (accountModal.parentCode || '').trim();
    if (!cleanCode || !accountModal.nameAr.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال كود واسم الحساب بالعربية' : 'Please provide account code and name in Arabic');
      return;
    }
    if (cleanParentCode === cleanCode) {
      setErrorMsg(isAr ? 'لا يمكن ربط الحساب بنفسه كحساب أب' : 'An account cannot be its own parent');
      return;
    }

    // Validation: Prevent parent-child conflict for master registry subType assignments
    if (accountModal.subType && ['supplier', 'client', 'worker', 'safe', 'bank'].includes(accountModal.subType)) {
      const otherSameRoleCodes = accountsList
        .filter((a) => (a.code || a.id) !== cleanCode && (a.code || a.id) !== accountModal.originalCode && a.subType === accountModal.subType)
        .map((a) => a.code || a.id);

      const conflict = checkParentChildConflict(cleanCode, otherSameRoleCodes, accountsList);
      if (conflict.hasConflict) {
        setErrorMsg(isAr ? conflict.messageAr : conflict.messageEn);
        return;
      }
    }

    try {
      if (accountModal.isEdit && accountModal.originalCode && accountModal.originalCode !== cleanCode) {
        await deleteChartAccount(accountModal.originalCode);
      }

      await saveChartAccount({
        id: cleanCode,
        code: cleanCode,
        nameAr: accountModal.nameAr.trim(),
        nameEn: accountModal.nameEn.trim() || accountModal.nameAr.trim(),
        level: Number(accountModal.level) || 1,
        type: accountModal.type,
        statement: accountModal.statement,
        reportCategory: accountModal.reportCategory,
        statementEffect: accountModal.statementEffect || 'add',
        cashFlowCategory: accountModal.cashFlowCategory,
        nature: accountModal.nature,
        subType: accountModal.subType,
        parentCode: cleanParentCode,
        parentAccountId: cleanParentCode,
        requiresCostCenter: Boolean(accountModal.requiresCostCenter),
        displayOrder: Number(accountModal.displayOrder) || 0,
        descriptionAr: accountModal.descriptionAr.trim(),
        descriptionEn: accountModal.descriptionEn.trim(),
        isActive: true
      });

      setAccountModal((prev) => ({ ...prev, isOpen: false }));
      setSuccessMsg(
        accountModal.isEdit
          ? (isAr ? 'تم تعديل بيانات وإعدادات الحساب بنجاح ✓' : 'Account updated successfully ✓')
          : (isAr ? 'تم إنشاء الحساب بنجاح ✓' : 'New account created successfully ✓')
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Error saving account');
    }
  };

  // Delete account
  const handleDelete = async (account) => {
    if (!window.confirm(isAr ? `هل تريد حذف الحساب "${account.nameAr}" (${account.code})؟` : `Delete account "${account.nameAr}" (${account.code})?`)) {
      return;
    }
    try {
      await deleteChartAccount(account.code || account.id);
      setSuccessMsg(isAr ? 'تم حذف الحساب بنجاح' : 'Account deleted successfully');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Error deleting account');
    }
  };

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accountsList.filter((acc) => {
      if (filterType === 'main' && acc.type !== 'main') return false;
      if (filterType === 'sub' && acc.type !== 'sub') return false;
      if (filterStatement !== 'all' && acc.statement !== filterStatement) return false;
      if (filterCategory !== 'all' && acc.reportCategory !== filterCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const searchStr = `${acc.code} ${acc.nameAr} ${acc.nameEn || ''} ${acc.descriptionAr || ''} ${acc.descriptionEn || ''} ${acc.notes || ''}`.toLowerCase();
        if (!searchStr.includes(q)) return false;
      }
      return true;
    });
  }, [accountsList, filterType, filterStatement, filterCategory, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = accountsList.length;
    const mainCount = accountsList.filter((a) => a.type === 'main').length;
    const subCount = accountsList.filter((a) => a.type === 'sub').length;
    const bsCount = accountsList.filter((a) => a.statement === 'balance_sheet').length;
    const isCount = accountsList.filter((a) => a.statement === 'income_statement').length;
    return { total, mainCount, subCount, bsCount, isCount };
  }, [accountsList]);

  // Handle Save Master Links Configuration (General Admin)
  const handleSaveAccountingLinks = async () => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'عفواً، ضبط ربط الحسابات بالقوائم متاح للمسؤول العام فقط.' : 'Only General Admin can modify accounting links.');
      return;
    }

    // Pre-flight validation: check parent-child conflicts for each master mapping
    for (const [linkKey, linkConfig] of Object.entries(localLinks)) {
      const linked = Array.isArray(linkConfig.linkedCodes)
        ? linkConfig.linkedCodes
        : (linkConfig.code ? [linkConfig.code] : []);

      for (let i = 0; i < linked.length; i++) {
        const others = linked.filter((_, idx) => idx !== i);
        const conflict = checkParentChildConflict(linked[i], others, accountsList);
        if (conflict.hasConflict) {
          setErrorMsg(`${linkConfig.labelAr || linkKey}: ${conflict.messageAr}`);
          return;
        }
      }
    }

    setIsSavingLinks(true);
    try {
      await saveAccountingLinks(localLinks, currentUser?.id || 'admin');

      // Batch sync subType in chart_of_accounts collection
      const batch = writeBatch(db);
      let batchCount = 0;

      const roleToCodes = {};
      Object.values(localLinks).forEach((cfg) => {
        if (cfg.subType && ['supplier', 'client', 'worker', 'safe', 'bank', 'inventory'].includes(cfg.subType)) {
          const codes = Array.isArray(cfg.linkedCodes)
            ? cfg.linkedCodes
            : (cfg.code ? [cfg.code] : []);
          if (!roleToCodes[cfg.subType]) roleToCodes[cfg.subType] = new Set();
          codes.forEach((c) => roleToCodes[cfg.subType].add(String(c).trim()));
        }
      });

      accountsList.forEach((acc) => {
        const accCode = String(acc.code || acc.id).trim();
        for (const [role, codeSet] of Object.entries(roleToCodes)) {
          if (codeSet.has(accCode) && acc.subType !== role) {
            batch.update(doc(db, 'chart_of_accounts', accCode), { subType: role });
            batchCount++;
          }
        }
      });

      if (batchCount > 0) {
        await batch.commit();
      }

      setSuccessMsg(isAr ? 'تم حفظ وتفعيل إعدادات ربط الحسابات العامة بالقوائم بنجاح ✓' : 'Accounting links saved successfully ✓');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setErrorMsg(err.message || 'Error saving accounting links');
    } finally {
      setIsSavingLinks(false);
    }
  };

  // Handle Reset to Standard Defaults
  const handleResetAccountingLinks = () => {
    if (!isGeneralAdmin) return;
    if (window.confirm(isAr ? 'هل تريد استعادة تعيينات الربط الافتراضية وفق الدليل المصري الموحد؟' : 'Reset accounting links to default standard?')) {
      setLocalLinks(DEFAULT_ACCOUNTING_LINKS);
    }
  };

  // Unified Journal Stream (Cash Vouchers + Procurement 4-leg Accruals)
  const unifiedJournalList = useMemo(() => {
    const accountsMap = new Map();
    accountsList.forEach((a) => {
      const code = String(a.code || a.id || '').trim();
      if (code) accountsMap.set(code, a);
    });

    const cashStream = transactionsList.map((tx) => {
      const amt = Number(tx.amountInEGP) || Number(tx.amount) || 0;
      const isOut = tx.direction === 'out';
      const isSurplus = tx.type === 'balance_adjustment' && tx.direction === 'in';
      const safeAccountCode = accountingLinks.cashSafesAccount?.primaryCode || accountingLinks.cashSafesAccount?.code || '1020101';
      const safeAccountName = accountingLinks.cashSafesAccount?.nameAr || 'الخزينة';

      // Dynamic GL and Sub-Account Resolution (Exposing both GL and Sub-Account clearly)
      const subCode = String(tx.subAccountId || tx.subAccountCode || tx.childAccountCode || '').trim();
      const subAccountObj = subCode && accountsMap.get(subCode);

      // 1. Determine GL Parent Account Code and Name
      let glCode = String(tx.parentAccountCode || '').trim();
      if (!glCode) {
        if (subAccountObj?.parentCode) {
          glCode = subAccountObj.parentCode;
        } else if (tx.mainAccount && tx.mainAccount !== subCode) {
          glCode = String(tx.mainAccount).trim();
        } else if (subCode.length > 5) {
          glCode = subCode.slice(0, 5);
        } else if (subCode.length > 3) {
          glCode = subCode.slice(0, 3);
        } else {
          glCode = String(tx.mainAccount || '').trim();
        }
      }

      let glAccountObj = accountsMap.get(glCode);
      let glName = glAccountObj?.nameAr || tx.mainAccountAr || tx.mainAccount || glCode;

      if (!glCode || glCode === 'discrepancy') {
        glCode = accountingLinks.cashDiscrepancyAccount?.primaryCode || (isSurplus ? '4010204' : '3020209');
        glName = isSurplus ? 'أرباح وفروق تسوية جرد الخزينة (زيادة نقدية)' : 'عجز وفروق تسوية جرد الخزينة (عجز نقدي)';
      } else if (glCode === 'custody' || glCode === 'advances') {
        glCode = accountingLinks.workersCustodyAccount?.primaryCode || '1020401';
        glName = glCode === 'custody' ? 'عهد العاملين' : 'سلف العاملين';
      } else if (glCode === 'internal_transfer') {
        glCode = accountingLinks.internalTransfersAccount?.primaryCode || safeAccountCode;
        glName = 'تحويلات نقدية داخلية بين الخزائن';
      } else if (glCode === 'suppliers') {
        glCode = accountingLinks.suppliersAccount?.primaryCode || '2020101';
        glName = 'موردين خامات';
      } else if (glCode === 'clients') {
        glCode = accountingLinks.clientsAccount?.primaryCode || '1020301';
        glName = 'العملاء';
      } else if (glCode === 'salaries') {
        glCode = '3010201';
        glName = 'مصروف أجور ورواتب';
      } else if (glCode === 'opex' || glCode === 'general_admin_exp') {
        glCode = '3010207';
        glName = 'مصروفات تشغيلية ومستلزمات';
      }

      if (accountsMap.get(glCode)?.nameAr) {
        glName = accountsMap.get(glCode).nameAr;
      }

      // 2. Determine Sub-Account Code and Name
      let subAccountDisplayCode = '';
      let subAccountDisplayName = '';
      if (subAccountObj) {
        subAccountDisplayCode = subAccountObj.code;
        subAccountDisplayName = subAccountObj.nameAr || tx.subAccountName;
      } else if (subCode || tx.subAccountName) {
        subAccountDisplayCode = subCode || tx.subAccountId || '';
        subAccountDisplayName = tx.subAccountName || subCode || '';
      }

      const isTransfer = tx.type === 'safe_transfer';
      const docLabelAr = isTransfer
        ? 'تحويل بين الخزائن'
        : (tx.typeAr || (isOut ? 'سند صرف نقدية' : 'سند تحصيل نقدية'));
      const docLabelEn = isTransfer
        ? 'Inter-Safe Transfer'
        : (tx.typeEn || (isOut ? 'Cash Disbursement' : 'Cash Collection'));

      const safeDoc = safesList.find((s) => s.id === tx.safeId);
      const safeDisplayName = safeDoc?.nameAr || tx.safeNameAr || tx.safeName || tx.safeId || safeAccountName;

      const counterLeg = {
        accountCode: glCode,
        accountNameAr: glName,
        subAccountCode: subAccountDisplayCode,
        subAccountName: subAccountDisplayName,
        nature: isOut ? 'debit' : 'credit',
        debit: isOut ? amt : 0,
        credit: isOut ? 0 : amt,
        subledgerId: subAccountDisplayCode,
        subledgerName: subAccountDisplayName ? `${subAccountDisplayCode && !subAccountDisplayName.includes(subAccountDisplayCode) ? `[${subAccountDisplayCode}] ` : ''}${subAccountDisplayName}` : '',
        subledgerType: subAccountObj ? 'coa_sub_account' : (tx.subledgerType || 'other'),
        notes: tx.description
      };

      const safeLeg = {
        accountCode: safeAccountCode,
        accountNameAr: safeAccountName,
        subAccountCode: tx.safeId || '',
        subAccountName: safeDisplayName,
        nature: isOut ? 'credit' : 'debit',
        debit: isOut ? 0 : amt,
        credit: isOut ? amt : 0,
        subledgerId: tx.safeId || '',
        subledgerName: safeDisplayName,
        subledgerType: 'safe',
        notes: tx.description
      };

      return {
        id: tx.id,
        entryNumber: tx.id,
        sourceDocType: 'cash_voucher',
        docLabelAr,
        docLabelEn,
        entryDate: tx.createdAt ? tx.createdAt.slice(0, 10) : (tx.date || ''),
        createdAt: tx.createdAt || '',
        referenceNumber: tx.referenceNumber || tx.id,
        descriptionAr: tx.description || `${tx.typeAr || ''} - ${glName}${subAccountDisplayName ? ` (${subAccountDisplayName})` : ''}`,
        descriptionEn: tx.description || `${tx.typeEn || ''} - ${glCode}`,
        status: tx.status === 'reversed' ? 'reversed' : 'posted',
        streamType: 'cash',
        totalDebit: amt,
        totalCredit: amt,
        isBalanced: true,
        subAccountName: subAccountDisplayName || (isTransfer ? (tx.targetSafeNameAr || tx.targetSafeId) : ''),
        safeId: tx.safeId || '',
        isTaxOfficial: tx.taxDocumentType === 'taxable' || tx.isTaxOfficial === true,
        taxInvoiceNumber: tx.taxDetails?.invoiceNumber || '',
        attachments: Array.isArray(tx.attachments) && tx.attachments.length > 0 ? tx.attachments : (tx.attachment ? [tx.attachment] : []),
        rawTx: tx,
        lines: isTransfer ? [
          {
            accountCode: safeAccountCode,
            accountNameAr: `${safeAccountName} (${tx.targetSafeNameAr || tx.targetSafeId || 'الخزينة المستلمة'})`,
            nature: 'debit',
            debit: amt,
            credit: 0,
            subledgerId: tx.targetSafeId || '',
            subledgerName: tx.targetSafeNameAr || tx.targetSafeId || '',
            subledgerType: 'safe',
            notes: tx.description
          },
          {
            accountCode: safeAccountCode,
            accountNameAr: `${safeAccountName} (${tx.sourceSafeNameAr || tx.sourceSafeId || tx.safeId || 'الخزينة المصدر'})`,
            nature: 'credit',
            debit: 0,
            credit: amt,
            subledgerId: tx.sourceSafeId || tx.safeId || '',
            subledgerName: tx.sourceSafeNameAr || tx.sourceSafeId || tx.safeId || '',
            subledgerType: 'safe',
            notes: tx.description
          }
        ] : (isOut ? [counterLeg, safeLeg] : [safeLeg, counterLeg])
      };
    });

    const accrualStream = journalEntries.map((je) => {
      const sourceGrnId = je.sourceDocId || je.id.replace('JE-REV-', '').replace('JE-', '');
      const sourceGrn = receiptsList.find((r) => r.id === sourceGrnId);
      const sourcePoId = je.poId || sourceGrn?.poId;
      const sourcePo = purchaseOrdersList.find((p) => p.id === sourcePoId);
      const sourceTrnId = je.transferId || je.sourceDocId;
      const sourceTrn = stockTransfersList.find((t) => t.id === sourceTrnId);

      return {
        ...je,
        streamType: 'accrual',
        sourceGrn,
        sourcePo,
        sourceTrn,
        rawJe: je,
        isTaxOfficial: Boolean(je.isTaxOfficial !== undefined ? je.isTaxOfficial : sourceGrn?.isTaxOfficial),
        taxInvoiceNumber: je.taxInvoiceNumber || sourceGrn?.taxInvoiceNumber || '',
        attachments: Array.isArray(je.attachments) ? je.attachments : []
      };
    });

    let merged = [...cashStream, ...accrualStream];
    merged.sort((a, b) => {
      const dateA = a.entryDate || a.createdAt || '';
      const dateB = b.entryDate || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });

    if (journalStreamFilter === 'cash') {
      merged = merged.filter((e) => e.streamType === 'cash');
    } else if (journalStreamFilter === 'accrual') {
      merged = merged.filter((e) => e.streamType === 'accrual' && e.sourceDocType !== 'manual_adjustment');
    } else if (journalStreamFilter === 'manual') {
      merged = merged.filter((e) => e.sourceDocType === 'manual_adjustment');
    }

    return merged;
  }, [transactionsList, journalEntries, receiptsList, purchaseOrdersList, stockTransfersList, accountingLinks, accountsList, safesList, journalStreamFilter]);

  // Resolve all system-generated official slips & uploaded audit attachments for an entry
  const resolveEntryDocuments = (entry) => {
    if (!entry) return { systemDocs: [], uploadedDocs: [] };

    const uploadedDocs = Array.isArray(entry.attachments) ? entry.attachments : [];
    const systemDocs = [];

    // 1. Accounting Journal Voucher (Available for every entry in the General Ledger)
    systemDocs.push({
      id: 'journal_voucher',
      titleAr: 'سند قيد اليومية المحاسبي المعتمد',
      titleEn: 'Accounting Journal Voucher',
      descAr: 'سند محاسبي معتمد بالقيد المزدوج والمديونية والدائنية وتفقيط المبلغ والتوقيعات المعتمدة',
      descEn: 'Double-entry accounting journal slip with debit/credit legs & signatures',
      type: 'journal_voucher',
      badgeAr: 'سند معتمد A4 • متزن 100%',
      badgeEn: 'A4 Voucher',
      icon: 'book',
      action: () => setSelectedJournalVoucherForPrint(entry)
    });

    // 2. Cash Voucher & Custody Slips (For Cash Stream)
    if (entry.streamType === 'cash') {
      const rawTx = entry.rawTx || transactionsList.find((t) => t.id === entry.id) || entry;
      const safeDoc = safesList.find((s) => s.id === (rawTx.safeId || entry.safeId));
      systemDocs.push({
        id: 'cash_voucher',
        titleAr: rawTx.typeAr || (rawTx.direction === 'out' ? 'سند صرف نقدية معتمد' : 'سند تحصيل نقدية معتمد'),
        titleEn: rawTx.typeEn || 'Cash Voucher',
        descAr: `سند معتمد بالخزينة: ${safeDoc?.nameAr || rawTx.safeId || 'الخزينة'} • كود: ${rawTx.id}`,
        descEn: `Safe: ${safeDoc?.nameAr || rawTx.safeId} • ID: ${rawTx.id}`,
        type: 'cash_voucher',
        badgeAr: 'سند نقدية معتمد',
        badgeEn: 'Cash Slip',
        icon: 'receipt',
        action: () => setSelectedCashVoucherForPrint({ voucher: rawTx, safe: safeDoc })
      });

      const isCustodyAdvance = rawTx.type === 'custody_advance' || rawTx.custodyId || rawTx.workerId || rawTx.isCustody;
      if (isCustodyAdvance) {
        const workerDoc = workersList.find((w) => w.id === (rawTx.workerId || rawTx.subAccountId));
        const custodyData = {
          ...rawTx,
          type: rawTx.type === 'custody_advance' ? 'custody_issue' : rawTx.type,
          amount: rawTx.amountInEGP || rawTx.amount || entry.totalDebit,
          workerName: workerDoc?.name || rawTx.workerName || rawTx.subAccountName || entry.subAccountName,
          workerId: rawTx.workerId || rawTx.subAccountId
        };
        systemDocs.push({
          id: 'custody_slip',
          titleAr: 'إقرار استلام وتعهد عهدة مالية معتمد',
          titleEn: 'Custody Acknowledgment Slip',
          descAr: `إقرار العهدة القانوني المعتمد للموظف: ${custodyData.workerName}`,
          descEn: `Legal custody receipt acknowledgment for: ${custodyData.workerName}`,
          type: 'custody_slip',
          badgeAr: 'إقرار عهدة موثق',
          badgeEn: 'Custody Slip',
          icon: 'shield',
          action: () => setSelectedCustodyForPrint(custodyData)
        });
      }
    }

    // 3. Operational Accrual Documents (GRN, RTN, TRN)
    if (entry.streamType === 'accrual') {
      const isReturn = entry.sourceDocType === 'supplier_return' || entry.id?.includes('RTN');
      const sourceGrnId = entry.sourceDocId || entry.id.replace('JE-REV-', '').replace('JE-', '');
      let grnDoc = entry.sourceGrn || receiptsList.find((r) => r.id === sourceGrnId);

      // If not in receiptsList (e.g. legacy or synthetic), synthesize display object
      if (!grnDoc && (entry.sourceDocType === 'goods_receipt' || entry.sourceDocType === 'supplier_return' || entry.id?.startsWith('JE-GRN') || entry.id?.startsWith('JE-RTN') || entry.id?.startsWith('JE-REV-'))) {
        grnDoc = {
          id: sourceGrnId,
          docType: isReturn ? 'return' : 'receipt',
          receiptDate: entry.entryDate || entry.createdAt?.slice(0, 10),
          supplierName: entry.supplierName || entry.subAccountName || 'المورد',
          isTaxOfficial: Boolean(entry.isTaxOfficial),
          taxInvoiceNumber: entry.taxInvoiceNumber || '',
          lines: (entry.lines || []).filter((l) => l.accountCode.startsWith('104')).map((l) => ({
            nameAr: l.accountNameAr || l.accountName,
            receivedSmallUnits: 1,
            unitPrice: l.debit || l.credit,
            smallUnit: 'وحدة',
            targetWarehouse: 'المخزن الرئيسي'
          })),
          financials: {
            hasPricing: true,
            subtotal: entry.totalDebit || 0,
            totalVat: 0,
            totalWht: 0,
            netPayable: entry.totalDebit || 0,
            currency: 'EGP'
          }
        };
      }

      if (grnDoc) {
        systemDocs.push({
          id: 'grn_slip',
          titleAr: isReturn ? 'إذن مرتجع خامات لمورد (RTN)' : 'إذن استلام وتوريد خامات معتمد (GRN)',
          titleEn: isReturn ? 'Supplier Return Note (RTN)' : 'Goods Receipt Note (GRN)',
          descAr: `إذن فحص واستلام معتمد للمورد: ${grnDoc.supplierName} • كود: ${grnDoc.id}`,
          descEn: `Supplier: ${grnDoc.supplierName} • ID: ${grnDoc.id}`,
          type: 'grn_slip',
          badgeAr: isReturn ? 'إذن مرتجع مخزني' : 'إذن إضافة مخزني',
          badgeEn: isReturn ? 'RTN' : 'GRN',
          icon: 'fileText',
          action: () => setSelectedGrnForPrint(grnDoc)
        });
      }

      // If Stock Transfer (TRN)
      const sourceTrnId = entry.transferId || entry.sourceDocId;
      const trnDoc = entry.sourceTrn || stockTransfersList.find((t) => t.id === sourceTrnId);
      if (trnDoc || entry.sourceDocType === 'stock_transfer') {
        const activeTrn = trnDoc || { id: sourceTrnId, transferDate: entry.entryDate, lines: [] };
        systemDocs.push({
          id: 'trn_slip',
          titleAr: 'إذن تحويل وصرف مخزني داخلي (TRN)',
          titleEn: 'Internal Stock Transfer Voucher (TRN)',
          descAr: `إذن تحويل مخزني معتمد • كود: ${activeTrn.id}`,
          descEn: `Transfer Note ID: ${activeTrn.id}`,
          type: 'trn_slip',
          badgeAr: 'إذن تحويل معتمد',
          badgeEn: 'TRN Slip',
          icon: 'transfer',
          action: () => setSelectedTrnForPrint(activeTrn)
        });
      }
    }

    return { systemDocs, uploadedDocs };
  };

  // Filtered Journal Stream by Search, Status, Date Range, and Dual-Ledger Tier
  const filteredJournalList = useMemo(() => {
    return unifiedJournalList.filter((entry) => {
      // 0. Dual Ledger Tier Check:
      // In Official Tax Mode (Default), hide operational transactions that bypassed VAT or lack official tax invoices
      if (activeLedgerMode === LEDGER_MODES.OFFICIAL && !isTransactionTaxOfficial(entry)) {
        return false;
      }

      // 1. Status filter
      if (journalStatusFilter === 'posted' && entry.status === 'reversed') return false;
      if (journalStatusFilter === 'reversed' && entry.status !== 'reversed') return false;

      // 2. Date range filter
      const entryDate = entry.entryDate || entry.createdAt?.slice(0, 10) || '';
      if (journalStartDate && entryDate < journalStartDate) return false;
      if (journalEndDate && entryDate > journalEndDate) return false;

      // 3. Search query filter
      if (journalSearchTerm.trim()) {
        const q = journalSearchTerm.toLowerCase().trim();
        const searchStr = `${entry.entryNumber || entry.id} ${entry.referenceNumber || ''} ${entry.supplierName || ''} ${entry.subAccountName || ''} ${entry.safeId || ''} ${entry.descriptionAr || ''} ${entry.descriptionEn || ''} ${entry.docLabelAr || ''} ${(entry.lines || []).map((l) => `${l.accountCode} ${l.accountNameAr} ${l.notes || ''}`).join(' ')}`.toLowerCase();
        if (!searchStr.includes(q)) return false;
      }

      return true;
    });
  }, [unifiedJournalList, activeLedgerMode, journalStatusFilter, journalStartDate, journalEndDate, journalSearchTerm]);

  // Live Summary Metrics for Filtered Journal Stream
  const journalFilteredTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    filteredJournalList.forEach((e) => {
      if (e.status !== 'reversed') {
        debit += Number(e.totalDebit) || 0;
        credit += Number(e.totalCredit) || 0;
      }
    });
    return {
      debit,
      credit,
      diff: Math.abs(debit - credit),
      isBalanced: Math.abs(debit - credit) < 0.01,
      count: filteredJournalList.length
    };
  }, [filteredJournalList]);

  // Open Reversal Modal
  const handleOpenReversalModal = (entry) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'عفواً، عكس وإلغاء القيود متاح للمسؤولين فقط.' : 'Admin permission required to reverse journal entries.');
      return;
    }
    if (entry.status === 'reversed') {
      alert(isAr ? 'هذا القيد تم عكسه وإلغاؤه بالفعل.' : 'This entry is already reversed.');
      return;
    }
    setReversalModal({
      isOpen: true,
      entry,
      reason: '',
      isSubmitting: false,
      error: ''
    });
  };

  // Confirm and Execute Reversal
  const handleConfirmReversal = async (e) => {
    e.preventDefault();
    const entry = reversalModal.entry;
    if (!entry) return;
    const reason = reversalModal.reason.trim();
    if (!reason) {
      setReversalModal((prev) => ({
        ...prev,
        error: isAr ? 'يرجى إدخال سبب عكس وإلغاء القيد للرقابة والتوثيق' : 'Please provide a reversal reason'
      }));
      return;
    }

    setReversalModal((prev) => ({ ...prev, isSubmitting: true, error: '' }));

    try {
      const currentUserName = currentUser?.name || currentUser?.nameAr || currentUser?.id || 'المسؤول';
      const now = new Date().toISOString();

      if (entry.streamType === 'cash') {
        // Reverse cash voucher using atomic transaction in cashLedgerEngine
        await reverseCashVoucher({
          voucherId: entry.id,
          reason,
          currentUser
        });
      } else {
        // Accrual / Journal Entry reversal
        const batch = writeBatch(db);

        // 1. Mark original journal entry as reversed
        const originalJeRef = doc(db, 'journal_entries', entry.id);
        const reversalJeId = `JE-REV-${entry.sourceDocId || entry.id.replace('JE-', '')}`;
        batch.update(originalJeRef, {
          status: 'reversed',
          isReversed: true,
          reversalEntryId: reversalJeId,
          reversalReason: reason,
          reversedBy: currentUserName,
          reversedAt: now,
          updatedAt: now
        });

        // 2. Build and post reversing entry with inverted debit/credit legs
        const reversalPayload = buildGrnReversalJournalEntry(entry, reason, currentUserName);
        if (reversalPayload) {
          const revJeRef = doc(db, 'journal_entries', reversalJeId);
          batch.set(revJeRef, {
            ...reversalPayload,
            id: reversalJeId,
            entryNumber: reversalJeId,
            status: 'posted',
            createdAt: now,
            updatedAt: now
          });
        }

        // 3. If linked to goods_receipt, also mark it reversed in operations
        const sourceDocId = entry.sourceDocId || entry.id.replace('JE-REV-', '').replace('JE-', '');
        if (sourceDocId) {
          const grnRef = doc(db, 'goods_receipts', sourceDocId);
          batch.set(grnRef, {
            status: 'reversed',
            isReversed: true,
            reversalReason: reason,
            reversedBy: currentUserName,
            reversedAt: now,
            updatedAt: now
          }, { merge: true });
        }

        await batch.commit();
      }

      setReversalModal({ isOpen: false, entry: null, reason: '', isSubmitting: false, error: '' });
      setSuccessMsg(
        isAr
          ? `تم عكس وإلغاء القيد (${entry.entryNumber || entry.id}) بنجاح ✓`
          : `Journal entry (${entry.entryNumber || entry.id}) reversed successfully ✓`
      );
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setReversalModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err.message || 'Error executing reversal'
      }));
    }
  };

  // Trial Balance Live Computation (Cash Vouchers + Procurement Accruals with Strict Child Adherence & Hierarchical Rollup)
  const trialBalanceData = useMemo(() => {
    const map = {};
    accountsList.forEach((acc) => {
      let level = Number(acc.level);
      if (!Number.isFinite(level) || level < 1) {
        if (!acc.parentCode && !acc.parentAccountId) level = 1;
        else if (String(acc.code).length <= 3) level = 2;
        else if (String(acc.code).length <= 5 && !String(acc.code).includes('-')) level = 3;
        else level = 4;
      }

      map[acc.code] = {
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn || acc.nameAr,
        statement: acc.statement || (['1', '2'].includes(String(acc.code).charAt(0)) ? 'balance_sheet' : 'income_statement'),
        nature: acc.nature || (['1', '5', '3'].includes(String(acc.code).charAt(0)) ? 'debit' : 'credit'),
        reportCategory: acc.reportCategory,
        level,
        parentCode: String(acc.parentCode || acc.parentAccountId || '').trim(),
        type: acc.type,
        // Opening balance (prior to tbStartDate)
        openingDebit: 0,
        openingCredit: 0,
        openingNet: 0,
        // Period movements (between tbStartDate and tbEndDate)
        periodDebit: 0,
        periodCredit: 0,
        periodNet: 0,
        // Ending balances (cumulative <= tbEndDate)
        debit: 0,
        credit: 0,
        netBalance: 0,
        txCount: 0
      };
    });

    const safeCode = accountingLinks.cashSafesAccount?.code || '1020101';
    const isDateFiltered = Boolean(tbStartDate || tbEndDate);

    const resolveDocDate = (doc) => {
      if (!doc) return '';
      const raw = doc.entryDate || doc.date || doc.createdAt || doc.timestamp;
      if (!raw) return '';
      if (typeof raw === 'string') return raw.slice(0, 10);
      if (raw.toDate && typeof raw.toDate === 'function') {
        return raw.toDate().toISOString().slice(0, 10);
      }
      return '';
    };

    // 1. Process cash transactions with Strict Child Adherence
    transactionsList.forEach((v) => {
      if (v.status !== 'posted') return;
      if (activeLedgerMode === LEDGER_MODES.OFFICIAL && !isTransactionTaxOfficial(v)) return;
      if (tbCostCenterFilter !== 'all' && v.costCenterId && v.costCenterId !== tbCostCenterFilter) return;

      const amt = Number(v.amountInEGP) || Number(v.amount) || 0;
      if (amt <= 0) return;

      const isSurplus = v.type === 'balance_adjustment' && v.direction === 'in';
      let accCode = String(v.mainAccount || '').trim();
      const subCode = String(v.subAccountId || v.subAccountCode || v.childAccountCode || '').trim();

      // Strict child account adherence: prioritize child account code over father account
      if (subCode && map[subCode]) {
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
        accCode = '3010201';
      } else if (accCode === 'opex' || accCode === 'general_admin_exp') {
        accCode = '3010207';
      }

      const txDate = resolveDocDate(v);
      if (tbEndDate && txDate && txDate > tbEndDate) return;
      const isPriorToPeriod = Boolean(tbStartDate && txDate && txDate < tbStartDate);

      if (v.direction === 'out') {
        if (map[accCode]) {
          map[accCode].txCount += 1;
          if (isPriorToPeriod) map[accCode].openingDebit += amt;
          else map[accCode].periodDebit += amt;
        }
        if (map[safeCode]) {
          map[safeCode].txCount += 1;
          if (isPriorToPeriod) map[safeCode].openingCredit += amt;
          else map[safeCode].periodCredit += amt;
        }
      } else if (v.direction === 'in') {
        if (map[safeCode]) {
          map[safeCode].txCount += 1;
          if (isPriorToPeriod) map[safeCode].openingDebit += amt;
          else map[safeCode].periodDebit += amt;
        }
        if (map[accCode]) {
          map[accCode].txCount += 1;
          if (isPriorToPeriod) map[accCode].openingCredit += amt;
          else map[accCode].periodCredit += amt;
        }
      }
    });

    // 2. Process accrual journal entries
    journalEntries.forEach((je) => {
      if (je.status !== 'posted') return;
      if (activeLedgerMode === LEDGER_MODES.OFFICIAL && !isTransactionTaxOfficial(je)) return;

      const jeDate = resolveDocDate(je);
      if (tbEndDate && jeDate && jeDate > tbEndDate) return;
      const isPriorToPeriod = Boolean(tbStartDate && jeDate && jeDate < tbStartDate);

      (je.lines || []).forEach((line) => {
        if (tbCostCenterFilter !== 'all' && (line.costCenterId || je.costCenterId) && (line.costCenterId || je.costCenterId) !== tbCostCenterFilter) return;

        const code = String(line.accountCode || '').trim();
        const debitAmt = Number(line.debit) || 0;
        const creditAmt = Number(line.credit) || 0;
        if (!code) return;
        if (debitAmt === 0 && creditAmt === 0) return;

        if (!map[code]) {
          map[code] = {
            code,
            nameAr: line.accountNameAr || code,
            nameEn: line.accountNameAr || code,
            statement: ['1', '2'].includes(code.charAt(0)) ? 'balance_sheet' : 'income_statement',
            nature: ['1', '5', '3'].includes(code.charAt(0)) ? 'debit' : 'credit',
            reportCategory: 'other',
            level: 4,
            parentCode: '',
            type: 'sub',
            openingDebit: 0,
            openingCredit: 0,
            openingNet: 0,
            periodDebit: 0,
            periodCredit: 0,
            periodNet: 0,
            debit: 0,
            credit: 0,
            netBalance: 0,
            txCount: 0
          };
        }

        map[code].txCount += 1;
        if (isPriorToPeriod) {
          map[code].openingDebit += debitAmt;
          map[code].openingCredit += creditAmt;
        } else {
          map[code].periodDebit += debitAmt;
          map[code].periodCredit += creditAmt;
        }
      });
    });

    // 3. Finalize raw account calculations
    Object.values(map).forEach((r) => {
      r.debit = r.openingDebit + r.periodDebit;
      r.credit = r.openingCredit + r.periodCredit;
      r.netBalance = r.nature === 'debit' ? (r.debit - r.credit) : (r.credit - r.debit);
      r.openingNet = r.nature === 'debit' ? (r.openingDebit - r.openingCredit) : (r.openingCredit - r.openingDebit);
      r.periodNet = r.nature === 'debit' ? (r.periodDebit - r.periodCredit) : (r.periodCredit - r.periodDebit);

      // Default rollup to own figures
      r.rollupDebit = r.debit;
      r.rollupCredit = r.credit;
      r.rollupNetBalance = r.netBalance;
      r.rollupPeriodDebit = r.periodDebit;
      r.rollupPeriodCredit = r.periodCredit;
      r.rollupPeriodNet = r.periodNet;
      r.rollupOpeningDebit = r.openingDebit;
      r.rollupOpeningCredit = r.openingCredit;
      r.rollupOpeningNet = r.openingNet;
      r.hasChildren = false;
      r.childrenCount = 0;
    });

    // 4. Hierarchical Bottom-Up Rollup
    const childrenByParent = new Map();
    Object.values(map).forEach((acc) => {
      let p = acc.parentCode;
      if (!p && acc.level > 1) {
        if (acc.code.length > 5) p = acc.code.slice(0, 5);
        else if (acc.code.length > 3) p = acc.code.slice(0, 3);
        else if (acc.code.length > 1) p = acc.code.slice(0, 1);
      }
      if (p) {
        if (!childrenByParent.has(p)) childrenByParent.set(p, []);
        childrenByParent.get(p).push(acc.code);
      }
    });

    const computeRollup = (code, visited = new Set()) => {
      if (visited.has(code)) return { debit: 0, credit: 0, periodDebit: 0, periodCredit: 0, openingDebit: 0, openingCredit: 0 };
      visited.add(code);
      const node = map[code];
      if (!node) return { debit: 0, credit: 0, periodDebit: 0, periodCredit: 0, openingDebit: 0, openingCredit: 0 };

      let rDebit = node.debit;
      let rCredit = node.credit;
      let rPeriodDebit = node.periodDebit;
      let rPeriodCredit = node.periodCredit;
      let rOpeningDebit = node.openingDebit;
      let rOpeningCredit = node.openingCredit;

      const children = childrenByParent.get(code) || [];
      children.forEach((cCode) => {
        const cRes = computeRollup(cCode, visited);
        rDebit += cRes.debit;
        rCredit += cRes.credit;
        rPeriodDebit += cRes.periodDebit;
        rPeriodCredit += cRes.periodCredit;
        rOpeningDebit += cRes.openingDebit;
        rOpeningCredit += cRes.openingCredit;
      });

      node.rollupDebit = rDebit;
      node.rollupCredit = rCredit;
      node.rollupNetBalance = node.nature === 'debit' ? (rDebit - rCredit) : (rCredit - rDebit);
      node.rollupPeriodDebit = rPeriodDebit;
      node.rollupPeriodCredit = rPeriodCredit;
      node.rollupPeriodNet = node.nature === 'debit' ? (rPeriodDebit - rPeriodCredit) : (rPeriodCredit - rPeriodDebit);
      node.rollupOpeningDebit = rOpeningDebit;
      node.rollupOpeningCredit = rOpeningCredit;
      node.rollupOpeningNet = node.nature === 'debit' ? (rOpeningDebit - rOpeningCredit) : (rOpeningCredit - rOpeningDebit);
      node.hasChildren = children.length > 0;
      node.childrenCount = children.length;

      return {
        debit: rDebit,
        credit: rCredit,
        periodDebit: rPeriodDebit,
        periodCredit: rPeriodCredit,
        openingDebit: rOpeningDebit,
        openingCredit: rOpeningCredit
      };
    };

    // Trigger rollup from roots
    Object.values(map).forEach((acc) => {
      if (!acc.parentCode || !map[acc.parentCode]) {
        computeRollup(acc.code);
      }
    });

    // 5. Compute Grand Totals across Leaf / Posting accounts (Zero Double Counting)
    let totalDebits = 0;
    let totalCredits = 0;
    let totalPeriodDebits = 0;
    let totalPeriodCredits = 0;
    let totalOpeningDebits = 0;
    let totalOpeningCredits = 0;

    Object.values(map).forEach((r) => {
      // Sum only posting/leaf accounts (or accounts with direct raw postings that have no active children)
      if (!r.hasChildren) {
        totalDebits += r.debit;
        totalCredits += r.credit;
        totalPeriodDebits += r.periodDebit;
        totalPeriodCredits += r.periodCredit;
        totalOpeningDebits += r.openingDebit;
        totalOpeningCredits += r.openingCredit;
      }
    });

    // 6. Apply Active View & Dimension Filters
    const searchClean = (tbSearchTerm || '').trim().toLowerCase();
    const rows = Object.values(map)
      .filter((r) => {
        // Search Filter
        if (searchClean) {
          const codeMatch = String(r.code).toLowerCase().includes(searchClean);
          const nameArMatch = String(r.nameAr || '').toLowerCase().includes(searchClean);
          const nameEnMatch = String(r.nameEn || '').toLowerCase().includes(searchClean);
          if (!codeMatch && !nameArMatch && !nameEnMatch) return false;
        }

        // Level Filter
        if (tbLevelFilter !== 'all' && String(r.level) !== String(tbLevelFilter)) {
          return false;
        }

        // Statement Filter
        if (tbStatementFilter !== 'all' && r.statement !== tbStatementFilter) {
          return false;
        }

        // Balance & Movement Filter: Parent accounts evaluate against rollup balance!
        const evalDebit = r.hasChildren ? r.rollupDebit : r.debit;
        const evalCredit = r.hasChildren ? r.rollupCredit : r.credit;
        const evalNet = r.hasChildren ? r.rollupNetBalance : r.netBalance;

        if (tbBalanceFilter === 'with_movement') {
          if (evalDebit === 0 && evalCredit === 0) return false;
        } else if (tbBalanceFilter === 'non_zero') {
          if (Math.abs(evalNet) < 0.001) return false;
        } else if (tbBalanceFilter === 'zero_only') {
          if (evalDebit > 0 || evalCredit > 0 || Math.abs(evalNet) >= 0.001) return false;
        } else if (tbBalanceFilter === 'debit_only') {
          const isDebitBal = r.nature === 'debit' ? evalNet > 0 : evalNet < 0;
          if (!isDebitBal) return false;
        } else if (tbBalanceFilter === 'credit_only') {
          const isCreditBal = r.nature === 'credit' ? evalNet > 0 : evalNet < 0;
          if (!isCreditBal) return false;
        }

        return true;
      });

    // 7. Sort Rows
    rows.sort((a, b) => String(a.code).localeCompare(String(b.code)));

    return {
      rows,
      allAccountsCount: Object.keys(map).length,
      filteredCount: rows.length,
      totalDebits,
      totalCredits,
      totalPeriodDebits,
      totalPeriodCredits,
      totalOpeningDebits,
      totalOpeningCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      isDateFiltered
    };
  }, [
    accountsList,
    transactionsList,
    journalEntries,
    accountingLinks,
    activeLedgerMode,
    tbSearchTerm,
    tbLevelFilter,
    tbStatementFilter,
    tbBalanceFilter,
    tbPeriodPreset,
    tbStartDate,
    tbEndDate,
    tbCostCenterFilter,
    tbViewMode
  ]);

  // Dynamic Sub-Ledger Entities Breakdown Calculation
  const subLedgerEntities = useMemo(() => {
    if (!subLedgerModal.isOpen || !subLedgerModal.targetRole) return [];
    const role = subLedgerModal.targetRole;
    const q = (subLedgerModal.searchTerm || '').toLowerCase().trim();

    if (role === 'supplier') {
      return suppliersList
        .filter((s) => {
          if (!q) return true;
          const str = `${s.id} ${s.name || ''} ${s.taxpayerLegalName || ''} ${s.vatRegistrationNumber || ''} ${s.phone || ''}`.toLowerCase();
          return str.includes(q);
        })
        .map((s) => {
          let totalBilled = 0;
          let billsCount = 0;
          journalEntries.forEach((je) => {
            if (je.status !== 'posted') return;
            if (je.supplierId === s.id || je.supplierName === s.name) {
              const net = Number(je.financials?.netPayable) || 0;
              if (je.sourceDocType === 'supplier_return') {
                totalBilled -= net;
              } else {
                totalBilled += net;
                billsCount++;
              }
            }
          });

          let totalPaid = 0;
          let paymentsCount = 0;
          transactionsList.forEach((tx) => {
            if (tx.status !== 'posted') return;
            if (tx.subAccountId === s.id || tx.subAccountName === s.name || tx.beneficiaryName === s.name) {
              const amt = Number(tx.amountInEGP) || Number(tx.amount) || 0;
              if (tx.direction === 'out') {
                totalPaid += amt;
                paymentsCount++;
              } else if (tx.direction === 'in') {
                totalPaid -= amt;
              }
            }
          });

          const netBalance = totalBilled - totalPaid; // Net payable to supplier
          return {
            id: s.id,
            name: s.name || s.taxpayerLegalName || s.id,
            identifier: s.vatRegistrationNumber || s.taxNumber || s.phone || 'N/A',
            phone: s.phone || '',
            debit: totalPaid,
            credit: totalBilled,
            netBalance,
            billsCount,
            paymentsCount,
            raw: s
          };
        });
    }

    if (role === 'worker') {
      return workersList
        .filter((w) => {
          if (!q) return true;
          const str = `${w.id} ${w.nameAr || ''} ${w.name || ''} ${w.role || ''} ${w.phone || ''}`.toLowerCase();
          return str.includes(q);
        })
        .map((w) => {
          let custodiesIssued = 0;
          let custodiesSettled = 0;
          transactionsList.forEach((tx) => {
            if (tx.status !== 'posted') return;
            if (tx.subAccountId === w.id || tx.subAccountName === (w.nameAr || w.name) || tx.workerId === w.id) {
              const amt = Number(tx.amountInEGP) || Number(tx.amount) || 0;
              if (tx.direction === 'out') {
                custodiesIssued += amt;
              } else if (tx.direction === 'in') {
                custodiesSettled += amt;
              }
            }
          });
          const netBalance = custodiesIssued - custodiesSettled;
          return {
            id: w.id,
            name: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
            identifier: w.role || (isAr ? 'عامل إنتاج' : 'Worker'),
            phone: w.phone || '',
            debit: custodiesIssued,
            credit: custodiesSettled,
            netBalance,
            raw: w
          };
        });
    }

    if (role === 'client') {
      return clientsList
        .filter((c) => {
          if (!q) return true;
          const str = `${c.id} ${c.name || ''} ${c.tradeName || ''} ${c.phone || ''}`.toLowerCase();
          return str.includes(q);
        })
        .map((c) => {
          let totalInvoiced = Number(c.totalInvoiced) || 0;
          let totalCollected = 0;
          transactionsList.forEach((tx) => {
            if (tx.status !== 'posted') return;
            if (tx.subAccountId === c.id || tx.subAccountName === c.name) {
              const amt = Number(tx.amountInEGP) || Number(tx.amount) || 0;
              if (tx.direction === 'in') totalCollected += amt;
            }
          });
          const netBalance = totalInvoiced - totalCollected;
          return {
            id: c.id,
            name: c.name || c.tradeName || c.id,
            identifier: c.taxNumber || c.phone || 'N/A',
            phone: c.phone || '',
            debit: totalInvoiced,
            credit: totalCollected,
            netBalance,
            raw: c
          };
        });
    }

    if (role === 'safe') {
      return safesList
        .filter((sf) => !q || `${sf.id} ${sf.nameAr} ${sf.nameEn || ''}`.toLowerCase().includes(q))
        .map((sf) => {
          const bal = sf.balances?.[sf.defaultCurrency || 'EGP']?.currentBalance ?? 0;
          return {
            id: sf.id,
            name: isAr ? sf.nameAr : (sf.nameEn || sf.nameAr),
            identifier: `${sf.defaultCurrency || 'EGP'} — سقف الأمان: ${(sf.maxSafetyLimit || 0).toLocaleString()} ج.م`,
            debit: bal,
            credit: 0,
            netBalance: bal,
            raw: sf
          };
        });
    }

    if (role === 'bank') {
      return banksList
        .filter((b) => !q || `${b.id} ${b.bankNameAr} ${b.accountNumber || ''}`.toLowerCase().includes(q))
        .map((b) => {
          const bal = Number(b.currentBalance) || 0;
          return {
            id: b.id,
            name: isAr ? b.bankNameAr : (b.bankNameEn || b.bankNameAr),
            identifier: `رقم الحساب: ${b.accountNumber || 'N/A'} (${b.currency || 'EGP'})`,
            debit: bal,
            credit: 0,
            netBalance: bal,
            raw: b
          };
        });
    }

    if (role === 'inventory') {
      return warehousesList
        .filter((wh) => !q || `${wh.id} ${wh.code || ''} ${wh.nameAr || ''}`.toLowerCase().includes(q))
        .map((wh) => {
          return {
            id: wh.id || wh.code,
            name: isAr ? (wh.nameAr || wh.code) : (wh.nameEn || wh.code),
            identifier: `كود: ${wh.code || wh.id} — الموقع: ${wh.location || (isAr ? 'المصنع' : 'Factory')}`,
            debit: 0,
            credit: 0,
            netBalance: 0,
            raw: wh
          };
        });
    }

    return [];
  }, [subLedgerModal, suppliersList, clientsList, workersList, safesList, banksList, warehousesList, journalEntries, transactionsList, isAr]);

  // Detailed Statement for the selected subledger entity
  const selectedEntityTransactions = useMemo(() => {
    if (!subLedgerModal.isOpen || !subLedgerModal.selectedEntity) return [];
    const ent = subLedgerModal.selectedEntity;
    const role = subLedgerModal.targetRole;
    const entId = ent.id;
    const entName = ent.name;

    const list = [];

    unifiedJournalList.forEach((j) => {
      const matchesSupplier = role === 'supplier' && (j.supplierId === entId || j.supplierName === entName || j.subAccountName === entName || (j.lines || []).some((l) => l.subledgerId === entId || l.subledgerName === entName));
      const matchesWorker = role === 'worker' && (j.subAccountName === entName || (j.lines || []).some((l) => l.subledgerId === entId || l.subledgerName === entName));
      const matchesClient = role === 'client' && (j.subAccountName === entName || (j.lines || []).some((l) => l.subledgerId === entId));
      const matchesSafe = role === 'safe' && (j.safeId === entId || (j.lines || []).some((l) => l.subledgerId === entId));

      if (matchesSupplier || matchesWorker || matchesClient || matchesSafe) {
        let debit = 0;
        let credit = 0;
        (j.lines || []).forEach((l) => {
          if (l.subledgerId === entId || l.subledgerName === entName || (role === 'supplier' && (l.accountCode === '2020101' || l.subledgerType === 'supplier'))) {
            debit += Number(l.debit) || 0;
            credit += Number(l.credit) || 0;
          }
        });

        if (debit === 0 && credit === 0) {
          debit = Number(j.totalDebit) || 0;
          credit = Number(j.totalCredit) || 0;
        }

        list.push({
          id: j.id,
          date: j.entryDate || j.createdAt?.slice(0, 10),
          docLabel: j.docLabelAr || j.sourceDocType,
          streamType: j.streamType,
          reference: j.referenceNumber || j.id,
          description: j.descriptionAr || j.description,
          debit,
          credit,
          status: j.status
        });
      }
    });

    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return list;
  }, [subLedgerModal, unifiedJournalList]);

  return (
    <div className={`space-y-4 ${isAr ? 'text-right' : 'text-left'}`}>
      {/* Compact Metrics Bar & Dual-Ledger Secret Door Control */}
      <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-500 font-medium">{isAr ? 'إجمالي الحسابات:' : 'Total:'}</span>
            <strong className="font-mono font-bold text-slate-900">{metrics.total}</strong>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-emerald-800">
            <span className="font-medium">{isAr ? 'أستاذ عام:' : 'Main GL:'}</span>
            <strong className="font-mono font-bold text-emerald-700">{metrics.mainCount}</strong>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50/60 border border-indigo-200 text-indigo-800">
            <span className="font-medium">{isAr ? 'أستاذ مساعد:' : 'Sub-Ledgers:'}</span>
            <strong className="font-mono font-bold text-indigo-700">{metrics.subCount}</strong>
          </div>
        </div>

        {/* Discreet Lock Access */}
        <SecretLockButton
          isUnlocked={isMasterDoorUnlocked}
          activeMode={activeLedgerMode}
          onLongPress={() => setShowSecretDoorModal(true)}
          onLock={handleLockMaster}
          onToggleMode={handleToggleLedgerMode}
          isAr={isAr}
        />
      </div>

      {/* Sub-tab Navigation Dock (Segmented Control Hierarchy) */}
      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto">
        {/* 1. Journal Ledger (Default Subtab 1) */}
        <button
          type="button"
          onClick={() => setActiveSubTab('journal')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeSubTab === 'journal'
              ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FileText className={`h-4 w-4 ${activeSubTab === 'journal' ? 'text-indigo-600' : 'text-slate-500'}`} />
          <span>{isAr ? '١. قيود وسجل اليومية' : '1. Journal Ledger'}</span>
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md ${
            activeSubTab === 'journal' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'bg-slate-200 text-slate-600'
          }`}>
            {unifiedJournalList.length}
          </span>
        </button>

        {/* 2. Trial Balance (Subtab 2) */}
        <button
          type="button"
          onClick={() => setActiveSubTab('trial_balance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeSubTab === 'trial_balance'
              ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Scale className={`h-4 w-4 ${activeSubTab === 'trial_balance' ? 'text-indigo-600' : 'text-slate-500'}`} />
          <span>{isAr ? '٢. ميزان المراجعة' : '2. Trial Balance'}</span>
          {trialBalanceData.isBalanced ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" title={isAr ? 'متزن' : 'Balanced'} />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-200" title={isAr ? 'غير متزن' : 'Unbalanced'} />
          )}
        </button>

        {/* 3. Chart of Accounts Directory (Subtab 3) */}
        <button
          type="button"
          onClick={() => setActiveSubTab('directory')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeSubTab === 'directory'
              ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FolderTree className={`h-4 w-4 ${activeSubTab === 'directory' ? 'text-indigo-600' : 'text-slate-500'}`} />
          <span>{isAr ? '٣. دليل وشجرة الحسابات' : '3. COA Directory & Tree'}</span>
        </button>

        {/* 4. Master Links & Mapping (Subtab 4) */}
        <button
          type="button"
          onClick={() => setActiveSubTab('master_links')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
            activeSubTab === 'master_links'
              ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Link2 className={`h-4 w-4 ${activeSubTab === 'master_links' ? 'text-emerald-600' : 'text-slate-500'}`} />
          <span>{isAr ? '٤. ربط الحسابات العامة بالقوائم' : '4. GL & Master Mapping'}</span>
        </button>
      </div>

      {/* Notifications / Alerts */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 1: COA DIRECTORY & TREE                                            */}
      {/* ========================================================================= */}
      {activeSubTab === 'directory' && (
        <div className="space-y-4">
          {/* Informative Guidance Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-4 shadow-md border border-slate-700/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BookOpen className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs sm:text-sm font-black">
                    {isAr ? 'دليل إعداد وتبويب شجرة الحسابات للقوائم المالية' : 'Chart of Accounts Architecture & Financial Statement Mapping'}
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    {isAr
                      ? 'تحديد خصائص كل حساب (القائمة، التبويب، التدفقات النقدية، والطبيعة) يتيح إعداد القوائم الختامية آلياً دون تدخل بشري.'
                      : 'Configuring statement, category, cash flow, and nature allows automatic, zero-friction financial statement preparation.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition cursor-pointer shrink-0"
              >
                <Info className="h-3.5 w-3.5 text-emerald-400" />
                <span>{showGuide ? (isAr ? 'إخفاء الشرح' : 'Hide Guide') : (isAr ? 'شرح التبويبات' : 'Show Guide')}</span>
                {showGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showGuide && (
              <div className="mt-3.5 pt-3.5 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
                <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <div className="font-extrabold text-blue-300 mb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    {isAr ? '١- القائمة المستهدفة (Statement)' : '1. Target Statement'}
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {isAr
                      ? 'المركز المالي (أصول وخصوم مستمرة) أو قائمة الدخل (إيرادات ومصروفات فترة تقفل في الأرباح).'
                      : 'Balance Sheet (permanent cumulative assets/liabilities) vs Income Statement (periodic revenues & expenses).'}
                  </p>
                </div>

                <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <div className="font-extrabold text-emerald-300 mb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    {isAr ? '٢- التبويب المحاسبي (Category)' : '2. Report Category'}
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {isAr
                      ? 'أصل متداول، أصل ثابت، التزام، تكلفة بضاعة مباعة (خامات/عمالة)، مصروفات بيع، أو مصروفات إدارية.'
                      : 'Current Assets, Fixed Assets, Current Liabilities, COGS, Selling OPEX, or General Admin.'}
                  </p>
                </div>

                <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <div className="font-extrabold text-amber-300 mb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {isAr ? '٣- التدفق النقدي (Cash Flow)' : '3. Cash Flow Type'}
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {isAr
                      ? 'تشغيلي (تحصيلات ومدفوعات تشغيل)، استثماري (ماكينات وأصول)، تمويلي (رأس مال)، أو نقدية (الخزن والبنوك).'
                      : 'Operating (trade collections/expenses), Investing (assets/machinery), Financing (capital), or Cash Equivalent.'}
                  </p>
                </div>

                <div className="bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <div className="font-extrabold text-purple-300 mb-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    {isAr ? '٤- مراكز التكلفة (Cost Center)' : '4. Cost Center Tagging'}
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {isAr
                      ? 'إلزامية تحديد خط الإنتاج أو القسم عند تسجيل السند لتمكين استخراج قائمة دخل تفصيلية لكل مركز.'
                      : 'Mandatory tagging of production line, workshop, or fleet when posting vouchers for deep cost analysis.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar & Filters */}
          <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isAr ? 'بحث برقم أو اسم الحساب أو الوصف...' : 'Search by code, account name, or notes...'}
                    className="w-full px-3 py-2 ps-8 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 font-bold"
                  />
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute start-2.5 top-3" />
                </div>

                {/* Type Filter */}
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${filterType === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {isAr ? 'الكل' : 'All'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('main')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${filterType === 'main' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {isAr ? 'الأستاذ العام' : 'Main GL'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('sub')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${filterType === 'sub' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {isAr ? 'المساعد' : 'Sub-Ledger'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Instant Download of Pre-filled 127-Account Sheet in New 16-Column Structure */}
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  title={isAr ? 'تحميل شجرة الحسابات المرفوعة مسبقاً (١٢٧ حساب) مملوءة بالكامل وفق الهيكل الجديد (١٦ عمود)' : 'Download 127-Account Sheet in New 16-Column Structure'}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs transition cursor-pointer shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-700" />
                  <span>{isAr ? 'تحميل الشيت المحدث (١٢٧ حساب - CSV)' : 'Download Updated 127-Account CSV'}</span>
                </button>

                {/* Export Live COA */}
                <button
                  type="button"
                  onClick={handleExportCurrentCOA}
                  title={isAr ? 'تصدير شجرة الحسابات الحالية المسجلة بالنظام بالهيكل الجديد (١٦ عمود)' : 'Export Current Live COA'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-slate-600" />
                  <span>{isAr ? 'تصدير الشجرة الحالية' : 'Export Live COA'}</span>
                </button>

                {/* 1-Click Sync of Updated 127-Account Structure */}
                {isGeneralAdmin && (
                  <button
                    type="button"
                    onClick={handlePreviewPreconfigured127}
                    title={isAr ? 'معاينة وتطبيق الهيكلة المحدثة للـ ١٢٧ حساب مباشرة على قاعدة البيانات' : 'Preview & Sync Updated 127 Accounts'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs transition cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-amber-700" />
                    <span>{isAr ? 'تطبيق الهيكلة المحدثة (١٢٧ حساب)' : 'Sync 127 Standard Accounts'}</span>
                  </button>
                )}

                {/* Import CSV */}
                <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition cursor-pointer shadow-2xs">
                  <Upload className="h-3.5 w-3.5 text-emerald-700" />
                  <span>{isAr ? 'استيراد CSV' : 'Import CSV'}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>

                {/* Add Account */}
                {isGeneralAdmin && (
                  <button
                    type="button"
                    onClick={() => handleOpenCreate()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow-xs"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>{isAr ? '+ حساب جديد' : '+ New Account'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Statement Filter Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-200 text-xs">
              <span className="text-slate-400 font-bold text-[11px]">{isAr ? 'القائمة المالية:' : 'Statement:'}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFilterStatement('all')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                    filterStatement === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'جميع القوائم' : 'All Statements'}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatement('balance_sheet')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                    filterStatement === 'balance_sheet' ? 'bg-blue-700 text-white' : 'bg-white border border-blue-200 text-blue-800 hover:bg-blue-50'
                  }`}
                >
                  {isAr ? 'قائمة المركز المالي (الميزانية العمومية)' : 'Balance Sheet'}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatement('income_statement')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                    filterStatement === 'income_statement' ? 'bg-emerald-700 text-white' : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                  }`}
                >
                  {isAr ? 'قائمة الدخل (الأرباح والخسائر)' : 'Income Statement (P&L)'}
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-100/90 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 text-start">{isAr ? 'الكود والمستوى' : 'Code & Level'}</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'اسم الحساب المحاسبي' : 'Account Name'}</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'القائمة والتبويب والتأثير' : 'Statement, Section & Effect'}</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'التدفق النقدي' : 'Cash Flow'}</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'الطبيعة' : 'Nature'}</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'الأستاذ المساعد' : 'Sub-Ledger'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400">
                        <BookOpen className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                        <p className="font-bold text-sm">{isAr ? 'لا توجد حسابات مطابقة لمعايير البحث' : 'No matching accounts found'}</p>
                        <p className="text-xs mt-1 text-slate-500">
                          {isAr
                            ? 'يمكنك تحميل النموذج وملؤه واستيراده أو إضافة حسابات جديدة.'
                            : 'Download the template, fill it in, and import it, or add new accounts manually.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((acc) => {
                      const isSub = acc.type === 'sub';
                      const isBalanceSheet = acc.statement === 'balance_sheet';
                      const catConfig = ACCOUNT_REPORT_CATEGORIES.find((c) => c.id === acc.reportCategory);
                      const cashFlowConfig = ACCOUNT_CASH_FLOW_CATEGORIES.find((cf) => cf.id === acc.cashFlowCategory);
                      const subTypeConfig = ACCOUNT_SUBTYPES.find((st) => st.id === acc.subType);
                      const accLevel = Number(acc.level) || 1;
                      const isContra = acc.statementEffect === 'deduct';
                      const isSectionHeader = acc.reportCategory === 'section_header';

                      return (
                        <tr key={acc.id || acc.code} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{acc.code || acc.id}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-black border ${
                                accLevel === 1 ? 'bg-slate-900 text-white border-slate-900'
                                : accLevel === 2 ? 'bg-blue-100 text-blue-900 border-blue-200'
                                : accLevel === 3 ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                L{accLevel}
                              </span>
                            </div>
                            {acc.parentCode && (
                              <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                                {isAr ? `الأب: ${acc.parentCode}` : `Parent: ${acc.parentCode}`}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 max-w-[260px]">
                            <div
                              className="font-extrabold text-slate-800 leading-snug"
                              style={{ paddingInlineStart: `${Math.max(0, accLevel - 1) * 8}px` }}
                            >
                              {accLevel > 1 && <span className="text-slate-300 me-1">└</span>}
                              {acc.nameAr}
                            </div>
                            {acc.nameEn && acc.nameEn !== acc.nameAr && (
                              <div className="text-[10px] text-slate-400 font-sans">{acc.nameEn}</div>
                            )}
                            {(acc.descriptionAr || acc.descriptionEn) && (
                              <div className="text-[10px] text-slate-500 whitespace-normal break-words leading-relaxed mt-0.5" title={isAr ? acc.descriptionAr : acc.descriptionEn}>
                                {isAr ? acc.descriptionAr : (acc.descriptionEn || acc.descriptionAr)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                                  isBalanceSheet ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {isBalanceSheet ? (isAr ? 'المركز المالي' : 'Balance Sheet') : (isAr ? 'قائمة الدخل' : 'Income Statement')}
                                </span>
                                {isSectionHeader ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    {isAr ? 'عنوان تجميعي' : 'Section Header'}
                                  </span>
                                ) : (
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black border ${
                                    isContra
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-emerald-50/70 text-emerald-800 border-emerald-200'
                                  }`}>
                                    {isContra ? (isAr ? '(-) يخصم / عكسي' : '(-) Deduct') : (isAr ? '(+) يضاف' : '(+) Add')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-bold text-slate-700">
                                {isAr ? catConfig?.labelAr : (catConfig?.labelEn || acc.reportCategory)}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {isAr ? cashFlowConfig?.labelAr : (cashFlowConfig?.labelEn || acc.cashFlowCategory)}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              acc.nature === 'debit' ? 'bg-emerald-100/70 text-emerald-900' : 'bg-indigo-100/70 text-indigo-900'
                            }`}>
                              {acc.nature === 'debit' ? (isAr ? 'مدين' : 'Debit') : (isAr ? 'دائن' : 'Credit')}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="space-y-0.5">
                              <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                isSub ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {isSub ? (isAr ? 'مساعد' : 'Sub') : (isAr ? 'عام' : 'Main')}
                              </span>
                              <div className="text-[10px] text-slate-500 font-bold">
                                {isAr ? subTypeConfig?.labelAr : (subTypeConfig?.labelEn || acc.subType)}
                              </div>
                              {acc.requiresCostCenter && (
                                <span className="inline-block text-[9px] bg-purple-50 text-purple-700 px-1 rounded font-bold border border-purple-200">
                                  {isAr ? 'مركز تكلفة' : 'Cost Center'}
                                </span>
                              )}

                              {/* Dynamic Master List Linking Badge & Sub-Ledger Button */}
                              {(() => {
                                const masterRole = resolveAccountMasterRole(acc.code || acc.id, accountsList, accountingLinks);
                                const isLinkedMaster = ['supplier', 'client', 'worker', 'safe', 'bank', 'inventory'].includes(masterRole);
                                const masterCount = masterRole === 'supplier' ? suppliersList.length
                                  : masterRole === 'client' ? clientsList.length
                                  : masterRole === 'worker' ? workersList.length
                                  : masterRole === 'safe' ? safesList.length
                                  : masterRole === 'bank' ? banksList.length
                                  : masterRole === 'inventory' ? warehousesList.length
                                  : 0;

                                if (!isLinkedMaster) return null;

                                return (
                                  <div className="pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setSubLedgerModal({ isOpen: true, account: acc, targetRole: masterRole, searchTerm: '', selectedEntity: null })}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] border border-indigo-200 cursor-pointer shadow-2xs transition"
                                      title={isAr ? 'عرض كشف حساب الأستاذ المساعد التفاعلي للمسجلين' : 'View interactive sub-ledger register'}
                                    >
                                      <Users className="h-2.5 w-2.5 text-indigo-600" />
                                      <span>{isAr ? `الأستاذ المساعد (${masterCount}) 🔍` : `Sub-Ledger (${masterCount}) 🔍`}</span>
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isGeneralAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCreate(acc.code || acc.id)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 transition rounded-lg hover:bg-emerald-50 cursor-pointer"
                                  title={isAr ? 'إضافة حساب فرعي تابع لهذا الحساب' : 'Add child account'}
                                >
                                  <PlusCircle className="h-4 w-4" />
                                </button>
                              )}

                              {isGeneralAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(acc)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition rounded-lg hover:bg-blue-50 cursor-pointer"
                                  title={isAr ? 'تعديل بيانات وإعدادات الحساب' : 'Edit account'}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                              )}

                              {isGeneralAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(acc)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-lg hover:bg-rose-50 cursor-pointer"
                                  title={isAr ? 'حذف الحساب' : 'Delete account'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: GENERAL LEDGER JOURNAL ENTRIES STREAM                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'journal' && (
        <div className="space-y-4">
          {/* Top Control Bar & Audit Filters */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm">
                  {isAr ? 'سجل قيود اليومية العامة وسندات الصرف والتحصيل وتوريدات المشتريات' : 'Unified General Ledger & Journal Entries Stream'}
                </h4>
                <p className="text-slate-500 text-[11px]">
                  {isAr
                    ? 'متابعة شاملة لجميع القيود المحاسبية: سندات الصرف والتحصيل النقدية، وقيود استحقاق فواتير التوريد الآلية بأطرافها الأربعة، مع إمكانية عكس وإلغاء القيود.'
                    : 'Complete audit trail of posted cash vouchers and 4-leg procurement accrual entries, with authorized reversal actions.'}
                </p>
              </div>

              {/* Stream Filter Pills & New Manual Entry Button */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setJournalStreamFilter('all')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${journalStreamFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {isAr ? `الكل (${unifiedJournalList.length})` : `All (${unifiedJournalList.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setJournalStreamFilter('cash')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${journalStreamFilter === 'cash' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {isAr ? `سندات النقدية (${transactionsList.length})` : `Cash Vouchers (${transactionsList.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setJournalStreamFilter('accrual')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${journalStreamFilter === 'accrual' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {isAr ? `قيود التوريد (${journalEntries.filter((e) => e.sourceDocType !== 'manual_adjustment').length})` : `Procurement Accruals (${journalEntries.filter((e) => e.sourceDocType !== 'manual_adjustment').length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setJournalStreamFilter('manual')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${journalStreamFilter === 'manual' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {isAr ? `قيود التسوية (${journalEntries.filter((e) => e.sourceDocType === 'manual_adjustment').length})` : `Manual Adjustments (${journalEntries.filter((e) => e.sourceDocType === 'manual_adjustment').length})`}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsManualEntryModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer shadow-xs active:scale-95"
                >
                  <PlusCircle className="h-4 w-4 text-emerald-400" />
                  <span>{isAr ? '+ قيد تسوية وتصحيح يدوي' : '+ Manual Adjustment'}</span>
                </button>
              </div>
            </div>

            {/* Advanced Audit Filter Strip */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between flex-wrap gap-2.5">
              <div className="flex items-center gap-2 flex-wrap flex-1">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                  <input
                    type="text"
                    placeholder={isAr ? 'بحث برقم القيد، المرجع، الطرف المقابل، أو الشرح...' : 'Search by ID, ref, counterparty, description...'}
                    value={journalSearchTerm}
                    onChange={(e) => setJournalSearchTerm(e.target.value)}
                    className="w-full ps-9 pe-8 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                  {journalSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setJournalSearchTerm('')}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <select
                  value={journalStatusFilter}
                  onChange={(e) => setJournalStatusFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
                  <option value="posted">{isAr ? 'ساري ومعتمد فقط' : 'Posted Only'}</option>
                  <option value="reversed">{isAr ? 'ملغي ومعكوس فقط' : 'Reversed Only'}</option>
                </select>

                {/* Date Range Picker */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold">{isAr ? 'الفترة:' : 'Period:'}</span>
                  <input
                    type="date"
                    value={journalStartDate}
                    onChange={(e) => setJournalStartDate(e.target.value)}
                    className="text-[11px] bg-transparent text-slate-700 font-mono focus:outline-none"
                    title={isAr ? 'من تاريخ' : 'Start Date'}
                  />
                  <span className="text-slate-300">→</span>
                  <input
                    type="date"
                    value={journalEndDate}
                    onChange={(e) => setJournalEndDate(e.target.value)}
                    className="text-[11px] bg-transparent text-slate-700 font-mono focus:outline-none"
                    title={isAr ? 'إلى تاريخ' : 'End Date'}
                  />
                </div>

                {(journalStartDate || journalEndDate || journalSearchTerm || journalStatusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setJournalStartDate('');
                      setJournalEndDate('');
                      setJournalSearchTerm('');
                      setJournalStatusFilter('all');
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    title={isAr ? 'إلغاء الفلاتر' : 'Reset filters'}
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live Financial Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] font-bold mb-0.5">{isAr ? 'إجمالي المدين (ساري):' : 'Total Debit:'}</span>
                <span className="font-mono font-black text-slate-900 text-xs md:text-sm">
                  {journalFilteredTotals.debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] font-bold mb-0.5">{isAr ? 'إجمالي الدائن (ساري):' : 'Total Credit:'}</span>
                <span className="font-mono font-black text-slate-900 text-xs md:text-sm">
                  {journalFilteredTotals.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] font-bold mb-0.5">{isAr ? 'حالة التوازن الدفتري:' : 'Double-Entry Balance:'}</span>
                {journalFilteredTotals.isBalanced ? (
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1 text-[11px] pt-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isAr ? 'متزن 100% (الفرق 0.00)' : 'Balanced 100%'}</span>
                  </span>
                ) : (
                  <span className="text-rose-700 font-extrabold flex items-center gap-1 text-[11px] pt-0.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{isAr ? `فرق: ${journalFilteredTotals.diff.toLocaleString()} ج.م` : `Variance: ${journalFilteredTotals.diff}`}</span>
                  </span>
                )}
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] font-bold mb-0.5">{isAr ? 'عدد القيود المعروضة:' : 'Entries Count:'}</span>
                <span className="font-mono font-bold text-slate-800 text-xs md:text-sm block pt-0.5">
                  {filteredJournalList.length} {isAr ? 'قيد' : 'Entries'}
                </span>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'رقم القيد / السند' : 'Entry / Voucher ID'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'المصدر والنوع' : 'Source & Type'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'المستندات والمرفقات' : 'Documents & Attachments'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'المرجع والطرف المقابل' : 'Reference & Counterparty'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'البيان والملاحظات' : 'Description'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'مدين (ج.م)' : 'Debit (EGP)'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'دائن (ج.م)' : 'Credit (EGP)'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'التفاصيل' : 'Details'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJournalList.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="py-12 text-center text-slate-400 font-bold">
                        {isAr ? 'لا توجد قيود يومية مطابقة لمعايير البحث والتصفية المحددة' : 'No journal entries match the specified filters'}
                      </td>
                    </tr>
                  ) : (
                    filteredJournalList.map((entry) => {
                      const isAccrual = entry.streamType === 'accrual';
                      const isExpanded = Boolean(expandedJournalEntries[entry.id]);
                      const isReversed = entry.status === 'reversed';
                      const entryAttachments = Array.isArray(entry.attachments) ? entry.attachments : [];

                      return (
                        <React.Fragment key={entry.id}>
                          <tr className={`hover:bg-slate-50 transition ${isReversed ? 'opacity-60 bg-rose-50/20' : ''}`}>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{entry.entryNumber || entry.id}</span>
                                {isReversed && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-100 text-rose-800 font-bold">
                                    {isAr ? 'ملغي' : 'Reversed'}
                                  </span>
                                )}
                                {activeLedgerMode === LEDGER_MODES.MASTER && !isTransactionTaxOfficial(entry) && (
                                  <span
                                    className="px-1.5 py-0.2 rounded text-[9px] bg-slate-100 text-slate-600 border border-slate-300 font-bold"
                                    title={isAr ? 'قيد تشغيلي' : 'Operational entry'}
                                  >
                                    {isAr ? 'تشغيلي' : 'Ops'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                              {entry.entryDate || entry.createdAt?.slice(0, 10)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                isAccrual
                                  ? (entry.sourceDocType === 'supplier_return' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-800 border border-blue-200')
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}>
                                {entry.docLabelAr || entry.sourceDocType}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {(() => {
                                const docs = resolveEntryDocuments(entry);
                                const hasAttachments = docs.uploadedDocs.length > 0;
                                const totalDocsCount = docs.systemDocs.length + docs.uploadedDocs.length;

                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveAttachmentPopover({ entry, ...docs });
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-extrabold transition cursor-pointer shadow-2xs group ${
                                      hasAttachments
                                        ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300'
                                    }`}
                                    title={isAr ? `معاينة ${totalDocsCount} مستندات ومرفقات مؤيدة للقيد` : `View ${totalDocsCount} system slips & attachments`}
                                  >
                                    {hasAttachments ? (
                                      <>
                                        <Paperclip className="h-3 w-3 text-purple-600 group-hover:scale-110 transition-transform" />
                                        <span>{docs.uploadedDocs.length}</span>
                                        <span className="text-purple-300">|</span>
                                        <Printer className="h-3 w-3 text-purple-500" />
                                      </>
                                    ) : (
                                      <>
                                        <Printer className="h-3 w-3 text-slate-500 group-hover:scale-110 transition-transform" />
                                        <span>{isAr ? 'إذن معتمد' : 'Slips'}</span>
                                      </>
                                    )}
                                  </button>
                                );
                              })()}
                            </td>
                            <td className="py-2.5 px-3 max-w-[200px]">
                              <div className="font-extrabold text-slate-800 truncate">
                                {entry.supplierName || entry.subAccountName || entry.safeId || '-'}
                              </div>
                              {entry.referenceNumber && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {isAr ? 'مرجع:' : 'Ref:'} {entry.referenceNumber}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 min-w-[220px] max-w-[380px] whitespace-normal break-words leading-relaxed">
                              {entry.descriptionAr || entry.description || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-end font-mono font-bold text-slate-900">
                              {(entry.totalDebit || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-end font-mono font-bold text-slate-900">
                              {(entry.totalCredit || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {entry.lines && entry.lines.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedJournalEntries((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition cursor-pointer"
                                >
                                  {isExpanded ? (isAr ? 'إخفاء ▲' : 'Hide ▲') : (isAr ? `أطراف القيد (${entry.lines.length}) ▼` : `Legs (${entry.lines.length}) ▼`)}
                                </button>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isReversed ? (
                                <div
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200"
                                  title={entry.reversalReason ? `${isAr ? 'سبب الإلغاء:' : 'Reason:'} ${entry.reversalReason}` : (isAr ? 'قيد معكوس' : 'Reversed')}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>{isAr ? 'معكوس' : 'Reversed'}</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReversalModal(entry)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 text-[10px] font-bold transition cursor-pointer group shadow-2xs"
                                  title={isAr ? 'عكس وإلغاء القيد المحاسبي' : 'Reverse journal entry'}
                                >
                                  <RotateCcw className="h-3 w-3 text-slate-500 group-hover:text-rose-600 transition-transform" />
                                  <span>{isAr ? 'عكس' : 'Reverse'}</span>
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Multi-Leg Journal Details Breakdown */}
                          {isExpanded && entry.lines && (
                            <tr className="bg-slate-50/70 border-b border-slate-200">
                              <td colSpan="10" className="p-3">
                                <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
                                  {isReversed && (
                                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between flex-wrap gap-2">
                                      <div className="flex items-center gap-2">
                                        <RotateCcw className="h-4 w-4 text-rose-600 shrink-0" />
                                        <span>
                                          <b>{isAr ? 'تم عكس وإلغاء هذا القيد دفترياً' : 'This entry has been reversed'}:</b>{' '}
                                          {entry.reversalReason || (isAr ? 'إلغاء إداري' : 'Administrative cancellation')}
                                        </span>
                                      </div>
                                      {entry.reversalEntryId && (
                                        <span className="font-mono font-bold text-[10px] bg-white px-2 py-0.5 rounded border border-rose-200 text-rose-900">
                                          {entry.reversalEntryId}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-[11px] font-black text-slate-700 pb-1.5 border-b border-slate-100">
                                    <span>{isAr ? 'تفاصيل أطراف القيد المحاسبي المزدوج:' : 'Double-Entry Legs Breakdown:'}</span>
                                    <span className="text-emerald-700">
                                      {isAr ? 'القيد متزن دفترياً ✓' : 'Balanced Double-Entry ✓'}
                                    </span>
                                  </div>
                                  <table className="w-full text-[11px] text-start">
                                    <thead>
                                      <tr className="text-slate-400 font-bold border-b border-slate-100">
                                        <th className="py-1 px-2 text-start">{isAr ? 'كود الحساب' : 'Account'}</th>
                                        <th className="py-1 px-2 text-start">{isAr ? 'اسم الحساب المحاسبي' : 'Account Name'}</th>
                                        <th className="py-1 px-2 text-start">{isAr ? 'الأستاذ المساعد / البيان' : 'Sub-Ledger / Notes'}</th>
                                        <th className="py-1 px-2 text-end text-emerald-700">{isAr ? 'مدين (ج.م)' : 'Debit'}</th>
                                        <th className="py-1 px-2 text-end text-indigo-700">{isAr ? 'دائن (ج.م)' : 'Credit'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 font-mono">
                                      {entry.lines.map((l, lIdx) => (
                                        <tr key={lIdx} className="hover:bg-slate-50">
                                          <td className="py-1.5 px-2 font-bold text-slate-800 whitespace-nowrap">
                                            <div>{l.accountCode}</div>
                                            {l.subAccountCode && l.subAccountCode !== l.accountCode && (
                                              <div className="text-[10px] text-indigo-700 font-mono font-medium">
                                                ↳ {l.subAccountCode}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-2 font-sans font-bold text-slate-700">
                                            <div>{l.accountNameAr}</div>
                                            {l.subAccountName && l.subAccountName !== l.accountNameAr && (
                                              <div className="text-[11px] text-indigo-800 font-sans font-medium flex items-center gap-1 mt-0.5">
                                                <span className="text-slate-400">↳</span>
                                                <span>{l.subAccountName}</span>
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-2 font-sans text-slate-600">
                                            {l.subledgerName && (
                                              <span className="font-semibold text-slate-800 block">
                                                {l.subledgerName}
                                              </span>
                                            )}
                                            {l.notes && l.notes !== l.subledgerName && (
                                              <span className="text-slate-500 text-[11px] block">
                                                {l.notes}
                                              </span>
                                            )}
                                            {!l.subledgerName && !l.notes && '-'}
                                          </td>
                                          <td className="py-1 px-2 text-end text-emerald-700 font-bold">
                                            {l.debit > 0 ? Number(l.debit).toLocaleString() : '-'}
                                          </td>
                                          <td className="py-1 px-2 text-end text-indigo-700 font-bold">
                                            {l.credit > 0 ? Number(l.credit).toLocaleString() : '-'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>

                                  {/* Supporting Audit Documents & Invoices Strip */}
                                  {entryAttachments.length > 0 && (
                                    <div className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-200 flex items-center justify-between flex-wrap gap-2 text-xs pt-2">
                                      <div className="flex items-center gap-2">
                                        <Paperclip className="h-4 w-4 text-purple-600 shrink-0" />
                                        <span className="font-extrabold text-purple-950 text-[11px]">
                                          {isAr ? 'المستندات والفواتير المؤيدة للقيد:' : 'Supporting Audit Documents:'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {entryAttachments.map((att, attIdx) => (
                                          <button
                                            key={att.id || attIdx}
                                            type="button"
                                            onClick={() => setSelectedAttachmentForView(att)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-purple-100 text-purple-900 border border-purple-300 text-[11px] font-bold transition cursor-pointer shadow-2xs"
                                            title={isAr ? 'اضغط للمعاينة الفورية' : 'Click to preview'}
                                          >
                                            <FileText className="h-3.5 w-3.5 text-purple-600" />
                                            <span className="truncate max-w-[180px]">{att.label || att.fileName || att.name || (isAr ? `مرفق ${attIdx + 1}` : `Document ${attIdx + 1}`)}</span>
                                            <Eye className="h-3 w-3 text-slate-400" />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: TRIAL BALANCE                                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'trial_balance' && (
        <div className="space-y-4">
          {/* Top Status & Summary Banner */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 text-xs ${
            trialBalanceData.isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}>
            <div className="flex items-center gap-2">
              <Scale className={`h-5 w-5 ${trialBalanceData.isBalanced ? 'text-emerald-600' : 'text-rose-600'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm">
                    {isAr ? 'ميزان المراجعة بالأرصدة والمجاميع (Trial Balance)' : 'Trial Balance Report'}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/80 border border-slate-200 text-slate-700">
                    {isAr ? `${trialBalanceData.filteredCount} من ${trialBalanceData.allAccountsCount} حساب` : `${trialBalanceData.filteredCount} of ${trialBalanceData.allAccountsCount} accounts`}
                  </span>
                </div>
                <p className="text-[11px] opacity-80 mt-0.5">
                  {trialBalanceData.isBalanced
                    ? (isAr ? 'ميزان المراجعة متطابق ومتزن دفترياً: إجمالي المدين = إجمالي الدائن ✓' : 'Trial balance perfectly balanced: Total Debits == Total Credits ✓')
                    : (isAr ? `يوجد عدم اتزان بمقدار ${Math.abs(trialBalanceData.totalDebits - trialBalanceData.totalCredits).toLocaleString()} ج.م` : 'Variance detected between debits and credits')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold flex-wrap">
              <div>
                <span className="block text-[10px] text-slate-500 font-sans">{isAr ? 'إجمالي المدين:' : 'Total Debits:'}</span>
                <span className="text-emerald-700 font-black text-sm">
                  {(trialBalanceData.isDateFiltered ? trialBalanceData.totalPeriodDebits : trialBalanceData.totalDebits).toLocaleString()} ج.م
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-sans">{isAr ? 'إجمالي الدائن:' : 'Total Credits:'}</span>
                <span className="text-indigo-700 font-black text-sm">
                  {(trialBalanceData.isDateFiltered ? trialBalanceData.totalPeriodCredits : trialBalanceData.totalCredits).toLocaleString()} ج.م
                </span>
              </div>
              {!trialBalanceData.isBalanced && (
                <button
                  type="button"
                  onClick={() => setIsDiagnosticModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition shadow-sm cursor-pointer font-sans animate-pulse"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{isAr ? 'تشخيص وتحليل سبب الفرق' : 'Diagnose Imbalance'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsDiagnosticModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold transition shadow-2xs cursor-pointer font-sans"
                title={isAr ? 'فحص تدقيق سلامة واتزان ميزان المراجعة' : 'Audit balance health'}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                <span>{isAr ? 'فاحص الاتزان' : 'Audit Health'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTrialBalanceForPrint(trialBalanceData)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer font-sans active:scale-95"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{isAr ? 'طباعة الميزان (A4)' : 'Print (A4)'}</span>
              </button>
            </div>
          </div>

          {/* Comprehensive Filter Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-extrabold">
                <Filter className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'فلترة وتخصيص ميزان المراجعة (Comprehensive Filters)' : 'Trial Balance Filter Toolbar'}</span>
                {hasActiveTbFilters && (
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                    {isAr ? 'فلاتر مخصصة مفعلة' : 'Filters Active'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* View Mode Toggle: Flat vs Hierarchy */}
                <div className="inline-flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setTbViewMode('flat')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                      tbViewMode === 'flat' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>{isAr ? 'عرض تحليلي (Flat)' : 'Flat'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTbViewMode('hierarchy')}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                      tbViewMode === 'hierarchy' ? 'bg-indigo-600 text-white shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <FolderTree className="h-3 w-3" />
                    <span>{isAr ? 'عرض شجري تجميعي (Rollup)' : 'Tree Rollup'}</span>
                  </button>
                </div>

                {hasActiveTbFilters && (
                  <button
                    type="button"
                    onClick={handleResetTbFilters}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-bold transition cursor-pointer"
                    title={isAr ? 'إعادة ضبط كافة الفلاتر' : 'Reset all filters'}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              {/* 1. Search Code/Name */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'بحث بالكود أو الاسم:' : 'Search Code or Name:'}
                </label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute start-2.5 top-2.5" />
                  <input
                    type="text"
                    value={tbSearchTerm}
                    onChange={(e) => setTbSearchTerm(e.target.value)}
                    placeholder={isAr ? 'ابحث بكود الحساب أو اسمه...' : 'Search by code or name...'}
                    className="w-full ps-8 pe-7 py-1.5 border border-slate-300 rounded-xl font-bold text-xs bg-slate-50/50 focus:bg-white focus:ring-1 focus:ring-indigo-600 focus:outline-none"
                  />
                  {tbSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setTbSearchTerm('')}
                      className="absolute end-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Account Level Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'المستوى المحاسبي:' : 'Account Level:'}
                </label>
                <select
                  value={tbLevelFilter}
                  onChange={(e) => setTbLevelFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl font-bold text-xs bg-white focus:ring-1 focus:ring-indigo-600 focus:outline-none cursor-pointer"
                >
                  <option value="all">{isAr ? 'كافة المستويات (All)' : 'All Levels'}</option>
                  <option value="1">{isAr ? 'المستوى 1 (رئيسي كبرى)' : 'Level 1 (Major Class)'}</option>
                  <option value="2">{isAr ? 'المستوى 2 (مجموعات عامة)' : 'Level 2 (General Group)'}</option>
                  <option value="3">{isAr ? 'المستوى 3 (حسابات فرعية)' : 'Level 3 (Control Acc)'}</option>
                  <option value="4">{isAr ? 'المستوى 4 (حسابات الحركة)' : 'Level 4 (Posting Acc)'}</option>
                </select>
              </div>

              {/* 3. Statement Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'القائمة المالية:' : 'Financial Statement:'}
                </label>
                <select
                  value={tbStatementFilter}
                  onChange={(e) => setTbStatementFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl font-bold text-xs bg-white focus:ring-1 focus:ring-indigo-600 focus:outline-none cursor-pointer"
                >
                  <option value="all">{isAr ? 'كافة القوائم (All)' : 'All Statements'}</option>
                  <option value="balance_sheet">{isAr ? 'المركز المالي (BS)' : 'Balance Sheet'}</option>
                  <option value="income_statement">{isAr ? 'قائمة الدخل (P&L)' : 'Income Statement'}</option>
                </select>
              </div>

              {/* 4. Balance & Activity Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'حالة الرصيد والحركة:' : 'Balance & Activity:'}
                </label>
                <select
                  value={tbBalanceFilter}
                  onChange={(e) => setTbBalanceFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl font-bold text-xs bg-white focus:ring-1 focus:ring-indigo-600 focus:outline-none cursor-pointer"
                >
                  <option value="all">{isAr ? 'كافة الحسابات' : 'All Accounts'}</option>
                  <option value="with_movement">{isAr ? 'حسابات بها حركة (> 0)' : 'With Movement (> 0)'}</option>
                  <option value="non_zero">{isAr ? 'أرصدة غير صفرية فقط' : 'Non-Zero Balance'}</option>
                  <option value="zero_only">{isAr ? 'أرصدة صفرية فقط' : 'Zero Balance Only'}</option>
                  <option value="debit_only">{isAr ? 'أرصدة مدينة فقط' : 'Debit Balances Only'}</option>
                  <option value="credit_only">{isAr ? 'أرصدة دائنة فقط' : 'Credit Balances Only'}</option>
                </select>
              </div>

              {/* 5. Cost Center Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'مركز التكلفة:' : 'Cost Center:'}
                </label>
                <select
                  value={tbCostCenterFilter}
                  onChange={(e) => setTbCostCenterFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl font-bold text-xs bg-white focus:ring-1 focus:ring-indigo-600 focus:outline-none cursor-pointer"
                >
                  <option value="all">{isAr ? 'كافة مراكز التكلفة' : 'All Cost Centers'}</option>
                  {availableCostCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {isAr ? (cc.nameAr || cc.id) : (cc.nameEn || cc.nameAr || cc.id)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Range / Period Presets Strip */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{isAr ? 'الفترة المالية:' : 'Period:'}</span>
                </span>
                {[
                  { id: 'all_time', labelAr: 'كافة الفترات (الكل)', labelEn: 'All Time' },
                  { id: 'today', labelAr: 'اليوم', labelEn: 'Today' },
                  { id: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
                  { id: 'this_quarter', labelAr: 'الربع الحالي', labelEn: 'This Quarter' },
                  { id: 'this_year', labelAr: 'العام الحالي', labelEn: 'This Year' },
                  { id: 'custom', labelAr: 'فترة مخصصة...', labelEn: 'Custom...' }
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleTbPeriodPresetChange(p.id)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      tbPeriodPreset === p.id
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isAr ? p.labelAr : p.labelEn}
                  </button>
                ))}
              </div>

              {/* Custom Date Pickers when not All Time */}
              {tbPeriodPreset !== 'all_time' && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{isAr ? 'من:' : 'From:'}</span>
                    <input
                      type="date"
                      value={tbStartDate}
                      onChange={(e) => {
                        setTbStartDate(e.target.value);
                        setTbPeriodPreset('custom');
                      }}
                      className="px-2 py-0.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{isAr ? 'إلى:' : 'To:'}</span>
                    <input
                      type="date"
                      value={tbEndDate}
                      onChange={(e) => {
                        setTbEndDate(e.target.value);
                        setTbPeriodPreset('custom');
                      }}
                      className="px-2 py-0.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trial Balance Structured Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="max-h-[62vh] overflow-y-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                  {trialBalanceData.isDateFiltered ? (
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'كود الحساب' : 'Account Code'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'اسم الحساب المحاسبي' : 'Account Name'}</th>
                      <th className="py-2.5 px-2 text-center">{isAr ? 'القائمة' : 'Statement'}</th>
                      <th className="py-2.5 px-2 text-center">{isAr ? 'الطبيعة' : 'Nature'}</th>
                      <th className="py-2.5 px-3 text-end text-slate-600">{isAr ? 'رصيد افتتاحي' : 'Opening'}</th>
                      <th className="py-2.5 px-3 text-end text-emerald-800">{isAr ? 'مدين الفترة' : 'Period Debit'}</th>
                      <th className="py-2.5 px-3 text-end text-indigo-800">{isAr ? 'دائن الفترة' : 'Period Credit'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'صافي رصيد الإقفال' : 'Ending Net Balance'}</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'كود الحساب' : 'Account Code'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'اسم الحساب المحاسبي' : 'Account Name'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'القائمة' : 'Statement'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الطبيعة' : 'Nature'}</th>
                      <th className="py-2.5 px-3 text-end text-emerald-800">{isAr ? 'حركات مدينة (ج.م)' : 'Debit Movements'}</th>
                      <th className="py-2.5 px-3 text-end text-indigo-800">{isAr ? 'حركات دائنة (ج.م)' : 'Credit Movements'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'صافي الرصيد الدفتري' : 'Net Book Balance'}</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {trialBalanceData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={trialBalanceData.isDateFiltered ? 8 : 7} className="py-8 text-center text-slate-400 font-sans">
                        <FolderTree className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                        <p>{isAr ? 'لا توجد حسابات تطابق معايير الفلترة الحالية' : 'No accounts match the current filter criteria'}</p>
                        <button
                          type="button"
                          onClick={handleResetTbFilters}
                          className="mt-2 text-indigo-600 font-bold hover:underline"
                        >
                          {isAr ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
                        </button>
                      </td>
                    </tr>
                  ) : (
                    trialBalanceData.rows.map((row) => {
                      const isHierarchy = tbViewMode === 'hierarchy';
                      const isParentWithChildren = Boolean(row.hasChildren);
                      const levelNum = Number(row.level) || (isParentWithChildren ? 1 : 4);
                      const isL1 = levelNum === 1;
                      const isL2 = levelNum === 2;
                      const isL3 = levelNum === 3;
                      const isL4 = levelNum >= 4;

                      // Indentation: indent by level (20px per level)
                      const indentPx = isHierarchy ? Math.max(0, (levelNum - 1) * 20) : 0;

                      // Universal Rollup: Parent accounts always show aggregated sums of children
                      const dispDebit = isParentWithChildren ? row.rollupDebit : row.debit;
                      const dispCredit = isParentWithChildren ? row.rollupCredit : row.credit;
                      const dispNet = isParentWithChildren ? row.rollupNetBalance : row.netBalance;

                      const dispPeriodDebit = isParentWithChildren ? row.rollupPeriodDebit : row.periodDebit;
                      const dispPeriodCredit = isParentWithChildren ? row.rollupPeriodCredit : row.periodCredit;
                      const dispOpeningNet = isParentWithChildren ? row.rollupOpeningNet : row.openingNet;

                      // Structural border distinction without row background coloring
                      const borderTopClass = isL1
                        ? 'border-t-2 border-slate-300'
                        : isL2
                        ? 'border-t border-slate-200'
                        : 'border-t border-slate-100';

                      const fontClass = isL1
                        ? 'font-black text-slate-900 text-[13px]'
                        : isL2
                        ? 'font-extrabold text-slate-800 text-xs'
                        : isL3
                        ? 'font-bold text-slate-700 text-xs'
                        : 'font-medium text-slate-600 text-xs';

                      return (
                        <tr
                          key={row.code}
                          className={`bg-white transition hover:bg-slate-50/80 ${borderTopClass}`}
                        >
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div
                              className="flex items-center gap-1.5"
                              style={{ [isAr ? 'paddingRight' : 'paddingLeft']: `${indentPx}px` }}
                            >
                              {isHierarchy && (
                                isL1 ? (
                                  <FolderOpen className="h-4 w-4 text-slate-700 shrink-0" />
                                ) : isL2 ? (
                                  <>
                                    <span className="text-slate-300 font-mono text-xs select-none">├──</span>
                                    <Folder className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  </>
                                ) : isL3 ? (
                                  <>
                                    <span className="text-slate-300 font-mono text-xs select-none">├──</span>
                                    <Folder className="h-3 w-3 text-slate-400 shrink-0" />
                                  </>
                                ) : (
                                  <>
                                    <span className="text-slate-300 font-mono text-xs select-none">└──</span>
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0 mx-1" />
                                  </>
                                )
                              )}
                              <span className={fontClass}>{row.code}</span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  isL1
                                    ? 'bg-slate-100 text-slate-800 border border-slate-300'
                                    : isL2
                                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                    : isL3
                                    ? 'bg-slate-50 text-slate-600 border border-slate-200'
                                    : 'bg-slate-50 text-slate-400 border border-slate-100'
                                }`}
                                title={isAr ? `مستوى الحساب: L${levelNum}` : `Account Level: L${levelNum}`}
                              >
                                L{levelNum}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <div className="flex items-center gap-2">
                              <span className={fontClass}>{row.nameAr}</span>
                              {isParentWithChildren && (
                                <span className="text-[10px] text-slate-400 font-sans font-medium">
                                  ({isAr ? `تجميعي: ${row.childrenCount} فرعي` : `Rollup: ${row.childrenCount}`})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center font-sans">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                row.statement === 'balance_sheet'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {row.statement === 'balance_sheet' ? (isAr ? 'المركز المالي' : 'BS') : (isAr ? 'الدخل' : 'P&L')}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center font-sans">
                            <span className="text-[10px] text-slate-500 font-bold">
                              {row.nature === 'debit' ? (isAr ? 'مدين' : 'Debit') : (isAr ? 'دائن' : 'Credit')}
                            </span>
                          </td>

                          {trialBalanceData.isDateFiltered ? (
                            <>
                              <td className={`py-2 px-3 text-end ${isL1 ? 'font-black text-slate-900' : 'text-slate-600'}`}>
                                {dispOpeningNet !== 0 ? `${dispOpeningNet.toLocaleString()} ج` : '-'}
                              </td>
                              <td className={`py-2 px-3 text-end ${isL1 ? 'font-black text-emerald-900' : 'text-emerald-800 font-bold'}`}>
                                {dispPeriodDebit > 0 ? dispPeriodDebit.toLocaleString() : '-'}
                              </td>
                              <td className={`py-2 px-3 text-end ${isL1 ? 'font-black text-indigo-900' : 'text-indigo-800 font-bold'}`}>
                                {dispPeriodCredit > 0 ? dispPeriodCredit.toLocaleString() : '-'}
                              </td>
                              <td className={`py-2 px-3 text-end font-bold ${dispNet >= 0 ? 'text-emerald-700' : 'text-rose-700'} ${isL1 ? 'font-black text-sm' : ''}`}>
                                {dispNet.toLocaleString()} ج.م
                              </td>
                            </>
                          ) : (
                            <>
                              <td className={`py-2 px-3 text-end ${isL1 ? 'font-black text-slate-900 text-sm' : isL2 ? 'font-extrabold text-slate-800' : 'text-slate-700'}`}>
                                {dispDebit > 0 ? dispDebit.toLocaleString() : '-'}
                              </td>
                              <td className={`py-2 px-3 text-end ${isL1 ? 'font-black text-slate-900 text-sm' : isL2 ? 'font-extrabold text-slate-800' : 'text-slate-700'}`}>
                                {dispCredit > 0 ? dispCredit.toLocaleString() : '-'}
                              </td>
                              <td className={`py-2 px-3 text-end font-bold ${dispNet >= 0 ? 'text-emerald-700' : 'text-rose-700'} ${isL1 ? 'font-black text-sm' : ''}`}>
                                {dispNet.toLocaleString()} ج.م
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-100 font-mono font-black border-t-2 border-slate-300 sticky bottom-0 z-10">
                  {trialBalanceData.isDateFiltered ? (
                    <tr>
                      <td colSpan="4" className="py-2.5 px-3 text-slate-900 font-sans">
                        {isAr ? 'إجمالي ميزان المراجعة العام (حسابات الحركة المستقلة):' : 'Grand Total (Posting Leaf Accounts):'}
                      </td>
                      <td className="py-2.5 px-3 text-end text-slate-700">
                        {(trialBalanceData.totalOpeningDebits - trialBalanceData.totalOpeningCredits).toLocaleString()} ج
                      </td>
                      <td className="py-2.5 px-3 text-end text-emerald-800 text-sm">
                        {trialBalanceData.totalPeriodDebits.toLocaleString()} ج.م
                      </td>
                      <td className="py-2.5 px-3 text-end text-indigo-800 text-sm">
                        {trialBalanceData.totalPeriodCredits.toLocaleString()} ج.م
                      </td>
                      <td className="py-2.5 px-3 text-end text-slate-900">
                        {Math.abs(trialBalanceData.totalPeriodDebits - trialBalanceData.totalPeriodCredits).toLocaleString()} ج.م
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan="4" className="py-2.5 px-3 text-slate-900 font-sans">
                        {isAr ? 'إجمالي ميزان المراجعة العام (حسابات الحركة المستقلة):' : 'Grand Total (Posting Leaf Accounts):'}
                      </td>
                      <td className="py-2.5 px-3 text-end text-emerald-800 text-sm">
                        {trialBalanceData.totalDebits.toLocaleString()} ج.م
                      </td>
                      <td className="py-2.5 px-3 text-end text-indigo-800 text-sm">
                        {trialBalanceData.totalCredits.toLocaleString()} ج.م
                      </td>
                      <td className="py-2.5 px-3 text-end text-slate-900">
                        {Math.abs(trialBalanceData.totalDebits - trialBalanceData.totalCredits).toLocaleString()} ج.م
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: MASTER LISTS TO GL ACCOUNTS CONFIGURATION MAPPING               */}
      {/* ========================================================================= */}
      {activeSubTab === 'master_links' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-5 text-white shadow-md border border-slate-700/70 flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                <Link2 className="h-3.5 w-3.5" />
                <span>{isAr ? 'ربط القوائم وحركات النظام بالأستاذ العام' : 'GL & Master Integration'}</span>
              </div>
              <h3 className="text-lg font-black">
                {isAr ? 'إعدادات ربط الحسابات العامة بالقوائم الرئيسية (GL & Master Mapping)' : 'General Ledger & Master Entity Mapping'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isAr
                  ? 'بصفتك مسؤولاً عاماً، يمكنك هنا تخصيص وربط كل قائمة رئيسية (الموردين، العملاء، عهد العاملين، الخزائن، البنوك، المخازن، والضرائب) بحساب الأستاذ العام المقابل لها في شجرة الحسابات. هذا الربط يوجه قيود اليومية الآلية لتغذية القوائم والأستاذ المساعد فورياً.'
                  : 'Configure which General Ledger control accounts link to Master Registries and ERP automatic posting functions.'}
              </p>
            </div>

            {isGeneralAdmin && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAccountingLinks}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold transition cursor-pointer border border-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                  <span>{isAr ? 'استعادة الافتراضيات' : 'Reset Defaults'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingLinks}
                  onClick={handleSaveAccountingLinks}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSavingLinks ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ وتفعيل التعيينات ✓' : 'Save Mappings ✓')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(localLinks).map(([linkKey, linkConfig]) => {
              const linkedCodes = Array.isArray(linkConfig.linkedCodes)
                ? linkConfig.linkedCodes
                : (linkConfig.code ? [linkConfig.code] : []);
              const primaryCode = linkConfig.primaryCode || (linkedCodes.length > 0 ? linkedCodes[0] : '');
              const primaryAccount = accountsList.find((a) => (a.code || a.id) === primaryCode);

              const entityCount = linkKey === 'suppliersAccount' ? suppliersList.length
                : linkKey === 'clientsAccount' ? clientsList.length
                : linkKey === 'workersCustodyAccount' ? workersList.length
                : linkKey === 'cashSafesAccount' ? safesList.length
                : linkKey === 'corporateBanksAccount' ? banksList.length
                : (linkKey === 'rawMaterialsInventoryAccount' || linkKey === 'finishedGoodsInventoryAccount' || linkKey === 'wipInventoryAccount') ? warehousesList.length
                : null;

              const roleIcon = linkKey === 'suppliersAccount' ? <Truck className="h-4 w-4 text-blue-600" />
                : linkKey === 'clientsAccount' ? <Building2 className="h-4 w-4 text-emerald-600" />
                : linkKey === 'workersCustodyAccount' ? <Users className="h-4 w-4 text-purple-600" />
                : linkKey === 'cashSafesAccount' ? <Coins className="h-4 w-4 text-amber-600" />
                : linkKey === 'corporateBanksAccount' ? <Landmark className="h-4 w-4 text-indigo-600" />
                : (linkKey === 'rawMaterialsInventoryAccount' || linkKey === 'finishedGoodsInventoryAccount' || linkKey === 'wipInventoryAccount') ? <Package className="h-4 w-4 text-teal-600" />
                : linkKey === 'cashDiscrepancyAccount' ? <AlertTriangle className="h-4 w-4 text-rose-600" />
                : linkKey === 'internalTransfersAccount' ? <ArrowRightLeft className="h-4 w-4 text-cyan-600" />
                : linkKey === 'currentYearEarningsAccount' ? <TrendingUp className="h-4 w-4 text-emerald-600" />
                : linkKey === 'retainedEarningsAccount' ? <Layers className="h-4 w-4 text-indigo-600" />
                : <Scale className="h-4 w-4 text-rose-600" />;

              return (
                <div key={linkKey} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-sm transition flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                          {roleIcon}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-slate-900 leading-tight">
                            {isAr ? linkConfig.labelAr : linkConfig.labelEn}
                          </h4>
                          {linkConfig.masterCollection && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              collection: {linkConfig.masterCollection}
                            </span>
                          )}
                        </div>
                      </div>
                      {entityCount !== null && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {entityCount} {isAr ? 'عنصر' : 'items'}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {isAr ? linkConfig.descAr : linkConfig.descEn}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold text-slate-500">
                        {isAr ? 'حسابات الأستاذ العام المربوطة:' : 'Linked GL Accounts:'}
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono font-bold">
                        ({linkedCodes.length} {isAr ? 'حساب' : 'accounts'})
                      </span>
                    </div>

                    {/* Tag Badges for Linked Accounts */}
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {linkedCodes.length === 0 && (
                        <div className="p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-center">
                          <p className="text-[11px] text-amber-900 font-bold">
                            {isAr ? 'لم يتم ربط أي حساب بعد — اختر حساباً من القائمة أدناه لربطه' : 'No accounts linked yet — select one below to link'}
                          </p>
                        </div>
                      )}
                      {linkedCodes.map((code) => {
                        const acc = accountsList.find((a) => (a.code || a.id) === code);
                        const isPrimary = code === primaryCode;
                        return (
                          <div
                            key={code}
                            className={`flex items-center justify-between p-1.5 px-2 rounded-xl border text-xs font-bold transition ${
                              isPrimary
                                ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-2xs'
                                : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                type="button"
                                disabled={!isGeneralAdmin}
                                onClick={() => {
                                  setLocalLinks((prev) => ({
                                    ...prev,
                                    [linkKey]: {
                                      ...prev[linkKey],
                                      primaryCode: code,
                                      code: code
                                    }
                                  }));
                                }}
                                className={`p-0.5 rounded cursor-pointer transition ${
                                  isPrimary
                                    ? 'text-amber-500 hover:text-amber-600'
                                    : 'text-slate-300 hover:text-amber-400'
                                }`}
                                title={isPrimary ? (isAr ? 'الحساب الافتراضي الرئيسي للنظام' : 'Primary Default Account') : (isAr ? 'تعيين كحساب افتراضي رئيسي' : 'Set as primary default')}
                              >
                                <Star className={`h-3.5 w-3.5 ${isPrimary ? 'fill-amber-400 text-amber-500' : ''}`} />
                              </button>
                              <span className="font-mono text-[11px] font-black text-slate-900">{code}</span>
                              <span className="truncate text-[11px] text-slate-700 font-sans">{acc?.nameAr || code}</span>
                              {isPrimary && (
                                <span className="text-[9px] bg-amber-200/70 text-amber-900 px-1 py-0.2 rounded font-black shrink-0">
                                  {isAr ? 'الافتراضي' : 'Default'}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {linkConfig.masterCollection && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const targetRole = linkConfig.subType || 'supplier';
                                    setSubLedgerModal({ isOpen: true, account: acc || { code, nameAr: code }, targetRole, searchTerm: '', selectedEntity: null });
                                  }}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-bold cursor-pointer"
                                  title={isAr ? 'فتح كشف الأستاذ المساعد' : 'Open Sub-Ledger'}
                                >
                                  {isAr ? 'كشف' : 'Ledger'}
                                </button>
                              )}
                              {isGeneralAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedLinked = linkedCodes.filter((c) => c !== code);
                                    const nextPrimary = isPrimary ? (updatedLinked[0] || '') : primaryCode;
                                    const nextAcc = accountsList.find((a) => (a.code || a.id) === nextPrimary);
                                    setLocalLinks((prev) => ({
                                      ...prev,
                                      [linkKey]: {
                                        ...prev[linkKey],
                                        linkedCodes: updatedLinked,
                                        primaryCode: nextPrimary,
                                        code: nextPrimary,
                                        nameAr: nextAcc?.nameAr || (nextPrimary ? prev[linkKey]?.nameAr : ''),
                                        nameEn: nextAcc?.nameEn || (nextPrimary ? prev[linkKey]?.nameEn : '')
                                      }
                                    }));
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer"
                                  title={isAr ? 'إلغاء ربط الحساب من هذه القائمة' : 'Unlink account'}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick Add SearchableSelect with Parent-Child Conflict Guard */}
                    {isGeneralAdmin && (
                      <div className="pt-1">
                        <SearchableSelect
                          options={accountsList
                            .filter((a) => !linkedCodes.includes(a.code || a.id))
                            .map((a) => ({
                              value: a.code || a.id,
                              code: a.code || a.id,
                              label: `${a.code} — ${a.nameAr}`,
                              sublabel: a.statement === 'balance_sheet' ? (isAr ? 'مركز مالي' : 'BS') : (isAr ? 'دخل' : 'P&L')
                            }))}
                          value=""
                          onChange={(newCode) => {
                            if (!newCode) return;
                            const conflict = checkParentChildConflict(newCode, linkedCodes, accountsList);
                            if (conflict.hasConflict) {
                              alert(isAr ? conflict.messageAr : conflict.messageEn);
                              setErrorMsg(isAr ? conflict.messageAr : conflict.messageEn);
                              return;
                            }

                            const updatedLinked = [...linkedCodes, newCode];
                            const found = accountsList.find((a) => (a.code || a.id) === newCode);
                            setLocalLinks((prev) => {
                              const curr = prev[linkKey] || {};
                              const targetPrimary = curr.primaryCode || newCode;
                              const primaryAcc = (targetPrimary === newCode) ? found : (accountsList.find((a) => (a.code || a.id) === targetPrimary) || found);
                              return {
                                ...prev,
                                [linkKey]: {
                                  ...curr,
                                  linkedCodes: updatedLinked,
                                  primaryCode: targetPrimary,
                                  code: targetPrimary,
                                  nameAr: primaryAcc?.nameAr || curr.nameAr || found?.nameAr || '',
                                  nameEn: primaryAcc?.nameEn || curr.nameEn || found?.nameEn || ''
                                }
                              };
                            });
                            setErrorMsg('');
                          }}
                          placeholder={isAr ? '+ إضافة حساب أستاذ عام للقائمة...' : '+ Add GL Account to List...'}
                          isAr={isAr}
                          className="w-full text-xs font-bold"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isGeneralAdmin && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-900 font-bold">
                  {isAr
                    ? 'أي تعديل في هذه الروابط ينعكس فورياً على قيود فواتير التوريد الجديدة وميزان المراجعة وكشوف الأستاذ المساعد.'
                    : 'Any modification here takes immediate effect on GRN journal entries, trial balance, and auxiliary sub-ledgers.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isSavingLinks}
                onClick={handleSaveAccountingLinks}
                className="flex items-center gap-1.5 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isSavingLinks ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ وتفعيل التعيينات' : 'Save Mappings')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DYNAMIC AUXILIARY SUB-LEDGER DRILL-DOWN MODAL                             */}
      {/* ========================================================================= */}
      {subLedgerModal.isOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col my-auto animate-in fade-in">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/10 border border-white/10">
                  <Users className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black">
                      {isAr ? 'كشف حساب الأستاذ المساعد (Auxiliary Sub-Ledger)' : 'Auxiliary Sub-Ledger'}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 text-[10px] font-mono font-bold">
                      {subLedgerModal.account?.code || ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {subLedgerModal.account?.nameAr} — {isAr ? 'القائمة المرتبطة ديناميكياً:' : 'Linked Master Registry:'} {' '}
                    <strong className="text-white">
                      {subLedgerModal.targetRole === 'supplier' ? (isAr ? 'سجل الموردين المعتمدين' : 'Suppliers Master')
                        : subLedgerModal.targetRole === 'client' ? (isAr ? 'سجل العملاء والموزعين' : 'Clients Master')
                        : subLedgerModal.targetRole === 'worker' ? (isAr ? 'سجل عمالة الإنتاج والموظفين (العهد والسلف)' : 'Workers Master')
                        : subLedgerModal.targetRole === 'safe' ? (isAr ? 'خزائن النقدية الفعلية' : 'Cash Safes')
                        : subLedgerModal.targetRole === 'bank' ? (isAr ? 'الحسابات البنكية المعتمدة' : 'Corporate Banks')
                        : (isAr ? 'المخازن والمستودعات' : 'Warehouses Master')}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubLedgerModal({ isOpen: false, account: null, targetRole: null, searchTerm: '', selectedEntity: null })}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs flex-1">
              {/* Detailed View for a Single Selected Entity */}
              {subLedgerModal.selectedEntity ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSubLedgerModal((prev) => ({ ...prev, selectedEntity: null }))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition cursor-pointer text-xs"
                    >
                      <ArrowRight className="h-4 w-4" />
                      <span>{isAr ? '← العودة لقائمة المسجلين بالأستاذ المساعد' : '← Back to Sub-Ledger List'}</span>
                    </button>

                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'صافي الرصيد الحالي:' : 'Current Balance:'}</span>
                        <strong className={`text-sm font-black ${(subLedgerModal.selectedEntity.netBalance || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {(subLedgerModal.selectedEntity.netBalance || 0).toLocaleString()} ج.م
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Entity Banner */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{subLedgerModal.selectedEntity.name}</h3>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {isAr ? 'كود/معرف:' : 'ID:'} {subLedgerModal.selectedEntity.id} | {subLedgerModal.selectedEntity.identifier}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono font-bold">
                      <div>
                        <span className="block text-[10px] text-slate-400">{isAr ? 'إجمالي المدين (المدفوع/المصروف):' : 'Total Debits:'}</span>
                        <span className="text-slate-800 font-black">{(subLedgerModal.selectedEntity.debit || 0).toLocaleString()} ج.م</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">{isAr ? 'إجمالي الدائن (المستحق/الفواتير):' : 'Total Credits:'}</span>
                        <span className="text-slate-800 font-black">{(subLedgerModal.selectedEntity.credit || 0).toLocaleString()} ج.م</span>
                      </div>
                    </div>
                  </div>

                  {/* Movements Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <div className="max-h-[50vh] overflow-y-auto">
                      <table className="w-full text-start text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 text-start">{isAr ? 'رقم المستند' : 'Doc ID'}</th>
                            <th className="py-2 px-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                            <th className="py-2 px-3 text-start">{isAr ? 'نوع الحركة' : 'Type'}</th>
                            <th className="py-2 px-3 text-start">{isAr ? 'المرجع والبيان' : 'Ref & Description'}</th>
                            <th className="py-2 px-3 text-end text-emerald-700">{isAr ? 'مدين (ج.م)' : 'Debit'}</th>
                            <th className="py-2 px-3 text-end text-indigo-700">{isAr ? 'دائن (ج.م)' : 'Credit'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedEntityTransactions.length === 0 ? (
                            <tr>
                              <td colSpan="6" className="py-8 text-center text-slate-400 font-bold">
                                {isAr ? 'لا توجد حركات مسجلة لهذا الحساب حالياً' : 'No movements found for this entity'}
                              </td>
                            </tr>
                          ) : (
                            selectedEntityTransactions.map((tx) => (
                              <tr key={tx.id} className="hover:bg-slate-50 transition font-mono">
                                <td className="py-2 px-3 font-bold text-slate-900">{tx.id}</td>
                                <td className="py-2 px-3 text-slate-500 font-sans">{tx.date}</td>
                                <td className="py-2 px-3 font-sans">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                    {tx.docLabel}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-600 max-w-[240px] truncate" title={tx.description}>
                                  {tx.reference ? `[${tx.reference}] ` : ''}{tx.description || '-'}
                                </td>
                                <td className="py-2 px-3 text-end text-emerald-700 font-bold">
                                  {tx.debit > 0 ? tx.debit.toLocaleString() : '-'}
                                </td>
                                <td className="py-2 px-3 text-end text-indigo-700 font-bold">
                                  {tx.credit > 0 ? tx.credit.toLocaleString() : '-'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* Sub-Ledger Master Entities Summary List */
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-bold">{isAr ? 'إجمالي المسجلين' : 'Total Registered'}</span>
                      <strong className="text-base font-black text-slate-800">{subLedgerEntities.length}</strong>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[10px] text-emerald-600 block font-bold">{isAr ? 'إجمالي الحركات المدينة' : 'Total Debits'}</span>
                      <strong className="text-base font-black text-emerald-700">
                        {subLedgerEntities.reduce((sum, e) => sum + (e.debit || 0), 0).toLocaleString()} ج.م
                      </strong>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[10px] text-indigo-600 block font-bold">{isAr ? 'إجمالي الحركات الدائنة' : 'Total Credits'}</span>
                      <strong className="text-base font-black text-indigo-700">
                        {subLedgerEntities.reduce((sum, e) => sum + (e.credit || 0), 0).toLocaleString()} ج.م
                      </strong>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-bold">{isAr ? 'صافي رصيد الأستاذ' : 'Net Total Balance'}</span>
                      <strong className="text-base font-black text-slate-900">
                        {subLedgerEntities.reduce((sum, e) => sum + (e.netBalance || 0), 0).toLocaleString()} ج.م
                      </strong>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <input
                      type="text"
                      value={subLedgerModal.searchTerm}
                      onChange={(e) => setSubLedgerModal((prev) => ({ ...prev, searchTerm: e.target.value }))}
                      placeholder={isAr ? 'بحث بالاسم، الكود، رقم التسجيل الضريبي، أو الهاتف...' : 'Search by name, ID, tax number, or phone...'}
                      className="w-full px-3 py-2 ps-8 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 font-bold"
                    />
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute start-2.5 top-3" />
                  </div>

                  {/* Entities Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <div className="max-h-[50vh] overflow-y-auto">
                      <table className="w-full text-start text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 text-start">{isAr ? 'كود المعرف' : 'Entity ID'}</th>
                            <th className="py-2.5 px-3 text-start">{isAr ? 'الاسم / المنشأة' : 'Name'}</th>
                            <th className="py-2.5 px-3 text-start">{isAr ? 'البيانات والتعريف' : 'Details / Tax'}</th>
                            <th className="py-2.5 px-3 text-end text-emerald-700">{isAr ? 'إجمالي المدين (ج.م)' : 'Debits'}</th>
                            <th className="py-2.5 px-3 text-end text-indigo-700">{isAr ? 'إجمالي الدائن (ج.م)' : 'Credits'}</th>
                            <th className="py-2.5 px-3 text-end text-slate-900">{isAr ? 'صافي الرصيد المستحق' : 'Net Balance'}</th>
                            <th className="py-2.5 px-3 text-center">{isAr ? 'الإجراء' : 'Action'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {subLedgerEntities.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="py-8 text-center text-slate-400 font-bold">
                                {isAr ? 'لا توجد عناصر مطابقة لمعايير البحث في القائمة الرئيسية' : 'No entities found in this master list'}
                              </td>
                            </tr>
                          ) : (
                            subLedgerEntities.map((ent) => (
                              <tr key={ent.id} className="hover:bg-slate-50 transition">
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{ent.id}</td>
                                <td className="py-2.5 px-3 font-bold text-slate-800">{ent.name}</td>
                                <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{ent.identifier}</td>
                                <td className="py-2.5 px-3 text-end font-mono font-bold text-emerald-700">
                                  {ent.debit > 0 ? ent.debit.toLocaleString() : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-end font-mono font-bold text-indigo-700">
                                  {ent.credit > 0 ? ent.credit.toLocaleString() : '-'}
                                </td>
                                <td className={`py-2.5 px-3 text-end font-mono font-black ${ent.netBalance >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                                  {ent.netBalance.toLocaleString()} ج.م
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setSubLedgerModal((prev) => ({ ...prev, selectedEntity: ent }))}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] border border-indigo-200 transition cursor-pointer"
                                  >
                                    {isAr ? 'كشف الحساب ↗' : 'Statement ↗'}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CSV IMPORT PREVIEW MODAL                                                  */}
      {/* ========================================================================= */}
      {importPreview && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
            <div className="bg-slate-900 px-5 py-3.5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                <div>
                  <h4 className="text-sm font-extrabold">{isAr ? 'معاينة استيراد وتحديث دليل الحسابات (الهيكل القياسي ١٦ عمود)' : 'Chart of Accounts Import Preview'}</h4>
                  <p className="text-[11px] text-slate-400">{importPreview.fileName} — {importPreview.accounts.length} {isAr ? 'حساب جاهز للاستيراد' : 'Accounts ready'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setImportPreview(null)} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {importPreview.errors?.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 space-y-1">
                  <div className="font-black">{isAr ? 'تنبيهات أثناء قراءة الملف:' : 'Import Warnings:'}</div>
                  {importPreview.errors.slice(0, 5).map((err, idx) => (
                    <div key={idx} className="text-[11px]">• {err}</div>
                  ))}
                </div>
              )}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3 text-start">{isAr ? 'الكود' : 'Code'}</th>
                      <th className="py-2 px-3 text-start">{isAr ? 'المستوى والأب' : 'Level & Parent'}</th>
                      <th className="py-2 px-3 text-start">{isAr ? 'اسم الحساب' : 'Account Name'}</th>
                      <th className="py-2 px-3 text-start">{isAr ? 'القائمة' : 'Statement'}</th>
                      <th className="py-2 px-3 text-start">{isAr ? 'التبويب' : 'Category'}</th>
                      <th className="py-2 px-3 text-start">{isAr ? 'التأثير والطبيعة' : 'Effect & Nature'}</th>
                      <th className="py-2 px-3 text-start">{isAr ? 'التدفق' : 'Cash Flow'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.accounts.map((acc, i) => {
                      const catConfig = ACCOUNT_REPORT_CATEGORIES.find((c) => c.id === acc.reportCategory);
                      const isContra = acc.statementEffect === 'deduct';
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-mono font-bold text-slate-800">{acc.code}</td>
                          <td className="py-1.5 px-3 font-mono text-[11px] text-slate-600">
                            <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 font-black me-1">L{acc.level || 1}</span>
                            {acc.parentCode ? `← ${acc.parentCode}` : (isAr ? 'جذر' : 'Root')}
                          </td>
                          <td className="py-1.5 px-3 font-bold text-slate-900">{acc.nameAr}</td>
                          <td className="py-1.5 px-3">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              acc.statement === 'balance_sheet' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {acc.statement === 'balance_sheet' ? (isAr ? 'المركز المالي' : 'Balance Sheet') : (isAr ? 'قائمة الدخل' : 'P&L')}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-slate-700 font-bold">
                            {isAr ? (catConfig?.labelAr || acc.reportCategory) : (catConfig?.labelEn || acc.reportCategory)}
                          </td>
                          <td className="py-1.5 px-3">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold me-1 ${
                              isContra ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'
                            }`}>
                              {isContra ? (isAr ? '(-) يخصم' : '(-) Deduct') : (isAr ? '(+) يضاف' : '(+) Add')}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              ({acc.nature === 'debit' ? (isAr ? 'مدين' : 'Dr') : (isAr ? 'دائن' : 'Cr')})
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-slate-600">{acc.cashFlowCategory}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <button type="button" onClick={() => setImportPreview(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold cursor-pointer">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isImporting || importPreview.accounts.length === 0}
                onClick={handleConfirmImport}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isImporting ? (isAr ? 'جاري الاستيراد...' : 'Importing...') : (isAr ? `تأكيد استيراد وتحديث (${importPreview.accounts.length}) حساب ✓` : `Confirm Import (${importPreview.accounts.length}) Accounts ✓`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COMPREHENSIVE ADD / EDIT MODAL                                            */}
      {/* ========================================================================= */}
      {accountModal.isOpen && (() => {
        const selectedStmtObj = ACCOUNT_STATEMENTS.find((s) => s.id === accountModal.statement);
        const selectedCatObj = ACCOUNT_REPORT_CATEGORIES.find((c) => c.id === accountModal.reportCategory);
        const parentAccountObj = accountsList.find((a) => (a.code || a.id) === accountModal.parentCode);
        const isSectionHeader = accountModal.reportCategory === 'section_header';
        const isContraEffect = accountModal.statementEffect === 'deduct';

        return (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
              <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2.5">
                  {accountModal.isEdit ? <Edit2 className="h-5 w-5 text-blue-400" /> : <PlusCircle className="h-5 w-5 text-emerald-400" />}
                  <div>
                    <h4 className="text-sm font-extrabold">
                      {accountModal.isEdit
                        ? (isAr ? `تعديل بيانات وإعدادات الحساب (${accountModal.originalCode})` : `Edit Account (${accountModal.originalCode})`)
                        : (isAr ? 'إضافة حساب جديد إلى شجرة الحسابات' : 'Add New Account to Chart')}
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      {isAr ? 'تحكم كامل 100% في التموضع والطبيعة والتأثير الحسابي داخل القوائم المالية' : '100% setup-driven statement placement, hierarchy level, and mathematical effect'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setAccountModal((prev) => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveAccount} className="flex-1 flex flex-col overflow-hidden text-xs">
                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                  {/* Row 1: Code, Type, Hierarchy Level, Display Order */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'كود الحساب *:' : 'Account Code *:'}</label>
                      <input
                        type="text"
                        required
                        value={accountModal.code}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, code: e.target.value }))}
                        placeholder="e.g. 1020101"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'تصنيف الحساب:' : 'Account Type:'}</label>
                      <select
                        value={accountModal.type}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, type: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                      >
                        <option value="main">{isAr ? 'عام / تجميعي (Main)' : 'Main GL'}</option>
                        <option value="sub">{isAr ? 'فرعي / تحليلي (Sub)' : 'Sub-Ledger'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'المستوى الشجري:' : 'Tree Level:'}</label>
                      <select
                        value={accountModal.level || 1}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, level: Number(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                      >
                        <option value={1}>{isAr ? 'المستوى 1 (جذر باب)' : 'Level 1 (Root)'}</option>
                        <option value={2}>{isAr ? 'المستوى 2 (مجموعة عامة)' : 'Level 2 (Group)'}</option>
                        <option value={3}>{isAr ? 'المستوى 3 (حساب رئيسي)' : 'Level 3 (Main Line)'}</option>
                        <option value={4}>{isAr ? 'المستوى 4 (حساب تحليلي)' : 'Level 4 (Analytical)'}</option>
                        <option value={5}>{isAr ? 'المستوى 5 (فرعي تفصيلي)' : 'Level 5 (Sub-Detail)'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'ترتيب العرض:' : 'Display Order:'}</label>
                      <input
                        type="number"
                        value={accountModal.displayOrder || 0}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, displayOrder: Number(e.target.value) || 0 }))}
                        placeholder="10"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 2: Parent Account Selector (Enabled for all levels) */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'الحساب الأب (Parent Account) — لتجميع الرصيد تلقائياً في المستويات الأعلى:' : 'Parent Account (For Automatic Hierarchy Roll-up):'}
                    </label>
                    <select
                      value={accountModal.parentCode || ''}
                      onChange={(e) => {
                        const newParentCode = e.target.value;
                        const parentObj = accountsList.find((a) => (a.code || a.id) === newParentCode);
                        setAccountModal((prev) => ({
                          ...prev,
                          parentCode: newParentCode,
                          level: parentObj ? (Number(parentObj.level || 1) + 1) : 1
                        }));
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="">{isAr ? '— بدون حساب أب (حساب جذر بالمستوى الأول L1) —' : '— No Parent (Level 1 Root Account) —'}</option>
                      {accountsList
                        .filter((a) => (a.code || a.id) !== accountModal.code && (a.code || a.id) !== accountModal.originalCode)
                        .sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)))
                        .map((a) => (
                          <option key={a.code || a.id} value={a.code || a.id}>
                            {`${a.code || a.id} — ${a.nameAr} (L${a.level || 1})`}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Row 3: Arabic & English Names */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم الحساب بالعربية *:' : 'Arabic Name *:'}</label>
                      <input
                        type="text"
                        required
                        value={accountModal.nameAr}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, nameAr: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم الحساب بالإنجليزية:' : 'English Name:'}</label>
                      <input
                        type="text"
                        value={accountModal.nameEn}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, nameEn: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 4: Financial Statement Placement & Mathematical Effect */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{isAr ? 'التوجيه والتموضع والتأثير في القوائم المالية (بدون أي توجيه صلب بالكود)' : 'Financial Statement Routing & Mathematical Effect'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-extrabold text-slate-800 mb-1">{isAr ? 'القائمة المالية المستهدفة *:' : 'Target Statement *:'}</label>
                        <select
                          value={accountModal.statement}
                          onChange={(e) => {
                            const newStmt = e.target.value;
                            const firstCat = ACCOUNT_REPORT_CATEGORIES.find((c) => c.statement === newStmt);
                            const newNormalNature = firstCat?.normalNature || 'debit';
                            setAccountModal((prev) => ({
                              ...prev,
                              statement: newStmt,
                              reportCategory: firstCat?.id || prev.reportCategory,
                              nature: newNormalNature,
                              statementEffect: 'add'
                            }));
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                        >
                          {ACCOUNT_STATEMENTS.map((s) => (
                            <option key={s.id} value={s.id}>{isAr ? s.labelAr : s.labelEn}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-extrabold text-slate-800 mb-1">{isAr ? 'البند / القسم داخل القائمة المالية *:' : 'Report Category / Section *:'}</label>
                        <select
                          value={accountModal.reportCategory}
                          onChange={(e) => {
                            const newCatId = e.target.value;
                            const catObj = ACCOUNT_REPORT_CATEGORIES.find((c) => c.id === newCatId);
                            setAccountModal((prev) => {
                              if (newCatId === 'section_header') {
                                return { ...prev, reportCategory: newCatId, statementEffect: 'add' };
                              }
                              const sectionNormal = catObj?.normalNature || 'debit';
                              const syncedEffect = prev.nature === sectionNormal ? 'add' : 'deduct';
                              return {
                                ...prev,
                                reportCategory: newCatId,
                                statementEffect: syncedEffect
                              };
                            });
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                        >
                          {ACCOUNT_REPORT_CATEGORIES.filter((c) => c.statement === accountModal.statement || c.statement === 'both').map((cat) => (
                            <option key={cat.id} value={cat.id}>{isAr ? cat.labelAr : cat.labelEn}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-extrabold text-slate-800 mb-1">{isAr ? 'طبيعة الحساب المحاسبية *:' : 'Account Normal Nature *:'}</label>
                        <select
                          value={accountModal.nature}
                          onChange={(e) => {
                            const newNature = e.target.value;
                            const catObj = ACCOUNT_REPORT_CATEGORIES.find((c) => c.id === accountModal.reportCategory);
                            const sectionNormal = catObj?.normalNature || 'debit';
                            setAccountModal((prev) => ({
                              ...prev,
                              nature: newNature,
                              statementEffect: prev.reportCategory === 'section_header' ? 'add' : (newNature === sectionNormal ? 'add' : 'deduct')
                            }));
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                        >
                          {ACCOUNT_NATURES.map((nat) => (
                            <option key={nat.id} value={nat.id}>{isAr ? nat.labelAr : nat.labelEn}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-extrabold text-slate-800 mb-1">{isAr ? 'تأثير الحساب على إجمالي القسم *:' : 'Effect on Section Total *:'}</label>
                        <select
                          disabled={isSectionHeader}
                          value={accountModal.statementEffect || 'add'}
                          onChange={(e) => {
                            const newEffect = e.target.value;
                            const catObj = ACCOUNT_REPORT_CATEGORIES.find((c) => c.id === accountModal.reportCategory);
                            const sectionNormal = catObj?.normalNature || 'debit';
                            const syncedNature = newEffect === 'add'
                              ? sectionNormal
                              : (sectionNormal === 'debit' ? 'credit' : 'debit');
                            setAccountModal((prev) => ({
                              ...prev,
                              statementEffect: newEffect,
                              nature: syncedNature
                            }));
                          }}
                          className={`w-full px-3 py-2 border rounded-xl font-bold focus:outline-none cursor-pointer ${
                            isContraEffect
                              ? 'border-rose-300 bg-rose-50 text-rose-900'
                              : 'border-emerald-300 bg-emerald-50/60 text-emerald-900'
                          }`}
                        >
                          {ACCOUNT_STATEMENT_EFFECTS.map((ef) => (
                            <option key={ef.id} value={ef.id}>{isAr ? ef.labelAr : ef.labelEn}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Live Statement Routing Preview Banner */}
                    <div className={`p-3 rounded-xl border text-[11px] flex items-start gap-2.5 ${
                      isSectionHeader
                        ? 'bg-slate-100 border-slate-300 text-slate-800'
                        : isContraEffect
                        ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                        : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                    }`}>
                      <Info className="h-4 w-4 shrink-0 mt-0.5 text-indigo-600" />
                      <div className="space-y-0.5 leading-relaxed">
                        <div className="font-black">
                          {isAr ? 'معاينة التوجيه المباشر في القوائم المالية:' : 'Live Financial Statement Routing Preview:'}
                        </div>
                        <div>
                          {isSectionHeader ? (
                            isAr
                              ? `هذا الحساب يعمل كعنوان باب شجري تجميعي (المستوى L${accountModal.level || 1}) داخل [${selectedStmtObj?.labelAr}] ولا يظهر كبند فرعي مكرر داخل الأقسام.`
                              : `Acts as an umbrella tree header (L${accountModal.level || 1}) in [${selectedStmtObj?.labelEn}].`
                          ) : (
                            isAr
                              ? `سيظهر هذا الحساب في [${selectedStmtObj?.labelAr}] ⬅ تحت قسم [${selectedCatObj?.labelAr}] • المستوى [L${accountModal.level || 1}]${parentAccountObj ? ` (يتبع الأب: ${parentAccountObj.nameAr} - ${parentAccountObj.code})` : ''} • وتأثيره الحسابي: ${isContraEffect ? '(-) يُخصم كحساب عكسي من إجمالي القسم' : '(+) يُضاف إلى إجمالي القسم'}.`
                              : `Routes to [${selectedStmtObj?.labelEn}] -> [${selectedCatObj?.labelEn}] • Level [L${accountModal.level || 1}] • Effect: ${isContraEffect ? '(-) Deducted from section total' : '(+) Added to section total'}.`
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 5: Cash Flow Category, Sub-Ledger, Cost Center */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'تصنيف التدفقات النقدية:' : 'Cash Flow Category:'}</label>
                      <select
                        value={accountModal.cashFlowCategory}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, cashFlowCategory: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                      >
                        {ACCOUNT_CASH_FLOW_CATEGORIES.map((cf) => (
                          <option key={cf.id} value={cf.id}>{isAr ? cf.labelAr : cf.labelEn}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'ربط الأستاذ المساعد:' : 'Sub-Ledger:'}</label>
                      <select
                        value={accountModal.subType}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, subType: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:outline-none cursor-pointer"
                      >
                        {ACCOUNT_SUBTYPES.map((st) => (
                          <option key={st.id} value={st.id}>{isAr ? st.labelAr : st.labelEn}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col justify-center">
                      <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50 cursor-pointer hover:bg-slate-100 transition mt-auto">
                        <input
                          type="checkbox"
                          checked={accountModal.requiresCostCenter}
                          onChange={(e) => setAccountModal((prev) => ({ ...prev, requiresCostCenter: e.target.checked }))}
                          className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="font-bold text-slate-800 block text-[11px]">{isAr ? 'يتطلب مركز تكلفة' : 'Requires Cost Center'}</span>
                          <span className="text-[9px] text-slate-500 block">{isAr ? 'لمصروفات المصنع والتشغيل' : 'For factory & OPEX'}</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Row 6: Descriptions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'شرح ووصف الحساب (عربي):' : 'Arabic Description:'}</label>
                      <textarea
                        rows={2}
                        value={accountModal.descriptionAr}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, descriptionAr: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الوصف بالإنجليزية:' : 'English Description:'}</label>
                      <textarea
                        rows={2}
                        value={accountModal.descriptionEn}
                        onChange={(e) => setAccountModal((prev) => ({ ...prev, descriptionEn: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
                  <button type="button" onClick={() => setAccountModal((prev) => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold cursor-pointer">
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button type="submit" className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md cursor-pointer">
                    {accountModal.isEdit ? (isAr ? 'حفظ تعديلات الحساب ✓' : 'Update Account ✓') : (isAr ? 'إنشاء وتفعيل الحساب ✓' : 'Create Account ✓')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Full-Screen Attachment Viewer Modal for General Ledger Audits */}
      {selectedAttachmentForView && (
        <AttachmentViewerModal
          attachment={selectedAttachmentForView}
          isOpen={Boolean(selectedAttachmentForView)}
          onClose={() => setSelectedAttachmentForView(null)}
        />
      )}

      {/* Interactive Popover Modal for Supporting System Documents & Uploaded Audit Attachments */}
      {activeAttachmentPopover && (() => {
        const { entry, systemDocs, uploadedDocs } = activeAttachmentPopover;
        const isReversed = entry.status === 'reversed';

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
            onClick={() => setActiveAttachmentPopover(null)}
          >
            <div
              className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]"
              onClick={(e) => e.stopPropagation()}
              dir={isAr ? 'rtl' : 'ltr'}
            >
              {/* Popover Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                    <Paperclip className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm md:text-base text-white">
                        {isAr ? 'المستندات والوثائق المؤيدة للقيد المحاسبي' : 'Supporting Audit Documents & Slips'}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/30 text-purple-200 border border-purple-400/30">
                        {systemDocs.length + uploadedDocs.length} {isAr ? 'وثيقة' : 'Docs'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {entry.entryNumber || entry.id} • {entry.docLabelAr || entry.sourceDocType} • {entry.entryDate || entry.createdAt?.slice(0, 10)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAttachmentPopover(null)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Popover Body (Scrollable) */}
              <div className="p-4 md:p-5 overflow-y-auto flex-1 space-y-5 divide-y divide-slate-100">
                
                {/* SECTION 1: System Official Slips */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                      <FileCheck className="h-4 w-4 text-emerald-600" />
                      <span>{isAr ? 'المستندات النظامية المعتمدة (قابلة للطباعة A4)' : 'System Printouts (A4 Slips)'}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {systemDocs.length} {isAr ? 'مستند نظامي معتمد' : 'Slips'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {systemDocs.map((docItem) => (
                      <div
                        key={docItem.id}
                        className="p-3 rounded-xl border border-slate-200 hover:border-purple-300 bg-slate-50/70 hover:bg-purple-50/30 transition flex flex-col justify-between gap-2 shadow-2xs group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-white text-slate-700 border border-slate-200">
                              {docItem.badgeAr}
                            </span>
                            {docItem.icon === 'book' && <BookOpen className="h-4 w-4 text-purple-600" />}
                            {docItem.icon === 'receipt' && <Receipt className="h-4 w-4 text-emerald-600" />}
                            {docItem.icon === 'shield' && <ShieldCheck className="h-4 w-4 text-indigo-600" />}
                            {docItem.icon === 'fileText' && <FileText className="h-4 w-4 text-blue-600" />}
                            {docItem.icon === 'transfer' && <ArrowRightLeft className="h-4 w-4 text-indigo-600" />}
                          </div>
                          <h4 className="font-extrabold text-xs text-slate-900 group-hover:text-purple-900 transition">
                            {isAr ? docItem.titleAr : docItem.titleEn}
                          </h4>
                          <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">
                            {isAr ? docItem.descAr : docItem.descEn}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => docItem.action()}
                          className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>{isAr ? 'معاينة وطباعة السند' : 'Preview & Print Slip'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION 2: Uploaded Audit Files */}
                <div className="pt-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="h-4 w-4 text-purple-600" />
                      <span>{isAr ? 'المرفقات والوثائق المسحوبة ضوئياً (فواتير، إيصالات، صور)' : 'Uploaded Audit Files (Invoices, Receipts, Photos)'}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {uploadedDocs.length} {isAr ? 'ملف مرفق' : 'Files'}
                    </span>
                  </div>

                  {uploadedDocs.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {uploadedDocs.map((att, attIdx) => {
                        const attUrl = typeof att === 'string' ? att : (att.url || att.dataUrl || '');
                        const attName = typeof att === 'string' ? `مرفق #${attIdx + 1}` : (att.name || `مستند مؤيد #${attIdx + 1}`);
                        const attType = typeof att === 'object' ? (att.type || '') : '';
                        const isPdf = attType === 'application/pdf' || attUrl?.startsWith('data:application/pdf') || /\.pdf$/i.test(attUrl) || /\.pdf$/i.test(attName);
                        const isImage = attType?.startsWith('image/') || attUrl?.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(attUrl) || /\.(png|jpe?g|webp|gif|svg)$/i.test(attName);

                        return (
                          <div
                            key={attIdx}
                            className="p-3 rounded-xl border border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/20 transition flex items-center justify-between gap-3 shadow-2xs group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isImage && attUrl ? (
                                <img
                                  src={attUrl}
                                  alt={attName}
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isPdf ? 'bg-rose-50 text-rose-600' : 'bg-purple-50 text-purple-600'}`}>
                                  <FileText className="h-5 w-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-xs text-slate-900 truncate" title={attName}>
                                  {attName}
                                </p>
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  {isPdf ? 'مستند PDF' : isImage ? 'صورة مستند' : 'ملف مرفق'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSelectedAttachmentForView(att)}
                                className="p-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 transition cursor-pointer"
                                title={isAr ? 'معاينة ملء الشاشة' : 'Fullscreen Preview'}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {attUrl && (
                                <a
                                  href={attUrl}
                                  download={attName}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                  title={isAr ? 'تحميل الملف' : 'Download File'}
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-slate-400 text-xs">
                      {isAr
                        ? 'لا توجد مرفقات مسحوبة ضوئياً لهذا القيد (المستندات النظامية المعتمدة أعلاه مؤيدة وموثقة برمز QR).'
                        : 'No uploaded files attached to this entry. (System documents above are fully verified).'
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Popover Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600 shrink-0">
                <div className="flex items-center gap-3">
                  <span>
                    {isAr ? 'الطرف المقابل:' : 'Counterparty:'}{' '}
                    <b className="text-slate-900">{entry.supplierName || entry.subAccountName || entry.safeId || '—'}</b>
                  </span>
                  <span>•</span>
                  <span>
                    {isAr ? 'الإجمالي:' : 'Total:'}{' '}
                    <b className="text-slate-900 font-mono">{(entry.totalDebit || 0).toLocaleString()} ج.م</b>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAttachmentPopover(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 transition cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Journal Reversal Confirmation Modal */}
      {reversalModal.isOpen && reversalModal.entry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 w-full max-w-lg overflow-hidden flex flex-col my-auto max-h-[92vh]">
            {/* Header */}
            <div className="p-4 bg-linear-to-r from-rose-600 to-rose-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                  <RotateCcw className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-wide">
                    {isAr ? 'عكس وإلغاء القيد المحاسبي' : 'Reverse Journal Entry'}
                  </h3>
                  <p className="text-[11px] text-rose-100 font-mono">
                    {reversalModal.entry.entryNumber || reversalModal.entry.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReversalModal({ isOpen: false, entry: null, reason: '', isSubmitting: false, error: '' })}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body Form */}
            <form onSubmit={handleConfirmReversal} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Entry Details Summary Card */}
                <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{isAr ? 'نوع السند / القيد:' : 'Entry Type:'}</span>
                    <span className="font-bold text-slate-800">
                      {reversalModal.entry.streamType === 'cash'
                        ? (isAr ? 'سند نقدية / خزينة' : 'Cash Voucher')
                        : (isAr ? 'قيد استحقاق / مخزون' : 'Accrual / Stock JE')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{isAr ? 'التاريخ:' : 'Date:'}</span>
                    <span className="font-mono text-slate-800">{reversalModal.entry.date}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{isAr ? 'الطرف المقابل / البيان:' : 'Counterparty / Desc:'}</span>
                    <span className="font-bold text-slate-800 truncate max-w-[240px]">
                      {reversalModal.entry.supplierName || reversalModal.entry.subAccountName || reversalModal.entry.description || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-rose-200/60 pt-2 font-bold">
                    <span className="text-rose-900">{isAr ? 'القيمة الإجمالية:' : 'Total Amount:'}</span>
                    <span className="text-rose-700 font-mono text-sm">
                      {(reversalModal.entry.totalDebit || 0).toLocaleString()} ج.م
                    </span>
                  </div>
                </div>

                {/* Accounting Audit Guarantee Notice */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{isAr ? 'أثر العكس المحاسبي والنظامي' : 'Audit Trail & Balancing Guarantee'}</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {reversalModal.entry.streamType === 'cash'
                      ? (isAr
                          ? 'سيتم إلغاء السند وعكس أثره المالي فورياً، وإعادة أرصدة الخزينة والفئات النقدية تلقائياً لمنع أي خلل في الجرد.'
                          : 'Cash balance and banknote denominations will be automatically restored to the safe.')
                      : (isAr
                          ? 'سيتم إصدار قيد عكسي تلقائي (JE-REV) يعكس كافة الأطراف المدينة والدائنة بدقة متناهية، مع تحديث المستند التشغيلي المرتبط كـ "ملغي/معكوس".'
                          : 'An automatic compensating reversing entry (JE-REV) will invert debits and credits, marking linked operations as reversed.')
                      }
                  </p>
                </div>

                {/* Reversal Reason Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    {isAr ? 'سبب العكس والإلغاء (إلزامي للتوثيق والرقابة)' : 'Reversal Reason (Mandatory for audit)'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={reversalModal.reason}
                    onChange={(e) => setReversalModal((prev) => ({ ...prev, reason: e.target.value, error: '' }))}
                    placeholder={isAr ? 'اكتب سبب إلغاء القيد بالتفصيل (مثل: خطأ في إدخال القيمة، إلغاء استلام بضاعة...)' : 'Enter detailed reason for reversal...'}
                    rows={3}
                    required
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white placeholder-slate-400"
                  />
                </div>

                {/* Error Message */}
                {reversalModal.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{reversalModal.error}</span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setReversalModal({ isOpen: false, entry: null, reason: '', isSubmitting: false, error: '' })}
                  disabled={reversalModal.isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء التراجع' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={reversalModal.isSubmitting || !reversalModal.reason.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-95 text-white transition disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5 shadow-md shadow-rose-200 cursor-pointer"
                >
                  {reversalModal.isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{isAr ? 'جاري العكس...' : 'Reversing...'}</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{isAr ? 'تأكيد عكس القيد دفترياً' : 'Confirm Reversal'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Journal Entry Voucher Print Slip (A4) */}
      {selectedJournalVoucherForPrint && (
        <JournalVoucherPrintSlip
          entry={selectedJournalVoucherForPrint}
          onClose={() => setSelectedJournalVoucherForPrint(null)}
        />
      )}

      {/* Official Cash Disbursement / Collection Voucher Print Slip (A4) */}
      {selectedCashVoucherForPrint && (
        <CashVoucherPrintSlip
          voucher={selectedCashVoucherForPrint.voucher}
          safe={selectedCashVoucherForPrint.safe}
          onClose={() => setSelectedCashVoucherForPrint(null)}
        />
      )}

      {/* Official Custody & Advance Acknowledgment Slip (A4) */}
      {selectedCustodyForPrint && (
        <CustodyAcknowledgmentPrintSlip
          documentData={selectedCustodyForPrint}
          onClose={() => setSelectedCustodyForPrint(null)}
        />
      )}

      {/* Official Goods Receipt / Supplier Return Note Print Slip (A4) */}
      {selectedGrnForPrint && (
        <GoodsReceiptPrintSlip
          grn={selectedGrnForPrint}
          onClose={() => setSelectedGrnForPrint(null)}
        />
      )}

      {/* Official Internal Stock Transfer Voucher Print Slip (A4) */}
      {selectedTrnForPrint && (
        <StockTransferPrintSlip
          trn={selectedTrnForPrint}
          warehouses={warehousesList}
          onClose={() => setSelectedTrnForPrint(null)}
        />
      )}

      {/* Official Trial Balance Report Print Slip (A4) */}
      {selectedTrialBalanceForPrint && (
        <TrialBalancePrintSlip
          trialBalanceData={selectedTrialBalanceForPrint}
          onClose={() => setSelectedTrialBalanceForPrint(null)}
          activeLedgerMode={activeLedgerMode}
          currentUser={currentUser}
        />
      )}

      {/* Secret Secured Door Modal */}
      <SecretDoorModal
        isOpen={showSecretDoorModal}
        onClose={() => setShowSecretDoorModal(false)}
        onSuccess={() => {}}
        isAr={isAr}
        currentUser={currentUser}
      />

      {/* Manual Adjustment Journal Entry Modal */}
      <ManualJournalEntryModal
        isOpen={isManualEntryModalOpen}
        onClose={() => setIsManualEntryModalOpen(false)}
        onSuccess={(entry) => {
          setSuccessMsg(
            isAr
              ? `تم ترحيل قيد التسوية المحاسبي (${entry.entryNumber || entry.id}) بنجاح ✓`
              : `Manual adjustment entry (${entry.entryNumber || entry.id}) posted successfully ✓`
          );
          setTimeout(() => setSuccessMsg(''), 5000);
        }}
        accountsList={accountsList}
        suppliersList={suppliersList}
        clientsList={clientsList}
        workersList={workersList}
        safesList={safesList}
        banksList={banksList}
        currentUser={currentUser}
        isAr={isAr}
      />

      {/* Trial Balance Diagnostic Imbalance Assistant Modal */}
      <TrialBalanceDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        accountsList={accountsList}
        transactionsList={transactionsList}
        journalEntries={journalEntries}
        accountingLinks={accountingLinks}
        activeLedgerMode={activeLedgerMode}
        trialBalanceData={trialBalanceData}
        onInspectEntry={(entry) => {
          setActiveSubTab('journal');
          setJournalSearchTerm(entry?.id || entry?.entryNumber || '');
        }}
        isAr={isAr}
      />
    </div>
  );
}
