/**
 * Shared Pure Helpers for FG Warehouse Truck Dispatch & Return Receiving (`truck_dispatch`)
 * -----------------------------------------------------------------------------------------
 * Centralizes trip aggregation, Product/Packing × Client matrix building, worker effort
 * auto-equalization (100% split), and Warehouse <-> Accountant return reconciliation logic.
 */

import { formatDateStr, roundQty } from './fgStockEngine.js';

export const OUTBOUND_PHYSICAL_TYPES = new Set(['supply', 'replacement_old', 'exchange']);
export const RETURN_PHYSICAL_TYPES = new Set(['return_deduct', 'return_no_deduct']);
export const PHYSICAL_TRIP_ORDER_TYPES = new Set([
  'supply',
  'replacement_old',
  'exchange',
  'return_deduct',
  'return_no_deduct',
]);

export function makeTripDispatchDocId(loadingDate, loadingOrderNumber) {
  const cleanDate = formatDateStr(loadingDate) || 'unscheduled';
  const loNum = Number(loadingOrderNumber || 0);
  return `${cleanDate}_LO-${loNum}`;
}

export function normalizeTripOrderFulfillment(rawStatus) {
  const st = String(rawStatus || 'not_yet').trim().toLowerCase();
  if (st === 'preparing' || st === 'prepare') return 'prepare';
  if (st === 'out_for_delivery' || st === 'shipped') return 'shipped';
  if (st === 'delivered') return 'delivered';
  if (st === 'paid') return 'paid';
  return 'not_yet';
}

export function evaluateReturnDiscrepancySummary(dispatchDoc) {
  if (!dispatchDoc) {
    return {
      hasDiscrepancy: false,
      totalExpected: 0,
      totalReceived: 0,
      netVariance: 0,
      discrepantColCount: 0,
      status: 'none',
      isPendingAccountingAlign: false,
      isPendingWhConfirm: false,
      isReconciled: false,
      openSettlementTasks: [],
      hasOpenSettlementTask: false,
      isDeferredStockReturn: false,
    };
  }
  const status = dispatchDoc.returnHandshakeStatus || 'none';
  let totalExpected = 0;
  let totalReceived = 0;
  let discrepantColCount = 0;

  Object.values(dispatchDoc.returnByCol || {}).forEach((row) => {
    if (!row) return;
    const exp = roundQty(
      row.accountantExpectedTotal !== undefined
        ? Number(row.accountantExpectedTotal || 0)
        : Number(row.expectedExtras || 0) + Number(row.expectedClientReturns || 0)
    );
    const rec = roundQty(
      row.whReceivedTotal !== undefined
        ? Number(row.whReceivedTotal || 0)
        : Number(row.whReceivedExtras || 0) + Number(row.whReceivedClientReturns || 0)
    );
    totalExpected = roundQty(totalExpected + exp);
    totalReceived = roundQty(totalReceived + rec);
    if (Math.abs(rec - exp) > 0.001) {
      discrepantColCount += 1;
    }
  });

  const netVariance = roundQty(totalReceived - totalExpected);
  const hasDiscrepancy = status === 'discrepancy_pending_accounting' || discrepantColCount > 0;
  const openSettlementTasks = (Array.isArray(dispatchDoc.returnSettlementTasks)
    ? dispatchDoc.returnSettlementTasks
    : []
  ).filter((t) => t && t.status === 'open');
  const whConfDate = dispatchDoc.whReturnConfirmedAt
    ? String(dispatchDoc.whReturnConfirmedAt).slice(0, 10)
    : '';
  const isDeferredStockReturn = Boolean(
    (dispatchDoc.whReturnConfirmedAt || status === 'reconciled') &&
      dispatchDoc.stockReturnDate &&
      (!whConfDate || dispatchDoc.stockReturnDate > whConfDate)
  );

  return {
    hasDiscrepancy,
    totalExpected,
    totalReceived,
    netVariance,
    discrepantColCount,
    status,
    isPendingAccountingAlign: status === 'pending_accounting_confirm',
    isPendingWhConfirm: status === 'pending_wh_confirm',
    isReconciled: status === 'reconciled',
    openSettlementTasks,
    hasOpenSettlementTask: openSettlementTasks.length > 0,
    isDeferredStockReturn,
  };
}

export function resolveOrderTripDispatch(order, truckDispatchesOrMap) {
  if (!order || order.isSplitParent || order.confirmationStatus === 'canceled') return null;
  const loNum = Number(order.loadingOrderNumber || 0);
  if (!order.fgWarehouseDispatchId && loNum <= 0) return null;
  const tripId =
    order.fgWarehouseDispatchId ||
    makeTripDispatchDocId(order.loadingDate || order.invoiceDate, loNum);
  if (!tripId || !truckDispatchesOrMap) return null;
  if (Array.isArray(truckDispatchesOrMap)) {
    return truckDispatchesOrMap.find((d) => d && d.id === tripId) || null;
  }
  return truckDispatchesOrMap[tripId] || null;
}

/**
 * Resolves a product & its packaging option metadata cleanly from the catalog.
 */
