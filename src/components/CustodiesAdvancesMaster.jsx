import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Wallet,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  FileCheck,
  PlusCircle,
  Eye,
  CheckCircle2,
  Calendar,
  X,
  Upload,
  Paperclip,
  Coins,
  Landmark,
  Building2,
  Wand2,
  AlertTriangle,
  RotateCcw,
  FileText,
  Check,
  Plus,
  Trash2,
  CalendarDays,
  CreditCard,
  Layers,
  ChevronDown,
  Copy,
  Hash,
  Bookmark,
  ExternalLink,
  ShieldAlert,
  Printer,
  Clock,
  AlertCircle,
  Edit,
  Save,
  ShieldCheck,
  MoreVertical,
  FileSpreadsheet
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, fileToDataUrl } from '../firebase.js';
import {
  EGP_DENOMINATIONS,
  CORPORATE_BANK_ACCOUNTS,
  calculateBanknoteTotal,
  validateBanknoteMatch,
  checkSufficientBanknotes,
  postCashVoucher,
  generateCustodyOrAdvanceId,
  generateCustodySettlementId,
  generateAdvanceDeductionId,
  generateAdvanceInstallmentId,
  formatYYMMDD,
  formatYYMM,
  updateCustodyLedgerAfterVoucher,
  saveCustodyAdvanceDraft,
  deleteCustodyAdvanceDraft,
  updateCustodyOrAdvanceRecord
} from '../utils/cashLedgerEngine.js';
import AttachmentViewerModal from './AttachmentViewerModal.jsx';
import { RowCommentButton } from './comments';
import CustodyAcknowledgmentPrintSlip from './CustodyAcknowledgmentPrintSlip.jsx';
import EditCustodyModal from './EditCustodyModal.jsx';
import SearchableSelect from './SearchableSelect.jsx';
import { highlightTargetRow } from '../utils/notificationEngine.js';

// Expense Categories for Itemized Custody Liquidation
const CUSTODY_EXPENSE_CATEGORIES = [
  { id: 'maintenance', nameAr: 'صيانة وقطع غيار ومهمات (6210)', nameEn: 'Maintenance & Spare Parts' },
  { id: 'direct_materials', nameAr: 'خامات ومستلزمات تشغيل عاجلة (5100)', nameEn: 'Direct Production Materials' },
  { id: 'fuel_transport', nameAr: 'وقود ونقل ومشالات وتوصيل (6110)', nameEn: 'Fuel, Freight & Transport' },
  { id: 'meals_hospitality', nameAr: 'إعاشة ووجبات وضيافة ورش (6220)', nameEn: 'Meals, Water & Hospitality' },
  { id: 'supplies', nameAr: 'مستلزمات نظافة وأدوات مكتبية (6230)', nameEn: 'Cleaning & General Supplies' },
  { id: 'general_expense', nameAr: 'مصروفات تشغيل متنوعة (6290)', nameEn: 'Miscellaneous General OPEX' }
];

// Cost Centers for Allocation
const COST_CENTERS_LIST = [
  { id: 'CC-PROD-01', nameAr: 'خط الإنتاج والتصنيع 1', nameEn: 'Line 1' },
  { id: 'CC-PROD-02', nameAr: 'خط الإنتاج والتصنيع 2', nameEn: 'Line 2' },
  { id: 'CC-FLEET', nameAr: 'أسطول النقل والسيارات', nameEn: 'Fleet' },
  { id: 'CC-MAINT', nameAr: 'ورشة الصيانة العامة', nameEn: 'Workshop' },
  { id: 'CC-ADMIN', nameAr: 'إدارة المصنع والمقر', nameEn: 'Admin' },
  { id: 'CC-GENERAL', nameAr: 'عام / غير مخصص', nameEn: 'General' }
];

// Helper to generate upcoming 18 months for payroll dropdowns
function getUpcomingMonths(count = 18) {
  const months = [];
  const now = new Date();
  const arMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const mNum = d.getMonth() + 1;
    const mStr = `${y}-${String(mNum).padStart(2, '0')}`;
    months.push({
      value: mStr,
      labelAr: `${arMonths[d.getMonth()]} ${y} (${mStr})`,
      labelEn: `${enMonths[d.getMonth()]} ${y} (${mStr})`
    });
  }
  return months;
}

