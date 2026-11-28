/**
 * Pure Sales Invoicing Engine for Al-Tawoos ERP (Phase 1)
 *
 * Translates legacy TAWOOS_ERP accounting & invoicing business logic into clean,
 * deterministic pure functions (shared by React UI and Node verification):
 *  - Document requirement determination (Tawoos Tax, Private Label Tax, Delivery Note, Transformation Case)
 *  - Deterministic order invoice fingerprint & post-dispatch `Needs Revision` drift detection
 *  - Independent Tax (`Tawoos` + `PL`) vs Delivery Note (`DeliveryNote`) sequence health & gap audit (ignoring >= 100 jumps)
 *  - Strict Split-Load serial sharing validation (same Client + same Date + same DocType)
 *  - Monotonic per-serial revision detection (`v1`, `v2`, ...)
 *  - Full invoice & delivery note snapshot model builder (3-layer discount waterfall, bonus dilution,
 *    14% vs 0% VAT grouping, Cash Sales `بيع نقدي` guard, Hide Bonus toggle)
 */

import { isProductPrivateLabel } from './pricingEngine.js';
import { tafqeetArabic } from './tafqeet.js';
import { parseOrderSerialParts } from './salesOrderUtils.js';

export const DOC_TYPES = {
  TAWOOS: 'Tawoos',
  PL: 'PL',
  DELIVERY_NOTE: 'DeliveryNote',
};

export const SEQUENCE_TYPES = {
  TAX: 'tax',
  DN: 'dn',
};

const INELIGIBLE_ORDER_TYPES = new Set(['admin', 'collection']);

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

/**
 * Returns 'tax' for Tawoos & PL invoices, 'dn' for Delivery Notes.
 */
export function getSequenceTypeForDocType(docType) {
  return docType === DOC_TYPES.DELIVERY_NOTE ? SEQUENCE_TYPES.DN : SEQUENCE_TYPES.TAX;
}

/**
 * Normalizes a serial number string into clean token and numeric value.
 */
export function normalizeSerialNumber(raw) {
  const clean = String(raw ?? '')
    .trim()
    .replace(/^#/, '')
    .trim();
  if (!clean) {
    return { raw, clean: '', numeric: null, valid: false };
  }
  const digitsOnly = /^\d+$/.test(clean);
  const numeric = digitsOnly ? parseInt(clean, 10) : parseInt(clean.replace(/\D+/g, ''), 10);
  return {
    raw,
    clean,
    numeric: digitsOnly && Number.isFinite(numeric) && numeric > 0 ? numeric : null,
    valid: digitsOnly && Number.isFinite(numeric) && numeric > 0,
  };
}

/**
 * Determines whether a sales order is eligible for invoicing.
 * Excludes merged split child portions (`splitStatus === 'merged_on_parent'`),
 * canceled orders, and non-product admin/collection actions.
 */
export function isOrderInvoiceEligible(order) {
  if (!order || typeof order !== 'object') return false;
  if (order.splitStatus === 'merged_on_parent') return false;
  const conf = String(order.confirmationStatus || '').toLowerCase();
  const stat = String(order.status || '').toLowerCase();
  if (conf === 'canceled' || conf === 'cancelled') return false;
  if (stat === 'canceled' || stat === 'cancelled') return false;
  if (INELIGIBLE_ORDER_TYPES.has(String(order.orderType || '').toLowerCase())) {
    const lines = Array.isArray(order.lines) ? order.lines : [];
    if (lines.length === 0) return false;
  }
  return true;
}

function resolveLineIsPrivateLabel(line, productsMap = {}) {
  if (line && typeof line.isPrivateLabel === 'boolean') {
    return line.isPrivateLabel;
  }
  const prod = line?.productId ? productsMap?.[line.productId] : null;
  if (prod) return isProductPrivateLabel(prod);
  return false;
}

function resolveLineVatRateNum(line, isTaxable) {
  if (!isTaxable) return 0;
  const raw = line?.vatRate;
  if (raw === 0 || raw === '0' || raw === '0%') return 0;
  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '14').replace('%', ''));
  if (Number.isFinite(parsed)) return parsed;
  return 14;
}

/**
 * Checks active (non-voided, non-superseded) invoice docs for an order.
 */
export function filterActiveOrderDocs(docs = [], orderId = '') {
  return (docs || []).filter((d) => {
    if (!d) return false;
    if (orderId && d.orderId !== orderId) return false;
    const st = String(d.status || 'issued').toLowerCase();
    if (st === 'voided' || st === 'superseded') return false;
    if (d.isLatestVersion === false) return false;
    return true;
  });
}

