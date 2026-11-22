import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Vault,
  Wallet,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Scale,
  Settings,
  PlusCircle,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Receipt,
  FileText,
  UserCheck,
  ShieldCheck,
  ExternalLink,
  X,
  MoreVertical,
  Copy,
  Check,
  FileQuestion,
  FileImage,
  Paperclip,
  Eye,
  Edit,
  MessageSquare
} from 'lucide-react';
import { useRecordComments } from '../context/CommentContext.jsx';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  EGP_DENOMINATIONS,
  CASH_TRANSACTION_TYPES,
  MAIN_GL_ACCOUNTS,
  seedInitialSafesIfEmpty,
  reverseCashVoucher,
  confirmInterSafeTransfer,
  rejectInterSafeTransfer,
  canAuthorizeCashVoucher
} from '../utils/cashLedgerEngine.js';
import CashVoucherModal from './CashVoucherModal.jsx';
import { RowCommentButton } from './comments';
import CashChangeModal from './CashChangeModal.jsx';
import CashCountAuditModal from './CashCountAuditModal.jsx';
import CashVoucherPrintSlip from './CashVoucherPrintSlip.jsx';
import CustodiesAdvancesMaster from './CustodiesAdvancesMaster.jsx';
import DynamicSafeSettingsModal from './DynamicSafeSettingsModal.jsx';
import InterSafeTransferModal from './InterSafeTransferModal.jsx';
import VoucherAuditLogModal from './VoucherAuditLogModal.jsx';
import EditCashVoucherModal from './EditCashVoucherModal.jsx';
import AttachmentViewerModal from './AttachmentViewerModal.jsx';
import CashVoucherApprovalModal from './CashVoucherApprovalModal.jsx';
import { highlightTargetRow } from '../utils/notificationEngine.js';

/**
 * Visual Theme definitions for individual Safes to guarantee prominent, distinct aesthetics
 */
export const SAFE_THEMES = {
  blue: {
    colorKey: 'blue',
    tabActive: 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-950 text-white shadow-lg shadow-blue-900/40 border-blue-400 ring-2 ring-blue-400/50',
    tabInactive: 'bg-blue-50/70 text-blue-900 hover:bg-blue-100/80 border-blue-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-blue-200/60 text-blue-950',
    dot: 'bg-blue-400 ring-2 ring-blue-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 border-blue-700/60 shadow-2xl shadow-blue-950/60',
    heroOrb: 'from-blue-500/20 to-indigo-600/10',
    watermarkColor: 'text-blue-500/10',
    accentText: 'text-blue-400',
    tagBadge: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
    progressBar: 'bg-blue-500',
    breakdownIcon: 'text-blue-600',
    breakdownHeader: 'bg-blue-50/60 border-blue-200/80 text-blue-950',
    breakdownCardActive: 'bg-blue-50/50 border-blue-200/80',
    breakdownActiveValue: 'text-blue-700',
    accentRing: 'focus:ring-blue-500',
    safeBadge: 'bg-blue-600 text-white'
  },
  emerald: {
    colorKey: 'emerald',
    tabActive: 'bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-950 text-white shadow-lg shadow-emerald-900/40 border-emerald-400 ring-2 ring-emerald-400/50',
    tabInactive: 'bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/80 border-emerald-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-emerald-200/60 text-emerald-950',
    dot: 'bg-emerald-400 ring-2 ring-emerald-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-950 border-emerald-700/60 shadow-2xl shadow-emerald-950/60',
    heroOrb: 'from-emerald-500/20 to-teal-600/10',
    watermarkColor: 'text-emerald-500/10',
    accentText: 'text-emerald-400',
    tagBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
    progressBar: 'bg-emerald-500',
    breakdownIcon: 'text-emerald-600',
    breakdownHeader: 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950',
    breakdownCardActive: 'bg-emerald-50/50 border-emerald-200/80',
    breakdownActiveValue: 'text-emerald-700',
    accentRing: 'focus:ring-emerald-500',
    safeBadge: 'bg-emerald-600 text-white'
  },
  amber: {
    colorKey: 'amber',
    tabActive: 'bg-gradient-to-r from-amber-600 via-amber-700 to-orange-950 text-white shadow-lg shadow-amber-900/40 border-amber-400 ring-2 ring-amber-400/50',
    tabInactive: 'bg-amber-50/70 text-amber-900 hover:bg-amber-100/80 border-amber-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-amber-200/60 text-amber-950',
    dot: 'bg-amber-400 ring-2 ring-amber-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-amber-950 to-stone-900 border-amber-700/60 shadow-2xl shadow-amber-950/60',
    heroOrb: 'from-amber-500/20 to-orange-600/10',
    watermarkColor: 'text-amber-500/10',
    accentText: 'text-amber-400',
    tagBadge: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
    progressBar: 'bg-amber-500',
    breakdownIcon: 'text-amber-600',
    breakdownHeader: 'bg-amber-50/60 border-amber-200/80 text-amber-950',
    breakdownCardActive: 'bg-amber-50/50 border-amber-200/80',
    breakdownActiveValue: 'text-amber-700',
    accentRing: 'focus:ring-amber-500',
    safeBadge: 'bg-amber-600 text-white'
  },
  purple: {
    colorKey: 'purple',
    tabActive: 'bg-gradient-to-r from-purple-700 via-purple-800 to-indigo-950 text-white shadow-lg shadow-purple-900/40 border-purple-400 ring-2 ring-purple-400/50',
    tabInactive: 'bg-purple-50/70 text-purple-900 hover:bg-purple-100/80 border-purple-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-purple-200/60 text-purple-950',
    dot: 'bg-purple-400 ring-2 ring-purple-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 border-purple-700/60 shadow-2xl shadow-purple-950/60',
    heroOrb: 'from-purple-500/20 to-indigo-600/10',
    watermarkColor: 'text-purple-500/10',
    accentText: 'text-purple-400',
    tagBadge: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
    progressBar: 'bg-purple-500',
    breakdownIcon: 'text-purple-600',
    breakdownHeader: 'bg-purple-50/60 border-purple-200/80 text-purple-950',
    breakdownCardActive: 'bg-purple-50/50 border-purple-200/80',
    breakdownActiveValue: 'text-purple-700',
    accentRing: 'focus:ring-purple-500',
    safeBadge: 'bg-purple-600 text-white'
  },
  rose: {
    colorKey: 'rose',
    tabActive: 'bg-gradient-to-r from-rose-700 via-rose-800 to-slate-950 text-white shadow-lg shadow-rose-900/40 border-rose-400 ring-2 ring-rose-400/50',
    tabInactive: 'bg-rose-50/70 text-rose-900 hover:bg-rose-100/80 border-rose-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-rose-200/60 text-rose-900',
    dot: 'bg-rose-400 ring-2 ring-rose-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-rose-950 to-slate-900 border-rose-700/60 shadow-2xl shadow-rose-950/60',
    heroOrb: 'from-rose-500/20 to-pink-600/10',
    watermarkColor: 'text-rose-500/10',
    accentText: 'text-rose-400',
    tagBadge: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
    progressBar: 'bg-rose-500',
    breakdownIcon: 'text-rose-600',
    breakdownHeader: 'bg-rose-50/60 border-rose-200/80 text-rose-950',
    breakdownCardActive: 'bg-rose-50/50 border-rose-200/80',
    breakdownActiveValue: 'text-rose-700',
    accentRing: 'focus:ring-rose-500',
    safeBadge: 'bg-rose-600 text-white'
  },
  cyan: {
    colorKey: 'cyan',
    tabActive: 'bg-gradient-to-r from-cyan-700 via-teal-800 to-slate-950 text-white shadow-lg shadow-cyan-900/40 border-cyan-400 ring-2 ring-cyan-400/50',
    tabInactive: 'bg-cyan-50/70 text-cyan-900 hover:bg-cyan-100/80 border-cyan-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-cyan-200/60 text-cyan-950',
    dot: 'bg-cyan-400 ring-2 ring-cyan-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-900 border-cyan-700/60 shadow-2xl shadow-cyan-950/60',
    heroOrb: 'from-cyan-500/20 to-teal-600/10',
    watermarkColor: 'text-cyan-500/10',
    accentText: 'text-cyan-400',
    tagBadge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
    progressBar: 'bg-cyan-500',
    breakdownIcon: 'text-cyan-600',
    breakdownHeader: 'bg-cyan-50/60 border-cyan-200/80 text-cyan-950',
    breakdownCardActive: 'bg-cyan-50/50 border-cyan-200/80',
    breakdownActiveValue: 'text-cyan-700',
    accentRing: 'focus:ring-cyan-500',
    safeBadge: 'bg-cyan-600 text-white'
  }
};

