import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  Layers,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MoreVertical,
  Edit3,
  Trash2,
  X,
  Building2,
  MapPin,
  Map,
  FileSpreadsheet,
  FileText,
  Download,
  Upload,
  ArrowRight,
  Boxes,
  History,
  User,
  Truck,
  Receipt,
  FileCheck,
  Paperclip,
  Eye,
  Check,
  ChevronDown,
  ChevronRight,
  Tag,
  Scale,
  Weight,
  Percent,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Info,
  Phone,
  Landmark,
  Banknote,
  MessageSquare,
  Lock,
  StickyNote,
  Users,
  PackageCheck,
  Copy,
  GitFork,
  Printer,
  PackageMinus
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import SalesOrderAuditModal from './SalesOrderAuditModal';
import OrderSplitModal from './OrderSplitModal';
import PeacockLoader from './PeacockLoader';
import { canAccessAction } from '../config/appArchitecture';
import {
  PHYSICAL_DELIVERY_EXCLUDED_TYPES,
  POST_DISPATCH_STATUSES,
  parseOrderSerialParts,
  compareOrdersBySerialAsc,
  calculateSalesOrderLineTotals,
  aggregateSalesOrderTotals,
  openPrintableAdjustmentSlip
} from '../utils/salesOrderUtils';
import { normalizeLocationUrl } from '../utils/locationUtils';
import { SEGMENT_ICON_MAP, PRESET_DEFAULT_SEGMENTS } from './ClientSegmentsMaster';
import { RowCommentButton, useRecordComments } from './comments';
import {
  DEFAULT_PRICING_STRATEGIES,
  formatDateKey,
  isProductPrivateLabel,
  isProductAllowedForClient,
  detectProductPrice,
  detectPromotionalDiscount
} from '../utils/pricingEngine';

