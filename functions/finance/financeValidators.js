/**
 * Pure Finance Validators, Banknote Breakdown Checks, Journal Balancing,
 * Anti-Overpayment Rules & Transactional Custody/Advance Ledger Updater.
 */

export const EGP_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1, 0.5];

export const CASH_TRANSACTION_TYPES = [
  { id: "disbursement", labelAr: "صرف نقدية", labelEn: "Disbursement", direction: "out", defaultAccount: "3010207" },
  { id: "collection", labelAr: "تحصيل نقدية", labelEn: "Collection", direction: "in", defaultAccount: "1020301" },
  { id: "custody_issue", labelAr: "صرف عهدة", labelEn: "Issue Custody", direction: "out", defaultAccount: "1020401" },
  { id: "custody_settle", labelAr: "رد / تسوية عهدة", labelEn: "Settle Custody", direction: "in", defaultAccount: "1020401" },
  { id: "salary_advance", labelAr: "صرف سلفة", labelEn: "Issue Advance", direction: "out", defaultAccount: "1020401" },
  { id: "advance_settle", labelAr: "رد سلفة", labelEn: "Settle Advance", direction: "in", defaultAccount: "1020401" },
  { id: "change_exchange", labelAr: "فكة وتظبيط فئات", labelEn: "Change Exchange", direction: "zero_sum", defaultAccount: "1020101" },
  { id: "balance_adjustment", labelAr: "تظبيط رصيد (عجز/زيادة)", labelEn: "Balance Adjustment", direction: "variable", defaultAccount: "4010204" },
  { id: "safe_transfer", labelAr: "تحويل بين الخزن", labelEn: "Inter-Safe Transfer", direction: "out", defaultAccount: "1020101" },
];

export const CORPORATE_BANK_ACCOUNTS = [
  { id: "BANK-CIB-01", bankNameAr: "البنك التجاري الدولي (CIB)", bankNameEn: "Commercial International Bank (CIB)", accountNumber: "100045889211", currency: "EGP", isBank: true },
  { id: "BANK-QNB-01", bankNameAr: "بنك قطر الوطني (QNB الأهلي)", bankNameEn: "Qatar National Bank (QNB)", accountNumber: "203388741002", currency: "EGP", isBank: true },
  { id: "BANK-NBE-01", bankNameAr: "البنك الأهلي المصري (NBE)", bankNameEn: "National Bank of Egypt (NBE)", accountNumber: "010584729100", currency: "EGP", isBank: true },
];

export function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

export function calculateBanknoteTotal(denominations = {}) {
  return EGP_DENOMINATIONS.reduce((sum, denom) => {
    const count = Number(denominations?.[denom]) || 0;
    return sum + denom * count;
  }, 0);
}

export function validateBanknoteMatch(amount, denominations = {}) {
  const bankTotal = calculateBanknoteTotal(denominations);
  return Math.abs(bankTotal - Number(amount)) < 0.005;
}

export function checkSufficientBanknotes(
  safeDenominations = {},
  requestedDenominations = {},
  isOutflow = true
) {
  const shortages = [];
  for (const denom of EGP_DENOMINATIONS) {
    const available = Number(safeDenominations?.[denom]) || 0;
    const requested = Number(requestedDenominations?.[denom]) || 0;
    const neededFromSafe = isOutflow ? Math.max(0, requested) : Math.max(0, -requested);
    if (neededFromSafe > available) {
      shortages.push({
        denom,
        requested: neededFromSafe,
        available,
        shortage: neededFromSafe - available,
      });
    }
  }
  return {
    isSufficient: shortages.length === 0,
    shortages,
  };
}

