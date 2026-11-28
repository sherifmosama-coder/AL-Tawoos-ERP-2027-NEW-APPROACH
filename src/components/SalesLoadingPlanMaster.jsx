import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Truck,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Map,
  Weight,
  Boxes,
  User,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Save,
  Check,
  AlertCircle,
  FileCheck,
  Building2,
  PackageCheck,
  Paperclip,
  Lock,
  MessageSquare,
  FileText,
  HelpCircle,
  ArrowUpDown,
  Sparkles,
  Layers,
  Tag,
  Edit2,
  Banknote,
  ExternalLink,
  ShieldAlert,
  Wrench,
  ArrowLeft,
  ArrowRight,
  Copy,
  GitFork,
  PackageMinus,
  Store,
  ClipboardCheck,
  ListOrdered,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import {
  collection,
  doc,
  writeBatch,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase.js';
import SearchableSelect from './SearchableSelect.jsx';
import PeacockLoader from './PeacockLoader.jsx';
import { canAccessAction } from '../config/appArchitecture.js';
import { RowCommentButton } from './comments';
import { resolveLocationInfo, normalizeLocationUrl } from '../utils/locationUtils.js';
import {
  compareOrdersBySerialAsc,
  isOrderRetailRoute,
  validateLoadingPlanOrderMandatoryFields,
  buildTripCommentDocId,
} from '../utils/salesOrderUtils.js';
import { buildUnifiedPersonnelPool } from '../utils/personnelDirectory.js';
import RetailSettlementModal from './RetailSettlementModal.jsx';
import LoadingPlanFgSidebar from './LoadingPlanFgSidebar.jsx';
import ClientProfileModal from './ClientProfileModal.jsx';
import { buildOrderTripAvailabilityMap } from '../utils/fgStockEngine.js';
import { makeTripDispatchDocId, evaluateReturnDiscrepancySummary } from '../utils/truckDispatchUtils.js';
import { SEGMENT_ICON_MAP } from './ClientSegmentsMaster.jsx';

const ORDER_TYPES = [
  { id: 'supply', labelAr: 'أمر توريد بيع', labelEn: 'Supply Order' },
  { id: 'return_deduct', labelAr: 'مرتجع خصم من المطالبة', labelEn: 'Return (Deduct)' },
  { id: 'return_no_deduct', labelAr: 'مرتجع بدون خصم', labelEn: 'Return (No Deduct)' },
  { id: 'replacement_old', labelAr: 'إحلال وتبديل (استبدال قديم)', labelEn: 'Replacement' },
  { id: 'exchange', labelAr: 'تبديل أصناف', labelEn: 'Item Exchange' },
  { id: 'collection', labelAr: 'تحصيل دفعات / شيكات', labelEn: 'Payment Collection' },
  { id: 'admin', labelAr: 'إجراء إداري / مالي', labelEn: 'Administrative' }
];

const FULFILLMENT_STATUSES = [
  { id: 'not_yet', labelAr: 'قيد الانتظار', labelEn: 'Pending', color: 'slate', icon: Clock },
  { id: 'prepare', labelAr: 'جاري التجهيز', labelEn: 'Preparing', color: 'amber', icon: PackageCheck },
  { id: 'shipped', labelAr: 'جاري التوصيل', labelEn: 'Out for Delivery', color: 'sky', icon: Truck },
  { id: 'delivered', labelAr: 'تم التسليم', labelEn: 'Delivered', color: 'emerald', icon: CheckCircle2 },
  { id: 'paid', labelAr: 'مدفوع', labelEn: 'Paid', color: 'indigo', icon: Banknote }
];

const SEQUENTIAL_FULFILLMENT_STEPS = [
  {
    id: 'not_yet',
    labelAr: 'قيد الانتظار',
    labelEn: 'Pending',
    icon: Clock,
    color: 'slate',
    badgeClasses: 'bg-slate-100 text-slate-800 border-slate-300 shadow-2xs',
    activeClasses: 'bg-slate-700 text-white border-slate-800 ring-2 ring-slate-500/30 shadow-xs'
  },
  {
    id: 'prepare',
    labelAr: 'جاري التجهيز',
    labelEn: 'Preparing',
    icon: PackageCheck,
    color: 'amber',
    badgeClasses: 'bg-amber-100 text-amber-950 border-amber-400 shadow-2xs ring-1 ring-amber-400/25',
    activeClasses: 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400/30 shadow-xs'
  },
  {
    id: 'shipped',
    labelAr: 'جاري التوصيل',
    labelEn: 'Out for Delivery',
    icon: Truck,
    color: 'sky',
    badgeClasses: 'bg-sky-100 text-sky-950 border-sky-400 shadow-2xs ring-1 ring-sky-400/25',
    activeClasses: 'bg-sky-600 text-white border-sky-700 ring-2 ring-sky-500/30 shadow-xs'
  },
  {
    id: 'delivered',
    labelAr: 'تم التسليم',
    labelEn: 'Delivered',
    icon: CheckCircle2,
    color: 'emerald',
    badgeClasses: 'bg-emerald-100 text-emerald-950 border-emerald-400 shadow-2xs ring-1 ring-emerald-400/25',
    activeClasses: 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-500/30 shadow-xs'
  }
];

const FULFILLMENT_CONFIG_MAP = {
  not_yet: {
    id: 'not_yet',
    labelAr: 'قيد الانتظار',
    labelEn: 'Pending',
    icon: Clock,
    color: 'slate',
    badgeClasses: 'bg-slate-100 text-slate-800 border-slate-300 ring-1 ring-slate-300/40',
    stripClasses: 'bg-gradient-to-b from-slate-100/85 to-slate-50/75 hover:from-slate-100 hover:to-slate-100/85 border-slate-200',
    cardAccentClasses: 'border-s-[5px] border-s-slate-400',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-slate-100 via-slate-50/95 to-white border-slate-300 border-s-[5px] border-s-slate-500 text-slate-900',
    groupIconClasses: 'bg-slate-600 text-white border-slate-700 shadow-2xs',
    groupCountClasses: 'bg-slate-200/80 text-slate-800 border-slate-300',
    filterActiveClasses: 'bg-slate-700 text-white border-slate-800 shadow-xs ring-2 ring-slate-500/25',
    filterIdleClasses: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300',
    textColor: 'text-slate-700',
    iconColor: 'text-slate-600'
  },
  prepare: {
    id: 'prepare',
    labelAr: 'جاري التجهيز',
    labelEn: 'Preparing',
    icon: PackageCheck,
    color: 'amber',
    badgeClasses: 'bg-amber-100 text-amber-950 border-amber-400 ring-1 ring-amber-400/35',
    stripClasses: 'bg-gradient-to-b from-amber-100/80 via-amber-50/65 to-amber-50/35 hover:from-amber-100/95 hover:to-amber-50/75 border-amber-300',
    cardAccentClasses: 'border-s-[5px] border-s-amber-500 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-amber-50/30 via-white to-white',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-amber-100/90 via-amber-50/75 to-white border-amber-300 border-s-[5px] border-s-amber-500 text-amber-950',
    groupIconClasses: 'bg-amber-500 text-white border-amber-600 shadow-2xs',
    groupCountClasses: 'bg-amber-100 text-amber-900 border-amber-300',
    filterActiveClasses: 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/30',
    filterIdleClasses: 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100/80 hover:border-amber-300',
    textColor: 'text-amber-900',
    iconColor: 'text-amber-600'
  },
  shipped: {
    id: 'shipped',
    labelAr: 'جاري التوصيل',
    labelEn: 'Out for Delivery',
    icon: Truck,
    color: 'sky',
    badgeClasses: 'bg-sky-100 text-sky-950 border-sky-400 ring-1 ring-sky-400/35',
    stripClasses: 'bg-gradient-to-b from-sky-100/80 via-sky-50/65 to-sky-50/35 hover:from-sky-100/95 hover:to-sky-50/75 border-sky-300',
    cardAccentClasses: 'border-s-[5px] border-s-sky-500 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-sky-50/30 via-white to-white',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-sky-100/90 via-sky-50/75 to-white border-sky-300 border-s-[5px] border-s-sky-600 text-sky-950',
    groupIconClasses: 'bg-sky-600 text-white border-sky-700 shadow-2xs',
    groupCountClasses: 'bg-sky-100 text-sky-900 border-sky-300',
    filterActiveClasses: 'bg-sky-600 text-white border-sky-700 shadow-xs ring-2 ring-sky-500/30',
    filterIdleClasses: 'bg-sky-50/70 text-sky-900 border-sky-200 hover:bg-sky-100/80 hover:border-sky-300',
    textColor: 'text-sky-900',
    iconColor: 'text-sky-600'
  },
  delivered: {
    id: 'delivered',
    labelAr: 'تم التسليم',
    labelEn: 'Delivered',
    icon: CheckCircle2,
    color: 'emerald',
    badgeClasses: 'bg-emerald-100 text-emerald-950 border-emerald-400 ring-1 ring-emerald-400/35',
    stripClasses: 'bg-gradient-to-b from-emerald-100/80 via-emerald-50/65 to-emerald-50/35 hover:from-emerald-100/95 hover:to-emerald-50/75 border-emerald-300',
    cardAccentClasses: 'border-s-[5px] border-s-emerald-600 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-50/25 via-white to-white',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-100/90 via-emerald-50/75 to-white border-emerald-300 border-s-[5px] border-s-emerald-600 text-emerald-950',
    groupIconClasses: 'bg-emerald-600 text-white border-emerald-700 shadow-2xs',
    groupCountClasses: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    filterActiveClasses: 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-500/30',
    filterIdleClasses: 'bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:bg-emerald-100/80 hover:border-emerald-300',
    textColor: 'text-emerald-900',
    iconColor: 'text-emerald-600'
  },
  paid: {
    id: 'paid',
    labelAr: 'مدفوع',
    labelEn: 'Paid',
    icon: Banknote,
    color: 'indigo',
    badgeClasses: 'bg-indigo-100 text-indigo-950 border-indigo-400 ring-1 ring-indigo-400/35',
    stripClasses: 'bg-gradient-to-b from-indigo-100/80 via-indigo-50/65 to-indigo-50/35 hover:from-indigo-100/95 hover:to-indigo-50/75 border-indigo-300',
    cardAccentClasses: 'border-s-[5px] border-s-indigo-600 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-indigo-50/25 via-white to-white',
    groupBannerClasses: 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-indigo-100/90 via-indigo-50/75 to-white border-indigo-300 border-s-[5px] border-s-indigo-600 text-indigo-950',
    groupIconClasses: 'bg-indigo-600 text-white border-indigo-700 shadow-2xs',
    groupCountClasses: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    filterActiveClasses: 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-500/30',
    filterIdleClasses: 'bg-indigo-50/70 text-indigo-900 border-indigo-200 hover:bg-indigo-100/80 hover:border-indigo-300',
    textColor: 'text-indigo-900',
    iconColor: 'text-indigo-600'
  }
};

/**
 * Standardizes the Vehicle Name (`vehicleModel` / `name` / `nameAr`) as the main reference across the module,
 * falling back to `code` or `id` only if no name is defined.
 */
const resolveVehicleDisplayName = (veh, fallbackName = '') => {
  if (!veh && !fallbackName) return '';
  const candidate = (
    veh?.vehicleModel ||
    veh?.name ||
    veh?.nameAr ||
    veh?.nameEn ||
    fallbackName ||
    veh?.code ||
    veh?.id ||
    ''
  ).trim();
  // If fallbackName was actually just the plateNumber or code and veh has a real vehicleModel, veh.vehicleModel wins above
  return candidate;
};

const WORKER_ROLE_LABELS = {
  operator: { ar: 'فني تشغيل ماكينات', en: 'Machine Operator' },
  technician: { ar: 'فني صيانة', en: 'Maintenance Technician' },
  qc: { ar: 'فني جودة', en: 'QC Inspector' },
  line_leader: { ar: 'قائد خط', en: 'Line Leader' },
  assistant: { ar: 'عامل مناولة', en: 'Packaging Assistant' },
  forklift: { ar: 'سائق كلارك / رافعة', en: 'Forklift Driver' },
  driver: { ar: 'سائق شاحنة', en: 'Truck Driver' },
};

const WEEKDAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_MAP_AR = {
  friday: 'الجمعة',
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الإثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
  0: 'الأحد',
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت'
};

const DAY_MAP_EN = {
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
};

// Resolve comprehensive operational profile and schedule notes
function resolveClientOperationalProfile(targetBranch, clientObj, isAr = true) {
  if (!clientObj && !targetBranch) {
    return {
      workingHoursDisplay: '',
      holidaysList: [],
      holidaysDisplay: '',
      clientNotes: '',
      branchNotes: '',
      combinedNotes: ''
    };
  }

  const useCustom = Boolean(targetBranch?.useCustomSchedule);
  const branchFrom = (targetBranch?.workingHoursFrom || '').trim();
  const branchTo = (targetBranch?.workingHoursTo || '').trim();
  const clientFrom = (clientObj?.workingHoursFrom || '').trim();
  const clientTo = (clientObj?.workingHoursTo || '').trim();

  const hoursFrom = useCustom && (branchFrom || branchTo) ? branchFrom : (clientFrom || branchFrom);
  const hoursTo = useCustom && (branchFrom || branchTo) ? branchTo : (clientTo || branchTo);

  let workingHoursDisplay = '';
  if (hoursFrom && hoursTo) {
    workingHoursDisplay = `${hoursFrom} — ${hoursTo}`;
  } else if (hoursFrom) {
    workingHoursDisplay = `${isAr ? 'من' : 'From'} ${hoursFrom}`;
  } else if (hoursTo) {
    workingHoursDisplay = `${isAr ? 'إلى' : 'To'} ${hoursTo}`;
  }

  const branchHolidays = Array.isArray(targetBranch?.weeklyHolidays) ? targetBranch.weeklyHolidays.filter(Boolean) : [];
  const clientHolidays = Array.isArray(clientObj?.weeklyHolidays) ? clientObj.weeklyHolidays.filter(Boolean) : [];

  let rawHolidays = [];
  if (useCustom && branchHolidays.length > 0) {
    rawHolidays = branchHolidays;
  } else if (clientHolidays.length > 0) {
    rawHolidays = clientHolidays;
  } else if (branchHolidays.length > 0) {
    rawHolidays = branchHolidays;
  }

  // Filter out Friday - only show weekly holidays if not Friday
  const nonFridayHolidays = rawHolidays.filter(
    (d) => String(d).toLowerCase().trim() !== 'friday' && d !== 5
  );

  const holidaysList = nonFridayHolidays;
  const holidaysDisplay = nonFridayHolidays
    .map((d) => {
      const key = String(d).toLowerCase().trim();
      return isAr ? (DAY_MAP_AR[key] || d) : (DAY_MAP_EN[key] || d);
    })
    .join('، ');

  const clientNotes = (clientObj?.notes || clientObj?.deliveryNotes || '').trim();
  const branchNotes = (targetBranch?.notes || '').trim();
  const combinedNotes = branchNotes && clientNotes && branchNotes !== clientNotes
    ? `${clientNotes} | ${branchNotes}`
    : (branchNotes || clientNotes);

  return {
    workingHoursDisplay,
    holidaysList,
    holidaysDisplay,
    clientNotes,
    branchNotes,
    combinedNotes
  };
}

function formatDateKey(dateObj) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateObj, days) {
  const result = new Date(dateObj);
  result.setDate(result.getDate() + days);
  return result;
}

// Calculate dismiss / stock release number as MMDDNN
function calculateDismissNumber(dateStr, loNumber) {
  if (!dateStr || !loNumber) return '—';
  const parts = String(dateStr).split('-');
  if (parts.length < 3) return '—';
  const mm = parts[1];
  const dd = parts[2];
  const nn = String(loNumber).padStart(2, '0');
  return `${mm}${dd}${nn}`;
}

// Resolve Order Serial format
function resolveOrderSerial(order, allOrders = []) {
  if (order.serial) return String(order.serial).padStart(4, '0');
  const idx = allOrders.findIndex((o) => o.id === order.id);
  if (idx !== -1) return String(allOrders.length - idx).padStart(4, '0');
  return String(order.id || '').slice(-4).toUpperCase();
}

// Fast contrast color calculator for segment-colored chips
function getContrastTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string' || !hexColor.startsWith('#')) return '#ffffff';
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 165 ? '#0f172a' : '#ffffff';
}

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

// Normalizes legacy ('preparing', 'out_for_delivery') and canonical ('prepare', 'shipped', 'delivered', 'paid', 'not_yet') fulfillment statuses
function normalizeFulfillmentStatus(st) {
  if (!st || st === 'not_yet' || st === 'pending') return 'not_yet';
  if (st === 'prepare' || st === 'preparing') return 'prepare';
  if (st === 'shipped' || st === 'out_for_delivery') return 'shipped';
  if (st === 'delivered' || st === 'paid') return 'delivered';
  return 'not_yet';
}