export default function CashSafesMaster({
  currentUser,
  usersList = [],
  effectivePermissions = {},
  activeTab = 'cash_safes_hub',
  onSelectTab = () => {}
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [safesList, setSafesList] = useState([]);
  const [selectedSafeId, setSelectedSafeId] = useState(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const hp = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
      const sId = sp.get('safeId') || hp.get('safeId') || sp.get('safe') || hp.get('safe');
      if (sId) return sId;
      const sTab = sp.get('subTab') || hp.get('subTab') || sp.get('subtab') || hp.get('subtab');
      if (sTab && !['safes', 'custodies', 'custodies_advances', 'safes_hub'].includes(sTab)) {
        return sTab;
      }
    }
    return 'SAFE-01';
  });

  const [activeMainTab, setActiveMainTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const hp = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
      const sTab = sp.get('subTab') || hp.get('subTab') || sp.get('subtab') || hp.get('subtab');
      if (sTab === 'custodies' || sTab === 'custodies_advances' || activeTab === 'custodies_advances') {
        return 'custodies';
      }
    }
    return activeTab === 'custodies_advances' ? 'custodies' : 'safes';
  });

  useEffect(() => {
    if (activeTab === 'custodies_advances') {
      setActiveMainTab('custodies');
    } else if (activeTab === 'cash_safes_hub' || activeTab === 'safes_hub') {
      setActiveMainTab('safes');
    }
  }, [activeTab]);

  // Sync selectedSafeId and activeMainTab into URL hash query params so refresh / sharing returns to exact safe subtab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash || '#cash_safes';
    const [base, query] = raw.split('?');
    const params = new URLSearchParams(query || '');

    const mainHashTab = base && base !== '#' ? base : '#cash_safes';

    // The subTab is now the selected safe ID (e.g. SAFE-01, SAFE-02) or 'custodies'
    const targetSubTab = activeMainTab === 'custodies' ? 'custodies' : (selectedSafeId || 'SAFE-01');
    const currentSubTab = params.get('subTab') || params.get('subtab');
    const currentSafeId = params.get('safeId');

    let changed = false;

    if (currentSubTab !== targetSubTab) {
      params.set('subTab', targetSubTab);
      if (params.has('subtab')) params.delete('subtab');
      changed = true;
    }

    if (activeMainTab === 'safes') {
      const targetSafe = selectedSafeId || 'SAFE-01';
      if (currentSafeId !== targetSafe) {
        params.set('safeId', targetSafe);
        changed = true;
      }
    } else {
      if (params.has('safeId')) {
        params.delete('safeId');
        changed = true;
      }
    }

    if (!params.has('module')) {
      params.set('module', 'finance');
      changed = true;
    }

    if (changed) {
      const newHash = `${mainHashTab}?${params.toString()}`;
      window.history.replaceState(null, '', newHash);
    }
  }, [activeMainTab, selectedSafeId]);

  const { registerRowActions } = useRecordComments();

  // Live Data Collections
  const [transactionsList, setTransactionsList] = useState([]);
  const [custodyRecords, setCustodyRecords] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [workersList, setWorkersList] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [accountingLinks, setAccountingLinks] = useState(null);
  const [chartAccounts, setChartAccounts] = useState([]);

  // Modals state
  const [voucherModal, setVoucherModal] = useState({ isOpen: false, initialType: 'disbursement' });
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState(null);
  const [selectedVoucherForAudit, setSelectedVoucherForAudit] = useState(null);
  const [selectedVoucherForEdit, setSelectedVoucherForEdit] = useState(null);
  const [selectedAttachmentForView, setSelectedAttachmentForView] = useState(null);
  const [hoveredAttachmentInfo, setHoveredAttachmentInfo] = useState(null); // { att, rect, isImg, isPdf, url, name }
  const [treasuryConfig, setTreasuryConfig] = useState(null);
  const [approvalModal, setApprovalModal] = useState({ isOpen: false, voucher: null, initialMode: 'approve' });

  // Viewport-aware position helper for floating attachment preview
  const getTooltipStyle = (rect) => {
    if (!rect) return { display: 'none' };
    const width = 160;
    let left = rect.left + rect.width / 2 - width / 2;
    if (left < 16) left = 16;
    if (left + width > window.innerWidth - 16) {
      left = window.innerWidth - width - 16;
    }

    const spaceAbove = rect.top;
    if (spaceAbove < 170) {
      // Flip below icon
      return {
        top: `${rect.bottom + 8}px`,
        left: `${left}px`,
        width: `${width}px`,
      };
    } else {
      // Show above icon
      return {
        bottom: `${window.innerHeight - rect.top + 8}px`,
        left: `${left}px`,
        width: `${width}px`,
      };
    }
  };

  // Close floating attachment hover popover on scroll or window resize
  useEffect(() => {
    const handleDismissHover = () => {
      if (hoveredAttachmentInfo) {
        setHoveredAttachmentInfo(null);
      }
    };
    window.addEventListener('scroll', handleDismissHover, true);
    window.addEventListener('resize', handleDismissHover);
    return () => {
      window.removeEventListener('scroll', handleDismissHover, true);
      window.removeEventListener('resize', handleDismissHover);
    };
  }, [hoveredAttachmentInfo]);

  // Table row actions & copy state
  const [activeActionsMenuTxId, setActiveActionsMenuTxId] = useState(null);
  const [copiedTxId, setCopiedTxId] = useState(null);

  // Close actions menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.actions-menu-container')) {
        setActiveActionsMenuTxId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleCopyTxId = (e, txId) => {
    e.stopPropagation();
    if (!txId) return;
    navigator.clipboard.writeText(txId);
    setCopiedTxId(txId);
    setTimeout(() => {
      setCopiedTxId((curr) => (curr === txId ? null : curr));
    }, 2000);
  };

  // Table filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Reversal dialog state
  const [reversalDialog, setReversalDialog] = useState({ isOpen: false, voucher: null, reason: '' });
  const [isReversing, setIsReversing] = useState(false);

  // Handle QR code deep link or navigation to focus on a specific transaction
  useEffect(() => {
    const handleFocusTransaction = (e) => {
      const { voucherId, recordId, safeId, subTab } = e.detail || {};
      if (safeId) setSelectedSafeId(safeId);
      if (subTab === 'custodies' || subTab === 'custodies_advances' || recordId) {
        setActiveMainTab('custodies');
      } else if (subTab) {
        setActiveMainTab('safes');
        if (!['safes', 'custodies', 'custodies_advances', 'safes_hub'].includes(subTab) && !safeId) {
          setSelectedSafeId(subTab);
        }
      }
      if (voucherId) {
        setActiveMainTab('safes');
        setSearchQuery(voucherId);
        setTimeout(() => highlightTargetRow(voucherId), 500);
      }
    };

    const parseUrlRoute = () => {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams(window.location.search);
      const hp = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
      const vId = sp.get('voucherId') || hp.get('voucherId');
      const rId = sp.get('recordId') || hp.get('recordId') || sp.get('id') || hp.get('id');
      const sId = sp.get('safeId') || hp.get('safeId') || sp.get('safe') || hp.get('safe');
      const sTab = sp.get('subTab') || hp.get('subTab') || sp.get('subtab') || hp.get('subtab');

      if (sId) {
        setSelectedSafeId(sId);
      } else if (sTab && !['safes', 'custodies', 'custodies_advances', 'safes_hub'].includes(sTab)) {
        setSelectedSafeId(sTab);
      }

      if (sTab === 'custodies' || sTab === 'custodies_advances' || rId) {
        setActiveMainTab('custodies');
      } else if (sTab || sId || vId) {
        setActiveMainTab('safes');
      }

      if (vId) {
        setSearchQuery(vId);
        setTimeout(() => highlightTargetRow(vId), 600);
      }
    };

    parseUrlRoute();
    window.addEventListener('hashchange', parseUrlRoute);
    window.addEventListener('popstate', parseUrlRoute);
    window.addEventListener('app_focus_transaction', handleFocusTransaction);
    return () => {
      window.removeEventListener('hashchange', parseUrlRoute);
      window.removeEventListener('popstate', parseUrlRoute);
      window.removeEventListener('app_focus_transaction', handleFocusTransaction);
    };
  }, []);

  // 1. Initial Seeding and Live Safes Subscription
  useEffect(() => {
    seedInitialSafesIfEmpty().catch(() => {});

    const unsubSafes = onSnapshot(collection(db, 'cash_safes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setSafesList(list);
      if (list.length > 0) {
        setSelectedSafeId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list[0].id;
        });
      }
    });

    const unsubCustodies = onSnapshot(collection(db, 'custody_ledger'), (snap) => {
      setCustodyRecords(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubWorkers = onSnapshot(collection(db, 'employees'), (snap) => {
      setWorkersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClientsList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubLinks = onSnapshot(doc(db, 'system_config', 'accounting_links'), (snap) => {
      if (snap.exists()) {
        setAccountingLinks(snap.data());
      }
    });

    const unsubCoa = onSnapshot(collection(db, 'chart_of_accounts'), (snap) => {
      setChartAccounts(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTreasury = onSnapshot(doc(db, 'system_config', 'treasury_settings'), (snap) => {
      if (snap.exists()) setTreasuryConfig(snap.data());
    });

    return () => {
      unsubSafes();
      unsubCustodies();
      unsubSuppliers();
      unsubWorkers();
      unsubClients();
      unsubLinks();
      unsubCoa();
      unsubTreasury();
    };
  }, []);

  // 2. Live Transactions Subscription for Active Safe (captures both source & target transfers)
  const [isSafeTxLoaded, setIsSafeTxLoaded] = useState(false);
  useEffect(() => {
    if (!selectedSafeId) return;
    setIsSafeTxLoaded(false);
    let sourceDocs = {};
    let targetDocs = {};
    let sourceReady = false;
    let targetReady = false;

    const mergeAndSet = () => {
      const merged = { ...sourceDocs, ...targetDocs };
      const list = Object.values(merged).sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
      setTransactionsList(list);
      if (sourceReady && targetReady) {
        setIsSafeTxLoaded(true);
      }
    };

    const qSource = query(
      collection(db, 'cash_transactions'),
      where('safeId', '==', selectedSafeId)
    );
    const unsubSource = onSnapshot(qSource, (snap) => {
      sourceDocs = {};
      snap.docs.forEach((d) => {
        sourceDocs[d.id] = { id: d.id, ...d.data() };
      });
      sourceReady = true;
      mergeAndSet();
    });

    const qTarget = query(
      collection(db, 'cash_transactions'),
      where('targetSafeId', '==', selectedSafeId)
    );
    const unsubTarget = onSnapshot(qTarget, (snap) => {
      targetDocs = {};
      snap.docs.forEach((d) => {
        targetDocs[d.id] = { id: d.id, ...d.data() };
      });
      targetReady = true;
      mergeAndSet();
    });

    return () => {
      unsubSource();
      unsubTarget();
    };
  }, [selectedSafeId]);

  // Active Safe Resolver
  const activeSafe = useMemo(() => {
    return safesList.find((s) => s.id === selectedSafeId) || safesList[0];
  }, [safesList, selectedSafeId]);

  // Chronological Ledger Reconciliation & Self-Healing for Active Safe
  useEffect(() => {
    if (!isSafeTxLoaded || !activeSafe || activeSafe.id !== selectedSafeId) return;

    const zeroDenoms = { '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, '0.5': 0 };
    const chronological = [...transactionsList].sort(
      (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    );

    let runningBal = 0;
    let runningDenoms = { ...zeroDenoms };

    chronological.forEach((tx) => {
      if (['cancelled', 'reversed', 'rejected', 'draft', 'pending_approval'].includes(tx.status)) {
        return;
      }
      const amt = Math.abs(Number(tx.amountInEGP ?? tx.amount ?? 0));
      const txDenoms = tx.denominations || {};

      if (tx.type === 'safe_transfer') {
        const isSource = tx.safeId === selectedSafeId || tx.sourceSafeId === selectedSafeId;
        const isTarget = tx.targetSafeId === selectedSafeId;

        if (isSource && (tx.status === 'posted' || tx.status === 'pending_receiver_approval')) {
          runningBal = Math.max(0, Number((runningBal - amt).toFixed(2)));
          EGP_DENOMINATIONS.forEach((d) => {
            const c = Number(txDenoms[d]) || 0;
            runningDenoms[d] = Math.max(0, (Number(runningDenoms[d]) || 0) - c);
          });
          if (Math.abs((Number(tx.balanceAfter) || 0) - runningBal) > 0.005) {
            updateDoc(doc(db, 'cash_transactions', tx.id), { balanceAfter: runningBal }).catch(() => {});
          }
        } else if (isTarget && tx.status === 'posted') {
          runningBal = Number((runningBal + amt).toFixed(2));
          EGP_DENOMINATIONS.forEach((d) => {
            const c = Number(txDenoms[d]) || 0;
            runningDenoms[d] = Math.max(0, (Number(runningDenoms[d]) || 0) + c);
          });
          if (Math.abs((Number(tx.targetBalanceAfter) || 0) - runningBal) > 0.005) {
            updateDoc(doc(db, 'cash_transactions', tx.id), { targetBalanceAfter: runningBal }).catch(() => {});
          }
        }
        return;
      }

      if (tx.status !== 'posted') return;

      if (tx.type === 'change_exchange') {
        const outNotes = tx.changeExchangeDetails?.notesGivenOut || {};
        const inNotes = tx.changeExchangeDetails?.notesTakenIn || txDenoms || {};
        EGP_DENOMINATIONS.forEach((d) => {
          const outC = Number(outNotes[d]) || 0;
          const inC = Number(inNotes[d]) || 0;
          runningDenoms[d] = Math.max(0, (Number(runningDenoms[d]) || 0) - outC + inC);
        });
        return;
      }

      if (tx.type === 'balance_adjustment') {
        const signed = tx.direction === 'in' ? amt : -amt;
        runningBal = Math.max(0, Number((runningBal + signed).toFixed(2)));
        if (txDenoms && Object.keys(txDenoms).length > 0) {
          runningDenoms = { ...zeroDenoms };
          EGP_DENOMINATIONS.forEach((d) => {
            runningDenoms[d] = Math.max(0, Number(txDenoms[d]) || 0);
          });
        }
        return;
      }

      const isOut = tx.direction === 'out';
      const isIn = tx.direction === 'in';
      runningBal = Math.max(0, Number((isOut ? runningBal - amt : isIn ? runningBal + amt : runningBal).toFixed(2)));
      EGP_DENOMINATIONS.forEach((d) => {
        const c = Number(txDenoms[d]) || 0;
        if (isOut) {
          runningDenoms[d] = Math.max(0, (Number(runningDenoms[d]) || 0) - c);
        } else if (isIn) {
          runningDenoms[d] = Math.max(0, (Number(runningDenoms[d]) || 0) + c);
        }
      });

      if (Math.abs((Number(tx.balanceAfter) || 0) - runningBal) > 0.005) {
        updateDoc(doc(db, 'cash_transactions', tx.id), { balanceAfter: runningBal }).catch(() => {});
      }
    });

    const egpBal = Number(activeSafe.balances?.EGP?.currentBalance || 0);
    const hasStaleDenoms = Object.values(activeSafe.balances?.EGP?.denominations || {}).some(
      (v) => Number(v) !== 0
    );

    if (Math.abs(egpBal - runningBal) > 0.005 || (runningBal === 0 && hasStaleDenoms)) {
      updateDoc(doc(db, 'cash_safes', activeSafe.id), {
        'balances.EGP.currentBalance': runningBal,
        'balances.EGP.denominations': runningDenoms,
        currentBalance: runningBal,
        balance: runningBal,
        denominations: runningDenoms
      }).catch(() => {});
    }
  }, [isSafeTxLoaded, transactionsList, activeSafe, selectedSafeId]);

  // Two-Party Transfer Handshake State & Helper Memos
  const [transferHandshakeModal, setTransferHandshakeModal] = useState({
    isOpen: false,
    transfer: null,
    mode: 'confirm', // 'confirm' | 'reject'
    rejectReason: '',
    isSubmitting: false
  });

  const pendingIncomingTransfers = useMemo(() => {
    return transactionsList.filter(
      (tx) =>
        tx.type === 'safe_transfer' &&
        tx.targetSafeId === activeSafe?.id &&
        tx.status === 'pending_receiver_approval'
    );
  }, [transactionsList, activeSafe]);

  const pendingOutgoingTransfers = useMemo(() => {
    return transactionsList.filter(
      (tx) =>
        tx.type === 'safe_transfer' &&
        (tx.sourceSafeId === activeSafe?.id || tx.safeId === activeSafe?.id) &&
        tx.status === 'pending_receiver_approval'
    );
  }, [transactionsList, activeSafe]);

  const canConfirmTransfer = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isGeneralAdmin || currentUser.role === 'general_admin') return true;
    if (activeSafe?.responsibleUserId && activeSafe.responsibleUserId === currentUser.id) return true;
    if (activeSafe?.authorizerUserId && activeSafe.authorizerUserId === currentUser.id) return true;
    return false;
  }, [currentUser, activeSafe]);

  // Distinct Theme for Selected Safe
  const safeTheme = SAFE_THEMES[activeSafe?.color] || SAFE_THEMES.blue;

  const activeWallet = activeSafe?.balances?.EGP || { currentBalance: 0, denominations: {} };
  const currentSafeBal = Number(activeWallet.currentBalance) || 0;
  const currentSafeDenoms = activeWallet.denominations || {};
  const maxLimit = Number(activeSafe?.maxSafetyLimit) || 100000;
  const limitPercentage = Math.min(100, Math.round((currentSafeBal / maxLimit) * 100));
  const isNearLimit = limitPercentage >= 80;
  const isOverLimit = currentSafeBal > maxLimit;

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactionsList.filter((tx) => {
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterAccount !== 'all' && tx.mainAccount !== filterAccount) return false;
      if (filterStatus !== 'all' && tx.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const desc = (tx.description || '').toLowerCase();
        const id = (tx.id || '').toLowerCase();
        const sub = (tx.subAccountName || '').toLowerCase();
        const by = (tx.issuedByName || '').toLowerCase();
        const srcSafe = (tx.sourceSafeNameAr || tx.sourceSafeNameEn || '').toLowerCase();
        const tgtSafe = (tx.targetSafeNameAr || tx.targetSafeNameEn || '').toLowerCase();
        return desc.includes(q) || id.includes(q) || sub.includes(q) || by.includes(q) || srcSafe.includes(q) || tgtSafe.includes(q);
      }
      return true;
    });
  }, [transactionsList, filterType, filterAccount, filterStatus, searchQuery]);

  // Dynamic accounts present in current transactions list for ledger table filter
  const availableAccountsForFilter = useMemo(() => {
    const accountKeys = new Set();
    transactionsList.forEach((tx) => {
      if (tx.mainAccount) accountKeys.add(String(tx.mainAccount).trim());
    });
    return Array.from(accountKeys).map((code) => {
      const match = chartAccounts.find((a) => String(a.code || a.id).trim() === code);
      const name = match ? (isAr ? match.nameAr : (match.nameEn || match.nameAr)) : code;
      return {
        value: code,
        label: `[${code}] ${name}`
      };
    });
  }, [transactionsList, chartAccounts, isAr]);

  // Handle Transfer Receipt Confirmation
  const handleExecuteConfirmTransfer = async () => {
    const tr = transferHandshakeModal.transfer;
    if (!tr) return;
    setTransferHandshakeModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await confirmInterSafeTransfer({
        voucherId: tr.id,
        currentUser
      });
      setTransferHandshakeModal({ isOpen: false, transfer: null, mode: 'confirm', rejectReason: '', isSubmitting: false });
    } catch (err) {
      alert(err.message || (isAr ? 'فشل تأكيد الاستلام' : 'Failed to confirm receipt'));
      setTransferHandshakeModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Handle Transfer Rejection
  const handleExecuteRejectTransfer = async () => {
    const tr = transferHandshakeModal.transfer;
    if (!tr) return;
    if (!transferHandshakeModal.rejectReason.trim()) {
      alert(isAr ? 'يرجى كتابة سبب رفض الاستلام' : 'Please provide a reason for rejecting the transfer');
      return;
    }
    setTransferHandshakeModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await rejectInterSafeTransfer({
        voucherId: tr.id,
        reason: transferHandshakeModal.rejectReason.trim(),
        currentUser
      });
      setTransferHandshakeModal({ isOpen: false, transfer: null, mode: 'confirm', rejectReason: '', isSubmitting: false });
    } catch (err) {
      alert(err.message || (isAr ? 'فشل رفض التحويل' : 'Failed to reject transfer'));
      setTransferHandshakeModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Handle Voucher Reversal
  const handleConfirmReversal = async () => {
    if (!reversalDialog.voucher) return;
    if (!reversalDialog.reason.trim()) {
      alert(isAr ? 'يرجى تدوين سبب إلغاء وعكس السند المالي' : 'Please provide a justification for voiding/reversing this voucher.');
      return;
    }
    setIsReversing(true);
    try {
      await reverseCashVoucher({
        voucherId: reversalDialog.voucher.id,
        reason: reversalDialog.reason,
        currentUser
      });
      setReversalDialog({ isOpen: false, voucher: null, reason: '' });
    } catch (err) {
      alert(err.message || (isAr ? 'فشل إلغاء السند' : 'Failed to reverse voucher'));
    } finally {
      setIsReversing(false);
    }
  };

  const custodianName = useMemo(() => {
    if (!activeSafe) return '';
    const user = usersList.find((u) => u.id === activeSafe.responsibleUserId);
    if (!user) return activeSafe.responsibleUserId || '';
    return isAr ? (user.nameAr || user.name || user.id) : (user.name || user.nameAr || user.id);
  }, [activeSafe, usersList, isAr]);

  return (
    <div className={`space-y-6 font-sans ${isAr ? 'text-right' : 'text-left'}`}>
      {/* Top Header & Navigation Tabs */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Main Safes Tabs with Explicit Visual Coded Color Differentiation */}
          {safesList.map((safe) => {
            const isSelected = activeMainTab === 'safes' && selectedSafeId === safe.id;
            const theme = SAFE_THEMES[safe.color] || SAFE_THEMES.blue;
            const safeName = isAr ? safe.nameAr : (safe.nameEn || safe.nameAr);
            const safeBal = (safe.balances?.EGP?.currentBalance || 0).toLocaleString();

            return (
              <button
                key={safe.id}
                type="button"
                onClick={() => {
                  setSelectedSafeId(safe.id);
                  setActiveMainTab('safes');
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-extrabold text-xs transition cursor-pointer shrink-0 border ${
                  isSelected ? theme.tabActive : theme.tabInactive
                }`}
                title={safeName}
              >
                <div className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
                <span className="truncate max-w-[150px]">{safeName}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                  isSelected ? theme.tabBadgeActive : theme.tabBadgeInactive
                }`}>
                  {safeBal} {isAr ? 'ج' : 'EGP'}
                </span>
              </button>
            );
          })}

          <div className="h-6 w-px bg-slate-200 mx-1 shrink-0" />

          {/* Custodies & Advances Hub Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveMainTab('custodies');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-extrabold text-xs transition cursor-pointer shrink-0 border ${
              activeMainTab === 'custodies'
                ? 'bg-gradient-to-r from-amber-700 via-amber-800 to-amber-950 text-white shadow-md shadow-amber-900/30 border-amber-500 ring-2 ring-amber-400/40'
                : 'bg-amber-50/60 text-amber-900 hover:bg-amber-100/80 border-amber-200'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>
              {isAr ? `سجل العهد والسلف (${custodyRecords.length})` : `Custodies & Advances (${custodyRecords.length})`}
            </span>
          </button>
        </div>

      </div>

      {/* VIEW 1: Active Safe Dashboard & Ledger */}
      {activeMainTab === 'safes' && activeSafe && (
        <div className="space-y-6">
          {/* 1. Safe Hero Balance & Quick Actions Bar — Visually Themed to the Selected Safe */}
          <div className={`${safeTheme.heroGradient} rounded-3xl p-6 sm:p-7 text-white shadow-xl relative overflow-hidden transition-all duration-300`}>
            {/* Background Aesthetic Watermark & Glowing Orb */}
            <div className={`absolute ${isAr ? 'left-6' : 'right-6'} top-1/2 -translate-y-1/2 opacity-10 pointer-events-none transition-colors`}>
              <Vault className={`h-64 w-64 ${safeTheme.watermarkColor}`} />
            </div>
            <div className={`absolute -right-20 -bottom-20 w-80 h-80 rounded-full blur-3xl pointer-events-none bg-gradient-to-tr ${safeTheme.heroOrb}`} />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Balance & Safe Identity */}
              <div>
                <div className="flex flex-wrap items-center gap-2 text-slate-300 text-xs mb-1.5 font-medium">
                  <span className="font-extrabold text-white text-sm">
                    {isAr ? activeSafe.nameAr : (activeSafe.nameEn || activeSafe.nameAr)}
                  </span>
                  <span>•</span>
                  <span className={`font-mono text-xs px-2 py-0.5 rounded-md border ${safeTheme.tagBadge}`}>
                    {activeSafe.id}
                  </span>
                  <span>•</span>
                  <span className="text-slate-300">
                    {isAr ? 'أمين الخزينة:' : 'Vault Custodian:'}{' '}
                    <strong className="text-white font-bold">{custodianName}</strong>
                  </span>
                </div>

                  <div className="flex items-center gap-3 my-2">
                    <span className="text-4xl md:text-5xl font-black font-mono tracking-tight text-white drop-shadow-sm">
                      {currentSafeBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-base sm:text-lg font-black ${safeTheme.accentText}`}>
                      {isAr ? 'جنيه مصري (EGP)' : 'Egyptian Pound (EGP)'}
                    </span>
                    <RowCommentButton
                      docId={activeSafe.id}
                      docNumber={isAr ? activeSafe.nameAr : (activeSafe.nameEn || activeSafe.nameAr)}
                      tab="cash_safes"
                      module="finance"
                    />
                  </div>

                {/* Safety Ceiling Limit Progress Bar */}
                <div className="mt-3.5 max-w-md">
                  <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                    <span>{isAr ? 'نسبة الإشغال من حد الأمان:' : 'Safety Limit Utilization:'}</span>
                    <span className="font-mono font-bold text-white">
                      {limitPercentage}% ({currentSafeBal.toLocaleString()} / {maxLimit.toLocaleString()} {isAr ? 'ج.م' : 'EGP'})
                    </span>
                  </div>
                  <div className="w-full bg-slate-800/90 rounded-full h-2 overflow-hidden border border-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverLimit ? 'bg-rose-500' : isNearLimit ? 'bg-amber-400' : safeTheme.progressBar
                      }`}
                      style={{ width: `${limitPercentage}%` }}
                    />
                  </div>
                  {isOverLimit && (
                    <span className="text-[11px] text-rose-300 font-bold mt-1.5 flex items-center gap-1.5 bg-rose-950/50 px-2 py-1 rounded-lg border border-rose-800/40">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      <span>
                        {isAr
                          ? 'تنبيه: تجاوزت النقدية بالخزينة حد الأمان الأقصى! يرجى توريد الفائض للبنك.'
                          : 'Warning: Safe balance exceeds max safety limit! Please deposit surplus to bank.'}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Action Triggers: Primary Prominent Inflow/Outflow + Smaller Secondary Operations Beneath */}
              <div className="flex flex-col gap-2 shrink-0">
                {/* 1. Primary Prominent Buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Disbursement Button */}
                  <button
                    type="button"
                    onClick={() => setVoucherModal({ isOpen: true, initialType: 'disbursement' })}
                    className="flex items-center justify-center p-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-2xl font-black text-xs sm:text-sm transition cursor-pointer shadow-lg shadow-rose-950/40 hover:shadow-rose-600/40 gap-2 border border-rose-400/30 active:scale-98"
                  >
                    <ArrowUpRight className="h-5 w-5 shrink-0" />
                    <span>{isAr ? '+ سند صرف نقدية' : '+ Disbursement'}</span>
                  </button>

                  {/* Cash Receipt Button */}
                  <button
                    type="button"
                    onClick={() => setVoucherModal({ isOpen: true, initialType: 'collection' })}
                    className="flex items-center justify-center p-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-2xl font-black text-xs sm:text-sm transition cursor-pointer shadow-lg shadow-emerald-950/40 hover:shadow-emerald-600/40 gap-2 border border-emerald-400/30 active:scale-98"
                  >
                    <ArrowDownLeft className="h-5 w-5 shrink-0" />
                    <span>{isAr ? '+ سند تحصيل نقدية' : '+ Cash Receipt'}</span>
                  </button>
                </div>

                {/* 2. Secondary Non-Prominent Internal Operations (Beneath primary buttons, smaller in size) */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
                  {/* Inter-Safe Transfer */}
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(true)}
                    className="flex-1 flex items-center justify-center py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 hover:text-white rounded-xl font-bold text-[11px] transition cursor-pointer gap-1.5 border border-slate-700 hover:border-slate-500 shadow-xs"
                    title={isAr ? 'تحويل نقدية بين الخزائن' : 'Inter-Safe Cash Transfer'}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{isAr ? 'تحويل بين الخزائن' : 'Safe Transfer'}</span>
                  </button>

                  {/* Change Exchange */}
                  <button
                    type="button"
                    onClick={() => setIsChangeModalOpen(true)}
                    className="flex-1 flex items-center justify-center py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 hover:text-white rounded-xl font-bold text-[11px] transition cursor-pointer gap-1.5 border border-slate-700 hover:border-slate-500 shadow-xs"
                    title={isAr ? 'عملية فكة وتظبيط فئات' : 'Change Exchange'}
                  >
                    <Coins className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{isAr ? 'فكة وتظبيط' : 'Change Notes'}</span>
                  </button>

                  {/* Physical Count & Adjust */}
                  <button
                    type="button"
                    onClick={() => setIsAuditModalOpen(true)}
                    className="flex-1 flex items-center justify-center py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 hover:text-white rounded-xl font-bold text-[11px] transition cursor-pointer gap-1.5 border border-slate-700 hover:border-slate-500 shadow-xs"
                    title={isAr ? 'جرد فعلي وتظبيط رصيد الخزينة' : 'Audit & Reconcile'}
                  >
                    <Scale className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">{isAr ? 'جرد وتظبيط' : 'Reconcile'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Incoming Transfers Handshake Banner */}
          {pendingIncomingTransfers.length > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-400/80 rounded-2xl p-4 shadow-md space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                    <ArrowLeftRight className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-amber-950 flex items-center gap-2">
                      <span>{isAr ? 'تحويلات نقدية واردة بانتظار استلامك واعتمادك' : 'Incoming Transfers Awaiting Receipt Confirmation'}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-200/80 text-amber-900 border border-amber-300">
                        {pendingIncomingTransfers.length}
                      </span>
                    </h4>
                    <p className="text-xs text-amber-800/90 font-medium">
                      {isAr
                        ? 'تم خصم النقدية من الخزينة المصدر وبانتظار عد الفئات وتأكيد الاستلام لإيداعها في رصيد هذه الخزينة'
                        : 'Cash has been dispatched from source vault. Verify note counts and confirm receipt to credit this vault.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* List of Incoming Transfers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {pendingIncomingTransfers.map((tr) => (
                  <div
                    key={tr.id}
                    id={tr.id}
                    className="bg-white rounded-xl p-3.5 border border-amber-200/90 shadow-xs flex flex-col justify-between gap-3 hover:border-amber-400 transition"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-500">{tr.id}</span>
                          <h5 className="font-bold text-sm text-slate-900 mt-0.5">
                            {isAr ? `من: ${tr.sourceSafeNameAr || tr.sourceSafeId}` : `From: ${tr.sourceSafeNameEn || tr.sourceSafeId}`}
                          </h5>
                        </div>
                        <div className="text-end">
                          <span className="text-base font-black font-mono text-emerald-700">
                            {Number(tr.amount).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                          </span>
                        </div>
                      </div>

                      {/* Denominations Pill Breakdown */}
                      {tr.denominations && Object.keys(tr.denominations).some((k) => Number(tr.denominations[k]) !== 0) && (
                        <div className="flex flex-wrap gap-1 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] font-mono">
                          {Object.entries(tr.denominations)
                            .filter(([_, count]) => Number(count) !== 0)
                            .map(([denom, count]) => {
                              const numCount = Number(count) || 0;
                              const isNegative = numCount < 0;
                              return (
                                <span
                                  key={denom}
                                  className={`px-1.5 py-0.5 rounded border text-[11px] ${
                                    isNegative
                                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  {denom}ج × {numCount}{isNegative ? (isAr ? ' (فكة)' : ' (chg)') : ''}
                                </span>
                              );
                            })}
                        </div>
                      )}

                      {tr.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">{tr.description}</p>
                      )}

                      <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                        <span>{isAr ? 'المرسل:' : 'Sender:'} {tr.initiatedByName || tr.issuedByName || '—'}</span>
                        <span className="font-mono">{tr.createdAt ? tr.createdAt.slice(0, 16).replace('T', ' ') : ''}</span>
                      </div>
                    </div>

                    {/* Confirmation / Rejection Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-amber-100">
                      <button
                        type="button"
                        disabled={!canConfirmTransfer}
                        onClick={() =>
                          setTransferHandshakeModal({
                            isOpen: true,
                            transfer: tr,
                            mode: 'confirm',
                            rejectReason: '',
                            isSubmitting: false
                          })
                        }
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{isAr ? 'تأكيد واستلام النقدية' : 'Confirm & Receive'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canConfirmTransfer}
                        onClick={() =>
                          setTransferHandshakeModal({
                            isOpen: true,
                            transfer: tr,
                            mode: 'reject',
                            rejectReason: '',
                            isSubmitting: false
                          })
                        }
                        className="flex items-center justify-center gap-1 py-2 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isAr ? 'رفض وإعادة للخزينة المصدر' : 'Reject & Return'}
                      >
                        <X className="h-4 w-4" />
                        <span>{isAr ? 'رفض' : 'Reject'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Outgoing Transfers Status Strip */}
          {pendingOutgoingTransfers.length > 0 && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2 text-blue-900 font-bold">
                <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                <span>
                  {isAr
                    ? `يوجد ${pendingOutgoingTransfers.length} تحويل صادر من هذه الخزينة تم خصمه وبانتظار استلام واعتماد الخزينة المستلمة.`
                    : `${pendingOutgoingTransfers.length} outgoing transfer(s) dispatched and awaiting target custodian confirmation.`}
                </span>
              </div>
              <span className="font-mono font-black text-blue-800">
                {pendingOutgoingTransfers.reduce((sum, t) => sum + (Number(t.amount) || 0), 0).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
              </span>
            </div>
          )}

          {/* 2. Real-Time Banknote Inventory Grid */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Coins className={`h-5 w-5 ${safeTheme.breakdownIcon}`} />
                <h4 className="font-extrabold text-sm text-slate-800">
                  {isAr ? 'جرد الفئات النقدية الحالية بالخزينة (Banknote Breakdown)' : 'Current Banknote Breakdown in Vault'}
                </h4>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                {isAr ? 'تحديث لحظي مع كل حركة' : 'Real-time ledger balance'}
              </span>
            </div>

            <div className="grid grid-cols-4 md:grid-cols-8 gap-2.5">
              {EGP_DENOMINATIONS.map((denom) => {
                const count = Number(currentSafeDenoms[denom]) || 0;
                const totalValue = count * denom;
                return (
                  <div
                    key={denom}
                    className={`rounded-2xl p-3 border text-center transition flex flex-col justify-between ${
                      count > 0 ? safeTheme.breakdownCardActive : 'bg-slate-50/40 border-slate-100 opacity-60'
                    }`}
                  >
                    <div className="text-xs font-black text-slate-700">
                      {denom} {isAr ? 'ج.م' : 'EGP'}
                    </div>
                    <div className="my-1.5">
                      <span className="text-lg font-black font-mono text-slate-900 block leading-none">
                        {count.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isAr ? 'ورقة نقدية' : 'Bills'}
                      </span>
                    </div>
                    <div className={`text-[11px] font-mono font-bold ${count > 0 ? safeTheme.breakdownActiveValue : 'text-slate-400'} border-t border-slate-200/60 pt-1`}>
                      {totalValue.toLocaleString()} {isAr ? 'ج' : 'EGP'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Chronological Transactions Stream Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-slate-700" />
                <h4 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'سجل وحركات الخزينة الدفترية (Transactions Ledger)' : 'Transactions Ledger Stream'}
                </h4>
                <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-bold">
                  {filteredTransactions.length} {isAr ? 'حركة' : 'Records'}
                </span>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {/* Search Input */}
                <div className="relative flex-1 md:w-56">
                  <Search className={`h-3.5 w-3.5 absolute ${isAr ? 'right-3' : 'left-3'} top-2.5 text-slate-400`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isAr ? 'بحث برقم السند، البيان، المستفيد...' : 'Search voucher #, payee, note...'}
                    className={`w-full ${isAr ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900`}
                  />
                </div>

                {/* Filter by Type */}
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-700 cursor-pointer"
                >
                  <option value="all">{isAr ? 'كافة أنواع الحركات' : 'All Transaction Types'}</option>
                  {CASH_TRANSACTION_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{isAr ? t.labelAr : t.labelEn}</option>
                  ))}
                </select>

                {/* Filter by GL Account */}
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-700 cursor-pointer"
                >
                  <option value="all">{isAr ? 'كافة حسابات الأستاذ' : 'All Ledger Accounts'}</option>
                  {availableAccountsForFilter.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pending Approval Callout Banner */}
            {(() => {
              const pendingVouchers = transactionsList.filter((tx) => tx.status === 'pending_approval');
              if (pendingVouchers.length === 0) return null;
              const canAuth = canAuthorizeCashVoucher({ safe: activeSafe, currentUser, treasuryConfig }).canAuthorize;
              return (
                <div className="mb-4 p-3.5 bg-gradient-to-r from-amber-50 via-amber-100/60 to-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-amber-950 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="font-extrabold text-sm text-amber-950 block">
                        {isAr
                          ? `يوجد (${pendingVouchers.length}) سند معلق بانتظار الاعتماد المالي في هذه الخزينة`
                          : `There are (${pendingVouchers.length}) vouchers awaiting financial authorization in this safe`}
                      </span>
                      <span className="text-[11px] text-amber-800 font-normal">
                        {isAr
                          ? 'يمكن اعتماد وصرف السند بواسطة معتمد الخزينة أو المعتمدين العموميين أو المسؤول العام.'
                          : 'Can be authorized by safe authorizer, general authorizers, or general admin.'}
                      </span>
                    </div>
                  </div>
                  {canAuth && (
                    <button
                      type="button"
                      onClick={() => setApprovalModal({ isOpen: true, voucher: pendingVouchers[0], initialMode: 'approve' })}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{isAr ? 'مراجعة واعتماد السند' : 'Review & Authorize'}</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Table */}
            <div className="border border-slate-200 rounded-2xl overflow-x-auto min-h-[320px] pb-16">
              <table className={`w-full text-xs ${isAr ? 'text-right' : 'text-left'}`}>
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="py-3 px-3">{isAr ? 'التاريخ ورقم السند والمستند' : 'Date, Voucher & Doc'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'نوع الحركة' : 'Type'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-3 px-3">{isAr ? 'الأستاذ العام والمساعد' : 'GL & Sub-Account'}</th>
                    <th className="py-3 px-3">{isAr ? 'البيان والشرح' : 'Description'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'المرفقات' : 'Attachments'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'الرصيد بعدها' : 'Balance After'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400">
                        {isAr ? 'لا توجد حركات مسجلة تطابق محددات البحث الحالية' : 'No transactions recorded matching the current filter criteria'}
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const isTransfer = tx.type === 'safe_transfer';
                      const isTargetSafe = isTransfer && (activeSafe?.id === tx.targetSafeId);
                      const isOut = isTransfer ? !isTargetSafe : (tx.direction === 'out');
                      const isIn = isTransfer ? isTargetSafe : (tx.direction === 'in');
                      const isZero = tx.direction === 'zero_sum';

                      let typeLabel = isAr ? (tx.typeAr || tx.type) : (tx.typeEn || tx.typeAr || tx.type);
                      if (isTransfer) {
                        typeLabel = isTargetSafe
                          ? (isAr ? 'تحويل وارد (استلام)' : 'Inter-Safe Transfer (In)')
                          : (isAr ? 'تحويل صادر (إرسال)' : 'Inter-Safe Transfer (Out)');
                      }

                      let mainAccLabel = isAr ? (tx.mainAccountAr || tx.mainAccount) : (tx.mainAccountEn || tx.mainAccountAr || tx.mainAccount);
                      let subAccLabel = tx.subAccountName;
                      if (isTransfer) {
                        if (isTargetSafe) {
                          mainAccLabel = isAr ? 'تحويل وارد من خزينة' : 'Transfer from Safe';
                          subAccLabel = tx.sourceSafeNameAr || tx.sourceSafeNameEn || tx.sourceSafeId
                            ? `${isAr ? 'من' : 'From'}: ${tx.sourceSafeNameAr || tx.sourceSafeNameEn || tx.sourceSafeId}`
                            : '';
                        } else {
                          mainAccLabel = isAr ? 'تحويل صادر إلى خزينة' : 'Transfer to Safe';
                          subAccLabel = tx.targetSafeNameAr || tx.targetSafeNameEn || tx.targetSafeId
                            ? `${isAr ? 'إلى' : 'To'}: ${tx.targetSafeNameAr || tx.targetSafeNameEn || tx.targetSafeId}`
                            : '';
                        }
                      }

                      const authCheck = canAuthorizeCashVoucher({ voucher: tx, safe: activeSafe, currentUser, treasuryConfig });

                      // Register row actions for right-click context menu
                      const txRowActions = [
                        ...(tx.status === 'pending_approval' && authCheck.canAuthorize ? [
                          {
                            id: 'approve',
                            label: 'اعتماد وصرف السند',
                            labelAr: 'اعتماد وصرف السند',
                            labelEn: 'Approve & Post',
                            icon: CheckCircle2,
                            onClick: () => setApprovalModal({ isOpen: true, voucher: tx, initialMode: 'approve' })
                          },
                          {
                            id: 'reject',
                            label: 'رفض السند',
                            labelAr: 'رفض السند',
                            labelEn: 'Reject Voucher',
                            icon: X,
                            variant: 'danger',
                            onClick: () => setApprovalModal({ isOpen: true, voucher: tx, initialMode: 'reject' })
                          }
                        ] : []),
                        ...(tx.status === 'pending_receiver_approval' && tx.targetSafeId === activeSafe?.id && canConfirmTransfer ? [
                          {
                            id: 'confirm_transfer',
                            label: 'تأكيد واستلام النقدية',
                            labelAr: 'تأكيد واستلام النقدية',
                            labelEn: 'Confirm & Receive',
                            icon: CheckCircle2,
                            onClick: () => setTransferHandshakeModal({ isOpen: true, transfer: tx, mode: 'confirm', rejectReason: '', isSubmitting: false })
                          },
                          {
                            id: 'reject_transfer',
                            label: 'رفض التحويل',
                            labelAr: 'رفض التحويل',
                            labelEn: 'Reject Transfer',
                            icon: X,
                            variant: 'danger',
                            onClick: () => setTransferHandshakeModal({ isOpen: true, transfer: tx, mode: 'reject', rejectReason: '', isSubmitting: false })
                          }
                        ] : []),
                        {
                          id: 'print',
                          label: 'طباعة سند A4',
                          labelAr: 'طباعة سند A4',
                          labelEn: 'Print Voucher Slip',
                          icon: Printer,
                          onClick: () => setSelectedVoucherForPrint(tx)
                        },
                        {
                          id: 'audit',
                          label: 'سجل الرقابة والتتبع',
                          labelAr: 'سجل الرقابة والتتبع',
                          labelEn: 'Audit Trail & Log',
                          icon: ShieldCheck,
                          onClick: () => setSelectedVoucherForAudit(tx)
                        },
                        {
                          id: 'edit',
                          label: 'تعديل بيانات السند',
                          labelAr: 'تعديل بيانات السند',
                          labelEn: 'Edit Voucher',
                          icon: Edit,
                          onClick: () => setSelectedVoucherForEdit(tx)
                        },
                        ...(tx.status === 'posted' && (currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin') ? [
                          {
                            id: 'reverse',
                            label: 'إلغاء وعكس السند',
                            labelAr: 'إلغاء وعكس السند',
                            labelEn: 'Void & Reverse',
                            icon: RotateCcw,
                            variant: 'danger',
                            onClick: () => setReversalDialog({ isOpen: true, voucher: tx, reason: '' })
                          }
                        ] : [])
                      ];
                      registerRowActions(tx.id, txRowActions);

                      return (
                        <tr
                          key={tx.id}
                          id={tx.id}
                          data-row-id={tx.id}
                          data-id={tx.id}
                          data-comment-doc={tx.id}
                          data-comment-number={tx.id}
                          data-comment-tab="cash_safes"
                          data-comment-module="finance"
                          data-comment-type="table_row"
                          className="hover:bg-slate-50/80 transition"
                        >
                          {/* Column 1: Date (Prominent) + Time (Short/Subtle) + Voucher ID (Copyable) + Merged Tax Doc Icon */}
                          <td className="py-3 px-3">
                            <div className="flex items-start gap-2.5">
                              {/* Tax Document Status Icon with Hover Tooltip */}
                              <div className="mt-0.5 shrink-0 relative group">
                                {tx.taxDocumentType === 'taxable' ? (
                                  <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700 border border-purple-200 inline-flex items-center justify-center cursor-help">
                                    <Receipt className="h-3.5 w-3.5" />
                                  </span>
                                ) : tx.taxDocumentType === 'non_taxable' ? (
                                  <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center justify-center cursor-help">
                                    <FileText className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <span className="p-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 inline-flex items-center justify-center cursor-help">
                                    <FileQuestion className="h-3.5 w-3.5" />
                                  </span>
                                )}

                                {/* Hover Tooltip */}
                                <div className="absolute z-30 bottom-full mb-1.5 start-0 hidden group-hover:block w-48 p-2 bg-slate-900 text-white text-[10px] rounded-xl shadow-xl pointer-events-none whitespace-normal">
                                  <div className="font-extrabold">
                                    {tx.taxDocumentType === 'taxable'
                                      ? (isAr ? 'مستند ضريبي رسمي (فاتورة)' : 'Official Tax Invoice')
                                      : tx.taxDocumentType === 'non_taxable'
                                      ? (isAr ? 'إيصال عرفي / غير خاضع للضريبة' : 'Informal Receipt')
                                      : (isAr ? 'بدون مستند ضريبي' : 'No Tax Document')}
                                  </div>
                                  {tx.taxDetails?.invoiceNumber && (
                                    <div className="text-slate-300 font-mono mt-0.5">
                                      {isAr ? 'رقم الفاتورة:' : 'Inv #:'} {tx.taxDetails.invoiceNumber}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Date, Time, Voucher ID */}
                              <div className="space-y-0.5 min-w-0">
                                {/* Date Prominent */}
                                <div className="font-black text-xs text-slate-900 leading-tight">
                                  {tx.createdAt
                                    ? new Date(tx.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                      })
                                    : '—'}
                                </div>

                                {/* Time Short & Subtle */}
                                <div className="text-[10px] text-slate-400 font-medium">
                                  {tx.createdAt
                                    ? new Date(tx.createdAt).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : ''}
                                </div>

                                {/* Trx Number Subtle with Quick 1-Click Copy */}
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[130px]" title={tx.id}>
                                    {tx.id}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopyTxId(e, tx.id)}
                                    className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer shrink-0"
                                    title={isAr ? 'نسخ رقم السند' : 'Copy Voucher ID'}
                                  >
                                    {copiedTxId === tx.id ? (
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Type */}
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                              isOut ? 'bg-rose-100 text-rose-800' :
                              isIn ? 'bg-emerald-100 text-emerald-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {typeLabel}
                            </span>
                          </td>

                          {/* Amount */}
                          <td className="py-3 px-3 text-center font-mono font-black text-sm">
                            <span className={isOut ? 'text-rose-600' : isIn ? 'text-emerald-600' : 'text-slate-700'}>
                              {isOut ? `-${tx.amount.toLocaleString()}` : isIn ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-normal text-slate-400 block">{tx.currency || 'EGP'}</span>
                          </td>

                          {/* Accounts */}
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-800">{mainAccLabel}</div>
                            {subAccLabel && (
                              <div className="text-[11px] text-slate-500 font-medium">{subAccLabel}</div>
                            )}
                          </td>

                          {/* Description */}
                          <td className="py-3 px-3 max-w-[200px] truncate text-slate-700" title={tx.description}>
                            {tx.description || '—'}
                          </td>

                          {/* Column 6: Attachments Column with Thumbnail on Hover & Click to View */}
                          <td className="py-3 px-3 text-center">
                            {(() => {
                              const rawAttachments = Array.isArray(tx.attachments) && tx.attachments.length > 0
                                ? tx.attachments
                                : (tx.attachment ? [tx.attachment] : []);

                              if (rawAttachments.length === 0) {
                                return <span className="text-slate-300 text-xs">—</span>;
                              }

                              return (
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  {rawAttachments.map((att, attIdx) => {
                                    const url = typeof att === 'string' ? att : (att.url || att.dataUrl || '');
                                    const name = typeof att === 'string' ? `مستند ${attIdx + 1}` : (att.name || `مستند ${attIdx + 1}`);
                                    const type = typeof att === 'object' ? (att.type || '') : '';
                                    const isImg = type.startsWith('image/') || url.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(url) || /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
                                    const isPdf = type === 'application/pdf' || url.startsWith('data:application/pdf') || /\.pdf$/i.test(url) || /\.pdf$/i.test(name);

                                    return (
                                      <button
                                        key={attIdx}
                                        type="button"
                                        onClick={() => {
                                          setHoveredAttachmentInfo(null);
                                          setSelectedAttachmentForView(att);
                                        }}
                                        onMouseEnter={(e) => {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          setHoveredAttachmentInfo({ att, rect, isImg, isPdf, url, name });
                                        }}
                                        onMouseLeave={() => setHoveredAttachmentInfo(null)}
                                        className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                                          isImg
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                                            : isPdf
                                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 hover:border-rose-300'
                                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                        }`}
                                        title={name}
                                      >
                                        {isImg ? (
                                          <FileImage className="h-3.5 w-3.5" />
                                        ) : isPdf ? (
                                          <FileText className="h-3.5 w-3.5" />
                                        ) : (
                                          <Paperclip className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Balance After */}
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                            {(() => {
                              const bal = isTargetSafe
                                ? (tx.targetBalanceAfter !== undefined ? tx.targetBalanceAfter : (tx.status === 'pending_receiver_approval' ? undefined : tx.balanceAfter))
                                : tx.balanceAfter;
                              return bal !== undefined ? `${bal.toLocaleString()} ${isAr ? 'ج' : 'EGP'}` : '—';
                            })()}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            {tx.status === 'posted' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>{isAr ? 'معتمد' : 'Posted'}</span>
                              </span>
                            ) : tx.status === 'pending_receiver_approval' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                <Clock className="h-3 w-3" />
                                <span>{isAr ? 'بانتظار تأكيد المستلم' : 'Pending Receipt'}</span>
                              </span>
                            ) : tx.status === 'pending_approval' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                <Clock className="h-3 w-3" />
                                <span>{isAr ? 'معلق للاعتماد' : 'Pending Approval'}</span>
                              </span>
                            ) : tx.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                <X className="h-3 w-3" />
                                <span>{isAr ? 'مرفوض الاستلام' : 'Rejected'}</span>
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-slate-400 line-through">
                                {isAr ? 'ملغي' : 'Void'}
                              </span>
                            )}
                          </td>

                          {/* Actions: Quick Approve Button + 3 Vertical Dots Popover Menu */}
                          <td className="py-3 px-3 text-center">
                            {(() => {
                              const authCheck = canAuthorizeCashVoucher({ voucher: tx, safe: activeSafe, currentUser, treasuryConfig });
                              return (
                                <div className="flex items-center justify-center gap-1">
                                  {/* Quick 1-Click Approve Button if Pending Approval & User Authorized */}
                                  {tx.status === 'pending_approval' && authCheck.canAuthorize && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setApprovalModal({ isOpen: true, voucher: tx, initialMode: 'approve' });
                                      }}
                                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-[11px] shadow-xs transition inline-flex items-center gap-1 cursor-pointer"
                                      title={isAr ? 'اعتماد وصرف السند' : 'Approve Voucher'}
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      <span>{isAr ? 'اعتماد' : 'Approve'}</span>
                                    </button>
                                  )}

                                  {/* Quick Row Comment Button */}
                                  <RowCommentButton
                                    docId={tx.id}
                                    docNumber={tx.voucherNumber || tx.id}
                                    tab="cash_safes"
                                    module="finance"
                                  />

                                  <div className="relative inline-block actions-menu-container">
                                    {/* 3-Dots Trigger Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveActionsMenuTxId((prev) => (prev === tx.id ? null : tx.id));
                                      }}
                                      className={`p-1.5 rounded-xl border transition cursor-pointer ${
                                        activeActionsMenuTxId === tx.id
                                          ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border-transparent hover:border-slate-200'
                                      }`}
                                      title={isAr ? 'خيارات السند' : 'Voucher Actions'}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>

                                    {/* Dropdown Menu Popover */}
                                    {activeActionsMenuTxId === tx.id && (
                                      <div
                                        className={`absolute z-40 top-full mt-1.5 ${
                                          isAr ? 'left-0' : 'right-0'
                                        } w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 text-xs text-slate-700 animate-fadeIn`}
                                      >
                                        {/* Quick Approval / Rejection if pending approval */}
                                        {tx.status === 'pending_approval' && authCheck.canAuthorize && (
                                          <div className="pb-1 mb-1 border-b border-slate-100">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveActionsMenuTxId(null);
                                                setApprovalModal({ isOpen: true, voucher: tx, initialMode: 'approve' });
                                              }}
                                              className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-emerald-50 transition cursor-pointer font-bold text-emerald-800"
                                            >
                                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                              <span>{isAr ? 'اعتماد وصرف السند' : 'Approve & Post'}</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveActionsMenuTxId(null);
                                                setApprovalModal({ isOpen: true, voucher: tx, initialMode: 'reject' });
                                              }}
                                              className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-rose-50 transition cursor-pointer font-bold text-rose-700"
                                            >
                                              <X className="h-4 w-4 text-rose-600" />
                                              <span>{isAr ? 'رفض السند' : 'Reject Voucher'}</span>
                                            </button>
                                          </div>
                                        )}
                                  {/* Quick Receipt Confirmation if pending receiver approval */}
                                  {tx.status === 'pending_receiver_approval' && tx.targetSafeId === activeSafe.id && canConfirmTransfer && (
                                    <div className="pb-1 mb-1 border-b border-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveActionsMenuTxId(null);
                                          setTransferHandshakeModal({
                                            isOpen: true,
                                            transfer: tx,
                                            mode: 'confirm',
                                            rejectReason: '',
                                            isSubmitting: false
                                          });
                                        }}
                                        className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-emerald-50 transition cursor-pointer font-bold text-emerald-800"
                                      >
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                        <span>{isAr ? 'تأكيد واستلام النقدية' : 'Confirm & Receive'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveActionsMenuTxId(null);
                                          setTransferHandshakeModal({
                                            isOpen: true,
                                            transfer: tx,
                                            mode: 'reject',
                                            rejectReason: '',
                                            isSubmitting: false
                                          });
                                        }}
                                        className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-rose-50 transition cursor-pointer font-bold text-rose-700"
                                      >
                                        <X className="h-4 w-4 text-rose-600" />
                                        <span>{isAr ? 'رفض التحويل' : 'Reject Transfer'}</span>
                                      </button>
                                    </div>
                                  )}

                                  {/* 1. Print Voucher Slip */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveActionsMenuTxId(null);
                                      setSelectedVoucherForPrint(tx);
                                    }}
                                    className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-slate-50 transition cursor-pointer font-bold text-slate-700"
                                  >
                                    <Printer className="h-4 w-4 text-slate-500" />
                                    <span>{isAr ? 'طباعة سند A4' : 'Print Voucher Slip'}</span>
                                  </button>

                                  {/* 2. Audit Trail Log */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveActionsMenuTxId(null);
                                      setSelectedVoucherForAudit(tx);
                                    }}
                                    className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-indigo-50 transition cursor-pointer font-bold text-indigo-700"
                                  >
                                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                                    <span>{isAr ? 'سجل الرقابة والتتبع' : 'Audit Trail & Log'}</span>
                                  </button>

                                  {/* 3. Edit Voucher (Role-governed) */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveActionsMenuTxId(null);
                                      setSelectedVoucherForEdit(tx);
                                    }}
                                    className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-amber-50 transition cursor-pointer font-bold text-amber-700"
                                  >
                                    <Edit className="h-4 w-4 text-amber-600" />
                                    <span>{isAr ? 'تعديل بيانات السند' : 'Edit Voucher'}</span>
                                  </button>

                                  {/* 4. Reversal Trigger (Only if posted & General Admin) */}
                                  {tx.status === 'posted' && (currentUser.isGeneralAdmin || currentUser.role === 'general_admin') && (
                                    <div className="pt-1 mt-1 border-t border-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveActionsMenuTxId(null);
                                          setReversalDialog({ isOpen: true, voucher: tx, reason: '' });
                                        }}
                                        className="w-full px-3 py-2 text-start flex items-center gap-2 hover:bg-rose-50 transition cursor-pointer font-bold text-rose-600"
                                      >
                                        <RotateCcw className="h-4 w-4 text-rose-500" />
                                        <span>{isAr ? 'إلغاء وعكس السند' : 'Void & Reverse'}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
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

      {/* VIEW 2: Custodies & Advances Hub */}
      {activeMainTab === 'custodies' && (
        <CustodiesAdvancesMaster
          custodyRecords={custodyRecords}
          workersList={workersList}
          allSafes={safesList}
          onOpenCashVoucher={(type) => setVoucherModal({ isOpen: true, initialType: type })}
          currentUser={currentUser}
        />
      )}

      {/* MODALS */}
      {/* 1. Cash Voucher Creator */}
      {voucherModal.isOpen && (
        <CashVoucherModal
          safe={activeSafe}
          allSafes={safesList}
          suppliersList={suppliersList}
          workersList={workersList}
          clientsList={clientsList}
          accountingLinks={accountingLinks}
          accountsMaster={chartAccounts}
          currentUser={currentUser}
          isOpen={voucherModal.isOpen}
          initialType={voucherModal.initialType}
          onClose={() => setVoucherModal({ isOpen: false, initialType: 'disbursement' })}
          onSuccess={() => {}}
        />
      )}

      {/* 2. Independent Inter-Safe Transfer Modal */}
      {isTransferModalOpen && (
        <InterSafeTransferModal
          sourceSafe={activeSafe}
          allSafes={safesList}
          currentUser={currentUser}
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          onSuccess={() => {}}
        />
      )}

      {/* 3. Change Exchange Modal */}
      {isChangeModalOpen && (
        <CashChangeModal
          safe={activeSafe}
          currentUser={currentUser}
          isOpen={isChangeModalOpen}
          onClose={() => setIsChangeModalOpen(false)}
          onSuccess={() => {}}
        />
      )}

      {/* 4. Physical Count & Discrepancy Modal */}
      {isAuditModalOpen && (
        <CashCountAuditModal
          safe={activeSafe}
          currentUser={currentUser}
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          onSuccess={() => {}}
        />
      )}

      {/* 5. A4 Printable Slip View */}
      {selectedVoucherForPrint && (
        <CashVoucherPrintSlip
          voucher={selectedVoucherForPrint}
          safe={safesList.find((s) => s.id === (selectedVoucherForPrint.type === 'safe_transfer' && selectedVoucherForPrint.targetSafeId === activeSafe?.id ? activeSafe?.id : selectedVoucherForPrint.safeId)) || activeSafe}
          activeSafeId={activeSafe?.id}
          onClose={() => setSelectedVoucherForPrint(null)}
        />
      )}

      {/* 6. Dynamic Safe Settings Modal */}
      {isSettingsModalOpen && (
        <DynamicSafeSettingsModal
          allSafes={safesList}
          usersList={usersList}
          currentUser={currentUser}
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onSuccess={() => {}}
        />
      )}

      {/* 7. Comprehensive Audit Log Modal */}
      {selectedVoucherForAudit && (
        <VoucherAuditLogModal
          voucher={selectedVoucherForAudit}
          safe={safesList.find((s) => s.id === (selectedVoucherForAudit.type === 'safe_transfer' && selectedVoucherForAudit.targetSafeId === activeSafe?.id ? activeSafe?.id : selectedVoucherForAudit.safeId)) || activeSafe}
          activeSafeId={activeSafe?.id}
          isOpen={Boolean(selectedVoucherForAudit)}
          onClose={() => setSelectedVoucherForAudit(null)}
          onViewAttachment={(att) => setSelectedAttachmentForView(att)}
        />
      )}

      {/* 8. Role-Governed Edit Voucher Modal */}
      {selectedVoucherForEdit && (
        <EditCashVoucherModal
          voucher={selectedVoucherForEdit}
          currentUser={currentUser}
          accountsMaster={chartAccounts}
          accountingLinks={accountingLinks}
          suppliersList={suppliersList}
          workersList={workersList}
          clientsList={clientsList}
          allSafes={safesList}
          isOpen={Boolean(selectedVoucherForEdit)}
          onClose={() => setSelectedVoucherForEdit(null)}
          onSuccess={() => {}}
        />
      )}

      {/* 9. Attachment Fullscreen Viewer Modal */}
      {selectedAttachmentForView && (
        <AttachmentViewerModal
          attachment={selectedAttachmentForView}
          isOpen={Boolean(selectedAttachmentForView)}
          onClose={() => setSelectedAttachmentForView(null)}
        />
      )}

      {/* 9.5. Inter-Safe Transfer Two-Party Custody Confirmation / Rejection Modal */}
      {transferHandshakeModal.isOpen && transferHandshakeModal.transfer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
            <div className={`px-6 py-4 text-white flex items-center justify-between shrink-0 ${
              transferHandshakeModal.mode === 'confirm'
                ? 'bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900'
                : 'bg-gradient-to-r from-rose-600 via-rose-700 to-slate-900'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  {transferHandshakeModal.mode === 'confirm' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-200" />
                  ) : (
                    <X className="h-5 w-5 text-rose-200" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-extrabold">
                    {transferHandshakeModal.mode === 'confirm'
                      ? (isAr ? 'تأكيد استلام النقدية بالخزينة' : 'Confirm Cash Receipt')
                      : (isAr ? 'رفض التحويل النقدي وإعادته' : 'Reject & Return Transfer')}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    {transferHandshakeModal.transfer.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferHandshakeModal({ isOpen: false, transfer: null, mode: 'confirm', rejectReason: '', isSubmitting: false })}
                className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Transfer Summary */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{isAr ? 'الخزينة المصدر:' : 'Source Vault:'}</span>
                  <span className="font-bold text-slate-800">
                    {transferHandshakeModal.transfer.sourceSafeNameAr || transferHandshakeModal.transfer.sourceSafeId}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{isAr ? 'الخزينة المستلمة:' : 'Target Vault:'}</span>
                  <span className="font-bold text-slate-800">
                    {activeSafe.nameAr || activeSafe.id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                  <span className="text-slate-500 font-bold">{isAr ? 'مبلغ التحويل:' : 'Amount:'}</span>
                  <span className="text-base font-black font-mono text-emerald-700">
                    {Number(transferHandshakeModal.transfer.amount).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              </div>

              {/* Denominations Verification Breakdown */}
              {transferHandshakeModal.transfer.denominations && (
                <div className="space-y-2">
                  <h5 className="text-xs font-extrabold text-slate-700">
                    {isAr ? 'تفقيط الفئات الورقية المطلوب مطابقتها:' : 'Banknotes to physically verify:'}
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(transferHandshakeModal.transfer.denominations)
                      .filter(([_, count]) => Number(count) !== 0)
                      .map(([denom, count]) => {
                        const numCount = Number(count) || 0;
                        const isNegative = numCount < 0;
                        return (
                          <div
                            key={denom}
                            className={`flex items-center justify-between p-2 rounded-xl border font-mono ${
                              isNegative ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-100/70 border-slate-200'
                            }`}
                          >
                            <span className="font-bold">{denom} {isAr ? 'ج' : 'EGP'}</span>
                            <span className={`font-extrabold ${isNegative ? 'text-amber-800' : 'text-slate-600'}`}>
                              {numCount} ورقات ({(Number(denom) * numCount).toLocaleString()} ج){isNegative ? (isAr ? ' (فكة)' : ' (chg)') : ''}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Rejection reason if in reject mode */}
              {transferHandshakeModal.mode === 'reject' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700">
                    {isAr ? 'سبب الرفض (إلزامي):' : 'Rejection Reason (Required):'}
                  </label>
                  <textarea
                    rows={3}
                    value={transferHandshakeModal.rejectReason}
                    onChange={(e) => setTransferHandshakeModal((prev) => ({ ...prev, rejectReason: e.target.value }))}
                    placeholder={isAr ? 'مثال: نقص في فئة معينة، عدم وصول المندوب، إلخ...' : 'e.g., Shortage in notes, delivery did not arrive...'}
                    className="w-full p-3 rounded-xl border border-rose-300 focus:ring-2 focus:ring-rose-500 focus:outline-hidden text-xs"
                  />
                </div>
              )}

              <p className="text-xs text-slate-500 leading-relaxed">
                {transferHandshakeModal.mode === 'confirm'
                  ? (isAr
                      ? 'بالضغط على تأكيد الاستلام، سيتم إيداع المبلغ والفئات فوراً في رصيد هذه الخزينة واعتماد السند وإغلاق المهمة المطلوبة.'
                      : 'By confirming, funds and banknotes will be credited to this vault immediately and the required action completed.')
                  : (isAr
                      ? 'بالضغط على رفض، سيتم إعادة المبلغ والفئات فوراً إلى رصيد الخزينة المصدر وتسجيل سبب الرفض.'
                      : 'By rejecting, funds and banknotes will be refunded back to the source vault immediately.')}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setTransferHandshakeModal({ isOpen: false, transfer: null, mode: 'confirm', rejectReason: '', isSubmitting: false })}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition text-xs cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              {transferHandshakeModal.mode === 'confirm' ? (
                <button
                  type="button"
                  disabled={transferHandshakeModal.isSubmitting}
                  onClick={handleExecuteConfirmTransfer}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-extrabold text-xs shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{transferHandshakeModal.isSubmitting ? (isAr ? 'جاري التأكيد...' : 'Confirming...') : (isAr ? 'تأكيد واستلام النقدية' : 'Confirm & Receive')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={transferHandshakeModal.isSubmitting}
                  onClick={handleExecuteRejectTransfer}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-extrabold text-xs shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <X className="h-4 w-4" />
                  <span>{transferHandshakeModal.isSubmitting ? (isAr ? 'جاري الرفض...' : 'Rejecting...') : (isAr ? 'تأكيد الرفض والإعادة' : 'Confirm Rejection')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 10. Voucher Reversal Confirmation Modal */}
      {reversalDialog.isOpen && reversalDialog.voucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden my-auto ${isAr ? 'text-right' : 'text-left'}`}>
            <div className="bg-rose-600 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="h-5 w-5" />
                <h3 className="text-sm font-extrabold">
                  {isAr ? 'تأكيد إلغاء وعكس السند المالي' : 'Confirm Voucher Reversal & Void'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReversalDialog({ isOpen: false, voucher: null, reason: '' })}
                className="text-white/80 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
              <p className="text-slate-700 leading-relaxed">
                {isAr ? (
                  <>
                    هل أنت متأكد من إلغاء السند <strong className="font-mono text-rose-700">{reversalDialog.voucher.id}</strong> بمبلغ{' '}
                    <strong className="font-mono font-bold">{reversalDialog.voucher.amount.toLocaleString()} {reversalDialog.voucher.currency || 'EGP'}</strong>؟
                  </>
                ) : (
                  <>
                    Are you sure you want to void voucher <strong className="font-mono text-rose-700">{reversalDialog.voucher.id}</strong> for{' '}
                    <strong className="font-mono font-bold">{reversalDialog.voucher.amount.toLocaleString()} {reversalDialog.voucher.currency || 'EGP'}</strong>?
                  </>
                )}
              </p>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-[11px] leading-relaxed">
                {isAr
                  ? 'سيقوم النظام تلقائياً بعكس الأثر المالي وإعادة/خصم الفئات الورقية من الخزينة لتصحيح الرصيد الدفتري.'
                  : 'The system will automatically post an inverse financial transaction and restore/deduct physical banknotes to re-align the ledger balance.'}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'سبب الإلغاء والعكس (إلزامي للرقابة):' : 'Reversal Reason (Mandatory for Audit):'}
                </label>
                <input
                  type="text"
                  required
                  value={reversalDialog.reason}
                  onChange={(e) => setReversalDialog((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder={isAr ? 'مثال: خطأ في تفقيط الفئات / إلغاء طلب الشراء' : 'e.g., Note count entry error / Cancelled purchase order'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setReversalDialog({ isOpen: false, voucher: null, reason: '' })}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isReversing}
                onClick={handleConfirmReversal}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isReversing
                  ? (isAr ? 'جاري العكس...' : 'Reversing...')
                  : (isAr ? 'تأكيد إلغاء السند وعكس الرصيد' : 'Confirm Reversal & Adjust Balance')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Cash Voucher Approval / Rejection Modal */}
      {approvalModal.isOpen && approvalModal.voucher && (
        <CashVoucherApprovalModal
          isOpen={approvalModal.isOpen}
          voucher={approvalModal.voucher}
          safe={safesList.find((s) => s.id === approvalModal.voucher.safeId) || activeSafe}
          currentUser={currentUser}
          treasuryConfig={treasuryConfig}
          initialMode={approvalModal.initialMode || 'approve'}
          onClose={() => setApprovalModal({ isOpen: false, voucher: null, initialMode: 'approve' })}
          onSuccess={() => {}}
        />
      )}

      {/* Floating Viewport-Safe Attachment Hover Popover (outside table overflow-x-auto) */}
      {hoveredAttachmentInfo && (
        <div
          style={getTooltipStyle(hoveredAttachmentInfo.rect)}
          className="fixed z-[9999] flex flex-col items-center p-2.5 bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-slate-700 pointer-events-none text-[10px] space-y-1.5 transition-opacity duration-150 animate-fadeIn"
        >
          {hoveredAttachmentInfo.isImg && hoveredAttachmentInfo.url && (
            <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center">
              <img
                src={hoveredAttachmentInfo.url}
                alt={hoveredAttachmentInfo.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {hoveredAttachmentInfo.isPdf && (
            <div className="w-14 h-14 rounded-lg bg-rose-950/60 border border-rose-700/60 flex items-center justify-center text-rose-300">
              <FileText className="h-7 w-7" />
            </div>
          )}
          {!hoveredAttachmentInfo.isImg && !hoveredAttachmentInfo.isPdf && (
            <div className="w-14 h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <Paperclip className="h-6 w-6" />
            </div>
          )}
          <div className="font-bold truncate max-w-full text-center px-1" title={hoveredAttachmentInfo.name}>
            {hoveredAttachmentInfo.name}
          </div>
          <span className="text-[9px] text-slate-400 font-medium">
            {isAr ? 'اضغط للمعاينة الكاملة' : 'Click to preview full'}
          </span>
        </div>
      )}
    </div>
  );
}