export function resolveProductAndOption(products = [], rawProductIdOrCode, suffixHint, ratioHint) {
  const needle = String(rawProductIdOrCode || '').trim();
  const prod =
    (products || []).find(
      (p) => p.id === needle || p.code === needle || p.itemCode === needle
    ) || null;
  const code = String(prod?.code || prod?.id || needle || '').trim();
  const rawOpts =
    Array.isArray(prod?.packagingOptions) && prod.packagingOptions.length > 0
      ? prod.packagingOptions
      : [{ suffix: 'A', packagingRatio: Number(prod?.packagingRatio) || 1, isActive: true }];

  let resolvedOpt = rawOpts[0];
  let isAny = false;
  if (suffixHint) {
    const norm = String(suffixHint).trim().toUpperCase();
    if (norm === 'ANY') {
      if (rawOpts.length > 1) {
        isAny = true;
        resolvedOpt = {
          suffix: 'ANY',
          optionCode: `${code}-ANY`,
          nameAr: 'أي تعبئة (Any)',
          nameEn: 'Any Packing',
          packagingRatio: Number(prod?.packagingRatio || rawOpts[0]?.packagingRatio || 1),
          imageFile: prod?.imageFile || '',
        };
      }
    } else {
      const match = rawOpts.find(
        (o) =>
          String(o.suffix || '').trim().toUpperCase() === norm ||
          String(o.optionCode || `${code}-${o.suffix}`).trim().toUpperCase() === norm
      );
      if (match) resolvedOpt = match;
    }
  } else if (Number(ratioHint || 0) > 0) {
    const rMatch = rawOpts.find((o) => Number(o.packagingRatio) === Number(ratioHint));
    if (rMatch) resolvedOpt = rMatch;
  }

  const suffix = isAny ? 'ANY' : String(resolvedOpt?.suffix || 'A').trim().toUpperCase();
  const colKey = `${code}::${suffix}`;
  const optLabelAr = resolvedOpt?.nameAr || (isAny ? 'أي تعبئة' : `تعبئة ${suffix}`);
  const optLabelEn = resolvedOpt?.nameEn || (isAny ? 'Any Packing' : `Pack ${suffix}`);

  return {
    product: prod,
    productId: prod?.id || code,
    productCode: code,
    optionSuffix: suffix,
    optionCode: resolvedOpt?.optionCode || `${code}-${suffix}`,
    packagingRatio: Math.max(1, Number(resolvedOpt?.packagingRatio || prod?.packagingRatio || 1)),
    nameAr: prod ? `${prod.nameAr || prod.shortName || code}${rawOpts.length > 1 || isAny ? ` — ${optLabelAr}` : ''}` : code,
    nameEn: prod ? `${prod.nameEn || prod.nameAr || code}${rawOpts.length > 1 || isAny ? ` — ${optLabelEn}` : ''}` : code,
    shortNameAr: prod?.nameAr || prod?.shortName || code,
    shortNameEn: prod?.nameEn || prod?.nameAr || code,
    optionNameAr: optLabelAr,
    optionNameEn: optLabelEn,
    imageFile: resolvedOpt?.imageFile || prod?.imageFile || '',
    largeUnitName: prod?.largeUnitName || 'كرتونة',
    largeUnitWeightKg: Number(
      resolvedOpt?.largeUnitWeightKg || prod?.largeUnitWeightKg || prod?.grossWeightKg || prod?.weightKg || 0
    ),
  };
}

/**
 * Groups Loading Plan sales orders into actionable trips for the FG Warehouse Dispatch Tab.
 * - Sorted descending by loadingDate (most recent first), then ascending by LO #.
 * - Pending (`not_yet`) orders keep trip loading disabled until transitioned to `prepare`.
 */
