/**
 * Finished Goods Stock Single Source of Truth (SSOT) Engine
 * ---------------------------------------------------------
 * Computes real-time & period-filtered per-SKU, per-packaging-option, and per-lot
 * Finished Goods balances plus chronological Kardex movement ledgers from verified Firestore streams:
 *
 *  Physical FG On-Hand (Cartons + Small Units):
 *   (+) Opening Balance: finished_products[].packagingOptions[] + carry-forward prior to startDate
 *   (+) Accepted Production Pallets: staged_floor_pallets (transferred_to_fg / accepted_in_fg)
 *   (+) Commercial Sales Returns: sales_orders (return_deduct / return_no_deduct in delivered / paid)
 *   (-) Faulty Warehouse Pulls: faulty_fg_returns (sourceType === 'fg_warehouse' && status !== 'cancelled')
 *   (-) Dispatched Sales Orders: sales_orders (supply / replacement_old / exchange in shipped / delivered / paid)
 *
 *  Pipeline & Commitment Visibility (Non-Deducted from Physical On-Hand):
 *   (~) Preparing / Committed: sales_orders (fulfillmentStatus === 'prepare')
 *       => Net Available = Physical On-Hand - Preparing
 *   (~) Pending Custodian Inward: stock_transfers (pending_custodian_verification for FG)
 *   (~) Staged on Production Floor: staged_floor_pallets (staged_on_floor, excluding pending transfer & waiting materials)
 *
 * NOTE: Strictly Units ONLY (Cartons & Small Base Units). Weight/Tons are intentionally excluded.
 */

const OUTBOUND_ORDER_TYPES = new Set(['supply', 'replacement_old', 'exchange']);
const RETURN_ORDER_TYPES = new Set(['return_deduct', 'return_no_deduct']);
const DISPATCHED_FULFILLMENT_STATUSES = new Set(['shipped', 'delivered', 'paid']);
const COMPLETED_RETURN_STATUSES = new Set(['delivered', 'paid']);

const MOVEMENT_TYPE_PRIORITY = {
  OPENING_BALANCE: 1,
  FG_INWARD: 2,
  SALES_RETURN: 3,
  TRIP_EXTRAS_RETURN: 3,
  TRIP_CLIENT_RETURN: 3,
  FAULTY_PULL: 4,
  SALES_DISPATCH: 5,
  TRIP_EXTRAS_OUT: 6,
};

export function roundQty(val) {
  return Math.round((Number(val) || 0) * 1000) / 1000;
}

export function parseTimestampMs(val, fallbackMs = 0) {
  if (!val) return fallbackMs;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val?.toMillis === 'function') {
    const ms = val.toMillis();
    return Number.isFinite(ms) ? ms : fallbackMs;
  }
  if (typeof val?.seconds === 'number') {
    return val.seconds * 1000;
  }
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isFinite(ms) ? ms : fallbackMs;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallbackMs;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : fallbackMs;
  }
  return fallbackMs;
}

export function formatDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  const ms = parseTimestampMs(val, 0);
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function resolveActorName(val, fallback = 'System') {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  return val.userName || val.nameAr || val.name || val.displayName || val.email || fallback;
}

function createEmptyOptionBucket(opt, sku, isAnyPool = false) {
  const ratio = Math.max(1, Number(opt?.packagingRatio) || Number(sku?.packagingRatio) || 1);
  const suffix = isAnyPool ? 'ANY' : String(opt?.suffix || 'A').trim().toUpperCase();
  const code = sku.code || sku.id || '';
  return {
    id: isAnyPool ? 'OPT-ANY' : (opt?.id || `OPT-${suffix}`),
    suffix,
    isAnyPool,
    optionCode: isAnyPool ? `${code}-ANY` : (opt?.optionCode || (code ? `${code}-${suffix}` : suffix)),
    nameAr: isAnyPool ? 'تعبئة غير محددة (أي تعبئة - Any)' : (opt?.nameAr || (suffix === 'A' ? 'التصميم القياسي المعتمد' : `تعبئة ${suffix}`)),
    nameEn: isAnyPool ? 'Unspecified Packing (Any)' : (opt?.nameEn || (suffix === 'A' ? 'Standard Design' : `Option ${suffix}`)),
    imageFile: isAnyPool ? '' : (opt?.imageFile || ''),
    packagingRatio: ratio,
    isActive: opt?.isActive !== false,
    catalogOpeningSmall: 0,
    catalogOpeningLarge: 0,
    priorNetSmall: 0,
    priorNetLarge: 0,
    openingSmall: 0,
    openingLarge: 0,
    producedInSmall: 0,
    producedInLarge: 0,
    salesReturnedInSmall: 0,
    salesReturnedInLarge: 0,
    dispatchedOutSmall: 0,
    dispatchedOutLarge: 0,
    faultyOutSmall: 0,
    faultyOutLarge: 0,
    physicalOnHandSmall: 0,
    physicalOnHandLarge: 0,
    preparingSmall: 0,
    preparingLarge: 0,
    netAvailableSmall: 0,
    netAvailableLarge: 0,
    pendingTransferSmall: 0,
    pendingTransferLarge: 0,
    stagedOnFloorSmall: 0,
    stagedOnFloorLarge: 0,
    deferredReturnSmall: 0,
    deferredReturnLarge: 0,
    totalInwardCost: 0,
    totalInwardSmallQty: 0,
    avgCostPerSmall: 0,
    avgCostPerLarge: 0,
    stockValue: 0,
    pallets: [],
    preparingOrders: [],
    pendingTransfersList: [],
    stagedPalletsList: [],
    movements: [],
  };
}

function getOrCreateAnyOptionBucket(entry) {
  let anyBucket = entry.optionsBreakdown.find((o) => o.isAnyPool);
  if (!anyBucket) {
    anyBucket = createEmptyOptionBucket(null, entry, true);
    entry.optionsBreakdown.push(anyBucket);
  }
  return anyBucket;
}

function resolveOptionForProduct(entry, suffixHint, ratioHint) {
  const realOptions = (entry.optionsBreakdown || []).filter((o) => !o.isAnyPool);
  if (realOptions.length === 0) return null;

  if (suffixHint) {
    const normHint = String(suffixHint).trim().toUpperCase();
    if (normHint === 'ANY') {
      if (realOptions.length === 1) return realOptions[0];
      return getOrCreateAnyOptionBucket(entry);
    }
    const bySuffix = realOptions.find(
      (o) =>
        String(o.suffix || '').trim().toUpperCase() === normHint ||
        String(o.optionCode || '').trim().toUpperCase() === normHint
    );
    if (bySuffix) return bySuffix;
  }

  const numericRatio = Number(ratioHint || 0);
  if (numericRatio > 0) {
    const byRatio = realOptions.find((o) => Number(o.packagingRatio) === numericRatio);
    if (byRatio) return byRatio;
  }

  return realOptions[0];
}

/**
 * Classifies an event date against optional [startDate, endDate] period bounds.
 * Returns 'before' | 'in_period' | 'after'.
 */
function classifyDateWindow(eventDate, startDate, endDate) {
  const d = eventDate || '';
  if (endDate && d && d > endDate) return 'after';
  if (startDate && (!d || d < startDate)) return 'before';
  return 'in_period';
}

function applyMovementBucket(target, direction, fieldPrefix, qtySmall, qtyLarge, windowClass) {
  if (windowClass === 'after') return;
  if (windowClass === 'before') {
    const sign = direction === 'IN' ? 1 : -1;
    target.priorNetSmall = roundQty(target.priorNetSmall + sign * qtySmall);
    target.priorNetLarge = roundQty(target.priorNetLarge + sign * qtyLarge);
    return;
  }
  const smallKey = `${fieldPrefix}Small`;
  const largeKey = `${fieldPrefix}Large`;
  target[smallKey] = roundQty(target[smallKey] + qtySmall);
  target[largeKey] = roundQty(target[largeKey] + qtyLarge);
}

function finalizeOptionMetrics(opt) {
  const ratio = Math.max(1, Number(opt.packagingRatio) || 1);
  opt.openingSmall = roundQty(opt.catalogOpeningSmall + opt.priorNetSmall);
  opt.openingLarge = roundQty(opt.catalogOpeningLarge + opt.priorNetLarge);
  opt.producedInSmall = roundQty(opt.producedInSmall);
  opt.producedInLarge = roundQty(opt.producedInLarge);
  opt.salesReturnedInSmall = roundQty(opt.salesReturnedInSmall);
  opt.salesReturnedInLarge = roundQty(opt.salesReturnedInLarge);
  opt.dispatchedOutSmall = roundQty(opt.dispatchedOutSmall);
  opt.dispatchedOutLarge = roundQty(opt.dispatchedOutLarge);
  opt.faultyOutSmall = roundQty(opt.faultyOutSmall);
  opt.faultyOutLarge = roundQty(opt.faultyOutLarge);

  const physSmall = roundQty(
    opt.openingSmall + opt.producedInSmall + opt.salesReturnedInSmall - opt.dispatchedOutSmall - opt.faultyOutSmall
  );
  opt.physicalOnHandSmall = physSmall;
  opt.physicalOnHandLarge = roundQty(
    opt.openingLarge + opt.producedInLarge + opt.salesReturnedInLarge - opt.dispatchedOutLarge - opt.faultyOutLarge
  );
  opt.preparingSmall = roundQty(opt.preparingSmall);
  opt.preparingLarge = roundQty(opt.preparingLarge);
  opt.netAvailableSmall = roundQty(opt.physicalOnHandSmall - opt.preparingSmall);
  opt.netAvailableLarge = roundQty(opt.physicalOnHandLarge - opt.preparingLarge);
  opt.pendingTransferSmall = roundQty(opt.pendingTransferSmall);
  opt.pendingTransferLarge = roundQty(opt.pendingTransferLarge);
  opt.stagedOnFloorSmall = roundQty(opt.stagedOnFloorSmall);
  opt.stagedOnFloorLarge = roundQty(opt.stagedOnFloorLarge);
  opt.deferredReturnSmall = roundQty(opt.deferredReturnSmall);
  opt.deferredReturnLarge = roundQty(opt.deferredReturnLarge);

  opt.avgCostPerSmall =
    opt.totalInwardSmallQty > 0
      ? Math.round((opt.totalInwardCost / opt.totalInwardSmallQty) * 10000) / 10000
      : 0;
  opt.avgCostPerLarge = roundQty(opt.avgCostPerSmall * ratio);
  opt.stockValue =
    opt.physicalOnHandSmall > 0 && opt.avgCostPerSmall > 0
      ? Math.round(opt.physicalOnHandSmall * opt.avgCostPerSmall * 100) / 100
      : 0;
}

function resolveQtyPair(rawSmall, rawLarge, ratio) {
  const r = Math.max(1, Number(ratio) || 1);
  const s = Number(rawSmall || 0);
  const l = Number(rawLarge || 0);
  if (s > 0 && l > 0) return { qtySmall: roundQty(s), qtyLarge: roundQty(l) };
  if (s > 0) return { qtySmall: roundQty(s), qtyLarge: roundQty(s / r) };
  if (l > 0) return { qtySmall: roundQty(l * r), qtyLarge: roundQty(l) };
  return { qtySmall: 0, qtyLarge: 0 };
}

/**
 * Builds the comprehensive Finished Goods SSOT Stock Matrix + Movement Ledgers.
 */
