import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
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
  Star,
  Wrench,
  Target,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import SearchableSelect from './SearchableSelect';
import { buildLiveStockMatrix, getFactoryFloorWarehouse, getRawStorageWarehouses } from '../utils/stockResolver';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

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

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('work_orders'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('work_orders'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#0d6cba';
  const { r, g, b } = hexToRgb(tabColor);

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
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lineFilter, setLineFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Sub-Tab 1: Plan Assignment & Edit Modal State
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanOrder, setEditingPlanOrder] = useState(null);
  const [auditOrderData, setAuditOrderData] = useState(null);
  const [feasibilityModalData, setFeasibilityModalData] = useState(null); // { order, feasibility }
  const [isPlanBomMatrixExpanded, setIsPlanBomMatrixExpanded] = useState(false); // Collapsed by default
  const [isOverviewBarExpanded, setIsOverviewBarExpanded] = useState(false); // Collapsible Plan Summary Bar
  const [imagePreviewModal, setImagePreviewModal] = useState(null); // High-res image preview lightbox popover
  const [copiedId, setCopiedId] = useState(null); // Feedback for copied record IDs
  const [activeNotePopoverId, setActiveNotePopoverId] = useState(null); // Interactive modern tooltip for order notes

  // Floor Transfer Modal State (Triggered from Plan Overview Bar)
  const [showFloorTransferModal, setShowFloorTransferModal] = useState(false);
  const [floorTransferData, setFloorTransferData] = useState({
    sourceWarehouse: '',
    targetWarehouse: '',
    transferDate: '',
    productionOrderRef: '',
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
    notes: '',
  });

  // Sub-Tab 2: Today's Production & Pallet Passport Modal State
  const [showPalletModal, setShowPalletModal] = useState(false);
  const [palletTargetOrder, setPalletTargetOrder] = useState(null);
  const [editingPalletIndex, setEditingPalletIndex] = useState(null);
  const [palletFormData, setPalletFormData] = useState({
    palletNumber: 1,
    qtyLarge: 50,
    qtySmall: 600,
    startTime: minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))),
    endTime: '',
    status: 'completed',
    qcStatus: 'passed',
    crew: [],
    notes: '',
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
    };
  }, []);

  // Match Warehouse Helper
  const matchWh = (val, target) => {
    if (!val || !target) return false;
    return val === target.id || val === target.code || val === target.nameAr || val === target.nameEn;
  };

  // Dynamic Production Floor Warehouse Lookup (Avoids static ID hardcoding)
  const factoryWarehouse = useMemo(() => {
    return getFactoryFloorWarehouse(warehouses);
  }, [warehouses]);

  // Compiled Live Stock & FIFO Lots Matrix
  const liveStockMatrix = useMemo(() => {
    return buildLiveStockMatrix({
      itemsMaster,
      warehouses,
      goodsReceipts,
      transfers,
    });
  }, [itemsMaster, warehouses, goodsReceipts, transfers]);

  // Master Stock Balances Map per Item-Variant across all Warehouses
  const liveStockBalances = useMemo(() => {
    const map = {}; // key: `${itemId}_${variantCode}_${warehouseId}` -> qtySmall

    goodsReceipts.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');

      (grn.lines || []).forEach((line) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const whObj = warehouses.find((w) => matchWh(line.targetWarehouse, w)) || { id: line.targetWarehouse, code: line.targetWarehouse };
        const whId = whObj.id || whObj.code;
        const qty = Number(line.receivedSmallUnits || 0) * (isReturn ? -1 : 1);

        const key = `${pId}_${vCode}_${whId}`;
        map[key] = (map[key] || 0) + qty;
      });
    });

    transfers.forEach((trn) => {
      if (trn.status !== 'completed') return;

      const srcWhObj = warehouses.find((w) => matchWh(trn.sourceWarehouse, w)) || { id: trn.sourceWarehouse, code: trn.sourceWarehouse };
      const tgtWhObj = warehouses.find((w) => matchWh(trn.targetWarehouse, w)) || { id: trn.targetWarehouse, code: trn.targetWarehouse };
      const srcWhId = srcWhObj.id || srcWhObj.code;
      const tgtWhId = tgtWhObj.id || tgtWhObj.code;

      (trn.lines || []).forEach((line) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const qty = Number(line.qtySmallUnits || 0);

        const srcKey = `${pId}_${vCode}_${srcWhId}`;
        const tgtKey = `${pId}_${vCode}_${tgtWhId}`;

        map[srcKey] = (map[srcKey] || 0) - qty;
        map[tgtKey] = (map[tgtKey] || 0) + qty;
      });
    });

    return map;
  }, [goodsReceipts, transfers, warehouses]);

  // BOM Material Feasibility Engine (Generic-Variant & Warehouse Aware)
  const evaluateBomFeasibility = (bomRecipeId, plannedQtyLarge) => {
    if (!bomRecipeId) return { status: 'no_bom', labelAr: 'بدون تركيبة معتمدة', color: 'slate', components: [] };
    const recipe = bomRecipes.find((b) => b.code === bomRecipeId || b.id === bomRecipeId);
    if (!recipe || !Array.isArray(recipe.components) || recipe.components.length === 0) {
      return { status: 'no_bom', labelAr: 'بدون تركيبة معتمدة', color: 'slate', components: [] };
    }

    const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
    let isFullyOnFloor = true;
    let isAvailableOverall = true;

    const componentsStatus = recipe.components.map((comp) => {
      const neededQty = Number(comp.standardQty || 1) * Number(plannedQtyLarge || 1);
      const isSpecificVariant = Boolean(comp.variantCode);
      const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
      const targetVariantCode = cleanSuffix ? `${comp.itemId}-${cleanSuffix}` : null;

      // 1. Calculate Floor Stock in factory_floor Warehouse
      let floorStock = 0;
      if (isSpecificVariant && targetVariantCode) {
        floorStock = Math.max(0, liveStockBalances[`${comp.itemId}_${targetVariantCode}_${factoryWhId}`] || 0);
      } else {
        // Generic Mode: Aggregate all variations of this item residing in factory_floor
        Object.entries(liveStockBalances).forEach(([k, qty]) => {
          const [pId, vCode, wId] = k.split('_');
          if (pId === comp.itemId && (wId === factoryWhId || matchWh(wId, factoryWarehouse))) {
            floorStock += Math.max(0, qty);
          }
        });
      }

      // 2. Calculate Total Consolidated Stock across all active warehouses
      let totalCompanyStock = 0;
      if (isSpecificVariant && targetVariantCode) {
        warehouses.forEach((w) => {
          const wId = w.id || w.code;
          totalCompanyStock += Math.max(0, liveStockBalances[`${comp.itemId}_${targetVariantCode}_${wId}`] || 0);
        });
      } else {
        // Generic Mode: Aggregate all variations across all warehouses
        Object.entries(liveStockBalances).forEach(([k, qty]) => {
          const [pId] = k.split('_');
          if (pId === comp.itemId) {
            totalCompanyStock += Math.max(0, qty);
          }
        });
      }

      if (floorStock < neededQty) isFullyOnFloor = false;
      if (totalCompanyStock < neededQty) isAvailableOverall = false;

      return {
        itemId: comp.itemId,
        variantCode: comp.variantCode || targetVariantCode,
        variantPolicy: comp.variantPolicy || null,
        materialNameAr: comp.materialNameAr || comp.itemId,
        specs: comp.specs || '',
        standardQty: Number(comp.standardQty || 1),
        neededQty,
        floorStock,
        totalCompanyStock,
        unit: comp.unit || 'عبوة',
        isSufficientOnFloor: floorStock >= neededQty,
        isSufficientOverall: totalCompanyStock >= neededQty,
        transferDeficit: Math.max(0, neededQty - floorStock),
        shortageDeficit: Math.max(0, neededQty - totalCompanyStock),
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

  // Aggregated Plan Materials Requirements & Stock Balance Engine across all scheduled orders for the day
  const dailyPlanMaterialsOverview = useMemo(() => {
    const activePlanOrders = workOrders.filter(
      (o) => o.planDate === selectedPlanDate && o.status !== 'cancelled'
    );
    if (activePlanOrders.length === 0) return { list: [], totalReady: 0, totalTransfer: 0, totalShortage: 0 };

    const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
    const compMap = new Map();

    activePlanOrders.forEach((order) => {
      const recipe = bomRecipes.find((b) => b.code === order.bomRecipeId || b.id === order.bomRecipeId);
      if (!recipe || !Array.isArray(recipe.components)) return;

      const plannedCartons = Number(order.plannedQtyLarge || 0);

      recipe.components.forEach((comp) => {
        const stdQty = Number(comp.standardQty || 1);
        const needed = plannedCartons * stdQty;
        const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
        const targetVariantCode = cleanSuffix ? `${comp.itemId}-${cleanSuffix}` : null;
        const key = comp.itemId;

        if (!compMap.has(key)) {
          // Calculate available stock
          let floorStock = 0;
          let totalCompanyStock = 0;

          if (targetVariantCode) {
            floorStock = Math.max(0, liveStockBalances[`${comp.itemId}_${targetVariantCode}_${factoryWhId}`] || 0);
            warehouses.forEach((w) => {
              const wId = w.id || w.code;
              totalCompanyStock += Math.max(0, liveStockBalances[`${comp.itemId}_${targetVariantCode}_${wId}`] || 0);
            });
          } else {
            Object.entries(liveStockBalances).forEach(([k, qty]) => {
              const [pId, vCode, wId] = k.split('_');
              if (pId === comp.itemId) {
                totalCompanyStock += Math.max(0, qty);
                if (wId === factoryWhId || matchWh(wId, factoryWarehouse)) {
                  floorStock += Math.max(0, qty);
                }
              }
            });
          }

          compMap.set(key, {
            itemId: comp.itemId,
            materialNameAr: comp.materialNameAr || comp.itemId,
            unit: comp.unit || 'عبوة',
            totalRequired: 0,
            floorStock,
            totalCompanyStock,
            ordersCount: 0,
          });
        }

        const entry = compMap.get(key);
        entry.totalRequired += needed;
        entry.ordersCount += 1;
      });
    });

    const list = Array.from(compMap.values()).map((c) => {
      const diffFloor = c.floorStock - c.totalRequired;
      const diffCompany = c.totalCompanyStock - c.totalRequired;
      let status = 'floor_ready';

      if (c.floorStock < c.totalRequired) {
        status = c.totalCompanyStock >= c.totalRequired ? 'transfer_needed' : 'shortage';
      }

      return {
        ...c,
        diffFloor,
        diffCompany,
        status,
      };
    });

    list.sort((a, b) => {
      const statusWeight = { shortage: 1, transfer_needed: 2, floor_ready: 3 };
      return (statusWeight[a.status] || 3) - (statusWeight[b.status] || 3);
    });

    const totalReady = list.filter((c) => c.status === 'floor_ready').length;
    const totalTransfer = list.filter((c) => c.status === 'transfer_needed').length;
    const totalShortage = list.filter((c) => c.status === 'shortage').length;

    return { list, totalReady, totalTransfer, totalShortage };
  }, [workOrders, selectedPlanDate, bomRecipes, liveStockBalances, factoryWarehouse, warehouses]);

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

    // Extract lines for materials with floor deficit or required for the shift
    const prefilledLines = [];

    dailyPlanMaterialsOverview.list.forEach((mat) => {
      const deficit = Math.max(0, mat.totalRequired - mat.floorStock);
      const transferQty = deficit > 0 ? deficit : mat.totalRequired;
      if (transferQty <= 0) return;

      const itemDoc = itemsMaster.find((itm) => itm.code === mat.itemId);
      const variations = itemDoc?.variations || [];
      const primaryVar = variations[0] || {};
      const varCode = primaryVar.variantCode || (primaryVar.suffix ? `${mat.itemId}-${primaryVar.suffix}` : mat.itemId);
      const ratio = Number(primaryVar.packagingRatio || itemDoc?.packagingRatio || 1);

      // Query FIFO lot in source warehouse
      const activeLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
        (l) => l.itemId === mat.itemId && (l.warehouseId === srcWhId || matchWh(l.warehouseId, defaultSrcWh)) && l.availableQty > 0
      );
      activeLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
      const suggestedLot = activeLots[0];

      prefilledLines.push({
        itemId: mat.itemId,
        variantCode: varCode,
        code: varCode,
        nameAr: mat.materialNameAr,
        nameEn: itemDoc?.nameEn || mat.materialNameAr,
        specs: primaryVar.mergedSpecs || itemDoc?.mergedSpecs || '',
        smallUnit: mat.unit || itemDoc?.smallUnit || 'عبوة',
        largeUnitName: itemDoc?.largeUnitName || 'كرتونة',
        packagingRatio: ratio,
        qtySmallUnits: transferQty,
        qtyLargeUnits: Number((transferQty / ratio).toFixed(2)),
        lotNumber: suggestedLot?.lotNumber || '',
        unitPrice: suggestedLot?.unitPrice || 0,
        currency: suggestedLot?.currency || 'EGP',
        receivedDate: suggestedLot?.receivedDate || '',
        supplierId: suggestedLot?.supplierId || '',
        supplierName: suggestedLot?.supplierName || '',
        supplierBatchNo: suggestedLot?.supplierBatchNo || '',
        productionDate: suggestedLot?.productionDate || '',
        expiryDate: suggestedLot?.expiryDate || '',
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
      lines: prefilledLines.length > 0 ? prefilledLines : [
        {
          itemId: '',
          variantCode: '',
          code: '',
          nameAr: '',
          nameEn: '',
          specs: '',
          smallUnit: 'عبوة',
          largeUnitName: 'كرتونة',
          packagingRatio: 1,
          qtySmallUnits: '',
          qtyLargeUnits: '',
          lotNumber: '',
          unitPrice: 0,
          currency: 'EGP',
          receivedDate: '',
          supplierId: '',
          supplierName: '',
          supplierBatchNo: '',
          productionDate: '',
          expiryDate: '',
        }
      ],
    });

    setShowFloorTransferModal(true);
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

  // Plan Handlers
  const handleOpenCreatePlan = () => {
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
      notes: '',
    });
    setShowPlanModal(true);
  };

  const handleOpenEditPlan = (order) => {
    setEditingPlanOrder(order);
    setIsPlanBomMatrixExpanded(false);
    const prod = finishedProducts.find((p) => p.code === order.finishedProductId);
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
      notes: order.notes || '',
    });
    setShowPlanModal(true);
  };

  const handleClonePlan = (order) => {
    setEditingPlanOrder(null);
    setIsPlanBomMatrixExpanded(false);
    setPlanFormData({
      ...order,
      orderNumber: generateOrderNumber(selectedPlanDate),
      planDate: selectedPlanDate,
      importanceRank: workOrders.filter((o) => o.planDate === selectedPlanDate).length + 1,
      notes: `نسخة من ${order.orderNumber}`,
    });
    setShowPlanModal(true);
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

    setPlanFormData((prev) => ({
      ...prev,
      finishedProductId: prodCode,
      packagingOptionSuffix: suffix,
      packagingRatio: ratio,
      bomRecipeId: selectedBomId,
      productionLine: line,
      plannedQtySmall: (Number(prev.plannedQtyLarge) || 0) * ratio,
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
    const selectedBomId = matchingBoms[0]?.code || matchingBoms[0]?.id || prev.bomRecipeId;

    setPlanFormData((prev) => ({
      ...prev,
      packagingOptionSuffix: suffix,
      packagingRatio: ratio,
      bomRecipeId: selectedBomId,
      plannedQtySmall: (Number(prev.plannedQtyLarge) || 0) * ratio,
    }));
  };

  const handlePlanQtyChange = (field, value) => {
    const num = Math.max(0, Number(value) || 0);
    const ratio = Number(planFormData.packagingRatio) || 1;

    if (field === 'plannedQtyLarge') {
      setPlanFormData((prev) => ({
        ...prev,
        plannedQtyLarge: value === '' ? '' : num,
        plannedQtySmall: value === '' ? '' : Math.round(num * ratio),
      }));
    } else {
      setPlanFormData((prev) => ({
        ...prev,
        plannedQtySmall: value === '' ? '' : num,
        plannedQtyLarge: value === '' ? '' : Number((num / ratio).toFixed(2)),
      }));
    }
  };

  const handleSavePlanOrder = async (e) => {
    e.preventDefault();
    if (!planFormData.finishedProductId) {
      alert(isAr ? 'يرجى اختيار المنتج التام.' : 'Please select a product.');
      return;
    }
    if (!planFormData.plannedQtySmall || Number(planFormData.plannedQtySmall) <= 0) {
      alert(isAr ? 'يرجى إدخال كمية إنتاج صالحة.' : 'Please enter planned quantity.');
      return;
    }

    // Soft Shortage Confirmation Guard: Alert planner of company-wide shortages but allow override
    const feasibility = evaluateBomFeasibility(planFormData.bomRecipeId, planFormData.plannedQtyLarge);
    if (feasibility.status === 'shortage') {
      const shortageComps = (feasibility.components || []).filter((c) => !c.isSufficientOverall);
      const shortageSummary = shortageComps.map((c) => `• ${c.materialNameAr} (عجز: -${c.shortageDeficit.toLocaleString()} ${c.unit})`).join('\n');
      const proceed = window.confirm(
        isAr
          ? `⚠️ تنبيه عجز في الخامات بمستودعات الشركة ككل:\n\n${shortageSummary}\n\nهل ترغب في تثبيت الصنف بالخطة على افتراض توريدها قريباً؟`
          : `Material shortages detected across company warehouses:\n\n${shortageSummary}\n\nProceed with scheduling anyway?`
      );
      if (!proceed) return;
    }

    // Helper to copy text to clipboard with instant feedback
    const handleCopyId = (e, text) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 1800);
    };

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

        priority: planFormData.priority || 'today',
        importanceRank: Number(planFormData.importanceRank) || 1,
        qtyExactness: planFormData.qtyExactness || 'approximate',
        plannedQtyLarge: Number(planFormData.plannedQtyLarge) || 0,
        plannedQtySmall: Number(planFormData.plannedQtySmall) || 0,

        totalProducedQtySmall: editingPlanOrder?.totalProducedQtySmall || 0,
        totalProducedQtyLarge: editingPlanOrder?.totalProducedQtyLarge || 0,
        completionPercentage: editingPlanOrder?.completionPercentage || 0,
        componentSelections: planFormData.componentSelections || {},
        pallets: editingPlanOrder?.pallets || [],
        segments: editingPlanOrder?.segments || [],
        notes: planFormData.notes.trim(),
        auditTrail: [auditEntry, ...existingAudit].slice(0, 30),

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
      setShowPlanModal(false);
    } catch (err) {
      console.error('Error saving plan order:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ أمر التشغيل.' : 'Error saving order.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlanOrder = async (orderId, orderTitle) => {
    if (!canCancel) {
      alert(isAr ? 'ليس لديك صلاحية حذف أوامر التشغيل.' : 'Permission denied.');
      return;
    }
    if (window.confirm(isAr ? `هل أنت متأكد من حذف أمر التشغيل (${orderTitle})؟` : `Delete order (${orderTitle})?`)) {
      try {
        await deleteDoc(doc(db, 'work_orders', orderId));
        // Roll back any recorded component consumptions
        await deleteDoc(doc(db, 'production_transformations', `TRANS-WO-${orderId}`));
      } catch (err) {
        console.error('Error deleting order:', err);
      }
    }
  };

  // ----------------------------------------------------
  // SUB-TAB 2: PALLET PASSPORT & CREW DECOMPOSITION
  // ----------------------------------------------------
  // Calculate maximum cartons producible strictly from available Factory Floor stock
  const getProducibleCartonsOnFloor = (bomRecipeId) => {
    const recipe = bomRecipes.find((b) => b.code === bomRecipeId || b.id === bomRecipeId);
    if (!recipe || !Array.isArray(recipe.components) || recipe.components.length === 0) return { maxCartons: 0, zeroComponent: null };
    const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';

    let minCartons = Infinity;
    let zeroComponent = null;

    recipe.components.forEach((comp) => {
      const stdQty = Number(comp.standardQty || 1);
      const isSpecificVariant = Boolean(comp.variantCode);
      const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
      const targetVariantCode = cleanSuffix ? `${comp.itemId}-${cleanSuffix}` : null;

      let floorStock = 0;
      if (isSpecificVariant && targetVariantCode) {
        floorStock = Math.max(0, liveStockBalances[`${comp.itemId}_${targetVariantCode}_${factoryWhId}`] || 0);
      } else {
        Object.entries(liveStockBalances).forEach(([k, qty]) => {
          const [pId, vCode, wId] = k.split('_');
          if (pId === comp.itemId && (wId === factoryWhId || matchWh(wId, factoryWarehouse))) {
            floorStock += Math.max(0, qty);
          }
        });
      }

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

  const handleOpenAddPallet = (order) => {
    // Floor Readiness Gate: Check factory floor availability
    const { maxCartons, zeroComponent } = getProducibleCartonsOnFloor(order.bomRecipeId);
    const plannedLarge = Number(order.plannedQtyLarge || 0);

    // Case 1: Zero stock on any component -> Hard block
    if (maxCartons <= 0) {
      alert(
        isAr
          ? `🚫 لا يمكن بدء الإنتاج أو تسجيل البالتات:\nرصيد خامة (${zeroComponent || 'بعض الخامات'}) = 0 بصالة الإنتاج.\n\nيرجى تنفيذ إذن تحويل مخزني (TRN) من مستودع الخامات إلى صالة الإنتاج أولاً.`
          : `Cannot start production: Component stock is 0 on factory floor. Please transfer materials to floor warehouse first.`
      );
      return;
    }

    // Case 2: Partial stock available -> Allow start with explicit confirmation
    if (maxCartons < plannedLarge) {
      const proceed = window.confirm(
        isAr
          ? `⚠️ تنبيه رصيد جزئي بصالة الإنتاج:\nالخامات المتوفرة حالياً بصالة الإنتاج تكفي لإنتاج (${maxCartons} كرتونة) فقط من أصل (${plannedLarge} كرتونة مخطط).\n\nهل ترغب في بدء التشغيل الجزئي وتسجيل البالتات في حدود الرصيد المتاح؟`
          : `Partial stock alert: Available floor stock can produce ${maxCartons} cartons of ${plannedLarge} planned. Proceed?`
      );
      if (!proceed) return;
    }

    const existingPallets = order.pallets || [];
    const nextPalletNum = existingPallets.length + 1;
    const ratio = Number(order.packagingRatio) || 12;

    setPalletTargetOrder(order);
    setEditingPalletIndex(null);
    setPalletFormData({
      palletNumber: nextPalletNum,
      qtyLarge: 50,
      qtySmall: 50 * ratio,
      startTime: minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))),
      endTime: minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)) + 45),
      status: 'completed',
      qcStatus: 'passed',
      crew: usersList.slice(0, 2).map((u, i) => ({
        userId: u.id,
        name: isAr ? u.nameAr : (u.name || u.nameAr),
        role: i === 0 ? 'مشغل خط رئيسي' : 'رص وتغليف',
      })),
      notes: '',
    });
    setShowPalletModal(true);
  };

  const handleSavePalletPassport = async (e) => {
    e.preventDefault();
    if (!palletTargetOrder) return;

    // Strict Pallet Save Gate: Verify that saving this pallet does not exceed available floor stock
    const recipe = bomRecipes.find((b) => b.code === palletTargetOrder.bomRecipeId || b.id === palletTargetOrder.bomRecipeId);
    if (recipe && Array.isArray(recipe.components)) {
      const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
      const pallets = palletTargetOrder.pallets || [];
      const currentTotalLarge = pallets.reduce((sum, p, idx) => idx === editingPalletIndex ? sum : sum + (p.qtyLarge || 0), 0);
      const newCumulativeLarge = currentTotalLarge + Number(palletFormData.qtyLarge);

      for (const comp of recipe.components) {
        const stdQty = Number(comp.standardQty || 1);
        const neededTotal = newCumulativeLarge * stdQty;
        const isSpecificVariant = Boolean(comp.variantCode);
        const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
        const targetVariantCode = cleanSuffix ? `${comp.itemId}-${cleanSuffix}` : null;

        let floorStock = 0;
        if (isSpecificVariant && targetVariantCode) {
          floorStock = Math.max(0, liveStockBalances[`${comp.itemId}_${targetVariantCode}_${factoryWhId}`] || 0);
        } else {
          Object.entries(liveStockBalances).forEach(([k, qty]) => {
            const [pId, vCode, wId] = k.split('_');
            if (pId === comp.itemId && (wId === factoryWhId || matchWh(wId, factoryWarehouse))) {
              floorStock += Math.max(0, qty);
            }
          });
        }

        if (neededTotal > floorStock) {
          alert(
            isAr
              ? `🚫 تجاوز الرصيد المتاح بصالة الإنتاج!\n\nلا يمكن حفظ الباليتة لأن إجمالي المطلوب من خامة (${comp.materialNameAr || comp.itemId}) هو (${neededTotal.toLocaleString()} ${comp.unit || 'عبوة'}) بينما الرصيد المتاح بصالة الإنتاج هو (${floorStock.toLocaleString()} ${comp.unit || 'عبوة'}) فقط.\n\nيرجى تحويل كميات إضافية لصالة الإنتاج قبل استكمال التعبئة.`
              : `Floor stock exceeded for ${comp.materialNameAr || comp.itemId}. Available: ${floorStock}, Required: ${neededTotal}.`
          );
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      const orderRef = doc(db, 'work_orders', palletTargetOrder.id);
      const pallets = [...(palletTargetOrder.pallets || [])];
      const ratio = Number(palletTargetOrder.packagingRatio) || 12;

      const dur = calculateDuration(palletFormData.startTime, palletFormData.endTime);
      const palletPayload = {
        palletId: `PAL-${palletTargetOrder.orderNumber}-P${String(palletFormData.palletNumber).padStart(2, '0')}`,
        palletNumber: Number(palletFormData.palletNumber),
        qtyLarge: Number(palletFormData.qtyLarge),
        qtySmall: Number(palletFormData.qtySmall),
        startTime: palletFormData.startTime,
        endTime: palletFormData.endTime,
        durationMins: dur,
        status: palletFormData.status,
        qcStatus: palletFormData.qcStatus,
        crew: palletFormData.crew,
        notes: palletFormData.notes.trim(),
        loggedAt: new Date().toISOString(),
      };

      if (editingPalletIndex !== null) {
        pallets[editingPalletIndex] = palletPayload;
      } else {
        pallets.push(palletPayload);
      }

      // Recompute Total Produced from all Pallets
      const totalProducedSmall = pallets.reduce((sum, p) => sum + (p.qtySmall || 0), 0);
      const totalProducedLarge = Number((totalProducedSmall / ratio).toFixed(2));
      const plannedSmall = Number(palletTargetOrder.plannedQtySmall) || 1;
      const completionPct = Math.min(100, Math.round((totalProducedSmall / plannedSmall) * 100));

      const newOrderStatus = completionPct >= 100 ? 'completed' : 'in_progress';

      // Push execution segment for timeline
      const segments = [...(palletTargetOrder.segments || [])];
      segments.push({
        segmentId: `${palletTargetOrder.id}-${segments.length + 1}`,
        date: selectedPlanDate,
        startTime: palletFormData.startTime,
        endTime: palletFormData.endTime,
        durationMins: dur,
        netDurationMins: dur,
        allocatedQtySmall: Number(palletFormData.qtySmall),
        status: 'Completed',
        notes: `بالتة #${palletFormData.palletNumber} (${palletFormData.qtyLarge} كرتونة)`,
        operator: currentUserName,
      });

      const totalOpDur = segments.reduce((sum, s) => sum + (s.netDurationMins || 0), 0);

      // 1. Commit Work Order Pallet Passport State
      await setDoc(
        orderRef,
        {
          status: newOrderStatus,
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

      // 2. Commit Material Consumption to Production Floor Warehouse
      if (recipe && Array.isArray(recipe.components) && totalProducedLarge > 0) {
        const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
        const transDocId = `TRANS-WO-${palletTargetOrder.id}`;

        const consumedLines = recipe.components.map((comp) => {
          const itmDoc = itemsMaster.find((itm) => itm.code === comp.itemId);
          const ratio = Number(itmDoc?.packagingRatio || 1);
          const stdQty = Number(comp.standardQty || 1);
          const totalConsumedQty = totalProducedLarge * stdQty;
          const assignedSelection = palletTargetOrder.componentSelections?.[comp.itemId] || {};
          const vCode = assignedSelection.variantCode
            ? `${comp.itemId}-${assignedSelection.variantCode}`
            : comp.variantCode || itmDoc?.variations?.[0]?.variantCode || comp.itemId;

          return {
            itemId: comp.itemId,
            variantCode: vCode,
            code: vCode,
            nameAr: comp.materialNameAr || itmDoc?.nameAr || comp.itemId,
            nameEn: itmDoc?.nameEn || '',
            smallUnit: comp.unit || itmDoc?.smallUnit || 'عبوة',
            largeUnitName: itmDoc?.largeUnitName || 'كرتونة',
            packagingRatio: ratio,
            qtySmallUnits: totalConsumedQty,
            qtyLargeUnits: Number((totalConsumedQty / ratio).toFixed(2)),
            warehouseId: factoryWhId,
            lotNumber: assignedSelection.selectedLot || '',
          };
        });

        await setDoc(doc(db, 'production_transformations', transDocId), {
          id: transDocId,
          workOrderId: palletTargetOrder.id,
          orderNumber: palletTargetOrder.orderNumber,
          date: selectedPlanDate,
          warehouseId: factoryWhId,
          itemCode: palletTargetOrder.finishedProductId,
          variantCode: palletTargetOrder.packagingOptionCode || palletTargetOrder.finishedProductId,
          itemNameAr: palletTargetOrder.productNameAr,
          producedQty: totalProducedLarge,
          yieldUnit: palletTargetOrder.outputLargeUnit,
          consumedComponents: consumedLines,
          status: 'completed',
          registeredBy: currentUserName,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      setShowPalletModal(false);
    } catch (err) {
      console.error('Error saving pallet passport:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ البالتة.' : 'Error saving pallet.');
    } finally {
      setIsSaving(false);
    }
  };

  // ----------------------------------------------------
  // SUB-TAB 3: TIMELINE CANVAS & SHIFT SCORES
  // ----------------------------------------------------
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
    workOrders.forEach((order) => {
      (order.segments || []).forEach((seg) => {
        if (seg.date === selectedPlanDate && seg.status !== 'Cancelled') {
          segments.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            productNameAr: order.productNameAr,
            segmentId: seg.segmentId,
            startTime: seg.startTime,
            endTime: seg.endTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5))),
            status: seg.status,
            durationMins: seg.durationMins || calculateDuration(seg.startTime, seg.endTime || minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)))),
            netDurationMins: seg.netDurationMins || 0,
          });
        }
      });
    });
    return segments;
  }, [workOrders, selectedPlanDate]);

  const shiftKpis = useMemo(() => {
    const shiftStart = 480; // 08:00
    const shiftEnd = 990;   // 16:30
    const nowM = timeToMins(new Date().toTimeString().slice(0, 5));
    const isToday = selectedPlanDate === new Date().toISOString().split('T')[0];
    const latestEvalTime = isToday ? Math.min(shiftEnd, nowM) : shiftEnd;

    let totalProdMins = 0;
    let totalBreakMins = 0;
    let actualFirstStart = 1440;
    let actualLastEnd = 0;

    todayBreaks.forEach((b) => { totalBreakMins += b.durationMins; });

    todayTimelineData.forEach((s) => {
      const sm = timeToMins(s.startTime);
      const em = timeToMins(s.endTime);
      if (sm < actualFirstStart) actualFirstStart = sm;
      if (em > actualLastEnd) actualLastEnd = em;
      totalProdMins += (s.durationMins || 0);
    });

    let totalWasteMins = 0;
    if (actualFirstStart < 1440) {
      totalWasteMins = Math.max(0, (latestEvalTime - shiftStart) - totalProdMins - totalBreakMins);
    }

    const displayStart = actualFirstStart === 1440 ? 480 : actualFirstStart;
    const displayEnd = actualLastEnd === 0 ? 990 : actualLastEnd;
    const extraMins = Math.max(0, displayEnd - 990);

    return {
      shiftStartDisplay: minsToTime(displayStart),
      shiftEndDisplay: minsToTime(displayEnd),
      totalProdMins,
      totalBreakMins,
      totalWasteMins,
      overtimeMins: extraMins,
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

  return (
    <div className="space-y-5 select-none">
      {isSaving && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري تحديث الخطة وتشغيل البالتات...' : 'Updating Plan & Pallet Passports...'}
        />
      )}

      {/* Top Header & 3-Sub-Tab Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="p-2.5 border rounded-2xl shadow-2xs flex items-center justify-center shrink-0 transition-all duration-200"
            style={{
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
              borderColor: `rgba(${r}, ${g}, ${b}, 0.25)`,
              color: tabColor,
            }}
          >
            <TabConfigIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {isAr ? (tabConfig?.labelAr || 'أوامر التشغيل وتتبع الإنتاج (Work Orders)') : (tabConfig?.labelEn || 'Work Orders & Floor Execution')}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'تخطيط خطة التعبئة، تكويد البالتات وطواقم العمل، والمتابعة الحية' : 'Plan assignment, pallet decomposition, crew passports, and live timeline'}
            </span>
          </div>
        </div>

        {/* 3 Unified Tabs Switcher */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-2xl text-xs font-extrabold shadow-inner overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveSubTab('plan')}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'plan' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 text-blue-600" />
            <span>{isAr ? '١- خطة الإنتاج (Plan)' : '1. Production Plan'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('today_prod')}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'today_prod' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="h-3.5 w-3.5 text-indigo-600" />
            <span>{isAr ? '٢- تشغيل اليوم والبالتات' : '2. Floor Pallets'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('live_tracking')}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'live_tracking' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isAr ? '٣- المتابعة الحية (Live)' : '3. Live Tracking'}</span>
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

        {canCreate && activeSubTab === 'plan' && (
          <button
            type="button"
            onClick={handleOpenCreatePlan}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إدراج صنف جديد بالخطة' : 'Assign SKU to Plan'}</span>
          </button>
        )}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100 animate-in fade-in duration-150">
                  {dailyPlanMaterialsOverview.list.map((mat) => {
                    const isFloorReady = mat.status === 'floor_ready';
                    const isTransfer = mat.status === 'transfer_needed';
                    const isShortage = mat.status === 'shortage';

                    const cardStyle = isFloorReady
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                      : isTransfer
                      ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                      : 'bg-rose-50/70 border-rose-300 text-rose-950';

                    return (
                      <div
                        key={mat.itemId}
                        className={`p-2.5 rounded-xl border-2 space-y-1.5 shadow-2xs transition hover:scale-102 ${cardStyle}`}
                      >
                        {/* Material SKU Header */}
                        <div className="flex items-center justify-between gap-1 border-b border-black/5 pb-1">
                          <span className="font-bold text-[11px] truncate w-full" title={mat.materialNameAr}>
                            {mat.materialNameAr}
                          </span>
                          <span className="font-mono text-[9px] font-extrabold px-1 rounded bg-white/80 border border-black/10 shrink-0">
                            {mat.itemId}
                          </span>
                        </div>

                        {/* Compact Metrics with Icons & Tooltips */}
                        <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                          {/* Required Total */}
                          <div className="flex items-center gap-1" title={isAr ? 'إجمالي المطلوب لكافة تشغيلات الخطة اليوم' : 'Total Planned Requirement'}>
                            <Layers className="h-3 w-3 text-blue-600 shrink-0" />
                            <span className="font-extrabold text-blue-900">{mat.totalRequired.toLocaleString()}</span>
                          </div>

                          {/* Floor Stock */}
                          <div className="flex items-center gap-1 justify-end" title={isAr ? 'الرصيد الفعلي المتاح بصالة الإنتاج' : 'Floor Warehouse Balance'}>
                            <Factory className="h-3 w-3 text-indigo-600 shrink-0" />
                            <span className="font-bold">{mat.floorStock.toLocaleString()}</span>
                          </div>

                          {/* Total Company Stock */}
                          <div className="flex items-center gap-1" title={isAr ? 'إجمالي الرصيد بكافة مستودعات الشركة' : 'Total Company Stock'}>
                            <Warehouse className="h-3 w-3 text-slate-500 shrink-0" />
                            <span className="font-bold">{mat.totalCompanyStock.toLocaleString()}</span>
                          </div>

                          {/* Net Difference / Shortage */}
                          <div className="flex items-center gap-1 justify-end font-bold" title={isAr ? (mat.diffCompany >= 0 ? 'الفائض الإجمالي' : 'العجز الصافي في مخزون الشركة') : 'Net Difference'}>
                            <Scale className={`h-3 w-3 ${isShortage ? 'text-rose-600' : 'text-emerald-600'} shrink-0`} />
                            <span className={isShortage ? 'text-rose-700 font-extrabold' : 'text-emerald-800'}>
                              {mat.diffCompany >= 0 ? `+${mat.diffCompany.toLocaleString()}` : mat.diffCompany.toLocaleString()}
                            </span>
                          </div>
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
                    const feasibility = evaluateBomFeasibility(order.bomRecipeId, order.plannedQtyLarge);

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
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      [{order.finishedProductId}] • {order.packagingOptionNameAr}
                                    </span>
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
                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {order.plannedQtyLarge} {order.outputLargeUnit}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-blue-700">
                          {Number(order.plannedQtySmall).toLocaleString()} {order.outputSmallUnit}
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
                const feasibility = evaluateBomFeasibility(order.bomRecipeId, order.plannedQtyLarge);
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

                        {/* Secondary: SKU Code, Packaging Option, Order Number */}
                        <div className="text-xs text-slate-500 font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-600 font-semibold">{order.packagingOptionNameAr}</span>
                          <span>•</span>
                          <span className="text-slate-400">[{order.finishedProductId}]</span>
                          <span>•</span>
                          <span className="text-blue-700 font-bold">أمر #{order.orderNumber}</span>
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
                      </div>
                    </div>

                    {/* Target Quantities Metric Block */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
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
          <div className="grid grid-cols-1 gap-4">
            {filteredPlanOrders.map((order) => {
              const feasibility = evaluateBomFeasibility(order.bomRecipeId, order.plannedQtyLarge);
              const pallets = order.pallets || [];
              const ratio = Number(order.packagingRatio) || 12;

              return (
                <div key={order.id} className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
                  {/* Order Execution Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="space-y-1">
                      {/* Primary Product Identity Anchor */}
                      <h4 className="font-extrabold text-slate-900 text-base leading-snug">{order.productNameAr}</h4>
                      
                      {/* Secondary SKU Code, Packaging Option & Order Number */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                          أمر #{order.orderNumber}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">[{order.finishedProductId}] • {order.packagingOptionNameAr}</span>
                        <button
                          type="button"
                          onClick={() => setFeasibilityModalData({ order, feasibility })}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-bold transition-all shadow-2xs hover:scale-105 cursor-pointer ${
                            feasibility.status === 'floor_ready'
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : feasibility.status === 'transfer_needed'
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 animate-pulse'
                          }`}
                          title={isAr ? 'انقر لعرض تفاصيل توفر خامات الـ BOM' : 'Click to inspect BOM component breakdown'}
                        >
                          <CircleDot className="h-3 w-3" />
                          <span>{feasibility.labelAr}</span>
                          <Eye className="h-3 w-3 opacity-60 ms-0.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleOpenAddPallet(order)}
                        className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        <span>{isAr ? 'إدراج باليتة جديدة وطاقم العمل' : 'Add Pallet & Crew'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Production Progress Gauge */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">
                        {isAr ? 'الإنتاج الفعلي المحقق:' : 'Actual Output:'} <b className="font-mono text-blue-700 font-extrabold">{Number(order.totalProducedQtySmall || 0).toLocaleString()}</b> / {Number(order.plannedQtySmall || 0).toLocaleString()} {order.outputSmallUnit}
                      </span>
                      <span className="font-mono font-extrabold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-md">
                        {order.completionPercentage || 0}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, order.completionPercentage || 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Serialized Pallets Registry */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-800 block">
                      {isAr ? `بالتات التشغيل المنجزة (${pallets.length} بالتات):` : `Completed Pallets (${pallets.length}):`}
                    </span>

                    {pallets.length === 0 ? (
                      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                        {isAr ? 'لم يتم إنتاج أو رص أي بالتات لهذا الصنف بعد. انقر على "+ إدراج باليتة جديدة".' : 'No pallets produced yet.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pallets.map((pallet, pIdx) => (
                          <div key={pallet.palletId || pIdx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
                            <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                              <span className="font-mono font-extrabold text-indigo-700 flex items-center gap-1">
                                <QrCode className="h-3.5 w-3.5" />
                                <span>{pallet.palletId}</span>
                              </span>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                                {pallet.qcStatus === 'passed' ? (isAr ? '✓ فحص جودة سليم' : 'QC Passed') : pallet.qcStatus}
                              </span>
                            </div>

                            <div className="flex justify-between items-center text-[11px]">
                              <span>{isAr ? 'الكمية المعبأة:' : 'Packed:'} <b className="font-mono font-bold text-slate-900">{pallet.qtyLarge} {order.outputLargeUnit}</b> ({pallet.qtySmall} {order.outputSmallUnit})</span>
                              <span className="font-mono text-slate-500">{pallet.startTime} {isAr ? '←' : '➔'} {pallet.endTime}</span>
                            </div>

                            {/* Crew Tagging */}
                            <div className="p-2 bg-white rounded-xl border border-slate-200 space-y-1">
                              <span className="text-[10px] font-bold text-slate-500 block">
                                {isAr ? 'طاقم العمل والمسؤوليات:' : 'Assigned Crew & Roles:'}
                              </span>
                              <div className="flex flex-wrap items-center gap-1">
                                {(pallet.crew || []).map((member, mIdx) => (
                                  <span key={mIdx} className="px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-md text-[10px] font-semibold">
                                    👤 {member.name} ({member.role})
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Shift Scores */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
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
          </div>

          {/* Timeline Canvas */}
          <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <span className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-blue-600" />
                <span>{isAr ? 'الخط الزمني المباشر لخطوط الإنتاج:' : 'Live Floor Timeline:'}</span>
              </span>

              <button
                type="button"
                onClick={() => setShowBreakModal(true)}
                className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <Coffee className="h-3.5 w-3.5 text-amber-600" />
                <span>{isAr ? 'تسجيل استراحة / راحة' : 'Log Break'}</span>
              </button>
            </div>

            <div className="relative w-full h-10 bg-slate-100 rounded-2xl overflow-hidden shadow-inner flex items-center">
              {todayTimelineData.map((seg, sIdx) => {
                const sM = timeToMins(seg.startTime);
                const eM = timeToMins(seg.endTime);
                const dur = eM < sM ? (eM + 1440 - sM) : (eM - sM);
                const shiftSpan = 510;
                const leftPct = Math.max(0, Math.min(100, ((sM - 480) / shiftSpan) * 100));
                const widthPct = Math.max(2, Math.min(100 - leftPct, (dur / shiftSpan) * 100));

                return (
                  <div
                    key={seg.segmentId || sIdx}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className="absolute h-8 rounded-xl bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center px-1 truncate shadow-xs border border-white"
                    title={`${seg.productNameAr} (${seg.startTime} - ${seg.endTime})`}
                  >
                    <span className="truncate">{seg.productNameAr}</span>
                  </div>
                );
              })}

              {todayBreaks.map((b, bIdx) => {
                const sM = timeToMins(b.startTime);
                const eM = timeToMins(b.endTime);
                const dur = eM < sM ? (eM + 1440 - sM) : (eM - sM);
                const shiftSpan = 510;
                const leftPct = Math.max(0, Math.min(100, ((sM - 480) / shiftSpan) * 100));
                const widthPct = Math.max(2, Math.min(100 - leftPct, (dur / shiftSpan) * 100));

                return (
                  <div
                    key={b.id || bIdx}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className="absolute h-8 rounded-xl bg-amber-400 text-amber-950 text-[10px] font-bold flex items-center justify-center px-1 truncate shadow-xs border border-white z-10"
                    title={`استراحة (${b.startTime} - ${b.endTime})`}
                  >
                    <span>☕ {b.notes || 'راحة'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PALLET PASSPORT MODAL (Sub-Tab 2) */}
      {showPalletModal && palletTargetOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'إدراج باليتة إنتاج وطاقم العمل' : 'Pallet Passport & Crew Roster'}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">
                    {palletTargetOrder.productNameAr} • {palletTargetOrder.orderNumber}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPalletModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePalletPassport} className="space-y-4 text-xs">
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
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'وقت اكتمال الباليتة *' : 'End Time *'}</label>
                  <input
                    type="time"
                    required
                    value={palletFormData.endTime}
                    onChange={(e) => setPalletFormData({ ...palletFormData, endTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center"
                  />
                </div>
              </div>

              {/* Crew Roster Tagging */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-2">
                <span className="font-bold text-indigo-950 block">
                  {isAr ? 'طاقم العمل المشارك في إنتاج هذه الباليتة:' : 'Crew Tagging & Roles:'}
                </span>

                <div className="space-y-1.5">
                  {usersList.slice(0, 4).map((u) => {
                    const isChecked = palletFormData.crew.some((m) => m.userId === u.id);
                    return (
                      <label key={u.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-xl cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const current = palletFormData.crew;
                              if (isChecked) {
                                setPalletFormData({ ...palletFormData, crew: current.filter((m) => m.userId !== u.id) });
                              } else {
                                setPalletFormData({
                                  ...palletFormData,
                                  crew: [...current, { userId: u.id, name: isAr ? u.nameAr : (u.name || u.nameAr), role: 'تشغيل وتعبئة' }]
                                });
                              }
                            }}
                            className="accent-indigo-600 rounded"
                          />
                          <span className="font-semibold text-slate-900">{isAr ? u.nameAr : (u.name || u.nameAr)}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">[{u.department || 'الإنتاج'}]</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPalletModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'حفظ وتأكيد الباليتة' : 'Save Pallet'}</span>
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
                      onChange={(e) => setPlanFormData({ ...planFormData, bomRecipeId: e.target.value })}
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

              {/* SECTION 4: LIVE IN-MODAL MATERIAL AVAILABILITY CHECKLIST & SHORTAGE MATRIX (COLLAPSIBLE) */}
              {planFormData.bomRecipeId && (() => {
                const liveFeasibility = evaluateBomFeasibility(planFormData.bomRecipeId, planFormData.plannedQtyLarge);
                const comps = liveFeasibility.components || [];

                return (
                  <div className="space-y-2 p-4 bg-slate-50/80 border border-slate-200/90 rounded-2xl shadow-2xs transition-all">
                    <div
                      onClick={() => setIsPlanBomMatrixExpanded(!isPlanBomMatrixExpanded)}
                      className="flex items-center justify-between cursor-pointer select-none border-b border-slate-200/80 pb-2"
                    >
                      <span className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
                        <Boxes className="h-4 w-4 text-indigo-600" />
                        <span>{isAr ? '٤. فحص ومطابقة خامات الـ BOM المطلوبة للتشغيلة:' : '4. BOM Materials Availability Matrix:'}</span>
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
                                const activeLotsList = Object.values(liveStockMatrix?.lotMap || {}).filter((l) => l.itemId === c.itemId && l.availableQty > 0);

                                const cleanBomSuffix = c.variantCode ? c.variantCode.replace(`${c.itemId}-`, '') : '';
                                const isBomMandatory = Boolean(cleanBomSuffix && c.variantPolicy === 'mandatory');
                                const isBomPreferred = Boolean(cleanBomSuffix && (c.variantPolicy === 'preferred' || !c.variantPolicy));

                                const sortedLots = [...activeLotsList].sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
                                const oldestLot = sortedLots[0];
                                const oldestLotVariantSuffix = oldestLot?.variantCode ? oldestLot.variantCode.replace(`${c.itemId}-`, '') : '';

                                let autoResolvedSuffix = '';
                                if (isBomMandatory || isBomPreferred) {
                                  autoResolvedSuffix = cleanBomSuffix;
                                } else if (oldestLotVariantSuffix) {
                                  autoResolvedSuffix = oldestLotVariantSuffix;
                                }

                                const currentSelection = planFormData.componentSelections?.[c.itemId] || {};
                                const selectedVariantSuffix = isBomMandatory
                                  ? cleanBomSuffix
                                  : (currentSelection.variantCode !== undefined ? currentSelection.variantCode : autoResolvedSuffix);

                                const selectedVariantFullCode = selectedVariantSuffix ? `${c.itemId}-${selectedVariantSuffix}` : '';
                                const selectedVariantObj = variationsList.find((v) => v.suffix === selectedVariantSuffix || v.variantCode === selectedVariantFullCode);

                                const variantSpecsText = selectedVariantObj
                                  ? ((selectedVariantObj.specs || []).map((s) => `${s.label}: ${s.value}`).join(' • ') || selectedVariantObj.mergedSpecs || '')
                                  : (itemMasterDoc?.mergedSpecs || '');
                                const variantSupplierName = selectedVariantObj?.supplierName || (selectedVariantObj?.supplierId ? (usersList.find((s) => s.id === selectedVariantObj.supplierId)?.name || '') : '');

                                const variantLots = selectedVariantFullCode 
                                  ? activeLotsList.filter((l) => l.variantCode === selectedVariantFullCode)
                                  : activeLotsList;
                                variantLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

                                const defaultLotNo = variantLots[0]?.lotNumber || '';
                                const selectedLotNumber = currentSelection.selectedLot !== undefined ? currentSelection.selectedLot : defaultLotNo;

                                const factoryWhId = factoryWarehouse?.id || factoryWarehouse?.code || '';
                                const allItemLots = Object.values(liveStockMatrix?.lotMap || {}).filter((l) => l.itemId === c.itemId && l.availableQty > 0);

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
                                            <select
                                              disabled={isBomMandatory}
                                              value={selectedVariantSuffix}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setPlanFormData((prev) => ({
                                                  ...prev,
                                                  componentSelections: {
                                                    ...(prev.componentSelections || {}),
                                                    [c.itemId]: {
                                                      ...(prev.componentSelections?.[c.itemId] || {}),
                                                      variantCode: val,
                                                      selectedLot: '',
                                                    }
                                                  }
                                                }));
                                              }}
                                              className={`w-full p-1.5 border rounded-xl text-xs font-bold ${
                                                isBomMandatory
                                                  ? 'border-rose-400 bg-rose-50 text-rose-950 cursor-not-allowed shadow-2xs'
                                                  : isBomPreferred
                                                  ? 'border-indigo-300 bg-indigo-50/40 text-indigo-950 focus:ring-2 focus:ring-indigo-500'
                                                  : 'border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500'
                                              }`}
                                            >
                                              {!isBomMandatory && (
                                                <option value="">{isAr ? 'عام للخامة (أي مورد متاح)' : 'Generic Material'}</option>
                                              )}
                                              {variationsList
                                                .filter((v) => isBomMandatory ? v.suffix === cleanBomSuffix : true)
                                                .map((v) => (
                                                  <option key={v.suffix} value={v.suffix}>
                                                    [{v.suffix}] {v.supplierName ? `${v.supplierName} • ` : ''}{v.packagingRatio ? `(شدة: ${v.packagingRatio})` : ''}
                                                  </option>
                                                ))}
                                            </select>

                                            {isBomMandatory && (
                                              <span className="px-2 py-1 bg-rose-600 text-white rounded-lg shrink-0 font-bold text-[10px] flex items-center gap-1 shadow-2xs" title={isAr ? 'إلزامي بالتركيبة ومقفل' : 'Locked'}>
                                                <Lock className="h-3 w-3" />
                                                <span>{isAr ? 'إلزامي' : 'Mandatory'}</span>
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5 text-[10px]">
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
                                                selectedLot: lotVal,
                                              }
                                            }
                                          }));
                                        }}
                                        className="w-full p-1.5 border border-slate-300 rounded-xl text-xs bg-white font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                      >
                                        <option value="">
                                          {defaultLotNo ? (isAr ? `الأقدم تلقائياً [${defaultLotNo}]` : `Oldest FIFO [${defaultLotNo}]`) : (isAr ? 'الأقدم تلقائياً (FIFO)' : 'Oldest FIFO')}
                                        </option>
                                        {variantLots.map((l) => (
                                          <option key={l.lotNumber} value={l.lotNumber}>
                                            {l.lotNumber} ({l.availableQty.toLocaleString()} {l.smallUnit}) {l.receivedDate ? `• ${l.receivedDate}` : ''}
                                          </option>
                                        ))}
                                      </select>

                                      {defaultLotNo && selectedLotNumber === defaultLotNo && (
                                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded block w-max">
                                          ✓ {isAr ? 'اقتراح أقدم لوط متاح (FIFO)' : 'Oldest FIFO Selected'}
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
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'وقت البدء *' : 'Start Time *'}</label>
                  <input
                    type="time"
                    required
                    value={breakFormData.startTime}
                    onChange={(e) => setBreakFormData({ ...breakFormData, startTime: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'وقت الانتهاء' : 'End Time'}</label>
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

      {/* PRE-FILLED FLOOR TRANSFER MODAL (LOCKED TO PRODUCTION FLOOR WH) */}
      {showFloorTransferModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
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
                        // Re-resolve FIFO lots from new source
                        lines: prev.lines.map((l) => {
                          const activeLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
                            (lot) => lot.itemId === l.itemId && (lot.warehouseId === newSrc || matchWh(lot.warehouseId, newSrc)) && lot.availableQty > 0
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
                <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                  <Boxes className="h-4 w-4 text-indigo-600" />
                  <span>{isAr ? 'الخامات المطلوبة وصافي العجز بصالة الإنتاج:' : 'Required Items & Staging Quantities:'}</span>
                </span>

                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-h-60 overflow-y-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="p-2 text-start">{isAr ? 'الخامة والتنوع' : 'Material'}</th>
                        <th className="p-2 text-start min-w-[170px]">{isAr ? 'اللوط المختار (FIFO)' : 'Target Lot'}</th>
                        <th className="p-2 text-center min-w-[110px]">{isAr ? 'الكمية المحولة' : 'Transfer Qty'}</th>
                        <th className="p-2 text-center">{isAr ? 'الكمية الكبرى' : 'Large Qty'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {floorTransferData.lines.map((line, idx) => {
                        const activeLots = Object.values(liveStockMatrix?.lotMap || {}).filter(
                          (lot) => lot.itemId === line.itemId && (lot.warehouseId === floorTransferData.sourceWarehouse || matchWh(lot.warehouseId, floorTransferData.sourceWarehouse)) && lot.availableQty > 0
                        );
                        activeLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

                        return (
                          <tr key={idx} className="hover:bg-slate-50/60 transition">
                            <td className="p-2 align-top">
                              <span className="font-bold text-slate-900 block">{line.nameAr}</span>
                              <span className="text-[10px] font-mono text-slate-400">[{line.itemId}] • {line.code || line.variantCode}</span>
                            </td>

                            <td className="p-2 align-top">
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
                                    {lIdx === 0 ? '⭐ ' : ''}{lot.lotNumber} ({lot.availableQty.toLocaleString()} {line.smallUnit})
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2 align-top text-center">
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
                                  className="w-24 p-1 border border-slate-300 rounded text-center font-mono font-bold text-xs bg-white text-slate-900"
                                />
                                <span className="text-[10px] text-slate-400 font-medium">{line.smallUnit}</span>
                              </div>
                            </td>

                            <td className="p-2 align-top text-center font-mono font-bold text-slate-700">
                              {line.qtyLargeUnits} {line.largeUnitName}
                            </td>
                          </tr>
                        );
                      })}
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
                  <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 mt-0.5">
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
                          </td>

                          <td className="p-2.5 text-center font-mono font-bold">
                            <span className={c.isSufficientOverall ? 'text-slate-800' : 'text-rose-700'}>
                              {c.totalCompanyStock.toLocaleString()} {c.unit}
                            </span>
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
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block">{isAr ? 'كلياً' : 'Total'}</span>
                          <span className={`font-mono font-bold ${c.isSufficientOverall ? 'text-slate-800' : 'text-rose-700'}`}>
                            {c.totalCompanyStock.toLocaleString()} {c.unit}
                          </span>
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
    </div>
  );
}