/**
 * Determines which invoice/delivery-note documents are required for an order.
 * Supports:
 *  - Delivery Note only when `vatMode === 'none'`
 *  - Tax split across Tawoos and/or Private Label items when taxable
 *  - Transformation Case: keeps existing DeliveryNote visible alongside new Tax Invoice(s)
 */
export function determineInvoiceNeeds(order, productsMap = {}, existingDocs = []) {
  if (!isOrderInvoiceEligible(order)) {
    return {
      eligible: false,
      isTaxable: false,
      needsTawoos: false,
      needsPL: false,
      needsDN: false,
      hasExistingDN: false,
      isTransformationCase: false,
      tawoosItems: [],
      plItems: [],
      dnItems: [],
      requiredDocTypes: [],
    };
  }

  const lines = Array.isArray(order.lines)
    ? order.lines
    : Array.isArray(order.items)
      ? order.items
      : [];

  const vatMode = String(order.vatMode || 'none').trim();
  const isTaxable =
    (vatMode !== '' && vatMode !== 'none') ||
    order.orderType === 'invoice_only_with_tax';

  const orderActiveDocs = filterActiveOrderDocs(existingDocs, order.id);
  const hasActiveDnDoc = orderActiveDocs.some((d) => d.docType === DOC_TYPES.DELIVERY_NOTE);
  const hasStampedDn = Boolean(
    String(
      order.deliveryNoteNo ||
        order.invoicing?.deliveryNote?.serialNo ||
        ''
    ).trim()
  );
  const hasExistingDN = hasActiveDnDoc || hasStampedDn;

  if (!isTaxable) {
    return {
      eligible: true,
      isTaxable: false,
      needsTawoos: false,
      needsPL: false,
      needsDN: true,
      hasExistingDN,
      isTransformationCase: false,
      tawoosItems: [],
      plItems: [],
      dnItems: lines,
      requiredDocTypes: [DOC_TYPES.DELIVERY_NOTE],
    };
  }

  const tawoosItems = [];
  const plItems = [];
  lines.forEach((line) => {
    if (resolveLineIsPrivateLabel(line, productsMap)) {
      plItems.push(line);
    } else {
      tawoosItems.push(line);
    }
  });

  // Fallback for legacy summary-only orders without lines array
  const needsTawoos =
    tawoosItems.length > 0 || (lines.length === 0 && Boolean(order.hasTawoos));
  const needsPL =
    plItems.length > 0 || (lines.length === 0 && Boolean(order.hasPL));

  const isTransformationCase = (needsTawoos || needsPL) && hasExistingDN;
  const requiredDocTypes = [];
  if (needsTawoos) requiredDocTypes.push(DOC_TYPES.TAWOOS);
  if (needsPL) requiredDocTypes.push(DOC_TYPES.PL);

  return {
    eligible: true,
    isTaxable: true,
    needsTawoos,
    needsPL,
    needsDN: hasExistingDN,
    hasExistingDN,
    isTransformationCase,
    tawoosItems,
    plItems,
    dnItems: hasExistingDN ? lines : [],
    requiredDocTypes,
  };
}

/**
 * Deterministic canonical fingerprint of an order's billable content.
 * Changes whenever quantities, prices, discounts, VAT mode, client/branch,
 * POs, or line composition are edited post-dispatch or post-invoicing.
 */
export function computeOrderInvoiceFingerprint(order) {
  if (!order || typeof order !== 'object') return 'FP-00000000';
  const lines = Array.isArray(order.lines)
    ? order.lines
    : Array.isArray(order.items)
      ? order.items
      : [];

  const canonical = {
    clientId: String(order.clientId || ''),
    branchId: String(order.branchId || ''),
    orderType: String(order.orderType || 'supply'),
    vatMode: String(order.vatMode || 'none'),
    poTawoos: String(order.poTawoos || '').trim(),
    poPrivateLabel: String(order.poPrivateLabel || '').trim(),
    grandTotal: round2(order.grandTotal || 0),
    lines: lines.map((l) => ({
      productId: String(l.productId || ''),
      packaging: String(l.packagingOptionSuffix || l.packagingId || l.largeUnitName || ''),
      qty: Number(l.qty || 0),
      bonus: Number(l.bonus || 0),
      detectedUnitPrice: round2(l.detectedUnitPrice ?? l.unitPrice ?? 0),
      manualDiscountPerUnit: round2(l.manualDiscountPerUnit || 0),
      promoDiscountPct: round2(l.promoDiscountPct || 0),
      contractDiscountPct: round2(l.contractDiscountPct || 0),
      vatRate: String(l.vatRate ?? '14%'),
      isPrivateLabel: l.isPrivateLabel !== undefined ? Boolean(l.isPrivateLabel) : null,
    })),
  };

  const json = JSON.stringify(canonical);
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `FP-${hex1}${hex2}-${lines.length}`;
}

