import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  claimUserClaimsOnLogin,
  syncErpUserClaims,
  createEmployeeAuthAccount,
  prepareErpPasswordReset,
} from "./auth/userClaimsEngine.js";
import {
  getSmtpConfigStatus,
  saveSmtpConfig,
  sendTestSmtpEmail,
} from "./auth/brandedMailer.js";
import {
  financePostCashVoucher,
  financeApproveCashVoucher,
  financeRejectCashVoucher,
  financeReverseCashVoucher,
  financeUpdateCashVoucher,
  financeInitiateInterSafeTransfer,
  financeConfirmInterSafeTransfer,
  financeRejectInterSafeTransfer,
  financeExecuteChangeExchange,
  financeExecuteSafeCountAudit,
} from "./finance/cashSafesEngine.js";
import {
  financePostManualJournalEntry,
  financeReverseJournalEntry,
} from "./finance/journalEngine.js";
import {
  financeReleaseDuesBatchPayment,
  financeIssueWhtNote,
} from "./finance/duesSettlementEngine.js";

initializeApp();
const db = getFirestore();

export {
  claimUserClaimsOnLogin,
  syncErpUserClaims,
  createEmployeeAuthAccount,
  prepareErpPasswordReset,
  getSmtpConfigStatus,
  saveSmtpConfig,
  sendTestSmtpEmail,
  financePostCashVoucher,
  financeApproveCashVoucher,
  financeRejectCashVoucher,
  financeReverseCashVoucher,
  financeUpdateCashVoucher,
  financeInitiateInterSafeTransfer,
  financeConfirmInterSafeTransfer,
  financeRejectInterSafeTransfer,
  financeExecuteChangeExchange,
  financeExecuteSafeCountAudit,
  financePostManualJournalEntry,
  financeReverseJournalEntry,
  financeReleaseDuesBatchPayment,
  financeIssueWhtNote,
};

// Note: Firestore Eventarc triggers (onDocumentCreated / onDocumentWritten) require co-located
// deployment in me-central2 (restricted on standard credit-card Blaze accounts without CNTXT).
// Server-side mutations, claims sync, and audit logging run through me-central1 Callable (onCall)
// and Scheduled (onSchedule) functions; real-time alerts continue via OneSignal & live listeners.

// (Removed un-deployable Eventarc Firestore triggers onActionRequiredCreated / onSystemNotificationCreated)

// =========================================================================
// AUTOMATED SYSTEM RESTORE (24/7 SCHEDULED SNAPSHOT — READY FOR BLAZE PLAN)
// =========================================================================

const RESTORE_INTERNAL_SET = new Set([
  "system_restore_points",
  "system_restore_blobs",
  "system_restore_config",
  "system_restore_logs",
]);

const DEFAULT_CF_RESTORE_CONFIG = {
  enabled: true,
  intervalMinutes: 15,
  intraDayRetentionHours: 12,
  dailyRetentionDays: 14,
  keepSafetyPointsCount: 8,
};

function serializeDocValueCanonical(value) {
  if (value === null || value === undefined) return value;
  if (
    typeof value === "object" &&
    typeof value.toDate === "function" &&
    typeof value.seconds === "number"
  ) {
    return {
      _nanoseconds: Number(value.nanoseconds || 0),
      _seconds: value.seconds,
      _type: "firestore_timestamp",
    };
  }
  if (value instanceof Date) {
    return { _iso: value.toISOString(), _type: "date_iso" };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeDocValueCanonical(item));
  }
  if (typeof value === "object") {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((k) => {
        if (value[k] !== undefined) {
          sorted[k] = serializeDocValueCanonical(value[k]);
        }
      });
    return sorted;
  }
  return value;
}