export function buildTripsCatalog({
  orders = [],
  vehicles = [],
  truckDispatches = [],
  todayStr = new Date().toISOString().slice(0, 10),
} = {}) {
  const dispatchById = {};
  (truckDispatches || []).forEach((td) => {
    if (td && td.id) dispatchById[td.id] = td;
  });

  const tripGroups = {};

  (orders || []).forEach((order) => {
    if (!order || order.confirmationStatus === 'canceled' || order.isSplitParent) return;
    const orderType = order.orderType || 'supply';
    if (!PHYSICAL_TRIP_ORDER_TYPES.has(orderType)) return;

    const loNum = Number(order.loadingOrderNumber || 0);
    if (loNum <= 0) return;

    const loDate = formatDateStr(order.loadingDate || order.invoiceDate) || todayStr;
    const docId = makeTripDispatchDocId(loDate, loNum);

    if (!tripGroups[docId]) {
      tripGroups[docId] = {
        id: docId,
        tripKey: `${loDate}_#${loNum}`,
        loadingDate: loDate,
        loadingOrderNumber: loNum,
        orders: [],
        outboundOrders: [],
        returnOrders: [],
        vehicleIds: new Set(),
        driverIds: new Set(),
        primaryVehicleId: order.assignedVehicleId || '',
        primaryVehicleName: order.assignedVehicleName || '',
        primaryVehiclePlate: order.assignedVehiclePlate || '',
        primaryDriverId: order.assignedDriverId || '',
        primaryDriverName: order.assignedDriverName || '',
        primaryRepId: order.assignedDeliveryRepId || '',
        primaryRepName: order.assignedDeliveryRepName || '',
      };
    }

    const grp = tripGroups[docId];
    grp.orders.push(order);
    if (OUTBOUND_PHYSICAL_TYPES.has(orderType)) grp.outboundOrders.push(order);
    if (RETURN_PHYSICAL_TYPES.has(orderType)) grp.returnOrders.push(order);
    if (order.assignedVehicleId) grp.vehicleIds.add(order.assignedVehicleId);
    if (order.assignedDriverId) grp.driverIds.add(order.assignedDriverId);
  });

  const trips = Object.values(tripGroups).map((grp) => {
    const dispatchDoc = dispatchById[grp.id] || null;
    const veh = vehicles.find((v) => v.id === (dispatchDoc?.vehicleId || grp.primaryVehicleId)) || null;
    const resolvedPlate = (
      veh?.plateNumber ||
      dispatchDoc?.plateNumber ||
      grp.primaryVehiclePlate ||
      ''
    ).trim();
    const rawSavedVehName = String(dispatchDoc?.vehicleName || '').trim();
    const cleanSavedVehName = resolvedPlate && rawSavedVehName.endsWith(`(${resolvedPlate})`)
      ? rawSavedVehName.slice(0, -resolvedPlate.length - 2).trim()
      : rawSavedVehName;
    const vehicleDisplayName = (
      veh?.vehicleModel ||
      veh?.makeModel ||
      veh?.name ||
      veh?.nameAr ||
      veh?.nameEn ||
      cleanSavedVehName ||
      grp.primaryVehicleName ||
      veh?.code ||
      '—'
    ).trim();

    // Fulfillment statuses across the trip's orders (normalized for 100% cross-tab sync)
    const normalizedStatuses = grp.orders.map((o) => normalizeTripOrderFulfillment(o.fulfillmentStatus));
    const distinctStatuses = Array.from(new Set(normalizedStatuses));
    const hasMixedFulfillmentStatus = grp.orders.length > 1 && distinctStatuses.length > 1;
    const hasPendingOrders = normalizedStatuses.some((st) => st === 'not_yet');
    const allPrepareOrBeyond = grp.orders.length > 0 && !hasPendingOrders;
    const allDispatchedOut =
      grp.orders.length > 0 &&
      normalizedStatuses.every((st) => st === 'shipped' || st === 'delivered' || st === 'paid');
    const allDelivered =
      grp.orders.length > 0 &&
      normalizedStatuses.every((st) => st === 'delivered' || st === 'paid');
    const allPaid =
      grp.orders.length > 0 && normalizedStatuses.every((st) => st === 'paid');

    let tripFulfillmentStatus = 'not_yet';
    if (distinctStatuses.length === 1) {
      tripFulfillmentStatus = distinctStatuses[0];
    } else if (allDelivered) {
      tripFulfillmentStatus = 'delivered';
    } else if (allDispatchedOut) {
      tripFulfillmentStatus = 'shipped';
    } else if (allPrepareOrBeyond) {
      tripFulfillmentStatus = 'prepare';
    }

    const returnDiscrepancy = evaluateReturnDiscrepancySummary(dispatchDoc);

    const totalDeliveredCartons = roundQty(
      grp.outboundOrders.reduce(
        (s, o) => s + (o.lines || []).reduce((ls, l) => ls + Number(l.qty || 0) + Number(l.bonus || 0), 0),
        0
      )
    );
    const sumDispatchColLocked = roundQty(
      (dispatchDoc?.columns || []).reduce((s, c) => s + Number(c.lockedQty || 0), 0)
    );
    const sumOrderDispatchedBaseline = roundQty(
      grp.outboundOrders
        .filter((o) => !o.settledFromTripExtras && !o.isPostDispatchSettlementOrder)
        .reduce(
          (s, o) =>
            s +
            (o.lines || []).reduce(
              (ls, l) =>
                ls +
                Number(l.dispatchedQty !== undefined ? l.dispatchedQty : l.qty || 0) +
                Number(l.dispatchedBonus !== undefined ? l.dispatchedBonus : l.bonus || 0),
              0
            ),
          0
        )
    );
    const totalLockedCartons =
      allDispatchedOut && sumDispatchColLocked > 0
        ? sumDispatchColLocked
        : sumOrderDispatchedBaseline;
    const hasDeliverySettlementDiff = Boolean(
      allDispatchedOut && Math.abs(totalDeliveredCartons - totalLockedCartons) > 1e-4
    );
    const totalExtrasCartons = roundQty(
      (dispatchDoc?.columns || []).reduce((s, c) => s + Number(c.extraQty || 0), 0)
    );
    const totalWeightKg = roundQty(grp.orders.reduce((s, o) => s + Number(o.totalWeightKg || 0), 0));

    // Only consider active post-dispatch client returns / commercial returns / undelivered returns once trip is dispatched
    const hasUndeliveredReturns = Array.isArray(dispatchDoc?.undeliveredOrders) && dispatchDoc.undeliveredOrders.length > 0;
    const hasExplicitClientReturns =
      allDispatchedOut &&
      (grp.returnOrders.length > 0 ||
        hasUndeliveredReturns ||
        grp.orders.some((o) => o.hasPartialRejection || Number(o.returnedCartons || 0) > 0 || o.retailSettlementStatus === 'settled'));

    const returnHandshakeStatus = allDispatchedOut ? (dispatchDoc?.returnHandshakeStatus || 'none') : 'none';

    // Gate state machine for card styling & action locking
    let tripStage = 'pending'; // 'pending' | 'ready_to_load' | 'loaded_pending_docs' | 'dispatched' | 'delivered' | 'reconciled'
    if (allDispatchedOut && returnHandshakeStatus === 'reconciled') {
      tripStage = 'reconciled';
    } else if (allDelivered) {
      tripStage = 'delivered';
    } else if (allDispatchedOut) {
      tripStage = 'dispatched';
    } else if (dispatchDoc?.dispatchStatus === 'loaded') {
      tripStage = 'loaded_pending_docs';
    } else if (allPrepareOrBeyond) {
      tripStage = 'ready_to_load';
    } else {
      tripStage = 'pending';
    }

    const totalExpectedReturnUnits = allDispatchedOut
      ? Object.values(dispatchDoc?.returnByCol || {}).reduce((s, r) => s + Number(r.accountantExpectedTotal || 0), 0)
      : 0;

    return {
      ...grp,
      vehicleObj: veh,
      vehicleDisplayName,
      plateNumber: resolvedPlate,
      dispatchDoc,
      isWarehouseConfirmed: Boolean(dispatchDoc && dispatchDoc.dispatchStatus !== 'cancelled'),
      hasPendingOrders,
      isLoadingUnlocked: allPrepareOrBeyond,
      allDispatchedOut,
      allDelivered,
      allPaid,
      tripFulfillmentStatus,
      hasMixedFulfillmentStatus,
      returnDiscrepancy,
      tripStage,
      totalLockedCartons,
      totalExtrasCartons,
      totalDispatchedCartons: roundQty(totalLockedCartons + totalExtrasCartons),
      totalDeliveredCartons,
      hasDeliverySettlementDiff,
      totalWeightKg,
      hasExplicitClientReturns,
      returnHandshakeStatus,
      // Strictly unlock Return / Receiving ONLY once trip reaches dispatched (`shipped` / `delivered` / `paid`)
      needsReturnInspection: allDispatchedOut,
      hasPendingReturnAction:
        allDispatchedOut &&
        (returnHandshakeStatus === 'pending_wh_confirm' ||
          returnHandshakeStatus === 'pending_accounting_confirm' ||
          returnHandshakeStatus === 'discrepancy_pending_accounting' ||
          (allDelivered && totalExtrasCartons > 0 && returnHandshakeStatus !== 'reconciled') ||
          (totalExpectedReturnUnits > 0 && returnHandshakeStatus !== 'reconciled')),
    };
  });

  // Sort strictly descending: Most recent dates on top, then higher Trip # on top (newest trips first)
  trips.sort((a, b) => {
    if (a.loadingDate !== b.loadingDate) {
      return String(b.loadingDate).localeCompare(String(a.loadingDate));
    }
    return b.loadingOrderNumber - a.loadingOrderNumber;
  });

  return trips;
}

/**
 * Builds the Client (Rows) × Product/Packing-Option (Columns) Dispatch Matrix.
 */