/**
 * Reconstructs active invoice descriptors directly from `order.invoicing` summary
 * stamped on `sales_orders/{orderId}` by `salesCommitInvoiceDocument`, allowing
 * Sales Orders and Loading Plan to evaluate invoice badges & fingerprint drift without
 * subscribing to the full `sales_invoices` collection.
 */
export function extractDocsFromOrderInvoicing(order) {
  if (!order || typeof order !== 'object') return [];
  const inv = order.invoicing || {};
  const docs = [];
  const pushEntry = (docType, entry, legacySerial) => {
    const serialNo = String(entry?.serialNo || legacySerial || '').trim();
    if (!serialNo) return;
    docs.push({
      docId: entry?.docId || '',
      orderId: order.id || '',
      docType,
      serialNo,
      version: Number(entry?.version || 1),
      invoiceDate: entry?.invoiceDate || order.invoiceDate || '',
      status: 'issued',
      isLatestVersion: true,
      sourceOrderFingerprint: entry?.sourceOrderFingerprint || '',
    });
  };
  pushEntry(DOC_TYPES.TAWOOS, inv.tawoos, order.invoiceNoTawoos);
  pushEntry(DOC_TYPES.PL, inv.pl, order.invoiceNoPL);
  pushEntry(DOC_TYPES.DELIVERY_NOTE, inv.deliveryNote, order.deliveryNoteNo);
  return docs;
}

/**
 * Evaluates full invoicing status of an order (`not_applicable`, `pending`,
 * `partial`, `needs_revision`, `invoiced`) including version & fingerprint drift checks.
 */
export function evaluateOrderInvoicingStatus(order, productsMap = {}, orderInvoices = []) {
  const activeDocs = filterActiveOrderDocs(orderInvoices, order?.id);
  const needs = determineInvoiceNeeds(order, productsMap, activeDocs);
  const currentFingerprint = computeOrderInvoiceFingerprint(order);

  const activeDocsByType = {};
  activeDocs.forEach((doc) => {
    const prev = activeDocsByType[doc.docType];
    if (!prev || Number(doc.version || 1) >= Number(prev.version || 1)) {
      activeDocsByType[doc.docType] = doc;
    }
  });

  if (!needs.eligible) {
    return {
      status: 'not_applicable',
      needs,
      currentFingerprint,
      needsRevision: false,
      revisionDocTypes: [],
      missingDocs: [],
      activeDocsByType,
      summaryBadges: [],
    };
  }

  const requiredTypes = needs.requiredDocTypes || [];
  const missingDocs = requiredTypes.filter((dt) => !activeDocsByType[dt]);

  const revisionDocTypes = [];
  Object.values(activeDocsByType).forEach((doc) => {
    if (
      doc?.sourceOrderFingerprint &&
      doc.sourceOrderFingerprint !== currentFingerprint
    ) {
      revisionDocTypes.push(doc.docType);
    }
  });
  const needsRevision = revisionDocTypes.length > 0;

  let status = 'pending';
  if (needsRevision) {
    status = 'needs_revision';
  } else if (requiredTypes.length > 0 && missingDocs.length === 0) {
    status = 'invoiced';
  } else if (requiredTypes.some((dt) => Boolean(activeDocsByType[dt]))) {
    status = 'partial';
  } else if (Object.keys(activeDocsByType).length > 0) {
    // Edge case: e.g. DN issued before switching VAT mode to Taxable (Transformation Case before Tax Invoice issued)
    status = missingDocs.length > 0 ? 'partial' : 'invoiced';
  }

  const summaryBadges = [];
  const prefixMap = {
    [DOC_TYPES.TAWOOS]: 'INV',
    [DOC_TYPES.PL]: 'PL',
    [DOC_TYPES.DELIVERY_NOTE]: 'DN',
  };
  [DOC_TYPES.TAWOOS, DOC_TYPES.PL, DOC_TYPES.DELIVERY_NOTE].forEach((dt) => {
    const doc = activeDocsByType[dt];
    if (doc) {
      summaryBadges.push({
        docType: dt,
        docId: doc.docId || doc.id || '',
        serialNo: doc.serialNo,
        version: Number(doc.version || 1),
        label: `${prefixMap[dt]}-${doc.serialNo}`,
        needsRevision:
          Boolean(doc.sourceOrderFingerprint) &&
          doc.sourceOrderFingerprint !== currentFingerprint,
      });
    }
  });

  return {
    status,
    needs,
    currentFingerprint,
    needsRevision,
    revisionDocTypes,
    missingDocs,
    activeDocsByType,
    summaryBadges,
  };
}