export function buildFgStockMatrix({
  finishedProducts = [],
  stagedPallets = [],
  stockTransfers = [],
  faultyReturns = [],
  salesOrders = [],
  truckDispatches = [],
  startDate = '',
  endDate = '',
  todayStr = '',
} = {}) {
  const normStart = startDate ? String(startDate).trim().slice(0, 10) : '';
  const normEnd = endDate ? String(endDate).trim().slice(0, 10) : '';
  const effectiveReturnCutoff = normEnd || formatDateStr(todayStr) || formatDateStr(new Date());
  const skuMap = {};

  // Index truck_dispatches by orderId for Retail Unsold / Partial Rejection WH Confirmation hold & stockReturnDate
  const dispatchByOrderId = {};
  (truckDispatches || []).forEach((td) => {
    if (!td || td.dispatchStatus === 'cancelled') return;
    (td.orderIds || []).forEach((oid) => {
      if (oid) dispatchByOrderId[oid] = td;
    });
  });

  // 1. Initialize every Finished Good SKU + Opening Balance from finished_products[].packagingOptions[]
  finishedProducts.forEach((prod) => {
    const code = String(prod.code || prod.id || '').trim();
    if (!code) return;

    const primaryRatio = Math.max(1, Number(prod.packagingRatio) || Number(prod.packagingOptions?.[0]?.packagingRatio) || 1);
    const entry = {
      code,
      id: prod.id || code,
      nameAr: prod.nameAr || prod.shortName || code,
      nameEn: prod.nameEn || prod.nameAr || code,
      shortName: prod.shortName || '',
      productionLine: prod.productionLine || '',
      brandOwnership: prod.brandOwnership || 'own_brand',
      productType: prod.productType || 'main',
      smallUnit: prod.smallUnit || 'عبوة',
      largeUnitName: prod.largeUnitName || 'كرتونة',
      packagingRatio: primaryRatio,
      reorderLevel: Number(prod.reorderLevel || 0),
      shelfLifeMonths: Number(prod.shelfLifeMonths || 24),
      status: prod.status || 'active',
      imageFile: prod.imageFile || '',
      rawProduct: prod,

      // Stock buckets (Small & Large only)
      catalogOpeningSmall: 0,
      catalogOpeningLarge: 0,
      priorNetSmall: 0,
      priorNetLarge: 0,
      openingSmall: 0,
      openingLarge: 0,
      producedInSmall: 0,
      producedInLarge: 0,
      salesReturnedInSmall: 0,
      salesReturnedInLarge: 0,
      dispatchedOutSmall: 0,
      dispatchedOutLarge: 0,
      faultyOutSmall: 0,
      faultyOutLarge: 0,
      physicalOnHandSmall: 0,
      physicalOnHandLarge: 0,
      preparingSmall: 0,
      preparingLarge: 0,
      netAvailableSmall: 0,
      netAvailableLarge: 0,
      pendingTransferSmall: 0,
      pendingTransferLarge: 0,
      stagedOnFloorSmall: 0,
      stagedOnFloorLarge: 0,
      deferredReturnSmall: 0,
      deferredReturnLarge: 0,

      // Valuation
      totalInwardCost: 0,
      totalInwardSmallQty: 0,
      avgCostPerSmall: 0,
      avgCostPerLarge: 0,
      stockValue: 0,

      // Health flag
      healthStatus: 'ok',

      // Drill-down collections
      optionsBreakdown: [],
      preparingOrders: [],
      pendingTransfersList: [],
      stagedPalletsList: [],
      movements: [],
    };

    const rawOpts = Array.isArray(prod.packagingOptions) && prod.packagingOptions.length > 0
      ? prod.packagingOptions
      : [{ id: 'OPT-01', suffix: 'A', packagingRatio: primaryRatio, isActive: true }];

    rawOpts.forEach((opt) => {
      const optBucket = createEmptyOptionBucket(opt, entry, false);
      const { qtySmall, qtyLarge } = resolveQtyPair(opt.openingQtySmall, opt.openingQtyLarge, optBucket.packagingRatio);

      if (qtySmall > 0 || qtyLarge > 0) {
        optBucket.catalogOpeningSmall = roundQty(optBucket.catalogOpeningSmall + qtySmall);
        optBucket.catalogOpeningLarge = roundQty(optBucket.catalogOpeningLarge + qtyLarge);
        entry.catalogOpeningSmall = roundQty(entry.catalogOpeningSmall + qtySmall);
        entry.catalogOpeningLarge = roundQty(entry.catalogOpeningLarge + qtyLarge);

        const obDate = opt.openingProdDate || formatDateStr(prod.createdAt) || formatDateStr(prod.updatedAt) || '2025-01-01';
        const obSortMs = parseTimestampMs(opt.openingProdDate || prod.createdAt || prod.updatedAt, 1);

        const obLot = {
          lotType: 'opening',
          palletId: `OB-${optBucket.optionCode}`,
          orderNumber: 'Opening Balance',
          batchRangeDisplay: opt.openingBatchNo || 'OB',
          prodDate: opt.openingProdDate || '',
          expDate: opt.openingExpDate || '',
          warehouse: opt.openingWarehouse || '',
          qtySmall,
          qtyLarge,
          packagingRatio: optBucket.packagingRatio,
          totalCost: 0,
          acceptedAt: obDate,
        };
        optBucket.pallets.push(obLot);

        const obMovement = {
          id: `OB-${optBucket.optionCode}`,
          type: 'OPENING_BALANCE',
          direction: 'IN',
          date: obDate,
          sortMs: obSortMs,
          refDocId: code,
          refNumber: `OB-${optBucket.optionCode}`,
          optionSuffix: optBucket.suffix,
          optionCode: optBucket.optionCode,
          batchOrLot: opt.openingBatchNo || 'OB',
          qtyInSmall: qtySmall,
          qtyOutSmall: 0,
          qtyInLarge: qtyLarge,
          qtyOutLarge: 0,
          actor: resolveActorName(prod.updatedBy || prod.createdBy, 'Catalog Master'),
          noteAr: `رصيد افتتاحي (${optBucket.optionCode})`,
          noteEn: `Opening Balance (${optBucket.optionCode})`,
        };
        entry.movements.push(obMovement);
        optBucket.movements.push(obMovement);
      }

      entry.optionsBreakdown.push(optBucket);
    });

    skuMap[code] = entry;
  });

  // Track pallets currently waiting inside Pending Custodian Inward transfers so they aren't double-shown as Staged on Floor
  const pendingTransferPalletIds = new Set();

  // 2. Pending Custodian Inward Transfers (stock_transfers) -> Visibility only
  stockTransfers.forEach((trn) => {
    if (trn.status !== 'pending_custodian_verification') return;
    const isFgTrn =
      trn.id?.startsWith('TRN-FG-') ||
      trn.id?.startsWith('FG-') ||
      trn.transferType === 'finished_goods' ||
      trn.transferCategory === 'finished_goods' ||
      trn.isFinishedGoods;
    if (!isFgTrn) return;

    (trn.lines || []).forEach((line) => {
      if (line.palletId) pendingTransferPalletIds.add(String(line.palletId));
      const code = String(line.itemId || line.itemCode || line.finishedProductId || line.productCode || '').trim();
      const entry = skuMap[code];
      if (!entry) return;

      const opt = resolveOptionForProduct(entry, line.packagingOptionSuffix || line.optionSuffix || line.variantSuffix, line.packagingRatio);
      const ratio = opt ? opt.packagingRatio : entry.packagingRatio;
      const { qtySmall, qtyLarge } = resolveQtyPair(line.qtySmall ?? line.quantitySmall, line.qtyLarge ?? line.quantityLarge ?? line.qty, ratio);
      if (qtySmall <= 0 && qtyLarge <= 0) return;

      const trnItem = {
        transferId: trn.id,
        palletId: line.palletId || '',
        orderNumber: line.orderNumber || trn.workOrderNumber || '',
        date: trn.transferDate || formatDateStr(trn.createdAt),
        qtySmall,
        qtyLarge,
        optionSuffix: opt?.suffix || 'A',
      };

      entry.pendingTransferSmall = roundQty(entry.pendingTransferSmall + qtySmall);
      entry.pendingTransferLarge = roundQty(entry.pendingTransferLarge + qtyLarge);
      entry.pendingTransfersList.push(trnItem);
      if (opt) {
        opt.pendingTransferSmall = roundQty(opt.pendingTransferSmall + qtySmall);
        opt.pendingTransferLarge = roundQty(opt.pendingTransferLarge + qtyLarge);
        opt.pendingTransfersList.push(trnItem);
      }
    });
  });

  // 3. Staged Floor Pallets (Accepted FG Inward vs Staged on Production Floor)
  stagedPallets.forEach((pallet) => {
    const code = String(pallet.finishedProductId || pallet.productCode || pallet.itemId || '').trim();
    const entry = skuMap[code];
    if (!entry) return;

    const opt = resolveOptionForProduct(
      entry,
      pallet.packagingOptionSuffix || pallet.optionSuffix || pallet.variantSuffix,
      pallet.packagingRatio
    );
    const ratio = opt ? opt.packagingRatio : entry.packagingRatio;
    const { qtySmall, qtyLarge } = resolveQtyPair(pallet.qtySmall, pallet.qtyLarge, ratio);
    if (qtySmall <= 0 && qtyLarge <= 0) return;

    const isAcceptedFg =
      pallet.status === 'transferred_to_fg' ||
      pallet.status === 'accepted_in_fg' ||
      pallet.stagingStatus === 'transferred_to_fg';

    if (isAcceptedFg) {
      const eventDate =
        formatDateStr(pallet.transferAcceptedAt) ||
        formatDateStr(pallet.transferredAt) ||
        formatDateStr(pallet.stagedAt) ||
        formatDateStr(pallet.updatedAt) ||
        formatDateStr(pallet.createdAt);
      const sortMs = parseTimestampMs(
        pallet.transferAcceptedAt || pallet.transferredAt || pallet.stagedAt || pallet.updatedAt || pallet.createdAt,
        Date.now()
      );
      const win = classifyDateWindow(eventDate, normStart, normEnd);

      applyMovementBucket(entry, 'IN', 'producedIn', qtySmall, qtyLarge, win);
      if (opt) applyMovementBucket(opt, 'IN', 'producedIn', qtySmall, qtyLarge, win);

      // Cost valuation (weighted average across accepted pallets up to endDate)
      if (win !== 'after') {
        const explicitTotalCost = Number(pallet.palletTotalCost || 0);
        const costPerSmall = Number(pallet.costPerSmall || 0);
        const costPerLarge = Number(pallet.costPerLarge || 0);
        const palletCost =
          explicitTotalCost > 0
            ? explicitTotalCost
            : costPerSmall > 0
            ? qtySmall * costPerSmall
            : costPerLarge > 0
            ? qtyLarge * costPerLarge
            : 0;

        if (palletCost > 0 && qtySmall > 0) {
          entry.totalInwardCost += palletCost;
          entry.totalInwardSmallQty += qtySmall;
          if (opt) {
            opt.totalInwardCost += palletCost;
            opt.totalInwardSmallQty += qtySmall;
          }
        }

        if (win === 'in_period' && opt) {
          opt.pallets.push({
            lotType: 'pallet',
            palletId: pallet.palletId || pallet.id,
            palletNumber: pallet.palletNumber || '',
            orderNumber: pallet.orderNumber || '',
            batchRangeDisplay: pallet.batchRangeDisplay || pallet.batchNo || '',
            prodDate: formatDateStr(pallet.prodDate || pallet.productionDate || pallet.stagedAt),
            expDate: formatDateStr(pallet.expDate || pallet.expiryDate),
            warehouse: pallet.targetWarehouse || pallet.warehouseName || '',
            qtySmall,
            qtyLarge,
            packagingRatio: opt.packagingRatio,
            totalCost: roundQty(palletCost),
            acceptedAt: eventDate,
          });
        }
      }

      const mov = {
        id: `PAL-${pallet.palletId || pallet.id}`,
        type: 'FG_INWARD',
        direction: 'IN',
        date: eventDate,
        sortMs,
        refDocId: pallet.id || pallet.palletId,
        refNumber: pallet.palletId || pallet.id || pallet.orderNumber || 'Pallet',
        optionSuffix: opt?.suffix || 'A',
        optionCode: opt?.optionCode || `${code}-A`,
        batchOrLot: pallet.batchRangeDisplay || pallet.orderNumber || '',
        qtyInSmall: qtySmall,
        qtyOutSmall: 0,
        qtyInLarge: qtyLarge,
        qtyOutLarge: 0,
        actor: resolveActorName(pallet.acceptedBy || pallet.verifiedBy || pallet.transferredBy, 'FG Custodian'),
        noteAr: `استلام باليتة منتج تام (${pallet.palletId || pallet.id})${pallet.orderNumber ? ` - أمر تشغيل ${pallet.orderNumber}` : ''}`,
        noteEn: `Accepted FG Pallet (${pallet.palletId || pallet.id})${pallet.orderNumber ? ` - WO ${pallet.orderNumber}` : ''}`,
      };
      entry.movements.push(mov);
      if (opt) opt.movements.push(mov);
    } else if (
      pallet.status === 'staged_on_floor' &&
      !pallet.isWaitingMaterials &&
      !pendingTransferPalletIds.has(String(pallet.id || '')) &&
      !pendingTransferPalletIds.has(String(pallet.palletId || ''))
    ) {
      const stagedItem = {
        palletId: pallet.palletId || pallet.id,
        orderNumber: pallet.orderNumber || '',
        qtySmall,
        qtyLarge,
        optionSuffix: opt?.suffix || 'A',
      };
      entry.stagedOnFloorSmall = roundQty(entry.stagedOnFloorSmall + qtySmall);
      entry.stagedOnFloorLarge = roundQty(entry.stagedOnFloorLarge + qtyLarge);
      entry.stagedPalletsList.push(stagedItem);
      if (opt) {
        opt.stagedOnFloorSmall = roundQty(opt.stagedOnFloorSmall + qtySmall);
        opt.stagedOnFloorLarge = roundQty(opt.stagedOnFloorLarge + qtyLarge);
        opt.stagedPalletsList.push(stagedItem);
      }
    }
  });

  // 4. Faulty FG Warehouse Pulls (faulty_fg_returns)
  faultyReturns.forEach((ret) => {
    if (ret.sourceType !== 'fg_warehouse') return;
    if (ret.status === 'cancelled' || ret.status === 'rejected') return;

    const lineItems = Array.isArray(ret.items) && ret.items.length > 0 ? ret.items : [ret];
    const retDate = ret.returnDate || formatDateStr(ret.createdAt);
    const sortMs = parseTimestampMs(ret.createdAt || ret.returnDate, Date.now());
    const actor = resolveActorName(ret.submittedBy, 'FG Warehouse');
    const win = classifyDateWindow(retDate, normStart, normEnd);

    lineItems.forEach((item, idx) => {
      const code = String(item.finishedProductId || item.productCode || '').trim();
      const entry = skuMap[code];
      if (!entry) return;

      const opt = resolveOptionForProduct(
        entry,
        item.packagingOptionSuffix || item.optionSuffix,
        item.packagingRatio
      );
      const ratio = opt ? opt.packagingRatio : entry.packagingRatio;
      const { qtySmall, qtyLarge } = resolveQtyPair(item.qtySmall, item.qtyLarge, ratio);
      if (qtySmall <= 0 && qtyLarge <= 0) return;

      applyMovementBucket(entry, 'OUT', 'faultyOut', qtySmall, qtyLarge, win);
      if (opt) applyMovementBucket(opt, 'OUT', 'faultyOut', qtySmall, qtyLarge, win);

      const mov = {
        id: `FLT-${ret.id}-${idx}`,
        type: 'FAULTY_PULL',
        direction: 'OUT',
        date: retDate,
        sortMs,
        refDocId: ret.id,
        refNumber: ret.id,
        optionSuffix: opt?.suffix || 'A',
        optionCode: opt?.optionCode || `${code}-A`,
        batchOrLot: item.printedBatchNo || '',
        qtyInSmall: 0,
        qtyOutSmall: qtySmall,
        qtyInLarge: 0,
        qtyOutLarge: qtyLarge,
        actor,
        noteAr: `سحب تالف/مرتجع من مخزن المنتج التام (${ret.id})`,
        noteEn: `Faulty FG pull from warehouse (${ret.id})`,
      };
      entry.movements.push(mov);
      if (opt) opt.movements.push(mov);
    });
  });

  // 5. Sales Orders & Commercial Returns (sales_orders)
  const remainingClientReturnAllowance = {};
  salesOrders.forEach((order) => {
    if (!order) return;
    if (order.confirmationStatus === 'canceled') return;
    if (order.isSplitParent) return;

    const orderType = order.orderType || 'supply';
    const fulfillmentStatus = order.fulfillmentStatus || 'not_yet';
    const isOutboundType = OUTBOUND_ORDER_TYPES.has(orderType);
    const isReturnType = RETURN_ORDER_TYPES.has(orderType);
    if (!isOutboundType && !isReturnType) return;

    const isDispatched = isOutboundType && DISPATCHED_FULFILLMENT_STATUSES.has(fulfillmentStatus);
    const isPreparing = isOutboundType && fulfillmentStatus === 'prepare';
    const isCompletedReturn = isReturnType && COMPLETED_RETURN_STATUSES.has(fulfillmentStatus);

    if (!isDispatched && !isPreparing && !isCompletedReturn) return;

    const orderRef = order.orderNumber || order.id || '';
    const clientDisplay = order.clientName || order.clientNameAr || order.clientCode || '';
    const orderDate =
      (isDispatched && formatDateStr(order.shippedAt || order.dispatchedAt || order.updatedAt || order.orderDate)) ||
      (isCompletedReturn && formatDateStr(order.deliveredAt || order.updatedAt || order.orderDate)) ||
      formatDateStr(order.orderDate || order.createdAt);
    const sortMs = parseTimestampMs(
      (isDispatched && (order.shippedAt || order.dispatchedAt || order.orderDate || order.createdAt)) ||
        (isCompletedReturn && (order.deliveredAt || order.orderDate || order.createdAt)) ||
        order.orderDate ||
        order.createdAt,
      Date.now()
    );
    const actor = resolveActorName(order.updatedBy || order.createdByName || order.createdBy, 'Sales Dispatch');
    const win = classifyDateWindow(orderDate, normStart, normEnd);
    const linkedTd = dispatchByOrderId[order.id] || null;
    const isWarehouseTrackedSettlement =
      Boolean(linkedTd || order.fgWarehouseDispatched) &&
      (Boolean(order.hasPartialRejection) || order.retailSettlementStatus === 'settled');

    (order.lines || []).forEach((line, idx) => {
      const code = String(line.productId || line.finishedProductId || line.productCode || line.code || '').trim();
      const entry = skuMap[code];
      if (!entry) return;

      const opt = resolveOptionForProduct(
        entry,
        line.packagingOptionSuffix || line.optionSuffix,
        line.packagingRatio
      );
      const ratio = Math.max(1, Number(line.packagingRatio || opt?.packagingRatio || entry.packagingRatio || 1));
      const qtyCartons = Number(line.qty || 0);
      const bonusCartons = Number(line.bonus || 0);
      const totalCartons = roundQty(qtyCartons + bonusCartons);

      // Conservation-of-mass: post-dispatch supply orders fulfilled from a truck's precautionary extras
      // or reallocated from on-truck stock were ALREADY deducted from FG stock at gate dispatch; skip double-deduction.
      if (
        isDispatched &&
        orderType === 'supply' &&
        (order.settledFromTripExtras === true || order.isPostDispatchSettlementOrder === true)
      ) {
        return;
      }

      // For Retail Unsold / Partial Rejection linked to Truck Dispatch, hold originally dispatched cartons until WH confirms physical return & stockReturnDate arrives
      if (isDispatched && isWarehouseTrackedSettlement) {
        const origQty = line.dispatchedQty !== undefined ? Number(line.dispatchedQty) : qtyCartons;
        const origBonus = line.dispatchedBonus !== undefined ? Number(line.dispatchedBonus) : bonusCartons;
        const origTotal = roundQty(origQty + origBonus);
        const unsoldExpected = roundQty(Math.max(0, origTotal - totalCartons));
        if (origTotal <= 0) return;
        const origSmall = roundQty(origTotal * ratio);

        applyMovementBucket(entry, 'OUT', 'dispatchedOut', origSmall, origTotal, win);
        if (opt) applyMovementBucket(opt, 'OUT', 'dispatchedOut', origSmall, origTotal, win);

        if (win === 'in_period') {
          const mov = {
            id: `SO-OUT-${order.id}-${idx}`,
            type: 'SALES_DISPATCH',
            direction: 'OUT',
            date: orderDate,
            sortMs,
            refDocId: order.id,
            refNumber: orderRef,
            optionSuffix: opt?.suffix || 'A',
            optionCode: opt?.optionCode || `${code}-A`,
            batchOrLot: clientDisplay,
            qtyInSmall: 0,
            qtyOutSmall: origSmall,
            qtyInLarge: 0,
            qtyOutLarge: origTotal,
            actor,
            noteAr: `صرف مبيعات (${orderRef})${clientDisplay ? ` — ${clientDisplay}` : ''}`,
            noteEn: `Sales Dispatch (${orderRef})${clientDisplay ? ` — ${clientDisplay}` : ''}`,
          };
          entry.movements.push(mov);
          if (opt) opt.movements.push(mov);
        }

        // Physical returned cartons re-enter FG stock upon WH physical receipt (`whReturnConfirmedAt`)
        // gated strictly by `stockReturnDate <= effectiveReturnCutoff` (EOD stocktake deferral stays staged).
        const isWhConfirmed = Boolean(linkedTd?.whReturnConfirmedAt) || linkedTd?.returnHandshakeStatus === 'reconciled';
        if (unsoldExpected > 0 && isWhConfirmed) {
          const colKey = `${code}::${opt?.suffix || 'A'}`;
          const colRec = linkedTd.returnByCol?.[colKey];
          const colAcctCli = Number(colRec?.expectedClientReturns || 0);
          const colWhCli = Number(colRec?.whReceivedClientReturns || 0);
          const ratioCredit = colAcctCli > 0 ? Math.min(1, colWhCli / colAcctCli) : 1;
          const allowKey = `${linkedTd.id}::${colKey}`;
          if (remainingClientReturnAllowance[allowKey] === undefined) {
            remainingClientReturnAllowance[allowKey] =
              colRec && colRec.whReceivedClientReturns !== undefined
                ? roundQty(Number(colRec.whReceivedClientReturns || 0))
                : Infinity;
          }
          const rawEligible = roundQty(unsoldExpected * ratioCredit);
          const creditedCartons = roundQty(
            Math.max(0, Math.min(rawEligible, remainingClientReturnAllowance[allowKey]))
          );
          if (Number.isFinite(remainingClientReturnAllowance[allowKey])) {
            remainingClientReturnAllowance[allowKey] = roundQty(
              remainingClientReturnAllowance[allowKey] - creditedCartons
            );
          }

          if (creditedCartons > 0) {
            const retDate =
              formatDateStr(linkedTd.stockReturnDate || linkedTd.whReturnConfirmedAt || linkedTd.updatedAt || orderDate) ||
              orderDate;
            const retWin = classifyDateWindow(retDate, normStart, effectiveReturnCutoff);
            const retSmall = roundQty(creditedCartons * ratio);
            const retSortMs = parseTimestampMs(
              linkedTd.stockReturnDate || linkedTd.whReturnConfirmedAt || orderDate,
              sortMs + 1
            );
            const retActor = resolveActorName(
              linkedTd.whReturnConfirmedByName || linkedTd.whReturnConfirmedBy,
              'FG Custodian'
            );

            if (retWin === 'after') {
              entry.deferredReturnSmall = roundQty(entry.deferredReturnSmall + retSmall);
              entry.deferredReturnLarge = roundQty(entry.deferredReturnLarge + creditedCartons);
              if (opt) {
                opt.deferredReturnSmall = roundQty(opt.deferredReturnSmall + retSmall);
                opt.deferredReturnLarge = roundQty(opt.deferredReturnLarge + creditedCartons);
              }
            } else {
              applyMovementBucket(entry, 'IN', 'salesReturnedIn', retSmall, creditedCartons, retWin);
              if (opt) applyMovementBucket(opt, 'IN', 'salesReturnedIn', retSmall, creditedCartons, retWin);
            }

            if (retWin === 'in_period') {
              const retMov = {
                id: `TD-CLI-RET-${order.id}-${idx}`,
                type: 'TRIP_CLIENT_RETURN',
                direction: 'IN',
                date: retDate,
                sortMs: retSortMs,
                refDocId: linkedTd.id,
                refNumber: orderRef,
                optionSuffix: opt?.suffix || 'A',
                optionCode: opt?.optionCode || `${code}-A`,
                batchOrLot: clientDisplay,
                qtyInSmall: retSmall,
                qtyOutSmall: 0,
                qtyInLarge: creditedCartons,
                qtyOutLarge: 0,
                actor: retActor,
                noteAr: `مرتجع عميل/تجزئة معتمد مخزنياً (${orderRef})`,
                noteEn: `WH Confirmed Client/Retail Return (${orderRef})`,
              };
              entry.movements.push(retMov);
              if (opt) opt.movements.push(retMov);
            }
          }
        }
        return;
      }

      if (totalCartons <= 0) return;
      const smallQty = roundQty(totalCartons * ratio);

      if (isDispatched) {
        applyMovementBucket(entry, 'OUT', 'dispatchedOut', smallQty, totalCartons, win);
        if (opt) applyMovementBucket(opt, 'OUT', 'dispatchedOut', smallQty, totalCartons, win);

        if (win === 'in_period') {
          const mov = {
            id: `SO-OUT-${order.id}-${idx}`,
            type: 'SALES_DISPATCH',
            direction: 'OUT',
            date: orderDate,
            sortMs,
            refDocId: order.id,
            refNumber: orderRef,
            optionSuffix: opt?.suffix || 'A',
            optionCode: opt?.optionCode || `${code}-A`,
            batchOrLot: clientDisplay,
            qtyInSmall: 0,
            qtyOutSmall: smallQty,
            qtyInLarge: 0,
            qtyOutLarge: totalCartons,
            actor,
            noteAr: `صرف مبيعات (${orderRef})${clientDisplay ? ` — ${clientDisplay}` : ''}`,
            noteEn: `Sales Dispatch (${orderRef})${clientDisplay ? ` — ${clientDisplay}` : ''}`,
          };
          entry.movements.push(mov);
          if (opt) opt.movements.push(mov);
        }
      } else if (isPreparing) {
        const prepItem = {
          orderId: order.id,
          orderNumber: orderRef,
          orderType,
          orderDate: formatDateStr(order.orderDate || order.createdAt),
          clientName: clientDisplay,
          branchName: order.branchName || '',
          optionSuffix: opt?.suffix || 'A',
          qtyCartons: roundQty(qtyCartons),
          bonusCartons: roundQty(bonusCartons),
          totalCartons,
          smallQty,
        };
        entry.preparingSmall = roundQty(entry.preparingSmall + smallQty);
        entry.preparingLarge = roundQty(entry.preparingLarge + totalCartons);
        entry.preparingOrders.push(prepItem);
        if (opt) {
          opt.preparingSmall = roundQty(opt.preparingSmall + smallQty);
          opt.preparingLarge = roundQty(opt.preparingLarge + totalCartons);
          opt.preparingOrders.push(prepItem);
        }
      } else if (isCompletedReturn) {
        applyMovementBucket(entry, 'IN', 'salesReturnedIn', smallQty, totalCartons, win);
        if (opt) applyMovementBucket(opt, 'IN', 'salesReturnedIn', smallQty, totalCartons, win);

        const mov = {
          id: `SO-RET-${order.id}-${idx}`,
          type: 'SALES_RETURN',
          direction: 'IN',
          date: orderDate,
          sortMs,
          refDocId: order.id,
          refNumber: orderRef,
          optionSuffix: opt?.suffix || 'A',
          optionCode: opt?.optionCode || `${code}-A`,
          batchOrLot: clientDisplay,
          qtyInSmall: smallQty,
          qtyOutSmall: 0,
          qtyInLarge: totalCartons,
          qtyOutLarge: 0,
          actor,
          noteAr: `مرتجع مبيعات مستلم بالمخزن (${orderRef})${clientDisplay ? ` — ${clientDisplay}` : ''}`,
          noteEn: `Sales Return Restocked (${orderRef})${clientDisplay ? ` — ${clientDisplay}` : ''}`,
        };
        entry.movements.push(mov);
        if (opt) opt.movements.push(mov);
      }
    });
  });

  // 5.5 Ingest Truck Dispatch Precautionary Extras Out (-) & Reconciled Returned Good Extras (+)
  (truckDispatches || []).forEach((td) => {
    if (!td || td.dispatchStatus === 'cancelled') return;
    const cols = Array.isArray(td.columns) ? td.columns : [];
    const dispDate = formatDateStr(td.dispatchedAt || td.loadingDate || td.createdAt);
    const dispSortMs = parseTimestampMs(td.dispatchedAt || td.loadingDate || td.createdAt, Date.now());
    const dispWin = classifyDateWindow(dispDate, normStart, normEnd);
    const tripLabel = `LO-${td.loadingOrderNumber || '?'} (${td.loadingDate || dispDate})`;
    const dispActor = resolveActorName(td.dispatchedByName || td.dispatchedBy, 'FG Custodian');

    const isWhReturnConfirmed = Boolean(td.whReturnConfirmedAt) || td.returnHandshakeStatus === 'reconciled';
    const retDate = formatDateStr(td.stockReturnDate || td.whReturnConfirmedAt || td.updatedAt || td.loadingDate);
    const retSortMs = parseTimestampMs(td.stockReturnDate || td.whReturnConfirmedAt || td.updatedAt || td.loadingDate, dispSortMs + 1);
    const retWin = classifyDateWindow(retDate, normStart, effectiveReturnCutoff);
    const retActor = resolveActorName(td.whReturnConfirmedByName || td.whReturnConfirmedBy, 'FG Custodian');

    cols.forEach((col, cIdx) => {
      const code = String(col.productCode || col.productId || '').trim();
      const entry = skuMap[code];
      if (!entry) return;

      const opt = resolveOptionForProduct(entry, col.optionSuffix, col.packagingRatio);
      const ratio = Math.max(1, Number(col.packagingRatio || opt?.packagingRatio || entry.packagingRatio || 1));

      const extraCartons = roundQty(Number(col.extraQty || 0));
      if (extraCartons > 0) {
        const extraSmall = roundQty(extraCartons * ratio);
        applyMovementBucket(entry, 'OUT', 'dispatchedOut', extraSmall, extraCartons, dispWin);
        if (opt) applyMovementBucket(opt, 'OUT', 'dispatchedOut', extraSmall, extraCartons, dispWin);

        if (dispWin === 'in_period') {
          const outMov = {
            id: `TD-EXT-OUT-${td.id}-${col.colKey || cIdx}`,
            type: 'TRIP_EXTRAS_OUT',
            direction: 'OUT',
            date: dispDate,
            sortMs: dispSortMs,
            refDocId: td.id,
            refNumber: tripLabel,
            optionSuffix: opt?.suffix || col.optionSuffix || 'A',
            optionCode: opt?.optionCode || col.optionCode || code,
            batchOrLot: td.vehicleName || td.plateNumber || 'Trip Extras',
            qtyInSmall: 0,
            qtyOutSmall: extraSmall,
            qtyInLarge: 0,
            qtyOutLarge: extraCartons,
            actor: dispActor,
            noteAr: `صرف زيادات رحلة (${tripLabel})${td.vehicleName ? ` — ${td.vehicleName}` : ''}`,
            noteEn: `Dispatched Trip Extras (${tripLabel})${td.vehicleName ? ` — ${td.vehicleName}` : ''}`,
          };
          entry.movements.push(outMov);
          if (opt) opt.movements.push(outMov);
        }
      }

      if (isWhReturnConfirmed) {
        const retRow = td.returnByCol?.[col.colKey] || {};
        const goodRetCartons = roundQty(Number(retRow.whReceivedExtras || 0));
        if (goodRetCartons > 0) {
          const retSmall = roundQty(goodRetCartons * ratio);
          if (retWin === 'after') {
            entry.deferredReturnSmall = roundQty(entry.deferredReturnSmall + retSmall);
            entry.deferredReturnLarge = roundQty(entry.deferredReturnLarge + goodRetCartons);
            if (opt) {
              opt.deferredReturnSmall = roundQty(opt.deferredReturnSmall + retSmall);
              opt.deferredReturnLarge = roundQty(opt.deferredReturnLarge + goodRetCartons);
            }
          } else {
            applyMovementBucket(entry, 'IN', 'salesReturnedIn', retSmall, goodRetCartons, retWin);
            if (opt) applyMovementBucket(opt, 'IN', 'salesReturnedIn', retSmall, goodRetCartons, retWin);
          }

          if (retWin === 'in_period') {
            const inMov = {
              id: `TD-EXT-IN-${td.id}-${col.colKey || cIdx}`,
              type: 'TRIP_EXTRAS_RETURN',
              direction: 'IN',
              date: retDate,
              sortMs: retSortMs,
              refDocId: td.id,
              refNumber: tripLabel,
              optionSuffix: opt?.suffix || col.optionSuffix || 'A',
              optionCode: opt?.optionCode || col.optionCode || code,
              batchOrLot: td.vehicleName || td.plateNumber || 'Returned Extras',
              qtyInSmall: retSmall,
              qtyOutSmall: 0,
              qtyInLarge: goodRetCartons,
              qtyOutLarge: 0,
              actor: retActor,
              noteAr: `استلام مرتجع زيادات رحلة سليمة (${tripLabel})`,
              noteEn: `Returned Good Trip Extras (${tripLabel})`,
            };
            entry.movements.push(inMov);
            if (opt) opt.movements.push(inMov);
          }
        }
      }
    });
  });

  // 6. Finalize per-SKU & per-Option Net Balances, Valuation, Health Status, and Chronological Kardex
  const totals = {
    totalSkus: 0,
    activeSkus: 0,
    physicalOnHandSmall: 0,
    physicalOnHandLarge: 0,
    preparingSmall: 0,
    preparingLarge: 0,
    netAvailableSmall: 0,
    netAvailableLarge: 0,
    pendingTransferSmall: 0,
    pendingTransferLarge: 0,
    stagedOnFloorSmall: 0,
    stagedOnFloorLarge: 0,
    lowStockCount: 0,
    outOrNegativeCount: 0,
    totalStockValue: 0,
  };

  const sortAndComputeRunning = (movements) => {
    const sorted = [...movements].sort((a, b) => {
      if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs;
      const pA = MOVEMENT_TYPE_PRIORITY[a.type] || 99;
      const pB = MOVEMENT_TYPE_PRIORITY[b.type] || 99;
      if (pA !== pB) return pA - pB;
      return String(a.id).localeCompare(String(b.id));
    });
    let runSmall = 0;
    let runLarge = 0;
    return sorted.map((m) => {
      runSmall = roundQty(runSmall + m.qtyInSmall - m.qtyOutSmall);
      runLarge = roundQty(runLarge + m.qtyInLarge - m.qtyOutLarge);
      return { ...m, runningSmall: runSmall, runningLarge: runLarge };
    });
  };

  const skuList = Object.values(skuMap).map((entry) => {
    entry.optionsBreakdown.forEach((opt) => {
      finalizeOptionMetrics(opt);
      opt.movements = sortAndComputeRunning(opt.movements);
    });

    entry.openingSmall = roundQty(entry.catalogOpeningSmall + entry.priorNetSmall);
    entry.openingLarge = roundQty(entry.catalogOpeningLarge + entry.priorNetLarge);

    entry.physicalOnHandSmall = roundQty(
      entry.openingSmall +
        entry.producedInSmall +
        entry.salesReturnedInSmall -
        entry.dispatchedOutSmall -
        entry.faultyOutSmall
    );
    entry.physicalOnHandLarge = roundQty(
      entry.openingLarge +
        entry.producedInLarge +
        entry.salesReturnedInLarge -
        entry.dispatchedOutLarge -
        entry.faultyOutLarge
    );

    entry.netAvailableSmall = roundQty(entry.physicalOnHandSmall - entry.preparingSmall);
    entry.netAvailableLarge = roundQty(entry.physicalOnHandLarge - entry.preparingLarge);

    // Weighted Average Valuation
    entry.avgCostPerSmall =
      entry.totalInwardSmallQty > 0
        ? Math.round((entry.totalInwardCost / entry.totalInwardSmallQty) * 10000) / 10000
        : 0;
    entry.avgCostPerLarge = roundQty(entry.avgCostPerSmall * entry.packagingRatio);
    entry.stockValue =
      entry.physicalOnHandSmall > 0 && entry.avgCostPerSmall > 0
        ? Math.round(entry.physicalOnHandSmall * entry.avgCostPerSmall * 100) / 100
        : 0;

    // Health Flag
    if (entry.physicalOnHandSmall < 0 || entry.netAvailableSmall < 0) {
      entry.healthStatus = 'negative';
    } else if (entry.physicalOnHandSmall <= 0) {
      entry.healthStatus = 'out';
    } else if (entry.reorderLevel > 0 && entry.physicalOnHandSmall <= entry.reorderLevel) {
      entry.healthStatus = 'low';
    } else {
      entry.healthStatus = 'ok';
    }

    entry.movements = sortAndComputeRunning(entry.movements);

    // Update totals
    totals.totalSkus += 1;
    if (entry.status !== 'inactive') totals.activeSkus += 1;
    totals.physicalOnHandSmall = roundQty(totals.physicalOnHandSmall + entry.physicalOnHandSmall);
    totals.physicalOnHandLarge = roundQty(totals.physicalOnHandLarge + entry.physicalOnHandLarge);
    totals.preparingSmall = roundQty(totals.preparingSmall + entry.preparingSmall);
    totals.preparingLarge = roundQty(totals.preparingLarge + entry.preparingLarge);
    totals.netAvailableSmall = roundQty(totals.netAvailableSmall + entry.netAvailableSmall);
    totals.netAvailableLarge = roundQty(totals.netAvailableLarge + entry.netAvailableLarge);
    totals.pendingTransferSmall = roundQty(totals.pendingTransferSmall + entry.pendingTransferSmall);
    totals.pendingTransferLarge = roundQty(totals.pendingTransferLarge + entry.pendingTransferLarge);
    totals.stagedOnFloorSmall = roundQty(totals.stagedOnFloorSmall + entry.stagedOnFloorSmall);
    totals.stagedOnFloorLarge = roundQty(totals.stagedOnFloorLarge + entry.stagedOnFloorLarge);
    totals.totalStockValue = Math.round((totals.totalStockValue + entry.stockValue) * 100) / 100;

    if (entry.healthStatus === 'low') totals.lowStockCount += 1;
    if (entry.healthStatus === 'out' || entry.healthStatus === 'negative') totals.outOrNegativeCount += 1;

    return entry;
  });

  skuList.sort((a, b) => a.code.localeCompare(b.code));

  return { skuList, skuMap, totals, period: { startDate: normStart, endDate: normEnd } };
}