// Sleek Light-Themed Floating Rich Tooltip Card (Hover on desktop + Tap toggle support)
function FleetRichTooltip({ children, content, widthClass = 'w-60', enableTap = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={(e) => {
        if (enableTap) {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }
      }}
    >
      {children}
      {isOpen && content && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-full mb-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 ${widthClass} bg-white text-slate-800 border border-slate-200/95 shadow-2xl rounded-2xl p-2.5 z-50 text-start pointer-events-auto animate-in fade-in zoom-in-95 duration-150`}
        >
          {content}
          <div className="w-2.5 h-2.5 bg-white border-e border-b border-slate-200 rotate-45 absolute -bottom-1.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2"></div>
        </div>
      )}
    </div>
  );
}

// Animated Bottom Roadway Carousel for Truck Trips (Prev, Current, Next — max 3 visible slots)
function TripRoadwayCarousel({
  trips = [],
  activeIndex = 0,
  slideDir = 'next',
  onSelectTrip,
  vehicle,
  operationalStatus,
  priorOpenOrders = [],
  onFilterConflict,
  isAr = true
}) {
  if (!trips || trips.length === 0) {
    const isMaint = operationalStatus === 'maintenance';
    const isInact = operationalStatus === 'inactive';
    const hasPrior = priorOpenOrders.length > 0;
    return (
      <div
        className={`relative rounded-b-2xl px-2.5 py-1.5 flex items-center justify-between gap-2 border-t ${
          hasPrior
            ? 'bg-rose-950 text-rose-100 border-rose-800'
            : 'bg-slate-800 text-slate-300 border-slate-700'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`p-1 rounded-lg ${isMaint ? 'bg-purple-500/20 text-purple-300' : isInact ? 'bg-slate-700 text-slate-400' : 'bg-slate-700/90 text-slate-300'}`}>
            {isMaint ? <Wrench className="w-3 h-3" /> : <Truck className="w-3 h-3 rtl:-scale-x-100" />}
          </div>
          <span className="text-[10px] font-bold truncate">
            {isMaint
              ? (isAr ? 'في الصيانة — متوقفة' : 'In Maintenance — Parked')
              : isInact
              ? (isAr ? 'خارج الخدمة' : 'Out of Service')
              : (isAr ? 'جاهزة على الرصيف للتحميل' : 'Parked — Ready for Loading')}
          </span>
        </div>

        {/* Dashed Static Road Line */}
        <div className="flex-1 h-0.5 animate-road-dashes-static mx-1 hidden sm:block opacity-60"></div>

        {hasPrior && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[9px] font-black shrink-0 animate-pulse">
            <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
            <span>{isAr ? 'رحلة سابقة مفتوحة' : 'Prior Open Trip'}</span>
          </span>
        )}
      </div>
    );
  }

  const safeIdx = Math.min(Math.max(0, activeIndex), trips.length - 1);
  const prevTrip = safeIdx > 0 ? trips[safeIdx - 1] : null;
  const activeTrip = trips[safeIdx];
  const nextTrip = safeIdx < trips.length - 1 ? trips[safeIdx + 1] : null;

  const isOnRoad = activeTrip?.tripOperationalStatus === 'shipped';

  const renderStatusDot = (trip) => {
    if (trip.hasStatusConflict) return 'bg-rose-500 animate-ping';
    if (trip.currentStep?.id === 'shipped') return 'bg-sky-400 animate-pulse';
    if (trip.currentStep?.id === 'prepare') return 'bg-amber-400';
    if (trip.currentStep?.id === 'delivered') return 'bg-emerald-400';
    return 'bg-slate-400';
  };

  return (
    <div className="relative bg-slate-900 text-white rounded-b-2xl px-2 py-1.5 border-t border-slate-800 select-none">
      {/* Animated Roadway Centerline */}
      <div
        className={`absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 pointer-events-none ${
          isOnRoad ? 'animate-road-dashes opacity-80' : 'animate-road-dashes-static opacity-40'
        }`}
      ></div>

      <div className="relative z-10 flex items-center justify-between gap-1">
        {/* Previous Slot (Smaller Box) */}
        <div className="flex items-center gap-0.5 min-w-0 flex-1 justify-start">
          {trips.length > 1 && (
            <button
              type="button"
              disabled={!prevTrip}
              onClick={() => prevTrip && onSelectTrip(safeIdx - 1, 'prev')}
              className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 disabled:cursor-default cursor-pointer transition shrink-0"
              title={isAr ? 'الرحلة السابقة' : 'Previous Trip'}
            >
              {isAr ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>
          )}
          {prevTrip ? (
            <button
              type="button"
              onClick={() => onSelectTrip(safeIdx - 1, 'prev')}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold border transition cursor-pointer truncate max-w-[74px] ${
                prevTrip.hasStatusConflict
                  ? 'bg-rose-950/90 border-rose-500/60 text-rose-200 hover:bg-rose-900'
                  : 'bg-slate-800/95 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
              }`}
              title={isAr ? `عرض رحلة #${prevTrip.loadingOrderNumber}` : `View Trip #${prevTrip.loadingOrderNumber}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${renderStatusDot(prevTrip)}`}></span>
              <Truck className="w-2.5 h-2.5 text-slate-400 shrink-0 rtl:-scale-x-100" />
              <span className="truncate">#{prevTrip.loadingOrderNumber}</span>
              {prevTrip.hasStatusConflict && <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />}
            </button>
          ) : (
            <span className="text-[9px] text-slate-600 font-mono px-1 hidden sm:inline">•</span>
          )}
        </div>

        {/* Center Active Slot (Larger Animated Truck Pill) */}
        <div className="shrink-0">
          <div
            key={`${vehicle.id}-${safeIdx}-${slideDir}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-black border shadow-sm ${
              slideDir === 'prev' ? 'animate-truck-glide-prev' : 'animate-truck-glide-next'
            } ${
              activeTrip.hasStatusConflict
                ? 'bg-rose-600/95 border-rose-400 text-white ring-2 ring-rose-500/40'
                : activeTrip.currentStep?.id === 'shipped'
                ? 'bg-sky-600 border-sky-400 text-white ring-2 ring-sky-500/30'
                : activeTrip.currentStep?.id === 'prepare'
                ? 'bg-amber-500 border-amber-300 text-slate-950'
                : activeTrip.currentStep?.id === 'delivered'
                ? 'bg-emerald-600 border-emerald-400 text-white'
                : 'bg-slate-700 border-slate-500 text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5 shrink-0 rtl:-scale-x-100" />
            <span>
              {activeTrip.loadingOrderNumber === 'unnumbered'
                ? (isAr ? 'بدون رحلة' : 'No Trip#')
                : (isAr ? `رحلة #${activeTrip.loadingOrderNumber}` : `Trip #${activeTrip.loadingOrderNumber}`)}
            </span>
            {activeTrip.hasStatusConflict && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterConflict?.(activeTrip.loadingOrderNumber, vehicle);
                }}
                className="p-0.5 rounded bg-white/20 hover:bg-white/35 text-white transition cursor-pointer"
                title={isAr ? 'تعارض حالات: انقر لتصفية الطلبات وإصلاحه يدوياً' : 'Status Conflict: Click to filter orders & fix manually'}
              >
                <AlertTriangle className="w-3 h-3 animate-pulse" />
              </button>
            )}
            {trips.length > 1 && (
              <span className="text-[8px] opacity-80 font-normal ms-0.5">
                ({safeIdx + 1}/{trips.length})
              </span>
            )}
          </div>
        </div>

        {/* Next Slot (Smaller Box) */}
        <div className="flex items-center gap-0.5 min-w-0 flex-1 justify-end">
          {nextTrip ? (
            <button
              type="button"
              onClick={() => onSelectTrip(safeIdx + 1, 'next')}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold border transition cursor-pointer truncate max-w-[74px] ${
                nextTrip.hasStatusConflict
                  ? 'bg-rose-950/90 border-rose-500/60 text-rose-200 hover:bg-rose-900'
                  : 'bg-slate-800/95 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
              }`}
              title={isAr ? `عرض رحلة #${nextTrip.loadingOrderNumber}` : `View Trip #${nextTrip.loadingOrderNumber}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${renderStatusDot(nextTrip)}`}></span>
              <Truck className="w-2.5 h-2.5 text-slate-400 shrink-0 rtl:-scale-x-100" />
              <span className="truncate">#{nextTrip.loadingOrderNumber}</span>
              {nextTrip.hasStatusConflict && <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />}
            </button>
          ) : (
            <span className="text-[9px] text-slate-600 font-mono px-1 hidden sm:inline">•</span>
          )}
          {trips.length > 1 && (
            <button
              type="button"
              disabled={!nextTrip}
              onClick={() => nextTrip && onSelectTrip(safeIdx + 1, 'next')}
              className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 disabled:cursor-default cursor-pointer transition shrink-0"
              title={isAr ? 'الرحلة التالية' : 'Next Trip'}
            >
              {isAr ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Group trip orders into distinct client/branch stops with resolved optional deliverySequence
function getTripClientStops(assignedOrders = [], stagedAssignments = {}) {
  const stopByKey = {};
  const stops = [];
  (assignedOrders || []).forEach((ord, idx) => {
    const key = `${ord.clientId || ord.clientName || ord.id}::${ord.branchId || ord.branchName || 'main'}`;
    const staged = stagedAssignments?.[ord.id];
    const rawSeq = staged && staged.deliverySequence !== undefined
      ? staged.deliverySequence
      : ord.deliverySequence;
    const numSeq = Number(rawSeq);
    const validSeq = Number.isFinite(numSeq) && numSeq > 0 ? Math.floor(numSeq) : null;

    if (!stopByKey[key]) {
      const entry = {
        key,
        clientId: ord.clientId || '',
        clientName: ord.clientName || '—',
        branchName: ord.branchName || '',
        orderIds: [],
        orders: [],
        deliverySequence: validSeq,
        originalIndex: idx,
      };
      stopByKey[key] = entry;
      stops.push(entry);
    }
    const stop = stopByKey[key];
    stop.orderIds.push(ord.id);
    stop.orders.push(ord);
    if (validSeq !== null && (stop.deliverySequence === null || validSeq < stop.deliverySequence)) {
      stop.deliverySequence = validSeq;
    }
  });

  const hasManualSequence = stops.length > 1 && stops.some((s) => s.deliverySequence !== null);

  if (hasManualSequence) {
    stops.sort((a, b) => {
      const aHas = a.deliverySequence !== null;
      const bHas = b.deliverySequence !== null;
      if (aHas && bHas && a.deliverySequence !== b.deliverySequence) {
        return a.deliverySequence - b.deliverySequence;
      }
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.originalIndex - b.originalIndex;
    });
  }

  return { stops, hasManualSequence };
}

// Compact 50%-Size Truck Scorecard with Rich Light Hover Tooltips, Bidirectional Stepper & Trip Carousel
function CompactTruckCard({
  truckData,
  allOrders,
  targetPlanningDate = '',
  selectedTripState,
  onSelectTrip,
  onFilterConflict,
  onOpenTransitionModal,
  onOpenSequenceModal,
  onNavigateToTruckDispatch,
  isAr = true
}) {
  const {
    vehicle: veh,
    operationalStatus,
    conflicts,
    trips,
    priorOpenOrders,
    defaultTripIndex
  } = truckData;

  const activeTripIndex =
    selectedTripState?.index !== undefined && selectedTripState.index < trips.length
      ? selectedTripState.index
      : defaultTripIndex;
  const slideDir = selectedTripState?.dir || 'next';
  const activeTrip = trips.length > 0 ? trips[activeTripIndex] : null;

  const maxCap = Number(veh.maxCapacityKg) || 0;
  const tripWeightKg = activeTrip ? activeTrip.totalWeightKg : 0;
  const tripCartons = activeTrip ? activeTrip.totalCartons : 0;
  const tripBonus = activeTrip ? activeTrip.totalBonus : 0;
  const tripOrders = activeTrip ? activeTrip.orders : [];
  const weightPct = maxCap > 0 ? Math.min(100, Math.round((tripWeightKg / maxCap) * 100)) : 0;
  const rawWeightPct = maxCap > 0 ? Math.round((tripWeightKg / maxCap) * 100) : 0;
  const isOverweight = maxCap > 0 && tripWeightKg > maxCap;

  const precedingStep =
    activeTrip && !activeTrip.hasStatusConflict && activeTrip.currentStepIndex > 0
      ? SEQUENTIAL_FULFILLMENT_STEPS[activeTrip.currentStepIndex - 1]
      : null;
  const nextStep =
    activeTrip && !activeTrip.hasStatusConflict && activeTrip.currentStepIndex < 3
      ? SEQUENTIAL_FULFILLMENT_STEPS[activeTrip.currentStepIndex + 1]
      : null;

  const displayStatus = activeTrip
    ? (activeTrip.hasStatusConflict || activeTrip.tripOperationalStatus === 'conflict'
        ? 'conflict'
        : activeTrip.tripOperationalStatus)
    : operationalStatus;

  const hasReturnDiscrepancy = Boolean(activeTrip?.returnDiscrepancy?.hasDiscrepancy);

  const cardSurfaceClasses =
    hasReturnDiscrepancy
      ? 'bg-rose-50/45 border-rose-400 ring-2 ring-rose-400/50 shadow-xs'
      : displayStatus === 'conflict'
      ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-500/20 shadow-xs'
      : displayStatus === 'shipped'
      ? 'bg-sky-50/30 border-sky-300 shadow-2xs hover:border-sky-400'
      : displayStatus === 'prepare'
      ? 'bg-amber-50/25 border-amber-300 shadow-2xs hover:border-amber-400'
      : displayStatus === 'not_yet'
      ? 'bg-slate-50/60 border-slate-300 shadow-2xs hover:border-slate-400'
      : displayStatus === 'delivered'
      ? 'bg-emerald-50/25 border-emerald-300 shadow-2xs'
      : displayStatus === 'maintenance' || displayStatus === 'inactive'
      ? 'bg-slate-50 border-slate-200/80 opacity-80'
      : 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300';

  const weightBadgeColor = !activeTrip || tripWeightKg === 0
    ? 'bg-slate-100 text-slate-500 border-slate-200'
    : isOverweight
    ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
    : rawWeightPct > 85
    ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-emerald-50 text-emerald-800 border-emerald-200';

  const primaryVehicleName = resolveVehicleDisplayName(veh, isAr ? 'شاحنة' : 'Truck');
  const tripCommentDocId =
    activeTrip && activeTrip.loadingOrderNumber && activeTrip.loadingOrderNumber !== 'unnumbered'
      ? buildTripCommentDocId(activeTrip.loadingDate || targetPlanningDate, activeTrip.loadingOrderNumber)
      : '';

  return (
    <div
      data-comment-doc={tripCommentDocId || undefined}
      className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between ${cardSurfaceClasses}`}
    >
      {/* 1. COMPACT TOP HEADER ROW */}
      <div className="px-2.5 pt-2.5 pb-1.5 flex items-center justify-between gap-1.5 border-b border-slate-100/90">
        <div className="flex items-center gap-1.5 min-w-0">
          <FleetRichTooltip
            widthClass="w-52"
            content={
              <div className="space-y-1 text-[10px]">
                <div className="font-black text-slate-900 border-b border-slate-100 pb-1">
                  {primaryVehicleName}
                </div>
                {veh.code && (
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'الكود:' : 'Code:'}</span>
                    <span className="font-mono font-bold text-slate-800">{veh.code}</span>
                  </div>
                )}
                {veh.plateNumber && (
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'رقم اللوحة:' : 'Plate #:'}</span>
                    <span className="font-mono font-bold text-slate-800">{veh.plateNumber}</span>
                  </div>
                )}
                {maxCap > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'السعة القصوى:' : 'Max Cap:'}</span>
                    <span className="font-mono font-bold text-slate-800">
                      {(maxCap / 1000).toFixed(1)} {isAr ? 'طن' : 'Ton'}
                    </span>
                  </div>
                )}
              </div>
            }
          >
            <span className="text-xs font-black text-slate-900 hover:text-indigo-700 cursor-help truncate">
              {primaryVehicleName}
            </span>
          </FleetRichTooltip>

          {veh.plateNumber && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[9px] font-bold shrink-0">
              <span>{veh.plateNumber}</span>
              <CopyButton text={veh.plateNumber} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} />
            </span>
          )}
        </div>

        {/* Status Pill / Prior Trip Indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {priorOpenOrders.length > 0 && (
            <FleetRichTooltip
              widthClass="w-56"
              content={
                <div className="space-y-1 text-[10px]">
                  <div className="font-black text-rose-700 flex items-center gap-1 border-b border-rose-100 pb-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{isAr ? 'رحلة سابقة غير مكتملة' : 'Uncompleted Prior Trip'}</span>
                  </div>
                  <p className="text-slate-600 leading-snug">
                    {isAr
                      ? `يوجد ${priorOpenOrders.length} طلبات مفتوحة بتاريخ سابق (${Array.from(new Set(priorOpenOrders.map((o) => o.loadingDate || '—'))).join(', ')}).`
                      : `${priorOpenOrders.length} open order(s) from prior date (${Array.from(new Set(priorOpenOrders.map((o) => o.loadingDate || '—'))).join(', ')}).`}
                  </p>
                </div>
              }
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-rose-100 text-rose-700 border border-rose-300 animate-pulse cursor-help">
                <Clock className="w-3 h-3" />
              </span>
            </FleetRichTooltip>
          )}

          {displayStatus === 'conflict' ? (
            <button
              type="button"
              onClick={() => activeTrip && onFilterConflict(activeTrip.loadingOrderNumber, veh)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 shadow-2xs animate-pulse cursor-pointer"
              title={isAr ? 'تعارض: انقر لتصفية الطلبات وإصلاحه يدوياً' : 'Conflict: Click to filter orders & resolve manually'}
            >
              <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
              <span>{isAr ? 'تعارض' : 'Conflict'}</span>
            </button>
          ) : displayStatus === 'shipped' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-sky-100 text-sky-950 border border-sky-300">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping"></span>
              <span>{isAr ? 'جاري التوصيل' : 'Out for Delivery'}</span>
            </span>
          ) : displayStatus === 'prepare' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-100 text-amber-950 border border-amber-300">
              <PackageCheck className="w-2.5 h-2.5 text-amber-600 shrink-0" />
              <span>{isAr ? 'جاري التجهيز' : 'Preparing'}</span>
            </span>
          ) : displayStatus === 'not_yet' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-slate-100 text-slate-800 border border-slate-300">
              <Clock className="w-2.5 h-2.5 text-slate-600 shrink-0" />
              <span>{isAr ? 'قيد الانتظار' : 'Pending'}</span>
            </span>
          ) : displayStatus === 'delivered' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
              <span>{isAr ? 'تم التسليم' : 'Delivered'}</span>
            </span>
          ) : displayStatus === 'maintenance' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
              <Wrench className="w-2.5 h-2.5 text-purple-600 shrink-0" />
              <span>{isAr ? 'صيانة' : 'Maint'}</span>
            </span>
          ) : displayStatus === 'inactive' ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-200 text-slate-700">
              {isAr ? 'متوقفة' : 'Inactive'}
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {isAr ? 'متاحة' : 'Available'}
            </span>
          )}
        </div>
      </div>

      {/* 2. COMPACT ANIMATED TRIP DATA BODY (Icon Tooltips Strip + Sequential Stepper) */}
      <div
        key={`${veh.id}-body-${activeTripIndex}-${slideDir}`}
        className={`px-2.5 py-2 space-y-2 ${
          trips.length > 0 ? (slideDir === 'prev' ? 'animate-trip-slide-prev' : 'animate-trip-slide-next') : ''
        }`}
      >
        {/* Icon Metadata Strip with Rich Hover Tooltips */}
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Weight Icon + Color-Coded Tooltip */}
            <FleetRichTooltip
              widthClass="w-56"
              content={
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <span className="font-black text-slate-900 flex items-center gap-1">
                      <Weight className="w-3 h-3 text-indigo-600" />
                      <span>{isAr ? 'تفاصيل الحمولة والوزن' : 'Weight & Capacity'}</span>
                    </span>
                    {maxCap > 0 && (
                      <span className={`font-mono font-black ${isOverweight ? 'text-rose-600' : rawWeightPct > 85 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {rawWeightPct}%
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'الوزن المحمل:' : 'Loaded:'}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {(tripWeightKg / 1000).toFixed(2)} {isAr ? 'طن' : 'Ton'} ({tripWeightKg.toLocaleString()} {isAr ? 'كجم' : 'kg'})
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'الحد الأقصى:' : 'Max Cap:'}</span>
                    <span className="font-mono font-bold text-slate-800">
                      {maxCap > 0 ? `${(maxCap / 1000).toFixed(1)} ${isAr ? 'طن' : 'Ton'}` : (isAr ? 'غير محدد' : 'Uncapped')}
                    </span>
                  </div>
                  {maxCap > 0 && (
                    <>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${isOverweight ? 'bg-rose-500' : rawWeightPct > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${weightPct}%` }}
                        />
                      </div>
                      <div className={`text-[9px] font-bold ${isOverweight ? 'text-rose-600' : 'text-slate-500'}`}>
                        {isOverweight
                          ? (isAr ? `حمولة زائدة بمقدار ${((tripWeightKg - maxCap) / 1000).toFixed(2)} طن!` : `Overweight by ${((tripWeightKg - maxCap) / 1000).toFixed(2)} Ton!`)
                          : (isAr ? `متبقي ${( (maxCap - tripWeightKg) / 1000).toFixed(2)} طن متاح` : `${((maxCap - tripWeightKg) / 1000).toFixed(2)} Ton available`)}
                      </div>
                    </>
                  )}
                </div>
              }
            >
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-mono font-black cursor-help transition ${weightBadgeColor}`}>
                <Weight className="w-3 h-3 shrink-0" />
                <span>{(tripWeightKg / 1000).toFixed(1)}{isAr ? 'ط' : 'T'}</span>
              </span>
            </FleetRichTooltip>

            {/* Cartons Icon + Rich Tooltip */}
            <FleetRichTooltip
              widthClass="w-48"
              content={
                <div className="space-y-1 text-[10px]">
                  <div className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center gap-1">
                    <Boxes className="w-3 h-3 text-amber-600" />
                    <span>{isAr ? 'ملخص الكراتين' : 'Cartons Summary'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'الكراتين:' : 'Cartons:'}</span>
                    <span className="font-mono font-bold text-slate-900">{tripCartons.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}</span>
                  </div>
                  {tripBonus > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>{isAr ? 'بونص إضافي:' : 'Bonus:'}</span>
                      <span className="font-mono">+{tripBonus.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              }
            >
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-[10px] font-mono font-bold cursor-help">
                <Boxes className="w-3 h-3 text-amber-600 shrink-0" />
                <span>{tripCartons.toLocaleString()}</span>
              </span>
            </FleetRichTooltip>

            {/* Orders & Clients Icon + Rich Tooltip */}
            <FleetRichTooltip
              widthClass="w-64"
              content={
                <div className="space-y-1.5 text-[10px]">
                  <div className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-indigo-600" />
                      <span>{isAr ? 'الطلبات المحملة بالرحلة' : 'Loaded Orders on Trip'}</span>
                    </span>
                    <span className="font-mono text-indigo-700">{tripOrders.length}</span>
                  </div>
                  {tripOrders.length === 0 ? (
                    <div className="text-slate-400 italic">{isAr ? 'لا توجد طلبات مسكنة' : 'No assigned orders'}</div>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {tripOrders.map((ord) => {
                        const oSerial = resolveOrderSerial(ord, allOrders);
                        const normSt = normalizeFulfillmentStatus(ord.fulfillmentStatus);
                        const stCfg = FULFILLMENT_CONFIG_MAP[normSt] || FULFILLMENT_CONFIG_MAP.not_yet;
                        return (
                          <div key={ord.id} className="flex items-center justify-between gap-1.5 p-1 rounded-lg bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="font-mono font-black text-indigo-700 shrink-0">#{oSerial}</span>
                              <span className="font-bold text-slate-800 truncate">{ord.clientName || '—'}</span>
                            </div>
                            <span className={`px-1 py-0.2 rounded text-[8px] font-bold border shrink-0 ${stCfg.badgeClasses}`}>
                              {isAr ? stCfg.labelAr : stCfg.labelEn}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              }
            >
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-[10px] font-mono font-bold cursor-help">
                <FileText className="w-3 h-3 text-indigo-600 shrink-0" />
                <span>{tripOrders.length}</span>
              </span>
            </FleetRichTooltip>

            {/* Crew Icon + Rich Tooltip */}
            <FleetRichTooltip
              widthClass="w-52"
              content={
                <div className="space-y-1 text-[10px]">
                  <div className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center gap-1">
                    <User className="w-3 h-3 text-blue-600" />
                    <span>{isAr ? 'طاقم الرحلة' : 'Trip Crew'}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-slate-600">
                    <span>{isAr ? 'السائق:' : 'Driver:'}</span>
                    <span className="font-bold text-slate-900 truncate">
                      {activeTrip?.driverName || veh.driverName || (isAr ? 'غير مخصص' : 'Unassigned')}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-slate-600">
                    <span>{isAr ? 'المندوب:' : 'Rep:'}</span>
                    <span className="font-bold text-slate-800 truncate">
                      {activeTrip?.repName || '—'}
                    </span>
                  </div>
                </div>
              }
            >
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-bold cursor-help max-w-[80px] ${
                activeTrip?.driverName || veh.driverName
                  ? 'border-blue-200 bg-blue-50/70 text-blue-900'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}>
                <User className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {(activeTrip?.driverName || veh.driverName || '—').split(' ')[0]}
                </span>
              </span>
            </FleetRichTooltip>

            {/* Quick Optional Delivery Sequence Button (only when saved trip has > 1 distinct client) */}
            {activeTrip && onOpenSequenceModal && (() => {
              const { stops: cardStops, hasManualSequence: cardHasSeq } = getTripClientStops(tripOrders);
              if (cardStops.length <= 1) return null;
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSequenceModal(veh, activeTrip);
                  }}
                  title={
                    isAr
                      ? (cardHasSeq ? 'تعديل أولوية التسليم للعملاء في هذه الرحلة' : 'تحديد أولوية التسليم للعملاء (اختياري)')
                      : (cardHasSeq ? 'Edit client delivery sequence for this trip' : 'Set client delivery sequence (optional)')
                  }
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[10px] font-black transition cursor-pointer ${
                    cardHasSeq
                      ? 'border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <ListOrdered className="w-3 h-3 shrink-0" />
                  <span>{isAr ? (cardHasSeq ? 'أولوية ✓' : 'أولوية') : (cardHasSeq ? 'Seq ✓' : 'Seq')}</span>
                </button>
              );
            })()}

            {/* Trip Collaborative Comment Button (Synced Bidirectionally with Floating Manifest Dock) */}
            {tripCommentDocId && (
              <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                <RowCommentButton
                  docId={tripCommentDocId}
                  docNumber={isAr ? `رحلة #${activeTrip.loadingOrderNumber}` : `Trip #${activeTrip.loadingOrderNumber}`}
                  tab="loading_plan"
                  module="sales"
                />
              </span>
            )}
          </div>

          {/* Clickable Conflict Alert Icon (triggers manual Trip# filter when trip or vehicle has conflict) */}
          {(activeTrip?.hasStatusConflict || conflicts.length > 0) && (
            <FleetRichTooltip
              widthClass="w-60"
              enableTap={false}
              content={
                <div className="space-y-1 text-[10px]">
                  <div className="font-black text-rose-700 border-b border-rose-100 pb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{isAr ? 'تعارضات مكتشفة' : 'Detected Conflicts'}</span>
                  </div>
                  {activeTrip?.hasStatusConflict && (
                    <div className="text-rose-900 font-semibold leading-snug">
                      • {isAr
                        ? `رحلة #${activeTrip.loadingOrderNumber} تحتوي على أكثر من حالة تنفيذ — انقر لتصفية الطلبات وإصلاحها يدوياً.`
                        : `Trip #${activeTrip.loadingOrderNumber} has mixed statuses — click to filter orders & fix manually.`}
                    </div>
                  )}
                  {conflicts.map((c, i) => (
                    <div key={i} className="text-slate-700 leading-snug">
                      • {isAr ? c.messageAr : c.messageEn}
                    </div>
                  ))}
                </div>
              }
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const targetLo = activeTrip?.loadingOrderNumber || priorOpenOrders[0]?.loadingOrderNumber;
                  if (targetLo) onFilterConflict(targetLo, veh);
                }}
                className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 shadow-2xs transition cursor-pointer animate-pulse"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </button>
            </FleetRichTooltip>
          )}
        </div>

        {/* Synced Docs & Fast Navigation Row (Dispatch # & Return # / Discrepancy Jump) */}
        {activeTrip && activeTrip.tripId && onNavigateToTruckDispatch && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToTruckDispatch(activeTrip.tripId, { openReturn: false });
              }}
              title={isAr ? 'فتح بطاقة الرحلة في تبويب صرف الشاحنات' : 'Open Trip Card in Truck Dispatch'}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-[9.5px] font-black transition cursor-pointer ${
                activeTrip.dispatchDocNumber
                  ? 'bg-teal-50 hover:bg-teal-100 text-teal-900 border-teal-300'
                  : activeTrip.isWarehouseConfirmed
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <FileText className="w-2.5 h-2.5 shrink-0" />
              <span>
                {activeTrip.dispatchDocNumber
                  ? activeTrip.dispatchDocNumber
                  : activeTrip.isWarehouseConfirmed
                  ? (isAr ? 'محمل ✓' : 'Loaded ✓')
                  : (isAr ? 'صرف' : 'Dispatch')}
              </span>
              <ExternalLink className="w-2 h-2 opacity-70 shrink-0" />
            </button>

            {(displayStatus === 'shipped' ||
              displayStatus === 'delivered' ||
              activeTrip.returnHandshakeStatus !== 'none' ||
              Boolean(activeTrip.returnDocNumber)) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToTruckDispatch(activeTrip.tripId, { openReturn: true });
                }}
                title={
                  hasReturnDiscrepancy
                    ? (isAr ? 'تنبيه: يوجد فرق مرتجعات — انقر للمراجعة الفورية' : 'Return discrepancy detected — click to review')
                    : (isAr ? 'إصدار أو عرض إذن استلام المرتجع' : 'Issue / view Return Document')
                }
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-[9.5px] font-black transition cursor-pointer ${
                  hasReturnDiscrepancy
                    ? 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-400 animate-pulse'
                    : activeTrip.returnHandshakeStatus === 'reconciled'
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    : activeTrip.returnHandshakeStatus === 'pending_accounting_confirm'
                    ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300 animate-pulse'
                    : activeTrip.returnHandshakeStatus === 'pending_wh_confirm'
                    ? 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-300 animate-pulse'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                {hasReturnDiscrepancy ? (
                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                ) : (
                  <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                )}
                <span>
                  {hasReturnDiscrepancy
                    ? (isAr
                        ? `فرق مرتجع${activeTrip.returnDocNumber ? ` ${activeTrip.returnDocNumber}` : ''}`
                        : `Variance${activeTrip.returnDocNumber ? ` ${activeTrip.returnDocNumber}` : ''}`)
                    : activeTrip.returnDocNumber
                    ? `${activeTrip.returnDocNumber}${activeTrip.returnHandshakeStatus === 'reconciled' ? ' ✓' : ''}`
                    : activeTrip.returnHandshakeStatus === 'reconciled'
                    ? (isAr ? 'مرتجع ✓' : 'Ret ✓')
                    : activeTrip.returnHandshakeStatus === 'pending_accounting_confirm'
                    ? (isAr ? 'مراجعة محاسبية' : 'Acct Align')
                    : activeTrip.returnHandshakeStatus === 'pending_wh_confirm'
                    ? (isAr ? 'تأكيد مرتجع' : 'Confirm Ret')
                    : (isAr ? 'إذن مرتجع' : 'Return')}
                </span>
                <ExternalLink className="w-2 h-2 opacity-70 shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* Sequential Stepper Row (Bwd & Fwd for Middle Statuses, or Clickable Conflict Bar) */}
        {!activeTrip ? (
          <div className="text-center py-0.5 text-[10px] text-slate-400 font-medium">
            {operationalStatus === 'maintenance'
              ? (isAr ? 'الشاحنة غير متاحة (صيانة)' : 'Unavailable (Maintenance)')
              : operationalStatus === 'inactive'
              ? (isAr ? 'الشاحنة متوقفة' : 'Vehicle inactive')
              : (isAr ? 'لا توجد رحلات مجدولة لهذا اليوم' : 'No trips scheduled for today')}
          </div>
        ) : activeTrip.hasStatusConflict ? (
          <button
            type="button"
            onClick={() => onFilterConflict(activeTrip.loadingOrderNumber, veh)}
            className="w-full py-1 px-2 rounded-xl bg-rose-100/90 hover:bg-rose-200/90 text-rose-900 border border-rose-300 text-[10px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0 animate-pulse" />
            <span className="truncate">
              {isAr
                ? `تعارض حالات رحلة #${activeTrip.loadingOrderNumber} — انقر للإصلاح يدوياً`
                : `Trip #${activeTrip.loadingOrderNumber} Conflict — Click to Fix`}
            </span>
          </button>
        ) : (
          <div className="flex items-center justify-between gap-1 w-full">
            {/* Backward Step Button */}
            {precedingStep ? (
              <button
                type="button"
                onClick={() => onOpenTransitionModal(veh, precedingStep, activeTrip)}
                className="flex-1 min-w-0 px-1.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[9px] font-bold transition flex items-center justify-center gap-0.5 cursor-pointer shadow-2xs"
                title={isAr ? `تراجع إلى: ${precedingStep.labelAr}` : `Revert to: ${precedingStep.labelEn}`}
              >
                {isAr ? <ArrowRight className="w-2.5 h-2.5 text-slate-500 shrink-0" /> : <ArrowLeft className="w-2.5 h-2.5 text-slate-500 shrink-0" />}
                <span className="truncate">{isAr ? precedingStep.labelAr : precedingStep.labelEn}</span>
              </button>
            ) : (
              <div className="flex-1"></div>
            )}

            {/* Current Active Step Pill */}
            <div
              className={`px-2 py-1 rounded-lg text-[9px] font-black border flex items-center gap-1 shadow-2xs shrink-0 ${
                FULFILLMENT_CONFIG_MAP[activeTrip.currentStep?.id]?.badgeClasses || 'bg-slate-100 text-slate-800 border-slate-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>
              <span>{isAr ? activeTrip.currentStep?.labelAr : activeTrip.currentStep?.labelEn}</span>
            </div>

            {/* Forward Step Button */}
            {nextStep ? (
              <button
                type="button"
                onClick={() => onOpenTransitionModal(veh, nextStep, activeTrip)}
                className="flex-1 min-w-0 px-1.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] font-black transition flex items-center justify-center gap-0.5 cursor-pointer shadow-2xs"
                title={isAr ? `تقديم إلى: ${nextStep.labelAr}` : `Advance to: ${nextStep.labelEn}`}
              >
                <span className="truncate">{isAr ? nextStep.labelAr : nextStep.labelEn}</span>
                {isAr ? <ArrowLeft className="w-2.5 h-2.5 text-white shrink-0" /> : <ArrowRight className="w-2.5 h-2.5 text-white shrink-0" />}
              </button>
            ) : (
              <div className="flex-1"></div>
            )}
          </div>
        )}
      </div>

      {/* 3. BOTTOM ROADWAY TRIP CAROUSEL BANNER */}
      <TripRoadwayCarousel
        trips={trips}
        activeIndex={activeTripIndex}
        slideDir={slideDir}
        onSelectTrip={(idx, dir) => onSelectTrip(veh.id, idx, dir)}
        vehicle={veh}
        operationalStatus={operationalStatus}
        priorOpenOrders={priorOpenOrders}
        onFilterConflict={onFilterConflict}
        isAr={isAr}
      />
    </div>
  );
}

// Enlarged 2-line Cartons + Sequential Trip Availability Chip
function OrderCartonsAvailabilityChip({ order, availability, onClick, isAr = true }) {
  const cartons = Number(order?.totalCartons || order?.totalQty || 0);
  const bonus = Number(order?.totalBonus || 0);
  const mode = availability?.mode;
  const tier = availability?.tier;
  const pct = Number(availability?.pct ?? 0);

  let chipCls = 'bg-amber-50 hover:bg-amber-100/80 border-amber-200 text-slate-900';
  let iconCls = 'text-amber-600';
  let subLabel = null;
  let subCls = 'text-slate-500';

  if (mode === 'open') {
    if (tier === 'green') {
      chipCls = 'bg-emerald-50 hover:bg-emerald-100/90 border-emerald-300 text-emerald-950';
      iconCls = 'text-emerald-600';
      subLabel = isAr ? '✓ متوفر بالكامل' : '✓ ALL Available';
      subCls = 'text-emerald-700';
    } else if (tier === 'amber') {
      chipCls = 'bg-amber-50 hover:bg-amber-100/90 border-amber-300 text-amber-950';
      iconCls = 'text-amber-600';
      subLabel = isAr ? `متوفر ${pct}%` : `${pct}% Available`;
      subCls = 'text-amber-700';
    } else {
      chipCls = 'bg-rose-50 hover:bg-rose-100/90 border-rose-300 text-rose-950';
      iconCls = 'text-rose-600';
      subLabel = isAr ? `متوفر ${pct}%` : `${pct}% Available`;
      subCls = 'text-rose-700';
    }
  } else if (mode === 'dispatched') {
    const isDel = availability?.fulfillmentStatus === 'delivered' || availability?.fulfillmentStatus === 'paid';
    chipCls = 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800';
    iconCls = 'text-slate-500';
    subLabel = isDel ? (isAr ? 'تم التسليم' : 'Delivered') : (isAr ? 'تم الشحن' : 'Dispatched');
    subCls = 'text-slate-500';
  } else if (mode === 'return') {
    chipCls = 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-900';
    iconCls = 'text-sky-600';
    subLabel = isAr ? 'مرتجع وارد' : 'Incoming Return';
    subCls = 'text-sky-700';
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`px-3 py-1.5 rounded-xl border transition cursor-pointer group/ctn shadow-2xs flex flex-col items-start text-start min-w-[110px] ${chipCls}`}
      title={isAr ? 'انقر لعرض تفاصيل الأصناف والتوفر لكل صنف' : 'Click to view item breakdown & per-SKU stock availability'}
    >
      <div className="font-mono font-black text-xs inline-flex items-center gap-1.5 leading-tight">
        <Boxes className={`w-3.5 h-3.5 group-hover/ctn:scale-110 transition-transform shrink-0 ${iconCls}`} />
        <span>{cartons.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}</span>
        {bonus > 0 && (
          <span className="text-emerald-700 text-[10px] font-bold">+{bonus}</span>
        )}
      </div>
      {subLabel && (
        <span className={`text-[10px] font-extrabold font-sans leading-tight mt-0.5 ${subCls}`}>
          {subLabel}
        </span>
      )}
    </button>
  );
}

// Non-Intrusive Order Products & Prices Breakdown Modal
function OrderProductsDetailsModal({ isOpen, onClose, order, availability = null, clients = [], segments = [], products = [], isAr = true }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !order) return null;

  const clientObj = clients.find((c) => c.id === order.clientId) || null;
  const rawSegKey = clientObj?.segmentId || clientObj?.segment || order?.clientSegmentId || order?.segmentId || order?.segment || null;
  const segObj = rawSegKey
    ? (segments.find((s) => s.id === rawSegKey || s.nameAr === rawSegKey || s.nameEn === rawSegKey || s.code === rawSegKey))
    : null;
  const segColor = segObj?.color || '#2563eb';
  const SegIcon = (segObj?.icon && SEGMENT_ICON_MAP[segObj.icon]) ? SEGMENT_ICON_MAP[segObj.icon] : Building2;

  const lines = Array.isArray(order.lines) ? order.lines : [];
  const totalCartons = Number(order.totalCartons || order.totalQty) || 0;
  const totalBonus = Number(order.totalBonus) || 0;
  const totalWeightKg = Number(order.totalWeightKg) || 0;
  const grandTotal = Number(order.grandTotal) || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-start animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-900 border border-amber-300 shadow-2xs shrink-0">
              <Boxes className="w-5 h-5 text-amber-700" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-black text-slate-900">
                  #{order.serial || String(order.id || '').replace(/^SO-/, '')}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-black shadow-2xs max-w-[220px] truncate"
                  style={{
                    backgroundColor: segColor,
                    color: getContrastTextColor(segColor)
                  }}
                >
                  <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 bg-white/95 shadow-2xs overflow-hidden">
                    {clientObj?.logo ? (
                      <img src={clientObj.logo} alt="" className="w-full h-full object-contain p-0.2 rounded" />
                    ) : (
                      <SegIcon className="w-2.5 h-2.5" style={{ color: segColor }} />
                    )}
                  </span>
                  <span className="truncate">{order.clientName || '—'}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5 flex-wrap">
                {order.invoiceDate && (
                  <span>{isAr ? 'تاريخ الفاتورة:' : 'Invoice Date:'} <strong className="font-mono text-slate-700">{order.invoiceDate}</strong></span>
                )}
                {order.loadingDate && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>{isAr ? 'التحميل:' : 'Loading:'} <strong className="font-mono text-slate-700">{order.loadingDate}</strong></span>
                  </>
                )}
                {order.poTawoos && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans">{isAr ? 'طاووس:' : 'TW:'}</span>
                      <strong className="text-slate-800">{order.poTawoos}</strong>
                      <CopyButton text={order.poTawoos} title={isAr ? 'نسخ أمر شراء طاووس' : 'Copy Tawoos PO #'} isAr={isAr} />
                    </span>
                  </>
                )}
                {order.poPrivateLabel && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center gap-1 font-mono text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-400 font-sans">{isAr ? 'علامة:' : 'PL:'}</span>
                      <strong className="text-purple-900">{order.poPrivateLabel}</strong>
                      <CopyButton text={order.poPrivateLabel} title={isAr ? 'نسخ أمر شراء العلامة' : 'Copy Private Label PO #'} isAr={isAr} />
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer shrink-0"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Stats Strip */}
        <div className="px-5 py-2.5 bg-amber-50/50 border-b border-amber-200/60 grid grid-cols-3 gap-2 text-center text-xs shrink-0">
          <div className="bg-white p-2 rounded-xl border border-amber-100 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-bold block">{isAr ? 'إجمالي الكراتين:' : 'Total Cartons:'}</span>
            <span className="font-mono font-black text-slate-800 text-sm">
              {totalCartons.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
              {totalBonus > 0 && (
                <span className="text-emerald-700 text-xs font-black ms-1">+{totalBonus} {isAr ? 'بونص' : 'bonus'}</span>
              )}
            </span>
          </div>

          <div className="bg-white p-2 rounded-xl border border-amber-100 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-bold block">{isAr ? 'إجمالي الوزن:' : 'Total Weight:'}</span>
            <span className="font-mono font-black text-emerald-700 text-sm">
              {(totalWeightKg / 1000).toFixed(2)} {isAr ? 'طن' : 'Ton'}
              <span className="text-[10px] text-slate-400 font-normal ms-1">({totalWeightKg.toLocaleString()} {isAr ? 'كجم' : 'kg'})</span>
            </span>
          </div>

          <div className="bg-white p-2 rounded-xl border border-amber-100 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-bold block">{isAr ? 'القيمة الإجمالية:' : 'Grand Total:'}</span>
            <span className="font-mono font-black text-indigo-700 text-sm">
              {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] font-normal">EGP</span>
            </span>
          </div>
        </div>

        {/* Products Table Content */}
        <div className="p-4 overflow-y-auto flex-1 text-xs space-y-3">
          {availability?.mode === 'open' && (
            <div
              className={`px-3.5 py-2 rounded-2xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                availability.tier === 'green'
                  ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                  : availability.tier === 'amber'
                  ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                  : 'bg-rose-50/90 border-rose-200 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-2 font-extrabold">
                <Boxes className="w-4 h-4 shrink-0" />
                <span>
                  {availability.tier === 'green'
                    ? (isAr ? 'كامل الكميات متاحة لهذا الطلب حسب تسلسل التوفر والرحلات' : 'All items available for this order in sequential trip priority')
                    : (isAr
                        ? `التوفر المخصص: ${availability.totalAvailableCartons} / ${availability.totalRequiredCartons} كرتونة (${availability.pct}%)`
                        : `Allocated Stock: ${availability.totalAvailableCartons} / ${availability.totalRequiredCartons} ctn (${availability.pct}%)`)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
                {availability.tripNum ? (
                  <span className="px-2 py-0.5 rounded-lg bg-white/80 border border-current/20">
                    {isAr ? `أولوية رحلة #${availability.tripNum}` : `Trip #${availability.tripNum} Priority`}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-lg bg-white/80 border border-current/20">
                    {isAr ? 'غير مسكن على رحلة' : 'Unassigned Trip'}
                  </span>
                )}
              </div>
            </div>
          )}

          {order.hasPartialRejection && (
            <div className="p-3 bg-rose-50/90 border border-rose-200 rounded-2xl space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-rose-900 flex items-center gap-1.5">
                  <PackageMinus className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    {isAr
                      ? 'تمت مزامنة مرتجع جزئي من العميل — القيم أدناه تعكس المستلم فعلياً'
                      : 'Post-Dispatch Partial Client Rejection Synced — Live quantities reflect Actual Received'}
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-rose-800 font-black">
                    {isAr
                      ? `مرتجع للمخزن: -${Number(order.returnedCartons || 0)} كرتونة (${Number(order.returnedWeightKg || 0).toFixed(1)} كجم)`
                      : `Returned: -${Number(order.returnedCartons || 0)} ctn (${Number(order.returnedWeightKg || 0).toFixed(1)} kg)`}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-rose-600 text-white font-black">
                    {isAr ? `تسوية: -${Number(order.returnedAmount || 0).toFixed(2)} ج.م` : `Credit: -${Number(order.returnedAmount || 0).toFixed(2)} EGP`}
                  </span>
                </div>
              </div>
              {order.rejectionReason && (
                <div className="text-[11px] text-rose-900 bg-white/80 px-2.5 py-1 rounded-lg border border-rose-200/70">
                  <strong>{isAr ? 'سبب الرفض: ' : 'Rejection Reason: '}</strong>
                  {order.rejectionReason}
                </div>
              )}
            </div>
          )}

          {lines.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold">{isAr ? 'لا توجد أصناف مسجلة في هذا الطلب' : 'No items recorded in this order'}</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              {(() => {
                const showReconCols = Boolean(order.hasPartialRejection || order.retailSettlementStatus === 'settled');
                return (
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                    <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                    {showReconCols && (
                      <th className="py-2.5 px-2.5 text-center text-slate-500">{isAr ? 'المحمل / المنصرف' : 'Loaded / Disp'}</th>
                    )}
                    <th className="py-2.5 px-3 text-center">
                      {isAr
                        ? (order.retailSettlementStatus === 'settled' ? 'المباع الفعلي' : order.hasPartialRejection ? 'المستلم فعلياً' : 'الكمية')
                        : (order.retailSettlementStatus === 'settled' ? 'Actual Sold' : order.hasPartialRejection ? 'Actual Recv' : 'Qty')}
                    </th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'البونص' : 'Bonus'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'التوفر' : 'Availability'}</th>
                    {showReconCols && (
                      <th className="py-2.5 px-2.5 text-center text-rose-700">{isAr ? 'مرتجع' : 'Returned'}</th>
                    )}
                    <th className="py-2.5 px-3 text-end">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'الوزن' : 'Weight'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'الإجمالي (EGP)' : 'Total (EGP)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {lines.map((l, idx) => {
                    const lineQty = Number(l.qty) || 0;
                    const lineBonus = Number(l.bonus) || 0;
                    const dispCtn = Number(l.dispatchedQty ?? lineQty) + Number(l.dispatchedBonus ?? lineBonus);
                    const retCtn = Number(l.returnedCartons ?? Math.max(0, dispCtn - (lineQty + lineBonus)));
                    const linePrice = Number(l.detectedUnitPrice || l.unitPrice || l.price) || 0;
                    const lineTotal = Number(l.lineTotal || (lineQty * linePrice)) || 0;
                    const matchedProd = products.find((p) => p.id === (l.productId || l.id) || (l.itemCode && p.itemCode === l.itemCode) || (l.productCode && (p.itemCode === l.productCode || p.code === l.productCode)));
                    const unitWeight = Number(l.largeUnitWeightKg || matchedProd?.largeUnitWeightKg || matchedProd?.grossWeightKg || matchedProd?.weightKg || l.unitWeightKg || l.weightPerCarton || 0);
                    const lineWeight = Number(l.lineWeightKg || l.totalWeightKg || l.weightKg) || ((lineQty + lineBonus) * unitWeight);
                    const prodName = isAr ? (l.productNameAr || l.productNameEn || l.productName || l.productId) : (l.productNameEn || l.productNameAr || l.productName || l.productId);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-2 px-3 text-start">
                          <div className="font-sans font-extrabold text-slate-800 text-xs">
                            {prodName}
                          </div>
                          {l.productCode && (
                            <span className="text-[10px] text-slate-400 font-mono font-semibold block">
                              [{l.productCode}]
                            </span>
                          )}
                        </td>
                        {showReconCols && (
                          <td className="py-2 px-2.5 text-center text-slate-500">
                            {dispCtn.toLocaleString()} {isAr ? 'ك' : 'ctn'}
                          </td>
                        )}
                        <td className="py-2 px-3 text-center font-bold text-slate-900">
                          {lineQty.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {lineBonus > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800">
                              +{lineBonus}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {(() => {
                            const lineAvail = availability?.lineStatuses?.[idx];
                            if (!lineAvail) return <span className="text-slate-300">—</span>;
                            if (lineAvail.mode === 'dispatched') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-sans font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  {isAr ? 'تم الصرف' : 'Dispatched'}
                                </span>
                              );
                            }
                            if (lineAvail.mode === 'return') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-sans font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                  {isAr ? 'مرتجع' : 'Return'}
                                </span>
                              );
                            }
                            const chipColor =
                              lineAvail.tier === 'green'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : lineAvail.tier === 'amber'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200';
                            return (
                              <span
                                className={`inline-flex flex-col items-center px-2 py-0.5 rounded-lg border text-[10px] font-extrabold leading-tight ${chipColor}`}
                              >
                                <span className="font-mono">
                                  {lineAvail.tier === 'green'
                                    ? (isAr ? `✓ متوفر (${lineAvail.availableCartons})` : `✓ ALL (${lineAvail.availableCartons})`)
                                    : `${lineAvail.availableCartons} / ${lineAvail.requiredCartons} (${lineAvail.pct}%)`}
                                </span>
                                {lineAvail.optionSuffix && (
                                  <span className="text-[8px] font-mono opacity-75">
                                    [{lineAvail.optionSuffix === 'ANY' ? (isAr ? 'أي تعبئة' : 'ANY') : lineAvail.optionSuffix}]
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                        </td>
                        {showReconCols && (
                          <td className="py-2 px-2.5 text-center font-black text-rose-700">
                            {retCtn > 0 ? `-${retCtn}` : '0'}
                          </td>
                        )}
                        <td className="py-2 px-3 text-end font-semibold text-slate-700">
                          {linePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-end text-slate-600 font-mono font-bold">
                          {lineWeight > 0 ? `${lineWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${isAr ? 'كجم' : 'kg'}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-end font-black text-slate-900">
                          {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SalesLoadingPlanMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin' || currentUser?.role === 'admin';
  const canManageLoadingPlan = canAccessAction(
    permissions,
    'loading_plan',
    'canManageLoadingPlan',
    currentUser
  );
  const canModifyClosedOrders = isGeneralAdmin || Boolean(currentUser?.permissions?.canModifyClosedOrders) || canAccessAction(
    permissions,
    'loading_plan',
    'canModifyClosedOrders',
    currentUser
  );
  const canSettleRetailOrders = isGeneralAdmin || canAccessAction(
    permissions,
    'sales_orders',
    'canSettleRetailOrders',
    currentUser
  );

  const currentUserName = currentUser?.nameAr || currentUser?.name || 'مستخدم معتمد';
  const currentUserId = currentUser?.id || 'usr_unknown';

  // Cloud Collections State
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [segments, setSegments] = useState([]);
  const [stagedPallets, setStagedPallets] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [faultyReturns, setFaultyReturns] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [truckDispatches, setTruckDispatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Target Planning Date (Anchor Date for Assignments & Sequence Validation)
  const [targetPlanningDate, setTargetPlanningDate] = useState(() => formatDateKey(new Date()));

  // 2. Date Scope: 'all_pending' | 'today' | 'tomorrow' | 'week' | 'custom'
  const [dateScope, setDateScope] = useState('all_pending');
  const [customDate, setCustomDate] = useState(() => formatDateKey(new Date()));

  // 3. Single Active Editing Card
  const [activeEditingOrderId, setActiveEditingOrderId] = useState(null);

  // Date Mismatch Prompt Modal State: { order, existingDate, targetDate, isSavingCheck }
  const [dateMismatchModal, setDateMismatchModal] = useState(null);

  // Filters & Controls
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmedOnly, setConfirmedOnly] = useState(true);
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('status_hierarchy'); // 'status_hierarchy' | 'loadingDate' | 'none' | 'region' | 'client' | 'loadingOrder' | 'fulfillmentStatus'
  const [sortBy, setSortBy] = useState('trip_asc'); // 'trip_asc' | 'weight_desc' | 'weight_asc' | 'cartons_desc' | 'serial_asc' | 'client_asc'

  // Staged Assignments: Record<orderId, { loadingOrderNumber, assignedVehicleId, assignedVehiclePlate, assignedDriverId, assignedDriverName, assignedDeliveryRepId, assignedDeliveryRepName, loadingDate }>
  const [stagedAssignments, setStagedAssignments] = useState({});

  // Floating Dock Expanded State
  const [isManifestExpanded, setIsManifestExpanded] = useState(false);

  // Saved Multi-Client Trip Delivery Sequence Quick Modal
  const [sequenceModal, setSequenceModal] = useState(null); // { vehicle, trip, stops, hasManualSequence, isSaving }

  // Non-Intrusive Order Products & Prices Modal
  const [selectedOrderForProducts, setSelectedOrderForProducts] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Intentional Alignment Discrepancy Modal Confirmation
  const [isIntentionalDiscrepancyModalOpen, setIsIntentionalDiscrepancyModalOpen] = useState(false);

  // Status Jump Confirmation Modal (for admin jump or reverting delivered status)
  const [statusJumpConfirmModal, setStatusJumpConfirmModal] = useState(null);

  // Filter Bar & Trucks Fleet Operational Dashboard visibility (both hidden by default)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isTrucksDashboardOpen, setIsTrucksDashboardOpen] = useState(false);

  // Standardized App-Wide Client Profile Popup Target
  const [clientProfileTarget, setClientProfileTarget] = useState(null);

  // Selected trip carousel index & slide direction per truck: Record<vehicleId, { index, dir }>
  const [selectedTripByVehicle, setSelectedTripByVehicle] = useState({});

  // Conflict Resolution LO # Filter (temporary state — clears on unmount/refresh/date change)
  const [loFilter, setLoFilter] = useState(null); // { loNumber, loadingDate, vehicleId, vehicleCode }
  const ordersListRef = useRef(null);

  // Truck Batch Fulfillment Status Transition Modal State: { isOpen, truck, targetStep, affectedOrders, loadingOrderNumber, isExecuting }
  const [truckStatusModal, setTruckStatusModal] = useState(null);

  // Notification Toast
  const [toastMsg, setToastMsg] = useState(null);

  // Retail Van-Sales Settlement Modal State: { order, allowDeferDelivery }
  const [retailSettlementModal, setRetailSettlementModal] = useState(null);

  // Opposite-Edge FG Stock & Deficit Sidebar State (default collapsed; pushes workspace inward when expanded on md+)
  const FG_SIDEBAR_WIDTH = 355;
  const [isFgSidebarOpen, setIsFgSidebarOpen] = useState(false);
  const [fgSidebarPushPx, setFgSidebarPushPx] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const loadingPlanWrapperRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const recalcPush = () => {
      const desktop = window.innerWidth >= 768;
      setIsDesktopViewport(desktop);
      if (!isFgSidebarOpen || !desktop || !loadingPlanWrapperRef.current) {
        setFgSidebarPushPx(0);
        return;
      }
      const rect = loadingPlanWrapperRef.current.getBoundingClientRect();
      const isRtlDoc = isAr || document.documentElement?.dir === 'rtl';
      const existingEndGap = isRtlDoc
        ? Math.max(0, Math.round(rect.left))
        : Math.max(0, Math.round(window.innerWidth - rect.right));
      const neededPush = Math.max(24, FG_SIDEBAR_WIDTH + 16 - existingEndGap);
      setFgSidebarPushPx((prev) => (prev !== neededPush ? neededPush : prev));
    };

    recalcPush();
    window.addEventListener('resize', recalcPush);
    const parentEl = loadingPlanWrapperRef.current?.parentElement;
    let ro = null;
    if (parentEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(recalcPush);
      ro.observe(parentEl);
    }
    return () => {
      window.removeEventListener('resize', recalcPush);
      if (ro) ro.disconnect();
    };
  }, [isFgSidebarOpen, isAr]);

  useEffect(() => {
    setLoFilter(null);
    setSelectedTripByVehicle({});
  }, [targetPlanningDate]);

  const handleSelectVehicleTrip = (vehicleId, index, dir = 'next') => {
    setSelectedTripByVehicle((prev) => ({
      ...prev,
      [vehicleId]: { index, dir }
    }));
  };

  const handleFilterConflictByLO = (loNumber, vehicleObj = null) => {
    if (!loNumber) return;
    setLoFilter({
      loNumber: String(loNumber),
      loadingDate: targetPlanningDate,
      vehicleId: vehicleObj?.id || null,
      vehicleName: resolveVehicleDisplayName(vehicleObj, vehicleObj?.plateNumber || ''),
      vehiclePlate: vehicleObj?.plateNumber || ''
    });
    setTimeout(() => {
      ordersListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const showToast = (message, type = 'success') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // 1. Subscribe to Sales Orders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sales_orders'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => {
        const dateComp = String(b.invoiceDate || '').localeCompare(String(a.invoiceDate || ''));
        if (dateComp !== 0) return dateComp;
        return compareOrdersBySerialAsc(b, a);
      });
      setOrders(loaded);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to Vehicles (Fleet)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.plateNumber || a.code || '').localeCompare(b.plateNumber || b.code || '', 'ar'));
      setVehicles(loaded);
    });
    return () => unsub();
  }, []);

  // 3. Subscribe to Unified Staff & Workers Directory (`employees` SSOT + unlinked `users`)
  useEffect(() => {
    let users = [];
    let emps = [];

    const rebuildWorkersPool = () => {
      setEmployees(
        buildUnifiedPersonnelPool({
          employees: emps,
          users,
          isAr,
        })
      );
    };

    const unsubEmps = onSnapshot(collection(db, 'employees'), (snapshot) => {
      emps = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rebuildWorkersPool();
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rebuildWorkersPool();
    });

    return () => {
      unsubEmps();
      unsubUsers();
    };
  }, [isAr]);

  // 4. Subscribe to Clients
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClients(loaded);
    });
    return () => unsub();
  }, []);

  // 5. Subscribe to Finished Products
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'finished_products'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(loaded);
    });
    return () => unsub();
  }, []);

  // 6. Subscribe to Client Segments
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'client_segments'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSegments(loaded);
    });
    return () => unsub();
  }, []);

  // 7. Subscribe Read-Only to Production & FG Inventory Streams for FG Stock Forecast Sidebar
  useEffect(() => {
    const unsubPallets = onSnapshot(collection(db, 'staged_floor_pallets'), (snap) => {
      setStagedPallets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setStockTransfers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubFaulty = onSnapshot(collection(db, 'faulty_fg_returns'), (snap) => {
      setFaultyReturns(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubWorkOrders = onSnapshot(collection(db, 'work_orders'), (snap) => {
      setWorkOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubTruckDispatches = onSnapshot(collection(db, 'truck_dispatches'), (snap) => {
      setTruckDispatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubPallets();
      unsubTransfers();
      unsubFaulty();
      unsubWorkOrders();
      unsubTruckDispatches();
    };
  }, []);

  // Fast Segment Map
  const segmentMap = useMemo(() => {
    const map = {};
    segments.forEach((s) => {
      if (s.id) map[s.id] = s;
      if (s.code) map[s.code] = s;
      if (s.nameAr) map[s.nameAr] = s;
      if (s.nameEn) map[s.nameEn] = s;
    });
    return map;
  }, [segments]);

  // Derive active date key string based on dateScope
  const todayStr = useMemo(() => formatDateKey(new Date()), []);
  const tomorrowStr = useMemo(() => formatDateKey(addDays(new Date(), 1)), []);
  const weekEndStr = useMemo(() => formatDateKey(addDays(new Date(), 7)), []);

  const activeDateScopeLabel = useMemo(() => {
    if (dateScope === 'all_pending') return isAr ? 'كافة المعلقة (غير منتهية التسليم)' : 'All Pending Orders';
    if (dateScope === 'today') return isAr ? `اليوم (${todayStr})` : `Today (${todayStr})`;
    if (dateScope === 'tomorrow') return isAr ? `غداً (${tomorrowStr})` : `Tomorrow (${tomorrowStr})`;
    if (dateScope === 'week') return isAr ? `خلال 7 أيام (${todayStr} إلى ${weekEndStr})` : `Next 7 Days (${todayStr} to ${weekEndStr})`;
    return isAr ? `تاريخ مخصص (${customDate})` : `Custom Date (${customDate})`;
  }, [dateScope, todayStr, tomorrowStr, weekEndStr, customDate, isAr]);

  // Handle Bidirectional Deep-Linking: jump to Sales Orders Master focusing on that order
  const handleNavigateToSalesOrder = (order) => {
    const serial = resolveOrderSerial(order, orders);
    if (typeof window !== 'undefined') {
      window.location.hash = `#sales_orders?module=sales&focusOrder=${encodeURIComponent(serial)}`;
      window.dispatchEvent(
        new CustomEvent('app-navigate', {
          detail: { tab: 'sales_orders', module: 'sales', focusOrder: serial, orderId: order.id }
        })
      );
    }
  };

  // Fast navigation to a specific Trip Card (or Return Inspection Modal) in Truck Dispatch
  const handleNavigateToTruckDispatch = (tripId, { openReturn = false } = {}) => {
    if (!tripId || typeof window === 'undefined') return;
    window.location.hash = `#truck_dispatch?module=sales&tripId=${encodeURIComponent(tripId)}${openReturn ? '&openReturn=1' : ''}`;
  };

  // Listen for Incoming Deep-Link Focus from Sales Orders Master
  useEffect(() => {
    const checkHashFocus = () => {
      if (typeof window === 'undefined') return;
      const rawHash = window.location.hash || '';
      if (!rawHash.includes('loading_plan')) return;
      const queryPart = rawHash.split('?')[1];
      if (!queryPart) return;
      const params = new URLSearchParams(queryPart);
      const targetOrderId = params.get('orderId');
      const targetDate = params.get('date');

      if (targetDate) {
        setTargetPlanningDate(targetDate);
        setCustomDate(targetDate);
        setDateScope('custom');
      }

      if (targetOrderId) {
        setTimeout(() => {
          const el = document.getElementById(`loading-plan-card-${targetOrderId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-4', 'ring-indigo-500', 'shadow-2xl');
            setTimeout(() => {
              el.classList.remove('ring-4', 'ring-indigo-500', 'shadow-2xl');
            }, 3000);
          }
        }, 500);
      }
    };

    checkHashFocus();
    window.addEventListener('hashchange', checkHashFocus);

    const handleCustomNav = (e) => {
      const { tab, orderId, date } = e.detail || {};
      if (tab === 'loading_plan') {
        if (date) {
          setTargetPlanningDate(date);
          setCustomDate(date);
          setDateScope('custom');
        }
        if (orderId) {
          setTimeout(() => {
            const el = document.getElementById(`loading-plan-card-${orderId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-4', 'ring-indigo-500', 'shadow-2xl');
              setTimeout(() => {
                el.classList.remove('ring-4', 'ring-indigo-500', 'shadow-2xl');
              }, 3000);
            }
          }, 500);
        }
      }
    };
    window.addEventListener('app-navigate', handleCustomNav);

    return () => {
      window.removeEventListener('hashchange', checkHashFocus);
      window.removeEventListener('app-navigate', handleCustomNav);
    };
  }, []);

  // Helper to resolve effective assignment (staged overrides saved order)
  const getEffectiveAssignment = (order) => {
    if (stagedAssignments[order.id]) {
      return stagedAssignments[order.id];
    }
    const matchedVeh = vehicles.find((v) => v.id === order.assignedVehicleId);
    return {
      loadingOrderNumber: order.loadingOrderNumber || '',
      assignedVehicleId: order.assignedVehicleId || '',
      assignedVehicleName: resolveVehicleDisplayName(matchedVeh, order.assignedVehicleName),
      assignedVehiclePlate: order.assignedVehiclePlate || matchedVeh?.plateNumber || '',
      assignedDriverId: order.assignedDriverId || '',
      assignedDriverName: order.assignedDriverName || '',
      assignedDeliveryRepId: order.assignedDeliveryRepId || '',
      assignedDeliveryRepName: order.assignedDeliveryRepName || '',
      loadingDate: order.loadingDate || targetPlanningDate || todayStr,
      invoiceDate: order.invoiceDate || '',
      fulfillmentStatus: order.fulfillmentStatus || 'not_yet'
    };
  };

  // Helper to stage a field change for an order
  const handleStageChange = (orderId, field, value) => {
    setStagedAssignments((prev) => {
      const existing = prev[orderId] || getEffectiveAssignment(orders.find((o) => o.id === orderId) || {});
      const updated = {
        ...existing,
        loadingDate: existing.loadingDate || targetPlanningDate || todayStr,
        [field]: value
      };

      // Auto-populate driver and truck name when vehicle changes
      if (field === 'assignedVehicleId') {
        const matchedVeh = vehicles.find((v) => v.id === value);
        if (matchedVeh) {
          updated.assignedVehicleName = resolveVehicleDisplayName(matchedVeh);
          updated.assignedVehiclePlate = matchedVeh.plateNumber || '';
          if (matchedVeh.driverUserId) {
            updated.assignedDriverId = matchedVeh.driverUserId;
            const matchedEmp = employees.find((e) => e.id === matchedVeh.driverUserId);
            updated.assignedDriverName = matchedEmp ? (matchedEmp.nameAr || matchedEmp.name) : matchedVeh.driverName || '';
          }
        } else {
          updated.assignedVehicleName = '';
          updated.assignedVehiclePlate = '';
        }
      }

      // Sync driver name when driverId changes
      if (field === 'assignedDriverId') {
        const matchedEmp = employees.find((e) => e.id === value);
        updated.assignedDriverName = matchedEmp ? (matchedEmp.nameAr || matchedEmp.name) : '';
      }

      // Sync rep name when repId changes
      if (field === 'assignedDeliveryRepId') {
        const matchedEmp = employees.find((e) => e.id === value);
        updated.assignedDeliveryRepName = matchedEmp ? (matchedEmp.nameAr || matchedEmp.name) : '';
      }

      return {
        ...prev,
        [orderId]: updated
      };
    });
  };

  // Helper to clear assignment for an order (keeps assignment panel open for re-assignment)
  const handleClearAssignment = (orderId) => {
    const original = orders.find((o) => o.id === orderId) || {};
    setStagedAssignments((prev) => ({
      ...prev,
      [orderId]: {
        loadingOrderNumber: '',
        assignedVehicleId: '',
        assignedVehicleName: '',
        assignedVehiclePlate: '',
        assignedDriverId: '',
        assignedDriverName: '',
        assignedDeliveryRepId: '',
        assignedDeliveryRepName: '',
        loadingDate: '',
        invoiceDate: original.invoiceDate || '',
        fulfillmentStatus: 'not_yet'
      }
    }));
  };

  // Cancel editing an order and discard its uncommitted changes
  const handleCancelEdit = (orderId) => {
    const original = orders.find((o) => o.id === orderId);
    setStagedAssignments((prev) => {
      const copy = { ...prev };
      if (!original || !original.loadingOrderNumber) {
        delete copy[orderId];
      } else {
        copy[orderId] = {
          loadingOrderNumber: original.loadingOrderNumber || '',
          assignedVehicleId: original.assignedVehicleId || '',
          assignedVehicleName: original.assignedVehicleName || '',
          assignedVehiclePlate: original.assignedVehiclePlate || '',
          assignedDriverId: original.assignedDriverId || '',
          assignedDriverName: original.assignedDriverName || '',
          assignedDeliveryRepId: original.assignedDeliveryRepId || '',
          assignedDeliveryRepName: original.assignedDeliveryRepName || '',
          loadingDate: original.loadingDate || '',
          invoiceDate: original.invoiceDate || '',
          fulfillmentStatus: original.fulfillmentStatus || 'not_yet'
        };
      }
      return copy;
    });
    setActiveEditingOrderId(null);
  };

  // Open card for assignment/edit with date mismatch validation
  const handleInitiateEdit = (order) => {
    const eff = getEffectiveAssignment(order);
    const existingLoadingDate = eff.loadingDate || order.loadingDate || '';
    const existingInvoiceDate = eff.invoiceDate || order.invoiceDate || '';

    // Check loading date or invoice date mismatch with targetPlanningDate
    const hasLoadingMismatch = Boolean(existingLoadingDate && existingLoadingDate !== targetPlanningDate);
    const hasInvoiceMismatch = Boolean(existingInvoiceDate && existingInvoiceDate !== targetPlanningDate);

    if (hasLoadingMismatch || hasInvoiceMismatch) {
      setDateMismatchModal({
        order,
        existingLoadingDate,
        targetLoadingDate: targetPlanningDate,
        existingInvoiceDate,
        updateLoadingDate: hasLoadingMismatch,
        updateInvoiceDate: false,
        customInvoiceDate: existingInvoiceDate || targetPlanningDate,
        isSavingCheck: false
      });
      return;
    }

    // No mismatch or new assignment: stage targetPlanningDate if not set
    if (!eff.loadingDate) {
      handleStageChange(order.id, 'loadingDate', targetPlanningDate);
    }
    setActiveEditingOrderId(order.id);
  };

  // Card-level save check: Pending saves freely; Preparing+ requires Trip #, Truck, Driver on save
  const handleSaveCardAssignment = (order) => {
    const eff = getEffectiveAssignment(order);
    const targetStatus = eff.fulfillmentStatus || order.fulfillmentStatus || 'not_yet';
    const validation = validateLoadingPlanOrderMandatoryFields({
      fulfillmentStatus: targetStatus,
      loadingOrderNumber: eff.loadingOrderNumber,
      assignedVehicleId: eff.assignedVehicleId,
      assignedDriverId: eff.assignedDriverId,
    });
    if (!validation.valid) {
      const missingLabels = validation.missing.map((k) =>
        k === 'tripNumber'
          ? (isAr ? 'رقم الرحلة' : 'Trip #')
          : k === 'vehicle'
          ? (isAr ? 'السيارة' : 'Truck')
          : (isAr ? 'السائق' : 'Driver')
      );
      showToast(
        isAr
          ? `لحفظ حالة غير "قيد الانتظار"، يرجى استكمال: ${missingLabels.join('، ')}`
          : `To save a non-Pending order status, please complete: ${missingLabels.join(', ')}`,
        'error'
      );
      return;
    }

    const existingLoadingDate = eff.loadingDate || '';
    const existingInvoiceDate = eff.invoiceDate || '';
    const hasLoadingMismatch = Boolean(existingLoadingDate && existingLoadingDate !== targetPlanningDate);
    const hasInvoiceMismatch = Boolean(existingInvoiceDate && existingInvoiceDate !== targetPlanningDate);

    if (hasLoadingMismatch || hasInvoiceMismatch) {
      setDateMismatchModal({
        order,
        existingLoadingDate,
        targetLoadingDate: targetPlanningDate,
        existingInvoiceDate,
        updateLoadingDate: hasLoadingMismatch,
        updateInvoiceDate: false,
        customInvoiceDate: existingInvoiceDate || targetPlanningDate,
        isSavingCheck: true
      });
      return;
    }

    setActiveEditingOrderId(null);
  };

  // Confirm date mismatch update: applies selected date updates to staged assignment
  const handleConfirmDateMismatchUpdate = (options = {}) => {
    if (!dateMismatchModal) return;
    const { order, targetLoadingDate, isSavingCheck } = dateMismatchModal;
    const { updateLoading, updateInvoice, newInvoiceDate } = options;

    if (updateLoading) {
      handleStageChange(order.id, 'loadingDate', targetLoadingDate);
    }
    if (updateInvoice && newInvoiceDate) {
      handleStageChange(order.id, 'invoiceDate', newInvoiceDate);
    }

    if (isSavingCheck) {
      setActiveEditingOrderId(null);
    } else {
      setActiveEditingOrderId(order.id);
    }
    setDateMismatchModal(null);
    showToast(
      isAr
        ? 'تم تحديث التواريخ ومتابعة التعديل بنجاح'
        : 'Dates updated successfully'
    );
  };

  // Continue to edit or save without changing original dates
  const handleContinueWithoutDateChange = () => {
    if (!dateMismatchModal) return;
    const { order, isSavingCheck } = dateMismatchModal;
    if (isSavingCheck) {
      setActiveEditingOrderId(null);
    } else {
      setActiveEditingOrderId(order.id);
    }
    setDateMismatchModal(null);
  };

  // Cancel date mismatch modal
  const handleCancelDateMismatch = () => {
    setDateMismatchModal(null);
  };

  // Stepper status change handler - GOING BACKWARD BYPASSES VERIFICATIONS!
  const handleStepStatusClick = (order, step, currentIndex, targetIndex) => {
    // Clicking current status -> do nothing
    if (targetIndex === currentIndex) return;

    // 1. GOING STEPS BACKWARD: BYPASS ALL VERIFICATIONS! (Reverting to Pending or any previous step)
    if (targetIndex < currentIndex) {
      handleStageChange(order.id, 'fulfillmentStatus', step.id);
      showToast(
        isAr
          ? `تم التراجع إلى حالة (${step.labelAr}) بنجاح`
          : `Reverted back to (${step.labelEn})`
      );
      return;
    }

    // 2. FORWARD MOVEMENT (Mandatory Trip # / Truck / Driver verified at Order Save):
    const isClosedOrder = order.fulfillmentStatus === 'delivered' || order.fulfillmentStatus === 'paid';
    const isOrderLocked = isClosedOrder && !canModifyClosedOrders;
    if (isOrderLocked) {
      showToast(
        isAr
          ? 'الطلب مكتمل ومغلق للتعديل إلا بصلاحية الإدارة العامة'
          : 'Order is delivered/paid and locked without admin permission',
        'info'
      );
      return;
    }

    // Retail Van-Sales Arrival Gate: intercept forward move to 'delivered' if not yet settled
    if (
      step.id === 'delivered' &&
      isOrderRetailRoute(order, clients, segments) &&
      order.retailSettlementStatus !== 'settled' &&
      (targetIndex === currentIndex + 1 || canModifyClosedOrders || isGeneralAdmin)
    ) {
      setRetailSettlementModal({ order, allowDeferDelivery: true });
      return;
    }

    // Allow changing status freely before mandatory assignment fields are entered
    if (targetIndex === currentIndex + 1) {
      handleStageChange(order.id, 'fulfillmentStatus', step.id);
      return;
    }

    // Non-sequential forward jump for admin
    if (canModifyClosedOrders || isGeneralAdmin) {
      setStatusJumpConfirmModal({
        order,
        targetStep: step,
        currentStepId: SEQUENTIAL_FULFILLMENT_STEPS[currentIndex]?.id || 'not_yet',
        currentStepLabel: isAr
          ? SEQUENTIAL_FULFILLMENT_STEPS[currentIndex]?.labelAr || 'قيد الانتظار'
          : SEQUENTIAL_FULFILLMENT_STEPS[currentIndex]?.labelEn || 'Pending',
        targetStepLabel: isAr ? step.labelAr : step.labelEn
      });
      return;
    }

    // Normal user attempting forward jump
    showToast(
      isAr
        ? 'يجب التدرج في حالات التنفيذ خطوة بخطوة بالترتيب'
        : 'Fulfillment statuses must be progressed sequentially step-by-step',
      'info'
    );
  };

  // Confirm status jump for admin
  const handleConfirmStatusJump = () => {
    if (!statusJumpConfirmModal) return;
    const { order, targetStep } = statusJumpConfirmModal;
    handleStageChange(order.id, 'fulfillmentStatus', targetStep.id);
    setStatusJumpConfirmModal(null);
    showToast(
      isAr
        ? `تم الانتقال إلى حالة (${targetStep.labelAr}) بنجاح`
        : `Status changed to (${targetStep.labelEn})`
    );
  };

  // Filtered Orders (Unified Target Loading Date Visibility Scope)
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Exclude purely administrative, collection, financial-only, or immutable split-parent reference orders
      if (order.isSplitParent || ['admin', 'collection', 'invoice_only_with_tax', 'invoice_only_no_tax'].includes(order.orderType)) {
        return false;
      }

      // Exclude canceled orders by default
      if (order.confirmationStatus === 'canceled') {
        return false;
      }

      // Confirmed only filter
      if (confirmedOnly && order.confirmationStatus !== 'confirmed') {
        return false;
      }

      const eff = getEffectiveAssignment(order);
      const effectiveDate = eff.loadingDate || order.loadingDate || order.invoiceDate || '';
      const effectiveLo = String(eff.loadingOrderNumber || order.loadingOrderNumber || '').trim();
      const effectiveVehId = eff.assignedVehicleId || order.assignedVehicleId || '';
      const normStatus = normalizeFulfillmentStatus(eff.fulfillmentStatus || order.fulfillmentStatus);

      // Conflict Resolution Trip # Filter takes priority so user sees all conflicting orders across all statuses
      if (loFilter) {
        if (loFilter.loNumber === 'unnumbered') {
          if (effectiveLo) return false;
          if (loFilter.vehicleId && effectiveVehId !== loFilter.vehicleId) return false;
        } else {
          if (effectiveLo !== String(loFilter.loNumber)) return false;
        }
        if (loFilter.loadingDate && effectiveDate !== loFilter.loadingDate) return false;
        return true;
      }

      // Unified Target Loading Date Visibility Rule:
      // - 'prepare' (Preparing) and 'not_yet' (Pending) are shown across ALL dates (targetPlanningDate + delayed past + upcoming future)
      // - 'shipped' (Out for Delivery) and 'delivered' (Delivered / Paid) are shown ONLY for targetPlanningDate
      if (normStatus === 'shipped' || normStatus === 'delivered') {
        if (effectiveDate !== targetPlanningDate) {
          return false;
        }
      }

      // Fulfillment status quick filter
      if (fulfillmentFilter !== 'all') {
        if (fulfillmentFilter === 'delivered') {
          if (normStatus !== 'delivered') return false;
        } else if (normStatus !== fulfillmentFilter && order.fulfillmentStatus !== fulfillmentFilter) {
          return false;
        }
      }

      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const serial = String(order.serial || '').toLowerCase();
        const clientName = String(order.clientName || '').toLowerCase();
        const branchName = String(order.branchName || '').toLowerCase();
        const region = String(order.region || '').toLowerCase();
        const poTW = String(order.poTawoos || '').toLowerCase();
        const poPL = String(order.poPrivateLabel || '').toLowerCase();
        const notes = `${order.externalComments || ''} ${order.internalComments || ''}`.toLowerCase();

        if (
          !serial.includes(q) &&
          !clientName.includes(q) &&
          !branchName.includes(q) &&
          !region.includes(q) &&
          !poTW.includes(q) &&
          !poPL.includes(q) &&
          !notes.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [orders, stagedAssignments, targetPlanningDate, confirmedOnly, fulfillmentFilter, searchTerm, loFilter]);

  // Helper comparator: Target Loading Date on top -> ascending dates -> ascending Trip # -> secondary sortBy
  const compareOrdersByTargetDateAndTrip = (a, b) => {
    const effA = getEffectiveAssignment(a);
    const effB = getEffectiveAssignment(b);
    const dateA = effA.loadingDate || a.loadingDate || a.invoiceDate || '9999-99-99';
    const dateB = effB.loadingDate || b.loadingDate || b.invoiceDate || '9999-99-99';

    const aIsTarget = dateA === targetPlanningDate;
    const bIsTarget = dateB === targetPlanningDate;
    if (aIsTarget && !bIsTarget) return -1;
    if (!aIsTarget && bIsTarget) return 1;
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    const tripA = Number(effA.loadingOrderNumber || a.loadingOrderNumber) || Infinity;
    const tripB = Number(effB.loadingOrderNumber || b.loadingOrderNumber) || Infinity;
    if (tripA !== tripB) return tripA - tripB;

    if (sortBy === 'weight_desc') {
      return (Number(b.totalWeightKg) || 0) - (Number(a.totalWeightKg) || 0);
    }
    if (sortBy === 'weight_asc') {
      return (Number(a.totalWeightKg) || 0) - (Number(b.totalWeightKg) || 0);
    }
    if (sortBy === 'cartons_desc') {
      return (Number(b.totalCartons || b.totalQty) || 0) - (Number(a.totalCartons || a.totalQty) || 0);
    }
    if (sortBy === 'client_asc') {
      return String(a.clientName || '').localeCompare(String(b.clientName || ''), 'ar');
    }
    return compareOrdersBySerialAsc(a, b);
  };

  // Sorted Orders
  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
      if (sortBy === 'trip_asc') {
        return compareOrdersByTargetDateAndTrip(a, b);
      }
      if (sortBy === 'weight_desc') {
        return (Number(b.totalWeightKg) || 0) - (Number(a.totalWeightKg) || 0);
      }
      if (sortBy === 'weight_asc') {
        return (Number(a.totalWeightKg) || 0) - (Number(b.totalWeightKg) || 0);
      }
      if (sortBy === 'cartons_desc') {
        return (Number(b.totalCartons || b.totalQty) || 0) - (Number(a.totalCartons || a.totalQty) || 0);
      }
      if (sortBy === 'serial_asc') {
        return compareOrdersBySerialAsc(a, b);
      }
      if (sortBy === 'client_asc') {
        return String(a.clientName || '').localeCompare(String(b.clientName || ''), 'ar');
      }
      return compareOrdersByTargetDateAndTrip(a, b);
    });
    return list;
  }, [filteredOrders, sortBy, stagedAssignments, targetPlanningDate]);

  // Grouped Orders
  const groupedOrders = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupKey: 'all', groupLabel: '', items: sortedOrders }];
    }

    // Default Operational Status Hierarchy:
    // a) Preparing on top (Target Loading Date on top -> ascending dates -> Trip # ascending)
    // b) Pending second (Target Loading Date on top -> ascending dates -> Trip # ascending)
    // c) Out for Delivery third (Target Loading Date only -> Trip # ascending)
    // d) Delivered / Paid fourth (Target Loading Date only -> Trip # ascending)
    if (groupBy === 'status_hierarchy') {
      const buckets = {
        prepare: {
          groupKey: 'status_prepare',
          statusKey: 'prepare',
          groupLabel: isAr
            ? '١. جاري التجهيز والتحميل (Preparing)'
            : '1. Preparing (Loading in Progress)',
          items: []
        },
        not_yet: {
          groupKey: 'status_not_yet',
          statusKey: 'not_yet',
          groupLabel: isAr
            ? '٢. قيد الانتظار (Pending — متاح للتسكين والتنفيذ)'
            : '2. Pending (Ready for Dispatch / Scheduling)',
          items: []
        },
        shipped: {
          groupKey: 'status_shipped',
          statusKey: 'shipped',
          groupLabel: isAr
            ? `٣. جاري التوصيل على الطريق (${targetPlanningDate})`
            : `3. Out for Delivery (${targetPlanningDate})`,
          items: []
        },
        delivered: {
          groupKey: 'status_delivered',
          statusKey: 'delivered',
          groupLabel: isAr
            ? `٤. تم التسليم (${targetPlanningDate})`
            : `4. Delivered / Paid (${targetPlanningDate})`,
          items: []
        }
      };

      sortedOrders.forEach((order) => {
        const eff = getEffectiveAssignment(order);
        const norm = normalizeFulfillmentStatus(eff.fulfillmentStatus || order.fulfillmentStatus);
        if (buckets[norm]) {
          buckets[norm].items.push(order);
        } else {
          buckets.not_yet.items.push(order);
        }
      });

      return ['prepare', 'not_yet', 'shipped', 'delivered']
        .map((k) => {
          const b = buckets[k];
          b.items.sort(compareOrdersByTargetDateAndTrip);
          return b;
        })
        .filter((b) => b.items.length > 0);
    }

    const groups = {};
    sortedOrders.forEach((order) => {
      let key = 'other';
      let label = isAr ? 'أخرى' : 'Other';

      if (groupBy === 'loadingDate') {
        const eff = getEffectiveAssignment(order);
        const lDate = eff.loadingDate || order.loadingDate || '';
        key = lDate || 'unscheduled';
        if (lDate) {
          const isTarget = lDate === targetPlanningDate;
          const isToday = lDate === todayStr;
          const isTomorrow = lDate === tomorrowStr;
          let tag = '';
          if (isTarget) tag = isAr ? ' [تاريخ التحميل المستهدف]' : ' [Target Loading Date]';
          else if (isToday) tag = isAr ? ' (اليوم)' : ' (Today)';
          else if (isTomorrow) tag = isAr ? ' (غداً)' : ' (Tomorrow)';

          label = `${isAr ? 'تاريخ التحميل:' : 'Loading Date:'} ${lDate}${tag}`;
        } else {
          label = isAr ? 'بدون تاريخ تحميل محدد (غير مجدول)' : 'Unscheduled / No Date';
        }
      } else if (groupBy === 'region') {
        key = order.region || 'unspecified';
        label = order.region || (isAr ? 'منطقة غير محددة' : 'Unspecified Region');
      } else if (groupBy === 'client') {
        key = order.clientId || order.clientName || 'unspecified';
        label = order.clientName || (isAr ? 'عميل غير محدد' : 'Unspecified Client');
      } else if (groupBy === 'loadingOrder') {
        const eff = getEffectiveAssignment(order);
        const vObj = vehicles.find((v) => v.id === eff.assignedVehicleId);
        const tName = resolveVehicleDisplayName(vObj, eff.assignedVehicleName);
        key = eff.loadingOrderNumber ? `lo_${eff.loadingOrderNumber}` : 'unassigned';
        label = eff.loadingOrderNumber
          ? `${isAr ? 'رحلة #' : 'Trip #'}${eff.loadingOrderNumber}${tName ? ` — ${tName}` : ''}`
          : (isAr ? 'غير مسكن برحلة / شاحنة' : 'Unassigned to Trip / Truck');
      } else if (groupBy === 'fulfillmentStatus') {
        const fulf = FULFILLMENT_STATUSES.find((f) => f.id === order.fulfillmentStatus);
        key = order.fulfillmentStatus || 'not_yet';
        label = isAr ? (fulf?.labelAr || key) : (fulf?.labelEn || key);
      }

      if (!groups[key]) {
        groups[key] = {
          groupKey: key,
          statusKey: groupBy === 'fulfillmentStatus' ? key : null,
          groupLabel: label,
          items: []
        };
      }
      groups[key].items.push(order);
    });

    const groupList = Object.values(groups);

    // Group Sorting: for loadingDate, targetPlanningDate on top, then ascending, unscheduled last
    if (groupBy === 'loadingDate') {
      groupList.sort((a, b) => {
        if (a.groupKey === targetPlanningDate) return -1;
        if (b.groupKey === targetPlanningDate) return 1;
        if (a.groupKey === 'unscheduled') return 1;
        if (b.groupKey === 'unscheduled') return -1;
        return a.groupKey.localeCompare(b.groupKey);
      });
    }

    return groupList;
  }, [sortedOrders, groupBy, sortBy, isAr, stagedAssignments, targetPlanningDate, todayStr, tomorrowStr, vehicles]);

  // Sequential FG Stock Availability Map per Order & SKU Line (Date -> Prepare -> Ascending Trip # -> Serial #)
  const orderAvailabilityMap = useMemo(() => {
    return buildOrderTripAvailabilityMap({
      finishedProducts: products,
      stagedPallets,
      stockTransfers,
      faultyReturns,
      salesOrders: orders,
      workOrders,
      truckDispatches,
      stagedAssignments,
      todayStr,
    });
  }, [
    products,
    stagedPallets,
    stockTransfers,
    faultyReturns,
    orders,
    workOrders,
    truckDispatches,
    stagedAssignments,
    todayStr,
  ]);

  // Stage optional client delivery sequence (1..N or null for Auto) for all orders in a multi-client trip
  const handleStageTripSequence = (assignedOrders, orderedStopsOrNull) => {
    if (!Array.isArray(assignedOrders) || assignedOrders.length === 0) return;
    setStagedAssignments((prev) => {
      const next = { ...prev };
      if (!orderedStopsOrNull) {
        // Clear sequence back to automatic
        assignedOrders.forEach((ord) => {
          const base = prev[ord.id] || getEffectiveAssignment(ord);
          next[ord.id] = { ...base, deliverySequence: null };
        });
      } else {
        orderedStopsOrNull.forEach((stop, idx) => {
          const seq = idx + 1;
          (stop.orders || []).forEach((ord) => {
            const base = prev[ord.id] || getEffectiveAssignment(ord);
            next[ord.id] = { ...base, deliverySequence: seq };
          });
        });
      }
      return next;
    });
  };

  const handleOpenSequenceModal = (veh, trip) => {
    if (!trip || !Array.isArray(trip.orders)) return;
    const { stops, hasManualSequence } = getTripClientStops(trip.orders, stagedAssignments);
    if (stops.length <= 1) return;
    setSequenceModal({
      vehicle: veh,
      trip,
      stops,
      hasManualSequence,
      isSaving: false,
    });
  };

  const handleSaveSequenceModal = async (overrideClear = false) => {
    if (!sequenceModal?.trip) return;
    setSequenceModal((prev) => (prev ? { ...prev, isSaving: true } : null));
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      let changedCount = 0;

      const stopsToApply = sequenceModal.stops || [];
      stopsToApply.forEach((stop, idx) => {
        const targetSeq = overrideClear ? null : idx + 1;
        (stop.orders || []).forEach((ord) => {
          const originalOrder = orders.find((o) => o.id === ord.id) || ord;
          const oldSeq = Number(originalOrder?.deliverySequence) > 0 ? Math.floor(Number(originalOrder.deliverySequence)) : null;
          if (oldSeq === targetSeq) return;

          changedCount += 1;
          const orderRef = doc(db, 'sales_orders', ord.id);
          const existingAudit = Array.isArray(originalOrder?.auditTrail) ? originalOrder.auditTrail : [];
          const auditEntry = {
            id: `AUD-${Date.now()}-${existingAudit.length + 1}`,
            timestamp: nowIso,
            userId: currentUserId,
            userName: currentUserName,
            performedBy: currentUserName,
            performedById: currentUserId,
            action: 'dispatch_plan_update',
            summaryAr: targetSeq ? `تحديث أولوية التسليم إلى #${targetSeq}` : 'إعادة أولوية التسليم إلى تلقائي',
            summaryEn: targetSeq ? `Updated delivery sequence to #${targetSeq}` : 'Reset delivery sequence to Auto',
            changes: [
              {
                labelAr: 'أولوية التسليم',
                labelEn: 'Delivery Sequence',
                oldValue: oldSeq ? `#${oldSeq}` : (isAr ? 'تلقائي' : 'Auto'),
                newValue: targetSeq ? `#${targetSeq}` : (isAr ? 'تلقائي' : 'Auto'),
              },
            ],
          };

          batch.update(orderRef, {
            deliverySequence: targetSeq,
            updatedAt: nowIso,
            updatedBy: currentUserName,
            auditTrail: [...existingAudit, auditEntry],
          });
        });
      });

      if (changedCount > 0) {
        await batch.commit();
        showToast(
          overrideClear
            ? (isAr ? 'تم إعادة ترتيب التسليم إلى الوضع التلقائي' : 'Delivery sequence reset to Auto')
            : (isAr ? 'تم حفظ أولوية التسليم للرحلة بنجاح' : 'Trip delivery sequence saved successfully')
        );
      }
      setSequenceModal(null);
    } catch (err) {
      console.error('Failed saving delivery sequence:', err);
      showToast(isAr ? 'حدث خطأ أثناء حفظ أولوية التسليم' : 'Error saving delivery sequence', 'error');
      setSequenceModal((prev) => (prev ? { ...prev, isSaving: false } : null));
    }
  };

  // Active Trucks / Trips Manifest Analysis (Focused ONLY on trips triggered by stagedAssignments)
  const truckManifest = useMemo(() => {
    const loGroups = {};

    // 1. Identify which compound trip keys (loadingDate_#tripNumber) were triggered by currently staged orders
    const triggeredCompoundKeys = new Set();
    Object.entries(stagedAssignments).forEach(([orderId, staged]) => {
      const stagedLo = Number(staged?.loadingOrderNumber);
      if (stagedLo > 0) {
        const stagedDate = staged.loadingDate || targetPlanningDate || todayStr;
        triggeredCompoundKeys.add(`${stagedDate}_#${stagedLo}`);
      }
      // Also include the original trip if a staged order was modified from an existing trip
      const origOrder = orders.find((o) => o.id === orderId);
      const origLo = Number(origOrder?.loadingOrderNumber);
      if (origLo > 0) {
        const origDate = origOrder.loadingDate || targetPlanningDate || todayStr;
        triggeredCompoundKeys.add(`${origDate}_#${origLo}`);
      }
    });

    if (triggeredCompoundKeys.size === 0) return [];

    const allRelevantOrders = orders.filter(
      (o) =>
        o.confirmationStatus !== 'canceled' &&
        !['admin', 'collection', 'invoice_only_with_tax', 'invoice_only_no_tax'].includes(o.orderType)
    );

    allRelevantOrders.forEach((order) => {
      const eff = getEffectiveAssignment(order);
      const loNum = Number(eff.loadingOrderNumber);
      if (!loNum) return;

      const loDate = eff.loadingDate || targetPlanningDate || todayStr;
      const compoundKey = `${loDate}_#${loNum}`;

      // Focus strictly on trips triggered by the floating bar's staged orders
      if (!triggeredCompoundKeys.has(compoundKey)) return;

      if (!loGroups[compoundKey]) {
        const initVeh = vehicles.find((v) => v.id === eff.assignedVehicleId);
        loGroups[compoundKey] = {
          compoundKey,
          loadingOrderNumber: loNum,
          loadingDate: loDate,
          dismissNumber: calculateDismissNumber(loDate, loNum),
          vehiclesAssigned: new Set(),
          driversAssigned: new Set(),
          repsAssigned: new Set(),
          assignedOrders: [],
          stagedOrderIds: new Set(),
          totalCartons: 0,
          totalWeightKg: 0,
          primaryVehicleId: eff.assignedVehicleId,
          primaryVehicleName: resolveVehicleDisplayName(initVeh, eff.assignedVehicleName),
          primaryVehiclePlate: eff.assignedVehiclePlate || initVeh?.plateNumber || '',
          primaryDriverId: eff.assignedDriverId,
          primaryDriverName: eff.assignedDriverName,
          primaryRepId: eff.assignedDeliveryRepId,
          primaryRepName: eff.assignedDeliveryRepName
        };
      }

      const g = loGroups[compoundKey];
      const isOrderStaged = Boolean(stagedAssignments[order.id]);
      if (isOrderStaged) {
        g.stagedOrderIds.add(order.id);
        // Prefer the staged order's vehicle & driver as primary target when aligning
        if (eff.assignedVehicleId) {
          const vObj = vehicles.find((v) => v.id === eff.assignedVehicleId);
          g.primaryVehicleId = eff.assignedVehicleId;
          g.primaryVehicleName = resolveVehicleDisplayName(vObj, eff.assignedVehicleName);
          g.primaryVehiclePlate = eff.assignedVehiclePlate || vObj?.plateNumber || '';
        }
        if (eff.assignedDriverId) {
          g.primaryDriverId = eff.assignedDriverId;
          g.primaryDriverName = eff.assignedDriverName;
        }
        if (eff.assignedDeliveryRepId) {
          g.primaryRepId = eff.assignedDeliveryRepId;
          g.primaryRepName = eff.assignedDeliveryRepName;
        }
      }

      if (eff.assignedVehicleId) {
        g.vehiclesAssigned.add(eff.assignedVehicleId);
        if (!g.primaryVehicleName) {
          const vObj = vehicles.find((v) => v.id === eff.assignedVehicleId);
          g.primaryVehicleName = eff.assignedVehicleName || vObj?.vehicleModel || vObj?.name || vObj?.code || '';
        }
        if (!g.primaryVehiclePlate) {
          const vObj = vehicles.find((v) => v.id === eff.assignedVehicleId);
          g.primaryVehiclePlate = eff.assignedVehiclePlate || vObj?.plateNumber || '';
        }
      }
      if (eff.assignedDriverId) g.driversAssigned.add(eff.assignedDriverId);
      if (eff.assignedDeliveryRepId) g.repsAssigned.add(eff.assignedDeliveryRepId);

      g.assignedOrders.push(order);
      g.totalCartons += Number(order.totalCartons || order.totalQty || 0);
      g.totalWeightKg += Number(order.totalWeightKg || 0);
    });

    // Detect conflicts and calculate capacity gauges per compound key
    const manifestList = Object.values(loGroups).map((g) => {
      const hasVehicleMismatch = g.vehiclesAssigned.size > 1;
      const hasDriverMismatch = g.driversAssigned.size > 1;
      const isMisaligned = hasVehicleMismatch || hasDriverMismatch;

      const vehObj = vehicles.find((v) => v.id === g.primaryVehicleId) || null;
      const minCap = Number(vehObj?.minCapacityKg) || 0;
      const optCap = Number(vehObj?.optimumCapacityKg) || 0;
      const maxCap = Number(vehObj?.maxCapacityKg) || 0;

      let gaugeStatus = 'normal';
      let gaugePct = 0;

      if (maxCap > 0) {
        gaugePct = Math.min(100, Math.round((g.totalWeightKg / maxCap) * 100));
        if (minCap > 0 && g.totalWeightKg < minCap) {
          gaugeStatus = 'under';
        } else if (optCap > 0 && g.totalWeightKg >= optCap * 0.9 && g.totalWeightKg <= optCap * 1.1) {
          gaugeStatus = 'optimal';
        } else if (g.totalWeightKg > maxCap) {
          gaugeStatus = 'over';
        } else if (optCap > 0 && g.totalWeightKg > optCap * 1.1) {
          gaugeStatus = 'heavy';
        }
      }

      return {
        ...g,
        vehicleObj: vehObj,
        primaryVehicleName: g.primaryVehicleName || vehObj?.vehicleModel || vehObj?.name || vehObj?.code || '',
        isMisaligned,
        hasVehicleMismatch,
        hasDriverMismatch,
        minCap,
        optCap,
        maxCap,
        gaugePct,
        gaugeStatus
      };
    });

    // Sort by date, then by loading order number
    manifestList.sort((a, b) => {
      const dateCmp = String(a.loadingDate).localeCompare(String(b.loadingDate));
      if (dateCmp !== 0) return dateCmp;
      return a.loadingOrderNumber - b.loadingOrderNumber;
    });

    return manifestList;
  }, [orders, stagedAssignments, vehicles, employees, targetPlanningDate, todayStr]);

  // Overall Misalignment Flag
  const totalMisalignments = useMemo(() => {
    return truckManifest.filter((t) => t.isMisaligned).length;
  }, [truckManifest]);

  // Real-time Trucks Fleet Operational Analysis, Per-Trip Carousel Grouping & Multi-tier Conflict Detection
  const truckFleetAnalysis = useMemo(() => {
    if (!Array.isArray(vehicles) || vehicles.length === 0) return [];

    const dispatchesById = {};
    (truckDispatches || []).forEach((td) => {
      if (td && td.id) dispatchesById[td.id] = td;
    });

    const analyzed = vehicles.map((veh) => {
      const maxCapKg = Number(veh.maxCapacityKg) || 0;

      // 1. Gather all active physical delivery orders assigned to this vehicle (excluding split parent references)
      const allVehicleOrders = orders.filter((o) => {
        if (o.isSplitParent || o.confirmationStatus === 'canceled') return false;
        if (['admin', 'collection', 'invoice_only_with_tax', 'invoice_only_no_tax'].includes(o.orderType)) return false;
        const eff = getEffectiveAssignment(o);
        const vehId = eff.assignedVehicleId || o.assignedVehicleId;
        return vehId === veh.id;
      });

      // 2. Orders assigned on the targetPlanningDate
      const targetOrders = allVehicleOrders.filter((o) => {
        const eff = getEffectiveAssignment(o);
        const lDate = eff.loadingDate || o.loadingDate || '';
        return lDate === targetPlanningDate;
      });

      // 3. Orders from prior dates that are still prepare/shipped (uncompleted prior trips)
      const priorOpenOrders = allVehicleOrders.filter((o) => {
        const eff = getEffectiveAssignment(o);
        const lDate = eff.loadingDate || o.loadingDate || '';
        const norm = normalizeFulfillmentStatus(eff.fulfillmentStatus || o.fulfillmentStatus);
        return lDate && lDate < targetPlanningDate && (norm === 'prepare' || norm === 'shipped');
      });

      // 4. Group targetOrders into discrete Trips by Loading Order Number (LO #)
      const tripGroupsMap = {};
      targetOrders.forEach((o) => {
        const eff = getEffectiveAssignment(o);
        const rawLo = String(eff.loadingOrderNumber || o.loadingOrderNumber || '').trim();
        const key = rawLo || 'unnumbered';
        if (!tripGroupsMap[key]) {
          tripGroupsMap[key] = {
            loadingOrderNumber: key,
            orders: []
          };
        }
        tripGroupsMap[key].orders.push(o);
      });

      const trips = Object.values(tripGroupsMap)
        .sort((a, b) => {
          if (a.loadingOrderNumber === 'unnumbered') return 1;
          if (b.loadingOrderNumber === 'unnumbered') return -1;
          return Number(a.loadingOrderNumber) - Number(b.loadingOrderNumber);
        })
        .map((grp) => {
          const tripWeightKg = grp.orders.reduce((sum, o) => sum + (Number(o.totalWeightKg) || 0), 0);
          const tripCartons = grp.orders.reduce((sum, o) => sum + (Number(o.totalCartons || o.totalQty) || 0), 0);
          const tripBonus = grp.orders.reduce((sum, o) => sum + (Number(o.totalBonus) || 0), 0);
          const isTripOverweight = maxCapKg > 0 && tripWeightKg > maxCapKg;

          const tripStatusCounts = { not_yet: 0, prepare: 0, shipped: 0, delivered: 0 };
          grp.orders.forEach((o) => {
            const eff = getEffectiveAssignment(o);
            const norm = normalizeFulfillmentStatus(eff.fulfillmentStatus || o.fulfillmentStatus);
            if (tripStatusCounts[norm] !== undefined) tripStatusCounts[norm]++;
          });

          const distinctStatuses = Object.keys(tripStatusCounts).filter((k) => tripStatusCounts[k] > 0);
          const hasStatusConflict = grp.orders.length > 1 && distinctStatuses.length > 1;

          let currentStepIndex = 0;
          if (!hasStatusConflict && grp.orders.length > 0) {
            const singleStatus = distinctStatuses[0] || 'not_yet';
            const foundIdx = SEQUENTIAL_FULFILLMENT_STEPS.findIndex((s) => s.id === singleStatus);
            currentStepIndex = foundIdx >= 0 ? foundIdx : 0;
          }

          let tripOperationalStatus = 'not_yet';
          if (hasStatusConflict || isTripOverweight) {
            tripOperationalStatus = 'conflict';
          } else {
            tripOperationalStatus = distinctStatuses[0] || 'not_yet';
          }

          const effFirst = grp.orders[0] ? getEffectiveAssignment(grp.orders[0]) : null;
          const driverName = effFirst?.assignedDriverName || grp.orders[0]?.assignedDriverName || veh.driverName || '';
          const repName = effFirst?.assignedDeliveryRepName || grp.orders[0]?.assignedDeliveryRepName || '';

          const tripId =
            grp.orders.find((o) => o.fgWarehouseDispatchId)?.fgWarehouseDispatchId ||
            (grp.loadingOrderNumber !== 'unnumbered'
              ? makeTripDispatchDocId(targetPlanningDate, grp.loadingOrderNumber)
              : '');
          const dispatchDoc = tripId ? dispatchesById[tripId] || null : null;
          const returnDiscrepancy = evaluateReturnDiscrepancySummary(dispatchDoc);

          return {
            tripId,
            loadingDate: targetPlanningDate,
            loadingOrderNumber: grp.loadingOrderNumber,
            orders: grp.orders,
            totalWeightKg: tripWeightKg,
            totalCartons: tripCartons,
            totalBonus: tripBonus,
            isOverweight: isTripOverweight,
            statusCounts: tripStatusCounts,
            distinctStatuses,
            hasStatusConflict,
            currentStepIndex: hasStatusConflict ? null : currentStepIndex,
            currentStep: hasStatusConflict ? null : SEQUENTIAL_FULFILLMENT_STEPS[currentStepIndex],
            tripOperationalStatus,
            driverName,
            repName,
            dispatchDoc,
            dispatchDocNumber: dispatchDoc?.latestDispatchDocNumber || '',
            returnDocNumber: dispatchDoc?.latestReturnDocNumber || '',
            isWarehouseConfirmed: Boolean(dispatchDoc && dispatchDoc.dispatchStatus !== 'cancelled'),
            returnHandshakeStatus: dispatchDoc?.returnHandshakeStatus || 'none',
            returnDiscrepancy
          };
        });

      // 5. Check for simultaneous on-road ('shipped' / Out for Delivery) trips on targetPlanningDate
      // Note: Having Trip #1 in Preparing/Out for Delivery while Trip #2 is Pending/Preparing is normal sequential multi-trip scheduling.
      const onRoadTrips = trips.filter(
        (t) => t.loadingOrderNumber !== 'unnumbered' && (t.currentStep?.id === 'shipped' || (t.statusCounts?.shipped || 0) > 0)
      );

      const anyTripMixedConflict = trips.some((t) => t.hasStatusConflict);
      const anyTripOverweight = trips.some((t) => t.isOverweight);

      // 6. Compile vehicle-level conflicts
      // Case A: A single Trip # has mixed fulfillment statuses on the same day (anyTripMixedConflict)
      // Case B: A single Truck is on 2 or more trips simultaneously Out for Delivery (onRoadTrips.length > 1)
      const conflicts = [];
      if (onRoadTrips.length > 1) {
        const roadTripNums = onRoadTrips.map((t) => `#${t.loadingOrderNumber}`).join(isAr ? ' و ' : ' & ');
        conflicts.push({
          type: 'simultaneous_trips',
          messageAr: `تعارض: الشاحنة خرجت للتوصيل في أكثر من رحلة في نفس الوقت (${roadTripNums})`,
          messageEn: `Conflict: Truck is simultaneously Out for Delivery on multiple trips (${roadTripNums})`
        });
      }

      if (anyTripMixedConflict) {
        conflicts.push({
          type: 'mixed_statuses',
          messageAr: 'حالات تنفيذ متباينة داخل نفس الرحلة — انقر أيقونة التنبيه لإصلاحها يدوياً',
          messageEn: 'Mixed fulfillment statuses within a single Trip # — click alert icon to resolve manually'
        });
      }

      if (anyTripOverweight) {
        const maxTripKg = Math.max(...trips.map((t) => t.totalWeightKg));
        conflicts.push({
          type: 'overweight',
          messageAr: `حمولة زائدة: وزن الرحلة (${(maxTripKg / 1000).toFixed(2)} طن) يتجاوز السعة القصوى (${(maxCapKg / 1000).toFixed(1)} طن)`,
          messageEn: `Overweight: Trip weight (${(maxTripKg / 1000).toFixed(2)} Ton) exceeds truck max capacity (${(maxCapKg / 1000).toFixed(1)} Ton)`
        });
      }

      // 7. Determine overall vehicle operational status aligned with order fulfillment statuses
      let operationalStatus = 'available';
      if (veh.status === 'maintenance') {
        operationalStatus = 'maintenance';
      } else if (veh.status === 'inactive') {
        operationalStatus = 'inactive';
      } else if (conflicts.length > 0) {
        operationalStatus = 'conflict';
      } else if (trips.length === 0) {
        operationalStatus = 'available';
      } else if (trips.some((t) => t.tripOperationalStatus === 'shipped')) {
        operationalStatus = 'shipped';
      } else if (trips.some((t) => t.tripOperationalStatus === 'prepare')) {
        operationalStatus = 'prepare';
      } else if (trips.some((t) => t.tripOperationalStatus === 'not_yet')) {
        operationalStatus = 'not_yet';
      } else {
        operationalStatus = 'delivered';
      }

      // 8. Choose smart default active trip index ("where the default is the current trip/state"):
      // Priority: active conflict -> shipped -> prepare -> not_yet -> latest delivered (last)
      let defaultTripIndex = 0;
      if (trips.length > 1) {
        const conflictIdx = trips.findIndex((t) => t.hasStatusConflict || t.tripOperationalStatus === 'conflict');
        const shippedIdx = trips.findIndex((t) => t.tripOperationalStatus === 'shipped');
        const prepareIdx = trips.findIndex((t) => t.tripOperationalStatus === 'prepare');
        const pendingIdx = trips.findIndex((t) => t.tripOperationalStatus === 'not_yet');
        if (conflictIdx >= 0) defaultTripIndex = conflictIdx;
        else if (shippedIdx >= 0) defaultTripIndex = shippedIdx;
        else if (prepareIdx >= 0) defaultTripIndex = prepareIdx;
        else if (pendingIdx >= 0) defaultTripIndex = pendingIdx;
        else defaultTripIndex = trips.length - 1;
      }

      return {
        vehicle: veh,
        operationalStatus,
        conflicts,
        targetOrders,
        trips,
        defaultTripIndex,
        priorOpenOrders
      };
    });

    // Sort order: conflicts first -> shipped (Out for Delivery) -> prepare (Preparing) -> not_yet (Pending) -> available -> delivered -> maintenance/inactive
    const priorityMap = {
      conflict: 0,
      shipped: 1,
      prepare: 2,
      not_yet: 3,
      available: 4,
      delivered: 5,
      maintenance: 6,
      inactive: 7
    };

    analyzed.sort((a, b) => {
      const pDiff = (priorityMap[a.operationalStatus] ?? 9) - (priorityMap[b.operationalStatus] ?? 9);
      if (pDiff !== 0) return pDiff;
      return String(a.vehicle.code || a.vehicle.id).localeCompare(String(b.vehicle.code || b.vehicle.id));
    });

    return analyzed;
  }, [vehicles, orders, stagedAssignments, targetPlanningDate, truckDispatches]);

  // Handler to execute atomic batch transition for a truck trip (supports partial delivery / returned orders)
  const handleConfirmTruckFulfillmentTransition = async () => {
    if (!truckStatusModal || !truckStatusModal.targetStep || !Array.isArray(truckStatusModal.affectedOrders) || truckStatusModal.affectedOrders.length === 0) return;

    const { truck, targetStep, affectedOrders, selectedOrderIds, unassignOnRevertToPending, loadingOrderNumber } = truckStatusModal;
    const truckLabel = resolveVehicleDisplayName(truck, truck?.plateNumber || (isAr ? 'شاحنة' : 'Truck'));
    const selectedSet = Array.isArray(selectedOrderIds)
      ? new Set(selectedOrderIds)
      : new Set(affectedOrders.map((o) => o.id));

    setTruckStatusModal((prev) => ({ ...prev, isExecuting: true }));

    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      let advancedCount = 0;
      let returnedCount = 0;
      const shippedTripIds = new Set();
      const failedByTripId = {};

      const resolveOrderTripId = (ord) => {
        if (ord?.fgWarehouseDispatchId) return ord.fgWarehouseDispatchId;
        const loNum = Number(loadingOrderNumber || ord?.loadingOrderNumber || 0);
        if (loNum > 0) {
          const loDate = String(ord?.loadingDate || ord?.invoiceDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
          return makeTripDispatchDocId(loDate, loNum);
        }
        return '';
      };

      affectedOrders.forEach((order) => {
        const orderRef = doc(db, 'sales_orders', order.id);
        const oldStatus = order.fulfillmentStatus || 'not_yet';
        const isChecked = selectedSet.has(order.id);
        const existingAudit = Array.isArray(order.auditTrail) ? order.auditTrail : [];
        const orderTripId = resolveOrderTripId(order);

        if (isChecked) {
          advancedCount++;
          const newStatus = targetStep.id;
          const shouldClearAssignment = newStatus === 'not_yet' && Boolean(unassignOnRevertToPending);

          const metadataChanges = [
            { labelAr: 'حالة التنفيذ', labelEn: 'Fulfillment Status', oldValue: oldStatus, newValue: newStatus }
          ];
          if (shouldClearAssignment) {
            metadataChanges.push({
              labelAr: 'إلغاء تسكين الرحلة والشاحنة',
              labelEn: 'Cleared Trip & Truck Assignment',
              oldValue: `Trip #${order.loadingOrderNumber || loadingOrderNumber || '—'} (${truckLabel})`,
              newValue: 'Unassigned'
            });
          }

          const auditEntry = {
            id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            timestamp: nowIso,
            userId: currentUserId,
            userName: currentUserName,
            performedBy: currentUserName,
            performedById: currentUserId,
            action: 'truck_bulk_fulfillment_transition',
            summaryAr: shouldClearAssignment
              ? `إرجاع الطلب إلى "${targetStep.labelAr}" وإلغاء تسكين الشاحنة (${truckLabel})`
              : `تحديث مجمّع لحالة تنفيذ الرحلة #${loadingOrderNumber || order.loadingOrderNumber || ''} (${truckLabel}) إلى "${targetStep.labelAr}"`,
            summaryEn: shouldClearAssignment
              ? `Reverted order to "${targetStep.labelEn}" & cleared truck assignment (${truckLabel})`
              : `Trip #${loadingOrderNumber || order.loadingOrderNumber || ''} bulk transition (${truckLabel}) to "${targetStep.labelEn}"`,
            changes: {
              metadata: metadataChanges
            }
          };

          const updatePayload = {
            fulfillmentStatus: newStatus,
            updatedAt: serverTimestamp(),
            auditTrail: [auditEntry, ...existingAudit]
          };

          if (newStatus === 'shipped') {
            updatePayload.shippedAt = order.shippedAt || nowIso;
            if (orderTripId) shippedTripIds.add(orderTripId);
          }

          if (
            newStatus === 'delivered' &&
            isOrderRetailRoute(order, clients, segments) &&
            order.retailSettlementStatus !== 'settled'
          ) {
            updatePayload.isRetailRouteOrder = true;
            updatePayload.retailSettlementStatus = 'awaiting_settlement';
            metadataChanges.push({
              labelAr: 'حالة تسوية مبيعات التجزئة',
              labelEn: 'Retail Settlement',
              oldValue: order.retailSettlementStatus || 'not_required',
              newValue: 'awaiting_settlement'
            });
          }

          if (shouldClearAssignment) {
            updatePayload.loadingOrderNumber = null;
            updatePayload.assignedVehicleId = '';
            updatePayload.assignedVehicleName = '';
            updatePayload.assignedVehiclePlate = '';
            updatePayload.assignedDriverId = '';
            updatePayload.assignedDriverName = '';
            updatePayload.assignedDeliveryRepId = '';
            updatePayload.assignedDeliveryRepName = '';
            updatePayload.fgWarehouseDispatched = false;
            updatePayload.fgWarehouseDispatchId = '';
          }

          batch.update(orderRef, updatePayload);
        } else {
          // Unchecked order during transition -> Returned / Undelivered -> Revert to 'not_yet' (Pending) & detach from Trip # / Truck
          returnedCount++;
          const wasAlreadyShipped = oldStatus === 'shipped' || Boolean(order.shippedAt);
          if (wasAlreadyShipped && orderTripId) {
            if (!failedByTripId[orderTripId]) failedByTripId[orderTripId] = [];
            failedByTripId[orderTripId].push({
              orderId: order.id,
              serial: order.serial || String(order.id || '').replace(/^SO-/i, ''),
              clientId: order.clientId || '',
              clientName: order.clientName || order.clientNameAr || '—',
              orderType: order.orderType || 'supply',
              lines: (order.lines || []).map((l) => ({
                productId: l.productId || l.finishedProductId || '',
                productCode: l.productCode || l.code || '',
                packagingOptionSuffix: l.packagingOptionSuffix || l.optionSuffix || '',
                packagingRatio: Number(l.packagingRatio || 1),
                qty: Number(l.qty || 0),
                bonus: Number(l.bonus || 0),
              })),
              failedAt: nowIso,
              failedBy: currentUserName,
            });
          }

          const auditEntry = {
            id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            timestamp: nowIso,
            userId: currentUserId,
            userName: currentUserName,
            performedBy: currentUserName,
            performedById: currentUserId,
            action: 'partial_delivery_return',
            summaryAr: `استثناء/ارتجاع الطلب من رحلة #${loadingOrderNumber || order.loadingOrderNumber || ''} (${truckLabel}) وإعادته إلى "قيد الانتظار" لإعادة الجدولة`,
            summaryEn: `Detached returned/undelivered order from Trip #${loadingOrderNumber || order.loadingOrderNumber || ''} (${truckLabel}) & reverted to Pending`,
            changes: {
              metadata: [
                { labelAr: 'حالة التنفيذ', labelEn: 'Fulfillment Status', oldValue: oldStatus, newValue: 'not_yet' },
                {
                  labelAr: 'فصل عن الرحلة والشاحنة',
                  labelEn: 'Detached from Trip & Truck',
                  oldValue: `Trip #${order.loadingOrderNumber || loadingOrderNumber || '—'} (${truckLabel})`,
                  newValue: 'Pending (Unassigned)'
                }
              ]
            }
          };

          batch.update(orderRef, {
            fulfillmentStatus: 'not_yet',
            loadingOrderNumber: null,
            assignedVehicleId: '',
            assignedVehicleName: '',
            assignedVehiclePlate: '',
            assignedDriverId: '',
            assignedDriverName: '',
            assignedDeliveryRepId: '',
            assignedDeliveryRepName: '',
            updatedAt: serverTimestamp(),
            auditTrail: [auditEntry, ...existingAudit]
          });
        }
      });

      // Stamp `hasShippedOut: true` on `truck_dispatches/{tripId}` when moving to 'shipped'
      // and append any undelivered shipped orders to `undeliveredOrders[]` for Expected-to-Return tracking
      const touchedTripIds = new Set([...shippedTripIds, ...Object.keys(failedByTripId)]);
      touchedTripIds.forEach((tid) => {
        const existingTd = truckDispatches.find((d) => d.id === tid) || null;
        const dispRef = doc(db, 'truck_dispatches', tid);
        const tdUpdate = {
          hasShippedOut: true,
          shippedAt: existingTd?.shippedAt || nowIso,
          shippedBy: existingTd?.shippedBy || currentUserName,
        };
        const newlyFailed = failedByTripId[tid] || [];
        if (newlyFailed.length > 0) {
          const prevUndelivered = Array.isArray(existingTd?.undeliveredOrders) ? existingTd.undeliveredOrders : [];
          const byOrderId = {};
          prevUndelivered.forEach((u) => {
            if (u?.orderId) byOrderId[u.orderId] = u;
          });
          newlyFailed.forEach((u) => {
            if (u?.orderId) byOrderId[u.orderId] = u;
          });
          tdUpdate.undeliveredOrders = Object.values(byOrderId);
        }
        batch.set(dispRef, tdUpdate, { merge: true });
      });

      await batch.commit();

      // Sync stagedAssignments in memory
      setStagedAssignments((prev) => {
        const updated = { ...prev };
        affectedOrders.forEach((o) => {
          const isChecked = selectedSet.has(o.id);
          if (!isChecked || (targetStep.id === 'not_yet' && unassignOnRevertToPending)) {
            delete updated[o.id];
          } else if (updated[o.id]) {
            updated[o.id] = {
              ...updated[o.id],
              fulfillmentStatus: targetStep.id
            };
          }
        });
        return updated;
      });

      if (returnedCount > 0) {
        showToast(
          isAr
            ? `تم تحديث ${advancedCount} طلبات إلى "${targetStep.labelAr}" وإرجاع ${returnedCount} طلب(ات) إلى "قيد الانتظار"`
            : `Updated ${advancedCount} order(s) to "${targetStep.labelEn}" & returned ${returnedCount} order(s) to Pending`
        );
      } else {
        showToast(
          isAr
            ? `تم تحديث حالة ${advancedCount} أوامر للرحلة #${loadingOrderNumber || ''} (${truckLabel}) إلى "${targetStep.labelAr}" بنجاح`
            : `Successfully updated ${advancedCount} orders on Trip #${loadingOrderNumber || ''} (${truckLabel}) to "${targetStep.labelEn}"`
        );
      }

      setTruckStatusModal(null);
    } catch (err) {
      console.error('Failed to update truck fulfillment status:', err);
      showToast(isAr ? 'حدث خطأ أثناء تحديث حالة الأوامر' : 'Failed to update orders status', 'error');
      setTruckStatusModal((prev) => ({ ...prev, isExecuting: false }));
    }
  };

  // Check if any staged assignment has missing mandatory fields (LO #, Vehicle, or Driver)
  // Note: Orders at Pending status bypass mandatory fields; non-Pending orders require Trip #, Truck & Driver
  const hasIncompleteStagedOrder = useMemo(() => {
    return Object.entries(stagedAssignments).some(([orderId, eff]) => {
      const originalOrder = orders.find((o) => o.id === orderId);
      const targetStatus = eff.fulfillmentStatus || originalOrder?.fulfillmentStatus || 'not_yet';
      return !validateLoadingPlanOrderMandatoryFields({
        fulfillmentStatus: targetStatus,
        loadingOrderNumber: eff.loadingOrderNumber,
        assignedVehicleId: eff.assignedVehicleId,
        assignedDriverId: eff.assignedDriverId,
      }).valid;
    });
  }, [stagedAssignments, orders]);

  // 1-Click Alignment Handler: Unifies all orders in an LO # on a specific date to the chosen vehicle and driver
  const handleAlignTruckOrders = (compoundKey, loNumber, targetLoadingDate, targetVehicleId, targetDriverId) => {
    const veh = vehicles.find((v) => v.id === targetVehicleId);
    const emp = employees.find((e) => e.id === targetDriverId);

    setStagedAssignments((prev) => {
      const updated = { ...prev };
      orders.forEach((order) => {
        const isClosed = order.fulfillmentStatus === 'delivered' || order.fulfillmentStatus === 'paid';
        if (isClosed && !canModifyClosedOrders) return;

        const eff = getEffectiveAssignment(order);
        const orderDate = eff.loadingDate || targetPlanningDate || todayStr;
        if (Number(eff.loadingOrderNumber) === loNumber && orderDate === targetLoadingDate) {
          updated[order.id] = {
            ...eff,
            loadingDate: targetLoadingDate,
            assignedVehicleId: targetVehicleId,
            assignedVehicleName: veh ? resolveVehicleDisplayName(veh, eff.assignedVehicleName) : eff.assignedVehicleName,
            assignedVehiclePlate: veh ? veh.plateNumber : eff.assignedVehiclePlate,
            assignedDriverId: targetDriverId,
            assignedDriverName: emp ? (emp.nameAr || emp.name) : eff.assignedDriverName
          };
        }
      });
      return updated;
    });

    showToast(
      isAr
        ? `تمت مطابقة وتوحيد بيانات الشاحنة والسائق للرحلة #${loNumber} بتاريخ (${targetLoadingDate}) بنجاح`
        : `Truck and driver aligned for Trip #${loNumber} on ${targetLoadingDate}`
    );
  };

  // Discard all staged changes
  const handleDiscardChanges = () => {
    if (Object.keys(stagedAssignments).length === 0) return;
    if (window.confirm(isAr ? 'هل تريد بالتأكيد إلغاء كافة التعديلات غير المحفوظة في خطة التحميل؟' : 'Discard all unsaved dispatch changes?')) {
      setStagedAssignments({});
      setIsManifestExpanded(false);
      setActiveEditingOrderId(null);
      showToast(isAr ? 'تم إلغاء التعديلات غير المحفوظة' : 'Unsaved changes discarded', 'info');
    }
  };

  // Pre-Save Validations & Open Confirmation Modal
  const handleOpenSaveModal = () => {
    if (hasIncompleteStagedOrder) {
      alert(isAr ? 'لا يمكن حفظ الخطة! يوجد طلبات غير مكتملة البيانات الإلزامية (رقم الرحلة، السيارة، أو السائق). يرجى استكمالها أولاً.' : 'Cannot save plan! Some orders have incomplete mandatory fields (Trip #, Truck, or Driver). Please complete them first.');
      return;
    }

    // Check if any scheduled order (non-pending) is missing a vehicle or driver
    const stagedList = Object.entries(stagedAssignments);
    for (const [orderId, eff] of stagedList) {
      const originalOrder = orders.find((o) => o.id === orderId);
      const targetStatus = eff.fulfillmentStatus || originalOrder?.fulfillmentStatus || 'not_yet';
      if (targetStatus !== 'not_yet' && eff.loadingOrderNumber) {
        if (!eff.assignedVehicleId) {
          alert(isAr ? `رحلة #${eff.loadingOrderNumber} ينقصها اختيار السيارة!` : `Trip #${eff.loadingOrderNumber} is missing a selected truck!`);
          return;
        }
        if (!eff.assignedDriverId) {
          alert(isAr ? `رحلة #${eff.loadingOrderNumber} ينقصها تعيين السائق!` : `Trip #${eff.loadingOrderNumber} is missing an assigned driver!`);
          return;
        }
      }
    }

    // If there are misalignments, prompt the user to confirm intentional discrepancy
    if (totalMisalignments > 0) {
      setIsIntentionalDiscrepancyModalOpen(true);
      return;
    }

    // Directly commit changes — confirmation modal is no longer needed
    handleCommitSavePlan();
  };

  // Commit Save to Firestore via writeBatch
  const handleCommitSavePlan = async () => {
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      let updatedCount = 0;

      for (const [orderId, staged] of Object.entries(stagedAssignments)) {
        const orderRef = doc(db, 'sales_orders', orderId);
        const originalOrder = orders.find((o) => o.id === orderId);

        const updatePayload = {
          loadingOrderNumber: staged.loadingOrderNumber ? Number(staged.loadingOrderNumber) : null,
          assignedVehicleId: staged.assignedVehicleId || '',
          assignedVehicleName: staged.assignedVehicleName || '',
          assignedVehiclePlate: staged.assignedVehiclePlate || '',
          assignedDriverId: staged.assignedDriverId || '',
          assignedDriverName: staged.assignedDriverName || '',
          assignedDeliveryRepId: staged.assignedDeliveryRepId || '',
          assignedDeliveryRepName: staged.assignedDeliveryRepName || '',
          loadingDate: staged.loadingDate !== undefined ? staged.loadingDate : (targetPlanningDate || ''),
          updatedAt: nowIso,
          updatedBy: currentUserName
        };

        // Custom invoice date if staged
        if (staged.invoiceDate) {
          updatePayload.invoiceDate = staged.invoiceDate;
        }

        // Custom fulfillment status if staged (managed directly at card level)
        if (staged.fulfillmentStatus) {
          updatePayload.fulfillmentStatus = staged.fulfillmentStatus;
        }

        // Optional Delivery Sequence (Priority) if staged
        if (staged.deliverySequence !== undefined) {
          updatePayload.deliverySequence =
            Number.isFinite(Number(staged.deliverySequence)) && Number(staged.deliverySequence) > 0
              ? Math.floor(Number(staged.deliverySequence))
              : null;
        }

        // Build rich metadata diffs for Sales Orders Master audit trail
        const metaDiffs = [];
        const oldLo = originalOrder?.loadingOrderNumber ? `#${originalOrder.loadingOrderNumber}` : '—';
        const newLo = staged.loadingOrderNumber ? `#${staged.loadingOrderNumber}` : '—';
        if (oldLo !== newLo) {
          metaDiffs.push({ labelAr: 'أمر التحميل', labelEn: 'Loading Order #', oldValue: oldLo, newValue: newLo });
        }

        const oldTruck = originalOrder?.assignedVehicleName || originalOrder?.assignedVehiclePlate || '—';
        const newTruck = staged.assignedVehicleName || staged.assignedVehiclePlate || '—';
        if (oldTruck !== newTruck) {
          metaDiffs.push({ labelAr: 'الشاحنة المخصصة', labelEn: 'Assigned Truck', oldValue: oldTruck, newValue: newTruck });
        }

        const oldDriver = originalOrder?.assignedDriverName || '—';
        const newDriver = staged.assignedDriverName || '—';
        if (oldDriver !== newDriver) {
          metaDiffs.push({ labelAr: 'السائق المخصص', labelEn: 'Assigned Driver', oldValue: oldDriver, newValue: newDriver });
        }

        const oldRep = originalOrder?.assignedDeliveryRepName || '—';
        const newRep = staged.assignedDeliveryRepName || '—';
        if (oldRep !== newRep) {
          metaDiffs.push({ labelAr: 'مندوب التسليم', labelEn: 'Delivery Rep', oldValue: oldRep, newValue: newRep });
        }

        const oldDate = originalOrder?.loadingDate || '—';
        const newDate = staged.loadingDate || targetPlanningDate || '—';
        if (oldDate !== newDate) {
          metaDiffs.push({ labelAr: 'تاريخ التحميل', labelEn: 'Loading Date', oldValue: oldDate, newValue: newDate });
        }

        const finalStatus = updatePayload.fulfillmentStatus || originalOrder?.fulfillmentStatus || 'not_yet';
        if ((originalOrder?.fulfillmentStatus || 'not_yet') !== finalStatus) {
          metaDiffs.push({ labelAr: 'حالة التنفيذ', labelEn: 'Fulfillment Status', oldValue: originalOrder?.fulfillmentStatus || 'not_yet', newValue: finalStatus });
        }
        if (updatePayload.invoiceDate && updatePayload.invoiceDate !== originalOrder?.invoiceDate) {
          metaDiffs.push({ labelAr: 'تاريخ الفاتورة', labelEn: 'Invoice Date', oldValue: originalOrder?.invoiceDate || '—', newValue: updatePayload.invoiceDate });
        }

        if (staged.deliverySequence !== undefined) {
          const oldSeqVal = Number(originalOrder?.deliverySequence) > 0 ? Math.floor(Number(originalOrder.deliverySequence)) : null;
          const newSeqVal = updatePayload.deliverySequence ?? null;
          if (oldSeqVal !== newSeqVal) {
            metaDiffs.push({
              labelAr: 'أولوية التسليم',
              labelEn: 'Delivery Sequence',
              oldValue: oldSeqVal ? `#${oldSeqVal}` : (isAr ? 'تلقائي' : 'Auto'),
              newValue: newSeqVal ? `#${newSeqVal}` : (isAr ? 'تلقائي' : 'Auto'),
            });
          }
        }

        // Add audit trail entry ONLY if actual metadata changes occurred
        const existingAudit = Array.isArray(originalOrder?.auditTrail) ? originalOrder.auditTrail : [];
        if (metaDiffs.length > 0) {
          const auditEntry = {
            id: `AUD-${Date.now()}-${existingAudit.length + 1}`,
            timestamp: nowIso,
            userId: currentUserId,
            userName: currentUserName,
            performedBy: currentUserName,
            performedById: currentUserId,
            action: 'dispatch_plan_update',
            summaryAr: staged.loadingOrderNumber
              ? `تسكين في أمر تحميل #${staged.loadingOrderNumber} (${staged.loadingDate || targetPlanningDate}) — سيارة: ${staged.assignedVehicleName || staged.assignedVehiclePlate || '—'} — سائق: ${staged.assignedDriverName || '—'}${updatePayload.fulfillmentStatus ? ` — حالة التنفيذ: ${updatePayload.fulfillmentStatus}` : ''}${updatePayload.invoiceDate ? ` — تاريخ الفاتورة: ${updatePayload.invoiceDate}` : ''}`
              : 'إلغاء تسكين الشاحنة وأمر التحميل',
            summaryEn: staged.loadingOrderNumber
              ? `Assigned to LO #${staged.loadingOrderNumber} (${staged.loadingDate || targetPlanningDate}) — Truck: ${staged.assignedVehicleName || staged.assignedVehiclePlate || '—'} — Driver: ${staged.assignedDriverName || '—'}${updatePayload.fulfillmentStatus ? ` — Status: ${updatePayload.fulfillmentStatus}` : ''}${updatePayload.invoiceDate ? ` — Invoice Date: ${updatePayload.invoiceDate}` : ''}`
              : 'Unassigned from truck',
            changes: {
              metadata: metaDiffs
            }
          };
          updatePayload.auditTrail = [auditEntry, ...existingAudit];
        } else {
          updatePayload.auditTrail = existingAudit;
        }

        if (metaDiffs.length > 0) {
          batch.update(orderRef, updatePayload);
          updatedCount++;
        }
      }

      await batch.commit();

      setStagedAssignments({});
      setIsIntentionalDiscrepancyModalOpen(false);
      setIsManifestExpanded(false);
      setActiveEditingOrderId(null);
      showToast(isAr ? `تم حفظ واعتماد خطة التحميل بنجاح (${updatedCount} أمر بيع)` : `Loading Plan saved successfully (${updatedCount} orders)`);
    } catch (err) {
      console.error('Error saving loading plan:', err);
      alert(isAr ? `حدث خطأ أثناء حفظ الخطة: ${err.message}` : `Error saving plan: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const stagedOrdersCount = Object.keys(stagedAssignments).length;

  return (
    <div
      ref={loadingPlanWrapperRef}
      style={fgSidebarPushPx > 0 ? { paddingInlineEnd: `${fgSidebarPushPx}px` } : undefined}
      className="space-y-4 max-w-[1700px] w-full mx-auto px-2 sm:px-4 lg:px-6 pb-32 transition-[padding] duration-300 ease-out"
    >
      {/* Toast Notification */}
      {toastMsg && (
        <div className={`fixed top-4 end-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg border text-xs font-bold transition animate-in fade-in ${
          toastMsg.type === 'error'
            ? 'bg-rose-600 text-white border-rose-700'
            : toastMsg.type === 'info'
            ? 'bg-slate-900 text-white border-slate-800'
            : 'bg-emerald-600 text-white border-emerald-700'
        }`}>
          {toastMsg.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{toastMsg.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. COMPACT TARGET LOADING DATE + ICON-ONLY FILTER & FLEET TOGGLE BUTTONS   */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap lg:flex-nowrap items-stretch gap-2.5">
        <div className="flex-1 min-w-0 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-amber-50/90 via-amber-50/50 to-slate-50 border border-amber-200/90 rounded-3xl p-3 sm:px-4 sm:py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 border border-amber-300/60 flex items-center justify-center shrink-0 shadow-2xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-950">
                  {isAr ? 'تاريخ التحميل المستهدف' : 'Target Loading Date'}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-200/70 text-amber-900 border border-amber-300/80">
                  {targetPlanningDate}
                </span>
              </div>
              <span className="text-[10px] font-medium text-amber-800/80 block leading-tight">
                {isAr ? 'التاريخ المرجعي لتسكين الشاحنات وترتيب التحميل اليومي' : 'Anchor date for truck assignments & daily loading order validation'}
              </span>
            </div>
          </div>

          {/* 2 Quick Assignment Buttons: Today & Tomorrow */}
          <div className="flex items-center gap-1.5 ms-0 sm:ms-2">
            <button
              type="button"
              onClick={() => setTargetPlanningDate(todayStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                targetPlanningDate === todayStr
                  ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                  : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-50'
              }`}
            >
              {isAr ? 'اليوم' : 'Today'}
            </button>

            <button
              type="button"
              onClick={() => setTargetPlanningDate(tomorrowStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                targetPlanningDate === tomorrowStr
                  ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                  : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-50'
              }`}
            >
              {isAr ? 'غداً' : 'Tomorrow'}
            </button>

            {/* Date Input */}
            <input
              type="date"
              value={targetPlanningDate}
              onChange={(e) => setTargetPlanningDate(e.target.value)}
              className="py-1 px-2.5 bg-white border border-amber-300 rounded-xl font-mono text-xs font-bold text-amber-950 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
        </div>

        {/* Current Active Date Badge */}
        <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-900 bg-amber-100/70 border border-amber-200/80 px-3 py-1 rounded-xl">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>{targetPlanningDate}</span>
          {targetPlanningDate === todayStr && (
            <span className="text-[10px] font-sans font-extrabold text-amber-700">({isAr ? 'اليوم' : 'Today'})</span>
          )}
          {targetPlanningDate === tomorrowStr && (
            <span className="text-[10px] font-sans font-extrabold text-amber-700">({isAr ? 'غداً' : 'Tomorrow'})</span>
          )}
        </div>
        </div>

        {/* Two Icon-Only Toggles: 1) Filter Bar  2) Trucks Fleet Operational Dashboard */}
        <div className="flex items-center gap-2 shrink-0">
          {(() => {
            const lpFilterCount =
              (fulfillmentFilter !== 'all' ? 1 : 0) +
              (searchTerm.trim() ? 1 : 0) +
              (confirmedOnly ? 1 : 0) +
              (groupBy !== 'status_hierarchy' ? 1 : 0) +
              (sortBy !== 'trip_asc' ? 1 : 0);
            const fleetConflictsCount = truckFleetAnalysis.filter((t) => t.operationalStatus === 'conflict').length;
            return (
              <>
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen((prev) => !prev)}
                  title={isFiltersOpen ? (isAr ? 'إخفاء شريط الفلاتر' : 'Hide Filter Bar') : (isAr ? 'إظهار شريط الفلاتر' : 'Show Filter Bar')}
                  aria-label={isFiltersOpen ? (isAr ? 'إخفاء شريط الفلاتر' : 'Hide Filter Bar') : (isAr ? 'إظهار شريط الفلاتر' : 'Show Filter Bar')}
                  aria-expanded={isFiltersOpen}
                  className={`relative w-12 min-h-[48px] rounded-2xl border flex items-center justify-center transition cursor-pointer shadow-2xs ${
                    isFiltersOpen || lpFilterCount > 0
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  <Filter className={`w-5 h-5 ${isFiltersOpen || lpFilterCount > 0 ? 'text-emerald-400' : 'text-slate-600'}`} />
                  {lpFilterCount > 0 && (
                    <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white font-mono text-[10px] font-black flex items-center justify-center shadow-xs">
                      {lpFilterCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsTrucksDashboardOpen((prev) => !prev)}
                  title={isTrucksDashboardOpen ? (isAr ? 'إخفاء لوحة شاحنات الأسطول' : 'Hide Trucks Fleet Dashboard') : (isAr ? 'عرض لوحة شاحنات الأسطول' : 'Show Trucks Fleet Dashboard')}
                  aria-label={isTrucksDashboardOpen ? (isAr ? 'إخفاء لوحة شاحنات الأسطول' : 'Hide Trucks Fleet Dashboard') : (isAr ? 'عرض لوحة شاحنات الأسطول' : 'Show Trucks Fleet Dashboard')}
                  aria-expanded={isTrucksDashboardOpen}
                  className={`relative w-12 min-h-[48px] rounded-2xl border flex items-center justify-center transition cursor-pointer shadow-2xs ${
                    isTrucksDashboardOpen
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-white hover:bg-indigo-50 text-indigo-700 border-slate-200 hover:border-indigo-200'
                  }`}
                >
                  <Truck className="w-5 h-5 rtl:-scale-x-100" />
                  {fleetConflictsCount > 0 && (
                    <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white font-mono text-[10px] font-black flex items-center justify-center shadow-xs animate-pulse">
                      {fleetConflictsCount}
                    </span>
                  )}
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ORDERS SCOPE & FILTERS RIBBON (Hidden by Default Until Toggled)        */}
      {/* ========================================================================= */}
      {isFiltersOpen && (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5 animate-in fade-in duration-150">
        {/* Row 1: Operational Status Quick Filter & Target Loading Date Scope Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-600 font-bold text-xs flex items-center gap-1.5 me-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>{isAr ? 'تصفية الحالة:' : 'Status Filter:'}</span>
            </span>

            {/* Quick Status Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', labelAr: 'الكل (التسلسل التشغيلي)', labelEn: 'All (Operational Scope)' },
                { id: 'prepare', labelAr: 'جاري التجهيز', labelEn: 'Preparing' },
                { id: 'not_yet', labelAr: 'قيد الانتظار', labelEn: 'Pending' },
                { id: 'shipped', labelAr: 'جاري التوصيل', labelEn: 'Out for Delivery' },
                { id: 'delivered', labelAr: 'تم التسليم', labelEn: 'Delivered' }
              ].map((st) => {
                const stCfg = FULFILLMENT_CONFIG_MAP[st.id];
                const StIcon = stCfg?.icon;
                const isActive = fulfillmentFilter === st.id;
                const pillClasses = st.id === 'all'
                  ? (isActive
                      ? 'bg-slate-800 text-white border-slate-900 shadow-xs ring-2 ring-slate-500/20'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100')
                  : (isActive ? stCfg.filterActiveClasses : stCfg.filterIdleClasses);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setFulfillmentFilter(st.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${pillClasses}`}
                  >
                    {StIcon && <StIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : stCfg.iconColor}`} />}
                    <span>{isAr ? st.labelAr : st.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scope Summary Badge */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-bold">
              {isAr ? `تاريخ التحميل المستهدف: ${targetPlanningDate}` : `Target Loading Date: ${targetPlanningDate}`}
            </span>
            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl font-mono text-[11px] font-bold text-slate-700">
              <span>{filteredOrders.length} {isAr ? 'أمر' : 'orders'}</span>
              <span className="text-slate-300">•</span>
              <span>
                {filteredOrders.reduce((s, o) => s + (Number(o.totalCartons || o.totalQty) || 0), 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-700 font-black">
                {(filteredOrders.reduce((s, o) => s + (Number(o.totalWeightKg) || 0), 0) / 1000).toFixed(1)} {isAr ? 'طن' : 'Ton'}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Search, Quick Chips, Grouping & Sorting */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
          {/* Search Box */}
          <div className="relative lg:col-span-5">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث بالمسلسل (#0001)، العميل، الفرع، المنطقة...' : 'Search by serial (#0001), client, branch...'}
              className="w-full ps-9 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 lg:col-span-3 flex-wrap">
            <button
              type="button"
              onClick={() => setConfirmedOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                confirmedOnly
                  ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>{isAr ? 'مؤكد فقط' : 'Confirmed Only'}</span>
            </button>
          </div>

          {/* Group By Selector */}
          <div className="lg:col-span-2">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="status_hierarchy">{isAr ? 'تجميع: التسلسل التشغيلي' : 'Group: Operational Hierarchy'}</option>
              <option value="loadingDate">{isAr ? 'تجميع: تاريخ التحميل' : 'Group: Loading Date'}</option>
              <option value="loadingOrder">{isAr ? 'تجميع: الرحلة / الشاحنة' : 'Group: Trip / Truck'}</option>
              <option value="region">{isAr ? 'تجميع: المنطقة' : 'Group: Region'}</option>
              <option value="client">{isAr ? 'تجميع: العميل' : 'Group: Client'}</option>
              <option value="fulfillmentStatus">{isAr ? 'تجميع: حالة التنفيذ' : 'Group: Status'}</option>
              <option value="none">{isAr ? 'تجميع: بدون' : 'Group: None'}</option>
            </select>
          </div>

          {/* Sort By Selector */}
          <div className="lg:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="trip_asc">{isAr ? 'ترتيب: التاريخ ثم رقم الرحلة' : 'Sort: Date & Trip #'}</option>
              <option value="weight_desc">{isAr ? 'ترتيب: الأثقل وزناً' : 'Sort: Heaviest'}</option>
              <option value="weight_asc">{isAr ? 'ترتيب: الأخف وزناً' : 'Sort: Lightest'}</option>
              <option value="cartons_desc">{isAr ? 'ترتيب: الأكثر كراتين' : 'Sort: Most Cartons'}</option>
              <option value="serial_asc">{isAr ? 'ترتيب: رقم الطلب' : 'Sort: Serial #'}</option>
              <option value="client_asc">{isAr ? 'ترتيب: اسم العميل' : 'Sort: Client Name'}</option>
            </select>
          </div>
        </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TRUCKS FLEET OPERATIONAL DASHBOARD (Hidden Until Toggled; Shows Expanded) */}
      {/* ========================================================================= */}
      {isTrucksDashboardOpen && (
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-4 sm:p-5 animate-in fade-in duration-150">
        {/* Dashboard Header Bar */}
        <div
          onClick={() => setIsTrucksDashboardOpen(false)}
          className="flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition pb-3 border-b border-slate-100"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsTrucksDashboardOpen(false);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-200/80 flex items-center justify-center shrink-0 shadow-2xs">
              <Truck className="w-5 h-5 rtl:-scale-x-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900">
                  {isAr ? 'لوحة شاحنات الأسطول وحالة التشغيل' : 'Trucks Fleet Operational Dashboard'}
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {truckFleetAnalysis.length} {isAr ? 'شاحنة' : 'trucks'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {isAr
                  ? `متابعة حالة جاهزية الشاحنات وكشف التعارضات التشغيلية ليوم ${targetPlanningDate}`
                  : `Monitor fleet readiness and detect dispatch conflicts for ${targetPlanningDate}`}
              </p>
            </div>
          </div>

          {/* Quick Metrics Badges & Collapse Toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Out for Delivery */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-sky-50 text-sky-900 border border-sky-200/90 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
              <span>{isAr ? 'جاري التوصيل:' : 'Out for Delivery:'}</span>
              <span className="font-mono font-black">{truckFleetAnalysis.filter((t) => t.operationalStatus === 'shipped').length}</span>
            </span>

            {/* Preparing */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{isAr ? 'جاري التجهيز:' : 'Preparing:'}</span>
              <span className="font-mono font-black">{truckFleetAnalysis.filter((t) => t.operationalStatus === 'prepare').length}</span>
            </span>

            {/* Pending */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300/80 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-slate-500"></span>
              <span>{isAr ? 'قيد الانتظار:' : 'Pending:'}</span>
              <span className="font-mono font-black">{truckFleetAnalysis.filter((t) => t.operationalStatus === 'not_yet').length}</span>
            </span>

            {/* Delivered */}
            {truckFleetAnalysis.filter((t) => t.operationalStatus === 'delivered').length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>{isAr ? 'تم التسليم:' : 'Delivered:'}</span>
                <span className="font-mono font-black">{truckFleetAnalysis.filter((t) => t.operationalStatus === 'delivered').length}</span>
              </span>
            )}

            {/* Available (no trips assigned on target date) */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
              <span>{isAr ? 'متاحة:' : 'Available:'}</span>
              <span className="font-mono font-black">{truckFleetAnalysis.filter((t) => t.operationalStatus === 'available').length}</span>
            </span>

            {/* Conflicts Alert Pill */}
            {truckFleetAnalysis.filter((t) => t.operationalStatus === 'conflict').length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 text-rose-800 border border-rose-300 ring-2 ring-rose-500/20 shadow-2xs animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>{isAr ? 'تعارض تشغيلي:' : 'Conflicts:'}</span>
                <span className="font-mono">{truckFleetAnalysis.filter((t) => t.operationalStatus === 'conflict').length}</span>
              </span>
            )}

            {/* In Maintenance */}
            {truckFleetAnalysis.filter((t) => t.operationalStatus === 'maintenance').length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                <Wrench className="w-3 h-3 text-purple-600" />
                <span>{isAr ? 'صيانة:' : 'Maint:'}</span>
                <span className="font-mono">{truckFleetAnalysis.filter((t) => t.operationalStatus === 'maintenance').length}</span>
              </span>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsTrucksDashboardOpen((prev) => !prev);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer ms-1"
              title={isTrucksDashboardOpen ? (isAr ? 'طي اللوحة' : 'Collapse') : (isAr ? 'توسيع اللوحة' : 'Expand')}
            >
              {isTrucksDashboardOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Scorecards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 pt-3">
            {truckFleetAnalysis.length === 0 ? (
              <div className="col-span-full p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                <Truck className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-600">{isAr ? 'لا توجد شاحنات مسجلة في شاشات المركبات' : 'No vehicles configured'}</p>
              </div>
            ) : (
              truckFleetAnalysis.map((truckData) => (
                <CompactTruckCard
                  key={truckData.vehicle.id}
                  truckData={truckData}
                  allOrders={orders}
                  targetPlanningDate={targetPlanningDate}
                  selectedTripState={selectedTripByVehicle[truckData.vehicle.id]}
                  onSelectTrip={handleSelectVehicleTrip}
                  onFilterConflict={handleFilterConflictByLO}
                  onOpenSequenceModal={handleOpenSequenceModal}
                  onNavigateToTruckDispatch={handleNavigateToTruckDispatch}
                  onOpenTransitionModal={(veh, step, trip) =>
                    setTruckStatusModal({
                      isOpen: true,
                      truck: veh,
                      targetStep: step,
                      affectedOrders: trip.orders,
                      selectedOrderIds: trip.orders.map((o) => o.id),
                      unassignOnRevertToPending: false,
                      loadingOrderNumber: trip.loadingOrderNumber,
                      isExecuting: false
                    })
                  }
                  isAr={isAr}
                />
              ))
            )}
          </div>
      </div>
      )}

      {/* CONFLICT LO # MANUAL FIX FILTER BANNER & SCROLL ANCHOR */}
      <div ref={ordersListRef} className="scroll-mt-4">
        {loFilter && (
          <div className="mb-3 px-4 py-2.5 rounded-2xl bg-rose-50 border border-rose-300 shadow-xs flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-300 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-rose-900 flex items-center gap-1.5 flex-wrap">
                  <span>{isAr ? 'وضع معالجة التعارض:' : 'Conflict Fix Filter Active:'}</span>
                  <span className="font-mono px-2 py-0.5 rounded-md bg-white border border-rose-300 text-rose-800">
                    {isAr ? `رحلة #${loFilter.loNumber}` : `Trip #${loFilter.loNumber}`}
                  </span>
                  {loFilter.vehicleName && (
                    <span className="text-xs text-rose-900 font-black">
                      ({loFilter.vehicleName})
                    </span>
                  )}
                  {loFilter.vehiclePlate && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-rose-200 font-mono text-[10px] font-bold text-rose-800">
                      <span>{loFilter.vehiclePlate}</span>
                      <CopyButton text={loFilter.vehiclePlate} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-rose-700 font-medium mt-0.5">
                  {isAr
                    ? 'يتم عرض كافة الطلبات المرتبطة بهذه الرحلة (بجميع حالات التنفيذ) لتتمكن من توحيد حالتها يدوياً.'
                    : 'Showing all orders linked to this Trip # across all fulfillment statuses for manual resolution.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLoFilter(null)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-black transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>{isAr ? 'إلغاء تصفية التعارض' : 'Clear Conflict Filter'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ORDERS CARDS LIST */}
      {loading ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200">
          <PeacockLoader size="xl" text={isAr ? 'جاري تحميل أوامر خطة التحميل...' : 'Loading dispatch orders...'} />
        </div>
      ) : sortedOrders.length === 0 ? (
        <div className="p-16 text-center text-slate-400 space-y-2 bg-white rounded-3xl border border-slate-200">
          <Truck className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-600">
            {isAr ? 'لا توجد أوامر بيع مطابقة لمعايير البحث والنطاق المحدد' : 'No sales orders match the active criteria'}
          </p>
          <p className="text-xs text-slate-400">
            {isAr ? 'جرّب توسيع نطاق التاريخ أو إلغاء تفعيل الفلاتر' : 'Try expanding the date scope or clearing active filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedOrders.map((group) => {
            const statusCfg = group.statusKey ? (FULFILLMENT_CONFIG_MAP[group.statusKey] || FULFILLMENT_CONFIG_MAP.not_yet) : null;
            const GroupStatusIcon = statusCfg?.icon || Layers;
            const isTargetDateGroup = group.groupKey === targetPlanningDate;
            const bannerClasses = statusCfg
              ? statusCfg.groupBannerClasses
              : isTargetDateGroup
              ? 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-amber-100/80 via-amber-50/70 to-white border-amber-300 border-s-[5px] border-s-amber-500 text-amber-950'
              : 'ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-slate-100/95 via-slate-50 to-white border-slate-300 border-s-[5px] border-s-indigo-500 text-slate-900';
            const iconBoxClasses = statusCfg
              ? statusCfg.groupIconClasses
              : isTargetDateGroup
              ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
              : 'bg-indigo-600 text-white border-indigo-700 shadow-2xs';
            const countPillClasses = statusCfg
              ? statusCfg.groupCountClasses
              : isTargetDateGroup
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : 'bg-slate-200/80 text-slate-800 border-slate-300';

            return (
            <div key={group.groupKey} className="space-y-3">
              {/* Optional Group Header Banner */}
              {groupBy !== 'none' && (
                <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl border shadow-2xs flex-wrap gap-2.5 ${bannerClasses}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${iconBoxClasses}`}>
                      <GroupStatusIcon className={`w-4 h-4 ${group.statusKey === 'shipped' ? 'rtl:-scale-x-100' : ''}`} />
                    </span>
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h3 className="font-black text-sm tracking-tight truncate">{group.groupLabel}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-mono font-black border ${countPillClasses}`}>
                        {group.items.length} {isAr ? 'أوامر' : 'orders'}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs font-mono font-bold flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded-xl bg-white/90 border border-slate-200/90 text-slate-800 shadow-2xs">
                      {group.items.reduce((s, o) => s + (Number(o.totalCartons || o.totalQty) || 0), 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                    </span>
                    <span className="px-2.5 py-1 rounded-xl bg-white/90 border border-emerald-200 text-emerald-800 font-black shadow-2xs">
                      {(group.items.reduce((s, o) => s + (Number(o.totalWeightKg) || 0), 0) / 1000).toFixed(1)} {isAr ? 'طن' : 'Ton'}
                    </span>
                  </div>
                </div>
              )}

              {/* Cards Grid */}
              <div className="grid grid-cols-1 gap-3">
                {group.items.map((order) => {
                  const eff = getEffectiveAssignment(order);
                  const isStaged = Boolean(stagedAssignments[order.id]);
                  const isEditing = activeEditingOrderId === order.id;
                  const isAssigned = Boolean(eff.loadingOrderNumber && eff.assignedVehicleId);

                  const orderSerial = resolveOrderSerial(order, orders);
                  const orderTypeObj = ORDER_TYPES.find((t) => t.id === order.orderType) || ORDER_TYPES[0];

                  const clientObj = clients.find((c) => c.id === order.clientId) || null;
                  const branchCount = (clientObj?.branches || []).length;
                  const showBranchName = branchCount > 1 && order.branchName;
                  const targetBranch = (clientObj?.branches || []).find((b) => 
                    (b.id && order.branchId && b.id === order.branchId) ||
                    (b.name && order.branchName && (b.name === order.branchName || b.nameAr === order.branchName)) ||
                    (b.nameAr && order.branchName && b.nameAr === order.branchName)
                  ) || clientObj?.branches?.[0] || null;

                  // Location detection: accurate GPS vs fallback address/name search
                  const locInfo = resolveLocationInfo(targetBranch, clientObj, order);

                  // Operational Profile & Notes
                  const opProfile = resolveClientOperationalProfile(targetBranch, clientObj, isAr);
                  const workingHoursDisplay = opProfile.workingHoursDisplay;
                  const holidaysList = opProfile.holidaysList;
                  const holidaysDisplay = opProfile.holidaysDisplay;
                  const clientNotes = opProfile.combinedNotes;

                  // Segment resolution
                  const rawSegKey = clientObj?.segmentId || clientObj?.segment || order?.clientSegmentId || order?.segmentId || order?.segment || null;
                  const segObj = rawSegKey ? (segmentMap[rawSegKey] || segments.find((s) => s.id === rawSegKey || s.nameAr === rawSegKey || s.nameEn === rawSegKey || s.code === rawSegKey)) : null;
                  const SegIcon = (segObj?.icon && SEGMENT_ICON_MAP[segObj.icon]) ? SEGMENT_ICON_MAP[segObj.icon] : Building2;
                  const segColor = segObj?.color || '#2563eb';

                  // Driver match indicator & Standardized Vehicle Name
                  const selectedVehicle = vehicles.find((v) => v.id === eff.assignedVehicleId);
                  const isDefaultDriver = selectedVehicle?.driverUserId && selectedVehicle.driverUserId === eff.assignedDriverId;
                  const truckDisplayName = resolveVehicleDisplayName(selectedVehicle, eff.assignedVehicleName);

                  // Closed / Delivered status lock check
                  const isClosedOrder = order.fulfillmentStatus === 'delivered' || order.fulfillmentStatus === 'paid';
                  const isOrderLocked = isClosedOrder && !canModifyClosedOrders;

                  // Fulfillment Status resolution & configuration matching SalesOrdersMaster
                  const currentFulfillmentStatus = eff.fulfillmentStatus || order.fulfillmentStatus || 'not_yet';
                  const isPendingStatus = currentFulfillmentStatus === 'not_yet';
                  const currentStatusConfig = FULFILLMENT_CONFIG_MAP[currentFulfillmentStatus] || FULFILLMENT_CONFIG_MAP.not_yet;
                  const currentStepConfig = currentStatusConfig;
                  const CurrentStatusIcon = currentStatusConfig.icon;

                  // Mandatory fields check for assignment: only required if moving forward from Pending; pending status itself is unplanned
                  const isMandatoryFilled = isPendingStatus || Boolean(
                    eff.loadingOrderNumber &&
                    Number(eff.loadingOrderNumber) > 0 &&
                    eff.assignedVehicleId &&
                    eff.assignedDriverId
                  );

                  return (
                    <div
                      key={order.id}
                      id={`loading-plan-card-${order.id}`}
                      data-comment-doc={order.id}
                      className={`rounded-3xl border transition-all duration-300 shadow-xs overflow-hidden ${currentStatusConfig.cardAccentClasses} ${
                        isOrderLocked
                          ? 'border-slate-200/90 opacity-85'
                          : isEditing
                          ? 'border-indigo-400 ring-2 ring-indigo-500/20 shadow-md'
                          : isStaged
                          ? 'border-emerald-400 ring-2 ring-emerald-500/20 shadow-md'
                          : 'border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Flex Container with Animated 80/20 Width Transitions */}
                      <div className="flex flex-col md:flex-row items-stretch transition-all duration-700 ease-in-out">
                        {/* ========================================================================= */}
                        {/* CASE 1: IS EDITING (Assignment Panel takes 80%, Order Data takes 20%)     */}
                        {/* ========================================================================= */}
                        {isEditing ? (
                          <>
                            {/* Compressed Order Details (20% width) */}
                            <div className="w-full md:w-[20%] p-3.5 bg-slate-50/90 border-e border-slate-200/80 flex flex-col justify-between space-y-2 shrink-0 text-start select-none transition-all duration-700 ease-in-out">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNavigateToSalesOrder(order);
                                      }}
                                      className="font-mono text-xs font-black text-slate-800 hover:text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer transition"
                                      title={isAr ? 'عرض تفاصيل أمر البيع في تبويب أوامر البيع' : 'View order details in Sales Orders'}
                                    >
                                      <span>#{orderSerial}</span>
                                      <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0 rtl:-scale-x-100" />
                                    </button>
                                    <RowCommentButton
                                      docId={order.id}
                                      docNumber={orderSerial ? `SO-${orderSerial}` : (order.id || 'Order')}
                                      tab="loading_plan"
                                      module="sales"
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400 font-mono">
                                    {order.invoiceDate || '—'}
                                  </span>
                                </div>

                                {(order.splitParentId || (order.hasPartialRejection && Number(order.returnedCartons || 0) > 0)) && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {order.splitParentId && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                                        <GitFork className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                        <span>{isAr ? `جزء ${order.splitIndex}/${order.splitTotal}` : `Split ${order.splitIndex}/${order.splitTotal}`}</span>
                                      </span>
                                    )}
                                    {order.hasPartialRejection && Number(order.returnedCartons || 0) > 0 && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-800 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                        <PackageMinus className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                        <span>{isAr ? `مرتجع: -${Number(order.returnedCartons)}` : `Ret: -${Number(order.returnedCartons)}`}</span>
                                      </span>
                                    )}
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (order.clientId) {
                                      setClientProfileTarget({
                                        client: clientObj,
                                        clientId: order.clientId,
                                        branchId: order.branchId || '',
                                        branchName: order.branchName || '',
                                      });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs font-black shadow-2xs max-w-full truncate text-start cursor-pointer hover:opacity-90 transition"
                                  style={{
                                    backgroundColor: segColor,
                                    color: getContrastTextColor(segColor)
                                  }}
                                  title={isAr ? `${order.clientName || '—'} — انقر لعرض ملف العميل` : `${order.clientName || '—'} — Click for Client Profile`}
                                >
                                  <span className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 bg-white/95 shadow-2xs overflow-hidden">
                                    {clientObj?.logo ? (
                                      <img
                                        src={clientObj.logo}
                                        alt=""
                                        className="w-full h-full object-contain p-0.5 rounded-md"
                                      />
                                    ) : (
                                      <SegIcon className="w-2.5 h-2.5 shrink-0" style={{ color: segColor }} />
                                    )}
                                  </span>
                                  <span className="truncate leading-tight">{order.clientName || '—'}</span>
                                </button>

                                {showBranchName && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (order.clientId) {
                                        setClientProfileTarget({
                                          client: clientObj,
                                          clientId: order.clientId,
                                          branchId: order.branchId || '',
                                          branchName: order.branchName || '',
                                        });
                                      }
                                    }}
                                    className="text-[10px] font-bold text-slate-500 hover:text-indigo-700 hover:underline truncate text-start block cursor-pointer"
                                    title={order.branchName}
                                  >
                                    {order.branchName}
                                  </button>
                                )}

                                {order.region && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] bg-slate-200/70 text-slate-700 px-1.5 py-0.2 rounded font-semibold truncate max-w-full">
                                    <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span className="truncate">{order.region}</span>
                                  </span>
                                )}

                                {workingHoursDisplay && (
                                  <div className="text-[10px] text-slate-600 font-mono flex items-center gap-1 truncate" title={workingHoursDisplay}>
                                    <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span className="truncate">{workingHoursDisplay}</span>
                                  </div>
                                )}

                                {/* Purchase Orders with Copy Buttons */}
                                {order.poTawoos && (
                                  <div className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-slate-200/70 text-slate-800 px-1.5 py-0.5 rounded border border-slate-300">
                                    <span className="text-[8px] text-slate-500 font-sans">{isAr ? 'طاووس:' : 'TW:'}</span>
                                    <span>{order.poTawoos}</span>
                                    <CopyButton text={order.poTawoos} title={isAr ? 'نسخ أمر شراء طاووس' : 'Copy Tawoos PO #'} isAr={isAr} />
                                  </div>
                                )}
                                {order.poPrivateLabel && (
                                  <div className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-purple-100/70 text-purple-900 px-1.5 py-0.5 rounded border border-purple-200">
                                    <span className="text-[8px] text-purple-600 font-sans">{isAr ? 'علامة:' : 'PL:'}</span>
                                    <span>{order.poPrivateLabel}</span>
                                    <CopyButton text={order.poPrivateLabel} title={isAr ? 'نسخ أمر شراء العلامة' : 'Copy Private Label PO #'} isAr={isAr} />
                                  </div>
                                )}

                                {clientNotes && (
                                  <div className="text-[9px] text-amber-900 bg-amber-50/90 p-1 rounded border border-amber-200 line-clamp-2" title={clientNotes}>
                                    <span className="font-bold">{isAr ? 'ملاحظة:' : 'Note:'}</span> {clientNotes}
                                  </div>
                                )}
                              </div>

                              <div className="pt-2 border-t border-slate-200/70">
                                <OrderCartonsAvailabilityChip
                                  order={order}
                                  availability={orderAvailabilityMap[order.id]}
                                  onClick={() => setSelectedOrderForProducts(order)}
                                  isAr={isAr}
                                />
                              </div>
                            </div>

                            {/* Ultra-Compact Assignment Form Panel (80% width) - Header and Footer removed */}
                            <div className="w-full md:w-[80%] p-3 sm:p-4 bg-white flex flex-col justify-between gap-3 text-start transition-all duration-700 ease-out origin-right rtl:origin-left animate-panel-expand">
                              {/* 1. Sequential Fulfillment Status Stepper (Pending -> Preparing -> Out for Delivery -> Delivered) */}
                              <div className="w-full p-2 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-1.5">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                    <Layers className="w-3 h-3 text-slate-400" />
                                    <span>{isAr ? 'مراحل تنفيذ وتسليم الطلب (بالترتيب التسلسلي):' : 'Delivery Fulfillment Progression:'}</span>
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-slate-400">
                                    {Math.min(4, Math.max(1, (SEQUENTIAL_FULFILLMENT_STEPS.findIndex((s) => s.id === (eff.fulfillmentStatus || order.fulfillmentStatus || 'not_yet')) + 1) || 1))} / 4
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                  {SEQUENTIAL_FULFILLMENT_STEPS.map((step, idx) => {
                                    const StepIcon = step.icon;
                                    const currentStatusId = eff.fulfillmentStatus || order.fulfillmentStatus || 'not_yet';
                                    const currentIdx = Math.max(0, SEQUENTIAL_FULFILLMENT_STEPS.findIndex((s) => s.id === currentStatusId));
                                    const isCurrent = idx === currentIdx;
                                    const isPast = idx < currentIdx;
                                    const isImmediatePrev = idx === currentIdx - 1;
                                    const isNext = idx === currentIdx + 1;

                                    let btnStyle = '';
                                    let iconColor = '';
                                    let badgeText = '';

                                    if (isCurrent) {
                                      btnStyle = `${step.activeClasses} shadow-xs cursor-default`;
                                      iconColor = 'text-white';
                                      badgeText = isAr ? 'الحالية' : 'Current';
                                    } else if (isPast) {
                                      // GOING BACKWARD BYPASSES VERIFICATIONS! All past steps directly clickable to revert!
                                      btnStyle = 'bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-800 border-slate-200 hover:border-amber-300 cursor-pointer shadow-2xs group/prev';
                                      iconColor = step.color === 'amber' ? 'text-amber-600' : step.color === 'emerald' ? 'text-emerald-600' : step.color === 'teal' ? 'text-teal-600' : 'text-slate-500';
                                      badgeText = isAr ? 'تراجع' : 'Revert';
                                    } else if (isNext) {
                                      btnStyle = step.color === 'amber'
                                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-400/40 cursor-pointer shadow-2xs animate-pulse'
                                        : step.color === 'emerald'
                                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400/40 cursor-pointer shadow-2xs animate-pulse'
                                        : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-300 ring-1 ring-teal-400/40 cursor-pointer shadow-2xs animate-pulse';
                                      iconColor = step.color === 'amber' ? 'text-amber-600' : step.color === 'emerald' ? 'text-emerald-600' : 'text-teal-600';
                                      badgeText = isAr ? 'التالي' : 'Next';
                                    } else {
                                      btnStyle = canModifyClosedOrders || isGeneralAdmin
                                        ? 'bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 border-slate-200 cursor-pointer'
                                        : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed opacity-50';
                                      iconColor = 'text-slate-300';
                                      badgeText = '';
                                    }

                                    return (
                                      <button
                                        key={step.id}
                                        type="button"
                                        onClick={() => handleStepStatusClick(order, step, currentIdx, idx)}
                                        className={`flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all select-none ${btnStyle}`}
                                        title={
                                          isCurrent
                                            ? (isAr ? 'الحالة الحالية' : 'Current status')
                                            : isImmediatePrev
                                            ? (isAr ? 'انقر للرجوع خطوة واحدة إلى هذه الحالة' : 'Click to revert 1 step to this status')
                                            : isNext
                                            ? (isAr ? 'انقر للترقية خطوة واحدة إلى هذه الحالة' : 'Click to advance 1 step to this status')
                                            : isPast
                                            ? (isAr ? 'حالة مكتملة' : 'Completed step')
                                            : (isAr ? 'غير متاح حالياً (يلزم إكمال الخطوات بالترتيب)' : 'Sequential step locked')
                                        }
                                      >
                                        <div className="flex items-center gap-1.5 truncate">
                                          <StepIcon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                                          <span className="truncate">{isAr ? step.labelAr : step.labelEn}</span>
                                        </div>
                                        {badgeText && (
                                          <span className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold shrink-0 ${
                                            isCurrent ? 'bg-white/20 text-white' : 'bg-white/80 text-slate-600'
                                          }`}>
                                            {badgeText}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 2. Fields Grid & Action Buttons */}
                              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="w-full flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 text-xs">
                                  {/* 1. Trip Number */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                      {isAr ? 'رقم الرحلة:' : 'Trip #:'} *
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={eff.loadingOrderNumber}
                                      onChange={(e) => handleStageChange(order.id, 'loadingOrderNumber', e.target.value)}
                                      placeholder={isAr ? 'مثال: 1' : 'e.g. 1'}
                                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>

                                  {/* 2. Loading Date */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                      {isAr ? 'تاريخ التحميل:' : 'Date:'} *
                                    </label>
                                    <input
                                      type="date"
                                      value={eff.loadingDate || targetPlanningDate}
                                      onChange={(e) => handleStageChange(order.id, 'loadingDate', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>

                                  {/* 3. Invoice Date (Editable if not delivered, or admin) */}
                                  <div>
                                    <div className="flex items-center justify-between mb-0.5">
                                      <label className="text-[10px] font-bold text-slate-500">
                                        {isAr ? 'تاريخ الفاتورة:' : 'Invoice Date:'}
                                      </label>
                                      {isClosedOrder && !canModifyClosedOrders && (
                                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                                      )}
                                    </div>
                                    <input
                                      type="date"
                                      disabled={isClosedOrder && !canModifyClosedOrders}
                                      value={eff.invoiceDate || order.invoiceDate || ''}
                                      onChange={(e) => handleStageChange(order.id, 'invoiceDate', e.target.value)}
                                      className={`w-full px-2 py-1.5 rounded-xl font-mono text-xs font-bold ${
                                        isClosedOrder && !canModifyClosedOrders
                                          ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                          : 'bg-slate-50 border border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500'
                                      }`}
                                    />
                                  </div>

                                  {/* 4. Truck Selector */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                      {isAr ? 'السيارة:' : 'Truck:'} *
                                    </label>
                                    <select
                                      value={eff.assignedVehicleId}
                                      onChange={(e) => handleStageChange(order.id, 'assignedVehicleId', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                    >
                                      <option value="">{isAr ? '— اختر السيارة —' : '— Select Truck —'}</option>
                                      {vehicles.map((v) => {
                                        const truckName = resolveVehicleDisplayName(v, v.plateNumber);
                                        return (
                                          <option key={v.id} value={v.id}>
                                            {truckName}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>

                                  {/* 5. Driver Selector */}
                                  <div>
                                    <div className="flex items-center justify-between mb-0.5">
                                      <label className="text-[10px] font-bold text-slate-500">
                                        {isAr ? 'السائق:' : 'Driver:'} *
                                      </label>
                                      {eff.assignedVehicleId && (
                                        <span className={`text-[9px] font-bold px-1 rounded flex items-center gap-0.5 ${
                                          isDefaultDriver
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : eff.assignedDriverId
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-rose-100 text-rose-800'
                                        }`}>
                                          {isDefaultDriver ? (
                                            <>
                                              <Check className="w-2.5 h-2.5 inline shrink-0" />
                                              <span>{isAr ? 'أساسي' : 'Default'}</span>
                                            </>
                                          ) : eff.assignedDriverId ? (
                                            <>
                                              <Check className="w-2.5 h-2.5 inline shrink-0" />
                                              <span>{isAr ? 'بديل' : 'Override'}</span>
                                            </>
                                          ) : (
                                            <>
                                              <AlertCircle className="w-2.5 h-2.5 inline shrink-0" />
                                              <span>{isAr ? 'مطلوب' : 'Needed'}</span>
                                            </>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    <select
                                      value={eff.assignedDriverId}
                                      onChange={(e) => handleStageChange(order.id, 'assignedDriverId', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                    >
                                      <option value="">{isAr ? '— اختر السائق —' : '— Select Driver —'}</option>
                                      {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>
                                          {emp.nameAr || emp.name} {emp.role ? `(${emp.role})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* 6. Delivery Rep Selector */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                      {isAr ? 'المندوب:' : 'Rep:'}
                                    </label>
                                    <select
                                      value={eff.assignedDeliveryRepId}
                                      onChange={(e) => handleStageChange(order.id, 'assignedDeliveryRepId', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                    >
                                      <option value="">{isAr ? '— بدون مندوب —' : '— None —'}</option>
                                      {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>
                                          {emp.nameAr || emp.name} {emp.role ? `(${emp.role})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {/* Action Buttons: Expanding Check and X */}
                                <div className="flex items-center gap-1.5 shrink-0 self-center">
                                  {/* Clear Button if assigned */}
                                  {isAssigned && (
                                    <button
                                      type="button"
                                      onClick={() => handleClearAssignment(order.id)}
                                      className="group/btn inline-flex items-center gap-1 h-8 px-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition-all duration-300 cursor-pointer overflow-hidden"
                                      title={isAr ? 'مسح التعيين' : 'Clear Assignment'}
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                      <span className="max-w-0 opacity-0 group-hover/btn:max-w-xs group-hover/btn:opacity-100 transition-all duration-300 text-[11px] font-bold whitespace-nowrap overflow-hidden">
                                        {isAr ? 'مسح' : 'Clear'}
                                      </span>
                                    </button>
                                  )}

                                  {/* Save / Check Button (Always clickable — verifies mandatory fields on order Save) */}
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCardAssignment(order)}
                                    className={`group/btn inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl transition-all duration-300 shadow-xs overflow-hidden cursor-pointer ${
                                      isMandatoryFilled
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                                    }`}
                                    title={
                                      isMandatoryFilled
                                        ? (isAr ? 'حفظ' : 'Save')
                                        : (isAr ? 'تحقق من البيانات الإلزامية وحفظ (رقم التحميل، السيارة، والسائق)' : 'Verify mandatory fields & Save: LO #, Truck, Driver')
                                    }
                                  >
                                    <Check className="w-4 h-4 shrink-0" />
                                    <span className="max-w-0 opacity-0 group-hover/btn:max-w-xs group-hover/btn:opacity-100 transition-all duration-300 text-xs font-bold whitespace-nowrap overflow-hidden">
                                      {isAr ? 'حفظ' : 'Save'}
                                    </span>
                                  </button>

                                  {/* Cancel / X Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleCancelEdit(order.id)}
                                    className="group/btn inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition-all duration-300 cursor-pointer overflow-hidden"
                                    title={isAr ? 'إلغاء' : 'Cancel'}
                                  >
                                    <X className="w-4 h-4 shrink-0" />
                                    <span className="max-w-0 opacity-0 group-hover/btn:max-w-xs group-hover/btn:opacity-100 transition-all duration-300 text-xs font-bold whitespace-nowrap overflow-hidden">
                                      {isAr ? 'إلغاء' : 'Cancel'}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : isAssigned ? (
                          /* ========================================================================= */
                          /* CASE 2: IS ASSIGNED & CLOSED (Order Data 80%, Summary 2x2 Grid 20%)       */
                          /* ========================================================================= */
                          <>
                            {/* Main Order Data (80% width) */}
                            <div className="w-full md:w-[80%] p-4 sm:p-5 space-y-2.5 text-start">
                              {/* Header Row: Type, Serial, Client, Branch, Region, Map, Dates */}
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span>{isAr ? orderTypeObj.labelAr : orderTypeObj.labelEn}</span>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNavigateToSalesOrder(order);
                                    }}
                                    className="font-mono text-xs font-black text-slate-800 hover:text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer transition px-1 py-0.5 rounded-md hover:bg-slate-100"
                                    title={isAr ? 'عرض تفاصيل أمر البيع في تبويب أوامر البيع' : 'View order details in Sales Orders'}
                                  >
                                    <span>#{orderSerial}</span>
                                    <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0 rtl:-scale-x-100" />
                                  </button>

                                  <RowCommentButton
                                    docId={order.id}
                                    docNumber={orderSerial ? `SO-${orderSerial}` : (order.id || 'Order')}
                                    tab="loading_plan"
                                    module="sales"
                                  />

                                  {order.splitParentId && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-black text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg"
                                      title={isAr ? `جزء من الأمر الأصلي #${order.baseSerial || ''}` : `Split portion of #${order.baseSerial || ''}`}
                                    >
                                      <GitFork className="w-3 h-3 text-blue-600 shrink-0" />
                                      <span>{isAr ? `جزء ${order.splitIndex}/${order.splitTotal}` : `Split ${order.splitIndex}/${order.splitTotal}`}</span>
                                    </span>
                                  )}

                                  {order.splitParentId && order.invoiceSplitMode === 'merged_on_parent' && (
                                    <span className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-lg">
                                      {isAr ? `مفوتر على #${order.baseSerial || ''}` : `Billed under #${order.baseSerial || ''}`}
                                    </span>
                                  )}

                                  {order.hasPartialRejection && Number(order.returnedCartons || 0) > 0 && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-black text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg shadow-2xs"
                                      title={order.rejectionReason || (isAr ? 'مرتجع جزئي من العميل' : 'Partial client rejection')}
                                    >
                                      <PackageMinus className="w-3 h-3 text-rose-600 shrink-0" />
                                      <span>
                                        {isAr
                                          ? `مرتجع جزئي: -${Number(order.returnedCartons)} كرتونة`
                                          : `Partial Return: -${Number(order.returnedCartons)} ctn`}
                                      </span>
                                    </span>
                                  )}

                                  {eff.assignedVehicleId && !eff.loadingOrderNumber && truckDisplayName && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg"
                                      title={isAr ? 'شاحنة مبدئية مقترحة من مصفوفة التقسيم' : 'Pre-selected truck from Order Split Matrix'}
                                    >
                                      <Truck className="w-3 h-3 text-indigo-600 shrink-0" />
                                      <span>{isAr ? `شاحنة مقترحة: ${truckDisplayName}` : `Pre-selected: ${truckDisplayName}`}</span>
                                    </span>
                                  )}

                                  {/* Fulfillment Status Badge - Prominent Corporate Style */}
                                  {currentFulfillmentStatus && (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-black border shadow-2xs ${currentStatusConfig.badgeClasses}`}>
                                      {isClosedOrder ? (
                                        <Lock className={`w-3 h-3 shrink-0 ${currentStatusConfig.iconColor}`} />
                                      ) : currentStatusConfig.color === 'amber' ? (
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                                        </span>
                                      ) : (
                                        <CurrentStatusIcon className={`w-3 h-3 shrink-0 ${
                                          currentStatusConfig.color === 'sky' ? 'animate-pulse text-sky-600 rtl:-scale-x-100' :
                                          currentStatusConfig.iconColor || 'text-slate-600'
                                        }`} />
                                      )}
                                      <span>
                                        {isAr ? currentStatusConfig.labelAr : currentStatusConfig.labelEn}
                                      </span>
                                    </span>
                                  )}

                                  {/* Retail Van-Sales Route Settlement Badge & Action Button */}
                                  {isOrderRetailRoute(order, clients, segments) && (() => {
                                    const rStatus = order.retailSettlementStatus;
                                    const isSettled = rStatus === 'settled';
                                    const isPostDispatchRetail =
                                      currentFulfillmentStatus === 'shipped' ||
                                      currentFulfillmentStatus === 'delivered' ||
                                      currentFulfillmentStatus === 'paid';
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRetailSettlementModal({
                                            order,
                                            allowDeferDelivery: currentFulfillmentStatus === 'shipped'
                                          });
                                        }}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs transition cursor-pointer ${
                                          isSettled
                                            ? 'bg-teal-50 hover:bg-teal-100 text-teal-900 border-teal-300'
                                            : isPostDispatchRetail
                                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-400 animate-pulse'
                                              : 'bg-cyan-50/70 hover:bg-cyan-100 text-cyan-800 border-cyan-200'
                                        }`}
                                        title={
                                          isSettled
                                            ? (isAr ? 'مراجعة أو تعديل تسوية مبيعات التجزئة (Force Sync)' : 'Inspect or Force-Sync Retail Settlement')
                                            : isPostDispatchRetail
                                              ? (isAr ? 'يتطلب تأكيد الكميات المباعة بعد العودة' : 'Requires Post-Arrival Sold Qty Confirmation')
                                              : (isAr ? 'رحلة تجزئة — تُسوى الكميات المباعة بعد العودة' : 'Retail Route Trip — Settle sold qty after return')
                                        }
                                      >
                                        {isSettled ? <ClipboardCheck className="w-3 h-3 shrink-0" /> : <Store className="w-3 h-3 shrink-0" />}
                                        <span>
                                          {isSettled
                                            ? (isAr
                                                ? `تسوية تجزئة #${order.retailSettlementRevision || 1}${Number(order.returnedCartons || 0) > 0 ? ` (-${order.returnedCartons})` : ''}`
                                                : `Settled #${order.retailSettlementRevision || 1}${Number(order.returnedCartons || 0) > 0 ? ` (-${order.returnedCartons})` : ''}`)
                                            : isPostDispatchRetail
                                              ? (isAr ? 'بانتظار تأكيد المباع' : 'Pending Sold Settlement')
                                              : (isAr ? 'خط سير تجزئة' : 'Retail Route')}
                                        </span>
                                      </button>
                                    );
                                  })()}

                                  {/* Admin Override Permitted Badge */}
                                  {isClosedOrder && canModifyClosedOrders && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                      <ShieldCheck className="w-3 h-3 text-amber-600" />
                                      <span>{isAr ? 'تعديل بصلاحية الإدارة' : 'Admin Edit Permitted'}</span>
                                    </span>
                                  )}

                                  <span className="text-[11px] font-mono text-slate-400">
                                    {order.invoiceDate || '—'}
                                  </span>
                                </div>

                                {/* Cartons Summary & Sequential Trip Availability Chip */}
                                <div className="flex items-center gap-2">
                                  <OrderCartonsAvailabilityChip
                                    order={order}
                                    availability={orderAvailabilityMap[order.id]}
                                    onClick={() => setSelectedOrderForProducts(order)}
                                    isAr={isAr}
                                  />
                                </div>
                              </div>

                              {/* Client & Branch & Region & Maps */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (order.clientId) {
                                        setClientProfileTarget({
                                          client: clientObj,
                                          clientId: order.clientId,
                                          branchId: order.branchId || '',
                                          branchName: order.branchName || '',
                                        });
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black shadow-2xs max-w-full truncate cursor-pointer hover:opacity-90 transition"
                                    style={{
                                      backgroundColor: segColor,
                                      color: getContrastTextColor(segColor)
                                    }}
                                    title={isAr ? `${order.clientName || order.clientId || '—'} — انقر لعرض ملف العميل` : `${order.clientName || order.clientId || '—'} — Click for Client Profile`}
                                  >
                                    <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-white/95 shadow-2xs overflow-hidden">
                                      {clientObj?.logo ? (
                                        <img
                                          src={clientObj.logo}
                                          alt=""
                                          className="w-full h-full object-contain p-0.5 rounded-md"
                                        />
                                      ) : (
                                        <SegIcon className="w-3 h-3 shrink-0" style={{ color: segColor }} />
                                      )}
                                    </span>
                                    <span className="truncate">{order.clientName || order.clientId || '—'}</span>
                                  </button>
                                  {showBranchName && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (order.clientId) {
                                          setClientProfileTarget({
                                            client: clientObj,
                                            clientId: order.clientId,
                                            branchId: order.branchId || '',
                                            branchName: order.branchName || '',
                                          });
                                        }
                                      }}
                                      className="text-xs font-bold text-slate-500 hover:text-indigo-700 hover:underline cursor-pointer"
                                    >
                                      ({order.branchName})
                                    </button>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  {order.region && (
                                    <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                                      <MapPin className="w-3 h-3 text-slate-400" />
                                      <span>{order.region}</span>
                                    </span>
                                  )}

                                  {/* Map Icon: Accurate GPS (Map icon) vs Fallback Search (MapPin+Search in Pale Yellow) */}
                                  {locInfo?.type === 'accurate' ? (
                                    <a
                                      href={locInfo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md font-bold transition cursor-pointer shadow-2xs"
                                      title={
                                        locInfo.coords
                                          ? (isAr ? `إحداثيات دقيقة: ${locInfo.coords}` : `Exact GPS: ${locInfo.coords}`)
                                          : (isAr ? 'فتح الموقع المسجل الدقيق على الخريطة' : 'Open Saved Accurate Location on Map')
                                      }
                                    >
                                      <Map className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>{isAr ? 'الموقع مسجل' : 'Location'}</span>
                                    </a>
                                  ) : locInfo?.type === 'search' ? (
                                    <a
                                      href={locInfo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[11px] text-amber-800 hover:text-amber-900 bg-amber-50/90 hover:bg-amber-100 border border-amber-200/90 px-2 py-0.5 rounded-md font-semibold transition cursor-pointer shadow-2xs"
                                      title={isAr ? 'بحث بالاسم أو العنوان على الخريطة (موقع غير مثبت بدقة)' : 'Search by name/address on Map'}
                                    >
                                      <span className="relative inline-flex items-center">
                                        <MapPin className="w-3.5 h-3.5 text-amber-600" />
                                        <Search className="w-2 h-2 text-amber-800 absolute -bottom-0.5 -end-0.5" />
                                      </span>
                                      <span>{isAr ? 'بحث على الخريطة' : 'Search Map'}</span>
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-slate-300 flex items-center gap-1">
                                      <Map className="w-3 h-3" />
                                      <span>{isAr ? 'بدون موقع مسجل' : 'No Map'}</span>
                                    </span>
                                  )}

                                  {workingHoursDisplay && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 font-mono bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200" title={isAr ? 'مواعيد العمل الرسمية' : 'Working hours'}>
                                      <Clock className="w-3 h-3 text-slate-500" />
                                      <span>{workingHoursDisplay}</span>
                                    </span>
                                  )}

                                  {holidaysDisplay && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200"
                                      title={isAr ? 'عطلة أسبوعية للعميل' : 'Client weekly holiday'}
                                    >
                                      <Calendar className="w-3 h-3 text-rose-500" />
                                      <span>
                                        {isAr ? 'عطلة:' : 'Holiday:'} {holidaysDisplay}
                                      </span>
                                    </span>
                                  )}

                                  {/* Purchase Orders with Copy Buttons */}
                                  {order.poTawoos && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs" title={isAr ? 'أمر شراء طاووس' : 'Tawoos PO'}>
                                      <span className="text-[9px] text-slate-400 font-sans">{isAr ? 'طاووس:' : 'TW:'}</span>
                                      <span>{order.poTawoos}</span>
                                      <CopyButton text={order.poTawoos} title={isAr ? 'نسخ أمر شراء طاووس' : 'Copy Tawoos PO #'} isAr={isAr} />
                                    </span>
                                  )}
                                  {order.poPrivateLabel && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-purple-50 text-purple-900 px-2 py-0.5 rounded-md border border-purple-200 shadow-2xs" title={isAr ? 'أمر شراء علامة خاصة' : 'Private Label PO'}>
                                      <span className="text-[9px] text-purple-500 font-sans">{isAr ? 'علامة:' : 'PL:'}</span>
                                      <span>{order.poPrivateLabel}</span>
                                      <CopyButton text={order.poPrivateLabel} title={isAr ? 'نسخ أمر شراء العلامة الخاصة' : 'Copy Private Label PO #'} isAr={isAr} />
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Client Notes & Order Notes */}
                              {(clientNotes || order.externalComments || order.internalComments) && (
                                <div className="space-y-1.5 pt-1 text-xs">
                                  {clientNotes && (
                                    <div className="p-2 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-1.5 shadow-2xs">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-bold me-1 text-[11px] uppercase tracking-wider text-amber-800">
                                          {isAr ? 'ملاحظة العميل التشغيلية:' : 'Client Note:'}
                                        </span>
                                        <span className="font-medium text-amber-950">{clientNotes}</span>
                                      </div>
                                    </div>
                                  )}

                                  {order.externalComments && (
                                    <div className="p-1.5 rounded-lg bg-blue-50/70 border border-blue-200 text-blue-900 text-[11px] flex items-start gap-1">
                                      <FileText className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
                                      <span className="break-words">
                                        <span className="font-bold me-1">{isAr ? 'ملاحظة الطلب:' : 'Order Note:'}</span>
                                        {order.externalComments}
                                      </span>
                                    </div>
                                  )}

                                  {order.internalComments && (
                                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px] flex items-start gap-1">
                                      <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                      <span className="break-words">
                                        <span className="font-bold me-1">{isAr ? 'ملاحظة داخلية:' : 'Internal Note:'}</span>
                                        {order.internalComments}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* COMPACT 2X2 SUMMARY GRID STRIP (20% width) - Inherits fulfillment status icon & color */}
                            <div
                              onClick={() => {
                                handleInitiateEdit(order);
                              }}
                              className={`w-full md:w-[20%] p-3 border-t md:border-t-0 md:border-s flex flex-col justify-between transition-all duration-300 shrink-0 select-none text-start ${
                                isOrderLocked
                                  ? 'bg-slate-100/70 border-slate-200 cursor-pointer opacity-90'
                                  : `${currentStatusConfig.stripClasses} cursor-pointer group`
                              }`}
                              title={
                                isOrderLocked
                                  ? (isAr ? 'الطلب مكتمل (تم التسليم أو السداد) — انقر للتعديل أو التراجع' : 'Order is delivered/paid — Click to edit or revert')
                                  : (isAr ? 'انقر لتعديل بيانات التسكين' : 'Click to edit dispatch assignment')
                              }
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-black uppercase flex items-center gap-1 ${
                                    isOrderLocked ? 'text-slate-500' : currentStatusConfig.textColor
                                  }`}>
                                    <Truck className="w-3.5 h-3.5 rtl:-scale-x-100" />
                                    <span>{isAr ? 'بيانات الشاحنة' : 'Assigned Truck'}</span>
                                  </span>
                                  {isOrderLocked ? (
                                    <span className="text-[10px] font-bold text-slate-600 flex items-center gap-0.5 bg-slate-200/80 px-1.5 py-0.5 rounded">
                                      <Lock className="w-2.5 h-2.5" />
                                      <span>{isAr ? 'مكتمل' : 'Closed'}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-slate-600 group-hover:text-emerald-700 group-hover:underline flex items-center gap-0.5">
                                      <Edit2 className="w-2.5 h-2.5" />
                                      <span>{isAr ? 'تعديل' : 'Edit'}</span>
                                    </span>
                                  )}
                                </div>

                                {/* Status Mini-Pill on 20% Strip */}
                                <div className="flex items-center justify-between">
                                  <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md font-black border shadow-2xs ${currentStatusConfig.badgeClasses}`}>
                                    <CurrentStatusIcon className={`w-2.5 h-2.5 shrink-0 ${currentStatusConfig.iconColor || 'text-slate-500'} ${currentStatusConfig.color === 'sky' ? 'rtl:-scale-x-100' : ''}`} />
                                    <span>{isAr ? currentStatusConfig.labelAr : currentStatusConfig.labelEn}</span>
                                  </span>
                                </div>

                                {/* 2x2 Cell Badge Box */}
                                <div className="grid grid-cols-2 gap-1.5 text-start">
                                  {/* Cell 1: Trip Number */}
                                  <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs font-mono font-black text-xs text-slate-800 flex items-center gap-1 truncate">
                                    <Truck className="w-3 h-3 text-emerald-600 shrink-0 rtl:-scale-x-100" />
                                    <span>{isAr ? `رحلة #${eff.loadingOrderNumber}` : `Trip #${eff.loadingOrderNumber}`}</span>
                                  </div>

                                  {/* Cell 2: Vehicle Truck Name (Truck Name + copyable Plate) */}
                                  <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs text-[10px] font-bold text-slate-800 flex items-center justify-between gap-1" title={truckDisplayName || eff.assignedVehiclePlate}>
                                    <span className="truncate font-black text-slate-900">{truckDisplayName || eff.assignedVehiclePlate || '—'}</span>
                                    {(eff.assignedVehiclePlate || selectedVehicle?.plateNumber) && (
                                      <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-slate-100 border border-slate-200 font-mono text-[9px] text-slate-600 shrink-0">
                                        <span>{eff.assignedVehiclePlate || selectedVehicle?.plateNumber}</span>
                                        <CopyButton text={eff.assignedVehiclePlate || selectedVehicle?.plateNumber} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} />
                                      </span>
                                    )}
                                  </div>

                                  {/* Cell 3: Driver Name */}
                                  <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs text-[10px] font-semibold text-slate-700 flex items-center gap-1 truncate" title={eff.assignedDriverName}>
                                    <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span className="truncate">{eff.assignedDriverName || (isAr ? 'بدون سائق' : 'No driver')}</span>
                                  </div>

                                  {/* Cell 4: Rep Name */}
                                  <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs text-[10px] font-medium text-slate-500 truncate" title={eff.assignedDeliveryRepName}>
                                    {eff.assignedDeliveryRepName || '—'}
                                  </div>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-mono text-slate-700">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-500 inline shrink-0" />
                                  <span>{eff.loadingDate}</span>
                                </span>
                                {isStaged && (
                                  <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-900 border border-amber-200">
                                    {isAr ? 'معلق' : 'staged'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          /* ========================================================================= */
                          /* CASE 3: IS UNASSIGNED & CLOSED (Full Order Data + Compact Strip)          */
                          /* ========================================================================= */
                          <>
                            {/* Full Order Data (Left) */}
                            <div className="flex-1 p-4 sm:p-5 space-y-2.5 text-start">
                              {/* Header Row: Type, Serial, Client, Branch, Region, Map, Dates */}
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span>{isAr ? orderTypeObj.labelAr : orderTypeObj.labelEn}</span>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNavigateToSalesOrder(order);
                                    }}
                                    className="font-mono text-xs font-black text-slate-800 hover:text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer transition px-1 py-0.5 rounded-md hover:bg-slate-100"
                                    title={isAr ? 'عرض تفاصيل أمر البيع في تبويب أوامر البيع' : 'View order details in Sales Orders'}
                                  >
                                    <span>#{orderSerial}</span>
                                    <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0 rtl:-scale-x-100" />
                                  </button>

                                  <RowCommentButton
                                    docId={order.id}
                                    docNumber={orderSerial ? `SO-${orderSerial}` : (order.id || 'Order')}
                                    tab="loading_plan"
                                    module="sales"
                                  />

                                  {order.splitParentId && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-black text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg"
                                      title={isAr ? `جزء من الأمر الأصلي #${order.baseSerial || ''}` : `Split portion of #${order.baseSerial || ''}`}
                                    >
                                      <GitFork className="w-3 h-3 text-blue-600 shrink-0" />
                                      <span>{isAr ? `جزء ${order.splitIndex}/${order.splitTotal}` : `Split ${order.splitIndex}/${order.splitTotal}`}</span>
                                    </span>
                                  )}

                                  {order.splitParentId && order.invoiceSplitMode === 'merged_on_parent' && (
                                    <span className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-lg">
                                      {isAr ? `مفوتر على #${order.baseSerial || ''}` : `Billed under #${order.baseSerial || ''}`}
                                    </span>
                                  )}

                                  {order.hasPartialRejection && Number(order.returnedCartons || 0) > 0 && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-black text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg shadow-2xs"
                                      title={order.rejectionReason || (isAr ? 'مرتجع جزئي من العميل' : 'Partial client rejection')}
                                    >
                                      <PackageMinus className="w-3 h-3 text-rose-600 shrink-0" />
                                      <span>
                                        {isAr
                                          ? `مرتجع جزئي: -${Number(order.returnedCartons)} كرتونة`
                                          : `Partial Return: -${Number(order.returnedCartons)} ctn`}
                                      </span>
                                    </span>
                                  )}

                                  {eff.assignedVehicleId && !eff.loadingOrderNumber && truckDisplayName && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg"
                                      title={isAr ? 'شاحنة مبدئية مقترحة من مصفوفة التقسيم' : 'Pre-selected truck from Order Split Matrix'}
                                    >
                                      <Truck className="w-3 h-3 text-indigo-600 shrink-0" />
                                      <span>{isAr ? `شاحنة مقترحة: ${truckDisplayName}` : `Pre-selected: ${truckDisplayName}`}</span>
                                    </span>
                                  )}

                                  {/* Fulfillment Status Badge - Prominent Corporate Style */}
                                  {currentFulfillmentStatus && (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-black border shadow-2xs ${currentStatusConfig.badgeClasses}`}>
                                      {isClosedOrder ? (
                                        <Lock className={`w-3 h-3 shrink-0 ${currentStatusConfig.iconColor}`} />
                                      ) : currentStatusConfig.color === 'amber' ? (
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                                        </span>
                                      ) : (
                                        <CurrentStatusIcon className={`w-3 h-3 shrink-0 ${
                                          currentStatusConfig.color === 'sky' ? 'animate-pulse text-sky-600 rtl:-scale-x-100' :
                                          currentStatusConfig.iconColor || 'text-slate-600'
                                        }`} />
                                      )}
                                      <span>
                                        {isAr ? currentStatusConfig.labelAr : currentStatusConfig.labelEn}
                                      </span>
                                    </span>
                                  )}

                                  {/* Retail Van-Sales Route Settlement Badge & Action Button */}
                                  {isOrderRetailRoute(order, clients, segments) && (() => {
                                    const rStatus = order.retailSettlementStatus;
                                    const isSettled = rStatus === 'settled';
                                    const isPostDispatchRetail =
                                      currentFulfillmentStatus === 'shipped' ||
                                      currentFulfillmentStatus === 'delivered' ||
                                      currentFulfillmentStatus === 'paid';
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRetailSettlementModal({
                                            order,
                                            allowDeferDelivery: currentFulfillmentStatus === 'shipped'
                                          });
                                        }}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs transition cursor-pointer ${
                                          isSettled
                                            ? 'bg-teal-50 hover:bg-teal-100 text-teal-900 border-teal-300'
                                            : isPostDispatchRetail
                                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-400 animate-pulse'
                                              : 'bg-cyan-50/70 hover:bg-cyan-100 text-cyan-800 border-cyan-200'
                                        }`}
                                        title={
                                          isSettled
                                            ? (isAr ? 'مراجعة أو تعديل تسوية مبيعات التجزئة (Force Sync)' : 'Inspect or Force-Sync Retail Settlement')
                                            : isPostDispatchRetail
                                              ? (isAr ? 'يتطلب تأكيد الكميات المباعة بعد العودة' : 'Requires Post-Arrival Sold Qty Confirmation')
                                              : (isAr ? 'رحلة تجزئة — تُسوى الكميات المباعة بعد العودة' : 'Retail Route Trip — Settle sold qty after return')
                                        }
                                      >
                                        {isSettled ? <ClipboardCheck className="w-3 h-3 shrink-0" /> : <Store className="w-3 h-3 shrink-0" />}
                                        <span>
                                          {isSettled
                                            ? (isAr
                                                ? `تسوية تجزئة #${order.retailSettlementRevision || 1}${Number(order.returnedCartons || 0) > 0 ? ` (-${order.returnedCartons})` : ''}`
                                                : `Settled #${order.retailSettlementRevision || 1}${Number(order.returnedCartons || 0) > 0 ? ` (-${order.returnedCartons})` : ''}`)
                                            : isPostDispatchRetail
                                              ? (isAr ? 'بانتظار تأكيد المباع' : 'Pending Sold Settlement')
                                              : (isAr ? 'خط سير تجزئة' : 'Retail Route')}
                                        </span>
                                      </button>
                                    );
                                  })()}

                                  {/* Admin Override Permitted Badge */}
                                  {isClosedOrder && canModifyClosedOrders && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                      <ShieldCheck className="w-3 h-3 text-amber-600" />
                                      <span>{isAr ? 'تعديل بصلاحية الإدارة' : 'Admin Edit Permitted'}</span>
                                    </span>
                                  )}

                                  <span className="text-[11px] font-mono text-slate-400">
                                    {order.invoiceDate || '—'}
                                  </span>
                                </div>

                                {/* Cartons Summary & Sequential Trip Availability Chip */}
                                <div className="flex items-center gap-2">
                                  <OrderCartonsAvailabilityChip
                                    order={order}
                                    availability={orderAvailabilityMap[order.id]}
                                    onClick={() => setSelectedOrderForProducts(order)}
                                    isAr={isAr}
                                  />
                                </div>
                              </div>

                              {/* Client & Branch & Region & Maps */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (order.clientId) {
                                        setClientProfileTarget({
                                          client: clientObj,
                                          clientId: order.clientId,
                                          branchId: order.branchId || '',
                                          branchName: order.branchName || '',
                                        });
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black shadow-2xs max-w-full truncate cursor-pointer hover:opacity-90 transition"
                                    style={{
                                      backgroundColor: segColor,
                                      color: getContrastTextColor(segColor)
                                    }}
                                    title={isAr ? `${order.clientName || order.clientId || '—'} — انقر لعرض ملف العميل` : `${order.clientName || order.clientId || '—'} — Click for Client Profile`}
                                  >
                                    <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-white/95 shadow-2xs overflow-hidden">
                                      {clientObj?.logo ? (
                                        <img
                                          src={clientObj.logo}
                                          alt=""
                                          className="w-full h-full object-contain p-0.5 rounded-md"
                                        />
                                      ) : (
                                        <SegIcon className="w-3 h-3 shrink-0" style={{ color: segColor }} />
                                      )}
                                    </span>
                                    <span className="truncate">{order.clientName || order.clientId || '—'}</span>
                                  </button>
                                  {showBranchName && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (order.clientId) {
                                          setClientProfileTarget({
                                            client: clientObj,
                                            clientId: order.clientId,
                                            branchId: order.branchId || '',
                                            branchName: order.branchName || '',
                                          });
                                        }
                                      }}
                                      className="text-xs font-bold text-slate-500 hover:text-indigo-700 hover:underline cursor-pointer"
                                    >
                                      ({order.branchName})
                                    </button>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  {order.region && (
                                    <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                                      <MapPin className="w-3 h-3 text-slate-400" />
                                      <span>{order.region}</span>
                                    </span>
                                  )}

                                  {/* Map Icon: Accurate GPS (Map icon) vs Fallback Search (MapPin+Search in Pale Yellow) */}
                                  {locInfo?.type === 'accurate' ? (
                                    <a
                                      href={locInfo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md font-bold transition cursor-pointer shadow-2xs"
                                      title={
                                        locInfo.coords
                                          ? (isAr ? `إحداثيات دقيقة: ${locInfo.coords}` : `Exact GPS: ${locInfo.coords}`)
                                          : (isAr ? 'فتح الموقع المسجل الدقيق على الخريطة' : 'Open Saved Accurate Location on Map')
                                      }
                                    >
                                      <Map className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>{isAr ? 'الموقع مسجل' : 'Location'}</span>
                                    </a>
                                  ) : locInfo?.type === 'search' ? (
                                    <a
                                      href={locInfo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[11px] text-amber-800 hover:text-amber-900 bg-amber-50/90 hover:bg-amber-100 border border-amber-200/90 px-2 py-0.5 rounded-md font-semibold transition cursor-pointer shadow-2xs"
                                      title={isAr ? 'بحث بالاسم أو العنوان على الخريطة (موقع غير مثبت بدقة)' : 'Search by name/address on Map'}
                                    >
                                      <span className="relative inline-flex items-center">
                                        <MapPin className="w-3.5 h-3.5 text-amber-600" />
                                        <Search className="w-2 h-2 text-amber-800 absolute -bottom-0.5 -end-0.5" />
                                      </span>
                                      <span>{isAr ? 'بحث على الخريطة' : 'Search Map'}</span>
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-slate-300 flex items-center gap-1">
                                      <Map className="w-3 h-3" />
                                      <span>{isAr ? 'بدون موقع مسجل' : 'No Map'}</span>
                                    </span>
                                  )}

                                  {workingHoursDisplay && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 font-mono bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200" title={isAr ? 'مواعيد العمل الرسمية' : 'Working hours'}>
                                      <Clock className="w-3 h-3 text-slate-500" />
                                      <span>{workingHoursDisplay}</span>
                                    </span>
                                  )}

                                  {holidaysDisplay && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200"
                                      title={isAr ? 'عطلة أسبوعية للعميل' : 'Client weekly holiday'}
                                    >
                                      <Calendar className="w-3 h-3 text-rose-500" />
                                      <span>
                                        {isAr ? 'عطلة:' : 'Holiday:'} {holidaysDisplay}
                                      </span>
                                    </span>
                                  )}

                                  {/* Purchase Orders with Copy Buttons */}
                                  {order.poTawoos && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs" title={isAr ? 'أمر شراء طاووس' : 'Tawoos PO'}>
                                      <span className="text-[9px] text-slate-400 font-sans">{isAr ? 'طاووس:' : 'TW:'}</span>
                                      <span>{order.poTawoos}</span>
                                      <CopyButton text={order.poTawoos} title={isAr ? 'نسخ أمر شراء طاووس' : 'Copy Tawoos PO #'} isAr={isAr} />
                                    </span>
                                  )}
                                  {order.poPrivateLabel && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-purple-50 text-purple-900 px-2 py-0.5 rounded-md border border-purple-200 shadow-2xs" title={isAr ? 'أمر شراء علامة خاصة' : 'Private Label PO'}>
                                      <span className="text-[9px] text-purple-500 font-sans">{isAr ? 'علامة:' : 'PL:'}</span>
                                      <span>{order.poPrivateLabel}</span>
                                      <CopyButton text={order.poPrivateLabel} title={isAr ? 'نسخ أمر شراء العلامة الخاصة' : 'Copy Private Label PO #'} isAr={isAr} />
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Client Notes & Order Notes */}
                              {(clientNotes || order.externalComments || order.internalComments) && (
                                <div className="space-y-1.5 pt-1 text-xs">
                                  {clientNotes && (
                                    <div className="p-2 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-1.5 shadow-2xs">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-bold me-1 text-[11px] uppercase tracking-wider text-amber-800">
                                          {isAr ? 'ملاحظة العميل التشغيلية:' : 'Client Note:'}
                                        </span>
                                        <span className="font-medium text-amber-950">{clientNotes}</span>
                                      </div>
                                    </div>
                                  )}

                                  {order.externalComments && (
                                    <div className="p-1.5 rounded-lg bg-blue-50/70 border border-blue-200 text-blue-900 text-[11px] flex items-start gap-1">
                                      <FileText className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
                                      <span className="break-words">
                                        <span className="font-bold me-1">{isAr ? 'ملاحظة الطلب:' : 'Order Note:'}</span>
                                        {order.externalComments}
                                      </span>
                                    </div>
                                  )}

                                  {order.internalComments && (
                                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px] flex items-start gap-1">
                                      <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                      <span className="break-words">
                                        <span className="font-bold me-1">{isAr ? 'ملاحظة داخلية:' : 'Internal Note:'}</span>
                                        {order.internalComments}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* COMPACT STRIP WITH TRUCK ICON (+ تسكين or LOCKED) */}
                            <div
                              onClick={() => {
                                handleInitiateEdit(order);
                              }}
                              className={`w-14 sm:w-16 border-t md:border-t-0 md:border-s flex flex-col items-center justify-center p-2 transition select-none shrink-0 cursor-pointer group ${
                                isOrderLocked
                                  ? 'bg-slate-100/70 hover:bg-slate-200/70 border-slate-200'
                                  : 'bg-slate-50 hover:bg-emerald-50/70 border-slate-100'
                              }`}
                              title={
                                isOrderLocked
                                  ? (isAr ? 'الطلب مكتمل (تم التسليم أو السداد) — انقر للتعديل أو التراجع' : 'Order is delivered/paid — Click to edit or revert')
                                  : (isAr ? 'انقر لتسكين الطلب في شاحنة وأمر تحميل' : 'Click to assign order to truck')
                              }
                            >
                              {isOrderLocked ? (
                                <>
                                  <div className="w-9 h-9 rounded-2xl bg-slate-200 group-hover:bg-slate-300 text-slate-500 border border-slate-300 flex items-center justify-center shadow-2xs transition">
                                    <Lock className="w-4 h-4 text-slate-600" />
                                  </div>
                                  <span className="text-[9px] font-black text-slate-600 mt-1.5 text-center leading-tight">
                                    {isAr ? 'مكتمل' : 'Closed'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <div className="w-9 h-9 rounded-2xl bg-white group-hover:bg-emerald-600 text-slate-400 group-hover:text-white border border-slate-200 group-hover:border-emerald-600 flex items-center justify-center transition shadow-2xs">
                                    <Truck className="w-4 h-4 rtl:-scale-x-100" />
                                  </div>
                                  <span className="text-[10px] font-black text-slate-400 group-hover:text-emerald-700 mt-1.5">
                                    {isAr ? '+ تسكين' : '+ Assign'}
                                  </span>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* FLOATING BOTTOM VALIDATION & REVIEW DOCK */}
      {stagedOrdersCount > 0 && (
        <div
          style={
            isFgSidebarOpen && isDesktopViewport
              ? { insetInlineEnd: `${FG_SIDEBAR_WIDTH + 16}px` }
              : undefined
          }
          className="fixed bottom-4 inset-x-4 sm:inset-x-8 z-40 transition-all duration-300 animate-in slide-in-from-bottom-5"
        >
          <div className="bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden">
            {/* Expanded Manifest Drawer (Cards per Compound Truck/Date Key) */}
            {isManifestExpanded && (
              <div className="p-4 sm:p-5 border-b border-slate-800 max-h-[55vh] overflow-y-auto space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-5 h-5 text-emerald-400 rtl:-scale-x-100" />
                    <h4 className="font-extrabold text-sm text-white">
                      {isAr ? 'بيان الرحلات والشاحنات قيد التعديل حالياً' : 'Active Staged Trips & Trucks Manifest'}
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {truckManifest.length} {isAr ? 'رحلات قيد التعديل' : 'staged trip(s)'}
                  </span>
                </div>

                {truckManifest.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 text-center text-xs text-slate-400">
                    {isAr
                      ? 'لا توجد رحلات برقم محدد ضمن التعديلات المعلقة حالياً (الأوامر في حالة قيد الانتظار بدون رقم رحلة).'
                      : 'No numbered trips in the current staged changes (orders are Pending without a Trip #).'}
                  </div>
                ) : (
                  /* Grid of Triggered Trips */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {truckManifest.map((tm) => {
                      return (
                        <div
                          key={tm.compoundKey}
                          data-comment-doc={tm.compoundKey}
                          className={`rounded-2xl p-4 border transition ${
                            tm.isMisaligned
                              ? 'bg-rose-950/60 border-rose-500/80'
                              : 'bg-slate-800/80 border-slate-700'
                          }`}
                        >
                          {/* Truck Card Header */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-black text-amber-400">
                                  {isAr ? `رحلة #${tm.loadingOrderNumber}` : `Trip #${tm.loadingOrderNumber}`}
                                </span>
                                <span className="font-bold text-white text-xs truncate max-w-[140px]" title={tm.primaryVehicleName}>
                                  {tm.primaryVehicleName || (isAr ? 'شاحنة' : 'Truck')}
                                </span>
                                {tm.primaryVehiclePlate && (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-slate-800 border border-slate-700 font-mono text-[9px] text-slate-300">
                                    <span>{tm.primaryVehiclePlate}</span>
                                    <CopyButton text={tm.primaryVehiclePlate} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} className="text-slate-400 hover:text-white hover:bg-slate-700" />
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400 inline shrink-0" />
                                  <span>{tm.loadingDate}</span>
                                </span>
                                <span>•</span>
                                <span>{isAr ? 'إذن صرف:' : 'Dismiss #:'} {tm.dismissNumber}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <RowCommentButton
                                docId={tm.compoundKey}
                                docNumber={isAr ? `رحلة #${tm.loadingOrderNumber}` : `Trip #${tm.loadingOrderNumber}`}
                                tab="loading_plan"
                                module="sales"
                                className="bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
                              />
                              <span className="text-[10px] font-mono font-bold bg-slate-900 text-slate-300 px-2 py-0.5 rounded-lg border border-slate-700">
                                {tm.assignedOrders.length} {isAr ? 'أمر' : 'orders'}
                              </span>
                            </div>
                          </div>

                          {/* Driver & Rep */}
                          <div className="text-[11px] text-slate-300 space-y-0.5 mb-2">
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{tm.primaryDriverName || (isAr ? 'غير محدد' : 'Unassigned')}</span>
                            </div>
                            {tm.primaryRepName && (
                              <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                                <Users className="w-3 h-3 text-slate-500 shrink-0" />
                                <span className="truncate">{tm.primaryRepName}</span>
                              </div>
                            )}
                          </div>

                          {/* Assigned Orders Chips with Order Serial & Client Name (Staged Triggerer Orders Highlighted) */}
                          {Array.isArray(tm.assignedOrders) && tm.assignedOrders.length > 0 && (
                            <div className="pt-2 border-t border-slate-700/60 mb-2">
                              <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                                <span>{isAr ? 'إجمالي طلبات الرحلة:' : 'Trip Orders:'}</span>
                                <span className="font-mono text-[9px] text-emerald-400">
                                  {tm.stagedOrderIds?.size || 0} {isAr ? 'قيد التعديل' : 'staged'} / {tm.assignedOrders.length} {isAr ? 'إجمالي' : 'total'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {tm.assignedOrders.map((ord) => {
                                  const oSerial = resolveOrderSerial(ord, orders);
                                  const isTriggerer = tm.stagedOrderIds?.has(ord.id);
                                  return (
                                    <span
                                      key={ord.id}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border truncate max-w-full ${
                                        isTriggerer
                                          ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/80 ring-1 ring-emerald-400/30'
                                          : 'bg-slate-900/90 text-slate-300 border-slate-700'
                                      }`}
                                      title={`#${oSerial} — ${ord.clientName || '—'}${isTriggerer ? (isAr ? ' (قيد التعديل الآن)' : ' (Staged Trigger)') : ''}`}
                                    >
                                      {isTriggerer && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                                      )}
                                      <span className="font-mono text-amber-400 font-black shrink-0">#{oSerial}</span>
                                      <span className="truncate">{ord.clientName || (isAr ? 'عميل' : 'Client')}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Optional Delivery Sequence (Priority) Editor — only when > 1 distinct client */}
                          {(() => {
                            const { stops: manifestStops, hasManualSequence } = getTripClientStops(
                              tm.assignedOrders,
                              stagedAssignments
                            );
                            if (manifestStops.length <= 1) return null;

                            const moveStop = (fromIdx, toIdx) => {
                              if (toIdx < 0 || toIdx >= manifestStops.length) return;
                              const nextStops = [...manifestStops];
                              const [moved] = nextStops.splice(fromIdx, 1);
                              nextStops.splice(toIdx, 0, moved);
                              handleStageTripSequence(tm.assignedOrders, nextStops);
                            };

                            return (
                              <div className="pt-2 border-t border-slate-700/60 mb-2">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-300">
                                    <ListOrdered className="w-3 h-3 shrink-0" />
                                    <span>{isAr ? 'أولوية التسليم (اختياري):' : 'Delivery Sequence (Optional):'}</span>
                                  </span>
                                  {hasManualSequence ? (
                                    <button
                                      type="button"
                                      onClick={() => handleStageTripSequence(tm.assignedOrders, null)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-600 text-[9px] font-bold transition cursor-pointer"
                                    >
                                      <RotateCcw className="w-2.5 h-2.5" />
                                      <span>{isAr ? 'تلقائي' : 'Reset Auto'}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleStageTripSequence(tm.assignedOrders, manifestStops)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-600/80 hover:bg-indigo-500 text-white text-[9px] font-black transition cursor-pointer"
                                    >
                                      <ListOrdered className="w-2.5 h-2.5" />
                                      <span>{isAr ? 'تحديد الترتيب' : 'Set Sequence'}</span>
                                    </button>
                                  )}
                                </div>

                                {hasManualSequence && (
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {manifestStops.map((stop, idx) => (
                                      <div
                                        key={stop.key}
                                        className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 border border-indigo-500/40 text-[10px]"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="w-4 h-4 rounded-full bg-indigo-500 text-white font-mono text-[9px] font-black inline-flex items-center justify-center shrink-0">
                                            {idx + 1}
                                          </span>
                                          <span className="font-bold text-slate-100 truncate">
                                            {stop.clientName}
                                            {stop.branchName ? ` — ${stop.branchName}` : ''}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={idx === 0}
                                            onClick={() => moveStop(idx, idx - 1)}
                                            className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition cursor-pointer"
                                            title={isAr ? 'تقديم' : 'Move Up'}
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={idx === manifestStops.length - 1}
                                            onClick={() => moveStop(idx, idx + 1)}
                                            className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition cursor-pointer"
                                            title={isAr ? 'تأخير' : 'Move Down'}
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Weight Capacity Gauge */}
                          <div className="space-y-1 pt-2 border-t border-slate-700/60 text-xs">
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-slate-300 font-bold">
                                {tm.totalCartons} {isAr ? 'كرتونة' : 'ctn'}
                              </span>
                              <span className={`font-black ${
                                tm.gaugeStatus === 'over'
                                  ? 'text-rose-400'
                                  : tm.gaugeStatus === 'optimal'
                                  ? 'text-emerald-400'
                                  : tm.gaugeStatus === 'under'
                                  ? 'text-amber-400'
                                  : 'text-slate-200'
                              }`}>
                                {(tm.totalWeightKg / 1000).toFixed(2)} / {tm.maxCap ? `${(tm.maxCap / 1000).toFixed(1)} ${isAr ? 'طن' : 'Ton'}` : '—'}
                              </span>
                            </div>

                            {/* Progress Bar */}
                            {tm.maxCap > 0 ? (
                              <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    tm.gaugeStatus === 'over'
                                      ? 'bg-rose-500 animate-pulse'
                                      : tm.gaugeStatus === 'optimal'
                                      ? 'bg-emerald-500'
                                      : tm.gaugeStatus === 'heavy'
                                      ? 'bg-amber-500'
                                      : 'bg-amber-400'
                                  }`}
                                  style={{ width: `${tm.gaugePct}%` }}
                                />
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-500">
                                {isAr ? 'لم تسجل محددات الحمولة للمركبة' : 'Vehicle capacity not set'}
                              </div>
                            )}
                          </div>

                          {/* Misalignment Warning Alert & 1-Click Align Button */}
                          {tm.isMisaligned && (
                            <div className="mt-3 p-2 rounded-xl bg-rose-900/80 border border-rose-600 text-rose-100 text-[11px] space-y-1.5">
                              <div className="flex items-center gap-1 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                                <span>{isAr ? `تعارض في رحلة #${tm.loadingOrderNumber} بتاريخ (${tm.loadingDate})!` : `Truck/Driver Conflict in Trip #${tm.loadingOrderNumber} on ${tm.loadingDate}!`}</span>
                              </div>
                              <p className="text-[10px] text-rose-200">
                                {isAr ? 'أوامر مختلفة بنفس رقم الرحلة لنفس اليوم مسندة لشاحنات وسائقين متباينين.' : 'Different orders in this Trip # on this date have conflicting trucks/drivers.'}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleAlignTruckOrders(tm.compoundKey, tm.loadingOrderNumber, tm.loadingDate, tm.primaryVehicleId, tm.primaryDriverId)}
                                className="w-full py-1 px-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold text-[10px] transition cursor-pointer shadow-xs"
                              >
                                {isAr ? 'مطابقة وتوحيد كافة الطلبات' : 'Align All Orders'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Main Floating Bar */}
            <div className="px-4 py-3 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-3">
              {/* Left: Staged Counter & Validation Status */}
              <div className="flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white">
                      {isAr ? `${stagedOrdersCount} أمر بيع قيد التعديل` : `${stagedOrdersCount} orders staged`}
                    </span>

                    {totalMisalignments > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                        <span>{isAr ? `${totalMisalignments} تعارض يتطلب المطابقة` : `${totalMisalignments} conflict(s)`}</span>
                      </span>
                    ) : hasIncompleteStagedOrder ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>{isAr ? 'بيانات إلزامية ناقصة' : 'Incomplete Fields'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>{isAr ? 'البيانات متطابقة وجاهزة' : 'Aligned & Ready'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {/* Toggle Manifest Button */}
                <button
                  type="button"
                  onClick={() => setIsManifestExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-700"
                >
                  <Truck className="w-3.5 h-3.5 text-amber-400 rtl:-scale-x-100" />
                  <span>{isAr ? 'بيان الرحلات' : 'Trips Manifest'} ({truckManifest.length})</span>
                  {isManifestExpanded ? <ChevronDown className="w-3.5 h-3.5 ms-0.5" /> : <ChevronUp className="w-3.5 h-3.5 ms-0.5" />}
                </button>

                {/* Discard Button */}
                <button
                  type="button"
                  onClick={handleDiscardChanges}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تراجع' : 'Discard'}</span>
                </button>

                {/* Save Plan Button (Enabled when mandatory fields complete; prompts if misaligned) */}
                <button
                  type="button"
                  onClick={handleOpenSaveModal}
                  disabled={hasIncompleteStagedOrder}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                    hasIncompleteStagedOrder
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : totalMisalignments > 0
                      ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30 cursor-pointer'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30 cursor-pointer'
                  }`}
                  title={
                    hasIncompleteStagedOrder
                      ? (isAr ? 'يوجد طلبات ببيانات غير مكتملة (رقم التحميل، السيارة، أو السائق)' : 'Some orders have incomplete mandatory fields')
                      : totalMisalignments > 0
                      ? (isAr ? 'يوجد تعارض في التسكين — انقر للتحقق والتأكيد المتعمد' : 'Conflicts detected — Click to verify and confirm intentional discrepancy')
                      : (isAr ? 'حفظ الخطة' : 'Save Plan')
                  }
                >
                  <Save className="w-4 h-4" />
                  <span>{isAr ? 'حفظ الخطة' : 'Save Plan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Non-Intrusive Order Products & Prices Modal */}
      {selectedOrderForProducts && (
        <OrderProductsDetailsModal
          isOpen={Boolean(selectedOrderForProducts)}
          onClose={() => setSelectedOrderForProducts(null)}
          order={selectedOrderForProducts}
          availability={orderAvailabilityMap[selectedOrderForProducts.id] || null}
          clients={clients}
          segments={segments}
          products={products}
          isAr={isAr}
        />
      )}

      {/* EXTENDED MULTI-DATE MISMATCH PROMPT MODAL (Loading Date + Invoice Date) */}
      {dateMismatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-start">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-amber-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {isAr ? 'التحقق من تواريخ الطلب (التحميل والفاتورة)' : 'Verify Order Dates (Loading & Invoice)'}
                  </h3>
                  <p className="text-[11px] font-bold text-amber-800">
                    #{resolveOrderSerial(dateMismatchModal.order, orders)} — {dateMismatchModal.order?.clientName || '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelDateMismatch}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              <p className="text-xs text-slate-600 leading-relaxed">
                {isAr
                  ? 'تم رصد اختلاف بين تاريخ التحميل المستهدف المعتمد للخطة وبين تواريخ هذا الطلب المسجلة. يمكنك اختيار تحديث تاريخ التحميل، أو تاريخ الفاتورة، أو المتابعة بالتاريخ الحالي دون تعديل.'
                  : 'A mismatch was detected between the plan target loading date and this order dates. You can choose to update the loading date, invoice date, or proceed with current dates.'}
              </p>

              {/* Date Comparison & Options Box */}
              <div className="space-y-3 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                {/* 1. Loading Date Section */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isAr ? 'تاريخ التحميل:' : 'Loading Date:'}</span>
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-slate-500">{dateMismatchModal.existingLoadingDate || (isAr ? 'غير محدد' : 'Unset')}</span>
                      {isAr ? (
                        <ArrowLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {dateMismatchModal.targetLoadingDate}
                      </span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 border-t border-slate-100 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(dateMismatchModal.updateLoadingDate)}
                      onChange={(e) =>
                        setDateMismatchModal((prev) => ({
                          ...prev,
                          updateLoadingDate: e.target.checked
                        }))
                      }
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-800">
                      {isAr
                        ? `تحديث تاريخ التحميل إلى (${dateMismatchModal.targetLoadingDate})`
                        : `Update Loading Date to (${dateMismatchModal.targetLoadingDate})`}
                    </span>
                  </label>
                </div>

                {/* 2. Invoice Date Section */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isAr ? 'تاريخ الفاتورة:' : 'Invoice Date:'}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {dateMismatchModal.existingInvoiceDate || (isAr ? 'غير محدد' : 'Unset')}
                    </span>
                  </div>

                  <label className="flex items-center gap-2 pt-1 border-t border-slate-100 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(dateMismatchModal.updateInvoiceDate)}
                      onChange={(e) =>
                        setDateMismatchModal((prev) => ({
                          ...prev,
                          updateInvoiceDate: e.target.checked
                        }))
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-800">
                      {isAr ? 'تعديل تاريخ الفاتورة أيضاً' : 'Update Invoice Date as well'}
                    </span>
                  </label>

                  {dateMismatchModal.updateInvoiceDate && (
                    <div className="pt-2 ps-6">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        {isAr ? 'تاريخ الفاتورة الجديد:' : 'New Invoice Date:'}
                      </label>
                      <input
                        type="date"
                        value={dateMismatchModal.customInvoiceDate}
                        onChange={(e) =>
                          setDateMismatchModal((prev) => ({
                            ...prev,
                            customInvoiceDate: e.target.value
                          }))
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                <button
                  type="button"
                  onClick={handleCancelDateMismatch}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleContinueWithoutDateChange}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                    title={isAr ? 'المتابعة بالتاريخ الأصلي دون تعديل' : 'Keep original dates'}
                  >
                    {isAr ? 'المتابعة بالتاريخ الأصلي' : 'Keep Original'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleConfirmDateMismatchUpdate({
                        updateLoading: dateMismatchModal.updateLoadingDate,
                        updateInvoice: dateMismatchModal.updateInvoiceDate,
                        newInvoiceDate: dateMismatchModal.customInvoiceDate
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isAr ? 'تطبيق التحديثات والمتابعة' : 'Apply & Continue'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INTENTIONAL ALIGNMENT DISCREPANCY CONFIRMATION MODAL */}
      {isIntentionalDiscrepancyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-start">
            <div className="px-6 py-4 border-b border-slate-200 bg-amber-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {isAr ? 'تأكيد تعارض التسكين المتعمد' : 'Confirm Intentional Dispatch Conflict'}
                  </h3>
                  <p className="text-[11px] font-bold text-amber-800">
                    {totalMisalignments} {isAr ? 'تعارض في بيانات الشاحنات أو السائقين' : 'conflict(s) detected'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIntentionalDiscrepancyModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-950 text-xs leading-relaxed">
                <span className="font-bold block mb-1">
                  {isAr ? 'تنبيه تدقيق المطابقة والتحميل:' : 'Alignment Verification Alert:'}
                </span>
                {isAr
                  ? 'تم رصد تعارض في تعيين الشاحنة أو السائق لأوامر تشترك في نفس رقم أمر التحميل لنفس اليوم. هل تؤكد أن هذا الاختلاف تم بشكل متعمد ومقصود وترغب في اعتماد الخطة بهذه الصورة؟'
                  : 'Different orders sharing the same Loading Order Number on the same date have conflicting trucks or drivers assigned. Do you confirm this discrepancy was made intentionally and wish to proceed with saving the plan?'}
              </div>

              {/* Conflicting Trucks List */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {truckManifest
                  .filter((t) => t.isMisaligned)
                  .map((t) => (
                    <div
                      key={t.compoundKey}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span className="font-mono text-amber-700">
                          {isAr ? 'رحلة #' : 'Trip #'}{t.loadingOrderNumber}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {t.loadingDate}
                        </span>
                        <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-mono">
                          {t.assignedOrders.length} {isAr ? 'أمر' : 'orders'}
                        </span>
                      </div>
                      <div className="text-[11px] text-rose-700 space-y-0.5 font-medium">
                        {t.hasVehicleMismatch && (
                          <div>• {isAr ? 'شاحنات مختلفة مسندة لنفس الرحلة' : 'Multiple conflicting trucks assigned'}</div>
                        )}
                        {t.hasDriverMismatch && (
                          <div>• {isAr ? 'سائقون مختلفون مسندون لنفس الرحلة' : 'Multiple conflicting drivers assigned'}</div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setIsIntentionalDiscrepancyModalOpen(false);
                    setIsManifestExpanded(true);
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5"
                >
                  <Truck className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isAr ? 'مراجعة وتوحيد بالبيان' : 'Review & Align'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsIntentionalDiscrepancyModalOpen(false)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsIntentionalDiscrepancyModalOpen(false);
                      handleCommitSavePlan();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isAr ? 'نعم، التعارض مقصود (متابعة الحفظ)' : 'Confirm Intentional (Proceed)'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATUS JUMP / REVERT CONFIRMATION MODAL */}
      {statusJumpConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-start">
            <div className="px-6 py-4 border-b border-slate-200 bg-indigo-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {isAr ? 'تأكيد تغيير حالة التنفيذ' : 'Confirm Fulfillment Status Change'}
                  </h3>
                  <p className="text-[11px] font-bold text-indigo-800">
                    #{resolveOrderSerial(statusJumpConfirmModal.order, orders)} — {statusJumpConfirmModal.order?.clientName || '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatusJumpConfirmModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold">{isAr ? 'الحالة الحالية:' : 'Current Status:'}</span>
                  <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {statusJumpConfirmModal.currentStepLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold">{isAr ? 'الحالة المستهدفة:' : 'Target Status:'}</span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {statusJumpConfirmModal.targetStepLabel}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-amber-900 text-xs leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{isAr ? 'تنبيه بصلاحية الإدارة:' : 'Admin Authorization Notice:'}</span>
                </div>
                <p>
                  {statusJumpConfirmModal.currentStepId === 'delivered'
                    ? (isAr
                        ? 'تنبيه: هذا الطلب مكتمل (تم التسليم). الرجوع في الحالة يتطلب صلاحية إدارة خاصة لتعديل أوامر البيع المقفلة. هل ترغب بالتأكيد في التراجع عن التسليم؟'
                        : 'Warning: This order has already been completed/delivered. Reverting requires special admin permission. Are you sure you want to revert delivered status?')
                    : (isAr
                        ? 'أنت على وشك تجاوز الترتيب التسلسلي الطبيعي لمراحل التنفيذ بصلاحية الإدارة العامة. هل ترغب في اعتماد هذا التغيير؟'
                        : 'You are about to change the fulfillment status non-sequentially using admin privileges. Do you wish to confirm this change?')}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStatusJumpConfirmModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStatusJump}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isAr ? 'تأكيد التغيير' : 'Confirm Change'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TRUCK BULK FULFILLMENT STATUS TRANSITION CONFIRMATION MODAL */}
      {truckStatusModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 text-start">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0 shadow-2xs">
                  <Truck className="w-5 h-5 rtl:-scale-x-100" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'تأكيد تحديث حالة رحلة الشاحنة' : 'Confirm Truck Trip Transition'}
                  </h4>
                  <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-black text-slate-900">
                      {resolveVehicleDisplayName(truckStatusModal.truck, isAr ? 'شاحنة' : 'Truck')}
                    </span>
                    {truckStatusModal.loadingOrderNumber && truckStatusModal.loadingOrderNumber !== 'unnumbered' && (
                      <>
                        <span>•</span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-black">
                          {isAr ? `رحلة #${truckStatusModal.loadingOrderNumber}` : `Trip #${truckStatusModal.loadingOrderNumber}`}
                        </span>
                      </>
                    )}
                    {truckStatusModal.truck?.plateNumber && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono font-bold text-slate-700">
                          <span>{truckStatusModal.truck.plateNumber}</span>
                          <CopyButton text={truckStatusModal.truck.plateNumber} title={isAr ? 'نسخ رقم اللوحة' : 'Copy Plate #'} isAr={isAr} />
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTruckStatusModal(null)}
                disabled={truckStatusModal.isExecuting}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="text-xs text-slate-600 font-medium">
                {isAr
                  ? `أنت على وشك تحديث حالة الطلبات المحددة في هذه الرحلة (${truckStatusModal.affectedOrders.length} أوامر) إلى:`
                  : `You are about to transition the checked orders in this trip (${truckStatusModal.affectedOrders.length} orders) to:`}
              </div>

              <div className="flex items-center justify-center gap-3 py-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs">
                  {isAr
                    ? (SEQUENTIAL_FULFILLMENT_STEPS.find((s) => s.id === normalizeFulfillmentStatus(truckStatusModal.affectedOrders[0]?.fulfillmentStatus))?.labelAr || 'الحالة الحالية')
                    : (SEQUENTIAL_FULFILLMENT_STEPS.find((s) => s.id === normalizeFulfillmentStatus(truckStatusModal.affectedOrders[0]?.fulfillmentStatus))?.labelEn || 'Current')}
                </span>
                {isAr ? (
                  <ArrowLeft className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className={`px-3 py-1 rounded-lg font-black text-xs border shadow-2xs ${
                  truckStatusModal.targetStep.color === 'emerald'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : truckStatusModal.targetStep.color === 'amber'
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : (truckStatusModal.targetStep.color === 'blue' || truckStatusModal.targetStep.color === 'teal')
                    ? 'bg-teal-100 text-teal-900 border-teal-300'
                    : 'bg-slate-100 text-slate-800 border-slate-300'
                }`}>
                  {isAr ? truckStatusModal.targetStep.labelAr : truckStatusModal.targetStep.labelEn}
                </span>
              </div>

              {truckStatusModal.targetStep?.id === 'shipped' && (() => {
                const allWhDispatched = truckStatusModal.affectedOrders.every((o) => Boolean(o.fgWarehouseDispatched));
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 text-[11px] font-bold">
                    <span className={`px-2 py-1 rounded-lg border ${
                      allWhDispatched
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-900 border-amber-300'
                    }`}>
                      {allWhDispatched
                        ? (isAr ? 'بوابة مخزن التام: معتمد ✓' : 'FG Warehouse Dispatch Gate: Confirmed ✓')
                        : (isAr ? 'تنبيه: بانتظار اعتماد صرف الشاحنة من تبويب تسليم الشاحنات' : 'Note: FG Warehouse Truck Dispatch not yet confirmed')}
                    </span>
                    <span className="px-2 py-1 rounded-lg border bg-slate-100 text-slate-600 border-slate-200">
                      {isAr ? 'بوابة المستندات المالية: قيد الإنشاء لاحقاً' : 'Financial Docs Gate: Next Phase'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const selectedIds = Array.isArray(truckStatusModal.selectedOrderIds)
                ? truckStatusModal.selectedOrderIds
                : truckStatusModal.affectedOrders.map((o) => o.id);
              const uncheckedCount = truckStatusModal.affectedOrders.length - selectedIds.length;

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>
                      {isAr
                        ? 'حدد الطلبات المكتملة (إلغاء التحديد يُرجع الطلب إلى قيد الانتظار ويفصله عن الرحلة):'
                        : 'Check orders to transition (unchecked orders return to Pending & detach from Trip #):'}
                    </span>
                    <span className="font-mono text-indigo-700 shrink-0">
                      {selectedIds.length} / {truckStatusModal.affectedOrders.length}
                    </span>
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                    {truckStatusModal.affectedOrders.map((ord) => {
                      const oSerial = resolveOrderSerial(ord, orders);
                      const isChecked = selectedIds.includes(ord.id);
                      return (
                        <label
                          key={ord.id}
                          className={`flex items-center justify-between gap-2 text-xs p-2 rounded-xl border transition cursor-pointer select-none ${
                            isChecked
                              ? 'bg-white border-indigo-200 shadow-2xs'
                              : 'bg-amber-50/80 border-amber-300 text-amber-950'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setTruckStatusModal((prev) => {
                                  const curr = Array.isArray(prev.selectedOrderIds)
                                    ? prev.selectedOrderIds
                                    : prev.affectedOrders.map((o) => o.id);
                                  const next = curr.includes(ord.id)
                                    ? curr.filter((id) => id !== ord.id)
                                    : [...curr, ord.id];
                                  return { ...prev, selectedOrderIds: next };
                                });
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                            />
                            <span className="font-mono font-black text-indigo-700 shrink-0">#{oSerial}</span>
                            <span className="font-bold text-slate-800 truncate">{ord.clientName || '—'}</span>
                            {ord.branchName && (
                              <span className="text-[10px] text-slate-500 truncate">({ord.branchName})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {truckStatusModal.targetStep?.id === 'delivered' &&
                              isChecked &&
                              isOrderRetailRoute(ord, clients, segments) &&
                              ord.retailSettlementStatus !== 'settled' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-[9px]">
                                  {isAr ? 'تجزئة ← بانتظار تأكيد المباع' : 'Retail → Pending Settlement'}
                                </span>
                              )}
                            {!isChecked && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold text-[9px]">
                                {isAr ? 'مرتجع ← قيد الانتظار' : 'Return → Pending'}
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-slate-500">
                              {(ord.totalCartons || ord.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {uncheckedCount > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        {isAr
                          ? `سيتم تحديث (${selectedIds.length}) طلب إلى "${truckStatusModal.targetStep.labelAr}"، بينما سيتم إرجاع (${uncheckedCount}) طلب غير محدد تلقائياً إلى "قيد الانتظار" وفصله عن الرحلة #${truckStatusModal.loadingOrderNumber || ''} لإعادة جدولته.`
                          : `${selectedIds.length} order(s) will advance to "${truckStatusModal.targetStep.labelEn}", while ${uncheckedCount} unchecked order(s) will revert to "Pending" and detach from Trip #${truckStatusModal.loadingOrderNumber || ''}.`}
                      </div>
                    </div>
                  )}

                  {truckStatusModal.targetStep.id === 'not_yet' && selectedIds.length > 0 && (
                    <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(truckStatusModal.unassignOnRevertToPending)}
                        onChange={(e) =>
                          setTruckStatusModal((prev) => ({
                            ...prev,
                            unassignOnRevertToPending: e.target.checked
                          }))
                        }
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>
                        {isAr
                          ? 'إلغاء تسكين الشاحنة ورقم الرحلة أيضاً (إرجاع كطلبات غير مسكنة)'
                          : 'Also clear Truck & Trip # assignment (return as unassigned Pending orders)'}
                      </span>
                    </label>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTruckStatusModal(null)}
                disabled={truckStatusModal.isExecuting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmTruckFulfillmentTransition}
                disabled={truckStatusModal.isExecuting}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {truckStatusModal.isExecuting ? (
                  <>
                    <PeacockLoader size="xs" text="" />
                    <span>{isAr ? 'جاري التحديث...' : 'Updating...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isAr ? 'تأكيد وتحديث الحالة' : 'Confirm & Apply'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Retail Van-Sales Arrival & Post-Return Quantity Settlement Modal */}
      {retailSettlementModal?.order && (
        <RetailSettlementModal
          isOpen={Boolean(retailSettlementModal?.order)}
          onClose={() => setRetailSettlementModal(null)}
          order={retailSettlementModal.order}
          canSettleRetailOrders={canSettleRetailOrders}
          allowDeferDelivery={Boolean(retailSettlementModal.allowDeferDelivery)}
          vehicles={vehicles}
          resolveVehicleDisplayName={resolveVehicleDisplayName}
          isAr={isAr}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          onSuccess={({ mode }) => {
            showToast(
              mode === 'deferred'
                ? (isAr ? 'تم تسجيل الوصول (بانتظار تأكيد الكميات المباعة)' : 'Marked Delivered (Awaiting Retail Settlement)')
                : mode === 'force_synced'
                  ? (isAr ? 'تم تحديث ومزامنة تسوية التجزئة بنجاح' : 'Retail settlement force-synced successfully')
                  : (isAr ? 'تم تأكيد الكميات المباعة وإتمام تسليم رحلة التجزئة' : 'Confirmed sold quantities & completed delivery')
            );
          }}
        />
      )}
      {/* Quick Delivery Sequence Modal for Saved Multi-Client Trips (from Truck Scorecard) */}
      {sequenceModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !sequenceModal.isSaving && setSequenceModal(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-black">
                    {isAr ? `أولوية التسليم — رحلة #${sequenceModal.trip.loadingOrderNumber}` : `Delivery Sequence — Trip #${sequenceModal.trip.loadingOrderNumber}`}
                  </h3>
                  <p className="text-[11px] text-slate-300 font-medium">
                    {isAr ? 'رتّب العملاء حسب أولوية النزول (اختياري)' : 'Order clients by delivery priority (optional)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={sequenceModal.isSaving}
                onClick={() => setSequenceModal(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">
              {(sequenceModal.stops || []).map((stop, idx) => (
                <div
                  key={stop.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-mono text-xs font-black inline-flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 truncate">
                        {stop.clientName}
                        {stop.branchName ? ` — ${stop.branchName}` : ''}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {stop.orders.map((o) => `#${resolveOrderSerial(o, orders)}`).join(' • ')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0 || sequenceModal.isSaving}
                      onClick={() => {
                        setSequenceModal((prev) => {
                          if (!prev) return null;
                          const next = [...prev.stops];
                          const [m] = next.splice(idx, 1);
                          next.splice(idx - 1, 0, m);
                          return { ...prev, stops: next, hasManualSequence: true };
                        });
                      }}
                      className="p-1.5 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 disabled:opacity-30 text-slate-700 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sequenceModal.stops.length - 1 || sequenceModal.isSaving}
                      onClick={() => {
                        setSequenceModal((prev) => {
                          if (!prev) return null;
                          const next = [...prev.stops];
                          const [m] = next.splice(idx, 1);
                          next.splice(idx + 1, 0, m);
                          return { ...prev, stops: next, hasManualSequence: true };
                        });
                      }}
                      className="p-1.5 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 disabled:opacity-30 text-slate-700 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              {sequenceModal.hasManualSequence ? (
                <button
                  type="button"
                  disabled={sequenceModal.isSaving}
                  onClick={() => handleSaveSequenceModal(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-slate-700 hover:text-rose-700 text-xs font-bold transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إلغاء (تلقائي)' : 'Reset Auto'}</span>
                </button>
              ) : (
                <span className="text-[10px] text-slate-500 font-bold">
                  {isAr ? 'الوضع الحالي: تلقائي' : 'Current mode: Auto'}
                </span>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={sequenceModal.isSaving}
                  onClick={() => setSequenceModal(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={sequenceModal.isSaving}
                  onClick={() => handleSaveSequenceModal(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black shadow-sm transition cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{sequenceModal.isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الأولوية' : 'Save Sequence')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standardized App-Wide Client & Branch Profile Modal */}
      <ClientProfileModal
        isOpen={Boolean(clientProfileTarget)}
        onClose={() => setClientProfileTarget(null)}
        client={clientProfileTarget?.client || null}
        clientId={clientProfileTarget?.clientId || ''}
        focusBranchId={clientProfileTarget?.branchId || ''}
        focusBranchName={clientProfileTarget?.branchName || ''}
        clients={clients}
        segments={segments}
        salesOrders={orders}
        isAr={isAr}
      />

      {/* Persistent Collapsible FG Stock & Deficit Intelligence Sidebar (Opposite Edge, Pushes Content Inward) */}
      <LoadingPlanFgSidebar
        finishedProducts={products}
        stagedPallets={stagedPallets}
        stockTransfers={stockTransfers}
        faultyReturns={faultyReturns}
        salesOrders={orders}
        workOrders={workOrders}
        truckDispatches={truckDispatches}
        stagedAssignments={stagedAssignments}
        targetPlanningDate={targetPlanningDate}
        todayStr={todayStr}
        isAr={isAr}
        isOpen={isFgSidebarOpen}
        onToggleOpen={setIsFgSidebarOpen}
        drawerWidth={FG_SIDEBAR_WIDTH}
      />
    </div>
  );
}