/**
 * Validates whether a proposed serial number can be committed for `candidate`.
 * Rules:
 *  - Independent sequences: Tax (`Tawoos` + `PL`) vs DeliveryNote (`DeliveryNote`)
 *  - Same `orderId` + same `docType`: allowed as version revision (`v(max + 1)`)
 *  - Same `orderId` + different `docType` (e.g., Tawoos and PL using same tax serial): BLOCKED
 *  - Different `orderId` + same sequence: BLOCKED UNLESS `isSplitLoad === true` AND
 *    every conflicting doc has the exact SAME `clientId`, SAME `invoiceDate`, and SAME `docType`.
 */
export function isValidSplitLoadShare(candidate, existingActiveDocs = []) {
  const {
    docType,
    serialNo,
    orderId = '',
    clientId = '',
    invoiceDate = '',
    isSplitLoad = false,
  } = candidate || {};

  const norm = normalizeSerialNumber(serialNo);
  if (!norm.clean) {
    return {
      allowed: false,
      reason: 'Serial number is required.',
      reasonAr: 'رقم المسلسل مطلوب.',
      isRevision: false,
      nextVersion: 1,
      isSplitLoadShare: false,
      conflictingDoc: null,
    };
  }

  const targetSeqType = getSequenceTypeForDocType(docType);
  const matchingDocs = (existingActiveDocs || []).filter((doc) => {
    if (!doc) return false;
    const st = String(doc.status || 'issued').toLowerCase();
    if (st === 'voided' || st === 'superseded') return false;
    const docSeqType = doc.sequenceType || getSequenceTypeForDocType(doc.docType);
    if (docSeqType !== targetSeqType) return false;
    const docNorm = normalizeSerialNumber(doc.serialNo);
    if (norm.valid && docNorm.valid) {
      return docNorm.numeric === norm.numeric;
    }
    return docNorm.clean.toLowerCase() === norm.clean.toLowerCase();
  });

  if (matchingDocs.length === 0) {
    return {
      allowed: true,
      reason: 'Available serial.',
      reasonAr: 'مسلسل متاح.',
      isRevision: false,
      nextVersion: 1,
      isSplitLoadShare: false,
      conflictingDoc: null,
    };
  }

  // Same order checks
  const sameOrderSameType = matchingDocs.filter(
    (d) => d.orderId === orderId && d.docType === docType
  );
  const sameOrderDiffType = matchingDocs.find(
    (d) => d.orderId === orderId && d.docType !== docType
  );
  if (sameOrderDiffType) {
    return {
      allowed: false,
      reason: `Serial #${norm.clean} is already used by ${sameOrderDiffType.docType} on this same order.`,
      reasonAr: `المسلسل #${norm.clean} مستخدم بالفعل في مستند ${sameOrderDiffType.docType} على نفس الطلب.`,
      isRevision: false,
      nextVersion: 1,
      isSplitLoadShare: false,
      conflictingDoc: sameOrderDiffType,
    };
  }

  const otherOrderDocs = matchingDocs.filter((d) => d.orderId !== orderId);
  if (sameOrderSameType.length > 0 && otherOrderDocs.length === 0) {
    const maxVer = Math.max(
      1,
      ...sameOrderSameType.map((d) => Number(d.version || 1))
    );
    return {
      allowed: true,
      reason: `Revision v${maxVer + 1} for existing serial #${norm.clean}.`,
      reasonAr: `إصدار مراجعة v${maxVer + 1} لنفس المسلسل #${norm.clean}.`,
      isRevision: true,
      nextVersion: maxVer + 1,
      isSplitLoadShare: false,
      conflictingDoc: null,
    };
  }

  // Different order checks -> strict split-load exception
  if (!isSplitLoad) {
    const first = otherOrderDocs[0];
    return {
      allowed: false,
      reason: `Duplicate serial #${norm.clean} already issued for order #${first.orderNo || first.orderId} (${first.clientName || first.clientId}). Enable Split-Load Share only if same Client + Date + Doc Type.`,
      reasonAr: `المسلسل #${norm.clean} مستخدم مسبقاً لأمر #${first.orderNo || first.orderId} (${first.clientName || first.clientId}). فعّل دمج التحميل فقط إذا تطابق العميل والتاريخ ونوع المستند.`,
      isRevision: false,
      nextVersion: 1,
      isSplitLoadShare: false,
      conflictingDoc: first,
    };
  }

  const mismatch = otherOrderDocs.find(
    (d) =>
      String(d.clientId || '') !== String(clientId || '') ||
      String(d.invoiceDate || '') !== String(invoiceDate || '') ||
      String(d.docType || '') !== String(docType || '')
  );

  if (mismatch) {
    return {
      allowed: false,
      reason: `Split-Load Share denied for #${norm.clean}: must match exact same Client, Invoice Date, and Document Type as order #${mismatch.orderNo || mismatch.orderId}.`,
      reasonAr: `مرفوض مشاركة المسلسل #${norm.clean}: يجب تطابق العميل وتاريخ الفاتورة ونوع المستند تماماً مع أمر #${mismatch.orderNo || mismatch.orderId}.`,
      isRevision: false,
      nextVersion: 1,
      isSplitLoadShare: false,
      conflictingDoc: mismatch,
    };
  }

  const sameOrderMaxVer =
    sameOrderSameType.length > 0
      ? Math.max(1, ...sameOrderSameType.map((d) => Number(d.version || 1)))
      : 0;

  return {
    allowed: true,
    reason: `Split-Load serial sharing verified for #${norm.clean}.`,
    reasonAr: `تم التحقق من مشاركة المسلسل للتحميل المجزأ #${norm.clean}.`,
    isRevision: sameOrderSameType.length > 0,
    nextVersion: sameOrderMaxVer > 0 ? sameOrderMaxVer + 1 : 1,
    isSplitLoadShare: true,
    conflictingDoc: null,
  };
}

