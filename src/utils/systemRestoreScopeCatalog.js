/**
 * Automated System Restore (Time Machine) — Pure Scope, Cascade, Codec, Diff & Retention Engine
 * Zero Firebase SDK imports so it runs identically in Browser (React/Vite), Node tests, and Cloud Functions.
 */

import { APP_ARCHITECTURE, getMasterCollectionsRegistry } from '../config/appArchitecture.js';

export const RESTORE_INTERNAL_COLLECTIONS = new Set([
  'system_restore_points',
  'system_restore_blobs',
  'system_restore_config',
  'system_restore_logs',
]);

export const VIRTUAL_NON_COLLECTIONS = new Set([
  'financial_reports',
]);

export const DEFAULT_RESTORE_CONFIG = {
  enabled: true,
  intervalMinutes: 15,
  intraDayRetentionHours: 12,
  dailyRetentionDays: 14,
  maxDailyReadBudget: 35000,
  skipWhenIdle: true,
  idleHeartbeatMinutes: 60,
  keepSafetyPointsCount: 8,
};

export const OPERATIONAL_COLLECTIONS_COMPLETE = [
  'purchase_orders',
  'goods_receipts',
  'stock_transfers',
  'transfers',
  'stock_ledger',
  'stock_counts',
  'spare_parts_issues',
  'work_orders',
  'production_work_orders',
  'staged_floor_pallets',
  'staged_floor_materials',
  'production_breaks',
  'production_shifts',
  'liquid_tanks',
  'production_transformations',
  'shift_handovers',
  'faulty_fg_returns',
  'fg_receipts',
  'cash_transactions',
  'cash_count_sessions',
  'journal_entries',
  'custody_ledger',
  'custody_advance_drafts',
  'custodies_and_advances',
  'dues_settlements',
  'dues_batches',
  'wht_notes',
  'sales_orders',
  'truck_dispatches',
  'dispatch_documents',
  'sales_invoices',
  'price_lists',
  'pricing_strategies',
  'client_contracts',
  'record_comments',
  'user_actions_queue',
  'system_notifications',
];

export const MAX_BLOB_CHUNK_CHARS = 650000;

/**
 * Dynamically discovers every backup/restore-eligible Firestore collection in the ERP,
 * excluding internal Time Machine collections and virtual non-collection tabs.
 */
export function getAllSystemRestoreCollections(architecture = APP_ARCHITECTURE) {
  const set = new Set([
    ...getMasterCollectionsRegistry(architecture),
    ...OPERATIONAL_COLLECTIONS_COMPLETE,
  ]);

  Object.values(architecture?.modules || {}).forEach((mod) => {
    Object.values(mod?.tabs || {}).forEach((tab) => {
      if (!tab?.collection) return;
      String(tab.collection)
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => set.add(c));
    });
  });

  RESTORE_INTERNAL_COLLECTIONS.forEach((c) => set.delete(c));
  VIRTUAL_NON_COLLECTIONS.forEach((c) => set.delete(c));

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// =========================================================================
// CANONICAL SERIALIZATION, HYDRATION & CHUNKED GZIP+BASE64 CODEC
// =========================================================================

export function serializeRestoreValue(value) {
  if (value === null || value === undefined) return value;
  if (
    typeof value === 'object' &&
    typeof value.toDate === 'function' &&
    typeof value.seconds === 'number'
  ) {
    return {
      _nanoseconds: Number(value.nanoseconds || 0),
      _seconds: value.seconds,
      _type: 'firestore_timestamp',
    };
  }
  if (value instanceof Date) {
    return {
      _iso: Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString(),
      _type: 'date_iso',
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeRestoreValue(item));
  }
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((k) => {
        const v = value[k];
        if (v !== undefined) {
          out[k] = serializeRestoreValue(v);
        }
      });
    return out;
  }
  return value;
}

export function hydrateRestoreValue(value, TimestampCtor = null) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && value._type === 'firestore_timestamp') {
    const sec = Number(value._seconds || 0);
    const nsec = Number(value._nanoseconds || 0);
    if (typeof TimestampCtor === 'function') {
      return new TimestampCtor(sec, nsec);
    }
    return {
      seconds: sec,
      nanoseconds: nsec,
      toDate: () => new Date(sec * 1000 + Math.floor(nsec / 1e6)),
    };
  }
  if (typeof value === 'object' && value._type === 'date_iso') {
    return new Date(value._iso);
  }
  if (Array.isArray(value)) {
    return value.map((item) => hydrateRestoreValue(item, TimestampCtor));
  }
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => {
      out[k] = hydrateRestoreValue(value[k], TimestampCtor);
    });
    return out;
  }
  return value;
}

export function canonicalizeCollectionDocs(rawDocs = []) {
  const normalized = (Array.isArray(rawDocs) ? rawDocs : [])
    .filter((d) => d && (d._docId || d.id))
    .map((d) => {
      const docId = String(d._docId || d.id);
      const clone = { ...d };
      delete clone._docId;
      const serialized = serializeRestoreValue(clone);
      return {
        _docId: docId,
        ...serialized,
      };
    })
    .sort((a, b) => String(a._docId).localeCompare(String(b._docId)));

  return {
    docs: normalized,
    json: JSON.stringify(normalized),
  };
}

export function uint8ToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (typeof Buffer !== 'undefined' && typeof btoa === 'undefined') {
    return Buffer.from(arr).toString('base64');
  }
  const CHUNK_BYTES = 0x8000; // 32768 bytes per slice avoids call-stack limits
  let binary = '';
  for (let i = 0; i < arr.length; i += CHUNK_BYTES) {
    const slice = arr.subarray(i, i + CHUNK_BYTES);
    let part = '';
    for (let j = 0; j < slice.length; j += 1) {
      part += String.fromCharCode(slice[j]);
    }
    binary += part;
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

export function base64ToUint8(b64 = '') {
  if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function splitPayloadIntoChunks(str = '', maxChars = MAX_BLOB_CHUNK_CHARS) {
  const source = String(str || '');
  if (!source) return [''];
  const chunks = [];
  for (let i = 0; i < source.length; i += maxChars) {
    chunks.push(source.slice(i, i + maxChars));
  }
  return chunks;
}

export function joinPayloadChunks(chunks = []) {
  return (Array.isArray(chunks) ? chunks : []).join('');
}

async function readStreamToUint8(readableStream) {
  const reader = readableStream.getReader();
  const parts = [];
  let totalLen = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      totalLen += value.byteLength;
    }
  }
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

async function loadNodeBuiltin(name) {
  const spec = `node:${name}`;
  return import(/* @vite-ignore */ spec);
}

export async function compressJsonToEncodedPayload(jsonStr = '') {
  const input = String(jsonStr || '');
  // Node.js runtime path (Cloud Functions or verification scripts)
  if (typeof process !== 'undefined' && process.versions?.node && typeof CompressionStream === 'undefined') {
    const zlib = await loadNodeBuiltin('zlib');
    const gz = zlib.gzipSync(Buffer.from(input, 'utf8'));
    return {
      encoded: gz.toString('base64'),
      encoding: 'gzip+base64',
      rawBytes: Buffer.byteLength(input, 'utf8'),
      compressedBytes: gz.byteLength,
    };
  }

  const encodedBytes = new TextEncoder().encode(input);
  if (typeof CompressionStream === 'function') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(encodedBytes);
    writer.close();
    const gzBytes = await readStreamToUint8(cs.readable);
    const b64 = uint8ToBase64(gzBytes);
    return {
      encoded: b64,
      encoding: 'gzip+base64',
      rawBytes: encodedBytes.byteLength,
      compressedBytes: gzBytes.byteLength,
    };
  }

  return {
    encoded: input,
    encoding: 'json+utf8',
    rawBytes: encodedBytes.byteLength,
    compressedBytes: encodedBytes.byteLength,
  };
}