/**
 * Convenience accessor returning the Kardex ledger for a specific SKU code.
 */
export function buildFgProductKardex(skuCode, dataSources = {}) {
  const { skuMap } = buildFgStockMatrix(dataSources);
  return skuMap[skuCode]?.movements || [];
}

function shiftDateStr(dateStr, deltaDays) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }
  const [y, m, day] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function upsertClientChip(list, { clientId, clientName, qtyCartons, orderNumber, optionSuffix }) {
  const cleanName = String(clientName || '').trim() || '—';
  const key = `${clientId || cleanName}::${optionSuffix || 'A'}`;
  const existing = list.find((c) => c._key === key);
  if (existing) {
    existing.qtyCartons = roundQty(existing.qtyCartons + qtyCartons);
    if (orderNumber && !existing.orderNumbers.includes(orderNumber)) {
      existing.orderNumbers.push(orderNumber);
    }
  } else {
    list.push({
      _key: key,
      clientId: clientId || '',
      clientName: cleanName,
      qtyCartons: roundQty(qtyCartons),
      orderNumbers: orderNumber ? [orderNumber] : [],
      optionSuffix: optionSuffix || 'A',
    });
  }
}

function createEmptyForecastBucket({
  key,
  code,
  optionCode = '',
  suffix = '',
  nameAr,
  nameEn,
  largeUnitName,
  smallUnit,
  packagingRatio,
  imageFile = '',
  status = 'active',
  isAnyPool = false,
}) {
  return {
    key,
    code,
    optionCode,
    suffix,
    nameAr,
    nameEn,
    largeUnitName,
    smallUnit,
    packagingRatio,
    imageFile,
    status,
    isAnyPool,
    livePhysicalCartons: 0,
    prevDayClosingCartons: 0,
    dispatchedOnTargetDayCartons: 0,
    inwardOnTargetDayCartons: 0,
    openingCartons: 0,
    intermediateProdCartons: 0,
    intermediateReturnCartons: 0,
    intermediateDemandCartons: 0,
    currentBalanceCartons: 0,
    preparingCartons: 0,
    orderedCartons: 0,
    plannedProdCartons: 0,
    plannedReturnCartons: 0,
    plannedTripExtrasCartons: 0, // Reserved hook for future Trip Dispatch Extras Slips
    netProjectedCartons: 0,
    deficitCartons: 0,
    hasOptionDeficit: false,
    preparingClients: [],
    orderedClients: [],
    plannedWorkOrders: [],
    plannedReturnOrders: [],
    options: [],
  };
}