export function normalizeAccountAttributesServer(rawAcc = {}) {
  const code = String(rawAcc.code || rawAcc.id || "").trim();
  const rootDigit = code.charAt(0);
  const defaultNature =
    rootDigit === "1" || rootDigit === "3" ? "debit" : "credit";
  const defaultStatement =
    rootDigit === "3" || rootDigit === "4"
      ? "income_statement"
      : "balance_sheet";

  return {
    statement: rawAcc.statement || defaultStatement,
    reportCategory: rawAcc.reportCategory || "",
    cashFlowCategory: rawAcc.cashFlowCategory || "operating",
    nature: rawAcc.nature || defaultNature,
  };
}

export function assertBalancedJournalEntryServer(entry = {}) {
  const lines = Array.isArray(entry.lines) ? entry.lines : [];
  if (lines.length === 0) {
    throw new Error("Journal Entry must contain at least one posting line.");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    const d = Number(l.debit) || 0;
    const c = Number(l.credit) || 0;
    if (d < 0 || c < 0) {
      throw new Error("Journal line debit and credit amounts cannot be negative.");
    }
    if ((d > 0 || c > 0) && !String(l.accountCode || "").trim()) {
      throw new Error("Every active journal line must reference an accountCode.");
    }
    totalDebit += d;
    totalCredit += c;
  }

  const roundedDebit = round2(totalDebit);
  const roundedCredit = round2(totalCredit);
  if (roundedDebit <= 0) {
    throw new Error("Journal Entry total amount must be greater than zero.");
  }
  if (Math.abs(roundedDebit - roundedCredit) >= 0.01) {
    throw new Error(
      `Unbalanced Journal Entry: Debit (${roundedDebit}) != Credit (${roundedCredit}).`
    );
  }

  return { totalDebit: roundedDebit, totalCredit: roundedCredit };
}

export function assertValidDuesReleaseServer({ remainingAmount, releaseAmount, docType = "" }) {
  const rem = round2(remainingAmount);
  const rel = round2(releaseAmount);
  if (!Number.isFinite(rel) || rel <= 0) {
    throw new Error(`Invalid dues release amount (${releaseAmount}); must be > 0.`);
  }
  if (docType !== "return" && rel > rem + 0.01) {
    throw new Error(
      `Overpayment prevented: release (${rel}) exceeds live remaining due (${rem}).`
    );
  }
  return rel;
}

/**
 * Computes and stages atomic custody/advance ledger updates inside an active runTransaction.
 * Reads `custodySnap` and `ssotSnap` from the transaction read phase so writes execute atomically.
 */