function getCairoDateKey(ms = Date.now()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export const scheduledSystemRestoreSnapshot = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "me-central1",
    timeZone: "Africa/Cairo",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const localDateKey = getCairoDateKey(nowMs);

    const cfgRef = db.collection("system_restore_config").doc("scheduler");
    const cfgSnap = await cfgRef.get();
    const cfg = cfgSnap.exists
      ? { ...DEFAULT_CF_RESTORE_CONFIG, ...cfgSnap.data() }
      : { ...DEFAULT_CF_RESTORE_CONFIG };

    if (!cfg.enabled) {
      console.log("[SystemRestore CF] Scheduler disabled via config; skipping run.");
      return;
    }

    const kind = cfg.lastDailySnapshotDate !== localDateKey ? "daily" : "auto";
    const pointId = `RP-${localDateKey.replace(/-/g, "")}-${nowMs}-cf`;

    const allCollections = await db.listCollections();
    const targetColls = allCollections
      .map((c) => c.id)
      .filter((id) => !RESTORE_INTERNAL_SET.has(id))
      .sort((a, b) => a.localeCompare(b));

    const prevSnap = await db
      .collection("system_restore_points")
      .orderBy("createdAtMs", "desc")
      .limit(1)
      .get();
    const prevColls = prevSnap.empty ? {} : prevSnap.docs[0].data()?.collections || {};

    const collectionsMeta = {};
    let totalDocuments = 0;
    let totalRawBytes = 0;
    let totalCompressedBytes = 0;
    let blobsUploadedCount = 0;
    let collectionsReusedCount = 0;
    let totalReads = 2;

    const MAX_CHUNK_CHARS = 650000;

    for (const collName of targetColls) {
      const snap = await db.collection(collName).get();
      totalReads += Math.max(1, snap.size);

      const normalizedDocs = snap.docs
        .map((d) => ({
          _docId: d.id,
          ...serializeDocValueCanonical(d.data()),
        }))
        .sort((a, b) => String(a._docId).localeCompare(String(b._docId)));

      const json = JSON.stringify(normalizedDocs);
      const sha256 = createHash("sha256").update(json, "utf8").digest("hex");
      const docCount = normalizedDocs.length;
      totalDocuments += docCount;

      const prevMeta = prevColls[collName];
      if (prevMeta && prevMeta.sha256 === sha256 && Number(prevMeta.chunkCount || 1) >= 1) {
        collectionsMeta[collName] = {
          sha256,
          docCount,
          rawBytes: Number(prevMeta.rawBytes || Buffer.byteLength(json, "utf8")),
          compressedBytes: Number(prevMeta.compressedBytes || 0),
          chunkCount: Number(prevMeta.chunkCount || 1),
          encoding: prevMeta.encoding || "gzip+base64",
          reused: true,
        };
        totalRawBytes += collectionsMeta[collName].rawBytes;
        totalCompressedBytes += collectionsMeta[collName].compressedBytes;
        collectionsReusedCount += 1;
        continue;
      }

      const blobRef = db.collection("system_restore_blobs").doc(sha256);
      const existingBlob = await blobRef.get();
      totalReads += 1;

      if (existingBlob.exists) {
        const eb = existingBlob.data() || {};
        collectionsMeta[collName] = {
          sha256,
          docCount,
          rawBytes: Number(eb.rawBytes || Buffer.byteLength(json, "utf8")),
          compressedBytes: Number(eb.compressedBytes || 0),
          chunkCount: Number(eb.chunkCount || 1),
          encoding: eb.encoding || "gzip+base64",
          reused: true,
        };
        totalRawBytes += collectionsMeta[collName].rawBytes;
        totalCompressedBytes += collectionsMeta[collName].compressedBytes;
        collectionsReusedCount += 1;
        continue;
      }

      const rawBytes = Buffer.byteLength(json, "utf8");
      const gz = gzipSync(Buffer.from(json, "utf8"));
      const encoded = gz.toString("base64");
      const compressedBytes = gz.byteLength;
      const chunks = [];
      for (let i = 0; i < encoded.length; i += MAX_CHUNK_CHARS) {
        chunks.push(encoded.slice(i, i + MAX_CHUNK_CHARS));
      }
      if (chunks.length === 0) chunks.push("");

      const batch = db.batch();
      chunks.forEach((payloadChunk, idx) => {
        const docId = idx === 0 ? sha256 : `${sha256}__p${idx}`;
        const ref = db.collection("system_restore_blobs").doc(docId);
        batch.set(
          ref,
          idx === 0
            ? {
                sha256,
                collectionName: collName,
                encoding: "gzip+base64",
                chunkCount: chunks.length,
                chunkIndex: 0,
                payload: payloadChunk,
                rawBytes,
                compressedBytes,
                docCount,
                createdAt: nowIso,
                createdAtMs: nowMs,
              }
            : {
                sha256,
                parentHash: sha256,
                collectionName: collName,
                chunkIndex: idx,
                payload: payloadChunk,
                createdAt: nowIso,
                createdAtMs: nowMs,
              }
        );
      });
      await batch.commit();
      blobsUploadedCount += 1;

      collectionsMeta[collName] = {
        sha256,
        docCount,
        rawBytes,
        compressedBytes,
        chunkCount: chunks.length,
        encoding: "gzip+base64",
        reused: false,
      };
      totalRawBytes += rawBytes;
      totalCompressedBytes += compressedBytes;
    }

    await db
      .collection("system_restore_points")
      .doc(pointId)
      .set({
        id: pointId,
        kind,
        source: "cloud_function",
        pinned: false,
        labelAr:
          kind === "daily"
            ? `لقطة يومية سحابية (${localDateKey})`
            : `لقطة تلقائية سحابية (${localDateKey})`,
        labelEn:
          kind === "daily"
            ? `Cloud Daily Snapshot (${localDateKey})`
            : `Cloud Auto Checkpoint (${localDateKey})`,
        notes: "",
        localDateKey,
        createdAt: nowIso,
        createdAtMs: nowMs,
        createdBy: "cloud_scheduler",
        createdByName: "Cloud Scheduler (24/7)",
        collectionCount: Object.keys(collectionsMeta).length,
        totalDocuments,
        totalRawBytes,
        totalCompressedBytes,
        blobsUploadedCount,
        collectionsReusedCount,
        firestoreReadsUsed: totalReads,
        collections: collectionsMeta,
      });

    const sameDay = cfg.dailyReadCounterDate === localDateKey;
    const cfgPatch = {
      dailyReadCounterDate: localDateKey,
      dailyReadsUsed: (sameDay ? Number(cfg.dailyReadsUsed || 0) : 0) + totalReads,
      lastSnapshotAt: nowIso,
      lastSnapshotId: pointId,
      lastAutoSnapshotAt: nowIso,
      lastAutoSnapshotAtMs: nowMs,
      lastAutoSnapshotId: pointId,
    };
    if (kind === "daily") {
      cfgPatch.lastDailySnapshotDate = localDateKey;
    }
    await cfgRef.set(cfgPatch, { merge: true });

    // Retention pruning (12h intra-day / 14d daily anchors / pinned & manual / 8 safety)
    const allPtsSnap = await db.collection("system_restore_points").get();
    const allPts = allPtsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));

    const intraMs = Math.max(1, Number(cfg.intraDayRetentionHours || 12)) * 3600 * 1000;
    const dailyMs = Math.max(1, Number(cfg.dailyRetentionDays || 14)) * 86400 * 1000;
    const maxSafety = Math.max(2, Number(cfg.keepSafetyPointsCount || 8));

    const keepIds = new Set();
    let safetyCount = 0;
    const dailyAnchor = new Map();

    allPts.forEach((p) => {
      if (p.pinned || p.kind === "manual") keepIds.add(p.id);
      if (p.kind === "pre_restore" || p.kind === "pre_purge") {
        if (safetyCount < maxSafety || nowMs - Number(p.createdAtMs || 0) <= dailyMs) {
          keepIds.add(p.id);
          safetyCount += 1;
        }
      }
      if (p.kind === "auto" && nowMs - Number(p.createdAtMs || 0) <= intraMs) {
        keepIds.add(p.id);
      }
      if (p.kind === "daily" && nowMs - Number(p.createdAtMs || 0) <= dailyMs) {
        const dk = p.localDateKey || getCairoDateKey(p.createdAtMs);
        if (!dailyAnchor.has(dk)) dailyAnchor.set(dk, p.id);
      }
    });
    allPts.forEach((p) => {
      if (p.kind === "auto" && nowMs - Number(p.createdAtMs || 0) <= dailyMs) {
        const dk = p.localDateKey || getCairoDateKey(p.createdAtMs);
        if (!dailyAnchor.has(dk)) dailyAnchor.set(dk, p.id);
      }
    });
    dailyAnchor.forEach((pid) => keepIds.add(pid));

    const expiredPts = allPts.filter((p) => !keepIds.has(p.id));
    if (expiredPts.length > 0) {
      const survivingHashes = new Set();
      allPts
        .filter((p) => keepIds.has(p.id))
        .forEach((p) => {
          Object.values(p.collections || {}).forEach((m) => {
            if (m?.sha256) survivingHashes.add(m.sha256);
          });
        });

      const orphanBlobs = new Map();
      expiredPts.forEach((p) => {
        Object.values(p.collections || {}).forEach((m) => {
          if (m?.sha256 && !survivingHashes.has(m.sha256)) {
            orphanBlobs.set(m.sha256, Math.max(1, Number(m.chunkCount || 1)));
          }
        });
      });

      const delOps = [];
      expiredPts.forEach((p) => delOps.push((b) => b.delete(db.collection("system_restore_points").doc(p.id))));
      orphanBlobs.forEach((chunksCnt, hash) => {
        delOps.push((b) => b.delete(db.collection("system_restore_blobs").doc(hash)));
        for (let i = 1; i < chunksCnt; i += 1) {
          delOps.push((b) => b.delete(db.collection("system_restore_blobs").doc(`${hash}__p${i}`)));
        }
      });

      for (let i = 0; i < delOps.length; i += 400) {
        const b = db.batch();
        delOps.slice(i, i + 400).forEach((fn) => fn(b));
        await b.commit();
      }
    }

    console.log(
      `[SystemRestore CF] Snapshot ${pointId} (${kind}): ${totalDocuments} docs, ${collectionsReusedCount} reused, ${blobsUploadedCount} uploaded.`
    );
  }
);
