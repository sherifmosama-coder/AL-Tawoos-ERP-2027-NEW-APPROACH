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
}) {
  const lotMap = {};    // Key: `${lotNumber}_${warehouseId}`
  const varMap = {};    // Key: `${itemId}_${variantCode}`
  const parentMap = {}; // Key: `${itemId}`
  const whSummary = {}; // Key: `${warehouseId}`

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
    if (grn.status === 'cancelled' || grn.status === 'rejected') return;
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
    if (trn.status !== 'completed') return;

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
    if (trans.status === 'cancelled' || trans.status === 'rejected') return;
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
          unitPrice: 0,
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
          availableQty: 0,
        };
      }
      lotMap[lotKey].availableQty += qty;
    }

    // 4B. Outflow (-): Consumed Components (R-materials for Tanks & F-packaging for Work Orders)
    (trans.consumedComponents || []).forEach((c) => {
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