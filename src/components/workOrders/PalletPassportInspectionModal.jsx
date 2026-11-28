import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Eye,
  Lock,
  Printer,
  QrCode,
  ShieldAlert,
  Trash2,
  User,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import BatchRangeDisplay from '../BatchRangeDisplay';
import { calculatePalletBatchRange } from '../../utils/inkjetBatchTranslator';

export default function PalletPassportInspectionModal({
  canAdminModifyPallet,
  canReverse,
  checkPalletStockAvailability,
  handleDeductAndStagePallet,
  handleDeletePallet,
  handleOpenAdminPalletMenu,
  handleOpenEditPallet,
  handleOpenTankOverrideModal,
  inspectPalletModal,
  isAr,
  isGeneralAdmin,
  isOrderLocked,
  isSaving,
  productionProcesses,
  resolvePalletLiquidTanks,
  selectedPlanDate,
  setImagePreviewModal,
  setInspectPalletModal
}) {
  return (
    <>
      {inspectPalletModal && (() => {
        const { order, pallet, pIdx } = inspectPalletModal;
        const isLocked = isOrderLocked(order);
        const isTransferred = pallet.stagingStatus === 'transferred_to_fg' || pallet.status === 'transferred_to_fg';

        const isWaiting = Boolean(pallet.isWaitingMaterials || pallet.status === 'waiting_materials' || pallet.stagingStatus === 'waiting_materials');
        const stockCheck = isWaiting ? checkPalletStockAvailability(order, pallet) : null;
        const isSufficient = stockCheck ? stockCheck.isSufficient : false;

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
                  <div className={`p-2.5 rounded-2xl border ${isWaiting ? (isSufficient ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-amber-50 text-amber-700 border-amber-300') : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-extrabold text-base text-slate-900">
                        {isAr ? `جواز سفر الباليتة #${pallet.palletNumber || pIdx + 1}` : `Pallet Passport #${pallet.palletNumber || pIdx + 1}`}
                      </h3>
                      {isWaiting ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 ${
                          isSufficient ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isSufficient ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                          <span>{isSufficient ? (isAr ? 'جاهز للصرف' : 'Stock Ready') : (isAr ? 'بانتظار توفر الخامات' : 'Waiting Materials')}</span>
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${qcConfig.bg}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${qcConfig.dot}`} />
                          <span>{qcConfig.label}</span>
                        </span>
                      )}
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

              {/* Waiting Materials Status Banner (Conditional) */}
              {isWaiting && (
                !isSufficient ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                        <span className="font-extrabold text-xs text-amber-950">
                          {isAr ? '⚠️ باليتة معلقة بحالة «بانتظار توفر الخامات»' : '⚠️ Pallet in "Waiting Materials" Status'}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900">
                        {isAr ? 'لم تخصم من المخزون' : 'No Stock Deducted'}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      {isAr
                        ? 'تم تسجيل هذه الباليتة دون خصم خامات من الصالة لعدم كفاية الرصيد وقت الإنتاج. تفاصيل عجز الخامات بالصالة حالياً:'
                        : 'Saved without stock deduction due to shortage at registration time. Current floor shortages:'}
                    </p>
                    <div className="space-y-1 font-mono text-[11px] bg-white/80 p-2.5 rounded-xl border border-amber-200">
                      {(stockCheck?.shortages || pallet.waitingMaterialsShortages || []).map((s, sIdx) => (
                        <div key={sIdx} className="flex items-center justify-between text-slate-800">
                          <span className="font-sans font-bold text-slate-900">
                            • {s.nameAr || s.comp?.materialNameAr || s.itemId} {s.isPipeFeeding ? (isAr ? '(خزان سائل)' : '(Liquid Tank)') : ''}
                          </span>
                          <span className="text-rose-600 font-bold">
                            {isAr ? 'عجز' : 'Deficit'}: {Number(s.deficit || 0).toFixed(1)} {s.unit || 'وحدة'} 
                            <span className="text-slate-400 font-normal ms-1 text-[10px]">
                              ({isAr ? 'المطلوب' : 'Req'} {Number(s.needed || 0).toFixed(1)} | {isAr ? 'المتاح' : 'Avail'} {Number(s.available || 0).toFixed(1)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-emerald-950 block">
                          {isAr ? 'الخامات متوفرة الآن بالكامل بصالة الإنتاج!' : 'Materials are now available on floor!'}
                        </span>
                        <span className="text-[11px] text-emerald-800">
                          {isAr ? 'يمكنك الآن صرف الخامات بنقرة واحدة ونقل الباليتة للتام الجاهز للترحيل.' : 'You can now deduct stock and stage this pallet in 1-click.'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleDeductAndStagePallet(order, pallet, pIdx)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-40"
                    >
                      <Zap className="h-4 w-4 text-amber-300" />
                      <span>{isAr ? 'صرف وترحيل للتام' : 'Stage to FG'}</span>
                    </button>
                  </div>
                )
              )}

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
                  <BatchRangeDisplay range={displayBatchCode} start={pallet.batchStart || bRange?.startBatch} end={pallet.batchEnd || bRange?.endBatch} />
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
                  {(isGeneralAdmin || canAdminModifyPallet || canReverse) && (
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

                  {isWaiting && isSufficient && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleDeductAndStagePallet(order, pallet, pIdx)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      title={isAr ? 'صرف الخامات بالكامل ونقل الباليتة للتام الجاهز للترحيل' : 'Deduct stock and stage to FG'}
                    >
                      <Zap className="h-4 w-4 text-amber-300" />
                      <span>{isAr ? 'صرف وترحيل للتام' : 'Stage to FG'}</span>
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
    </>
  );
}
