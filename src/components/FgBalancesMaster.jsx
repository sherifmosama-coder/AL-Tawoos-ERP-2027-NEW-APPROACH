import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Download,
  History,
  Printer,
  X,
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  Clock,
  Layers,
  Filter,
  RotateCcw,
  Truck,
  Factory,
  Boxes,
  Lock,
  ShieldAlert,
  Calendar,
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import { RowCommentButton } from './comments';
import { buildFgStockMatrix } from '../utils/fgStockEngine';
import { canAccessAction, canAccessField } from '../config/appArchitecture';

const MOVEMENT_TYPE_META = {
  OPENING_BALANCE: {
    labelAr: 'رصيد افتتاحي',
    labelEn: 'Opening Balance',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  FG_INWARD: {
    labelAr: 'استلام إنتاج تام',
    labelEn: 'FG Inward Pallet',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  SALES_RETURN: {
    labelAr: 'مرتجع مبيعات',
    labelEn: 'Sales Return',
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-300',
  },
  FAULTY_PULL: {
    labelAr: 'سحب تالف مخزن',
    labelEn: 'Faulty FG Pull',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  SALES_DISPATCH: {
    labelAr: 'صرف مبيعات',
    labelEn: 'Sales Dispatch',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300',
  },
  TRIP_EXTRAS_OUT: {
    labelAr: 'زيادات رحلة منصرفة',
    labelEn: 'Trip Extras Out',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-300',
  },
  TRIP_EXTRAS_RETURN: {
    labelAr: 'مرتجع زيادات سليمة',
    labelEn: 'Trip Extras Return',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-300',
  },
  TRIP_CLIENT_RETURN: {
    labelAr: 'مرتجع عميل / تجزئة مستلم',
    labelEn: 'WH Confirmed Client Return',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-300',
  },
};

function fmtNum(n, decimals = 2) {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function TransactionEquationStrip({ item, largeUnitName, smallUnit, isAr, compact = false }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'} bg-white p-2 rounded-xl border border-slate-200`}>
      <span className="font-extrabold text-slate-600 me-1">{isAr ? 'حركة الرصيد:' : 'Flow:'}</span>
      <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono font-bold text-slate-800">
        {isAr ? 'افتتاحي:' : 'OB:'} {fmtNum(item.openingLarge)}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-emerald-50 font-mono font-bold text-emerald-800">
        {isAr ? 'إنتاج:' : 'Prod:'} +{fmtNum(item.producedInLarge)}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-cyan-50 font-mono font-bold text-cyan-800">
        {isAr ? 'مرتجع بيع:' : 'Sales Ret:'} +{fmtNum(item.salesReturnedInLarge)}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-amber-50 font-mono font-bold text-amber-800">
        {isAr ? 'تالف:' : 'Faulty:'} -{fmtNum(item.faultyOutLarge)}
      </span>
      <span className="px-1.5 py-0.5 rounded bg-indigo-50 font-mono font-bold text-indigo-800">
        {isAr ? 'صرف مبيعات:' : 'Disp:'} -{fmtNum(item.dispatchedOutLarge)}
      </span>
      <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-mono font-extrabold">
        = {fmtNum(item.physicalOnHandLarge)} {largeUnitName} ({fmtNum(item.physicalOnHandSmall, 0)} {smallUnit})
      </span>
    </div>
  );
}

export default function FgBalancesMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // RBAC Gates
  const canExport = canAccessAction(permissions, 'fg_balances', 'canExport', currentUser);
  const canViewKardex = canAccessAction(permissions, 'fg_balances', 'canViewKardex', currentUser);
  const canPrintKardex = canAccessAction(permissions, 'fg_balances', 'canPrint', currentUser);
  const canViewPrices = canAccessField(permissions, 'fg_balances', 'unitCost', currentUser);
  const canViewTotals = canAccessField(permissions, 'fg_balances', 'totalValue', currentUser);

  // Firestore Collections State
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stagedPallets, setStagedPallets] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [faultyReturns, setFaultyReturns] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [truckDispatches, setTruckDispatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Period State
  const [searchTerm, setSearchTerm] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');

  // Expandable SKU rows & Option Movement Accordions
  const [expandedSkus, setExpandedSkus] = useState({});
  const [expandedOptionMovements, setExpandedOptionMovements] = useState({});

  // Lightbox Image Preview
  const [imagePreview, setImagePreview] = useState(null);

  // Kardex Modal State
  const [kardexSkuCode, setKardexSkuCode] = useState(null);
  const [kardexTypeFilter, setKardexTypeFilter] = useState('all');
  const [kardexOptionFilter, setKardexOptionFilter] = useState('all');
  const [kardexStartDate, setKardexStartDate] = useState('');
  const [kardexEndDate, setKardexEndDate] = useState('');

  // Subscribe to all SSOT Firestore Streams
  useEffect(() => {
    let mounted = true;
    const loadedFlags = { prod: false, pallets: false };
    const checkDone = () => {
      if (mounted && loadedFlags.prod && loadedFlags.pallets) {
        setLoading(false);
      }
    };

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      setFinishedProducts(snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id })));
      loadedFlags.prod = true;
      checkDone();
    });

    const unsubCategories = onSnapshot(collection(db, 'finished_product_categories'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, key: d.data().key || d.id }));
      list.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      setCategories(list);
    });

    const unsubPallets = onSnapshot(collection(db, 'staged_floor_pallets'), (snap) => {
      setStagedPallets(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      loadedFlags.pallets = true;
      checkDone();
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setStockTransfers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubFaulty = onSnapshot(collection(db, 'faulty_fg_returns'), (snap) => {
      setFaultyReturns(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubOrders = onSnapshot(collection(db, 'sales_orders'), (snap) => {
      setSalesOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubDispatches = onSnapshot(collection(db, 'truck_dispatches'), (snap) => {
      setTruckDispatches(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      mounted = false;
      unsubProducts();
      unsubCategories();
      unsubPallets();
      unsubTransfers();
      unsubFaulty();
      unsubOrders();
      unsubDispatches();
    };
  }, []);

  // Build SSOT Matrix scoped to chosen [periodStartDate, periodEndDate]
  const { skuList, skuMap, totals } = useMemo(() => {
    return buildFgStockMatrix({
      finishedProducts,
      stagedPallets,
      stockTransfers,
      faultyReturns,
      salesOrders,
      truckDispatches,
      startDate: periodStartDate,
      endDate: periodEndDate,
    });
  }, [finishedProducts, stagedPallets, stockTransfers, faultyReturns, salesOrders, truckDispatches, periodStartDate, periodEndDate]);

  const categoryMap = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.key || c.id] = c;
    });
    return map;
  }, [categories]);

  const applyPeriodPreset = (preset) => {
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (preset === 'all') {
      setPeriodStartDate('');
      setPeriodEndDate('');
    } else if (preset === 'today') {
      const s = fmt(today);
      setPeriodStartDate(s);
      setPeriodEndDate(s);
    } else if (preset === 'last7') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setPeriodStartDate(fmt(start));
      setPeriodEndDate(fmt(today));
    } else if (preset === 'last30') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      setPeriodStartDate(fmt(start));
      setPeriodEndDate(fmt(today));
    } else if (preset === 'this_month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setPeriodStartDate(fmt(start));
      setPeriodEndDate(fmt(today));
    }
  };

  // Apply Table Filters
  const filteredSkus = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return skuList.filter((sku) => {
      if (!showInactive && sku.status === 'inactive' && sku.physicalOnHandSmall === 0 && sku.preparingSmall === 0) {
        return false;
      }
      if (lineFilter !== 'all' && sku.productionLine !== lineFilter) return false;
      if (brandFilter !== 'all' && sku.brandOwnership !== brandFilter) return false;

      if (healthFilter === 'in_stock' && sku.physicalOnHandSmall <= 0) return false;
      if (healthFilter === 'low' && sku.healthStatus !== 'low') return false;
      if (healthFilter === 'out_or_negative' && sku.healthStatus !== 'out' && sku.healthStatus !== 'negative') return false;
      if (healthFilter === 'has_preparing' && sku.preparingSmall <= 0) return false;
      if (healthFilter === 'has_pipeline' && sku.pendingTransferSmall <= 0 && sku.stagedOnFloorSmall <= 0) return false;

      if (q) {
        const optionMatch = (sku.optionsBreakdown || []).some(
          (o) => (o.optionCode || '').toLowerCase().includes(q) || (o.nameAr || '').toLowerCase().includes(q)
        );
        const matches =
          sku.code.toLowerCase().includes(q) ||
          (sku.nameAr || '').toLowerCase().includes(q) ||
          (sku.nameEn || '').toLowerCase().includes(q) ||
          (sku.shortName || '').toLowerCase().includes(q) ||
          optionMatch;
        if (!matches) return false;
      }

      return true;
    });
  }, [skuList, showInactive, lineFilter, brandFilter, healthFilter, searchTerm]);

  const toggleExpandSku = (code) => {
    setExpandedSkus((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const toggleOptionMovements = (optionKey) => {
    setExpandedOptionMovements((prev) => ({ ...prev, [optionKey]: !prev[optionKey] }));
  };

  // CSV Export Handler (Strictly Units, NO Tons/Weight)
  const handleExportCsv = () => {
    if (!canExport) return;
    const headers = [
      'SKU Code',
      'Product Name (AR)',
      'Product Name (EN)',
      'Production Line',
      'Brand',
      'Ratio',
      'Period Start',
      'Period End',
      'Opening (Cartons)',
      'Opening (Units)',
      'FG Inward (Cartons)',
      'FG Inward (Units)',
      'Sales Returns (Cartons)',
      'Faulty Pull (Cartons)',
      'Sales Dispatched (Cartons)',
      'Physical On-Hand (Cartons)',
      'Physical On-Hand (Units)',
      'Preparing / Committed (Cartons)',
      'Preparing / Committed (Units)',
      'Net Available (Cartons)',
      'Net Available (Units)',
      'Pending Inward (Cartons)',
      'Staged on Floor (Cartons)',
      'Reorder Level (Units)',
      'Health Status',
    ];
    if (canViewPrices) headers.push('Avg Cost / Carton (EGP)');
    if (canViewTotals) headers.push('Stock Value (EGP)');

    const rows = filteredSkus.map((s) => {
      const cat = categoryMap[s.productionLine];
      const base = [
        s.code,
        s.nameAr,
        s.nameEn,
        cat ? (isAr ? cat.nameAr : cat.nameEn) : s.productionLine,
        s.brandOwnership === 'private_label' ? 'Private Label' : 'Al-Tawoos',
        s.packagingRatio,
        periodStartDate || 'All',
        periodEndDate || 'Live',
        s.openingLarge,
        s.openingSmall,
        s.producedInLarge,
        s.producedInSmall,
        s.salesReturnedInLarge,
        s.faultyOutLarge,
        s.dispatchedOutLarge,
        s.physicalOnHandLarge,
        s.physicalOnHandSmall,
        s.preparingLarge,
        s.preparingSmall,
        s.netAvailableLarge,
        s.netAvailableSmall,
        s.pendingTransferLarge,
        s.stagedOnFloorLarge,
        s.reorderLevel,
        s.healthStatus,
      ];
      if (canViewPrices) base.push(s.avgCostPerLarge);
      if (canViewTotals) base.push(s.stockValue);
      return base
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FG_Stock_Balances_${periodStartDate || 'All'}_${periodEndDate || new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Kardex Target & Period Calculations
  const kardexTarget = kardexSkuCode ? skuMap[kardexSkuCode] || null : null;

  const kardexSummary = useMemo(() => {
    if (!kardexTarget) {
      return {
        filtered: [],
        periodOpeningSmall: 0,
        periodOpeningLarge: 0,
        periodInSmall: 0,
        periodInLarge: 0,
        periodOutSmall: 0,
        periodOutLarge: 0,
        periodClosingSmall: 0,
        periodClosingLarge: 0,
      };
    }

    const baseMovements =
      kardexOptionFilter === 'all'
        ? kardexTarget.movements || []
        : (kardexTarget.optionsBreakdown || []).find((o) => o.suffix === kardexOptionFilter)?.movements || [];

    let priorSmall = 0;
    let priorLarge = 0;
    if (kardexStartDate) {
      const prior = baseMovements.filter((m) => (m.date || '') < kardexStartDate);
      if (prior.length > 0) {
        priorSmall = prior[prior.length - 1].runningSmall;
        priorLarge = prior[prior.length - 1].runningLarge;
      }
    }

    const filtered = baseMovements.filter((m) => {
      if (kardexStartDate && (m.date || '') < kardexStartDate) return false;
      if (kardexEndDate && (m.date || '') > kardexEndDate) return false;
      if (kardexTypeFilter !== 'all' && m.type !== kardexTypeFilter) return false;
      return true;
    });

    let inSmall = 0;
    let inLarge = 0;
    let outSmall = 0;
    let outLarge = 0;
    filtered.forEach((m) => {
      inSmall += Number(m.qtyInSmall || 0);
      inLarge += Number(m.qtyInLarge || 0);
      outSmall += Number(m.qtyOutSmall || 0);
      outLarge += Number(m.qtyOutLarge || 0);
    });

    const closingSmall =
      filtered.length > 0 && kardexTypeFilter === 'all'
        ? filtered[filtered.length - 1].runningSmall
        : Math.round((priorSmall + inSmall - outSmall) * 1000) / 1000;
    const closingLarge =
      filtered.length > 0 && kardexTypeFilter === 'all'
        ? filtered[filtered.length - 1].runningLarge
        : Math.round((priorLarge + inLarge - outLarge) * 1000) / 1000;

    return {
      filtered,
      periodOpeningSmall: priorSmall,
      periodOpeningLarge: priorLarge,
      periodInSmall: Math.round(inSmall * 1000) / 1000,
      periodInLarge: Math.round(inLarge * 1000) / 1000,
      periodOutSmall: Math.round(outSmall * 1000) / 1000,
      periodOutLarge: Math.round(outLarge * 1000) / 1000,
      periodClosingSmall: closingSmall,
      periodClosingLarge: closingLarge,
    };
  }, [kardexTarget, kardexStartDate, kardexEndDate, kardexTypeFilter, kardexOptionFilter]);

  const handleOpenKardex = (skuCode, optionSuffix = 'all') => {
    if (!canViewKardex) return;
    setKardexSkuCode(skuCode);
    setKardexTypeFilter('all');
    setKardexOptionFilter(optionSuffix || 'all');
    setKardexStartDate(periodStartDate || '');
    setKardexEndDate(periodEndDate || '');
  };

  const handlePrintKardex = () => {
    if (!kardexTarget || !canPrintKardex) return;
    const prevTitle = document.title;
    document.title = `FG-Kardex-${kardexTarget.code}`;
    try {
      window.print();
    } catch (e) {
      console.warn('Print failed:', e);
    }
    setTimeout(() => {
      document.title = prevTitle;
    }, 800);
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <PeacockLoader message={isAr ? 'جاري احتساب أرصدة المنتج التام وحركاتها...' : 'Computing Finished Goods SSOT Stock...'} />
      </div>
    );
  }

  const hasPeriodFilter = Boolean(periodStartDate || periodEndDate);

  return (
    <div className="space-y-4 pb-12" dir={isAr ? 'rtl' : 'ltr'}>
      {/* KPI Summary Strip (Strictly Cartons & Small Units — NO Weight / Tons) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 print:hidden">
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
            <span>{isAr ? 'المنتجات التامة' : 'Total SKUs'}</span>
            <Boxes className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-xl font-black text-slate-900 font-mono">{totals.activeSkus}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold">
            {totals.lowStockCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                {totals.lowStockCount} {isAr ? 'منخفض' : 'Low'}
              </span>
            )}
            {totals.outOrNegativeCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                {totals.outOrNegativeCount} {isAr ? 'نفذ/سالب' : 'Out/Neg'}
              </span>
            )}
            {totals.lowStockCount === 0 && totals.outOrNegativeCount === 0 && (
              <span className="text-emerald-600">{isAr ? 'كل الأصناف متزنة' : 'All healthy'}</span>
            )}
          </div>
        </div>

        <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 mb-1">
            <span>{hasPeriodFilter ? (isAr ? 'الرصيد بنهاية الفترة' : 'Period Closing Stock') : (isAr ? 'الرصيد الفعلي بالمخزن' : 'Physical FG On-Hand')}</span>
            <PackageCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-950 font-mono">
            {fmtNum(totals.physicalOnHandLarge)}{' '}
            <span className="text-xs font-bold text-emerald-700">{isAr ? 'كرتونة' : 'Ctn'}</span>
          </div>
          <div className="text-[11px] font-bold text-emerald-700 font-mono mt-0.5">
            {fmtNum(totals.physicalOnHandSmall, 0)} {isAr ? 'عبوة/وحدة صغرى' : 'Units'}
          </div>
        </div>

        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-amber-800 mb-1">
            <span>{isAr ? 'جاري التجهيز (محجوز)' : 'Preparing / Committed'}</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-950 font-mono">
            {fmtNum(totals.preparingLarge)}{' '}
            <span className="text-xs font-bold text-amber-700">{isAr ? 'كرتونة' : 'Ctn'}</span>
          </div>
          <div className="text-[11px] font-bold text-amber-700 font-mono mt-0.5">
            {fmtNum(totals.preparingSmall, 0)} {isAr ? 'عبوة' : 'Units'}
          </div>
        </div>

        <div className="bg-indigo-50/70 rounded-2xl border border-indigo-200 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-indigo-800 mb-1">
            <span>{isAr ? 'الصافي المتاح للبيع' : 'Net Available'}</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-indigo-950 font-mono">
            {fmtNum(totals.netAvailableLarge)}{' '}
            <span className="text-xs font-bold text-indigo-700">{isAr ? 'كرتونة' : 'Ctn'}</span>
          </div>
          <div className="text-[11px] font-bold text-indigo-700 font-mono mt-0.5">
            {fmtNum(totals.netAvailableSmall, 0)} {isAr ? 'عبوة' : 'Units'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
            <span>{isAr ? 'تحت التحويل / الصالة' : 'Pipeline (In-Transit / Floor)'}</span>
            <Factory className="h-4 w-4 text-sky-600" />
          </div>
          <div className="text-sm font-black text-sky-900 font-mono">
            +{fmtNum(totals.pendingTransferLarge)} <span className="text-[10px] font-bold text-sky-700">{isAr ? 'قيد الاستلام' : 'Pending'}</span>
          </div>
          <div className="text-xs font-bold text-slate-600 font-mono mt-1">
            +{fmtNum(totals.stagedOnFloorLarge)} <span className="text-[10px] font-semibold">{isAr ? 'على أرض الصالة' : 'On Floor'}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
            <span>{isAr ? 'قيمة المخزون التام' : 'FG Stock Valuation'}</span>
            {!canViewTotals && <Lock className="h-3.5 w-3.5 text-slate-400" />}
          </div>
          {canViewTotals ? (
            <>
              <div className="text-lg font-black text-slate-900 font-mono">
                {fmtNum(totals.totalStockValue, 2)}{' '}
                <span className="text-[10px] font-bold text-slate-500">EGP</span>
              </div>
              <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                {isAr ? 'بحسب متوسط تكلفة البالتات' : 'Based on pallet cost avg'}
              </div>
            </>
          ) : (
            <div className="text-base font-black text-slate-400 font-mono mt-1">••••••</div>
          )}
        </div>
      </div>

      {/* Filters, Period Selection & Actions Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'ابحث باسم المنتج التام، كود الصنف، أو خيار التعبئة...' : 'Search by product name, SKU, or option...'}
              className="w-full ps-9 pe-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:border-emerald-500 outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-800"
            >
              <option value="all">{isAr ? 'كل خطوط الإنتاج' : 'All Production Lines'}</option>
              {categories.map((cat) => (
                <option key={cat.key || cat.id} value={cat.key || cat.id}>
                  {isAr ? cat.nameAr : cat.nameEn || cat.nameAr}
                </option>
              ))}
            </select>

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-800"
            >
              <option value="all">{isAr ? 'كل العلامات التجارية' : 'All Brands'}</option>
              <option value="own_brand">{isAr ? 'الطاووس (Own Brand)' : 'Al-Tawoos (Own Brand)'}</option>
              <option value="private_label">{isAr ? 'تصنيع للغير (Private Label)' : 'Private Label'}</option>
            </select>

            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-800"
            >
              <option value="all">{isAr ? 'كل حالات المخزون' : 'All Stock Health'}</option>
              <option value="in_stock">{isAr ? 'متاح فقط (> 0)' : 'In Stock Only (> 0)'}</option>
              <option value="low">{isAr ? 'وصل لحد إعادة الطلب' : 'Low Stock Alert'}</option>
              <option value="out_or_negative">{isAr ? 'رصيد صفري أو سالب' : 'Out / Negative Stock'}</option>
              <option value="has_preparing">{isAr ? 'عليه أوامر تجهيز (Prepare)' : 'Has Preparing Orders'}</option>
              <option value="has_pipeline">{isAr ? 'له رصيد قيد التحويل / الصالة' : 'Has Pipeline Stock'}</option>
            </select>

            <label className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>{isAr ? 'إظهار المعطل الصفرية' : 'Show Zero Inactive'}</span>
            </label>

            {canExport && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Period Selection Strip */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-extrabold text-slate-700">
              <Calendar className="h-3.5 w-3.5 text-teal-700" />
              <span>{isAr ? 'فترة عرض الأرصدة والحركة:' : 'Balance Period:'}</span>
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? 'من:' : 'From:'}</span>
              <input
                type="date"
                value={periodStartDate}
                onChange={(e) => setPeriodStartDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-slate-50 font-mono text-xs font-bold text-slate-800 focus:bg-white focus:border-teal-600 outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? 'إلى:' : 'To:'}</span>
              <input
                type="date"
                value={periodEndDate}
                onChange={(e) => setPeriodEndDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-slate-50 font-mono text-xs font-bold text-slate-800 focus:bg-white focus:border-teal-600 outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 ms-1">
              {[
                { id: 'all', labelAr: 'الكل (الحالي)', labelEn: 'All (Live)' },
                { id: 'today', labelAr: 'اليوم', labelEn: 'Today' },
                { id: 'last7', labelAr: 'آخر 7 أيام', labelEn: '7 Days' },
                { id: 'last30', labelAr: 'آخر 30 يوم', labelEn: '30 Days' },
                { id: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
              ].map((p) => {
                const isActivePreset = p.id === 'all' && !hasPeriodFilter;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPeriodPreset(p.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      isActivePreset
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {isAr ? p.labelAr : p.labelEn}
                  </button>
                );
              })}

              {hasPeriodFilter && (
                <button
                  type="button"
                  onClick={() => applyPeriodPreset('all')}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold transition cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{isAr ? 'مسح الفترة' : 'Clear'}</span>
                </button>
              )}
            </div>
          </div>

          {hasPeriodFilter && (
            <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
              {isAr
                ? `يتم احتساب افتتاحي ما قبل (${periodStartDate || 'البداية'}) وصافي حركات الفترة حتى (${periodEndDate || 'الآن'})`
                : `Period Carry-Forward Opening (< ${periodStartDate || 'start'}) + Net Activity (<= ${periodEndDate || 'now'})`}
            </span>
          )}
        </div>
      </div>

      {/* Main FG Balances Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] font-extrabold">
                <th className="py-3 px-3 text-start w-10">#</th>
                <th className="py-3 px-3 text-start">{isAr ? 'المنتج التام' : 'Finished Good'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'الشدة' : 'Pack'}</th>
                <th className="py-3 px-3 text-center bg-emerald-950/60">
                  {hasPeriodFilter ? (isAr ? 'رصيد نهاية الفترة' : 'Period Closing') : (isAr ? 'الرصيد الفعلي بالمخزن' : 'Physical On-Hand')}
                </th>
                <th className="py-3 px-3 text-center bg-amber-950/50">{isAr ? 'تحت التجهيز' : 'Preparing'}</th>
                <th className="py-3 px-3 text-center bg-indigo-950/60">{isAr ? 'الصافي المتاح' : 'Net Available'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'تحويل / صالة' : 'Pipeline'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'الحالة' : 'Health'}</th>
                <th className="py-3 px-3 text-end">{isAr ? 'التكلفة / القيمة' : 'Cost / Value'}</th>
                <th className="py-3 px-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSkus.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-bold">
                    {isAr ? 'لا توجد منتجات مطابقة لفلاتر البحث الحالية.' : 'No finished goods match current filters.'}
                  </td>
                </tr>
              ) : (
                filteredSkus.map((sku) => {
                  const isExpanded = Boolean(expandedSkus[sku.code]);
                  const cat = categoryMap[sku.productionLine];
                  const hasPipeline = sku.pendingTransferSmall > 0 || sku.stagedOnFloorSmall > 0;
                  const displayName = isAr ? sku.nameAr : sku.nameEn || sku.nameAr;

                  return (
                    <React.Fragment key={sku.code}>
                      <tr
                        onClick={() => toggleExpandSku(sku.code)}
                        className={`cursor-pointer transition-colors ${
                          sku.healthStatus === 'negative'
                            ? 'bg-rose-50/40 hover:bg-rose-50/80'
                            : sku.healthStatus === 'low'
                            ? 'bg-amber-50/30 hover:bg-amber-50/60'
                            : 'hover:bg-slate-50/90'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-100 text-slate-600">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                        </td>

                        {/* Product Name Prominent, Image if exists, SKU ID Subtle */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            {sku.imageFile && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setImagePreview({ src: sku.imageFile, title: displayName, code: sku.code });
                                }}
                                className="w-10 h-10 rounded-xl bg-white border border-slate-200 p-0.5 shrink-0 overflow-hidden shadow-2xs hover:border-teal-500 transition"
                                title={isAr ? 'اضغط لتكبير الصورة' : 'Click to enlarge'}
                              >
                                <img
                                  src={sku.imageFile}
                                  alt={displayName}
                                  className="w-full h-full object-contain rounded-lg"
                                />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-extrabold text-slate-900 text-xs leading-snug">
                                {displayName}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="text-[10px] font-mono text-slate-400 font-medium">
                                  {sku.code}
                                </span>
                                {cat && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    {isAr ? cat.nameAr : cat.nameEn || cat.nameAr}
                                  </span>
                                )}
                                {sku.brandOwnership === 'private_label' && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                    Private Label
                                  </span>
                                )}
                                {sku.status === 'inactive' && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                                    {isAr ? 'معطل' : 'Inactive'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                          <div>1 × {sku.packagingRatio}</div>
                          <div className="text-[10px] text-slate-500">{sku.largeUnitName} / {sku.smallUnit}</div>
                        </td>

                        {/* Physical On-Hand (Cartons + Small Units) */}
                        <td className="py-3 px-3 text-center bg-emerald-50/40">
                          <div className={`font-mono font-black text-sm ${sku.physicalOnHandSmall < 0 ? 'text-rose-700' : 'text-emerald-950'}`}>
                            {fmtNum(sku.physicalOnHandLarge)}{' '}
                            <span className="text-[10px] font-bold text-emerald-700">{sku.largeUnitName}</span>
                          </div>
                          <div className="font-mono text-[11px] font-bold text-slate-600">
                            {fmtNum(sku.physicalOnHandSmall, 0)} {sku.smallUnit}
                          </div>
                        </td>

                        {/* Preparing / Committed */}
                        <td className="py-3 px-3 text-center bg-amber-50/30">
                          {sku.preparingSmall > 0 ? (
                            <>
                              <div className="font-mono font-black text-sm text-amber-800">
                                {fmtNum(sku.preparingLarge)}{' '}
                                <span className="text-[10px] font-bold">{sku.largeUnitName}</span>
                              </div>
                              <div className="font-mono text-[11px] font-bold text-amber-700">
                                {fmtNum(sku.preparingSmall, 0)} {sku.smallUnit}
                                {sku.preparingOrders.length > 0 && ` (${sku.preparingOrders.length})`}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        {/* Net Available */}
                        <td className="py-3 px-3 text-center bg-indigo-50/35">
                          <div
                            className={`font-mono font-black text-sm ${
                              sku.netAvailableSmall < 0
                                ? 'text-rose-700'
                                : sku.netAvailableSmall === 0
                                ? 'text-slate-400'
                                : 'text-indigo-950'
                            }`}
                          >
                            {fmtNum(sku.netAvailableLarge)}{' '}
                            <span className="text-[10px] font-bold">{sku.largeUnitName}</span>
                          </div>
                          <div className="font-mono text-[11px] font-bold text-indigo-700">
                            {fmtNum(sku.netAvailableSmall, 0)} {sku.smallUnit}
                          </div>
                        </td>

                        {/* Pipeline: Pending Transfer + Staged on Floor */}
                        <td className="py-3 px-3 text-center">
                          {hasPipeline ? (
                            <div className="space-y-1">
                              {sku.pendingTransferLarge > 0 && (
                                <span className="inline-block px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 font-mono text-[10px] font-bold">
                                  +{fmtNum(sku.pendingTransferLarge)} {isAr ? 'قيد الاستلام' : 'Pending'}
                                </span>
                              )}
                              {sku.stagedOnFloorLarge > 0 && (
                                <span className="inline-block px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[10px] font-bold">
                                  +{fmtNum(sku.stagedOnFloorLarge)} {isAr ? 'صالة' : 'Floor'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        {/* Stock Health */}
                        <td className="py-3 px-3 text-center">
                          {sku.healthStatus === 'negative' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-extrabold">
                              <ShieldAlert className="h-3 w-3" />
                              {isAr ? 'رصيد سالب' : 'Negative'}
                            </span>
                          )}
                          {sku.healthStatus === 'out' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-300 text-[10px] font-extrabold">
                              {isAr ? 'نفذ الرصيد' : 'Out'}
                            </span>
                          )}
                          {sku.healthStatus === 'low' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold">
                              <AlertTriangle className="h-3 w-3" />
                              {isAr ? 'منخفض' : 'Low'}
                            </span>
                          )}
                          {sku.healthStatus === 'ok' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold">
                              <CheckCircle2 className="h-3 w-3" />
                              {isAr ? 'متزن' : 'Healthy'}
                            </span>
                          )}
                          {sku.reorderLevel > 0 && (
                            <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                              Min: {fmtNum(sku.reorderLevel, 0)}
                            </div>
                          )}
                        </td>

                        {/* Cost & Valuation (RBAC Masked) */}
                        <td className="py-3 px-3 text-end font-mono">
                          {canViewTotals ? (
                            <div className="font-extrabold text-slate-900 text-xs">
                              {sku.stockValue > 0 ? `${fmtNum(sku.stockValue, 2)} EGP` : '—'}
                            </div>
                          ) : (
                            <div className="text-slate-400 text-xs">••••</div>
                          )}
                          {canViewPrices ? (
                            <div className="text-[10px] text-slate-500">
                              {sku.avgCostPerLarge > 0 ? `${fmtNum(sku.avgCostPerLarge, 2)} / ${sku.largeUnitName}` : '—'}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">••••</div>
                          )}
                        </td>

                        {/* Actions: Kardex & Comment */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            {canViewKardex && (
                              <button
                                type="button"
                                onClick={() => handleOpenKardex(sku.code)}
                                title={isAr ? 'كارت الصنف وحركات المنتج (Kardex)' : 'Open Product Kardex'}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold text-[11px] transition cursor-pointer"
                              >
                                <History className="h-3.5 w-3.5" />
                                <span>{isAr ? 'الحركة' : 'Kardex'}</span>
                              </button>
                            )}
                            <RowCommentButton
                              docId={sku.code}
                              docNumber={sku.code}
                              tab="fg_balances"
                              module="production"
                            />
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDABLE DRILL-DOWN: Packaging Options with Full Parent-Parity Transaction Details */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={10} className="p-4 border-t border-slate-200">
                            <div className="space-y-4">
                              {/* Parent Summary Equation Strip */}
                              <TransactionEquationStrip
                                item={sku}
                                largeUnitName={sku.largeUnitName}
                                smallUnit={sku.smallUnit}
                                isAr={isAr}
                              />

                              {/* Packaging Options Breakdown (Full Parity with Parent Transactions) */}
                              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <div className="px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800">
                                  <div className="flex items-center gap-2">
                                    <Layers className="h-3.5 w-3.5 text-slate-600" />
                                    <span>{isAr ? 'تفصيل حركات وأرصدة كل خيار تعبئة وباركود / باليتة' : 'Per-Packaging Option Balances, Transactions & Lots'}</span>
                                  </div>
                                  <span className="text-[11px] text-slate-500 font-bold">
                                    {sku.optionsBreakdown.length} {isAr ? 'خيارات' : 'Options'}
                                  </span>
                                </div>

                                <div className="divide-y divide-slate-200">
                                  {sku.optionsBreakdown.map((opt) => {
                                    const optName = isAr ? opt.nameAr : opt.nameEn || opt.nameAr;
                                    const optMoveKey = `${sku.code}-${opt.suffix}`;
                                    const isOptMovementsOpen = Boolean(expandedOptionMovements[optMoveKey]);
                                    const optFilteredMovements = (opt.movements || []).filter((m) => {
                                      if (periodStartDate && (m.date || '') < periodStartDate) return false;
                                      if (periodEndDate && (m.date || '') > periodEndDate) return false;
                                      return true;
                                    });

                                    return (
                                      <div key={opt.optionCode} className="p-3.5 space-y-2.5 bg-white">
                                        {/* Option Header Row */}
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            {opt.imageFile && (
                                              <div
                                                onClick={() => setImagePreview({ src: opt.imageFile, title: `${displayName} — ${optName}`, code: opt.optionCode })}
                                                className="w-9 h-9 rounded-lg bg-white border border-slate-200 p-0.5 shrink-0 overflow-hidden cursor-pointer hover:border-teal-500 transition"
                                                title={isAr ? 'اضغط لتكبير الصورة' : 'Click to enlarge'}
                                              >
                                                <img
                                                  src={opt.imageFile}
                                                  alt={optName}
                                                  className="w-full h-full object-contain rounded"
                                                />
                                              </div>
                                            )}

                                            <div>
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-extrabold text-slate-900 text-xs">{optName}</span>
                                                <span className="text-[10px] font-mono text-slate-400 font-medium">
                                                  {opt.optionCode}
                                                </span>
                                                <span className="px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-600">
                                                  1 × {opt.packagingRatio}
                                                </span>
                                                {opt.isAnyPool && (
                                                  <span className="px-1.5 py-0.2 rounded bg-cyan-50 border border-cyan-200 text-[10px] font-bold text-cyan-800">
                                                    {isAr ? 'تخصيص مرن (Any)' : 'Flexible Allocation'}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Option KPI Pills & Action Buttons (Parity with Parent Row) */}
                                          <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
                                            <div className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 font-mono font-extrabold text-emerald-900">
                                              {isAr ? 'فعلي:' : 'On-Hand:'} {fmtNum(opt.physicalOnHandLarge)} {sku.largeUnitName}{' '}
                                              <span className="text-[10px] font-bold text-emerald-700">({fmtNum(opt.physicalOnHandSmall, 0)} {sku.smallUnit})</span>
                                            </div>

                                            {opt.preparingSmall > 0 && (
                                              <div className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 font-mono font-extrabold text-amber-800">
                                                {isAr ? 'تجهيز:' : 'Prep:'} {fmtNum(opt.preparingLarge)} ({fmtNum(opt.preparingSmall, 0)})
                                              </div>
                                            )}

                                            <div className={`px-2 py-1 rounded-lg border font-mono font-extrabold ${opt.netAvailableSmall < 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-indigo-50 border-indigo-200 text-indigo-900'}`}>
                                              {isAr ? 'متاح:' : 'Net:'} {fmtNum(opt.netAvailableLarge)} ({fmtNum(opt.netAvailableSmall, 0)})
                                            </div>

                                            {(opt.pendingTransferLarge > 0 || opt.stagedOnFloorLarge > 0) && (
                                              <div className="px-2 py-1 rounded-lg bg-sky-50 border border-sky-200 font-mono font-bold text-sky-800">
                                                {opt.pendingTransferLarge > 0 ? `+${fmtNum(opt.pendingTransferLarge)} ${isAr ? 'تحويل' : 'Pending'}` : ''}
                                                {opt.pendingTransferLarge > 0 && opt.stagedOnFloorLarge > 0 ? ' | ' : ''}
                                                {opt.stagedOnFloorLarge > 0 ? `+${fmtNum(opt.stagedOnFloorLarge)} ${isAr ? 'صالة' : 'Floor'}` : ''}
                                              </div>
                                            )}

                                            {canViewTotals && opt.stockValue > 0 && (
                                              <div className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono font-bold text-slate-800">
                                                {fmtNum(opt.stockValue, 2)} EGP
                                              </div>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() => toggleOptionMovements(optMoveKey)}
                                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold transition cursor-pointer"
                                            >
                                              {isOptMovementsOpen
                                                ? (isAr ? 'إخفاء الحركات' : 'Hide Movements')
                                                : (isAr ? `عرض الحركات (${optFilteredMovements.length})` : `Movements (${optFilteredMovements.length})`)}
                                            </button>

                                            {canViewKardex && (
                                              <button
                                                type="button"
                                                onClick={() => handleOpenKardex(sku.code, opt.suffix)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold transition cursor-pointer"
                                              >
                                                <History className="h-3 w-3" />
                                                <span>Kardex</span>
                                              </button>
                                            )}
                                          </div>
                                        </div>

                                        {/* Option-Level Transaction Equation Strip */}
                                        <TransactionEquationStrip
                                          item={opt}
                                          largeUnitName={sku.largeUnitName}
                                          smallUnit={sku.smallUnit}
                                          isAr={isAr}
                                          compact
                                        />

                                        {/* Option-Level Inline Movements Table (Same Transaction Detail as Parent Kardex) */}
                                        {isOptMovementsOpen && (
                                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/60">
                                            <table className="w-full text-[11px] border-collapse">
                                              <thead>
                                                <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                                                  <th className="py-1.5 px-2.5 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                                                  <th className="py-1.5 px-2.5 text-start">{isAr ? 'الحركة' : 'Type'}</th>
                                                  <th className="py-1.5 px-2.5 text-start">{isAr ? 'المستند' : 'Ref'}</th>
                                                  <th className="py-1.5 px-2.5 text-start">{isAr ? 'البيان' : 'Note'}</th>
                                                  <th className="py-1.5 px-2.5 text-center text-emerald-800">{isAr ? 'وارد (+)' : 'In (+)'}</th>
                                                  <th className="py-1.5 px-2.5 text-center text-rose-800">{isAr ? 'صادر (-)' : 'Out (-)'}</th>
                                                  <th className="py-1.5 px-2.5 text-center text-indigo-900">{isAr ? 'الرصيد' : 'Balance'}</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-200 bg-white">
                                                {optFilteredMovements.length === 0 ? (
                                                  <tr>
                                                    <td colSpan={7} className="py-4 text-center text-slate-400 font-bold">
                                                      {isAr ? 'لا توجد حركات لهذه التعبئة ضمن الفترة المحددة.' : 'No movements for this option in selected period.'}
                                                    </td>
                                                  </tr>
                                                ) : (
                                                  optFilteredMovements.map((m) => {
                                                    const meta = MOVEMENT_TYPE_META[m.type] || {
                                                      labelAr: m.type,
                                                      labelEn: m.type,
                                                      badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
                                                    };
                                                    return (
                                                      <tr key={m.id} className="hover:bg-slate-50">
                                                        <td className="py-1.5 px-2.5 font-mono text-slate-600">{m.date || '—'}</td>
                                                        <td className="py-1.5 px-2.5">
                                                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${meta.badgeClass}`}>
                                                            {isAr ? meta.labelAr : meta.labelEn}
                                                          </span>
                                                        </td>
                                                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800">{m.refNumber}</td>
                                                        <td className="py-1.5 px-2.5 text-slate-700">{isAr ? m.noteAr : m.noteEn}</td>
                                                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-emerald-700">
                                                          {m.qtyInLarge > 0 ? `+${fmtNum(m.qtyInLarge)}` : '—'}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-rose-700">
                                                          {m.qtyOutLarge > 0 ? `-${fmtNum(m.qtyOutLarge)}` : '—'}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-center font-mono font-black text-indigo-900 bg-indigo-50/30">
                                                          {fmtNum(m.runningLarge)} ({fmtNum(m.runningSmall, 0)})
                                                        </td>
                                                      </tr>
                                                    );
                                                  })
                                                )}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}

                                        {/* Option-Specific Received Pallets / OB Lots */}
                                        {opt.pallets.length > 0 && (
                                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-0.5">
                                            {opt.pallets.map((pal, pIdx) => (
                                              <div
                                                key={`${pal.palletId}-${pIdx}`}
                                                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                                              >
                                                <div className="min-w-0">
                                                  <div className="font-mono font-extrabold text-slate-800 truncate">
                                                    {pal.palletId}
                                                  </div>
                                                  <div className="text-[10px] text-slate-500 truncate">
                                                    {pal.orderNumber ? `${pal.orderNumber} • ` : ''}
                                                    {pal.batchRangeDisplay ? `Batch: ${pal.batchRangeDisplay}` : pal.acceptedAt || '—'}
                                                  </div>
                                                </div>
                                                <div className="text-end font-mono font-bold text-emerald-700 shrink-0 ms-2">
                                                  +{fmtNum(pal.qtyLarge)} {sku.largeUnitName}
                                                  <div className="text-[9px] text-slate-500">{fmtNum(pal.qtySmall, 0)} {sku.smallUnit}</div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Preparing / Committed Sales Orders */}
                              {sku.preparingOrders.length > 0 && (
                                <div className="bg-amber-50/50 rounded-xl border border-amber-200 overflow-hidden">
                                  <div className="px-3 py-2 bg-amber-100/70 border-b border-amber-200 flex items-center gap-2 text-xs font-extrabold text-amber-950">
                                    <Truck className="h-3.5 w-3.5 text-amber-700" />
                                    <span>{isAr ? `أوامر البيع قيد التجهيز والمرتبطة بهذا المنتج (${sku.preparingOrders.length})` : `Preparing Sales Orders (${sku.preparingOrders.length})`}</span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="bg-amber-50 text-amber-900 font-bold border-b border-amber-200">
                                          <th className="py-1.5 px-3 text-start">{isAr ? 'رقم الأمر' : 'Order #'}</th>
                                          <th className="py-1.5 px-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                                          <th className="py-1.5 px-3 text-start">{isAr ? 'العميل / الفرع' : 'Client / Branch'}</th>
                                          <th className="py-1.5 px-3 text-center">{isAr ? 'التعبئة' : 'Option'}</th>
                                          <th className="py-1.5 px-3 text-end">{isAr ? 'الكمية المحجوزة' : 'Committed Qty'}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-amber-200/60 bg-white">
                                        {sku.preparingOrders.map((po, idx) => (
                                          <tr key={`${po.orderId}-${idx}`}>
                                            <td className="py-1.5 px-3 font-mono font-extrabold text-slate-900">{po.orderNumber}</td>
                                            <td className="py-1.5 px-3 font-mono text-slate-600">{po.orderDate || '—'}</td>
                                            <td className="py-1.5 px-3 font-bold text-slate-800">
                                              {po.clientName || '—'}
                                              {po.branchName ? <span className="text-slate-500 font-normal"> ({po.branchName})</span> : null}
                                            </td>
                                            <td className="py-1.5 px-3 text-center font-mono">{po.optionSuffix}</td>
                                            <td className="py-1.5 px-3 text-end font-mono font-extrabold text-amber-800">
                                              {fmtNum(po.totalCartons)} {sku.largeUnitName} ({fmtNum(po.smallQty, 0)} {sku.smallUnit})
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
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

      {/* IMAGE PREVIEW LIGHTBOX */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-extrabold text-xs truncate">{imagePreview.title}</div>
                <div className="text-[10px] font-mono text-slate-400">{imagePreview.code}</div>
              </div>
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 bg-slate-50 flex items-center justify-center">
              <img
                src={imagePreview.src}
                alt={imagePreview.title}
                className="max-h-[65vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* KARDEX MOVEMENT LEDGER MODAL */}
      {kardexTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden print:shadow-none print:border-none print:max-h-none">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-900">
              <div className="flex items-center gap-3 min-w-0">
                {kardexTarget.imageFile && (
                  <div className="w-10 h-10 rounded-xl bg-white p-0.5 shrink-0 overflow-hidden print:hidden">
                    <img src={kardexTarget.imageFile} alt={kardexTarget.nameAr} className="w-full h-full object-contain rounded-lg" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black">
                      {isAr ? 'كارت حركة المنتج التام (FG Kardex)' : 'Finished Good Movement Kardex'} —{' '}
                      {isAr ? kardexTarget.nameAr : kardexTarget.nameEn || kardexTarget.nameAr}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">{kardexTarget.code}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5 print:text-slate-600">
                    {isAr
                      ? `الوحدة الكبرى: ${kardexTarget.largeUnitName} (${kardexTarget.packagingRatio} ${kardexTarget.smallUnit}) | الرصيد الفعلي: ${fmtNum(kardexTarget.physicalOnHandLarge)} ${kardexTarget.largeUnitName}`
                      : `Pack: 1 ${kardexTarget.largeUnitName} = ${kardexTarget.packagingRatio} ${kardexTarget.smallUnit} | On-Hand: ${fmtNum(kardexTarget.physicalOnHandLarge)} ${kardexTarget.largeUnitName}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 print:hidden">
                {canPrintKardex && (
                  <button
                    type="button"
                    onClick={handlePrintKardex}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>{isAr ? 'طباعة' : 'Print'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setKardexSkuCode(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Kardex Filters */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2.5 text-xs print:hidden">
              <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                <Filter className="h-3.5 w-3.5" />
                <span>{isAr ? 'تصفية:' : 'Filter:'}</span>
              </div>

              <select
                value={kardexTypeFilter}
                onChange={(e) => setKardexTypeFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-bold text-slate-800"
              >
                <option value="all">{isAr ? 'كل أنواع الحركات' : 'All Movement Types'}</option>
                {Object.entries(MOVEMENT_TYPE_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {isAr ? meta.labelAr : meta.labelEn}
                  </option>
                ))}
              </select>

              <select
                value={kardexOptionFilter}
                onChange={(e) => setKardexOptionFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-bold text-slate-800"
              >
                <option value="all">{isAr ? 'كل خيارات التعبئة' : 'All Options'}</option>
                {(kardexTarget.optionsBreakdown || []).map((o) => (
                  <option key={o.suffix} value={o.suffix}>
                    {isAr ? o.nameAr : o.nameEn || o.nameAr} ({o.optionCode})
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={kardexStartDate}
                onChange={(e) => setKardexStartDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-800"
              />
              <span className="text-slate-400 font-bold">→</span>
              <input
                type="date"
                value={kardexEndDate}
                onChange={(e) => setKardexEndDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-800"
              />

              {(kardexTypeFilter !== 'all' || kardexOptionFilter !== 'all' || kardexStartDate || kardexEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setKardexTypeFilter('all');
                    setKardexOptionFilter('all');
                    setKardexStartDate('');
                    setKardexEndDate('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{isAr ? 'إعادة' : 'Reset'}</span>
                </button>
              )}
            </div>

            {/* Period KPI Summary */}
            <div className="px-5 py-3 bg-white border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500">{isAr ? 'رصيد أول الفترة' : 'Period Opening'}</div>
                <div className="font-mono font-black text-slate-900 mt-0.5">
                  {fmtNum(kardexSummary.periodOpeningLarge)} {kardexTarget.largeUnitName}
                  <span className="text-[10px] text-slate-500 ms-1">({fmtNum(kardexSummary.periodOpeningSmall, 0)} {kardexTarget.smallUnit})</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-700">{isAr ? 'إجمالي الوارد (+)' : 'Total Inward (+)'}</div>
                <div className="font-mono font-black text-emerald-900 mt-0.5">
                  +{fmtNum(kardexSummary.periodInLarge)} {kardexTarget.largeUnitName}
                  <span className="text-[10px] text-emerald-700 ms-1">({fmtNum(kardexSummary.periodInSmall, 0)} {kardexTarget.smallUnit})</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <div className="text-[10px] font-bold text-rose-700">{isAr ? 'إجمالي المنصرف (-)' : 'Total Outward (-)'}</div>
                <div className="font-mono font-black text-rose-900 mt-0.5">
                  -{fmtNum(kardexSummary.periodOutLarge)} {kardexTarget.largeUnitName}
                  <span className="text-[10px] text-rose-700 ms-1">({fmtNum(kardexSummary.periodOutSmall, 0)} {kardexTarget.smallUnit})</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="text-[10px] font-bold text-indigo-700">{isAr ? 'رصيد آخر الفترة' : 'Closing Balance'}</div>
                <div className="font-mono font-black text-indigo-950 mt-0.5">
                  {fmtNum(kardexSummary.periodClosingLarge)} {kardexTarget.largeUnitName}
                  <span className="text-[10px] text-indigo-700 ms-1">({fmtNum(kardexSummary.periodClosingSmall, 0)} {kardexTarget.smallUnit})</span>
                </div>
              </div>
            </div>

            {/* Kardex Table */}
            <div className="flex-1 overflow-y-auto p-5">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-extrabold text-[11px]">
                    <th className="py-2 px-2.5 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-2 px-2.5 text-start">{isAr ? 'نوع الحركة' : 'Type'}</th>
                    <th className="py-2 px-2.5 text-start">{isAr ? 'المستند / التعبئة' : 'Ref / Option'}</th>
                    <th className="py-2 px-2.5 text-start">{isAr ? 'البيان' : 'Description'}</th>
                    <th className="py-2 px-2.5 text-center text-emerald-800">{isAr ? 'وارد (+)' : 'In (+)'}</th>
                    <th className="py-2 px-2.5 text-center text-rose-800">{isAr ? 'صادر (-)' : 'Out (-)'}</th>
                    <th className="py-2 px-2.5 text-center text-indigo-900">{isAr ? 'الرصيد التراكمي' : 'Running Balance'}</th>
                    <th className="py-2 px-2.5 text-start">{isAr ? 'بواسطة' : 'Actor'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {kardexSummary.filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">
                        {isAr ? 'لا توجد حركات مسجلة في هذه الفترة.' : 'No movements found in selected range.'}
                      </td>
                    </tr>
                  ) : (
                    kardexSummary.filtered.map((m) => {
                      const meta = MOVEMENT_TYPE_META[m.type] || {
                        labelAr: m.type,
                        labelEn: m.type,
                        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
                      };
                      return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">{m.date || '—'}</td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${meta.badgeClass}`}>
                              {isAr ? meta.labelAr : meta.labelEn}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold text-slate-900">
                            <div>{m.refNumber}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{m.optionCode}</div>
                          </td>
                          <td className="py-2 px-2.5 text-slate-700 font-semibold">
                            <div>{isAr ? m.noteAr : m.noteEn}</div>
                            {m.batchOrLot && <div className="text-[10px] text-slate-500 font-mono">{m.batchOrLot}</div>}
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-emerald-700">
                            {m.qtyInLarge > 0 ? (
                              <>
                                <div>+{fmtNum(m.qtyInLarge)}</div>
                                <div className="text-[10px] text-emerald-600">({fmtNum(m.qtyInSmall, 0)})</div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-rose-700">
                            {m.qtyOutLarge > 0 ? (
                              <>
                                <div>-{fmtNum(m.qtyOutLarge)}</div>
                                <div className="text-[10px] text-rose-600">({fmtNum(m.qtyOutSmall, 0)})</div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono font-black text-indigo-950 bg-indigo-50/40">
                            <div>{fmtNum(m.runningLarge)} {kardexTarget.largeUnitName}</div>
                            <div className="text-[10px] text-indigo-700">({fmtNum(m.runningSmall, 0)} {kardexTarget.smallUnit})</div>
                          </td>
                          <td className="py-2 px-2.5 text-[11px] font-bold text-slate-600">{m.actor}</td>
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
    </div>
  );
}
