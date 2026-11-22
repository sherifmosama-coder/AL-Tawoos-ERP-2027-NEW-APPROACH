/**
 * Server-Side Truck Dispatch & Return Two-Party Handshake Engine (Sub-Phase 3C)
 * - Atomic dispatch confirmation + sales_orders gate locking + dispatch_documents superseding
 * - Server-enforced Separation of Duties for Return Warehouse <-> Accounting handshake
 * - Admin finalization (admin_settle_both, admin_writeoff, admin_reopen) strictly gated to isGeneralAdmin
 * - Atomic DD-XXXXX & RET-XXXXX sequential counters (`system_config/*`) + immutable registry & audit_logs
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
} from "../shared/serverAuthAndAudit.js";

function formatSeqDocNumber(prefix, seq, padLen = 5) {
  const n = Math.max(1, Math.floor(Number(seq) || 0));
  return `${prefix}${String(n).padStart(padLen, "0")}`;
}

export const salesConfirmTruckDispatch = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const tripId = String(data.tripId || data.payload?.id || "").trim();
    const payload = data.payload || null;
    const isEditDispatch = Boolean(data.isEditDispatch);
    const supersedureMeta = data.supersedureMeta || {};

    if (!tripId || !payload) {
      throw new HttpsError("invalid-argument", "tripId and dispatch payload are required.");
    }

    const orderIds = Array.isArray(payload.orderIds)
      ? payload.orderIds.filter(Boolean)
      : [];
    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const dispRef = db.collection("truck_dispatches").doc(tripId);
      const dispSnap = await tx.get(dispRef);
      const existing = dispSnap.exists ? dispSnap.data() : null;

      const orderRefs = orderIds.map((oid) => db.collection("sales_orders").doc(oid));
      const orderSnaps = orderRefs.length > 0
        ? await Promise.all(orderRefs.map((ref) => tx.get(ref)))
        : [];

      let activeRegistryDocs = [];
      if (isEditDispatch) {
        const regSnap = await tx.get(
          db.collection("dispatch_documents").where("tripId", "==", tripId)
        );
        activeRegistryDocs = regSnap.docs;
      }

      // --- WRITE PHASE ---
      tx.set(dispRef, { ...payload, id: tripId }, { merge: true });

      const stampedAt = existing?.dispatchedAt || payload.dispatchedAt || nowIso;
      const stampedByName =
        existing?.dispatchedByName || payload.dispatchedByName || actor.effectiveUserName;

      orderSnaps.forEach((oSnap, idx) => {
        if (!oSnap.exists) return;
        tx.update(orderRefs[idx], {
          fgWarehouseDispatched: true,
          fgWarehouseDispatchId: tripId,
          fgWarehouseDispatchedAt: stampedAt,
          fgWarehouseDispatchedByName: stampedByName,
        });
      });

      if (isEditDispatch && activeRegistryDocs.length > 0) {
        for (const regDoc of activeRegistryDocs) {
          const rData = regDoc.data();
          if (!rData || rData.storedStatus === "superseded") continue;
          tx.update(regDoc.ref, {
            storedStatus: "superseded",
            supersededAt: rData.supersededAt || nowIso,
            supersededBy: rData.supersededBy || actor.effectiveUserName,
            supersededReasonAr:
              supersedureMeta.reasonAr || "تم تعديل بيان الصرف بعد الطباعة",
            supersededReasonEn:
              supersedureMeta.reasonEn || "Dispatch slip modified after printing",
          });
        }
      }

      writeAuditLogInTx(tx, db, {
        action: isEditDispatch ? "update_truck_dispatch" : "confirm_truck_dispatch",
        module: "sales",
        collectionName: "truck_dispatches",
        docId: tripId,
        actor,
        summary: `${isEditDispatch ? "Updated" : "Confirmed"} dispatch ${tripId} (${orderIds.length} order(s))`,
        before: existing ? { dispatchStatus: existing.dispatchStatus } : null,
        after: { dispatchStatus: payload.dispatchStatus, orderIds },
      });
    });

    return { success: true, tripId, orderIds };
  }
);

export const salesSubmitReturnStep = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const mode = String(data.mode || "submit_step").trim();
    const tripId = String(data.tripId || "").trim();
    const payload = data.payload || {};

    if (!tripId) {
      throw new HttpsError("invalid-argument", "tripId is required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const dispRef = db.collection("truck_dispatches").doc(tripId);
      const dispSnap = await tx.get(dispRef);
      const existing = dispSnap.exists ? dispSnap.data() : {};

      if (mode === "assign_task") {
        const taskEntry = data.taskEntry;
        const taskAuditEntry = data.taskAuditEntry;
        if (!taskEntry) {
          throw new HttpsError("invalid-argument", "taskEntry is required.");
        }
        const prevTasks = Array.isArray(existing.returnSettlementTasks)
          ? existing.returnSettlementTasks
          : [];
        const prevAudit = Array.isArray(existing.auditTrail) ? existing.auditTrail : [];

        tx.set(
          dispRef,
          {
            ...payload,
            id: tripId,
            returnSettlementTasks: [...prevTasks, taskEntry],
            auditTrail: taskAuditEntry ? [...prevAudit, taskAuditEntry] : prevAudit,
            updatedAt: nowIso,
            updatedBy: actor.effectiveUserId,
            updatedByName: actor.effectiveUserName,
          },
          { merge: true }
        );

        writeAuditLogInTx(tx, db, {
          action: "assign_return_settlement_task",
          module: "sales",
          collectionName: "truck_dispatches",
          docId: tripId,
          actor,
          summary: `Assigned return settlement task ${taskEntry.id} on ${tripId}`,
          after: { taskId: taskEntry.id },
        });
        return;
      }

      if (mode === "auto_clear") {
        const prevAudit = Array.isArray(existing.auditTrail) ? existing.auditTrail : [];
        const clearAudit = data.clearAudit;
        tx.set(
          dispRef,
          {
            ...payload,
            id: tripId,
            auditTrail: clearAudit ? [...prevAudit, clearAudit] : prevAudit,
            updatedAt: nowIso,
            updatedBy: actor.effectiveUserId,
            updatedByName: actor.effectiveUserName,
          },
          { merge: true }
        );

        writeAuditLogInTx(tx, db, {
          action: "auto_clear_return_variance",
          module: "sales",
          collectionName: "truck_dispatches",
          docId: tripId,
          actor,
          summary: `Auto-cleared return discrepancy on ${tripId} -> ${payload.returnHandshakeStatus || "pending_wh_confirm"}`,
          after: { returnHandshakeStatus: payload.returnHandshakeStatus || "pending_wh_confirm" },
        });
        return;
      }

      // Standard submit_step ('warehouse' | 'accountant')
      const submitRole = String(data.submitRole || "").trim();
      if (submitRole !== "warehouse" && submitRole !== "accountant") {
        throw new HttpsError(
          "invalid-argument",
          "submitRole must be 'warehouse' or 'accountant'."
        );
      }

      // Server-side Separation-of-Duties guard for two-party handshake (unless General Admin)
      if (!caller.isGeneralAdmin) {
        if (
          submitRole === "accountant" &&
          existing.whReturnConfirmedBy &&
          existing.whReturnConfirmedBy === actor.effectiveUserId
        ) {
          throw new HttpsError(
            "permission-denied",
            "Separation of Duties violation: Warehouse receiver cannot self-confirm Accounting alignment."
          );
        }
        if (
          submitRole === "warehouse" &&
          existing.accountantReturnSubmittedBy &&
          existing.accountantReturnSubmittedBy === actor.effectiveUserId
        ) {
          throw new HttpsError(
            "permission-denied",
            "Separation of Duties violation: Accounting submitter cannot self-confirm Warehouse physical receipt."
          );
        }
      }

      const prevAudit = Array.isArray(existing.auditTrail) ? existing.auditTrail : [];
      const returnAuditEntry = data.returnAuditEntry;
      const mergedAudit = returnAuditEntry ? [...prevAudit, returnAuditEntry] : prevAudit;

      const stepUpdate = {
        ...payload,
        id: tripId,
        auditTrail: mergedAudit,
        updatedBy: actor.effectiveUserId,
        updatedByName: actor.effectiveUserName,
        updatedAt: nowIso,
      };
      if (submitRole === "accountant") {
        stepUpdate.accountantReturnSubmittedBy = actor.effectiveUserId;
        stepUpdate.accountantReturnSubmittedByName = actor.effectiveUserName;
        stepUpdate.accountantReturnSubmittedAt = nowIso;
      } else {
        stepUpdate.whReturnConfirmedBy = actor.effectiveUserId;
        stepUpdate.whReturnConfirmedByName = actor.effectiveUserName;
        stepUpdate.whReturnConfirmedAt = nowIso;
      }

      tx.set(dispRef, stepUpdate, { merge: true });

      writeAuditLogInTx(tx, db, {
        action: `submit_return_step_${submitRole}`,
        module: "sales",
        collectionName: "truck_dispatches",
        docId: tripId,
        actor,
        summary: `${submitRole} submitted return step on ${tripId} -> ${stepUpdate.returnHandshakeStatus}`,
        before: { returnHandshakeStatus: existing.returnHandshakeStatus || "none" },
        after: { returnHandshakeStatus: stepUpdate.returnHandshakeStatus },
      });
    });

    return { success: true, tripId };
  }
);

export const salesFinalizeReturnHandshake = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    if (!caller.isGeneralAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Finalizing admin settlement, variance write-off, or reopening returns requires General Admin privileges."
      );
    }

    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const tripId = String(data.tripId || "").trim();
    const actionType = String(data.actionType || "").trim(); // 'admin_settle_both' | 'admin_writeoff' | 'admin_reopen'
    const reason = String(data.reason || "").trim();
    const payload = data.payload || {};

    if (!tripId || !["admin_settle_both", "admin_writeoff", "admin_reopen"].includes(actionType)) {
      throw new HttpsError("invalid-argument", "Valid tripId and admin actionType are required.");
    }
    if ((actionType === "admin_writeoff" || actionType === "admin_reopen") && !reason) {
      throw new HttpsError("invalid-argument", "Mandatory audit reason is required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const dispRef = db.collection("truck_dispatches").doc(tripId);
      const dispSnap = await tx.get(dispRef);
      if (!dispSnap.exists && actionType === "admin_reopen") {
        throw new HttpsError("not-found", `Dispatch ${tripId} not found.`);
      }
      const existing = dispSnap.exists ? dispSnap.data() : {};
      const prevAudit = Array.isArray(existing.auditTrail) ? existing.auditTrail : [];
      const auditEntry = data.auditEntry;

      const updateFields = {
        ...payload,
        id: tripId,
        auditTrail: auditEntry ? [...prevAudit, auditEntry] : prevAudit,
        updatedBy: actor.effectiveUserId,
        updatedByName: actor.effectiveUserName,
        updatedAt: nowIso,
      };

      if (actionType === "admin_reopen") {
        updateFields.returnHandshakeStatus = "discrepancy_pending_accounting";
        updateFields.dispatchStatus = "dispatched";
        updateFields.adminReopenReason = reason;
        updateFields.adminReopenedBy = actor.effectiveUserId;
        updateFields.adminReopenedByName = actor.effectiveUserName;
        updateFields.adminReopenedAt = nowIso;
      } else {
        if (!existing.whReturnConfirmedAt) {
          updateFields.whReturnConfirmedBy = actor.effectiveUserId;
          updateFields.whReturnConfirmedByName = actor.effectiveUserName;
          updateFields.whReturnConfirmedAt = nowIso;
        }
        updateFields.accountantReturnSubmittedBy = actor.effectiveUserId;
        updateFields.accountantReturnSubmittedByName = actor.effectiveUserName;
        updateFields.accountantReturnSubmittedAt = nowIso;
        if (actionType === "admin_writeoff") {
          updateFields.adminWriteOffReason = reason;
          updateFields.adminWriteOffBy = actor.effectiveUserId;
          updateFields.adminWriteOffByName = actor.effectiveUserName;
          updateFields.adminWriteOffAt = nowIso;
        }
      }

      tx.set(dispRef, updateFields, { merge: true });

      writeAuditLogInTx(tx, db, {
        action: `finalize_return_${actionType}`,
        module: "sales",
        collectionName: "truck_dispatches",
        docId: tripId,
        actor,
        summary: `General Admin ${actionType} on ${tripId}${reason ? `: ${reason}` : ""}`,
        before: { returnHandshakeStatus: existing.returnHandshakeStatus || "none" },
        after: { returnHandshakeStatus: updateFields.returnHandshakeStatus },
      });
    });

    return { success: true, tripId, actionType };
  }
);

export const salesMintPrintDocNumber = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const kind = data.kind === "return" ? "return" : "dispatch";
    const counterDocId = kind === "return" ? "return_doc_counter" : "dispatch_doc_counter";
    const prefix = kind === "return" ? "RET-" : "DD-";

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    const minted = await db.runTransaction(async (tx) => {
      const counterRef = db.collection("system_config").doc(counterDocId);
      const snap = await tx.get(counterRef);
      const currentSeq = snap.exists ? Number(snap.data()?.lastSeq || 0) : 0;
      const incremented = currentSeq + 1;
      const formattedNumber = formatSeqDocNumber(prefix, incremented, 5);

      tx.set(
        counterRef,
        {
          lastSeq: incremented,
          lastDocNumber: formattedNumber,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      writeAuditLogInTx(tx, db, {
        action: kind === "return" ? "mint_return_doc_number" : "mint_dispatch_doc_number",
        module: "sales",
        collectionName: "system_config",
        docId: counterDocId,
        actor,
        summary: `Minted sequential document number ${formattedNumber}`,
        after: { seq: incremented, docNumber: formattedNumber },
      });

      return { seq: incremented, docNumber: formattedNumber };
    });

    if (kind === "return") {
      return { returnDocSeq: minted.seq, returnDocNumber: minted.docNumber };
    }
    return { docSeq: minted.seq, docNumber: minted.docNumber };
  }
);

export const salesCommitPrintedDocument = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const tripId = String(data.tripId || "").trim();
    const kind = data.kind === "return" ? "return" : "dispatch";
    const printPayload = data.printPayload || {};
    const registryEntry = data.registryEntry || null;

    if (!tripId) {
      throw new HttpsError("invalid-argument", "tripId is required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const dispRef = db.collection("truck_dispatches").doc(tripId);
      const dispSnap = await tx.get(dispRef);

      let priorDocs = [];
      let regDocExists = false;
      if (kind === "dispatch" && registryEntry?.docNumber) {
        const regRef = db.collection("dispatch_documents").doc(registryEntry.docNumber);
        const [regSnap, tripRegsSnap] = await Promise.all([
          tx.get(regRef),
          tx.get(db.collection("dispatch_documents").where("tripId", "==", tripId)),
        ]);
        regDocExists = regSnap.exists;
        priorDocs = tripRegsSnap.docs;
      }

      // --- WRITE PHASE ---
      if (kind === "dispatch" && registryEntry?.docNumber) {
        if (!regDocExists) {
          tx.set(
            db.collection("dispatch_documents").doc(registryEntry.docNumber),
            registryEntry
          );
        }
        for (const docSnap of priorDocs) {
          const rData = docSnap.data();
          if (!rData || rData.storedStatus === "superseded") continue;
          if (rData.docNumber === registryEntry.docNumber) continue;
          tx.update(docSnap.ref, {
            storedStatus: "superseded",
            supersededAt: rData.supersededAt || nowIso,
            supersededBy: rData.supersededBy || actor.effectiveUserName,
            supersededByDocNumber: registryEntry.docNumber,
            supersededReasonAr: `تم إصدار مستند صرف أحدث (${registryEntry.docNumber})`,
            supersededReasonEn: `Superseded by newer dispatch document (${registryEntry.docNumber})`,
          });
        }
      }

      if (dispSnap.exists || Object.keys(printPayload).length > 0) {
        tx.set(dispRef, printPayload, { merge: true });
      }

      writeAuditLogInTx(tx, db, {
        action: kind === "return" ? "commit_return_print" : "commit_dispatch_print",
        module: "sales",
        collectionName: "truck_dispatches",
        docId: tripId,
        actor,
        summary: `Recorded ${kind} print (${registryEntry?.docNumber || printPayload.latestReturnDocNumber || printPayload.latestDispatchDocNumber || tripId})`,
        after: {
          docNumber:
            registryEntry?.docNumber ||
            printPayload.latestReturnDocNumber ||
            printPayload.latestDispatchDocNumber ||
            null,
        },
      });
    });

    return { success: true, tripId };
  }
);
