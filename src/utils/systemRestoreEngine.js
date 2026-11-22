/**
 * Automated System Restore (Time Machine) — Firestore Snapshot, Diff Preview,
 * Safe Pre-Restore Guard, Post-Restore Recalculation & Auto-Scheduler Engine.
 */

import { db } from '../firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { APP_ARCHITECTURE } from '../config/appArchitecture.js';
import {
  DEFAULT_RESTORE_CONFIG,
  RESTORE_INTERNAL_COLLECTIONS,
  getAllSystemRestoreCollections,
  canonicalizeCollectionDocs,
  compressJsonToEncodedPayload,
  decompressEncodedPayloadToJson,
  computeSha256Hex,
  splitPayloadIntoChunks,
  joinPayloadChunks,
  hydrateRestoreValue,
  resolveRestoreScopePlan,
  computeRestoreDiffPlan,
  computeRetentionPruningPlan,
  formatLocalDateKey,
} from './systemRestoreScopeCatalog.js';

const SCHEDULER_DOC_REF = () => doc(db, 'system_restore_config', 'scheduler');
const POINTS_COLL_REF = () => collection(db, 'system_restore_points');
const BLOBS_COLL_NAME = 'system_restore_blobs';
const LOGS_COLL_REF = () => collection(db, 'system_restore_logs');

const WRITE_CHUNK_SIZE = 400;

async function commitChunkedOps(opFns = []) {
  if (!opFns.length) return 0;
  for (let i = 0; i < opFns.length; i += WRITE_CHUNK_SIZE) {
    const slice = opFns.slice(i, i + WRITE_CHUNK_SIZE);
    const batch = writeBatch(db);
    slice.forEach((fn) => fn(batch));
    await batch.commit();
  }
  return opFns.length;
}

function getActorMeta(actor = {}) {
  const actorId = actor?.id || actor?.uid || 'system';
  const actorName = actor?.nameAr || actor?.name || actor?.email || actorId;
  return { actorId, actorName };
}

function assertGeneralAdmin(actor = {}) {
  if (!actor || (!actor.isGeneralAdmin && actor.role !== 'general_admin')) {
    throw new Error('Only the General Admin is authorized to execute System Restore operations.');
  }
}

// =========================================================================
// CONFIG & LIVE SUBSCRIPTIONS
// =========================================================================

export async function getRestoreSchedulerConfig() {
  const snap = await getDoc(SCHEDULER_DOC_REF());
  return snap.exists()
    ? { ...DEFAULT_RESTORE_CONFIG, ...snap.data() }
    : { ...DEFAULT_RESTORE_CONFIG };
}

export async function saveRestoreSchedulerConfig(partial = {}, actor = {}) {
  const { actorId, actorName } = getActorMeta(actor);
  const current = await getRestoreSchedulerConfig();
  const next = {
    ...current,
    ...partial,
    intervalMinutes: Math.max(5, Number(partial.intervalMinutes ?? current.intervalMinutes ?? 15)),
    intraDayRetentionHours: Math.max(1, Number(partial.intraDayRetentionHours ?? current.intraDayRetentionHours ?? 12)),
    dailyRetentionDays: Math.max(1, Number(partial.dailyRetentionDays ?? current.dailyRetentionDays ?? 14)),
    maxDailyReadBudget: Math.max(1000, Number(partial.maxDailyReadBudget ?? current.maxDailyReadBudget ?? 35000)),
    keepSafetyPointsCount: Math.max(2, Number(partial.keepSafetyPointsCount ?? current.keepSafetyPointsCount ?? 8)),
    updatedAt: serverTimestamp(),
    updatedBy: actorId,
    updatedByName: actorName,
  };
  await setDoc(SCHEDULER_DOC_REF(), next, { merge: true });
  return next;
}

export function subscribeRestoreSchedulerConfig(callback) {
  return onSnapshot(
    SCHEDULER_DOC_REF(),
    (snap) => {
      callback(
        snap.exists()
          ? { ...DEFAULT_RESTORE_CONFIG, ...snap.data() }
          : { ...DEFAULT_RESTORE_CONFIG }
      );
    },
    (err) => {
      console.warn('Restore config listener warning:', err.message);
      callback({ ...DEFAULT_RESTORE_CONFIG });
    }
  );
}

export function subscribeRestorePoints(callback) {
  const q = query(POINTS_COLL_REF(), orderBy('createdAtMs', 'desc'), limit(250));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
      callback(list);
    },
    async () => {
      // Fallback without index if composite/orderBy isn't ready
      try {
        const snap = await getDocs(POINTS_COLL_REF());
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
        callback(list);
      } catch (e) {
        console.warn('Restore points listener warning:', e.message);
        callback([]);
      }
    }
  );
}

