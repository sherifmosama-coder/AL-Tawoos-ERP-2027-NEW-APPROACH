/**
 * Shared Inventory Validators & Stock Ledger Helpers
 * Pure deterministic helpers reused across GRN, Transfers, Stock Counts,
 * Spare Parts, and Production Transformations.
 */

import { FieldValue } from "firebase-admin/firestore";

export function round4(num) {
  return Math.round((Number(num) || 0) * 10000) / 10000;
}

export function round2(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

export function getParentItemId(line = {}) {
  const itemId = String(line.itemId || "").trim();
  if (itemId) return itemId;
  const code = String(line.code || "").trim();
  if (!code) return "";
  const parts = code.split("-");
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}`;
  if (parts.length === 2 && !Number.isNaN(Number(parts[1]))) return `${parts[0]}-${parts[1]}`;
  return parts[0];
}

export function getVariantCode(line = {}) {
  const vCode = String(line.variantCode || "").trim();
  if (vCode) return vCode;
  const code = String(line.code || "").trim();
  return code;
}

/**
 * Computes updated `variations` array and `stock` total for an `items` doc
 * given per-variant deltas and optional newly created direct-receipt variants.
 */
export function computeUpdatedItemStock({
  itemDoc = {},
  variantDeltas = {},
  newVariants = [],
}) {
  const workingVariations = Array.isArray(itemDoc.variations)
    ? itemDoc.variations.map((v) => ({ ...v }))
    : [];

  for (const nv of newVariants) {
    if (!nv?.variantCode) continue;
    const exists = workingVariations.some((v) => v.variantCode === nv.variantCode);
    if (!exists) {
      workingVariations.push({
        ...nv,
        stock: Number(nv.stock) || 0,
        isActive: nv.isActive !== undefined ? nv.isActive : true,
      });
    }
  }

  const updatedVariations = workingVariations.map((v) => {
    const delta = Number(variantDeltas[v.variantCode]) || 0;
    const currentVarStock = Number(v.stock) || 0;
    return {
      ...v,
      stock: Math.max(0, round4(currentVarStock + delta)),
    };
  });

  const totalStock = round4(
    updatedVariations.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
  );

  return {
    variations: updatedVariations,
    variationsCount: updatedVariations.length,
    stock: totalStock,
  };
}

/**
 * Accumulates item/variant net deltas from GRN/Return lines using sign (+1 receipt, -1 return).
 */
export function accumulateLineDeltas(lines = [], sign = 1) {
  const deltas = {};
  for (const l of lines) {
    const qty = (Number(l.receivedSmallUnits) || 0) * sign;
    const parentId = getParentItemId(l);
    const vCode = getVariantCode(l);
    if (!parentId || qty === 0) continue;
    if (!deltas[parentId]) {
      deltas[parentId] = { total: 0, variants: {} };
    }
    deltas[parentId].total += qty;
    if (vCode) {
      deltas[parentId].variants[vCode] = (deltas[parentId].variants[vCode] || 0) + qty;
    }
  }
  return deltas;
}

export function buildServerTimestampFields(includeCreated = false) {
  const base = { updatedAt: FieldValue.serverTimestamp() };
  if (includeCreated) {
    base.createdAt = FieldValue.serverTimestamp();
  }
  return base;
}

/**
 * Recalculates linked Purchase Order status across all approved receipts/returns.
 */
export function computePoFulfillmentStatus({
  poDoc,
  approvedReceiptsForPo = [],
}) {
  if (!poDoc) return { nextStatus: "approved", totalReceived: 0, totalOrdered: 0 };
  let isAllCompleted = true;
  let totalReceivedAcrossAllLines = 0;
  let totalOrderedAcrossAllLines = 0;

  for (const poLine of poDoc.lines || []) {
    const poLineKey = poLine.variantCode || poLine.code || poLine.itemId;
    let cumulativeLine = 0;
    for (const r of approvedReceiptsForPo) {
      for (const l of r.lines || []) {
        const grnKey = l.variantCode || l.code || l.itemId;
        if (grnKey === poLineKey && (l.qcStatus === "accepted" || r.docType === "receipt")) {
          const eff = Number(l.receivedSmallUnits) || 0;
          cumulativeLine += r.docType === "return" ? -eff : eff;
        }
      }
    }
    const orderedLineQty = Number(poLine.qty) || 0;
    totalReceivedAcrossAllLines += cumulativeLine;
    totalOrderedAcrossAllLines += orderedLineQty;
    if (cumulativeLine < orderedLineQty) {
      isAllCompleted = false;
    }
  }

  let nextStatus = "approved";
  if (totalReceivedAcrossAllLines > 0) {
    nextStatus = isAllCompleted ? "delivered" : "partially_delivered";
  }

  return {
    nextStatus,
    totalReceived: round4(totalReceivedAcrossAllLines),
    totalOrdered: round4(totalOrderedAcrossAllLines),
  };
}