function finalizeForecastRow(bucket, isFutureTarget, skuNetCartonsForAnyCheck = null) {
  bucket.livePhysicalCartons = roundQty(bucket.livePhysicalCartons);
  bucket.prevDayClosingCartons = roundQty(bucket.prevDayClosingCartons);
  bucket.dispatchedOnTargetDayCartons = roundQty(bucket.dispatchedOnTargetDayCartons);
  bucket.inwardOnTargetDayCartons = roundQty(bucket.inwardOnTargetDayCartons);

  if (isFutureTarget) {
    // Future date Opening = Live Physical Stock + Intermediate Planned Prod + Intermediate Returns - Intermediate Open Orders
    bucket.openingCartons = roundQty(
      bucket.livePhysicalCartons +
        bucket.intermediateProdCartons +
        bucket.intermediateReturnCartons -
        bucket.intermediateDemandCartons
    );
    bucket.currentBalanceCartons = bucket.openingCartons;
  } else {
    // Today / Past Opening = Closing Balance of previous day (so mid-day dispatches preserve opening while liveCurrent reflects real-time warehouse stock)
    bucket.openingCartons = bucket.prevDayClosingCartons;
    bucket.currentBalanceCartons = bucket.livePhysicalCartons;
  }

  bucket.preparingCartons = roundQty(bucket.preparingCartons);
  bucket.orderedCartons = roundQty(bucket.orderedCartons);
  bucket.plannedProdCartons = roundQty(bucket.plannedProdCartons);
  bucket.plannedReturnCartons = roundQty(bucket.plannedReturnCartons);
  bucket.plannedTripExtrasCartons = roundQty(bucket.plannedTripExtrasCartons);

  const baseForTargetProjection = isFutureTarget ? bucket.openingCartons : bucket.livePhysicalCartons;
  bucket.netProjectedCartons = roundQty(
    baseForTargetProjection +
      bucket.plannedProdCartons +
      bucket.plannedReturnCartons +
      bucket.plannedTripExtrasCartons -
      bucket.preparingCartons -
      bucket.orderedCartons
  );

  // For Flexible ('ANY') pools in option breakdown, only flag deficit if SKU total is also short
  if (bucket.isAnyPool && skuNetCartonsForAnyCheck !== null && skuNetCartonsForAnyCheck >= 0) {
    bucket.deficitCartons = 0;
  } else {
    bucket.deficitCartons = bucket.netProjectedCartons < 0 ? roundQty(Math.abs(bucket.netProjectedCartons)) : 0;
  }

  bucket.preparingClients.sort((a, b) => b.qtyCartons - a.qtyCartons);
  bucket.orderedClients.sort((a, b) => b.qtyCartons - a.qtyCartons);
}

