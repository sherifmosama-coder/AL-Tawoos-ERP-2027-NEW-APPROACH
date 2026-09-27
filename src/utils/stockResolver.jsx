import React from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { 
  matchWarehouse, 
  isUsableWarehouse, 
  getFactoryFloorWarehouse, 
  getRawStorageWarehouses, 
  getQuarantineWarehouses, 
  getWarehouseDisplayName 
} from './warehouseClassifier';

// Re-export warehouse classifier helpers for backward compatibility with existing imports
export { 
  matchWarehouse, 
  isUsableWarehouse, 
  getFactoryFloorWarehouse, 
  getRawStorageWarehouses, 
  getQuarantineWarehouses, 
  getWarehouseDisplayName 
};

/**
 * Al-Tawoos ERP - Unit & Fraction Handling Rules
 * Continuous units (liquids, weights, lengths) legitimately accept fractions.
 * Discrete units (bottles, cartons, caps, boxes) are strictly whole integers.
 */
export const CONTINUOUS_UNITS = [
  'لتر', 'كجم', 'كيلو', 'كيلوجرام', 'جرام', 'جم', 'طن', 'متر', 'سم', 'مللتر', 'مل',
  'l', 'kg', 'g', 'm', 'ml', 'ton', 'liter', 'liters', 'kilogram', 'kilograms'
];

export function isFractionalUnit(unit) {
  if (!unit) return false;
  const clean = String(unit).trim().toLowerCase();
  return CONTINUOUS_UNITS.includes(clean);
}

export function resolveItemAllowFractions(itemOrProduct) {
  if (!itemOrProduct) return false;
  if (typeof itemOrProduct.allowFractions === 'boolean') {
    return itemOrProduct.allowFractions;
  }
  return isFractionalUnit(itemOrProduct.smallUnit || itemOrProduct.unit);
}

