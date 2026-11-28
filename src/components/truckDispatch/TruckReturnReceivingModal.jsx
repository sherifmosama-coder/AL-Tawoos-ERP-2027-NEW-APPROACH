import React, { useState, useEffect, useMemo } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  ListChecks,
  Lock,
  PackageCheck,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Truck,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { db, functions } from '../../firebase.js';
import { httpsCallable } from 'firebase/functions';
import { formatDateStr, roundQty } from '../../utils/fgStockEngine.js';
import {
  buildTripDispatchMatrix,
  buildReturnInspectionMatrix,
  evaluateReturnHandshake,
} from '../../utils/truckDispatchUtils.js';
import {
  completeActionRequired,
  createNotification,
  dispatchWorkflowEvent,
} from '../../utils/notificationEngine.js';
import { evaluateReturnFieldLocks } from '../../utils/returnRoleEngine.js';
import { SalesOrderEditorModal } from '../salesOrders/SalesOrderEditorModal.jsx';
import RetailSettlementModal from '../RetailSettlementModal.jsx';
import { DEFAULT_PRICING_STRATEGIES } from '../../utils/pricingEngine.js';
import { ORDER_TYPE_META, fmtCtn } from './truckDispatchConstants.js';

// RETURN / RECEIVING MODAL (Strict Separation of Duties & 2-Party Alignment)
// =========================================================================
export default function TruckReturnReceivingModal({
  isOpen,
  onClose,
  trip,
  finishedProducts = [],
  allOrders = [],
  clients = [],
  vehicles = [],
  segments = [],
  productCategories = [],
  priceLists = [],
  strategies = DEFAULT_PRICING_STRATEGIES,
  stdRetailList = [],
  currentUser = {},
  returnAuthority = {},
  eligibleOrderSettlers = [],
  todayStr = '',
  onOpenClientProfile = null,
  onSaved,
  isAr = true,
}) {
  const dispatchDoc = trip?.dispatchDoc || null;

  const {
    columns,
    clientReturnRows,
    initialReturnByCol,
    liveExpectedByCol,
    tripOrdersSummary,
  } = useMemo(() => {
    if (!trip) {
      return {
        columns: [],
        clientReturnRows: [],
        initialReturnByCol: {},
        liveExpectedByCol: {},
        tripOrdersSummary: [],
      };
    }
    return buildReturnInspectionMatrix({
      tripOrders: trip.orders,
      finishedProducts,
      dispatchDoc,
    });
  }, [trip, finishedProducts, dispatchDoc]);

  const defaultActorRole = returnAuthority.defaultActorMode
    ? returnAuthority.defaultActorMode(dispatchDoc)
    : 'warehouse';

  const [actorMode, setActorMode] = useState(defaultActorRole);
  const [returnByCol, setReturnByCol] = useState({});
  const [stockReturnDate, setStockReturnDate] = useState(todayStr || formatDateStr(new Date()));
  const [returnNotes, setReturnNotes] = useState('');
  const [whAmendReason, setWhAmendReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Inline Sales Order Adjustment / Creation Settlement Modals
  const [inlineEditorState, setInlineEditorState] = useState(null);
  const [inlineRetailOrder, setInlineRetailOrder] = useState(null);
  const [inlineSettlementFeedback, setInlineSettlementFeedback] = useState('');

  // Order-Settlement Task Delegation state
  const [showTaskDelegation, setShowTaskDelegation] = useState(
    !returnAuthority.canAdjustOrCreateSalesOrders
  );
  const [taskTargetMode, setTaskTargetMode] = useState('all_eligible'); // 'all_eligible' | 'selected'
  const [selectedSettlerIds, setSelectedSettlerIds] = useState([]);
  const [taskNotes, setTaskNotes] = useState('');
  const [isSendingTask, setIsSendingTask] = useState(false);
  const [taskSentMsg, setTaskSentMsg] = useState('');

  // General Admin Exclusive Controls state
  const [adminWriteOffOpen, setAdminWriteOffOpen] = useState(false);
  const [adminWriteOffReason, setAdminWriteOffReason] = useState('');
  const [adminReopenOpen, setAdminReopenOpen] = useState(false);
  const [adminReopenReason, setAdminReopenReason] = useState('');

  useEffect(() => {
    if (!isOpen || !trip) return;
    setReturnByCol(initialReturnByCol);
    setStockReturnDate(formatDateStr(dispatchDoc?.stockReturnDate) || todayStr || formatDateStr(new Date()));
    setReturnNotes(dispatchDoc?.returnNotes || '');
    setWhAmendReason('');
    setAdminWriteOffOpen(false);
    setAdminWriteOffReason('');
    setAdminReopenOpen(false);
    setAdminReopenReason('');
    setInlineEditorState(null);
    setInlineRetailOrder(null);
    setInlineSettlementFeedback('');
    setTaskNotes('');
    setSelectedSettlerIds([]);
    setTaskTargetMode('all_eligible');
    setTaskSentMsg('');
    setShowTaskDelegation(!returnAuthority.canAdjustOrCreateSalesOrders);
    setActorMode(
      returnAuthority.defaultActorMode
        ? returnAuthority.defaultActorMode(dispatchDoc)
        : 'warehouse'
    );
  }, [isOpen, trip?.id]);

  // Keep Expected quantities synced live with Sales Orders whenever WH locked actuals or settlement is active
  const liveExpectedSignature = useMemo(() => JSON.stringify(liveExpectedByCol || {}), [liveExpectedByCol]);
  useEffect(() => {
    if (!isOpen || !trip) return;
    const shouldSyncFromOrders =
      Boolean(dispatchDoc?.whReturnConfirmedAt) ||
      (!dispatchDoc?.accountantReturnSubmittedAt &&
        (!dispatchDoc?.returnHandshakeStatus || dispatchDoc?.returnHandshakeStatus === 'none'));
    if (!shouldSyncFromOrders) return;

    setReturnByCol((prev) => {
      const nextMap = {};
      const allColKeys = new Set([
        ...Object.keys(initialReturnByCol || {}),
        ...Object.keys(liveExpectedByCol || {}),
      ]);
      allColKeys.forEach((colKey) => {
        const prevRow = prev[colKey] || initialReturnByCol[colKey] || {};
        const liveExp = liveExpectedByCol[colKey];
        const expExt = liveExp ? Number(liveExp.liveExpectedExtras || 0) : Number(prevRow.expectedExtras || 0);
        const expCli = liveExp ? Number(liveExp.liveExpectedClientReturns || 0) : Number(prevRow.expectedClientReturns || 0);
        const recExt = dispatchDoc?.whReturnConfirmedAt
          ? Number(prevRow.whReceivedExtras ?? initialReturnByCol[colKey]?.whReceivedExtras ?? 0)
          : expExt;
        const recCli = dispatchDoc?.whReturnConfirmedAt
          ? Number(prevRow.whReceivedClientReturns ?? initialReturnByCol[colKey]?.whReceivedClientReturns ?? 0)
          : expCli;
        const acctTotal = roundQty(expExt + expCli);
        const whTotal = roundQty(recExt + recCli);
        nextMap[colKey] = {
          ...prevRow,
          expectedExtras: expExt,
          expectedClientReturns: expCli,
          whReceivedExtras: recExt,
          whReceivedClientReturns: recCli,
          accountantExpectedTotal: acctTotal,
          whReceivedTotal: whTotal,
          variance: roundQty(whTotal - acctTotal),
        };
      });
      return nextMap;
    });
  }, [isOpen, trip?.id, dispatchDoc?.whReturnConfirmedAt, dispatchDoc?.returnHandshakeStatus, liveExpectedSignature]);

  if (!isOpen || !trip) return null;

  const fieldLocks = evaluateReturnFieldLocks({
    actorMode,
    authority: returnAuthority,
    dispatchDoc,
    currentUserId: currentUser?.id || '',
  });

  const evalRes = evaluateReturnHandshake({
    returnByCol,
    liveExpectedByCol,
    actorRole: actorMode,
    alreadyWhConfirmed: Boolean(dispatchDoc?.whReturnConfirmedAt),
    alreadyAcctConfirmed: Boolean(dispatchDoc?.accountantReturnSubmittedAt),
    isGeneralAdmin: Boolean(returnAuthority.isGeneralAdmin),
  });

  const handleFieldChange = (colKey, field, rawVal) => {
    const isWhField = field === 'whReceivedExtras' || field === 'whReceivedClientReturns';
    const isAcctField = field === 'expectedExtras' || field === 'expectedClientReturns';
    if (isWhField && !fieldLocks.canEditWhFields) return;
    if (isAcctField && !fieldLocks.canEditAcctExpectedFields) return;

    const val = Math.max(0, Number(rawVal) || 0);
    setReturnByCol((prev) => {
      const curr = prev[colKey] || {};
      const next = { ...curr, [field]: val };
      const acctTotal = roundQty(Number(next.expectedExtras || 0) + Number(next.expectedClientReturns || 0));
      const whTotal = roundQty(Number(next.whReceivedExtras || 0) + Number(next.whReceivedClientReturns || 0));
      return {
        ...prev,
        [colKey]: {
          ...next,
          accountantExpectedTotal: acctTotal,
          whReceivedTotal: whTotal,
          variance: roundQty(whTotal - acctTotal),
        },
      };
    });
  };

  const handleMatchExactFromExpected = () => {
    if (!fieldLocks.canEditWhFields) return;
    setReturnByCol((prev) => {
      const updated = {};
      Object.entries(prev).forEach(([k, v]) => {
        const expExt = Number(v.expectedExtras || 0);
        const expCli = Number(v.expectedClientReturns || 0);
        const tot = roundQty(expExt + expCli);
        updated[k] = {
          ...v,
          whReceivedExtras: expExt,
          whReceivedClientReturns: expCli,
          accountantExpectedTotal: tot,
          whReceivedTotal: tot,
          variance: 0,
        };
      });
      return updated;
    });
  };

  const buildSkuDeltaSummary = () => {
    const items = [];
    columns.forEach((c) => {
      const cell = returnByCol[c.colKey] || {};
      const v = Number(cell.variance || 0);
      const liveExp = liveExpectedByCol[c.colKey];
      const liveDelta = liveExp ? roundQty(Number(cell.accountantExpectedTotal || 0) - Number(liveExp.liveExpectedTotal || 0)) : 0;
      if (Math.abs(v) > 1e-4) {
        items.push(
          isAr
            ? `${c.shortNameAr} (${c.optionNameAr}): متوقع ${fmtCtn(cell.accountantExpectedTotal)} / مستلم ${fmtCtn(cell.whReceivedTotal)} (فرق ${v > 0 ? '+' : ''}${fmtCtn(v)})`
            : `${c.shortNameEn} (${c.optionNameEn}): Exp ${fmtCtn(cell.accountantExpectedTotal)} / Rec ${fmtCtn(cell.whReceivedTotal)} (Δ ${v > 0 ? '+' : ''}${fmtCtn(v)})`
        );
      } else if (Math.abs(liveDelta) > 1e-4) {
        items.push(
          isAr
            ? `${c.shortNameAr} (${c.optionNameAr}): مسجل ${fmtCtn(cell.accountantExpectedTotal)} / أوامر ${fmtCtn(liveExp.liveExpectedTotal)} (فرق ${liveDelta > 0 ? '+' : ''}${fmtCtn(liveDelta)})`
            : `${c.shortNameEn} (${c.optionNameEn}): Entered ${fmtCtn(cell.accountantExpectedTotal)} / Orders ${fmtCtn(liveExp.liveExpectedTotal)} (Δ ${liveDelta > 0 ? '+' : ''}${fmtCtn(liveDelta)})`
        );
      }
    });
    return items.join(' | ');
  };

  const handleAutoFillTaskNotes = () => {
    const deltaText = buildSkuDeltaSummary();
    const prefix = isAr
      ? `يرجى تسوية فروقات مرتجع رحلة #${trip.loadingOrderNumber} (${trip.loadingDate}) بتعديل أوامر البيع أو إضافة أمر توريد/مرتجع:\n`
      : `Please settle return variance for Trip #${trip.loadingOrderNumber} (${trip.loadingDate}) by adjusting orders or adding a Supply/Return order:\n`;
    setTaskNotes(`${prefix}${deltaText || ''}`.trim());
  };

  const handleToggleSettler = (uid) => {
    setSelectedSettlerIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleAssignSettlementTask = async () => {
    if (!taskNotes.trim()) {
      alert(isAr ? 'يرجى كتابة ملاحظات توضح المطلوب تعديله أو إضافته لتسوية الرحلة.' : 'Please enter settlement notes describing the required order adjustments.');
      return;
    }
    if (taskTargetMode === 'selected' && selectedSettlerIds.length === 0) {
      alert(isAr ? 'يرجى اختيار مستخدم واحد على الأقل من المؤهلين لتعديل أوامر البيع.' : 'Please select at least one authorized Sales Order user.');
      return;
    }

    setIsSendingTask(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);

      const resolvedUsers =
        taskTargetMode === 'selected'
          ? eligibleOrderSettlers.filter((u) => selectedSettlerIds.includes(u.id))
          : eligibleOrderSettlers;
      const resolvedTargetIds = resolvedUsers.map((u) => u.id);
      const resolvedTargetNames = resolvedUsers.map((u) => (isAr ? u.nameAr : u.name));
      const skuDeltaSummary = buildSkuDeltaSummary();

      const taskEntry = {
        id: `RST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: nowIso,
        createdBy: actorId,
        createdByName: actorName,
        targetMode: taskTargetMode,
        targetUserIds: resolvedTargetIds,
        targetUserNames: resolvedTargetNames,
        notes: taskNotes.trim(),
        skuDeltaSummary,
        status: 'open',
        completedAt: null,
        completedBy: null,
        completedByName: null,
      };

      const prevTasks = Array.isArray(dispatchDoc?.returnSettlementTasks)
        ? dispatchDoc.returnSettlementTasks
        : [];
      const taskAuditEntry = {
        id: `AUD-TSK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: 'truck_return_settlement_task_assigned',
        summaryAr: `توجيه مهمة تسوية أوامر بيع لرحلة #${trip.loadingOrderNumber} (${resolvedTargetNames.length > 0 ? resolvedTargetNames.join('، ') : 'المؤهلون تلقائياً'}) — ${taskNotes.trim()}`,
        summaryEn: `Assigned Sales Order settlement task for Trip #${trip.loadingOrderNumber} (${resolvedTargetNames.length > 0 ? resolvedTargetNames.join(', ') : 'Eligible Users'}) — ${taskNotes.trim()}`,
        changes: { metadata: [], lineChanges: [] },
      };

      const submitStepFn = httpsCallable(functions, 'salesSubmitReturnStep');
      await submitStepFn({
        mode: 'assign_task',
        tripId: trip.id,
        payload: {
          tripKey: trip.tripKey,
          loadingDate: trip.loadingDate,
          loadingOrderNumber: trip.loadingOrderNumber,
        },
        taskEntry,
        taskAuditEntry,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });

      await dispatchWorkflowEvent({
        eventKey: 'trip_return_order_settlement_task',
        docId: trip.id,
        docNumber: `LO-${trip.loadingOrderNumber}`,
        titleAr: `مطلوب تسوية أوامر بيع لرحلة #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        titleEn: `Sales Order Settlement Task — Trip #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        messageAr: `من المحاسب (${actorName}): ${taskNotes.trim()}${skuDeltaSummary ? ` | الفروقات: ${skuDeltaSummary}` : ''}`,
        messageEn: `From Accounting (${actorName}): ${taskNotes.trim()}${skuDeltaSummary ? ` | Variance: ${skuDeltaSummary}` : ''}`,
        targetModule: 'sales',
        targetTab: 'sales_orders',
        highlightId: trip.id,
        actor: currentUser,
        extraUserIds: resolvedTargetIds,
        onlyExplicitUsers: taskTargetMode === 'selected',
        metadata: {
          tripId: trip.id,
          settlementTripId: trip.id,
          taskId: taskEntry.id,
          notes: taskNotes.trim(),
          skuDeltaSummary,
        },
      });

      setTaskSentMsg(
        isAr
          ? 'تم إرسال مهمة التسوية بنجاح للمستخدمين المخولين لتعديل/إضافة أوامر البيع ✓'
          : 'Settlement task assigned successfully to authorized Sales Order users ✓'
      );
      setTaskNotes('');
    } catch (err) {
      console.error('Error assigning return settlement task:', err);
      alert(isAr ? `تعذر إرسال المهمة: ${err.message}` : `Failed assigning task: ${err.message}`);
    } finally {
      setIsSendingTask(false);
    }
  };

  const resolveVehicleDisplayNameModal = (vehObj, fallbackName = '') => {
    if (!vehObj) return fallbackName || '—';
    return (vehObj.vehicleModel || vehObj.makeModel || vehObj.name || fallbackName || vehObj.code || '—').trim();
  };

  const buildTripPrefillContext = (orderType = 'supply', settledFromTripExtras = false) => ({
    tripId: trip.id,
    loadingDate: trip.loadingDate,
    loadingOrderNumber: trip.loadingOrderNumber,
    assignedVehicleId: trip.primaryVehicleId || dispatchDoc?.vehicleId || '',
    assignedVehicleName: trip.vehicleDisplayName || dispatchDoc?.vehicleName || '',
    assignedVehiclePlate: trip.plateNumber || dispatchDoc?.plateNumber || '',
    assignedDriverId: trip.primaryDriverId || dispatchDoc?.driverId || '',
    assignedDriverName: trip.primaryDriverName || dispatchDoc?.driverName || '',
    assignedDeliveryRepId: trip.primaryRepId || dispatchDoc?.deliveryRepId || '',
    assignedDeliveryRepName: trip.primaryRepName || dispatchDoc?.deliveryRepName || '',
    orderType,
    settledFromTripExtras: Boolean(settledFromTripExtras && orderType === 'supply'),
    fulfillmentStatus: 'delivered',
  });

  const handleOpenInlineEditOrder = (orderId) => {
    const fullOrder = (trip.orders || []).find((x) => x.id === orderId) || allOrders.find((x) => x.id === orderId) || null;
    if (!fullOrder) return;
    setInlineSettlementFeedback('');
    setInlineEditorState({
      editingOrder: fullOrder,
      prefillTripContext: null,
      initialAdjustmentMode: true,
    });
  };

  const handleOpenInlineCreateOrder = (orderType = 'supply', settledFromTripExtras = false) => {
    setInlineSettlementFeedback('');
    setInlineEditorState({
      editingOrder: null,
      prefillTripContext: buildTripPrefillContext(orderType, settledFromTripExtras),
      initialAdjustmentMode: false,
    });
  };

  const handleOpenInlineRetailOrder = (orderId) => {
    const fullOrder = (trip.orders || []).find((x) => x.id === orderId) || allOrders.find((x) => x.id === orderId) || null;
    if (!fullOrder) return;
    setInlineSettlementFeedback('');
    setInlineRetailOrder(fullOrder);
  };

  const handleInlineOrderSaved = async (savedOrder) => {
    if (!savedOrder || !trip) return;
    const savedId = savedOrder.id;
    const prevOrders = Array.isArray(trip.orders) ? trip.orders : [];
    const existsIdx = prevOrders.findIndex((o) => o.id === savedId);
    const nextTripOrders =
      existsIdx >= 0
        ? prevOrders.map((o, idx) => (idx === existsIdx ? { ...o, ...savedOrder } : o))
        : [...prevOrders, savedOrder];

    const { liveExpectedByCol: nextLiveMap } = buildReturnInspectionMatrix({
      tripOrders: nextTripOrders,
      finishedProducts,
      dispatchDoc,
    });

    const isAcctFirstDiscrepancy =
      !dispatchDoc?.whReturnConfirmedAt &&
      dispatchDoc?.returnHandshakeStatus === 'discrepancy_pending_accounting';

    const nextReturnByCol = {};
    const allKeys = new Set([
      ...Object.keys(returnByCol || {}),
      ...Object.keys(nextLiveMap || {}),
    ]);
    allKeys.forEach((ck) => {
      const curr = returnByCol[ck] || {};
      const liveCell = nextLiveMap[ck] || { liveExpectedExtras: 0, liveExpectedClientReturns: 0 };
      const expExt = isAcctFirstDiscrepancy
        ? Number(curr.expectedExtras ?? liveCell.liveExpectedExtras ?? 0)
        : Number(liveCell.liveExpectedExtras || 0);
      const expCli = isAcctFirstDiscrepancy
        ? Number(curr.expectedClientReturns ?? liveCell.liveExpectedClientReturns ?? 0)
        : Number(liveCell.liveExpectedClientReturns || 0);
      const recExt = dispatchDoc?.whReturnConfirmedAt ? Number(curr.whReceivedExtras ?? 0) : expExt;
      const recCli = dispatchDoc?.whReturnConfirmedAt ? Number(curr.whReceivedClientReturns ?? 0) : expCli;
      const acctTotal = roundQty(expExt + expCli);
      const whTotal = roundQty(recExt + recCli);
      nextReturnByCol[ck] = {
        ...curr,
        expectedExtras: expExt,
        expectedClientReturns: expCli,
        whReceivedExtras: recExt,
        whReceivedClientReturns: recCli,
        accountantExpectedTotal: acctTotal,
        whReceivedTotal: whTotal,
        variance: roundQty(whTotal - acctTotal),
      };
    });

    const nextLiveTotal = roundQty(
      Object.values(nextLiveMap || {}).reduce((s, c) => s + Number(c?.liveExpectedTotal || 0), 0)
    );

    setReturnByCol(nextReturnByCol);

    const postEval = evaluateReturnHandshake({
      returnByCol: nextReturnByCol,
      liveExpectedByCol: nextLiveMap,
      actorRole: 'accountant',
      alreadyWhConfirmed: Boolean(dispatchDoc?.whReturnConfirmedAt),
      alreadyAcctConfirmed: Boolean(dispatchDoc?.accountantReturnSubmittedAt),
      isGeneralAdmin: Boolean(returnAuthority.isGeneralAdmin),
    });

    const nowIso = new Date().toISOString();
    const actorId = currentUser?.id || 'system';
    const actorName = isAr
      ? (currentUser?.nameAr || currentUser?.name || actorId)
      : (currentUser?.name || currentUser?.nameAr || actorId);

    // If Accountant had submitted first with a mismatch (discrepancy_pending_accounting) and adding/adjusting
    // this order now brings orders & expected returns back into alignment before WH receives physical goods,
    // automatically clear the discrepancy in Firestore and advance cleanly to `pending_wh_confirm`.
    if (
      !dispatchDoc?.whReturnConfirmedAt &&
      dispatchDoc?.returnHandshakeStatus === 'discrepancy_pending_accounting' &&
      !postEval.hasOrderMismatch &&
      !postEval.hasVariance
    ) {
      const clearAudit = {
        id: `AUD-STL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: 'truck_return_settlement_auto_cleared',
        summaryAr: `تمت تسوية فرق المرتجع بأمر البيع #${savedOrder.serial || savedId} — المرتجع المتوقع الآن ${postEval.totalExpected} كرتونة بانتظار استلام المخزن`,
        summaryEn: `Cleared return variance via Sales Order #${savedOrder.serial || savedId} — Expected return synced at ${postEval.totalExpected} ctn (pending WH)`,
        changes: {
          metadata: [
            { labelAr: 'حالة المطابقة', labelEn: 'Handshake Status', oldValue: 'discrepancy_pending_accounting', newValue: 'pending_wh_confirm' },
          ],
          lineChanges: [],
        },
      };

      const submitStepFn = httpsCallable(functions, 'salesSubmitReturnStep');
      await submitStepFn({
        mode: 'auto_clear',
        tripId: trip.id,
        payload: {
          returnHandshakeStatus: 'pending_wh_confirm',
          returnByCol: postEval.normalizedByCol,
          returnContentUpdatedAt: nowIso,
          accountantReturnSubmittedBy: dispatchDoc?.accountantReturnSubmittedBy || actorId,
          accountantReturnSubmittedByName: dispatchDoc?.accountantReturnSubmittedByName || actorName,
          accountantReturnSubmittedAt: dispatchDoc?.accountantReturnSubmittedAt || nowIso,
        },
        clearAudit,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });

      await Promise.all([
        completeActionRequired({
          actionType: 'trip_return_variance_accounting',
          docId: trip.id,
          completedBy: actorId,
          completedByName: actorName,
          resolutionNote: `Resolved inline via Sales Order #${savedOrder.serial || savedId}`,
        }),
        completeActionRequired({
          actionType: 'truck_return_accountant_review',
          docId: trip.id,
          completedBy: actorId,
          completedByName: actorName,
          resolutionNote: `Resolved inline via Sales Order #${savedOrder.serial || savedId}`,
        }),
      ]);

      await dispatchWorkflowEvent({
        eventKey: 'trip_return_expected_warehouse',
        docId: trip.id,
        docNumber: `LO-${trip.loadingOrderNumber}`,
        titleAr: `مطلوب تأكيد استلام مرتجعات رحلة #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        titleEn: `Confirm Physical Receipt for Trip #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        messageAr: `تمت تسوية أوامر البيع وأصبح المرتجع المتوقع للرحلة ${postEval.totalExpected} كرتونة. يرجى الفحص وتأكيد الاستلام الفعلي بالمخزن.`,
        messageEn: `Sales Orders settled; expected return is now ${postEval.totalExpected} ctn. Please confirm physical receipt in Warehouse.`,
        targetModule: 'sales',
        targetTab: 'truck_dispatch',
        highlightId: trip.id,
        actor: currentUser,
        metadata: { tripId: trip.id, totalExpected: postEval.totalExpected, openReturn: '1' },
      });

      setInlineSettlementFeedback(
        isAr
          ? `✓ تم حفظ الأمر #${savedOrder.serial || savedId} وتسوية الفرق تلقائياً — المرتجع المتوقع الآن (${fmtCtn(postEval.totalExpected)} كرتونة) بانتظار استلام المخزن.`
          : `✓ Order #${savedOrder.serial || savedId} saved & discrepancy cleared automatically — Expected (${fmtCtn(postEval.totalExpected)} ctn) is now awaiting Warehouse receipt.`
      );
      return;
    }

    if (dispatchDoc?.whReturnConfirmedAt && !postEval.hasVariance) {
      setInlineSettlementFeedback(
        isAr
          ? `✓ تم حفظ الأمر #${savedOrder.serial || savedId} وتطابقت الكميات (الفرق = 0) — يمكنك الآن الضغط على "تأكيد مطابقة الحسابات وإقفال الرحلة ✓".`
          : `✓ Order #${savedOrder.serial || savedId} saved and quantities match (Δ = 0) — click "Confirm Accounting Alignment & Close ✓" to finalize.`
      );
    } else if (isAcctFirstDiscrepancy && postEval.hasOrderMismatch) {
      setInlineSettlementFeedback(
        isAr
          ? `تم حفظ الأمر #${savedOrder.serial || savedId} — المرتجع المتوقع الآن من أوامر البيع (${fmtCtn(nextLiveTotal)} كرتونة) مقابل المصرح به (${fmtCtn(postEval.totalExpected)} كرتونة). لا يزال هناك فرق متبقٍ يلزم تسويته قبل إغلاق المهمة.`
          : `Saved Order #${savedOrder.serial || savedId} — Live Sales Orders expected return is now ${fmtCtn(nextLiveTotal)} ctn vs your declared ${fmtCtn(postEval.totalExpected)} ctn. A remaining discrepancy still needs settlement before clearing to Warehouse.`
      );
    } else {
      setInlineSettlementFeedback(
        isAr
          ? `تم حفظ الأمر #${savedOrder.serial || savedId} وتحديث المرتجع المتوقع (${fmtCtn(postEval.totalExpected)} كرتونة).`
          : `Saved Order #${savedOrder.serial || savedId} and refreshed expected return (${fmtCtn(postEval.totalExpected)} ctn).`
      );
    }
  };

  const handleAdminReopenReconciled = async () => {
    if (!returnAuthority.isGeneralAdmin) return;
    if (!adminReopenReason.trim()) {
      alert(isAr ? 'يرجى كتابة سبب إعادة فتح المطابقة للتعديل.' : 'Please provide an audit reason to reopen reconciled return.');
      return;
    }
    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);
      const reopenAudit = {
        id: `AUD-RO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: 'truck_return_admin_reopened',
        summaryAr: `إعادة فتح مطابقة مرتجع رحلة #${trip.loadingOrderNumber} بواسطة المدير العام — السبب: ${adminReopenReason.trim()}`,
        summaryEn: `General Admin reopened reconciled return for Trip #${trip.loadingOrderNumber} — Reason: ${adminReopenReason.trim()}`,
        changes: {
          metadata: [
            { labelAr: 'حالة المطابقة', labelEn: 'Handshake Status', oldValue: 'reconciled', newValue: 'discrepancy_pending_accounting' },
            { labelAr: 'سبب إعادة الفتح', labelEn: 'Reopen Reason', oldValue: '—', newValue: adminReopenReason.trim() },
          ],
          lineChanges: [],
        },
      };
      const finalizeFn = httpsCallable(functions, 'salesFinalizeReturnHandshake');
      await finalizeFn({
        tripId: trip.id,
        actionType: 'admin_reopen',
        reason: adminReopenReason.trim(),
        auditEntry: reopenAudit,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
      setAdminReopenOpen(false);
      setAdminReopenReason('');
    } catch (err) {
      console.error('Failed reopening return:', err);
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitReturn = async (submitRole) => {
    // Hard Separation-of-Duties & Lock Enforcement
    if (submitRole === 'warehouse' && !fieldLocks.canSubmitWhSide) {
      alert(fieldLocks.selfApprovalReasonAr || (isAr ? 'غير مصرح لك بتسجيل استلام المخزن.' : 'Not authorized for Warehouse receipt.'));
      return;
    }
    if (submitRole === 'accountant' && !fieldLocks.canSubmitAcctSide) {
      alert(fieldLocks.selfApprovalReasonAr || (isAr ? 'غير مصرح لك بتسجيل تأكيد المحاسبة.' : 'Not authorized for Accounting submission.'));
      return;
    }
    if ((submitRole === 'admin_settle_both' || submitRole === 'admin_writeoff') && !returnAuthority.isGeneralAdmin) {
      alert(isAr ? 'هذا الإجراء متاح للمدير العام فقط.' : 'General Admin permission required.');
      return;
    }
    if (submitRole === 'warehouse' && fieldLocks.requiresWhAmendReason && !whAmendReason.trim()) {
      alert(isAr ? 'يرجى إدخال سبب تعديل الكميات المستلمة مسبقاً.' : 'Please enter an amendment reason for modifying confirmed Warehouse quantities.');
      return;
    }
    if (submitRole === 'admin_writeoff' && !adminWriteOffReason.trim()) {
      alert(isAr ? 'يرجى إدخال سبب تسوية الفرق / تحميل عهدة السائق.' : 'Please enter an audit reason for variance write-off.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);

      const finalEval = evaluateReturnHandshake({
        returnByCol,
        liveExpectedByCol,
        actorRole: submitRole,
        alreadyWhConfirmed: Boolean(dispatchDoc?.whReturnConfirmedAt),
        alreadyAcctConfirmed: Boolean(dispatchDoc?.accountantReturnSubmittedAt),
        isGeneralAdmin: Boolean(returnAuthority.isGeneralAdmin),
      });

      const dispRef = doc(db, 'truck_dispatches', trip.id);
      const batch = writeBatch(db);

      const effStockRetDate = formatDateStr(stockReturnDate) || todayStr || formatDateStr(new Date());
      const hasPrevReturn = Boolean(
        dispatchDoc?.whReturnConfirmedAt || dispatchDoc?.accountantReturnSubmittedAt || dispatchDoc?.stockReturnDate
      );
      const prevStatus = dispatchDoc?.returnHandshakeStatus || 'none';
      const prevRetDate = formatDateStr(dispatchDoc?.stockReturnDate) || '';
      const prevRetNotes = String(dispatchDoc?.returnNotes || '').trim();
      const nextRetNotes = returnNotes.trim();
      const isSecondPartySignoff =
        (submitRole === 'warehouse' && !dispatchDoc?.whReturnConfirmedAt) ||
        (submitRole === 'accountant' && !dispatchDoc?.accountantReturnSubmittedAt) ||
        submitRole === 'admin_settle_both' ||
        submitRole === 'admin_writeoff';

      const retMetaChanges = [];
      if (!hasPrevReturn || prevRetDate !== effStockRetDate) {
        retMetaChanges.push({
          labelAr: 'تاريخ إضافة المرتجع للمخزن',
          labelEn: 'Stock Return Date',
          oldValue: prevRetDate || '—',
          newValue: effStockRetDate,
        });
      }
      if (!hasPrevReturn || prevStatus !== finalEval.nextStatus) {
        retMetaChanges.push({
          labelAr: 'حالة المطابقة',
          labelEn: 'Handshake Status',
          oldValue: prevStatus,
          newValue: finalEval.nextStatus,
        });
      }
      if (prevRetNotes !== nextRetNotes) {
        retMetaChanges.push({
          labelAr: 'ملاحظات المرتجع',
          labelEn: 'Return Notes',
          oldValue: prevRetNotes || '—',
          newValue: nextRetNotes || '—',
        });
      }
      if (whAmendReason.trim()) {
        retMetaChanges.push({
          labelAr: 'سبب تعديل استلام المخزن',
          labelEn: 'WH Amendment Reason',
          oldValue: '—',
          newValue: whAmendReason.trim(),
        });
      }
      if (submitRole === 'admin_writeoff' && adminWriteOffReason.trim()) {
        retMetaChanges.push({
          labelAr: 'سبب التسوية الإدارية للفروقات',
          labelEn: 'Admin Write-Off Reason',
          oldValue: '—',
          newValue: adminWriteOffReason.trim(),
        });
      }

      const retLineChanges = [];
      columns.forEach((c) => {
        const rec = finalEval.normalizedByCol[c.colKey] || {};
        const prevRec = dispatchDoc?.returnByCol?.[c.colKey] || {};
        if (!hasPrevReturn) {
          if (rec.accountantExpectedTotal > 0 || rec.whReceivedTotal > 0) {
            retLineChanges.push({
              productCode: c.optionCode || c.productCode,
              productNameAr: c.nameAr,
              productNameEn: c.nameEn,
              type: 'added',
              detailAr: `متوقع: ${rec.accountantExpectedTotal || 0} | مستلم: ${rec.whReceivedTotal || 0} | فرق: ${rec.variance || 0}`,
              detailEn: `Expected: ${rec.accountantExpectedTotal || 0} | Received: ${rec.whReceivedTotal || 0} | Δ ${rec.variance || 0}`,
            });
          }
        } else {
          const pExpExt = Number(prevRec.expectedExtras || 0);
          const pExpCli = Number(prevRec.expectedClientReturns || 0);
          const pRecExt = Number(prevRec.whReceivedExtras || 0);
          const pRecCli = Number(prevRec.whReceivedClientReturns || 0);
          const partsAr = [];
          const partsEn = [];
          if (Math.abs(pExpExt - (rec.expectedExtras || 0)) > 1e-4) {
            partsAr.push(`زيادات متوقعة: ${pExpExt} → ${rec.expectedExtras}`);
            partsEn.push(`Exp Extras: ${pExpExt} → ${rec.expectedExtras}`);
          }
          if (Math.abs(pExpCli - (rec.expectedClientReturns || 0)) > 1e-4) {
            partsAr.push(`مرتجع عملاء متوقع: ${pExpCli} → ${rec.expectedClientReturns}`);
            partsEn.push(`Exp Client Ret: ${pExpCli} → ${rec.expectedClientReturns}`);
          }
          if (Math.abs(pRecExt - (rec.whReceivedExtras || 0)) > 1e-4) {
            partsAr.push(`استلام زيادات: ${pRecExt} → ${rec.whReceivedExtras}`);
            partsEn.push(`Rec Extras: ${pRecExt} → ${rec.whReceivedExtras}`);
          }
          if (Math.abs(pRecCli - (rec.whReceivedClientReturns || 0)) > 1e-4) {
            partsAr.push(`استلام عملاء: ${pRecCli} → ${rec.whReceivedClientReturns}`);
            partsEn.push(`Rec Client Ret: ${pRecCli} → ${rec.whReceivedClientReturns}`);
          }
          if (partsAr.length > 0) {
            retLineChanges.push({
              productCode: c.optionCode || c.productCode,
              productNameAr: c.nameAr,
              productNameEn: c.nameEn,
              type: 'modified',
              detailAr: partsAr.join(' | '),
              detailEn: partsEn.join(' | '),
            });
          }
        }
      });

      if (hasPrevReturn && !isSecondPartySignoff && retMetaChanges.length === 0 && retLineChanges.length === 0) {
        onClose();
        return;
      }

      const returnAuditEntry = {
        id: `AUD-TR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action:
          submitRole === 'admin_writeoff'
            ? 'truck_return_admin_writeoff'
            : submitRole === 'admin_settle_both'
            ? 'truck_return_admin_dual_settled'
            : submitRole === 'accountant'
            ? 'truck_return_accountant_submitted'
            : 'truck_return_wh_confirmed',
        summaryAr:
          submitRole === 'accountant'
            ? `اعتماد المحاسب للمرتجع (${finalEval.totalExpected} كرتونة) — حالة: ${finalEval.nextStatus}`
            : submitRole === 'admin_writeoff'
            ? `تسوية إدارية لفروقات مرتجع رحلة #${trip.loadingOrderNumber} (المستلم ${finalEval.totalReceived} / المتوقع ${finalEval.totalExpected}) — السبب: ${adminWriteOffReason.trim()}`
            : submitRole === 'admin_settle_both'
            ? `اعتماد وإقفال القسمين بواسطة المدير العام لرحلة #${trip.loadingOrderNumber} (${finalEval.totalReceived} كرتونة)`
            : `استلام مخزن التام الفعلي (${finalEval.totalReceived} / ${finalEval.totalExpected}) — تاريخ المخزن: ${effStockRetDate}${whAmendReason.trim() ? ` — سبب التعديل: ${whAmendReason.trim()}` : ''}`,
        summaryEn:
          submitRole === 'accountant'
            ? `Accountant submitted/aligned returns (${finalEval.totalExpected} ctn) -> ${finalEval.nextStatus}`
            : submitRole === 'admin_writeoff'
            ? `General Admin variance write-off (${finalEval.totalReceived}/${finalEval.totalExpected} ctn) — ${adminWriteOffReason.trim()}`
            : submitRole === 'admin_settle_both'
            ? `General Admin settled both sides (${finalEval.totalReceived} ctn) -> reconciled`
            : `WH Custodian recorded actual receipt (${finalEval.totalReceived}/${finalEval.totalExpected} ctn) — Stock Date: ${effStockRetDate}${whAmendReason.trim() ? ` — Amend: ${whAmendReason.trim()}` : ''}`,
        changes: {
          metadata: retMetaChanges,
          lineChanges: retLineChanges,
        },
      };

      const payload = {
        id: trip.id,
        tripKey: trip.tripKey,
        loadingDate: trip.loadingDate,
        loadingOrderNumber: trip.loadingOrderNumber,
        vehicleId: trip.primaryVehicleId || dispatchDoc?.vehicleId || '',
        vehicleName: trip.vehicleDisplayName || dispatchDoc?.vehicleName || '',
        orderIds: Array.isArray(dispatchDoc?.orderIds) && dispatchDoc.orderIds.length > 0
          ? dispatchDoc.orderIds
          : trip.orders.map((o) => o.id),
        columns:
          Array.isArray(dispatchDoc?.columns) && dispatchDoc.columns.length > 0
            ? dispatchDoc.columns
            : buildTripDispatchMatrix({ tripOrders: trip.orders, finishedProducts }).columns.map((c) => ({
                colKey: c.colKey,
                productCode: c.productCode,
                optionSuffix: c.optionSuffix,
                optionCode: c.optionCode,
                packagingRatio: c.packagingRatio,
                nameAr: c.nameAr,
                nameEn: c.nameEn,
                lockedQty: c.lockedQty || 0,
                extraQty: c.extraQty || 0,
                totalDispatchedQty: roundQty((c.lockedQty || 0) + (c.extraQty || 0)),
              })),
        dispatchStatus:
          finalEval.nextStatus === 'reconciled'
            ? 'returned'
            : dispatchDoc?.dispatchStatus || 'dispatched',
        returnHandshakeStatus: finalEval.nextStatus,
        returnByCol: finalEval.normalizedByCol,
        stockReturnDate: effStockRetDate,
        returnNotes: returnNotes.trim(),
        returnContentUpdatedAt: nowIso,
        auditTrail: [...(Array.isArray(dispatchDoc?.auditTrail) ? dispatchDoc.auditTrail : []), returnAuditEntry],
        updatedBy: actorId,
        updatedByName: actorName,
        updatedAt: nowIso,
      };

      if (submitRole === 'accountant') {
        payload.accountantReturnSubmittedBy = actorId;
        payload.accountantReturnSubmittedByName = actorName;
        payload.accountantReturnSubmittedAt = nowIso;
        if (returnNotes.trim()) payload.accountantReturnNotes = returnNotes.trim();
      } else if (submitRole === 'warehouse') {
        payload.whReturnConfirmedBy = actorId;
        payload.whReturnConfirmedByName = actorName;
        payload.whReturnConfirmedAt = nowIso;
        if (returnNotes.trim()) payload.whReturnNotes = returnNotes.trim();
      } else if (submitRole === 'admin_settle_both' || submitRole === 'admin_writeoff') {
        if (!dispatchDoc?.whReturnConfirmedAt) {
          payload.whReturnConfirmedBy = actorId;
          payload.whReturnConfirmedByName = actorName;
          payload.whReturnConfirmedAt = nowIso;
        }
        payload.accountantReturnSubmittedBy = actorId;
        payload.accountantReturnSubmittedByName = actorName;
        payload.accountantReturnSubmittedAt = nowIso;
        if (submitRole === 'admin_writeoff') {
          payload.adminWriteOffReason = adminWriteOffReason.trim();
          payload.adminWriteOffBy = actorId;
          payload.adminWriteOffByName = actorName;
          payload.adminWriteOffAt = nowIso;
        }
      }

      // Close open settlement tasks automatically when reconciled with 0 variance or admin settlement
      if (finalEval.nextStatus === 'reconciled' && Array.isArray(dispatchDoc?.returnSettlementTasks)) {
        payload.returnSettlementTasks = dispatchDoc.returnSettlementTasks.map((t) =>
          t.status === 'open'
            ? {
                ...t,
                status: 'completed',
                completedAt: nowIso,
                completedBy: actorId,
                completedByName: actorName,
              }
            : t
        );
      }

      const { auditTrail: _unusedAudit, ...payloadWithoutAudit } = payload;
      if (submitRole === 'admin_settle_both' || submitRole === 'admin_writeoff') {
        const finalizeFn = httpsCallable(functions, 'salesFinalizeReturnHandshake');
        await finalizeFn({
          tripId: trip.id,
          actionType: submitRole,
          reason: adminWriteOffReason.trim(),
          payload: payloadWithoutAudit,
          auditEntry: returnAuditEntry,
          currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
        });
      } else {
        const submitStepFn = httpsCallable(functions, 'salesSubmitReturnStep');
        await submitStepFn({
          mode: 'submit_step',
          submitRole,
          tripId: trip.id,
          payload: payloadWithoutAudit,
          returnAuditEntry,
          currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
        });
      }

      // Automate Phase 2A Permission-Aware Warehouse <-> Accountant Handshake & Tasks
      const tripLabel = `#${trip.loadingOrderNumber} (${trip.loadingDate})`;

      if (finalEval.nextStatus === 'pending_wh_confirm') {
        await dispatchWorkflowEvent({
          eventKey: 'trip_return_expected_warehouse',
          docId: trip.id,
          docNumber: `LO-${trip.loadingOrderNumber}`,
          titleAr: `مطلوب تأكيد استلام مرتجعات رحلة ${tripLabel}`,
          titleEn: `Confirm Physical Receipt for Trip ${tripLabel}`,
          messageAr: `سجل المحاسب (${actorName}) مرتجعات متوقعة بإجمالي ${finalEval.totalExpected} كرتونة. يرجى الفحص وتأكيد الاستلام الفعلي بالمخزن.`,
          messageEn: `Accountant (${actorName}) registered ${finalEval.totalExpected} expected cartons. Please confirm physical receipt in FG warehouse.`,
          targetModule: 'sales',
          targetTab: 'truck_dispatch',
          highlightId: trip.id,
          actor: currentUser,
          metadata: { tripId: trip.id, totalExpected: finalEval.totalExpected, openReturn: '1' },
        });
      } else if (finalEval.nextStatus === 'pending_accounting_confirm') {
        await Promise.all([
          completeActionRequired({
            actionType: 'truck_return_wh_confirm',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH confirmed actual receipt (${finalEval.totalReceived} ctn)`,
          }),
          completeActionRequired({
            actionType: 'trip_return_expected_warehouse',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH confirmed actual receipt (${finalEval.totalReceived} ctn)`,
          }),
        ]);

        await dispatchWorkflowEvent({
          eventKey: 'trip_return_alignment_accounting',
          docId: trip.id,
          docNumber: `LO-${trip.loadingOrderNumber}`,
          titleAr: `مطلوب مطابقة المحاسبة لاستلام مرتجع رحلة ${tripLabel}`,
          titleEn: `Accounting Alignment Needed — Trip ${tripLabel}`,
          messageAr: `أتم أمين المخزن (${actorName}) الاستلام الفعلي لمرتجعات الرحلة (${finalEval.totalReceived} كرتونة مطابقة للمتوقع — تاريخ المخزن: ${effStockRetDate}). يرجى تأكيد المطابقة النهائية.`,
          messageEn: `Warehouse (${actorName}) confirmed ${finalEval.totalReceived} returned cartons (Stock Date: ${effStockRetDate}). Accounting alignment sign-off required to close trip.`,
          targetModule: 'sales',
          targetTab: 'truck_dispatch',
          highlightId: trip.id,
          actor: currentUser,
          metadata: { tripId: trip.id, totalReceived: finalEval.totalReceived, stockReturnDate: effStockRetDate, openReturn: '1' },
        });
      } else if (finalEval.nextStatus === 'discrepancy_pending_accounting') {
        await Promise.all([
          completeActionRequired({
            actionType: 'truck_return_wh_confirm',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH submitted receipt with variance (${finalEval.totalVariance} ctn)`,
          }),
          completeActionRequired({
            actionType: 'trip_return_expected_warehouse',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH submitted receipt with variance (${finalEval.totalVariance} ctn)`,
          }),
        ]);

        const varDetails = finalEval.discrepancies
          .map((d) => `${d.colKey}: (${d.received}/${d.expected}, ${d.variance > 0 ? '+' : ''}${d.variance})`)
          .join(', ');

        await dispatchWorkflowEvent({
          eventKey: 'trip_return_variance_accounting',
          docId: trip.id,
          docNumber: `LO-${trip.loadingOrderNumber}`,
          titleAr: `فروقات مرتجع رحلة ${tripLabel} — يتطلب تسوية أوامر البيع`,
          titleEn: `Return Variance Alert — Trip ${tripLabel}`,
          messageAr:
            submitRole === 'warehouse'
              ? `استلم أمين المخزن (${actorName}) ${finalEval.totalReceived} كرتونة مقابل ${finalEval.totalExpected} متوقع (فرق: ${finalEval.totalVariance}). الكميات المستلمة مثبتة؛ يرجى مراجعة وتسوية أوامر البيع. ${varDetails}`
              : `توجد فروقات أوامر بيع لمرتجع رحلة ${tripLabel}. يرجى تعديل أو إضافة أوامر البيع لتسوية الفرق.`,
          messageEn:
            submitRole === 'warehouse'
              ? `Warehouse (${actorName}) locked ${finalEval.totalReceived} ctn vs ${finalEval.totalExpected} expected (Δ ${finalEval.totalVariance}). Accounting settlement required via Sales Orders.`
              : `Sales Order mismatch detected for Trip ${tripLabel} returns.`,
          targetModule: 'sales',
          targetTab: 'truck_dispatch',
          highlightId: trip.id,
          actor: currentUser,
          metadata: {
            tripId: trip.id,
            totalExpected: finalEval.totalExpected,
            totalReceived: finalEval.totalReceived,
            totalVariance: finalEval.totalVariance,
            discrepancies: finalEval.discrepancies,
            openReturn: '1',
          },
        });
      } else if (finalEval.nextStatus === 'reconciled') {
        await Promise.all([
          completeActionRequired({ actionType: 'truck_return_wh_confirm', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_expected_warehouse', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'truck_return_accountant_review', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_variance_accounting', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_alignment_accounting', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_order_settlement_task', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
        ]);

        const notifyIds = [
          dispatchDoc?.whReturnConfirmedBy,
          dispatchDoc?.accountantReturnSubmittedBy,
        ].filter((id) => id && id !== actorId);

        await createNotification({
          type: 'success',
          title: `تم إقفال ومطابقة مرتجعات رحلة ${tripLabel}`,
          titleEn: `Trip Return Reconciled ${tripLabel}`,
          message: `تم تأكيد القسمين وإقفال المرتجع بإجمالي ${finalEval.totalReceived} كرتونة — بواسطة ${actorName}`,
          messageEn: `Two-party return alignment closed: ${finalEval.totalReceived} cartons — Confirmed by ${actorName}`,
          targetTab: 'truck_dispatch',
          targetModule: 'sales',
          highlightId: trip.id,
          createdBy: actorId,
          createdByName: actorName,
          targetUserIds: notifyIds,
          targetRoles: ['general_admin'],
        });
      }

      if (onSaved) onSaved(payload, finalEval);
      onClose();
    } catch (err) {
      console.error('Error submitting return inspection:', err);
      alert(isAr ? `حدث خطأ أثناء حفظ المرتجع: ${err.message}` : `Error saving return inspection: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sumField = (field) =>
    roundQty(columns.reduce((s, c) => s + Number(returnByCol[c.colKey]?.[field] || 0), 0));

  const whConfDateStr = dispatchDoc?.whReturnConfirmedAt
    ? String(dispatchDoc.whReturnConfirmedAt).slice(0, 10)
    : '';
  const isDeferredStocktakeDate = Boolean(
    stockReturnDate && (whConfDateStr ? stockReturnDate > whConfDateStr : stockReturnDate > (todayStr || formatDateStr(new Date())))
  );

  const detectedRoleBadge = (() => {
    if (returnAuthority.detectedRole === 'general_admin') {
      return {
        ar: 'مدير عام (اعتماد مزدوج)',
        en: 'General Admin (Dual Authority)',
        cls: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
      };
    }
    if (returnAuthority.detectedRole === 'dual_explicit') {
      return {
        ar: 'صلاحية مخزن + محاسبة (طرف واحد/رحلة)',
        en: 'Dual Explicit (1 Side / Trip)',
        cls: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
      };
    }
    if (returnAuthority.detectedRole === 'warehouse') {
      return {
        ar: 'أمين مخزن التام (استلام فعلي فقط)',
        en: 'WH Custodian (Actual Receipt Only)',
        cls: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
      };
    }
    if (returnAuthority.detectedRole === 'accountant') {
      return {
        ar: 'قسم الحسابات (مراجعة ومطابقة)',
        en: 'Accounting Dept (Expected & Alignment)',
        cls: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40',
      };
    }
    return {
      ar: 'عرض فقط (بدون صلاحية اعتماد)',
      en: 'Read-Only Viewer',
      cls: 'bg-slate-600/40 text-slate-200 border-slate-400/40',
    };
  })();

  const statusText =
    dispatchDoc?.returnHandshakeStatus === 'reconciled'
      ? (isAr ? 'مطابق ومقفل بتأكيد القسمين ✓' : 'Reconciled by Both Depts ✓')
      : dispatchDoc?.returnHandshakeStatus === 'discrepancy_pending_accounting'
      ? (isAr ? 'فروقات بانتظار تسوية الحسابات وأوامر البيع ⚠️' : 'Discrepancy — Accounting Order Settlement Required')
      : dispatchDoc?.returnHandshakeStatus === 'pending_accounting_confirm'
      ? (isAr ? 'تم استلام المخزن — بانتظار تأكيد المحاسبة للمطابقة' : 'WH Received — Pending Accounting Alignment')
      : dispatchDoc?.returnHandshakeStatus === 'pending_wh_confirm'
      ? (isAr ? 'تم تسجيل المحاسب — بانتظار الاستلام الفعلي بالمخزن' : 'Acct Submitted — Pending WH Physical Receipt')
      : (isAr ? 'بانتظار تسجيل الطرفين (المخزن + الحسابات)' : 'Pending Both Depts (WH + Accounting)');

  const existingSettlementTasks = Array.isArray(dispatchDoc?.returnSettlementTasks)
    ? [...dispatchDoc.returnSettlementTasks].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    : [];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={onClose}
      >
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-start animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black">
                  {isAr
                    ? `استلام ومطابقة مرتجعات الشاحنة — رحلة #${trip.loadingOrderNumber}`
                    : `Truck Return & Receiving Reconciliation — Trip #${trip.loadingOrderNumber}`}
                </h3>
                <span className="px-2 py-0.5 rounded-lg bg-white/10 font-mono text-[11px] font-bold">
                  {trip.loadingDate}
                </span>
                <span className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-black ${detectedRoleBadge.cls}`}>
                  {isAr ? detectedRoleBadge.ar : detectedRoleBadge.en}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                {trip.vehicleDisplayName} • {statusText}
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

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Two-Party Alignment Sign-off Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              className={`rounded-2xl border p-2.5 flex items-center justify-between gap-2 text-xs ${
                fieldLocks.whAlreadyConfirmed
                  ? 'bg-teal-50/75 border-teal-300 text-teal-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <PackageCheck className={`w-4 h-4 shrink-0 ${fieldLocks.whAlreadyConfirmed ? 'text-teal-600' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className="font-black">{isAr ? '١. تأكيد أمين مخزن التام' : '1. Warehouse Physical Receipt'}</div>
                  <div className="text-[10.5px] font-bold truncate">
                    {fieldLocks.whAlreadyConfirmed
                      ? (isAr
                          ? `✓ تم الاستلام بواسطة ${dispatchDoc.whReturnConfirmedByName || 'المخزن'}`
                          : `✓ Confirmed by ${dispatchDoc.whReturnConfirmedByName || 'Warehouse'}`)
                      : (isAr ? '⏳ بانتظار تأكيد الكميات المستلمة فعلياً' : '⏳ Pending physical receipt confirmation')}
                  </div>
                </div>
              </div>
              {fieldLocks.whAlreadyConfirmed && dispatchDoc?.stockReturnDate && (
                <span
                  className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-black border shrink-0 ${
                    isDeferredStocktakeDate
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-teal-800 border-teal-200'
                  }`}
                >
                  {isDeferredStocktakeDate
                    ? (isAr ? `مؤجل للجرد: ${dispatchDoc.stockReturnDate}` : `Deferred: ${dispatchDoc.stockReturnDate}`)
                    : (isAr ? `رصيد المخزن: ${dispatchDoc.stockReturnDate}` : `Stock: ${dispatchDoc.stockReturnDate}`)}
                </span>
              )}
            </div>

            <div
              className={`rounded-2xl border p-2.5 flex items-center justify-between gap-2 text-xs ${
                fieldLocks.isReconciled
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                  : evalRes.hasVariance
                  ? 'bg-rose-50/75 border-rose-300 text-rose-950'
                  : fieldLocks.acctAlreadyConfirmed
                  ? 'bg-indigo-50/75 border-indigo-300 text-indigo-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardCheck
                  className={`w-4 h-4 shrink-0 ${
                    fieldLocks.isReconciled
                      ? 'text-emerald-600'
                      : evalRes.hasVariance
                      ? 'text-rose-600'
                      : fieldLocks.acctAlreadyConfirmed
                      ? 'text-indigo-600'
                      : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-black">{isAr ? '٢. مطابقة الإدارة المالية والحسابات' : '2. Accounting Alignment'}</div>
                  <div className="text-[10.5px] font-bold truncate">
                    {fieldLocks.isReconciled
                      ? (isAr
                          ? `✓ تمت المطابقة بواسطة ${dispatchDoc.accountantReturnSubmittedByName || 'المحاسبة'}`
                          : `✓ Aligned by ${dispatchDoc.accountantReturnSubmittedByName || 'Accounting'}`)
                      : evalRes.hasVariance
                      ? (isAr ? '⚠️ يوجد فرق — يجب تسوية أوامر البيع' : '⚠️ Discrepancy — settle via Sales Orders')
                      : fieldLocks.acctAlreadyConfirmed
                      ? (isAr
                          ? `✓ سُجل المتوقع بواسطة ${dispatchDoc.accountantReturnSubmittedByName || 'المحاسبة'}`
                          : `✓ Expected by ${dispatchDoc.accountantReturnSubmittedByName || 'Accounting'}`)
                      : (isAr ? '⏳ بانتظار تأكيد المطابقة من المحاسبة' : '⏳ Pending Accounting alignment')}
                  </div>
                </div>
              </div>
              {fieldLocks.isReconciled && (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black shrink-0">
                  {isAr ? 'مقفل ✓' : 'Locked ✓'}
                </span>
              )}
            </div>
          </div>

          {/* Separation of Duties & Lock Notices */}
          {fieldLocks.blockedBySelfApproval && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-900 font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{isAr ? fieldLocks.selfApprovalReasonAr : fieldLocks.selfApprovalReasonEn}</span>
            </div>
          )}

          {actorMode === 'accountant' && fieldLocks.whAlreadyConfirmed && !fieldLocks.blockedBySelfApproval && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-teal-50 border border-teal-300 text-xs text-teal-950 font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                {isAr
                  ? `الكميات المستلمة فعلياً مثبتة ومقفولة بواسطة أمين المخزن (${dispatchDoc?.whReturnConfirmedByName || 'المخزن'}) ولا يمكن تعديلها من المحاسبة. تظهر أرقام المخزن للقراءة فقط للمقارنة مع أوامر البيع.`
                  : fieldLocks.whLockedForAccountantEn}
              </span>
            </div>
          )}

          {/* Mode Switcher (Shown ONLY for General Admin or explicit dual-department grant) + Stock Return Date */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
            <div className="flex items-center gap-1.5">
              {returnAuthority.canAccessBothModes ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActorMode('warehouse')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                      actorMode === 'warehouse'
                        ? 'bg-teal-600 text-white border-teal-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? 'وضع أمين مخزن التام (الاستلام الفعلي)' : 'Warehouse Mode (Actual Receipt)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActorMode('accountant')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                      actorMode === 'accountant'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? 'وضع المحاسب (المتوقع والمطابقة)' : 'Accountant Mode (Expected & Alignment)'}
                  </button>
                </>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-800">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {actorMode === 'warehouse'
                      ? (isAr ? 'وضع مقيد تلقائياً: أمين مخزن التام (الاستلام الفعلي فقط)' : 'Locked Role: Warehouse Custodian (Actual Receipt Only)')
                      : (isAr ? 'وضع مقيد تلقائياً: المحاسبة (مراجعة ومطابقة فقط)' : 'Locked Role: Accounting (Alignment & Order Settlement Only)')}
                  </span>
                </div>
              )}
            </div>

            {actorMode === 'warehouse' && fieldLocks.canEditWhFields && (
              <button
                type="button"
                onClick={handleMatchExactFromExpected}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'تطابق تام مع المتوقع ✓' : 'Match Exact Expected ✓'}</span>
              </button>
            )}

            {/* Stock Return Date (editable ONLY by Warehouse; supports EOD Stocktake / جرد deferral) */}
            <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-300">
              <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <label className="text-[11px] font-black text-slate-700 whitespace-nowrap">
                {isAr ? 'تاريخ إضافة المرتجع للمخزن:' : 'Stock Return Date:'}
              </label>
              <input
                type="date"
                disabled={!fieldLocks.canEditWhFields}
                value={stockReturnDate}
                onChange={(e) => setStockReturnDate(e.target.value)}
                className="text-xs font-mono font-bold text-slate-900 outline-none bg-transparent disabled:text-slate-500 disabled:cursor-not-allowed"
              />
              {isDeferredStocktakeDate && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                  {isAr ? 'مؤجل لما بعد الجرد' : 'Deferred (EOD Count)'}
                </span>
              )}
            </div>
          </div>

          {/* Return Verification Matrix */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-2xs">
            <table className="w-full border-collapse text-xs text-start min-w-[680px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-start font-black text-slate-800 sticky start-0 bg-slate-100 z-10 min-w-[230px] border-e border-slate-200">
                    {isAr ? 'بند المرتجع / نوع أمر البيع' : 'Return Stream / Order Type'}
                  </th>
                  {columns.map((col) => (
                    <th key={col.colKey} className="py-2 px-2.5 text-center min-w-[130px] border-e border-slate-200/70">
                      <div className="font-extrabold text-slate-900 text-[11px]">{isAr ? col.shortNameAr : col.shortNameEn}</div>
                      <div className="text-[10px] font-bold text-indigo-700">{isAr ? col.optionNameAr : col.optionNameEn}</div>
                      <div className="text-[9px] font-mono text-slate-400">{col.optionCode}</div>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-center font-black text-slate-800 min-w-[100px]">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {/* 1. Extras Dispatched Reference + Expected / WH Actual */}
                <tr className="bg-teal-50/50">
                  <td className="py-2.5 px-3 sticky start-0 bg-teal-50 border-e border-teal-200 z-10">
                    <div className="font-black text-teal-900">{isAr ? '١. مرتجع زيادات الرحلة (Extras)' : '1. Trip Extras Return'}</div>
                    <span className="text-[10px] text-teal-700 font-bold">
                      {actorMode === 'accountant'
                        ? fieldLocks.expectedDerivedLiveFromOrders
                          ? (isAr ? 'محسوب آلياً من أوامر البيع مقابل استلام المخزن' : 'Live from Orders vs Locked WH Receipt')
                          : (isAr ? 'متوقع عودته حسب صرف التحميل' : 'Expected from dispatch slip')
                        : (isAr ? 'الكمية السليمة المستلمة فعلياً للمخزن' : 'Good cartons returned to shelf')}
                    </span>
                  </td>
                  {columns.map((col) => {
                    const cell = returnByCol[col.colKey] || {};
                    const settledSold = Number(liveExpectedByCol[col.colKey]?.settledExtrasSold || 0);
                    return (
                      <td key={col.colKey} className="py-2 px-2 text-center border-e border-teal-100 space-y-1">
                        <div className="text-[10px] text-slate-500 font-mono">
                          {isAr ? 'منصرف:' : 'Out:'} <strong>{fmtCtn(col.dispatchedExtrasQty)}</strong>
                          {settledSold > 0 && (
                            <span className="text-emerald-700 font-bold ms-1">
                              (-{fmtCtn(settledSold)})
                            </span>
                          )}
                        </div>
                        {actorMode === 'accountant' ? (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditAcctExpectedFields}
                              value={cell.expectedExtras ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'expectedExtras', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditAcctExpectedFields
                                  ? 'bg-white border-indigo-300'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            {fieldLocks.whAlreadyConfirmed && (
                              <div className="text-[10px] font-mono font-bold text-teal-800">
                                {isAr ? 'مستلم مخزن:' : 'WH Actual:'} <strong>{fmtCtn(cell.whReceivedExtras ?? 0)}</strong>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditWhFields}
                              value={cell.whReceivedExtras ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'whReceivedExtras', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditWhFields
                                  ? 'bg-white border-teal-400'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            <div className="text-[10px] font-mono text-indigo-700 font-bold">
                              {isAr ? 'متوقع:' : 'Exp:'} {fmtCtn(cell.expectedExtras ?? 0)}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono font-black text-teal-900">
                    <div>{fmtCtn(actorMode === 'accountant' ? sumField('expectedExtras') : sumField('whReceivedExtras'))}</div>
                    {actorMode === 'accountant' && fieldLocks.whAlreadyConfirmed && (
                      <div className="text-[10px] text-teal-700">{isAr ? 'مخزن:' : 'WH:'} {fmtCtn(sumField('whReceivedExtras'))}</div>
                    )}
                  </td>
                </tr>

                {/* 2. Client Returns Breakdown by Sales Order Type */}
                {clientReturnRows.map((cr) => (
                  <tr key={cr.orderId} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 sticky start-0 bg-white border-e border-slate-200 z-10">
                      {onOpenClientProfile && cr.clientId ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenClientProfile({
                              clientId: cr.clientId,
                              branchId: cr.branchId || '',
                              branchName: cr.branchName || '',
                            })
                          }
                          className="font-extrabold text-slate-900 hover:text-indigo-700 hover:underline truncate max-w-[210px] text-start block cursor-pointer"
                        >
                          {cr.clientName}
                        </button>
                      ) : (
                        <div className="font-extrabold text-slate-900 truncate max-w-[210px]">{cr.clientName}</div>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-500">#{cr.serial}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${ORDER_TYPE_META[cr.orderType]?.cls || ''}`}>
                          {isAr ? ORDER_TYPE_META[cr.orderType]?.ar : ORDER_TYPE_META[cr.orderType]?.en}
                        </span>
                        {cr.isPartialRejection && (
                          <span className="px-1 py-0.2 rounded bg-rose-100 text-rose-800 text-[9px] font-bold">
                            {isAr ? 'مرتجع جزئي' : 'Partial Rej.'}
                          </span>
                        )}
                        {cr.isUndeliveredReturn && (
                          <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                            {isAr ? 'غير مُسلَّم (مرتجع)' : 'Undelivered Return'}
                          </span>
                        )}
                      </div>
                    </td>
                    {columns.map((col) => {
                      const q = Number(cr.quantitiesByCol[col.colKey] || 0);
                      return (
                        <td key={col.colKey} className="py-2 px-2.5 text-center font-mono text-slate-700 border-e border-slate-100">
                          {q > 0 ? <span className="font-bold">{fmtCtn(q)}</span> : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-center font-mono font-black text-slate-900">{fmtCtn(cr.rowTotal)}</td>
                  </tr>
                ))}

                {/* 3. Client Returns Summary Input Row (Expected vs WH Received) */}
                <tr className="bg-indigo-50/40">
                  <td className="py-2.5 px-3 sticky start-0 bg-indigo-50/70 border-e border-indigo-200 z-10">
                    <div className="font-black text-indigo-950">
                      {isAr ? '٢. مرتجعات العملاء (حسب أوامر البيع)' : '2. Client Returns (Per Order Types)'}
                    </div>
                    <span className="text-[10px] text-indigo-700 font-bold">
                      {actorMode === 'accountant'
                        ? fieldLocks.expectedDerivedLiveFromOrders
                          ? (isAr ? 'محسوب آلياً من أوامر البيع مقابل استلام المخزن' : 'Live from Orders vs Locked WH Receipt')
                          : (isAr ? 'المرتجع المتوقع المسجل من المحاسبة' : 'Accountant Registered Expected Return')
                        : (isAr ? 'مرتجع العملاء المستلم فعلياً بالمخزن' : 'WH Received Client Returns')}
                    </span>
                  </td>
                  {columns.map((col) => {
                    const cell = returnByCol[col.colKey] || {};
                    return (
                      <td key={col.colKey} className="py-2 px-2 text-center border-e border-indigo-100 space-y-1">
                        {actorMode === 'accountant' ? (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditAcctExpectedFields}
                              value={cell.expectedClientReturns ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'expectedClientReturns', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditAcctExpectedFields
                                  ? 'bg-white border-indigo-300'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            {fieldLocks.whAlreadyConfirmed && (
                              <div className="text-[10px] font-mono font-bold text-teal-800">
                                {isAr ? 'مستلم مخزن:' : 'WH Actual:'} <strong>{fmtCtn(cell.whReceivedClientReturns ?? 0)}</strong>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditWhFields}
                              value={cell.whReceivedClientReturns ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'whReceivedClientReturns', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditWhFields
                                  ? 'bg-white border-teal-400'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            <div className="text-[10px] font-mono text-indigo-700 font-bold">
                              {isAr ? 'متوقع:' : 'Exp:'} {fmtCtn(cell.expectedClientReturns ?? 0)}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono font-black text-indigo-950">
                    <div>{fmtCtn(actorMode === 'accountant' ? sumField('expectedClientReturns') : sumField('whReceivedClientReturns'))}</div>
                    {actorMode === 'accountant' && fieldLocks.whAlreadyConfirmed && (
                      <div className="text-[10px] text-teal-700">{isAr ? 'مخزن:' : 'WH:'} {fmtCtn(sumField('whReceivedClientReturns'))}</div>
                    )}
                  </td>
                </tr>
              </tbody>

              {/* FOOTER TOTALS + LIVE VARIANCE COMPARISON */}
              <tfoot className="border-t-2 border-slate-300">
                <tr className="bg-slate-100 font-bold text-slate-700">
                  <td className="py-2 px-3 sticky start-0 bg-slate-100 border-e border-slate-200 z-10">
                    {isAr ? 'إجمالي المرتجع المتوقع (أوامر البيع / المحاسب)' : 'Total Expected Return (Orders / Accountant)'}
                  </td>
                  {columns.map((col) => (
                    <td key={col.colKey} className="py-2 px-2.5 text-center font-mono border-e border-slate-200">
                      {fmtCtn(returnByCol[col.colKey]?.accountantExpectedTotal || 0)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-center font-mono font-black text-slate-900">
                    {fmtCtn(evalRes.totalExpected)}
                  </td>
                </tr>

                <tr className="bg-slate-900 text-white font-black">
                  <td className="py-2.5 px-3 sticky start-0 bg-slate-900 border-e border-slate-700 z-10">
                    {isAr ? 'إجمالي المستلم الفعلي (المخزن) والفرق (Δ)' : 'Total WH Received & Variance (Δ)'}
                  </td>
                  {columns.map((col) => {
                    const cell = returnByCol[col.colKey] || {};
                    const v = Number(cell.variance || 0);
                    return (
                      <td key={col.colKey} className="py-2.5 px-2.5 text-center font-mono border-e border-slate-800">
                        <div className="text-emerald-300">{fmtCtn(cell.whReceivedTotal || 0)}</div>
                        <div className={`text-[10px] ${Math.abs(v) > 1e-4 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {Math.abs(v) > 1e-4 ? `${v > 0 ? '+' : ''}${v}` : '0 ✓'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono">
                    <div className="text-sm text-emerald-300">{fmtCtn(evalRes.totalReceived)}</div>
                    <div className={`text-[10px] ${evalRes.hasVariance ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {evalRes.hasVariance ? `Δ ${evalRes.totalVariance > 0 ? '+' : ''}${evalRes.totalVariance}` : (isAr ? 'مطابق 100%' : 'Exact Match ✓')}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Inline Order Settlement Confirmation Strip */}
          {inlineSettlementFeedback && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-xs text-emerald-950 font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{inlineSettlementFeedback}</span>
            </div>
          )}

          {/* Discrepancy Alert Strip */}
          {(evalRes.hasVariance || (actorMode === 'accountant' && evalRes.hasOrderMismatch)) && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                {actorMode === 'warehouse'
                  ? (isAr
                      ? 'توجد فروقات بين المستلم الفعلي والمتوقع — عند الحفظ سيتم تثبيت الكميات المستلمة وإرسال مهمة تسوية للمحاسبة.'
                      : 'Variance detected — saving will lock your actual received counts and assign a discrepancy settlement task to Accounting.')
                  : evalRes.hasOrderMismatch && !fieldLocks.whAlreadyConfirmed
                  ? (isAr
                      ? 'الكميات المتوقعة المسجلة لا تطابق أوامر البيع المرتبطة بالرحلة — يرجى تسوية أوامر البيع أو توجيه مهمة للمخولين قبل المطابقة النهائية.'
                      : 'Entered expected quantities diverge from linked Sales Orders — adjust orders or assign a settlement task.')
                  : (isAr
                      ? 'توجد فروقات عالقة مقابل استلام المخزن — لا يمكن إغلاق الرحلة إلا بعد تعديل أو إضافة أوامر بيع حتى يصبح الفرق = 0.'
                      : 'Pending variance against locked Warehouse receipt — adjust/create Sales Orders until variance = 0 to reconcile.')}
              </span>
            </div>
          )}

          {/* ACCOUNTANT DISCREPANCY SETTLEMENT WORKBENCH (Inline Sales Orders + Task Delegation) */}
          {actorMode === 'accountant' &&
            (evalRes.hasVariance || evalRes.hasOrderMismatch || Boolean(inlineSettlementFeedback)) &&
            !fieldLocks.isReconciled &&
            !fieldLocks.blockedBySelfApproval && (
              <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-indigo-700 shrink-0" />
                    <span className="text-xs font-black text-indigo-950">
                      {isAr
                        ? 'تسوية فروقات مرتجعات الرحلة (تعديل/إضافة أوامر البيع مباشرة أو توجيه مهام)'
                        : 'Trip Return Discrepancy Settlement Workbench (Inline Orders & Tasks)'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {columns.map((c) => {
                      const cell = returnByCol[c.colKey] || {};
                      const v = Number(cell.variance || 0);
                      const liveTot = Number(liveExpectedByCol[c.colKey]?.liveExpectedTotal || 0);
                      const acctTot = Number(cell.accountantExpectedTotal || 0);
                      const dispDelta = fieldLocks.whAlreadyConfirmed ? v : roundQty(acctTot - liveTot);
                      if (Math.abs(dispDelta) <= 1e-4) return null;
                      return (
                        <span
                          key={c.colKey}
                          className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-mono text-[10px] font-black"
                        >
                          {isAr ? c.shortNameAr : c.shortNameEn}: {dispDelta > 0 ? '+' : ''}{fmtCtn(dispDelta)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Section A: Inline Direct Order Adjustments & Launchers (when Accountant HAS Sales Orders perms) */}
                {returnAuthority.canAdjustOrCreateSalesOrders ? (
                  <div className="bg-white rounded-2xl border border-indigo-200 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-900">
                        {isAr
                          ? 'أ. تسوية مباشرة بأوامر البيع المرتبطة بالرحلة (داخل النافذة)'
                          : 'A. Inline Sales Order Adjustments & Creation'}
                      </span>
                      {returnAuthority.canCreateSalesOrder && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenInlineCreateOrder('supply', true)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAr ? 'إضافة أمر توريد (تسوية من الشاحنة)' : 'Add Inline Supply Order (Settlement)'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenInlineCreateOrder('return_deduct', false)}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAr ? 'إضافة أمر مرتجع للرحلة' : 'Add Inline Return Order'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {tripOrdersSummary.length > 0 && (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {tripOrdersSummary.map((o) => (
                          <div key={o.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50/50 hover:bg-slate-50">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="font-mono font-black text-slate-900">#{o.serial}</span>
                              <span className="font-bold text-slate-800 truncate max-w-[180px]">{o.clientName}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border ${ORDER_TYPE_META[o.orderType]?.cls || ''}`}>
                                {isAr ? ORDER_TYPE_META[o.orderType]?.ar : ORDER_TYPE_META[o.orderType]?.en}
                              </span>
                              {(o.settledFromTripExtras || o.isPostDispatchSettlementOrder) && (
                                <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-900 border border-teal-300 text-[9.5px] font-black">
                                  {isAr ? 'تسوية من الشاحنة' : 'Trip Settlement'}
                                </span>
                              )}
                              <span className="font-mono text-slate-600">
                                {isAr ? `مُسلَّم: ${fmtCtn(o.currentCartons)}` : `Delivered: ${fmtCtn(o.currentCartons)}`}
                                {o.returnedCartons > 0 ? ` (${isAr ? 'مرتجع' : 'Ret'}: ${fmtCtn(o.returnedCartons)})` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {o.isRetailRoute && returnAuthority.canSettleRetailOrders ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenInlineRetailOrder(o.id)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{isAr ? 'تسوية التجزئة' : 'Retail Settlement'}</span>
                                </button>
                              ) : (returnAuthority.canAdjustDispatchedQty || returnAuthority.canEditSalesOrder) ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenInlineEditOrder(o.id)}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-300 font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{isAr ? 'تعديل الكمية / مرتجع جزئي' : 'Adjust Order / Partial Return'}</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-950 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isAr
                        ? 'لا تملك صلاحية تعديل أو إنشاء أوامر البيع — يرجى توجيه مهمة تسوية (مع توضيح المطلوب في الملاحظات) للمستخدمين المخولين أدناه.'
                        : 'You do not have Sales Order edit/create permissions — assign a Settlement Task with notes to authorized users below.'}
                    </span>
                  </div>
                )}

                {/* Section B: Permission-Filtered Task Assignment Panel */}
                <div className="bg-white rounded-2xl border border-indigo-200 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTaskDelegation((v) => !v)}
                      className="text-xs font-black text-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        {returnAuthority.canAdjustOrCreateSalesOrders
                          ? (isAr ? 'ب. توجيه مهمة تسوية أوامر بيع لمستخدم آخر (اختياري)' : 'B. Assign Order-Settlement Task to Another User (Optional)')
                          : (isAr ? 'توجيه مهمة تسوية أوامر بيع للمستخدمين المخولين *' : 'Assign Sales Order Settlement Task *')}
                      </span>
                    </button>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono text-[10px] font-black">
                      {isAr ? `${eligibleOrderSettlers.length} مخول` : `${eligibleOrderSettlers.length} eligible`}
                    </span>
                  </div>

                  {(showTaskDelegation || !returnAuthority.canAdjustOrCreateSalesOrders) && (
                    <div className="space-y-2.5 pt-1 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTaskTargetMode('all_eligible')}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition cursor-pointer ${
                            taskTargetMode === 'all_eligible'
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        >
                          {isAr
                            ? `كل المؤهلين لتعديل/إنشاء أوامر البيع (${eligibleOrderSettlers.length})`
                            : `All Eligible Users (${eligibleOrderSettlers.length})`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskTargetMode('selected')}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition cursor-pointer ${
                            taskTargetMode === 'selected'
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        >
                          {isAr ? 'تحديد مستخدمين محددين' : 'Pick Specific Users'}
                        </button>
                      </div>

                      {taskTargetMode === 'selected' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200">
                          {eligibleOrderSettlers.length === 0 ? (
                            <span className="text-[11px] text-slate-500 col-span-2">
                              {isAr ? 'لا يوجد مستخدمون نشطون بصلاحيات تعديل أوامر البيع غيرك.' : 'No other active users hold Sales Order edit/create permissions.'}
                            </span>
                          ) : (
                            eligibleOrderSettlers.map((u) => {
                              const checked = selectedSettlerIds.includes(u.id);
                              return (
                                <label
                                  key={u.id}
                                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
                                    checked ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleToggleSettler(u.id)}
                                      className="accent-indigo-600"
                                    />
                                    <span className="font-bold text-slate-900 truncate">{isAr ? u.nameAr : u.name}</span>
                                  </span>
                                  <span className="flex items-center gap-1 shrink-0 text-[9px] font-extrabold">
                                    {u.capabilities.canCreate && <span className="px-1 rounded bg-emerald-100 text-emerald-800">{isAr ? 'إنشاء' : 'Add'}</span>}
                                    {u.capabilities.canEdit && <span className="px-1 rounded bg-sky-100 text-sky-800">{isAr ? 'تعديل' : 'Edit'}</span>}
                                    {u.capabilities.canAdjust && <span className="px-1 rounded bg-amber-100 text-amber-800">{isAr ? 'مرتجع' : 'Adj'}</span>}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-black text-slate-700">
                            {isAr
                              ? 'ملاحظات وتعليمات تسوية كميات أوامر البيع لهذه الرحلة *'
                              : 'Settlement Notes & Required Order Adjustments *'}
                          </label>
                          <button
                            type="button"
                            onClick={handleAutoFillTaskNotes}
                            className="text-[10.5px] font-black text-indigo-700 hover:underline cursor-pointer"
                          >
                            {isAr ? 'تعبئة تلقائية بالفروقات' : 'Auto-fill SKU Delta'}
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={taskNotes}
                          onChange={(e) => setTaskNotes(e.target.value)}
                          placeholder={
                            isAr
                              ? 'اكتب تفاصيل الطلبات المطلوب تعديلها أو أوامر التوريد/المرتجع المطلوب إضافتها لإغلاق فرق الرحلة...'
                              : 'Describe which orders need adjustment or which supply/return orders must be added to settle this trip...'
                          }
                          className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-indigo-600"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-emerald-700">{taskSentMsg}</span>
                        <button
                          type="button"
                          disabled={isSendingTask}
                          onClick={handleAssignSettlementTask}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isSendingTask ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال مهمة تسوية أوامر البيع' : 'Assign Settlement Task')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Settlement Tasks Log */}
                  {existingSettlementTasks.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10.5px] font-black text-slate-500">
                        {isAr ? `سجل مهام تسوية هذه الرحلة (${existingSettlementTasks.length})` : `Trip Settlement Tasks Log (${existingSettlementTasks.length})`}
                      </div>
                      {existingSettlementTasks.map((tsk) => (
                        <div
                          key={tsk.id}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                            tsk.status === 'completed'
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-amber-50/75 border-amber-200 text-amber-950'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold">{tsk.notes}</div>
                            <div className="text-[10px] text-slate-600">
                              {isAr ? 'مرسلة من:' : 'By:'} {tsk.createdByName} •{' '}
                              {Array.isArray(tsk.targetUserNames) && tsk.targetUserNames.length > 0
                                ? tsk.targetUserNames.join('، ')
                                : (isAr ? 'كل المؤهلين' : 'All Eligible')}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                              tsk.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {tsk.status === 'completed'
                              ? (isAr ? `مكتملة (${tsk.completedByName || '✓'})` : `Done (${tsk.completedByName || '✓'})`)
                              : (isAr ? 'مفتوحة ⏳' : 'Open ⏳')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Warehouse Pre-Reconciliation Amendment Reason Box */}
          {actorMode === 'warehouse' && fieldLocks.requiresWhAmendReason && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 space-y-1.5">
              <label className="text-[11px] font-black text-amber-950 block">
                {isAr
                  ? 'سبب تعديل الكميات المستلمة فعلياً (مطلوب قبل إعادة التثبيت وإشعار المحاسبة) *'
                  : 'Reason for Amending Warehouse Received Quantities *'}
              </label>
              <input
                type="text"
                value={whAmendReason}
                onChange={(e) => setWhAmendReason(e.target.value)}
                placeholder={isAr ? 'مثال: خطأ عد أولي وتمت مراجعة كراتين العميل بالمخزن...' : 'e.g., Initial carton miscount corrected on recount...'}
                className="w-full text-xs font-bold bg-white border border-amber-300 rounded-xl px-3 py-1.5 outline-none focus:border-amber-600"
              />
            </div>
          )}

          {/* General Admin Reopen Panel when Reconciled */}
          {fieldLocks.canReopenReconciled && (
            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-300 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  <span>{isAr ? 'الرحلة مقفلة ومطابقة — صلاحية المدير العام لإعادة الفتح' : 'Trip Reconciled — General Admin Unlock'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAdminReopenOpen((v) => !v)}
                  className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة فتح للتعديل' : 'Reopen Return'}</span>
                </button>
              </div>
              {adminReopenOpen && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={adminReopenReason}
                    onChange={(e) => setAdminReopenReason(e.target.value)}
                    placeholder={isAr ? 'سبب إعادة الفتح المعتمد في سجل المراجعة *' : 'Audit reason for reopening *'}
                    className="flex-1 min-w-[220px] text-xs font-bold bg-white border border-amber-300 rounded-xl px-3 py-1.5 outline-none"
                  />
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleAdminReopenReconciled}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer"
                  >
                    {isAr ? 'تأكيد إعادة الفتح' : 'Confirm Reopen'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* General Admin Audited Variance Write-Off Panel */}
          {returnAuthority.canForceWriteOffVariance &&
            evalRes.hasVariance &&
            !fieldLocks.isReconciled && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-300 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>{isAr ? 'تسوية إدارية استثنائية للفروقات / عهدة سائق (مدير عام فقط)' : 'General Admin Audited Variance Write-Off'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdminWriteOffOpen((v) => !v)}
                    className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black cursor-pointer"
                  >
                    {adminWriteOffOpen ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'فتح خيار التسوية الإدارية' : 'Open Write-Off')}
                  </button>
                </div>
                {adminWriteOffOpen && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={adminWriteOffReason}
                      onChange={(e) => setAdminWriteOffReason(e.target.value)}
                      placeholder={isAr ? 'سبب اعتماد العجز/الزيادة أو رقم عهدة السائق (إلزامي) *' : 'Mandatory write-off / driver custody audit reason *'}
                      className="flex-1 min-w-[240px] text-xs font-bold bg-white border border-slate-300 rounded-xl px-3 py-1.5 outline-none"
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSubmitReturn('admin_writeoff')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-black cursor-pointer"
                    >
                      {isAr ? 'اعتماد وإقفال إداري نهائي' : 'Confirm Admin Write-Off'}
                    </button>
                  </div>
                )}
              </div>
            )}

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              {isAr
                ? 'ملاحظات استلام المرتجع والمطابقة والتالف:'
                : 'Return Receiving, Reconciliation & Faulty Comments:'}
            </label>
            <textarea
              rows={2}
              disabled={fieldLocks.isReconciled && !returnAuthority.isGeneralAdmin}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder={
                isAr
                  ? 'سبب الفروقات إن وجدت، تفاصيل استبدال التالف لدى العميل، حالة المرتجع المستلم...'
                  : 'Variance explanation, client faulty swap details, condition of returned cartons...'
              }
              className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-teal-600 resize-y min-h-[60px] disabled:bg-slate-100"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>

          {/* General Admin Dual Settlement Button */}
          {returnAuthority.canSettleBothSides && !fieldLocks.isReconciled && !evalRes.hasVariance && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmitReturn('admin_settle_both')}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>{isAr ? 'اعتماد وإقفال القسمين (مدير عام) ✓' : 'Settle Both Sides (Admin) ✓'}</span>
            </button>
          )}

          {/* Accountant Footer Action */}
          {actorMode === 'accountant' && fieldLocks.canSubmitAcctSide && (
            <>
              {fieldLocks.whAlreadyConfirmed ? (
                <button
                  type="button"
                  disabled={isSaving || evalRes.hasVariance}
                  title={
                    evalRes.hasVariance
                      ? (isAr ? 'يجب تسوية أوامر البيع أولاً حتى يصبح الفرق = 0' : 'Settle Sales Orders until variance = 0 first')
                      : (isAr ? 'تأكيد مطابقة الحسابات وإقفال الرحلة' : 'Confirm Accounting Alignment & Close')
                  }
                  onClick={() => handleSubmitReturn('accountant')}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {evalRes.hasVariance
                      ? (isAr ? 'تسوية الأوامر أولاً (الفرق ≠ 0)' : 'Settle Orders First (Δ ≠ 0)')
                      : (isAr ? 'تأكيد مطابقة الحسابات وإقفال الرحلة ✓' : 'Confirm Accounting Alignment & Close ✓')}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSubmitReturn('accountant')}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                    evalRes.hasOrderMismatch
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>
                    {evalRes.hasOrderMismatch
                      ? (isAr ? 'حفظ المتوقع (مع تنبيه فرق أوامر بيع)' : 'Save Expected (Flag Order Variance)')
                      : (isAr ? 'حفظ المتوقع وإخطار أمين المخزن' : 'Save Expected & Notify WH')}
                  </span>
                </button>
              )}
            </>
          )}

          {/* Warehouse Custodian Footer Action */}
          {actorMode === 'warehouse' && fieldLocks.canSubmitWhSide && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmitReturn('warehouse')}
              className={`px-5 py-2 rounded-xl text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                evalRes.hasVariance ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {evalRes.hasVariance
                  ? (isAr ? 'تثبيت المستلم وإرسال مهمة فرق للمحاسبة' : 'Lock Actual Receipt & Alert Accounting')
                  : fieldLocks.acctAlreadyConfirmed
                  ? (isAr ? 'تأكيد الاستلام المطابق وإقفال الرحلة ✓' : 'Confirm Matched Receipt & Close ✓')
                  : (isAr ? 'تثبيت الاستلام وإخطار المحاسبة للمطابقة ✓' : 'Lock Receipt & Request Acct Align ✓')}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>

      {/* Stacked Inline Sales Order Editor Modal (keeps Return Modal open!) */}
      {inlineEditorState && (
        <SalesOrderEditorModal
          isOpen={Boolean(inlineEditorState)}
          onClose={() => setInlineEditorState(null)}
          editingOrder={inlineEditorState.editingOrder}
          isAdminModal={false}
          prefillTripContext={inlineEditorState.prefillTripContext}
          onSaved={handleInlineOrderSaved}
          zIndexClass="z-[60]"
          canAdjustDispatchedQty={Boolean(returnAuthority.canAdjustDispatchedQty)}
          initialAdjustmentMode={Boolean(inlineEditorState.initialAdjustmentMode)}
          clients={clients}
          segments={segments}
          products={finishedProducts}
          productCategories={productCategories}
          priceLists={priceLists}
          strategies={strategies}
          vehicles={vehicles}
          allOrders={allOrders}
          stdRetailList={stdRetailList}
          canManageStdRetailList={false}
          isAr={isAr}
          currentUserName={
            isAr
              ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
              : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system')
          }
          currentUserId={currentUser?.id || 'system'}
        />
      )}

      {/* Stacked Inline Retail Route Settlement Modal */}
      {inlineRetailOrder && (
        <RetailSettlementModal
          isOpen={Boolean(inlineRetailOrder)}
          onClose={() => setInlineRetailOrder(null)}
          order={inlineRetailOrder}
          canSettleRetailOrders={Boolean(returnAuthority.canSettleRetailOrders)}
          allowDeferDelivery={false}
          skipDispatchSync={true}
          zIndexClass="z-[60]"
          vehicles={vehicles}
          resolveVehicleDisplayName={resolveVehicleDisplayNameModal}
          isAr={isAr}
          currentUserName={
            isAr
              ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
              : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system')
          }
          currentUserId={currentUser?.id || 'system'}
          onSuccess={({ payload }) => {
            if (payload) handleInlineOrderSaved(payload);
            setInlineRetailOrder(null);
          }}
        />
      )}
    </>
  );
}