export default function CustodiesAdvancesMaster({
  custodyRecords = [],
  workersList = [],
  allSafes = [],
  currentUser
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedAttachmentForView, setSelectedAttachmentForView] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const upcomingMonths = useMemo(() => getUpcomingMonths(18), []);
  const currentMonthValue = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Sub-Tab Switcher: 'all_records' | 'roster' | 'custodies_registry' | 'installments_schedule' | 'drafts'
  const [activeHubTab, setActiveHubTab] = useState('all_records');
  const [masterRegisterTypeFilter, setMasterRegisterTypeFilter] = useState('all'); // 'all' | 'custody' | 'advance'
  const [masterRegisterStatusFilter, setMasterRegisterStatusFilter] = useState('all'); // 'all' | 'active' | 'partially_settled' | 'settled'
  const [activeMenuRecordId, setActiveMenuRecordId] = useState(null);
  const [activePrintDocument, setActivePrintDocument] = useState(null);

  // Live Drafts Collection Subscription
  const [draftsList, setDraftsList] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'custody_advance_drafts'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setDraftsList(list);
    });
    return () => unsub();
  }, []);

  // Action feedback alert toast
  const [actionAlert, setActionAlert] = useState(null); // { type: 'success' | 'error', text: '' }
  useEffect(() => {
    if (actionAlert) {
      const t = setTimeout(() => setActionAlert(null), 4500);
      return () => clearTimeout(t);
    }
  }, [actionAlert]);

  // Focus on specific custody/advance record when navigating from QR code
  useEffect(() => {
    const handleFocusCustody = (e) => {
      const { recordId } = e.detail || {};
      if (recordId) {
        setSearchQuery(recordId);
        if (recordId.startsWith('ADV-') || recordId.startsWith('DED-')) {
          setActiveHubTab('installments_schedule');
        } else if (recordId.startsWith('CST-DRF-') || recordId.startsWith('ADV-DRF-')) {
          setActiveHubTab('drafts');
        } else {
          setActiveHubTab('custodies_registry');
        }
        setTimeout(() => highlightTargetRow(recordId), 600);
      }
    };

    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const hp = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
      const rId = sp.get('recordId') || hp.get('recordId') || sp.get('id') || hp.get('id');
      if (rId) {
        setSearchQuery(rId);
        if (rId.startsWith('ADV-') || rId.startsWith('DED-')) {
          setActiveHubTab('installments_schedule');
        } else if (rId.startsWith('CST-DRF-') || rId.startsWith('ADV-DRF-')) {
          setActiveHubTab('drafts');
        } else {
          setActiveHubTab('custodies_registry');
        }
        setTimeout(() => highlightTargetRow(rId), 700);
      }
    }

    window.addEventListener('app_focus_transaction', handleFocusCustody);
    return () => window.removeEventListener('app_focus_transaction', handleFocusCustody);
  }, []);

  // Edit Active Custody/Advance Modal state
  const [editModal, setEditModal] = useState({ isOpen: false, item: null });

  // Clipboard copy state
  const [copiedId, setCopiedId] = useState(null);
  const handleCopyId = (eOrId, maybeId) => {
    let id = maybeId;
    if (typeof eOrId === 'string') {
      id = eOrId;
    } else {
      eOrId?.stopPropagation?.();
    }
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  // Helper to trigger standard A4 acknowledgment print for ANY custody or advance record
  const handlePrintRecord = (record) => {
    if (!record) return;
    const worker = workersList.find((w) => w.id === record.workerId);
    const safeObj = allSafes.find((s) => s.id === (record.sourceSafeId || record.safeId));
    const safeName = safeObj
      ? (isAr ? safeObj.nameAr : (safeObj.nameEn || safeObj.nameAr))
      : (record.sourceSafeId || record.safeId || (isAr ? 'الخزينة الرئيسية' : 'Main Vault'));

    setActivePrintDocument({
      id: record.id,
      type: record.type || (record.id.startsWith('ADV-') ? 'salary_advance' : 'custody_issue'),
      workerId: record.workerId,
      workerName: record.workerName || (isAr ? (worker?.nameAr || worker?.name) : (worker?.name || worker?.nameAr)),
      workerRole: worker?.role || record.workerRole || '',
      amount: Number(record.originalAmount || record.amount || 0),
      currency: record.currency || 'EGP',
      sourceSafeId: record.sourceSafeId || record.safeId || 'SAFE-01',
      sourceSafeName: safeName,
      denominations: record.denominations || {},
      notes: record.notes || record.statement || '',
      date: record.issuedAt || record.createdAt || record.date || new Date().toISOString(),
      issuedByName: record.issuedByName || currentUser?.name || currentUser?.nameAr || (isAr ? 'مسؤول الخزينة' : 'Vault Officer')
    });
  };

  // ---------------------------------------------------------------------------
  // 1. ISSUE MODAL STATE (صرف عهدة أو سلفة مع مسودة وتوقيع المستفيد)
  // ---------------------------------------------------------------------------
  const [issueModal, setIssueModal] = useState({
    isOpen: false,
    type: 'custody_issue',
    draftId: null,
    isDraftMode: false
  });
  const [issueWorkerId, setIssueWorkerId] = useState('');
  const [issueAmount, setIssueAmount] = useState('');
  const [issueSourceId, setIssueSourceId] = useState(() => (allSafes[0]?.id || 'SAFE-01'));
  const [issueDenoms, setIssueDenoms] = useState(() => {
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    return init;
  });
  const [issueNotes, setIssueNotes] = useState('');
  const [issueAttachments, setIssueAttachments] = useState([]);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [signedDocument, setSignedDocument] = useState(null);
  const [isPrintingAck, setIsPrintingAck] = useState(false);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [issueError, setIssueError] = useState('');

  // ---------------------------------------------------------------------------
  // 2. CUSTODY SETTLEMENT MODAL STATE (تسوية عهدة: توريد نقدي أو فواتير متعددة)
  // ---------------------------------------------------------------------------
  const [custodySettleModal, setCustodySettleModal] = useState({
    isOpen: false,
    method: 'cash_return', // 'cash_return' | 'expense_bill'
    workerId: '',
    targetCustodyId: ''
  });
  const [custodySettleCashAmount, setCustodySettleCashAmount] = useState('');
  const [custodySettleDestId, setCustodySettleDestId] = useState(() => (allSafes[0]?.id || 'SAFE-01'));
  const [custodySettleDenoms, setCustodySettleDenoms] = useState(() => {
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    return init;
  });
  const [custodySettleNotes, setCustodySettleNotes] = useState('');
  const [custodySettleAttachments, setCustodySettleAttachments] = useState([]);

  // Multiple Expense Items State for Liquidate Tab
  const [custodyExpenseItems, setCustodyExpenseItems] = useState([
    {
      id: 'exp-1',
      title: '',
      category: 'maintenance',
      costCenterId: 'CC-PROD-01',
      amount: '',
      invoiceNumber: '',
      vendorName: ''
    }
  ]);
  const [isSubmittingCustodySettle, setIsSubmittingCustodySettle] = useState(false);
  const [custodySettleError, setCustodySettleError] = useState('');

  // ---------------------------------------------------------------------------
  // 3. ADVANCE SETTLEMENT MODAL STATE (سداد نقدي / خصم راتب شهر / أقساط مجدولة)
  // ---------------------------------------------------------------------------
  const [advanceSettleModal, setAdvanceSettleModal] = useState({
    isOpen: false,
    settleType: 'cash', // 'cash' | 'payroll_deduction' | 'installments'
    workerId: '',
    targetAdvanceId: ''
  });
  const [advanceCashAmount, setAdvanceCashAmount] = useState('');
  const [advanceDestId, setAdvanceDestId] = useState(() => (allSafes[0]?.id || 'SAFE-01'));
  const [advanceDenoms, setAdvanceDenoms] = useState(() => {
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    return init;
  });
  const [advancePayrollMonth, setAdvancePayrollMonth] = useState(currentMonthValue);
  const [advancePayrollAmount, setAdvancePayrollAmount] = useState('');
  const [advanceInstallmentCount, setAdvanceInstallmentCount] = useState(3);
  const [advanceInstallmentRows, setAdvanceInstallmentRows] = useState([]);
  const [advanceSettleNotes, setAdvanceSettleNotes] = useState('');
  const [advanceSettleAttachments, setAdvanceSettleAttachments] = useState([]);
  const [isSubmittingAdvanceSettle, setIsSubmittingAdvanceSettle] = useState(false);
  const [advanceSettleError, setAdvanceSettleError] = useState('');

  // ---------------------------------------------------------------------------
  // CALCULATIONS & ACTIVE RESOLVERS
  // ---------------------------------------------------------------------------
  const totalCustodies = custodyRecords.reduce((sum, r) => sum + (Number(r.currentCustodyBalance) || 0), 0);
  const totalAdvances = custodyRecords.reduce((sum, r) => sum + (Number(r.currentAdvanceBalance) || 0), 0);

  const filteredRecords = custodyRecords.filter((r) => {
    const name = r.workerName?.toLowerCase() || '';
    const q = searchQuery.toLowerCase();
    return name.includes(q) || r.workerId?.toLowerCase().includes(q);
  });

  // 1. Issue Modal Resolvers
  const isIssueBank = Boolean(issueSourceId?.startsWith('BANK-'));
  const selectedIssueSafe = useMemo(() => {
    return allSafes.find((s) => s.id === issueSourceId) || allSafes[0];
  }, [allSafes, issueSourceId]);
  const issueSafeDenoms = selectedIssueSafe?.balances?.EGP?.denominations || {};
  const issueSafeBal = Number(selectedIssueSafe?.balances?.EGP?.currentBalance) || 0;
  const countedIssueBanknotes = useMemo(() => calculateBanknoteTotal(issueDenoms), [issueDenoms]);
  const numIssueAmount = Number(issueAmount) || 0;
  const isIssueBanknoteBalanced = isIssueBank || Math.abs(countedIssueBanknotes - numIssueAmount) < 0.005;

  const selectedIssueWorker = useMemo(() => {
    return workersList.find((w) => w.id === issueWorkerId) || null;
  }, [workersList, issueWorkerId]);

  const selectedIssueWorkerName = useMemo(() => {
    return isAr
      ? (selectedIssueWorker?.nameAr || selectedIssueWorker?.name || issueWorkerId)
      : (selectedIssueWorker?.name || selectedIssueWorker?.nameAr || issueWorkerId);
  }, [selectedIssueWorker, issueWorkerId, isAr]);

  // SearchableSelect options for beneficiary workers - STRICTLY without raw IDs
  const issueWorkerOptions = useMemo(() => {
    return workersList.map((w) => ({
      value: w.id,
      label: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
      sublabel: w.role || (isAr ? 'موظف' : 'Staff'),
      badgeText: w.role || (isAr ? 'عامل' : 'Worker')
    }));
  }, [workersList, isAr]);

  const custodySettleWorkerOptions = useMemo(() => {
    return workersList
      .map((w) => {
        const rec = custodyRecords.find((r) => r.workerId === w.id);
        const bal = Number(rec?.currentCustodyBalance) || 0;
        return {
          value: w.id,
          label: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
          sublabel: bal > 0
            ? (isAr ? `عهدة معلقة: ${bal.toLocaleString()} ج.م • ${w.role || ''}` : `Custody Bal: ${bal.toLocaleString()} EGP • ${w.role || ''}`)
            : (w.role || (isAr ? 'موظف' : 'Staff')),
          badgeText: bal > 0 ? (isAr ? `${bal.toLocaleString()} ج.م` : `${bal.toLocaleString()} EGP`) : (w.role || '')
        };
      })
      .sort((a, b) => {
        const aBal = Number(custodyRecords.find((r) => r.workerId === a.value)?.currentCustodyBalance) || 0;
        const bBal = Number(custodyRecords.find((r) => r.workerId === b.value)?.currentCustodyBalance) || 0;
        return bBal - aBal;
      });
  }, [workersList, custodyRecords, isAr]);

  const advanceSettleWorkerOptions = useMemo(() => {
    return workersList
      .map((w) => {
        const rec = custodyRecords.find((r) => r.workerId === w.id);
        const bal = Number(rec?.currentAdvanceBalance) || 0;
        return {
          value: w.id,
          label: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
          sublabel: bal > 0
            ? (isAr ? `سلفة مستحقة: ${bal.toLocaleString()} ج.م • ${w.role || ''}` : `Advance Bal: ${bal.toLocaleString()} EGP • ${w.role || ''}`)
            : (w.role || (isAr ? 'موظف' : 'Staff')),
          badgeText: bal > 0 ? (isAr ? `${bal.toLocaleString()} ج.م` : `${bal.toLocaleString()} EGP`) : (w.role || '')
        };
      })
      .sort((a, b) => {
        const aBal = Number(custodyRecords.find((r) => r.workerId === a.value)?.currentAdvanceBalance) || 0;
        const bBal = Number(custodyRecords.find((r) => r.workerId === b.value)?.currentAdvanceBalance) || 0;
        return bBal - aBal;
      });
  }, [workersList, custodyRecords, isAr]);

  // Requirement: Issuance blocked until print of document and re-upload of signed one
  const canFinalizeIssue = useMemo(() => {
    if (isSubmittingIssue) return false;
    if (numIssueAmount <= 0) return false;
    if (!issueWorkerId) return false;
    if (!hasPrinted) return false;
    if (!signedDocument) return false;
    if (!isIssueBank) {
      if (!isIssueBanknoteBalanced) return false;
      if (issueSafeBal < numIssueAmount) return false;
    }
    return true;
  }, [
    isSubmittingIssue,
    numIssueAmount,
    issueWorkerId,
    hasPrinted,
    signedDocument,
    isIssueBank,
    isIssueBanknoteBalanced,
    issueSafeBal
  ]);

  // 2. Custody Settlement Resolvers
  const selectedCustodyWorkerRecord = useMemo(() => {
    return custodyRecords.find((r) => r.workerId === custodySettleModal.workerId) || null;
  }, [custodyRecords, custodySettleModal.workerId]);
  const custodyOutstandingBalance = Number(selectedCustodyWorkerRecord?.currentCustodyBalance) || 0;
  const isCustodyDestBank = Boolean(custodySettleDestId?.startsWith('BANK-'));
  const countedCustodyBanknotes = useMemo(() => calculateBanknoteTotal(custodySettleDenoms), [custodySettleDenoms]);
  const numCustodyCashAmount = Number(custodySettleCashAmount) || 0;
  const isCustodyBanknoteBalanced = isCustodyDestBank || Math.abs(countedCustodyBanknotes - numCustodyCashAmount) < 0.005;
  const selectedCustodyDestSafe = useMemo(() => {
    return allSafes.find((s) => s.id === custodySettleDestId) || allSafes[0];
  }, [allSafes, custodySettleDestId]);
  const custodyDestSafeDenoms = selectedCustodyDestSafe?.balances?.EGP?.denominations || {};

  // Sum of itemized expenses in custody liquidation tab
  const totalCustodyItemizedExpenses = useMemo(() => {
    return custodyExpenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [custodyExpenseItems]);

  // 3. Advance Settlement Resolvers
  const selectedAdvanceWorkerRecord = useMemo(() => {
    return custodyRecords.find((r) => r.workerId === advanceSettleModal.workerId) || null;
  }, [custodyRecords, advanceSettleModal.workerId]);
  const advanceOutstandingBalance = Number(selectedAdvanceWorkerRecord?.currentAdvanceBalance) || 0;
  const isAdvanceDestBank = Boolean(advanceDestId?.startsWith('BANK-'));
  const countedAdvanceBanknotes = useMemo(() => calculateBanknoteTotal(advanceDenoms), [advanceDenoms]);
  const numAdvanceCashAmount = Number(advanceCashAmount) || 0;
  const isAdvanceBanknoteBalanced = isAdvanceDestBank || Math.abs(countedAdvanceBanknotes - numAdvanceCashAmount) < 0.005;
  const selectedAdvanceDestSafe = useMemo(() => {
    return allSafes.find((s) => s.id === advanceDestId) || allSafes[0];
  }, [allSafes, advanceDestId]);
  const advanceDestSafeDenoms = selectedAdvanceDestSafe?.balances?.EGP?.denominations || {};

  const totalAdvanceInstallmentsSum = useMemo(() => {
    return advanceInstallmentRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }, [advanceInstallmentRows]);

  // ---------------------------------------------------------------------------
  // SSOT RESOLVERS & REGISTRIES
  // ---------------------------------------------------------------------------
  // 1. Live preview of SSOT ID in Issue Modal
  const previewIssueSsotId = useMemo(() => {
    if (issueModal.draftId) return issueModal.draftId;
    return generateCustodyOrAdvanceId({
      type: issueModal.type,
      safeId: issueSourceId,
      date: new Date(),
      existingRecords: custodyRecords,
      drafts: draftsList
    });
  }, [issueModal.type, issueModal.draftId, issueSourceId, custodyRecords, draftsList]);

  // Data to pass to CustodyAcknowledgmentPrintSlip
  const printDataForAck = useMemo(() => {
    return {
      id: issueModal.draftId || previewIssueSsotId,
      type: issueModal.type,
      workerId: issueWorkerId,
      workerName: selectedIssueWorkerName,
      workerRole: selectedIssueWorker?.role || '',
      amount: numIssueAmount,
      currency: 'EGP',
      sourceSafeId: issueSourceId,
      sourceSafeName: allSafes.find((s) => s.id === issueSourceId)?.nameAr || CORPORATE_BANK_ACCOUNTS.find((b) => b.id === issueSourceId)?.bankNameAr || issueSourceId,
      denominations: isIssueBank ? {} : issueDenoms,
      notes: issueNotes,
      date: new Date().toISOString(),
      issuedByName: currentUser?.name || currentUser?.nameAr || currentUser?.id || 'مسؤول الخزينة'
    };
  }, [
    issueModal.draftId,
    previewIssueSsotId,
    issueModal.type,
    issueWorkerId,
    selectedIssueWorkerName,
    selectedIssueWorker,
    numIssueAmount,
    issueSourceId,
    allSafes,
    isIssueBank,
    issueDenoms,
    issueNotes,
    currentUser
  ]);

  // Filtered drafts list
  const filteredDrafts = useMemo(() => {
    return draftsList.filter((d) => {
      const q = searchQuery.toLowerCase();
      const name = (d.workerName || '').toLowerCase();
      const wid = (d.workerId || '').toLowerCase();
      const id = (d.id || '').toLowerCase();
      return name.includes(q) || wid.includes(q) || id.includes(q);
    });
  }, [draftsList, searchQuery]);

  // 2. Extract all active custodies across all workers
  const allActiveCustodies = useMemo(() => {
    const list = [];
    custodyRecords.forEach((r) => {
      const activeMap = r.activeCustodies || {};
      const activeKeys = Object.keys(activeMap);
      let indexedRemainingSum = 0;
      if (activeKeys.length > 0) {
        activeKeys.forEach((k) => {
          const item = activeMap[k];
          const rem = Number(item.remainingAmount) || 0;
          indexedRemainingSum += rem;
          if (item.status !== 'settled' && rem > 0.005) {
            list.push({ ...item, workerName: r.workerName, workerId: r.workerId });
          }
        });
      }
      
      const unindexedBalance = (Number(r.currentCustodyBalance) || 0) - indexedRemainingSum;
      if (unindexedBalance > 0.01) {
        list.push({
          id: `CST-LEGACY-${r.workerId}`,
          type: 'custody_issue',
          workerId: r.workerId,
          workerName: r.workerName,
          originalAmount: unindexedBalance,
          settledAmount: 0,
          remainingAmount: unindexedBalance,
          status: 'active',
          sourceSafeId: 'SAFE-01',
          issuedAt: r.history?.[0]?.date || new Date().toISOString(),
          notes: isAr ? 'رصيد عهدة سابق' : 'Legacy open custody',
          isLegacy: true
        });
      }
    });
    return list.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));
  }, [custodyRecords, isAr]);

  // 3. Extract all active advances across all workers
  const allActiveAdvances = useMemo(() => {
    const list = [];
    custodyRecords.forEach((r) => {
      const activeMap = r.activeAdvances || {};
      const activeKeys = Object.keys(activeMap);
      let indexedRemainingSum = 0;
      if (activeKeys.length > 0) {
        activeKeys.forEach((k) => {
          const item = activeMap[k];
          const rem = Number(item.remainingAmount) || 0;
          indexedRemainingSum += rem;
          if (item.status !== 'settled' && rem > 0.005) {
            list.push({ ...item, workerName: r.workerName, workerId: r.workerId });
          }
        });
      }
      
      const unindexedBalance = (Number(r.currentAdvanceBalance) || 0) - indexedRemainingSum;
      if (unindexedBalance > 0.01) {
        list.push({
          id: `ADV-LEGACY-${r.workerId}`,
          type: 'salary_advance',
          workerId: r.workerId,
          workerName: r.workerName,
          originalAmount: unindexedBalance,
          settledAmount: 0,
          remainingAmount: unindexedBalance,
          status: 'active',
          sourceSafeId: 'SAFE-01',
          issuedAt: r.history?.[0]?.date || new Date().toISOString(),
          notes: isAr ? 'رصيد سلفة سابق' : 'Legacy open advance',
          isLegacy: true
        });
      }
    });
    return list.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));
  }, [custodyRecords, isAr]);

  // 4. Extract all future installments and scheduled deductions across all workers
  const allScheduledDeductions = useMemo(() => {
    const list = [];
    allActiveAdvances.forEach((adv) => {
      if (adv.installments && Array.isArray(adv.installments) && adv.installments.length > 0) {
        adv.installments.forEach((inst) => {
          list.push({
            id: inst.id || `${adv.id}-INS`,
            parentAdvanceId: adv.id,
            workerId: adv.workerId,
            workerName: adv.workerName,
            month: inst.month,
            amount: Number(inst.amount) || 0,
            status: inst.status || 'scheduled',
            installmentNumber: inst.installmentNumber || 1,
            notes: inst.notes || ''
          });
        });
      } else if (adv.settlementMethod === 'payroll_deduction' && adv.payrollMonth) {
        list.push({
          id: adv.deductionId || `DED-${adv.id}-${formatYYMM(adv.payrollMonth)}`,
          parentAdvanceId: adv.id,
          workerId: adv.workerId,
          workerName: adv.workerName,
          month: adv.payrollMonth,
          amount: Number(adv.remainingAmount) || 0,
          status: 'scheduled',
          notes: adv.notes || ''
        });
      }
    });
    return list.sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  }, [allActiveAdvances]);

  // 5. Filtered active custodies and scheduled deductions
  const filteredCustodies = useMemo(() => {
    return allActiveCustodies.filter((c) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (c.id && c.id.toLowerCase().includes(q)) ||
        (c.workerName && c.workerName.toLowerCase().includes(q)) ||
        (c.workerId && c.workerId.toLowerCase().includes(q)) ||
        (c.sourceSafeId && c.sourceSafeId.toLowerCase().includes(q))
      );
    });
  }, [allActiveCustodies, searchQuery]);

  const filteredDeductions = useMemo(() => {
    return allScheduledDeductions.filter((d) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (d.id && d.id.toLowerCase().includes(q)) ||
        (d.parentAdvanceId && d.parentAdvanceId.toLowerCase().includes(q)) ||
        (d.workerName && d.workerName.toLowerCase().includes(q)) ||
        (d.workerId && d.workerId.toLowerCase().includes(q)) ||
        (d.month && d.month.includes(q))
      );
    });
  }, [allScheduledDeductions, searchQuery]);

  // 6. Comprehensive Extraction of ALL Present and Past Records across all workers & statuses
  const allHistoricalAndActiveRecords = useMemo(() => {
    const list = [];
    const seenIds = new Set();

    custodyRecords.forEach((r) => {
      const workerMeta = workersList.find((w) => w.id === r.workerId);
      const resolvedWorkerName = isAr
        ? (workerMeta?.nameAr || workerMeta?.name || r.workerName || r.workerId)
        : (workerMeta?.name || workerMeta?.nameAr || r.workerName || r.workerId);
      const workerRole = workerMeta?.role || '';

      // A. Extract all records from activeCustodies map (active, partially_settled, settled)
      const activeMap = r.activeCustodies || {};
      let indexedCustodyRem = 0;
      Object.keys(activeMap).forEach((k) => {
        const item = activeMap[k];
        if (item && item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          const orig = Number(item.originalAmount || item.amount || 0);
          const stld = Number(item.settledAmount || 0);
          const rem = item.remainingAmount !== undefined ? Number(item.remainingAmount) : Math.max(0, orig - stld);
          indexedCustodyRem += rem;
          let status = item.status;
          if (!status) {
            status = rem <= 0.005 ? 'settled' : stld > 0 ? 'partially_settled' : 'active';
          }
          list.push({
            ...item,
            id: item.id,
            type: 'custody_issue',
            workerId: r.workerId,
            workerName: resolvedWorkerName,
            workerRole,
            originalAmount: orig,
            settledAmount: stld,
            remainingAmount: rem,
            status,
            issuedAt: item.issuedAt || item.date || item.createdAt || new Date().toISOString(),
            sourceSafeId: item.sourceSafeId || 'SAFE-01',
            attachments: Array.isArray(item.attachments) ? item.attachments : [],
            signedDocument: item.signedDocument || null,
            notes: item.notes || item.description || ''
          });
        }
      });

      // B. Extract all records from activeAdvances map (active, partially_settled, settled)
      const advMap = r.activeAdvances || {};
      let indexedAdvanceRem = 0;
      Object.keys(advMap).forEach((k) => {
        const item = advMap[k];
        if (item && item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          const orig = Number(item.originalAmount || item.amount || 0);
          const stld = Number(item.settledAmount || 0);
          const rem = item.remainingAmount !== undefined ? Number(item.remainingAmount) : Math.max(0, orig - stld);
          indexedAdvanceRem += rem;
          let status = item.status;
          if (!status) {
            status = rem <= 0.005 ? 'settled' : stld > 0 ? 'partially_settled' : 'active';
          }
          list.push({
            ...item,
            id: item.id,
            type: 'salary_advance',
            workerId: r.workerId,
            workerName: resolvedWorkerName,
            workerRole,
            originalAmount: orig,
            settledAmount: stld,
            remainingAmount: rem,
            status,
            issuedAt: item.issuedAt || item.date || item.createdAt || new Date().toISOString(),
            sourceSafeId: item.sourceSafeId || 'SAFE-01',
            attachments: Array.isArray(item.attachments) ? item.attachments : [],
            signedDocument: item.signedDocument || null,
            notes: item.notes || item.description || ''
          });
        }
      });

      // C. Unindexed legacy custody balance (if any)
      const unindexedCustody = (Number(r.currentCustodyBalance) || 0) - indexedCustodyRem;
      if (unindexedCustody > 0.01) {
        const legacyId = `CST-LEGACY-${r.workerId}`;
        if (!seenIds.has(legacyId)) {
          seenIds.add(legacyId);
          list.push({
            id: legacyId,
            type: 'custody_issue',
            workerId: r.workerId,
            workerName: resolvedWorkerName,
            workerRole,
            originalAmount: unindexedCustody,
            settledAmount: 0,
            remainingAmount: unindexedCustody,
            status: 'active',
            sourceSafeId: 'SAFE-01',
            issuedAt: r.history?.[0]?.date || new Date().toISOString(),
            notes: isAr ? 'رصيد عهدة تشغيل سابق' : 'Legacy open custody balance',
            attachments: [],
            isLegacy: true
          });
        }
      }

      // D. Unindexed legacy advance balance (if any)
      const unindexedAdvance = (Number(r.currentAdvanceBalance) || 0) - indexedAdvanceRem;
      if (unindexedAdvance > 0.01) {
        const legacyId = `ADV-LEGACY-${r.workerId}`;
        if (!seenIds.has(legacyId)) {
          seenIds.add(legacyId);
          list.push({
            id: legacyId,
            type: 'salary_advance',
            workerId: r.workerId,
            workerName: resolvedWorkerName,
            workerRole,
            originalAmount: unindexedAdvance,
            settledAmount: 0,
            remainingAmount: unindexedAdvance,
            status: 'active',
            sourceSafeId: 'SAFE-01',
            issuedAt: r.history?.[0]?.date || new Date().toISOString(),
            notes: isAr ? 'رصيد سلفة شخصية سابق' : 'Legacy open advance balance',
            attachments: [],
            isLegacy: true
          });
        }
      }

      // E. Scan history array for past settled items not indexed above
      if (Array.isArray(r.history)) {
        r.history.forEach((h) => {
          const recId = h.id || h.voucherId;
          if (recId && !seenIds.has(recId)) {
            const isCustody = h.type === 'custody_issue' || (h.type && h.type.includes('custody'));
            const isAdvance = h.type === 'salary_advance' || (h.type && h.type.includes('advance'));
            if (isCustody || isAdvance) {
              seenIds.add(recId);
              const amount = Number(h.amount || h.debit || 0);
              list.push({
                id: recId,
                type: isAdvance ? 'salary_advance' : 'custody_issue',
                workerId: r.workerId,
                workerName: resolvedWorkerName,
                workerRole,
                originalAmount: amount,
                settledAmount: amount,
                remainingAmount: 0,
                status: 'settled',
                sourceSafeId: h.sourceSafeId || h.safeId || 'SAFE-01',
                issuedAt: h.date || new Date().toISOString(),
                notes: h.notes || h.description || '',
                attachments: Array.isArray(h.attachments) ? h.attachments : []
              });
            }
          }
        });
      }
    });

    return list.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));
  }, [custodyRecords, workersList, isAr]);

  // 7. Filtered master register records (type filter, status filter, search query)
  const filteredAllRecords = useMemo(() => {
    let list = allHistoricalAndActiveRecords;

    // Type filter
    if (masterRegisterTypeFilter === 'custody') {
      list = list.filter((r) => r.type === 'custody_issue');
    } else if (masterRegisterTypeFilter === 'advance') {
      list = list.filter((r) => r.type === 'salary_advance');
    }

    // Status filter
    if (masterRegisterStatusFilter === 'active') {
      list = list.filter((r) => r.status === 'active' && r.remainingAmount > 0.005);
    } else if (masterRegisterStatusFilter === 'partially_settled') {
      list = list.filter((r) => r.status === 'partially_settled' || (r.settledAmount > 0 && r.remainingAmount > 0.005));
    } else if (masterRegisterStatusFilter === 'settled') {
      list = list.filter((r) => r.status === 'settled' || r.remainingAmount <= 0.005);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        return (
          (r.id && r.id.toLowerCase().includes(q)) ||
          (r.workerName && r.workerName.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q)) ||
          (r.sourceSafeId && r.sourceSafeId.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [allHistoricalAndActiveRecords, masterRegisterTypeFilter, masterRegisterStatusFilter, searchQuery]);

  // ---------------------------------------------------------------------------
  // AUTO-FILL HELPERS
  // ---------------------------------------------------------------------------
  const handleAutoFillIssue = () => {
    if (numIssueAmount <= 0) return;
    let remaining = numIssueAmount;
    const optimal = {};
    EGP_DENOMINATIONS.forEach((d) => (optimal[d] = 0));

    for (const denom of EGP_DENOMINATIONS) {
      if (remaining < denom) continue;
      const neededNotes = Math.floor(remaining / denom);
      const availableNotes = isIssueBank ? Infinity : (Number(issueSafeDenoms[denom]) || 0);
      const countToTake = Math.min(neededNotes, availableNotes);

      if (countToTake > 0) {
        optimal[denom] = countToTake;
        remaining = Math.round((remaining - countToTake * denom) * 100) / 100;
      }
    }
    setIssueDenoms(optimal);
    setIssueError('');
  };

  const handleAutoFillCustodyReturn = () => {
    if (numCustodyCashAmount <= 0) return;
    let remaining = numCustodyCashAmount;
    const optimal = {};
    EGP_DENOMINATIONS.forEach((d) => (optimal[d] = 0));

    for (const denom of EGP_DENOMINATIONS) {
      if (remaining < denom) continue;
      const countToTake = Math.floor(remaining / denom);
      if (countToTake > 0) {
        optimal[denom] = countToTake;
        remaining = Math.round((remaining - countToTake * denom) * 100) / 100;
      }
    }
    setCustodySettleDenoms(optimal);
    setCustodySettleError('');
  };

  const handleAutoFillAdvanceReturn = () => {
    if (numAdvanceCashAmount <= 0) return;
    let remaining = numAdvanceCashAmount;
    const optimal = {};
    EGP_DENOMINATIONS.forEach((d) => (optimal[d] = 0));

    for (const denom of EGP_DENOMINATIONS) {
      if (remaining < denom) continue;
      const countToTake = Math.floor(remaining / denom);
      if (countToTake > 0) {
        optimal[denom] = countToTake;
        remaining = Math.round((remaining - countToTake * denom) * 100) / 100;
      }
    }
    setAdvanceDenoms(optimal);
    setAdvanceSettleError('');
  };

  const handleIssueDenomChange = (denom, val) => {
    if (val === '' || val === undefined) {
      setIssueDenoms((prev) => ({ ...prev, [denom]: 0 }));
      setIssueError('');
      return;
    }
    if (val === '-' || val === '-0') {
      setIssueDenoms((prev) => ({ ...prev, [denom]: '-' }));
      return;
    }
    const clean = String(val).replace(/[^0-9-]/g, '');
    const count = parseInt(clean, 10);
    setIssueDenoms((prev) => ({ ...prev, [denom]: isNaN(count) ? 0 : count }));
    setIssueError('');
  };

  const handleToggleIssueSign = (denom) => {
    setIssueDenoms((prev) => {
      const current = Number(prev[denom]) || 0;
      if (current === 0) return { ...prev, [denom]: -1 };
      return { ...prev, [denom]: -current };
    });
    setIssueError('');
  };

  const handleCustodySettleDenomChange = (denom, val) => {
    if (val === '' || val === undefined) {
      setCustodySettleDenoms((prev) => ({ ...prev, [denom]: 0 }));
      setCustodySettleError('');
      return;
    }
    if (val === '-' || val === '-0') {
      setCustodySettleDenoms((prev) => ({ ...prev, [denom]: '-' }));
      return;
    }
    const clean = String(val).replace(/[^0-9-]/g, '');
    const count = parseInt(clean, 10);
    setCustodySettleDenoms((prev) => ({ ...prev, [denom]: isNaN(count) ? 0 : count }));
    setCustodySettleError('');
  };

  const handleToggleCustodySettleSign = (denom) => {
    setCustodySettleDenoms((prev) => {
      const current = Number(prev[denom]) || 0;
      if (current === 0) return { ...prev, [denom]: -1 };
      return { ...prev, [denom]: -current };
    });
    setCustodySettleError('');
  };

  const handleAdvanceDenomChange = (denom, val) => {
    if (val === '' || val === undefined) {
      setAdvanceDenoms((prev) => ({ ...prev, [denom]: 0 }));
      setAdvanceSettleError('');
      return;
    }
    if (val === '-' || val === '-0') {
      setAdvanceDenoms((prev) => ({ ...prev, [denom]: '-' }));
      return;
    }
    const clean = String(val).replace(/[^0-9-]/g, '');
    const count = parseInt(clean, 10);
    setAdvanceDenoms((prev) => ({ ...prev, [denom]: isNaN(count) ? 0 : count }));
    setAdvanceSettleError('');
  };

  const handleToggleAdvanceSign = (denom) => {
    setAdvanceDenoms((prev) => {
      const current = Number(prev[denom]) || 0;
      if (current === 0) return { ...prev, [denom]: -1 };
      return { ...prev, [denom]: -current };
    });
    setAdvanceSettleError('');
  };

  // Helper to generate installment schedule rows with SSOT IDs
  const generateInstallments = (count, totalTarget, parentAdvanceId = '') => {
    const now = new Date();
    const rows = [];
    const target = Number(totalTarget) || advanceOutstandingBalance || 0;
    const baseMonthly = count > 0 ? Math.floor(target / count) : 0;
    const remainder = target - (baseMonthly * count);

    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const amt = i === 0 ? (baseMonthly + remainder) : baseMonthly;
      const instId = parentAdvanceId
        ? generateAdvanceInstallmentId(parentAdvanceId, i + 1, mStr)
        : `ADV-INS${i + 1}-${formatYYMM(mStr)}`;

      rows.push({
        id: instId,
        installmentNumber: i + 1,
        month: mStr,
        amount: amt > 0 ? String(amt) : '',
        notes: ''
      });
    }
    return rows;
  };

  // ---------------------------------------------------------------------------
  // MODAL OPENERS & DRAFT HANDLERS
  // ---------------------------------------------------------------------------
  const handleOpenIssue = (type = 'custody_issue', workerId = '') => {
    setIssueModal({ isOpen: true, type, draftId: null, isDraftMode: false });
    setIssueWorkerId(workerId);
    setIssueAmount('');
    setIssueError('');
    setIssueNotes('');
    setIssueAttachments([]);
    setHasPrinted(false);
    setSignedDocument(null);
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    setIssueDenoms(init);
  };

  const handleResumeDraft = (draft) => {
    setIssueModal({
      isOpen: true,
      type: draft.type || 'custody_issue',
      draftId: draft.id,
      isDraftMode: true
    });
    setIssueWorkerId(draft.workerId || '');
    setIssueAmount(String(draft.amount || ''));
    setIssueSourceId(draft.sourceSafeId || allSafes[0]?.id || 'SAFE-01');
    if (draft.denominations) {
      setIssueDenoms({ ...draft.denominations });
    }
    setIssueNotes(draft.notes || '');
    setIssueAttachments(Array.isArray(draft.attachments) ? [...draft.attachments] : []);
    setSignedDocument(draft.signedDocument || null);
    setHasPrinted(Boolean(draft.hasPrinted));
    setIssueError('');
  };

  const handleDirectPrintDraft = (draft) => {
    setIssueWorkerId(draft.workerId || '');
    setIssueAmount(String(draft.amount || ''));
    setIssueSourceId(draft.sourceSafeId || allSafes[0]?.id || 'SAFE-01');
    setIssueModal((prev) => ({
      ...prev,
      draftId: draft.id,
      type: draft.type || 'custody_issue'
    }));
    setIsPrintingAck(true);
  };

  const handleDeleteDraft = async (draftId) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذه المسودة نهائياً؟' : 'Are you sure you want to delete this draft?')) {
      return;
    }
    try {
      await deleteCustodyAdvanceDraft(draftId);
      setActionAlert({
        type: 'success',
        text: isAr ? 'تم حذف المسودة بنجاح' : 'Draft deleted successfully'
      });
    } catch (err) {
      alert(err.message || 'Failed to delete draft');
    }
  };

  const handleOpenPrintAck = () => {
    if (!issueWorkerId) {
      setIssueError(isAr ? 'يرجى اختيار الموظف المستفيد قبل الطباعة' : 'Please select beneficiary worker before printing');
      return;
    }
    if (numIssueAmount <= 0) {
      setIssueError(isAr ? 'يرجى إدخال مبلغ صحيح قبل الطباعة' : 'Please enter valid amount before printing');
      return;
    }
    setIssueError('');
    setIsPrintingAck(true);
  };

  const handleSignedDocUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileData = await fileToDataUrl(file);
      if (fileData) {
        setSignedDocument({
          ...fileData,
          isSignedAcknowledgement: true,
          uploadedAt: new Date().toISOString()
        });
        setIssueError('');
      }
    } catch (err) {
      console.error('Signed document upload error:', err);
      setIssueError(isAr ? 'فشل تحميل ملف الإقرار' : 'Failed to upload document');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveDraft = async () => {
    if (!issueWorkerId) {
      setIssueError(isAr ? 'يرجى اختيار الموظف المستفيد لحفظ المسودة' : 'Please select beneficiary staff member');
      return;
    }
    if (numIssueAmount <= 0) {
      setIssueError(isAr ? 'يرجى إدخال مبلغ صحيح لحفظ المسودة' : 'Please enter a valid amount');
      return;
    }

    setIsSubmittingIssue(true);
    setIssueError('');

    try {
      const targetDraftId = issueModal.draftId || previewIssueSsotId;
      const cleanIssueDenoms = Object.fromEntries(
        Object.entries(issueDenoms).map(([k, v]) => [k, Number(v) || 0])
      );

      await saveCustodyAdvanceDraft({
        draftId: targetDraftId,
        type: issueModal.type,
        workerId: issueWorkerId,
        workerName: selectedIssueWorkerName,
        amount: numIssueAmount,
        currency: 'EGP',
        sourceSafeId: issueSourceId,
        denominations: isIssueBank ? {} : cleanIssueDenoms,
        notes: issueNotes,
        attachments: issueAttachments,
        signedDocument,
        hasPrinted,
        currentUser
      });

      setIssueModal({ isOpen: false, type: 'custody_issue', draftId: null, isDraftMode: false });
      setIssueAmount('');
      setIssueNotes('');
      setIssueAttachments([]);
      setSignedDocument(null);
      setHasPrinted(false);
      setActionAlert({
        type: 'success',
        text: isAr
          ? 'تم حفظ العملية كمسودة بنجاح! يمكنك استكمال الطباعة والتوقيع والصرف في أي وقت من تبويب "مسودات بانتظار التوقيع".'
          : 'Saved as draft! You can complete signature and disbursement anytime from the Drafts tab.'
      });
    } catch (err) {
      setIssueError(err.message || (isAr ? 'فشل حفظ المسودة' : 'Failed to save draft'));
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const handleOpenSettleCustody = (workerId = '', method = 'cash_return', targetCustodyId = '') => {
    const initialWorkerId = workerId || custodyRecords.find((r) => (Number(r.currentCustodyBalance) || 0) > 0)?.workerId || '';
    const initialRecord = custodyRecords.find((r) => r.workerId === initialWorkerId);
    
    // Find open custodies for this worker
    const workerCustodies = allActiveCustodies.filter((c) => c.workerId === initialWorkerId);
    const chosenCustody = (targetCustodyId && workerCustodies.find((c) => c.id === targetCustodyId)) || workerCustodies[0] || null;
    const initialBal = chosenCustody ? Number(chosenCustody.remainingAmount) : (Number(initialRecord?.currentCustodyBalance) || 0);

    setCustodySettleModal({
      isOpen: true,
      method,
      workerId: initialWorkerId,
      targetCustodyId: chosenCustody?.id || ''
    });
    setCustodySettleCashAmount(initialBal > 0 ? String(initialBal) : '');
    setCustodyExpenseItems([
      {
        id: 'exp-1',
        title: '',
        category: 'maintenance',
        costCenterId: 'CC-PROD-01',
        amount: initialBal > 0 ? String(initialBal) : '',
        invoiceNumber: '',
        vendorName: ''
      }
    ]);
    setCustodySettleError('');
    setCustodySettleNotes('');
    setCustodySettleAttachments([]);
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    setCustodySettleDenoms(init);
  };

  const handleOpenSettleAdvance = (workerId = '', settleType = 'cash', targetAdvanceId = '') => {
    const initialWorkerId = workerId || custodyRecords.find((r) => (Number(r.currentAdvanceBalance) || 0) > 0)?.workerId || '';
    const initialRecord = custodyRecords.find((r) => r.workerId === initialWorkerId);

    const workerAdvances = allActiveAdvances.filter((a) => a.workerId === initialWorkerId);
    const chosenAdvance = (targetAdvanceId && workerAdvances.find((a) => a.id === targetAdvanceId)) || workerAdvances[0] || null;
    const initialBal = chosenAdvance ? Number(chosenAdvance.remainingAmount) : (Number(initialRecord?.currentAdvanceBalance) || 0);

    setAdvanceSettleModal({
      isOpen: true,
      settleType,
      workerId: initialWorkerId,
      targetAdvanceId: chosenAdvance?.id || ''
    });
    setAdvanceCashAmount(initialBal > 0 ? String(initialBal) : '');
    setAdvancePayrollMonth(currentMonthValue);
    setAdvancePayrollAmount(initialBal > 0 ? String(initialBal) : '');
    setAdvanceInstallmentCount(3);
    setAdvanceInstallmentRows(generateInstallments(3, initialBal, chosenAdvance?.id || ''));
    setAdvanceSettleError('');
    setAdvanceSettleNotes('');
    setAdvanceSettleAttachments([]);
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    setAdvanceDenoms(init);
  };

  // ---------------------------------------------------------------------------
  // SUBMISSION HANDLERS
  // ---------------------------------------------------------------------------
  // 1. Submit Issue Custody or Advance
  const handleSubmitIssue = async (e) => {
    e.preventDefault();
    if (!issueWorkerId) {
      setIssueError(isAr ? 'يرجى اختيار العامل / الموظف المستفيد' : 'Please select beneficiary staff member');
      return;
    }
    if (numIssueAmount <= 0) {
      setIssueError(isAr ? 'يرجى إدخال مبلغ صحيح أكبر من الصفر' : 'Please enter a valid amount greater than zero');
      return;
    }
    if (!hasPrinted) {
      setIssueError(isAr ? 'يلزم أولاً طباعة إقرار وتعهد الاستلام للتوقيع' : 'You must print the acknowledgment form for signature first');
      return;
    }
    if (!signedDocument) {
      setIssueError(isAr ? 'يلزم إعادة رفع الإقرار بعد توقيع المستفيد باليد لاعتماد الصرف' : 'You must upload the signed acknowledgment document before issuing');
      return;
    }

    if (!isIssueBank) {
      if (!isIssueBanknoteBalanced) {
        setIssueError(isAr ? 'تفقيط الفئات الورقية غير متطابق مع إجمالي المبلغ' : 'Banknote counts do not match total amount');
        return;
      }
      if (issueSafeBal < numIssueAmount) {
        setIssueError(
          isAr
            ? `رصيد الخزينة المصدرية (${issueSafeBal.toLocaleString()} ج.م) لا يكفي لصرف هذا المبلغ`
            : `Source safe balance (${issueSafeBal.toLocaleString()} EGP) is insufficient`
        );
        return;
      }
    }

    setIsSubmittingIssue(true);
    setIssueError('');

    try {
      const worker = workersList.find((w) => w.id === issueWorkerId);
      const workerName = isAr
        ? (worker?.nameAr || worker?.name || issueWorkerId)
        : (worker?.name || worker?.nameAr || issueWorkerId);

      // Use the previewed or draft deterministic SSOT ID
      const ssotId = issueModal.draftId || previewIssueSsotId;

      // Merge signedDocument into attachments array
      const finalAttachments = [...issueAttachments];
      if (signedDocument && !finalAttachments.some((a) => a.url === signedDocument.url || a.dataUrl === signedDocument.dataUrl)) {
        finalAttachments.unshift(signedDocument);
      }

      const cleanIssueDenoms = Object.fromEntries(
        Object.entries(issueDenoms).map(([k, v]) => [k, Number(v) || 0])
      );

      await postCashVoucher({
        safeId: issueSourceId,
        type: issueModal.type,
        amount: numIssueAmount,
        currency: 'EGP',
        denominations: isIssueBank ? {} : cleanIssueDenoms,
        mainAccount: '1020401',
        mainAccountAr: issueModal.type === 'custody_issue' ? 'عهد العاملين' : 'سلف العاملين',
        subAccountId: issueWorkerId,
        subAccountName: workerName,
        description: issueNotes || (issueModal.type === 'custody_issue' ? 'صرف عهدة تشغيل ومصروفات' : 'صرف سلفة شخصية للعامل'),
        attachments: finalAttachments,
        currentUser,
        customVoucherId: ssotId,
        ssotId
      });

      // If draft existed, clean it up from drafts collection
      if (issueModal.draftId) {
        await deleteCustodyAdvanceDraft(issueModal.draftId).catch(() => {});
      }

      setIssueModal({ isOpen: false, type: 'custody_issue', draftId: null, isDraftMode: false });
      setIssueAmount('');
      setIssueNotes('');
      setIssueAttachments([]);
      setSignedDocument(null);
      setHasPrinted(false);
      setActionAlert({
        type: 'success',
        text: isAr
          ? 'تم اعتماد وصرف السند بنجاح وتوثيق توقيع المستفيد وإرفاق الإقرار في السجلات ✓'
          : 'Voucher issued successfully with verified beneficiary signature ✓'
      });
    } catch (err) {
      setIssueError(err.message || (isAr ? 'فشلت عملية الصرف' : 'Disbursement failed'));
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  // 2. Submit Custody Settlement (Cash Return OR Multiple Expense Items)
  const handleSubmitCustodySettle = async (e) => {
    e.preventDefault();
    if (!custodySettleModal.workerId) {
      setCustodySettleError(isAr ? 'يرجى تحديد صاحب العهدة' : 'Please select custody beneficiary');
      return;
    }

    const worker = workersList.find((w) => w.id === custodySettleModal.workerId);
    const workerName = isAr
      ? (worker?.nameAr || worker?.name || selectedCustodyWorkerRecord?.workerName || custodySettleModal.workerId)
      : (worker?.name || worker?.nameAr || selectedCustodyWorkerRecord?.workerName || custodySettleModal.workerId);

    const targetCustodyId = custodySettleModal.targetCustodyId;
    const targetCustody = allActiveCustodies.find((c) => c.id === targetCustodyId);
    const seq = (targetCustody?.settlements?.length || 0) + 1;
    const settlementSsotId = targetCustodyId
      ? generateCustodySettlementId(targetCustodyId, seq)
      : `STL-CST-${Date.now().toString().slice(-6)}`;

    setIsSubmittingCustodySettle(true);
    setCustodySettleError('');

    try {
      if (custodySettleModal.method === 'cash_return') {
        // Mode A: Cash Return to Vault / Bank
        if (numCustodyCashAmount <= 0) {
          setCustodySettleError(isAr ? 'يرجى إدخال مبلغ صحيح أكبر من الصفر' : 'Please enter a valid amount');
          setIsSubmittingCustodySettle(false);
          return;
        }
        if (numCustodyCashAmount > custodyOutstandingBalance) {
          setCustodySettleError(
            isAr
              ? `المبلغ المدخل (${numCustodyCashAmount.toLocaleString()} ج.م) يتجاوز رصيد العهدة الحالي (${custodyOutstandingBalance.toLocaleString()} ج.م)`
              : `Amount exceeds current custody balance`
          );
          setIsSubmittingCustodySettle(false);
          return;
        }
        if (!isCustodyDestBank && !isCustodyBanknoteBalanced) {
          setCustodySettleError(isAr ? 'تفقيط الفئات الورقية غير متطابق مع المبلغ المردود' : 'Banknote counts do not match returned amount');
          setIsSubmittingCustodySettle(false);
          return;
        }

        const cleanCustodySettleDenoms = Object.fromEntries(
          Object.entries(custodySettleDenoms).map(([k, v]) => [k, Number(v) || 0])
        );

        await postCashVoucher({
          safeId: custodySettleDestId,
          type: 'custody_settle',
          amount: numCustodyCashAmount,
          currency: 'EGP',
          denominations: isCustodyDestBank ? {} : cleanCustodySettleDenoms,
          mainAccount: '1020401',
          mainAccountAr: 'عهد العاملين',
          subAccountId: custodySettleModal.workerId,
          subAccountName: workerName,
          description: custodySettleNotes || (isAr ? `رد نقدية متبقية من العهدة (${targetCustodyId || ''})` : `Custody cash return (${targetCustodyId || ''})`),
          attachments: custodySettleAttachments,
          currentUser,
          customVoucherId: settlementSsotId,
          ssotId: settlementSsotId,
          targetCustodyId
        });
      } else {
        // Mode B: Multiple Expense Items Liquidation
        if (totalCustodyItemizedExpenses <= 0) {
          setCustodySettleError(isAr ? 'يرجى إدخال مبالغ بنود المصروفات' : 'Please enter valid expense item amounts');
          setIsSubmittingCustodySettle(false);
          return;
        }
        if (totalCustodyItemizedExpenses > custodyOutstandingBalance) {
          setCustodySettleError(
            isAr
              ? `إجمالي بنود المصروفات (${totalCustodyItemizedExpenses.toLocaleString()} ج.م) يتجاوز رصيد العهدة المعلق (${custodyOutstandingBalance.toLocaleString()} ج.م)`
              : `Total expenses exceed current custody balance`
          );
          setIsSubmittingCustodySettle(false);
          return;
        }

        const validExpenseItems = custodyExpenseItems.filter((i) => (Number(i.amount) || 0) > 0);
        
        await updateCustodyLedgerAfterVoucher({
          workerId: custodySettleModal.workerId,
          workerName,
          voucherId: settlementSsotId,
          ssotId: settlementSsotId,
          targetCustodyId,
          type: 'settlement_expense',
          amount: totalCustodyItemizedExpenses,
          description: custodySettleNotes || (isAr ? `تسوية عهدة مستندية (${validExpenseItems.length} بنود مصروف)` : 'Custody expense bills liquidation'),
          items: validExpenseItems,
          attachments: custodySettleAttachments
        });
      }

      setCustodySettleModal({ isOpen: false, method: 'cash_return', workerId: '', targetCustodyId: '' });
      setCustodySettleCashAmount('');
      setCustodySettleNotes('');
      setCustodySettleAttachments([]);
    } catch (err) {
      setCustodySettleError(err.message || (isAr ? 'فشلت تسوية العهدة' : 'Custody settlement failed'));
    } finally {
      setIsSubmittingCustodySettle(false);
    }
  };

  // 3. Submit Advance Settlement (Cash OR Single Month Deduction OR Installments)
  const handleSubmitAdvanceSettle = async (e) => {
    e.preventDefault();
    if (!advanceSettleModal.workerId) {
      setAdvanceSettleError(isAr ? 'يرجى اختيار العامل لسداد السلفة' : 'Please select worker to repay advance');
      return;
    }

    const worker = workersList.find((w) => w.id === advanceSettleModal.workerId);
    const workerName = isAr
      ? (worker?.nameAr || worker?.name || selectedAdvanceWorkerRecord?.workerName || advanceSettleModal.workerId)
      : (worker?.name || worker?.nameAr || selectedAdvanceWorkerRecord?.workerName || advanceSettleModal.workerId);

    const targetAdvanceId = advanceSettleModal.targetAdvanceId;
    const targetAdvance = allActiveAdvances.find((a) => a.id === targetAdvanceId);

    setIsSubmittingAdvanceSettle(true);
    setAdvanceSettleError('');

    try {
      if (advanceSettleModal.settleType === 'cash') {
        // Mode 1: Cash / Bank Repayment
        if (numAdvanceCashAmount <= 0) {
          setAdvanceSettleError(isAr ? 'يرجى إدخال مبلغ صحيح أكبر من الصفر' : 'Please enter valid amount');
          setIsSubmittingAdvanceSettle(false);
          return;
        }
        if (numAdvanceCashAmount > advanceOutstandingBalance) {
          setAdvanceSettleError(
            isAr
              ? `المبلغ المدخل (${numAdvanceCashAmount.toLocaleString()} ج.م) يتجاوز رصيد السلفة (${advanceOutstandingBalance.toLocaleString()} ج.م)`
              : `Amount exceeds current advance balance`
          );
          setIsSubmittingAdvanceSettle(false);
          return;
        }
        if (!isAdvanceDestBank && !isAdvanceBanknoteBalanced) {
          setAdvanceSettleError(isAr ? 'تفقيط الفئات الورقية غير متطابق مع المبلغ المسدد' : 'Banknotes do not match');
          setIsSubmittingAdvanceSettle(false);
          return;
        }

        const seq = (targetAdvance?.settlements?.length || 0) + 1;
        const repaymentId = targetAdvanceId
          ? `REP-${targetAdvanceId}-${String(seq).padStart(2, '0')}`
          : `REP-ADV-${Date.now().toString().slice(-6)}`;

        const cleanAdvanceDenoms = Object.fromEntries(
          Object.entries(advanceDenoms).map(([k, v]) => [k, Number(v) || 0])
        );

        await postCashVoucher({
          safeId: advanceDestId,
          type: 'advance_settle',
          amount: numAdvanceCashAmount,
          currency: 'EGP',
          denominations: isAdvanceDestBank ? {} : cleanAdvanceDenoms,
          mainAccount: '1020401',
          mainAccountAr: 'سلف العاملين',
          subAccountId: advanceSettleModal.workerId,
          subAccountName: workerName,
          description: advanceSettleNotes || (isAr ? `سداد سلفة نقدية (${targetAdvanceId || ''})` : `Salary advance repayment (${targetAdvanceId || ''})`),
          attachments: advanceSettleAttachments,
          currentUser,
          customVoucherId: repaymentId,
          ssotId: repaymentId,
          targetAdvanceId
        });
      } else if (advanceSettleModal.settleType === 'payroll_deduction') {
        // Mode 2: Deduction from salary of specific month
        const numDeductAmt = Number(advancePayrollAmount) || 0;
        if (numDeductAmt <= 0) {
          setAdvanceSettleError(isAr ? 'يرجى إدخال مبلغ الخصم من الراتب' : 'Please enter deduction amount');
          setIsSubmittingAdvanceSettle(false);
          return;
        }
        if (numDeductAmt > advanceOutstandingBalance) {
          setAdvanceSettleError(isAr ? 'مبلغ الخصم أكبر من رصيد السلفة المستحق' : 'Deduction exceeds advance balance');
          setIsSubmittingAdvanceSettle(false);
          return;
        }

        const deductionId = generateAdvanceDeductionId(targetAdvanceId, advancePayrollMonth);

        await updateCustodyLedgerAfterVoucher({
          workerId: advanceSettleModal.workerId,
          workerName,
          voucherId: deductionId,
          ssotId: deductionId,
          targetAdvanceId,
          type: 'salary_deduction_month',
          amount: numDeductAmt,
          payrollMonth: advancePayrollMonth,
          description: advanceSettleNotes || (isAr ? `خصم سلفة معتمدة من راتب شهر ${advancePayrollMonth}` : `Payroll deduction for month ${advancePayrollMonth}`),
          attachments: advanceSettleAttachments
        });
      } else {
        // Mode 3: Multiple Months Installments Schedule
        if (totalAdvanceInstallmentsSum <= 0) {
          setAdvanceSettleError(isAr ? 'يرجى إدخال مبالغ الأقساط الشهرية' : 'Please enter installment amounts');
          setIsSubmittingAdvanceSettle(false);
          return;
        }
        if (totalAdvanceInstallmentsSum > advanceOutstandingBalance) {
          setAdvanceSettleError(
            isAr
              ? `إجمالي الأقساط (${totalAdvanceInstallmentsSum.toLocaleString()} ج.م) يتجاوز رصيد السلفة المستحق (${advanceOutstandingBalance.toLocaleString()} ج.م)`
              : `Installments sum exceeds advance balance`
          );
          setIsSubmittingAdvanceSettle(false);
          return;
        }

        const validInstallments = advanceInstallmentRows.filter((r) => (Number(r.amount) || 0) > 0);
        const planId = `PLAN-${targetAdvanceId || Date.now().toString().slice(-6)}`;

        await updateCustodyLedgerAfterVoucher({
          workerId: advanceSettleModal.workerId,
          workerName,
          voucherId: planId,
          ssotId: planId,
          targetAdvanceId,
          type: 'advance_installments_plan',
          amount: totalAdvanceInstallmentsSum,
          installments: validInstallments,
          description: advanceSettleNotes || (isAr ? `جدولة تقسيط سلفة على ${validInstallments.length} أشهر` : `Installment plan across ${validInstallments.length} months`),
          attachments: advanceSettleAttachments
        });
      }

      setAdvanceSettleModal({ isOpen: false, settleType: 'cash', workerId: '', targetAdvanceId: '' });
      setAdvanceCashAmount('');
      setAdvancePayrollAmount('');
      setAdvanceSettleNotes('');
      setAdvanceSettleAttachments([]);
    } catch (err) {
      setAdvanceSettleError(err.message || (isAr ? 'فشلت عملية تسوية السلفة' : 'Advance settlement failed'));
    } finally {
      setIsSubmittingAdvanceSettle(false);
    }
  };

  const handleFileUpload = async (e, targetSetter) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const data = await fileToDataUrl(f);
      if (data) targetSetter((prev) => [...prev, data]);
    }
    if (e.target) e.target.value = '';
  };

  return (
    <div className={`space-y-6 ${isAr ? 'text-right' : 'text-left'}`}>
      {/* ========================================================================= */}
      {/* 1. TOP SUMMARY KPI CARDS                                                  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 block mb-1">
              {isAr ? 'إجمالي العهد المعلقة (طرف العاملين)' : 'Total Outstanding Custodies'}
            </span>
            <div className="text-2xl font-black font-mono text-amber-700">
              {totalCustodies.toLocaleString()} <span className="text-sm font-bold text-slate-500">{isAr ? 'ج.م' : 'EGP'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isAr ? 'مصروفات وتشغيل لم تسوى بعد' : 'Pending operational expenses'}
            </span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
            <Wallet className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 block mb-1">
              {isAr ? 'إجمالي السلف المعلقة (خصم من الراتب)' : 'Total Outstanding Advances'}
            </span>
            <div className="text-2xl font-black font-mono text-purple-700">
              {totalAdvances.toLocaleString()} <span className="text-sm font-bold text-slate-500">{isAr ? 'ج.م' : 'EGP'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isAr ? 'سلف مستحقة السداد أو الخصم' : 'Pending payroll deduction or repayment'}
            </span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shrink-0">
            <Users className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 block mb-1">
              {isAr ? 'عدد أصحاب العهد والسلف' : 'Active Beneficiaries'}
            </span>
            <div className="text-2xl font-black font-mono text-slate-800">
              {custodyRecords.filter((r) => r.currentCustodyBalance > 0 || r.currentAdvanceBalance > 0).length}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isAr ? 'من إجمالي العمالة والموظفين' : 'Staff with open balances'}
            </span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
            <FileCheck className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SEARCH & DEDICATED 2-TIER ACTION BUTTON STACKS                         */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isAr ? 'بحث بالاسم أو كود الموظف...' : 'Search by worker name or employee ID...'}
          className="w-full lg:w-72 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none"
        />

        {/* Action Button Stacks: Custodies (Amber) & Advances (Purple) */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Custody Stack: Issue (Top) + Settle (Beneath, subtle tone) */}
          <div className="flex flex-col gap-1.5 min-w-[170px]">
            <button
              type="button"
              onClick={() => handleOpenIssue('custody_issue')}
              className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-sm active:scale-[0.98]"
              title={isAr ? 'صرف عهدة نقدية جديدة' : 'Issue new operational custody'}
            >
              <PlusCircle className="h-4 w-4" />
              <span>{isAr ? 'صرف عهدة جديدة +' : '+ Issue Custody'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenSettleCustody()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100/90 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs active:scale-[0.98]"
              title={isAr ? 'تسوية عهدة نقدية (رد نقدية أو تسوية بمصروفات وفواتير)' : 'Settle custody (cash return or expense bills)'}
            >
              <FileCheck className="h-3.5 w-3.5 text-amber-700" />
              <span>{isAr ? 'تسوية عهدة نقدية' : 'Settle Custody'}</span>
            </button>
          </div>

          {/* Advance Stack: Issue (Top) + Settle (Beneath, subtle tone) */}
          <div className="flex flex-col gap-1.5 min-w-[170px]">
            <button
              type="button"
              onClick={() => handleOpenIssue('salary_advance')}
              className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-sm active:scale-[0.98]"
              title={isAr ? 'صرف سلفة شخصية للعاملين' : 'Issue staff salary advance'}
            >
              <PlusCircle className="h-4 w-4" />
              <span>{isAr ? 'صرف سلفة شخصية +' : '+ Issue Advance'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenSettleAdvance()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100/90 text-purple-900 border border-purple-300 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs active:scale-[0.98]"
              title={isAr ? 'سداد أو جدولة تسوية سلفة (نقدي / خصم راتب / أقساط)' : 'Settle salary advance (cash / single deduction / installments)'}
            >
              <RotateCcw className="h-3.5 w-3.5 text-purple-700" />
              <span>{isAr ? 'سداد / تسوية سلفة' : 'Settle Advance'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SUB-TABS NAVIGATION & WORKFLOW REGISTRIES                              */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        {/* Action Alert Banner */}
        {actionAlert && (
          <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all shadow-xs ${
            actionAlert.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-2">
              {actionAlert.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{actionAlert.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionAlert(null)}
              className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Navigation Pills */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveHubTab('all_records')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'all_records'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileSpreadsheet className={`h-4 w-4 ${activeHubTab === 'all_records' ? 'text-amber-400' : 'text-slate-500'}`} />
            <span>{isAr ? 'السجل العام للعهد والسلف' : 'General Custodies & Advances Register'}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeHubTab === 'all_records' ? 'bg-slate-800 text-amber-300 font-bold' : 'bg-slate-100 text-slate-700'
            }`}>
              {filteredAllRecords.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveHubTab('roster')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'roster'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>{isAr ? 'أرصدة العاملين (الملخص)' : 'Staff Balances Roster'}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeHubTab === 'roster' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {filteredRecords.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveHubTab('custodies_registry')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'custodies_registry'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-amber-900 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            <Wallet className="h-4 w-4 text-amber-300" />
            <span>{isAr ? 'سجل العهد المفتوحة (SSOT)' : 'Open Custodies Registry (SSOT)'}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeHubTab === 'custodies_registry' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'
            }`}>
              {filteredCustodies.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveHubTab('installments_schedule')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'installments_schedule'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white text-purple-900 hover:bg-purple-50 border border-purple-200'
            }`}
          >
            <CalendarDays className="h-4 w-4 text-purple-300" />
            <span>{isAr ? 'جدول الأقساط والخصومات' : 'Scheduled Deductions & Installments'}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeHubTab === 'installments_schedule' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800'
            }`}>
              {filteredDeductions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveHubTab('drafts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'drafts'
                ? 'bg-amber-700 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-amber-50/60 border border-amber-200'
            }`}
          >
            <Clock className={`h-4 w-4 ${activeHubTab === 'drafts' ? 'text-amber-200' : 'text-amber-600'}`} />
            <span>{isAr ? 'مسودات بانتظار التوقيع' : 'Drafts Pending Signature'}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
              draftsList.length > 0
                ? activeHubTab === 'drafts'
                  ? 'bg-amber-900 text-amber-200'
                  : 'bg-amber-100 text-amber-900'
                : activeHubTab === 'drafts'
                ? 'bg-amber-800 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {draftsList.length}
            </span>
          </button>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* VIEW 0: GENERAL REGISTER (DEFAULT TAB: ALL RECORDS PAST & PRESENT)      */}
        {/* ----------------------------------------------------------------------- */}
        {activeHubTab === 'all_records' && (
          <div className="space-y-4">
            {/* Filter Bar & Quick Stats */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {/* Type Filters */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setMasterRegisterTypeFilter('all')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      masterRegisterTypeFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isAr ? 'كافة السجلات' : 'All Types'} ({allHistoricalAndActiveRecords.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMasterRegisterTypeFilter('custody')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      masterRegisterTypeFilter === 'custody'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-amber-800'
                    }`}
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span>{isAr ? 'عهد تشغيل' : 'Custodies'}</span>
                    <span className="text-[10px] opacity-80">
                      ({allHistoricalAndActiveRecords.filter((r) => r.type === 'custody_issue').length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMasterRegisterTypeFilter('advance')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      masterRegisterTypeFilter === 'advance'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-purple-800'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>{isAr ? 'سلف شخصية' : 'Advances'}</span>
                    <span className="text-[10px] opacity-80">
                      ({allHistoricalAndActiveRecords.filter((r) => r.type === 'salary_advance').length})
                    </span>
                  </button>
                </div>

                {/* Status Filter */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                  {[
                    { id: 'all', labelAr: 'كافة الحالات', labelEn: 'All Statuses' },
                    { id: 'active', labelAr: 'معلقة / نشطة', labelEn: 'Active Open' },
                    { id: 'partially_settled', labelAr: 'مسددة جزئياً', labelEn: 'Partially Settled' },
                    { id: 'settled', labelAr: 'مسواة بالكامل', labelEn: 'Fully Settled' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setMasterRegisterStatusFilter(st.id)}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer text-[11px] ${
                        masterRegisterStatusFilter === st.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isAr ? st.labelAr : st.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Pending Overview Badge */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-bold">
                  {isAr ? 'إجمالي الرصيد المعلق في العرض:' : 'Total Outstanding in View:'}
                </span>
                <span className="font-mono font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  {filteredAllRecords
                    .reduce((sum, r) => sum + (Number(r.remainingAmount) || 0), 0)
                    .toLocaleString()}{' '}
                  {isAr ? 'ج.م' : 'EGP'}
                </span>
              </div>
            </div>

            {/* Master Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className={`w-full text-xs ${isAr ? 'text-right' : 'text-left'}`}>
                  <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="py-3 px-4 min-w-[150px]">{isAr ? 'التاريخ وكود السند' : 'Date & Record ID'}</th>
                      <th className="py-3 px-3 text-center">{isAr ? 'النوع' : 'Type'}</th>
                      <th className="py-3 px-4 min-w-[160px]">{isAr ? 'الموظف المستفيد' : 'Beneficiary Staff'}</th>
                      <th className="py-3 px-3 text-end">{isAr ? 'المبلغ الأصلي' : 'Original'}</th>
                      <th className="py-3 px-3 text-end">{isAr ? 'المسدد' : 'Settled'}</th>
                      <th className="py-3 px-3 text-end">{isAr ? 'المتبقي المعلق' : 'Remaining'}</th>
                      <th className="py-3 px-3 text-center">{isAr ? 'الخزينة' : 'Safe/Vault'}</th>
                      <th className="py-3 px-3 text-center">{isAr ? 'المرفقات' : 'Attachments'}</th>
                      <th className="py-3 px-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="py-3 px-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAllRecords.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="py-14 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <FileSpreadsheet className="h-8 w-8 text-slate-300" />
                            <span className="font-bold">
                              {isAr ? 'لا توجد سجلات عهد أو سلف مطابقة لمعايير البحث' : 'No matching custody or advance records found'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredAllRecords.map((r, idx) => {
                        const original = Number(r.originalAmount || 0);
                        const settled = Number(r.settledAmount || 0);
                        const remaining = Number(r.remainingAmount || 0);
                        const isSettled = remaining <= 0.005 || r.status === 'settled';
                        const isPartiallySettled = !isSettled && (settled > 0.005 || r.status === 'partially_settled');
                        const isCustody = r.type === 'custody_issue';
                        const attachmentsCount = (r.attachments?.length || 0) + (r.signedDocument ? 1 : 0);
                        const safeName = allSafes.find((s) => s.id === r.sourceSafeId)?.nameAr || r.sourceSafeId || 'SAFE-01';

                        return (
                          <tr
                            key={r.id}
                            id={r.id}
                            data-row-id={r.id}
                            className="hover:bg-slate-50/80 transition group"
                          >
                            {/* Date (Prominent) & Record ID (Subtle below) */}
                            <td className="py-3 px-4">
                              <div className="font-extrabold text-slate-900 text-xs">
                                {r.issuedAt ? new Date(r.issuedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span className="font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] tracking-wide">
                                  {r.id}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyId(e, r.id)}
                                  className="text-slate-400 hover:text-slate-700 p-0.5 transition cursor-pointer"
                                  title={isAr ? 'نسخ كود السند' : 'Copy ID'}
                                >
                                  {copiedId === r.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                </button>
                              </div>
                            </td>

                            {/* Type Badge */}
                            <td className="py-3 px-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold ${
                                isCustody
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : 'bg-purple-100 text-purple-900 border border-purple-200'
                              }`}>
                                {isCustody ? (
                                  <>
                                    <Wallet className="h-3 w-3 text-amber-700 shrink-0" />
                                    <span>{isAr ? 'عهدة نقدية' : 'Custody'}</span>
                                  </>
                                ) : (
                                  <>
                                    <Users className="h-3 w-3 text-purple-700 shrink-0" />
                                    <span>{isAr ? 'سلفة شخصية' : 'Advance'}</span>
                                  </>
                                )}
                              </span>
                            </td>

                            {/* Beneficiary: Worker Name & Role - STRICTLY NO ID */}
                            <td className="py-3 px-4">
                              <div className="font-extrabold text-slate-900 text-xs">
                                {r.workerName}
                              </div>
                              {r.workerRole && (
                                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                  {r.workerRole}
                                </div>
                              )}
                            </td>

                            {/* Original Amount */}
                            <td className="py-3 px-3 text-end font-mono font-bold text-slate-800 text-xs">
                              {original.toLocaleString()} <span className="text-[10px] text-slate-500 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
                            </td>

                            {/* Settled Amount */}
                            <td className="py-3 px-3 text-end font-mono font-bold text-emerald-700 text-xs">
                              {settled.toLocaleString()} <span className="text-[10px] text-slate-500 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
                            </td>

                            {/* Remaining Amount */}
                            <td className="py-3 px-3 text-end font-mono font-black text-xs">
                              {isSettled ? (
                                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[10.5px] font-bold">
                                  0.00 {isAr ? 'ج.م (مسوى)' : 'EGP (Settled)'}
                                </span>
                              ) : (
                                <span className={isCustody ? 'text-amber-800 text-sm' : 'text-purple-800 text-sm'}>
                                  {remaining.toLocaleString()} <span className="text-[10px] text-slate-500 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
                                </span>
                              )}
                            </td>

                            {/* Safe / Source */}
                            <td className="py-3 px-3 text-center">
                              <span className="font-mono text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded-md border border-slate-200 font-medium inline-block max-w-[120px] truncate" title={safeName}>
                                {safeName}
                              </span>
                            </td>

                            {/* Attachments */}
                            <td className="py-3 px-3 text-center">
                              {attachmentsCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const att = r.signedDocument || (r.attachments && r.attachments[0]);
                                    if (att) setSelectedAttachmentForView(att);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition cursor-pointer text-[11px] font-bold"
                                  title={isAr ? 'معاينة المستندات المرفقة' : 'View Attachments'}
                                >
                                  <Paperclip className="h-3 w-3" />
                                  <span>{attachmentsCount}</span>
                                </button>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isSettled
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : isPartiallySettled
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}>
                                {isSettled
                                  ? (isAr ? 'مسواة بالكامل' : 'Fully Settled')
                                  : isPartiallySettled
                                  ? (isAr ? 'مسددة جزئياً' : 'Partially Settled')
                                  : (isAr ? 'نشطة معلقة' : 'Active Open')}
                              </span>
                            </td>

                            {/* Actions Grouped under 3 Vertical Dots */}
                            <td className="py-3 px-3 text-center relative">
                              <div className="flex items-center justify-center gap-1">
                                {/* Quick Row Comment Button */}
                                <RowCommentButton
                                  docId={r.id}
                                  docNumber={r.id}
                                  tab="custodies_advances"
                                  module="finance"
                                />

                                <div className="relative inline-block text-start">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuRecordId(activeMenuRecordId === r.id ? null : r.id);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                                    title={isAr ? 'إجراءات السجل' : 'Record actions'}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>

                                  {activeMenuRecordId === r.id && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setActiveMenuRecordId(null)}
                                      />
                                      <div
                                        className={`absolute z-50 ${isAr ? 'left-0' : 'right-0'} ${
                                          idx > filteredAllRecords.length - 4 && filteredAllRecords.length > 3
                                            ? 'bottom-full mb-1'
                                            : 'top-full mt-1'
                                        } w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-xs divide-y divide-slate-100 animate-in fade-in-50 zoom-in-95`}
                                      >
                                        <div className="py-1">
                                          {/* 1. Print A4 acknowledgment slip */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveMenuRecordId(null);
                                            handlePrintRecord(r);
                                          }}
                                          className="w-full text-start px-3 py-2 text-slate-700 hover:bg-slate-100 flex items-center gap-2 font-bold cursor-pointer"
                                        >
                                          <Printer className="h-3.5 w-3.5 text-slate-500" />
                                          <span>{isAr ? 'طباعة إقرار الاستلام والتعهد (A4)' : 'Print A4 Form'}</span>
                                        </button>

                                        {/* 2. Settle custody */}
                                        {isCustody && !isSettled && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveMenuRecordId(null);
                                              handleOpenSettleCustody(r.workerId, 'expense_bill', r.id);
                                            }}
                                            className="w-full text-start px-3 py-2 text-amber-700 hover:bg-amber-50 flex items-center gap-2 font-bold cursor-pointer"
                                          >
                                            <Wallet className="h-3.5 w-3.5 text-amber-600" />
                                            <span>{isAr ? 'تصفية وتسوية العهدة' : 'Settle Custody'}</span>
                                          </button>
                                        )}

                                        {/* 3. Repay advance */}
                                        {!isCustody && !isSettled && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveMenuRecordId(null);
                                              handleOpenSettleAdvance(r.workerId, 'cash', r.id);
                                            }}
                                            className="w-full text-start px-3 py-2 text-purple-700 hover:bg-purple-50 flex items-center gap-2 font-bold cursor-pointer"
                                          >
                                            <Users className="h-3.5 w-3.5 text-purple-600" />
                                            <span>{isAr ? 'سداد نقدي / جدولة أقساط' : 'Repay / Schedule Advance'}</span>
                                          </button>
                                        )}

                                        {/* 4. Edit record details & attachments */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveMenuRecordId(null);
                                            setEditModal({ isOpen: true, item: r });
                                          }}
                                          className="w-full text-start px-3 py-2 text-slate-700 hover:bg-slate-100 flex items-center gap-2 font-bold cursor-pointer"
                                        >
                                          <Edit className="h-3.5 w-3.5 text-slate-500" />
                                          <span>{isAr ? 'تعديل البيانات والمرفقات' : 'Edit Details & Files'}</span>
                                        </button>
                                      </div>

                                      <div className="py-1">
                                        {/* 5. View employee statement */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveMenuRecordId(null);
                                            const workerRec = custodyRecords.find((w) => w.workerId === r.workerId);
                                            if (workerRec) setSelectedRecord(workerRec);
                                          }}
                                          className="w-full text-start px-3 py-2 text-slate-700 hover:bg-slate-100 flex items-center gap-2 font-bold cursor-pointer"
                                        >
                                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                                          <span>{isAr ? 'عرض كشف حساب الموظف' : 'Staff Statement'}</span>
                                        </button>

                                        {/* 6. Copy SSOT ID */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            setActiveMenuRecordId(null);
                                            handleCopyId(e, r.id);
                                          }}
                                          className="w-full text-start px-3 py-2 text-slate-600 hover:bg-slate-100 flex items-center gap-2 cursor-pointer font-mono"
                                        >
                                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                                          <span>{isAr ? 'نسخ كود السند الموحد' : 'Copy SSOT ID'}</span>
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
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

        {/* ----------------------------------------------------------------------- */}
        {/* VIEW 1: STAFF BALANCES ROSTER                                           */}
        {/* ----------------------------------------------------------------------- */}
        {activeHubTab === 'roster' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className={`w-full text-xs ${isAr ? 'text-right' : 'text-left'}`}>
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-3 px-4">{isAr ? 'اسم الموظف / صاحب العهدة' : 'Employee / Beneficiary Name'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الدور / الوظيفة' : 'Job Role'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'رصيد العهدة الحالي' : 'Custody Balance'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'رصيد السلف الحالي' : 'Advance Balance'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'آخر حركة' : 'Last Activity'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد عهد أو سلف مسجلة حالياً' : 'No custodies or advances currently recorded'}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => {
                    const hasCustody = (Number(r.currentCustodyBalance) || 0) > 0;
                    const hasAdvance = (Number(r.currentAdvanceBalance) || 0) > 0;
                    return (
                      <tr key={r.workerId} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-extrabold text-slate-900">
                          {r.workerName || r.workerId}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-600 font-medium text-xs">
                          {workersList.find((w) => w.id === r.workerId)?.role || (isAr ? 'عامل تشغيل' : 'Staff')}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-black text-amber-700">
                          {hasCustody ? `${Number(r.currentCustodyBalance).toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-black text-purple-700">
                          {hasAdvance ? `${Number(r.currentAdvanceBalance).toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-center text-[11px] text-slate-400">
                          {r.history?.[0]?.date ? new Date(r.history[0].date).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* 1. Settle with expense invoices */}
                            {hasCustody && (
                              <button
                                type="button"
                                onClick={() => handleOpenSettleCustody(r.workerId, 'expense_bill')}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-bold border border-amber-200 transition cursor-pointer"
                                title={isAr ? 'تسوية العهدة بمصروفات ومستندات' : 'Liquidate custody with expense bills'}
                              >
                                {isAr ? 'تسوية بمصروفات' : 'Settle Bills'}
                              </button>
                            )}

                            {/* 2. Return Cash to Safe or Bank */}
                            {hasCustody && (
                              <button
                                type="button"
                                onClick={() => handleOpenSettleCustody(r.workerId, 'cash_return')}
                                className="px-2.5 py-1 bg-amber-100/70 hover:bg-amber-200/80 text-amber-950 rounded-lg text-[11px] font-bold border border-amber-300 transition cursor-pointer"
                                title={isAr ? 'رد نقدية العهدة للخزينة أو البنك' : 'Return custody cash to vault/bank'}
                              >
                                {isAr ? 'رد نقدية' : 'Return Cash'}
                              </button>
                            )}

                            {/* 3. Repay advance */}
                            {hasAdvance && (
                              <button
                                type="button"
                                onClick={() => handleOpenSettleAdvance(r.workerId, 'cash')}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200 transition cursor-pointer"
                                title={isAr ? 'سداد أو تسوية سلفة نقدية أو خصم راتب' : 'Settle / Repay advance'}
                              >
                                {isAr ? 'سداد سلفة' : 'Repay Advance'}
                              </button>
                            )}

                            {/* 4. View Statement */}
                            <button
                              type="button"
                              onClick={() => setSelectedRecord(r)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                              title={isAr ? 'عرض كشف حساب العهدة' : 'View Account Statement'}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* VIEW 2: OPEN CUSTODIES REGISTRY (SSOT TRACKING)                         */}
        {/* ----------------------------------------------------------------------- */}
        {activeHubTab === 'custodies_registry' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className={`w-full text-xs ${isAr ? 'text-right' : 'text-left'}`}>
              <thead className="bg-amber-50/70 text-amber-950 border-b border-amber-200 font-bold">
                <tr>
                  <th className="py-3 px-4">{isAr ? 'كود العهدة الموحد (SSOT ID)' : 'Custody SSOT ID'}</th>
                  <th className="py-3 px-4">{isAr ? 'صاحب العهدة (الموظف)' : 'Beneficiary Worker'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'مصدر الصرف' : 'Source Safe/Bank'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'قيمة العهدة الأصلية' : 'Original Amount'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'المسدد' : 'Settled'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'المتبقي المعلق' : 'Remaining'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'إجراءات التسوية' : 'Settlement Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustodies.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد عهد مفتوحة مطابقة للبحث' : 'No matching open custodies found'}
                    </td>
                  </tr>
                ) : (
                  filteredCustodies.map((c) => {
                    const original = Number(c.originalAmount) || 0;
                    const settled = Number(c.settledAmount) || 0;
                    const remaining = Number(c.remainingAmount) || 0;
                    const isSettled = remaining <= 0.01;

                    return (
                      <tr key={c.id} id={c.id} data-row-id={c.id} data-id={c.id} className="hover:bg-amber-50/40 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                              {c.id}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyId(c.id)}
                              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer transition"
                              title={isAr ? 'نسخ كود العهدة' : 'Copy SSOT ID'}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[10px] text-slate-400 block">
                              {c.issuedAt ? new Date(c.issuedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900">{c.workerName || c.workerId}</div>
                          {workersList.find((w) => w.id === c.workerId)?.role && (
                            <div className="text-[10px] text-slate-500 font-medium">{workersList.find((w) => w.id === c.workerId)?.role}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600">
                          {c.sourceSafeId || 'SAFE-01'}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-bold text-slate-700">
                          {original.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-bold text-emerald-700">
                          {settled.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-black text-amber-700 text-sm">
                          {remaining.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSettled
                              ? 'bg-emerald-100 text-emerald-800'
                              : settled > 0
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isSettled
                              ? (isAr ? 'مسواة بالكامل' : 'Settled')
                              : settled > 0
                              ? (isAr ? 'مسواة جزئياً' : 'Partially Settled')
                              : (isAr ? 'نشطة معلقة' : 'Active Open')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isSettled && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettleCustody(c.workerId, 'expense_bill', c.id)}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-bold border border-amber-200 transition cursor-pointer"
                                  title={isAr ? 'تسوية العهدة بمصروفات ومستندات' : 'Liquidate custody with expense bills'}
                                >
                                  {isAr ? 'تسوية فواتير' : 'Settle Bills'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettleCustody(c.workerId, 'cash_return', c.id)}
                                  className="px-2.5 py-1 bg-amber-100/70 hover:bg-amber-200/80 text-amber-950 rounded-lg text-[11px] font-bold border border-amber-300 transition cursor-pointer"
                                  title={isAr ? 'رد نقدية للخزينة' : 'Return cash to safe'}
                                >
                                  {isAr ? 'رد نقدية' : 'Return Cash'}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditModal({ isOpen: true, item: c })}
                              className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition cursor-pointer"
                              title={isAr ? 'تعديل بيانات العهدة والمستندات' : 'Edit custody details & attachments'}
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const rec = custodyRecords.find((r) => r.workerId === c.workerId);
                                if (rec) setSelectedRecord(rec);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                              title={isAr ? 'عرض كشف الحركات' : 'View History'}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* VIEW 3: SCHEDULED DEDUCTIONS & INSTALLMENTS REGISTRY                     */}
        {/* ----------------------------------------------------------------------- */}
        {activeHubTab === 'installments_schedule' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className={`w-full text-xs ${isAr ? 'text-right' : 'text-left'}`}>
              <thead className="bg-purple-50/70 text-purple-950 border-b border-purple-200 font-bold">
                <tr>
                  <th className="py-3 px-4">{isAr ? 'كود القسط الموحد (SSOT ID)' : 'Installment SSOT ID'}</th>
                  <th className="py-3 px-4">{isAr ? 'كود السلفة الأصلية' : 'Parent Advance ID'}</th>
                  <th className="py-3 px-4">{isAr ? 'الموظف المستفيد' : 'Staff Member'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'شهر الاستحقاق / الخصم' : 'Payroll Month'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'مبلغ القسط / الخصم' : 'Deduction Amount'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'نوع الجدولة' : 'Type'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDeductions.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد أقساط أو خصومات مجدولة حالياً' : 'No scheduled deductions or installments recorded'}
                    </td>
                  </tr>
                ) : (
                  filteredDeductions.map((d) => (
                    <tr key={d.id} id={d.id} data-row-id={d.id} data-id={d.id} className="hover:bg-purple-50/40 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-purple-950 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 text-xs">
                            {d.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyId(d.id)}
                            className="text-purple-400 hover:text-purple-900 p-1 cursor-pointer transition"
                            title={isAr ? 'نسخ كود القسط' : 'Copy SSOT ID'}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-xs">
                        {d.parentAdvanceId}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-slate-900">{d.workerName || d.workerId}</div>
                        {workersList.find((w) => w.id === d.workerId)?.role && (
                          <div className="text-[10px] text-slate-500 font-medium">{workersList.find((w) => w.id === d.workerId)?.role}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {d.month}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-black text-purple-800 text-sm">
                        {Number(d.amount).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                      </td>
                      <td className="py-3 px-4 text-center text-[11px] text-slate-500 font-bold">
                        {d.parentAdvanceId?.includes('DED') || !d.installmentNumber
                          ? (isAr ? 'خصم راتب مباشر' : 'Payroll Deduction')
                          : (isAr ? `قسط شهري #${d.installmentNumber}` : `Installment #${d.installmentNumber}`)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          {isAr ? 'بانتظار مسير الرواتب' : 'Pending Payroll'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenSettleAdvance(d.workerId, 'cash', d.parentAdvanceId)}
                            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200 transition cursor-pointer"
                            title={isAr ? 'سداد نقدي مبكر' : 'Early Cash Repayment'}
                          >
                            {isAr ? 'سداد مبكر' : 'Repay Early'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const parentAdv = allActiveAdvances.find((a) => a.id === d.parentAdvanceId) || {
                                id: d.parentAdvanceId,
                                type: 'salary_advance',
                                workerId: d.workerId,
                                workerName: d.workerName,
                                originalAmount: d.amount,
                                remainingAmount: d.amount
                              };
                              setEditModal({ isOpen: true, item: parentAdv });
                            }}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition cursor-pointer"
                            title={isAr ? 'تعديل بيانات السلفة' : 'Edit Advance'}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* VIEW 4: DRAFTS PENDING SIGNATURE & ISSUANCE                             */}
        {/* ----------------------------------------------------------------------- */}
        {activeHubTab === 'drafts' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-amber-50/70 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-amber-950">
                    {isAr ? 'مسودات السندات بانتظار توقيع المستفيد وإتمام الصرف' : 'Drafts Pending Beneficiary Signature & Issuance'}
                  </h4>
                  <p className="text-[11px] text-amber-800">
                    {isAr
                      ? 'العمليات المحفوظة كمسودة لا تؤثر على رصيد الخزينة حتى يتم طباعة الإقرار وتوقيعه حياً من المستفيد ورفعه ثم اعتماد الصرف.'
                      : 'Drafts do not impact vault balance until printed, signed, uploaded, and approved.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenIssue('custody_issue')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>{isAr ? 'مسودة عهدة +' : '+ Custody Draft'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenIssue('salary_advance')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>{isAr ? 'مسودة سلفة +' : '+ Advance Draft'}</span>
                </button>
              </div>
            </div>

            <table className={`w-full text-xs ${isAr ? 'text-right' : 'text-left'}`}>
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-3 px-4">{isAr ? 'كود المسودة (SSOT ID)' : 'Draft SSOT ID'}</th>
                  <th className="py-3 px-4">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="py-3 px-4">{isAr ? 'الموظف المستفيد' : 'Staff Member'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الخزينة / المصدر' : 'Source'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'المبلغ' : 'Amount'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'حالة التوقيع والمستندات' : 'Signature & Doc Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDrafts.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد مسودات معلقة حالياً' : 'No pending drafts recorded'}
                    </td>
                  </tr>
                ) : (
                  filteredDrafts.map((d) => {
                    const isCustody = d.type === 'custody_issue';
                    const hasDoc = Boolean(d.signedDocument);
                    const isPrinted = Boolean(d.hasPrinted);
                    const isReadyToIssue = isPrinted && hasDoc;

                    return (
                      <tr key={d.id} id={d.id} data-row-id={d.id} data-id={d.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
                              {d.id}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyId(e, d.id)}
                              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer transition"
                              title={isAr ? 'نسخ الكود' : 'Copy ID'}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-0.5 block">
                            {d.createdAt ? new Date(d.createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-US') : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isCustody ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-purple-100 text-purple-800 border border-purple-200'
                          }`}>
                            {isCustody ? (isAr ? 'عهدة تشغيل' : 'Custody') : (isAr ? 'سلفة على الراتب' : 'Salary Advance')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900">{d.workerName || d.workerId}</div>
                          {workersList.find((w) => w.id === d.workerId)?.role && (
                            <div className="text-[10px] text-slate-500 font-medium">{workersList.find((w) => w.id === d.workerId)?.role}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600">
                          {d.sourceSafeId || 'SAFE-01'}
                        </td>
                        <td className="py-3 px-4 text-end font-mono font-black text-slate-900 text-sm">
                          {Number(d.amount || 0).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex flex-col gap-1 items-center">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                isPrinted ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {isPrinted ? (isAr ? 'طُبع الإقرار ✓' : 'Printed ✓') : (isAr ? 'لم يطبع ✗' : 'Not Printed ✗')}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                hasDoc ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {hasDoc ? (isAr ? 'رُفع التوقيع ✓' : 'Signed Doc ✓') : (isAr ? 'بانتظار التوقيع ✗' : 'Missing Doc ✗')}
                              </span>
                            </div>
                            {isReadyToIssue && (
                              <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                                <ShieldCheck className="h-3 w-3" />
                                {isAr ? 'جاهزة للاعتماد الفوري' : 'Ready for final issuance'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Resume / Finalize button */}
                            <button
                              type="button"
                              onClick={() => handleResumeDraft(d)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shadow-xs flex items-center gap-1"
                              title={isAr ? 'استكمال الإجراء واعتماد الصرف' : 'Resume & Finalize Disbursement'}
                            >
                              <Edit className="h-3 w-3" />
                              <span>{isAr ? 'استكمال / صرف' : 'Resume'}</span>
                            </button>

                            {/* Direct Print acknowledgment */}
                            <button
                              type="button"
                              onClick={() => handleDirectPrintDraft(d)}
                              className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-slate-200 transition cursor-pointer"
                              title={isAr ? 'طباعة إقرار الاستلام والتعهد' : 'Print acknowledgment form'}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>

                            {/* Delete draft */}
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(d.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition cursor-pointer"
                              title={isAr ? 'حذف المسودة' : 'Delete Draft'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. ISSUE MODAL (CUSTODY OR ADVANCE)                                       */}
      {/* ========================================================================= */}
      {issueModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
            <div className={`px-6 py-4 text-white flex items-center justify-between shrink-0 ${
              issueModal.type === 'custody_issue' ? 'bg-gradient-to-r from-amber-600 to-amber-700' : 'bg-gradient-to-r from-purple-600 to-purple-700'
            }`}>
              <div className="flex items-center gap-2.5">
                <Wallet className="h-5 w-5 text-white/90" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    {issueModal.type === 'custody_issue'
                      ? (isAr ? 'صرف عهدة نقدية مؤقتة للعاملين' : 'Issue Operational Custody')
                      : (isAr ? 'صرف سلفة شخصية للعاملين' : 'Issue Staff Salary Advance')}
                  </h3>
                  <p className="text-xs text-white/80">
                    {isAr ? 'تحديد الحساب المصدر (خزينة نقدية أو حساب بنكي)' : 'Select source account (Physical safe or corporate bank)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIssueModal({ isOpen: false, type: 'custody_issue' })}
                className="text-white/80 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitIssue} className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {issueError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{issueError}</span>
                </div>
              )}

              {/* SSOT Unique Identifier Preview Badge */}
              <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
                      {isAr ? 'المعرف الرقمي الموحد للسند (SSOT ID)' : 'Single Source of Truth (SSOT ID)'}
                    </span>
                    <span className="text-xs font-mono font-black text-amber-300">
                      {previewIssueSsotId}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyId(previewIssueSsotId)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 text-[11px] font-mono shrink-0"
                  title={isAr ? 'نسخ المعرف الموحد' : 'Copy SSOT ID'}
                >
                  <Copy className="h-3 w-3" />
                  <span>{isAr ? 'نسخ' : 'Copy'}</span>
                </button>
              </div>

              {/* Beneficiary Worker */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الموظف / صاحب العهدة *:' : 'Beneficiary Worker / Staff Member *:'}
                </label>
                <SearchableSelect
                  options={issueWorkerOptions}
                  value={issueWorkerId}
                  onChange={(val) => {
                    setIssueWorkerId(val);
                    setIssueError('');
                  }}
                  placeholder={isAr ? '-- ابحث واختر العامل / الموظف المستفيد --' : '-- Search & Select Staff Member --'}
                  isAr={isAr}
                  className="w-full font-bold"
                />
              </div>

              {/* Source Account Selector (Safes + Banks) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الحساب المصدر للصرف (خزينة نقدية أو بنك) *:' : 'Source Account (Physical Safe or Bank) *:'}
                </label>
                <select
                  value={issueSourceId}
                  onChange={(e) => {
                    setIssueSourceId(e.target.value);
                    setIssueError('');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  <optgroup label={isAr ? 'الخزائن النقدية الفعلية (صرف فئات ورقية)' : 'Physical Cash Vaults'}>
                    {allSafes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {isAr ? s.nameAr : (s.nameEn || s.nameAr)} ({s.id}) — {isAr ? 'رصيد:' : 'Bal:'} {(s.balances?.EGP?.currentBalance || 0).toLocaleString()} ج.م
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={isAr ? 'الحسابات البنكية المعتمدة (تحويل بنكي / شيك)' : 'Corporate Bank Accounts'}>
                    {CORPORATE_BANK_ACCOUNTS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {isAr ? b.bankNameAr : b.bankNameEn} — ({b.accountNumber})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Amount & Balance Indicator */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'المبلغ المطلوب صرفه (ج.م) *:' : 'Disbursement Amount (EGP) *:'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={issueAmount}
                    onChange={(e) => {
                      setIssueAmount(e.target.value);
                      setIssueError('');
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-base font-black font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                    <span className="text-[10px] text-slate-400 block">{isAr ? 'قناة الصرف:' : 'Channel:'}</span>
                    <strong className="text-slate-800">
                      {isIssueBank ? (isAr ? 'تحويل بنكي مباشر' : 'Bank Wire') : (isAr ? 'صرف نقدية بالخزينة' : 'Physical Vault Cash')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Banknote Denominations (If physical safe) */}
              {!isIssueBank && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 text-xs">
                      {isAr ? 'تفقيط الفئات الورقية المنصرفة:' : 'Banknote Denomination Breakdown:'}
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoFillIssue}
                      disabled={numIssueAmount <= 0}
                      className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-md text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Wand2 className="h-3 w-3" />
                      <span>{isAr ? 'توزيع تلقائي للفئات' : 'Auto-Fill'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {EGP_DENOMINATIONS.map((denom) => {
                      const rawCount = issueDenoms[denom];
                      const numCount = Number(rawCount) || 0;
                      const isNegative = typeof rawCount === 'string' && rawCount.startsWith('-') ? true : numCount < 0;
                      const avail = issueSafeDenoms[denom] || 0;
                      const isShort = isNegative ? false : (!isIssueBank && numCount > avail);

                      return (
                        <div
                          key={denom}
                          className={`p-2 rounded-xl border text-center transition relative flex flex-col justify-between ${
                            isShort
                              ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-400'
                              : isNegative
                              ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/50'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-extrabold text-slate-800">{denom} {isAr ? 'ج.م' : 'EGP'}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleIssueSign(denom)}
                              title={isAr ? 'تبديل الإشارة (+ أو - فكة مرتدة)' : 'Toggle sign (+ or - change)'}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition ${
                                isNegative ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {isNegative ? '-' : '+'}
                            </button>
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rawCount === 0 ? '' : rawCount}
                            onChange={(e) => handleIssueDenomChange(denom, e.target.value)}
                            placeholder="0"
                            className={`w-full text-center font-mono font-black text-xs border rounded-lg py-1 my-1 focus:outline-none transition ${
                              isNegative
                                ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-1 focus:ring-amber-500'
                                : 'border-slate-200 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900'
                            }`}
                          />
                          <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5 font-mono">
                            <span>{isNegative ? (isAr ? 'فكة مرتدة' : 'Change') : `${isAr ? 'متاح:' : 'Avail:'} ${avail}`}</span>
                            <span className={`font-bold ${isNegative ? 'text-amber-800' : 'text-slate-600'}`}>
                              {(numCount * denom).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`p-2 rounded-lg border text-center text-xs font-bold ${
                    isIssueBanknoteBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {isIssueBanknoteBalanced
                      ? (isAr ? `الفئات متطابقة تماماً (${countedIssueBanknotes.toLocaleString()} ج.م) ✓` : `Banknotes match total amount (${countedIssueBanknotes.toLocaleString()} EGP) ✓`)
                      : (isAr ? `فارق في العد: ${Math.abs(numIssueAmount - countedIssueBanknotes).toLocaleString()} ج.م` : `Variance: ${Math.abs(numIssueAmount - countedIssueBanknotes).toLocaleString()} EGP`)}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'بيان وسبب الصرف:' : 'Disbursement Notes & Purpose:'}
                </label>
                <input
                  type="text"
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                  placeholder={issueModal.type === 'custody_issue' ? (isAr ? 'مثال: عهدة صيانة خط 1 وشراء مستلزمات' : 'e.g. Line 1 maintenance supplies') : (isAr ? 'مثال: سلفة زواج أو علاج تخصم من راتب الشهر' : 'e.g. Personal advance deducted from salary')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              {/* Supporting Attachments */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'المستندات المؤيدة الإضافية (طلب صرف، فواتير أولية):' : 'Additional Supporting Documents (Request form, initial quote):'}
                </label>
                <label className="flex items-center justify-center gap-1.5 p-3 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer">
                  <Upload className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600 font-bold">
                    {isAr ? 'إرفاق صور أو ملفات PDF' : 'Attach receipt images or PDFs'}
                  </span>
                  <input type="file" multiple accept="image/*,application/pdf" onChange={(e) => handleFileUpload(e, setIssueAttachments)} className="hidden" />
                </label>
                {issueAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {issueAttachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] text-slate-700 border border-slate-200">
                        <Paperclip className="h-3 w-3 text-slate-500 shrink-0" />
                        <span className="truncate max-w-[160px] font-medium">{a.name || `مستند ${i + 1}`}</span>
                        <button
                          type="button"
                          onClick={() => setIssueAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer transition"
                          title={isAr ? 'إزالة الملف' : 'Remove file'}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Beneficiary Signature & Acknowledgment Workflow (Mandatory for Voucher Issuance) */}
              <div className="border-2 border-amber-300/80 bg-amber-50/50 rounded-2xl p-4 space-y-3.5 mt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-amber-200/80 flex items-center justify-center text-amber-900 font-bold text-xs">
                      1
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-xs">
                        {isAr ? 'إقرار وتعهد استلام المستفيد (شرط إلزامي للاعتماد)' : 'Beneficiary Acknowledgment & Signature (Mandatory)'}
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        {isAr
                          ? 'يلزم طباعة الإقرار وتوقيعه حياً من المستفيد ثم إعادة رفعه قبل السماح بترحيل سند الصرف.'
                          : 'You must print the form, obtain physical signature, and re-upload before voucher issuance.'}
                      </p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    hasPrinted && signedDocument
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}>
                    {hasPrinted && signedDocument
                      ? (isAr ? 'مكتمل وجاهز للصرف ✓' : 'Requirements Met ✓')
                      : (isAr ? 'بانتظار التوقيع والرفع' : 'Pending Signature')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Step 1: Print */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-slate-800 text-xs">
                          {isAr ? 'الخطوة 1: طباعة مستند الإقرار' : 'Step 1: Print Form'}
                        </span>
                        {hasPrinted && (
                          <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                            <Check className="h-3 w-3" />
                            {isAr ? 'تمت الطباعة' : 'Printed'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {isAr ? 'طباعة نموذج A4 رسمي يتضمن التفقيط والبيانات والتعهد القانوني.' : 'Print standard A4 form with Tafqeet and legal pledge.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenPrintAck}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>{hasPrinted ? (isAr ? 'إعادة طباعة المستند' : 'Re-print Form') : (isAr ? 'طباعة إقرار الاستلام والتعهد' : 'Print Acknowledgment Form')}</span>
                    </button>
                  </div>

                  {/* Step 2: Upload Signed Document */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-slate-800 text-xs">
                          {isAr ? 'الخطوة 2: رفع الإقرار الموقع' : 'Step 2: Upload Signed Form'}
                        </span>
                        {signedDocument && (
                          <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5">
                            <Check className="h-3 w-3" />
                            {isAr ? 'تم الرفع' : 'Uploaded'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {isAr ? 'صورة ضوئية أو ملف PDF للمستند بعد توقيع وبصمة المستفيد.' : 'Scan or PDF of document after staff signature.'}
                      </p>
                    </div>

                    {signedDocument ? (
                      <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="flex items-center gap-1.5 truncate">
                          <Paperclip className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate text-[11px] font-bold text-emerald-900">
                            {signedDocument.name || (isAr ? 'إقرار موقع ومرفق' : 'Signed document')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSelectedAttachmentForView(signedDocument)}
                            className="p-1 text-emerald-700 hover:text-emerald-900 cursor-pointer"
                            title={isAr ? 'معاينة المستند' : 'Preview'}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSignedDocument(null)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title={isAr ? 'إلغاء' : 'Remove'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">
                        <Upload className="h-3.5 w-3.5" />
                        <span>{isAr ? 'رفع المستند الموقع (PDF / صورة)' : 'Upload Signed Document'}</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleSignedDocUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Advisory guidance */}
                {(!hasPrinted || !signedDocument) && (
                  <div className="p-2.5 bg-amber-100/70 border border-amber-300/80 rounded-xl text-[11px] text-amber-950 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                    <span>
                      {isAr
                        ? 'إذا كان المستفيد غير متاح للتوقيع الفوري، يمكنك الضغط على "حفظ كمسودة" بالأسفل للاحتفاظ ببيانات السند وإتمام الصرف لاحقاً بمجرد استلام الإقرار الموقع.'
                        : 'If the beneficiary is unavailable to sign now, click "Save as Draft" below to keep details and disburse later upon signature.'}
                    </span>
                  </div>
                )}
              </div>
            </form>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              {/* Draft button */}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSubmittingIssue || !issueWorkerId || numIssueAmount <= 0}
                className="w-full sm:w-auto px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                title={isAr ? 'حفظ العملية كمسودة لاستكمال التوقيع والصرف لاحقاً' : 'Save draft to complete signature and issue later'}
              >
                <Save className="h-4 w-4" />
                <span>{isAr ? 'حفظ كمسودة' : 'Save as Draft'}</span>
              </button>

              <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIssueModal({ isOpen: false, type: 'custody_issue', draftId: null, isDraftMode: false })}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer text-xs"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitIssue}
                  disabled={!canFinalizeIssue}
                  className={`px-5 py-2 font-bold rounded-xl text-white text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    canFinalizeIssue ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-400'
                  }`}
                  title={
                    !hasPrinted
                      ? (isAr ? 'يرجى طباعة الإقرار أولاً' : 'Please print the acknowledgment first')
                      : !signedDocument
                      ? (isAr ? 'يرجى رفع الإقرار بعد توقيع المستفيد' : 'Please upload signed document')
                      : (!isIssueBank && !isIssueBanknoteBalanced)
                      ? (isAr ? 'الفئات الورقية غير متطابقة مع المبلغ' : 'Banknotes mismatch')
                      : (!isIssueBank && issueSafeBal < numIssueAmount)
                      ? (isAr ? 'رصيد الخزينة غير كافٍ' : 'Insufficient safe balance')
                      : (isAr ? 'تأكيد واعتماد الصرف' : 'Approve & Issue')
                  }
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {isSubmittingIssue
                      ? (isAr ? 'جاري المعالجة...' : 'Processing...')
                      : (isAr ? 'تأكيد واعتماد الصرف' : 'Approve & Issue Voucher')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. CUSTODY SETTLEMENT MODAL (تسوية عهدة: توريد نقدي أو بنود فواتير متعددة)   */}
      {/* ========================================================================= */}
      {custodySettleModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FileCheck className="h-5 w-5 text-white/90" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    {isAr ? 'تسوية عهدة نقدية معلقة' : 'Settle & Liquidate Custody'}
                  </h3>
                  <p className="text-xs text-white/80">
                    {isAr ? 'تسوية العهدة بتوريد نقدية متبقية أو إثبات بنود فواتير ومصروفات تفصيلية' : 'Liquidate custody via cash return or multiple expense records'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustodySettleModal({ isOpen: false, method: 'cash_return', workerId: '' })}
                className="text-white/80 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Method Switcher Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCustodySettleModal((prev) => ({ ...prev, method: 'cash_return' }));
                  setCustodySettleError('');
                }}
                className={`py-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  custodySettleModal.method === 'cash_return'
                    ? 'border-amber-600 text-amber-700 bg-white font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Coins className="h-4 w-4" />
                <span>{isAr ? '١- توريد نقدية للخزينة / البنك (رد نقدية)' : '1. Return Cash to Vault / Bank'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustodySettleModal((prev) => ({ ...prev, method: 'expense_bill' }));
                  setCustodySettleError('');
                }}
                className={`py-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  custodySettleModal.method === 'expense_bill'
                    ? 'border-amber-600 text-amber-700 bg-white font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Receipt className="h-4 w-4" />
                <span>{isAr ? '٢- تسوية بمصروفات وفواتير متعددة (Liquidate Bills)' : '2. Liquidate with Multiple Expense Records'}</span>
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {custodySettleError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{custodySettleError}</span>
                </div>
              )}

              {/* Beneficiary Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الموظف / صاحب العهدة *:' : 'Custody Beneficiary *:'}
                </label>
                <SearchableSelect
                  options={custodySettleWorkerOptions}
                  value={custodySettleModal.workerId}
                  onChange={(wId) => {
                    const rec = custodyRecords.find((r) => r.workerId === wId);
                    setCustodySettleModal((prev) => ({ ...prev, workerId: wId }));
                    if (rec && Number(rec.currentCustodyBalance) > 0) {
                      setCustodySettleCashAmount(String(rec.currentCustodyBalance));
                    }
                    setCustodySettleError('');
                  }}
                  placeholder={isAr ? '-- ابحث واختر صاحب العهدة --' : '-- Search & Select Beneficiary --'}
                  isAr={isAr}
                  className="w-full font-bold"
                />
              </div>

              {/* Selected Worker Current Custody Badge */}
              {custodySettleModal.workerId && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-amber-600" />
                    <span className="font-bold text-slate-700">
                      {isAr ? 'رصيد العهدة المعلق حالياً في ذمة الموظف:' : 'Current Outstanding Custody Balance:'}
                    </span>
                  </div>
                  <span className="font-mono font-black text-amber-800 text-sm">
                    {custodyOutstandingBalance.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              )}

              {/* Target Custody Selector (SSOT Linkage) */}
              {custodySettleModal.workerId && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'العهدة المستهدفة للتسوية (رقم SSOT):' : 'Target Custody to Settle (SSOT ID):'}
                  </label>
                  <select
                    value={custodySettleModal.targetCustodyId || ''}
                    onChange={(e) => {
                      const cId = e.target.value;
                      setCustodySettleModal((prev) => ({ ...prev, targetCustodyId: cId }));
                      const chosen = allActiveCustodies.find((c) => c.id === cId);
                      if (chosen) {
                        const rem = Number(chosen.remainingAmount) || 0;
                        if (rem > 0) {
                          setCustodySettleCashAmount(String(rem));
                          setCustodyExpenseItems((prev) =>
                            prev.map((it, idx) => (idx === 0 ? { ...it, amount: String(rem) } : it))
                          );
                        }
                      }
                      setCustodySettleError('');
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    <option value="">{isAr ? '-- تسوية عامة على رصيد العهدة --' : '-- General Custody Settlement --'}</option>
                    {allActiveCustodies
                      .filter((c) => c.workerId === custodySettleModal.workerId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id} — {isAr ? 'المتبقي:' : 'Rem:'} {Number(c.remainingAmount).toLocaleString()} ج.م ({new Date(c.issuedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Active Target Custody SSOT Badge */}
              {custodySettleModal.targetCustodyId && (
                <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                      <Hash className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {isAr ? 'المعرف الرقمي للعهدة الأصلية المستهدفة (SSOT ID):' : 'Target Parent Custody SSOT ID:'}
                      </span>
                      <strong className="font-mono text-amber-300 text-xs">{custodySettleModal.targetCustodyId}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyId(custodySettleModal.targetCustodyId)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 text-[11px] font-mono shrink-0"
                    title={isAr ? 'نسخ المعرف الموحد' : 'Copy SSOT ID'}
                  >
                    <Copy className="h-3 w-3" />
                    <span>{isAr ? 'نسخ' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* METHOD A: RETURN CASH */}
              {custodySettleModal.method === 'cash_return' && (
                <div className="space-y-4">
                  {/* Destination Account */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'الحساب المستلم للإيداع (خزينة نقدية أو بنك) *:' : 'Destination Vault / Bank *:'}
                    </label>
                    <select
                      value={custodySettleDestId}
                      onChange={(e) => {
                        setCustodySettleDestId(e.target.value);
                        setCustodySettleError('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    >
                      <optgroup label={isAr ? 'الخزائن النقدية الفعلية (توريد نقدي)' : 'Physical Cash Vaults'}>
                        {allSafes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {isAr ? s.nameAr : (s.nameEn || s.nameAr)} ({s.id}) — {isAr ? 'رصيد:' : 'Bal:'} {(s.balances?.EGP?.currentBalance || 0).toLocaleString()} ج.م
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={isAr ? 'الحسابات البنكية المعتمدة (إيداع بنكي مباشر)' : 'Corporate Bank Accounts'}>
                        {CORPORATE_BANK_ACCOUNTS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {isAr ? b.bankNameAr : b.bankNameEn} — ({b.accountNumber})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Amount */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        {isAr ? 'المبلغ المردود (ج.م) *:' : 'Returned Amount (EGP) *:'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.5"
                        max={custodyOutstandingBalance || undefined}
                        required
                        value={custodySettleCashAmount}
                        onChange={(e) => {
                          setCustodySettleCashAmount(e.target.value);
                          setCustodySettleError('');
                        }}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-base font-black font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'نوع التوريد:' : 'Deposit Channel:'}</span>
                        <strong className="text-slate-800">
                          {isCustodyDestBank ? (isAr ? 'إيداع بنكي مباشر' : 'Direct Bank Deposit') : (isAr ? 'توريد فئات ورقية بالخزينة' : 'Physical Vault Cash')}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Banknotes Breakdown if Physical Vault */}
                  {!isCustodyDestBank && (
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-800 text-xs">
                          {isAr ? 'تفقيط الفئات الورقية المردودة للخزينة:' : 'Returned Banknote Counts:'}
                        </span>
                        <button
                          type="button"
                          onClick={handleAutoFillCustodyReturn}
                          disabled={numCustodyCashAmount <= 0}
                          className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-md text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          <Wand2 className="h-3 w-3" />
                          <span>{isAr ? 'توزيع تلقائي' : 'Auto-Fill'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {EGP_DENOMINATIONS.map((denom) => {
                          const rawCount = custodySettleDenoms[denom];
                          const numCount = Number(rawCount) || 0;
                          const isNegative = typeof rawCount === 'string' && rawCount.startsWith('-') ? true : numCount < 0;
                          const availInSafe = custodyDestSafeDenoms[denom] || 0;
                          const isShort = isNegative ? (!isCustodyDestBank && Math.abs(numCount) > availInSafe) : false;

                          return (
                            <div
                              key={denom}
                              className={`p-2 rounded-xl border text-center transition relative flex flex-col justify-between ${
                                isShort
                                  ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-400'
                                  : isNegative
                                  ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/50'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="font-extrabold text-slate-800">{denom} {isAr ? 'ج.م' : 'EGP'}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCustodySettleSign(denom)}
                                  title={isAr ? 'تبديل الإشارة (+ أو - فكة مرتدة)' : 'Toggle sign (+ or - change)'}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition ${
                                    isNegative ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                  }`}
                                >
                                  {isNegative ? '-' : '+'}
                                </button>
                              </div>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={rawCount === 0 ? '' : rawCount}
                                onChange={(e) => handleCustodySettleDenomChange(denom, e.target.value)}
                                placeholder="0"
                                className={`w-full text-center font-mono font-black text-xs border rounded-lg py-1 my-1 focus:outline-none transition ${
                                  isNegative
                                    ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-1 focus:ring-amber-500'
                                    : 'border-slate-200 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900'
                                }`}
                              />
                              <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5 font-mono">
                                <span>{isNegative ? `${isAr ? 'فكة متاحة:' : 'Avail chg:'} ${availInSafe}` : (isAr ? 'مستلم' : 'Inflow')}</span>
                                <span className={`font-bold ${isNegative ? 'text-amber-800' : 'text-slate-600'}`}>
                                  {(numCount * denom).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className={`p-2 rounded-lg border text-center text-xs font-bold ${
                        isCustodyBanknoteBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}>
                        {isCustodyBanknoteBalanced
                          ? (isAr ? `الفئات متطابقة تماماً (${countedCustodyBanknotes.toLocaleString()} ج.م) ✓` : `Banknotes match total amount (${countedCustodyBanknotes.toLocaleString()} EGP) ✓`)
                          : (isAr ? `فارق في العد: ${Math.abs(numCustodyCashAmount - countedCustodyBanknotes).toLocaleString()} ج.م` : `Variance: ${Math.abs(numCustodyCashAmount - countedCustodyBanknotes).toLocaleString()} EGP`)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* METHOD B: MULTIPLE EXPENSE ITEMS */}
              {custodySettleModal.method === 'expense_bill' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs sm:text-sm">
                        {isAr ? 'جدول بنود المصروفات والفواتير المؤيدة للعهدة:' : 'Itemized Custody Expense Records:'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {isAr ? 'يمكنك إدراج عدة فواتير ومصروفات تفصيلية لتسوية العهدة بالكامل أو جزئياً' : 'Add multiple expense items to liquidate the custody'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCustodyExpenseItems((prev) => [
                          ...prev,
                          {
                            id: `exp-${prev.length + 1}-${Date.now().toString().slice(-4)}`,
                            title: '',
                            category: 'maintenance',
                            costCenterId: 'CC-PROD-01',
                            amount: '',
                            invoiceNumber: '',
                            vendorName: ''
                          }
                        ]);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isAr ? 'إضافة بند مصروف +' : '+ Add Item'}</span>
                    </button>
                  </div>

                  {/* Multiple Expense Rows Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-start">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 text-center w-10">#</th>
                            <th className="py-2.5 px-3 text-start min-w-[140px]">{isAr ? 'بيان المصروف *' : 'Description *'}</th>
                            <th className="py-2.5 px-3 text-start min-w-[130px]">{isAr ? 'التصنيف المحاسبي' : 'Category'}</th>
                            <th className="py-2.5 px-3 text-start min-w-[110px]">{isAr ? 'مركز التكلفة' : 'Cost Center'}</th>
                            <th className="py-2.5 px-3 text-start min-w-[90px]">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                            <th className="py-2.5 px-3 text-end min-w-[90px]">{isAr ? 'القيمة (ج.م) *' : 'Amount (EGP) *'}</th>
                            <th className="py-2.5 px-2 text-center w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {custodyExpenseItems.map((item, index) => (
                            <tr key={item.id} className="hover:bg-slate-50/70">
                              <td className="py-2 px-3 text-center font-mono text-slate-400 font-bold">
                                {index + 1}
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  required
                                  value={item.title}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustodyExpenseItems((prev) =>
                                      prev.map((r, i) => (i === index ? { ...r, title: val } : r))
                                    );
                                  }}
                                  placeholder={isAr ? 'مثال: شراء سيور وقطع صيانة' : 'e.g. Belts & spare parts'}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  value={item.category}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustodyExpenseItems((prev) =>
                                      prev.map((r, i) => (i === index ? { ...r, category: val } : r))
                                    );
                                  }}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                >
                                  {CUSTODY_EXPENSE_CATEGORIES.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {isAr ? c.nameAr : c.nameEn}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                <select
                                  value={item.costCenterId}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustodyExpenseItems((prev) =>
                                      prev.map((r, i) => (i === index ? { ...r, costCenterId: val } : r))
                                    );
                                  }}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                >
                                  {COST_CENTERS_LIST.map((cc) => (
                                    <option key={cc.id} value={cc.id}>
                                      {isAr ? cc.nameAr : cc.nameEn}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={item.invoiceNumber}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustodyExpenseItems((prev) =>
                                      prev.map((r, i) => (i === index ? { ...r, invoiceNumber: val } : r))
                                    );
                                  }}
                                  placeholder="INV-001"
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-3 text-end">
                                <input
                                  type="number"
                                  step="any"
                                  min="0.1"
                                  required
                                  value={item.amount}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustodyExpenseItems((prev) =>
                                      prev.map((r, i) => (i === index ? { ...r, amount: val } : r))
                                    );
                                    setCustodySettleError('');
                                  }}
                                  placeholder="0.00"
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-end focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-2 text-center">
                                {custodyExpenseItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustodyExpenseItems((prev) => prev.filter((_, i) => i !== index));
                                    }}
                                    className="p-1 text-slate-300 hover:text-rose-600 rounded transition cursor-pointer"
                                    title={isAr ? 'حذف البند' : 'Remove item'}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                          <tr>
                            <td colSpan={5} className="py-3 px-4 text-start font-bold text-slate-700">
                              <div className="flex items-center justify-between">
                                <span>{isAr ? 'إجمالي بنود المصروفات المسواة:' : 'Total Itemized Liquidation:'}</span>
                                <span className="text-xs text-slate-500 font-normal">
                                  {isAr ? 'رصيد العهدة المعلق:' : 'Outstanding Custody:'} {custodyOutstandingBalance.toLocaleString()} ج.م
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-end font-mono font-black text-sm text-emerald-800">
                              {totalCustodyItemizedExpenses.toLocaleString()} ج.م
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                    totalCustodyItemizedExpenses > custodyOutstandingBalance
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    <span>
                      {totalCustodyItemizedExpenses > custodyOutstandingBalance
                        ? (isAr ? `تنبيه: إجمالي الفواتير يتجاوز رصيد العهدة بفارق ${(totalCustodyItemizedExpenses - custodyOutstandingBalance).toLocaleString()} ج.م` : 'Expenses exceed custody balance')
                        : (isAr ? `الرصيد المتبقي بالعهدة بعد التسوية: ${(custodyOutstandingBalance - totalCustodyItemizedExpenses).toLocaleString()} ج.م` : `Remaining custody: ${(custodyOutstandingBalance - totalCustodyItemizedExpenses).toLocaleString()} EGP`)}
                    </span>
                    <span className="font-mono">
                      {totalCustodyItemizedExpenses <= custodyOutstandingBalance ? '✓ مسموح بالاعتماد' : '✕ غير مسموح'}
                    </span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'بيان وتفاصيل التسوية العامة:' : 'General Settlement Statement & Purpose:'}
                </label>
                <input
                  type="text"
                  value={custodySettleNotes}
                  onChange={(e) => setCustodySettleNotes(e.target.value)}
                  placeholder={custodySettleModal.method === 'cash_return' ? (isAr ? 'مثال: توريد فائض العهدة بعد انتهاء الصيانة' : 'e.g. Return surplus custody') : (isAr ? 'مثال: تسوية فواتير صيانة وعمليات شهر أكتوبر' : 'e.g. October maintenance bills liquidation')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الفواتير الضريبية وإيصالات الصرف المؤيدة:' : 'Tax Invoices & Expense Receipts:'}
                </label>
                <label className="flex items-center justify-center gap-1.5 p-3 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer">
                  <Upload className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600 font-bold">
                    {isAr ? 'إرفاق صور وفواتير ضريبية (PNG, JPG, PDF)' : 'Attach invoice scans & receipts'}
                  </span>
                  <input type="file" multiple accept="image/*,application/pdf" onChange={(e) => handleFileUpload(e, setCustodySettleAttachments)} className="hidden" />
                </label>
                {custodySettleAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {custodySettleAttachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-900 rounded-lg text-[11px] font-bold border border-amber-200">
                        <Paperclip className="h-3 w-3 text-amber-600 shrink-0" />
                        <span className="truncate max-w-[160px]">{a.name || `مستند ${i + 1}`}</span>
                        <button
                          type="button"
                          onClick={() => setCustodySettleAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-amber-400 hover:text-rose-600 p-0.5 cursor-pointer transition"
                          title={isAr ? 'إزالة الملف' : 'Remove file'}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setCustodySettleModal({ isOpen: false, method: 'cash_return', workerId: '' })}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSubmitCustodySettle}
                disabled={
                  isSubmittingCustodySettle ||
                  (custodySettleModal.method === 'cash_return' && !isCustodyDestBank && !isCustodyBanknoteBalanced) ||
                  (custodySettleModal.method === 'expense_bill' && totalCustodyItemizedExpenses > custodyOutstandingBalance)
                }
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 font-bold rounded-xl text-white shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCustodySettle
                  ? (isAr ? 'جاري التسوية...' : 'Processing...')
                  : (isAr ? 'اعتماد تسوية العهدة' : 'Confirm Custody Settlement')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. ADVANCE SETTLEMENT MODAL (سداد نقدي / خصم راتب شهر / تقسيط مجدول)       */}
      {/* ========================================================================= */}
      {advanceSettleModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="h-5 w-5 text-white/90" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    {isAr ? 'سداد وتسوية سلفة شخصية' : 'Settle / Repay Salary Advance'}
                  </h3>
                  <p className="text-xs text-white/80">
                    {isAr ? 'سداد نقدي فوري بالخزينة أو خصم مباشر من راتب شهر محدد أو جدولة تقسيط على عدة أشهر' : 'Choose cash repayment, single month payroll deduction, or multi-month installments'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdvanceSettleModal({ isOpen: false, settleType: 'cash', workerId: '' })}
                className="text-white/80 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 3 Settlement Channel Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 text-xs font-bold shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => {
                  setAdvanceSettleModal((prev) => ({ ...prev, settleType: 'cash' }));
                  setAdvanceSettleError('');
                }}
                className={`py-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  advanceSettleModal.settleType === 'cash'
                    ? 'border-purple-600 text-purple-700 bg-white font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Coins className="h-4 w-4" />
                <span>{isAr ? '١- سداد نقدي / بنكي فوري' : '1. Instant Cash / Bank'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdvanceSettleModal((prev) => ({ ...prev, settleType: 'payroll_deduction' }));
                  setAdvancePayrollAmount(advanceOutstandingBalance > 0 ? String(advanceOutstandingBalance) : '');
                  setAdvanceSettleError('');
                }}
                className={`py-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  advanceSettleModal.settleType === 'payroll_deduction'
                    ? 'border-purple-600 text-purple-700 bg-white font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>{isAr ? '٢- خصم من راتب شهر محدد' : '2. Single Month Payroll Deduction'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdvanceSettleModal((prev) => ({ ...prev, settleType: 'installments' }));
                  setAdvanceInstallmentRows(generateInstallments(advanceInstallmentCount, advanceOutstandingBalance));
                  setAdvanceSettleError('');
                }}
                className={`py-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  advanceSettleModal.settleType === 'installments'
                    ? 'border-purple-600 text-purple-700 bg-white font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <CalendarDays className="h-4 w-4" />
                <span>{isAr ? '٣- تقسيط مجدول على عدة أشهر' : '3. Multi-Month Installment Plan'}</span>
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {advanceSettleError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{advanceSettleError}</span>
                </div>
              )}

              {/* Beneficiary Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الموظف / صاحب السلفة *:' : 'Staff Member with Advance *:'}
                </label>
                <SearchableSelect
                  options={advanceSettleWorkerOptions}
                  value={advanceSettleModal.workerId}
                  onChange={(wId) => {
                    const rec = custodyRecords.find((r) => r.workerId === wId);
                    setAdvanceSettleModal((prev) => ({ ...prev, workerId: wId }));
                    const bal = Number(rec?.currentAdvanceBalance) || 0;
                    if (bal > 0) {
                      setAdvanceCashAmount(String(bal));
                      setAdvancePayrollAmount(String(bal));
                      setAdvanceInstallmentRows(generateInstallments(advanceInstallmentCount, bal));
                    }
                    setAdvanceSettleError('');
                  }}
                  placeholder={isAr ? '-- ابحث واختر الموظف المسدد --' : '-- Search & Select Staff Member --'}
                  isAr={isAr}
                  className="w-full font-bold"
                />
              </div>

              {/* Selected Worker Current Advance Badge */}
              {advanceSettleModal.workerId && (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    <span className="font-bold text-slate-700">
                      {isAr ? 'إجمالي السلفة المستحقة في ذمة الموظف:' : 'Total Outstanding Advance Balance:'}
                    </span>
                  </div>
                  <span className="font-mono font-black text-purple-800 text-sm">
                    {advanceOutstandingBalance.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              )}

              {/* Target Advance Selector (SSOT Linkage) */}
              {advanceSettleModal.workerId && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'السلفة المستهدفة للسداد أو التقسيط (رقم SSOT):' : 'Target Advance to Repay / Schedule (SSOT ID):'}
                  </label>
                  <select
                    value={advanceSettleModal.targetAdvanceId || ''}
                    onChange={(e) => {
                      const aId = e.target.value;
                      setAdvanceSettleModal((prev) => ({ ...prev, targetAdvanceId: aId }));
                      const chosen = allActiveAdvances.find((a) => a.id === aId);
                      if (chosen) {
                        const rem = Number(chosen.remainingAmount) || 0;
                        if (rem > 0) {
                          setAdvanceCashAmount(String(rem));
                          setAdvancePayrollAmount(String(rem));
                          setAdvanceInstallmentRows(generateInstallments(advanceInstallmentCount, rem, aId));
                        }
                      }
                      setAdvanceSettleError('');
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    <option value="">{isAr ? '-- سداد عام على رصيد السلف --' : '-- General Advance Repayment --'}</option>
                    {allActiveAdvances
                      .filter((a) => a.workerId === advanceSettleModal.workerId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id} — {isAr ? 'المتبقي:' : 'Rem:'} {Number(a.remainingAmount).toLocaleString()} ج.م ({new Date(a.issuedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Active Target Advance SSOT Badge */}
              {advanceSettleModal.targetAdvanceId && (
                <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                      <Hash className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {isAr ? 'المعرف الرقمي للسلفة الأصلية المستهدفة (SSOT ID):' : 'Target Parent Advance SSOT ID:'}
                      </span>
                      <strong className="font-mono text-purple-300 text-xs">{advanceSettleModal.targetAdvanceId}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyId(advanceSettleModal.targetAdvanceId)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 text-[11px] font-mono shrink-0"
                    title={isAr ? 'نسخ المعرف الموحد' : 'Copy SSOT ID'}
                  >
                    <Copy className="h-3 w-3" />
                    <span>{isAr ? 'نسخ' : 'Copy'}</span>
                  </button>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* CHANNEL 1: CASH / BANK REPAYMENT                              */}
              {/* ------------------------------------------------------------- */}
              {advanceSettleModal.settleType === 'cash' && (
                <div className="space-y-4">
                  {/* Destination Account */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'الحساب المستلم للإيداع (خزينة نقدية أو بنك) *:' : 'Destination Account (Vault or Bank) *:'}
                    </label>
                    <select
                      value={advanceDestId}
                      onChange={(e) => {
                        setAdvanceDestId(e.target.value);
                        setAdvanceSettleError('');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    >
                      <optgroup label={isAr ? 'الخزائن النقدية الفعلية (توريد نقدي)' : 'Physical Cash Vaults'}>
                        {allSafes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {isAr ? s.nameAr : (s.nameEn || s.nameAr)} ({s.id}) — {isAr ? 'رصيد:' : 'Bal:'} {(s.balances?.EGP?.currentBalance || 0).toLocaleString()} ج.م
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={isAr ? 'الحسابات البنكية المعتمدة (تحويل أو إيداع بنكي)' : 'Corporate Bank Accounts'}>
                        {CORPORATE_BANK_ACCOUNTS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {isAr ? b.bankNameAr : b.bankNameEn} — ({b.accountNumber})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Repaid Amount */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        {isAr ? 'المبلغ المسدد نقداً (ج.م) *:' : 'Repaid Amount (EGP) *:'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.5"
                        max={advanceOutstandingBalance || undefined}
                        required
                        value={advanceCashAmount}
                        onChange={(e) => {
                          setAdvanceCashAmount(e.target.value);
                          setAdvanceSettleError('');
                        }}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-base font-black font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'نوع السداد:' : 'Payment Channel:'}</span>
                        <strong className="text-slate-800">
                          {isAdvanceDestBank ? (isAr ? 'إيداع بنكي مباشر' : 'Direct Bank Deposit') : (isAr ? 'توريد نقدي بالخزينة' : 'Physical Vault Cash')}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Banknotes Breakdown if Physical Vault */}
                  {!isAdvanceDestBank && (
                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-800 text-xs">
                          {isAr ? 'تفقيط الفئات الورقية المسددة بالخزينة:' : 'Repaid Banknote Denominations:'}
                        </span>
                        <button
                          type="button"
                          onClick={handleAutoFillAdvanceReturn}
                          disabled={numAdvanceCashAmount <= 0}
                          className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-md text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          <Wand2 className="h-3 w-3" />
                          <span>{isAr ? 'توزيع تلقائي' : 'Auto-Fill'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {EGP_DENOMINATIONS.map((denom) => {
                          const rawCount = advanceDenoms[denom];
                          const numCount = Number(rawCount) || 0;
                          const isNegative = typeof rawCount === 'string' && rawCount.startsWith('-') ? true : numCount < 0;
                          const availInSafe = advanceDestSafeDenoms[denom] || 0;
                          const isShort = isNegative ? (!isAdvanceDestBank && Math.abs(numCount) > availInSafe) : false;

                          return (
                            <div
                              key={denom}
                              className={`p-2 rounded-xl border text-center transition relative flex flex-col justify-between ${
                                isShort
                                  ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-400'
                                  : isNegative
                                  ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/50'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="font-extrabold text-slate-800">{denom} {isAr ? 'ج.م' : 'EGP'}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAdvanceSign(denom)}
                                  title={isAr ? 'تبديل الإشارة (+ أو - فكة مرتدة)' : 'Toggle sign (+ or - change)'}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition ${
                                    isNegative ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                  }`}
                                >
                                  {isNegative ? '-' : '+'}
                                </button>
                              </div>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={rawCount === 0 ? '' : rawCount}
                                onChange={(e) => handleAdvanceDenomChange(denom, e.target.value)}
                                placeholder="0"
                                className={`w-full text-center font-mono font-black text-xs border rounded-lg py-1 my-1 focus:outline-none transition ${
                                  isNegative
                                    ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-1 focus:ring-amber-500'
                                    : 'border-slate-200 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900'
                                }`}
                              />
                              <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5 font-mono">
                                <span>{isNegative ? `${isAr ? 'فكة متاحة:' : 'Avail chg:'} ${availInSafe}` : (isAr ? 'مستلم' : 'Inflow')}</span>
                                <span className={`font-bold ${isNegative ? 'text-amber-800' : 'text-slate-600'}`}>
                                  {(numCount * denom).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className={`p-2 rounded-lg border text-center text-xs font-bold ${
                        isAdvanceBanknoteBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}>
                        {isAdvanceBanknoteBalanced
                          ? (isAr ? `الفئات متطابقة تماماً (${countedAdvanceBanknotes.toLocaleString()} ج.م) ✓` : `Banknotes match total amount (${countedAdvanceBanknotes.toLocaleString()} EGP) ✓`)
                          : (isAr ? `فارق في العد: ${Math.abs(numAdvanceCashAmount - countedAdvanceBanknotes).toLocaleString()} ج.م` : `Variance: ${Math.abs(numAdvanceCashAmount - countedAdvanceBanknotes).toLocaleString()} EGP`)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* CHANNEL 2: SINGLE MONTH PAYROLL DEDUCTION                     */}
              {/* ------------------------------------------------------------- */}
              {advanceSettleModal.settleType === 'payroll_deduction' && (
                <div className="space-y-4 bg-purple-50/50 p-4 rounded-2xl border border-purple-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Month Picker */}
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        {isAr ? 'شهر الراتب المستهدف للخصم *:' : 'Target Payroll Month *:'}
                      </label>
                      <select
                        value={advancePayrollMonth}
                        onChange={(e) => setAdvancePayrollMonth(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white text-xs focus:ring-2 focus:ring-purple-600 focus:outline-none"
                      >
                        {upcomingMonths.map((m) => (
                          <option key={m.value} value={m.value}>
                            {isAr ? m.labelAr : m.labelEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Amount to Deduct */}
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        {isAr ? 'المبلغ المخصوم من الراتب (ج.م) *:' : 'Deduction Amount (EGP) *:'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        max={advanceOutstandingBalance || undefined}
                        required
                        value={advancePayrollAmount}
                        onChange={(e) => {
                          setAdvancePayrollAmount(e.target.value);
                          setAdvanceSettleError('');
                        }}
                        className="w-full px-3 py-2 text-base font-black font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-600 focus:outline-none bg-white"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-purple-100 flex items-center justify-between text-xs text-slate-600">
                    <span>{isAr ? 'الرصيد المتبقي بعد خصم الراتب:' : 'Remaining Balance After Deduction:'}</span>
                    <strong className="font-mono font-black text-purple-900 text-sm">
                      {Math.max(0, advanceOutstandingBalance - (Number(advancePayrollAmount) || 0)).toLocaleString()} ج.م
                    </strong>
                  </div>

                  {/* Derived Deduction SSOT ID Badge */}
                  <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                        <Hash className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {isAr ? 'كود سند الخصم الموحد المستهدف (SSOT ID):' : 'Derived Payroll Deduction SSOT ID:'}
                        </span>
                        <strong className="text-purple-300 font-mono text-xs">
                          {generateAdvanceDeductionId(advanceSettleModal.targetAdvanceId, advancePayrollMonth)}
                        </strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyId(generateAdvanceDeductionId(advanceSettleModal.targetAdvanceId, advancePayrollMonth))}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-1.5 text-[11px] font-mono shrink-0"
                      title={isAr ? 'نسخ كود الخصم' : 'Copy Deduction ID'}
                    >
                      <Copy className="h-3 w-3" />
                      <span>{isAr ? 'نسخ' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* CHANNEL 3: MULTI-MONTH INSTALLMENTS SCHEDULE                  */}
              {/* ------------------------------------------------------------- */}
              {advanceSettleModal.settleType === 'installments' && (
                <div className="space-y-4">
                  {/* Installment Controls Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-purple-50/70 p-3 rounded-2xl border border-purple-200">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{isAr ? 'عدد أشهر التقسيط:' : 'Number of Months:'}</span>
                      <select
                        value={advanceInstallmentCount}
                        onChange={(e) => {
                          const count = parseInt(e.target.value, 10) || 2;
                          setAdvanceInstallmentCount(count);
                          setAdvanceInstallmentRows(generateInstallments(count, advanceOutstandingBalance, advanceSettleModal.targetAdvanceId));
                        }}
                        className="px-2.5 py-1 font-bold border border-slate-300 rounded-xl bg-white text-xs"
                      >
                        <option value="2">2 {isAr ? 'شهران' : 'Months'}</option>
                        <option value="3">3 {isAr ? 'أشهر' : 'Months'}</option>
                        <option value="4">4 {isAr ? 'أشهر' : 'Months'}</option>
                        <option value="6">6 {isAr ? 'أشهر' : 'Months'}</option>
                        <option value="10">10 {isAr ? 'أشهر' : 'Months'}</option>
                        <option value="12">12 {isAr ? 'شهراً (سنة)' : 'Months (1 Year)'}</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAdvanceInstallmentRows(generateInstallments(advanceInstallmentCount, advanceOutstandingBalance, advanceSettleModal.targetAdvanceId));
                      }}
                      className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>{isAr ? 'توزيع المبلغ بالتساوي' : 'Distribute Evenly'}</span>
                    </button>
                  </div>

                  {/* Installments Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-xs text-start">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12">{isAr ? 'القسط' : 'Inst #'}</th>
                          <th className="py-2.5 px-3 text-start">{isAr ? 'كود القسط الموحد (SSOT ID)' : 'Installment SSOT ID'}</th>
                          <th className="py-2.5 px-3 text-start">{isAr ? 'شهر الاستحقاق / الخصم *' : 'Target Month *'}</th>
                          <th className="py-2.5 px-3 text-end">{isAr ? 'قيمة القسط (ج.م) *' : 'Installment Amount (EGP) *'}</th>
                          <th className="py-2.5 px-3 text-start">{isAr ? 'ملاحظات' : 'Notes'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {advanceInstallmentRows.map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-600 font-mono">
                              #{idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200 w-fit">
                                <span>{row.id}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyId(row.id)}
                                  className="text-purple-400 hover:text-purple-900 p-0.5 cursor-pointer"
                                  title={isAr ? 'نسخ كود القسط' : 'Copy Installment ID'}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                value={row.month}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAdvanceInstallmentRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, month: val } : r))
                                  );
                                }}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white focus:ring-1 focus:ring-purple-600 focus:outline-none"
                              >
                                {upcomingMonths.map((m) => (
                                  <option key={m.value} value={m.value}>
                                    {isAr ? m.labelAr : m.labelEn}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 px-3 text-end">
                              <input
                                type="number"
                                step="any"
                                min="1"
                                required
                                value={row.amount}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAdvanceInstallmentRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, amount: val } : r))
                                  );
                                  setAdvanceSettleError('');
                                }}
                                placeholder="0.00"
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-end focus:ring-1 focus:ring-purple-600 focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={row.notes}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAdvanceInstallmentRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, notes: val } : r))
                                  );
                                }}
                                placeholder={isAr ? 'اختياري' : 'Optional'}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-600 focus:outline-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <tr>
                          <td colSpan={3} className="py-3 px-4 text-start font-bold text-slate-700">
                            {isAr ? 'إجمالي الأقساط المجدولة:' : 'Total Scheduled Installments:'}
                          </td>
                          <td className="py-3 px-3 text-end font-mono font-black text-sm text-purple-900">
                            {totalAdvanceInstallmentsSum.toLocaleString()} ج.م
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Installments Reconciliation Bar */}
                  <div className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                    Math.abs(totalAdvanceInstallmentsSum - advanceOutstandingBalance) < 0.01
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : totalAdvanceInstallmentsSum > advanceOutstandingBalance
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <span>
                      {Math.abs(totalAdvanceInstallmentsSum - advanceOutstandingBalance) < 0.01
                        ? (isAr ? 'مجموع الأقساط يغطي كامل السلفة المستحقة بالتطابق ✓' : 'Installments sum exactly matches total advance balance ✓')
                        : totalAdvanceInstallmentsSum > advanceOutstandingBalance
                        ? (isAr ? `تنبيه: مجموع الأقساط أكبر من السلفة بفارق ${(totalAdvanceInstallmentsSum - advanceOutstandingBalance).toLocaleString()} ج.م` : 'Installments sum exceeds balance')
                        : (isAr ? `متبقي من السلفة بدون جدولة: ${(advanceOutstandingBalance - totalAdvanceInstallmentsSum).toLocaleString()} ج.م` : `Unscheduled balance: ${(advanceOutstandingBalance - totalAdvanceInstallmentsSum).toLocaleString()} EGP`)}
                    </span>
                    <span className="font-mono">
                      {Math.abs(totalAdvanceInstallmentsSum - advanceOutstandingBalance) < 0.01 ? '✓ متطابق' : 'فارق'}
                    </span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'بيان وتفاصيل التسوية أو السداد:' : 'Repayment Notes & Statement:'}
                </label>
                <input
                  type="text"
                  value={advanceSettleNotes}
                  onChange={(e) => setAdvanceSettleNotes(e.target.value)}
                  placeholder={
                    advanceSettleModal.settleType === 'cash'
                      ? (isAr ? 'مثال: سداد نقدي لكامل السلفة المستحقة' : 'e.g. Cash settlement of salary advance')
                      : advanceSettleModal.settleType === 'payroll_deduction'
                      ? (isAr ? `مثال: خصم معتمد من راتب شهر ${advancePayrollMonth}` : `Payroll deduction for ${advancePayrollMonth}`)
                      : (isAr ? `مثال: اتفاق تقسيط سلفة على ${advanceInstallmentRows.length} أشهر` : 'Multi-month installment agreement')
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              {/* Supporting Attachments */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'المستندات وإيصالات السداد المؤيدة:' : 'Supporting Receipts & Documents:'}
                </label>
                <label className="flex items-center justify-center gap-1.5 p-3 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer">
                  <Upload className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600 font-bold">
                    {isAr ? 'إرفاق إيصالات أو مستندات موقعة (PNG, JPG, PDF)' : 'Attach receipts or signed agreement files'}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFileUpload(e, setAdvanceSettleAttachments)}
                    className="hidden"
                  />
                </label>
                {advanceSettleAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {advanceSettleAttachments.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200"
                      >
                        <Paperclip className="h-3 w-3 text-purple-600 shrink-0" />
                        <span className="truncate max-w-[160px] font-medium">{a.name || `مستند ${i + 1}`}</span>
                        <button
                          type="button"
                          onClick={() => setAdvanceSettleAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-purple-400 hover:text-rose-600 p-0.5 cursor-pointer transition"
                          title={isAr ? 'إزالة الملف' : 'Remove file'}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setAdvanceSettleModal({ isOpen: false, settleType: 'cash', workerId: '' })}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSubmitAdvanceSettle}
                disabled={
                  isSubmittingAdvanceSettle ||
                  (advanceSettleModal.settleType === 'cash' && !isAdvanceDestBank && !isAdvanceBanknoteBalanced) ||
                  (advanceSettleModal.settleType === 'installments' && totalAdvanceInstallmentsSum > advanceOutstandingBalance)
                }
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 font-bold rounded-xl text-white shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmittingAdvanceSettle
                  ? (isAr ? 'جاري المعالجة...' : 'Processing...')
                  : (isAr ? 'تأكيد واعتماد التسوية' : 'Confirm Advance Settlement')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. STATEMENT OF CUSTODY HISTORY MODAL                                     */}
      {/* ========================================================================= */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-extrabold">
                  {isAr ? `كشف حساب العهدة والسلف: ${selectedRecord.workerName}` : `Statement: ${selectedRecord.workerName}`}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAr ? 'سجل الحركات التاريخية والتسويات والخصومات المجدولة' : 'Historical transactions, settlements and scheduled deductions'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-2.5">
              {(selectedRecord.history || []).length === 0 ? (
                <p className="text-center text-slate-400 py-12 text-xs">
                  {isAr ? 'لا توجد حركات مسجلة' : 'No recorded transactions'}
                </p>
              ) : (
                selectedRecord.history.map((h, i) => (
                  <div key={i} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-slate-900">{h.notes || (isAr ? 'حركة نقدية' : 'Cash Transaction')}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {h.date ? new Date(h.date).toLocaleString(isAr ? 'ar-EG' : 'en-US') : '—'} • {isAr ? 'سند:' : 'Ref:'} {h.voucherId}
                        {h.payrollMonth ? ` • ${isAr ? 'شهر الراتب:' : 'Month:'} ${h.payrollMonth}` : ''}
                        {h.installmentCount ? ` • ${h.installmentCount} ${isAr ? 'أقساط' : 'installments'}` : ''}
                      </div>

                      {/* Itemized expenses preview if present */}
                      {h.items && h.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {h.items.map((it, idx) => (
                            <div key={idx} className="text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 flex items-center justify-between">
                              <span>{it.title} {it.invoiceNumber ? `(${it.invoiceNumber})` : ''}</span>
                              <span className="font-mono font-bold">{Number(it.amount).toLocaleString()} ج.م</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Attachments preview if present in history record */}
                      {h.attachments && h.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {h.attachments.map((att, attIdx) => {
                            const attName = typeof att === 'string' ? `مستند ${attIdx + 1}` : (att.name || `مستند ${attIdx + 1}`);
                            return (
                              <button
                                key={attIdx}
                                type="button"
                                onClick={() => setSelectedAttachmentForView(att)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-[10px] text-slate-700 rounded-md font-medium transition cursor-pointer"
                                title={attName}
                              >
                                <Paperclip className="h-3 w-3 text-slate-400" />
                                <span className="truncate max-w-[120px]">{attName}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className={isAr ? 'sm:text-left text-right' : 'sm:text-right text-left'}>
                      <span className={`font-mono font-black text-sm ${
                        h.type?.includes('issue') ? 'text-amber-700' : 'text-emerald-700'
                      }`}>
                        {h.type?.includes('issue') ? `+${h.amount.toLocaleString()}` : `-${h.amount.toLocaleString()}`} {isAr ? 'ج.م' : 'EGP'}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {isAr ? 'الرصيد بعدها:' : 'Balance After:'} {h.custodyBalanceAfter !== undefined ? `${h.custodyBalanceAfter.toLocaleString()} ج.م` : '—'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer text-xs"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Fullscreen Viewer Modal */}
      {selectedAttachmentForView && (
        <AttachmentViewerModal
          attachment={selectedAttachmentForView}
          isOpen={Boolean(selectedAttachmentForView)}
          onClose={() => setSelectedAttachmentForView(null)}
        />
      )}

      {/* Custody/Advance Acknowledgment Printable Slip Modal */}
      {(isPrintingAck || Boolean(activePrintDocument)) && (
        <CustodyAcknowledgmentPrintSlip
          documentData={activePrintDocument || printDataForAck}
          onClose={() => {
            setIsPrintingAck(false);
            setActivePrintDocument(null);
          }}
          onPrintCompleted={() => {
            setHasPrinted(true);
            setActivePrintDocument(null);
          }}
        />
      )}

      {/* Edit Custody or Advance Modal */}
      {editModal.isOpen && (
        <EditCustodyModal
          item={editModal.item}
          isOpen={editModal.isOpen}
          onClose={() => setEditModal({ isOpen: false, item: null })}
          currentUser={currentUser}
          workersList={workersList}
          onSuccess={() => {
            setActionAlert({
              type: 'success',
              text: isAr
                ? 'تم حفظ التعديلات وتوثيق سجل المراجعة بنجاح ✓'
                : 'Record updated successfully with audit trail ✓'
            });
          }}
        />
      )}
    </div>
  );
}
