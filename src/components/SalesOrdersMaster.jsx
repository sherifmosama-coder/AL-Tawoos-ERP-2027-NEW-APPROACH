import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
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
  PackageMinus,
  Store,
  ClipboardCheck,
  ClipboardList,
  FileImage,
  RotateCcw
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import SalesOrderAuditModal from './SalesOrderAuditModal';
import OrderSplitModal from './OrderSplitModal';
import RetailSettlementModal from './RetailSettlementModal';
import StandardRetailListModal from './StandardRetailListModal';
import ClientProfileModal from './ClientProfileModal';
import PeacockLoader from './PeacockLoader';
import { canAccessAction } from '../config/appArchitecture';
import {
  PHYSICAL_DELIVERY_EXCLUDED_TYPES,
  POST_DISPATCH_STATUSES,
  parseOrderSerialParts,
  compareOrdersBySerialAsc,
  calculateSalesOrderLineTotals,
  aggregateSalesOrderTotals,
  openPrintableAdjustmentSlip,
  isOrderRetailRoute,
  isRetailSegmentRecord,
  openPrintableRetailSettlementSlip
} from '../utils/salesOrderUtils';
import {
  makeTripDispatchDocId,
  resolveOrderTripDispatch,
  evaluateReturnDiscrepancySummary
} from '../utils/truckDispatchUtils';
import {
  completeActionRequired,
  dispatchWorkflowEvent
} from '../utils/notificationEngine';
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


import {
  ADMIN_ORDER_TYPES,
  ORDER_TYPES,
  CONFIRMATION_STATUSES,
  FULFILLMENT_STATUSES,
  SALES_FULFILLMENT_STYLE_MAP,
  resolveVehicleDisplayName,
  VAT_MODES,
  resolveOrderSerial,
  resolveLocationUrl,
  resolveOrderOperationalProfile,
  renderVatAbbrChip,
  CopyButton,
} from './salesOrders/salesOrderConstants';
import { SalesOrderEditorModal } from './salesOrders/SalesOrderEditorModal';
import TruckNameBadge from './TruckNameBadge';

export { SalesOrderEditorModal };


