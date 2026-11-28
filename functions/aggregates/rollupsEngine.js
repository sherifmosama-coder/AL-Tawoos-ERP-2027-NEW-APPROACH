/**
 * Phase 4 Materialized Balance Rollups Engine (`functions/aggregates/`)
 * ----------------------------------------------------------------------
 * Maintains compact rollup documents in `aggregates/` (`me-central1`):
 *  - `aggregates/treasury_live`: Cash Safes live EGP balances
 *  - `aggregates/raw_stock_balances`: Item Master raw stock summary
 *  - `aggregates/fg_balances_live`: Finished Goods floor & warehouse summary
 *  - `aggregates/trial_balance_YYYY_MM`: Monthly posted JE totals
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertErpCaller, resolveActorIdentity } from "../shared/serverAuthAndAudit.js";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function computeTreasuryRollup(db, nowIso = new Date().toISOString()) {
  const safesSnap = await db.collection("cash_safes").get();
  let totalEgpBalance = 0;
  const bySafe = {};
  let safeCount = 0;

  safesSnap.forEach((d) => {
    const data = d.data() || {};
    if (data.isDeleted) return;
    safeCount += 1;
    const egpBal = Number(data.balances?.EGP?.currentBalance ?? data.currentBalance ?? data.balance ?? 0) || 0;
    totalEgpBalance = round2(totalEgpBalance + egpBal);
    bySafe[d.id] = {
      id: d.id,
      nameAr: data.nameAr || d.id,
      egpBalance: round2(egpBal),
    };
  });

  const payload = {
    id: "treasury_live",
    safeCount,
    totalEgpBalance: round2(totalEgpBalance),
    bySafe,
    updatedAt: nowIso,
    updatedAtServer: FieldValue.serverTimestamp(),
  };
  await db.collection("aggregates").doc("treasury_live").set(payload);
  return payload;
}

export async function computeRawStockRollup(db, nowIso = new Date().toISOString()) {
  const itemsSnap = await db.collection("items").get();
  let itemCount = 0;
  let totalUnits = 0;
  let lowStockCount = 0;
  const byCategory = {};

  itemsSnap.forEach((d) => {
    const item = d.data() || {};
    if (item.isDeleted) return;
    itemCount += 1;
    const stock = Number(item.stock || 0) || 0;
    const minLevel = Number(item.minStockLevel || item.reorderPoint || 0) || 0;
    totalUnits = round2(totalUnits + stock);
    if (minLevel > 0 && stock <= minLevel) lowStockCount += 1;
    const cat = String(item.category || "uncategorized");
    byCategory[cat] = round2((byCategory[cat] || 0) + stock);
  });

  const payload = {
    id: "raw_stock_balances",
    itemCount,
    totalUnits,
    lowStockCount,
    byCategory,
    updatedAt: nowIso,
    updatedAtServer: FieldValue.serverTimestamp(),
  };
  await db.collection("aggregates").doc("raw_stock_balances").set(payload);
  return payload;
}

export async function computeFgBalancesRollup(db, nowIso = new Date().toISOString()) {
  const [productsSnap, palletsSnap] = await Promise.all([
    db.collection("finished_products").get(),
    db.collection("staged_floor_pallets").get(),
  ]);

  let skuCount = 0;
  productsSnap.forEach((d) => {
    const prod = d.data() || {};
    if (!prod.isDeleted) skuCount += 1;
  });

  let totalCartonsOnFloor = 0;
  let totalAcceptedCartons = 0;
  palletsSnap.forEach((d) => {
    const p = d.data() || {};
    if (p.isDeleted || p.isReversed || p.status === "reversed") return;
    const qty = Number(p.qtyLarge || 0) || 0;
    const status = String(p.stagingStatus || p.status || "");
    if (status === "staged_on_floor") {
      totalCartonsOnFloor = round2(totalCartonsOnFloor + qty);
    } else if (status === "transferred_to_fg" || status === "accepted_in_fg") {
      totalAcceptedCartons = round2(totalAcceptedCartons + qty);
    }
  });

  const payload = {
    id: "fg_balances_live",
    skuCount,
    totalCartonsOnFloor,
    totalAcceptedCartons,
    updatedAt: nowIso,
    updatedAtServer: FieldValue.serverTimestamp(),
  };
  await db.collection("aggregates").doc("fg_balances_live").set(payload);
  return payload;
}

export async function computeMonthlyTrialBalanceRollup(
  db,
  monthKey = new Date().toISOString().slice(0, 7),
  nowIso = new Date().toISOString()
) {
  const normalizedMonth = /^\d{4}-\d{2}$/.test(monthKey)
    ? monthKey
    : new Date().toISOString().slice(0, 7);
  const docId = `trial_balance_${normalizedMonth.replace("-", "_")}`;
  const jeSnap = await db.collection("journal_entries").get();

  let entryCount = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  jeSnap.forEach((d) => {
    const je = d.data() || {};
    if (je.isDeleted || je.status === "reversed" || je.isReversed) return;
    const entryDate = String(je.entryDate || je.fiscalPeriod || "");
    if (!entryDate.startsWith(normalizedMonth)) return;
    entryCount += 1;
    totalDebit = round2(totalDebit + (Number(je.totalDebit) || 0));
    totalCredit = round2(totalCredit + (Number(je.totalCredit) || 0));
  });

  const payload = {
    id: docId,
    fiscalPeriod: normalizedMonth,
    entryCount,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) <= 0.01,
    updatedAt: nowIso,
    updatedAtServer: FieldValue.serverTimestamp(),
  };
  await db.collection("aggregates").doc(docId).set(payload);
  return payload;
}

export async function rebuildAllRollups(db, monthKey) {
  const nowIso = new Date().toISOString();
  const [treasury, rawStock, fgBalances, trialBalance] = await Promise.all([
    computeTreasuryRollup(db, nowIso),
    computeRawStockRollup(db, nowIso),
    computeFgBalancesRollup(db, nowIso),
    computeMonthlyTrialBalanceRollup(db, monthKey, nowIso),
  ]);
  return {
    treasury,
    rawStock,
    fgBalances,
    trialBalance,
    summary: {
      safesCount: treasury.safeCount,
      rawItemsCount: rawStock.itemCount,
      fgProductsCount: fgBalances.skuCount,
      journalEntriesCount: trialBalance.entryCount,
    },
  };
}

export const aggregatesRebuildAll = onCall(
  { region: "me-central1", cors: true, maxInstances: 5, memory: "256MiB" },
  async (request) => {
    const caller = assertErpCaller(request);
    const data = request.data || {};
    const actor = resolveActorIdentity(caller, data.currentUser);
    const db = getFirestore();
    const res = await rebuildAllRollups(db, data.monthKey);

    await db.collection("audit_logs").add({
      action: "rebuild_aggregates_rollups",
      module: "system",
      collection: "aggregates",
      docId: "all",
      summary: `Rebuilt materialized rollups (Safes=${res.summary.safesCount}, Raw=${res.summary.rawItemsCount}, FG=${res.summary.fgProductsCount}, JE=${res.summary.journalEntriesCount})`,
      actorUid: actor.authUid,
      actorErpUserId: actor.realErpUserId,
      actorEmail: actor.authEmail,
      effectiveUserId: actor.effectiveUserId,
      effectiveUserName: actor.effectiveUserName,
      actedAsPersona: actor.actedAsPersona || null,
      after: res.summary,
      timestamp: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true, summary: res.summary };
  }
);

export const scheduledAggregatesRollup = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "Africa/Cairo",
    region: "me-central1",
    memory: "256MiB",
    maxInstances: 1,
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    await rebuildAllRollups(db);
  }
);
