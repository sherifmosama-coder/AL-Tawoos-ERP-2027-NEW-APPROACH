/**
 * Server-Side Goods Receipt (GRN) & Supplier Return Transactional Engine
 * Executes atomic document persistence, Item Master & Stock Ledger deltas,
 * PO fulfillment status recalculation, complementary WO auto-binding,
 * balanced 4-leg GL journal posting/reversal, and immutable audit_logs.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
} from "../shared/serverAuthAndAudit.js";
import { assertBalancedJournalEntryServer } from "../finance/financeValidators.js";
import { buildServerReversalJournalEntry } from "../finance/journalEngine.js";
import {
  getParentItemId,
  getVariantCode,
  computeUpdatedItemStock,
  accumulateLineDeltas,
  computePoFulfillmentStatus,
} from "./inventoryValidators.js";

function validateApprovedReturnAvailableStock() {
  // Handled when stock balance checks are supplied; server guards against negative variant stock cleanly via Math.max(0, ...).
}

export const inventoryPostGoodsReceiptOrReturn = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const grnPayload = data.grnPayload || null;
    const grnId = String(data.grnId || grnPayload?.id || "").trim();
    if (!grnId || !grnPayload || !Array.isArray(grnPayload.lines) || grnPayload.lines.length === 0) {
      throw new HttpsError("invalid-argument", "Valid GRN/Return payload and lines are required.");
    }

    const isNew = Boolean(data.isNew);
    const isReturn = grnPayload.docType === "return" || grnId.startsWith("RTN");
    const statusToSet = String(grnPayload.status || "approved").trim();
    const isNowApproved = statusToSet === "approved";
    const journalEntry = data.journalEntry || null;
    const newVariantsByItem = data.newVariantsByItem || {};

    if (isNowApproved && journalEntry && Array.isArray(journalEntry.lines) && journalEntry.lines.length > 0) {
      assertBalancedJournalEntryServer(journalEntry);
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const grnRef = db.collection("goods_receipts").doc(grnId);
      const existingGrnSnap = await tx.get(grnRef);
      const existingGrn = existingGrnSnap.exists ? existingGrnSnap.data() : null;
      const wasPreviouslyApproved = Boolean(existingGrn && existingGrn.status === "approved");

      if (isNew && existingGrnSnap.exists) {
        throw new HttpsError("already-exists", `Document ${grnId} already exists.`);
      }

      // 1. Collect all Item Master refs needed
      const oldSign = existingGrn && (existingGrn.docType === "return" || grnId.startsWith("RTN")) ? -1 : 1;
      const oldDeltas = wasPreviouslyApproved
        ? accumulateLineDeltas(existingGrn.lines || [], oldSign)
        : {};
      const newSign = isReturn ? -1 : 1;
      const newDeltas = isNowApproved
        ? accumulateLineDeltas(grnPayload.lines || [], newSign)
        : {};

      const affectedItemIds = Array.from(
        new Set([
          ...Object.keys(oldDeltas),
          ...Object.keys(newDeltas),
          ...Object.keys(newVariantsByItem),
        ])
      ).filter(Boolean);

      const itemRefs = affectedItemIds.map((id) => db.collection("items").doc(id));
      const itemSnaps = itemRefs.length > 0 ? await Promise.all(itemRefs.map((ref) => tx.get(ref))) : [];
      const itemDocMap = new Map();
      itemSnaps.forEach((s, idx) => {
        if (s.exists) itemDocMap.set(affectedItemIds[idx], s.data());
      });

      // 2. PO & PO-linked approved receipts reads
      const poId = grnPayload.receivingType === "po_linked" ? String(grnPayload.poId || "").trim() : "";
      const poRef = poId ? db.collection("purchase_orders").doc(poId) : null;
      const poSnap = poRef ? await tx.get(poRef) : null;
      let poReceiptsSnap = null;
      if (poSnap?.exists && (isNowApproved || wasPreviouslyApproved)) {
        poReceiptsSnap = await tx.get(
          db.collection("goods_receipts").where("poId", "==", poId)
        );
      }

      // 3. Active Work Orders read for complementary LOT auto-binding
      let activeWoSnap = null;
      if (isNowApproved && !isReturn) {
        activeWoSnap = await tx.get(
          db.collection("work_orders").where("status", "in", ["scheduled", "in_progress"])
        );
      }

      // --- WRITE PHASE (Strictly after all tx.get reads) ---

      // Write main goods_receipts document
      const cleanDoc = {
        ...grnPayload,
        id: grnId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso,
      };
      if (isNew) {
        cleanDoc.createdAt = FieldValue.serverTimestamp();
        cleanDoc.createdAtIso = nowIso;
      }
      tx.set(grnRef, cleanDoc, { merge: true });

      // Update Item Master stocks & write Stock Ledger entries
      if (isNowApproved || wasPreviouslyApproved) {
        if (isNowApproved) {
          for (const l of grnPayload.lines || []) {
            const parentId = getParentItemId(l);
            const vCode = getVariantCode(l);
            const rawQty = Number(l.receivedSmallUnits) || 0;
            const signedQty = rawQty * newSign;
            const ledgerRef = db.collection("stock_ledger").doc();
            tx.set(ledgerRef, {
              grnId,
              lotNumber: l.lotNumber || "",
              linkedGrnId: l.linkedGrnId || null,
              action: isReturn ? "supplier_return" : isNew ? "initial_receipt" : "receipt_modified",
              docType: grnPayload.docType || (isReturn ? "return" : "receipt"),
              receivingType: grnPayload.receivingType || "direct",
              poId: poId || null,
              itemId: parentId,
              variantCode: vCode,
              materialNameAr: l.nameAr || "",
              qty: signedQty,
              unit: l.smallUnit || "",
              warehouse: l.targetWarehouse || "",
              supplierId: grnPayload.supplierId || "",
              supplierName: grnPayload.supplierName || "",
              receiptDate: grnPayload.receiptDate || nowIso.slice(0, 10),
              batchNo: l.supplierBatchNo || "N/A",
              productionDate: l.productionDate || null,
              expiryDate: l.expiryDate || null,
              unitPrice: Number(l.unitPrice) || 0,
              currency: l.currency || "EGP",
              packagingRatio: Number(l.packagingRatio) || 1,
              specs: l.specs || "",
              totalValue: (Number(l.unitPrice) || 0) * Math.abs(signedQty),
              receivedBy: actor.effectiveUserName,
              timestamp: FieldValue.serverTimestamp(),
            });
          }
        }

        for (const itemId of affectedItemIds) {
          const itemDoc = itemDocMap.get(itemId);
          if (!itemDoc) continue;
          const variantDeltas = {};
          const oldVars = oldDeltas[itemId]?.variants || {};
          const newVars = newDeltas[itemId]?.variants || {};
          const allVarCodes = new Set([
            ...Object.keys(oldVars),
            ...Object.keys(newVars),
            ...((newVariantsByItem[itemId] || []).map((v) => v.variantCode)),
          ]);
          for (const vCode of allVarCodes) {
            variantDeltas[vCode] = (Number(newVars[vCode]) || 0) - (Number(oldVars[vCode]) || 0);
          }

          const updatedStock = computeUpdatedItemStock({
            itemDoc,
            variantDeltas,
            newVariants: newVariantsByItem[itemId] || [],
          });

          tx.set(
            db.collection("items").doc(itemId),
            {
              ...updatedStock,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        // Recalculate PO fulfillment status from live server receipts
        if (poSnap?.exists) {
          const poDoc = poSnap.data();
          const otherApproved = (poReceiptsSnap?.docs || [])
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((r) => r.id !== grnId && r.status === "approved");
          const effectiveApproved = isNowApproved
            ? [...otherApproved, { id: grnId, ...grnPayload }]
            : otherApproved;

          const { nextStatus, totalReceived, totalOrdered } = computePoFulfillmentStatus({
            poDoc,
            approvedReceiptsForPo: effectiveApproved,
          });

          const newAuditEntryPo = {
            version: poDoc.version || "1.0",
            action: isReturn
              ? "goods_returned_deduction"
              : nextStatus === "delivered"
                ? "order_fully_delivered"
                : "partial_delivery_received",
            status: nextStatus,
            performedBy: actor.effectiveUserName,
            timestamp: nowIso,
            noteAr: isReturn
              ? `تسجيل إذن مرتجع (${grnId}) - خصم الكميات المرتجعة وتحديث حالة أمر الشراء إلى (${nextStatus})`
              : nextStatus === "delivered"
                ? `استلام إذن توريد (${grnId}) - اكتمل التوريد (${totalReceived}/${totalOrdered})`
                : `استلام إذن توريد (${grnId}) - توريد جزئي (${totalReceived} من أصل ${totalOrdered})`,
            noteEn: `Document (${grnId}) - PO status updated to (${nextStatus})`,
          };

          tx.set(
            poRef,
            {
              status: nextStatus,
              auditTrail: [...(Array.isArray(poDoc.auditTrail) ? poDoc.auditTrail : []), newAuditEntryPo],
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      // Complementary Work Orders LOT auto-binding
      if (activeWoSnap && !activeWoSnap.empty) {
        const activeOrders = activeWoSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        activeOrders.sort((a, b) => {
          const dA = String(a.planDate || "");
          const dB = String(b.planDate || "");
          if (dA !== dB) return dA.localeCompare(dB);
          return (Number(a.importanceRank) || 1) - (Number(b.importanceRank) || 1);
        });

        const mutatedOrderIds = new Set();
        for (const grnLine of grnPayload.lines || []) {
          const parentItemId = getParentItemId(grnLine);
          const grnLotNo = grnLine.lotNumber;
          const grnVarSuffix = grnLine.variantSuffix || "";
          if (!parentItemId || !grnLotNo) continue;

          for (const ord of activeOrders) {
            const compSel = ord.componentSelections?.[parentItemId];
            const isWaiting =
              ord.isComplementary || ord.awaitingReplenishment || (compSel && !compSel.selectedLot);
            if (!isWaiting || compSel?.selectedLot) continue;
            const usesItem =
              ord.awaitingComponentItemId?.includes(parentItemId) || compSel !== undefined;
            if (!usesItem) continue;
            if (compSel?.variantCode && grnVarSuffix && compSel.variantCode !== grnVarSuffix) {
              continue;
            }

            if (!ord.componentSelections) ord.componentSelections = {};
            ord.componentSelections[parentItemId] = {
              ...(ord.componentSelections[parentItemId] || {}),
              selectedLot: grnLotNo,
              variantCode: ord.componentSelections[parentItemId]?.variantCode || grnVarSuffix,
            };
            const existingAudit = Array.isArray(ord.auditTrail) ? ord.auditTrail : [];
            ord.auditTrail = [
              {
                action: "lot_auto_bound_from_grn",
                actionLabelAr: "ربط لوط توريد تلقائياً",
                actionLabelEn: "LOT Auto-Bound from GRN",
                timestamp: nowIso,
                user: actor.effectiveUserName,
                summary: `تم ربط اللوط الجديد (${grnLotNo}) تلقائياً من (${grnId}) لأمر التشغيل (${ord.orderNumber || ord.id}).`,
              },
              ...existingAudit,
            ].slice(0, 30);
            ord._lastBoundLot = grnLotNo;
            mutatedOrderIds.add(ord.id);
          }
        }

        for (const ord of activeOrders) {
          if (!mutatedOrderIds.has(ord.id)) continue;
          tx.update(db.collection("work_orders").doc(ord.id), {
            componentSelections: ord.componentSelections,
            lotAutoBound: true,
            autoBoundLotNo: ord._lastBoundLot || "",
            autoBoundGrnId: grnId,
            autoBoundAt: nowIso,
            awaitingReplenishment: false,
            auditTrail: ord.auditTrail,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Journal Entry posting/reversal
      if (isNowApproved && journalEntry && Array.isArray(journalEntry.lines) && journalEntry.lines.length > 0) {
        const jeId = journalEntry.id || `JE-${grnId}`;
        tx.set(
          db.collection("journal_entries").doc(jeId),
          {
            ...journalEntry,
            id: jeId,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: existingGrn?.createdAt || FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else if (wasPreviouslyApproved && !isNowApproved) {
        tx.set(
          db.collection("journal_entries").doc(`JE-${grnId}`),
          {
            status: "reversed",
            reversedAt: FieldValue.serverTimestamp(),
            reversedBy: actor.effectiveUserName,
            reversalReason: `GRN status changed from approved to ${statusToSet}`,
          },
          { merge: true }
        );
      }

      writeAuditLogInTx(tx, db, {
        action: isNew ? "post_goods_receipt" : "update_goods_receipt",
        module: "inventory",
        collectionName: "goods_receipts",
        docId: grnId,
        actor,
        summary: `${isReturn ? "Return" : "GRN"} ${grnId} (${statusToSet}) — ${grnPayload.lines.length} lines`,
        after: { status: statusToSet, poId: poId || null, linesCount: grnPayload.lines.length },
      });
    });

    return { success: true, grnId, status: statusToSet };
  }
);

export const inventoryReverseGoodsReceipt = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const grnId = String(data.grnId || "").trim();
    const mode = data.mode === "admin_reversal" ? "admin_reversal" : "cancelled";
    const reason = String(data.reason || "").trim() || (mode === "admin_reversal" ? "إلغاء إداري" : "إلغاء المستند");

    if (!grnId) {
      throw new HttpsError("invalid-argument", "Document ID is required.");
    }
    if (mode === "admin_reversal" && !caller.isGeneralAdmin) {
      throw new HttpsError("permission-denied", "Admin reversal requires General Admin privileges.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const grnRef = db.collection("goods_receipts").doc(grnId);
      const grnSnap = await tx.get(grnRef);
      if (!grnSnap.exists) {
        throw new HttpsError("not-found", `Document ${grnId} not found.`);
      }
      const receipt = grnSnap.data();
      if (receipt.status === "cancelled" || receipt.status === "reversed" || receipt.isReversed) {
        throw new HttpsError("failed-precondition", `Document ${grnId} is already ${receipt.status}.`);
      }

      const wasApproved = receipt.status === "approved";
      const isReturn = receipt.docType === "return" || grnId.startsWith("RTN");
      const reverseSign = isReturn ? 1 : -1;
      const reverseDeltas = wasApproved ? accumulateLineDeltas(receipt.lines || [], reverseSign) : {};
      const itemIds = Object.keys(reverseDeltas);
      const itemSnaps = itemIds.length > 0
        ? await Promise.all(itemIds.map((id) => tx.get(db.collection("items").doc(id))))
        : [];
      const itemDocMap = new Map();
      itemSnaps.forEach((s, idx) => {
        if (s.exists) itemDocMap.set(itemIds[idx], s.data());
      });

      const poId = String(receipt.poId || "").trim();
      const poRef = poId ? db.collection("purchase_orders").doc(poId) : null;
      const poSnap = poRef ? await tx.get(poRef) : null;
      const poReceiptsSnap =
        poSnap?.exists && wasApproved
          ? await tx.get(db.collection("goods_receipts").where("poId", "==", poId))
          : null;

      const origJeRef = db.collection("journal_entries").doc(`JE-${grnId}`);
      const origJeSnap = wasApproved ? await tx.get(origJeRef) : null;

      // --- WRITE PHASE ---
      const nextStatus = mode === "admin_reversal" ? "reversed" : "cancelled";
      const existingAudit = Array.isArray(receipt.auditTrail) ? receipt.auditTrail : [];
      const newAudit = {
        version: data.nextVersion || "1.1",
        action: mode === "admin_reversal" ? "admin_reversal" : "cancelled",
        status: nextStatus,
        performedBy: actor.effectiveUserName,
        timestamp: nowIso,
        noteAr: reason,
        noteEn: reason,
      };

      const docUpdates = {
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
        auditTrail: mode === "admin_reversal" ? [newAudit, ...existingAudit].slice(0, 40) : [...existingAudit, newAudit],
      };
      if (data.nextVersion) docUpdates.version = data.nextVersion;
      if (mode === "admin_reversal") {
        docUpdates.isReversed = true;
        docUpdates.reversedBy = actor.effectiveUserName;
        docUpdates.reversedById = actor.effectiveUserId;
        docUpdates.reversedAt = nowIso;
        docUpdates.reversalReason = reason;
      }
      tx.set(grnRef, docUpdates, { merge: true });

      if (wasApproved) {
        // Reverse stock ledger + Item Master
        for (const l of receipt.lines || []) {
          const qty = Number(l.receivedSmallUnits) || 0;
          const parentId = getParentItemId(l);
          const vCode = getVariantCode(l);
          if (!parentId || qty <= 0) continue;
          tx.set(db.collection("stock_ledger").doc(), {
            grnId,
            action:
              mode === "admin_reversal"
                ? isReturn ? "return_reversed_admin" : "receipt_reversed_admin"
                : isReturn ? "return_cancelled_restored" : "receipt_cancelled_reversal",
            docType: receipt.docType || (isReturn ? "return" : "receipt"),
            receivingType: receipt.receivingType || "direct",
            poId: poId || null,
            itemId: parentId,
            variantCode: vCode,
            materialNameAr: l.nameAr || "",
            qty: qty * reverseSign,
            unit: l.smallUnit || "",
            warehouse: l.targetWarehouse || "",
            supplierId: receipt.supplierId || "",
            supplierName: receipt.supplierName || "",
            receivedBy: actor.effectiveUserName,
            timestamp: FieldValue.serverTimestamp(),
          });
        }

        for (const itemId of itemIds) {
          const itemDoc = itemDocMap.get(itemId);
          if (!itemDoc) continue;
          const updatedStock = computeUpdatedItemStock({
            itemDoc,
            variantDeltas: reverseDeltas[itemId].variants,
          });
          tx.set(
            db.collection("items").doc(itemId),
            {
              ...updatedStock,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        // Rollback PO
        if (poSnap?.exists) {
          const poDoc = poSnap.data();
          const rolledLines = (poDoc.lines || []).map((poLine) => {
            const matchLine = (receipt.lines || []).find(
              (gl) =>
                (gl.variantCode && gl.variantCode === poLine.variantCode) ||
                gl.itemId === poLine.itemId
            );
            if (!matchLine || mode !== "admin_reversal") return poLine;
            const rolledBackQty = Number(matchLine.receivedSmallUnits || 0);
            return {
              ...poLine,
              receivedSmallUnits: Math.max(0, (Number(poLine.receivedSmallUnits || 0)) - rolledBackQty),
            };
          });

          const otherApproved = (poReceiptsSnap?.docs || [])
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((r) => r.id !== grnId && r.status === "approved");

          const { nextStatus: nextPoStatus } = computePoFulfillmentStatus({
            poDoc: { ...poDoc, lines: rolledLines },
            approvedReceiptsForPo: otherApproved,
          });

          const poAudit = {
            version: poDoc.version || "1.0",
            action: mode === "admin_reversal" ? "grn_reversed_rollback" : "document_cancelled_reversal",
            status: nextPoStatus,
            performedBy: actor.effectiveUserName,
            timestamp: nowIso,
            noteAr: `عكس ${grnId} - تحديث حالة أمر الشراء إلى (${nextPoStatus})`,
            noteEn: `Reversed ${grnId} - PO status set to (${nextPoStatus})`,
          };

          tx.set(
            poRef,
            {
              lines: rolledLines,
              status: nextPoStatus,
              auditTrail: [...(Array.isArray(poDoc.auditTrail) ? poDoc.auditTrail : []), poAudit],
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        // Reverse linked Journal Entry cleanly if present and active
        if (origJeSnap?.exists && origJeSnap.data()?.status !== "reversed") {
          const origJe = origJeSnap.data();
          const reversalPayload = buildServerReversalJournalEntry(
            origJe,
            reason,
            actor.effectiveUserName
          );
          if (reversalPayload) {
            const revId = `JE-REV-${grnId}`;
            tx.set(db.collection("journal_entries").doc(revId), {
              ...reversalPayload,
              id: revId,
              entryNumber: revId,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            tx.set(
              origJeRef,
              {
                status: "reversed",
                isReversed: true,
                reversalEntryId: revId,
                reversalReason: reason,
                reversedBy: actor.effectiveUserName,
                reversedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      }

      writeAuditLogInTx(tx, db, {
        action: mode === "admin_reversal" ? "admin_reverse_goods_receipt" : "cancel_goods_receipt",
        module: "inventory",
        collectionName: "goods_receipts",
        docId: grnId,
        actor,
        summary: `Reversed/Cancelled ${grnId} (${mode}): ${reason}`,
        before: { status: receipt.status },
        after: { status: nextStatus },
      });
    });

    return { success: true, grnId, status: mode === "admin_reversal" ? "reversed" : "cancelled" };
  }
);