function auditSingleSequence(docs = []) {
  const active = (docs || []).filter((d) => {
    if (!d) return false;
    const st = String(d.status || 'issued').toLowerCase();
    return st !== 'voided' && st !== 'superseded' && d.isLatestVersion !== false;
  });

  const numericEntries = [];
  const byNum = new Map();

  active.forEach((doc) => {
    const norm = normalizeSerialNumber(doc.serialNo);
    if (!norm.valid) return;
    numericEntries.push({ num: norm.numeric, doc });
    if (!byNum.has(norm.numeric)) byNum.set(norm.numeric, []);
    byNum.get(norm.numeric).push(doc);
  });

  const distinctNums = Array.from(byNum.keys()).sort((a, b) => a - b);
  const maxSerial = distinctNums.length > 0 ? distinctNums[distinctNums.length - 1] : 0;
  const minSerial = distinctNums.length > 0 ? distinctNums[0] : 0;
  const suggestedNextSerial = maxSerial + 1;

  // Non-blocking gaps (strictly ignore jumps >= 100)
  const gaps = [];
  for (let i = 1; i < distinctNums.length; i++) {
    const prev = distinctNums[i - 1];
    const curr = distinctNums[i];
    const diff = curr - prev;
    if (diff > 1 && diff < 100) {
      gaps.push({
        from: prev + 1,
        to: curr - 1,
        count: diff - 1,
      });
    }
  }

  // Flag duplicates across different orders unless valid split-load (same client + date + docType)
  const duplicates = [];
  byNum.forEach((group, num) => {
    if (group.length <= 1) return;
    const uniqueOrderIds = new Set(group.map((g) => g.orderId));
    if (uniqueOrderIds.size <= 1) return;
    const ref = group[0];
    const validSplit = group.every(
      (g) =>
        g.isSplitLoad === true &&
        g.clientId === ref.clientId &&
        g.invoiceDate === ref.invoiceDate &&
        g.docType === ref.docType
    );
    if (!validSplit) {
      duplicates.push({
        serialNo: num,
        orders: group.map((g) => ({
          orderId: g.orderId,
          orderNo: g.orderNo || g.orderId,
          clientName: g.clientName || '',
        })),
      });
    }
  });

  const recentHistory = [...active]
    .sort((a, b) => {
      const na = normalizeSerialNumber(a.serialNo).numeric || 0;
      const nb = normalizeSerialNumber(b.serialNo).numeric || 0;
      if (nb !== na) return nb - na;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    })
    .slice(0, 30);

  return {
    count: active.length,
    minSerial,
    maxSerial,
    suggestedNextSerial,
    gaps,
    duplicates,
    recentHistory,
  };
}

/**
 * Audits both independent sequences (`tax` and `dn`).
 */