// Lightweight image compressor for PO attachments (<80KB)
const compressImage = (file, maxWidth = 900, maxHeight = 900, quality = 0.7) => {
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
const SALES_ORDER_TYPES = [
  { id: 'supply', labelAr: 'توريد', labelEn: 'Supply', isDefault: true },
  { id: 'return_deduct', labelAr: 'ارتجاع و خصم القيمة', labelEn: 'Return & Deduct Value' },
  { id: 'return_no_deduct', labelAr: 'ارتجاع بدون خصم', labelEn: 'Return without Deduction' },
  { id: 'replacement_old', labelAr: 'بدل مرتجع قديم', labelEn: 'Replacement for Old Return' },
  { id: 'exchange', labelAr: 'تبديل', labelEn: 'Exchange' },
];

/**
 * Administrative Order Types (Financial & corporate HQ level)
 */
const ADMIN_ORDER_TYPES = [
  { id: 'admin', labelAr: 'اداري', labelEn: 'Administrative', isDefault: true },
  { id: 'collection', labelAr: 'تحصيل', labelEn: 'Collection Only' },
  { id: 'invoice_only_with_tax', labelAr: 'فاتورة فقط مع تحصيل الضريبة', labelEn: 'Invoice Only (With VAT Collection)' },
  { id: 'invoice_only_no_tax', labelAr: 'فاتورة فقط بدون تحصيل', labelEn: 'Invoice Only (Without Collection)' },
];

/**
 * Combined Order Types Dictionary (Legacy Matching)
 */
const ORDER_TYPES = [...SALES_ORDER_TYPES, ...ADMIN_ORDER_TYPES];

/**
 * Confirmation Statuses Dictionary (Modal Dropdown: confirmed, not_confirmed, canceled)
 * Note: 'revised' is handled as an independent complementary toggle button on the row.
 */
const CONFIRMATION_STATUSES = [
  { id: 'confirmed', labelAr: 'مؤكد', labelEn: 'Confirmed', color: 'emerald', isDefault: true },
  { id: 'not_confirmed', labelAr: 'غير مؤكد', labelEn: 'Not Confirmed', color: 'amber' },
  { id: 'canceled', labelAr: 'ملغي', labelEn: 'Canceled', color: 'rose' },
];

/**
 * 5 Fulfillment Statuses Dictionary & Standardized Corporate Styles
 */
const FULFILLMENT_STATUSES = [
  { id: 'not_yet', labelAr: 'قيد الانتظار', labelEn: 'Pending', color: 'slate', isDefault: true },
  { id: 'prepare', labelAr: 'جاري التجهيز', labelEn: 'Preparing', color: 'amber' },
  { id: 'shipped', labelAr: 'جاري التوصيل', labelEn: 'Out for Delivery', color: 'sky' },
  { id: 'delivered', labelAr: 'تم التسليم', labelEn: 'Delivered', color: 'emerald' },
  { id: 'paid', labelAr: 'مدفوع', labelEn: 'Paid', color: 'indigo' },
];

const SALES_FULFILLMENT_STYLE_MAP = {
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
const resolveVehicleDisplayName = (veh, fallbackName = '') => {
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
const VAT_MODES = [
  { id: 'none', labelAr: 'بدون ضريبة (إذن تسليم)', labelEn: 'None (Delivery Note)', isDefault: true, vatPct: 0, hasWht: false, isInclusive: false },
  { id: 'exclusive', labelAr: 'ضريبي (غير شامل الضريبة +14%)', labelEn: 'Tax Excluded (+14% VAT)', vatPct: 14, hasWht: false, isInclusive: false },
  { id: 'exclusive_wht', labelAr: 'ضريبة وخصم 1% (+14% ضريبة - 1% خصم)', labelEn: 'Tax Excl. (+14% VAT - 1% WHT)', vatPct: 14, hasWht: true, isInclusive: false },
  { id: 'inclusive', labelAr: 'سعر شامل الضريبة (السعر الحالي شامل 14%)', labelEn: 'Tax Included (Base = Price / 1.14)', vatPct: 14, hasWht: false, isInclusive: true },
  { id: 'inclusive_wht', labelAr: 'سعر شامل وخصم 1% (شامل 14% - 1% خصم)', labelEn: 'Tax Incl. (+14% VAT - 1% WHT)', vatPct: 14, hasWht: true, isInclusive: true },
];

/**
 * The 4 Taxable VAT Modes (Used for official invoice_only orders)
 */
const TAXABLE_VAT_MODES = VAT_MODES.filter((v) => v.id !== 'none');

/**
 * Helper to resolve sequential 4-digit serial (e.g. 0001, 0002) or split serial (e.g. 0001 (2/3))
 */
const resolveOrderSerial = (order, allOrders = []) => {
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
const generateNextOrderSerial = (allOrders = []) => {
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
const isGenericBranchLabel = (str) => {
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
const resolveBranchDisplayName = (b, isAr = true) => {
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
const resolveLocationUrl = (branch, client, order = null) => {
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
const resolveOrderOperationalProfile = (order, client, isAr = true) => {
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
const renderVatAbbrChip = (vatMode, orderType, isAr = true) => {
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

function CopyButton({ text, title, isAr = true, className = '' }) {
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

export default function SalesOrdersMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin' || currentUser?.role === 'admin';
  const canSplitOrder = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canSplitOrder', currentUser);
  const canAdjustDispatchedQty = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canAdjustDispatchedQuantities', currentUser);
  const currentUserName = currentUser?.nameAr || currentUser?.name || 'مستخدم معتمد';
  const currentUserId = currentUser?.id || 'usr_unknown';

  // Cloud State
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [segments, setSegments] = useState([]);
  const [products, setProducts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [strategies, setStrategies] = useState(DEFAULT_PRICING_STRATEGIES);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [confirmationFilter, setConfirmationFilter] = useState('all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');
  const [assignmentFilter, setAssignmentFilter] = useState('all'); // 'all' | 'assigned' | 'unassigned' | vehicleId
  const [vatModeFilter, setVatModeFilter] = useState('all');
  const [dateFilterType, setDateFilterType] = useState('invoiceDate'); // 'invoiceDate' | 'loadingDate'
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'fulfillmentStatus' | 'confirmationStatus' | 'client' | 'region' | 'vatMode' | 'orderType'
  const [revisedOnlyFilter, setRevisedOnlyFilter] = useState(false);

  // Expandable Rows State
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());

  // Modal States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editorInitialAdjustmentMode, setEditorInitialAdjustmentMode] = useState(false);
  const [isAdminModal, setIsAdminModal] = useState(false);
  const [auditModalOrder, setAuditModalOrder] = useState(null);
  const [splitModalOrder, setSplitModalOrder] = useState(null);
  const [splitGuidanceOrder, setSplitGuidanceOrder] = useState(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);

  // 3-Dots Action Menu Anchor
  const [activeActionsMenuOrderId, setActiveActionsMenuOrderId] = useState(null);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);

  // Split Portion Card Hover Tooltip (Portal-rendered for unclipped visibility)
  const [hoveredPortionTooltip, setHoveredPortionTooltip] = useState(null);

  const activeOrderForMenu = useMemo(() => {
    if (!activeActionsMenuOrderId) return null;
    return orders.find((o) => o.id === activeActionsMenuOrderId) || null;
  }, [activeActionsMenuOrderId, orders]);

  // 1. Subscribe to Sales Orders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sales_orders'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort newest invoice date first, then base serial descending (with child split portions ascending under same base)
      loaded.sort((a, b) => {
        const dateComp = String(b.invoiceDate || '').localeCompare(String(a.invoiceDate || ''));
        if (dateComp !== 0) return dateComp;
        const pa = parseOrderSerialParts(a);
        const pb = parseOrderSerialParts(b);
        if (pa.baseNum !== pb.baseNum) return pb.baseNum - pa.baseNum;
        return pa.splitIndex - pb.splitIndex;
      });
      setOrders(loaded);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to Clients
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.tradeNameAr || a.name || '').localeCompare(b.tradeNameAr || b.name || '', 'ar'));
      setClients(loaded);
    });
    return () => unsub();
  }, []);

  // 3. Subscribe to Finished Products
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'finished_products'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.nameAr || '').localeCompare(b.nameAr || '', 'ar'));
      setProducts(loaded);
    });
    return () => unsub();
  }, []);

  // 4. Subscribe to Finished Product Categories
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'finished_product_categories'), (snapshot) => {
      if (!snapshot.empty) {
        const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        loaded.sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
        setProductCategories(loaded);
      }
    });
    return () => unsub();
  }, []);

  // 5. Subscribe to Price Lists
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'price_lists'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPriceLists(loaded);
    });
    return () => unsub();
  }, []);

  // 6. Subscribe to Pricing Strategies
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pricing_strategies'), (snapshot) => {
      if (!snapshot.empty) {
        const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStrategies(loaded);
      }
    });
    return () => unsub();
  }, []);

  // 7. Subscribe to Client Segments
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'client_segments'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSegments(loaded);
    });
    return () => unsub();
  }, []);

  // Fast Segment Lookup Map
  const segmentMap = useMemo(() => {
    const map = {};
    (segments.length > 0 ? segments : PRESET_DEFAULT_SEGMENTS).forEach((s) => {
      if (s.id) map[s.id] = s;
      if (s.code) map[s.code] = s;
      if (s.nameAr) map[s.nameAr] = s;
      if (s.nameEn) map[s.nameEn] = s;
    });
    return map;
  }, [segments]);

  // 8. Subscribe to Fleet Vehicles
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.plateNumber || a.code || '').localeCompare(b.plateNumber || b.code || '', 'ar'));
      setVehicles(loaded);
    });
    return () => unsub();
  }, []);

  // One-Click Navigation to Loading Plan focusing on that order
  const handleNavigateToLoadingPlan = (order) => {
    const date = order.loadingDate || order.invoiceDate || formatDateKey(new Date());
    if (typeof window !== 'undefined') {
      window.location.hash = `#loading_plan?module=sales&orderId=${order.id}&date=${date}`;
      window.dispatchEvent(
        new CustomEvent('app-navigate', {
          detail: { tab: 'loading_plan', module: 'sales', orderId: order.id, date }
        })
      );
    }
  };

  // Listen for Incoming Deep-Link Focus from Loading Plan
  useEffect(() => {
    const checkHashFocus = () => {
      if (typeof window === 'undefined') return;
      const rawHash = window.location.hash || '';
      if (!rawHash.includes('sales_orders')) return;
      const queryPart = rawHash.split('?')[1];
      if (!queryPart) return;
      const params = new URLSearchParams(queryPart);
      const targetSerial = params.get('focusOrder');
      if (targetSerial && orders.length > 0) {
        const found = orders.find((o) => resolveOrderSerial(o, orders) === targetSerial || o.id === targetSerial);
        const resolvedFound =
          found && found.splitParentId && found.invoiceSplitMode === 'merged_on_parent'
            ? orders.find((o) => o.id === found.splitParentId) || found
            : found;
        setSearchTerm(resolvedFound ? resolveOrderSerial(resolvedFound, orders) : targetSerial);
        if (resolvedFound) {
          setExpandedOrderIds((prev) => new Set([...prev, resolvedFound.id]));
          setTimeout(() => {
            const el = document.getElementById(`sales-order-row-${resolvedFound.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-4', 'ring-indigo-400', 'bg-indigo-50/50');
              setTimeout(() => {
                el.classList.remove('ring-4', 'ring-indigo-400', 'bg-indigo-50/50');
              }, 3000);
            }
          }, 400);
        }
      }
    };

    checkHashFocus();
    window.addEventListener('hashchange', checkHashFocus);

    const handleCustomNav = (e) => {
      const { tab, focusOrder, orderId } = e.detail || {};
      if (tab === 'sales_orders') {
        const initialFound =
          (orderId ? orders.find((o) => o.id === orderId) : null) ||
          (focusOrder ? orders.find((o) => resolveOrderSerial(o, orders) === focusOrder) : null);
        const resolvedFound =
          initialFound && initialFound.splitParentId && initialFound.invoiceSplitMode === 'merged_on_parent'
            ? orders.find((o) => o.id === initialFound.splitParentId) || initialFound
            : initialFound;
        if (resolvedFound) {
          setSearchTerm(resolveOrderSerial(resolvedFound, orders));
        } else if (focusOrder) {
          setSearchTerm(focusOrder);
        }
        const targetId = resolvedFound?.id || orderId || null;
        if (targetId) {
          setExpandedOrderIds((prev) => new Set([...prev, targetId]));
          setTimeout(() => {
            const el = document.getElementById(`sales-order-row-${targetId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-4', 'ring-indigo-400', 'bg-indigo-50/50');
              setTimeout(() => {
                el.classList.remove('ring-4', 'ring-indigo-400', 'bg-indigo-50/50');
              }, 3000);
            }
          }, 400);
        }
      }
    };
    window.addEventListener('app-navigate', handleCustomNav);

    return () => {
      window.removeEventListener('hashchange', checkHashFocus);
      window.removeEventListener('app-navigate', handleCustomNav);
    };
  }, [orders]);

  // Close 3-dots actions menu on outside click or scroll
  useEffect(() => {
    if (!activeActionsMenuOrderId) return;
    const handleClick = (e) => {
      if (!e.target.closest('[data-order-menu]')) {
        setActiveActionsMenuOrderId(null);
        setActionsMenuAnchor(null);
      }
    };
    const handleScrollOrResize = () => {
      setActiveActionsMenuOrderId(null);
      setActionsMenuAnchor(null);
    };
    document.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeActionsMenuOrderId]);

  // Clients options for SearchableSelect:
  // FLATTENED LIST SORTED ASCENDINGLY with bilingual search support (Arabic & English names, code, tax number)
  const clientFilterOptions = useMemo(() => {
    const list = (clients || []).map((c) => {
      const nameAr = c.tradeNameAr || c.legalName || c.name || '';
      const nameEn = c.tradeNameEn || '';
      const code = c.code || '';
      const name = isAr
        ? (nameAr || nameEn || c.id)
        : (nameEn || nameAr || c.id);
      const altName = isAr ? nameEn : nameAr;
      const clientStratId = c.pricingStrategy || 'wholesalers';
      const strat =
        strategies.find((s) => s.id === clientStratId) ||
        DEFAULT_PRICING_STRATEGIES.find((s) => s.id === clientStratId) || {
          color: '#64748b',
          icon: 'Tag'
        };
      const StratIcon = SEGMENT_ICON_MAP[strat.icon] || Tag;

      return {
        value: c.id,
        label: name,
        sublabel: `${code ? `[${code}] ` : ''}${altName}`.trim() || c.id,
        specs: `${nameAr} ${nameEn} ${c.legalName || ''} ${code} ${c.taxNumber || ''} ${c.phone || ''}`.toLowerCase(),
        icon: StratIcon,
        iconColor: strat.color || '#2563eb',
        iconTitle: isAr ? strat.nameAr : strat.nameEn,
        nameForSort: name
      };
    });

    list.sort((a, b) => a.nameForSort.localeCompare(b.nameForSort, isAr ? 'ar' : 'en'));

    return [
      {
        value: 'all',
        label: isAr ? 'جميع العملاء' : 'All Clients',
        sublabel: ''
      },
      ...list
    ];
  }, [clients, strategies, isAr]);

  // Toggle expandable row
  const toggleRowExpand = (orderId) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Toggle complementary 'Reviewed' (PO Review & Price Verification) status on an order
  const handleToggleRevised = async (order) => {
    if (!order?.id) return;
    const newIsRevised = !(order.isRevised || order.confirmationStatus === 'revised');
    const now = new Date().toISOString();
    const orderSerial = resolveOrderSerial(order, orders);

    const auditEvent = {
      id: `AUD-${Date.now()}-${(order.auditTrail || []).length + 1}`,
      action: 'toggle_revised',
      performedBy: currentUserName,
      performedById: currentUser?.id || currentUser?.uid || '',
      timestamp: now,
      summaryAr: newIsRevised
        ? `تمت مراجعة ومطابقة أمر الشراء والأسعار لأمر البيع #${orderSerial}`
        : `تم إلغاء تأشيرة مراجعة ومطابقة أمر الشراء لأمر البيع #${orderSerial}`,
      summaryEn: newIsRevised
        ? `PO quantities and prices reviewed & verified for order #${orderSerial}`
        : `PO review verification removed for order #${orderSerial}`
    };

    const existingAudit = order.auditTrail || [];
    const updatedAuditTrail = [...existingAudit, auditEvent];

    try {
      const orderRef = doc(db, 'sales_orders', order.id);
      await setDoc(
        orderRef,
        {
          isRevised: newIsRevised,
          revisedAt: newIsRevised ? now : null,
          revisedBy: newIsRevised ? currentUserName : null,
          revisedById: newIsRevised ? (currentUser?.id || currentUser?.uid || '') : null,
          auditTrail: updatedAuditTrail,
          updatedAt: serverTimestamp(),
          updatedBy: currentUserName
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error toggling PO review status:', err);
      alert(isAr ? 'حدث خطأ أثناء تحديث حالة مراجعة الطلب' : 'Failed to update review status');
    }
  };

  // Confirm cancellation of an order
  const handleConfirmCancelOrder = async () => {
    if (!cancelModalOrder?.id) return;
    setIsCanceling(true);
    const now = new Date().toISOString();
    const orderSerial = resolveOrderSerial(cancelModalOrder, orders);

    const auditEvent = {
      id: `AUD-${Date.now()}-${(cancelModalOrder.auditTrail || []).length + 1}`,
      action: 'cancel',
      performedBy: currentUserName,
      performedById: currentUser?.id || currentUser?.uid || '',
      timestamp: now,
      summaryAr: `تم إلغاء أمر البيع #${orderSerial}${cancelReason.trim() ? ` — السبب: ${cancelReason.trim()}` : ''}`,
      summaryEn: `Canceled order #${orderSerial}${cancelReason.trim() ? ` — Reason: ${cancelReason.trim()}` : ''}`,
      cancellationReason: cancelReason.trim() || null
    };

    const existingAudit = cancelModalOrder.auditTrail || [];
    const updatedAuditTrail = [...existingAudit, auditEvent];

    try {
      const orderRef = doc(db, 'sales_orders', cancelModalOrder.id);
      await setDoc(
        orderRef,
        {
          confirmationStatus: 'canceled',
          cancellationReason: cancelReason.trim() || null,
          canceledAt: now,
          canceledBy: currentUserName,
          canceledById: currentUser?.id || currentUser?.uid || '',
          auditTrail: updatedAuditTrail,
          updatedAt: serverTimestamp(),
          updatedBy: currentUserName
        },
        { merge: true }
      );
      setCancelModalOrder(null);
      setCancelReason('');
    } catch (err) {
      console.error('Error canceling order:', err);
      alert(isAr ? 'حدث خطأ أثناء إلغاء الأمر' : 'Failed to cancel order');
    } finally {
      setIsCanceling(false);
    }
  };

  // Restore a canceled order back to confirmed
  const handleRestoreCanceledOrder = async (order) => {
    if (!order?.id) return;
    const orderSerial = resolveOrderSerial(order, orders);
    const now = new Date().toISOString();
    const auditEvent = {
      id: `AUD-${Date.now()}-${(order.auditTrail || []).length + 1}`,
      action: 'restore',
      performedBy: currentUserName,
      performedById: currentUser?.id || currentUser?.uid || '',
      timestamp: now,
      summaryAr: `تم استعادة أمر البيع #${orderSerial} من حالة الإلغاء`,
      summaryEn: `Restored order #${orderSerial} from canceled state`
    };

    const existingAudit = order.auditTrail || [];
    const updatedAuditTrail = [...existingAudit, auditEvent];

    try {
      const orderRef = doc(db, 'sales_orders', order.id);
      await setDoc(
        orderRef,
        {
          confirmationStatus: 'confirmed',
          cancellationReason: null,
          canceledAt: null,
          canceledBy: null,
          canceledById: null,
          auditTrail: updatedAuditTrail,
          updatedAt: serverTimestamp(),
          updatedBy: currentUserName
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error restoring order:', err);
      alert(isAr ? 'حدث خطأ أثناء استعادة الأمر' : 'Failed to restore order');
    }
  };

  // Helper to resolve inline-start status bar (applied to first <td> and <tr> so RTL/LTR renders cleanly in border-collapse tables)
  const resolveRowStartBorder = (order, isExpanded) => {
    if (order.confirmationStatus === 'canceled') return 'border-s-[4px] border-s-rose-400';
    if (isExpanded) return 'border-s-[4px] border-s-indigo-600';
    switch (order.fulfillmentStatus) {
      case 'prepare':
        return SALES_FULFILLMENT_STYLE_MAP.prepare.startBorderClasses;
      case 'shipped':
      case 'out_for_delivery':
        return SALES_FULFILLMENT_STYLE_MAP.shipped.startBorderClasses;
      case 'delivered':
        return SALES_FULFILLMENT_STYLE_MAP.delivered.startBorderClasses;
      case 'paid':
        return SALES_FULFILLMENT_STYLE_MAP.paid.startBorderClasses;
      default:
        return SALES_FULFILLMENT_STYLE_MAP.not_yet.startBorderClasses;
    }
  };

  // Helper to determine table row background and record separator based on status and fulfillment
  const resolveRowBackground = (order, isExpanded) => {
    const startBorder = resolveRowStartBorder(order, isExpanded);
    if (order.confirmationStatus === 'canceled') {
      return `${startBorder} bg-slate-100/90 opacity-60 grayscale-[25%] ${isExpanded ? 'border-b border-rose-200/70' : 'border-b-[3px] border-slate-200/90'}`;
    }
    if (isExpanded) {
      return `${startBorder} bg-indigo-50/35 border-b border-indigo-200/80`;
    }
    switch (order.fulfillmentStatus) {
      case 'prepare':
        return `${startBorder} ${SALES_FULFILLMENT_STYLE_MAP.prepare.rowClasses} border-b-[3px] border-slate-200/90`;
      case 'shipped':
      case 'out_for_delivery':
        return `${startBorder} ${SALES_FULFILLMENT_STYLE_MAP.shipped.rowClasses} border-b-[3px] border-slate-200/90`;
      case 'delivered':
        return `${startBorder} ${SALES_FULFILLMENT_STYLE_MAP.delivered.rowClasses} border-b-[3px] border-slate-200/90`;
      case 'paid':
        return `${startBorder} ${SALES_FULFILLMENT_STYLE_MAP.paid.rowClasses} border-b-[3px] border-slate-200/90`;
      default:
        return `${startBorder} ${SALES_FULFILLMENT_STYLE_MAP.not_yet.rowClasses} border-b-[3px] border-slate-200/90`;
    }
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // When financial documents are merged on the parent order, collapse into ONE card on Sales Orders tab
      // while Loading Plan keeps each split truck portion as an independent schedulable load.
      if (order.splitParentId && order.invoiceSplitMode === 'merged_on_parent') {
        return false;
      }

      // 1. Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const orderSerial = resolveOrderSerial(order, orders);
        const matchesSerial = orderSerial.includes(q) || `#${orderSerial}`.includes(q);
        const matchesClient = (order.clientName || '').toLowerCase().includes(q) || (order.clientId || '').toLowerCase().includes(q);
        const matchesBranch = (order.branchName || '').toLowerCase().includes(q) || (order.region || '').toLowerCase().includes(q);
        const matchesPo = (order.poTawoos || '').toLowerCase().includes(q) || (order.poPrivateLabel || '').toLowerCase().includes(q);
        const matchesComments = (order.internalComments || '').toLowerCase().includes(q) || (order.externalComments || '').toLowerCase().includes(q);
        const matchesLines = (order.lines || []).some(
          (l) => (l.productCode || '').toLowerCase().includes(q) || (l.productNameAr || '').toLowerCase().includes(q) || (l.productNameEn || '').toLowerCase().includes(q)
        );

        if (!matchesSerial && !matchesClient && !matchesBranch && !matchesPo && !matchesComments && !matchesLines) {
          return false;
        }
      }

      // 2. Client filter
      if (clientFilter !== 'all' && order.clientId !== clientFilter) {
        return false;
      }

      // 3. Order Type filter
      if (orderTypeFilter !== 'all' && order.orderType !== orderTypeFilter) {
        return false;
      }

      // 4. Confirmation Status filter
      if (confirmationFilter !== 'all' && order.confirmationStatus !== confirmationFilter) {
        return false;
      }

      // 5. Fulfillment Status filter
      if (fulfillmentFilter !== 'all' && order.fulfillmentStatus !== fulfillmentFilter) {
        return false;
      }

      // 6. Tax Mode filter
      if (vatModeFilter !== 'all' && order.vatMode !== vatModeFilter) {
        return false;
      }

      // 7. Date range filter
      const targetDate = dateFilterType === 'loadingDate' ? order.loadingDate : order.invoiceDate;
      if (startDateFilter && (!targetDate || targetDate < startDateFilter)) {
        return false;
      }
      if (endDateFilter && (!targetDate || targetDate > endDateFilter)) {
        return false;
      }

      // 8. Revised Only filter
      if (revisedOnlyFilter && !order.isRevised && order.confirmationStatus !== 'revised') {
        return false;
      }

      // 9. Assignment / Truck filter
      if (assignmentFilter === 'assigned') {
        if (!order.assignedVehicleId && !order.loadingOrderNumber) {
          return false;
        }
      } else if (assignmentFilter === 'unassigned') {
        if (order.assignedVehicleId || order.loadingOrderNumber) {
          return false;
        }
      } else if (assignmentFilter !== 'all') {
        if (order.assignedVehicleId !== assignmentFilter) {
          return false;
        }
      }

      return true;
    });
  }, [
    orders,
    searchTerm,
    clientFilter,
    orderTypeFilter,
    confirmationFilter,
    fulfillmentFilter,
    vatModeFilter,
    assignmentFilter,
    dateFilterType,
    startDateFilter,
    endDateFilter,
    revisedOnlyFilter
  ]);

  // Grouped filtered orders if groupBy is selected
  const groupedOrders = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupKey: 'all', groupLabel: '', items: filteredOrders }];
    }

    const groupsMap = {};

    filteredOrders.forEach((o) => {
      let key = 'other';
      let label = isAr ? 'أخرى' : 'Other';

      if (groupBy === 'fulfillmentStatus') {
        key = o.fulfillmentStatus || 'not_yet';
        const item = FULFILLMENT_STATUSES.find((s) => s.id === key);
        label = item ? (isAr ? item.labelAr : item.labelEn) : key;
      } else if (groupBy === 'confirmationStatus') {
        key = o.confirmationStatus || 'confirmed';
        const item = CONFIRMATION_STATUSES.find((s) => s.id === key);
        label = item ? (isAr ? item.labelAr : item.labelEn) : key;
      } else if (groupBy === 'client') {
        key = o.clientId || 'unknown';
        label = o.clientName || o.clientId || (isAr ? 'عميل غير محدد' : 'Unknown Client');
      } else if (groupBy === 'region') {
        key = o.region || 'unassigned';
        label = o.region || (isAr ? 'منطقة غير محددة' : 'Unassigned Region');
      } else if (groupBy === 'vatMode') {
        key = o.vatMode || 'none';
        const item = VAT_MODES.find((v) => v.id === key);
        label = item ? (isAr ? item.labelAr : item.labelEn) : key;
      } else if (groupBy === 'orderType') {
        key = o.orderType || 'supply';
        const item = ORDER_TYPES.find((t) => t.id === key);
        label = item ? (isAr ? item.labelAr : item.labelEn) : key;
      } else if (groupBy === 'assignedVehicle') {
        key = o.assignedVehicleId || 'unassigned';
        const matchedVeh = vehicles.find((v) => v.id === o.assignedVehicleId);
        const vName = resolveVehicleDisplayName(matchedVeh, o.assignedVehicleName);
        const vPlate = o.assignedVehiclePlate || matchedVeh?.plateNumber || '';
        label = vName
          ? `${vName}${vPlate ? ` (${vPlate})` : ''}`
          : (isAr ? 'أوامر غير مسكنة بشاحنة' : 'Unassigned Orders');
      }

      if (!groupsMap[key]) {
        groupsMap[key] = {
          groupKey: key,
          statusKey: groupBy === 'fulfillmentStatus' ? (key === 'out_for_delivery' ? 'shipped' : key) : null,
          groupLabel: label,
          items: []
        };
      }
      groupsMap[key].items.push(o);
    });

    return Object.values(groupsMap);
  }, [filteredOrders, groupBy, isAr, vehicles]);

  // KPI Summary Metrics: skip split parent reference ONLY when billed separately per portion (merged parents represent the sole row)
  const summaryMetrics = useMemo(() => {
    let totalOrders = 0;
    let totalCartons = 0;
    let totalWeightKg = 0;
    let totalValue = 0;
    let pendingFulfillment = 0;
    let confirmedCount = 0;

    filteredOrders.forEach((o) => {
      if (o.isSplitParent && o.invoiceSplitMode !== 'merged_on_parent') return;
      totalOrders++;
      totalCartons += Number(o.totalCartons || o.totalQty || 0);
      totalWeightKg += Number(o.totalWeightKg || 0);
      totalValue += Number(o.grandTotal || 0);
      if (o.fulfillmentStatus === 'not_yet' || o.fulfillmentStatus === 'prepare') {
        pendingFulfillment++;
      }
      if (o.confirmationStatus === 'confirmed') {
        confirmedCount++;
      }
    });

    return {
      totalOrders,
      totalCartons,
      totalWeightTons: (totalWeightKg / 1000).toFixed(2),
      totalValue,
      pendingFulfillment,
      confirmedCount
    };
  }, [filteredOrders]);

  // Trigger Split Order Workflow (Create new split OR Edit/Reallocate existing split parent)
  const handleRequestSplitOrder = (order) => {
    if (!order) return;
    if (order.isSplitParent) {
      if (!canSplitOrder) {
        alert(
          isAr
            ? 'عذراً، لا تملك صلاحية تعديل تقسيم أوامر البيع. يرجى مراجعة مدير النظام لتفعيل صلاحية (تقسيم أمر البيع).'
            : 'You do not have permission to edit split sales orders (canSplitOrder).'
        );
        return;
      }
      setSplitModalOrder(order);
      return;
    }
    if (order.splitParentId) {
      const parentOrder = orders.find((o) => o.id === order.splitParentId);
      if (parentOrder) {
        if (!canSplitOrder) {
          alert(
            isAr
              ? 'عذراً، لا تملك صلاحية تعديل تقسيم أوامر البيع. يرجى مراجعة مدير النظام لتفعيل صلاحية (تقسيم أمر البيع).'
              : 'You do not have permission to edit split sales orders (canSplitOrder).'
          );
          return;
        }
        setSplitModalOrder(parentOrder);
        return;
      }
      setSplitGuidanceOrder({
        order,
        reason: 'already_child'
      });
      return;
    }
    const status = order.fulfillmentStatus || 'not_yet';
    if (status !== 'not_yet') {
      setSplitGuidanceOrder({
        order,
        reason: 'not_pending',
        currentStatus: status
      });
      return;
    }
    if (!canSplitOrder) {
      alert(
        isAr
          ? 'عذراً، لا تملك صلاحية تقسيم أوامر البيع. يرجى مراجعة مدير النظام لتفعيل صلاحية (تقسيم أمر البيع).'
          : 'You do not have permission to split sales orders (canSplitOrder).'
      );
      return;
    }
    setSplitModalOrder(order);
  };

  // Delete Order Handler
  const handleDeleteOrder = async (orderId) => {
    try {
      await deleteDoc(doc(db, 'sales_orders', orderId));
      setDeleteConfirmOrder(null);
      setActiveActionsMenuOrderId(null);
    } catch (err) {
      console.error('Error deleting sales order:', err);
      alert(isAr ? 'حدث خطأ أثناء حذف أمر البيع.' : 'Error deleting sales order.');
    }
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    const headers = [
      isAr ? 'مسلسل' : 'Serial',
      isAr ? 'تاريخ الفاتورة' : 'Invoice Date',
      isAr ? 'تاريخ التحميل' : 'Loading Date',
      isAr ? 'كود العميل' : 'Client Code',
      isAr ? 'اسم العميل' : 'Client Name',
      isAr ? 'الفرع' : 'Branch',
      isAr ? 'المنطقة' : 'Region',
      isAr ? 'نوع الطلب' : 'Order Type',
      isAr ? 'المعاملة الضريبية' : 'Tax Mode',
      isAr ? 'حالة التأكيد' : 'Confirmation',
      isAr ? 'حالة التنفيذ' : 'Fulfillment',
      isAr ? 'أمر شراء طاووس' : 'PO Tawoos',
      isAr ? 'أمر شراء علامة خاصة' : 'PO Private Label',
      isAr ? 'إجمالي الكراتين' : 'Total Cartons',
      isAr ? 'إجمالي الوزن (كجم)' : 'Total Weight (kg)',
      isAr ? 'صافي قبل الضريبة' : 'Net Pre-Tax',
      isAr ? 'الضريبة' : 'VAT',
      isAr ? 'الخصم والتحصيل' : 'WHT',
      isAr ? 'الإجمالي النهائي' : 'Grand Total'
    ];

    const rows = filteredOrders.map((o) => {
      const serial = resolveOrderSerial(o, orders);
      return [
        `"#${serial}"`,
        `"${o.invoiceDate || ''}"`,
        `"${o.loadingDate || ''}"`,
        `"${o.clientId || ''}"`,
        `"${o.clientName || ''}"`,
        `"${o.branchName || ''}"`,
        `"${o.region || ''}"`,
        `"${o.orderType || ''}"`,
        `"${o.vatMode || ''}"`,
        `"${o.confirmationStatus || ''}"`,
        `"${o.fulfillmentStatus || ''}"`,
        `"${o.poTawoos || ''}"`,
        `"${o.poPrivateLabel || ''}"`,
        o.totalCartons || 0,
        o.totalWeightKg || 0,
        o.netPreTaxSubtotal || 0,
        o.totalVat || 0,
        o.whtAmount || 0,
        o.grandTotal || 0
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_orders_${formatDateKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 select-none font-sans">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Total Orders */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
              {isAr ? 'إجمالي أوامر البيع' : 'Total Orders'}
            </span>
            <span className="text-xl font-black text-slate-800 font-mono">
              {summaryMetrics.totalOrders}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Pending Fulfillment */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
              {isAr ? 'قيد التحميل والتجهيز' : 'Pending Loading'}
            </span>
            <span className="text-xl font-black text-amber-600 font-mono">
              {summaryMetrics.pendingFulfillment}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        {/* 3. Confirmed Orders */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
              {isAr ? 'أوامر مؤكدة' : 'Confirmed Orders'}
            </span>
            <span className="text-xl font-black text-blue-600 font-mono">
              {summaryMetrics.confirmedCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* 4. Total Cartons & Weight */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
              {isAr ? 'إجمالي الكراتين / الشحن' : 'Total Cartons / Tons'}
            </span>
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-xl font-black text-slate-800">
                {summaryMetrics.totalCartons.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 font-semibold">
                ({summaryMetrics.totalWeightTons} {isAr ? 'طن' : 'Ton'})
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        {/* 5. Total Value (EGP) */}
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
              {isAr ? 'إجمالي القيمة المالية' : 'Total Revenue'}
            </span>
            <span className="text-xl font-black text-emerald-700 font-mono truncate block">
              {summaryMetrics.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EGP
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Filter & Action Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث بالمسلسل (#0001)، العميل، الفرع، أمر الشراء PO، الملاحظات...' : 'Search by serial (#0001), client, branch, PO #, notes...'}
              className="w-full ps-10 pe-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
              title={isAr ? 'تصدير إلى ملف CSV' : 'Export to CSV'}
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>{isAr ? 'تصدير CSV' : 'Export'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingOrder(null);
                setIsAdminModal(false);
                setIsEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'أمر بيع جديد' : 'New Sales Order'}</span>
            </button>

            {/* Less Prominent Administrative Action Button */}
            <button
              type="button"
              onClick={() => {
                setEditingOrder(null);
                setIsAdminModal(true);
                setIsEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
              title={isAr ? 'إجراء إداري / مالي (إداري، تحصيل، فاتورة فقط)' : 'Administrative / Financial Action (Admin, Collection, Invoice Only)'}
            >
              <Receipt className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isAr ? 'إجراء إداري / مالي' : 'Admin Action'}</span>
            </button>
          </div>
        </div>

        {/* Dropdown Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-8 gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* 1. Client SearchableSelect */}
          <div className="lg:col-span-2">
            <SearchableSelect
              options={clientFilterOptions}
              value={clientFilter}
              onChange={setClientFilter}
              placeholder={isAr ? 'جميع العملاء' : 'All Clients'}
              searchPlaceholder={isAr ? 'ابحث باسم العميل...' : 'Search client...'}
              isAr={isAr}
            />
          </div>

          {/* 2. Order Type Filter */}
          <div>
            <select
              value={orderTypeFilter}
              onChange={(e) => setOrderTypeFilter(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع أنواع الطلبات' : 'All Types'}</option>
              {ORDER_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {isAr ? t.labelAr : t.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Confirmation Status Filter */}
          <div>
            <select
              value={confirmationFilter}
              onChange={(e) => setConfirmationFilter(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع حالات التأكيد' : 'All Confirmations'}</option>
              {CONFIRMATION_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {isAr ? s.labelAr : s.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Fulfillment Status Filter */}
          <div>
            <select
              value={fulfillmentFilter}
              onChange={(e) => setFulfillmentFilter(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع حالات التنفيذ' : 'All Fulfillments'}</option>
              {FULFILLMENT_STATUSES.map((f) => (
                <option key={f.id} value={f.id}>
                  {isAr ? f.labelAr : f.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Tax Mode Filter */}
          <div>
            <select
              value={vatModeFilter}
              onChange={(e) => setVatModeFilter(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">{isAr ? 'المعاملة الضريبية' : 'All Tax Modes'}</option>
              {VAT_MODES.map((v) => (
                <option key={v.id} value={v.id}>
                  {isAr ? v.labelAr : v.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Assignment / Truck Filter */}
          <div>
            <select
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">{isAr ? 'شاحنة التوزيع: الكل' : 'Truck: All'}</option>
              <option value="assigned">{isAr ? 'تم التسكين بشاحنة' : 'Assigned Only'}</option>
              <option value="unassigned">{isAr ? 'غير مسكن بشاحنة' : 'Unassigned Only'}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {resolveVehicleDisplayName(v, v.plateNumber || (isAr ? 'شاحنة' : 'Truck'))}
                </option>
              ))}
            </select>
          </div>

          {/* 7. Group By */}
          <div>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="none">{isAr ? 'تجميع: بدون تجميع' : 'Group: None'}</option>
              <option value="assignedVehicle">{isAr ? 'تجميع: الشاحنة المخصصة' : 'Group: Assigned Truck'}</option>
              <option value="fulfillmentStatus">{isAr ? 'تجميع: حالة التنفيذ' : 'Group: Fulfillment'}</option>
              <option value="confirmationStatus">{isAr ? 'تجميع: حالة التأكيد' : 'Group: Confirmation'}</option>
              <option value="client">{isAr ? 'تجميع: العميل' : 'Group: Client'}</option>
              <option value="region">{isAr ? 'تجميع: المنطقة' : 'Group: Region'}</option>
              <option value="vatMode">{isAr ? 'تجميع: المعاملة الضريبية' : 'Group: Tax Mode'}</option>
              <option value="orderType">{isAr ? 'تجميع: نوع الطلب' : 'Group: Order Type'}</option>
            </select>
          </div>
        </div>

        {/* Date Range Sub-Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-500 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{isAr ? 'الفترة:' : 'Date Filter:'}</span>
          </span>

          <select
            value={dateFilterType}
            onChange={(e) => setDateFilterType(e.target.value)}
            className="py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700 focus:outline-none cursor-pointer text-[11px]"
          >
            <option value="invoiceDate">{isAr ? 'تاريخ الفاتورة / التسليم' : 'Invoice Date'}</option>
            <option value="loadingDate">{isAr ? 'تاريخ التحميل' : 'Loading Date'}</option>
          </select>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 focus:outline-none"
            />
            <span className="text-slate-400 font-semibold">{isAr ? 'إلى' : 'to'}</span>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 focus:outline-none"
            />
          </div>

          {(startDateFilter || endDateFilter) && (
            <button
              type="button"
              onClick={() => {
                setStartDateFilter('');
                setEndDateFilter('');
              }}
              className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
            >
              {isAr ? 'إعادة ضبط التواريخ' : 'Clear Dates'}
            </button>
          )}

          {/* Quick Filter: Reviewed / Verified Only */}
          <button
            type="button"
            onClick={() => setRevisedOnlyFilter((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
              revisedOnlyFilter
                ? 'bg-blue-600 text-white border-blue-700 shadow-2xs ring-2 ring-blue-300/40'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title={isAr ? 'عرض الأوامر التي تمت مراجعتها ومطابقتها فقط' : 'Show only PO reviewed & verified orders'}
          >
            <FileCheck className="w-3 h-3" />
            <span>{isAr ? 'مُراجَع فقط' : 'Reviewed Only'}</span>
            {revisedOnlyFilter && <Check className="w-3 h-3 ms-0.5" />}
          </button>

          <div className="ms-auto text-slate-400 font-mono text-[11px]">
            {isAr
              ? `عرض ${filteredOrders.length} من أصل ${orders.length} أمر بيع`
              : `Showing ${filteredOrders.length} of ${orders.length} orders`}
          </div>
        </div>
      </div>

      {/* Orders Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <PeacockLoader size="xl" text={isAr ? 'جاري تحميل أوامر البيع...' : 'Loading sales orders...'} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">
              {isAr ? 'لا توجد أوامر بيع مطابقة للفلاتر المحددة' : 'No sales orders match the active filters'}
            </p>
            <p className="text-xs text-slate-400">
              {isAr ? 'جرّب تعديل معايير البحث أو أنشئ أمر بيع جديد' : 'Try adjusting your search criteria or create a new order'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-3 text-start">{isAr ? '#' : '#'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'العميل' : 'Client'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'التاريخ' : 'Dates'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'التشغيل' : 'Schedule'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'الكمية والوزن' : 'Qty & Weight'}</th>
                  <th className="py-3 px-2 text-center w-20">{isAr ? 'VAT' : 'VAT'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'أمر الشراء والمرفقات' : 'PO & Files'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'الملاحظات' : 'Notes'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-3 text-center w-12">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {groupedOrders.map((group) => (
                  <React.Fragment key={group.groupKey}>
                    {/* Optional Group Header Row */}
                    {groupBy !== 'none' && (() => {
                      const gStyle = group.statusKey ? (SALES_FULFILLMENT_STYLE_MAP[group.statusKey] || SALES_FULFILLMENT_STYLE_MAP.not_yet) : null;
                      const gClasses = gStyle
                        ? gStyle.groupBannerClasses
                        : 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-slate-100/95 via-slate-50 to-white border-slate-200 border-s-[4px] border-s-indigo-500 text-slate-900';
                      return (
                        <tr className={`border-t-2 border-b-2 ${gClasses}`}>
                          <td colSpan={10} className={`py-2.5 px-4 font-black text-xs ${gStyle ? gStyle.startBorderClasses : 'border-s-[4px] border-s-indigo-500'}`}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${gStyle ? gStyle.dotClasses : 'bg-indigo-500'}`}></span>
                                <span className="text-sm font-black">{group.groupLabel}</span>
                                <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-lg border ${gStyle ? gStyle.badgeClasses : 'bg-slate-200/80 text-slate-700 border-slate-300'}`}>
                                  {group.items.length} {isAr ? 'أوامر' : 'orders'}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}

                    {group.items.map((order) => {
                      const isExpanded = expandedOrderIds.has(order.id);
                      const orderSerial = resolveOrderSerial(order, orders);
                      const orderTypeObj = ORDER_TYPES.find((t) => t.id === order.orderType) || ORDER_TYPES[0];
                      const confStatusObj = CONFIRMATION_STATUSES.find((s) => s.id === order.confirmationStatus) || CONFIRMATION_STATUSES[0];
                      const fulfStatusObj = FULFILLMENT_STATUSES.find((s) => s.id === order.fulfillmentStatus) || FULFILLMENT_STATUSES[0];
                      const vatModeObj = VAT_MODES.find((v) => v.id === order.vatMode) || VAT_MODES[0];
                      const matchedOrderVehicle = vehicles.find((v) => v.id === order.assignedVehicleId);
                      const orderVehicleDisplayName = resolveVehicleDisplayName(matchedOrderVehicle, order.assignedVehicleName);
                      const orderVehiclePlate = order.assignedVehiclePlate || matchedOrderVehicle?.plateNumber || '';

                      // Client and Branch resolution
                      const clientObj = clients.find((c) => c.id === order.clientId) || null;
                      const branchCount = (clientObj?.branches || []).length;
                      const showBranchName = branchCount > 1 && order.branchName;
                      const targetBranch = (clientObj?.branches || []).find((b) => 
                        (b.id && order.branchId && b.id === order.branchId) ||
                        (b.name && order.branchName && (b.name === order.branchName || b.nameAr === order.branchName)) ||
                        (b.nameAr && order.branchName && b.nameAr === order.branchName)
                      ) || clientObj?.branches?.[0] || null;
                      const locationUrl = resolveLocationUrl(targetBranch, clientObj, order);
                      const profile = resolveOrderOperationalProfile(order, clientObj, isAr);

                      // Segment resolution
                      const rawSegKey = clientObj?.segmentId || clientObj?.segment || order?.clientSegmentId || order?.segmentId || order?.segment || null;
                      const segObj = rawSegKey ? (segmentMap[rawSegKey] || (segments.length > 0 ? segments : PRESET_DEFAULT_SEGMENTS).find((s) => s.id === rawSegKey || s.nameAr === rawSegKey || s.nameEn === rawSegKey || s.code === rawSegKey)) : null;
                      const SegIcon = (segObj?.icon && SEGMENT_ICON_MAP[segObj.icon]) ? SEGMENT_ICON_MAP[segObj.icon] : Building2;
                      const segColor = segObj?.color || '#64748b';
                      const splitChildPortions = order.isSplitParent
                        ? orders
                            .filter((o) => o.splitParentId === order.id)
                            .sort((a, b) => (Number(a.splitIndex) || 0) - (Number(b.splitIndex) || 0))
                        : [];

                      return (
                        <React.Fragment key={order.id}>
                          <tr
                            id={`sales-order-row-${order.id}`}
                            data-comment-doc={order.id}
                            onClick={() => toggleRowExpand(order.id)}
                            className={`transition cursor-pointer select-none ${resolveRowBackground(order, isExpanded)}`}
                          >
                            {/* 1. Type & Serial */}
                            <td className={`py-3 px-3 whitespace-nowrap ${resolveRowStartBorder(order, isExpanded)}`}>
                              <div className="flex flex-col gap-1 items-start">
                                {/* Order Type Badge */}
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                                  order.orderType === 'admin'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : order.orderType === 'collection'
                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                    : order.orderType?.startsWith('invoice_only')
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  {order.orderType === 'admin' ? (
                                    <Landmark className="w-3 h-3 text-purple-600 shrink-0" />
                                  ) : order.orderType === 'collection' ? (
                                    <Receipt className="w-3 h-3 text-teal-600 shrink-0" />
                                  ) : (
                                    <ShoppingCart className="w-3 h-3 text-emerald-600 shrink-0" />
                                  )}
                                  <span>{isAr ? orderTypeObj.labelAr : orderTypeObj.labelEn}</span>
                                </span>

                                {/* Subtle Serial & Audit History */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className="font-mono text-[11px] text-slate-500 font-bold tracking-tight select-all"
                                    title={isAr ? `مسلسل أمر البيع: #${orderSerial}` : `Order Serial: #${orderSerial}`}
                                  >
                                    #{orderSerial}
                                  </span>

                                  {order.isSplitParent && (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-[10px] font-black text-violet-800 bg-violet-50 border border-violet-200 px-1.5 py-0.2 rounded-md"
                                      title={
                                        isAr
                                          ? 'طلب مقسّم على عدة شاحنات في خطة التحميل'
                                          : 'Order split across multiple truck dispatches in Loading Plan'
                                      }
                                    >
                                      <GitFork className="w-2.5 h-2.5 text-violet-600" />
                                      <span>
                                        {order.invoiceSplitMode === 'merged_on_parent'
                                          ? (isAr
                                              ? `مقسم (${order.splitTotal || splitChildPortions.length} شحنات)`
                                              : `Split (${order.splitTotal || splitChildPortions.length} Trips)`)
                                          : (isAr
                                              ? `أمر أم مقسم (${order.splitTotal || splitChildPortions.length})`
                                              : `Split Parent (${order.splitTotal || splitChildPortions.length})`)}
                                      </span>
                                    </span>
                                  )}

                                  {order.isSplitParent && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                      order.invoiceSplitMode === 'merged_on_parent'
                                        ? 'text-amber-800 bg-amber-50 border-amber-200'
                                        : 'text-slate-600 bg-slate-100 border-slate-200'
                                    }`}>
                                      {order.invoiceSplitMode === 'merged_on_parent'
                                        ? (isAr ? 'فاتورة موحدة' : 'Merged Invoice')
                                        : (isAr ? 'مستندات منفصلة' : 'Split Docs')}
                                    </span>
                                  )}

                                  {order.splitParentId && (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-[10px] font-black text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-md"
                                      title={isAr ? `جزء من الأمر #${order.baseSerial || ''}` : `Portion of #${order.baseSerial || ''}`}
                                    >
                                      <GitFork className="w-2.5 h-2.5 text-blue-600" />
                                      <span>{isAr ? `جزء ${order.splitIndex}/${order.splitTotal}` : `Portion ${order.splitIndex}/${order.splitTotal}`}</span>
                                    </span>
                                  )}

                                  {order.splitParentId && order.invoiceSplitMode === 'merged_on_parent' && (
                                    <span
                                      className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded"
                                      title={isAr ? 'الفاتورة الضريبية مجمعة على الأمر الأصلي' : 'VAT Invoice covered under parent order'}
                                    >
                                      {isAr ? `مفوتر على #${order.baseSerial || ''}` : `Billed under #${order.baseSerial || ''}`}
                                    </span>
                                  )}

                                  {order.auditTrail?.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAuditModalOrder(order);
                                      }}
                                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1 py-0.2 rounded cursor-pointer transition shadow-2xs"
                                      title={isAr ? `سجل التعديلات (${order.auditTrail.length})` : `Audit trail (${order.auditTrail.length})`}
                                    >
                                      <History className="w-2.5 h-2.5 text-indigo-600" />
                                      <span>{order.auditTrail.length}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Client & Branch & Region & Location */}
                            <td className="py-3 px-3">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                                  {order.orderType === 'admin' && !order.clientId ? (
                                    <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-purple-50 text-purple-700 border border-purple-200">
                                      <Landmark className="w-3.5 h-3.5" />
                                    </span>
                                  ) : (
                                    <span
                                      className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 shadow-2xs overflow-hidden"
                                      style={{
                                        backgroundColor: `${segColor}18`,
                                        color: segColor,
                                        border: `1px solid ${segColor}35`
                                      }}
                                      title={segObj ? (isAr ? segObj.nameAr : segObj.nameEn) : ''}
                                    >
                                      {clientObj?.logo ? (
                                        <img
                                          src={clientObj.logo}
                                          alt=""
                                          className="w-full h-full object-contain p-0.5 rounded-md"
                                        />
                                      ) : (
                                        <SegIcon className="w-3.5 h-3.5 shrink-0" />
                                      )}
                                    </span>
                                  )}
                                  <span className="truncate max-w-[200px]">
                                    {order.orderType === 'admin' && !order.clientId
                                      ? (isAr ? 'إجراء إداري عام' : 'General Administrative')
                                      : (order.clientName || order.clientId || '—')}
                                  </span>
                                </span>

                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                  {/* Branch Name: only shown if client has multiple branches */}
                                  {showBranchName && (
                                    <span className="font-medium text-slate-600">{order.branchName}</span>
                                  )}

                                  {/* Region Chip */}
                                  {order.region && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                                      <MapPin className="w-2.5 h-2.5 text-slate-400" />
                                      <span>{order.region}</span>
                                    </span>
                                  )}

                                  {/* Location Map Icon: Green if available, disabled gray if missing */}
                                  {locationUrl ? (
                                    <a
                                      href={locationUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer"
                                      title={isAr ? 'فتح موقع الفرع على الخريطة' : 'Open Location on Map'}
                                    >
                                      <Map className="w-3.5 h-3.5 text-emerald-600" />
                                    </a>
                                  ) : (
                                    <span
                                      className="p-0.5 text-slate-300 cursor-not-allowed"
                                      title={isAr ? 'لا يوجد موقع مسجل' : 'No map location'}
                                    >
                                      <Map className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 3. Dates & Preserved Truck Assignment */}
                            <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1 text-slate-700 font-bold font-mono">
                                  <Receipt className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{order.invoiceDate || '—'}</span>
                                </div>
                                {!['admin', 'collection'].includes(order.orderType) && (
                                  <div className="flex items-center gap-1 text-slate-500 font-medium font-mono">
                                    <Calendar className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>{order.loadingDate || order.invoiceDate || '—'}</span>
                                  </div>
                                )}
                                {/* Preserved Truck / Dispatch Badge */}
                                {(orderVehicleDisplayName || order.loadingOrderNumber) ? (
                                  <div className="flex flex-col gap-1 items-start">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNavigateToLoadingPlan(order);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-800 hover:bg-indigo-100 hover:text-indigo-950 border border-indigo-200/90 shadow-2xs transition cursor-pointer max-w-[180px] truncate"
                                      title={
                                        isAr
                                          ? `مُسكن في رحلة #${order.loadingOrderNumber || '—'} — سيارة: ${orderVehicleDisplayName || ''} (${orderVehiclePlate || ''}) — سائق: ${order.assignedDriverName || '—'} — انقر لفتح وتعديل خطة التحميل والتوزيع`
                                          : `Assigned to Trip #${order.loadingOrderNumber || '—'} — Truck: ${orderVehicleDisplayName || ''} (${orderVehiclePlate || ''}) — Driver: ${order.assignedDriverName || '—'} — Click to open in Loading Plan`
                                      }
                                    >
                                      <Truck className="w-3 h-3 text-indigo-600 shrink-0 rtl:-scale-x-100" />
                                      <span className="truncate">{orderVehicleDisplayName || orderVehiclePlate || (isAr ? 'شاحنة' : 'Truck')}</span>
                                      {order.loadingOrderNumber && (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-200/80 text-indigo-950 font-mono font-black shrink-0">
                                          #{order.loadingOrderNumber}
                                        </span>
                                      )}
                                    </button>
                                    {orderVehiclePlate && (
                                      <span
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-slate-100 border border-slate-200 font-mono text-[9px] font-bold text-slate-600"
                                      >
                                        <span>{orderVehiclePlate}</span>
                                        <CopyButton text={orderVehiclePlate} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} />
                                      </span>
                                    )}
                                  </div>
                                ) : !['admin', 'collection', 'invoice_only_with_tax', 'invoice_only_no_tax'].includes(order.orderType) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNavigateToLoadingPlan(order);
                                    }}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 hover:bg-slate-100 px-1 py-0.5 rounded transition cursor-pointer"
                                    title={isAr ? 'الطلب غير مسكن بشاحنة — انقر للتسكين في خطة التحميل' : 'Unassigned — Click to assign in Loading Plan'}
                                  >
                                    <Truck className="w-2.5 h-2.5 text-slate-300 rtl:-scale-x-100" />
                                    <span className="italic">{isAr ? 'غير مسكن' : 'Unassigned'}</span>
                                  </button>
                                ) : null}
                              </div>
                            </td>

                            {/* 4. Operating Schedule Key Info */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700 font-semibold">
                                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{profile.scheduleDisplay}</span>
                                </div>
                                {profile.hasHolidays && (
                                  <div className="flex items-center gap-1 text-[10px] text-rose-700 font-bold">
                                    <Calendar className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                                    <span className="truncate max-w-[130px]" title={isAr ? 'عطلة أسبوعية' : 'Weekly holiday'}>
                                      {profile.holidaysDisplay}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 5. Cartons & Weight in Tons (Cartons kept above weight) */}
                            <td className="py-3 px-3 whitespace-nowrap font-mono">
                              {order.orderType === 'admin' || order.orderType === 'collection' ? (
                                <span className="text-slate-300 font-mono block">—</span>
                              ) : (
                                <div className="flex flex-col gap-0.5 items-start">
                                  <span className="font-bold text-slate-800 text-xs font-mono">
                                    {(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                    {order.totalBonus > 0 ? (
                                      <span className="text-emerald-600 text-[10px] font-bold ms-1">+{order.totalBonus}</span>
                                    ) : null}
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold bg-slate-100/90 text-slate-700 border border-slate-200 shadow-2xs">
                                    <Weight className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                    <span>{((order.totalWeightKg || 0) / 1000).toFixed(1)} {isAr ? 'طن' : 'Ton'}</span>
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* 6. VAT (Narrow Column with Abbreviated Mode Chip) */}
                            <td className="py-3 px-2 text-center whitespace-nowrap">
                              {renderVatAbbrChip(order.vatMode, order.orderType, isAr)}
                            </td>

                            {/* 7. Purchase Orders & Attachments (Merged, files on last line as small icons) */}
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px]">
                              <div className="flex flex-col gap-0.5">
                                {order.poTawoos && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-800 font-bold" title={isAr ? 'أمر شراء طاووس' : 'Tawoos PO'}>
                                      <span className="text-[9px] text-slate-400 font-sans me-0.5">{isAr ? 'طاووس:' : 'TW:'}</span>
                                      {order.poTawoos}
                                    </span>
                                    <CopyButton text={order.poTawoos} title={isAr ? 'نسخ أمر شراء طاووس' : 'Copy Tawoos PO #'} isAr={isAr} />
                                  </div>
                                )}
                                {order.poPrivateLabel && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-purple-700 font-bold" title={isAr ? 'أمر شراء علامة خاصة' : 'PL PO'}>
                                      <span className="text-[9px] text-purple-400 font-sans me-0.5">{isAr ? 'علامة:' : 'PL:'}</span>
                                      {order.poPrivateLabel}
                                    </span>
                                    <CopyButton text={order.poPrivateLabel} title={isAr ? 'نسخ أمر شراء العلامة الخاصة' : 'Copy Private Label PO #'} isAr={isAr} />
                                  </div>
                                )}
                                {!order.poTawoos && !order.poPrivateLabel && (order.poAttachments || []).length === 0 && (
                                  <span className="text-slate-300 font-mono">—</span>
                                )}

                                {/* Attachments placed on the last line as small icon for each file */}
                                {(order.poAttachments || []).length > 0 && (
                                  <div className="flex items-center gap-1 pt-1 flex-wrap">
                                    {order.poAttachments.map((att, attIdx) => (
                                      <button
                                        key={attIdx}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (att.url) setLightboxImage({ url: att.url, title: att.poLabel || att.name });
                                        }}
                                        className="p-1 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 border border-slate-200 transition cursor-pointer shadow-2xs flex items-center justify-center"
                                        title={att.poLabel || att.name || (isAr ? 'مرفق' : 'Attachment')}
                                      >
                                        <Paperclip className="w-2.5 h-2.5 shrink-0" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 8. Single Comments Column (Supports Multiple Lines) - Internal on top */}
                            <td className="py-3 px-3">
                              <div className="flex flex-col gap-1 items-start min-w-[130px] max-w-[200px]">
                                {/* Internal confidential comment (FIRST) */}
                                {order.internalComments && (
                                  <div
                                    className="flex items-start gap-1 p-1 rounded-md text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200/70 w-full whitespace-pre-wrap break-words leading-relaxed shadow-2xs"
                                    title={`${isAr ? 'ملاحظة داخلية سرية:' : 'Internal Secret Note:'} ${order.internalComments}`}
                                  >
                                    <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0 mt-0.5" />
                                    <span className="break-words">{order.internalComments}</span>
                                  </div>
                                )}
                                {/* External client comment (SECOND) */}
                                {order.externalComments && (
                                  <div
                                    className="flex items-start gap-1 p-1 rounded-md text-[10px] font-medium bg-blue-50 text-blue-900 border border-blue-200/70 w-full whitespace-pre-wrap break-words leading-relaxed shadow-2xs"
                                    title={`${isAr ? 'ملاحظة خارجية للعميل:' : 'External Note:'} ${order.externalComments}`}
                                  >
                                    <MessageSquare className="w-2.5 h-2.5 text-blue-600 shrink-0 mt-0.5" />
                                    <span className="break-words">{order.externalComments}</span>
                                  </div>
                                )}
                                {order.adminNotes && !order.externalComments && !order.internalComments && (
                                  <div
                                    className="flex items-start gap-1 p-1 rounded-md text-[10px] font-medium bg-purple-50 text-purple-900 border border-purple-200/70 w-full whitespace-pre-wrap break-words leading-relaxed"
                                    title={order.adminNotes}
                                  >
                                    <FileText className="w-2.5 h-2.5 text-purple-600 shrink-0 mt-0.5" />
                                    <span className="break-words">{order.adminNotes}</span>
                                  </div>
                                )}
                                {!order.externalComments && !order.internalComments && !order.adminNotes && (
                                  <span className="text-slate-300 font-mono">—</span>
                                )}
                              </div>
                            </td>

                            {/* 9. Status (Confirmation, Complementary Revised Toggle & Fulfillment) - MOVED TO THE END */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex flex-col gap-1.5 items-start">
                                {/* Confirmation Status & Revised Toggle Row */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {/* Confirmation Status: Confirmed is default hidden; not_confirmed and canceled are shown */}
                                  {order.confirmationStatus === 'not_confirmed' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                                      <span>{isAr ? 'غير مؤكد' : 'Not Confirmed'}</span>
                                    </span>
                                  )}
                                  {order.confirmationStatus === 'canceled' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                                      <span>{isAr ? 'ملغي' : 'Canceled'}</span>
                                    </span>
                                  )}

                                  {/* Complementary PO Review / Verification Toggle Button */}
                                  {Boolean(order.isRevised || order.confirmationStatus === 'revised') ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleRevised(order);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs hover:bg-blue-200 transition cursor-pointer"
                                      title={
                                        isAr
                                          ? `تمت مراجعة ومطابقة أمر الشراء والأسعار — بواسطة: ${order.revisedBy || 'غير محدد'}${order.revisedAt ? ` (${new Date(order.revisedAt).toLocaleString('ar-EG')})` : ''} — انقر لإلغاء المراجعة`
                                          : `PO Quantities & Prices Reviewed — By: ${order.revisedBy || 'Unknown'}${order.revisedAt ? ` (${new Date(order.revisedAt).toLocaleString('en-US')})` : ''} — Click to remove review`
                                      }
                                    >
                                      <FileCheck className="w-2.5 h-2.5 text-blue-700" />
                                      <span>{isAr ? 'مُراجَع' : 'Reviewed'}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleRevised(order);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-slate-400 hover:text-blue-700 hover:bg-blue-50 border border-dashed border-slate-300 hover:border-blue-300 transition cursor-pointer"
                                      title={isAr ? 'تأشير بمراجعة ومطابقة تفاصيل وأسعار أمر الشراء قبل التوزيع' : 'Mark as PO Reviewed & Verified before dispatch'}
                                    >
                                      <FileCheck className="w-2.5 h-2.5 text-slate-400" />
                                      <span>{isAr ? 'مراجعة' : 'Review'}</span>
                                    </button>
                                  )}
                                </div>

                                {/* Fulfillment Status (Prominent Corporate Badges matching Loading Plan) */}
                                {order.isSplitParent && splitChildPortions.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {Object.entries(
                                      splitChildPortions.reduce((acc, ch) => {
                                        const st = ch.fulfillmentStatus === 'out_for_delivery' ? 'shipped' : (ch.fulfillmentStatus || 'not_yet');
                                        acc[st] = (acc[st] || 0) + 1;
                                        return acc;
                                      }, {})
                                    ).map(([stKey, cnt]) => {
                                      const stObj = FULFILLMENT_STATUSES.find((s) => s.id === stKey) || FULFILLMENT_STATUSES[0];
                                      const stStyle = SALES_FULFILLMENT_STYLE_MAP[stKey] || SALES_FULFILLMENT_STYLE_MAP.not_yet;
                                      return (
                                        <span
                                          key={stKey}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs ${stStyle.badgeClasses}`}
                                          title={isAr ? 'توزيع حالات الشحنات الفرعية في خطة التحميل' : 'Dispatch portion status breakdown'}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${stStyle.dotClasses}`}></span>
                                          <span>
                                            {cnt}/{splitChildPortions.length} {isAr ? stObj.labelAr : stObj.labelEn}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <>
                                    {(!order.fulfillmentStatus || order.fulfillmentStatus === 'not_yet') &&
                                      !['admin', 'collection', 'invoice_only_with_tax', 'invoice_only_no_tax'].includes(order.orderType) && (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs ${SALES_FULFILLMENT_STYLE_MAP.not_yet.badgeClasses}`}>
                                        <Clock className="w-3 h-3 text-slate-600 shrink-0" />
                                        <span>{isAr ? 'قيد الانتظار' : 'Pending'}</span>
                                      </span>
                                    )}
                                    {order.fulfillmentStatus === 'prepare' && (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs ${SALES_FULFILLMENT_STYLE_MAP.prepare.badgeClasses}`}>
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                                        </span>
                                        <span>{isAr ? 'جاري التجهيز' : 'Preparing'}</span>
                                      </span>
                                    )}
                                    {(order.fulfillmentStatus === 'shipped' || order.fulfillmentStatus === 'out_for_delivery') && (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs ${SALES_FULFILLMENT_STYLE_MAP.shipped.badgeClasses}`}>
                                        <Truck className="w-3 h-3 text-sky-600 animate-pulse rtl:-scale-x-100 shrink-0" />
                                        <span>{isAr ? 'جاري التوصيل' : 'Out for Delivery'}</span>
                                      </span>
                                    )}
                                    {order.fulfillmentStatus === 'delivered' && (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs ${SALES_FULFILLMENT_STYLE_MAP.delivered.badgeClasses}`}>
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span>{isAr ? 'تم التسليم' : 'Delivered'}</span>
                                      </span>
                                    )}
                                    {order.fulfillmentStatus === 'paid' && (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs ${SALES_FULFILLMENT_STYLE_MAP.paid.badgeClasses}`}>
                                        <Banknote className="w-3 h-3 text-indigo-600 shrink-0" />
                                        <span>{isAr ? 'مدفوع' : 'Paid'}</span>
                                      </span>
                                    )}
                                  </>
                                )}
                                {order.hasPartialRejection && Number(order.returnedCartons || 0) > 0 && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs"
                                    title={order.rejectionReason || (isAr ? 'مرتجع جزئي من العميل بعد التحميل' : 'Post-dispatch partial client rejection')}
                                  >
                                    <PackageMinus className="w-3 h-3 text-rose-600 shrink-0" />
                                    <span>
                                      {isAr
                                        ? `مرتجع جزئي: -${Number(order.returnedCartons || 0)} كرتونة`
                                        : `Partial Return: -${Number(order.returnedCartons || 0)} ctn`}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 10. Actions Button (3-dots Portal Menu + Dynamic Row Comment) */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1">
                                <RowCommentButton
                                  docId={order.id}
                                  docNumber={order.serial ? `SO-${order.serial}` : (order.id || 'Order')}
                                  tab="sales_orders"
                                  module="sales"
                                />
                                <button
                                  type="button"
                                  data-order-menu
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (activeActionsMenuOrderId === order.id) {
                                      setActiveActionsMenuOrderId(null);
                                      setActionsMenuAnchor(null);
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setActionsMenuAnchor({
                                        top: rect.bottom + 4,
                                        left: rect.left,
                                        right: rect.right
                                      });
                                      setActiveActionsMenuOrderId(order.id);
                                    }
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                  title={isAr ? 'إجراءات الطلب' : 'Order Actions'}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Order Details Row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/75 border-b-[3px] border-slate-200/95">
                              <td colSpan={10} className={`py-3 px-4 sm:ps-8 sm:pe-6 ${resolveRowStartBorder(order, isExpanded)}`}>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                                  {order.orderType === 'admin' ? (
                                    /* Administrative Directive Display */
                                    <div className="space-y-3">
                                      <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2 text-purple-900 font-black text-xs">
                                            <Landmark className="w-4 h-4 text-purple-600" />
                                            <span>{isAr ? 'نص القرار / البيان الإداري المعتمد:' : 'Administrative Directive Statement:'}</span>
                                          </div>
                                          {order.salesRep && (
                                            <span className="text-[11px] text-purple-700 font-bold">
                                              {isAr ? 'المسؤول / المحرر:' : 'Responsible:'} {order.salesRep}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-slate-800 text-xs leading-relaxed whitespace-pre-wrap font-medium bg-white p-3.5 rounded-lg border border-purple-100">
                                          {order.adminNotes || order.internalComments || (isAr ? 'لا توجد تفاصيل إضافية مسجلة' : 'No details recorded')}
                                        </p>
                                      </div>

                                      {/* Attachments for Admin */}
                                      {(order.poAttachments || []).length > 0 && (
                                        <div className="space-y-1">
                                          <span className="font-bold text-slate-500 block text-xs flex items-center gap-1">
                                            <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                            <span>{isAr ? `المرفقات والمستندات (${order.poAttachments.length}):` : `Attachments (${order.poAttachments.length}):`}</span>
                                          </span>
                                          <div className="flex flex-wrap gap-2 pt-1">
                                            {order.poAttachments.map((att, attIdx) => (
                                              <div
                                                key={attIdx}
                                                onClick={() => {
                                                  if (att.url) setLightboxImage({ url: att.url, title: att.poLabel || att.name });
                                                }}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer transition shadow-2xs"
                                              >
                                                <Eye className="w-3 h-3 text-purple-600" />
                                                <span className="truncate max-w-[140px]">{att.poLabel || att.name}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : order.orderType === 'collection' ? (
                                    /* Financial Collection Details Display */
                                    <div className="space-y-3">
                                      <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl space-y-3">
                                        <div className="flex items-center justify-between border-b border-teal-200/70 pb-2">
                                          <div className="flex items-center gap-2 text-teal-900 font-black text-xs">
                                            <Receipt className="w-4 h-4 text-teal-600" />
                                            <span>{isAr ? 'بيانات التحصيل المالي والسداد:' : 'Financial Collection Details:'}</span>
                                          </div>
                                          <div className="flex items-center gap-1 font-mono font-black text-teal-800 text-sm">
                                            <span>{Number(order.collectionAmount || order.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            <span className="text-xs font-normal">EGP</span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                                          <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                                            <span className="text-slate-400 block text-[10px]">{isAr ? 'طريقة السداد:' : 'Payment Method:'}</span>
                                            <span className="font-bold text-slate-800">
                                              {order.paymentMethod === 'cash' ? (isAr ? '💵 نقد / كاش' : 'Cash') :
                                               order.paymentMethod === 'cheque' ? (isAr ? '📜 شيك بنكي' : 'Bank Cheque') :
                                               order.paymentMethod === 'bank_transfer' ? (isAr ? '🏦 تحويل بنكي' : 'Bank Transfer') :
                                               (isAr ? '📥 إيداع نقدي بالحساب' : 'Direct Deposit')}
                                            </span>
                                          </div>
                                          <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                                            <span className="text-slate-400 block text-[10px]">{isAr ? 'رقم الإيصال / الشيك:' : 'Receipt / Cheque #:'}</span>
                                            <span className="font-mono font-bold text-slate-800">{order.receiptNumber || '—'}</span>
                                          </div>
                                          <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                                            <span className="text-slate-400 block text-[10px]">{isAr ? 'تاريخ السداد / الاستحقاق:' : 'Payment Date:'}</span>
                                            <span className="font-mono font-bold text-slate-800">{order.invoiceDate || '—'}</span>
                                          </div>
                                          {order.adminNotes && (
                                            <div className="sm:col-span-3 bg-white p-2.5 rounded-lg border border-teal-100">
                                              <span className="text-slate-400 block text-[10px]">{isAr ? 'بيانات البنك والملاحظات:' : 'Bank & Payment Notes:'}</span>
                                              <span className="text-slate-700 font-medium whitespace-pre-wrap">{order.adminNotes}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Attachments for Collection */}
                                      {(order.poAttachments || []).length > 0 && (
                                        <div className="space-y-1">
                                          <span className="font-bold text-slate-500 block text-xs flex items-center gap-1">
                                            <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                            <span>{isAr ? `إيصالات ومستندات التحصيل (${order.poAttachments.length}):` : `Receipt Attachments (${order.poAttachments.length}):`}</span>
                                          </span>
                                          <div className="flex flex-wrap gap-2 pt-1">
                                            {order.poAttachments.map((att, attIdx) => (
                                              <div
                                                key={attIdx}
                                                onClick={() => {
                                                  if (att.url) setLightboxImage({ url: att.url, title: att.poLabel || att.name });
                                                }}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer transition shadow-2xs"
                                              >
                                                <Eye className="w-3 h-3 text-teal-600" />
                                                <span className="truncate max-w-[140px]">{att.poLabel || att.name}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    /* Sales Order / Invoice Only Display */
                                    <div className="space-y-3">
                                      {/* Dedicated Dispatch & Loading Assignment Panel (hidden for split parent since dispatch lives on child portions) */}
                                      {!order.isSplitParent && !['admin', 'collection', 'invoice_only_with_tax', 'invoice_only_no_tax'].includes(order.orderType) && (
                                        <div className="p-3 bg-gradient-to-r from-indigo-50/80 via-blue-50/50 to-indigo-50/80 border border-indigo-200/80 rounded-xl space-y-2.5 shadow-2xs">
                                          <div className="flex items-center justify-between border-b border-indigo-200/70 pb-2">
                                            <div className="flex items-center gap-2">
                                              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                                                <Truck className="w-4 h-4" />
                                              </div>
                                              <div>
                                                <h5 className="font-extrabold text-xs text-indigo-950">
                                                  {isAr ? 'بيانات شاحنة التوزيع وأمر التحميل المعتمد' : 'Dispatch Vehicle & Loading Order Details'}
                                                </h5>
                                                <span className="text-[10px] text-indigo-600 font-medium">
                                                  {order.assignedVehicleName || order.loadingOrderNumber
                                                    ? (isAr ? 'بيانات التسكين معتمدة وتُدار حصرياً من تبويب خطة التحميل' : 'Assignment is confirmed & managed in Loading Plan')
                                                    : (isAr ? 'الطلب غير مسكن على شاحنة بعد' : 'Order is currently unassigned')}
                                                </span>
                                              </div>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleNavigateToLoadingPlan(order);
                                              }}
                                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-600 hover:text-white border border-indigo-300 text-indigo-700 text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer group"
                                            >
                                              <span>{order.assignedVehicleName || order.loadingOrderNumber ? (isAr ? 'فتح في خطة التحميل' : 'Open in Loading Plan') : (isAr ? 'تسكين في خطة التحميل' : 'Assign in Loading Plan')}</span>
                                              <ExternalLink className="w-3 h-3 text-indigo-400 group-hover:text-white" />
                                            </button>
                                          </div>

                                          {/* 4-Grid of Preserved Assignment Info */}
                                          {(orderVehicleDisplayName || order.loadingOrderNumber) ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                              <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'الشاحنة المخصصة:' : 'Assigned Truck:'}</span>
                                                <span className="font-black text-slate-900 flex items-center gap-1 mt-0.5">
                                                  <Truck className="w-3.5 h-3.5 text-indigo-600 shrink-0 rtl:-scale-x-100" />
                                                  <span className="truncate">{orderVehicleDisplayName || (isAr ? 'غير محدد' : 'Unknown')}</span>
                                                </span>
                                                {orderVehiclePlate && (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-600 font-mono mt-1">
                                                    <span>{orderVehiclePlate}</span>
                                                    <CopyButton text={orderVehiclePlate} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} />
                                                  </span>
                                                )}
                                              </div>

                                              <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'السائق المعتمد:' : 'Assigned Driver:'}</span>
                                                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                                                  <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                                  <span className="truncate">{order.assignedDriverName || (isAr ? '—' : '—')}</span>
                                                </span>
                                              </div>

                                              <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'مندوب التسليم:' : 'Delivery Rep:'}</span>
                                                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                                                  <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                                  <span className="truncate">{order.assignedDeliveryRepName || (isAr ? '—' : '—')}</span>
                                                </span>
                                              </div>

                                              <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'رقم وتاريخ الرحلة:' : 'Trip # & Loading Date:'}</span>
                                                <span className="font-mono font-black text-indigo-700 text-xs flex items-center gap-1 mt-0.5">
                                                  <PackageCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                                  <span>{order.loadingOrderNumber ? (isAr ? `رحلة #${order.loadingOrderNumber}` : `Trip #${order.loadingOrderNumber}`) : '—'}</span>
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{order.loadingDate || order.invoiceDate || '—'}</span>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="p-3 bg-white rounded-lg border border-indigo-100 text-center text-xs text-slate-500 font-medium">
                                              {isAr
                                                ? 'لم يتم ربط هذا الطلب بشاحنة أو أمر تحميل بعد. يمكنك التسكين مباشرة عبر الانتقال لخطة التحميل.'
                                                : 'No truck or loading order assigned yet. You can assign it via the Loading Plan tab.'}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Split Parent Portions Directory OR Child Lineage Notice */}
                                      {order.isSplitParent && (
                                        <div className="p-3 bg-violet-50/75 border border-violet-200 rounded-xl space-y-2 shadow-2xs">
                                          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-violet-200/70 pb-2">
                                            <div className="flex items-center gap-2">
                                              <div className="w-7 h-7 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-xs">
                                                <GitFork className="w-4 h-4" />
                                              </div>
                                              <div>
                                                <h5 className="font-extrabold text-xs text-violet-950">
                                                  {isAr
                                                    ? `دليل الشحنات الفرعية للأمر المقسم (${splitChildPortions.length} أجزاء)`
                                                    : `Split Order Portions Directory (${splitChildPortions.length} Portions)`}
                                                </h5>
                                                <span className="text-[10px] text-violet-700 font-medium">
                                                  {order.invoiceSplitMode === 'merged_on_parent'
                                                    ? (isAr
                                                        ? 'الفاتورة الضريبية والمستند المالي موحد على هذا الطلب، بينما تم تقسيم التحميل والتسليم إلى الشحنات التالية في خطة التحميل:'
                                                        : 'Billing & financial documents remain consolidated on this order while Loading Plan dispatches it across these portions:')
                                                    : (isAr
                                                        ? 'هذا الأمر الأصلي مرجعي (مستبعد من الإجماليات لتجنب التكرار)، وكل جزء له مستند مالي منفصل.'
                                                        : 'Immutable Parent Reference (excluded from KPI/Loading Plan totals to avoid double-counting). Each portion carries standalone billing.')}
                                                </span>
                                              </div>
                                            </div>
                                            {canSplitOrder && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleRequestSplitOrder(order);
                                                }}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-violet-600 text-violet-800 hover:text-white border border-violet-300 hover:border-violet-600 rounded-lg text-[11px] font-extrabold transition shadow-2xs cursor-pointer"
                                              >
                                                <GitFork className="w-3.5 h-3.5" />
                                                <span>{isAr ? 'تعديل تقسيم الطلب' : 'Edit Split'}</span>
                                              </button>
                                            )}
                                          </div>

                                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                                            {splitChildPortions.map((child) => {
                                              const childVeh = vehicles.find((v) => v.id === child.assignedVehicleId);
                                              const childVehName = resolveVehicleDisplayName(childVeh, child.assignedVehicleName);
                                              const childSerial = resolveOrderSerial(child, orders);
                                              const childStatusKey = (child.fulfillmentStatus === 'out_for_delivery' ? 'shipped' : child.fulfillmentStatus) || 'not_yet';
                                              const childStyle = SALES_FULFILLMENT_STYLE_MAP[childStatusKey] || SALES_FULFILLMENT_STYLE_MAP.not_yet;
                                              const childFulf = FULFILLMENT_STATUSES.find((s) => s.id === childStatusKey) || FULFILLMENT_STATUSES[0];

                                              return (
                                                <div
                                                  key={child.id}
                                                  onMouseEnter={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setHoveredPortionTooltip({
                                                      child,
                                                      childSerial,
                                                      childVehName,
                                                      childStatusKey,
                                                      childStyle,
                                                      childFulf,
                                                      rect
                                                    });
                                                  }}
                                                  onMouseLeave={() => setHoveredPortionTooltip(null)}
                                                  className={`rounded-xl border border-slate-200/90 ${childStyle.startBorderClasses} ${childStyle.rowClasses} p-2.5 flex flex-col gap-1.5 shadow-2xs transition cursor-default`}
                                                >
                                                  <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono font-black text-slate-900 text-xs">
                                                      #{childSerial}
                                                    </span>
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs ${childStyle.badgeClasses}`}>
                                                      {childStatusKey === 'prepare' ? (
                                                        <span className="relative flex h-2 w-2">
                                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                                                        </span>
                                                      ) : childStatusKey === 'shipped' ? (
                                                        <Truck className="w-3 h-3 text-sky-600 animate-pulse rtl:-scale-x-100 shrink-0" />
                                                      ) : childStatusKey === 'delivered' ? (
                                                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                                      ) : childStatusKey === 'paid' ? (
                                                        <Banknote className="w-3 h-3 text-indigo-600 shrink-0" />
                                                      ) : (
                                                        <Clock className="w-3 h-3 text-slate-600 shrink-0" />
                                                      )}
                                                      <span>{isAr ? childFulf.labelAr : childFulf.labelEn}</span>
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono">
                                                    <span>{Number(child.totalCartons || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}</span>
                                                    <span>{((Number(child.totalWeightKg) || 0) / 1000).toFixed(2)} {isAr ? 'طن' : 'Ton'}</span>
                                                    <span className="font-bold text-slate-900">{Number(child.grandTotal || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} EGP</span>
                                                  </div>
                                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 text-[10px]">
                                                    <span className="text-slate-600 truncate flex items-center gap-1 font-medium">
                                                      <Truck className="w-3 h-3 text-indigo-500 shrink-0 rtl:-scale-x-100" />
                                                      <span className="truncate">{childVehName || (isAr ? 'بانتظار التسكين' : 'Awaiting Truck')}</span>
                                                      {child.loadingOrderNumber && (
                                                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 rounded">
                                                          #{child.loadingOrderNumber}
                                                        </span>
                                                      )}
                                                    </span>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setHoveredPortionTooltip(null);
                                                        handleNavigateToLoadingPlan(child);
                                                      }}
                                                      className="text-indigo-600 hover:text-indigo-800 font-bold shrink-0 cursor-pointer"
                                                    >
                                                      {isAr ? 'خطة التحميل' : 'Plan'} {isAr ? '←' : '→'}
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      {order.splitParentId && (
                                        <div className="px-3 py-2 bg-blue-50/75 border border-blue-200 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
                                          <div className="flex items-center gap-2 text-blue-900 font-bold">
                                            <GitFork className="w-4 h-4 text-blue-600 shrink-0" />
                                            <span>
                                              {isAr
                                                ? `شحنة فرعية (${order.splitIndex} من ${order.splitTotal}) للأمر الأصلي #${order.baseSerial || ''}`
                                                : `Split Portion (${order.splitIndex} of ${order.splitTotal}) from parent order #${order.baseSerial || ''}`}
                                            </span>
                                          </div>
                                          <span className="text-[11px] font-semibold text-blue-800 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
                                            {order.invoiceSplitMode === 'merged_on_parent'
                                              ? (isAr ? `الفاتورة الضريبية مجمعة على #${order.baseSerial || ''}` : `Tax Invoice billed under parent #${order.baseSerial || ''}`)
                                              : (isAr ? 'مستند مالي مستقل لهذا الجزء' : 'Standalone billing document')}
                                          </span>
                                        </div>
                                      )}

                                      {/* Full Operating Schedule Card (Hiding Empty Fields) */}
                                      {(profile.hasHours || profile.hasHolidays || profile.hasAddress || profile.hasContact || locationUrl || profile.hasClientNotes || profile.hasBranchNotes || profile.hasNotes) && (
                                        <div className="p-3 bg-slate-50/90 border border-slate-200 rounded-xl space-y-2">
                                          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                                            <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                                              <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                              <span>{isAr ? 'جدول التشغيل والتسليم للعميل' : 'Client Operating & Delivery Schedule'}</span>
                                            </span>
                                            {locationUrl && (
                                              <a
                                                href={locationUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200 px-2 py-0.5 rounded-lg transition"
                                              >
                                                <Map className="w-3 h-3 text-emerald-600" />
                                                <span>{isAr ? 'فتح الخريطة' : 'Open Map'}</span>
                                              </a>
                                            )}
                                          </div>

                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                            {profile.hasHours && (
                                              <div className="bg-white p-2 rounded-lg border border-slate-200">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'مواعيد العمل:' : 'Working Hours:'}</span>
                                                <span className="font-mono font-bold text-slate-800">{profile.scheduleDisplay}</span>
                                              </div>
                                            )}
                                            {profile.hasHolidays && (
                                              <div className="bg-white p-2 rounded-lg border border-slate-200">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'العطلات الأسبوعية:' : 'Weekly Holidays:'}</span>
                                                <span className="font-bold text-rose-700" title={isAr ? 'العطلة الأسبوعية' : 'Weekly holiday'}>
                                                  {profile.holidaysDisplay}
                                                </span>
                                              </div>
                                            )}
                                            {profile.hasAddress && (
                                              <div className="bg-white p-2 rounded-lg border border-slate-200">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'عنوان التسليم:' : 'Delivery Address:'}</span>
                                                <span className="font-bold text-slate-800 truncate block" title={profile.address}>{profile.address}</span>
                                              </div>
                                            )}
                                            {profile.hasContact && (
                                              <div className="bg-white p-2 rounded-lg border border-slate-200">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'مسؤول الاستلام والهواتف:' : 'Contact & Phones:'}</span>
                                                <span className="font-bold text-slate-800 truncate block">
                                                  {profile.contactPerson} {profile.phonesDisplay ? `(${profile.phonesDisplay})` : ''}
                                                </span>
                                              </div>
                                            )}
                                            {profile.hasClientNotes && (
                                              <div className="p-2.5 bg-amber-50/80 border border-amber-200/90 rounded-xl sm:col-span-2 md:col-span-4 flex items-start gap-2 shadow-2xs">
                                                <StickyNote className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                  <span className="text-[10px] text-amber-800 font-bold block font-sans">
                                                    {isAr ? 'ملاحظات وتوجيهات خاصة بالعميل:' : 'Customer Notes & Instructions:'}
                                                  </span>
                                                  <p className="text-xs text-amber-950 font-medium whitespace-pre-wrap break-words leading-relaxed">
                                                    {profile.clientNotes}
                                                  </p>
                                                </div>
                                              </div>
                                            )}
                                            {profile.hasBranchNotes && (
                                              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl sm:col-span-2 md:col-span-4 flex items-start gap-2">
                                                <Building2 className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                  <span className="text-[10px] text-slate-600 font-bold block font-sans">
                                                    {isAr ? 'ملاحظات خاصة بفرع التسليم:' : 'Branch Specific Delivery Notes:'}
                                                  </span>
                                                  <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap break-words leading-relaxed">
                                                    {profile.branchNotes}
                                                  </p>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-b border-slate-100 pb-3">
                                        {/* Comments & Sales Rep */}
                                        <div className="space-y-1">
                                          <span className="font-bold text-slate-500 block">{isAr ? 'الملاحظات ومندوب المبيعات:' : 'Notes & Rep:'}</span>
                                          <div className="space-y-0.5 text-[11px]">
                                            {order.salesRep && (
                                              <div>
                                                <span className="text-slate-400 me-1">{isAr ? 'المندوب:' : 'Rep:'}</span>
                                                <span className="font-bold text-slate-700">{order.salesRep}</span>
                                              </div>
                                            )}
                                            {order.externalComments && (
                                              <div className="text-slate-700 flex items-start gap-1">
                                                <MessageSquare className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                                                <span>{order.externalComments}</span>
                                              </div>
                                            )}
                                            {order.internalComments && (
                                              <div className="text-amber-700 flex items-start gap-1">
                                                <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                                <span>{order.internalComments}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Attachments */}
                                        <div className="space-y-1">
                                          <span className="font-bold text-slate-500 block flex items-center gap-1">
                                            <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                            <span>{isAr ? `المرفقات (${(order.poAttachments || []).length}):` : `Attachments (${(order.poAttachments || []).length}):`}</span>
                                          </span>
                                          {(order.poAttachments || []).length > 0 ? (
                                            <div className="flex flex-wrap gap-2 pt-1">
                                              {order.poAttachments.map((att, attIdx) => (
                                                <div
                                                  key={attIdx}
                                                  onClick={() => {
                                                    if (att.url) setLightboxImage({ url: att.url, title: att.poLabel || att.name });
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer transition shadow-2xs"
                                                >
                                                  <Eye className="w-3 h-3 text-indigo-600" />
                                                  <span className="truncate max-w-[120px]">{att.poLabel || att.name}</span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <span className="text-slate-400 italic text-[11px]">{isAr ? 'لا توجد مرفقات' : 'No attachments'}</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Line Items Table */}
                                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-start border-collapse text-xs">
                                          <thead>
                                            <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                                              <th className="py-2 px-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                                              <th className="py-2 px-3 text-start">{isAr ? 'الكمية' : 'Qty'}</th>
                                              <th className="py-2 px-3 text-start">{isAr ? 'البونص' : 'Bonus'}</th>
                                              <th className="py-2 px-3 text-start">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                                              <th className="py-2 px-3 text-start">{isAr ? 'الخصم/كرتونة' : 'Discount/ctn'}</th>
                                              <th className="py-2 px-3 text-start">{isAr ? 'الضريبة' : 'VAT'}</th>
                                              <th className="py-2 px-3 text-start">{isAr ? 'أ.ت.ص' : 'WHT'}</th>
                                              <th className="py-2 px-3 text-start">{isAr ? 'الوزن' : 'Weight'}</th>
                                              <th className="py-2 px-3 text-end">{isAr ? 'الإجمالي (EGP)' : 'Total (EGP)'}</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 font-mono">
                                            {(order.lines || []).map((line, lIdx) => {
                                              const isWhtApplicable = order.vatMode === 'exclusive_wht' || order.vatMode === 'inclusive_wht';
                                              const lineWht = line.lineWht !== undefined
                                                ? Number(line.lineWht)
                                                : (isWhtApplicable ? Number(line.lineNet || 0) * 0.01 : 0);
                                              const effectiveLineTotal = isWhtApplicable
                                                ? Math.max(0, Number(line.lineNet || 0) + Number(line.lineVat || 0) - lineWht)
                                                : Number(line.lineTotal || 0);

                                              return (
                                                <tr key={lIdx} className="hover:bg-slate-50/50">
                                                  <td className="py-2 px-3 font-sans font-bold text-slate-800">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded border border-indigo-200">
                                                        {line.productCode}
                                                      </span>
                                                      <span>{isAr ? line.productNameAr : (line.productNameEn || line.productNameAr)}</span>
                                                      {line.isPrivateLabel && (
                                                        <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">
                                                          {isAr ? 'علامة خاصة' : 'PL'}
                                                        </span>
                                                      )}
                                                      {line.isPromotional && (
                                                        <span title={isAr ? 'عرض ترويجي' : 'Promotion'}>
                                                          <Zap className="w-3 h-3 text-rose-500 fill-rose-500 shrink-0" />
                                                        </span>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="py-2 px-3 font-bold text-slate-800">{line.qty} {line.largeUnitName || (isAr ? 'كرتونة' : 'ctn')}</td>
                                                  <td className="py-2 px-3 text-emerald-700">{line.bonus > 0 ? `+${line.bonus}` : '—'}</td>
                                                  <td className="py-2 px-3 text-slate-700">{Number(line.detectedUnitPrice || line.unitPrice || 0).toFixed(2)}</td>
                                                  <td className="py-2 px-3 text-rose-600">{Number(line.manualDiscountPerUnit || 0) > 0 ? `-${Number(line.manualDiscountPerUnit).toFixed(2)}` : '—'}</td>
                                                  <td className="py-2 px-3 text-slate-600">{Number(line.lineVat || 0) > 0 ? `${Number(line.lineVat).toFixed(2)} (${line.vatRate || '14%'})` : '0%'}</td>
                                                  <td className="py-2 px-3 text-amber-700 font-semibold">{lineWht > 0 ? `-${lineWht.toFixed(2)}` : '—'}</td>
                                                  <td className="py-2 px-3 text-slate-500">{Number(line.lineWeightKg || 0).toFixed(1)} kg</td>
                                                  <td className="py-2 px-3 text-end font-bold text-slate-900">{effectiveLineTotal.toFixed(2)}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>

                                      {/* Warehouse Return Estimate & Accountant Adjusted Invoice Reconciliation */}
                                      {order.hasPartialRejection && (() => {
                                        const snap = order.preAdjustmentSnapshot || {};
                                        const origGrandTotal = Number(
                                          snap.originalGrandTotal ?? (Number(order.grandTotal || 0) + Number(order.returnedAmount || 0))
                                        );
                                        const origTotalCartons = Number(
                                          snap.originalTotalCartons ?? (Number(order.totalCartons || order.totalQty || 0) + Number(order.returnedCartons || 0))
                                        );
                                        const actualCartons = Number(order.totalCartons || order.totalQty || 0);
                                        const actualGrandTotal = Number(order.grandTotal || 0);
                                        const retCartons = Number(order.returnedCartons || 0);
                                        const retWeightKg = Number(order.returnedWeightKg || 0);
                                        const retAmount = Number(order.returnedAmount || 0);

                                        return (
                                          <div className="p-3.5 bg-gradient-to-r from-rose-50/90 via-amber-50/40 to-rose-50/80 border border-rose-200 rounded-xl space-y-3 shadow-2xs">
                                            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-rose-200/80 pb-2">
                                              <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
                                                  <PackageMinus className="w-4 h-4" />
                                                </div>
                                                <div>
                                                  <h5 className="font-extrabold text-xs text-rose-950">
                                                    {isAr
                                                      ? 'تقدير مرتجع المخزن وتسوية الفاتورة المعدلة (رفض جزئي من العميل)'
                                                      : 'Warehouse Return Estimate & Accountant Adjusted Invoice'}
                                                  </h5>
                                                  <span className="text-[10px] text-rose-700 font-medium">
                                                    {order.lastAdjustedBy
                                                      ? (isAr
                                                          ? `آخر مزامنة: ${order.lastAdjustedBy} ${order.lastAdjustedAt ? `(${new Date(order.lastAdjustedAt).toLocaleString('ar-EG')})` : ''}`
                                                          : `Last synced by ${order.lastAdjustedBy} ${order.lastAdjustedAt ? `(${new Date(order.lastAdjustedAt).toLocaleString('en-US')})` : ''}`)
                                                      : (isAr ? 'بيانات التسليم الفعلي والمرتجع متزامنة' : 'Synced actual received quantities vs dispatched baseline')}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-2">
                                                {canAdjustDispatchedQty && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setEditingOrder(order);
                                                      setIsAdminModal(false);
                                                      setEditorInitialAdjustmentMode(true);
                                                      setIsEditorOpen(true);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold rounded-lg transition cursor-pointer shadow-2xs"
                                                  >
                                                    <Edit3 className="w-3 h-3 text-amber-600" />
                                                    <span>{isAr ? 'تعديل المرتجع' : 'Adjust Sync'}</span>
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openPrintableAdjustmentSlip(order, isAr);
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer shadow-2xs"
                                                >
                                                  <Printer className="w-3 h-3" />
                                                  <span>{isAr ? 'طباعة إشعار المرتجع والفاتورة المعدلة' : 'Print Return & Adjusted Invoice Sheet'}</span>
                                                </button>
                                              </div>
                                            </div>

                                            {order.rejectionReason && (
                                              <div className="px-2.5 py-1.5 bg-white/90 border border-rose-200 rounded-lg text-[11px] text-rose-900">
                                                <strong className="font-extrabold">{isAr ? 'سبب الرفض الجزئي: ' : 'Rejection Reason: '}</strong>
                                                <span>{order.rejectionReason}</span>
                                              </div>
                                            )}

                                            {/* 4 KPI Summary Cards */}
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                                              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                                                <span className="text-[10px] text-slate-400 block font-semibold">{isAr ? 'المنصرف الأصلي (قبل الرفض):' : 'Original Dispatched:'}</span>
                                                <span className="font-mono font-bold text-slate-800 block mt-0.5">
                                                  {origTotalCartons.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                                </span>
                                                <span className="font-mono text-[11px] text-slate-500">
                                                  {origGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                                                </span>
                                              </div>

                                              <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                                                <span className="text-[10px] text-emerald-700 block font-semibold">{isAr ? 'المستلم فعلياً (المعتمد):' : 'Actual Accepted:'}</span>
                                                <span className="font-mono font-bold text-emerald-900 block mt-0.5">
                                                  {actualCartons.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                                </span>
                                                <span className="font-mono text-[11px] font-bold text-emerald-700">
                                                  {actualGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                                                </span>
                                              </div>

                                              <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-300">
                                                <span className="text-[10px] text-amber-900 block font-bold">{isAr ? 'تقدير المرتجع للمخزن:' : 'Estimated Warehouse Return:'}</span>
                                                <span className="font-mono font-black text-amber-800 block mt-0.5">
                                                  -{retCartons.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                                </span>
                                                <span className="font-mono text-[11px] text-amber-700">
                                                  {retWeightKg.toFixed(1)} {isAr ? 'كجم' : 'kg'} ({(retWeightKg / 1000).toFixed(2)} {isAr ? 'طن' : 'Ton'})
                                                </span>
                                              </div>

                                              <div className="bg-rose-600 p-2.5 rounded-lg text-white">
                                                <span className="text-[10px] text-rose-100 block font-bold">{isAr ? 'قيمة التسوية / إشعار الدائن:' : 'Accountant Invoice Credit:'}</span>
                                                <span className="font-mono font-black text-sm block mt-0.5">
                                                  -{retAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                                                </span>
                                                <span className="text-[10px] text-rose-100 block">
                                                  {isAr ? 'صافي بعد التسوية في الفاتورة المعدلة' : 'Deducted in adjusted invoice'}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Per-SKU Returned Reconciliation Table */}
                                            <div className="overflow-x-auto bg-white border border-rose-200/80 rounded-lg">
                                              <table className="w-full text-[11px]">
                                                <thead>
                                                  <tr className="bg-rose-50/70 text-rose-900 font-bold border-b border-rose-200/70">
                                                    <th className="py-1.5 px-2.5 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                                                    <th className="py-1.5 px-2.5 text-center">{isAr ? 'المنصرف' : 'Dispatched'}</th>
                                                    <th className="py-1.5 px-2.5 text-center">{isAr ? 'المستلم فعلياً' : 'Received'}</th>
                                                    <th className="py-1.5 px-2.5 text-center text-rose-700">{isAr ? 'المرتجع للمخزن' : 'Returned'}</th>
                                                    <th className="py-1.5 px-2.5 text-end">{isAr ? 'إجمالي أصلي' : 'Orig Total'}</th>
                                                    <th className="py-1.5 px-2.5 text-end">{isAr ? 'إجمالي معدل' : 'Adj Total'}</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 font-mono">
                                                  {(order.lines || []).map((ln, idx) => {
                                                    const dispCartons = Number(ln.dispatchedQty ?? ln.qty ?? 0) + Number(ln.dispatchedBonus ?? ln.bonus ?? 0);
                                                    const recvCartons = Number(ln.qty || 0) + Number(ln.bonus || 0);
                                                    const lineRetCartons = Number(ln.returnedCartons ?? Math.max(0, dispCartons - recvCartons));
                                                    const lineAdjTotal = Number(ln.lineFinalTotal ?? ln.lineTotal ?? 0);
                                                    const lineOrigTotal = lineAdjTotal + Number(ln.returnedLineTotal || 0);
                                                    return (
                                                      <tr key={idx} className={lineRetCartons > 0 ? 'bg-rose-50/30' : ''}>
                                                        <td className="py-1.5 px-2.5 font-sans font-bold text-slate-800">
                                                          <span className="text-[10px] font-mono text-indigo-700 me-1.5">{ln.productCode}</span>
                                                          {isAr ? ln.productNameAr : (ln.productNameEn || ln.productNameAr)}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-center text-slate-600">{dispCartons}</td>
                                                        <td className="py-1.5 px-2.5 text-center font-bold text-emerald-700">{recvCartons}</td>
                                                        <td className="py-1.5 px-2.5 text-center font-black text-rose-700">
                                                          {lineRetCartons > 0 ? `-${lineRetCartons}` : '0'}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-end text-slate-500">{lineOrigTotal.toFixed(2)}</td>
                                                        <td className="py-1.5 px-2.5 text-end font-bold text-slate-900">{lineAdjTotal.toFixed(2)}</td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* Financial Totals Breakdown Strip (Moved to Expanded Footer) */}
                                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                                        {/* Cartons */}
                                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col justify-between">
                                          <span className="text-[10px] text-slate-500 font-semibold">{isAr ? 'إجمالي الكراتين:' : 'Total Cartons:'}</span>
                                          <span className="font-mono font-bold text-slate-900 text-xs">
                                            {(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                            {order.totalBonus > 0 ? ` (+${order.totalBonus})` : ''}
                                          </span>
                                        </div>

                                        {/* Weight */}
                                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col justify-between">
                                          <span className="text-[10px] text-slate-500 font-semibold">{isAr ? 'إجمالي الوزن:' : 'Total Weight:'}</span>
                                          <span className="font-mono font-bold text-slate-900 text-xs">
                                            {((order.totalWeightKg || 0) / 1000).toFixed(1)} <span className="text-[10px] text-slate-400 font-sans">{isAr ? 'طن' : 'Ton'}</span>
                                            <span className="text-[10px] text-slate-400 block font-normal">({Number(order.totalWeightKg || 0).toLocaleString()} {isAr ? 'كجم' : 'kg'})</span>
                                          </span>
                                        </div>

                                        {/* Net Pre-Tax */}
                                        <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col justify-between">
                                          <span className="text-[10px] text-slate-500 font-semibold">{isAr ? 'صافي قبل الضريبة:' : 'Net Pre-Tax:'}</span>
                                          <span className="font-mono font-bold text-slate-900 text-xs">
                                            {Number(order.netPreTaxSubtotal || (order.grandTotal - (order.totalVat || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                                            <span className="text-[10px] text-slate-400 font-sans">EGP</span>
                                          </span>
                                        </div>

                                        {/* VAT */}
                                        <div className="bg-emerald-50/70 p-2 rounded-lg border border-emerald-200 flex flex-col justify-between">
                                          <span className="text-[10px] text-emerald-800 font-semibold">{isAr ? 'ضريبة القيمة المضافة:' : 'Total VAT (+14%):'}</span>
                                          <span className="font-mono font-bold text-emerald-700 text-xs">
                                            +{Number(order.totalVat || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                                            <span className="text-[10px] text-emerald-600 font-sans">EGP</span>
                                          </span>
                                        </div>

                                        {/* WHT */}
                                        <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-200 flex flex-col justify-between">
                                          <span className="text-[10px] text-amber-800 font-semibold">{isAr ? 'خصم أ.ت.ص (1%):' : 'WHT (-1%):'}</span>
                                          <span className="font-mono font-bold text-amber-700 text-xs">
                                            {Number(order.whtAmount || 0) > 0 ? `-${Number(order.whtAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '0.00'}{' '}
                                            <span className="text-[10px] text-amber-600 font-sans">EGP</span>
                                          </span>
                                        </div>

                                        {/* Grand Total */}
                                        <div className="bg-emerald-600 text-white p-2 rounded-lg border border-emerald-700 flex flex-col justify-between shadow-xs">
                                          <span className="text-[10px] text-emerald-100 font-bold">{isAr ? 'الإجمالي النهائي:' : 'Grand Total:'}</span>
                                          <span className="font-mono font-black text-white text-sm">
                                            {Number(order.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                                            <span className="text-[10px] text-emerald-200 font-sans">EGP</span>
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating 3-Dots Portal Action Menu */}
      {activeActionsMenuOrderId && actionsMenuAnchor && activeOrderForMenu && createPortal(
        <div
          data-order-menu
          style={{
            position: 'fixed',
            top: `${actionsMenuAnchor.top}px`,
            left: isAr ? `${actionsMenuAnchor.left}px` : undefined,
            right: !isAr ? `${window.innerWidth - actionsMenuAnchor.right}px` : undefined,
            zIndex: 9999
          }}
          className="w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <button
            type="button"
            onClick={() => {
              const isAdmin = ADMIN_ORDER_TYPES.some((t) => t.id === activeOrderForMenu.orderType) || Boolean(activeOrderForMenu.isAdministrative);
              setEditingOrder(activeOrderForMenu);
              setIsAdminModal(isAdmin);
              setEditorInitialAdjustmentMode(false);
              setIsEditorOpen(true);
              setActiveActionsMenuOrderId(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition cursor-pointer font-bold text-start"
          >
            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'تعديل الأمر' : 'Edit Order'}</span>
          </button>

          {!PHYSICAL_DELIVERY_EXCLUDED_TYPES.includes(activeOrderForMenu.orderType) &&
            canSplitOrder && (() => {
              const isEditSplitAction = Boolean(activeOrderForMenu.isSplitParent || activeOrderForMenu.splitParentId);
              const isPendingForSplit = isEditSplitAction || !activeOrderForMenu.fulfillmentStatus || activeOrderForMenu.fulfillmentStatus === 'not_yet';
              const splitMenuLabel = activeOrderForMenu.isSplitParent
                ? (isAr ? 'تعديل وإعادة توزيع التقسيم' : 'Edit / Reallocate Split')
                : activeOrderForMenu.splitParentId
                  ? (isAr ? 'تعديل تقسيم الطلب الأب' : 'Edit Parent Split')
                  : (isAr ? 'تقسيم الطلب على عدة شاحنات' : 'Split Order Across Trucks');
              return (
                <button
                  type="button"
                  onClick={() => {
                    const target = activeOrderForMenu;
                    setActiveActionsMenuOrderId(null);
                    handleRequestSplitOrder(target);
                  }}
                  aria-disabled={!isPendingForSplit}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl transition cursor-pointer font-bold text-start ${
                    isPendingForSplit
                      ? 'text-violet-800 hover:bg-violet-50'
                      : 'text-slate-400 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                >
                  <GitFork className={`w-3.5 h-3.5 ${isPendingForSplit ? 'text-violet-600' : 'text-slate-400'}`} />
                  <span>{splitMenuLabel}</span>
                </button>
              );
            })()}

          {POST_DISPATCH_STATUSES.includes(activeOrderForMenu.fulfillmentStatus) && canAdjustDispatchedQty && (
            <button
              type="button"
              onClick={() => {
                setEditingOrder(activeOrderForMenu);
                setIsAdminModal(false);
                setEditorInitialAdjustmentMode(true);
                setIsEditorOpen(true);
                setActiveActionsMenuOrderId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-amber-800 hover:bg-amber-50 rounded-xl transition cursor-pointer font-bold text-start"
            >
              <PackageMinus className="w-3.5 h-3.5 text-amber-600" />
              <span>{isAr ? 'تسجيل مرتجع / مزامنة المستلم' : 'Record Partial Return / Sync Qty'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setAuditModalOrder(activeOrderForMenu);
              setActiveActionsMenuOrderId(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition cursor-pointer font-bold text-start"
          >
            <History className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isAr ? 'عرض سجل التدقيق' : 'View Audit Trail'}</span>
          </button>

          {/* Cancel or Restore Action */}
          {activeOrderForMenu.confirmationStatus !== 'canceled' ? (
            <button
              type="button"
              onClick={() => {
                setCancelModalOrder(activeOrderForMenu);
                setCancelReason('');
                setActiveActionsMenuOrderId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer font-bold text-start"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>{isAr ? 'إلغاء أمر البيع' : 'Cancel Order'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                handleRestoreCanceledOrder(activeOrderForMenu);
                setActiveActionsMenuOrderId(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer font-bold text-start"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'استعادة وتفعيل الأمر' : 'Restore Order'}</span>
            </button>
          )}

          <div className="border-t border-slate-100 my-1"></div>

          <button
            type="button"
            onClick={() => {
              setDeleteConfirmOrder(activeOrderForMenu);
              setActiveActionsMenuOrderId(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer font-bold text-start"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>{isAr ? 'حذف أمر البيع' : 'Delete Order'}</span>
          </button>
        </div>,
        document.body
      )}

      {/* Portal Tooltip for Split Portion Card Hover (Exact Assigned Products & Quantities) */}
      {hoveredPortionTooltip && (() => {
        const { child, childSerial, childVehName, childStyle, childFulf, rect } = hoveredPortionTooltip;
        const lines = child.lines || [];
        const tooltipWidth = 410;
        const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - rect.bottom : 400;
        const showAbove = spaceBelow < 270 && rect.top > 240;
        const rawLeft = isAr ? rect.right - tooltipWidth : rect.left;
        const clampedLeft = typeof window !== 'undefined'
          ? Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, rawLeft))
          : rect.left;

        return createPortal(
          <div
            dir={isAr ? 'rtl' : 'ltr'}
            style={{
              position: 'fixed',
              top: showAbove ? rect.top - 8 : rect.bottom + 8,
              left: clampedLeft,
              width: tooltipWidth,
              transform: showAbove ? 'translateY(-100%)' : 'none',
              zIndex: 9999
            }}
            className={`pointer-events-none bg-white border border-slate-300/90 ${childStyle.startBorderClasses} rounded-2xl shadow-2xl overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100`}
          >
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-indigo-300 text-xs">#{childSerial}</span>
                  <span className="text-[10px] text-slate-300 truncate flex items-center gap-1">
                    <Truck className="w-3 h-3 text-indigo-400 shrink-0 rtl:-scale-x-100" />
                    <span className="truncate">{childVehName || (isAr ? 'بانتظار التسكين' : 'Awaiting Truck')}</span>
                    {child.loadingOrderNumber && (
                      <span className="font-mono text-indigo-200">
                        · {isAr ? `رحلة #${child.loadingOrderNumber}` : `Trip #${child.loadingOrderNumber}`}
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${childStyle.badgeClasses}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${childStyle.dotClasses}`}></span>
                <span>{isAr ? childFulf.labelAr : childFulf.labelEn}</span>
              </span>
            </div>

            {/* Assigned Products & Quantities Table */}
            <div className="p-2.5">
              {lines.length === 0 ? (
                <p className="text-center text-slate-400 py-3 font-medium">
                  {isAr ? 'لا توجد أصناف مسجلة' : 'No products assigned'}
                </p>
              ) : (
                <>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                        <th className="py-1.5 px-2 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                        <th className="py-1.5 px-2 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                        <th className="py-1.5 px-2 text-center">{isAr ? 'البونص' : 'Bonus'}</th>
                        <th className="py-1.5 px-2 text-end">{isAr ? 'الوزن' : 'Weight'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.slice(0, 12).map((ln, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-2 font-semibold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              {ln.productCode && (
                                <span className="font-mono text-[9px] text-indigo-700 bg-indigo-50 px-1 rounded border border-indigo-200 shrink-0">
                                  {ln.productCode}
                                </span>
                              )}
                              <span className="truncate max-w-[175px]">
                                {isAr ? ln.productNameAr : (ln.productNameEn || ln.productNameAr)}
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                            {Number(ln.qty || 0).toLocaleString()} {ln.largeUnitName || (isAr ? 'كرتونة' : 'ctn')}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono whitespace-nowrap">
                            {Number(ln.bonus || 0) > 0 ? (
                              <span className="text-emerald-700 font-bold">+{Number(ln.bonus).toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-end font-mono text-slate-600 whitespace-nowrap">
                            {Number(ln.lineWeightKg || 0).toFixed(1)} {isAr ? 'كجم' : 'kg'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lines.length > 12 && (
                    <div className="pt-1.5 text-center text-[10px] font-bold text-slate-500">
                      {isAr ? `+ ${lines.length - 12} أصناف أخرى` : `+ ${lines.length - 12} more products`}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Totals Strip */}
            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold text-slate-700">
                {lines.length} {isAr ? 'صنف' : 'SKUs'} · {Number(child.totalCartons || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
              </span>
              <span className="font-bold text-slate-700">
                {((Number(child.totalWeightKg) || 0) / 1000).toFixed(2)} {isAr ? 'طن' : 'Ton'}
              </span>
              <span className="font-black text-emerald-700">
                {Number(child.grandTotal || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} EGP
              </span>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Sales Order / Administrative Order Editor Modal (Create / Edit) */}
      {isEditorOpen && (
        <SalesOrderEditorModal
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingOrder(null);
            setIsAdminModal(false);
            setEditorInitialAdjustmentMode(false);
          }}
          editingOrder={editingOrder}
          isAdminModal={isAdminModal}
          canAdjustDispatchedQty={canAdjustDispatchedQty}
          initialAdjustmentMode={editorInitialAdjustmentMode}
          clients={clients}
          products={products}
          productCategories={productCategories}
          priceLists={priceLists}
          strategies={strategies}
          vehicles={vehicles}
          allOrders={orders}
          isAr={isAr}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          onOpenAuditTrail={(o) => setAuditModalOrder(o)}
        />
      )}

      {/* Sales Order Audit Modal */}
      {auditModalOrder && (
        <SalesOrderAuditModal
          isOpen={Boolean(auditModalOrder)}
          onClose={() => setAuditModalOrder(null)}
          order={auditModalOrder}
          isAr={isAr}
        />
      )}

      {/* Pending Order Split Matrix Modal */}
      {splitModalOrder && (
        <OrderSplitModal
          isOpen={Boolean(splitModalOrder)}
          onClose={() => setSplitModalOrder(null)}
          order={splitModalOrder}
          existingChildren={
            splitModalOrder.isSplitParent
              ? orders.filter((o) => o.splitParentId === splitModalOrder.id)
              : []
          }
          baseSerial={resolveOrderSerial(splitModalOrder, orders).replace(/\s*\(.*/, '')}
          vehicles={vehicles}
          employees={[]}
          resolveVehicleDisplayName={resolveVehicleDisplayName}
          isAr={isAr}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          onSplitSuccess={() => {
            setSplitModalOrder(null);
          }}
        />
      )}

      {/* Split Guidance Modal (When order is not Pending or already split) */}
      {splitGuidanceOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-3 text-amber-700 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  {splitGuidanceOrder.reason === 'not_pending'
                    ? (isAr ? 'يتعذر تقسيم الطلب حالياً' : 'Cannot Split Order in Current Status')
                    : (isAr ? 'الطلب مقسم بالفعل' : 'Order Already Split')}
                </h4>
                <span className="text-xs text-slate-500 font-mono">
                  #{resolveOrderSerial(splitGuidanceOrder.order, orders)} — {splitGuidanceOrder.order.clientName || ''}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed space-y-1.5">
              {splitGuidanceOrder.reason === 'not_pending' ? (
                <>
                  <p className="font-bold">
                    {isAr
                      ? 'لا يمكن تقسيم أمر البيع بعد دخوله في مرحلة التجهيز أو التحميل.'
                      : 'Orders cannot be split once they enter Preparing or a later fulfillment stage.'}
                  </p>
                  <p className="text-amber-800">
                    {isAr
                      ? 'لتقسيم هذا الطلب على عدة شاحنات، يرجى الانتقال إلى تبويب (خطة التحميل) وإرجاع حالة الطلب إلى (قيد الانتظار / Pending) أولاً، ثم العودة للضغط على زر التقسيم.'
                      : 'Please open the Loading Plan tab and revert this order status back to "Pending" first, then return here to split it across trucks.'}
                  </p>
                </>
              ) : (
                <p className="font-bold">
                  {splitGuidanceOrder.reason === 'already_parent'
                    ? (isAr
                        ? 'هذا الأمر تم تقسيمه مسبقاً وهو الآن سجل أب مرجعي لا يقبل إعادة التقسيم.'
                        : 'This order is already an immutable Split Parent Reference and cannot be split again.')
                    : (isAr
                        ? 'هذا السجل هو جزء فرعي من طلب مقسم بالفعل، ولا يمكن تقسيم الأجزاء الفرعية بشكل متداخل.'
                        : 'This order is already a split child portion; nested splitting is disabled.')}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSplitGuidanceOrder(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
              {splitGuidanceOrder.reason === 'not_pending' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = splitGuidanceOrder.order;
                    setSplitGuidanceOrder(null);
                    handleNavigateToLoadingPlan(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-xs cursor-pointer"
                >
                  <span>{isAr ? 'فتح في خطة التحميل' : 'Open in Loading Plan'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-3 text-rose-600 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'إلغاء أمر البيع' : 'Cancel Sales Order'}
                </h4>
                <span className="text-xs text-slate-500 font-mono">
                  #{resolveOrderSerial(cancelModalOrder, orders)} — {cancelModalOrder.clientName || ''}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isAr
                ? 'سيتم وسم أمر البيع كـ "ملغي" وتطبيق المظهر المعطل عليه في الجدول، مع توثيق العملية وتاريخها وهوية منفذها في سجل التدقيق.'
                : 'This order will be marked as "Canceled" and styled inactive in the table, with audit trail logging.'}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'سبب الإلغاء (موثق بسجل التدقيق):' : 'Cancellation Reason:'}
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={isAr ? 'اكتب سبب الإلغاء (مثال: طلب العميل إلغاء التوريد، إلغاء التعاقد، عجز بضاعة)...' : 'Enter cancellation reason...'}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setCancelModalOrder(null);
                  setCancelReason('');
                }}
                className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                {isAr ? 'تراجع' : 'Close'}
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelOrder}
                disabled={isCanceling}
                className="px-4 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isCanceling ? (isAr ? 'جاري الإلغاء...' : 'Canceling...') : (isAr ? 'تأكيد إلغاء الأمر' : 'Confirm Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Alert Modal */}
      {deleteConfirmOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="font-black text-slate-800 text-sm">
              {isAr ? 'تأكيد حذف أمر البيع؟' : 'Delete Sales Order?'}
            </h4>
            <p className="text-xs text-slate-500">
              {isAr
                ? `هل أنت متأكد من حذف أمر البيع (#${resolveOrderSerial(deleteConfirmOrder, orders)})؟`
                : `Are you sure you want to delete order (#${resolveOrderSerial(deleteConfirmOrder, orders)})?`}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOrder(null)}
                className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteOrder(deleteConfirmOrder.id)}
                className="px-4 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 cursor-pointer"
              >
                {isAr ? 'حذف نهائي' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for PO Attachments */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
          >
            <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between text-xs font-bold">
              <span>{lightboxImage.title || (isAr ? 'معاينة المرفق' : 'Attachment Preview')}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 hover:bg-white/20 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-100">
              {lightboxImage.url?.startsWith('data:application/pdf') ? (
                <iframe src={lightboxImage.url} className="w-full h-[70vh] rounded-lg border border-slate-300" title="PDF Preview" />
              ) : (
                <img src={lightboxImage.url} alt="Attachment" className="max-w-full max-h-[75vh] object-contain rounded-lg" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * =========================================================================
 * SALES ORDER EDITOR MODAL (Order Header + Products Grid + 8-Tier Auto Pricing)
 * =========================================================================
 */
function SalesOrderEditorModal({
  isOpen,
  onClose,
  editingOrder,
  isAdminModal = false,
  canAdjustDispatchedQty = false,
  initialAdjustmentMode = false,
  clients = [],
  products = [],
  productCategories = [],
  priceLists = [],
  strategies = [],
  vehicles = [],
  allOrders = [],
  isAr = true,
  currentUserName = 'مستخدم معتمد',
  currentUserId = 'usr_unknown',
  onOpenAuditTrail = null
}) {
  const nextSerial = generateNextOrderSerial(allOrders);
  const initialSerial = editingOrder ? resolveOrderSerial(editingOrder, allOrders) : nextSerial;

  const todayStr = formatDateKey(new Date());

  const defaultOrderType = isAdminModal ? 'admin' : 'supply';
  const initialOrderType = editingOrder?.orderType || defaultOrderType;
  const initialVatMode = editingOrder?.vatMode || (initialOrderType.startsWith('invoice_only') ? 'exclusive' : 'none');

  const isSplitParentLocked = Boolean(editingOrder?.isSplitParent);
  const isPostDispatch = Boolean(
    editingOrder &&
      !isSplitParentLocked &&
      POST_DISPATCH_STATUSES.includes(editingOrder.fulfillmentStatus) &&
      !isAdminModal &&
      !PHYSICAL_DELIVERY_EXCLUDED_TYPES.includes(editingOrder.orderType)
  );
  const isStructureLocked = isPostDispatch || isSplitParentLocked;
  const [adjustmentMode, setAdjustmentMode] = useState(
    Boolean(initialAdjustmentMode && isPostDispatch && canAdjustDispatchedQty)
  );
  const [rejectionReason, setRejectionReason] = useState(editingOrder?.rejectionReason || '');

  // Dispatched baseline lines used when reconciling partial client rejections
  const baselineLineMap = useMemo(() => {
    const map = {};
    const baseLines =
      editingOrder?.preAdjustmentSnapshot?.originalLines || editingOrder?.lines || [];
    baseLines.forEach((l) => {
      map[l.productId] = l;
    });
    return map;
  }, [editingOrder]);

  const [formData, setFormData] = useState({
    id: editingOrder?.id || `SO-${initialSerial}`,
    serial: initialSerial,
    clientId: editingOrder?.clientId || '',
    clientName: editingOrder?.clientName || '',
    branchId: editingOrder?.branchId || '',
    branchName: editingOrder?.branchName || '',
    region: editingOrder?.region || '',
    deliveryAddress: editingOrder?.deliveryAddress || '',
    invoiceDate: editingOrder?.invoiceDate || todayStr,
    loadingDate: editingOrder?.loadingDate || todayStr,
    isDatesLinked: editingOrder ? Boolean(editingOrder.invoiceDate === editingOrder.loadingDate) : true,
    loadingOrderNumber: editingOrder?.loadingOrderNumber ?? null,
    assignedVehicleId: editingOrder?.assignedVehicleId || '',
    assignedVehicleName: editingOrder?.assignedVehicleName || '',
    assignedVehiclePlate: editingOrder?.assignedVehiclePlate || '',
    assignedDriverId: editingOrder?.assignedDriverId || '',
    assignedDriverName: editingOrder?.assignedDriverName || '',
    assignedDeliveryRepId: editingOrder?.assignedDeliveryRepId || '',
    assignedDeliveryRepName: editingOrder?.assignedDeliveryRepName || '',
    orderType: initialOrderType,
    isAdministrative: Boolean(editingOrder?.isAdministrative || isAdminModal),
    adminNotes: editingOrder?.adminNotes || editingOrder?.notes || '',
    collectionAmount: editingOrder?.collectionAmount || (editingOrder?.orderType === 'collection' ? (editingOrder.grandTotal || '') : ''),
    paymentMethod: editingOrder?.paymentMethod || 'cash',
    receiptNumber: editingOrder?.receiptNumber || editingOrder?.chequeNumber || '',
    confirmationStatus: (editingOrder?.confirmationStatus === 'revised' ? 'confirmed' : editingOrder?.confirmationStatus) || 'confirmed',
    isRevised: Boolean(editingOrder?.isRevised || editingOrder?.confirmationStatus === 'revised'),
    revisedAt: editingOrder?.revisedAt || null,
    revisedBy: editingOrder?.revisedBy || null,
    revisedById: editingOrder?.revisedById || null,
    fulfillmentStatus: editingOrder?.fulfillmentStatus || (isAdminModal ? 'paid' : 'not_yet'),
    vatMode: initialVatMode,
    poTawoos: editingOrder?.poTawoos || '',
    poPrivateLabel: editingOrder?.poPrivateLabel || '',
    salesRep: editingOrder?.salesRep || '',
    internalComments: editingOrder?.internalComments || '',
    externalComments: editingOrder?.externalComments || '',
    poAttachments: editingOrder?.poAttachments ? [...editingOrder.poAttachments] : [],
    lines: editingOrder?.lines ? JSON.parse(JSON.stringify(editingOrder.lines)) : []
  });

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [acknowledgedPlWarning, setAcknowledgedPlWarning] = useState(false);
  const fileInputRef = useRef(null);

  // Selected client object
  const selectedClient = useMemo(() => {
    return clients.find((c) => c.id === formData.clientId) || null;
  }, [clients, formData.clientId]);

  // Client Branches list
  const clientBranches = useMemo(() => {
    if (!selectedClient || !Array.isArray(selectedClient.branches)) return [];
    return selectedClient.branches;
  }, [selectedClient]);

  // In Sales Mode: Delivery / Warehouse branches only (Main Branch excluded when multiple branches exist)
  const deliveryBranches = useMemo(() => {
    if (!selectedClient || !Array.isArray(selectedClient.branches)) return [];
    const deliv = selectedClient.branches.filter((b) => !b.isMain && b.id !== 'br_main');
    return deliv.length > 0 ? deliv : selectedClient.branches;
  }, [selectedClient]);

  // Allowed Order Types based on modal mode
  const availableOrderTypes = useMemo(() => {
    return isAdminModal ? ADMIN_ORDER_TYPES : SALES_ORDER_TYPES;
  }, [isAdminModal]);

  // Allowed Fulfillment Statuses:
  // On creation: strictly 'not_yet' (Pending) and 'prepare' (Preparing)
  // On editing: show all options
  const availableFulfillmentStatuses = useMemo(() => {
    if (!editingOrder) {
      return FULFILLMENT_STATUSES.filter((s) => s.id === 'not_yet' || s.id === 'prepare');
    }
    return FULFILLMENT_STATUSES;
  }, [editingOrder]);

  // Allowed VAT Modes (Taxable only for invoice_only, or all 5 for sales orders)
  const availableVatModes = useMemo(() => {
    if (formData.orderType.startsWith('invoice_only')) {
      return TAXABLE_VAT_MODES;
    }
    return VAT_MODES;
  }, [formData.orderType]);

  // Client strategy
  const clientStrategy = useMemo(() => {
    return selectedClient?.pricingStrategy || 'wholesalers';
  }, [selectedClient]);

  // Client Operational Profile (Schedule, Weekly Holidays, Address, Phones, Region & Conflicts)
  const clientOperationalProfile = useMemo(() => {
    if (!selectedClient) return null;

    const br = clientBranches.find((b) => (b.id || 'br_main') === formData.branchId) || clientBranches[0] || null;

    // 1. Region & Address
    const region = br?.region || selectedClient.region || (isAr ? 'غير محدد' : 'Not specified');
    const address = br?.address || selectedClient.address || (isAr ? 'غير محدد' : 'Not specified');

    // 2. Contact & Phones
    const contactPerson = br?.contactPerson || selectedClient.contactPerson || (isAr ? 'المسؤول التجاري' : 'Commercial Contact');
    let phoneList = [];
    if (br?.phone) phoneList.push(br.phone);
    if (br?.mobile) phoneList.push(br.mobile);
    if (Array.isArray(br?.phones)) phoneList.push(...br.phones.filter(Boolean));
    if (phoneList.length === 0) {
      if (Array.isArray(selectedClient.phones)) phoneList.push(...selectedClient.phones.filter(Boolean));
      if (selectedClient.phone) phoneList.push(selectedClient.phone);
      if (selectedClient.mobile) phoneList.push(selectedClient.mobile);
    }
    phoneList = Array.from(new Set(phoneList.map((p) => String(p).trim()))).filter(Boolean);
    const phonesDisplay = phoneList.length > 0 ? phoneList.join(' — ') : (isAr ? 'لا توجد أرقام مسجلة' : 'No phone recorded');

    // 3. Operational Schedule / Working Hours
    const useCustom = Boolean(br?.useCustomSchedule);
    const branchHoursFrom = (br?.workingHoursFrom || '').trim();
    const branchHoursTo = (br?.workingHoursTo || '').trim();
    const clientHoursFrom = (selectedClient.workingHoursFrom || '').trim();
    const clientHoursTo = (selectedClient.workingHoursTo || '').trim();

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

    // 4. Weekly Holidays (Strictly leave empty if not assigned)
    const branchHolidays = Array.isArray(br?.weeklyHolidays) ? br.weeklyHolidays.filter(Boolean) : [];
    const clientHolidays = Array.isArray(selectedClient.weeklyHolidays) ? selectedClient.weeklyHolidays.filter(Boolean) : [];

    let rawHolidays = [];
    if (useCustom && branchHolidays.length > 0) {
      rawHolidays = branchHolidays;
    } else if (clientHolidays.length > 0) {
      rawHolidays = clientHolidays;
    } else if (branchHolidays.length > 0) {
      rawHolidays = branchHolidays;
    } else {
      rawHolidays = [];
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

    const DAY_MAP_EN = {
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday'
    };

    const holidays = rawHolidays.map((d) => ({
      key: d,
      name: isAr ? (DAY_MAP_AR[d] || d) : (DAY_MAP_EN[d] || d)
    }));

    // 5. Holiday Conflict Detection with order dates
    const checkDateConflict = (dateStr) => {
      if (!dateStr || rawHolidays.length === 0) return null;
      try {
        const d = new Date(dateStr + 'T00:00:00');
        const dayIdx = d.getDay();
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDayKey = dayKeys[dayIdx];
        if (rawHolidays.includes(currentDayKey)) {
          return isAr ? DAY_MAP_AR[currentDayKey] : DAY_MAP_EN[currentDayKey];
        }
      } catch (_) {}
      return null;
    };

    const invoiceHolidayConflict = checkDateConflict(formData.invoiceDate);
    const loadingHolidayConflict = !isAdminModal && formData.loadingDate ? checkDateConflict(formData.loadingDate) : null;

    const clientNotes = (selectedClient.notes || '').trim();
    const branchNotes = (br?.notes || '').trim();

    return {
      branchName: br ? resolveBranchDisplayName(br, isAr) : (isAr ? 'الفرع الرئيسي' : 'Main Branch'),
      region,
      address,
      contactPerson,
      phonesDisplay,
      scheduleDisplay,
      holidays,
      invoiceHolidayConflict,
      loadingHolidayConflict,
      clientNotes,
      hasClientNotes: Boolean(clientNotes),
      branchNotes,
      hasBranchNotes: Boolean(branchNotes && branchNotes !== clientNotes)
    };
  }, [selectedClient, clientBranches, formData.branchId, formData.invoiceDate, formData.loadingDate, isAr]);

  // Client options for SearchableSelect:
  // FLATTENED LIST SORTED ASCENDINGLY with bilingual search support
  const clientSelectOptions = useMemo(() => {
    const list = (clients || []).map((c) => {
      const nameAr = c.tradeNameAr || c.legalName || c.name || '';
      const nameEn = c.tradeNameEn || '';
      const code = c.code || '';
      const name = isAr
        ? (nameAr || nameEn || c.id)
        : (nameEn || nameAr || c.id);
      const altName = isAr ? nameEn : nameAr;
      const clientStratId = c.pricingStrategy || 'wholesalers';
      const strat =
        strategies.find((s) => s.id === clientStratId) ||
        DEFAULT_PRICING_STRATEGIES.find((s) => s.id === clientStratId) || {
          color: '#64748b',
          icon: 'Tag'
        };
      const StratIcon = SEGMENT_ICON_MAP[strat.icon] || Tag;

      return {
        value: c.id,
        label: name,
        sublabel: `${code ? `[${code}] ` : ''}${altName}`.trim() || c.id,
        specs: `${nameAr} ${nameEn} ${c.legalName || ''} ${code} ${c.taxNumber || ''} ${c.phone || ''}`.toLowerCase(),
        icon: StratIcon,
        iconColor: strat.color || '#2563eb',
        nameForSort: name
      };
    });

    list.sort((a, b) => a.nameForSort.localeCompare(b.nameForSort, isAr ? 'ar' : 'en'));

    return [
      {
        value: '',
        label: (isAdminModal && formData.orderType === 'admin')
          ? (isAr ? '— اختياري (بدون تخصيص عميل) —' : '— Optional (No client assigned) —')
          : (isAr ? '— اختر العميل —' : '— Select Client —'),
        sublabel: ''
      },
      ...list
    ];
  }, [clients, strategies, isAr, isAdminModal, formData.orderType]);

  // Handle client change
  const handleClientChange = (newClientId) => {
    const cl = clients.find((c) => c.id === newClientId);
    if (!cl) {
      setFormData((prev) => ({
        ...prev,
        clientId: '',
        clientName: '',
        branchId: '',
        branchName: '',
        region: '',
        deliveryAddress: ''
      }));
      return;
    }

    const clientName = isAr
      ? (cl.tradeNameAr || cl.legalName || cl.tradeNameEn || cl.name || cl.id)
      : (cl.tradeNameEn || cl.tradeNameAr || cl.legalName || cl.name || cl.id);

    // Auto-select branch:
    // If admin modal: main administrative branch (br_main)
    // If sales modal: first delivery branch (excluding main branch when alternatives exist)
    const branches = Array.isArray(cl.branches) ? cl.branches : [];
    let selectedBr = null;
    if (isAdminModal) {
      selectedBr = branches.find((b) => b.isMain) || branches[0] || null;
    } else {
      const deliveryList = branches.filter((b) => !b.isMain && b.id !== 'br_main');
      selectedBr = deliveryList.length > 0 ? deliveryList[0] : (branches[0] || null);
    }

    const branchId = selectedBr ? (selectedBr.id || 'br_main') : '';
    const branchName = selectedBr ? resolveBranchDisplayName(selectedBr, isAr) : '';
    const region = selectedBr?.region || cl.region || '';
    const deliveryAddress = selectedBr?.address || cl.address || '';

    setFormData((prev) => {
      // Re-resolve prices for existing line items with the new client/branch
      const updatedLines = prev.lines.map((line) => {
        const prod = products.find((p) => p.id === line.productId);
        const resolved = detectProductPrice({
          clientId: cl.id,
          clientName,
          branchId,
          branchName,
          strategy: cl.pricingStrategy || 'wholesalers',
          invoiceDate: prev.invoiceDate,
          productId: line.productId,
          priceLists
        });
        const promoInfo = detectPromotionalDiscount({
          clientId: cl.id,
          clientName,
          branchId,
          branchName,
          strategy: cl.pricingStrategy || 'wholesalers',
          invoiceDate: prev.invoiceDate,
          productId: line.productId,
          priceLists
        });

        const detectedUnitPrice = resolved.price || 0;
        return calculateLineTotals(line, detectedUnitPrice, resolved.isPromotional, promoInfo.discountPct, prev.vatMode);
      });

      return {
        ...prev,
        clientId: cl.id,
        clientName,
        branchId,
        branchName,
        region,
        deliveryAddress,
        lines: updatedLines
      };
    });
  };

  // Handle branch change
  const handleBranchChange = (newBranchId) => {
    const br = clientBranches.find((b) => (b.id || 'br_main') === newBranchId);
    const branchName = br ? resolveBranchDisplayName(br, isAr) : '';
    const region = br?.region || selectedClient?.region || '';
    const deliveryAddress = br?.address || selectedClient?.address || '';

    setFormData((prev) => {
      const updatedLines = prev.lines.map((line) => {
        const resolved = detectProductPrice({
          clientId: prev.clientId,
          clientName: prev.clientName,
          branchId: newBranchId,
          branchName,
          strategy: clientStrategy,
          invoiceDate: prev.invoiceDate,
          productId: line.productId,
          priceLists
        });
        const promoInfo = detectPromotionalDiscount({
          clientId: prev.clientId,
          clientName: prev.clientName,
          branchId: newBranchId,
          branchName,
          strategy: clientStrategy,
          invoiceDate: prev.invoiceDate,
          productId: line.productId,
          priceLists
        });
        return calculateLineTotals(line, resolved.price || 0, resolved.isPromotional, promoInfo.discountPct, prev.vatMode);
      });

      return {
        ...prev,
        branchId: newBranchId,
        branchName,
        region,
        deliveryAddress,
        lines: updatedLines
      };
    });
  };

  // Auto-select valid delivery branch if currently empty or invalid
  useEffect(() => {
    if (isAdminModal || !selectedClient || deliveryBranches.length === 0) return;
    const currentValid = deliveryBranches.some((b) => b.id === formData.branchId);
    if (!currentValid) {
      const firstBranch = deliveryBranches[0];
      const newBranchId = firstBranch.id || 'br_main';
      const bName = resolveBranchDisplayName(firstBranch, isAr);
      const reg = firstBranch.region || selectedClient.region || '';
      const addr = firstBranch.address || selectedClient.address || '';
      setFormData((prev) => ({
        ...prev,
        branchId: newBranchId,
        branchName: bName,
        region: reg,
        deliveryAddress: addr
      }));
    }
  }, [selectedClient, deliveryBranches, formData.branchId, isAdminModal, isAr]);

  // Handle order type change
  const handleOrderTypeChange = (newType) => {
    setFormData((prev) => {
      let nextVat = prev.vatMode;
      if (newType.startsWith('invoice_only')) {
        if (nextVat === 'none') nextVat = 'exclusive';
      }
      return {
        ...prev,
        orderType: newType,
        vatMode: nextVat
      };
    });
  };

  const hasActiveAssignment = Boolean(formData.assignedVehicleId || formData.loadingOrderNumber);

  // Handle invoice date change (auto-inherits to loadingDate if linked and not assigned to truck)
  const handleInvoiceDateChange = (newDate) => {
    setFormData((prev) => {
      const hasAssignment = Boolean(prev.assignedVehicleId || prev.loadingOrderNumber);
      const loadingDate = (prev.isDatesLinked && !hasAssignment) ? newDate : prev.loadingDate;
      const updatedLines = prev.lines.map((line) => {
        const resolved = detectProductPrice({
          clientId: prev.clientId,
          clientName: prev.clientName,
          branchId: prev.branchId,
          branchName: prev.branchName,
          strategy: clientStrategy,
          invoiceDate: newDate,
          productId: line.productId,
          priceLists
        });
        const promoInfo = detectPromotionalDiscount({
          clientId: prev.clientId,
          clientName: prev.clientName,
          branchId: prev.branchId,
          branchName: prev.branchName,
          strategy: clientStrategy,
          invoiceDate: newDate,
          productId: line.productId,
          priceLists
        });
        return calculateLineTotals(line, resolved.price || 0, resolved.isPromotional, promoInfo.discountPct, prev.vatMode);
      });

      return {
        ...prev,
        invoiceDate: newDate,
        loadingDate,
        lines: updatedLines
      };
    });
  };

  // Helper to calculate a line item's totals
  const calculateLineTotals = (line, detectedUnitPrice, isPromotional = false, promoDiscountPct = 0, vatMode = 'none') => {
    const qty = Math.max(0, Number(line.qty) || 0);
    const bonus = Math.max(0, Number(line.bonus) || 0);
    const manualDiscount = Math.max(0, Number(line.manualDiscountPerUnit) || 0);

    const isTaxable = vatMode && vatMode !== 'none';
    const isInclusive = vatMode === 'inclusive' || vatMode === 'inclusive_wht';
    const isWhtApplicable = vatMode === 'exclusive_wht' || vatMode === 'inclusive_wht';
    const hasVat = line.vatRate !== '0%' && line.vatRate !== 0;

    // For inclusive VAT, extract net base unit price before tax (price / 1.14)
    let effectiveBaseUnitPrice = detectedUnitPrice;
    if (isInclusive && hasVat) {
      effectiveBaseUnitPrice = detectedUnitPrice / 1.14;
    }

    const netBasePriceAfterDiscount = Math.max(0, effectiveBaseUnitPrice - manualDiscount);
    const lineNet = qty * netBasePriceAfterDiscount;
    const lineVat = (isTaxable && hasVat) ? lineNet * 0.14 : 0;
    const lineWht = isWhtApplicable ? lineNet * 0.01 : 0;
    const lineTotal = lineNet + lineVat - lineWht;
    const lineWeightKg = (qty + bonus) * (Number(line.largeUnitWeightKg) || 0);

    return {
      ...line,
      detectedUnitPrice,
      effectiveBaseUnitPrice,
      isPromotional,
      promoDiscountPct,
      lineNet,
      lineVat,
      lineWht,
      lineTotal,
      lineWeightKg
    };
  };

  // Available products for adding to line items:
  // Restricted by category filter and private label allowed client.
  // Client-linked private label products are prioritized at the top with a large purple filled circle dot.
  const availableProductOptions = useMemo(() => {
    const available = products.filter((p) => {
      // 1. Private label restriction check
      if (!isProductAllowedForClient(p, formData.clientId, formData.clientName)) {
        return false;
      }
      // 2. Category filter
      if (selectedCategory !== 'all') {
        const prodCat = p.productionLine || p.categoryId || p.category;
        if (prodCat !== selectedCategory) return false;
      }
      return true;
    });

    const isClientPrivateLabel = (p) => {
      if (!isProductPrivateLabel(p)) return false;
      if (!formData.clientId && !formData.clientName) return false;
      const assignedIds = Array.isArray(p.privateLabelClientIds) ? p.privateLabelClientIds.filter(Boolean) : [];
      if (assignedIds.length > 0) {
        return assignedIds.some((id) => String(id).trim() === String(formData.clientId).trim());
      }
      if (p.clientName && formData.clientName) {
        const normProd = String(p.clientName).trim().toLowerCase();
        const normTarget = String(formData.clientName).trim().toLowerCase();
        return normProd.includes(normTarget) || normTarget.includes(normProd);
      }
      return false;
    };

    // Sort: client-linked private label items first, then others, then alphabetical
    const sorted = [...available].sort((a, b) => {
      const aClientPl = isClientPrivateLabel(a);
      const bClientPl = isClientPrivateLabel(b);
      if (aClientPl && !bClientPl) return -1;
      if (!aClientPl && bClientPl) return 1;
      const aName = isAr ? (a.nameAr || a.nameEn || '') : (a.nameEn || a.nameAr || '');
      const bName = isAr ? (b.nameAr || b.nameEn || '') : (b.nameEn || b.nameAr || '');
      return aName.localeCompare(bName, isAr ? 'ar' : 'en');
    });

    const PurpleDot = () => (
      <span className="w-3 h-3 rounded-full bg-purple-600 inline-block shrink-0 shadow-xs ring-2 ring-purple-200" />
    );

    return sorted.map((p) => {
      const isPl = isProductPrivateLabel(p);
      const isClientPl = isClientPrivateLabel(p);
      const prodName = isAr ? p.nameAr : (p.nameEn || p.nameAr);

      return {
        value: p.id,
        label: prodName,
        sublabel: '',
        rawIcon: true,
        icon: isClientPl ? PurpleDot : null,
        iconBg: 'transparent',
        iconColor: '#9333ea',
        badgeText: '',
        specs: `${p.code || ''} ${p.id} ${p.nameAr || ''} ${p.nameEn || ''}`.toLowerCase(),
        isPrivateLabel: isPl,
        isClientPrivateLabel: isClientPl
      };
    });
  }, [products, formData.clientId, formData.clientName, selectedCategory, isAr]);

  // Add Product to Lines Handler
  const handleAddProduct = (productId) => {
    if (!productId) return;
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    // Prevent duplicate row
    if (formData.lines.some((l) => l.productId === productId)) {
      alert(isAr ? 'هذا الصنف مضاف بالفعل في قائمة بنود الطلب.' : 'This product is already in the order lines.');
      setSelectedProductId('');
      return;
    }

    const resolved = detectProductPrice({
      clientId: formData.clientId,
      clientName: formData.clientName,
      branchId: formData.branchId,
      branchName: formData.branchName,
      strategy: clientStrategy,
      invoiceDate: formData.invoiceDate,
      productId,
      priceLists
    });

    const promoInfo = detectPromotionalDiscount({
      clientId: formData.clientId,
      clientName: formData.clientName,
      branchId: formData.branchId,
      branchName: formData.branchName,
      strategy: clientStrategy,
      invoiceDate: formData.invoiceDate,
      productId,
      priceLists
    });

    const primaryOpt = (prod.packagingOptions || [])[0] || {};
    const largeUnitWeightKg = Number(primaryOpt.largeUnitWeightKg || prod.weight || 0);
    const packagingRatio = Number(primaryOpt.packagingRatio || prod.packagingRatio || 12);

    const newLine = calculateLineTotals(
      {
        productId: prod.id,
        productCode: prod.code || prod.id,
        productNameAr: prod.nameAr,
        productNameEn: prod.nameEn || prod.nameAr,
        isPrivateLabel: isProductPrivateLabel(prod),
        vatRate: prod.vatRate || '14%',
        smallUnit: prod.smallUnit || 'زجاجة',
        largeUnitName: prod.largeUnitName || 'كرتونة',
        packagingRatio,
        largeUnitWeightKg,
        qty: 1,
        bonus: 0,
        manualDiscountPerUnit: 0
      },
      resolved.price || 0,
      resolved.isPromotional,
      promoInfo.discountPct,
      formData.vatMode
    );

    setFormData((prev) => ({
      ...prev,
      lines: [...prev.lines, newLine]
    }));
    setSelectedProductId('');
  };

  // Line item change (qty, bonus, manualDiscount)
  const handleLineChange = (index, field, value) => {
    setFormData((prev) => {
      const updatedLines = [...prev.lines];
      const existing = updatedLines[index];
      let nextVal = value;
      if (isPostDispatch && adjustmentMode && (field === 'qty' || field === 'bonus')) {
        const base = baselineLineMap[existing.productId] || existing;
        const maxAllowed =
          field === 'qty'
            ? Number(base.dispatchedQty ?? base.qty ?? 0)
            : Number(base.dispatchedBonus ?? base.bonus ?? 0);
        const parsed = Math.max(0, Math.floor(Number(value) || 0));
        nextVal = Math.min(parsed, maxAllowed);
      }
      const target = { ...existing, [field]: nextVal };
      updatedLines[index] = calculateLineTotals(
        target,
        target.detectedUnitPrice,
        target.isPromotional,
        target.promoDiscountPct,
        prev.vatMode
      );
      return { ...prev, lines: updatedLines };
    });
  };

  // Remove line item
  const handleRemoveLine = (index) => {
    if (isPostDispatch) return;
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, idx) => idx !== index)
    }));
  };

  // Recalculate all lines when VAT mode changes
  const handleVatModeChange = (newVatMode) => {
    if (isPostDispatch) return;
    setFormData((prev) => {
      const updatedLines = prev.lines.map((line) =>
        calculateLineTotals(line, line.detectedUnitPrice, line.isPromotional, line.promoDiscountPct, newVatMode)
      );
      return { ...prev, vatMode: newVatMode, lines: updatedLines };
    });
  };

  // Upload PO Attachment Handler
  const handleAttachmentUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const compressedDataUrl = await compressImage(file);
        const newAttachment = {
          id: `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          url: compressedDataUrl,
          poLabel: '',
          uploadedAt: new Date().toISOString()
        };
        setFormData((prev) => ({
          ...prev,
          poAttachments: [...prev.poAttachments, newAttachment]
        }));
      } catch (err) {
        console.error('Error compressing attachment:', err);
        alert(isAr ? `حدث خطأ أثناء تحميل الملف: ${file.name}` : `Failed to upload file: ${file.name}`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Order Totals Summary Calculation
  const orderCalculations = useMemo(() => {
    let totalQty = 0;
    let totalBonus = 0;
    let totalWeightKg = 0;
    let grossSubtotal = 0;
    let manualDiscountTotal = 0;
    let netPreTaxSubtotal = 0;
    let totalVat = 0;

    formData.lines.forEach((l) => {
      const q = Math.max(0, Number(l.qty) || 0);
      const b = Math.max(0, Number(l.bonus) || 0);
      totalQty += q;
      totalBonus += b;
      totalWeightKg += Number(l.lineWeightKg || 0);
      grossSubtotal += q * (Number(l.detectedUnitPrice) || 0);
      manualDiscountTotal += q * (Number(l.manualDiscountPerUnit) || 0);
      netPreTaxSubtotal += Number(l.lineNet || 0);
      totalVat += Number(l.lineVat || 0);
    });

    const isWhtApplicable = formData.vatMode === 'exclusive_wht' || formData.vatMode === 'inclusive_wht';
    const whtAmount = isWhtApplicable ? netPreTaxSubtotal * 0.01 : 0;
    const grandTotal = netPreTaxSubtotal + totalVat - whtAmount;
    const totalCartons = totalQty + totalBonus;

    return {
      totalQty,
      totalBonus,
      totalCartons,
      totalWeightKg,
      grossSubtotal,
      manualDiscountTotal,
      netPreTaxSubtotal,
      totalVat,
      whtAmount,
      grandTotal
    };
  }, [formData.lines, formData.vatMode]);

  // Private Label Alert & Document Split Detection
  const hasPrivateLabelLines = useMemo(() => {
    return formData.lines.some((l) => l.isPrivateLabel);
  }, [formData.lines]);

  const hasOwnBrandLines = useMemo(() => {
    return formData.lines.some((l) => !l.isPrivateLabel);
  }, [formData.lines]);

  const showPrivateLabelTaxAlert = useMemo(() => {
    return hasPrivateLabelLines && formData.vatMode === 'none' && !acknowledgedPlWarning;
  }, [hasPrivateLabelLines, formData.vatMode, acknowledgedPlWarning]);

  // Save Order Handler
  const handleSaveOrder = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const isDirectAdmin = formData.orderType === 'admin';
    const isCollection = formData.orderType === 'collection';
    const isInvoiceOrSales = !isDirectAdmin && !isCollection;

    // Client validation: Optional for 'admin', mandatory for 'collection' and sales/invoice
    if (!isDirectAdmin && !formData.clientId) {
      setErrorMsg(isAr ? 'يرجى اختيار العميل أولاً.' : 'Please select a client.');
      return;
    }

    // Admin directive notes validation
    if (isDirectAdmin && !formData.adminNotes?.trim()) {
      setErrorMsg(isAr ? 'يرجى كتابة نص التوجيه أو البيان الإداري أولاً.' : 'Please enter administrative directive or statement notes.');
      return;
    }

    // Collection amount validation
    if (isCollection) {
      const amt = Number(formData.collectionAmount);
      if (isNaN(amt) || amt <= 0) {
        setErrorMsg(isAr ? 'يرجى إدخال مبلغ تحصيل صحيح أكبر من صفر.' : 'Please enter a valid collection amount greater than zero.');
        return;
      }
    }

    // Line items validation for sales & invoice_only
    if (isInvoiceOrSales && formData.lines.length === 0) {
      setErrorMsg(isAr ? 'يرجى إضافة صنف واحد على الأقل في أمر البيع.' : 'Please add at least one line item.');
      return;
    }

    // Post-dispatch partial rejection adjustment computation
    let adjustmentFields = {};
    let stampedLines = formData.lines;
    const isSyncingPartialRejection = Boolean(isPostDispatch && adjustmentMode && canAdjustDispatchedQty);

    if (isSyncingPartialRejection) {
      const existingSnap = editingOrder?.preAdjustmentSnapshot;
      const snapshotObj = existingSnap || {
        capturedAt: new Date().toISOString(),
        originalTotalQty: Number(editingOrder.totalQty || 0),
        originalTotalBonus: Number(editingOrder.totalBonus || 0),
        originalTotalCartons: Number(editingOrder.totalCartons || editingOrder.totalQty || 0),
        originalTotalWeightKg: Number(editingOrder.totalWeightKg || 0),
        originalGrandTotal: Number(editingOrder.grandTotal || 0),
        originalNetPreTax: Number(editingOrder.netPreTaxSubtotal || 0),
        originalVat: Number(editingOrder.totalVat || 0),
        originalWht: Number(editingOrder.whtAmount || 0),
        originalLines: (editingOrder.lines || []).map((l) => ({ ...l }))
      };

      const isWhtMode = formData.vatMode === 'exclusive_wht' || formData.vatMode === 'inclusive_wht';
      let returnedQtySum = 0;
      let returnedBonusSum = 0;
      let returnedCartonsSum = 0;

      stampedLines = formData.lines.map((l) => {
        const base = baselineLineMap[l.productId] || l;
        const dispatchedQty = Number(base.dispatchedQty ?? base.qty ?? 0);
        const dispatchedBonus = Number(base.dispatchedBonus ?? base.bonus ?? 0);
        const actualQty = Math.min(dispatchedQty, Math.max(0, Number(l.qty || 0)));
        const actualBonus = Math.min(dispatchedBonus, Math.max(0, Number(l.bonus || 0)));
        const returnedQty = Math.max(0, dispatchedQty - actualQty);
        const returnedBonus = Math.max(0, dispatchedBonus - actualBonus);
        const returnedCartons = returnedQty + returnedBonus;

        const origLineEffTotal = isWhtMode
          ? Number(base.lineFinalTotal ?? Math.max(0, Number(base.lineNet || 0) + Number(base.lineVat || 0) - Number(base.lineWht || 0)))
          : Number(base.lineTotal || 0);
        const currLineEffTotal = isWhtMode
          ? Number(l.lineFinalTotal ?? Math.max(0, Number(l.lineNet || 0) + Number(l.lineVat || 0) - Number(l.lineWht || 0)))
          : Number(l.lineTotal || 0);
        const returnedLineTotal = Math.max(0, Math.round((origLineEffTotal - currLineEffTotal) * 100) / 100);

        returnedQtySum += returnedQty;
        returnedBonusSum += returnedBonus;
        returnedCartonsSum += returnedCartons;

        return {
          ...l,
          qty: actualQty,
          bonus: actualBonus,
          dispatchedQty,
          dispatchedBonus,
          returnedQty,
          returnedBonus,
          returnedCartons,
          returnedLineTotal
        };
      });

      if (returnedCartonsSum > 0 && !rejectionReason.trim()) {
        setErrorMsg(
          isAr
            ? 'يرجى إدخال سبب الرفض الجزئي عند تسجيل كميات مرتجعة من العميل.'
            : 'Please enter a rejection reason when recording returned cartons.'
        );
        return;
      }

      const returnedWeightKg = Math.max(
        0,
        Math.round((Number(snapshotObj.originalTotalWeightKg || 0) - Number(orderCalculations.totalWeightKg || 0)) * 100) / 100
      );
      const returnedAmount = Math.max(
        0,
        Math.round((Number(snapshotObj.originalGrandTotal || 0) - Number(orderCalculations.grandTotal || 0)) * 100) / 100
      );

      adjustmentFields = {
        preAdjustmentSnapshot: snapshotObj,
        hasPartialRejection: returnedCartonsSum > 0,
        returnedQty: returnedQtySum,
        returnedBonus: returnedBonusSum,
        returnedCartons: returnedCartonsSum,
        returnedWeightKg,
        returnedAmount,
        rejectionReason: returnedCartonsSum > 0 ? rejectionReason.trim() : '',
        lastAdjustedBy: currentUserName,
        lastAdjustedById: currentUserId,
        lastAdjustedAt: new Date().toISOString()
      };
    }

    // Confirmation if private label is unofficial
    if (isInvoiceOrSales && hasPrivateLabelLines && formData.vatMode === 'none' && !acknowledgedPlWarning) {
      const confirmProceed = window.confirm(
        isAr
          ? 'تنبيه: يحتوي الطلب على أصناف علامة خاصة (Private Label) تتطلب عادة فاتورة ضريبية رسمية.\nهل ترغب في المتابعة كأمر غير رسمي (عينات / هدايا)؟'
          : 'Warning: This order contains Private Label products which typically require a Tax Invoice. Proceed anyway as sample/gift?'
      );
      if (!confirmProceed) return;
    }

    setIsSaving(true);
    try {
      const orderRef = doc(db, 'sales_orders', formData.id);
      const isNew = !editingOrder;

      // Determine financials based on order type
      let financials = {};
      if (isDirectAdmin) {
        financials = {
          totalQty: 0,
          totalBonus: 0,
          totalCartons: 0,
          totalWeightKg: 0,
          grossSubtotal: 0,
          manualDiscountTotal: 0,
          netPreTaxSubtotal: 0,
          totalVat: 0,
          whtAmount: 0,
          grandTotal: 0
        };
      } else if (isCollection) {
        const amt = Number(formData.collectionAmount) || 0;
        financials = {
          totalQty: 0,
          totalBonus: 0,
          totalCartons: 0,
          totalWeightKg: 0,
          grossSubtotal: amt,
          manualDiscountTotal: 0,
          netPreTaxSubtotal: amt,
          totalVat: 0,
          whtAmount: 0,
          grandTotal: amt,
          collectionAmount: amt
        };
      } else {
        financials = { ...orderCalculations };
      }

      // Build audit event
      const now = new Date();
      let auditEvent;

      if (isNew) {
        let summaryAr = `تم إنشاء أمر البيع #${formData.serial} للعميل (${formData.clientName || 'عام'})`;
        let summaryEn = `Created sales order #${formData.serial} for client (${formData.clientName || 'General'})`;

        if (isDirectAdmin) {
          summaryAr = `تم تسجيل إجراء إداري #${formData.serial} ${formData.clientName ? `للعميل (${formData.clientName})` : '(إجراء إداري عام)'}`;
          summaryEn = `Recorded administrative action #${formData.serial} ${formData.clientName ? `for client (${formData.clientName})` : '(General action)'}`;
        } else if (isCollection) {
          summaryAr = `تم تسجيل إذن تحصيل #${formData.serial} للعميل (${formData.clientName}) بمبلغ ${Number(formData.collectionAmount).toLocaleString()} ج.م`;
          summaryEn = `Recorded collection order #${formData.serial} for client (${formData.clientName}) of ${Number(formData.collectionAmount).toLocaleString()} EGP`;
        }

        auditEvent = {
          id: `AUD-${Date.now()}-1`,
          action: 'create',
          performedBy: currentUserName,
          performedById: currentUserId,
          timestamp: now,
          summaryAr,
          summaryEn,
          changes: {
            metadata: [
              { labelAr: 'العميل', labelEn: 'Client', newValue: formData.clientName || (isDirectAdmin ? 'عام' : '—') },
              { labelAr: 'الفرع', labelEn: 'Branch', newValue: formData.branchName || 'الرئيسي' },
              { labelAr: 'تاريخ الفاتورة / الإجراء', labelEn: 'Date', newValue: formData.invoiceDate },
              { labelAr: 'نوع الطلب', labelEn: 'Order Type', newValue: formData.orderType },
              { labelAr: 'المعاملة الضريبية', labelEn: 'Tax Mode', newValue: formData.vatMode }
            ],
            lineChanges: isInvoiceOrSales ? formData.lines.map((l) => ({
              productCode: l.productCode,
              productNameAr: l.productNameAr,
              productNameEn: l.productNameEn,
              type: 'added',
              detailAr: `${l.qty} كرتونة بسعر ${l.detectedUnitPrice} ج.م`,
              detailEn: `${l.qty} cartons at ${l.detectedUnitPrice} EGP`
            })) : []
          }
        };
      } else {
        // Compute diff for editing
        const metaDiffs = [];
        const old = editingOrder;

        if (old.clientName !== formData.clientName) metaDiffs.push({ labelAr: 'العميل', labelEn: 'Client', oldValue: old.clientName, newValue: formData.clientName });
        if (old.branchName !== formData.branchName) metaDiffs.push({ labelAr: 'الفرع', labelEn: 'Branch', oldValue: old.branchName, newValue: formData.branchName });
        if (old.invoiceDate !== formData.invoiceDate) metaDiffs.push({ labelAr: 'تاريخ الفاتورة / الإجراء', labelEn: 'Date', oldValue: old.invoiceDate, newValue: formData.invoiceDate });
        if (old.loadingDate !== formData.loadingDate) metaDiffs.push({ labelAr: 'تاريخ التحميل', labelEn: 'Loading Date', oldValue: old.loadingDate, newValue: formData.loadingDate });
        if (old.confirmationStatus !== formData.confirmationStatus) metaDiffs.push({ labelAr: 'حالة التأكيد', labelEn: 'Confirmation', oldValue: old.confirmationStatus, newValue: formData.confirmationStatus });
        if (old.fulfillmentStatus !== formData.fulfillmentStatus) metaDiffs.push({ labelAr: 'حالة التنفيذ', labelEn: 'Fulfillment', oldValue: old.fulfillmentStatus, newValue: formData.fulfillmentStatus });
        if (old.vatMode !== formData.vatMode) metaDiffs.push({ labelAr: 'المعاملة الضريبية', labelEn: 'Tax Mode', oldValue: old.vatMode, newValue: formData.vatMode });
        if (old.orderType !== formData.orderType) metaDiffs.push({ labelAr: 'نوع الطلب', labelEn: 'Order Type', oldValue: old.orderType, newValue: formData.orderType });

        const oldLineMap = {};
        (old.lines || []).forEach((l) => { oldLineMap[l.productId] = l; });
        const newLineMap = {};
        formData.lines.forEach((l) => { newLineMap[l.productId] = l; });

        const lineChanges = [];
        if (isInvoiceOrSales) {
          formData.lines.forEach((l) => {
            if (!oldLineMap[l.productId]) {
              lineChanges.push({
                productCode: l.productCode,
                productNameAr: l.productNameAr,
                productNameEn: l.productNameEn,
                type: 'added',
                detailAr: `${l.qty} كرتونة بسعر ${l.detectedUnitPrice} ج.م`,
                detailEn: `${l.qty} cartons at ${l.detectedUnitPrice} EGP`
              });
            } else {
              const oldL = oldLineMap[l.productId];
              if (oldL.qty !== l.qty || oldL.bonus !== l.bonus || oldL.manualDiscountPerUnit !== l.manualDiscountPerUnit) {
                lineChanges.push({
                  productCode: l.productCode,
                  productNameAr: l.productNameAr,
                  productNameEn: l.productNameEn,
                  type: 'modified',
                  detailAr: `الكمية: ${oldL.qty} -> ${l.qty} | بونص: ${oldL.bonus} -> ${l.bonus} | خصم: ${oldL.manualDiscountPerUnit} -> ${l.manualDiscountPerUnit}`,
                  detailEn: `Qty: ${oldL.qty} -> ${l.qty} | Bonus: ${oldL.bonus} -> ${l.bonus} | Disc: ${oldL.manualDiscountPerUnit} -> ${l.manualDiscountPerUnit}`
                });
              }
            }
          });

          (old.lines || []).forEach((l) => {
            if (!newLineMap[l.productId]) {
              lineChanges.push({
                productCode: l.productCode,
                productNameAr: l.productNameAr,
                productNameEn: l.productNameEn,
                type: 'removed',
                detailAr: `تم حذف الصنف من الطلب`,
                detailEn: `Removed product from order`
              });
            }
          });
        }

        auditEvent = {
          id: `AUD-${Date.now()}-${(old.auditTrail || []).length + 1}`,
          action: isSyncingPartialRejection ? 'partial_rejection_sync' : 'edit',
          performedBy: currentUserName,
          performedById: currentUserId,
          timestamp: now,
          summaryAr: isSyncingPartialRejection
            ? `مزامنة الكميات المستلمة فعلياً بعد الرفض الجزئي للأمر #${formData.serial} (مرتجع: ${adjustmentFields.returnedCartons || 0} كرتونة | خصم تسوية: ${Number(adjustmentFields.returnedAmount || 0).toFixed(2)} ج.م)`
            : `تم تعديل بيانات أمر البيع / الإجراء #${formData.serial}`,
          summaryEn: isSyncingPartialRejection
            ? `Synced actual received quantities for #${formData.serial} (Returned: ${adjustmentFields.returnedCartons || 0} ctn | Invoice Credit: ${Number(adjustmentFields.returnedAmount || 0).toFixed(2)} EGP)`
            : `Updated order / action #${formData.serial}`,
          changes: {
            metadata: isSyncingPartialRejection
              ? [
                  ...metaDiffs,
                  {
                    labelAr: 'إجمالي المرتجع للمخزن',
                    labelEn: 'Warehouse Return Estimate',
                    oldValue: `${adjustmentFields.preAdjustmentSnapshot?.originalTotalCartons || 0} ctn`,
                    newValue: `${adjustmentFields.returnedCartons || 0} ctn (${Number(adjustmentFields.returnedWeightKg || 0).toFixed(1)} kg)`
                  },
                  {
                    labelAr: 'تسوية الفاتورة',
                    labelEn: 'Invoice Credit',
                    oldValue: `${Number(adjustmentFields.preAdjustmentSnapshot?.originalGrandTotal || 0).toFixed(2)} EGP`,
                    newValue: `${Number(financials.grandTotal || 0).toFixed(2)} EGP (-${Number(adjustmentFields.returnedAmount || 0).toFixed(2)} EGP)`
                  },
                  ...(adjustmentFields.rejectionReason
                    ? [{ labelAr: 'سبب الرفض', labelEn: 'Rejection Reason', newValue: adjustmentFields.rejectionReason }]
                    : [])
                ]
              : metaDiffs,
            lineChanges
          }
        };
      }

      const existingAudit = editingOrder?.auditTrail || [];
      const updatedAuditTrail = [...existingAudit, auditEvent];

      const payload = {
        ...formData,
        lines: stampedLines,
        loadingOrderNumber: formData.loadingOrderNumber ?? null,
        assignedVehicleId: formData.assignedVehicleId || '',
        assignedVehicleName: formData.assignedVehicleName || '',
        assignedVehiclePlate: formData.assignedVehiclePlate || '',
        assignedDriverId: formData.assignedDriverId || '',
        assignedDriverName: formData.assignedDriverName || '',
        assignedDeliveryRepId: formData.assignedDeliveryRepId || '',
        assignedDeliveryRepName: formData.assignedDeliveryRepName || '',
        loadingDate: formData.loadingDate || '',
        ...financials,
        ...adjustmentFields,
        isAdministrative: Boolean(isAdminModal || ADMIN_ORDER_TYPES.some((t) => t.id === formData.orderType)),
        auditTrail: updatedAuditTrail,
        updatedAt: serverTimestamp(),
        updatedBy: currentUserName,
        updatedById: currentUserId
      };

      if (isNew) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = currentUserName;
        payload.createdById = currentUserId;
      }

      await setDoc(orderRef, payload, { merge: true });
      onClose();
    } catch (err) {
      console.error('Error saving sales order:', err);
      setErrorMsg(isAr ? 'حدث خطأ أثناء حفظ أمر البيع.' : 'Failed to save sales order.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className={`px-6 py-4 ltr:bg-gradient-to-r rtl:bg-gradient-to-l ${
          isAdminModal
            ? 'from-slate-900 via-purple-950 to-slate-900'
            : 'from-slate-900 via-indigo-950 to-slate-900'
        } text-white flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner ${
              isAdminModal
                ? 'bg-purple-500/20 border border-purple-400/30'
                : 'bg-emerald-500/20 border border-emerald-400/30'
            }`}>
              {isAdminModal ? (
                formData.orderType === 'collection' ? (
                  <Receipt className="w-5 h-5 text-purple-300" />
                ) : formData.orderType?.startsWith('invoice_only') ? (
                  <FileText className="w-5 h-5 text-purple-300" />
                ) : (
                  <Landmark className="w-5 h-5 text-purple-300" />
                )
              ) : (
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${
                  isAdminModal ? 'bg-purple-500/20 text-purple-300' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  #{formData.serial}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-slate-300 font-bold">
                  {isAdminModal
                    ? (isAr ? 'إجراء إداري / مالي' : 'Administrative / Financial')
                    : editingOrder ? (isAr ? 'تعديل أمر بيع' : 'Edit Sales Order') : (isAr ? 'أمر بيع جديد' : 'New Sales Order')}
                </span>
              </div>
              <h3 className="text-base font-black mt-0.5">
                {isAdminModal
                  ? (formData.orderType === 'admin'
                      ? (isAr ? 'تسجيل قرار وتوجيه إداري' : 'Administrative Directive & Action')
                      : formData.orderType === 'collection'
                      ? (isAr ? 'تسجيل إذن تحصيل مالي وسداد' : 'Financial Collection & Payment Receipt')
                      : (isAr ? 'فاتورة حسابية بدون تسليم فعلي' : 'Invoice Only (No Warehouse Dispatch)'))
                  : (isAr ? 'بيانات أمر البيع والتوريد وحساب الأسعار' : 'Sales Order Header & Product Pricing')}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {editingOrder && onOpenAuditTrail && (
              <button
                type="button"
                onClick={() => onOpenAuditTrail(editingOrder)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition text-slate-200 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isAr ? 'سجل التدقيق' : 'Audit Trail'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-xl transition text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Private Label Tax Warning Alert Banner */}
        {showPrivateLabelTaxAlert && !isAdminModal && (
          <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-amber-900 font-bold">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isAr
                  ? '⚠️ أصناف العلامة الخاصة تتطلب في الأصل فاتورة ضريبية رسمية. يمكنك التبديل الآن إلى ضريبي أو المتابعة بدون ضريبة (عينات / هدايا).'
                  : '⚠️ Private Label products require an official tax invoice. Switch to taxable or proceed as delivery note (sample/gift).'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handleVatModeChange('exclusive');
                  setAcknowledgedPlWarning(true);
                }}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
              >
                {isAr ? 'تحويل إلى ضريبي (+14%)' : 'Switch to Taxable'}
              </button>
              <button
                type="button"
                onClick={() => setAcknowledgedPlWarning(true)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'متابعة كـ إذن تسليم / عينات' : 'Proceed as Sample/Gift'}
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSaveOrder} className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Immutable Split Parent Reference Notice */}
          {isSplitParentLocked && (
            <div className="p-3.5 bg-violet-50 border border-violet-200 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="text-xs text-violet-950 space-y-0.5">
                <p className="font-extrabold">
                  {isAr ? 'أمر أب مقسم (مرجعي فقط — مقفل ضد التعديل)' : 'Split Parent Reference (Immutable Structural Lock)'}
                </p>
                <p className="text-[11px] text-violet-800">
                  {isAr
                    ? 'تم تقسيم هذا الطلب إلى شحنات فرعية. لتعديل الأصناف أو الكميات أو التسليم، يرجى التعديل في الشحنات الفرعية المقسمة.'
                    : 'This order has been split into child portions. Edit individual split child orders for dispatch or quantity adjustments.'}
                </p>
              </div>
            </div>
          )}

          {/* Post-Dispatch Lock & Partial Client Rejection Adjustment Bar */}
          {isPostDispatch && (
            <div className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
              adjustmentMode
                ? 'bg-gradient-to-r from-amber-50 via-rose-50/60 to-amber-50 border-amber-300'
                : 'bg-slate-100 border-slate-300'
            }`}>
              <div className="flex items-start gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  adjustmentMode ? 'bg-amber-600 text-white' : 'bg-slate-700 text-white'
                }`}>
                  {adjustmentMode ? <PackageMinus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>
                <div className="space-y-0.5">
                  <p className="font-extrabold text-xs text-slate-900">
                    {adjustmentMode
                      ? (isAr ? 'وضع مزامنة الكميات المستلمة فعلياً (مرتجع جزئي من العميل)' : 'Post-Dispatch Actual Received Qty Sync Mode Active')
                      : (isAr ? 'تم إقفال تعديل الأصناف والكميات والضريبة بعد خروج الشحنة' : 'Products, Quantities & Tax Treatment Locked (Post-Dispatch)')}
                  </p>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {adjustmentMode
                      ? (isAr
                          ? 'أدخل الكميات التي استلمها العميل فعلياً (من 0 حتى الكمية المنصرفة). عند الحفظ سيتم حساب المرتجع للمخزن وتعديل إجمالي الفاتورة.'
                          : 'Adjust Qty / Bonus down to what the client actually accepted (0 to dispatched). Saving updates warehouse return estimate & adjusted invoice.')
                      : canAdjustDispatchedQty
                      ? (isAr
                          ? 'أمر البيع في مرحلة (جاري التوصيل / تم التسليم / مدفوع). يمكنك تعديل الملاحظات والمستندات فقط، أو تفعيل وضع تسجيل المرتجع الجزئي.'
                          : 'Order is Out for Delivery or later. You can edit comments/PO attachments, or enable Partial Client Rejection Sync.')
                      : (isAr
                          ? 'أمر البيع في مرحلة (جاري التوصيل / تم التسليم / مدفوع). تعديل الكميات يتطلب صلاحية مزامنة المرتجع بعد التحميل.'
                          : 'Order is Out for Delivery or later. Modifying quantities requires post-dispatch adjustment permission (canAdjustDispatchedQuantities).')}
                  </p>
                </div>
              </div>

              {canAdjustDispatchedQty && (
                <div className="flex items-center gap-2 shrink-0">
                  {adjustmentMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          lines: prev.lines.map((l) => {
                            const base = baselineLineMap[l.productId] || l;
                            return calculateLineTotals(
                              {
                                ...l,
                                qty: Number(base.dispatchedQty ?? base.qty ?? 0),
                                bonus: Number(base.dispatchedBonus ?? base.bonus ?? 0)
                              },
                              l.detectedUnitPrice,
                              l.isPromotional,
                              l.promoDiscountPct,
                              prev.vatMode
                            );
                          })
                        }));
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-[11px] font-bold transition cursor-pointer"
                    >
                      {isAr ? 'استعادة الكمية المنصرفة' : 'Reset to Dispatched'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-extrabold transition cursor-pointer shadow-xs ${
                      adjustmentMode
                        ? 'bg-slate-800 hover:bg-slate-900 text-white'
                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    <PackageMinus className="w-3.5 h-3.5" />
                    <span>
                      {adjustmentMode
                        ? (isAr ? 'إلغاء وضع التسوية' : 'Exit Adjustment Mode')
                        : (isAr ? 'تفعيل تعديل الكميات المستلمة (رفض جزئي)' : 'Record Partial Rejection / Sync Qty')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section 1: Order Dates, Type, Client, Branch & Operational Profile */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-200 pb-2">
              {isAdminModal ? (
                <Landmark className="w-4 h-4 text-purple-600" />
              ) : (
                <Building2 className="w-4 h-4 text-emerald-600" />
              )}
              <span>
                {isAdminModal
                  ? (isAr ? '١. بيانات التواريخ ونوع الإجراء والمركز الإداري' : '1. Dates, Directive Type & Administrative HQ')
                  : (isAr ? '١. بيانات التواريخ ونوع الطلب والعميل والفرع' : '1. Order Dates, Type, Client & Branch')}
              </span>
            </h4>

            {/* Row 1: The 2 Date fields + Order Type beside them on the same row */}
            <div className={`grid grid-cols-1 ${isAdminModal ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
              {/* Invoice Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAdminModal ? (isAr ? 'تاريخ المستند / الإجراء *' : 'Action / Invoice Date *') : (isAr ? 'تاريخ الفاتورة / التسليم *' : 'Invoice / Delivery Date *')}
                </label>
                <input
                  type="date"
                  required
                  disabled={isStructureLocked}
                  value={formData.invoiceDate}
                  onChange={(e) => {
                    if (isStructureLocked) return;
                    handleInvoiceDateChange(e.target.value);
                  }}
                  className={`w-full py-2 px-3 border rounded-xl font-mono font-bold text-slate-800 focus:outline-none ${
                    isStructureLocked ? 'bg-slate-100 border-slate-300 cursor-not-allowed opacity-75' : 'bg-white border-slate-300'
                  }`}
                />
              </div>

              {/* Loading Date + Link toggle (Sales Modal Only) */}
              {!isAdminModal && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <span>{isAr ? 'تاريخ التحميل *' : 'Loading Date *'}</span>
                      {hasActiveAssignment && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded" title={isAr ? 'مُقيد بالشاحنة المخصصة' : 'Locked to truck'}>
                          <Lock className="w-2.5 h-2.5" />
                          <span>{isAr ? 'مثبت بالشاحنة' : 'Locked'}</span>
                        </span>
                      )}
                    </label>
                    {!hasActiveAssignment && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            isDatesLinked: true,
                            loadingDate: prev.invoiceDate
                          }));
                        }}
                        className="text-[10px] font-bold text-emerald-600 hover:underline cursor-pointer flex items-center gap-0.5"
                        title={isAr ? 'مطابقة ومزامنة تاريخ التحميل مع تاريخ الفاتورة' : 'Sync with Invoice Date'}
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>{isAr ? 'مطابقة الفاتورة' : 'Sync'}</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    required
                    disabled={hasActiveAssignment}
                    value={formData.loadingDate}
                    onChange={(e) => {
                      if (hasActiveAssignment) return;
                      setFormData({
                        ...formData,
                        loadingDate: e.target.value,
                        isDatesLinked: Boolean(e.target.value === formData.invoiceDate)
                      });
                    }}
                    className={`w-full py-2 px-3 border rounded-xl font-mono font-bold text-slate-800 focus:outline-none ${
                      hasActiveAssignment ? 'bg-slate-100/90 border-amber-300 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-300'
                    }`}
                  />
                  {hasActiveAssignment && (() => {
                    const matchedVehModal = vehicles.find((v) => v.id === formData.assignedVehicleId);
                    const modalVehName = resolveVehicleDisplayName(matchedVehModal, formData.assignedVehicleName);
                    const modalVehPlate = formData.assignedVehiclePlate || matchedVehModal?.plateNumber || '';
                    return (
                      <span className="text-[10px] text-amber-700 font-medium block mt-1 leading-tight">
                        {isAr
                          ? `الطلب مُسكن بشاحنة (${modalVehName || modalVehPlate || ''}) ورحلة #${formData.loadingOrderNumber || ''} — تعديل موعد التسكين يُجرى حصرياً من تبويب خطة التحميل`
                          : `Order assigned to ${modalVehName || ''} (Trip #${formData.loadingOrderNumber || ''}) — Rescheduling must be done in Loading Plan`}
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* Order Type beside them on the same row */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAdminModal ? (isAr ? 'نوع الإجراء الإداري / المالي *' : 'Directive / Action Type *') : (isAr ? 'نوع الطلب *' : 'Order Type *')}
                </label>
                <select
                  value={formData.orderType}
                  disabled={isStructureLocked}
                  onChange={(e) => {
                    if (isStructureLocked) return;
                    handleOrderTypeChange(e.target.value);
                  }}
                  className={`w-full py-2 px-2.5 border rounded-xl font-bold focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed ${
                    isAdminModal ? 'bg-white border-purple-300 text-purple-950 focus:ring-1 focus:ring-purple-400' : 'bg-white border-slate-300 text-slate-800 cursor-pointer'
                  }`}
                >
                  {availableOrderTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {isAr ? t.labelAr : t.labelEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Read-Only Dispatch Assignment Card (if order is assigned) */}
            {hasActiveAssignment && (() => {
              const matchedVehModal = vehicles.find((v) => v.id === formData.assignedVehicleId);
              const modalVehName = resolveVehicleDisplayName(matchedVehModal, formData.assignedVehicleName);
              const modalVehPlate = formData.assignedVehiclePlate || matchedVehModal?.plateNumber || '';
              return (
              <div className="p-3 bg-gradient-to-r from-amber-50/90 via-indigo-50/60 to-amber-50/90 border border-amber-300/80 rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-900 flex items-center justify-center shrink-0 shadow-2xs">
                    <Truck className="w-4 h-4 rtl:-scale-x-100" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-slate-900">
                        {modalVehName || (isAr ? 'شاحنة معتمدة' : 'Assigned Truck')}
                      </span>
                      {modalVehPlate && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-700 font-bold">
                          <span>{modalVehPlate}</span>
                          <CopyButton text={modalVehPlate} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} />
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono">
                        {isAr ? `رحلة #${formData.loadingOrderNumber}` : `Trip #${formData.loadingOrderNumber}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 font-medium flex items-center gap-2 mt-0.5 flex-wrap">
                      {formData.assignedDriverName && (
                        <span>{isAr ? 'السائق:' : 'Driver:'} <strong className="text-slate-800">{formData.assignedDriverName}</strong></span>
                      )}
                      {formData.assignedDeliveryRepName && (
                        <span>{isAr ? 'المندوب:' : 'Rep:'} <strong className="text-slate-800">{formData.assignedDeliveryRepName}</strong></span>
                      )}
                      <span>{isAr ? 'تاريخ التحميل:' : 'Loading Date:'} <strong className="text-slate-800 font-mono">{formData.loadingDate}</strong></span>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-2.5 py-1 rounded-lg border border-amber-200 shrink-0">
                  {isAr ? 'بيانات معتمدة للقراءة فقط' : 'Read-Only Assignment'}
                </span>
              </div>
              );
            })()}

            {/* Row 2: Client Name and Branch on next row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
              {/* Client SearchableSelect */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {formData.orderType === 'admin'
                    ? (isAr ? 'العميل (اختياري للإجراءات العامة)' : 'Client (Optional)')
                    : (isAr ? 'العميل *' : 'Client *')}
                </label>
                <div className={isStructureLocked ? 'pointer-events-none opacity-65' : ''}>
                  <SearchableSelect
                    options={clientSelectOptions}
                    value={formData.clientId}
                    onChange={(v) => {
                      if (isStructureLocked) return;
                      handleClientChange(v);
                    }}
                    placeholder={
                      formData.orderType === 'admin'
                        ? (isAr ? '— اختياري (بدون تخصيص عميل) —' : '— Optional (General) —')
                        : (isAr ? 'اختر العميل...' : 'Select Client...')
                    }
                    searchPlaceholder={isAr ? 'ابحث باسم العميل عربي / إنجليزي...' : 'Search client...'}
                    isAr={isAr}
                  />
                </div>
              </div>

              {/* Branch Selection or Locked HQ Info */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAdminModal ? (isAr ? 'المركز الإداري المسجل عليه' : 'Administrative Center') : (isAr ? 'فرع التسليم والمستودع *' : 'Delivery Branch *')}
                </label>
                {isAdminModal ? (
                  <div className="p-2 bg-purple-50/70 border border-purple-200 rounded-xl flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-purple-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-purple-900 text-xs block truncate">
                        {isAr ? 'المقر الإداري الرئيسي (المركز العام)' : 'Main Administrative HQ'}
                      </span>
                      <span className="text-[10px] text-purple-600 font-medium block truncate">
                        {isAr ? 'إجراء إداري / مالي لا يتطلب مستودع تسليم' : 'Office administrative action (No delivery warehouse)'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <select
                    value={formData.branchId}
                    onChange={(e) => {
                      if (isStructureLocked) return;
                      handleBranchChange(e.target.value);
                    }}
                    disabled={!formData.clientId || isStructureLocked}
                    className="w-full py-2 px-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed truncate"
                  >
                    {deliveryBranches.length === 0 ? (
                      <option value="">
                        {isAr ? '— لا توجد فروع تسليم مسجلة للعميل —' : '— No delivery branches found —'}
                      </option>
                    ) : (
                      deliveryBranches.map((b) => (
                        <option key={b.id || 'br_deliv'} value={b.id}>
                          {resolveBranchDisplayName(b, isAr)}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            </div>

            {/* Row 3: Then the operational profile (Sales & Admin Modals) */}
            {clientOperationalProfile && (
              <div className="mt-3 p-3.5 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-slate-50 to-indigo-50/30 border border-slate-200/90 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-extrabold text-slate-800 text-xs">
                      {isAr ? 'الملف التشغيلي للفرع والعميل:' : 'Operational Profile:'}
                    </span>
                    <span className="font-bold text-indigo-900 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md text-[11px]">
                      {formData.clientName} — {clientOperationalProfile.branchName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                    <span>{isAr ? 'جهة الاتصال:' : 'Contact:'}</span>
                    <span className="font-bold text-slate-800">{clientOperationalProfile.contactPerson}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
                  {/* 1. Region & Address */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 space-y-1">
                    <div className="text-slate-500 font-bold flex items-center gap-1 text-[10px]">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{isAr ? 'المنطقة والعنوان' : 'Region & Address'}</span>
                    </div>
                    <div className="font-bold text-slate-800 truncate" title={clientOperationalProfile.region}>
                      [{clientOperationalProfile.region}]
                    </div>
                    <div className="text-slate-600 truncate text-[10px]" title={clientOperationalProfile.address}>
                      {clientOperationalProfile.address}
                    </div>
                  </div>

                  {/* 2. Phones */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 space-y-1">
                    <div className="text-slate-500 font-bold flex items-center gap-1 text-[10px]">
                      <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{isAr ? 'أرقام الهواتف' : 'Phone Numbers'}</span>
                    </div>
                    <div className="font-bold text-slate-800 truncate font-mono text-[11px]" title={clientOperationalProfile.phonesDisplay}>
                      {clientOperationalProfile.phonesDisplay}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      {isAr ? 'للتنسيق مع سائق التحميل' : 'For driver coordination'}
                    </div>
                  </div>

                  {/* 3. Working Hours */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 space-y-1">
                    <div className="text-slate-500 font-bold flex items-center gap-1 text-[10px]">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>{isAr ? 'مواعيد العمل التشغيلية' : 'Operating Schedule'}</span>
                    </div>
                    <div className="font-bold text-slate-800 font-mono text-xs">
                      {clientOperationalProfile.scheduleDisplay}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      {isAr ? 'ساعات استلام البضائع' : 'Receiving window'}
                    </div>
                  </div>

                  {/* 4. Weekly Holidays */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 space-y-1">
                    <div className="text-slate-500 font-bold flex items-center gap-1 text-[10px]">
                      <Calendar className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <span>{isAr ? 'العطلات الأسبوعية' : 'Weekly Holidays'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {clientOperationalProfile.holidays.length === 0 ? (
                        <span className="text-slate-400 font-mono text-xs">—</span>
                      ) : (
                        clientOperationalProfile.holidays.map((h) => (
                          <span key={h.key} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            {h.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Client Master Notes */}
                {clientOperationalProfile.hasClientNotes && (
                  <div className="p-2.5 bg-amber-50/80 border border-amber-200/90 rounded-xl flex items-start gap-2 shadow-2xs">
                    <StickyNote className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-amber-800 font-bold block font-sans">
                        {isAr ? 'ملاحظات وتوجيهات خاصة بالعميل:' : 'Customer Notes & Instructions:'}
                      </span>
                      <p className="text-xs text-amber-950 font-medium whitespace-pre-wrap break-words leading-relaxed">
                        {clientOperationalProfile.clientNotes}
                      </p>
                    </div>
                  </div>
                )}

                {/* Holiday Conflict Warning */}
                {(clientOperationalProfile.invoiceHolidayConflict || clientOperationalProfile.loadingHolidayConflict) && (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 flex items-center gap-2 text-[11px] font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isAr
                        ? `⚠️ تنبيه تشغيلي: تاريخ ${
                            clientOperationalProfile.invoiceHolidayConflict
                              ? `التسليم (${formData.invoiceDate}) يوافق يوم عطلة للعميل (${clientOperationalProfile.invoiceHolidayConflict})`
                              : `التحميل (${formData.loadingDate}) يوافق يوم عطلة للعميل (${clientOperationalProfile.loadingHolidayConflict})`
                          }. يرجى مراجعة التنسيق مع العميل قبل التأكيد.`
                        : `⚠️ Operational Alert: Selected date falls on client holiday (${
                            clientOperationalProfile.invoiceHolidayConflict || clientOperationalProfile.loadingHolidayConflict
                          }). Please coordinate before confirmation.`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Tax / VAT Mode (Sales Orders & Invoice Only) */}
          {(!isAdminModal || formData.orderType.startsWith('invoice_only')) && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? '٢. المعاملة الضريبية (Tax / VAT Mode)' : '2. Tax / VAT Treatment'}</span>
                </h4>
                {formData.vatMode === 'none' ? (
                  <span className="text-[10px] text-slate-700 font-bold bg-slate-200/80 px-2.5 py-0.5 rounded-lg border border-slate-300">
                    {isAr ? 'إذن تسليم داخلي (غير خاضع للضريبة)' : 'Unofficial Delivery Note'}
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100/90 px-2.5 py-0.5 rounded-lg border border-emerald-300">
                    {isAr ? 'فاتورة ضريبية رسمية (14% VAT)' : 'Official Tax Invoice (14% VAT)'}
                  </span>
                )}
              </div>

              <div className={`grid grid-cols-1 sm:grid-cols-2 ${availableVatModes.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-2 pt-1`}>
                {availableVatModes.map((v) => {
                  const isSelected = formData.vatMode === v.id;
                  let activeClasses = '';
                  let inactiveClasses = '';

                  if (v.id === 'none') {
                    activeClasses = 'bg-slate-800 text-white border-slate-900 shadow-sm ring-2 ring-slate-400/30';
                    inactiveClasses = 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300';
                  } else if (v.id === 'exclusive') {
                    activeClasses = 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-400/30';
                    inactiveClasses = 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300';
                  } else if (v.id === 'exclusive_wht') {
                    activeClasses = 'bg-teal-600 text-white border-teal-700 shadow-sm ring-2 ring-teal-400/30';
                    inactiveClasses = 'bg-white text-teal-800 border-teal-200 hover:bg-teal-50 hover:border-teal-300';
                  } else if (v.id === 'inclusive') {
                    activeClasses = 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-400/30';
                    inactiveClasses = 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50 hover:border-blue-300';
                  } else if (v.id === 'inclusive_wht') {
                    activeClasses = 'bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-400/30';
                    inactiveClasses = 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300';
                  }

                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={isStructureLocked}
                      onClick={() => handleVatModeChange(v.id)}
                      className={`p-2.5 rounded-xl border text-start transition flex flex-col justify-between gap-1 ${
                        isSelected ? activeClasses : inactiveClasses
                      } ${isStructureLocked ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span className="font-extrabold text-xs truncate">
                          {isAr ? v.labelAr.split('(')[0].trim() : v.labelEn.split('(')[0].trim()}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </div>
                      <span className={`text-[10px] font-medium leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                        {isAr ? v.labelAr : v.labelEn}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dynamic Content: Administrative Directive (Admin Modal Only) */}
          {formData.orderType === 'admin' && (
            <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-2xl space-y-3">
              <h4 className="font-extrabold text-purple-950 text-xs flex items-center gap-1.5 border-b border-purple-200/80 pb-2">
                <Landmark className="w-4 h-4 text-purple-600" />
                <span>{isAr ? '٢. بيان القرار والتوجيه الإداري' : '2. Administrative Directive Statement'}</span>
              </h4>

              <div>
                <label className="block text-[11px] font-bold text-purple-900 mb-1">
                  {isAr ? 'بيان وتفاصيل القرار / الإجراء الإداري *' : 'Administrative Directive / Statement *'}
                </label>
                <textarea
                  rows={8}
                  required
                  value={formData.adminNotes}
                  onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                  placeholder={isAr ? 'اكتب هنا نص القرار والتوجيه الإداري بالتفصيل، الأسباب التنظيمية، أو أية سياقات مالية وإدارية...' : 'Enter the complete administrative decision, directives, context, or organizational rationale...'}
                  className="w-full p-3 bg-white border border-purple-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
            </div>
          )}

          {/* Dynamic Content: Financial Collection (Admin Modal Only) */}
          {formData.orderType === 'collection' && (
            <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-2xl space-y-3">
              <h4 className="font-extrabold text-teal-950 text-xs flex items-center gap-1.5 border-b border-teal-200/80 pb-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <span>{isAr ? '٢. بيانات التحصيل المالي والسداد' : '2. Collection Payment Details'}</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-teal-900 mb-1">
                    {isAr ? 'مبلغ التحصيل (ج.م) *' : 'Collection Amount (EGP) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formData.collectionAmount}
                    onChange={(e) => setFormData({ ...formData, collectionAmount: e.target.value })}
                    placeholder="0.00"
                    className="w-full py-2 px-3 bg-white border border-teal-300 rounded-xl font-mono font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teal-900 mb-1">
                    {isAr ? 'طريقة السداد' : 'Payment Method'}
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full py-2 px-2.5 bg-white border border-teal-300 rounded-xl font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="cash">{isAr ? 'نقدي (كاش)' : 'Cash'}</option>
                    <option value="cheque">{isAr ? 'شيك بنكي' : 'Cheque'}</option>
                    <option value="bank_transfer">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                    <option value="direct_deposit">{isAr ? 'إيداع بنكي مباشر' : 'Direct Deposit'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teal-900 mb-1">
                    {isAr ? 'رقم الشيك / الإيصال / الحوالة' : 'Receipt / Cheque #'}
                  </label>
                  <input
                    type="text"
                    value={formData.receiptNumber}
                    onChange={(e) => setFormData({ ...formData, receiptNumber: e.target.value })}
                    placeholder={isAr ? 'رقم الإيصال أو الشيك...' : 'Cheque/Receipt ref...'}
                    className="w-full py-2 px-3 bg-white border border-teal-300 rounded-xl font-mono font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-teal-900 mb-1">
                    {isAr ? 'ملاحظات التحصيل وبيانات البنك' : 'Collection Notes & Bank Details'}
                  </label>
                  <textarea
                    rows={3}
                    value={formData.adminNotes}
                    onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                    placeholder={isAr ? 'بيانات البنك، رقم الحساب، أو أية تفاصيل خاصة بالسداد...' : 'Bank name, account details, or specific collection notes...'}
                    className="w-full p-2.5 bg-white border border-teal-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Product Line Items Grid (Sales Orders & Invoice Only) */}
          {(!isAdminModal || formData.orderType.startsWith('invoice_only')) && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? '٣. بنود الأصناف وحساب الأسعار التلقائي (8-Tier Pricing)' : '3. Product Line Items & Pricing'}</span>
                </h4>

                {/* Document Classification indicator */}
                <div className="flex items-center gap-2">
                  {formData.vatMode !== 'none' ? (
                    hasPrivateLabelLines && hasOwnBrandLines ? (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                        {isAr ? 'مستند: فاتورتين (طاووس + علامة خاصة)' : 'Dual Invoices: Tawoos + PL'}
                      </span>
                    ) : hasPrivateLabelLines ? (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                        {isAr ? 'مستند: فاتورة ضريبية علامة خاصة' : 'PL Tax Invoice'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                        {isAr ? 'مستند: فاتورة ضريبية طاووس' : 'Tawoos Tax Invoice'}
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-lg border border-slate-300">
                      {isAr ? 'مستند: إذن تسليم' : 'Delivery Note'}
                    </span>
                  )}
                </div>
              </div>

              {/* Add Product Search & Category Bar (hidden once post-dispatch locked or split parent) */}
              {!isStructureLocked ? (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Category Filter */}
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="py-2 px-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="all">{isAr ? 'كافة تصنيفات الأصناف' : 'All Product Categories'}</option>
                    {productCategories.map((cat) => (
                      <option key={cat.id} value={cat.key || cat.id}>
                        {isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)}
                      </option>
                    ))}
                  </select>

                  {/* Product Selector */}
                  <div className="flex-1 min-w-[280px]">
                    <SearchableSelect
                      options={availableProductOptions}
                      value={selectedProductId}
                      onChange={handleAddProduct}
                      placeholder={isAr ? '— اختر الصنف للإضافة —' : '— Select Product to Add —'}
                      searchPlaceholder={isAr ? 'ابحث باسم أو كود الصنف...' : 'Search product...'}
                      isAr={isAr}
                    />
                  </div>
                </div>
              ) : isPostDispatch && adjustmentMode ? (
                (() => {
                  const snap = editingOrder?.preAdjustmentSnapshot || {};
                  const origGrandTotal = Number(snap.originalGrandTotal ?? editingOrder?.grandTotal ?? 0);
                  const origWeightKg = Number(snap.originalTotalWeightKg ?? editingOrder?.totalWeightKg ?? 0);
                  const returnedCtnLive = formData.lines.reduce((sum, ln) => {
                    const base = baselineLineMap[ln.productId] || ln;
                    const dispCtn = Number(base.dispatchedQty ?? base.qty ?? 0) + Number(base.dispatchedBonus ?? base.bonus ?? 0);
                    const recvCtn = Number(ln.qty || 0) + Number(ln.bonus || 0);
                    return sum + Math.max(0, dispCtn - recvCtn);
                  }, 0);
                  const creditEgp = Math.max(0, origGrandTotal - orderCalculations.grandTotal);
                  const returnKg = Math.max(0, origWeightKg - orderCalculations.totalWeightKg);

                  return (
                    <div className="p-3 bg-white border border-amber-300 rounded-xl space-y-2.5 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="font-extrabold text-amber-900">
                          {isAr ? 'ملخص التسوية الفورية للمستلم فعلياً:' : 'Live Partial Rejection Reconciliation:'}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 font-mono">
                          <span className="px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                            {isAr ? `مرتجع للمخزن: -${returnedCtnLive} كرتونة (${returnKg.toFixed(1)} كجم)` : `Warehouse Return: -${returnedCtnLive} ctn (${returnKg.toFixed(1)} kg)`}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold">
                            {isAr ? `إجمالي معدل: ${orderCalculations.grandTotal.toFixed(2)} ج.م` : `Adjusted Total: ${orderCalculations.grandTotal.toFixed(2)} EGP`}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-rose-600 text-white font-black">
                            {isAr ? `خصم تسوية الفاتورة: -${creditEgp.toFixed(2)} ج.م` : `Credit: -${creditEgp.toFixed(2)} EGP`}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          {isAr ? 'سبب الرفض الجزئي من العميل (إلزامي عند وجود مرتجع) *' : 'Client Rejection Reason (Required when returning cartons) *'}
                        </label>
                        <input
                          type="text"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder={isAr ? 'مثال: رفض العميل ٢ كرتونة لتلف التغليف أو عدم مطابقة تاريخ الصلاحية...' : 'e.g. Client refused 2 damaged cartons upon delivery...'}
                          className="w-full py-1.5 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  );
                })()
              ) : null}

              {/* Line Items Table */}
              {formData.lines.length === 0 ? (
                <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                  {isAr ? 'لم تتم إضافة أي أصناف حتى الآن. اختر صنفاً من القائمة أعلاه.' : 'No products added yet. Select a product above.'}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px] whitespace-nowrap">
                        <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                        <th className="py-2.5 px-2 text-center w-24">{isAr ? 'الكمية (كرتونة)' : 'Qty (Carton)'}</th>
                        <th className="py-2.5 px-2 text-center w-20">{isAr ? 'بونص' : 'Bonus'}</th>
                        <th className="py-2.5 px-2 text-center w-28">{isAr ? 'السعر (مقفل)' : 'Unit Price'}</th>
                        <th className="py-2.5 px-2 text-center w-24">{isAr ? 'خصم/كرتونة' : 'Disc/Ctn'}</th>
                        <th className="py-2.5 px-2 text-center w-24">{isAr ? 'الضريبة' : 'VAT'}</th>
                        <th className="py-2.5 px-2 text-center w-20">{isAr ? 'أ.ت.ص' : 'WHT'}</th>
                        <th className="py-2.5 px-2 text-center w-24">{isAr ? 'الوزن (كجم)' : 'Weight (kg)'}</th>
                        <th className="py-2.5 px-3 text-end w-28">{isAr ? 'الإجمالي (EGP)' : 'Total'}</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.lines.map((line, idx) => {
                        const base = baselineLineMap[line.productId] || line;
                        const dispQty = Number(base.dispatchedQty ?? base.qty ?? 0);
                        const dispBonus = Number(base.dispatchedBonus ?? base.bonus ?? 0);
                        const retQtyLine = Math.max(0, dispQty - Number(line.qty || 0));
                        const retBonusLine = Math.max(0, dispBonus - Number(line.bonus || 0));
                        const qtyDisabled = isStructureLocked && !adjustmentMode;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            {/* Product Info + Promo Icon */}
                            <td className="py-2.5 px-3 font-bold text-slate-800">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                  {line.productCode}
                                </span>
                                <span>{isAr ? line.productNameAr : (line.productNameEn || line.productNameAr)}</span>
                                {line.isPrivateLabel && (
                                  <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">
                                    {isAr ? 'علامة خاصة' : 'PL'}
                                  </span>
                                )}
                                {line.isPromotional && (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 text-[10px] font-bold"
                                    title={isAr ? `عرض ترويجي (${line.promoDiscountPct ? `${line.promoDiscountPct.toFixed(1)}%` : ''})` : `Promotional (-${line.promoDiscountPct?.toFixed(1)}%)`}
                                  >
                                    <Zap className="w-3 h-3 text-rose-500 fill-rose-500" />
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Quantity */}
                            <td className="py-2 px-2 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  type="number"
                                  min="0"
                                  max={adjustmentMode ? dispQty : undefined}
                                  step="1"
                                  disabled={qtyDisabled}
                                  value={line.qty}
                                  onChange={(e) => handleLineChange(idx, 'qty', e.target.value)}
                                  className={`w-20 p-1.5 text-center font-mono font-bold border rounded-lg focus:outline-none ${
                                    qtyDisabled
                                      ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                      : adjustmentMode
                                      ? 'bg-amber-50/40 border-amber-300 text-slate-900 focus:ring-1 focus:ring-amber-500'
                                      : 'text-slate-900 border-slate-300 focus:ring-1 focus:ring-emerald-500'
                                  }`}
                                />
                                {isPostDispatch && (adjustmentMode || retQtyLine > 0) && (
                                  <span className="text-[9px] font-mono text-slate-500">
                                    {isAr ? `منصرف: ${dispQty}` : `Disp: ${dispQty}`}
                                    {retQtyLine > 0 && (
                                      <strong className="text-rose-600 ms-1">(-{retQtyLine})</strong>
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Bonus Units */}
                            <td className="py-2 px-2 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  type="number"
                                  min="0"
                                  max={adjustmentMode ? dispBonus : undefined}
                                  step="1"
                                  disabled={qtyDisabled}
                                  value={line.bonus}
                                  onChange={(e) => handleLineChange(idx, 'bonus', e.target.value)}
                                  placeholder="0"
                                  className={`w-16 p-1.5 text-center font-mono font-bold border rounded-lg focus:outline-none ${
                                    qtyDisabled
                                      ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                      : 'text-emerald-700 bg-emerald-50/50 border-emerald-200 focus:ring-1 focus:ring-emerald-500'
                                  }`}
                                />
                                {isPostDispatch && (adjustmentMode || retBonusLine > 0) && dispBonus > 0 && (
                                  <span className="text-[9px] font-mono text-slate-500">
                                    {dispBonus}
                                    {retBonusLine > 0 && (
                                      <strong className="text-rose-600 ms-1">(-{retBonusLine})</strong>
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Unit Price (LOCKED) */}
                            <td className="py-2 px-2 text-center font-mono">
                              <div className="flex flex-col items-center">
                                <span className="font-black text-slate-800 text-xs">
                                  {Number(line.detectedUnitPrice || 0).toFixed(2)}
                                </span>
                                {formData.vatMode.startsWith('inclusive') && line.vatRate !== '0%' && (
                                  <span className="text-[9px] text-slate-400 font-normal">
                                    {isAr ? 'قبل الضريبة:' : 'Base:'} {Number(line.effectiveBaseUnitPrice || 0).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Manual Discount Per Unit */}
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                disabled={isStructureLocked}
                                value={line.manualDiscountPerUnit}
                                onChange={(e) => handleLineChange(idx, 'manualDiscountPerUnit', e.target.value)}
                                placeholder="0.00"
                                className={`w-20 p-1.5 text-center font-mono font-semibold border rounded-lg focus:outline-none ${
                                  isStructureLocked
                                    ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                    : 'text-rose-600 bg-rose-50/30 border-rose-200'
                                }`}
                              />
                            </td>

                            {/* VAT */}
                            <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600">
                              {Number(line.lineVat || 0) > 0 ? (
                                <span className="text-emerald-700 font-bold">
                                  +{Number(line.lineVat).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400">0.00</span>
                              )}
                            </td>

                            {/* WHT */}
                            <td className="py-2 px-2 text-center font-mono text-[11px]">
                              {Number(line.lineWht || 0) > 0 ? (
                                <span className="text-amber-700 font-bold">
                                  -{Number(line.lineWht).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400">0.00</span>
                              )}
                            </td>

                            {/* Line Weight */}
                            <td className="py-2 px-2 text-center font-mono text-slate-500 text-[11px]">
                              {Number(line.lineWeightKg || 0).toFixed(1)}
                            </td>

                            {/* Total */}
                            <td className="py-2 px-3 text-end font-mono font-black text-slate-900 text-xs">
                              {Number(line.lineTotal || 0).toFixed(2)}
                            </td>

                            {/* Remove */}
                            <td className="py-2 px-2 text-center">
                              {!isStructureLocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                  title={isAr ? 'حذف البند' : 'Remove line'}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <Lock className="w-3 h-3 text-slate-300 mx-auto" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Financial Totals Breakdown Strip (Theme Consistent Light Mode) */}
              <div className="p-4 bg-white border border-slate-200/90 shadow-xs rounded-2xl grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-slate-500 block text-[10px] font-sans font-semibold">
                    {isAr ? 'إجمالي الكراتين:' : 'Total Cartons:'}
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {orderCalculations.totalCartons}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({orderCalculations.totalQty} + {orderCalculations.totalBonus})
                    </span>
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-slate-500 block text-[10px] font-sans font-semibold">
                    {isAr ? 'إجمالي الوزن:' : 'Total Weight:'}
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {orderCalculations.totalWeightKg.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500">kg</span>
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-slate-500 block text-[10px] font-sans font-semibold">
                    {isAr ? 'صافي قبل الضريبة:' : 'Net Pre-Tax:'}
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {orderCalculations.netPreTaxSubtotal.toFixed(2)}{' '}
                    <span className="text-[10px] font-normal text-slate-500">ج.م</span>
                  </span>
                </div>

                <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100 flex flex-col justify-between">
                  <span className="text-emerald-800 block text-[10px] font-sans font-semibold">
                    {isAr ? 'ضريبة القيمة المضافة:' : 'Total VAT (+14%):'}
                  </span>
                  <span className="text-sm font-black text-emerald-700">
                    +{orderCalculations.totalVat.toFixed(2)}{' '}
                    <span className="text-[10px] font-normal text-emerald-600">ج.م</span>
                  </span>
                </div>

                <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-100 flex flex-col justify-between">
                  <span className="text-amber-800 block text-[10px] font-sans font-semibold">
                    {isAr ? 'خصم من المنبع (1%):' : 'WHT (-1%):'}
                  </span>
                  <span className="text-sm font-black text-amber-700">
                    {orderCalculations.whtAmount > 0 ? `-${orderCalculations.whtAmount.toFixed(2)}` : '0.00'}{' '}
                    <span className="text-[10px] font-normal text-amber-600">ج.م</span>
                  </span>
                </div>

                <div className="bg-emerald-600 text-white p-2.5 rounded-xl text-end shadow-xs flex flex-col justify-between">
                  <span className="text-emerald-100 block text-[10px] font-sans font-bold">
                    {isAr ? 'الإجمالي النهائي:' : 'Grand Total:'}
                  </span>
                  <span className="text-base font-black text-white">
                    {orderCalculations.grandTotal.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-emerald-200">EGP</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Statuses, Comments & Representative */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <FileCheck className="w-4 h-4 text-indigo-600" />
              <span>
                {isAdminModal && !formData.orderType.startsWith('invoice_only')
                  ? (isAr ? '٣. حالات الاعتماد وملاحظات التنفيذ' : '3. Approval Status & Notes')
                  : (isAr ? '٤. حالات الطلب والملاحظات والمندوب' : '4. Statuses, Comments & Representative')}
              </span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'حالة التأكيد / الاعتماد' : 'Confirmation Status'}
                </label>
                <select
                  value={formData.confirmationStatus}
                  onChange={(e) => setFormData({ ...formData, confirmationStatus: e.target.value })}
                  className="w-full py-2 px-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {CONFIRMATION_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {isAr ? s.labelAr : s.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>{isAr ? 'حالة التنفيذ والتحميل' : 'Fulfillment Status'}</span>
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                    <Lock className="w-2.5 h-2.5" />
                    {isAr ? 'تُدار من خطة التحميل' : 'Managed in Loading Plan'}
                  </span>
                </label>
                {(() => {
                  const currentFulfillment =
                    availableFulfillmentStatuses.find((f) => f.id === formData.fulfillmentStatus) ||
                    availableFulfillmentStatuses[0] || {
                      id: 'not_yet',
                      labelAr: 'قيد الانتظار',
                      labelEn: 'Pending',
                      color: 'bg-slate-100 text-slate-700 border-slate-300'
                    };
                  return (
                    <div
                      className="w-full py-2 px-3 bg-slate-100/80 border border-slate-200 rounded-xl flex items-center justify-between cursor-not-allowed select-none"
                      title={
                        isAr
                          ? 'تُدار مراحل التحميل والتوصيل حصرياً من تبويب خطة التحميل'
                          : 'Fulfillment stages are managed exclusively from the Loading Plan tab'
                      }
                    >
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-black border ${
                          currentFulfillment.color || 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {isAr ? currentFulfillment.labelAr : currentFulfillment.labelEn}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500">
                        {isAr ? 'للقراءة فقط' : 'Read-only'}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'مندوب المبيعات / المسؤول' : 'Sales Rep / Officer'}
                </label>
                <input
                  type="text"
                  value={formData.salesRep}
                  onChange={(e) => setFormData({ ...formData, salesRep: e.target.value })}
                  placeholder={isAr ? 'اسم المندوب أو المسؤول...' : 'Sales rep name...'}
                  className="w-full py-2 px-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{isAr ? 'ملاحظات خارجية (تظهر على الفاتورة / الإذن)' : 'External Comments (On Invoice)'}</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.externalComments}
                    onChange={(e) => setFormData({ ...formData, externalComments: e.target.value })}
                    placeholder={isAr ? 'ملاحظات موجهة للعميل أو السائق...' : 'Notes printed on invoice/delivery note...'}
                    className="w-full py-1.5 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{isAr ? 'ملاحظات داخلية (خاصة بالإدارة)' : 'Internal Comments (Private)'}</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.internalComments}
                    onChange={(e) => setFormData({ ...formData, internalComments: e.target.value })}
                    placeholder={isAr ? 'ملاحظات سرية للإدارة فقط...' : 'Private internal notes...'}
                    className="w-full py-1.5 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Finally PO Numbers & Multi-File Attachments */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <Paperclip className="w-4 h-4 text-blue-600" />
              <span>
                {isAdminModal && !formData.orderType.startsWith('invoice_only')
                  ? (formData.orderType === 'collection'
                      ? (isAr ? '٤. مرفقات إيصالات السداد وصور الشيكات' : '4. Receipt & Cheque Attachments')
                      : (isAr ? '٤. مرفقات المستندات والخطابات الرسمية' : '4. Official Document Attachments'))
                  : (isAr ? '٥. أوامر شراء العميل والمرفقات (POs & Attachments)' : '5. Customer PO Numbers & Attachments')}
              </span>
            </h4>

            {/* PO Numbers (Rendered for Sales Orders & Invoice Only) */}
            {(!isAdminModal || formData.orderType.startsWith('invoice_only')) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم أمر شراء طاووس (PO Tawoos)' : 'PO # Tawoos'}
                  </label>
                  <input
                    type="text"
                    value={formData.poTawoos}
                    onChange={(e) => setFormData({ ...formData, poTawoos: e.target.value })}
                    placeholder={isAr ? 'مثال: PO-TW-1082' : 'e.g. PO-TW-1082'}
                    className="w-full py-2 px-3 bg-white border border-slate-300 rounded-xl font-mono font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم أمر شراء العلامة الخاصة (PO Private Label)' : 'PO # Private Label'}
                  </label>
                  <input
                    type="text"
                    value={formData.poPrivateLabel}
                    onChange={(e) => setFormData({ ...formData, poPrivateLabel: e.target.value })}
                    placeholder={isAr ? 'مثال: PO-PL-4409' : 'e.g. PO-PL-4409'}
                    className="w-full py-2 px-3 bg-white border border-slate-300 rounded-xl font-mono font-semibold text-purple-800 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Attachments Uploader */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600">
                  {isAdminModal && !formData.orderType.startsWith('invoice_only')
                    ? (formData.orderType === 'collection'
                        ? (isAr ? 'مرفقات إيصالات وسندات السداد (صور / PDF):' : 'Receipt Attachments (Images / PDF):')
                        : (isAr ? 'مرفقات المستندات والخطابات (صور / PDF):' : 'Official Document Attachments (Images / PDF):'))
                    : (isAr ? 'مرفقات أوامر الشراء (صور / PDF):' : 'PO File Attachments (Images / PDF):')}
                </span>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleAttachmentUpload}
                  accept="image/*,application/pdf"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-200/80 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {isAdminModal && !formData.orderType.startsWith('invoice_only')
                      ? (formData.orderType === 'collection'
                          ? (isAr ? 'إرفاق إيصال / شيك' : 'Upload Receipt/Cheque')
                          : (isAr ? 'إرفاق وثيقة إدارية' : 'Upload Document'))
                      : (isAr ? 'إرفاق ملفات PO' : 'Upload PO Files')}
                  </span>
                </button>
              </div>

              {formData.poAttachments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {formData.poAttachments.map((att, idx) => (
                    <div
                      key={att.id || idx}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={att.poLabel || ''}
                            onChange={(e) => {
                              const updated = [...formData.poAttachments];
                              updated[idx].poLabel = e.target.value;
                              setFormData({ ...formData, poAttachments: updated });
                            }}
                            placeholder={att.name || 'PO #'}
                            className="w-full text-xs font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none truncate"
                          />
                          <span className="text-[10px] text-slate-400 font-mono block truncate">{att.name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (att.url) {
                              const win = window.open();
                              win.document.write(`<iframe src="${att.url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded"
                          title={isAr ? 'معاينة' : 'Preview'}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              poAttachments: formData.poAttachments.filter((_, i) => i !== idx)
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title={isAr ? 'حذف' : 'Remove'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="font-mono text-xs text-slate-400">
              Doc ID: {formData.id}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSaving || isSplitParentLocked}
                className={`px-6 py-2 rounded-xl text-xs font-bold shadow-xs hover:shadow transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-white ${
                  adjustmentMode
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : formData.orderType === 'admin'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : formData.orderType === 'collection'
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>
                  {adjustmentMode
                    ? (isAr ? 'مزامنة الكميات المستلمة وتحديث الفاتورة' : 'Force Sync Actual Received & Adjust Invoice')
                    : formData.orderType === 'admin'
                    ? (isAr ? 'اعتماد وحفظ الإجراء الإداري' : 'Save Directive')
                    : formData.orderType === 'collection'
                    ? (isAr ? 'تسجيل واعتماد إذن التحصيل' : 'Save Collection')
                    : editingOrder ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'إنشاء وتأكيد الطلب' : 'Create Order')}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
