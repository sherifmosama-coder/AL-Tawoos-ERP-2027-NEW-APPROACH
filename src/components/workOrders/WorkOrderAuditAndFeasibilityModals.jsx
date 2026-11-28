import React from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  Check,
  CheckCircle2,
  Copy,
  Flag,
  History,
  RotateCcw,
  X,
} from 'lucide-react';

export default function WorkOrderAuditAndFeasibilityModals({
  auditOrderData,
  copiedId,
  factoryWarehouse,
  feasibilityModalData,
  getOriginalReturnQty,
  isAr,
  setAuditOrderData,
  setCopiedId,
  setFeasibilityModalData
}) {
  return (
    <>
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
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-400 mt-0.5">
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
                    {auditOrderData.isRework && (() => {
                      const orig = getOriginalReturnQty(auditOrderData);
                      return orig ? (
                        <span className="px-2 py-0.2 bg-purple-50 text-purple-900 border border-purple-200 rounded font-bold text-[10px] inline-flex items-center gap-1 font-sans">
                          <RotateCcw className="h-3 w-3 text-purple-600" />
                          <span>{isAr ? 'أصل المرتجع:' : 'Orig Return:'} <b className="font-mono">{orig.qtyLarge} {orig.largeUnit} ({orig.qtySmall} {orig.smallUnit})</b></span>
                        </span>
                      ) : null;
                    })()}
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
                      {order.isRework && (() => {
                        const orig = getOriginalReturnQty(order);
                        return orig ? (
                          <span className="font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1 font-sans">
                            <RotateCcw className="h-3 w-3 text-purple-600" />
                            <span>{isAr ? 'أصل المرتجع:' : 'Orig Return:'} <b className="font-mono">{orig.qtyLarge} {orig.largeUnit} ({orig.qtySmall} {orig.smallUnit})</b></span>
                          </span>
                        ) : null;
                      })()}
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
                            {c.priorReservedFloor > 0 && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5" title={isAr ? `إجمالي الفعلي بالصالة: ${c.rawFloorStock?.toLocaleString()} - محجوز لأوامر سابقة: ${c.priorReservedFloor?.toLocaleString()}` : `Total on Floor: ${c.rawFloorStock} - Prior Reserved: ${c.priorReservedFloor}`}>
                                {isAr ? `(محجوز لأسبق: ${c.priorReservedFloor.toLocaleString()})` : `(prior reserved: ${c.priorReservedFloor.toLocaleString()})`}
                              </div>
                            )}
                          </td>

                          <td className="p-2.5 text-center font-mono font-bold">
                            <span className={c.isSufficientOverall ? 'text-slate-800' : 'text-rose-700'}>
                              {c.totalCompanyStock.toLocaleString()} {c.unit}
                            </span>
                            {c.priorReservedCompany > 0 && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5">
                                {isAr ? `(محجوز لأسبق: ${c.priorReservedCompany.toLocaleString()})` : `(prior reserved: ${c.priorReservedCompany.toLocaleString()})`}
                              </div>
                            )}
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
                          {c.priorReservedFloor > 0 && (
                            <span className="block text-[8px] text-slate-400 font-sans">-{c.priorReservedFloor.toLocaleString()}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block">{isAr ? 'كلياً' : 'Total'}</span>
                          <span className={`font-mono font-bold ${c.isSufficientOverall ? 'text-slate-800' : 'text-rose-700'}`}>
                            {c.totalCompanyStock.toLocaleString()} {c.unit}
                          </span>
                          {c.priorReservedCompany > 0 && (
                            <span className="block text-[8px] text-slate-400 font-sans">-{c.priorReservedCompany.toLocaleString()}</span>
                          )}
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
    </>
  );
}
