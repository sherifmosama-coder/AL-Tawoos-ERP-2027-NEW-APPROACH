/**
 * Server-Side Journal Entries & Reversal Engine
 * - Enforces double-entry balance (Total Debit === Total Credit) strictly server-side
 * - Executes journal reversals & GRN reversals inside an atomic Firestore `runTransaction`
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
} from "../shared/serverAuthAndAudit.js";
import { assertBalancedJournalEntryServer } from "./financeValidators.js";

export function buildServerReversalJournalEntry(
  originalEntry,
  reason = "",
  actorName = "System"
) {
  if (!originalEntry || !Array.isArray(originalEntry.lines)) return null;
  const baseSource =
    originalEntry.sourceDocId || String(originalEntry.id || "").replace("JE-", "");
  const revId = `JE-REV-${baseSource}`;

  const reversedLines = originalEntry.lines.map((l) => ({
    accountCode: l.accountCode,
    accountNameAr: l.accountNameAr || l.accountCode,
    nature: Number(l.debit) > 0 ? "credit" : "debit",
    debit: Number(l.credit) || 0,
    credit: Number(l.debit) || 0,
    subledgerId: l.subledgerId || null,
    subledgerName: l.subledgerName || null,
    subledgerType: l.subledgerType || null,
    notes: `قيد عكسي إداري لإلغاء القيد ${originalEntry.id}: ${l.notes || ""}`,
  }));

  const { totalDebit, totalCredit } = assertBalancedJournalEntryServer({
    lines: reversedLines,
  });

  const nowIso = new Date().toISOString();
  return {
    id: revId,
    entryNumber: revId,
    sourceDocType: "reversal",
    originalEntryId: originalEntry.id,
    sourceDocId: originalEntry.sourceDocId || originalEntry.id,
    docLabelAr: "قيد عكسي / إلغاء مستند",
    docLabelEn: "Reversal Journal Entry",
    entryDate: nowIso.split("T")[0],
    descriptionAr: `قيد عكسي لإلغاء ${originalEntry.docLabelAr || "المستند"} (${originalEntry.sourceDocId || originalEntry.id}) - السبب: ${reason || "إلغاء إداري"}`,
    descriptionEn: `Reversal of ${originalEntry.id} - Reason: ${reason || "Admin cancellation"}`,
    referenceNumber: originalEntry.referenceNumber || originalEntry.id,
    supplierId: originalEntry.supplierId || "",
    supplierName: originalEntry.supplierName || "",
    status: "posted",
    financials: originalEntry.financials || {},
    lines: reversedLines,
    totalDebit,
    totalCredit,
    isBalanced: true,
    isTaxOfficial: Boolean(originalEntry.isTaxOfficial),
    etaPortalRegistered: Boolean(originalEntry.etaPortalRegistered),
    attachments: Array.isArray(originalEntry.attachments)
      ? originalEntry.attachments
      : [],
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: actorName,
  };
}

export const financePostManualJournalEntry = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const rawEntry = data.entry || {};

    let totals;
    try {
      totals = assertBalancedJournalEntryServer(rawEntry);
    } catch (err) {
      throw new HttpsError("invalid-argument", err.message);
    }

    const nowIso = new Date().toISOString();
    const entryId =
      String(rawEntry.id || "").trim() || `JE-MAN-${Date.now().toString().slice(-6)}`;

    const cleanLines = rawEntry.lines
      .filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0)
      .map((l) => ({
        accountCode: String(l.accountCode || "").trim(),
        accountNameAr: l.accountNameAr || l.accountCode,
        accountNameEn: l.accountNameEn || l.accountNameAr || l.accountCode,
        nature: Number(l.debit) > 0 ? "debit" : "credit",
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        subledgerType: l.subledgerType || "",
        subledgerId: l.subledgerId || "",
        subledgerName: l.subledgerName || "",
        costCenterId: l.costCenterId || "",
        notes: l.notes || "",
      }));

    const entryPayload = {
      id: entryId,
      entryNumber: entryId,
      sourceDocType: "manual_adjustment",
      docLabelAr: rawEntry.docLabelAr || "قيد تسوية وتصحيح يدوي",
      docLabelEn: rawEntry.docLabelEn || "Manual Adjustment Entry",
      entryDate: String(rawEntry.entryDate || nowIso.slice(0, 10)),
      category: String(rawEntry.category || "adjustment"),
      referenceNumber: String(rawEntry.referenceNumber || entryId).trim(),
      descriptionAr: String(rawEntry.descriptionAr || "").trim(),
      descriptionEn:
        String(rawEntry.descriptionEn || rawEntry.descriptionAr || "").trim(),
      status: "posted",
      streamType: "accrual",
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      isBalanced: true,
      lines: cleanLines,
      attachments: Array.isArray(rawEntry.attachments) ? rawEntry.attachments : [],
      isTaxOfficial: Boolean(rawEntry.isTaxOfficial),
      createdBy: actor.effectiveUserName,
      createdByUserId: actor.effectiveUserId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const jeRef = db.collection("journal_entries").doc(entryId);
      const snap = await tx.get(jeRef);
      if (snap.exists) {
        throw new HttpsError("already-exists", `Journal entry ${entryId} already exists.`);
      }
      tx.set(jeRef, entryPayload);
      writeAuditLogInTx(tx, db, {
        action: "manual_journal_posted",
        module: "finance",
        collectionName: "journal_entries",
        docId: entryId,
        actor,
        summary: `Manual JE ${entryId} balanced at ${totals.totalDebit}`,
        after: entryPayload,
      });
    });

    return { success: true, entryId, entryPayload };
  }
);

export const financeReverseJournalEntry = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const entryId = String(data.entryId || "").trim();
    const reason = String(data.reason || "").trim();

    if (!entryId) {
      throw new HttpsError("invalid-argument", "Journal entry ID is required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    const reversalJeId = await db.runTransaction(async (tx) => {
      const originalJeRef = db.collection("journal_entries").doc(entryId);
      const origSnap = await tx.get(originalJeRef);
      if (!origSnap.exists) {
        throw new HttpsError("not-found", `Journal entry ${entryId} not found.`);
      }
      const origData = origSnap.data();
      if (origData.status === "reversed" || origData.isReversed) {
        throw new HttpsError(
          "failed-precondition",
          `Journal entry ${entryId} has already been reversed.`
        );
      }

      const revPayload = buildServerReversalJournalEntry(
        { id: entryId, ...origData },
        reason,
        actor.effectiveUserName
      );
      if (!revPayload) {
        throw new HttpsError(
          "failed-precondition",
          "Original journal entry contains no reversible lines."
        );
      }

      const revJeRef = db.collection("journal_entries").doc(revPayload.id);
      const revSnap = await tx.get(revJeRef);
      if (revSnap.exists) {
        throw new HttpsError(
          "already-exists",
          `Reversal entry ${revPayload.id} already exists.`
        );
      }

      const sourceDocId =
        origData.sourceDocId ||
        entryId.replace("JE-REV-", "").replace("JE-", "");
      const grnRef = sourceDocId
        ? db.collection("goods_receipts").doc(sourceDocId)
        : null;
      const grnSnap = grnRef ? await tx.get(grnRef) : null;

      tx.update(originalJeRef, {
        status: "reversed",
        isReversed: true,
        reversalEntryId: revPayload.id,
        reversalReason: reason,
        reversedBy: actor.effectiveUserName,
        reversedAt: nowIso,
        updatedAt: nowIso,
      });

      tx.set(revJeRef, revPayload);

      if (grnRef && grnSnap?.exists) {
        tx.set(
          grnRef,
          {
            status: "reversed",
            isReversed: true,
            reversalReason: reason,
            reversedBy: actor.effectiveUserName,
            reversedAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }

      writeAuditLogInTx(tx, db, {
        action: "journal_entry_reversed",
        module: "finance",
        collectionName: "journal_entries",
        docId: entryId,
        actor,
        summary: `Reversed JE ${entryId} -> ${revPayload.id}: ${reason || "Admin cancellation"}`,
        before: { status: origData.status, totalDebit: origData.totalDebit },
        after: { status: "reversed", reversalEntryId: revPayload.id },
      });

      return revPayload.id;
    });

    return { success: true, reversalEntryId: reversalJeId };
  }
);
