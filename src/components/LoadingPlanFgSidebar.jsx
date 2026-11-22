import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  Search,
  AlertTriangle,
  CheckCircle2,
  Factory,
  RotateCcw,
  PackageCheck,
  Clock,
  Layers,
  Users,
} from 'lucide-react';
import { buildLoadingPlanFgForecast } from '../utils/fgStockEngine';

function fmtCtn(val) {
  const n = Number(val || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function LoadingPlanFgSidebar({
  finishedProducts = [],
  stagedPallets = [],
  stockTransfers = [],
  faultyReturns = [],
  salesOrders = [],
  workOrders = [],
  truckDispatches = [],
  stagedAssignments = {},
  targetPlanningDate = '',
  todayStr = '',
  isAr = true,
  isOpen: controlledIsOpen,
  onToggleOpen,
  drawerWidth = 355,
}) {
  // Default collapsed as requested; supports controlled parent state for push-layout
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = typeof controlledIsOpen === 'boolean' ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (next) => {
    const resolved = typeof next === 'function' ? next(isOpen) : next;
    if (typeof onToggleOpen === 'function') onToggleOpen(resolved);
    else setInternalIsOpen(resolved);
  };
  const [viewMode, setViewMode] = useState('sku'); // 'sku' | 'packing'
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'deficits' | 'active_orders'
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedKeys, setExpandedKeys] = useState({});
  const [headerBottom, setHeaderBottom] = useState(57);

  // Measure sticky TopNavbar bottom edge so the overlay drawer starts cleanly right after the header bar
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const measureHeader = () => {
      const headerEl = document.querySelector('header');
      if (!headerEl) return;
      const bottom = Math.max(0, Math.round(headerEl.getBoundingClientRect().bottom));
      setHeaderBottom((prev) => (prev !== bottom ? bottom : prev));
    };

    measureHeader();
    window.addEventListener('resize', measureHeader);
    window.addEventListener('scroll', measureHeader, { passive: true });

    const headerEl = document.querySelector('header');
    let ro = null;
    if (headerEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measureHeader);
      ro.observe(headerEl);
    }

    return () => {
      window.removeEventListener('resize', measureHeader);
      window.removeEventListener('scroll', measureHeader);
      if (ro) ro.disconnect();
    };
  }, [isOpen]);

  const { skuRows, packingRows, summary } = useMemo(() => {
    return buildLoadingPlanFgForecast({
      finishedProducts,
      stagedPallets,
      stockTransfers,
      faultyReturns,
      salesOrders,
      workOrders,
      truckDispatches,
      stagedAssignments,
      targetPlanningDate,
      todayStr,
    });
  }, [
    finishedProducts,
    stagedPallets,
    stockTransfers,
    faultyReturns,
    salesOrders,
    workOrders,
    truckDispatches,
    stagedAssignments,
    targetPlanningDate,
    todayStr,
  ]);

  const activeRows = viewMode === 'packing' ? packingRows : skuRows;

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return activeRows.filter((row) => {
      if (quickFilter === 'deficits' && row.deficitCartons <= 0 && !row.hasOptionDeficit) return false;
      if (
        quickFilter === 'active_orders' &&
        row.preparingCartons + row.orderedCartons <= 0 &&
        row.deficitCartons <= 0
      ) {
        return false;
      }
      if (q) {
        const clientMatch =
          row.preparingClients.some((c) => c.clientName.toLowerCase().includes(q)) ||
          row.orderedClients.some((c) => c.clientName.toLowerCase().includes(q));
        const match =
          (row.nameAr || '').toLowerCase().includes(q) ||
          (row.nameEn || '').toLowerCase().includes(q) ||
          (row.code || '').toLowerCase().includes(q) ||
          (row.optionCode || '').toLowerCase().includes(q) ||
          clientMatch;
        if (!match) return false;
      }
      return true;
    });
  }, [activeRows, quickFilter, searchTerm]);

  const toggleExpandRow = (key) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const directDeficitCount = useMemo(
    () => skuRows.filter((r) => r.deficitCartons > 0).length,
    [skuRows]
  );
  const packingMismatchCount = useMemo(
    () => skuRows.filter((r) => r.deficitCartons <= 0 && r.hasOptionDeficit).length,
    [skuRows]
  );

  return (
    <>
      {/* COLLAPSED PERSISTENT EDGE HANDLE (Normal styling + floating pulsing alert icons) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={isAr ? 'فتح لوحة أرصدة المنتج التام والعجز' : 'Open FG Stock & Deficit Sidebar'}
          className="fixed end-0 top-1/2 -translate-y-1/2 z-40 print:hidden flex flex-col items-center gap-2 py-3 px-2.5 rounded-s-2xl bg-white hover:bg-slate-50 text-slate-700 border border-e-0 border-slate-200/95 shadow-[0_6px_22px_rgba(15,23,42,0.12)] transition-all cursor-pointer group"
        >
          {/* Floating Pulsing Alert Count Badges */}
          {(directDeficitCount > 0 || packingMismatchCount > 0) && (
            <div className="absolute -top-3 -start-2.5 flex flex-col items-center gap-1 pointer-events-none">
              {directDeficitCount > 0 && (
                <span
                  title={isAr ? `${directDeficitCount} أصناف بها عجز` : `${directDeficitCount} SKUs in deficit`}
                  className="relative min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full bg-rose-600 text-white text-xs font-black font-mono leading-none shadow-md ring-2 ring-white"
                >
                  <span className="animate-ping absolute inset-0 rounded-full bg-rose-400 opacity-75" />
                  <span className="relative z-10">{directDeficitCount}</span>
                </span>
              )}
              {packingMismatchCount > 0 && (
                <span
                  title={isAr ? `${packingMismatchCount} أصناف بها عجز تعبئة` : `${packingMismatchCount} SKU(s) with packing shortfall`}
                  className="relative min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-black font-mono leading-none shadow-md ring-2 ring-white"
                >
                  <span className="animate-ping absolute inset-0 rounded-full bg-amber-400 opacity-75" />
                  <span className="relative z-10">{packingMismatchCount}</span>
                </span>
              )}
            </div>
          )}

          <Boxes className="w-4 h-4 text-teal-600 group-hover:scale-105 transition-transform" />
          <span
            className={`text-[10px] font-extrabold tracking-wide text-slate-700 whitespace-nowrap ${
              isAr ? 'rotate-180' : ''
            }`}
            style={{ writingMode: 'vertical-rl' }}
          >
            {isAr ? 'أرصدة التام' : 'FG Stock'}
          </span>
          {isAr ? (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
          )}
        </button>
      )}

      {/* EXPANDED PUSH/OVERLAY DRAWER ON OPPOSITE EDGE (Starts after top header bar) */}
      {isOpen && (
        <aside
          dir={isAr ? 'rtl' : 'ltr'}
          style={{ top: `${headerBottom}px`, bottom: 0, width: `${drawerWidth}px` }}
          className="fixed end-0 z-40 max-w-[92vw] bg-white border-s border-slate-300 shadow-2xl flex flex-col print:hidden animate-in fade-in duration-150"
        >
          {/* Compact Top Header */}
          <div className="px-3.5 py-2.5 bg-slate-900 text-white shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Boxes className="w-4 h-4 text-teal-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-black truncate">
                    {isAr ? 'رصيد المنتج التام للتحميل' : 'Loading FG Stock & Deficits'}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-300 font-mono">
                    <span>{summary.targetPlanningDate}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-sans font-bold ${
                        summary.isFutureTarget
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      }`}
                    >
                      {summary.isFutureTarget
                        ? isAr
                          ? 'افتتاحي تقديري'
                          : 'Est. Future'
                        : isAr
                        ? 'مباشر اليوم'
                        : 'Live Today'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
                title={isAr ? 'طي اللوحة' : 'Collapse Sidebar'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary KPI Micro-Pills */}
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <div
                className={`px-2 py-1 rounded-lg border font-bold text-center ${
                  summary.deficitSkuCount > 0
                    ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <div className="font-mono font-black text-xs">{summary.deficitSkuCount}</div>
                <div className="truncate">{isAr ? 'أصناف عجز' : 'Deficit SKUs'}</div>
              </div>

              <div className="px-2 py-1 rounded-lg bg-rose-950/50 border border-rose-500/30 text-rose-200 font-bold text-center">
                <div className="font-mono font-black text-xs">
                  {summary.totalShortfallCartons > 0 ? `-${fmtCtn(summary.totalShortfallCartons)}` : '0'}
                </div>
                <div className="truncate">{isAr ? 'إجمالي العجز (ك)' : 'Shortfall (Ctn)'}</div>
              </div>

              <div className="px-2 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 font-bold text-center">
                <div className="font-mono font-black text-xs">{summary.activeOrderSkuCount}</div>
                <div className="truncate">{isAr ? 'أصناف مطلوبة' : 'Active SKUs'}</div>
              </div>
            </div>
          </div>

          {/* Controls Bar: By SKU / By Packing Toggle + Quick Filter + Search */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-1.5">
              {/* View Mode Switch */}
              <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-[10px] font-extrabold">
                <button
                  type="button"
                  onClick={() => setViewMode('sku')}
                  className={`px-2 py-1 rounded-md transition cursor-pointer ${
                    viewMode === 'sku' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'حسب الصنف' : 'By SKU'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('packing')}
                  className={`px-2 py-1 rounded-md transition cursor-pointer ${
                    viewMode === 'packing' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'حسب التعبئة' : 'By Packing'}
                </button>
              </div>

              {/* Filter Chips */}
              <div className="flex items-center gap-1 text-[10px] font-bold">
                {[
                  { id: 'all', labelAr: 'الكل', labelEn: 'All' },
                  { id: 'deficits', labelAr: 'العجز', labelEn: 'Deficits' },
                  { id: 'active_orders', labelAr: 'مطلوب', labelEn: 'Ordered' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setQuickFilter(f.id)}
                    className={`px-2 py-1 rounded-lg border transition cursor-pointer ${
                      quickFilter === f.id
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? f.labelAr : f.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isAr ? 'بحث بالصنف أو اسم العميل...' : 'Search product or client...'}
                className="w-full ps-8 pe-2.5 py-1.5 text-[11px] font-bold border border-slate-300 rounded-lg bg-white focus:border-teal-600 outline-none"
              />
            </div>
          </div>

          {/* Priority List: 1. Deficits -> 2. Active Unfulfilled Orders -> 3. Idle */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
            {filteredRows.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-400 font-bold">
                {isAr ? 'لا توجد أصناف مطابقة للبحث أو التصفية.' : 'No matching items found.'}
              </div>
            ) : (
              filteredRows.map((row) => {
                const isExpanded = Boolean(expandedKeys[row.key]);
                const rowName = isAr ? row.nameAr : row.nameEn || row.nameAr;
                const subtleCode = viewMode === 'packing' && row.optionCode ? row.optionCode : row.code;
                const isDeficit = row.deficitCartons > 0;
                const hasDemand = row.preparingCartons + row.orderedCartons > 0;

                return (
                  <div
                    key={row.key}
                    className={`transition-colors ${
                      isDeficit
                        ? 'bg-rose-50/45'
                        : row.hasOptionDeficit
                        ? 'bg-amber-50/35'
                        : hasDemand
                        ? 'bg-indigo-50/20'
                        : 'bg-white'
                    }`}
                  >
                    {/* Compact 2-Line Clickable Header */}
                    <button
                      type="button"
                      onClick={() => toggleExpandRow(row.key)}
                      className="w-full text-start px-2.5 py-2 hover:bg-slate-100/70 transition cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-slate-400 shrink-0">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </span>

                          {row.imageFile && (
                            <img
                              src={row.imageFile}
                              alt={rowName}
                              className="w-6 h-6 rounded-md border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                            />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-extrabold text-slate-900 leading-tight truncate">
                              {rowName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] font-mono text-slate-400">{subtleCode}</span>
                              {row.hasOptionDeficit && !isDeficit && (
                                <span className="px-1 py-0 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[8px] font-extrabold">
                                  {isAr ? 'عجز تعبئة' : 'Opt Short'}
                                </span>
                              )}
                              {row.isAnyPool && (
                                <span className="px-1 py-0 rounded bg-cyan-100 text-cyan-800 text-[8px] font-bold">
                                  Any
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Compact Balance & Deficit Indicators */}
                        <div className="text-end shrink-0 space-y-0.5">
                          <div className="text-[10px] font-mono font-bold text-slate-700">
                            {summary.isFutureTarget ? (isAr ? 'افتتاح:' : 'Est:') : (isAr ? 'حالي:' : 'Bal:')}{' '}
                            <span className={row.currentBalanceCartons < 0 ? 'text-rose-700 font-black' : 'text-slate-900 font-black'}>
                              {fmtCtn(row.currentBalanceCartons)}
                            </span>
                          </div>

                          {isDeficit ? (
                            <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-600 text-white font-mono text-[10px] font-black">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>-{fmtCtn(row.deficitCartons)}</span>
                            </div>
                          ) : hasDemand ? (
                            <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-extrabold">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>+{fmtCtn(row.netProjectedCartons)}</span>
                            </div>
                          ) : (
                            <div className="text-[9px] font-mono text-slate-400">
                              {isAr ? 'صافي:' : 'Net:'} {fmtCtn(row.netProjectedCartons)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Compact Micro-Metrics Sub-Strip */}
                      {(hasDemand || row.plannedProdCartons > 0 || row.plannedReturnCartons > 0 || row.plannedTripExtrasCartons > 0) && (
                        <div className="mt-1.5 ps-5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono">
                          {row.preparingCartons > 0 && (
                            <span className="text-amber-800 font-bold">
                              {isAr ? 'تجهيز:' : 'Prep:'} {fmtCtn(row.preparingCartons)}
                            </span>
                          )}
                          {row.orderedCartons > 0 && (
                            <span className="text-indigo-800 font-bold">
                              {isAr ? 'مطلوب:' : 'Ord:'} {fmtCtn(row.orderedCartons)}
                            </span>
                          )}
                          {row.plannedProdCartons > 0 && (
                            <span className="text-emerald-700 font-bold">
                              +{isAr ? 'إنتاج:' : 'Prod:'} {fmtCtn(row.plannedProdCartons)}
                            </span>
                          )}
                          {row.plannedReturnCartons > 0 && (
                            <span className="text-cyan-700 font-bold">
                              +{isAr ? 'مرتجع:' : 'Ret:'} {fmtCtn(row.plannedReturnCartons)}
                            </span>
                          )}
                          {row.plannedTripExtrasCartons > 0 && (
                            <span className="text-teal-700 font-bold">
                              +{isAr ? 'زيادات:' : 'ExtRet:'} {fmtCtn(row.plannedTripExtrasCartons)}
                            </span>
                          )}
                        </div>
                      )}
                    </button>

                    {/* EXPANDED DETAILS: Formula + Client Chips + Planned Prod/Ret + Sub-Options */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1.5 bg-slate-50/90 border-t border-slate-200/80 space-y-2.5 text-[10px]">
                        {/* Daily Opening vs Current Balance & Forecast Equation */}
                        <div className="p-2 rounded-xl bg-white border border-slate-200 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold text-slate-600 border-b border-slate-100 pb-1">
                            <span>
                              {summary.isFutureTarget
                                ? (isAr ? `افتتاح تقديري (${summary.targetPlanningDate}):` : `Est. Opening (${summary.targetPlanningDate}):`)
                                : (isAr ? `افتتاح اليوم (إغلاق ${summary.prevDayStr}):` : `Day Opening (${summary.prevDayStr} Close):`)}
                            </span>
                            <span className="font-mono font-black text-slate-900">
                              {fmtCtn(row.openingCartons)} {row.largeUnitName}
                            </span>
                          </div>

                          {!summary.isFutureTarget && row.dispatchedOnTargetDayCartons > 0 && (
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                              <span>{isAr ? 'منصرف اليوم مسبقاً (مباشر):' : 'Already Dispatched Today:'}</span>
                              <span className="font-mono text-rose-700 font-bold">-{fmtCtn(row.dispatchedOnTargetDayCartons)}</span>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1 pt-0.5 font-mono">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                              {isAr ? 'أساس:' : 'Base:'} {fmtCtn(row.currentBalanceCartons)}
                            </span>
                            {row.plannedProdCartons > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                                +{fmtCtn(row.plannedProdCartons)} {isAr ? 'إنتاج' : 'Prod'}
                              </span>
                            )}
                            {row.plannedReturnCartons > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 font-bold">
                                +{fmtCtn(row.plannedReturnCartons)} {isAr ? 'مرتجع' : 'Ret'}
                              </span>
                            )}
                            {row.plannedTripExtrasCartons > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 font-bold">
                                +{fmtCtn(row.plannedTripExtrasCartons)} {isAr ? 'زيادات رحلات' : 'Trip Ext'}
                              </span>
                            )}
                            {row.preparingCartons > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-bold">
                                -{fmtCtn(row.preparingCartons)} {isAr ? 'تجهيز' : 'Prep'}
                              </span>
                            )}
                            {row.orderedCartons > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold">
                                -{fmtCtn(row.orderedCartons)} {isAr ? 'مطلوب' : 'Ord'}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 rounded font-black ${
                                isDeficit ? 'bg-rose-600 text-white' : 'bg-emerald-700 text-white'
                              }`}
                            >
                              = {fmtCtn(row.netProjectedCartons)}
                            </span>
                          </div>
                        </div>

                        {/* Preparing Clients Chips */}
                        {row.preparingClients.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[10px] font-extrabold text-amber-900">
                              <PackageCheck className="w-3 h-3 text-amber-600" />
                              <span>{isAr ? `قيد التجهيز (${fmtCtn(row.preparingCartons)} ${row.largeUnitName}):` : `Preparing (${fmtCtn(row.preparingCartons)}):`}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {row.preparingClients.map((cl) => (
                                <span
                                  key={cl._key}
                                  title={cl.orderNumbers.join(', ')}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-950 border border-amber-300 text-[10px] font-bold"
                                >
                                  <span className="truncate max-w-[165px]">{cl.clientName}</span>
                                  <span className="font-mono font-black text-amber-800">{fmtCtn(cl.qtyCartons)}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ordered (Pending) Clients Chips */}
                        {row.orderedClients.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[10px] font-extrabold text-indigo-950">
                              <Clock className="w-3 h-3 text-indigo-600" />
                              <span>{isAr ? `طلبات منتظرة (${fmtCtn(row.orderedCartons)} ${row.largeUnitName}):` : `Ordered / Pending (${fmtCtn(row.orderedCartons)}):`}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {row.orderedClients.map((cl) => (
                                <span
                                  key={cl._key}
                                  title={cl.orderNumbers.join(', ')}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100/90 text-indigo-950 border border-indigo-300 text-[10px] font-bold"
                                >
                                  <span className="truncate max-w-[165px]">{cl.clientName}</span>
                                  <span className="font-mono font-black text-indigo-800">{fmtCtn(cl.qtyCartons)}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Planned Work Orders & Scheduled Returns */}
                        {(row.plannedWorkOrders.length > 0 || row.plannedReturnOrders.length > 0) && (
                          <div className="flex flex-wrap gap-1">
                            {row.plannedWorkOrders.map((wo, idx) => (
                              <span
                                key={`${wo.workOrderId}-${idx}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold font-mono"
                              >
                                <Factory className="w-2.5 h-2.5 text-emerald-700" />
                                <span>{wo.workOrderNumber}</span>
                                <span className="font-black">+{fmtCtn(wo.remainingCartons)}</span>
                              </span>
                            ))}
                            {row.plannedReturnOrders.map((ret, idx) => (
                              <span
                                key={`${ret.orderId}-${idx}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-900 border border-cyan-300 text-[10px] font-bold"
                              >
                                <RotateCcw className="w-2.5 h-2.5 text-cyan-700" />
                                <span className="truncate max-w-[130px]">{ret.clientName}</span>
                                <span className="font-mono font-black">+{fmtCtn(ret.qtyCartons)}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Sub-Options Summary inside By-SKU Mode */}
                        {viewMode === 'sku' && row.options && row.options.length > 1 && (
                          <div className="p-2 rounded-xl bg-white border border-slate-200 space-y-1">
                            <div className="flex items-center gap-1 text-[10px] font-extrabold text-slate-700">
                              <Layers className="w-3 h-3 text-slate-500" />
                              <span>{isAr ? 'موقف التعبئة الفرعية:' : 'Packing Breakdown:'}</span>
                            </div>
                            <div className="space-y-1">
                              {row.options.map((opt) => (
                                <div
                                  key={opt.key}
                                  className="flex items-center justify-between gap-2 text-[10px] py-0.5 border-b last:border-b-0 border-slate-100"
                                >
                                  <div className="flex items-center gap-1 min-w-0">
                                    <span className="font-bold text-slate-800 truncate">
                                      {isAr ? opt.optionNameAr : opt.optionNameEn || opt.optionNameAr}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-400">{opt.optionCode}</span>
                                  </div>
                                  <div className="flex items-center gap-2 font-mono shrink-0">
                                    <span className="text-slate-600">
                                      {isAr ? 'رصيد:' : 'Bal:'} {fmtCtn(opt.currentBalanceCartons)}
                                    </span>
                                    <span
                                      className={`font-black px-1 rounded ${
                                        opt.deficitCartons > 0
                                          ? 'bg-rose-100 text-rose-800'
                                          : opt.netProjectedCartons < 0
                                          ? 'bg-cyan-100 text-cyan-800'
                                          : 'text-emerald-700'
                                      }`}
                                    >
                                      {opt.deficitCartons > 0
                                        ? `-${fmtCtn(opt.deficitCartons)}`
                                        : opt.netProjectedCartons >= 0
                                        ? `+${fmtCtn(opt.netProjectedCartons)}`
                                        : fmtCtn(opt.netProjectedCartons)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}
    </>
  );
}
