/**
 * Server-Side Production Work Order Materialization & Pallet Reversal Engine
 * Atomically updates Floor Liquid Vessels, Production Transformations,
 * Staged Floor Pallets, Work Orders, and Audit Logs in ONE Firestore transaction.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
} from "../shared/serverAuthAndAudit.js";

export const inventoryRegisterWorkOrderPallet = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const workOrderId = String(data.workOrderId || "").trim();
    const palletId = String(data.palletId || "").trim();
    const transformationDoc = data.transformationDoc || null;
    const stagedPalletDoc = data.stagedPalletDoc || null;
    const updatedPallets = Array.isArray(data.updatedPallets) ? data.updatedPallets : null;
    const vesselPatches = data.vesselPatches && typeof data.vesselPatches === "object"
      ? data.vesselPatches
      : {};

    if (!workOrderId || !palletId || !transformationDoc || !stagedPalletDoc || !updatedPallets) {
      throw new HttpsError(
        "invalid-argument",
        "workOrderId, palletId, transformationDoc, stagedPalletDoc, and updatedPallets are required."
      );
    }

    const db = getFirestore();
    const pTransId = transformationDoc.id || `TRANS-PAL-${palletId}`;

    await db.runTransaction(async (tx) => {
      const woRef = db.collection("work_orders").doc(workOrderId);
      const prodWoRef = db.collection("production_work_orders").doc(workOrderId);
      const stagedRef = db.collection("staged_floor_pallets").doc(palletId);
      const transRef = db.collection("production_transformations").doc(pTransId);

      const vesselKeys = Object.keys(vesselPatches);
      const [woSnap, prodWoSnap, existingStagedSnap, ...vesselSnaps] = await Promise.all([
        tx.get(woRef),
        tx.get(prodWoRef),
        tx.get(stagedRef),
        ...vesselKeys.map((matCode) => tx.get(db.collection("floor_liquid_vessels").doc(matCode))),
      ]);

      if (!woSnap.exists && !prodWoSnap.exists) {
        throw new HttpsError("not-found", `Work order ${workOrderId} not found.`);
      }
      if (existingStagedSnap.exists && existingStagedSnap.data()?.status !== "reversed") {
        throw new HttpsError(
          "already-exists",
          `Pallet ${palletId} is already staged (${existingStagedSnap.data()?.status}).`
        );
      }

      // --- WRITE PHASE ---
      vesselKeys.forEach((matCode, idx) => {
        const patch = vesselPatches[matCode];
        const vSnap = vesselSnaps[idx];
        const baseVessel = vSnap?.exists ? vSnap.data() : patch.originalData || {};
        const activeTanks = Array.isArray(patch.activeTanks) ? patch.activeTanks : [];
        const historyTanks = Array.isArray(patch.historyTanks) ? patch.historyTanks : [];
        const newVol = activeTanks.reduce((s, t) => s + (Number(t.remainingVolume) || 0), 0);

        tx.set(
          db.collection("floor_liquid_vessels").doc(matCode),
          {
            ...baseVessel,
            activeTanks,
            historyTanks,
            currentVolume: newVol,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      tx.set(
        transRef,
        {
          ...transformationDoc,
          id: pTransId,
          registeredBy: transformationDoc.registeredBy || actor.effectiveUserName,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        stagedRef,
        {
          ...stagedPalletDoc,
          id: palletId,
          palletId,
          materializedBy: stagedPalletDoc.materializedBy || actor.effectiveUserName,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (woSnap.exists) {
        tx.update(woRef, {
          pallets: updatedPallets,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (prodWoSnap.exists) {
        tx.update(prodWoRef, {
          pallets: updatedPallets,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      writeAuditLogInTx(tx, db, {
        action: "register_work_order_pallet",
        module: "inventory",
        collectionName: "work_orders",
        docId: workOrderId,
        actor,
        summary: `Materialized Pallet ${palletId} on Work Order ${workOrderId}`,
        after: {
          palletId,
          pTransId,
          qtyLarge: stagedPalletDoc.qtyLarge || 0,
          vesselsTouched: vesselKeys,
        },
      });
    });

    return { success: true, workOrderId, palletId, transformationId: pTransId };
  }
);

export const inventoryReverseWorkOrderPallet = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    if (!caller.isGeneralAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Admin pallet reversal requires General Admin privileges."
      );
    }

    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const workOrderId = String(data.workOrderId || "").trim();
    const palletId = String(data.palletId || "").trim();
    const reason = String(data.reason || "").trim();
    const vesselUpdates = data.vesselUpdates && typeof data.vesselUpdates === "object"
      ? data.vesselUpdates
      : {};
    const updatedPallets = Array.isArray(data.updatedPallets) ? data.updatedPallets : [];
    const orderSummaryUpdates = data.orderSummaryUpdates || {};

    if (!workOrderId || !palletId || !reason) {
      throw new HttpsError(
        "invalid-argument",
        "workOrderId, palletId, and reversal reason are required."
      );
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();
    const transId = `TRANS-PAL-${palletId}`;

    await db.runTransaction(async (tx) => {
      const woRef = db.collection("work_orders").doc(workOrderId);
      const prodWoRef = db.collection("production_work_orders").doc(workOrderId);
      const transRef = db.collection("production_transformations").doc(transId);
      const stagedRef = db.collection("staged_floor_pallets").doc(palletId);

      const vesselKeys = Object.keys(vesselUpdates);
      const [woSnap, prodWoSnap, ...vesselSnaps] = await Promise.all([
        tx.get(woRef),
        tx.get(prodWoRef),
        ...vesselKeys.map((vId) => tx.get(db.collection("floor_liquid_vessels").doc(vId))),
      ]);

      if (!woSnap.exists && !prodWoSnap.exists) {
        throw new HttpsError("not-found", `Work order ${workOrderId} not found.`);
      }

      // Restore vessels
      vesselKeys.forEach((vId, idx) => {
        const vSnap = vesselSnaps[idx];
        const vPatch = vesselUpdates[vId];
        if (!vSnap?.exists || !vPatch) return;
        const activeTanks = Array.isArray(vPatch.activeTanks) ? vPatch.activeTanks : [];
        const historyTanks = Array.isArray(vPatch.historyTanks) ? vPatch.historyTanks : [];
        const updatedVol = activeTanks.reduce((sum, t) => sum + (Number(t.remainingVolume) || 0), 0);
        tx.update(db.collection("floor_liquid_vessels").doc(vId), {
          ...vSnap.data(),
          activeTanks,
          historyTanks,
          currentVolume: updatedVol,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      tx.set(
        transRef,
        {
          status: "reversed",
          isReversed: true,
          reversalReason: reason,
          reversedBy: actor.effectiveUserName,
          reversedById: actor.effectiveUserId,
          reversedAt: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        stagedRef,
        {
          status: "reversed",
          stagingStatus: "reversed",
          isReversed: true,
          reversalReason: reason,
          reversedBy: actor.effectiveUserName,
          reversedById: actor.effectiveUserId,
          reversedAt: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const orderUpdatePayload = {
        pallets: updatedPallets,
        ...orderSummaryUpdates,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (woSnap.exists) tx.update(woRef, orderUpdatePayload);
      if (prodWoSnap.exists) tx.update(prodWoRef, orderUpdatePayload);

      writeAuditLogInTx(tx, db, {
        action: "admin_reverse_work_order_pallet",
        module: "inventory",
        collectionName: "work_orders",
        docId: workOrderId,
        actor,
        summary: `Admin reversed Pallet ${palletId} on Work Order ${workOrderId}: ${reason}`,
        after: { palletId, newOrderStatus: orderSummaryUpdates.status || null },
      });
    });

    return { success: true, workOrderId, palletId };
  }
);
