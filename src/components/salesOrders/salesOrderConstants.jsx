import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { parseOrderSerialParts } from '../../utils/salesOrderUtils';
import { normalizeLocationUrl } from '../../utils/locationUtils';

// Lightweight image compressor for PO attachments (<80KB)
export const compressImage = (file, maxWidth = 900, maxHeight = 900, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

/**
 * Sales Order Types (Physical delivery & warehouse dispatch)
 */
export const SALES_ORDER_TYPES = [
  { id: 'supply', labelAr: 'توريد', labelEn: 'Supply', isDefault: true },
  { id: 'return_deduct', labelAr: 'ارتجاع و خصم القيمة', labelEn: 'Return & Deduct Value' },
  { id: 'return_no_deduct', labelAr: 'ارتجاع بدون خصم', labelEn: 'Return without Deduction' },
  { id: 'replacement_old', labelAr: 'بدل مرتجع قديم', labelEn: 'Replacement for Old Return' },
  { id: 'exchange', labelAr: 'تبديل', labelEn: 'Exchange' },
];

/**
 * Administrative Order Types (Financial & corporate HQ level)
 */
export const ADMIN_ORDER_TYPES = [
  { id: 'admin', labelAr: 'اداري', labelEn: 'Administrative', isDefault: true },
  { id: 'collection', labelAr: 'تحصيل', labelEn: 'Collection Only' },
  { id: 'invoice_only_with_tax', labelAr: 'فاتورة فقط مع تحصيل الضريبة', labelEn: 'Invoice Only (With VAT Collection)' },
  { id: 'invoice_only_no_tax', labelAr: 'فاتورة فقط بدون تحصيل', labelEn: 'Invoice Only (Without Collection)' },
];

/**
 * Combined Order Types Dictionary (Legacy Matching)
 */
export const ORDER_TYPES = [...SALES_ORDER_TYPES, ...ADMIN_ORDER_TYPES];

/**
 * Confirmation Statuses Dictionary (Modal Dropdown: confirmed, not_confirmed, canceled)
 * Note: 'revised' is handled as an independent complementary toggle button on the row.
 */
export const CONFIRMATION_STATUSES = [
  { id: 'confirmed', labelAr: 'مؤكد', labelEn: 'Confirmed', color: 'emerald', isDefault: true },
  { id: 'not_confirmed', labelAr: 'غير مؤكد', labelEn: 'Not Confirmed', color: 'amber' },
  { id: 'canceled', labelAr: 'ملغي', labelEn: 'Canceled', color: 'rose' },
];

/**
 * 5 Fulfillment Statuses Dictionary & Standardized Corporate Styles
 */
export const FULFILLMENT_STATUSES = [
  { id: 'not_yet', labelAr: 'قيد الانتظار', labelEn: 'Pending', color: 'slate', isDefault: true },
  { id: 'prepare', labelAr: 'جاري التجهيز', labelEn: 'Preparing', color: 'amber' },
  { id: 'shipped', labelAr: 'جاري التوصيل', labelEn: 'Out for Delivery', color: 'sky' },
  { id: 'delivered', labelAr: 'تم التسليم', labelEn: 'Delivered', color: 'emerald' },
  { id: 'paid', labelAr: 'مدفوع', labelEn: 'Paid', color: 'indigo' },
];

export const SALES_FULFILLMENT_STYLE_MAP = {
  not_yet: {
    badgeClasses: 'bg-slate-100 text-slate-800 border-slate-300 ring-1 ring-slate-300/35',
    startBorderClasses: 'border-s-[4px] border-s-slate-400',
    rowClasses: 'bg-white hover:bg-slate-50/90',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-slate-100 via-slate-50 to-white border-slate-300 border-s-[4px] border-s-slate-500 text-slate-900',
    dotClasses: 'bg-slate-500'
  },
  prepare: {
    badgeClasses: 'bg-amber-100 text-amber-950 border-amber-400 ring-1 ring-amber-400/35',
    startBorderClasses: 'border-s-[4px] border-s-amber-500',
    rowClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-amber-500/[0.085] via-amber-500/[0.03] to-white hover:from-amber-500/[0.14]',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-amber-100/90 via-amber-50/75 to-white border-amber-300 border-s-[4px] border-s-amber-500 text-amber-950',
    dotClasses: 'bg-amber-500'
  },
  shipped: {
    badgeClasses: 'bg-sky-100 text-sky-950 border-sky-400 ring-1 ring-sky-400/35',
    startBorderClasses: 'border-s-[4px] border-s-sky-500',
    rowClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-sky-500/[0.085] via-sky-500/[0.03] to-white hover:from-sky-500/[0.14]',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-sky-100/90 via-sky-50/75 to-white border-sky-300 border-s-[4px] border-s-sky-600 text-sky-950',
    dotClasses: 'bg-sky-600'
  },
  delivered: {
    badgeClasses: 'bg-emerald-100 text-emerald-950 border-emerald-400 ring-1 ring-emerald-400/35',
    startBorderClasses: 'border-s-[4px] border-s-emerald-600',
    rowClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-500/[0.075] via-emerald-500/[0.025] to-white hover:from-emerald-500/[0.13]',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-100/90 via-emerald-50/75 to-white border-emerald-300 border-s-[4px] border-s-emerald-600 text-emerald-950',
    dotClasses: 'bg-emerald-600'
  },
  paid: {
    badgeClasses: 'bg-indigo-100 text-indigo-950 border-indigo-400 ring-1 ring-indigo-400/35',
    startBorderClasses: 'border-s-[4px] border-s-indigo-600',
    rowClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-indigo-500/[0.075] via-indigo-500/[0.025] to-white hover:from-indigo-500/[0.13]',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-indigo-100/90 via-indigo-50/75 to-white border-indigo-300 border-s-[4px] border-s-indigo-600 text-indigo-950',
    dotClasses: 'bg-indigo-600'
  }
};

/**
 * Standardizes Vehicle Name (`vehicleModel` / `name` / `nameAr`) as the main human-recognizable reference.
 */
export const resolveVehicleDisplayName = (veh, fallbackName = '') => {
  if (!veh && !fallbackName) return '';
  return (
    veh?.vehicleModel ||
    veh?.name ||
    veh?.nameAr ||
    veh?.nameEn ||
    fallbackName ||
    veh?.code ||
    veh?.id ||
    ''
  ).trim();
};

/**
 * 5 Tax / VAT Modes Dictionary (Legacy Matching)
 */
export const VAT_MODES = [
  { id: 'none', labelAr: 'بدون ضريبة (إذن تسليم)', labelEn: 'None (Delivery Note)', isDefault: true, vatPct: 0, hasWht: false, isInclusive: false },
  { id: 'exclusive', labelAr: 'ضريبي (غير شامل الضريبة +14%)', labelEn: 'Tax Excluded (+14% VAT)', vatPct: 14, hasWht: false, isInclusive: false },
  { id: 'exclusive_wht', labelAr: 'ضريبة وخصم 1% (+14% ضريبة - 1% خصم)', labelEn: 'Tax Excl. (+14% VAT - 1% WHT)', vatPct: 14, hasWht: true, isInclusive: false },
  { id: 'inclusive', labelAr: 'سعر شامل الضريبة (السعر الحالي شامل 14%)', labelEn: 'Tax Included (Base = Price / 1.14)', vatPct: 14, hasWht: false, isInclusive: true },
  { id: 'inclusive_wht', labelAr: 'سعر شامل وخصم 1% (شامل 14% - 1% خصم)', labelEn: 'Tax Incl. (+14% VAT - 1% WHT)', vatPct: 14, hasWht: true, isInclusive: true },
];

/**
 * The 4 Taxable VAT Modes (Used for official invoice_only orders)
 */
export const TAXABLE_VAT_MODES = VAT_MODES.filter((v) => v.id !== 'none');

/**
 * Helper to resolve sequential 4-digit serial (e.g. 0001, 0002) or split serial (e.g. 0001 (2/3))
 */
export const resolveOrderSerial = (order, allOrders = []) => {
  if (!order) return '0001';
  if (order.serial) {
    const s = String(order.serial).trim();
    if (/^\d+$/.test(s)) return s.padStart(4, '0');
    return s;
  }
  if (order.baseSerial && order.splitIndex && order.splitTotal) {
    return `${String(order.baseSerial).padStart(4, '0')} (${order.splitIndex}/${order.splitTotal})`;
  }
  const match = String(order.id || '').match(/^(?:SO-)?(\d+)$/i);
  if (match) {
    return match[1].padStart(4, '0');
  }
  return '0001';
};

/**
 * Helper to generate next sequential 4-digit serial starting at 0001 (safe with split children like 0001 (2/3))
 */
export const generateNextOrderSerial = (allOrders = []) => {
  let max = 0;
  (allOrders || []).forEach((o) => {
    const { baseNum } = parseOrderSerialParts(o);
    if (!isNaN(baseNum) && baseNum > max && baseNum < 999999) {
      max = baseNum;
    }
  });
  return String(max + 1).padStart(4, '0');
};

/**
 * Detects if a branch name is an auto-generated / dummy label (e.g. "Branch 1", "Branch 2", "فرع 1", "فرع 2", "br_1")
 */
export const isGenericBranchLabel = (str) => {
  if (!str || typeof str !== 'string') return true;
  const s = str.trim().toLowerCase();
  if (/^branch[\s_#-]*\d*$/i.test(s)) return true;
  if (/^فرع[\s_#-]*\d*$/.test(s)) return true;
  if (/^br[\s_#-]*\w*$/i.test(s)) return true;
  return false;
};

/**
 * Resolves the real human-meaningful branch name, ensuring we never display native generic labels ("Branch 1", "Branch 2", etc.)
 */
export const resolveBranchDisplayName = (b, isAr = true) => {
  if (!b) return '';
  if (typeof b === 'string') {
    return isGenericBranchLabel(b) ? '' : b;
  }

  const rawNameAr = (b.nameAr || '').trim();
  const rawNameEn = (b.nameEn || '').trim();
  const region = (b.region || '').trim();
  const address = (b.address || '').trim();

  // 1. Check for a non-generic real name in nameAr and nameEn
  const hasRealAr = Boolean(rawNameAr && !isGenericBranchLabel(rawNameAr));
  const hasRealEn = Boolean(rawNameEn && !isGenericBranchLabel(rawNameEn));

  if (isAr) {
    if (hasRealAr) return rawNameAr;
    if (hasRealEn) return rawNameEn;
  } else {
    // In English mode, if nameEn is generic (like "Branch 2"), fallback to real Arabic name!
    if (hasRealEn) return rawNameEn;
    if (hasRealAr) return rawNameAr;
  }

  // 2. If both names are generic (e.g. "فرع 2" / "Branch 2"), fall back to the Region (e.g. "اكتوبر", "مدينة نصر")
  if (region) {
    return region;
  }

  // 3. Fall back to the first segment of the address if present
  if (address) {
    return address.split(/[-–,،]/)[0].trim();
  }

  // 4. Fallback if absolutely nothing else is available
  return rawNameAr || rawNameEn || (isAr ? 'الفرع الرئيسي' : 'Main Branch');
};

/**
 * Resolves a Google Maps / location URL for a branch, client, or order
 */
export const resolveLocationUrl = (branch, client, order = null) => {
  const raw = (
    order?.gpsCoordinates ||
    order?.googleMapsUrl ||
    order?.locationUrl ||
    branch?.gpsCoordinates ||
    branch?.googleMapsUrl ||
    branch?.locationUrl ||
    client?.gpsCoordinates ||
    client?.googleMapsUrl ||
    client?.locationUrl ||
    ''
  ).trim();
  if (!raw) return null;
  return normalizeLocationUrl(raw);
};

/**
 * Resolves full operational profile for an order
 */
export const resolveOrderOperationalProfile = (order, client, isAr = true) => {
  if (!client) {
    return {
      hasSchedule: false,
      scheduleDisplay: '—',
      holidaysDisplay: '',
      hasHolidays: false,
      address: '',
      hasAddress: false,
      phonesDisplay: '',
      contactPerson: '',
      hasContact: false,
      notes: '',
      hasNotes: false
    };
  }

  const branches = Array.isArray(client.branches) ? client.branches : [];
  const br = branches.find((b) => (b.id || 'br_main') === order.branchId) || branches[0] || null;

  const useCustom = Boolean(br?.useCustomSchedule);
  const branchHoursFrom = (br?.workingHoursFrom || '').trim();
  const branchHoursTo = (br?.workingHoursTo || '').trim();
  const clientHoursFrom = (client.workingHoursFrom || '').trim();
  const clientHoursTo = (client.workingHoursTo || '').trim();

  let hoursFrom = '';
  let hoursTo = '';
  if (useCustom && (branchHoursFrom || branchHoursTo)) {
    hoursFrom = branchHoursFrom;
    hoursTo = branchHoursTo;
  } else {
    hoursFrom = clientHoursFrom || branchHoursFrom;
    hoursTo = clientHoursTo || branchHoursTo;
  }

  let scheduleDisplay = '';
  if (hoursFrom && hoursTo) {
    scheduleDisplay = `${hoursFrom} — ${hoursTo}`;
  } else if (hoursFrom) {
    scheduleDisplay = hoursFrom;
  } else if (hoursTo) {
    scheduleDisplay = hoursTo;
  } else {
    scheduleDisplay = isAr ? '— (غير محدد)' : '— (Unknown)';
  }

  const branchHolidays = Array.isArray(br?.weeklyHolidays) ? br.weeklyHolidays.filter(Boolean) : [];
  const clientHolidays = Array.isArray(client.weeklyHolidays) ? client.weeklyHolidays.filter(Boolean) : [];

  let rawHolidays = [];
  if (useCustom && branchHolidays.length > 0) {
    rawHolidays = branchHolidays;
  } else if (clientHolidays.length > 0) {
    rawHolidays = clientHolidays;
  } else if (branchHolidays.length > 0) {
    rawHolidays = branchHolidays;
  }

  const DAY_MAP_AR = {
    friday: 'الجمعة',
    saturday: 'السبت',
    sunday: 'الأحد',
    monday: 'الإثنين',
    tuesday: 'الثلاثاء',
    wednesday: 'الأربعاء',
    thursday: 'الخميس'
  };

  // Filter out Friday - only show weekly holidays if not Friday
  const nonFridayHolidays = rawHolidays.filter(
    (d) => String(d).toLowerCase().trim() !== 'friday' && d !== 5
  );

  const holidaysDisplay = nonFridayHolidays
    .map((d) => (isAr ? (DAY_MAP_AR[String(d).toLowerCase().trim()] || d) : d))
    .join('، ');

  // Contact & Phones
  const contactPerson = br?.contactPerson || client.contactPerson || '';
  let phoneList = [];
  if (br?.phone) phoneList.push(br.phone);
  if (br?.mobile) phoneList.push(br.mobile);
  if (Array.isArray(br?.phones)) phoneList.push(...br.phones.filter(Boolean));
  if (phoneList.length === 0) {
    if (Array.isArray(client.phones)) phoneList.push(...client.phones.filter(Boolean));
    if (client.phone) phoneList.push(client.phone);
    if (client.mobile) phoneList.push(client.mobile);
  }
  phoneList = Array.from(new Set(phoneList.map((p) => String(p).trim()))).filter(Boolean);
  const phonesDisplay = phoneList.join(' — ');

  const address = br?.address || client.address || '';
  const clientNotes = (client.notes || '').trim();
  const branchNotes = (br?.notes || '').trim();
  const notes = branchNotes || clientNotes || '';

  return {
    hoursFrom,
    hoursTo,
    scheduleDisplay,
    hasHours: Boolean(hoursFrom || hoursTo),
    holidaysDisplay,
    hasHolidays: nonFridayHolidays.length > 0,
    address,
    hasAddress: Boolean(address && address !== '—' && address !== 'غير محدد'),
    contactPerson,
    phonesDisplay,
    hasContact: Boolean(contactPerson || phonesDisplay),
    notes,
    hasNotes: Boolean(notes),
    clientNotes,
    hasClientNotes: Boolean(clientNotes),
    branchNotes,
    hasBranchNotes: Boolean(branchNotes && branchNotes !== clientNotes)
  };
};

/**
 * Abbreviated VAT Mode Chip Renderer (Consistent with modal color theme)
 */
export const renderVatAbbrChip = (vatMode, orderType, isAr = true) => {
  if (orderType === 'admin') {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
        {isAr ? 'إداري' : 'Admin'}
      </span>
    );
  }
  if (orderType === 'collection') {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
        {isAr ? 'تحصيل' : 'Receipt'}
      </span>
    );
  }

  switch (vatMode) {
    case 'exclusive':
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title={isAr ? 'ضريبي (غير شامل الضريبة +14%)' : '+14% VAT Excluded'}>
          +14%
        </span>
      );
    case 'exclusive_wht':
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200" title={isAr ? 'ضريبة وخصم 1% (+14% ضريبة - 1% خصم أ.ت.ص)' : '+14% VAT - 1% WHT'}>
          +14% / -1%
        </span>
      );
    case 'inclusive':
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title={isAr ? 'سعر شامل الضريبة (14%)' : 'Tax Included (14%)'}>
          {isAr ? '14% شامل' : '14% Incl'}
        </span>
      );
    case 'inclusive_wht':
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title={isAr ? 'شامل الضريبة مع خصم أ.ت.ص (1%)' : 'Tax Incl - 1% WHT'}>
          {isAr ? 'شامل / -1%' : 'Incl / -1%'}
        </span>
      );
    case 'none':
    default:
      return (
        <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
      );
  }
};

export function CopyButton({ text, title, isAr = true, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(String(text).trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center p-0.5 rounded transition cursor-pointer text-slate-400 hover:text-indigo-600 hover:bg-slate-200/60 ${
        copied ? 'text-emerald-600 hover:text-emerald-600 bg-emerald-50' : ''
      } ${className}`}
      title={copied ? (isAr ? 'تم النسخ!' : 'Copied!') : (title || (isAr ? 'نسخ' : 'Copy'))}
    >
      {copied ? <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" /> : <Copy className="w-2.5 h-2.5" />}
    </button>
  );
}