function sortForecastRows(rows) {
  return [...rows].sort((a, b) => {
    // 1. Deficits on top (direct shortfall or sub-option shortfall), largest deficit first
    const aDef = a.deficitCartons > 0 ? 2 : a.hasOptionDeficit ? 1 : 0;
    const bDef = b.deficitCartons > 0 ? 2 : b.hasOptionDeficit ? 1 : 0;
    if (aDef !== bDef) return bDef - aDef;
    if (aDef === 2 && a.deficitCartons !== b.deficitCartons) return b.deficitCartons - a.deficitCartons;

    // 2. Second priority: products/options with active unfulfilled orders (preparing + ordered > 0)
    const aActive = a.preparingCartons + a.orderedCartons;
    const bActive = b.preparingCartons + b.orderedCartons;
    const aHasOrd = aActive > 0 ? 1 : 0;
    const bHasOrd = bActive > 0 ? 1 : 0;
    if (aHasOrd !== bHasOrd) return bHasOrd - aHasOrd;
    if (aHasOrd === 1 && aActive !== bActive) return bActive - aActive;

    // 3. Remaining idle products ordered cleanly by Arabic/English name & code
    return String(a.code).localeCompare(String(b.code));
  });
}

function buildAcceptedQtyByWo(stagedPallets = []) {
  const acceptedQtyByWo = {};
  stagedPallets.forEach((p) => {
    const isAcceptedFg =
      p.status === 'transferred_to_fg' ||
      p.status === 'accepted_in_fg' ||
      p.stagingStatus === 'transferred_to_fg';
    if (!isAcceptedFg) return;
    const qtyLarge = Number(p.qtyLarge || 0);
    if (qtyLarge <= 0) return;
    if (p.workOrderId) {
      acceptedQtyByWo[p.workOrderId] = (acceptedQtyByWo[p.workOrderId] || 0) + qtyLarge;
    }
    if (p.orderNumber) {
      acceptedQtyByWo[`ORD:${p.orderNumber}`] = (acceptedQtyByWo[`ORD:${p.orderNumber}`] || 0) + qtyLarge;
    }
  });
  return acceptedQtyByWo;
}

