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
  ExternalLink
} from 'lucide-react';
import {
  collection,
  doc,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase.js';
import SearchableSelect from './SearchableSelect.jsx';
import PeacockLoader from './PeacockLoader.jsx';
import { canAccessAction } from '../config/appArchitecture.js';
import { RowCommentButton } from './comments';
import { resolveLocationInfo, normalizeLocationUrl } from '../utils/locationUtils.js';
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
  { id: 'shipped', labelAr: 'جاري التوصيل', labelEn: 'Out for Delivery', color: 'emerald', icon: Truck },
  { id: 'delivered', labelAr: 'تم التسليم', labelEn: 'Delivered', color: 'teal', icon: CheckCircle2 },
  { id: 'paid', labelAr: 'مدفوع', labelEn: 'Paid', color: 'blue', icon: Banknote }
];

const SEQUENTIAL_FULFILLMENT_STEPS = [
  {
    id: 'not_yet',
    labelAr: 'قيد الانتظار',
    labelEn: 'Pending',
    icon: Clock,
    color: 'slate',
    badgeClasses: 'bg-slate-100 text-slate-700 border-slate-300',
    activeClasses: 'bg-slate-700 text-white border-slate-800 ring-2 ring-slate-500/30'
  },
  {
    id: 'prepare',
    labelAr: 'جاري التجهيز',
    labelEn: 'Preparing',
    icon: PackageCheck,
    color: 'amber',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
    activeClasses: 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400/30'
  },
  {
    id: 'shipped',
    labelAr: 'جاري التوصيل',
    labelEn: 'Out for Delivery',
    icon: Truck,
    color: 'emerald',
    badgeClasses: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    activeClasses: 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-500/30'
  },
  {
    id: 'delivered',
    labelAr: 'تم التسليم',
    labelEn: 'Delivered',
    icon: CheckCircle2,
    color: 'teal',
    badgeClasses: 'bg-teal-50 text-teal-800 border-teal-200',
    activeClasses: 'bg-teal-600 text-white border-teal-700 ring-2 ring-teal-500/30'
  }
];

