import React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Layers,
  RefreshCw,
  RotateCcw,
  Scale,
  Warehouse,
  X,
} from 'lucide-react';
import VariantComboBox from '../VariantComboBox';
import { formatLotLabel } from '../../utils/stockResolver';

export default function ReworkReconcileModal({
  getOriginalReturnQty,
  handleAutoBalanceAllMatrix,
  handleAutoBalanceMatrixRow,
  handleSaveReworkReconciliation,
  handleUpdateMatrixField,
  isAr,
  isSaving,
  itemsMaster,
  liveStockMatrix,
  reconcileMatrixData,
  reconcilingOrder,
  renderMatrixTooltip,
  setHoveredMatrixTooltip,
  setPinnedMatrixTooltip,
  setReconcileMatrixData,
  setShowReworkReconcileModal,
  showReworkReconcileModal,
  validateReconcileMatrix,
  warehouses
}) {
  return (
    <>
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
    </>
  );
}
