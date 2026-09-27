import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  Activity,
  BarChart3,
  PieChart,
  Clock,
  Calendar,
  Users,
  Boxes,
  Package,
  FileSpreadsheet,
  Printer,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Coffee,
  RotateCcw,
  Search,
  Download,
  Filter,
  Layers,
  ChevronDown,
  Info,
  Scale
} from 'lucide-react';

// Helper time converters
const timeToMins = (timeStr) => {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
};

const minsToTime = (mins) => {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.floor(normalized % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const formatDuration = (mins, isAr = true) => {
  const m = Math.round(Number(mins) || 0);
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h === 0) return isAr ? `${remM} دقيقة` : `${remM}m`;
  if (remM === 0) return isAr ? `${h} ساعة` : `${h}h`;
  return isAr ? `${h} س و ${remM} د` : `${h}h ${remM}m`;
};

export default function ProductionPerformanceReports({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // Firestore live subscriptions
  const [workOrders, setWorkOrders] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter States
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [dateRangePreset, setDateRangePreset] = useState('today'); // 'today' | 'week' | 'month' | 'all' | 'custom'
  const [customStartDate, setCustomStartDate] = useState(todayStr);
  const [customEndDate, setCustomEndDate] = useState(todayStr);
  const [selectedProductFilter, setSelectedProductFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Subscribe to Collections
  useEffect(() => {
    setIsLoading(true);

    const unsubOrders = onSnapshot(collection(db, 'work_orders'), (snap) => {
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setWorkOrders(list);
      setIsLoading(false);
    });

    const unsubBreaks = onSnapshot(collection(db, 'production_breaks'), (snap) => {
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setBreaks(list);
    });

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      const list = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setFinishedProducts(list);
    });

    return () => {
      unsubOrders();
      unsubBreaks();
      unsubProducts();
    };
  }, []);

  // Compute Active Date Range
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (dateRangePreset === 'today') {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (dateRangePreset === 'week') {
      const curr = new Date();
      const firstDay = new Date(curr.setDate(curr.getDate() - curr.getDay()));
      const sStr = firstDay.toISOString().split('T')[0];
      return { startDate: sStr, endDate: todayStr };
    }
    if (dateRangePreset === 'month') {
      const sStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { startDate: sStr, endDate: todayStr };
    }
    if (dateRangePreset === 'custom') {
      return { startDate: customStartDate || '1970-01-01', endDate: customEndDate || '2099-12-31' };
    }
    // 'all'
    return { startDate: '1970-01-01', endDate: '2099-12-31' };
  }, [dateRangePreset, customStartDate, customEndDate, todayStr]);

  // Helper to extract crew count
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

  // ---------------------------------------------------------------------------
  // 2. THE CORE LABOR-WEIGHTED DILUTION & PRODUCTION PERFORMANCE ENGINE
  // ---------------------------------------------------------------------------
  const reportData = useMemo(() => {
    // Collect all valid days in scope
    const dayGroups = {};
    const touchedProducts = new Set();

    // Group work orders segments by date
    workOrders.forEach((order) => {
      if (order.status === 'cancelled') return;
      const crewCount = getOrderCrewCount(order);
      const ratio = Number(order.packagingRatio) || 12;

      // Check segments
      const segments = Array.isArray(order.segments) && order.segments.length > 0
        ? order.segments
        : [];

      if (segments.length > 0) {
        segments.forEach((seg) => {
          const segDate = seg.date || order.productionDate || order.planDate;
          if (!segDate || seg.status === 'Cancelled' || seg.status === 'ملغي') return;
          if (segDate < startDate || segDate > endDate) return;

          if (!dayGroups[segDate]) dayGroups[segDate] = { sessions: [], breaks: [] };
          dayGroups[segDate].sessions.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            productId: order.finishedProductId || order.productCode || 'N/A',
            productNameAr: order.productNameAr || 'صنف غير محدد',
            packagingOptionNameAr: order.packagingOptionNameAr || '',
            packagingOptionCode: order.packagingOptionCode || '',
            outputLargeUnit: order.outputLargeUnit || (isAr ? 'كرتونة' : 'Carton'),
            outputSmallUnit: order.outputSmallUnit || (isAr ? 'عبوة' : 'Unit'),
            packagingRatio: ratio,
            startTime: seg.startTime,
            endTime: seg.endTime,
            isActive: seg.status === 'Active' || !seg.endTime,
            crewCount,
            totalProducedQtyLarge: Number(order.totalProducedQtyLarge || 0),
            totalProducedQtySmall: Number(order.totalProducedQtySmall || 0),
            pallets: order.pallets || [],
          });
          touchedProducts.add(order.finishedProductId || order.productCode || 'N/A');
        });
      } else {
        // Fallback for orders without segments but planned/produced in range
        const pDate = order.productionDate || order.planDate;
        if (pDate && pDate >= startDate && pDate <= endDate) {
          const pallets = order.pallets || [];
          let sTime = order.startTime || '08:00';
          let eTime = order.endTime || '16:30';
          if (pallets.length > 0) {
            sTime = pallets[0].startTime || sTime;
            eTime = pallets[pallets.length - 1].endTime || eTime;
          }

          if (!dayGroups[pDate]) dayGroups[pDate] = { sessions: [], breaks: [] };
          dayGroups[pDate].sessions.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            productId: order.finishedProductId || order.productCode || 'N/A',
            productNameAr: order.productNameAr || 'صنف غير محدد',
            packagingOptionNameAr: order.packagingOptionNameAr || '',
            packagingOptionCode: order.packagingOptionCode || '',
            outputLargeUnit: order.outputLargeUnit || (isAr ? 'كرتونة' : 'Carton'),
            outputSmallUnit: order.outputSmallUnit || (isAr ? 'عبوة' : 'Unit'),
            packagingRatio: ratio,
            startTime: sTime,
            endTime: eTime,
            isActive: false,
            crewCount,
            totalProducedQtyLarge: Number(order.totalProducedQtyLarge || 0),
            totalProducedQtySmall: Number(order.totalProducedQtySmall || 0),
            pallets,
          });
          touchedProducts.add(order.finishedProductId || order.productCode || 'N/A');
        }
      }
    });

    // Group Breaks by date
    breaks.forEach((b) => {
      if (b.status === 'cancelled') return;
      const bDate = b.date;
      if (!bDate || bDate < startDate || bDate > endDate) return;

      if (!dayGroups[bDate]) dayGroups[bDate] = { sessions: [], breaks: [] };
      dayGroups[bDate].breaks.push({
        startTime: b.startTime,
        endTime: b.endTime || minsToTime(timeToMins(b.startTime) + 30),
        notes: b.notes || '',
      });
    });

    // Global Metrics Accumulators
    let totalFactoryUptimeMins = 0;
    let totalWasteMins = 0;
    let totalBreakMins = 0;
    let totalOvertimeMins = 0;

    // Concurrency minutes
    const concurrency = { solo: 0, parallel2: 0, parallel3Plus: 0 };

    // Per-Product Map: { [productId]: { nameAr, code, unit, producedCartons, producedUnits, rawDurMins, dilutedDurMins, ... } }
    const productStats = {};

    // Process Day by Day
    const sortedDates = Object.keys(dayGroups).sort();
    const nowTimeStr = minsToTime(timeToMins(new Date().toTimeString().slice(0, 5)));
    const nowMin = timeToMins(nowTimeStr);

    sortedDates.forEach((dateStr) => {
      const dayData = dayGroups[dateStr];
      const isDayToday = (dateStr === todayStr);

      const shiftStart = 480; // 08:00 AM
      const shiftEnd = 990;   // 16:30 PM
      const latestEvalTime = isDayToday ? Math.min(shiftEnd, nowMin) : shiftEnd;

      // 1. Collect breaks
      const dayBreaks = dayData.breaks.map((b) => {
        const sM = timeToMins(b.startTime);
        const eM = timeToMins(b.endTime);
        const absEM = eM < sM ? eM + 1440 : eM;
        const dur = absEM - sM;
        totalBreakMins += dur;
        return { start: sM, end: absEM, dur };
      });

      // 2. Prepare Sessions
      const daySessions = dayData.sessions.map((sess) => {
        const sM = timeToMins(sess.startTime);
        let eM = sess.endTime ? timeToMins(sess.endTime) : (sess.isActive && isDayToday ? nowMin : sM + 60);
        if (eM < sM) eM += 1440;
        return {
          ...sess,
          startM: sM,
          endM: eM,
          allocatedDilutedMins: 0,
        };
      });

      // 3. Build 1440-minute occupancy & concurrency map
      // minuteSessions[m] = array of sessions active at minute m
      const minuteSessions = new Array(1440).fill(null).map(() => []);
      const breakMinutes = new Array(1440).fill(false);

      dayBreaks.forEach((b) => {
        for (let m = b.start; m < b.end; m++) {
          breakMinutes[m % 1440] = true;
        }
      });

      daySessions.forEach((sess) => {
        for (let m = sess.startM; m < sess.endM; m++) {
          if (!breakMinutes[m % 1440]) {
            minuteSessions[m % 1440].push(sess);
          }
        }
      });

      // 4. Minute-by-Minute Labor-Weighted Allocation
      let dayActualStart = 1440;
      let dayActualEnd = 0;

      for (let m = 0; m < 1440; m++) {
        const activeList = minuteSessions[m];
        if (activeList.length > 0) {
          totalFactoryUptimeMins += 1;
          if (m < dayActualStart) dayActualStart = m;
          if (m > dayActualEnd) dayActualEnd = m;

          // Concurrency tracking
          if (activeList.length === 1) concurrency.solo += 1;
          else if (activeList.length === 2) concurrency.parallel2 += 1;
          else concurrency.parallel3Plus += 1;

          // Labor/Crew Weighted Sharing Formula:
          // Share_i = Crew_i / TotalCrew
          const sumCrew = activeList.reduce((acc, s) => acc + (s.crewCount || 6), 0);
          activeList.forEach((s) => {
            const share = sumCrew > 0 ? ((s.crewCount || 6) / sumCrew) : (1 / activeList.length);
            s.allocatedDilutedMins += share;
          });
        }
      }

      // 5. Downtime / Waste Calculation for the Day
      if (!(isDayToday && nowMin < shiftStart)) {
        for (let m = shiftStart; m < latestEvalTime; m++) {
          if (minuteSessions[m].length === 0 && !breakMinutes[m]) {
            totalWasteMins += 1;
          }
        }
      }

      // Overtime
      if (dayActualEnd > shiftEnd) {
        totalOvertimeMins += (dayActualEnd - shiftEnd);
      }

      // 6. Aggregate into productStats
      daySessions.forEach((sess) => {
        const pKey = sess.productId;
        if (!productStats[pKey]) {
          productStats[pKey] = {
            productId: pKey,
            productNameAr: sess.productNameAr,
            packagingOptionNameAr: sess.packagingOptionNameAr,
            outputLargeUnit: sess.outputLargeUnit,
            outputSmallUnit: sess.outputSmallUnit,
            packagingRatio: sess.packagingRatio,
            totalProducedCartons: 0,
            totalProducedUnits: 0,
            rawOperationalMins: 0,
            dilutedFinancialMins: 0,
            orderCount: new Set(),
          };
        }

        // Net physical runtime for this session (excluding breaks)
        let netPhysical = sess.endM - sess.startM;
        dayBreaks.forEach((b) => {
          const oStart = Math.max(sess.startM, b.start);
          const oEnd = Math.min(sess.endM, b.end);
          if (oStart < oEnd) netPhysical -= (oEnd - oStart);
        });
        if (netPhysical < 0) netPhysical = 0;

        productStats[pKey].rawOperationalMins += netPhysical;
        productStats[pKey].dilutedFinancialMins += sess.allocatedDilutedMins;
        productStats[pKey].orderCount.add(sess.orderId);
      });
    });

    // Compute Produced Quantities for distinct orders in scope
    const countedOrders = new Set();
    workOrders.forEach((order) => {
      const pDate = order.productionDate || order.planDate;
      if (!pDate || pDate < startDate || pDate > endDate) return;
      if (countedOrders.has(order.id)) return;
      countedOrders.add(order.id);

      const pKey = order.finishedProductId || order.productCode || 'N/A';
      if (!productStats[pKey]) {
        productStats[pKey] = {
          productId: pKey,
          productNameAr: order.productNameAr || 'صنف غير محدد',
          packagingOptionNameAr: order.packagingOptionNameAr || '',
          outputLargeUnit: order.outputLargeUnit || (isAr ? 'كرتونة' : 'Carton'),
          outputSmallUnit: order.outputSmallUnit || (isAr ? 'عبوة' : 'Unit'),
          packagingRatio: Number(order.packagingRatio) || 12,
          totalProducedCartons: 0,
          totalProducedUnits: 0,
          rawOperationalMins: 0,
          dilutedFinancialMins: 0,
          orderCount: new Set([order.id]),
        };
      }

      const ratio = Number(order.packagingRatio) || 12;
      const actualLarge = order.totalProducedQtyLarge != null
        ? Number(order.totalProducedQtyLarge)
        : (order.pallets?.length > 0
            ? order.pallets.reduce((s, p) => s + (Number(p.qtyLarge) || 0), 0)
            : (Number(order.totalProducedQtySmall || 0) / ratio));

      const actualSmall = order.totalProducedQtySmall != null
        ? Number(order.totalProducedQtySmall)
        : (order.pallets?.length > 0
            ? order.pallets.reduce((s, p) => s + (Number(p.qtySmall) || 0), 0)
            : (actualLarge * ratio));

      productStats[pKey].totalProducedCartons += actualLarge;
      productStats[pKey].totalProducedUnits += actualSmall;
    });

    // Convert to Table Array
    let totalCartonsAll = 0;
    let totalUnitsAll = 0;
    let sumDilutedMinsAll = 0;
    let sumRawMinsAll = 0;

    const productRows = Object.values(productStats).map((item) => {
      totalCartonsAll += item.totalProducedCartons;
      totalUnitsAll += item.totalProducedUnits;
      sumDilutedMinsAll += item.dilutedFinancialMins;
      sumRawMinsAll += item.rawOperationalMins;

      // Find matching product metadata/photo
      const masterProduct = finishedProducts.find((p) => p.code === item.productId || p.id === item.productId);
      const opt = masterProduct?.packagingOptions?.find((o) => o.suffix === item.packagingOptionCode || o.code === item.packagingOptionCode);
      const imageFile = opt?.imageFile || masterProduct?.imageFile || '';

      const capacityRatioPct = totalFactoryUptimeMins > 0
        ? Number(((item.dilutedFinancialMins / totalFactoryUptimeMins) * 100).toFixed(1))
        : 0;

      const loadedMinsPerCarton = item.totalProducedCartons > 0
        ? Number((item.dilutedFinancialMins / item.totalProducedCartons).toFixed(2))
        : 0;

      return {
        ...item,
        imageFile,
        capacityRatioPct,
        loadedMinsPerCarton,
        uniqueOrdersCount: item.orderCount.size,
      };
    });

    // Time Efficiency / OEE
    const timeEfficiencyPct = (totalFactoryUptimeMins + totalWasteMins) > 0
      ? Number(((totalFactoryUptimeMins / (totalFactoryUptimeMins + totalWasteMins)) * 100).toFixed(1))
      : 100;

    return {
      kpis: {
        totalFactoryUptimeMins,
        totalWasteMins,
        totalBreakMins,
        totalOvertimeMins,
        timeEfficiencyPct,
        totalCartonsAll,
        totalUnitsAll,
      },
      concurrency,
      productRows,
      allProductsList: Array.from(touchedProducts),
    };
  }, [workOrders, breaks, finishedProducts, startDate, endDate, todayStr, isAr]);

  // Filtered rows for the table
  const displayedRows = useMemo(() => {
    return reportData.productRows.filter((row) => {
      if (selectedProductFilter !== 'all' && row.productId !== selectedProductFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = String(row.productNameAr || '').toLowerCase().includes(q);
        const matchCode = String(row.productId || '').toLowerCase().includes(q);
        if (!matchName && !matchCode) return false;
      }
      return true;
    });
  }, [reportData.productRows, selectedProductFilter, searchQuery]);

  // Export to Excel / XLSX
  const handleExportXlsx = () => {
    const wb = XLSX.utils.book_new();

    // 1. KPI Sheet
    const kpiData = [
      { Metric: isAr ? 'صافي وقت تشغيل المصنع (دقيقة)' : 'Net Production Uptime (Mins)', Value: reportData.kpis.totalFactoryUptimeMins },
      { Metric: isAr ? 'الوقت المهدر / التوقف (دقيقة)' : 'Downtime / Waste (Mins)', Value: reportData.kpis.totalWasteMins },
      { Metric: isAr ? 'أوقات الراحة (دقيقة)' : 'Breaks (Mins)', Value: reportData.kpis.totalBreakMins },
      { Metric: isAr ? 'الوقت الإضافي (دقيقة)' : 'Overtime (Mins)', Value: reportData.kpis.totalOvertimeMins },
      { Metric: isAr ? 'كفاءة استغلال الوقت (OEE %)' : 'Time Efficiency %', Value: `${reportData.kpis.timeEfficiencyPct}%` },
      { Metric: isAr ? 'إجمالي كراتين الإنتاج التام' : 'Total Output Cartons', Value: reportData.kpis.totalCartonsAll },
      { Metric: isAr ? 'إجمالي العبوات المنتجة' : 'Total Output Units', Value: reportData.kpis.totalUnitsAll },
    ];
    const wsKpi = XLSX.utils.json_to_sheet(kpiData);
    XLSX.utils.book_append_sheet(wb, wsKpi, isAr ? 'المؤشرات العامة' : 'KPIs');

    // 2. Capacity & Cost Allocation Sheet
    const tableData = displayedRows.map((r) => ({
      [isAr ? 'كود الصنف' : 'Product Code']: r.productId,
      [isAr ? 'اسم الصنف' : 'Product Name']: r.productNameAr,
      [isAr ? 'شكل التعبئة' : 'Packaging Option']: r.packagingOptionNameAr || '—',
      [isAr ? 'الكمية بالكرتونة' : 'Cartons']: r.totalProducedCartons,
      [isAr ? 'الكمية بالعبوة' : 'Units']: r.totalProducedUnits,
      [isAr ? 'وقت التشغيل الفعلي (دقيقة)' : 'Physical Runtime (Mins)']: Math.round(r.rawOperationalMins),
      [isAr ? 'الوقت المحمل بالعمالة (دقيقة)' : 'Labor-Weighted Time (Mins)']: Math.round(r.dilutedFinancialMins),
      [isAr ? 'نسبة استهلاك الطاقة %' : 'Capacity Share %']: `${r.capacityRatioPct}%`,
      [isAr ? 'متوسط الوقت المحمل للكرتونة (دقيقة)' : 'Mins per Carton']: r.loadedMinsPerCarton,
    }));

    const wsTable = XLSX.utils.json_to_sheet(tableData);
    XLSX.utils.book_append_sheet(wb, wsTable, isAr ? 'تحميل التكاليف والطاقة' : 'Capacity Allocation');

    const fileName = `Production_Performance_Report_${startDate}_${endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // SVG Doughnut Calculation
  const donutData = useMemo(() => {
    const uptime = reportData.kpis.totalFactoryUptimeMins;
    const waste = reportData.kpis.totalWasteMins;
    const breaksM = reportData.kpis.totalBreakMins;
    const total = uptime + waste + breaksM;

    if (total === 0) {
      return { prodPct: 0, wastePct: 0, breakPct: 0, total: 0 };
    }

    return {
      prodPct: Math.round((uptime / total) * 100),
      wastePct: Math.round((waste / total) * 100),
      breakPct: Math.round((breaksM / total) * 100),
      total,
    };
  }, [reportData.kpis]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Control & Date Range Filter Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Preset Date Range Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 me-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>{isAr ? 'الفترة:' : 'Range:'}</span>
            </span>

            {[
              { id: 'today', labelAr: 'اليوم', labelEn: 'Today' },
              { id: 'week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
              { id: 'month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
              { id: 'all', labelAr: 'كافة الفترات', labelEn: 'All Time' },
              { id: 'custom', labelAr: 'مخصص...', labelEn: 'Custom...' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDateRangePreset(preset.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  dateRangePreset === preset.id
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? preset.labelAr : preset.labelEn}
              </button>
            ))}
          </div>

          {/* Export & Print Action Buttons */}
          <div className="flex items-center gap-2 self-end lg:self-center">
            <button
              type="button"
              onClick={handleExportXlsx}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              title={isAr ? 'تصدير كامل التقرير إلى Excel' : 'Export report to XLSX'}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{isAr ? 'تصدير Excel' : 'Export XLSX'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title={isAr ? 'طباعة التقرير' : 'Print report'}
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
          </div>
        </div>

        {/* Custom Date Pickers (Shown if 'custom' is active) */}
        {dateRangePreset === 'custom' && (
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">{isAr ? 'من تاريخ:' : 'From:'}</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="p-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">{isAr ? 'إلى تاريخ:' : 'To:'}</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="p-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold"
              />
            </div>
          </div>
        )}
      </div>

      {/* TOP EXECUTIVE SCORECARD (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Net Production Uptime */}
        <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? 'صافي تشغيل المصنع' : 'Net Production'}
            </span>
            <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-xl">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <span className="font-mono font-black text-xl text-emerald-700 block">
            {formatDuration(reportData.kpis.totalFactoryUptimeMins, isAr)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono block">
            {reportData.kpis.totalFactoryUptimeMins} {isAr ? 'دقيقة تشغيل فعلي' : 'mins uptime'}
          </span>
        </div>

        {/* Downtime / Waste */}
        <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? 'الوقت المهدر (توقف)' : 'Downtime / Waste'}
            </span>
            <div className="p-1.5 bg-rose-50 text-rose-700 rounded-xl">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <span className="font-mono font-black text-xl text-rose-700 block">
            {formatDuration(reportData.kpis.totalWasteMins, isAr)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono block">
            {reportData.kpis.totalWasteMins} {isAr ? 'دقيقة بدون تشغيل' : 'mins idle'}
          </span>
        </div>

        {/* Breaks */}
        <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? 'أوقات الراحة' : 'Shift Breaks'}
            </span>
            <div className="p-1.5 bg-amber-50 text-amber-700 rounded-xl">
              <Coffee className="h-4 w-4" />
            </div>
          </div>
          <span className="font-mono font-black text-xl text-amber-700 block">
            {formatDuration(reportData.kpis.totalBreakMins, isAr)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono block">
            {reportData.kpis.totalBreakMins} {isAr ? 'دقيقة استراحة' : 'mins breaks'}
          </span>
        </div>

        {/* Overtime */}
        <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? 'الوقت الإضافي' : 'Overtime'}
            </span>
            <div className="p-1.5 bg-purple-50 text-purple-700 rounded-xl">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <span className="font-mono font-black text-xl text-purple-700 block">
            {formatDuration(reportData.kpis.totalOvertimeMins, isAr)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono block">
            {reportData.kpis.totalOvertimeMins} {isAr ? 'دقيقة بعد الوردية' : 'mins overtime'}
          </span>
        </div>

        {/* Time Efficiency / OEE */}
        <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? 'كفاءة استغلال الوقت' : 'Time Efficiency'}
            </span>
            <div className="p-1.5 bg-blue-50 text-blue-700 rounded-xl">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <span className="font-mono font-black text-xl text-blue-700 block">
            {reportData.kpis.timeEfficiencyPct}%
          </span>
          <span className="text-[10px] text-slate-400 block">
            {isAr ? 'نسبة التشغيل الفعلي' : 'Uptime vs Downtime'}
          </span>
        </div>

        {/* Total Produced Output Cartons */}
        <div className="p-4 bg-white border border-slate-200 rounded-3xl shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? 'إجمالي كراتين الإنتاج' : 'Output Cartons'}
            </span>
            <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-xl">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <span className="font-mono font-black text-xl text-indigo-900 block">
            {reportData.kpis.totalCartonsAll.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
          <span className="text-[10px] text-slate-400 font-mono block">
            {reportData.kpis.totalUnitsAll.toLocaleString()} {isAr ? 'عبوة تامة' : 'units'}
          </span>
        </div>
      </div>

      {/* VISUAL CHARTS & CONCURRENCY INSIGHTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart 1: Time Breakdown Donut */}
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-xl">
                <PieChart className="h-4 w-4" />
              </div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {isAr ? 'توزيع وقت الوردية والمصنع' : 'Shift Time Distribution'}
              </h3>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 py-2">
            {/* SVG Pie / Donut */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                {/* Background Ring */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth="3.8"
                />
                {/* Production Segment (Emerald) */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="3.8"
                  strokeDasharray={`${donutData.prodPct} ${100 - donutData.prodPct}`}
                  strokeDashoffset="0"
                />
                {/* Waste Segment (Rose) */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="transparent"
                  stroke="#f43f5e"
                  strokeWidth="3.8"
                  strokeDasharray={`${donutData.wastePct} ${100 - donutData.wastePct}`}
                  strokeDashoffset={`-${donutData.prodPct}`}
                />
                {/* Break Segment (Amber) */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="transparent"
                  stroke="#fbbf24"
                  strokeWidth="3.8"
                  strokeDasharray={`${donutData.breakPct} ${100 - donutData.breakPct}`}
                  strokeDashoffset={`-${donutData.prodPct + donutData.wastePct}`}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="font-mono font-black text-lg text-slate-900">{donutData.prodPct}%</span>
                <span className="text-[9px] text-slate-400 font-semibold">{isAr ? 'إنتاج' : 'Prod'}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="text-slate-600 font-medium">{isAr ? 'تشغيل إنتاج:' : 'Uptime:'}</span>
                <b className="font-mono text-slate-900">{donutData.prodPct}%</b>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0"></span>
                <span className="text-slate-600 font-medium">{isAr ? 'وقت مهدر:' : 'Downtime:'}</span>
                <b className="font-mono text-slate-900">{donutData.wastePct}%</b>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0"></span>
                <span className="text-slate-600 font-medium">{isAr ? 'استراحات:' : 'Breaks:'}</span>
                <b className="font-mono text-slate-900">{donutData.breakPct}%</b>
              </div>
            </div>
          </div>
        </div>

        {/* Chart 2: Concurrency & Parallel Packaging Lines */}
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 text-blue-700 rounded-xl">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'تزامن خطوط الإنتاج والتشغيل المتوازي' : 'Line Concurrency & Parallel Packaging'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isAr
                    ? 'توزيع دقائق عمل المصنع حسب عدد خطوط الإنتاج المشغلة في نفس اللحظة مع تحميل الطاقة وفق العمالة.'
                    : 'Distribution of factory uptime by number of simultaneously running orders.'}
                </p>
              </div>
            </div>
          </div>

          {/* Concurrency Bars */}
          <div className="space-y-3 pt-1">
            {/* Solo (1 Line) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  <span>{isAr ? 'تشغيل منفرد (خط واحد يعمل فقط)' : 'Solo Run (1 Line)'}</span>
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatDuration(reportData.concurrency.solo, isAr)} ({reportData.kpis.totalFactoryUptimeMins > 0 ? Math.round((reportData.concurrency.solo / reportData.kpis.totalFactoryUptimeMins) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${reportData.kpis.totalFactoryUptimeMins > 0 ? Math.min(100, (reportData.concurrency.solo / reportData.kpis.totalFactoryUptimeMins) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Parallel 2 Lines */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                  <span>{isAr ? 'تشغيل متوازي (خطين معاً في نفس الدقيقة)' : 'Parallel Run (2 Lines Simultaneous)'}</span>
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatDuration(reportData.concurrency.parallel2, isAr)} ({reportData.kpis.totalFactoryUptimeMins > 0 ? Math.round((reportData.concurrency.parallel2 / reportData.kpis.totalFactoryUptimeMins) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${reportData.kpis.totalFactoryUptimeMins > 0 ? Math.min(100, (reportData.concurrency.parallel2 / reportData.kpis.totalFactoryUptimeMins) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Parallel 3+ Lines */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span>{isAr ? 'تشغيل مكثف (3 خطوط أو أكثر متوازية)' : 'Intensive Run (3+ Lines Simultaneous)'}</span>
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatDuration(reportData.concurrency.parallel3Plus, isAr)} ({reportData.kpis.totalFactoryUptimeMins > 0 ? Math.round((reportData.concurrency.parallel3Plus / reportData.kpis.totalFactoryUptimeMins) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${reportData.kpis.totalFactoryUptimeMins > 0 ? Math.min(100, (reportData.concurrency.parallel3Plus / reportData.kpis.totalFactoryUptimeMins) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EXECUTIVE PRODUCT COST & CAPACITY ALLOCATION TABLE */}
      <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
        {/* Table Search & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-2xl">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                {isAr ? 'جدول تحميل الطاقة وتكلفة الدقيقة بالعمالة للمنتجات' : 'Product Capacity Dilution & Labor Cost Table'}
              </h3>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'مقارنة بين زمن التشغيل الفعلي والزمن المحمل مالياً بعد اقتسام الطاقة بنسبة حجم العمالة.'
                  : 'Comparison between physical runtime and labor-weighted financial loaded time.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={isAr ? 'بحث بالاسم أو الكود...' : 'Search by name or code...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-8 pe-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold w-48 sm:w-56 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Product Dropdown Filter */}
            <select
              value={selectedProductFilter}
              onChange={(e) => setSelectedProductFilter(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
            >
              <option value="all">{isAr ? 'كافة الأصناف (الكل)' : 'All Products'}</option>
              {reportData.productRows.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.productNameAr} ({p.productId})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 text-center">
                <th className="p-3 text-start">{isAr ? 'الصنف والتعبئة' : 'Product & Packaging'}</th>
                <th className="p-3">{isAr ? 'الكمية المنتجة' : 'Output Quantity'}</th>
                <th className="p-3">{isAr ? 'صافي وقت التشغيل الفعلي' : 'Physical Runtime'}</th>
                <th className="p-3 bg-indigo-50/50 text-indigo-950 font-black">
                  {isAr ? 'الوقت المحمل مالياً (وفق العمالة)' : 'Labor-Weighted Time'}
                </th>
                <th className="p-3">{isAr ? 'نسبة استهلاك الطاقة %' : 'Capacity Share %'}</th>
                <th className="p-3">{isAr ? 'متوسط الوقت المحمل للكرتونة' : 'Mins per Carton'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <Boxes className="h-8 w-8 mx-auto text-slate-300 opacity-60 mb-1" />
                    <span>{isAr ? 'لا توجد بيانات إنتاج مسجلة ضمن هذه الفترة المحددة.' : 'No production records found in this range.'}</span>
                  </td>
                </tr>
              ) : (
                displayedRows.map((row) => (
                  <tr key={row.productId} className="hover:bg-slate-50/80 transition-colors">
                    {/* Product Name & Code */}
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        {row.imageFile ? (
                          <img
                            src={row.imageFile}
                            alt={row.productNameAr}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-extrabold text-slate-900 leading-snug">
                            {row.productNameAr}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                            <span>[{row.productId}]</span>
                            {row.packagingOptionNameAr && (
                              <>
                                <span>•</span>
                                <span className="text-indigo-700 font-semibold">{row.packagingOptionNameAr}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Produced Output */}
                    <td className="p-3 text-center">
                      <div className="font-mono font-black text-slate-900 text-sm">
                        {row.totalProducedCartons.toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
                        <span className="text-[11px] font-normal text-slate-500">{row.outputLargeUnit}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {row.totalProducedUnits.toLocaleString()} {row.outputSmallUnit}
                      </div>
                    </td>

                    {/* Physical Operational Runtime */}
                    <td className="p-3 text-center">
                      <div className="font-mono font-bold text-slate-800">
                        {formatDuration(row.rawOperationalMins, isAr)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {Math.round(row.rawOperationalMins)} {isAr ? 'دقيقة فعلية' : 'mins physical'}
                      </div>
                    </td>

                    {/* Diluted Labor-Weighted Financial Runtime */}
                    <td className="p-3 text-center bg-indigo-50/30">
                      <div className="font-mono font-black text-indigo-900 text-sm">
                        {formatDuration(row.dilutedFinancialMins, isAr)}
                      </div>
                      <div className="text-[10px] text-indigo-600 font-mono font-bold">
                        {Number(row.dilutedFinancialMins.toFixed(1))} {isAr ? 'دقيقة محملة' : 'diluted mins'}
                      </div>
                    </td>

                    {/* Capacity / Cost Ratio % */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-mono font-black text-sm text-slate-900">
                          {row.capacityRatioPct}%
                        </span>
                      </div>
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full mx-auto mt-1 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${Math.min(100, row.capacityRatioPct)}%` }}
                        />
                      </div>
                    </td>

                    {/* Loaded Time per Carton */}
                    <td className="p-3 text-center">
                      <div className="font-mono font-black text-slate-900">
                        {row.loadedMinsPerCarton} <span className="text-[10px] text-slate-500 font-normal">{isAr ? 'دقيقة/كرتونة' : 'm/ctn'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {row.totalProducedUnits > 0
                          ? `${((row.dilutedFinancialMins / row.totalProducedUnits) * 60).toFixed(1)} ${isAr ? 'ثانية/عبوة' : 's/unit'}`
                          : '—'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Table Footer Totals */}
            {displayedRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 text-center">
                  <td className="p-3 text-start">{isAr ? 'الإجمالي العام' : 'Total'}</td>
                  <td className="p-3 font-mono">
                    {displayedRows.reduce((s, r) => s + r.totalProducedCartons, 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </td>
                  <td className="p-3 font-mono">
                    {formatDuration(displayedRows.reduce((s, r) => s + r.rawOperationalMins, 0), isAr)}
                  </td>
                  <td className="p-3 font-mono text-indigo-900 bg-indigo-100/50">
                    {formatDuration(displayedRows.reduce((s, r) => s + r.dilutedFinancialMins, 0), isAr)}
                  </td>
                  <td className="p-3 font-mono">
                    {displayedRows.reduce((s, r) => s + r.capacityRatioPct, 0).toFixed(1)}%
                  </td>
                  <td className="p-3 font-mono">
                    —
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