export function buildTripDispatchMatrix({
  tripOrders = [],
  finishedProducts = [],
  existingDispatch = null,
} = {}) {
  const outboundOrders = (tripOrders || []).filter((o) =>
    OUTBOUND_PHYSICAL_TYPES.has(o.orderType || 'supply')
  );
  const colMap = {};

  const ensureColumn = (meta) => {
    const colKey = `${meta.productCode}::${meta.optionSuffix}`;
    if (!colMap[colKey]) {
      colMap[colKey] = {
        colKey,
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
        largeUnitWeightKg: meta.largeUnitWeightKg || 0,
        lockedQty: 0,
        extraQty: 0,
      };
    }
    return colMap[colKey];
  };

  // Seed existing custom extra columns if dispatch doc already has them
  (existingDispatch?.columns || []).forEach((savedCol) => {
    const meta = resolveProductAndOption(
      finishedProducts,
      savedCol.productCode || savedCol.productId,
      savedCol.optionSuffix,
      savedCol.packagingRatio
    );
    const col = ensureColumn(meta);
    col.extraQty = roundQty(Number(savedCol.extraQty || 0));
  });

  // Build Client Rows from current trip orders
  const clientRows = outboundOrders.map((order) => {
    const quantitiesByCol = {};
    let rowTotal = 0;

    (order.lines || []).forEach((line) => {
      const qtyCtn = roundQty(Number(line.qty || 0) + Number(line.bonus || 0));
      if (qtyCtn <= 0) return;
      const meta = resolveProductAndOption(
        finishedProducts,
        line.productId || line.finishedProductId || line.productCode || line.code,
        line.packagingOptionSuffix || line.optionSuffix,
        line.packagingRatio
      );
      const col = ensureColumn(meta);
      quantitiesByCol[col.colKey] = roundQty((quantitiesByCol[col.colKey] || 0) + qtyCtn);
      col.lockedQty = roundQty(col.lockedQty + qtyCtn);
      rowTotal = roundQty(rowTotal + qtyCtn);
    });

    return {
      orderId: order.id,
      serial: order.serial || String(order.id || '').replace(/^SO-/, ''),
      clientId: order.clientId || '',
      clientName: order.clientName || order.clientNameAr || '—',
      orderType: order.orderType || 'supply',
      fulfillmentStatus: order.fulfillmentStatus || 'not_yet',
      quantitiesByCol,
      rowTotal,
    };
  });

  const columns = Object.values(colMap).sort((a, b) => a.colKey.localeCompare(b.colKey));
  return { columns, clientRows };
}

/**
 * Auto-equalizes effort percentages across all workers in a task so they sum cleanly to 100%.
 */
export function autoEqualizeWorkerEfforts(workersList = []) {
  if (!Array.isArray(workersList) || workersList.length === 0) return [];
  const n = workersList.length;
  const baseShare = Math.floor((10000 / n)) / 100;
  const remainder = Math.round((100 - baseShare * n) * 100) / 100;

  return workersList.map((w, idx) => ({
    ...w,
    effortPct: idx === 0 ? Math.round((baseShare + remainder) * 100) / 100 : baseShare,
  }));
}

export function sumWorkerEffortPct(workersList = []) {
  if (!Array.isArray(workersList) || workersList.length === 0) {
    return { total: 0, isBalanced: true };
  }
  const total = Math.round(
    workersList.reduce((s, w) => s + (Number(w.effortPct) || 0), 0) * 100
  ) / 100;
  return {
    total,
    isBalanced: Math.abs(total - 100) <= 0.05,
  };
}

/**
 * Builds the Return / Receiving Matrix across Trip Extras & Client Returns (by Sales Order Type).
 */
