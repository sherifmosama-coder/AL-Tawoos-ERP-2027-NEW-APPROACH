import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  GitFork,
  Truck,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  Scale,
  Boxes,
  FileText,
  Receipt,
  Sparkles,
  CheckCircle2,
  Info,
  RefreshCw
} from 'lucide-react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  calculateSalesOrderLineTotals,
  aggregateSalesOrderTotals,
  allocateIntegersProportionally
} from '../utils/salesOrderUtils';

/**
 * Interactive Order Splitting Matrix Modal
 * Allows splitting a Pending ('not_yet') Sales Order across multiple truck/portion columns
 * (#0001 -> #0001 (1/N), #0001 (2/N), ...) with real-time per-SKU alignment validation,
 * optional truck capacity estimator + assignment checkbox, and financial document mode selection.
 */
export default function OrderSplitModal({
  isOpen,
  onClose,
  order,
  baseSerial = '0001',
  vehicles = [],
  employees = [],
  resolveVehicleDisplayName,
  isAr = true,
  currentUserName = 'مستخدم معتمد',
  currentUserId = 'usr_unknown',
  onSplitSuccess = null
}) {
  const lines = useMemo(() => (Array.isArray(order?.lines) ? order.lines : []), [order]);

  // Financial document mode: 'split_per_portion' | 'merged_on_parent'
  const [invoiceSplitMode, setInvoiceSplitMode] = useState('split_per_portion');

  // Dynamic portion columns: start with 2 portions
  const [columns, setColumns] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initialize 2 empty portion columns (putting all initial qty in column 1 by default OR balanced half/half? Start 50/50 split so user sees how it works immediately!)
  useEffect(() => {
    if (!isOpen || !order) return;
    setErrorMsg('');
    setInvoiceSplitMode('split_per_portion');

    const col0Quantities = {};
    const col1Quantities = {};
    (order.lines || []).forEach((line, idx) => {
      const totalCtn = Math.max(0, Math.round((Number(line.qty) || 0) + (Number(line.bonus) || 0)));
      const firstHalf = Math.ceil(totalCtn / 2);
      col0Quantities[idx] = firstHalf;
      col1Quantities[idx] = Math.max(0, totalCtn - firstHalf);
    });

    setColumns([
      {
        id: 'col_1',
        vehicleId: '',
        assignTruckToOrder: false,
        qtyByLine: col0Quantities
      },
      {
        id: 'col_2',
        vehicleId: '',
        assignTruckToOrder: false,
        qtyByLine: col1Quantities
      }
    ]);
  }, [isOpen, order]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isOpen && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSaving, onClose]);

  // Row target totals & alignment check
  const rowStats = useMemo(() => {
    return lines.map((line, lineIdx) => {
      const paidQty = Math.max(0, Math.round(Number(line.qty) || 0));
      const bonusQty = Math.max(0, Math.round(Number(line.bonus) || 0));
      const targetCartons = paidQty + bonusQty;
      const allocatedSum = columns.reduce(
        (sum, col) => sum + Math.max(0, Math.round(Number(col.qtyByLine?.[lineIdx]) || 0)),
        0
      );
      const diff = targetCartons - allocatedSum;
      const unitWeightKg = Number(line.largeUnitWeightKg) || 0;
      return {
        lineIdx,
        line,
        paidQty,
        bonusQty,
        targetCartons,
        allocatedSum,
        diff,
        unitWeightKg,
        isAligned: diff === 0
      };
    });
  }, [lines, columns]);

  // Column telemetry (Cartons, Weight vs Truck Max Capacity)
  const columnStats = useMemo(() => {
    return columns.map((col, colIdx) => {
      let totalCartons = 0;
      let totalWeightKg = 0;

      lines.forEach((line, lineIdx) => {
        const ctn = Math.max(0, Math.round(Number(col.qtyByLine?.[lineIdx]) || 0));
        totalCartons += ctn;
        totalWeightKg += ctn * (Number(line.largeUnitWeightKg) || 0);
      });

      const veh = vehicles.find((v) => v.id === col.vehicleId) || null;
      const maxCapKg = Number(veh?.maxCapacityKg) || 0;
      const pct = maxCapKg > 0 ? Math.min(130, Math.round((totalWeightKg / maxCapKg) * 100)) : 0;
      const isOverweight = maxCapKg > 0 && totalWeightKg > maxCapKg;
      const isNearCapacity = maxCapKg > 0 && !isOverweight && pct >= 85;

      return {
        colIdx,
        totalCartons,
        totalWeightKg,
        veh,
        maxCapKg,
        pct,
        isOverweight,
        isNearCapacity,
        serialPreview: `${baseSerial} (${colIdx + 1}/${columns.length})`
      };
    });
  }, [columns, lines, vehicles, baseSerial]);

  const allRowsAligned = rowStats.length > 0 && rowStats.every((r) => r.isAligned);
  const allColumnsNonEmpty = columnStats.length >= 2 && columnStats.every((c) => c.totalCartons > 0);
  const allAssignChecksValid = columns.every((c) => !c.assignTruckToOrder || Boolean(c.vehicleId));
  const canSubmit = allRowsAligned && allColumnsNonEmpty && allAssignChecksValid && !isSaving;

  if (!isOpen || !order) return null;

  const totalOrderCartons = rowStats.reduce((s, r) => s + r.targetCartons, 0);
  const totalOrderWeightKg = rowStats.reduce((s, r) => s + r.targetCartons * r.unitWeightKg, 0);

  // Handlers
  const handleAddColumn = () => {
    if (columns.length >= 10) return;
    const emptyQty = {};
    lines.forEach((_, idx) => {
      emptyQty[idx] = 0;
    });
    setColumns((prev) => [
      ...prev,
      {
        id: `col_${Date.now()}_${prev.length + 1}`,
        vehicleId: '',
        assignTruckToOrder: false,
        qtyByLine: emptyQty
      }
    ]);
  };

  const handleRemoveColumn = (colIdx) => {
    if (columns.length <= 2) return;
    setColumns((prev) => prev.filter((_, idx) => idx !== colIdx));
  };

  const handleCellChange = (colIdx, lineIdx, rawVal) => {
    const num = Math.max(0, parseInt(rawVal, 10) || 0);
    setColumns((prev) =>
      prev.map((col, idx) =>
        idx === colIdx
          ? { ...col, qtyByLine: { ...col.qtyByLine, [lineIdx]: num } }
          : col
      )
    );
  };

  const handleVehicleChange = (colIdx, vehicleId) => {
    setColumns((prev) =>
      prev.map((col, idx) =>
        idx === colIdx
          ? {
              ...col,
              vehicleId,
              assignTruckToOrder: vehicleId ? col.assignTruckToOrder : false
            }
          : col
      )
    );
  };

  const handleToggleAssignTruck = (colIdx, checked) => {
    setColumns((prev) =>
      prev.map((col, idx) =>
        idx === colIdx ? { ...col, assignTruckToOrder: Boolean(checked) } : col
      )
    );
  };

  // Helper: Evenly divide every SKU across all current columns
  const handleEvenSplit = () => {
    const n = columns.length;
    setColumns((prev) =>
      prev.map((col, colIdx) => {
        const nextQty = {};
        lines.forEach((line, lineIdx) => {
          const totalCtn = Math.max(0, Math.round((Number(line.qty) || 0) + (Number(line.bonus) || 0)));
          const base = Math.floor(totalCtn / n);
          const rem = totalCtn % n;
          nextQty[lineIdx] = base + (colIdx < rem ? 1 : 0);
        });
        return { ...col, qtyByLine: nextQty };
      })
    );
  };

  // Helper: Fill a row's remaining diff into the last column with 0 or target column
  const handleAutoBalanceRow = (lineIdx) => {
    const stat = rowStats[lineIdx];
    if (!stat || stat.diff === 0) return;
    const targetColIdx = columns.length - 1;
    setColumns((prev) =>
      prev.map((col, idx) => {
        if (idx !== targetColIdx) return col;
        const curr = Math.max(0, Math.round(Number(col.qtyByLine?.[lineIdx]) || 0));
        const next = Math.max(0, curr + stat.diff);
        return { ...col, qtyByLine: { ...col.qtyByLine, [lineIdx]: next } };
      })
    );
  };

  // Commit Split via Atomic Firestore Batch
  const handleConfirmSplit = async () => {
    setErrorMsg('');
    if (!allRowsAligned) {
      setErrorMsg(
        isAr
          ? 'يجب أن يتساوى مجموع الكميات الموزعة لكل صنف مع إجمالي الكمية الأصلية تماماً قبل الاعتماد.'
          : 'Allocated quantity per product must match the original total exactly before splitting.'
      );
      return;
    }
    if (!allColumnsNonEmpty) {
      setErrorMsg(
        isAr
          ? 'يجب أن يحتوي كل جزء / شاحنة على كرتونة واحدة على الأقل (أو احذف الأعمدة الفارغة).'
          : 'Every split portion column must contain at least 1 carton (or remove empty columns).'
      );
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const n = columns.length;
      const now = new Date();
      const vatMode = order.vatMode || 'none';

      // Pre-compute exact integer paidQty & bonusQty allocation per SKU across columns
      const lineAllocationsByCol = columns.map(() => []);

      rowStats.forEach(({ line, lineIdx, paidQty, bonusQty }) => {
        const colWeights = columns.map((c) => Math.max(0, Math.round(Number(c.qtyByLine?.[lineIdx]) || 0)));
        const colTotalTarget = colWeights;
        // Allocate paidQty & bonusQty independently via Largest Remainder so both sums match exactly,
        // and guarantee paid + bonus for each column matches colTotalTarget[colIdx]
        const paidAlloc = allocateIntegersProportionally(paidQty, colWeights);
        const bonusAlloc = colTotalTarget.map((tot, idx) => Math.max(0, tot - paidAlloc[idx]));
        // Verify bonus sum matches bonusQty (since sum(tot) === paidQty + bonusQty and sum(paidAlloc) === paidQty, sum(bonusAlloc) === bonusQty automatically!)
        columns.forEach((_, colIdx) => {
          const cPaid = paidAlloc[colIdx] || 0;
          const cBonus = bonusAlloc[colIdx] || 0;
          if (cPaid + cBonus > 0) {
            const calculated = calculateSalesOrderLineTotals(
              {
                ...line,
                qty: cPaid,
                bonus: cBonus
              },
              line.detectedUnitPrice || 0,
              Boolean(line.isPromotional),
              line.promoDiscountPct || 0,
              vatMode
            );
            lineAllocationsByCol[colIdx].push(calculated);
          }
        });
      });

      const splitChildrenSummary = [];

      columns.forEach((col, colIdx) => {
        const portionIndex = colIdx + 1;
        const portionSerial = `${baseSerial} (${portionIndex}/${n})`;
        const childId = `${order.id}_split_${portionIndex}`;
        const childLines = lineAllocationsByCol[colIdx];
        const financials = aggregateSalesOrderTotals(childLines, vatMode);

        // Truck assignment ONLY if user checked "Assign Truck to Order"
        const selectedVeh = col.assignTruckToOrder && col.vehicleId
          ? vehicles.find((v) => v.id === col.vehicleId)
          : null;

        let driverId = '';
        let driverName = '';
        if (selectedVeh?.driverUserId) {
          driverId = selectedVeh.driverUserId;
          const matchedEmp = employees.find((e) => e.id === selectedVeh.driverUserId);
          driverName = matchedEmp ? (matchedEmp.nameAr || matchedEmp.name) : (selectedVeh.driverName || '');
        }

        const assignedVehDisplayName = selectedVeh ? resolveVehicleDisplayName(selectedVeh) : '';

        // Strip parent-only split metadata if any, set clean child doc
        const childDoc = {
          id: childId,
          serial: portionSerial,
          baseSerial,
          splitIndex: portionIndex,
          splitTotal: n,
          splitParentId: order.id,
          splitParentSerial: baseSerial,
          isSplitParent: false,
          invoiceSplitMode,
          billingScope: invoiceSplitMode === 'merged_on_parent' ? 'covered_by_parent_invoice' : 'independent_portion',

          // Core customer, dates & commercial metadata inherited from Parent
          clientId: order.clientId || '',
          clientName: order.clientName || '',
          branchId: order.branchId || '',
          branchName: order.branchName || '',
          region: order.region || '',
          deliveryAddress: order.deliveryAddress || '',
          invoiceDate: order.invoiceDate || '',
          loadingDate: order.loadingDate || order.invoiceDate || '',
          isDatesLinked: Boolean(order.isDatesLinked),
          orderType: order.orderType || 'supply',
          isAdministrative: false,
          confirmationStatus: order.confirmationStatus || 'confirmed',
          isRevised: Boolean(order.isRevised),
          revisedAt: order.revisedAt || null,
          revisedBy: order.revisedBy || null,
          revisedById: order.revisedById || null,

          // Always stays Pending ('not_yet') when split from Sales Orders
          fulfillmentStatus: 'not_yet',
          loadingOrderNumber: null,
          assignedVehicleId: selectedVeh ? selectedVeh.id : '',
          assignedVehicleName: assignedVehDisplayName,
          assignedVehiclePlate: selectedVeh ? (selectedVeh.plateNumber || '') : '',
          assignedDriverId: driverId,
          assignedDriverName: driverName,
          assignedDeliveryRepId: '',
          assignedDeliveryRepName: '',

          vatMode,
          poTawoos: order.poTawoos || '',
          poPrivateLabel: order.poPrivateLabel || '',
          salesRep: order.salesRep || '',
          internalComments: order.internalComments || '',
          externalComments: order.externalComments || '',
          poAttachments: Array.isArray(order.poAttachments) ? [...order.poAttachments] : [],

          lines: childLines,
          ...financials,

          createdAt: serverTimestamp(),
          createdBy: currentUserName,
          createdById: currentUserId,
          updatedAt: serverTimestamp(),
          updatedBy: currentUserName,
          updatedById: currentUserId,

          auditTrail: [
            {
              id: `AUD-${Date.now()}-${portionIndex}`,
              action: 'split_child_created',
              performedBy: currentUserName,
              performedById: currentUserId,
              timestamp: now,
              summaryAr: `تم إنشاء الجزء #${portionSerial} ناتج عن تقسيم الأمر #${baseSerial} (${financials.totalCartons} كرتونة${assignedVehDisplayName ? ` — شاحنة مبدئية: ${assignedVehDisplayName}` : ''})`,
              summaryEn: `Created split portion #${portionSerial} from order #${baseSerial} (${financials.totalCartons} ctn${assignedVehDisplayName ? ` — Pre-selected truck: ${assignedVehDisplayName}` : ''})`,
              changes: {
                metadata: [
                  { labelAr: 'الأمر الأصلي', labelEn: 'Parent Order', newValue: `#${baseSerial}` },
                  { labelAr: 'الجزء', labelEn: 'Portion', newValue: `${portionIndex}/${n}` },
                  {
                    labelAr: 'نظام الفوترة',
                    labelEn: 'Financial Docs',
                    newValue: invoiceSplitMode === 'merged_on_parent' ? 'موحدة بالأصل' : 'مقسمة لكل شاحنة'
                  },
                  ...(assignedVehDisplayName
                    ? [{ labelAr: 'شاحنة مبدئية', labelEn: 'Assigned Truck', newValue: assignedVehDisplayName }]
                    : [])
                ],
                lineChanges: childLines.map((cl) => ({
                  productCode: cl.productCode,
                  productNameAr: cl.productNameAr,
                  productNameEn: cl.productNameEn,
                  type: 'added',
                  detailAr: `${cl.qty + cl.bonus} كرتونة (${cl.qty} مدفوع + ${cl.bonus} بونص)`,
                  detailEn: `${cl.qty + cl.bonus} cartons (${cl.qty} paid + ${cl.bonus} bonus)`
                }))
              }
            }
          ]
        };

        batch.set(doc(db, 'sales_orders', childId), childDoc);

        splitChildrenSummary.push({
          id: childId,
          serial: portionSerial,
          splitIndex: portionIndex,
          totalCartons: financials.totalCartons,
          totalWeightKg: financials.totalWeightKg,
          grandTotal: financials.grandTotal,
          assignedVehicleId: childDoc.assignedVehicleId,
          assignedVehicleName: assignedVehDisplayName
        });
      });

      // Update Parent Doc as immutable Split Reference
      const parentAuditEntry = {
        id: `AUD-${Date.now()}-PARENT`,
        action: 'split_parent',
        performedBy: currentUserName,
        performedById: currentUserId,
        timestamp: now,
        summaryAr: `تم تقسيم الأمر #${baseSerial} إلى ${n} أجزاء (${invoiceSplitMode === 'merged_on_parent' ? 'مستند مالي موحد بالأصل' : 'مستند مالي منفصل لكل جزء'})`,
        summaryEn: `Split order #${baseSerial} into ${n} portions (${invoiceSplitMode === 'merged_on_parent' ? 'Merged Parent Invoice' : 'Split Financial Docs'})`,
        changes: {
          metadata: [
            { labelAr: 'عدد الأجزاء', labelEn: 'Portions Count', newValue: String(n) },
            {
              labelAr: 'نظام الفوترة',
              labelEn: 'Invoice Split Mode',
              newValue: invoiceSplitMode === 'merged_on_parent' ? 'موحد على الأصل' : 'مقسم على الأجزاء'
            },
            {
              labelAr: 'الأجزاء الناتجة',
              labelEn: 'Generated Portions',
              newValue: splitChildrenSummary.map((c) => `#${c.serial} (${c.totalCartons} ctn)`).join(' | ')
            }
          ],
          lineChanges: []
        }
      };

      const existingAudit = Array.isArray(order.auditTrail) ? order.auditTrail : [];
      batch.set(
        doc(db, 'sales_orders', order.id),
        {
          isSplitParent: true,
          baseSerial,
          splitCount: n,
          splitChildren: splitChildrenSummary,
          invoiceSplitMode,
          billingScope: invoiceSplitMode === 'merged_on_parent' ? 'merged_on_parent' : 'split_to_portions',
          splitAt: serverTimestamp(),
          splitBy: currentUserName,
          splitById: currentUserId,
          updatedAt: serverTimestamp(),
          updatedBy: currentUserName,
          updatedById: currentUserId,
          auditTrail: [...existingAudit, parentAuditEntry]
        },
        { merge: true }
      );

      await batch.commit();
      if (onSplitSuccess) onSplitSuccess(order, splitChildrenSummary);
      onClose();
    } catch (err) {
      console.error('Error splitting sales order:', err);
      setErrorMsg(isAr ? 'تعذر تنفيذ تقسيم أمر البيع. يرجى المحاولة مرة أخرى.' : 'Failed to split order. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-3xl max-w-6xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shadow-inner">
              <GitFork className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-indigo-500/25 text-indigo-200 border border-indigo-400/30">
                  #{baseSerial}
                </span>
                <span className="text-xs font-bold text-slate-200">
                  {order.clientName || '—'}
                </span>
                {order.branchName && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    ({order.branchName})
                  </span>
                )}
              </div>
              <h3 className="text-base font-black mt-0.5">
                {isAr ? 'مصفوفة تقسيم أمر البيع إلى شحنات متعددة' : 'Split Sales Order Matrix Across Multiple Trucks'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-2 hover:bg-white/10 rounded-xl transition text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* Top Context & Financial Document Handling Mode */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            {/* Order Summary Card */}
            <div className="lg:col-span-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
                <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-indigo-600" />
                  <span>{isAr ? 'إجماليات الأمر الأصلي' : 'Original Order Totals'}</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700">
                  {isAr ? 'قيد الانتظار' : 'Pending'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">{isAr ? 'الأصناف' : 'SKUs'}</span>
                  <span className="font-mono font-black text-slate-900 text-sm">{lines.length}</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">{isAr ? 'الكراتين' : 'Cartons'}</span>
                  <span className="font-mono font-black text-indigo-700 text-sm">{totalOrderCartons}</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">{isAr ? 'الوزن' : 'Weight'}</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    {(totalOrderWeightKg / 1000).toFixed(2)} <span className="text-[10px] font-sans">t</span>
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  {isAr
                    ? 'لن تتغير حالة التنفيذ (تظل قيد الانتظار) حتى يتم تشغيلها من خطة التحميل.'
                    : 'Fulfillment status stays Pending until managed in Loading Plan.'}
                </span>
              </div>
            </div>

            {/* Financial Document Mode Selector */}
            <div className="lg:col-span-8 p-3.5 bg-indigo-50/40 border border-indigo-200/80 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <span>{isAr ? 'إعداد الفواتير والمستندات المالية بعد التقسيم:' : 'Financial Documents & Invoicing Handling:'}</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setInvoiceSplitMode('split_per_portion')}
                  className={`p-3 rounded-xl border text-start transition cursor-pointer flex items-start gap-2.5 ${
                    invoiceSplitMode === 'split_per_portion'
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-400/30'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <FileText className={`w-4 h-4 shrink-0 mt-0.5 ${invoiceSplitMode === 'split_per_portion' ? 'text-indigo-200' : 'text-indigo-600'}`} />
                  <div>
                    <div className="font-extrabold text-xs">
                      {isAr ? 'تقسيم الفاتورة / إذن التسليم لكل جزء' : 'Split Financial Documents Per Portion'}
                    </div>
                    <p className={`text-[10px] mt-0.5 leading-snug ${invoiceSplitMode === 'split_per_portion' ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {isAr
                        ? `يصدر مستند مالي مستقل لكل شحنة (${baseSerial} (1/${columns.length})..)`
                        : `Generate separate invoice / delivery note per truck (${baseSerial} (1/${columns.length})..)`}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setInvoiceSplitMode('merged_on_parent')}
                  className={`p-3 rounded-xl border text-start transition cursor-pointer flex items-start gap-2.5 ${
                    invoiceSplitMode === 'merged_on_parent'
                      ? 'bg-slate-900 text-white border-slate-950 shadow-sm ring-2 ring-slate-400/30'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 shrink-0 mt-0.5 ${invoiceSplitMode === 'merged_on_parent' ? 'text-amber-300' : 'text-slate-500'}`} />
                  <div>
                    <div className="font-extrabold text-xs">
                      {isAr ? `فاتورة / إذن تسليم واحد موحد للأمر #${baseSerial}` : `Single Merged Invoice on Parent #${baseSerial}`}
                    </div>
                    <p className={`text-[10px] mt-0.5 leading-snug ${invoiceSplitMode === 'merged_on_parent' ? 'text-slate-300' : 'text-slate-500'}`}>
                      {isAr
                        ? 'تقسم الكميات لوجستياً على الشاحنات مع إصدار مستند مالي موحد للأصل'
                        : 'Split logistics across trucks while keeping 1 consolidated financial document'}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Matrix Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-slate-800 text-xs">
                {isAr ? `مصفوفة توزيع الأصناف (${columns.length} أجزاء):` : `Allocation Matrix (${columns.length} Portions):`}
              </span>
              {allRowsAligned ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isAr ? 'كافة الأصناف متطابقة 100%' : 'All SKUs 100% Aligned'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isAr ? 'توجد كميات غير متطابقة بعد' : 'Pending Quantity Alignment'}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEvenSplit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold transition cursor-pointer shadow-2xs"
              >
                <Scale className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isAr ? 'توزيع متساوٍ تلقائي' : 'Even Split'}</span>
              </button>

              <button
                type="button"
                onClick={handleAddColumn}
                disabled={columns.length >= 10}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة شاحنة / جزء' : 'Add Truck / Portion'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Matrix Table */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto bg-white shadow-xs">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 align-top">
                  <th className="py-3 px-3 text-start min-w-[200px] sticky start-0 bg-slate-50 z-10 border-e border-slate-200">
                    <span className="font-black text-slate-800 block">
                      {isAr ? 'الصنف والكمية الكلية' : 'Product Line & Target'}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">
                      {isAr ? 'إجمالي الكراتين (شامل البونص)' : 'Total Cartons (incl. bonus)'}
                    </span>
                  </th>

                  {columns.map((col, colIdx) => {
                    const cStat = columnStats[colIdx];
                    return (
                      <th key={col.id} className="p-2.5 min-w-[210px] border-e border-slate-200 text-start font-normal">
                        <div className="space-y-2">
                          {/* Portion Title & Remove */}
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-200">
                              #{cStat.serialPreview}
                            </span>
                            {columns.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveColumn(colIdx)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title={isAr ? 'حذف هذا الجزء' : 'Remove portion'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Truck Capacity Estimator Dropdown */}
                          <div>
                            <select
                              value={col.vehicleId}
                              onChange={(e) => handleVehicleChange(colIdx, e.target.value)}
                              className="w-full py-1.5 px-2 bg-white border border-slate-300 rounded-xl text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                              <option value="">
                                {isAr ? '— اختر شاحنة (اختياري للسعة) —' : '— Select Truck (Optional) —'}
                              </option>
                              {vehicles.map((v) => {
                                const name = resolveVehicleDisplayName ? resolveVehicleDisplayName(v) : (v.vehicleModel || v.name || v.plateNumber);
                                const capT = Number(v.maxCapacityKg) > 0 ? ` (${(Number(v.maxCapacityKg) / 1000).toFixed(1)}t)` : '';
                                return (
                                  <option key={v.id} value={v.id}>
                                    {name}{capT}
                                  </option>
                                );
                              })}
                            </select>

                            {/* Checkbox right beside/under Truck selector asking whether to assign truck to order */}
                            <label
                              className={`mt-1.5 flex items-center gap-1.5 text-[10px] font-bold px-1.5 py-1 rounded-lg border transition ${
                                col.vehicleId
                                  ? col.assignTruckToOrder
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 cursor-pointer'
                                    : 'bg-white border-slate-200 text-slate-600 cursor-pointer hover:border-slate-300'
                                  : 'bg-slate-100/60 border-slate-200/70 text-slate-400 cursor-not-allowed'
                              }`}
                              title={
                                isAr
                                  ? 'تحديد ما إذا كان سيتم تثبيت هذه الشاحنة على هذا الجزء أم استخدامها لحساب الوزن فقط'
                                  : 'Check to pre-assign this truck to the child order, or leave unchecked for capacity estimation only'
                              }
                            >
                              <input
                                type="checkbox"
                                disabled={!col.vehicleId}
                                checked={Boolean(col.assignTruckToOrder)}
                                onChange={(e) => handleToggleAssignTruck(colIdx, e.target.checked)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                              <Truck className="w-3 h-3 shrink-0 rtl:-scale-x-100" />
                              <span className="truncate">
                                {isAr ? 'تعيين الشاحنة على الطلب' : 'Assign truck to order'}
                              </span>
                            </label>
                          </div>

                          {/* Column Live Telemetry & Capacity Gauge */}
                          <div className="p-2 rounded-xl bg-white border border-slate-200 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                              <span className={cStat.totalCartons === 0 ? 'text-rose-600' : 'text-slate-700'}>
                                {cStat.totalCartons} {isAr ? 'كرتونة' : 'ctn'}
                              </span>
                              <span className="text-slate-900 font-black">
                                {(cStat.totalWeightKg / 1000).toFixed(2)} {isAr ? 'طن' : 'Ton'}
                                <span className="text-slate-400 font-normal ms-1">({cStat.totalWeightKg.toFixed(0)} kg)</span>
                              </span>
                            </div>

                            {cStat.maxCapKg > 0 && (
                              <div className="space-y-0.5">
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      cStat.isOverweight
                                        ? 'bg-rose-500'
                                        : cStat.isNearCapacity
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, cStat.pct)}%` }}
                                  />
                                </div>
                                <div className={`text-[9px] font-bold flex items-center justify-between ${
                                  cStat.isOverweight ? 'text-rose-600' : cStat.isNearCapacity ? 'text-amber-700' : 'text-emerald-700'
                                }`}>
                                  <span>
                                    {cStat.isOverweight
                                      ? (isAr ? '⚠️ حمولة زائدة' : '⚠️ Overweight')
                                      : `${cStat.pct}% ${isAr ? 'سعة' : 'cap'}`}
                                  </span>
                                  <span className="font-mono text-slate-400">
                                    Max {(cStat.maxCapKg / 1000).toFixed(1)}t
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    );
                  })}

                  <th className="py-3 px-3 text-center min-w-[140px]">
                    <span className="font-black text-slate-800 block">
                      {isAr ? 'حالة المطابقة' : 'Row Validation'}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">
                      {isAr ? 'الموزع / الأصلي' : 'Allocated / Target'}
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {rowStats.map((r) => (
                  <tr key={r.lineIdx} className="hover:bg-slate-50/70 transition">
                    {/* Product Info */}
                    <td className="py-2.5 px-3 sticky start-0 bg-white z-10 border-e border-slate-200">
                      <div className="font-extrabold text-slate-900 leading-tight">
                        {isAr ? r.line.productNameAr : (r.line.productNameEn || r.line.productNameAr)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                          {r.line.productCode}
                        </span>
                        <span className="font-mono text-[11px] font-black text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                          {r.targetCartons} {isAr ? 'كرتونة' : 'ctn'}
                        </span>
                        {r.bonusQty > 0 && (
                          <span className="text-[9px] text-emerald-700 font-bold">
                            ({r.paidQty}+{r.bonusQty}b)
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          {r.unitWeightKg.toFixed(1)} kg
                        </span>
                      </div>
                    </td>

                    {/* Editable Qty Inputs */}
                    {columns.map((col, colIdx) => {
                      const val = Math.max(0, Math.round(Number(col.qtyByLine?.[r.lineIdx]) || 0));
                      return (
                        <td key={col.id} className="p-2.5 border-e border-slate-100 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max={r.targetCartons}
                              step="1"
                              value={val}
                              onChange={(e) => handleCellChange(colIdx, r.lineIdx, e.target.value)}
                              className={`w-24 py-1.5 px-2 text-center font-mono font-black text-sm rounded-xl border focus:outline-none focus:ring-2 ${
                                r.isAligned
                                  ? 'border-emerald-300 bg-emerald-50/30 text-slate-900 focus:ring-emerald-400'
                                  : 'border-amber-300 bg-white text-slate-900 focus:ring-indigo-500'
                              }`}
                            />
                          </div>
                          {val > 0 && (
                            <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                              {(val * r.unitWeightKg).toFixed(1)} kg
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Real-time Alignment Cell */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`font-mono text-xs font-black ${r.isAligned ? 'text-emerald-700' : r.diff < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                          {r.allocatedSum} / {r.targetCartons}
                        </span>
                        {r.isAligned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <Check className="w-3 h-3" />
                            <span>{isAr ? 'متطابق' : 'Aligned'}</span>
                          </span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border ${
                              r.diff > 0
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-rose-100 text-rose-900 border-rose-300'
                            }`}>
                              {r.diff > 0
                                ? (isAr ? `متبقي: ${r.diff}` : `Rem: +${r.diff}`)
                                : (isAr ? `زيادة: ${Math.abs(r.diff)}` : `Over: +${Math.abs(r.diff)}`)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAutoBalanceRow(r.lineIdx)}
                              className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                            >
                              {isAr ? 'موازنة آخر عمود' : 'Balance last'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] font-semibold text-slate-500">
            {!allColumnsNonEmpty ? (
              <span className="text-rose-600 font-bold">
                {isAr ? '• كل جزء يجب أن يحتوي على كرتونة واحدة على الأقل' : '• Each portion must have ≥ 1 carton'}
              </span>
            ) : !allRowsAligned ? (
              <span className="text-amber-700 font-bold">
                {isAr ? '• يرجى مطابقة مجموع الكميات لجميع الأصناف لتفعيل الاعتماد' : '• Align all product quantities to enable Split'}
              </span>
            ) : (
              <span className="text-emerald-700 font-bold">
                {isAr ? `جاهز لإنشاء ${columns.length} أجزاء من الأمر #${baseSerial}` : `Ready to create ${columns.length} portions from #${baseSerial}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleConfirmSplit}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <GitFork className="w-4 h-4" />}
              <span>
                {isAr ? `اعتماد وتقسيم الأمر (${columns.length} أجزاء)` : `Confirm Split (${columns.length} Portions)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
