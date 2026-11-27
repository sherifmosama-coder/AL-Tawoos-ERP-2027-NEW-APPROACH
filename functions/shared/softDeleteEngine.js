/**
 * Phase 4 Transactional Soft-Delete & Safeguard Engine
 * -----------------------------------------------------
 * Replaces destructive hard `deleteDoc` calls on core financial/sales/inventory
 * collections with audited `isDeleted: true` soft deletes + relational dependency guards.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
} from "./serverAuthAndAudit.js";

const BLOCKED_FULFILLMENT_STATUSES = new Set(["shipped", "delivered", "paid"]);

export const systemSoftDeleteDocument = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const collectionName = String(data.collectionName || "").trim();
    const docId = String(data.docId || "").trim();
    const reason = String(data.reason || "").trim();

    const ALLOWED = new Set([
      "sales_orders",
      "purchase_orders",
      "work_orders",
      "corporate_banks",
    ]);
    if (!ALLOWED.has(collectionName) || !docId) {
      throw new HttpsError(
        "invalid-argument",
        "Valid target collectionName and docId are required."
      );
    }
    if (collectionName === "corporate_banks" && !caller.isGeneralAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Deleting corporate bank accounts requires General Admin privileges."
      );
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const targetRef = db.collection(collectionName).doc(docId);
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) {
        throw new HttpsError("not-found", `${collectionName}/${docId} not found.`);
      }
      const existing = targetSnap.data() || {};
      if (existing.isDeleted) {
        throw new HttpsError(
          "failed-precondition",
          `${collectionName}/${docId} is already deleted.`
        );
      }

      let linkedWoTransSnap = null;
      let linkedWoTransRef = null;

      if (collectionName === "sales_orders") {
        // Sales Order Delete Safeguard:
        // Block deletion if dispatched, printed on DD-XXXXX, post-dispatch fulfilled, or holding live split children
        const [tripsSnap, docsSnap, splitChildrenSnap] = await Promise.all([
          tx.get(
            db.collection("truck_dispatches").where("orderIds", "array-contains", docId)
          ),
          tx.get(
            db.collection("dispatch_documents").where("orderIds", "array-contains", docId)
          ),
          tx.get(
            db.collection("sales_orders").where("splitParentId", "==", docId)
          ),
        ]);

        const isDispatched = Boolean(existing.fgWarehouseDispatched);
        const fStatus = String(existing.fulfillmentStatus || "not_yet").trim();
        const hasTrips = tripsSnap.docs.some((d) => !d.data()?.isDeleted);
        const hasPrintedDocs = docsSnap.docs.some((d) => !d.data()?.isDeleted);
        const hasLiveSplitChildren = splitChildrenSnap.docs.some(
          (d) => d.id !== docId && !d.data()?.isDeleted
        );

        if (isDispatched || BLOCKED_FULFILLMENT_STATUSES.has(fStatus) || hasTrips || hasPrintedDocs) {
          throw new HttpsError(
            "failed-precondition",
            "لا يمكن حذف أمر بيع مرتبط بإذن صرف شاحنة أو مستند صرف (DD) أو تم تسليمه/صرفه. استخدم (إلغاء أمر البيع) بدلاً من الحذف."
          );
        }
        if (hasLiveSplitChildren) {
          throw new HttpsError(
            "failed-precondition",
            "لا يمكن حذف أمر بيع مقسّم قبل حذف أو إلغاء أجزائه الفرعية أولاً."
          );
        }
      } else if (collectionName === "purchase_orders") {
        const grnSnap = await tx.get(
          db.collection("goods_receipts").where("poId", "==", docId)
        );
        const activeGrns = grnSnap.docs
          .filter((d) => {
            const g = d.data() || {};
            return !g.isDeleted && g.status !== "cancelled" && g.status !== "reversed";
          })
          .map((d) => d.id);
        if (activeGrns.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            `Cannot delete PO (${docId}): active Goods Receipts (${activeGrns.join(", ")}) are attached.`
          );
        }
      } else if (collectionName === "work_orders") {
        if (Array.isArray(existing.pallets) && existing.pallets.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            "Cannot delete Work Order with registered pallets. Delete pallets first."
          );
        }
        linkedWoTransRef = db
          .collection("production_transformations")
          .doc(`TRANS-WO-${docId}`);
        linkedWoTransSnap = await tx.get(linkedWoTransRef);
      }

      // --- WRITE PHASE ---
      tx.set(
        targetRef,
        {
          isDeleted: true,
          deletedAt: nowIso,
          deletedBy: actor.effectiveUserName,
          deletedById: actor.effectiveUserId,
          deletionReason: reason || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (linkedWoTransSnap?.exists) {
        tx.set(
          linkedWoTransRef,
          {
            isDeleted: true,
            status: "deleted",
            deletedAt: nowIso,
            deletedBy: actor.effectiveUserName,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const moduleMap = {
        sales_orders: "sales",
        purchase_orders: "inventory",
        work_orders: "inventory",
        corporate_banks: "finance",
      };

      writeAuditLogInTx(tx, db, {
        action: `soft_delete_${collectionName.slice(0, -1)}`,
        module: moduleMap[collectionName] || "system",
        collectionName,
        docId,
        actor,
        summary: `Soft-deleted ${collectionName}/${docId}${reason ? `: ${reason}` : ""}`,
        before: {
          status: existing.status || existing.fulfillmentStatus || null,
          serial: existing.serial || existing.orderNumber || existing.id || docId,
        },
        after: { isDeleted: true, deletedAt: nowIso },
      });
    });

    return { success: true, collectionName, docId, softDeleted: true };
  }
);
