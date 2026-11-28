import React, { useState, useEffect, useMemo, useRef } from 'react';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { createNotification, createActionRequired, completeActionRequired } from '../utils/notificationEngine';
import { makeTripDispatchDocId, resolveProductAndOption } from '../utils/truckDispatchUtils';
import { roundQty } from '../utils/fgStockEngine';
import {
  X,
  Store,
  CheckCircle2,
  PackageCheck,
  RotateCcw,
  Upload,
  FileText,
  Eye,
  Trash2,
  AlertTriangle,
  Truck,
  Clock,
  RefreshCw,
  ShieldAlert,
  Lock,
  Printer,
  FileImage
} from 'lucide-react';
import AttachmentViewerModal from './AttachmentViewerModal';
import TruckNameBadge from './TruckNameBadge';
import {
  calculateSalesOrderLineTotals,
  aggregateSalesOrderTotals,
  compressAttachmentFile,
  computeRetailSettlementPayload,
  openPrintableRetailSettlementSlip
} from '../utils/salesOrderUtils';

const MAX_TOTAL_ATTACHMENT_BYTES = 750 * 1024; // ~750 KB safe ceiling for Firestore 1MB doc limit

export default function RetailSettlementModal({
  isOpen,
  onClose,
  order,
  canSettleRetailOrders = false,
  allowDeferDelivery = false,
  skipDispatchSync = false,
  zIndexClass = 'z-[70]',
  vehicles = [],
  resolveVehicleDisplayName,
  isAr = true,
  currentUserName = 'مستخدم معتمد',
  currentUserId = 'usr_unknown',
  onSuccess = null
}) {
  const fileInputRef = useRef(null);
  const [lineStates, setLineStates] = useState([]);
  const [settlementNotes, setSettlementNotes] = useState('');
  const [buyerAttachments, setBuyerAttachments] = useState([]);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isForceSyncEdit = order?.retailSettlementStatus === 'settled';
  const currentRevision = Number(order?.retailSettlementRevision || 0);

  // Hydrate baseline (Loaded) and editable Sold/Returned quantities when order opens
  useEffect(() => {
    if (!isOpen || !order) return;
    setErrorMsg('');
    setSettlementNotes(order.retailSettlementNotes || '');
    setBuyerAttachments(
      Array.isArray(order.retailSettlementAttachments)
        ? order.retailSettlementAttachments.map((a) => ({ ...a }))
        : []
    );

    const origLines =
      Array.isArray(order.preAdjustmentSnapshot?.originalLines) &&
      order.preAdjustmentSnapshot.originalLines.length > 0
        ? order.preAdjustmentSnapshot.originalLines
        : (order.lines || []);

    const currLineMap = {};
    (order.lines || []).forEach((l) => {
      currLineMap[l.productId] = l;
    });

    const initialRows = origLines.map((orig) => {
      const curr = currLineMap[orig.productId] || orig;
      const loadedQty = Math.max(0, Math.round(Number(orig.dispatchedQty ?? orig.qty ?? 0)));
      const loadedBonus = Math.max(0, Math.round(Number(orig.dispatchedBonus ?? orig.bonus ?? 0)));
      const isAlreadySettled = order.retailSettlementStatus === 'settled' || order.hasPartialRejection;
      const soldQty = isAlreadySettled
        ? Math.min(loadedQty, Math.max(0, Math.round(Number(curr.qty ?? loadedQty))))
        : loadedQty;
      const soldBonus = isAlreadySettled
        ? Math.min(loadedBonus, Math.max(0, Math.round(Number(curr.bonus ?? loadedBonus))))
        : loadedBonus;

      return {
        productId: orig.productId,
        productCode: orig.productCode || '',
        productNameAr: orig.productNameAr || '',
        productNameEn: orig.productNameEn || '',
        detectedUnitPrice: Number(orig.detectedUnitPrice || 0),
        isPromotional: Boolean(orig.isPromotional),
        promoDiscountPct: Number(orig.promoDiscountPct || 0),
        vatRate: orig.vatRate,
        manualDiscountPerUnit: Number(orig.manualDiscountPerUnit || 0),
        largeUnitWeightKg: Number(orig.largeUnitWeightKg || 0),
        loadedQty,
        loadedBonus,
        soldQty,
        soldBonus,
        returnedQty: Math.max(0, loadedQty - soldQty),
        returnedBonus: Math.max(0, loadedBonus - soldBonus),
        origLine: orig
      };
    });

    setLineStates(initialRows);
  }, [isOpen, order]);

  // Real-time financial & quantity KPIs (no weight KPI per design feedback; detailed SKUs sold shown directly)
  const liveSummary = useMemo(() => {
    const vatMode = order?.vatMode || 'none';
    let loadedCartons = 0;
    let soldCartons = 0;
    let returnedCartons = 0;
    const recalcLines = [];
    const soldSkuDetails = [];

    lineStates.forEach((row) => {
      const loadedTotal = row.loadedQty + row.loadedBonus;
      const soldTotal = row.soldQty + row.soldBonus;
      const retTotal = row.returnedQty + row.returnedBonus;
      loadedCartons += loadedTotal;
      soldCartons += soldTotal;
      returnedCartons += retTotal;

      const calc = calculateSalesOrderLineTotals(
        {
          ...row.origLine,
          qty: row.soldQty,
          bonus: row.soldBonus
        },
        row.detectedUnitPrice,
        row.isPromotional,
        row.promoDiscountPct,
        vatMode
      );
      recalcLines.push(calc);

      soldSkuDetails.push({
        productId: row.productId,
        productCode: row.productCode,
        nameAr: row.productNameAr || row.productNameEn,
        nameEn: row.productNameEn || row.productNameAr,
        loadedTotal,
        soldTotal,
        returnedTotal: retTotal,
        lineTotal: calc.lineTotal,
        pctSold: loadedTotal > 0 ? Math.round((soldTotal / loadedTotal) * 100) : 0
      });
    });

    const totals = aggregateSalesOrderTotals(recalcLines, vatMode);
    const soldPct = loadedCartons > 0 ? Math.round((soldCartons / loadedCartons) * 100) : 0;

    return {
      loadedCartons,
      soldCartons,
      returnedCartons,
      soldPct,
      grandTotal: totals.grandTotal,
      netPreTaxSubtotal: totals.netPreTaxSubtotal,
      totalVat: totals.totalVat,
      soldSkuDetails
    };
  }, [lineStates, order?.vatMode]);

  const totalAttachmentBytes = useMemo(() => {
    return buyerAttachments.reduce((sum, att) => sum + (att.url ? att.url.length : 0), 0);
  }, [buyerAttachments]);

  if (!isOpen || !order) return null;

  const matchedVehicle = vehicles.find((v) => v.id === order.assignedVehicleId);
  const truckPlate = (order.assignedVehiclePlate || matchedVehicle?.plateNumber || '').trim();
  const truckLabel = resolveVehicleDisplayName
    ? resolveVehicleDisplayName(matchedVehicle, order.assignedVehicleName || (isAr ? 'شاحنة غير محددة' : 'Unassigned Truck'))
    : (order.assignedVehicleName || matchedVehicle?.code || '—');

  // Dual synchronized updaters: updating Sold automatically adjusts Returned, and vice versa
  const handleSoldQtyChange = (productId, rawVal) => {
    const parsed = rawVal === '' ? 0 : Math.max(0, Math.round(Number(rawVal) || 0));
    setLineStates((prev) =>
      prev.map((row) => {
        if (row.productId !== productId) return row;
        const clampedSold = Math.min(row.loadedQty, parsed);
        return {
          ...row,
          soldQty: clampedSold,
          returnedQty: row.loadedQty - clampedSold
        };
      })
    );
  };

  const handleReturnedQtyChange = (productId, rawVal) => {
    const parsed = rawVal === '' ? 0 : Math.max(0, Math.round(Number(rawVal) || 0));
    setLineStates((prev) =>
      prev.map((row) => {
        if (row.productId !== productId) return row;
        const clampedRet = Math.min(row.loadedQty, parsed);
        return {
          ...row,
          returnedQty: clampedRet,
          soldQty: row.loadedQty - clampedRet
        };
      })
    );
  };

  const handleSoldBonusChange = (productId, rawVal) => {
    const parsed = rawVal === '' ? 0 : Math.max(0, Math.round(Number(rawVal) || 0));
    setLineStates((prev) =>
      prev.map((row) => {
        if (row.productId !== productId) return row;
        const clampedBonus = Math.min(row.loadedBonus, parsed);
        return {
          ...row,
          soldBonus: clampedBonus,
          returnedBonus: row.loadedBonus - clampedBonus
        };
      })
    );
  };

  const handleConfirmAllSoldPreset = () => {
    setLineStates((prev) =>
      prev.map((row) => ({
        ...row,
        soldQty: row.loadedQty,
        soldBonus: row.loadedBonus,
        returnedQty: 0,
        returnedBonus: 0
      }))
    );
  };

  const handleConfirmAllUnsoldPreset = () => {
    setLineStates((prev) =>
      prev.map((row) => ({
        ...row,
        soldQty: 0,
        soldBonus: 0,
        returnedQty: row.loadedQty,
        returnedBonus: row.loadedBonus
      }))
    );
  };

  const handleUploadBuyerDocs = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setErrorMsg('');

    let runningBytes = totalAttachmentBytes;
    const newlyAdded = [];

    for (const file of files) {
      try {
        const dataUrl = await compressAttachmentFile(file);
        if (runningBytes + dataUrl.length > MAX_TOTAL_ATTACHMENT_BYTES) {
          setErrorMsg(
            isAr
              ? `تم تجاوز الحد الآمن لحجم المرفقات (~750 كيلوبايت) لضمان الحفظ السحابي. يرجى تقليل حجم أو عدد الملفات.`
              : `Total attachment payload exceeded safe Firestore document ceiling (~750 KB). Please compress PDFs or reduce file count.`
          );
          break;
        }
        runningBytes += dataUrl.length;
        newlyAdded.push({
          id: `RET-DOC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          url: dataUrl,
          buyerNote: '',
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUserName
        });
      } catch (err) {
        console.error('Attachment compression error:', err);
        setErrorMsg(isAr ? `تعذر قراءة الملف: ${file.name}` : `Failed to process file: ${file.name}`);
      }
    }

    if (newlyAdded.length > 0) {
      setBuyerAttachments((prev) => [...prev, ...newlyAdded]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Save Confirmed Sold Quantities (First settlement OR Force-Sync re-edit)
  const handleConfirmSettlement = async () => {
    if (!canSettleRetailOrders || isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const payload = computeRetailSettlementPayload({
        order,
        soldLinesInput: lineStates,
        settlementNotes,
        buyerAttachments,
        markDelivered: allowDeferDelivery || order.fulfillmentStatus === 'shipped' || order.fulfillmentStatus === 'delivered',
        currentUserName,
        currentUserId
      });

      await updateDoc(doc(db, 'sales_orders', order.id), {
        ...payload,
        updatedAt: serverTimestamp(),
        updatedBy: currentUserName
      });

      // Sync unsold Retail returns into the linked truck_dispatches Return Handshake + notify Warehouse Custodian
      const linkedTripId =
        order.fgWarehouseDispatchId ||
        (order.loadingDate && Number(order.loadingOrderNumber) > 0
          ? makeTripDispatchDocId(order.loadingDate, order.loadingOrderNumber)
          : '');

      if (linkedTripId && !skipDispatchSync) {
        try {
          const tdRef = doc(db, 'truck_dispatches', linkedTripId);
          const tdSnap = await getDoc(tdRef);
          const tdExisting = tdSnap.exists() ? tdSnap.data() : null;
          const totalReturnedUnits = Number(payload.returnedCartons || 0);

          if (tdExisting || totalReturnedUnits > 0) {
            const nextReturnByCol = { ...(tdExisting?.returnByCol || {}) };
            lineStates.forEach((row) => {
              const unsoldQty = roundQty(Number(row.returnedQty || 0) + Number(row.returnedBonus || 0));
              const meta = resolveProductAndOption(
                [],
                row.productId || row.productCode,
                row.packagingOptionSuffix || row.optionSuffix,
                row.packagingRatio
              );
              const colKey = `${meta.productCode}::${meta.optionSuffix}`;
              const prev = nextReturnByCol[colKey] || {};
              const expExt = Number(prev.expectedExtras || 0);
              const whExt = prev.whReceivedExtras !== undefined ? Number(prev.whReceivedExtras) : expExt;
              const whCli = prev.whReceivedClientReturns !== undefined ? Number(prev.whReceivedClientReturns) : unsoldQty;
              const acctTot = roundQty(expExt + unsoldQty);
              const whTot = roundQty(whExt + whCli);

              nextReturnByCol[colKey] = {
                expectedExtras: expExt,
                expectedClientReturns: unsoldQty,
                whReceivedExtras: whExt,
                whReceivedClientReturns: whCli,
                faultySwappedExtras: Number(prev.faultySwappedExtras || 0),
                shortageExtras: Number(prev.shortageExtras || 0),
                accountantExpectedTotal: acctTot,
                whReceivedTotal: whTot,
                variance: roundQty(whTot - acctTot),
              };
            });

            const anyVariance = Object.values(nextReturnByCol).some((r) => Math.abs(Number(r.variance || 0)) > 1e-4);
            const alreadyWhConfirmed = Boolean(tdExisting?.whReturnConfirmedAt);
            const nextHandshake =
              totalReturnedUnits === 0 && !tdExisting?.columns?.some((c) => Number(c.extraQty || 0) > 0) && alreadyWhConfirmed
                ? 'reconciled'
                : alreadyWhConfirmed && !anyVariance
                ? 'reconciled'
                : alreadyWhConfirmed && anyVariance
                ? 'discrepancy_pending_accounting'
                : 'pending_wh_confirm';

            const retSyncAuditEntry = {
              id: `AUD-RS-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toISOString(),
              userId: currentUserId,
              userName: currentUserName,
              performedBy: currentUserName,
              performedById: currentUserId,
              action: 'retail_return_synced_to_dispatch',
              summaryAr: `مزامنة تسوية التجزئة (#${order.serial || order.id}) — مرتجع متوقع ${totalReturnedUnits} كرتونة (${nextHandshake})`,
              summaryEn: `Synced Retail settlement (#${order.serial || order.id}) — Expected return: ${totalReturnedUnits} ctn (${nextHandshake})`,
              changes: {
                metadata: [
                  {
                    labelAr: 'المرتجع غير المباع المتوقع',
                    labelEn: 'Expected Unsold Return',
                    oldValue: '—',
                    newValue: `${totalReturnedUnits} ctn`,
                  },
                ],
              },
            };

            await setDoc(
              tdRef,
              {
                id: linkedTripId,
                loadingDate: order.loadingDate || tdExisting?.loadingDate || '',
                loadingOrderNumber: Number(order.loadingOrderNumber || tdExisting?.loadingOrderNumber || 0),
                orderIds: Array.from(new Set([...(tdExisting?.orderIds || []), order.id])),
                returnByCol: nextReturnByCol,
                returnHandshakeStatus: nextHandshake,
                returnContentUpdatedAt: new Date().toISOString(),
                auditTrail: [...(Array.isArray(tdExisting?.auditTrail) ? tdExisting.auditTrail : []), retSyncAuditEntry],
                accountantReturnSubmittedBy: currentUserId,
                accountantReturnSubmittedByName: currentUserName,
                accountantReturnSubmittedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );

            if (nextHandshake === 'pending_wh_confirm' && totalReturnedUnits > 0) {
              await createActionRequired({
                actionType: 'truck_return_wh_confirm',
                docId: linkedTripId,
                docNumber: `LO-${order.loadingOrderNumber || ''}`,
                title: `تأكيد استلام مرتجع تجزئة (${totalReturnedUnits} كرتونة)`,
                titleEn: `Confirm Physical Receipt of Retail Returns (${totalReturnedUnits} ctn)`,
                message: `تمت تسوية خط سير التجزئة للأمر #${order.serial || order.id} بمرتجع غير مباع (${totalReturnedUnits} كرتونة). يرجى تأكيد الاستلام الفعلي بمخزن التام.`,
                messageEn: `Retail settlement for #${order.serial || order.id} recorded ${totalReturnedUnits} unsold return cartons. Please verify receipt in FG Warehouse.`,
                targetTab: 'truck_dispatch',
                targetModule: 'sales',
                highlightId: linkedTripId,
                createdBy: currentUserId,
                createdByName: currentUserName,
                targetRoles: ['finished_goods_custodian', 'general_admin'],
                metadata: { tripId: linkedTripId, orderId: order.id, returnedCartons: totalReturnedUnits },
              });
            } else if (nextHandshake === 'reconciled') {
              await completeActionRequired({
                actionType: 'truck_return_wh_confirm',
                docId: linkedTripId,
                completedBy: currentUserId,
                completedByName: currentUserName,
                resolutionNote: 'Zero return or already matched',
              });
            }
          }
        } catch (tdSyncErr) {
          console.debug('Truck dispatch return sync skipped:', tdSyncErr);
        }
      }

      // Dispatch notification to Warehouse, Accounting, Sales & Admin users (fire-and-forget)
      (async () => {
        try {
          const relevantTabs = [
            'sales_orders',
            'loading_plan',
            'truck_dispatch',
            'stock',
            'fg_inward',
            'accounts',
            'party_statements'
          ];
          const usersSnap = await getDocs(collection(db, 'users'));
          const targetUserIds = usersSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((u) => {
              if (!u.id || u.id === currentUserId || u.disabled || u.isActive === false) return false;
              if (u.role === 'general_admin' || u.isGeneralAdmin) return true;
              const mods = u.permissions?.modules;
              if (!mods) return true;
              return relevantTabs.some((t) => mods[t] === true);
            })
            .map((u) => u.id);

          const serialLabel = `#${order.serial || order.id}`;
          const revNum = payload.retailSettlementRevision || 1;
          const soldCtn = Number(payload.totalCartons || payload.totalQty || 0);
          const returnedCtn = Number(payload.returnedCartons || 0);
          const returnedTons = Number(payload.returnedWeightKg || 0) / 1000;
          const grandVal = Number(payload.grandTotal || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });

          await createNotification({
            type: isForceSyncEdit ? 'warning' : 'success',
            title: isForceSyncEdit
              ? `تحديث تسوية تجزئة ${serialLabel} (مراجعة #${revNum})`
              : `تم تسوية رحلة تجزئة ${serialLabel}`,
            titleEn: isForceSyncEdit
              ? `Retail Settlement Synced ${serialLabel} (Rev #${revNum})`
              : `Retail Trip Settled ${serialLabel}`,
            message: `العميل: ${order.clientName || '—'} | المباع: ${soldCtn} كرتونة (${grandVal} ج.م) | المرتجع للمخزن: ${returnedCtn} كرتونة (${returnedTons.toFixed(2)} طن) — بواسطة ${currentUserName}`,
            messageEn: `Client: ${order.clientName || '—'} | Sold: ${soldCtn} ctn (${grandVal} EGP) | Warehouse Return: ${returnedCtn} ctn (${returnedTons.toFixed(2)} Tons) — By ${currentUserName}`,
            targetUserIds,
            targetRoles: targetUserIds.length > 0 ? [] : ['general_admin'],
            targetTab: 'sales_orders',
            targetModule: 'sales',
            highlightId: order.id,
            createdBy: currentUserId,
            createdByName: currentUserName,
            metadata: {
              orderId: order.id,
              orderSerial: order.serial || order.id,
              revision: revNum,
              soldCartons: soldCtn,
              returnedCartons: returnedCtn,
              grandTotal: Number(payload.grandTotal || 0)
            }
          });
        } catch (notifErr) {
          console.debug('Retail settlement notification note:', notifErr);
        }
      })();

      if (onSuccess) onSuccess({ mode: isForceSyncEdit ? 'force_synced' : 'settled', payload: { ...order, ...payload } });
      onClose();
    } catch (err) {
      console.error('Error saving retail settlement:', err);
      setErrorMsg(isAr ? `حدث خطأ أثناء حفظ التسوية: ${err.message}` : `Failed to save settlement: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Secondary Loading Plan action: Log Truck Arrival ('delivered') & Flag Pending Settlement
  const handleDeferSettlementAndMarkDelivered = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const nowIso = new Date().toISOString();
      const existingAudit = Array.isArray(order.auditTrail) ? order.auditTrail : [];
      const auditEntry = {
        id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        action: 'retail_delivery_deferred',
        performedBy: currentUserName,
        performedById: currentUserId,
        timestamp: nowIso,
        summaryAr: `تم تسجيل عودة/تسليم شاحنة التجزئة #${order.serial || order.id} (الحالة: تم التسليم) — بانتظار تأكيد ومطابقة الكميات المباعة`,
        summaryEn: `Marked Retail route order #${order.serial || order.id} as Delivered — Awaiting post-arrival sold quantity settlement`,
        changes: {
          metadata: [
            { labelAr: 'حالة التنفيذ', labelEn: 'Fulfillment Status', oldValue: order.fulfillmentStatus || 'shipped', newValue: 'delivered' },
            { labelAr: 'حالة تسوية التجزئة', labelEn: 'Retail Settlement', oldValue: order.retailSettlementStatus || 'not_required', newValue: 'awaiting_settlement' }
          ]
        }
      };

      const deferredPayload = {
        isRetailRouteOrder: true,
        fulfillmentStatus: 'delivered',
        retailSettlementStatus: 'awaiting_settlement',
        updatedAt: serverTimestamp(),
        updatedBy: currentUserName,
        auditTrail: [auditEntry, ...existingAudit]
      };

      await updateDoc(doc(db, 'sales_orders', order.id), deferredPayload);
      if (onSuccess) onSuccess({ mode: 'deferred', payload: deferredPayload });
      onClose();
    } catch (err) {
      console.error('Error marking retail arrival:', err);
      setErrorMsg(isAr ? `حدث خطأ أثناء تسجيل الوصول: ${err.message}` : `Failed to record arrival: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const payloadPct = Math.min(100, Math.round((totalAttachmentBytes / MAX_TOTAL_ATTACHMENT_BYTES) * 100));

  return (
    <>
      <div className={`fixed inset-0 ${zIndexClass} bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4`}>
        <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
                <Store className="w-6 h-6 text-cyan-300" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200 font-black">
                    #{order.serial || order.id}
                  </span>
                  {isForceSyncEdit ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 font-extrabold inline-flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {isAr
                        ? `وضع التعديل والمزامنة القسرية (مراجعة #${currentRevision + 1})`
                        : `Force-Sync Edit Mode (Rev #${currentRevision + 1})`}
                    </span>
                  ) : (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 font-extrabold inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {isAr ? 'تسوية جرد رحلة التجزئة بعد العودة' : 'Post-Arrival Retail Route Settlement'}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-black mt-0.5">
                  {order.clientName || (isAr ? 'عميل تجزئة' : 'Retail Client')}
                  {order.region ? ` — ${order.region}` : ''}
                </h3>
                <div className="text-[11px] text-slate-300 flex flex-wrap items-center gap-3 mt-0.5">
                  <TruckNameBadge
                    vehicle={matchedVehicle}
                    name={truckLabel}
                    plate={truckPlate}
                    isAr={isAr}
                    iconClassName="w-3.5 h-3.5 text-cyan-400 shrink-0 rtl:-scale-x-100"
                    nameClassName="text-slate-200 font-bold truncate"
                    copyClassName="text-slate-300 hover:text-white hover:bg-white/15"
                  />
                  {order.loadingOrderNumber && (
                    <span className="font-mono">
                      {isAr ? `تحميل #${order.loadingOrderNumber}` : `Trip #${order.loadingOrderNumber}`}
                    </span>
                  )}
                  {order.assignedDriverName && (
                    <span>
                      {isAr ? `السائق: ${order.assignedDriverName}` : `Driver: ${order.assignedDriverName}`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isForceSyncEdit && (
                <button
                  type="button"
                  onClick={() => openPrintableRetailSettlementSlip(order, isAr)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isAr ? 'طباعة الحالي' : 'Print Current'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50/70">
            {/* Permission Guard Banner if dispatcher lacks canSettleRetailOrders */}
            {!canSettleRetailOrders && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-2.5 text-xs text-amber-950">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-extrabold">
                    {isAr
                      ? 'وضع المشاهدة فقط (صلاحية تأكيد تسوية التجزئة مطلوبة)'
                      : 'Read-Only Settlement View (canSettleRetailOrders permission required)'}
                  </div>
                  <p className="text-amber-800 mt-0.5">
                    {allowDeferDelivery
                      ? (isAr
                          ? 'يمكنك تسجيل وصول الشاحنة الآن بالضغط على "تسجيل الوصول (التسوية لاحقاً)" ليتم تنبيه فريق المخزن والحسابات لتأكيد الكميات المباعة.'
                          : 'You can log physical truck arrival via "Mark Delivered (Settle Later)", which flags this order for authorized Finance/Warehouse settlement.')
                      : (isAr
                          ? 'تحتاج إلى صلاحية (تأكيد وتسوية مبيعات التجزئة) لحفظ أو تعديل الكميات المباعة.'
                          : 'You need "Confirm & Force-Sync Retail Van-Sales Settlement" permission to confirm or force-sync sold quantities.')}
                  </p>
                </div>
              </div>
            )}

            {/* Force-Sync Re-Edit Notice */}
            {isForceSyncEdit && canSettleRetailOrders && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-2.5 text-xs text-indigo-950">
                <RefreshCw className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-extrabold">
                    {isAr
                      ? 'تعديل ومزامنة قسرية (Force Sync) مع المخزن والحسابات'
                      : 'Force-Sync Post-Settlement Update for Warehouse & Accounting'}
                  </div>
                  <p className="text-indigo-800 mt-0.5">
                    {isAr
                      ? 'تمت التسوية المسبقة لهذا الطلب. أي تعديل على الكميات المباعة هنا سيتم مزامنته فوراً مع المخزن والفاتورة وإشعار المستخدمين المعنيين.'
                      : 'This Retail trip was previously settled. Saving changes will force-sync returned stock and invoice totals immediately and notify relevant users.'}
                  </p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl flex items-center gap-2 text-xs text-rose-800 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Live KPI Strip (No weight; Carton counts, Invoice Value & Detailed Products Sold breakdown) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 block">
                    {isAr ? 'المحمل على الشاحنة (الأصل)' : 'Loaded on Truck (Baseline)'}
                  </span>
                  <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                    {liveSummary.loadedCartons.toLocaleString()}{' '}
                    <span className="text-xs font-bold text-slate-500">{isAr ? 'كرتونة' : 'ctn'}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-700 block">
                    {isAr ? 'إجمالي المباع الفعلي' : 'Confirmed Sold Qty'}
                  </span>
                  <div className="flex items-baseline justify-between gap-2 mt-0.5">
                    <div className="text-lg font-black text-emerald-900 font-mono">
                      {liveSummary.soldCartons.toLocaleString()}{' '}
                      <span className="text-xs font-bold text-emerald-700">{isAr ? 'كرتونة' : 'ctn'}</span>
                    </div>
                    <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-emerald-200/70 text-emerald-900 font-mono">
                      {liveSummary.soldPct}%
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200">
                  <span className="text-[10px] font-bold text-sky-700 block">
                    {isAr ? 'المرتجع غير المباع للمخزن' : 'Unsold Return to Warehouse'}
                  </span>
                  <div className="text-lg font-black text-sky-900 font-mono mt-0.5">
                    {liveSummary.returnedCartons.toLocaleString()}{' '}
                    <span className="text-xs font-bold text-sky-700">{isAr ? 'كرتونة' : 'ctn'}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
                  <span className="text-[10px] font-bold text-indigo-700 block">
                    {isAr ? 'قيمة الفاتورة المعدلة' : 'Settled Invoice Total'}
                  </span>
                  <div className="text-lg font-black text-indigo-950 font-mono mt-0.5">
                    {liveSummary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span className="text-[11px] font-bold text-indigo-700">EGP</span>
                  </div>
                </div>
              </div>

              {/* Detailed Products Sold Live Breakdown Strip */}
              <div className="border-t border-slate-100 pt-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5">
                    <PackageCheck className="w-3.5 h-3.5 text-cyan-600" />
                    {isAr ? 'تفصيل الأصناف المباعة في الرحلة:' : 'Detailed Products Sold Summary:'}
                  </span>
                  {canSettleRetailOrders && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleConfirmAllSoldPreset}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-lg transition cursor-pointer shadow-2xs"
                      >
                        {isAr ? 'تأكيد بيع كامل الحمولة (صفر مرتجع)' : 'Confirm All Sold (0 Returned)'}
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmAllUnsoldPreset}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold rounded-lg transition cursor-pointer"
                      >
                        {isAr ? 'مرتجع كامل' : 'All Unsold'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {liveSummary.soldSkuDetails.map((sku) => (
                    <div
                      key={sku.productId}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold transition ${
                        sku.soldTotal === 0
                          ? 'bg-slate-100 border-slate-200 text-slate-500'
                          : sku.soldTotal === sku.loadedTotal
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-cyan-50 border-cyan-200 text-cyan-950'
                      }`}
                    >
                      <span className="truncate max-w-[180px]">{isAr ? sku.nameAr : sku.nameEn}</span>
                      <span className="font-mono font-black px-1.5 py-0.2 rounded bg-white/80 border border-black/5">
                        {sku.soldTotal} / {sku.loadedTotal}
                      </span>
                      <span className="text-[10px] opacity-80 font-mono">
                        ({sku.lineTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} EGP)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dual Synchronized Reconciliation Matrix */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-4 py-2.5 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800">
                  {isAr
                    ? 'مطابقة الكميات (تعديل المباع يحدّث المرتجع لحظياً والعكس صحيح)'
                    : 'Dual-Synced SKU Reconciliation (Sold + Unsold Returned = Loaded)'}
                </h4>
                <span className="text-[11px] text-slate-500 font-semibold">
                  {isAr ? 'الوحدة: كرتونة' : 'Unit: Cartons'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3 text-start font-extrabold">{isAr ? 'الصنف' : 'Product SKU'}</th>
                      <th className="py-2.5 px-3 text-center font-extrabold">{isAr ? 'المحمل' : 'Loaded'}</th>
                      <th className="py-2.5 px-3 text-center font-extrabold text-emerald-800 bg-emerald-50/50">
                        {isAr ? 'المباع الفعلي *' : 'Sold Qty *'}
                      </th>
                      <th className="py-2.5 px-3 text-center font-extrabold text-sky-800 bg-sky-50/50">
                        {isAr ? 'المرتجع للمخزن' : 'Unsold Return'}
                      </th>
                      <th className="py-2.5 px-3 text-end font-extrabold">{isAr ? 'قيمة المباع (ج.م)' : 'Sold Value'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineStates.map((row) => {
                      const skuCalc = liveSummary.soldSkuDetails.find((s) => s.productId === row.productId);
                      const hasBonus = row.loadedBonus > 0;
                      return (
                        <tr key={row.productId} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-3">
                            <div className="font-extrabold text-slate-900">
                              {isAr ? (row.productNameAr || row.productNameEn) : (row.productNameEn || row.productNameAr)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                              {row.productCode && <span>[{row.productCode}]</span>}
                              <span>
                                {row.detectedUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                              </span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-center font-mono">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 font-black text-slate-800">
                              {row.loadedQty}
                            </span>
                            {hasBonus && (
                              <span className="block text-[10px] text-emerald-700 font-bold mt-0.5">
                                +{row.loadedBonus} {isAr ? 'بونص' : 'bonus'}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-center bg-emerald-50/20">
                            <div className="inline-flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={row.loadedQty}
                                step={1}
                                disabled={!canSettleRetailOrders}
                                value={row.soldQty}
                                onChange={(e) => handleSoldQtyChange(row.productId, e.target.value)}
                                className="w-24 text-center px-2 py-1.5 rounded-xl border-2 border-emerald-300 focus:border-emerald-600 focus:outline-none font-mono font-black text-sm text-emerald-950 bg-white disabled:bg-slate-100 disabled:text-slate-500"
                              />
                              {hasBonus && (
                                <div className="flex items-center gap-1 text-[10px]">
                                  <span className="text-emerald-700 font-bold">{isAr ? 'بونص:' : 'Bonus:'}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={row.loadedBonus}
                                    step={1}
                                    disabled={!canSettleRetailOrders}
                                    value={row.soldBonus}
                                    onChange={(e) => handleSoldBonusChange(row.productId, e.target.value)}
                                    className="w-14 text-center px-1 py-0.5 rounded-lg border border-emerald-300 font-mono font-bold text-emerald-900 bg-white disabled:bg-slate-100"
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-center bg-sky-50/20">
                            <div className="inline-flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={row.loadedQty}
                                step={1}
                                disabled={!canSettleRetailOrders}
                                value={row.returnedQty}
                                onChange={(e) => handleReturnedQtyChange(row.productId, e.target.value)}
                                className="w-24 text-center px-2 py-1.5 rounded-xl border-2 border-sky-300 focus:border-sky-600 focus:outline-none font-mono font-black text-sm text-sky-950 bg-white disabled:bg-slate-100 disabled:text-slate-500"
                              />
                              {hasBonus && (
                                <span className="text-[10px] text-sky-700 font-mono font-bold">
                                  +{row.returnedBonus} {isAr ? 'بونص مرتجع' : 'ret bonus'}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-end font-mono font-black text-slate-900">
                            {(skuCalc?.lineTotal || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Multiple Buyer Proof Documents & Route Settlement Notes */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <FileImage className="w-4 h-4 text-cyan-600" />
                    {isAr
                      ? `مستندات وصور إثبات المشترين على خط السير (${buyerAttachments.length})`
                      : `Buyer Reference Documents & Photos (${buyerAttachments.length})`}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr
                      ? 'ارفع صوراً أو ملفات PDF لفواتير/إيصالات المحلات التي اشترت البضاعة مع تدوين اسم المشتري أو المنطقة.'
                      : 'Upload photos or PDFs of shop bills, handwritten route logs, or buyer receipts as audit proof.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded-lg border ${
                    payloadPct > 85 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    {Math.round(totalAttachmentBytes / 1024)} KB / 750 KB
                  </span>
                  {canSettleRetailOrders && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,application/pdf"
                        onChange={handleUploadBuyerDocs}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isAr ? 'رفع صور / مستندات' : 'Upload Docs / Photos'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {buyerAttachments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {buyerAttachments.map((att, idx) => {
                    const isImg =
                      (att.type || '').startsWith('image/') ||
                      (att.url || '').startsWith('data:image/');
                    return (
                      <div
                        key={att.id || idx}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewAttachment(att)}
                          className="w-11 h-11 rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition"
                          title={isAr ? 'معاينة المستند' : 'Preview Document'}
                        >
                          {isImg && att.url ? (
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                          ) : (
                            <FileText className="w-5 h-5 text-rose-500" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            type="text"
                            disabled={!canSettleRetailOrders}
                            value={att.buyerNote || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBuyerAttachments((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, buyerNote: val } : item))
                              );
                            }}
                            placeholder={isAr ? 'اسم المشتري / المحل / البيان...' : 'Buyer / shop reference note...'}
                            className="w-full text-xs font-bold text-slate-900 bg-white px-2 py-1 rounded-lg border border-slate-200 focus:border-cyan-500 focus:outline-none disabled:bg-slate-100"
                          />
                          <div className="text-[10px] text-slate-400 font-mono truncate">{att.name}</div>
                        </div>

                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(att)}
                            className="p-1 text-slate-500 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'معاينة' : 'Preview'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canSettleRetailOrders && (
                            <button
                              type="button"
                              onClick={() => setBuyerAttachments((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title={isAr ? 'حذف' : 'Remove'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات رحلة التوزيع والتسوية (اختياري):' : 'Route Settlement Notes (Optional):'}
                </label>
                <textarea
                  rows={2}
                  disabled={!canSettleRetailOrders}
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  placeholder={
                    isAr
                      ? 'مثال: تم بيع الجزء الأكبر لمحلات خط العوايد، المرتجع سليم ويعود للمخزن...'
                      : 'Optional summary of route sales, remaining returns, or settlement remarks...'
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-cyan-500 focus:outline-none bg-slate-50/50 disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            <div className="flex items-center flex-wrap gap-2">
              {allowDeferDelivery && order.fulfillmentStatus !== 'delivered' && order.fulfillmentStatus !== 'paid' && (
                <button
                  type="button"
                  onClick={handleDeferSettlementAndMarkDelivered}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-xs font-extrabold transition cursor-pointer disabled:opacity-50"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>{isAr ? 'تسجيل الوصول الآن (التسوية لاحقاً)' : 'Mark Delivered (Settle Later)'}</span>
                </button>
              )}

              {canSettleRetailOrders && (
                <button
                  type="button"
                  onClick={handleConfirmSettlement}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isForceSyncEdit ? <RefreshCw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>
                    {isSaving
                      ? (isAr ? 'جاري الحفظ والمزامنة...' : 'Saving & Syncing...')
                      : isForceSyncEdit
                        ? (isAr ? 'حفظ ومزامنة قسرية (Force Sync)' : 'Force-Sync Updated Settlement')
                        : allowDeferDelivery
                          ? (isAr ? 'تأكيد المباع وإتمام التسليم' : 'Confirm Sold Qty & Mark Delivered')
                          : (isAr ? 'تأكيد وحفظ تسوية المباع' : 'Confirm & Save Sold Qty')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* High-resolution Attachment Preview Modal */}
      {previewAttachment && (
        <AttachmentViewerModal
          attachment={previewAttachment}
          isOpen={Boolean(previewAttachment)}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </>
  );
}
