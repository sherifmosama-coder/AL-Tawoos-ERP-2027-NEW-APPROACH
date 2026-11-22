/**
 * Canonical Zod Schemas & Financial Invariant Validators for Treasury, Dues & GL.
 */
import { z } from 'zod';

export const journalEntryLineSchema = z
  .object({
    accountCode: z.string().min(1),
    accountName: z.string().optional(),
    debit: z.number().finite().min(0).default(0),
    credit: z.number().finite().min(0).default(0),
    costCenterId: z.string().nullable().optional(),
  })
  .passthrough();

export const journalEntrySchema = z
  .object({
    id: z.string().min(1),
    date: z.string().optional(),
    description: z.string().optional(),
    lines: z.array(journalEntryLineSchema).min(2),
  })
  .passthrough();

/**
 * Enforces strict double-entry equality (sum of Debits === sum of Credits).
 */
export function assertBalancedJournalEntry(entry, tolerance = 0.01) {
  const parsed = journalEntrySchema.parse(entry);
  let totalDebit = 0;
  let totalCredit = 0;
  parsed.lines.forEach((l) => {
    totalDebit += Number(l.debit || 0);
    totalCredit += Number(l.credit || 0);
  });
  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > tolerance) {
    throw new Error(
      `Unbalanced Journal Entry (${parsed.id}): Debit=${totalDebit.toFixed(2)} !== Credit=${totalCredit.toFixed(2)}`
    );
  }
  if (totalDebit <= 0) {
    throw new Error(`Zero-value Journal Entry (${parsed.id}) is not permitted.`);
  }
  return {
    entry: parsed,
    totalDebit: Number(totalDebit.toFixed(2)),
    totalCredit: Number(totalCredit.toFixed(2)),
  };
}

export const cashTransactionSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    safeId: z.string().optional(),
    targetSafeId: z.string().optional(),
    bankId: z.string().optional(),
    direction: z.enum(['in', 'out', 'zero_sum', 'variable']).optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const duesSettlementSchema = z
  .object({
    id: z.string().min(1),
    docId: z.string().optional(),
    netPayable: z.number().finite().optional(),
    remainingAmount: z.number().finite().optional(),
    status: z.string().optional(),
  })
  .passthrough();

/**
 * Enforces strict anti-overpayment rule: 0 < releaseAmount <= remainingAmount.
 */
export function assertValidDuesRelease({ remainingAmount, releaseAmount }) {
  const rem = Number(remainingAmount || 0);
  const rel = Number(releaseAmount || 0);
  if (!Number.isFinite(rel) || rel <= 0) {
    throw new Error(`Invalid payment release amount (${releaseAmount}): must be > 0.`);
  }
  if (rel - rem > 0.01) {
    throw new Error(
      `Overpayment prevented: release amount (${rel.toFixed(2)}) exceeds remaining balance (${rem.toFixed(2)}).`
    );
  }
  return Number(Math.min(rem, rel).toFixed(2));
}
