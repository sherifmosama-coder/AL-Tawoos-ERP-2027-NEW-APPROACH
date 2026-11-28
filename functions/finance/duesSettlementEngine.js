/**
 * Server-Side Dues Settlements, Batch Releases & Sequential 1% WHT Certificates Engine
 * - Atomically commits multi-row supplier batch releases inside ONE Firestore `runTransaction`
 * - Enforces live server-side anti-overpayment checks against current Firestore balances
 * - Allocates monotonic, collision-free `PAY-YYYYMMDD-NNN` and `WHT-YYYY-NNNN` serial numbers
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
  prepareSequentialCounterFromSnap,
} from "../shared/serverAuthAndAudit.js";
import { round2, assertValidDuesReleaseServer } from "./financeValidators.js";

export const financeReleaseDuesBatchPayment = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const supplierId = String(data.supplierId || "").trim();
    const supplierName = String(data.supplierName || "").trim();
    const paymentDate = String(data.paymentDate || new Date().toISOString().slice(0, 10)).trim();
    const paymentMethod = String(data.paymentMethod || "cash").trim();
    const sourceLabel = String(data.sourceLabel || "").trim();
    const sourceSafeId = paymentMethod === "cash" ? data.sourceSafeId || null : null;
    const sourceBankId = paymentMethod !== "cash" ? data.sourceBankId || null : null;
    const transferRefNumber = paymentMethod === "transfer" ? data.transferRefNumber || null : null;
    const chequeNumber = paymentMethod === "cheque" ? data.chequeNumber || null : null;
    const chequeDueDate = paymentMethod === "cheque" ? data.chequeDueDate || null : null;
    const paymentNotes = String(data.paymentNotes || "");
    const paymentAttachment = data.paymentAttachment || null;
    const items = Array.isArray(data.items) ? data.items : [];

    if (!supplierId || items.length === 0) {
      throw new HttpsError("invalid-argument", "Supplier ID and at least 1 due item are required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();
    const dateCompact = paymentDate.replace(/-/g, "");
    const counterId = `dues_batch_${dateCompact}`;

    const result = await db.runTransaction(async (tx) => {
      const counterRef = db.collection("system_counters").doc(counterId);
      const counterSnap = await tx.get(counterRef);
      const seqPlan = prepareSequentialCounterFromSnap(
        counterSnap,
        counterRef,
        `PAY-${dateCompact}-`,
        3
      );
      const batchId = seqPlan.formattedId;

      // Read ALL target dues_settlements docs before any write
      const rowReads = await Promise.all(
        items.map(async (item) => {
          const rowId = String(item.id || "").trim();
          if (!rowId) {
            throw new HttpsError("invalid-argument", "Every batch item requires a due row ID.");
          }
          const ref = db.collection("dues_settlements").doc(rowId);
          const snap = await tx.get(ref);
          return { item, ref, snap };
        })
      );

      let totalPositiveRelease = 0;
      let totalReturnDeduction = 0;
      const allocatedItems = [];

      const stagedWrites = [];

      for (const { item, ref, snap } of rowReads) {
        const existingDoc = snap.exists ? snap.data() : {};
        const docType = item.docType || existingDoc.docType || "invoice";
        const originalDueAmount = Number(
          existingDoc.originalDueAmount !== undefined
            ? existingDoc.originalDueAmount
            : item.originalDueAmount
        ) || 0;
        const prevDirectPaid = round2(Number(existingDoc.paidAmount) || 0);
        const prePaidViaPoAdvanceAmount = round2(
          Number(item.prePaidViaPoAdvanceAmount) || 0
        );

        const currentServerRemaining =
          docType === "return"
            ? Math.min(0, round2(originalDueAmount - prevDirectPaid))
            : Math.max(
                0,
                round2(originalDueAmount - round2(prevDirectPaid + prePaidViaPoAdvanceAmount))
              );

        const releaseAmt = assertValidDuesReleaseServer({
          remainingAmount: currentServerRemaining,
          releaseAmount: item.releaseAmount,
          docType,
        });

        if (docType === "return") {
          totalReturnDeduction = round2(totalReturnDeduction + Math.abs(releaseAmt));
        } else {
          totalPositiveRelease = round2(totalPositiveRelease + releaseAmt);
        }

        const newDirectPaid = round2(prevDirectPaid + releaseAmt);
        const totalEffectivePaid = round2(newDirectPaid + prePaidViaPoAdvanceAmount);
        const newRemaining =
          docType === "return"
            ? Math.min(0, round2(originalDueAmount - newDirectPaid))
            : Math.max(0, round2(originalDueAmount - totalEffectivePaid));

        const resultingStatus = Math.abs(newRemaining) <= 0.009 ? "closed" : "partially_closed";

        const paymentEntry = {
          batchId,
          amount: releaseAmt,
          paymentDate,
          paymentMethod,
          sourceLabel,
          sourceSafeId,
          sourceBankId,
          transferRefNumber,
          chequeNumber,
          chequeDueDate,
          notes: paymentNotes,
          attachment: paymentAttachment,
          recordedBy: actor.effectiveUserName,
          recordedAt: nowIso,
        };

        const updatedHistory = [
          ...(Array.isArray(existingDoc.paymentsHistory) ? existingDoc.paymentsHistory : []),
          paymentEntry,
        ];

        stagedWrites.push({
          ref,
          payload: {
            id: item.id,
            docId: item.docId || existingDoc.docId || item.id,
            docType,
            poId: item.poId || existingDoc.poId || null,
            supplierId,
            supplierName: supplierName || existingDoc.supplierName || "",
            trancheIndex: item.trancheIndex ?? existingDoc.trancheIndex ?? 0,
            originalDueAmount,
            paidAmount: newDirectPaid,
            remainingAmount: newRemaining,
            status: resultingStatus,
            lastPaymentMethod: paymentMethod,
            lastPaymentSource: sourceLabel,
            lastPaymentDate: paymentDate,
            paymentsHistory: updatedHistory,
            updatedAt: FieldValue.serverTimestamp(),
          },
        });

        allocatedItems.push({
          trancheId: item.id,
          docId: item.docId || item.id,
          docType,
          dueDate: item.dueDate || null,
          remainingBefore: currentServerRemaining,
          releasedAmount: releaseAmt,
          remainingAfter: newRemaining,
          resultingStatus,
        });
      }

      const netReleaseAmount = round2(totalPositiveRelease - totalReturnDeduction);
      if (netReleaseAmount < 0) {
        throw new HttpsError(
          "invalid-argument",
          "صافي الدفعة بالسالب — إجمالي المرتجعات المخصومة أكبر من إجمالي الدفعات المختارة."
        );
      }

      // Commit phase: counter + settlements + batch doc + audit log
      seqPlan.commitCounter(tx);
      for (const w of stagedWrites) {
        tx.set(w.ref, w.payload, { merge: true });
      }

      const batchDoc = {
        id: batchId,
        supplierId,
        supplierName,
        paymentDate,
        paymentMethod,
        sourceLabel,
        sourceSafeId,
        sourceBankId,
        transferRefNumber,
        chequeNumber,
        chequeDueDate,
        totalPositiveRelease,
        totalReturnDeduction,
        netReleaseAmount,
        allocatedItems,
        notes: paymentNotes,
        attachment: paymentAttachment,
        createdBy: actor.effectiveUserName,
        createdByUserId: actor.effectiveUserId,
        createdAtIso: nowIso,
        createdAt: FieldValue.serverTimestamp(),
      };
      tx.set(db.collection("dues_batches").doc(batchId), batchDoc);

      writeAuditLogInTx(tx, db, {
        action: "dues_batch_payment_released",
        module: "finance",
        collectionName: "dues_batches",
        docId: batchId,
        actor,
        summary: `Released batch ${batchId} for supplier ${supplierId}: net ${netReleaseAmount}`,
        after: batchDoc,
      });

      return { batchId, netReleaseAmount, allocatedItems };
    });

    return { success: true, ...result };
  }
);

export const financeIssueWhtNote = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const record = data.record || {};
    const supplier = data.supplier || {};
    const docId = String(record.docId || "").trim();

    if (!docId) {
      throw new HttpsError("invalid-argument", "Document ID is required to issue a WHT note.");
    }

    const yearStr = String(
      record.invoiceDate || record.sourceDate || new Date().toISOString()
    ).slice(0, 4);
    const issueDate = new Date().toISOString().slice(0, 10);

    const db = getFirestore();
    const whtPayload = await db.runTransaction(async (tx) => {
      const whtRef = db.collection("wht_notes").doc(docId);
      const existingSnap = await tx.get(whtRef);
      if (existingSnap.exists) {
        return { existing: true, whtData: existingSnap.data() };
      }

      const counterRef = db.collection("system_counters").doc(`wht_${yearStr}`);
      const counterSnap = await tx.get(counterRef);
      const seqPlan = prepareSequentialCounterFromSnap(
        counterSnap,
        counterRef,
        `WHT-${yearStr}-`,
        4
      );

      seqPlan.commitCounter(tx);
      const payload = {
        id: docId,
        grnId: docId,
        docType: record.docType || "invoice",
        serialNumber: seqPlan.formattedId,
        issueDate,
        supplierId: record.supplierId || "",
        supplierName: supplier.name || record.supplierName || "",
        taxpayerLegalName: supplier.taxpayerLegalName || supplier.name || "",
        taxCardNumber: supplier.taxCardNumber || "",
        taxFileNumber: supplier.taxFileNumber || "",
        taxDistrict: supplier.taxDistrict || "",
        invoiceNumber: record.invoiceNumber || "",
        invoiceDate: record.invoiceDate || record.sourceDate || issueDate,
        receiptDate: record.sourceDate || issueDate,
        subtotal: Math.abs(Number(record.docSubtotal) || 0),
        totalVat: Math.abs(Number(record.docTotalVat) || 0),
        totalWht: Math.abs(Number(record.docTotalWht) || 0),
        netPayable: Math.abs(Number(record.docNetPayable) || 0),
        whtPercent: 1,
        isDeliveredToSupplier: false,
        issuedBy: actor.effectiveUserName,
        issuedByUserId: actor.effectiveUserId,
        createdAt: new Date().toISOString(),
      };
      tx.set(whtRef, payload, { merge: true });

      writeAuditLogInTx(tx, db, {
        action: "wht_note_issued",
        module: "finance",
        collectionName: "wht_notes",
        docId,
        actor,
        summary: `Issued WHT ${payload.serialNumber} for ${docId}`,
        after: payload,
      });

      return { existing: false, whtData: payload };
    });

    return { success: true, ...whtPayload };
  }
);