export function buildReturnInspectionMatrix({
  tripOrders = [],
  finishedProducts = [],
  dispatchDoc = null,
} = {}) {
  const colMap = {};

  const ensureCol = (meta) => {
    const colKey = `${meta.productCode}::${meta.optionSuffix}`;
    if (!colMap[colKey]) {
      colMap[colKey] = {
        colKey,
        productCode: meta.productCode,
        optionSuffix: meta.optionSuffix,
        optionCode: meta.optionCode,
        nameAr: meta.nameAr,
        nameEn: meta.nameEn,
        shortNameAr: meta.shortNameAr,
        shortNameEn: meta.shortNameEn,
        optionNameAr: meta.optionNameAr,
        optionNameEn: meta.optionNameEn,
        imageFile: meta.imageFile,
        packagingRatio: meta.packagingRatio,
        dispatchedExtrasQty: 0,
      };
    }
    return colMap[colKey];
  };

  (dispatchDoc?.columns || []).forEach((col) => {
    const meta = resolveProductAndOption(
      finishedProducts,
      col.productCode || col.productId,
      col.optionSuffix,
      col.packagingRatio
    );
    const entry = ensureCol(meta);
    entry.dispatchedExtrasQty = roundQty(Number(col.extraQty || 0));
  });

  // Collect post-dispatch reallocated / settled supply orders on this trip
  // (conservation of mass: supplies sold off the truck absorb extras first, then any client returns/rejections)
  const didTruckShipOut = Boolean(
    dispatchDoc?.hasShippedOut ||
      dispatchDoc?.shippedAt ||
      dispatchDoc?.whReturnConfirmedAt ||
      (tripOrders || []).some((o) =>
        ['shipped', 'delivered', 'paid'].includes(normalizeTripOrderFulfillment(o?.fulfillmentStatus))
      )
  );
  const savedOrderIdSet = new Set(Array.isArray(dispatchDoc?.orderIds) ? dispatchDoc.orderIds : []);
  const reallocatedSupplyByCol = {};
  const tripOrdersSummary = [];

  (tripOrders || []).forEach((order) => {
    if (!order || order.confirmationStatus === 'canceled' || order.isSplitParent) return;
    const orderType = order.orderType || 'supply';
    const isCommercialReturn = RETURN_PHYSICAL_TYPES.has(orderType);

    let dispatchedCartons = 0;
    let currentCartons = 0;
    let returnedCartons = 0;

    const isPostDispatchAddedSupply =
      orderType === 'supply' &&
      (order.settledFromTripExtras === true ||
        order.isPostDispatchSettlementOrder === true ||
        (didTruckShipOut && savedOrderIdSet.size > 0 && !savedOrderIdSet.has(order.id)));

    (order.lines || []).forEach((line) => {
      const qtyCtn = roundQty(Number(line.qty || 0) + Number(line.bonus || 0));
      const origCtn = isCommercialReturn
        ? qtyCtn
        : roundQty(
            Number(line.dispatchedQty ?? line.qty ?? 0) +
              Number(line.dispatchedBonus ?? line.bonus ?? 0)
          );
      const retCtn = isCommercialReturn
        ? qtyCtn
        : line.returnedCartons !== undefined
        ? roundQty(Number(line.returnedCartons))
        : (order.hasPartialRejection || order.retailSettlementStatus === 'settled')
        ? roundQty(Math.max(0, origCtn - qtyCtn))
        : 0;

      dispatchedCartons = roundQty(dispatchedCartons + origCtn);
      currentCartons = roundQty(currentCartons + qtyCtn);
      returnedCartons = roundQty(returnedCartons + retCtn);

      if (isPostDispatchAddedSupply && qtyCtn > 0) {
        const meta = resolveProductAndOption(
          finishedProducts,
          line.productId || line.finishedProductId || line.productCode || line.code,
          line.packagingOptionSuffix || line.optionSuffix,
          line.packagingRatio
        );
        const col = ensureCol(meta);
        reallocatedSupplyByCol[col.colKey] = roundQty((reallocatedSupplyByCol[col.colKey] || 0) + qtyCtn);
      }
    });

    tripOrdersSummary.push({
      id: order.id,
      serial: order.serial || String(order.id || '').replace(/^SO-/, ''),
      clientName: order.clientName || order.clientNameAr || '—',
      orderType,
      fulfillmentStatus: order.fulfillmentStatus || 'not_yet',
      isRetailRoute: Boolean(
        order.isRetailRouteOrder ||
          order.isRetailRouteOverride ||
          order.retailSettlementStatus === 'settled' ||
          order.retailSettlementStatus === 'awaiting_settlement'
      ),
      retailSettlementStatus: order.retailSettlementStatus || '',
      hasPartialRejection: Boolean(order.hasPartialRejection),
      settledFromTripExtras: Boolean(order.settledFromTripExtras),
      isPostDispatchSettlementOrder: Boolean(order.isPostDispatchSettlementOrder || isPostDispatchAddedSupply),
      dispatchedCartons,
      currentCartons,
      returnedCartons,
    });
  });

  // Collect Client Return rows by Sales Order Type (`return_deduct`, `return_no_deduct`, partial rejection, retail unsold)
  const clientReturnRows = [];

  (tripOrders || []).forEach((order) => {
    if (!order || order.confirmationStatus === 'canceled' || order.isSplitParent) return;
    const orderType = order.orderType || 'supply';
    const isCommercialReturn = RETURN_PHYSICAL_TYPES.has(orderType);
    const hasPostDispatchReturn =
      OUTBOUND_PHYSICAL_TYPES.has(orderType) &&
      (Boolean(order.hasPartialRejection) || Number(order.returnedCartons || 0) > 0 || order.retailSettlementStatus === 'settled');

    if (!isCommercialReturn && !hasPostDispatchReturn) return;

    const quantitiesByCol = {};
    let rowTotal = 0;

    (order.lines || []).forEach((line) => {
      const qtyCtn = isCommercialReturn
        ? roundQty(Number(line.qty || 0) + Number(line.bonus || 0))
        : roundQty(
            line.returnedCartons !== undefined
              ? Number(line.returnedCartons)
              : Math.max(
                  0,
                  Number(line.dispatchedQty ?? line.qty ?? 0) +
                    Number(line.dispatchedBonus ?? line.bonus ?? 0) -
                    (Number(line.qty || 0) + Number(line.bonus || 0))
                )
          );
      if (qtyCtn <= 0) return;
      const meta = resolveProductAndOption(
        finishedProducts,
        line.productId || line.finishedProductId || line.productCode || line.code,
        line.packagingOptionSuffix || line.optionSuffix,
        line.packagingRatio
      );
      const col = ensureCol(meta);
      quantitiesByCol[col.colKey] = roundQty((quantitiesByCol[col.colKey] || 0) + qtyCtn);
      rowTotal = roundQty(rowTotal + qtyCtn);
    });

    if (rowTotal > 0 || isCommercialReturn) {
      clientReturnRows.push({
        orderId: order.id,
        serial: order.serial || String(order.id || '').replace(/^SO-/, ''),
        clientName: order.clientName || order.clientNameAr || '—',
        orderType,
        isCommercialReturn,
        isPartialRejection: Boolean(order.hasPartialRejection),
        isRetailUnsold: order.retailSettlementStatus === 'settled',
        isUndeliveredReturn: false,
        quantitiesByCol,
        rowTotal,
      });
    }
  });

  // Also include full undelivered orders from a shipped truck (failed delivery -> returned to warehouse on the truck)
  const seenReturnOrderIds = new Set(clientReturnRows.map((r) => r.orderId));
  (Array.isArray(dispatchDoc?.undeliveredOrders) ? dispatchDoc.undeliveredOrders : []).forEach((uOrder) => {
    if (!uOrder || !uOrder.orderId || seenReturnOrderIds.has(uOrder.orderId)) return;
    const quantitiesByCol = {};
    let rowTotal = 0;

    (uOrder.lines || []).forEach((line) => {
      const qtyCtn = roundQty(Number(line.qty || 0) + Number(line.bonus || 0));
      if (qtyCtn <= 0) return;
      const meta = resolveProductAndOption(
        finishedProducts,
        line.productId || line.finishedProductId || line.productCode || line.code,
        line.packagingOptionSuffix || line.optionSuffix,
        line.packagingRatio
      );
      const col = ensureCol(meta);
      quantitiesByCol[col.colKey] = roundQty((quantitiesByCol[col.colKey] || 0) + qtyCtn);
      rowTotal = roundQty(rowTotal + qtyCtn);
    });

    if (rowTotal > 0) {
      seenReturnOrderIds.add(uOrder.orderId);
      clientReturnRows.push({
        orderId: uOrder.orderId,
        serial: uOrder.serial || String(uOrder.orderId || '').replace(/^SO-/, ''),
        clientName: uOrder.clientName || '—',
        orderType: uOrder.orderType || 'supply',
        isCommercialReturn: false,
        isPartialRejection: false,
        isRetailUnsold: false,
        isUndeliveredReturn: true,
        quantitiesByCol,
        rowTotal,
      });
    }
  });

  const columns = Object.values(colMap).sort((a, b) => a.colKey.localeCompare(b.colKey));

  // Build unified initial per-column reconciliation state merging saved doc + live orders
  const whAlreadyConfirmed = Boolean(dispatchDoc?.whReturnConfirmedAt);
  const liveExpectedByCol = {};
  const initialReturnByCol = {};

  columns.forEach((col) => {
    const saved = dispatchDoc?.returnByCol?.[col.colKey];
    const reallocatedSold = roundQty(reallocatedSupplyByCol[col.colKey] || 0);
    const usedFromExtras = roundQty(Math.min(col.dispatchedExtrasQty, reallocatedSold));
    const liveExpectedExtras = roundQty(Math.max(0, col.dispatchedExtrasQty - usedFromExtras));
    const overflowFromClientReturns = roundQty(Math.max(0, reallocatedSold - usedFromExtras));
    const rawClientReturns = roundQty(
      clientReturnRows.reduce((s, r) => s + Number(r.quantitiesByCol[col.colKey] || 0), 0)
    );
    const liveExpectedClientReturns = roundQty(Math.max(0, rawClientReturns - overflowFromClientReturns));
    const liveExpectedTotal = roundQty(liveExpectedExtras + liveExpectedClientReturns);

    liveExpectedByCol[col.colKey] = {
      liveExpectedExtras,
      liveExpectedClientReturns,
      liveExpectedTotal,
      settledExtrasSold: usedFromExtras,
      reallocatedSupplyTotal: reallocatedSold,
    };

    // Once WH has locked actual receipt, Expected is always live-derived from Sales Orders so Accounting resolves via real orders
    const expectedExtras = whAlreadyConfirmed
      ? liveExpectedExtras
      : saved?.expectedExtras !== undefined && dispatchDoc?.accountantReturnSubmittedAt
      ? roundQty(saved.expectedExtras)
      : liveExpectedExtras;
    const expectedClientReturns = whAlreadyConfirmed
      ? liveExpectedClientReturns
      : saved?.expectedClientReturns !== undefined && dispatchDoc?.accountantReturnSubmittedAt
      ? roundQty(saved.expectedClientReturns)
      : liveExpectedClientReturns;

    const whReceivedExtras =
      saved?.whReceivedExtras !== undefined ? roundQty(saved.whReceivedExtras) : expectedExtras;
    const whReceivedClientReturns =
      saved?.whReceivedClientReturns !== undefined
        ? roundQty(saved.whReceivedClientReturns)
        : expectedClientReturns;

    const acctTotal = roundQty(expectedExtras + expectedClientReturns);
    const whTotal = roundQty(whReceivedExtras + whReceivedClientReturns);

    initialReturnByCol[col.colKey] = {
      expectedExtras,
      expectedClientReturns,
      whReceivedExtras,
      whReceivedClientReturns,
      faultySwappedExtras: roundQty(saved?.faultySwappedExtras || 0),
      shortageExtras: roundQty(saved?.shortageExtras || 0),
      accountantExpectedTotal: acctTotal,
      whReceivedTotal: whTotal,
      variance: roundQty(whTotal - acctTotal),
    };
  });

  return {
    columns,
    clientReturnRows,
    initialReturnByCol,
    liveExpectedByCol,
    tripOrdersSummary,
  };
}