export function auditInvoiceSequences(allActiveDocs = []) {
  const taxDocs = [];
  const dnDocs = [];
  (allActiveDocs || []).forEach((d) => {
    if (!d) return;
    const seqType = d.sequenceType || getSequenceTypeForDocType(d.docType);
    if (seqType === SEQUENCE_TYPES.DN) dnDocs.push(d);
    else taxDocs.push(d);
  });

  return {
    tax: auditSingleSequence(taxDocs),
    dn: auditSingleSequence(dnDocs),
  };
}

/**
 * Resolves a human-friendly vehicle name (never raw plate number).
 */
function resolveSafeTruckName(order = {}) {
  const name = String(order.assignedVehicleName || '').trim();
  const plate = String(order.assignedVehiclePlate || '').trim();
  if (name && name !== plate) return name;
  return order.assignedVehicleId || '';
}

/**
 * Builds the complete frozen invoice / delivery-note snapshot model.
 * Implements:
 *  - Cash Sales (`بيع نقدي`) guard when client tax card is blank on Tax Invoices
 *  - 3-layer discount waterfall (Promotional -> Contract -> Manual)
 *  - Bonus unit-price dilution keeping exact `grossLineTotal = qty * baseUnitPrice`
 *  - 14% vs 0% VAT grouping on Tax Invoices
 *  - Hide Bonus toggle on Delivery Notes
 */
