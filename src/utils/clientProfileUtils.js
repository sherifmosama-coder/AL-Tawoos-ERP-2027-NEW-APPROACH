/**
 * Shared pure utilities for the standardized app-wide Client & Branch Profile Modal.
 */

import { parseOrderSerialParts } from './salesOrderUtils.js';

export const CLIENT_SETTLEMENT_MODES = [
  { id: 'cod', labelAr: 'نقدي', labelEn: 'Cash' },
  { id: 'credit', labelAr: 'آجل', labelEn: 'Credit' },
  { id: 'rolling_credit', labelAr: 'فاتورة دايرة', labelEn: 'Rolling invoice' },
];

export const CLIENT_WEEK_DAYS = [
  { id: 'friday', labelAr: 'الجمعة', labelEn: 'Friday' },
  { id: 'saturday', labelAr: 'السبت', labelEn: 'Saturday' },
  { id: 'sunday', labelAr: 'الأحد', labelEn: 'Sunday' },
  { id: 'monday', labelAr: 'الإثنين', labelEn: 'Monday' },
  { id: 'tuesday', labelAr: 'الثلاثاء', labelEn: 'Tuesday' },
  { id: 'wednesday', labelAr: 'الأربعاء', labelEn: 'Wednesday' },
  { id: 'thursday', labelAr: 'الخميس', labelEn: 'Thursday' },
];

export const VAT_MODE_LABELS = {
  none: { ar: 'بدون ضريبة', en: 'No VAT', shortAr: 'بدون', shortEn: 'None' },
  exclusive: { ar: '+14% ضريبة ق.م', en: '+14% VAT Excl', shortAr: '+14%', shortEn: '+14%' },
  exclusive_wht: { ar: '+14% ضريبة / -1% خصم', en: '+14% VAT / -1% WHT', shortAr: '+14% / -1%', shortEn: '+14% / -1%' },
  inclusive: { ar: '14% شامل الضريبة', en: '14% VAT Incl', shortAr: '14% شامل', shortEn: '14% Incl' },
  inclusive_wht: { ar: 'شامل / -1% خصم', en: 'Incl / -1% WHT', shortAr: 'شامل / -1%', shortEn: 'Incl / -1%' },
};

/**
 * Resolves the target branch record inside client.branches[] from branchId / branchName.
 */
export function resolveFocusedBranch(client, focusBranchId = '', focusBranchName = '') {
  const branches = Array.isArray(client?.branches) ? client.branches : [];
  if (branches.length === 0) return null;

  if (focusBranchId) {
    const byId = branches.find((b) => (b.id || 'br_main') === focusBranchId);
    if (byId) return byId;
  }

  if (focusBranchName) {
    const norm = String(focusBranchName).trim().toLowerCase();
    const byName = branches.find((b) =>
      [b.nameAr, b.nameEn, b.name].some((n) => n && String(n).trim().toLowerCase() === norm)
    );
    if (byName) return byName;
  }

  return branches[0];
}

/**
 * Resolves merged contacts, working hours, holidays, address, and notes for a branch + client.
 */
export function resolveBranchProfileDetails(client, branch, isAr = true) {
  const phones = [];
  const addPhone = (p) => {
    const val = String(p || '').trim();
    if (val && !phones.includes(val)) phones.push(val);
  };
  if (branch?.phone) addPhone(branch.phone);
  if (branch?.mobile) addPhone(branch.mobile);
  if (Array.isArray(branch?.phones)) branch.phones.forEach(addPhone);
  if (phones.length === 0) {
    if (Array.isArray(client?.phones)) client.phones.forEach(addPhone);
    if (client?.phone) addPhone(client.phone);
    if (client?.mobile) addPhone(client.mobile);
  }

  const emails = [];
  const addEmail = (e) => {
    const val = String(e || '').trim();
    if (val && !emails.includes(val)) emails.push(val);
  };
  if (branch?.email) addEmail(branch.email);
  if (Array.isArray(client?.emails)) client.emails.forEach(addEmail);
  if (client?.email) addEmail(client.email);

  const useCustom = Boolean(branch?.useCustomSchedule);
  const from = (useCustom && branch?.workingHoursFrom ? branch.workingHoursFrom : client?.workingHoursFrom || branch?.workingHoursFrom || '').trim();
  const to = (useCustom && branch?.workingHoursTo ? branch.workingHoursTo : client?.workingHoursTo || branch?.workingHoursTo || '').trim();
  const workingHours = from && to ? `${from} — ${to}` : from || to || '';

  const branchHolidays = Array.isArray(branch?.weeklyHolidays) ? branch.weeklyHolidays.filter(Boolean) : [];
  const clientHolidays = Array.isArray(client?.weeklyHolidays) ? client.weeklyHolidays.filter(Boolean) : [];
  const rawHolidays = useCustom && branchHolidays.length > 0
    ? branchHolidays
    : clientHolidays.length > 0
    ? clientHolidays
    : branchHolidays;

  const holidaysText = rawHolidays
    .map((h) => {
      const found = CLIENT_WEEK_DAYS.find((d) => d.id === String(h).toLowerCase().trim());
      return found ? (isAr ? found.labelAr : found.labelEn) : h;
    })
    .join('، ');

  return {
    phones,
    emails,
    workingHours,
    holidaysText,
    contactPerson: (branch?.contactPerson || client?.contactPerson || '').trim(),
    address: (branch?.address || client?.address || '').trim(),
    region: (branch?.region || client?.region || '').trim(),
    gpsCoordinates: (branch?.gpsCoordinates || branch?.googleMapsUrl || client?.gpsCoordinates || client?.googleMapsUrl || '').trim(),
    notes: (branch?.notes || client?.notes || '').trim(),
  };
}

