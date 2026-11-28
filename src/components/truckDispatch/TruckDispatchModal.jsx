import React, { useState, useEffect, useMemo } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDownLeft,
  Lock,
  PackageCheck,
  Plus,
  Truck,
  X,
} from 'lucide-react';
import { db, functions } from '../../firebase.js';
import { httpsCallable } from 'firebase/functions';
import { roundQty } from '../../utils/fgStockEngine.js';
import {
  buildTripDispatchMatrix,
  sumWorkerEffortPct,
  resolveProductAndOption,
  detectPostDispatchPlanChanges,
} from '../../utils/truckDispatchUtils.js';
import { ORDER_TYPE_META, fmtCtn } from './truckDispatchConstants.js';
import LabourEffortRosterEditor from './LabourEffortRosterEditor.jsx';

// DISPATCH MATRIX MODAL (Clients × Products/Options + Extras + Dual Labour)
// =========================================================================
export default function TruckDispatchModal({
  isOpen,
  onClose,
  trip,
  finishedProducts = [],
  workerPool = [],
  stockMatrixSkuMap = {},
  currentUser = {},
  canConfirmDispatch = false,
  onOpenClientProfile = null,
  onSaved,
  isAr = true,
}) {
  const existing = trip?.dispatchDoc || null;

  const { columns: initialColumns, clientRows } = useMemo(() => {
    if (!trip) return { columns: [], clientRows: [] };
    return buildTripDispatchMatrix({
      tripOrders: trip.orders,
      finishedProducts,
      existingDispatch: existing,
    });
  }, [trip, finishedProducts, existing]);

  const [columns, setColumns] = useState([]);
  const [extrasByCol, setExtrasByCol] = useState({});
  const [loadingWorkers, setLoadingWorkers] = useState([]);
  const [offloadingWorkers, setOffloadingWorkers] = useState([]);
  const [extraCatalogPick, setExtraCatalogPick] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !trip) return;
    setColumns(initialColumns);
    const extMap = {};
    initialColumns.forEach((c) => {
      extMap[c.colKey] = Number(c.extraQty || 0);
    });
    setExtrasByCol(extMap);
    setLoadingWorkers(Array.isArray(existing?.loadingWorkers) ? existing.loadingWorkers : []);
    setOffloadingWorkers(Array.isArray(existing?.offloadingWorkers) ? existing.offloadingWorkers : []);
    setDispatchNotes(existing?.dispatchNotes || '');
    setExtraCatalogPick('');
  }, [isOpen, trip?.id]);

  // All catalog SKU::Option variants not already in matrix for "+ Add Extra Variant"
  const extraColumnOptions = useMemo(() => {
    const existingKeys = new Set(columns.map((c) => c.colKey));
    const opts = [];
    finishedProducts.forEach((prod) => {
      if (prod.status === 'inactive') return;
      const code = String(prod.code || prod.id || '').trim();
      const rawOpts =
        Array.isArray(prod.packagingOptions) && prod.packagingOptions.length > 0
          ? prod.packagingOptions.filter((o) => o.isActive !== false)
          : [{ suffix: 'A', packagingRatio: prod.packagingRatio || 1 }];
      rawOpts.forEach((o) => {
        const meta = resolveProductAndOption(finishedProducts, code, o.suffix, o.packagingRatio);
        const key = `${meta.productCode}::${meta.optionSuffix}`;
        if (!existingKeys.has(key)) {
          opts.push({
            colKey: key,
            label: isAr ? `${meta.nameAr} [${meta.optionCode}]` : `${meta.nameEn} [${meta.optionCode}]`,
            meta,
          });
        }
      });
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label, isAr ? 'ar' : 'en'));
  }, [finishedProducts, columns, isAr]);

  if (!isOpen || !trip) return null;

  const handleAddExtraColumn = () => {
    if (!extraCatalogPick) return;
    const found = extraColumnOptions.find((o) => o.colKey === extraCatalogPick);
    if (!found) return;
    const { meta } = found;
    setColumns((prev) => [
      ...prev,
      {
        colKey: found.colKey,
        productId: meta.productId,
        productCode: meta.productCode,
        optionSuffix: meta.optionSuffix,
        optionCode: meta.optionCode,
        packagingRatio: meta.packagingRatio,
        nameAr: meta.nameAr,
        nameEn: meta.nameEn,
        shortNameAr: meta.shortNameAr,
        shortNameEn: meta.shortNameEn,
        optionNameAr: meta.optionNameAr,
        optionNameEn: meta.optionNameEn,
        imageFile: meta.imageFile,
        largeUnitName: meta.largeUnitName,
        lockedQty: 0,
        extraQty: 0,
      },
    ]);
    setExtrasByCol((prev) => ({ ...prev, [found.colKey]: 0 }));
    setExtraCatalogPick('');
  };

  const getAvailableOnShelfForCol = (col) => {
    const sku = stockMatrixSkuMap[col.productCode];
    if (!sku) return 0;
    if (col.optionSuffix === 'ANY') return Number(sku.physicalOnHandLarge || 0);
    const opt = (sku.optionsBreakdown || []).find((o) => o.suffix === col.optionSuffix);
    const base = opt ? Number(opt.physicalOnHandLarge || 0) : Number(sku.physicalOnHandLarge || 0);
    // Add back previously saved extra on THIS doc so editing doesn't falsely warn against itself
    const prevSavedCol = (existing?.columns || []).find((c) => c.colKey === col.colKey);
    return roundQty(base + Number(prevSavedCol?.extraQty || 0));
  };

  const loadingCheck = sumWorkerEffortPct(loadingWorkers);
  const offloadingCheck = sumWorkerEffortPct(offloadingWorkers);
  const crewsValid = loadingCheck.isBalanced && offloadingCheck.isBalanced;

  const totalLockedAll = roundQty(columns.reduce((s, c) => s + Number(c.lockedQty || 0), 0));
  const totalExtrasAll = roundQty(columns.reduce((s, c) => s + Number(extrasByCol[c.colKey] || 0), 0));
  const totalDispatchedAll = roundQty(totalLockedAll + totalExtrasAll);

  const handleConfirmDispatch = async () => {
    if (!canConfirmDispatch || !crewsValid) return;
    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);

      const savedCols = columns.map((c) => {
        const extraQty = roundQty(Math.max(0, Number(extrasByCol[c.colKey] || 0)));
        return {
          colKey: c.colKey,
          productId: c.productId,
          productCode: c.productCode,
          optionSuffix: c.optionSuffix,
          optionCode: c.optionCode,
          packagingRatio: c.packagingRatio,
          nameAr: c.nameAr,
          nameEn: c.nameEn,
          lockedQty: roundQty(c.lockedQty || 0),
          extraQty,
          totalDispatchedQty: roundQty((c.lockedQty || 0) + extraQty),
        };
      });

      const batch = writeBatch(db);
      const dispRef = doc(db, 'truck_dispatches', trip.id);

      const nextDispatchStatus =
        trip.allDispatchedOut && existing?.dispatchStatus === 'returned'
          ? 'returned'
          : trip.allDispatchedOut
          ? 'dispatched'
          : 'loaded';

      // Preserve existing return verification data cleanly while refreshing expectedExtras
      const nextReturnByCol = { ...(existing?.returnByCol || {}) };
      savedCols.forEach((sc) => {
        const prevRet = nextReturnByCol[sc.colKey] || {};
        const expExt = sc.extraQty;
        const expCli = Number(prevRet.expectedClientReturns || 0);
        const whExt = prevRet.whReceivedExtras !== undefined ? Number(prevRet.whReceivedExtras) : expExt;
        const whCli = prevRet.whReceivedClientReturns !== undefined ? Number(prevRet.whReceivedClientReturns) : expCli;
        const acctTot = roundQty(expExt + expCli);
        const whTot = roundQty(whExt + whCli);
        nextReturnByCol[sc.colKey] = {
          expectedExtras: expExt,
          expectedClientReturns: expCli,
          whReceivedExtras: whExt,
          whReceivedClientReturns: whCli,
          faultySwappedExtras: Number(prevRet.faultySwappedExtras || 0),
          shortageExtras: Number(prevRet.shortageExtras || 0),
          accountantExpectedTotal: acctTot,
          whReceivedTotal: whTot,
          variance: roundQty(whTot - acctTot),
        };
      });

      const isEditDispatch = Boolean(existing && existing.dispatchStatus && existing.dispatchStatus !== 'cancelled');
      const prevColsMap = {};
      (existing?.columns || []).forEach((pc) => {
        prevColsMap[pc.colKey] = pc;
      });
      const formatCrewNames = (arr) =>
        (Array.isArray(arr) && arr.length > 0)
          ? [...arr]
              .sort((a, b) => String(a.workerId).localeCompare(String(b.workerId)))
              .map((w) => `${w.name} (${w.effortPct}%)`)
              .join('، ')
          : '—';

      const prevLockedAll = roundQty((existing?.columns || []).reduce((s, c) => s + Number(c.lockedQty || 0), 0));
      const prevExtrasAll = roundQty((existing?.columns || []).reduce((s, c) => s + Number(c.extraQty || 0), 0));
      const prevLoadingStr = formatCrewNames(existing?.loadingWorkers);
      const nextLoadingStr = formatCrewNames(loadingWorkers);
      const prevOffloadingStr = formatCrewNames(existing?.offloadingWorkers);
      const nextOffloadingStr = formatCrewNames(offloadingWorkers);
      const prevNotes = String(existing?.dispatchNotes || '').trim();
      const nextNotes = dispatchNotes.trim();

      const metadataChanges = [];
      if (!isEditDispatch) {
        metadataChanges.push({
          labelAr: 'إجمالي المطلوب (مقفل)',
          labelEn: 'Locked Variant Qty',
          newValue: `${totalLockedAll} ctn`,
        });
        if (totalExtrasAll > 0) {
          metadataChanges.push({
            labelAr: 'إجمالي زيادات الرحلة (Extras)',
            labelEn: 'Trip Extras',
            newValue: `${totalExtrasAll} ctn`,
          });
        }
        if (nextLoadingStr !== '—') {
          metadataChanges.push({ labelAr: 'عمالة التحميل', labelEn: 'Loading Crew', newValue: nextLoadingStr });
        }
        if (nextOffloadingStr !== '—') {
          metadataChanges.push({ labelAr: 'عمالة التفريغ والتوزيع', labelEn: 'Offloading Crew', newValue: nextOffloadingStr });
        }
        if (nextNotes) {
          metadataChanges.push({ labelAr: 'ملاحظات التحميل', labelEn: 'Dispatch Notes', newValue: nextNotes });
        }
      } else {
        if (Math.abs(prevLockedAll - totalLockedAll) > 1e-4) {
          metadataChanges.push({
            labelAr: 'إجمالي المطلوب (مقفل)',
            labelEn: 'Locked Variant Qty',
            oldValue: `${prevLockedAll} ctn`,
            newValue: `${totalLockedAll} ctn`,
          });
        }
        if (Math.abs(prevExtrasAll - totalExtrasAll) > 1e-4) {
          metadataChanges.push({
            labelAr: 'إجمالي زيادات الرحلة (Extras)',
            labelEn: 'Trip Extras',
            oldValue: `${prevExtrasAll} ctn`,
            newValue: `${totalExtrasAll} ctn`,
          });
        }
        if (prevLoadingStr !== nextLoadingStr) {
          metadataChanges.push({
            labelAr: 'عمالة التحميل',
            labelEn: 'Loading Crew',
            oldValue: prevLoadingStr,
            newValue: nextLoadingStr,
          });
        }
        if (prevOffloadingStr !== nextOffloadingStr) {
          metadataChanges.push({
            labelAr: 'عمالة التفريغ والتوزيع',
            labelEn: 'Offloading Crew',
            oldValue: prevOffloadingStr,
            newValue: nextOffloadingStr,
          });
        }
        if (prevNotes !== nextNotes) {
          metadataChanges.push({
            labelAr: 'ملاحظات التحميل',
            labelEn: 'Dispatch Notes',
            oldValue: prevNotes || '—',
            newValue: nextNotes || '—',
          });
        }
      }

      const lineChanges = [];
      savedCols.forEach((sc) => {
        const prevC = prevColsMap[sc.colKey];
        if (!isEditDispatch) {
          if (sc.extraQty > 0 || sc.lockedQty > 0) {
            lineChanges.push({
              productCode: sc.optionCode || sc.productCode,
              productNameAr: sc.nameAr,
              productNameEn: sc.nameEn,
              type: 'added',
              detailAr: `مقفل: ${sc.lockedQty}${sc.extraQty > 0 ? ` + زيادات: ${sc.extraQty}` : ''} = ${sc.totalDispatchedQty} كرتونة`,
              detailEn: `Locked: ${sc.lockedQty}${sc.extraQty > 0 ? ` + Extras: ${sc.extraQty}` : ''} = ${sc.totalDispatchedQty} ctn`,
            });
          }
        } else {
          const prevLocked = Number(prevC?.lockedQty || 0);
          const prevExtra = Number(prevC?.extraQty || 0);
          const changedPartsAr = [];
          const changedPartsEn = [];
          if (!prevC) {
            changedPartsAr.push(`إضافة صنف (زيادات: ${sc.extraQty})`);
            changedPartsEn.push(`Added SKU (Extras: ${sc.extraQty})`);
          } else {
            if (Math.abs(prevLocked - sc.lockedQty) > 1e-4) {
              changedPartsAr.push(`مقفل: ${prevLocked} → ${sc.lockedQty}`);
              changedPartsEn.push(`Locked: ${prevLocked} → ${sc.lockedQty}`);
            }
            if (Math.abs(prevExtra - sc.extraQty) > 1e-4) {
              changedPartsAr.push(`زيادات: ${prevExtra} → ${sc.extraQty}`);
              changedPartsEn.push(`Extras: ${prevExtra} → ${sc.extraQty}`);
            }
          }
          if (changedPartsAr.length > 0) {
            lineChanges.push({
              productCode: sc.optionCode || sc.productCode,
              productNameAr: sc.nameAr,
              productNameEn: sc.nameEn,
              type: prevC ? 'modified' : 'added',
              detailAr: changedPartsAr.join(' | '),
              detailEn: changedPartsEn.join(' | '),
            });
          }
        }
      });

      // Detect Loading Plan / Sales Order drift vs previously confirmed dispatch snapshot
      const planDrift = isEditDispatch
        ? detectPostDispatchPlanChanges({ trip, finishedProducts })
        : { hasPlanDrift: false, changes: [], summaryAr: '', summaryEn: '' };

      if (planDrift.hasPlanDrift) {
        planDrift.changes.forEach((ch) => {
          metadataChanges.push({
            labelAr: ch.labelAr,
            labelEn: ch.labelEn,
            oldValue: ch.oldValue || '—',
            newValue: ch.newValue || '—',
          });
        });
      }

      // Avoid recording redundant audit entry or incrementing count if editing without actual changes
      if (isEditDispatch && metadataChanges.length === 0 && lineChanges.length === 0) {
        onClose();
        return;
      }

      // Preserve previous confirmed dispatch snapshot in dispatchHistory[] before overwriting
      const prevHistory = Array.isArray(existing?.dispatchHistory) ? existing.dispatchHistory : [];
      const nextDispatchHistory = isEditDispatch
        ? [
            ...prevHistory,
            {
              revisionNumber: prevHistory.length + 1,
              archivedAt: nowIso,
              archivedBy: actorName,
              reasonAr: planDrift.hasPlanDrift ? planDrift.summaryAr : 'تحديث يدوي لبيان الصرف',
              reasonEn: planDrift.hasPlanDrift ? planDrift.summaryEn : 'Manual dispatch slip update',
              dispatchedAt: existing?.updatedAt || existing?.dispatchedAt || '',
              dispatchedByName: existing?.updatedByName || existing?.dispatchedByName || '',
              vehicleName: existing?.vehicleName || '',
              driverName: existing?.driverName || '',
              deliveryRepName: existing?.deliveryRepName || '',
              orderIds: Array.isArray(existing?.orderIds) ? existing.orderIds : [],
              columns: Array.isArray(existing?.columns) ? existing.columns : [],
              clientRowsSnapshot: Array.isArray(existing?.clientRowsSnapshot) ? existing.clientRowsSnapshot : [],
              loadingWorkers: Array.isArray(existing?.loadingWorkers) ? existing.loadingWorkers : [],
              offloadingWorkers: Array.isArray(existing?.offloadingWorkers) ? existing.offloadingWorkers : [],
              dispatchNotes: existing?.dispatchNotes || '',
            },
          ]
        : prevHistory;

      // Mark any previously 'current' printed Dispatch Documents as 'superseded' (Legacy)
      const prevDocVersions = Array.isArray(existing?.dispatchDocVersions) ? existing.dispatchDocVersions : [];
      const nextDocVersions = isEditDispatch
        ? prevDocVersions.map((ver) =>
            ver.status === 'current'
              ? {
                  ...ver,
                  status: 'superseded',
                  supersededAt: nowIso,
                  supersededBy: actorName,
                  supersededReasonAr: planDrift.hasPlanDrift
                    ? planDrift.summaryAr
                    : 'تم تعديل بيان الصرف بعد الطباعة',
                }
              : ver
          )
        : prevDocVersions;

      const orderSequencesSnapshot = {};
      trip.orders.forEach((o) => {
        const seq = Number(o.deliverySequence);
        orderSequencesSnapshot[o.id] = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : null;
      });

      const dispatchAuditEntry = {
        id: `AUD-TD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: isEditDispatch ? 'truck_dispatch_updated' : 'truck_dispatch_confirmed',
        summaryAr: isEditDispatch
          ? (planDrift.hasPlanDrift
              ? `تحديث بيان الصرف بعد تعديل خطة رحلة #${trip.loadingOrderNumber}`
              : `تحديث بيان تحميل رحلة #${trip.loadingOrderNumber}`)
          : `اعتماد تحميل وصرف رحلة #${trip.loadingOrderNumber} (${trip.vehicleDisplayName}): مقفل ${totalLockedAll} + زيادات ${totalExtrasAll} = ${totalDispatchedAll} كرتونة`,
        summaryEn: isEditDispatch
          ? (planDrift.hasPlanDrift
              ? `Re-confirmed dispatch after Loading Plan changes on Trip #${trip.loadingOrderNumber}`
              : `Updated dispatch slip for Trip #${trip.loadingOrderNumber}`)
          : `Confirmed dispatch slip for Trip #${trip.loadingOrderNumber} (${trip.vehicleDisplayName}): Locked ${totalLockedAll} + Extras ${totalExtrasAll} = ${totalDispatchedAll} ctn`,
        changes: { metadata: metadataChanges, lineChanges },
      };

      const payload = {
        id: trip.id,
        tripKey: trip.tripKey,
        loadingDate: trip.loadingDate,
        loadingOrderNumber: trip.loadingOrderNumber,
        vehicleId: trip.primaryVehicleId || existing?.vehicleId || '',
        vehicleName: trip.vehicleDisplayName || existing?.vehicleName || '',
        plateNumber: trip.primaryVehiclePlate || existing?.plateNumber || '',
        driverId: trip.primaryDriverId || existing?.driverId || '',
        driverName: trip.primaryDriverName || existing?.driverName || '',
        deliveryRepId: trip.primaryRepId || existing?.deliveryRepId || '',
        deliveryRepName: trip.primaryRepName || existing?.deliveryRepName || '',
        orderIds: trip.orders.map((o) => o.id),
        orderSequencesSnapshot,
        dispatchStatus: nextDispatchStatus,
        columns: savedCols,
        clientRowsSnapshot: clientRows.map((r) => ({
          orderId: r.orderId,
          serial: r.serial,
          clientId: r.clientId,
          clientName: r.clientName,
          orderType: r.orderType,
          quantitiesByCol: r.quantitiesByCol,
        })),
        loadingWorkers,
        offloadingWorkers,
        dispatchNotes: dispatchNotes.trim(),
        returnHandshakeStatus: existing?.returnHandshakeStatus || 'none',
        returnByCol: nextReturnByCol,
        dispatchContentUpdatedAt: nowIso,
        dispatchHistory: nextDispatchHistory,
        dispatchDocVersions: nextDocVersions,
        auditTrail: [...(Array.isArray(existing?.auditTrail) ? existing.auditTrail : []), dispatchAuditEntry],
        dispatchedBy: existing?.dispatchedBy || actorId,
        dispatchedByName: existing?.dispatchedByName || actorName,
        dispatchedAt: existing?.dispatchedAt || nowIso,
        updatedBy: actorId,
        updatedByName: actorName,
        updatedAt: nowIso,
      };

      const confirmDispatchFn = httpsCallable(functions, 'salesConfirmTruckDispatch');
      await confirmDispatchFn({
        tripId: trip.id,
        payload,
        isEditDispatch,
        supersedureMeta: isEditDispatch
          ? {
              reasonAr: planDrift.hasPlanDrift ? planDrift.summaryAr : 'تم تعديل بيان الصرف بعد الطباعة',
              reasonEn: planDrift.hasPlanDrift ? planDrift.summaryEn : 'Dispatch slip modified after printing',
            }
          : {},
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
      if (onSaved) onSaved(payload);
      onClose();
    } catch (err) {
      console.error('Error saving truck dispatch slip:', err);
      alert(isAr ? `حدث خطأ أثناء حفظ بيان الصرف: ${err.message}` : `Error saving truck dispatch: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-start animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-teal-300 rtl:-scale-x-100" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black">
                  {isAr
                    ? `بيان تحميل وصرف شاحنة — رحلة #${trip.loadingOrderNumber}`
                    : `Truck Loading & Dispatch Matrix — Trip #${trip.loadingOrderNumber}`}
                </h3>
                <span className="px-2 py-0.5 rounded-lg bg-white/10 text-teal-200 font-mono text-[11px] font-bold">
                  {trip.loadingDate}
                </span>
                {trip.isWarehouseConfirmed && (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 text-[10px] font-black">
                    {isAr ? 'بوابة مخزن التام ✓' : 'FG Gate Confirmed ✓'}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
                {trip.vehicleDisplayName}
                {trip.primaryDriverName ? ` • ${isAr ? 'السائق:' : 'Driver:'} ${trip.primaryDriverName}` : ''}
                {trip.primaryRepName ? ` • ${isAr ? 'المندوب:' : 'Rep:'} ${trip.primaryRepName}` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5">
          {/* Post-Dispatch Loading Plan Changes Delta Banner */}
          {trip.planDrift?.hasPlanDrift && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-950 space-y-2">
              <div className="flex items-center gap-2 font-black text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {isAr
                    ? 'تنبيه: تم تعديل خطة التحميل لهذه الرحلة بعد اعتماد الصرف — راجع التعديلات أدناه ثم اعتمد التحديث:'
                    : 'Alert: Loading Plan changed after dispatch — review the differences below and re-confirm:'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trip.planDrift.changes.map((ch, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-[11px] font-bold text-rose-900"
                  >
                    <span>{isAr ? ch.labelAr : ch.labelEn}:</span>
                    {ch.oldValue && ch.oldValue !== '—' && (
                      <>
                        <span className="line-through text-slate-400 font-mono">{ch.oldValue}</span>
                        <span>→</span>
                      </>
                    )}
                    <span className="font-mono font-black text-rose-700">{ch.newValue}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Return Orders Info Note if trip also contains scheduled return orders */}
          {trip.returnOrders.length > 0 && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-2 font-bold">
              <ArrowDownLeft className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                {isAr
                  ? `تحتوي هذه الرحلة أيضاً على (${trip.returnOrders.length}) طلب مرتجع عميل — يتم تسجيلها ومطابقتها في نافذة استلام المرتجعات بعد العودة.`
                  : `This trip also includes ${trip.returnOrders.length} commercial client return order(s) handled inside Return / Receiving Inspection.`}
              </span>
            </div>
          )}

          {/* Matrix Toolbar: Quick Add Extra SKU Column */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isAr
                  ? 'مصفوفة التحميل (الكميات الأساسية مقفلة وفق خطة التحميل المعتمدة)'
                  : 'Loading Matrix (Client order quantities are locked from Loading Plan)'}
              </span>
            </div>

            {canConfirmDispatch && extraColumnOptions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={extraCatalogPick}
                  onChange={(e) => setExtraCatalogPick(e.target.value)}
                  className="text-xs font-bold bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 max-w-[260px] outline-none focus:border-teal-600"
                >
                  <option value="">
                    {isAr ? '+ إضافة صنف زيادات غير مدرج...' : '+ Add Extra-Only SKU Column...'}
                  </option>
                  {extraColumnOptions.map((o) => (
                    <option key={o.colKey} value={o.colKey}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!extraCatalogPick}
                  onClick={handleAddExtraColumn}
                  className="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إدراج' : 'Add'}</span>
                </button>
              </div>
            )}
          </div>

          {/* CLIENT (ROWS) × PRODUCT / PACKING-OPTION (COLUMNS) MATRIX */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-2xs">
            <table className="w-full border-collapse text-xs text-start min-w-[680px]">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-start font-black text-slate-800 sticky start-0 bg-slate-100 z-10 min-w-[200px] border-e border-slate-200">
                    {isAr ? 'العميل / رقم الأمر' : 'Client / Order #'}
                  </th>
                  {columns.map((col) => {
                    const availShelf = getAvailableOnShelfForCol(col);
                    return (
                      <th key={col.colKey} className="py-2 px-2.5 text-center min-w-[130px] border-e border-slate-200/70 align-top">
                        <div className="flex flex-col items-center gap-1">
                          {col.imageFile && (
                            <img
                              src={col.imageFile}
                              alt=""
                              className="w-7 h-7 rounded-lg object-cover border border-slate-200 bg-white"
                            />
                          )}
                          <span className="font-extrabold text-slate-900 leading-tight text-[11px] line-clamp-2">
                            {isAr ? col.shortNameAr : col.shortNameEn}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-white border border-slate-200 text-[10px] font-bold text-indigo-800">
                            {isAr ? col.optionNameAr : col.optionNameEn}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">
                            {col.optionCode} • {isAr ? 'متاح:' : 'Shelf:'} {fmtCtn(availShelf)}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="py-2.5 px-3 text-center font-black text-slate-800 min-w-[100px] bg-slate-100">
                    {isAr ? 'الإجمالي' : 'Row Total'}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {clientRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="py-6 text-center text-slate-400 font-bold">
                      {isAr ? 'لا توجد أوامر بيع منصرفة بهذه الرحلة.' : 'No outbound client orders on this trip.'}
                    </td>
                  </tr>
                ) : (
                  clientRows.map((row) => (
                    <tr key={row.orderId} className="hover:bg-slate-50/70 transition">
                      <td className="py-2 px-3 sticky start-0 bg-white border-e border-slate-200 z-10">
                        {onOpenClientProfile && row.clientId ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenClientProfile({
                                clientId: row.clientId,
                                branchId: row.branchId || '',
                                branchName: row.branchName || '',
                              })
                            }
                            className="font-extrabold text-slate-900 hover:text-indigo-700 hover:underline text-xs truncate max-w-[220px] text-start block cursor-pointer"
                          >
                            {row.clientName}
                          </button>
                        ) : (
                          <div className="font-extrabold text-slate-900 text-xs truncate max-w-[220px]">
                            {row.clientName}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] font-bold text-slate-500">#{row.serial}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${ORDER_TYPE_META[row.orderType]?.cls || ''}`}>
                            {isAr ? ORDER_TYPE_META[row.orderType]?.ar : ORDER_TYPE_META[row.orderType]?.en}
                          </span>
                        </div>
                      </td>

                      {columns.map((col) => {
                        const qty = Number(row.quantitiesByCol[col.colKey] || 0);
                        return (
                          <td key={col.colKey} className="py-2 px-2.5 text-center border-e border-slate-100 font-mono">
                            {qty > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-900 font-bold text-xs">
                                <Lock className="w-2.5 h-2.5 text-slate-400" />
                                {fmtCtn(qty)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 text-center font-mono font-black text-slate-900 bg-slate-50/50">
                        {fmtCtn(row.rowTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* FOOTER ROWS: 1. Locked Totals -> 2. Trip Extras Inputs -> 3. Total Dispatched */}
              <tfoot className="border-t-2 border-slate-300">
                {/* 1. Locked Variant Totals */}
                <tr className="bg-slate-100/90 font-black text-slate-800">
                  <td className="py-2.5 px-3 sticky start-0 bg-slate-100 border-e border-slate-200 z-10">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isAr ? 'إجمالي المطلوب (مقفل)' : 'Total Variant Qty (Locked)'}</span>
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col.colKey} className="py-2.5 px-2.5 text-center font-mono text-xs border-e border-slate-200">
                      {fmtCtn(col.lockedQty)}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-center font-mono text-sm text-slate-900">
                    {fmtCtn(totalLockedAll)}
                  </td>
                </tr>

                {/* 2. Add Trip Extras */}
                <tr className="bg-teal-50/75 border-t border-teal-200">
                  <td className="py-2.5 px-3 sticky start-0 bg-teal-50 border-e border-teal-200 z-10">
                    <div className="flex items-center gap-1.5 text-xs font-black text-teal-900">
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>{isAr ? '+ زيادات الرحلة (Extras)' : '+ Trip Extras (Precaution)'}</span>
                    </div>
                    <span className="text-[10px] text-teal-700 font-medium block">
                      {isAr ? 'تُخصم مؤقتاً وتُتابع عند العودة' : 'Deducted & tracked for return'}
                    </span>
                  </td>
                  {columns.map((col) => {
                    const extVal = extrasByCol[col.colKey] ?? 0;
                    const totalColNeed = roundQty((col.lockedQty || 0) + Number(extVal || 0));
                    const availShelf = getAvailableOnShelfForCol(col);
                    const exceedsShelf = Number(extVal || 0) > 0 && totalColNeed > availShelf;
                    return (
                      <td key={col.colKey} className="py-2 px-2 text-center border-e border-teal-200/70">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={!canConfirmDispatch}
                          value={extVal}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setExtrasByCol((prev) => ({ ...prev, [col.colKey]: val }));
                          }}
                          className={`w-20 text-center font-mono text-xs font-black bg-white border rounded-xl py-1 px-2 outline-none focus:ring-2 ${
                            exceedsShelf
                              ? 'border-amber-400 text-amber-900 focus:ring-amber-200'
                              : 'border-teal-300 text-teal-900 focus:ring-teal-200'
                          }`}
                        />
                        {exceedsShelf && (
                          <div className="text-[9px] text-amber-700 font-bold mt-0.5">
                            {isAr ? 'يتجاوز رصيد المخزن' : 'Exceeds shelf'}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono font-black text-sm text-teal-800">
                    +{fmtCtn(totalExtrasAll)}
                  </td>
                </tr>

                {/* 3. Total Dispatched */}
                <tr className="bg-slate-900 text-white font-black">
                  <td className="py-2.5 px-3 sticky start-0 bg-slate-900 border-e border-slate-700 z-10 text-xs">
                    {isAr ? 'إجمالي المنصرف بالسيارة' : 'Total Dispatched on Truck'}
                  </td>
                  {columns.map((col) => {
                    const colTotal = roundQty((col.lockedQty || 0) + Number(extrasByCol[col.colKey] || 0));
                    return (
                      <td key={col.colKey} className="py-2.5 px-2.5 text-center font-mono text-sm text-emerald-300 border-e border-slate-800">
                        {fmtCtn(colTotal)}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono text-base text-emerald-300">
                    {fmtCtn(totalDispatchedAll)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* DUAL LABOUR ROSTER & EFFORT % REGISTRATION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LabourEffortRosterEditor
              titleAr="١. عمالة تحميل الشاحنة (بالمخزن)"
              titleEn="1. Warehouse Loading Crew"
              accentClass="teal"
              workers={loadingWorkers}
              onChange={setLoadingWorkers}
              workerPool={workerPool}
              disabled={!canConfirmDispatch}
              isAr={isAr}
            />
            <LabourEffortRosterEditor
              titleAr="٢. عمالة التفريغ والتوزيع (المرافقون للرحلة)"
              titleEn="2. Offloading / Accompanying Crew"
              accentClass="indigo"
              workers={offloadingWorkers}
              onChange={setOffloadingWorkers}
              workerPool={workerPool}
              disabled={!canConfirmDispatch}
              isAr={isAr}
            />
          </div>

          {/* Warehouse Loading & Dispatch Comments */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              {isAr
                ? 'ملاحظات أمين المخزن عند التحميل والصرف (تظهر في إذن الصرف):'
                : 'Warehouse Loading & Dispatch Comments (printed on Dispatch Document):'}
            </label>
            <textarea
              rows={3}
              disabled={!canConfirmDispatch}
              value={dispatchNotes}
              onChange={(e) => setDispatchNotes(e.target.value)}
              placeholder={
                isAr
                  ? 'رقم السيل، حالة الشاحنة، تعليمات التحميل أو الزيادات، أي ملاحظات للسائق أو البوابة...'
                  : 'Seal #, truck condition, loading/extras instructions, remarks for driver or gate...'
              }
              className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-teal-600 resize-y min-h-[72px]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] font-bold text-slate-500">
            {!crewsValid && (
              <span className="text-rose-700">
                {isAr
                  ? 'يجب أن يساوي مجموع نسب مجهود العمالة 100% لكل مهمة مسجلة.'
                  : 'Worker effort percentages must total exactly 100% for each assigned crew.'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            {canConfirmDispatch && (
              <button
                type="button"
                disabled={isSaving || !crewsValid}
                onClick={handleConfirmDispatch}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <PackageCheck className="w-4 h-4" />
                <span>
                  {isSaving
                    ? (isAr ? 'جاري الحفظ...' : 'Saving...')
                    : trip.isWarehouseConfirmed
                    ? (isAr ? 'تحديث بيان التحميل والصرف' : 'Update Dispatch Slip')
                    : (isAr ? 'اعتماد التحميل وبوابة المخزن' : 'Confirm Load & FG Gate ✓')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

