import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot
} from 'firebase/firestore';
import {
  Boxes,
  Layers,
  Warehouse,
  Factory,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Tag,
  Calendar,
  User,
  History,
  Eye,
  ArrowDownLeft,
  ArrowRight,
  ArrowLeftRight,
  ArrowUpRight,
  RotateCcw,
  Printer,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Check,
  ShieldCheck,
  Building2,
  Package,
  FileText,
  Wrench,
  Cog,
  Sparkles
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import { buildLiveStockMatrix } from '../utils/stockResolver';
import { matchWarehouse, getWarehouseDisplayName } from '../utils/warehouseClassifier';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

const CATEGORIES = [
  { id: 1, base: 100, nameAr: '١- عبوات بلاستيكية', nameEn: '1- Primary Containers (Plastic)' },
  { id: 2, base: 200, nameAr: '٢- أغطية للعبوات البلاستيكية', nameEn: '2- Container Closures & Caps' },
  { id: 3, base: 300, nameAr: '٣- خامات أساسية (خل، طحينة...)', nameEn: '3- Raw Food Ingredients' },
  { id: 4, base: 400, nameAr: '٤- استيكر ومستلزمات تغليف', nameEn: '4- Labels & Branding' },
  { id: 5, base: 500, nameAr: '٥- كرتون', nameEn: '5- Outer Cartons & Boxes' },
  { id: 6, base: 600, nameAr: '٦- مواد تغليف خارجية', nameEn: '6- Secondary Bundling & Films' },
  { id: 7, base: 700, nameAr: '٧- مستهلكات النقل والتخزين', nameEn: '7- Logistics & Palletizing' },
  { id: 8, base: 800, nameAr: '٨- مستلزمات تشغيل (حبر، فلاتر)', nameEn: '8- Line Consumables' },
  { id: 9, base: 900, nameAr: '٩- قطع غيار واسطمبات', nameEn: '9- Spare Parts & Fixed Assets' },
];

const DEFAULT_CATEGORIES = [
  { id: 1, base: 100, nameAr: '١- عبوات بلاستيكية', nameEn: '1- Primary Containers (Plastic)' },
  { id: 2, base: 200, nameAr: '٢- أغطية للعبوات البلاستيكية', nameEn: '2- Container Closures & Caps' },
  { id: 3, base: 300, nameAr: '٣- خامات أساسية (خل، طحينة...)', nameEn: '3- Raw Food Ingredients' },
  { id: 4, base: 400, nameAr: '٤- استيكر ومستلزمات تغليف', nameEn: '4- Labels & Branding' },
  { id: 5, base: 500, nameAr: '٥- كرتون', nameEn: '5- Outer Cartons & Boxes' },
  { id: 6, base: 600, nameAr: '٦- مواد تغليف خارجية', nameEn: '6- Secondary Bundling & Films' },
  { id: 7, base: 700, nameAr: '٧- مستهلكات النقل والتخزين', nameEn: '7- Logistics & Palletizing' },
  { id: 8, base: 800, nameAr: '٨- مستلزمات تشغيل (حبر، فلاتر)', nameEn: '8- Line Consumables' },
  { id: 9, base: 900, nameAr: '٩- قطع غيار واسطمبات', nameEn: '9- Spare Parts & Fixed Assets' },
];

export default function StockBalances({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('stock_balances'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('stock_balances'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#059669';
  const { r, g, b } = hexToRgb(tabColor);

  const canViewPrices = permissions ? permissions.sensitive?.canViewPrices !== false : true;
  const canViewTotals = permissions ? permissions.sensitive?.canViewTotals !== false : true;

  // Cloud State
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [sparePartsIssues, setSparePartsIssues] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);

  // View & Filter States
  const [viewMode, setViewMode] = useState('consolidated'); // 'consolidated' | 'warehouse' | 'lots'
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'

  // Kardex Modal State, Tabs & Multi-Dimensional Filters
  const [kardexTarget, setKardexTarget] = useState(null); // { itemId, variantCode, lotNumber, nameAr, nameEn, specs, smallUnit }
  const [kardexViewTab, setKardexViewTab] = useState('ledger'); // 'ledger' | 'preview'
  const [isKardexFilterOpen, setIsKardexFilterOpen] = useState(false); // Collapsed by default as requested
  const [kardexStartDate, setKardexStartDate] = useState('');
  const [kardexEndDate, setKardexEndDate] = useState('');
  const [kardexUserFilter, setKardexUserFilter] = useState('all');
  const [kardexWarehouseFilter, setKardexWarehouseFilter] = useState('all');
  const [kardexTypeFilter, setKardexTypeFilter] = useState('all');
  const [isPrintingKardex, setIsPrintingKardex] = useState(false);
  const [printFeedback, setPrintFeedback] = useState('');

  // Close Kardex modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && kardexTarget) {
        setKardexTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kardexTarget]);

  // Subscribe to Cloud Firestore
  useEffect(() => {
    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItemsMaster(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .filter((w) => w.isActive !== false);
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehouses(list);
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceipts(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });

    const unsubTransformations = onSnapshot(collection(db, 'production_transformations'), (snap) => {
      setTransformations(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubSpareParts = onSnapshot(collection(db, 'spare_parts_issues'), (snap) => {
      setSparePartsIssues(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ ...d.data(), id: Number(d.id) || d.data().id }));
        list.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
        setCategories(list);
      }
    });

    return () => {
      unsubItems();
      unsubWh();
      unsubGrns();
      unsubTransfers();
      unsubTransformations();
      unsubSpareParts();
      unsubUsers();
      unsubCategories();
    };
  }, []);

  // Warehouse Matcher Helper
  const matchWh = (val, target) => {
    if (!val || !target) return false;
    return val === target.id || val === target.code || val === target.nameAr || val === target.nameEn;
  };

  const getWarehouseObj = (identifier) => {
    return warehouses.find((w) => matchWh(identifier, w)) || { nameAr: identifier, code: identifier, color: '#0d6cba' };
  };

  const getWarehouseName = (identifier) => {
    if (!identifier) return '';
    const wh = warehouses.find((w) => matchWh(identifier, w));
    if (wh) {
      return isAr ? (wh.nameAr || wh.code || wh.id) : (wh.nameEn || wh.nameAr || wh.code || wh.id);
    }
    return identifier;
  };

  const getUserName = (userId) => {
    if (!userId) return '';
    const user = usersList.find((u) => u.id === userId);
    return isAr ? (user?.nameAr || userId) : (user?.name || user?.nameAr || userId);
  };

  // Helper: Extract variations from an item
  const getItemVariations = (item) => {
    if (!item || !Array.isArray(item.variations) || item.variations.length === 0) {
      return [
        {
          resolvedCode: item.code,
          resolvedSpecs: '',
          packagingRatio: Number(item.packagingRatio || 1),
        },
      ];
    }

    return item.variations.map((v) => {
      const vCode = v.variantCode || v.code || (v.suffix ? `${item.code}-${v.suffix}` : item.code);
      let vSpecs = v.mergedSpecs || '';
      if (!vSpecs && Array.isArray(v.specs)) {
        vSpecs = v.specs.map((s) => (typeof s === 'object' ? `${s.label}: ${s.value}` : s)).join(' | ');
      }
      if (!vSpecs && (v.color || v.dimensions)) {
        vSpecs = [v.color, v.dimensions].filter(Boolean).join(' ');
      }

      return {
        ...v,
        resolvedCode: vCode,
        resolvedSpecs: vSpecs,
        packagingRatio: Number(v.packagingRatio || item.packagingRatio || 1),
      };
    });
  };

  // Centralized Stock Matrix Engine (Single Source of Truth)
  const { activeLotsList, variantBalancesMap, warehouseStockSummary, kpiSummary } = useMemo(() => {
    return buildLiveStockMatrix({
      itemsMaster,
      warehouses,
      goodsReceipts,
      transfers,
      transformations,
      sparePartsIssues,
    });
  }, [itemsMaster, warehouses, goodsReceipts, transfers, transformations, sparePartsIssues]);

  // Compute Chronological Kardex Lifecycle for Slide-Over Drawer (9-Stream Unified Ledger)
  const kardexLedger = useMemo(() => {
    if (!kardexTarget) return [];
    const { itemId, variantCode, lotNumber } = kardexTarget;
    const history = [];

    // Helper to extract timestamp (ms), date (YYYY-MM-DD), and time (HH:MM:SS)
    const resolveTimeInfo = (docObj, fallbackDate) => {
      let date = fallbackDate || '';
      let time = '';
      let timestamp = 0;

      if (docObj?.createdAt?.toDate) {
        const d = docObj.createdAt.toDate();
        timestamp = d.getTime();
        date = date || d.toISOString().split('T')[0];
        time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      } else if (docObj?.createdAt && typeof docObj.createdAt === 'string') {
        const d = new Date(docObj.createdAt);
        if (!isNaN(d.getTime())) {
          timestamp = d.getTime();
          date = date || d.toISOString().split('T')[0];
          time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        }
      } else if (docObj?.timestamp) {
        const d = new Date(docObj.timestamp);
        if (!isNaN(d.getTime())) {
          timestamp = d.getTime();
          date = date || d.toISOString().split('T')[0];
          time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        }
      }

      if (!time && docObj?.id) {
        const matchMs = docObj.id.match(/(\d{13})/);
        if (matchMs) {
          const d = new Date(Number(matchMs[1]));
          if (!isNaN(d.getTime())) {
            timestamp = timestamp || d.getTime();
            date = date || d.toISOString().split('T')[0];
            time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
          }
        }
      }

      return { date, time, timestamp };
    };

    // =========================================================================
    // 1. STREAM: OPENING BALANCES (OB)
    // =========================================================================
    itemsMaster.forEach((item) => {
      if (item.isStocklessUtility) return;
      if (item.code !== itemId && item.id !== itemId) return;

      (item.variations || []).forEach((v) => {
        const vCode = v.variantCode || `${item.code}-${v.suffix}`;
        if (variantCode && vCode !== variantCode) return;

        const openQty = Number(v.openingQtySmall || 0);
        if (openQty <= 0 || !v.openingWarehouse) return;

        const obLot = `OB-${item.code}-${v.suffix}-01`;
        if (lotNumber && obLot !== lotNumber) return;

        history.push({
          date: v.openingProdDate || item.createdAt?.split?.('T')?.[0] || '2026-01-01',
          time: '00:00:00',
          timestamp: 1,
          type: 'OB',
          typeLabel: isAr ? 'رصيد افتتاحي أولي (OB)' : 'Opening Balance (OB)',
          badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
          docId: `OB-${item.code}-${v.suffix}`,
          lotNumber: obLot,
          warehouse: getWarehouseName(v.openingWarehouse),
          qtyIn: openQty,
          qtyOut: 0,
          unitPrice: Number(v.openingUnitCost) || 0,
          currency: 'EGP',
          actor: v.supplierName || (isAr ? 'الإدارة العامة' : 'Initial Seeding'),
        });
      });
    });

    // =========================================================================
    // 2. STREAMS: VENDOR PURCHASES (GRN), RETURNS (RTN), & RECONCILIATIONS (ADJ)
    // =========================================================================
    goodsReceipts.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      if (grn.docType === 'opening_balance' || grn.id?.startsWith('OB-')) return;

      const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');
      const isReconciliation = grn.docType === 'inventory_reconciliation' || grn.id?.startsWith('ADJ');
      const timeInfo = resolveTimeInfo(grn, grn.receiptDate);

      (grn.lines || []).forEach((line, lIdx) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const itemLot =
          line.lotNumber ||
          (line.linkedGrnId
            ? `${line.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}`
            : `${grn.id}-${String(lIdx + 1).padStart(2, '0')}`);

        const itemMatches = pId === itemId || line.code === itemId || line.itemId === itemId;
        const varMatches = !variantCode || vCode === variantCode;
        const lotMatches = !lotNumber || itemLot === lotNumber;

        if (itemMatches && varMatches && lotMatches) {
          const rawQty = Number(line.receivedSmallUnits || 0);
          const isSurplus = rawQty >= 0;
          const qtyAbs = Math.abs(rawQty);

          let tag = 'GRN';
          let label = isAr ? 'توريد واستلام (GRN)' : 'Vendor Receipt (GRN)';
          let badge = 'bg-emerald-50 text-emerald-800 border-emerald-200';

          if (isReconciliation) {
            tag = 'ADJ';
            label = isAr ? 'تسوية جرد فعلي (ADJ)' : 'Stock Count Adj (ADJ)';
            badge = 'bg-purple-50 text-purple-800 border-purple-200';
          } else if (isReturn) {
            tag = 'RTN';
            label = isAr ? 'مرتجع مورد (RTN)' : 'Supplier Return (RTN)';
            badge = 'bg-rose-50 text-rose-800 border-rose-200';
          }

          history.push({
            date: timeInfo.date,
            time: timeInfo.time,
            timestamp: timeInfo.timestamp,
            type: tag,
            typeLabel: label,
            badgeClass: badge,
            docId: grn.id,
            lotNumber: itemLot,
            warehouse: getWarehouseName(line.targetWarehouse),
            qtyIn: isReconciliation ? (isSurplus ? qtyAbs : 0) : (isReturn ? 0 : qtyAbs),
            qtyOut: isReconciliation ? (!isSurplus ? qtyAbs : 0) : (isReturn ? qtyAbs : 0),
            unitPrice: line.unitPrice || 0,
            currency: line.currency || 'EGP',
            actor: isReconciliation
              ? (line.placedBy || grn.placedBy || grn.countedBy || grn.receivedBy || 'Auditor')
              : (grn.supplierName || grn.receivedBy || 'Storekeeper'),
            isReconciliation,
            oldBookBalance: line.oldBookBalance !== undefined ? line.oldBookBalance : (grn.oldBalance !== undefined ? grn.oldBalance : null),
            actualFoundQty: line.actualFoundQty !== undefined ? line.actualFoundQty : (grn.actualBalance !== undefined ? grn.actualBalance : null),
            variance: line.variance !== undefined ? line.variance : rawQty,
          });
        }
      });
    });

    // =========================================================================
    // 3. STREAMS: INTERNAL TRANSFERS (TRN) & PIPELINE LIQUID TRANSFERS (PIPE)
    // =========================================================================
    transfers.forEach((trn) => {
      if (trn.status !== 'completed') return;
      const timeInfo = resolveTimeInfo(trn, trn.transferDate);
      const isPipe = trn.isPipelineTransfer || trn.id?.startsWith('TRN-PIPE-');

      (trn.lines || []).forEach((line) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const itemLot = line.lotNumber;

        const itemMatches = pId === itemId || line.code === itemId || line.itemId === itemId;
        const varMatches = !variantCode || vCode === variantCode;
        const lotMatches = !lotNumber || itemLot === lotNumber;

        if (itemMatches && varMatches && lotMatches) {
          const qty = Number(line.qtySmallUnits || 0);

          history.push({
            date: timeInfo.date,
            time: timeInfo.time,
            timestamp: timeInfo.timestamp,
            type: isPipe ? 'PIPE' : 'TRN',
            typeLabel: isPipe
              ? (isAr ? 'ضخ ورفع عبر الأنابيب (PIPE)' : 'Pipeline Liquid (PIPE)')
              : (isAr ? 'تحويل مخزني داخلي (TRN)' : 'Internal Transfer (TRN)'),
            badgeClass: isPipe
              ? 'bg-sky-50 text-sky-800 border-sky-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200',
            docId: trn.id,
            lotNumber: itemLot,
            warehouse: `${getWarehouseName(trn.sourceWarehouse)} ${isAr ? '←' : '➔'} ${getWarehouseName(trn.targetWarehouse)}`,
            qtyIn: 0,
            qtyOut: 0,
            isTransfer: true,
            transferQty: qty,
            unitPrice: line.unitPrice || 0,
            currency: line.currency || 'EGP',
            actor: trn.issuedBy || 'Handler',
          });
        }
      });
    });

    // =========================================================================
    // 4. STREAMS: BULK INTERMEDIATE (PRD-INT) & WO PACKAGING ISSUES (ISS)
    // =========================================================================
    transformations.forEach((trans) => {
      if (trans.status === 'cancelled' || trans.status === 'rejected') return;
      const timeInfo = resolveTimeInfo(trans, trans.date);
      const isWorkOrder = Boolean(trans.workOrderId || trans.id?.startsWith('TRANS-WO-'));

      // 4A. M-Item Produced
      const mMatches = trans.itemCode === itemId;
      const mVarMatches = !variantCode || trans.variantCode === variantCode;
      const mLotMatches = !lotNumber || trans.lotNumber === lotNumber;

      if (mMatches && mVarMatches && mLotMatches && Number(trans.producedQty) > 0 && !isWorkOrder) {
        history.push({
          date: timeInfo.date,
          time: timeInfo.time,
          timestamp: timeInfo.timestamp,
          type: 'PRD-INT',
          typeLabel: isAr ? 'إنتاج خامة وسيطة بالتانك (PRD-INT)' : 'Intermediate Tank Prep (PRD-INT)',
          badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
          docId: trans.id,
          lotNumber: trans.lotNumber,
          warehouse: getWarehouseName(trans.warehouseId),
          qtyIn: Number(trans.producedQty),
          qtyOut: 0,
          unitPrice: 0,
          currency: 'EGP',
          actor: trans.registeredBy || 'Operator',
        });
      }

      // 4B. Consumed Components (Tank mixing R-deductions OR Work Order ISS)
      (trans.consumedComponents || []).forEach((c) => {
        const cItemId = c.itemId || (c.code ? c.code.split('-')[0] : '');
        const cVariantCode = c.variantCode || c.code || cItemId;

        const rMatches = cItemId === itemId || c.itemId === itemId || c.code === itemId;
        const rVarMatches = !variantCode || cVariantCode === variantCode || c.itemId === itemId || variantCode.startsWith(`${cItemId}-`);

        if (rMatches && rVarMatches && Number(c.qtySmallUnits) > 0) {
          history.push({
            date: timeInfo.date,
            time: timeInfo.time,
            timestamp: timeInfo.timestamp,
            type: isWorkOrder ? 'ISS' : 'PRD-INT',
            typeLabel: isWorkOrder
              ? (isAr ? `صرف خامات تشغيل (${trans.orderNumber || 'MO'})` : `WO Packaging Issue (${trans.orderNumber || 'MO'})`)
              : (isAr ? 'استهلاك خامات تحضير تانك (BOM)' : 'Tank Component Consumption (BOM)'),
            badgeClass: isWorkOrder
              ? 'bg-amber-50 text-amber-900 border-amber-300'
              : 'bg-blue-50 text-blue-900 border-blue-200',
            docId: trans.orderNumber || trans.id,
            lotNumber: c.lotNumber || trans.lotNumber,
            warehouse: getWarehouseName(trans.warehouseId),
            qtyIn: 0,
            qtyOut: Number(c.qtySmallUnits),
            unitPrice: 0,
            currency: 'EGP',
            actor: trans.registeredBy || 'Operator',
          });
        }
      });
    });

    // =========================================================================
    // 5. STREAM: SPARE PARTS & CONSUMABLES CONSUMPTION (XISS)
    // =========================================================================
    sparePartsIssues.forEach((xiss) => {
      if (xiss.status === 'cancelled') return;
      const timeInfo = resolveTimeInfo(xiss, xiss.issueDate);

      (xiss.lines || xiss.items || []).forEach((line) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;

        const itemMatches = pId === itemId || line.code === itemId || line.itemId === itemId;
        const varMatches = !variantCode || vCode === variantCode;

        if (itemMatches && varMatches) {
          const qty = Number(line.quantity || line.qty || line.qtySmallUnits || 0);

          history.push({
            date: timeInfo.date,
            time: timeInfo.time,
            timestamp: timeInfo.timestamp,
            type: 'XISS',
            typeLabel: isAr ? 'صرف قطع غيار ومستهلكات (XISS)' : 'Spare Parts Issue (XISS)',
            badgeClass: 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-300',
            docId: xiss.id,
            lotNumber: line.lotNumber || 'X-CONSUME',
            warehouse: getWarehouseName(line.warehouseId || xiss.warehouseId),
            qtyIn: 0,
            qtyOut: qty,
            unitPrice: line.unitPrice || 0,
            currency: 'EGP',
            actor: xiss.technicianName || xiss.issuedBy || 'Maintenance Tech',
          });
        }
      });
    });

    // Sort chronologically ascending by Date and Timestamp
    history.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.timestamp - b.timestamp);

    // Compute continuous running balance across the unified ledger
    let running = 0;
    return history.map((h) => {
      if (h.type === 'OB' || h.type === 'GRN' || h.type === 'PRD-INT') running += h.qtyIn;
      if (h.type === 'RTN' || h.type === 'ISS' || h.type === 'XISS') running -= h.qtyOut;
      if (h.type === 'PRD-INT' && h.qtyOut > 0) running -= h.qtyOut;
      if (h.type === 'ADJ') running += (h.qtyIn - h.qtyOut);

      return {
        ...h,
        runningBalance: running,
      };
    });
  }, [kardexTarget, itemsMaster, goodsReceipts, transfers, transformations, sparePartsIssues, isAr]);

  // Date Presets Handler for Kardex
  const handleKardexPreset = (preset) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (preset === 'all') {
      setKardexStartDate('');
      setKardexEndDate('');
    } else if (preset === '30days') {
      const past = new Date();
      past.setDate(now.getDate() - 30);
      setKardexStartDate(past.toISOString().split('T')[0]);
      setKardexEndDate(todayStr);
    } else if (preset === 'this_month') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setKardexStartDate(`${y}-${m}-01`);
      setKardexEndDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'this_year') {
      const y = now.getFullYear();
      setKardexStartDate(`${y}-01-01`);
      setKardexEndDate(`${y}-12-31`);
    }
  };

  // Reset all active Kardex filters
  const handleResetKardexFilters = () => {
    setKardexStartDate('');
    setKardexEndDate('');
    setKardexUserFilter('all');
    setKardexWarehouseFilter('all');
    setKardexTypeFilter('all');
  };

  // Human-readable labels for transaction types
  const getTransactionTypeLabel = (type) => {
    const mapAr = {
      'GRN': 'استلام وتوريد (GRN)',
      'RTN': 'مرتجع بضاعة (RTN)',
      'TRN': 'تحويل مخزني داخلي (TRN)',
      'PIPE': 'ضخ وتداول سوائل (PIPE)',
      'PRD-INT': 'إنتاج وسيط بالتانك (PRD-INT)',
      'ISS': 'صرف خامات تشغيل (ISS)',
      'XISS': 'صرف قطع غيار ومستهلكات (XISS)',
      'ADJ': 'تسوية جردية وفروقات (ADJ)',
      'OB': 'رصيد افتتاحي أولي (OB)',
    };
    const mapEn = {
      'GRN': 'Goods Receipt (GRN)',
      'RTN': 'Goods Return (RTN)',
      'TRN': 'Internal Transfer (TRN)',
      'PIPE': 'Pipeline Liquid (PIPE)',
      'PRD-INT': 'Tank Intermediate (PRD-INT)',
      'ISS': 'Work Order Packaging (ISS)',
      'XISS': 'Spare Parts Issue (XISS)',
      'ADJ': 'Reconciliation Adjustment (ADJ)',
      'OB': 'Opening Balance (OB)',
    };
    return (isAr ? mapAr[type] : mapEn[type]) || type;
  };

  // Extract unique filtering dimensions from active Kardex ledger
  const kardexFilterOptions = useMemo(() => {
    if (!kardexLedger || kardexLedger.length === 0) {
      return { warehouses: [], actors: [], types: [] };
    }
    const whSet = new Set();
    const actorSet = new Set();
    const typeSet = new Set();

    kardexLedger.forEach((m) => {
      if (m.warehouse) whSet.add(m.warehouse);
      if (m.actor) actorSet.add(m.actor);
      if (m.type) typeSet.add(m.type);
    });

    return {
      warehouses: Array.from(whSet).sort((a, b) => a.localeCompare(b)),
      actors: Array.from(actorSet).sort((a, b) => a.localeCompare(b)),
      types: Array.from(typeSet).sort((a, b) => a.localeCompare(b)),
    };
  }, [kardexLedger]);

  // Robust Kardex Print Handler (Direct Browser Print + Iframe Fallback for Sandbox Previews)
  const handlePrintKardex = () => {
    if (!kardexTarget) return;
    setIsPrintingKardex(true);
    setPrintFeedback(isAr ? 'جاري تجهيز كارت الحركة وأمر الطباعة...' : 'Preparing printable slip...');

    const prevTitle = document.title;
    const itemName = kardexTarget.nameAr || kardexTarget.variantCode || 'Kardex';
    document.title = `${isAr ? 'كارت-حركة' : 'Kardex'}-${kardexTarget.variantCode || kardexTarget.itemId}-${itemName}`;

    // 1. Direct browser window.print()
    let printOpened = false;
    try {
      printOpened = true;
      window.print();
    } catch (e) {
      console.warn('Direct window.print() failed:', e);
      printOpened = false;
    }

    // 2. Invisible iframe print fallback: executes cleanly if parent iframe suppresses direct window.print
    try {
      const slipEl = document.getElementById('printable-kardex-slip');
      if (slipEl) {
        const pIframe = document.createElement('iframe');
        pIframe.style.position = 'fixed';
        pIframe.style.right = '0';
        pIframe.style.bottom = '0';
        pIframe.style.width = '0';
        pIframe.style.height = '0';
        pIframe.style.border = '0';
        pIframe.setAttribute('title', 'Kardex Print Frame');
        document.body.appendChild(pIframe);

        const pDoc = pIframe.contentWindow.document;
        pDoc.open();
        pDoc.write(`
          <!DOCTYPE html>
          <html dir="${isAr ? 'rtl' : 'ltr'}">
          <head>
            <title>${document.title}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 15px; margin: 0; background: white; color: #0f172a; font-size: 11px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th, td { border: 1px solid #cbd5e1; padding: 5px 7px; font-size: 10px; }
              th { background-color: #f1f5f9; font-weight: bold; }
              @page { size: A4 portrait; margin: 8mm; }
            </style>
          </head>
          <body>
            ${slipEl.innerHTML}
          </body>
          </html>
        `);
        pDoc.close();

        setTimeout(() => {
          try {
            pIframe.contentWindow.focus();
            pIframe.contentWindow.print();
          } catch (err) {
            console.warn('Iframe print warning:', err);
          } finally {
            setTimeout(() => {
              if (document.body.contains(pIframe)) {
                document.body.removeChild(pIframe);
              }
            }, 2500);
          }
        }, 250);
      }
    } catch (err) {
      console.warn('Fallback iframe print failed:', err);
    }

    setTimeout(() => {
      document.title = prevTitle;
      setIsPrintingKardex(false);
      setPrintFeedback('');
    }, 1800);
  };

  // Filtered Kardex Lifecycle with Opening/Closing Balances for Period & Multi-Filters
  const {
    filteredKardexLedger,
    periodOpeningBalance,
    hasPriorOpening,
    periodTotalIn,
    periodTotalOut,
    periodClosingBalance,
    hasActiveDateFilter,
    activeFilterCount,
  } = useMemo(() => {
    if (!kardexLedger || kardexLedger.length === 0) {
      return {
        filteredKardexLedger: [],
        periodOpeningBalance: 0,
        hasPriorOpening: false,
        periodTotalIn: 0,
        periodTotalOut: 0,
        periodClosingBalance: 0,
        hasActiveDateFilter: false,
        activeFilterCount: 0,
      };
    }

    const hasStart = Boolean(kardexStartDate);
    const hasEnd = Boolean(kardexEndDate);
    const hasDateFilter = hasStart || hasEnd;

    // Determine Opening Balance for the period (running balance of the last movement BEFORE start date)
    let priorBalance = 0;
    let priorFound = false;

    if (hasStart) {
      const priorMovements = kardexLedger.filter((m) => (m.date || '') < kardexStartDate);
      if (priorMovements.length > 0) {
        priorBalance = priorMovements[priorMovements.length - 1].runningBalance;
        priorFound = true;
      }
    }

    // Filter in-range movements matching date, user, warehouse, and type
    const inRange = kardexLedger.filter((m) => {
      const d = m.date || '';
      if (hasStart && d < kardexStartDate) return false;
      if (hasEnd && d > kardexEndDate) return false;
      if (kardexUserFilter !== 'all' && m.actor !== kardexUserFilter) return false;
      if (kardexWarehouseFilter !== 'all' && m.warehouse !== kardexWarehouseFilter) return false;
      if (kardexTypeFilter !== 'all' && m.type !== kardexTypeFilter) return false;
      return true;
    });

    let totIn = 0;
    let totOut = 0;
    inRange.forEach((m) => {
      totIn += Number(m.qtyIn || 0);
      totOut += Number(m.qtyOut || 0);
    });

    const closing = inRange.length > 0
      ? inRange[inRange.length - 1].runningBalance
      : (hasStart ? priorBalance : (kardexLedger.length > 0 ? kardexLedger[kardexLedger.length - 1].runningBalance : 0));

    const totalFilterCount =
      (kardexStartDate ? 1 : 0) +
      (kardexEndDate ? 1 : 0) +
      (kardexUserFilter !== 'all' ? 1 : 0) +
      (kardexWarehouseFilter !== 'all' ? 1 : 0) +
      (kardexTypeFilter !== 'all' ? 1 : 0);

    return {
      filteredKardexLedger: inRange,
      periodOpeningBalance: priorBalance,
      hasPriorOpening: priorFound,
      periodTotalIn: totIn,
      periodTotalOut: totOut,
      periodClosingBalance: closing,
      hasActiveDateFilter: hasDateFilter,
      activeFilterCount: totalFilterCount,
    };
  }, [kardexLedger, kardexStartDate, kardexEndDate, kardexUserFilter, kardexWarehouseFilter, kardexTypeFilter]);

  // Filtered Consolidated Master List
  const filteredConsolidatedItems = useMemo(() => {
    return itemsMaster.filter((item) => {
      const matchesSearch =
        item.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.nameAr?.includes(searchQuery) ||
        item.nameEn?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        categoryFilter === 'all' ||
        String(item.categoryId) === String(categoryFilter);

      // Check stock status
      const variations = getItemVariations(item);
      const totalItemQty = variations.reduce((sum, v) => {
        const varKey = `${item.code}_${v.resolvedCode}`;
        return sum + (variantBalancesMap[varKey]?.totalQty || 0);
      }, 0);

      const minStock = Number(item.minStockLevel || item.safetyStock || 0);
      let matchesStatus = true;
      if (stockStatusFilter === 'in_stock') matchesStatus = totalItemQty > 0;
      if (stockStatusFilter === 'out_of_stock') matchesStatus = totalItemQty === 0;
      if (stockStatusFilter === 'low_stock') matchesStatus = minStock > 0 && totalItemQty <= minStock;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [itemsMaster, searchQuery, categoryFilter, stockStatusFilter, variantBalancesMap]);

  // Filtered Active Lots for Mode C (Search, Warehouse, and Category filters applied)
  const filteredLotsList = useMemo(() => {
    return activeLotsList.filter((lot) => {
      const matchesSearch =
        lot.lotNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lot.nameAr?.includes(searchQuery) ||
        lot.variantCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lot.supplierName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lot.supplierBatchNo?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesWh = selectedWarehouseFilter === 'all' || matchWh(selectedWarehouseFilter, lot.warehouseObj);

      const itemObj = itemsMaster.find((i) => i.code === lot.itemId || i.id === lot.itemId);
      const matchesCat =
        categoryFilter === 'all' ||
        String(itemObj?.categoryId) === String(categoryFilter);

      return matchesSearch && matchesWh && matchesCat;
    });
  }, [activeLotsList, itemsMaster, searchQuery, selectedWarehouseFilter, categoryFilter]);

  return (
    <div className="space-y-5 select-none">
      {/* Scoped Print CSS Styles for Kardex Slip */}
      <style>{`
        @media screen {
          .kardex-print-only {
            display: none !important;
          }
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-kardex-slip, #printable-kardex-slip * {
            visibility: visible !important;
          }
          #printable-kardex-slip {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px 20px !important;
            background: white !important;
            color: #0f172a !important;
            font-size: 11px !important;
            box-sizing: border-box !important;
            display: block !important;
            z-index: 999999 !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
        }
      `}</style>

      {/* Top Header & 3-Mode Tab Switcher */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
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
              {isAr ? (tabConfig?.labelAr || 'أرصدة ومصفوفة المخازن والتشغيلات (Stock Balances & Matrix)') : (tabConfig?.labelEn || 'Warehouse Stock Balances & FIFO Matrix')}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'متابعة حية لأرصدة الخامات، تقييم المخزون المالي، وتتبع اللوطات (FIFO)' : 'Live stock balances, FIFO financial valuation, and active lot tracking'}
            </span>
          </div>
        </div>

        {/* 3 Unified Viewing Modes Switcher */}
        <div className="flex items-center p-1 bg-slate-200/80 rounded-2xl text-xs font-extrabold self-start lg:self-auto">
          <button
            onClick={() => setViewMode('consolidated')}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'consolidated' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isAr ? 'عرض مجمع للأصناف' : 'Consolidated SKUs'}</span>
          </button>

          <button
            onClick={() => setViewMode('warehouse')}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'warehouse' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Warehouse className="h-3.5 w-3.5 text-indigo-600" />
            <span>{isAr ? 'مصفوفة حسب المستودع' : 'Warehouse Matrix'}</span>
          </button>

          <button
            onClick={() => setViewMode('lots')}
            className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'lots' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag className="h-3.5 w-3.5 text-purple-600" />
            <span>{isAr ? 'سجل اللوطات والتشغيلات' : 'Active Lots (FIFO)'}</span>
          </button>
        </div>
      </div>

      {/* Executive KPI Dashboard Bar */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${canViewTotals ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
        {/* KPI 1: Total Valuation (Only Rendered if User is Permitted) */}
        {canViewTotals && (
          <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
                {isAr ? 'إجمالي قيمة المخزون (تقييم FIFO):' : 'Total Inventory Valuation (FIFO):'}
              </span>
              <span className="text-lg font-mono font-extrabold text-emerald-700 block">
                {`${kpiSummary.totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`}
              </span>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        )}

        {/* KPI 2: Active SKUs */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
              {isAr ? 'الأصناف والتنوعات المتاحة:' : 'Active SKUs & Variants:'}
            </span>
            <span className="text-lg font-mono font-extrabold text-slate-900 block">
              {kpiSummary.activeSkusCount} {isAr ? 'تنوع متاح' : 'Active SKUs'}
            </span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
            <Boxes className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 3: Low Stock Alerts */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
              {isAr ? 'تنبيهات حد الطلب والأمان:' : 'Reorder Threshold Alerts:'}
            </span>
            <span className={`text-lg font-mono font-extrabold block ${kpiSummary.lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {kpiSummary.lowStockCount} {isAr ? 'أصناف بحاجة للشراء' : 'Low Stock'}
            </span>
          </div>
          <div className={`p-3 rounded-2xl border ${kpiSummary.lowStockCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 4: Active Inward Lots */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
              {isAr ? 'تشغيلات ولوطات المخزن النشطة:' : 'Active Inward Lots (FIFO):'}
            </span>
            <span className="text-lg font-mono font-extrabold text-purple-700 block">
              {kpiSummary.activeLotsCount} {isAr ? 'لوط نشط' : 'Active Lots'}
            </span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100">
            <Tag className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={isAr ? 'بحث بكود الخامة، الاسم، اللوط، أو المورد...' : 'Search item, code, lot, supplier...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <select
            value={selectedWarehouseFilter}
            onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? '📍 جميع المستودعات' : '📍 All Warehouses'}</option>
            {warehouses.map((w) => (
              <option key={w.id || w.code} value={w.id || w.code}>
                {w.code ? `${w.code} - ` : ''}{isAr ? w.nameAr : w.nameEn || w.nameAr}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? `📂 جميع تصنيفات الخامات (${categories.length} مجموعات)` : `📂 All ${categories.length} Categories`}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {isAr ? cat.nameAr : cat.nameEn || cat.nameAr} ({cat.base} Series)
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? '⚡ جميع حالات الرصيد' : '⚡ All Stock States'}</option>
            <option value="in_stock">{isAr ? '🟢 متوفر بالمخزن فقط' : 'In Stock Only'}</option>
            <option value="low_stock">{isAr ? '⚠️ واصل لحد الطلب (منخفض)' : 'Low Stock Alert'}</option>
            <option value="out_of_stock">{isAr ? '⚪ منتهي الرصيد (صفر)' : 'Out of Stock'}</option>
          </select>
        </div>
      </div>

      {/* VIEW MODE A: CONSOLIDATED ITEM GRID */}
      {viewMode === 'consolidated' && (
        <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[380px]">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 text-start">{isAr ? 'كود الصنف والخامة' : 'Item Code & Name'}</th>
                <th className="p-3 text-start">{isAr ? 'التنوعات والمواصفات' : 'Variants & Specs'}</th>
                <th className="p-3 text-start">{isAr ? 'توزيع الأرصدة بالمستودعات' : 'Multi-Warehouse Distribution'}</th>
                <th className="p-3 text-center">{isAr ? 'إجمالي الرصيد' : 'Total Company Stock'}</th>
                {canViewPrices && <th className="p-3 text-end">{isAr ? 'القيمة الإجمالية (FIFO)' : 'Valuation (EGP)'}</th>}
                <th className="p-3 text-center">{isAr ? 'سجل الحركة' : 'Kardex'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <PeacockLoader size="lg" text={isAr ? 'جاري تجميع أرصدة المستودعات...' : 'Consolidating Warehouse Balances...'} />
                  </td>
                </tr>
              ) : filteredConsolidatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    {isAr ? 'لا توجد خامات مطابقة لشروط البحث والفلاتر.' : 'No items match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredConsolidatedItems.map((item) => {
                  const variations = getItemVariations(item);

                  return (
                    <React.Fragment key={item.id || item.code}>
                      {variations.map((v, vIdx) => {
                        const varKey = `${item.code}_${v.resolvedCode}`;
                        const varData = variantBalancesMap[varKey] || { totalQty: 0, totalValue: 0, byWarehouse: {} };
                        const isFirstVar = vIdx === 0;

                        return (
                          <tr key={v.resolvedCode} className="hover:bg-slate-50/70 transition">
                            {/* Item Master Name & Code (Span across variants) */}
                            {isFirstVar && (
                              <td rowSpan={variations.length} className="p-3 align-top border-e border-slate-100 bg-slate-50/30">
                                <span className="font-mono font-extrabold text-slate-900 block text-xs">{item.code}</span>
                                <span className="font-bold text-slate-800 block mt-0.5">{item.nameAr}</span>
                                {item.nameEn && <span className="text-[10px] text-slate-400 block">{item.nameEn}</span>}
                                {item.minStockLevel && (
                                  <span className="text-[10px] text-slate-500 block mt-1">
                                    {isAr ? 'حد الأمان:' : 'Safety:'} {Number(item.minStockLevel).toLocaleString()} {item.smallUnit}
                                  </span>
                                )}
                              </td>
                            )}

                            {/* Variant Code & Specs */}
                            <td className="p-3 align-top">
                              <span className="font-mono font-extrabold text-indigo-700 block text-xs">{v.resolvedCode}</span>
                              {v.resolvedSpecs && <span className="text-[11px] text-slate-600 block mt-0.5">{v.resolvedSpecs}</span>}
                              {v.packagingRatio > 1 && (
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  {isAr ? `الشدة: ${v.packagingRatio} ${item.smallUnit} / ${item.largeUnitName}` : `Pack: ${v.packagingRatio}`}
                                </span>
                              )}
                            </td>

                            {/* Warehouse Distribution Badges */}
                            <td className="p-3 align-top">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {warehouses.map((wh) => {
                                  const whId = wh.id || wh.code;
                                  const qtyInWh = varData.byWarehouse[whId] || 0;
                                  if (qtyInWh === 0 && selectedWarehouseFilter !== 'all' && !matchWh(selectedWarehouseFilter, wh)) return null;

                                  return (
                                    <div
                                      key={whId}
                                      className={`px-2 py-1 rounded-xl border flex items-center gap-1.5 text-[11px] font-semibold ${
                                        qtyInWh > 0 ? 'bg-white shadow-2xs' : 'bg-slate-50 text-slate-300 border-slate-100 opacity-60'
                                      }`}
                                      style={{ borderColor: qtyInWh > 0 ? (wh.color || '#0d6cba') : undefined }}
                                    >
                                      <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: wh.color || '#0d6cba' }}
                                      />
                                      <span className="text-slate-500 font-mono text-[10px]">{wh.code || wh.nameAr}:</span>
                                      <span className="font-mono font-extrabold text-slate-900">
                                        {qtyInWh.toLocaleString()}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>

                            {/* Total Company Stock */}
                            <td className="p-3 align-top text-center">
                              <span className="font-mono font-extrabold text-slate-900 block text-sm">
                                {varData.totalQty.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                                {item.smallUnit || 'قطعة'}
                              </span>
                            </td>

                            {/* FIFO Valuation */}
                            {canViewPrices && (
                              <td className="p-3 align-top text-end font-mono">
                                <span className="font-extrabold text-emerald-800 block text-xs">
                                  {varData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-slate-400 block">EGP</span>
                              </td>
                            )}

                            {/* Kardex Trigger Button */}
                            <td className="p-3 align-top text-center">
                              <button
                                onClick={() =>
                                  setKardexTarget({
                                    itemId: item.code,
                                    variantCode: v.resolvedCode,
                                    nameAr: item.nameAr,
                                    nameEn: item.nameEn,
                                    specs: v.resolvedSpecs,
                                    smallUnit: item.smallUnit,
                                  })
                                }
                                className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1 mx-auto"
                                title={isAr ? 'عرض كارت حركة الصنف' : 'View Stock Card'}
                              >
                                <History className="h-3.5 w-3.5 text-indigo-600" />
                                <span>{isAr ? 'كارت الحركة' : 'Kardex'}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW MODE B: WAREHOUSE MATRIX */}
      {viewMode === 'warehouse' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {warehouses.map((wh) => {
              const whId = wh.id || wh.code;
              const summary = warehouseStockSummary[whId] || { totalQty: 0, totalValue: 0, activeSkus: new Set() };
              const isSelected = selectedWarehouseFilter === whId || (selectedWarehouseFilter === 'all' && wh.isDefault);

              return (
                <div
                  key={whId}
                  onClick={() => setSelectedWarehouseFilter(whId)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-2xs space-y-2 bg-white ${
                    selectedWarehouseFilter === whId ? 'ring-2 ring-indigo-500 shadow-md' : 'hover:border-slate-300'
                  }`}
                  style={{ borderColor: wh.color || '#0d6cba' }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl text-white" style={{ backgroundColor: wh.color || '#0d6cba' }}>
                        <Warehouse className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-xs">{wh.code ? `${wh.code} - ` : ''}{wh.nameAr}</h4>
                        {wh.responsibleUserId && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <User className="h-3 w-3 text-indigo-600" />
                            <span>{getUserName(wh.responsibleUserId)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'الكمية الكلية:' : 'Total Qty:'}</span>
                      <span className="font-mono font-extrabold text-slate-900">{summary.totalQty.toLocaleString()}</span>
                    </div>
                    {canViewPrices && (
                      <div className="text-end">
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'قيمة المخزن:' : 'Valuation:'}</span>
                        <span className="font-mono font-extrabold text-emerald-700">
                          {summary.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EGP
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Lots in Selected Warehouse */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
              <span className="font-extrabold text-slate-900 flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-indigo-600" />
                <span>
                  {isAr
                    ? `الأصناف واللوطات المحفوظة في: ${getWarehouseName(selectedWarehouseFilter)}`
                    : `Stock & Lots in: ${getWarehouseName(selectedWarehouseFilter)}`}
                </span>
              </span>
            </div>

            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2.5 text-start">{isAr ? 'رقم اللوط (FIFO)' : 'Lot Number'}</th>
                  <th className="p-2.5 text-start">{isAr ? 'الصنف والتنوع' : 'Item & Variant'}</th>
                  <th className="p-2.5 text-center">{isAr ? 'الرصيد المتاح' : 'Available Qty'}</th>
                  {canViewPrices && <th className="p-2.5 text-end">{isAr ? 'سعر الوحدة' : 'Unit Cost'}</th>}
                  {canViewPrices && <th className="p-2.5 text-end">{isAr ? 'إجمالي القيمة' : 'Total Value'}</th>}
                  <th className="p-2.5 text-start">{isAr ? 'المورد وتاريخ الورود' : 'Supplier & Inward Date'}</th>
                  <th className="p-2.5 text-center">{isAr ? 'سجل الحركة' : 'Kardex'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLotsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      {isAr ? 'لا توجد لوطات أو أرصدة موجبة في المستودع المحدد.' : 'No active lots found in this warehouse.'}
                    </td>
                  </tr>
                ) : (
                  filteredLotsList.map((lot) => (
                    <tr key={`${lot.lotNumber}_${lot.warehouseId}`} className="hover:bg-slate-50/70 transition">
                      <td className="p-2.5 font-mono font-extrabold text-indigo-700">{lot.lotNumber}</td>
                      <td className="p-2.5">
                        <span className="font-bold text-slate-900 block">{lot.nameAr}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{lot.variantCode} {lot.specs ? `(${lot.specs})` : ''}</span>
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                        {lot.availableQty.toLocaleString()} {lot.smallUnit}
                      </td>
                      {canViewPrices && (
                        <td className="p-2.5 text-end font-mono text-slate-700">
                          {lot.unitPrice ? `${lot.unitPrice} ${lot.currency}` : '—'}
                        </td>
                      )}
                      {canViewPrices && (
                        <td className="p-2.5 text-end font-mono font-bold text-emerald-800">
                          {(lot.availableQty * (lot.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                        </td>
                      )}
                      <td className="p-2.5 text-slate-700">
                        <div className="font-semibold">{lot.supplierName || '—'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{lot.receivedDate || '—'}</div>
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() =>
                            setKardexTarget({
                              itemId: lot.itemId,
                              variantCode: lot.variantCode,
                              lotNumber: lot.lotNumber,
                              nameAr: lot.nameAr,
                              nameEn: lot.nameEn,
                              specs: lot.specs,
                              smallUnit: lot.smallUnit,
                            })
                          }
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title={isAr ? 'عرض كارت حركة اللوط' : 'View Lot Movement'}
                        >
                          <History className="h-4 w-4 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE C: ACTIVE LOT & METADATA LEDGER */}
      {viewMode === 'lots' && (
        <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[380px]">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 text-start">{isAr ? 'رقم اللوط (FIFO)' : 'Lot Number (FIFO)'}</th>
                <th className="p-3 text-start">{isAr ? 'الصنف والتنوع' : 'Item & Variant'}</th>
                <th className="p-3 text-start">{isAr ? 'المستودع المحفوظ به' : 'Warehouse Location'}</th>
                <th className="p-3 text-center">{isAr ? 'الرصيد المتاح' : 'Available Qty'}</th>
                {canViewPrices && <th className="p-3 text-end">{isAr ? 'سعر الوحدة' : 'Unit Cost'}</th>}
                {canViewPrices && <th className="p-3 text-end">{isAr ? 'إجمالي القيمة' : 'Total Valuation'}</th>}
                <th className="p-3 text-start">{isAr ? 'المورد وتاريخ الورود' : 'Supplier & Inward Date'}</th>
                <th className="p-3 text-center">{isAr ? 'سجل الحركة' : 'Kardex'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <PeacockLoader size="lg" text={isAr ? 'جاري قراءة سجلات اللوطات...' : 'Loading Active Lots...'} />
                  </td>
                </tr>
              ) : filteredLotsList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    {isAr ? 'لا توجد لوطات نشطة مطابقة للبحث.' : 'No active lots found.'}
                  </td>
                </tr>
              ) : (
                filteredLotsList.map((lot) => (
                  <tr key={`${lot.lotNumber}_${lot.warehouseId}`} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono font-extrabold text-indigo-700 align-top">
                      <div className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{lot.lotNumber}</span>
                      </div>
                      {lot.supplierBatchNo && (
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {isAr ? 'تشغيلة المورد:' : 'Batch:'} {lot.supplierBatchNo}
                        </span>
                      )}
                    </td>

                    <td className="p-3 align-top">
                      <span className="font-bold text-slate-900 block">{lot.nameAr}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{lot.variantCode} {lot.specs ? `(${lot.specs})` : ''}</span>
                    </td>

                    <td className="p-3 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: lot.warehouseObj?.color || '#0d6cba' }} />
                        <span className="font-bold text-slate-800">{getWarehouseName(lot.warehouseId)}</span>
                      </div>
                    </td>

                    <td className="p-3 align-top text-center font-mono font-bold text-slate-900">
                      {lot.availableQty.toLocaleString()} {lot.smallUnit}
                    </td>

                    {canViewPrices && (
                      <td className="p-3 align-top text-end font-mono text-slate-700">
                        {lot.unitPrice ? `${lot.unitPrice} ${lot.currency}` : '—'}
                      </td>
                    )}

                    {canViewPrices && (
                      <td className="p-3 align-top text-end font-mono font-bold text-emerald-800">
                        {(lot.availableQty * (lot.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                      </td>
                    )}

                    <td className="p-3 align-top text-slate-700">
                      <div className="font-semibold">{lot.supplierName || '—'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{lot.receivedDate || '—'}</div>
                    </td>

                    <td className="p-3 align-top text-center">
                      <button
                        onClick={() =>
                          setKardexTarget({
                            itemId: lot.itemId,
                            variantCode: lot.variantCode,
                            lotNumber: lot.lotNumber,
                            nameAr: lot.nameAr,
                            nameEn: lot.nameEn,
                            specs: lot.specs,
                            smallUnit: lot.smallUnit,
                          })
                        }
                        className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1 mx-auto"
                        title={isAr ? 'عرض كارت حركة اللوط' : 'View Stock Card'}
                      >
                        <History className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{isAr ? 'كارت الحركة' : 'Kardex'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* INTERACTIVE STOCK CARD (KARDEX POPUP MODAL) */}
      {kardexTarget && (
        <div
          className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 z-[9999] animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setKardexTarget(null);
          }}
        >
          <div
            className="bg-white w-full max-w-5xl xl:max-w-6xl max-h-[92vh] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                  <History className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm sm:text-base text-white">
                      {isAr ? 'كارت حركة ومتابعة الصنف المخزني' : 'Stock Kardex Ledger'}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-300 bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700">
                      {kardexTarget.variantCode || kardexTarget.itemId}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
                    <span className="font-bold text-white text-sm">{kardexTarget.nameAr}</span>
                    {kardexTarget.nameEn && <span className="text-slate-400">• {kardexTarget.nameEn}</span>}
                    {kardexTarget.specs && <span>• {kardexTarget.specs}</span>}
                    {kardexTarget.smallUnit && <span className="text-indigo-300 font-semibold">• ({kardexTarget.smallUnit})</span>}
                    {kardexTarget.lotNumber ? (
                      <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md font-bold text-[11px]">
                        {isAr ? 'لوط:' : 'Lot:'} {kardexTarget.lotNumber}
                      </span>
                    ) : (
                      <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md text-[11px]">
                        {isAr ? 'مجمع كافة اللوطات' : 'All Lots Consolidated'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tab Switcher & Modal Actions */}
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-slate-800 rounded-xl border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setKardexViewTab('ledger')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      kardexViewTab === 'ledger'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    <span>{isAr ? 'سجل الحركات' : 'Ledger Table'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setKardexViewTab('preview')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      kardexViewTab === 'preview'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{isAr ? 'معاينة الطباعة' : 'Print Preview'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePrintKardex}
                  disabled={isPrintingKardex}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  title={isAr ? 'طباعة كارت حركة الصنف' : 'Print Kardex Slip'}
                >
                  <Printer className="h-4 w-4" />
                  <span>{isPrintingKardex ? (isAr ? 'جاري التحضير...' : 'Printing...') : (isAr ? 'طباعة الكارت' : 'Print Slip')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setKardexTarget(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                  title={isAr ? 'إغلاق (Esc)' : 'Close (Esc)'}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Print In-Progress Feedback Banner */}
            {printFeedback && (
              <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between text-xs text-emerald-800 font-semibold animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>{printFeedback}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setKardexViewTab('preview')}
                  className="underline hover:text-emerald-950 font-bold cursor-pointer"
                >
                  {isAr ? 'عرض المعاينة الطباعية المعتمدة' : 'View Print Preview'}
                </button>
              </div>
            )}

            {/* COLLAPSIBLE / EXPANDABLE FILTER BAR (DEFAULT COLLAPSED) */}
            <div className="bg-slate-50 border-b border-slate-200">
              {/* Always-visible compact trigger bar */}
              <div className="p-3 sm:px-4 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsKardexFilterOpen(!isKardexFilterOpen)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border ${
                      isKardexFilterOpen || activeFilterCount > 0
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-200 shadow-2xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{isAr ? 'تصفية الحركات' : 'Filter Ledger'}</span>
                    {activeFilterCount > 0 && (
                      <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                        {activeFilterCount}
                      </span>
                    )}
                    {isKardexFilterOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    )}
                  </button>

                  {/* Filter chips when active */}
                  {activeFilterCount > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {hasActiveDateFilter && (
                        <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                          <Calendar className="h-3 w-3 text-indigo-500" />
                          <span className="font-mono">{kardexStartDate || '...'} ➔ {kardexEndDate || '...'}</span>
                        </span>
                      )}
                      {kardexWarehouseFilter !== 'all' && (
                        <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                          <Warehouse className="h-3 w-3 text-amber-500" />
                          <span>{kardexWarehouseFilter}</span>
                        </span>
                      )}
                      {kardexTypeFilter !== 'all' && (
                        <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                          <Tag className="h-3 w-3 text-blue-500" />
                          <span>{getTransactionTypeLabel(kardexTypeFilter)}</span>
                        </span>
                      )}
                      {kardexUserFilter !== 'all' && (
                        <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                          <User className="h-3 w-3 text-emerald-500" />
                          <span>{kardexUserFilter}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleResetKardexFilters}
                        className="px-2 py-0.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-bold border border-rose-200 transition cursor-pointer flex items-center gap-1 text-[10px]"
                        title={isAr ? 'إلغاء كافة الفلاتر' : 'Reset All Filters'}
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>{isAr ? 'إلغاء الفلاتر' : 'Reset'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Date Presets (Always Available) */}
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleKardexPreset('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      !kardexStartDate && !kardexEndDate
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {isAr ? 'كافة الفترات' : 'All Time'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKardexPreset('30days')}
                    className="px-2.5 py-1 rounded-lg font-bold bg-white hover:bg-slate-200 text-slate-600 border border-slate-200 transition cursor-pointer"
                  >
                    {isAr ? '30 يوم' : '30d'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKardexPreset('this_month')}
                    className="px-2.5 py-1 rounded-lg font-bold bg-white hover:bg-slate-200 text-slate-600 border border-slate-200 transition cursor-pointer"
                  >
                    {isAr ? 'هذا الشهر' : 'Month'}
                  </button>
                </div>
              </div>

              {/* Expanded Filter Panel */}
              {isKardexFilterOpen && (
                <div className="p-4 pt-1 border-t border-slate-200/80 bg-slate-100/60 space-y-3 animate-in slide-in-from-top-2 duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                    {/* From Date */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <label className="text-slate-500 text-[10px] font-bold block mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-indigo-500" />
                        <span>{isAr ? 'من تاريخ:' : 'From Date:'}</span>
                      </label>
                      <input
                        type="date"
                        value={kardexStartDate}
                        onChange={(e) => setKardexStartDate(e.target.value)}
                        className="w-full bg-transparent border-0 p-0 text-slate-800 font-mono text-xs focus:ring-0 focus:outline-none cursor-pointer"
                      />
                    </div>

                    {/* To Date */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <label className="text-slate-500 text-[10px] font-bold block mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-indigo-500" />
                        <span>{isAr ? 'إلى تاريخ:' : 'To Date:'}</span>
                      </label>
                      <input
                        type="date"
                        value={kardexEndDate}
                        onChange={(e) => setKardexEndDate(e.target.value)}
                        className="w-full bg-transparent border-0 p-0 text-slate-800 font-mono text-xs focus:ring-0 focus:outline-none cursor-pointer"
                      />
                    </div>

                    {/* Warehouse Filter */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <label className="text-slate-500 text-[10px] font-bold block mb-1 flex items-center gap-1">
                        <Warehouse className="h-3 w-3 text-amber-500" />
                        <span>{isAr ? 'المستودع / المسار:' : 'Warehouse / Route:'}</span>
                      </label>
                      <select
                        value={kardexWarehouseFilter}
                        onChange={(e) => setKardexWarehouseFilter(e.target.value)}
                        className="w-full bg-transparent border-0 p-0 text-slate-800 text-xs font-semibold focus:ring-0 focus:outline-none cursor-pointer"
                      >
                        <option value="all">{isAr ? 'كافة المستودعات والمسارات' : 'All Warehouses'}</option>
                        {kardexFilterOptions.warehouses.map((wh, idx) => (
                          <option key={idx} value={wh}>{wh}</option>
                        ))}
                      </select>
                    </div>

                    {/* Transaction Type Filter */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <label className="text-slate-500 text-[10px] font-bold block mb-1 flex items-center gap-1">
                        <Tag className="h-3 w-3 text-blue-500" />
                        <span>{isAr ? 'نوع الحركة المخزنية:' : 'Transaction Type:'}</span>
                      </label>
                      <select
                        value={kardexTypeFilter}
                        onChange={(e) => setKardexTypeFilter(e.target.value)}
                        className="w-full bg-transparent border-0 p-0 text-slate-800 text-xs font-semibold focus:ring-0 focus:outline-none cursor-pointer"
                      >
                        <option value="all">{isAr ? 'كافة أنواع الحركات' : 'All Transaction Types'}</option>
                        {kardexFilterOptions.types.map((type, idx) => (
                          <option key={idx} value={type}>{getTransactionTypeLabel(type)}</option>
                        ))}
                      </select>
                    </div>

                    {/* User / Operator Filter */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <label className="text-slate-500 text-[10px] font-bold block mb-1 flex items-center gap-1">
                        <User className="h-3 w-3 text-emerald-500" />
                        <span>{isAr ? 'المستخدم / القائم بالحركة:' : 'User / Operator:'}</span>
                      </label>
                      <select
                        value={kardexUserFilter}
                        onChange={(e) => setKardexUserFilter(e.target.value)}
                        className="w-full bg-transparent border-0 p-0 text-slate-800 text-xs font-semibold focus:ring-0 focus:outline-none cursor-pointer"
                      >
                        <option value="all">{isAr ? 'كافة المستخدمين' : 'All Users'}</option>
                        {kardexFilterOptions.actors.map((actor, idx) => (
                          <option key={idx} value={actor}>{actor}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Filter panel action bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">{isAr ? 'فترات سريعة:' : 'Quick Presets:'}</span>
                      <button
                        type="button"
                        onClick={() => handleKardexPreset('all')}
                        className="px-2 py-0.5 bg-white hover:bg-slate-200 rounded border border-slate-200 text-[10px] font-bold cursor-pointer"
                      >
                        {isAr ? 'الكل' : 'All'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKardexPreset('30days')}
                        className="px-2 py-0.5 bg-white hover:bg-slate-200 rounded border border-slate-200 text-[10px] font-bold cursor-pointer"
                      >
                        {isAr ? '30 يوم' : '30d'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKardexPreset('this_month')}
                        className="px-2 py-0.5 bg-white hover:bg-slate-200 rounded border border-slate-200 text-[10px] font-bold cursor-pointer"
                      >
                        {isAr ? 'هذا الشهر' : 'Month'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKardexPreset('this_year')}
                        className="px-2 py-0.5 bg-white hover:bg-slate-200 rounded border border-slate-200 text-[10px] font-bold cursor-pointer"
                      >
                        {isAr ? 'هذا العام' : 'Year'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetKardexFilters}
                        className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 rounded-lg text-xs font-bold border border-rose-200 transition cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>{isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsKardexFilterOpen(false)}
                        className="px-3.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                      >
                        {isAr ? 'طي وإخفاء الفلاتر' : 'Collapse Filter'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Financial & Quantitative Summary Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:px-4 bg-slate-100/40 border-b border-slate-200 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center shadow-2xs">
                <span className="text-[10px] text-slate-500 block font-bold">{isAr ? 'رصيد أول الفترة' : 'Opening Balance'}</span>
                <span className="text-xs sm:text-sm font-black font-mono text-slate-800 mt-0.5 block">
                  {periodOpeningBalance.toLocaleString()} {kardexTarget.smallUnit}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center shadow-2xs">
                <span className="text-[10px] text-emerald-700 block font-bold">{isAr ? 'إجمالي الوارد (+)' : 'Total In (+)'}</span>
                <span className="text-xs sm:text-sm font-black font-mono text-emerald-700 mt-0.5 block">
                  +{periodTotalIn.toLocaleString()} {kardexTarget.smallUnit}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-rose-200 text-center shadow-2xs">
                <span className="text-[10px] text-rose-700 block font-bold">{isAr ? 'إجمالي المنصرف (-)' : 'Total Out (-)'}</span>
                <span className="text-xs sm:text-sm font-black font-mono text-rose-700 mt-0.5 block">
                  -{periodTotalOut.toLocaleString()} {kardexTarget.smallUnit}
                </span>
              </div>
              <div className="bg-indigo-50/80 p-2.5 rounded-xl border border-indigo-200 text-center shadow-2xs">
                <span className="text-[10px] text-indigo-900 block font-bold">{isAr ? 'رصيد نهاية الفترة' : 'Closing Balance'}</span>
                <span className="text-xs sm:text-sm font-black font-mono text-indigo-900 mt-0.5 block">
                  {periodClosingBalance.toLocaleString()} {kardexTarget.smallUnit}
                </span>
              </div>
            </div>

            {/* MODAL MAIN CONTENT: LEDGER TABLE OR PRINT PREVIEW */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs bg-slate-50/50">
              {kardexViewTab === 'ledger' ? (
                /* 1. Interactive Ledger Table */
                <div className="border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-start sticky top-0 z-10 shadow-2xs">
                        <th className="p-2.5 text-center w-12 font-mono text-slate-500">#</th>
                        <th className="p-2.5 text-start">{isAr ? 'التاريخ والوقت' : 'Date & Time'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'نوع وسند الحركة' : 'Type & Doc ID'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'المستودع / المسار' : 'Warehouse / Route'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'اللوط' : 'Lot'}</th>
                        <th className="p-2.5 text-center text-emerald-700">{isAr ? 'وارد (+)' : 'In (+)'}</th>
                        <th className="p-2.5 text-center text-rose-700">{isAr ? 'منصرف (-)' : 'Out (-)'}</th>
                        <th className="p-2.5 text-center font-extrabold text-indigo-900 bg-indigo-50/70">{isAr ? 'الرصيد' : 'Balance'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'القائم بالحركة / الملاحظات' : 'Actor / Audit Notes'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Prior Opening Balance Row if Start Date is active */}
                      {hasPriorOpening && (
                        <tr className="bg-indigo-50/40 font-semibold text-slate-700">
                          <td className="p-2.5 text-center text-slate-400 font-mono text-[10px]">—</td>
                          <td className="p-2.5 align-top">
                            <div className="font-mono text-indigo-800 text-[10px] font-bold">&lt; {kardexStartDate}</div>
                            <span className="text-[10px] text-slate-500 block">{isAr ? 'بداية الفترة' : 'Start Period'}</span>
                          </td>
                          <td className="p-2.5 align-top">
                            <span className="inline-block px-2 py-0.5 rounded-lg text-[10px] font-extrabold font-mono border bg-indigo-50 text-indigo-800 border-indigo-200">
                              {isAr ? 'رصيد أول المدة' : 'OPENING'}
                            </span>
                          </td>
                          <td className="p-2.5 align-top">
                            <span className="font-bold text-slate-800 block">
                              {isAr ? 'رصيد ما قبل تاريخ البداية' : 'Balance prior to start date'}
                            </span>
                          </td>
                          <td className="p-2.5 align-top font-mono text-slate-400">—</td>
                          <td className="p-2.5 align-top text-center text-slate-400 font-mono">—</td>
                          <td className="p-2.5 align-top text-center text-slate-400 font-mono">—</td>
                          <td className="p-2.5 align-top text-center font-mono font-extrabold text-indigo-900 bg-indigo-100/40">
                            {periodOpeningBalance.toLocaleString()} {kardexTarget.smallUnit}
                          </td>
                          <td className="p-2.5 align-top text-slate-500 text-[11px]">
                            {isAr ? 'رصيد تراكمي من الحركات السابقة للفترة' : 'Cumulative from movements prior to start date'}
                          </td>
                        </tr>
                      )}

                      {filteredKardexLedger.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-10 text-center text-slate-400 space-y-2">
                            <div className="text-base font-bold text-slate-600">
                              {activeFilterCount > 0
                                ? (isAr ? 'لا توجد حركات مسجلة تطابق الفلاتر المحددة.' : 'No recorded transactions match active filters.')
                                : (isAr ? 'لا توجد حركات مسجلة لهذا الصنف حتى الآن.' : 'No recorded transactions for this item.')}
                            </div>
                            {activeFilterCount > 0 && (
                              <button
                                type="button"
                                onClick={handleResetKardexFilters}
                                className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold border border-indigo-200 transition cursor-pointer"
                              >
                                {isAr ? 'إلغاء كافة الفلاتر وتوسيع النطاق' : 'Clear Filters & Show All'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ) : (
                        filteredKardexLedger.map((mov, mIdx) => (
                          <tr key={mIdx} className={`hover:bg-slate-50/80 transition ${mov.isReconciliation ? 'bg-purple-50/25' : ''}`}>
                            <td className="p-2.5 text-center font-mono text-slate-400 text-[11px] align-top">{mIdx + 1}</td>
                            <td className="p-2.5 align-top">
                              <div className="font-mono text-slate-600 text-[11px] space-y-0.5">
                                <span className="block font-bold text-slate-800">{mov.date}</span>
                                {mov.time && (
                                  <span className="block text-[10px] text-slate-400 font-mono">
                                    {mov.time}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="p-2.5 align-top">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-extrabold font-mono border ${
                                  mov.badgeClass || 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                                title={mov.typeLabel}
                              >
                                {mov.type}: {mov.docId}
                              </span>
                              <span className="block text-[10px] text-slate-500 mt-0.5">{mov.typeLabel}</span>
                            </td>

                            <td className="p-2.5 align-top">
                              <span className="font-bold text-slate-900 block">{mov.warehouse}</span>
                            </td>

                            <td className="p-2.5 align-top font-mono text-[11px] text-slate-600">
                              {mov.lotNumber ? (
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-semibold text-slate-800">
                                  {mov.lotNumber}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>

                            <td className="p-2.5 align-top text-center font-mono font-bold text-emerald-700">
                              {mov.qtyIn > 0 ? `+${mov.qtyIn.toLocaleString()}` : '—'}
                            </td>

                            <td className="p-2.5 align-top text-center font-mono font-bold text-rose-700">
                              {mov.qtyOut > 0 ? `-${mov.qtyOut.toLocaleString()}` : mov.isTransfer ? `⇄ ${mov.transferQty.toLocaleString()}` : '—'}
                            </td>

                            <td className="p-2.5 align-top text-center font-mono font-black text-indigo-900 bg-indigo-50/30">
                              {mov.runningBalance.toLocaleString()} {kardexTarget.smallUnit}
                            </td>

                            <td className="p-2.5 align-top">
                              {/* Stock Count Audit Trail Details */}
                              {mov.isReconciliation ? (
                                <div className="space-y-0.5 p-1.5 bg-purple-50/70 rounded-lg border border-purple-200 text-[10px]">
                                  {mov.oldBookBalance !== null && (
                                    <div className="text-slate-600">
                                      <span className="font-bold">{isAr ? 'الرصيد الدفتري السابق:' : 'Prev Book Exp:'} </span>
                                      <span className="font-mono font-bold text-slate-900">{Number(mov.oldBookBalance).toLocaleString()} {kardexTarget.smallUnit}</span>
                                    </div>
                                  )}
                                  <div className="text-slate-600">
                                    <span className="font-bold">{isAr ? 'القائم بالحصر والإدخال:' : 'Counted & Placed By:'} </span>
                                    <span className="font-bold text-purple-900">{mov.actor}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-0.5 text-[11px]">
                                  <span className="font-semibold text-slate-800 block">{mov.actor}</span>
                                  {mov.targetWarehouse && (
                                    <span className="text-[10px] text-slate-500 block">
                                      {isAr ? 'إلى:' : 'To:'} {mov.targetWarehouse}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* 2. Official Print Preview Mode (WYSWYG) */
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-full bg-indigo-50 border border-indigo-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-indigo-900 font-bold">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      <span>{isAr ? 'المعاينة الطباعية المعتمدة لكارت حركة الصنف (Stock Kardex Slip) جاهزة للطباعة والتصدير' : 'Official Kardex Slip Printable Report Preview'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePrintKardex}
                      disabled={isPrintingKardex}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Printer className="h-4 w-4" />
                      <span>{isAr ? 'أمر بالطباعة الآن' : 'Print Document Now'}</span>
                    </button>
                  </div>

                  {/* Visual Paper Slip */}
                  <div className="w-full max-w-4xl bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-300 text-slate-900 space-y-4 font-sans">
                    {/* Slip Header */}
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
                      <div className="flex items-center gap-3">
                        <img
                          src="/logo.svg"
                          alt="Al Tawoos Logo"
                          className="h-12 w-auto max-w-[140px] object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div>
                          <h1 className="text-sm font-black text-slate-900 leading-tight">
                            {isAr ? 'شركة الطاووس لتعبئة و تجارة المواد الغذائية' : 'Al Tawoos for Packing & Trading Food Goods'}
                          </h1>
                          <h2 className="text-xs text-slate-700 font-bold mt-0.5">
                            {isAr ? 'كارت حركة ومتابعة الصنف المخزني (Stock Kardex Ledger)' : 'Stock Movement Ledger (Kardex Slip)'}
                          </h2>
                          <p className="text-[10px] text-slate-500">
                            {isAr ? 'إدارة مراقبة المخزون والتكاليف • نظام إدارة المستودعات' : 'Inventory & Cost Control Dept • WMS'}
                          </p>
                        </div>
                      </div>
                      <div className="text-end text-xs space-y-0.5">
                        <div className="font-bold text-slate-900">
                          <span className="text-slate-500 text-[10px]">{isAr ? 'تاريخ الطباعة:' : 'Print Date:'} </span>
                          <span className="font-mono">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="text-slate-600 text-[10px]">
                          <span className="text-slate-500">{isAr ? 'المستخدم:' : 'User:'} </span>
                          <span className="font-semibold">{currentUser?.nameAr || currentUser?.name || (isAr ? 'المسؤول' : 'Authorized User')}</span>
                        </div>
                        <div className="text-slate-600 text-[10px]">
                          <span className="text-slate-500">{isAr ? 'الفترة:' : 'Period:'} </span>
                          <span className="font-bold text-indigo-900 font-mono">
                            {hasActiveDateFilter
                              ? `${kardexStartDate || (isAr ? 'البداية' : 'Start')} ➔ ${kardexEndDate || (isAr ? 'الآن' : 'Now')}`
                              : (isAr ? 'كافة الحركات المسجلة' : 'All Recorded History')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Slip Item Details Card */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl border border-slate-300 bg-slate-50 text-xs">
                      <div>
                        <span className="text-slate-500 text-[10px] block">{isAr ? 'كود الصنف / التنوع:' : 'Item / Variant Code:'}</span>
                        <span className="font-mono font-extrabold text-slate-900 text-xs block">{kardexTarget.variantCode || kardexTarget.itemId}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">{isAr ? 'اسم الصنف والخامة:' : 'Item Name:'}</span>
                        <span className="font-bold text-slate-900 text-xs block">{kardexTarget.nameAr}</span>
                        {kardexTarget.nameEn && <span className="text-[10px] text-slate-500 block">{kardexTarget.nameEn}</span>}
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">{isAr ? 'المواصفة / الوحدة:' : 'Specs & Unit:'}</span>
                        <span className="font-semibold text-slate-800 text-xs block">
                          {kardexTarget.specs || '—'} ({kardexTarget.smallUnit})
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">{isAr ? 'رقم اللوط المحدد:' : 'Lot Number:'}</span>
                        <span className="font-mono font-extrabold text-indigo-700 text-xs block">
                          {kardexTarget.lotNumber || (isAr ? 'كافة اللوطات (إجمالي)' : 'All Lots (Consolidated)')}
                        </span>
                      </div>
                    </div>

                    {/* Slip Period Metrics */}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 border border-slate-300 rounded-lg bg-white">
                        <span className="text-[10px] text-slate-500 block font-bold">{isAr ? 'رصيد أول الفترة' : 'Opening'}</span>
                        <span className="font-mono font-bold text-slate-900">{periodOpeningBalance.toLocaleString()} {kardexTarget.smallUnit}</span>
                      </div>
                      <div className="p-2 border border-emerald-300 rounded-lg bg-emerald-50/50">
                        <span className="text-[10px] text-emerald-800 block font-bold">{isAr ? 'إجمالي الوارد (+)' : 'Total In'}</span>
                        <span className="font-mono font-bold text-emerald-700">+{periodTotalIn.toLocaleString()}</span>
                      </div>
                      <div className="p-2 border border-rose-300 rounded-lg bg-rose-50/50">
                        <span className="text-[10px] text-rose-800 block font-bold">{isAr ? 'إجمالي المنصرف (-)' : 'Total Out'}</span>
                        <span className="font-mono font-bold text-rose-700">-{periodTotalOut.toLocaleString()}</span>
                      </div>
                      <div className="p-2 border border-indigo-300 rounded-lg bg-indigo-50/50">
                        <span className="text-[10px] text-indigo-900 block font-bold">{isAr ? 'رصيد نهاية الفترة' : 'Closing'}</span>
                        <span className="font-mono font-extrabold text-indigo-950">{periodClosingBalance.toLocaleString()} {kardexTarget.smallUnit}</span>
                      </div>
                    </div>

                    {/* Slip Movements Table */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                      <table className="w-full border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                            <th className="p-1.5 text-center border-e border-slate-300 w-8">#</th>
                            <th className="p-1.5 text-start border-e border-slate-300 w-20">{isAr ? 'التاريخ' : 'Date'}</th>
                            <th className="p-1.5 text-start border-e border-slate-300">{isAr ? 'نوع ورقم السند' : 'Type & Doc'}</th>
                            <th className="p-1.5 text-start border-e border-slate-300">{isAr ? 'المستودع / المسار' : 'Warehouse'}</th>
                            <th className="p-1.5 text-start border-e border-slate-300">{isAr ? 'اللوط' : 'Lot #'}</th>
                            <th className="p-1.5 text-center border-e border-slate-300 text-emerald-800">{isAr ? 'وارد (+)' : 'In (+)'}</th>
                            <th className="p-1.5 text-center border-e border-slate-300 text-rose-800">{isAr ? 'منصرف (-)' : 'Out (-)'}</th>
                            <th className="p-1.5 text-center border-e border-slate-300 bg-slate-200/60 font-bold text-slate-900">{isAr ? 'الرصيد' : 'Balance'}</th>
                            <th className="p-1.5 text-start">{isAr ? 'القائم بالحركة / الملاحظات' : 'Actor / Notes'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {hasPriorOpening && (
                            <tr className="bg-slate-100/60 font-semibold italic text-slate-700">
                              <td className="p-1.5 text-center border-e border-slate-200">—</td>
                              <td className="p-1.5 border-e border-slate-200 font-mono text-[9px]">&lt; {kardexStartDate}</td>
                              <td className="p-1.5 border-e border-slate-200 font-bold text-indigo-900">
                                {isAr ? 'رصيد أول المدة للفترة المحددة' : 'Opening Period Balance'}
                              </td>
                              <td className="p-1.5 border-e border-slate-200 text-slate-500">—</td>
                              <td className="p-1.5 border-e border-slate-200 text-slate-500">—</td>
                              <td className="p-1.5 text-center border-e border-slate-200 font-mono text-slate-400">—</td>
                              <td className="p-1.5 text-center border-e border-slate-200 font-mono text-slate-400">—</td>
                              <td className="p-1.5 text-center border-e border-slate-200 font-mono font-black text-indigo-900 bg-indigo-50/40">
                                {periodOpeningBalance.toLocaleString()}
                              </td>
                              <td className="p-1.5 text-slate-500 text-[9px]">
                                {isAr ? `تراكمي ما قبل ${kardexStartDate}` : `Cumulative prior to ${kardexStartDate}`}
                              </td>
                            </tr>
                          )}

                          {filteredKardexLedger.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="p-6 text-center text-slate-400">
                                {isAr ? 'لا توجد حركات مسجلة ضمن النطاق المحدد.' : 'No movements recorded in this period.'}
                              </td>
                            </tr>
                          ) : (
                            filteredKardexLedger.map((mov, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="p-1.5 text-center font-mono text-slate-500 border-e border-slate-200">{idx + 1}</td>
                                <td className="p-1.5 font-mono text-slate-700 border-e border-slate-200">
                                  <div className="font-semibold">{mov.date}</div>
                                  {mov.time && <div className="text-[9px] text-slate-400">{mov.time}</div>}
                                </td>
                                <td className="p-1.5 border-e border-slate-200">
                                  <span className="font-mono font-bold text-slate-900 block">{mov.type}: {mov.docId}</span>
                                  <span className="text-[9px] text-slate-500 block">{mov.typeLabel}</span>
                                </td>
                                <td className="p-1.5 border-e border-slate-200 font-semibold text-slate-800">{mov.warehouse}</td>
                                <td className="p-1.5 font-mono text-[9px] text-slate-600 border-e border-slate-200">{mov.lotNumber || '—'}</td>
                                <td className="p-1.5 text-center font-mono font-bold text-emerald-700 border-e border-slate-200">
                                  {mov.qtyIn > 0 ? `+${mov.qtyIn.toLocaleString()}` : '—'}
                                </td>
                                <td className="p-1.5 text-center font-mono font-bold text-rose-700 border-e border-slate-200">
                                  {mov.qtyOut > 0 ? `-${mov.qtyOut.toLocaleString()}` : (mov.isTransfer ? `⇄ ${mov.transferQty?.toLocaleString()}` : '—')}
                                </td>
                                <td className="p-1.5 text-center font-mono font-black text-slate-900 border-e border-slate-200 bg-slate-50">
                                  {mov.runningBalance?.toLocaleString()}
                                </td>
                                <td className="p-1.5 text-slate-600 text-[9px]">
                                  <div>{mov.actor}</div>
                                  {mov.isReconciliation && mov.oldBookBalance !== null && (
                                    <div className="text-slate-400 font-mono text-[8px]">{isAr ? 'دفتري سابق:' : 'Prev:'} {Number(mov.oldBookBalance).toLocaleString()}</div>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                            <td colSpan={5} className="p-2 text-start border-e border-slate-200 font-extrabold">
                              {isAr ? 'إجمالي حركة الفترة والرصيد الختامي:' : 'Period Movement Totals & Closing Balance:'}
                            </td>
                            <td className="p-2 text-center font-mono font-extrabold text-emerald-800 border-e border-slate-200">
                              +{periodTotalIn.toLocaleString()}
                            </td>
                            <td className="p-2 text-center font-mono font-extrabold text-rose-800 border-e border-slate-200">
                              -{periodTotalOut.toLocaleString()}
                            </td>
                            <td className="p-2 text-center font-mono font-black text-indigo-900 bg-indigo-100/50 border-e border-slate-200">
                              {periodClosingBalance.toLocaleString()} {kardexTarget.smallUnit}
                            </td>
                            <td className="p-2 text-[9px] text-slate-500 font-normal">
                              {isAr ? 'رصيد دفتري مطابق' : 'Reconciled Book Balance'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Official Signatures */}
                    <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-300 text-center text-xs mt-6">
                      <div>
                        <span className="font-bold text-slate-700 block mb-8">{isAr ? 'أمين المخزن المختص' : 'Storekeeper / Custodian'}</span>
                        <div className="border-t border-dotted border-slate-400 w-32 mx-auto pt-1 text-[10px] text-slate-500">
                          {isAr ? 'التوقيع والاعتماد' : 'Signature'}
                        </div>
                      </div>
                      <div>
                        <span className="font-bold text-slate-700 block mb-8">{isAr ? 'مراقب المخزون والتكاليف' : 'Inventory Auditor'}</span>
                        <div className="border-t border-dotted border-slate-400 w-32 mx-auto pt-1 text-[10px] text-slate-500">
                          {isAr ? 'التوقيع والاعتماد' : 'Signature'}
                        </div>
                      </div>
                      <div>
                        <span className="font-bold text-slate-700 block mb-8">{isAr ? 'مدير إدارة المخازن واللوجستيات' : 'Warehouse Manager'}</span>
                        <div className="border-t border-dotted border-slate-400 w-32 mx-auto pt-1 text-[10px] text-slate-500">
                          {isAr ? 'التوقيع والاعتماد' : 'Signature'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:px-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 flex items-center gap-2">
                <span className="font-bold text-slate-700">{isAr ? 'عدد الحركات المعروضة:' : 'Movements Count:'}</span>
                <span className="font-mono font-bold text-indigo-700">{filteredKardexLedger.length}</span>
                {activeFilterCount > 0 && (
                  <span className="text-[11px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                    ({activeFilterCount} {isAr ? 'فلاتر مطبقة' : 'active filters'})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {kardexViewTab === 'ledger' ? (
                  <button
                    type="button"
                    onClick={() => setKardexViewTab('preview')}
                    className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Eye className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'معاينة كارت الطباعة' : 'Print Preview'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setKardexViewTab('ledger')}
                    className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Boxes className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? 'العودة لسجل الحركات' : 'Back to Ledger'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrintKardex}
                  disabled={isPrintingKardex}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isPrintingKardex ? (isAr ? 'جاري الطباعة...' : 'Printing...') : (isAr ? 'طباعة كارت الحركة' : 'Print Kardex')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setKardexTarget(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED PRINTABLE KARDEX SLIP (A4 REPORT) */}
      {kardexTarget && (
        <div
          id="printable-kardex-slip"
          className="fixed inset-0 bg-white p-6 z-[99999] hidden print:block text-slate-800"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-3">
            <div className="flex items-center gap-3">
              <img
                src="/logo.svg"
                alt="Al Tawoos Logo"
                className="h-12 w-auto max-w-[150px] object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div>
                <h1 className="text-sm font-black text-slate-900 leading-tight">
                  {isAr ? 'شركة الطاووس لتعبئة و تجارة المواد الغذائية' : 'Al Tawoos for Packing & Trading Food Goods'}
                </h1>
                <h2 className="text-xs text-slate-700 font-bold mt-0.5">
                  {isAr ? 'كارت حركة ومتابعة الصنف المخزني (Stock Kardex Ledger)' : 'Stock Movement Ledger (Kardex Slip)'}
                </h2>
                <p className="text-[10px] text-slate-500">
                  {isAr ? 'إدارة مراقبة المخزون والتكاليف • نظام إدارة المستودعات' : 'Inventory & Cost Control Dept • WMS'}
                </p>
              </div>
            </div>
            <div className="text-end text-xs space-y-0.5">
              <div className="font-bold text-slate-900">
                <span className="text-slate-500 text-[10px]">{isAr ? 'تاريخ الطباعة:' : 'Print Date:'} </span>
                <span className="font-mono">{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="text-slate-600 text-[10px]">
                <span className="text-slate-500">{isAr ? 'المستخدم:' : 'User:'} </span>
                <span className="font-semibold">{currentUser?.nameAr || currentUser?.name || (isAr ? 'المسؤول' : 'Authorized User')}</span>
              </div>
              <div className="text-slate-600 text-[10px]">
                <span className="text-slate-500">{isAr ? 'الفترة:' : 'Period:'} </span>
                <span className="font-bold text-indigo-900 font-mono">
                  {hasActiveDateFilter
                    ? `${kardexStartDate || (isAr ? 'البداية' : 'Start')} ➔ ${kardexEndDate || (isAr ? 'الآن' : 'Now')}`
                    : (isAr ? 'كافة الحركات المسجلة' : 'All Recorded History')}
                </span>
              </div>
            </div>
          </div>

          {/* Item Information Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 mb-3 rounded-xl border border-slate-300 bg-slate-50/80 text-xs">
            <div>
              <span className="text-slate-500 text-[10px] block">{isAr ? 'كود الصنف / التنوع:' : 'Item / Variant Code:'}</span>
              <span className="font-mono font-extrabold text-slate-900 text-xs block">{kardexTarget.variantCode || kardexTarget.itemId}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">{isAr ? 'اسم الصنف والخامة:' : 'Item Name:'}</span>
              <span className="font-bold text-slate-900 text-xs block">{kardexTarget.nameAr}</span>
              {kardexTarget.nameEn && <span className="text-[10px] text-slate-500 block">{kardexTarget.nameEn}</span>}
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">{isAr ? 'المواصفات والوحدة:' : 'Specs & Small Unit:'}</span>
              <span className="font-bold text-slate-900 text-xs block">
                {kardexTarget.specs ? `${kardexTarget.specs} • ` : ''}{kardexTarget.smallUnit}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">{isAr ? 'نطاق التشغيلة / اللوط:' : 'Lot Scope:'}</span>
              <span className="font-mono font-bold text-indigo-900 text-xs block">
                {kardexTarget.lotNumber ? kardexTarget.lotNumber : (isAr ? 'كافة اللوطات (مجمع)' : 'All Lots (Consolidated)')}
              </span>
            </div>
          </div>

          {/* Financial / Quantitative 4-box Summary */}
          <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
            <div className="p-2 border border-slate-300 rounded-lg bg-slate-50 text-center">
              <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'رصيد أول الفترة' : 'Opening Balance'}</span>
              <span className="text-xs font-black font-mono text-slate-800 mt-0.5 block">
                {periodOpeningBalance.toLocaleString()} {kardexTarget.smallUnit}
              </span>
            </div>
            <div className="p-2 border border-emerald-300 rounded-lg bg-emerald-50/50 text-center">
              <span className="text-[10px] text-emerald-800 font-bold block">{isAr ? 'إجمالي الوارد (+)' : 'Total Received (+)'}</span>
              <span className="text-xs font-black font-mono text-emerald-700 mt-0.5 block">
                +{periodTotalIn.toLocaleString()} {kardexTarget.smallUnit}
              </span>
            </div>
            <div className="p-2 border border-rose-300 rounded-lg bg-rose-50/50 text-center">
              <span className="text-[10px] text-rose-800 font-bold block">{isAr ? 'إجمالي المنصرف (-)' : 'Total Issued (-)'}</span>
              <span className="text-xs font-black font-mono text-rose-700 mt-0.5 block">
                -{periodTotalOut.toLocaleString()} {kardexTarget.smallUnit}
              </span>
            </div>
            <div className="p-2 border border-indigo-300 rounded-lg bg-indigo-50/60 text-center">
              <span className="text-[10px] text-indigo-900 font-bold block">{isAr ? 'رصيد نهاية الفترة' : 'Closing Balance'}</span>
              <span className="text-xs font-black font-mono text-indigo-900 mt-0.5 block">
                {periodClosingBalance.toLocaleString()} {kardexTarget.smallUnit}
              </span>
            </div>
          </div>

          {/* Print Table */}
          <div className="border border-slate-300 rounded-lg overflow-hidden mb-4">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-300">
                  <th className="p-1.5 text-center border-e border-slate-200 w-8">#</th>
                  <th className="p-1.5 text-start border-e border-slate-200 w-24">{isAr ? 'التاريخ والوقت' : 'Date & Time'}</th>
                  <th className="p-1.5 text-start border-e border-slate-200">{isAr ? 'نوع الحركة ورقم السند' : 'Type & Doc ID'}</th>
                  <th className="p-1.5 text-start border-e border-slate-200">{isAr ? 'المستودع / المسار' : 'Warehouse / Route'}</th>
                  <th className="p-1.5 text-start border-e border-slate-200">{isAr ? 'رقم اللوط' : 'Lot #'}</th>
                  <th className="p-1.5 text-center border-e border-slate-200 text-emerald-800 bg-emerald-50/30 w-16">{isAr ? 'وارد (+)' : 'In (+)'}</th>
                  <th className="p-1.5 text-center border-e border-slate-200 text-rose-800 bg-rose-50/30 w-16">{isAr ? 'منصرف (-)' : 'Out (-)'}</th>
                  <th className="p-1.5 text-center border-e border-slate-200 font-bold text-slate-900 bg-slate-100/80 w-20">{isAr ? 'الرصيد' : 'Balance'}</th>
                  <th className="p-1.5 text-start">{isAr ? 'القائم بالحركة / الملاحظات' : 'Actor / Notes'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Prior Opening Balance Row if Start Date is active */}
                {hasPriorOpening && (
                  <tr className="bg-slate-100/60 font-semibold italic text-slate-700">
                    <td className="p-1.5 text-center border-e border-slate-200">—</td>
                    <td className="p-1.5 border-e border-slate-200 font-mono text-[9px]">&lt; {kardexStartDate}</td>
                    <td className="p-1.5 border-e border-slate-200 font-bold text-indigo-900">
                      {isAr ? 'رصيد أول المدة للفترة المحددة' : 'Opening Period Balance'}
                    </td>
                    <td className="p-1.5 border-e border-slate-200 text-slate-500">—</td>
                    <td className="p-1.5 border-e border-slate-200 text-slate-500">—</td>
                    <td className="p-1.5 text-center border-e border-slate-200 font-mono text-slate-400">—</td>
                    <td className="p-1.5 text-center border-e border-slate-200 font-mono text-slate-400">—</td>
                    <td className="p-1.5 text-center border-e border-slate-200 font-mono font-black text-indigo-900 bg-indigo-50/40">
                      {periodOpeningBalance.toLocaleString()}
                    </td>
                    <td className="p-1.5 text-slate-500 text-[9px]">
                      {isAr ? `تراكمي ما قبل ${kardexStartDate}` : `Cumulative prior to ${kardexStartDate}`}
                    </td>
                  </tr>
                )}

                {filteredKardexLedger.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-slate-400">
                      {isAr ? 'لا توجد حركات مسجلة ضمن النطاق الزمني المحدد.' : 'No movements recorded in this period.'}
                    </td>
                  </tr>
                ) : (
                  filteredKardexLedger.map((mov, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="p-1.5 text-center font-mono text-slate-500 border-e border-slate-200">{idx + 1}</td>
                      <td className="p-1.5 font-mono text-slate-700 border-e border-slate-200">
                        <div className="font-semibold">{mov.date}</div>
                        {mov.time && <div className="text-[9px] text-slate-400">{mov.time}</div>}
                      </td>
                      <td className="p-1.5 border-e border-slate-200">
                        <span className="font-mono font-bold text-slate-900 block">{mov.type}: {mov.docId}</span>
                        <span className="text-[9px] text-slate-500 block">{mov.typeLabel}</span>
                      </td>
                      <td className="p-1.5 border-e border-slate-200 font-semibold text-slate-800">{mov.warehouse}</td>
                      <td className="p-1.5 font-mono text-[9px] text-slate-600 border-e border-slate-200">{mov.lotNumber || '—'}</td>
                      <td className="p-1.5 text-center font-mono font-bold text-emerald-700 border-e border-slate-200">
                        {mov.qtyIn > 0 ? `+${mov.qtyIn.toLocaleString()}` : '—'}
                      </td>
                      <td className="p-1.5 text-center font-mono font-bold text-rose-700 border-e border-slate-200">
                        {mov.qtyOut > 0 ? `-${mov.qtyOut.toLocaleString()}` : (mov.isTransfer ? `⇄ ${mov.transferQty?.toLocaleString()}` : '—')}
                      </td>
                      <td className="p-1.5 text-center font-mono font-black text-slate-900 border-e border-slate-200 bg-slate-50">
                        {mov.runningBalance?.toLocaleString()}
                      </td>
                      <td className="p-1.5 text-slate-600 text-[9px]">
                        <div>{mov.actor}</div>
                        {mov.isReconciliation && mov.oldBookBalance !== null && (
                          <div className="text-slate-400 font-mono text-[8px]">{isAr ? 'دفتري سابق:' : 'Prev:'} {Number(mov.oldBookBalance).toLocaleString()}</div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={5} className="p-2 text-start border-e border-slate-200 font-extrabold">
                    {isAr ? 'إجمالي حركة الفترة والرصيد الختامي:' : 'Period Movement Totals & Closing Balance:'}
                  </td>
                  <td className="p-2 text-center font-mono font-extrabold text-emerald-800 border-e border-slate-200">
                    +{periodTotalIn.toLocaleString()}
                  </td>
                  <td className="p-2 text-center font-mono font-extrabold text-rose-800 border-e border-slate-200">
                    -{periodTotalOut.toLocaleString()}
                  </td>
                  <td className="p-2 text-center font-mono font-black text-indigo-900 bg-indigo-100/50 border-e border-slate-200">
                    {periodClosingBalance.toLocaleString()} {kardexTarget.smallUnit}
                  </td>
                  <td className="p-2 text-[9px] text-slate-500 font-normal">
                    {isAr ? 'رصيد دفتري مطابق' : 'Reconciled Book Balance'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Official Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-300 text-center text-xs mt-6">
            <div>
              <span className="font-bold text-slate-700 block mb-8">{isAr ? 'أمين المخزن المختص' : 'Storekeeper / Custodian'}</span>
              <div className="border-t border-dotted border-slate-400 w-32 mx-auto pt-1 text-[10px] text-slate-500">
                {isAr ? 'التوقيع والاعتماد' : 'Signature'}
              </div>
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-8">{isAr ? 'مراقب المخزون والتكاليف' : 'Inventory Auditor'}</span>
              <div className="border-t border-dotted border-slate-400 w-32 mx-auto pt-1 text-[10px] text-slate-500">
                {isAr ? 'التوقيع والاعتماد' : 'Signature'}
              </div>
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-8">{isAr ? 'مدير إدارة المخازن واللوجستيات' : 'Warehouse Manager'}</span>
              <div className="border-t border-dotted border-slate-400 w-32 mx-auto pt-1 text-[10px] text-slate-500">
                {isAr ? 'التوقيع والاعتماد' : 'Signature'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}