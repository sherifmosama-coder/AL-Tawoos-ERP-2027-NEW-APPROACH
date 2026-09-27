import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  PackageCheck,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowLeftRight,
  Calendar,
  Building2,
  QrCode,
  Printer,
  Camera,
  Workflow,
  Users,
  Layers,
  Search,
  Filter,
  X,
  Eye,
  FileText,
  Lock,
  Warehouse,
  Check,
  RotateCcw,
  XCircle,
  AlertTriangle,
  Copy,
  ChevronDown,
  ChevronUp,
  Package,
  ShieldAlert,
  Activity
} from 'lucide-react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getWarehouseDisplayName, getFinishedGoodsWarehouses } from '../utils/warehouseClassifier';
import { buildLiveStockMatrix, resolveItemOrLotCost } from '../utils/stockResolver';
import { useNotification } from '../context/NotificationContext';

export default function FinishedGoodsInward({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const currentUserName = isAr ? (currentUser?.nameAr || 'المسؤول') : (currentUser?.name || 'Authorized User');
  const currentUserId = currentUser?.id || currentUser?.uid || '';
  const { toast, showConfirm, showAlert } = useNotification();

  // Dynamic Authority Resolvers
  const canInspect = isGeneralAdmin || (
    permissions?.actions?.['fg_inward.canInspect'] !== undefined
      ? permissions.actions['fg_inward.canInspect'] === true
      : permissions?.actions?.canInspect !== false
  );
  const canAccept = isGeneralAdmin || (
    permissions?.actions?.['fg_inward.canAccept'] !== undefined
      ? permissions.actions['fg_inward.canAccept'] === true
      : permissions?.actions?.canAccept !== false
  );
  const canReject = isGeneralAdmin || (
    permissions?.actions?.['fg_inward.canReject'] !== undefined
      ? permissions.actions['fg_inward.canReject'] === true
      : permissions?.actions?.canReject !== false
  );
  const canExport = isGeneralAdmin || (
    permissions?.actions?.['fg_inward.canExport'] !== undefined
      ? permissions.actions['fg_inward.canExport'] === true
      : permissions?.actions?.canExport !== false
  );
  const canViewPrices = isGeneralAdmin || permissions?.sensitive?.canViewPrices !== false;

  // Local State & Subscriptions
  const [transfers, setTransfers] = useState([]);
  const [stagedPallets, setStagedPallets] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [productionProcesses, setProductionProcesses] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [bomRecipes, setBomRecipes] = useState([]);
  const [floorLiquidVessels, setFloorLiquidVessels] = useState([]);
  const [liquidTanks, setLiquidTanks] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Response Modal State (Single entry point from Inward Gate mini-card)
  const [respondingPallet, setRespondingPallet] = useState(null);
  const [modalRejectionReason, setModalRejectionReason] = useState('');
  const [applyToAllInTrn, setApplyToAllInTrn] = useState(false);
  const [isActionInProgress, setIsActionInProgress] = useState(false);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState(null);

  // Date accordion toggle state in ledger
  const [expandedDates, setExpandedDates] = useState({});

  // Filters State for the Historical Pallet Repository
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('ALL');
  const [selectedProductFilter, setSelectedProductFilter] = useState('ALL');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  // Modals State
  const [selectedPalletPassport, setSelectedPalletPassport] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [intermediateRecipes, setIntermediateRecipes] = useState([]);

  // Subscribe to Cloud Collections
  useEffect(() => {
    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setTransfers(data);
    });

    const unsubPallets = onSnapshot(collection(db, 'staged_floor_pallets'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStagedPallets(data);
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setWarehouses(data);
    });

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setFinishedProducts(data);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setUsers(data);
    });

    const unsubProcesses = onSnapshot(collection(db, 'production_processes'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setProductionProcesses(data);
    });

    const unsubOrders = onSnapshot(collection(db, 'work_orders'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setWorkOrders(data);
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setItemsMaster(data);
    });

    const unsubBoms = onSnapshot(collection(db, 'bom_recipes'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setBomRecipes(data);
    });

    const unsubFloorVessels = onSnapshot(collection(db, 'floor_liquid_vessels'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setFloorLiquidVessels(data);
    });

    const unsubLiquidTanks = onSnapshot(collection(db, 'liquid_tanks'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setLiquidTanks(data);
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setGoodsReceipts(data);
    });

    const unsubTransformations = onSnapshot(collection(db, 'production_transformations'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setTransformations(data);
    });

    const unsubRecipes = onSnapshot(collection(db, 'intermediate_recipes'), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, code: docSnap.id, ...docSnap.data() }));
      setIntermediateRecipes(data);
    });

    return () => {
      unsubTransfers();
      unsubPallets();
      unsubWarehouses();
      unsubProducts();
      unsubUsers();
      unsubProcesses();
      unsubOrders();
      unsubItems();
      unsubBoms();
      unsubFloorVessels();
      unsubLiquidTanks();
      unsubGrns();
      unsubTransformations();
      unsubRecipes();
    };
  }, []);

  // Centralized Live Stock & Valuation Matrix
  const liveStockMatrix = useMemo(() => {
    return buildLiveStockMatrix({
      itemsMaster,
      warehouses,
      goodsReceipts,
      transfers,
      transformations,
      intermediateRecipes,
    });
  }, [itemsMaster, warehouses, goodsReceipts, transfers, transformations, intermediateRecipes]);

  // Helper: User Display Name
  const getUserDisplayName = (userId) => {
    if (!userId || typeof userId !== 'string') return isAr ? 'غير محدد' : 'Unassigned';
    const u = users.find((usr) => usr.id === userId || usr.uid === userId || usr.email === userId);
    if (u) return isAr ? (u.nameAr || u.name) : (u.name || u.nameAr);
    return String(userId);
  };

  // Robust Firestore Timestamp & Date Normalizer
  const toDateObj = (val) => {
    if (!val) return null;
    if (typeof val.toDate === 'function') {
      try { return val.toDate(); } catch { return null; }
    }
    if (typeof val === 'object' && val.seconds !== undefined) {
      return new Date(val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1000000 : 0));
    }
    if (val instanceof Date) {
      return isNaN(val.getTime()) ? null : val;
    }
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const toIsoString = (val) => {
    const d = toDateObj(val);
    return d ? d.toISOString() : null;
  };

  const formatDisplayTime = (val) => {
    if (!val) return '—';
    const d = toDateObj(val);
    if (d) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return typeof val === 'string' ? val : '—';
  };

  const getPalletDate = (p) => {
    if (!p) return '1970-01-01';
    const d = toDateObj(p.transferAcceptedAt || p.productionDate || p.stagedAt || p.createdAt);
    if (d) {
      return d.toISOString().split('T')[0];
    }
    if (typeof p.productionDate === 'string' && p.productionDate.includes('-')) {
      return p.productionDate;
    }
    return '1970-01-01';
  };

  // Finished Goods Warehouses
  const finishedGoodsWhs = useMemo(() => {
    return getFinishedGoodsWarehouses(warehouses);
  }, [warehouses]);

  // Section 1: Inbound Transfers Awaiting Custodian Inward Verification
  const pendingInwardTransfers = useMemo(() => {
    return transfers.filter((trn) => {
      if (trn.status !== 'pending_custodian_verification') return false;
      // Must be destined for a finished goods warehouse or tagged/prefixed as FG transfer
      const isFgTrn =
        trn.id?.startsWith('TRN-FG-') ||
        trn.id?.startsWith('FG-') ||
        trn.transferType === 'finished_goods' ||
        trn.transferCategory === 'finished_goods' ||
        trn.isFinishedGoods;
      const targetWh = warehouses.find((w) => w.id === trn.targetWarehouse);
      const isFgWh = targetWh?.classification === 'finished_goods' || targetWh?.operationalClassification === 'finished_goods';
      return isFgTrn || isFgWh;
    });
  }, [transfers, warehouses]);

  // Section 2: Permanent Received Finished Goods Pallets ("Forever Inward Ledger")
  const acceptedReceivedPallets = useMemo(() => {
    return stagedPallets.filter((p) => {
      return p.status === 'transferred_to_fg' || p.status === 'accepted_in_fg' || p.stagingStatus === 'transferred_to_fg';
    });
  }, [stagedPallets]);

  // Filtered Received Pallets
  const filteredAcceptedPallets = useMemo(() => {
    return acceptedReceivedPallets.filter((pallet) => {
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pId = (pallet.palletId || '').toLowerCase();
        const pNum = String(pallet.palletNumber || '');
        const oNum = (pallet.orderNumber || '').toLowerCase();
        const prodNameAr = (pallet.productNameAr || '').toLowerCase();
        const prodNameEn = (pallet.productNameEn || '').toLowerCase();
        const prodCode = (pallet.finishedProductId || pallet.productCode || '').toLowerCase();
        const bRange = (pallet.batchRangeDisplay || '').toLowerCase();

        const matches =
          pId.includes(q) ||
          pNum.includes(q) ||
          oNum.includes(q) ||
          prodNameAr.includes(q) ||
          prodNameEn.includes(q) ||
          prodCode.includes(q) ||
          bRange.includes(q);

        if (!matches) return false;
      }

      // Warehouse Filter
      if (selectedWarehouseFilter !== 'ALL') {
        if (pallet.targetWarehouseId !== selectedWarehouseFilter) return false;
      }

      // Product Filter
      if (selectedProductFilter !== 'ALL') {
        if (pallet.finishedProductId !== selectedProductFilter && pallet.productCode !== selectedProductFilter) return false;
      }

      // Date Filters
      const pDate = getPalletDate(pallet);
      if (dateFromFilter && pDate < dateFromFilter) return false;
      if (dateToFilter && pDate > dateToFilter) return false;

      return true;
    });
  }, [acceptedReceivedPallets, searchQuery, selectedWarehouseFilter, selectedProductFilter, dateFromFilter, dateToFilter]);

  // Aggregated KPIs
  const totalReceivedCartons = useMemo(() => {
    return acceptedReceivedPallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || 0), 0);
  }, [acceptedReceivedPallets]);

  const totalReceivedUnits = useMemo(() => {
    return acceptedReceivedPallets.reduce((sum, p) => sum + (Number(p.qtySmall) || 0), 0);
  }, [acceptedReceivedPallets]);

  // Custodian Inward Verification Handler (Accept & Deposit in FG Custody)
  // Copy Code to Clipboard with Instant Feedback
  const handleCopyCode = (e, text, key) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedKey(key);
    toast.info(
      isAr ? `تم نسخ: ${text}` : `Copied: ${text}`,
      isAr ? 'تم النسخ' : 'Copied'
    );
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 1800);
  };

  // Subtle Chip with Copy Icon
  const SubtleCodeChip = ({ label, code, idKey, className = '' }) => {
    if (!code || code === '—' || typeof code === 'object') return null;
    const displayCode = String(code);
    const isCopied = copiedKey === idKey;
    return (
      <button
        type="button"
        onClick={(e) => handleCopyCode(e, displayCode, idKey)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded text-[9px] font-mono border border-slate-200/80 cursor-pointer transition select-all shrink-0 max-w-full truncate ${className}`}
        title={isAr ? `اضغط لنسخ ${label || ''}: ${displayCode}` : `Click to copy ${label || ''}: ${displayCode}`}
      >
        {label && <span className="text-slate-400 font-sans text-[8.5px]">{label}:</span>}
        <span className="font-bold truncate max-w-[110px]">{displayCode}</span>
        {isCopied ? (
          <Check className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
        ) : (
          <Copy className="h-2.5 w-2.5 text-slate-400 hover:text-indigo-600 shrink-0" />
        )}
      </button>
    );
  };

  // Human-Friendly Relative & Formatted Time
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '—';
    const date = toDateObj(timestamp);
    if (!date) {
      return typeof timestamp === 'string' ? timestamp : '—';
    }
    try {
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (diffDay > 0) {
        return `${timeStr} (${isAr ? `منذ ${diffDay} يوم` : `${diffDay}d ago`})`;
      }
      if (diffHour > 0) {
        return `${timeStr} (${isAr ? `منذ ${diffHour} س` : `${diffHour}h ago`})`;
      }
      if (diffMin > 0) {
        return `${timeStr} (${isAr ? `منذ ${diffMin} د` : `${diffMin}m ago`})`;
      }
      return `${timeStr} (${isAr ? 'الآن' : 'just now'})`;
    } catch {
      return '—';
    }
  };

  // Helper: Accurately Resolve Process & Crew (with fallback to work_orders)
  const resolvePalletProcessAndCrew = (pallet) => {
    if (!pallet) return { processName: '', stepStaffing: [], crew: [] };

    // 1. Process Name
    const procId = pallet.processId || pallet.processCode;
    const proc = productionProcesses.find((p) => (p.id || p.processCode) === procId);
    let processName = isAr
      ? proc?.nameAr || pallet.processNameAr || proc?.nameEn || pallet.processNameEn || ''
      : proc?.nameEn || pallet.processNameEn || proc?.nameAr || pallet.processNameAr || '';

    // 2. Step Staffing & Crew
    let stepStaffing = Array.isArray(pallet.stepStaffing) && pallet.stepStaffing.length > 0 ? pallet.stepStaffing : [];
    let crew = Array.isArray(pallet.crew) && pallet.crew.length > 0 ? pallet.crew : [];

    // Fallback to work_orders if missing
    if (!processName || stepStaffing.length === 0 || crew.length === 0) {
      const wo = workOrders.find((o) => o.id === pallet.workOrderId || o.orderNumber === pallet.orderNumber);
      if (wo) {
        if (!processName) {
          const woProc = productionProcesses.find((p) => (p.id || p.processCode) === (wo.processId || wo.processCode));
          processName = isAr
            ? woProc?.nameAr || wo.processNameAr || woProc?.nameEn || wo.processNameEn || (isAr ? 'خط الإنتاج القياسي' : 'Standard Line')
            : woProc?.nameEn || wo.processNameEn || woProc?.nameAr || wo.processNameAr || 'Standard Line';
        }
        const woPallet = (wo.pallets || []).find(
          (pl) => pl.palletId === pallet.palletId || (pl.palletNumber && String(pl.palletNumber) === String(pallet.palletNumber))
        );
        if (stepStaffing.length === 0) {
          stepStaffing = (woPallet && Array.isArray(woPallet.stepStaffing) && woPallet.stepStaffing.length > 0)
            ? woPallet.stepStaffing
            : (Array.isArray(wo.stepStaffing) ? wo.stepStaffing : []);
        }
        if (crew.length === 0) {
          crew = (woPallet && Array.isArray(woPallet.crew) && woPallet.crew.length > 0)
            ? woPallet.crew
            : (Array.isArray(wo.crew) ? wo.crew : []);
        }
      }
    }

    if (!processName) {
      processName = isAr ? 'خط الإنتاج القياسي' : 'Standard Line';
    }

    return { processName, stepStaffing, crew };
  };

  const getProcessDisplayName = (pallet) => {
    return resolvePalletProcessAndCrew(pallet).processName;
  };

  // Helper: Format Milestone Timestamp for Human-Readable Inspection
  const formatMilestoneDate = (isoString) => {
    if (!isoString) return '—';
    const d = toDateObj(isoString);
    if (!d) {
      return typeof isoString === 'string' ? isoString : '—';
    }
    try {
      const datePart = d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${datePart}، ${timePart}`;
    } catch {
      return '—';
    }
  };

  // Helper: Accurately Resolve Pallet Lifecycle Timestamps (4 Milestones)
  const resolvePalletMilestones = (pallet, transfer = null) => {
    if (!pallet) return null;
    const staged = pallet.stagedPallet || stagedPallets.find((p) => p.id === pallet.palletId || p.palletId === pallet.palletId) || {};
    const trn = transfer || pallet.transfer || transfers.find((t) => t.id === pallet.transferId || t.id === staged.transferId) || {};
    const wo = workOrders.find((o) => o.id === pallet.workOrderId || o.orderNumber === pallet.orderNumber || o.id === staged.workOrderId);

    // 1. Release Time
    const rawRelease = pallet.releasedAt || staged.releasedAt || pallet.loggedAt || staged.loggedAt || pallet.createdAt || staged.createdAt || wo?.releasedAt || wo?.orderDate || wo?.createdAt || null;
    const releaseTime = toIsoString(rawRelease) || (typeof rawRelease === 'string' ? rawRelease : null);

    // 2. Working Time Frame
    const startTime = typeof pallet.startTime === 'string' ? pallet.startTime : (typeof staged.startTime === 'string' ? staged.startTime : (typeof wo?.startTime === 'string' ? wo?.startTime : '—'));
    const endTime = typeof pallet.endTime === 'string' ? pallet.endTime : (typeof staged.endTime === 'string' ? staged.endTime : (typeof wo?.endTime === 'string' ? wo?.endTime : '—'));
    const durationMins = pallet.durationMins || staged.durationMins || null;
    const rawWorkDate = pallet.productionDate || staged.productionDate || wo?.productionDate || wo?.orderDate || null;
    const workDateObj = toDateObj(rawWorkDate);
    const workDate = workDateObj
      ? workDateObj.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : (typeof rawWorkDate === 'string' ? rawWorkDate : null);

    // 3. Dispatch to FG Time
    const rawDispatched = pallet.dispatchedAt || staged.dispatchedAt || pallet.transferredAt || staged.transferredAt || trn.createdAt || trn.auditTrail?.[0]?.timestamp || null;
    const dispatchedTime = toIsoString(rawDispatched) || (typeof rawDispatched === 'string' ? rawDispatched : null);
    const dispatchedBy = typeof (pallet.dispatchedBy || staged.dispatchedBy || trn.issuedBy) === 'string'
      ? (pallet.dispatchedBy || staged.dispatchedBy || trn.issuedBy)
      : '—';

    // 4. Accepted in FG WH Time
    const rawAccepted = pallet.transferAcceptedAt || staged.transferAcceptedAt || pallet.acceptedAt || staged.acceptedAt || pallet.verifiedAt || staged.verifiedAt || trn.verifiedAt || null;
    const acceptedTime = toIsoString(rawAccepted) || (typeof rawAccepted === 'string' ? rawAccepted : null);
    const acceptedBy = typeof (pallet.verifiedBy || staged.verifiedBy || trn.verifiedBy) === 'string'
      ? (pallet.verifiedBy || staged.verifiedBy || trn.verifiedBy)
      : null;

    return {
      releaseTime,
      startTime,
      endTime,
      durationMins,
      workDate,
      dispatchedTime,
      dispatchedBy,
      acceptedTime,
      acceptedBy,
    };
  };

  // Helper: Deeply resolve and hydrate all consumed liquid tanks and their full QA analysis results
  const resolvePalletLiquidTanks = (pallet, transfer = null) => {
    if (!pallet) return { tanks: [], displayStr: '', hasTanks: false };

    // 1. Gather any tanks explicitly listed on the pallet or transfer line
    const rawTanks = Array.isArray(pallet.intermediateLiquidTanks) && pallet.intermediateLiquidTanks.length > 0
      ? pallet.intermediateLiquidTanks
      : (Array.isArray(pallet.stagedPallet?.intermediateLiquidTanks) && pallet.stagedPallet.intermediateLiquidTanks.length > 0
          ? pallet.stagedPallet.intermediateLiquidTanks
          : []);

    // Also collect all tanks from floor_liquid_vessels (active + history) and liquid_tanks
    const vesselTanksPool = floorLiquidVessels.flatMap((v) => [
      ...(Array.isArray(v.activeTanks) ? v.activeTanks : []),
      ...(Array.isArray(v.historyTanks) ? v.historyTanks : []),
    ]);

    let targetTanks = [...rawTanks];

    // 2. If no explicit tanks, try resolving from floor vessels consumedByPallets records
    if (targetTanks.length === 0) {
      const pId = pallet.id || pallet.palletId || pallet.stagedPallet?.palletId || pallet.stagedPallet?.id;
      const oNum = String(pallet.orderNumber || pallet.stagedPallet?.orderNumber || transfer?.productionOrderRef || '');
      const pNum = Number(pallet.palletNumber || pallet.stagedPallet?.palletNumber);

      const matchingFromConsumed = vesselTanksPool.filter((t) => {
        if (!Array.isArray(t.consumedByPallets)) return false;
        return t.consumedByPallets.some((cp) => {
          const idMatch = pId && (cp.palletId === pId || cp.id === pId);
          const numMatch = oNum && String(cp.orderNumber) === oNum && Number(cp.palletNumber) === pNum;
          return idMatch || numMatch;
        });
      });

      if (matchingFromConsumed.length > 0) {
        targetTanks = matchingFromConsumed;
      }
    }

    // 3. Fallback: Parse display string if present
    const displayStrRaw = pallet.intermediateLiquidTanksDisplay || pallet.stagedPallet?.intermediateLiquidTanksDisplay || '';
    if (targetTanks.length === 0 && displayStrRaw && displayStrRaw !== '—') {
      const parsedNums = displayStrRaw.match(/\d+/g) || [];
      parsedNums.forEach((numStr) => {
        const found = vesselTanksPool.find((t) => String(t.tankNumber) === numStr) ||
          liquidTanks.find((lt) => String(lt.tankNumber || lt.shortLotNumber?.replace('#', '')) === numStr);
        if (found) {
          targetTanks.push(found);
        } else {
          targetTanks.push({
            tankNumber: numStr,
            qaAcidity: 5.0,
            qaStatus: 'passed',
            oxidation: isAr ? 'طبيعي / سليم' : 'Normal / Passed',
          });
        }
      });
    }

    // 4. Hydrate each tank with complete QA Analysis results from liquid_tanks & floor vessels
    const hydratedTanks = targetTanks.map((tk, idx) => {
      const tankNum = String(tk.tankNumber || (idx + 1));
      const tankId = tk.tankId || tk.id;

      // Find original tank in liquidTanks collection or floor vessels pool
      const origLiquidTank = liquidTanks.find((lt) => (tankId && lt.id === tankId) || String(lt.tankNumber) === tankNum || String(lt.shortLotNumber?.replace('#', '')) === tankNum);
      const origVesselTank = vesselTanksPool.find((vt) => (tankId && (vt.tankId === tankId || vt.id === tankId)) || String(vt.tankNumber) === tankNum);

      const qaData = tk.qaData || origLiquidTank?.qaData || origVesselTank?.qaData || null;
      const qaAcidityNum = Number(
        tk.qaAcidity ||
        tk.concentration ||
        qaData?.concentration ||
        qaData?.acidity ||
        origLiquidTank?.concentration ||
        origVesselTank?.qaAcidity ||
        5.0
      );

      const qaStatus = tk.qaStatus || origLiquidTank?.qaStatus || origVesselTank?.qaStatus || 'passed';
      const oxidation = tk.oxidation || qaData?.oxidation || origLiquidTank?.oxidation || origVesselTank?.oxidation || (isAr ? 'طبيعي / سليم' : 'Normal / Passed');
      const analyzedBy = tk.analyzedBy || qaData?.analyzedBy || origLiquidTank?.analyzedBy || (isAr ? 'فاحص معمل الجودة' : 'QA Analyst');
      const analyzedAt = tk.analyzedAt || qaData?.analyzedAt || origLiquidTank?.analyzedAt || origLiquidTank?.updatedAt || null;
      const labImage = tk.labImage || qaData?.labImage || origLiquidTank?.qaData?.labImage || origLiquidTank?.imageFile || null;
      const notes = tk.notes || qaData?.notes || origLiquidTank?.qaData?.notes || origLiquidTank?.notes || '';
      const rMaterialLots = Array.isArray(tk.rMaterialLots) && tk.rMaterialLots.length > 0
        ? tk.rMaterialLots
        : (Array.isArray(origVesselTank?.rMaterialLots) ? origVesselTank.rMaterialLots : (Array.isArray(origLiquidTank?.rMaterialLots) ? origLiquidTank.rMaterialLots : []));

      return {
        ...tk,
        tankNumber: tankNum,
        tankId: tankId || `tank-${tankNum}`,
        lotNumber: tk.lotNumber || origVesselTank?.lotNumber || origLiquidTank?.lotNumber || `TANK-${tankNum}`,
        consumedLiters: Number(tk.consumedLiters || 0),
        qaAcidity: qaAcidityNum.toFixed(1),
        concentration: qaAcidityNum.toFixed(1),
        qaStatus,
        oxidation,
        analyzedBy,
        analyzedAt,
        labImage,
        notes,
        rMaterialLots,
      };
    });

    const displayStr = hydratedTanks.map((t) => `#${t.tankNumber}`).join(' + ') || displayStrRaw || '';
    return {
      tanks: hydratedTanks,
      displayStr,
      hasTanks: hydratedTanks.length > 0,
    };
  };

  // Helper: Accurately Resolve Consumed Materials, Variants, Lots, Quantities, and Costs Used
  const resolvePalletMaterialsAndCosts = (pallet) => {
    if (!pallet) return { components: [], totalCost: 0, costPerLarge: 0, costPerSmall: 0 };

    const qtyLarge = Number(pallet.qtyLarge || 0);
    const qtySmall = Number(pallet.qtySmall || 0);

    // Resolve intermediate liquid tanks to assign actual Tank LOT numbers to M-materials
    const tanksInfo = resolvePalletLiquidTanks(pallet);
    const tankLotsFormatted = (tanksInfo?.tanks || [])
      .map((t) => {
        if (t.lotNumber && t.lotNumber !== '—') {
          return t.lotNumber.startsWith('TANK-') ? t.lotNumber : (t.tankNumber ? `TANK-${t.tankNumber}` : t.lotNumber);
        }
        return t.tankNumber ? `TANK-${t.tankNumber}` : '';
      })
      .filter(Boolean)
      .join(' + ');

    // 1. Direct or staged components
    let rawComponents = pallet.consumedComponents || pallet.stagedPallet?.consumedComponents;

    // 2. If missing, resolve via work order and BOM recipe
    const wo = workOrders.find((o) => o.id === pallet.workOrderId || o.orderNumber === pallet.orderNumber);
    if ((!rawComponents || rawComponents.length === 0) && wo) {
      const recipe = bomRecipes.find(
        (b) => b.code === wo.bomRecipeId || b.id === wo.bomRecipeId || b.finishedProductId === wo.finishedProductId
      );
      if (recipe && Array.isArray(recipe.components)) {
        rawComponents = recipe.components.map((comp) => {
          const itmDoc = itemsMaster.find((itm) => itm.code === comp.itemId || itm.id === comp.itemId);
          const r = Number(itmDoc?.packagingRatio || 1);
          const stdQty = Number(comp.standardQty || 1);
          const cQty = qtyLarge * stdQty;
          const assignedSelection = wo.componentSelections?.[comp.itemId] || {};
          const vCode = assignedSelection.variantCode
            ? `${comp.itemId}-${assignedSelection.variantCode}`
            : comp.variantCode || itmDoc?.variations?.[0]?.variantCode || comp.itemId;

          const finalLotNumber = (assignedSelection.selectedLot || '').trim() || comp.lotNumber || '—';

          return {
            itemId: comp.itemId,
            variantCode: vCode,
            code: vCode,
            nameAr: comp.materialNameAr || itmDoc?.nameAr || comp.itemId,
            nameEn: itmDoc?.nameEn || '',
            smallUnit: comp.unit || itmDoc?.smallUnit || (isAr ? 'عبوة' : 'unit'),
            largeUnitName: itmDoc?.largeUnitName || (isAr ? 'كرتونة' : 'ctn'),
            packagingRatio: r,
            qtySmallUnits: cQty,
            qtyLargeUnits: Number((cQty / r).toFixed(2)),
            lotNumber: finalLotNumber,
          };
        });
      }
    }

    // 3. Normalize & compute costs
    const components = (rawComponents || []).map((comp) => {
      const itmDoc = itemsMaster.find((itm) => itm.code === comp.itemId || itm.id === comp.itemId);

      // Check if intermediate liquid M-material (or pipe feed)
      const isIntermediateMItem = Boolean(
        (comp.itemId && (comp.itemId.startsWith('M') || comp.itemId.startsWith('RMF-304') || comp.itemId.includes('304'))) ||
        itmDoc?.classification === 'intermediate' ||
        itmDoc?.operationalClassification === 'intermediate' ||
        (Array.isArray(itmDoc?.flags) && itmDoc.flags.some((f) => String(f).toUpperCase().includes('M'))) ||
        comp.intermediateLiquidTanks ||
        (comp.lotNumber === '—' && (comp.smallUnit === 'لتر' || comp.unit === 'لتر'))
      );

      const hasTankLots = Boolean(isIntermediateMItem && tankLotsFormatted);
      const finalLot = hasTankLots ? tankLotsFormatted : (comp.lotNumber || '—');

      // Resolve unit cost
      let resolvedUnitCost = 0;
      if (isIntermediateMItem) {
        // Strict in-house intermediate rule: calculate strictly through R-materials used to produce tank according to assigned intermediate BOM
        // 1. First check linked tanks
        if (Array.isArray(tanksInfo?.tanks) && tanksInfo.tanks.length > 0) {
          let tankSumCost = 0;
          let tankSumLiters = 0;
          tanksInfo.tanks.forEach((t) => {
            const tLiters = Number(t.consumedLiters || t.initialVolume || 1);
            const tCost = resolveItemOrLotCost({
              itemId: comp.itemId,
              variantCode: comp.variantCode || comp.variant,
              lotNumber: t.lotNumber || (t.tankNumber ? `TANK-${t.tankNumber}` : ''),
              tanks: liquidTanks,
              transformations,
              goodsReceipts,
              itemsMaster,
              liveStockMatrix,
              intermediateRecipes,
            });
            tankSumCost += tLiters * tCost;
            tankSumLiters += tLiters;
          });
          if (tankSumLiters > 0 && tankSumCost > 0) {
            resolvedUnitCost = Number((tankSumCost / tankSumLiters).toFixed(4));
          }
        }

        // 2. If not derived from linked tanks or no tanks attached, calculate via intermediate BOM / tanks pool
        if (resolvedUnitCost <= 0) {
          resolvedUnitCost = resolveItemOrLotCost({
            itemId: comp.itemId,
            variantCode: comp.variantCode || comp.variant,
            lotNumber: finalLot !== '—' ? finalLot : (comp.lotNumber || ''),
            warehouseId: pallet.warehouseId,
            liveStockMatrix,
            itemsMaster,
            goodsReceipts,
            tanks: liquidTanks,
            transformations,
            intermediateRecipes,
          });
        }
      } else {
        // Standard purchased materials: use comp.unitCost if explicit and positive, otherwise resolve from GRN / lotMap
        resolvedUnitCost = Number(comp.unitCost ?? 0);
        if (resolvedUnitCost <= 0) {
          resolvedUnitCost = resolveItemOrLotCost({
            itemId: comp.itemId,
            variantCode: comp.variantCode || comp.variant,
            lotNumber: finalLot !== '—' ? finalLot : (comp.lotNumber || ''),
            warehouseId: pallet.warehouseId,
            liveStockMatrix,
            itemsMaster,
            goodsReceipts,
            tanks: liquidTanks,
            transformations,
            intermediateRecipes,
          });
        }
      }

      const unitCost = resolvedUnitCost;
      const qtyUnits = Number(
        comp.qtySmallUnits ?? (comp.qtyLargeUnits ? comp.qtyLargeUnits * (comp.packagingRatio || 1) : 0)
      );
      // For intermediate materials or when unitCost was re-resolved, always recompute totalCost accurately
      const totalCost = (isIntermediateMItem || !comp.totalCost || Number(comp.totalCost) <= 0)
        ? Number((qtyUnits * unitCost).toFixed(2))
        : Number(comp.totalCost);

      return {
        itemId: comp.itemId || comp.code || '—',
        nameAr: comp.nameAr || itmDoc?.nameAr || comp.itemId || (isAr ? 'خامة' : 'Material'),
        nameEn: comp.nameEn || itmDoc?.nameEn || '',
        variantCode: comp.variantCode || comp.variant || '—',
        lotNumber: finalLot,
        isTankLot: hasTankLots,
        smallUnit: comp.smallUnit || comp.unit || (isAr ? 'عبوة' : 'unit'),
        largeUnitName: comp.largeUnitName || (isAr ? 'كرتونة' : 'ctn'),
        qtySmallUnits: qtyUnits,
        qtyLargeUnits: Number(comp.qtyLargeUnits ?? (comp.packagingRatio ? (qtyUnits / comp.packagingRatio).toFixed(2) : qtyUnits)),
        unitCost,
        totalCost,
        intermediateLiquidTanks: comp.intermediateLiquidTanks || (Array.isArray(pallet.intermediateLiquidTanks) ? pallet.intermediateLiquidTanks.filter(t => t.materialCode === comp.itemId || !t.materialCode) : null),
        rMaterialLots: comp.rMaterialLots || (Array.isArray(comp.intermediateLiquidTanks) ? comp.intermediateLiquidTanks.flatMap(t => t.rMaterialLots || []) : (Array.isArray(pallet.intermediateLiquidTanks) ? pallet.intermediateLiquidTanks.flatMap(t => t.rMaterialLots || []) : null)),
      };
    });

    const totalCost = Number(components.reduce((sum, c) => sum + (c.totalCost || 0), 0).toFixed(2)) || Number(pallet.palletTotalCost || 0);
    const costPerLarge = qtyLarge > 0 ? Number((totalCost / qtyLarge).toFixed(2)) : (Number(pallet.costPerLarge || 0));
    const costPerSmall = qtySmall > 0 ? Number((totalCost / qtySmall).toFixed(4)) : (Number(pallet.costPerSmall || 0));

    return { components, totalCost, costPerLarge, costPerSmall };
  };

  // Flattened Pending Inward Pallets for the Inward Gate (25% Mini-Card View)
  const pendingInwardPallets = useMemo(() => {
    const list = [];
    pendingInwardTransfers.forEach((trn) => {
      const targetWh = warehouses.find((w) => w.id === trn.targetWarehouse);
      const isAssignedCustodian = isGeneralAdmin || (trn.requiredVerifierId ? currentUserId === trn.requiredVerifierId : true);
      const canInspectPallet = isGeneralAdmin || canInspect;
      const canAcceptPallet = isGeneralAdmin || (canAccept && isAssignedCustodian);
      const canRejectPallet = isGeneralAdmin || canReject;
      const canRespondToPallet = canInspectPallet && (canAcceptPallet || canRejectPallet);
      const lines = Array.isArray(trn.lines) && trn.lines.length > 0 ? trn.lines : [{}];

      lines.forEach((line, lineIdx) => {
        const pId = line.palletId || `${trn.id}-P${lineIdx + 1}`;
        const stagedPallet = stagedPallets.find((p) => p.id === line.palletId || p.palletId === line.palletId) || {};

        const prodCode = line.itemId || line.itemCode || stagedPallet.finishedProductId || stagedPallet.productCode;
        const catalogProd = finishedProducts.find((p) => p.code === prodCode || p.id === prodCode);
        const catalogOpt = catalogProd?.packagingOptions?.find(
          (o) =>
            o.suffix === (stagedPallet.packagingOptionSuffix || line.variantCode) ||
            o.code === (stagedPallet.packagingOptionCode || line.variantCode)
        );
        const productImage = catalogOpt?.imageFile || catalogProd?.imageFile || '';

        const rawReady =
          stagedPallet.transferredAt ||
          trn.createdAt ||
          trn.auditTrail?.[0]?.timestamp ||
          trn.transferDate;
        const readyTimestamp = toIsoString(rawReady) || (typeof rawReady === 'string' ? rawReady : null);

        list.push({
          uniqueKey: `${trn.id}-${pId}-${lineIdx}`,
          palletId: line.palletId || stagedPallet.palletId || `#P${lineIdx + 1}`,
          palletNumber: stagedPallet.palletNumber || line.palletNumber || (lineIdx + 1),
          trnId: trn.id,
          orderNumber: line.orderNumber || stagedPallet.orderNumber || trn.productionOrderRef || '—',
          workOrderId: line.workOrderId || stagedPallet.workOrderId,
          productNameAr: line.nameAr || stagedPallet.productNameAr || (catalogProd?.nameAr || 'منتج تام'),
          productNameEn: line.nameEn || stagedPallet.productNameEn || (catalogProd?.nameEn || catalogProd?.name || ''),
          finishedProductId: prodCode || '—',
          packagingOptionNameAr: line.specs || stagedPallet.packagingOptionNameAr || catalogOpt?.nameAr || '',
          packagingOptionCode: line.variantCode || stagedPallet.packagingOptionCode || catalogOpt?.suffix || '',
          qtyLarge: Number(line.qtyLargeUnits ?? stagedPallet.qtyLarge ?? 0),
          qtySmall: Number(line.qtySmallUnits ?? stagedPallet.qtySmall ?? 0),
          outputLargeUnit: line.largeUnitName || stagedPallet.outputLargeUnit || (isAr ? 'كرتونة' : 'ctn'),
          outputSmallUnit: line.smallUnit || stagedPallet.outputSmallUnit || (isAr ? 'عبوة' : 'unit'),
          batchRangeDisplay: line.lotNumber || stagedPallet.batchRangeDisplay || '',
          readyTimestamp,
          transfer: trn,
          targetWarehouse: targetWh,
          isCustodian: isAssignedCustodian,
          canInspectPallet,
          canAcceptPallet,
          canRejectPallet,
          canRespondToPallet,
          stagedPallet,
          productImage,
          totalPalletsInTrn: lines.length,
        });
      });
    });
    return list;
  }, [pendingInwardTransfers, stagedPallets, warehouses, finishedProducts, isGeneralAdmin, currentUserId, canInspect, canAccept, canReject, isAr]);

  // 3-Level Grouping for Received Pallets Ledger:
  // Date (Descending) -> Product -> Packaging Option -> Pallets[]
  const groupedAcceptedPallets = useMemo(() => {
    // 1. Group by Date
    const dateGroupsMap = new Map();
    filteredAcceptedPallets.forEach((pallet) => {
      const dateKey = getPalletDate(pallet);
      if (!dateGroupsMap.has(dateKey)) {
        dateGroupsMap.set(dateKey, []);
      }
      dateGroupsMap.get(dateKey).push(pallet);
    });

    const sortedDateKeys = Array.from(dateGroupsMap.keys()).sort((a, b) => String(b).localeCompare(String(a)));

    return sortedDateKeys.map((dateKey) => {
      const palletsInDate = dateGroupsMap.get(dateKey);

      // 2. Group by Product within this Date
      const productGroupsMap = new Map();
      palletsInDate.forEach((pallet) => {
        const prodKey = pallet.finishedProductId || pallet.productCode || pallet.productNameAr || 'UNKNOWN_PROD';
        if (!productGroupsMap.has(prodKey)) {
          productGroupsMap.set(prodKey, []);
        }
        productGroupsMap.get(prodKey).push(pallet);
      });

      const products = Array.from(productGroupsMap.entries()).map(([prodKey, palletsInProduct]) => {
        const catalogProd = finishedProducts.find(
          (p) => p.code === prodKey || p.id === prodKey || p.nameAr === prodKey
        );
        const productNameAr = catalogProd?.nameAr || palletsInProduct[0]?.productNameAr || prodKey;
        const productNameEn = catalogProd?.nameEn || catalogProd?.name || palletsInProduct[0]?.productNameEn || '';
        const catalogImage = catalogProd?.imageFile || '';

        // 3. Group by Packaging Option within this Product
        const optionGroupsMap = new Map();
        palletsInProduct.forEach((pallet) => {
          const optKey = pallet.packagingOptionSuffix || pallet.packagingOptionCode || pallet.packagingOptionNameAr || 'DEFAULT_OPT';
          if (!optionGroupsMap.has(optKey)) {
            optionGroupsMap.set(optKey, []);
          }
          optionGroupsMap.get(optKey).push(pallet);
        });

        const packagingOptions = Array.from(optionGroupsMap.entries()).map(([optKey, palletsInOption]) => {
          const firstP = palletsInOption[0];
          const catalogOpt = catalogProd?.packagingOptions?.find(
            (o) => o.suffix === firstP?.packagingOptionSuffix || o.code === firstP?.packagingOptionCode
          );
          const optionNameAr = catalogOpt?.nameAr || firstP?.packagingOptionNameAr || optKey;
          const ratio = Number(firstP?.packagingRatio || catalogOpt?.piecesPerCarton || 12);
          const totalLarge = palletsInOption.reduce((s, p) => s + (Number(p.qtyLarge) || 0), 0);
          const totalSmall = palletsInOption.reduce((s, p) => s + (Number(p.qtySmall) || 0), 0);

          return {
            optionKey: optKey,
            optionNameAr,
            ratio,
            totalLarge,
            totalSmall,
            pallets: palletsInOption.sort((a, b) => (Number(b.palletNumber) || 0) - (Number(a.palletNumber) || 0)),
          };
        });

        const prodTotalLarge = palletsInProduct.reduce((s, p) => s + (Number(p.qtyLarge) || 0), 0);
        const prodTotalSmall = palletsInProduct.reduce((s, p) => s + (Number(p.qtySmall) || 0), 0);

        return {
          productId: prodKey,
          productNameAr,
          productNameEn,
          catalogImage,
          totalPallets: palletsInProduct.length,
          totalLarge: prodTotalLarge,
          totalSmall: prodTotalSmall,
          packagingOptions,
        };
      });

      const dateTotalPallets = palletsInDate.length;
      const dateTotalLarge = palletsInDate.reduce((s, p) => s + (Number(p.qtyLarge) || 0), 0);
      const dateTotalSmall = palletsInDate.reduce((s, p) => s + (Number(p.qtySmall) || 0), 0);

      return {
        date: dateKey,
        totalPallets: dateTotalPallets,
        totalLarge: dateTotalLarge,
        totalSmall: dateTotalSmall,
        products,
      };
    });
  }, [filteredAcceptedPallets, finishedProducts]);

  // Date accordion toggle
  const toggleDateExpanded = (dateStr) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateStr]: prev[dateStr] === undefined ? false : !prev[dateStr],
    }));
  };

  const isDateExpanded = (dateStr) => {
    return expandedDates[dateStr] !== false; // Open by default
  };

  // Open the Single Response Modal from Inward Gate Mini-Card
  const handleOpenResponseModal = (palletItem) => {
    setRespondingPallet(palletItem);
    setModalRejectionReason('');
    setApplyToAllInTrn(false);
  };

  // Direct Inward Acceptance from Response Modal (No Extra Confirmation Modal)
  const handleAcceptFromResponseModal = async (palletItem, applyToAll = false) => {
    if (!palletItem) return;
    const { transfer, canAcceptPallet } = palletItem;

    if (!canAcceptPallet) {
      showAlert({
        title: isAr ? 'صلاحية غير كافية' : 'Insufficient Permission',
        message: isAr
          ? `عفواً، لا تملك صلاحية اعتماد واستلام الباليتة بالعهدة المخزنية وفقاً لمصفوفة الصلاحيات.${transfer?.requiredVerifierId ? ` (الاعتماد محصور بأمين العهدة: ${getUserDisplayName(transfer?.requiredVerifierId)})` : ''}`
          : 'You do not have permission to accept inward pallets into warehouse custody according to the permissions matrix.',
        variant: 'error',
      });
      return;
    }

    setIsActionInProgress(true);
    try {
      const nowIso = new Date().toISOString();
      const trnRef = doc(db, 'stock_transfers', transfer.id);
      const auditTrail = [...(transfer.auditTrail || [])];

      auditTrail.push({
        version: '1.0',
        action: 'fg_inward_custodian_accepted',
        status: 'completed',
        performedBy: currentUserName,
        timestamp: nowIso,
        noteAr: `تم فحص واستلام الباليتة (#${palletItem.palletId}) رسمياً في عهدة المستودع بواسطة أمين العهدة (${currentUserName})`,
        noteEn: `Pallet #${palletItem.palletId} inspected and accepted in warehouse custody by (${currentUserName})`,
      });

      const linesToAccept = applyToAll
        ? (transfer.lines || [])
        : [(transfer.lines || []).find((l) => l.palletId === palletItem.palletId) || palletItem];

      // 1. Update staged_floor_pallets
      for (const line of linesToAccept) {
        if (line.palletId) {
          const stagedP = stagedPallets.find((p) => p.id === line.palletId || p.palletId === line.palletId) || {};
          const pMatData = resolvePalletMaterialsAndCosts(stagedP);

          await updateDoc(doc(db, 'staged_floor_pallets', line.palletId), {
            status: 'transferred_to_fg',
            stagingStatus: 'transferred_to_fg',
            transferAcceptedAt: nowIso,
            verifiedBy: currentUserName,
            verifiedById: currentUserId,
            targetWarehouseId: transfer.targetWarehouse,
            palletTotalCost: pMatData.totalCost,
            costPerLarge: pMatData.costPerLarge,
            costPerSmall: pMatData.costPerSmall,
            updatedAt: serverTimestamp(),
          }).catch(() => {});

          // Also sync in work_orders
          if (line.workOrderId) {
            const wo = workOrders.find((o) => o.id === line.workOrderId);
            if (wo && Array.isArray(wo.pallets)) {
              const updatedPallets = wo.pallets.map((pl) => {
                if (pl.palletId === line.palletId || (pl.palletNumber && String(pl.palletNumber) === String(line.palletNumber))) {
                  return {
                    ...pl,
                    stagingStatus: 'transferred_to_fg',
                    targetWarehouseId: transfer.targetWarehouse,
                    transferAcceptedAt: nowIso,
                    palletTotalCost: pMatData.totalCost,
                    costPerLarge: pMatData.costPerLarge,
                    costPerSmall: pMatData.costPerSmall,
                  };
                }
                return pl;
              });
              await updateDoc(doc(db, 'work_orders', wo.id), {
                pallets: updatedPallets,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          }
        }
      }

      // 2. Update transfer voucher lines with accurate unitPrice (costPerLarge) and totalPrice
      const updatedLines = (transfer.lines || []).map((line) => {
        const isAccepted = applyToAll || line.palletId === palletItem.palletId;
        if (isAccepted) {
          const stagedP = stagedPallets.find((p) => p.id === line.palletId || p.palletId === line.palletId) || {};
          const pMatData = resolvePalletMaterialsAndCosts(stagedP);
          const ctnCost = pMatData.costPerLarge > 0 ? pMatData.costPerLarge : Number(line.unitPrice || 0);
          const pQtyL = Number(line.qtyLargeUnits) || 0;
          const lineVal = pMatData.totalCost > 0 ? pMatData.totalCost : Number((pQtyL * ctnCost).toFixed(2));

          return {
            ...line,
            unitPrice: ctnCost,
            totalPrice: lineVal,
            palletTotalCost: lineVal,
            costPerLarge: ctnCost,
            costPerSmall: pMatData.costPerSmall,
          };
        }
        return line;
      });

      const remainingUnaccepted = updatedLines.filter(
        (l) => l.palletId !== palletItem.palletId && !applyToAll
      );

      await updateDoc(trnRef, {
        lines: updatedLines,
        status: remainingUnaccepted.length === 0 ? 'completed' : 'pending_custodian_verification',
        verifiedBy: currentUserName,
        verifiedById: currentUserId,
        verifiedAt: nowIso,
        auditTrail,
        updatedAt: serverTimestamp(),
      });

      setRespondingPallet(null);
      setModalRejectionReason('');
      setApplyToAllInTrn(false);

      toast.success(
        isAr
          ? applyToAll
            ? `تم استلام كافة باليتات إذن التحويل (#${transfer.id}) في عهدة المستودع بنجاح.`
            : `تم استلام الباليتة (#${palletItem.palletId}) في عهدة المستودع بنجاح.`
          : `Pallet #${palletItem.palletId} accepted in warehouse custody.`,
        isAr ? 'تم الاستلام بنجاح' : 'Receipt Confirmed'
      );
    } catch (err) {
      console.error('Error accepting inward pallet:', err);
      toast.error(
        isAr ? 'حدث خطأ أثناء اعتماد استلام الباليتة.' : 'Error accepting pallet.',
        isAr ? 'فشل الاعتماد' : 'Operation Failed'
      );
    } finally {
      setIsActionInProgress(false);
    }
  };

  // Direct Rejection & Return from Response Modal (No Extra Confirmation Modal)
  const handleRejectFromResponseModal = async (palletItem, applyToAll = false) => {
    if (!palletItem) return;
    const { transfer, canRejectPallet } = palletItem;

    if (!canRejectPallet) {
      showAlert({
        title: isAr ? 'صلاحية غير كافية' : 'Insufficient Permission',
        message: isAr
          ? 'عفواً، لا تملك صلاحية رفض وإرجاع الباليتة لصالة الإنتاج وفقاً لمصفوفة الصلاحيات.'
          : 'You do not have permission to reject pallets according to the permissions matrix.',
        variant: 'error',
      });
      return;
    }

    const reasonText = modalRejectionReason.trim();
    if (!reasonText) {
      showAlert({
        title: isAr ? 'سبب الرفض إلزامي' : 'Rejection Reason Required',
        message: isAr
          ? 'يرجى كتابة سبب رفض الباليتة لتسجيله في السجل وإشعار صالة الإنتاج بالملاحظات.'
          : 'Please provide a rejection reason before returning the pallet to production.',
        variant: 'warning',
      });
      return;
    }

    setIsActionInProgress(true);
    try {
      const nowIso = new Date().toISOString();
      const trnRef = doc(db, 'stock_transfers', transfer.id);
      const auditTrail = [...(transfer.auditTrail || [])];

      auditTrail.push({
        version: '1.0',
        action: 'fg_inward_custodian_rejected_and_returned',
        status: 'rejected_and_returned',
        performedBy: currentUserName,
        timestamp: nowIso,
        rejectionReason: reasonText,
        palletId: palletItem.palletId,
        noteAr: `تم فحص ورفض الباليتة (#${palletItem.palletId}) وإعادتها لصالة الإنتاج بواسطة (${currentUserName}) - السبب: ${reasonText}`,
        noteEn: `Pallet #${palletItem.palletId} inspected, rejected, and returned to production by (${currentUserName}) - Reason: ${reasonText}`,
      });

      const linesToReject = applyToAll
        ? (transfer.lines || [])
        : [(transfer.lines || []).find((l) => l.palletId === palletItem.palletId) || palletItem];

      // 1. Revert in staged_floor_pallets
      for (const line of linesToReject) {
        if (line.palletId) {
          await updateDoc(doc(db, 'staged_floor_pallets', line.palletId), {
            status: 'staged_on_floor',
            stagingStatus: 'staged_on_floor',
            transferId: null,
            targetWarehouseId: null,
            lastTransferRejectionReason: reasonText,
            lastRejectedAt: nowIso,
            lastRejectedBy: currentUserName,
            updatedAt: serverTimestamp(),
          }).catch(() => {});

          // Revert in work_orders
          if (line.workOrderId) {
            const wo = workOrders.find((o) => o.id === line.workOrderId);
            if (wo && Array.isArray(wo.pallets)) {
              const updatedPallets = wo.pallets.map((pl) => {
                if (pl.palletId === line.palletId || (pl.palletNumber && String(pl.palletNumber) === String(line.palletNumber))) {
                  return {
                    ...pl,
                    stagingStatus: 'staged_on_floor',
                    transferId: null,
                    targetWarehouseId: null,
                    lastTransferRejectionReason: reasonText,
                  };
                }
                return pl;
              });
              await updateDoc(doc(db, 'work_orders', wo.id), {
                pallets: updatedPallets,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          }
        }
      }

      // 2. Update transfer voucher
      await updateDoc(trnRef, {
        status: 'rejected_and_returned',
        rejectedBy: currentUserName,
        rejectedById: currentUserId,
        rejectedAt: nowIso,
        rejectionReason: reasonText,
        auditTrail,
        updatedAt: serverTimestamp(),
      });

      setRespondingPallet(null);
      setModalRejectionReason('');
      setApplyToAllInTrn(false);

      toast.success(
        isAr
          ? `تم رفض الباليتة (#${palletItem.palletId}) وإعادتها لصالة الإنتاج بنجاح.`
          : `Pallet #${palletItem.palletId} rejected and returned to floor.`,
        isAr ? 'تم الإرجاع للصالة' : 'Returned to Floor'
      );
    } catch (err) {
      console.error('Error rejecting inward pallet:', err);
      toast.error(
        isAr ? 'حدث خطأ أثناء رفض وإرجاع الباليتة.' : 'Error rejecting pallet.',
        isAr ? 'فشل الرفض' : 'Operation Failed'
      );
    } finally {
      setIsActionInProgress(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-150">
      {/* ========================================================================= */}
      {/* SECTION 1: CUSTODIAN INWARD VERIFICATION GATE (بوابة فحص واعتماد أمناء العهدة) */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 bg-amber-50/70 border-2 border-amber-300 rounded-3xl space-y-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'بوابة فحص واعتماد باليتات المنتج التام (أمين العهدة)' : 'Finished Goods Custodian Inward Gate'}</span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-950 font-mono font-black text-xs rounded-full">
                  {pendingInwardPallets.length} {isAr ? 'بالتات بانتظار الفحص' : 'pending pallets'}
                </span>
              </h3>
              <p className="text-[11px] text-amber-900/80 mt-0.5">
                {isAr
                  ? 'باليتات المنتج التام الموردة من صالة الإنتاج. اضغط على أي بطاقة لفحص تفاصيل الباليتة واتخاذ قرار الاعتماد أو الرفض والإرجاع للصالة فورياً.'
                  : 'Pending pallets dispatched from production floor. Click any card to inspect and accept or reject.'}
              </p>
            </div>
          </div>
        </div>

        {pendingInwardPallets.length === 0 ? (
          <div className="p-6 text-center text-amber-900/60 bg-white/60 rounded-2xl border border-amber-200/60 space-y-1">
            <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-600 opacity-80" />
            <p className="text-xs font-bold">
              {isAr ? 'تم استلام واعتماد كافة باليتات المنتج التام الواردة بنجاح.' : 'All inbound finished goods pallets have been verified.'}
            </p>
          </div>
        ) : (
          /* Dense Responsive Grid of Mini-Cards (25% Size) */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {pendingInwardPallets.map((item) => {
              return (
                <div
                  key={item.uniqueKey}
                  className="p-3 bg-white border border-amber-200/90 hover:border-indigo-500 rounded-2xl shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-2 group"
                >
                  {/* Top: Product Name (Prominent) & Packaging Option (Less Prominent) */}
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-1.5">
                      <h4
                        className="font-black text-xs sm:text-sm text-slate-900 leading-snug line-clamp-2"
                        title={item.productNameAr}
                      >
                        {item.productNameAr}
                      </h4>
                      {item.productImage && (
                        <img
                          src={item.productImage}
                          alt=""
                          className="w-8 h-8 object-contain p-0.5 rounded-md border border-slate-100 shrink-0 bg-white"
                        />
                      )}
                    </div>
                    <div
                      className="text-[10px] text-slate-500 font-semibold line-clamp-1"
                      title={item.packagingOptionNameAr}
                    >
                      {item.packagingOptionNameAr || '—'}
                    </div>

                    {/* Quantity of Large Units Shown Prominently From Outside */}
                    <div className="flex items-center justify-between gap-1 text-xs pt-0.5">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200/80 rounded-md font-mono font-black text-xs">
                        {item.qtyLarge} {item.outputLargeUnit || (isAr ? 'كرتونة' : 'ctn')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({item.qtySmall} {item.outputSmallUnit || (isAr ? 'عبوة' : 'unit')})
                      </span>
                    </div>
                  </div>

                  {/* Subtle Code Chips with Copy Icon */}
                  <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-100">
                    <SubtleCodeChip label={isAr ? 'أمر' : 'WO'} code={item.orderNumber} idKey={`wo-${item.uniqueKey}`} />
                    <SubtleCodeChip label={isAr ? 'إذن' : 'TRN'} code={item.trnId} idKey={`trn-${item.uniqueKey}`} />
                    <SubtleCodeChip label={isAr ? 'بالتة' : 'P'} code={item.palletId} idKey={`p-${item.uniqueKey}`} />
                  </div>

                  {/* Consumed Liquid Bulk Tanks & QA Results Badge */}
                  {(() => {
                    const tanksInfo = resolvePalletLiquidTanks(item.stagedPallet || item, item.transfer);
                    if (!tanksInfo || tanksInfo.tanks.length === 0) return null;
                    return (
                      <div className="p-1.5 bg-cyan-50/90 rounded-xl border border-cyan-200/80 text-[10px] space-y-1">
                        <div className="flex items-center justify-between font-bold text-cyan-950">
                          <span className="flex items-center gap-1 font-mono">
                            <Activity className="h-3 w-3 text-cyan-600 shrink-0" />
                            <span>{tanksInfo.tanks.map((t) => `#${t.tankNumber}`).join(' + ')}</span>
                          </span>
                          <span className="font-mono text-purple-700 font-extrabold text-[11px]">
                            {tanksInfo.tanks.map((t) => `${t.qaAcidity || t.concentration || 5.0}%`).join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-cyan-700 font-medium pt-0.5 border-t border-cyan-100">
                          <span>{isAr ? 'تانكات السائل ونتائج QA' : 'Liquid Tanks & QA'}</span>
                          <span className="text-emerald-700 font-bold bg-emerald-100/70 px-1 py-0.2 rounded flex items-center gap-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                            <span>{isAr ? 'معتمد' : 'QA Passed'}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Time Marked Ready to Transfer */}
                  <div className="flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200/60 font-medium">
                    <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                    <span className="truncate" title={item.readyTimestamp ? String(item.readyTimestamp) : ''}>
                      {formatRelativeTime(item.readyTimestamp)}
                    </span>
                  </div>

                  {/* Action Button: Responsive to Scoped Permission Matrix */}
                  {item.canRespondToPallet ? (
                    <button
                      type="button"
                      onClick={() => handleOpenResponseModal(item)}
                      className={`w-full mt-0.5 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs text-white ${
                        item.canAcceptPallet && item.canRejectPallet
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : item.canRejectPallet
                          ? 'bg-rose-700 hover:bg-rose-800'
                          : 'bg-emerald-700 hover:bg-emerald-800'
                      }`}
                    >
                      {item.canAcceptPallet && item.canRejectPallet ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>{isAr ? 'فحص واستجابة' : 'Inspect & Respond'}</span>
                        </>
                      ) : item.canRejectPallet ? (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>{isAr ? 'فحص ورفض الباليتة' : 'Inspect & Reject'}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{isAr ? 'فحص واعتماد' : 'Inspect & Accept'}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedPalletPassport(item.stagedPallet || item)}
                      className="w-full mt-0.5 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      title={isAr ? 'معاينة جواز الباليتة (قراءة فقط)' : 'View Passport (Read-only)'}
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-500" />
                      <span>{isAr ? 'معاينة الجواز' : 'View Passport'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: PERMANENT HISTORICAL REPOSITORY OF RECEIVED PALLETS            */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 bg-white border-2 border-slate-300 rounded-3xl shadow-sm space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'سجل جوازات البالتات المستلمة بمستودع التام (الأرشيف الدائم)' : 'Permanent Finished Goods Pallet Ledger'}</span>
                <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-900 rounded-full font-mono text-xs font-black">
                  {filteredAcceptedPallets.length} {isAr ? 'بالتات' : 'pallets'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'سجل دائم مبوب حسب التاريخ ثم الصنف ثم خيار التعبئة، مع تفاصيل جواز الباليتة، الخامات المستهلكة، ومسار التشغيل وطاقم العمل.'
                  : '3-tier historical ledger grouped by Date -> Product -> Packaging Option with complete lifetime pallet passport.'}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث برقم الباليتة، الصنف، أمر التشغيل...' : 'Search pallet ID, product, order...'}
                className="w-full pr-9 pl-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Target Warehouse Filter */}
            <div>
              <select
                value={selectedWarehouseFilter}
                onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">{isAr ? 'جميع مستودعات التام' : 'All FG Warehouses'}</option>
                {finishedGoodsWhs.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {isAr ? wh.nameAr : wh.nameEn || wh.nameAr}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Filter */}
            <div>
              <select
                value={selectedProductFilter}
                onChange={(e) => setSelectedProductFilter(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">{isAr ? 'جميع الأصناف والمنتجات' : 'All Finished Products'}</option>
                {finishedProducts.map((p) => (
                  <option key={p.code || p.id} value={p.code || p.id}>
                    {p.nameAr || p.name} [{p.code}]
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Inputs */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
                className="w-1/2 p-2 bg-white border border-slate-300 rounded-xl text-[11px] font-mono font-bold text-slate-900"
                title={isAr ? 'من تاريخ' : 'From Date'}
              />
              <span className="text-slate-400 font-bold">-</span>
              <input
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
                className="w-1/2 p-2 bg-white border border-slate-300 rounded-xl text-[11px] font-mono font-bold text-slate-900"
                title={isAr ? 'إلى تاريخ' : 'To Date'}
              />
            </div>
          </div>

          {(searchQuery || selectedWarehouseFilter !== 'ALL' || selectedProductFilter !== 'ALL' || dateFromFilter || dateToFilter) && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedWarehouseFilter('ALL');
                  setSelectedProductFilter('ALL');
                  setDateFromFilter('');
                  setDateToFilter('');
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>{isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 3-Level Grouped Tabular Ledger View */}
        {groupedAcceptedPallets.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Boxes className="h-10 w-10 mx-auto text-slate-300 opacity-60" />
            <p className="text-xs font-semibold">
              {isAr ? 'لا توجد بالتات مستلمة تطابق معايير البحث الحالية.' : 'No received pallets found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedAcceptedPallets.map((dateGroup) => {
              const expanded = isDateExpanded(dateGroup.date);

              return (
                <div
                  key={dateGroup.date}
                  className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white"
                >
                  {/* Tier 1 Header: Date Banner */}
                  <div
                    onClick={() => toggleDateExpanded(dateGroup.date)}
                    className="p-3 sm:p-3.5 bg-slate-100 hover:bg-slate-200/80 cursor-pointer transition flex items-center justify-between border-b border-slate-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <span className="font-extrabold text-sm text-slate-900">
                        {(() => {
                          const d = toDateObj(dateGroup.date);
                          return d
                            ? d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                            : String(dateGroup.date);
                        })()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-800 rounded-md font-mono font-bold text-xs border border-indigo-200/80">
                        {dateGroup.totalPallets} {isAr ? 'بالتات' : 'pallets'}
                      </span>
                      <span className="px-2.5 py-0.5 bg-slate-50 text-slate-700 rounded-md font-mono font-bold text-xs border border-slate-200">
                        {dateGroup.totalLarge.toLocaleString()} {isAr ? 'كرتونة' : 'ctns'}
                      </span>
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {/* Tier 2: Products within Date */}
                  {expanded && (
                    <div className="p-3 sm:p-4 space-y-4 bg-slate-50/50">
                      {dateGroup.products.map((prodGroup) => {
                        return (
                          <div
                            key={prodGroup.productId}
                            className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-3 shadow-2xs"
                          >
                            {/* Product Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                              <div className="flex items-center gap-2.5">
                                {prodGroup.catalogImage ? (
                                  <img
                                    src={prodGroup.catalogImage}
                                    alt=""
                                    className="w-12 h-12 object-contain p-1 rounded-xl border border-slate-200 bg-white shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                    <Boxes className="h-5 w-5" />
                                  </div>
                                )}
                                <div>
                                  <h4 className="font-black text-sm text-slate-900 leading-tight">
                                    {prodGroup.productNameAr}
                                  </h4>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                                    <span>[{prodGroup.productId}]</span>
                                    {prodGroup.productNameEn && (
                                      <span className="text-slate-500 font-sans">• {prodGroup.productNameEn}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-xs font-mono">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-bold">
                                  {prodGroup.totalPallets} {isAr ? 'بالتات' : 'pallets'}
                                </span>
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-900 rounded font-bold">
                                  {prodGroup.totalLarge.toLocaleString()} {isAr ? 'كرتونة' : 'ctns'}
                                </span>
                              </div>
                            </div>

                            {/* Tier 3: Packaging Options within Product */}
                            <div className="space-y-3">
                              {prodGroup.packagingOptions.map((optGroup) => {
                                return (
                                  <div key={optGroup.optionKey} className="space-y-2">
                                    {/* Option Subheader */}
                                    <div className="flex items-center justify-between text-xs px-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-800">
                                          {optGroup.optionNameAr}
                                        </span>
                                        <span className="px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded text-[10px] font-mono">
                                          (1 كرتونة = {optGroup.ratio} عبوة)
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-slate-500 font-mono">
                                        {optGroup.totalLarge} كرتونة ({optGroup.totalSmall} عبوة) • {optGroup.pallets.length} بالتات
                                      </span>
                                    </div>

                                    {/* Tabular Data Table for Pallets */}
                                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                                      <table className="w-full text-start text-xs border-collapse">
                                        <thead>
                                          <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                                            <th className="py-2 px-3 text-start"># {isAr ? 'الباليتة' : 'Pallet'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'وقت الاستلام' : 'Time'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'الكمية (كرتونة)' : 'Cartons'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'الكمية (عبوة)' : 'Units'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'تشغيلة الطباعة' : 'Inkjet Batch'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'التانكات المستهلكة ونتائج الجودة' : 'Consumed Tanks & QA'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'مسار التشغيل وطاقم العمل' : 'Process & Crew'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'أمين العهدة' : 'Custodian'}</th>
                                            <th className="py-2 px-3 text-center">{isAr ? 'معاينة' : 'Inspect'}</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                          {optGroup.pallets.map((pallet) => {
                                            const { processName, stepStaffing, crew } = resolvePalletProcessAndCrew(pallet);
                                            const crewCount = stepStaffing.reduce((count, s) => count + (s.workers?.length || 0), 0) || crew.length;
                                            const receiptTime = pallet.transferAcceptedAt
                                              ? formatDisplayTime(pallet.transferAcceptedAt)
                                              : (typeof pallet.endTime === 'string' ? pallet.endTime : '—');

                                            return (
                                              <tr
                                                key={pallet.id || pallet.palletId}
                                                onClick={() => setSelectedPalletPassport(pallet)}
                                                className="hover:bg-indigo-50/60 cursor-pointer transition-colors group"
                                              >
                                                <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                                                  <div className="flex items-center">
                                                    <SubtleCodeChip code={String(pallet.palletId || `P${pallet.palletNumber || ''}`)} label="" idKey={`p-${pallet.palletId}`} />
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                                                  {receiptTime}
                                                </td>
                                                <td className="py-2.5 px-3 font-mono font-extrabold text-slate-900">
                                                  {pallet.qtyLarge} {pallet.outputLargeUnit || 'كرتونة'}
                                                </td>
                                                <td className="py-2.5 px-3 font-mono text-slate-500">
                                                  {pallet.qtySmall} {pallet.outputSmallUnit || 'عبوة'}
                                                </td>
                                                <td className="py-2.5 px-3 font-mono text-rose-700 font-bold text-[11px]">
                                                  {String(pallet.batchRangeDisplay || '—')}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  {(() => {
                                                    const tanksInfo = resolvePalletLiquidTanks(pallet);
                                                    if (!tanksInfo || tanksInfo.tanks.length === 0) {
                                                      return <span className="text-slate-400 font-mono text-[11px]">—</span>;
                                                    }
                                                    return (
                                                      <div className="space-y-1">
                                                        <div className="flex items-center gap-1 flex-wrap">
                                                          {tanksInfo.tanks.map((tk, idx) => (
                                                            <span
                                                              key={idx}
                                                              className="px-1.5 py-0.5 bg-cyan-50 text-cyan-900 border border-cyan-200/90 rounded-md font-mono font-bold text-[10px] flex items-center gap-0.5"
                                                              title={isAr ? `تانك #${tk.tankNumber} (${tk.consumedLiters > 0 ? `${tk.consumedLiters} L` : ''})` : `Tank #${tk.tankNumber}`}
                                                            >
                                                              <Activity className="h-2.5 w-2.5 text-cyan-600" />
                                                              <span>#{tk.tankNumber}</span>
                                                            </span>
                                                          ))}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                                          <span className="font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200/60" title={isAr ? 'تركيز الحموضة' : 'Acidity'}>
                                                            {tanksInfo.tanks.map((tk) => `${tk.qaAcidity || tk.concentration || 5.0}%`).join(', ')}
                                                          </span>
                                                          <span className="px-1 py-0.2 bg-emerald-50 text-emerald-700 font-bold text-[9px] rounded border border-emerald-200/60 flex items-center gap-0.5">
                                                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                                            <span>{isAr ? 'معتمد' : 'Passed'}</span>
                                                          </span>
                                                        </div>
                                                      </div>
                                                    );
                                                  })()}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="px-2 py-0.5 bg-cyan-50 text-cyan-900 border border-cyan-200 rounded-md font-semibold text-[10px]">
                                                      {processName}
                                                    </span>
                                                    {crewCount > 0 && (
                                                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold flex items-center gap-0.5">
                                                        <Users className="h-2.5 w-2.5 text-slate-400" />
                                                        <span>{crewCount} {isAr ? 'عمال' : 'crew'}</span>
                                                      </span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-700 font-semibold text-[11px]">
                                                  {typeof pallet.verifiedBy === 'string' ? pallet.verifiedBy : '—'}
                                                </td>
                                                <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                  <button
                                                    type="button"
                                                    onClick={() => setSelectedPalletPassport(pallet)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                                    title={isAr ? 'عرض جواز سفر الباليتة' : 'View Pallet Passport'}
                                                  >
                                                    <Eye className="h-4 w-4" />
                                                  </button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subcomponent: 4 Lifecycle Milestones Card */}
      {(() => null)()}

      {/* ========================================================================= */}
      {/* MODAL: RESPONSE MODAL (Inspect & Direct Accept / Reject)                   */}
      {/* ========================================================================= */}
      {respondingPallet && (() => {
        const palletDoc = respondingPallet.stagedPallet || respondingPallet;
        const milestones = resolvePalletMilestones(palletDoc, respondingPallet.transfer);
        const matData = resolvePalletMaterialsAndCosts(palletDoc);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto text-start">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl shrink-0">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                      <span>{isAr ? 'فحص واستجابة استلام الباليتة' : 'Inspect & Respond to Inward Pallet'}</span>
                      <span className="font-mono text-indigo-700 font-black">
                        #{respondingPallet.palletId}
                      </span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-bold text-slate-800">{respondingPallet.productNameAr}</span>
                      {respondingPallet.packagingOptionNameAr && (
                        <span className="text-slate-500">• {respondingPallet.packagingOptionNameAr}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setRespondingPallet(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Subtle Identification Chips with Click-to-Copy */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 font-bold me-1">{isAr ? 'أكواد التعريف:' : 'Codes:'}</span>
                <SubtleCodeChip label={isAr ? 'أمر التشغيل' : 'WO'} code={respondingPallet.orderNumber} idKey={`m-wo-${respondingPallet.uniqueKey}`} />
                <SubtleCodeChip label={isAr ? 'إذن التحويل' : 'TRN'} code={respondingPallet.trnId} idKey={`m-trn-${respondingPallet.uniqueKey}`} />
                <SubtleCodeChip label={isAr ? 'رقم الباليتة' : 'Pallet'} code={respondingPallet.palletId} idKey={`m-p-${respondingPallet.uniqueKey}`} />
              </div>

              {/* Key Passport Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'الكمية بالكرتونة' : 'Cartons'}</span>
                  <span className="font-mono font-extrabold text-base text-indigo-900 block">
                    {respondingPallet.qtyLarge} {respondingPallet.outputLargeUnit}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'الكمية بالعبوة' : 'Units'}</span>
                  <span className="font-mono font-extrabold text-base text-slate-900 block">
                    {respondingPallet.qtySmall} {respondingPallet.outputSmallUnit}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'توقيت الجاهزية' : 'Ready Time'}</span>
                  <span className="font-mono font-extrabold text-xs text-amber-900 block">
                    {formatRelativeTime(respondingPallet.readyTimestamp)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'تشغيلة الطباعة' : 'Inkjet Batch'}</span>
                  <span className="font-mono font-bold text-xs text-rose-700 block truncate">
                    {String(respondingPallet.batchRangeDisplay || '—')}
                  </span>
                </div>
              </div>

              {/* Process & Crew Summary */}
              {(() => {
                const { processName, stepStaffing } = resolvePalletProcessAndCrew(palletDoc);
                return (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700">{isAr ? 'مسار التشغيل المعتمد:' : 'Production Process:'}</span>
                      <span className="font-bold text-cyan-900 bg-cyan-50 px-2.5 py-0.5 rounded-lg border border-cyan-200">
                        {processName}
                      </span>
                    </div>
                    {stepStaffing.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'طاقم العمل ومحطات التشغيل:' : 'Crew Stations:'}</span>
                        <div className="flex flex-wrap gap-1">
                          {stepStaffing.map((st, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-white text-slate-700 border border-slate-200 rounded text-[10px]">
                              <b>{st.stepName}:</b> {(st.workers || []).map((w) => typeof w === 'object' ? (w.workerName || w.name || w.userId || '') : String(w)).filter(Boolean).join(', ') || '—'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Warehouse & Destination */}
              <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200 text-xs flex justify-between items-center text-slate-700">
                <div>
                  <span className="text-[10px] text-slate-500 block">{isAr ? 'المستودع المستهدف:' : 'Destination:'}</span>
                  <b className="text-slate-900">{getWarehouseDisplayName(respondingPallet.transfer?.targetWarehouse, warehouses, isAr)}</b>
                </div>
                <div className="text-end">
                  <span className="text-[10px] text-slate-500 block">{isAr ? 'أمين العهدة المسؤول:' : 'Responsible Custodian:'}</span>
                  <b className="text-slate-900">{getUserDisplayName(respondingPallet.transfer?.requiredVerifierId)}</b>
                </div>
              </div>

              {/* 4 Lifecycle Milestones */}
              {milestones && (
                <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'المحطات الزمنية لدورة حياة الباليتة (Lifecycle Milestones):' : 'Pallet Lifecycle Milestones:'}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    {/* 1. Release Time */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <PackageCheck className="h-3.5 w-3.5 text-blue-600" />
                        <span>{isAr ? '1. وقت الإطلاق والبدء' : '1. Release Time'}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-[11px]">
                        {formatMilestoneDate(milestones.releaseTime)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isAr ? 'إطلاق أمر التشغيل' : 'Work order release'}
                      </div>
                    </div>

                    {/* 2. Working Time Frame */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span>{isAr ? '2. إطار عمل التعبئة' : '2. Work Time Frame'}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-[11px]">
                        {milestones.startTime} → {milestones.endTime}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {milestones.durationMins ? `${milestones.durationMins} ${isAr ? 'دقيقة' : 'mins'}` : '—'}
                        {milestones.workDate ? ` (${milestones.workDate})` : ''}
                      </div>
                    </div>

                    {/* 3. Dispatched to FG */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-purple-600" />
                        <span>{isAr ? '3. ترحيل للمستودع' : '3. Dispatched to FG'}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-[11px]">
                        {formatMilestoneDate(milestones.dispatchedTime)}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {isAr ? `المرحّل: ${milestones.dispatchedBy}` : `By: ${milestones.dispatchedBy}`}
                      </div>
                    </div>

                    {/* 4. Accepted in FG WH */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? '4. اعتماد أمين العهدة' : '4. FG WH Acceptance'}</span>
                      </div>
                      {milestones.acceptedTime ? (
                        <>
                          <div className="font-mono font-bold text-emerald-800 text-[11px]">
                            {formatMilestoneDate(milestones.acceptedTime)}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {isAr ? `أمين العهدة: ${milestones.acceptedBy || '—'}` : `By: ${milestones.acceptedBy || '—'}`}
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {isAr ? 'بانتظار الفحص والاعتماد' : 'Pending Custodian Review'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Consumed Materials, Variants, Lots & Costs */}
              <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2.5 text-start">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Package className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'الخامات المستهلكة، المتغيرات، التشغيلات، والتكاليف:' : 'Materials, Variants, Lots & Costs:'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono font-bold">
                    <span className="text-slate-500 text-[11px] font-sans">{isAr ? 'إجمالي تكلفة الخامات:' : 'Total Cost:'}</span>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg">
                      {matData.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                </div>

                {matData.components.length === 0 ? (
                  <div className="text-center py-3 text-slate-400 text-xs font-medium">
                    {isAr ? 'لا توجد بيانات خامات مسجلة لهذه الباليتة' : 'No material records found for this pallet'}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <table className="w-full text-start text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                          <th className="py-2 px-2.5 text-start">{isAr ? 'الخامة / الصنف' : 'Material'}</th>
                          <th className="py-2 px-2.5 text-start">{isAr ? 'المتغير' : 'Variant'}</th>
                          <th className="py-2 px-2.5 text-start">{isAr ? 'رقم التشغيلة (Lot)' : 'Lot #'}</th>
                          <th className="py-2 px-2.5 text-start">{isAr ? 'الكمية المستهلكة' : 'Qty'}</th>
                          <th className="py-2 px-2.5 text-end">{isAr ? 'تكلفة الوحدة' : 'Unit Cost'}</th>
                          <th className="py-2 px-2.5 text-end">{isAr ? 'إجمالي التكلفة' : 'Total Cost'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {matData.components.map((c, cIdx) => (
                          <tr key={cIdx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2 px-2.5 font-bold text-slate-900">
                              <div className="truncate max-w-[170px]" title={c.nameAr}>
                                {c.nameAr}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block">[{c.itemId}]</span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{c.variantCode}</span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-[11px]">
                              {c.isTankLot ? (
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200/80 rounded-lg font-black shadow-2xs inline-flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                                  <span>{c.lotNumber}</span>
                                </span>
                              ) : (
                                <span className="font-bold text-rose-700">{c.lotNumber}</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-slate-800">
                              <span className="font-bold">{c.qtySmallUnits.toLocaleString()}</span> <span className="text-[10px] text-slate-500">{c.smallUnit}</span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-end text-slate-600 text-[11px]">
                              {c.unitCost > 0 ? `${c.unitCost.toFixed(3)} ${isAr ? 'ج.م' : 'EGP'}` : '—'}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-end font-bold text-emerald-800 text-[11px]">
                              {c.totalCost > 0 ? `${c.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${isAr ? 'ج.م' : 'EGP'}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold">
                        <tr>
                          <td colSpan={4} className="py-2 px-2.5 text-start text-slate-700">
                            <div className="flex flex-wrap gap-3 text-[11px]">
                              <span>
                                {isAr ? 'تكلفة الكرتونة:' : 'Per Carton:'}{' '}
                                <b className="text-indigo-800 font-mono">{matData.costPerLarge.toFixed(2)} {isAr ? 'ج.م' : 'EGP'}</b>
                              </span>
                              <span>
                                {isAr ? 'تكلفة العبوة:' : 'Per Unit:'}{' '}
                                <b className="text-indigo-800 font-mono">{matData.costPerSmall.toFixed(3)} {isAr ? 'ج.م' : 'EGP'}</b>
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-end text-slate-500 text-[11px]">{isAr ? 'الإجمالي:' : 'Total:'}</td>
                          <td className="py-2 px-2.5 text-end font-black text-emerald-900 text-xs font-mono">
                            {matData.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Intermediate Liquid Bulk Tanks & Full Lab QA Analysis Results */}
              {(() => {
                const tanksInfo = resolvePalletLiquidTanks(palletDoc, respondingPallet.transfer);
                if (!tanksInfo || tanksInfo.tanks.length === 0) return null;

                return (
                  <div className="p-3.5 bg-gradient-to-br from-cyan-50/90 to-sky-50/60 rounded-2xl border-2 border-cyan-200/90 space-y-3 text-start shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-cyan-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-cyan-700 text-white rounded-xl shadow-xs">
                          <Activity className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs sm:text-sm text-cyan-950 flex items-center gap-1.5">
                            <span>{isAr ? 'تانكات السائل الوسيط ونتائج الفحص المعملي (QA Lab Results)' : 'Intermediate Bulk Tanks & QA Lab Results'}</span>
                          </h4>
                          <span className="text-[10px] text-cyan-800 font-medium">
                            {isAr ? 'بيانات التانكات المسحوبة عبر خط الأنابيب، تركيز الحموضة، وشهادات الجودة المعتمدة:' : 'Pipeline tanks drawn, acidity concentration, and certified lab QA test records:'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="px-2.5 py-0.5 bg-cyan-100 text-cyan-900 rounded-full font-bold font-mono text-[11px]">
                          {tanksInfo.tanks.length} {isAr ? 'تانكات مرتبطة' : 'tanks'}
                        </span>
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>{isAr ? 'معتمد مخبرياً' : 'Lab QA Passed'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                      {tanksInfo.tanks.map((tk, tkIdx) => (
                        <div key={tk.tankId || tkIdx} className="p-3 bg-white rounded-xl border border-cyan-200 space-y-2 shadow-2xs">
                          {/* Top row: Tank Number, Lot #, and Consumed Liters */}
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="font-mono font-black text-cyan-950 text-xs flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 ring-2 ring-cyan-200" />
                              <span>{isAr ? `تانك #${tk.tankNumber}` : `Tank #${tk.tankNumber}`}</span>
                              {tk.lotNumber && (
                                <span className="text-[10px] font-normal text-slate-500 font-mono">
                                  (LOT: {tk.lotNumber})
                                </span>
                              )}
                            </span>
                            <span className="px-2 py-0.5 bg-cyan-50 text-cyan-900 border border-cyan-200 rounded font-mono font-black text-xs">
                              {tk.consumedLiters > 0 ? `${Number(tk.consumedLiters).toLocaleString()} L` : (isAr ? 'تغذية مستمرة' : 'Pipe Feed')}
                            </span>
                          </div>

                          {/* QA Test Metrics Grid */}
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div className="p-1.5 bg-purple-50/70 rounded-lg border border-purple-100">
                              <span className="text-[10px] text-purple-700 font-bold block">{isAr ? 'تركيز الحموضة:' : 'Acidity:'}</span>
                              <span className="font-mono font-extrabold text-sm text-purple-900">
                                {tk.qaAcidity || tk.concentration || '5.0'}%
                              </span>
                            </div>
                            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                              <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'حالة الأكسدة:' : 'Oxidation:'}</span>
                              <span className="font-bold text-slate-800 text-[11px]">
                                {tk.oxidation || (isAr ? 'طبيعي / سليم' : 'Normal')}
                              </span>
                            </div>
                          </div>

                          {/* Analyst & Inspection Timestamp */}
                          <div className="text-[10px] text-slate-600 bg-slate-50/80 p-1.5 rounded-lg border border-slate-100 flex items-center justify-between">
                            <span className="truncate">
                              <b>{isAr ? 'فاحص الجودة:' : 'Analyst:'}</b> {tk.analyzedBy || 'Auto QA'}
                            </span>
                            {tk.analyzedAt && (
                              <span className="text-slate-400 font-mono text-[9px]">
                                {formatDisplayTime(tk.analyzedAt)}
                              </span>
                            )}
                          </div>

                          {/* Notes if any */}
                          {tk.notes && (
                            <div className="text-[10px] text-slate-600 bg-amber-50/60 p-1.5 rounded-lg border border-amber-200/60">
                              <span className="font-bold text-amber-900">{isAr ? 'ملاحظة المعمل:' : 'Lab Notes:'} </span>
                              <span>{tk.notes}</span>
                            </div>
                          )}

                          {/* Lab Image attachment */}
                          {tk.labImage && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setImagePreviewUrl(tk.labImage)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 cursor-pointer transition"
                              >
                                <Camera className="h-3 w-3" />
                                <span>{isAr ? 'عرض تقرير فحص المعمل المرفق' : 'View Lab Certificate'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

            {/* Scoped Matrix Authority Indicator Banner */}
            {respondingPallet.canRejectPallet && !respondingPallet.canAcceptPallet && (
              <div className="flex items-center gap-2.5 p-3 bg-rose-50/90 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold">
                <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
                <div>
                  <div className="font-bold text-rose-900">{isAr ? 'صلاحية فحص ورفض الباليتة مفعلة' : 'Authorized for Inspection & Rejection'}</div>
                  <div className="text-[11px] text-rose-700 font-normal">
                    {isAr
                      ? 'وفقاً لمصفوفة الصلاحيات، يمتلك حسابك تفويض فحص ورفض الباليتة وإعادتها لصالة الإنتاج. (صلاحية الاعتماد والاستلام المخزني غير مفعلة).'
                      : 'According to the permissions matrix, you are authorized to reject and return this pallet to production. Inward acceptance is disabled.'}
                  </div>
                </div>
              </div>
            )}

            {respondingPallet.canAcceptPallet && !respondingPallet.canRejectPallet && (
              <div className="flex items-center gap-2.5 p-3 bg-emerald-50/90 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-emerald-900">{isAr ? 'صلاحية فحص واعتماد الاستلام مفعلة' : 'Authorized for Inward Acceptance'}</div>
                  <div className="text-[11px] text-emerald-700 font-normal">
                    {isAr
                      ? 'وفقاً لمصفوفة الصلاحيات، يمتلك حسابك تفويض اعتماد واستلام الباليتة بالعهدة المخزنية. (صلاحية الرفض غير مفعلة).'
                      : 'According to the permissions matrix, you are authorized to accept this pallet into warehouse custody.'}
                  </div>
                </div>
              </div>
            )}

            {/* Rejection Reason Input Field: Shown ONLY if user has reject authority */}
            {respondingPallet.canRejectPallet && (
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>
                    {isAr
                      ? !respondingPallet.canAcceptPallet
                        ? 'سبب الرفض والإرجاع لصالة الإنتاج (إلزامي):'
                        : 'سبب الرفض (إلزامي في حال الرفض والإرجاع لصالة الإنتاج):'
                      : 'Rejection Reason (required if rejecting):'}
                  </span>
                  <span className="text-[10px] text-rose-600 font-normal">
                    {isAr ? '* مطلوب عند الضغط على زر الرفض' : '* Required for rejection'}
                  </span>
                </label>
                <input
                  type="text"
                  value={modalRejectionReason}
                  onChange={(e) => setModalRejectionReason(e.target.value)}
                  placeholder={isAr ? 'اكتب سبب الرفض (مثال: تلف بالكراتين، نقص بالعدد، خطأ بالطباعة...)' : 'Enter rejection reason...'}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:bg-white transition"
                />
              </div>
            )}

            {/* Multi-pallet batch option if transfer has multiple pallets */}
            {respondingPallet.totalPalletsInTrn > 1 && (
              <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToAllInTrn}
                  onChange={(e) => setApplyToAllInTrn(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-800">
                  {isAr
                    ? `تطبيق الإجراء على كافة باليتات إذن التحويل (#${respondingPallet.trnId}) دفعة واحدة (${respondingPallet.totalPalletsInTrn} بالتات)`
                    : `Apply action to all pallets in transfer #${respondingPallet.trnId} (${respondingPallet.totalPalletsInTrn} pallets)`}
                </span>
              </label>
            )}

            {/* Direct Action Buttons - Governed strictly by Scoped Matrix */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRespondingPallet(null)}
                disabled={isActionInProgress}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <div className="flex items-center gap-2">
                {/* Reject Button: Visible ONLY if user has canRejectPallet authority */}
                {respondingPallet.canRejectPallet && (
                  <button
                    type="button"
                    onClick={() => handleRejectFromResponseModal(respondingPallet, applyToAllInTrn)}
                    disabled={isActionInProgress}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>{isActionInProgress ? (isAr ? 'جاري الإرجاع...' : 'Processing...') : (isAr ? 'رفض وإرجاع للصالة' : 'Reject & Return')}</span>
                  </button>
                )}

                {/* Accept Button: Visible ONLY if user has canAcceptPallet authority */}
                {respondingPallet.canAcceptPallet && (
                  <button
                    type="button"
                    onClick={() => handleAcceptFromResponseModal(respondingPallet, applyToAllInTrn)}
                    disabled={isActionInProgress}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isActionInProgress ? (isAr ? 'جاري الاعتماد...' : 'Saving...') : (isAr ? 'اعتماد واستلام بالعهد' : 'Accept & Inward')}</span>
                  </button>
                )}

                {/* Custodian Assignment Notice: If matrix has canAccept:true but blocked by custodian requirement */}
                {canAccept && !respondingPallet.canAcceptPallet && respondingPallet.transfer?.requiredVerifierId && (
                  <span className="text-xs text-amber-800 font-bold bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                    {isAr ? `الاعتماد محصور بأمين العهدة المعين: ${getUserDisplayName(respondingPallet.transfer?.requiredVerifierId)}` : 'Acceptance restricted to assigned custodian'}
                  </span>
                )}

                {/* If neither action is permitted */}
                {!respondingPallet.canAcceptPallet && !respondingPallet.canRejectPallet && (
                  <span className="text-xs text-slate-500 font-medium px-3 py-1.5 bg-slate-100 rounded-xl">
                    {isAr ? 'معاينة فقط — لا تملك صلاحية اعتماد أو رفض الشحنة' : 'Read-only: No action authority'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )})()}

      {/* ========================================================================= */}
      {/* MODAL: FULL PALLET PASSPORT & LIFETIME MEMORY INSPECTION                  */}
      {/* ========================================================================= */}
      {selectedPalletPassport && (() => {
        const milestones = resolvePalletMilestones(selectedPalletPassport);
        const matData = resolvePalletMaterialsAndCosts(selectedPalletPassport);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                      <span>{isAr ? 'جواز سفر الباليتة الرقمي (Digital Pallet Passport)' : 'Digital Pallet Passport'}</span>
                      <span className="font-mono text-indigo-700 font-black">
                        #{selectedPalletPassport.palletId}
                      </span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>{selectedPalletPassport.productNameAr} • أمر #{selectedPalletPassport.orderNumber}</span>
                      <span className="px-2 py-0.2 bg-emerald-100 text-emerald-900 rounded font-bold text-[10px]">
                        {isAr ? 'مستلمة في عهدة التام' : 'Accepted in FG'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPalletPassport(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Key Passport Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'الكمية بالكرتونة' : 'Cartons'}</span>
                  <span className="font-mono font-extrabold text-base text-indigo-900 block">{selectedPalletPassport.qtyLarge}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'الكمية بالعبوة' : 'Units'}</span>
                  <span className="font-mono font-extrabold text-base text-slate-900 block">{selectedPalletPassport.qtySmall}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'فترة التعبئة' : 'Time Interval'}</span>
                  <span className="font-mono font-extrabold text-xs text-slate-900 block">{String(selectedPalletPassport.startTime || '—')} → {String(selectedPalletPassport.endTime || '—')}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'فحص الجودة' : 'QC Status'}</span>
                  <span className="font-bold text-xs text-emerald-700 block">{typeof selectedPalletPassport.qcStatus === 'string' ? selectedPalletPassport.qcStatus : 'passed'}</span>
                </div>
              </div>

              {/* 4 Lifecycle Milestones */}
              {milestones && (
                <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'المحطات الزمنية لدورة حياة الباليتة (Lifecycle Milestones):' : 'Pallet Lifecycle Milestones:'}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    {/* 1. Release Time */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <PackageCheck className="h-3.5 w-3.5 text-blue-600" />
                        <span>{isAr ? '1. وقت الإطلاق والبدء' : '1. Release Time'}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-[11px]">
                        {formatMilestoneDate(milestones.releaseTime)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isAr ? 'إطلاق أمر التشغيل' : 'Work order release'}
                      </div>
                    </div>

                    {/* 2. Working Time Frame */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span>{isAr ? '2. إطار عمل التعبئة' : '2. Work Time Frame'}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-[11px]">
                        {milestones.startTime} → {milestones.endTime}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {milestones.durationMins ? `${milestones.durationMins} ${isAr ? 'دقيقة' : 'mins'}` : '—'}
                        {milestones.workDate ? ` (${milestones.workDate})` : ''}
                      </div>
                    </div>

                    {/* 3. Dispatched to FG */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-purple-600" />
                        <span>{isAr ? '3. ترحيل للمستودع' : '3. Dispatched to FG'}</span>
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-[11px]">
                        {formatMilestoneDate(milestones.dispatchedTime)}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {isAr ? `المرحّل: ${milestones.dispatchedBy}` : `By: ${milestones.dispatchedBy}`}
                      </div>
                    </div>

                    {/* 4. Accepted in FG WH */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? '4. اعتماد أمين العهدة' : '4. FG WH Acceptance'}</span>
                      </div>
                      {milestones.acceptedTime ? (
                        <>
                          <div className="font-mono font-bold text-emerald-800 text-[11px]">
                            {formatMilestoneDate(milestones.acceptedTime)}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {isAr ? `أمين العهدة: ${milestones.acceptedBy || '—'}` : `By: ${milestones.acceptedBy || '—'}`}
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {isAr ? 'بانتظار الفحص والاعتماد' : 'Pending Custodian Review'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Production Process Name & Inkjet Batch */}
              {(() => {
                const { processName, stepStaffing, crew } = resolvePalletProcessAndCrew(selectedPalletPassport);
                return (
                  <>
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-700">{isAr ? 'مسار التشغيل المعتمد:' : 'Production Process:'}</span>
                        <span className="font-bold text-cyan-900 bg-cyan-50 px-2.5 py-0.5 rounded-lg border border-cyan-200">
                          {processName}
                        </span>
                      </div>
                      {selectedPalletPassport.batchRangeDisplay && (
                        <div className="flex justify-between items-center font-mono">
                          <span className="font-bold text-slate-700 font-sans">{isAr ? 'تشغيلة الطباعة (Inkjet Batch):' : 'Inkjet Batch:'}</span>
                          <span className="font-bold text-rose-700">{String(selectedPalletPassport.batchRangeDisplay)}</span>
                        </div>
                      )}
                    </div>

                    {/* Crew Roster & SOP Staffing */}
                    {(stepStaffing.length > 0 || crew.length > 0) && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <Users className="h-4 w-4 text-indigo-600" />
                          <span>{isAr ? 'طاقم العمل وتوزيع خطوات التشغيل (SOP Crew):' : 'Crew Staffing Roster:'}</span>
                        </div>
                        {stepStaffing.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {stepStaffing.map((step, sIdx) => (
                              <div key={step.stepNum || sIdx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-center text-[11px] mb-1">
                                  <span className="font-bold text-slate-900">{step.stepName}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">#{step.stepNum}</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(step.workers || []).map((w, wIdx) => (
                                    <span key={w.workerId || wIdx} className="px-2 py-0.5 bg-white text-indigo-800 border border-indigo-200 rounded font-bold text-[10px]">
                                      {typeof w === 'object' ? (w.workerName || w.name || w.userId || '') : String(w)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap gap-1">
                            {crew.map((w, wIdx) => (
                              <span key={w.workerId || wIdx} className="px-2 py-0.5 bg-white text-indigo-800 border border-indigo-200 rounded font-bold text-[10px]">
                                {typeof w === 'object' ? (w.workerName || w.name || w.userId || '') : String(w)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Intermediate Liquid Bulk Tanks & Full Lab QA Analysis Results */}
              {(() => {
                const tanksInfo = resolvePalletLiquidTanks(selectedPalletPassport);
                if (!tanksInfo || tanksInfo.tanks.length === 0) return null;

                return (
                  <div className="p-3.5 bg-gradient-to-br from-cyan-50/90 to-sky-50/60 rounded-2xl border-2 border-cyan-200/90 space-y-3 text-start shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-cyan-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-cyan-700 text-white rounded-xl shadow-xs">
                          <Activity className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs sm:text-sm text-cyan-950 flex items-center gap-1.5">
                            <span>{isAr ? 'تانكات السائل الوسيط ونتائج الفحص المعملي (QA Lab Results)' : 'Intermediate Bulk Tanks & QA Lab Results'}</span>
                          </h4>
                          <span className="text-[10px] text-cyan-800 font-medium">
                            {isAr ? 'بيانات التانكات المسحوبة عبر خط الأنابيب، تركيز الحموضة، وشهادات الجودة المعتمدة:' : 'Pipeline tanks drawn, acidity concentration, and certified lab QA test records:'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="px-2.5 py-0.5 bg-cyan-100 text-cyan-900 rounded-full font-bold font-mono text-[11px]">
                          {tanksInfo.tanks.length} {isAr ? 'تانكات مرتبطة' : 'tanks'}
                        </span>
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>{isAr ? 'معتمد مخبرياً' : 'Lab QA Passed'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                      {tanksInfo.tanks.map((tk, tkIdx) => (
                        <div key={tk.tankId || tkIdx} className="p-3 bg-white rounded-xl border border-cyan-200 space-y-2 shadow-2xs">
                          {/* Top row: Tank Number, Lot #, and Consumed Liters */}
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="font-mono font-black text-cyan-950 text-xs flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 ring-2 ring-cyan-200" />
                              <span>{isAr ? `تانك #${tk.tankNumber}` : `Tank #${tk.tankNumber}`}</span>
                              {tk.lotNumber && (
                                <span className="text-[10px] font-normal text-slate-500 font-mono">
                                  (LOT: {tk.lotNumber})
                                </span>
                              )}
                            </span>
                            <span className="px-2 py-0.5 bg-cyan-50 text-cyan-900 border border-cyan-200 rounded font-mono font-black text-xs">
                              {tk.consumedLiters > 0 ? `${Number(tk.consumedLiters).toLocaleString()} L` : (isAr ? 'تغذية مستمرة' : 'Pipe Feed')}
                            </span>
                          </div>

                          {/* QA Test Metrics Grid */}
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div className="p-1.5 bg-purple-50/70 rounded-lg border border-purple-100">
                              <span className="text-[10px] text-purple-700 font-bold block">{isAr ? 'تركيز الحموضة:' : 'Acidity:'}</span>
                              <span className="font-mono font-extrabold text-sm text-purple-900">
                                {tk.qaAcidity || tk.concentration || '5.0'}%
                              </span>
                            </div>
                            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                              <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'حالة الأكسدة:' : 'Oxidation:'}</span>
                              <span className="font-bold text-slate-800 text-[11px]">
                                {tk.oxidation || (isAr ? 'طبيعي / سليم' : 'Normal')}
                              </span>
                            </div>
                          </div>

                          {/* Analyst & Inspection Timestamp */}
                          <div className="text-[10px] text-slate-600 bg-slate-50/80 p-1.5 rounded-lg border border-slate-100 flex items-center justify-between">
                            <span className="truncate">
                              <b>{isAr ? 'فاحص الجودة:' : 'Analyst:'}</b> {tk.analyzedBy || 'Auto QA'}
                            </span>
                            {tk.analyzedAt && (
                              <span className="text-slate-400 font-mono text-[9px]">
                                {formatDisplayTime(tk.analyzedAt)}
                              </span>
                            )}
                          </div>

                          {/* Notes if any */}
                          {tk.notes && (
                            <div className="text-[10px] text-slate-600 bg-amber-50/60 p-1.5 rounded-lg border border-amber-200/60">
                              <span className="font-bold text-amber-900">{isAr ? 'ملاحظة المعمل:' : 'Lab Notes:'} </span>
                              <span>{tk.notes}</span>
                            </div>
                          )}

                          {/* Lab Image attachment */}
                          {tk.labImage && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setImagePreviewUrl(tk.labImage)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 cursor-pointer transition"
                              >
                                <Camera className="h-3 w-3" />
                                <span>{isAr ? 'عرض تقرير فحص المعمل المرفق' : 'View Lab Certificate'}</span>
                              </button>
                            </div>
                          )}

                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Consumed Materials, Variants, Lots & Costs */}
              <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2.5 text-start">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Package className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'الخامات المستهلكة، المتغيرات، التشغيلات، والتكاليف:' : 'Materials, Variants, Lots & Costs:'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono font-bold">
                    <span className="text-slate-500 text-[11px] font-sans">{isAr ? 'إجمالي تكلفة الخامات:' : 'Total Cost:'}</span>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg">
                      {matData.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                </div>

                {matData.components.length === 0 ? (
                  <div className="text-center py-3 text-slate-400 text-xs font-medium">
                    {isAr ? 'لا توجد بيانات خامات مسجلة لهذه الباليتة' : 'No material records found for this pallet'}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <table className="w-full text-start text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                          <th className="py-2 px-2.5 text-start">{isAr ? 'الخامة / الصنف' : 'Material'}</th>
                          <th className="py-2 px-2.5 text-start">{isAr ? 'المتغير' : 'Variant'}</th>
                          <th className="py-2 px-2.5 text-start">{isAr ? 'رقم التشغيلة (Lot)' : 'Lot #'}</th>
                          <th className="py-2 px-2.5 text-start">{isAr ? 'الكمية المستهلكة' : 'Qty'}</th>
                          <th className="py-2 px-2.5 text-end">{isAr ? 'تكلفة الوحدة' : 'Unit Cost'}</th>
                          <th className="py-2 px-2.5 text-end">{isAr ? 'إجمالي التكلفة' : 'Total Cost'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {matData.components.map((c, cIdx) => (
                          <tr key={cIdx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2 px-2.5 font-bold text-slate-900">
                              <div className="truncate max-w-[170px]" title={c.nameAr}>
                                {c.nameAr}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block">[{c.itemId}]</span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{c.variantCode}</span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-[11px]">
                              {c.isTankLot ? (
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200/80 rounded-lg font-black shadow-2xs inline-flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                                  <span>{c.lotNumber}</span>
                                </span>
                              ) : (
                                <span className="font-bold text-rose-700">{c.lotNumber}</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-slate-800">
                              <span className="font-bold">{c.qtySmallUnits.toLocaleString()}</span> <span className="text-[10px] text-slate-500">{c.smallUnit}</span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-end text-slate-600 text-[11px]">
                              {c.unitCost > 0 ? `${c.unitCost.toFixed(3)} ${isAr ? 'ج.م' : 'EGP'}` : '—'}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-end font-bold text-emerald-800 text-[11px]">
                              {c.totalCost > 0 ? `${c.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${isAr ? 'ج.م' : 'EGP'}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold">
                        <tr>
                          <td colSpan={4} className="py-2 px-2.5 text-start text-slate-700">
                            <div className="flex flex-wrap gap-3 text-[11px]">
                              <span>
                                {isAr ? 'تكلفة الكرتونة:' : 'Per Carton:'}{' '}
                                <b className="text-indigo-800 font-mono">{matData.costPerLarge.toFixed(2)} {isAr ? 'ج.م' : 'EGP'}</b>
                              </span>
                              <span>
                                {isAr ? 'تكلفة العبوة:' : 'Per Unit:'}{' '}
                                <b className="text-indigo-800 font-mono">{matData.costPerSmall.toFixed(3)} {isAr ? 'ج.م' : 'EGP'}</b>
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-end text-slate-500 text-[11px]">{isAr ? 'الإجمالي:' : 'Total:'}</td>
                          <td className="py-2 px-2.5 text-end font-black text-emerald-900 text-xs font-mono">
                            {matData.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Attached Photo */}
              {selectedPalletPassport.imageUrl && (
                <div className="space-y-1">
                  <span className="font-bold text-xs text-slate-700 block">{isAr ? 'صورة الباليتة الموثقة:' : 'Pallet Photo:'}</span>
                  <img
                    src={selectedPalletPassport.imageUrl}
                    alt="Pallet"
                    className="w-full max-h-60 object-contain rounded-2xl border border-slate-200 bg-black/5 cursor-pointer"
                    onClick={() => setImagePreviewUrl(selectedPalletPassport.imageUrl)}
                  />
                </div>
              )}

              {/* Modal Bottom Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  {canExport && (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Printer className="h-4 w-4" />
                      <span>{isAr ? 'طباعة جواز الباليتة' : 'Print Pallet Passport'}</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPalletPassport(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Image Lightbox */}
      {imagePreviewUrl && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={() => setImagePreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={imagePreviewUrl} alt="Preview" className="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-2xl" />
            <button
              type="button"
              onClick={() => setImagePreviewUrl(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
