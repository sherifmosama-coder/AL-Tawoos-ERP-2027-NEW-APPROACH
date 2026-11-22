/**
 * Canonical Zod Schemas for Sales Orders, Loading Plan, Truck Dispatch & Receiving.
 */
import { z } from 'zod';

export const salesOrderLineSchema = z
  .object({
    productId: z.string().optional(),
    productCode: z.string().optional(),
    packagingOptionSuffix: z.string().optional(),
    qty: z.number().finite().nonnegative().default(0),
    bonus: z.number().finite().nonnegative().default(0),
    dispatchedQty: z.number().finite().nonnegative().optional(),
    dispatchedBonus: z.number().finite().nonnegative().optional(),
    returnedCartons: z.number().finite().nonnegative().optional(),
    unitPrice: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

export const salesOrderSchema = z
  .object({
    id: z.string().min(1),
    orderType: z.enum(['supply', 'return_deduct', 'return_no_deduct', 'bonus_only', 'sample']).default('supply'),
    fulfillmentStatus: z.string().default('not_yet'),
    loadingDate: z.string().optional(),
    loadingOrderNumber: z.number().nonnegative().optional(),
    settledFromTripExtras: z.boolean().optional(),
    isPostDispatchSettlementOrder: z.boolean().optional(),
    hasPartialRejection: z.boolean().optional(),
    lines: z.array(salesOrderLineSchema).default([]),
  })
  .passthrough();

export const dispatchColumnSchema = z
  .object({
    colKey: z.string().min(1),
    productCode: z.string().optional(),
    optionSuffix: z.string().optional(),
    lockedQty: z.number().finite().nonnegative().optional(),
    extraQty: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

export const truckDispatchSchema = z
  .object({
    id: z.string().min(1),
    loadingDate: z.string().min(1),
    loadingOrderNumber: z.number().positive(),
    dispatchStatus: z.string().optional(),
    returnHandshakeStatus: z
      .enum(['none', 'pending_wh_confirm', 'pending_accounting_confirm', 'discrepancy_pending_accounting', 'reconciled'])
      .optional(),
    columns: z.array(dispatchColumnSchema).optional(),
  })
  .passthrough();
