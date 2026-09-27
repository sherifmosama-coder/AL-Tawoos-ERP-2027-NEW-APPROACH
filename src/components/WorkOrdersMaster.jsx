import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import {
  Factory,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  Sparkles,
  User,
  Calendar,
  Tag,
  Layers,
  Boxes,
  Package,
  RefreshCw,
  Barcode,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Eye,
  Edit3,
  Trash2,
  Camera,
  UploadCloud,
  FileText,
  Scale,
  Coffee,
  Wallet,
  Activity,
  ArrowRight,
  Sun,
  Moon,
  Gauge,
  SlidersHorizontal,
  Lock,
  Unlock,
  Search,
  Check,
  Flag,
  CircleDot,
  Users,
  Copy,
  History,
  QrCode,
  ShieldCheck,
  CheckSquare,
  ArrowLeftRight,
  Warehouse,
  Building2,
  MessageSquareText,
  Flame,
  Workflow,
  Star,
  Wrench,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  Printer,
  PackageCheck,
  RotateCcw,
  Split,
  Zap,
  GitBranch,
  CornerDownRight,
  ExternalLink
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import SearchableSelect from './SearchableSelect';
import VariantComboBox from './VariantComboBox';
import VariantIdentifierChip from './VariantIdentifierChip';
import { 
  buildLiveStockMatrix, 
  getFactoryFloorWarehouse, 
  getRawStorageWarehouses, 
  formatLotLabel, 
  formatVariantLabel, 
  formatQuantity, 
  resolveItemAllowFractions, 
  isFractionalUnit, 
  convertLargeToSmall,
  resolveItemOrLotCost
} from '../utils/stockResolver';
import { getFinishedGoodsWarehouses, getWarehouseDisplayName } from '../utils/warehouseClassifier';
import { calculatePalletBatchRange, buildBatchCode, translateBatchToPallets } from '../utils/inkjetBatchTranslator';
import { useNotification } from '../context/NotificationContext';

// Lightweight Client-Side Image Compression Helper (<80KB Web-Ready Payloads)
const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.75) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const elem = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        elem.width = width;
        elem.height = height;
        const ctx = elem.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(elem.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Time calculation helpers
const timeToMins = (t) => {
  if (!t) return 0;
  const p = String(t).split(':');
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
};

const minsToTime = (mins) => {
  const normalized = (mins + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const formatDuration = (mins, isAr = true) => {
  if (!mins || isNaN(mins)) return isAr ? '0 د' : '0m';
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return isAr ? `${h} س و ${m} د` : `${h}h ${m}m`;
  if (h > 0) return isAr ? `${h} س` : `${h}h`;
  return isAr ? `${m} د` : `${m}m`;
};

const calculateDuration = (startStr, endStr) => {
  if (!startStr || !endStr) return 0;
  const s = timeToMins(startStr);
  let e = timeToMins(endStr);
  if (e < s) e += 1440;
  return e - s;
};

export default function WorkOrdersMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const currentUserName = isAr ? (currentUser?.nameAr || 'المسؤول') : (currentUser?.name || 'Authorized User');
  const currentUserId = currentUser?.id || currentUser?.uid || '';

  // Dynamic Authority Resolvers
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['work_orders.canCreate'] !== undefined
      ? permissions.actions['work_orders.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['work_orders.canEdit'] !== undefined
      ? permissions.actions['work_orders.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canCancel = isGeneralAdmin || (
    permissions?.actions?.['work_orders.canCancel'] !== undefined
      ? permissions.actions['work_orders.canCancel'] === true
      : permissions?.actions?.canCancel === true
  );

  const canRegisterPallet = isGeneralAdmin || (
    permissions?.actions?.['work_orders.canRegisterPallet'] !== undefined
      ? permissions.actions['work_orders.canRegisterPallet'] === true
      : permissions?.actions?.canRegisterPallet !== false
  );

  const canTransferFg = isGeneralAdmin || (
    permissions?.actions?.['work_orders.canTransferFg'] !== undefined
      ? permissions.actions['work_orders.canTransferFg'] === true
      : permissions?.actions?.canTransferFg !== false
  );

  const canLogScrap = isGeneralAdmin || (
    permissions?.actions?.['work_orders.canLogScrap'] !== undefined
      ? permissions.actions['work_orders.canLogScrap'] === true
      : permissions?.actions?.canLogScrap !== false
  );

  // Themed Notifications & Alert modals
  const { toast, showConfirm, showAlert } = useNotification();
  const alert = (msg) => showAlert({ message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg), variant: 'warning' });

  // 3 Unified Sub-Tabs: 'plan' | 'today_prod' | 'live_tracking'
  const [activeSubTab, setActiveSubTab] = useState('plan');

  // Cloud Collections State
  const [workOrders, setWorkOrders] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [bomRecipes, setBomRecipes] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [globalBreaks, setGlobalBreaks] = useState([]);
  const [productionProcesses, setProductionProcesses] = useState([]);
  const [manualWorkers, setManualWorkers] = useState([]);
  const [faultyReturns, setFaultyReturns] = useState([]);
  const [stagedFloorMaterials, setStagedFloorMaterials] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [stagedFloorPallets, setStagedFloorPallets] = useState([]);
  const [floorLiquidVessels, setFloorLiquidVessels] = useState([]);
  const [liquidTanks, setLiquidTanks] = useState([]);
  const [intermediateRecipes, setIntermediateRecipes] = useState([]);
  const [tankOverridePallet, setTankOverridePallet] = useState(null);
  const [tankOverrideInput, setTankOverrideInput] = useState('');

  // --- GENERAL ADMIN INTERLINKED REVERSALS & EDITING STATE (Phase 1) ---
  const [adminDependencyModal, setAdminDependencyModal] = useState({
    open: false,
    pallet: null,
    order: null,
    blockers: [],
    details: '',
  });

  const [adminReversalModal, setAdminReversalModal] = useState({
    open: false,
    pallet: null,
    order: null,
    palletIndex: -1,
    reason: '',
    isSubmitting: false,
  });

  const [adminTransferGuidanceModal, setAdminTransferGuidanceModal] = useState({
    open: false,
    shortComponents: [],
    order: null,
    pallet: null,
    requiredCartons: 0,
  });

  const [adminOrderStatusPromptModal, setAdminOrderStatusPromptModal] = useState({
    open: false,
    order: null,
    newCompletionPct: 0,
    onChoice: null,
  });

  const [isAdminPalletAction, setIsAdminPalletAction] = useState(false);
  const [adminPalletReason, setAdminPalletReason] = useState('');
  const [adminPalletActionsMenuModal, setAdminPalletActionsMenuModal] = useState({
    open: false,
    order: null,
    pallet: null,
    pIdx: -1,
  });

  // Staged Floor Inventory & Transfer Modals
  const [showTransferFgModal, setShowTransferFgModal] = useState(false);
  const [transferFgGroup, setTransferFgGroup] = useState(null);
  const [transferFgWarehouseId, setTransferFgWarehouseId] = useState('');
  const [scrapAllocationModalItem, setScrapAllocationModalItem] = useState(null);
  const [scrapAllocationFormData, setScrapAllocationFormData] = useState({
    targetWarehouseId: '',
    allocatedQty: 1,
    notes: '',
  });
  const [showShiftTimelineSection, setShowShiftTimelineSection] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Quick Worker Modal State
  const [showQuickWorkerModal, setShowQuickWorkerModal] = useState(false);
  const [quickWorkerName, setQuickWorkerName] = useState('');
  const [quickWorkerRole, setQuickWorkerRole] = useState('عامل تشغيل');
  const [quickWorkerTargetContext, setQuickWorkerTargetContext] = useState(null); // { type: 'plan' | 'pallet', stepNum: 1 }

  // Rework & Defective Returns Integration State
  const [showFixesModal, setShowFixesModal] = useState(false);
  const [showFloorReceiptsModal, setShowFloorReceiptsModal] = useState(false);
  const [showReworkReconcileModal, setShowReworkReconcileModal] = useState(false);
  const [reconcilingOrder, setReconcilingOrder] = useState(null);
  const [reconcileMatrixData, setReconcileMatrixData] = useState({});
  const [showStagedScrapModal, setShowStagedScrapModal] = useState(false);
  const [showLogFloorScrapModal, setShowLogFloorScrapModal] = useState(false);
  const [scrapLogOrder, setScrapLogOrder] = useState(null);
  const [scrapLogFormData, setScrapLogFormData] = useState({
    itemId: '',
    variantCode: '',
    lotNumber: '',
    unitCost: 0,
    quantity: 1,
    unit: 'قطعة',
    targetWarehouseId: '',
    reason: 'تالف أثناء التعبئة',
    notes: '',
  });

  // Smart Date Boundary Initialization (Defaults to Today, or Tomorrow if after 16:30)
  const computeInitialShiftDate = () => {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    if (currentMins > 990) { // After 16:30
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    return now.toISOString().split('T')[0];
  };

  const [selectedPlanDate, setSelectedPlanDate] = useState(computeInitialShiftDate());
  const todayCalendarDateStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Strict Calendar Date Lockdown: Past work orders (today's date > planDate/execution date)
  // are permanently locked for everyone except General Admin
  const isOrderPastDate = (orderOrDate) => {
    if (!orderOrDate) return false;
    const d = typeof orderOrDate === 'string'
      ? orderOrDate
      : (orderOrDate.planDate || orderOrDate.productionDate || orderOrDate.orderDate || '');
    return Boolean(d && d < todayCalendarDateStr);
  };

  const isOrderLocked = (orderOrDate) => {
    if (isGeneralAdmin) return false;
    return isOrderPastDate(orderOrDate);
  };

  // Sub-Tab 2: Compact Pallet Inspection Popup Modal State
  const [inspectPalletModal, setInspectPalletModal] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lineFilter, setLineFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Sub-Tab 1: Plan Assignment & Edit Modal State
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanOrder, setEditingPlanOrder] = useState(null);
  const [auditOrderData, setAuditOrderData] = useState(null);
  const [feasibilityModalData, setFeasibilityModalData] = useState(null); // { order, feasibility }
  const [splitModalData, setSplitModalData] = useState(null); // { bottleneckInfo, planFormData }
  const [isPlanBomMatrixExpanded, setIsPlanBomMatrixExpanded] = useState(false); // Collapsed by default
  const [isOverviewBarExpanded, setIsOverviewBarExpanded] = useState(false); // Collapsible Plan Summary Bar
  const [imagePreviewModal, setImagePreviewModal] = useState(null); // High-res image preview lightbox popover
  const [copiedId, setCopiedId] = useState(null); // Feedback for copied record IDs
  const [activeNotePopoverId, setActiveNotePopoverId] = useState(null); // Interactive modern tooltip for order notes
  const [expandedNotesOrders, setExpandedNotesOrders] = useState({}); // Collapsible inline notes map for execution cards
  const [pinnedMatrixTooltip, setPinnedMatrixTooltip] = useState(null); // Pinned tooltip in rework matrix
  const [hoveredMatrixTooltip, setHoveredMatrixTooltip] = useState(null); // Hovered tooltip in rework matrix
  const [completePromptModal, setCompletePromptModal] = useState({ open: false, order: null, actionTime: '' }); // 3-option complete prompt

  // Floor Transfer Modal State (Triggered from Plan Overview Bar)
  const [showFloorTransferModal, setShowFloorTransferModal] = useState(false);
  const [floorTransferData, setFloorTransferData] = useState({
    sourceWarehouse: '',
    targetWarehouse: '',
    transferDate: '',
    productionOrderRef: '',
    transferMode: 'ceil', // 'ceil' (round up to whole packs) | 'exact' (exact deficit)
    notes: '',
    lines: [],
  });

  const [planFormData, setPlanFormData] = useState({
    orderNumber: '',
    planDate: computeInitialShiftDate(),
    finishedProductId: '',
    packagingOptionSuffix: 'A',
    packagingRatio: 12,
    bomRecipeId: '',
    productionLine: 'white_o',
    priority: 'today', // Default: خلال اليوم
    importanceRank: 1,
    qtyExactness: 'approximate', // Default: تقريبي
    plannedQtyLarge: 100,
    plannedQtySmall: 1200,
    componentSelections: {}, // { [itemId]: { variantCode, variantPolicy, selectedLot } }
    processId: '',
    processCode: '',
    processNameAr: '',
    processNameEn: '',
    stepStaffing: [], // [ { stepNum, stepName, stepDesc, mandatory, workers: [{ workerId, workerName, isManual }] } ]
    notes: '',
    isRework: false,
    reworkSourceVouchers: [],
    reworkFaultTags: [],
    missingSmallUnits: 0,
    originalReturnQtyLarge: null,
    originalReturnQtySmall: null,
    detectedFromOrderNumber: null,
  });

  // Helper to reliably extract and format original return quantities across all rework orders
  const getOriginalReturnQty = (order) => {
    if (!order || !order.isRework) return null;
    const ratio = Number(order.packagingRatio) || 12;

    let qtySmall = null;
    let qtyLarge = null;

    if (order.originalReturnQtySmall != null && Number(order.originalReturnQtySmall) > 0) {
      qtySmall = Number(order.originalReturnQtySmall);
      qtyLarge = order.originalReturnQtyLarge != null
        ? Number(order.originalReturnQtyLarge)
        : parseFloat((qtySmall / ratio).toFixed(4));
    } else if (Number(order.missingSmallUnits) > 0 && Number(order.plannedQtySmall) > 0) {
      qtySmall = Math.max(0, Number(order.plannedQtySmall) - Number(order.missingSmallUnits));
      qtyLarge = parseFloat((qtySmall / ratio).toFixed(4));
    } else if (Number(order.plannedQtySmall) > 0) {
      qtySmall = Number(order.plannedQtySmall);
      qtyLarge = Number(order.plannedQtyLarge) || parseFloat((qtySmall / ratio).toFixed(4));
    }

    if (qtySmall == null || qtySmall <= 0) return null;

    return {
      qtySmall,
      qtyLarge,
      missingSmall: Number(order.missingSmallUnits) || 0,
      largeUnit: order.outputLargeUnit || (isAr ? 'كرتونة' : 'Carton'),
      smallUnit: order.outputSmallUnit || (isAr ? 'عبوة' : 'Unit'),
    };
  };

  // Sub-Tab 2: Today's Production & Pallet Passport Modal State
  const [showPalletModal, setShowPalletModal] = useState(false);
  const [palletTargetOrder, setPalletTargetOrder] = useState(null);
  const [editingPalletIndex, setEditingPalletIndex] = useState(null);
  const [expandedPalletSteps, setExpandedPalletSteps] = useState({}); // { [palletKey]: boolean } - collapsed by default
  const togglePalletSteps = (palletKey) => {
    setExpandedPalletSteps((prev) => ({
      ...prev,
      [palletKey]: !prev[palletKey]
    }));
  };
  const [activeStaffPopover, setActiveStaffPopover] = useState(null); // Boundary-aware floating staff popover state

  // Auto-dismiss floating staff popover on window resize or scroll to prevent detaching
  useEffect(() => {
    if (!activeStaffPopover) return;
    const handleDismiss = () => setActiveStaffPopover(null);
    window.addEventListener('resize', handleDismiss);
    window.addEventListener('scroll', handleDismiss, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, { capture: true });
    };
  }, [activeStaffPopover]);

  // Boundary-aware positioning calculator for Staff Members popover
  const handleToggleStaffPopover = (e, order, pallet, pIdx, assignedWorkerNames, stepsCount) => {
    e.stopPropagation();
    const palletKey = `${order.id || ''}_${pallet.palletId || pIdx}`;
    if (activeStaffPopover?.key === palletKey) {
      setActiveStaffPopover(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Constrain width to 390px or viewport width minus safe padding
    const targetWidth = Math.min(390, windowWidth - 24);

    // Viewport-aware horizontal alignment (RTL right-aligned, LTR left-aligned, strictly clamped within screen edges)
    let left = isAr ? (rect.right - targetWidth) : rect.left;
    left = Math.max(12, Math.min(left, windowWidth - targetWidth - 12));

    // Viewport-aware vertical flip (if bottom space is cramped and top space is larger, open above the chip)
    const spaceBelow = windowHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 300 && spaceAbove > spaceBelow;

    const popoverStyle = {
      position: 'fixed',
      left: `${Math.round(left)}px`,
      width: `${targetWidth}px`,
      zIndex: 9999,
    };

    if (openUp) {
      popoverStyle.bottom = `${Math.round(windowHeight - rect.top + 8)}px`;
      popoverStyle.maxHeight = `${Math.max(180, Math.min(Math.round(spaceAbove - 24), 480))}px`;
    } else {
      popoverStyle.top = `${Math.round(rect.bottom + 8)}px`;
      popoverStyle.maxHeight = `${Math.max(180, Math.min(Math.round(spaceBelow - 24), 480))}px`;
    }

    const palletProcessCode = pallet.processCode || order.processCode || '';
    const palletTargetProc = productionProcesses.find(
      (p) => (p.id || p.processCode) === (pallet.processId || order.processId || palletProcessCode)
    );
    const palletProcessName = isAr
      ? (pallet.processNameAr || palletTargetProc?.nameAr || order.processNameAr || palletProcessCode)
      : (pallet.processNameEn || palletTargetProc?.nameEn || pallet.processNameAr || palletTargetProc?.nameAr || order.processNameAr || palletProcessCode);

    setActiveStaffPopover({
      key: palletKey,
      style: popoverStyle,
      openUp,
      order,
      pallet,
      palletProcessCode,
      palletProcessName,
      assignedWorkerNames,
      stepsCount,
      hasSteps: Array.isArray(pallet.stepStaffing) && pallet.stepStaffing.length > 0,
      hasCrew: Array.isArray(pallet.crew) && pallet.crew.length > 0,
    });
  };

  const [palletFormData, setPalletFormData] = useState({
    palletNumber: 1,
    qtyLarge: 50,
    qtySmall: 600,
    wrappingMachine: 'wrapping_1',
    startTime: minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))),
    endTime: '',
    status: 'completed',
    qcStatus: 'passed',
    processId: '',
    processCode: '',
    processNameAr: '',
    stepStaffing: [],
    crew: [],
    notes: '',
    imageUrl: '',
  });

  // Sub-Tab 3: Action Modals State (Pause, Resume, Complete)
  const [actionModal, setActionModal] = useState(null);
  const [actionFormData, setActionFormData] = useState({
    time: '',
    producedQtyLarge: '',
    producedQtySmall: '',
    notes: '',
  });

  // Global Break Modal State
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [breakFormData, setBreakFormData] = useState({
    startTime: '',
    endTime: '',
    notes: '',
  });

  // Manual Action Times State per Work Order card
  const [orderActionTimes, setOrderActionTimes] = useState({});

  // Subtab 2 Break Shortcut Quick Controls
  const [subtab2BreakTime, setSubtab2BreakTime] = useState('');
  const [subtab2BreakNotes, setSubtab2BreakNotes] = useState('');

  // Subscribe to Cloud Firestore Collections
  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, 'work_orders'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setWorkOrders(list);
      setLoading(false);
    });

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      setFinishedProducts(list);
    });

    const unsubBoms = onSnapshot(collection(db, 'bom_recipes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      setBomRecipes(list);
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      setItemsMaster(list);
    });

    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((w) => w.isActive !== false);
      setWarehouses(list);
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceipts(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubCategories = onSnapshot(collection(db, 'finished_product_categories'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, key: d.data().key || d.id }));
      setCategories(list);
    });

    const unsubBreaks = onSnapshot(collection(db, 'production_breaks'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setGlobalBreaks(list);
    });

    const unsubProcesses = onSnapshot(collection(db, 'production_processes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (a.processCode || a.code || '').localeCompare(b.processCode || b.code || '', undefined, { numeric: true }));
      setProductionProcesses(list);
    });

    const unsubWorkers = onSnapshot(collection(db, 'production_workers'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setManualWorkers(list);
    });

    const unsubReturns = onSnapshot(collection(db, 'faulty_fg_returns'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setFaultyReturns(list);
    });

    const unsubStagedFloor = onSnapshot(collection(db, 'staged_floor_materials'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setStagedFloorMaterials(list);
    });

    const unsubTransformations = onSnapshot(collection(db, 'production_transformations'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setTransformations(list);
    });

    const unsubStagedPallets = onSnapshot(collection(db, 'staged_floor_pallets'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setStagedFloorPallets(list);
    });

    const unsubFloorVessels = onSnapshot(collection(db, 'floor_liquid_vessels'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setFloorLiquidVessels(list);
    });

    const unsubTanks = onSnapshot(collection(db, 'liquid_tanks'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setLiquidTanks(list);
    });

    const unsubRecipes = onSnapshot(collection(db, 'intermediate_recipes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      setIntermediateRecipes(list);
    });

    return () => {
      unsubOrders();
      unsubProducts();
      unsubBoms();
      unsubItems();
      unsubWh();
      unsubGrns();
      unsubTransfers();
      unsubUsers();
      unsubCategories();
      unsubBreaks();
      unsubProcesses();
      unsubWorkers();
      unsubReturns();
      unsubStagedFloor();
      unsubTransformations();
      unsubStagedPallets();
      unsubFloorVessels();
      unsubTanks();
      unsubRecipes();
    };
  }, []);

  // Self-Healing Effect: Automatically detect and repair work orders with duplicate pallet numbers or colliding pallet IDs
  useEffect(() => {
    if (!workOrders || workOrders.length === 0) return;

    const repairDuplicatePallets = async () => {
      for (const order of workOrders) {
        if (!Array.isArray(order.pallets) || order.pallets.length <= 1) continue;

        const seenNumbers = new Set();
        const seenIds = new Set();
        let hasCollision = false;

        for (const p of order.pallets) {
          const num = Number(p.palletNumber);
          const id = p.palletId || `PAL-${order.orderNumber}-P${String(num).padStart(2, '0')}`;
          if (seenNumbers.has(num) || seenIds.has(id)) {
            hasCollision = true;
            break;
          }
          seenNumbers.add(num);
          seenIds.add(id);
        }

        if (hasCollision) {
          console.warn(`[WorkOrders Self-Healing] Found duplicate pallets in order ${order.orderNumber}. Re-indexing...`);

          const usedNums = new Set();
          let currentMax = 0;
          const repairedPallets = [];

          // Find current highest pallet number among all valid pallets
          order.pallets.forEach((p) => {
            const num = Number(p.palletNumber);
            if (num > currentMax) currentMax = num;
          });

          for (let i = 0; i < order.pallets.length; i++) {
            const p = { ...order.pallets[i] };
            let pNum = Number(p.palletNumber) || (i + 1);

            if (!usedNums.has(pNum)) {
              usedNums.add(pNum);
              p.palletNumber = pNum;
              p.palletId = `PAL-${order.orderNumber}-P${String(pNum).padStart(2, '0')}`;
              repairedPallets.push(p);
            } else {
              // Duplicate found: assign next sequential integer
              currentMax += 1;
              pNum = currentMax;
              usedNums.add(pNum);
              p.palletNumber = pNum;
              p.palletId = `PAL-${order.orderNumber}-P${String(pNum).padStart(2, '0')}`;
              repairedPallets.push(p);
            }
          }

          // Update work order document with repaired pallets
          try {
            await updateDoc(doc(db, 'work_orders', order.id), {
              pallets: repairedPallets,
              updatedAt: serverTimestamp(),
            });

            // Resync all pallets to staged_floor_pallets
            const ratio = Number(order.packagingRatio) || 12;
            for (const p of repairedPallets) {
              const pId = p.palletId;
              await setDoc(doc(db, 'staged_floor_pallets', pId), {
                id: pId,
                palletId: pId,
                palletNumber: p.palletNumber,
                workOrderId: order.id,
                orderNumber: order.orderNumber,
                finishedProductId: order.finishedProductId,
                productCode: order.productCode || order.finishedProductId,
                productNameAr: order.productNameAr,
                productNameEn: order.productNameEn || '',
                packagingOptionSuffix: order.packagingOptionSuffix || 'A',
                packagingOptionNameAr: order.packagingOptionNameAr || '',
                packagingOptionCode: order.packagingOptionCode || '',
                packagingRatio: ratio,
                outputLargeUnit: order.outputLargeUnit || 'كرتونة',
                outputSmallUnit: order.outputSmallUnit || 'عبوة',
                qtyLarge: Number(p.qtyLarge || 0),
                qtySmall: Number(p.qtySmall || (Number(p.qtyLarge || 0) * ratio)),
                wrappingMachine: p.wrappingMachine || 'wrapping_1',
                startTime: p.startTime || '',
                endTime: p.endTime || '',
                durationMins: p.durationMins || 0,
                status: p.status || 'completed',
                stagingStatus: p.stagingStatus || 'staged_on_floor',
                qcStatus: p.qcStatus || 'passed',
                productionDate: p.productionDate || order.productionDate || selectedPlanDate,
                batchStart: p.batchStart || null,
                batchEnd: p.batchEnd || null,
                batchRangeDisplay: p.batchRangeDisplay || '',
                imageUrl: p.imageUrl || '',
                imageFile: p.imageFile || '',
                updatedAt: serverTimestamp(),
              }, { merge: true });
            }
            console.log(`[WorkOrders Self-Healing] Successfully repaired order ${order.orderNumber} pallets and synced staged_floor_pallets.`);
          } catch (err) {
            console.error('[WorkOrders Self-Healing] Error repairing pallets:', err);
          }
        }
      }
    };

    repairDuplicatePallets();
  }, [workOrders, selectedPlanDate]);

  // Match Warehouse Helper
  const matchWh = (val, target) => {
    if (!val || !target) return false;
    return val === target.id || val === target.code || val === target.nameAr || val === target.nameEn;
  };

  // Dynamic Production Floor Warehouse Lookup (Avoids static ID hardcoding)
  const factoryWarehouse = useMemo(() => {
    return getFactoryFloorWarehouse(warehouses);
  }, [warehouses]);

  // ----------------------------------------------------
  // DEFECTIVE PRODUCT RETURNS & REWORK METRICS
  // ----------------------------------------------------
  // 1. Pending Production Floor Receipts (Handshake Pending)
  const pendingAcceptanceReturns = useMemo(() => {
    return faultyReturns.filter((r) => r.status === 'pending_acceptance');
  }, [faultyReturns]);

  // 2. Returns Already Received on Floor (Awaiting Rework/Fix)
  const receivedOnFloorReturns = useMemo(() => {
    return faultyReturns.filter((r) => r.status === 'received_on_floor');
  }, [faultyReturns]);

  // 3. Unique Products Ready on Floor for Rework (Aggregated by finishedProductId and packagingOptionSuffix)
  const floorReadyProductsMap = useMemo(() => {
    const map = new Map();
    receivedOnFloorReturns.forEach((voucher) => {
      const items = Array.isArray(voucher.items) && voucher.items.length > 0
        ? voucher.items
        : [{
            finishedProductId: voucher.finishedProductId,
            productCode: voucher.productCode,
            productNameAr: voucher.productNameAr,
            productNameEn: voucher.productNameEn,
            packagingOptionSuffix: voucher.packagingOptionSuffix || 'A',
            packagingOptionNameAr: voucher.packagingOptionNameAr || '',
            packagingOptionCode: voucher.packagingOptionCode || '',
            packagingRatio: voucher.packagingRatio,
            smallUnit: voucher.smallUnit,
            largeUnit: voucher.largeUnit,
            qtySmall: voucher.qtySmall,
            qtyLarge: voucher.qtyLarge,
            printedBatchNo: voucher.printedBatchNo,
            faultTags: voucher.faultTags,
            notes: voucher.notes,
          }];

      items.forEach((item) => {
        if (!item.finishedProductId) return;
        const optSuffix = item.packagingOptionSuffix || 'A';
        const aggKey = `${item.finishedProductId}_${optSuffix}`;
        const existing = map.get(aggKey) || {
          aggKey,
          finishedProductId: item.finishedProductId,
          productCode: item.productCode || item.finishedProductId,
          productNameAr: item.productNameAr || item.finishedProductId,
          productNameEn: item.productNameEn || '',
          packagingOptionSuffix: optSuffix,
          packagingOptionNameAr: item.packagingOptionNameAr || '',
          packagingOptionCode: item.packagingOptionCode || '',
          packagingRatio: Number(item.packagingRatio) || 12,
          smallUnit: item.smallUnit || 'عبوة',
          largeUnit: item.largeUnit || 'كرتونة',
          totalQtySmall: 0,
          totalQtyLarge: 0,
          missingSmallUnits: 0,
          batchCodes: new Set(),
          faultTags: new Set(),
          vouchers: [],
        };

        const itemLarge = Number(item.qtyLarge) || 0;
        const itemSmall = Number(item.qtySmall) || 0;
        existing.totalQtySmall += itemSmall;
        existing.totalQtyLarge += itemLarge;

        const expectedSmallFromLarge = Math.ceil(existing.totalQtyLarge) * existing.packagingRatio;
        if (expectedSmallFromLarge > existing.totalQtySmall) {
          existing.missingSmallUnits = expectedSmallFromLarge - existing.totalQtySmall;
        }

        if (item.printedBatchNo) {
          existing.batchCodes.add(item.printedBatchNo);
        } else if (voucher.printedBatchNo && (!voucher.items || voucher.items.length <= 1)) {
          existing.batchCodes.add(voucher.printedBatchNo);
        }

        if (Array.isArray(item.faultTags) && item.faultTags.length > 0) {
          item.faultTags.forEach((t) => existing.faultTags.add(t));
        } else if (Array.isArray(voucher.faultTags) && (!voucher.items || voucher.items.length <= 1)) {
          voucher.faultTags.forEach((t) => existing.faultTags.add(t));
        }

        if (!existing.vouchers.some((v) => v.id === voucher.id)) {
          existing.vouchers.push({
            id: voucher.id,
            returnDate: voucher.returnDate,
            sourceType: voucher.sourceType,
            notes: voucher.notes,
          });
        }

        map.set(aggKey, existing);
      });
    });
    return map;
  }, [receivedOnFloorReturns]);

  const uniqueProductsAwaitingFixCount = floorReadyProductsMap.size;

  // 4. Products scheduled in current selected plan date
  const scheduledProductIdsToday = useMemo(() => {
    return new Set(
      workOrders
        .filter((o) => o.planDate === selectedPlanDate && o.status !== 'cancelled')
        .map((o) => o.finishedProductId)
        .filter(Boolean)
    );
  }, [workOrders, selectedPlanDate]);

  // 5. Does any defective product match today's scheduled production runs?
  const hasMatchingProductInTodayPlan = useMemo(() => {
    if (floorReadyProductsMap.size === 0) return false;
    for (const prod of floorReadyProductsMap.values()) {
      if (scheduledProductIdsToday.has(prod.finishedProductId)) return true;
    }
    return false;
  }, [floorReadyProductsMap, scheduledProductIdsToday]);

  // 6. Dynamic 3-Color Badge Class for "تصليحات مطلوبة"
  const reworkBadgeColorClass = useMemo(() => {
    if (uniqueProductsAwaitingFixCount === 0) {
      return 'bg-emerald-500 text-white'; // Green when 0
    }
    if (hasMatchingProductInTodayPlan) {
      return 'bg-rose-600 text-white animate-pulse ring-2 ring-rose-300'; // Red when >= 1 matches today's plan
    }
    return 'bg-amber-500 text-white'; // Amber/Yellow when > 0 but none match today's plan
  }, [uniqueProductsAwaitingFixCount, hasMatchingProductInTodayPlan]);

  // 7. Active Staged Floor Materials (Scrap / Vendor Returns awaiting transfer)
  const activeStagedFloorMaterials = useMemo(() => {
    return stagedFloorMaterials.filter((m) => m.status === 'staged_on_floor');
  }, [stagedFloorMaterials]);

  // Compiled Live Stock & FIFO Lots Matrix (Single Source of Truth, including transformations)
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

  // Helper to resolve user name for custodian approvals
  const getUserDisplayName = (uId) => {
    if (!uId) return '';
    const u = usersList.find((x) => x.id === uId || x.uid === uId);
    if (!u) return uId;
    return isAr ? (u.nameAr || u.name || uId) : (u.name || u.nameAr || uId);
  };

  // Distinct Finished Goods Warehouses
  const finishedGoodsWarehouses = useMemo(() => {
    return getFinishedGoodsWarehouses(warehouses);
  }, [warehouses]);

  const defaultFinishedGoodsWarehouse = useMemo(() => {
    return finishedGoodsWarehouses[0] || warehouses.find((w) => w.classification === 'finished_goods') || null;
  }, [finishedGoodsWarehouses, warehouses]);

  // Active Staged Floor Pallets (Awaiting Transfer to Finished Goods Warehouse)
  const activeStagedFloorPallets = useMemo(() => {
    return stagedFloorPallets.filter((p) => p.status === 'staged_on_floor' || !p.status);
  }, [stagedFloorPallets]);

  // Grouped Staged Pallets by Product Name & Unique Packaging Option
  const groupedStagedPallets = useMemo(() => {
    const groups = {};
    activeStagedFloorPallets.forEach((pallet) => {
      const pId = pallet.finishedProductId || pallet.itemCode || 'UNKNOWN';
      const suffix = pallet.packagingOptionSuffix || pallet.variantSuffix || 'A';
      const groupKey = `${pId}_${suffix}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          groupKey,
          finishedProductId: pId,
          productCode: pallet.productCode || pId,
          productNameAr: pallet.productNameAr || pId,
          productNameEn: pallet.productNameEn || '',
          packagingOptionSuffix: suffix,
          packagingOptionNameAr: pallet.packagingOptionNameAr || '',
          packagingOptionCode: pallet.packagingOptionCode || '',
          packagingRatio: Number(pallet.packagingRatio) || 12,
          outputLargeUnit: pallet.outputLargeUnit || 'كرتونة',
          outputSmallUnit: pallet.outputSmallUnit || 'عبوة',
          totalPallets: 0,
          totalQtyLarge: 0,
          totalQtySmall: 0,
          pallets: [],
        };
      }
      groups[groupKey].totalPallets += 1;
      groups[groupKey].totalQtyLarge += Number(pallet.qtyLarge || 0);
      groups[groupKey].totalQtySmall += Number(pallet.qtySmall || 0);
      groups[groupKey].pallets.push(pallet);
    });
    return Object.values(groups);
  }, [activeStagedFloorPallets]);

  // Floor Movements Awaiting Custodian Verification
  const pendingFloorTransfers = useMemo(() => {
    const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
    return transfers.filter((t) => 
      t.status === 'pending_custodian_verification' && 
      (t.sourceWarehouse === factoryWhId || matchWh(t.sourceWarehouse, factoryWarehouse) || t.id?.startsWith('TRN-FG-') || t.id?.startsWith('TRN-SCRAP-'))
    );
  }, [transfers, factoryWarehouse]);

  // -------------------------------------------------------------------------
  // SMART VARIANT & LOT AUTO-SELECTION ENGINE
  // Scope for stock balance: Total Company Stock across all warehouses (Option C)
  // Preferred fallback when out of stock: Leave blank for operator (Option B)
  // Oldest FIFO LOT auto-pick: If oldest active lot has enough stock, auto-pick; else leave blank
  // -------------------------------------------------------------------------
  const resolveSmartComponentSelection = (comp, neededQty, currentSelection = null) => {
    const itemId = comp.itemId;
    const itemDoc = itemsMaster.find((itm) => itm.code === itemId || itm.id === itemId);
    const variationsList = itemDoc?.variations || [];

    // Clean BOM suffix and policies
    const cleanBomSuffix = comp.variantCode ? String(comp.variantCode).replace(`${itemId}-`, '') : '';
    const isBomMandatory = Boolean(cleanBomSuffix && comp.variantPolicy === 'mandatory');
    const isBomPreferred = Boolean(cleanBomSuffix && (comp.variantPolicy === 'preferred' || !comp.variantPolicy));

    // All active lots for this item across all warehouses (Total Company Stock - Option C)
    const allItemLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
      (l) => (l.itemId === itemId || l.itemId === itemDoc?.code) && Number(l.availableQty) > 0
    );

    // Helper: calculate total available stock for a variant suffix across all warehouses
    const getVariantTotalStock = (vSuffix) => {
      if (!vSuffix) return 0;
      const fullCode = `${itemId}-${vSuffix}`;
      return allItemLots
        .filter((l) => l.variantCode === fullCode || l.variantCode === vSuffix)
        .reduce((sum, l) => sum + (Number(l.availableQty) || 0), 0);
    };

    // 1. AUTO-RESOLVE VARIANT
    let autoVariantSuffix = '';
    let isAutoPickVariant = false;
    let variantReason = '';

    if (isBomMandatory) {
      autoVariantSuffix = cleanBomSuffix;
      isAutoPickVariant = true;
      variantReason = 'mandatory';
    } else if (isBomPreferred) {
      const prefStock = getVariantTotalStock(cleanBomSuffix);
      if (neededQty > 0 && prefStock >= neededQty) {
        autoVariantSuffix = cleanBomSuffix;
        isAutoPickVariant = true;
        variantReason = 'preferred_sufficient';
      } else {
        // Preferred variant has insufficient stock -> Leave BLANK for operator to decide (Option B)
        autoVariantSuffix = '';
        variantReason = 'preferred_insufficient';
      }
    } else {
      // Generic BOM (no variant specified)
      if (variationsList.length === 0) {
        autoVariantSuffix = '';
        variantReason = 'generic_item';
      } else {
        const qualifyingVariants = variationsList.filter((v) => {
          const vStock = getVariantTotalStock(v.suffix);
          return neededQty > 0 && vStock >= neededQty;
        });

        if (qualifyingVariants.length === 1) {
          autoVariantSuffix = qualifyingVariants[0].suffix;
          isAutoPickVariant = true;
          variantReason = 'single_sufficient';
        } else if (qualifyingVariants.length > 1) {
          autoVariantSuffix = '';
          variantReason = 'multiple_sufficient';
        } else {
          autoVariantSuffix = '';
          variantReason = 'none_sufficient';
        }
      }
    }

    // Determine final effective variant suffix
    const hasUserVariantChoice = currentSelection && currentSelection.variantCode !== undefined;
    const effectiveVariantSuffix = isBomMandatory
      ? cleanBomSuffix
      : (hasUserVariantChoice ? currentSelection.variantCode : autoVariantSuffix);

    // 2. AUTO-RESOLVE LOT (FIFO)
    const effectiveVariantFullCode = effectiveVariantSuffix ? `${itemId}-${effectiveVariantSuffix}` : '';
    const variantLots = effectiveVariantFullCode
      ? allItemLots.filter((l) => l.variantCode === effectiveVariantFullCode || l.variantCode === effectiveVariantSuffix)
      : (variationsList.length === 0 ? allItemLots : []);

    // Sort chronologically ascending (oldest FIFO first)
    variantLots.sort((a, b) => (a.receivedDate || a.date || '').localeCompare(b.receivedDate || b.date || ''));

    let autoLotNumber = '';
    let isAutoPickLot = false;
    let lotReason = '';

    const oldestLot = variantLots[0];
    if (oldestLot && neededQty > 0 && Number(oldestLot.availableQty) >= neededQty) {
      autoLotNumber = oldestLot.lotNumber;
      isAutoPickLot = true;
      lotReason = 'oldest_sufficient';
    } else if (oldestLot) {
      autoLotNumber = '';
      lotReason = 'oldest_insufficient';
    } else {
      autoLotNumber = '';
      lotReason = 'no_active_lots';
    }

    // If user explicitly chose a LOT and it belongs to this variant, keep it
    const hasUserLotChoice = currentSelection && currentSelection.selectedLot !== undefined;
    const isUserLotInVariant = hasUserLotChoice && (!currentSelection.selectedLot || variantLots.some((l) => l.lotNumber === currentSelection.selectedLot));

    const effectiveLotNumber = (hasUserLotChoice && isUserLotInVariant)
      ? currentSelection.selectedLot
      : autoLotNumber;

    return {
      variantSuffix: effectiveVariantSuffix,
      lotNumber: effectiveLotNumber,
      isAutoPickVariant,
      variantReason,
      isAutoPickLot,
      lotReason,
      isBomMandatory,
      isBomPreferred,
      cleanBomSuffix,
      variantLots,
      variationsList,
      oldestLot,
    };
  };

  // Helper to resolve live available floor & company stock for an item/variant from liveStockMatrix (Unified Source of Truth)
  const getComponentLiveStock = (comp, componentSelections = null) => {
    const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
    const allLots = Object.values(liveStockMatrix?.lotMap || {});
    const itemLots = allLots.filter((l) => l.itemId === comp.itemId && l.availableQty > 0);

    const cleanBomSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
    const isBomMandatory = Boolean(cleanBomSuffix && comp.variantPolicy === 'mandatory');

    const sel = componentSelections?.[comp.itemId] || {};
    const selectedVariantSuffix = isBomMandatory
      ? cleanBomSuffix
      : (sel.variantCode !== undefined ? sel.variantCode : '');

    const targetVariantCode = selectedVariantSuffix ? `${comp.itemId}-${selectedVariantSuffix}` : null;

    let matchingLots = itemLots;
    if (sel.selectedLot) {
      const lotMatches = itemLots.filter((l) => l.lotNumber === sel.selectedLot);
      if (lotMatches.length > 0) {
        matchingLots = lotMatches;
      }
    } else if (targetVariantCode) {
      const varMatches = itemLots.filter((l) => l.variantCode === targetVariantCode || l.variantCode === selectedVariantSuffix);
      if (varMatches.length > 0 || isBomMandatory) {
        matchingLots = varMatches;
      }
    }

    const floorStock = matchingLots
      .filter((l) => l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse))
      .reduce((sum, l) => sum + l.availableQty, 0);

    const totalCompanyStock = matchingLots.reduce((sum, l) => sum + l.availableQty, 0);

    return { floorStock, totalCompanyStock, targetVariantCode };
  };

  // BOM Material Feasibility Engine (Unified Source of Truth from liveStockMatrix, with Optional Commitments Map)
  const evaluateBomFeasibility = (
    bomRecipeId,
    plannedQtyLarge,
    componentSelections = null,
    commitmentsMap = null
  ) => {
    if (!bomRecipeId) return { status: 'no_bom', labelAr: 'بدون تركيبة معتمدة', color: 'slate', components: [] };
    const recipe = bomRecipes.find((b) => b.code === bomRecipeId || b.id === bomRecipeId);
    if (!recipe || !Array.isArray(recipe.components) || recipe.components.length === 0) {
      return { status: 'no_bom', labelAr: 'بدون تركيبة معتمدة', color: 'slate', components: [] };
    }

    let isFullyOnFloor = true;
    let isAvailableOverall = true;

    const componentsStatus = recipe.components.map((comp) => {
      const neededQty = Number(comp.standardQty || 1) * Number(plannedQtyLarge || 1);
      const currentSel = componentSelections?.[comp.itemId];
      const smartSel = resolveSmartComponentSelection(comp, neededQty, currentSel);

      const effectiveSelections = {
        ...(componentSelections || {}),
        [comp.itemId]: {
          variantCode: smartSel.variantSuffix,
          selectedLot: smartSel.lotNumber,
        }
      };

      const { floorStock: rawFloorStock, totalCompanyStock: rawCompanyStock, targetVariantCode } = getComponentLiveStock(comp, effectiveSelections);

      const varKey = targetVariantCode || comp.itemId;
      const priorReservedFloor = commitmentsMap
        ? ((commitmentsMap.byVariant?.[varKey] || 0) + (commitmentsMap.byItem?.[comp.itemId] || 0))
        : 0;
      const priorReservedCompany = priorReservedFloor;

      const effectiveFloorStock = Math.max(0, rawFloorStock - priorReservedFloor);
      const effectiveCompanyStock = Math.max(0, rawCompanyStock - priorReservedCompany);

      const itemDoc = itemsMaster.find((i) => i.code === comp.itemId || i.id === comp.itemId);
      const flagsArr = Array.isArray(itemDoc?.flags) ? itemDoc.flags : (itemDoc?.flag ? [itemDoc.flag] : []);
      const isMFlagged = flagsArr.some((f) => String(f).toUpperCase().includes('M')) || (comp.itemId && String(comp.itemId).toUpperCase().startsWith('M'));
      const isPipeFeeding = isMFlagged ||
        floorLiquidVessels.some((v) => v.materialCode === comp.itemId || v.id === comp.itemId) ||
        ((comp.unit || itemDoc?.smallUnit || '').includes('لتر') && (comp.materialNameAr || itemDoc?.nameAr || '').includes('خل'));

      const isSufficientOnFloor = isPipeFeeding ? true : (effectiveFloorStock >= neededQty);
      const isSufficientOverall = isPipeFeeding ? true : (effectiveCompanyStock >= neededQty);

      if (!isSufficientOnFloor) isFullyOnFloor = false;
      if (!isSufficientOverall) isAvailableOverall = false;

      return {
        itemId: comp.itemId,
        variantCode: comp.variantCode || targetVariantCode,
        variantPolicy: comp.variantPolicy || null,
        materialNameAr: comp.materialNameAr || comp.itemId,
        specs: comp.specs || '',
        standardQty: Number(comp.standardQty || 1),
        neededQty,
        floorStock: effectiveFloorStock,
        rawFloorStock,
        priorReservedFloor,
        totalCompanyStock: effectiveCompanyStock,
        rawCompanyStock,
        priorReservedCompany,
        unit: comp.unit || 'عبوة',
        isSufficientOnFloor,
        isSufficientOverall,
        transferDeficit: isPipeFeeding ? 0 : Math.max(0, neededQty - effectiveFloorStock),
        shortageDeficit: isPipeFeeding ? 0 : Math.max(0, neededQty - effectiveCompanyStock),
        isMFlagged,
        isPipeFeeding,
        smartSel,
      };
    });

    if (isFullyOnFloor) {
      return { status: 'floor_ready', labelAr: 'جاهز بالصالة (100%)', labelEn: 'Floor Ready', color: 'emerald', components: componentsStatus };
    }
    if (isAvailableOverall) {
      return { status: 'transfer_needed', labelAr: 'متاح بالمخزن (يتطلب تحويل)', labelEn: 'Transfer Needed', color: 'amber', components: componentsStatus };
    }
    return { status: 'shortage', labelAr: 'عجز في الخامات', labelEn: 'Material Shortage', color: 'rose', components: componentsStatus };
  };

  // -------------------------------------------------------------------------
  // SEQUENCE-AWARE WATERFALL FEASIBILITY ENGINE (Order Waterfall Allocation)
  // -------------------------------------------------------------------------
  const sequentialPlanFeasibilityMap = useMemo(() => {
    // 1. Filter active orders for the selected plan date
    const dateOrders = workOrders.filter(
      (o) => o.planDate === selectedPlanDate && o.status !== 'cancelled'
    );
    if (dateOrders.length === 0) return {};

    // 2. Sort by execution sequence (importanceRank), tie-break by orderNumber / id
    const sorted = [...dateOrders].sort((a, b) => {
      const rankA = Number(a.importanceRank) || 0;
      const rankB = Number(b.importanceRank) || 0;
      if (rankA !== rankB) return rankA - rankB;
      return (a.orderNumber || a.id || '').localeCompare(b.orderNumber || b.id || '');
    });

    // 3. Running tallies of allocated stock from the physical pool
    const allocatedFloorByVariant = {};
    const allocatedFloorByItem = {};
    const allocatedCompanyByVariant = {};
    const allocatedCompanyByItem = {};
    const resultMap = {};

    sorted.forEach((order) => {
      if (order.status === 'completed') {
        resultMap[order.id] = {
          status: 'floor_ready',
          labelAr: 'مكتمل الإنتاج',
          labelEn: 'Completed',
          color: 'emerald',
          components: [],
        };
        return;
      }

      if (!order.bomRecipeId) {
        resultMap[order.id] = {
          status: 'no_bom',
          labelAr: 'بدون تركيبة معتمدة',
          labelEn: 'No BOM',
          color: 'slate',
          components: [],
        };
        return;
      }

      const recipe = bomRecipes.find((b) => b.code === order.bomRecipeId || b.id === order.bomRecipeId);
      if (!recipe || !Array.isArray(recipe.components) || recipe.components.length === 0) {
        resultMap[order.id] = {
          status: 'no_bom',
          labelAr: 'بدون تركيبة معتمدة',
          labelEn: 'No BOM',
          color: 'slate',
          components: [],
        };
        return;
      }

      const ratio = Number(order.packagingRatio) || 12;
      const pallets = order.pallets || [];
      const producedLarge = order.totalProducedQtyLarge != null
        ? Number(order.totalProducedQtyLarge)
        : (pallets.length > 0
            ? pallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || (Number(p.qtySmall || 0) / ratio) || 0), 0)
            : (Number(order.totalProducedQtySmall || 0) / ratio));

      const plannedLarge = Number(order.plannedQtyLarge || 0);
      const remainingLarge = Math.max(0, plannedLarge - producedLarge);

      let isFullyOnFloor = true;
      let isAvailableOverall = true;

      const componentsStatus = recipe.components.map((comp) => {
        const stdQty = Number(comp.standardQty || 1);
        const neededQty = remainingLarge * stdQty;

        const { floorStock: rawFloorStock, totalCompanyStock: rawCompanyStock, targetVariantCode } = getComponentLiveStock(comp, order.componentSelections);

        const varKey = targetVariantCode || comp.itemId;
        const priorReservedFloor = (allocatedFloorByVariant[varKey] || 0) + (allocatedFloorByItem[comp.itemId] || 0);
        const priorReservedCompany = (allocatedCompanyByVariant[varKey] || 0) + (allocatedCompanyByItem[comp.itemId] || 0);

        const effectiveFloorStock = Math.max(0, rawFloorStock - priorReservedFloor);
        const effectiveCompanyStock = Math.max(0, rawCompanyStock - priorReservedCompany);

        const itemDoc = itemsMaster.find((i) => i.code === comp.itemId || i.id === comp.itemId);
        const flagsArr = Array.isArray(itemDoc?.flags) ? itemDoc.flags : (itemDoc?.flag ? [itemDoc.flag] : []);
        const isMFlagged = flagsArr.some((f) => String(f).toUpperCase().includes('M')) || (comp.itemId && String(comp.itemId).toUpperCase().startsWith('M'));
        const isPipeFeeding = isMFlagged ||
          floorLiquidVessels.some((v) => v.materialCode === comp.itemId || v.id === comp.itemId) ||
          ((comp.unit || itemDoc?.smallUnit || '').includes('لتر') && (comp.materialNameAr || itemDoc?.nameAr || '').includes('خل'));

        const isSufficientOnFloor = isPipeFeeding ? true : (effectiveFloorStock >= neededQty);
        const isSufficientOverall = isPipeFeeding ? true : (effectiveCompanyStock >= neededQty);

        if (!isSufficientOnFloor) isFullyOnFloor = false;
        if (!isSufficientOverall) isAvailableOverall = false;

        // Allocate this order's neededQty into the waterfall pool for subsequent orders (skip pipe feeding)
        if (!isPipeFeeding) {
          if (targetVariantCode) {
            allocatedFloorByVariant[varKey] = (allocatedFloorByVariant[varKey] || 0) + neededQty;
            allocatedCompanyByVariant[varKey] = (allocatedCompanyByVariant[varKey] || 0) + neededQty;
          } else {
            allocatedFloorByItem[comp.itemId] = (allocatedFloorByItem[comp.itemId] || 0) + neededQty;
            allocatedCompanyByItem[comp.itemId] = (allocatedCompanyByItem[comp.itemId] || 0) + neededQty;
          }
        }

        return {
          itemId: comp.itemId,
          variantCode: comp.variantCode || targetVariantCode,
          variantPolicy: comp.variantPolicy || null,
          materialNameAr: comp.materialNameAr || comp.itemId,
          specs: comp.specs || '',
          standardQty: stdQty,
          neededQty,
          floorStock: effectiveFloorStock,
          rawFloorStock,
          priorReservedFloor,
          totalCompanyStock: effectiveCompanyStock,
          rawCompanyStock,
          priorReservedCompany,
          unit: comp.unit || 'عبوة',
          isSufficientOnFloor,
          isSufficientOverall,
          transferDeficit: isMFlagged ? 0 : Math.max(0, neededQty - effectiveFloorStock),
          shortageDeficit: Math.max(0, neededQty - effectiveCompanyStock),
          isMFlagged,
        };
      });

      let status = 'shortage';
      let labelAr = 'عجز في الخامات';
      let labelEn = 'Material Shortage';
      let color = 'rose';

      if (isFullyOnFloor) {
        status = 'floor_ready';
        labelAr = 'جاهز بالصالة (100%)';
        labelEn = 'Floor Ready';
        color = 'emerald';
      } else if (isAvailableOverall) {
        status = 'transfer_needed';
        labelAr = 'متاح بالمخزن (يتطلب تحويل)';
        labelEn = 'Transfer Needed';
        color = 'amber';
      }

      resultMap[order.id] = {
        status,
        labelAr,
        labelEn,
        color,
        components: componentsStatus,
      };
    });

    return resultMap;
  }, [workOrders, selectedPlanDate, bomRecipes, itemsMaster, liveStockMatrix, factoryWarehouse, warehouses]);

  // Aggregated Plan Materials Requirements & Stock Balance Engine across all scheduled orders for the day (Specific Variant & LOT aware)
  const dailyPlanMaterialsOverview = useMemo(() => {
    const activePlanOrders = workOrders.filter(
      (o) => o.planDate === selectedPlanDate && o.status !== 'cancelled'
    );
    if (activePlanOrders.length === 0) return { list: [], totalReady: 0, totalTransfer: 0, totalShortage: 0 };

    const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
    const compMap = new Map();
    const allLots = Object.values(liveStockMatrix?.lotMap || {});

    activePlanOrders.forEach((order) => {
      const recipe = bomRecipes.find((b) => b.code === order.bomRecipeId || b.id === order.bomRecipeId);
      if (!recipe || !Array.isArray(recipe.components)) return;

      const plannedCartons = Number(order.plannedQtyLarge || 0);

      recipe.components.forEach((comp) => {
        const stdQty = Number(comp.standardQty || 1);
        const neededSmall = plannedCartons * stdQty;

        const itemDoc = itemsMaster.find((i) => i.code === comp.itemId || i.id === comp.itemId);
        const variationsList = itemDoc?.variations || [];
        const cleanBomSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
        const isBomMandatory = Boolean(cleanBomSuffix && comp.variantPolicy === 'mandatory');

        // Active lots for this item
        const activeLots = allLots.filter((l) => l.itemId === comp.itemId && l.availableQty > 0);

        // Resolve componentSelection from order
        const sel = order.componentSelections?.[comp.itemId] || {};

        let selectedVariantSuffix = '';
        if (isBomMandatory) {
          selectedVariantSuffix = cleanBomSuffix;
        } else if (sel.variantCode !== undefined && sel.variantCode !== '') {
          selectedVariantSuffix = sel.variantCode;
        } else if (cleanBomSuffix) {
          selectedVariantSuffix = cleanBomSuffix;
        } else {
          const sortedLots = [...activeLots].sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
          selectedVariantSuffix = sortedLots[0]?.variantCode ? sortedLots[0].variantCode.replace(`${comp.itemId}-`, '') : '';
        }

        const selectedVariantFullCode = selectedVariantSuffix ? `${comp.itemId}-${selectedVariantSuffix}` : '';
        const selectedVariantObj = variationsList.find(
          (v) => v.suffix === selectedVariantSuffix || v.variantCode === selectedVariantFullCode
        );

        // Resolve LOT
        const variantLots = selectedVariantFullCode
          ? activeLots.filter((l) => l.variantCode === selectedVariantFullCode)
          : activeLots;
        variantLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
        const defaultLotNo = variantLots[0]?.lotNumber || '';
        const resolvedLotNumber = sel.selectedLot || defaultLotNo || '';
        const isManualLot = Boolean(sel.selectedLot);

        // Packaging and Units
        const packagingRatio = Number(selectedVariantObj?.packagingRatio || itemDoc?.packagingRatio || 1);
        const largeUnitName = selectedVariantObj?.largeUnitName || itemDoc?.largeUnitName || (isAr ? 'كرتونة' : 'Carton');
        const smallUnit = comp.unit || selectedVariantObj?.smallUnit || itemDoc?.smallUnit || (isAr ? 'عبوة' : 'Unit');
        const materialNameAr = comp.materialNameAr || itemDoc?.nameAr || comp.itemId;
        const materialNameEn = itemDoc?.nameEn || materialNameAr;
        const specsText = selectedVariantObj
          ? ((selectedVariantObj.specs || []).map((s) => `${s.label}: ${s.value}`).join(' • ') || selectedVariantObj.mergedSpecs || '')
          : (itemDoc?.mergedSpecs || '');
        const supplierName = selectedVariantObj?.supplierName || '';

        // Detect if item is M-Flagged (In-House Manufactured Intermediate Liquid supplied via pipes)
        const flagsArr = Array.isArray(itemDoc?.flags) ? itemDoc.flags : (itemDoc?.flags ? [itemDoc.flags] : []);
        const isMFlagged = flagsArr.some((f) => String(f).toUpperCase().includes('M')) || (comp.itemId && String(comp.itemId).toUpperCase().startsWith('M'));
        const isPipeFeeding = isMFlagged ||
          floorLiquidVessels.some((v) => v.materialCode === comp.itemId || v.id === comp.itemId) ||
          ((comp.unit || itemDoc?.smallUnit || '').includes('لتر') && (comp.materialNameAr || itemDoc?.nameAr || '').includes('خل'));

        // Composite key grouping: Same Item + Same Variant + Same LOT
        const key = `${comp.itemId}___${selectedVariantSuffix || 'GENERIC'}___${resolvedLotNumber || 'FIFO'}`;

        if (!compMap.has(key)) {
          compMap.set(key, {
            key,
            itemId: comp.itemId,
            isMFlagged,
            isPipeFeeding,
            materialNameAr,
            materialNameEn,
            variantSuffix: selectedVariantSuffix,
            variantFullCode: selectedVariantFullCode,
            variantObj: selectedVariantObj,
            specsText,
            supplierName,
            lotNumber: resolvedLotNumber,
            isManualLot,
            packagingRatio,
            largeUnitName,
            smallUnit,
            totalRequiredSmall: 0,
            orderRefs: new Set(),
          });
        }

        const entry = compMap.get(key);
        entry.totalRequiredSmall += neededSmall;
        entry.orderRefs.add(order.orderNumber || order.id);
      });
    });

    const list = Array.from(compMap.values()).map((c) => {
      let floorStockSmall = 0;
      let totalCompanyStockSmall = 0;

      const itemLots = allLots.filter((l) => l.itemId === c.itemId && l.availableQty > 0);

      if (c.lotNumber && c.lotNumber !== 'FIFO') {
        const matchingLots = itemLots.filter((l) => l.lotNumber === c.lotNumber);
        floorStockSmall = matchingLots
          .filter((l) => l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse))
          .reduce((sum, l) => sum + l.availableQty, 0);
        totalCompanyStockSmall = matchingLots.reduce((sum, l) => sum + l.availableQty, 0);
      } else if (c.variantFullCode) {
        const matchingLots = itemLots.filter((l) => l.variantCode === c.variantFullCode);
        floorStockSmall = matchingLots
          .filter((l) => l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse))
          .reduce((sum, l) => sum + l.availableQty, 0);
        totalCompanyStockSmall = matchingLots.reduce((sum, l) => sum + l.availableQty, 0);
      } else {
        floorStockSmall = itemLots
          .filter((l) => l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse))
          .reduce((sum, l) => sum + l.availableQty, 0);
        totalCompanyStockSmall = itemLots.reduce((sum, l) => sum + l.availableQty, 0);
      }

      const ratio = c.packagingRatio || 1;
      const totalRequiredSmall = c.totalRequiredSmall;
      const totalRequiredLarge = Number((totalRequiredSmall / ratio).toFixed(2));
      const floorStockLarge = Number((floorStockSmall / ratio).toFixed(2));
      const totalCompanyStockLarge = Number((totalCompanyStockSmall / ratio).toFixed(2));

      const deficitSmall = Math.max(0, totalRequiredSmall - floorStockSmall);
      const deficitLarge = Number((deficitSmall / ratio).toFixed(2));
      const deficitLargeCeiled = deficitSmall > 0 ? Math.ceil(deficitSmall / ratio) : 0;
      const deficitSmallCeiled = deficitLargeCeiled * ratio;

      const diffFloorSmall = floorStockSmall - totalRequiredSmall;
      const diffFloorLarge = Number((diffFloorSmall / ratio).toFixed(2));
      const diffCompanySmall = totalCompanyStockSmall - totalRequiredSmall;
      const diffCompanyLarge = Number((diffCompanySmall / ratio).toFixed(2));

      let status = 'floor_ready';
      if (c.isPipeFeeding || c.isMFlagged) {
        // Continuous supply via pipes parallel to production run (not a warehouse staging deficit)
        status = 'pipe_supply';
      } else if (floorStockSmall < totalRequiredSmall) {
        status = totalCompanyStockSmall >= totalRequiredSmall ? 'transfer_needed' : 'shortage';
      }

      return {
        ...c,
        orderRefsList: Array.from(c.orderRefs),
        floorStockSmall,
        floorStockLarge,
        totalCompanyStockSmall,
        totalCompanyStockLarge,
        totalRequiredLarge,
        deficitSmall,
        deficitLarge,
        deficitLargeCeiled,
        deficitSmallCeiled,
        diffFloorSmall,
        diffFloorLarge,
        diffCompanySmall,
        diffCompanyLarge,
        status,
      };
    });

    list.sort((a, b) => {
      const statusWeight = { shortage: 1, transfer_needed: 2, pipe_supply: 3, floor_ready: 4 };
      return (statusWeight[a.status] || 4) - (statusWeight[b.status] || 4);
    });

    const totalReady = list.filter((c) => !c.isPipeFeeding && !c.isMFlagged && c.status === 'floor_ready').length;
    const totalTransfer = list.filter((c) => !c.isPipeFeeding && !c.isMFlagged && c.status === 'transfer_needed').length;
    const totalShortage = list.filter((c) => !c.isPipeFeeding && !c.isMFlagged && c.status === 'shortage').length;
    const totalPipeSupply = list.filter((c) => c.isPipeFeeding || c.isMFlagged).length;

    return { list, totalReady, totalTransfer, totalShortage, totalPipeSupply };
  }, [workOrders, selectedPlanDate, bomRecipes, liveStockMatrix, itemsMaster, factoryWarehouse, warehouses, isAr]);

  // Generate Sequential MO ID
  const generateOrderNumber = (dateString) => {
    const cleanDate = (dateString || selectedPlanDate).replace(/-/g, '');
    const prefix = `MO-${cleanDate}`;
    const dateOrders = workOrders.filter((o) => (o.orderNumber || o.id || '').startsWith(prefix));
    const nextSeq = String(dateOrders.length + 1).padStart(2, '0');
    return `${prefix}-${nextSeq}`;
  };

  // Concurrency detection: count orders per sequence number on active shift date
  const sequenceCountsOnSelectedDate = useMemo(() => {
    const counts = {};
    workOrders
      .filter((o) => o.planDate === selectedPlanDate && o.status !== 'cancelled')
      .forEach((o) => {
        const rank = Number(o.importanceRank) || 1;
        counts[rank] = (counts[rank] || 0) + 1;
      });
    return counts;
  }, [workOrders, selectedPlanDate]);

  // Quick-swap/step sequence directly from table (# column)
  const handleQuickStepSequence = async (order, delta) => {
    const newRank = Math.max(1, (Number(order.importanceRank) || 1) + delta);
    if (newRank === Number(order.importanceRank)) return;

    try {
      await setDoc(
        doc(db, 'work_orders', order.id),
        {
          importanceRank: newRank,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error updating order sequence:', err);
    }
  };

  // Generate Next Transfer ID (TRN-YYYYMMDDXX)
  const generateTransferId = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `TRN-${yyyy}${mm}${dd}`;

    const todaysTransfers = transfers.filter((t) => t.id && t.id.startsWith(datePrefix));
    let maxSeq = 0;
    todaysTransfers.forEach((t) => {
      const seqPart = parseInt(t.id.slice(datePrefix.length), 10);
      if (!isNaN(seqPart) && seqPart > maxSeq) maxSeq = seqPart;
    });

    return `${datePrefix}${String(maxSeq + 1).padStart(2, '0')}`;
  };

  // Open Pre-Filled Floor Transfer Modal Locked to Production Floor WH
  const handleOpenFloorTransferModal = () => {
    const activePlanOrders = workOrders.filter(
      (o) => o.planDate === selectedPlanDate && o.status !== 'cancelled'
    );
    const moRefs = activePlanOrders.map((o) => o.orderNumber || o.id).join(', ');
    const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
    const rawWarehouses = getRawStorageWarehouses(warehouses);
    const defaultSrcWh = rawWarehouses.find((w) => (w.id || w.code) !== factoryWhId) || warehouses[0];
    const srcWhId = defaultSrcWh?.id || defaultSrcWh?.code || '';

    // Extract lines for materials with positive floor deficit (deficitSmall > 0)
    // and exclude M-flagged items (liquids continuous pipe feed)
    const prefilledLines = [];

    dailyPlanMaterialsOverview.list.forEach((mat) => {
      // Exclude zero-deficit items and M-flagged items
      if (mat.isMFlagged || mat.deficitSmall <= 0) return;

      const ratio = Number(mat.packagingRatio || 1);

      // Query FIFO lot in source warehouse for this specific variant
      const activeLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
        (l) => l.itemId === mat.itemId && (mat.variantFullCode ? l.variantCode === mat.variantFullCode : true) && (l.warehouseId === srcWhId || matchWh(l.warehouseId, defaultSrcWh)) && l.availableQty > 0
      );
      activeLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

      // Check if planning assigned a specific lot that exists in source warehouse
      const matchingAssignedLot = activeLots.find((l) => l.lotNumber === mat.lotNumber);
      const pickedLot = matchingAssignedLot || activeLots[0];

      // Default row strategy: 'ceil' (Round up to nearest whole pack)
      const ceiledPacks = mat.deficitLargeCeiled;
      const ceiledUnits = mat.deficitSmallCeiled;

      prefilledLines.push({
        itemId: mat.itemId,
        variantCode: mat.variantFullCode || mat.itemId,
        code: mat.variantFullCode || mat.itemId,
        variantSuffix: mat.variantSuffix,
        nameAr: mat.materialNameAr,
        nameEn: mat.materialNameEn,
        specs: mat.specsText,
        supplierName: mat.supplierName,
        smallUnit: mat.smallUnit,
        largeUnitName: mat.largeUnitName,
        packagingRatio: ratio,
        exactDeficitSmall: mat.deficitSmall,
        exactDeficitLarge: mat.deficitLarge,
        ceiledLargePacks: ceiledPacks,
        ceiledSmallUnits: ceiledUnits,
        calcStrategy: 'ceil',
        qtySmallUnits: ceiledUnits,
        qtyLargeUnits: ceiledPacks,
        lotNumber: pickedLot?.lotNumber || (mat.lotNumber !== 'FIFO' ? mat.lotNumber : ''),
        unitPrice: pickedLot?.unitPrice || 0,
        currency: pickedLot?.currency || 'EGP',
        receivedDate: pickedLot?.receivedDate || '',
        supplierId: pickedLot?.supplierId || '',
        supplierName: pickedLot?.supplierName || '',
        supplierBatchNo: pickedLot?.supplierBatchNo || '',
        productionDate: pickedLot?.productionDate || '',
        expiryDate: pickedLot?.expiryDate || '',
      });
    });

    setFloorTransferData({
      sourceWarehouse: srcWhId,
      targetWarehouse: factoryWhId,
      transferDate: selectedPlanDate,
      productionOrderRef: moRefs,
      notes: isAr 
        ? `إذن تحويل خامات لتغذية خطة إنتاج تاريخ ${selectedPlanDate} لأوامر التشغيل: (${moRefs})`
        : `Materials transfer for production plan ${selectedPlanDate} - Orders: (${moRefs})`,
      lines: prefilledLines,
    });

    setShowFloorTransferModal(true);
  };

  // Toggle row-level calculation strategy between 'ceil' (round up whole pack) and 'exact' (exact deficit)
  const handleToggleRowStrategy = (rowIdx, newStrategy) => {
    setFloorTransferData((prev) => {
      const updatedLines = [...prev.lines];
      const line = updatedLines[rowIdx];
      if (!line) return prev;

      const isCeil = newStrategy === 'ceil';
      const qSmall = isCeil
        ? (line.ceiledSmallUnits ?? line.qtySmallUnits)
        : (line.exactDeficitSmall ?? line.qtySmallUnits);
      const qLarge = isCeil
        ? (line.ceiledLargePacks ?? line.qtyLargeUnits)
        : (line.exactDeficitLarge ?? line.qtyLargeUnits);

      updatedLines[rowIdx] = {
        ...line,
        calcStrategy: newStrategy,
        qtySmallUnits: qSmall,
        qtyLargeUnits: qLarge,
      };

      return {
        ...prev,
        lines: updatedLines,
      };
    });
  };

  // Submit Floor Transfer Order to Cloud Firestore
  const handleSaveFloorTransfer = async (e) => {
    e.preventDefault();
    if (!floorTransferData.sourceWarehouse || !floorTransferData.targetWarehouse) {
      alert(isAr ? 'يرجى تحديد مخزن الصرف ومخزن الوجهة.' : 'Please select source and destination warehouses.');
      return;
    }
    if (floorTransferData.lines.length === 0) {
      alert(isAr ? 'يجب إضافة خامة واحدة على الأقل للتحويل.' : 'Add at least one item to transfer.');
      return;
    }

    setIsSaving(true);
    try {
      const newTrnId = generateTransferId();
      const todayIso = new Date().toISOString().split('T')[0];
      const isDateDifferentFromToday = floorTransferData.transferDate !== todayIso;

      const auditEntry = {
        version: '1.0',
        action: 'transfer_created_from_plan',
        status: 'completed',
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: `تم إنشاء وتحويل الخامات آلياً لتغذية صالة الإنتاج لأوامر التشغيل (${floorTransferData.productionOrderRef})`,
        noteEn: `Auto-generated transfer to factory floor for MOs (${floorTransferData.productionOrderRef})`,
      };

      const transferDoc = {
        id: newTrnId,
        sourceWarehouse: floorTransferData.sourceWarehouse,
        targetWarehouse: floorTransferData.targetWarehouse,
        transferDate: floorTransferData.transferDate,
        isCustomDate: isDateDifferentFromToday,
        productionOrderRef: floorTransferData.productionOrderRef.trim(),
        notes: floorTransferData.notes.trim(),
        lines: floorTransferData.lines.map((l) => ({
          ...l,
          qtySmallUnits: Number(l.qtySmallUnits),
          qtyLargeUnits: Number(l.qtyLargeUnits || 0),
        })),
        status: 'completed',
        issuedBy: currentUserName,
        issuedById: currentUser?.id || currentUser?.uid || '',
        verifiedBy: currentUserName,
        verifiedAt: new Date().toISOString(),
        auditTrail: [auditEntry],
        attachments: [],
        version: '1.0',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'stock_transfers', newTrnId), transferDoc);
      setShowFloorTransferModal(false);
      alert(isAr ? `تم إنشاء واعتماد إذن التحويل بنجاح برقم: (${newTrnId})` : `Transfer created successfully: (${newTrnId})`);
    } catch (err) {
      console.error('Error saving floor transfer:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ إذن التحويل.' : 'Error saving transfer.');
    } finally {
      setIsSaving(false);
    }
  };

  // ----------------------------------------------------
  // REWORK & DEFECTIVE PRODUCT INTEGRATION HANDLERS
  // ----------------------------------------------------
  // Rework Planning: Auto-detect historical variants from batch code / previous runs & populate plan
  const handleAddProductReworkToPlan = (prod) => {
    const pastCompleted = workOrders.filter(
      (o) => o.finishedProductId === prod.finishedProductId && (o.status === 'completed' || Number(o.totalProducedQtySmall) > 0)
    );

    let detectedSelections = {};
    let detectedFromOrderNumber = null;

    if (prod.batchCodes && prod.batchCodes.size > 0) {
      const batchList = Array.from(prod.batchCodes);
      const matchByBatch = pastCompleted.find((o) =>
        batchList.some((b) => (o.orderNumber || '').includes(b) || (o.pallets || []).some((p) => (p.batchCode || '').includes(b)))
      );
      if (matchByBatch && matchByBatch.componentSelections) {
        detectedSelections = { ...matchByBatch.componentSelections };
        detectedFromOrderNumber = matchByBatch.orderNumber;
      }
    }

    if (Object.keys(detectedSelections).length === 0 && pastCompleted.length > 0) {
      const latest = pastCompleted[pastCompleted.length - 1];
      if (latest.componentSelections) {
        detectedSelections = { ...latest.componentSelections };
        detectedFromOrderNumber = latest.orderNumber;
      }
    }

    const targetSuffix = prod.packagingOptionSuffix || 'A';
    const matchingBoms = bomRecipes.filter(
      (b) => (b.productId === prod.finishedProductId || b.finishedProductId === prod.finishedProductId || b.id === prod.finishedProductId) &&
        (b.scopeType === 'option_specific' ? b.packagingOptionSuffix === targetSuffix : true) &&
        b.status !== 'inactive'
    );
    const resolvedBomId = matchingBoms[0]?.code || matchingBoms[0]?.id || '';

    const existingOrders = workOrders.filter((o) => o.planDate === selectedPlanDate && o.status !== 'cancelled');
    const nextSeq = existingOrders.length > 0
      ? Math.max(...existingOrders.map((o) => Number(o.importanceRank) || 0)) + 1
      : 1;

    setEditingPlanOrder(null);
    setIsPlanBomMatrixExpanded(false);
    setPlanFormData({
      orderNumber: generateOrderNumber(selectedPlanDate) + '-REW',
      planDate: selectedPlanDate,
      finishedProductId: prod.finishedProductId,
      packagingOptionSuffix: targetSuffix,
      packagingRatio: prod.packagingRatio || 12,
      bomRecipeId: resolvedBomId,
      productionLine: categories[0]?.key || 'white_o',
      priority: 'today',
      importanceRank: nextSeq,
      qtyExactness: 'exact',
      plannedQtyLarge: prod.missingSmallUnits > 0 ? Math.ceil(prod.totalQtyLarge) : prod.totalQtyLarge,
      plannedQtySmall: prod.missingSmallUnits > 0 ? Math.ceil(prod.totalQtyLarge) * (prod.packagingRatio || 12) : prod.totalQtySmall,
      originalReturnQtyLarge: prod.totalQtyLarge,
      originalReturnQtySmall: prod.totalQtySmall,
      componentSelections: detectedSelections,
      processId: '',
      processCode: '',
      processNameAr: '',
      processNameEn: '',
      stepStaffing: [],
      notes: `[أمر تصليح ومرتجع إنتاج] - إشعارات: ${prod.vouchers.map((v) => v.id).join(', ')} - العيوب: ${Array.from(prod.faultTags).join('، ')}`,
      isRework: true,
      reworkSourceVouchers: prod.vouchers.map((v) => v.id),
      reworkFaultTags: Array.from(prod.faultTags),
      missingSmallUnits: prod.missingSmallUnits || 0,
      detectedFromOrderNumber,
    });

    setShowFixesModal(false);
    setShowPlanModal(true);
  };

  // Production Floor Receipt Handshake
  const handleConfirmFloorReceipt = async (voucherId, notes = '') => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'faulty_fg_returns', voucherId), {
        status: 'received_on_floor',
        reconfirmationRequired: false,
        confirmedByProduction: {
          userId: currentUser?.id || currentUser?.uid || 'production_manager',
          userName: currentUserName,
          confirmedAt: new Date().toISOString(),
          notes: notes.trim(),
        },
        updatedAt: serverTimestamp(),
      });
      alert(isAr ? 'تم تأكيد استلام المرتجع ونقل العهدة لصالة الإنتاج بنجاح.' : 'Return confirmed on production floor.');
    } catch (err) {
      console.error('Error confirming floor receipt:', err);
      alert(isAr ? 'حدث خطأ أثناء تأكيد الاستلام.' : 'Error confirming receipt.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmAllFloorReceipts = async () => {
    if (pendingAcceptanceReturns.length === 0) return;
    setIsSaving(true);
    try {
      for (const v of pendingAcceptanceReturns) {
        await updateDoc(doc(db, 'faulty_fg_returns', v.id), {
          status: 'received_on_floor',
          confirmedByProduction: {
            userId: currentUser?.id || currentUser?.uid || 'production_manager',
            userName: currentUserName,
            confirmedAt: new Date().toISOString(),
            notes: isAr ? 'تأكيد استلام مجمع من مشرف الصالة' : 'Bulk receipt confirmation',
          },
          updatedAt: serverTimestamp(),
        });
      }
      setShowFloorReceiptsModal(false);
      alert(isAr ? `تم تأكيد استلام جميع المرتجعات (${pendingAcceptanceReturns.length}) بصالة الإنتاج بنجاح.` : 'All receipts confirmed.');
    } catch (err) {
      console.error('Error confirming bulk receipts:', err);
      alert(isAr ? 'حدث خطأ أثناء تأكيد الاستلام المجمع.' : 'Error confirming bulk receipts.');
    } finally {
      setIsSaving(false);
    }
  };

  // Validation helper for Rework Material Matrix
  const validateReconcileMatrix = (matrix) => {
    if (!matrix || typeof matrix !== 'object') return [];
    const errors = [];
    Object.values(matrix).forEach((row) => {
      const preserved = Number(row.preservedQty) || 0;
      const fractionTopUp = Number(row.fractionTopUpQty) || 0;
      const replaceDefect = Number(row.replaceDefectQty) || 0;
      const totalAccounted = parseFloat((preserved + fractionTopUp + replaceDefect).toFixed(4));
      const nominal = parseFloat((Number(row.nominalQty) || 0).toFixed(4));

      if (Math.abs(totalAccounted - nominal) > 0.001) {
        const diff = parseFloat((totalAccounted - nominal).toFixed(4));
        errors.push({
          itemId: row.itemId,
          itemNameAr: row.itemNameAr,
          nominal,
          totalAccounted,
          diff,
          unit: row.unit,
        });
      }
    });
    return errors;
  };

  // Rework Reconciliation Matrix Handlers
  const handleOpenReconcileRework = (order) => {
    if (isOrderLocked(order)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }
    setReconcilingOrder(order);
    const recipe = bomRecipes.find((b) => b.id === order.bomRecipeId || b.code === order.bomRecipeId);
    const components = recipe?.components || [];
    const plannedLarge = Number(order.plannedQtyLarge) || 0;
    const plannedSmall = Number(order.plannedQtySmall) || 0;
    const missingSmall = Number(order.missingSmallUnits) || 0;

    const packagingRatio = (plannedLarge > 0 && plannedSmall > 0)
      ? (plannedSmall / plannedLarge)
      : (Number(order.packagingRatio) || 12);

    const defaultTargetWh = warehouses.find(
      (w) => w.nameAr?.includes('هالك') || w.nameAr?.includes('خردة') || w.nameAr?.includes('مرتجع')
    )?.id || warehouses[0]?.id || '';

    const initialMatrix = {};
    components.forEach((c) => {
      // Calculate nominalQty strictly from BOM recipe standardQty per large unit
      const standardQty = Number(c.standardQty) || 1;
      const nominalQty = parseFloat((plannedLarge * standardQty).toFixed(4));

      const itemDoc = itemsMaster.find((i) => i.id === c.itemId || i.code === c.itemId);
      const resolvedItemNameAr = c.materialNameAr || c.nameAr || itemDoc?.nameAr || c.itemId;

      // Robust categorization immune to item name changes:
      // Primary: Item Category ID (5: Cartons, 6: Secondary Bundling & Shrink Films)
      // Secondary: Base Series & Serial Number (500-699)
      // Tertiary: Code pattern (e.g. F-5xx, F-6xx)
      // Fallbacks: Units & Multilingual keywords
      const catId = Number(itemDoc?.categoryId);
      const serial = Number(itemDoc?.serialNum);
      const itemCodeStr = String(c.itemCode || itemDoc?.code || c.itemId || '');

      const isPackagingCategory = catId === 5 || catId === 6 || (serial >= 500 && serial < 700) || /^[A-Z]*-?[56]\d{2}/i.test(itemCodeStr);
      const isPackagingUnit = c.unit === 'كرتونة' || c.unit === 'متر' || itemDoc?.smallUnit === 'كرتونة';
      const isPackagingName = /كرتون|شرينك|تغليف|شريط|فيلم|carton|shrink|film|tape|box/i.test(resolvedItemNameAr);
      const isPackaging = isPackagingCategory || isPackagingUnit || isPackagingName;

      const faultTags = order.reworkFaultTags || [];
      const hasPackagingFault = faultTags.some((t) => t.includes('تغليف') || t.includes('شرينك') || t.includes('كرتون'));

      // Calculate quantity needed strictly to complete fractional missing units (0 scrap)
      const qtyPerSmallUnit = parseFloat((standardQty / packagingRatio).toFixed(4));
      let initialFractionTopUp = 0;
      if (missingSmall > 0) {
        initialFractionTopUp = parseFloat((missingSmall * qtyPerSmallUnit).toFixed(4));
      }

      let initialReplaceDefect = 0;
      let initialScrapped = 0;

      if (isPackaging && hasPackagingFault) {
        initialReplaceDefect = Math.max(0, parseFloat((nominalQty - initialFractionTopUp).toFixed(4)));
        initialScrapped = initialReplaceDefect;
      }

      const initialPreserved = Math.max(0, parseFloat((nominalQty - initialFractionTopUp - initialReplaceDefect).toFixed(4)));
      const initialConsumed = parseFloat((initialFractionTopUp + initialReplaceDefect).toFixed(4));

      // Resolve Variant, Lot, and Unit Cost for accurate stock and financial tracking
      const itemLots = Object.values(liveStockMatrix?.lotMap || {})
        .filter((l) => l.itemId === c.itemId && l.availableQty > 0)
        .sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

      const sel = order.componentSelections?.[c.itemId] || {};
      const cleanBomSuffix = c.variantCode ? c.variantCode.replace(`${c.itemId}-`, '') : '';
      const resolvedVariantCode = (sel.variantCode !== undefined && sel.variantCode !== '')
        ? String(sel.variantCode)
        : (cleanBomSuffix || (itemLots[0]?.variantCode ? itemLots[0].variantCode.replace(`${c.itemId}-`, '') : ''));

      const resolvedLotNumber = (sel.selectedLot && sel.selectedLot !== 'FIFO')
        ? String(sel.selectedLot)
        : (itemLots[0]?.lotNumber ? String(itemLots[0].lotNumber) : '');

      const matchedLot = itemLots.find((l) => l.lotNumber === resolvedLotNumber) || itemLots[0];
      const resolvedUnitCost = resolveItemOrLotCost({
        itemId: c.itemId,
        variantCode: resolvedVariantCode ? `${c.itemId}-${resolvedVariantCode}` : '',
        lotNumber: resolvedLotNumber,
        warehouseId: defaultTargetWh,
        liveStockMatrix,
        itemsMaster,
        goodsReceipts,
        tanks: liquidTanks,
        transformations,
        intermediateRecipes,
      }) || Number(matchedLot?.unitCost || 0);

      const allowFractions = resolveItemAllowFractions(itemDoc || { smallUnit: c.unit });
      const finalNominal = allowFractions ? nominalQty : Math.round(nominalQty);
      const finalFractionTopUp = allowFractions ? initialFractionTopUp : Math.round(initialFractionTopUp);
      const finalReplaceDefect = allowFractions ? initialReplaceDefect : Math.round(initialReplaceDefect);
      const finalScrapped = allowFractions ? initialScrapped : Math.round(initialScrapped);
      const finalConsumed = allowFractions ? initialConsumed : Math.round(finalFractionTopUp + finalReplaceDefect);
      const finalPreserved = allowFractions ? initialPreserved : Math.max(0, finalNominal - finalConsumed);

      initialMatrix[c.itemId || c.itemCode] = {
        itemId: c.itemId || c.itemCode,
        itemCode: c.itemCode || itemDoc?.code || c.itemId,
        itemNameAr: resolvedItemNameAr,
        unit: c.unit || itemDoc?.smallUnit || '',
        allowFractions,
        nominalQty: finalNominal,
        standardQty,
        qtyPerSmallUnit,
        fractionTopUpQty: finalFractionTopUp,
        replaceDefectQty: finalReplaceDefect,
        consumedQty: finalConsumed,
        scrappedQty: finalScrapped,
        preservedQty: finalPreserved,
        targetWarehouseId: defaultTargetWh,
        scrapReason: 'تالف أثناء الفرز والتصليح',
        variantCode: resolvedVariantCode,
        lotNumber: resolvedLotNumber,
        unitCost: resolvedUnitCost,
      };
    });

    setReconcileMatrixData(initialMatrix);
    setShowReworkReconcileModal(true);
  };

  const handleUpdateMatrixField = (key, field, val) => {
    setReconcileMatrixData((prev) => {
      const current = { ...prev[key] };

      // String fields (Variant, LOT, Warehouse, Reason) must NOT be coerced to Number
      if (field === 'variantCode' || field === 'lotNumber' || field === 'targetWarehouseId' || field === 'scrapReason') {
        current[field] = val;
      } else {
        const rawNum = Math.max(0, Number(val) || 0);
        const numVal = current.allowFractions ? rawNum : Math.round(rawNum);
        current[field] = numVal;

        if (field === 'fractionTopUpQty' || field === 'replaceDefectQty') {
          const topUp = field === 'fractionTopUpQty' ? numVal : (Number(current.fractionTopUpQty) || 0);
          const replace = field === 'replaceDefectQty' ? numVal : (Number(current.replaceDefectQty) || 0);
          const consumed = topUp + replace;
          current.consumedQty = current.allowFractions ? parseFloat(consumed.toFixed(4)) : Math.round(consumed);
          current.preservedQty = Math.max(0, current.allowFractions ? parseFloat((current.nominalQty - current.consumedQty).toFixed(4)) : Math.round(current.nominalQty - current.consumedQty));
          if (field === 'replaceDefectQty') {
            current.scrappedQty = replace;
          }
        } else if (field === 'scrappedQty') {
          current.scrappedQty = numVal;
        } else if (field === 'preservedQty') {
          current.preservedQty = numVal;
        }
      }

      return {
        ...prev,
        [key]: current,
      };
    });
  };

  const handleAutoBalanceMatrixRow = (key) => {
    setReconcileMatrixData((prev) => {
      const current = { ...prev[key] };
      const topUp = Number(current.fractionTopUpQty) || 0;
      const replace = Number(current.replaceDefectQty) || 0;
      const consumed = topUp + replace;
      current.consumedQty = current.allowFractions ? parseFloat(consumed.toFixed(4)) : Math.round(consumed);
      current.preservedQty = Math.max(0, current.allowFractions ? parseFloat((current.nominalQty - current.consumedQty).toFixed(4)) : Math.round(current.nominalQty - current.consumedQty));
      return {
        ...prev,
        [key]: current,
      };
    });
  };

  const handleAutoBalanceAllMatrix = () => {
    setReconcileMatrixData((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        const row = { ...next[k] };
        const topUp = Number(row.fractionTopUpQty) || 0;
        const replace = Number(row.replaceDefectQty) || 0;
        const consumed = topUp + replace;
        row.consumedQty = row.allowFractions ? parseFloat(consumed.toFixed(4)) : Math.round(consumed);
        row.preservedQty = Math.max(0, row.allowFractions ? parseFloat((row.nominalQty - row.consumedQty).toFixed(4)) : Math.round(row.nominalQty - row.consumedQty));
        next[k] = row;
      });
      return next;
    });
  };

  const generateReworkStatement = (matrix, order) => {
    if (!order) return '';
    const preserved = [];
    const fractionTopUps = [];
    const replacements = [];
    const scrapped = [];

    Object.values(matrix).forEach((row) => {
      const lotTag = row.lotNumber ? ` [LOT: ${row.lotNumber}]` : '';
      const varTag = row.variantCode ? ` (${row.variantCode})` : '';
      if (Number(row.preservedQty) > 0) {
        preserved.push(`${row.preservedQty} ${row.unit} (${row.itemNameAr})${varTag}${lotTag}`);
      }
      if (Number(row.fractionTopUpQty) > 0) {
        fractionTopUps.push(`${row.fractionTopUpQty} ${row.unit} (${row.itemNameAr})${varTag}${lotTag}`);
      }
      if (Number(row.replaceDefectQty) > 0) {
        replacements.push(`${row.replaceDefectQty} ${row.unit} (${row.itemNameAr})${varTag}${lotTag}`);
      }
      if (Number(row.scrappedQty) > 0) {
        const targetWh = warehouses.find((w) => w.id === row.targetWarehouseId);
        scrapped.push(`${row.scrappedQty} ${row.unit} (${row.itemNameAr})${varTag}${lotTag} [توجيه: ${targetWh?.nameAr || 'مستودع الهوالك'}]`);
      }
    });

    const lines = [];
    lines.push(`ملخص تسوية ومطابقة أمر التصليح (#${order.orderNumber}):`);
    const orig = getOriginalReturnQty(order);
    if (orig) {
      lines.push(`• الكمية المرتجعة المستلمة بالأصل: ${orig.qtyLarge} ${orig.largeUnit} (${orig.qtySmall} ${orig.smallUnit}).`);
      if (orig.missingSmall > 0) {
        lines.push(`• نواقص استكمال الكرتونة الكسر: +${orig.missingSmall} ${orig.smallUnit}.`);
      }
    }
    if (preserved.length > 0) {
      lines.push(`• تم الحفاظ عليه سليم بدون تغيير: ${preserved.join('، ')}.`);
    }
    if (fractionTopUps.length > 0) {
      lines.push(`• تم استهلاكه لإكمال نواقص الكرتونة الكسر (بدون هالك): ${fractionTopUps.join('، ')}.`);
    }
    if (replacements.length > 0) {
      lines.push(`• تم استهلاكه لاستبدال التالف (يقابله هالك): ${replacements.join('، ')}.`);
    }
    if (scrapped.length > 0) {
      lines.push(`• تم توجيهه للهالك / المرتجع بالصالة: ${scrapped.join('، ')}.`);
    }
    lines.push(`• الناتج النهائي المكتمل: ${order.plannedQtyLarge} ${order.outputLargeUnit || 'كرتونة'} مطابقة للمواصفات.`);
    return lines.join('\n');
  };

  const renderMatrixTooltip = (rowKey, title, description, colorClasses, direction = 'down') => {
    const isPinned = pinnedMatrixTooltip === rowKey;
    const isOpen = isPinned || hoveredMatrixTooltip === rowKey;
    const posClass = direction === 'down' ? 'top-full mt-1.5' : 'bottom-full mb-1.5';

    return (
      <div
        className="relative inline-flex items-center"
        onMouseEnter={() => setHoveredMatrixTooltip(rowKey)}
        onMouseLeave={() => setHoveredMatrixTooltip(null)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPinnedMatrixTooltip(isPinned ? null : rowKey);
          }}
          className={`inline-flex items-center justify-center p-0.5 rounded-full transition cursor-help ${colorClasses.button}`}
          aria-label={title}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>

        {isOpen && (
          <div
            className={`absolute start-0 ${posClass} z-50 w-64 bg-slate-900 text-white rounded-xl p-2.5 shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-150 text-xs select-text text-start pointer-events-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-1.5">
              <span className={`font-extrabold text-[11px] flex items-center gap-1.5 ${colorClasses.title}`}>
                <span className={`h-2 w-2 rounded-full ${colorClasses.dot}`}></span>
                <span>{title}</span>
              </span>
              {isPinned && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinnedMatrixTooltip(null);
                    setHoveredMatrixTooltip(null);
                  }}
                  className="p-0.5 text-slate-400 hover:text-white rounded transition cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed font-normal">
              {description}
            </p>
          </div>
        )}
      </div>
    );
  };

  const handleSaveReworkReconciliation = async () => {
    if (!reconcilingOrder) return;
    if (isOrderLocked(reconcilingOrder)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }

    // Guard: Validate material balance before allowing save
    const matrixErrors = validateReconcileMatrix(reconcileMatrixData);
    if (matrixErrors.length > 0) {
      const errorDetails = matrixErrors
        .map((e) => `• ${e.itemNameAr}: إجمالي المحسوب (${e.totalAccounted} ${e.unit}) لا يطابق المطلوب للتشغيلة (${e.nominal} ${e.unit}) [فارق: ${e.diff > 0 ? `+${e.diff}` : e.diff}]`)
        .join('\n');
      alert(isAr
        ? `🚫 لا يمكن اعتماد التسوية لوجود عدم تطابق في كميات الخامات!\n\nيجب أن يساوي مجموع (السليم + إكمال النواقص + استبدال التالف) المطلوب للتشغيلة تماماً:\n\n${errorDetails}\n\nيرجى تصحيح الكميات أو الضغط على "موازنة تلقائية" ثم المحاولة مجدداً.`
        : `Cannot approve reconciliation due to material quantity mismatch:\n\n${errorDetails}`);
      return;
    }

    setIsSaving(true);
    try {
      const summaryStatement = generateReworkStatement(reconcileMatrixData, reconcilingOrder);

      // 1. Stage any scrapped/returned components in floor custody with variant, lot, and cost attributes
      for (const row of Object.values(reconcileMatrixData)) {
        if (Number(row.scrappedQty) > 0) {
          const targetWh = warehouses.find((w) => w.id === row.targetWarehouseId);
          await addDoc(collection(db, 'staged_floor_materials'), {
            workOrderId: reconcilingOrder.id,
            orderNumber: reconcilingOrder.orderNumber,
            finishedProductId: reconcilingOrder.finishedProductId,
            productNameAr: reconcilingOrder.productNameAr,
            itemId: row.itemId,
            itemCode: row.itemCode,
            itemNameAr: row.itemNameAr,
            quantity: Number(row.scrappedQty),
            unit: row.unit,
            variantCode: row.variantCode || '',
            lotNumber: row.lotNumber || '',
            unitCost: Number(row.unitCost) || 0,
            targetWarehouseId: row.targetWarehouseId,
            targetWarehouseName: targetWh?.nameAr || targetWh?.name || '',
            reason: row.scrapReason || 'هالك تصليح',
            status: 'staged_on_floor',
            stagedAt: new Date().toISOString(),
            stagedBy: currentUserName,
          });
        }
      }

      // 2. Mark Work Order as completed
      const orderRef = doc(db, 'work_orders', reconcilingOrder.id);
      await updateDoc(orderRef, {
        status: 'completed',
        totalProducedQtyLarge: reconcilingOrder.plannedQtyLarge,
        totalProducedQtySmall: reconcilingOrder.plannedQtySmall,
        completionPercentage: 100,
        reworkReconciliation: {
          matrix: reconcileMatrixData,
          summaryStatement,
          reconciledAt: new Date().toISOString(),
          reconciledBy: currentUserName,
        },
        updatedAt: serverTimestamp(),
      });

      // 3. Auto-close linked return vouchers to 'reworked'
      const sourceVouchers = reconcilingOrder.reworkSourceVouchers || [];
      for (const vId of sourceVouchers) {
        try {
          const vRef = doc(db, 'faulty_fg_returns', vId);
          await updateDoc(vRef, {
            status: 'reworked',
            resolution: {
              type: 'reworked',
              workOrderId: reconcilingOrder.id,
              workOrderNumber: reconcilingOrder.orderNumber,
              resolvedAt: new Date().toISOString(),
              resolvedBy: {
                userId: currentUser?.id || currentUser?.uid || '',
                userName: currentUserName,
              },
              notes: summaryStatement,
            },
            updatedAt: serverTimestamp(),
          });
        } catch (vErr) {
          console.warn('Failed to update voucher resolution:', vErr);
        }
      }

      setShowReworkReconcileModal(false);
      setReconcilingOrder(null);
      alert(isAr ? 'تم اعتماد تسوية أمر التصليح بنجاح وإغلاق إشعارات المرتجع المرتبطة!' : 'Rework reconciled and closed successfully!');
    } catch (err) {
      console.error('Error saving rework reconciliation:', err);
      alert(isAr ? 'حدث خطأ أثناء اعتماد تسوية أمر التصليح.' : 'Error saving reconciliation.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to auto-resolve material default variant, lot, cost and unit for scrap logging
  const resolveScrapMaterialDefaults = (targetItemId, order) => {
    if (!order || !targetItemId) return {};
    const recipe = bomRecipes.find((b) => b.id === order.bomRecipeId || b.code === order.bomRecipeId);
    const comps = recipe?.components || [];
    const comp = comps.find((c) => (c.itemId || c.itemCode) === targetItemId || c.itemId === targetItemId || c.itemCode === targetItemId);
    const itemObj = itemsMaster.find((i) => i.id === targetItemId || i.code === targetItemId);

    // 1. Resolve Variant: Priority order.componentSelections -> comp.variantCode -> itemObj variations
    const sel = order.componentSelections?.[targetItemId] || order.componentSelections?.[comp?.itemId] || order.componentSelections?.[comp?.itemCode] || {};
    let resolvedVar = sel.variantCode || '';
    if (!resolvedVar && comp?.variantCode) {
      resolvedVar = comp.variantCode.replace(`${targetItemId}-`, '').replace(`${comp?.itemId}-`, '');
    }
    if (!resolvedVar && itemObj?.variations?.[0]) {
      resolvedVar = itemObj.variations[0].suffix || itemObj.variations[0].variantCode || '';
    }

    // 2. Resolve LOT: Priority order.componentSelections -> active floor lot -> any active lot
    const itemLots = Object.values(liveStockMatrix?.lotMap || {})
      .filter((l) => (l.itemId === targetItemId || l.itemId === itemObj?.id || l.itemId === itemObj?.code) && l.availableQty > 0)
      .sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

    const factoryWh = getFactoryFloorWarehouse(warehouses);
    const factoryLots = itemLots.filter((l) => l.warehouseId === factoryWh?.id || matchWh(l.warehouseId, factoryWh));

    let resolvedLot = (sel.selectedLot && sel.selectedLot !== 'FIFO') ? sel.selectedLot : '';
    if (!resolvedLot) {
      resolvedLot = factoryLots[0]?.lotNumber || itemLots[0]?.lotNumber || '';
    }

    const matchedLot = itemLots.find((l) => l.lotNumber === resolvedLot) || factoryLots[0] || itemLots[0];
    const resolvedCost = resolveItemOrLotCost({
      itemId: targetItemId,
      variantCode: resolvedVar ? `${targetItemId}-${resolvedVar}` : '',
      lotNumber: resolvedLot,
      warehouseId: factoryWh?.id || '',
      liveStockMatrix,
      itemsMaster,
      goodsReceipts,
      tanks: liquidTanks,
      transformations,
      intermediateRecipes,
    }) || Number(matchedLot?.unitCost || 0);

    return {
      itemId: targetItemId,
      variantCode: resolvedVar,
      lotNumber: resolvedLot,
      unitCost: resolvedCost,
      unit: comp?.unit || itemObj?.smallUnit || 'قطعة',
    };
  };

  // Universal Scrap / Vendor Return Logger (For all orders)
  const handleOpenLogFloorScrap = (order) => {
    if (!canLogScrap) {
      alert(isAr ? 'ليس لديك صلاحية إثبات الهالك وتسوية التشغيل وإعادة التدوير.' : 'You do not have permission to log floor scrap or rework.');
      return;
    }
    if (isOrderLocked(order)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }
    setScrapLogOrder(order);
    const recipe = bomRecipes.find((b) => b.id === order.bomRecipeId || b.code === order.bomRecipeId);
    const comps = recipe?.components || [];
    const firstComp = comps[0];
    const firstItemId = firstComp ? (firstComp.itemId || firstComp.itemCode) : (itemsMaster[0]?.id || '');
    const defaults = resolveScrapMaterialDefaults(firstItemId, order);

    const defaultTargetWh = warehouses.find(
      (w) => w.nameAr?.includes('هالك') || w.nameAr?.includes('خردة') || w.nameAr?.includes('مرتجع')
    )?.id || warehouses[0]?.id || '';

    setScrapLogFormData({
      ...defaults,
      quantity: 1,
      targetWarehouseId: defaultTargetWh,
      reason: 'تالف أثناء التعبئة',
      notes: '',
    });
    setShowLogFloorScrapModal(true);
  };

  const handleSaveLogFloorScrap = async (e) => {
    e.preventDefault();
    if (isOrderLocked(scrapLogOrder)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }
    if (!scrapLogFormData.itemId || Number(scrapLogFormData.quantity) <= 0) {
      alert(isAr ? 'يرجى اختيار الخامة وتحديد كمية صالحة.' : 'Please select material and valid quantity.');
      return;
    }
    setIsSaving(true);
    try {
      const itemObj = itemsMaster.find((i) => i.id === scrapLogFormData.itemId || i.code === scrapLogFormData.itemId);
      const targetWh = warehouses.find((w) => w.id === scrapLogFormData.targetWarehouseId);

      await addDoc(collection(db, 'staged_floor_materials'), {
        workOrderId: scrapLogOrder?.id || '',
        orderNumber: scrapLogOrder?.orderNumber || '',
        finishedProductId: scrapLogOrder?.finishedProductId || '',
        productNameAr: scrapLogOrder?.productNameAr || '',
        itemId: itemObj?.id || scrapLogFormData.itemId,
        itemCode: itemObj?.code || scrapLogFormData.itemId,
        itemNameAr: itemObj?.nameAr || scrapLogFormData.itemId,
        quantity: Number(scrapLogFormData.quantity),
        unit: scrapLogFormData.unit || itemObj?.smallUnit || 'قطعة',
        variantCode: scrapLogFormData.variantCode || '',
        lotNumber: scrapLogFormData.lotNumber || '',
        unitCost: Number(scrapLogFormData.unitCost) || 0,
        targetWarehouseId: scrapLogFormData.targetWarehouseId,
        targetWarehouseName: targetWh?.nameAr || targetWh?.name || '',
        reason: scrapLogFormData.reason,
        notes: scrapLogFormData.notes.trim(),
        status: 'staged_on_floor',
        stagedAt: new Date().toISOString(),
        stagedBy: currentUserName,
      });

      setShowLogFloorScrapModal(false);
      setScrapLogOrder(null);
      alert(isAr ? 'تم تسجيل الخامة التالفة في عهدة الصالة بانتظار الترحيل للمستودع بنجاح.' : 'Scrap logged in floor staging.');
    } catch (err) {
      console.error('Error logging floor scrap:', err);
      alert(isAr ? 'حدث خطأ أثناء تسجيل الهالك.' : 'Error logging scrap.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Flexible Scrap Allocation Modal
  const handleOpenScrapAllocationModal = (item) => {
    const defaultWh = warehouses.find((w) => w.classification === 'scrap' || w.id === item.targetWarehouseId) || warehouses[0];
    setScrapAllocationModalItem(item);
    setScrapAllocationFormData({
      targetWarehouseId: item.targetWarehouseId || defaultWh?.id || '',
      allocatedQty: Number(item.quantity) || 1,
      notes: '',
    });
  };

  // Confirm Partial or Full Scrap Allocation
  const handleConfirmScrapAllocation = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!scrapAllocationModalItem) return;

    const allocQty = Number(scrapAllocationFormData.allocatedQty);
    const availableQty = Number(scrapAllocationModalItem.quantity);

    if (allocQty <= 0 || allocQty > availableQty) {
      alert(
        isAr
          ? `يرجى تحديد كمية صالحة للترحيل بين 1 و ${availableQty}.`
          : `Please specify a valid quantity between 1 and ${availableQty}.`
      );
      return;
    }

    if (!scrapAllocationFormData.targetWarehouseId) {
      alert(isAr ? 'يرجى اختيار المستودع المستهدف.' : 'Please select target warehouse.');
      return;
    }

    setIsSaving(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const newTrnId = `TRN-SCRAP-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const factoryWhId = factoryWarehouse?.id || warehouses[0]?.id || '';
      const targetWh = warehouses.find((w) => w.id === scrapAllocationFormData.targetWarehouseId);
      const requiredVerifierId = targetWh?.responsibleUserId || '';

      const isAuthorizedDirectly = isGeneralAdmin || (requiredVerifierId && currentUserId === requiredVerifierId);
      const initialStatus = isAuthorizedDirectly ? 'completed' : 'pending_custodian_verification';

      const line = {
        itemId: scrapAllocationModalItem.itemId,
        itemCode: scrapAllocationModalItem.itemCode,
        itemNameAr: scrapAllocationModalItem.itemNameAr,
        unit: scrapAllocationModalItem.unit,
        qtySmallUnits: allocQty,
        qtyLargeUnits: 0,
        reason: scrapAllocationModalItem.reason,
        variantCode: scrapAllocationModalItem.variantCode || '',
        lotNumber: scrapAllocationModalItem.lotNumber || '',
        unitCost: Number(scrapAllocationModalItem.unitCost) || 0,
      };

      const auditAction = isAuthorizedDirectly ? 'transfer_scrap_completed_direct' : 'transfer_scrap_requested_custodian';
      const auditNoteAr = isAuthorizedDirectly
        ? `تم ترحيل واستلام (${allocQty} ${line.unit}) من خامة (${line.itemNameAr}) بمستودع (${targetWh?.nameAr}) فورياً`
        : `طلب ترحيل (${allocQty} ${line.unit}) من خامة (${line.itemNameAr}) إلى (${targetWh?.nameAr}) بانتظار اعتماد أمين العهدة (${getUserDisplayName(requiredVerifierId)})`;

      const transferDoc = {
        id: newTrnId,
        sourceWarehouse: factoryWhId,
        targetWarehouse: targetWh.id,
        transferDate: new Date().toISOString().split('T')[0],
        productionOrderRef: scrapAllocationModalItem.orderNumber || '',
        notes: scrapAllocationFormData.notes.trim() || `تخصيص وترحيل جزئي لهالك الصالة: ${line.itemNameAr} (${allocQty} ${line.unit})`,
        lines: [line],
        status: initialStatus,
        requiredVerifierId: requiredVerifierId,
        issuedBy: currentUserName,
        issuedById: currentUserId,
        verifiedBy: isAuthorizedDirectly ? currentUserName : '',
        verifiedAt: isAuthorizedDirectly ? new Date().toISOString() : '',
        auditTrail: [{
          version: '1.0',
          action: auditAction,
          status: initialStatus,
          performedBy: currentUserName,
          timestamp: new Date().toISOString(),
          noteAr: auditNoteAr,
          noteEn: `Transfer of ${allocQty} ${line.unit} scrap to ${targetWh?.nameEn || targetWh?.nameAr}`,
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'stock_transfers', newTrnId), transferDoc);

      const remainingQty = availableQty - allocQty;
      const stagedDocRef = doc(db, 'staged_floor_materials', scrapAllocationModalItem.id);

      if (remainingQty <= 0) {
        await updateDoc(stagedDocRef, {
          quantity: 0,
          status: isAuthorizedDirectly ? 'transferred' : 'transfer_pending',
          transferId: newTrnId,
          targetWarehouseId: targetWh.id,
          targetWarehouseName: targetWh.nameAr || targetWh.name || '',
          transferredAt: isAuthorizedDirectly ? new Date().toISOString() : null,
          transferredBy: isAuthorizedDirectly ? currentUserName : null,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(stagedDocRef, {
          quantity: remainingQty,
          lastPartialTransferId: newTrnId,
          lastPartialQty: allocQty,
          lastPartialDate: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
      }

      setScrapAllocationModalItem(null);
      if (isAuthorizedDirectly) {
        alert(isAr ? `تم ترحيل الكمية (${allocQty}) بنجاح إلى (${targetWh?.nameAr}) بموجب إذن التحويل: ${newTrnId}` : `Transferred successfully: ${newTrnId}`);
      } else {
        alert(
          isAr
            ? `تم إنشاء طلب التحويل رقم (${newTrnId}) للكمية (${allocQty}) وبانتظار اعتماد أمين عهدة المستودع: ${getUserDisplayName(requiredVerifierId)}.`
            : `Transfer created (${newTrnId}) for qty (${allocQty}) awaiting custodian approval: ${getUserDisplayName(requiredVerifierId)}.`
        );
      }
    } catch (err) {
      console.error('Error allocating scrap:', err);
      alert(isAr ? 'حدث خطأ أثناء تخصيص وترحيل الهالك.' : 'Error allocating scrap.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Finished Goods Pallet Transfer Modal
  const handleOpenTransferFgModal = (group = null) => {
    if (!canTransferFg) {
      alert(isAr ? 'ليس لديك صلاحية ترحيل ونقل الباليتات لمستودع التام.' : 'You do not have permission to transfer pallets to Finished Goods warehouse.');
      return;
    }
    const targetWh = defaultFinishedGoodsWarehouse || finishedGoodsWarehouses[0] || null;
    setTransferFgGroup(group);
    setTransferFgWarehouseId(targetWh?.id || '');
    setShowTransferFgModal(true);
  };

  // Open Single Pallet Transfer Modal
  const handleOpenTransferSinglePallet = (group, pallet) => {
    const singlePalletGroup = {
      ...group,
      totalPallets: 1,
      totalQtyLarge: Number(pallet.qtyLarge || 0),
      totalQtySmall: Number(pallet.qtySmall || 0),
      pallets: [pallet],
      isSinglePallet: true,
      singlePalletNumber: pallet.palletNumber || pallet.palletId,
    };
    handleOpenTransferFgModal(singlePalletGroup);
  };

  // Resolve Liquid Tanks used for a Finished Pallet according to time / genealogy
  const resolvePalletLiquidTanks = (pallet, order) => {
    if (!pallet) return { tanks: [], displayStr: '', source: 'empty' };

    // 1. If explicit intermediateLiquidTanks array is stored and not empty
    if (Array.isArray(pallet.intermediateLiquidTanks) && pallet.intermediateLiquidTanks.length > 0) {
      const displayStr = pallet.intermediateLiquidTanks.map((t) => `#${t.tankNumber}`).join(' + ');
      return { tanks: pallet.intermediateLiquidTanks, displayStr, source: 'explicit' };
    }

    // 2. If intermediateLiquidTanksDisplay string is stored
    if (pallet.intermediateLiquidTanksDisplay && pallet.intermediateLiquidTanksDisplay !== '—') {
      return { tanks: [], displayStr: pallet.intermediateLiquidTanksDisplay, source: 'display_string' };
    }

    // 3. Check if order / product uses liquid intermediate from floor storage
    const targetOrder = order || workOrders.find((w) => w.id === pallet.workOrderId || String(w.orderNumber) === String(pallet.orderNumber));
    const recipe = targetOrder ? bomRecipes.find((b) => b.code === targetOrder.bomRecipeId || b.id === targetOrder.bomRecipeId) : null;

    // Check if any recipe component or order product corresponds to a floor liquid vessel
    let matchedVessel = null;
    if (recipe && Array.isArray(recipe.components)) {
      for (const comp of recipe.components) {
        const v = floorLiquidVessels.find((fv) => fv.materialCode === comp.itemId || fv.id === comp.itemId);
        if (v) {
          matchedVessel = v;
          break;
        }
      }
    }

    if (!matchedVessel && floorLiquidVessels.length > 0) {
      const pName = (targetOrder?.productNameAr || targetOrder?.productNameEn || '').toLowerCase();
      matchedVessel = floorLiquidVessels.find((fv) => {
        const matDoc = itemsMaster.find((itm) => itm.code === (fv.materialCode || fv.id));
        const mName = (matDoc?.nameAr || matDoc?.nameEn || fv.materialCode || '').toLowerCase();
        return (pName.includes('خل') && mName.includes('خل')) || (pName.includes('vinegar') && mName.includes('vinegar'));
      }) || (pName.includes('خل') || pName.includes('vinegar') ? floorLiquidVessels[0] : null);
    }

    if (!matchedVessel) {
      return { tanks: [], displayStr: '', source: 'no_vessel' };
    }

    const allTanks = [
      ...(Array.isArray(matchedVessel.activeTanks) ? matchedVessel.activeTanks : []),
      ...(Array.isArray(matchedVessel.historyTanks) ? matchedVessel.historyTanks : []),
    ];

    const pId = pallet.id || pallet.palletId;
    const oNum = String(pallet.orderNumber || targetOrder?.orderNumber || '');
    const pNum = Number(pallet.palletNumber);

    // 4. Check if any tank has this pallet explicitly recorded in consumedByPallets
    const matchingFromConsumed = allTanks.filter((t) => {
      if (!Array.isArray(t.consumedByPallets)) return false;
      return t.consumedByPallets.some((cp) => {
        const idMatch = pId && (cp.palletId === pId || cp.id === pId);
        const numMatch = oNum && String(cp.orderNumber) === oNum && Number(cp.palletNumber) === pNum;
        return idMatch || numMatch;
      });
    });

    if (matchingFromConsumed.length > 0) {
      const displayStr = matchingFromConsumed.map((t) => `#${t.tankNumber}`).join(' + ');
      return { tanks: matchingFromConsumed, displayStr, source: 'consumed_records' };
    }

    // 5. CHRONOLOGICAL TIME RESOLUTION:
    const pDate = pallet.productionDate || targetOrder?.productionDate || targetOrder?.orderDate || (pallet.stagedAt ? pallet.stagedAt.split('T')[0] : null) || (targetOrder?.createdAt ? targetOrder.createdAt.split('T')[0] : null);

    // Sort all tanks chronologically by pump completion
    const sortedTanks = [...allTanks].sort((a, b) => {
      const tA = new Date(a.pumpFinishedAt || a.pumpStartedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.pumpFinishedAt || b.pumpStartedAt || b.createdAt || 0).getTime();
      return tA - tB;
    });

    if (sortedTanks.length === 0) {
      return { tanks: [], displayStr: '', source: 'no_tanks' };
    }

    // If pallet has startTime & date, find tanks whose feeding window covers this pallet
    if (pDate && pallet.startTime) {
      const palletStartMs = new Date(`${pDate}T${pallet.startTime}:00`).getTime();
      const palletEndMs = pallet.endTime ? new Date(`${pDate}T${pallet.endTime}:00`).getTime() : (palletStartMs + 45 * 60 * 1000);

      const timeMatched = sortedTanks.filter((t) => {
        const pumpMs = t.pumpFinishedAt ? new Date(t.pumpFinishedAt).getTime() : (t.pumpStartedAt ? new Date(t.pumpStartedAt).getTime() : 0);
        const depletedMs = t.depletedAt ? new Date(t.depletedAt).getTime() : Infinity;
        return pumpMs <= palletEndMs && depletedMs >= palletStartMs;
      });

      if (timeMatched.length > 0) {
        const displayStr = timeMatched.map((t) => `#${t.tankNumber}`).join(' + ');
        return { tanks: timeMatched, displayStr, source: 'time_window' };
      }
    }

    // If exact time window didn't match, match by date and sequential pallet order
    if (pDate) {
      const sameDateTanks = sortedTanks.filter((t) => {
        const tDate = (t.pumpFinishedAt || t.pumpStartedAt || t.createdAt || '').split('T')[0];
        const dDate = t.depletedAt ? t.depletedAt.split('T')[0] : null;
        return tDate === pDate || (tDate <= pDate && (!dDate || dDate >= pDate));
      });

      if (sameDateTanks.length > 0) {
        const estPalletsPerTank = Math.max(1, Math.floor((Number(matchedVessel.singleBatchVolume) || 1000) / 300));
        const tankIdx = Math.min(sameDateTanks.length - 1, Math.floor((Math.max(1, pNum) - 1) / estPalletsPerTank));
        const assignedTank = sameDateTanks[tankIdx] || sameDateTanks[0];
        return { tanks: [assignedTank], displayStr: `#${assignedTank.tankNumber}`, source: 'date_sequence' };
      }
    }

    // Fallback: active tank on floor
    const fallbackTank = matchedVessel.activeTanks?.[0] || sortedTanks[sortedTanks.length - 1];
    if (fallbackTank) {
      return { tanks: [fallbackTank], displayStr: `#${fallbackTank.tankNumber}`, source: 'fallback_active' };
    }

    return { tanks: [], displayStr: '', source: 'none' };
  };

  // Open Admin Tank Override Modal for a Pallet
  const handleOpenTankOverrideModal = (pallet) => {
    const resolved = resolvePalletLiquidTanks(pallet);
    const currentLinked = Array.isArray(pallet.intermediateLiquidTanks) && pallet.intermediateLiquidTanks.length > 0
      ? pallet.intermediateLiquidTanks.map((t) => t.tankNumber).join(', ')
      : (resolved.displayStr ? resolved.displayStr.replace(/#/g, '').replace(/\+/g, ', ') : (pallet.intermediateLiquidTanksDisplay || ''));
    setTankOverridePallet(pallet);
    setTankOverrideInput(currentLinked);
  };

  // Save General Admin Tank Override
  const handleSaveTankOverride = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!tankOverridePallet) return;
    if (!isGeneralAdmin) {
      toast.error(isAr ? 'تعديل أرقام التانكات محصور بالمسؤول العام.' : 'Only General Admin can override linked tanks.');
      return;
    }

    const rawNums = (tankOverrideInput || '').split(/[,+\s]+/).map((s) => s.replace('#', '').trim()).filter(Boolean);
    if (rawNums.length === 0) {
      toast.error(isAr ? 'يرجى إدخال رقم تانك واحد على الأقل.' : 'Please enter at least one tank number.');
      return;
    }

    setIsSaving(true);
    try {
      const pId = tankOverridePallet.id || tankOverridePallet.palletId;
      const nowIso = new Date().toISOString();

      // Find matching tank details from floor_liquid_vessels
      const allAvailableTanks = floorLiquidVessels.flatMap((v) => [
        ...(Array.isArray(v.activeTanks) ? v.activeTanks : []),
        ...(Array.isArray(v.historyTanks) ? v.historyTanks : []),
      ]);

      const updatedTanks = rawNums.map((num) => {
        const matched = allAvailableTanks.find((t) => String(t.tankNumber) === String(num));
        return {
          tankId: matched?.tankId || `TANK-${num}`,
          tankNumber: num,
          lotNumber: matched?.lotNumber || `TANK-${num}`,
          materialCode: matched?.materialCode || '',
          consumedLiters: matched?.consumedLiters || 0,
          qaAcidity: matched?.qaAcidity || 5.0,
          rMaterialLots: Array.isArray(matched?.rMaterialLots) ? matched.rMaterialLots : [],
          adminOverridden: true,
          overriddenAt: nowIso,
          overriddenBy: currentUserName,
        };
      });

      const displayStr = updatedTanks.map((t) => `#${t.tankNumber}`).join(' + ');

      // 1. Update staged_floor_pallets
      await updateDoc(doc(db, 'staged_floor_pallets', pId), {
        intermediateLiquidTanks: updatedTanks,
        intermediateLiquidTanksDisplay: displayStr,
        updatedAt: serverTimestamp(),
        lastAdminTankOverrideAt: nowIso,
        lastAdminTankOverrideBy: currentUserName,
      }).catch(async () => {
        await setDoc(doc(db, 'staged_floor_pallets', pId), {
          intermediateLiquidTanks: updatedTanks,
          intermediateLiquidTanksDisplay: displayStr,
        }, { merge: true });
      });

      // 2. Update Work Order Pallet Record
      if (tankOverridePallet.workOrderId) {
        const woRef = doc(db, 'work_orders', tankOverridePallet.workOrderId);
        const targetWO = workOrders.find((w) => w.id === tankOverridePallet.workOrderId);
        if (targetWO && Array.isArray(targetWO.pallets)) {
          const updatedPallets = targetWO.pallets.map((pl) => {
            if (pl.palletId === pId || pl.id === pId) {
              return {
                ...pl,
                intermediateLiquidTanks: updatedTanks,
                intermediateLiquidTanksDisplay: displayStr,
              };
            }
            return pl;
          });
          await updateDoc(woRef, { pallets: updatedPallets, updatedAt: serverTimestamp() }).catch(() => {});
        }
      }

      // 3. Update production_transformations
      const transId = `TRANS-PAL-${pId}`;
      await updateDoc(doc(db, 'production_transformations', transId), {
        intermediateLiquidTanks: updatedTanks,
        intermediateLiquidTanksDisplay: displayStr,
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      // 4. Update floor_liquid_vessels for full two-way synchronization
      for (const fv of floorLiquidVessels) {
        let modified = false;
        const newActive = (fv.activeTanks || []).map((t) => {
          if (rawNums.includes(String(t.tankNumber))) {
            modified = true;
            const consumed = Array.isArray(t.consumedByPallets) ? [...t.consumedByPallets] : [];
            if (!consumed.some((cp) => cp.palletId === pId)) {
              consumed.push({
                orderNumber: tankOverridePallet.orderNumber || '',
                workOrderId: tankOverridePallet.workOrderId || '',
                palletId: pId,
                palletNumber: Number(tankOverridePallet.palletNumber),
                consumedLiters: 0,
                timestamp: nowIso,
                adminOverridden: true,
              });
            }
            const woIds = Array.isArray(t.finishedWorkOrderIds) ? [...t.finishedWorkOrderIds] : [];
            if (tankOverridePallet.orderNumber && !woIds.includes(String(tankOverridePallet.orderNumber))) {
              woIds.push(String(tankOverridePallet.orderNumber));
            }
            return { ...t, consumedByPallets: consumed, finishedWorkOrderIds: woIds };
          }
          return t;
        });

        const newHistory = (fv.historyTanks || []).map((t) => {
          if (rawNums.includes(String(t.tankNumber))) {
            modified = true;
            const consumed = Array.isArray(t.consumedByPallets) ? [...t.consumedByPallets] : [];
            if (!consumed.some((cp) => cp.palletId === pId)) {
              consumed.push({
                orderNumber: tankOverridePallet.orderNumber || '',
                workOrderId: tankOverridePallet.workOrderId || '',
                palletId: pId,
                palletNumber: Number(tankOverridePallet.palletNumber),
                consumedLiters: 0,
                timestamp: nowIso,
                adminOverridden: true,
              });
            }
            const woIds = Array.isArray(t.finishedWorkOrderIds) ? [...t.finishedWorkOrderIds] : [];
            if (tankOverridePallet.orderNumber && !woIds.includes(String(tankOverridePallet.orderNumber))) {
              woIds.push(String(tankOverridePallet.orderNumber));
            }
            return { ...t, consumedByPallets: consumed, finishedWorkOrderIds: woIds };
          }
          return t;
        });

        if (modified) {
          await updateDoc(doc(db, 'floor_liquid_vessels', fv.id || fv.materialCode), {
            activeTanks: newActive,
            historyTanks: newHistory,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }

      toast.success(
        isAr ? `تم تعديل التانكات المرتبطة بالباليتة إلى (${displayStr}) بنجاح.` : `Pallet linked tanks updated to (${displayStr}).`,
        isAr ? 'تم التعديل' : 'Updated'
      );
      setTankOverridePallet(null);
    } catch (err) {
      console.error('Error overriding pallet tanks:', err);
      toast.error(isAr ? 'فشل تعديل التانكات المرتبطة.' : 'Failed to update linked tanks.');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm Transfer of Staged Finished Pallets to FG Warehouse
  const handleConfirmTransferFg = async () => {
    if (!transferFgWarehouseId) {
      alert(isAr ? 'يرجى اختيار مستودع المنتجات التامة.' : 'Please select target Finished Goods warehouse.');
      return;
    }

    const isFgWh = finishedGoodsWarehouses.some((w) => w.id === transferFgWarehouseId);
    if (!isFgWh) {
      alert(isAr ? 'المستودع المختار ليس مستودع منتجات تامة مصنف.' : 'Selected warehouse is not classified as a Finished Goods warehouse.');
      return;
    }

    const palletsToTransfer = transferFgGroup
      ? transferFgGroup.pallets
      : activeStagedFloorPallets;

    if (!palletsToTransfer || palletsToTransfer.length === 0) {
      alert(isAr ? 'لا توجد بالتات جاهزة للترحيل.' : 'No pallets to transfer.');
      return;
    }

    setIsSaving(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const newTrnId = `TRN-FG-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const factoryWhId = factoryWarehouse?.id || warehouses[0]?.id || '';
      const targetWh = warehouses.find((w) => w.id === transferFgWarehouseId);
      const requiredVerifierId = targetWh?.responsibleUserId || '';

      const isAuthorizedDirectly = isGeneralAdmin || (requiredVerifierId && currentUserId === requiredVerifierId);
      const initialStatus = isAuthorizedDirectly ? 'completed' : 'pending_custodian_verification';

      const transferLines = palletsToTransfer.map((p) => {
        const ctnCost = Number(p.costPerLarge || 0);
        const pQtyL = Number(p.qtyLarge) || 0;
        const lineTotal = Number(p.palletTotalCost || (pQtyL * ctnCost).toFixed(2));

        return {
          itemId: p.finishedProductId || p.itemCode,
          itemCode: p.finishedProductId || p.itemCode,
          variantCode: p.packagingOptionCode || `${p.finishedProductId}-${p.packagingOptionSuffix}`,
          nameAr: p.productNameAr,
          nameEn: p.productNameEn || '',
          specs: p.packagingOptionNameAr || '',
          lotNumber: p.batchRangeDisplay || p.palletId || 'FG-LOT',
          smallUnit: p.outputSmallUnit || 'عبوة',
          largeUnitName: p.outputLargeUnit || 'كرتونة',
          packagingRatio: Number(p.packagingRatio) || 12,
          qtyLargeUnits: pQtyL,
          qtySmallUnits: Number(p.qtySmall) || 0,
          palletId: p.palletId,
          workOrderId: p.workOrderId,
          orderNumber: p.orderNumber,
          unitPrice: ctnCost,
          totalPrice: lineTotal,
          palletTotalCost: lineTotal,
          costPerLarge: ctnCost,
          costPerSmall: Number(p.costPerSmall || 0),
          intermediateLiquidTanks: p.intermediateLiquidTanks || null,
          intermediateLiquidTanksDisplay: p.intermediateLiquidTanksDisplay || null,
        };
      });

      const auditAction = isAuthorizedDirectly ? 'transfer_fg_completed_direct' : 'transfer_fg_requested_custodian';
      const auditNoteAr = isAuthorizedDirectly
        ? `تم ترحيل واستلام (${palletsToTransfer.length}) بالتات منتج تام بمستودع (${targetWh?.nameAr || 'المستودع المستهدف'}) فورياً`
        : `تم إنشاء طلب ترحيل (${palletsToTransfer.length}) بالتات منتج تام وبانتظار فحص واعتماد أمين العهدة (${getUserDisplayName(requiredVerifierId)})`;

      const transferDoc = {
        id: newTrnId,
        sourceWarehouse: factoryWhId,
        targetWarehouse: transferFgWarehouseId,
        transferDate: new Date().toISOString().split('T')[0],
        productionOrderRef: Array.from(new Set(palletsToTransfer.map((p) => p.orderNumber).filter(Boolean))).join(', '),
        notes: `ترحيل بالتات منتج تام من صالة الإنتاج (${palletsToTransfer.length} بالتات)`,
        lines: transferLines,
        status: initialStatus,
        requiredVerifierId: requiredVerifierId,
        issuedBy: currentUserName,
        issuedById: currentUserId,
        transferType: 'finished_goods',
        transferCategory: 'finished_goods',
        isFinishedGoods: true,
        verifiedBy: isAuthorizedDirectly ? currentUserName : '',
        verifiedAt: isAuthorizedDirectly ? new Date().toISOString() : '',
        auditTrail: [{
          version: '1.0',
          action: auditAction,
          status: initialStatus,
          performedBy: currentUserName,
          timestamp: new Date().toISOString(),
          noteAr: auditNoteAr,
          noteEn: `Transfer of ${palletsToTransfer.length} pallets to ${targetWh?.nameEn || targetWh?.nameAr}`,
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'stock_transfers', newTrnId), transferDoc);

      const palletStatusToSet = isAuthorizedDirectly ? 'transferred_to_fg' : 'transfer_pending';

      const nowIso = new Date().toISOString();
      for (const p of palletsToTransfer) {
        await updateDoc(doc(db, 'staged_floor_pallets', p.id || p.palletId), {
          status: palletStatusToSet,
          stagingStatus: palletStatusToSet,
          transferId: newTrnId,
          targetWarehouseId: transferFgWarehouseId,
          dispatchedAt: nowIso,
          dispatchedBy: currentUserName,
          dispatchedById: currentUserId,
          transferredAt: isAuthorizedDirectly ? nowIso : null,
          transferredBy: isAuthorizedDirectly ? currentUserName : null,
          transferAcceptedAt: isAuthorizedDirectly ? nowIso : null,
          verifiedBy: isAuthorizedDirectly ? currentUserName : null,
          updatedAt: serverTimestamp(),
        }).catch(() => {});

        if (p.workOrderId) {
          const wo = workOrders.find((o) => o.id === p.workOrderId);
          if (wo && Array.isArray(wo.pallets)) {
            const updatedOrderPallets = wo.pallets.map((orderPallet) => {
              if (orderPallet.palletId === p.palletId || (orderPallet.palletNumber === p.palletNumber && orderPallet.palletId === p.palletId)) {
                return {
                  ...orderPallet,
                  stagingStatus: palletStatusToSet,
                  transferId: newTrnId,
                  targetWarehouseId: transferFgWarehouseId,
                  dispatchedAt: nowIso,
                  dispatchedBy: currentUserName,
                  transferredAt: isAuthorizedDirectly ? nowIso : null,
                  transferAcceptedAt: isAuthorizedDirectly ? nowIso : null,
                  verifiedBy: isAuthorizedDirectly ? currentUserName : null,
                };
              }
              return orderPallet;
            });
            await updateDoc(doc(db, 'work_orders', wo.id), {
              pallets: updatedOrderPallets,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }
      }

      setShowTransferFgModal(false);
      setTransferFgGroup(null);

      if (isAuthorizedDirectly) {
        toast.success(
          isAr ? `تم ترحيل البالتات بنجاح إلى (${targetWh?.nameAr}) بموجب إذن التحويل: ${newTrnId}` : `Transferred successfully: ${newTrnId}`,
          isAr ? 'تم الترحيل' : 'Transferred'
        );
      } else {
        showAlert({
          title: isAr ? 'تم إنشاء طلب التحويل' : 'Transfer Created',
          message: isAr
            ? `تم إنشاء طلب التحويل رقم (${newTrnId}) وهو الآن بانتظار فحص واعتماد أمين عهدة المستودع: ${getUserDisplayName(requiredVerifierId)}.`
            : `Transfer created (${newTrnId}) awaiting approval from custodian: ${getUserDisplayName(requiredVerifierId)}.`,
          variant: 'info'
        });
      }
    } catch (err) {
      console.error('Error transferring pallets:', err);
      toast.error(isAr ? 'حدث خطأ أثناء ترحيل البالتات.' : 'Error transferring pallets.');
    } finally {
      setIsSaving(false);
    }
  };

  // Custodian Approval & Handshake Handler for Pending Movements
  const handleApprovePendingTransfer = async (trn) => {
    if (!trn || trn.status !== 'pending_custodian_verification') return;

    const canApprove = isGeneralAdmin || (trn.requiredVerifierId && currentUserId === trn.requiredVerifierId);
    if (!canApprove) {
      showAlert({
        title: isAr ? 'صلاحية غير كافية' : 'Insufficient Permission',
        message: isAr
          ? `عفواً، اعتماد هذا التحويل يتطلب صلاحية أمين عهدة المستودع المستهدف (${getUserDisplayName(trn.requiredVerifierId)}) أو المسؤول العام.`
          : 'Approval requires the assigned warehouse custodian or General Admin.',
        variant: 'error'
      });
      return;
    }

    const confirmed = await showConfirm({
      title: isAr ? 'تأكيد استلام التحويل' : 'Confirm Transfer Receipt',
      message: isAr ? `هل تؤكد فحص واستلام شحنة التحويل رقم (${trn.id}) في عهدة المستودع؟` : `Confirm inspection and receipt of transfer ${trn.id}?`,
      confirmText: isAr ? 'تأكيد الاستلام' : 'Confirm',
      cancelText: isAr ? 'إلغاء' : 'Cancel',
      variant: 'primary',
    });
    if (!confirmed) return;

    setIsSaving(true);
    try {
      const trnRef = doc(db, 'stock_transfers', trn.id);
      const auditTrail = [...(trn.auditTrail || [])];
      auditTrail.push({
        version: '1.0',
        action: 'transfer_custodian_approved',
        status: 'completed',
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: `تم فحص واعتماد التحويل واستلامه رسمياً في عهدة المستودع بواسطة (${currentUserName})`,
        noteEn: `Transfer verified and received in warehouse custody by (${currentUserName})`,
      });

      await updateDoc(trnRef, {
        status: 'completed',
        verifiedBy: currentUserName,
        verifiedById: currentUserId,
        verifiedAt: new Date().toISOString(),
        auditTrail,
        updatedAt: serverTimestamp(),
      });

      // Update linked staged pallets or scrap items
      if (Array.isArray(trn.lines)) {
        for (const line of trn.lines) {
          if (line.palletId) {
            await updateDoc(doc(db, 'staged_floor_pallets', line.palletId), {
              status: 'transferred_to_fg',
              transferredAt: new Date().toISOString(),
              transferredBy: currentUserName,
            }).catch(() => {});

            if (line.workOrderId) {
              const wo = workOrders.find((o) => o.id === line.workOrderId);
              if (wo && Array.isArray(wo.pallets)) {
                const updatedOrderPallets = wo.pallets.map((orderPallet) => {
                  if (orderPallet.palletId === line.palletId) {
                    return { ...orderPallet, stagingStatus: 'transferred_to_fg' };
                  }
                  return orderPallet;
                });
                await updateDoc(doc(db, 'work_orders', wo.id), {
                  pallets: updatedOrderPallets,
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              }
            }
          }
        }
      }

      alert(isAr ? `تم اعتماد التحويل المخزني رقم (${trn.id}) ودخول الأصناف للمستودع بنجاح.` : `Transfer ${trn.id} verified successfully.`);
    } catch (err) {
      console.error('Error approving transfer:', err);
      alert(isAr ? 'حدث خطأ أثناء اعتماد التحويل.' : 'Error approving transfer.');
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk Transfer Staged Materials to Destination Warehouse (With Custodian Approval)
  const handleBulkTransferStagedMaterials = async (targetWarehouseId) => {
    const itemsToTransfer = activeStagedFloorMaterials.filter((m) => m.targetWarehouseId === targetWarehouseId);
    if (itemsToTransfer.length === 0) return;

    setIsSaving(true);
    try {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const newTrnId = `TRN-SCRAP-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const factoryWhId = factoryWarehouse?.id || warehouses[0]?.id || '';
      const targetWh = warehouses.find((w) => w.id === targetWarehouseId);
      const requiredVerifierId = targetWh?.responsibleUserId || '';

      const isAuthorizedDirectly = isGeneralAdmin || (requiredVerifierId && currentUserId === requiredVerifierId);
      const initialStatus = isAuthorizedDirectly ? 'completed' : 'pending_custodian_verification';

      const transferLines = itemsToTransfer.map((item) => ({
        itemId: item.itemId,
        itemCode: item.itemCode,
        itemNameAr: item.itemNameAr,
        unit: item.unit,
        qtySmallUnits: item.quantity,
        qtyLargeUnits: 0,
        reason: item.reason,
        variantCode: item.variantCode || '',
        lotNumber: item.lotNumber || '',
        unitCost: Number(item.unitCost) || 0,
      }));

      const auditAction = isAuthorizedDirectly ? 'transfer_staged_scrap_from_floor' : 'transfer_scrap_requested_custodian';
      const auditNoteAr = isAuthorizedDirectly
        ? `ترحيل خامات تالفة/مرتجعة مجمعة من صالة الإنتاج إلى (${targetWh?.nameAr || 'المستودع المستهدف'}) فورياً`
        : `طلب ترحيل خامات تالفة/مرتجعة مجمعة إلى (${targetWh?.nameAr}) وبانتظار اعتماد أمين العهدة (${getUserDisplayName(requiredVerifierId)})`;

      const transferDoc = {
        id: newTrnId,
        sourceWarehouse: factoryWhId,
        targetWarehouse: targetWarehouseId,
        transferDate: new Date().toISOString().split('T')[0],
        productionOrderRef: Array.from(new Set(itemsToTransfer.map((i) => i.orderNumber).filter(Boolean))).join(', '),
        notes: `ترحيل مجمع لخامات تالفة ومرتجعات بالصالة (${itemsToTransfer.length} بنود)`,
        lines: transferLines,
        status: initialStatus,
        requiredVerifierId: requiredVerifierId,
        issuedBy: currentUserName,
        issuedById: currentUserId,
        verifiedBy: isAuthorizedDirectly ? currentUserName : '',
        verifiedAt: isAuthorizedDirectly ? new Date().toISOString() : '',
        auditTrail: [{
          version: '1.0',
          action: auditAction,
          status: initialStatus,
          performedBy: currentUserName,
          timestamp: new Date().toISOString(),
          noteAr: auditNoteAr,
          noteEn: `Bulk transfer of staged scrap from production floor to ${targetWh?.nameEn || targetWh?.nameAr}`,
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'stock_transfers', newTrnId), transferDoc);

      const itemStatusToSet = isAuthorizedDirectly ? 'transferred' : 'transfer_pending';

      for (const item of itemsToTransfer) {
        await updateDoc(doc(db, 'staged_floor_materials', item.id), {
          status: itemStatusToSet,
          transferId: newTrnId,
          transferredAt: isAuthorizedDirectly ? new Date().toISOString() : null,
          transferredBy: isAuthorizedDirectly ? currentUserName : null,
        });
      }

      if (isAuthorizedDirectly) {
        alert(isAr ? `تم ترحيل الخامات بنجاح إلى (${targetWh?.nameAr}) بموجب إذن التحويل: ${newTrnId}` : `Transferred successfully: ${newTrnId}`);
      } else {
        alert(
          isAr
            ? `تم إنشاء طلب ترحيل الخامات رقم (${newTrnId}) وهو الآن بانتظار فحص واعتماد أمين عهدة المستودع: ${getUserDisplayName(requiredVerifierId)}.`
            : `Transfer created (${newTrnId}) awaiting custodian approval: ${getUserDisplayName(requiredVerifierId)}.`
        );
      }
    } catch (err) {
      console.error('Error executing bulk transfer:', err);
      alert(isAr ? 'حدث خطأ أثناء ترحيل الخامات للمستودع.' : 'Error executing bulk transfer.');
    } finally {
      setIsSaving(false);
    }
  };

  // Plan Handlers
  const handleOpenCreatePlan = () => {
    if (isOrderLocked(selectedPlanDate)) {
      alert(isAr ? '🚫 تاريخ الخطة هذا سابق ومقفل ضد إضافة أوامر تشغيل جديدة (محصور بالمسؤول العام).' : 'This plan date is in the past and is locked (General Admin only).');
      return;
    }
    setEditingPlanOrder(null);
    setIsPlanBomMatrixExpanded(false);
    const existingOrders = workOrders.filter((o) => o.planDate === selectedPlanDate && o.status !== 'cancelled');
    const nextSeq = existingOrders.length > 0 
      ? Math.max(...existingOrders.map((o) => Number(o.importanceRank) || 0)) + 1 
      : 1;

    setPlanFormData({
      orderNumber: generateOrderNumber(selectedPlanDate),
      planDate: selectedPlanDate,
      finishedProductId: '', // Blank by default
      packagingOptionSuffix: 'A',
      packagingRatio: 12,
      bomRecipeId: '',
      productionLine: categories[0]?.key || 'white_o',
      priority: 'today',
      importanceRank: nextSeq,
      qtyExactness: 'approximate',
      plannedQtyLarge: 100,
      plannedQtySmall: 1200,
      componentSelections: {},
      processId: '',
      processCode: '',
      processNameAr: '',
      processNameEn: '',
      stepStaffing: [],
      notes: '',
    });
    setShowPlanModal(true);
  };

  const handleOpenEditPlan = (order) => {
    if (isOrderLocked(order)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل ضد التعديل (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }
    setEditingPlanOrder(order);
    setIsPlanBomMatrixExpanded(false);
    const prod = finishedProducts.find((p) => p.code === order.finishedProductId);

    // Resolve staffing: use existing or find steps from process
    let resolvedStaffing = Array.isArray(order.stepStaffing) && order.stepStaffing.length > 0 ? order.stepStaffing : [];
    if (resolvedStaffing.length === 0 && (order.processId || order.processCode)) {
      const proc = productionProcesses.find((p) => p.id === order.processId || p.processCode === order.processCode);
      if (proc) {
        resolvedStaffing = (proc.steps || []).map((s) => ({
          stepNum: s.stepNum,
          stepName: s.name,
          stepDesc: s.desc || '',
          mandatory: !!s.mandatory,
          workers: [],
        }));
      }
    }

    setPlanFormData({
      orderNumber: order.orderNumber || order.id,
      planDate: order.planDate,
      finishedProductId: order.finishedProductId,
      packagingOptionSuffix: order.packagingOptionSuffix || 'A',
      packagingRatio: Number(order.packagingRatio) || 12,
      bomRecipeId: order.bomRecipeId || '',
      productionLine: order.productionLine || prod?.productionLine || categories[0]?.key || 'white_o',
      priority: order.priority || 'today',
      importanceRank: Number(order.importanceRank) || 1,
      qtyExactness: order.qtyExactness || 'approximate',
      plannedQtyLarge: Number(order.plannedQtyLarge) || 100,
      plannedQtySmall: Number(order.plannedQtySmall) || 1200,
      componentSelections: order.componentSelections || {},
      processId: order.processId || '',
      processCode: order.processCode || '',
      processNameAr: order.processNameAr || '',
      processNameEn: order.processNameEn || '',
      stepStaffing: resolvedStaffing,
      notes: order.notes || '',
      isRework: !!order.isRework,
      reworkSourceVouchers: order.reworkSourceVouchers || [],
      reworkFaultTags: order.reworkFaultTags || [],
      missingSmallUnits: Number(order.missingSmallUnits) || 0,
      originalReturnQtyLarge: order.originalReturnQtyLarge != null ? Number(order.originalReturnQtyLarge) : (getOriginalReturnQty(order)?.qtyLarge ?? null),
      originalReturnQtySmall: order.originalReturnQtySmall != null ? Number(order.originalReturnQtySmall) : (getOriginalReturnQty(order)?.qtySmall ?? null),
      detectedFromOrderNumber: order.detectedFromOrderNumber || null,
    });
    setShowPlanModal(true);
  };

  const handleClonePlan = (order) => {
    setEditingPlanOrder(null);
    setIsPlanBomMatrixExpanded(false);
    const origFallback = getOriginalReturnQty(order);
    setPlanFormData({
      ...order,
      orderNumber: generateOrderNumber(selectedPlanDate),
      planDate: selectedPlanDate,
      importanceRank: workOrders.filter((o) => o.planDate === selectedPlanDate).length + 1,
      stepStaffing: Array.isArray(order.stepStaffing) ? JSON.parse(JSON.stringify(order.stepStaffing)) : [],
      notes: `نسخة من ${order.orderNumber}`,
      originalReturnQtyLarge: order.originalReturnQtyLarge != null ? Number(order.originalReturnQtyLarge) : (origFallback?.qtyLarge ?? null),
      originalReturnQtySmall: order.originalReturnQtySmall != null ? Number(order.originalReturnQtySmall) : (origFallback?.qtySmall ?? null),
    });
    setShowPlanModal(true);
  };

  // Unified Workers Pool (Users from usersList + Manual Workers from production_workers)
  const combinedWorkerPool = useMemo(() => {
    const systemWorkers = (usersList || [])
      .filter((u) => u.isActive !== false && u.status !== 'inactive')
      .map((u) => ({
        id: u.id,
        name: isAr ? (u.nameAr || u.name) : (u.name || u.nameAr),
        nameAr: u.nameAr || u.name || '',
        nameEn: u.nameEn || u.name || '',
        role: u.role || 'عامل تشغيل',
        department: u.department || 'الإنتاج',
        isManual: false,
      }));

    const manualList = (manualWorkers || [])
      .filter((w) => w.isActive !== false)
      .map((w) => ({
        id: w.id,
        name: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
        nameAr: w.nameAr || w.name || '',
        nameEn: w.nameEn || w.name || '',
        role: w.role || 'عامل تشغيل',
        department: w.department || 'الإنتاج',
        isManual: true,
      }));

    return [...systemWorkers, ...manualList];
  }, [usersList, manualWorkers, isAr]);

  // Production Process Compatibility Resolver
  const getCompatibleProcesses = (prodCode) => {
    if (!prodCode) return [];
    const prod = finishedProducts.find((p) => p.code === prodCode);
    const matched = productionProcesses.filter((proc) => {
      if (proc.status === 'inactive') return false;
      const list = proc.compatibleProductIds || [];
      return list.includes(prodCode);
    });
    if (matched.length > 0) return matched;

    // Category match fallback
    const prodCat = prod?.categoryKey || prod?.category || '';
    const catMatched = productionProcesses.filter((proc) => {
      if (proc.status === 'inactive') return false;
      if (!proc.category || !prodCat) return false;
      return proc.category.toLowerCase() === prodCat.toLowerCase();
    });
    if (catMatched.length > 0) return catMatched;

    return productionProcesses.filter((proc) => proc.status !== 'inactive');
  };

  // Process Selection Handler for Plan Form
  const handlePlanProcessChange = (procId) => {
    const proc = productionProcesses.find((p) => p.id === procId || p.processCode === procId);
    if (!proc) {
      setPlanFormData((prev) => ({
        ...prev,
        processId: '',
        processCode: '',
        processNameAr: '',
        processNameEn: '',
        stepStaffing: [],
      }));
      return;
    }
    const prevStaffing = planFormData.stepStaffing || [];
    const newStaffing = (proc.steps || []).map((s) => {
      const existing = prevStaffing.find((ps) => ps.stepName === s.name || ps.stepNum === s.stepNum);
      return {
        stepNum: s.stepNum,
        stepName: s.name,
        stepDesc: s.desc || '',
        mandatory: !!s.mandatory,
        workers: existing?.workers ? [...existing.workers] : [],
      };
    });

    setPlanFormData((prev) => ({
      ...prev,
      processId: proc.id || proc.processCode,
      processCode: proc.processCode,
      processNameAr: proc.nameAr,
      processNameEn: proc.nameEn || '',
      stepStaffing: newStaffing,
    }));
  };

  // Multi-Worker Assignment Toggler for Plan Steps
  const handleToggleWorkerInPlanStep = (stepNum, worker) => {
    setPlanFormData((prev) => {
      const currentStaffing = prev.stepStaffing || [];
      const updated = currentStaffing.map((step) => {
        if (step.stepNum !== stepNum) return step;
        const currentWorkers = step.workers || [];
        const exists = currentWorkers.some((w) => w.workerId === worker.id);
        const newWorkers = exists
          ? currentWorkers.filter((w) => w.workerId !== worker.id)
          : [...currentWorkers, { workerId: worker.id, workerName: worker.name, isManual: !!worker.isManual }];
        return { ...step, workers: newWorkers };
      });
      return { ...prev, stepStaffing: updated };
    });
  };

  // Process Selection Handler for Pallet Form
  const handlePalletProcessChange = (procId) => {
    const proc = productionProcesses.find((p) => p.id === procId || p.processCode === procId);
    if (!proc) {
      setPalletFormData((prev) => ({
        ...prev,
        processId: '',
        processCode: '',
        processNameAr: '',
        stepStaffing: [],
      }));
      return;
    }
    const prevStaffing = palletFormData.stepStaffing || [];
    const newStaffing = (proc.steps || []).map((s) => {
      const existing = prevStaffing.find((ps) => ps.stepName === s.name || ps.stepNum === s.stepNum);
      return {
        stepNum: s.stepNum,
        stepName: s.name,
        stepDesc: s.desc || '',
        mandatory: !!s.mandatory,
        workers: existing?.workers ? [...existing.workers] : [],
      };
    });

    setPalletFormData((prev) => ({
      ...prev,
      processId: proc.id || proc.processCode,
      processCode: proc.processCode,
      processNameAr: proc.nameAr,
      stepStaffing: newStaffing,
    }));
  };

  // Multi-Worker Assignment Toggler for Pallet Steps
  const handleToggleWorkerInPalletStep = (stepNum, worker) => {
    setPalletFormData((prev) => {
      const currentStaffing = prev.stepStaffing || [];
      const updated = currentStaffing.map((step) => {
        if (step.stepNum !== stepNum) return step;
        const currentWorkers = step.workers || [];
        const exists = currentWorkers.some((w) => w.workerId === worker.id);
        const newWorkers = exists
          ? currentWorkers.filter((w) => w.workerId !== worker.id)
          : [...currentWorkers, { workerId: worker.id, workerName: worker.name, isManual: !!worker.isManual }];
        return { ...step, workers: newWorkers };
      });
      return { ...prev, stepStaffing: updated };
    });
  };

  // Quick Manual Worker Creation on the Fly
  const handleQuickAddManualWorker = async (e) => {
    e.preventDefault();
    if (!quickWorkerName.trim()) return;
    const newWorkerId = `wrk_manual_${Date.now()}`;
    const workerObj = {
      id: newWorkerId,
      name: quickWorkerName.trim(),
      nameAr: quickWorkerName.trim(),
      nameEn: quickWorkerName.trim(),
      role: quickWorkerRole.trim() || 'عامل تشغيل',
      department: 'الإنتاج',
      isManual: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUserName,
    };

    try {
      await setDoc(doc(db, 'production_workers', newWorkerId), workerObj);
      // Auto-assign to triggered context if available
      if (quickWorkerTargetContext) {
        if (quickWorkerTargetContext.type === 'plan') {
          handleToggleWorkerInPlanStep(quickWorkerTargetContext.stepNum, workerObj);
        } else if (quickWorkerTargetContext.type === 'pallet') {
          handleToggleWorkerInPalletStep(quickWorkerTargetContext.stepNum, workerObj);
        }
      }
      setQuickWorkerName('');
      setShowQuickWorkerModal(false);
      setQuickWorkerTargetContext(null);
    } catch (err) {
      console.error('Error saving manual worker:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ العامل.' : 'Error saving worker.');
    }
  };

  // Available BOM Recipes for Selected Product and Packaging Option
  const availableBomRecipesForPlan = useMemo(() => {
    if (!planFormData.finishedProductId) return [];
    return bomRecipes.filter((b) => {
      if (b.finishedProductId !== planFormData.finishedProductId) return false;
      if (b.status === 'inactive' || b.status === 'archived') return false;
      if (b.scopeType === 'option_specific') {
        return b.packagingOptionSuffix === planFormData.packagingOptionSuffix;
      }
      return true;
    });
  }, [bomRecipes, planFormData.finishedProductId, planFormData.packagingOptionSuffix]);

  const handlePlanProductChange = (prodCode) => {
    const prod = finishedProducts.find((p) => p.code === prodCode);
    const options = prod?.packagingOptions || [];
    const primaryOpt = options[0] || {};
    const suffix = primaryOpt.suffix || 'A';
    const ratio = Number(primaryOpt.packagingRatio || prod?.packagingRatio || 12);
    const line = prod?.productionLine || categories[0]?.key || 'white_o';

    const matchingBoms = bomRecipes.filter(
      (b) => b.finishedProductId === prodCode &&
        (b.scopeType === 'option_specific' ? b.packagingOptionSuffix === suffix : true) &&
        b.status !== 'inactive'
    );
    const selectedBomId = matchingBoms[0]?.code || matchingBoms[0]?.id || '';

    // Auto-detect preferred/compatible process
    const compProcesses = getCompatibleProcesses(prodCode);
    const chosenProc = compProcesses[0] || null;
    const initialStaffing = (chosenProc?.steps || []).map((s) => ({
      stepNum: s.stepNum,
      stepName: s.name,
      stepDesc: s.desc || '',
      mandatory: !!s.mandatory,
      workers: [],
    }));

    setPlanFormData((prev) => ({
      ...prev,
      finishedProductId: prodCode,
      packagingOptionSuffix: suffix,
      packagingRatio: ratio,
      bomRecipeId: selectedBomId,
      productionLine: line,
      plannedQtySmall: (Number(prev.plannedQtyLarge) || 0) * ratio,
      processId: chosenProc?.id || chosenProc?.processCode || '',
      processCode: chosenProc?.processCode || '',
      processNameAr: chosenProc?.nameAr || '',
      processNameEn: chosenProc?.nameEn || '',
      stepStaffing: initialStaffing,
      componentSelections: {},
    }));
  };

  const handlePlanOptionChange = (suffix) => {
    const prod = finishedProducts.find((p) => p.code === planFormData.finishedProductId);
    const opt = (prod?.packagingOptions || []).find((o) => o.suffix === suffix);
    const ratio = Number(opt?.packagingRatio || prod?.packagingRatio || 12);

    const matchingBoms = bomRecipes.filter(
      (b) => b.finishedProductId === planFormData.finishedProductId &&
        (b.scopeType === 'option_specific' ? b.packagingOptionSuffix === suffix : true) &&
        b.status !== 'inactive'
    );
    const selectedBomId = matchingBoms[0]?.code || matchingBoms[0]?.id || '';

    setPlanFormData((prev) => ({
      ...prev,
      packagingOptionSuffix: suffix,
      packagingRatio: ratio,
      bomRecipeId: selectedBomId,
      plannedQtySmall: (Number(prev.plannedQtyLarge) || 0) * ratio,
      componentSelections: {},
    }));
  };

  const handlePlanQtyChange = (field, value) => {
    const num = Math.max(0, Number(value) || 0);
    const ratio = Number(planFormData.packagingRatio) || 1;

    if (field === 'plannedQtyLarge') {
      const newSmall = value === '' ? '' : Math.round(num * ratio);
      const newMissing = (planFormData.isRework && planFormData.originalReturnQtySmall != null && newSmall !== '')
        ? Math.max(0, newSmall - Number(planFormData.originalReturnQtySmall))
        : planFormData.missingSmallUnits;

      setPlanFormData((prev) => ({
        ...prev,
        plannedQtyLarge: value === '' ? '' : num,
        plannedQtySmall: newSmall,
        missingSmallUnits: newMissing,
      }));
    } else {
      const newLarge = value === '' ? '' : Number((num / ratio).toFixed(2));
      const newMissing = (planFormData.isRework && planFormData.originalReturnQtySmall != null && num !== '')
        ? Math.max(0, num - Number(planFormData.originalReturnQtySmall))
        : planFormData.missingSmallUnits;

      setPlanFormData((prev) => ({
        ...prev,
        plannedQtySmall: value === '' ? '' : num,
        plannedQtyLarge: newLarge,
        missingSmallUnits: newMissing,
      }));
    }
  };

  // Material commitments from other scheduled orders on the chosen plan date
  const existingPlanCommittedStock = useMemo(() => {
    if (!planFormData.planDate) return {};
    const otherOrders = workOrders.filter(
      (o) => o.planDate === planFormData.planDate && o.id !== editingPlanOrder?.id && o.status !== 'cancelled' && o.status !== 'completed'
    );
    if (otherOrders.length === 0) return {};

    const byVariant = {};
    const byItem = {};

    otherOrders.forEach((ord) => {
      const rec = bomRecipes.find((b) => b.code === ord.bomRecipeId || b.id === ord.bomRecipeId);
      if (!rec || !Array.isArray(rec.components)) return;

      const ratio = Number(ord.packagingRatio) || 12;
      const pallets = ord.pallets || [];
      const producedLarge = ord.totalProducedQtyLarge != null
        ? Number(ord.totalProducedQtyLarge)
        : (pallets.length > 0
            ? pallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || (Number(p.qtySmall || 0) / ratio) || 0), 0)
            : (Number(ord.totalProducedQtySmall || 0) / ratio));

      const plannedLarge = Number(ord.plannedQtyLarge || 0);
      const remainingLarge = Math.max(0, plannedLarge - producedLarge);
      if (remainingLarge <= 0) return;

      rec.components.forEach((c) => {
        const needed = remainingLarge * Number(c.standardQty || 1);
        const cleanSuffix = c.variantCode ? c.variantCode.replace(`${c.itemId}-`, '') : '';
        const sel = ord.componentSelections?.[c.itemId] || {};
        const varSuffix = sel.variantCode !== undefined && sel.variantCode !== '' ? sel.variantCode : cleanSuffix;
        const vCode = varSuffix ? `${c.itemId}-${varSuffix}` : null;

        if (vCode) {
          byVariant[vCode] = (byVariant[vCode] || 0) + needed;
        } else {
          byItem[c.itemId] = (byItem[c.itemId] || 0) + needed;
        }
      });
    });

    return { byVariant, byItem };
  }, [workOrders, planFormData.planDate, editingPlanOrder, bomRecipes]);

  // -------------------------------------------------------------------------
  // SMART CAPACITY BOTTLENECK ENGINE (Option 1: Max Producible Cartons)
  // Calculates the limiting bottleneck component based on selected LOT/variant available stock
  // -------------------------------------------------------------------------
  const planBottleneckInfo = useMemo(() => {
    if (!planFormData.bomRecipeId || !planFormData.plannedQtyLarge || Number(planFormData.plannedQtyLarge) <= 0) return null;
    const recipe = bomRecipes.find((b) => b.code === planFormData.bomRecipeId || b.id === planFormData.bomRecipeId);
    if (!recipe || !Array.isArray(recipe.components) || recipe.components.length === 0) return null;

    let minProducible = Infinity;
    let bottleneckComps = [];

    recipe.components.forEach((comp) => {
      const stdQty = Number(comp.standardQty || 1);
      if (stdQty <= 0) return;

      const itemDoc = itemsMaster.find((i) => i.code === comp.itemId || i.id === comp.itemId);
      const flagsArr = Array.isArray(itemDoc?.flags) ? itemDoc.flags : (itemDoc?.flag ? [itemDoc.flag] : []);
      const isMFlagged = flagsArr.some((f) => String(f).toUpperCase().includes('M')) || (comp.itemId && String(comp.itemId).toUpperCase().startsWith('M'));
      const isPipeFeeding = isMFlagged ||
        floorLiquidVessels.some((v) => v.materialCode === comp.itemId || v.id === comp.itemId) ||
        ((comp.unit || itemDoc?.smallUnit || '').includes('لتر') && (comp.materialNameAr || itemDoc?.nameAr || '').includes('خل'));

      // Continuous pipe-feeding materials are fed parallel to the production run from tanks and must not bottle-neck plan submission
      if (isPipeFeeding) return;

      const neededQty = stdQty * Number(planFormData.plannedQtyLarge || 0);
      const currentSel = planFormData.componentSelections?.[comp.itemId] || null;
      const smartSel = resolveSmartComponentSelection(comp, neededQty, currentSel);

      const effectiveSelections = {
        ...(planFormData.componentSelections || {}),
        [comp.itemId]: {
          variantCode: smartSel.variantSuffix,
          selectedLot: smartSel.lotNumber,
        }
      };

      const { totalCompanyStock: rawCompanyStock, targetVariantCode } = getComponentLiveStock(comp, effectiveSelections);
      const varKey = targetVariantCode || comp.itemId;
      const priorReservedCompany = existingPlanCommittedStock
        ? ((existingPlanCommittedStock.byVariant?.[varKey] || 0) + (existingPlanCommittedStock.byItem?.[comp.itemId] || 0))
        : 0;
      const effectiveCompanyStock = Math.max(0, rawCompanyStock - priorReservedCompany);

      const producibleCartons = Math.floor(effectiveCompanyStock / stdQty);

      const compInfo = {
        itemId: comp.itemId,
        materialNameAr: comp.materialNameAr || comp.itemId,
        unit: comp.unit || 'عبوة',
        stdQty,
        neededQty,
        effectiveCompanyStock,
        producibleCartons,
        smartSel,
        selectedLot: smartSel.lotNumber,
        selectedVariant: smartSel.variantSuffix,
      };

      if (producibleCartons < minProducible) {
        minProducible = producibleCartons;
        bottleneckComps = [compInfo];
      } else if (producibleCartons === minProducible) {
        bottleneckComps.push(compInfo);
      }
    });

    if (minProducible < Number(planFormData.plannedQtyLarge)) {
      return {
        plannedCartons: Number(planFormData.plannedQtyLarge),
        maxProducibleCartons: Math.max(0, minProducible),
        deficitCartons: Number(planFormData.plannedQtyLarge) - Math.max(0, minProducible),
        bottleneckComps,
      };
    }
    return null;
  }, [planFormData.bomRecipeId, planFormData.plannedQtyLarge, planFormData.componentSelections, bomRecipes, existingPlanCommittedStock, liveStockMatrix, itemsMaster, floorLiquidVessels]);

  // Execute Option 1: Smart Split into Primary Order (Capped to Stock) + Complementary Order (Shortfall awaiting replenishment)
  const handleExecuteSmartSplit = async () => {
    if (!splitModalData) return;
    const { bottleneckInfo, planFormData: pData } = splitModalData;
    const prod = finishedProducts.find((p) => p.code === pData.finishedProductId);
    const opt = (prod?.packagingOptions || []).find((o) => o.suffix === pData.packagingOptionSuffix);
    const ratio = Number(pData.packagingRatio) || 12;

    const primaryOrderId = editingPlanOrder?.id || pData.orderNumber || generateOrderNumber(pData.planDate);
    const complementaryOrderId = `${primaryOrderId}-CMP`;

    setIsSaving(true);
    try {
      // 1. Primary Order (Capped to maxProducibleCartons)
      const primaryQtyLarge = bottleneckInfo.maxProducibleCartons;
      const primaryQtySmall = primaryQtyLarge * ratio;

      const targetRecipe = bomRecipes.find((b) => b.code === pData.bomRecipeId || b.id === pData.bomRecipeId);
      const mergedSelectionsPrimary = { ...(pData.componentSelections || {}) };
      if (targetRecipe && Array.isArray(targetRecipe.components)) {
        targetRecipe.components.forEach((comp) => {
          const stdQty = Number(comp.standardQty || 1);
          const needed = stdQty * primaryQtyLarge;
          const currentSel = mergedSelectionsPrimary[comp.itemId];
          const smartSel = resolveSmartComponentSelection(comp, needed, currentSel);
          mergedSelectionsPrimary[comp.itemId] = {
            ...(currentSel || {}),
            variantCode: smartSel.variantSuffix,
            selectedLot: smartSel.lotNumber,
          };
        });
      }

      const primaryAuditEntry = {
        action: editingPlanOrder ? 'plan_edited_split' : 'plan_created_split',
        actionLabelAr: 'تقسيم وتشغيل جزئي بالحد الأقصى للرصيد',
        actionLabelEn: 'Smart Split to Max Stock Capacity',
        timestamp: new Date().toISOString(),
        user: currentUserName,
        summary: isAr
          ? `تم تقليص التشغيلة الأساسية إلى (${primaryQtyLarge} كرتونة) لتطابق 100% من رصيد اللوط المتاح (${bottleneckInfo.bottleneckComps.map((b) => b.materialNameAr).join(', ')}) دون توقف، مع إنشاء تشغيلة مكملة (${complementaryOrderId}) لتغطية العجز.`
          : `Split primary order to (${primaryQtyLarge} ctns) to consume 100% of available stock, companion order created for deficit.`,
      };

      const primaryPayload = {
        id: primaryOrderId,
        orderNumber: primaryOrderId,
        planDate: pData.planDate,
        status: editingPlanOrder?.status || 'scheduled',
        finishedProductId: pData.finishedProductId,
        productNameAr: prod?.nameAr || pData.finishedProductId,
        productNameEn: prod?.nameEn || prod?.nameAr || '',
        packagingOptionSuffix: pData.packagingOptionSuffix,
        packagingOptionCode: `${pData.finishedProductId}-${pData.packagingOptionSuffix}`,
        packagingOptionNameAr: opt?.nameAr || `خيار (${pData.packagingOptionSuffix})`,
        packagingRatio: ratio,
        outputSmallUnit: prod?.smallUnit || 'زجاجة',
        outputLargeUnit: prod?.largeUnitName || 'كرتونة',
        bomRecipeId: pData.bomRecipeId || '',
        productionLine: prod?.productionLine || pData.productionLine || 'white_o',
        processId: pData.processId || '',
        processCode: pData.processCode || '',
        processNameAr: pData.processNameAr || '',
        processNameEn: pData.processNameEn || '',
        stepStaffing: pData.stepStaffing || [],
        priority: pData.priority || 'today',
        importanceRank: Number(pData.importanceRank) || 1,
        qtyExactness: pData.qtyExactness || 'approximate',
        plannedQtyLarge: primaryQtyLarge,
        plannedQtySmall: primaryQtySmall,
        totalProducedQtySmall: editingPlanOrder?.totalProducedQtySmall || 0,
        totalProducedQtyLarge: editingPlanOrder?.totalProducedQtyLarge || 0,
        completionPercentage: editingPlanOrder?.completionPercentage || 0,
        componentSelections: mergedSelectionsPrimary,
        pallets: editingPlanOrder?.pallets || [],
        segments: editingPlanOrder?.segments || [],
        notes: (pData.notes || '').trim(),
        auditTrail: [primaryAuditEntry, ...(editingPlanOrder?.auditTrail || [])].slice(0, 30),
        isRework: !!pData.isRework,
        hasComplementaryOrder: true,
        complementaryOrderId: complementaryOrderId,
        updatedAt: serverTimestamp(),
      };
      if (!editingPlanOrder) {
        primaryPayload.createdAt = serverTimestamp();
        primaryPayload.createdBy = currentUserName;
      }

      // 2. Complementary Order (Deficit)
      const deficitQtyLarge = bottleneckInfo.deficitCartons;
      const deficitQtySmall = deficitQtyLarge * ratio;

      const mergedSelectionsComplementary = { ...(pData.componentSelections || {}) };
      // For bottleneck components: leave selectedLot blank awaiting GRN replenishment
      bottleneckInfo.bottleneckComps.forEach((b) => {
        mergedSelectionsComplementary[b.itemId] = {
          ...(mergedSelectionsComplementary[b.itemId] || {}),
          variantCode: mergedSelectionsComplementary[b.itemId]?.variantCode || b.selectedVariant || '',
          selectedLot: '', // Empty, awaiting new delivery!
        };
      });

      const complementaryAuditEntry = {
        action: 'complementary_order_created',
        actionLabelAr: 'إنشاء أمر تشغيل مكمل آلياً',
        actionLabelEn: 'Complementary Order Auto-Created',
        timestamp: new Date().toISOString(),
        user: currentUserName,
        summary: isAr
          ? `تشغيلة مكملة لأمر (${primaryOrderId}) لتغطية عجز قدره (${deficitQtyLarge} كرتونة) في انتظار توريد خامات جديدة (GRN).`
          : `Created complementary order for deficit of (${deficitQtyLarge} ctns) linked to (${primaryOrderId}) awaiting replenishment.`,
      };

      const complementaryPayload = {
        id: complementaryOrderId,
        orderNumber: complementaryOrderId,
        planDate: pData.planDate,
        status: 'scheduled',
        finishedProductId: pData.finishedProductId,
        productNameAr: prod?.nameAr || pData.finishedProductId,
        productNameEn: prod?.nameEn || prod?.nameAr || '',
        packagingOptionSuffix: pData.packagingOptionSuffix,
        packagingOptionCode: `${pData.finishedProductId}-${pData.packagingOptionSuffix}`,
        packagingOptionNameAr: opt?.nameAr || `خيار (${pData.packagingOptionSuffix})`,
        packagingRatio: ratio,
        outputSmallUnit: prod?.smallUnit || 'زجاجة',
        outputLargeUnit: prod?.largeUnitName || 'كرتونة',
        bomRecipeId: pData.bomRecipeId || '',
        productionLine: prod?.productionLine || pData.productionLine || 'white_o',
        processId: pData.processId || '',
        processCode: pData.processCode || '',
        processNameAr: pData.processNameAr || '',
        processNameEn: pData.processNameEn || '',
        stepStaffing: pData.stepStaffing || [],
        priority: pData.priority || 'today',
        importanceRank: (Number(pData.importanceRank) || 1) + 1,
        qtyExactness: pData.qtyExactness || 'approximate',
        plannedQtyLarge: deficitQtyLarge,
        plannedQtySmall: deficitQtySmall,
        totalProducedQtySmall: 0,
        totalProducedQtyLarge: 0,
        completionPercentage: 0,
        componentSelections: mergedSelectionsComplementary,
        pallets: [],
        segments: [],
        notes: (isAr ? `تشغيلة مكملة لأمر (${primaryOrderId}) لتغطية عجز (${deficitQtyLarge} كرتونة). ` : `Complementary order to (${primaryOrderId}) for deficit (${deficitQtyLarge} ctns). `) + (pData.notes || '').trim(),
        auditTrail: [complementaryAuditEntry],
        isComplementary: true,
        parentOrderId: primaryOrderId,
        complementaryReason: 'stock_bottleneck_split',
        awaitingReplenishment: true,
        awaitingComponentItemId: bottleneckInfo.bottleneckComps.map((b) => b.itemId).join(','),
        awaitingComponentItemNameAr: bottleneckInfo.bottleneckComps.map((b) => b.materialNameAr).join(', '),
        createdAt: serverTimestamp(),
        createdBy: currentUserName,
        updatedAt: serverTimestamp(),
      };

      const splitBatch = writeBatch(db);
      splitBatch.set(doc(db, 'work_orders', primaryOrderId), primaryPayload, { merge: true });
      splitBatch.set(doc(db, 'work_orders', complementaryOrderId), complementaryPayload, { merge: true });
      await splitBatch.commit();

      setSplitModalData(null);
      setShowPlanModal(false);
    } catch (err) {
      console.error('Error executing smart split:', err);
      alert(isAr ? 'حدث خطأ أثناء تنفيذ التقسيم الذكي.' : 'Error executing smart split.');
    } finally {
      setIsSaving(false);
    }
  };

  // Option 2: Cap current order only to maximum producible stock
  const handleCapToMaxOnly = () => {
    if (!splitModalData) return;
    const { bottleneckInfo } = splitModalData;
    handlePlanQtyChange('plannedQtyLarge', bottleneckInfo.maxProducibleCartons);
    setSplitModalData(null);
  };

  // Option 3: Schedule full quantity anyway with deficit recorded
  const handleScheduleWithDeficitAnyway = async () => {
    if (!splitModalData) return;
    setSplitModalData(null);
    await handleSavePlanOrder(null, true);
  };

  const handleSavePlanOrder = async (e = null, bypassSplit = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isOrderLocked(planFormData.planDate) || (editingPlanOrder && isOrderLocked(editingPlanOrder))) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل (محصور بالمسؤول العام).' : 'This order date is in the past and is locked (General Admin only).');
      return;
    }
    if (!planFormData.finishedProductId) {
      alert(isAr ? 'يرجى اختيار المنتج التام.' : 'Please select a product.');
      return;
    }
    if (!planFormData.plannedQtySmall || Number(planFormData.plannedQtySmall) <= 0) {
      alert(isAr ? 'يرجى إدخال كمية إنتاج صالحة.' : 'Please enter planned quantity.');
      return;
    }

    // Option 1 Smart Split Guard: If order exceeds available stock of selected LOT/variant, propose Smart Split
    if (!bypassSplit && planBottleneckInfo && planBottleneckInfo.deficitCartons > 0 && planBottleneckInfo.maxProducibleCartons > 0) {
      setSplitModalData({
        bottleneckInfo: planBottleneckInfo,
        planFormData: { ...planFormData },
      });
      return;
    }

    // Soft Shortage Confirmation Guard: Alert planner of company-wide shortages (after deducting prior plan commitments)
    const feasibility = evaluateBomFeasibility(
      planFormData.bomRecipeId,
      planFormData.plannedQtyLarge,
      planFormData.componentSelections,
      existingPlanCommittedStock
    );
    if (feasibility.status === 'shortage') {
      const shortageComps = (feasibility.components || []).filter((c) => !c.isSufficientOverall);
      const shortageSummary = shortageComps.map((c) => `• ${c.materialNameAr} (عجز: -${c.shortageDeficit.toLocaleString()} ${c.unit})`).join('\n');
      const proceed = await showConfirm({
        title: isAr ? 'تنبيه عجز في الخامات' : 'Material Shortage Warning',
        message: isAr
          ? `تنبيه عجز في الخامات بمستودعات الشركة ككل:\n\n${shortageSummary}\n\nهل ترغب في تثبيت الصنف بالخطة على افتراض توريدها قريباً؟`
          : `Material shortages detected across company warehouses:\n\n${shortageSummary}\n\nProceed with scheduling anyway?`,
        confirmText: isAr ? 'تثبيت بالخطة' : 'Schedule Anyway',
        cancelText: isAr ? 'تراجع' : 'Cancel',
        variant: 'warning',
      });
      if (!proceed) return;
    }

    setIsSaving(true);
    try {
      const prod = finishedProducts.find((p) => p.code === planFormData.finishedProductId);
      const opt = (prod?.packagingOptions || []).find((o) => o.suffix === planFormData.packagingOptionSuffix);
      const orderId = editingPlanOrder?.id || planFormData.orderNumber || generateOrderNumber(planFormData.planDate);

      // Compute granular diffs of what has changed
      const diffs = [];
      if (editingPlanOrder) {
        if (editingPlanOrder.planDate !== planFormData.planDate) {
          diffs.push(isAr ? `تاريخ التشغيل: (${editingPlanOrder.planDate}) ← (${planFormData.planDate})` : `Date: (${editingPlanOrder.planDate}) ➔ (${planFormData.planDate})`);
        }
        if (Number(editingPlanOrder.plannedQtyLarge) !== Number(planFormData.plannedQtyLarge)) {
          diffs.push(isAr ? `الكمية بالكرتونة: (${editingPlanOrder.plannedQtyLarge}) ← (${planFormData.plannedQtyLarge})` : `Cartons: (${editingPlanOrder.plannedQtyLarge}) ➔ (${planFormData.plannedQtyLarge})`);
        }
        if (Number(editingPlanOrder.plannedQtySmall) !== Number(planFormData.plannedQtySmall)) {
          diffs.push(isAr ? `إجمالي العبوات: (${Number(editingPlanOrder.plannedQtySmall).toLocaleString()}) ← (${Number(planFormData.plannedQtySmall).toLocaleString()})` : `Units: (${Number(editingPlanOrder.plannedQtySmall).toLocaleString()}) ➔ (${Number(planFormData.plannedQtySmall).toLocaleString()})`);
        }
        if (editingPlanOrder.packagingOptionSuffix !== planFormData.packagingOptionSuffix) {
          diffs.push(isAr ? `خيار التعبئة: (${editingPlanOrder.packagingOptionSuffix}) ← (${planFormData.packagingOptionSuffix})` : `Option: (${editingPlanOrder.packagingOptionSuffix}) ➔ (${planFormData.packagingOptionSuffix})`);
        }
        if (editingPlanOrder.priority !== planFormData.priority) {
          diffs.push(isAr ? `الأولوية: (${editingPlanOrder.priority}) ← (${planFormData.priority})` : `Priority: (${editingPlanOrder.priority}) ➔ (${planFormData.priority})`);
        }
        if (editingPlanOrder.productionLine !== planFormData.productionLine) {
          diffs.push(isAr ? `خط الإنتاج: (${editingPlanOrder.productionLine}) ← (${planFormData.productionLine})` : `Line: (${editingPlanOrder.productionLine}) ➔ (${planFormData.productionLine})`);
        }
        if (editingPlanOrder.qtyExactness !== planFormData.qtyExactness) {
          diffs.push(isAr ? `معيار المطابقة: (${editingPlanOrder.qtyExactness}) ← (${planFormData.qtyExactness})` : `Exactness: (${editingPlanOrder.qtyExactness}) ➔ (${planFormData.qtyExactness})`);
        }
        if ((editingPlanOrder.notes || '').trim() !== planFormData.notes.trim()) {
          diffs.push(isAr ? `الملاحظات: "${planFormData.notes.trim() || 'تمت إزالة الملاحظات'}"` : `Notes updated`);
        }
        if (editingPlanOrder.processCode !== planFormData.processCode) {
          diffs.push(isAr ? `مسار التشغيل: (${editingPlanOrder.processNameAr || 'غير محدد'}) ← (${planFormData.processNameAr || 'غير محدد'})` : `Process: (${editingPlanOrder.processCode || 'None'}) ➔ (${planFormData.processCode || 'None'})`);
        }

        // Check component variant and LOT selections diffs
        const oldComps = editingPlanOrder.componentSelections || {};
        const newComps = planFormData.componentSelections || {};
        const allCompKeys = Array.from(new Set([...Object.keys(oldComps), ...Object.keys(newComps)]));
        allCompKeys.forEach((k) => {
          const oldVar = oldComps[k]?.variantCode;
          const newVar = newComps[k]?.variantCode;
          const oldLot = oldComps[k]?.selectedLot;
          const newLot = newComps[k]?.selectedLot;
          if (oldVar !== newVar && newVar !== undefined) {
            diffs.push(isAr ? `تنوع الخامة [${k}]: (${oldVar || 'عام'}) ← (${newVar || 'عام'})` : `Variant [${k}]: (${oldVar || 'Gen'}) ➔ (${newVar || 'Gen'})`);
          }
          if (oldLot !== newLot && newLot !== undefined) {
            diffs.push(isAr ? `لوط الخامة [${k}]: (${oldLot || 'الأقدم'}) ← (${newLot || 'الأقدم'})` : `LOT [${k}]: (${oldLot || 'Oldest'}) ➔ (${newLot || 'Oldest'})`);
          }
        });
      }

      const auditEntry = {
        action: editingPlanOrder ? 'plan_edited' : 'plan_created',
        actionLabelAr: editingPlanOrder ? 'تعديل بيانات الخطة' : 'إدراج بالخطة',
        actionLabelEn: editingPlanOrder ? 'Plan Order Edited' : 'Plan Order Created',
        timestamp: new Date().toISOString(),
        user: currentUserName,
        summary: editingPlanOrder
          ? (diffs.length > 0 ? (isAr ? `تم تعديل (${diffs.length}) عناصر في أمر التشغيل` : `Updated (${diffs.length}) fields`) : (isAr ? 'تم حفظ التعديلات' : 'Order saved'))
          : (isAr ? `تم إدراج تشغيلة جديدة بكمية (${planFormData.plannedQtyLarge} ${prod?.largeUnitName || 'كرتونة'} = ${planFormData.plannedQtySmall} ${prod?.smallUnit || 'عبوة'}) بأولوية (${planFormData.priority})` : `Created order for ${planFormData.plannedQtyLarge} cartons`),
        changes: diffs,
      };

      const existingAudit = Array.isArray(editingPlanOrder?.auditTrail) ? editingPlanOrder.auditTrail : [];

      const resolvedLine = prod?.productionLine || planFormData.productionLine || categories[0]?.key || 'white_o';

      // Merge auto-resolved selections into final component selections for all BOM components
      const targetRecipe = bomRecipes.find((b) => b.code === planFormData.bomRecipeId || b.id === planFormData.bomRecipeId);
      const mergedSelections = { ...(planFormData.componentSelections || {}) };
      if (targetRecipe && Array.isArray(targetRecipe.components)) {
        targetRecipe.components.forEach((comp) => {
          const stdQty = Number(comp.standardQty || 1);
          const needed = stdQty * Number(planFormData.plannedQtyLarge || 0);
          const currentSel = mergedSelections[comp.itemId];
          const smartSel = resolveSmartComponentSelection(comp, needed, currentSel);
          mergedSelections[comp.itemId] = {
            ...(currentSel || {}),
            variantCode: smartSel.variantSuffix,
            selectedLot: smartSel.lotNumber,
          };
        });
      }

      const payload = {
        id: orderId,
        orderNumber: orderId,
        planDate: planFormData.planDate,
        status: editingPlanOrder?.status || 'scheduled',

        finishedProductId: planFormData.finishedProductId,
        productNameAr: prod?.nameAr || planFormData.finishedProductId,
        productNameEn: prod?.nameEn || prod?.nameAr || '',
        packagingOptionSuffix: planFormData.packagingOptionSuffix,
        packagingOptionCode: `${planFormData.finishedProductId}-${planFormData.packagingOptionSuffix}`,
        packagingOptionNameAr: opt?.nameAr || `خيار (${planFormData.packagingOptionSuffix})`,
        packagingRatio: Number(planFormData.packagingRatio) || 12,
        outputSmallUnit: prod?.smallUnit || 'زجاجة',
        outputLargeUnit: prod?.largeUnitName || 'كرتونة',
        bomRecipeId: planFormData.bomRecipeId || '',
        productionLine: resolvedLine, // Auto-derived from Finished Product Master

        processId: planFormData.processId || '',
        processCode: planFormData.processCode || '',
        processNameAr: planFormData.processNameAr || '',
        processNameEn: planFormData.processNameEn || '',
        stepStaffing: planFormData.stepStaffing || [],

        priority: planFormData.priority || 'today',
        importanceRank: Number(planFormData.importanceRank) || 1,
        qtyExactness: planFormData.qtyExactness || 'approximate',
        plannedQtyLarge: Number(planFormData.plannedQtyLarge) || 0,
        plannedQtySmall: Number(planFormData.plannedQtySmall) || 0,

        totalProducedQtySmall: editingPlanOrder?.totalProducedQtySmall || 0,
        totalProducedQtyLarge: editingPlanOrder?.totalProducedQtyLarge || 0,
        completionPercentage: editingPlanOrder?.completionPercentage || 0,
        componentSelections: mergedSelections,
        pallets: editingPlanOrder?.pallets || [],
        segments: editingPlanOrder?.segments || [],
        notes: planFormData.notes.trim(),
        auditTrail: [auditEntry, ...existingAudit].slice(0, 30),

        // Rework Tracking Fields
        isRework: !!planFormData.isRework,
        reworkSourceVouchers: planFormData.reworkSourceVouchers || [],
        reworkFaultTags: planFormData.reworkFaultTags || [],
        missingSmallUnits: Number(planFormData.missingSmallUnits) || 0,
        originalReturnQtyLarge: planFormData.originalReturnQtyLarge != null ? Number(planFormData.originalReturnQtyLarge) : null,
        originalReturnQtySmall: planFormData.originalReturnQtySmall != null ? Number(planFormData.originalReturnQtySmall) : null,

        metrics: editingPlanOrder?.metrics || {
          operationalDurationMins: 0,
          financialDurationMins: 0,
          opAvgSpeedPerUnit: 0,
          concurrencyCounts: { '1': 0, '2': 0, '3': 0, '4+': 0 }
        },

        updatedAt: serverTimestamp(),
      };

      if (!editingPlanOrder) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = currentUserName;
      }

      await setDoc(doc(db, 'work_orders', orderId), payload, { merge: true });

      // If rework order: update linked return vouchers to 'scheduled_for_rework'
      if (planFormData.isRework && Array.isArray(planFormData.reworkSourceVouchers)) {
        for (const vId of planFormData.reworkSourceVouchers) {
          try {
            await updateDoc(doc(db, 'faulty_fg_returns', vId), {
              status: 'scheduled_for_rework',
              scheduledWorkOrderId: orderId,
              scheduledAt: new Date().toISOString(),
              updatedAt: serverTimestamp(),
            });
          } catch (vErr) {
            console.warn('Failed to update return voucher to scheduled_for_rework:', vErr);
          }
        }
      }

      setShowPlanModal(false);
    } catch (err) {
      console.error('Error saving plan order:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ أمر التشغيل.' : 'Error saving order.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlanOrder = async (orderId, orderTitle) => {
    const order = workOrders.find((o) => o.id === orderId);
    if (!order) return;
    if (isOrderLocked(order)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل ضد الحذف (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }
    if ((order.pallets || []).length > 0) {
      alert(
        isAr
          ? '🚫 لا يمكن حذف أمر التشغيل مباشرة لوجود باليتات مسجلة عليه. يرجى حذف الباليتات من تبويب الباليتات أولاً لاسترجاع الخامات والسوائل بدقة.'
          : 'Cannot delete order directly because it has registered pallets. Please delete the pallets first to reverse materials and liquid.'
      );
      return;
    }
    if (!canCancel) {
      alert(isAr ? 'ليس لديك صلاحية حذف أوامر التشغيل.' : 'Permission denied.');
      return;
    }
    const confirmed = await showConfirm({
      title: isAr ? 'تأكيد حذف أمر التشغيل' : 'Confirm Delete Order',
      message: isAr ? `هل أنت متأكد من حذف أمر التشغيل (${orderTitle})؟` : `Delete order (${orderTitle})?`,
      confirmText: isAr ? 'حذف' : 'Delete',
      cancelText: isAr ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'work_orders', orderId));
      // Roll back any recorded component consumptions
      await deleteDoc(doc(db, 'production_transformations', `TRANS-WO-${orderId}`));
      toast.success(isAr ? `تم حذف أمر التشغيل (${orderTitle}) بنجاح.` : `Order (${orderTitle}) deleted.`);
    } catch (err) {
      console.error('Error deleting order:', err);
      toast.error(isAr ? 'حدث خطأ أثناء حذف أمر التشغيل.' : 'Error deleting order.');
    }
  };

  // ----------------------------------------------------
  // SUB-TAB 2: PALLET PASSPORT & CREW DECOMPOSITION
  // ----------------------------------------------------
  // Calculate maximum cartons producible strictly from available Factory Floor stock
  const getProducibleCartonsOnFloor = (bomRecipeId, componentSelections = null) => {
    const recipe = bomRecipes.find((b) => b.code === bomRecipeId || b.id === bomRecipeId);
    if (!recipe || !Array.isArray(recipe.components) || recipe.components.length === 0) return { maxCartons: 0, zeroComponent: null };

    let minCartons = Infinity;
    let zeroComponent = null;

    recipe.components.forEach((comp) => {
      const stdQty = Number(comp.standardQty || 1);
      const { floorStock, totalCompanyStock } = getComponentLiveStock(comp, componentSelections);

      const itemDoc = itemsMaster.find((i) => i.code === comp.itemId || i.id === comp.itemId);
      const flagsArr = Array.isArray(itemDoc?.flags) ? itemDoc.flags : (itemDoc?.flag ? [itemDoc.flag] : []);
      const isMFlagged = flagsArr.some((f) => String(f).toUpperCase().includes('M')) || (comp.itemId && String(comp.itemId).toUpperCase().startsWith('M'));
      const isPipeFeeding = isMFlagged ||
        floorLiquidVessels.some((v) => v.materialCode === comp.itemId || v.id === comp.itemId) ||
        ((comp.unit || itemDoc?.smallUnit || '').includes('لتر') && (comp.materialNameAr || itemDoc?.nameAr || '').includes('خل'));

      // If pipe-feeding (continuous overhead pipes from floor vessels), continuous parallel feed
      if (isPipeFeeding) return;

      const producible = Math.floor(floorStock / stdQty);
      if (producible < minCartons) {
        minCartons = producible;
      }
      if (floorStock <= 0 && !zeroComponent) {
        zeroComponent = comp.materialNameAr || comp.itemId;
      }
    });

    return {
      maxCartons: minCartons === Infinity ? 0 : minCartons,
      zeroComponent,
    };
  };

  const handleOpenAddPallet = async (order) => {
    if (isOrderLocked(order)) {
      showAlert({
        title: isAr ? 'أمر سابق مقفل' : 'Order Locked',
        message: isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل ضد إضافة بالتات جديدة (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).',
        variant: 'warning'
      });
      return;
    }
    // Floor Readiness Gate: Check factory floor availability
    const { maxCartons, zeroComponent } = getProducibleCartonsOnFloor(order.bomRecipeId, order.componentSelections);
    const pallets = order.pallets || [];
    const ratio = Number(order.packagingRatio) || 12;
    const actualProducedLarge = order.totalProducedQtyLarge != null
      ? Number(order.totalProducedQtyLarge)
      : (pallets.length > 0
          ? pallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || (Number(p.qtySmall || 0) / ratio) || 0), 0)
          : (Number(order.totalProducedQtySmall || 0) / ratio));
    const plannedLarge = Number(order.plannedQtyLarge) || (Number(order.plannedQtySmall || 0) / ratio) || 0;
    const remainingLarge = Math.max(0, plannedLarge - actualProducedLarge);

    // Case 1 & 2: Floor Readiness Gate (Applies to standard virgin production; rework orders sort/repack existing cartons)
    if (!order.isRework) {
      if (maxCartons <= 0) {
        showAlert({
          title: isAr ? 'رصيد الخامات غير متوفر بصالة الإنتاج' : 'No Floor Stock Available',
          message: isAr
            ? `🚫 لا يمكن بدء الإنتاج أو تسجيل البالتات:\nرصيد خامة (${zeroComponent || 'بعض الخامات'}) = 0 بصالة الإنتاج.\n\nيرجى تنفيذ إذن تحويل مخزني (TRN) من مستودع الخامات إلى صالة الإنتاج أولاً.`
            : `Cannot start production: Component stock is 0 on factory floor. Please transfer materials to floor warehouse first.`,
          variant: 'error'
        });
        return;
      }

      const targetQtyToCheck = remainingLarge > 0 ? remainingLarge : plannedLarge;
      if (maxCartons < targetQtyToCheck) {
        const proceed = await showConfirm({
          title: isAr ? 'تنبيه رصيد جزئي بصالة الإنتاج' : 'Partial Floor Stock Alert',
          message: isAr
            ? `الخامات المتوفرة حالياً بصالة الإنتاج تكفي لإنتاج (${maxCartons.toLocaleString()} كرتونة) فقط، بينما الكمية المتبقية لإتمام أمر التشغيل هي (${targetQtyToCheck.toLocaleString()} كرتونة).\n(تم إنجاز ${actualProducedLarge.toLocaleString()} كرتونة من أصل ${plannedLarge.toLocaleString()} كرتونة مخطط).\n\nهل ترغب في متابعة التشغيل وتسجيل البالتات في حدود الرصيد المتاح؟`
            : `Available floor stock can produce ${maxCartons} cartons, while remaining to produce is ${targetQtyToCheck} cartons (already produced ${actualProducedLarge} of ${plannedLarge}). Proceed in available limits?`,
          confirmText: isAr ? 'متابعة بالرصيد المتاح' : 'Proceed',
          cancelText: isAr ? 'إلغاء' : 'Cancel',
          variant: 'warning'
        });
        if (!proceed) return;
      }
    }

    const existingPallets = order.pallets || [];
    const maxNumInOrder = existingPallets.reduce((max, p) => Math.max(max, Number(p.palletNumber) || 0), 0);
    const stagedForOrder = (stagedFloorPallets || []).filter(
      (sp) => String(sp.workOrderId) === String(order.id) || String(sp.orderNumber) === String(order.orderNumber)
    );
    const maxNumInStaged = stagedForOrder.reduce((max, p) => Math.max(max, Number(p.palletNumber) || 0), 0);
    const nextPalletNum = Math.max(maxNumInOrder, maxNumInStaged) + 1;

    // Resolve initial process for pallet (pre-set according to plan)
    let selectedProcId = order.processId || '';
    let selectedProcCode = order.processCode || '';
    let selectedProcName = order.processNameAr || '';
    let initialStaffing = [];

    if (Array.isArray(order.stepStaffing) && order.stepStaffing.length > 0) {
      initialStaffing = JSON.parse(JSON.stringify(order.stepStaffing));
    } else {
      let proc = productionProcesses.find((p) => p.id === selectedProcId || p.processCode === selectedProcCode);
      if (!proc) {
        const comp = getCompatibleProcesses(order.finishedProductId);
        proc = comp[0];
      }
      if (proc) {
        selectedProcId = proc.id || proc.processCode;
        selectedProcCode = proc.processCode;
        selectedProcName = proc.nameAr;
        initialStaffing = (proc.steps || []).map((s) => ({
          stepNum: s.stepNum,
          stepName: s.name,
          stepDesc: s.desc || '',
          mandatory: !!s.mandatory,
          workers: [],
        }));
      }
    }

    const nowTimeStr = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    const defaultMachine = 'wrapping_1';

    // Checkpoint logic: find latest pallet on defaultMachine in this order
    const palletsOnMachine = (order.pallets || []).filter(
      (p) => (p.wrappingMachine || 'wrapping_1') === defaultMachine && p.endTime
    );
    let initialStartTime = nowTimeStr;
    if (palletsOnMachine.length > 0) {
      initialStartTime = palletsOnMachine[palletsOnMachine.length - 1].endTime;
    } else if (order.startTime) {
      initialStartTime = order.startTime;
    } else if (order.segments && order.segments.length > 0 && order.segments[0].startTime) {
      initialStartTime = order.segments[0].startTime;
    }

    setPalletTargetOrder(order);
    setEditingPalletIndex(null);
    setPalletFormData({
      palletNumber: nextPalletNum,
      qtyLarge: 50,
      qtySmall: 50 * ratio,
      wrappingMachine: defaultMachine,
      startTime: initialStartTime,
      endTime: nowTimeStr,
      status: 'completed',
      qcStatus: 'passed',
      processId: selectedProcId,
      processCode: selectedProcCode,
      processNameAr: selectedProcName,
      stepStaffing: initialStaffing,
      crew: [],
      notes: '',
      imageUrl: '',
    });
    setShowPalletModal(true);
  };

  const handleSelectWrappingMachine = (machine) => {
    const nowTimeStr = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    let nextStart = palletFormData.startTime;

    if (palletTargetOrder) {
      if (machine === 'wrapping_1' || machine === 'wrapping_2') {
        const palletsOnMachine = (palletTargetOrder.pallets || []).filter(
          (p, idx) => (p.wrappingMachine || 'wrapping_1') === machine && p.endTime && (editingPalletIndex === null || idx !== editingPalletIndex)
        );
        if (palletsOnMachine.length > 0) {
          nextStart = palletsOnMachine[palletsOnMachine.length - 1].endTime;
        } else if (palletTargetOrder.startTime) {
          nextStart = palletTargetOrder.startTime;
        } else if (palletTargetOrder.segments && palletTargetOrder.segments.length > 0 && palletTargetOrder.segments[0].startTime) {
          nextStart = palletTargetOrder.segments[0].startTime;
        } else {
          nextStart = nowTimeStr;
        }
      } else {
        // 'no_shrink' - independent of wrapping machine checkpoint chain
        if (palletTargetOrder.startTime) {
          nextStart = palletTargetOrder.startTime;
        } else {
          nextStart = nowTimeStr;
        }
      }
    }

    setPalletFormData((prev) => ({
      ...prev,
      wrappingMachine: machine,
      startTime: nextStart,
    }));
  };

  // ----------------------------------------------------
  // GENERAL ADMIN INTERLINKED PALLET REVERSALS & DEPENDENCY CHECKER (Phase 1)
  // ----------------------------------------------------
  const checkPalletDownstreamDependencies = (order, pallet) => {
    const blockers = [];
    const pId = pallet.palletId || `PAL-${order.orderNumber}-P${String(pallet.palletNumber).padStart(2, '0')}`;

    // 1. Direct status check on pallet
    const isTransferredToFG = pallet.stagingStatus === 'transferred_to_fg' || pallet.status === 'transferred_to_fg';

    // 2. Check staged_floor_pallets record
    const stagedP = (stagedFloorPallets || []).find((sp) => sp.id === pId || sp.palletId === pId);
    const isStagedTransferred = stagedP?.stagingStatus === 'transferred_to_fg' || stagedP?.status === 'transferred_to_fg';

    // 3. Check stock_transfers collection for finished goods transfer vouchers containing this pallet
    const linkedTransfers = (transfers || []).filter((t) => {
      if (t.status === 'cancelled' || t.status === 'reversed') return false;
      const hasLine = (t.lines || []).some(
        (l) => l.palletId === pId || (String(l.workOrderId) === String(order.id) && Number(l.palletNumber) === Number(pallet.palletNumber))
      );
      return hasLine;
    });

    linkedTransfers.forEach((trn) => {
      if (trn.status === 'completed') {
        blockers.push({
          type: 'fg_inward_completed',
          titleAr: 'مستلم بمستودع المنتجات التامة',
          titleEn: 'Received in Finished Goods Warehouse',
          voucherId: trn.id,
          date: trn.transferDate,
          targetWarehouse: trn.targetWarehouse,
          messageAr: `تم ترحيل واستلام هذه الباليتة رسمياً في مستودع المنتجات التامة بموجب إذن الترحيل (${trn.id}).`,
          messageEn: `This pallet was received in FG warehouse via transfer voucher (${trn.id}).`,
          actionType: 'navigate_fg_inward',
          actionTextAr: 'الانتقال لشاشة استلام المنتج التام لإلغاء الاستلام أولاً',
          actionTextEn: 'Go to FG Inward to reverse receipt first',
        });
      } else if (trn.status === 'in_transit' || trn.status === 'pending_acceptance') {
        blockers.push({
          type: 'fg_transfer_pending',
          titleAr: 'مدرج بإذن ترحيل قيد الانتظار',
          titleEn: 'Pending FG Transfer Voucher',
          voucherId: trn.id,
          date: trn.transferDate,
          messageAr: `الباليتة مدرجة في إذن ترحيل قيد الانتظار (${trn.id}). يجب حذف أو إلغاء إذن الترحيل أولاً.`,
          messageEn: `Pallet is listed in pending transfer (${trn.id}). Cancel or delete voucher first.`,
          actionType: 'navigate_transfers',
          actionTextAr: 'الانتقال لشاشة التحويلات المخزنية',
          actionTextEn: 'Go to Stock Transfers',
        });
      }
    });

    if ((isTransferredToFG || isStagedTransferred) && blockers.length === 0) {
      blockers.push({
        type: 'fg_flag_locked',
        titleAr: 'محصورة بمستودع المنتجات التامة',
        titleEn: 'Locked in FG Warehouse',
        messageAr: 'تم تعيين حالة الباليتة بأنها مرحلة للمنتجات التامة. يرجى إلغاء الاستلام بمستودع المنتجات التامة لإعادتها للصالة.',
        messageEn: 'Pallet is marked as transferred to FG.',
        actionType: 'navigate_fg_inward',
        actionTextAr: 'الانتقال لشاشة استلام المنتج التام',
        actionTextEn: 'Go to FG Inward',
      });
    }

    return {
      hasBlockers: blockers.length > 0,
      blockers,
    };
  };

  const handleOpenAdminPalletMenu = (order, pallet, pIdx) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'هذا الإجراء محصور بالمسؤول العام للنظام فقط.' : 'This action is restricted to General Admin.');
      return;
    }
    const { hasBlockers, blockers } = checkPalletDownstreamDependencies(order, pallet);
    if (hasBlockers) {
      setAdminDependencyModal({
        open: true,
        pallet,
        order,
        blockers,
        details: isAr
          ? 'وفقاً لقواعد سلامة البيانات والارتباط الشامل، لا يمكن إجراء تعديل أو إلغاء على الباليتة أثناء وجود حركات تابعة لها.'
          : 'According to Strict Dependency Blocker rules, this pallet cannot be modified or reversed while downstream records exist.',
      });
      return;
    }

    setAdminPalletActionsMenuModal({
      open: true,
      order,
      pallet,
      pIdx,
    });
  };

  const handleOpenAdminPalletEdit = (order, pallet, pIdx) => {
    setAdminPalletActionsMenuModal({ open: false, order: null, pallet: null, pIdx: -1 });
    const { hasBlockers, blockers } = checkPalletDownstreamDependencies(order, pallet);
    if (hasBlockers) {
      setAdminDependencyModal({
        open: true,
        pallet,
        order,
        blockers,
        details: isAr
          ? 'وفقاً لقواعد سلامة البيانات والارتباط الشامل، لا يمكن إجراء تعديل على الباليتة أثناء وجود حركات تابعة لها.'
          : 'According to Strict Dependency Blocker rules, this pallet cannot be modified while downstream records exist.',
      });
      return;
    }

    setIsAdminPalletAction(true);
    setAdminPalletReason('');
    handleOpenEditPallet(order, pIdx, true);
  };

  const handleOpenAdminPalletReversal = (order, pallet, pIdx) => {
    setAdminPalletActionsMenuModal({ open: false, order: null, pallet: null, pIdx: -1 });
    const { hasBlockers, blockers } = checkPalletDownstreamDependencies(order, pallet);
    if (hasBlockers) {
      setAdminDependencyModal({
        open: true,
        pallet,
        order,
        blockers,
        details: isAr
          ? 'وفقاً لقواعد سلامة البيانات والارتباط الشامل، لا يمكن إلغاء الباليتة أثناء وجود حركات تابعة لها.'
          : 'According to Strict Dependency Blocker rules, this pallet cannot be reversed while downstream records exist.',
      });
      return;
    }

    setAdminReversalModal({
      open: true,
      pallet,
      order,
      palletIndex: pIdx,
      reason: '',
      isSubmitting: false,
    });
  };

  const handleExecuteAdminReversal = async () => {
    const { order, pallet, palletIndex, reason } = adminReversalModal;
    if (!reason || reason.trim().length < 5) {
      alert(isAr ? 'يرجى كتابة سبب الإلغاء الإداري بوضوح (5 أحرف على الأقل).' : 'Please enter a valid justification reason (at least 5 characters).');
      return;
    }

    setAdminReversalModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const palletId = pallet.palletId || `PAL-${order.orderNumber}-P${String(pallet.palletNumber).padStart(2, '0')}`;
      const transId = `TRANS-PAL-${palletId}`;
      const nowIso = new Date().toISOString();

      // 1. Fetch transformation doc if exists to discover exact intermediate allocations
      let transData = null;
      try {
        const transSnap = await getDoc(doc(db, 'production_transformations', transId));
        if (transSnap.exists()) {
          transData = transSnap.data();
        }
      } catch (err) {
        console.warn('Could not read transformation doc for reversal:', err);
      }

      // Collect all intermediate liquid tank allocations
      const intermediateAllocations = [
        ...(Array.isArray(pallet.intermediateLiquidTanks) ? pallet.intermediateLiquidTanks : []),
        ...(Array.isArray(transData?.intermediateLiquidTanks) ? transData.intermediateLiquidTanks : []),
        ...((Array.isArray(transData?.consumedComponents) ? transData.consumedComponents : []).flatMap((c) =>
          Array.isArray(c.intermediateLiquidTanks) ? c.intermediateLiquidTanks : []
        )),
      ];

      // 2. Reverse intermediate liquid consumption back to floor_liquid_vessels
      try {
        const vesselsSnap = await getDocs(collection(db, 'floor_liquid_vessels'));
        for (const vDoc of vesselsSnap.docs) {
          const vData = vDoc.data();
          const vId = vDoc.id;
          let modified = false;

          let activeTanks = Array.isArray(vData.activeTanks) ? vData.activeTanks.map((t) => ({ ...t })) : [];
          let historyTanks = Array.isArray(vData.historyTanks) ? vData.historyTanks.map((t) => ({ ...t })) : [];

          const processTankReversal = (t) => {
            const consumedEntries = Array.isArray(t.consumedByPallets)
              ? t.consumedByPallets.filter(
                  (cp) =>
                    cp.palletId === palletId ||
                    (String(cp.workOrderId) === String(order.id) && Number(cp.palletNumber) === Number(pallet.palletNumber))
                )
              : [];

            let litersToRestore = consumedEntries.reduce((sum, cp) => sum + (Number(cp.consumedLiters) || 0), 0);

            if (litersToRestore <= 0 && intermediateAllocations.length > 0) {
              const tNumStr = String(t.tankNumber || '').replace('#', '').trim();
              const tIdStr = String(t.tankId || '').trim();
              const matchAlloc = intermediateAllocations.find((ia) => {
                const iaNum = String(ia.tankNumber || '').replace('#', '').trim();
                const iaId = String(ia.tankId || '').trim();
                return (tNumStr && iaNum && tNumStr === iaNum) || (tIdStr && iaId && tIdStr === iaId);
              });
              if (matchAlloc && Number(matchAlloc.consumedLiters) > 0) {
                litersToRestore = Number(matchAlloc.consumedLiters);
              }
            }

            if (litersToRestore > 0) {
              modified = true;
              t.remainingVolume = Number(((Number(t.remainingVolume) || 0) + litersToRestore).toFixed(2));
              if (t.status === 'exhausted' && t.remainingVolume > 0) {
                t.status = 'active';
              }
              if (Array.isArray(t.consumedByPallets)) {
                t.consumedByPallets = t.consumedByPallets.filter(
                  (cp) =>
                    cp.palletId !== palletId &&
                    !(String(cp.workOrderId) === String(order.id) && Number(cp.palletNumber) === Number(pallet.palletNumber))
                );
              }
            }
          };

          activeTanks.forEach(processTankReversal);
          historyTanks.forEach(processTankReversal);

          if (modified) {
            const updatedPoolVolume = activeTanks.reduce((sum, t) => sum + (Number(t.remainingVolume) || 0), 0);
            await updateDoc(doc(db, 'floor_liquid_vessels', vId), {
              ...vData,
              activeTanks,
              historyTanks,
              currentVolume: updatedPoolVolume,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (vErr) {
        console.error('Error reversing floor liquid vessels:', vErr);
      }

      // 3. Mark transformation as reversed in production_transformations (restores raw material stock in buildLiveStockMatrix)
      await setDoc(doc(db, 'production_transformations', transId), {
        status: 'reversed',
        isReversed: true,
        reversalReason: reason.trim(),
        reversedBy: currentUserName,
        reversedById: currentUser?.id || currentUser?.uid || '',
        reversedAt: nowIso,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 4. Update staged_floor_pallets (mark reversed)
      await setDoc(doc(db, 'staged_floor_pallets', palletId), {
        status: 'reversed',
        stagingStatus: 'reversed',
        isReversed: true,
        reversalReason: reason.trim(),
        reversedBy: currentUserName,
        reversedById: currentUser?.id || currentUser?.uid || '',
        reversedAt: nowIso,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 5. Update order.pallets: filter out or mark reversed
      const existingPallets = order.pallets || [];
      const updatedPallets = existingPallets.filter((_, idx) => idx !== palletIndex);
      const ratio = Number(order.packagingRatio) || 12;
      const totalProducedSmall = updatedPallets.reduce((sum, p) => sum + (Number(p.qtySmall) || 0), 0);
      const totalProducedLarge = Number(
        updatedPallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || (Number(p.qtySmall || 0) / ratio) || 0), 0).toFixed(2)
      );
      const plannedLarge = Number(order.plannedQtyLarge) || (Number(order.plannedQtySmall || 0) / ratio) || 1;
      const completionPct = Math.min(100, Number(((totalProducedLarge / plannedLarge) * 100).toFixed(2)));

      const wasCompleted = order.status === 'completed' || Number(order.completionPercentage || 0) >= 100;

      // Close Reversal Modal
      setAdminReversalModal({ open: false, pallet: null, order: null, palletIndex: -1, reason: '', isSubmitting: false });

      // Record audit entry on order
      const reversalAuditEntry = {
        action: 'admin_pallet_reversed',
        palletId,
        palletNumber: pallet.palletNumber,
        qtyLarge: pallet.qtyLarge,
        reason: reason.trim(),
        user: currentUserName,
        timestamp: nowIso,
      };
      const existingAudit = Array.isArray(order.auditTrail) ? order.auditTrail : [];

      if (wasCompleted && completionPct < 100) {
        // Trigger Adaptive Order Status Prompt Modal
        setAdminOrderStatusPromptModal({
          open: true,
          order,
          newCompletionPct: completionPct,
          onChoice: async (chosenStatus) => {
            await updateDoc(doc(db, 'work_orders', order.id), {
              pallets: updatedPallets,
              totalProducedQtySmall: totalProducedSmall,
              totalProducedQtyLarge: totalProducedLarge,
              completionPercentage: completionPct,
              status: chosenStatus,
              auditTrail: [reversalAuditEntry, ...existingAudit].slice(0, 40),
              updatedAt: serverTimestamp(),
            });
            setAdminOrderStatusPromptModal({ open: false, order: null, newCompletionPct: 0, onChoice: null });
            toast.success(
              isAr ? 'تم الإلغاء الإداري للباليتة بنجاح وتحديث حالة أمر التشغيل.' : 'Admin pallet reversal completed successfully.',
              isAr ? 'إلغاء إداري معتمد' : 'Authorized Reversal'
            );
          },
        });
      } else {
        const newOrderStatus = completionPct >= 100 ? 'completed' : (totalProducedLarge > 0 ? 'in_progress' : 'planned');
        await updateDoc(doc(db, 'work_orders', order.id), {
          pallets: updatedPallets,
          totalProducedQtySmall: totalProducedSmall,
          totalProducedQtyLarge: totalProducedLarge,
          completionPercentage: completionPct,
          status: newOrderStatus,
          auditTrail: [reversalAuditEntry, ...existingAudit].slice(0, 40),
          updatedAt: serverTimestamp(),
        });
        toast.success(
          isAr ? 'تم الإلغاء الإداري للباليتة واسترجاع الخامات والسوائل بنجاح.' : 'Admin pallet reversal completed successfully.',
          isAr ? 'إلغاء إداري معتمد' : 'Authorized Reversal'
        );
      }
    } catch (err) {
      console.error('Error executing admin pallet reversal:', err);
      toast.error(isAr ? 'حدث خطأ أثناء تنفيذ الإلغاء الإداري.' : 'Error executing admin reversal.');
      setAdminReversalModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleOpenEditPallet = (order, pIdx, isAdmin = false) => {
    if (!isAdmin && isOrderLocked(order)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل ضد التعديل (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }
    const pallet = (order.pallets || [])[pIdx];
    if (!pallet) return;
    if (pallet.stagingStatus === 'transferred_to_fg' || pallet.status === 'transferred_to_fg') {
      const { hasBlockers, blockers } = checkPalletDownstreamDependencies(order, pallet);
      if (hasBlockers) {
        setAdminDependencyModal({
          open: true,
          pallet,
          order,
          blockers,
          details: isAr
            ? 'وفقاً لقواعد سلامة البيانات والارتباط الشامل، لا يمكن إجراء تعديل أو إلغاء على الباليتة أثناء وجود حركات تابعة لها.'
            : 'According to Strict Dependency Blocker rules, this pallet cannot be modified or reversed while downstream records exist.',
        });
        return;
      }
    }
    setIsAdminPalletAction(isAdmin);
    setAdminPalletReason('');
    setPalletTargetOrder(order);
    setEditingPalletIndex(pIdx);
    setPalletFormData({
      palletNumber: pallet.palletNumber,
      qtyLarge: pallet.qtyLarge,
      qtySmall: pallet.qtySmall,
      wrappingMachine: pallet.wrappingMachine || 'wrapping_1',
      startTime: pallet.startTime || '',
      endTime: pallet.endTime || '',
      status: pallet.status || 'completed',
      qcStatus: pallet.qcStatus || 'passed',
      processId: pallet.processId || order.processId || '',
      processCode: pallet.processCode || order.processCode || '',
      processNameAr: pallet.processNameAr || order.processNameAr || '',
      stepStaffing: Array.isArray(pallet.stepStaffing) && pallet.stepStaffing.length > 0
        ? JSON.parse(JSON.stringify(pallet.stepStaffing))
        : (Array.isArray(order.stepStaffing) ? JSON.parse(JSON.stringify(order.stepStaffing)) : []),
      crew: pallet.crew || [],
      notes: pallet.notes || '',
      imageUrl: pallet.imageUrl || '',
    });
    setShowPalletModal(true);
  };

  const handleSavePalletPassport = async (e) => {
    e.preventDefault();
    if (!canRegisterPallet) {
      alert(isAr ? 'ليس لديك صلاحية تسجيل واعتماد باليتات الصالة وإصدار الجواز.' : 'You do not have permission to register floor pallets or issue passports.');
      return;
    }
    if (!palletTargetOrder) return;
    if (!isAdminPalletAction && isOrderLocked(palletTargetOrder)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }

    if (isAdminPalletAction && (!adminPalletReason || adminPalletReason.trim().length < 5)) {
      alert(isAr ? 'يرجى كتابة سبب التعديل الإداري المعتمد بوضوح (5 أحرف على الأقل).' : 'Please enter a valid justification reason for this admin modification (at least 5 characters).');
      return;
    }

    // Validate Pallet Number uniqueness within this work order
    const targetPalletNum = Number(palletFormData.palletNumber);
    if (!targetPalletNum || targetPalletNum <= 0) {
      alert(isAr ? 'يرجى إدخال رقم باليتة صحيح أكبر من الصفر.' : 'Please enter a valid pallet number greater than zero.');
      return;
    }

    const currentOrderPallets = palletTargetOrder.pallets || [];
    const isNumDuplicate = currentOrderPallets.some(
      (p, idx) => (editingPalletIndex === null || idx !== editingPalletIndex) && Number(p.palletNumber) === targetPalletNum
    );
    if (isNumDuplicate) {
      alert(
        isAr
          ? `🚫 رقم الباليتة #${targetPalletNum} مسجل مسبقاً في أمر التشغيل هذا. يرجى اختيار رقم باليتة غير مكرر لتجنب تداخل البيانات.`
          : `🚫 Pallet #${targetPalletNum} already exists in this work order. Please use another pallet number.`
      );
      return;
    }

    // Strict Mandatory Step Completion Validation
    const staffing = palletFormData.stepStaffing || [];
    const unassignedMandatory = staffing.filter((step) => step.mandatory && (!step.workers || step.workers.length === 0));

    if (unassignedMandatory.length > 0) {
      const missingList = unassignedMandatory.map((s) => `• الخطوة (${s.stepNum}): ${s.stepName}`).join('\n');
      alert(
        isAr
          ? `🚫 لا يمكن اعتماد أو حفظ الباليتة بدون تعيين عمال لكافة الخطوات الإلزامية:\n\n${missingList}\n\nيرجى تعيين عامل واحد على الأقل لكل خطوة إلزامية لإتمام الاعتماد.`
          : `Cannot save pallet without assigning workers to all mandatory steps:\n\n${missingList}\n\nPlease assign at least one worker to each mandatory step.`
      );
      return;
    }

    // Strict Pallet Save Gate: Verify that saving this pallet does not exceed available floor stock (virgin orders only)
    const recipe = bomRecipes.find((b) => b.code === palletTargetOrder.bomRecipeId || b.id === palletTargetOrder.bomRecipeId);
    if (!palletTargetOrder.isRework && recipe && Array.isArray(recipe.components)) {
      const pallets = palletTargetOrder.pallets || [];
      const priorSavedLarge = editingPalletIndex !== null && editingPalletIndex >= 0
        ? Number(pallets[editingPalletIndex]?.qtyLarge || 0)
        : 0;
      const currentPalletLarge = Number(palletFormData.qtyLarge || 0);
      const incrementalLargeNeeded = Math.max(0, currentPalletLarge - priorSavedLarge);

      const shortComponents = [];
      for (const comp of recipe.components) {
        const stdQty = Number(comp.standardQty || 1);
        const neededForThisPallet = incrementalLargeNeeded * stdQty;
        const { floorStock, totalCompanyStock } = getComponentLiveStock(comp, palletTargetOrder.componentSelections);

        const itemDoc = itemsMaster.find((i) => i.code === comp.itemId || i.id === comp.itemId);
        const flagsArr = Array.isArray(itemDoc?.flags) ? itemDoc.flags : (itemDoc?.flag ? [itemDoc.flag] : []);
        const isMFlagged = flagsArr.some((f) => String(f).toUpperCase().includes('M')) || (comp.itemId && String(comp.itemId).toUpperCase().startsWith('M'));
        const isPipeFeeding = isMFlagged ||
          floorLiquidVessels.some((v) => v.materialCode === comp.itemId || v.id === comp.itemId) ||
          ((comp.unit || itemDoc?.smallUnit || '').includes('لتر') && (comp.materialNameAr || itemDoc?.nameAr || '').includes('خل'));

        // Continuous pipe-feeding materials are tracked via floor vessels and not restricted by warehouse floor stock gate
        if (isPipeFeeding) continue;

        if (neededForThisPallet > floorStock) {
          shortComponents.push({
            comp,
            itemDoc,
            needed: neededForThisPallet,
            floorStock,
            totalCompanyStock,
            deficit: neededForThisPallet - floorStock,
            availableInWarehouse: Math.max(0, totalCompanyStock - floorStock),
          });
        }
      }

      if (shortComponents.length > 0) {
        const canFulfillFromCompany = shortComponents.every((sc) => sc.totalCompanyStock >= sc.needed);
        if (canFulfillFromCompany) {
          setAdminTransferGuidanceModal({
            open: true,
            shortComponents,
            order: palletTargetOrder,
            pallet: editingPalletIndex !== null ? palletTargetOrder.pallets?.[editingPalletIndex] : null,
            requiredCartons: currentPalletLarge,
          });
          return;
        } else {
          const deficitList = shortComponents
            .filter((sc) => sc.totalCompanyStock < sc.needed)
            .map((sc) => `• ${sc.comp.materialNameAr || sc.comp.itemId}: المطلوب (${sc.needed}) - الإجمالي بالشركة (${sc.totalCompanyStock})`)
            .join('\n');
          showAlert({
            title: isAr ? 'عجز كلي في خامات الشركة' : 'Total Company Stock Deficit',
            message: isAr
              ? `🚫 لا يمكن حفظ/تعديل الباليتة لأن إجمالي رصيد الخامات في كافة مستودعات الشركة غير كافٍ:\n\n${deficitList}\n\nتم إلغاء التعديل والحفاظ على الحالة الأصلية للباليتة دون تغيير.`
              : `Company stock is completely insufficient for this operation. Original pallet preserved.\n\n${deficitList}`,
            variant: 'error',
          });
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      const orderRef = doc(db, 'work_orders', palletTargetOrder.id);
      const pallets = [...(palletTargetOrder.pallets || [])];
      const ratio = Number(palletTargetOrder.packagingRatio) || 12;

      // Build backward-compatible crew array from stepStaffing
      const flattenedCrew = [];
      staffing.forEach((step) => {
        (step.workers || []).forEach((w) => {
          flattenedCrew.push({
            userId: w.workerId,
            name: w.workerName,
            role: step.stepName,
            isManual: !!w.isManual,
          });
        });
      });

      const dur = calculateDuration(palletFormData.startTime, palletFormData.endTime);
      const pDate = palletTargetOrder.productionDate || palletTargetOrder.orderDate || selectedPlanDate || new Date().toISOString().split('T')[0];
      const batchInfo = calculatePalletBatchRange(pDate, palletFormData.startTime, palletFormData.endTime);

      const pImage = palletFormData.imageUrl || '';
      const prodMaster = finishedProducts.find((fp) => fp.code === palletTargetOrder.finishedProductId);
      const optMaster = prodMaster?.packagingOptions?.find((o) => o.suffix === palletTargetOrder.packagingOptionSuffix || o.code === palletTargetOrder.packagingOptionCode);
      const effectiveProductImage = pImage || optMaster?.imageFile || prodMaster?.imageFile || '';

      const palletPayload = {
        palletId: `PAL-${palletTargetOrder.orderNumber}-P${String(palletFormData.palletNumber).padStart(2, '0')}`,
        palletNumber: Number(palletFormData.palletNumber),
        qtyLarge: Number(palletFormData.qtyLarge),
        qtySmall: Number(palletFormData.qtySmall),
        wrappingMachine: palletFormData.wrappingMachine || 'wrapping_1',
        startTime: palletFormData.startTime,
        endTime: palletFormData.endTime,
        durationMins: dur,
        batchStart: batchInfo.startBatch,
        batchEnd: batchInfo.endBatch,
        batchRangeDisplay: batchInfo.displayRange,
        status: palletFormData.status,
        qcStatus: palletFormData.qcStatus,
        processId: palletFormData.processId || '',
        processCode: palletFormData.processCode || '',
        processNameAr: palletFormData.processNameAr || '',
        stepStaffing: palletFormData.stepStaffing || [],
        crew: flattenedCrew,
        notes: palletFormData.notes.trim(),
        loggedAt: new Date().toISOString(),
        releasedAt: palletTargetOrder.releasedAt || palletTargetOrder.orderDate || palletTargetOrder.createdAt || new Date().toISOString(),
        productionDate: pDate,
        imageUrl: palletFormData.imageUrl || '',
        imageFile: effectiveProductImage,
        stagingStatus: 'staged_on_floor',
      };

      if (editingPalletIndex !== null) {
        const oldPalletId = pallets[editingPalletIndex]?.palletId;
        const newPalletId = palletPayload.palletId;
        if (oldPalletId && oldPalletId !== newPalletId) {
          await deleteDoc(doc(db, 'staged_floor_pallets', oldPalletId)).catch(() => {});
          await deleteDoc(doc(db, 'production_transformations', `TRANS-PAL-${oldPalletId}`)).catch(() => {});
        }
        // Retain staging status if already set
        palletPayload.stagingStatus = pallets[editingPalletIndex]?.stagingStatus || 'staged_on_floor';
        palletPayload.transferId = pallets[editingPalletIndex]?.transferId || null;
        pallets[editingPalletIndex] = palletPayload;
      } else {
        pallets.push(palletPayload);
      }

      // Recompute Total Produced from all Pallets
      const totalProducedSmall = pallets.reduce((sum, p) => sum + (Number(p.qtySmall) || 0), 0);
      const totalProducedLarge = Number(
        pallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || (Number(p.qtySmall || 0) / ratio) || 0), 0).toFixed(2)
      );
      const plannedLarge = Number(palletTargetOrder.plannedQtyLarge) || (Number(palletTargetOrder.plannedQtySmall || 0) / ratio) || 1;
      const completionPct = Math.min(100, Number(((totalProducedLarge / plannedLarge) * 100).toFixed(2)));

      // Pallets act as checkpoints and do not reset or inject split segments.
      // Continuous execution timeline is preserved.
      let segments = [...(palletTargetOrder.segments || [])];
      if (segments.length === 0) {
        segments.push({
          segmentId: `${palletTargetOrder.id}-seg-1`,
          date: selectedPlanDate,
          startTime: palletTargetOrder.startTime || palletFormData.startTime,
          endTime: '',
          durationMins: 0,
          netDurationMins: 0,
          status: 'Active',
          operator: currentUserName,
        });
      }

      const totalOpDur = segments.reduce((sum, s) => sum + (s.netDurationMins || s.durationMins || 0), 0);

      // 1. Commit Work Order Pallet Passport State
      await setDoc(
        orderRef,
        {
          status: palletTargetOrder.status === 'scheduled' ? 'in_progress' : palletTargetOrder.status,
          startTime: palletTargetOrder.startTime || palletFormData.startTime,
          totalProducedQtySmall: totalProducedSmall,
          totalProducedQtyLarge: totalProducedLarge,
          completionPercentage: completionPct,
          pallets,
          segments,
          metrics: {
            operationalDurationMins: totalOpDur,
            financialDurationMins: totalOpDur,
            opAvgSpeedPerUnit: totalProducedSmall > 0 ? Number((totalOpDur / totalProducedSmall).toFixed(3)) : 0,
            concurrencyCounts: palletTargetOrder.metrics?.concurrencyCounts || { '1': 0, '2': 0, '3': 0, '4+': 0 }
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2. Commit Per-Pallet Material Consumption & Staged Pallet Sync
      const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
      const now = new Date();
      const nowIso = now.toISOString();
      const timeFormatted = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

      // Clean up legacy single transformation doc if it existed
      await deleteDoc(doc(db, 'production_transformations', `TRANS-WO-${palletTargetOrder.id}`)).catch(() => {});

      // Working copies of floor vessels to track continuous top-up liquid allocations across pallets
      const vesselWorkingCopies = {};

      if (recipe && Array.isArray(recipe.components)) {
        for (let pIdx = 0; pIdx < pallets.length; pIdx++) {
          const p = pallets[pIdx];
          const isTargetPallet = (editingPalletIndex !== null && pIdx === editingPalletIndex) || (editingPalletIndex === null && pIdx === pallets.length - 1);
          const pId = p.palletId || `PAL-${palletTargetOrder.orderNumber}-P${String(p.palletNumber).padStart(2, '0')}`;
          const pTransId = `TRANS-PAL-${pId}`;
          const pQtyLarge = Number(p.qtyLarge || 0);
          const pQtySmall = Number(p.qtySmall || (pQtyLarge * ratio) || 0);

          if (pQtyLarge > 0) {
            let palletIntermediateTanks = (Array.isArray(p.intermediateLiquidTanks) && p.intermediateLiquidTanks.length > 0)
              ? [...p.intermediateLiquidTanks]
              : [];

            const pConsumed = recipe.components.map((comp) => {
              const itmDoc = itemsMaster.find((itm) => itm.code === comp.itemId);
              const r = Number(itmDoc?.packagingRatio || 1);
              const stdQty = Number(comp.standardQty || 1);
              const cQty = pQtyLarge * stdQty;
              const assignedSelection = palletTargetOrder.componentSelections?.[comp.itemId] || {};
              const vCode = assignedSelection.variantCode
                ? `${comp.itemId}-${assignedSelection.variantCode}`
                : comp.variantCode || itmDoc?.variations?.[0]?.variantCode || comp.itemId;

              let finalLotNumber = (assignedSelection.selectedLot || '').trim();
              let allocatedTanksForComp = [];

              // Check if component is an intermediate liquid material managed in floor vessels
              const isLiquidIntermediate = floorLiquidVessels.some((v) => v.materialCode === comp.itemId || v.id === comp.itemId) ||
                ((itmDoc?.flags || []).some((f) => String(f).toUpperCase().includes('M')) &&
                 ((comp.unit || itmDoc?.smallUnit || '').includes('لتر') || (comp.unit || itmDoc?.smallUnit || '').toLowerCase().includes('liter') || (comp.materialNameAr || itmDoc?.nameAr || '').includes('خل')));

              const oldPallet = editingPalletIndex !== null ? palletTargetOrder.pallets?.[editingPalletIndex] : null;
              const qtyChanged = oldPallet && (Number(oldPallet.qtyLarge) !== pQtyLarge || Number(oldPallet.qtySmall) !== pQtySmall);
              const shouldPreserveExistingTanks = palletIntermediateTanks.length > 0 && (!isTargetPallet || (editingPalletIndex !== null && !qtyChanged));

              if (isLiquidIntermediate) {
                // If not target pallet or editing without qty change, preserve already allocated tanks without duplicate deduction
                if (shouldPreserveExistingTanks) {
                  allocatedTanksForComp = palletIntermediateTanks;
                  finalLotNumber = palletIntermediateTanks
                    .map((t) => (t.lotNumber && t.lotNumber.startsWith('TANK-')) ? t.lotNumber : (t.tankNumber ? `TANK-${t.tankNumber}` : t.lotNumber || `#${t.tankNumber}`))
                    .join(' + ');
                } else {
                  if (!vesselWorkingCopies[comp.itemId]) {
                    const existingVessel = floorLiquidVessels.find((v) => v.materialCode === comp.itemId || v.id === comp.itemId);
                    if (existingVessel) {
                      vesselWorkingCopies[comp.itemId] = {
                        originalData: existingVessel,
                        activeTanks: Array.isArray(existingVessel.activeTanks) ? existingVessel.activeTanks.map((t) => ({ ...t })) : [],
                        historyTanks: Array.isArray(existingVessel.historyTanks) ? existingVessel.historyTanks.map((t) => ({ ...t })) : [],
                      };
                    }
                  }

                  const vCopy = vesselWorkingCopies[comp.itemId];
                  if (vCopy && vCopy.activeTanks.length > 0) {
                    // Unroll previous allocation of this edited pallet so new allocation is purely atomic
                    if (editingPalletIndex !== null && isTargetPallet && oldPallet) {
                      const oldPId = oldPallet.palletId || `PAL-${palletTargetOrder.orderNumber}-P${String(oldPallet.palletNumber).padStart(2, '0')}`;
                      const unrollPalletFromTank = (t) => {
                        if (Array.isArray(t.consumedByPallets)) {
                          const match = t.consumedByPallets.find((cp) => cp.palletId === oldPId || (String(cp.workOrderId) === String(palletTargetOrder.id) && Number(cp.palletNumber) === Number(oldPallet.palletNumber)));
                          if (match && Number(match.consumedLiters) > 0) {
                            t.remainingVolume = Number(((Number(t.remainingVolume) || 0) + Number(match.consumedLiters)).toFixed(2));
                            if (t.status === 'exhausted' && t.remainingVolume > 0) t.status = 'active';
                            t.consumedByPallets = t.consumedByPallets.filter((cp) => cp !== match);
                          }
                        }
                      };
                      vCopy.activeTanks.forEach(unrollPalletFromTank);
                      vCopy.historyTanks.forEach(unrollPalletFromTank);
                    }

                    let neededLiters = cQty;
                    for (let tIdx = 0; tIdx < vCopy.activeTanks.length; tIdx++) {
                      if (neededLiters <= 0) break;
                      const curTank = vCopy.activeTanks[tIdx];
                      const avail = Number(curTank.remainingVolume) || 0;
                      if (avail <= 0) continue;

                      const take = Math.min(avail, neededLiters);
                      curTank.remainingVolume = Number((avail - take).toFixed(2));
                      neededLiters = Number((neededLiters - take).toFixed(2));

                      const curTankCost = resolveItemOrLotCost({
                        itemId: comp.itemId,
                        lotNumber: curTank.lotNumber || (curTank.tankNumber ? `TANK-${curTank.tankNumber}` : ''),
                        tanks: liquidTanks,
                        transformations,
                        goodsReceipts,
                        itemsMaster,
                        liveStockMatrix,
                        intermediateRecipes,
                      }) || (Number(curTank.unitCost) > 0 && Number(curTank.unitCost) !== 5 ? Number(curTank.unitCost) : 0);
                      const tankAllocationEntry = {
                        tankId: curTank.tankId,
                        tankNumber: curTank.tankNumber,
                        lotNumber: curTank.lotNumber,
                        materialCode: comp.itemId,
                        consumedLiters: take,
                        unitCost: curTankCost,
                        totalCost: Number((take * curTankCost).toFixed(2)),
                        qaAcidity: curTank.qaAcidity || curTank.qaData?.concentration || 5.0,
                        qaData: curTank.qaData || (curTank.qaAcidity ? { concentration: curTank.qaAcidity, oxidation: curTank.oxidation || 'طبيعي / سليم', qaStatus: curTank.qaStatus || 'passed' } : null),
                        qaStatus: curTank.qaStatus || curTank.qaData?.qaStatus || 'passed',
                        oxidation: curTank.oxidation || curTank.qaData?.oxidation || 'طبيعي / سليم',
                        concentration: curTank.qaAcidity || curTank.qaData?.concentration || 5.0,
                        analyzedBy: curTank.qaData?.analyzedBy || curTank.pumpedBy || null,
                        analyzedAt: curTank.qaData?.analyzedAt || curTank.pumpFinishedAt || null,
                        labImage: curTank.qaData?.labImage || null,
                        notes: curTank.qaData?.notes || null,
                        rMaterialLots: Array.isArray(curTank.rMaterialLots) ? curTank.rMaterialLots : [],
                      };

                      allocatedTanksForComp.push(tankAllocationEntry);
                      if (!palletIntermediateTanks.some((x) => x.tankNumber === curTank.tankNumber)) {
                        palletIntermediateTanks.push(tankAllocationEntry);
                      }

                      if (!Array.isArray(curTank.consumedByPallets)) {
                        curTank.consumedByPallets = [];
                      }
                      curTank.consumedByPallets.push({
                        orderNumber: palletTargetOrder.orderNumber,
                        workOrderId: palletTargetOrder.id,
                        palletId: pId,
                        palletNumber: p.palletNumber,
                        consumedLiters: take,
                        timestamp: nowIso,
                        startTime: p.startTime || palletFormData.startTime,
                        endTime: p.endTime || palletFormData.endTime,
                        productionDate: pDate,
                      });

                      if (!Array.isArray(curTank.finishedWorkOrderIds)) {
                        curTank.finishedWorkOrderIds = [];
                      }
                      const ordNumStr = String(palletTargetOrder.orderNumber);
                      if (!curTank.finishedWorkOrderIds.includes(ordNumStr)) {
                        curTank.finishedWorkOrderIds.push(ordNumStr);
                      }
                    }

                    // Archive any tanks that have been completely drained to historyTanks
                    const depleted = vCopy.activeTanks.filter((t) => (Number(t.remainingVolume) || 0) <= 0);
                    vCopy.activeTanks = vCopy.activeTanks.filter((t) => (Number(t.remainingVolume) || 0) > 0);
                    depleted.forEach((dt) => {
                      vCopy.historyTanks.unshift({
                        ...dt,
                        depletedAt: nowIso,
                        status: 'depleted_in_production',
                      });
                    });

                    if (allocatedTanksForComp.length > 0) {
                      finalLotNumber = allocatedTanksForComp
                        .map((t) => (t.lotNumber && t.lotNumber.startsWith('TANK-')) ? t.lotNumber : (t.tankNumber ? `TANK-${t.tankNumber}` : t.lotNumber || `#${t.tankNumber}`))
                        .join(' + ');
                    }
                  }
                }
              }

              if (!finalLotNumber) {
                const activeFactoryLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
                  (l) => l.itemId === comp.itemId && (vCode ? l.variantCode === vCode : true) && (l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse)) && l.availableQty > 0
                );
                activeFactoryLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
                finalLotNumber = activeFactoryLots[0]?.lotNumber || '';
              }

              const unitCost = (allocatedTanksForComp.length > 0 && Number(allocatedTanksForComp[0]?.unitCost) > 0 && Number(allocatedTanksForComp[0]?.unitCost) !== 5)
                ? Number(allocatedTanksForComp[0].unitCost)
                : resolveItemOrLotCost({
                    itemId: comp.itemId,
                    variantCode: vCode,
                    lotNumber: finalLotNumber,
                    warehouseId: factoryWhId,
                    liveStockMatrix,
                    itemsMaster,
                    goodsReceipts,
                    tanks: liquidTanks,
                    transformations,
                    intermediateRecipes,
                  });
              const totalCost = Number((cQty * unitCost).toFixed(2));

              return {
                itemId: comp.itemId,
                variantCode: vCode,
                code: vCode,
                nameAr: comp.materialNameAr || itmDoc?.nameAr || comp.itemId,
                nameEn: itmDoc?.nameEn || '',
                smallUnit: comp.unit || itmDoc?.smallUnit || 'عبوة',
                largeUnitName: itmDoc?.largeUnitName || 'كرتونة',
                packagingRatio: r,
                qtySmallUnits: cQty,
                qtyLargeUnits: Number((cQty / r).toFixed(2)),
                warehouseId: factoryWhId,
                lotNumber: finalLotNumber,
                unitCost,
                totalCost,
                intermediateLiquidTanks: allocatedTanksForComp.length > 0 ? allocatedTanksForComp : null,
                rMaterialLots: allocatedTanksForComp.length > 0 ? allocatedTanksForComp.flatMap((t) => t.rMaterialLots || []) : null,
              };
            });

            // Calculate Rolled-up Pallet Costs
            const palletTotalCost = Number(pConsumed.reduce((sum, c) => sum + (c.totalCost || 0), 0).toFixed(2));
            const costPerLarge = pQtyLarge > 0 ? Number((palletTotalCost / pQtyLarge).toFixed(2)) : 0;
            const costPerSmall = pQtySmall > 0 ? Number((palletTotalCost / pQtySmall).toFixed(4)) : 0;

            p.palletTotalCost = palletTotalCost;
            p.costPerLarge = costPerLarge;
            p.costPerSmall = costPerSmall;

            // Attach intermediate liquid tanks and R-material genealogy to pallet
            p.intermediateLiquidTanks = palletIntermediateTanks;
            p.intermediateLiquidTanksDisplay = palletIntermediateTanks.map((t) => `#${t.tankNumber}`).join(' + ');

            // Write per-pallet consumption doc to production_transformations
            await setDoc(doc(db, 'production_transformations', pTransId), {
              id: pTransId,
              palletId: pId,
              workOrderId: palletTargetOrder.id,
              orderNumber: palletTargetOrder.orderNumber,
              date: selectedPlanDate,
              time: timeFormatted,
              timestamp: nowIso,
              warehouseId: factoryWhId,
              itemCode: palletTargetOrder.finishedProductId,
              variantCode: palletTargetOrder.packagingOptionCode || palletTargetOrder.finishedProductId,
              itemNameAr: palletTargetOrder.productNameAr,
              producedQty: pQtyLarge,
              yieldUnit: palletTargetOrder.outputLargeUnit,
              totalCost: palletTotalCost,
              costPerLarge: costPerLarge,
              costPerSmall: costPerSmall,
              unitCost: costPerLarge,
              unitPrice: costPerLarge,
              consumedComponents: pConsumed,
              intermediateLiquidTanks: palletIntermediateTanks,
              intermediateLiquidTanksDisplay: palletIntermediateTanks.map((t) => `#${t.tankNumber}`).join(' + '),
              status: 'completed',
              registeredBy: currentUserName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }, { merge: true });

            // Sync to staged_floor_pallets with complete genealogy
            await setDoc(doc(db, 'staged_floor_pallets', pId), {
              id: pId,
              palletId: pId,
              palletNumber: p.palletNumber,
              workOrderId: palletTargetOrder.id,
              orderNumber: palletTargetOrder.orderNumber,
              finishedProductId: palletTargetOrder.finishedProductId,
              productCode: palletTargetOrder.productCode || palletTargetOrder.finishedProductId,
              productNameAr: palletTargetOrder.productNameAr,
              productNameEn: palletTargetOrder.productNameEn || '',
              packagingOptionSuffix: palletTargetOrder.packagingOptionSuffix || 'A',
              packagingOptionNameAr: palletTargetOrder.packagingOptionNameAr || '',
              packagingOptionCode: palletTargetOrder.packagingOptionCode || '',
              packagingRatio: ratio,
              outputLargeUnit: palletTargetOrder.outputLargeUnit || 'كرتونة',
              outputSmallUnit: palletTargetOrder.outputSmallUnit || 'عبوة',
              qtyLarge: p.qtyLarge,
              qtySmall: p.qtySmall,
              startTime: p.startTime,
              endTime: p.endTime,
              batchStart: p.batchStart,
              batchEnd: p.batchEnd,
              batchRangeDisplay: p.batchRangeDisplay,
              status: p.stagingStatus || 'staged_on_floor',
              qcStatus: p.qcStatus || 'passed',
              palletTotalCost: palletTotalCost,
              costPerLarge: costPerLarge,
              costPerSmall: costPerSmall,
              consumedComponents: pConsumed,
              intermediateLiquidTanks: palletIntermediateTanks,
              intermediateLiquidTanksDisplay: palletIntermediateTanks.map((t) => `#${t.tankNumber}`).join(' + '),
              processId: palletTargetOrder.processId || palletTargetOrder.processCode || '',
              processNameAr: palletTargetOrder.processNameAr || '',
              processNameEn: palletTargetOrder.processNameEn || '',
              stepStaffing: Array.isArray(p.stepStaffing) && p.stepStaffing.length > 0
                ? p.stepStaffing
                : (palletFormData.stepStaffing || palletTargetOrder.stepStaffing || []),
              crew: Array.isArray(p.crew) && p.crew.length > 0
                ? p.crew
                : (palletFormData.crew || palletTargetOrder.crew || []),
              stagedAt: p.loggedAt || new Date().toISOString(),
              stagedBy: currentUserName,
              releasedAt: p.releasedAt || palletTargetOrder.releasedAt || palletTargetOrder.orderDate || palletTargetOrder.createdAt || new Date().toISOString(),
              productionDate: pDate,
              notes: p.notes || '',
              imageUrl: p.imageUrl || '',
              imageFile: effectiveProductImage,
            }, { merge: true });
          }
        }

        // Commit updated state to floor_liquid_vessels
        for (const [matCode, vCopy] of Object.entries(vesselWorkingCopies)) {
          const vRef = doc(db, 'floor_liquid_vessels', matCode);
          const newVol = vCopy.activeTanks.reduce((s, t) => s + (Number(t.remainingVolume) || 0), 0);
          await setDoc(vRef, {
            ...vCopy.originalData,
            activeTanks: vCopy.activeTanks,
            historyTanks: vCopy.historyTanks,
            currentVolume: newVol,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }

        // If admin action, record audit log on work order
        if (isAdminPalletAction) {
          const auditEntry = {
            action: 'admin_pallet_modified',
            palletNumber: palletPayload.palletNumber,
            qtyLarge: palletPayload.qtyLarge,
            reason: adminPalletReason.trim(),
            user: currentUserName,
            timestamp: nowIso,
          };
          const existingAudit = Array.isArray(palletTargetOrder.auditTrail) ? palletTargetOrder.auditTrail : [];
          await setDoc(orderRef, { pallets, auditTrail: [auditEntry, ...existingAudit].slice(0, 40) }, { merge: true });
        } else {
          // Update work order with enriched pallets containing intermediateLiquidTanks
          await setDoc(orderRef, { pallets }, { merge: true });
        }
      }

      setShowPalletModal(false);
      const wasAdmin = isAdminPalletAction;
      setIsAdminPalletAction(false);
      setAdminPalletReason('');

      const wasCompletedOrder = palletTargetOrder.status === 'completed' || Number(palletTargetOrder.completionPercentage || 0) >= 100;
      if (wasCompletedOrder && completionPct < 100) {
        setAdminOrderStatusPromptModal({
          open: true,
          order: palletTargetOrder,
          newCompletionPct: completionPct,
          onChoice: async (chosenStatus) => {
            await updateDoc(orderRef, {
              status: chosenStatus,
              updatedAt: serverTimestamp(),
            });
            setAdminOrderStatusPromptModal({ open: false, order: null, newCompletionPct: 0, onChoice: null });
            toast.success(
              isAr ? 'تم تحديث حالة أمر التشغيل وحفظ الباليتة بنجاح.' : 'Order status updated and pallet saved successfully.',
              isAr ? 'تم التحديث' : 'Updated'
            );
          },
        });
      } else {
        toast.success(
          isAr
            ? (wasAdmin ? 'تم اعتماد وحفظ التعديل الإداري للباليتة بنجاح.' : 'تم حفظ واعتماد جواز الباليتة بنجاح.')
            : 'Pallet passport saved successfully.',
          isAr ? 'تم الحفظ' : 'Saved'
        );
      }
    } catch (err) {
      console.error('Error saving pallet passport:', err);
      toast.error(isAr ? 'حدث خطأ أثناء حفظ البالتة.' : 'Error saving pallet.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Pallet and Instantly Reverse Consumed Raw Materials & Liquid Tanks
  const handleDeletePallet = async (order, palletIndex) => {
    if (isOrderLocked(order)) {
      alert(isAr ? '🚫 أمر التشغيل هذا بتاريخ سابق ومقفل ضد الحذف (محصور بالمسؤول العام).' : 'This order is from a past date and is locked (General Admin only).');
      return;
    }
    const pallet = (order.pallets || [])[palletIndex];
    if (!pallet) return;

    if (pallet.stagingStatus === 'transferred_to_fg' || pallet.status === 'transferred_to_fg') {
      alert(
        isAr
          ? '🚫 لا يمكن حذف هذه الباليتة لأنها رُحّلت بالفعل إلى مستودع المنتجات التامة.'
          : 'Cannot delete pallet because it has already been transferred to Finished Goods warehouse.'
      );
      return;
    }

    const confirmed = await showConfirm({
      title: isAr ? 'تأكيد حذف الباليتة' : 'Confirm Pallet Deletion',
      message: isAr
        ? `هل أنت متأكد من حذف الباليتة #${pallet.palletNumber} (${pallet.palletId || ''})؟\n\nسيتم إلغاء استهلاك الخامات فورياً وإعادتها لرصيد صالة الإنتاج وخزانات السوائل.`
        : `Are you sure you want to delete Pallet #${pallet.palletNumber}? Consumed materials and liquid storage will be reversed back immediately.`,
      confirmText: isAr ? 'حذف واسترجاع الخامات' : 'Delete & Reverse',
      cancelText: isAr ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      const palletId = pallet.palletId || `PAL-${order.orderNumber}-P${String(pallet.palletNumber).padStart(2, '0')}`;
      const transId = `TRANS-PAL-${palletId}`;

      // 1. Fetch transformation doc if exists to discover exact intermediate allocations
      let transData = null;
      try {
        const transSnap = await getDoc(doc(db, 'production_transformations', transId));
        if (transSnap.exists()) {
          transData = transSnap.data();
        }
      } catch (err) {
        console.warn('Could not read transformation doc for reversal:', err);
      }

      // Collect all intermediate liquid tank allocations recorded on pallet or transformation doc
      const intermediateAllocations = [
        ...(Array.isArray(pallet.intermediateLiquidTanks) ? pallet.intermediateLiquidTanks : []),
        ...(Array.isArray(transData?.intermediateLiquidTanks) ? transData.intermediateLiquidTanks : []),
        ...((Array.isArray(transData?.consumedComponents) ? transData.consumedComponents : []).flatMap((c) =>
          Array.isArray(c.intermediateLiquidTanks) ? c.intermediateLiquidTanks : []
        )),
      ];

      // 2. Reverse intermediate liquid consumption back to floor_liquid_vessels
      try {
        const vesselsSnap = await getDocs(collection(db, 'floor_liquid_vessels'));
        for (const vDoc of vesselsSnap.docs) {
          const vData = vDoc.data();
          const vId = vDoc.id;
          let modified = false;

          let activeTanks = Array.isArray(vData.activeTanks) ? vData.activeTanks.map((t) => ({ ...t })) : [];
          let historyTanks = Array.isArray(vData.historyTanks) ? vData.historyTanks.map((t) => ({ ...t })) : [];

          const processTankReversal = (t) => {
            const consumedEntries = Array.isArray(t.consumedByPallets)
              ? t.consumedByPallets.filter(
                  (cp) =>
                    cp.palletId === palletId ||
                    (String(cp.workOrderId) === String(order.id) && Number(cp.palletNumber) === Number(pallet.palletNumber))
                )
              : [];

            let litersToRestore = consumedEntries.reduce((sum, cp) => sum + (Number(cp.consumedLiters) || 0), 0);

            if (litersToRestore <= 0 && intermediateAllocations.length > 0) {
              const tNumStr = String(t.tankNumber || '').replace('#', '').trim();
              const tIdStr = String(t.tankId || '').trim();
              const matchAlloc = intermediateAllocations.find((ia) => {
                const iaNum = String(ia.tankNumber || '').replace('#', '').trim();
                const iaId = String(ia.tankId || '').trim();
                return (tNumStr && iaNum && tNumStr === iaNum) || (tIdStr && iaId && tIdStr === iaId);
              });
              if (matchAlloc && Number(matchAlloc.consumedLiters) > 0) {
                litersToRestore = Number(matchAlloc.consumedLiters);
              }
            }

            if (litersToRestore > 0) {
              modified = true;
              const curRem = Number(t.remainingVolume) || 0;
              const initVol = Number(t.initialVolume || t.volume || t.transferQuantity || 1000);
              let newRem = Number((curRem + litersToRestore).toFixed(2));
              if (initVol > 0 && newRem > initVol) {
                newRem = initVol;
              }
              t.remainingVolume = newRem;

              // Remove pallet entry from consumedByPallets
              if (Array.isArray(t.consumedByPallets)) {
                t.consumedByPallets = t.consumedByPallets.filter(
                  (cp) =>
                    !(
                      cp.palletId === palletId ||
                      (String(cp.workOrderId) === String(order.id) && Number(cp.palletNumber) === Number(pallet.palletNumber))
                    )
                );
              }

              // Update finishedWorkOrderIds if no other pallet for this order
              if (Array.isArray(t.finishedWorkOrderIds)) {
                const stillInThisTank = (t.consumedByPallets || []).some(
                  (cp) => String(cp.orderNumber) === String(order.orderNumber) || String(cp.workOrderId) === String(order.id)
                );
                if (!stillInThisTank) {
                  t.finishedWorkOrderIds = t.finishedWorkOrderIds.filter(
                    (fId) => fId !== String(order.orderNumber) && fId !== String(order.id)
                  );
                }
              }

              return true;
            }
            return false;
          };

          // Process active tanks
          activeTanks.forEach(processTankReversal);

          // Process history tanks (revive depleted tanks if liters restored)
          const tanksToRevive = [];
          historyTanks = historyTanks.filter((ht) => {
            const wasRestored = processTankReversal(ht);
            if (wasRestored && (Number(ht.remainingVolume) || 0) > 0) {
              ht.status = 'active';
              delete ht.depletedAt;
              tanksToRevive.push(ht);
              return false; // remove from historyTanks
            }
            return true; // keep in historyTanks
          });

          if (tanksToRevive.length > 0) {
            modified = true;
            tanksToRevive.forEach((rt) => {
              if (
                !activeTanks.some(
                  (at) => (rt.tankId && at.tankId === rt.tankId) || (rt.tankNumber && String(at.tankNumber) === String(rt.tankNumber))
                )
              ) {
                activeTanks.push(rt);
              }
            });

            // Keep activeTanks sorted
            activeTanks.sort((a, b) => {
              if (a.pumpFinishedAt && b.pumpFinishedAt) {
                return a.pumpFinishedAt.localeCompare(b.pumpFinishedAt);
              }
              return Number(a.tankNumber || 0) - Number(b.tankNumber || 0);
            });
          }

          if (modified) {
            const updatedPoolVolume = activeTanks.reduce((s, tk) => s + (Number(tk.remainingVolume) || 0), 0);
            await setDoc(
              doc(db, 'floor_liquid_vessels', vId),
              {
                ...vData,
                activeTanks,
                historyTanks,
                currentVolume: updatedPoolVolume,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      } catch (vErr) {
        console.error('Error reversing floor liquid vessels:', vErr);
      }

      // 3. Delete pallet transformation doc -> automatically reverses raw material deduction in buildLiveStockMatrix!
      await deleteDoc(doc(db, 'production_transformations', transId)).catch(() => {});

      // 4. Delete from staged_floor_pallets
      await deleteDoc(doc(db, 'staged_floor_pallets', palletId)).catch(() => {});

      // 5. Update order.pallets
      const updatedPallets = (order.pallets || []).filter((_, idx) => idx !== palletIndex);
      const ratio = Number(order.packagingRatio) || 12;
      const totalProducedSmall = updatedPallets.reduce((sum, p) => sum + (Number(p.qtySmall) || 0), 0);
      const totalProducedLarge = Number(
        updatedPallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || (Number(p.qtySmall || 0) / ratio) || 0), 0).toFixed(2)
      );
      const plannedLarge = Number(order.plannedQtyLarge) || (Number(order.plannedQtySmall || 0) / ratio) || 1;
      const completionPct = Math.min(100, Number(((totalProducedLarge / plannedLarge) * 100).toFixed(2)));
      const newOrderStatus = completionPct >= 100 ? 'completed' : (totalProducedLarge > 0 ? 'in_progress' : 'planned');

      const orderRef = doc(db, 'work_orders', order.id);
      await updateDoc(orderRef, {
        pallets: updatedPallets,
        totalProducedQtySmall: totalProducedSmall,
        totalProducedQtyLarge: totalProducedLarge,
        completionPercentage: completionPct,
        status: newOrderStatus,
        updatedAt: serverTimestamp(),
      });

      toast.success(
        isAr ? 'تم حذف الباليتة واسترجاع خاماتها ورصيد السوائل بنجاح.' : 'Pallet deleted and all materials & liquid volume restored successfully.',
        isAr ? 'تم الحذف والاسترجاع' : 'Deleted & Restored'
      );
    } catch (err) {
      console.error('Error deleting pallet:', err);
      toast.error(isAr ? 'حدث خطأ أثناء حذف الباليتة.' : 'Error deleting pallet.');
    } finally {
      setIsSaving(false);
    }
  };

  // ----------------------------------------------------
  // WORK ORDER EXECUTION CONTROLS & DYNAMIC CREW LOGIC
  // ----------------------------------------------------
  const getOrderCrewCount = (order) => {
    if (order.crewCount != null && Number(order.crewCount) > 0) {
      return Number(order.crewCount);
    }
    if (Array.isArray(order.stepStaffing)) {
      const workerIds = new Set();
      order.stepStaffing.forEach((s) => {
        (s.workers || []).forEach((w) => {
          if (w.workerId) workerIds.add(w.workerId);
          else if (w.workerName) workerIds.add(w.workerName);
        });
      });
      if (workerIds.size > 0) return workerIds.size;
    }
    if (Array.isArray(order.crew) && order.crew.length > 0) {
      return order.crew.length;
    }
    return 6;
  };

  const hasOrderTimeRecorded = (order) => {
    return Boolean(order.startTime || (order.segments && order.segments.length > 0));
  };

  const handleStartOrder = async (order, customTime) => {
    if (isOrderLocked(order)) {
      alert(isAr ? 'أمر التشغيل مقفل ضد التعديل.' : 'This order is locked.');
      return;
    }
    const effectiveTime = customTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    const existingSegments = [...(order.segments || [])];
    const newSeg = {
      segmentId: `${order.id}-seg-${existingSegments.length + 1}`,
      date: selectedPlanDate,
      startTime: effectiveTime,
      endTime: '',
      durationMins: 0,
      netDurationMins: 0,
      status: 'Active',
      operator: currentUserName,
    };
    existingSegments.push(newSeg);

    try {
      await updateDoc(doc(db, 'work_orders', order.id), {
        status: 'in_progress',
        startTime: order.startTime || effectiveTime,
        activeSegmentId: newSeg.segmentId,
        crewCount: getOrderCrewCount(order),
        segments: existingSegments,
        updatedAt: serverTimestamp(),
      });
      setOrderActionTimes((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      toast.success(
        isAr ? `تم بدء تشغيل أمر #${order.orderNumber} في تمام (${effectiveTime})` : `Started order #${order.orderNumber} at (${effectiveTime})`,
        isAr ? 'بدء التشغيل' : 'Order Started'
      );
    } catch (err) {
      console.error('Error starting order:', err);
      toast.error(isAr ? 'حدث خطأ أثناء بدء التشغيل' : 'Error starting order');
    }
  };

  const handlePauseOrder = async (order, customTime) => {
    if (isOrderLocked(order)) return;
    const effectiveTime = customTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    const segments = (order.segments || []).map((seg) => {
      if (seg.status === 'Active' || !seg.endTime) {
        const dur = calculateDuration(seg.startTime, effectiveTime);
        return {
          ...seg,
          endTime: effectiveTime,
          durationMins: dur,
          netDurationMins: dur,
          status: 'Completed',
        };
      }
      return seg;
    });

    try {
      await updateDoc(doc(db, 'work_orders', order.id), {
        status: 'paused',
        activeSegmentId: null,
        segments,
        updatedAt: serverTimestamp(),
      });
      setOrderActionTimes((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      toast.success(
        isAr ? `تم إيقاف أمر #${order.orderNumber} مؤقتاً في تمام (${effectiveTime})` : `Paused order #${order.orderNumber} at (${effectiveTime})`,
        isAr ? 'إيقاف مؤقت' : 'Order Paused'
      );
    } catch (err) {
      console.error('Error pausing order:', err);
      toast.error(isAr ? 'حدث خطأ أثناء الإيقاف المؤقت' : 'Error pausing order');
    }
  };

  const handleResumeOrder = async (order, customTime) => {
    if (isOrderLocked(order)) return;
    const effectiveTime = customTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    const existingSegments = [...(order.segments || [])];
    const newSeg = {
      segmentId: `${order.id}-seg-${existingSegments.length + 1}`,
      date: selectedPlanDate,
      startTime: effectiveTime,
      endTime: '',
      durationMins: 0,
      netDurationMins: 0,
      status: 'Active',
      operator: currentUserName,
    };
    existingSegments.push(newSeg);

    try {
      await updateDoc(doc(db, 'work_orders', order.id), {
        status: 'in_progress',
        activeSegmentId: newSeg.segmentId,
        segments: existingSegments,
        updatedAt: serverTimestamp(),
      });
      setOrderActionTimes((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      toast.success(
        isAr ? `تم استئناف أمر #${order.orderNumber} في تمام (${effectiveTime})` : `Resumed order #${order.orderNumber} at (${effectiveTime})`,
        isAr ? 'استئناف التشغيل' : 'Order Resumed'
      );
    } catch (err) {
      console.error('Error resuming order:', err);
      toast.error(isAr ? 'حدث خطأ أثناء استئناف التشغيل' : 'Error resuming order');
    }
  };

  const handleInitiateCompleteOrder = (order, customTime) => {
    if (isOrderLocked(order)) return;
    setCompletePromptModal({
      open: true,
      order,
      actionTime: customTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))),
    });
  };

  const handleConfirmCompleteWithoutPallet = async () => {
    const { order, actionTime } = completePromptModal;
    setCompletePromptModal({ open: false, order: null, actionTime: '' });
    if (order) {
      await handleCompleteOrder(order, actionTime, true);
    }
  };

  const handleConfirmCompleteWithFinalPallet = () => {
    const { order } = completePromptModal;
    setCompletePromptModal({ open: false, order: null, actionTime: '' });
    if (order) {
      handleOpenAddPallet(order);
    }
  };

  const handleCompleteOrder = async (order, customTime, skipConfirm = false) => {
    if (isOrderLocked(order)) return;
    const effectiveTime = customTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    if (!skipConfirm) {
      const confirmed = await showConfirm({
        title: isAr ? 'تأكيد إنهاء أمر التشغيل' : 'Confirm Order Completion',
        message: isAr
          ? `هل أنت متأكد من إنهاء تشغيل أمر #${order.orderNumber} في تمام الساعة (${effectiveTime})؟ سيتم إغلاق وقت التشغيل واعتماده كأمر مكتمل.`
          : `Are you sure you want to complete order #${order.orderNumber} at (${effectiveTime})?`,
        confirmText: isAr ? 'إنهاء التشغيل' : 'Complete',
        cancelText: isAr ? 'إلغاء' : 'Cancel',
        variant: 'primary',
      });
      if (!confirmed) return;
    }

    const segments = (order.segments || []).map((seg) => {
      if (seg.status === 'Active' || !seg.endTime) {
        const dur = calculateDuration(seg.startTime, effectiveTime);
        return {
          ...seg,
          endTime: effectiveTime,
          durationMins: dur,
          netDurationMins: dur,
          status: 'Completed',
        };
      }
      return seg;
    });

    try {
      await updateDoc(doc(db, 'work_orders', order.id), {
        status: 'completed',
        activeSegmentId: null,
        endTime: effectiveTime,
        segments,
        updatedAt: serverTimestamp(),
      });
      setOrderActionTimes((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      toast.success(
        isAr ? `تم إنهاء أمر #${order.orderNumber} في تمام (${effectiveTime})` : `Completed order #${order.orderNumber} at (${effectiveTime})`,
        isAr ? 'اكتمال التشغيل' : 'Order Completed'
      );
    } catch (err) {
      console.error('Error completing order:', err);
      toast.error(isAr ? 'حدث خطأ أثناء إنهاء التشغيل' : 'Error completing order');
    }
  };

  const handleUpdateCrewCount = async (order, delta) => {
    if (isOrderLocked(order)) return;
    const currentCount = getOrderCrewCount(order);
    const newCount = Math.max(1, currentCount + delta);
    try {
      await updateDoc(doc(db, 'work_orders', order.id), {
        crewCount: newCount,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error updating crew count:', err);
    }
  };

  // Subtab 2 Break Shortcut Handlers
  const handleStartActiveBreakFromSubtab2 = async () => {
    const startTime = subtab2BreakTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    setIsSaving(true);
    try {
      const breakId = `BRK-${selectedPlanDate}-${Date.now().toString().slice(-4)}`;
      await setDoc(doc(db, 'production_breaks', breakId), {
        id: breakId,
        date: selectedPlanDate,
        startTime,
        endTime: '',
        durationMins: 0,
        notes: subtab2BreakNotes.trim() || (isAr ? 'استراحة عامة للوردية' : 'Shift Break'),
        status: 'active',
        loggedBy: currentUserName,
        createdAt: serverTimestamp(),
      });
      setSubtab2BreakTime('');
      setSubtab2BreakNotes('');
      toast.success(
        isAr ? `تم بدء استراحة الوردية في تمام الساعة ${startTime}` : `Shift break started at ${startTime}`,
        isAr ? 'استراحة الوردية' : 'Shift Break'
      );
    } catch (err) {
      console.error('Error starting break:', err);
      toast.error(isAr ? 'حدث خطأ أثناء تسجيل الاستراحة' : 'Error starting break');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEndActiveBreakFromSubtab2 = async () => {
    if (!activeShiftBreak) return;
    const endTime = subtab2BreakTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    const dur = calculateDuration(activeShiftBreak.startTime, endTime);
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'production_breaks', activeShiftBreak.id), {
        endTime,
        durationMins: dur,
        status: 'completed',
        endedBy: currentUserName,
        updatedAt: serverTimestamp(),
      });
      setSubtab2BreakTime('');
      toast.success(
        isAr ? `تم إنهاء الاستراحة في تمام الساعة ${endTime} (المدة: ${dur} دقيقة)` : `Break ended at ${endTime} (${dur} mins)`,
        isAr ? 'انتهاء الاستراحة' : 'Break Ended'
      );
    } catch (err) {
      console.error('Error ending break:', err);
      toast.error(isAr ? 'حدث خطأ أثناء إنهاء الاستراحة' : 'Error ending break');
    } finally {
      setIsSaving(false);
    }
  };

  // ----------------------------------------------------
  // SUB-TAB 3: TIMELINE CANVAS & SHIFT SCORES
  // ----------------------------------------------------
  const activeShiftBreak = useMemo(() => {
    return globalBreaks.find(
      (b) => b.date === selectedPlanDate && b.status === 'active' && !b.endTime
    );
  }, [globalBreaks, selectedPlanDate]);

  const todayBreaks = useMemo(() => {
    return globalBreaks
      .filter((b) => b.date === selectedPlanDate && b.status !== 'cancelled')
      .map((b) => ({
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))),
        durationMins: calculateDuration(b.startTime, b.endTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)))),
        notes: b.notes || '',
      }));
  }, [globalBreaks, selectedPlanDate]);

  const todayTimelineData = useMemo(() => {
    const segments = [];
    const nowTimeStr = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));

    workOrders.forEach((order) => {
      (order.segments || []).forEach((seg, sIdx) => {
        if (seg.date === selectedPlanDate && seg.status !== 'Cancelled') {
          const sTime = seg.startTime;
          const eTime = seg.endTime || (seg.status === 'Active' ? nowTimeStr : sTime);
          const dur = calculateDuration(sTime, eTime);
          segments.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            productNameAr: order.productNameAr,
            segmentId: seg.segmentId || `${order.id}-${sIdx}`,
            startTime: sTime,
            endTime: eTime,
            isActive: seg.status === 'Active' || !seg.endTime,
            status: seg.status,
            durationMins: dur,
            netDurationMins: dur,
            crewCount: getOrderCrewCount(order),
          });
        }
      });
    });
    return segments;
  }, [workOrders, selectedPlanDate]);

  const shiftKpis = useMemo(() => {
    const shiftStart = 480; // 08:00
    const shiftEnd = 990;   // 16:30
    const nowTimeStr = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    const nowM = timeToMins(nowTimeStr);
    const isToday = selectedPlanDate === new Date().toISOString().split('T')[0];
    const latestEvalTime = isToday ? Math.min(shiftEnd, nowM) : shiftEnd;

    // 1440-minute occupancy timeline
    const occupiedTimeline = new Array(1440).fill(false);

    let actualFirstStart = 1440;
    let actualLastEnd = 0;
    let totalProdMins = 0;
    let totalBreakMins = 0;

    todayBreaks.forEach((b) => {
      const bDur = b.durationMins || 0;
      totalBreakMins += bDur;
      const sM = timeToMins(b.startTime);
      const eM = b.endTime ? timeToMins(b.endTime) : sM + bDur;
      const absEM = eM < sM ? eM + 1440 : eM;
      for (let m = sM; m < absEM; m++) {
        occupiedTimeline[m % 1440] = true;
      }
    });

    todayTimelineData.forEach((s) => {
      const sM = timeToMins(s.startTime);
      const eM = timeToMins(s.endTime);
      const absEM = eM < sM ? eM + 1440 : eM;
      if (sM < actualFirstStart) actualFirstStart = sM;
      if (eM > actualLastEnd) actualLastEnd = eM;

      for (let m = sM; m < absEM; m++) {
        occupiedTimeline[m % 1440] = true;
      }
      totalProdMins += (s.durationMins || 0);
    });

    // Detect waste gaps strictly between shiftStart and latestEvalTime
    const wasteGaps = [];
    if (!(isToday && nowM < shiftStart)) {
      let inGap = false;
      let gapStart = 0;
      for (let m = shiftStart; m <= latestEvalTime; m++) {
        if (!occupiedTimeline[m] && m !== latestEvalTime) {
          if (!inGap) {
            inGap = true;
            gapStart = m;
          }
        } else {
          if (inGap) {
            if (m - gapStart > 0) {
              wasteGaps.push({
                startMin: gapStart,
                endMin: m,
                startTime: minsToTime(gapStart),
                endTime: minsToTime(m),
                durationMins: m - gapStart,
              });
            }
            inGap = false;
          }
        }
      }
    }

    const totalWasteMins = wasteGaps.reduce((acc, g) => acc + g.durationMins, 0);

    const displayStart = actualFirstStart === 1440 ? 480 : actualFirstStart;
    const displayEnd = actualLastEnd === 0 ? 990 : actualLastEnd;
    const overtimeMins = Math.max(0, displayEnd - shiftEnd);

    const timeEfficiencyPct = (totalProdMins + totalWasteMins) > 0
      ? Number(((totalProdMins / (totalProdMins + totalWasteMins)) * 100).toFixed(1))
      : 100;

    return {
      shiftStartDisplay: minsToTime(displayStart),
      shiftEndDisplay: minsToTime(displayEnd),
      totalProdMins,
      totalBreakMins,
      totalWasteMins,
      overtimeMins,
      timeEfficiencyPct,
      wasteGaps,
    };
  }, [todayBreaks, todayTimelineData, selectedPlanDate]);

  // Submit Global Break
  const handleSaveGlobalBreak = async (e) => {
    e.preventDefault();
    if (!breakFormData.startTime) return;

    setIsSaving(true);
    try {
      const breakId = `BRK-${selectedPlanDate}-${Date.now().toString().slice(-4)}`;
      const dur = breakFormData.endTime ? calculateDuration(breakFormData.startTime, breakFormData.endTime) : 0;

      await setDoc(doc(db, 'production_breaks', breakId), {
        id: breakId,
        date: selectedPlanDate,
        startTime: breakFormData.startTime,
        endTime: breakFormData.endTime || '',
        durationMins: dur,
        notes: breakFormData.notes.trim() || (isAr ? 'استراحة عامة للوردية' : 'Shift Break'),
        status: breakFormData.endTime ? 'completed' : 'active',
        loggedBy: currentUserName,
        createdAt: serverTimestamp(),
      });

      setShowBreakModal(false);
      setBreakFormData({ startTime: '', endTime: '', notes: '' });
    } catch (err) {
      console.error('Error logging break:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered & Sequence-Sorted Orders for Plan View
  const filteredPlanOrders = useMemo(() => {
    const list = workOrders.filter((order) => {
      const matchDate = !selectedPlanDate || order.planDate === selectedPlanDate;
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        order.orderNumber?.toLowerCase().includes(q) ||
        order.productNameAr?.includes(q) ||
        order.productNameEn?.toLowerCase().includes(q) ||
        order.finishedProductId?.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchLine = lineFilter === 'all' || order.productionLine === lineFilter;
      const matchPriority = priorityFilter === 'all' || order.priority === priorityFilter;

      return matchDate && matchSearch && matchStatus && matchLine && matchPriority;
    });

    list.sort((a, b) => {
      const rankA = Number(a.importanceRank) || 0;
      const rankB = Number(b.importanceRank) || 0;
      if (rankA !== rankB) return rankA - rankB;
      return (a.orderNumber || '').localeCompare(b.orderNumber || '');
    });

    return list;
  }, [workOrders, selectedPlanDate, searchTerm, statusFilter, lineFilter, priorityFilter]);

  // Subtab 2 Specific Hierarchy: Running ('in_progress') first -> Ready / Paused -> Completed last (each tier ordered by plan sequence)
  const sortedSubtab2Orders = useMemo(() => {
    return [...filteredPlanOrders].sort((a, b) => {
      const getStatusTier = (ord) => {
        if (ord.status === 'in_progress') return 0;
        if (ord.status === 'completed') return 2;
        return 1;
      };
      const tierA = getStatusTier(a);
      const tierB = getStatusTier(b);
      if (tierA !== tierB) return tierA - tierB;

      const rankA = Number(a.importanceRank) || 9999;
      const rankB = Number(b.importanceRank) || 9999;
      if (rankA !== rankB) return rankA - rankB;

      return (a.orderNumber || '').localeCompare(b.orderNumber || '');
    });
  }, [filteredPlanOrders]);

  // Today Pallet Checkpoints for the Live Timeline
  const todayPalletCheckpoints = useMemo(() => {
    const pins = [];
    filteredPlanOrders.forEach((order) => {
      (order.pallets || []).forEach((pallet, pIdx) => {
        if (pallet.endTime) {
          pins.push({
            pallet,
            order,
            pIdx,
            wrappingMachine: pallet.wrappingMachine || 'wrapping_1',
            palletNumber: pallet.palletNumber || pIdx + 1,
            time: pallet.endTime,
            timeMins: timeToMins(pallet.endTime),
            qtyLarge: pallet.qtyLarge,
            productNameAr: order.productNameAr,
          });
        }
      });
    });
    return pins.sort((a, b) => a.timeMins - b.timeMins);
  }, [filteredPlanOrders]);

  return (
    <div className="space-y-5 select-none">
      {isSaving && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري تحديث الخطة وتشغيل البالتات...' : 'Updating Plan & Pallet Passports...'}
        />
      )}

      {/* Top 3-Sub-Tab Navigation Bar (Wider, Centered, High-Contrast) */}
      <div className="w-full max-w-4xl mx-auto my-1">
        <div className="bg-slate-200/90 p-1.5 rounded-2xl border border-slate-300 shadow-inner flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('plan')}
            className={`flex-1 min-h-[46px] px-4 py-2.5 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 select-none ${
              activeSubTab === 'plan'
                ? 'bg-indigo-600 text-white font-black shadow-md ring-2 ring-indigo-300 scale-[1.01]'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-900 font-extrabold shadow-2xs'
            }`}
          >
            <Calendar className={`h-4 w-4 ${activeSubTab === 'plan' ? 'text-white' : 'text-blue-600'}`} />
            <span className="text-xs sm:text-sm">{isAr ? '١- خطة الإنتاج (Plan)' : '1. Production Plan'}</span>
            {filteredPlanOrders.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-black ${
                activeSubTab === 'plan' ? 'bg-white/20 text-white border border-white/30' : 'bg-blue-100 text-blue-900'
              }`}>
                {filteredPlanOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('today_prod')}
            className={`flex-1 min-h-[46px] px-4 py-2.5 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 select-none ${
              activeSubTab === 'today_prod'
                ? 'bg-indigo-600 text-white font-black shadow-md ring-2 ring-indigo-300 scale-[1.01]'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-900 font-extrabold shadow-2xs'
            }`}
          >
            <Boxes className={`h-4 w-4 ${activeSubTab === 'today_prod' ? 'text-white' : 'text-indigo-600'}`} />
            <span className="text-xs sm:text-sm">{isAr ? '٢- تشغيل اليوم والبالتات' : '2. Floor Pallets & Execution'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('live_tracking')}
            className={`flex-1 min-h-[46px] px-4 py-2.5 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 select-none ${
              activeSubTab === 'live_tracking'
                ? 'bg-indigo-600 text-white font-black shadow-md ring-2 ring-indigo-300 scale-[1.01]'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-900 font-extrabold shadow-2xs'
            }`}
          >
            <PackageCheck className={`h-4 w-4 ${activeSubTab === 'live_tracking' ? 'text-white' : 'text-emerald-600'}`} />
            <span className="text-xs sm:text-sm">{isAr ? '٣- منقولات وعهدة الصالة' : '3. Floor Staged Inventory'}</span>
            {(activeStagedFloorPallets.length > 0 || activeStagedFloorMaterials.length > 0) && (
              <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-black ${
                activeSubTab === 'live_tracking' ? 'bg-white/20 text-white border border-white/30' : 'bg-emerald-100 text-emerald-900'
              }`}>
                {activeStagedFloorPallets.length + activeStagedFloorMaterials.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Global Date & Plan Boundaries Bar */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="font-bold text-slate-700">{isAr ? 'تاريخ الوردية المستهدفة:' : 'Target Shift Date:'}</span>
          <input
            type="date"
            value={selectedPlanDate}
            onChange={(e) => setSelectedPlanDate(e.target.value)}
            className="p-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => setSelectedPlanDate(new Date().toISOString().split('T')[0])}
            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition shadow-2xs"
          >
            {isAr ? 'اليوم' : 'Today'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Conditional Button: Pending Production Floor Receipts (Handshake) */}
          {pendingAcceptanceReturns.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFloorReceiptsModal(true)}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer animate-pulse"
              title={isAr ? 'يوجد إشعارات مرتجع بانتظار تأكيد استلامها بصالة الإنتاج' : 'Pending floor receipt handshakes'}
            >
              <PackageCheck className="h-4 w-4" />
              <span>{isAr ? 'استلام مرتجعات بالصالة' : 'Receive Returns'}</span>
              <span className="px-1.5 py-0.2 bg-white text-amber-950 rounded-full font-mono text-[10px] font-black shadow-2xs">
                {pendingAcceptanceReturns.length}
              </span>
            </button>
          )}

          {/* Unified Rework Button: "تصليحات مطلوبة" with 3-Color Dynamic Flying Badge */}
          <button
            type="button"
            onClick={() => setShowFixesModal(true)}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-2 cursor-pointer"
            title={isAr ? 'عرض الأصناف المعيبة المستلمة بالصالة والمطلوب تصليحها' : 'Defective products awaiting rework'}
          >
            <Wrench className="h-4 w-4 text-amber-600" />
            <span>{isAr ? 'تصليحات مطلوبة' : 'Fixes Required'}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono shadow-xs ${reworkBadgeColorClass}`}>
              {uniqueProductsAwaitingFixCount}
            </span>
          </button>

          {canCreate && activeSubTab === 'plan' && (
            isOrderLocked(selectedPlanDate) ? (
              <div
                className="px-3.5 py-1.5 bg-slate-100 border border-slate-300 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs select-none"
                title={isAr ? 'خطة تاريخ سابق ومؤرشفة ضد الإضافة (محصورة بالمسؤول العام)' : 'Past plan (Locked - Read Only)'}
              >
                <Lock className="h-3.5 w-3.5 text-slate-500" />
                <span>{isAr ? 'خطة سابقة مؤرشفة (للقراءة فقط)' : 'Past Plan (Locked)'}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleOpenCreatePlan}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{isAr ? 'إدراج صنف جديد بالخطة' : 'Assign SKU to Plan'}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: PRODUCTION PLAN MANAGER (خطة الإنتاج وفحص الخامات)             */}
      {/* ========================================================================= */}
      {activeSubTab === 'plan' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Collapsible Materials Stock Balance Overview Bar (Hidden if 0 SKUs in Plan) */}
          {dailyPlanMaterialsOverview.list.length > 0 && (
            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3 transition-all">
              {/* Collapsed Header Bar */}
              <div
                onClick={() => setIsOverviewBarExpanded(!isOverviewBarExpanded)}
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-blue-700 rounded-xl">
                    <Boxes className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                      <span>{isAr ? 'نظرة عامة على أرصدة خامات الخطة (Materials Stock Overview):' : 'Plan Materials Stock Overview:'}</span>
                      <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-2 py-0.2 rounded-full border border-blue-200">
                        {dailyPlanMaterialsOverview.list.length} {isAr ? 'خامات مطلوبة' : 'Materials'}
                      </span>
                    </h4>
                  </div>
                </div>

                {/* Status KPI Tags, Transfer Trigger Button & Expansion Chevron */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    {dailyPlanMaterialsOverview.totalReady > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                        {dailyPlanMaterialsOverview.totalReady} {isAr ? 'جاهز بالصالة' : 'Ready'}
                      </span>
                    )}
                    {dailyPlanMaterialsOverview.totalTransfer > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300">
                        {dailyPlanMaterialsOverview.totalTransfer} {isAr ? 'يتطلب تحويل' : 'Transfer Needed'}
                      </span>
                    )}
                    {dailyPlanMaterialsOverview.totalShortage > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-900 border border-rose-300 animate-pulse">
                        {dailyPlanMaterialsOverview.totalShortage} {isAr ? 'عجز كلي' : 'Shortage'}
                      </span>
                    )}
                    {dailyPlanMaterialsOverview.totalPipeSupply > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-300 flex items-center gap-1 font-bold">
                        <span>💧</span>
                        <span>{dailyPlanMaterialsOverview.totalPipeSupply} {isAr ? 'إمداد مستمر (M)' : 'Pipe Feed (M)'}</span>
                      </span>
                    )}
                  </div>

                  {/* Pre-Filled Floor Transfer Trigger Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFloorTransferModal();
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition"
                    title={isAr ? 'إنشاء إذن تحويل مخزني لصالة الإنتاج بالخامات الناقصة' : 'Generate Floor Transfer Voucher'}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إذن تحويل للصالة (TRN)' : 'Floor Transfer (TRN)'}</span>
                  </button>

                  <div className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg">
                    {isOverviewBarExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} />}
                  </div>
                </div>
              </div>

              {/* Expanded Compact Component Cards Grid */}
              {isOverviewBarExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100 animate-in fade-in duration-150">
                  {dailyPlanMaterialsOverview.list.map((mat) => {
                    const isM = Boolean(mat.isMFlagged);
                    const isFloorReady = mat.status === 'floor_ready';
                    const isTransfer = mat.status === 'transfer_needed';
                    const isShortage = mat.status === 'shortage';

                    const cardStyle = isM
                      ? 'bg-cyan-50/40 border-cyan-300/80 text-cyan-950'
                      : isFloorReady
                      ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                      : isTransfer
                      ? 'bg-amber-50/60 border-amber-300 text-amber-950'
                      : 'bg-rose-50/60 border-rose-300 text-rose-950';

                    return (
                      <div
                        key={mat.key || mat.itemId}
                        className={`p-3 rounded-2xl border-2 space-y-2 shadow-2xs transition hover:shadow-sm ${cardStyle}`}
                      >
                        {/* Material SKU & Item Code */}
                        <div className="flex items-start justify-between gap-1 border-b border-black/5 pb-1.5">
                          <div className="truncate">
                            <span className="font-extrabold text-xs block truncate" title={mat.materialNameAr}>
                              {mat.materialNameAr}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500 font-bold">
                              [{mat.itemId}]
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold shrink-0 ${
                            isM
                              ? 'bg-cyan-100 text-cyan-900 border border-cyan-200'
                              : isFloorReady
                              ? 'bg-emerald-100 text-emerald-800'
                              : isTransfer
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900 animate-pulse'
                          }`}>
                            {isM
                              ? (isAr ? '💧 ضخ مستمر' : '💧 Pipe Feed')
                              : isFloorReady
                              ? (isAr ? 'جاهز' : 'Ready')
                              : isTransfer
                              ? (isAr ? 'تحويل' : 'Transfer')
                              : (isAr ? 'عجز' : 'Deficit')}
                          </span>
                        </div>

                        {/* Variant & LOT Attribution Badges */}
                        <div className="flex flex-wrap items-center gap-1">
                          {mat.variantSuffix ? (
                            <VariantIdentifierChip
                              variant={mat.variantObj}
                              fallbackText={mat.variantSuffix}
                              size="sm"
                              className="max-w-[140px] truncate"
                            />
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-medium text-[9px]">
                              {isAr ? 'خامة عامة' : 'Generic'}
                            </span>
                          )}

                          {mat.lotNumber && mat.lotNumber !== 'FIFO' ? (
                            <span
                              className="px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 font-mono font-extrabold text-[9px]"
                              title={isAr ? `لوط التوريد المحدد: ${mat.lotNumber}` : `LOT: ${mat.lotNumber}`}
                            >
                              📦 {mat.lotNumber}
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-bold text-[9px]"
                              title={isAr ? 'سحب اللوط الأقدم تلقائياً (FIFO)' : 'Auto Oldest (FIFO)'}
                            >
                              ⭐ FIFO
                            </span>
                          )}

                          <span className="text-[9px] font-mono text-slate-400 ms-auto font-medium" title={mat.orderRefsList.join(', ')}>
                            {mat.orderRefsList.length} {isAr ? 'أوامر' : 'MOs'}
                          </span>
                        </div>

                        {/* Primary Metric: Needed in Large Unit Packs */}
                        <div className="p-2 bg-white/90 rounded-xl border border-black/5 space-y-0.5">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-bold text-slate-500">{isAr ? 'المطلوب للخطة:' : 'Required:'}</span>
                            <span className="font-mono font-extrabold text-sm text-blue-900">
                              {mat.totalRequiredLarge} {mat.largeUnitName}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono text-end">
                            {mat.totalRequiredSmall.toLocaleString()} {mat.smallUnit} • ({isAr ? `شدة: ${mat.packagingRatio}` : `Pack: ${mat.packagingRatio}`})
                          </div>
                        </div>

                        {/* Floor vs Company Balances & Deficit */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono pt-0.5">
                          <div
                            className="bg-slate-50/80 p-1.5 rounded-lg border border-black/5"
                            title={isAr ? `الرصيد بالصالة: ${mat.floorStockSmall.toLocaleString()} ${mat.smallUnit}` : `Floor: ${mat.floorStockSmall.toLocaleString()}`}
                          >
                            <span className="text-[9px] font-bold text-slate-400 block">{isAr ? 'بالصالة' : 'Floor'}</span>
                            <span className="font-bold text-slate-800">{mat.floorStockLarge} {mat.largeUnitName}</span>
                          </div>

                          <div
                            className="bg-slate-50/80 p-1.5 rounded-lg border border-black/5"
                            title={isAr ? `إجمالي الشركة: ${mat.totalCompanyStockSmall.toLocaleString()} ${mat.smallUnit}` : `Total: ${mat.totalCompanyStockSmall.toLocaleString()}`}
                          >
                            <span className="text-[9px] font-bold text-slate-400 block">{isAr ? 'كلياً بالمخازن' : 'Total'}</span>
                            <span className="font-bold text-slate-800">{mat.totalCompanyStockLarge} {mat.largeUnitName}</span>
                          </div>

                          {isM ? (
                            <div className="col-span-2 pt-1 border-t border-cyan-200/60 flex items-center justify-between text-[10px]">
                              <span className="font-bold text-cyan-900 flex items-center gap-1">
                                <span>💧</span>
                                <span>{isAr ? 'تغذية أنابيب (Flag M)' : 'Continuous Pipe Feed'}</span>
                              </span>
                              <span className="font-mono font-bold text-cyan-800">
                                {mat.deficitSmall > 0 ? (
                                  <span>{isAr ? `تغذية جارية: ${mat.totalRequiredLarge} ${mat.largeUnitName}` : `Feeding: ${mat.totalRequiredLarge}`}</span>
                                ) : (
                                  <span>{isAr ? 'التانكات مغطية' : 'Tanks Covered'}</span>
                                )}
                              </span>
                            </div>
                          ) : mat.deficitSmall > 0 ? (
                            <div className="col-span-2 pt-1 border-t border-black/5 flex items-center justify-between text-[10px]">
                              <span className="font-bold text-rose-800">{isAr ? 'عجز الصالة:' : 'Floor Deficit:'}</span>
                              <span className="font-mono font-black text-rose-700">
                                -{mat.deficitLarge} {mat.largeUnitName}
                                <span className="text-[9px] font-bold text-slate-500 ms-1">
                                  ({isAr ? `الأقرب: ${mat.deficitLargeCeiled}` : `Ceil: ${mat.deficitLargeCeiled}`})
                                </span>
                              </span>
                            </div>
                          ) : (
                            <div className="col-span-2 pt-1 border-t border-black/5 flex items-center justify-between text-[10px] font-bold text-emerald-800">
                              <span>{isAr ? 'جاهز بالصالة' : 'Floor Ready'}</span>
                              <span className="font-mono">✓ +{mat.diffFloorLarge} {mat.largeUnitName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Desktop Table View (hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[360px]">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3 text-center w-10">#</th>
                  <th className="p-3 text-start">{isAr ? 'أمر التشغيل' : 'Order #'}</th>
                  <th className="p-3 text-start">{isAr ? 'المنتج وخيار التعبئة' : 'Finished Good & Option'}</th>
                  <th className="p-3 text-start">{isAr ? 'الخط والأولوية' : 'Line & Priority'}</th>
                  <th className="p-3 text-center">{isAr ? 'المخطط بالكرتونة' : 'Cartons Target'}</th>
                  <th className="p-3 text-center">{isAr ? 'المخطط بالعبوات' : 'Units Target'}</th>
                  <th className="p-3 text-center">{isAr ? 'جاهزية الخامات (BOM Feasibility)' : 'BOM Feasibility'}</th>
                  <th className="p-3 text-start">{isAr ? 'حالة الخطة' : 'Status'}</th>
                  <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredPlanOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      {isAr ? 'لا توجد أصناف مدرجة في خطة الإنتاج لهذا التاريخ.' : 'No orders in production plan for this date.'}
                    </td>
                  </tr>
                ) : (
                  filteredPlanOrders.map((order, idx) => {
                    const feasibility = sequentialPlanFeasibilityMap[order.id] || evaluateBomFeasibility(order.bomRecipeId, order.plannedQtyLarge, order.componentSelections);

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/70 transition">
                        {/* Column 0: Suggested Execution Sequence with Concurrency Warning Highlighting */}
                        <td className="p-3 text-center align-top">
                          {(() => {
                            const currentSeq = Number(order.importanceRank) || 1;
                            const isDuplicate = (sequenceCountsOnSelectedDate[currentSeq] || 0) > 1;

                            return (
                              <div className="flex flex-col items-center justify-center gap-1">
                                <div
                                  className={`px-2 py-0.5 rounded-lg font-mono font-extrabold text-xs flex items-center justify-center gap-1 border shadow-2xs transition ${
                                    isDuplicate
                                      ? 'bg-amber-100 text-amber-950 border-amber-300 ring-2 ring-amber-200'
                                      : 'bg-slate-100 text-slate-800 border-slate-200'
                                  }`}
                                  title={isDuplicate ? (isAr ? `تنبيه: يوجد (${sequenceCountsOnSelectedDate[currentSeq]}) أوامر تشغيل بنفس الترتيب (#${currentSeq}) لهذا اليوم` : `Concurrency: ${sequenceCountsOnSelectedDate[currentSeq]} orders share #${currentSeq}`) : undefined}
                                >
                                  <span>#{currentSeq}</span>
                                </div>

                                {canEdit && (
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickStepSequence(order, -1);
                                      }}
                                      disabled={currentSeq <= 1}
                                      className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-20 cursor-pointer"
                                      title={isAr ? 'تقديم الترتيب' : 'Move Up'}
                                    >
                                      <ChevronDown className="h-3 w-3 rotate-180" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickStepSequence(order, 1);
                                      }}
                                      className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                                      title={isAr ? 'تأخير الترتيب' : 'Move Down'}
                                    >
                                      <ChevronDown className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Column 1: Prominent Date + Subdued Record ID with Copy Icon */}
                        <td className="p-3 align-top">
                          <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                            <span>{order.planDate}</span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-[10px] text-slate-400 font-medium">
                              {order.orderNumber}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(order.orderNumber);
                                setCopiedId(order.orderNumber);
                                setTimeout(() => setCopiedId(null), 1800);
                              }}
                              className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition cursor-pointer"
                              title={isAr ? 'نسخ رقم الأمر' : 'Copy Order ID'}
                            >
                              {copiedId === order.orderNumber ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            {copiedId === order.orderNumber && (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 animate-in fade-in">
                                {isAr ? 'تم النسخ' : 'Copied'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Column 2: Product, Packaging Option & Prominent Comments/Notes Tooltip */}
                        <td className="p-3 align-top">
                          {(() => {
                            const prod = finishedProducts.find((p) => p.code === order.finishedProductId);
                            const opt = (prod?.packagingOptions || []).find((o) => o.suffix === order.packagingOptionSuffix);
                            const resolvedImg = opt?.imageFile || prod?.imageFile || '';

                            return (
                              <div className="flex items-start gap-2.5">
                                {resolvedImg ? (
                                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/90 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden group/img mt-0.5">
                                    <img
                                      src={resolvedImg}
                                      alt={order.productNameAr}
                                      onClick={() => setImagePreviewModal({
                                        url: resolvedImg,
                                        title: `${order.productNameAr} - ${order.packagingOptionNameAr || ''}`,
                                        subtitle: `${order.finishedProductId} • ${order.packagingOptionCode || ''}`
                                      })}
                                      className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                      title={isAr ? 'انقر لعرض الصورة بالحجم الكامل' : 'Click to preview image'}
                                    />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs mt-0.5">
                                    <Package className="h-5 w-5" />
                                  </div>
                                )}

                                <div className="space-y-1">
                                  <div>
                                    <div className="font-bold text-slate-900 leading-snug">{order.productNameAr}</div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        [{order.finishedProductId}] • {order.packagingOptionNameAr}
                                      </span>
                                      {(order.processNameAr || order.processCode) && (
                                        <span
                                          className="px-1.5 py-0.2 bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold rounded text-[9px] flex items-center gap-0.5"
                                          title={order.processCode ? `[${order.processCode}]` : ''}
                                        >
                                          <Workflow className="h-2.5 w-2.5 text-cyan-600" />
                                          <span>{order.processNameAr || order.processNameEn || order.processCode}</span>
                                        </span>
                                      )}
                                    </div>
                                    {order.isRework && (
                                      <div className="flex flex-wrap items-center gap-1 mt-1">
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                          <Wrench className="h-2.5 w-2.5 text-amber-700" />
                                          <span>{isAr ? 'أمر تصليح' : 'Rework'}</span>
                                        </span>
                                      </div>
                                    )}
                                    {order.isComplementary && (
                                      <div className="flex flex-wrap items-center gap-1 mt-1">
                                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-50 text-purple-900 border border-purple-200">
                                          {isAr ? `تشغيلة مكملة (${order.parentOrderId || 'أصل'})` : `Complementary (${order.parentOrderId || 'Parent'})`}
                                        </span>
                                        {order.lotAutoBound ? (
                                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                            {isAr ? `تم ربط اللوط (${order.autoBoundLotNo})` : `Bound LOT (${order.autoBoundLotNo})`}
                                          </span>
                                        ) : order.awaitingReplenishment ? (
                                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                            {isAr ? 'في انتظار توريد خامات (GRN)' : 'Awaiting Replenishment'}
                                          </span>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>

                                  {/* Prominent Notes / Comments Icon with Modern Interactive Tooltip */}
                                  {order.notes && (
                                    <div className="relative inline-block">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveNotePopoverId(activeNotePopoverId === order.id ? null : order.id);
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs hover:bg-amber-100 transition cursor-pointer"
                                        title={isAr ? 'انقر لعرض ملاحظات التشغيل' : 'Click to view order notes'}
                                      >
                                        <MessageSquareText className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                        <span>{isAr ? 'ملاحظة' : 'Note'}</span>
                                      </button>

                                      {/* Modern Interactive Tooltip Popover */}
                                      {activeNotePopoverId === order.id && (
                                        <div
                                          className="absolute start-0 top-full mt-1.5 z-50 w-72 bg-slate-900 text-white rounded-2xl p-3 shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-150 text-xs select-text"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-1.5">
                                            <span className="font-extrabold text-amber-400 text-[11px] flex items-center gap-1">
                                              <MessageSquareText className="h-3.5 w-3.5" />
                                              <span>{isAr ? 'ملاحظات وتوجيهات التشغيل' : 'Production Notes'}</span>
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setActiveNotePopoverId(null)}
                                              className="p-0.5 text-slate-400 hover:text-white rounded transition cursor-pointer"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                          <p className="text-[11px] text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
                                            {order.notes}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3 align-top">
                          {(() => {
                            switch (order.priority) {
                              case 'urgent':
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-[10px] font-bold">
                                    <Flame className="h-3 w-3 text-rose-600" />
                                    <span>{isAr ? 'مستعجل' : 'Urgent'}</span>
                                  </span>
                                );
                              case 'important':
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-[10px] font-bold">
                                    <Star className="h-3 w-3 text-amber-600" />
                                    <span>{isAr ? 'مهم' : 'Important'}</span>
                                  </span>
                                );
                              case 'prep_and_run':
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-lg text-[10px] font-bold">
                                    <Wrench className="h-3 w-3 text-indigo-600" />
                                    <span>{isAr ? 'تجهيز وتشغيل' : 'Prep & Run'}</span>
                                  </span>
                                );
                              case 'prep_only':
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 rounded-lg text-[10px] font-bold">
                                    <Boxes className="h-3 w-3 text-purple-600" />
                                    <span>{isAr ? 'تجهيز فقط' : 'Prep Only'}</span>
                                  </span>
                                );
                              case 'today':
                              default:
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-[10px] font-bold">
                                    <Clock className="h-3 w-3 text-blue-600" />
                                    <span>{isAr ? 'خلال اليوم' : 'Today'}</span>
                                  </span>
                                );
                            }
                          })()}
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-mono font-bold text-slate-900">
                            {order.plannedQtyLarge} {order.outputLargeUnit}
                          </div>
                          {order.isRework && (() => {
                            const orig = getOriginalReturnQty(order);
                            if (!orig) return null;
                            return (
                              <div className="text-[10px] font-mono text-purple-800 font-bold bg-purple-50 rounded px-1 mt-0.5 inline-block border border-purple-200" title={isAr ? 'الكمية المرتجعة المستلمة بالأصل' : 'Originally Returned'}>
                                {isAr ? 'أصل:' : 'Orig:'} {orig.qtyLarge} {orig.largeUnit}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-mono font-bold text-blue-700">
                            {Number(order.plannedQtySmall).toLocaleString()} {order.outputSmallUnit}
                          </div>
                          {order.isRework && (() => {
                            const orig = getOriginalReturnQty(order);
                            if (!orig) return null;
                            return (
                              <div className="text-[10px] font-mono text-purple-800 font-bold bg-purple-50 rounded px-1 mt-0.5 inline-block border border-purple-200" title={isAr ? 'الكمية المرتجعة المستلمة بالأصل' : 'Originally Returned'}>
                                {isAr ? 'أصل:' : 'Orig:'} {orig.qtySmall} {orig.smallUnit}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setFeasibilityModalData({ order, feasibility })}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all shadow-2xs hover:scale-105 cursor-pointer ${
                              feasibility.status === 'floor_ready'
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : feasibility.status === 'transfer_needed'
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                                : feasibility.status === 'shortage'
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300'
                            }`}
                            title={isAr ? 'انقر لعرض بيان وتفاصيل توفر الخامات (BOM Audit)' : 'Click to inspect raw material availability'}
                          >
                            <CircleDot className={`h-3 w-3 ${
                              feasibility.status === 'floor_ready' ? 'text-emerald-600' :
                              feasibility.status === 'transfer_needed' ? 'text-amber-600' :
                              feasibility.status === 'shortage' ? 'text-rose-600' : 'text-slate-400'
                            }`} />
                            <span>{feasibility.labelAr}</span>
                            <Eye className="h-3 w-3 opacity-60 ms-0.5" />
                          </button>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                            {order.status === 'scheduled' ? (isAr ? 'مجدول' : 'Scheduled') :
                             order.status === 'in_progress' ? (isAr ? 'قيد التشغيل' : 'In Progress') :
                             order.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : order.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isOrderLocked(order) ? (
                              <span className="p-1 text-slate-400" title={isAr ? 'أمر سابق مؤرشف (للقراءة فقط)' : 'Past order (Locked)'}>
                                <Lock className="h-3.5 w-3.5 text-slate-400" />
                              </span>
                            ) : (
                              <>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditPlan(order)}
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                    title={isAr ? 'تعديل الخطة' : 'Edit Plan'}
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleClonePlan(order)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                  title={isAr ? 'نسخ للصنف' : 'Duplicate Order'}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAuditOrderData(order)}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                                  title={isAr ? 'سجل المراجعة' : 'Audit Trail'}
                                >
                                  <History className="h-3.5 w-3.5" />
                                </button>
                                {canCancel && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePlanOrder(order.id, order.orderNumber)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                    title={isAr ? 'حذف من الخطة' : 'Delete Order'}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                            {isGeneralAdmin && isOrderPastDate(order) && (
                              <span className="px-1 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded text-[9px] font-bold" title={isAr ? 'صلاحية المسؤول العام' : 'General Admin'}>
                                <Unlock className="h-2.5 w-2.5 text-amber-700" />
                              </span>
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

          {/* Mobile Screen Adaptation: Touch-Optimized Production Cards (md:hidden) */}
          <div className="md:hidden space-y-3.5">
            {filteredPlanOrders.length === 0 ? (
              <div className="p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                {isAr ? 'لا توجد أصناف مدرجة في خطة الإنتاج لهذا التاريخ.' : 'No orders in production plan for this date.'}
              </div>
            ) : (
              filteredPlanOrders.map((order, idx) => {
                const feasibility = sequentialPlanFeasibilityMap[order.id] || evaluateBomFeasibility(order.bomRecipeId, order.plannedQtyLarge, order.componentSelections);
                const currentSeq = Number(order.importanceRank) || 1;
                const isDuplicate = (sequenceCountsOnSelectedDate[currentSeq] || 0) > 1;
                const prod = finishedProducts.find((p) => p.code === order.finishedProductId);
                const opt = (prod?.packagingOptions || []).find((o) => o.suffix === order.packagingOptionSuffix);
                const resolvedImg = opt?.imageFile || prod?.imageFile || '';

                return (
                  <div
                    key={order.id}
                    className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3 relative"
                  >
                    {/* Top Status & Sequence Bar */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      {/* Sequence Badge with Quick Stepper */}
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`px-2.5 py-1 rounded-xl font-mono font-extrabold text-xs flex items-center justify-center gap-1 border shadow-2xs ${
                            isDuplicate
                              ? 'bg-amber-100 text-amber-950 border-amber-300 ring-1 ring-amber-200'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          <span>#{currentSeq}</span>
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleQuickStepSequence(order, -1)}
                              disabled={currentSeq <= 1}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-20 cursor-pointer"
                              title={isAr ? 'تقديم الترتيب' : 'Move Up'}
                            >
                              <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickStepSequence(order, 1)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                              title={isAr ? 'تأخير الترتيب' : 'Move Down'}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Priority & Status Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {order.priority === 'urgent' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-[10px] font-bold">
                            <Flame className="h-3 w-3 text-rose-600" />
                            <span>{isAr ? 'مستعجل' : 'Urgent'}</span>
                          </span>
                        )}
                        {order.priority === 'important' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-[10px] font-bold">
                            <Star className="h-3 w-3 text-amber-600" />
                            <span>{isAr ? 'مهم' : 'Important'}</span>
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {order.status === 'scheduled' ? (isAr ? 'مجدول' : 'Scheduled') :
                           order.status === 'in_progress' ? (isAr ? 'قيد التشغيل' : 'In Progress') :
                           order.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : order.status}
                        </span>
                      </div>
                    </div>

                    {/* Primary Product Identity Anchor (Name is Primary) */}
                    <div className="flex items-start gap-3">
                      {resolvedImg ? (
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs flex items-center justify-center p-1 shrink-0 overflow-hidden mt-0.5">
                          <img
                            src={resolvedImg}
                            alt={order.productNameAr}
                            onClick={() => setImagePreviewModal({
                              url: resolvedImg,
                              title: `${order.productNameAr} - ${order.packagingOptionNameAr || ''}`,
                              subtitle: `${order.finishedProductId} • ${order.packagingOptionCode || ''}`
                            })}
                            className="w-full h-full object-contain cursor-pointer"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs mt-0.5">
                          <Package className="h-6 w-6" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        {/* Primary: Name of Product */}
                        <h4 className="font-extrabold text-slate-900 text-base leading-snug">
                          {order.productNameAr}
                        </h4>

                        {/* Secondary: SKU Code, Packaging Option, Order Number, Process */}
                        <div className="text-xs text-slate-500 font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-600 font-semibold">{order.packagingOptionNameAr}</span>
                          <span>•</span>
                          <span className="text-slate-400">[{order.finishedProductId}]</span>
                          <span>•</span>
                          <span className="text-blue-700 font-bold">أمر #{order.orderNumber}</span>
                          {(order.processNameAr || order.processCode) && (
                            <>
                              <span>•</span>
                              <span
                                className="px-2 py-0.5 bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold rounded-md text-[10px] flex items-center gap-1 shadow-2xs"
                                title={order.processCode ? `[${order.processCode}]` : ''}
                              >
                                <Workflow className="h-3 w-3 text-cyan-600" />
                                <span>{order.processNameAr || order.processNameEn || order.processCode}</span>
                              </span>
                            </>
                          )}
                        </div>

                        {/* Production Line Badge */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                            <Factory className="h-3 w-3 text-indigo-600" />
                            <span>{order.productionLine}</span>
                          </span>

                          {order.notes && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                              <MessageSquareText className="h-3 w-3 text-amber-600" />
                              <span>{order.notes}</span>
                            </span>
                          )}
                        </div>

                        {order.isComplementary && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-50 text-purple-900 border border-purple-200">
                              {isAr ? `تشغيلة مكملة (${order.parentOrderId || 'أصل'})` : `Complementary (${order.parentOrderId || 'Parent'})`}
                            </span>
                            {order.lotAutoBound ? (
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {isAr ? `تم ربط اللوط (${order.autoBoundLotNo})` : `Bound LOT (${order.autoBoundLotNo})`}
                              </span>
                            ) : order.awaitingReplenishment ? (
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                {isAr ? 'في انتظار توريد خامات (GRN)' : 'Awaiting Replenishment'}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Target Quantities Metric Block */}
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'المخطط بالكرتونة:' : 'Cartons Target:'}</span>
                          <span className="font-mono font-extrabold text-sm text-slate-900">
                            {order.plannedQtyLarge} {order.outputLargeUnit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'المخطط بالعبوات:' : 'Units Target:'}</span>
                          <span className="font-mono font-extrabold text-sm text-blue-700">
                            {Number(order.plannedQtySmall).toLocaleString()} {order.outputSmallUnit}
                          </span>
                        </div>
                      </div>

                      {order.isRework && (() => {
                        const orig = getOriginalReturnQty(order);
                        if (!orig) return null;
                        return (
                          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-1 text-[11px] bg-purple-50/70 p-2 rounded-lg border border-purple-200">
                            <span className="text-purple-900 font-bold flex items-center gap-1">
                              <Wrench className="h-3 w-3 text-purple-700" />
                              <span>{isAr ? 'المرتجع المستلم بالأصل:' : 'Orig Return:'}</span>
                            </span>
                            <span className="font-mono font-black text-purple-950">
                              {orig.qtyLarge} {orig.largeUnit} ({orig.qtySmall} {orig.smallUnit})
                            </span>
                            {orig.missingSmall > 0 && (
                              <span className="w-full text-end text-[10px] text-purple-700 font-bold font-mono">
                                +{orig.missingSmall} {isAr ? 'نواقص لإكمال الكرتونة الكسر' : 'top-up units'}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* BOM Raw Materials Feasibility Strip */}
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setFeasibilityModalData({ order, feasibility })}
                        className={`w-full min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer ${
                          feasibility.status === 'floor_ready'
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : feasibility.status === 'transfer_needed'
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300'
                            : feasibility.status === 'shortage'
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-950 border border-rose-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CircleDot className={`h-4 w-4 ${
                            feasibility.status === 'floor_ready' ? 'text-emerald-600' :
                            feasibility.status === 'transfer_needed' ? 'text-amber-600' :
                            feasibility.status === 'shortage' ? 'text-rose-600' : 'text-slate-400'
                          }`} />
                          <span>{feasibility.labelAr}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-normal text-slate-600">
                          <span>{isAr ? 'فحص الخامات' : 'Inspect'}</span>
                          <Eye className="h-3.5 w-3.5" />
                        </div>
                      </button>

                      {feasibility.status === 'transfer_needed' && (
                        <button
                          type="button"
                          onClick={() => handleOpenStagingRequest(order)}
                          className="w-full min-h-[38px] flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          <Boxes className="h-3.5 w-3.5" />
                          <span>{isAr ? 'طلب تحويل الخامات الناقصة لصالة الإنتاج' : 'Request Floor Transfer'}</span>
                        </button>
                      )}
                    </div>

                    {/* Touch-Friendly Actions Row */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('today_prod')}
                        className="flex-1 min-h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Boxes className="h-4 w-4" />
                        <span>{isAr ? 'تشغيل وتكويد بالتات' : 'Start Pallets'}</span>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {isOrderLocked(order) ? (
                          <div className="flex items-center gap-1 px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-slate-500 font-bold text-xs" title={isAr ? 'أمر سابق مؤرشف (للقراءة فقط)' : 'Past order (Locked)'}>
                            <Lock className="h-4 w-4 text-slate-400" />
                            <span>{isAr ? 'مؤرشف' : 'Locked'}</span>
                          </div>
                        ) : (
                          <>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditPlan(order)}
                                className="min-h-[42px] min-w-[42px] flex items-center justify-center text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-xl transition cursor-pointer"
                                title={isAr ? 'تعديل الخطة' : 'Edit Plan'}
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleClonePlan(order)}
                              className="min-h-[42px] min-w-[42px] flex items-center justify-center text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-xl transition cursor-pointer"
                              title={isAr ? 'نسخ أمر التشغيل' : 'Duplicate'}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            {canCancel && (
                              <button
                                type="button"
                                onClick={() => handleDeletePlanOrder(order.id, order.orderNumber)}
                                className="min-h-[42px] min-w-[42px] flex items-center justify-center text-slate-400 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                                title={isAr ? 'حذف من الخطة' : 'Delete'}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                        {isGeneralAdmin && isOrderPastDate(order) && (
                          <span className="px-1.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-[10px] font-bold" title={isAr ? 'صلاحية المسؤول العام' : 'General Admin'}>
                            <Unlock className="h-3 w-3 text-amber-700" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: TODAY'S PRODUCTION & PALLET PASSPORTS (تشغيل اليوم والبالتات)   */}
      {/* ========================================================================= */}
      {activeSubTab === 'today_prod' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Accumulated Floor Staged Materials Bar */}
          {activeStagedFloorMaterials.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-amber-950 flex items-center gap-2">
                    <span>{isAr ? 'خامات تالفة/مرتجعة بالصالة بانتظار الترحيل للمستودع:' : 'Staged Scrap & Returns on Floor:'}</span>
                    <span className="px-2 py-0.2 bg-amber-200 text-amber-900 rounded-full font-mono text-[10px] font-bold">
                      {activeStagedFloorMaterials.length} {isAr ? 'خامات متراكمة' : 'items'}
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    {isAr
                      ? 'تم وضع هذه الخامات جانباً أثناء التشغيل والتصليح ويمكن ترحيلها مجمعاً لمستودع الهوالك أو مرتجعات الموردين.'
                      : 'Accumulated materials staged on the floor ready for bulk transfer to destination warehouse.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowStagedScrapModal(true)}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Warehouse className="h-4 w-4" />
                <span>{isAr ? 'معاينة وترحيل الخامات للمستودع' : 'View & Transfer Staged Scrap'}</span>
              </button>
            </div>
          )}

          {/* Shift Break Shortcut Bar on Subtab 2 */}
          {activeShiftBreak ? (
            <div className="p-3.5 bg-linear-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-2 border-amber-400 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs animate-bounce">
                  <Coffee className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-sm text-amber-950">
                      {isAr ? 'استراحة وردية جارية الآن بالصالة' : 'Shift Break Currently Active'}
                    </span>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-900 border border-amber-300 rounded-full font-mono text-xs font-black">
                      {isAr ? `بدأت: ${activeShiftBreak.startTime}` : `Started: ${activeShiftBreak.startTime}`}
                    </span>
                    {activeShiftBreak.notes && (
                      <span className="text-xs text-amber-800 font-bold bg-white/60 px-2 py-0.5 rounded-lg border border-amber-200">
                        {activeShiftBreak.notes}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-amber-900 mt-0.5 font-medium">
                    {isAr
                      ? 'خطوط الإنتاج متوقفة مؤقتاً للاستراحة العامة، سيتم احتساب الدقائق كفترة راحة مستبعدة من وقت الإنتاج.'
                      : 'Lines are paused for shift break; minutes are deducted from productive runtime.'}
                  </div>
                </div>
              </div>

              {/* End Break Controls with Manual Time Input and Quick "Now" Button */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-amber-300 shadow-2xs">
                  <Clock className="h-4 w-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-bold text-slate-700 shrink-0">
                    {isAr ? 'وقت الانتهاء:' : 'End Time:'}
                  </span>
                  <input
                    type="time"
                    value={subtab2BreakTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)))}
                    onChange={(e) => setSubtab2BreakTime(e.target.value)}
                    className="w-24 px-1.5 py-0.5 text-xs font-mono font-black text-center border border-slate-200 rounded-lg bg-amber-50/50 text-slate-900 focus:bg-white focus:ring-1 focus:ring-amber-500"
                    title={isAr ? 'تحديد وقت انتهاء الراحة يدوياً' : 'Set break end time manually'}
                  />
                  <button
                    type="button"
                    onClick={() => setSubtab2BreakTime(minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))))}
                    className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[10px] font-black transition cursor-pointer"
                    title={isAr ? 'ضبط على الوقت الحالي الآن' : 'Set to current time'}
                  >
                    {isAr ? 'الآن' : 'Now'}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleEndActiveBreakFromSubtab2}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-extrabold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'إنهاء الاستراحة واستئناف العمل' : 'End Break & Resume'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-linear-to-r from-amber-50/60 via-white to-amber-50/40 border border-amber-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Coffee className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-slate-800 flex items-center gap-2">
                    <span>{isAr ? 'استراحة الوردية العامة:' : 'Shift Break:'}</span>
                    <span className="text-[11px] font-normal text-slate-500">
                      {isAr ? 'تسجيل توقف الصالة للغداء أو الصلاة' : 'Log lunch/prayer break for floor'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Start Break Controls with Manual Time Input, Quick "Now" Button, Notes, and Start Button */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-300 shadow-2xs">
                  <Clock className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-600 shrink-0">
                    {isAr ? 'وقت البدء:' : 'Start:'}
                  </span>
                  <input
                    type="time"
                    value={subtab2BreakTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)))}
                    onChange={(e) => setSubtab2BreakTime(e.target.value)}
                    className="w-20 px-1 py-0.5 text-xs font-mono font-black text-center border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:bg-white"
                    title={isAr ? 'تحديد وقت بدء الراحة يدوياً' : 'Set start time manually'}
                  />
                  <button
                    type="button"
                    onClick={() => setSubtab2BreakTime(minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))))}
                    className="px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[10px] font-black transition cursor-pointer"
                    title={isAr ? 'ضبط على الوقت الحالي الآن' : 'Set to current time'}
                  >
                    {isAr ? 'الآن' : 'Now'}
                  </button>
                </div>

                <input
                  type="text"
                  placeholder={isAr ? 'بيان الراحة (مثال: غداء / صلاة)...' : 'Break notes (e.g. lunch)...'}
                  value={subtab2BreakNotes}
                  onChange={(e) => setSubtab2BreakNotes(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 w-36 sm:w-48 placeholder:text-slate-400 focus:ring-1 focus:ring-amber-500"
                />

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleStartActiveBreakFromSubtab2}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={isAr ? 'بدء استراحة الوردية وتوثيق وقت البدء' : 'Start shift break'}
                >
                  <Coffee className="h-3.5 w-3.5" />
                  <span>{isAr ? 'بدء استراحة' : 'Start Break'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {sortedSubtab2Orders.map((order, orderIdx) => {
              const feasibility = sequentialPlanFeasibilityMap[order.id] || evaluateBomFeasibility(order.bomRecipeId, order.plannedQtyLarge, order.componentSelections);
              const pallets = order.pallets || [];
              const ratio = Number(order.packagingRatio) || 12;

              const prod = finishedProducts.find((p) => p.code === order.finishedProductId);
              const opt = prod?.packagingOptions?.find((o) => o.suffix === order.packagingOptionSuffix || o.code === order.packagingOptionCode);
              const cardImage = opt?.imageFile || prod?.imageFile || order.imageUrl;

              // Actual and planned quantities tracked in larger unit, rounded to 2 decimal places
              const actualProducedLarge = order.totalProducedQtyLarge != null
                ? Number(order.totalProducedQtyLarge)
                : (pallets.length > 0
                    ? pallets.reduce((sum, p) => sum + (Number(p.qtyLarge) || (Number(p.qtySmall || 0) / ratio) || 0), 0)
                    : (Number(order.totalProducedQtySmall || 0) / ratio));

              const plannedLarge = Number(order.plannedQtyLarge) || (Number(order.plannedQtySmall || 0) / ratio) || 0;
              const roundedActualLarge = Number(actualProducedLarge.toFixed(2));
              const roundedPlannedLarge = Number(plannedLarge.toFixed(2));

              const completionPct = plannedLarge > 0
                ? Math.min(100, Number(((actualProducedLarge / plannedLarge) * 100).toFixed(2)))
                : (order.completionPercentage || 0);

              const largeUnit = order.outputLargeUnit || (isAr ? 'كرتونة' : 'Carton');

              // Status states
              const isRunning = order.status === 'in_progress';
              const isPaused = order.status === 'paused';
              const isCompleted = order.status === 'completed';

              let statusRibbonBg = 'bg-slate-300 text-slate-700';
              let statusLabel = isAr ? 'بانتظار البدء' : 'READY';

              if (isRunning) {
                statusRibbonBg = 'bg-emerald-600 text-white';
                statusLabel = isAr ? 'قيد التشغيل' : 'RUNNING';
              } else if (isPaused) {
                statusRibbonBg = 'bg-amber-500 text-white';
                statusLabel = isAr ? 'متوقف مؤقتاً' : 'PAUSED';
              } else if (isCompleted) {
                statusRibbonBg = 'bg-blue-600 text-white';
                statusLabel = isAr ? 'مكتمل' : 'COMPLETED';
              }

              // Donut chart variables
              const completionPctClamped = Math.min(100, Math.max(0, completionPct));
              const donutRadius = 20;
              const donutCircumference = 2 * Math.PI * donutRadius;
              const strokeDashoffset = donutCircumference - (completionPctClamped / 100) * donutCircumference;

              let progressColor = '#f59e0b'; // Amber < 30%
              let progressColorClass = 'text-amber-600';
              if (completionPctClamped >= 80) {
                progressColor = '#10b981'; // Green >= 80%
                progressColorClass = 'text-emerald-600';
              } else if (completionPctClamped >= 30) {
                progressColor = '#3b82f6'; // Blue 30% - 80%
                progressColorClass = 'text-blue-600';
              }

              const currentSeq = order.importanceRank || (orderIdx + 1);

              // Priority Badge Info
              const priorityInfo = (() => {
                switch (order.priority) {
                  case 'urgent':
                    return {
                      label: isAr ? 'أولوية: مستعجل' : 'Priority: Urgent',
                      cls: 'bg-rose-50 text-rose-800 border-rose-200',
                      icon: <Flame className="h-3 w-3 text-rose-600 shrink-0" />
                    };
                  case 'important':
                    return {
                      label: isAr ? 'أولوية: مهم' : 'Priority: Important',
                      cls: 'bg-amber-50 text-amber-900 border-amber-200',
                      icon: <Star className="h-3 w-3 text-amber-600 shrink-0" />
                    };
                  case 'prep_and_run':
                    return {
                      label: isAr ? 'تجهيز وتشغيل' : 'Prep & Run',
                      cls: 'bg-indigo-50 text-indigo-900 border-indigo-200',
                      icon: <Wrench className="h-3 w-3 text-indigo-600 shrink-0" />
                    };
                  case 'prep_only':
                    return {
                      label: isAr ? 'تجهيز فقط' : 'Prep Only',
                      cls: 'bg-slate-100 text-slate-800 border-slate-200',
                      icon: <Clock className="h-3 w-3 text-slate-500 shrink-0" />
                    };
                  case 'today':
                  default:
                    return {
                      label: isAr ? 'خلال اليوم' : 'Today',
                      cls: 'bg-blue-50 text-blue-800 border-blue-200',
                      icon: <Calendar className="h-3 w-3 text-blue-600 shrink-0" />
                    };
                }
              })();

              // Quantity Exactness Badge Info
              const exactnessInfo = (() => {
                switch (order.qtyExactness) {
                  case 'exact':
                    return {
                      label: isAr ? 'مطابقة: بالظبط' : 'Exact Match',
                      cls: 'bg-purple-50 text-purple-900 border-purple-200',
                      icon: <Target className="h-3 w-3 text-purple-600 shrink-0" />
                    };
                  case 'at_least':
                    return {
                      label: isAr ? 'مطابقة: لا يقل عن' : 'At Least',
                      cls: 'bg-teal-50 text-teal-900 border-teal-200',
                      icon: <ArrowUpRight className="h-3 w-3 text-teal-600 shrink-0" />
                    };
                  case 'at_most':
                    return {
                      label: isAr ? 'مطابقة: لا يزيد عن' : 'At Most',
                      cls: 'bg-orange-50 text-orange-900 border-orange-200',
                      icon: <ArrowDownRight className="h-3 w-3 text-orange-600 shrink-0" />
                    };
                  case 'as_per_materials':
                    return {
                      label: isAr ? 'حسب الخامات' : 'Per Materials',
                      cls: 'bg-emerald-50 text-emerald-900 border-emerald-200',
                      icon: <Boxes className="h-3 w-3 text-emerald-600 shrink-0" />
                    };
                  case 'as_per_time':
                    return {
                      label: isAr ? 'حسب الوقت' : 'Per Time',
                      cls: 'bg-cyan-50 text-cyan-900 border-cyan-200',
                      icon: <Clock className="h-3 w-3 text-cyan-600 shrink-0" />
                    };
                  case 'approximate':
                  default:
                    return {
                      label: isAr ? 'مطابقة: تقريبي' : 'Approximate',
                      cls: 'bg-slate-100 text-slate-700 border-slate-200',
                      icon: <Scale className="h-3 w-3 text-slate-500 shrink-0" />
                    };
                }
              })();

              const isNotesExpanded = !!expandedNotesOrders[order.id];

              return (
                <div
                  key={order.id}
                  className={`relative flex flex-row overflow-hidden rounded-3xl border-2 shadow-md hover:shadow-lg transition-all ${
                    isCompleted
                      ? 'opacity-75 grayscale-[20%] border-slate-200 bg-slate-50/50'
                      : isRunning
                      ? 'border-emerald-400 ring-2 ring-emerald-100 bg-white'
                      : isPaused
                      ? 'border-amber-300 bg-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {/* Vertical 90-degree Rotated Status Ribbon on Leading Edge */}
                  <div
                    className={`w-9 shrink-0 flex items-center justify-center select-none ${statusRibbonBg}`}
                    title={statusLabel}
                  >
                    <span
                      style={{ writingMode: 'vertical-rl' }}
                      className="transform rotate-180 font-black text-[11px] tracking-wider uppercase whitespace-nowrap py-4"
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {/* Card Main Body */}
                  <div className="flex-1 p-4 sm:p-5 space-y-4 min-w-0">
                    {/* Past Date Lockdown Banner */}
                    {isOrderPastDate(order) && (
                      <div className={`flex items-center justify-between px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                        isOrderLocked(order) ? 'bg-slate-100 text-slate-700 border border-slate-300' : 'bg-amber-50 text-amber-900 border border-amber-300'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          {isOrderLocked(order) ? <Lock className="h-3.5 w-3.5 text-slate-500" /> : <Unlock className="h-3.5 w-3.5 text-amber-600" />}
                          <span>
                            {isOrderLocked(order)
                              ? (isAr ? 'أمر تشغيل سابق ومؤرشف (للقراءة فقط - مقفل ضد إدخال البالتات والتعديل)' : 'Past Order (Locked - Read Only)')
                              : (isAr ? 'أمر تشغيل سابق (متاح للتعديل بصلاحية المسؤول العام)' : 'Past Order (Editable by General Admin)')}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">{order.planDate || order.productionDate}</span>
                      </div>
                    )}

                    {/* Order Execution Header */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      {/* Header Start: Identity, Thumbnail & Tags */}
                      <div className="flex items-center gap-3 min-w-0">
                        {/* High-Contrast Floating Sequence Badge */}
                        <span
                          className="font-mono text-xs font-black px-2 py-1 rounded-lg bg-indigo-950 text-white shadow-2xs shrink-0"
                          title={isAr ? `ترتيب الخطة: #${currentSeq}` : `Plan sequence: #${currentSeq}`}
                        >
                          #{currentSeq}
                        </span>

                        {/* Contained Thumbnail with Lightbox Popover Preview */}
                        {cardImage && (
                          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden group/img">
                            <img
                              src={cardImage}
                              alt={order.productNameAr}
                              onClick={() => setImagePreviewModal({
                                url: cardImage,
                                title: `${order.productNameAr} - ${order.packagingOptionNameAr || ''}`,
                                subtitle: `${order.finishedProductId || ''} • ${order.packagingOptionCode || ''}`
                              })}
                              className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                              title={isAr ? 'انقر لعرض الصورة بالحجم الكامل' : 'Click to preview image'}
                            />
                          </div>
                        )}

                        <div className="space-y-1 min-w-0">
                          {/* Primary Product Identity & Packaging Option */}
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-extrabold text-slate-900 text-base leading-snug flex items-center gap-2">
                              <span>{order.productNameAr}</span>
                              {order.packagingOptionNameAr && (
                                <>
                                  <span className="text-slate-400 font-normal">•</span>
                                  <span className="text-indigo-900 font-bold">{order.packagingOptionNameAr}</span>
                                </>
                              )}
                            </h4>
                            {order.isRework && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-[11px] flex items-center gap-1">
                                <Wrench className="h-3 w-3 text-amber-700" />
                                <span>{isAr ? 'أمر تصليح ومرتجع' : 'Rework Order'}</span>
                              </span>
                            )}
                          </div>

                          {/* Order Code + Feasibility Pill + Rework Return Info */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                              أمر #{order.orderNumber}
                            </span>
                            {order.finishedProductId && (
                              <span className="text-[11px] text-slate-400 font-mono">[{order.finishedProductId}]</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setFeasibilityModalData({ order, feasibility })}
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all shadow-2xs hover:scale-105 cursor-pointer ${
                                feasibility.status === 'floor_ready'
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : feasibility.status === 'transfer_needed'
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                              }`}
                              title={isAr ? 'انقر لعرض تفاصيل توفر خامات الـ BOM' : 'Click to inspect BOM component breakdown'}
                            >
                              <CircleDot className="h-2.5 w-2.5" />
                              <span>{feasibility.labelAr}</span>
                              <Eye className="h-2.5 w-2.5 opacity-60 ms-0.5" />
                            </button>

                            {order.isRework && (() => {
                              const orig = getOriginalReturnQty(order);
                              return orig ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 rounded-lg text-[10px] font-bold">
                                  <RotateCcw className="h-3 w-3 text-purple-600" />
                                  <span>{isAr ? 'أصل المرتجع:' : 'Orig Return:'}</span>
                                  <b className="font-mono">{orig.qtyLarge} {orig.largeUnit}</b>
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Header Middle: "View Notes" Badge */}
                      {order.notes && (
                        <div className="flex items-center justify-start xl:justify-center shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedNotesOrders(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition shadow-2xs cursor-pointer ${
                              isNotesExpanded
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-amber-100/90 hover:bg-amber-200 text-amber-900 border border-amber-300'
                            }`}
                            title={isAr ? 'عرض أو إخفاء ملاحظات وتوجيهات التشغيل' : 'Toggle batch notes'}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>{isAr ? 'عرض الملاحظات' : 'View Notes'}</span>
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isNotesExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      )}

                      {/* Header End Side: Plan Rules Chips + Quantity Chips + Circular Donut Chart */}
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start xl:self-center">
                        {/* Plan Rules Chips Column (Priority & Exactness) */}
                        <div className="flex flex-col justify-between h-14 shrink-0">
                          {/* Upper chip: Priority */}
                          <div
                            className={`h-[26px] px-2.5 border rounded-lg text-[10px] font-bold flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${priorityInfo.cls}`}
                            title={isAr ? `أولوية الخطة: ${priorityInfo.label}` : `Plan Priority: ${priorityInfo.label}`}
                          >
                            {priorityInfo.icon}
                            <span>{priorityInfo.label}</span>
                          </div>

                          {/* Lower chip: Quantity Exactness */}
                          <div
                            className={`h-[26px] px-2.5 border rounded-lg text-[10px] font-bold flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${exactnessInfo.cls}`}
                            title={isAr ? `معيار مطابقة الكمية: ${exactnessInfo.label}` : `Quantity Exactness: ${exactnessInfo.label}`}
                          >
                            {exactnessInfo.icon}
                            <span>{exactnessInfo.label}</span>
                          </div>
                        </div>

                        {/* Quantity Chips Column (Complete Qty & Target Qty) */}
                        <div className="flex flex-col justify-between h-14 shrink-0">
                          {/* Upper chip: Complete qty */}
                          <div className="h-[26px] px-2.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg text-[10px] font-bold flex items-center justify-between gap-2 shadow-2xs whitespace-nowrap">
                            <span className="text-emerald-700/80 font-medium">{isAr ? 'المنجز:' : 'Complete:'}</span>
                            <div className="flex items-baseline gap-1">
                              <span className="font-mono font-extrabold text-emerald-950">
                                {roundedActualLarge.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                              </span>
                              <span className="text-[9px] text-emerald-700 font-semibold">{largeUnit}</span>
                            </div>
                          </div>

                          {/* Lower chip: Target qty */}
                          <div className="h-[26px] px-2.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-[10px] font-bold flex items-center justify-between gap-2 shadow-2xs whitespace-nowrap">
                            <span className="text-slate-500 font-medium">{isAr ? 'المستهدف:' : 'Target:'}</span>
                            <div className="flex items-baseline gap-1">
                              <span className="font-mono font-extrabold text-slate-900">
                                {roundedPlannedLarge.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                              </span>
                              <span className="text-[9px] text-slate-500 font-semibold">{largeUnit}</span>
                            </div>
                          </div>
                        </div>

                        {/* Circular Donut Chart with % in Center */}
                        <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                          <svg className="w-14 h-14 -rotate-90 transform" viewBox="0 0 48 48">
                            <circle
                              cx="24"
                              cy="24"
                              r={donutRadius}
                              className="stroke-slate-200"
                              strokeWidth="4"
                              fill="transparent"
                            />
                            <circle
                              cx="24"
                              cy="24"
                              r={donutRadius}
                              stroke={progressColor}
                              strokeWidth="4"
                              strokeDasharray={donutCircumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                              fill="transparent"
                              className="transition-all duration-500 ease-out"
                            />
                          </svg>
                          {/* Center Content: % Completed */}
                          <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
                            <span className={`font-mono font-black text-xs leading-none ${progressColorClass}`}>
                              {completionPct.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Inline Expanded Notes Section (Full Width, Untruncated) */}
                    {order.notes && isNotesExpanded && (
                      <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl shadow-2xs space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150 select-text">
                        <div className="flex items-center justify-between border-b border-amber-200/60 pb-1">
                          <span className="text-[11px] font-extrabold text-amber-900 flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-amber-700" />
                            <span>{isAr ? 'ملاحظات وتوجيهات أمر التشغيل' : 'Production Batch Notes & Instructions'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedNotesOrders(prev => ({ ...prev, [order.id]: false }))}
                            className="text-amber-700 hover:text-amber-900 p-0.5 rounded transition cursor-pointer"
                            title={isAr ? 'إغلاق الملاحظات' : 'Close notes'}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-amber-950 font-medium leading-relaxed whitespace-pre-wrap">
                          {order.notes}
                        </p>
                      </div>
                    )}

                    {/* Split Control Bar */}
                    <div className="p-3 bg-linear-to-r from-slate-50 via-indigo-50/20 to-slate-50 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs">
                      {/* Side A: Execution Timer Controls & Crew Adjuster */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {!isOrderLocked(order) && order.status !== 'completed' && (
                          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-300 shadow-2xs">
                            <Clock className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                            <span className="text-[10px] font-bold text-slate-500 shrink-0 hidden sm:inline">
                              {isAr ? 'الوقت:' : 'Time:'}
                            </span>
                            <input
                              type="time"
                              value={orderActionTimes[order.id] ?? minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)))}
                              onChange={(e) => {
                                const val = e.target.value;
                                setOrderActionTimes((prev) => ({ ...prev, [order.id]: val }));
                              }}
                              className="w-[72px] px-1 py-0.5 text-xs font-mono font-black text-center border border-slate-200 rounded-md bg-slate-50 text-slate-900 focus:bg-white"
                              title={isAr ? 'تحديد وقت الإجراء يدوياً' : 'Set action time manually'}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const cur = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
                                setOrderActionTimes((prev) => ({ ...prev, [order.id]: cur }));
                              }}
                              className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[10px] font-black transition cursor-pointer"
                              title={isAr ? 'ضبط على التوقيت الحالي الآن' : 'Set to current time'}
                            >
                              {isAr ? 'الآن' : 'Now'}
                            </button>
                          </div>
                        )}

                        {/* Timer Action Buttons */}
                        {!isOrderLocked(order) && (
                          <div className="flex items-center gap-1.5">
                            {order.status !== 'completed' && !hasOrderTimeRecorded(order) && (
                              <button
                                type="button"
                                onClick={() => handleStartOrder(order, orderActionTimes[order.id])}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                title={isAr ? 'بدء تشغيل أمر الإنتاج واحتساب دقائق العمل' : 'Start floor execution'}
                              >
                                <Play className="h-3.5 w-3.5 fill-current" />
                                <span>{isAr ? 'بدء التشغيل' : 'Start Run'}</span>
                              </button>
                            )}

                            {order.status === 'in_progress' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handlePauseOrder(order, orderActionTimes[order.id])}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
                                  title={isAr ? 'إيقاف تشغيل الأمر مؤقتاً' : 'Pause execution'}
                                >
                                  <Pause className="h-3.5 w-3.5 fill-current" />
                                  <span>{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleInitiateCompleteOrder(order, orderActionTimes[order.id])}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
                                  title={isAr ? 'إنهاء التشغيل وإغلاق الوقت' : 'Complete execution'}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'إنهاء التشغيل' : 'Complete'}</span>
                                </button>
                              </>
                            )}

                            {order.status !== 'completed' && order.status !== 'in_progress' && hasOrderTimeRecorded(order) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleResumeOrder(order, orderActionTimes[order.id])}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
                                  title={isAr ? 'استئناف تشغيل أمر الإنتاج' : 'Resume execution'}
                                >
                                  <Play className="h-3.5 w-3.5 fill-current" />
                                  <span>{isAr ? 'استئناف' : 'Resume'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleInitiateCompleteOrder(order, orderActionTimes[order.id])}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
                                  title={isAr ? 'إنهاء التشغيل وإغلاق الوقت' : 'Complete execution'}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'إنهاء التشغيل' : 'Complete'}</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Crew Count Adjuster */}
                        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-2xs">
                          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-indigo-600" />
                            <span>{isAr ? 'طاقم العمل:' : 'Crew:'}</span>
                          </span>
                          {!isOrderLocked(order) && order.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateCrewCount(order, -1)}
                              disabled={getOrderCrewCount(order) <= 1}
                              className="w-5 h-5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs disabled:opacity-30 cursor-pointer transition"
                              title={isAr ? 'تقليل العمالة' : 'Decrease crew'}
                            >
                              -
                            </button>
                          )}
                          <span className="font-mono font-black text-xs px-1 text-indigo-950 min-w-5 text-center">
                            {getOrderCrewCount(order)}
                          </span>
                          {!isOrderLocked(order) && order.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateCrewCount(order, 1)}
                              className="w-5 h-5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs cursor-pointer transition"
                              title={isAr ? 'زيادة العمالة' : 'Increase crew'}
                            >
                              +
                            </button>
                          )}
                          <span className="text-[10px] text-slate-400 font-semibold">{isAr ? 'عمال' : 'workers'}</span>
                        </div>

                        {/* Runtime Counter */}
                        {(() => {
                          const segs = order.segments || [];
                          const nowTimeStr = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
                          const totalMins = segs.reduce((sum, s) => {
                            const eTime = s.endTime || (s.status === 'Active' ? nowTimeStr : s.startTime);
                            return sum + calculateDuration(s.startTime, eTime);
                          }, 0);
                          return totalMins > 0 ? (
                            <div className="flex items-center gap-1 text-xs font-mono font-bold text-slate-700 bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              <span>{formatDuration(totalMins, isAr)}</span>
                            </div>
                          ) : null;
                        })()}
                      </div>

                      {/* Side B: Floor Actions (Rework Matrix + Log Scrap + Smart Add Pallet) */}
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {/* Rework Reconciliation Button for Rework Orders */}
                        {order.isRework && (
                          <button
                            type="button"
                            onClick={() => handleOpenReconcileRework(order)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                            title={isAr ? 'تسوية خامات ومطابقة أمر التصليح (BOM Reconciliation Matrix)' : 'Reconcile Rework Matrix'}
                          >
                            <Layers className="h-3.5 w-3.5" />
                            <span>{isAr ? 'تسوية ومطابقة التصليح' : 'Reconcile Rework'}</span>
                          </button>
                        )}

                        {/* Log Scrap Button */}
                        {!isOrderLocked(order) && (
                          <button
                            type="button"
                            onClick={() => handleOpenLogFloorScrap(order)}
                            className="h-8 px-2.5 py-1 bg-white hover:bg-rose-50 hover:text-rose-700 text-slate-600 border border-slate-200 hover:border-rose-200 rounded-xl text-[11px] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                            title={isAr ? 'تسجيل هالك أو مرتجع للمورد ووضعه جانباً بالصالة' : 'Log scrap / vendor return on floor'}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                            <span>{isAr ? 'تسجيل هالك' : 'Log Scrap'}</span>
                          </button>
                        )}

                        {/* Smart Add Pallet Button */}
                        {isOrderLocked(order) ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 shrink-0">
                            <Lock className="h-3.5 w-3.5 text-slate-500" />
                            <span>{isAr ? 'أمر سابق مقفل' : 'Archived & Locked'}</span>
                          </div>
                        ) : isRunning ? (
                          <button
                            type="button"
                            onClick={() => handleOpenAddPallet(order)}
                            className="px-3.5 py-2 min-h-[38px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="h-4 w-4" />
                            <span>{isAr ? 'إدراج باليتة جديدة وطاقم العمل' : 'Add Pallet & Crew'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="px-3.5 py-2 min-h-[38px] bg-slate-100 text-slate-400 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80"
                            title={isAr ? 'يجب بدء أو استئناف تشغيل الأمر أولاً لإدراج البالتات' : 'Start or resume timer to add pallets'}
                          >
                            <Plus className="h-4 w-4 opacity-50" />
                            <span>{isAr ? 'إدراج باليتة جديدة وطاقم العمل' : 'Add Pallet & Crew'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                  {/* Serialized Pallets Registry - Compact Square Pallet Subcards */}
                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Boxes className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{isAr ? `بالتات التشغيل المنجزة (${pallets.length} بالتات):` : `Completed Pallets (${pallets.length}):`}</span>
                      </span>
                      {pallets.length > 0 && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          {isAr ? 'انقر على أي باليتة لعرض تفاصيلها وطاقمها' : 'Click any pallet for passport details'}
                        </span>
                      )}
                    </div>

                    {pallets.length === 0 ? (
                      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                        {isAr ? 'لم يتم إنتاج أو رص أي بالتات لهذا الصنف بعد. انقر على "+ إدراج باليتة جديدة".' : 'No pallets produced yet.'}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {pallets.map((pallet, pIdx) => {
                          const isTransferred = pallet.stagingStatus === 'transferred_to_fg' || pallet.status === 'transferred_to_fg';

                          return (
                            <div
                              key={pallet.palletId || pIdx}
                              onClick={() => setInspectPalletModal({ order, pallet, pIdx })}
                              className="w-24 h-24 sm:w-28 sm:h-28 aspect-square p-2 bg-white hover:bg-indigo-50/50 border-2 border-slate-200 hover:border-indigo-500 rounded-2xl shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between select-none group"
                              title={isAr ? `انقر لعرض تفاصيل الباليتة #${pallet.palletNumber || pIdx + 1}` : `Click to inspect Pallet #${pallet.palletNumber || pIdx + 1}`}
                            >
                              {/* Top Row: Pallet Number + QC status indicator / locked / photo icon */}
                              <div className="flex items-center justify-between w-full">
                                <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                  #{pallet.palletNumber || pIdx + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  {pallet.imageUrl && (
                                    <Camera className="h-3 w-3 text-emerald-600" title={isAr ? 'تحتوي صورة' : 'Has photo'} />
                                  )}
                                  {isTransferred ? (
                                    <Lock className="h-3 w-3 text-slate-400" title={isAr ? 'بالمستودع (مقفل)' : 'In FG'} />
                                  ) : (
                                    <span
                                      className={`h-2 w-2 rounded-full ${pallet.qcStatus === 'passed' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                      title={pallet.qcStatus === 'passed' ? 'QC Passed' : (pallet.qcStatus || 'QC')}
                                    />
                                  )}
                                </div>
                              </div>

                              {/* Middle: Quantity */}
                              <div className="text-center my-auto">
                                <div className="font-mono font-black text-sm text-slate-900 leading-tight">
                                  {pallet.qtyLarge}
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 leading-none mt-0.5">
                                  {order.outputLargeUnit || (isAr ? 'كرتونة' : 'Carton')}
                                </div>
                              </div>

                              {/* Bottom: Completion Time & Wrapping Machine */}
                              <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-slate-500 bg-slate-50 rounded-md px-1 py-0.5 w-full">
                                <span className="flex items-center gap-0.5 truncate">
                                  <Clock className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                                  <span>{pallet.endTime || pallet.startTime || '--:--'}</span>
                                </span>
                                <span
                                  className={`text-[9px] px-1 py-0.2 rounded font-bold shrink-0 ${
                                    pallet.wrappingMachine === 'wrapping_2'
                                      ? 'bg-purple-100 text-purple-800'
                                      : pallet.wrappingMachine === 'no_shrink'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                  title={
                                    pallet.wrappingMachine === 'wrapping_2'
                                      ? (isAr ? 'ماكينة تغليف 2' : 'Wrapping Machine 2')
                                      : pallet.wrappingMachine === 'no_shrink'
                                      ? (isAr ? 'بدون شرنك' : 'No Shrink')
                                      : (isAr ? 'ماكينة تغليف 1' : 'Wrapping Machine 1')
                                  }
                                >
                                  {pallet.wrappingMachine === 'wrapping_2' ? 'م2' : pallet.wrappingMachine === 'no_shrink' ? 'حر' : 'م1'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: LIVE PRODUCTION TRACKING CANVAS (المتابعة الحية)                */}
      {/* ========================================================================= */}
      {activeSubTab === 'live_tracking' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top Summary KPI Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Staged Finished Pallets KPI */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isAr ? 'بالتات تام بعهدة الصالة' : 'Staged Finished Pallets'}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-extrabold text-xl text-indigo-700">
                    {activeStagedFloorPallets.length}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    {isAr ? 'بالتة جاهزة' : 'pallets ready'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {activeStagedFloorPallets.reduce((s, p) => s + (Number(p.qtyLarge) || 0), 0)}{' '}
                  {isAr ? 'كرتونة مجمعة' : 'cartons'}
                </span>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Boxes className="h-6 w-6" />
              </div>
            </div>

            {/* Staged Scrap / Floor Defectives KPI */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isAr ? 'خامات تحت الفرز والهالك' : 'Staged Floor Scrap'}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-extrabold text-xl text-rose-700">
                    {activeStagedFloorMaterials.length}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    {isAr ? 'بنود خامات' : 'items'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block">
                  {isAr ? 'بانتظار التخصيص أو المرتجع' : 'Awaiting allocation'}
                </span>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
            </div>

            {/* Pending Transfers (FG Inward) KPI */}
            <div
              onClick={() => { window.location.hash = '#fg_inward'; }}
              className="p-4 bg-white hover:bg-amber-50/40 border border-slate-200 hover:border-amber-300 rounded-2xl shadow-2xs flex items-center justify-between cursor-pointer transition"
              title={isAr ? 'الانتقال لتبويب استلام المنتج التام للاعتماد' : 'Go to Finished Goods Inward tab'}
            >
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  {isAr ? 'تحويلات بانتظار استلام التام' : 'Transfers to FG Inward'}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-extrabold text-xl text-amber-700">
                    {pendingFloorTransfers.length}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    {isAr ? 'أذون تحويل' : 'transfers'}
                  </span>
                </div>
                <span className="text-[10px] text-amber-700 font-medium block">
                  {pendingFloorTransfers.length > 0 ? (isAr ? '↗ اضغط لفتح بوابة استلام التام' : '↗ Open FG Inward tab') : (isAr ? 'لا توجد حركات معلقة' : 'All clear')}
                </span>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>

            {/* Quick Bulk Action */}
            <div className="p-4 bg-linear-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-indigo-900 block">
                {isAr ? 'ترحيل جماعي لجميع البالتات' : 'Bulk Transfer to FG'}
              </span>
              <button
                type="button"
                onClick={() => handleOpenTransferFgModal(null)}
                disabled={activeStagedFloorPallets.length === 0}
                className="mt-2 w-full py-2 bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white border border-slate-200 hover:border-indigo-600 rounded-xl text-xs font-semibold hover:font-bold transition-all duration-200 shadow-none hover:shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>{isAr ? 'ترحيل كافة البالتات لمستودع التام' : 'Transfer All to FG WH'}</span>
              </button>
            </div>
          </div>

          {/* Collapsible Live Floor Timeline & Shift Scorecard (Relocated to Top beneath Dashboard) */}
          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-2xl">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'الخط الزمني المباشر ومؤشرات الوردية' : 'Live Floor Timeline & Shift Scorecard'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'متابعة أوقات التشغيل والراحة والوقت الإضافي لخطوط الإنتاج.' : 'Floor line runtime, breaks, and shift metrics.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBreakModal(true)}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Coffee className="h-3.5 w-3.5 text-amber-600" />
                  <span>{isAr ? 'تسجيل استراحة / راحة' : 'Log Break'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowShiftTimelineSection(!showShiftTimelineSection)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  title={showShiftTimelineSection ? (isAr ? 'إخفاء' : 'Collapse') : (isAr ? 'عرض' : 'Expand')}
                >
                  {showShiftTimelineSection ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {showShiftTimelineSection && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Shift Scores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'بداية الوردية' : 'Shift Start'}</span>
                    <span className="font-mono font-extrabold text-sm text-slate-900 block">{shiftKpis.shiftStartDisplay}</span>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'صافي الإنتاج' : 'Production'}</span>
                    <span className="font-mono font-extrabold text-sm text-emerald-700 block">{formatDuration(shiftKpis.totalProdMins, isAr)}</span>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'وقت الراحة' : 'Breaks'}</span>
                    <span className="font-mono font-extrabold text-sm text-amber-700 block">{formatDuration(shiftKpis.totalBreakMins, isAr)}</span>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'الوقت المهدر' : 'Downtime'}</span>
                    <span className="font-mono font-extrabold text-sm text-rose-700 block">{formatDuration(shiftKpis.totalWasteMins, isAr)}</span>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'نهاية الوردية' : 'Shift End'}</span>
                    <span className="font-mono font-extrabold text-sm text-slate-900 block">{shiftKpis.shiftEndDisplay}</span>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'الوقت الإضافي' : 'Overtime'}</span>
                    <span className="font-mono font-extrabold text-sm text-purple-700 block">{formatDuration(shiftKpis.overtimeMins, isAr)}</span>
                  </div>

                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'كفاءة الوقت (OEE)' : 'Efficiency'}</span>
                    <span className="font-mono font-extrabold text-sm text-blue-700 block">{shiftKpis.timeEfficiencyPct}%</span>
                  </div>
                </div>

                {/* Timeline Canvas & Legend */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  {/* Legend & Summary Info */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pb-1 border-b border-slate-200/80">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1.5 font-bold text-slate-700">
                        <span className="w-3 h-3 rounded-md bg-blue-600 inline-block shadow-2xs"></span>
                        <span>{isAr ? 'تشغيل إنتاج' : 'Production'}</span>
                      </span>
                      <span className="flex items-center gap-1.5 font-bold text-slate-700">
                        <span className="w-3 h-3 rounded-md bg-amber-400 inline-block shadow-2xs"></span>
                        <span>{isAr ? 'استراحة / راحة' : 'Break'}</span>
                      </span>
                      <span className="flex items-center gap-1.5 font-bold text-slate-700">
                        <span className="w-3 h-3 rounded-md bg-rose-200 border border-rose-400 inline-block shadow-2xs"></span>
                        <span>{isAr ? 'وقت مهدر' : 'Downtime / Waste'}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500">{isAr ? 'نقاط فحص البالتات:' : 'Pallet Pins:'}</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                        🏷️ {isAr ? 'ماكينة 1' : 'Wrap 1'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                        🏷️ {isAr ? 'ماكينة 2' : 'Wrap 2'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                        🏷️ {isAr ? 'بدون شرنك' : 'No Shrink'}
                      </span>
                    </div>
                  </div>

                  {/* Visual Pallet Pins Track (Above the Timeline Bar) */}
                  {todayPalletCheckpoints.length > 0 && (
                    <div className="relative w-full h-7">
                      {todayPalletCheckpoints.map((pin, pIdx) => {
                        const shiftSpan = Math.max(510, (timeToMins(shiftKpis.shiftEndDisplay) - 480));
                        const leftPct = Math.max(0, Math.min(98, ((pin.timeMins - 480) / shiftSpan) * 100));

                        return (
                          <div
                            key={pin.pallet.palletId || pIdx}
                            style={{ left: `${leftPct}%` }}
                            onClick={() => setInspectPalletModal({ order: pin.order, pallet: pin.pallet, pIdx: pin.pIdx })}
                            className={`absolute -top-0.5 -translate-x-1/2 px-1.5 py-0.5 rounded-md font-mono text-[9px] font-black cursor-pointer shadow-xs transition hover:scale-110 hover:z-30 flex items-center gap-0.5 border ${
                              pin.wrappingMachine === 'wrapping_2'
                                ? 'bg-purple-600 text-white border-purple-700'
                                : pin.wrappingMachine === 'no_shrink'
                                ? 'bg-amber-600 text-white border-amber-700'
                                : 'bg-blue-600 text-white border-blue-700'
                            }`}
                            title={
                              isAr
                                ? `بالتة #${pin.palletNumber} - ${pin.productNameAr} (${pin.qtyLarge} كرتونة) • ${pin.wrappingMachine === 'wrapping_2' ? 'ماكينة 2' : pin.wrappingMachine === 'no_shrink' ? 'بدون شرنك' : 'ماكينة 1'} • الساعة ${pin.time}`
                                : `Pallet #${pin.palletNumber} - ${pin.productNameAr} (${pin.qtyLarge} ctns) @ ${pin.time}`
                            }
                          >
                            <span>🏷️</span>
                            <span>P{pin.palletNumber}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Main Shift Timeline Bar */}
                  <div className="relative w-full h-11 bg-slate-200/90 rounded-2xl overflow-hidden shadow-inner flex items-center">
                    {/* 1. Automated Waste Gaps (Underlay) */}
                    {(shiftKpis.wasteGaps || []).map((gap, gIdx) => {
                      const shiftSpan = Math.max(510, (timeToMins(shiftKpis.shiftEndDisplay) - 480));
                      const leftPct = Math.max(0, Math.min(100, ((gap.startMin - 480) / shiftSpan) * 100));
                      const widthPct = Math.max(1, Math.min(100 - leftPct, (gap.durationMins / shiftSpan) * 100));

                      return (
                        <div
                          key={`waste-${gIdx}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          className="absolute h-full bg-rose-100 border-x border-rose-300 text-rose-800 text-[10px] font-bold flex items-center justify-center px-1 overflow-hidden opacity-90 hover:opacity-100 transition"
                          title={isAr ? `وقت مهدر: ${gap.startTime} - ${gap.endTime} (${gap.durationMins} دقيقة)` : `Downtime: ${gap.startTime} - ${gap.endTime} (${gap.durationMins}m)`}
                        >
                          <span className="truncate text-[9px] text-rose-700 font-bold opacity-80">
                            {gap.durationMins >= 15 ? (isAr ? `مهدر (${gap.durationMins}د)` : `Waste ${gap.durationMins}m`) : ''}
                          </span>
                        </div>
                      );
                    })}

                    {/* 2. Production Order Segments */}
                    {todayTimelineData.map((seg, sIdx) => {
                      const sM = timeToMins(seg.startTime);
                      const eM = timeToMins(seg.endTime);
                      const dur = eM < sM ? (eM + 1440 - sM) : (eM - sM);
                      const shiftSpan = Math.max(510, (timeToMins(shiftKpis.shiftEndDisplay) - 480));
                      const leftPct = Math.max(0, Math.min(100, ((sM - 480) / shiftSpan) * 100));
                      const widthPct = Math.max(2, Math.min(100 - leftPct, (dur / shiftSpan) * 100));

                      return (
                        <div
                          key={seg.segmentId || sIdx}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          className={`absolute h-9 rounded-xl text-white text-[10px] font-bold flex items-center justify-between px-2 truncate shadow-xs border border-white z-10 ${
                            seg.isActive
                              ? 'bg-blue-600 ring-2 ring-emerald-400 ring-offset-1 animate-pulse'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                          title={
                            isAr
                              ? `${seg.productNameAr} • أمر #${seg.orderNumber} (${seg.startTime} - ${seg.endTime}) • عمالة: ${seg.crewCount}`
                              : `${seg.productNameAr} • #${seg.orderNumber} (${seg.startTime} - ${seg.endTime}) • Crew: ${seg.crewCount}`
                          }
                        >
                          <span className="truncate">{seg.productNameAr}</span>
                          <span className="text-[9px] opacity-90 font-mono ms-1 shrink-0">👥{seg.crewCount}</span>
                        </div>
                      );
                    })}

                    {/* 3. Shift Breaks */}
                    {todayBreaks.map((b, bIdx) => {
                      const sM = timeToMins(b.startTime);
                      const eM = timeToMins(b.endTime);
                      const dur = eM < sM ? (eM + 1440 - sM) : (eM - sM);
                      const shiftSpan = Math.max(510, (timeToMins(shiftKpis.shiftEndDisplay) - 480));
                      const leftPct = Math.max(0, Math.min(100, ((sM - 480) / shiftSpan) * 100));
                      const widthPct = Math.max(2, Math.min(100 - leftPct, (dur / shiftSpan) * 100));

                      return (
                        <div
                          key={b.id || bIdx}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          className="absolute h-9 rounded-xl bg-amber-400 text-amber-950 text-[10px] font-bold flex items-center justify-center px-1 truncate shadow-xs border border-white z-20"
                          title={`استراحة (${b.startTime} - ${b.endTime})`}
                        >
                          <span>☕ {b.notes || (isAr ? 'راحة' : 'Break')}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Hours Axis underneath */}
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 px-1 pt-0.5">
                    <span>08:00</span>
                    <span>10:00</span>
                    <span>12:00</span>
                    <span>14:00</span>
                    <span>16:30</span>
                    {timeToMins(shiftKpis.shiftEndDisplay) > 990 && (
                      <span className="text-purple-700 font-bold">{shiftKpis.shiftEndDisplay} (إضافي)</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PANEL A: Staged Finished Products on Floor (Grouped by Product & Packaging Option) */}
          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-2xl">
                  <Boxes className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'المنتجات التامة بعهدة الصالة (بالتات تحت التسليم لمستودع التام)' : 'Staged Finished Products (Floor Pallets)'}</span>
                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-900 rounded-full font-mono text-xs font-black">
                      {activeStagedFloorPallets.length} {isAr ? 'بالتات' : 'pallets'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAr
                      ? 'البالتات المنتجة حديثاً بالصالة، مجمعة حسب الصنف والشكل، في انتظار الترحيل لمستودع المنتجات التامة.'
                      : 'Recently packed floor pallets grouped by product & packaging option awaiting transfer to FG Warehouse.'}
                  </p>
                </div>
              </div>

              {activeStagedFloorPallets.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleOpenTransferFgModal(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white border border-slate-200 hover:border-indigo-600 rounded-xl text-xs font-semibold hover:font-bold transition-all duration-200 shadow-none hover:shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>{isAr ? 'ترحيل الكل لمستودع التام' : 'Transfer All to FG WH'}</span>
                </button>
              )}
            </div>

            {groupedStagedPallets.length === 0 ? (
              <div className="p-10 text-center text-slate-400 space-y-2">
                <Boxes className="h-10 w-10 mx-auto text-slate-300 opacity-60" />
                <p className="text-xs font-semibold">
                  {isAr ? 'لا توجد بالتات منتج تام متراكمة بالصالة حالياً (كافة الإنتاج مرحل ومستلم بمستودع التام).' : 'No finished pallets staged on the floor.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedStagedPallets.map((group) => {
                  const prod = finishedProducts.find((p) => p.code === group.finishedProductId || p.id === group.finishedProductId);
                  const opt = prod?.packagingOptions?.find((o) => o.suffix === group.packagingOptionSuffix || o.code === group.packagingOptionCode);
                  const strictlyProductImage = opt?.imageFile || prod?.imageFile || '';

                  return (
                    <div key={group.groupKey} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                      {/* Group Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                        <div className="flex items-center gap-3">
                          {strictlyProductImage ? (
                            <img
                              src={strictlyProductImage}
                              alt={group.productNameAr}
                              className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs shrink-0 cursor-pointer"
                              onClick={() => window.open(strictlyProductImage, '_blank')}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="h-6 w-6" />
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-extrabold text-slate-900 text-base leading-snug flex items-center gap-2">
                                <span>{group.productNameAr}</span>
                                {group.packagingOptionNameAr && (
                                  <>
                                    <span className="text-slate-400 font-normal">•</span>
                                    <span className="text-indigo-900 font-bold">{group.packagingOptionNameAr}</span>
                                  </>
                                )}
                              </h4>
                              <span className="text-xs text-slate-400 font-mono">[{group.finishedProductId}]</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg font-bold font-mono text-[11px]">
                                {group.totalPallets} {isAr ? 'بالتات' : 'pallets'}
                              </span>
                              <span className="px-2.5 py-0.5 bg-white text-slate-800 border border-slate-200 rounded-lg font-bold font-mono text-[11px]">
                                {group.totalQtyLarge} {group.outputLargeUnit}
                              </span>
                              <span className="px-2.5 py-0.5 bg-white text-slate-600 border border-slate-200 rounded-lg font-semibold font-mono text-[11px]">
                                ({group.totalQtySmall} {group.outputSmallUnit})
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenTransferFgModal(group)}
                          className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-xl text-xs font-bold transition-all duration-200 shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                          <span>{isAr ? 'ترحيل هذه البالتات لمستودع التام' : 'Transfer Pallets to FG'}</span>
                        </button>
                      </div>

                      {/* Group Pallets Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {group.pallets.map((p) => {
                          const linkedOrder = workOrders.find((o) => o.id === p.workOrderId);
                          const isTransferred = p.status === 'transferred_to_fg' || p.stagingStatus === 'transferred_to_fg';

                          return (
                            <div key={p.id || p.palletId} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs shadow-2xs hover:border-indigo-300 transition">
                              <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-extrabold text-indigo-700 flex items-center gap-1">
                                    <QrCode className="h-3.5 w-3.5" />
                                    <span>#{p.palletNumber || p.palletId}</span>
                                  </span>
                                  {p.orderNumber && (
                                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                      أمر #{p.orderNumber}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1">
                                  {isTransferred ? (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 font-bold rounded text-[10px] flex items-center gap-1">
                                      <Lock className="h-3 w-3 text-slate-400" />
                                      <span>{isAr ? 'بالمستودع' : 'In FG'}</span>
                                    </span>
                                  ) : isOrderLocked(linkedOrder) ? (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 font-bold rounded text-[10px] flex items-center gap-1" title={isAr ? 'مقفل (تاريخ سابق)' : 'Locked'}>
                                      <Lock className="h-3 w-3 text-slate-400" />
                                      <span>{isAr ? 'مقفل' : 'Locked'}</span>
                                    </span>
                                  ) : (
                                    <>
                                      {linkedOrder && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const pIdx = linkedOrder.pallets?.findIndex((pl) => {
                                              if (pl.palletId === p.palletId || (Number(pl.palletNumber) === Number(p.palletNumber) && p.palletNumber !== undefined)) {
                                                if (Number(pl.qtyLarge) === Number(p.qtyLarge)) return true;
                                              }
                                              return false;
                                            });
                                            const finalIdx = pIdx !== -1 && pIdx !== undefined
                                              ? pIdx
                                              : linkedOrder.pallets?.findIndex((pl) => pl.palletId === p.palletId || Number(pl.palletNumber) === Number(p.palletNumber));
                                            if (finalIdx !== -1 && finalIdx !== undefined) handleOpenEditPallet(linkedOrder, finalIdx);
                                          }}
                                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                          title={isAr ? 'تعديل بيانات الباليتة' : 'Edit Pallet'}
                                        >
                                          <Edit3 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {linkedOrder && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const pIdx = linkedOrder.pallets?.findIndex((pl) => {
                                              if (pl.palletId === p.palletId || (Number(pl.palletNumber) === Number(p.palletNumber) && p.palletNumber !== undefined)) {
                                                if (Number(pl.qtyLarge) === Number(p.qtyLarge)) return true;
                                              }
                                              return false;
                                            });
                                            const finalIdx = pIdx !== -1 && pIdx !== undefined
                                              ? pIdx
                                              : linkedOrder.pallets?.findIndex((pl) => pl.palletId === p.palletId || Number(pl.palletNumber) === Number(p.palletNumber));
                                            if (finalIdx !== -1 && finalIdx !== undefined) handleDeletePallet(linkedOrder, finalIdx);
                                          }}
                                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                          title={isAr ? 'حذف الباليتة واسترجاع خاماتها للصالة' : 'Delete Pallet & Restore Stock'}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {isGeneralAdmin && linkedOrder && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const pIdx = linkedOrder.pallets?.findIndex((pl) => {
                                          if (pl.palletId === p.palletId || (Number(pl.palletNumber) === Number(p.palletNumber) && p.palletNumber !== undefined)) {
                                            if (Number(pl.qtyLarge) === Number(p.qtyLarge)) return true;
                                          }
                                          return false;
                                        });
                                        const finalIdx = pIdx !== -1 && pIdx !== undefined
                                          ? pIdx
                                          : linkedOrder.pallets?.findIndex((pl) => pl.palletId === p.palletId || Number(pl.palletNumber) === Number(p.palletNumber));
                                        if (finalIdx !== -1 && finalIdx !== undefined) {
                                          handleOpenAdminPalletMenu(linkedOrder, p, finalIdx);
                                        }
                                      }}
                                      className="p-1 text-purple-600 hover:bg-purple-100 bg-purple-50 rounded-lg border border-purple-200 transition cursor-pointer"
                                      title={isAr ? 'خيارات الإدارة العامة (تعديل متقدم / إلغاء)' : 'General Admin Reversal & Override Options'}
                                    >
                                      <ShieldAlert className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="flex justify-between items-center text-[11px]">
                                <span>{isAr ? 'الكمية:' : 'Qty:'} <b className="font-mono font-bold text-slate-900">{p.qtyLarge} {group.outputLargeUnit}</b> ({p.qtySmall} {group.outputSmallUnit})</span>
                                <span className="font-mono text-slate-500">{p.startTime} {isAr ? '←' : '➔'} {p.endTime}</span>
                              </div>

                              {p.batchRangeDisplay && (
                                <div className="flex items-center justify-between text-[10px] bg-slate-50 px-2 py-1 rounded border border-slate-100 font-mono">
                                  <span className="flex items-center gap-1 text-slate-500 font-sans">
                                    <Printer className="h-3 w-3 text-slate-400" />
                                    <span>{isAr ? 'التشغيلة:' : 'Batch:'}</span>
                                  </span>
                                  <span className="font-bold text-rose-700">{p.batchRangeDisplay}</span>
                                </div>
                              )}

                              {(() => {
                                const liquidInfo = resolvePalletLiquidTanks(p, linkedOrder);
                                if (!liquidInfo.displayStr && !isGeneralAdmin) return null;
                                return (
                                  <div className="flex items-center justify-between text-[10px] bg-cyan-50/80 text-cyan-950 px-2 py-1 rounded border border-cyan-200/80 font-mono">
                                    <span className="flex items-center gap-1 font-sans font-bold text-cyan-800">
                                      <Activity className="h-3 w-3 text-cyan-600" />
                                      <span>{isAr ? 'تانكات السائل:' : 'Liquid Tanks:'}</span>
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <span
                                        className="font-bold text-cyan-900"
                                        title={liquidInfo.source === 'time_window' || liquidInfo.source === 'date_sequence' ? (isAr ? 'محسوب زمنياً حسب توقيت التعبئة' : 'Time-synced from vessel feeding window') : ''}
                                      >
                                        {liquidInfo.displayStr || '—'}
                                      </span>
                                      {liquidInfo.source && (liquidInfo.source === 'time_window' || liquidInfo.source === 'date_sequence') && (
                                        <span className="text-[9px] text-cyan-700 bg-cyan-100/70 px-1 rounded font-sans font-medium">
                                          {isAr ? 'توقيت' : 'Time'}
                                        </span>
                                      )}
                                      {isGeneralAdmin && !isTransferred && (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenTankOverrideModal(p)}
                                          className="p-0.5 text-cyan-700 hover:text-cyan-950 hover:bg-cyan-100 rounded transition cursor-pointer"
                                          title={isAr ? 'تعديل التانكات المرتبطة يدوياً (المسؤول العام)' : 'Override Tanks (Admin)'}
                                        >
                                          <Edit3 className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}

                              {!isTransferred && !isOrderLocked(linkedOrder) && (
                                <div className="pt-2 border-t border-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenTransferSinglePallet(group, p)}
                                    className="w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-lg text-[11px] font-black tracking-wide transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                                    title={isAr ? 'ترحيل هذه الباليتة منفردة لمستودع التام' : 'Transfer this single pallet to FG'}
                                  >
                                    <ArrowLeftRight className="h-3 w-3" />
                                    <span>{isAr ? 'ترحيل الباليتة للتام' : 'Transfer Pallet'}</span>
                                  </button>
                                </div>
                              )}
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

          {/* PANEL B: Staged Scrap & Defective Materials (Flexible Allocation with Partial Split) */}
          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-50 text-rose-700 rounded-2xl">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'خامات وتعبئة تحت الفرز والهالك بالصالة (بانتظار التخصيص والترحيل)' : 'Floor Staged Scrap & Defectives'}</span>
                    <span className="px-2.5 py-0.5 bg-rose-100 text-rose-900 rounded-full font-mono text-xs font-black">
                      {activeStagedFloorMaterials.length} {isAr ? 'بنود' : 'items'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAr
                      ? 'الخامات التالفة أو المرتجعة المسجلة بالصالة. يتيح النظام تخصيص وترحيل كامل أو جزئي لأي خامة إلى مستودع الهوالك أو المرتجعات.'
                      : 'Floor defectives logged during production. Supports flexible full or partial allocation to Scrap or Returns warehouse.'}
                  </p>
                </div>
              </div>
            </div>

            {activeStagedFloorMaterials.length === 0 ? (
              <div className="p-10 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400 opacity-60" />
                <p className="text-xs font-semibold">
                  {isAr ? 'لا توجد خامات تالفة أو هوالك متراكمة بالصالة حالياً.' : 'No materials currently staged on floor.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeStagedFloorMaterials.map((m) => {
                  const targetWh = warehouses.find((w) => w.id === m.targetWarehouseId);

                  return (
                    <div key={m.id} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-2xs hover:border-rose-300 transition">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-extrabold text-sm text-slate-900 block truncate">
                            {m.itemNameAr}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            [{m.itemCode || m.itemId}]
                          </span>
                        </div>
                        <span className="font-mono font-extrabold text-base text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                          {m.quantity} {m.unit}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {m.variantCode && (
                          <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold border border-slate-200">
                            {m.variantCode}
                          </span>
                        )}
                        {m.lotNumber && (
                          <span className="font-mono bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold">
                            LOT: {m.lotNumber}
                          </span>
                        )}
                        <span className="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                          {m.reason}
                        </span>
                      </div>

                      <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 text-[11px] space-y-1">
                        <div className="flex justify-between text-slate-500">
                          <span>{isAr ? 'أمر التشغيل:' : 'Work Order:'}</span>
                          <span className="font-mono font-bold text-slate-800">أمر #{m.orderNumber}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>{isAr ? 'المستودع المقترح:' : 'Proposed Wh:'}</span>
                          <span className="font-semibold text-indigo-700">{targetWh?.nameAr || m.targetWarehouseName || m.targetWarehouseId}</span>
                        </div>
                        {m.notes && (
                          <div className="text-slate-500 truncate pt-0.5 border-t border-slate-200/50">
                            {m.notes}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {m.loggedAt ? new Date(m.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} • {m.loggedBy}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenScrapAllocationModal(m)}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span>{isAr ? 'تخصيص وترحيل' : 'Allocate'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PALLET PASSPORT INSPECTION MODAL (Sub-Tab 2: Detailed Pop-up) */}
      {inspectPalletModal && (() => {
        const { order, pallet, pIdx } = inspectPalletModal;
        const isLocked = isOrderLocked(order);
        const isTransferred = pallet.stagingStatus === 'transferred_to_fg' || pallet.status === 'transferred_to_fg';

        const targetProc = productionProcesses.find(
          (p) => (p.id || p.processCode) === (pallet.processId || pallet.processCode || order.processId || order.processCode)
        );
        const processDisplayName = isAr
          ? (targetProc?.nameAr || pallet.processNameAr || order.processNameAr || pallet.processCode || 'خط تعبئة وتغليف قياسي')
          : (targetProc?.nameEn || targetProc?.nameAr || pallet.processNameEn || pallet.processCode || 'Standard Packaging Line');

        const pDate = pallet.productionDate || order.productionDate || order.orderDate || selectedPlanDate || new Date().toISOString().split('T')[0];
        const bRange = calculatePalletBatchRange(pDate, pallet.startTime, pallet.endTime);
        const displayBatchCode = pallet.batchRangeDisplay || bRange.displayRange || '---';

        const qcConfig = {
          passed: { bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500', label: isAr ? 'مطابق ومفحوص (Passed)' : 'QC Passed' },
          quarantine: { bg: 'bg-amber-50 text-amber-800 border-amber-300', dot: 'bg-amber-500', label: isAr ? 'تحت الفحص المعملي' : 'Quarantine' },
          rejected: { bg: 'bg-rose-50 text-rose-800 border-rose-300', dot: 'bg-rose-500', label: isAr ? 'مرفوض / غير مطابق' : 'Rejected' },
        }[pallet.qcStatus || 'passed'] || { bg: 'bg-slate-50 text-slate-800 border-slate-300', dot: 'bg-slate-400', label: pallet.qcStatus || 'QC' };

        const staffing = Array.isArray(pallet.stepStaffing) ? pallet.stepStaffing : [];

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-200">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-slate-900">
                        {isAr ? `جواز سفر الباليتة #${pallet.palletNumber || pIdx + 1}` : `Pallet Passport #${pallet.palletNumber || pIdx + 1}`}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${qcConfig.bg}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${qcConfig.dot}`} />
                        <span>{qcConfig.label}</span>
                      </span>
                      {isTransferred && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5 text-slate-500" />
                          <span>{isAr ? 'تم الاستلام بمستودع التام' : 'In FG'}</span>
                        </span>
                      )}
                      {isLocked && !isTransferred && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5 text-slate-400" />
                          <span>{isAr ? 'مقفل (تاريخ سابق)' : 'Locked'}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                      <span className="font-bold text-slate-800">{order.productNameAr}</span>
                      <span>•</span>
                      <span className="font-mono text-indigo-700 font-bold">أمر #{order.orderNumber}</span>
                      <span>•</span>
                      <span className="font-mono text-slate-400">{pDate}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectPalletModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Human-Readable Process Name (Highlighted Banner) */}
              <div className="p-3.5 bg-linear-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-2xs shrink-0">
                    <Workflow className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                      {isAr ? 'مسار التشغيل المعتمد' : 'Production Process'}
                    </span>
                    <span className="font-black text-sm text-indigo-950 block">
                      {processDisplayName}
                    </span>
                  </div>
                </div>
                {(targetProc?.processCode || pallet.processCode || order.processCode) && (
                  <span className="font-mono text-xs font-black bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-xl shadow-2xs self-start sm:self-center">
                    [{targetProc?.processCode || pallet.processCode || order.processCode}]
                  </span>
                )}
              </div>

              {/* Inkjet Continuous Batch Range */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-200 shrink-0">
                    <Printer className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 block">
                      {isAr ? 'كود تشغيلة الطباعة المستمر المحسوب (DDMMHHMM):' : 'Continuous Inkjet Batch Range:'}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {isAr ? 'محسوب آلياً بناءً على توقيت البدء والانتهاء' : 'Calculated continuously from pallet start and end time'}
                    </span>
                  </div>
                </div>
                <div className="font-mono font-bold text-xs text-rose-700 bg-white px-3 py-1.5 rounded-xl border border-rose-200 shadow-2xs text-center shrink-0">
                  {displayBatchCode}
                </div>
              </div>

              {/* Feeding Liquid Tanks (Time-Synced with Floor Vessel) */}
              {(() => {
                const liquidInfo = resolvePalletLiquidTanks(pallet, order);
                if (!liquidInfo.displayStr && !isGeneralAdmin) return null;
                return (
                  <div className="p-3.5 bg-linear-to-r from-cyan-50 to-sky-50 rounded-2xl border border-cyan-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-cyan-600 text-white rounded-xl shadow-2xs shrink-0">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-cyan-800 uppercase tracking-wider block">
                          {isAr ? 'الخزانات والتانكات المغذية (Floor Liquid Storage):' : 'Feeding Liquid Tanks (Floor Storage):'}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono font-black text-sm text-cyan-950">
                            {liquidInfo.displayStr || '—'}
                          </span>
                          {liquidInfo.source && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300 font-sans">
                              {liquidInfo.source === 'explicit'
                                ? (isAr ? 'معتمد ومحفوظ بالجواز' : 'Committed')
                                : liquidInfo.source === 'consumed_records'
                                  ? (isAr ? 'سجل استهلاك موثق' : 'Logged Consumption')
                                  : (isAr ? 'متزامن زمنياً مع الخزان' : 'Time-Synced')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isGeneralAdmin && !isTransferred && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectPalletModal(null);
                          handleOpenTankOverrideModal(pallet);
                        }}
                        className="px-3 py-1.5 bg-white border border-cyan-300 hover:bg-cyan-100 text-cyan-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs self-start sm:self-center"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تعديل التانك (Admin)' : 'Override Tank (Admin)'}</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Quantities & Stacking Timings */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block">
                    {isAr ? `الكمية بالكرتونة` : `Cartons Packed`}
                  </span>
                  <span className="font-mono font-black text-base text-slate-900 block">
                    {pallet.qtyLarge}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold block">
                    {order.outputLargeUnit || (isAr ? 'كرتونة' : 'Carton')}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block">
                    {isAr ? `إجمالي العبوات` : `Total Units`}
                  </span>
                  <span className="font-mono font-black text-base text-blue-700 block">
                    {pallet.qtySmall}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold block">
                    {order.outputSmallUnit || (isAr ? 'عبوة' : 'Unit')}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block">
                    {isAr ? 'وقت البدء' : 'Start Time'}
                  </span>
                  <span className="font-mono font-bold text-sm text-slate-800 block">
                    {pallet.startTime || '--:--'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold block">
                    {isAr ? 'بدء الرص' : 'Started'}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block">
                    {isAr ? 'وقت الاكتمال' : 'End Time'}
                  </span>
                  <span className="font-mono font-bold text-sm text-slate-800 block">
                    {pallet.endTime || '--:--'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold block">
                    {isAr ? 'جاهزة للنقل' : 'Completed'}
                  </span>
                </div>
              </div>

              {/* Crew & SOP Staffing Roster */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-700" />
                    <span className="font-extrabold text-xs text-slate-900">
                      {isAr ? 'طاقم العمل والخطوات التشغيلية المسندة:' : 'Crew & Assigned SOP Steps:'}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    {staffing.length} {isAr ? 'خطوات إنتاجية' : 'steps'}
                  </span>
                </div>

                {staffing.length === 0 ? (
                  <div className="text-center py-3 text-xs text-slate-400">
                    {isAr ? 'لا يوجد تفصيل لخطوات الطاقم المسجلة على هذه الباليتة' : 'No step staffing details recorded.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {staffing.map((step) => {
                      const workersList = Array.isArray(step.workers) ? step.workers : [];
                      return (
                        <div key={step.stepNum} className="p-2.5 bg-white rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-mono text-[11px] flex items-center justify-center font-bold">
                                {step.stepNum}
                              </span>
                              <span>{step.stepName}</span>
                            </span>
                            {step.mandatory && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded">
                                {isAr ? 'إلزامي' : 'Req'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {workersList.length === 0 ? (
                              <span className="text-[10px] text-slate-400 italic">
                                {isAr ? 'لم يسند عمال' : 'Unassigned'}
                              </span>
                            ) : (
                              workersList.map((w, wIdx) => (
                                <span
                                  key={wIdx}
                                  className="px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-md text-[10px] font-bold flex items-center gap-1"
                                >
                                  <User className="h-2.5 w-2.5 text-indigo-600" />
                                  <span>{typeof w === 'string' ? w : (w.name || w.workerName || 'عامل')}</span>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pallet Photo Thumbnail (if attached) */}
              {pallet.imageUrl && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={pallet.imageUrl}
                      alt="Pallet Snapshot"
                      onClick={() => setImagePreviewModal({
                        url: pallet.imageUrl,
                        title: isAr ? `معاينة صورة الباليتة #${pallet.palletNumber || pIdx + 1}` : `Pallet #${pallet.palletNumber || pIdx + 1} Photo`,
                        subtitle: `${order.productNameAr} • ${pallet.qtyLarge} ${order.outputLargeUnit || ''}`
                      })}
                      className="h-16 w-20 rounded-xl object-cover border border-slate-200 shadow-2xs cursor-pointer hover:opacity-95 transition"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">
                        {isAr ? 'صورة توثيق الباليتة' : 'Pallet Photo Attachment'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {isAr ? 'انقر على الصورة للتكبير والمعاينة بالحجم الكامل' : 'Click to preview full-size photo'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImagePreviewModal({
                      url: pallet.imageUrl,
                      title: isAr ? `معاينة صورة الباليتة #${pallet.palletNumber || pIdx + 1}` : `Pallet #${pallet.palletNumber || pIdx + 1} Photo`,
                      subtitle: `${order.productNameAr} • ${pallet.qtyLarge} ${order.outputLargeUnit || ''}`
                    })}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{isAr ? 'معاينة' : 'Preview'}</span>
                  </button>
                </div>
              )}

              {/* Optional Notes */}
              {pallet.notes && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl text-xs space-y-1">
                  <span className="font-bold text-amber-900 block">{isAr ? 'ملاحظات:' : 'Notes:'}</span>
                  <p className="text-amber-800 leading-relaxed">{pallet.notes}</p>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setInspectPalletModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>

                <div className="flex items-center gap-2">
                  {isGeneralAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setInspectPalletModal(null);
                        handleOpenAdminPalletMenu(order, pallet, pIdx);
                      }}
                      className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title={isAr ? 'خيارات الإدارة العامة المتقدمة (تعديل / إلغاء)' : 'General Admin Advanced Actions'}
                    >
                      <ShieldAlert className="h-3.5 w-3.5 text-purple-600" />
                      <span>{isAr ? 'إجراءات الإدارة العامة' : 'Admin Actions'}</span>
                    </button>
                  )}

                  {!isTransferred && (
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => {
                        setInspectPalletModal(null);
                        handleDeletePallet(order, pIdx);
                      }}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isLocked ? (isAr ? 'مقفل (تاريخ سابق)' : 'Order locked') : (isAr ? 'حذف الباليتة' : 'Delete Pallet')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isAr ? 'حذف الباليتة' : 'Delete'}</span>
                    </button>
                  )}

                  {!isTransferred && (
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => {
                        setInspectPalletModal(null);
                        handleOpenEditPallet(order, pIdx);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isLocked ? (isAr ? 'مقفل (تاريخ سابق)' : 'Order locked') : (isAr ? 'تعديل بيانات الباليتة' : 'Edit Pallet')}
                    >
                      {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                      <span>{isAr ? 'تعديل الباليتة' : 'Edit Pallet'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PALLET PASSPORT MODAL (Sub-Tab 2) */}
      {showPalletModal && palletTargetOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-6 max-h-[92vh] overflow-y-auto">
            <div className="sticky -top-6 -mt-6 pt-6 bg-white z-20 flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {editingPalletIndex !== null ? (isAr ? 'تعديل بيانات الباليتة وطاقم العمل' : 'Edit Pallet & Crew') : (isAr ? 'إدراج باليتة إنتاج وطاقم العمل' : 'Pallet Passport & Crew Roster')}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
                    <span>{palletTargetOrder.productNameAr} • #{palletTargetOrder.orderNumber}</span>
                    {palletTargetOrder.isRework && (() => {
                      const orig = getOriginalReturnQty(palletTargetOrder);
                      return orig ? (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 rounded-md font-bold text-[10px] inline-flex items-center gap-1">
                          <RotateCcw className="h-3 w-3 text-purple-600" />
                          <span>{isAr ? 'أصل المرتجع:' : 'Orig Return:'} {orig.qtyLarge} {orig.largeUnit} ({orig.qtySmall} {orig.smallUnit})</span>
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowPalletModal(false);
                  setIsAdminPalletAction(false);
                  setAdminPalletReason('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePalletPassport} className="space-y-4 text-xs">
              {isAdminPalletAction && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl flex items-center gap-2.5 text-xs text-purple-900">
                  <ShieldAlert className="h-5 w-5 text-purple-600 shrink-0" />
                  <div>
                    <span className="font-bold block">
                      {isAr ? 'وضع التعديل الإداري المتقدم (تجاوز الأقفال وإعادة الموازنة)' : 'Admin Override Mode (Bypassing Locks & Re-balancing)'}
                    </span>
                    <span className="text-[11px] text-purple-700">
                      {isAr ? 'سيتم إلغاء خصومات الباليتة السابقة من الخامات والتنكات وتطبيق القيم الجديدة بالكامل دون ترك أرصدة يتيمة.' : 'Previous raw materials and tank liquid deductions will be cleanly rolled back and re-applied.'}
                    </span>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'رقم الباليتة *' : 'Pallet Number *'}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={palletFormData.palletNumber}
                    onChange={(e) => setPalletFormData({ ...palletFormData, palletNumber: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold text-center text-sm bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'حالة الجودة (QC Stamp) *' : 'QC Inspection *'}</label>
                  <select
                    value={palletFormData.qcStatus}
                    onChange={(e) => setPalletFormData({ ...palletFormData, qcStatus: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white"
                  >
                    <option value="passed">🟢 {isAr ? 'مطابق ومفحوص (Passed)' : 'Passed'}</option>
                    <option value="quarantine">🟡 {isAr ? 'تحت الفحص المعملي' : 'Quarantine'}</option>
                    <option value="rejected">🔴 {isAr ? 'مرفوض / غير مطابق' : 'Rejected'}</option>
                  </select>
                </div>
              </div>

              {/* Quantities */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    {isAr ? `الكمية بالكرتونة (${palletTargetOrder.outputLargeUnit}): *` : `Cartons Packed: *`}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={palletFormData.qtyLarge}
                    onChange={(e) => {
                      const l = Number(e.target.value);
                      const ratio = Number(palletTargetOrder.packagingRatio) || 12;
                      setPalletFormData({ ...palletFormData, qtyLarge: l, qtySmall: l * ratio });
                    }}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center text-sm"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    {isAr ? `إجمالي العبوات (${palletTargetOrder.outputSmallUnit}): *` : `Total Units: *`}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={palletFormData.qtySmall}
                    onChange={(e) => {
                      const s = Number(e.target.value);
                      const ratio = Number(palletTargetOrder.packagingRatio) || 12;
                      setPalletFormData({ ...palletFormData, qtySmall: s, qtyLarge: Number((s / ratio).toFixed(2)) });
                    }}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center text-sm text-blue-700"
                  />
                </div>
              </div>

              {/* Wrapping Machine Selector */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800 flex items-center justify-between">
                  <span>{isAr ? 'ماكينة التغليف والشرنك *' : 'Wrapping Machine *'}</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    {isAr ? '(تتابع أوقات الرص تلقائياً لكل ماكينة)' : '(Auto-sequences start time per machine)'}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectWrappingMachine('wrapping_1')}
                    className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      palletFormData.wrappingMachine === 'wrapping_1'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>🔘</span>
                    <span className="truncate">{isAr ? 'ماكينة تغليف 1' : 'Wrapping 1'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectWrappingMachine('wrapping_2')}
                    className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      palletFormData.wrappingMachine === 'wrapping_2'
                        ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>🔘</span>
                    <span className="truncate">{isAr ? 'ماكينة تغليف 2' : 'Wrapping 2'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectWrappingMachine('no_shrink')}
                    className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      palletFormData.wrappingMachine === 'no_shrink'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>🔘</span>
                    <span className="truncate">{isAr ? 'بدون شرنك' : 'No Shrink'}</span>
                  </button>
                </div>
              </div>

              {/* Stacking Timestamps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'وقت بدء الرص والتعبئة *' : 'Start Time *'}</label>
                  <input
                    type="time"
                    required
                    value={palletFormData.startTime}
                    onChange={(e) => setPalletFormData({ ...palletFormData, startTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">{isAr ? 'وقت اكتمال الباليتة *' : 'End Time *'}</label>
                    <button
                      type="button"
                      onClick={() => {
                        const now = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
                        setPalletFormData((prev) => ({ ...prev, endTime: now }));
                      }}
                      className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[10px] font-bold transition cursor-pointer"
                      title={isAr ? 'تثبيت التوقيت الحالي' : 'Set to current time'}
                    >
                      {isAr ? 'الآن' : 'Now'}
                    </button>
                  </div>
                  <input
                    type="time"
                    required
                    value={palletFormData.endTime}
                    onChange={(e) => setPalletFormData({ ...palletFormData, endTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center"
                  />
                </div>
              </div>

              {/* Calculated Inkjet Batch Code Range */}
              {(() => {
                const pDate = palletTargetOrder.productionDate || palletTargetOrder.orderDate || selectedPlanDate || new Date().toISOString().split('T')[0];
                const bRange = calculatePalletBatchRange(pDate, palletFormData.startTime, palletFormData.endTime);
                return (
                  <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-200 shrink-0">
                        <Printer className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 block">
                          {isAr ? 'كود تشغيلة الطباعة المحسوب (DDMMHHMM):' : 'Calculated Inkjet Batch Range:'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {isAr ? 'يتم احتساب كود الطباعة المستمر بناءً على توقيت البدء والانتهاء' : 'Derived continuously from start and end time'}
                        </span>
                      </div>
                    </div>
                    <div className="font-mono font-bold text-xs text-rose-700 bg-white px-3 py-1.5 rounded-xl border border-rose-200 shadow-2xs text-center shrink-0">
                      {bRange.displayRange}
                    </div>
                  </div>
                );
              })()}

              {/* CONFIRMED PRODUCTION PROCESS & STEP STAFFING */}
              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-200/70 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-indigo-700" />
                    <div>
                      <span className="font-extrabold text-xs text-indigo-950 block">
                        {isAr ? 'مسار التشغيل المعتمد للباليتة (Confirmed Process):' : 'Confirmed Production Process:'}
                      </span>
                      <span className="text-[10px] text-indigo-700">
                        {palletTargetOrder.processCode ? (isAr ? `المحدد بالخطة: [${palletTargetOrder.processCode}] ${palletTargetOrder.processNameAr}` : `Planned: ${palletTargetOrder.processCode}`) : (isAr ? 'لم يحدد بالخطة' : 'Not set in plan')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={palletFormData.processId}
                      onChange={(e) => handlePalletProcessChange(e.target.value)}
                      className="p-2 text-xs font-bold border border-indigo-300 rounded-xl bg-white text-indigo-950 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                    >
                      <option value="">{isAr ? '-- اختر مسار التشغيل --' : '-- Select Process --'}</option>
                      {productionProcesses.filter((p) => p.status !== 'inactive').map((p) => (
                        <option key={p.id || p.processCode} value={p.id || p.processCode}>
                          [{p.processCode}] {p.nameAr || p.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mandatory Step Completion Status Alert */}
                {(() => {
                  const staffing = palletFormData.stepStaffing || [];
                  const missingMandatory = staffing.filter((s) => s.mandatory && (!s.workers || s.workers.length === 0));
                  if (missingMandatory.length > 0) {
                    return (
                      <div className="p-2.5 bg-rose-100/90 border border-rose-300 rounded-xl flex items-center gap-2 text-rose-900 text-xs shadow-2xs animate-pulse">
                        <AlertCircle className="h-4 w-4 text-rose-700 shrink-0" />
                        <span className="font-bold">
                          {isAr
                            ? `⚠️ تنبيه إلزامي: يوجد (${missingMandatory.length}) خطوات تشغيل إلزامية لم يُسند إليها عمال! لا يمكن حفظ الباليتة حتى يتم تعيين عامل واحد على الأقل لكل خطوة إلزامية.`
                            : `Mandatory Step Alert: (${missingMandatory.length}) mandatory steps need assigned workers to save.`}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-2 text-emerald-900 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-bold">
                        {isAr ? '✓ تم تعيين طاقم العمل لكافة الخطوات الإلزامية بنجاح.' : 'All mandatory steps have assigned workers.'}
                      </span>
                    </div>
                  );
                })()}

                {/* Step Staffing List */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {(!palletFormData.stepStaffing || palletFormData.stepStaffing.length === 0) ? (
                    <div className="p-4 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                      {isAr ? 'يرجى اختيار مسار تشغيل لعرض خطواته وتعيين الطاقم.' : 'Please select a process to view steps.'}
                    </div>
                  ) : (
                    palletFormData.stepStaffing.map((step) => {
                      const isStepAssigned = (step.workers || []).length > 0;
                      return (
                        <div
                          key={step.stepNum}
                          className={`p-3 rounded-xl border transition-all ${
                            step.mandatory && !isStepAssigned
                              ? 'bg-rose-50/50 border-rose-300 shadow-2xs'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                                step.mandatory && !isStepAssigned
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {step.stepNum}
                              </span>
                              <div>
                                <span className="font-bold text-slate-900 text-xs">{step.stepName}</span>
                                {step.stepDesc && (
                                  <span className="text-[10px] text-slate-400 block font-normal">{step.stepDesc}</span>
                                )}
                              </div>
                            </div>

                            <div>
                              {step.mandatory ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-1 ${
                                  isStepAssigned
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                                }`}>
                                  {isAr ? (isStepAssigned ? '✓ إلزامي (مكتمل)' : '⚠️ إلزامي (مطلوب)') : (isStepAssigned ? '✓ Mandatory' : '⚠️ Mandatory')}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  {isAr ? 'اختياري' : 'Optional'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Assigned Worker Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 min-h-[32px] p-1.5 bg-slate-50 rounded-lg border border-dashed border-slate-200 mb-2">
                            {(step.workers || []).length === 0 ? (
                              <span className="text-[11px] text-slate-400 italic">
                                {step.mandatory ? (isAr ? '⚠️ يجب تعيين عامل واحد على الأقل' : 'Must assign at least 1 worker') : (isAr ? 'لم يُسند عمال (اختياري)' : 'Optional')}
                              </span>
                            ) : (
                              (step.workers || []).map((w) => (
                                <span
                                  key={w.workerId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-md text-[11px] font-bold"
                                >
                                  <User className="h-3 w-3 text-indigo-600" />
                                  <span>{w.workerName}</span>
                                  {w.isManual && <span className="text-[9px] text-amber-600 font-mono">({isAr ? 'مؤقت' : 'manual'})</span>}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleWorkerInPalletStep(step.stepNum, { id: w.workerId, name: w.workerName, isManual: w.isManual })}
                                    className="hover:text-rose-600 p-0.5 cursor-pointer"
                                    title={isAr ? 'إزالة العامل من هذه الخطوة' : 'Remove worker'}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>

                          {/* Dropdown to assign worker + Quick Add */}
                          <div className="flex items-center gap-2">
                            <select
                              value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const found = combinedWorkerPool.find((w) => w.id === e.target.value);
                                if (found) handleToggleWorkerInPalletStep(step.stepNum, found);
                              }}
                              className="flex-1 p-1.5 text-[11px] border border-slate-200 rounded-lg bg-white font-medium focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">{isAr ? '+ إضافة عامل للخطوة...' : '+ Assign worker to step...'}</option>
                              {combinedWorkerPool.map((w) => {
                                const isAlreadyAssigned = (step.workers || []).some((sw) => sw.workerId === w.id);
                                return (
                                  <option key={w.id} value={w.id} disabled={isAlreadyAssigned}>
                                    {isAlreadyAssigned ? '✓ ' : ''}{w.name} {w.isManual ? (isAr ? '(مؤقت)' : '(manual)') : `[${w.role || w.department}]`}
                                  </option>
                                );
                              })}
                            </select>

                            <button
                              type="button"
                              onClick={() => {
                                setQuickWorkerTargetContext({ type: 'pallet', stepNum: step.stepNum });
                                setShowQuickWorkerModal(true);
                              }}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                              title={isAr ? 'إضافة عامل مؤقت جديد' : 'Quick add worker'}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>{isAr ? 'جديد' : 'New'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'ملاحظات الباليتة' : 'Pallet Notes'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'ملاحظات اختيارية عن الباليتة...' : 'Optional notes...'}
                  value={palletFormData.notes}
                  onChange={(e) => setPalletFormData({ ...palletFormData, notes: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-white text-xs"
                />
              </div>

              {/* Optional Pallet Snapshot / Picture */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'صورة الباليتة (اختياري)' : 'Pallet Picture (Optional)'}</span>
                  </label>
                  {palletFormData.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setPalletFormData({ ...palletFormData, imageUrl: '' })}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800 transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>{isAr ? 'إزالة الصورة' : 'Remove Photo'}</span>
                    </button>
                  )}
                </div>

                {palletFormData.imageUrl ? (
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <img
                        src={palletFormData.imageUrl}
                        alt="Pallet Snapshot"
                        className="h-28 w-36 rounded-xl object-cover border border-slate-200 shadow-2xs cursor-pointer hover:opacity-95"
                        onClick={() => setImagePreviewModal({
                          url: palletFormData.imageUrl,
                          title: isAr ? `معاينة صورة الباليتة #${palletFormData.palletNumber}` : `Pallet #${palletFormData.palletNumber} Photo`,
                          subtitle: `${palletTargetOrder.productNameAr} • ${palletFormData.qtyLarge} ${palletTargetOrder.outputLargeUnit}`
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setImagePreviewModal({
                          url: palletFormData.imageUrl,
                          title: isAr ? `معاينة صورة الباليتة #${palletFormData.palletNumber}` : `Pallet #${palletFormData.palletNumber} Photo`,
                          subtitle: `${palletTargetOrder.productNameAr} • ${palletFormData.qtyLarge} ${palletTargetOrder.outputLargeUnit}`
                        })}
                        className="absolute bottom-2 end-2 px-1.5 py-0.5 bg-black/60 hover:bg-black text-white rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        <Eye className="h-3 w-3" />
                        <span>{isAr ? 'تكبير' : 'View'}</span>
                      </button>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1">
                      <p className="font-medium text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? 'تم إرفاق صورة الباليتة بنجاح' : 'Photo attached successfully'}</span>
                      </p>
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-indigo-700 cursor-pointer transition shadow-2xs">
                        <Camera className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تغيير الصورة' : 'Change Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const compressed = await compressImage(file, 800, 800, 0.75);
                              setPalletFormData((prev) => ({ ...prev, imageUrl: compressed }));
                            } catch (err) {
                              console.error('Failed to process pallet image:', err);
                              alert(isAr ? 'فشل معالجة الصورة.' : 'Failed to process image.');
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="flex flex-col sm:flex-row items-center justify-center gap-2 p-3 bg-white hover:bg-slate-100/70 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl transition cursor-pointer text-slate-600 text-xs font-bold text-center">
                      <UploadCloud className="h-5 w-5 text-indigo-600" />
                      <span>{isAr ? 'التقاط صورة للباليتة بكاميرا الموبايل أو اختيار ملف...' : 'Snap photo with camera or choose image file...'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const compressed = await compressImage(file, 800, 800, 0.75);
                            setPalletFormData((prev) => ({ ...prev, imageUrl: compressed }));
                          } catch (err) {
                            console.error('Failed to process pallet image:', err);
                            alert(isAr ? 'فشل معالجة الصورة.' : 'Failed to process image.');
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {isAdminPalletAction && (
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-1.5">
                  <label className="block font-bold text-purple-900 text-xs flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-purple-600" />
                    <span>{isAr ? 'سبب التعديل الإداري (إلزامي للتوثيق المالي - 5 أحرف على الأقل) *' : 'Admin Modification Reason (Mandatory - min 5 chars) *'}</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={adminPalletReason}
                    onChange={(e) => setAdminPalletReason(e.target.value)}
                    placeholder={isAr ? 'مثال: تعديل عدد الكراتين وتصحيح الخطأ المسجل في الوردية...' : 'e.g. Correcting carton count error recorded during shift...'}
                    className="w-full p-2 border border-purple-300 rounded-xl bg-white text-xs focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowPalletModal(false);
                    setIsAdminPalletAction(false);
                    setAdminPalletReason('');
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving || (isAdminPalletAction && (!adminPalletReason || adminPalletReason.trim().length < 5))}
                  className={`px-6 py-2 rounded-xl font-bold shadow-xs flex items-center gap-1.5 text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isAdminPalletAction ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isAdminPalletAction ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>{isAdminPalletAction ? (isAr ? 'تأكيد التعديل الإداري' : 'Apply Admin Edit') : (isAr ? 'حفظ وتأكيد الباليتة' : 'Save Pallet')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PLAN ASSIGNMENT MODAL (Sub-Tab 1) - HIGH CONTRAST MODULAR CARDS */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-6xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header with Subtle Micro-MO Badge */}
            <div className="sticky -top-7 -mt-7 pt-7 bg-white z-20 flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {editingPlanOrder ? (isAr ? 'تعديل الصنف بخطة الإنتاج' : 'Edit Plan Order') : (isAr ? 'إدراج تشغيلة جديدة بخطة الإنتاج' : 'Assign Batch to Production Plan')}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isAr ? 'تحديد المنتج، خيار التعبئة، والكميات، ومستوى الأهمية والمطابقة' : 'Specify finished good, packaging option, batch targets, and priority'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Subtle Header MO Chip with Micro Copy Button */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-mono text-slate-600 shadow-2xs">
                  <span className="font-bold text-slate-800">{planFormData.orderNumber}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(planFormData.orderNumber);
                      setCopiedId(planFormData.orderNumber);
                      setTimeout(() => setCopiedId(null), 1800);
                    }}
                    className="p-0.5 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                    title={isAr ? 'نسخ رقم أمر التشغيل' : 'Copy MO ID'}
                  >
                    {copiedId === planFormData.orderNumber ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  {copiedId === planFormData.orderNumber && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 animate-in fade-in">
                      {isAr ? 'تم النسخ' : 'Copied'}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Special Rework Order Context Banner */}
            {planFormData.isRework && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm flex items-center gap-2">
                      <span>{isAr ? 'أمر تشغيل تصليح ومرتجع إنتاج (Rework Order)' : 'Rework Production Order'}</span>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md font-bold text-[10px]">
                        {isAr ? 'تصليح معيب' : 'Rework'}
                      </span>
                      {planFormData.detectedFromOrderNumber && (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-indigo-600" />
                          <span>{isAr ? `تطابق خامات تشغيلة سابقة #${planFormData.detectedFromOrderNumber}` : `Matched run #${planFormData.detectedFromOrderNumber}`}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-amber-800 mt-1">
                      {isAr
                        ? `مرتبط بإشعارات المرتجع: ${(planFormData.reworkSourceVouchers || []).join('، ')} | العيوب المسجلة: ${(planFormData.reworkFaultTags || []).join('، ')}`
                        : `Vouchers: ${(planFormData.reworkSourceVouchers || []).join(', ')} | Tags: ${(planFormData.reworkFaultTags || []).join(', ')}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {planFormData.originalReturnQtySmall != null && (
                    <div className="px-3 py-1.5 bg-purple-100 border border-purple-300 rounded-xl text-end font-bold text-purple-950 shadow-2xs">
                      <span className="text-[10px] block text-purple-700 flex items-center gap-1 justify-end">
                        <RotateCcw className="h-3 w-3" />
                        <span>{isAr ? 'أصل المرتجع المستلم:' : 'Original Return Received:'}</span>
                      </span>
                      <span className="font-mono text-xs text-purple-950 font-black">
                        {planFormData.originalReturnQtyLarge != null ? planFormData.originalReturnQtyLarge : parseFloat((planFormData.originalReturnQtySmall / (planFormData.packagingRatio || 12)).toFixed(4))} {isAr ? 'كرتونة' : 'ctns'}
                        {' '}<span className="font-normal text-purple-700">({planFormData.originalReturnQtySmall} {isAr ? 'عبوة' : 'units'})</span>
                      </span>
                    </div>
                  )}

                  {Number(planFormData.missingSmallUnits) > 0 && (
                    <div className="px-3 py-1.5 bg-amber-100/80 border border-amber-300 rounded-xl text-end font-bold text-amber-900">
                      <span className="text-[10px] block text-amber-800">{isAr ? 'نواقص لإكمال الكراتين:' : 'Missing units to complete:'}</span>
                      <span className="font-mono text-xs text-amber-950 font-black">
                        +{planFormData.missingSmallUnits} {isAr ? 'عبوة مطلوبة' : 'units'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSavePlanOrder} className="space-y-4 text-xs">
              {/* SECTION 1: TARGET FINISHED SKU, PACKAGING OPTION & BOM RECIPE */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-blue-600" />
                    <span>{isAr ? '١. المنتج التام، خيار التعبئة، والتركيبة (Target SKU & BOM):' : '1. Target SKU, Packaging Option & Recipe:'}</span>
                  </span>
                  {planFormData.finishedProductId && (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                      <span>SKU: {planFormData.finishedProductId}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(planFormData.finishedProductId);
                          setCopiedId(planFormData.finishedProductId);
                          setTimeout(() => setCopiedId(null), 1800);
                        }}
                        className="p-0.5 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                        title={isAr ? 'نسخ كود الصنف' : 'Copy SKU'}
                      >
                        {copiedId === planFormData.finishedProductId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  {/* Artwork Preview Thumbnail */}
                  <div className="lg:col-span-4 flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    {(() => {
                      const prod = finishedProducts.find((p) => p.code === planFormData.finishedProductId);
                      const opt = (prod?.packagingOptions || []).find((o) => o.suffix === planFormData.packagingOptionSuffix);
                      const resolvedImg = opt?.imageFile || prod?.imageFile || '';

                      return (
                        <>
                          {resolvedImg ? (
                            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden group/modalimg">
                              <img
                                src={resolvedImg}
                                alt="Product Artwork"
                                onClick={() => setImagePreviewModal({
                                  url: resolvedImg,
                                  title: `${prod?.nameAr || ''} - ${opt?.nameAr || ''}`,
                                  subtitle: `${prod?.code || ''} • ${opt?.suffix || ''}`
                                })}
                                className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                title={isAr ? 'انقر للمعاينة' : 'Click to preview'}
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
                              <Package className="h-6 w-6" />
                            </div>
                          )}
                          <div className="truncate">
                            <span className="font-bold text-slate-900 block text-xs truncate">
                              {prod?.nameAr || (isAr ? 'لم يتم تحديد صنف' : 'No SKU Selected')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {opt?.nameAr || (isAr ? 'العبوة القياسية' : 'Standard')} {opt?.packagingRatio ? `(شدة: ${opt.packagingRatio})` : ''}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Product Searchable Select */}
                  <div className="lg:col-span-8">
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'المنتج التام المستهدف *' : 'Target Finished Good *'}</label>
                    <SearchableSelect
                      value={planFormData.finishedProductId}
                      onChange={handlePlanProductChange}
                      options={finishedProducts.map((p) => ({
                        value: p.code,
                        label: p.nameAr,
                        sublabel: p.code,
                      }))}
                      placeholder={isAr ? '-- اختر المنتج التام --' : '-- Select Finished Product --'}
                      isAr={isAr}
                      required
                    />
                  </div>
                </div>

                {/* Packaging Option & BOM Recipe Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'خيار وتصميم العبوة *' : 'Packaging Option *'}</label>
                    <select
                      value={planFormData.packagingOptionSuffix}
                      onChange={(e) => handlePlanOptionChange(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500"
                    >
                      {(() => {
                        const prod = finishedProducts.find((p) => p.code === planFormData.finishedProductId);
                        const options = prod?.packagingOptions || [{ suffix: 'A', nameAr: 'التصميم القياسي' }];
                        return options.map((opt) => (
                          <option key={opt.suffix} value={opt.suffix}>
                            [{opt.suffix}] {opt.nameAr || `خيار ${opt.suffix}`} (شدة: {opt.packagingRatio || prod?.packagingRatio || 12})
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'تركيبة الإنتاج (BOM Recipe) *' : 'BOM Recipe *'}</label>
                    <select
                      value={planFormData.bomRecipeId}
                      onChange={(e) => setPlanFormData({ ...planFormData, bomRecipeId: e.target.value, componentSelections: {} })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-indigo-900 text-xs focus:ring-2 focus:ring-indigo-500"
                      required
                    >
                      {availableBomRecipesForPlan.length === 0 ? (
                        <option value="">{isAr ? '-- لا توجد تركيبة مسجلة لهذا الصنف --' : '-- No Recipe Found --'}</option>
                      ) : (
                        availableBomRecipesForPlan.map((rec) => (
                          <option key={rec.code || rec.id} value={rec.code || rec.id}>
                            [{rec.code}] {rec.nameAr || rec.nameEn} {rec.scopeType === 'option_specific' ? `[${rec.packagingOptionSuffix}]` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: PRODUCTION TARGETS, SHIFT DATE & SEQUENCE */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <Boxes className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '٢. الكميات المستهدفة والجدولة (Targets & Sequence):' : '2. Production Targets & Execution Schedule:'}</span>
                  </span>
                </div>

                {/* Prominent Original Return Qty Breakdown for Rework Orders */}
                {planFormData.isRework && planFormData.originalReturnQtySmall != null && (
                  <div className="p-3 bg-purple-50/90 border border-purple-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-purple-900">
                      <RotateCcw className="h-4 w-4 text-purple-600 shrink-0" />
                      <span className="font-bold">
                        {isAr ? 'أصل كمية المرتجع المستلمة من العميل:' : 'Original Received Return Quantity:'}
                      </span>
                      <span className="font-mono font-black text-purple-950 bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200">
                        {planFormData.originalReturnQtyLarge != null ? planFormData.originalReturnQtyLarge : parseFloat((planFormData.originalReturnQtySmall / (planFormData.packagingRatio || 12)).toFixed(4))} {isAr ? 'كرتونة' : 'Cartons'} ({planFormData.originalReturnQtySmall} {isAr ? 'عبوة' : 'units'})
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-700 font-medium">
                      {Number(planFormData.missingSmallUnits) > 0 ? (
                        <span>
                          {isAr
                            ? `الكمية المخططة أدناه (${planFormData.plannedQtyLarge} كرتونة) تشمل استكمال الكسر بعدد +${planFormData.missingSmallUnits} عبوة جديدة.`
                            : `Planned target below (${planFormData.plannedQtyLarge} cartons) includes topping up the fraction by +${planFormData.missingSmallUnits} new units.`}
                        </span>
                      ) : (
                        <span>
                          {isAr
                            ? 'الكمية المخططة مطابقة تماماً للمرتجع المستلم.'
                            : 'Planned target matches the received return quantity.'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Material Bottleneck Alert Banner with 1-Click Cap Action */}
                {planBottleneckInfo && planBottleneckInfo.deficitCartons > 0 && (
                  <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-xl space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="font-extrabold text-amber-950 text-xs">
                          {isAr ? 'تنبيه اختناق الطاقة الإنتاجية (Material Bottleneck Alert):' : 'Material Bottleneck Alert:'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePlanQtyChange('plannedQtyLarge', planBottleneckInfo.maxProducibleCartons)}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-bold shadow-2xs flex items-center gap-1 transition cursor-pointer"
                      >
                        <Zap className="h-3 w-3" />
                        <span>
                          {isAr
                            ? `تقليص فوري للحد الأقصى المتاح (${planBottleneckInfo.maxProducibleCartons} كرتونة)`
                            : `Cap to available stock (${planBottleneckInfo.maxProducibleCartons} ctns)`}
                        </span>
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                      {isAr
                        ? `الكمية المخططة (${planBottleneckInfo.plannedCartons} كرتونة) تتجاوز الرصيد المتاح للوط/التنوع المحدد لخامة [${planBottleneckInfo.bottleneckComps.map((b) => b.materialNameAr).join(', ')}]. أقصى كمية يمكن إنتاجها دون توقف هي (${planBottleneckInfo.maxProducibleCartons} كرتونة) بعجز قدره (-${planBottleneckInfo.deficitCartons} كرتونة). عند الحفظ سيتاح لك تقسيم الأمر تلقائياً.`
                        : `Planned target (${planBottleneckInfo.plannedCartons} cartons) exceeds available stock for [${planBottleneckInfo.bottleneckComps.map((b) => b.materialNameAr).join(', ')}]. Maximum producible without interruption is (${planBottleneckInfo.maxProducibleCartons} ctns) with a shortfall of (-${planBottleneckInfo.deficitCartons} ctns).`}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {/* Cartons Target */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">{isAr ? 'الكمية بالكرتونة *' : 'Target Cartons *'}</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={planFormData.plannedQtyLarge}
                      onChange={(e) => handlePlanQtyChange('plannedQtyLarge', e.target.value)}
                      className="w-full p-2 border-2 border-emerald-400 rounded-xl bg-white font-mono font-bold text-center text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                    {planFormData.isRework && planFormData.originalReturnQtySmall != null && (
                      <span className="text-[10px] text-purple-700 font-bold block mt-1">
                        {isAr ? 'أصل المرتجع:' : 'Orig Return:'}{' '}
                        <b className="font-mono">
                          {planFormData.originalReturnQtyLarge != null
                            ? planFormData.originalReturnQtyLarge
                            : parseFloat((planFormData.originalReturnQtySmall / (planFormData.packagingRatio || 12)).toFixed(4))}{' '}
                          {isAr ? 'كرتونة' : 'ctns'}
                        </b>
                      </span>
                    )}
                  </div>

                  {/* Units Equivalent Target */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">{isAr ? 'إجمالي العبوات المكافئة *' : 'Total Units *'}</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={planFormData.plannedQtySmall}
                      onChange={(e) => handlePlanQtyChange('plannedQtySmall', e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center text-sm text-blue-700 focus:ring-2 focus:ring-blue-500"
                    />
                    {planFormData.isRework && planFormData.originalReturnQtySmall != null && (
                      <span className="text-[10px] text-purple-700 font-bold block mt-1">
                        {isAr ? 'أصل المرتجع:' : 'Orig Return:'}{' '}
                        <b className="font-mono">{planFormData.originalReturnQtySmall} {isAr ? 'عبوة' : 'units'}</b>
                      </span>
                    )}
                  </div>

                  {/* Planned Shift Date */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'تاريخ التشغيل المخطط *' : 'Planned Date *'}</label>
                    <input
                      type="date"
                      required
                      value={planFormData.planDate}
                      onChange={(e) => setPlanFormData({ ...planFormData, planDate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Suggested Execution Sequence */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>{isAr ? 'الترتيب المقترح للتنفيذ *' : 'Execution Sequence *'}</span>
                      <span className="text-[10px] text-slate-400 font-normal">#{planFormData.importanceRank}</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={planFormData.importanceRank}
                      onChange={(e) => setPlanFormData({ ...planFormData, importanceRank: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-extrabold text-center text-sm text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: OPERATIONAL CONSTRAINTS & REMARKS (ZERO EMOJIS, HIGH CONTRAST) */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? '٣. محددات الأولوية والمطابقة والملاحظات (Execution Rules):' : '3. Priority, Exactness & Remarks:'}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Priority Level */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'مستوى الأهمية والأولوية *' : 'Priority Level *'}</label>
                    <select
                      value={planFormData.priority}
                      onChange={(e) => setPlanFormData({ ...planFormData, priority: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="urgent">{isAr ? 'مستعجل (Urgent)' : 'Urgent'}</option>
                      <option value="important">{isAr ? 'مهم (Important)' : 'Important'}</option>
                      <option value="today">{isAr ? 'خلال اليوم (Today - الافتراضي)' : 'Today (Default)'}</option>
                      <option value="prep_and_run">{isAr ? 'تجهيز وتشغيل إن أمكن (Prep & Run)' : 'Prep & Run'}</option>
                      <option value="prep_only">{isAr ? 'تجهيز فقط (Prep Only)' : 'Prep Only'}</option>
                    </select>
                  </div>

                  {/* Quantity Exactness Criteria */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'معيار دقة ومطابقة الكمية *' : 'Quantity Exactness *'}</label>
                    <select
                      value={planFormData.qtyExactness}
                      onChange={(e) => setPlanFormData({ ...planFormData, qtyExactness: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="approximate">{isAr ? 'تقريبي (Approximate - الافتراضي)' : 'Approximate (Default)'}</option>
                      <option value="at_least">{isAr ? 'لا يقل عن (At Least)' : 'At Least'}</option>
                      <option value="at_most">{isAr ? 'لا يزيد عن (At Most)' : 'At Most'}</option>
                      <option value="exact">{isAr ? 'بالظبط (Exact)' : 'Exact'}</option>
                      <option value="as_per_materials">{isAr ? 'حسب الخامات المتاحة (As per Materials)' : 'As per Materials'}</option>
                      <option value="as_per_time">{isAr ? 'حسب الوقت المتاح (As per Time)' : 'As per Time'}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'ملاحظات وتوجيهات التشغيل' : 'Batch Notes & Remarks'}</label>
                  <input
                    type="text"
                    placeholder={isAr ? 'مثال: التأكد من ضبط درجة حرارة اللحام، طباعة تاريخ الإنتاج...' : 'e.g. Verify shrink temperature...'}
                    value={planFormData.notes}
                    onChange={(e) => setPlanFormData({ ...planFormData, notes: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white text-xs"
                  />
                </div>
              </div>

              {/* SECTION 4: PRODUCTION PROCESS & STEP STAFFING (مسار التشغيل وتعيين الطاقم) */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <Workflow className="h-4 w-4 text-cyan-600" />
                    <span>{isAr ? '٤. مسار التشغيل وتعيين طاقم العمل (Production Process & SOP):' : '4. Production Process & SOP Staffing:'}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-semibold">{isAr ? 'المسار المفضل:' : 'Preferred Process:'}</span>
                    <select
                      value={planFormData.processId}
                      onChange={(e) => handlePlanProcessChange(e.target.value)}
                      className="p-1.5 text-xs font-bold border border-cyan-300 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    >
                      <option value="">{isAr ? '-- اختر مسار التشغيل --' : '-- Select Process --'}</option>
                      {(() => {
                        const compProcs = getCompatibleProcesses(planFormData.finishedProductId);
                        const compIds = new Set(compProcs.map((p) => p.id || p.processCode));
                        const otherProcs = productionProcesses.filter((p) => p.status !== 'inactive' && !compIds.has(p.id || p.processCode));

                        return (
                          <>
                            {compProcs.length > 0 && (
                              <optgroup label={isAr ? 'مسارات متوافقة مع الصنف' : 'Compatible Processes'}>
                                {compProcs.map((p) => (
                                  <option key={p.id || p.processCode} value={p.id || p.processCode}>
                                    [{p.processCode}] {p.nameAr || p.nameEn}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {otherProcs.length > 0 && (
                              <optgroup label={isAr ? 'مسارات تشغيل أخرى' : 'Other Processes'}>
                                {otherProcs.map((p) => (
                                  <option key={p.id || p.processCode} value={p.id || p.processCode}>
                                    [{p.processCode}] {p.nameAr || p.nameEn}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                    </select>
                  </div>
                </div>

                {/* Optional note explaining planning vs pallet execution */}
                <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-2 text-blue-900 text-[11px]">
                  <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{isAr ? 'مرونة التخطيط المسبق:' : 'Flexible Planning Rule:'} </span>
                    <span>
                      {isAr
                        ? 'يمكنك توزيع وتعيين طاقم العمل على خطوات مسار التشغيل الآن أو تركها ليتم تحديدها بصالة الإنتاج. تعيين عمال للخطوات الإلزامية اختياري هنا بالخطة، ولكنه إلزامي قطعي عند اعتماد كل باليتة.'
                        : 'Staffing can be assigned in advance or left for floor completion. Mandatory steps are skippable during planning, but strictly enforced on pallet completion.'}
                    </span>
                  </div>
                </div>

                {/* Steps and Multi-Worker Staffing Grid */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {(!planFormData.stepStaffing || planFormData.stepStaffing.length === 0) ? (
                    <div className="p-4 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                      {isAr ? 'لم يتم تحديد مسار تشغيل. اختر مسار تشغيل من القائمة أعلاه لعرض خطواته وتوزيع الطاقم.' : 'No process selected. Choose a process to view its steps.'}
                    </div>
                  ) : (
                    planFormData.stepStaffing.map((step) => {
                      const isStepAssigned = (step.workers || []).length > 0;
                      return (
                        <div
                          key={step.stepNum}
                          className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                                {step.stepNum}
                              </span>
                              <div>
                                <span className="font-bold text-slate-900 text-xs">{step.stepName}</span>
                                {step.stepDesc && (
                                  <span className="text-[10px] text-slate-400 block font-normal">{step.stepDesc}</span>
                                )}
                              </div>
                            </div>

                            <div>
                              {step.mandatory ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                  isStepAssigned
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}>
                                  {isAr ? (isStepAssigned ? '✓ إلزامي (مُعيّن)' : 'إلزامي (مؤجل)') : (isStepAssigned ? '✓ Mandatory' : 'Mandatory (Later)')}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  {isAr ? 'اختياري' : 'Optional'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Assigned Workers Chips */}
                          <div className="flex flex-wrap items-center gap-1.5 min-h-[30px] p-1.5 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                            {(step.workers || []).length === 0 ? (
                              <span className="text-[11px] text-slate-400 italic">
                                {isAr ? 'لم يُسند عمال بعد' : 'No workers assigned yet'}
                              </span>
                            ) : (
                              (step.workers || []).map((w) => (
                                <span
                                  key={w.workerId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-md text-[11px] font-bold"
                                >
                                  <User className="h-3 w-3 text-indigo-600" />
                                  <span>{w.workerName}</span>
                                  {w.isManual && <span className="text-[9px] text-amber-600 font-mono">({isAr ? 'مؤقت' : 'manual'})</span>}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleWorkerInPlanStep(step.stepNum, { id: w.workerId, name: w.workerName, isManual: w.isManual })}
                                    className="hover:text-rose-600 p-0.5 cursor-pointer"
                                    title={isAr ? 'إزالة العامل' : 'Remove worker'}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>

                          {/* Dropdown to assign worker + Quick Add */}
                          <div className="flex items-center gap-2">
                            <select
                              value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const found = combinedWorkerPool.find((w) => w.id === e.target.value);
                                if (found) handleToggleWorkerInPlanStep(step.stepNum, found);
                              }}
                              className="flex-1 p-1.5 text-[11px] border border-slate-200 rounded-lg bg-white font-medium focus:ring-1 focus:ring-cyan-500"
                            >
                              <option value="">{isAr ? '+ إضافة عامل للخطوة بالخطة...' : '+ Assign worker to step...'}</option>
                              {combinedWorkerPool.map((w) => {
                                const isAlreadyAssigned = (step.workers || []).some((sw) => sw.workerId === w.id);
                                return (
                                  <option key={w.id} value={w.id} disabled={isAlreadyAssigned}>
                                    {isAlreadyAssigned ? '✓ ' : ''}{w.name} {w.isManual ? (isAr ? '(مؤقت)' : '(manual)') : `[${w.role || w.department}]`}
                                  </option>
                                );
                              })}
                            </select>

                            <button
                              type="button"
                              onClick={() => {
                                setQuickWorkerTargetContext({ type: 'plan', stepNum: step.stepNum });
                                setShowQuickWorkerModal(true);
                              }}
                              className="p-1.5 text-cyan-700 hover:bg-cyan-50 border border-cyan-300 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                              title={isAr ? 'إضافة عامل مؤقت جديد' : 'Quick add worker'}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>{isAr ? 'جديد' : 'New'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SECTION 5: LIVE IN-MODAL MATERIAL AVAILABILITY CHECKLIST & SHORTAGE MATRIX (COLLAPSIBLE) */}
              {planFormData.bomRecipeId && (() => {
                const liveFeasibility = evaluateBomFeasibility(
                  planFormData.bomRecipeId,
                  planFormData.plannedQtyLarge,
                  planFormData.componentSelections,
                  existingPlanCommittedStock
                );
                const comps = liveFeasibility.components || [];

                return (
                  <div className="space-y-2 p-4 bg-slate-50/80 border border-slate-200/90 rounded-2xl shadow-2xs transition-all">
                    <div
                      onClick={() => setIsPlanBomMatrixExpanded(!isPlanBomMatrixExpanded)}
                      className="flex items-center justify-between cursor-pointer select-none border-b border-slate-200/80 pb-2"
                    >
                      <span className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
                        <Boxes className="h-4 w-4 text-indigo-600" />
                        <span>{isAr ? '٥. فحص ومطابقة خامات الـ BOM المطلوبة للتشغيلة:' : '5. BOM Materials Availability Matrix:'}</span>
                        {isPlanBomMatrixExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className={`h-4 w-4 text-slate-400 ${isAr ? 'rotate-180' : ''}`} />
                        )}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        liveFeasibility.status === 'floor_ready'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : liveFeasibility.status === 'transfer_needed'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                      }`}>
                        <CircleDot className="h-3 w-3" />
                        <span>{liveFeasibility.labelAr}</span>
                      </span>
                    </div>

                    {isPlanBomMatrixExpanded && (
                      <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white max-h-72 overflow-y-auto shadow-inner mt-2 animate-in fade-in duration-150">
                        <table className="w-full text-start border-collapse text-xs">
                          <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                            <tr>
                              <th className="p-2.5 text-start min-w-[170px]">{isAr ? 'الخامة المكونة (Flag F)' : 'Component Item'}</th>
                              <th className="p-2.5 text-start min-w-[280px]">{isAr ? 'تنوع ومواصفات الخامة' : 'Material Variation & Specs'}</th>
                              <th className="p-2.5 text-start min-w-[190px]">{isAr ? 'رقم اللوط المحدد (Target LOT)' : 'Target LOT'}</th>
                              <th className="p-2.5 text-center min-w-[85px]">{isAr ? 'المطلوب' : 'Required'}</th>
                              <th className="p-2.5 text-start min-w-[140px]">{isAr ? 'المتاح بالصالة (Floor)' : 'Floor Stock (3-Tier)'}</th>
                              <th className="p-2.5 text-start min-w-[140px]">{isAr ? 'إجمالي المخازن (Company)' : 'Total WH (3-Tier)'}</th>
                              <th className="p-2.5 text-center min-w-[110px]">{isAr ? 'حالة التوفر' : 'Verdict'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {comps.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-400">
                                  {isAr ? 'لا توجد خامات مسجلة في هذه التركيبة.' : 'No components in this BOM.'}
                                </td>
                              </tr>
                            ) : (
                              comps.map((c, i) => {
                                const isFloorReady = c.isSufficientOnFloor;
                                const isCompanyReady = c.isSufficientOverall;
                                const isCompanyShortage = !isCompanyReady;

                                const itemMasterDoc = itemsMaster.find((itm) => itm.code === c.itemId);
                                const variationsList = itemMasterDoc?.variations || [];
                                const allItemLots = Object.values(liveStockMatrix?.lotMap || {}).filter((l) => l.itemId === c.itemId && l.availableQty > 0);

                                const currentSelection = planFormData.componentSelections?.[c.itemId] || null;
                                const smartSel = resolveSmartComponentSelection(
                                  c,
                                  c.neededQty,
                                  currentSelection
                                );

                                const selectedVariantSuffix = smartSel.variantSuffix;
                                const isBomMandatory = smartSel.isBomMandatory;
                                const isBomPreferred = smartSel.isBomPreferred;
                                const cleanBomSuffix = smartSel.cleanBomSuffix;
                                const isAutoPickVariant = smartSel.isAutoPickVariant;
                                const variantReason = smartSel.variantReason;

                                const selectedVariantFullCode = selectedVariantSuffix ? `${c.itemId}-${selectedVariantSuffix}` : '';
                                const selectedVariantObj = variationsList.find((v) => v.suffix === selectedVariantSuffix || v.variantCode === selectedVariantFullCode);

                                const variantSpecsText = selectedVariantObj
                                  ? ((selectedVariantObj.specs || []).map((s) => `${s.label}: ${s.value}`).join(' • ') || selectedVariantObj.mergedSpecs || '')
                                  : (itemMasterDoc?.mergedSpecs || '');
                                const variantSupplierName = selectedVariantObj?.supplierName || (selectedVariantObj?.supplierId ? (usersList.find((s) => s.id === selectedVariantObj.supplierId)?.name || '') : '');

                                const variantLots = smartSel.variantLots;
                                const selectedLotNumber = smartSel.lotNumber;
                                const isAutoPickLot = smartSel.isAutoPickLot;
                                const lotReason = smartSel.lotReason;

                                const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';

                                const itemFloorStock = allItemLots.filter((l) => l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse)).reduce((s, l) => s + l.availableQty, 0);
                                const itemCompanyStock = allItemLots.reduce((s, l) => s + l.availableQty, 0);

                                const variantFloorStock = variantLots.filter((l) => l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse)).reduce((s, l) => s + l.availableQty, 0);
                                const variantCompanyStock = variantLots.reduce((s, l) => s + l.availableQty, 0);

                                const lotLots = selectedLotNumber ? allItemLots.filter((l) => l.lotNumber === selectedLotNumber) : [];
                                const lotFloorStock = lotLots.filter((l) => l.warehouseId === factoryWhId || matchWh(l.warehouseId, factoryWarehouse)).reduce((s, l) => s + l.availableQty, 0);
                                const lotCompanyStock = lotLots.reduce((s, l) => s + l.availableQty, 0);

                                return (
                                  <tr key={i} className={`hover:bg-slate-50/80 transition ${isCompanyShortage ? 'bg-rose-50/40' : ''}`}>
                                    <td className="p-2.5 align-top">
                                      <span className={`font-bold block text-xs ${isCompanyShortage ? 'text-rose-950 font-extrabold' : 'text-slate-900'}`}>
                                        {c.materialNameAr}
                                      </span>
                                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400 font-mono">
                                        <span>[{c.itemId}]</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(c.itemId);
                                            setCopiedId(c.itemId);
                                            setTimeout(() => setCopiedId(null), 1800);
                                          }}
                                          className="p-0.5 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                                          title={isAr ? 'نسخ كود الخامة' : 'Copy Item Code'}
                                        >
                                          {copiedId === c.itemId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                        </button>
                                      </div>
                                    </td>

                                    <td className="p-2.5 align-top space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        {selectedVariantObj?.imageFile ? (
                                          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden group/vimg">
                                            <img
                                              src={selectedVariantObj.imageFile}
                                              alt={selectedVariantSuffix}
                                              onClick={() => setImagePreviewModal({
                                                url: selectedVariantObj.imageFile,
                                                title: `${c.materialNameAr} - (${selectedVariantSuffix})`,
                                                subtitle: `${selectedVariantFullCode} • ${variantSupplierName}`
                                              })}
                                              className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                              title={isAr ? 'انقر لعرض صورة الخامة' : 'Click to preview variant image'}
                                            />
                                          </div>
                                        ) : (
                                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 shadow-2xs">
                                            <Package className="h-5 w-5" />
                                          </div>
                                        )}

                                        <div className="flex-1 space-y-1">
                                          <div className="flex items-center gap-1.5">
                                            <VariantComboBox
                                              variants={variationsList.filter((v) => isBomMandatory ? v.suffix === cleanBomSuffix : true)}
                                              value={selectedVariantSuffix}
                                              onChange={(val) => {
                                                const newLotSmart = resolveSmartComponentSelection(
                                                  c,
                                                  c.neededQty,
                                                  { variantCode: val, selectedLot: undefined }
                                                );
                                                setPlanFormData((prev) => ({
                                                  ...prev,
                                                  componentSelections: {
                                                    ...(prev.componentSelections || {}),
                                                    [c.itemId]: {
                                                      ...(prev.componentSelections?.[c.itemId] || {}),
                                                      variantCode: val,
                                                      selectedLot: newLotSmart.lotNumber,
                                                    }
                                                  }
                                                }));
                                              }}
                                              disabled={isBomMandatory}
                                              allowGeneric={!isBomMandatory}
                                              isAr={isAr}
                                              size="sm"
                                              placeholder={isAr ? '-- اختر التشكيل --' : '-- Select Variant --'}
                                              className={`w-full ${
                                                isBomMandatory
                                                  ? 'opacity-85 pointer-events-none'
                                                  : isBomPreferred
                                                  ? 'ring-1 ring-indigo-400'
                                                  : ''
                                              }`}
                                            />

                                            {isBomMandatory && (
                                              <span className="px-2 py-1 bg-rose-600 text-white rounded-lg shrink-0 font-bold text-[10px] flex items-center gap-1 shadow-2xs" title={isAr ? 'إلزامي بالتركيبة ومقفل' : 'Locked'}>
                                                <Lock className="h-3 w-3" />
                                                <span>{isAr ? 'إلزامي' : 'Mandatory'}</span>
                                              </span>
                                            )}
                                          </div>

                                          {/* Auto-Pick & Ambiguity Helper Badges */}
                                          {isAutoPickVariant && selectedVariantSuffix && !isBomMandatory && (
                                            <div className="pt-0.5">
                                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                                                ✓ {isAr ? (variantReason === 'preferred_sufficient' ? 'تم اختيار التنوع المفضل (رصيد كافٍ)' : 'تم الاختيار التلقائي (رصيد وحيد كافٍ)') : 'Variant Auto-Picked'}
                                              </span>
                                            </div>
                                          )}
                                          {!selectedVariantSuffix && !isBomMandatory && variationsList.length > 0 && (
                                            <div className="pt-0.5">
                                              <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                                                ⚠️ {variantReason === 'multiple_sufficient'
                                                  ? (isAr ? 'توجد عدة تنوعات برصيد كافٍ (حدد المطلوب)' : 'Multiple variants in stock (select one)')
                                                  : variantReason === 'preferred_insufficient'
                                                  ? (isAr ? 'التنوع المفضل بالتركيبة رصيده غير كافٍ (حدد بديلاً)' : 'Preferred variant low stock (select alternative)')
                                                  : (isAr ? 'يرجى تحديد التنوع يدوياً' : 'Please select variant manually')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1 text-[10px]">
                                        {selectedVariantObj && (
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <VariantIdentifierChip variant={selectedVariantObj} size="sm" />
                                          </div>
                                        )}
                                        {variantSupplierName && (
                                          <div className="flex items-center gap-1 font-semibold text-slate-700">
                                            <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                                            <span className="truncate">{variantSupplierName}</span>
                                          </div>
                                        )}
                                        <div className="text-slate-500 font-medium leading-relaxed">
                                          {variantSpecsText ? (
                                            <span>{variantSpecsText}</span>
                                          ) : (
                                            <span className="italic text-slate-400">{isAr ? 'المواصفات القياسية العامة' : 'Standard Master Specs'}</span>
                                          )}
                                        </div>
                                      </div>
                                    </td>

                                    <td className="p-2.5 align-top space-y-1">
                                      <select
                                        value={selectedLotNumber}
                                        onChange={(e) => {
                                          const lotVal = e.target.value;
                                          setPlanFormData((prev) => ({
                                            ...prev,
                                            componentSelections: {
                                              ...(prev.componentSelections || {}),
                                              [c.itemId]: {
                                                ...(prev.componentSelections?.[c.itemId] || {}),
                                                variantCode: selectedVariantSuffix,
                                                selectedLot: lotVal,
                                              }
                                            }
                                          }));
                                        }}
                                        className={`w-full p-1.5 border rounded-xl text-xs bg-white font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 ${
                                          !selectedLotNumber ? 'border-amber-400 bg-amber-50/20' : 'border-slate-300'
                                        }`}
                                      >
                                        <option value="">
                                          {isAr ? '-- حدد رقم اللوط --' : '-- Select Target LOT --'}
                                        </option>
                                        {variantLots.map((l) => (
                                          <option key={l.lotNumber} value={l.lotNumber}>
                                            {formatLotLabel(l, isAr)}
                                          </option>
                                        ))}
                                      </select>

                                      {isAutoPickLot && selectedLotNumber && (
                                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                                          ✓ {isAr ? 'تم اختيار أقدم لوط متاح (FIFO)' : 'Oldest FIFO Auto-Selected'}
                                        </span>
                                      )}

                                      {!selectedLotNumber && variantLots.length > 0 && (
                                        <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                                          ⚠️ {isAr ? 'يرجى تحديد اللوط يدوياً' : 'Please select LOT manually'}
                                        </span>
                                      )}

                                      {variantLots.length === 0 && (
                                        <span className="text-[9px] font-medium text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                                          ⚠️ {isAr ? 'لا يوجد رصيد متاح' : 'No available stock'}
                                        </span>
                                      )}
                                    </td>

                                    <td className="p-2.5 text-center align-top font-mono font-bold text-blue-900 bg-blue-50/30">
                                      <div className="text-sm">{c.neededQty.toLocaleString()}</div>
                                      <span className="text-[10px] text-slate-500 font-normal">{c.unit}</span>
                                    </td>

                                    <td className="p-2.5 align-top text-[10px] space-y-1 font-mono">
                                      <div className="flex items-center justify-between bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                        <span className="text-slate-500 font-sans font-medium">{isAr ? 'الخامة:' : 'Item:'}</span>
                                        <b className="text-slate-900">{itemFloorStock.toLocaleString()}</b>
                                      </div>
                                      <div className="flex items-center justify-between bg-indigo-50/60 px-1.5 py-0.5 rounded border border-indigo-200">
                                        <span className="text-indigo-900 font-sans font-bold">{isAr ? 'التنوع:' : 'Variant:'}</span>
                                        <b className="text-indigo-950 font-extrabold">{variantFloorStock.toLocaleString()}</b>
                                      </div>
                                      <div className="flex items-center justify-between bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        <span className="text-emerald-800 font-sans font-bold">{isAr ? 'اللوط:' : 'LOT:'}</span>
                                        <b className="text-emerald-950">{selectedLotNumber ? lotFloorStock.toLocaleString() : '—'}</b>
                                      </div>
                                      {c.priorReservedFloor > 0 && (
                                        <div className="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] font-sans">
                                          <span>{isAr ? 'محجوز لأوامر بالخطة: ' : 'Committed in plan: '}</span>
                                          <b className="font-mono font-bold text-amber-950">{c.priorReservedFloor.toLocaleString()}</b>
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-2.5 align-top text-[10px] space-y-1 font-mono">
                                      <div className="flex items-center justify-between bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                        <span className="text-slate-500 font-sans font-medium">{isAr ? 'الخامة:' : 'Item:'}</span>
                                        <b className="text-slate-900">{itemCompanyStock.toLocaleString()}</b>
                                      </div>
                                      <div className="flex items-center justify-between bg-indigo-50/60 px-1.5 py-0.5 rounded border border-indigo-200">
                                        <span className="text-indigo-900 font-sans font-bold">{isAr ? 'التنوع:' : 'Variant:'}</span>
                                        <b className="text-indigo-950 font-extrabold">{variantCompanyStock.toLocaleString()}</b>
                                      </div>
                                      <div className="flex items-center justify-between bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        <span className="text-emerald-800 font-sans font-bold">{isAr ? 'اللوط:' : 'LOT:'}</span>
                                        <b className="text-emerald-950">{selectedLotNumber ? lotCompanyStock.toLocaleString() : '—'}</b>
                                      </div>
                                    </td>

                                    <td className="p-2.5 text-center align-top">
                                      {isFloorReady ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
                                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                          <span>{isAr ? 'جاهز بالصالة' : 'Ready'}</span>
                                        </span>
                                      ) : isCompanyReady ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                                          <ArrowLeftRight className="h-3.5 w-3.5 text-amber-600" />
                                          <span>{isAr ? `تحويل (${c.transferDeficit.toLocaleString()})` : `Transfer (${c.transferDeficit})`}</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-600 text-white shadow-2xs animate-pulse">
                                          <AlertCircle className="h-3.5 w-3.5 text-white" />
                                          <span>{isAr ? `عجز (-${c.shortageDeficit.toLocaleString()})` : `Deficit (-${c.shortageDeficit})`}</span>
                                        </span>
                                      )}
                                      {planBottleneckInfo?.bottleneckComps?.some((b) => b.itemId === c.itemId) && (
                                        <div className="pt-1">
                                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-100 text-amber-950 border border-amber-300 block">
                                            {isAr
                                              ? `أقصى إنتاج: ${Math.floor(c.totalCompanyStock / (c.standardQty || 1))} كرتونة`
                                              : `Max: ${Math.floor(c.totalCompanyStock / (c.standardQty || 1))} ctns`}
                                          </span>
                                        </div>
                                      )}
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
                );
              })()}

              {/* Modal Footer Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'حفظ وتثبيت بالخطة' : 'Save Plan Order'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMART SPLIT & COMPLEMENTARY ORDER MODAL (Option 1) */}
      {splitModalData && (() => {
        const { bottleneckInfo, planFormData: pData } = splitModalData;
        const prod = finishedProducts.find((p) => p.code === pData.finishedProductId);
        const ratio = Number(pData.packagingRatio) || 12;
        const primaryOrderId = editingPlanOrder?.id || pData.orderNumber || generateOrderNumber(pData.planDate);
        const complementaryOrderId = `${primaryOrderId}-CMP`;
        const bottleneckList = bottleneckInfo.bottleneckComps || [];

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                    <Split className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">
                      {isAr ? 'تقسيم ذكي وتشغيلة مكملة (Smart Capacity Split)' : 'Smart Capacity Split & Complementary Order'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {isAr
                        ? 'رصيد اللوط النشط لا يكفي لكامل الكمية المطلوبة - اختر مسار المعالجة المناسب'
                        : 'Active LOT stock is insufficient for full target quantity - choose execution path'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitModalData(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Bottleneck Diagnostic Card */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2 font-bold">
                  <span className="text-slate-700">
                    {isAr ? 'المنتج المستهدف:' : 'Target SKU:'} <b className="text-slate-900">{prod?.nameAr} [{pData.finishedProductId}]</b>
                  </span>
                  <span className="text-slate-500 font-mono">
                    {isAr ? 'الكمية الأصلية المخططة:' : 'Original Target:'} <b className="text-blue-700">{bottleneckInfo.plannedCartons} {prod?.largeUnitName || (isAr ? 'كرتونة' : 'ctns')}</b>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="font-bold text-amber-900 block text-[11px]">
                    {isAr ? 'الخامات المسببة للاختناق (Bottleneck Constraints):' : 'Bottleneck Constraints:'}
                  </span>
                  {bottleneckList.map((b, idx) => (
                    <div key={idx} className="p-2 bg-white rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div>
                        <b className="text-slate-900">{b.materialNameAr}</b>
                        <span className="text-slate-400 font-mono ms-1">[{b.itemId}]</span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {b.selectedVariant ? `${isAr ? 'تنوع:' : 'Variant:'} ${b.selectedVariant} • ` : ''}
                          {b.selectedLot ? `${isAr ? 'لوط:' : 'LOT:'} ${b.selectedLot}` : (isAr ? 'بدون لوط محدد' : 'No LOT specified')}
                        </div>
                      </div>
                      <div className="text-end font-mono">
                        <div>
                          <span className="text-slate-500 font-sans">{isAr ? 'الرصيد المتاح:' : 'Available:'} </span>
                          <b className="text-emerald-700">{b.effectiveCompanyStock.toLocaleString()} ${b.unit}</b>
                        </div>
                        <div className="text-[10px] text-amber-800 font-bold">
                          {isAr ? `يكفي فقط لـ (${b.producibleCartons} كرتونة)` : `Sufficient for only (${b.producibleCartons} ctns)`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proposal Preview (Option 1 Breakdown) */}
              <div className="space-y-2">
                <span className="font-bold text-slate-700 text-xs block">
                  {isAr ? 'مقترح التقسيم التلقائي (الخيار الموصى به):' : 'Proposed Split Breakdown (Recommended):'}
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Order 1: Primary */}
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-300 rounded-2xl space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-emerald-950 text-xs">
                        {isAr ? '١. أمر التشغيل الأساسي' : '1. Primary Work Order'}
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-bold rounded text-[10px] border border-emerald-200">
                        {primaryOrderId}
                      </span>
                    </div>
                    <div className="text-center py-2 bg-white rounded-xl border border-emerald-200 font-mono">
                      <div className="text-xl font-extrabold text-emerald-800">
                        {bottleneckInfo.maxProducibleCartons} <span className="text-xs font-sans text-emerald-600">{prod?.largeUnitName || (isAr ? 'كرتونة' : 'ctns')}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        = {(bottleneckInfo.maxProducibleCartons * ratio).toLocaleString()} {prod?.smallUnit || (isAr ? 'عبوة' : 'units')}
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-900 leading-relaxed font-medium">
                      {isAr
                        ? 'جاهز للتنفيذ فوراً باستهلاك 100% من رصيد اللوط النشط المتاح دون أي توقف أو ارتباك بصالة الإنتاج.'
                        : 'Ready for immediate production, consuming 100% of available LOT stock with zero floor stalls.'}
                    </p>
                  </div>

                  {/* Order 2: Complementary */}
                  <div className="p-3.5 bg-purple-50/70 border border-purple-300 rounded-2xl space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-purple-950 text-xs">
                        {isAr ? '٢. أمر التشغيل المكمل' : '2. Complementary Order'}
                      </span>
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-900 font-bold rounded text-[10px] border border-purple-200">
                        {complementaryOrderId}
                      </span>
                    </div>
                    <div className="text-center py-2 bg-white rounded-xl border border-purple-200 font-mono">
                      <div className="text-xl font-extrabold text-purple-800">
                        {bottleneckInfo.deficitCartons} <span className="text-xs font-sans text-purple-600">{prod?.largeUnitName || (isAr ? 'كرتونة' : 'ctns')}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        = {(bottleneckInfo.deficitCartons * ratio).toLocaleString()} {prod?.smallUnit || (isAr ? 'عبوة' : 'units')}
                      </div>
                    </div>
                    <p className="text-[10px] text-purple-900 leading-relaxed font-medium">
                      {isAr
                        ? 'يُسجل بالخطة كأمر مكمل في انتظار توريد خامات جديدة. سيربط النظام اللوط الجديد به تلقائياً فور اعتماد إذن الاستلام (GRN).'
                        : 'Created as complementary awaiting replenishment. System auto-binds new LOT upon Goods Receipt (GRN) approval.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                {/* Action A: Recommended Split */}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleExecuteSmartSplit}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs shadow-xs flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
                >
                  <Zap className="h-4 w-4" />
                  <span>
                    {isAr
                      ? `اعتماد التقسيم وإنشاء التشغيلتين تلقائياً (${bottleneckInfo.maxProducibleCartons} كرتونة + ${bottleneckInfo.deficitCartons} كرتونة مكملة)`
                      : `Execute Smart Split (${bottleneckInfo.maxProducibleCartons} ctns + ${bottleneckInfo.deficitCartons} complementary ctns)`}
                  </span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Action B: Cap only */}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCapToMaxOnly}
                    className="py-2 px-3 border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xl font-bold text-xs transition cursor-pointer"
                  >
                    {isAr
                      ? `تقليص الحالية فقط إلى (${bottleneckInfo.maxProducibleCartons} كرتونة)`
                      : `Cap current order only to (${bottleneckInfo.maxProducibleCartons} ctns)`}
                  </button>

                  {/* Action C: Schedule with deficit anyway */}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleScheduleWithDeficitAnyway}
                    className="py-2 px-3 border border-amber-300 bg-amber-50/50 hover:bg-amber-100/70 text-amber-900 rounded-xl font-bold text-xs transition cursor-pointer"
                  >
                    {isAr
                      ? `تثبيت كامل الكمية (${bottleneckInfo.plannedCartons} كرتونة) مع تسجيل عجز`
                      : `Schedule full (${bottleneckInfo.plannedCartons} ctns) with deficit`}
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setSplitModalData(null)}
                    className="text-slate-400 hover:text-slate-600 text-[11px] font-semibold transition cursor-pointer"
                  >
                    {isAr ? 'إلغاء والعودة لنموذج الخطة' : 'Cancel and return to form'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* GLOBAL BREAK MODAL (Sub-Tab 3) */}
      {showBreakModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Coffee className="h-5 w-5 text-amber-600" />
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">{isAr ? 'تسجيل وقت راحة عام للوردية' : 'Log Floor Break'}</h3>
                <span className="text-[11px] text-slate-500">{isAr ? 'يتم خصم وقت الراحة من إجمالي أوقات التشغيل' : 'Deducted from runtime'}</span>
              </div>
            </div>

            <form onSubmit={handleSaveGlobalBreak} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">{isAr ? 'وقت البدء *' : 'Start Time *'}</label>
                    <button
                      type="button"
                      onClick={() => setBreakFormData(prev => ({ ...prev, startTime: minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))) }))}
                      className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded cursor-pointer"
                      title={isAr ? 'ضبط على الوقت الحالي الآن' : 'Set to current time'}
                    >
                      {isAr ? 'الآن' : 'Now'}
                    </button>
                  </div>
                  <input
                    type="time"
                    required
                    value={breakFormData.startTime}
                    onChange={(e) => setBreakFormData({ ...breakFormData, startTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">{isAr ? 'وقت الانتهاء' : 'End Time'}</label>
                    <button
                      type="button"
                      onClick={() => setBreakFormData(prev => ({ ...prev, endTime: minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))) }))}
                      className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded cursor-pointer"
                      title={isAr ? 'ضبط على الوقت الحالي الآن' : 'Set to current time'}
                    >
                      {isAr ? 'الآن' : 'Now'}
                    </button>
                  </div>
                  <input
                    type="time"
                    value={breakFormData.endTime}
                    onChange={(e) => setBreakFormData({ ...breakFormData, endTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'بيان الراحة / الملاحظات' : 'Break Notes'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: راحة الغداء والصلاة' : 'Lunch break...'}
                  value={breakFormData.notes}
                  onChange={(e) => setBreakFormData({ ...breakFormData, notes: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBreakModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'حفظ الراحة' : 'Log Break'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK ADD MANUAL WORKER MODAL */}
      {showQuickWorkerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">{isAr ? 'إضافة عامل مؤقت جديد' : 'Quick Add Manual Worker'}</h3>
                  <span className="text-[11px] text-slate-500">
                    {isAr ? 'سيتم حفظ العامل وإسناده للخطوة الجارية مباشرة' : 'Saved to worker roster and assigned immediately'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowQuickWorkerModal(false);
                  setQuickWorkerTargetContext(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAddManualWorker} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم العامل الكامل *' : 'Worker Name *'}</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: عبد الرحمن حسن' : 'e.g. John Doe'}
                  value={quickWorkerName}
                  onChange={(e) => setQuickWorkerName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold bg-white text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'المسمى / الدور التشغيلي' : 'Job Title / Role'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: عامل تغليف وتعبئة' : 'e.g. Packing Operator'}
                  value={quickWorkerRole}
                  onChange={(e) => setQuickWorkerRole(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white text-xs"
                />
              </div>

              <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2 text-amber-900 text-[11px]">
                <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  {isAr
                    ? 'يتم تخزين العامل بقائمة عمال الإنتاج مع تمييزه كعامل يدوي لتسهيل دمجه برقم وظيفي لاحقاً عند تفعيل وحدة الموارد البشرية (HR).'
                    : 'Stored as manual worker and easily linkable to HR module later.'}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickWorkerModal(false);
                    setQuickWorkerTargetContext(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!quickWorkerName.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'حفظ وإسناد للخطوة' : 'Save & Assign'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRE-FILLED FLOOR TRANSFER MODAL (LOCKED TO PRODUCTION FLOOR WH) */}
      {showFloorTransferModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-5xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky -top-7 -mt-7 pt-7 bg-white z-20 flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'إذن تحويل خامات لتغذية صالة الإنتاج (Floor Transfer TRN)' : 'Staging Transfer to Production Floor'}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isAr ? 'محول ومقفل إلى صالة الإنتاج ومربوط بأوامر التشغيل المجدولة' : 'Pre-filled and locked to factory floor destination'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFloorTransferModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFloorTransfer} className="space-y-4 text-xs">
              {/* Warehouse Route Card: Source Selectable, Destination Locked */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                {/* Source Warehouse */}
                <div className="md:col-span-5 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700">
                    {isAr ? 'مخزن الصرف (المصدر): *' : 'Source Warehouse: *'}
                  </label>
                  <select
                    value={floorTransferData.sourceWarehouse}
                    onChange={(e) => {
                      const newSrc = e.target.value;
                      setFloorTransferData((prev) => ({
                        ...prev,
                        sourceWarehouse: newSrc,
                        // Re-resolve FIFO lots from new source matching specific variant if present
                        lines: prev.lines.map((l) => {
                          const activeLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
                            (lot) => lot.itemId === l.itemId && (l.variantCode ? lot.variantCode === l.variantCode : true) && (lot.warehouseId === newSrc || matchWh(lot.warehouseId, newSrc)) && lot.availableQty > 0
                          );
                          activeLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
                          const topLot = activeLots[0];
                          return {
                            ...l,
                            lotNumber: topLot?.lotNumber || '',
                            unitPrice: topLot?.unitPrice || 0,
                          };
                        })
                      }));
                    }}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    {warehouses
                      .filter((w) => w.id !== factoryWarehouse?.id && w.code !== factoryWarehouse?.code)
                      .map((w) => (
                        <option key={w.id || w.code} value={w.id || w.code}>
                          {w.code ? `${w.code} - ` : ''}{isAr ? w.nameAr : w.nameEn || w.nameAr}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Arrow */}
                <div className="md:col-span-2 flex items-center justify-center pt-5">
                  <div className="p-2 rounded-full bg-slate-200 text-indigo-700">
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </div>
                </div>

                {/* Destination Warehouse (LOCKED) */}
                <div className="md:col-span-5 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 flex items-center justify-between">
                    <span>{isAr ? 'مخزن الوجهة (صالة الإنتاج):' : 'Destination Warehouse:'}</span>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      <span>{isAr ? 'مقفل لصالة الإنتاج' : 'Locked'}</span>
                    </span>
                  </label>
                  <div className="p-2 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center gap-2">
                    <Factory className="h-4 w-4 text-indigo-700 shrink-0" />
                    <span className="font-extrabold text-indigo-950 text-xs">
                      {factoryWarehouse ? (isAr ? factoryWarehouse.nameAr : factoryWarehouse.nameEn || factoryWarehouse.nameAr) : (isAr ? 'صالة الإنتاج' : 'Factory Floor')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transfer Date & MO Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'تاريخ التحويل *' : 'Transfer Date *'}</label>
                  <input
                    type="date"
                    required
                    value={floorTransferData.transferDate}
                    onChange={(e) => setFloorTransferData({ ...floorTransferData, transferDate: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'أوامر التشغيل المرتبطة (MOs)' : 'Linked MOs'}</label>
                  <input
                    type="text"
                    value={floorTransferData.productionOrderRef}
                    onChange={(e) => setFloorTransferData({ ...floorTransferData, productionOrderRef: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-slate-100 font-mono text-slate-700 font-semibold"
                  />
                </div>
              </div>

              {/* Transfer Lines Table */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <Boxes className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'الخامات المطلوبة وصافي عجز صالة الإنتاج:' : 'Required Items & Staging Quantities:'}</span>
                    <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-bold">
                      {floorTransferData.lines.length}
                    </span>
                  </span>

                  <span className="text-[11px] text-slate-400 font-medium">
                    {isAr ? 'تم استبعاد خامات الضخ المستمر (Flag M) والخامات بدون عجز' : 'Continuous pipe supply (M) and zero-deficit items are excluded'}
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-h-72 overflow-y-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 text-start">{isAr ? 'الخامة والمواصفة' : 'Material & Variant'}</th>
                        <th className="p-2.5 text-start min-w-[150px]">{isAr ? 'لوط المصدر (FIFO)' : 'Target Lot'}</th>
                        <th className="p-2.5 text-center min-w-[100px]">{isAr ? 'عجز الصالة' : 'Floor Deficit'}</th>
                        <th className="p-2.5 text-center min-w-[140px]">{isAr ? 'طريقة الاحتساب' : 'Strategy'}</th>
                        <th className="p-2.5 text-center min-w-[120px]">{isAr ? 'كمية التحويل (صغرى)' : 'Transfer Qty'}</th>
                        <th className="p-2.5 text-center min-w-[120px]">{isAr ? 'المعادل بالعبوة الكبرى' : 'Large Unit Packs'}</th>
                        <th className="p-2.5 text-center w-10">{isAr ? 'حذف' : 'Del'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {floorTransferData.lines.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-8 text-center text-slate-400">
                            <Boxes className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                            <p className="font-bold text-xs text-slate-600">
                              {isAr ? 'لا توجد خامات بها عجز بصالة الإنتاج، أو تم استبعاد كافة بنود التحويل.' : 'No materials with deficit on the floor, or all items were excluded.'}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {isAr ? 'كافة الخامات المطلوبة لخطة هذا اليوم متوفرة بالفعل برصيد صالة الإنتاج أو يتم ضخها بالأنابيب (Flag M).' : 'All materials required for today’s plan are already available on the factory floor or pipe supplied (Flag M).'}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        floorTransferData.lines.map((line, idx) => {
                          const activeLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
                            (lot) => lot.itemId === line.itemId && (line.variantCode ? lot.variantCode === line.variantCode : true) && (lot.warehouseId === floorTransferData.sourceWarehouse || matchWh(lot.warehouseId, floorTransferData.sourceWarehouse)) && lot.availableQty > 0
                          );
                          activeLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

                          return (
                            <tr key={idx} className="hover:bg-slate-50/60 transition">
                              {/* Material & Variant */}
                              <td className="p-2.5 align-top">
                                <span className="font-bold text-slate-900 block">{line.nameAr}</span>
                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                  <span className="text-[10px] font-mono text-slate-400 font-bold">[{line.itemId}]</span>
                                  {line.variantSuffix && (
                                    <VariantIdentifierChip
                                      variant={line.variantObj}
                                      fallbackText={line.variantSuffix}
                                      size="sm"
                                    />
                                  )}
                                </div>
                                {line.specs && (
                                  <span className="text-[10px] text-slate-500 block truncate max-w-[180px] mt-0.5" title={line.specs}>
                                    {line.specs}
                                  </span>
                                )}
                              </td>

                              {/* Target Lot Selector */}
                              <td className="p-2.5 align-top">
                                <select
                                  value={line.lotNumber}
                                  onChange={(e) => {
                                    const selLot = e.target.value;
                                    const targetLotObj = activeLots.find((l) => l.lotNumber === selLot);
                                    const updatedLines = [...floorTransferData.lines];
                                    updatedLines[idx].lotNumber = selLot;
                                    updatedLines[idx].unitPrice = targetLotObj?.unitPrice || 0;
                                    setFloorTransferData({ ...floorTransferData, lines: updatedLines });
                                  }}
                                  className="w-full p-1.5 border border-slate-300 rounded-lg text-[11px] font-mono bg-white font-bold text-slate-800"
                                >
                                  <option value="">{isAr ? '-- اختر اللوط --' : '-- Select Lot --'}</option>
                                  {activeLots.map((lot, lIdx) => (
                                    <option key={lot.lotNumber} value={lot.lotNumber}>
                                      {lIdx === 0 ? '⭐ FIFO: ' : ''}{formatLotLabel(lot, isAr)}
                                    </option>
                                  ))}
                                </select>
                                {activeLots.length === 0 && (
                                  <span className="text-[10px] text-rose-600 font-bold block mt-1">
                                    {isAr ? '⚠️ لا يوجد رصيد بالمخزن المختار' : '⚠️ No stock in source warehouse'}
                                  </span>
                                )}
                              </td>

                              {/* Deficit Reference */}
                              <td className="p-2.5 align-top text-center">
                                <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-mono font-bold text-[11px]">
                                  {line.exactDeficitLarge} {line.largeUnitName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                  {line.exactDeficitSmall?.toLocaleString()} {line.smallUnit}
                                </span>
                              </td>

                              {/* Strategy Selector (Row Level) */}
                              <td className="p-2.5 align-top text-center">
                                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRowStrategy(idx, 'ceil')}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                                      (line.calcStrategy || 'ceil') === 'ceil'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                    title={isAr ? 'تقريب العجز تلقائياً لأقرب عبوة كبرى كاملة (أشد/كرتونة)' : 'Round up to whole pack'}
                                  >
                                    <Package className="h-3 w-3" />
                                    <span>{isAr ? 'أشد كامل' : 'Ceil'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRowStrategy(idx, 'exact')}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                                      line.calcStrategy === 'exact'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                    title={isAr ? 'صرف كمية العجز الصافي بالصالة بالضبط دون تقريب' : 'Exact deficit qty'}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>{isAr ? 'عجز فعلي' : 'Exact'}</span>
                                  </button>
                                </div>
                              </td>

                              {/* Transfer Qty Small Units */}
                              <td className="p-2.5 align-top text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={line.qtySmallUnits}
                                    onChange={(e) => {
                                      const val = Math.max(0, Number(e.target.value) || 0);
                                      const ratio = Number(line.packagingRatio) || 1;
                                      const updatedLines = [...floorTransferData.lines];
                                      updatedLines[idx].qtySmallUnits = val;
                                      updatedLines[idx].qtyLargeUnits = Number((val / ratio).toFixed(2));
                                      setFloorTransferData({ ...floorTransferData, lines: updatedLines });
                                    }}
                                    className="w-24 p-1.5 border border-slate-300 rounded-lg text-center font-mono font-bold text-xs bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <span className="text-[10px] text-slate-500 font-bold">{line.smallUnit}</span>
                                </div>
                              </td>

                              {/* Large Unit Packs (Two-way editable) */}
                              <td className="p-2.5 align-top text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={line.qtyLargeUnits}
                                    onChange={(e) => {
                                      const lVal = Math.max(0, Number(e.target.value) || 0);
                                      const ratio = Number(line.packagingRatio) || 1;
                                      const updatedLines = [...floorTransferData.lines];
                                      updatedLines[idx].qtyLargeUnits = lVal;
                                      updatedLines[idx].qtySmallUnits = Math.round(lVal * ratio);
                                      setFloorTransferData({ ...floorTransferData, lines: updatedLines });
                                    }}
                                    className="w-20 p-1.5 border border-slate-300 rounded-lg text-center font-mono font-bold text-xs bg-white text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <span className="text-[10px] text-slate-700 font-bold">{line.largeUnitName}</span>
                                </div>
                                <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                                  {isAr ? `شدة: ${line.packagingRatio}` : `Ratio: ${line.packagingRatio}`}
                                </span>
                              </td>

                              {/* Remove Line Action */}
                              <td className="p-2.5 align-top text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFloorTransferData((prev) => ({
                                      ...prev,
                                      lines: prev.lines.filter((_, i) => i !== idx),
                                    }));
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                                  title={isAr ? 'استبعاد الخامة من إذن التحويل' : 'Remove Line'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'ملاحظات التحويل' : 'Transfer Notes'}</label>
                <input
                  type="text"
                  value={floorTransferData.notes}
                  onChange={(e) => setFloorTransferData({ ...floorTransferData, notes: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-white text-xs"
                />
              </div>

              {/* Modal Footer Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFloorTransferModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'حفظ وتأكيد التحويل المخزني' : 'Submit Transfer'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL MODAL (WITH GRANULAR FIELD-BY-FIELD DIFFS) */}
      {auditOrderData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col justify-between overflow-hidden">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {isAr ? 'سجل التدقيق والتعديلات لأمر التشغيل' : 'Plan Order Audit Trail'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-400 mt-0.5">
                    <span>{auditOrderData.orderNumber}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(auditOrderData.orderNumber);
                        setCopiedId(auditOrderData.orderNumber);
                        setTimeout(() => setCopiedId(null), 1800);
                      }}
                      className="p-0.5 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
                      title={isAr ? 'نسخ المعرف' : 'Copy ID'}
                    >
                      {copiedId === auditOrderData.orderNumber ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                    {auditOrderData.isRework && (() => {
                      const orig = getOriginalReturnQty(auditOrderData);
                      return orig ? (
                        <span className="px-2 py-0.2 bg-purple-50 text-purple-900 border border-purple-200 rounded font-bold text-[10px] inline-flex items-center gap-1 font-sans">
                          <RotateCcw className="h-3 w-3 text-purple-600" />
                          <span>{isAr ? 'أصل المرتجع:' : 'Orig Return:'} <b className="font-mono">{orig.qtyLarge} {orig.largeUnit} ({orig.qtySmall} {orig.smallUnit})</b></span>
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuditOrderData(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto pe-1 text-xs">
              {(auditOrderData.auditTrail || []).map((entry, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200 text-[10px]">
                      {entry.actionLabelAr || entry.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(entry.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>

                  <p className="text-slate-700 text-xs font-semibold">{entry.summary}</p>

                  {/* Itemized field-by-field diff list */}
                  {Array.isArray(entry.changes) && entry.changes.length > 0 && (
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 space-y-1 text-[11px]">
                      <span className="font-bold text-slate-500 block text-[10px]">
                        {isAr ? 'تفاصيل التعديلات المطبقة:' : 'Recorded Modifications:'}
                      </span>
                      <ul className="space-y-1 text-slate-700 font-mono text-[11px]">
                        {entry.changes.map((change, cIdx) => (
                          <li key={cIdx} className="flex items-start gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                            <span className="text-indigo-600 font-bold">•</span>
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <span className="text-[10px] text-slate-400 block font-semibold">
                    {isAr ? 'بواسطة:' : 'By:'} <b className="text-slate-700">{entry.user}</b>
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAuditOrderData(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MATERIAL AVAILABILITY & BOM FEASIBILITY MODAL */}
      {feasibilityModalData && (() => {
        const { order, feasibility } = feasibilityModalData;
        const comps = feasibility.components || [];
        const shortageComps = comps.filter((c) => !c.isSufficientOverall);
        const transferComps = comps.filter((c) => c.isSufficientOverall && !c.isSufficientOnFloor);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2.5 rounded-2xl ${
                    feasibility.status === 'floor_ready'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : feasibility.status === 'transfer_needed'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    <Boxes className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 flex flex-wrap items-center gap-2 leading-snug">
                      <span>{order.productNameAr}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        feasibility.status === 'floor_ready'
                          ? 'bg-emerald-100 text-emerald-900'
                          : feasibility.status === 'transfer_needed'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-rose-100 text-rose-900'
                      }`}>
                        {feasibility.labelAr}
                      </span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1 font-mono">
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">أمر #{order.orderNumber}</span>
                      <span>[{order.finishedProductId}]</span>
                      <span>•</span>
                      <span>{order.packagingOptionNameAr}</span>
                      <span>•</span>
                      <span>{order.plannedQtyLarge} {order.outputLargeUnit} ({Number(order.plannedQtySmall).toLocaleString()} {order.outputSmallUnit})</span>
                      {order.isRework && (() => {
                        const orig = getOriginalReturnQty(order);
                        return orig ? (
                          <span className="font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1 font-sans">
                            <RotateCcw className="h-3 w-3 text-purple-600" />
                            <span>{isAr ? 'أصل المرتجع:' : 'Orig Return:'} <b className="font-mono">{orig.qtyLarge} {orig.largeUnit} ({orig.qtySmall} {orig.smallUnit})</b></span>
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFeasibilityModalData(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Actionable Notice Banners */}
              {shortageComps.length > 0 && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-950">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-rose-900 mb-0.5">
                      {isAr ? `تنبيه: يوجد عجز في عدد (${shortageComps.length}) خامات بمستودعات الشركة بالكامل:` : `Material Shortage Alert:`}
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 font-medium text-[11px] text-rose-900">
                      {shortageComps.map((c, i) => (
                        <li key={i}>
                          <b>{c.materialNameAr} [{c.itemId}]</b>: {isAr ? 'المطلوب' : 'Needed'} {c.neededQty.toLocaleString()} {c.unit} | {isAr ? 'المتوفر كلياً' : 'Available'} {c.totalCompanyStock.toLocaleString()} {c.unit} (<span className="font-bold text-rose-700">{isAr ? 'عجز' : 'Deficit'}: -{c.shortageDeficit.toLocaleString()} {c.unit}</span>)
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {shortageComps.length === 0 && transferComps.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-950">
                  <ArrowLeftRight className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-amber-900 mb-0.5">
                      {isAr ? `الخامات متوفرة بالمستودعات ولكن يلزم تحويلها لصالة الإنتاج (${factoryWarehouse?.nameAr || 'مخزن التشغيل'}):` : `Staging Transfer Required:`}
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 font-medium text-[11px] text-amber-900">
                      {transferComps.map((c, i) => (
                        <li key={i}>
                          <b>{c.materialNameAr} [{c.itemId}]</b>: {isAr ? 'المطلوب بالصالة' : 'Needed'} {c.neededQty.toLocaleString()} {c.unit} | {isAr ? 'المتاح بالصالة' : 'Floor Stock'} {c.floorStock.toLocaleString()} {c.unit} (<span className="font-bold text-amber-800">{isAr ? 'مطلوب تحويل' : 'Transfer'}: {c.transferDeficit.toLocaleString()} {c.unit}</span>)
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {feasibility.status === 'floor_ready' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-950 font-bold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>{isAr ? 'كافة خامات التعبئة والتغليف (Flag F) متوفرة وجاهزة بصالة الإنتاج بنسبة 100% لبدء التشغيل.' : 'All packaging materials are 100% available on the production floor.'}</span>
                </div>
              )}

              {/* Itemized Components Availability: Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-2xl shadow-inner bg-white">
                <table className="w-full text-start border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-2.5 text-center w-10">#</th>
                      <th className="p-2.5 text-start">{isAr ? 'الخامة المكونة (Flag F)' : 'Component Item'}</th>
                      <th className="p-2.5 text-center">{isAr ? 'الكمية القياسية / كرتونة' : 'Std / Carton'}</th>
                      <th className="p-2.5 text-center font-extrabold text-blue-900">{isAr ? 'إجمالي المطلوب للدفعة' : 'Required Qty'}</th>
                      <th className="p-2.5 text-center">{isAr ? 'الرصيد بصالة الإنتاج' : 'Floor Stock'}</th>
                      <th className="p-2.5 text-center">{isAr ? 'إجمالي المستودعات' : 'Total Stock'}</th>
                      <th className="p-2.5 text-center">{isAr ? 'حالة التوفر' : 'Verdict'}</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {comps.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                          {isAr ? 'لا توجد خامات مسجلة في شجرة الـ BOM لهذا الصنف.' : 'No components registered in BOM recipe.'}
                        </td>
                      </tr>
                    ) : (
                      comps.map((c, cIdx) => (
                        <tr key={cIdx} className="hover:bg-slate-50/70 transition">
                          <td className="p-2.5 text-center font-mono font-bold text-slate-400">{cIdx + 1}</td>
                          <td className="p-2.5">
                            <span className="font-bold text-slate-900 block">{c.materialNameAr}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 font-bold">
                                {c.variantCode || c.itemId}
                              </span>
                              {c.specs && <span className="text-[10px] text-slate-400 truncate max-w-xs">({c.specs})</span>}
                            </div>
                          </td>

                          <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                            {c.standardQty} {c.unit}
                          </td>

                          <td className="p-2.5 text-center font-mono font-extrabold text-blue-900 bg-blue-50/40">
                            {c.neededQty.toLocaleString()} {c.unit}
                          </td>

                          <td className="p-2.5 text-center font-mono font-bold">
                            <span className={c.isSufficientOnFloor ? 'text-emerald-700' : 'text-amber-700'}>
                              {c.floorStock.toLocaleString()} {c.unit}
                            </span>
                            {c.priorReservedFloor > 0 && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5" title={isAr ? `إجمالي الفعلي بالصالة: ${c.rawFloorStock?.toLocaleString()} - محجوز لأوامر سابقة: ${c.priorReservedFloor?.toLocaleString()}` : `Total on Floor: ${c.rawFloorStock} - Prior Reserved: ${c.priorReservedFloor}`}>
                                {isAr ? `(محجوز لأسبق: ${c.priorReservedFloor.toLocaleString()})` : `(prior reserved: ${c.priorReservedFloor.toLocaleString()})`}
                              </div>
                            )}
                          </td>

                          <td className="p-2.5 text-center font-mono font-bold">
                            <span className={c.isSufficientOverall ? 'text-slate-800' : 'text-rose-700'}>
                              {c.totalCompanyStock.toLocaleString()} {c.unit}
                            </span>
                            {c.priorReservedCompany > 0 && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5">
                                {isAr ? `(محجوز لأسبق: ${c.priorReservedCompany.toLocaleString()})` : `(prior reserved: ${c.priorReservedCompany.toLocaleString()})`}
                              </div>
                            )}
                          </td>

                          <td className="p-2.5 text-center">
                            {c.isSufficientOnFloor ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                <span>{isAr ? 'جاهز بالصالة' : 'Ready'}</span>
                              </span>
                            ) : c.isSufficientOverall ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                <ArrowLeftRight className="h-3 w-3 text-amber-600" />
                                <span>{isAr ? `تحويل (${c.transferDeficit.toLocaleString()})` : `Transfer (${c.transferDeficit})`}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-300">
                                <AlertCircle className="h-3 w-3 text-rose-600" />
                                <span>{isAr ? `عجز (-${c.shortageDeficit.toLocaleString()})` : `Deficit (-${c.shortageDeficit})`}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Itemized Components Availability: Mobile Adaptive Cards (sm:hidden) */}
              <div className="sm:hidden space-y-2.5">
                {comps.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-400 italic">
                    {isAr ? 'لا توجد خامات مسجلة في شجرة الـ BOM لهذا الصنف.' : 'No components registered in BOM recipe.'}
                  </div>
                ) : (
                  comps.map((c, cIdx) => (
                    <div key={cIdx} className="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div>
                          {/* Material Name is Primary */}
                          <span className="font-bold text-slate-900 text-sm block">{c.materialNameAr}</span>
                          <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 font-bold">
                            {c.variantCode || c.itemId}
                          </span>
                        </div>
                        <div>
                          {c.isSufficientOnFloor ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>{isAr ? 'جاهز بالصالة' : 'Ready'}</span>
                            </span>
                          ) : c.isSufficientOverall ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                              <ArrowLeftRight className="h-3 w-3 text-amber-600" />
                              <span>{isAr ? `يلزم تحويل` : `Transfer`}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-300">
                              <AlertCircle className="h-3 w-3 text-rose-600" />
                              <span>{isAr ? `عجز بالمصنع` : `Deficit`}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-xl text-center text-[11px]">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block">{isAr ? 'المطلوب' : 'Required'}</span>
                          <span className="font-mono font-bold text-blue-900">{c.neededQty.toLocaleString()} {c.unit}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block">{isAr ? 'بالصالة' : 'Floor'}</span>
                          <span className={`font-mono font-bold ${c.isSufficientOnFloor ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {c.floorStock.toLocaleString()} {c.unit}
                          </span>
                          {c.priorReservedFloor > 0 && (
                            <span className="block text-[8px] text-slate-400 font-sans">-{c.priorReservedFloor.toLocaleString()}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block">{isAr ? 'كلياً' : 'Total'}</span>
                          <span className={`font-mono font-bold ${c.isSufficientOverall ? 'text-slate-800' : 'text-rose-700'}`}>
                            {c.totalCompanyStock.toLocaleString()} {c.unit}
                          </span>
                          {c.priorReservedCompany > 0 && (
                            <span className="block text-[8px] text-slate-400 font-sans">-{c.priorReservedCompany.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFeasibilityModalData(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  {isAr ? 'إغلاق النافذة' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Viewport & Screen-Boundary Aware Staff Members & SOP Floating Popover */}
      {activeStaffPopover && (
        <>
          {/* Invisible Backdrop to dismiss on click outside or context menu */}
          <div
            className="fixed inset-0 z-[9990]"
            onClick={() => setActiveStaffPopover(null)}
          />

          {/* Floating Popover Card */}
          <div
            style={activeStaffPopover.style}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 text-xs select-text space-y-2.5 flex flex-col z-[9999]"
          >
            {/* Popover Header: Title + Process Name + Close */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-indigo-600" />
                  <h5 className="font-extrabold text-xs text-slate-900">
                    {isAr ? 'طاقم العمل وتوزيع المسؤوليات' : 'Staff Members & Step Staffing'}
                  </h5>
                </div>

                {/* Process Name Badge */}
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-lg w-fit">
                  <Workflow className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
                  <span className="truncate">
                    {activeStaffPopover.palletProcessCode ? `[${activeStaffPopover.palletProcessCode}] ` : ''}
                    {activeStaffPopover.palletProcessName}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveStaffPopover(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Popover Body: Scrollable step list */}
            <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
              {activeStaffPopover.hasSteps ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(activeStaffPopover.pallet.stepStaffing || []).map((step) => {
                    const workers = step.workers || [];
                    if (workers.length === 0 && !step.mandatory) return null;
                    return (
                      <div key={step.stepNum} className="p-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-[10px] flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 truncate">
                          <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 font-mono text-[9px] font-bold flex items-center justify-center shrink-0">
                            {step.stepNum}
                          </span>
                          <span className="font-bold text-slate-800 truncate">{step.stepName}:</span>
                          {step.mandatory && <span className="text-[8px] text-emerald-600 font-black">★</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 justify-end">
                          {workers.length > 0 ? (
                            workers.map((w, wIdx) => (
                              <span key={wIdx} className="px-1.5 py-0.2 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded font-semibold text-[9px]">
                                {w.workerName}
                              </span>
                            ))
                          ) : (
                            <span className="text-amber-600 text-[9px] italic">{isAr ? 'غير محدد' : 'Unassigned'}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {(activeStaffPopover.pallet.crew || []).map((member, mIdx) => (
                    <span key={mIdx} className="px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-md text-[10px] font-semibold">
                      👤 {member.name} ({member.role})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Popover Footer Summary */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium shrink-0">
              <span>
                {isAr ? `إجمالي العمال: ${activeStaffPopover.assignedWorkerNames.length}` : `Total Workers: ${activeStaffPopover.assignedWorkerNames.length}`}
              </span>
              <span>
                {isAr ? `إجمالي الخطوات: ${activeStaffPopover.stepsCount}` : `Total Steps: ${activeStaffPopover.stepsCount}`}
              </span>
            </div>
          </div>
        </>
      )}

      {/* High-Resolution In-App Image Preview Lightbox Popover */}
      {imagePreviewModal && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-150"
          onClick={() => setImagePreviewModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 space-y-3 relative flex flex-col items-center max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center w-full border-b border-slate-100 pb-2.5">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">{imagePreviewModal.title}</h4>
                {imagePreviewModal.subtitle && (
                  <span className="text-[11px] font-mono text-blue-700 font-bold block mt-0.5">
                    {imagePreviewModal.subtitle}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImagePreviewModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="w-full flex-1 flex items-center justify-center bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3 overflow-hidden min-h-[320px] max-h-[65vh]">
              <img
                src={imagePreviewModal.url}
                alt={imagePreviewModal.title || 'Preview'}
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-sm"
              />
            </div>

            <div className="flex justify-end w-full pt-1">
              <button
                type="button"
                onClick={() => setImagePreviewModal(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. MODAL: FIXES REQUIRED & PENDING REWORKS (تصليحات مطلوبة) */}
      {showFixesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl">
                  <Wrench className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'إدارة التصليحات ومرتجعات الإنتاج' : 'Pending Fixes & Rework Manager'}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-black ${reworkBadgeColorClass}`}>
                      {uniqueProductsAwaitingFixCount} {isAr ? 'أصناف معيبة بالصالة' : 'Floor Ready'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAr
                      ? 'الأصناف المستلمة بصالة الإنتاج والمطلوب إدراجها بالخطة لإعادة التصليح واستبدال التالف.'
                      : 'Defective products received on the factory floor awaiting rework planning and salvage.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFixesModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Product Cards List */}
            {floorReadyProductsMap.size === 0 ? (
              <div className="p-10 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <h4 className="font-bold text-sm text-slate-800">
                  {isAr ? 'لا توجد أصناف معيبة بانتظار التصليح بالصالة' : 'No defective products awaiting fix'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {isAr
                    ? 'كافة المرتجعات التي تم استلامها بالصالة تمت جدولتها أو تسويتها بالكامل.'
                    : 'All returns received on the floor have been scheduled or resolved.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from(floorReadyProductsMap.values()).map((prod) => {
                  const isScheduledToday = scheduledProductIdsToday.has(prod.finishedProductId);

                  return (
                    <div
                      key={prod.aggKey || prod.finishedProductId}
                      className={`p-4 rounded-2xl border transition space-y-3 shadow-2xs ${
                        isScheduledToday
                          ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200'
                          : 'bg-white border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 pb-2.5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-extrabold text-sm text-slate-900">{prod.productNameAr}</h4>
                            <span className="font-mono text-xs text-slate-500 font-bold">[{prod.packagingOptionCode || prod.productCode}]</span>
                            {prod.packagingOptionSuffix && (
                              <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md text-[10px] font-bold">
                                {isAr ? `خيار (${prod.packagingOptionSuffix})` : `Option (${prod.packagingOptionSuffix})`}
                                {prod.packagingOptionNameAr && prod.packagingOptionSuffix !== 'A' ? ` - ${prod.packagingOptionNameAr}` : ''}
                              </span>
                            )}
                            {isScheduledToday && (
                              <span className="px-2 py-0.5 bg-rose-600 text-white rounded-md text-[10px] font-black animate-pulse flex items-center gap-1 shadow-2xs">
                                <Sparkles className="h-3 w-3" />
                                <span>{isAr ? `مجدول بالخطة اليوم (${selectedPlanDate}) - فرصة تصليح ممتازة!` : 'Scheduled in Plan Today!'}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {isAr ? 'إشعارات المرتجع المصدرية:' : 'Source Vouchers:'}{' '}
                            <span className="font-mono font-bold text-slate-700">
                              {prod.vouchers.map((v) => v.id).join('، ')}
                            </span>
                          </div>
                        </div>

                        {/* Direct Action Button */}
                        <button
                          type="button"
                          onClick={() => handleAddProductReworkToPlan(prod)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                          <span>{isAr ? 'إدراج كأمر تصليح بالخطة' : 'Add Rework to Plan'}</span>
                        </button>
                      </div>

                      {/* Quantity & Tags Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2.5 bg-white/80 rounded-xl border border-black/5">
                          <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'إجمالي الكراتين المعيبة:' : 'Defective Cartons:'}</span>
                          <span className="font-mono font-extrabold text-amber-900 text-sm">
                            {prod.totalQtyLarge} {prod.largeUnit}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white/80 rounded-xl border border-black/5">
                          <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'إجمالي العبوات الفعلية:' : 'Actual Units:'}</span>
                          <span className="font-mono font-extrabold text-slate-900 text-sm">
                            {prod.totalQtySmall} {prod.smallUnit}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white/80 rounded-xl border border-black/5">
                          <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'معيار التعبئة:' : 'Packaging Ratio:'}</span>
                          <span className="font-mono font-bold text-slate-700 text-xs">
                            1 {prod.largeUnit} = {prod.packagingRatio} {prod.smallUnit}
                          </span>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${prod.missingSmallUnits > 0 ? 'bg-amber-100/70 border-amber-300' : 'bg-white/80 border-black/5'}`}>
                          <span className="text-[10px] text-slate-600 font-bold block">{isAr ? 'نواقص إكمال الكراتين:' : 'Missing Units to Complete:'}</span>
                          <span className="font-mono font-extrabold text-xs">
                            {prod.missingSmallUnits > 0 ? (
                              <span className="text-amber-950 font-black">+{prod.missingSmallUnits} {isAr ? 'عبوة مطلوبة' : 'needed'}</span>
                            ) : (
                              <span className="text-emerald-700">✓ {isAr ? 'الكراتين كاملة العدد' : 'Full Cartons'}</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Defect Tags & Batch Codes */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        <span className="font-bold text-slate-600">{isAr ? 'عيوب مسجلة:' : 'Fault Tags:'}</span>
                        {Array.from(prod.faultTags).map((tag, tIdx) => (
                          <span key={tIdx} className="px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-md font-bold text-[10px]">
                            {tag}
                          </span>
                        ))}

                        {prod.batchCodes.size > 0 && (
                          <span className="text-slate-400 ms-2 font-mono text-[10px]">
                            {isAr ? 'تشغيلات طباعة:' : 'Batches:'} {Array.from(prod.batchCodes).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFixesModal(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL: PENDING FLOOR RECEIPT HANDSHAKE (تأكيد استلام مرتجعات بالصالة) */}
      {showFloorReceiptsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl">
                  <PackageCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'تأكيد استلام مرتجعات بصالة الإنتاج' : 'Confirm Floor Receipts Handshake'}</span>
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full font-mono text-xs font-black">
                      {pendingAcceptanceReturns.length} {isAr ? 'إشعارات بانتظار الاستلام' : 'pending'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAr
                      ? 'مراجعة المرتجعات المعيبة المحولة من مستودع المنتج التام أو المبيعات وتأكيد نقل العهدة لصالة الإنتاج.'
                      : 'Inspect defective returns and confirm custody transfer onto the production floor.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFloorReceiptsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* List of Pending Vouchers */}
            <div className="space-y-3">
              {pendingAcceptanceReturns.map((voucher) => {
                const itemsList = Array.isArray(voucher.items) && voucher.items.length > 0
                  ? voucher.items
                  : [{
                      productNameAr: voucher.productNameAr,
                      productCode: voucher.productCode,
                      qtyLarge: voucher.qtyLarge,
                      largeUnit: voucher.largeUnit,
                      qtySmall: voucher.qtySmall,
                      smallUnit: voucher.smallUnit,
                    }];

                return (
                  <div key={voucher.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-xs text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-lg">
                            {voucher.id}
                          </span>
                          <span className="text-xs text-slate-500 font-mono font-bold">{voucher.returnDate}</span>
                          <span className="text-[11px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md font-bold">
                            {voucher.sourceType === 'sales_return' ? (isAr ? 'مرتجع مبيعات/سيارات' : 'Sales Return') : (isAr ? 'مستودع المنتج التام' : 'FG Warehouse')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {isAr ? 'المسؤول المُسجل:' : 'Submitted By:'} <b className="text-slate-700">{voucher.submittedBy?.userName}</b>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConfirmFloorReceipt(voucher.id)}
                        disabled={isSaving}
                        className={`px-4 py-1.5 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${voucher.reconfirmationRequired ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{voucher.reconfirmationRequired ? (isAr ? 'إعادة تأكيد استلام بعد التعديل' : 'Re-confirm Receipt') : (isAr ? 'تأكيد استلام هذا المرتجع' : 'Confirm Receipt')}</span>
                      </button>
                    </div>

                    {/* Reconfirmation Alert Banner */}
                    {voucher.reconfirmationRequired && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>{isAr ? 'تنبيه: تم تعديل هذا الإشعار بعد تأكيد استلامه سابقاً - يتطلب إعادة تأكيد الاستلام بناءً على التعديلات التالية:' : 'Notice: This voucher was edited after previous receipt. Re-confirmation required:'}</span>
                        </div>
                        {Array.isArray(voucher.reconfirmationNotice) && voucher.reconfirmationNotice.length > 0 && (
                          <ul className="list-disc list-inside ps-2 text-[11px] text-amber-800 space-y-0.5">
                            {voucher.reconfirmationNotice.map((note, nIdx) => (
                              <li key={nIdx}>{note}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Items table / badges */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-500 block">{isAr ? 'الأصناف المتضمنة بالمرتجع:' : 'Returned Products:'}</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {itemsList.map((item, iIdx) => (
                          <div key={iIdx} className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs flex justify-between items-start gap-2">
                            <div>
                              <div className="font-bold text-slate-800">{item.productNameAr}</div>
                              <span className="font-mono text-[10px] text-slate-500 block">[{item.productCode}]</span>
                              {Array.isArray(item.faultTags) && item.faultTags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.faultTags.map((t, tIdx) => (
                                    <span key={tIdx} className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-bold">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-end font-mono font-bold text-amber-900 shrink-0">
                              <div>{item.qtyLarge} {item.largeUnit || 'كرتونة'}</div>
                              <div className="text-[10px] text-slate-500">({item.qtySmall} {item.smallUnit || 'عبوة'})</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {(!voucher.items || voucher.items.length <= 1) && voucher.faultTags && (
                      <div className="text-[11px] text-slate-600 flex items-center gap-1">
                        <span className="font-bold">{isAr ? 'العيوب:' : 'Faults:'}</span>
                        <span>{Array.isArray(voucher.faultTags) ? voucher.faultTags.join('، ') : voucher.faultTags}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowFloorReceiptsModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              {pendingAcceptanceReturns.length > 1 && (
                <button
                  type="button"
                  onClick={handleConfirmAllFloorReceipts}
                  disabled={isSaving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? `تأكيد استلام كلي (${pendingAcceptanceReturns.length})` : 'Confirm All Receipts'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL: REWORK RECONCILIATION MATRIX & STATEMENT (تسوية خامات أمر التصليح) */}
      {showReworkReconcileModal && reconcilingOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div
            className="bg-white rounded-3xl max-w-5xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto"
            onClick={() => setPinnedMatrixTooltip(null)}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'تسوية ومطابقة خامات أمر التصليح (Rework Material Matrix)' : 'Rework Material Reconciliation'}</span>
                    <span className="font-mono text-xs font-extrabold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-lg">
                      #{reconcilingOrder.orderNumber}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5 flex flex-wrap items-center gap-2">
                    <span>
                      {reconcilingOrder.productNameAr} • {reconcilingOrder.plannedQtyLarge} {reconcilingOrder.outputLargeUnit || 'كرتونة'} ({reconcilingOrder.plannedQtySmall} {reconcilingOrder.outputSmallUnit || 'عبوة'})
                    </span>
                    {(() => {
                      const orig = getOriginalReturnQty(reconcilingOrder);
                      return orig ? (
                        <span className="px-2.5 py-0.5 bg-purple-100 text-purple-900 border border-purple-200 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs">
                          <RotateCcw className="h-3 w-3 text-purple-600" />
                          <span>{isAr ? 'أصل المرتجع المستلم:' : 'Orig Received Return:'}</span>
                          <b className="font-mono">{orig.qtyLarge} {orig.largeUnit} ({orig.qtySmall} {orig.smallUnit})</b>
                        </span>
                      ) : null;
                    })()}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowReworkReconcileModal(false);
                  setPinnedMatrixTooltip(null);
                  setHoveredMatrixTooltip(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Reconciliation Table Controls Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100/80 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  {isAr ? 'جدول تسوية ومطابقة الخامات المعتمدة للتشغيلة:' : 'Material Reconciliation Table:'}
                </span>
                {Number(reconcilingOrder.missingSmallUnits) > 0 && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-200 rounded-full font-bold text-[10px]">
                    {isAr ? `نواقص كرتونة كسر: +${reconcilingOrder.missingSmallUnits} ${reconcilingOrder.outputSmallUnit || 'عبوة'}` : `Missing: +${reconcilingOrder.missingSmallUnits} units`}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleAutoBalanceAllMatrix}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{isAr ? 'موازنة تلقائية لجميع الخامات' : 'Auto-balance All'}</span>
              </button>
            </div>

            {/* Reconciliation Table (Scheme) */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 text-start w-52 align-top">{isAr ? 'الإجراء / الحالة' : 'Action / Status'}</th>
                    {Object.values(reconcileMatrixData).map((col) => {
                      const itemDoc = itemsMaster.find((i) => i.id === col.itemId || i.code === col.itemId);
                      const variations = itemDoc?.variations || [];
                      const itemLots = Object.values(liveStockMatrix?.lotMap || {})
                        .filter((l) => l.itemId === col.itemId && l.availableQty > 0);

                      return (
                        <th key={col.itemId} className="p-3 text-center min-w-[155px] align-top">
                          <div className="font-extrabold text-slate-900 text-xs">{col.itemNameAr}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            [{col.itemCode || col.itemId}]
                          </div>
                          <div className="text-[10px] text-blue-900 font-mono mt-0.5 font-black bg-blue-50 py-0.5 px-1 rounded border border-blue-200 inline-block">
                            {isAr ? 'مطلوب للتشغيلة:' : 'Req:'} {col.nominalQty} {col.unit}
                          </div>

                          {/* Variant & LOT Controls / Badges */}
                          <div className="mt-2 space-y-1 text-start bg-slate-50/80 p-1.5 rounded-lg border border-slate-200">
                            {/* Variant */}
                            {variations.length > 0 ? (
                              <div>
                                <label className="text-[9px] text-slate-500 font-bold block mb-0.5">{isAr ? 'النوع / المتغير:' : 'Variant:'}</label>
                                <VariantComboBox
                                  variations={variations}
                                  value={col.variantCode || ''}
                                  onChange={(val) => handleUpdateMatrixField(col.itemId, 'variantCode', val)}
                                  allowGeneric={true}
                                  genericLabel={isAr ? '-- القياسي --' : '-- Standard --'}
                                  isAr={isAr}
                                  size="sm"
                                />
                              </div>
                            ) : col.variantCode ? (
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-slate-500 font-bold">{isAr ? 'النوع:' : 'Var:'}</span>
                                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-bold">
                                  {col.variantCode}
                                </span>
                              </div>
                            ) : null}

                            {/* LOT */}
                            <div>
                              <label className="text-[9px] text-slate-500 font-bold block mb-0.5">{isAr ? 'رقم التشغيلة (LOT):' : 'LOT Number:'}</label>
                              <select
                                value={col.lotNumber || ''}
                                onChange={(e) => {
                                  const selLotNo = e.target.value;
                                  const matched = itemLots.find((l) => l.lotNumber === selLotNo);
                                  handleUpdateMatrixField(col.itemId, 'lotNumber', selLotNo);
                                  if (matched?.unitCost) {
                                    handleUpdateMatrixField(col.itemId, 'unitCost', matched.unitCost);
                                  }
                                }}
                                className="w-full text-[9px] p-1 bg-white border border-slate-200 rounded font-mono text-slate-800"
                              >
                                <option value="">{isAr ? 'FIFO (تلقائي حسب أقدم تشغيلة)' : 'FIFO (Auto Oldest Lot)'}</option>
                                {itemLots.map((l) => (
                                  <option key={l.lotNumber} value={l.lotNumber}>
                                    {formatLotLabel(l, isAr)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {/* Row 1: Distinct Fraction Top-up (إكمال نواقص الكرتونة الكسر - بدون هالك) */}
                  <tr className="bg-purple-50/40">
                    <td className="p-3 font-bold text-purple-950">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-purple-600 shrink-0"></span>
                        <span className="whitespace-nowrap">{isAr ? 'إكمال نواقص الكرتونة الكسر' : 'Fraction Top-up'}</span>
                        {renderMatrixTooltip(
                          'fractionTopUp',
                          isAr ? 'إكمال نواقص الكرتونة الكسر' : 'Fraction Top-up',
                          isAr ? 'خامات مضافة لاستكمال كسر الكرتونة إلى كرتونة تامة - بدون هالك' : 'Top-up loose fraction to whole carton - zero scrap',
                          {
                            button: 'text-purple-600 hover:text-purple-800 hover:bg-purple-100/70',
                            title: 'text-purple-400',
                            dot: 'bg-purple-500',
                          },
                          'down'
                        )}
                      </div>
                    </td>
                    {Object.entries(reconcileMatrixData).map(([key, col]) => (
                      <td key={key} className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step={col.allowFractions ? "0.001" : "1"}
                            value={col.fractionTopUpQty}
                            onChange={(e) => handleUpdateMatrixField(key, 'fractionTopUpQty', e.target.value)}
                            className="w-20 p-1.5 bg-white border border-purple-300 rounded-lg text-center font-mono font-bold text-xs focus:ring-2 focus:ring-purple-500"
                          />
                          <span className="text-[10px] font-bold text-slate-500">{col.unit}</span>
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row 2: Defect Replacement (استبدال تالف ومكهن - يقابله هالك) */}
                  <tr className="bg-amber-50/40">
                    <td className="p-3 font-bold text-amber-950">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0"></span>
                        <span className="whitespace-nowrap">{isAr ? 'استبدال خامات تالفة (تكهين)' : 'Defect Replacement'}</span>
                        {renderMatrixTooltip(
                          'replaceDefect',
                          isAr ? 'استبدال خامات تالفة (تكهين)' : 'Defect Replacement',
                          isAr ? 'خامات جديدة مستهلكة لاستبدال القطع التالفة بالصالة - يقابلها هالك' : 'Replacement for defective parts - generates scrap',
                          {
                            button: 'text-amber-600 hover:text-amber-800 hover:bg-amber-100/70',
                            title: 'text-amber-400',
                            dot: 'bg-amber-500',
                          },
                          'down'
                        )}
                      </div>
                    </td>
                    {Object.entries(reconcileMatrixData).map(([key, col]) => (
                      <td key={key} className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step={col.allowFractions ? "0.001" : "1"}
                            value={col.replaceDefectQty}
                            onChange={(e) => handleUpdateMatrixField(key, 'replaceDefectQty', e.target.value)}
                            className="w-20 p-1.5 bg-white border border-amber-300 rounded-lg text-center font-mono font-bold text-xs focus:ring-2 focus:ring-amber-500"
                          />
                          <span className="text-[10px] font-bold text-slate-500">{col.unit}</span>
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row 3: Scrapped / Vendor Return with Destination WH */}
                  <tr className="bg-rose-50/30">
                    <td className="p-3 font-bold text-rose-950">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0"></span>
                        <span className="whitespace-nowrap">{isAr ? 'خامات تالفة موجهة للهالك' : 'Scrapped / Floor Staged'}</span>
                        {renderMatrixTooltip(
                          'scrapped',
                          isAr ? 'خامات تالفة موجهة للهالك' : 'Scrapped / Floor Staged',
                          isAr ? 'تُحفظ في عهدة الصالة بانتظار الترحيل للمستودع المحدد' : 'Staged on floor for designated warehouse transfer',
                          {
                            button: 'text-rose-600 hover:text-rose-800 hover:bg-rose-100/70',
                            title: 'text-rose-400',
                            dot: 'bg-rose-500',
                          },
                          'up'
                        )}
                      </div>
                    </td>
                    {Object.entries(reconcileMatrixData).map(([key, col]) => (
                      <td key={key} className="p-2.5 text-center">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step={col.allowFractions ? "0.001" : "1"}
                              value={col.scrappedQty}
                              onChange={(e) => handleUpdateMatrixField(key, 'scrappedQty', e.target.value)}
                              className="w-20 p-1.5 bg-white border border-rose-300 rounded-lg text-center font-mono font-bold text-xs focus:ring-2 focus:ring-rose-500"
                            />
                            <span className="text-[10px] font-bold text-slate-500">{col.unit}</span>
                          </div>

                          {Number(col.scrappedQty) > 0 && (
                            <select
                              value={col.targetWarehouseId}
                              onChange={(e) => {
                                const newWh = e.target.value;
                                setReconcileMatrixData((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key], targetWarehouseId: newWh }
                                }));
                              }}
                              className="w-full text-[10px] p-1 bg-white border border-rose-200 rounded font-semibold text-slate-800"
                              title={isAr ? 'المستودع المستهدف لترحيل هذا الهالك' : 'Destination Warehouse'}
                            >
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {isAr ? w.nameAr : w.nameEn || w.nameAr}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row 4: Preserved / Untouched in Product */}
                  <tr className="bg-emerald-50/30">
                    <td className="p-3 font-bold text-emerald-950">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <span className="whitespace-nowrap">{isAr ? 'سليم ومحفوظ بدون تغيير' : 'Preserved in Product'}</span>
                        {renderMatrixTooltip(
                          'preserved',
                          isAr ? 'سليم ومحفوظ بدون تغيير' : 'Preserved in Product',
                          isAr ? 'خامات سليمة محفوظة بالمنتج المعاد تصليحه' : 'Sound components preserved in FG',
                          {
                            button: 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100/70',
                            title: 'text-emerald-400',
                            dot: 'bg-emerald-500',
                          },
                          'up'
                        )}
                      </div>
                    </td>
                    {Object.entries(reconcileMatrixData).map(([key, col]) => (
                      <td key={key} className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step={col.allowFractions ? "0.001" : "1"}
                            value={col.preservedQty}
                            onChange={(e) => handleUpdateMatrixField(key, 'preservedQty', e.target.value)}
                            className="w-20 p-1.5 bg-white border border-emerald-300 rounded-lg text-center font-mono font-bold text-xs focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="text-[10px] font-bold text-slate-500">{col.unit}</span>
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row 5: Material Balance & Conservation Check */}
                  <tr className="bg-slate-100/60 font-bold border-t-2 border-slate-300">
                    <td className="p-3 text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <Scale className="h-4 w-4 text-blue-700 shrink-0" />
                        <span className="whitespace-nowrap">{isAr ? 'حالة الموازنة والتحقق:' : 'Balance Verification:'}</span>
                        {renderMatrixTooltip(
                          'balance',
                          isAr ? 'حالة الموازنة والتحقق' : 'Balance Verification',
                          isAr ? 'المعاد تصليحه = السليم المحفوظ + نواقص الكرتونة الكسر + استبدال التالف (تكهين)' : 'Total Rework = Preserved + Fraction Top-up + Defect Replacement',
                          {
                            button: 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/70',
                            title: 'text-blue-400',
                            dot: 'bg-blue-500',
                          },
                          'up'
                        )}
                      </div>
                    </td>
                    {Object.entries(reconcileMatrixData).map(([key, col]) => {
                      const sum = parseFloat(((Number(col.preservedQty) || 0) + (Number(col.fractionTopUpQty) || 0) + (Number(col.replaceDefectQty) || 0)).toFixed(4));
                      const nominal = parseFloat((Number(col.nominalQty) || 0).toFixed(4));
                      const isBalanced = Math.abs(sum - nominal) < 0.001;
                      const diff = parseFloat((sum - nominal).toFixed(4));

                      return (
                        <td key={key} className={`p-2.5 text-center align-middle ${isBalanced ? 'bg-emerald-50/50' : 'bg-rose-50/80'}`}>
                          {isBalanced ? (
                            <div className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-[10px] font-black shadow-2xs">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{isAr ? 'متطابق تماماً' : 'Balanced'}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 rounded-lg text-[10px] font-black shadow-2xs">
                                <AlertTriangle className="h-3 w-3 text-rose-600" />
                                <span>{diff > 0 ? `+${diff}` : diff} {col.unit}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAutoBalanceMatrixRow(key)}
                                className="block mx-auto text-[9px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                              >
                                {isAr ? 'موازنة تلقائية' : 'Auto-balance'}
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* REAL-TIME DYNAMIC SUMMARY CHIPS & CARDS */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{isAr ? 'ملخص تسوية الخامات والنتيجة النهائية:' : 'Reconciliation Summary & Final Output:'}</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500 font-bold">
                  #{reconcilingOrder.orderNumber}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                {/* 1. Preserved in Product Card */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                    <span>{isAr ? 'سليم بالمنتج' : 'Preserved'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(reconcileMatrixData).filter((r) => Number(r.preservedQty) > 0).length === 0 ? (
                      <span className="text-[10px] text-slate-400">{isAr ? 'لا يوجد' : 'None'}</span>
                    ) : (
                      Object.values(reconcileMatrixData).filter((r) => Number(r.preservedQty) > 0).map((r) => (
                        <div
                          key={r.itemId}
                          className="w-full flex items-center justify-between p-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-bold text-emerald-950 shadow-2xs"
                        >
                          <span className="truncate">{r.itemNameAr}</span>
                          <span className="font-mono text-xs font-black text-emerald-800 shrink-0">
                            {r.preservedQty} {r.unit}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2. Fraction Top-up Card */}
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-purple-900 font-bold text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-purple-600"></span>
                    <span>{isAr ? 'إكمال نواقص الكسر' : 'Fraction Top-up'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(reconcileMatrixData).filter((r) => Number(r.fractionTopUpQty) > 0).length === 0 ? (
                      <span className="text-[10px] text-slate-400">{isAr ? 'لا توجد نواقص' : 'None'}</span>
                    ) : (
                      Object.values(reconcileMatrixData).filter((r) => Number(r.fractionTopUpQty) > 0).map((r) => (
                        <div
                          key={r.itemId}
                          className="w-full flex items-center justify-between p-1.5 bg-white border border-purple-200 rounded-lg text-xs font-bold text-purple-950 shadow-2xs"
                        >
                          <span className="truncate">{r.itemNameAr}</span>
                          <span className="font-mono text-xs font-black text-purple-800 shrink-0">
                            +{r.fractionTopUpQty} {r.unit}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Defect Replacement Card */}
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                    <span>{isAr ? 'استبدال تالف' : 'Defect Replacement'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(reconcileMatrixData).filter((r) => Number(r.replaceDefectQty) > 0).length === 0 ? (
                      <span className="text-[10px] text-slate-400">{isAr ? 'لا يوجد استبدال' : 'None'}</span>
                    ) : (
                      Object.values(reconcileMatrixData).filter((r) => Number(r.replaceDefectQty) > 0).map((r) => (
                        <div
                          key={r.itemId}
                          className="w-full flex items-center justify-between p-1.5 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-950 shadow-2xs"
                        >
                          <span className="truncate">{r.itemNameAr}</span>
                          <span className="font-mono text-xs font-black text-amber-800 shrink-0">
                            {r.replaceDefectQty} {r.unit}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 4. Scrapped / Staged on Floor Card */}
                <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-rose-900 font-bold text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                    <span>{isAr ? 'هالك بالصالة' : 'Scrapped (Staged)'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(reconcileMatrixData).filter((r) => Number(r.scrappedQty) > 0).length === 0 ? (
                      <span className="text-[10px] text-slate-400">{isAr ? 'لا يوجد هالك' : 'None'}</span>
                    ) : (
                      Object.values(reconcileMatrixData).filter((r) => Number(r.scrappedQty) > 0).map((r) => (
                        <div
                          key={r.itemId}
                          className="w-full flex items-center justify-between p-1.5 bg-white border border-rose-200 rounded-lg text-xs font-bold text-rose-950 shadow-2xs"
                        >
                          <span className="truncate">{r.itemNameAr}</span>
                          <span className="font-mono text-xs font-black text-rose-700 shrink-0">
                            {r.scrappedQty} {r.unit}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 5. Final Output Card */}
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
                    <span>{isAr ? 'الناتج النهائي' : 'Final Output'}</span>
                  </div>
                  <div className="p-2 bg-white border border-blue-200 rounded-lg text-center space-y-0.5 shadow-2xs">
                    <div className="font-mono font-black text-sm text-blue-900">
                      {reconcilingOrder.plannedQtyLarge} <span className="text-xs font-bold">{reconcilingOrder.outputLargeUnit || 'كرتونة'}</span>
                    </div>
                    <div className="text-[10px] text-blue-700 font-medium">
                      ({reconcilingOrder.plannedQtySmall} {reconcilingOrder.outputSmallUnit || 'عبوة'}) مطابق
                    </div>
                  </div>
                  <div className="text-[9px] text-center text-blue-600 font-bold">
                    {isAr ? '✅ منتج تام سليم' : '✅ Sound FG'}
                  </div>
                </div>
              </div>
            </div>

            {/* Material Quantity Mismatch Error Banner */}
            {validateReconcileMatrix(reconcileMatrixData).length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs shadow-2xs">
                <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-rose-950 text-xs">
                      {isAr
                        ? 'تنبيه: لا يمكن حفظ التسوية حتى يتم موازنة كميات جميع الخامات تماماً مع متطلبات الـ BOM:'
                        : 'Attention: Cannot save reconciliation until all materials balance with BOM requirements:'}
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoBalanceAllMatrix}
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold transition cursor-pointer"
                    >
                      {isAr ? 'موازنة تلقائية للكل الآن' : 'Auto-balance All'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {validateReconcileMatrix(reconcileMatrixData).map((err) => (
                      <span key={err.itemId} className="px-2 py-0.5 bg-white border border-rose-300 rounded-lg font-bold text-rose-900 shadow-2xs">
                        {err.itemNameAr}: إجمالي المحسوب ({err.totalAccounted}) مقابل المطلوب ({err.nominal} {err.unit}) <span className="text-rose-600 font-mono">[{err.diff > 0 ? `+${err.diff}` : err.diff}]</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowReworkReconcileModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleSaveReworkReconciliation}
                disabled={isSaving || validateReconcileMatrix(reconcileMatrixData).length > 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={validateReconcileMatrix(reconcileMatrixData).length > 0 ? (isAr ? 'يرجى موازنة كميات الخامات أولاً' : 'Please balance quantities first') : ''}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{isSaving ? (isAr ? 'جاري الاعتماد...' : 'Saving...') : (isAr ? 'اعتماد التسوية وإغلاق أمر التصليح' : 'Approve Reconciliation & Close Order')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: ACCUMULATED FLOOR STAGED SCRAP & VENDOR RETURNS (الخامات المتراكمة بالصالة) */}
      {showStagedScrapModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl">
                  <Warehouse className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'خامات تالفة ومرتجعات بالصالة بانتظار الترحيل' : 'Floor Staged Scrap & Returns for Transfer'}</span>
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full font-mono text-xs font-black">
                      {activeStagedFloorMaterials.length} {isAr ? 'بنود' : 'items'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAr
                      ? 'الخامات التالفة أو المرتجعة للموردين المتراكمة بالصالة، مجمعة حسب المستودع المستهدف لإنشاء أذون ترحيل.'
                      : 'Accumulated floor materials grouped by destination warehouse for bulk stock transfer.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowStagedScrapModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Grouped by Target Warehouse */}
            {activeStagedFloorMaterials.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs">
                {isAr ? 'لا توجد أي خامات متراكمة بالصالة حالياً.' : 'No materials currently staged on floor.'}
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from(new Set(activeStagedFloorMaterials.map((m) => m.targetWarehouseId))).map((whId) => {
                  const itemsInWh = activeStagedFloorMaterials.filter((m) => m.targetWarehouseId === whId);
                  const whObj = warehouses.find((w) => w.id === whId);

                  return (
                    <div key={whId} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <Warehouse className="h-4 w-4 text-indigo-600" />
                          <span className="font-extrabold text-sm text-slate-900">
                            {whObj?.nameAr || (isAr ? 'المستودع المستهدف' : 'Target Warehouse')}:
                          </span>
                          <span className="font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200 text-xs">
                            {whObj ? (isAr ? whObj.nameAr : whObj.nameEn || whObj.nameAr) : whId}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">({itemsInWh.length} {isAr ? 'بنود' : 'items'})</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleBulkTransferStagedMaterials(whId)}
                          disabled={isSaving}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                          <span>{isAr ? 'إنشاء إذن ترحيل للمستودع (#TRN)' : 'Create Stock Transfer (#TRN)'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {itemsInWh.map((item) => (
                          <div key={item.id} className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1.5 shadow-2xs">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900 truncate">{item.itemNameAr}</span>
                              <span className="font-mono font-black text-rose-700 text-xs">
                                {item.quantity} {item.unit}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {item.variantCode && (
                                <span className="font-mono text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                                  {item.variantCode}
                                </span>
                              )}
                              {item.lotNumber && (
                                <span className="font-mono text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold">
                                  LOT: {item.lotNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 flex justify-between pt-0.5 border-t border-slate-100">
                              <span>أمر #{item.orderNumber}</span>
                              <span>{item.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStagedScrapModal(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: LOG FLOOR SCRAP / VENDOR RETURN (تسجيل هالك أو مرتجع للمورد) */}
      {showLogFloorScrapModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'تسجيل خامات تالفة أو مرتجعة بالصالة' : 'Log Floor Scrap / Vendor Return'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                    <span>{scrapLogOrder ? `${scrapLogOrder.productNameAr} (أمر #${scrapLogOrder.orderNumber})` : ''}</span>
                    {scrapLogOrder?.isRework && (() => {
                      const orig = getOriginalReturnQty(scrapLogOrder);
                      return orig ? (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 rounded-md font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs">
                          <RotateCcw className="h-3 w-3 text-purple-600 shrink-0" />
                          <span>{isAr ? 'أصل المرتجع:' : 'Orig Return:'}</span>
                          <span className="font-mono font-bold">{orig.qtyLarge}</span>
                          <span>{orig.largeUnit}</span>
                          <span className="text-purple-700 font-normal">({orig.qtySmall} {orig.smallUnit})</span>
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowLogFloorScrapModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLogFloorScrap} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الخامة التالفة (من تركيبة هذا المنتج): *' : 'Material (from Product BOM): *'}
                </label>
                <select
                  value={scrapLogFormData.itemId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const defaults = resolveScrapMaterialDefaults(selId, scrapLogOrder);
                    setScrapLogFormData({
                      ...scrapLogFormData,
                      ...defaults,
                    });
                  }}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-rose-500"
                  required
                >
                  <option value="">{isAr ? '-- اختر الخامة من تركيبة الإنتاج --' : '-- Select Material from BOM --'}</option>
                  {(() => {
                    const recipe = bomRecipes.find((b) => b.id === scrapLogOrder?.bomRecipeId || b.code === scrapLogOrder?.bomRecipeId);
                    const comps = recipe?.components || [];
                    const bomItemIds = new Set(comps.map((c) => c.itemId || c.itemCode).filter(Boolean));
                    const materialsToRender = itemsMaster.filter((i) => bomItemIds.has(i.id) || bomItemIds.has(i.code));
                    const finalMaterialsList = materialsToRender.length > 0 ? materialsToRender : itemsMaster;

                    return finalMaterialsList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code ? `[${item.code}] ` : ''}{isAr ? item.nameAr : item.nameEn || item.nameAr}
                      </option>
                    ));
                  })()}
                </select>
              </div>

              {/* Variant & LOT Selection for Floor Scrap */}
              {(() => {
                const selItemDoc = itemsMaster.find((i) => i.id === scrapLogFormData.itemId || i.code === scrapLogFormData.itemId);
                const variations = selItemDoc?.variations || [];
                const itemLots = Object.values(liveStockMatrix?.lotMap || {})
                  .filter((l) => (l.itemId === scrapLogFormData.itemId || l.itemId === selItemDoc?.id || l.itemId === selItemDoc?.code) && l.availableQty > 0);

                return (
                  <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    {/* Variant Field */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold text-slate-700 text-[11px]">
                          {isAr ? 'النوع / المتغير:' : 'Variant:'}
                        </label>
                        {scrapLogFormData.variantCode && (
                          <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200" title={isAr ? 'تم تحديده تلقائياً بناءً على أمر التشغيل' : 'Auto-selected from Work Order'}>
                            {isAr ? 'تلقائي (قابل للتعديل)' : 'Auto-selected'}
                          </span>
                        )}
                      </div>
                      {variations.length > 0 ? (
                        <VariantComboBox
                          variations={variations}
                          value={scrapLogFormData.variantCode}
                          onChange={(val) => setScrapLogFormData({ ...scrapLogFormData, variantCode: val })}
                          allowGeneric={true}
                          genericLabel={isAr ? '-- القياسي --' : '-- Standard --'}
                          isAr={isAr}
                          size="sm"
                        />
                      ) : (
                        <input
                          type="text"
                          value={scrapLogFormData.variantCode}
                          onChange={(e) => setScrapLogFormData({ ...scrapLogFormData, variantCode: e.target.value })}
                          placeholder={isAr ? 'رمز المتغير (اختياري)...' : 'Variant code...'}
                          className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
                        />
                      )}
                    </div>

                    {/* LOT Number Field */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-bold text-slate-700 text-[11px]">
                          {isAr ? 'رقم التشغيلة (LOT):' : 'LOT Number:'}
                        </label>
                        {scrapLogFormData.lotNumber && (
                          <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200" title={isAr ? 'تم تحديده تلقائياً بناءً على أمر التشغيل' : 'Auto-selected from Work Order'}>
                            {isAr ? 'تلقائي (قابل للتعديل)' : 'Auto-selected'}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <select
                          value={scrapLogFormData.lotNumber}
                          onChange={(e) => {
                            const selectedLotVal = e.target.value;
                            const matched = itemLots.find((l) => l.lotNumber === selectedLotVal);
                            setScrapLogFormData({
                              ...scrapLogFormData,
                              lotNumber: selectedLotVal,
                              unitCost: matched?.unitCost || scrapLogFormData.unitCost,
                            });
                          }}
                          className="w-full p-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-900 text-xs"
                        >
                          <option value="">{isAr ? '-- اختر تشغيلة من المخزون --' : '-- Select Active LOT --'}</option>
                          {itemLots.map((l) => (
                            <option key={l.lotNumber} value={l.lotNumber}>
                              {formatLotLabel(l, isAr)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={scrapLogFormData.lotNumber}
                          onChange={(e) => setScrapLogFormData({ ...scrapLogFormData, lotNumber: e.target.value })}
                          placeholder={isAr ? 'أو أدخل رقم تشغيلة يدوي...' : 'Or enter custom LOT...'}
                          className="w-full p-1 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-700"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const selItemDoc = itemsMaster.find((i) => i.id === scrapLogFormData.itemId || i.code === scrapLogFormData.itemId);
                  const isFrac = selItemDoc ? resolveItemAllowFractions(selItemDoc) : true;
                  return (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الكمية التالفة: *' : 'Quantity: *'}</label>
                      <input
                        type="number"
                        min={isFrac ? "0.001" : "1"}
                        step={isFrac ? "0.001" : "1"}
                        value={scrapLogFormData.quantity}
                        onChange={(e) => {
                          const rawVal = e.target.value;
                          setScrapLogFormData({ 
                            ...scrapLogFormData, 
                            quantity: (rawVal !== '' && !isFrac) ? Math.round(Number(rawVal)) : rawVal 
                          });
                        }}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 text-center"
                        required
                      />
                    </div>
                  );
                })()}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الوحدة:' : 'Unit:'}</label>
                  <input
                    type="text"
                    value={scrapLogFormData.unit}
                    onChange={(e) => setScrapLogFormData({ ...scrapLogFormData, unit: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'المستودع المستهدف لترحيل الهالك: *' : 'Target Destination Warehouse: *'}</label>
                <select
                  value={scrapLogFormData.targetWarehouseId}
                  onChange={(e) => setScrapLogFormData({ ...scrapLogFormData, targetWarehouseId: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-rose-500"
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {isAr ? w.nameAr : w.nameEn || w.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'سبب التلف / التصنيف:' : 'Reason / Classification:'}</label>
                <select
                  value={scrapLogFormData.reason}
                  onChange={(e) => setScrapLogFormData({ ...scrapLogFormData, reason: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                >
                  <option value="تالف أثناء التعبئة">{isAr ? 'تالف أثناء التعبئة والتشغيل' : 'Packaging floor defect'}</option>
                  <option value="عيب صناعة مورد (مرتجع للمورد)">{isAr ? 'عيب صناعة مورد (مرتجع للمورد)' : 'Vendor manufacturing defect'}</option>
                  <option value="كسر عبوات">{isAr ? 'كسر عبوات أو زجاج' : 'Broken bottles'}</option>
                  <option value="خطأ طباعة / ملصق مشوه">{isAr ? 'خطأ طباعة / ملصق مشوه' : 'Mislabeled / bad print'}</option>
                  <option value="هالك شرينك وكرتون">{isAr ? 'هالك شرينك وكرتون' : 'Carton / shrink scrap'}</option>
                  <option value="أخرى">{isAr ? 'أسباب أخرى' : 'Other'}</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'ملاحظات إضافية:' : 'Notes:'}</label>
                <textarea
                  rows="2"
                  value={scrapLogFormData.notes}
                  onChange={(e) => setScrapLogFormData({ ...scrapLogFormData, notes: e.target.value })}
                  placeholder={isAr ? 'تفاصيل العيب أو رقم البالتة...' : 'Defect details...'}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-900 focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowLogFloorScrapModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ في عهدة الصالة' : 'Save to Floor Staging')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: TRANSFER STAGED FINISHED PALLETS TO FINISHED GOODS WAREHOUSE */}
      {showTransferFgModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl">
                  <Boxes className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'ترحيل بالتات المنتج التام إلى مستودع المنتجات التامة' : 'Transfer Pallets to Finished Goods WH'}</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {transferFgGroup
                      ? transferFgGroup.isSinglePallet
                        ? (isAr ? `ترحيل باليتة واحدة (#${transferFgGroup.singlePalletNumber}) للصنف: ${transferFgGroup.productNameAr}` : `Transferring single pallet #${transferFgGroup.singlePalletNumber} of ${transferFgGroup.productNameAr}`)
                        : (isAr ? `ترحيل كافة بالتات الصنف: ${transferFgGroup.productNameAr} (${transferFgGroup.totalPallets} بالتات)` : `Transferring all ${transferFgGroup.totalPallets} pallets of ${transferFgGroup.productNameAr}`)
                      : (isAr ? `ترحيل كافة البالتات المتراكمة بالصالة (${activeStagedFloorPallets.length} بالتات)` : `Transferring all ${activeStagedFloorPallets.length} staged floor pallets`)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowTransferFgModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pallets Cargo Summary */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'بيانات الشحنة والكميات:' : 'Cargo Details:'}</span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold">{isAr ? 'عدد البالتات' : 'Pallets'}</span>
                  <span className="font-mono font-extrabold text-base text-indigo-700">
                    {transferFgGroup ? transferFgGroup.totalPallets : activeStagedFloorPallets.length}
                  </span>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold">{isAr ? 'إجمالي الكراتين' : 'Cartons'}</span>
                  <span className="font-mono font-extrabold text-base text-slate-900">
                    {transferFgGroup
                      ? transferFgGroup.totalQtyLarge
                      : activeStagedFloorPallets.reduce((s, p) => s + (Number(p.qtyLarge) || 0), 0)}
                  </span>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold">{isAr ? 'إجمالي العبوات' : 'Units'}</span>
                  <span className="font-mono font-extrabold text-base text-slate-900">
                    {transferFgGroup
                      ? transferFgGroup.totalQtySmall
                      : activeStagedFloorPallets.reduce((s, p) => s + (Number(p.qtySmall) || 0), 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Target Warehouse Selection */}
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-xs text-slate-700 mb-1">
                  {isAr ? 'مستودع المنتجات التامة المستهدف *' : 'Target Finished Goods Warehouse *'}
                </label>
                <select
                  value={transferFgWarehouseId}
                  onChange={(e) => setTransferFgWarehouseId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500"
                >
                  {finishedGoodsWarehouses.length === 0 ? (
                    <option value="" disabled>
                      {isAr ? '⚠️ لا توجد مستودعات مصنفة كمستودع منتج تام (finished_goods)' : '⚠️ No warehouses classified as finished_goods'}
                    </option>
                  ) : (
                    finishedGoodsWarehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {isAr ? wh.nameAr : wh.nameEn || wh.nameAr} {wh.responsibleUserId ? `(أمين العهدة: ${getUserDisplayName(wh.responsibleUserId)})` : ''}
                      </option>
                    ))
                  )}
                </select>
                {finishedGoodsWarehouses.length === 0 && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    {isAr
                      ? '⚠️ تنبيه: لم يتم تصنيف أي مستودع كمستودع منتجات تامة (finished_goods). يرجى التوجه للوحة الإدارة وضبط تصنيف المستودع المناسب ليظهر هنا.'
                      : '⚠️ Warning: No warehouse is classified as finished_goods. Please configure warehouse classification in the Admin Control Panel.'}
                  </p>
                )}
              </div>

              {/* Custodian Verification Info Box */}
              {(() => {
                const targetWh = warehouses.find((w) => w.id === transferFgWarehouseId);
                const reqId = targetWh?.responsibleUserId || '';
                const isDirect = isGeneralAdmin || (reqId && currentUserId === reqId);

                return (
                  <div className={`p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
                    isDirect ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <ShieldCheck className={`h-5 w-5 shrink-0 mt-0.5 ${isDirect ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <div>
                      <span className="font-extrabold block mb-0.5">
                        {isDirect
                          ? (isAr ? 'اعتماد واستلام فوري (صلاحية مباشرة)' : 'Direct Verification & Inward')
                          : (isAr ? 'يتطلب توقيع واعتماد أمين العهدة' : 'Requires Warehouse Custodian Verification')}
                      </span>
                      <span className="text-[11px] leading-relaxed block">
                        {isDirect
                          ? (isAr ? `أنت مسجل كأمين عهدة لهذا المستودع أو كمسؤول عام، سيتم اعتماد إذن التحويل (#TRN-FG) ونقل البالتات فورياً.` : 'You are authorized to directly verify and receive these pallets.')
                          : (isAr ? `سيتم تصدير إذن التحويل ووضعه في حالة (بانتظار اعتماد أمين العهدة: ${getUserDisplayName(reqId)}) ليقوم بفحصها وتأكيد استلامها.` : `Transfer voucher will be dispatched awaiting custodian confirmation: ${getUserDisplayName(reqId)}.`)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowTransferFgModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleConfirmTransferFg}
                disabled={isSaving || !transferFgWarehouseId || finishedGoodsWarehouses.length === 0}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>{isSaving ? (isAr ? 'جاري الترحيل...' : 'Transferring...') : (isAr ? 'تأكيد الترحيل لمستودع التام' : 'Confirm FG Transfer')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: FLEXIBLE SCRAP & RETURNS ALLOCATION (WITH CUSTOM / PARTIAL QUANTITIES) */}
      {scrapAllocationModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl">
                  <SlidersHorizontal className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'تخصيص وترحيل الهالك / المرتجع' : 'Allocate & Transfer Staged Floor Material'}</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAr
                      ? 'تخصيص كامل أو جزئي للخامة المتراكمة بالصالة وتوجيهها للمستودع المناسب.'
                      : 'Full or partial allocation of floor defectives with destination warehouse assignment.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setScrapAllocationModalItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Item Summary Card */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-extrabold text-sm text-slate-900 block">{scrapAllocationModalItem.itemNameAr}</span>
                  <span className="text-[11px] text-slate-400 font-mono">[{scrapAllocationModalItem.itemCode || scrapAllocationModalItem.itemId}]</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block font-semibold">{isAr ? 'الكمية المتراكمة بالصالة:' : 'Available Staged:'}</span>
                  <span className="font-mono font-black text-rose-700 text-base">
                    {scrapAllocationModalItem.quantity} {scrapAllocationModalItem.unit}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60 text-[10px]">
                {scrapAllocationModalItem.variantCode && (
                  <span className="font-mono bg-white text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                    {scrapAllocationModalItem.variantCode}
                  </span>
                )}
                {scrapAllocationModalItem.lotNumber && (
                  <span className="font-mono bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold">
                    LOT: {scrapAllocationModalItem.lotNumber}
                  </span>
                )}
                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-semibold">
                  {scrapAllocationModalItem.reason}
                </span>
                <span className="font-mono text-slate-500 ms-auto">أمر #{scrapAllocationModalItem.orderNumber}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmScrapAllocation} className="space-y-4 text-xs">
              {/* Destination Warehouse */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'المستودع المستهدف *' : 'Destination Warehouse *'}
                </label>
                <select
                  value={scrapAllocationFormData.targetWarehouseId}
                  onChange={(e) => setScrapAllocationFormData({ ...scrapAllocationFormData, targetWarehouseId: e.target.value })}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-rose-500"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {isAr ? wh.nameAr : wh.nameEn || wh.nameAr} ({wh.classification === 'scrap' ? (isAr ? 'مستودع هالك وتالف' : 'Scrap') : wh.classification === 'returns' ? (isAr ? 'مستودع مرتجعات وحجر' : 'Returns') : wh.classification}) {wh.responsibleUserId ? `- أمين العهدة: ${getUserDisplayName(wh.responsibleUserId)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity to Allocate & Transfer */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-700">
                    {isAr ? 'الكمية المراد ترحيلها الآن *' : 'Quantity to Allocate & Transfer *'}
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {isAr ? 'أقصى حد:' : 'Max:'} {scrapAllocationModalItem.quantity} {scrapAllocationModalItem.unit}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.001"
                    max={Number(scrapAllocationModalItem.quantity)}
                    step="any"
                    required
                    value={scrapAllocationFormData.allocatedQty}
                    onChange={(e) => setScrapAllocationFormData({ ...scrapAllocationFormData, allocatedQty: e.target.value })}
                    className="flex-1 p-2.5 bg-white border border-slate-300 rounded-xl font-mono font-extrabold text-sm text-center text-slate-900 focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 min-w-[60px] text-center flex items-center justify-center">
                    {scrapAllocationModalItem.unit}
                  </span>
                </div>

                {/* Quick presets & remaining balance preview */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setScrapAllocationFormData({ ...scrapAllocationFormData, allocatedQty: Number(scrapAllocationModalItem.quantity) })}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold transition cursor-pointer"
                    >
                      {isAr ? 'كامل الكمية (100%)' : 'All (100%)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScrapAllocationFormData({ ...scrapAllocationFormData, allocatedQty: Number((Number(scrapAllocationModalItem.quantity) / 2).toFixed(2)) })}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold transition cursor-pointer"
                    >
                      {isAr ? 'النصف (50%)' : 'Half (50%)'}
                    </button>
                  </div>

                  {(() => {
                    const rem = Number(scrapAllocationModalItem.quantity) - Number(scrapAllocationFormData.allocatedQty || 0);
                    return (
                      <span className={`text-[11px] font-bold font-mono ${rem > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                        {isAr ? 'المتبقي بالصالة:' : 'Remaining on floor:'} {Math.max(0, Number(rem.toFixed(2)))} {scrapAllocationModalItem.unit}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Custodian Verification Notice */}
              {(() => {
                const targetWh = warehouses.find((w) => w.id === scrapAllocationFormData.targetWarehouseId);
                const reqId = targetWh?.responsibleUserId || '';
                const isDirect = isGeneralAdmin || (reqId && currentUserId === reqId);

                return (
                  <div className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                    isDirect ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <ShieldCheck className={`h-4 w-4 shrink-0 ${isDirect ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <span>
                      {isDirect
                        ? (isAr ? 'ترحيل مباشر: سيتم إيداع الكمية فورياً بالمستودع.' : 'Direct transfer: stock updated immediately.')
                        : (isAr ? `يتطلب موافقة أمين العهدة: ${getUserDisplayName(reqId)} عند استلام الشحنة.` : `Awaiting custodian approval: ${getUserDisplayName(reqId)}.`)}
                    </span>
                  </div>
                );
              })()}

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'ملاحظات التحويل:' : 'Transfer Notes:'}</label>
                <input
                  type="text"
                  value={scrapAllocationFormData.notes}
                  onChange={(e) => setScrapAllocationFormData({ ...scrapAllocationFormData, notes: e.target.value })}
                  placeholder={isAr ? 'سبب الترحيل الجزئي أو رقم الحاوية...' : 'Optional notes...'}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              {/* Form Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setScrapAllocationModalItem(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>{isSaving ? (isAr ? 'جاري الترحيل...' : 'Allocating...') : (isAr ? 'تأكيد التخصيص والترحيل' : 'Confirm Allocation')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GENERAL ADMIN OVERRIDE LINKED LIQUID TANKS                         */}
      {/* ========================================================================= */}
      {tankOverridePallet && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-cyan-50 text-cyan-700 rounded-2xl">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {isAr ? 'تعديل التانكات المرتبطة بالباليتة (Admin Override)' : 'Override Pallet Linked Tanks'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {isAr ? `بالتة #${tankOverridePallet.palletNumber || tankOverridePallet.palletId} • أمر #${tankOverridePallet.orderNumber}` : `Pallet #${tankOverridePallet.palletNumber || tankOverridePallet.palletId}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTankOverridePallet(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTankOverride} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs">
                {isAr
                  ? '⚠️ هذا الإجراء محصور بالمسؤول العام لتصحيح أو مطابقة أرقام التانكات المرتبطة بالباليتة يدوياً.'
                  : '⚠️ General Admin only: Overrides automatic continuous top-up tank allocation for this pallet.'}
              </div>

              {/* Active Floor Tanks Quick Picker */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">
                  {isAr ? 'التانكات النشطة حالياً في الخزانات (انقر للإضافة):' : 'Active Tanks in Floor Storage (Click to add):'}
                </label>
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  {floorLiquidVessels.flatMap((v) => v.activeTanks || []).length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">
                      {isAr ? 'لا توجد تانكات نشطة حالياً بالحوض' : 'No active tanks in vessels'}
                    </span>
                  ) : (
                    floorLiquidVessels.flatMap((v) => v.activeTanks || []).map((t) => (
                      <button
                        key={t.tankId || t.tankNumber}
                        type="button"
                        onClick={() => {
                          const num = String(t.tankNumber);
                          const curArr = (tankOverrideInput || '').split(/[,+\s]+/).map((s) => s.replace('#', '').trim()).filter(Boolean);
                          if (curArr.includes(num)) {
                            setTankOverrideInput(curArr.filter((x) => x !== num).join(', '));
                          } else {
                            setTankOverrideInput([...curArr, num].join(', '));
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer ${
                          (tankOverrideInput || '').includes(String(t.tankNumber))
                            ? 'bg-cyan-700 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-cyan-400'
                        }`}
                      >
                        <span>#{t.tankNumber}</span>
                        <span className="text-[10px] opacity-80">({t.remainingVolume}L)</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Tank Numbers Input */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">
                  {isAr ? 'أرقام التانكات المرتبطة (مفصولة بفاصلة أو +):' : 'Linked Tank Numbers (separated by commas):'}
                </label>
                <input
                  type="text"
                  value={tankOverrideInput}
                  onChange={(e) => setTankOverrideInput(e.target.value)}
                  placeholder="e.g. 101, 102"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 focus:border-cyan-600 focus:outline-hidden"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setTankOverridePallet(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Activity className="h-4 w-4" />
                  <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ وتعديل التانكات (Admin)' : 'Save Override')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GENERAL ADMIN INTERLINKED REVERSAL & HISTORICAL EDIT MODALS (Phase 1)    */}
      {/* ========================================================================= */}

      {/* 1. ADMIN PALLET ACTIONS MENU MODAL */}
      {adminPalletActionsMenuModal.open && adminPalletActionsMenuModal.pallet && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-purple-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'خيارات الإدارة العامة (الباليتات)' : 'General Admin Pallet Actions'}
                  </h3>
                  <span className="text-[11px] text-purple-600 font-bold">
                    {isAr ? 'إجراءات تصحيح وعكس الحركات التاريخية' : 'Historical Correction & Reversal Tools'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminPalletActionsMenuModal({ open: false, order: null, pallet: null, pIdx: -1 })}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pallet summary card */}
            <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-purple-900 flex items-center gap-1">
                  <QrCode className="h-3.5 w-3.5" />
                  <span>#{adminPalletActionsMenuModal.pallet.palletNumber || adminPalletActionsMenuModal.pallet.palletId}</span>
                </span>
                <span className="font-bold text-slate-700">
                  {adminPalletActionsMenuModal.pallet.qtyLarge} {adminPalletActionsMenuModal.order?.outputLargeUnit || (isAr ? 'كرتونة' : 'ctn')}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 truncate">
                {adminPalletActionsMenuModal.order?.productNameAr || adminPalletActionsMenuModal.pallet.productNameAr}
              </div>
            </div>

            {/* Actions List */}
            <div className="space-y-2.5">
              {/* Option A: Admin Edit */}
              <button
                type="button"
                onClick={() => handleOpenAdminPalletEdit(adminPalletActionsMenuModal.order, adminPalletActionsMenuModal.pallet, adminPalletActionsMenuModal.pIdx)}
                className="w-full text-start p-3 bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-2xl transition cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 bg-indigo-50 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white rounded-xl transition shrink-0 mt-0.5">
                  <Edit3 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-slate-900 group-hover:text-indigo-900">
                    {isAr ? 'تعديل بيانات الباليتة (إعادة موازنة آلية)' : 'Admin Edit (Atomic Re-balance)'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'تعديل الكمية أو التوقيتات مع إلغاء استهلاك المواد والتنكات السابق تلقائياً وإعادة تطبيقه بدقة.'
                      : 'Modify quantity or times with clean rollback of old allocations and re-application.'}
                  </div>
                </div>
              </button>

              {/* Option B: Admin Reversal */}
              <button
                type="button"
                onClick={() => handleOpenAdminPalletReversal(adminPalletActionsMenuModal.order, adminPalletActionsMenuModal.pallet, adminPalletActionsMenuModal.pIdx)}
                className="w-full text-start p-3 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-2xl transition cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 bg-rose-50 group-hover:bg-rose-600 text-rose-600 group-hover:text-white rounded-xl transition shrink-0 mt-0.5">
                  <RotateCcw className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-slate-900 group-hover:text-rose-900">
                    {isAr ? 'إلغاء واسترجاع الباليتة بالكامل (Admin Reversal)' : 'Admin Pallet Reversal'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'إرجاع المواد الخام لصالة الإنتاج وإعادة السائل للتنكات، وتوثيق سبب الإلغاء بالسجل المالي.'
                      : 'Restores raw materials to floor, returns liquid to active tanks, and stamps audit log.'}
                  </div>
                </div>
              </button>

              {/* Option C: Tank Override */}
              <button
                type="button"
                onClick={() => {
                  const p = adminPalletActionsMenuModal.pallet;
                  setAdminPalletActionsMenuModal({ open: false, order: null, pallet: null, pIdx: -1 });
                  handleOpenTankOverride(p);
                }}
                className="w-full text-start p-3 bg-white hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 rounded-2xl transition cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 bg-cyan-50 group-hover:bg-cyan-600 text-cyan-600 group-hover:text-white rounded-xl transition shrink-0 mt-0.5">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-slate-900 group-hover:text-cyan-900">
                    {isAr ? 'تعديل أرقام التانكات المرتبطة يدوياً' : 'Override Linked Tank Numbers'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'تعديل أرقام تشغيلات التانكات المغذية للباليتة ومزامنتها لحظياً.'
                      : 'Manually specify feeding liquid tank numbers for this pallet.'}
                  </div>
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setAdminPalletActionsMenuModal({ open: false, order: null, pallet: null, pIdx: -1 })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ADMIN DEPENDENCY BLOCKER MODAL (Strict LIFO Cascade) */}
      {adminDependencyModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'إجراء محظور - وجود حركات لاحقة مرتبطة' : 'Action Blocked - Downstream Dependencies'}
                  </h3>
                  <span className="text-[11px] text-rose-600 font-bold">
                    {isAr ? 'قاعدة الأسبقية الصارمة (Strict Dependency Blocker - LIFO)' : 'Strict LIFO Cascade Policy Active'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminDependencyModal({ open: false, pallet: null, order: null, blockers: [], details: '' })}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {adminDependencyModal.details}
            </p>

            {/* Visual Cascade Tree */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'مسار الارتباط المخزني التابع:' : 'Downstream Dependency Chain:'}</span>
              </div>
              
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200">
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                    {isAr ? 'أمر تشغيل' : 'Work Order'}
                  </span>
                  <span className="font-bold text-slate-900">#{adminDependencyModal.order?.orderNumber}</span>
                  <span className="text-slate-400">({adminDependencyModal.order?.productNameAr})</span>
                </div>

                <div className="flex items-center gap-2 pl-3 rtl:pr-3 text-slate-400">
                  <CornerDownRight className="h-3.5 w-3.5" />
                  <div className="flex-1 flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 text-slate-900">
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold">
                      {isAr ? 'باليتة' : 'Pallet'}
                    </span>
                    <span className="font-bold">#{adminDependencyModal.pallet?.palletNumber || adminDependencyModal.pallet?.palletId}</span>
                    <span className="text-slate-500 font-sans">({adminDependencyModal.pallet?.qtyLarge} {isAr ? 'كرتونة' : 'ctn'})</span>
                  </div>
                </div>

                {(adminDependencyModal.blockers || []).map((b, bIdx) => (
                  <div key={bIdx} className="flex items-center gap-2 pl-6 rtl:pr-6 text-rose-500">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    <div className="flex-1 p-2 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 font-sans text-xs">
                      <div className="font-bold flex items-center justify-between">
                        <span>{isAr ? b.titleAr : b.titleEn}</span>
                        {b.voucherId && <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-rose-200">{b.voucherId}</span>}
                      </div>
                      <div className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                        {isAr ? b.messageAr : b.messageEn}
                      </div>
                      {b.actionType && (
                        <div className="mt-2 pt-1.5 border-t border-rose-200/60 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('app_navigate_tab', {
                                detail: {
                                  tab: 'transfers',
                                  highlightId: b.voucherId,
                                }
                              }));
                              setAdminDependencyModal({ open: false, pallet: null, order: null, blockers: [], details: '' });
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>{isAr ? b.actionTextAr : b.actionTextEn}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setAdminDependencyModal({ open: false, pallet: null, order: null, blockers: [], details: '' })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'فهمت، إغلاق النافذة' : 'Understood, Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ADMIN PALLET REVERSAL CONFIRMATION MODAL */}
      {adminReversalModal.open && adminReversalModal.pallet && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-rose-300 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'تأكيد إلغاء واسترجاع الباليتة (Admin Reversal)' : 'Confirm Admin Pallet Reversal'}
                  </h3>
                  <span className="text-[11px] text-rose-600 font-bold">
                    {isAr ? 'إعادة استهلاك الخامات والسوائل وتوثيق السجل' : 'Rollback Stock & Stamp Financial Audit'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={adminReversalModal.isSubmitting}
                onClick={() => setAdminReversalModal({ open: false, pallet: null, order: null, palletIndex: -1, reason: '', isSubmitting: false })}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{isAr ? 'الآثار التلقائية المترتبة على الإلغاء:' : 'Automatic Reversal Effects:'}</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-800 ps-1">
                <li>
                  {isAr
                    ? `إرجاع كافة المواد الخام المستهلكة في الباليتة (${adminReversalModal.pallet.qtyLarge} كرتونة) إلى رصيد صالة الإنتاج.`
                    : `Restore all consumed raw materials for ${adminReversalModal.pallet.qtyLarge} cartons back to production floor.`}
                </li>
                <li>
                  {isAr
                    ? 'إعادة كميات السوائل المستهلكة إلى التانكات النشطة بصالة الإنتاج وفتحها إن كانت مستنفدة.'
                    : 'Restore consumed intermediate liquid volume back to active tanks.'}
                </li>
                <li>
                  {isAr
                    ? 'خصم كمية الباليتة من إجمالي إنتاج أمر التشغيل وتعديل نسبة الإنجاز تلقائياً.'
                    : 'Deduct produced cartons from work order total and recalculate completion rate.'}
                </li>
                <li>
                  {isAr
                    ? 'تحويل حالة الباليتة إلى (ملغاة - reversed) وحفظ سبب الإلغاء بالسجل المالي دون حذف السجل التاريخي.'
                    : 'Mark pallet as reversed with reason preserved for audit trail.'}
                </li>
              </ul>
            </div>

            {/* Reason Textarea */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800 text-xs flex items-center gap-1">
                <span>{isAr ? 'سبب الإلغاء الإداري (إلزامي للتوثيق المحاسبي - 5 أحرف على الأقل) *' : 'Reversal Justification Reason (Mandatory - min 5 chars) *'}</span>
              </label>
              <textarea
                required
                rows={3}
                value={adminReversalModal.reason}
                onChange={(e) => setAdminReversalModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={isAr ? 'اكتب سبب الإلغاء بدقة، مثال: خطأ في إدخال بيانات الإنتاج، تلف الباليتة، إلخ...' : 'Enter clear reason for reversal...'}
                className="w-full p-2.5 border border-slate-300 rounded-xl bg-white text-xs focus:ring-2 focus:ring-rose-500 font-medium"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                disabled={adminReversalModal.isSubmitting}
                onClick={() => setAdminReversalModal({ open: false, pallet: null, order: null, palletIndex: -1, reason: '', isSubmitting: false })}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={adminReversalModal.isSubmitting || !adminReversalModal.reason || adminReversalModal.reason.trim().length < 5}
                onClick={handleExecuteAdminReversal}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{adminReversalModal.isSubmitting ? (isAr ? 'جاري التنفيذ...' : 'Processing...') : (isAr ? 'تأكيد الإلغاء واسترجاع المخزون' : 'Confirm Reversal')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ADMIN TRANSFER GUIDANCE MODAL */}
      {adminTransferGuidanceModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-amber-300 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'رصيد الصالة غير كافٍ - يتطلب تحويل مستودعي' : 'Floor Shortage - Transfer Required'}
                  </h3>
                  <span className="text-[11px] text-amber-600 font-bold">
                    {isAr ? 'الكمية متوفرة في المستودعات المركزية ولكنها لم تحول لصالة الإنتاج بعد' : 'Stock exists in central warehouses but not transferred to floor'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminTransferGuidanceModal({ open: false, shortComponents: [], order: null, pallet: null, requiredCartons: 0 })}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isAr
                ? 'تم إيقاف حفظ تعديل الباليتة بأمان للحفاظ على نزاهة الأرصدة ومنع تسجيل أرصدة سالبة بصالة الإنتاج. الخامات متوفرة في المستودعات المركزية ويمكن تغطية العجز بإجراء تحويل مخزني بالكميات الموضحة أدناه:'
                : 'Pallet edit safely halted to prevent negative stock on the floor. Stock is available in central warehouses; please transfer the following amounts to the floor:'}
            </p>

            {/* Breakdown Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-start">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-2 text-start">{isAr ? 'الخامة' : 'Material'}</th>
                    <th className="p-2 text-center">{isAr ? 'المتوفر بالصالة' : 'Floor Stock'}</th>
                    <th className="p-2 text-center">{isAr ? 'المطلوب' : 'Required'}</th>
                    <th className="p-2 text-center text-rose-600">{isAr ? 'العجز' : 'Deficit'}</th>
                    <th className="p-2 text-center text-emerald-600">{isAr ? 'المتوفر بالمستودعات' : 'Company Stock'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {(adminTransferGuidanceModal.shortComponents || []).map((sc, scIdx) => (
                    <tr key={scIdx} className="hover:bg-slate-50/50">
                      <td className="p-2 font-sans font-medium text-slate-900">{sc.itemNameAr || sc.itemId}</td>
                      <td className="p-2 text-center text-slate-600">{sc.availableFloor} {sc.unit}</td>
                      <td className="p-2 text-center text-slate-800 font-bold">{sc.requiredTotal} {sc.unit}</td>
                      <td className="p-2 text-center text-rose-600 font-bold">{sc.floorDeficit} {sc.unit}</td>
                      <td className="p-2 text-center text-emerald-600 font-bold">{sc.companyTotal} {sc.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAdminTransferGuidanceModal({ open: false, shortComponents: [], order: null, pallet: null, requiredCartons: 0 })}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdminTransferGuidanceModal({ open: false, shortComponents: [], order: null, pallet: null, requiredCartons: 0 });
                  window.dispatchEvent(new CustomEvent('app_navigate_tab', {
                    detail: { tab: 'transfers' }
                  }));
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{isAr ? 'الانتقال إلى التحويلات المخزنية لطلب التحويل' : 'Go to Stock Transfers'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADMIN ORDER STATUS PROMPT MODAL */}
      {adminOrderStatusPromptModal.open && adminOrderStatusPromptModal.order && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-indigo-200 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'تحديث حالة أمر التشغيل' : 'Update Work Order Status'}
                </h3>
                <span className="text-[11px] text-indigo-600 font-bold">
                  {isAr ? 'انخفاض نسبة الإنجاز عن 100%' : 'Completion rate dropped below 100%'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isAr
                ? `بعد إلغاء / تعديل الباليتة، أصبحت نسبة إنجاز أمر التشغيل #${adminOrderStatusPromptModal.order.orderNumber} هي (${adminOrderStatusPromptModal.newCompletionPct}%). كيف ترغب في ضبط حالة الأمر؟`
                : `After reversing/editing the pallet, completion rate of order #${adminOrderStatusPromptModal.order.orderNumber} is (${adminOrderStatusPromptModal.newCompletionPct}%). How should the order status be set?`}
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  if (typeof adminOrderStatusPromptModal.onChoice === 'function') {
                    adminOrderStatusPromptModal.onChoice('in_progress');
                  }
                }}
                className="w-full text-start p-3 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-2xl transition cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 bg-amber-50 group-hover:bg-amber-600 text-amber-600 group-hover:text-white rounded-xl transition shrink-0 mt-0.5">
                  <Play className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900 group-hover:text-indigo-900">
                    {isAr ? 'إعادة فتح الأمر إلى (قيد التشغيل - In Progress)' : 'Reopen Order to (In Progress)'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'يسمح لصالة الإنتاج بإصدار باليتات جديدة لاستكمال الكمية المستهدفة للأمر.'
                      : 'Allows production line to produce new pallets to reach target quantity.'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (typeof adminOrderStatusPromptModal.onChoice === 'function') {
                    adminOrderStatusPromptModal.onChoice('completed');
                  }
                }}
                className="w-full text-start p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-2xl transition cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 bg-slate-100 group-hover:bg-slate-600 text-slate-600 group-hover:text-white rounded-xl transition shrink-0 mt-0.5">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">
                    {isAr ? 'إبقاء الأمر مكتملاً مع وجود عجز (Completed with Shortage)' : 'Keep Completed with Shortage'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'يحتفظ بحالة الاكتمال ويغلق خط الإنتاج مع توثيق كمية العجز بالسجل.'
                      : 'Preserves completed status and closes line with shortage documented.'}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3-Option Completion Prompt Modal */}
      {completePromptModal.open && completePromptModal.order && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-indigo-950 font-black text-base">
                <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                <span>{isAr ? 'إنهاء تشغيل أمر الإنتاج' : 'Complete Work Order'}</span>
              </div>
              <button
                type="button"
                onClick={() => setCompletePromptModal({ open: false, order: null, actionTime: '' })}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              {isAr
                ? `أنت على وشك إنهاء أمر التشغيل #${completePromptModal.order.orderNumber} في تمام الساعة (${completePromptModal.actionTime}). هل ترغب في تسجيل باليتة أخيرة قبل الإغلاق النهائي؟`
                : `You are about to complete order #${completePromptModal.order.orderNumber} at (${completePromptModal.actionTime}). Would you like to record a final pallet before closing?`}
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleConfirmCompleteWithFinalPallet}
                className="w-full text-start p-3.5 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 rounded-2xl transition cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 bg-indigo-600 text-white rounded-xl shrink-0 mt-0.5 shadow-2xs">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-indigo-950">
                    {isAr ? 'تسجيل باليتة أخيرة ثم الإنهاء' : 'Add Final Pallet Then Complete'}
                  </div>
                  <div className="text-[11px] text-indigo-700/80 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'فتح شاشة إدراج الباليتة لتسجيل آخر كراتين تم إنتاجها بالصالة.'
                      : 'Open pallet modal to log the last produced cartons on floor.'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleConfirmCompleteWithoutPallet}
                className="w-full text-start p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl transition cursor-pointer group flex items-start gap-3"
              >
                <div className="p-2 bg-slate-700 text-white rounded-xl shrink-0 mt-0.5 shadow-2xs">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-slate-900">
                    {isAr ? 'إنهاء التشغيل مباشرة بدون باليتة' : 'Complete Immediately Without Pallet'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'إغلاق وقت التشغيل فوراً واعتماد الأمر كمكتمل بالبالتات الحالية المسجلة.'
                      : 'Close runtime now and finalize order with currently recorded pallets.'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCompletePromptModal({ open: false, order: null, actionTime: '' })}
                className="w-full py-2.5 text-center text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                {isAr ? 'إلغاء ومتابعة التشغيل' : 'Cancel & Keep Running'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}