export function subscribeRestoreLogs(callback) {
  const q = query(LOGS_COLL_REF(), orderBy('executedAtMs', 'desc'), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => Number(b.executedAtMs || 0) - Number(a.executedAtMs || 0));
      callback(list);
    },
    () => callback([])
  );
}

// =========================================================================
// SNAPSHOT CREATION (DEDUPLICATED CHUNKED GZIP+BASE64 BLOBS)
// =========================================================================

async function fetchLatestPointManifest() {
  try {
    const q = query(POINTS_COLL_REF(), orderBy('createdAtMs', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch {
    // Fallback
  }
  const snap = await getDocs(POINTS_COLL_REF());
  if (snap.empty) return null;
  const sorted = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  return sorted[0] || null;
}

export async function createRestorePoint({
  kind = 'manual', // 'auto' | 'daily' | 'manual' | 'pre_restore' | 'pre_purge'
  source = 'manual_admin',
  labelAr = '',
  labelEn = '',
  notes = '',
  pinned = false,
  actor = {},
  onProgress = null,
} = {}) {
  const { actorId, actorName } = getActorMeta(actor);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const localDateKey = formatLocalDateKey(nowMs);
  const pointId = `RP-${localDateKey.replace(/-/g, '')}-${nowMs}-${Math.random().toString(36).slice(2, 6)}`;

  const targetCollections = getAllSystemRestoreCollections(APP_ARCHITECTURE);
  const latestPrevPoint = await fetchLatestPointManifest();
  const prevCollsMeta = latestPrevPoint?.collections || {};

  const collectionsMeta = {};
  let totalDocuments = 0;
  let totalRawBytes = 0;
  let totalCompressedBytes = 0;
  let totalReads = 1; // Previous point lookup
  let blobsUploadedCount = 0;
  let collectionsReusedCount = 0;

  // Process collections in batches of 6 to stay fast without flooding connections
  const CONCURRENCY = 6;
  for (let idx = 0; idx < targetCollections.length; idx += CONCURRENCY) {
    const slice = targetCollections.slice(idx, idx + CONCURRENCY);
    if (typeof onProgress === 'function') {
      onProgress({
        stage: 'capturing',
        completed: idx,
        total: targetCollections.length,
        currentCollection: slice[0],
      });
    }

    await Promise.all(
      slice.map(async (collName) => {
        const snap = await getDocs(collection(db, collName));
        totalReads += Math.max(1, snap.size);

        const rawDocs = snap.docs.map((docSnap) => ({
          _docId: docSnap.id,
          ...docSnap.data(),
        }));

        const { json } = canonicalizeCollectionDocs(rawDocs);
        const sha256 = await computeSha256Hex(json);
        const docCount = rawDocs.length;
        totalDocuments += docCount;

        const prevMeta = prevCollsMeta[collName];
        if (prevMeta && prevMeta.sha256 === sha256 && Number(prevMeta.chunkCount || 1) >= 1) {
          collectionsMeta[collName] = {
            sha256,
            docCount,
            rawBytes: Number(prevMeta.rawBytes || json.length),
            compressedBytes: Number(prevMeta.compressedBytes || 0),
            chunkCount: Number(prevMeta.chunkCount || 1),
            encoding: prevMeta.encoding || 'gzip+base64',
            reused: true,
          };
          totalRawBytes += collectionsMeta[collName].rawBytes;
          totalCompressedBytes += collectionsMeta[collName].compressedBytes;
          collectionsReusedCount += 1;
          return;
        }

        // Hash changed since previous snapshot: check if blob already exists from an earlier point
        const rootBlobRef = doc(db, BLOBS_COLL_NAME, sha256);
        const existingBlob = await getDoc(rootBlobRef);
        totalReads += 1;

        if (existingBlob.exists()) {
          const eb = existingBlob.data() || {};
          collectionsMeta[collName] = {
            sha256,
            docCount,
            rawBytes: Number(eb.rawBytes || json.length),
            compressedBytes: Number(eb.compressedBytes || 0),
            chunkCount: Number(eb.chunkCount || 1),
            encoding: eb.encoding || 'gzip+base64',
            reused: true,
          };
          totalRawBytes += collectionsMeta[collName].rawBytes;
          totalCompressedBytes += collectionsMeta[collName].compressedBytes;
          collectionsReusedCount += 1;
          return;
        }

        // Compress and store new content-addressed blob (split into safe <650KB chunks if large)
        const { encoded, encoding, rawBytes, compressedBytes } = await compressJsonToEncodedPayload(json);
        const chunks = splitPayloadIntoChunks(encoded);

        const blobWriteOps = chunks.map((chunkPayload, chunkIdx) => {
          const chunkId = chunkIdx === 0 ? sha256 : `${sha256}__p${chunkIdx}`;
          const chunkRef = doc(db, BLOBS_COLL_NAME, chunkId);
          const payloadDoc =
            chunkIdx === 0
              ? {
                  sha256,
                  collectionName: collName,
                  encoding,
                  chunkCount: chunks.length,
                  chunkIndex: 0,
                  payload: chunkPayload,
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
                  chunkIndex: chunkIdx,
                  payload: chunkPayload,
                  createdAt: nowIso,
                  createdAtMs: nowMs,
                };
          return (batch) => batch.set(chunkRef, payloadDoc);
        });

        await commitChunkedOps(blobWriteOps);
        blobsUploadedCount += 1;

        collectionsMeta[collName] = {
          sha256,
          docCount,
          rawBytes,
          compressedBytes,
          chunkCount: chunks.length,
          encoding,
          reused: false,
        };
        totalRawBytes += rawBytes;
        totalCompressedBytes += compressedBytes;
      })
    );
  }

  const defaultLabels = {
    auto: {
      ar: `نقطة استعادة تلقائية (${new Date(nowMs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})`,
      en: `Auto Checkpoint (${new Date(nowMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`,
    },
    daily: {
      ar: `لقطة يومية شاملة (${localDateKey})`,
      en: `Daily Snapshot (${localDateKey})`,
    },
    manual: {
      ar: `نقطة يدوية محفوظة (${localDateKey})`,
      en: `Manual Checkpoint (${localDateKey})`,
    },
    pre_restore: {
      ar: 'نقطة أمان تلقائية قبل الاستعادة',
      en: 'Auto Pre-Restore Safety Point',
    },
    pre_purge: {
      ar: 'نقطة أمان تلقائية قبل التصفير',
      en: 'Auto Pre-Purge Safety Point',
    },
  };

  const manifest = {
    id: pointId,
    kind,
    source,
    pinned: Boolean(pinned),
    labelAr: (labelAr || '').trim() || defaultLabels[kind]?.ar || defaultLabels.manual.ar,
    labelEn: (labelEn || '').trim() || defaultLabels[kind]?.en || defaultLabels.manual.en,
    notes: (notes || '').trim(),
    localDateKey,
    createdAt: nowIso,
    createdAtMs: nowMs,
    createdBy: actorId,
    createdByName: actorName,
    collectionCount: Object.keys(collectionsMeta).length,
    totalDocuments,
    totalRawBytes,
    totalCompressedBytes,
    blobsUploadedCount,
    collectionsReusedCount,
    firestoreReadsUsed: totalReads,
    collections: collectionsMeta,
  };

  await setDoc(doc(db, 'system_restore_points', pointId), manifest);

  // Update scheduler telemetry & read budget counter
  try {
    const cfg = await getRestoreSchedulerConfig();
    const sameDay = cfg.dailyReadCounterDate === localDateKey;
    const nextReads = (sameDay ? Number(cfg.dailyReadsUsed || 0) : 0) + totalReads;
    const cfgPatch = {
      dailyReadCounterDate: localDateKey,
      dailyReadsUsed: nextReads,
      lastSnapshotAt: nowIso,
      lastSnapshotId: pointId,
    };
    if (kind === 'auto' || kind === 'daily') {
      cfgPatch.lastAutoSnapshotAt = nowIso;
      cfgPatch.lastAutoSnapshotAtMs = nowMs;
      cfgPatch.lastAutoSnapshotId = pointId;
    }
    if (kind === 'daily' || !cfg.lastDailySnapshotDate) {
      cfgPatch.lastDailySnapshotDate = localDateKey;
    }
    await setDoc(SCHEDULER_DOC_REF(), cfgPatch, { merge: true });

    if (kind === 'auto' || kind === 'daily') {
      pruneExpiredRestorePoints(cfg).catch((e) => console.warn('Background prune warning:', e.message));
    }
  } catch (err) {
    console.warn('Restore config telemetry update warning:', err.message);
  }

  return manifest;
}

// =========================================================================
// BLOB LOADING, EXPORT & RETENTION PRUNING
// =========================================================================

async function loadSnapshotCollectionDocs(collMeta) {
  if (!collMeta?.sha256) return [];
  const rootSnap = await getDoc(doc(db, BLOBS_COLL_NAME, collMeta.sha256));
  if (!rootSnap.exists()) {
    throw new Error(`Missing restore blob payload for hash ${collMeta.sha256}`);
  }
  const rootData = rootSnap.data() || {};
  const chunkCount = Math.max(1, Number(rootData.chunkCount || collMeta.chunkCount || 1));
  const encoding = rootData.encoding || collMeta.encoding || 'gzip+base64';

  const chunks = [rootData.payload || ''];
  if (chunkCount > 1) {
    const extraSnaps = await Promise.all(
      Array.from({ length: chunkCount - 1 }, (_, i) =>
        getDoc(doc(db, BLOBS_COLL_NAME, `${collMeta.sha256}__p${i + 1}`))
      )
    );
    extraSnaps.forEach((s, i) => {
      if (!s.exists()) {
        throw new Error(`Missing chunk #${i + 1} for blob ${collMeta.sha256}`);
      }
      chunks.push(s.data()?.payload || '');
    });
  }

  const encoded = joinPayloadChunks(chunks);
  const jsonStr = await decompressEncodedPayloadToJson(encoded, encoding);
  const parsed = JSON.parse(jsonStr);
  return Array.isArray(parsed) ? parsed : [];
}

export async function togglePinRestorePoint(pointId, pinned) {
  await setDoc(doc(db, 'system_restore_points', pointId), { pinned: Boolean(pinned) }, { merge: true });
}

async function deleteOrphanedBlobsFromCandidates(survivingPoints = [], deletedPoints = []) {
  const referencedHashes = new Set();
  survivingPoints.forEach((p) => {
    Object.values(p.collections || {}).forEach((meta) => {
      if (meta?.sha256) referencedHashes.add(meta.sha256);
    });
  });

  const orphanMetaByHash = new Map();
  deletedPoints.forEach((p) => {
    Object.values(p.collections || {}).forEach((meta) => {
      if (meta?.sha256 && !referencedHashes.has(meta.sha256)) {
        orphanMetaByHash.set(meta.sha256, Math.max(1, Number(meta.chunkCount || 1)));
      }
    });
  });

  const deleteOps = [];
  orphanMetaByHash.forEach((chunkCount, hash) => {
    deleteOps.push((batch) => batch.delete(doc(db, BLOBS_COLL_NAME, hash)));
    for (let i = 1; i < chunkCount; i += 1) {
      deleteOps.push((batch) => batch.delete(doc(db, BLOBS_COLL_NAME, `${hash}__p${i}`)));
    }
  });

  if (deleteOps.length > 0) {
    await commitChunkedOps(deleteOps);
  }
  return orphanMetaByHash.size;
}

export async function deleteRestorePoint(pointId) {
  const allSnap = await getDocs(POINTS_COLL_REF());
  const allPoints = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const target = allPoints.find((p) => p.id === pointId);
  if (!target) return;

  const surviving = allPoints.filter((p) => p.id !== pointId);
  await deleteDoc(doc(db, 'system_restore_points', pointId));
  await deleteOrphanedBlobsFromCandidates(surviving, [target]);
}

export async function pruneExpiredRestorePoints(config = null) {
  const cfg = config || (await getRestoreSchedulerConfig());
  const allSnap = await getDocs(POINTS_COLL_REF());
  if (allSnap.empty) return { deletedPoints: 0, deletedBlobs: 0 };

  const allPoints = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const allHashes = new Set();
  allPoints.forEach((p) => {
    Object.values(p.collections || {}).forEach((meta) => {
      if (meta?.sha256) allHashes.add(meta.sha256);
    });
  });

  const plan = computeRetentionPruningPlan({
    restorePoints: allPoints,
    allBlobHashes: Array.from(allHashes),
    config: cfg,
    nowMs: Date.now(),
  });

  if (plan.deletePointIds.length === 0) {
    return { deletedPoints: 0, deletedBlobs: 0 };
  }

  const deleteSet = new Set(plan.deletePointIds);
  const deletedPoints = allPoints.filter((p) => deleteSet.has(p.id));
  const survivingPoints = allPoints.filter((p) => !deleteSet.has(p.id));

  await commitChunkedOps(
    plan.deletePointIds.map((pid) => (batch) => batch.delete(doc(db, 'system_restore_points', pid)))
  );
  const deletedBlobs = await deleteOrphanedBlobsFromCandidates(survivingPoints, deletedPoints);

  return {
    deletedPoints: plan.deletePointIds.length,
    deletedBlobs,
  };
}

export async function downloadRestorePointAsJson(pointId) {
  const pointSnap = await getDoc(doc(db, 'system_restore_points', pointId));
  if (!pointSnap.exists()) {
    throw new Error(`Restore point ${pointId} not found.`);
  }
  const pointMeta = { id: pointSnap.id, ...pointSnap.data() };
  const collNames = Object.keys(pointMeta.collections || {});
  const collectionsData = {};
  const collectionCounts = {};

  for (let i = 0; i < collNames.length; i += 6) {
    const slice = collNames.slice(i, i + 6);
    await Promise.all(
      slice.map(async (collName) => {
        const docsList = await loadSnapshotCollectionDocs(pointMeta.collections[collName]);
        collectionsData[collName] = docsList;
        collectionCounts[collName] = docsList.length;
      })
    );
  }

  const envelope = {
    _backupHeader: {
      app: 'Al-Tawoos FMCG ERP',
      version: APP_ARCHITECTURE.version || '3.8.0',
      backupDate: pointMeta.createdAt || new Date().toISOString(),
      exportedBy: pointMeta.createdByName || 'Automated System Restore',
      restorePointId: pointId,
      isPartialBackup: false,
      selectedCollections: collNames,
      totalCollections: collNames.length,
      totalDocuments: Object.values(collectionCounts).reduce((a, b) => a + b, 0),
      collectionCounts,
    },
    collections: collectionsData,
  };

  const jsonStr = JSON.stringify(envelope, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateCompact = String(pointMeta.localDateKey || 'snapshot');
  link.download = `al_tawoos_restore_point_${dateCompact}_${pointId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =========================================================================
// DIFF PREVIEW & RELATIONAL CASCADE EXECUTION + BALANCE RECALCULATION
// =========================================================================

export async function previewRestoreOperation({
  pointId,
  scopeType = 'system',
  moduleId = '',
  tabId = '',
  onProgress = null,
} = {}) {
  const scopePlan = resolveRestoreScopePlan({
    scopeType,
    moduleId,
    tabId,
    architecture: APP_ARCHITECTURE,
  });

  const pointSnap = await getDoc(doc(db, 'system_restore_points', pointId));
  if (!pointSnap.exists()) {
    throw new Error(`Restore point ${pointId} does not exist.`);
  }
  const pointMeta = { id: pointSnap.id, ...pointSnap.data() };

  const snapshotDocsByCollection = {};
  const liveDocsByCollection = {};
  const entries = scopePlan.entries || [];

  for (let i = 0; i < entries.length; i += 6) {
    const slice = entries.slice(i, i + 6);
    if (typeof onProgress === 'function') {
      onProgress({
        stage: 'diffing',
        completed: i,
        total: entries.length,
        currentCollection: slice[0]?.collection,
      });
    }

    await Promise.all(
      slice.map(async (entry) => {
        const coll = entry.collection;
        const collMeta = pointMeta.collections?.[coll];
        const [snapDocs, liveSnap] = await Promise.all([
          collMeta ? loadSnapshotCollectionDocs(collMeta) : Promise.resolve([]),
          getDocs(collection(db, coll)),
        ]);
        snapshotDocsByCollection[coll] = snapDocs;
        liveDocsByCollection[coll] = liveSnap.docs.map((d) => ({
          _docId: d.id,
          ...d.data(),
        }));
      })
    );
  }

  const diffPlan = computeRestoreDiffPlan({
    scopePlan,
    snapshotMeta: pointMeta,
    snapshotDocsByCollection,
    liveDocsByCollection,
  });

  return {
    pointMeta,
    scopePlan,
    diffPlan,
  };
}

async function recalculateItemsStockFromLedger() {
  const [itemsSnap, ledgerSnap] = await Promise.all([
    getDocs(collection(db, 'items')),
    getDocs(collection(db, 'stock_ledger')),
  ]);
  if (itemsSnap.empty) return;

  const stockByVariant = {};
  const stockByItem = {};
  ledgerSnap.docs.forEach((lDoc) => {
    const l = lDoc.data() || {};
    if (l.status === 'cancelled' || l.isCancelled) return;
    const qty = Number(l.qty) || 0;
    const itemCode = String(l.itemId || '').trim();
    const varCode = String(l.variantCode || '').trim();
    if (varCode) stockByVariant[varCode] = (stockByVariant[varCode] || 0) + qty;
    if (itemCode) stockByItem[itemCode] = (stockByItem[itemCode] || 0) + qty;
  });

  const ops = itemsSnap.docs.map((itemDoc) => (batch) => {
    const data = itemDoc.data() || {};
    const itemCode = data.code || itemDoc.id;
    const variations = Array.isArray(data.variations) ? data.variations : [];
    let computedItemTotal = 0;
    const updatedVariations = variations.map((v) => {
      const vSuffix = v.suffix || 'A';
      const vCode = v.variantCode || `${itemCode}-${vSuffix}`;
      const vStock = Math.max(0, Number((stockByVariant[vCode] || 0).toFixed(4)));
      computedItemTotal += vStock;
      return { ...v, stock: vStock };
    });
    const finalItemStock =
      variations.length > 0
        ? computedItemTotal
        : Math.max(0, Number((stockByItem[itemCode] || 0).toFixed(4)));
    batch.set(
      itemDoc.ref,
      { stock: finalItemStock, variations: updatedVariations, updatedAt: serverTimestamp() },
      { merge: true }
    );
  });

  await commitChunkedOps(ops);
}

async function recalculateSafesAndBanksFromCashTx() {
  const zeroDenominations = { 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, '0.5': 0 };
  const [safesSnap, banksSnap, txSnap] = await Promise.all([
    getDocs(collection(db, 'cash_safes')),
    getDocs(collection(db, 'corporate_banks')),
    getDocs(collection(db, 'cash_transactions')),
  ]);

  const safeBalances = {};
  const safeDenoms = {};
  const bankBalances = {};

  const ensureSafeDenoms = (sId) => {
    if (!safeDenoms[sId]) safeDenoms[sId] = { ...zeroDenominations };
    return safeDenoms[sId];
  };

  const addDenomMap = (sId, denomObj, multiplier = 1) => {
    if (!sId || !denomObj || typeof denomObj !== 'object') return;
    const map = ensureSafeDenoms(sId);
    Object.entries(denomObj).forEach(([k, v]) => {
      const count = Number(v) || 0;
      if (count !== 0) {
        map[k] = Math.max(0, (Number(map[k]) || 0) + count * multiplier);
      }
    });
  };

  txSnap.docs.forEach((tDoc) => {
    const tx = tDoc.data() || {};
    if (
      ['cancelled', 'reversed', 'rejected', 'draft', 'pending_approval', 'pending_receiver_approval'].includes(
        tx.status
      )
    ) {
      return;
    }
    const txType = String(tx.type || tx.voucherType || '').toLowerCase();
    const amt = Math.abs(Number(tx.amount || tx.totalAmount || 0));
    const sourceSafe = tx.safeId || tx.sourceSafeId || tx.vaultId;
    const targetSafe = tx.targetSafeId;
    const targetBank = tx.bankId || tx.bankAccountId;

    if (txType === 'safe_transfer') {
      if (sourceSafe && amt) {
        safeBalances[sourceSafe] = (safeBalances[sourceSafe] || 0) - amt;
        addDenomMap(sourceSafe, tx.denominationsOut || tx.denominations, -1);
      }
      if (targetSafe && amt) {
        safeBalances[targetSafe] = (safeBalances[targetSafe] || 0) + amt;
        addDenomMap(targetSafe, tx.denominationsIn || tx.denominationsOut || tx.denominations, 1);
      }
      return;
    }

    if (txType === 'change_exchange') {
      if (sourceSafe) {
        addDenomMap(sourceSafe, tx.denominationsIn, 1);
        addDenomMap(sourceSafe, tx.denominationsOut, -1);
      }
      return;
    }

    if (!amt && txType !== 'balance_adjustment') return;

    const dir = String(tx.direction || '').toLowerCase();
    const isInflow =
      dir === 'in' ||
      ['receipt', 'inflow', 'deposit', 'collection', 'custody_settle', 'advance_settle', 'opening_balance'].includes(
        txType
      );
    const signedAmt = isInflow ? amt : -amt;

    if (sourceSafe) {
      safeBalances[sourceSafe] = (safeBalances[sourceSafe] || 0) + signedAmt;
      if (tx.denominationsIn || tx.denominationsOut) {
        addDenomMap(sourceSafe, tx.denominationsIn, 1);
        addDenomMap(sourceSafe, tx.denominationsOut, -1);
      } else if (tx.denominations) {
        addDenomMap(sourceSafe, tx.denominations, isInflow ? 1 : -1);
      }
    }
    if (targetBank) {
      bankBalances[targetBank] = (bankBalances[targetBank] || 0) + signedAmt;
    }
  });

  if (!safesSnap.empty) {
    const ops = safesSnap.docs.map((safeDoc) => (batch) => {
      const sData = safeDoc.data() || {};
      const newBal = Number(((safeBalances[safeDoc.id] || 0) + (safeBalances[sData.code] || 0)).toFixed(2));
      const computedDenoms =
        newBal === 0
          ? { ...zeroDenominations }
          : safeDenoms[safeDoc.id] || safeDenoms[sData.code] || sData.balances?.EGP?.denominations || { ...zeroDenominations };
      const existingBalances = sData.balances && typeof sData.balances === 'object' ? sData.balances : {};
      const updatedBalances = {
        ...existingBalances,
        EGP: {
          ...(existingBalances.EGP || {}),
          currentBalance: newBal,
          denominations: computedDenoms,
        },
      };
      batch.set(
        safeDoc.ref,
        {
          currentBalance: newBal,
          balance: newBal,
          denominations: computedDenoms,
          balances: updatedBalances,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await commitChunkedOps(ops);
  }

  if (!banksSnap.empty) {
    const ops = banksSnap.docs.map((bankDoc) => (batch) => {
      const bData = bankDoc.data() || {};
      const newBal = Number(((bankBalances[bankDoc.id] || 0) + (bankBalances[bData.code] || 0)).toFixed(2));
      const payload = {
        currentBalance: newBal,
        balance: newBal,
        updatedAt: serverTimestamp(),
      };
      if (bData.balances && typeof bData.balances === 'object') {
        payload.balances = {
          ...bData.balances,
          EGP: {
            ...(bData.balances.EGP || {}),
            currentBalance: newBal,
          },
        };
      }
      batch.set(bankDoc.ref, payload, { merge: true });
    });
    await commitChunkedOps(ops);
  }
}

export async function executeRestoreOperation({
  pointId,
  scopeType = 'system',
  moduleId = '',
  tabId = '',
  actor = {},
  createSafetyCheckpoint = true,
  onProgress = null,
} = {}) {
  assertGeneralAdmin(actor);
  const { actorId, actorName } = getActorMeta(actor);

  // Step A: Guarantee a fresh pre-restore safety checkpoint BEFORE mutating live data
  let safetyPoint = null;
  if (createSafetyCheckpoint) {
    if (typeof onProgress === 'function') {
      onProgress({ stage: 'safety_checkpoint', completed: 0, total: 1 });
    }
    safetyPoint = await createRestorePoint({
      kind: 'pre_restore',
      source: 'safety_guard',
      pinned: false,
      labelAr: `أمان قبل استعادة (${pointId})`,
      labelEn: `Safety Point before Restore (${pointId})`,
      notes: `Auto safety capture prior to ${scopeType} rollback (${moduleId || 'all'}/${tabId || 'all'})`,
      actor,
      onProgress,
    });
  }

  // Step B: Compute fresh live diff immediately before writing
  const { pointMeta, scopePlan, diffPlan } = await previewRestoreOperation({
    pointId,
    scopeType,
    moduleId,
    tabId,
    onProgress,
  });

  // Step C: Execute creates, updates (exact replacement without merge), and deletes in 400-op batches
  const totalEntries = diffPlan.entries.length;
  for (let idx = 0; idx < totalEntries; idx += 1) {
    const entry = diffPlan.entries[idx];
    if (entry.skippedNotInSnapshot) continue;
    const ops = [];

    entry.toCreate.forEach((sDoc) => {
      const docId = sDoc._docId;
      const body = { ...sDoc };
      delete body._docId;
      const hydrated = hydrateRestoreValue(body, Timestamp);
      ops.push((batch) => batch.set(doc(db, entry.collection, docId), hydrated));
    });

    entry.toUpdate.forEach((sDoc) => {
      const docId = sDoc._docId;
      const body = { ...sDoc };
      delete body._docId;
      const hydrated = hydrateRestoreValue(body, Timestamp);
      ops.push((batch) => batch.set(doc(db, entry.collection, docId), hydrated));
    });

    entry.toDelete.forEach((lDoc) => {
      const docId = lDoc._docId;
      ops.push((batch) => batch.delete(doc(db, entry.collection, docId)));
    });

    if (ops.length > 0) {
      if (typeof onProgress === 'function') {
        onProgress({
          stage: 'writing',
          completed: idx + 1,
          total: totalEntries,
          currentCollection: entry.collection,
        });
      }
      await commitChunkedOps(ops);
    }
  }

  // Step D: Post-restore cached balance recalculation for partial scope rollbacks
  if (diffPlan.recalculate?.recalcItemsStock) {
    if (typeof onProgress === 'function') {
      onProgress({ stage: 'recalculating', completed: 1, total: 2, currentCollection: 'items' });
    }
    await recalculateItemsStockFromLedger();
  }
  if (diffPlan.recalculate?.recalcSafesAndBanks) {
    if (typeof onProgress === 'function') {
      onProgress({ stage: 'recalculating', completed: 2, total: 2, currentCollection: 'cash_safes' });
    }
    await recalculateSafesAndBanksFromCashTx();
  }

  // Step E: Write immutable audit log entry (enables 1-click Undo via safetyPointId)
  const executedAtMs = Date.now();
  const executedAt = new Date(executedAtMs).toISOString();
  const logId = `RLOG-${executedAtMs}-${Math.random().toString(36).slice(2, 6)}`;
  const logEntry = {
    id: logId,
    pointId,
    pointCreatedAt: pointMeta.createdAt || '',
    pointLabelAr: pointMeta.labelAr || '',
    pointLabelEn: pointMeta.labelEn || '',
    safetyPointId: safetyPoint?.id || '',
    scopeType: scopePlan.scopeType,
    moduleId: scopePlan.moduleId || '',
    tabId: scopePlan.tabId || '',
    scopeLabelAr: scopePlan.scopeLabelAr || '',
    scopeLabelEn: scopePlan.scopeLabelEn || '',
    totals: diffPlan.totals,
    recalculate: diffPlan.recalculate,
    actorId,
    actorName,
    executedAt,
    executedAtMs,
  };

  await setDoc(doc(db, 'system_restore_logs', logId), logEntry);

  return {
    logEntry,
    safetyPoint,
    diffPlan,
  };
}

// =========================================================================
// SILENT IN-APP HYBRID AUTO-SCHEDULER (SINGLE-WRITER LEASE TRANSACTION)
// =========================================================================

export function startAutoRestoreScheduler({ currentUser = null } = {}) {
  if (typeof window === 'undefined' || !currentUser?.id) {
    return () => {};
  }

  const holderId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let lastActivityMs = Date.now();
  let stopped = false;
  let runningTick = false;

  const markActivity = () => {
    lastActivityMs = Date.now();
  };

  window.addEventListener('pointerdown', markActivity, { passive: true });
  window.addEventListener('keydown', markActivity, { passive: true });
  window.addEventListener('hashchange', markActivity, { passive: true });

  const runTick = async () => {
    if (stopped || runningTick) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    runningTick = true;
    let leaseAcquired = false;

    try {
      const nowMs = Date.now();
      const todayKey = formatLocalDateKey(nowMs);

      const quickCfgSnap = await getDoc(SCHEDULER_DOC_REF());
      const quickCfg = quickCfgSnap.exists()
        ? { ...DEFAULT_RESTORE_CONFIG, ...quickCfgSnap.data() }
        : { ...DEFAULT_RESTORE_CONFIG };

      if (!quickCfg.enabled) return;

      const dailyReads = quickCfg.dailyReadCounterDate === todayKey ? Number(quickCfg.dailyReadsUsed || 0) : 0;
      if (dailyReads >= Number(quickCfg.maxDailyReadBudget || 35000)) return;

      const intervalMs = Math.max(5, Number(quickCfg.intervalMinutes || 15)) * 60 * 1000;
      const heartbeatMs = Math.max(15, Number(quickCfg.idleHeartbeatMinutes || 60)) * 60 * 1000;
      const lastAutoMs = Number(quickCfg.lastAutoSnapshotAtMs || 0);
      const elapsedSinceLast = nowMs - lastAutoMs;

      if (elapsedSinceLast < intervalMs) return;
      if (quickCfg.skipWhenIdle && lastActivityMs <= lastAutoMs && elapsedSinceLast < heartbeatMs) {
        return;
      }

      // Atomic transaction lease ensures ONLY ONE active browser tab across all devices captures this slot
      let captureKind = 'auto';
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(SCHEDULER_DOC_REF());
        const cfg = snap.exists()
          ? { ...DEFAULT_RESTORE_CONFIG, ...snap.data() }
          : { ...DEFAULT_RESTORE_CONFIG };

        if (!cfg.enabled) {
          throw new Error('SKIP_DISABLED');
        }
        const txLastMs = Number(cfg.lastAutoSnapshotAtMs || 0);
        if (nowMs - txLastMs < intervalMs) {
          throw new Error('SKIP_NOT_DUE');
        }
        if (Number(cfg.leaseExpiresAtMs || 0) > nowMs && cfg.leaseHolderId && cfg.leaseHolderId !== holderId) {
          throw new Error('SKIP_LOCKED');
        }
        captureKind = cfg.lastDailySnapshotDate !== todayKey ? 'daily' : 'auto';
        tx.set(
          SCHEDULER_DOC_REF(),
          {
            ...DEFAULT_RESTORE_CONFIG,
            ...cfg,
            leaseHolderId: holderId,
            leaseExpiresAtMs: nowMs + 3 * 60 * 1000,
          },
          { merge: true }
        );
        leaseAcquired = true;
      });

      if (stopped) return;

      await createRestorePoint({
        kind: captureKind,
        source: 'in_app_scheduler',
        pinned: false,
        actor: currentUser,
      });
    } catch (err) {
      const msg = String(err?.message || '');
      if (!msg.startsWith('SKIP_')) {
        console.debug('Auto-restore scheduler tick skipped:', msg);
      }
    } finally {
      if (leaseAcquired) {
        try {
          await setDoc(SCHEDULER_DOC_REF(), { leaseHolderId: '', leaseExpiresAtMs: 0 }, { merge: true });
        } catch {
          // Ignore lease release failure; TTL expires cleanly in 3 minutes
        }
      }
      runningTick = false;
    }
  };

  const initialTimer = setTimeout(runTick, 15000);
  const pollTimer = setInterval(runTick, 60000);
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      markActivity();
      runTick();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(pollTimer);
    window.removeEventListener('pointerdown', markActivity);
    window.removeEventListener('keydown', markActivity);
    window.removeEventListener('hashchange', markActivity);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

export { RESTORE_INTERNAL_COLLECTIONS };