/**
 * Builds filtered, newest-first past sales orders summary + normalized SKU/packing/price/VAT lines for a client.
 */
export function buildClientPastOrdersSummary(
  allOrders = [],
  clientId = '',
  { branchId = '', branchName = '', includeCanceled = false } = {}
) {
  const empty = {
    summary: {
      totalOrders: 0,
      deliveredCount: 0,
      totalCartons: 0,
      totalBonus: 0,
      totalNetValue: 0,
      lastOrderDate: '',
    },
    orders: [],
  };

  if (!clientId || !Array.isArray(allOrders)) return empty;

  const targetBranchNameNorm = String(branchName || '').trim().toLowerCase();

  const matching = allOrders.filter((o) => {
    if (!o || o.isDeleted) return false;
    if (String(o.clientId || '') !== String(clientId)) return false;
    // Skip merged child duplicate portions when parent order carries the invoice/billing record
    if (o.splitParentId && o.invoiceSplitMode === 'merged_on_parent') return false;
    if (!includeCanceled && o.confirmationStatus === 'canceled') return false;
    if (branchId) {
      const matchById = o.branchId && String(o.branchId) === String(branchId);
      const matchByName =
        targetBranchNameNorm &&
        o.branchName &&
        String(o.branchName).trim().toLowerCase() === targetBranchNameNorm;
      if (!matchById && !matchByName) return false;
    }
    return true;
  });

  matching.sort((a, b) => {
    const dComp = String(b.invoiceDate || '').localeCompare(String(a.invoiceDate || ''));
    if (dComp !== 0) return dComp;
    const pa = parseOrderSerialParts(a);
    const pb = parseOrderSerialParts(b);
    if (pa.baseNum !== pb.baseNum) return pb.baseNum - pa.baseNum;
    return pa.splitIndex - pb.splitIndex;
  });

  let deliveredCount = 0;
  let totalCartons = 0;
  let totalBonus = 0;
  let totalNetValue = 0;
  let lastOrderDate = '';

  const normalizedOrders = matching.map((o) => {
    const fStatus = o.fulfillmentStatus === 'out_for_delivery' ? 'shipped' : (o.fulfillmentStatus || 'not_yet');
    if (fStatus === 'delivered' || fStatus === 'paid') deliveredCount++;
    const ordCartons = Number(o.totalCartons || o.totalQty || 0);
    const ordBonus = Number(o.totalBonus || 0);
    const ordTotal = Number(o.grandTotal ?? o.collectionAmount ?? 0);
    if (o.confirmationStatus !== 'canceled') {
      totalCartons += ordCartons;
      totalBonus += ordBonus;
      totalNetValue += ordTotal;
    }
    if (o.invoiceDate && (!lastOrderDate || o.invoiceDate > lastOrderDate)) {
      lastOrderDate = o.invoiceDate;
    }

    const vatMode = o.vatMode || 'none';
    const normalizedLines = Array.isArray(o.lines)
      ? o.lines.map((l, idx) => {
          const unitPrice = Number(
            l.detectedUnitPrice ?? l.unitPrice ?? l.effectiveBaseUnitPrice ?? 0
          );
          const effectiveBase = Number(l.effectiveBaseUnitPrice ?? unitPrice);
          const qty = Number(l.qty || 0);
          const bonus = Number(l.bonus || 0);
          const lineTotal = Number(l.lineTotal ?? l.lineNet ?? qty * effectiveBase);
          return {
            key: `${o.id}_${l.productId || l.productCode || idx}`,
            productId: l.productId || '',
            productCode: l.productCode || '',
            productNameAr: l.productNameAr || l.productName || '—',
            productNameEn: l.productNameEn || l.productNameAr || '—',
            packagingOptionSuffix: l.packagingOptionSuffix || l.optionSuffix || '',
            packagingOptionNameAr:
              l.packagingOptionNameAr || (l.packagingOptionSuffix ? `تعبئة ${l.packagingOptionSuffix}` : '—'),
            packagingOptionNameEn:
              l.packagingOptionNameEn || (l.packagingOptionSuffix ? `Pack ${l.packagingOptionSuffix}` : '—'),
            qty,
            bonus,
            unitPrice,
            effectiveBaseUnitPrice: effectiveBase,
            manualDiscountPerUnit: Number(l.manualDiscountPerUnit || 0),
            vatRate: l.vatRate || (vatMode === 'none' ? '0%' : '14%'),
            lineNet: Number(l.lineNet || 0),
            lineVat: Number(l.lineVat || 0),
            lineWht: Number(l.lineWht || 0),
            lineTotal,
            vatMode,
          };
        })
      : [];

    return {
      ...o,
      normalizedStatus: fStatus,
      vatMode,
      normalizedLines,
    };
  });

  return {
    summary: {
      totalOrders: matching.length,
      deliveredCount,
      totalCartons,
      totalBonus,
      totalNetValue,
      lastOrderDate,
    },
    orders: normalizedOrders,
  };
}
