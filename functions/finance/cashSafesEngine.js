/**
 * Server-Side Atomic Treasury & Cash Safes Transactional Engine
 * - Runs all Cash Voucher, Approval/Rejection, Inter-Safe Transfer, Banknote Exchange,
 *   Physical Safe Count Audit, Voucher Reversal & Metadata Edit flows inside Firestore `runTransaction`.
 * - Reads live safe wallets & custody ledgers atomically before mutating balances.
 * - Appends immutable `audit_logs` inside the exact same transaction.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  assertErpCaller,
  resolveActorIdentity,
  writeAuditLogInTx,
} from "../shared/serverAuthAndAudit.js";
import {
  EGP_DENOMINATIONS,
  CASH_TRANSACTION_TYPES,
  CORPORATE_BANK_ACCOUNTS,
  calculateBanknoteTotal,
  validateBanknoteMatch,
  checkSufficientBanknotes,
  normalizeAccountAttributesServer,
  applyCustodyLedgerUpdateInTx,
} from "./financeValidators.js";

const CUSTODY_VOUCHER_TYPES = new Set([
  "custody_issue",
  "custody_settle",
  "salary_advance",
  "advance_settle",
]);

function buildSafeUpdatePayload(currency, balanceVal, denominationsMap, nowIso) {
  const payload = {
    [`balances.${currency}.currentBalance`]: balanceVal,
    [`balances.${currency}.denominations`]: denominationsMap,
    updatedAt: nowIso,
  };
  if (currency === "EGP") {
    payload.currentBalance = balanceVal;
    payload.balance = balanceVal;
    payload.denominations = denominationsMap;
  }
  return payload;
}

function validateAndComputeSafeMutation({
  safeData,
  safeId,
  currency,
  numAmount,
  denominations = {},
  isOutflow,
  isInflow,
  allowOverdraft = false,
}) {
  const currWallet = safeData.balances?.[currency] || {
    currentBalance: 0,
    denominations: {},
  };
  const currentBal = Number(currWallet.currentBalance) || 0;
  const currentDenoms = { ...(currWallet.denominations || {}) };

  if (isOutflow) {
    if (currentBal < numAmount && !allowOverdraft) {
      throw new HttpsError(
        "failed-precondition",
        `رصيد الخزينة الحالي (${currentBal.toLocaleString()} ${currency}) لا يكفي لصرف مبلغ (${numAmount.toLocaleString()} ${currency})`
      );
    }
    if (currency === "EGP") {
      const denomSum = calculateBanknoteTotal(denominations);
      if (denomSum > 0) {
        const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, true);
        if (!sufficiency.isSufficient && !allowOverdraft) {
          const detailStr = sufficiency.shortages
            .map((s) => `فئة ${s.denom} ج (المطلوب: ${s.requested}، المتوفر: ${s.available})`)
            .join("، ");
          throw new HttpsError(
            "failed-precondition",
            `الفئات الورقية المتوفرة بالخزينة لا تكفي لإتمام الصرف: ${detailStr}`
          );
        }
      }
    }
  } else if (isInflow && currency === "EGP") {
    const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, false);
    if (!sufficiency.isSufficient) {
      const detailStr = sufficiency.shortages
        .map((s) => `فئة ${s.denom} ج (المطلوب ردها كفكة: ${s.requested}، المتوفر بالخزينة: ${s.available})`)
        .join("، ");
      throw new HttpsError(
        "failed-precondition",
        `الفئات الورقية المتوفرة بالخزينة لا تكفي لرد الفكة المطلوبة: ${detailStr}`
      );
    }
  }

  const newBal = isOutflow
    ? currentBal - numAmount
    : isInflow
      ? currentBal + numAmount
      : currentBal;

  const newDenoms = { ...currentDenoms };
  if (currency === "EGP") {
    for (const denom of EGP_DENOMINATIONS) {
      const count = Number(denominations?.[denom]) || 0;
      const existing = Number(newDenoms[denom]) || 0;
      if (isOutflow) {
        newDenoms[denom] = Math.max(0, existing - count);
      } else if (isInflow) {
        newDenoms[denom] = Math.max(0, existing + count);
      }
    }
  }

  return { newBal, newDenoms, safeId };
}

function normalizeServerVoucherId({ customVoucherId, type, safeId, now }) {
  if (customVoucherId) return String(customVoucherId).trim();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  if (type === "custody_issue" || type === "salary_advance") {
    const prefix = type === "custody_issue" ? "CUS" : "ADV";
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${prefix}-${safeId}-${yy}${mm}${dd}-${randSuffix}`;
  }
  return `VCH-${safeId}-${dateStr}-${randSuffix}`;
}

export const financePostCashVoucher = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const safeId = String(data.safeId || "").trim();
    const type = String(data.type || "disbursement").trim();
    const numAmount = Number(data.amount);
    const currency = String(data.currency || "EGP").trim() || "EGP";
    const exchangeRate = Number(data.exchangeRate) || 1;
    const denominations = data.denominations || {};
    const mainAccount = String(data.mainAccount || "").trim();
    const subAccountId = data.subAccountId || null;
    const subAccountName = String(data.subAccountName || "");
    const targetSafeId = data.targetSafeId || null;
    const requiresApproval = Boolean(data.requiresApproval);
    const description = String(data.description || "");
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    const targetCustodyId = data.targetCustodyId || null;
    const targetAdvanceId = data.targetAdvanceId || null;

    if (!safeId) {
      throw new HttpsError("invalid-argument", "Safe or bank identifier is required.");
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw new HttpsError("invalid-argument", "يرجى إدخال مبلغ صحيح أكبر من الصفر");
    }

    const isBank = safeId.startsWith("BANK-");
    if (currency === "EGP" && !isBank && !validateBanknoteMatch(numAmount, denominations)) {
      const actualCounted = calculateBanknoteTotal(denominations);
      throw new HttpsError(
        "invalid-argument",
        `إجمالي تفقيط الفئات الورقية (${actualCounted.toLocaleString()} ج.م) لا يتطابق مع إجمالي السند (${numAmount.toLocaleString()} ج.م)`
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const voucherId = normalizeServerVoucherId({
      customVoucherId: data.customVoucherId,
      type,
      safeId,
      now,
    });
    const finalSsotId = data.ssotId || voucherId;

    const typeConfig =
      CASH_TRANSACTION_TYPES.find((t) => t.id === type) || CASH_TRANSACTION_TYPES[0];
    const isOutflow = typeConfig.direction === "out";
    const isInflow = typeConfig.direction === "in";
    const fiscalYear = now.getFullYear();
    const fiscalPeriod = nowIso.slice(0, 7);

    const db = getFirestore();

    // Resolve COA hierarchy attributes server-side
    const accountsMaster = Array.isArray(data.accountsMaster) ? data.accountsMaster : [];
    const subCodeCandidate = String(subAccountId || "").trim();
    const isSubRegisteredInCoa = Boolean(
      subCodeCandidate &&
        accountsMaster.some((a) => String(a.code || a.id).trim() === subCodeCandidate)
    );
    const effectiveMainAccount = isSubRegisteredInCoa ? subCodeCandidate : mainAccount;
    const effectiveParentAccountCode = isSubRegisteredInCoa ? mainAccount : null;

    const coaMeta = normalizeAccountAttributesServer({
      code: effectiveMainAccount,
      statement: data.statement,
      reportCategory: data.reportCategory,
      cashFlowCategory: data.cashFlowCategory,
      nature: data.nature,
    });

    const baseVoucherFields = {
      id: voucherId,
      ssotId: finalSsotId,
      targetCustodyId,
      targetAdvanceId,
      safeId,
      type,
      typeAr: typeConfig.labelAr,
      direction: typeConfig.direction,
      amount: numAmount,
      currency,
      exchangeRate,
      amountInEGP: currency === "EGP" ? numAmount : numAmount * exchangeRate,
      denominations: isBank ? {} : denominations,
      mainAccount: effectiveMainAccount,
      parentAccountCode: effectiveParentAccountCode,
      mainAccountAr:
        (isSubRegisteredInCoa ? subAccountName : null) ||
        data.mainAccountNameAr ||
        data.mainAccountName ||
        effectiveMainAccount,
      statement: coaMeta.statement,
      reportCategory: coaMeta.reportCategory,
      cashFlowCategory: coaMeta.cashFlowCategory,
      nature: coaMeta.nature,
      fiscalYear,
      fiscalPeriod,
      costCenterId: data.costCenterId || null,
      costCenterName: data.costCenterName || "",
      subAccountId,
      subAccountName,
      supplierAllocation: data.supplierAllocation || null,
      taxDocumentType: data.taxDocumentType || "no_document",
      taxDetails: data.taxDetails || {},
      description,
      attachments,
      targetSafeId,
      issuedByUserId: actor.effectiveUserId,
      issuedByName: actor.effectiveUserName,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const hasCustodySideEffect = Boolean(subAccountId && CUSTODY_VOUCHER_TYPES.has(type));

    const resultStatus = await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("cash_transactions").doc(voucherId);
      const safeRef = !isBank ? db.collection("cash_safes").doc(safeId) : null;
      const targetSafeRef =
        !isBank && type === "safe_transfer" && targetSafeId
          ? db.collection("cash_safes").doc(targetSafeId)
          : null;
      const custodyRef = hasCustodySideEffect
        ? db.collection("custody_ledger").doc(`CUST-${subAccountId}`)
        : null;
      const ssotRefId =
        type === "custody_settle"
          ? targetCustodyId || finalSsotId
          : type === "advance_settle"
            ? targetAdvanceId || finalSsotId
            : finalSsotId;
      const ssotRef = hasCustodySideEffect
        ? db.collection("custodies_and_advances").doc(ssotRefId)
        : null;

      // Read phase first
      const existingVoucherSnap = await tx.get(voucherRef);
      if (existingVoucherSnap.exists) {
        throw new HttpsError("already-exists", `Voucher ${voucherId} already exists.`);
      }
      const safeSnap = safeRef ? await tx.get(safeRef) : null;
      const targetSafeSnap = targetSafeRef ? await tx.get(targetSafeRef) : null;
      const custodySnap = custodyRef ? await tx.get(custodyRef) : null;

      if (isBank) {
        const bankAccount = CORPORATE_BANK_ACCOUNTS.find((b) => b.id === safeId);
        const voucherDoc = {
          ...baseVoucherFields,
          bankAccountId: safeId,
          bankAccountNameAr: bankAccount?.bankNameAr || safeId,
          bankAccountNameEn: bankAccount?.bankNameEn || safeId,
          isBank: true,
          status: "posted",
        };
        tx.set(voucherRef, voucherDoc);
        if (hasCustodySideEffect) {
          applyCustodyLedgerUpdateInTx(tx, db, {
            custodySnap,
            custodyRef,
            ssotRef,
            workerId: subAccountId,
            workerName: subAccountName,
            voucherId,
            ssotId: finalSsotId,
            targetCustodyId,
            targetAdvanceId,
            type,
            amount: numAmount,
            description: `${description} (${bankAccount?.bankNameAr || safeId})`,
            safeId,
            attachments,
            nowIso,
          });
        }
        writeAuditLogInTx(tx, db, {
          action: "cash_voucher_posted_bank",
          module: "finance",
          collectionName: "cash_transactions",
          docId: voucherId,
          actor,
          summary: `Bank voucher ${voucherId}: ${numAmount} ${currency}`,
          after: voucherDoc,
        });
        return "posted";
      }

      if (requiresApproval) {
        const pendingDoc = {
          ...baseVoucherFields,
          status: "pending_approval",
        };
        tx.set(voucherRef, pendingDoc);
        writeAuditLogInTx(tx, db, {
          action: "cash_voucher_staged_approval",
          module: "finance",
          collectionName: "cash_transactions",
          docId: voucherId,
          actor,
          summary: `Staged voucher ${voucherId} for approval: ${numAmount} ${currency}`,
          after: pendingDoc,
        });
        return "pending_approval";
      }

      if (!safeSnap || !safeSnap.exists) {
        throw new HttpsError("not-found", `الخزينة (${safeId}) غير موجودة في قاعدة البيانات`);
      }

      const { newBal, newDenoms } = validateAndComputeSafeMutation({
        safeData: safeSnap.data(),
        safeId,
        currency,
        numAmount,
        denominations,
        isOutflow,
        isInflow,
      });

      tx.update(safeRef, buildSafeUpdatePayload(currency, newBal, newDenoms, nowIso));

      const postedDoc = {
        ...baseVoucherFields,
        status: "posted",
        approvedByUserId: actor.effectiveUserId,
        approvedByName: actor.effectiveUserName,
        approvedAt: nowIso,
        balanceAfter: newBal,
      };
      tx.set(voucherRef, postedDoc);

      if (targetSafeRef && targetSafeSnap?.exists) {
        const targetData = targetSafeSnap.data();
        const targetCurr = targetData.balances?.[currency] || {
          currentBalance: 0,
          denominations: {},
        };
        const targetDenoms = { ...(targetCurr.denominations || {}) };
        if (currency === "EGP") {
          for (const denom of EGP_DENOMINATIONS) {
            targetDenoms[denom] =
              (Number(targetDenoms[denom]) || 0) + (Number(denominations?.[denom]) || 0);
          }
        }
        const nextTargetBal = (Number(targetCurr.currentBalance) || 0) + numAmount;
        tx.update(
          targetSafeRef,
          buildSafeUpdatePayload(currency, nextTargetBal, targetDenoms, nowIso)
        );
      }

      if (hasCustodySideEffect) {
        applyCustodyLedgerUpdateInTx(tx, db, {
          custodySnap,
          custodyRef,
          ssotRef,
          workerId: subAccountId,
          workerName: subAccountName,
          voucherId,
          ssotId: finalSsotId,
          targetCustodyId,
          targetAdvanceId,
          type,
          amount: numAmount,
          description,
          safeId,
          attachments,
          nowIso,
        });
      }

      writeAuditLogInTx(tx, db, {
        action: "cash_voucher_posted",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Posted voucher ${voucherId} on ${safeId}: ${numAmount} ${currency}`,
        after: postedDoc,
      });

      return "posted";
    });

    return { success: true, voucherId, status: resultStatus };
  }
);

export const financeApproveCashVoucher = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const voucherId = String(data.voucherId || "").trim();
    const approvalNotes = String(data.approvalNotes || "");
    const allowOverdraft = Boolean(data.allowOverdraft && caller.isGeneralAdmin);

    if (!voucherId) {
      throw new HttpsError("invalid-argument", "رقم السند مطلوب");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    const finalNewBal = await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("cash_transactions").doc(voucherId);
      const voucherSnap = await tx.get(voucherRef);
      if (!voucherSnap.exists) {
        throw new HttpsError("not-found", `السند (${voucherId}) غير موجود في قاعدة البيانات`);
      }
      const voucherData = voucherSnap.data();
      if (voucherData.status !== "pending_approval") {
        throw new HttpsError(
          "failed-precondition",
          `حالة السند الحالية (${voucherData.status}) لا تسمح بالاعتماد، قد تم اعتماده أو تعديله مسبقاً`
        );
      }

      const safeRef = db.collection("cash_safes").doc(voucherData.safeId);
      const safeSnap = await tx.get(safeRef);
      if (!safeSnap.exists) {
        throw new HttpsError("not-found", `الخزينة (${voucherData.safeId}) غير موجودة في قاعدة البيانات`);
      }

      const hasCustodySideEffect = Boolean(
        voucherData.subAccountId && CUSTODY_VOUCHER_TYPES.has(voucherData.type)
      );
      const custodyRef = hasCustodySideEffect
        ? db.collection("custody_ledger").doc(`CUST-${voucherData.subAccountId}`)
        : null;
      const finalSsotId = voucherData.ssotId || voucherId;
      const ssotRefId =
        voucherData.type === "custody_settle"
          ? voucherData.targetCustodyId || finalSsotId
          : voucherData.type === "advance_settle"
            ? voucherData.targetAdvanceId || finalSsotId
            : finalSsotId;
      const ssotRef = hasCustodySideEffect
        ? db.collection("custodies_and_advances").doc(ssotRefId)
        : null;
      const custodySnap = custodyRef ? await tx.get(custodyRef) : null;

      const currency = voucherData.currency || "EGP";
      const numAmount = Number(voucherData.amount) || 0;
      const { newBal, newDenoms } = validateAndComputeSafeMutation({
        safeData: safeSnap.data(),
        safeId: voucherData.safeId,
        currency,
        numAmount,
        denominations: voucherData.denominations || {},
        isOutflow: voucherData.direction === "out",
        isInflow: voucherData.direction === "in",
        allowOverdraft,
      });

      tx.update(safeRef, buildSafeUpdatePayload(currency, newBal, newDenoms, nowIso));

      const updatePayload = {
        status: "posted",
        approvedByUserId: actor.effectiveUserId,
        approvedByName: actor.effectiveUserName,
        approvedAt: nowIso,
        balanceAfter: newBal,
        approvalNotes,
        updatedAt: nowIso,
      };
      tx.update(voucherRef, updatePayload);

      if (hasCustodySideEffect) {
        applyCustodyLedgerUpdateInTx(tx, db, {
          custodySnap,
          custodyRef,
          ssotRef,
          workerId: voucherData.subAccountId,
          workerName: voucherData.subAccountName,
          voucherId,
          ssotId: finalSsotId,
          targetCustodyId: voucherData.targetCustodyId || null,
          targetAdvanceId: voucherData.targetAdvanceId || null,
          type: voucherData.type,
          amount: numAmount,
          description: voucherData.description || "",
          safeId: voucherData.safeId,
          attachments: voucherData.attachments || [],
          nowIso,
        });
      }

      writeAuditLogInTx(tx, db, {
        action: "cash_voucher_approved",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Approved voucher ${voucherId}: ${numAmount} ${currency}`,
        before: { status: voucherData.status },
        after: updatePayload,
      });

      return newBal;
    });

    return { success: true, voucherId, status: "posted", balanceAfter: finalNewBal };
  }
);

export const financeRejectCashVoucher = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const voucherId = String(data.voucherId || "").trim();
    const cleanReason =
      String(data.rejectionReason || "").trim() || "تم الرفض بواسطة المعتمد المالي";

    if (!voucherId) {
      throw new HttpsError("invalid-argument", "رقم السند مطلوب");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("cash_transactions").doc(voucherId);
      const voucherSnap = await tx.get(voucherRef);
      if (!voucherSnap.exists) {
        throw new HttpsError("not-found", `السند (${voucherId}) غير موجود في قاعدة البيانات`);
      }
      const voucherData = voucherSnap.data();
      if (voucherData.status !== "pending_approval") {
        throw new HttpsError(
          "failed-precondition",
          `حالة السند الحالية (${voucherData.status}) لا تسمح بالرفض`
        );
      }

      const updateFields = {
        status: "rejected",
        rejectedByUserId: actor.effectiveUserId,
        rejectedByName: actor.effectiveUserName,
        rejectedAt: nowIso,
        rejectionReason: cleanReason,
        updatedAt: nowIso,
      };
      tx.update(voucherRef, updateFields);
      writeAuditLogInTx(tx, db, {
        action: "cash_voucher_rejected",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Rejected voucher ${voucherId}: ${cleanReason}`,
        before: { status: voucherData.status },
        after: updateFields,
      });
    });

    return { success: true, voucherId, status: "rejected" };
  }
);

export const financeReverseCashVoucher = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const voucherId = String(data.voucherId || "").trim();
    const reason = String(data.reason || "").trim();

    if (!voucherId) {
      throw new HttpsError("invalid-argument", "رقم السند مطلوب");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("cash_transactions").doc(voucherId);
      const voucherSnap = await tx.get(voucherRef);
      if (!voucherSnap.exists) {
        throw new HttpsError("not-found", "السند غير موجود");
      }
      const v = voucherSnap.data();
      if (v.status !== "posted") {
        throw new HttpsError("failed-precondition", `لا يمكن إلغاء سند بحالة (${v.status})`);
      }

      const isBank = Boolean(v.isBank || String(v.safeId || "").startsWith("BANK-"));
      let safeSnap = null;
      const safeRef = !isBank ? db.collection("cash_safes").doc(v.safeId) : null;
      if (safeRef) {
        safeSnap = await tx.get(safeRef);
        if (!safeSnap.exists) {
          throw new HttpsError("not-found", "الخزينة غير موجودة");
        }
      }

      if (safeRef && safeSnap) {
        const safeData = safeSnap.data();
        const currency = v.currency || "EGP";
        const currWallet = safeData.balances?.[currency] || {
          currentBalance: 0,
          denominations: {},
        };
        const currentBal = Number(currWallet.currentBalance) || 0;
        const currentDenoms = { ...(currWallet.denominations || {}) };

        const isOriginalOutflow = v.direction === "out";
        const isOriginalInflow = v.direction === "in";
        const restoredBal = isOriginalOutflow
          ? currentBal + Number(v.amount)
          : isOriginalInflow
            ? currentBal - Number(v.amount)
            : currentBal;

        if (currency === "EGP" && v.denominations) {
          for (const denom of EGP_DENOMINATIONS) {
            const count = Number(v.denominations[denom]) || 0;
            const currentCount = Number(currentDenoms[denom]) || 0;
            if (isOriginalOutflow) {
              currentDenoms[denom] = Math.max(0, currentCount + count);
            } else if (isOriginalInflow) {
              currentDenoms[denom] = Math.max(0, currentCount - count);
            }
          }
        }
        tx.update(safeRef, buildSafeUpdatePayload(currency, restoredBal, currentDenoms, nowIso));
      }

      const revFields = {
        status: "reversed",
        isReversed: true,
        reversalReason: reason,
        reversedByUserId: actor.effectiveUserId,
        reversedByName: actor.effectiveUserName,
        reversedAt: nowIso,
        updatedAt: nowIso,
      };
      tx.update(voucherRef, revFields);
      writeAuditLogInTx(tx, db, {
        action: "cash_voucher_reversed",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Reversed voucher ${voucherId}: ${reason || "Admin reversal"}`,
        before: { status: v.status, amount: v.amount },
        after: revFields,
      });
    });

    return { success: true };
  }
);

export const financeUpdateCashVoucher = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const voucherId = String(data.voucherId || "").trim();
    const updates = data.updates || {};
    const reason = String(data.reason || "تعديل بيانات السند المالي");

    if (!voucherId) {
      throw new HttpsError("invalid-argument", "رقم السند غير محدد");
    }

    const isFinanceRole =
      caller.isGeneralAdmin ||
      data.currentUser?.role === "financial_manager" ||
      data.currentUser?.role === "treasury_manager" ||
      (Array.isArray(data.currentUser?.permissions) &&
        data.currentUser.permissions.includes("edit_cash_voucher"));

    if (!isFinanceRole) {
      throw new HttpsError(
        "permission-denied",
        "غير مصرح لك بتعديل بيانات السندات المالية. يلزم صلاحية مدير عام أو مدير خزانة."
      );
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();
    const allowedFields = [
      "description",
      "mainAccount",
      "mainAccountAr",
      "statement",
      "reportCategory",
      "cashFlowCategory",
      "nature",
      "subAccountId",
      "subAccountName",
      "costCenterId",
      "costCenterName",
      "taxDocumentType",
      "taxDetails",
      "attachments",
    ];

    const auditEntry = await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("cash_transactions").doc(voucherId);
      const snap = await tx.get(voucherRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "السند المالي غير موجود في قاعدة البيانات");
      }
      const existing = snap.data();

      const diff = {};
      const sanitizedUpdates = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          sanitizedUpdates[field] = updates[field];
          const oldVal = existing[field] !== undefined ? existing[field] : null;
          const newVal = updates[field] !== undefined ? updates[field] : null;
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            diff[field] = { before: oldVal, after: newVal };
          }
        }
      }

      const entry = {
        action: "voucher_edited",
        timestamp: nowIso,
        userId: actor.effectiveUserId,
        userName: actor.effectiveUserName,
        userRole: caller.role,
        reason,
        diff,
      };
      const currentAuditLog = Array.isArray(existing.auditLog) ? existing.auditLog : [];

      tx.update(voucherRef, {
        ...sanitizedUpdates,
        auditLog: [...currentAuditLog, entry],
        updatedAt: nowIso,
        lastEditedByUserId: actor.effectiveUserId,
        lastEditedByName: actor.effectiveUserName,
        lastEditedAt: nowIso,
      });

      writeAuditLogInTx(tx, db, {
        action: "cash_voucher_edited",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Updated metadata on voucher ${voucherId}`,
        before: diff,
        after: sanitizedUpdates,
      });

      return entry;
    });

    return { success: true, voucherId, auditEntry };
  }
);

export const financeInitiateInterSafeTransfer = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);

    const sourceSafeId = String(data.sourceSafeId || "").trim();
    const targetSafeId = String(data.targetSafeId || "").trim();
    const numAmount = Number(data.amount) || 0;
    const currency = String(data.currency || "EGP").trim() || "EGP";
    const denominations = data.denominations || {};
    const description = String(data.description || "").trim();
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];

    if (!sourceSafeId || !targetSafeId) {
      throw new HttpsError("invalid-argument", "يرجى تحديد الخزينة المصدر والخزينة المستلمة");
    }
    if (sourceSafeId === targetSafeId) {
      throw new HttpsError("invalid-argument", "لا يمكن التحويل لنفس الخزينة");
    }
    if (numAmount <= 0) {
      throw new HttpsError("invalid-argument", "مبلغ التحويل يجب أن يكون أكبر من الصفر");
    }
    if (currency === "EGP" && !validateBanknoteMatch(numAmount, denominations)) {
      throw new HttpsError("invalid-argument", "إجمالي الفئات الورقية لا يتطابق مع مبلغ التحويل");
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = nowIso.slice(0, 10).replace(/-/g, "");
    const voucherId = `TRF-${sourceSafeId.toUpperCase()}-${dateStr}-${Date.now().toString().slice(-4)}`;

    const db = getFirestore();
    const resultMeta = await db.runTransaction(async (tx) => {
      const sourceSafeRef = db.collection("cash_safes").doc(sourceSafeId);
      const targetSafeRef = db.collection("cash_safes").doc(targetSafeId);
      const voucherRef = db.collection("cash_transactions").doc(voucherId);

      const sourceSnap = await tx.get(sourceSafeRef);
      const targetSnap = await tx.get(targetSafeRef);

      if (!sourceSnap.exists) {
        throw new HttpsError("not-found", `الخزينة المصدر (${sourceSafeId}) غير موجودة`);
      }
      if (!targetSnap.exists) {
        throw new HttpsError("not-found", `الخزينة المستلمة (${targetSafeId}) غير موجودة`);
      }

      const sourceSafeData = sourceSnap.data();
      const targetSafeData = targetSnap.data();
      const sourceWallet = sourceSafeData.balances?.[currency] || {
        currentBalance: 0,
        denominations: {},
      };
      const currentBal = Number(sourceWallet.currentBalance) || 0;
      const currentDenoms = { ...(sourceWallet.denominations || {}) };

      if (currentBal < numAmount) {
        throw new HttpsError(
          "failed-precondition",
          `رصيد الخزينة المصدر (${currentBal.toLocaleString()} ${currency}) لا يكفي لتحويل (${numAmount.toLocaleString()} ${currency})`
        );
      }

      if (currency === "EGP") {
        const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, true);
        if (!sufficiency.isSufficient) {
          const detailStr = sufficiency.shortages
            .map((s) => `فئة ${s.denom} ج (المطلوب: ${s.requested}، المتوفر: ${s.available})`)
            .join("، ");
          throw new HttpsError("failed-precondition", `الفئات الورقية المتوفرة بالخزينة المصدر لا تكفي: ${detailStr}`);
        }

        const targetWallet = targetSafeData.balances?.[currency] || {
          currentBalance: 0,
          denominations: {},
        };
        const targetDenoms = targetWallet.denominations || {};
        const targetShortages = [];
        for (const denom of EGP_DENOMINATIONS) {
          const count = Number(denominations?.[denom]) || 0;
          if (count < 0) {
            const needed = -count;
            const avail = Number(targetDenoms[denom]) || 0;
            if (needed > avail) {
              targetShortages.push(
                `فئة ${denom} ج (المطلوب كفكة من الخزينة المستلمة: ${needed}، المتوفر: ${avail})`
              );
            }
          }
        }
        if (targetShortages.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            `الفئات الورقية المطلوب استردادها كفكة غير متوفرة بالخزينة المستلمة: ${targetShortages.join("، ")}`
          );
        }

        for (const denom of EGP_DENOMINATIONS) {
          const count = Number(denominations?.[denom]) || 0;
          currentDenoms[denom] = Math.max(0, (Number(currentDenoms[denom]) || 0) - count);
        }
      }

      const newSourceBal = Math.max(0, currentBal - numAmount);
      tx.update(sourceSafeRef, buildSafeUpdatePayload(currency, newSourceBal, currentDenoms, nowIso));

      const sourceNameAr = sourceSafeData.nameAr || sourceSafeId;
      const sourceNameEn = sourceSafeData.nameEn || sourceSafeData.nameAr || sourceSafeId;
      const targetNameAr = targetSafeData.nameAr || targetSafeId;
      const targetNameEn = targetSafeData.nameEn || targetSafeData.nameAr || targetSafeId;

      const transferDoc = {
        id: voucherId,
        voucherNumber: voucherId,
        type: "safe_transfer",
        typeAr: "تحويل بين الخزائن",
        typeEn: "Inter-Safe Transfer",
        status: "pending_receiver_approval",
        direction: "out",
        safeId: sourceSafeId,
        sourceSafeId,
        sourceSafeNameAr: sourceNameAr,
        sourceSafeNameEn: sourceNameEn,
        targetSafeId,
        targetSafeNameAr: targetNameAr,
        targetSafeNameEn: targetNameEn,
        amount: numAmount,
        amountInEGP: numAmount,
        currency,
        exchangeRate: 1,
        denominations,
        mainAccount: "1020101",
        mainAccountAr: "تحويلات داخلية بين الخزائن",
        mainAccountEn: "Internal Safe Transfers",
        description: description || `تحويل سيولة نقدية من ${sourceNameAr} إلى ${targetNameAr}`,
        attachments,
        sourceCustodianId: sourceSafeData.responsibleUserId || actor.effectiveUserId,
        targetCustodianId: targetSafeData.responsibleUserId || "",
        targetAuthorizerId: targetSafeData.authorizerUserId || "",
        issuedByUserId: actor.effectiveUserId,
        issuedByName: actor.effectiveUserName,
        initiatedByUserId: actor.effectiveUserId,
        initiatedByName: actor.effectiveUserName,
        initiatedAt: nowIso,
        balanceAfter: newSourceBal,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tx.set(voucherRef, transferDoc);

      writeAuditLogInTx(tx, db, {
        action: "inter_safe_transfer_initiated",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Initiated transfer ${voucherId}: ${numAmount} ${currency} from ${sourceSafeId} -> ${targetSafeId}`,
        after: transferDoc,
      });

      return {
        sourceName: sourceNameAr,
        targetName: targetNameAr,
        targetCustodianId: targetSafeData.responsibleUserId || null,
      };
    });

    return {
      success: true,
      voucherId,
      status: "pending_receiver_approval",
      ...resultMeta,
      message: `تم خصم المبلغ من ${resultMeta.sourceName} وإرسال إشعار استلام لمسؤول ${resultMeta.targetName}`,
    };
  }
);

export const financeConfirmInterSafeTransfer = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const voucherId = String(data.voucherId || "").trim();

    if (!voucherId) {
      throw new HttpsError("invalid-argument", "معرف السند غير صالح");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("cash_transactions").doc(voucherId);
      const vSnap = await tx.get(voucherRef);
      if (!vSnap.exists) {
        throw new HttpsError("not-found", `سند التحويل (${voucherId}) غير موجود`);
      }
      const voucher = vSnap.data();
      if (voucher.status !== "pending_receiver_approval") {
        throw new HttpsError(
          "failed-precondition",
          `حالة التحويل الحالية (${voucher.status}) لا تسمح بالتأكيد`
        );
      }

      const targetSafeId = voucher.targetSafeId;
      const targetSafeRef = db.collection("cash_safes").doc(targetSafeId);
      const targetSnap = await tx.get(targetSafeRef);
      if (!targetSnap.exists) {
        throw new HttpsError("not-found", `الخزينة المستلمة (${targetSafeId}) غير موجودة`);
      }

      const targetSafeData = targetSnap.data();
      const currency = voucher.currency || "EGP";
      const numAmount = Number(voucher.amount) || 0;
      const targetWallet = targetSafeData.balances?.[currency] || {
        currentBalance: 0,
        denominations: {},
      };
      const currentTargetBal = Number(targetWallet.currentBalance) || 0;
      const targetDenoms = { ...(targetWallet.denominations || {}) };

      if (currency === "EGP") {
        for (const denom of EGP_DENOMINATIONS) {
          const count = Number(voucher.denominations?.[denom]) || 0;
          targetDenoms[denom] = Math.max(0, (Number(targetDenoms[denom]) || 0) + count);
        }
      }

      const newTargetBal = currentTargetBal + numAmount;
      tx.update(targetSafeRef, buildSafeUpdatePayload(currency, newTargetBal, targetDenoms, nowIso));

      const updateFields = {
        status: "posted",
        receivedByUserId: actor.effectiveUserId,
        receivedByName: actor.effectiveUserName,
        receivedAt: nowIso,
        approvedByUserId: actor.effectiveUserId,
        approvedByName: actor.effectiveUserName,
        approvedAt: nowIso,
        targetBalanceAfter: newTargetBal,
        updatedAt: nowIso,
      };
      tx.update(voucherRef, updateFields);

      writeAuditLogInTx(tx, db, {
        action: "inter_safe_transfer_confirmed",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Confirmed transfer ${voucherId} on ${targetSafeId}: ${numAmount} ${currency}`,
        before: { status: voucher.status },
        after: updateFields,
      });
    });

    return { success: true, voucherId, status: "posted" };
  }
);

export const financeRejectInterSafeTransfer = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const voucherId = String(data.voucherId || "").trim();
    const reason =
      String(data.reason || "").trim() || "تم رفض استلام التحويل من قبل مسؤول الخزينة المستلمة";

    if (!voucherId) {
      throw new HttpsError("invalid-argument", "معرف السند غير صالح");
    }

    const db = getFirestore();
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      const voucherRef = db.collection("cash_transactions").doc(voucherId);
      const vSnap = await tx.get(voucherRef);
      if (!vSnap.exists) {
        throw new HttpsError("not-found", `سند التحويل (${voucherId}) غير موجود`);
      }
      const voucher = vSnap.data();
      if (voucher.status !== "pending_receiver_approval") {
        throw new HttpsError(
          "failed-precondition",
          `حالة التحويل الحالية (${voucher.status}) لا تسمح بالرفض`
        );
      }

      const sourceSafeId = voucher.sourceSafeId || voucher.safeId;
      const sourceSafeRef = db.collection("cash_safes").doc(sourceSafeId);
      const sourceSnap = await tx.get(sourceSafeRef);
      if (!sourceSnap.exists) {
        throw new HttpsError(
          "not-found",
          `الخزينة المصدر (${sourceSafeId}) غير موجودة لإعادة الأموال`
        );
      }

      const sourceSafeData = sourceSnap.data();
      const currency = voucher.currency || "EGP";
      const numAmount = Number(voucher.amount) || 0;
      const sourceWallet = sourceSafeData.balances?.[currency] || {
        currentBalance: 0,
        denominations: {},
      };
      const sourceDenoms = { ...(sourceWallet.denominations || {}) };

      if (currency === "EGP") {
        for (const denom of EGP_DENOMINATIONS) {
          const count = Number(voucher.denominations?.[denom]) || 0;
          sourceDenoms[denom] = Math.max(0, (Number(sourceDenoms[denom]) || 0) + count);
        }
      }

      const refundedBal = (Number(sourceWallet.currentBalance) || 0) + numAmount;
      tx.update(sourceSafeRef, buildSafeUpdatePayload(currency, refundedBal, sourceDenoms, nowIso));

      const rejectFields = {
        status: "rejected",
        rejectedByUserId: actor.effectiveUserId,
        rejectedByName: actor.effectiveUserName,
        rejectedReason: reason,
        rejectedAt: nowIso,
        refundedBalanceAfter: refundedBal,
        updatedAt: nowIso,
      };
      tx.update(voucherRef, rejectFields);

      writeAuditLogInTx(tx, db, {
        action: "inter_safe_transfer_rejected",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Rejected transfer ${voucherId}, refunded ${numAmount} ${currency} to ${sourceSafeId}`,
        before: { status: voucher.status },
        after: rejectFields,
      });
    });

    return { success: true, voucherId, status: "rejected" };
  }
);

export const financeExecuteChangeExchange = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const safeId = String(data.safeId || "").trim();
    const notesGivenOut = data.notesGivenOut || {};
    const notesTakenIn = data.notesTakenIn || {};
    const notes = String(data.notes || "");

    const outTotal = calculateBanknoteTotal(notesGivenOut);
    const inTotal = calculateBanknoteTotal(notesTakenIn);

    if (Math.abs(outTotal - inTotal) > 0.005) {
      throw new HttpsError(
        "invalid-argument",
        `عملية الفكة يجب أن تكون متوازنة القيمة تماماً: الخارج (${outTotal} ج.م) لا يساوي الداخل (${inTotal} ج.م)`
      );
    }
    if (outTotal <= 0) {
      throw new HttpsError("invalid-argument", "يرجى تحديد الفئات المراد فكها واستبدالها");
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = nowIso.slice(0, 10).replace(/-/g, "");
    const voucherId = `VCH-${safeId}-${dateStr}-EXCH-${Math.floor(1000 + Math.random() * 9000)}`;

    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const safeRef = db.collection("cash_safes").doc(safeId);
      const safeSnap = await tx.get(safeRef);
      if (!safeSnap.exists) {
        throw new HttpsError("not-found", "الخزينة غير موجودة");
      }

      const safeData = safeSnap.data();
      const currWallet = safeData.balances?.EGP || {
        currentBalance: 0,
        denominations: {},
      };
      const currentDenoms = currWallet.denominations || {};

      const sufficiency = checkSufficientBanknotes(currentDenoms, notesGivenOut, true);
      if (!sufficiency.isSufficient) {
        const detailStr = sufficiency.shortages
          .map((s) => `فئة ${s.denom} ج (المطلوب: ${s.requested}، المتوفر: ${s.available})`)
          .join("، ");
        throw new HttpsError(
          "failed-precondition",
          `الفئات المراد فكها غير متوفرة بالكامل في الخزينة: ${detailStr}`
        );
      }

      const updatedDenoms = { ...currentDenoms };
      for (const denom of EGP_DENOMINATIONS) {
        const outC = Number(notesGivenOut[denom]) || 0;
        const inC = Number(notesTakenIn[denom]) || 0;
        updatedDenoms[denom] = Math.max(0, (Number(updatedDenoms[denom]) || 0) - outC + inC);
      }

      tx.update(safeRef, {
        "balances.EGP.denominations": updatedDenoms,
        denominations: updatedDenoms,
        updatedAt: nowIso,
      });

      const voucherDoc = {
        id: voucherId,
        safeId,
        type: "change_exchange",
        typeAr: "فكة وتظبيط فئات",
        direction: "zero_sum",
        status: "posted",
        amount: outTotal,
        currency: "EGP",
        exchangeRate: 1,
        amountInEGP: outTotal,
        denominations: notesTakenIn,
        changeExchangeDetails: { notesGivenOut, notesTakenIn },
        mainAccount: "1020101",
        mainAccountAr: "فكة وتظبيط فئات نقدية",
        description: notes || "عملية فكة وتبديل فئات ورقية داخل الخزينة",
        issuedByUserId: actor.effectiveUserId,
        issuedByName: actor.effectiveUserName,
        approvedByUserId: actor.effectiveUserId,
        approvedByName: actor.effectiveUserName,
        balanceAfter: currWallet.currentBalance,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tx.set(db.collection("cash_transactions").doc(voucherId), voucherDoc);

      writeAuditLogInTx(tx, db, {
        action: "safe_change_exchange",
        module: "finance",
        collectionName: "cash_transactions",
        docId: voucherId,
        actor,
        summary: `Zero-sum change exchange ${voucherId} (${outTotal} EGP) on ${safeId}`,
        after: voucherDoc,
      });
    });

    return { success: true, voucherId };
  }
);

export const financeExecuteSafeCountAudit = onCall(
  { region: "me-central1", cors: true, maxInstances: 10 },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const safeId = String(data.safeId || "").trim();
    const countedDenominations = data.countedDenominations || {};
    const notes = String(data.notes || "");
    const accountingLinks = data.accountingLinks || null;

    if (!safeId) {
      throw new HttpsError("invalid-argument", "Safe ID is required.");
    }

    const countedTotal = calculateBanknoteTotal(countedDenominations);
    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = nowIso.slice(0, 10).replace(/-/g, "");
    const countSessionId = `COUNT-${safeId}-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    const db = getFirestore();
    const adjustmentVoucherId = await db.runTransaction(async (tx) => {
      const safeRef = db.collection("cash_safes").doc(safeId);
      const safeSnap = await tx.get(safeRef);
      if (!safeSnap.exists) {
        throw new HttpsError("not-found", "الخزينة غير موجودة");
      }

      const safeData = safeSnap.data();
      const currWallet = safeData.balances?.EGP || {
        currentBalance: 0,
        denominations: {},
      };
      const bookTotal = Number(currWallet.currentBalance) || 0;
      const variance = countedTotal - bookTotal;
      let adjId = null;

      if (Math.abs(variance) >= 0.01) {
        const isSurplus = variance > 0;
        const absVariance = Math.abs(variance);
        const discrepancyCode =
          accountingLinks?.cashDiscrepancyAccount?.primaryCode ||
          (isSurplus ? "4010204" : "3020209");
        const discrepancyName = isSurplus
          ? accountingLinks?.cashDiscrepancyAccount?.nameAr ||
            "أرباح وفروق تسوية جرد الخزينة (زيادة نقدية)"
          : accountingLinks?.cashDiscrepancyAccount?.nameAr ||
            "عجز وفروق تسوية جرد الخزينة (عجز نقدي)";

        adjId = `VCH-${safeId}-${dateStr}-ADJ-${Math.floor(1000 + Math.random() * 9000)}`;
        tx.set(db.collection("cash_transactions").doc(adjId), {
          id: adjId,
          safeId,
          type: "balance_adjustment",
          typeAr: isSurplus ? "تظبيط رصيد (زيادة خزينة)" : "تظبيط رصيد (عجز خزينة)",
          direction: isSurplus ? "in" : "out",
          status: "posted",
          amount: absVariance,
          currency: "EGP",
          exchangeRate: 1,
          amountInEGP: absVariance,
          denominations: countedDenominations,
          mainAccount: discrepancyCode,
          mainAccountAr: discrepancyName,
          description: `تسوية جرد فعلي (${isSurplus ? "زيادة" : "عجز"} بقيمة ${absVariance.toLocaleString()} ج.م): ${notes}`,
          issuedByUserId: actor.effectiveUserId,
          issuedByName: actor.effectiveUserName,
          approvedByUserId: actor.effectiveUserId,
          approvedByName: actor.effectiveUserName,
          balanceAfter: countedTotal,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      tx.update(
        safeRef,
        buildSafeUpdatePayload("EGP", countedTotal, countedDenominations, nowIso)
      );

      const sessionDoc = {
        id: countSessionId,
        safeId,
        auditDate: nowIso,
        auditorUserId: actor.effectiveUserId,
        auditorName: actor.effectiveUserName,
        countedAmount: countedTotal,
        bookAmount: bookTotal,
        variance,
        denominationsCount: countedDenominations,
        adjustmentTransactionId: adjId,
        notes:
          notes ||
          (variance === 0
            ? "جرد فعلي مطابق للدفاتر بالكامل"
            : `تم تسوية فارق قدره ${variance} ج.م`),
        status: variance === 0 ? "verified_balanced" : "adjusted_with_voucher",
        createdAt: nowIso,
      };
      tx.set(db.collection("cash_count_sessions").doc(countSessionId), sessionDoc);

      writeAuditLogInTx(tx, db, {
        action: "safe_count_audit",
        module: "finance",
        collectionName: "cash_count_sessions",
        docId: countSessionId,
        actor,
        summary: `Physical safe audit ${countSessionId} on ${safeId} (variance ${variance})`,
        before: { bookTotal },
        after: { countedTotal, variance, adjustmentVoucherId: adjId },
      });

      return adjId;
    });

    return {
      success: true,
      countSessionId,
      adjustmentVoucherId,
      countedTotal,
    };
  }
);
