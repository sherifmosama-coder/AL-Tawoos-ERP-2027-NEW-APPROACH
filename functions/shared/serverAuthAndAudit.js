/**
 * Server-Side Auth Verification, Counter Allocation & Immutable Audit Trail Helpers
 * Shared across all Phase 3 transactional Cloud Functions (Finance, Inventory, Sales).
 */

import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";

export function assertErpCaller(request) {
  const token = request.auth?.token || {};
  if (!request.auth?.uid || token.erpActive !== true) {
    throw new HttpsError(
      "permission-denied",
      "Active authenticated ERP membership is required."
    );
  }
  return {
    authUid: request.auth.uid,
    email: String(token.email || "").toLowerCase(),
    erpUserId: String(token.erpUserId || request.auth.uid),
    role: String(token.role || "standard"),
    isGeneralAdmin: Boolean(token.isGeneralAdmin),
    departmentIds: Array.isArray(token.departmentIds) ? token.departmentIds : [],
  };
}

export function resolveActorIdentity(caller, requestedCurrentUser = null) {
  const canImpersonate = Boolean(caller.isGeneralAdmin);
  const reqId = String(requestedCurrentUser?.id || "").trim();
  const reqName = String(
    requestedCurrentUser?.name || requestedCurrentUser?.nameAr || ""
  ).trim();

  const effectiveUserId =
    canImpersonate && reqId ? reqId : caller.erpUserId;
  const effectiveUserName =
    (canImpersonate && reqName) || reqName || caller.email || caller.erpUserId;

  return {
    authUid: caller.authUid,
    authEmail: caller.email,
    realErpUserId: caller.erpUserId,
    effectiveUserId,
    effectiveUserName,
    isGeneralAdmin: caller.isGeneralAdmin,
    actedAsPersona:
      canImpersonate && reqId && reqId !== caller.erpUserId ? reqId : null,
  };
}

/**
 * Computes a sanitized, shallow diff summary for audit_logs without dumping huge attachments.
 */
export function compactAuditValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.length > 25 ? `[Array(${value.length})]` : value.map(compactAuditValue);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "attachments" || k === "attachment" || k === "signedDocument") {
      out[k] = Array.isArray(v) ? `[Attachments(${v.length})]` : v ? "[Attachment]" : null;
    } else if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Appends an immutable audit_logs entry INSIDE the caller's Firestore transaction.
 */
export function writeAuditLogInTx(
  tx,
  db,
  {
    action,
    module,
    collectionName,
    docId,
    actor,
    summary = "",
    before = null,
    after = null,
  }
) {
  const auditRef = db.collection("audit_logs").doc();
  tx.set(auditRef, {
    id: auditRef.id,
    action: String(action || "mutation"),
    module: String(module || "system"),
    collection: String(collectionName || ""),
    docId: String(docId || ""),
    summary: String(summary || ""),
    actorUid: actor?.authUid || "",
    actorErpUserId: actor?.realErpUserId || "",
    actorEmail: actor?.authEmail || "",
    effectiveUserId: actor?.effectiveUserId || "",
    effectiveUserName: actor?.effectiveUserName || "",
    actedAsPersona: actor?.actedAsPersona || null,
    before: before ? compactAuditValue(before) : null,
    after: after ? compactAuditValue(after) : null,
    timestamp: new Date().toISOString(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Monotonic, collision-free sequential counter inside Firestore runTransaction.
 * Reads `system_counters/{counterId}` (must be called in the read phase before writes!).
 */
export function prepareSequentialCounterFromSnap(counterSnap, counterRef, prefix, padLen = 4) {
  const currentSeq = counterSnap?.exists ? Number(counterSnap.data()?.seq || 0) : 0;
  const nextSeq = currentSeq + 1;
  return {
    nextSeq,
    formattedId: `${prefix}${String(nextSeq).padStart(padLen, "0")}`,
    commitCounter: (tx) => {
      tx.set(
        counterRef,
        {
          id: counterRef.id,
          prefix,
          seq: nextSeq,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    },
  };
}