const FULFILLMENT_CONFIG_MAP = {
  not_yet: {
    id: 'not_yet',
    labelAr: 'قيد الانتظار',
    labelEn: 'Pending',
    icon: Clock,
    color: 'slate',
    badgeClasses: 'bg-slate-100 text-slate-700 border-slate-300',
    stripClasses: 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200',
    textColor: 'text-slate-700'
  },
  prepare: {
    id: 'prepare',
    labelAr: 'جاري التجهيز',
    labelEn: 'Preparing',
    icon: PackageCheck,
    color: 'amber',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200',
    stripClasses: 'bg-amber-50/40 hover:bg-amber-50/70 border-amber-200',
    textColor: 'text-amber-800'
  },
  shipped: {
    id: 'shipped',
    labelAr: 'جاري التوصيل',
    labelEn: 'Out for Delivery',
    icon: Truck,
    color: 'emerald',
    badgeClasses: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    stripClasses: 'bg-emerald-50/40 hover:bg-emerald-50/70 border-emerald-200',
    textColor: 'text-emerald-800'
  },
  delivered: {
    id: 'delivered',
    labelAr: 'تم التسليم',
    labelEn: 'Delivered',
    icon: CheckCircle2,
    color: 'teal',
    badgeClasses: 'bg-teal-50 text-teal-800 border-teal-200',
    stripClasses: 'bg-teal-50/40 hover:bg-teal-50/70 border-teal-200',
    textColor: 'text-teal-800'
  },
  paid: {
    id: 'paid',
    labelAr: 'مدفوع',
    labelEn: 'Paid',
    icon: Banknote,
    color: 'blue',
    badgeClasses: 'bg-blue-50 text-blue-800 border-blue-200',
    stripClasses: 'bg-blue-50/40 hover:bg-blue-50/70 border-blue-200',
    textColor: 'text-blue-800'
  }
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

// Non-Intrusive Order Products & Prices Breakdown Modal
function OrderProductsDetailsModal({ isOpen, onClose, order, clients = [], segments = [], products = [], isAr = true }) {
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
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-start animate-in zoom-in-95 duration-150"
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
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                {order.invoiceDate && (
                  <span>{isAr ? 'تاريخ الفاتورة:' : 'Invoice Date:'} <strong className="font-mono text-slate-700">{order.invoiceDate}</strong></span>
                )}
                {order.loadingDate && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>{isAr ? 'التحميل:' : 'Loading:'} <strong className="font-mono text-slate-700">{order.loadingDate}</strong></span>
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
              {(totalWeightKg / 1000).toFixed(2)} {isAr ? 'طن' : 't'}
              <span className="text-[10px] text-slate-400 font-normal ms-1">({totalWeightKg.toLocaleString()} kg)</span>
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
        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {lines.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold">{isAr ? 'لا توجد أصناف مسجلة في هذا الطلب' : 'No items recorded in this order'}</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                    <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'البونص' : 'Bonus'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'الوزن' : 'Weight'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'الإجمالي (EGP)' : 'Total (EGP)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {lines.map((l, idx) => {
                    const lineQty = Number(l.qty) || 0;
                    const lineBonus = Number(l.bonus) || 0;
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

  const currentUserName = currentUser?.nameAr || currentUser?.name || 'مستخدم معتمد';
  const currentUserId = currentUser?.id || 'usr_unknown';

  // Cloud Collections State
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [segments, setSegments] = useState([]);
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
  const [groupBy, setGroupBy] = useState('loadingDate'); // 'loadingDate' | 'none' | 'region' | 'client' | 'loadingOrder' | 'fulfillmentStatus'
  const [sortBy, setSortBy] = useState('weight_desc'); // 'weight_desc' | 'weight_asc' | 'cartons_desc' | 'serial_asc' | 'client_asc'

  // Staged Assignments: Record<orderId, { loadingOrderNumber, assignedVehicleId, assignedVehiclePlate, assignedDriverId, assignedDriverName, assignedDeliveryRepId, assignedDeliveryRepName, loadingDate }>
  const [stagedAssignments, setStagedAssignments] = useState({});

  // Floating Dock Expanded State
  const [isManifestExpanded, setIsManifestExpanded] = useState(false);

  // Non-Intrusive Order Products & Prices Modal
  const [selectedOrderForProducts, setSelectedOrderForProducts] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Intentional Alignment Discrepancy Modal Confirmation
  const [isIntentionalDiscrepancyModalOpen, setIsIntentionalDiscrepancyModalOpen] = useState(false);

  // Status Jump Confirmation Modal (for admin jump or reverting delivered status)
  const [statusJumpConfirmModal, setStatusJumpConfirmModal] = useState(null);

  // Notification Toast
  const [toastMsg, setToastMsg] = useState(null);

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
        return (Number(b.serial) || 0) - (Number(a.serial) || 0);
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

  // 3. Subscribe to Workers Directory (production_workers + users + employees)
  useEffect(() => {
    let workers = [];
    let users = [];
    let emps = [];

    const rebuildWorkersPool = () => {
      const combined = [];
      const seenIds = new Set();

      // Priority 1: Production Workers (existing workers directory)
      workers.forEach((w) => {
        if (!w.id || seenIds.has(w.id)) return;
        if (w.isActive === false || w.status === 'inactive') return;
        seenIds.add(w.id);
        const roleLabel = WORKER_ROLE_LABELS[w.role]?.[isAr ? 'ar' : 'en'] || w.role || (isAr ? 'عامل' : 'Worker');
        combined.push({
          id: w.id,
          name: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
          nameAr: w.nameAr || w.name || '',
          nameEn: w.nameEn || w.name || '',
          role: roleLabel,
          department: w.department || ''
        });
      });

      // Priority 2: System Users
      users.forEach((u) => {
        if (!u.id || seenIds.has(u.id)) return;
        if (u.isActive === false || u.status === 'inactive') return;
        seenIds.add(u.id);
        combined.push({
          id: u.id,
          name: isAr ? (u.nameAr || u.name) : (u.name || u.nameAr),
          nameAr: u.nameAr || u.name || '',
          nameEn: u.nameEn || u.name || '',
          role: u.role || (isAr ? 'مستخدم' : 'User'),
          department: u.department || ''
        });
      });

      // Priority 3: Employees (if any exist in employees collection)
      emps.forEach((e) => {
        if (!e.id || seenIds.has(e.id)) return;
        seenIds.add(e.id);
        combined.push({
          id: e.id,
          name: isAr ? (e.nameAr || e.name) : (e.name || e.nameAr),
          nameAr: e.nameAr || e.name || '',
          nameEn: e.nameEn || e.name || '',
          role: e.role || (isAr ? 'موظف' : 'Staff'),
          department: e.department || ''
        });
      });

      combined.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
      setEmployees(combined);
    };

    const unsubWorkers = onSnapshot(collection(db, 'production_workers'), (snapshot) => {
      workers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rebuildWorkersPool();
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rebuildWorkersPool();
    });

    const unsubEmps = onSnapshot(collection(db, 'employees'), (snapshot) => {
      emps = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rebuildWorkersPool();
    });

    return () => {
      unsubWorkers();
      unsubUsers();
      unsubEmps();
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
      assignedVehicleName: order.assignedVehicleName || matchedVeh?.vehicleModel || matchedVeh?.name || matchedVeh?.nameAr || matchedVeh?.code || '',
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
          updated.assignedVehicleName = matchedVeh.vehicleModel || matchedVeh.name || matchedVeh.nameAr || matchedVeh.code || '';
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

  // Card-level save check: validate mandatory fields only if advancing from pending; pending status or unplanned bypasses mandatory assignment fields
  const handleSaveCardAssignment = (order) => {
    const eff = getEffectiveAssignment(order);
    const targetStatus = eff.fulfillmentStatus || order.fulfillmentStatus || 'not_yet';
    const isPending = targetStatus === 'not_yet';
    const isMandatoryFilled = isPending || Boolean(
      eff.loadingOrderNumber &&
      Number(eff.loadingOrderNumber) > 0 &&
      eff.assignedVehicleId &&
      eff.assignedDriverId
    );
    if (!isMandatoryFilled) return;

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

    // 2. FORWARD MOVEMENT:
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

    // MANDATORY CHECK: Moving forward from 'pending' status requires mandatory assignment fields!
    const eff = getEffectiveAssignment(order);
    if (currentIndex === 0) {
      const isAssigned = Boolean(
        eff.loadingOrderNumber &&
        Number(eff.loadingOrderNumber) > 0 &&
        eff.assignedVehicleId &&
        eff.assignedDriverId
      );
      if (!isAssigned) {
        showToast(
          isAr
            ? 'يرجى إكمال بيانات التسكين الإلزامية (رقم أمر التحميل، السيارة، والسائق) أولاً قبل بدء التجهيز والتنفيذ'
            : 'Please complete mandatory assignment fields (LO #, Truck, Driver) before advancing from Pending.',
          'error'
        );
        return;
      }
    }

    // Standard 1-step forward (Clickable Next)
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

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Exclude purely administrative or non-delivery orders
      if (order.orderType === 'admin' || order.orderType === 'collection') {
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

      // Date Scope Filter
      if (dateScope === 'all_pending') {
        // Default to all orders with 'pending' fulfillment status (not_yet or undefined) across all dates
        if (order.fulfillmentStatus && order.fulfillmentStatus !== 'not_yet') {
          return false;
        }
      } else if (dateScope === 'today') {
        if (effectiveDate !== todayStr) return false;
      } else if (dateScope === 'tomorrow') {
        if (effectiveDate !== tomorrowStr) return false;
      } else if (dateScope === 'week') {
        if (!effectiveDate || effectiveDate < todayStr || effectiveDate > weekEndStr) return false;
      } else if (dateScope === 'custom') {
        if (effectiveDate !== customDate) return false;
      }

      // Fulfillment status filter
      if (fulfillmentFilter !== 'all') {
        if (order.fulfillmentStatus !== fulfillmentFilter) return false;
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
  }, [orders, stagedAssignments, dateScope, todayStr, tomorrowStr, weekEndStr, customDate, confirmedOnly, fulfillmentFilter, searchTerm]);

  // Sorted Orders
  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
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
        return (Number(a.serial) || 0) - (Number(b.serial) || 0);
      }
      if (sortBy === 'client_asc') {
        return String(a.clientName || '').localeCompare(String(b.clientName || ''), 'ar');
      }
      return 0;
    });
    return list;
  }, [filteredOrders, sortBy]);

  // Grouped Orders
  const groupedOrders = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupKey: 'all', groupLabel: '', items: sortedOrders }];
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
          if (isTarget) tag = isAr ? ' [تاريخ التسكين المستهدف]' : ' [Target Plan Date]';
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
        const tName = eff.assignedVehicleName || vObj?.vehicleModel || vObj?.name || vObj?.code || '';
        key = eff.loadingOrderNumber ? `lo_${eff.loadingOrderNumber}` : 'unassigned';
        label = eff.loadingOrderNumber
          ? `${isAr ? 'أمر تحميل #' : 'Loading Order #'}${eff.loadingOrderNumber}${tName ? ` — ${tName}` : ''}`
          : (isAr ? 'غير مسكن بشاحنة' : 'Unassigned to Truck');
      } else if (groupBy === 'fulfillmentStatus') {
        const fulf = FULFILLMENT_STATUSES.find((f) => f.id === order.fulfillmentStatus);
        key = order.fulfillmentStatus || 'not_yet';
        label = isAr ? (fulf?.labelAr || key) : (fulf?.labelEn || key);
      }

      if (!groups[key]) {
        groups[key] = { groupKey: key, groupLabel: label, items: [] };
      }
      groups[key].items.push(order);
    });

    const groupList = Object.values(groups);

    // Group Sorting: for loadingDate, targetPlanningDate on top, then descending, unscheduled last
    if (groupBy === 'loadingDate') {
      groupList.sort((a, b) => {
        if (a.groupKey === targetPlanningDate) return -1;
        if (b.groupKey === targetPlanningDate) return 1;
        if (a.groupKey === 'unscheduled') return 1;
        if (b.groupKey === 'unscheduled') return -1;
        return b.groupKey.localeCompare(a.groupKey);
      });
    }

    return groupList;
  }, [sortedOrders, groupBy, isAr, stagedAssignments, targetPlanningDate, todayStr, tomorrowStr, vehicles]);

  // Active Trucks / Loading Orders Manifest Analysis (COMPOUND ALIGNMENT: loadingDate + loadingOrderNumber)
  const truckManifest = useMemo(() => {
    const loGroups = {};

    const allRelevantOrders = orders.filter((o) => o.orderType !== 'admin' && o.orderType !== 'collection');

    allRelevantOrders.forEach((order) => {
      const eff = getEffectiveAssignment(order);
      const loNum = Number(eff.loadingOrderNumber);
      if (!loNum) return;

      const loDate = eff.loadingDate || targetPlanningDate || todayStr;
      const compoundKey = `${loDate}_#${loNum}`;

      if (!loGroups[compoundKey]) {
        loGroups[compoundKey] = {
          compoundKey,
          loadingOrderNumber: loNum,
          loadingDate: loDate,
          dismissNumber: calculateDismissNumber(loDate, loNum),
          vehiclesAssigned: new Set(),
          driversAssigned: new Set(),
          repsAssigned: new Set(),
          assignedOrders: [],
          totalCartons: 0,
          totalWeightKg: 0,
          primaryVehicleId: eff.assignedVehicleId,
          primaryVehicleName: eff.assignedVehicleName || '',
          primaryVehiclePlate: eff.assignedVehiclePlate,
          primaryDriverId: eff.assignedDriverId,
          primaryDriverName: eff.assignedDriverName,
          primaryRepId: eff.assignedDeliveryRepId,
          primaryRepName: eff.assignedDeliveryRepName
        };
      }

      const g = loGroups[compoundKey];
      if (eff.assignedVehicleId) {
        g.vehiclesAssigned.add(eff.assignedVehicleId);
        if (!g.primaryVehicleName) {
          const vObj = vehicles.find((v) => v.id === eff.assignedVehicleId);
          g.primaryVehicleName = eff.assignedVehicleName || vObj?.vehicleModel || vObj?.name || vObj?.code || '';
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

  // Check if any staged assignment has missing mandatory fields (LO #, Vehicle, or Driver)
  // Note: Orders at pending/unplanned status or stepped backward to pending bypass mandatory fields
  const hasIncompleteStagedOrder = useMemo(() => {
    return Object.entries(stagedAssignments).some(([orderId, eff]) => {
      const originalOrder = orders.find((o) => o.id === orderId);
      const targetStatus = eff.fulfillmentStatus || originalOrder?.fulfillmentStatus || 'not_yet';
      // Orders at pending/unplanned status don't require mandatory truck/driver fields
      if (targetStatus === 'not_yet') {
        return false;
      }
      // If order is completely cleared (no LO #, vehicle, or driver), it's a valid clear
      if (!eff.loadingOrderNumber && !eff.assignedVehicleId && !eff.assignedDriverId) {
        return false;
      }
      return (
        !eff.loadingOrderNumber ||
        Number(eff.loadingOrderNumber) <= 0 ||
        !eff.assignedVehicleId ||
        !eff.assignedDriverId
      );
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
            assignedVehicleName: veh ? (veh.vehicleModel || veh.name || veh.code || '') : eff.assignedVehicleName,
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
        ? `تمت مطابقة وتوحيد بيانات الشاحنة والسائق لأمر تحميل #${loNumber} بتاريخ (${targetLoadingDate}) بنجاح`
        : `Truck and driver aligned for LO #${loNumber} on ${targetLoadingDate}`
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
      alert(isAr ? 'لا يمكن حفظ الخطة! يوجد طلبات غير مكتملة البيانات الإلزامية (رقم أمر التحميل، السيارة، أو السائق). يرجى استكمالها أولاً.' : 'Cannot save plan! Some orders have incomplete mandatory fields (LO #, Truck, or Driver). Please complete them first.');
      return;
    }

    // Check if any scheduled order (non-pending) is missing a vehicle or driver
    const stagedList = Object.entries(stagedAssignments);
    for (const [orderId, eff] of stagedList) {
      const originalOrder = orders.find((o) => o.id === orderId);
      const targetStatus = eff.fulfillmentStatus || originalOrder?.fulfillmentStatus || 'not_yet';
      if (targetStatus !== 'not_yet' && eff.loadingOrderNumber) {
        if (!eff.assignedVehicleId) {
          alert(isAr ? `أمر التحميل #${eff.loadingOrderNumber} ينقصه اختيار السيارة!` : `LO #${eff.loadingOrderNumber} is missing a selected truck!`);
          return;
        }
        if (!eff.assignedDriverId) {
          alert(isAr ? `أمر التحميل #${eff.loadingOrderNumber} ينقصه تعيين السائق!` : `LO #${eff.loadingOrderNumber} is missing an assigned driver!`);
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

        // Add audit trail entry
        const existingAudit = Array.isArray(originalOrder?.auditTrail) ? originalOrder.auditTrail : [];
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

        batch.update(orderRef, updatePayload);
        updatedCount++;
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
    <div className="space-y-4 max-w-[1700px] w-full mx-auto px-2 sm:px-4 lg:px-6 pb-32">
      {/* Toast Notification */}
      {toastMsg && (
        <div className={`fixed top-4 end-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg border text-xs font-bold transition animate-in fade-in ${
          toastMsg.type === 'info'
            ? 'bg-slate-900 text-white border-slate-800'
            : 'bg-emerald-600 text-white border-emerald-700'
        }`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg.message}</span>
        </div>
      )}

      {/* TOP FILTER & GROUPING RIBBON */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5">
        {/* Row 1: Date Scope Shortcuts & Overall Scope Stats */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-600 font-bold text-xs flex items-center gap-1.5 me-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>{isAr ? 'نطاق عرض الأوامر:' : 'Orders Scope:'}</span>
            </span>

            {/* Scope Shortcuts */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setDateScope('all_pending')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  dateScope === 'all_pending'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? 'كافة المعلقة' : 'All Pending'}
              </button>

              <button
                type="button"
                onClick={() => setDateScope('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  dateScope === 'today'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? 'اليوم' : 'Today'}
              </button>

              <button
                type="button"
                onClick={() => setDateScope('tomorrow')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  dateScope === 'tomorrow'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? 'غداً' : 'Tomorrow'}
              </button>

              <button
                type="button"
                onClick={() => setDateScope('week')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  dateScope === 'week'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? 'خلال 7 أيام' : 'Next 7 Days'}
              </button>

              <div className="flex items-center gap-1 ms-1">
                <button
                  type="button"
                  onClick={() => setDateScope('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    dateScope === 'custom'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'تاريخ مخصص' : 'Custom Scope'}
                </button>

                {dateScope === 'custom' && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-emerald-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Scope Summary Badge */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-bold">{activeDateScopeLabel}</span>
            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl font-mono text-[11px] font-bold text-slate-700">
              <span>{filteredOrders.length} {isAr ? 'أمر' : 'orders'}</span>
              <span className="text-slate-300">•</span>
              <span>
                {filteredOrders.reduce((s, o) => s + (Number(o.totalCartons || o.totalQty) || 0), 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-700 font-black">
                {(filteredOrders.reduce((s, o) => s + (Number(o.totalWeightKg) || 0), 0) / 1000).toFixed(1)} {isAr ? 'طن' : 't'}
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
              <option value="loadingDate">{isAr ? 'تجميع: تاريخ التحميل' : 'Group: Loading Date'}</option>
              <option value="none">{isAr ? 'تجميع: بدون' : 'Group: None'}</option>
              <option value="region">{isAr ? 'تجميع: المنطقة' : 'Group: Region'}</option>
              <option value="client">{isAr ? 'تجميع: العميل' : 'Group: Client'}</option>
              <option value="loadingOrder">{isAr ? 'تجميع: الشاحنة' : 'Group: Truck'}</option>
              <option value="fulfillmentStatus">{isAr ? 'تجميع: حالة التنفيذ' : 'Group: Status'}</option>
            </select>
          </div>

          {/* Sort By Selector */}
          <div className="lg:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="weight_desc">{isAr ? 'ترتيب: الأثقل وزناً' : 'Sort: Heaviest'}</option>
              <option value="weight_asc">{isAr ? 'ترتيب: الأخف وزناً' : 'Sort: Lightest'}</option>
              <option value="cartons_desc">{isAr ? 'ترتيب: الأكثر كراتين' : 'Sort: Most Cartons'}</option>
              <option value="serial_asc">{isAr ? 'ترتيب: رقم الطلب' : 'Sort: Serial #'}</option>
              <option value="client_asc">{isAr ? 'ترتيب: اسم العميل' : 'Sort: Client Name'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* TARGET LOADING DATE DEDICATED SUB-BAR (Below Filter Bar) */}
      <div className="bg-gradient-to-r from-amber-50/90 via-amber-50/50 to-slate-50 border border-amber-200/90 rounded-3xl p-3.5 sm:px-5 sm:py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
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
          {groupedOrders.map((group) => (
            <div key={group.groupKey} className="space-y-3">
              {/* Optional Group Header */}
              {groupBy !== 'none' && (
                <div className="flex items-center justify-between px-2 pt-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      group.groupKey === targetPlanningDate ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                    }`}></span>
                    <h3 className="font-black text-slate-800 text-sm">{group.groupLabel}</h3>
                    <span className="text-[11px] font-mono font-bold text-slate-400">
                      ({group.items.length} {isAr ? 'أوامر' : 'orders'})
                    </span>
                  </div>

                  <div className="text-xs font-mono font-bold text-slate-500 flex items-center gap-2">
                    <span>{group.items.reduce((s, o) => s + (Number(o.totalCartons || o.totalQty) || 0), 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-emerald-700 font-black">{(group.items.reduce((s, o) => s + (Number(o.totalWeightKg) || 0), 0) / 1000).toFixed(1)} {isAr ? 'طن' : 't'}</span>
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

                  // Driver match indicator
                  const selectedVehicle = vehicles.find((v) => v.id === eff.assignedVehicleId);
                  const isDefaultDriver = selectedVehicle?.driverUserId && selectedVehicle.driverUserId === eff.assignedDriverId;
                  const truckDisplayName = eff.assignedVehicleName || selectedVehicle?.vehicleModel || selectedVehicle?.name || selectedVehicle?.nameAr || selectedVehicle?.code || '';

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
                      className={`bg-white rounded-3xl border transition-all duration-300 shadow-xs overflow-hidden ${
                        isOrderLocked
                          ? 'border-slate-200/80 bg-slate-50/50 opacity-80'
                          : isEditing
                          ? 'border-indigo-400 ring-2 ring-indigo-500/20 shadow-md'
                          : isStaged
                          ? 'border-emerald-400 ring-2 ring-emerald-500/20 shadow-md'
                          : 'border-slate-200/90 hover:border-slate-300'
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
                                      <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
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

                                <div
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-xs font-black shadow-2xs max-w-full truncate"
                                  style={{
                                    backgroundColor: segColor,
                                    color: getContrastTextColor(segColor)
                                  }}
                                  title={order.clientName || '—'}
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
                                </div>

                                {showBranchName && (
                                  <div className="text-[10px] font-bold text-slate-500 truncate" title={order.branchName}>
                                    {order.branchName}
                                  </div>
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

                                {clientNotes && (
                                  <div className="text-[9px] text-amber-900 bg-amber-50/90 p-1 rounded border border-amber-200 line-clamp-2" title={clientNotes}>
                                    <span className="font-bold">{isAr ? 'ملاحظة:' : 'Note:'}</span> {clientNotes}
                                  </div>
                                )}
                              </div>

                              <div className="pt-2 border-t border-slate-200/70">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOrderForProducts(order);
                                  }}
                                  className="text-xs font-mono font-black text-slate-900 hover:text-indigo-600 inline-flex items-center gap-1 cursor-pointer transition group/ctn"
                                  title={isAr ? 'عرض تفاصيل المنتجات والكميات والأسعار' : 'View products, quantities and prices breakdown'}
                                >
                                  <Boxes className="w-3.5 h-3.5 text-amber-600 group-hover/ctn:scale-110 transition-transform shrink-0" />
                                  <span>{(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}</span>
                                </button>
                              </div>
                            </div>

                            {/* Ultra-Compact Assignment Form Panel (80% width) - Header and Footer removed */}
                            <div className="w-full md:w-[80%] p-3 sm:p-4 bg-white flex flex-col justify-between gap-3 text-start transition-all duration-700 ease-out origin-right rtl:origin-left animate-in fade-in slide-in-from-right-16 rtl:slide-in-from-left-16 duration-700">
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
                                  {/* 1. Loading Order Number */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                      {isAr ? 'رقم التحميل:' : 'LO #:'} *
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
                                        const truckName = v.vehicleModel || v.name || v.nameAr || v.code || v.plateNumber;
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

                                  {/* Save / Check Button (Disabled if mandatory data is missing) */}
                                  <button
                                    type="button"
                                    disabled={!isMandatoryFilled}
                                    onClick={() => handleSaveCardAssignment(order)}
                                    className={`group/btn inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl transition-all duration-300 shadow-xs overflow-hidden ${
                                      isMandatoryFilled
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50 shadow-none'
                                    }`}
                                    title={
                                      isMandatoryFilled
                                        ? (isAr ? 'حفظ' : 'Save')
                                        : (isAr ? 'يرجى إكمال البيانات الإلزامية: (رقم التحميل، السيارة، والسائق)' : 'Please fill all mandatory fields: LO #, Truck, Driver')
                                    }
                                  >
                                    <Check className="w-4 h-4 shrink-0" />
                                    {isMandatoryFilled && (
                                      <span className="max-w-0 opacity-0 group-hover/btn:max-w-xs group-hover/btn:opacity-100 transition-all duration-300 text-xs font-bold whitespace-nowrap overflow-hidden">
                                        {isAr ? 'حفظ' : 'Save'}
                                      </span>
                                    )}
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
                                    <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  </button>

                                  <RowCommentButton
                                    docId={order.id}
                                    docNumber={orderSerial ? `SO-${orderSerial}` : (order.id || 'Order')}
                                    tab="loading_plan"
                                    module="sales"
                                  />

                                  {/* Fulfillment Status Badge - Styled matching SalesOrdersMaster */}
                                  {currentFulfillmentStatus && (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border shadow-2xs ${currentStatusConfig.badgeClasses}`}>
                                      {isClosedOrder ? (
                                        <Lock className="w-3 h-3 shrink-0" />
                                      ) : currentStatusConfig.color === 'amber' ? (
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                      ) : (
                                        <CurrentStatusIcon className={`w-3 h-3 shrink-0 ${
                                          currentStatusConfig.color === 'emerald' ? 'animate-pulse text-emerald-600' :
                                          currentStatusConfig.color === 'teal' ? 'text-teal-600' :
                                          currentStatusConfig.color === 'blue' ? 'text-blue-600' :
                                          'text-slate-600'
                                        }`} />
                                      )}
                                      <span>
                                        {isAr ? currentStatusConfig.labelAr : currentStatusConfig.labelEn}
                                      </span>
                                    </span>
                                  )}

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

                                {/* Cartons Summary Badge */}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderForProducts(order);
                                    }}
                                    className="font-bold text-slate-900 text-xs font-mono inline-flex items-center gap-1 hover:text-indigo-600 px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200 transition cursor-pointer group/ctn shadow-2xs"
                                    title={isAr ? 'انقر لعرض تفاصيل المنتجات والكميات والأسعار' : 'Click to view products, quantities and prices breakdown'}
                                  >
                                    <Boxes className="w-3.5 h-3.5 text-amber-600 group-hover/ctn:scale-110 transition-transform shrink-0" />
                                    <span>{(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}</span>
                                    {order.totalBonus > 0 ? (
                                      <span className="text-emerald-700 text-[10px] font-bold ms-0.5">+{order.totalBonus}</span>
                                    ) : null}
                                  </button>
                                </div>
                              </div>

                              {/* Client & Branch & Region & Maps */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black shadow-2xs max-w-full truncate"
                                    style={{
                                      backgroundColor: segColor,
                                      color: getContrastTextColor(segColor)
                                    }}
                                    title={order.clientName || order.clientId || '—'}
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
                                  </div>
                                  {showBranchName && (
                                    <span className="text-xs font-bold text-slate-500">
                                      ({order.branchName})
                                    </span>
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

                              {/* CHIPS OF TOTAL PER PRODUCT QTY (Space-Saving) */}
                              {Array.isArray(order.items) && order.items.length > 0 && (
                                <div className="pt-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {order.items.map((it, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                                        title={`${it.nameAr || it.productName || it.itemCode}: ${it.quantity} كرتونة`}
                                      >
                                        <span className="truncate max-w-[140px]">{it.nameAr || it.productName || it.name || it.itemCode}</span>
                                        <span className="text-emerald-700 font-mono font-black">
                                          ({it.quantity} {isAr ? 'ك' : 'c'})
                                        </span>
                                      </span>
                                    ))}
                                  </div>
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
                                    <Truck className="w-3.5 h-3.5" />
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
                                  <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md font-bold border ${currentStatusConfig.badgeClasses}`}>
                                    <CurrentStatusIcon className={`w-2.5 h-2.5 shrink-0 ${
                                      currentStatusConfig.color === 'amber' ? 'text-amber-600' :
                                      currentStatusConfig.color === 'emerald' ? 'text-emerald-600' :
                                      currentStatusConfig.color === 'teal' ? 'text-teal-600' :
                                      currentStatusConfig.color === 'blue' ? 'text-blue-600' :
                                      'text-slate-500'
                                    }`} />
                                    <span>{isAr ? currentStatusConfig.labelAr : currentStatusConfig.labelEn}</span>
                                  </span>
                                </div>

                                {/* 2x2 Cell Badge Box */}
                                <div className="grid grid-cols-2 gap-1.5 text-start">
                                  {/* Cell 1: LO Number */}
                                  <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs font-mono font-black text-xs text-slate-800 flex items-center gap-1 truncate">
                                    <Truck className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>#{eff.loadingOrderNumber}</span>
                                  </div>

                                  {/* Cell 2: Vehicle Truck Name (Only Truck Name, no plate) */}
                                  <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs text-[10px] font-bold text-slate-800 truncate" title={truckDisplayName || eff.assignedVehiclePlate}>
                                    {truckDisplayName || eff.assignedVehiclePlate || '—'}
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
                                    <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  </button>

                                  <RowCommentButton
                                    docId={order.id}
                                    docNumber={orderSerial ? `SO-${orderSerial}` : (order.id || 'Order')}
                                    tab="loading_plan"
                                    module="sales"
                                  />

                                  {/* Fulfillment Status Badge - Styled matching SalesOrdersMaster */}
                                  {currentFulfillmentStatus && (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border shadow-2xs ${currentStatusConfig.badgeClasses}`}>
                                      {isClosedOrder ? (
                                        <Lock className="w-3 h-3 shrink-0" />
                                      ) : currentStatusConfig.color === 'amber' ? (
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                        </span>
                                      ) : (
                                        <CurrentStatusIcon className={`w-3 h-3 shrink-0 ${
                                          currentStatusConfig.color === 'emerald' ? 'animate-pulse text-emerald-600' :
                                          currentStatusConfig.color === 'teal' ? 'text-teal-600' :
                                          currentStatusConfig.color === 'blue' ? 'text-blue-600' :
                                          'text-slate-600'
                                        }`} />
                                      )}
                                      <span>
                                        {isAr ? currentStatusConfig.labelAr : currentStatusConfig.labelEn}
                                      </span>
                                    </span>
                                  )}

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

                                {/* Cartons Summary Badge */}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderForProducts(order);
                                    }}
                                    className="font-bold text-slate-900 text-xs font-mono inline-flex items-center gap-1 hover:text-indigo-600 px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200 transition cursor-pointer group/ctn shadow-2xs"
                                    title={isAr ? 'انقر لعرض تفاصيل المنتجات والكميات والأسعار' : 'Click to view products, quantities and prices breakdown'}
                                  >
                                    <Boxes className="w-3.5 h-3.5 text-amber-600 group-hover/ctn:scale-110 transition-transform shrink-0" />
                                    <span>{(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}</span>
                                    {order.totalBonus > 0 ? (
                                      <span className="text-emerald-700 text-[10px] font-bold ms-0.5">+{order.totalBonus}</span>
                                    ) : null}
                                  </button>
                                </div>
                              </div>

                              {/* Client & Branch & Region & Maps */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black shadow-2xs max-w-full truncate"
                                    style={{
                                      backgroundColor: segColor,
                                      color: getContrastTextColor(segColor)
                                    }}
                                    title={order.clientName || order.clientId || '—'}
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
                                  </div>
                                  {showBranchName && (
                                    <span className="text-xs font-bold text-slate-500">
                                      ({order.branchName})
                                    </span>
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

                              {/* CHIPS OF TOTAL PER PRODUCT QTY (Space-Saving) */}
                              {Array.isArray(order.items) && order.items.length > 0 && (
                                <div className="pt-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {order.items.map((it, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                                        title={`${it.nameAr || it.productName || it.itemCode}: ${it.quantity} كرتونة`}
                                      >
                                        <span className="truncate max-w-[140px]">{it.nameAr || it.productName || it.name || it.itemCode}</span>
                                        <span className="text-emerald-700 font-mono font-black">
                                          ({it.quantity} {isAr ? 'ك' : 'c'})
                                        </span>
                                      </span>
                                    ))}
                                  </div>
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
                                    <Truck className="w-4 h-4" />
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
          ))}
        </div>
      )}

      {/* FLOATING BOTTOM VALIDATION & REVIEW DOCK */}
      {stagedOrdersCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-8 z-40 animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden">
            {/* Expanded Manifest Drawer (Cards per Compound Truck/Date Key) */}
            {isManifestExpanded && (
              <div className="p-4 sm:p-5 border-b border-slate-800 max-h-[55vh] overflow-y-auto space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-extrabold text-sm text-white">
                      {isAr ? 'بيان الشاحنات وأوامر التحميل المجدولة' : 'Scheduled Trucks & Loading Manifest'}
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {truckManifest.length} {isAr ? 'رحلات / شاحنات مجدولة' : 'truck trips scheduled'}
                  </span>
                </div>

                {/* Grid of Trucks */}
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
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-black text-amber-400">
                                #{tm.loadingOrderNumber}
                              </span>
                              <span className="font-bold text-white text-xs truncate max-w-[140px]" title={tm.primaryVehicleName}>
                                {tm.primaryVehicleName || (isAr ? 'شاحنة' : 'Truck')}
                              </span>
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
                              docNumber={isAr ? `إذن تحميل #${tm.loadingOrderNumber}` : `Loading #${tm.loadingOrderNumber}`}
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

                        {/* Assigned Orders Chips with Order Serial & Client Name */}
                        {Array.isArray(tm.assignedOrders) && tm.assignedOrders.length > 0 && (
                          <div className="pt-2 border-t border-slate-700/60 mb-2">
                            <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                              <span>{isAr ? 'الطلبات المحملة:' : 'Loaded Orders:'}</span>
                              <span className="font-mono text-[9px] text-slate-500">
                                {tm.assignedOrders.length} {isAr ? 'أمر' : 'orders'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                              {tm.assignedOrders.map((ord) => {
                                const oSerial = resolveOrderSerial(ord, orders);
                                return (
                                  <span
                                    key={ord.id}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-900/90 text-slate-200 border border-slate-700 truncate max-w-full"
                                    title={`#${oSerial} — ${ord.clientName || '—'}`}
                                  >
                                    <span className="font-mono text-amber-400 font-black shrink-0">#{oSerial}</span>
                                    <span className="truncate">{ord.clientName || (isAr ? 'عميل' : 'Client')}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

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
                              {(tm.totalWeightKg / 1000).toFixed(2)} / {tm.maxCap ? `${(tm.maxCap / 1000).toFixed(1)}t` : '—'}
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
                              <span>{isAr ? `تعارض في أمر تحميل #${tm.loadingOrderNumber} بتاريخ (${tm.loadingDate})!` : `Truck/Driver Conflict in LO #${tm.loadingOrderNumber} on ${tm.loadingDate}!`}</span>
                            </div>
                            <p className="text-[10px] text-rose-200">
                              {isAr ? 'أوامر مختلفة بنفس رقم التحميل لنفس اليوم مسندة لشاحنات وسائقين متباينين.' : 'Different orders in this LO on this date have conflicting trucks/drivers.'}
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
                  <Truck className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isAr ? 'بيان الشاحنات' : 'Trucks Manifest'}</span>
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
                      <span className="text-slate-400">→</span>
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
                          {isAr ? 'أمر تحميل #' : 'LO #'}{t.loadingOrderNumber}
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
                          <div>• {isAr ? 'شاحنات مختلفة مسندة لنفس أمر التحميل' : 'Multiple conflicting trucks assigned'}</div>
                        )}
                        {t.hasDriverMismatch && (
                          <div>• {isAr ? 'سائقون مختلفون مسندون لنفس أمر التحميل' : 'Multiple conflicting drivers assigned'}</div>
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
                      setIsSaveModalOpen(true);
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
    </div>
  );
}