export function formatLotDate(dateVal) {
  if (!dateVal) return '';
  try {
    const str = String(dateVal).trim();
    if (/^\d{2}-[A-Za-z]{3}$/.test(str)) {
      return str;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const parts = str.slice(0, 10).split('-');
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (m >= 0 && m < 12 && !isNaN(d)) {
        return `${String(d).padStart(2, '0')}-${months[m]}`;
      }
    }
    const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return str.slice(0, 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const mmm = months[d.getMonth()];
    return `${day}-${mmm}`;
  } catch {
    return String(dateVal || '').slice(0, 10);
  }
}

export function formatQuantity(qty, allowFractions = false, maxDecimals = 3) {
  const num = Number(qty || 0);
  if (!allowFractions) {
    return Math.round(num).toLocaleString();
  }
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round(num * factor) / factor;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

export function convertLargeToSmall(largeQty, packagingRatio = 1, allowFractions = false) {
  const numLarge = Number(largeQty || 0);
  const ratio = Number(packagingRatio || 1);
  const rawSmall = numLarge * ratio;
  if (allowFractions) {
    return Math.round(rawSmall * 1000) / 1000;
  }
  return Math.round(rawSmall);
}

export function formatVariantLabel(v, item = null, isAr = true) {
  if (!v) return isAr ? '-- القياسي --' : '-- Standard --';
  const vCode = v.suffix || v.variantCode || '';
  const supplier = v.supplierName && v.supplierName !== 'تنوع' && v.supplierName !== 'رصيد افتتاحي أولي'
    ? v.supplierName
    : '';

  // Extract identifier spec text if defined (pure text, no emojis)
  let identifierText = '';
  if (v.identifierBadgeText && typeof v.identifierBadgeText === 'string') {
    identifierText = v.identifierBadgeText.trim();
  } else if (Array.isArray(v.specs)) {
    const idSpecs = v.specs.filter((s) => s && s.isIdentifier && s.value && String(s.value).trim());
    if (idSpecs.length > 0) {
      identifierText = idSpecs.map((s) => s.value.trim()).join(' • ');
    }
  }

  const specs = v.mergedSpecs || (Array.isArray(v.specs) ? v.specs.map((s) => `${s.label}: ${s.value}`).join(' | ') : v.specs) || '';
  const packInfo = v.packagingRatio > 1
    ? (isAr ? `شدة: ${v.packagingRatio}` : `Pack: ${v.packagingRatio}`)
    : '';

  const details = [
    identifierText ? `[${identifierText}]` : '',
    supplier,
    specs && specs !== identifierText ? specs : '',
    packInfo,
  ]
    .filter(Boolean)
    .join(' | ');

  if (vCode && details) {
    return `[${vCode}] • ${details}`;
  } else if (vCode) {
    return `[${vCode}] ${isAr ? 'تنوع' : 'Variant'}`;
  } else if (details) {
    return details;
  }
  return isAr ? '-- القياسي --' : '-- Standard --';
}

export function formatLotLabel(lot, isAr = true) {
  if (!lot) return '';
  const lotNo = lot.lotNumber || lot.supplierBatchNo || 'LOT';
  const rawDate = lot.date || lot.receivedDate || lot.productionDate || lot.openingProdDate || lot.createdAt || '';
  const dateStr = formatLotDate(rawDate);
  const supplier = lot.supplierName && lot.supplierName !== 'رصيد افتتاحي أولي' && lot.supplierName !== 'INITIAL_BALANCE'
    ? lot.supplierName
    : '';
  const whName = lot.warehouseObj?.nameAr || lot.warehouseName || lot.whName || '';
  const qty = lot.availableQty != null ? Number(lot.availableQty) : null;
  const unit = lot.smallUnit || lot.unit || '';
  const allowFractions = lot.allowFractions ?? isFractionalUnit(unit);

  const parts = [`[${lotNo}]`];
  if (dateStr) parts.push(dateStr);
  if (supplier) parts.push(supplier);
  if (whName) parts.push(whName);

  let label = parts.join(' • ');
  if (qty != null) {
    const formattedQty = formatQuantity(qty, allowFractions);
    label += ` (${isAr ? 'المتاح:' : 'Avail:'} ${formattedQty} ${unit})`;
  }
  return label;
}

/**
 * Al-Tawoos ERP - Centralized Stock Balance Matrix Engine (Phase 3)
 * Single Source of Truth for Live Stock, FIFO Lots, and Multi-Warehouse Balances
 */
export function buildLiveStockMatrix({
  itemsMaster = [],
  warehouses = [],
  goodsReceipts = [],
  transfers = [],
  transformations = [],
  sparePartsIssues = [],
  intermediateRecipes = [],
}) {
  const lotMap = {};    // Key: `${lotNumber}_${warehouseId}`
  const varMap = {};    // Key: `${itemId}_${variantCode}`
  const parentMap = {}; // Key: `${itemId}`
  const whSummary = {}; // Key: `${warehouseId}`

  // Quick lookup map for parent items to access allowFractions & master data
  const itemMap = new Map();
  itemsMaster.forEach((it) => {
    if (it.code) itemMap.set(String(it.code).trim(), it);
    if (it.id) itemMap.set(String(it.id).trim(), it);
  });

  // Initialize Warehouse Summaries
  warehouses.forEach((w) => {
    const wKey = w.id || w.code;
    whSummary[wKey] = {
      warehouse: w,
      totalQty: 0,
      totalValue: 0,
      activeSkus: new Set(),
    };
  });

  // =========================================================================
  // 1. INGEST OPENING BALANCES (OB) DIRECTLY FROM ITEM VARIATIONS
  // =========================================================================
  itemsMaster.forEach((item) => {
    if (item.isStocklessUtility) return;

    (item.variations || []).forEach((v) => {
      const openQty = Number(v.openingQtySmall || 0);
      if (openQty <= 0 || !v.openingWarehouse) return;

      const pId = item.code;
      const vCode = v.variantCode || `${pId}-${v.suffix}`;
      const targetWhObj = warehouses.find((w) => matchWarehouse(v.openingWarehouse, w)) || {
        id: v.openingWarehouse,
        code: v.openingWarehouse,
        nameAr: v.openingWarehouse,
      };
      const whId = targetWhObj.id || targetWhObj.code || v.openingWarehouse;
      const lotNo = `OB-${pId}-${v.suffix}-01`;
      const lotKey = `${lotNo}_${whId}`;
      const unitCost = Number(v.openingUnitCost || 0);

      if (!lotMap[lotKey]) {
        lotMap[lotKey] = {
          lotNumber: lotNo,
          itemId: pId,
          variantCode: vCode,
          nameAr: item.nameAr,
          nameEn: item.nameEn || '',
          specs: v.mergedSpecs || item.mergedSpecs || '',
          warehouseId: whId,
          warehouseObj: targetWhObj,
          unitPrice: unitCost,
          currency: 'EGP',
          receivedDate: v.openingProdDate || '',
          supplierId: v.supplierId || 'INITIAL_BALANCE',
          supplierName: v.supplierName || 'رصيد افتتاحي أولي',
          supplierBatchNo: v.openingBatchNo || 'OB-LOT',
          productionDate: v.openingProdDate || '',
          expiryDate: v.openingExpDate || '',
          smallUnit: v.smallUnit || item.smallUnit || 'قطعة',
          largeUnitName: v.largeUnitName || item.largeUnitName || 'كرتونة',
          packagingRatio: Number(v.packagingRatio || item.packagingRatio || 1),
          allowFractions: resolveItemAllowFractions(item),
          availableQty: 0,
          docType: 'opening_balance',
        };
      }
      lotMap[lotKey].availableQty += openQty;
    });
  });

  // =========================================================================
  // 2. INGEST VENDOR PURCHASES (GRN), RETURNS (RTN) & RECONCILIATIONS (ADJ)
  // =========================================================================
  goodsReceipts.forEach((grn) => {
    if (grn.status === 'cancelled' || grn.status === 'rejected' || grn.status === 'reversed' || grn.isReversed) return;
    // Skip legacy opening balances in goodsReceipts as they are ingested from itemsMaster
    if (grn.docType === 'opening_balance' || grn.id?.startsWith('OB-')) return;

    const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');
    const isReconciliation = grn.docType === 'inventory_reconciliation' || grn.id?.startsWith('ADJ');

    (grn.lines || []).forEach((line, lIdx) => {
      const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
      const vCode = line.variantCode || line.code || pId;
      const targetWhObj = warehouses.find((w) => matchWarehouse(line.targetWarehouse, w)) || {
        id: line.targetWarehouse,
        code: line.targetWarehouse,
        nameAr: line.targetWarehouse,
      };
      const whId = targetWhObj.id || targetWhObj.code || line.targetWarehouse;
      const lotNo =
        line.lotNumber ||
        (line.linkedGrnId
          ? `${line.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}`
          : `${grn.id}-${String(lIdx + 1).padStart(2, '0')}`);

      let qty = Number(line.receivedSmallUnits || 0);
      if (isReturn) {
        qty = -Math.abs(qty);
      } else if (isReconciliation) {
        qty = Number(line.receivedSmallUnits || 0);
      }

      const unitCost = line.unitPrice !== '' && line.unitPrice !== undefined ? Number(line.unitPrice) : 0;
      const lotKey = `${lotNo}_${whId}`;

      if (!lotMap[lotKey]) {
        lotMap[lotKey] = {
          lotNumber: lotNo,
          itemId: pId,
          variantCode: vCode,
          nameAr: line.nameAr || pId,
          nameEn: line.nameEn || '',
          specs: line.specs || '',
          warehouseId: whId,
          warehouseObj: targetWhObj,
          unitPrice: unitCost,
          currency: line.currency || 'EGP',
          receivedDate: grn.receiptDate || '',
          supplierId: grn.supplierId || '',
          supplierName: grn.supplierName || '',
          supplierBatchNo: line.supplierBatchNo || '',
          productionDate: line.productionDate || '',
          expiryDate: line.expiryDate || '',
          smallUnit: line.smallUnit || 'قطعة',
          largeUnitName: line.largeUnitName || 'كرتونة',
          packagingRatio: Number(line.packagingRatio || 1),
          allowFractions: resolveItemAllowFractions(itemMap.get(pId) || { smallUnit: line.smallUnit }),
          availableQty: 0,
          docType: isReconciliation ? 'reconciliation' : isReturn ? 'return' : 'receipt',
        };
      }
      lotMap[lotKey].availableQty += qty;
    });
  });

  // =========================================================================
  // 3. INGEST COMPLETED INTERNAL TRANSFERS (TRN & PIPELINE TRANSFERS)
  // =========================================================================
  transfers.forEach((trn) => {
    if (trn.status !== 'completed' || trn.status === 'reversed' || trn.isReversed) return;
    // Skip Finished Goods transfers (only raw, packaging, chemical & scrap material transfers affect liveStockMatrix)
    if (trn.transferType === 'finished_goods' || trn.transferCategory === 'finished_goods' || trn.isFinishedGoods || trn.id?.startsWith('TRN-FG-') || trn.id?.startsWith('FG-')) return;
    if (Array.isArray(trn.lines) && trn.lines.some((l) => l.palletId)) return;

    const srcWhObj = warehouses.find((w) => matchWarehouse(trn.sourceWarehouse, w)) || {
      id: trn.sourceWarehouse,
      code: trn.sourceWarehouse,
    };
    const tgtWhObj = warehouses.find((w) => matchWarehouse(trn.targetWarehouse, w)) || {
      id: trn.targetWarehouse,
      code: trn.targetWarehouse,
    };
    const srcWhId = srcWhObj.id || srcWhObj.code || trn.sourceWarehouse;
    const tgtWhId = tgtWhObj.id || tgtWhObj.code || trn.targetWarehouse;

    (trn.lines || []).forEach((line) => {
      const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
      const vCode = line.variantCode || line.code || pId;
      const lotNo = line.lotNumber || 'UNASSIGNED-LOT';
      const qty = Number(line.qtySmallUnits || 0);
      const unitCost = Number(line.unitPrice || 0);

      // Deduct from Source Warehouse
      const srcLotKey = `${lotNo}_${srcWhId}`;
      if (!lotMap[srcLotKey]) {
        lotMap[srcLotKey] = {
          lotNumber: lotNo,
          itemId: pId,
          variantCode: vCode,
          nameAr: line.nameAr || pId,
          nameEn: line.nameEn || '',
          specs: line.specs || '',
          warehouseId: srcWhId,
          warehouseObj: srcWhObj,
          unitPrice: unitCost,
          currency: line.currency || 'EGP',
          receivedDate: line.receivedDate || trn.transferDate || '',
          supplierId: line.supplierId || '',
          supplierName: line.supplierName || '',
          supplierBatchNo: line.supplierBatchNo || '',
          productionDate: line.productionDate || '',
          expiryDate: line.expiryDate || '',
          smallUnit: line.smallUnit || 'قطعة',
          largeUnitName: line.largeUnitName || 'كرتونة',
          packagingRatio: Number(line.packagingRatio || 1),
          availableQty: 0,
        };
      }
      lotMap[srcLotKey].availableQty -= qty;

      // Add to Target Warehouse
      const tgtLotKey = `${lotNo}_${tgtWhId}`;
      if (!lotMap[tgtLotKey]) {
        lotMap[tgtLotKey] = {
          lotNumber: lotNo,
          itemId: pId,
          variantCode: vCode,
          nameAr: line.nameAr || pId,
          nameEn: line.nameEn || '',
          specs: line.specs || '',
          warehouseId: tgtWhId,
          warehouseObj: tgtWhObj,
          unitPrice: unitCost,
          currency: line.currency || 'EGP',
          receivedDate: line.receivedDate || trn.transferDate || '',
          supplierId: line.supplierId || '',
          supplierName: line.supplierName || '',
          supplierBatchNo: line.supplierBatchNo || '',
          productionDate: line.productionDate || '',
          expiryDate: line.expiryDate || '',
          smallUnit: line.smallUnit || 'قطعة',
          largeUnitName: line.largeUnitName || 'كرتونة',
          packagingRatio: Number(line.packagingRatio || 1),
          allowFractions: resolveItemAllowFractions(itemMap.get(pId) || { smallUnit: line.smallUnit }),
          availableQty: 0,
        };
      }
      lotMap[tgtLotKey].availableQty += qty;
    });
  });

  // =========================================================================
  // 4. INGEST PRODUCTION TRANSFORMATIONS (TANK MIXING & WO CONSUMPTIONS)
  // =========================================================================
  transformations.forEach((trans) => {
    if (trans.status === 'cancelled' || trans.status === 'rejected' || trans.status === 'reversed' || trans.isReversed) return;
    const whObj = warehouses.find((w) => matchWarehouse(trans.warehouseId, w)) || {
      id: trans.warehouseId,
      code: trans.warehouseId,
      nameAr: trans.warehouseId,
    };
    const whId = whObj.id || whObj.code || trans.warehouseId;

    // 4A. Inflow (+): Produced M-Item batch in Source WH (Liquid Tank Prep)
    if (trans.itemCode && Number(trans.producedQty) > 0 && !trans.workOrderId && !trans.id?.startsWith('TRANS-WO-')) {
      const pId = trans.itemCode;
      const vCode = trans.variantCode || pId;
      const lotNo = trans.lotNumber || `LOT-${trans.id}`;
      const qty = Number(trans.producedQty || 0);

      const lotKey = `${lotNo}_${whId}`;
      if (!lotMap[lotKey]) {
        lotMap[lotKey] = {
          lotNumber: lotNo,
          itemId: pId,
          variantCode: vCode,
          nameAr: trans.itemNameAr || pId,
          nameEn: trans.itemNameEn || '',
          specs: trans.specs || '',
          warehouseId: whId,
          warehouseObj: whObj,
          unitPrice: (() => {
            const explicit = Number(trans.unitCost || trans.unitPrice || 0);
            if (explicit > 0 && explicit !== 5) return explicit;
            if (Array.isArray(trans.consumedComponents) && trans.consumedComponents.length > 0 && qty > 0) {
              const sum = trans.consumedComponents.reduce(
                (acc, c) => acc + (Number(c.totalCost) || (Number(c.qtySmallUnits || 0) * (Number(c.unitCost || c.unitPrice) || 0))),
                0
              );
              if (sum > 0) return Number((sum / qty).toFixed(4));
            }
            return resolveItemOrLotCost({
              itemId: pId,
              variantCode: vCode,
              lotNumber: lotNo,
              warehouseId: whId,
              itemsMaster,
              goodsReceipts,
              transformations,
              intermediateRecipes,
            });
          })(),
          currency: 'EGP',
          receivedDate: trans.date || '',
          supplierId: 'IN_HOUSE',
          supplierName: 'إنتاج داخلي (تشغيل تانك)',
          supplierBatchNo: lotNo,
          productionDate: trans.date || '',
          expiryDate: '',
          smallUnit: trans.yieldUnit || 'لتر',
          largeUnitName: 'تانك',
          packagingRatio: qty,
          allowFractions: resolveItemAllowFractions(itemMap.get(pId) || { smallUnit: trans.yieldUnit || 'لتر' }),
          availableQty: 0,
        };
      }
      lotMap[lotKey].availableQty += qty;
    }

    // 4B. Outflow (-): Consumed Components (R-materials for Tanks & F-packaging for Work Orders)
    const consumedList = Array.isArray(trans.consumedComponents) && trans.consumedComponents.length > 0
      ? trans.consumedComponents
      : (Array.isArray(trans.consumedLines) && trans.consumedLines.length > 0
          ? trans.consumedLines
          : (Array.isArray(trans.consumedMaterials) ? trans.consumedMaterials : (Array.isArray(trans.inputs) ? trans.inputs : [])));

    consumedList.forEach((c) => {
      const pId = c.itemId;
      const vCode = c.variantCode || c.code || pId;
      let qtyToDeduct = Number(c.qtySmallUnits || c.consumedSmallUnits || 0);
      if (qtyToDeduct <= 0) return;

      const availableLots = Object.values(lotMap).filter((l) => {
        const matchItem = l.itemId === pId || l.variantCode === vCode || l.variantCode?.startsWith(`${pId}-`);
        const matchWh = l.warehouseId === whId || matchWarehouse(whId, l.warehouseObj);
        return matchItem && matchWh && l.availableQty > 0;
      });

      // Deduct in FIFO order (oldest receivedDate first)
      availableLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

      for (const lot of availableLots) {
        if (qtyToDeduct <= 0) break;
        const deductFromLot = Math.min(lot.availableQty, qtyToDeduct);
        lot.availableQty -= deductFromLot;
        qtyToDeduct -= deductFromLot;
      }

      if (qtyToDeduct > 0) {
        if (availableLots.length > 0) {
          availableLots[availableLots.length - 1].availableQty -= qtyToDeduct;
        } else {
          const fallbackLotKey = `CONS-${pId}_${whId}`;
          if (!lotMap[fallbackLotKey]) {
            lotMap[fallbackLotKey] = {
              lotNumber: `CONS-${pId}`,
              itemId: pId,
              variantCode: vCode,
              nameAr: c.nameAr || pId,
              nameEn: c.nameEn || '',
              specs: c.specs || '',
              warehouseId: whId,
              warehouseObj: whObj,
              unitPrice: 0,
              currency: 'EGP',
              receivedDate: trans.date || '',
              supplierId: '',
              supplierName: '',
              supplierBatchNo: '',
              productionDate: '',
              expiryDate: '',
              smallUnit: c.smallUnit || c.unit || 'عبوة',
              largeUnitName: c.largeUnitName || 'كرتونة',
              packagingRatio: Number(c.packagingRatio || 1),
              allowFractions: resolveItemAllowFractions(itemMap.get(pId) || { smallUnit: c.smallUnit || c.unit }),
              availableQty: 0,
            };
          }
          lotMap[fallbackLotKey].availableQty -= qtyToDeduct;
        }
      }
    });
  });

  // =========================================================================
  // 5. INGEST SPARE PARTS CONSUMPTION (XISS)
  // =========================================================================
  sparePartsIssues.forEach((issue) => {
    if (issue.status === 'cancelled') return;
    const issueWh = issue.warehouseId || issue.sourceWarehouse || warehouses[0]?.id || '';
    const whObj = warehouses.find((w) => matchWarehouse(issueWh, w)) || { id: issueWh, code: issueWh };
    const whId = whObj.id || whObj.code || issueWh;

    (issue.lines || issue.items || []).forEach((line) => {
      const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
      const vCode = line.variantCode || line.code || pId;
      let qtyToDeduct = Number(line.quantity || line.qty || line.qtySmallUnits || 0);
      if (qtyToDeduct <= 0) return;

      const availableLots = Object.values(lotMap).filter((l) => {
        const matchItem = l.itemId === pId || l.variantCode === vCode;
        const matchWh = l.warehouseId === whId || matchWarehouse(whId, l.warehouseObj);
        return matchItem && matchWh && l.availableQty > 0;
      });

      availableLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

      for (const lot of availableLots) {
        if (qtyToDeduct <= 0) break;
        const deduct = Math.min(lot.availableQty, qtyToDeduct);
        lot.availableQty -= deduct;
        qtyToDeduct -= deduct;
      }

      if (qtyToDeduct > 0 && availableLots.length > 0) {
        availableLots[availableLots.length - 1].availableQty -= qtyToDeduct;
      }
    });
  });

  // =========================================================================
  // 6. AGGREGATE SUMMARY MAPS (VARIANTS, PARENTS, WAREHOUSES, KPIS)
  // =========================================================================
  const activeLots = Object.values(lotMap).filter((l) => l.availableQty > 0);
  activeLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

  let companyTotalValuation = 0;
  const activeVariantSet = new Set();
  const lowStockVariantSet = new Set();

  Object.values(lotMap).forEach((lot) => {
    const varKey = `${lot.itemId}_${lot.variantCode}`;
    if (!varMap[varKey]) {
      varMap[varKey] = {
        itemId: lot.itemId,
        variantCode: lot.variantCode,
        nameAr: lot.nameAr,
        nameEn: lot.nameEn,
        specs: lot.specs,
        smallUnit: lot.smallUnit,
        largeUnitName: lot.largeUnitName,
        packagingRatio: lot.packagingRatio,
        allowFractions: lot.allowFractions ?? resolveItemAllowFractions(itemMap.get(lot.itemId)),
        totalQty: 0,
        totalValue: 0,
        byWarehouse: {},
        lots: [],
      };
    }
    varMap[varKey].totalQty += lot.availableQty;
    const lotVal = lot.availableQty * (lot.unitPrice || 0);
    varMap[varKey].totalValue += lotVal;
    varMap[varKey].byWarehouse[lot.warehouseId] = (varMap[varKey].byWarehouse[lot.warehouseId] || 0) + lot.availableQty;
    if (lot.availableQty > 0) {
      varMap[varKey].lots.push(lot);
    }

    if (!parentMap[lot.itemId]) {
      parentMap[lot.itemId] = {
        itemId: lot.itemId,
        allowFractions: lot.allowFractions ?? resolveItemAllowFractions(itemMap.get(lot.itemId)),
        totalQty: 0,
        byWarehouse: {},
      };
    }
    parentMap[lot.itemId].totalQty += lot.availableQty;
    parentMap[lot.itemId].byWarehouse[lot.warehouseId] =
      (parentMap[lot.itemId].byWarehouse[lot.warehouseId] || 0) + lot.availableQty;

    if (whSummary[lot.warehouseId]) {
      whSummary[lot.warehouseId].totalQty += lot.availableQty;
      whSummary[lot.warehouseId].totalValue += lotVal;
      if (lot.availableQty > 0) {
        whSummary[lot.warehouseId].activeSkus.add(lot.variantCode);
      }
    }

    if (lot.availableQty > 0) {
      companyTotalValuation += lotVal;
      activeVariantSet.add(lot.variantCode);
    }
  });

  // Sort lots inside each variant FIFO
  Object.values(varMap).forEach((v) => {
    v.lots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));
  });

  return {
    lotMap,
    varMap,
    parentMap,
    activeLotsList: activeLots,
    variantBalancesMap: varMap,
    warehouseStockSummary: whSummary,
    kpiSummary: {
      totalValuation: companyTotalValuation,
      activeSkusCount: activeVariantSet.size,
      lowStockCount: lowStockVariantSet.size,
      activeLotsCount: activeLots.length,
    },
    isReady: true,
  };
}

