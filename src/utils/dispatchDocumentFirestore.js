/**
 * Firestore Persistence Adapter for the Immutable Dispatch Documents Registry
 * -----------------------------------------------------------------------------
 * - Atomic sequential numbering via `system_config/dispatch_doc_counter`
 * - Immutable document archive in `dispatch_documents/{docNumber}`
 * - Non-destructive superseding (never deletes or reuses a document number)
 */

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { formatDispatchDocNumber } from './dispatchDocumentRegistry.js';

const COUNTER_COLLECTION = 'system_config';
const COUNTER_DOC_ID = 'dispatch_doc_counter';
const RETURN_COUNTER_DOC_ID = 'return_doc_counter';
export const DISPATCH_DOCUMENTS_COLLECTION = 'dispatch_documents';

export function formatReturnDocNumber(seq) {
  const n = Math.max(1, Math.floor(Number(seq) || 0));
  return `RET-${String(n).padStart(5, '0')}`;
}

/**
 * Atomically mints the next unique sequential Return Document number (RET-00001, RET-00002, ...).
 */
export async function mintReturnDocNumber(db) {
  const counterRef = doc(db, COUNTER_COLLECTION, RETURN_COUNTER_DOC_ID);
  const nextSeq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const currentSeq = snap.exists() ? Number(snap.data()?.lastSeq || 0) : 0;
    const incremented = currentSeq + 1;
    tx.set(
      counterRef,
      {
        lastSeq: incremented,
        lastDocNumber: formatReturnDocNumber(incremented),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return incremented;
  });

  return {
    returnDocSeq: nextSeq,
    returnDocNumber: formatReturnDocNumber(nextSeq),
  };
}

/**
 * Atomically mints the next unique sequential Dispatch Document number (DD-00001, DD-00002, ...).
 * Guaranteed intact and monotonic even under concurrent printing.
 */
export async function mintDispatchDocNumber(db) {
  const counterRef = doc(db, COUNTER_COLLECTION, COUNTER_DOC_ID);
  const nextSeq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const currentSeq = snap.exists() ? Number(snap.data()?.lastSeq || 0) : 0;
    const incremented = currentSeq + 1;
    tx.set(
      counterRef,
      {
        lastSeq: incremented,
        lastDocNumber: formatDispatchDocNumber(incremented),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return incremented;
  });

  return {
    docSeq: nextSeq,
    docNumber: formatDispatchDocNumber(nextSeq),
  };
}

/**
 * Persists a generated Dispatch Document snapshot into the top-level
 * `dispatch_documents/{docNumber}` registry collection.
 */
export async function saveDispatchDocumentToRegistry(db, entryPayload) {
  if (!entryPayload?.docNumber) {
    throw new Error('saveDispatchDocumentToRegistry requires entryPayload.docNumber');
  }
  const ref = doc(db, DISPATCH_DOCUMENTS_COLLECTION, entryPayload.docNumber);
  await setDoc(ref, entryPayload, { merge: false });
  return entryPayload;
}

/**
 * Non-destructively marks any previously `current` documents for a given `tripId`
 * in `dispatch_documents` as `superseded`. Never deletes or modifies `modelSnapshot`.
 */
export async function markTripRegistryDocsSuperseded(
  db,
  tripId,
  {
    reasonAr = '',
    reasonEn = '',
    actorName = '',
    supersededByDocNumber = null,
    excludeDocNumber = null,
    nowIso = new Date().toISOString(),
  } = {}
) {
  if (!tripId) return 0;
  const q = query(
    collection(db, DISPATCH_DOCUMENTS_COLLECTION),
    where('tripId', '==', tripId)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  let count = 0;

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (!data || data.storedStatus === 'superseded') return;
    if (excludeDocNumber && data.docNumber === excludeDocNumber) return;

    batch.update(docSnap.ref, {
      storedStatus: 'superseded',
      supersededAt: data.supersededAt || nowIso,
      supersededBy: data.supersededBy || actorName || '',
      supersededByDocNumber: supersededByDocNumber || data.supersededByDocNumber || null,
      supersededReasonAr: reasonAr || data.supersededReasonAr || '',
      supersededReasonEn: reasonEn || data.supersededReasonEn || '',
    });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
  }
  return count;
}