/**
 * Evaluates Warehouse <-> Accountant handshake status and exact per-column discrepancies.
 * Enforces mandatory two-party confirmation (WH + Accounting) even on 0 variance,
 * and allows blind reconciliation / write-off strictly for General Admin.
 */
export function evaluateReturnHandshake({
  returnByCol = {},
  liveExpectedByCol = null,
  actorRole = 'warehouse',
  alreadyWhConfirmed = false,
  alreadyAcctConfirmed = false,
  isGeneralAdmin = false,
} = {}) {
  let totalExpected = 0;
  let totalReceived = 0;
  const discrepancies = [];
  const orderMismatchDiscrepancies = [];
  const normalizedByCol = {};

  Object.entries(returnByCol || {}).forEach(([colKey, row]) => {
    const expExt = roundQty(Number(row.expectedExtras || 0));
    const expCli = roundQty(Number(row.expectedClientReturns || 0));
    const recExt = roundQty(Number(row.whReceivedExtras || 0));
    const recCli = roundQty(Number(row.whReceivedClientReturns || 0));

    const acctTot = roundQty(expExt + expCli);
    const whTot = roundQty(recExt + recCli);
    const diff = roundQty(whTot - acctTot);

    totalExpected = roundQty(totalExpected + acctTot);
    totalReceived = roundQty(totalReceived + whTot);

    normalizedByCol[colKey] = {
      expectedExtras: expExt,
      expectedClientReturns: expCli,
      whReceivedExtras: recExt,
      whReceivedClientReturns: recCli,
      faultySwappedExtras: roundQty(Number(row.faultySwappedExtras || 0)),
      shortageExtras: roundQty(Number(row.shortageExtras || 0)),
      accountantExpectedTotal: acctTot,
      whReceivedTotal: whTot,
      variance: diff,
    };

    if (Math.abs(diff) > 1e-4) {
      discrepancies.push({
        colKey,
        expected: acctTot,
        received: whTot,
        variance: diff,
      });
    }

    if (liveExpectedByCol && liveExpectedByCol[colKey]) {
      const liveTot = roundQty(Number(liveExpectedByCol[colKey].liveExpectedTotal || 0));
      if (Math.abs(acctTot - liveTot) > 1e-4) {
        orderMismatchDiscrepancies.push({
          colKey,
          enteredExpected: acctTot,
          liveOrderExpected: liveTot,
          delta: roundQty(acctTot - liveTot),
        });
      }
    }
  });

  const totalVariance = roundQty(totalReceived - totalExpected);
  const hasVariance = discrepancies.length > 0;
  const hasOrderMismatch = orderMismatchDiscrepancies.length > 0;

  let nextStatus = 'pending_accounting_confirm';
  if (actorRole === 'admin_settle_both') {
    if (isGeneralAdmin) {
      nextStatus = hasVariance ? 'discrepancy_pending_accounting' : 'reconciled';
    } else {
      nextStatus = hasVariance ? 'discrepancy_pending_accounting' : 'pending_accounting_confirm';
    }
  } else if (actorRole === 'admin_writeoff' || actorRole === 'accountant_accept_variance') {
    // Only General Admin may force-close / write off an unresolved return discrepancy
    nextStatus = isGeneralAdmin ? 'reconciled' : 'discrepancy_pending_accounting';
  } else if (actorRole === 'accountant') {
    if (alreadyWhConfirmed) {
      nextStatus = !hasVariance ? 'reconciled' : 'discrepancy_pending_accounting';
    } else {
      // Accountant submitting first: if manual expected diverges from linked Sales Orders, flag discrepancy requiring order settlement
      nextStatus = hasOrderMismatch ? 'discrepancy_pending_accounting' : 'pending_wh_confirm';
    }
  } else {
    // 'warehouse' submitting physical received quantities
    if (hasVariance) {
      nextStatus = 'discrepancy_pending_accounting';
    } else if (alreadyAcctConfirmed) {
      nextStatus = 'reconciled';
    } else {
      // Strict Two-Party Rule: even at 0 variance, wait for explicit Accounting alignment confirmation
      nextStatus = 'pending_accounting_confirm';
    }
  }

  return {
    nextStatus,
    totalExpected,
    totalReceived,
    totalVariance,
    hasVariance,
    discrepancies,
    hasOrderMismatch,
    orderMismatchDiscrepancies,
    normalizedByCol,
  };
}