/**
 * Computes Loading Plan FG Stock & Deficit Forecast for targetPlanningDate.
 * - Strictly Cartons (no Tons/Weight).
 * - Accounts for livePhysicalOnHand, previous-day closing (for Today/Past true Opening),
 *   cumulative forward simulation (for Future target dates), live unsaved stagedAssignments,
 *   remaining un-accepted work_orders, and scheduled commercial sales_returns.
 */
export function buildLoadingPlanFgForecast({
  finishedProducts = [],
  stagedPallets = [],
  stockTransfers = [],
  faultyReturns = [],
  salesOrders = [],
  workOrders = [],
  truckDispatches = [],
  stagedAssignments = {},
  targetPlanningDate = '',
  todayStr = '',
} = {}) {
  const effToday = formatDateStr(todayStr) || new Date().toISOString().slice(0, 10);
  const effTarget = formatDateStr(targetPlanningDate) || effToday;
  const prevDayStr = shiftDateStr(effTarget, -1);
  const isFutureTarget = effTarget > effToday;

  const liveMatrix = buildFgStockMatrix({
    finishedProducts,
    stagedPallets,
    stockTransfers,
    faultyReturns,
    salesOrders,
    truckDispatches,
    todayStr: effToday,
  });

  const prevDayMatrix = isFutureTarget
    ? null
    : buildFgStockMatrix({
        finishedProducts,
        stagedPallets,
        stockTransfers,
        faultyReturns,
        salesOrders,
        truckDispatches,
        endDate: prevDayStr,
        todayStr: effToday,
      });

  // Track already-accepted FG pallet quantities per workOrderId / orderNumber so active Work Orders don't double-count accepted production
  const acceptedQtyByWo = buildAcceptedQtyByWo(stagedPallets);

  // Seed SKU and Option forecast buckets from live & prev-day SSOT matrices
  const skuForecastMap = {};
  liveMatrix.skuList.forEach((sku) => {
    const prevSku = prevDayMatrix?.skuMap?.[sku.code];
    const row = createEmptyForecastBucket({
      key: sku.code,
      code: sku.code,
      nameAr: sku.nameAr,
      nameEn: sku.nameEn,
      largeUnitName: sku.largeUnitName,
      smallUnit: sku.smallUnit,
      packagingRatio: sku.packagingRatio,
      imageFile: sku.imageFile,
      status: sku.status,
    });
    row.livePhysicalCartons = sku.physicalOnHandLarge;
    row.prevDayClosingCartons = prevSku ? prevSku.physicalOnHandLarge : sku.physicalOnHandLarge;

    (sku.optionsBreakdown || []).forEach((opt) => {
      const prevOpt = (prevSku?.optionsBreakdown || []).find((po) => po.suffix === opt.suffix);
      const optRow = createEmptyForecastBucket({
        key: `${sku.code}::${opt.suffix}`,
        code: sku.code,
        optionCode: opt.optionCode,
        suffix: opt.suffix,
        nameAr: `${sku.nameAr} — ${opt.nameAr}`,
        nameEn: `${sku.nameEn || sku.nameAr} — ${opt.nameEn || opt.nameAr}`,
        largeUnitName: sku.largeUnitName,
        smallUnit: sku.smallUnit,
        packagingRatio: opt.packagingRatio,
        imageFile: opt.imageFile || sku.imageFile,
        status: opt.isActive ? sku.status : 'inactive',
        isAnyPool: opt.isAnyPool,
      });
      optRow.optionNameAr = opt.nameAr;
      optRow.optionNameEn = opt.nameEn;
      optRow.livePhysicalCartons = opt.physicalOnHandLarge;
      optRow.prevDayClosingCartons = prevOpt ? prevOpt.physicalOnHandLarge : opt.physicalOnHandLarge;
      row.options.push(optRow);
    });

    skuForecastMap[sku.code] = row;
  });

  const findOptBucket = (skuRow, suffixHint, ratioHint) => {
    const realOpts = skuRow.options.filter((o) => !o.isAnyPool);
    if (realOpts.length === 0) return null;
    if (suffixHint) {
      const norm = String(suffixHint).trim().toUpperCase();
      if (norm === 'ANY') {
        if (realOpts.length === 1) return realOpts[0];
        let anyOpt = skuRow.options.find((o) => o.isAnyPool);
        if (!anyOpt) {
          anyOpt = createEmptyForecastBucket({
            key: `${skuRow.code}::ANY`,
            code: skuRow.code,
            optionCode: `${skuRow.code}-ANY`,
            suffix: 'ANY',
            nameAr: `${skuRow.nameAr} — أي تعبئة (Any)`,
            nameEn: `${skuRow.nameEn} — Any Packing`,
            largeUnitName: skuRow.largeUnitName,
            smallUnit: skuRow.smallUnit,
            packagingRatio: skuRow.packagingRatio,
            imageFile: skuRow.imageFile,
            status: skuRow.status,
            isAnyPool: true,
          });
          anyOpt.optionNameAr = 'أي تعبئة (Any)';
          anyOpt.optionNameEn = 'Any Packing';
          skuRow.options.push(anyOpt);
        }
        return anyOpt;
      }
      const match = realOpts.find((o) => o.suffix === norm || o.optionCode === norm);
      if (match) return match;
    }
    const r = Number(ratioHint || 0);
    if (r > 0) {
      const byRatio = realOpts.find((o) => o.packagingRatio === r);
      if (byRatio) return byRatio;
    }
    return realOpts[0];
  };

  // Ingest Remaining Active Work Orders (Planned Production +)
  workOrders.forEach((wo) => {
    if (!wo || wo.status === 'cancelled' || wo.status === 'completed') return;
    const planDate = formatDateStr(wo.planDate || wo.productionDate || wo.orderDate);
    if (!planDate || planDate > effTarget) return;

    const code = String(wo.finishedProductId || wo.productCode || '').trim();
    const skuRow = skuForecastMap[code];
    if (!skuRow) return;

    const ratio = Math.max(1, Number(wo.packagingRatio || skuRow.packagingRatio || 1));
    const plannedCartons =
      Number(wo.plannedQtyLarge || 0) > 0
        ? Number(wo.plannedQtyLarge)
        : roundQty(Number(wo.plannedQtySmall || 0) / ratio);
    const alreadyAccepted =
      acceptedQtyByWo[wo.id] ?? (wo.orderNumber ? acceptedQtyByWo[`ORD:${wo.orderNumber}`] || 0 : 0);
    const remainingCartons = roundQty(Math.max(0, plannedCartons - alreadyAccepted));
    if (remainingCartons <= 0) return;

    const optRow = findOptBucket(skuRow, wo.packagingOptionSuffix || wo.optionSuffix, wo.packagingRatio);

    if (isFutureTarget && planDate >= effToday && planDate < effTarget) {
      skuRow.intermediateProdCartons = roundQty(skuRow.intermediateProdCartons + remainingCartons);
      if (optRow) optRow.intermediateProdCartons = roundQty(optRow.intermediateProdCartons + remainingCartons);
    } else if (planDate === effTarget) {
      const woInfo = {
        workOrderId: wo.id,
        workOrderNumber: wo.orderNumber || wo.id,
        remainingCartons,
        status: wo.status || 'pending',
        optionSuffix: optRow?.suffix || 'A',
      };
      skuRow.plannedProdCartons = roundQty(skuRow.plannedProdCartons + remainingCartons);
      skuRow.plannedWorkOrders.push(woInfo);
      if (optRow) {
        optRow.plannedProdCartons = roundQty(optRow.plannedProdCartons + remainingCartons);
        optRow.plannedWorkOrders.push(woInfo);
      }
    }
  });

  // Ingest Sales Orders (Preparing, Pending Ordered, Dispatched-on-Target-Day context, & Scheduled Returns +) with live stagedAssignments overlay
  salesOrders.forEach((order) => {
    if (!order || order.confirmationStatus === 'canceled' || order.isSplitParent) return;
    const orderType = order.orderType || 'supply';
    const isOutboundType = OUTBOUND_ORDER_TYPES.has(orderType);
    const isReturnType = RETURN_ORDER_TYPES.has(orderType);
    if (!isOutboundType && !isReturnType) return;

    const staged = stagedAssignments?.[order.id];
    const effStatus = staged?.fulfillmentStatus || order.fulfillmentStatus || 'not_yet';
    const effDate = formatDateStr(staged?.loadingDate || order.loadingDate || order.invoiceDate || effToday) || effToday;
    const clientName = order.clientName || order.clientNameAr || order.branchName || order.clientCode || '—';
    const orderRef = order.orderNumber || order.id;

    // Context check: orders dispatched ON targetPlanningDate (already deducted from livePhysical)
    if (!isFutureTarget && isOutboundType && DISPATCHED_FULFILLMENT_STATUSES.has(effStatus)) {
      const dispDate = formatDateStr(order.shippedAt || order.dispatchedAt || order.loadingDate || order.orderDate);
      if (dispDate === effTarget) {
        (order.lines || []).forEach((line) => {
          const code = String(line.productId || line.finishedProductId || line.productCode || line.code || '').trim();
          const skuRow = skuForecastMap[code];
          if (!skuRow) return;
          const totalCartons = roundQty(Number(line.qty || 0) + Number(line.bonus || 0));
          if (totalCartons <= 0) return;
          const optRow = findOptBucket(skuRow, line.packagingOptionSuffix || line.optionSuffix, line.packagingRatio);
          skuRow.dispatchedOnTargetDayCartons = roundQty(skuRow.dispatchedOnTargetDayCartons + totalCartons);
          if (optRow) optRow.dispatchedOnTargetDayCartons = roundQty(optRow.dispatchedOnTargetDayCartons + totalCartons);
        });
      }
      return;
    }

    // Scheduled Sales Returns (+ Planned Return inflow before/on targetPlanningDate)
    if (isReturnType && ['not_yet', 'prepare', 'shipped'].includes(effStatus)) {
      if (effDate > effTarget) return;
      (order.lines || []).forEach((line) => {
        const code = String(line.productId || line.finishedProductId || line.productCode || line.code || '').trim();
        const skuRow = skuForecastMap[code];
        if (!skuRow) return;
        const totalCartons = roundQty(Number(line.qty || 0) + Number(line.bonus || 0));
        if (totalCartons <= 0) return;
        const optRow = findOptBucket(skuRow, line.packagingOptionSuffix || line.optionSuffix, line.packagingRatio);

        if (isFutureTarget && effDate < effTarget) {
          skuRow.intermediateReturnCartons = roundQty(skuRow.intermediateReturnCartons + totalCartons);
          if (optRow) optRow.intermediateReturnCartons = roundQty(optRow.intermediateReturnCartons + totalCartons);
        } else if ((!isFutureTarget && effDate <= effTarget) || (isFutureTarget && effDate === effTarget)) {
          const retItem = {
            orderId: order.id,
            orderNumber: orderRef,
            clientName,
            qtyCartons: totalCartons,
            optionSuffix: optRow?.suffix || 'A',
          };
          skuRow.plannedReturnCartons = roundQty(skuRow.plannedReturnCartons + totalCartons);
          skuRow.plannedReturnOrders.push(retItem);
          if (optRow) {
            optRow.plannedReturnCartons = roundQty(optRow.plannedReturnCartons + totalCartons);
            optRow.plannedReturnOrders.push(retItem);
          }
        }
      });
      return;
    }

    // Open Outbound Demand (Pending `not_yet` and Preparing `prepare`)
    if (isOutboundType && (effStatus === 'not_yet' || effStatus === 'prepare')) {
      if (effDate > effTarget) return;
      const isTargetDayDemand = isFutureTarget ? effDate === effTarget : effDate <= effTarget;
      const isIntermediateDemand = isFutureTarget && effDate < effTarget;

      (order.lines || []).forEach((line) => {
        const code = String(line.productId || line.finishedProductId || line.productCode || line.code || '').trim();
        const skuRow = skuForecastMap[code];
        if (!skuRow) return;
        const totalCartons = roundQty(Number(line.qty || 0) + Number(line.bonus || 0));
        if (totalCartons <= 0) return;
        const optRow = findOptBucket(skuRow, line.packagingOptionSuffix || line.optionSuffix, line.packagingRatio);
        const optSuffix = optRow?.suffix || 'A';

        if (isIntermediateDemand) {
          skuRow.intermediateDemandCartons = roundQty(skuRow.intermediateDemandCartons + totalCartons);
          if (optRow) optRow.intermediateDemandCartons = roundQty(optRow.intermediateDemandCartons + totalCartons);
        } else if (isTargetDayDemand) {
          const chipPayload = {
            clientId: order.clientId,
            clientName,
            qtyCartons: totalCartons,
            orderNumber: orderRef,
            optionSuffix: optSuffix,
          };
          if (effStatus === 'prepare') {
            skuRow.preparingCartons = roundQty(skuRow.preparingCartons + totalCartons);
            upsertClientChip(skuRow.preparingClients, chipPayload);
            if (optRow) {
              optRow.preparingCartons = roundQty(optRow.preparingCartons + totalCartons);
              upsertClientChip(optRow.preparingClients, chipPayload);
            }
          } else {
            skuRow.orderedCartons = roundQty(skuRow.orderedCartons + totalCartons);
            upsertClientChip(skuRow.orderedClients, chipPayload);
            if (optRow) {
              optRow.orderedCartons = roundQty(optRow.orderedCartons + totalCartons);
              upsertClientChip(optRow.orderedClients, chipPayload);
            }
          }
        }
      });
    }
  });

  // Ingest Unsettled Truck Dispatch Extras AND EOD-Deferred (`stockReturnDate > effToday`) WH-Confirmed / Reconciled Returns
  (truckDispatches || []).forEach((td) => {
    if (!td || td.dispatchStatus === 'cancelled') return;
    const tdDate = formatDateStr(td.loadingDate || td.dispatchedAt || td.createdAt) || effToday;
    const isWhReturnConfirmed = Boolean(td.whReturnConfirmedAt) || td.returnHandshakeStatus === 'reconciled';
    const stockRetDate = formatDateStr(td.stockReturnDate || td.whReturnConfirmedAt || tdDate) || tdDate;

    // Case A: WH-Confirmed / Reconciled return whose stockReturnDate is strictly AFTER effToday (deferred for EOD stocktake/جرد)
    if (isWhReturnConfirmed) {
      if (stockRetDate > effToday && stockRetDate <= effTarget) {
        (td.columns || []).forEach((col) => {
          const code = String(col.productCode || col.productId || '').trim();
          const skuRow = skuForecastMap[code];
          if (!skuRow) return;
          const retEntry = td.returnByCol?.[col.colKey] || {};
          const scheduledRetQty = roundQty(
            Number(retEntry.whReceivedExtras || 0) + Number(retEntry.whReceivedClientReturns || 0)
          );
          if (scheduledRetQty <= 0) return;

          const optRow = findOptBucket(skuRow, col.optionSuffix, col.packagingRatio);
          if (isFutureTarget && stockRetDate < effTarget) {
            skuRow.intermediateReturnCartons = roundQty(skuRow.intermediateReturnCartons + scheduledRetQty);
            if (optRow) optRow.intermediateReturnCartons = roundQty(optRow.intermediateReturnCartons + scheduledRetQty);
          } else if (stockRetDate === effTarget) {
            skuRow.plannedTripExtrasCartons = roundQty(skuRow.plannedTripExtrasCartons + scheduledRetQty);
            if (optRow) optRow.plannedTripExtrasCartons = roundQty(optRow.plannedTripExtrasCartons + scheduledRetQty);
          }
        });
      }
      return;
    }

    // Case B: Unreconciled active trip extras still expected back on road
    if (tdDate > effTarget) return;

    (td.columns || []).forEach((col) => {
      const code = String(col.productCode || col.productId || '').trim();
      const skuRow = skuForecastMap[code];
      if (!skuRow) return;
      const extraQty = roundQty(Number(col.extraQty || 0));
      if (extraQty <= 0) return;

      const optRow = findOptBucket(skuRow, col.optionSuffix, col.packagingRatio);
      if (isFutureTarget && tdDate < effTarget) {
        skuRow.intermediateReturnCartons = roundQty(skuRow.intermediateReturnCartons + extraQty);
        if (optRow) optRow.intermediateReturnCartons = roundQty(optRow.intermediateReturnCartons + extraQty);
      } else {
        skuRow.plannedTripExtrasCartons = roundQty(skuRow.plannedTripExtrasCartons + extraQty);
        if (optRow) optRow.plannedTripExtrasCartons = roundQty(optRow.plannedTripExtrasCartons + extraQty);
      }
    });
  });

  // Finalize all SKU and Option forecast rows
  const rawSkuRows = [];
  const rawPackingRows = [];

  Object.values(skuForecastMap).forEach((skuRow) => {
    finalizeForecastRow(skuRow, isFutureTarget);

    let subOptionDeficit = false;
    skuRow.options.forEach((optRow) => {
      finalizeForecastRow(optRow, isFutureTarget, skuRow.netProjectedCartons);
      if (!optRow.isAnyPool && optRow.deficitCartons > 0) {
        subOptionDeficit = true;
      }
      if (optRow.status !== 'inactive' || optRow.currentBalanceCartons !== 0 || optRow.preparingCartons > 0 || optRow.orderedCartons > 0 || optRow.deficitCartons > 0) {
        rawPackingRows.push(optRow);
      }
    });

    skuRow.hasOptionDeficit = subOptionDeficit;
    if (skuRow.status !== 'inactive' || skuRow.currentBalanceCartons !== 0 || skuRow.preparingCartons > 0 || skuRow.orderedCartons > 0 || skuRow.deficitCartons > 0) {
      rawSkuRows.push(skuRow);
    }
  });

  const skuRows = sortForecastRows(rawSkuRows);
  const packingRows = sortForecastRows(rawPackingRows);

  const summary = {
    targetPlanningDate: effTarget,
    prevDayStr,
    isFutureTarget,
    deficitSkuCount: skuRows.filter((r) => r.deficitCartons > 0 || r.hasOptionDeficit).length,
    deficitPackingCount: packingRows.filter((r) => r.deficitCartons > 0).length,
    activeOrderSkuCount: skuRows.filter((r) => r.preparingCartons + r.orderedCartons > 0).length,
    totalShortfallCartons: roundQty(skuRows.reduce((s, r) => s + r.deficitCartons, 0)),
  };

  return { skuRows, packingRows, summary };
}