export function applyCustodyLedgerUpdateInTx(
  tx,
  db,
  {
    custodySnap,
    custodyRef,
    ssotRef = null,
    workerId,
    workerName,
    voucherId,
    ssotId = null,
    targetCustodyId = null,
    targetAdvanceId = null,
    type,
    amount,
    description = "",
    safeId = "",
    attachments = [],
    nowIso,
  }
) {
  const finalId = ssotId || voucherId;
  const now = nowIso || new Date().toISOString();

  let currentCustody = 0;
  let currentAdvance = 0;
  let activeCustodies = {};
  let activeAdvances = {};
  let history = [];

  if (custodySnap?.exists) {
    const data = custodySnap.data() || {};
    currentCustody = Number(data.currentCustodyBalance) || 0;
    currentAdvance = Number(data.currentAdvanceBalance) || 0;
    activeCustodies = { ...(data.activeCustodies || {}) };
    activeAdvances = { ...(data.activeAdvances || {}) };
    history = Array.isArray(data.history) ? [...data.history] : [];
  }

  if (type === "custody_issue") {
    currentCustody += amount;
    const itemData = {
      id: finalId,
      type: "custody_issue",
      workerId,
      workerName,
      originalAmount: amount,
      settledAmount: 0,
      remainingAmount: amount,
      status: "active",
      sourceSafeId: safeId || "",
      issuedAt: now,
      notes: description || "",
      attachments: attachments || [],
      settlements: [],
    };
    activeCustodies[finalId] = itemData;
    if (ssotRef) tx.set(ssotRef, itemData, { merge: true });
  }

  if (type === "custody_settle") {
    currentCustody = Math.max(0, currentCustody - amount);
    if (targetCustodyId) {
      if (!activeCustodies[targetCustodyId]) {
        activeCustodies[targetCustodyId] = {
          id: targetCustodyId,
          type: "custody_issue",
          workerId,
          workerName,
          originalAmount: currentCustody + amount,
          settledAmount: 0,
          remainingAmount: currentCustody + amount,
          status: "active",
          sourceSafeId: safeId || "",
          issuedAt: now,
          notes: "Legacy open custody",
          attachments: [],
          settlements: [],
        };
      }
      const c = { ...activeCustodies[targetCustodyId] };
      c.settledAmount = (Number(c.settledAmount) || 0) + amount;
      c.remainingAmount = Math.max(0, (Number(c.originalAmount) || 0) - c.settledAmount);
      c.status = c.remainingAmount <= 0.01 ? "settled" : "partially_settled";
      c.settlements = [...(c.settlements || []), {
        settlementId: finalId,
        date: now,
        amount,
        type,
        notes: description || "",
        items: [],
        attachments: attachments || [],
      }];
      activeCustodies[targetCustodyId] = c;
      if (ssotRef) tx.set(ssotRef, c, { merge: true });
    }
  }

  if (type === "salary_advance") {
    currentAdvance += amount;
    const itemData = {
      id: finalId,
      type: "salary_advance",
      workerId,
      workerName,
      originalAmount: amount,
      settledAmount: 0,
      remainingAmount: amount,
      status: "active",
      sourceSafeId: safeId || "",
      issuedAt: now,
      notes: description || "",
      settlementMethod: null,
      payrollMonth: null,
      installments: [],
      attachments: attachments || [],
      settlements: [],
    };
    activeAdvances[finalId] = itemData;
    if (ssotRef) tx.set(ssotRef, itemData, { merge: true });
  }

  if (type === "advance_settle") {
    currentAdvance = Math.max(0, currentAdvance - amount);
    if (targetAdvanceId) {
      if (!activeAdvances[targetAdvanceId]) {
        activeAdvances[targetAdvanceId] = {
          id: targetAdvanceId,
          type: "salary_advance",
          workerId,
          workerName,
          originalAmount: currentAdvance + amount,
          settledAmount: 0,
          remainingAmount: currentAdvance + amount,
          status: "active",
          sourceSafeId: safeId || "",
          issuedAt: now,
          notes: "Legacy open advance",
          settlementMethod: null,
          payrollMonth: null,
          installments: [],
          attachments: [],
          settlements: [],
        };
      }
      const a = { ...activeAdvances[targetAdvanceId] };
      a.settledAmount = (Number(a.settledAmount) || 0) + amount;
      a.remainingAmount = Math.max(0, (Number(a.originalAmount) || 0) - a.settledAmount);
      a.status = a.remainingAmount <= 0.01 ? "settled" : "partially_settled";
      a.settlements = [...(a.settlements || []), {
        settlementId: finalId,
        date: now,
        amount,
        type,
        payrollMonth: null,
        notes: description || "",
        attachments: attachments || [],
      }];
      activeAdvances[targetAdvanceId] = a;
      if (ssotRef) tx.set(ssotRef, a, { merge: true });
    }
  }

  history.unshift({
    voucherId: finalId,
    ssotId: finalId,
    targetCustodyId,
    targetAdvanceId,
    date: now,
    type,
    amount,
    payrollMonth: null,
    installmentCount: 0,
    items: [],
    attachments: attachments || [],
    custodyBalanceAfter: currentCustody,
    advanceBalanceAfter: currentAdvance,
    notes: description || "",
  });

  if (history.length > 60) history = history.slice(0, 60);

  tx.set(
    custodyRef,
    {
      workerId,
      workerName,
      currentCustodyBalance: currentCustody,
      currentAdvanceBalance: currentAdvance,
      activeCustodies,
      activeAdvances,
      history,
      updatedAt: now,
    },
    { merge: true }
  );
}
