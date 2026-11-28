import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Receipt,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Printer,
  RefreshCw,
  Trash2,
  X,
  Building2,
  History,
  Globe,
  RotateCcw,
  FileCheck,
  Split,
  Ban,
  Eye,
  Truck,
  ChevronDown,
  ShieldAlert,
} from 'lucide-react';
import { db, functions } from '../firebase';
import PeacockLoader from './PeacockLoader';
import ClientProfileModal from './ClientProfileModal';
import TruckNameBadge from './TruckNameBadge';
import InvoicePreviewModal from './invoicing/InvoicePreviewModal';
import { RowCommentButton } from './comments';
import { canAccessAction } from '../config/appArchitecture';
import { formatDateKey } from '../utils/pricingEngine';
import { compareOrdersBySerialAsc } from '../utils/salesOrderUtils';
import { makeTripDispatchDocId } from '../utils/truckDispatchUtils';
import {
  FULFILLMENT_STATUSES,
  SALES_FULFILLMENT_STYLE_MAP,
  VAT_MODES,
  resolveOrderSerial,
  resolveBranchDisplayName,
  renderVatAbbrChip,
  resolveVehicleDisplayName,
} from './salesOrders/salesOrderConstants';
import {
  DOC_TYPES,
  auditInvoiceSequences,
  evaluateOrderInvoicingStatus,
  isValidSplitLoadShare,
  getSequenceTypeForDocType,
} from '../utils/salesInvoicingEngine';

const STATUS_FILTERS = [
  { id: 'all', labelAr: 'الكل', labelEn: 'All' },
  { id: 'pending', labelAr: 'قيد الإصدار', labelEn: 'Pending' },
  { id: 'partial', labelAr: 'جزئي', labelEn: 'Partial' },
  { id: 'needs_revision', labelAr: 'يحتاج مراجعة', labelEn: 'Needs Revision' },
  { id: 'invoiced', labelAr: 'مفوتر بالكامل', labelEn: 'Invoiced' },
];

const DOC_BADGE_META = {
  [DOC_TYPES.TAWOOS]: {
    prefix: 'INV',
    labelAr: 'فاتورة ضريبية (طاووس)',
    labelEn: 'Tax Invoice (Tawoos)',
    chipClasses: 'bg-blue-50 text-blue-900 border-blue-200',
  },
  [DOC_TYPES.PL]: {
    prefix: 'PL',
    labelAr: 'فاتورة ضريبية (علامة خاصة)',
    labelEn: 'Tax Invoice (Private Label)',
    chipClasses: 'bg-purple-50 text-purple-900 border-purple-200',
  },
  [DOC_TYPES.DELIVERY_NOTE]: {
    prefix: 'DN',
    labelAr: 'إذن تسليم',
    labelEn: 'Delivery Note',
    chipClasses: 'bg-amber-50 text-amber-900 border-amber-200',
  },
};

function parseHighlightFromHash() {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash || '';
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return '';
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  return params.get('highlight') || params.get('orderId') || '';
}

