/**
 * Canonical Zod Schemas for Inventory, Procurement, Goods Receipts & Transfers.
 */
import { z } from 'zod';

export const goodsReceiptLineSchema = z
  .object({
    itemId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    variantCode: z.string().optional(),
    qty: z.number().finite().nonnegative().optional(),
    receivedQty: z.number().finite().nonnegative().optional(),
    unitCost: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

export const goodsReceiptSchema = z
  .object({
    id: z.string().min(1),
    docType: z.string().optional(),
    supplierId: z.string().optional(),
    warehouseId: z.string().optional(),
    lines: z.array(goodsReceiptLineSchema).default([]),
    status: z.string().optional(),
  })
  .passthrough();

export const stockLedgerEntrySchema = z
  .object({
    id: z.string().min(1).optional(),
    itemId: z.string().min(1),
    variantCode: z.string().optional(),
    warehouseId: z.string().optional(),
    qty: z.number().finite(),
    docType: z.string().optional(),
    action: z.string().optional(),
  })
  .passthrough();

export const stockTransferSchema = z
  .object({
    id: z.string().min(1),
    sourceWarehouse: z.string().optional(),
    targetWarehouse: z.string().optional(),
    transferType: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();
