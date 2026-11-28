import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  Building2,
  X,
  Edit3,
  FileText,
  Phone,
  Mail,
  Boxes,
  Navigation,
  Paperclip,
  Eye,
  Clock,
  Calendar,
  MapPin,
  User,
  ShoppingCart,
  Receipt,
  ChevronDown,
  ChevronUp,
  Package,
  Store,
  CheckCircle2,
  Truck,
  Banknote,
} from 'lucide-react';
import { db, openBase64Document } from '../firebase';
import PeacockLoader from './PeacockLoader';
import VatNumberDisplay from './VatNumberDisplay';
import { PricingStrategyBadge } from './PricingStrategiesModal';
import { SEGMENT_ICON_MAP } from './ClientSegmentsMaster';
import { DEFAULT_PRICING_STRATEGIES } from '../utils/pricingEngine';
import { normalizeLocationUrl } from '../utils/locationUtils';
import {
  CLIENT_SETTLEMENT_MODES,
  VAT_MODE_LABELS,
  resolveFocusedBranch,
  resolveBranchProfileDetails,
  buildClientPastOrdersSummary,
} from '../utils/clientProfileUtils';
import {
  FULFILLMENT_STATUSES,
  ORDER_TYPES,
  resolveOrderSerial,
  renderVatAbbrChip,
} from './salesOrders/salesOrderConstants';

/**
 * Standardized App-Wide Client & Branch Profile Modal.
 * Reveals commercial/tax identity, branch-specific contacts & schedules,
 * attachments, and a historical Past Orders + SKU/Packing/Price/VAT breakdown.
 */