export default function SalesInvoicingMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const isGeneralAdmin =
    currentUser?.isGeneralAdmin ||
    currentUser?.role === 'general_admin' ||
    currentUser?.role === 'admin';
  const canIssueInvoice =
    isGeneralAdmin ||
    canAccessAction(permissions, 'sales_invoicing', 'canIssueInvoice', currentUser) ||
    canAccessAction(permissions, 'sales_orders', 'canEdit', currentUser);
  const canVoidInvoice =
    isGeneralAdmin ||
    canAccessAction(permissions, 'sales_invoicing', 'canVoidInvoice', currentUser);

  // Live Firestore collections
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [truckDispatches, setTruckDispatches] = useState([]);
  const [segments, setSegments] = useState([]);
  const [pricingStrategies, setPricingStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & search state
  const [searchTerm, setSearchTerm] = useState('');
  const [globalSearch, setGlobalSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all');
  const [vatModeFilter, setVatModeFilter] = useState('all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');

  // Deep-link highlight
  const [highlightedOrderId, setHighlightedOrderId] = useState(() => parseHighlightFromHash());
  const cardRefs = useRef({});

  // Draft serial & date inputs keyed by `${orderId}::${docType}`
  const [slotDrafts, setSlotDrafts] = useState({});

  // Popovers & Modals
  const [historyPopover, setHistoryPopover] = useState(null); // 'tax' | 'dn' | null
  const [previewContext, setPreviewContext] = useState(null);
  const [voidModalDoc, setVoidModalDoc] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidError, setVoidError] = useState('');
  const [profileModalTarget, setProfileModalTarget] = useState(null);

  useEffect(() => {
    let loadedOrders = false;
    let loadedInvoices = false;
    const maybeReady = () => {
      if (loadedOrders && loadedInvoices) setLoading(false);
    };

    const unsubs = [
      onSnapshot(collection(db, 'sales_orders'), (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        loadedOrders = true;
        maybeReady();
      }),
      onSnapshot(collection(db, 'sales_invoices'), (snap) => {
        setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        loadedInvoices = true;
        maybeReady();
      }),
      onSnapshot(collection(db, 'clients'), (snap) => {
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(db, 'finished_products'), (snap) => {
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(db, 'vehicles'), (snap) => {
        setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(db, 'truck_dispatches'), (snap) => {
        setTruckDispatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(db, 'client_segments'), (snap) => {
        setSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(db, 'pricing_strategies'), (snap) => {
        setPricingStrategies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];

    return () => unsubs.forEach((u) => u && u());
  }, []);

  // Hash navigation listener for #sales_invoicing?highlight=<orderId>
  useEffect(() => {
    const syncHash = () => {
      const target = parseHighlightFromHash();
      if (target) {
        setHighlightedOrderId(target);
        setGlobalSearch(true);
        setStatusFilter('all');
      }
    };
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  // Scroll to highlighted order card when available
  useEffect(() => {
    if (!highlightedOrderId || loading) return;
    const el = cardRefs.current[highlightedOrderId];
    if (el && typeof el.scrollIntoView === 'function') {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [highlightedOrderId, loading, orders.length]);

  // Fast lookup maps
  const clientsMap = useMemo(() => {
    const m = {};
    clients.forEach((c) => {
      if (c?.id) m[c.id] = c;
    });
    return m;
  }, [clients]);

  const productsMap = useMemo(() => {
    const m = {};
    products.forEach((p) => {
      if (p?.id) m[p.id] = p;
    });
    return m;
  }, [products]);

  const vehiclesMap = useMemo(() => {
    const m = {};
    vehicles.forEach((v) => {
      if (v?.id) m[v.id] = v;
    });
    return m;
  }, [vehicles]);

  const truckDispatchesMap = useMemo(() => {
    const m = {};
    truckDispatches.forEach((td) => {
      if (td?.id) m[td.id] = td;
    });
    return m;
  }, [truckDispatches]);

  const invoicesByOrderId = useMemo(() => {
    const m = {};
    invoices.forEach((inv) => {
      if (!inv?.orderId) return;
      if (!m[inv.orderId]) m[inv.orderId] = [];
      m[inv.orderId].push(inv);
    });
    return m;
  }, [invoices]);

  const activeInvoices = useMemo(
    () =>
      invoices.filter((d) => {
        const st = String(d?.status || 'issued').toLowerCase();
        return st !== 'voided' && st !== 'superseded' && d?.isLatestVersion !== false;
      }),
    [invoices]
  );

  // Sequence Health & Gap Audit
  const sequenceAudit = useMemo(() => auditInvoiceSequences(activeInvoices), [activeInvoices]);

  // Evaluate every eligible order
  const evaluatedOrders = useMemo(() => {
    return orders
      .map((order) => {
        const orderDocs = invoicesByOrderId[order.id] || [];
        const evaluation = evaluateOrderInvoicingStatus(order, productsMap, orderDocs);
        return { order, orderDocs, evaluation };
      })
      .filter((entry) => entry.evaluation.status !== 'not_applicable')
      .sort((a, b) => {
        const dateA = String(a.order.loadingDate || a.order.invoiceDate || '');
        const dateB = String(b.order.loadingDate || b.order.invoiceDate || '');
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return compareOrdersBySerialAsc(b.order, a.order);
      });
  }, [orders, invoicesByOrderId, productsMap]);

  // Dashboard counts
  const statusCounts = useMemo(() => {
    const counts = { all: evaluatedOrders.length, pending: 0, partial: 0, needs_revision: 0, invoiced: 0 };
    evaluatedOrders.forEach(({ evaluation }) => {
      if (counts[evaluation.status] !== undefined) counts[evaluation.status] += 1;
    });
    return counts;
  }, [evaluatedOrders]);

  const hasHiddenActiveFilters = Boolean(
    dateFrom ||
      dateTo ||
      docTypeFilter !== 'all' ||
      vatModeFilter !== 'all' ||
      fulfillmentFilter !== 'all'
  );

  // Queue vs Global filtering
  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const cutoffDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return formatDateKey(d);
    })();

    return evaluatedOrders.filter(({ order, evaluation }) => {
      // Status pill filter
      if (statusFilter !== 'all' && evaluation.status !== statusFilter) return false;

      // Default Working Queue scope (when Global Search is OFF and no explicit search/date filter)
      if (!globalSearch && !q && !dateFrom && !dateTo) {
        const oDate = String(order.loadingDate || order.invoiceDate || '').slice(0, 10);
        const isPendingOrActionable =
          evaluation.status === 'pending' ||
          evaluation.status === 'partial' ||
          evaluation.status === 'needs_revision';
        const isRecent = oDate >= cutoffDate;
        const isPreparingOrOut =
          order.fulfillmentStatus === 'prepare' || order.fulfillmentStatus === 'shipped';
        if (!isPendingOrActionable && !isRecent && !isPreparingOrOut) {
          return false;
        }
      }

      if (dateFrom) {
        const oDate = String(order.invoiceDate || order.loadingDate || '').slice(0, 10);
        if (oDate < dateFrom) return false;
      }
      if (dateTo) {
        const oDate = String(order.invoiceDate || order.loadingDate || '').slice(0, 10);
        if (oDate > dateTo) return false;
      }
      if (vatModeFilter !== 'all' && (order.vatMode || 'none') !== vatModeFilter) return false;
      if (fulfillmentFilter !== 'all' && (order.fulfillmentStatus || 'not_yet') !== fulfillmentFilter) {
        return false;
      }
      if (docTypeFilter !== 'all') {
        const n = evaluation.needs;
        if (docTypeFilter === DOC_TYPES.TAWOOS && !n.needsTawoos) return false;
        if (docTypeFilter === DOC_TYPES.PL && !n.needsPL) return false;
        if (docTypeFilter === DOC_TYPES.DELIVERY_NOTE && !n.needsDN) return false;
      }

      if (q) {
        const serialStr = resolveOrderSerial(order, orders).toLowerCase();
        const client = clientsMap[order.clientId];
        const clientText = `${order.clientName || ''} ${client?.tradeNameAr || ''} ${client?.name || ''} ${order.branchName || ''}`.toLowerCase();
        const poText = `${order.poTawoos || ''} ${order.poPrivateLabel || ''}`.toLowerCase();
        const docSerials = Object.values(evaluation.activeDocsByType || {})
          .map((d) => String(d?.serialNo || ''))
          .join(' ')
          .toLowerCase();
        if (
          !serialStr.includes(q) &&
          !String(order.id || '').toLowerCase().includes(q) &&
          !clientText.includes(q) &&
          !poText.includes(q) &&
          !docSerials.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    evaluatedOrders,
    statusFilter,
    globalSearch,
    searchTerm,
    dateFrom,
    dateTo,
    vatModeFilter,
    fulfillmentFilter,
    docTypeFilter,
    orders,
    clientsMap,
  ]);

  const getSlotDraft = (order, docType) => {
    const key = `${order.id}::${docType}`;
    const existing = slotDrafts[key];
    const seqType = getSequenceTypeForDocType(docType);
    const defaultSerial = String(
      sequenceAudit[seqType]?.suggestedNextSerial || 1
    );
    const defaultDate =
      String(order.invoiceDate || order.loadingDate || '').slice(0, 10) ||
      formatDateKey(new Date());

    return {
      serialNo: existing?.serialNo !== undefined ? existing.serialNo : defaultSerial,
      invoiceDate: existing?.invoiceDate || defaultDate,
      isSplitLoad: Boolean(existing?.isSplitLoad),
    };
  };

  const updateSlotDraft = (orderId, docType, patch) => {
    const key = `${orderId}::${docType}`;
    setSlotDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  };

  const openSlotPreview = ({
    order,
    docType,
    existingCommittedDoc = null,
    isRevisionMode = false,
  }) => {
    const draft = getSlotDraft(order, docType);
    setPreviewContext({
      order,
      docType,
      serialNo: existingCommittedDoc?.serialNo || draft.serialNo,
      invoiceDate: existingCommittedDoc?.invoiceDate || draft.invoiceDate,
      isSplitLoad: existingCommittedDoc ? Boolean(existingCommittedDoc.isSplitLoad) : draft.isSplitLoad,
      existingCommittedDoc,
      isRevisionMode,
    });
  };

  const handleConfirmVoid = async () => {
    if (!voidModalDoc?.docId && !voidModalDoc?.id) return;
    if (voidReason.trim().length < 3) {
      setVoidError(
        isAr ? 'يرجى إدخال سبب الإلغاء (3 أحرف على الأقل).' : 'Please enter a void reason (min 3 characters).'
      );
      return;
    }
    setIsVoiding(true);
    setVoidError('');
    try {
      const voidFn = httpsCallable(functions, 'salesVoidInvoiceDocument');
      await voidFn({
        docId: voidModalDoc.docId || voidModalDoc.id,
        voidReason: voidReason.trim(),
        currentUser: {
          id: currentUser?.id || currentUser?.uid || '',
          name: currentUser?.nameAr || currentUser?.name || '',
        },
      });
      setVoidModalDoc(null);
      setVoidReason('');
    } catch (err) {
      console.error('Void invoice failed:', err);
      setVoidError(err?.message || (isAr ? 'تعذر إلغاء المستند.' : 'Failed to void document.'));
    } finally {
      setIsVoiding(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <PeacockLoader label={isAr ? 'جاري تحميل سجل الفواتير وأوامر البيع...' : 'Loading Sales Invoicing...'} />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
      {/* 1. Sequence Health & Trackers Bar (Tax Sequence vs Delivery Note Sequence) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 relative">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tax Sequence Tracker Pill + History Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setHistoryPopover((p) => (p === 'tax' ? null : 'tax'))}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                historyPopover === 'tax'
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              }`}
            >
              <Receipt className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>{isAr ? 'التسلسل الضريبي (طاووس + خاصة):' : 'Tax Sequence:'}</span>
              <span className="font-mono font-black text-indigo-700">
                #{sequenceAudit.tax.maxSerial || 0}
              </span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-black">
                {isAr ? `التالي #${sequenceAudit.tax.suggestedNextSerial}` : `Next #${sequenceAudit.tax.suggestedNextSerial}`}
              </span>
              {sequenceAudit.tax.gaps.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black"
                  title={isAr ? 'فجوات تسلسل غير معطّلة (تتجاهل القفزات ≥ 100)' : 'Non-blocking gaps (jumps ≥ 100 ignored)'}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>{sequenceAudit.tax.gaps.length}</span>
                </span>
              )}
              <History className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {historyPopover === 'tax' && (
              <SequenceHistoryPopover
                title={isAr ? 'سجل آخر الفواتير الضريبية (طاووس + خاصة)' : 'Recent Tax Invoices (Tawoos + PL)'}
                audit={sequenceAudit.tax}
                isAr={isAr}
                onClose={() => setHistoryPopover(null)}
                onSelectDoc={(docItem) => {
                  const targetOrder = orders.find((o) => o.id === docItem.orderId);
                  setHistoryPopover(null);
                  if (targetOrder) {
                    openSlotPreview({
                      order: targetOrder,
                      docType: docItem.docType,
                      existingCommittedDoc: docItem,
                      isRevisionMode: false,
                    });
                  }
                }}
              />
            )}
          </div>

          {/* Delivery Note Sequence Tracker Pill + History Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setHistoryPopover((p) => (p === 'dn' ? null : 'dn'))}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                historyPopover === 'dn'
                  ? 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-500/20'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              }`}
            >
              <FileCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{isAr ? 'تسلسل إذون التسليم:' : 'DN Sequence:'}</span>
              <span className="font-mono font-black text-amber-800">
                #{sequenceAudit.dn.maxSerial || 0}
              </span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-black">
                {isAr ? `التالي #${sequenceAudit.dn.suggestedNextSerial}` : `Next #${sequenceAudit.dn.suggestedNextSerial}`}
              </span>
              {sequenceAudit.dn.gaps.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black"
                  title={isAr ? 'فجوات تسلسل غير معطّلة (تتجاهل القفزات ≥ 100)' : 'Non-blocking gaps (jumps ≥ 100 ignored)'}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>{sequenceAudit.dn.gaps.length}</span>
                </span>
              )}
              <History className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {historyPopover === 'dn' && (
              <SequenceHistoryPopover
                title={isAr ? 'سجل آخر إذون التسليم (Delivery Notes)' : 'Recent Delivery Notes'}
                audit={sequenceAudit.dn}
                isAr={isAr}
                onClose={() => setHistoryPopover(null)}
                onSelectDoc={(docItem) => {
                  const targetOrder = orders.find((o) => o.id === docItem.orderId);
                  setHistoryPopover(null);
                  if (targetOrder) {
                    openSlotPreview({
                      order: targetOrder,
                      docType: docItem.docType,
                      existingCommittedDoc: docItem,
                      isRevisionMode: false,
                    });
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* Status Quick Summary */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((st) => {
            const active = statusFilter === st.id;
            const cnt = statusCounts[st.id] || 0;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : st.id === 'needs_revision' && cnt > 0
                      ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{isAr ? st.labelAr : st.labelEn}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Search Bar, Global Search Toggle & Filter Toggler (Collapsed by default) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                isAr
                  ? 'بحث برقم الأمر، اسم العميل، مسلسل الفاتورة أو الإذن، أو PO...'
                  : 'Search order #, client, invoice/DN serial, PO...'
              }
              className="w-full ps-9 pe-8 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-indigo-400 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setGlobalSearch((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
              globalSearch
                ? 'bg-sky-600 text-white border-sky-700 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title={
              isAr
                ? 'عند التفعيل يبحث في جميع أوامر البيع التاريخية، وإلا يركز على قائمة العمل الحالية وآخر 30 يوماً'
                : 'Search across all historical orders vs active working queue'
            }
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isAr ? 'بحث شامل (الكل)' : 'Global Search'}</span>
          </button>

          <button
            type="button"
            onClick={() => setFiltersExpanded((v) => !v)}
            className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
              filtersExpanded || hasHiddenActiveFilters
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title={isAr ? 'إظهار / إخفاء الفلاتر المتقدمة' : 'Toggle advanced filters'}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{isAr ? 'فلاتر' : 'Filters'}</span>
            {hasHiddenActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          {(highlightedOrderId || hasHiddenActiveFilters || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setDateFrom('');
                setDateTo('');
                setDocTypeFilter('all');
                setVatModeFilter('all');
                setFulfillmentFilter('all');
                setStatusFilter('all');
                setHighlightedOrderId('');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
            </button>
          )}
        </div>

        {/* Collapsible Advanced Filters */}
        {filtersExpanded && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                {isAr ? 'من تاريخ' : 'Date From'}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                {isAr ? 'إلى تاريخ' : 'Date To'}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                {isAr ? 'نوع المستند المطلوب' : 'Required Document'}
              </label>
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-white"
              >
                <option value="all">{isAr ? 'كل المستندات' : 'All Documents'}</option>
                <option value={DOC_TYPES.TAWOOS}>{isAr ? 'فاتورة طاووس' : 'Tawoos Tax'}</option>
                <option value={DOC_TYPES.PL}>{isAr ? 'فاتورة علامة خاصة' : 'Private Label Tax'}</option>
                <option value={DOC_TYPES.DELIVERY_NOTE}>{isAr ? 'إذن تسليم' : 'Delivery Note'}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                {isAr ? 'المعاملة الضريبية' : 'VAT Mode'}
              </label>
              <select
                value={vatModeFilter}
                onChange={(e) => setVatModeFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-white"
              >
                <option value="all">{isAr ? 'الكل' : 'All Modes'}</option>
                {VAT_MODES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {isAr ? v.labelAr : v.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                {isAr ? 'حالة التنفيذ' : 'Fulfillment Status'}
              </label>
              <select
                value={fulfillmentFilter}
                onChange={(e) => setFulfillmentFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-xs bg-white"
              >
                <option value="all">{isAr ? 'الكل' : 'All Statuses'}</option>
                {FULFILLMENT_STATUSES.map((fs) => (
                  <option key={fs.id} value={fs.id}>
                    {isAr ? fs.labelAr : fs.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 3. Order Invoicing Cards Grid */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="text-sm font-black text-slate-700">
            {isAr ? 'لا توجد أوامر مطابقة لنطاق البحث الحالي' : 'No matching sales orders found'}
          </div>
          {!globalSearch && (
            <button
              type="button"
              onClick={() => setGlobalSearch(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-50 text-sky-800 border border-sky-200 text-xs font-bold hover:bg-sky-100 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'تفعيل البحث الشامل لعرض جميع الأوامر' : 'Enable Global Search'}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredEntries.map(({ order, evaluation }) => {
            const client = clientsMap[order.clientId] || null;
            const branchObj =
              (client?.branches || []).find((b) => (b.id || 'br_main') === order.branchId) || null;
            const branchLabel = resolveBranchDisplayName(
              branchObj || order.branchName,
              isAr
            );
            const orderSerial = resolveOrderSerial(order, orders);
            const ffObj =
              FULFILLMENT_STATUSES.find((f) => f.id === (order.fulfillmentStatus || 'not_yet')) ||
              FULFILLMENT_STATUSES[0];
            const ffStyle =
              SALES_FULFILLMENT_STYLE_MAP[ffObj.id] || SALES_FULFILLMENT_STYLE_MAP.not_yet;

            const loNum = Number(order.loadingOrderNumber || 0);
            const tripId =
              order.fgWarehouseDispatchId ||
              (loNum > 0
                ? makeTripDispatchDocId(order.loadingDate || order.invoiceDate, loNum)
                : '');
            const dispatchDoc = tripId ? truckDispatchesMap[tripId] : null;
            const isDispatched = Boolean(
              order.fgWarehouseDispatched || dispatchDoc?.latestDispatchDocNumber
            );
            const vehicleObj =
              vehiclesMap[order.assignedVehicleId || dispatchDoc?.vehicleId] || null;
            const isHighlighted = highlightedOrderId === order.id;

            // Slots to render on card (required + Transformation Case existing DN)
            const slotDocTypes = [];
            if (evaluation.needs.needsTawoos) slotDocTypes.push(DOC_TYPES.TAWOOS);
            if (evaluation.needs.needsPL) slotDocTypes.push(DOC_TYPES.PL);
            if (evaluation.needs.needsDN) slotDocTypes.push(DOC_TYPES.DELIVERY_NOTE);
            // Edge-case fallback if active doc exists for another type
            Object.keys(evaluation.activeDocsByType || {}).forEach((dt) => {
              if (!slotDocTypes.includes(dt)) slotDocTypes.push(dt);
            });

            return (
              <div
                key={order.id}
                id={`inv-order-card-${order.id}`}
                ref={(el) => {
                  if (el) cardRefs.current[order.id] = el;
                }}
                className={`bg-white rounded-2xl border transition p-3.5 space-y-3 shadow-2xs ${
                  ffStyle.startBorderClasses
                } ${
                  isHighlighted
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-md'
                    : evaluation.needsRevision
                      ? 'border-amber-300'
                      : 'border-slate-200'
                }`}
              >
                {/* Card Top Meta Row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-black text-sm text-slate-900">
                      #{orderSerial}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {order.loadingDate || order.invoiceDate || '—'}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${ffStyle.badgeClasses}`}
                    >
                      {isAr ? ffObj.labelAr : ffObj.labelEn}
                    </span>
                    {renderVatAbbrChip(order.vatMode, order.orderType, isAr)}
                    {evaluation.needs.isTransformationCase && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                        {isAr ? 'حالة تحوّل (إذن + ضريبية)' : 'Transformation Case'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isDispatched && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isAr ? 'إذن الصرف ✓' : 'Dispatch Doc ✓'}</span>
                      </span>
                    )}
                    <RowCommentButton
                      docId={order.id}
                      docNumber={`SO-${orderSerial}`}
                      tab="sales_orders"
                      module="sales"
                    />
                  </div>
                </div>

                {/* Client / Branch + Logistics Summary Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() =>
                      setProfileModalTarget({
                        client,
                        clientId: order.clientId,
                        focusBranchId: order.branchId,
                        focusBranchName: order.branchName,
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-start group cursor-pointer"
                  >
                    <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-black text-xs text-slate-900 group-hover:text-indigo-700 group-hover:underline">
                      {client?.tradeNameAr || client?.name || order.clientName || '—'}
                    </span>
                    {branchLabel && (
                      <span className="text-[11px] font-semibold text-slate-500">
                        ({branchLabel})
                      </span>
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {loNum > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200">
                        <Truck className="w-3 h-3 text-slate-500 rtl:-scale-x-100" />
                        <span>{isAr ? `تحميل #${loNum}` : `Trip #${loNum}`}</span>
                      </span>
                    )}
                    {(vehicleObj || order.assignedVehicleName) && (
                      <TruckNameBadge
                        vehicle={vehicleObj}
                        name={resolveVehicleDisplayName(vehicleObj, order.assignedVehicleName)}
                        plate={vehicleObj?.plateNumber || order.assignedVehiclePlate}
                        isAr={isAr}
                        className="text-[11px] bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200"
                      />
                    )}
                    <span className="font-mono font-black text-slate-900">
                      {Number(order.grandTotal || 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      EGP
                    </span>
                  </div>
                </div>

                {/* Needs Revision Banner */}
                {evaluation.needsRevision && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        {isAr
                          ? 'تغيّرت بيانات أو كميات الأمر بعد إصدار الفاتورة — يُرجى مراجعة وإصدار نسخة محدّثة (v2+).'
                          : 'Order lines or totals changed after invoicing — issue a revised document version.'}
                      </span>
                    </div>
                    {canIssueInvoice && evaluation.revisionDocTypes?.[0] && (
                      <button
                        type="button"
                        onClick={() => {
                          const dt = evaluation.revisionDocTypes[0];
                          const docObj = evaluation.activeDocsByType?.[dt] || null;
                          openSlotPreview({
                            order,
                            docType: dt,
                            existingCommittedDoc: docObj,
                            isRevisionMode: true,
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px] cursor-pointer"
                      >
                        {isAr ? 'معاينة وإصدار مراجعة' : 'Preview & Revise'}
                      </button>
                    )}
                  </div>
                )}

                {/* Document Slot Rows */}
                <div className="space-y-2">
                  {slotDocTypes.map((dt) => {
                    const meta = DOC_BADGE_META[dt] || DOC_BADGE_META[DOC_TYPES.TAWOOS];
                    const committedDoc = evaluation.activeDocsByType?.[dt] || null;
                    const draft = getSlotDraft(order, dt);
                    const slotNeedsRev = evaluation.revisionDocTypes?.includes(dt);
                    const poVal =
                      dt === DOC_TYPES.TAWOOS
                        ? order.poTawoos
                        : dt === DOC_TYPES.PL
                          ? order.poPrivateLabel
                          : order.poTawoos || order.poPrivateLabel;

                    const liveCheck = committedDoc
                      ? { allowed: true }
                      : isValidSplitLoadShare(
                          {
                            docType: dt,
                            serialNo: draft.serialNo,
                            orderId: order.id,
                            clientId: order.clientId,
                            invoiceDate: draft.invoiceDate,
                            isSplitLoad: draft.isSplitLoad,
                          },
                          activeInvoices
                        );

                    const etaLocked =
                      committedDoc?.etaStatus === 'submitted' ||
                      committedDoc?.etaStatus === 'valid' ||
                      committedDoc?.glPosted === true;

                    return (
                      <div
                        key={dt}
                        className={`p-2.5 rounded-xl border text-xs space-y-2 ${
                          slotNeedsRev
                            ? 'bg-amber-50/70 border-amber-300'
                            : committedDoc
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-slate-50/80 border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-md border text-[11px] font-black ${meta.chipClasses}`}
                            >
                              {isAr ? meta.labelAr : meta.labelEn}
                            </span>
                            {poVal && (
                              <span className="font-mono text-[10.5px] font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                PO: {poVal}
                              </span>
                            )}
                          </div>

                          {committedDoc ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono font-black">
                                <Lock className="w-3 h-3" />
                                <span>
                                  {meta.prefix}-{committedDoc.serialNo} (v{committedDoc.version || 1})
                                </span>
                              </span>
                              {committedDoc.cashSales && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold">
                                  {isAr ? 'بيع نقدي' : 'Cash Sales'}
                                </span>
                              )}
                              {committedDoc.isSplitLoad && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 text-[10px] font-bold">
                                  {isAr ? 'تحميل مجزأ' : 'Split-Load'}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  openSlotPreview({
                                    order,
                                    docType: dt,
                                    existingCommittedDoc: committedDoc,
                                    isRevisionMode: false,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>{isAr ? 'معاينة / طباعة' : 'Preview / Print'}</span>
                              </button>
                              {canIssueInvoice && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSlotPreview({
                                      order,
                                      docType: dt,
                                      existingCommittedDoc: committedDoc,
                                      isRevisionMode: true,
                                    })
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-bold text-[11px] cursor-pointer ${
                                    slotNeedsRev
                                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700'
                                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                  }`}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>
                                    {isAr
                                      ? `مراجعة (v${Number(committedDoc.version || 1) + 1})`
                                      : `Revise (v${Number(committedDoc.version || 1) + 1})`}
                                  </span>
                                </button>
                              )}
                              {canVoidInvoice && !etaLocked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidModalDoc(committedDoc);
                                    setVoidReason('');
                                    setVoidError('');
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer"
                                  title={isAr ? 'إلغاء (Void) المستند' : 'Void Invoice Document'}
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>{isAr ? 'إلغاء' : 'Void'}</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <input
                                type="text"
                                value={draft.serialNo}
                                onChange={(e) => updateSlotDraft(order.id, dt, { serialNo: e.target.value })}
                                placeholder="#"
                                className={`w-24 px-2 py-1 rounded-lg border font-mono font-black text-xs text-center ${
                                  liveCheck.allowed
                                    ? 'border-slate-300 bg-white text-slate-900'
                                    : 'border-rose-400 bg-rose-50 text-rose-900'
                                }`}
                                title={isAr ? 'رقم مسلسل المستند' : 'Document Serial #'}
                              />
                              <input
                                type="date"
                                value={draft.invoiceDate}
                                onChange={(e) =>
                                  updateSlotDraft(order.id, dt, { invoiceDate: e.target.value })
                                }
                                className="px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono text-[11px] text-slate-800"
                              />
                              <label
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10.5px] font-bold cursor-pointer ${
                                  draft.isSplitLoad
                                    ? 'bg-sky-100 text-sky-900 border-sky-300'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                                title={
                                  isAr
                                    ? 'مشاركة نفس المسلسل مع أمر آخر لنفس العميل ونفس التاريخ ونفس النوع'
                                    : 'Allow Split-Load serial share (same Client + Date + Doc Type)'
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.isSplitLoad}
                                  onChange={(e) =>
                                    updateSlotDraft(order.id, dt, { isSplitLoad: e.target.checked })
                                  }
                                  className="accent-sky-600"
                                />
                                <Split className="w-3 h-3" />
                                <span>{isAr ? 'مشترك' : 'Split'}</span>
                              </label>
                              {canIssueInvoice && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSlotPreview({
                                      order,
                                      docType: dt,
                                      existingCommittedDoc: null,
                                      isRevisionMode: false,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] cursor-pointer shadow-2xs"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>{isAr ? 'معاينة واعتماد' : 'Preview & Commit'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Live duplicate / split-load validation warning on uncommitted slot */}
                        {!committedDoc && !liveCheck.allowed && (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>{isAr ? liveCheck.reasonAr : liveCheck.reason}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invoice Preview / Save Modal */}
      {previewContext && (
        <InvoicePreviewModal
          isOpen={Boolean(previewContext)}
          onClose={() => setPreviewContext(null)}
          order={previewContext.order}
          docType={previewContext.docType}
          serialNo={previewContext.serialNo}
          invoiceDate={previewContext.invoiceDate}
          isSplitLoad={previewContext.isSplitLoad}
          isRevisionMode={previewContext.isRevisionMode}
          existingCommittedDoc={previewContext.existingCommittedDoc}
          client={clientsMap[previewContext.order?.clientId] || null}
          productsMap={productsMap}
          allActiveDocs={activeInvoices}
          currentUser={currentUser}
          isAr={isAr}
          zIndexClass="z-[75]"
        />
      )}

      {/* Void Confirmation Modal */}
      {voidModalDoc && (
        <div
          className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isVoiding && setVoidModalDoc(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-5 space-y-4"
            dir={isAr ? 'rtl' : 'ltr'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700 font-black text-sm">
                <Ban className="w-5 h-5" />
                <span>
                  {isAr ? 'إلغاء مستند فاتورة / إذن تسليم (Void)' : 'Void Invoice Document'}
                </span>
              </div>
              <button
                type="button"
                disabled={isVoiding}
                onClick={() => setVoidModalDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
              <div>
                <strong>{isAr ? 'المستند:' : 'Document:'}</strong>{' '}
                <span className="font-mono font-black">
                  #{voidModalDoc.serialNo} (v{voidModalDoc.version || 1})
                </span>
              </div>
              <div>
                <strong>{isAr ? 'الأمر / العميل:' : 'Order / Client:'}</strong>{' '}
                #{voidModalDoc.orderNo || voidModalDoc.orderId} — {voidModalDoc.clientName}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'سبب الإلغاء (إلزامي للتدقيق):' : 'Void Reason (Mandatory for Audit Trail):'}
              </label>
              <textarea
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={isAr ? 'مثال: خطأ في اختيار العميل أو تكرار الإدخال...' : 'Reason for voiding document...'}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:border-rose-400 focus:outline-none"
              />
            </div>

            {voidError && (
              <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
                {voidError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isVoiding}
                onClick={() => setVoidModalDoc(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isVoiding}
                onClick={handleConfirmVoid}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                {isVoiding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isAr ? 'تأكيد إلغاء المستند' : 'Confirm Void'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Standardized Client Profile Modal */}
      {profileModalTarget && (
        <ClientProfileModal
          isOpen={Boolean(profileModalTarget)}
          onClose={() => setProfileModalTarget(null)}
          client={profileModalTarget.client}
          clientId={profileModalTarget.clientId}
          focusBranchId={profileModalTarget.focusBranchId}
          focusBranchName={profileModalTarget.focusBranchName}
          clients={clients}
          segments={segments}
          pricingStrategies={pricingStrategies}
          salesOrders={orders}
          isAr={isAr}
          zIndexClass="z-[75]"
        />
      )}
    </div>
  );
}

/**
 * Clickable Sequence History & Gap Details Popover (viewport-aware).
 */
function SequenceHistoryPopover({ title, audit, isAr, onClose, onSelectDoc }) {
  return (
    <div className="absolute top-full mt-2 start-0 z-40 w-[340px] max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
      <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <span className="text-xs font-black text-slate-800">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-800 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Gaps Section (ignoring >= 100 jumps) */}
      {audit.gaps?.length > 0 && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 space-y-1">
          <div className="font-black flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>
              {isAr
                ? 'فجوات تسلسل مرصودة (تنبيه غير معطّل):'
                : 'Detected Sequence Gaps (non-blocking):'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 font-mono">
            {audit.gaps.map((g, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded bg-white border border-amber-300 font-bold text-[10px]"
              >
                {g.from === g.to ? `#${g.from}` : `#${g.from}–#${g.to}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Committed History */}
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
        {audit.recentHistory?.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 font-bold">
            {isAr ? 'لا توجد مستندات مصدرة في هذا التسلسل بعد' : 'No committed documents in this sequence yet'}
          </div>
        ) : (
          audit.recentHistory.map((docItem) => {
            const meta = DOC_BADGE_META[docItem.docType] || DOC_BADGE_META[DOC_TYPES.TAWOOS];
            return (
              <button
                key={docItem.docId || docItem.id}
                type="button"
                onClick={() => onSelectDoc(docItem)}
                className="w-full px-3 py-2 text-start hover:bg-indigo-50/60 transition flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-black text-xs text-slate-900">
                      {meta.prefix}-{docItem.serialNo}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                      v{docItem.version || 1}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {docItem.invoiceDate}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-600 truncate">
                    #{docItem.orderNo || docItem.orderId} • {docItem.clientName || '—'}
                  </div>
                </div>
                <Eye className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