export async function decompressEncodedPayloadToJson(encoded = '', encoding = 'gzip+base64') {
  if (encoding === 'json+utf8' || encoding === 'json') {
    return String(encoded || '');
  }

  if (typeof process !== 'undefined' && process.versions?.node && typeof DecompressionStream === 'undefined') {
    const zlib = await loadNodeBuiltin('zlib');
    const gzBuf = Buffer.from(String(encoded || ''), 'base64');
    return zlib.gunzipSync(gzBuf).toString('utf8');
  }

  if (typeof DecompressionStream === 'function') {
    const gzBytes = base64ToUint8(String(encoded || ''));
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(gzBytes);
    writer.close();
    const outBytes = await readStreamToUint8(ds.readable);
    return new TextDecoder().decode(outBytes);
  }

  // Last-resort Node zlib fallback even if global DecompressionStream was polyfilled strangely
  if (typeof process !== 'undefined' && process.versions?.node) {
    const zlib = await loadNodeBuiltin('zlib');
    return zlib.gunzipSync(Buffer.from(String(encoded || ''), 'base64')).toString('utf8');
  }

  throw new Error(`Unsupported restore payload encoding: ${encoding}`);
}

export async function computeSha256Hex(str = '') {
  const input = String(str || '');
  if (globalThis.crypto?.subtle?.digest) {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const { createHash } = await loadNodeBuiltin('crypto');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// =========================================================================
// ALWAYS FULL RELATIONAL CASCADE SCOPE RESOLVER
// =========================================================================

function makeCollabCascadeRules(targetCollections = [], targetTabs = [], docPrefixes = []) {
  const matchPrefix = (val) => {
    const s = String(val || '').toUpperCase();
    return docPrefixes.some((p) => s.startsWith(p.toUpperCase()));
  };
  const matchFn = (d) =>
    targetCollections.includes(d.collectionName) ||
    targetCollections.includes(d.sourceCollection) ||
    targetCollections.includes(d.targetCollection) ||
    targetTabs.includes(d.targetTab) ||
    targetTabs.includes(d.tabId) ||
    targetTabs.includes(d.moduleKey) ||
    matchPrefix(d.recordId) ||
    matchPrefix(d.docId) ||
    matchPrefix(d.highlightId);

  return [
    {
      collection: 'record_comments',
      labelAr: 'التعليقات والمهام المرتبطة بالسجلات',
      labelEn: 'Linked record comments',
      predicate: matchFn,
    },
    {
      collection: 'user_actions_queue',
      labelAr: 'طلبات الاعتماد والمهام المعلقة المرتبطة',
      labelEn: 'Linked pending action tasks',
      predicate: matchFn,
    },
    {
      collection: 'system_notifications',
      labelAr: 'إشعارات النظام المرتبطة',
      labelEn: 'Linked system notifications',
      predicate: matchFn,
    },
  ];
}

const isGrnOrRtnDoc = (d, docId) =>
  d.docType !== 'inventory_reconciliation' &&
  !d.isDirectAdjustment &&
  !String(docId || d.id || '').startsWith('ADJ-');

const isAdjReconciliationDoc = (d, docId) =>
  d.docType === 'inventory_reconciliation' ||
  Boolean(d.isDirectAdjustment) ||
  String(docId || d.id || '').startsWith('ADJ-') ||
  ['STOCK_COUNT_RECONCILIATION', 'STOCK_COUNT_ADJUSTMENT'].includes(d.supplierId);

const isSalesLinkedJe = (d, docId) => {
  const idStr = String(docId || d.id || '');
  const refStr = String(d.sourceDocId || d.referenceNumber || '');
  return (
    d.sourceCollection === 'sales_orders' ||
    ['sales_order', 'sales_supply', 'sales_return', 'sales_delivery'].includes(d.originType) ||
    idStr.startsWith('JE-SO-') ||
    refStr.startsWith('SO-')
  );
};

const isSalesLinkedCash = (d) =>
  d.sourceCollection === 'sales_orders' ||
  Boolean(d.salesOrderId) ||
  String(d.referenceNumber || '').startsWith('SO-') ||
  (Array.isArray(d.linkedDocs) &&
    d.linkedDocs.some((ld) => ld.docType === 'SO' || String(ld.docId || '').startsWith('SO-')));

const isSalesLinkedDues = (d) =>
  Boolean(d.salesOrderId) ||
  String(d.docId || '').startsWith('SO-') ||
  (Array.isArray(d.linkedDocs) &&
    d.linkedDocs.some((ld) => ld.docType === 'SO' || String(ld.docId || '').startsWith('SO-')));

const isSalesLinkedWht = (d) =>
  Boolean(d.salesOrderId) || String(d.sourceDocId || d.docId || '').startsWith('SO-');

const isTripLinkedOrder = (d) =>
  Number(d.loadingOrderNumber || 0) > 0 ||
  Boolean(d.fgWarehouseDispatchId) ||
  Boolean(d.settledFromTripExtras) ||
  Boolean(d.isPostDispatchSettlementOrder);

function buildTabRelationalDefinition(moduleId, tabId, architecture = APP_ARCHITECTURE) {
  const tabMeta = architecture?.modules?.[moduleId]?.tabs?.[tabId] || null;
  const fallbackCols = tabMeta?.collection
    ? String(tabMeta.collection)
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c && !VIRTUAL_NON_COLLECTIONS.has(c) && !RESTORE_INTERNAL_COLLECTIONS.has(c))
    : [];

  // MATERIALS MODULE TABS
  if (moduleId === 'materials' && tabId === 'purchase_orders') {
    return {
      primaryCollections: ['purchase_orders'],
      cascadeRules: [
        {
          collection: 'cash_transactions',
          labelAr: 'سندات الدفعات المقدمة لأوامر الشراء',
          labelEn: 'PO Advance cash/bank vouchers',
          predicate: (d) =>
            Boolean(d.poId) ||
            String(d.referenceNumber || '').startsWith('PO-') ||
            (Array.isArray(d.linkedDocs) &&
              d.linkedDocs.some((ld) => ld.docType === 'PO' || String(ld.docId || '').startsWith('PO-'))),
        },
        {
          collection: 'journal_entries',
          labelAr: 'قيود الدفعات المقدمة لأوامر الشراء',
          labelEn: 'PO Advance journal entries',
          predicate: (d, docId) =>
            d.sourceCollection === 'purchase_orders' ||
            String(docId || d.id || '').startsWith('JE-PO-') ||
            String(d.sourceDocId || d.referenceNumber || '').startsWith('PO-'),
        },
        {
          collection: 'dues_settlements',
          labelAr: 'تسويات الدفعات المقدمة لأوامر الشراء',
          labelEn: 'PO Advance dues settlements',
          predicate: (d) =>
            Boolean(d.poId) ||
            String(d.docId || '').startsWith('PO-') ||
            (Array.isArray(d.linkedDocs) &&
              d.linkedDocs.some((ld) => ld.docType === 'PO' || String(ld.docId || '').startsWith('PO-'))),
        },
        {
          collection: 'wht_notes',
          labelAr: 'إشعارات الخصم المرتبطة بأوامر الشراء',
          labelEn: 'PO WHT notes',
          predicate: (d) => Boolean(d.poId) || String(d.sourceDocId || d.docId || '').startsWith('PO-'),
        },
        ...makeCollabCascadeRules(['purchase_orders'], ['purchase_orders'], ['PO-']),
      ],
      recalculate: { recalcSafesAndBanks: true },
    };
  }

  if (moduleId === 'materials' && tabId === 'goods_receipts') {
    return {
      // Selective predicate on goods_receipts keeps ADJ-* stock-count records isolated unless stock_count is restored
      primaryCollections: [],
      cascadeRules: [
        {
          collection: 'goods_receipts',
          isPrimary: true,
          labelAr: 'أذون الاستلام الفعلي ومرتجعات الموردين (GRN-* & RTN-*)',
          labelEn: 'Goods Receipts & Supplier Returns (GRN-* & RTN-*)',
          predicate: isGrnOrRtnDoc,
        },
        {
          collection: 'stock_ledger',
          labelAr: 'حركات كارت الصنف للاستلامات والمرتجعات',
          labelEn: 'Stock ledger movements for GRNs/RTNs',
          predicate: (d) =>
            ['receipt', 'return', 'GRN', 'RTN'].includes(d.docType) ||
            [
              'initial_receipt',
              'receipt_modified',
              'supplier_return',
              'receipt_cancelled_reversal',
              'return_cancelled_restored',
              'receipt_reversed_admin',
              'return_reversed_admin',
            ].includes(d.action) ||
            String(d.grnId || '').startsWith('GRN-') ||
            String(d.grnId || '').startsWith('RTN-'),
        },
        {
          collection: 'journal_entries',
          labelAr: 'قيود اليومية للاستلامات والمرتجعات',
          labelEn: 'Journal entries for GRNs/RTNs',
          predicate: (d, docId) => {
            const idStr = String(docId || d.id || '');
            const refStr = String(d.sourceDocId || d.referenceNumber || '');
            return (
              d.sourceCollection === 'goods_receipts' ||
              ['goods_receipt', 'goods_receipt_return'].includes(d.originType) ||
              idStr.startsWith('JE-GRN-') ||
              idStr.startsWith('JE-RTN-') ||
              idStr.startsWith('JE-REV-GRN-') ||
              idStr.startsWith('JE-REV-RTN-') ||
              refStr.startsWith('GRN-') ||
              refStr.startsWith('RTN-')
            );
          },
        },
        {
          collection: 'cash_transactions',
          labelAr: 'سندات الصرف والتحصيل المرتبطة بالاستلامات',
          labelEn: 'Cash/bank vouchers linked to GRNs/RTNs',
          predicate: (d) =>
            Boolean(d.grnId) ||
            String(d.referenceNumber || '').startsWith('GRN-') ||
            String(d.referenceNumber || '').startsWith('RTN-') ||
            (Array.isArray(d.linkedDocs) &&
              d.linkedDocs.some(
                (ld) =>
                  ld.docType === 'GRN' ||
                  ld.docType === 'RTN' ||
                  String(ld.docId || '').startsWith('GRN-') ||
                  String(ld.docId || '').startsWith('RTN-')
              )),
        },
        {
          collection: 'dues_settlements',
          labelAr: 'تسويات الاستحقاقات للاستلامات والمرتجعات',
          labelEn: 'Dues settlements linked to GRNs/RTNs',
          predicate: (d) =>
            Boolean(d.grnId) ||
            String(d.docId || '').startsWith('GRN-') ||
            String(d.docId || '').startsWith('RTN-') ||
            (Array.isArray(d.linkedDocs) &&
              d.linkedDocs.some(
                (ld) =>
                  ld.docType === 'GRN' ||
                  ld.docType === 'RTN' ||
                  String(ld.docId || '').startsWith('GRN-') ||
                  String(ld.docId || '').startsWith('RTN-')
              )),
        },
        {
          collection: 'wht_notes',
          labelAr: 'شهادات الخصم الضريبي 1% للاستلامات',
          labelEn: '1% WHT notes for GRNs/RTNs',
          predicate: (d) =>
            Boolean(d.grnId) ||
            String(d.sourceDocId || d.docId || '').startsWith('GRN-') ||
            String(d.sourceDocId || d.docId || '').startsWith('RTN-'),
        },
        ...makeCollabCascadeRules(['goods_receipts'], ['goods_receipts'], ['GRN-', 'RTN-']),
      ],
      recalculate: { recalcItemsStock: true, recalcSafesAndBanks: true },
    };
  }

  if (moduleId === 'materials' && tabId === 'transfers') {
    return {
      primaryCollections: ['transfers'],
      cascadeRules: [
        {
          collection: 'stock_transfers',
          isPrimary: true,
          labelAr: 'أذون التحويل المخزني بين المستودعات',
          labelEn: 'Warehouse stock transfer vouchers',
          predicate: (d) => !d.isFinishedGoods && d.transferType !== 'finished_goods' && !d.isPipelineTransfer,
        },
        {
          collection: 'stock_ledger',
          labelAr: 'حركات التحويل في كارت الصنف',
          labelEn: 'Transfer entries in stock_ledger',
          predicate: (d) =>
            d.docType === 'transfer' ||
            ['transfer_in', 'transfer_out', 'transfer_reversal'].includes(d.action) ||
            String(d.grnId || '').startsWith('TRN-') ||
            String(d.transferId || '').startsWith('TRN-'),
        },
        {
          collection: 'staged_floor_materials',
          labelAr: 'خامات الصالة المحولة',
          labelEn: 'Staged floor materials from transfers',
          predicate: (d) => Boolean(d.transferId) || String(d.id || '').startsWith('TRN-'),
        },
        ...makeCollabCascadeRules(['stock_transfers', 'transfers'], ['transfers'], ['TRN-']),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  if (moduleId === 'materials' && tabId === 'stock') {
    return {
      primaryCollections: ['stock_ledger', 'stock_transfers', 'transfers'],
      cascadeRules: [
        ...makeCollabCascadeRules(['stock_ledger', 'stock_transfers', 'transfers'], ['stock', 'transfers'], ['TRN-', 'OB-']),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  if (moduleId === 'materials' && tabId === 'stock_count') {
    return {
      primaryCollections: ['stock_counts'],
      cascadeRules: [
        {
          collection: 'goods_receipts',
          labelAr: 'سندات التسوية الجردية (ADJ-*)',
          labelEn: 'Stock count adjustment vouchers (ADJ-*)',
          predicate: isAdjReconciliationDoc,
        },
        {
          collection: 'stock_ledger',
          labelAr: 'حركات فروقات الجرد في كارت الصنف',
          labelEn: 'Inventory variance movements in stock_ledger',
          predicate: (d) =>
            d.docType === 'inventory_reconciliation' ||
            Boolean(d.sessionId) ||
            Boolean(d.isDirectAdjustment) ||
            [
              'reconciliation_surplus',
              'reconciliation_deficit',
              'direct_adjustment_surplus',
              'direct_adjustment_deficit',
            ].includes(d.action) ||
            String(d.grnId || '').startsWith('ADJ-'),
        },
        {
          collection: 'journal_entries',
          labelAr: 'قيود فروقات الجرد',
          labelEn: 'Inventory variance journal entries',
          predicate: (d, docId) =>
            d.sourceCollection === 'stock_counts' ||
            String(docId || d.id || '').startsWith('JE-ADJ-') ||
            String(d.sourceDocId || '').startsWith('ADJ-') ||
            String(d.sourceDocId || '').startsWith('STK-'),
        },
        ...makeCollabCascadeRules(['stock_counts'], ['stock_count'], ['STK-', 'ADJ-']),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  if (moduleId === 'materials' && tabId === 'spare_parts_issue') {
    return {
      primaryCollections: ['spare_parts_issues'],
      cascadeRules: [
        {
          collection: 'stock_ledger',
          labelAr: 'حركات صرف وعكس قطع الغيار',
          labelEn: 'Spare parts deduction entries in stock_ledger',
          predicate: (d) =>
            ['spare_parts_issue', 'spare_parts_reversal'].includes(d.docType) ||
            ['spare_parts_consumption', 'spare_parts_reversal'].includes(d.action) ||
            String(d.grnId || '').startsWith('XISS-') ||
            String(d.grnId || '').startsWith('REV-XISS-'),
        },
        {
          collection: 'journal_entries',
          labelAr: 'قيود مصروفات قطع الغيار',
          labelEn: 'Spare parts expense journal entries',
          predicate: (d) =>
            d.sourceCollection === 'spare_parts_issues' ||
            String(d.sourceDocId || d.referenceNumber || '').startsWith('XISS-'),
        },
        ...makeCollabCascadeRules(['spare_parts_issues'], ['spare_parts_issue'], ['XISS-', 'REV-XISS-']),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  // PRODUCTION MODULE TABS
  if (moduleId === 'production' && (tabId === 'work_orders' || tabId === 'production_reports')) {
    return {
      primaryCollections: [
        'work_orders',
        'production_work_orders',
        'staged_floor_pallets',
        'staged_floor_materials',
        'production_breaks',
        'production_shifts',
      ],
      cascadeRules: [
        {
          collection: 'production_transformations',
          labelAr: 'حركات استهلاك الخامات وتصنيع الباليتات',
          labelEn: 'Work order & pallet transformation records',
          predicate: (d, docId) => {
            const idStr = String(docId || d.id || '');
            return (
              idStr.startsWith('TRANS-PAL-') ||
              idStr.startsWith('TRANS-WO-') ||
              Boolean(d.workOrderId) ||
              Boolean(d.palletId) ||
              !d.tankId
            );
          },
        },
        {
          collection: 'stock_transfers',
          labelAr: 'أذون ترحيل الباليتات ومرتجعات الهالك',
          labelEn: 'FG pallet transfers & floor scrap returns',
          predicate: (d, docId) => {
            const idStr = String(docId || d.id || '');
            return (
              Boolean(d.isFinishedGoods) ||
              ['finished_goods', 'floor_feeding', 'scrap_return'].includes(d.transferType) ||
              String(d.productionOrderRef || '').startsWith('MO-') ||
              idStr.startsWith('TRN-SCRAP') ||
              idStr.startsWith('TRN-PALLET') ||
              idStr.startsWith('TRN-FG') ||
              (Array.isArray(d.lines) && d.lines.some((l) => Boolean(l.palletId) || Boolean(l.workOrderId)))
            );
          },
        },
        {
          collection: 'stock_ledger',
          labelAr: 'حركات استهلاك الإنتاج والهالك',
          labelEn: 'Production consumption & scrap entries',
          predicate: (d) =>
            Boolean(d.workOrderId) ||
            String(d.productionOrderRef || '').startsWith('MO-') ||
            ['production_consumption', 'scrap_return', 'floor_feeding'].includes(d.docType || d.action),
        },
        {
          collection: 'journal_entries',
          labelAr: 'قيود التكاليف والإنتاج لأوامر التشغيل',
          labelEn: 'Production cost journal entries',
          predicate: (d) =>
            d.sourceCollection === 'work_orders' ||
            String(d.sourceDocId || d.referenceNumber || '').startsWith('MO-'),
        },
        ...makeCollabCascadeRules(
          ['work_orders', 'production_work_orders', 'staged_floor_pallets', 'staged_floor_materials'],
          ['work_orders', 'production_reports'],
          ['MO-', 'PAL-']
        ),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  if (moduleId === 'production' && tabId === 'liquid_tanks') {
    return {
      primaryCollections: ['liquid_tanks', 'shift_handovers', 'floor_liquid_vessels'],
      cascadeRules: [
        {
          collection: 'production_transformations',
          labelAr: 'سجلات التحويل الداخلي للتانكات',
          labelEn: 'Tank transformation records',
          predicate: (d, docId) =>
            Boolean(d.tankId) ||
            String(docId || d.id || '').startsWith('TRANS-TANK-') ||
            String(docId || d.id || '').startsWith('TRANS-BATCH-') ||
            String(d.lotNumber || '').startsWith('TANK-'),
        },
        {
          collection: 'stock_transfers',
          labelAr: 'أذون الضخ عبر خطوط الأنابيب',
          labelEn: 'Pipeline transfers (TRN-PIPE-*)',
          predicate: (d, docId) =>
            Boolean(d.isPipelineTransfer) || Boolean(d.tankId) || String(docId || d.id || '').startsWith('TRN-PIPE-'),
        },
        ...makeCollabCascadeRules(
          ['liquid_tanks', 'shift_handovers'],
          ['liquid_tanks', 'liquid_storage'],
          ['TANK-', 'BATCH-', 'TRN-PIPE-']
        ),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  if (moduleId === 'production' && tabId === 'liquid_storage') {
    return {
      primaryCollections: ['floor_liquid_vessels'],
      cascadeRules: [
        {
          collection: 'stock_transfers',
          labelAr: 'أذون الضخ عبر خطوط الأنابيب',
          labelEn: 'Pipeline transfers (TRN-PIPE-*)',
          predicate: (d, docId) =>
            Boolean(d.isPipelineTransfer) || Boolean(d.tankId) || String(docId || d.id || '').startsWith('TRN-PIPE-'),
        },
        ...makeCollabCascadeRules(
          ['floor_liquid_vessels', 'liquid_tanks'],
          ['liquid_storage', 'liquid_tanks'],
          ['TANK-', 'TRN-PIPE-']
        ),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  if (moduleId === 'production' && tabId === 'faulty_fg') {
    return {
      primaryCollections: ['faulty_fg_returns'],
      cascadeRules: [
        {
          collection: 'work_orders',
          labelAr: 'أوامر إعادة التشغيل الناتجة عن المعيب',
          labelEn: 'Rework work orders from Faulty FG',
          predicate: (d) =>
            Boolean(d.isRework) || (Array.isArray(d.reworkSourceVouchers) && d.reworkSourceVouchers.length > 0),
        },
        {
          collection: 'production_work_orders',
          labelAr: 'سجلات إعادة التشغيل المرتبطة',
          labelEn: 'Linked rework records',
          predicate: (d) =>
            Boolean(d.isRework) || (Array.isArray(d.reworkSourceVouchers) && d.reworkSourceVouchers.length > 0),
        },
        ...makeCollabCascadeRules(['faulty_fg_returns'], ['faulty_fg'], ['RTN-FG-']),
      ],
      recalculate: {},
    };
  }

  if (moduleId === 'production' && tabId === 'fg_inward') {
    return {
      primaryCollections: ['fg_receipts'],
      cascadeRules: [
        {
          collection: 'stock_transfers',
          labelAr: 'أذون استلام وترحيل باليتات المنتج التام',
          labelEn: 'FG pallet inward transfers',
          predicate: (d, docId) => {
            const idStr = String(docId || d.id || '');
            return (
              Boolean(d.isFinishedGoods) ||
              d.transferType === 'finished_goods' ||
              idStr.startsWith('TRN-FG') ||
              idStr.startsWith('TRN-PALLET') ||
              (Array.isArray(d.lines) && d.lines.some((l) => Boolean(l.palletId)))
            );
          },
        },
        {
          collection: 'staged_floor_pallets',
          labelAr: 'حالة الباليتات المرحّلة للمستودع',
          labelEn: 'Staged pallets linked to FG inward receipts',
          predicate: (d) =>
            Boolean(d.fgReceiptId || d.transferId || d.transferredAt) ||
            ['received_in_warehouse', 'transferred_to_fg'].includes(d.status),
        },
        ...makeCollabCascadeRules(['fg_receipts', 'stock_transfers'], ['fg_inward'], ['FGR-', 'TRN-FG', 'TRN-PALLET']),
      ],
      recalculate: { recalcItemsStock: true },
    };
  }

  if (moduleId === 'production' && tabId === 'fg_balances') {
    return {
      primaryCollections: ['fg_receipts', 'faulty_fg_returns', 'truck_dispatches', 'dispatch_documents'],
      cascadeRules: [
        {
          collection: 'sales_orders',
          labelAr: 'أوامر البيع والرحلات المؤثرة على رصيد التام',
          labelEn: 'Trip-linked sales orders affecting FG balances',
          predicate: isTripLinkedOrder,
        },
        ...makeCollabCascadeRules(
          ['fg_receipts', 'faulty_fg_returns', 'truck_dispatches', 'dispatch_documents'],
          ['fg_balances', 'fg_inward', 'faulty_fg', 'truck_dispatch'],
          ['FGR-', 'RTN-FG-', 'LO-', 'DD-']
        ),
      ],
      recalculate: {},
    };
  }

  // FINANCE MODULE TABS
  if (moduleId === 'finance' && tabId === 'cash_safes') {
    return {
      primaryCollections: [
        'cash_safes',
        'cash_transactions',
        'custody_ledger',
        'custody_advance_drafts',
        'custodies_and_advances',
        'cash_count_sessions',
      ],
      cascadeRules: [
        {
          collection: 'journal_entries',
          labelAr: 'قيود اليومية لسندات الخزائن والعهد والجرد',
          labelEn: 'Journal entries for cash vouchers, custodies & audits',
          predicate: (d, docId) => {
            const idStr = String(docId || d.id || '');
            const refStr = String(d.sourceDocId || d.referenceNumber || '');
            return (
              ['cash_transactions', 'custody_ledger', 'cash_count_sessions', 'custodies_and_advances'].includes(
                d.sourceCollection
              ) ||
              ['cash_receipt', 'cash_disbursement', 'custody_advance', 'custody_liquidation', 'cash_audit', 'safe_transfer'].includes(
                d.originType
              ) ||
              idStr.startsWith('JE-VCH-') ||
              idStr.startsWith('JE-LIQ-') ||
              idStr.startsWith('JE-CSH-') ||
              refStr.startsWith('VCH-') ||
              refStr.startsWith('ADV-') ||
              refStr.startsWith('LIQ-')
            );
          },
        },
        {
          collection: 'dues_settlements',
          labelAr: 'تسويات الاستحقاقات المسددة عبر الخزينة',
          labelEn: 'Dues settlements paid via safes',
          predicate: (d) => Boolean(d.voucherId || d.cashTransactionId || d.safeId),
        },
        {
          collection: 'dues_batches',
          labelAr: 'حافظات السداد المرتبطة بسندات الصرف',
          labelEn: 'Dues batches linked to cash vouchers',
          predicate: () => true,
        },
        ...makeCollabCascadeRules(
          ['cash_safes', 'cash_transactions', 'custody_ledger', 'custody_advance_drafts', 'cash_count_sessions'],
          ['cash_safes', 'cash_safes_hub', 'custodies_advances'],
          ['VCH-', 'ADV-', 'LIQ-', 'CSH-']
        ),
      ],
      recalculate: { recalcSafesAndBanks: true },
    };
  }

  if (moduleId === 'finance' && tabId === 'banks') {
    return {
      primaryCollections: ['corporate_banks', 'bank_accounts'],
      cascadeRules: [
        {
          collection: 'cash_transactions',
          labelAr: 'حركات البنوك والشيكات في سجل السيولة',
          labelEn: 'Bank & cheque transactions',
          predicate: (d) => Boolean(d.bankId || d.bankAccountId),
        },
        {
          collection: 'journal_entries',
          labelAr: 'قيود الحركات البنكية والشيكات',
          labelEn: 'Bank & cheque journal entries',
          predicate: (d) =>
            Boolean(d.bankId || d.bankAccountId) ||
            ['corporate_banks', 'bank_accounts'].includes(d.sourceCollection),
        },
        {
          collection: 'dues_settlements',
          labelAr: 'تسويات الاستحقاقات البنكية',
          labelEn: 'Bank dues settlements',
          predicate: (d) => Boolean(d.bankId || d.bankAccountId),
        },
        ...makeCollabCascadeRules(
          ['corporate_banks', 'bank_accounts', 'cash_transactions'],
          ['banks', 'bank_accounts'],
          ['BNK-', 'CHQ-']
        ),
      ],
      recalculate: { recalcSafesAndBanks: true },
    };
  }

  if (moduleId === 'finance' && tabId === 'dues_tracking') {
    return {
      primaryCollections: ['dues_settlements', 'dues_batches', 'wht_notes'],
      cascadeRules: [
        {
          collection: 'cash_transactions',
          labelAr: 'سندات الخزينة المنشأة من شاشة الاستحقاقات',
          labelEn: 'Auto-created cash/bank vouchers from Dues Tracking',
          predicate: (d) =>
            d.originModule === 'dues_tracking' ||
            Boolean(d.duesBatchId || d.duesSettlementId) ||
            (Array.isArray(d.linkedDocs) && d.linkedDocs.length > 0),
        },
        {
          collection: 'journal_entries',
          labelAr: 'قيود الاستحقاقات وشهادات الخصم 1%',
          labelEn: 'Dues & WHT journal entries',
          predicate: (d, docId) => {
            const idStr = String(docId || d.id || '');
            const refStr = String(d.sourceDocId || d.referenceNumber || '');
            return (
              ['dues_settlements', 'dues_batches', 'wht_notes'].includes(d.sourceCollection) ||
              d.originType === 'dues_settlement' ||
              Boolean(d.duesBatchId) ||
              idStr.startsWith('JE-WHT-') ||
              idStr.startsWith('JE-DUE-') ||
              refStr.startsWith('WHT-') ||
              refStr.startsWith('BAT-')
            );
          },
        },
        ...makeCollabCascadeRules(['dues_settlements', 'dues_batches', 'wht_notes'], ['dues_tracking'], ['WHT-', 'BAT-']),
      ],
      recalculate: { recalcSafesAndBanks: true },
    };
  }

  if (moduleId === 'finance' && tabId === 'party_statements') {
    return {
      primaryCollections: [
        'goods_receipts',
        'sales_orders',
        'cash_transactions',
        'journal_entries',
        'dues_settlements',
        'dues_batches',
        'wht_notes',
      ],
      cascadeRules: [
        ...makeCollabCascadeRules(
          ['goods_receipts', 'sales_orders', 'cash_transactions', 'journal_entries', 'dues_settlements'],
          ['party_statements'],
          ['GRN-', 'RTN-', 'SO-', 'VCH-', 'JE-']
        ),
      ],
      recalculate: { recalcItemsStock: true, recalcSafesAndBanks: true },
    };
  }

  if (moduleId === 'finance' && (tabId === 'accounts' || tabId === 'financial_statements')) {
    return {
      primaryCollections: ['chart_of_accounts', 'journal_entries'],
      cascadeRules: [
        ...makeCollabCascadeRules(['chart_of_accounts', 'journal_entries'], ['accounts', 'financial_statements'], ['JE-']),
      ],
      recalculate: {},
    };
  }

  // SALES MODULE TABS
  if (moduleId === 'sales' && (tabId === 'sales_orders' || tabId === 'loading_plan')) {
    return {
      primaryCollections: ['sales_orders', 'truck_dispatches', 'dispatch_documents'],
      cascadeRules: [
        {
          collection: 'journal_entries',
          labelAr: 'قيود اليومية المرتبطة بأوامر البيع',
          labelEn: 'Journal entries linked to Sales Orders',
          predicate: isSalesLinkedJe,
        },
        {
          collection: 'cash_transactions',
          labelAr: 'سندات التحصيل المرتبطة بأوامر البيع',
          labelEn: 'Cash/bank vouchers linked to Sales Orders',
          predicate: isSalesLinkedCash,
        },
        {
          collection: 'dues_settlements',
          labelAr: 'تسويات عملاء مرتبطة بأوامر البيع',
          labelEn: 'Client dues settlements linked to Sales Orders',
          predicate: isSalesLinkedDues,
        },
        {
          collection: 'wht_notes',
          labelAr: 'إشعارات الخصم المرتبطة بأوامر البيع',
          labelEn: 'WHT notes linked to Sales Orders',
          predicate: isSalesLinkedWht,
        },
        ...makeCollabCascadeRules(
          ['sales_orders', 'truck_dispatches', 'dispatch_documents'],
          ['sales_orders', 'loading_plan', 'truck_dispatch'],
          ['SO-', 'LO-', 'DD-', 'RET-']
        ),
      ],
      recalculate: { recalcSafesAndBanks: true },
      noteAr:
        tabId === 'loading_plan'
          ? 'تشارك خطة التحميل جدول أوامر البيع والرحلات (sales_orders + truck_dispatches + dispatch_documents) مع روابطها المالية والتعليقات.'
          : undefined,
      noteEn:
        tabId === 'loading_plan'
          ? 'Loading Plan shares sales_orders, truck_dispatches & dispatch_documents along with their financial links and comments.'
          : undefined,
    };
  }

  if (moduleId === 'sales' && tabId === 'truck_dispatch') {
    return {
      primaryCollections: ['truck_dispatches', 'dispatch_documents'],
      cascadeRules: [
        {
          collection: 'sales_orders',
          labelAr: 'أوامر البيع المسكّنة والمرتبطة بالرحلات والزيادات',
          labelEn: 'Trip-linked & post-dispatch settlement sales orders',
          predicate: isTripLinkedOrder,
        },
        ...makeCollabCascadeRules(
          ['truck_dispatches', 'dispatch_documents'],
          ['truck_dispatch'],
          ['LO-', 'DD-', 'RET-']
        ),
      ],
      recalculate: {},
    };
  }

  if (moduleId === 'sales' && tabId === 'sales_invoicing') {
    return {
      primaryCollections: ['sales_invoices'],
      cascadeRules: [
        ...makeCollabCascadeRules(
          ['sales_invoices', 'sales_orders'],
          ['sales_invoicing'],
          ['INV-', 'PL-', 'DN-', 'SO-']
        ),
      ],
      recalculate: {},
    };
  }

  if (moduleId === 'sales' && tabId === 'price_lists') {
    return {
      primaryCollections: ['price_lists', 'pricing_strategies'],
      cascadeRules: [...makeCollabCascadeRules(['price_lists', 'pricing_strategies'], ['price_lists'], ['PL-'])],
      recalculate: {},
    };
  }

  if (moduleId === 'sales' && tabId === 'client_contracts') {
    return {
      primaryCollections: ['client_contracts'],
      cascadeRules: [...makeCollabCascadeRules(['client_contracts'], ['client_contracts'], ['CNT-'])],
      recalculate: {},
    };
  }

  // MASTER DATA & DYNAMIC FALLBACK TABS
  if (moduleId === 'master_data' && (tabId === 'users' || tabId === 'employees')) {
    return {
      primaryCollections: ['users', 'employees'],
      cascadeRules: [...makeCollabCascadeRules(['users', 'employees'], ['users', 'employees'], ['USR-', 'EMP-'])],
      recalculate: {},
    };
  }

  return {
    primaryCollections: fallbackCols,
    cascadeRules: fallbackCols.length > 0 ? makeCollabCascadeRules(fallbackCols, [tabId], []) : [],
    recalculate: {},
  };
}

/**
 * Resolves exact collections and predicates for System-Wide, Module, or Tab rollback
 * under the Always-Full-Relational-Cascade policy.
 */
export function resolveRestoreScopePlan({ scopeType = 'system', moduleId = '', tabId = '', architecture = APP_ARCHITECTURE } = {}) {
  const safeScopeType = ['system', 'module', 'tab'].includes(scopeType) ? scopeType : 'system';

  if (safeScopeType === 'system') {
    const allCols = getAllSystemRestoreCollections(architecture);
    return {
      scopeType: 'system',
      moduleId: '',
      tabId: '',
      scopeLabelAr: 'النظام بالكامل (كافة الموديولات والبيانات الأساسية)',
      scopeLabelEn: 'Full System-Wide Restore (All Modules & Master Data)',
      entries: allCols.map((col) => ({
        collection: col,
        mode: 'full',
        isPrimary: true,
        predicates: [],
        labelsAr: [],
        labelsEn: [],
      })),
      recalculate: {},
    };
  }

  const mergeEntryDefs = (defs = []) => {
    const entryMap = new Map();
    let recalcItemsStock = false;
    let recalcSafesAndBanks = false;

    const ensure = (coll) => {
      if (!coll || RESTORE_INTERNAL_COLLECTIONS.has(coll) || VIRTUAL_NON_COLLECTIONS.has(coll)) return null;
      if (!entryMap.has(coll)) {
        entryMap.set(coll, {
          collection: coll,
          mode: 'predicate',
          isPrimary: false,
          predicates: [],
          labelsAr: [],
          labelsEn: [],
        });
      }
      return entryMap.get(coll);
    };

    defs.forEach((def) => {
      (def.primaryCollections || []).forEach((col) => {
        const entry = ensure(col);
        if (!entry) return;
        entry.mode = 'full';
        entry.isPrimary = true;
      });
      (def.cascadeRules || []).forEach((rule) => {
        const entry = ensure(rule.collection);
        if (!entry) return;
        if (rule.isPrimary) entry.isPrimary = true;
        if (entry.mode !== 'full' && typeof rule.predicate === 'function') {
          entry.predicates.push(rule.predicate);
        }
        if (rule.labelAr && !entry.labelsAr.includes(rule.labelAr)) entry.labelsAr.push(rule.labelAr);
        if (rule.labelEn && !entry.labelsEn.includes(rule.labelEn)) entry.labelsEn.push(rule.labelEn);
      });
      if (def.recalculate?.recalcItemsStock) recalcItemsStock = true;
      if (def.recalculate?.recalcSafesAndBanks) recalcSafesAndBanks = true;
    });

    const entries = Array.from(entryMap.values()).filter(
      (e) => e.mode === 'full' || (Array.isArray(e.predicates) && e.predicates.length > 0)
    );

    const isFullCol = (c) => entryMap.get(c)?.mode === 'full';
    if (recalcItemsStock && isFullCol('items') && isFullCol('stock_ledger')) {
      recalcItemsStock = false;
    }
    if (
      recalcSafesAndBanks &&
      isFullCol('cash_safes') &&
      isFullCol('corporate_banks') &&
      isFullCol('cash_transactions')
    ) {
      recalcSafesAndBanks = false;
    }

    // Sort primary full collections first, then primary predicate, then cascade collections
    entries.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.mode !== b.mode) return a.mode === 'full' ? -1 : 1;
      return a.collection.localeCompare(b.collection);
    });

    return {
      entries,
      recalculate: { recalcItemsStock, recalcSafesAndBanks },
    };
  };

  if (safeScopeType === 'module') {
    const mod = architecture?.modules?.[moduleId];
    if (!mod) {
      throw new Error(`Unknown restore moduleId: ${moduleId}`);
    }
    const defs = Object.keys(mod.tabs || {}).map((tId) => buildTabRelationalDefinition(moduleId, tId, architecture));
    const { entries, recalculate } = mergeEntryDefs(defs);
    return {
      scopeType: 'module',
      moduleId,
      tabId: '',
      scopeLabelAr: `موديول: ${mod.labelAr || moduleId} (شامل الارتباطات التلقائية)`,
      scopeLabelEn: `Module: ${mod.labelEn || moduleId} (Full Relational Cascade)`,
      entries,
      recalculate,
    };
  }

  // safeScopeType === 'tab'
  const mod = architecture?.modules?.[moduleId];
  const tab = mod?.tabs?.[tabId];
  if (!mod || !tab) {
    throw new Error(`Unknown restore tabId "${tabId}" in module "${moduleId}"`);
  }
  const def = buildTabRelationalDefinition(moduleId, tabId, architecture);
  const { entries, recalculate } = mergeEntryDefs([def]);
  return {
    scopeType: 'tab',
    moduleId,
    tabId,
    scopeLabelAr: `تبويب: ${tab.labelAr || tabId} (${mod.labelAr || moduleId}) — استعادة مترابطة`,
    scopeLabelEn: `Tab: ${tab.labelEn || tabId} (${mod.labelEn || moduleId}) — Relational Cascade`,
    noteAr: def.noteAr,
    noteEn: def.noteEn,
    entries,
    recalculate,
  };
}

// =========================================================================
// PREDICATE-SCOPED DIFF PREVIEW ENGINE
// =========================================================================

function safePredicateCall(predFn, docData, docId) {
  try {
    return Boolean(predFn(docData || {}, docId));
  } catch {
    return false;
  }
}

function docWithoutMetaId(docObj) {
  const clone = { ...docObj };
  delete clone._docId;
  return serializeRestoreValue(clone);
}

/**
 * Computes exact per-collection Create / Update / Delete / Unchanged / UntouchedOther sets
 * comparing snapshot documents vs current live Firestore documents.
 */
export function computeRestoreDiffPlan({
  scopePlan,
  snapshotMeta = null,
  snapshotDocsByCollection = {},
  liveDocsByCollection = {},
} = {}) {
  const entries = scopePlan?.entries || [];
  const diffEntries = [];
  const totals = {
    toCreate: 0,
    toUpdate: 0,
    toDelete: 0,
    unchanged: 0,
    untouchedOther: 0,
    skippedCollections: 0,
    collectionsAffected: 0,
    totalWriteOps: 0,
  };

  const manifestCollections = snapshotMeta?.collections || null;

  for (const entry of entries) {
    const coll = entry.collection;
    const liveList = Array.isArray(liveDocsByCollection[coll]) ? liveDocsByCollection[coll] : [];

    // Guard: if a legacy snapshot predates this collection, skip mutating it instead of wiping!
    if (manifestCollections && !Object.prototype.hasOwnProperty.call(manifestCollections, coll)) {
      totals.skippedCollections += 1;
      totals.unchanged += liveList.length;
      diffEntries.push({
        ...entry,
        skippedNotInSnapshot: true,
        toCreate: [],
        toUpdate: [],
        toDelete: [],
        unchangedCount: liveList.length,
        untouchedOtherCount: 0,
      });
      continue;
    }

    const snapList = Array.isArray(snapshotDocsByCollection[coll]) ? snapshotDocsByCollection[coll] : [];

    const snapMap = new Map();
    snapList.forEach((d) => {
      const id = String(d?._docId || d?.id || '').trim();
      if (id) snapMap.set(id, { ...d, _docId: id });
    });

    const liveMap = new Map();
    liveList.forEach((d) => {
      const id = String(d?._docId || d?.id || '').trim();
      if (id) liveMap.set(id, { ...d, _docId: id });
    });

    const toCreate = [];
    const toUpdate = [];
    const toDelete = [];
    let unchangedCount = 0;
    let untouchedOtherCount = 0;

    if (entry.mode === 'full') {
      snapMap.forEach((sDoc, id) => {
        if (!liveMap.has(id)) {
          toCreate.push(sDoc);
        } else {
          const lDoc = liveMap.get(id);
          if (JSON.stringify(docWithoutMetaId(sDoc)) !== JSON.stringify(docWithoutMetaId(lDoc))) {
            toUpdate.push(sDoc);
          } else {
            unchangedCount += 1;
          }
        }
      });
      liveMap.forEach((lDoc, id) => {
        if (!snapMap.has(id)) {
          toDelete.push(lDoc);
        }
      });
    } else {
      const preds = entry.predicates || [];
      const matchesScope = (d, id) => preds.some((fn) => safePredicateCall(fn, d, id));

      const snapMatchingIds = new Set();
      snapMap.forEach((sDoc, id) => {
        if (matchesScope(sDoc, id)) {
          snapMatchingIds.add(id);
        }
      });

      const liveMatchingIds = new Set();
      liveMap.forEach((lDoc, id) => {
        if (matchesScope(lDoc, id)) {
          liveMatchingIds.add(id);
        }
      });

      snapMatchingIds.forEach((id) => {
        const sDoc = snapMap.get(id);
        if (!liveMap.has(id)) {
          toCreate.push(sDoc);
        } else {
          const lDoc = liveMap.get(id);
          if (JSON.stringify(docWithoutMetaId(sDoc)) !== JSON.stringify(docWithoutMetaId(lDoc))) {
            toUpdate.push(sDoc);
          } else {
            unchangedCount += 1;
          }
        }
      });

      liveMatchingIds.forEach((id) => {
        if (!snapMatchingIds.has(id)) {
          toDelete.push(liveMap.get(id));
        }
      });

      liveMap.forEach((_, id) => {
        if (!snapMatchingIds.has(id) && !liveMatchingIds.has(id)) {
          untouchedOtherCount += 1;
        }
      });
    }

    const writeOps = toCreate.length + toUpdate.length + toDelete.length;
    if (writeOps > 0) totals.collectionsAffected += 1;
    totals.toCreate += toCreate.length;
    totals.toUpdate += toUpdate.length;
    totals.toDelete += toDelete.length;
    totals.unchanged += unchangedCount;
    totals.untouchedOther += untouchedOtherCount;
    totals.totalWriteOps += writeOps;

    diffEntries.push({
      ...entry,
      skippedNotInSnapshot: false,
      toCreate,
      toUpdate,
      toDelete,
      unchangedCount,
      untouchedOtherCount,
    });
  }

  return {
    scopePlan,
    entries: diffEntries,
    totals,
    recalculate: scopePlan?.recalculate || { recalcItemsStock: false, recalcSafesAndBanks: false },
  };
}

// =========================================================================
// RETENTION PRUNING, ORPHAN BLOB GC & DATE/TIME MATCHING
// =========================================================================

export function formatLocalDateKey(ms = Date.now()) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Evaluates retention rules:
 * - Always keeps `pinned === true` and `kind === 'manual'`
 * - Keeps latest `keepSafetyPointsCount` (default 8) safety (`pre_restore` / `pre_purge`) checkpoints
 * - Keeps all intra-day (`auto`) snapshots within `intraDayRetentionHours` (default 12h)
 * - Keeps 1 daily anchor per local date within `dailyRetentionDays` (default 14d)
 * - Collects ONLY blob hashes not referenced by ANY surviving restore point
 */
export function computeRetentionPruningPlan({
  restorePoints = [],
  allBlobHashes = [],
  config = DEFAULT_RESTORE_CONFIG,
  nowMs = Date.now(),
} = {}) {
  const cfg = { ...DEFAULT_RESTORE_CONFIG, ...(config || {}) };
  const intraWindowMs = Math.max(1, Number(cfg.intraDayRetentionHours || 12)) * 3600 * 1000;
  const dailyWindowMs = Math.max(1, Number(cfg.dailyRetentionDays || 14)) * 24 * 3600 * 1000;
  const maxSafety = Math.max(1, Number(cfg.keepSafetyPointsCount || 8));

  const sortedDesc = [...(Array.isArray(restorePoints) ? restorePoints : [])].sort(
    (a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)
  );

  const keepSet = new Set();

  // 1. Pinned & Manual checkpoints never expire automatically
  sortedDesc.forEach((p) => {
    if (p.pinned === true || p.kind === 'manual') {
      keepSet.add(p.id);
    }
  });

  // 2. Safety checkpoints (pre_restore / pre_purge): keep latest maxSafety AND any within dailyWindowMs
  let safetyKept = 0;
  sortedDesc.forEach((p) => {
    if (p.kind === 'pre_restore' || p.kind === 'pre_purge') {
      const age = nowMs - Number(p.createdAtMs || 0);
      if (safetyKept < maxSafety || age <= dailyWindowMs) {
        keepSet.add(p.id);
        safetyKept += 1;
      }
    }
  });

  // 3. Intra-day auto points within intraDayRetentionHours
  sortedDesc.forEach((p) => {
    if (p.kind === 'auto') {
      const age = nowMs - Number(p.createdAtMs || 0);
      if (age <= intraWindowMs) {
        keepSet.add(p.id);
      }
    }
  });

  // 4. Daily anchors (preferring `daily` kind first, else newest checkpoint of that day) within dailyRetentionDays
  const dailyAnchorByDate = new Map();
  // Pass 1: explicit daily points first
  sortedDesc.forEach((p) => {
    if (p.kind !== 'daily') return;
    const ms = Number(p.createdAtMs || 0);
    if (nowMs - ms > dailyWindowMs) return;
    const dateKey = p.localDateKey || formatLocalDateKey(ms);
    if (!dailyAnchorByDate.has(dateKey)) {
      dailyAnchorByDate.set(dateKey, p.id);
    }
  });
  // Pass 2: newest auto point for any day in window without a daily anchor
  sortedDesc.forEach((p) => {
    if (p.kind !== 'auto') return;
    const ms = Number(p.createdAtMs || 0);
    if (nowMs - ms > dailyWindowMs) return;
    const dateKey = p.localDateKey || formatLocalDateKey(ms);
    if (!dailyAnchorByDate.has(dateKey)) {
      dailyAnchorByDate.set(dateKey, p.id);
    }
  });
  dailyAnchorByDate.forEach((pid) => keepSet.add(pid));

  const keepPointIds = sortedDesc.filter((p) => keepSet.has(p.id)).map((p) => p.id);
  const deletePointIds = sortedDesc.filter((p) => !keepSet.has(p.id)).map((p) => p.id);

  // Collect every hash referenced by surviving restore points
  const referencedHashes = new Set();
  sortedDesc.forEach((p) => {
    if (!keepSet.has(p.id)) return;
    Object.values(p.collections || {}).forEach((meta) => {
      if (meta?.sha256) referencedHashes.add(meta.sha256);
    });
  });

  const orphanBlobHashes = Array.from(new Set(allBlobHashes || [])).filter(
    (hash) => hash && !referencedHashes.has(hash)
  );

  return {
    keepPointIds,
    deletePointIds,
    referencedHashes: Array.from(referencedHashes),
    orphanBlobHashes,
  };
}

/**
 * Matches a chosen target date/time (epoch ms) to the exact or latest preceding snapshot.
 */
export function findNearestRestorePointForDateTime(restorePoints = [], targetMs = Date.now()) {
  const list = [...(Array.isArray(restorePoints) ? restorePoints : [])]
    .filter((p) => Number.isFinite(Number(p?.createdAtMs)))
    .sort((a, b) => Number(b.createdAtMs) - Number(a.createdAtMs));

  if (list.length === 0) {
    return { point: null, matchType: 'none', deltaMs: 0 };
  }

  const target = Number(targetMs);
  for (const p of list) {
    const pMs = Number(p.createdAtMs);
    if (pMs === target) {
      return { point: p, matchType: 'exact', deltaMs: 0 };
    }
    if (pMs < target) {
      return { point: p, matchType: 'preceding', deltaMs: target - pMs };
    }
  }

  const oldest = list[list.length - 1];
  return {
    point: oldest,
    matchType: 'earliest_available',
    deltaMs: Number(oldest.createdAtMs) - target,
  };
}
