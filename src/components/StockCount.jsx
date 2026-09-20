import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import {
  ClipboardCheck,
  Plus,
  Search,
  Download,
  UploadCloud,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Paperclip,
  Eye,
  Trash2,
  Edit3,
  History,
  X,
  Sparkles,
  ShieldCheck,
  Lock,
  ChevronRight,
  Warehouse,
  Boxes,
  Tag,
  Clock,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Image as ImageIcon,
  ExternalLink,
  CheckSquare,
  Square,
  Layers,
  Check,
  Send,
  SlidersHorizontal,
  FileUp,
  Filter,
  CheckCheck,
  CreditCard,
  Receipt,
  Building2,
  Sliders
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import SearchableSelect from './SearchableSelect';
import { buildLiveStockMatrix, matchWarehouse } from '../utils/stockResolver';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';
import * as XLSX from 'xlsx';

// 5-Priority Hierarchical Sorting Helper: Warehouse -> Category -> Item -> Variant -> Lot
const sortStockCountLines = (lines = []) => {
  return [...lines].sort((a, b) => {
    // 1. Warehouse
    const whA = String(a.warehouseCode || a.warehouseId || '');
    const whB = String(b.warehouseCode || b.warehouseId || '');
    const whCmp = whA.localeCompare(whB, undefined, { numeric: true });
    if (whCmp !== 0) return whCmp;

    // 2. Category
    const catA = Number(a.categoryId || 0);
    const catB = Number(b.categoryId || 0);
    if (catA !== catB) return catA - catB;

    // 3. Item Code / ID
    const itemA = String(a.itemCode || a.itemId || '');
    const itemB = String(b.itemCode || b.itemId || '');
    const itemCmp = itemA.localeCompare(itemB, undefined, { numeric: true });
    if (itemCmp !== 0) return itemCmp;

    // 4. Variant Code
    const varA = String(a.variantCode || '');
    const varB = String(b.variantCode || '');
    const varCmp = varA.localeCompare(varB, undefined, { numeric: true });
    if (varCmp !== 0) return varCmp;

    // 5. Lot Number (FIFO Chronological)
    const lotA = String(a.lotNumber || '');
    const lotB = String(b.lotNumber || '');
    return lotA.localeCompare(lotB, undefined, { numeric: true });
  });
};

export default function StockCount({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('stock_count'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('stock_count'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#6366f1';
  const { r, g, b } = hexToRgb(tabColor);

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const currentUserId = currentUser?.id || currentUser?.uid || '';
  const currentUserName = isAr ? (currentUser?.nameAr || 'المسؤول') : (currentUser?.name || 'Authorized User');
  const canViewPrices = permissions ? permissions.sensitive?.canViewPrices !== false : true;

  // Cloud Collections State
  const [sessions, setSessions] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active UI & Modals State
  const [activeSession, setActiveSession] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditLineModal, setShowEditLineModal] = useState(null); // { session, line, lineIndex }
  const [showAttachmentModal, setShowAttachmentModal] = useState(null);
  const [showSessionAuditModal, setShowSessionAuditModal] = useState(null); // Session Audit Trail Modal
  const [showLineHistoryModal, setShowLineHistoryModal] = useState(null); // Row-Level History Modal
  const [printSessionData, setPrintSessionData] = useState(null);

  // Direct Stock & Lot Level Adjustment State
  const [showDirectAdjModal, setShowDirectAdjModal] = useState(false);
  const [isSavingDirectAdj, setIsSavingDirectAdj] = useState(false);
  const [directAdjForm, setDirectAdjForm] = useState({
    warehouseId: '',
    itemId: '',
    variantCode: '',
    lotMode: 'existing', // 'existing' | 'new'
    selectedLotNumber: '',
    newLotNumber: '',
    bookSmallQty: 0,
    actualLargeQty: '',
    actualSmallRemainingQty: '',
    actualSmallQty: '',
    unitCost: '',
    supplierId: '',
    supplierName: '',
    affectSupplierBalance: false, // Default: No effect on supplier due balance
    supplierBatchNo: '',
    productionDate: '',
    expiryDate: '',
    reason: '',
  });

  // Helper: Create Structured Audit Log Entry
  const createAuditLog = (action, actionAr, actionEn, details = {}) => {
    const now = new Date();
    return {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      action,
      actionAr,
      actionEn,
      user: currentUserName,
      userId: currentUserId,
      timestamp: now.toISOString(),
      displayDate: now.toISOString().split('T')[0],
      displayTime: now.toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
      details,
    };
  };

  // Filters inside active session review
  const [varianceFilter, setVarianceFilter] = useState('all'); // 'all' | 'variance_only' | 'surplus' | 'deficit' | 'matched' | 'uncounted'
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [selectedLineIndices, setSelectedLineIndices] = useState([]);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  // -------------------------------------------------------------
  // SMART CASCADING SCOPE FORM STATE (Multi-Select at all levels)
  // -------------------------------------------------------------
  const [scopeWarehouses, setScopeWarehouses] = useState(['all']);
  const [scopeCategories, setScopeCategories] = useState(['all']);
  const [scopeItems, setScopeItems] = useState(['all']);
  const [scopeVariants, setScopeVariants] = useState(['all']);
  const [scopeLots, setScopeLots] = useState(['all']);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [lotSearchQuery, setLotSearchQuery] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  // Subscribe to Cloud Firestore
  useEffect(() => {
    const unsubSessions = onSnapshot(collection(db, 'stock_counts'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0) - (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0));
      setSessions(list);
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItemsMaster(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((w) => w.isActive !== false);
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehouses(list);
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceipts(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransformations = onSnapshot(collection(db, 'production_transformations'), (snap) => {
      setTransformations(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      setCategories(snap.docs.map((d) => ({ ...d.data(), id: Number(d.id) || d.data().id })));
      setLoading(false);
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, ...d.data() }));
      setSuppliersList(list);
    });

    return () => {
      unsubSessions();
      unsubItems();
      unsubWh();
      unsubGrns();
      unsubTransfers();
      unsubCategories();
      unsubSuppliers();
    };
  }, []);

  // Sync activeSession with fresh Firestore state
  useEffect(() => {
    if (activeSession) {
      const fresh = sessions.find((s) => s.id === activeSession.id);
      if (fresh) setActiveSession(fresh);
    }
  }, [sessions]);

  // Master Live Stock Matrix Engine
  const liveStockMatrix = useMemo(() => {
    return buildLiveStockMatrix({
      itemsMaster,
      warehouses,
      goodsReceipts,
      transfers,
      transformations,
    });
  }, [itemsMaster, warehouses, goodsReceipts, transfers, transformations]);

  const getWarehouseName = (identifier) => {
    if (!identifier || identifier === 'all') return isAr ? 'كافة المستودعات' : 'All Warehouses';
    const wh = warehouses.find((w) => matchWarehouse(identifier, w));
    return wh ? (isAr ? (wh.nameAr || wh.code) : (wh.nameEn || wh.nameAr || wh.code)) : identifier;
  };

  const getCategoryName = (catId) => {
    const cat = categories.find((c) => Number(c.id) === Number(catId));
    return cat ? (isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)) : `Category ${catId || '1'}`;
  };

  // Generate Next Stock Count ID (STK-YYYYMMDD-01)
  const generateNextStockCountId = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `STK-${yyyy}${mm}${dd}`;

    const todaysSessions = sessions.filter((s) => s.id && s.id.startsWith(datePrefix));
    const nextSeq = String(todaysSessions.length + 1).padStart(2, '0');
    return `${datePrefix}-${nextSeq}`;
  };

  // =========================================================================
  // 🔗 SMART SEQUENTIAL CASCADING FILTERS
  // =========================================================================

  // =========================================================================
  // ⚡ DIRECT STOCK & LOT-LEVEL ADJUSTMENT ENGINE
  // =========================================================================
  const handleOpenDirectAdjustment = () => {
    const defaultWh = warehouses[0]?.id || warehouses[0]?.code || '';
    const todayCompact = new Date().toISOString().split('T')[0].replace(/-/g, '');
    setDirectAdjForm({
      warehouseId: defaultWh,
      itemId: '',
      variantCode: '',
      lotMode: 'existing',
      selectedLotNumber: '',
      newLotNumber: `ADJ-LOT-${todayCompact}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      bookSmallQty: 0,
      actualLargeQty: '',
      actualSmallRemainingQty: '',
      actualSmallQty: '',
      unitCost: '',
      supplierId: '',
      supplierName: '',
      affectSupplierBalance: false, // Strictly Default: No effect on supplier balance
      supplierBatchNo: '',
      productionDate: '',
      expiryDate: '',
      reason: '',
    });
    setShowDirectAdjModal(true);
  };

  const handleSaveDirectAdjustment = async (e) => {
    e.preventDefault();
    const {
      warehouseId,
      itemId,
      variantCode,
      lotMode,
      selectedLotNumber,
      newLotNumber,
      actualSmallQty,
      bookSmallQty,
      unitCost,
      supplierId,
      supplierName,
      affectSupplierBalance,
      supplierBatchNo,
      productionDate,
      expiryDate,
      reason,
    } = directAdjForm;

    if (!warehouseId || !itemId || !variantCode) {
      alert(isAr ? 'يرجى تحديد المستودع، الخامة، والتنوع.' : 'Please specify warehouse, item, and variation.');
      return;
    }

    const targetLotNumber = lotMode === 'existing' ? selectedLotNumber : newLotNumber.trim();
    if (!targetLotNumber) {
      alert(isAr ? 'يرجى تحديد أو إدخال رقم اللوط.' : 'Please specify lot number.');
      return;
    }

    if (actualSmallQty === '' || actualSmallQty === null || isNaN(Number(actualSmallQty))) {
      alert(isAr ? 'يرجى إدخال الرصيد الفعلي بعد التسوية.' : 'Please enter actual count.');
      return;
    }

    if (lotMode === 'new' && (unitCost === '' || Number(unitCost) < 0 || isNaN(Number(unitCost)))) {
      alert(isAr ? 'تكلفة الوحدة إلزامية للوطات الجديدة لحساب تقييم الـ FIFO.' : 'Unit cost is mandatory for new lot valuation.');
      return;
    }

    if (!reason.trim()) {
      alert(isAr ? 'يرجى كتابة سبب / تبرير التسوية المخزنية (إلزامي).' : 'Please enter adjustment reason.');
      return;
    }

    const actualCount = Number(actualSmallQty);
    const bookCount = lotMode === 'existing' ? Number(bookSmallQty || 0) : 0;
    const varianceDelta = actualCount - bookCount;

    if (varianceDelta === 0 && lotMode === 'existing') {
      alert(isAr ? 'الرصيد الفعلي مطابق تماماً للرصيد الدفتري الحالي (الفارق = 0).' : 'Actual count equals book balance (Variance = 0).');
      return;
    }

    if (lotMode === 'new' && actualCount <= 0) {
      alert(isAr ? 'كمية اللوط الجديد يجب أن تكون أكبر من الصفر.' : 'New lot quantity must be greater than zero.');
      return;
    }

    setIsSavingDirectAdj(true);
    try {
      const batch = writeBatch(db);
      const todayStr = new Date().toISOString().split('T')[0];
      const todayCompact = todayStr.replace(/-/g, '');
      const adjId = `ADJ-${todayCompact}-${Math.random().toString(36).substr(2, 5).toUpperCase()}-${targetLotNumber}`;

      const itemObj = itemsMaster.find((i) => i.code === itemId || i.id === itemId);
      const variantObj = (itemObj?.variations || []).find((v) => v.variantCode === variantCode) || {};
      const ratio = Number(variantObj.packagingRatio || itemObj?.packagingRatio || 1);
      const isSurplus = varianceDelta > 0;
      const varianceAbs = Math.abs(varianceDelta);
      const finalUnitCost = Number(unitCost || variantObj.openingUnitCost || 0);

      // 1. Write Approved Adjustment Receipt Voucher to goods_receipts
      const receiptRef = doc(db, 'goods_receipts', adjId);
      batch.set(receiptRef, {
        id: adjId,
        docType: 'inventory_reconciliation',
        isDirectAdjustment: true,
        status: 'approved',
        supplierId: supplierId || variantObj.supplierId || 'STOCK_COUNT_ADJUSTMENT',
        supplierName: supplierName || variantObj.supplierName || (isAr ? 'تسوية جردية مباشرة' : 'Direct Stock Adjustment'),
        affectSupplierBalance: Boolean(affectSupplierBalance),
        receiptDate: todayStr,
        targetWarehouse: warehouseId,
        placedBy: currentUserName,
        oldBalance: bookCount,
        actualBalance: actualCount,
        lines: [
          {
            lotNumber: targetLotNumber,
            itemId: itemObj?.code || itemId,
            code: variantCode,
            variantCode: variantCode,
            variantSuffix: variantObj.suffix || '',
            nameAr: itemObj?.nameAr || '',
            nameEn: itemObj?.nameEn || '',
            specs: variantObj.mergedSpecs || '',
            targetWarehouse: warehouseId,
            largeUnitName: variantObj.largeUnitName || itemObj?.largeUnitName || 'كرتونة',
            receivedLargeUnits: Number((varianceAbs / ratio).toFixed(2)),
            packagingRatio: ratio,
            smallUnit: variantObj.smallUnit || itemObj?.smallUnit || 'قطعة',
            receivedSmallUnits: isSurplus ? varianceAbs : -varianceAbs,
            oldBookBalance: bookCount,
            actualFoundQty: actualCount,
            variance: varianceDelta,
            unitPrice: finalUnitCost,
            currency: 'EGP',
            hasBatchTracking: Boolean(supplierBatchNo),
            supplierBatchNo: supplierBatchNo || 'ADJ-LOT',
            productionDate: productionDate || '',
            expiryDate: expiryDate || '',
            qcStatus: 'accepted',
            notes: `Direct Adjustment: Book=${bookCount}, Actual=${actualCount}, Diff=${varianceDelta}. Reason: ${reason.trim()}`,
          },
        ],
        receivedBy: currentUserName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Post to Movement Ledger
      const ledgerRef = doc(collection(db, 'stock_ledger'));
      batch.set(ledgerRef, {
        grnId: adjId,
        lotNumber: targetLotNumber,
        action: isSurplus ? 'direct_adjustment_surplus' : 'direct_adjustment_deficit',
        docType: 'inventory_reconciliation',
        isDirectAdjustment: true,
        itemId: itemObj?.code || itemId,
        variantCode: variantCode,
        materialNameAr: itemObj?.nameAr || '',
        oldBalance: bookCount,
        newActualBalance: actualCount,
        qty: isSurplus ? varianceAbs : -varianceAbs,
        variance: varianceDelta,
        unit: variantObj.smallUnit || itemObj?.smallUnit || 'قطعة',
        warehouse: warehouseId,
        supplierId: supplierId || variantObj.supplierId || '',
        supplierName: supplierName || variantObj.supplierName || '',
        affectSupplierBalance: Boolean(affectSupplierBalance),
        placedBy: currentUserName,
        receiptDate: todayStr,
        batchNo: supplierBatchNo || 'ADJ-LOT',
        productionDate: productionDate || null,
        expiryDate: expiryDate || null,
        unitPrice: finalUnitCost,
        currency: 'EGP',
        financialImpact: varianceDelta * finalUnitCost,
        approvedBy: currentUserName,
        approverId: currentUserId,
        timestamp: serverTimestamp(),
      });

      // 3. Optional: Affect Supplier Balance if explicitly toggled ON
      if (affectSupplierBalance && (supplierId || variantObj.supplierId)) {
        const targetSupId = supplierId || variantObj.supplierId;
        const supDoc = suppliersList.find((s) => s.id === targetSupId);
        if (supDoc) {
          const currentBalance = Number(supDoc.currentBalance || 0);
          const financialImpact = varianceDelta * finalUnitCost;
          // Surplus increases payable (+), Deficit decreases payable (-)
          const updatedBalance = Math.max(0, currentBalance + financialImpact);

          batch.set(
            doc(db, 'suppliers', targetSupId),
            {
              currentBalance: updatedBalance,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      await batch.commit();
      setShowDirectAdjModal(false);
      alert(isAr ? `تمت التسوية المخزنية المباشرة للبند (${variantCode}) ورقم اللوط (${targetLotNumber}) بنجاح!` : `Direct stock adjustment for (${variantCode}) Lot (${targetLotNumber}) posted successfully!`);
    } catch (err) {
      console.error('Error executing direct adjustment:', err);
      alert(isAr ? 'حدث خطأ أثناء تنفيذ التسوية المباشرة.' : 'Error saving direct adjustment.');
    } finally {
      setIsSavingDirectAdj(false);
    }
  };

  // Master Pool of all positive active lots
  const activeLotsPool = useMemo(() => {
    return Object.values(liveStockMatrix.lotMap).filter((l) => l.availableQty > 0);
  }, [liveStockMatrix]);

  // 1. Lots filtered by Selected Warehouses
  const lotsInSelectedWarehouses = useMemo(() => {
    if (scopeWarehouses.includes('all') || scopeWarehouses.length === 0) return activeLotsPool;
    return activeLotsPool.filter((l) =>
      scopeWarehouses.some((wId) => matchWarehouse(wId, l.warehouseObj) || l.warehouseId === wId)
    );
  }, [activeLotsPool, scopeWarehouses]);

  // 2. Categories available based on Selected Warehouses
  const availableCategoriesInScope = useMemo(() => {
    const catIds = new Set();
    lotsInSelectedWarehouses.forEach((lot) => {
      const itemObj = itemsMaster.find((i) => i.code === lot.itemId || i.id === lot.itemId);
      if (itemObj?.categoryId) catIds.add(String(itemObj.categoryId));
    });
    return categories.filter((c) => catIds.has(String(c.id)));
  }, [lotsInSelectedWarehouses, itemsMaster, categories]);

  // 3. Lots filtered by Selected Categories
  const lotsInSelectedCategories = useMemo(() => {
    if (scopeCategories.includes('all') || scopeCategories.length === 0) return lotsInSelectedWarehouses;
    return lotsInSelectedWarehouses.filter((lot) => {
      const itemObj = itemsMaster.find((i) => i.code === lot.itemId || i.id === lot.itemId);
      return scopeCategories.includes(String(itemObj?.categoryId));
    });
  }, [lotsInSelectedWarehouses, scopeCategories, itemsMaster]);

  // 4. Items available based on Selected Warehouses & Categories
  const availableItemsInScope = useMemo(() => {
    const itemCodes = new Set();
    lotsInSelectedCategories.forEach((lot) => {
      if (lot.itemId) itemCodes.add(lot.itemId);
    });
    return itemsMaster.filter((i) => itemCodes.has(i.code || i.id));
  }, [lotsInSelectedCategories, itemsMaster]);

  // 5. Lots filtered by Selected Items
  const lotsInSelectedItems = useMemo(() => {
    if (scopeItems.includes('all') || scopeItems.length === 0) return lotsInSelectedCategories;
    return lotsInSelectedCategories.filter((lot) =>
      scopeItems.includes(lot.itemId) || scopeItems.includes(lot.itemCode)
    );
  }, [lotsInSelectedCategories, scopeItems]);

  // 6. Variants available based on Selected Warehouses, Categories & Items
  const availableVariantsInScope = useMemo(() => {
    const varMap = new Map();
    lotsInSelectedItems.forEach((lot) => {
      const varKey = `${lot.itemId}_${lot.variantCode}`;
      if (!varMap.has(varKey)) {
        varMap.set(varKey, {
          key: varKey,
          itemId: lot.itemId,
          variantCode: lot.variantCode,
          nameAr: lot.nameAr,
          specs: lot.specs,
          packagingRatio: lot.packagingRatio,
          smallUnit: lot.smallUnit,
          largeUnitName: lot.largeUnitName,
          availableQty: 0,
        });
      }
      varMap.get(varKey).availableQty += lot.availableQty;
    });
    return Array.from(varMap.values());
  }, [lotsInSelectedItems]);

  // 7. Lots filtered by Selected Variants
  const lotsInSelectedVariants = useMemo(() => {
    if (scopeVariants.includes('all') || scopeVariants.length === 0) return lotsInSelectedItems;
    return lotsInSelectedItems.filter((lot) => {
      const varKey = `${lot.itemId}_${lot.variantCode}`;
      return scopeVariants.includes(varKey) || scopeVariants.includes(lot.variantCode);
    });
  }, [lotsInSelectedItems, scopeVariants]);

  // 8. Lots available based on Selected Variants
  const availableLotsInScope = useMemo(() => {
    return lotsInSelectedVariants;
  }, [lotsInSelectedVariants]);

  // 9. FINAL MATCHING LOTS (Applying Specific Lots Selection)
  const finalMatchingLots = useMemo(() => {
    if (scopeLots.includes('all') || scopeLots.length === 0) return lotsInSelectedVariants;
    return lotsInSelectedVariants.filter((lot) => scopeLots.includes(lot.lotNumber));
  }, [lotsInSelectedVariants, scopeLots]);

  // -------------------------------------------------------------
  // AUTO-PRUNING: Keep child selections valid on parent changes
  // -------------------------------------------------------------
  useEffect(() => {
    if (!scopeCategories.includes('all')) {
      const validCatIds = new Set(availableCategoriesInScope.map((c) => String(c.id)));
      const pruned = scopeCategories.filter((id) => validCatIds.has(id));
      if (pruned.length !== scopeCategories.length) {
        setScopeCategories(pruned.length === 0 ? ['all'] : pruned);
      }
    }
  }, [availableCategoriesInScope]);

  useEffect(() => {
    if (!scopeItems.includes('all')) {
      const validCodes = new Set(availableItemsInScope.map((i) => i.code || i.id));
      const pruned = scopeItems.filter((code) => validCodes.has(code));
      if (pruned.length !== scopeItems.length) {
        setScopeItems(pruned.length === 0 ? ['all'] : pruned);
      }
    }
  }, [availableItemsInScope]);

  useEffect(() => {
    if (!scopeVariants.includes('all')) {
      const validVarKeys = new Set(availableVariantsInScope.map((v) => v.key));
      const pruned = scopeVariants.filter((k) => validVarKeys.has(k));
      if (pruned.length !== scopeVariants.length) {
        setScopeVariants(pruned.length === 0 ? ['all'] : pruned);
      }
    }
  }, [availableVariantsInScope]);

  useEffect(() => {
    if (!scopeLots.includes('all')) {
      const validLotNos = new Set(availableLotsInScope.map((l) => l.lotNumber));
      const pruned = scopeLots.filter((lotNo) => validLotNos.has(lotNo));
      if (pruned.length !== scopeLots.length) {
        setScopeLots(pruned.length === 0 ? ['all'] : pruned);
      }
    }
  }, [availableLotsInScope]);

  // Open Create Modal and Reset Scope
  const handleOpenCreateSession = () => {
    setScopeWarehouses(['all']);
    setScopeCategories(['all']);
    setScopeItems(['all']);
    setScopeVariants(['all']);
    setScopeLots(['all']);
    setItemSearchQuery('');
    setLotSearchQuery('');
    setSessionNotes('');
    setShowCreateModal(true);
  };

  // Create Snapshot Session from Final Scope
  const handleCreateSnapshotSession = async (e) => {
    e.preventDefault();
    if (finalMatchingLots.length === 0) {
      alert(isAr ? 'لا توجد أصناف أو لوطات مطابقة للنطاق المحدد لبدء الجرد.' : 'No items match the selected scope.');
      return;
    }

    const sessionId = generateNextStockCountId();
    const todayStr = new Date().toISOString().split('T')[0];

    const snapshotLines = finalMatchingLots.map((lot) => {
      const itemObj = itemsMaster.find((i) => i.code === lot.itemId || i.id === lot.itemId);
      const ratio = Number(lot.packagingRatio || itemObj?.packagingRatio || 1);
      const bookQty = Number(lot.availableQty || 0);

      return {
        warehouseId: lot.warehouseId,
        warehouseNameAr: lot.warehouseObj?.nameAr || lot.warehouseId,
        warehouseCode: lot.warehouseObj?.code || lot.warehouseId,
        categoryId: itemObj?.categoryId || 1,
        categoryName: getCategoryName(itemObj?.categoryId || 1),
        itemId: lot.itemId,
        itemCode: itemObj?.code || lot.itemId,
        itemNameAr: itemObj?.nameAr || lot.nameAr,
        itemNameEn: itemObj?.nameEn || lot.nameEn || '',
        variantCode: lot.variantCode,
        variantSpecs: lot.specs || '',
        lotNumber: lot.lotNumber,
        unitCost: Number(lot.unitPrice || 0),
        currency: lot.currency || 'EGP',
        smallUnit: lot.smallUnit || 'قطعة',
        largeUnitName: lot.largeUnitName || 'كرتونة',
        packagingRatio: ratio,
        // Book Balances
        bookLargeQty: Number((bookQty / ratio).toFixed(2)),
        bookSmallQty: bookQty,
        // Actual Findings (Initially Blank for Real-Life Audit)
        actualLargeQty: '',
        actualSmallRemainingQty: '',
        actualSmallQty: null,
        variance: null,
        status: 'pending',
        notes: '',
        approvedBy: null,
        approvedAt: null,
        history: [], // Row-level audit trail
      };
    });

    const targetWhList = Array.from(new Set(finalMatchingLots.map((l) => l.warehouseId)));
    const sortedSnapshotLines = sortStockCountLines(snapshotLines);

    const initAuditLog = createAuditLog(
      'cycle_initiated',
      'بدء دورة جرد جديدة وتثبيت اللقطة الدفترية',
      'Stock count session initiated and book snapshot locked',
      {
        totalLines: sortedSnapshotLines.length,
        warehousesCount: targetWhList.length,
        notes: sessionNotes || '',
      }
    );

    const newSession = {
      id: sessionId,
      sessionDate: todayStr,
      scope: {
        warehouses: scopeWarehouses,
        categories: scopeCategories,
        items: scopeItems,
        variants: scopeVariants,
        lots: scopeLots,
      },
      targetWarehouses: targetWhList,
      notes: sessionNotes,
      status: 'pending',
      hasDownloadedXlsx: false,
      hasPrintedSheet: false,
      createdBy: currentUserName,
      createdById: currentUserId,
      totalLinesCount: sortedSnapshotLines.length,
      lines: sortedSnapshotLines,
      attachments: [],
      auditLogs: [initAuditLog],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'stock_counts', sessionId), newSession);
      setShowCreateModal(false);
      setActiveSession(newSession);
    } catch (err) {
      console.error('Error creating stock count session:', err);
      alert(isAr ? 'حدث خطأ أثناء بدء دورة الجرد.' : 'Error creating stock count session.');
    }
  };

  // =========================================================================
  // 2. EXPORT STANDARDIZED & STYLED MULTI-TAB XLSX WORKBOOK
  // =========================================================================
  const handleExportMultiTabXlsx = async (session) => {
    const wb = XLSX.utils.book_new();

    // Group snapshot lines by warehouse
    const linesByWarehouse = {};
    (session.lines || []).forEach((line) => {
      const whKey = line.warehouseCode || line.warehouseId || 'WH';
      if (!linesByWarehouse[whKey]) linesByWarehouse[whKey] = [];
      linesByWarehouse[whKey].push(line);
    });

    // 1. Sort Warehouse Tabs in Numerical/Alphabetical Sequence
    const sortedWarehouseKeys = Object.keys(linesByWarehouse).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    sortedWarehouseKeys.forEach((whCode) => {
      const lines = linesByWarehouse[whCode];
      
      // 2. Sort Records within Sheet: Category -> Item -> Variant -> Lot
      const sortedLines = sortStockCountLines(lines);

      // Fixed Standardized 15-Column Table (No Dynamic Unit Splitting)
      const sheetData = sortedLines.map((l, idx) => ({
        [isAr ? 'م' : '#']: idx + 1,
        [isAr ? 'التصنيف' : 'Category']: l.categoryName,
        [isAr ? 'كود الصنف' : 'Item Code']: l.itemCode,
        [isAr ? 'اسم الخامة' : 'Item Name']: l.itemNameAr,
        [isAr ? 'كود التنوع والمواصفات' : 'Variant & Specs']: `${l.variantCode} ${l.variantSpecs ? `(${l.variantSpecs})` : ''}`.trim(),
        [isAr ? 'رقم اللوط / التشغيلة' : 'Lot Number']: l.lotNumber,
        [isAr ? 'الوحدة الكبرى' : 'Large Unit']: l.largeUnitName || 'كرتونة',
        [isAr ? 'معامل الشدة' : 'Packaging Ratio']: l.packagingRatio || 1,
        [isAr ? 'الوحدة الصغرى' : 'Small Unit']: l.smallUnit || 'قطعة',
        [isAr ? 'الرصيد الدفتري (كبرى)' : 'Book Qty (Large)']: l.bookLargeQty,
        [isAr ? 'الرصيد الدفتري (إجمالي صغرى)' : 'Book Qty (Total Small)']: l.bookSmallQty,
        [isAr ? 'الفعلي المخزني (كبرى)' : 'Actual Found (Large)']: l.actualLargeQty !== '' && l.actualLargeQty !== null && l.actualLargeQty !== undefined ? l.actualLargeQty : '',
        [isAr ? 'الفعلي المتبقي فرط (صغرى)' : 'Actual Loose (Small)']: l.actualSmallRemainingQty !== '' && l.actualSmallRemainingQty !== null && l.actualSmallRemainingQty !== undefined ? l.actualSmallRemainingQty : '',
        [isAr ? 'إجمالي الفعلي (صغرى)' : 'Actual Total (Small)']: l.actualSmallQty !== null && l.actualSmallQty !== undefined ? l.actualSmallQty : '',
        [isAr ? 'ملاحظات لجان الجرد' : 'Auditor Notes']: l.notes || '',
      }));

      const ws = XLSX.utils.json_to_sheet(sheetData);

      // 1. Right-to-Left (RTL) Active View for Clean Arabic Reading
      ws['!views'] = [{ RTL: isAr }];

      // 2. Formatted Column Widths (Auto-fitted character widths)
      ws['!cols'] = [
        { wch: 6 },   // #
        { wch: 24 },  // Category
        { wch: 14 },  // Item Code
        { wch: 28 },  // Item Name
        { wch: 34 },  // Variant & Specs
        { wch: 26 },  // Lot #
        { wch: 14 },  // Large Unit
        { wch: 13 },  // Ratio
        { wch: 14 },  // Small Unit
        { wch: 18 },  // Book Large
        { wch: 22 },  // Book Total Small
        { wch: 20 },  // Actual Large
        { wch: 22 },  // Actual Loose Small
        { wch: 20 },  // Actual Total Small
        { wch: 30 },  // Notes
      ];

      const sheetName = `${whCode}`.substring(0, 30);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const fileName = `${session.id}_Physical_Stock_Count.xlsx`;
    XLSX.writeFile(wb, fileName);

    const newStatus = session.status === 'pending' ? 'in-process' : session.status;
    const exportLog = createAuditLog(
      'xlsx_exported',
      'تصدير وتنزيل شيت الجرد بصيغة Excel متعدد المستودعات',
      'Exported multi-tab physical stock count Excel workbook',
      { fileName }
    );

    try {
      await setDoc(
        doc(db, 'stock_counts', session.id),
        {
          hasDownloadedXlsx: true,
          status: newStatus,
          auditLogs: [...(session.auditLogs || []), exportLog],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error updating session flags:', err);
    }
  };

  // Trigger Print Sheet
  const handleOpenPrint = async (session) => {
    setPrintSessionData(session);
    const newStatus = session.status === 'pending' ? 'in-process' : session.status;
    const printLog = createAuditLog(
      'sheet_printed',
      'فتح ومعاينة استمارة الجرد الرسمية للطباعة',
      'Opened official physical count form for printing'
    );

    try {
      await setDoc(
        doc(db, 'stock_counts', session.id),
        {
          hasPrintedSheet: true,
          status: newStatus,
          auditLogs: [...(session.auditLogs || []), printLog],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error updating print flag:', err);
    }
  };

  // =========================================================================
  // 3. RE-IMPORT FILLED XLSX WORKBOOK (Robust Fixed Schema Mapping)
  // =========================================================================
  const handleImportFilledXlsx = (e, session) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        const importedRows = [];
        wb.SheetNames.forEach((sheetName) => {
          const ws = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(ws);
          importedRows.push(...data);
        });

        if (importedRows.length === 0) {
          alert(isAr ? 'الملف فارغ أو لا يحتوي على صفوف صالحة.' : 'Empty or invalid spreadsheet.');
          return;
        }

        const updatedLines = session.lines.map((line) => {
          // Match row strictly by Lot Number or Item Code
          const matchedRow = importedRows.find((row) => {
            const rowLot =
              row[isAr ? 'رقم اللوط / التشغيلة' : 'Lot Number'] ||
              row['رقم اللوط / التشغيلة'] ||
              row['Lot Number'] ||
              row['Lot #'] ||
              row['lotNumber'];

            return rowLot && String(rowLot).trim() === String(line.lotNumber).trim();
          });

          if (matchedRow) {
            const actualTotalCol =
              matchedRow[isAr ? 'إجمالي الفعلي (صغرى)' : 'Actual Total (Small)'] ||
              matchedRow['إجمالي الفعلي (صغرى)'] ||
              matchedRow['Actual Total (Small)'] ||
              matchedRow['Actual Total Found'];

            const actualLargeCol =
              matchedRow[isAr ? 'الفعلي المخزني (كبرى)' : 'Actual Found (Large)'] ||
              matchedRow['الفعلي المخزني (كبرى)'] ||
              matchedRow['Actual Found (Large)'] ||
              matchedRow['Actual Large Found'];

            const actualRemCol =
              matchedRow[isAr ? 'الفعلي المتبقي فرط (صغرى)' : 'Actual Loose (Small)'] ||
              matchedRow['الفعلي المتبقي فرط (صغرى)'] ||
              matchedRow['Actual Loose (Small)'] ||
              matchedRow['Actual Small Remaining'];

            const notesCol =
              matchedRow[isAr ? 'ملاحظات لجان الجرد' : 'Auditor Notes'] ||
              matchedRow['ملاحظات لجان الجرد'] ||
              matchedRow['Auditor Notes'] ||
              matchedRow['Auditor Remarks'] ||
              '';

            const ratio = Number(line.packagingRatio || 1);
            let totalActual = null;

            if (actualTotalCol !== undefined && actualTotalCol !== '' && !isNaN(Number(actualTotalCol))) {
              totalActual = Number(actualTotalCol);
            } else if ((actualLargeCol !== '' && actualLargeCol !== undefined) || (actualRemCol !== '' && actualRemCol !== undefined)) {
              totalActual = (Number(actualLargeCol || 0) * ratio) + Number(actualRemCol || 0);
            }

            if (totalActual !== null) {
              const prevCount = line.actualSmallQty;
              const hasChanged = prevCount !== totalActual;
              const now = new Date();
              const rowHistoryEntry = hasChanged ? {
                id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                user: currentUserName,
                userId: currentUserId,
                previousCount: prevCount !== null && prevCount !== undefined ? prevCount : null,
                newCount: totalActual,
                unit: line.smallUnit,
                source: 'xlsx_import',
                timestamp: now.toISOString(),
                displayDate: now.toISOString().split('T')[0],
                displayTime: now.toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
              } : null;

              return {
                ...line,
                actualLargeQty: actualLargeCol !== undefined && actualLargeCol !== '' ? actualLargeCol : '',
                actualSmallRemainingQty: actualRemCol !== undefined && actualRemCol !== '' ? actualRemCol : '',
                actualSmallQty: totalActual,
                variance: totalActual - Number(line.bookSmallQty || 0),
                notes: notesCol || line.notes,
                history: rowHistoryEntry ? [...(line.history || []), rowHistoryEntry] : (line.history || []),
              };
            }
          }
          return line;
        });

        const importLog = createAuditLog(
          'xlsx_imported',
          `استيراد وتحديث الكميات الفعلية من ملف Excel (${file.name})`,
          `Imported actual count findings from Excel (${file.name})`,
          { fileName: file.name, rowsImported: importedRows.length }
        );

        await setDoc(
          doc(db, 'stock_counts', session.id),
          {
            lines: updatedLines,
            auditLogs: [...(session.auditLogs || []), importLog],
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        alert(isAr ? 'تم استيراد وتحديث الكميات الفعلية من ملف Excel بنجاح!' : 'Actual counts imported from Excel successfully!');
      } catch (err) {
        console.error('Error importing XLSX:', err);
        alert(isAr ? 'حدث خطأ أثناء قراءة ملف Excel.' : 'Error parsing Excel file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // ==========================================
  // 4. ATTACHMENT HANDLER (Images & PDFs)
  // ==========================================
  const handleUploadAttachment = async (e, session) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newAttachments = [];
    for (const file of files) {
      const reader = new FileReader();
      const fileDataPromise = new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

      const base64Data = await fileDataPromise;
      newAttachments.push({
        id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: file.name,
        type: file.type.includes('pdf') ? 'pdf' : 'image',
        size: `${(file.size / 1024).toFixed(1)} KB`,
        data: base64Data,
        uploadedBy: currentUserName,
        uploadedAt: new Date().toISOString(),
      });
    }

    try {
      const updatedList = [...(session.attachments || []), ...newAttachments];
      const attachLog = createAuditLog(
        'attachment_uploaded',
        `رفع (${newAttachments.length}) مرفق/استمارة جرد موقعة`,
        `Uploaded (${newAttachments.length}) scanned audit attachment(s)`,
        { fileNames: newAttachments.map((a) => a.name).join(', ') }
      );

      await setDoc(
        doc(db, 'stock_counts', session.id),
        {
          attachments: updatedList,
          auditLogs: [...(session.auditLogs || []), attachLog],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error saving attachments:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المرفقات.' : 'Error uploading attachments.');
    }
  };

  const handleDeleteAttachment = async (attId, session) => {
    if (!window.confirm(isAr ? 'حذف هذا المرفق نهائياً؟' : 'Delete this attachment?')) return;
    const targetAtt = (session.attachments || []).find((a) => a.id !== attId);
    const deleteLog = createAuditLog(
      'attachment_deleted',
      `حذف مرفق جرد (${targetAtt?.name || attId})`,
      `Deleted audit attachment (${targetAtt?.name || attId})`
    );

    try {
      const updated = (session.attachments || []).filter((a) => a.id !== attId);
      await setDoc(
        doc(db, 'stock_counts', session.id),
        {
          attachments: updated,
          auditLogs: [...(session.auditLogs || []), deleteLog],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error deleting attachment:', err);
    }
  };

  // ==========================================
  // 5. IN-APP EDITING & SUBMITTING FINDINGS
  // ==========================================
  const handleSaveLineFoundCount = async (e) => {
    e.preventDefault();
    if (!showEditLineModal) return;

    const { session, lineIndex, line: editedLine } = showEditLineModal;

    const ratio = Number(editedLine.packagingRatio || 1);
    let totalActual = editedLine.actualSmallQty;

    // If user filled Large Units or Loose Small Units
    if (editedLine.actualLargeQty !== '' || editedLine.actualSmallRemainingQty !== '') {
      const lQty = Number(editedLine.actualLargeQty || 0);
      const sQty = Number(editedLine.actualSmallRemainingQty || 0);
      totalActual = (lQty * ratio) + sQty;
    }

    if (totalActual === null || totalActual === '' || isNaN(Number(totalActual))) {
      alert(isAr ? 'يرجى إدخال الكمية الفعلية المحصورة.' : 'Please enter the actual counted quantity.');
      return;
    }

    totalActual = Number(totalActual);
    const prevCount = session.lines[lineIndex]?.actualSmallQty;
    const now = new Date();

    const rowHistoryEntry = {
      id: `rhist_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      user: currentUserName,
      userId: currentUserId,
      previousCount: prevCount !== null && prevCount !== undefined ? prevCount : null,
      newCount: totalActual,
      unit: editedLine.smallUnit,
      largeCount: editedLine.actualLargeQty !== '' ? Number(editedLine.actualLargeQty) : null,
      looseCount: editedLine.actualSmallRemainingQty !== '' ? Number(editedLine.actualSmallRemainingQty) : null,
      largeUnitName: editedLine.largeUnitName,
      source: 'manual_edit',
      timestamp: now.toISOString(),
      displayDate: now.toISOString().split('T')[0],
      displayTime: now.toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedLine = {
      ...editedLine,
      actualSmallQty: totalActual,
      variance: totalActual - Number(editedLine.bookSmallQty || 0),
      history: [...(editedLine.history || []), rowHistoryEntry],
    };

    const updatedLines = [...session.lines];
    updatedLines[lineIndex] = updatedLine;

    const editLineLog = createAuditLog(
      'line_count_edited',
      `تسجيل/تعديل الجرد الفعلي للبند [${editedLine.itemCode} - ${editedLine.variantCode}] لوط (${editedLine.lotNumber})`,
      `Updated actual count for item [${editedLine.itemCode}] lot (${editedLine.lotNumber})`,
      {
        item: editedLine.itemNameAr,
        lotNumber: editedLine.lotNumber,
        previousActual: prevCount !== null && prevCount !== undefined ? prevCount : (isAr ? 'فارغ' : 'Empty'),
        newActual: totalActual,
        unit: editedLine.smallUnit,
        variance: totalActual - Number(editedLine.bookSmallQty || 0),
      }
    );

    try {
      await setDoc(
        doc(db, 'stock_counts', session.id),
        {
          lines: updatedLines,
          auditLogs: [...(session.auditLogs || []), editLineLog],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setShowEditLineModal(null);
    } catch (err) {
      console.error('Error updating line count:', err);
      alert(isAr ? 'حدث خطأ أثناء تحديث الكميات.' : 'Error updating quantities.');
    }
  };

  const handleSubmitFindings = async (session) => {
    const uncountedCount = (session.lines || []).filter((l) => l.actualSmallQty === null || l.actualSmallQty === undefined).length;
    if (uncountedCount > 0) {
      if (!window.confirm(
        isAr
          ? `يوجد (${uncountedCount}) بند لم يتم إدخال نتائج جرده بعد. هل تريد تسليم الجرد الآن؟`
          : `There are ${uncountedCount} uncounted items. Submit findings anyway?`
      )) return;
    }

    const submitLog = createAuditLog(
      'findings_submitted',
      'تسليم نتائج الجرد الفعلي للمسؤول العام للاعتماد والتسوية',
      'Submitted physical count findings for General Admin reconciliation signoff'
    );

    try {
      await setDoc(
        doc(db, 'stock_counts', session.id),
        {
          status: 'submitted',
          auditLogs: [...(session.auditLogs || []), submitLog],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert(isAr ? 'تم تسليم نتائج الجرد بنجاح! بانتظار مراجعة واعتماد المسؤول العام.' : 'Findings submitted for Admin Review.');
    } catch (err) {
      console.error('Error submitting findings:', err);
      alert(isAr ? 'حدث خطأ أثناء تسليم الجرد.' : 'Error submitting findings.');
    }
  };

  // ==========================================
  // 6. GRANULAR APPROVAL & RECONCILIATION
  // ==========================================
  const handleApproveReconciliationLines = async (session, indicesToApprove) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'اعتماد التسويات المخزنية مقصور حصراً على المسؤول العام.' : 'Reconciliation approval is strictly restricted to General Admin.');
      return;
    }

    if (indicesToApprove.length === 0) {
      alert(isAr ? 'يرجى تحديد بند واحد على الأقل للاعتماد.' : 'Please select lines to approve.');
      return;
    }

    setIsProcessingApproval(true);
    try {
      const batch = writeBatch(db);
      const todayStr = new Date().toISOString().split('T')[0];
      const todayCompact = todayStr.replace(/-/g, '');
      const updatedLines = [...session.lines];

      indicesToApprove.forEach((idx) => {
        const line = updatedLines[idx];
        if (line.status === 'approved' || line.actualSmallQty === null) return;

        line.status = 'approved';
        line.approvedBy = currentUserName;
        line.approvedAt = todayStr;

        if (line.variance && line.variance !== 0) {
          const adjId = `ADJ-${todayCompact}-${session.id}-${line.lotNumber}`;
          const isSurplus = line.variance > 0;
          const varianceAbs = Math.abs(line.variance);

          // 1. Create Receipt/Adjustment Document (Stamping Placed-by user & Old Expected Qty)
          const receiptRef = doc(db, 'goods_receipts', adjId);
          batch.set(receiptRef, {
            id: adjId,
            docType: 'inventory_reconciliation',
            status: 'approved',
            supplierId: 'STOCK_COUNT_RECONCILIATION',
            supplierName: isAr ? `تسوية جرد فعلي (${session.id})` : `Stock Count Adjustment (${session.id})`,
            receiptDate: todayStr,
            targetWarehouse: line.warehouseId,
            placedBy: session.createdBy, // User who placed/conducted the count
            oldBalance: line.bookSmallQty,
            actualBalance: line.actualSmallQty,
            lines: [
              {
                lotNumber: line.lotNumber,
                itemId: line.itemId,
                code: line.variantCode,
                variantCode: line.variantCode,
                nameAr: line.itemNameAr,
                nameEn: line.itemNameEn,
                specs: line.variantSpecs,
                targetWarehouse: line.warehouseId,
                smallUnit: line.smallUnit,
                receivedSmallUnits: isSurplus ? varianceAbs : -varianceAbs,
                oldBookBalance: line.bookSmallQty, // Expected balance before reconciliation
                actualFoundQty: line.actualSmallQty,
                variance: line.variance,
                placedBy: session.createdBy, // User who placed count
                unitPrice: line.unitCost || 0,
                currency: line.currency || 'EGP',
                qcStatus: 'accepted',
                notes: `Reconciliation: Book=${line.bookSmallQty}, Actual=${line.actualSmallQty}, Diff=${line.variance}`,
              },
            ],
            receivedBy: currentUserName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // 2. Post to Immutable Movement Ledger (Audit Trail)
          const ledgerRef = doc(collection(db, 'stock_ledger'));
          batch.set(ledgerRef, {
            grnId: adjId,
            lotNumber: line.lotNumber,
            action: isSurplus ? 'reconciliation_surplus' : 'reconciliation_deficit',
            docType: 'inventory_reconciliation',
            sessionId: session.id,
            itemId: line.itemId,
            variantCode: line.variantCode,
            materialNameAr: line.itemNameAr,
            oldBalance: line.bookSmallQty,
            newActualBalance: line.actualSmallQty,
            qty: isSurplus ? varianceAbs : -varianceAbs,
            variance: line.variance,
            unit: line.smallUnit,
            warehouse: line.warehouseId,
            placedBy: session.createdBy, // User who placed count
            receiptDate: todayStr,
            unitPrice: line.unitCost || 0,
            currency: line.currency || 'EGP',
            financialImpact: line.variance * (line.unitCost || 0),
            approvedBy: currentUserName,
            approverId: currentUserId,
            timestamp: serverTimestamp(),
          });
        }
      });

      const allApproved = updatedLines.every((l) => l.status === 'approved');
      const anyApproved = updatedLines.some((l) => l.status === 'approved');
      const nextSessionStatus = allApproved ? 'done' : anyApproved ? 'under-review' : session.status;

      const approveLog = createAuditLog(
        'lines_approved',
        `اعتماد وتسوية (${indicesToApprove.length}) بند من بنود الجرد المخزني`,
        `Approved and reconciled (${indicesToApprove.length}) inventory line(s)`,
        {
          approvedCount: indicesToApprove.length,
          allCompleted: allApproved,
        }
      );

      const sessionRef = doc(db, 'stock_counts', session.id);
      batch.set(
        sessionRef,
        {
          lines: updatedLines,
          status: nextSessionStatus,
          auditLogs: [...(session.auditLogs || []), approveLog],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      setSelectedLineIndices([]);
      alert(isAr ? `تم اعتماد وتسوية (${indicesToApprove.length}) بند بنجاح وتحديث أرصدة المخازن فورياً!` : `Approved (${indicesToApprove.length}) reconciliation lines successfully!`);
    } catch (err) {
      console.error('Error approving reconciliation:', err);
      alert(isAr ? 'حدث خطأ أثناء اعتماد التسوية.' : 'Error approving reconciliation.');
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const renderStatusBadge = (status, lines = []) => {
    const approvedCount = lines.filter((l) => l.status === 'approved').length;
    const totalCount = lines.length;

    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="h-3 w-3 text-slate-500" />
            <span>{isAr ? 'معلق (بانتظار البدء)' : 'Pending'}</span>
          </span>
        );
      case 'in-process':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
            <Boxes className="h-3 w-3 text-amber-600" />
            <span>{isAr ? 'جاري التنفيذ (تحت الجرد)' : 'In-Process'}</span>
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-300">
            <Send className="h-3 w-3 text-indigo-600" />
            <span>{isAr ? 'تم التسليم (بانتظار الاعتماد)' : 'Submitted'}</span>
          </span>
        );
      case 'under-review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-300">
            <ShieldCheck className="h-3 w-3 text-purple-600" />
            <span>{isAr ? `قيد الاعتماد (${approvedCount}/${totalCount})` : `Under Review (${approvedCount}/${totalCount})`}</span>
          </span>
        );
      case 'done':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>{isAr ? 'مكتمل ومعتمد بالكامل' : 'Done'}</span>
          </span>
        );
      default:
        return null;
    }
  };

  // Filter and 5-Level Hierarchically Sort Lines for Detailed Review
  const filteredSessionLines = useMemo(() => {
    if (!activeSession) return [];
    const filtered = (activeSession.lines || []).filter((l) => {
      const matchWh = warehouseFilter === 'all' || l.warehouseId === warehouseFilter;
      let matchVar = true;
      if (varianceFilter === 'variance_only') matchVar = l.variance !== null && l.variance !== 0;
      if (varianceFilter === 'surplus') matchVar = l.variance !== null && l.variance > 0;
      if (varianceFilter === 'deficit') matchVar = l.variance !== null && l.variance < 0;
      if (varianceFilter === 'matched') matchVar = l.variance === 0;
      if (varianceFilter === 'uncounted') matchVar = l.actualSmallQty === null || l.actualSmallQty === undefined;

      return matchWh && matchVar;
    });
    return sortStockCountLines(filtered);
  }, [activeSession, warehouseFilter, varianceFilter]);

  return (
    <div className="space-y-5 select-none">
      {/* Top Header */}
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
              {isAr ? (tabConfig?.labelAr || 'الجرد المخزني الفعلي وتسوية الفروق (Stock Count & Reconciliation)') : (tabConfig?.labelEn || 'Physical Stock Count & Inventory Audit')}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'تحديد نطاق الجرد، استخراج الشيتات، إدخال الفعلي، اعتماد التسويات، وسجل التدقيق' : 'Define scope, export multi-tab sheets, enter actual findings, and reconcile'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Direct Stock & Lot Adjustment Button */}
          <button
            type="button"
            onClick={handleOpenDirectAdjustment}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            title={isAr ? 'إجراء تسوية فورية على مستوى التنوع ورقم اللوط بمستودع محدد' : 'Apply Direct Stock Adjustment on Variant & Lot'}
          >
            <Sliders className="h-4 w-4" />
            <span>{isAr ? 'تسوية مخزنية مباشرة (Direct Adjustment)' : 'Direct Stock Adjustment'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateSession}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'بدء دورة جرد جديدة (Define Scope)' : 'Start New Stock Count'}</span>
          </button>
        </div>
      </div>

      {/* Main Sessions Table */}
      {!activeSession && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white min-h-[350px]">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-extrabold text-slate-800 flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-600" />
              <span>{isAr ? 'سجل دورات الجرد والتسويات المخزنية' : 'Stock Count Sessions History'}</span>
            </span>
          </div>

          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 text-start">{isAr ? 'رقم دورة الجرد' : 'Session ID'}</th>
                <th className="p-3 text-start">{isAr ? 'التاريخ والمنسق' : 'Date & Auditor'}</th>
                <th className="p-3 text-start">{isAr ? 'نطاق الجرد (Scope)' : 'Scope'}</th>
                <th className="p-3 text-center">{isAr ? 'حالة الملفات' : 'Files Status'}</th>
                <th className="p-3 text-center">{isAr ? 'المرفقات' : 'Proof'}</th>
                <th className="p-3 text-center">{isAr ? 'حالة الجرد' : 'Status'}</th>
                <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <PeacockLoader size="lg" text={isAr ? 'جاري قراءة سجلات الجرد...' : 'Loading Stock Counts...'} />
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {isAr ? 'لا توجد دورات جرد مسجلة حتى الآن. انقر على "بدء دورة جرد جديدة" للبدء.' : 'No stock count sessions recorded yet.'}
                  </td>
                </tr>
              ) : (
                sessions.map((sess) => {
                  return (
                    <tr key={sess.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 font-mono font-extrabold text-indigo-700">{sess.id}</td>
                      <td className="p-3">
                        <span className="font-mono font-semibold text-slate-700 block">{sess.sessionDate}</span>
                        <span className="text-[10px] text-slate-400 block">{sess.createdBy}</span>
                      </td>

                      {/* Scope Summary */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {(sess.targetWarehouses || []).slice(0, 2).map((wId) => (
                              <span key={wId} className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 text-slate-800 rounded font-bold text-[10px]">
                                {getWarehouseName(wId)}
                              </span>
                            ))}
                            {(sess.targetWarehouses || []).length > 2 && (
                              <span className="text-[10px] text-slate-400 font-bold">
                                +{(sess.targetWarehouses || []).length - 2}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 block">
                            {sess.lines?.length || 0} {isAr ? 'لوط مدرج بالجرد' : 'Lots in Scope'}
                          </span>
                        </div>
                      </td>

                      {/* Spreadsheet & Printout Readiness Icons */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            title={sess.hasDownloadedXlsx ? (isAr ? 'تم تنزيل شيت Excel' : 'XLSX Downloaded') : (isAr ? 'لم ينزل شيت Excel' : 'XLSX Not Downloaded')}
                            className={`p-1.5 rounded-lg border ${
                              sess.hasDownloadedXlsx
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-300 border-slate-200'
                            }`}
                          >
                            <FileSpreadsheet className="h-4 w-4" />
                          </span>

                          <span
                            title={sess.hasPrintedSheet ? (isAr ? 'تمت طباعة استمارة الجرد' : 'Sheet Printed') : (isAr ? 'لم تطبع الاستمارة' : 'Not Printed')}
                            className={`p-1.5 rounded-lg border ${
                              sess.hasPrintedSheet
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-50 text-slate-300 border-slate-200'
                            }`}
                          >
                            <Printer className="h-4 w-4" />
                          </span>
                        </div>
                      </td>

                      {/* Scanned Proof Attachments */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setShowAttachmentModal(sess)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                        >
                          <Paperclip className="h-3.5 w-3.5 text-indigo-600" />
                          <span>{sess.attachments?.length || 0}</span>
                        </button>
                      </td>

                      {/* 5-Stage Status Badge */}
                      <td className="p-3 text-center">{renderStatusBadge(sess.status, sess.lines)}</td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowSessionAuditModal(sess)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
                            title={isAr ? 'سجل تدقيق دورة الجرد' : 'Session Audit Trail'}
                          >
                            <History className="h-4 w-4 text-indigo-600" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveSession(sess)}
                            className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>{isAr ? 'فتح الجرد' : 'Open'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExportMultiTabXlsx(sess)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition cursor-pointer"
                            title={isAr ? 'تصدير شيت Excel' : 'Download XLSX'}
                          >
                            <FileSpreadsheet className="h-4 w-4" />
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

      {/* DETAILED SESSION AUDIT VIEW */}
      {activeSession && (
        <div className="space-y-4">
          {/* Top Session Summary Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveSession(null);
                  setSelectedLineIndices([]);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                title={isAr ? 'رجوع لسجل الجرد' : 'Back to Sessions'}
              >
                <ChevronRight className={`h-5 w-5 ${isAr ? '' : 'rotate-180'}`} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono font-extrabold text-base text-indigo-900">{activeSession.id}</h3>
                  {renderStatusBadge(activeSession.status, activeSession.lines)}
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {isAr ? `تاريخ اللقطة: ${activeSession.sessionDate} • المنسق: ${activeSession.createdBy}` : `Date: ${activeSession.sessionDate} • By: ${activeSession.createdBy}`}
                </span>
              </div>
            </div>

            {/* Session Actions Group */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Session Audit Trail Button */}
              <button
                type="button"
                onClick={() => setShowSessionAuditModal(activeSession)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-indigo-800 border border-slate-300 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title={isAr ? 'عرض سجل وتاريخ كافة عمليات الجرد' : 'View Audit Trail'}
              >
                <History className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'سجل التدقيق' : 'Audit Trail'} ({activeSession.auditLogs?.length || 1})</span>
              </button>

              {/* Export XLSX Button */}
              <button
                type="button"
                onClick={() => handleExportMultiTabXlsx(activeSession)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>{isAr ? 'تصدير شيت الجرد (XLSX)' : 'Export XLSX'}</span>
              </button>

              {/* Import Filled XLSX Button */}
              {activeSession.status !== 'done' && (
                <label className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer">
                  <FileUp className="h-4 w-4" />
                  <span>{isAr ? 'استيراد شيت الجرد المعبأ' : 'Import Filled XLSX'}</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={(e) => handleImportFilledXlsx(e, activeSession)}
                    className="sr-only"
                  />
                </label>
              )}

              {/* Printable Count Sheet */}
              <button
                type="button"
                onClick={() => handleOpenPrint(activeSession)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>{isAr ? 'طباعة استمارة الجرد' : 'Print Form'}</span>
              </button>

              {/* Scanned Proof / Attachments */}
              <button
                type="button"
                onClick={() => setShowAttachmentModal(activeSession)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition border border-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Paperclip className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'المرفقات الممسوحة' : 'Scanned Proof'} ({activeSession.attachments?.length || 0})</span>
              </button>

              {/* Finalize / Submit Findings Button */}
              {activeSession.status === 'in-process' && (
                <button
                  type="button"
                  onClick={() => handleSubmitFindings(activeSession)}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  <span>{isAr ? 'تسليم نتائج الجرد للاعتماد' : 'Submit Findings'}</span>
                </button>
              )}

              {/* Bulk Approval Button (General Admin Only) */}
              {isGeneralAdmin && activeSession.status !== 'done' && (
                <button
                  type="button"
                  disabled={selectedLineIndices.length === 0 || isProcessingApproval}
                  onClick={() => handleApproveReconciliationLines(activeSession, selectedLineIndices)}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{isAr ? `اعتماد البنود المحددة (${selectedLineIndices.length})` : `Approve Selected (${selectedLineIndices.length})`}</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar inside Active Session */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'تصفية حسب المستودع:' : 'Filter Warehouse:'}</label>
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                <option value="all">{isAr ? '📍 جميع المستودعات المشمولة' : 'All Target Warehouses'}</option>
                {activeSession.targetWarehouses?.map((wId) => (
                  <option key={wId} value={wId}>{getWarehouseName(wId)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'تصفية الفروقات والتطابق:' : 'Filter Variances:'}</label>
              <select
                value={varianceFilter}
                onChange={(e) => setVarianceFilter(e.target.value)}
                className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                <option value="all">{isAr ? '🔍 جميع البنود واللوطات' : 'All Lines'}</option>
                <option value="uncounted">{isAr ? '⏳ بنود لم يتم إدخال نتائجها بعد' : 'Uncounted Items'}</option>
                <option value="variance_only">{isAr ? '⚠️ الفروقات فقط (زيادة أو عجز)' : 'Variances Only'}</option>
                <option value="surplus">{isAr ? '🟢 زيادة في الجرد (+)' : 'Surplus (+)'}</option>
                <option value="deficit">{isAr ? '🔴 عجز في الجرد (-)' : 'Deficit (-)'}</option>
                <option value="matched">{isAr ? '⚪ مطابقة تماماً (صفر فرق)' : 'Matched (0 Diff)'}</option>
              </select>
            </div>

            {isGeneralAdmin && activeSession.status !== 'done' && (
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const pendingIndices = (activeSession.lines || [])
                      .map((l, i) => (l.status !== 'approved' && l.actualSmallQty !== null ? i : null))
                      .filter((i) => i !== null);
                    setSelectedLineIndices(pendingIndices);
                  }}
                  className="w-full sm:w-auto px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  {isAr ? 'تحديد كافة البنود الجاهزة للاعتماد' : 'Select All Ready Lines'}
                </button>
              </div>
            )}
          </div>

          {/* Granular Reconciliation Matrix Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                  {isGeneralAdmin && activeSession.status !== 'done' && <th className="p-3 text-center w-10">#</th>}
                  <th className="p-3 text-start">{isAr ? 'المستودع والتصنيف' : 'Warehouse & Cat'}</th>
                  <th className="p-3 text-start">{isAr ? 'الخامة ورقم اللوط (FIFO)' : 'Item, Variant & Lot #'}</th>
                  <th className="p-3 text-center bg-slate-50">{isAr ? 'الرصيد الدفتري' : 'Book Qty'}</th>
                  <th className="p-3 text-center bg-indigo-50/50">{isAr ? 'الجرد الفعلي' : 'Actual Found'}</th>
                  <th className="p-3 text-center">{isAr ? 'فارق الجرد' : 'Variance'}</th>
                  {canViewPrices && <th className="p-3 text-end">{isAr ? 'الأثر المالي' : 'Financial Impact'}</th>}
                  <th className="p-3 text-center">{isAr ? 'الحالة والاعتماد' : 'Status & Approval'}</th>
                  <th className="p-3 text-center">{isAr ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSessionLines.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      {isAr ? 'لا توجد بنود مطابقة للفلاتر المحددة.' : 'No lines match selected filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredSessionLines.map((line, lIdx) => {
                    const originalIdx = (activeSession.lines || []).findIndex((l) => l === line);
                    const isSelected = selectedLineIndices.includes(originalIdx);
                    const isApproved = line.status === 'approved';
                    const isUncounted = line.actualSmallQty === null || line.actualSmallQty === undefined;
                    const hasVariance = !isUncounted && line.variance !== 0;

                    return (
                      <tr key={lIdx} className={`hover:bg-slate-50/80 transition ${hasVariance ? 'bg-amber-50/20' : ''}`}>
                        {isGeneralAdmin && activeSession.status !== 'done' && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              disabled={isApproved || isUncounted}
                              onClick={() => {
                                setSelectedLineIndices((prev) =>
                                  prev.includes(originalIdx) ? prev.filter((i) => i !== originalIdx) : [...prev, originalIdx]
                                );
                              }}
                              className="cursor-pointer disabled:opacity-30"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-indigo-600" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-300" />
                              )}
                            </button>
                          </td>
                        )}

                        <td className="p-3 align-top">
                          <span className="font-bold text-slate-900 block">{getWarehouseName(line.warehouseId)}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{line.categoryName}</span>
                        </td>

                        <td className="p-3 align-top">
                          <span className="font-bold text-slate-900 block">{line.itemNameAr}</span>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className="font-mono text-slate-600 font-semibold">{line.variantCode}</span>
                            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded border border-indigo-200">
                              Lot: {line.lotNumber}
                            </span>
                          </div>
                        </td>

                        {/* Book Qty */}
                        <td className="p-3 align-top text-center font-mono font-bold text-slate-700 bg-slate-50/40">
                          <div>{line.bookSmallQty.toLocaleString()} {line.smallUnit}</div>
                          {line.packagingRatio > 1 && (
                            <span className="text-[10px] text-slate-400 block font-normal">
                              ({line.bookLargeQty} {line.largeUnitName})
                            </span>
                          )}
                        </td>

                        {/* Actual Found Qty (Unbiased) */}
                        <td className="p-3 align-top text-center font-mono font-extrabold text-indigo-950 bg-indigo-50/30">
                          {isUncounted ? (
                            <span className="text-slate-400 font-normal italic">{isAr ? 'لم يحدد بعد' : 'Not entered'}</span>
                          ) : (
                            <>
                              <div>{Number(line.actualSmallQty).toLocaleString()} {line.smallUnit}</div>
                              {line.packagingRatio > 1 && (
                                <span className="text-[10px] text-slate-500 block font-normal">
                                  ({(line.actualSmallQty / line.packagingRatio).toFixed(2)} {line.largeUnitName})
                                </span>
                              )}
                            </>
                          )}
                        </td>

                        {/* Variance */}
                        <td className="p-3 align-top text-center font-mono font-bold">
                          {isUncounted ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs ${
                                line.variance > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : line.variance < 0
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {line.variance > 0 ? `+${line.variance.toLocaleString()}` : line.variance.toLocaleString()} {line.smallUnit}
                            </span>
                          )}
                        </td>

                        {/* Financial Impact */}
                        {canViewPrices && (
                          <td className="p-3 align-top text-end font-mono">
                            {isUncounted ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <>
                                <span
                                  className={`font-bold block ${
                                    line.variance > 0
                                      ? 'text-emerald-700'
                                      : line.variance < 0
                                      ? 'text-rose-700'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {(line.variance * (line.unitCost || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[9px] text-slate-400 font-normal">EGP</span>
                              </>
                            )}
                          </td>
                        )}

                        {/* Line Status */}
                        <td className="p-3 align-top text-center">
                          {isApproved ? (
                            <div>
                              <span className="text-emerald-700 font-bold text-xs flex items-center justify-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>{isAr ? 'تمت التسوية' : 'Reconciled'}</span>
                              </span>
                              <span className="text-[9px] text-slate-400 block font-mono mt-0.5">{line.approvedBy}</span>
                            </div>
                          ) : isUncounted ? (
                            <span className="text-slate-400 text-xs">{isAr ? 'قيد الحصر' : 'Pending Count'}</span>
                          ) : (
                            <span className="text-amber-700 font-bold text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {isAr ? 'جاهز للاعتماد' : 'Ready for Review'}
                            </span>
                          )}
                        </td>

                        {/* Line Actions */}
                        <td className="p-3 align-top text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Row-Level Audit Trail Button */}
                            <button
                              type="button"
                              onClick={() => setShowLineHistoryModal({ line, session: activeSession })}
                              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-[10px] font-bold ${
                                (line.history?.length || 0) > 0
                                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                              }`}
                              title={isAr ? `سجل تعديلات هذا اللوط (${line.history?.length || 0})` : `Row Audit History (${line.history?.length || 0})`}
                            >
                              <History className="h-3.5 w-3.5" />
                              {(line.history?.length || 0) > 0 && (
                                <span className="font-mono">{line.history.length}</span>
                              )}
                            </button>

                            {!isApproved && (
                              <button
                                type="button"
                                onClick={() => setShowEditLineModal({ session: activeSession, line: { ...line }, lineIndex: originalIdx })}
                                className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                title={isAr ? 'إدخال / تعديل الكمية الفعلية' : 'Enter Found Count'}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {isGeneralAdmin && !isApproved && !isUncounted && (
                              <button
                                type="button"
                                onClick={() => handleApproveReconciliationLines(activeSession, [originalIdx])}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shadow-2xs"
                                title={isAr ? 'اعتماد تسوية هذا البند' : 'Approve Line'}
                              >
                                {isAr ? 'اعتماد' : 'Approve'}
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
      )}

      {/* ========================================================================= */}
      {/* 🚀 SMART SEQUENTIAL CASCADING SCOPE MODAL (MULTI-SELECT AT ALL LEVELS)  */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {isAr ? 'تحديد نطاق دورة الجرد الفعلي المتدرج (Smart Cascaded Scope)' : 'Configure Sequential Stock Count Scope'}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {isAr ? 'فلترة تتابعية ذكية: المستودعات ← التصنيفات ← الخامات ← التنوعات ← اللوطات' : 'Sequential Filter Tree: Warehouses ➔ Categories ➔ Items ➔ Variants ➔ Lots'}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSnapshotSession} className="space-y-4 text-xs">
              
              {/* STEP 1: TARGET WAREHOUSES */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Warehouse className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? '١. اختيار المستودعات المستهدفة بالجرد:' : '1. Target Warehouses:'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setScopeWarehouses(scopeWarehouses.includes('all') ? [] : ['all'])}
                    className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {scopeWarehouses.includes('all') ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All') : (isAr ? 'تحديد كافة المستودعات' : 'Select All')}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-900 hover:border-indigo-300">
                    <input
                      type="checkbox"
                      checked={scopeWarehouses.includes('all')}
                      onChange={() => setScopeWarehouses(scopeWarehouses.includes('all') ? [] : ['all'])}
                      className="rounded text-indigo-600"
                    />
                    <span>{isAr ? '🌐 كافة المستودعات (All)' : 'All Warehouses'}</span>
                  </label>
                  {warehouses.map((wh) => {
                    const id = wh.id || wh.code;
                    const isChecked = scopeWarehouses.includes('all') || scopeWarehouses.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-indigo-300">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const withoutAll = scopeWarehouses.filter((x) => x !== 'all');
                            const next = withoutAll.includes(id) ? withoutAll.filter((x) => x !== id) : [...withoutAll, id];
                            setScopeWarehouses(next.length === 0 ? ['all'] : next);
                          }}
                          className="rounded text-indigo-600"
                        />
                        <span className="truncate font-semibold text-slate-800">{getWarehouseName(id)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* STEP 2: CATEGORIES (Cascaded from Warehouses) */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '٢. تصنيفات الخامات المتاحة بالمستودعات المختارة:' : '2. Categories in Selected WH:'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setScopeCategories(scopeCategories.includes('all') ? [] : ['all'])}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    {scopeCategories.includes('all') ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All') : (isAr ? 'تحديد كافة التصنيفات' : 'Select All')}
                  </button>
                </div>

                {availableCategoriesInScope.length === 0 ? (
                  <div className="p-3 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                    {isAr ? 'لا توجد تصنيفات بها أرصدة نشطة في المستودعات المحددة.' : 'No active categories in selected warehouses.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-900 hover:border-emerald-300">
                      <input
                        type="checkbox"
                        checked={scopeCategories.includes('all')}
                        onChange={() => setScopeCategories(scopeCategories.includes('all') ? [] : ['all'])}
                        className="rounded text-emerald-600"
                      />
                      <span>{isAr ? '📂 كافة التصنيفات' : 'All Categories'}</span>
                    </label>
                    {availableCategoriesInScope.map((cat) => {
                      const id = String(cat.id);
                      const isChecked = scopeCategories.includes('all') || scopeCategories.includes(id);
                      return (
                        <label key={id} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-300">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const withoutAll = scopeCategories.filter((x) => x !== 'all');
                              const next = withoutAll.includes(id) ? withoutAll.filter((x) => x !== id) : [...withoutAll, id];
                              setScopeCategories(next.length === 0 ? ['all'] : next);
                            }}
                            className="rounded text-emerald-600"
                          />
                          <span className="truncate font-semibold text-slate-800">{isAr ? cat.nameAr : cat.nameEn}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* STEP 3: ITEMS & MATERIALS (Cascaded from Categories & Warehouses) */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Boxes className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? '٣. الخامات والأصناف المتاحة:' : '3. Items & Raw Materials:'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setScopeItems(scopeItems.includes('all') ? [] : ['all'])}
                    className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {scopeItems.includes('all') ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All') : (isAr ? 'تحديد كافة الأصناف' : 'Select All')}
                  </button>
                </div>

                {/* Quick Search inside available items */}
                <div className="relative">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    placeholder={isAr ? 'ابحث عن صنف بالاسم أو الكود...' : 'Search item name or code...'}
                    className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1">
                  <label className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer font-bold text-slate-900">
                    <input
                      type="checkbox"
                      checked={scopeItems.includes('all')}
                      onChange={() => setScopeItems(scopeItems.includes('all') ? [] : ['all'])}
                      className="rounded text-indigo-600"
                    />
                    <span>{isAr ? '📦 كافة الخامات المتاحة' : 'All Materials'}</span>
                  </label>
                  {availableItemsInScope
                    .filter((item) => {
                      if (!itemSearchQuery.trim()) return true;
                      const q = itemSearchQuery.toLowerCase();
                      return item.code?.toLowerCase().includes(q) || item.nameAr?.includes(q) || item.nameEn?.toLowerCase().includes(q);
                    })
                    .map((item) => {
                      const code = item.code || item.id;
                      const isChecked = scopeItems.includes('all') || scopeItems.includes(code);
                      return (
                        <label key={code} className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const withoutAll = scopeItems.filter((x) => x !== 'all');
                              const next = withoutAll.includes(code) ? withoutAll.filter((x) => x !== code) : [...withoutAll, code];
                              setScopeItems(next.length === 0 ? ['all'] : next);
                            }}
                            className="rounded text-indigo-600"
                          />
                          <span className="truncate font-semibold text-slate-800 font-mono text-[11px]">
                            [{item.code}] {item.nameAr}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* STEP 4: VARIATIONS & PACKAGING (Cascaded from Items) */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Tag className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? '٤. تنوعات الخامات ومواصفات التعبئة:' : '4. Item Variants & Packaging:'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setScopeVariants(scopeVariants.includes('all') ? [] : ['all'])}
                    className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {scopeVariants.includes('all') ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All') : (isAr ? 'تحديد كافة التنوعات' : 'Select All')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1">
                  <label className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer font-bold text-slate-900">
                    <input
                      type="checkbox"
                      checked={scopeVariants.includes('all')}
                      onChange={() => setScopeVariants(scopeVariants.includes('all') ? [] : ['all'])}
                      className="rounded text-indigo-600"
                    />
                    <span>{isAr ? '🏷️ كافة تنوعات الخامات' : 'All Variations'}</span>
                  </label>
                  {availableVariantsInScope.map((v) => {
                    const isChecked = scopeVariants.includes('all') || scopeVariants.includes(v.key);
                    return (
                      <label key={v.key} className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const withoutAll = scopeVariants.filter((x) => x !== 'all');
                            const next = withoutAll.includes(v.key) ? withoutAll.filter((x) => x !== v.key) : [...withoutAll, v.key];
                            setScopeVariants(next.length === 0 ? ['all'] : next);
                          }}
                          className="rounded text-indigo-600"
                        />
                        <div className="truncate text-start">
                          <span className="font-mono font-bold text-indigo-900 block">{v.variantCode}</span>
                          <span className="text-[10px] text-slate-500 truncate block">
                            {v.nameAr} {v.specs ? `(${v.specs})` : ''} • ({v.availableQty.toLocaleString()} {v.smallUnit})
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* STEP 5: SPECIFIC LOTS & BATCHES (Cascaded from Variants) */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '٥. أرقام التشغيلات واللوطات (FIFO Lots):' : '5. Specific FIFO Lots:'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setScopeLots(scopeLots.includes('all') ? [] : ['all'])}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    {scopeLots.includes('all') ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All') : (isAr ? 'تحديد كافة اللوطات' : 'Select All')}
                  </button>
                </div>

                {/* Quick Lot Search */}
                <div className="relative">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={lotSearchQuery}
                    onChange={(e) => setLotSearchQuery(e.target.value)}
                    placeholder={isAr ? 'ابحث برقم اللوط...' : 'Search by Lot Number...'}
                    className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-1">
                  <label className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer font-bold text-slate-900">
                    <input
                      type="checkbox"
                      checked={scopeLots.includes('all')}
                      onChange={() => setScopeLots(scopeLots.includes('all') ? [] : ['all'])}
                      className="rounded text-emerald-600"
                    />
                    <span>{isAr ? '🎯 كافة اللوطات المتاحة' : 'All Available Lots'}</span>
                  </label>
                  {availableLotsInScope
                    .filter((lot) => {
                      if (!lotSearchQuery.trim()) return true;
                      return lot.lotNumber.toLowerCase().includes(lotSearchQuery.toLowerCase());
                    })
                    .map((lot) => {
                      const isChecked = scopeLots.includes('all') || scopeLots.includes(lot.lotNumber);
                      return (
                        <label key={`${lot.lotNumber}_${lot.warehouseId}`} className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const withoutAll = scopeLots.filter((x) => x !== 'all');
                              const next = withoutAll.includes(lot.lotNumber) ? withoutAll.filter((x) => x !== lot.lotNumber) : [...withoutAll, lot.lotNumber];
                              setScopeLots(next.length === 0 ? ['all'] : next);
                            }}
                            className="rounded text-emerald-600"
                          />
                          <div className="truncate text-start font-mono text-[11px]">
                            <span className="font-bold text-indigo-900 block">{lot.lotNumber}</span>
                            <span className="text-[10px] text-slate-500 block">
                              {getWarehouseName(lot.warehouseId)} • {lot.availableQty.toLocaleString()} {lot.smallUnit}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* LIVE SCOPE MATCHING SUMMARY BANNER */}
              <div className="p-3.5 bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <div>
                    <span className="font-extrabold text-xs text-slate-900 block">
                      {isAr ? 'ملخص نطاق دورة الجرد المستهدفة:' : 'Target Scope Summary:'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {isAr ? 'سيتم توليد شيتات Excel مستقلة لكل مستودع مشمول بالنطاق' : 'Dedicated worksheet will be generated for each warehouse in scope'}
                    </span>
                  </div>
                </div>
                <div className="text-end">
                  <span className="font-mono font-extrabold text-base text-indigo-800 bg-white px-3 py-1 rounded-xl border border-indigo-200 shadow-2xs">
                    {finalMatchingLots.length} {isAr ? 'لوط / بند' : 'Lots in Scope'}
                  </span>
                </div>
              </div>

              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  {isAr ? 'ملاحظات وتوجيهات دورة الجرد:' : 'Session Remarks:'}
                </label>
                <textarea
                  rows="2"
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder={isAr ? 'مثال: جرد ربع سنوي فعلي لكافة مستودعات الخامات والتعبئة' : 'e.g. Q3 Physical Stocktake'}
                  className="w-full p-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={finalMatchingLots.length === 0}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{isAr ? 'تأكيد وقفل النطاق (Proceed)' : 'Lock Scope & Proceed'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FOUND LINE COUNT MODAL */}
      {showEditLineModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-indigo-600" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'إدخال نتائج الجرد الفعلي' : 'Enter Actual Count Findings'}
                </h3>
              </div>
              <button onClick={() => setShowEditLineModal(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLineFoundCount} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">{showEditLineModal.line.itemNameAr}</span>
                <div className="font-mono text-slate-500">
                  {showEditLineModal.line.variantCode} • Lot: {showEditLineModal.line.lotNumber}
                </div>
                <div className="text-[11px] font-bold text-slate-700 pt-1 border-t border-slate-200 flex justify-between">
                  <span>{isAr ? 'الرصيد الدفتري الحالي:' : 'Book Expected:'}</span>
                  <span className="font-mono text-indigo-700">{showEditLineModal.line.bookSmallQty?.toLocaleString()} {showEditLineModal.line.smallUnit}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                    {isAr ? `الفعلي بالوحدة الكبرى (${showEditLineModal.line.largeUnitName}):` : `Found Large Units:`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={showEditLineModal.line.actualLargeQty !== undefined ? showEditLineModal.line.actualLargeQty : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const ratio = Number(showEditLineModal.line.packagingRatio || 1);
                      const rem = Number(showEditLineModal.line.actualSmallRemainingQty || 0);
                      const lQty = val === '' ? 0 : Number(val);
                      const hasInputs = val !== '' || showEditLineModal.line.actualSmallRemainingQty !== '';
                      const updatedLine = {
                        ...showEditLineModal.line,
                        actualLargeQty: val,
                        actualSmallQty: hasInputs ? (lQty * ratio) + rem : null,
                      };
                      setShowEditLineModal({ ...showEditLineModal, line: updatedLine });
                    }}
                    className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                    {isAr ? `المتبقي فرط (${showEditLineModal.line.smallUnit}):` : `Remaining Loose Small:`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={showEditLineModal.line.actualSmallRemainingQty !== undefined ? showEditLineModal.line.actualSmallRemainingQty : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const ratio = Number(showEditLineModal.line.packagingRatio || 1);
                      const lQty = Number(showEditLineModal.line.actualLargeQty || 0);
                      const rem = val === '' ? 0 : Number(val);
                      const hasInputs = showEditLineModal.line.actualLargeQty !== '' || val !== '';
                      const updatedLine = {
                        ...showEditLineModal.line,
                        actualSmallRemainingQty: val,
                        actualSmallQty: hasInputs ? (lQty * ratio) + rem : null,
                      };
                      setShowEditLineModal({ ...showEditLineModal, line: updatedLine });
                    }}
                    className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                  {isAr ? `إجمالي الفعلي بالوحدة الصغرى (${showEditLineModal.line.smallUnit}): *` : `Total Found (${showEditLineModal.line.smallUnit}): *`}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="0"
                  value={showEditLineModal.line.actualSmallQty !== null && showEditLineModal.line.actualSmallQty !== undefined ? showEditLineModal.line.actualSmallQty : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    const ratio = Number(showEditLineModal.line.packagingRatio || 1);
                    const updatedLine = {
                      ...showEditLineModal.line,
                      actualSmallQty: val,
                      actualLargeQty: val !== null && ratio > 1 ? Number((val / ratio).toFixed(2)) : '',
                      actualSmallRemainingQty: '',
                    };
                    setShowEditLineModal({ ...showEditLineModal, line: updatedLine });
                  }}
                  className="w-full p-2 bg-indigo-50/50 border border-indigo-300 rounded-xl font-mono font-extrabold text-sm text-indigo-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditLineModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  {isAr ? 'حفظ الفعلي' : 'Save Count'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTACHMENT MANAGER MODAL (Images & PDFs) */}
      {showAttachmentModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'أوراق واستمارات الجرد الممسوحة يدوياً' : 'Handwritten Count Attachments'}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">{showAttachmentModal.id}</span>
                </div>
              </div>
              <button onClick={() => setShowAttachmentModal(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="p-4 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl bg-indigo-50/40 flex flex-col items-center justify-center gap-1 cursor-pointer transition">
              <UploadCloud className="h-6 w-6 text-indigo-600" />
              <span className="text-xs font-bold text-indigo-900">
                {isAr ? 'انقر لرفع صور أوراق الجرد الموقعة أو ملفات PDF' : 'Upload signed physical count sheets (Images/PDFs)'}
              </span>
              <span className="text-[10px] text-slate-400">JPG, PNG, PDF</span>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => handleUploadAttachment(e, showAttachmentModal)}
                className="sr-only"
              />
            </label>

            <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
              {showAttachmentModal.attachments?.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  {isAr ? 'لم يتم إرفاق أي مستندات أو صور بعد.' : 'No attachments uploaded yet.'}
                </div>
              ) : (
                showAttachmentModal.attachments?.map((att) => (
                  <div key={att.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {att.type === 'pdf' ? <FileText className="h-4 w-4 text-rose-600 shrink-0" /> : <ImageIcon className="h-4 w-4 text-indigo-600 shrink-0" />}
                      <span className="font-bold text-slate-800 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">({att.size})</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={att.data}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-indigo-600 hover:bg-indigo-100 rounded transition"
                        title={isAr ? 'معاينة المرفق' : 'Preview'}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id, showAttachmentModal)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title={isAr ? 'حذف المرفق' : 'Delete'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAttachmentModal(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE OFFICIAL STOCK COUNT SHEET MODAL */}
      {printSessionData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-indigo-600" />
                <h3 className="font-extrabold text-sm text-slate-900">{isAr ? 'استمارة جرد المخزون الفعلي الرسمية' : 'Official Physical Stock Count Sheet'}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isAr ? 'طباعة الاستمارة' : 'Print Form'}</span>
                </button>
                <button onClick={() => setPrintSessionData(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Printable Form Content */}
            <div className="space-y-4 text-xs">
              <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
                <div>
                  <h1 className="text-base font-extrabold text-slate-900">{isAr ? 'شركة الطاووس للصناعات الغذائية والتعبئة' : 'Al Tawoos Food Industries'}</h1>
                  <h2 className="text-sm font-bold text-indigo-900 mt-0.5">{isAr ? 'استمارة ولائحة حصر الجرد المخزني الفعلي' : 'Physical Inventory Count Sheet'}</h2>
                  <span className="font-mono text-slate-500 font-bold block mt-1">{isAr ? 'رقم الإذن:' : 'ID:'} {printSessionData.id}</span>
                </div>
                <div className="text-end font-mono text-xs">
                  <div>{isAr ? 'تاريخ الجرد:' : 'Date:'} {printSessionData.sessionDate}</div>
                  <div>{isAr ? 'المسؤول المنسق:' : 'Auditor:'} {printSessionData.createdBy}</div>
                </div>
              </div>

              {/* Printable Table */}
              <table className="w-full border-collapse border border-slate-400 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-400">
                    <th className="border border-slate-400 p-1.5 text-center w-8">#</th>
                    <th className="border border-slate-400 p-1.5 text-start">{isAr ? 'المستودع' : 'WH'}</th>
                    <th className="border border-slate-400 p-1.5 text-start">{isAr ? 'كود واسم الخامة' : 'Item'}</th>
                    <th className="border border-slate-400 p-1.5 text-start">{isAr ? 'رقم اللوط / التشغيلة' : 'Lot #'}</th>
                    <th className="border border-slate-400 p-1.5 text-center">{isAr ? 'الرصيد الدفتري المتوقع' : 'Book Expected'}</th>
                    <th className="border border-slate-400 p-1.5 text-center w-28">{isAr ? 'الفعلي المحصور (كبرى)' : 'Actual (Large)'}</th>
                    <th className="border border-slate-400 p-1.5 text-center w-28">{isAr ? 'إجمالي الفعلي (صغرى)' : 'Actual (Total Small)'}</th>
                    <th className="border border-slate-400 p-1.5 text-start w-36">{isAr ? 'ملاحظات وتوقيع اللجان' : 'Auditor Notes'}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortStockCountLines(printSessionData.lines || []).map((l, idx) => (
                    <tr key={idx} className="border-b border-slate-300">
                      <td className="border border-slate-300 p-1 text-center font-mono">{idx + 1}</td>
                      <td className="border border-slate-300 p-1 font-bold">{getWarehouseName(l.warehouseId)}</td>
                      <td className="border border-slate-300 p-1">
                        <div className="font-bold">{l.itemNameAr}</div>
                        <div className="font-mono text-[10px] text-slate-500">{l.variantCode} {l.variantSpecs ? `(${l.variantSpecs})` : ''}</div>
                      </td>
                      <td className="border border-slate-300 p-1 font-mono font-bold text-indigo-900">{l.lotNumber}</td>
                      <td className="border border-slate-300 p-1 text-center font-mono font-bold">
                        <div>{l.bookSmallQty.toLocaleString()} {l.smallUnit}</div>
                        {l.packagingRatio > 1 && (
                          <span className="text-[10px] text-slate-500 font-normal">({l.bookLargeQty} {l.largeUnitName})</span>
                        )}
                      </td>
                      <td className="border border-slate-300 p-1 text-center font-mono">
                        {l.actualLargeQty !== '' && l.actualLargeQty !== null && l.actualLargeQty !== undefined ? l.actualLargeQty : '...........'}
                      </td>
                      <td className="border border-slate-300 p-1 text-center font-mono">
                        {l.actualSmallQty !== null && l.actualSmallQty !== undefined ? l.actualSmallQty.toLocaleString() : '...........'}
                      </td>
                      <td className="border border-slate-300 p-1 text-slate-500">{l.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 3 Signatures Box */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-300 text-center text-xs">
                <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
                  <span className="text-slate-500 block mb-1">{isAr ? 'عضو لجنة الجرد المخزني' : 'Audit Committee Member'}</span>
                  <span className="font-bold block mt-3">....................................</span>
                </div>
                <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
                  <span className="text-slate-500 block mb-1">{isAr ? 'أمين العهدة والمخزن' : 'Storekeeper in Charge'}</span>
                  <span className="font-bold block mt-3">....................................</span>
                </div>
                <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
                  <span className="text-slate-500 block mb-1">{isAr ? 'المسؤول العام / الإدارة المالية' : 'General Admin / Finance'}</span>
                  <span className="font-bold block mt-3">....................................</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SESSION AUDIT TRAIL MODAL */}
      {showSessionAuditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[88vh] flex flex-col justify-between overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {isAr ? 'سجل التدقيق والعمليات لدورة الجرد (Session Audit Trail)' : 'Stock Count Session Audit Trail'}
                  </h3>
                  <span className="text-xs font-mono text-indigo-700 font-bold">
                    {showSessionAuditModal.id} • {showSessionAuditModal.sessionDate}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowSessionAuditModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Audit Logs Timeline */}
            <div className="flex-1 overflow-y-auto space-y-3 p-1 text-xs">
              {(!showSessionAuditModal.auditLogs || showSessionAuditModal.auditLogs.length === 0) ? (
                <div className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد سجلات تدقيق إضافية.' : 'No audit records logged yet.'}
                </div>
              ) : (
                [...showSessionAuditModal.auditLogs].reverse().map((log, lIdx) => (
                  <div
                    key={log.id || lIdx}
                    className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 hover:bg-slate-100/60 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                        <span>{isAr ? log.actionAr : log.actionEn || log.actionAr}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                        {log.displayDate || log.timestamp?.split('T')[0]} {log.displayTime ? `• ${log.displayTime}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                      <span className="flex items-center gap-1">
                        <span className="font-semibold text-slate-500">{isAr ? 'المسؤول المنفذ:' : 'Actor:'}</span>
                        <span className="font-bold text-slate-800">{log.user}</span>
                      </span>

                      {log.details && (
                        <div className="text-[10px] font-mono text-slate-500">
                          {log.details.item && <span>{log.details.item} • </span>}
                          {log.details.lotNumber && <span className="font-bold text-indigo-700">Lot: {log.details.lotNumber} </span>}
                          {log.details.newActual !== undefined && (
                            <span>
                              [{log.details.previousActual} {isAr ? '←' : '➔'} <b className="text-emerald-700">{log.details.newActual} {log.details.unit}</b>]
                            </span>
                          )}
                          {log.details.approvedCount && (
                            <span className="font-bold text-emerald-700">({log.details.approvedCount} {isAr ? 'بنود معتمدة' : 'approved'})</span>
                          )}
                          {log.details.fileNames && <span>({log.details.fileNames})</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSessionAuditModal(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROW-LEVEL AUDIT TRAIL MODAL (PER SINGLE ITEM / LOT) */}
      {showLineHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col justify-between overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'سجل وتاريخ تعديلات اللوط (Row Audit Trail)' : 'Lot Count Change History'}
                  </h3>
                  <span className="text-[10px] font-mono text-indigo-700 font-bold block">
                    {showLineHistoryModal.line.itemNameAr} • Lot: {showLineHistoryModal.line.lotNumber}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowLineHistoryModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scope & Book Summary Bar */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">{isAr ? 'المستودع' : 'Warehouse'}</span>
                <span className="font-bold text-slate-800 text-[11px]">{getWarehouseName(showLineHistoryModal.line.warehouseId)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isAr ? 'الرصيد الدفتري' : 'Book Expected'}</span>
                <span className="font-mono font-bold text-slate-900 text-[11px]">
                  {showLineHistoryModal.line.bookSmallQty?.toLocaleString()} {showLineHistoryModal.line.smallUnit}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">{isAr ? 'الفعلي الحالي' : 'Current Found'}</span>
                <span className="font-mono font-extrabold text-indigo-700 text-[11px]">
                  {showLineHistoryModal.line.actualSmallQty !== null && showLineHistoryModal.line.actualSmallQty !== undefined
                    ? `${Number(showLineHistoryModal.line.actualSmallQty).toLocaleString()} ${showLineHistoryModal.line.smallUnit}`
                    : (isAr ? 'لم يحدد' : 'None')}
                </span>
              </div>
            </div>

            {/* Change History Timeline */}
            <div className="flex-1 overflow-y-auto space-y-2.5 p-1 text-xs">
              {(!showLineHistoryModal.line.history || showLineHistoryModal.line.history.length === 0) ? (
                <div className="p-8 text-center text-slate-400">
                  {isAr ? 'لم يتم تسجيل أي تعديلات على هذا البند حتى الآن.' : 'No count changes logged yet for this row.'}
                </div>
              ) : (
                [...showLineHistoryModal.line.history].reverse().map((entry, idx) => {
                  const stepNum = showLineHistoryModal.line.history.length - idx;
                  const prevText = entry.previousCount !== null && entry.previousCount !== undefined
                    ? `${Number(entry.previousCount).toLocaleString()}`
                    : (isAr ? 'فارغ' : 'Empty');

                  return (
                    <div
                      key={entry.id || idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 hover:bg-indigo-50/20 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 font-mono font-bold rounded text-[10px]">
                            #{stepNum}
                          </span>
                          <span className="font-bold text-slate-800">
                            {entry.source === 'xlsx_import' 
                              ? (isAr ? 'استيراد من Excel' : 'Excel Import') 
                              : (isAr ? 'إدخال يدوي في التطبيق' : 'Manual In-App Edit')}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {entry.displayDate} • {entry.displayTime}
                        </span>
                      </div>

                      {/* Values Change Progression (RTL / LTR Adaptive) */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-400 line-through">{prevText}</span>
                          <span className="text-indigo-600 font-extrabold text-sm">{isAr ? '←' : '➔'}</span>
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {Number(entry.newCount).toLocaleString()} {entry.unit}
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-500 font-medium">
                          {isAr ? 'بواسطة:' : 'By:'} <b className="text-slate-800">{entry.user}</b>
                        </span>
                      </div>

                      {/* Large unit breakdown if available */}
                      {(entry.largeCount !== null && entry.largeCount !== undefined) && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          ({entry.largeCount} {entry.largeUnitName} + {entry.looseCount || 0} {entry.unit})
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowLineHistoryModal(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT STOCK & LOT LEVEL ADJUSTMENT MODAL */}
      {showDirectAdjModal && (() => {
        const {
          warehouseId,
          itemId,
          variantCode,
          lotMode,
          selectedLotNumber,
          newLotNumber,
          bookSmallQty,
          actualSmallQty,
          actualLargeQty,
          actualSmallRemainingQty,
          unitCost,
          supplierId,
          supplierName,
          affectSupplierBalance,
          supplierBatchNo,
          productionDate,
          expiryDate,
          reason,
        } = directAdjForm;

        const selectedItem = itemsMaster.find((i) => i.code === itemId || i.id === itemId);
        const variations = selectedItem?.variations || [];
        const selectedVariant = variations.find((v) => v.variantCode === variantCode) || {};
        const ratio = Number(selectedVariant.packagingRatio || selectedItem?.packagingRatio || 1);

        // Filter active lots for selected warehouse, item & variant
        const activeLotsForSelection = Object.values(liveStockMatrix.lotMap).filter((l) => {
          const matchWh = l.warehouseId === warehouseId || matchWarehouse(warehouseId, l.warehouseObj);
          const matchItem = l.itemId === itemId;
          const matchVar = l.variantCode === variantCode;
          return matchWh && matchItem && matchVar && l.availableQty > 0;
        });

        const actualNum = actualSmallQty === '' || actualSmallQty === null ? 0 : Number(actualSmallQty);
        const bookNum = lotMode === 'existing' ? Number(bookSmallQty || 0) : 0;
        const varianceDelta = actualNum - bookNum;
        const finalCost = Number(unitCost || selectedVariant.openingUnitCost || 0);
        const financialImpact = varianceDelta * finalCost;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[9999] overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <Sliders className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {isAr ? 'تسوية مخزنية مباشرة (Direct Stock Adjustment)' : 'Direct Inventory Adjustment'}
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      {isAr ? 'تسوية فورية على مستوى التنوع واللوط مع خيار التأثير المالي على المورد' : 'Adjust specific variant & lot with optional supplier balance impact'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDirectAdjModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveDirectAdjustment} className="space-y-3.5 text-xs">
                {/* 1. Target Warehouse, Item & Variation */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Warehouse */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">
                        {isAr ? 'المستودع المستهدف: *' : 'Target Warehouse: *'}
                      </label>
                      <select
                        value={warehouseId}
                        onChange={(e) => {
                          const wId = e.target.value;
                          setDirectAdjForm((prev) => ({
                            ...prev,
                            warehouseId: wId,
                            selectedLotNumber: '',
                            bookSmallQty: 0,
                            actualSmallQty: '',
                            actualLargeQty: '',
                            actualSmallRemainingQty: '',
                          }));
                        }}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 text-xs focus:ring-2 focus:ring-emerald-500"
                        required
                      >
                        {warehouses.map((wh) => (
                          <option key={wh.id || wh.code} value={wh.id || wh.code}>
                            [{wh.code}] {isAr ? wh.nameAr : (wh.nameEn || wh.nameAr)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Item Master */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">
                        {isAr ? 'الخامة / الصنف: *' : 'Raw Material: *'}
                      </label>
                      <SearchableSelect
                        value={itemId}
                        onChange={(code) => {
                          const item = itemsMaster.find((i) => i.code === code || i.id === code);
                          const vars = item?.variations || [];
                          const firstVar = vars[0];
                          const supId = firstVar?.supplierId || '';
                          const resolvedSupName = firstVar?.supplierName || suppliersList.find((s) => s.id === supId)?.name || '';

                          setDirectAdjForm((prev) => ({
                            ...prev,
                            itemId: code,
                            variantCode: firstVar?.variantCode || '',
                            selectedLotNumber: '',
                            bookSmallQty: 0,
                            actualSmallQty: '',
                            actualLargeQty: '',
                            actualSmallRemainingQty: '',
                            unitCost: firstVar?.openingUnitCost || '',
                            supplierId: supId,
                            supplierName: resolvedSupName,
                          }));
                        }}
                        options={itemsMaster.filter((i) => i.status !== 'inactive').map((item) => ({
                          value: item.code,
                          label: item.nameAr,
                          sublabel: item.code,
                        }))}
                        placeholder={isAr ? '-- اختر الخامة --' : '-- Select Item --'}
                        isAr={isAr}
                        required
                      />
                    </div>

                    {/* Variant */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">
                        {isAr ? 'تنوع الخامة والمواصفة: *' : 'Variation & Specs: *'}
                      </label>
                      <select
                        value={variantCode}
                        disabled={!itemId}
                        onChange={(e) => {
                          const vCode = e.target.value;
                          const vObj = variations.find((v) => v.variantCode === vCode);
                          const supId = vObj?.supplierId || prev.supplierId || '';
                          const resolvedSupName = vObj?.supplierName || suppliersList.find((s) => s.id === supId)?.name || prev.supplierName || '';

                          setDirectAdjForm((prev) => ({
                            ...prev,
                            variantCode: vCode,
                            selectedLotNumber: '',
                            bookSmallQty: 0,
                            actualSmallQty: '',
                            actualLargeQty: '',
                            actualSmallRemainingQty: '',
                            unitCost: vObj?.openingUnitCost || prev.unitCost,
                            supplierId: supId,
                            supplierName: resolvedSupName,
                          }));
                        }}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 text-xs focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                        required
                      >
                        <option value="">{isAr ? '-- اختر التنوع --' : '-- Select Variant --'}</option>
                        {variations.map((v) => (
                          <option key={v.variantCode} value={v.variantCode}>
                            [{v.variantCode}] {v.supplierName ? `${v.supplierName} • ` : ''}{v.mergedSpecs || ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Lot Mode Toggle (Existing Lot vs New Lot) */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Tag className="h-4 w-4 text-indigo-600" />
                      <span>{isAr ? '٢. تحديد رقم التشغيلة واللوط (LOT Target):' : '2. Target Lot Configuration:'}</span>
                    </span>

                    <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setDirectAdjForm((prev) => ({
                            ...prev,
                            lotMode: 'existing',
                            actualSmallQty: '',
                            actualLargeQty: '',
                            actualSmallRemainingQty: '',
                          }));
                        }}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          lotMode === 'existing' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {isAr ? 'لوط مسجل بالمستودع' : 'Existing Lot'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDirectAdjForm((prev) => ({
                            ...prev,
                            lotMode: 'new',
                            selectedLotNumber: '',
                            bookSmallQty: 0,
                            actualSmallQty: '',
                            actualLargeQty: '',
                            actualSmallRemainingQty: '',
                          }));
                        }}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          lotMode === 'new' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {isAr ? '+ إنشاء لوط جديد (فائض)' : '+ Create New Lot'}
                      </button>
                    </div>
                  </div>

                  {lotMode === 'existing' ? (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">
                        {isAr ? 'اختر اللوط المراد تعديل رصيده: *' : 'Select Lot to Adjust: *'}
                      </label>
                      <select
                        value={selectedLotNumber}
                        disabled={!variantCode}
                        onChange={(e) => {
                          const lotNo = e.target.value;
                          const targetLotObj = activeLotsForSelection.find((l) => l.lotNumber === lotNo);
                          const bookQty = targetLotObj ? targetLotObj.availableQty : 0;
                          const supId = targetLotObj?.supplierId || selectedVariant.supplierId || prev.supplierId || '';
                          const resolvedSupName = targetLotObj?.supplierName || selectedVariant.supplierName || suppliersList.find((s) => s.id === supId)?.name || prev.supplierName || '';

                          setDirectAdjForm((prev) => ({
                            ...prev,
                            selectedLotNumber: lotNo,
                            bookSmallQty: bookQty,
                            unitCost: targetLotObj?.unitPrice !== undefined ? targetLotObj.unitPrice : prev.unitCost,
                            supplierId: supId,
                            supplierName: resolvedSupName,
                            actualSmallQty: '',
                            actualLargeQty: '',
                            actualSmallRemainingQty: '',
                          }));
                        }}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                        required
                      >
                        <option value="">{variantCode ? (isAr ? '-- اختر رقم اللوط --' : '-- Select Lot --') : (isAr ? '-- حدد التنوع أولاً --' : '-- Select Variant First --')}</option>
                        {activeLotsForSelection.map((lot) => (
                          <option key={lot.lotNumber} value={lot.lotNumber}>
                            [{lot.lotNumber}] • {isAr ? 'الرصيد الدفتري:' : 'Book:'} {lot.availableQty.toLocaleString()} {lot.smallUnit} • {isAr ? 'السعر:' : 'Cost:'} {lot.unitPrice || 0} EGP {lot.supplierName ? `(${lot.supplierName})` : ''}
                          </option>
                        ))}
                      </select>

                      {selectedLotNumber && (
                        <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between text-[11px] mt-2 font-mono">
                          <span className="font-bold text-indigo-950">{isAr ? 'الرصيد الدفتري الحالي للوط:' : 'Current Book Balance:'}</span>
                          <span className="font-extrabold text-indigo-800 bg-white px-2 py-0.5 rounded border border-indigo-200">
                            {Number(bookSmallQty).toLocaleString()} {selectedVariant.smallUnit || selectedItem?.smallUnit || 'قطعة'}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* New Lot Creation Inputs */
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                            {isAr ? 'رقم اللوط الجديد (تلقائي أو مخصص): *' : 'New Lot # (Auto or Custom): *'}
                          </label>
                          <input
                            type="text"
                            required
                            value={newLotNumber}
                            onChange={(e) => setDirectAdjForm((prev) => ({ ...prev, newLotNumber: e.target.value }))}
                            className="w-full p-2 border border-emerald-300 rounded-xl bg-white font-mono font-bold text-emerald-950 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                            {isAr ? 'تكلفة شراء الوحدة (EGP) *: ' : 'Unit Cost (EGP) *: '}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            placeholder="0.00"
                            value={unitCost}
                            onChange={(e) => setDirectAdjForm((prev) => ({ ...prev, unitCost: e.target.value }))}
                            className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                            {isAr ? 'تشغيلة المورد (اختياري):' : 'Supplier Batch #:'}
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. LOT-SUP-01"
                            value={supplierBatchNo}
                            onChange={(e) => setDirectAdjForm((prev) => ({ ...prev, supplierBatchNo: e.target.value }))}
                            className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-mono text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                            {isAr ? 'تاريخ الإنتاج:' : 'Production Date:'}
                          </label>
                          <input
                            type="date"
                            value={productionDate}
                            onChange={(e) => setDirectAdjForm((prev) => ({ ...prev, productionDate: e.target.value }))}
                            className="w-full p-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                            {isAr ? 'تاريخ الصلاحية:' : 'Expiry Date:'}
                          </label>
                          <input
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setDirectAdjForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                            className="w-full p-1.5 border border-slate-300 rounded-lg bg-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Actual Count & Live Variance Calculation */}
                <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-2.5">
                  <span className="font-extrabold text-emerald-950 block">
                    {isAr ? '٣. الرصيد الفعلي بعد الجرد والتسوية:' : '3. Actual Reconciled Balance:'}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {isAr ? `الفعلي بالكرتونة (${selectedVariant.largeUnitName || selectedItem?.largeUnitName || 'كرتونة'}):` : `Large Units:`}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={actualLargeQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          const lQty = val === '' ? 0 : Number(val);
                          const rem = Number(actualSmallRemainingQty || 0);
                          const total = val === '' && !actualSmallRemainingQty ? '' : (lQty * ratio) + rem;
                          setDirectAdjForm((prev) => ({
                            ...prev,
                            actualLargeQty: val,
                            actualSmallQty: total,
                          }));
                        }}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {isAr ? `المتبقي فرط (${selectedVariant.smallUnit || selectedItem?.smallUnit || 'قطعة'}):` : `Loose Small:`}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={actualSmallRemainingQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          const lQty = Number(actualLargeQty || 0);
                          const rem = val === '' ? 0 : Number(val);
                          const total = !actualLargeQty && val === '' ? '' : (lQty * ratio) + rem;
                          setDirectAdjForm((prev) => ({
                            ...prev,
                            actualSmallRemainingQty: val,
                            actualSmallQty: total,
                          }));
                        }}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-emerald-950 mb-0.5">
                        {isAr ? `إجمالي الفعلي (${selectedVariant.smallUnit || selectedItem?.smallUnit || 'قطعة'}): *` : `Total Found: *`}
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        placeholder="0"
                        value={actualSmallQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          const sNum = val === '' ? '' : Number(val);
                          setDirectAdjForm((prev) => ({
                            ...prev,
                            actualSmallQty: val,
                            actualLargeQty: sNum !== '' && ratio > 1 ? Number((sNum / ratio).toFixed(2)) : '',
                            actualSmallRemainingQty: '',
                          }));
                        }}
                        className="w-full p-2 border-2 border-emerald-400 rounded-xl bg-white font-mono font-extrabold text-center text-sm text-emerald-900"
                      />
                    </div>
                  </div>

                  {/* Variance Delta Summary */}
                  {actualSmallQty !== '' && (
                    <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono font-bold ${
                      varianceDelta > 0
                        ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                        : varianceDelta < 0
                        ? 'bg-rose-100 text-rose-950 border-rose-300'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      <span>
                        {isAr ? 'فارق التسوية (الفعلي - الدفتري):' : 'Reconciliation Variance:'}{' '}
                        <b className="text-sm">{varianceDelta > 0 ? `+${varianceDelta.toLocaleString()}` : varianceDelta.toLocaleString()} {selectedVariant.smallUnit || selectedItem?.smallUnit || 'قطعة'}</b>
                      </span>
                      {canViewPrices && (
                        <span>
                          {isAr ? 'الأثر المالي:' : 'Impact:'} {financialImpact.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. Supplier Financial Impact Toggle (Default: False) */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900 select-none">
                      <input
                        type="checkbox"
                        checked={affectSupplierBalance}
                        onChange={(e) => setDirectAdjForm((prev) => ({ ...prev, affectSupplierBalance: e.target.checked }))}
                        className="h-4 w-4 rounded accent-indigo-600"
                      />
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4 text-indigo-600" />
                        <span>{isAr ? 'التأثير المالي على مديونية وحساب المورد (Affect Supplier Due Balance)' : 'Post Financial Effect to Supplier Balance'}</span>
                      </span>
                    </label>

                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-white text-slate-700">
                      {affectSupplierBalance ? (isAr ? '⚠️ مفعل (يؤثر على الحساب)' : 'Enabled') : (isAr ? 'غير مفعل (تسوية داخلية)' : 'No Effect (Default)')}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-relaxed ps-6">
                    {isAr
                      ? '💡 القيمة الافتراضية غير مفعلة (تسوية مخزنية داخلية بحتة دون المساس بحساب المورد). قم بالتفعيل فقط إذا كان الفارق سيتم قيده أو خصمه من كشف حساب المورد المعتمد.'
                      : 'Default: Pure inventory adjustment without altering vendor balance. Enable only if variance affects accounts payable.'}
                  </p>

                  {affectSupplierBalance && (() => {
                    const activeSupplierId = supplierId || selectedVariant.supplierId || '';
                    const activeSupplierName = supplierName || selectedVariant.supplierName || suppliersList.find((s) => s.id === activeSupplierId)?.name || (isAr ? 'مورد غير مسجل' : 'Unknown');

                    return (
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        {/* Auto-Detected Linked Supplier Badge */}
                        <div className="p-2.5 bg-white border border-indigo-200 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">
                                {isAr ? 'المورد المرتبط تلقائياً بالتنوع / اللوط المحدد:' : 'Auto-Detected Linked Supplier:'}
                              </span>
                              <span className="font-bold text-slate-900 text-xs">
                                {activeSupplierName} {activeSupplierId ? `(${activeSupplierId})` : ''}
                              </span>
                            </div>
                          </div>
                          {activeSupplierId && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md">
                              ✓ {isAr ? 'تم الربط التلقائي' : 'Linked'}
                            </span>
                          )}
                        </div>

                        {/* Dropdown Selector */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            {isAr ? 'أو اختر مورد آخر للتأثير على حسابه (تجاوز):' : 'Or select different supplier (Override):'}
                          </label>
                          <select
                            value={activeSupplierId}
                            onChange={(e) => {
                              const sId = e.target.value;
                              const sObj = suppliersList.find((s) => s.id === sId);
                              setDirectAdjForm((prev) => ({ ...prev, supplierId: sId, supplierName: sObj?.name || '' }));
                            }}
                            className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">{isAr ? '-- اختر المورد المعتمد --' : '-- Select Supplier --'}</option>
                            {suppliersList.map((sup) => (
                              <option key={sup.id} value={sup.id}>
                                {sup.name} ({sup.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 5. Justification / Reason */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">
                    {isAr ? 'سبب ومبرر التسوية المخزنية (إلزامي): *' : 'Adjustment Reason & Justification: *'}
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder={isAr ? 'مثال: تسوية رصيد بعد جرد موضعي، عجز ناتج عن كسر، فائض بونص غير مسجل...' : 'e.g. Local audit finding, breakage write-off...'}
                    value={reason}
                    onChange={(e) => setDirectAdjForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-white text-xs"
                  />
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDirectAdjModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingDirectAdj}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isAr ? 'تأكيد وتنفيذ التسوية الفورية' : 'Confirm & Post Adjustment'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}