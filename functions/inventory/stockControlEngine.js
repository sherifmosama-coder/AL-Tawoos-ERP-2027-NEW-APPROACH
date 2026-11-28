/**
 * Server-Side Stock Transfers, Floor Liquid Cleanout, Stock Count Reconciliation,
 * Direct Adjustments, and Spare Parts Consumption Engine
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
  prepareSequentialCounterFromSnap,
} from "../shared/serverAuthAndAudit.js";

export const inventoryCreateStockTransfer = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const transferDoc = data.transferDoc || null;
    const requestedId = String(data.transferId || transferDoc?.id || "").trim();

    if (!transferDoc || !Array.isArray(transferDoc.lines) || transferDoc.lines.length === 0) {
      throw new HttpsError("invalid-argument", "Transfer document and lines are required.");
    }
    if (
      transferDoc.sourceWarehouse &&
      transferDoc.targetWarehouse &&
      transferDoc.sourceWarehouse === transferDoc.targetWarehouse
    ) {
      throw new HttpsError("invalid-argument", "Source and target warehouses must differ.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();
    const todayCompact = nowIso.slice(0, 10).replace(/-/g, "");
    const counterId = `stock_transfer_${todayCompact}`;

    const createdId = await db.runTransaction(async (tx) => {
      const counterRef = db.collection("system_counters").doc(counterId);
      const counterSnap = await tx.get(counterRef);
      const existingSnap = requestedId
        ? await tx.get(db.collection("stock_transfers").doc(requestedId))
        : null;

      if (existingSnap?.exists) {
        throw new HttpsError("already-exists", `Transfer ${requestedId} already exists.`);
      }

      const counter = prepareSequentialCounterFromSnap(
        counterSnap,
        counterRef,
        `TRN-${todayCompact}-`,
        3
      );
      const finalId = requestedId || counter.formattedId;
      const trnRef = db.collection("stock_transfers").doc(finalId);

      const finalDoc = {
        ...transferDoc,
        id: finalId,
        issuedById: transferDoc.issuedById || actor.effectiveUserId,
        issuedBy: transferDoc.issuedBy || actor.effectiveUserName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.set(trnRef, finalDoc);
      if (!requestedId) {
        counter.commitCounter(tx);
      }

      writeAuditLogInTx(tx, db, {
        action: "create_stock_transfer",
        module: "inventory",
        collectionName: "stock_transfers",
        docId: finalId,
        actor,
        summary: `Stock Transfer ${finalId} (${transferDoc.sourceWarehouse || ""} -> ${transferDoc.targetWarehouse || ""}) [${transferDoc.status}]`,
        after: {
          status: finalDoc.status,
          sourceWarehouse: finalDoc.sourceWarehouse || null,
          targetWarehouse: finalDoc.targetWarehouse || null,
          linesCount: finalDoc.lines.length,
        },
      });

      return finalId;
    });

    return { success: true, transferId: createdId };
  }
);

export const inventoryRespondStockTransfer = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const transferId = String(data.transferId || "").trim();
    const action = data.action === "reject" ? "reject" : "verify";
    const reason = String(data.reason || "").trim();

    if (!transferId) {
      throw new HttpsError("invalid-argument", "Transfer ID is required.");
    }
    if (action === "reject" && !reason) {
      throw new HttpsError("invalid-argument", "Rejection reason is required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const trnRef = db.collection("stock_transfers").doc(transferId);
      const trnSnap = await tx.get(trnRef);
      if (!trnSnap.exists) {
        throw new HttpsError("not-found", `Stock transfer ${transferId} not found.`);
      }
      const trn = trnSnap.data();
      if (trn.status === "completed" || trn.status === "rejected" || trn.status === "cancelled") {
        throw new HttpsError(
          "failed-precondition",
          `Transfer ${transferId} already resolved (${trn.status}).`
        );
      }

      // Server-side Segregation of Duties & Admin-Only Custom Date Gate
      if (
        action === "verify" &&
        trn.status === "pending_admin_verification" &&
        !caller.isGeneralAdmin
      ) {
        throw new HttpsError(
          "permission-denied",
          "Custom-date stock transfers require General Admin verification."
        );
      }
      if (!caller.isGeneralAdmin && trn.issuedById && trn.issuedById === actor.effectiveUserId) {
        throw new HttpsError(
          "permission-denied",
          "Creator cannot verify or reject their own stock transfer."
        );
      }

      const existingAudit = Array.isArray(trn.auditTrail) ? trn.auditTrail : [];
      const nextStatus = action === "verify" ? "completed" : "rejected";
      const auditEntry = {
        version: "1.1",
        action: action === "verify" ? "transfer_verified_accepted" : "transfer_rejected",
        status: nextStatus,
        performedBy: actor.effectiveUserName,
        timestamp: nowIso,
        noteAr:
          action === "verify"
            ? data.noteAr || "تم فحص الشحنة واستلامها واعتماد التحويل المخزني بنجاح"
            : data.noteAr || `تم رفض استلام التحويل: ${reason}`,
        noteEn:
          action === "verify"
            ? "Transfer verified and completed"
            : `Transfer rejected: ${reason}`,
      };

      const updateFields =
        action === "verify"
          ? {
              status: "completed",
              verifiedBy: actor.effectiveUserName,
              verifiedById: actor.effectiveUserId,
              verifiedAt: nowIso,
              auditTrail: [...existingAudit, auditEntry],
              updatedAt: FieldValue.serverTimestamp(),
            }
          : {
              status: "rejected",
              rejectionReason: reason,
              rejectedBy: actor.effectiveUserName,
              rejectedById: actor.effectiveUserId,
              rejectedAt: nowIso,
              auditTrail: [...existingAudit, auditEntry],
              updatedAt: FieldValue.serverTimestamp(),
            };

      tx.set(trnRef, updateFields, { merge: true });

      writeAuditLogInTx(tx, db, {
        action: action === "verify" ? "verify_stock_transfer" : "reject_stock_transfer",
        module: "inventory",
        collectionName: "stock_transfers",
        docId: transferId,
        actor,
        summary: `${action === "verify" ? "Verified" : "Rejected"} Stock Transfer ${transferId}`,
        before: { status: trn.status },
        after: { status: nextStatus, reason: reason || null },
      });
    });

    return { success: true, transferId, status: action === "verify" ? "completed" : "rejected" };
  }
);

export const inventoryExecuteFloorCleanout = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    if (!caller.isGeneralAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Floor tank CIP cleanout is restricted to General Admin."
      );
    }
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const materialCode = String(data.materialCode || "").trim();
    if (!materialCode) {
      throw new HttpsError("invalid-argument", "Material code is required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();
    const transferDoc = data.transferDoc || null;
    const trnId = transferDoc?.id || null;
    const retiredActiveTanks = Array.isArray(data.retiredActiveTanks) ? data.retiredActiveTanks : [];
    const scrappedVol = Number(data.scrappedVolume) || 0;
    const flushedVol = Number(data.flushedVolume) || 0;

    await db.runTransaction(async (tx) => {
      const vesselRef = db.collection("floor_liquid_vessels").doc(materialCode);
      const vesselSnap = await tx.get(vesselRef);
      const vesselData = vesselSnap.exists ? vesselSnap.data() : {};
      const existingHistory = Array.isArray(vesselData.historyTanks)
        ? vesselData.historyTanks
        : [];

      if (trnId && transferDoc) {
        tx.set(db.collection("stock_transfers").doc(trnId), {
          ...transferDoc,
          id: trnId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(
        vesselRef,
        {
          ...vesselData,
          materialCode,
          currentVolume: 0,
          activeTanks: [],
          historyTanks: [...retiredActiveTanks, ...existingHistory],
          lastCleanoutAt: nowIso,
          lastCleanoutBy: actor.effectiveUserName,
          lastCleanoutReason: data.reason || "CIP Cleanout",
          lastCleanoutScrappedVolume: scrappedVol,
          lastCleanoutFlushedVolume: flushedVol,
          lastCleanoutScrapWarehouseId: scrappedVol > 0 ? data.targetWarehouseId || null : null,
          lastCleanoutTransferDocId: trnId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      writeAuditLogInTx(tx, db, {
        action: "floor_vessel_cip_cleanout",
        module: "inventory",
        collectionName: "floor_liquid_vessels",
        docId: materialCode,
        actor,
        summary: `CIP Cleanout ${materialCode}: scrapped=${scrappedVol}L, flushed=${flushedVol}L`,
        after: { trnId, scrappedVol, flushedVol },
      });
    });

    return { success: true, materialCode, transferId: trnId };
  }
);

export const inventoryPostDirectStockAdjustment = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const receiptPayload = data.receiptPayload || null;
    const ledgerPayload = data.ledgerPayload || null;
    const adjId = String(data.adjId || receiptPayload?.id || "").trim();

    if (!adjId || !receiptPayload || !ledgerPayload) {
      throw new HttpsError("invalid-argument", "Adjustment receipt and ledger payloads are required.");
    }

    const db = getFirestore();
    const affectSupplierBalance = Boolean(data.affectSupplierBalance);
    const supplierId = String(data.supplierId || "").trim();
    const financialImpact = Number(data.financialImpact) || 0;

    await db.runTransaction(async (tx) => {
      const receiptRef = db.collection("goods_receipts").doc(adjId);
      const existingSnap = await tx.get(receiptRef);
      if (existingSnap.exists) {
        throw new HttpsError("already-exists", `Adjustment ${adjId} already exists.`);
      }

      const supRef =
        affectSupplierBalance && supplierId
          ? db.collection("suppliers").doc(supplierId)
          : null;
      const supSnap = supRef ? await tx.get(supRef) : null;

      tx.set(receiptRef, {
        ...receiptPayload,
        id: adjId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(db.collection("stock_ledger").doc(), {
        ...ledgerPayload,
        grnId: adjId,
        timestamp: FieldValue.serverTimestamp(),
      });

      if (supSnap?.exists && financialImpact !== 0) {
        const currentBal = Number(supSnap.data()?.currentBalance || 0);
        const updatedBal = Math.max(0, currentBal + financialImpact);
        tx.set(
          supRef,
          {
            currentBalance: updatedBal,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      writeAuditLogInTx(tx, db, {
        action: "post_direct_stock_adjustment",
        module: "inventory",
        collectionName: "goods_receipts",
        docId: adjId,
        actor,
        summary: `Direct stock adjustment ${adjId}: variance=${ledgerPayload.variance || 0}`,
        after: {
          itemId: ledgerPayload.itemId,
          variance: ledgerPayload.variance || 0,
          affectSupplierBalance,
        },
      });
    });

    return { success: true, adjId };
  }
);

export const inventoryApproveStockCountLines = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    if (!caller.isGeneralAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Stock count reconciliation approval is strictly restricted to General Admin."
      );
    }

    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const sessionId = String(data.sessionId || "").trim();
    const indicesToApprove = Array.isArray(data.indicesToApprove)
      ? data.indicesToApprove.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
      : [];

    if (!sessionId || indicesToApprove.length === 0) {
      throw new HttpsError("invalid-argument", "Session ID and line indices are required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.slice(0, 10);
    const todayCompact = todayStr.replace(/-/g, "");

    const nextStatus = await db.runTransaction(async (tx) => {
      const sessionRef = db.collection("stock_counts").doc(sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        throw new HttpsError("not-found", `Stock count session ${sessionId} not found.`);
      }

      const session = sessionSnap.data();
      const updatedLines = Array.isArray(session.lines)
        ? session.lines.map((l) => ({ ...l }))
        : [];
      let approvedNow = 0;

      for (const idx of indicesToApprove) {
        const line = updatedLines[idx];
        if (!line || line.status === "approved" || line.actualSmallQty === null) {
          continue;
        }
        line.status = "approved";
        line.approvedBy = actor.effectiveUserName;
        line.approvedAt = todayStr;
        approvedNow += 1;

        const variance = Number(line.variance) || 0;
        if (variance !== 0) {
          const adjId = `ADJ-${todayCompact}-${session.id}-${line.lotNumber}`;
          const isSurplus = variance > 0;
          const varianceAbs = Math.abs(variance);

          tx.set(db.collection("goods_receipts").doc(adjId), {
            id: adjId,
            docType: "inventory_reconciliation",
            status: "approved",
            supplierId: "STOCK_COUNT_RECONCILIATION",
            supplierName: `تسوية جرد فعلي (${session.id})`,
            receiptDate: todayStr,
            targetWarehouse: line.warehouseId,
            placedBy: session.createdBy || "",
            oldBalance: line.bookSmallQty,
            actualBalance: line.actualSmallQty,
            lines: [
              {
                lotNumber: line.lotNumber,
                itemId: line.itemId,
                code: line.variantCode,
                variantCode: line.variantCode,
                nameAr: line.itemNameAr || "",
                nameEn: line.itemNameEn || "",
                specs: line.variantSpecs || "",
                targetWarehouse: line.warehouseId,
                smallUnit: line.smallUnit || "",
                receivedSmallUnits: isSurplus ? varianceAbs : -varianceAbs,
                oldBookBalance: line.bookSmallQty,
                actualFoundQty: line.actualSmallQty,
                variance,
                placedBy: session.createdBy || "",
                unitPrice: line.unitCost || 0,
                currency: line.currency || "EGP",
                qcStatus: "accepted",
                notes: `Reconciliation: Book=${line.bookSmallQty}, Actual=${line.actualSmallQty}, Diff=${variance}`,
              },
            ],
            receivedBy: actor.effectiveUserName,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          tx.set(db.collection("stock_ledger").doc(), {
            grnId: adjId,
            lotNumber: line.lotNumber,
            action: isSurplus ? "reconciliation_surplus" : "reconciliation_deficit",
            docType: "inventory_reconciliation",
            sessionId: session.id,
            itemId: line.itemId,
            variantCode: line.variantCode,
            materialNameAr: line.itemNameAr || "",
            oldBalance: line.bookSmallQty,
            newActualBalance: line.actualSmallQty,
            qty: isSurplus ? varianceAbs : -varianceAbs,
            variance,
            unit: line.smallUnit || "",
            warehouse: line.warehouseId,
            placedBy: session.createdBy || "",
            receiptDate: todayStr,
            unitPrice: line.unitCost || 0,
            currency: line.currency || "EGP",
            financialImpact: variance * (Number(line.unitCost) || 0),
            approvedBy: actor.effectiveUserName,
            approverId: actor.effectiveUserId,
            timestamp: FieldValue.serverTimestamp(),
          });
        }
      }

      if (approvedNow === 0) {
        throw new HttpsError("failed-precondition", "No eligible unapproved lines selected.");
      }

      const allApproved = updatedLines.every((l) => l.status === "approved");
      const anyApproved = updatedLines.some((l) => l.status === "approved");
      const finalStatus = allApproved ? "done" : anyApproved ? "under-review" : session.status;

      const approveLog = {
        action: "lines_approved",
        userName: actor.effectiveUserName,
        timestamp: nowIso,
        noteAr: `اعتماد وتسوية (${approvedNow}) بند من بنود الجرد المخزني`,
        noteEn: `Approved and reconciled (${approvedNow}) inventory line(s)`,
        approvedCount: approvedNow,
        allCompleted: allApproved,
      };

      tx.set(
        sessionRef,
        {
          lines: updatedLines,
          status: finalStatus,
          auditLogs: [...(Array.isArray(session.auditLogs) ? session.auditLogs : []), approveLog],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      writeAuditLogInTx(tx, db, {
        action: "approve_stock_count_reconciliation",
        module: "inventory",
        collectionName: "stock_counts",
        docId: sessionId,
        actor,
        summary: `Reconciled ${approvedNow} line(s) on Stock Count ${sessionId} -> ${finalStatus}`,
        after: { status: finalStatus, approvedNow },
      });

      return finalStatus;
    });

    return { success: true, sessionId, status: nextStatus };
  }
);

export const inventoryPostSparePartsConsumption = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const lines = Array.isArray(data.lines) ? data.lines : [];
    if (lines.length === 0) {
      throw new HttpsError("invalid-argument", "At least one spare parts line is required.");
    }

    const db = getFirestore();
    const todayCompact = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const counterId = `spare_parts_${todayCompact}`;

    const voucherId = await db.runTransaction(async (tx) => {
      const counterRef = db.collection("system_counters").doc(counterId);
      const counterSnap = await tx.get(counterRef);
      const counter = prepareSequentialCounterFromSnap(
        counterSnap,
        counterRef,
        `XISS-${todayCompact}-`,
        2
      );
      const vId = counter.formattedId;

      const processedLines = [];
      lines.forEach((line, lIdx) => {
        const qty = Math.abs(Number(line.qty) || 0);
        if (!line.itemId || qty <= 0) {
          throw new HttpsError("invalid-argument", `Invalid spare parts line #${lIdx + 1}.`);
        }
        const lineLotNo = `XISS-LOT-${vId}-${String(lIdx + 1).padStart(2, "0")}`;
        tx.set(db.collection("stock_ledger").doc(), {
          grnId: vId,
          lotNumber: lineLotNo,
          action: "spare_parts_consumption",
          docType: "spare_parts_issue",
          itemId: line.itemId,
          variantCode: line.variantCode || line.itemId,
          variantColorCode: line.variantColorCode || "",
          identifierBadgeText: line.identifierBadgeText || "",
          materialNameAr: line.materialNameAr || line.itemId,
          materialNameEn: line.materialNameEn || "",
          qty: -qty,
          unit: line.unit || "قطعة",
          warehouse: line.targetWarehouse || "",
          purpose: String(line.notes || "").trim(),
          receiptDate: line.issueDate || new Date().toISOString().slice(0, 10),
          receivedBy: actor.effectiveUserName,
          timestamp: FieldValue.serverTimestamp(),
        });

        processedLines.push({
          itemId: line.itemId,
          variantCode: line.variantCode || line.itemId,
          variantColorCode: line.variantColorCode || "",
          identifierBadgeText: line.identifierBadgeText || "",
          materialNameAr: line.materialNameAr || line.itemId,
          materialNameEn: line.materialNameEn || "",
          targetWarehouse: line.targetWarehouse || "",
          qty,
          unit: line.unit || "قطعة",
          notes: String(line.notes || "").trim(),
          issueDate: line.issueDate || new Date().toISOString().slice(0, 10),
        });
      });

      tx.set(db.collection("spare_parts_issues").doc(vId), {
        id: vId,
        voucherNumber: vId,
        status: "completed",
        linesCount: processedLines.length,
        lines: processedLines,
        issuedBy: {
          uid: actor.effectiveUserId,
          name: actor.effectiveUserName,
          email: actor.authEmail,
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      counter.commitCounter(tx);

      writeAuditLogInTx(tx, db, {
        action: "post_spare_parts_consumption",
        module: "inventory",
        collectionName: "spare_parts_issues",
        docId: vId,
        actor,
        summary: `Issued Spare Parts Voucher ${vId} (${processedLines.length} lines)`,
        after: { linesCount: processedLines.length },
      });

      return vId;
    });

    return { success: true, voucherId };
  }
);

export const inventoryCancelSparePartsConsumption = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const voucherId = String(data.voucherId || "").trim();

    if (!voucherId) {
      throw new HttpsError("invalid-argument", "Voucher ID is required.");
    }

    const db = getFirestore();
    const todayStr = new Date().toISOString().slice(0, 10);

    await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("spare_parts_issues").doc(voucherId);
      const voucherSnap = await tx.get(voucherRef);
      if (!voucherSnap.exists) {
        throw new HttpsError("not-found", `Voucher ${voucherId} not found.`);
      }
      const voucher = voucherSnap.data();
      if (voucher.status === "cancelled") {
        throw new HttpsError("failed-precondition", `Voucher ${voucherId} is already cancelled.`);
      }

      for (const line of voucher.lines || []) {
        tx.set(db.collection("stock_ledger").doc(), {
          grnId: `REV-${voucher.id}`,
          action: "spare_parts_reversal",
          docType: "spare_parts_reversal",
          itemId: line.itemId,
          variantCode: line.variantCode || line.itemId,
          materialNameAr: line.materialNameAr || line.itemId,
          qty: Math.abs(Number(line.qty) || 0),
          unit: line.unit || "قطعة",
          warehouse: line.targetWarehouse || "",
          purpose: `إلغاء ورد إذن الصرف ${voucher.id}`,
          receiptDate: todayStr,
          receivedBy: actor.effectiveUserName,
          timestamp: FieldValue.serverTimestamp(),
        });
      }

      tx.set(
        voucherRef,
        {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          cancelledBy: actor.effectiveUserName,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      writeAuditLogInTx(tx, db, {
        action: "cancel_spare_parts_consumption",
        module: "inventory",
        collectionName: "spare_parts_issues",
        docId: voucherId,
        actor,
        summary: `Cancelled Spare Parts Voucher ${voucherId}`,
        before: { status: voucher.status },
        after: { status: "cancelled" },
      });
    });

    return { success: true, voucherId, status: "cancelled" };
  }
);