export function buildInvoiceDocumentModel({
  order = {},
  docType = DOC_TYPES.TAWOOS,
  serialNo = '',
  invoiceDate = '',
  client = null,
  branch = null,
  productsMap = {},
  companyProfile = {},
  options = {},
} = {}) {
  const {
    lang = 'ar',
    hideBonus = false,
    cashSales = false,
    isSplitLoad = false,
    version = 1,
    revisionReason = '',
    notes = '',
  } = options || {};

  const isDN = docType === DOC_TYPES.DELIVERY_NOTE;
  const isTaxInvoice = docType === DOC_TYPES.TAWOOS || docType === DOC_TYPES.PL;
  const vatMode = String(order.vatMode || 'none').trim();
  const isTaxable = isTaxInvoice || (vatMode !== '' && vatMode !== 'none');
  const isInclusive = vatMode === 'inclusive' || vatMode === 'inclusive_wht';
  const isWhtApplicable =
    isTaxInvoice && (vatMode === 'exclusive_wht' || vatMode === 'inclusive_wht');

  const rawClientTaxCard = String(
    client?.taxCardNumber ||
      client?.taxCard ||
      client?.taxNumber ||
      client?.vatNumber ||
      order.clientTaxCard ||
      ''
  ).trim();

  const requiresCashSalesGuard = isTaxInvoice && !rawClientTaxCard;
  const effectiveCashSales = isTaxInvoice && Boolean(cashSales);

  const clientBranches = Array.isArray(client?.branches) ? client.branches : [];
  const matchedBranch =
    branch ||
    clientBranches.find((b) => (b.id || 'br_main') === order.branchId) ||
    clientBranches[0] ||
    null;

  const rawBuyerNameAr =
    client?.tradeNameAr || client?.nameAr || client?.name || order.clientName || '—';
  const rawBuyerNameEn =
    client?.tradeNameEn || client?.nameEn || client?.name || order.clientName || '—';
  const rawBranchName =
    matchedBranch?.nameAr || matchedBranch?.name || order.branchName || '';
  const rawAddress =
    matchedBranch?.address || order.shippingAddress || client?.address || '';

  const buyer = effectiveCashSales
    ? {
        nameAr: 'بيع نقدي',
        nameEn: 'Cash Sales',
        branchName: '',
        address: '',
        taxCard: '',
        commercialRegister: '',
        isCashSalesMasked: true,
      }
    : {
        nameAr: rawBuyerNameAr,
        nameEn: rawBuyerNameEn,
        branchName: rawBranchName,
        address: rawAddress,
        taxCard: rawClientTaxCard,
        commercialRegister: String(
          client?.commercialRegister || client?.crNumber || ''
        ).trim(),
        isCashSalesMasked: false,
      };

  const allLines = Array.isArray(order.lines)
    ? order.lines
    : Array.isArray(order.items)
      ? order.items
      : [];

  const filteredLines = allLines.filter((line) => {
    if (docType === DOC_TYPES.TAWOOS) {
      return !resolveLineIsPrivateLabel(line, productsMap);
    }
    if (docType === DOC_TYPES.PL) {
      return resolveLineIsPrivateLabel(line, productsMap);
    }
    return true;
  });

  const computedLines = filteredLines.map((line, idx) => {
    const prod = (line.productId && productsMap?.[line.productId]) || {};
    const qty = Math.max(0, Number(line.qty) || 0);
    const bonus = Math.max(0, Number(line.bonus) || 0);
    const totalQty = qty + bonus;

    const vatRatePct = resolveLineVatRateNum(line, isTaxable);
    const hasVat = vatRatePct > 0;

    // Resolve pre-VAT unit price from order line
    const rawUnitPrice = Number(line.detectedUnitPrice ?? line.unitPrice ?? 0);
    const preVatDetected =
      line.effectiveBaseUnitPrice !== undefined && Number(line.effectiveBaseUnitPrice) > 0
        ? Number(line.effectiveBaseUnitPrice)
        : isInclusive && hasVat
          ? rawUnitPrice / (1 + vatRatePct / 100)
          : rawUnitPrice;

    // 3-layer discount waterfall: Promotional -> Contract -> Manual
    const promoPct = Math.max(0, Number(line.promoDiscountPct || 0));
    const contractPct = Math.max(0, Number(line.contractDiscountPct || 0));
    const manualPerUnit = Math.max(0, Number(line.manualDiscountPerUnit || 0));

    // If order already baked promotional discount into `detectedUnitPrice`,
    // back out official baseline so Tax Invoice displays exact Promotional discount row cleanly
    let baseUnitPrice = preVatDetected;
    if (
      Boolean(line.isPromotional) &&
      promoPct > 0 &&
      promoPct < 100
    ) {
      baseUnitPrice =
        line.officialUnitPrice !== undefined && Number(line.officialUnitPrice) > 0
          ? isInclusive && hasVat
            ? Number(line.officialUnitPrice) / (1 + vatRatePct / 100)
            : Number(line.officialUnitPrice)
          : preVatDetected / (1 - promoPct / 100);
    }

    // Exact gross total strictly from paid `qty` * `baseUnitPrice` (no rounding drift)
    const grossLineTotal = round2(qty * baseUnitPrice);

    // Bonus unit-price dilution across total units (qty + bonus)
    const adjustedUnitPrice =
      totalQty > 0 ? grossLineTotal / totalQty : baseUnitPrice;

    // Waterfall Step 1: Promotional Discount
    const promotionalDiscountAmount =
      promoPct > 0 ? round2(grossLineTotal * (promoPct / 100)) : 0;
    const afterPromo = grossLineTotal - promotionalDiscountAmount;

    // Waterfall Step 2: Contract Discount
    const contractDiscountAmount =
      contractPct > 0 ? round2(afterPromo * (contractPct / 100)) : 0;
    const afterContract = afterPromo - contractDiscountAmount;

    // Waterfall Step 3: Manual Additional Discount (per paid unit)
    const manualDiscountAmount = round2(qty * manualPerUnit);
    const netAmount = Math.max(0, round2(afterContract - manualDiscountAmount));

    const vatAmount = isTaxable && hasVat ? round2(netAmount * (vatRatePct / 100)) : 0;
    const whtAmount = isWhtApplicable ? round2(netAmount * 0.01) : 0;
    const lineTotal = round2(netAmount + vatAmount - whtAmount);

    return {
      lineIndex: idx + 1,
      productId: line.productId || '',
      productCode: line.productCode || prod.code || '',
      barcode: line.barcode || prod.barcode || '',
      nameAr: line.productNameAr || prod.nameAr || line.productNameEn || '—',
      nameEn: line.productNameEn || prod.nameEn || line.productNameAr || '—',
      unitAr:
        line.packagingOptionNameAr && line.packagingOptionSuffix !== 'any'
          ? `${line.largeUnitName || prod.largeUnitName || 'كرتونة'} (${line.packagingOptionNameAr})`
          : line.unitAr || line.largeUnitName || prod.largeUnitName || 'كرتونة',
      unitEn:
        line.packagingOptionNameEn && line.packagingOptionSuffix !== 'any'
          ? `${line.largeUnitName || 'Carton'} (${line.packagingOptionNameEn})`
          : line.unitEn || line.largeUnitName || prod.largeUnitName || 'Carton',
      isPrivateLabel: resolveLineIsPrivateLabel(line, productsMap),
      qty,
      bonus,
      totalQty,
      vatRate: vatRatePct,
      baseUnitPrice: round2(baseUnitPrice),
      adjustedUnitPrice,
      grossLineTotal,
      hasPromotionalDiscount: promotionalDiscountAmount > 0,
      promotionalDiscountPct: promoPct,
      promotionalDiscountAmount,
      hasContractDiscount: contractDiscountAmount > 0,
      contractDiscountPct: contractPct,
      contractDiscountAmount,
      hasManualDiscount: manualDiscountAmount > 0,
      manualDiscountPerUnit: manualPerUnit,
      manualDiscountAmount,
      netAmount,
      vatAmount,
      whtAmount,
      lineTotal,
    };
  });

  const lines14 = computedLines.filter((l) => l.vatRate > 0);
  const lines0 = computedLines.filter((l) => l.vatRate === 0);

  const sumField = (arr, k) => round2(arr.reduce((s, item) => s + Number(item[k] || 0), 0));

  const subtotal14 = sumField(lines14, 'netAmount');
  const subtotal0 = sumField(lines0, 'netAmount');
  const grossSubtotal = sumField(computedLines, 'grossLineTotal');
  const totalPromotionalDiscount = sumField(computedLines, 'promotionalDiscountAmount');
  const totalContractDiscount = sumField(computedLines, 'contractDiscountAmount');
  const totalManualDiscount = sumField(computedLines, 'manualDiscountAmount');
  const netPreTaxTotal = round2(subtotal14 + subtotal0);
  const vatTotal = isTaxInvoice ? sumField(computedLines, 'vatAmount') : 0;
  const whtTotal = isWhtApplicable ? round2(netPreTaxTotal * 0.01) : 0;
  const grandTotal = round2(netPreTaxTotal + vatTotal - whtTotal);

  const poNumber =
    docType === DOC_TYPES.TAWOOS
      ? String(order.poTawoos || '').trim()
      : docType === DOC_TYPES.PL
        ? String(order.poPrivateLabel || '').trim()
        : String(order.poTawoos || order.poPrivateLabel || '').trim();

  const orderNo = parseOrderSerialParts(order).baseNum
    ? String(order.serial || parseOrderSerialParts(order).baseNum).trim()
    : String(order.id || '');

  const normSerial = normalizeSerialNumber(serialNo);
  const effectiveInvoiceDate =
    String(invoiceDate || order.invoiceDate || order.loadingDate || '').slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  return {
    docType,
    sequenceType: getSequenceTypeForDocType(docType),
    serialNo: normSerial.clean,
    serialNumberNumeric: normSerial.numeric || 0,
    version: Math.max(1, Number(version || 1)),
    lang: lang === 'en' ? 'en' : 'ar',
    hideBonus: isDN ? Boolean(hideBonus) : false,
    cashSales: effectiveCashSales,
    requiresCashSalesGuard,
    isSplitLoad: Boolean(isSplitLoad),
    revisionReason: String(revisionReason || '').trim(),
    notes: String(notes || order.externalComments || '').trim(),
    invoiceDate: effectiveInvoiceDate,
    orderId: String(order.id || ''),
    orderNo,
    vatMode,
    poNumber,
    tripNumber: Number(order.loadingOrderNumber || 0) || null,
    truckName: resolveSafeTruckName(order),
    driverName: String(order.assignedDriverName || '').trim(),
    salesRep: String(order.salesRep || '').trim(),
    sourceOrderFingerprint: computeOrderInvoiceFingerprint(order),
    seller: {
      nameAr: companyProfile?.tradeNameAr || companyProfile?.legalName || '',
      nameEn: companyProfile?.tradeNameEn || companyProfile?.legalName || '',
      legalName: companyProfile?.legalName || '',
      taxCardNumber: companyProfile?.taxCardNumber || '',
      commercialRegister: companyProfile?.commercialRegister || '',
      taxDistrict: companyProfile?.taxDistrict || '',
      address: companyProfile?.registeredAddress || '',
      phone: companyProfile?.contactPhone || '',
      email: companyProfile?.contactEmail || '',
      logoUrl: companyProfile?.logoUrl || companyProfile?.logoDataUrl || '',
    },
    buyer,
    lines: computedLines,
    groups: {
      vat14: { lines: lines14, subtotal: subtotal14 },
      vat0: { lines: lines0, subtotal: subtotal0 },
    },
    totals: {
      totalQty: computedLines.reduce((s, l) => s + l.qty, 0),
      totalBonus: computedLines.reduce((s, l) => s + l.bonus, 0),
      totalUnits: computedLines.reduce((s, l) => s + l.totalQty, 0),
      grossSubtotal,
      totalPromotionalDiscount,
      totalContractDiscount,
      totalManualDiscount,
      subtotal14,
      subtotal0,
      netPreTaxTotal,
      vatTotal,
      whtTotal,
      grandTotal,
      tafqeetAr: tafqeetArabic(grandTotal, 'EGP'),
    },
    qrDeepLink: `#sales_invoicing?highlight=${encodeURIComponent(order.id || '')}`,
  };
}
