import React from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Edit3,
  ExternalLink,
  GitBranch,
  HelpCircle,
  Pause,
  Play,
  Plus,
  PowerOff,
  Printer,
  QrCode,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import PeacockLoader from '../PeacockLoader';

export default function AdminPalletAndEndShiftModals({
  activeStagedFloorPallets,
  adminDependencyModal,
  adminOrderStatusPromptModal,
  adminPalletActionsMenuModal,
  adminReversalModal,
  adminTransferGuidanceModal,
  canAdminModifyPallet,
  canReverse,
  completePromptModal,
  endShiftBreakEndTime,
  endShiftNotes,
  floorLiquidVessels,
  globalBreaks,
  handleCloseEndShiftBreak,
  handleConfirmCompleteWithFinalPallet,
  handleConfirmCompleteWithoutPallet,
  handleConfirmEndShift,
  handleExecuteAdminReversal,
  handleOpenAdminPalletEdit,
  handleOpenAdminPalletReversal,
  handleOpenBatchPrintStickers,
  handleOpenCompletePrompt,
  handleOpenTankOverrideModal,
  handlePauseOrder,
  handleSaveTankOverride,
  isAr,
  isFloorPalletPrinted,
  isGeneralAdmin,
  isSaving,
  isSealingShift,
  permissions,
  setAdminDependencyModal,
  setAdminPalletActionsMenuModal,
  setAdminReversalModal,
  setAdminTransferGuidanceModal,
  setCompletePromptModal,
  setEndShiftBreakEndTime,
  setEndShiftNotes,
  setShowEndShiftModal,
  setTankOverrideInput,
  setTankOverridePallet,
  setWaitingMaterialsPromptModal,
  shiftKpis,
  showEndShiftModal,
  tankOverrideInput,
  tankOverridePallet,
  todayCalendarDateStr,
  transfers,
  waitingMaterialsPromptModal,
  warehouses,
  workOrders
}) {
  return (
    <>
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
              {canAdminModifyPallet && (
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
              )}

              {/* Option B: Admin Reversal */}
              {canReverse && (
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
              )}

              {/* Option C: Tank Override */}
              {(isGeneralAdmin || permissions?.actions?.canAdminOverrideTanks) && (
                <button
                  type="button"
                  onClick={() => {
                    const p = adminPalletActionsMenuModal.pallet;
                    setAdminPalletActionsMenuModal({ open: false, order: null, pallet: null, pIdx: -1 });
                    handleOpenTankOverrideModal(p);
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
              )}
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

      {/* 4.5 WAITING MATERIALS PROMPT MODAL */}
      {waitingMaterialsPromptModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-amber-300 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'عجز خامات بالصالة - حفظ بحالة «بانتظار توفر الخامات»' : 'Floor Shortage - Save as Waiting Materials'}
                  </h3>
                  <span className="text-[11px] text-amber-600 font-bold">
                    {isAr ? 'الرصيد المتاح حالياً بصالة الإنتاج لا يغطي كمية هذه الباليتة' : 'Floor stock is insufficient for this pallet'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWaitingMaterialsPromptModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isAr
                ? 'لا يتوفر رصيد كافٍ من الخامات بصالة الإنتاج لخصم هذه الباليتة في الوقت الحالي. يمكنك حفظ الباليتة كمعلقة («بانتظار توفر الخامات») دون خصم أي خامات ودون ترحيلها للتام، أو طلب تحويل خامات من المستودعات المركزية:'
                : 'Insufficient floor stock to deduct this pallet right now. You can save it as "Waiting Materials" (no stock deducted & not staged to FG), or request warehouse transfer:'}
            </p>

            {/* Breakdown Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-start">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-2 text-start">{isAr ? 'الخامة' : 'Material'}</th>
                    <th className="p-2 text-center">{isAr ? 'المطلوب للباليتة' : 'Required'}</th>
                    <th className="p-2 text-center">{isAr ? 'المتاح بالصالة' : 'Floor Stock'}</th>
                    <th className="p-2 text-center text-rose-600">{isAr ? 'العجز' : 'Deficit'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {(waitingMaterialsPromptModal.shortComponents || []).map((sc, scIdx) => (
                    <tr key={scIdx} className="hover:bg-slate-50/50">
                      <td className="p-2 font-sans font-medium text-slate-900">
                        {sc.itemNameAr || sc.nameAr || sc.itemId}
                        {sc.isPipeFeeding && (
                          <span className="text-[10px] text-indigo-600 font-bold ms-1">
                            {isAr ? '(خزان سائل)' : '(Liquid Tank)'}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center text-slate-800 font-bold">{Number(sc.needed || sc.requiredTotal || 0).toFixed(1)} {sc.unit}</td>
                      <td className="p-2 text-center text-slate-600">{Number(sc.availableFloor ?? sc.available ?? 0).toFixed(1)} {sc.unit}</td>
                      <td className="p-2 text-center text-rose-600 font-bold">-{Number(sc.deficit || sc.floorDeficit || 0).toFixed(1)} {sc.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl text-[11px] text-blue-900 leading-relaxed flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                {isAr
                  ? 'عند حفظ الباليتة بحالة «بانتظار توفر الخامات»، ستظهر على بطاقة التشغيل بإطار برتقالي وشارة نبض تشير للنواقص. وفور ضخ أو تحويل الخامات وتوفرها بالصالة، سيتحول الإطار للأخضر ويظهر زر ترحيل الباليتة بنقرة واحدة.'
                  : 'Saving as "Waiting Materials" preserves the pallet record with a pulsing shortage chip without deducting inventory. Once stock is replenished, a 1-click stage button appears.'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setWaitingMaterialsPromptModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
              >
                {isAr ? 'إلغاء والتراجع' : 'Cancel'}
              </button>

              <div className="flex items-center gap-2">
                {waitingMaterialsPromptModal.onOpenAdminTransfer && (
                  <button
                    type="button"
                    onClick={waitingMaterialsPromptModal.onOpenAdminTransfer}
                    className="px-3.5 py-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    {isAr ? 'طلب تحويل مستودعي' : 'Transfer Request'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={waitingMaterialsPromptModal.onConfirmWaiting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock className="h-4 w-4" />
                  <span>{isAr ? 'حفظ بحالة «بانتظار توفر الخامات»' : 'Save as Waiting Materials'}</span>
                </button>
              </div>
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

      {showEndShiftModal && (() => {
        const runningOrders = workOrders.filter(
          (o) => o.planDate === todayCalendarDateStr && o.status === 'in_progress'
        );
        const openBreaks = globalBreaks.filter(
          (b) => b.date === todayCalendarDateStr && b.status === 'Active'
        );
        const stagedPallets = activeStagedFloorPallets;
        const unprintedPallets = stagedPallets.filter((p) => !isFloorPalletPrinted(p));

        // Shift Summary KPIs
        let totalCartons = 0;
        let totalPallets = 0;
        workOrders
          .filter((o) => o.planDate === todayCalendarDateStr && o.status !== 'cancelled')
          .forEach((o) => {
            totalCartons += Number(o.finishedQtyLarge || 0);
            totalPallets += Array.isArray(o.pallets) ? o.pallets.filter((p) => p.endTime).length : 0;
          });

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-auto max-h-[92vh] flex flex-col">
              {/* Header */}
              <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
                    <PowerOff className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-slate-900">
                      {isAr ? 'إنهاء وتوثيق وردية اليوم (End Shift)' : 'End & Seal Shift Wizard'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {isAr
                        ? `التحقق النهائي وإغلاق وردية تاريخ ${todayCalendarDateStr}`
                        : `Final verification and shift closure for ${todayCalendarDateStr}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEndShiftModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Wizard Content Body */}
              <div className="overflow-y-auto space-y-4 pe-1">
                {/* 1. Running Orders Check */}
                <div className={`p-4 rounded-2xl border ${runningOrders.length > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/70 border-emerald-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-xs flex items-center gap-1.5">
                      {runningOrders.length > 0 ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span className="text-amber-950">{isAr ? `تنبيه: يوجد (${runningOrders.length}) أوامر قيد التشغيل` : `${runningOrders.length} Orders In Progress`}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-950">{isAr ? 'جميع أوامر التشغيل مكتملة أو متوقفة مؤقتاً' : 'No Running Orders'}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {runningOrders.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <p className="text-[11px] text-amber-800">
                        {isAr
                          ? 'يُفضل إيقاف أو إنهاء الأوامر الجارية قبل إغلاق الوردية:'
                          : 'Please pause or finalize running orders before closing the shift:'}
                      </p>
                      {runningOrders.map((ord) => (
                        <div key={ord.id} className="p-2.5 bg-white border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="font-mono font-bold text-indigo-700">#{ord.orderNumber}</span>
                            <span className="ms-2 font-bold text-slate-900">{ord.productNameAr}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePauseOrder(ord)}
                              className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold text-[11px] transition cursor-pointer"
                            >
                              {isAr ? 'إيقاف مؤقت' : 'Pause'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCompletePrompt(ord)}
                              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] transition cursor-pointer"
                            >
                              {isAr ? 'إنهاء' : 'Complete'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Staged Pallets & Printing Check */}
                <div className={`p-4 rounded-2xl border ${unprintedPallets.length > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-xs flex items-center gap-1.5 text-slate-900">
                      <Boxes className="h-4 w-4 text-indigo-600" />
                      <span>{isAr ? 'طبالي أرضية الصالة وحالة الاستيكرات' : 'Floor Pallets & Labels'}</span>
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-600">
                      {stagedPallets.length} {isAr ? 'باليتة بالصالة' : 'pallets staged'}
                    </span>
                  </div>

                  {unprintedPallets.length > 0 ? (
                    <div className="p-3 bg-amber-100/70 border border-amber-300 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                        <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                        <span>{isAr ? `يوجد (${unprintedPallets.length}) باليتة بانتظار طباعة الاستيكر الإلزامي قبل الترحيل!` : `${unprintedPallets.length} unprinted pallets!`}</span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        {isAr ? 'قوانين التشغيل تلزم طباعة استيكر الباليتة لتسهيل استلامها بمستودع التام.' : 'Rules require label printing before transferring to FG.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleOpenBatchPrintStickers(unprintedPallets)}
                        className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>{isAr ? `طباعة استيكرات المعلقة دفعة واحدة (${unprintedPallets.length})` : `Batch Print Pending Labels (${unprintedPallets.length})`}</span>
                      </button>
                    </div>
                  ) : stagedPallets.length === 0 ? (
                    <div className="text-[11px] text-slate-600 font-semibold flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{isAr ? 'لا توجد طبالي متبقية على أرضية الصالة حالياً (تم ترحيل كافة الطبالي لمستودع التام).' : 'No staged pallets remaining on floor (all pallets transferred to FG).'}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{isAr ? `جميع الطبالي المتبقية بالصالة (${stagedPallets.length}) مطبوعة وجاهزة للترحيل أو البقاء بأمان.` : `All ${stagedPallets.length} remaining floor pallets are printed and ready.`}</span>
                    </div>
                  )}
                </div>

                {/* 3. Open Breaks Check */}
                <div className={`p-4 rounded-2xl border ${openBreaks.length > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-emerald-50/70 border-emerald-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-xs flex items-center gap-1.5">
                      {openBreaks.length > 0 ? (
                        <>
                          <Clock className="h-4 w-4 text-rose-600" />
                          <span className="text-rose-950">{isAr ? `يوجد (${openBreaks.length}) استراحة مفتوحة لم تُقفل` : `${openBreaks.length} Open Breaks`}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-950">{isAr ? 'جميع فترات الراحة مقفلة وموثقة' : 'All Breaks Closed'}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {openBreaks.length > 0 && (
                    <div className="space-y-2 mt-2">
                      <p className="text-[11px] text-rose-800">
                        {isAr ? 'يرجى تحديد وقت نهاية الاستراحة لإغلاقها قبل إنهاء الوردية:' : 'Specify end time to close open breaks:'}
                      </p>
                      {openBreaks.map((b) => (
                        <div key={b.id} className="p-3 bg-white border border-rose-200 rounded-xl space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-900">{b.name || (isAr ? 'استراحة' : 'Break')}</span>
                            <span className="font-mono text-slate-500">{isAr ? 'وقت البدء:' : 'Start:'} {b.startTime}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-600 shrink-0">{isAr ? 'وقت النهاية:' : 'End Time:'}</span>
                            <input
                              type="time"
                              value={endShiftBreakEndTime}
                              onChange={(e) => setEndShiftBreakEndTime(e.target.value)}
                              className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleCloseEndShiftBreak(b)}
                              className="ms-auto px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                            >
                              {isAr ? 'إغلاق الاستراحة' : 'Close Break'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Shift Summary & Metrics */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                  <span className="font-extrabold text-xs text-slate-900 block">
                    {isAr ? 'ملخص مخرجات اليوم الختامية' : 'Shift Output Summary'}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'إجمالي الكراتين' : 'Total Cartons'}</span>
                      <span className="text-lg font-black font-mono text-slate-950 block mt-0.5">{totalCartons.toLocaleString()}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'الباليتات المنجزة' : 'Total Pallets'}</span>
                      <span className="text-lg font-black font-mono text-indigo-700 block mt-0.5">{totalPallets}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'صافي التشغيل' : 'Net Production'}</span>
                      <span className="text-lg font-black font-mono text-emerald-700 block mt-0.5">{shiftKpis.totalProdMins}د</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'كفاءة الوردية' : 'OEE Efficiency'}</span>
                      <span className="text-lg font-black font-mono text-purple-700 block mt-0.5">{shiftKpis.timeEfficiencyPct}%</span>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-bold text-slate-600 block">
                      {isAr ? 'ملاحظات ختامية للوردية (اختياري):' : 'Closing Notes (Optional):'}
                    </label>
                    <textarea
                      value={endShiftNotes}
                      onChange={(e) => setEndShiftNotes(e.target.value)}
                      placeholder={isAr ? 'سجل أي ملاحظات خاصة بإنتاج اليوم أو تسليم الوردية التالية...' : 'Enter any notes about today\'s shift...'}
                      rows={2}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={handleConfirmEndShift}
                  disabled={isSealingShift || openBreaks.length > 0}
                  className={`flex-1 py-3 px-4 font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition ${
                    isSealingShift || openBreaks.length > 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white cursor-pointer'
                  }`}
                >
                  {isSealingShift ? (
                    <PeacockLoader size="xs" inline variant="white" />
                  ) : (
                    <PowerOff className="h-4 w-4" />
                  )}
                  <span>
                    {openBreaks.length > 0
                      ? (isAr ? 'يرجى إغلاق الاستراحة المفتوحة أولاً' : 'Close Open Breaks First')
                      : (isAr ? 'تأكيد إغلاق وتوثيق الوردية' : 'Confirm End & Seal Shift')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowEndShiftModal(false)}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