/**
 * Smart 3-state print detector for Dispatch / Return slips:
 * - 'not_printed'    : never printed yet
 * - 'printed_stale'  : edited/updated after the most recent print timestamp
 * - 'printed_current': printed and still up-to-date with latest document revision
 */
export function getDocPrintStatus(printedAt, contentUpdatedAt) {
  if (!printedAt) return 'not_printed';
  const pMs = Date.parse(printedAt) || 0;
  const uMs = contentUpdatedAt ? (Date.parse(contentUpdatedAt) || 0) : 0;
  if (pMs <= 0) return 'not_printed';
  if (uMs > pMs) return 'printed_stale';
  return 'printed_current';
}

/**
 * Detects any operational Loading Plan / Sales Order changes made AFTER a trip was
 * confirmed by the warehouse (orders added/removed, locked product quantities changed,
 * truck/driver/delivery rep changed, or delivery sequence changed).
 */
export function detectPostDispatchPlanChanges({ trip, finishedProducts = [] } = {}) {
  const dispatchDoc = trip?.dispatchDoc || null;
  if (!trip || !trip.isWarehouseConfirmed || !dispatchDoc) {
    return { hasPlanDrift: false, changes: [], summaryAr: '', summaryEn: '' };
  }

  const changes = [];
  const liveOrders = Array.isArray(trip.orders) ? trip.orders : [];
  const savedOrderIds = Array.isArray(dispatchDoc.orderIds) ? dispatchDoc.orderIds : [];
  const savedRows = Array.isArray(dispatchDoc.clientRowsSnapshot) ? dispatchDoc.clientRowsSnapshot : [];

  const liveOrderById = {};
  liveOrders.forEach((o) => {
    liveOrderById[o.id] = o;
  });
  const savedRowById = {};
  savedRows.forEach((r) => {
    savedRowById[r.orderId] = r;
  });

  // 1. Added / Removed Orders (distinguishing pre-shipment drift vs post-shipment return settlement)
  const didTruckShipOut = Boolean(
    dispatchDoc.hasShippedOut ||
      dispatchDoc.shippedAt ||
      trip.allDispatchedOut ||
      trip.tripStage === 'dispatched' ||
      trip.tripStage === 'delivered' ||
      trip.tripStage === 'reconciled'
  );
  const undeliveredIdSet = new Set(
    (Array.isArray(dispatchDoc.undeliveredOrders) ? dispatchDoc.undeliveredOrders : [])
      .map((u) => u?.orderId)
      .filter(Boolean)
  );

  const savedIdSet = new Set(savedOrderIds);
  const liveIdSet = new Set(liveOrders.map((o) => o.id));

  liveOrders.forEach((o) => {
    if (!savedIdSet.has(o.id)) {
      const oType = o.orderType || 'supply';
      const normFulfill = normalizeTripOrderFulfillment(o.fulfillmentStatus);
      const isPostShipmentSettlement =
        didTruckShipOut &&
        (o.settledFromTripExtras === true ||
          o.isPostDispatchSettlementOrder === true ||
          RETURN_PHYSICAL_TYPES.has(oType) ||
          normFulfill === 'delivered' ||
          normFulfill === 'paid');
      if (isPostShipmentSettlement) return;

      const ser = o.serial || String(o.id || '').replace(/^SO-/, '');
      changes.push({
        kind: 'order_added',
        labelAr: `إضافة طلب جديد (#${ser})`,
        labelEn: `Added Order (#${ser})`,
        oldValue: '—',
        newValue: `${o.clientName || '—'} (#${ser})`,
      });
    }
  });

  savedOrderIds.forEach((oid) => {
    if (!liveIdSet.has(oid)) {
      // If truck already shipped out and this order failed delivery (recorded as undelivered return), it is NOT plan drift
      if (didTruckShipOut && undeliveredIdSet.has(oid)) return;
      const prevRow = savedRowById[oid];
      const ser = prevRow?.serial || String(oid || '').replace(/^SO-/, '');
      changes.push({
        kind: 'order_removed',
        labelAr: `حذف / نقل طلب (#${ser})`,
        labelEn: `Removed / Moved Order (#${ser})`,
        oldValue: `${prevRow?.clientName || '—'} (#${ser})`,
        newValue: '—',
      });
    }
  });

  // 2. Per-Order / Per-SKU Locked Quantity Changes
  const { columns: liveCols, clientRows: liveClientRows } = buildTripDispatchMatrix({
    tripOrders: liveOrders,
    finishedProducts,
    existingDispatch: dispatchDoc,
  });
  const colLabelByKey = {};
  liveCols.forEach((c) => {
    colLabelByKey[c.colKey] = {
      ar: `${c.shortNameAr || c.nameAr || c.productCode} (${c.optionNameAr || c.optionCode})`,
      en: `${c.shortNameEn || c.nameEn || c.productCode} (${c.optionNameEn || c.optionCode})`,
    };
  });
  (dispatchDoc.columns || []).forEach((c) => {
    if (!colLabelByKey[c.colKey]) {
      colLabelByKey[c.colKey] = {
        ar: `${c.nameAr || c.productCode} (${c.optionCode || c.optionSuffix || ''})`,
        en: `${c.nameEn || c.productCode} (${c.optionCode || c.optionSuffix || ''})`,
      };
    }
  });

  liveClientRows.forEach((lr) => {
    if (!savedIdSet.has(lr.orderId)) return; // already checked as order_added
    const liveOrder = liveOrderById[lr.orderId];
    // Post-dispatch partial rejection / retail settlement adjusts delivered/returned quantity without altering what left the gate
    if (
      didTruckShipOut &&
      liveOrder &&
      (liveOrder.hasPartialRejection ||
        liveOrder.retailSettlementStatus === 'settled' ||
        Number(liveOrder.returnedCartons || 0) > 0 ||
        Boolean(liveOrder.preAdjustmentSnapshot))
    ) {
      return;
    }
    const prevRow = savedRowById[lr.orderId];
    if (!prevRow) return;
    const allColKeys = new Set([
      ...Object.keys(lr.quantitiesByCol || {}),
      ...Object.keys(prevRow.quantitiesByCol || {}),
    ]);
    allColKeys.forEach((ck) => {
      const oldQ = roundQty(Number(prevRow.quantitiesByCol?.[ck] || 0));
      const newQ = roundQty(Number(lr.quantitiesByCol?.[ck] || 0));
      if (Math.abs(oldQ - newQ) > 1e-4) {
        const lbl = colLabelByKey[ck] || { ar: ck, en: ck };
        changes.push({
          kind: 'qty_changed',
          labelAr: `تعديل كمية (${lr.clientName} #${lr.serial}) — ${lbl.ar}`,
          labelEn: `Qty Changed (${lr.clientName} #${lr.serial}) — ${lbl.en}`,
          oldValue: `${oldQ}`,
          newValue: `${newQ}`,
        });
      }
    });
  });

  // 3. Vehicle Change
  const prevVehId = String(dispatchDoc.vehicleId || '').trim();
  const liveVehId = String(trip.primaryVehicleId || '').trim();
  if (prevVehId && liveVehId && prevVehId !== liveVehId) {
    changes.push({
      kind: 'vehicle_changed',
      labelAr: 'تغيير الشاحنة',
      labelEn: 'Vehicle Changed',
      oldValue: dispatchDoc.vehicleName || prevVehId,
      newValue: trip.vehicleDisplayName || liveVehId,
    });
  }

  // 4. Driver Change
  const prevDrvName = String(dispatchDoc.driverName || '').trim();
  const liveDrvName = String(trip.primaryDriverName || '').trim();
  const prevDrvId = String(dispatchDoc.driverId || '').trim();
  const liveDrvId = String(trip.primaryDriverId || '').trim();
  if ((prevDrvId && liveDrvId && prevDrvId !== liveDrvId) || (prevDrvName !== liveDrvName && (prevDrvName || liveDrvName))) {
    changes.push({
      kind: 'driver_changed',
      labelAr: 'تغيير السائق',
      labelEn: 'Driver Changed',
      oldValue: prevDrvName || '—',
      newValue: liveDrvName || '—',
    });
  }

  // 5. Delivery Rep Change
  const prevRepName = String(dispatchDoc.deliveryRepName || '').trim();
  const liveRepName = String(trip.primaryRepName || '').trim();
  if (prevRepName !== liveRepName && (prevRepName || liveRepName)) {
    changes.push({
      kind: 'rep_changed',
      labelAr: 'تغيير مندوب التوصيل',
      labelEn: 'Delivery Rep Changed',
      oldValue: prevRepName || '—',
      newValue: liveRepName || '—',
    });
  }

  // 6. Delivery Sequence Change
  const savedSeqMap = dispatchDoc.orderSequencesSnapshot || null;
  if (savedSeqMap && typeof savedSeqMap === 'object') {
    const seqChangedClients = [];
    liveOrders.forEach((o) => {
      if (!savedIdSet.has(o.id)) return;
      const oldSeq = Number(savedSeqMap[o.id]) > 0 ? Math.floor(Number(savedSeqMap[o.id])) : null;
      const newSeq = Number(o.deliverySequence) > 0 ? Math.floor(Number(o.deliverySequence)) : null;
      if (oldSeq !== newSeq) {
        seqChangedClients.push(
          `${o.clientName || o.serial}: ${oldSeq ? `#${oldSeq}` : 'تلقائي'} → ${newSeq ? `#${newSeq}` : 'تلقائي'}`
        );
      }
    });
    if (seqChangedClients.length > 0) {
      changes.push({
        kind: 'sequence_changed',
        labelAr: 'تعديل أولوية التسليم',
        labelEn: 'Delivery Sequence Changed',
        oldValue: '—',
        newValue: seqChangedClients.join(' | '),
      });
    }
  } else {
    // Legacy dispatch doc without orderSequencesSnapshot: alert only if a sequence was newly added
    const newlySequenced = liveOrders.filter((o) => savedIdSet.has(o.id) && Number(o.deliverySequence) > 0);
    if (newlySequenced.length > 0) {
      changes.push({
        kind: 'sequence_changed',
        labelAr: 'تحديد أولوية تسليم جديدة',
        labelEn: 'Delivery Sequence Added',
        oldValue: 'تلقائي',
        newValue: newlySequenced.map((o) => `${o.clientName || o.serial} (#${o.deliverySequence})`).join(' | '),
      });
    }
  }

  const hasPlanDrift = changes.length > 0;
  const summaryAr = hasPlanDrift
    ? changes.map((c) => `${c.labelAr}${c.oldValue && c.oldValue !== '—' ? ` (${c.oldValue} ← ${c.newValue})` : `: ${c.newValue}`}`).join(' • ')
    : '';
  const summaryEn = hasPlanDrift
    ? changes.map((c) => `${c.labelEn}${c.oldValue && c.oldValue !== '—' ? ` (${c.oldValue} → ${c.newValue})` : `: ${c.newValue}`}`).join(' • ')
    : '';

  return { hasPlanDrift, changes, summaryAr, summaryEn };
}