/**
 * Computes per-order and per-line sequential FG stock availability across the Loading Plan queue.
 * - Priority sequence: Effective Date (asc) -> Prepared (`prepare`) before Ordered (`not_yet`)
 *   -> Trip # (`loadingOrderNumber`, ascending, unassigned last) -> Serial # (asc).
 * - Supply pool: Live Physical FG On-Hand for today/past dates; Future dates (> todayStr)
 *   progressively unlock remaining active work_orders & scheduled returns on <= orderDate.
 * - Packing options: Strict A/B pool matching when specified; 'Any' draws from remaining SKU pools.
 * - Threshold tiers: Green (100% / ALL Available), Amber (50%–99%), Red (0%–49%).
 */
export function buildOrderTripAvailabilityMap({
  finishedProducts = [],
  stagedPallets = [],
  stockTransfers = [],
  faultyReturns = [],
  salesOrders = [],
  workOrders = [],
  truckDispatches = [],
  stagedAssignments = {},
  todayStr = '',
} = {}) {
  const effToday = formatDateStr(todayStr) || new Date().toISOString().slice(0, 10);

  const liveMatrix = buildFgStockMatrix({
    finishedProducts,
    stagedPallets,
    stockTransfers,
    faultyReturns,
    salesOrders,
    truckDispatches,
    todayStr: effToday,
  });

  // 1. Seed per-SKU, per-Option physical stock pools & lookup aliases
  const skuPools = {};
  const skuOptMeta = {};
  const prodAliasMap = {};

  (finishedProducts || []).forEach((p) => {
    const canon = String(p.code || p.itemCode || p.id || '').trim();
    if (!canon) return;
    [p.id, p.code, p.itemCode].forEach((k) => {
      if (k) prodAliasMap[String(k).trim()] = canon;
    });
  });

  liveMatrix.skuList.forEach((sku) => {
    prodAliasMap[sku.code] = sku.code;
    skuPools[sku.code] = {};
    skuOptMeta[sku.code] = [];
    const realOpts = (sku.optionsBreakdown || []).filter((o) => !o.isAnyPool);
    realOpts.forEach((opt) => {
      skuPools[sku.code][opt.suffix] = roundQty(opt.physicalOnHandLarge || 0);
      skuOptMeta[sku.code].push({
        suffix: opt.suffix,
        optionCode: opt.optionCode || `${sku.code}-${opt.suffix}`,
        packagingRatio: opt.packagingRatio || sku.packagingRatio || 1,
      });
    });
    if (skuOptMeta[sku.code].length === 0) {
      skuPools[sku.code].A = roundQty(sku.physicalOnHandLarge || 0);
      skuOptMeta[sku.code].push({
        suffix: 'A',
        optionCode: `${sku.code}-A`,
        packagingRatio: sku.packagingRatio || 1,
      });
    }
  });

  const resolveCanonicalSku = (rawIdOrCode) => {
    const raw = String(rawIdOrCode || '').trim();
    return prodAliasMap[raw] || (skuPools[raw] ? raw : '');
  };

  const resolveOptionKey = (skuCode, suffixHint, ratioHint) => {
    const metas = skuOptMeta[skuCode] || [];
    if (metas.length === 0) return 'A';
    if (suffixHint) {
      const norm = String(suffixHint).trim().toUpperCase();
      if (norm === 'ANY') {
        return metas.length === 1 ? metas[0].suffix : 'ANY';
      }
      const match = metas.find((m) => m.suffix === norm || m.optionCode === norm);
      if (match) return match.suffix;
    }
    const r = Number(ratioHint || 0);
    if (r > 0) {
      const byRatio = metas.find((m) => m.packagingRatio === r);
      if (byRatio) return byRatio.suffix;
    }
    return metas[0].suffix;
  };

  // 2. Collect Future Planned Inflows (> todayStr only): active WOs + scheduled returns
  const acceptedQtyByWo = buildAcceptedQtyByWo(stagedPallets);
  const futureInflowsByDate = {};
  const addFutureInflow = (dateStr, skuCode, optKey, qtyCartons) => {
    if (!dateStr || dateStr <= effToday || !skuCode || qtyCartons <= 0) return;
    if (!futureInflowsByDate[dateStr]) futureInflowsByDate[dateStr] = [];
    const targetOpt = optKey === 'ANY' ? (skuOptMeta[skuCode]?.[0]?.suffix || 'A') : optKey;
    futureInflowsByDate[dateStr].push({ skuCode, optKey: targetOpt, qtyCartons });
  };

  workOrders.forEach((wo) => {
    if (!wo || wo.status === 'cancelled' || wo.status === 'completed') return;
    const planDate = formatDateStr(wo.planDate || wo.productionDate || wo.orderDate);
    if (!planDate || planDate <= effToday) return;
    const skuCode = resolveCanonicalSku(wo.finishedProductId || wo.productCode);
    if (!skuCode) return;
    const baseRatio = Math.max(1, Number(wo.packagingRatio || skuOptMeta[skuCode]?.[0]?.packagingRatio || 1));
    const plannedCartons =
      Number(wo.plannedQtyLarge || 0) > 0
        ? Number(wo.plannedQtyLarge)
        : roundQty(Number(wo.plannedQtySmall || 0) / baseRatio);
    const alreadyAccepted =
      acceptedQtyByWo[wo.id] ?? (wo.orderNumber ? acceptedQtyByWo[`ORD:${wo.orderNumber}`] || 0 : 0);
    const remaining = roundQty(Math.max(0, plannedCartons - alreadyAccepted));
    if (remaining <= 0) return;
    const optKey = resolveOptionKey(skuCode, wo.packagingOptionSuffix || wo.optionSuffix, wo.packagingRatio);
    addFutureInflow(planDate, skuCode, optKey, remaining);
  });

  // 3. Classify all Sales Orders into: Returns / Dispatched / Open Allocation Queue
  const resultMap = {};
  const openQueue = [];

  salesOrders.forEach((order) => {
    if (!order || order.confirmationStatus === 'canceled' || order.isSplitParent) return;
    const orderType = order.orderType || 'supply';
    const isOutboundType = OUTBOUND_ORDER_TYPES.has(orderType);
    const isReturnType = RETURN_ORDER_TYPES.has(orderType);
    if (!isOutboundType && !isReturnType) return;

    const staged = stagedAssignments?.[order.id];
    const effStatus = staged?.fulfillmentStatus || order.fulfillmentStatus || 'not_yet';
    const effDate = formatDateStr(staged?.loadingDate || order.loadingDate || order.invoiceDate || effToday) || effToday;
    const rawTrip =
      staged?.loadingOrderNumber !== undefined ? staged.loadingOrderNumber : order.loadingOrderNumber;
    const tripNum =
      rawTrip !== '' && rawTrip !== null && rawTrip !== undefined && Number.isFinite(Number(rawTrip)) && Number(rawTrip) > 0
        ? Number(rawTrip)
        : Infinity;

    const lines = Array.isArray(order.lines) ? order.lines : [];
    const totalReqFromLines = roundQty(
      lines.reduce((s, l) => s + Number(l.qty || 0) + Number(l.bonus || 0), 0)
    );
    const fallbackTotal = roundQty(Number(order.totalCartons || order.totalQty || 0) + Number(order.totalBonus || 0));
    const totalRequiredCartons = totalReqFromLines > 0 ? totalReqFromLines : fallbackTotal;

    if (isReturnType) {
      if (['not_yet', 'prepare', 'shipped'].includes(effStatus) && effDate > effToday) {
        lines.forEach((l) => {
          const skuCode = resolveCanonicalSku(l.productId || l.finishedProductId || l.productCode || l.code);
          const qtyCtn = roundQty(Number(l.qty || 0) + Number(l.bonus || 0));
          if (!skuCode || qtyCtn <= 0) return;
          const optKey = resolveOptionKey(skuCode, l.packagingOptionSuffix || l.optionSuffix, l.packagingRatio);
          addFutureInflow(effDate, skuCode, optKey, qtyCtn);
        });
      }
      resultMap[order.id] = {
        mode: 'return',
        tier: 'return',
        fulfillmentStatus: effStatus,
        effDate,
        tripNum: Number.isFinite(tripNum) ? tripNum : null,
        totalRequiredCartons,
        totalAvailableCartons: totalRequiredCartons,
        shortfallCartons: 0,
        pct: 100,
        lineStatuses: lines.map((l) => {
          const req = roundQty(Number(l.qty || 0) + Number(l.bonus || 0));
          return {
            mode: 'return',
            tier: 'return',
            requiredCartons: req,
            availableCartons: req,
            pct: 100,
            optionSuffix: String(l.packagingOptionSuffix || l.optionSuffix || '').toUpperCase(),
          };
        }),
      };
      return;
    }

    if (DISPATCHED_FULFILLMENT_STATUSES.has(effStatus)) {
      resultMap[order.id] = {
        mode: 'dispatched',
        tier: 'dispatched',
        fulfillmentStatus: effStatus,
        effDate,
        tripNum: Number.isFinite(tripNum) ? tripNum : null,
        totalRequiredCartons,
        totalAvailableCartons: totalRequiredCartons,
        shortfallCartons: 0,
        pct: 100,
        lineStatuses: lines.map((l) => {
          const req = roundQty(Number(l.qty || 0) + Number(l.bonus || 0));
          return {
            mode: 'dispatched',
            tier: 'dispatched',
            requiredCartons: req,
            availableCartons: req,
            pct: 100,
            optionSuffix: String(l.packagingOptionSuffix || l.optionSuffix || '').toUpperCase(),
          };
        }),
      };
      return;
    }

    if (effStatus === 'prepare' || effStatus === 'not_yet') {
      openQueue.push({
        order,
        effStatus,
        isPrepare: effStatus === 'prepare',
        effDate,
        tripNum,
        totalRequiredCartons,
      });
    }
  });

  // 4. Priority Sequence Sort: Chronological Date -> Prepared before Ordered -> Ascending Trip # -> Unassigned last -> Serial #
  const extractSerialNum = (o) => {
    const raw = String(o.serial || String(o.id || '').replace(/^SO-/, '') || '');
    const m = raw.match(/\d+/g);
    return m ? Number(m.join('')) : Number.MAX_SAFE_INTEGER;
  };

  openQueue.sort((a, b) => {
    if (a.effDate !== b.effDate) return a.effDate.localeCompare(b.effDate);
    if (a.isPrepare !== b.isPrepare) return a.isPrepare ? -1 : 1;
    if (a.tripNum !== b.tripNum) return a.tripNum - b.tripNum;
    const sA = extractSerialNum(a.order);
    const sB = extractSerialNum(b.order);
    if (sA !== sB) return sA - sB;
    return String(a.order.id || '').localeCompare(String(b.order.id || ''));
  });

  const sortedFutureDates = Object.keys(futureInflowsByDate).sort();
  let nextFutureIdx = 0;

  // 5. Walk Priority Queue & Consume Pool Sequentially
  openQueue.forEach((item) => {
    if (item.effDate > effToday) {
      while (nextFutureIdx < sortedFutureDates.length && sortedFutureDates[nextFutureIdx] <= item.effDate) {
        const dStr = sortedFutureDates[nextFutureIdx];
        (futureInflowsByDate[dStr] || []).forEach(({ skuCode, optKey, qtyCartons }) => {
          if (!skuPools[skuCode]) skuPools[skuCode] = { [optKey]: 0 };
          skuPools[skuCode][optKey] = roundQty((skuPools[skuCode][optKey] || 0) + qtyCartons);
        });
        nextFutureIdx++;
      }
    }

    const lines = Array.isArray(item.order.lines) ? item.order.lines : [];
    let totalReq = 0;
    let totalAvail = 0;

    const lineStatuses = lines.map((l) => {
      const req = roundQty(Number(l.qty || 0) + Number(l.bonus || 0));
      const skuCode = resolveCanonicalSku(l.productId || l.finishedProductId || l.productCode || l.code);
      const optKey = skuCode
        ? resolveOptionKey(skuCode, l.packagingOptionSuffix || l.optionSuffix, l.packagingRatio)
        : String(l.packagingOptionSuffix || l.optionSuffix || '').toUpperCase();

      if (req <= 0) {
        return {
          mode: 'open',
          tier: 'green',
          requiredCartons: 0,
          availableCartons: 0,
          shortfallCartons: 0,
          pct: 100,
          optionSuffix: optKey,
        };
      }

      totalReq = roundQty(totalReq + req);
      let allocated = 0;

      if (skuCode && skuPools[skuCode]) {
        if (optKey === 'ANY') {
          let remainingNeed = req;
          const activeKeys = (skuOptMeta[skuCode] || []).map((m) => m.suffix);
          const drawOrder = [...activeKeys].sort(
            (x, y) => (skuPools[skuCode][y] || 0) - (skuPools[skuCode][x] || 0)
          );
          for (const k of drawOrder) {
            if (remainingNeed <= 0) break;
            const poolBal = Math.max(0, Number(skuPools[skuCode][k] || 0));
            if (poolBal <= 0) continue;
            const take = roundQty(Math.min(remainingNeed, poolBal));
            skuPools[skuCode][k] = roundQty(Number(skuPools[skuCode][k] || 0) - take);
            allocated = roundQty(allocated + take);
            remainingNeed = roundQty(remainingNeed - take);
          }
        } else {
          const poolBal = Math.max(0, Number(skuPools[skuCode][optKey] || 0));
          allocated = roundQty(Math.min(req, poolBal));
          skuPools[skuCode][optKey] = roundQty(Number(skuPools[skuCode][optKey] || 0) - allocated);
        }
      }

      totalAvail = roundQty(totalAvail + allocated);
      const isLineFull = allocated >= req - 1e-4;
      const linePct = isLineFull ? 100 : Math.min(99, Math.max(0, Math.round((allocated / req) * 100)));
      const lineTier = linePct === 100 ? 'green' : linePct >= 50 ? 'amber' : 'red';

      return {
        mode: 'open',
        tier: lineTier,
        requiredCartons: req,
        availableCartons: allocated,
        shortfallCartons: roundQty(Math.max(0, req - allocated)),
        pct: linePct,
        optionSuffix: optKey,
      };
    });

    const isOrderFull = totalReq <= 0 || totalAvail >= totalReq - 1e-4;
    const orderPct =
      totalReq <= 0
        ? 100
        : isOrderFull
        ? 100
        : Math.min(99, Math.max(0, Math.round((totalAvail / totalReq) * 100)));
    const orderTier = orderPct === 100 ? 'green' : orderPct >= 50 ? 'amber' : 'red';

    resultMap[item.order.id] = {
      mode: 'open',
      tier: orderTier,
      fulfillmentStatus: item.effStatus,
      effDate: item.effDate,
      tripNum: Number.isFinite(item.tripNum) ? item.tripNum : null,
      totalRequiredCartons: totalReq > 0 ? totalReq : item.totalRequiredCartons,
      totalAvailableCartons: totalAvail,
      shortfallCartons: roundQty(Math.max(0, totalReq - totalAvail)),
      pct: orderPct,
      lineStatuses,
    };
  });

  return resultMap;
}