/**
 * Visual Origin Badge Component with Tooltip
 */
export function StockOriginBadge({ source = 'matrix', isAr = true, className = '' }) {
  const isMatrix = source === 'matrix';
  const Icon = isMatrix ? Zap : RefreshCw;
  const tooltipText = isMatrix
    ? isAr
      ? 'تم جلب الرصيد مباشرة من مصفوفة الأرصدة المعتمدة (Live Balance Matrix)'
      : 'Live balance synced from Centralized Stock Matrix'
    : isAr
    ? 'تم احتساب الرصيد ديناميكياً كإجراء احتياطي (Dynamic Fallback Calculation)'
    : 'Dynamically computed fallback';

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold cursor-help transition select-none ${
        isMatrix
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
          : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
      } ${className}`}
      title={tooltipText}
    >
      <Icon className={`h-3 w-3 ${isMatrix ? 'text-emerald-600' : 'text-amber-600 animate-spin-slow'}`} />
      <span>{isMatrix ? (isAr ? 'مصفوفة حية' : 'Live Matrix') : (isAr ? 'احتساب احتياطي' : 'Dynamic Calc')}</span>
    </span>
  );
}

/**
 * Universal Cost Resolution Helper
 * Resolves exact unit cost with a 5-tier fallback architecture:
 * 1. Active LOT in lotMap (by lotNumber + warehouse or any matching lot with unitPrice > 0)
 * 2. Goods Receipts lines matching lotNumber
 * 3. Intermediate Tank formulation calculation (for M-items / tanks)
 * 4. Goods Receipts recent purchase price for item / variant
 * 5. Item Variation Opening / Catalog Cost (v.openingUnitCost, v.costPrice, v.price)
 * 6. Item Master Catalog Cost (costPrice, averageCost, standardCost)
 */
export function resolveItemOrLotCost({
  itemId = '',
  variantCode = '',
  lotNumber = '',
  warehouseId = '',
  liveStockMatrix = null,
  itemsMaster = [],
  goodsReceipts = [],
  tanks = [],
  transformations = [],
  intermediateRecipes = [],
  visitedItems = new Set(),
} = {}) {
  const cleanLot = lotNumber ? String(lotNumber).trim() : '';
  const cleanItem = itemId ? String(itemId).trim() : (variantCode ? variantCode.split('-')[0] : '');
  const cleanVar = variantCode ? String(variantCode).trim() : (cleanItem ? `${cleanItem}-A` : '');

  const itmDoc = (Array.isArray(itemsMaster) && cleanItem)
    ? itemsMaster.find((i) => i.code === cleanItem || i.id === cleanItem)
    : null;

  const isIntermediate = Boolean(
    (cleanItem && (cleanItem.startsWith('RMF-') || cleanItem.startsWith('M-') || cleanItem.includes('304'))) ||
    itmDoc?.classification === 'intermediate' ||
    itmDoc?.operationalClassification === 'intermediate' ||
    (Array.isArray(itmDoc?.flags) && itmDoc.flags.some((f) => String(f).toUpperCase().includes('M'))) ||
    (Array.isArray(intermediateRecipes) && intermediateRecipes.some((r) => r.targetItemId === cleanItem || r.code === cleanItem))
  );

  // =========================================================================
  // STRICT IN-HOUSE INTERMEDIATE MATERIAL FORMULATION COSTING
  // Rule: Cost MUST be strictly calculated through R-materials used to produce
  // the tank according to the assigned intermediate BOM. Never static catalog price!
  // =========================================================================
  if (isIntermediate) {
    if (visitedItems.has(cleanItem)) {
      return 0; // Prevent circular dependency
    }
    const nextVisited = new Set(visitedItems);
    nextVisited.add(cleanItem);

    // 1. Look for specific referenced tank or transformation
    let matchedTank = null;
    let matchedTrans = null;

    if (Array.isArray(tanks) && tanks.length > 0 && cleanLot && cleanLot !== '—') {
      matchedTank = tanks.find((t) => {
        if (!t) return false;
        const tNum = t.tankNumber != null ? String(t.tankNumber) : '';
        const tLot = t.lotNumber != null ? String(t.lotNumber) : '';
        const tShort = t.shortLotNumber != null ? String(t.shortLotNumber) : '';
        return (
          tLot === cleanLot ||
          tShort === cleanLot ||
          `TANK-${tNum}` === cleanLot ||
          `#${tNum}` === cleanLot ||
          tNum === cleanLot ||
          t.id === cleanLot
        );
      });
    }

    if (!matchedTank && Array.isArray(transformations) && transformations.length > 0 && cleanLot && cleanLot !== '—') {
      matchedTrans = transformations.find((trans) => {
        if (!trans || trans.workOrderId || trans.id?.startsWith('TRANS-WO-')) return false;
        const tNum = trans.tankNumber != null ? String(trans.tankNumber) : '';
        const tLot = trans.lotNumber != null ? String(trans.lotNumber) : '';
        return (
          tLot === cleanLot ||
          `TANK-${tNum}` === cleanLot ||
          `#${tNum}` === cleanLot ||
          tNum === cleanLot ||
          trans.id === cleanLot ||
          trans.tankId === cleanLot
        );
      });
    }

    // 1A. Compute dynamically from matchedTank.rMaterialLots
    if (matchedTank) {
      if (Array.isArray(matchedTank.rMaterialLots) && matchedTank.rMaterialLots.length > 0) {
        let totalCost = 0;
        let totalYield = Number(matchedTank.batchYieldQty || 0);
        matchedTank.rMaterialLots.forEach((r) => {
          const rawItm = (Array.isArray(itemsMaster) && r.itemId)
            ? itemsMaster.find((i) => i.code === r.itemId || i.id === r.itemId)
            : null;
          if (rawItm?.isStocklessUtility) return;

          const rUnitCost = resolveItemOrLotCost({
            itemId: r.itemId,
            variantCode: r.variantCode,
            lotNumber: r.lotNumber,
            warehouseId: r.warehouseId || warehouseId,
            liveStockMatrix,
            itemsMaster,
            goodsReceipts,
            tanks: [],
            transformations: [],
            intermediateRecipes: [],
            visitedItems: nextVisited,
          });
          totalCost += Number(r.qtySmallUnits || 0) * rUnitCost;
        });
        if (totalYield > 0 && totalCost > 0) {
          return Number((totalCost / totalYield).toFixed(4));
        }
      }
      if (Number(matchedTank.unitCost) > 0 && Number(matchedTank.unitCost) !== 5) {
        return Number(matchedTank.unitCost);
      }
    }

    // 1B. Compute dynamically from matchedTrans.consumedComponents
    if (matchedTrans) {
      const consumed = Array.isArray(matchedTrans.consumedComponents) ? matchedTrans.consumedComponents : [];
      if (consumed.length > 0) {
        let totalCost = 0;
        let totalYield = Number(matchedTrans.producedQty || 0);
        consumed.forEach((c) => {
          const rawItm = (Array.isArray(itemsMaster) && c.itemId)
            ? itemsMaster.find((i) => i.code === c.itemId || i.id === c.itemId)
            : null;
          if (rawItm?.isStocklessUtility) return;

          const cUnitCost = resolveItemOrLotCost({
            itemId: c.itemId,
            variantCode: c.variantCode,
            lotNumber: c.lotNumber,
            warehouseId: c.warehouseId || warehouseId,
            liveStockMatrix,
            itemsMaster,
            goodsReceipts,
            tanks: [],
            transformations: [],
            intermediateRecipes: [],
            visitedItems: nextVisited,
          });
          totalCost += Number(c.qtySmallUnits || 0) * cUnitCost;
        });
        if (totalYield > 0 && totalCost > 0) {
          return Number((totalCost / totalYield).toFixed(4));
        }
      }
      const transCost = Number(matchedTrans.unitCost || matchedTrans.unitPrice || 0);
      if (transCost > 0 && transCost !== 5) {
        return transCost;
      }
    }

    // 1C. Check if any recorded tank for this item has rMaterialLots
    if (Array.isArray(tanks) && tanks.length > 0) {
      const candidateTanks = tanks.filter(
        (t) => (t.itemCode === cleanItem || t.itemId === cleanItem) && Array.isArray(t.rMaterialLots) && t.rMaterialLots.length > 0
      );
      if (candidateTanks.length > 0) {
        candidateTanks.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        const latestTank = candidateTanks[0];
        let totalCost = 0;
        let totalYield = Number(latestTank.batchYieldQty || 0);
        latestTank.rMaterialLots.forEach((r) => {
          const rawItm = (Array.isArray(itemsMaster) && r.itemId)
            ? itemsMaster.find((i) => i.code === r.itemId || i.id === r.itemId)
            : null;
          if (rawItm?.isStocklessUtility) return;

          const rUnitCost = resolveItemOrLotCost({
            itemId: r.itemId,
            variantCode: r.variantCode,
            lotNumber: r.lotNumber,
            warehouseId: r.warehouseId || warehouseId,
            liveStockMatrix,
            itemsMaster,
            goodsReceipts,
            tanks: [],
            transformations: [],
            intermediateRecipes: [],
            visitedItems: nextVisited,
          });
          totalCost += Number(r.qtySmallUnits || 0) * rUnitCost;
        });
        if (totalYield > 0 && totalCost > 0) {
          return Number((totalCost / totalYield).toFixed(4));
        }
      }
    }

    // 2. Strict Intermediate BOM Recipe Calculation (intermediate_recipes)
    if (Array.isArray(intermediateRecipes) && intermediateRecipes.length > 0) {
      const recipe = intermediateRecipes.find((r) => 
        (r.targetItemId === cleanItem || r.code === cleanItem || r.targetVariantCode === cleanVar) && r.status === 'active'
      ) || intermediateRecipes.find((r) => 
        r.targetItemId === cleanItem || r.code === cleanItem || r.targetVariantCode === cleanVar
      );

      if (recipe && Array.isArray(recipe.components) && recipe.components.length > 0) {
        let totalRecipeCost = 0;
        const batchYield = Number(recipe.batchYieldQty) || 1;
        recipe.components.forEach((c) => {
          const rawItm = (Array.isArray(itemsMaster) && c.itemId)
            ? itemsMaster.find((i) => i.code === c.itemId || i.id === c.itemId)
            : null;
          if (rawItm?.isStocklessUtility) return;

          const rCost = resolveItemOrLotCost({
            itemId: c.itemId,
            variantCode: c.variantCode || `${c.itemId}-A`,
            warehouseId,
            liveStockMatrix,
            itemsMaster,
            goodsReceipts,
            tanks: [],
            transformations: [],
            intermediateRecipes: [],
            visitedItems: nextVisited,
          });
          totalRecipeCost += (Number(c.standardQty) || 0) * rCost;
        });

        if (batchYield > 0 && totalRecipeCost > 0) {
          return Number((totalRecipeCost / batchYield).toFixed(4));
        }
      }
    }

    // 3. Check lotMap if it holds a non-placeholder cost
    if (liveStockMatrix?.lotMap && cleanLot && cleanLot !== '—') {
      const matchedLot = Object.values(liveStockMatrix.lotMap).find(
        (l) => (l.lotNumber === cleanLot || l.supplierBatchNo === cleanLot) && (Number(l.unitPrice) > 0 || Number(l.unitCost) > 0)
      );
      if (matchedLot) {
        const val = Number(matchedLot.unitPrice || matchedLot.unitCost);
        if (val > 0 && val !== 5) {
          return val;
        }
      }
    }

    // STRICT IN-HOUSE RULE: NEVER fall back to itmDoc.costPrice or static 5 EGP
    return 0;
  }

  // =========================================================================
  // STANDARD PURCHASED MATERIALS RESOLUTION (Tiers 1 to 5)
  // =========================================================================

  // Tier 1: Check liveStockMatrix.lotMap
  if (liveStockMatrix?.lotMap) {
    if (cleanLot && warehouseId) {
      const exactLotKey = `${cleanLot}_${warehouseId}`;
      const exactLot = liveStockMatrix.lotMap[exactLotKey];
      if (exactLot && (Number(exactLot.unitPrice) > 0 || Number(exactLot.unitCost) > 0)) {
        return Number(exactLot.unitPrice || exactLot.unitCost);
      }
    }
    if (cleanLot && cleanLot !== '—') {
      const anyMatchingLot = Object.values(liveStockMatrix.lotMap).find(
        (l) => l.lotNumber === cleanLot && (Number(l.unitPrice) > 0 || Number(l.unitCost) > 0)
      );
      if (anyMatchingLot && (Number(anyMatchingLot.unitPrice) > 0 || Number(anyMatchingLot.unitCost) > 0)) {
        return Number(anyMatchingLot.unitPrice || anyMatchingLot.unitCost);
      }
    }
  }

  // Tier 2: Check Goods Receipts for matching LOT number
  if (cleanLot && cleanLot !== '—' && Array.isArray(goodsReceipts) && goodsReceipts.length > 0) {
    for (const grn of goodsReceipts) {
      if (grn.status === 'cancelled' || grn.status === 'rejected') continue;
      const matchedLine = (grn.lines || []).find(
        (line) => (line.lotNumber === cleanLot || line.supplierBatchNo === cleanLot) && Number(line.unitPrice) > 0
      );
      if (matchedLine) {
        return Number(matchedLine.unitPrice);
      }
    }
  }

  // Tier 3: Check Tanks & Transformations
  const isTankRef = cleanLot.startsWith('TANK-') || cleanLot.startsWith('BATCH-') || cleanLot.startsWith('#');
  if (isTankRef || (Array.isArray(tanks) && tanks.length > 0) || (Array.isArray(transformations) && transformations.length > 0)) {
    if (Array.isArray(tanks) && tanks.length > 0) {
      const matchedTank = tanks.find((t) => {
        if (!t) return false;
        const tNum = t.tankNumber != null ? String(t.tankNumber) : '';
        const tLot = t.lotNumber != null ? String(t.lotNumber) : '';
        const tShort = t.shortLotNumber != null ? String(t.shortLotNumber) : '';
        return (
          tLot === cleanLot ||
          tShort === cleanLot ||
          `TANK-${tNum}` === cleanLot ||
          `#${tNum}` === cleanLot ||
          tNum === cleanLot ||
          t.id === cleanLot
        );
      });

      if (matchedTank && Number(matchedTank.unitCost) > 0) {
        return Number(matchedTank.unitCost);
      }
    }

    if (Array.isArray(transformations) && transformations.length > 0) {
      const matchedTrans = transformations.find((trans) => {
        if (!trans || trans.workOrderId || trans.id?.startsWith('TRANS-WO-')) return false;
        const tNum = trans.tankNumber != null ? String(trans.tankNumber) : '';
        const tLot = trans.lotNumber != null ? String(trans.lotNumber) : '';
        return (
          tLot === cleanLot ||
          `TANK-${tNum}` === cleanLot ||
          `#${tNum}` === cleanLot ||
          tNum === cleanLot ||
          trans.id === cleanLot ||
          trans.tankId === cleanLot
        );
      });

      if (matchedTrans && Number(matchedTrans.unitCost || matchedTrans.unitPrice) > 0) {
        return Number(matchedTrans.unitCost || matchedTrans.unitPrice);
      }
    }
  }

  // Tier 4: Check Goods Receipts for recent item / variant purchase
  if (Array.isArray(goodsReceipts) && goodsReceipts.length > 0 && cleanItem) {
    const sortedGrns = [...goodsReceipts].sort((a, b) => (b.receiptDate || '').localeCompare(a.receiptDate || ''));
    for (const grn of sortedGrns) {
      if (grn.status === 'cancelled' || grn.status === 'rejected') continue;
      const matchedLine = (grn.lines || []).find((line) => {
        const lineItem = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const lineVar = line.variantCode || line.code || lineItem;
        return (lineVar === cleanVar || lineItem === cleanItem) && Number(line.unitPrice) > 0;
      });
      if (matchedLine) {
        return Number(matchedLine.unitPrice);
      }
    }
  }

  // Tier 5: Check Item Master Variations & Catalog Prices
  if (Array.isArray(itemsMaster) && itemsMaster.length > 0 && cleanItem) {
    if (itmDoc) {
      if (Array.isArray(itmDoc.variations) && itmDoc.variations.length > 0) {
        const targetVar = itmDoc.variations.find(
          (v) => v.variantCode === cleanVar || v.suffix === cleanVar.replace(`${cleanItem}-`, '')
        ) || itmDoc.variations[0];

        if (targetVar) {
          if (Number(targetVar.openingUnitCost) > 0) return Number(targetVar.openingUnitCost);
          if (Number(targetVar.costPrice) > 0) return Number(targetVar.costPrice);
          if (Number(targetVar.price) > 0) return Number(targetVar.price);
        }
      }
      if (Number(itmDoc.costPrice) > 0) return Number(itmDoc.costPrice);
      if (Number(itmDoc.averageCost) > 0) return Number(itmDoc.averageCost);
      if (Number(itmDoc.standardCost) > 0) return Number(itmDoc.standardCost);
    }
  }

  return 0;
}