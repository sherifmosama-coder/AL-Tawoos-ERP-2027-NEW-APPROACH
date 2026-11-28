/**
 * Server-Side Sales Invoicing & Delivery Note Engine (Phase 1)
 *
 * Regional me-central1 Callable Cloud Functions:
 *  - salesCommitInvoiceDocument: Atomic validation (Cash Sales guard, duplicate/split-load
 *    check, monotonic per-serial v1/v2 versioning), immutable `sales_invoices/{docId}`
 *    persistence with frozen `modelSnapshot`, parent `sales_orders/{orderId}.invoicing`
 *    stamping, and `audit_logs` trail.
 *  - salesVoidInvoiceDocument: Audited voiding with mandatory reason, ETA/GL Phase 2 lock
 *    guard, and atomic `sales_orders/{orderId}.invoicing` summary recomputation.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
} from "../shared/serverAuthAndAudit.js";

const VALID_DOC_TYPES = new Set(["Tawoos", "PL", "DeliveryNote"]);

function getSequenceType(docType) {
  return docType === "DeliveryNote" ? "dn" : "tax";
}

function normalizeSerial(raw) {
  const clean = String(raw ?? "")
    .trim()
    .replace(/^#/, "")
    .trim();
  const digitsOnly = /^\d+$/.test(clean);
  const numeric = digitsOnly
    ? parseInt(clean, 10)
    : parseInt(clean.replace(/\D+/g, ""), 10);
  return {
    clean,
    numeric: digitsOnly && Number.isFinite(numeric) && numeric > 0 ? numeric : 0,
    isNumericValid: digitsOnly && Number.isFinite(numeric) && numeric > 0,
  };
}

function sanitizeDocIdPart(val) {
  return String(val || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_");
}

function buildOrderInvoicingSummary(activeDocsForOrder = [], nowIso = new Date().toISOString()) {
  const byType = { Tawoos: null, PL: null, DeliveryNote: null };
  for (const d of activeDocsForOrder) {
    if (!d) continue;
    const st = String(d.status || "issued").toLowerCase();
    if (st === "voided" || st === "superseded" || d.isLatestVersion === false) continue;
    if (!VALID_DOC_TYPES.has(d.docType)) continue;
    const prev = byType[d.docType];
    if (!prev || Number(d.version || 1) >= Number(prev.version || 1)) {
      byType[d.docType] = {
        docId: d.docId || d.id || "",
        serialNo: String(d.serialNo || ""),
        version: Number(d.version || 1),
        invoiceDate: String(d.invoiceDate || ""),
        cashSales: Boolean(d.cashSales),
        isSplitLoad: Boolean(d.isSplitLoad),
        sourceOrderFingerprint: String(d.sourceOrderFingerprint || ""),
        grandTotal: Number(d.totals?.grandTotal || 0),
        committedAt: d.createdAt || nowIso,
        etaStatus: d.etaStatus || "not_submitted",
      };
    }
  }

  return {
    invoicing: {
      tawoos: byType.Tawoos,
      pl: byType.PL,
      deliveryNote: byType.DeliveryNote,
      hasAnyIssued: Boolean(byType.Tawoos || byType.PL || byType.DeliveryNote),
      lastUpdatedAt: nowIso,
    },
    invoiceNoTawoos: byType.Tawoos?.serialNo || null,
    invoiceNoPL: byType.PL?.serialNo || null,
    deliveryNoteNo: byType.DeliveryNote?.serialNo || null,
  };
}

export const salesCommitInvoiceDocument = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const orderId = String(data.orderId || "").trim();
    const docType = String(data.docType || "").trim();
    const serialInfo = normalizeSerial(data.serialNo);
    const invoiceDate = String(data.invoiceDate || "").trim().slice(0, 10);
    const isSplitLoad = Boolean(data.isSplitLoad);
    const cashSales = Boolean(data.cashSales);
    const hideBonus = docType === "DeliveryNote" ? Boolean(data.hideBonus) : false;
    const lang = data.lang === "en" ? "en" : "ar";
    const revisionReason = String(data.revisionReason || "").trim();
    const sourceOrderFingerprint = String(data.sourceOrderFingerprint || "").trim();
    const modelSnapshot = data.modelSnapshot || null;

    if (!orderId) {
      throw new HttpsError("invalid-argument", "orderId is required.");
    }
    if (!VALID_DOC_TYPES.has(docType)) {
      throw new HttpsError("invalid-argument", "Invalid docType. Expected Tawoos, PL, or DeliveryNote.");
    }
    if (!serialInfo.clean) {
      throw new HttpsError("invalid-argument", "serialNo is required.");
    }
    if (!invoiceDate) {
      throw new HttpsError("invalid-argument", "invoiceDate is required.");
    }
    if (!modelSnapshot || typeof modelSnapshot !== "object") {
      throw new HttpsError("invalid-argument", "modelSnapshot is required.");
    }

    const sequenceType = getSequenceType(docType);
    const db = getFirestore();
    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (tx) => {
      const orderRef = db.collection("sales_orders").doc(orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        throw new HttpsError("not-found", `Sales order ${orderId} does not exist.`);
      }
      const order = { id: orderSnap.id, ...orderSnap.data() };

      const confStatus = String(order.confirmationStatus || "").toLowerCase();
      const ordStatus = String(order.status || "").toLowerCase();
      if (confStatus === "canceled" || confStatus === "cancelled" || ordStatus === "canceled" || ordStatus === "cancelled") {
        throw new HttpsError("failed-precondition", "Cannot issue invoice for a canceled order.");
      }
      if (order.splitStatus === "merged_on_parent") {
        throw new HttpsError("failed-precondition", "Split child portion merged on parent cannot be invoiced separately.");
      }

      const clientRef = order.clientId ? db.collection("clients").doc(String(order.clientId)) : null;
      const [clientSnap, sameSerialSnap, sameOrderDocsSnap] = await Promise.all([
        clientRef ? tx.get(clientRef) : Promise.resolve(null),
        tx.get(db.collection("sales_invoices").where("serialNo", "==", serialInfo.clean)),
        tx.get(db.collection("sales_invoices").where("orderId", "==", orderId)),
      ]);

      const clientData = clientSnap && clientSnap.exists ? clientSnap.data() : {};
      const clientTaxCard = String(
        clientData?.taxCardNumber ||
          clientData?.taxCard ||
          clientData?.taxNumber ||
          order.clientTaxCard ||
          modelSnapshot?.buyer?.taxCard ||
          ""
      ).trim();

      // Server-side Cash Sales (بيع نقدي) guard for Tax Invoices when client has no Tax Card
      if ((docType === "Tawoos" || docType === "PL") && !clientTaxCard && !cashSales) {
        throw new HttpsError(
          "failed-precondition",
          "Buyer tax registration is blank. Cash Sales (بيع نقدي) confirmation is required before saving a Tax Invoice."
        );
      }

      const sameSeqSerialDocs = sameSerialSnap.docs
        .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
        .filter((d) => (d.sequenceType || getSequenceType(d.docType)) === sequenceType);

      const activeSameSeqDocs = sameSeqSerialDocs.filter((d) => {
        const st = String(d.status || "issued").toLowerCase();
        return st !== "voided" && st !== "superseded" && d.isLatestVersion !== false;
      });

      // Prevent Tawoos & PL sharing same serial on the same order
      const sameOrderDiffType = activeSameSeqDocs.find(
        (d) => d.orderId === orderId && d.docType !== docType
      );
      if (sameOrderDiffType) {
        throw new HttpsError(
          "already-exists",
          `Serial #${serialInfo.clean} is already assigned to ${sameOrderDiffType.docType} on this order.`
        );
      }

      // Check other orders holding the same sequence + serial
      const otherOrderActiveDocs = activeSameSeqDocs.filter((d) => d.orderId !== orderId);
      if (otherOrderActiveDocs.length > 0) {
        if (!isSplitLoad) {
          const conflict = otherOrderActiveDocs[0];
          throw new HttpsError(
            "already-exists",
            `Serial #${serialInfo.clean} is already issued to order #${conflict.orderNo || conflict.orderId}. Enable Split-Load Share only for identical Client + Date + Doc Type.`
          );
        }
        const mismatch = otherOrderActiveDocs.find(
          (d) =>
            String(d.clientId || "") !== String(order.clientId || "") ||
            String(d.invoiceDate || "") !== invoiceDate ||
            String(d.docType || "") !== docType
        );
        if (mismatch) {
          throw new HttpsError(
            "failed-precondition",
            `Split-Load Share requires identical Client, Invoice Date, and Document Type as order #${mismatch.orderNo || mismatch.orderId}.`
          );
        }
      }

      // Existing docs on this order for same docType (to compute monotonic version & supersede prior active doc)
      const orderAllDocs = sameOrderDocsSnap.docs.map((d) => ({
        ref: d.ref,
        id: d.id,
        ...d.data(),
      }));

      const sameOrderSameTypeDocs = orderAllDocs.filter((d) => d.docType === docType);
      const maxExistingVersion = sameOrderSameTypeDocs.reduce(
        (mx, d) => Math.max(mx, Number(d.version || 1)),
        0
      );
      const version = maxExistingVersion + 1;

      const prefix = docType === "DeliveryNote" ? "DN" : docType === "PL" ? "PL" : "INV";
      const newDocId = `${prefix}-${sanitizeDocIdPart(serialInfo.clean)}-${sanitizeDocIdPart(orderId)}-v${version}`;
      const newDocRef = db.collection("sales_invoices").doc(newDocId);

      const snapshotTotals = {
        totalQty: Number(modelSnapshot?.totals?.totalQty || 0),
        totalBonus: Number(modelSnapshot?.totals?.totalBonus || 0),
        grossSubtotal: Number(modelSnapshot?.totals?.grossSubtotal || 0),
        netTotal: Number(modelSnapshot?.totals?.netPreTaxTotal || 0),
        vatTotal: Number(modelSnapshot?.totals?.vatTotal || 0),
        whtTotal: Number(modelSnapshot?.totals?.whtTotal || 0),
        grandTotal: Number(modelSnapshot?.totals?.grandTotal || 0),
      };

      const orderNo = String(order.serial || order.id || "");
      const clientName = String(
        modelSnapshot?.buyer?.nameAr || order.clientName || clientData?.tradeNameAr || clientData?.name || ""
      );
      const branchName = String(
        modelSnapshot?.buyer?.branchName || order.branchName || ""
      );

      const frozenModelSnapshot = {
        ...modelSnapshot,
        docType,
        serialNo: serialInfo.clean,
        version,
        invoiceDate,
        cashSales,
        hideBonus,
        lang,
        isSplitLoad,
        sourceOrderFingerprint,
      };

      const newInvoiceDoc = {
        id: newDocId,
        docId: newDocId,
        orderId,
        orderNo,
        clientId: String(order.clientId || ""),
        clientName,
        branchId: String(order.branchId || ""),
        branchName,
        docType,
        sequenceType,
        serialNo: serialInfo.clean,
        serialNumberNumeric: serialInfo.numeric,
        version,
        isLatestVersion: true,
        status: "issued",
        invoiceDate,
        isSplitLoad,
        cashSales,
        hideBonus,
        lang,
        revisionReason: revisionReason || null,
        sourceOrderFingerprint,
        poNumber: String(modelSnapshot?.poNumber || ""),
        totals: snapshotTotals,
        modelSnapshot: frozenModelSnapshot,
        // Phase 2 integration placeholders (Egypt ETA & Finance AR/GL)
        etaUuid: null,
        etaStatus: "not_submitted",
        etaPdfUrl: null,
        glPosted: false,
        glEntryId: null,
        createdAt: nowIso,
        createdAtServer: FieldValue.serverTimestamp(),
        createdBy: actor.effectiveUserId,
        createdByName: actor.effectiveUserName,
      };

      // Supersede any previous non-voided latest doc for this order + docType
      const updatedOrderDocs = [];
      for (const existingDoc of orderAllDocs) {
        if (
          existingDoc.docType === docType &&
          String(existingDoc.status || "issued").toLowerCase() !== "voided" &&
          existingDoc.isLatestVersion !== false
        ) {
          tx.update(existingDoc.ref, {
            status: "superseded",
            isLatestVersion: false,
            supersededAt: nowIso,
            supersededBy: actor.effectiveUserId,
            supersededByName: actor.effectiveUserName,
            supersededByDocId: newDocId,
          });
        } else {
          updatedOrderDocs.push(existingDoc);
        }
      }
      updatedOrderDocs.push(newInvoiceDoc);

      tx.set(newDocRef, newInvoiceDoc);

      const orderSummaryUpdate = buildOrderInvoicingSummary(updatedOrderDocs, nowIso);
      tx.update(orderRef, orderSummaryUpdate);

      writeAuditLogInTx(tx, db, {
        action: "SALES_INVOICE_COMMITTED",
        module: "sales",
        collectionName: "sales_invoices",
        docId: newDocId,
        actor,
        summary: `Committed ${docType} #${serialInfo.clean} (v${version}) for order #${orderNo}`,
        after: {
          docId: newDocId,
          orderId,
          orderNo,
          docType,
          serialNo: serialInfo.clean,
          version,
          invoiceDate,
          isSplitLoad,
          cashSales,
          grandTotal: snapshotTotals.grandTotal,
        },
      });

      return {
        success: true,
        docId: newDocId,
        orderId,
        docType,
        serialNo: serialInfo.clean,
        version,
      };
    });

    return result;
  }
);

export const salesVoidInvoiceDocument = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const docId = String(data.docId || "").trim();
    const voidReason = String(data.voidReason || "").trim();

    if (!docId) {
      throw new HttpsError("invalid-argument", "docId is required.");
    }
    if (!voidReason || voidReason.length < 3) {
      throw new HttpsError("invalid-argument", "A voidReason (at least 3 characters) is required.");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (tx) => {
      const invRef = db.collection("sales_invoices").doc(docId);
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists) {
        throw new HttpsError("not-found", `Invoice document ${docId} does not exist.`);
      }
      const invData = { id: invSnap.id, ...invSnap.data() };
      const st = String(invData.status || "issued").toLowerCase();
      if (st === "voided") {
        throw new HttpsError("failed-precondition", "This invoice document is already voided.");
      }
      if (invData.etaStatus === "submitted" || invData.etaStatus === "valid") {
        throw new HttpsError("failed-precondition", "Cannot void an invoice already submitted to ETA.");
      }
      if (invData.glPosted === true) {
        throw new HttpsError("failed-precondition", "Cannot void an invoice already posted to General Ledger.");
      }

      const orderId = String(invData.orderId || "").trim();
      const orderRef = orderId ? db.collection("sales_orders").doc(orderId) : null;
      const [orderSnap, sameOrderDocsSnap] = await Promise.all([
        orderRef ? tx.get(orderRef) : Promise.resolve(null),
        orderId
          ? tx.get(db.collection("sales_invoices").where("orderId", "==", orderId))
          : Promise.resolve(null),
      ]);

      tx.update(invRef, {
        status: "voided",
        isLatestVersion: false,
        voidedAt: nowIso,
        voidedAtServer: FieldValue.serverTimestamp(),
        voidedBy: actor.effectiveUserId,
        voidedByName: actor.effectiveUserName,
        voidReason,
      });

      if (orderRef && orderSnap?.exists && sameOrderDocsSnap) {
        const remainingDocs = sameOrderDocsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => d.id !== docId);
        const orderSummaryUpdate = buildOrderInvoicingSummary(remainingDocs, nowIso);
        tx.update(orderRef, orderSummaryUpdate);
      }

      writeAuditLogInTx(tx, db, {
        action: "SALES_INVOICE_VOIDED",
        module: "sales",
        collectionName: "sales_invoices",
        docId,
        actor,
        summary: `Voided ${invData.docType} #${invData.serialNo} (v${invData.version || 1}) — ${voidReason}`,
        before: { status: invData.status, serialNo: invData.serialNo, version: invData.version || 1 },
        after: { status: "voided", voidReason },
      });

      return {
        success: true,
        docId,
        orderId,
        docType: invData.docType,
        serialNo: invData.serialNo,
      };
    });

    return result;
  }
);
