/**
 * Pure Dispatch Document Registry & Validity Engine
 * -----------------------------------------------------------------------------
 * Maintains intact unique sequential numbering (`DD-00001`, `DD-00002`, ...)
 * and dynamically evaluates every generated Dispatch Document's live status
 * (`valid` vs `legacy`) — even when a trip is reversed to Pending, an order is
 * cancelled, or the trip is completely unlinked from active orders/trucks.
 *
 * Kept 100% pure (zero Firebase imports) for deterministic Node ESM testing.
 */

import { getDocPrintStatus } from './truckDispatchUtils.js';

/**
 * Formats an integer sequence into an intact unique Dispatch Document number.
 * Example: 1 -> 'DD-00001', 42 -> 'DD-00042', 100005 -> 'DD-100005'
 */
export function formatDispatchDocNumber(seq) {
  const n = Math.max(1, Math.floor(Number(seq) || 0));
  return `DD-${String(n).padStart(5, '0')}`;
}

/**
 * Extracts YYYY-MM-DD from an ISO timestamp or date string safely.
 */
export function toIsoDateOnly(value) {
  if (!value) return '';
  const str = String(value).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const dt = new Date(str);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

/**
 * Builds an immutable registry payload from a generated Dispatch Document model.
 */
export function buildRegistryEntryPayload({
  docNumber,
  docSeq,
  trip,
  model,
  versionNumber = 1,
  printedAt,
  printedBy = '',
  printedById = '',
}) {
  const nowIso = printedAt || new Date().toISOString();
  const tripOrders = Array.isArray(trip?.orders) ? trip.orders : [];
  const clientRows = Array.isArray(model?.clientRows) ? model.clientRows : [];

  const orderIds =
    tripOrders.length > 0
      ? tripOrders.map((o) => o.id).filter(Boolean)
      : clientRows.map((r) => r.orderId).filter(Boolean);

  const orderSerials =
    tripOrders.length > 0
      ? tripOrders.map((o) => String(o.serial || String(o.id || '').replace(/^SO-/i, '')).trim()).filter(Boolean)
      : clientRows.map((r) => String(r.serial || '').trim()).filter(Boolean);

  const clientNamesSet = new Set();
  clientRows.forEach((r) => {
    if (r?.clientName) clientNamesSet.add(String(r.clientName).trim());
  });
  if (clientNamesSet.size === 0) {
    tripOrders.forEach((o) => {
      if (o?.clientName) clientNamesSet.add(String(o.clientName).trim());
    });
  }

  const sanitizedSnapshot = model ? JSON.parse(JSON.stringify(model)) : null;

  return {
    id: docNumber,
    docNumber,
    docSeq: Number(docSeq || 0),
    tripId: trip?.id || model?.tripId || '',
    loadingDate: trip?.loadingDate || model?.loadingDate || '',
    loadingOrderNumber: Number(trip?.loadingOrderNumber || model?.loadingOrderNumber || 0),
    versionNumber: Math.max(1, Number(versionNumber || 1)),
    printedAt: nowIso,
    printedDate: toIsoDateOnly(nowIso),
    printedBy: printedBy || '',
    printedById: printedById || '',
    vehicleName: model?.vehicleDisplayName || trip?.vehicleDisplayName || '',
    plateNumber: model?.plateNumber || trip?.plateNumber || trip?.primaryVehiclePlate || '',
    driverName: model?.driverName || trip?.primaryDriverName || '',
    deliveryRepName: model?.deliveryRepName || trip?.primaryRepName || '',
    orderIds,
    orderSerials,
    clientNames: Array.from(clientNamesSet),
    totalLocked: Number(model?.totalLocked || 0),
    totalExtras: Number(model?.totalExtras || 0),
    totalLoaded: Number(model?.totalLoaded || 0),
    totalWeightTon: Number(model?.totalWeightTon || 0),
    modelSnapshot: sanitizedSnapshot,
    storedStatus: 'current',
    supersededAt: null,
    supersededBy: null,
    supersededByDocNumber: null,
    supersededReasonAr: '',
    supersededReasonEn: '',
  };
}

/**
 * Dynamically evaluates whether a Dispatch Document in the registry is currently
 * `valid` or `legacy`, along with a clear bilingual reason and link status.
 */
export function evaluateDispatchDocumentValidity(
  entry,
  { tripsById = {}, ordersById = {}, dispatchesById = {}, allDocsByTripId = {} } = {}
) {
  const tripId = entry?.tripId || '';
  const liveTrip = tripId ? tripsById[tripId] || null : null;
  const linkedDispatchDoc = (tripId && dispatchesById[tripId]) || liveTrip?.dispatchDoc || null;
  const isLinkedToLiveTrip = Boolean(liveTrip);

  const sameTripDocs = Array.isArray(allDocsByTripId[tripId]) ? allDocsByTripId[tripId] : [];
  const newerDoc = sameTripDocs.find((other) => {
    if (!other || other.id === entry.id) return false;
    if (Number(other.docSeq || 0) > 0 && Number(entry.docSeq || 0) > 0) {
      return Number(other.docSeq) > Number(entry.docSeq);
    }
    if (Number(other.versionNumber || 0) !== Number(entry.versionNumber || 0)) {
      return Number(other.versionNumber || 0) > Number(entry.versionNumber || 0);
    }
    return String(other.printedAt || '') > String(entry.printedAt || '');
  }) || null;

  const entryOrderIds = Array.isArray(entry?.orderIds) ? entry.orderIds : [];
  const entryOrders = entryOrderIds.map((oid) => ordersById[oid]).filter(Boolean);
  const cancelledOrderSerials = entryOrders
    .filter((o) => o.confirmationStatus === 'canceled')
    .map((o) => o.serial || String(o.id || '').replace(/^SO-/i, ''));

  // Did the truck actually move into `shipped` status (physically left the warehouse gate)?
  const didTruckShipOut = Boolean(
    liveTrip?.allDispatchedOut ||
    liveTrip?.tripStage === 'dispatched' ||
    liveTrip?.tripStage === 'delivered' ||
    liveTrip?.tripStage === 'reconciled' ||
    linkedDispatchDoc?.hasShippedOut ||
    linkedDispatchDoc?.shippedAt ||
    entryOrders.some(
      (o) =>
        ['shipped', 'delivered', 'paid'].includes(o.fulfillmentStatus) ||
        Boolean(o.shippedAt)
    )
  );

  // 1. Explicitly superseded or newer document minted for this trip
  if (entry?.storedStatus === 'superseded' || newerDoc) {
    const newerLabel = entry?.supersededByDocNumber || newerDoc?.docNumber || '';
    const defaultAr = newerLabel ? `استُبدل بالمستند ${newerLabel}` : 'تعديل بيان الصرف';
    const defaultEn = newerLabel ? `Superseded by ${newerLabel}` : 'Dispatch slip modified';

    return {
      status: 'legacy',
      isLinkedToLiveTrip,
      didTruckShipOut,
      reasonCode: 'superseded',
      reasonAr: (entry?.supersededReasonAr || '').trim() || defaultAr,
      reasonEn: (entry?.supersededReasonEn || '').trim() || defaultEn,
      newerDocNumber: newerLabel || null,
    };
  }

  // 2. If the truck ACTUALLY moved into `shipped` status (went out with dispatched quantities),
  //    the dispatch document REMAINS VALID even if one or more orders failed delivery / were returned / detached!
  //    Undelivered quantities are added to Expected-to-Return quantities instead of invalidating the dispatch doc.
  if (didTruckShipOut) {
    const undeliveredCount = Array.isArray(linkedDispatchDoc?.undeliveredOrders)
      ? linkedDispatchDoc.undeliveredOrders.length
      : 0;
    const hasFailedDeliveries = undeliveredCount > 0 || cancelledOrderSerials.length > 0 || !liveTrip;
    return {
      status: 'valid',
      isLinkedToLiveTrip,
      didTruckShipOut: true,
      reasonCode: hasFailedDeliveries ? 'valid_shipped_with_undelivered' : 'valid_shipped',
      reasonAr: hasFailedDeliveries
        ? 'ساري — خرجت الشاحنة (غير المسلم مضاف للمرتجع)'
        : 'ساري — خرجت الشاحنة',
      reasonEn: hasFailedDeliveries
        ? 'Valid — Shipped (undelivered added to returns)'
        : 'Valid — Shipped',
      newerDocNumber: null,
    };
  }

  // --- Below applies ONLY when the truck DID NOT move into `shipped` status ---

  // 3. Trip no longer exists in live active trips (all orders cancelled, removed, or moved before shipping)
  if (!liveTrip) {
    if (cancelledOrderSerials.length > 0) {
      const serialList = cancelledOrderSerials.map((s) => `#${s}`).join('، ');
      return {
        status: 'legacy',
        isLinkedToLiveTrip: false,
        didTruckShipOut: false,
        reasonCode: 'trip_cancelled_or_unlinked',
        reasonAr: `تم إلغاء الطلبات (${serialList}) وفك الرحلة`,
        reasonEn: `Order(s) cancelled (${cancelledOrderSerials.map((s) => `#${s}`).join(', ')}) & trip unlinked`,
        newerDocNumber: null,
      };
    }
    return {
      status: 'legacy',
      isLinkedToLiveTrip: false,
      didTruckShipOut: false,
      reasonCode: 'trip_unlinked',
      reasonAr: 'رحلة غير مرتبطة',
      reasonEn: 'Trip unlinked before shipping',
      newerDocNumber: null,
    };
  }

  // 4. Trip was reversed back to Pending (`not_yet` / `tripStage === 'pending'` / `isLoadingUnlocked === false`)
  if (
    liveTrip.isLoadingUnlocked === false ||
    liveTrip.tripStage === 'pending' ||
    liveTrip.isDisabledPending ||
    liveTrip.tripStage === 'pending_disabled'
  ) {
    return {
      status: 'legacy',
      isLinkedToLiveTrip: true,
      didTruckShipOut: false,
      reasonCode: 'trip_reversed_pending',
      reasonAr: 'الرحلة أعيدت لمعلق قبل الخروج',
      reasonEn: 'Trip reversed to Pending',
      newerDocNumber: null,
    };
  }

  // 5. One or more orders originally on this printed doc were cancelled before shipping
  if (cancelledOrderSerials.length > 0) {
    const serialList = cancelledOrderSerials.map((s) => `#${s}`).join('، ');
    return {
      status: 'legacy',
      isLinkedToLiveTrip: true,
      didTruckShipOut: false,
      reasonCode: 'order_cancelled',
      reasonAr: `إلغاء طلب (${serialList})`,
      reasonEn: `Order cancelled (${cancelledOrderSerials.map((s) => `#${s}`).join(', ')})`,
      newerDocNumber: null,
    };
  }

  // 6. Post-dispatch Loading Plan drift before shipping
  if (liveTrip.planDrift?.hasPlanDrift) {
    return {
      status: 'legacy',
      isLinkedToLiveTrip: true,
      didTruckShipOut: false,
      reasonCode: 'plan_drift',
      reasonAr: liveTrip.planDrift.summaryAr || 'تعديل خطة الرحلة',
      reasonEn: liveTrip.planDrift.summaryEn || 'Loading Plan changed',
      newerDocNumber: null,
    };
  }

  // 7. Dispatch slip edited after this document was printed
  const dDoc = liveTrip.dispatchDoc || {};
  const contentUpdatedAt = dDoc.dispatchContentUpdatedAt || dDoc.updatedAt || '';
  if (entry.printedAt && contentUpdatedAt) {
    const printState = getDocPrintStatus(entry.printedAt, contentUpdatedAt);
    if (printState === 'printed_stale') {
      return {
        status: 'legacy',
        isLinkedToLiveTrip: true,
        didTruckShipOut: false,
        reasonCode: 'dispatch_edited',
        reasonAr: 'تعديل كميات الصرف بعد الطباعة',
        reasonEn: 'Dispatch slip edited after print',
        newerDocNumber: null,
      };
    }
  }

  // 8. Valid (still preparing / loaded and completely up-to-date)
  return {
    status: 'valid',
    isLinkedToLiveTrip: true,
    didTruckShipOut: false,
    reasonCode: 'valid',
    reasonAr: 'مستند ساري',
    reasonEn: 'Valid',
    newerDocNumber: null,
  };
}

/**
 * Merges the canonical `dispatch_documents` collection with any pre-numbering
 * historical prints still sitting inside `truck_dispatches` (including orphaned
 * `truck_dispatches` docs whose trips no longer exist in `allTrips`), evaluates
 * live `valid` vs `legacy` status for every document, and sorts newest first.
 */
export function buildDispatchDocumentsRegistry({
  registryDocs = [],
  truckDispatches = [],
  allTrips = [],
  orders = [],
} = {}) {
  const tripsById = {};
  (allTrips || []).forEach((t) => {
    if (t?.id) tripsById[t.id] = t;
  });

  const ordersById = {};
  (orders || []).forEach((o) => {
    if (o?.id) ordersById[o.id] = o;
  });

  const dispatchesById = {};
  (truckDispatches || []).forEach((td) => {
    if (td?.id) dispatchesById[td.id] = td;
  });

  const merged = [];
  const seenKeys = new Set();

  // 1. Canonical numbered documents from `dispatch_documents`
  (registryDocs || []).forEach((docItem) => {
    if (!docItem) return;
    const docNum = docItem.docNumber || docItem.id || '';
    if (!docNum) return;
    const normalized = {
      ...docItem,
      id: docNum,
      docNumber: docNum,
      docSeq: Number(docItem.docSeq || 0),
      printedDate: docItem.printedDate || toIsoDateOnly(docItem.printedAt) || docItem.loadingDate || '',
      isPreNumberingArchive: false,
    };
    merged.push(normalized);
    seenKeys.add(`num:${docNum}`);
    if (normalized.tripId && normalized.versionNumber) {
      seenKeys.add(`tv:${normalized.tripId}::${normalized.versionNumber}`);
    }
  });

  // 2. Pre-numbering historical prints from `truck_dispatches` (including orphaned trips!)
  (truckDispatches || []).forEach((td) => {
    if (!td?.id) return;
    const storedVersions = Array.isArray(td.dispatchDocVersions) ? td.dispatchDocVersions : [];
    const fallbackEntries =
      storedVersions.length > 0
        ? storedVersions
        : td.dispatchPrintedAt
        ? [
            {
              versionId: `LEGACY-PRE-${td.id}-V1`,
              versionNumber: 1,
              printedAt: td.dispatchPrintedAt,
              printedBy: td.dispatchPrintedBy || td.dispatchedByName || '',
              status: 'current',
              modelSnapshot: null,
              sourceSnapshot:
                Array.isArray(td.dispatchHistory) && td.dispatchHistory.length > 0
                  ? td.dispatchHistory[0]
                  : td,
            },
          ]
        : [];

    fallbackEntries.forEach((ver) => {
      const verNum = Math.max(1, Number(ver.versionNumber || 1));
      if (ver.docNumber && seenKeys.has(`num:${ver.docNumber}`)) return;
      if (seenKeys.has(`tv:${td.id}::${verNum}`)) return;

      const snap = ver.modelSnapshot || null;
      const fallbackDocNumber = ver.docNumber || `ARCHIVE-LO${td.loadingOrderNumber || '?'}-V${verNum}`;
      const rows = Array.isArray(snap?.clientRows)
        ? snap.clientRows
        : Array.isArray(td.clientRowsSnapshot)
        ? td.clientRowsSnapshot
        : [];

      const orderIds = Array.isArray(td.orderIds) && td.orderIds.length > 0
        ? td.orderIds
        : rows.map((r) => r.orderId).filter(Boolean);

      const orderSerials = rows.map((r) => String(r.serial || '').trim()).filter(Boolean);
      const clientNames = Array.from(new Set(rows.map((r) => String(r.clientName || '').trim()).filter(Boolean)));

      merged.push({
        id: ver.versionId || `${td.id}-V${verNum}`,
        docNumber: fallbackDocNumber,
        docSeq: 0,
        tripId: td.id,
        loadingDate: snap?.loadingDate || td.loadingDate || '',
        loadingOrderNumber: Number(snap?.loadingOrderNumber || td.loadingOrderNumber || 0),
        versionNumber: verNum,
        printedAt: ver.printedAt || td.dispatchPrintedAt || '',
        printedDate: toIsoDateOnly(ver.printedAt || td.dispatchPrintedAt) || td.loadingDate || '',
        printedBy: ver.printedBy || td.dispatchPrintedBy || '',
        vehicleName: snap?.vehicleDisplayName || td.vehicleName || '',
        plateNumber: snap?.plateNumber || td.plateNumber || '',
        driverName: snap?.driverName || td.driverName || '',
        deliveryRepName: snap?.deliveryRepName || td.deliveryRepName || '',
        orderIds,
        orderSerials,
        clientNames,
        totalLocked: Number(snap?.totalLocked || 0),
        totalExtras: Number(snap?.totalExtras || 0),
        totalLoaded: Number(snap?.totalLoaded || 0),
        totalWeightTon: Number(snap?.totalWeightTon || 0),
        modelSnapshot: snap,
        sourceSnapshot: ver.sourceSnapshot || td,
        storedStatus: ver.status === 'superseded' ? 'superseded' : 'current',
        supersededAt: ver.supersededAt || null,
        supersededBy: ver.supersededBy || null,
        supersededByDocNumber: ver.supersededByDocNumber || null,
        supersededReasonAr: ver.supersededReasonAr || '',
        supersededReasonEn: ver.supersededReasonEn || '',
        isPreNumberingArchive: !ver.docNumber,
      });
      seenKeys.add(`tv:${td.id}::${verNum}`);
    });
  });

  // Group by tripId for cross-version evaluation
  const allDocsByTripId = {};
  merged.forEach((item) => {
    const tid = item.tripId || '__none__';
    if (!allDocsByTripId[tid]) allDocsByTripId[tid] = [];
    allDocsByTripId[tid].push(item);
  });

  // Evaluate live validity for every entry
  const evaluated = merged.map((entry) => {
    const validity = evaluateDispatchDocumentValidity(entry, {
      tripsById,
      ordersById,
      dispatchesById,
      allDocsByTripId,
    });
    return {
      ...entry,
      ...validity,
    };
  });

  // Attach latestValidDoc per tripId (so Legacy documents can reference the replacement doc if one is valid)
  const validByTripId = {};
  evaluated.forEach((item) => {
    if (item.status === 'valid' && item.tripId) {
      validByTripId[item.tripId] = item;
    }
  });

  const enriched = evaluated.map((item) => {
    const replacement = item.tripId && validByTripId[item.tripId] && validByTripId[item.tripId].id !== item.id
      ? validByTripId[item.tripId]
      : null;
    return {
      ...item,
      latestValidDocNumber: replacement?.docNumber || null,
      latestValidVersionNumber: replacement?.versionNumber || null,
      latestValidPrintedAt: replacement?.printedAt || null,
    };
  });

  // Sort newest first: highest docSeq first, then printedAt desc
  return enriched.sort((a, b) => {
    const seqA = Number(a.docSeq || 0);
    const seqB = Number(b.docSeq || 0);
    if (seqA !== seqB && (seqA > 0 || seqB > 0)) {
      if (seqA > 0 && seqB > 0) return seqB - seqA;
      // Numbered docs with newer printedAt vs pre-numbering archive: compare timestamps
    }
    const timeA = String(a.printedAt || '');
    const timeB = String(b.printedAt || '');
    if (timeA !== timeB) return timeB.localeCompare(timeA);
    return seqB - seqA;
  });
}

/**
 * Date-only filter for the Dispatch Documents History modal.
 * Matches if EITHER `printedDate` OR `loadingDate` equals the target date.
 */
export function filterDispatchDocumentsByDate(
  entries = [],
  { mode = 'all', selectedDate = '', todayStr = '' } = {}
) {
  if (!Array.isArray(entries)) return [];
  if (mode === 'all') return entries;
  const targetDate = mode === 'today' ? todayStr : selectedDate;
  if (!targetDate) return entries;
  return entries.filter(
    (entry) => entry.printedDate === targetDate || entry.loadingDate === targetDate
  );
}