export default function SalesOrdersMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin' || currentUser?.role === 'admin';
  const canCreateSalesOrder = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canCreate', currentUser);
  const canEditSalesOrder = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canEdit', currentUser);
  const canSplitOrder = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canSplitOrder', currentUser);
  const canAdjustDispatchedQty = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canAdjustDispatchedQuantities', currentUser);
  const canSettleRetailOrders = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canSettleRetailOrders', currentUser);
  const canManageStdRetailList = isGeneralAdmin || canAccessAction(permissions, 'sales_orders', 'canManageStdRetailList', currentUser);
  const currentUserName = currentUser?.nameAr || currentUser?.name || 'مستخدم معتمد';
  const currentUserId = currentUser?.id || 'usr_unknown';

  // Cloud State
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [segments, setSegments] = useState([]);
  const [products, setProducts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [truckDispatches, setTruckDispatches] = useState([]);
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
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [clientProfileTarget, setClientProfileTarget] = useState(null);

  // Expandable Rows State
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());

  // Modal States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editorInitialAdjustmentMode, setEditorInitialAdjustmentMode] = useState(false);
  const [prefillTripContext, setPrefillTripContext] = useState(null);
  const [activeSettlementTripId, setActiveSettlementTripId] = useState('');
  const [isCompletingSettlementTask, setIsCompletingSettlementTask] = useState(false);
  const handledSettlementDeepLinkRef = useRef('');
  const [isAdminModal, setIsAdminModal] = useState(false);
  const [auditModalOrder, setAuditModalOrder] = useState(null);
  const [splitModalOrder, setSplitModalOrder] = useState(null);
  const [splitGuidanceOrder, setSplitGuidanceOrder] = useState(null);
  const [retailSettlementModalOrder, setRetailSettlementModalOrder] = useState(null);
  const [stdRetailListDoc, setStdRetailListDoc] = useState({ items: [], updatedAt: null, updatedBy: null });
  const [isStdRetailModalOpen, setIsStdRetailModalOpen] = useState(false);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);

  // 3-Dots Action Menu Anchor & Viewport-Aware Popover Refs
  const [activeActionsMenuOrderId, setActiveActionsMenuOrderId] = useState(null);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
  const actionsMenuRef = useRef(null);
  const closedByOwnTriggerOrderIdRef = useRef(null);

  // Split Portion Card Hover Tooltip (Portal-rendered for unclipped visibility)
  const [hoveredPortionTooltip, setHoveredPortionTooltip] = useState(null);

  const activeOrderForMenu = useMemo(() => {
    if (!activeActionsMenuOrderId) return null;
    return orders.find((o) => o.id === activeActionsMenuOrderId) || null;
  }, [activeActionsMenuOrderId, orders]);

  // 1. Subscribe to Sales Orders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sales_orders'), (snapshot) => {
      const loaded = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => !d.isDeleted);
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

  // 8b. Subscribe to Truck Dispatches (synced DD-XXXXX / RET-XXXXX doc numbers & return discrepancy alerts)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'truck_dispatches'), (snapshot) => {
      setTruckDispatches(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 8c. Subscribe to Unified Personnel Directory (for Sales Rep dropdown)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'employees'), (snapshot) => {
      setEmployees(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const truckDispatchesById = useMemo(() => {
    const map = {};
    (truckDispatches || []).forEach((td) => {
      if (td && td.id) map[td.id] = td;
    });
    return map;
  }, [truckDispatches]);

  // 9. Subscribe to Global Standard Retail Load List Config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'retail_standard_load_list'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};
        setStdRetailListDoc({
          items: Array.isArray(data.items) ? data.items : [],
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedBy || null
        });
      } else {
        setStdRetailListDoc({ items: [], updatedAt: null, updatedBy: null });
      }
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

  // Fast Navigation to Truck Dispatch (Trip Card or Return Inspection Modal)
  const handleNavigateToTruckDispatch = (order, { openReturn = false } = {}) => {
    if (!order || typeof window === 'undefined') return;
    const loNum = Number(order.loadingOrderNumber || 0);
    const tripId =
      order.fgWarehouseDispatchId ||
      (loNum > 0 ? makeTripDispatchDocId(order.loadingDate || order.invoiceDate, loNum) : '');
    if (!tripId) return;
    window.location.hash = `#truck_dispatch?module=sales&tripId=${encodeURIComponent(tripId)}${openReturn ? '&openReturn=1' : ''}`;
  };

  const openCreateOrderForTrip = (tripId, { orderType = 'supply', fromTripExtras = false } = {}) => {
    if (!tripId || !canCreateSalesOrder) return;
    const dDoc = truckDispatchesById[tripId] || null;
    const siblingOrder =
      orders.find(
        (o) =>
          o &&
          !o.isSplitParent &&
          o.confirmationStatus !== 'canceled' &&
          (o.fgWarehouseDispatchId === tripId ||
            (Number(o.loadingOrderNumber || 0) > 0 &&
              makeTripDispatchDocId(o.loadingDate || o.invoiceDate, o.loadingOrderNumber) === tripId))
      ) || null;
    const vehObj =
      vehicles.find((v) => v.id === (dDoc?.vehicleId || siblingOrder?.assignedVehicleId)) || null;
    const loadingDate = dDoc?.loadingDate || siblingOrder?.loadingDate || formatDateKey(new Date());
    const loadingOrderNumber = Number(dDoc?.loadingOrderNumber || siblingOrder?.loadingOrderNumber || 0) || null;

    setPrefillTripContext({
      tripId,
      loadingDate,
      loadingOrderNumber,
      assignedVehicleId: dDoc?.vehicleId || siblingOrder?.assignedVehicleId || '',
      assignedVehicleName: dDoc?.vehicleName || siblingOrder?.assignedVehicleName || vehObj?.vehicleModel || vehObj?.name || '',
      assignedVehiclePlate: dDoc?.plateNumber || siblingOrder?.assignedVehiclePlate || vehObj?.plateNumber || '',
      assignedDriverId: dDoc?.driverId || siblingOrder?.assignedDriverId || '',
      assignedDriverName: dDoc?.driverName || siblingOrder?.assignedDriverName || '',
      assignedDeliveryRepId: dDoc?.deliveryRepId || siblingOrder?.assignedDeliveryRepId || '',
      assignedDeliveryRepName: dDoc?.deliveryRepName || siblingOrder?.assignedDeliveryRepName || '',
      orderType: orderType || 'supply',
      settledFromTripExtras: Boolean(fromTripExtras && (orderType || 'supply') === 'supply'),
      fulfillmentStatus: 'delivered',
    });
    setEditingOrder(null);
    setEditorInitialAdjustmentMode(false);
    setIsAdminModal(false);
    setIsEditorOpen(true);
  };

  const handleCompleteSettlementTask = async (tripDoc) => {
    if (!tripDoc?.id) return;
    setIsCompletingSettlementTask(true);
    try {
      const nowIso = new Date().toISOString();
      const prevTasks = Array.isArray(tripDoc.returnSettlementTasks) ? tripDoc.returnSettlementTasks : [];
      const nextTasks = prevTasks.map((t) =>
        t.status === 'open'
          ? {
              ...t,
              status: 'completed',
              completedAt: nowIso,
              completedBy: currentUserId,
              completedByName: currentUserName,
            }
          : t
      );
      const doneAudit = {
        id: `AUD-TSKD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        userId: currentUserId,
        userName: currentUserName,
        performedBy: currentUserName,
        performedById: currentUserId,
        action: 'truck_return_settlement_task_completed',
        summaryAr: `تم تنفيذ مهمة تسوية أوامر البيع لتحميل #${tripDoc.loadingOrderNumber} بواسطة ${currentUserName}`,
        summaryEn: `Completed Sales Order settlement task for Trip #${tripDoc.loadingOrderNumber} by ${currentUserName}`,
        changes: { metadata: [], lineChanges: [] },
      };

      await setDoc(
        doc(db, 'truck_dispatches', tripDoc.id),
        {
          returnSettlementTasks: nextTasks,
          auditTrail: [...(Array.isArray(tripDoc.auditTrail) ? tripDoc.auditTrail : []), doneAudit],
          updatedAt: nowIso,
          updatedBy: currentUserId,
          updatedByName: currentUserName,
        },
        { merge: true }
      );

      await completeActionRequired({
        actionType: 'trip_return_order_settlement_task',
        docId: tripDoc.id,
        completedBy: currentUserId,
        completedByName: currentUserName,
        resolutionNote: `Sales order settlement completed by ${currentUserName}`,
      });

      await dispatchWorkflowEvent({
        eventKey: 'trip_return_alignment_accounting',
        docId: tripDoc.id,
        docNumber: `LO-${tripDoc.loadingOrderNumber}`,
        titleAr: `تمت تسوية أوامر بيع مرتجع تحميل #${tripDoc.loadingOrderNumber} — جاهز لمطابقة المحاسبة`,
        titleEn: `Order Settlement Completed for Trip #${tripDoc.loadingOrderNumber} — Ready for Accounting Alignment`,
        messageAr: `أتم (${currentUserName}) تعديل/إضافة أوامر البيع المطلوبة. يرجى مراجعة نافذة المرتجعات وتأكيد المطابقة النهائية.`,
        messageEn: `(${currentUserName}) completed the requested Sales Order settlement. Please open Return Receiving to confirm final alignment.`,
        targetModule: 'sales',
        targetTab: 'truck_dispatch',
        highlightId: tripDoc.id,
        actor: currentUser,
        metadata: { tripId: tripDoc.id, openReturn: '1' },
      });
    } catch (err) {
      console.error('Failed completing settlement task:', err);
      alert(isAr ? 'تعذر إغلاق مهمة التسوية.' : 'Failed closing settlement task.');
    } finally {
      setIsCompletingSettlementTask(false);
    }
  };

  // Listen for Incoming Deep-Link Focus & Settlement Launchers from Loading Plan / Truck Dispatch
  useEffect(() => {
    const processSettlementParams = ({
      orderId = '',
      focusOrder = '',
      openAdjust = '',
      openRetailSettle = '',
      createForTrip = '',
      orderType = '',
      fromTripExtras = '',
      settlementTripId = '',
    } = {}) => {
      if (settlementTripId) {
        setActiveSettlementTripId(settlementTripId);
      }

      const actionKey = `${orderId}|${focusOrder}|${openAdjust}|${openRetailSettle}|${createForTrip}|${orderType}|${fromTripExtras}`;
      if (createForTrip && handledSettlementDeepLinkRef.current !== actionKey && (truckDispatches.length > 0 || orders.length > 0)) {
        handledSettlementDeepLinkRef.current = actionKey;
        if (canCreateSalesOrder) {
          openCreateOrderForTrip(createForTrip, {
            orderType: orderType || 'supply',
            fromTripExtras: fromTripExtras === '1',
          });
        }
        return;
      }

      if ((orderId || focusOrder) && orders.length > 0) {
        const found =
          (orderId ? orders.find((o) => o.id === orderId) : null) ||
          (focusOrder ? orders.find((o) => resolveOrderSerial(o, orders) === focusOrder || o.id === focusOrder) : null);
        const resolvedFound =
          found && found.splitParentId && found.invoiceSplitMode === 'merged_on_parent'
            ? orders.find((o) => o.id === found.splitParentId) || found
            : found;
        const resolvedSerial = resolvedFound ? resolveOrderSerial(resolvedFound, orders) : (focusOrder || '');
        if (resolvedSerial) setSearchTerm(resolvedSerial);
        if (resolvedFound) {
          setExpandedOrderIds((prev) => new Set([...prev, resolvedFound.id]));
          if (handledSettlementDeepLinkRef.current !== actionKey) {
            if (openAdjust === '1' && (canAdjustDispatchedQty || canEditSalesOrder)) {
              handledSettlementDeepLinkRef.current = actionKey;
              setPrefillTripContext(null);
              setIsAdminModal(false);
              setEditorInitialAdjustmentMode(true);
              setEditingOrder(resolvedFound);
              setIsEditorOpen(true);
            } else if (openRetailSettle === '1' && canSettleRetailOrders) {
              handledSettlementDeepLinkRef.current = actionKey;
              setRetailSettlementModalOrder(resolvedFound);
            }
          }
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

    const checkHashFocus = () => {
      if (typeof window === 'undefined') return;
      const rawHash = window.location.hash || '';
      if (!rawHash.includes('sales_orders')) return;
      const queryPart = rawHash.split('?')[1];
      if (!queryPart) return;
      const params = new URLSearchParams(queryPart);
      processSettlementParams({
        orderId: params.get('orderId') || '',
        focusOrder: params.get('focusOrder') || '',
        openAdjust: params.get('openAdjust') || '',
        openRetailSettle: params.get('openRetailSettle') || '',
        createForTrip: params.get('createForTrip') || '',
        orderType: params.get('orderType') || '',
        fromTripExtras: params.get('fromTripExtras') || '',
        settlementTripId: params.get('settlementTripId') || params.get('recordId') || '',
      });
    };

    checkHashFocus();
    window.addEventListener('hashchange', checkHashFocus);

    const handleCustomNav = (e) => {
      const { tab, ...rest } = e.detail || {};
      if (tab === 'sales_orders') {
        handledSettlementDeepLinkRef.current = '';
        processSettlementParams(rest);
      }
    };
    const handleSettlementNav = (e) => {
      handledSettlementDeepLinkRef.current = '';
      processSettlementParams(e.detail || {});
    };
    window.addEventListener('app-navigate', handleCustomNav);
    window.addEventListener('app_focus_sales_orders_settlement', handleSettlementNav);

    return () => {
      window.removeEventListener('hashchange', checkHashFocus);
      window.removeEventListener('app-navigate', handleCustomNav);
      window.removeEventListener('app_focus_sales_orders_settlement', handleSettlementNav);
    };
  }, [orders, truckDispatches, canCreateSalesOrder, canEditSalesOrder, canAdjustDispatchedQty, canSettleRetailOrders]);

  const supportsNativePopover =
    typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

  const closeActionsMenu = () => {
    const el = actionsMenuRef.current;
    if (el && supportsNativePopover && el.matches(':popover-open')) {
      try {
        el.hidePopover();
      } catch (_) {}
    }
    setActiveActionsMenuOrderId(null);
    setActionsMenuAnchor(null);
  };

  // Position & open the 3-dots actions popover cleanly inside the viewport (top layer + JS collision fallback)
  useLayoutEffect(() => {
    const el = actionsMenuRef.current;
    const triggerEl = actionsMenuAnchor?.triggerEl;
    if (!activeActionsMenuOrderId || !actionsMenuAnchor || !el) return;

    const applyMeasuredFallbackCoords = () => {
      const triggerRect = triggerEl?.getBoundingClientRect?.() || actionsMenuAnchor.rect;
      if (!triggerRect) return;
      const menuRect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 8;
      const gap = 4;

      const spaceBelow = vh - triggerRect.bottom - pad;
      const spaceAbove = triggerRect.top - pad;
      const flipUp = menuRect.height + gap > spaceBelow && spaceAbove > spaceBelow;
      let top = flipUp ? triggerRect.top - menuRect.height - gap : triggerRect.bottom + gap;
      top = Math.max(pad, Math.min(vh - menuRect.height - pad, top));

      let left = isAr ? triggerRect.left : triggerRect.right - menuRect.width;
      if (left + menuRect.width > vw - pad) {
        left = triggerRect.left;
      }
      if (left < pad) {
        left = triggerRect.right - menuRect.width;
      }
      left = Math.max(pad, Math.min(vw - menuRect.width - pad, left));

      el.style.position = 'fixed';
      el.style.inset = 'auto';
      el.style.margin = '0';
      el.style.top = `${Math.round(top)}px`;
      el.style.left = `${Math.round(left)}px`;
      el.style.right = 'auto';
      el.style.maxHeight = `${Math.max(120, vh - pad * 2)}px`;
      el.style.overflowY = 'auto';
    };

    if (supportsNativePopover) {
      const supportsCssAnchor =
        typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('position-area: block-end');
      const supportsToggleSource =
        typeof ToggleEvent !== 'undefined' && 'source' in ToggleEvent.prototype;

      // Clear any stale inline fallback coordinates when native anchor positioning takes over
      if (supportsCssAnchor && supportsToggleSource && triggerEl) {
        el.style.position = '';
        el.style.inset = '';
        el.style.margin = '';
        el.style.top = '';
        el.style.left = '';
        el.style.right = '';
        el.style.maxHeight = '';
        el.style.overflowY = '';
      }

      try {
        if (!el.matches(':popover-open')) {
          if (supportsToggleSource && triggerEl) {
            el.showPopover({ source: triggerEl });
          } else {
            el.showPopover();
          }
        }
      } catch (_) {
        try {
          if (!el.matches(':popover-open')) el.showPopover();
        } catch (__) {}
      }

      if (!supportsCssAnchor || !supportsToggleSource || !triggerEl) {
        applyMeasuredFallbackCoords();
      }
    } else {
      applyMeasuredFallbackCoords();
    }
  }, [activeActionsMenuOrderId, actionsMenuAnchor, isAr, supportsNativePopover]);

  // Close 3-dots actions menu on outside click (fallback) or scroll/resize
  useEffect(() => {
    if (!activeActionsMenuOrderId) return;
    const handleClick = (e) => {
      if (!supportsNativePopover && !e.target.closest('[data-order-menu]')) {
        closeActionsMenu();
      }
    };
    const handleScrollOrResize = (e) => {
      if (e?.target instanceof Element && e.target.closest('[data-order-menu]')) return;
      closeActionsMenu();
    };
    document.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [activeActionsMenuOrderId, supportsNativePopover]);

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
        label = vName || (isAr ? 'أوامر غير مسكنة بشاحنة' : 'Unassigned Orders');
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

  const activeFiltersCount = useMemo(() => {
    let cnt = 0;
    if (clientFilter !== 'all') cnt++;
    if (orderTypeFilter !== 'all') cnt++;
    if (confirmationFilter !== 'all') cnt++;
    if (fulfillmentFilter !== 'all') cnt++;
    if (assignmentFilter !== 'all') cnt++;
    if (vatModeFilter !== 'all') cnt++;
    if (startDateFilter || endDateFilter) cnt++;
    if (revisedOnlyFilter) cnt++;
    if (groupBy !== 'none') cnt++;
    return cnt;
  }, [
    clientFilter,
    orderTypeFilter,
    confirmationFilter,
    fulfillmentFilter,
    assignmentFilter,
    vatModeFilter,
    startDateFilter,
    endDateFilter,
    revisedOnlyFilter,
    groupBy
  ]);

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

  // Delete Order Handler (Server Soft-Delete + Dispatch/Invoice Safeguard)
  const handleDeleteOrder = async (orderId) => {
    try {
      const softDeleteFn = httpsCallable(functions, 'systemSoftDeleteDocument');
      await softDeleteFn({
        collectionName: 'sales_orders',
        docId: orderId,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
      setDeleteConfirmOrder(null);
      setActiveActionsMenuOrderId(null);
    } catch (err) {
      console.error('Error soft-deleting sales order:', err);
      alert(err?.message || (isAr ? 'حدث خطأ أثناء حذف أمر البيع.' : 'Error deleting sales order.'));
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

  const activeSettlementTrip = activeSettlementTripId ? truckDispatchesById[activeSettlementTripId] || null : null;

  return (
    <div className="space-y-5 select-none font-sans">
      {/* Contextual Return Settlement Task Workbench Bar (shown ONLY when deep-linked from Return Discrepancy / Task) */}
      {activeSettlementTrip && (() => {
        const openTasks = (Array.isArray(activeSettlementTrip.returnSettlementTasks)
          ? activeSettlementTrip.returnSettlementTasks
          : []
        ).filter((t) => t.status === 'open');
        const latestTask = openTasks[openTasks.length - 1] || null;
        return (
          <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50/80 p-3.5 shadow-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-indigo-950 flex items-center gap-2 flex-wrap">
                    <span>
                      {isAr
                        ? `تسوية أوامر بيع مرتجعات تحميل #${activeSettlementTrip.loadingOrderNumber} (${activeSettlementTrip.loadingDate})`
                        : `Trip #${activeSettlementTrip.loadingOrderNumber} (${activeSettlementTrip.loadingDate}) Return Settlement Workbench`}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 font-mono text-[10px] font-black text-indigo-800">
                      {activeSettlementTrip.vehicleName || '—'}
                    </span>
                  </div>
                  {latestTask && (
                    <div className="text-[11px] font-bold text-indigo-900 mt-0.5">
                      {isAr ? `ملاحظة المحاسبة (${latestTask.createdByName}):` : `Accounting Note (${latestTask.createdByName}):`}{' '}
                      <span className="underline decoration-indigo-300">{latestTask.notes}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {canCreateSalesOrder && (
                  <>
                    <button
                      type="button"
                      onClick={() => openCreateOrderForTrip(activeSettlementTrip.id, { orderType: 'supply', fromTripExtras: true })}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAr ? 'أمر توريد (زيادات الرحلة)' : 'Supply Order (Extras)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openCreateOrderForTrip(activeSettlementTrip.id, { orderType: 'return_deduct', fromTripExtras: false })}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAr ? 'أمر مرتجع عميل للرحلة' : 'Client Return Order'}</span>
                    </button>
                  </>
                )}
                {openTasks.length > 0 && (
                  <button
                    type="button"
                    disabled={isCompletingSettlementTask}
                    onClick={() => handleCompleteSettlementTask(activeSettlementTrip)}
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تم إنجاز التسوية وإخطار المحاسبة' : 'Mark Settlement Done'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = `#truck_dispatch?module=sales&tripId=${encodeURIComponent(activeSettlementTrip.id)}&openReturn=1`;
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isAr ? 'العودة لمرتجع الرحلة' : 'Back to Trip Return'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSettlementTripId('')}
                  className="p-1.5 rounded-xl hover:bg-indigo-200/70 text-indigo-800 cursor-pointer"
                  title={isAr ? 'إخفاء شريط التسوية' : 'Dismiss'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main Action & Search Toolbar (Filter Bar Hidden Until Toggled) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث بالمسلسل (#0001)، العميل، الفرع، أمر الشراء PO، الملاحظات...' : 'Search by serial (#0001), client, branch, PO #, notes...'}
              className="w-full ps-10 pe-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition"
            />
          </div>

          {/* Grouped Action Controls Ordered by Operational Importance */}
          <div className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/80">
            {/* 1. Primary Action: New Sales Order */}
            {canCreateSalesOrder && (
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
            )}

            {/* 2. Secondary Action: Administrative / Financial Action */}
            <button
              type="button"
              onClick={() => {
                setEditingOrder(null);
                setIsAdminModal(true);
                setIsEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-indigo-50 text-slate-800 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
              title={isAr ? 'إجراء إداري / مالي (إداري، تحصيل، فاتورة فقط)' : 'Administrative / Financial Action (Admin, Collection, Invoice Only)'}
            >
              <Receipt className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isAr ? 'إجراء إداري / مالي' : 'Admin Action'}</span>
            </button>

            {/* 3. Utility: Export CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
              title={isAr ? 'تصدير إلى ملف CSV' : 'Export to CSV'}
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>{isAr ? 'تصدير' : 'Export'}</span>
            </button>

            {/* 4. Utility: Standard Retail List */}
            {canManageStdRetailList && (
              <button
                type="button"
                onClick={() => setIsStdRetailModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                title={isAr ? 'إعداد القائمة القياسية لتحميل التجزئة' : 'Configure Standard Retail Load List'}
              >
                <ClipboardList className="w-3.5 h-3.5 text-cyan-600" />
                <span>{isAr ? 'قائمة التجزئة' : 'Std Retail'}</span>
                {(stdRetailListDoc.items || []).length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 text-[10px] font-black font-mono">
                    {stdRetailListDoc.items.length}
                  </span>
                )}
              </button>
            )}

            {/* 5. Filter Bar Toggler */}
            <button
              type="button"
              onClick={() => setIsFiltersOpen((prev) => !prev)}
              aria-expanded={isFiltersOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                isFiltersOpen
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title={isFiltersOpen ? (isAr ? 'إخفاء شريط الفلاتر' : 'Hide Filters') : (isAr ? 'إظهار شريط الفلاتر' : 'Show Filters')}
            >
              <Filter className={`w-3.5 h-3.5 ${isFiltersOpen ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>{isAr ? 'تصفية' : 'Filters'}</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono text-[10px] font-black">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Dropdown Filters Row & Date Range Sub-Bar */}
        {isFiltersOpen && (
          <>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-8 gap-2 pt-2.5 border-t border-slate-100 text-xs animate-in fade-in duration-150">
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
                  {resolveVehicleDisplayName(v, v.code || (isAr ? 'شاحنة' : 'Truck'))}
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
          </>
        )}
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
                  <th className="py-3 px-3 text-start">{isAr ? 'العميل والتشغيل' : 'Client & Schedule'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'الكمية والوزن' : 'Qty & Weight'}</th>
                  <th className="py-3 px-2 text-center w-20">{isAr ? 'VAT' : 'VAT'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'أمر الشراء والمرفقات' : 'PO & Files'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'الملاحظات' : 'Notes'}</th>
                  <th className="py-3 px-3 text-start">{isAr ? 'التوزيع والمستندات' : 'Truck & Docs'}</th>
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
                          <td colSpan={9} className={`py-2.5 px-4 font-black text-xs ${gStyle ? gStyle.startBorderClasses : 'border-s-[4px] border-s-indigo-500'}`}>
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
                      const orderDispatchDoc = resolveOrderTripDispatch(order, truckDispatchesById);
                      const orderReturnDisc = evaluateReturnDiscrepancySummary(orderDispatchDoc);

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
                            {/* 1. Type, Serial & Dates */}
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

                                {/* Serial & Split Attribution */}
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
                                </div>

                                {/* Invoice & Loading Dates directly under # */}
                                <div className="flex flex-col gap-0.5 pt-0.5 text-[10.5px] font-mono">
                                  <div
                                    className="flex items-center gap-1 text-slate-700 font-bold"
                                    title={isAr ? 'تاريخ الفاتورة / التسليم' : 'Invoice Date'}
                                  >
                                    <Receipt className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>{order.invoiceDate || '—'}</span>
                                  </div>
                                  {!['admin', 'collection'].includes(order.orderType) && (
                                    <div
                                      className="flex items-center gap-1 text-slate-500 font-medium"
                                      title={isAr ? 'تاريخ التحميل والشحن' : 'Loading Date'}
                                    >
                                      <Truck className="w-3 h-3 text-amber-500 shrink-0 rtl:-scale-x-100" />
                                      <span>{order.loadingDate || order.invoiceDate || '—'}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Client, Branch, Region, Location & Schedule */}
                            <td className="py-3 px-3">
                              <div className="flex flex-col gap-1">
                                {order.orderType === 'admin' && !order.clientId ? (
                                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-purple-50 text-purple-700 border border-purple-200">
                                      <Landmark className="w-3.5 h-3.5" />
                                    </span>
                                    <span className="truncate max-w-[200px]">
                                      {isAr ? 'إجراء إداري عام' : 'General Administrative'}
                                    </span>
                                  </span>
                                ) : (
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
                                    title={isAr ? 'انقر لعرض ملف العميل وسجل الطلبات والأسعار' : 'Click to view Client Profile & Past Orders'}
                                    className="font-bold text-slate-900 hover:text-indigo-700 flex items-center gap-1.5 text-start transition cursor-pointer group/client"
                                  >
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
                                    <span className="truncate max-w-[200px] group-hover/client:underline">
                                      {order.clientName || order.clientId || '—'}
                                    </span>
                                  </button>
                                )}

                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                  {/* Branch Name: clickable into ClientProfileModal */}
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
                                      className="font-semibold text-slate-600 hover:text-indigo-700 hover:underline cursor-pointer"
                                    >
                                      {order.branchName}
                                    </button>
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

                                {/* Schedule & Weekly Holidays placed cleanly under Client */}
                                {(profile.hasHours || profile.hasHolidays) && (
                                  <div className="flex flex-wrap items-center gap-2 text-[10.5px] pt-0.5">
                                    {profile.hasHours && (
                                      <span className="inline-flex items-center gap-1 font-mono text-slate-600 font-semibold">
                                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span>{profile.scheduleDisplay}</span>
                                      </span>
                                    )}
                                    {profile.hasHolidays && (
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] text-rose-700 font-bold"
                                        title={isAr ? 'عطلة أسبوعية' : 'Weekly holiday'}
                                      >
                                        <Calendar className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                                        <span className="truncate max-w-[130px]">{profile.holidaysDisplay}</span>
                                      </span>
                                    )}
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

                            {/* 7. Truck Assignment & Dispatch Documents Column (Right Before Status) */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              {(orderVehicleDisplayName || order.loadingOrderNumber) ? (
                                <div className="flex flex-col gap-1 items-start">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNavigateToLoadingPlan(order);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-800 hover:bg-indigo-100 hover:text-indigo-950 border border-indigo-200/90 shadow-2xs transition cursor-pointer max-w-[175px] truncate"
                                      title={
                                        isAr
                                          ? `شاحنة: ${orderVehicleDisplayName || '—'}${orderVehiclePlate ? ` (${orderVehiclePlate})` : ''} — تحميل #${order.loadingOrderNumber || '—'}${order.assignedDriverName ? ` — سائق: ${order.assignedDriverName}` : ''}`
                                          : `Truck: ${orderVehicleDisplayName || '—'}${orderVehiclePlate ? ` (${orderVehiclePlate})` : ''} — Trip #${order.loadingOrderNumber || '—'}${order.assignedDriverName ? ` — Driver: ${order.assignedDriverName}` : ''}`
                                      }
                                    >
                                      <Truck className="w-3 h-3 text-indigo-600 shrink-0 rtl:-scale-x-100" />
                                      <span className="truncate">{orderVehicleDisplayName || (isAr ? 'شاحنة' : 'Truck')}</span>
                                      {order.loadingOrderNumber && (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-200/80 text-indigo-950 font-mono font-black shrink-0">
                                          #{order.loadingOrderNumber}
                                        </span>
                                      )}
                                    </button>
                                    {orderVehiclePlate && (
                                      <CopyButton
                                        text={orderVehiclePlate}
                                        title={isAr ? `نسخ رقم اللوحة (${orderVehiclePlate})` : `Copy Plate # (${orderVehiclePlate})`}
                                        isAr={isAr}
                                        className="border border-slate-200 bg-slate-50 p-1 rounded-md"
                                      />
                                    )}
                                  </div>

                                  {(orderDispatchDoc?.latestDispatchDocNumber || orderReturnDisc.hasDiscrepancy || orderDispatchDoc?.latestReturnDocNumber) && (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {orderDispatchDoc?.latestDispatchDocNumber && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleNavigateToTruckDispatch(order, { openReturn: false });
                                          }}
                                          title={isAr ? 'فتح رحلة الصرف في تبويب صرف الشاحنات' : 'Open Trip in Truck Dispatch'}
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-300 font-mono text-[9px] font-black cursor-pointer transition"
                                        >
                                          <FileText className="w-2.5 h-2.5 shrink-0" />
                                          <span>{orderDispatchDoc.latestDispatchDocNumber}</span>
                                        </button>
                                      )}
                                      {orderReturnDisc.hasDiscrepancy ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleNavigateToTruckDispatch(order, { openReturn: true });
                                          }}
                                          title={isAr ? 'تنبيه: يوجد فرق مرتجع — انقر للمراجعة' : 'Return discrepancy detected — click to review'}
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-400 font-mono text-[9px] font-black cursor-pointer animate-pulse"
                                        >
                                          <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                          <span>{isAr ? 'فرق مرتجع' : 'Ret Variance'}</span>
                                        </button>
                                      ) : orderDispatchDoc?.latestReturnDocNumber ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleNavigateToTruckDispatch(order, { openReturn: true });
                                          }}
                                          title={isAr ? 'فتح إذن المرتجع في تبويب صرف الشاحنات' : 'Open Return Doc in Truck Dispatch'}
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono text-[9px] font-black cursor-pointer transition"
                                        >
                                          <RotateCcw className="w-2.5 h-2.5 shrink-0" />
                                          <span>{orderDispatchDoc.latestReturnDocNumber} ✓</span>
                                        </button>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              ) : !['admin', 'collection', 'invoice_only_with_tax', 'invoice_only_no_tax'].includes(order.orderType) ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigateToLoadingPlan(order);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 hover:bg-slate-100 px-1.5 py-0.5 rounded-md transition cursor-pointer border border-dashed border-slate-200"
                                  title={isAr ? 'الطلب غير مسكن بشاحنة — انقر للتسكين في خطة التحميل' : 'Unassigned — Click to assign in Loading Plan'}
                                >
                                  <Truck className="w-2.5 h-2.5 text-slate-300 rtl:-scale-x-100" />
                                  <span className="italic">{isAr ? 'غير مسكن' : 'Unassigned'}</span>
                                </button>
                              ) : (
                                <span className="text-slate-300 font-mono">—</span>
                              )}
                            </td>

                            {/* 8. Status (Confirmation, Complementary Revised Toggle & Fulfillment) */}
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
                                {!order.isSplitParent && isOrderRetailRoute(order, clients, segments) && (() => {
                                  const isSettled = order.retailSettlementStatus === 'settled';
                                  const isPostDisp = POST_DISPATCH_STATUSES.includes(order.fulfillmentStatus);
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isPostDisp || isSettled) {
                                          setRetailSettlementModalOrder(order);
                                        }
                                      }}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border shadow-2xs transition ${
                                        isSettled
                                          ? 'bg-teal-50 hover:bg-teal-100 text-teal-900 border-teal-300 cursor-pointer'
                                          : isPostDisp
                                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-400 animate-pulse cursor-pointer'
                                            : 'bg-cyan-50/70 text-cyan-800 border-cyan-200'
                                      }`}
                                      title={
                                        isSettled
                                          ? (isAr ? 'انقر لعرض أو تحديث تسوية مبيعات التجزئة' : 'Click to inspect or force-sync Retail settlement')
                                          : isPostDisp
                                            ? (isAr ? 'انقر لتأكيد الكميات المباعة بعد العودة' : 'Click to confirm post-arrival sold quantities')
                                            : (isAr ? 'أمر تجزئة — تُؤكد الكميات المباعة بعد العودة' : 'Retail route order — confirm sold qty after return')
                                      }
                                    >
                                      {isSettled ? <ClipboardCheck className="w-3 h-3 shrink-0" /> : <Store className="w-3 h-3 shrink-0" />}
                                      <span>
                                        {isSettled
                                          ? (isAr
                                              ? `تجزئة مسوّاة #${order.retailSettlementRevision || 1}`
                                              : `Retail Settled #${order.retailSettlementRevision || 1}`)
                                          : isPostDisp
                                            ? (isAr ? 'بانتظار تأكيد المباع' : 'Awaiting Sold Settlement')
                                            : (isAr ? 'خط سير تجزئة' : 'Retail Route')}
                                      </span>
                                    </button>
                                  );
                                })()}
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
                                  onPointerDown={() => {
                                    closedByOwnTriggerOrderIdRef.current =
                                      activeActionsMenuOrderId === order.id ? order.id : null;
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      closedByOwnTriggerOrderIdRef.current === order.id ||
                                      activeActionsMenuOrderId === order.id
                                    ) {
                                      closedByOwnTriggerOrderIdRef.current = null;
                                      closeActionsMenu();
                                    } else {
                                      closedByOwnTriggerOrderIdRef.current = null;
                                      const triggerEl = e.currentTarget;
                                      const rect = triggerEl.getBoundingClientRect();
                                      setActionsMenuAnchor({
                                        triggerEl,
                                        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
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
                              <td colSpan={9} className={`py-3 px-4 sm:ps-8 sm:pe-6 ${resolveRowStartBorder(order, isExpanded)}`}>
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

                                            <div className="flex flex-wrap items-center gap-1.5">
                                              {order.loadingOrderNumber && (
                                                <>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleNavigateToTruckDispatch(order, { openReturn: false });
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-teal-600 hover:text-white border border-teal-300 text-teal-800 text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer group"
                                                  >
                                                    <FileText className="w-3 h-3 text-teal-600 group-hover:text-white" />
                                                    <span>
                                                      {isAr
                                                        ? `فتح في صرف الشاحنات${orderDispatchDoc?.latestDispatchDocNumber ? ` (${orderDispatchDoc.latestDispatchDocNumber})` : ''}`
                                                        : `Open in Dispatch${orderDispatchDoc?.latestDispatchDocNumber ? ` (${orderDispatchDoc.latestDispatchDocNumber})` : ''}`}
                                                    </span>
                                                  </button>

                                                  {(['shipped', 'delivered', 'paid'].includes(order.fulfillmentStatus) ||
                                                    (orderDispatchDoc?.returnHandshakeStatus && orderDispatchDoc.returnHandshakeStatus !== 'none')) && (
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleNavigateToTruckDispatch(order, { openReturn: true });
                                                      }}
                                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-black rounded-lg border transition shadow-2xs cursor-pointer ${
                                                        orderReturnDisc.hasDiscrepancy
                                                          ? 'bg-rose-100 hover:bg-rose-600 text-rose-900 hover:text-white border-rose-400 animate-pulse'
                                                          : 'bg-white hover:bg-emerald-600 hover:text-white border-emerald-300 text-emerald-800'
                                                      }`}
                                                    >
                                                      {orderReturnDisc.hasDiscrepancy ? (
                                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                                      ) : (
                                                        <RotateCcw className="w-3 h-3 shrink-0" />
                                                      )}
                                                      <span>
                                                        {orderReturnDisc.hasDiscrepancy
                                                          ? (isAr ? 'مراجعة فرق المرتجع ⚠️' : 'Review Return Discrepancy ⚠️')
                                                          : (isAr ? 'إذن / حالة المرتجع' : 'Return Status / Doc')}
                                                      </span>
                                                    </button>
                                                  )}
                                                </>
                                              )}

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
                                          </div>

                                          {/* 4-Grid of Preserved Assignment Info */}
                                          {(orderVehicleDisplayName || order.loadingOrderNumber) ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                              <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                                                <span className="text-[10px] text-slate-400 block font-sans">{isAr ? 'الشاحنة المخصصة:' : 'Assigned Truck:'}</span>
                                                <div className="mt-0.5">
                                                  <TruckNameBadge
                                                    vehicle={matchedOrderVehicle}
                                                    name={order.assignedVehicleName}
                                                    plate={orderVehiclePlate}
                                                    isAr={isAr}
                                                    iconClassName="w-3.5 h-3.5 text-indigo-600 shrink-0 rtl:-scale-x-100"
                                                    nameClassName="font-black text-slate-900 truncate"
                                                    copyClassName="border border-slate-200 bg-slate-50 p-1 rounded-md"
                                                    emptyText={isAr ? 'غير محدد' : 'Unknown'}
                                                  />
                                                </div>
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
                                                  <span>{order.loadingOrderNumber ? (isAr ? `تحميل #${order.loadingOrderNumber}` : `Trip #${order.loadingOrderNumber}`) : '—'}</span>
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{order.loadingDate || order.invoiceDate || '—'}</span>
                                                {(orderDispatchDoc?.latestDispatchDocNumber || orderDispatchDoc?.latestReturnDocNumber || orderReturnDisc.hasDiscrepancy) && (
                                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                                    {orderDispatchDoc?.latestDispatchDocNumber && (
                                                      <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-900 border border-teal-200 font-mono text-[9.5px] font-black">
                                                        {orderDispatchDoc.latestDispatchDocNumber}
                                                      </span>
                                                    )}
                                                    {orderReturnDisc.hasDiscrepancy ? (
                                                      <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-900 border border-rose-300 font-mono text-[9.5px] font-black">
                                                        ⚠️ {orderDispatchDoc?.latestReturnDocNumber || (isAr ? 'فرق مرتجع' : 'Variance')}
                                                      </span>
                                                    ) : orderDispatchDoc?.latestReturnDocNumber ? (
                                                      <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[9.5px] font-black">
                                                        {orderDispatchDoc.latestReturnDocNumber} ✓
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                )}
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
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="text-[10px] font-mono text-slate-400">
                                                        {line.productCode}
                                                      </span>
                                                      <span>{isAr ? line.productNameAr : (line.productNameEn || line.productNameAr)}</span>
                                                      {line.packagingOptionSuffix && (
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                                          line.packagingOptionSuffix === 'any'
                                                            ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                                                            : 'bg-slate-100 text-slate-700 border-slate-300'
                                                        }`}>
                                                          {line.packagingOptionSuffix === 'any'
                                                            ? (isAr ? 'أي تعبئة (Any)' : 'Any Packing')
                                                            : (isAr ? (line.packagingOptionNameAr || line.packagingOptionSuffix) : (line.packagingOptionNameEn || line.packagingOptionNameAr || line.packagingOptionSuffix))}
                                                        </span>
                                                      )}
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

                                      {/* Retail Van-Sales Route Settlement & Buyer Proofs Panel */}
                                      {!order.isSplitParent && isOrderRetailRoute(order, clients, segments) && (
                                        order.retailSettlementStatus === 'settled' ||
                                        POST_DISPATCH_STATUSES.includes(order.fulfillmentStatus)
                                      ) && (() => {
                                        const isSettled = order.retailSettlementStatus === 'settled';
                                        const snap = order.preAdjustmentSnapshot || {};
                                        const loadedCtn = Number(snap.originalTotalCartons ?? ((Number(order.totalCartons || order.totalQty || 0)) + Number(order.returnedCartons || 0)));
                                        const soldCtn = Number(order.totalCartons ?? order.totalQty ?? 0);
                                        const unsoldCtn = Number(order.returnedCartons ?? Math.max(0, loadedCtn - soldCtn));
                                        const unsoldWeightKg = Number(order.returnedWeightKg || 0);
                                        const soldGrand = Number(order.grandTotal || 0);
                                        const buyerDocs = Array.isArray(order.retailSettlementAttachments) ? order.retailSettlementAttachments : [];

                                        if (!isSettled) {
                                          return (
                                            <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl flex items-center justify-between flex-wrap gap-3 shadow-2xs">
                                              <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                                                  <Store className="w-4 h-4" />
                                                </div>
                                                <div>
                                                  <h5 className="font-extrabold text-xs text-amber-950">
                                                    {isAr
                                                      ? 'رحلة مبيعات تجزئة — بانتظار جرد وتأكيد الكميات المباعة بعد العودة'
                                                      : 'Retail Route Trip — Awaiting Post-Arrival Sold Quantity Settlement'}
                                                  </h5>
                                                  <p className="text-[11px] text-amber-800">
                                                    {isAr
                                                      ? 'بمجرد عودة الشاحنة، قم بمطابقة المباع الفعلي مع غير المباع العائد للمخزن وإرفاق مستندات المشترين.'
                                                      : 'Confirm actual sold cartons vs unsold stock returning to warehouse and attach buyer reference documents.'}
                                                  </p>
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setRetailSettlementModalOrder(order);
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-xs"
                                              >
                                                <ClipboardCheck className="w-3.5 h-3.5" />
                                                <span>
                                                  {canSettleRetailOrders
                                                    ? (isAr ? 'تأكيد الكميات المباعة الآن' : 'Confirm Sold Quantities')
                                                    : (isAr ? 'معاينة الجرد' : 'View Settlement')}
                                                </span>
                                              </button>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div className="p-3.5 bg-gradient-to-r from-cyan-50/90 via-teal-50/40 to-cyan-50/80 border border-cyan-200 rounded-xl space-y-3 shadow-2xs">
                                            {/* Header */}
                                            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-cyan-200/80 pb-2">
                                              <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-lg bg-cyan-700 text-white flex items-center justify-center shadow-xs">
                                                  <Store className="w-4 h-4" />
                                                </div>
                                                <div>
                                                  <h5 className="font-extrabold text-xs text-cyan-950 flex items-center gap-2 flex-wrap">
                                                    <span>
                                                      {isAr
                                                        ? `تسوية رحلة مبيعات التجزئة (مراجعة #${order.retailSettlementRevision || 1})`
                                                        : `Retail Route Settlement & Invoice Reconciliation (Rev #${order.retailSettlementRevision || 1})`}
                                                    </span>
                                                  </h5>
                                                  <span className="text-[10px] text-cyan-800 font-medium">
                                                    {order.retailSettledBy
                                                      ? (isAr
                                                          ? `تمت التسوية بواسطة: ${order.retailSettledBy} ${order.retailSettledAt ? `(${new Date(order.retailSettledAt).toLocaleString('ar-EG')})` : ''}`
                                                          : `Settled by ${order.retailSettledBy} ${order.retailSettledAt ? `(${new Date(order.retailSettledAt).toLocaleString('en-US')})` : ''}`)
                                                      : ''}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-2">
                                                {canSettleRetailOrders && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setRetailSettlementModalOrder(order);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-800 text-[11px] font-bold rounded-lg transition cursor-pointer shadow-2xs"
                                                  >
                                                    <RefreshCw className="w-3 h-3 text-indigo-600" />
                                                    <span>{isAr ? 'تعديل ومزامنة قسرية (Force Sync)' : 'Edit / Force Sync'}</span>
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openPrintableRetailSettlementSlip(order, isAr);
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-700 hover:bg-cyan-800 text-white text-[11px] font-bold rounded-lg transition cursor-pointer shadow-2xs"
                                                >
                                                  <Printer className="w-3 h-3" />
                                                  <span>{isAr ? 'طباعة بيان تسوية التجزئة' : 'Print Retail Settlement'}</span>
                                                </button>
                                              </div>
                                            </div>

                                            {/* Notes */}
                                            {order.retailSettlementNotes && (
                                              <div className="px-2.5 py-1.5 bg-white/90 border border-cyan-200 rounded-lg text-[11px] text-cyan-950">
                                                <strong className="font-extrabold">{isAr ? 'ملاحظات الرحلة والتسوية: ' : 'Settlement Notes: '}</strong>
                                                <span>{order.retailSettlementNotes}</span>
                                              </div>
                                            )}

                                            {/* 4 Summary Metrics */}
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                                              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                                                <span className="text-[10px] text-slate-500 block font-semibold">{isAr ? 'المحمل على الشاحنة:' : 'Loaded on Truck:'}</span>
                                                <span className="font-mono font-bold text-slate-900 block mt-0.5">
                                                  {loadedCtn.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                                </span>
                                              </div>
                                              <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                                                <span className="text-[10px] text-emerald-700 block font-semibold">{isAr ? 'المباع الفعلي المعتمد:' : 'Confirmed Sold:'}</span>
                                                <span className="font-mono font-black text-emerald-900 block mt-0.5">
                                                  {soldCtn.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                                </span>
                                              </div>
                                              <div className="bg-sky-50 p-2.5 rounded-lg border border-sky-200">
                                                <span className="text-[10px] text-sky-900 block font-bold">{isAr ? 'غير المباع العائد للمخزن:' : 'Unsold Return to Warehouse:'}</span>
                                                <span className="font-mono font-black text-sky-900 block mt-0.5">
                                                  {unsoldCtn.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                                  {unsoldWeightKg > 0 ? ` (${(unsoldWeightKg / 1000).toFixed(2)} ${isAr ? 'طن' : 'Ton'})` : ''}
                                                </span>
                                              </div>
                                              <div className="bg-indigo-700 p-2.5 rounded-lg text-white">
                                                <span className="text-[10px] text-indigo-100 block font-bold">{isAr ? 'صافي الفاتورة النهائية:' : 'Settled Invoice Total:'}</span>
                                                <span className="font-mono font-black text-sm block mt-0.5">
                                                  {soldGrand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                                                </span>
                                              </div>
                                            </div>

                                            {/* Buyer Reference Proofs Gallery */}
                                            {buyerDocs.length > 0 && (
                                              <div className="p-2.5 bg-white border border-cyan-200/80 rounded-xl space-y-2">
                                                <div className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
                                                  <FileImage className="w-3.5 h-3.5 text-cyan-600" />
                                                  <span>
                                                    {isAr
                                                      ? `مرفقات ومراجع المشترين على خط السير (${buyerDocs.length}):`
                                                      : `Buyer Reference Documents (${buyerDocs.length}):`}
                                                  </span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  {buyerDocs.map((att, idx) => (
                                                    <button
                                                      key={att.id || idx}
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (att.url) setLightboxImage({ url: att.url, title: att.buyerNote || att.name });
                                                      }}
                                                      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 text-xs transition cursor-pointer"
                                                    >
                                                      <Eye className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                                                      <span className="font-bold text-slate-800 truncate max-w-[200px]">
                                                        {att.buyerNote || att.name}
                                                      </span>
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
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

      {/* Floating 3-Dots Portal Action Menu (Top-Layer Popover + Viewport-Aware Flip) */}
      {activeActionsMenuOrderId && actionsMenuAnchor && activeOrderForMenu && createPortal(
        <div
          ref={actionsMenuRef}
          data-order-menu
          popover={supportsNativePopover ? 'auto' : undefined}
          onToggle={(e) => {
            if (e.newState === 'closed') {
              setActiveActionsMenuOrderId(null);
              setActionsMenuAnchor(null);
            }
          }}
          style={!supportsNativePopover ? { zIndex: 9999 } : undefined}
          className="erp-viewport-popover w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100"
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

          {!activeOrderForMenu.isSplitParent &&
            isOrderRetailRoute(activeOrderForMenu, clients, segments) &&
            (POST_DISPATCH_STATUSES.includes(activeOrderForMenu.fulfillmentStatus) ||
              activeOrderForMenu.retailSettlementStatus === 'settled') && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRetailSettlementModalOrder(activeOrderForMenu);
                  setActiveActionsMenuOrderId(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-cyan-800 hover:bg-cyan-50 rounded-xl transition cursor-pointer font-bold text-start"
              >
                <Store className="w-3.5 h-3.5 text-cyan-600" />
                <span>
                  {activeOrderForMenu.retailSettlementStatus === 'settled'
                    ? (isAr ? 'تعديل تسوية التجزئة (Force Sync)' : 'Edit Retail Settlement (Force Sync)')
                    : (isAr ? 'تأكيد الكميات المباعة (تسوية التجزئة)' : 'Confirm Sold Qty (Retail Settlement)')}
                </span>
              </button>
              {activeOrderForMenu.retailSettlementStatus === 'settled' && (
                <button
                  type="button"
                  onClick={() => {
                    openPrintableRetailSettlementSlip(activeOrderForMenu, isAr);
                    setActiveActionsMenuOrderId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-teal-800 hover:bg-teal-50 rounded-xl transition cursor-pointer font-bold text-start"
                >
                  <Printer className="w-3.5 h-3.5 text-teal-600" />
                  <span>{isAr ? 'طباعة بيان تسوية التجزئة' : 'Print Retail Settlement Sheet'}</span>
                </button>
              )}
            </>
          )}

          {POST_DISPATCH_STATUSES.includes(activeOrderForMenu.fulfillmentStatus) &&
            canAdjustDispatchedQty &&
            !isOrderRetailRoute(activeOrderForMenu, clients, segments) && (
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
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition cursor-pointer font-bold text-start"
          >
            <span className="inline-flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isAr ? 'عرض سجل التدقيق' : 'View Audit Trail'}</span>
            </span>
            {activeOrderForMenu.auditTrail?.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono text-[10px] font-black">
                {activeOrderForMenu.auditTrail.length}
              </span>
            )}
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
                        · {isAr ? `تحميل #${child.loadingOrderNumber}` : `Trip #${child.loadingOrderNumber}`}
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
            setPrefillTripContext(null);
          }}
          editingOrder={editingOrder}
          isAdminModal={isAdminModal}
          prefillTripContext={prefillTripContext}
          canAdjustDispatchedQty={canAdjustDispatchedQty}
          initialAdjustmentMode={editorInitialAdjustmentMode}
          clients={clients}
          segments={segments}
          products={products}
          productCategories={productCategories}
          priceLists={priceLists}
          strategies={strategies}
          vehicles={vehicles}
          employees={employees}
          allOrders={orders}
          stdRetailList={stdRetailListDoc.items || []}
          canManageStdRetailList={canManageStdRetailList}
          onOpenStdRetailSetup={() => setIsStdRetailModalOpen(true)}
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

      {/* Retail Van-Sales Post-Arrival Quantity Settlement & Force Sync Modal */}
      {retailSettlementModalOrder && (
        <RetailSettlementModal
          isOpen={Boolean(retailSettlementModalOrder)}
          onClose={() => setRetailSettlementModalOrder(null)}
          order={retailSettlementModalOrder}
          canSettleRetailOrders={canSettleRetailOrders}
          allowDeferDelivery={false}
          vehicles={vehicles}
          resolveVehicleDisplayName={resolveVehicleDisplayName}
          isAr={isAr}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          onSuccess={() => {
            setRetailSettlementModalOrder(null);
          }}
        />
      )}

      {/* Standard Retail Load List Setup Modal */}
      {isStdRetailModalOpen && (
        <StandardRetailListModal
          isOpen={isStdRetailModalOpen}
          onClose={() => setIsStdRetailModalOpen(false)}
          products={products}
          productCategories={productCategories}
          standardRetailList={stdRetailListDoc.items || []}
          metadata={stdRetailListDoc}
          canManageStdRetailList={canManageStdRetailList}
          isAr={isAr}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
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

      {/* Delete Confirmation Alert Modal (with Dispatch/Invoice Safeguard) */}
      {deleteConfirmOrder && (() => {
        const hasProtectedDispatch = Boolean(
          deleteConfirmOrder.fgWarehouseDispatched ||
          POST_DISPATCH_STATUSES.includes(deleteConfirmOrder.fulfillmentStatus) ||
          (truckDispatches || []).some(
            (td) => Array.isArray(td.orderIds) && td.orderIds.includes(deleteConfirmOrder.id)
          )
        );
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 text-center space-y-3">
              <div className={`w-10 h-10 rounded-xl ${hasProtectedDispatch ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'} flex items-center justify-center mx-auto`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="font-black text-slate-800 text-sm">
                {hasProtectedDispatch
                  ? (isAr ? 'أمر مرتبط بالصرف / الشحن' : 'Dispatched Order Protected')
                  : (isAr ? 'تأكيد حذف أمر البيع؟' : 'Delete Sales Order?')}
              </h4>
              {hasProtectedDispatch ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium leading-relaxed">
                  {isAr
                    ? `لا يمكن حذف الأمر (#${resolveOrderSerial(deleteConfirmOrder, orders)}) لأنه مرتبط بإذن صرف شاحنة أو تم تسليمه/شحنه. يرجى استخدام (إلغاء أمر البيع) للحفاظ على سجل التدقيق.`
                    : `Order (#${resolveOrderSerial(deleteConfirmOrder, orders)}) is linked to truck dispatch or shipped/delivered fulfillment and cannot be deleted. Use Cancel Order instead to preserve audit traceability.`}
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {isAr
                    ? `هل أنت متأكد من أرشفة وحذف أمر البيع (#${resolveOrderSerial(deleteConfirmOrder, orders)})؟ سيظل محفوظاً في سجل التدقيق.`
                    : `Archive & soft-delete order (#${resolveOrderSerial(deleteConfirmOrder, orders)})? It remains recorded in audit logs.`}
                </p>
              )}
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOrder(null)}
                  className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
                {hasProtectedDispatch ? (
                  <button
                    type="button"
                    onClick={() => {
                      const ord = deleteConfirmOrder;
                      setDeleteConfirmOrder(null);
                      setCancelModalOrder(ord);
                      setCancelReason('');
                    }}
                    className="px-4 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 cursor-pointer"
                  >
                    {isAr ? 'إلغاء الأمر بدلاً من الحذف' : 'Cancel Order Instead'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDeleteOrder(deleteConfirmOrder.id)}
                    className="px-4 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 cursor-pointer"
                  >
                    {isAr ? 'تأكيد الحذف' : 'Soft Delete'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
        pricingStrategies={strategies}
        salesOrders={orders}
        isAr={isAr}
      />
    </div>
  );
}

