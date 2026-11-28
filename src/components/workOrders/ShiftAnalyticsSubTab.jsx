import React from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Coffee,
  FileSpreadsheet,
  Gauge,
  Layers,
  Package,
  Play,
  Printer,
  PrinterCheck,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { timeToMins, minsToTime } from './workOrderUtils';

export default function ShiftAnalyticsSubTab({
  analyticsBreaks,
  analyticsDate,
  analyticsFilteredOrders,
  analyticsLineFilter,
  analyticsOrdersSummary,
  analyticsPallets,
  analyticsProductFilter,
  analyticsShiftKpis,
  analyticsTimelineData,
  handleExportShiftToExcel,
  handleOpenPalletSticker,
  handleTogglePalletPrinted,
  isAr,
  itemsMaster,
  productionProcesses,
  productionShifts,
  setAnalyticsDate,
  setAnalyticsLineFilter,
  setAnalyticsProductFilter,
  todayCalendarDateStr,
  workOrders
}) {
  return (
    <>
      {(() => {
        const selectedShiftRecord = productionShifts.find((s) => s.shiftDate === analyticsDate && s.status === 'closed');
        const isSelectedShiftClosed = Boolean(selectedShiftRecord);

        // Timeline Ruler Calculations
        const startMins = Math.min(480, timeToMins(analyticsShiftKpis.shiftStartDisplay || '08:00'));
        const endMins = Math.max(1020, timeToMins(analyticsShiftKpis.shiftEndDisplay || '17:00'));
        const totalSpan = Math.max(60, endMins - startMins);
        const getPct = (m) => Math.max(0, Math.min(100, ((m - startMins) / totalSpan) * 100));

        // Generate hourly markers
        const hourMarkers = [];
        const firstHour = Math.floor(startMins / 60) * 60;
        for (let hm = firstHour; hm <= endMins; hm += 60) {
          hourMarkers.push({
            min: hm,
            label: minsToTime(hm),
            pct: getPct(hm),
          });
        }

        // Available products for filter dropdown
        const availableProducts = Array.from(
          new Set(workOrders.filter((o) => o.planDate === analyticsDate).map((o) => o.finishedProductId))
        ).filter(Boolean);

        return (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 1. Header & Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shrink-0">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
                    <span>{isAr ? 'الجدول الزمني وسجل تحليلات الوردية' : 'Shift Timeline & Analytics'}</span>
                    {isSelectedShiftClosed ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{isAr ? 'وردية مقفلة وموثقة' : 'Shift Sealed'}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{isAr ? 'وردية نشطة / مفتوحة' : 'Active Shift'}</span>
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {isAr
                      ? 'متابعة الخط الزمني الحي لإنتاج الصالة، محطات تسليم الباليتات، التوقفات، وتصدير تقرير شامل للوردية.'
                      : 'Live production timeline, pallet checkpoints, downtime analysis, and comprehensive Excel export.'}
                  </p>
                </div>
              </div>

              {/* Filter controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Date Picker & Today Button */}
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                  <Calendar className="h-4 w-4 text-slate-400 ms-1.5" />
                  <input
                    type="date"
                    value={analyticsDate}
                    onChange={(e) => setAnalyticsDate(e.target.value)}
                    className="bg-transparent text-xs font-bold font-mono text-slate-800 focus:outline-hidden py-1 px-1.5"
                  />
                  <button
                    type="button"
                    onClick={() => setAnalyticsDate(todayCalendarDateStr)}
                    className="px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 shadow-2xs transition cursor-pointer"
                  >
                    {isAr ? 'اليوم' : 'Today'}
                  </button>
                </div>

                {/* Line Filter */}
                <select
                  value={analyticsLineFilter}
                  onChange={(e) => setAnalyticsLineFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">{isAr ? 'جميع خطوط الإنتاج' : 'All Lines'}</option>
                  {productionProcesses.map((p) => (
                    <option key={p.id} value={p.processCode || p.id}>
                      {isAr ? p.nameAr : (p.nameEn || p.nameAr)}
                    </option>
                  ))}
                </select>

                {/* Product Filter */}
                <div className="w-48 sm:w-56">
                  <SearchableSelect
                    value={analyticsProductFilter === 'all' ? '' : analyticsProductFilter}
                    onChange={(val) => setAnalyticsProductFilter(val || 'all')}
                    options={availableProducts.map((pId) => {
                      const item = itemsMaster.find((itm) => itm.id === pId || itm.code === pId);
                      return {
                        value: pId,
                        label: isAr ? (item?.nameAr || pId) : (item?.nameEn || item?.nameAr || pId),
                        sublabel: pId,
                      };
                    })}
                    placeholder={isAr ? 'جميع المنتجات' : 'All Products'}
                    isAr={isAr}
                  />
                </div>

                {/* Export to Excel Button */}
                <button
                  type="button"
                  onClick={handleExportShiftToExcel}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-2 transition cursor-pointer"
                  title={isAr ? 'تصدير التقرير الكامل بصيغة Excel' : 'Export Full Shift Report to Excel'}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>{isAr ? 'تصدير إكسيل (XLSX)' : 'Export Excel'}</span>
                </button>
              </div>
            </div>

            {/* 2. Shift Seal Status Banner (if closed) */}
            {selectedShiftRecord && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-extrabold text-emerald-950 text-sm">
                      {isAr ? 'تم إغلاق وتوثيق هذه الوردية بنجاح' : 'This shift has been officially sealed'}
                    </div>
                    <div className="text-emerald-700 font-medium mt-0.5">
                      {isAr ? 'أُغلقت في:' : 'Sealed at:'} <b className="font-mono">{new Date(selectedShiftRecord.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
                      {' '}• {isAr ? 'بواسطة:' : 'By:'} <b className="font-semibold">{selectedShiftRecord.endedBy}</b>
                      {selectedShiftRecord.notes && ` • "${selectedShiftRecord.notes}"`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-emerald-900 font-mono font-bold bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200 shrink-0">
                  <div>
                    <span className="text-[10px] text-emerald-600 block">{isAr ? 'الكراتين المعتمدة' : 'Cartons'}</span>
                    <span className="text-sm font-black">{selectedShiftRecord.totalCartonsLarge}</span>
                  </div>
                  <div className="border-s border-emerald-200 ps-4">
                    <span className="text-[10px] text-emerald-600 block">{isAr ? 'الباليتات' : 'Pallets'}</span>
                    <span className="text-sm font-black">{selectedShiftRecord.totalPallets}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. KPI Scorecards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Total Cartons */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{isAr ? 'إجمالي الكراتين' : 'Total Cartons'}</span>
                </span>
                <div className="text-xl font-black font-mono text-slate-900">
                  {analyticsOrdersSummary.totalCartons.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {isAr ? 'وحدات كبرى معبأة' : 'Large units produced'}
                </span>
              </div>

              {/* Total Pallets */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 text-cyan-500" />
                  <span>{isAr ? 'الباليتات المنجزة' : 'Total Pallets'}</span>
                </span>
                <div className="text-xl font-black font-mono text-slate-900">
                  {analyticsOrdersSummary.totalPallets}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {isAr ? 'محطات تسليم تامة' : 'Completed checkpoints'}
                </span>
              </div>

              {/* Net Prod Time */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{isAr ? 'وقت التشغيل الفعلي' : 'Net Production'}</span>
                </span>
                <div className="text-xl font-black font-mono text-emerald-700">
                  {Math.floor(analyticsShiftKpis.totalProdMins / 60)}h {analyticsShiftKpis.totalProdMins % 60}m
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {analyticsShiftKpis.totalProdMins} {isAr ? 'دقيقة' : 'mins'}
                </span>
              </div>

              {/* Breaks */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                  <Coffee className="h-3.5 w-3.5 text-amber-500" />
                  <span>{isAr ? 'فترات الراحة' : 'Breaks'}</span>
                </span>
                <div className="text-xl font-black font-mono text-amber-700">
                  {analyticsShiftKpis.totalBreakMins} {isAr ? 'د' : 'm'}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {analyticsBreaks.length} {isAr ? 'فترات مسجلة' : 'logged breaks'}
                </span>
              </div>

              {/* Downtime / Gaps */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                  <span>{isAr ? 'الوقت غير المستغل' : 'Downtime / Idle'}</span>
                </span>
                <div className="text-xl font-black font-mono text-rose-700">
                  {analyticsShiftKpis.totalWasteMins} {isAr ? 'د' : 'm'}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {analyticsShiftKpis.wasteGaps.length} {isAr ? 'فجوات تشغيل' : 'unplanned gaps'}
                </span>
              </div>

              {/* OEE / Efficiency */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-purple-500" />
                  <span>{isAr ? 'كفاءة الوقت (OEE)' : 'Time Efficiency'}</span>
                </span>
                <div className={`text-xl font-black font-mono ${analyticsShiftKpis.timeEfficiencyPct >= 85 ? 'text-emerald-700' : analyticsShiftKpis.timeEfficiencyPct >= 70 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {analyticsShiftKpis.timeEfficiencyPct}%
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {isAr ? 'نسبة استغلال الساعات' : 'Operational utilization'}
                </span>
              </div>
            </div>

            {/* 4. Interactive Shift Timeline Canvas */}
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-extrabold text-base text-slate-900">
                    {isAr ? 'الخط الزمني المرئي لإنتاج الوردية' : 'Visual Production Timeline'}
                  </h3>
                  <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    {minsToTime(startMins)} {isAr ? '←' : '➔'} {minsToTime(endMins)}
                  </span>
                </div>

                {/* Timeline Legend */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded bg-indigo-500 inline-block" />
                    <span>{isAr ? 'تشغيل فعلي' : 'Production'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-cyan-600 inline-block border-2 border-white shadow-xs" />
                    <span>{isAr ? 'نقطة باليتة (P#)' : 'Pallet Pin'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded bg-amber-400 inline-block" />
                    <span>{isAr ? 'استراحة' : 'Break'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded bg-rose-300 inline-block" />
                    <span>{isAr ? 'توقف / فراغ' : 'Idle Gap'}</span>
                  </span>
                </div>
              </div>

              {/* Timeline Container */}
              <div className="pt-8 pb-4 px-2 overflow-x-auto">
                <div className="min-w-[800px] relative">
                  {/* Time Ruler (Hour marks) */}
                  <div className="relative h-6 border-b border-slate-200 mb-6">
                    {hourMarkers.map((hm) => (
                      <div
                        key={hm.min}
                        className="absolute -top-1 -translate-x-1/2 flex flex-col items-center"
                        style={{ left: `${hm.pct}%` }}
                      >
                        <span className="text-[10px] font-mono font-bold text-slate-400">{hm.label}</span>
                        <div className="h-2 w-px bg-slate-300 mt-0.5" />
                      </div>
                    ))}
                  </div>

                  {/* Lane 1: Pallet Checkpoint Pins */}
                  <div className="relative h-12 mb-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl px-2">
                    <span className="absolute -top-3 start-3 text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                      <QrCode className="h-3 w-3" />
                      <span>{isAr ? 'محطات إنجاز الباليتات (Checkpoints)' : 'Pallet Checkpoints'}</span>
                    </span>

                    {analyticsPallets.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[11px] text-slate-400 font-semibold">
                        {isAr ? 'لا توجد باليتات مكتملة مسجلة في هذا التاريخ' : 'No completed pallets on this date'}
                      </div>
                    ) : (
                      analyticsPallets.map((p, idx) => {
                        const pct = getPct(p.timeMins);
                        return (
                          <div
                            key={p.palletId || idx}
                            className="absolute top-2 -translate-x-1/2 group cursor-pointer"
                            style={{ left: `${pct}%` }}
                            onClick={() => handleOpenPalletSticker(p.pallet, p.order)}
                          >
                            <div className="flex flex-col items-center">
                              <span className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[10px] font-mono font-black shadow-xs transition group-hover:scale-110 flex items-center gap-0.5">
                                <span>P#{p.palletNumber}</span>
                                {p.isPrinted && <Check className="h-2.5 w-2.5 text-emerald-300" />}
                              </span>
                              <div className="h-3 w-0.5 bg-indigo-600 mt-0.5" />
                            </div>

                            {/* Hover tooltip */}
                            <div className="hidden group-hover:block absolute bottom-full mb-1 start-1/2 -translate-x-1/2 z-20 w-44 p-2 bg-slate-900 text-white rounded-xl shadow-xl text-[10px] space-y-1 pointer-events-none">
                              <div className="font-extrabold text-indigo-300 border-b border-slate-700 pb-1 flex justify-between">
                                <span>باليتة #{p.palletNumber}</span>
                                <span className="font-mono">{p.time}</span>
                              </div>
                              <div className="truncate font-semibold">{p.productNameAr}</div>
                              <div className="flex justify-between text-slate-400 font-mono">
                                <span>{p.qtyLarge} كرتونة</span>
                                <span>أمر #{p.orderNumber}</span>
                              </div>
                              <div className="text-[9px] text-emerald-400 font-bold">
                                {p.isPrinted ? '✓ مطبوع الاستيكر' : '⚠ بانتظار الطباعة'}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Lane 2: Production Segments & Gaps */}
                  <div className="relative h-12 bg-slate-100/80 border border-slate-200 rounded-2xl overflow-hidden">
                    {/* Render Waste Gaps */}
                    {analyticsShiftKpis.wasteGaps.map((g, gIdx) => {
                      const left = getPct(g.startMin);
                      const right = getPct(g.endMin);
                      const width = Math.max(0.8, right - left);
                      return (
                        <div
                          key={`gap-${gIdx}`}
                          className="absolute top-0 bottom-0 bg-rose-200/60 border-x border-rose-300 flex items-center justify-center overflow-hidden"
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={isAr ? `توقف غير مجدول: ${g.durationMins} دقيقة (${g.startTime} - ${g.endTime})` : `Unplanned gap: ${g.durationMins}m`}
                        >
                          {width > 4 && (
                            <span className="text-[9px] font-mono font-bold text-rose-800 truncate px-1">
                              {g.durationMins}د
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Render Breaks */}
                    {analyticsBreaks.map((b, bIdx) => {
                      const sM = timeToMins(b.startTime);
                      const eM = b.endTime ? timeToMins(b.endTime) : sM + (b.durationMins || 0);
                      const left = getPct(sM);
                      const right = getPct(eM);
                      const width = Math.max(1, right - left);
                      return (
                        <div
                          key={`break-${b.id || bIdx}`}
                          className="absolute top-0 bottom-0 bg-amber-300/80 border-x border-amber-400 flex items-center justify-center overflow-hidden z-10"
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={isAr ? `استراحة: ${b.name || 'راحة'} (${b.durationMins} دقيقة)` : `Break: ${b.durationMins}m`}
                        >
                          {width > 3 && (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-amber-950 px-1 truncate">
                              <Coffee className="h-3 w-3 shrink-0" />
                              <span>{b.name || 'راحة'}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Render Order Segments */}
                    {analyticsTimelineData.map((seg, sIdx) => {
                      const sM = timeToMins(seg.startTime);
                      const eM = timeToMins(seg.endTime);
                      const left = getPct(sM);
                      const right = getPct(eM);
                      const width = Math.max(1, right - left);
                      return (
                        <div
                          key={seg.segmentId || sIdx}
                          className="absolute top-1 bottom-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-2 flex items-center justify-between text-[10px] font-bold shadow-xs transition z-10 overflow-hidden cursor-pointer"
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${seg.productNameAr} (أمر #${seg.orderNumber}) [${seg.startTime} - ${seg.endTime}]`}
                        >
                          <span className="truncate flex items-center gap-1">
                            <span className="font-mono">#{seg.orderNumber}</span>
                            <span className="opacity-90">{seg.productNameAr}</span>
                          </span>
                          {width > 6 && (
                            <span className="font-mono text-[9px] opacity-80 shrink-0 ms-1">
                              {seg.durationMins}د
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Tabular Breakdown Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Panel A: Executed Work Orders Breakdown */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        {isAr ? 'أوامر التشغيل المجدولة والمنفذة' : 'Executed Work Orders'}
                      </h4>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {analyticsFilteredOrders.length} {isAr ? 'أوامر تشغيل' : 'orders'}
                      </span>
                    </div>
                  </div>
                </div>

                {analyticsFilteredOrders.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                    {isAr ? 'لا توجد أوامر تشغيل مطابقة للفلاتر في هذا التاريخ.' : 'No matching work orders.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {analyticsFilteredOrders.map((ord) => {
                      const plannedLarge = ord.plannedOutputQtyLarge || ord.targetQtyLarge || 0;
                      const finishedLarge = ord.finishedQtyLarge || 0;
                      const pct = plannedLarge > 0 ? Math.min(100, Math.round((finishedLarge / plannedLarge) * 100)) : 0;

                      return (
                        <div key={ord.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-indigo-700">#{ord.orderNumber}</span>
                              <span className="font-bold text-slate-900 truncate">{ord.productNameAr}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                              <span>{ord.productionLine || 'خط رئيسي'}</span>
                              <span>•</span>
                              <span>{finishedLarge} / {plannedLarge} {ord.outputLargeUnit || 'كرتونة'}</span>
                              <span>({pct}%)</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ord.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : ord.status === 'in_progress'
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {ord.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : ord.status === 'in_progress' ? (isAr ? 'قيد التنفيذ' : 'Running') : (isAr ? 'مجدول' : 'Planned')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Panel B: Pallets Checkpoints Log */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-cyan-50 text-cyan-700 rounded-xl">
                      <QrCode className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        {isAr ? 'سجل الباليتات والتشغيلات' : 'Pallets & Batches Log'}
                      </h4>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {analyticsPallets.length} {isAr ? 'باليتة منتجة' : 'pallets produced'}
                      </span>
                    </div>
                  </div>
                </div>

                {analyticsPallets.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                    {isAr ? 'لا توجد باليتات مكتملة في هذا التاريخ.' : 'No pallets logged.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {analyticsPallets.map((p, idx) => (
                      <div key={p.palletId || idx} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 shrink-0">
                            P#{p.palletNumber}
                          </span>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 truncate block text-[11px]">{p.productNameAr}</span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                              <span>أمر #{p.orderNumber}</span>
                              <span>•</span>
                              <span>{p.qtyLarge} كرتونة</span>
                              <span>•</span>
                              <span>{p.time}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.isPrinted ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                              <PrinterCheck className="h-2.5 w-2.5" />
                              <span>{isAr ? `مطبوع (${p.printCount})` : `Printed (${p.printCount})`}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                              <Printer className="h-2.5 w-2.5" />
                              <span>{isAr ? 'بانتظار الطباعة' : 'Unprinted'}</span>
                            </span>
                          )}

                          {/* Manual Print Confirmation / Toggle Button */}
                          <button
                            type="button"
                            onClick={() => handleTogglePalletPrinted(p.pallet, p.order)}
                            className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 ${
                              p.isPrinted
                                ? 'bg-emerald-100/70 border-emerald-300 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title={p.isPrinted ? (isAr ? 'تم تأكيد الطباعة - انقر للإلغاء' : 'Print confirmed - Click to clear') : (isAr ? 'تأكيد الطباعة يدوياً' : 'Confirm printed manually')}
                          >
                            <CheckCheck className={`h-3 w-3 ${p.isPrinted ? 'text-emerald-700' : 'text-slate-400'}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenPalletSticker(p.pallet, p.order)}
                            className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                            title={isAr ? 'عرض وطباعة الاستيكر' : 'View Sticker'}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