export default function ClientProfileModal({
  isOpen,
  onClose,
  client = null,
  clientId = '',
  focusBranchId = '',
  focusBranchName = '',
  clients = null,
  segments = null,
  pricingStrategies = null,
  salesOrders = null,
  onEditClient = null,
  canViewCreditLimit = true,
  canViewTaxCard = true,
  canViewPricing = true,
  zIndexClass = 'z-[75]',
  isAr = true,
}) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'orders'
  const [branchScopeOnly, setBranchScopeOnly] = useState(false);
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState(() => new Set());

  // Fallback self-hydration when host tabs don't pass full lists
  const [fetchedClient, setFetchedClient] = useState(null);
  const [fetchedOrders, setFetchedOrders] = useState(null);
  const [fetchedSegments, setFetchedSegments] = useState(null);
  const [fetchedStrategies, setFetchedStrategies] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const resolvedClientId = client?.id || clientId || '';

  const resolvedClient = useMemo(() => {
    if (client && client.id) return client;
    if (Array.isArray(clients) && resolvedClientId) {
      const found = clients.find((c) => c.id === resolvedClientId);
      if (found) return found;
    }
    if (fetchedClient && (!resolvedClientId || fetchedClient.id === resolvedClientId)) {
      return fetchedClient;
    }
    return client || null;
  }, [client, clients, fetchedClient, resolvedClientId]);

  const effectiveSegments = useMemo(
    () => (Array.isArray(segments) && segments.length > 0 ? segments : fetchedSegments || []),
    [segments, fetchedSegments]
  );

  const effectiveStrategies = useMemo(
    () =>
      Array.isArray(pricingStrategies) && pricingStrategies.length > 0
        ? pricingStrategies
        : fetchedStrategies || DEFAULT_PRICING_STRATEGIES,
    [pricingStrategies, fetchedStrategies]
  );

  const segmentMap = useMemo(() => {
    const m = {};
    effectiveSegments.forEach((s) => {
      if (s?.id) m[s.id] = s;
    });
    return m;
  }, [effectiveSegments]);

  // Reset UI view state on open / target change
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('profile');
    setBranchScopeOnly(Boolean(focusBranchId || focusBranchName));
    setExpandedOrderIds(new Set());
  }, [isOpen, resolvedClientId, focusBranchId, focusBranchName]);

  // Close cleanly on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Fetch client record if host didn't have it loaded
  useEffect(() => {
    if (!isOpen || !resolvedClientId) return;
    if (client?.branches || (Array.isArray(clients) && clients.some((c) => c.id === resolvedClientId))) {
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'clients', resolvedClientId))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          setFetchedClient({ id: snap.id, ...snap.data() });
        }
      })
      .catch((err) => console.warn('ClientProfileModal client fetch failed:', err));
    return () => {
      cancelled = true;
    };
  }, [isOpen, resolvedClientId, client, clients]);

  // Fetch past orders for this client when host didn't pass `salesOrders`
  useEffect(() => {
    if (!isOpen || !resolvedClientId || Array.isArray(salesOrders)) return;
    let cancelled = false;
    setLoadingOrders(true);
    const q = query(collection(db, 'sales_orders'), where('clientId', '==', resolvedClientId));
    getDocs(q)
      .then((snap) => {
        if (!cancelled) {
          setFetchedOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      })
      .catch((err) => console.warn('ClientProfileModal sales_orders fetch failed:', err))
      .finally(() => {
        if (!cancelled) setLoadingOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, resolvedClientId, salesOrders]);

  // Fetch segments / strategies if omitted by host
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    if (!Array.isArray(segments) || segments.length === 0) {
      getDocs(collection(db, 'client_segments'))
        .then((snap) => {
          if (!cancelled) setFetchedSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        })
        .catch(() => {});
    }
    if (!Array.isArray(pricingStrategies) || pricingStrategies.length === 0) {
      getDocs(collection(db, 'pricing_strategies'))
        .then((snap) => {
          if (!cancelled && !snap.empty) {
            setFetchedStrategies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen, segments, pricingStrategies]);

  const focusedBranch = useMemo(
    () => resolveFocusedBranch(resolvedClient, focusBranchId, focusBranchName),
    [resolvedClient, focusBranchId, focusBranchName]
  );

  const focusedDetails = useMemo(
    () => resolveBranchProfileDetails(resolvedClient, focusedBranch, isAr),
    [resolvedClient, focusedBranch, isAr]
  );

  const effectiveOrdersSource = Array.isArray(salesOrders) ? salesOrders : fetchedOrders || [];

  const { summary: ordersSummary, orders: pastOrders } = useMemo(
    () =>
      buildClientPastOrdersSummary(effectiveOrdersSource, resolvedClientId, {
        branchId: branchScopeOnly ? focusedBranch?.id || focusBranchId || '' : '',
        branchName: branchScopeOnly ? focusedBranch?.nameAr || focusBranchName || '' : '',
        includeCanceled,
      }),
    [
      effectiveOrdersSource,
      resolvedClientId,
      branchScopeOnly,
      focusedBranch,
      focusBranchId,
      focusBranchName,
      includeCanceled,
    ]
  );

  if (!isOpen || !resolvedClientId) return null;

  const segObj = resolvedClient?.segmentId ? segmentMap[resolvedClient.segmentId] : null;
  const SegIcon = segObj?.icon && SEGMENT_ICON_MAP[segObj.icon] ? SEGMENT_ICON_MAP[segObj.icon] : Building2;
  const segColor = segObj?.color || '#3b82f6';
  const branchCount = (resolvedClient?.branches || []).length;
  const settlementLabel =
    CLIENT_SETTLEMENT_MODES.find((m) => m.id === resolvedClient?.settlementMode)?.[isAr ? 'labelAr' : 'labelEn'] ||
    resolvedClient?.settlementMode ||
    '—';

  const toggleExpandOrder = (ordId) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(ordId)) next.delete(ordId);
      else next.add(ordId);
      return next;
    });
  };

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4`}
      onClick={() => onClose?.()}
    >
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] text-start animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl border border-white/20 flex items-center justify-center overflow-hidden shadow-sm shrink-0"
              style={{ backgroundColor: resolvedClient?.logo ? 'rgba(255,255,255,0.95)' : `${segColor}30` }}
            >
              {resolvedClient?.logo ? (
                <img
                  src={resolvedClient.logo}
                  alt={resolvedClient.tradeNameAr || resolvedClient.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <SegIcon className="w-6 h-6" style={{ color: '#93c5fd' }} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/30 font-bold">
                  {resolvedClientId}
                </span>
                <h3 className="font-black text-base sm:text-lg text-white truncate">
                  {resolvedClient?.tradeNameAr || resolvedClient?.name || resolvedClientId}
                </h3>
                {(focusBranchName || focusedBranch?.nameAr) && branchCount > 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[11px] font-bold">
                    <Store className="w-3 h-3" />
                    <span>{focusBranchName || focusedBranch?.nameAr}</span>
                  </span>
                )}
              </div>
              {resolvedClient?.tradeNameEn && (
                <p className="text-xs text-slate-400 font-semibold truncate" dir="ltr">
                  {resolvedClient.tradeNameEn}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {typeof onEditClient === 'function' && resolvedClient && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  onEditClient(resolvedClient);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isAr ? 'تعديل البيانات' : 'Edit Profile'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onClose?.()}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              aria-label={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="px-5 sm:px-6 pt-2.5 pb-2 bg-slate-100/90 border-b border-slate-200 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'ملف العميل والفروع' : 'Client & Branch Profile'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isAr ? 'سجل الطلبات والأسعار والضرائب' : 'Past Orders, Pricing & VAT'}</span>
            <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 font-mono text-[10px] font-black">
              {ordersSummary.totalOrders}
            </span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-700 bg-slate-50/40">
          {!resolvedClient ? (
            <div className="py-16 text-center">
              <PeacockLoader size="lg" text={isAr ? 'جاري تحميل ملف العميل...' : 'Loading client profile...'} />
            </div>
          ) : activeTab === 'profile' ? (
            <>
              {/* Active Branch Spotlight Banner (when opened from an order/dispatch or client has branches) */}
              {focusedBranch && (
                <div className="p-4 bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white border-2 border-emerald-200 rounded-2xl space-y-3 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Store className="w-4 h-4" />
                      </span>
                      <div>
                        <div className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                          <span>
                            {focusedBranch.nameAr || focusedBranch.nameEn || (isAr ? 'الفرع النشط' : 'Active Branch')}
                          </span>
                          {focusedBranch.isMain && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-200/70 text-emerald-900 text-[9px] font-black">
                              {isAr ? 'رئيسي' : 'Main'}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-700 block">
                          {isAr ? 'تفاصيل التشغيل والتواصل المباشر للفرع المحدد' : 'Direct branch operational & contact card'}
                        </span>
                      </div>
                    </div>

                    {focusedDetails.gpsCoordinates && (
                      <a
                        href={normalizeLocationUrl(focusedDetails.gpsCoordinates)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-[11px] font-bold transition shadow-2xs"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>{isAr ? 'فتح بالخريطة' : 'Open Maps'}</span>
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                    {focusedDetails.region && (
                      <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-100">
                        <span className="text-[10px] text-slate-400 font-bold block">{isAr ? 'المنطقة:' : 'Region:'}</span>
                        <span className="font-bold text-slate-800 inline-flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{focusedDetails.region}</span>
                        </span>
                      </div>
                    )}

                    {focusedDetails.contactPerson && (
                      <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-100">
                        <span className="text-[10px] text-slate-400 font-bold block">{isAr ? 'المسؤول بالفرع:' : 'Contact Person:'}</span>
                        <span className="font-bold text-slate-800 inline-flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span>{focusedDetails.contactPerson}</span>
                        </span>
                      </div>
                    )}

                    <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-[10px] text-slate-400 font-bold block">{isAr ? 'مواعيد الاستلام والعطلات:' : 'Hours & Holidays:'}</span>
                      <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="font-mono inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{focusedDetails.workingHours || (isAr ? 'غير محددة' : 'Not set')}</span>
                        </span>
                        {focusedDetails.holidaysText && (
                          <span className="text-[10px] text-rose-700 font-bold">
                            ({isAr ? 'عطلة:' : 'Off:'} {focusedDetails.holidaysText})
                          </span>
                        )}
                      </div>
                    </div>

                    {focusedDetails.address && (
                      <div className="sm:col-span-2 lg:col-span-3 bg-white/90 p-2.5 rounded-xl border border-emerald-100">
                        <span className="text-[10px] text-slate-400 font-bold block">{isAr ? 'العنوان التفصيلي:' : 'Address:'}</span>
                        <span className="font-semibold text-slate-800 mt-0.5 block">{focusedDetails.address}</span>
                      </div>
                    )}

                    {focusedDetails.phones.length > 0 && (
                      <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-1.5 pt-0.5">
                        {focusedDetails.phones.map((ph, pIdx) => (
                          <a
                            key={pIdx}
                            href={`tel:${ph}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white text-emerald-800 border border-emerald-200 rounded-lg font-mono text-[11px] font-bold hover:bg-emerald-100 transition"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{ph}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Top Key Attributes Ribbon */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">{isAr ? 'القطاع والتصنيف:' : 'Segment:'}</span>
                  <span className="text-xs font-black text-slate-800">
                    {segObj ? (isAr ? segObj.nameAr : segObj.nameEn || segObj.nameAr) : resolvedClient.segmentId || '—'}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">{isAr ? 'استراتيجية التسعير:' : 'Pricing Strategy:'}</span>
                  <PricingStrategyBadge
                    strategyId={resolvedClient.pricingStrategy}
                    strategies={effectiveStrategies}
                    isAr={isAr}
                  />
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">{isAr ? 'طريقة السداد:' : 'Settlement Mode:'}</span>
                  <span className="text-xs font-black text-slate-800">{settlementLabel}</span>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">{isAr ? 'الحد الائتماني:' : 'Credit Limit:'}</span>
                  {canViewCreditLimit ? (
                    <span className="text-xs font-mono font-black text-slate-800">
                      {Number(resolvedClient.creditLimit || 0) === 0
                        ? isAr ? 'مفتوح (غير مقيد)' : 'Unlimited'
                        : `${Number(resolvedClient.creditLimit).toLocaleString()} ${isAr ? 'ج.م' : 'EGP'}`}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-slate-400 italic">{isAr ? 'مقيد' : 'Restricted'}</span>
                  )}
                </div>
              </div>

              {/* Commercial & Tax Identification */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>{isAr ? 'البيانات التجارية والقانونية' : 'Commercial & Legal Identification'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="block text-slate-400 font-semibold mb-0.5">{isAr ? 'الاسم القانوني / الرسمي:' : 'Legal Name:'}</span>
                    <span className="font-bold text-slate-800">{resolvedClient.legalName || '—'}</span>
                  </div>

                  <div>
                    <span className="block text-slate-400 font-semibold mb-0.5">{isAr ? 'رقم البطاقة الضريبية:' : 'Tax Card ID:'}</span>
                    {canViewTaxCard && resolvedClient.taxCardNumber ? (
                      <VatNumberDisplay value={resolvedClient.taxCardNumber} className="font-mono font-bold text-slate-800" />
                    ) : (
                      <span className="text-slate-400 font-mono">{canViewTaxCard ? '—' : isAr ? 'مقيد' : 'Restricted'}</span>
                    )}
                  </div>

                  <div>
                    <span className="block text-slate-400 font-semibold mb-0.5">{isAr ? 'السجل التجاري:' : 'Commercial Register:'}</span>
                    <span className="font-mono font-bold text-slate-800">{resolvedClient.commercialRegister || '—'}</span>
                  </div>

                  <div>
                    <span className="block text-slate-400 font-semibold mb-0.5">{isAr ? 'المأمورية الضريبية:' : 'Tax District:'}</span>
                    <span className="font-bold text-slate-800">{resolvedClient.taxDistrict || '—'}</span>
                  </div>

                  <div>
                    <span className="block text-slate-400 font-semibold mb-0.5">{isAr ? 'آخر نشاط تسليم فعلي:' : 'Latest Delivery Activity:'}</span>
                    <span className="font-bold text-slate-800">
                      {resolvedClient.latestActivityOn
                        ? new Date(resolvedClient.latestActivityOn).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')
                        : ordersSummary.lastOrderDate || (isAr ? 'لا يوجد' : 'No records')}
                    </span>
                  </div>

                  <div>
                    <span className="block text-slate-400 font-semibold mb-0.5">{isAr ? 'مواعيد العمل والعطلات:' : 'Schedule & Holidays:'}</span>
                    <span className="font-bold text-slate-800">
                      {resolvedClient.workingHoursFrom && resolvedClient.workingHoursTo
                        ? `${resolvedClient.workingHoursFrom} - ${resolvedClient.workingHoursTo}`
                        : isAr ? 'غير محددة' : 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contact Channels */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'قنوات الاتصال والتواصل' : 'Contact Channels'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="block text-slate-400 font-semibold mb-1">{isAr ? 'أرقام الهواتف:' : 'Phone Numbers:'}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {resolvedClient.phones && resolvedClient.phones.length > 0 ? (
                        resolvedClient.phones.map((p, idx) => (
                          <a
                            key={idx}
                            href={`tel:${p}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-mono font-bold hover:bg-emerald-100 transition"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{p}</span>
                          </a>
                        ))
                      ) : resolvedClient.phone ? (
                        <a
                          href={`tel:${resolvedClient.phone}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-mono font-bold hover:bg-emerald-100 transition"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{resolvedClient.phone}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="block text-slate-400 font-semibold mb-1">{isAr ? 'عناوين البريد الإلكتروني:' : 'Email Addresses:'}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {resolvedClient.emails && resolvedClient.emails.length > 0 ? (
                        resolvedClient.emails.map((em, idx) => (
                          <a
                            key={idx}
                            href={`mailto:${em}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded-lg font-mono font-bold hover:bg-purple-100 transition"
                          >
                            <Mail className="w-3 h-3 text-purple-600" />
                            <span>{em}</span>
                          </a>
                        ))
                      ) : resolvedClient.email ? (
                        <a
                          href={`mailto:${resolvedClient.email}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-800 border border-purple-200 rounded-lg font-mono font-bold hover:bg-purple-100 transition"
                        >
                          <Mail className="w-3 h-3 text-purple-600" />
                          <span>{resolvedClient.email}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {resolvedClient.notes && (
                  <div className="pt-2 border-t border-slate-100 text-xs">
                    <span className="block text-slate-400 font-semibold mb-0.5">{isAr ? 'ملاحظات العميل:' : 'Notes:'}</span>
                    <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200 font-medium whitespace-pre-wrap">
                      {resolvedClient.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Multi-Branch Cards Gallery */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-blue-600" />
                  <span>{isAr ? 'الفروع المسجلة للعميل' : 'Registered Branches'} ({branchCount})</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(resolvedClient.branches || []).map((b, bIdx) => {
                    const isFocused = focusedBranch && (b.id || bIdx) === (focusedBranch.id || 0);
                    return (
                      <div
                        key={b.id || bIdx}
                        className={`p-3.5 rounded-2xl space-y-2 border ${
                          isFocused
                            ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-400/30'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-xs text-slate-900">{b.nameAr || b.nameEn || b.name}</span>
                          {b.isMain ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[10px] font-bold">
                              {isAr ? 'الفرع الرئيسي' : 'Main Branch'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px] font-semibold">
                              {isAr ? 'فرع إضافي' : 'Additional'}
                            </span>
                          )}
                        </div>

                        <div className="text-xs space-y-1 text-slate-600">
                          {b.region && (
                            <div>
                              <strong className="text-slate-700">{isAr ? 'المنطقة:' : 'Region:'}</strong> {b.region}
                            </div>
                          )}
                          {b.address && (
                            <div>
                              <strong className="text-slate-700">{isAr ? 'العنوان:' : 'Address:'}</strong> {b.address}
                            </div>
                          )}
                          {b.contactPerson && (
                            <div>
                              <strong className="text-slate-700">{isAr ? 'المسؤول:' : 'Contact:'}</strong> {b.contactPerson}
                            </div>
                          )}
                          {b.phone && (
                            <div className="font-mono">
                              <strong className="text-slate-700">{isAr ? 'الهاتف:' : 'Phone:'}</strong> {b.phone}
                            </div>
                          )}
                          {b.workingHoursFrom && b.workingHoursTo && (
                            <div className="font-mono text-[11px]">
                              <strong className="text-slate-700 font-sans">{isAr ? 'ساعات العمل:' : 'Hours:'}</strong> {b.workingHoursFrom} - {b.workingHoursTo}
                            </div>
                          )}
                        </div>

                        {b.gpsCoordinates && (
                          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                            <span className="font-mono text-[11px] text-slate-500 truncate max-w-[200px]" title={b.gpsCoordinates}>
                              {b.gpsCoordinates}
                            </span>
                            <a
                              href={normalizeLocationUrl(b.gpsCoordinates)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-bold transition"
                            >
                              <Navigation className="w-3 h-3" />
                              <span>{isAr ? 'فتح بالخريطة' : 'Open in Maps'}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Documents & Contracts Attachments */}
              {resolvedClient.attachments && resolvedClient.attachments.length > 0 && (
                <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Paperclip className="w-4 h-4 text-amber-600" />
                    <span>
                      {isAr ? 'المستندات والعقود المرفقة' : 'Attached Documents & Contracts'} ({resolvedClient.attachments.length})
                    </span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {resolvedClient.attachments.map((att, aIdx) => (
                      <div
                        key={att.id || aIdx}
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="block font-bold text-slate-800 truncate" title={att.name}>
                              {att.name}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {att.size}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openBase64Document(att)}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-[11px] transition flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>{isAr ? 'معاينة' : 'View'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* TAB 2: PAST ORDERS SUMMARY & SKU / PACKING / PRICE / VAT HISTORY */
            <div className="space-y-4">
              {/* Filter Bar & KPI Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  {branchCount > 1 && focusedBranch && (
                    <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setBranchScopeOnly(false)}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                          !branchScopeOnly ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {isAr ? 'كل فروع العميل' : 'All Branches'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBranchScopeOnly(true)}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                          branchScopeOnly ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {focusedBranch.nameAr || focusedBranch.nameEn || (isAr ? 'الفرع الحالي' : 'This Branch')}
                      </button>
                    </div>
                  )}

                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={includeCanceled}
                      onChange={(e) => setIncludeCanceled(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{isAr ? 'تضمين الملغي' : 'Include Canceled'}</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-bold">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                    {ordersSummary.totalOrders} {isAr ? 'أمر' : 'orders'}
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {ordersSummary.totalCartons.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                  </span>
                  {canViewPricing && (
                    <span className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 font-black">
                      {ordersSummary.totalNetValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                    </span>
                  )}
                </div>
              </div>

              {loadingOrders ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
                  <PeacockLoader size="lg" text={isAr ? 'جاري تحميل سجل الطلبات...' : 'Loading order history...'} />
                </div>
              ) : pastOrders.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-2">
                  <ShoppingCart className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">
                    {isAr ? 'لا توجد طلبات مسجلة لهذا العميل في النطاق المحدد' : 'No historical orders found for this selection'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pastOrders.map((ord, idx) => {
                    const isOrdExpanded = idx < 3 || expandedOrderIds.has(ord.id);
                    const serial = resolveOrderSerial(ord, pastOrders);
                    const ordTypeObj = ORDER_TYPES.find((t) => t.id === ord.orderType) || ORDER_TYPES[0];
                    const fulfObj = FULFILLMENT_STATUSES.find((f) => f.id === ord.normalizedStatus) || FULFILLMENT_STATUSES[0];
                    const vatMeta = VAT_MODE_LABELS[ord.vatMode] || VAT_MODE_LABELS.none;

                    return (
                      <div key={ord.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                        {/* Order Summary Header Row */}
                        <div
                          onClick={() => toggleExpandOrder(ord.id)}
                          className="px-4 py-3 bg-slate-50/80 hover:bg-slate-100/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 cursor-pointer transition select-none"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-black text-slate-900">#{serial}</span>
                            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                              {isAr ? ordTypeObj.labelAr : ordTypeObj.labelEn}
                            </span>
                            {ord.invoiceDate && (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-600">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>{ord.invoiceDate}</span>
                              </span>
                            )}
                            {ord.branchName && (
                              <span className="text-[11px] font-semibold text-slate-500">• {ord.branchName}</span>
                            )}
                            {ord.confirmationStatus === 'canceled' ? (
                              <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black">
                                {isAr ? 'ملغي' : 'Canceled'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-black text-slate-700">
                                {ord.normalizedStatus === 'paid' ? (
                                  <Banknote className="w-3 h-3 text-indigo-600" />
                                ) : ord.normalizedStatus === 'delivered' ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                ) : ord.normalizedStatus === 'shipped' ? (
                                  <Truck className="w-3 h-3 text-sky-600" />
                                ) : (
                                  <Clock className="w-3 h-3 text-amber-600" />
                                )}
                                <span>{isAr ? fulfObj.labelAr : fulfObj.labelEn}</span>
                              </span>
                            )}
                            {renderVatAbbrChip(ord.vatMode, ord.orderType, isAr)}
                          </div>

                          <div className="flex items-center gap-2.5 text-xs font-mono">
                            <span className="font-bold text-slate-700">
                              {Number(ord.totalCartons || ord.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                            </span>
                            {canViewPricing && (
                              <span className="font-black text-emerald-700">
                                {Number(ord.grandTotal ?? ord.collectionAmount ?? 0).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{' '}
                                EGP
                              </span>
                            )}
                            <span className="text-slate-400">
                              {isOrdExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </div>
                        </div>

                        {/* Line Items Breakdown: Products / Packing Option, Qty, Price, VAT */}
                        {isOrdExpanded && ord.normalizedLines.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-start border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                                  <th className="py-2 px-3 text-start">{isAr ? 'الصنف والتعبئة' : 'Product & Packing'}</th>
                                  <th className="py-2 px-3 text-center">{isAr ? 'الكمية / البونص' : 'Qty / Bonus'}</th>
                                  {canViewPricing && (
                                    <th className="py-2 px-3 text-end">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                                  )}
                                  <th className="py-2 px-3 text-center">{isAr ? 'الضريبة' : 'VAT'}</th>
                                  {canViewPricing && (
                                    <th className="py-2 px-3 text-end">{isAr ? 'الإجمالي' : 'Line Total'}</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {ord.normalizedLines.map((line) => (
                                  <tr key={line.key} className="hover:bg-slate-50/70">
                                    <td className="py-2 px-3">
                                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                        <Package className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                        <span>{isAr ? line.productNameAr : line.productNameEn}</span>
                                        {line.productCode && (
                                          <span className="font-mono text-[10px] text-slate-400">({line.productCode})</span>
                                        )}
                                      </div>
                                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200/80 text-[10px] font-bold">
                                        {isAr ? line.packagingOptionNameAr : line.packagingOptionNameEn}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                                      <span>{line.qty.toLocaleString()}</span>
                                      {line.bonus > 0 && (
                                        <span className="text-emerald-600 ms-1">+{line.bonus}</span>
                                      )}
                                    </td>
                                    {canViewPricing && (
                                      <td className="py-2 px-3 text-end font-mono font-semibold text-slate-700">
                                        {line.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    )}
                                    <td className="py-2 px-3 text-center text-[10px] font-bold text-slate-600">
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                        {isAr ? vatMeta.shortAr : vatMeta.shortEn}
                                      </span>
                                    </td>
                                    {canViewPricing && (
                                      <td className="py-2 px-3 text-end font-mono font-black text-slate-900">
                                        {line.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {isOrdExpanded && ord.normalizedLines.length === 0 && (
                          <div className="px-4 py-2.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {ord.adminNotes || ord.internalComments || (isAr ? 'مستند مالي / إداري بدون بنود أصناف' : 'Financial/Admin entry without SKU lines')}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
