import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ShoppingCart,
  Search,
  Filter,
  Calendar,
  Clock,
  Zap,
  AlertTriangle,
  Trash2,
  X,
  Building2,
  MapPin,
  FileText,
  Upload,
  Boxes,
  History,
  Truck,
  Receipt,
  FileCheck,
  Paperclip,
  Eye,
  Check,
  Tag,
  Weight,
  RefreshCw,
  ShieldAlert,
  Info,
  Phone,
  Landmark,
  MessageSquare,
  Lock,
  StickyNote,
  Copy,
  PackageMinus,
  Store,
  ClipboardList,
} from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import PeacockLoader from '../PeacockLoader';
import {
  PHYSICAL_DELIVERY_EXCLUDED_TYPES,
  POST_DISPATCH_STATUSES,
  calculateSalesOrderLineTotals,
  aggregateSalesOrderTotals,
  isOrderRetailRoute,
  isRetailSegmentRecord,
  resolveSalesRepOptions,
  extractPastOrderDuplicationSpec,
} from '../../utils/salesOrderUtils';
import ClientProfileModal from '../ClientProfileModal';
import { normalizeLocationUrl } from '../../utils/locationUtils';
import { SEGMENT_ICON_MAP, PRESET_DEFAULT_SEGMENTS } from '../ClientSegmentsMaster';
import {
  DEFAULT_PRICING_STRATEGIES,
  formatDateKey,
  isProductPrivateLabel,
  isProductAllowedForClient,
  detectProductPrice,
  detectPromotionalDiscount,
} from '../../utils/pricingEngine';
import {
  compressImage,
  SALES_ORDER_TYPES,
  ADMIN_ORDER_TYPES,
  CONFIRMATION_STATUSES,
  resolveVehicleDisplayName,
  VAT_MODES,
  TAXABLE_VAT_MODES,
  resolveOrderSerial,
  generateNextOrderSerial,
  resolveBranchDisplayName,
  renderVatAbbrChip,
  CopyButton,
} from './salesOrderConstants';
import TruckNameBadge from '../TruckNameBadge';

/**
 * =========================================================================
 * SALES ORDER EDITOR MODAL (Order Header + Products Grid + 8-Tier Auto Pricing)
 * =========================================================================
 */
export function SalesOrderEditorModal({
  isOpen,
  onClose,
  editingOrder,
  isAdminModal = false,
  prefillTripContext = null,
  onSaved = null,
  zIndexClass = 'z-50',
  canAdjustDispatchedQty = false,
  initialAdjustmentMode = false,
  clients = [],
  segments = [],
  products = [],
  productCategories = [],
  priceLists = [],
  strategies = [],
  vehicles = [],
  employees = [],
  allOrders = [],
  stdRetailList = [],
  canManageStdRetailList = false,
  onOpenStdRetailSetup = null,
  isAr = true,
  currentUserName = 'مستخدم معتمد',
  currentUserId = 'usr_unknown',
  onOpenAuditTrail = null
}) {
  const nextSerial = generateNextOrderSerial(allOrders);
  const initialSerial = editingOrder ? resolveOrderSerial(editingOrder, allOrders) : nextSerial;

  const todayStr = formatDateKey(new Date());

  const defaultOrderType = isAdminModal ? 'admin' : (prefillTripContext?.orderType || 'supply');
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
    clientSegmentId: editingOrder?.clientSegmentId || editingOrder?.segmentId || '',
    isRetailRouteOverride: typeof editingOrder?.isRetailRouteOverride === 'boolean' ? editingOrder.isRetailRouteOverride : null,
    branchId: editingOrder?.branchId || '',
    branchName: editingOrder?.branchName || '',
    region: editingOrder?.region || '',
    deliveryAddress: editingOrder?.deliveryAddress || '',
    invoiceDate: editingOrder?.invoiceDate || prefillTripContext?.loadingDate || todayStr,
    loadingDate: editingOrder?.loadingDate || prefillTripContext?.loadingDate || todayStr,
    isDatesLinked: editingOrder
      ? Boolean(editingOrder.invoiceDate === editingOrder.loadingDate)
      : true,
    loadingOrderNumber: editingOrder?.loadingOrderNumber ?? prefillTripContext?.loadingOrderNumber ?? null,
    assignedVehicleId: editingOrder?.assignedVehicleId || prefillTripContext?.assignedVehicleId || '',
    assignedVehicleName: editingOrder?.assignedVehicleName || prefillTripContext?.assignedVehicleName || '',
    assignedVehiclePlate: editingOrder?.assignedVehiclePlate || prefillTripContext?.assignedVehiclePlate || '',
    assignedDriverId: editingOrder?.assignedDriverId || prefillTripContext?.assignedDriverId || '',
    assignedDriverName: editingOrder?.assignedDriverName || prefillTripContext?.assignedDriverName || '',
    assignedDeliveryRepId: editingOrder?.assignedDeliveryRepId || prefillTripContext?.assignedDeliveryRepId || '',
    assignedDeliveryRepName: editingOrder?.assignedDeliveryRepName || prefillTripContext?.assignedDeliveryRepName || '',
    fgWarehouseDispatchId: editingOrder?.fgWarehouseDispatchId || prefillTripContext?.tripId || '',
    settledFromTripExtras: Boolean(
      editingOrder ? editingOrder.settledFromTripExtras : prefillTripContext?.settledFromTripExtras
    ),
    isPostDispatchSettlementOrder: Boolean(
      editingOrder ? editingOrder.isPostDispatchSettlementOrder : prefillTripContext
    ),
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
    fulfillmentStatus: editingOrder?.fulfillmentStatus || (isAdminModal ? 'paid' : (prefillTripContext?.fulfillmentStatus || 'not_yet')),
    vatMode: initialVatMode,
    poTawoos: editingOrder?.poTawoos || '',
    poPrivateLabel: editingOrder?.poPrivateLabel || '',
    salesRep: editingOrder?.salesRep || '',
    salesRepId: editingOrder?.salesRepId || '',
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

  // SearchableSelect options for Delivery Branch picker
  const branchSelectOptions = useMemo(() => {
    return deliveryBranches.map((b) => {
      const id = b.id || 'br_main';
      const label = resolveBranchDisplayName(b, isAr);
      const altName = isAr ? (b.nameEn || '') : (b.nameAr || '');
      const sublabel = [altName, b.region, b.address].filter(Boolean).join(' · ');
      return {
        value: id,
        label,
        sublabel,
        specs: `${b.nameAr || ''} ${b.nameEn || ''} ${b.name || ''} ${b.code || ''} ${b.region || ''} ${b.address || ''} ${b.contactPerson || ''} ${id}`.toLowerCase(),
        icon: MapPin,
        iconColor: b.isMain ? '#6366f1' : '#059669'
      };
    });
  }, [deliveryBranches, isAr]);

  // Allowed Order Types based on modal mode
  const availableOrderTypes = useMemo(() => {
    return isAdminModal ? ADMIN_ORDER_TYPES : SALES_ORDER_TYPES;
  }, [isAdminModal]);

  // Unified Personnel fallback hydration when caller doesn't pass `employees`
  const [fetchedEmployees, setFetchedEmployees] = useState([]);
  useEffect(() => {
    if (!isOpen || (Array.isArray(employees) && employees.length > 0)) return;
    let cancelled = false;
    getDocs(collection(db, 'employees'))
      .then((snap) => {
        if (!cancelled) {
          setFetchedEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, employees]);

  const effectiveEmployees = useMemo(
    () => (Array.isArray(employees) && employees.length > 0 ? employees : fetchedEmployees),
    [employees, fetchedEmployees]
  );

  const salesRepOptions = useMemo(
    () => resolveSalesRepOptions(effectiveEmployees, formData.salesRep, isAr),
    [effectiveEmployees, formData.salesRep, isAr]
  );

  // Client Profile & Past Order Duplication UI State
  const [clientProfileModalTab, setClientProfileModalTab] = useState(null); // null | 'profile' | 'orders'
  const [isDuplicatePickerOpen, setIsDuplicatePickerOpen] = useState(false);
  const [confirmDuplicateOrder, setConfirmDuplicateOrder] = useState(null);
  const [duplicateFeedback, setDuplicateFeedback] = useState(null);

  const clientPastDuplicableOrders = useMemo(() => {
    if (!formData.clientId) return [];
    return (allOrders || [])
      .filter((o) => {
        if (!o || o.clientId !== formData.clientId) return false;
        if (editingOrder?.id && o.id === editingOrder.id) return false;
        if (o.isSplitParent) return false;
        if (o.confirmationStatus === 'canceled') return false;
        if (o.isAdministrative || PHYSICAL_DELIVERY_EXCLUDED_TYPES.includes(o.orderType)) return false;
        return Array.isArray(o.lines) && o.lines.length > 0;
      })
      .sort((a, b) => {
        const dDiff = String(b.invoiceDate || '').localeCompare(String(a.invoiceDate || ''));
        if (dDiff !== 0) return dDiff;
        return String(b.serial || b.id || '').localeCompare(String(a.serial || a.id || ''), 'en', { numeric: true });
      });
  }, [allOrders, formData.clientId, editingOrder?.id]);

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

  // Unified Retail Route detection + inline Std List UI state
  const [confirmReplaceStdList, setConfirmReplaceStdList] = useState(false);
  const [stdListFeedback, setStdListFeedback] = useState(null);

  const retailContext = useMemo(() => {
    const activeSegKey =
      selectedClient?.segmentId ||
      selectedClient?.segment ||
      formData.clientSegmentId ||
      editingOrder?.clientSegmentId ||
      '';
    const segObj =
      (segments || []).find(
        (s) => s.id === activeSegKey || s.code === activeSegKey || s.nameAr === activeSegKey || s.nameEn === activeSegKey
      ) ||
      PRESET_DEFAULT_SEGMENTS.find(
        (s) => s.id === activeSegKey || s.nameAr === activeSegKey || s.nameEn === activeSegKey
      );
    const isSegRetail = isRetailSegmentRecord(segObj, activeSegKey);
    const isAllowedOrderType = !isAdminModal && !PHYSICAL_DELIVERY_EXCLUDED_TYPES.includes(formData.orderType);
    const isRetailEffective = isAllowedOrderType
      ? typeof formData.isRetailRouteOverride === 'boolean'
        ? formData.isRetailRouteOverride
        : isSegRetail
      : false;
    return { activeSegKey, isSegRetail, isAllowedOrderType, isRetailEffective };
  }, [selectedClient, segments, formData.clientSegmentId, formData.isRetailRouteOverride, formData.orderType, editingOrder, isAdminModal]);

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
        clientSegmentId: cl.segmentId || cl.segment || '',
        isRetailRouteOverride: null,
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

    setIsDuplicatePickerOpen(false);
    setConfirmDuplicateOrder(null);
    setDuplicateFeedback(null);

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

  // Shared line builder for single product addition, Standard Retail List & Past Order Duplication
  const buildOrderLineFromProduct = (prod, qty = 1, bonus = 0, requestedSuffix = null, overrideVatMode = null) => {
    const resolved = detectProductPrice({
      clientId: formData.clientId,
      clientName: formData.clientName,
      branchId: formData.branchId,
      branchName: formData.branchName,
      strategy: clientStrategy,
      invoiceDate: formData.invoiceDate,
      productId: prod.id,
      priceLists
    });

    const promoInfo = detectPromotionalDiscount({
      clientId: formData.clientId,
      clientName: formData.clientName,
      branchId: formData.branchId,
      branchName: formData.branchName,
      strategy: clientStrategy,
      invoiceDate: formData.invoiceDate,
      productId: prod.id,
      priceLists
    });

    const opts = prod.packagingOptions || [];
    const primaryOpt = opts[0] || {};
    const defaultSuffix = opts.length > 1 ? 'any' : (primaryOpt.suffix || 'A');
    const effectiveSuffix =
      requestedSuffix && (requestedSuffix === 'any' || opts.some((o) => o.suffix === requestedSuffix))
        ? requestedSuffix
        : defaultSuffix;
    const matchedOpt =
      effectiveSuffix === 'any'
        ? primaryOpt
        : opts.find((o) => o.suffix === effectiveSuffix) || primaryOpt;

    const largeUnitWeightKg = Number(matchedOpt.largeUnitWeightKg || primaryOpt.largeUnitWeightKg || prod.weight || 0);
    const packagingRatio = Number(matchedOpt.packagingRatio || primaryOpt.packagingRatio || prod.packagingRatio || 12);

    return calculateLineTotals(
      {
        productId: prod.id,
        productCode: prod.code || prod.id,
        productNameAr: prod.nameAr,
        productNameEn: prod.nameEn || prod.nameAr,
        packagingOptionSuffix: effectiveSuffix,
        packagingOptionNameAr:
          effectiveSuffix === 'any'
            ? 'أي تعبئة (Any)'
            : matchedOpt.nameAr || `تعبئة ${effectiveSuffix}`,
        packagingOptionNameEn:
          effectiveSuffix === 'any'
            ? 'Any Packing'
            : matchedOpt.nameEn || matchedOpt.nameAr || `Option ${effectiveSuffix}`,
        isPrivateLabel: isProductPrivateLabel(prod),
        vatRate: prod.vatRate || '14%',
        smallUnit: prod.smallUnit || 'زجاجة',
        largeUnitName: prod.largeUnitName || 'كرتونة',
        packagingRatio,
        largeUnitWeightKg,
        qty: Math.max(1, Math.floor(Number(qty) || 1)),
        bonus: Math.max(0, Math.floor(Number(bonus) || 0)),
        manualDiscountPerUnit: 0
      },
      resolved.price || 0,
      resolved.isPromotional,
      promoInfo.discountPct,
      overrideVatMode || formData.vatMode
    );
  };

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

    const newLine = buildOrderLineFromProduct(prod, 1, 0);

    setFormData((prev) => ({
      ...prev,
      lines: [...prev.lines, newLine]
    }));
    setSelectedProductId('');
  };

  // Populate lines from the saved Standard Retail Load List
  const applyStandardRetailList = () => {
    const prodMap = {};
    products.forEach((p) => {
      prodMap[p.id] = p;
    });

    const nextLines = [];
    let skippedCount = 0;

    (stdRetailList || []).forEach((item) => {
      const prod = prodMap[item.productId];
      if (!prod) {
        skippedCount += 1;
        return;
      }
      if (!isProductAllowedForClient(prod, formData.clientId, formData.clientName)) {
        skippedCount += 1;
        return;
      }
      nextLines.push(buildOrderLineFromProduct(prod, item.qty, item.bonus, item.packagingOptionSuffix));
    });

    if (nextLines.length === 0) {
      setConfirmReplaceStdList(false);
      setStdListFeedback({
        type: 'warning',
        message: isAr
          ? 'لا توجد أصناف متاحة للتحميل لهذا العميل ضمن القائمة القياسية.'
          : 'No eligible products from the standard list apply to this client.'
      });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      lines: nextLines
    }));
    setConfirmReplaceStdList(false);
    setStdListFeedback({
      type: skippedCount > 0 ? 'warning' : 'success',
      message:
        skippedCount > 0
          ? isAr
            ? `تم تحميل ${nextLines.length} صنفاً من القائمة القياسية (تم تخطي ${skippedCount} صنف غير متاح لهذا العميل). يمكنك تعديل الكميات بحرية.`
            : `Loaded ${nextLines.length} items from Standard Retail List (${skippedCount} ineligible skipped). Feel free to adjust quantities.`
          : isAr
            ? `تم تحميل ${nextLines.length} صنفاً من القائمة القياسية للتجزئة. يمكنك تعديل الكميات أو الأصناف بحرية.`
            : `Loaded ${nextLines.length} items from Standard Retail List. You can adjust any quantities freely.`
    });
  };

  const handleRequestLoadStdRetailList = () => {
    if (isStructureLocked) return;
    if (!stdRetailList || stdRetailList.length === 0) {
      setStdListFeedback({
        type: 'warning',
        message: isAr
          ? 'القائمة القياسية للتجزئة فارغة حالياً.'
          : 'Standard Retail List is currently empty.'
      });
      return;
    }
    if (formData.lines.length > 0) {
      setConfirmReplaceStdList(true);
      setStdListFeedback(null);
      return;
    }
    applyStandardRetailList();
  };

  // Duplicate strictly Products (with packaging option), Qty, Bonus & VAT Mode from a past order
  const applyDuplicatePastOrder = (sourceOrder) => {
    if (!sourceOrder || isStructureLocked) return;
    const allowedVatIds = availableVatModes.map((v) => v.id);
    const { vatMode: targetVatMode, items } = extractPastOrderDuplicationSpec(sourceOrder, allowedVatIds);

    const prodMap = {};
    products.forEach((p) => {
      if (p?.id) prodMap[p.id] = p;
    });

    const nextLines = [];
    let skippedCount = 0;

    items.forEach((item) => {
      const prod = prodMap[item.productId];
      if (!prod || prod.isActive === false || !isProductAllowedForClient(prod, formData.clientId, formData.clientName)) {
        skippedCount += 1;
        return;
      }
      nextLines.push(buildOrderLineFromProduct(prod, item.qty, item.bonus, item.packagingOptionSuffix, targetVatMode));
    });

    if (nextLines.length === 0) {
      setConfirmDuplicateOrder(null);
      setIsDuplicatePickerOpen(false);
      setClientProfileModalTab(null);
      setDuplicateFeedback({
        type: 'warning',
        message: isAr
          ? 'لا توجد أصناف متاحة للتكرار من الطلب المحدد (قد تكون الأصناف موقوفة أو غير مخصصة للعميل).'
          : 'No eligible catalog items could be duplicated from the selected order.'
      });
      return;
    }

    const vatObj = VAT_MODES.find((v) => v.id === targetVatMode) || VAT_MODES[0];
    const sourceSerial = resolveOrderSerial(sourceOrder, allOrders);

    setFormData((prev) => ({
      ...prev,
      vatMode: targetVatMode,
      lines: nextLines
    }));
    setConfirmDuplicateOrder(null);
    setIsDuplicatePickerOpen(false);
    setClientProfileModalTab(null);
    setDuplicateFeedback({
      type: skippedCount > 0 ? 'warning' : 'success',
      message: isAr
        ? `تم تكرار ${nextLines.length} صنفاً (بالتعبئة والكميات والبونص) وضبط الضريبة إلى (${vatObj.labelAr.split('(')[0].trim()}) من الطلب #${sourceSerial} مع احتساب الأسعار الحالية${skippedCount > 0 ? ` — تم تخطي ${skippedCount} صنف غير متاح` : ''}.`
        : `Duplicated ${nextLines.length} item(s) (packing, qty, bonus) & VAT (${vatObj.labelEn.split('(')[0].trim()}) from Order #${sourceSerial} with live catalog pricing${skippedCount > 0 ? ` (${skippedCount} unavailable skipped)` : ''}.`
    });
  };

  const handleRequestDuplicatePastOrder = (sourceOrder) => {
    if (!sourceOrder || isStructureLocked) return;
    setIsDuplicatePickerOpen(false);
    setClientProfileModalTab(null);
    setDuplicateFeedback(null);
    if (formData.lines.length > 0) {
      setConfirmDuplicateOrder(sourceOrder);
      return;
    }
    applyDuplicatePastOrder(sourceOrder);
  };

  // Line item change (qty, bonus, manualDiscount, packagingOptionSuffix)
  const handleLineChange = (index, field, value) => {
    setFormData((prev) => {
      const updatedLines = [...prev.lines];
      const existing = updatedLines[index];
      let target = { ...existing, [field]: value };

      if (field === 'packagingOptionSuffix') {
        const prod = products.find((p) => p.id === existing.productId);
        const opts = prod?.packagingOptions || [];
        const primaryOpt = opts[0] || {};
        const matchedOpt = value === 'any' ? primaryOpt : opts.find((o) => o.suffix === value) || primaryOpt;
        target = {
          ...existing,
          packagingOptionSuffix: value || 'any',
          packagingOptionNameAr:
            value === 'any' ? 'أي تعبئة (Any)' : matchedOpt.nameAr || `تعبئة ${value}`,
          packagingOptionNameEn:
            value === 'any' ? 'Any Packing' : matchedOpt.nameEn || matchedOpt.nameAr || `Option ${value}`,
          packagingRatio: Number(matchedOpt.packagingRatio || primaryOpt.packagingRatio || prod?.packagingRatio || existing.packagingRatio || 12),
          largeUnitWeightKg: Number(matchedOpt.largeUnitWeightKg || primaryOpt.largeUnitWeightKg || prod?.weight || existing.largeUnitWeightKg || 0),
        };
      } else {
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
        target = { ...existing, [field]: nextVal };
      }

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
        // Compute diff for editing — only track actual changes (never log empty saves)
        const metaDiffs = [];
        const old = editingOrder;
        const eqStr = (a, b) => String(a || '').trim() === String(b || '').trim();
        const eqNum = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 1e-4;

        if (!eqStr(old.clientName, formData.clientName)) metaDiffs.push({ labelAr: 'العميل', labelEn: 'Client', oldValue: old.clientName || '—', newValue: formData.clientName || '—' });
        if (!eqStr(old.branchName, formData.branchName)) metaDiffs.push({ labelAr: 'الفرع', labelEn: 'Branch', oldValue: old.branchName || '—', newValue: formData.branchName || '—' });
        if (!eqStr(old.invoiceDate, formData.invoiceDate)) metaDiffs.push({ labelAr: 'تاريخ الفاتورة / الإجراء', labelEn: 'Date', oldValue: old.invoiceDate || '—', newValue: formData.invoiceDate || '—' });
        if (!eqStr(old.loadingDate, formData.loadingDate)) metaDiffs.push({ labelAr: 'تاريخ التحميل', labelEn: 'Loading Date', oldValue: old.loadingDate || '—', newValue: formData.loadingDate || '—' });
        if (!eqStr(old.confirmationStatus, formData.confirmationStatus)) metaDiffs.push({ labelAr: 'حالة التأكيد', labelEn: 'Confirmation', oldValue: old.confirmationStatus || '—', newValue: formData.confirmationStatus || '—' });
        if (!eqStr(old.fulfillmentStatus, formData.fulfillmentStatus)) metaDiffs.push({ labelAr: 'حالة التنفيذ', labelEn: 'Fulfillment', oldValue: old.fulfillmentStatus || '—', newValue: formData.fulfillmentStatus || '—' });
        if (!eqStr(old.vatMode, formData.vatMode)) metaDiffs.push({ labelAr: 'المعاملة الضريبية', labelEn: 'Tax Mode', oldValue: old.vatMode || '—', newValue: formData.vatMode || '—' });
        if (!eqStr(old.orderType, formData.orderType)) metaDiffs.push({ labelAr: 'نوع الطلب', labelEn: 'Order Type', oldValue: old.orderType || '—', newValue: formData.orderType || '—' });
        if (!eqStr(old.poTawoos, formData.poTawoos)) metaDiffs.push({ labelAr: 'أمر شراء طاووس', labelEn: 'PO # Tawoos', oldValue: old.poTawoos || '—', newValue: formData.poTawoos || '—' });
        if (!eqStr(old.poPrivateLabel, formData.poPrivateLabel)) metaDiffs.push({ labelAr: 'أمر شراء علامة خاصة', labelEn: 'PO # Private Label', oldValue: old.poPrivateLabel || '—', newValue: formData.poPrivateLabel || '—' });
        if (!eqStr(old.notes, formData.notes)) metaDiffs.push({ labelAr: 'ملاحظات', labelEn: 'Notes', oldValue: old.notes || '—', newValue: formData.notes || '—' });
        if (isCollection && !eqNum(old.collectionAmount, formData.collectionAmount)) {
          metaDiffs.push({ labelAr: 'مبلغ التحصيل', labelEn: 'Collection Amount', oldValue: `${Number(old.collectionAmount || 0)} EGP`, newValue: `${Number(formData.collectionAmount || 0)} EGP` });
        }

        const lineKey = (l) => `${l.productId || ''}::${String(l.packagingOptionSuffix || l.optionSuffix || '').toUpperCase()}`;
        const oldLineMap = {};
        (old.lines || []).forEach((l) => { oldLineMap[lineKey(l)] = l; });
        const newLineMap = {};
        formData.lines.forEach((l) => { newLineMap[lineKey(l)] = l; });

        const lineChanges = [];
        if (isInvoiceOrSales) {
          formData.lines.forEach((l) => {
            const k = lineKey(l);
            if (!oldLineMap[k]) {
              lineChanges.push({
                productCode: l.productCode,
                productNameAr: l.productNameAr,
                productNameEn: l.productNameEn,
                type: 'added',
                detailAr: `${l.qty} كرتونة بسعر ${l.detectedUnitPrice} ج.م`,
                detailEn: `${l.qty} cartons at ${l.detectedUnitPrice} EGP`
              });
            } else {
              const oldL = oldLineMap[k];
              const oldQty = Number(oldL.qty || 0);
              const newQty = Number(l.qty || 0);
              const oldBonus = Number(oldL.bonus || 0);
              const newBonus = Number(l.bonus || 0);
              const oldDisc = Number(oldL.manualDiscountPerUnit || 0);
              const newDisc = Number(l.manualDiscountPerUnit || 0);
              const oldPack = String(oldL.packagingOptionSuffix || oldL.optionSuffix || '').toUpperCase();
              const newPack = String(l.packagingOptionSuffix || l.optionSuffix || '').toUpperCase();

              const changedPartsAr = [];
              const changedPartsEn = [];
              if (!eqNum(oldQty, newQty)) {
                changedPartsAr.push(`الكمية: ${oldQty} → ${newQty}`);
                changedPartsEn.push(`Qty: ${oldQty} → ${newQty}`);
              }
              if (!eqNum(oldBonus, newBonus)) {
                changedPartsAr.push(`بونص: ${oldBonus} → ${newBonus}`);
                changedPartsEn.push(`Bonus: ${oldBonus} → ${newBonus}`);
              }
              if (!eqNum(oldDisc, newDisc)) {
                changedPartsAr.push(`خصم: ${oldDisc} → ${newDisc}`);
                changedPartsEn.push(`Disc: ${oldDisc} → ${newDisc}`);
              }
              if (oldPack !== newPack) {
                changedPartsAr.push(`تعبئة: ${oldPack || '—'} → ${newPack || '—'}`);
                changedPartsEn.push(`Pack: ${oldPack || '—'} → ${newPack || '—'}`);
              }
              if (changedPartsAr.length > 0) {
                lineChanges.push({
                  productCode: l.productCode,
                  productNameAr: l.productNameAr,
                  productNameEn: l.productNameEn,
                  type: 'modified',
                  detailAr: changedPartsAr.join(' | '),
                  detailEn: changedPartsEn.join(' | ')
                });
              }
            }
          });

          (old.lines || []).forEach((l) => {
            if (!newLineMap[lineKey(l)]) {
              lineChanges.push({
                productCode: l.productCode,
                productNameAr: l.productNameAr,
                productNameEn: l.productNameEn,
                type: 'removed',
                detailAr: `تم حذف الصنف (${l.qty || 0} كرتونة)`,
                detailEn: `Removed product (${l.qty || 0} cartons)`
              });
            }
          });
        }

        const hasActualDiffs = isSyncingPartialRejection || metaDiffs.length > 0 || lineChanges.length > 0;
        auditEvent = hasActualDiffs
          ? {
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
            }
          : null;
      }

      const existingAudit = editingOrder?.auditTrail || [];
      const updatedAuditTrail = auditEvent ? [...existingAudit, auditEvent] : existingAudit;

      const payload = {
        ...formData,
        clientSegmentId: retailContext.activeSegKey,
        isRetailRouteOrder: retailContext.isRetailEffective,
        isRetailRouteOverride: formData.isRetailRouteOverride ?? null,
        retailSettlementStatus: retailContext.isRetailEffective
          ? (editingOrder?.retailSettlementStatus === 'settled' ? 'settled' : 'awaiting_settlement')
          : 'not_required',
        lines: stampedLines,
        loadingOrderNumber: formData.loadingOrderNumber ?? null,
        assignedVehicleId: formData.assignedVehicleId || '',
        assignedVehicleName: formData.assignedVehicleName || '',
        assignedVehiclePlate: formData.assignedVehiclePlate || '',
        assignedDriverId: formData.assignedDriverId || '',
        assignedDriverName: formData.assignedDriverName || '',
        assignedDeliveryRepId: formData.assignedDeliveryRepId || '',
        assignedDeliveryRepName: formData.assignedDeliveryRepName || '',
        fgWarehouseDispatchId: formData.fgWarehouseDispatchId || '',
        settledFromTripExtras: Boolean(formData.settledFromTripExtras && formData.orderType === 'supply'),
        isPostDispatchSettlementOrder: Boolean(formData.isPostDispatchSettlementOrder),
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
      if (onSaved) await onSaved(payload);
      onClose();
    } catch (err) {
      console.error('Error saving sales order:', err);
      setErrorMsg(isAr ? 'حدث خطأ أثناء حفظ أمر البيع.' : 'Failed to save sales order.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${zIndexClass} bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans`}>
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

          {/* Post-Dispatch Return Settlement Link Banner */}
          {!editingOrder && prefillTripContext && (
            <div className="p-3.5 bg-teal-50 border-2 border-teal-300 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-teal-950">
              <div className="flex items-center gap-2 font-black">
                <Truck className="w-4 h-4 text-teal-700 shrink-0" />
                <span>
                  {formData.settledFromTripExtras && formData.orderType === 'supply'
                    ? (isAr
                        ? `أمر توريد تسوية مرتبط تلقائياً بتحميل #${prefillTripContext.loadingOrderNumber} (${prefillTripContext.loadingDate}) — سيُخصم من زيادات التحميل دون خصم إضافي من المخزن`
                        : `Pre-linked Supply Order from Trip #${prefillTripContext.loadingOrderNumber} Extras (${prefillTripContext.loadingDate})`)
                    : (isAr
                        ? `أمر تسوية مرتبط تلقائياً بتحميل #${prefillTripContext.loadingOrderNumber} (${prefillTripContext.loadingDate}) لإغلاق فروقات المرتجعات`
                        : `Pre-linked Order for Trip #${prefillTripContext.loadingOrderNumber} (${prefillTripContext.loadingDate}) Return Settlement`)}
                </span>
              </div>
              {formData.settledFromTripExtras && formData.orderType === 'supply' && (
                <span className="px-2 py-0.5 rounded-md bg-white border border-teal-300 text-[10px] font-black text-teal-800">
                  {isAr ? 'مُصرف ضمن زيادات الشاحنة ✓' : 'From Truck Extras ✓'}
                </span>
              )}
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
                    return (
                      <span className="text-[10px] text-amber-700 font-medium block mt-1 leading-tight">
                        {isAr
                          ? `الطلب مُسكن بشاحنة (${modalVehName || '—'}) وتحميل #${formData.loadingOrderNumber || ''} — تعديل موعد التسكين يُجرى حصرياً من تبويب خطة التحميل`
                          : `Order assigned to ${modalVehName || '—'} (Trip #${formData.loadingOrderNumber || ''}) — Rescheduling must be done in Loading Plan`}
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
                      <TruckNameBadge
                        vehicle={matchedVehModal}
                        name={modalVehName || (isAr ? 'شاحنة معتمدة' : 'Assigned Truck')}
                        plate={modalVehPlate}
                        isAr={isAr}
                        showIcon={false}
                        nameClassName="text-xs font-black text-slate-900"
                        copyClassName="bg-white border border-slate-200 p-1 rounded-md"
                      />
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200 font-mono">
                        {isAr ? `تحميل #${formData.loadingOrderNumber}` : `Trip #${formData.loadingOrderNumber}`}
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
                  <div className={isStructureLocked || !formData.clientId ? 'pointer-events-none opacity-65' : ''}>
                    <SearchableSelect
                      options={branchSelectOptions}
                      value={formData.branchId}
                      onChange={(v) => {
                        if (isStructureLocked || !formData.clientId) return;
                        handleBranchChange(v);
                      }}
                      disabled={!formData.clientId || isStructureLocked}
                      placeholder={
                        !formData.clientId
                          ? (isAr ? '— اختر العميل أولاً —' : '— Select client first —')
                          : (isAr ? 'اختر فرع التسليم والمستودع...' : 'Select delivery branch...')
                      }
                      emptyText={isAr ? '— لا توجد فروع تسليم مسجلة للعميل —' : '— No delivery branches found —'}
                      isAr={isAr}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Then the operational profile (Sales & Admin Modals) */}
            {clientOperationalProfile && (
              <div className="mt-3 p-3.5 ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-slate-50 to-indigo-50/30 border border-slate-200/90 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-extrabold text-slate-800 text-xs">
                      {isAr ? 'الملف التشغيلي للفرع والعميل:' : 'Operational Profile:'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setClientProfileModalTab('profile')}
                      className="font-bold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                      title={isAr ? 'عرض ملف العميل والفرع والطلبات السابقة' : 'Open Client & Branch Profile'}
                    >
                      <span>{formData.clientName} — {clientOperationalProfile.branchName}</span>
                      <Eye className="w-3 h-3 text-indigo-600 shrink-0" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 font-medium">
                    <span>
                      {isAr ? 'جهة الاتصال:' : 'Contact:'}{' '}
                      <strong className="text-slate-800">{clientOperationalProfile.contactPerson}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setClientProfileModalTab('profile')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-extrabold text-[10.5px] shadow-2xs transition cursor-pointer"
                    >
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span>{isAr ? 'ملف العميل والفرع' : 'Client Profile'}</span>
                    </button>
                    {!isStructureLocked && (!isAdminModal || formData.orderType.startsWith('invoice_only')) && (
                      <button
                        type="button"
                        onClick={() => setClientProfileModalTab('orders')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-[10.5px] shadow-2xs transition cursor-pointer"
                      >
                        <History className="w-3 h-3 shrink-0" />
                        <span>{isAr ? 'الطلبات السابقة / تكرار' : 'Past Orders & Duplicate'}</span>
                      </button>
                    )}
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

            {/* Retail Van-Sales Route Settlement Auto-Detection + Optional Per-Order Override */}
            {retailContext.isAllowedOrderType && (() => {
              const { isSegRetail, isRetailEffective } = retailContext;

              return (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between flex-wrap gap-2 text-xs transition ${
                  isRetailEffective
                    ? 'bg-cyan-50/90 border-cyan-300 text-cyan-950'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isRetailEffective ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Store className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold flex items-center gap-1.5 flex-wrap">
                        <span>{isAr ? 'تسوية رحلة مبيعات التجزئة بعد العودة' : 'Retail Van-Sales Route Settlement'}</span>
                        {isSegRetail && (
                          <span className="px-1.5 py-0.2 rounded bg-cyan-200/70 text-cyan-900 text-[10px] font-black">
                            {isAr ? 'مكتشف تلقائياً من قطاع التجزئة' : 'Auto-detected from Retail segment'}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        {isRetailEffective
                          ? (isAr
                              ? 'تُحمّل الكميات المبدئية وتُلزم الشاحنة بتأكيد المباع الفعلي والمرتجع غير المباع عند العودة.'
                              : 'Truck loads standard stock and requires confirming actual sold qty vs unsold returns upon return.')
                          : (isAr
                              ? 'أمر بيع مباشر قياسي (لا يتطلب تسوية رحلة تجزئة عند الوصول).'
                              : 'Standard pre-sold order (no van-sales route settlement gate on delivery).')}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isStructureLocked}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        isRetailRouteOverride: !isRetailEffective
                      }))
                    }
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold border transition cursor-pointer disabled:opacity-50 ${
                      isRetailEffective
                        ? 'bg-cyan-700 hover:bg-cyan-800 text-white border-cyan-800'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    }`}
                  >
                    {isRetailEffective
                      ? (isAr ? 'مفعّل — إيقاف لهذا الطلب' : 'Enabled — Disable Override')
                      : (isAr ? 'معطّل — تفعيل كتجزئة' : 'Disabled — Mark as Retail Route')}
                  </button>
                </div>
              );
            })()}
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
                <div className="space-y-2">
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
                    <div className="flex-1 min-w-[260px]">
                      <SearchableSelect
                        options={availableProductOptions}
                        value={selectedProductId}
                        onChange={handleAddProduct}
                        placeholder={isAr ? '— اختر الصنف للإضافة —' : '— Select Product to Add —'}
                        searchPlaceholder={isAr ? 'ابحث باسم أو كود الصنف...' : 'Search product...'}
                        isAr={isAr}
                      />
                    </div>

                    {/* Duplicate Past Order Quick Picker */}
                    {formData.clientId && (
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsDuplicatePickerOpen((v) => !v)}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-extrabold transition cursor-pointer ${
                            isDuplicatePickerOpen
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                          }`}
                          title={
                            isAr
                              ? 'تكرار الأصناف والتعبئة والكميات والبونص والضريبة من طلب سابق لهذا العميل'
                              : 'Duplicate products, packing, qty, bonus & VAT from a past order'
                          }
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{isAr ? 'تكرار طلب سابق' : 'Duplicate Past Order'}</span>
                          {clientPastDuplicableOrders.length > 0 && (
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-black font-mono ${
                              isDuplicatePickerOpen ? 'bg-white/20 text-white' : 'bg-indigo-200/70 text-indigo-900'
                            }`}>
                              {clientPastDuplicableOrders.length}
                            </span>
                          )}
                        </button>

                        {isDuplicatePickerOpen && (
                          <div className="absolute end-0 top-full mt-1.5 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-black truncate">
                                  {isAr ? 'اختر طلباً لتكرار بنوده والضريبة' : 'Select Past Order to Duplicate'}
                                </div>
                                <div className="text-[10px] text-slate-300">
                                  {isAr ? 'ينسخ الأصناف والتعبئة والكميات والبونص والضريبة بالأسعار الحالية' : 'Copies SKUs, packing, qty, bonus & VAT with live pricing'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsDuplicatePickerOpen(false)}
                                className="p-1 rounded-lg hover:bg-white/15 text-slate-300 hover:text-white cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {clientPastDuplicableOrders.length === 0 ? (
                              <div className="p-5 text-center text-xs text-slate-500 font-semibold">
                                {isAr ? 'لا توجد طلبات سابقة متاحة للتكرار لهذا العميل.' : 'No past orders available to duplicate for this client.'}
                              </div>
                            ) : (
                              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                                {clientPastDuplicableOrders.slice(0, 12).map((pastOrd) => {
                                  const pSerial = resolveOrderSerial(pastOrd, allOrders);
                                  const totalCtn = (pastOrd.lines || []).reduce(
                                    (s, ln) => s + Number(ln.qty || 0) + Number(ln.bonus || 0),
                                    0
                                  );
                                  const isSameBranch =
                                    formData.branchId &&
                                    pastOrd.branchId &&
                                    String(pastOrd.branchId) === String(formData.branchId);
                                  return (
                                    <button
                                      key={pastOrd.id}
                                      type="button"
                                      onClick={() => handleRequestDuplicatePastOrder(pastOrd)}
                                      className="w-full px-3.5 py-2.5 text-start hover:bg-indigo-50/70 transition flex items-start justify-between gap-2 cursor-pointer"
                                    >
                                      <div className="min-w-0 space-y-0.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-mono text-xs font-black text-slate-900">#{pSerial}</span>
                                          <span className="text-[10px] font-mono text-slate-500">{pastOrd.invoiceDate || '—'}</span>
                                          {pastOrd.branchName && (
                                            <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border ${
                                              isSameBranch
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-slate-100 text-slate-600 border-slate-200'
                                            }`}>
                                              {pastOrd.branchName}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10.5px] text-slate-500 truncate">
                                          {(pastOrd.lines || [])
                                            .slice(0, 3)
                                            .map((ln) => isAr ? (ln.productNameAr || ln.productNameEn) : (ln.productNameEn || ln.productNameAr))
                                            .filter(Boolean)
                                            .join('، ')}
                                          {(pastOrd.lines || []).length > 3 ? ` +${(pastOrd.lines || []).length - 3}` : ''}
                                        </div>
                                      </div>

                                      <div className="flex flex-col items-end gap-1 shrink-0">
                                        <span className="font-mono text-[10.5px] font-black text-indigo-700">
                                          {totalCtn.toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                        </span>
                                        {renderVatAbbrChip(pastOrd.vatMode, pastOrd.orderType, isAr)}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsDuplicatePickerOpen(false);
                                  setClientProfileModalTab('orders');
                                }}
                                className="text-[11px] font-extrabold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span>{isAr ? 'فتح السجل الكامل في ملف العميل' : 'View Full History in Client Profile'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Standard Retail Load List Quick Fill (Retail Route Orders only) */}
                    {retailContext.isRetailEffective && (
                      <button
                        type="button"
                        onClick={handleRequestLoadStdRetailList}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-300 rounded-xl text-xs font-extrabold transition cursor-pointer shrink-0"
                        title={
                          isAr
                            ? 'تعبئة الأصناف والكميات من القائمة القياسية للتجزئة'
                            : 'Populate lines from Standard Retail Load List'
                        }
                      >
                        <ClipboardList className="w-3.5 h-3.5 text-cyan-700" />
                        <span>{isAr ? 'قائمة التجزئة القياسية' : 'Std Retail List'}</span>
                        {stdRetailList.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-cyan-200/70 text-cyan-900 text-[10px] font-black">
                            {stdRetailList.length}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Inline Confirmation Prompt when Replacing Existing Lines */}
                  {confirmReplaceStdList && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-amber-900 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {isAr
                            ? `يحتوي الطلب حالياً على ${formData.lines.length} بنود. هل تريد استبدالها ببنود القائمة القياسية (${stdRetailList.length} صنف)؟`
                            : `Order already has ${formData.lines.length} line(s). Replace them with Standard Retail List (${stdRetailList.length} items)?`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={applyStandardRetailList}
                          className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] transition cursor-pointer"
                        >
                          {isAr ? 'تأكيد الاستبدال' : 'Replace Lines'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmReplaceStdList(false)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[11px] transition cursor-pointer"
                        >
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Feedback Notice after Loading / Empty Standard List */}
                  {stdListFeedback && (
                    <div
                      className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold ${
                        stdListFeedback.type === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-cyan-50 border-cyan-200 text-cyan-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span>{stdListFeedback.message}</span>
                        {stdRetailList.length === 0 && canManageStdRetailList && typeof onOpenStdRetailSetup === 'function' && (
                          <button
                            type="button"
                            onClick={() => {
                              setStdListFeedback(null);
                              onOpenStdRetailSetup();
                            }}
                            className="underline font-extrabold text-cyan-800 hover:text-cyan-950 cursor-pointer"
                          >
                            {isAr ? 'إعداد القائمة الآن' : 'Configure List Now'}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setStdListFeedback(null)}
                        className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Inline Confirmation Prompt when Replacing Existing Lines with Past Order */}
                  {confirmDuplicateOrder && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-amber-900 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {isAr
                            ? `يحتوي الطلب حالياً على ${formData.lines.length} بنود. هل تريد استبدالها وضبط الضريبة من الطلب #${resolveOrderSerial(confirmDuplicateOrder, allOrders)}؟`
                            : `Order already has ${formData.lines.length} line(s). Replace items & VAT from Order #${resolveOrderSerial(confirmDuplicateOrder, allOrders)}?`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyDuplicatePastOrder(confirmDuplicateOrder)}
                          className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] transition cursor-pointer"
                        >
                          {isAr ? 'تأكيد التكرار والاستبدال' : 'Replace Items & VAT'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDuplicateOrder(null)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[11px] transition cursor-pointer"
                        >
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Feedback Notice after Duplicating Past Order */}
                  {duplicateFeedback && (
                    <div
                      className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold ${
                        duplicateFeedback.type === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span>{duplicateFeedback.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDuplicateFeedback(null)}
                        className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
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
                        const catalogProd = products.find((p) => p.id === line.productId);
                        const packingOpts = catalogProd?.packagingOptions || [];
                        const hasMultiPacking = packingOpts.length > 1;
                        const selectedPackingSuffix = line.packagingOptionSuffix || (hasMultiPacking ? 'any' : packingOpts[0]?.suffix || 'A');

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            {/* Product Info + Packing Option Picker + Promo Icon */}
                            <td className="py-2.5 px-3 font-bold text-slate-800">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {catalogProd?.imageFile && (
                                    <img
                                      src={catalogProd.imageFile}
                                      alt={line.productNameAr}
                                      className="w-7 h-7 rounded-md border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                                    />
                                  )}
                                  <span>{isAr ? line.productNameAr : (line.productNameEn || line.productNameAr)}</span>
                                  <span className="font-mono text-[10px] text-slate-400 font-medium">
                                    {line.productCode}
                                  </span>
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

                                {hasMultiPacking && (
                                  <div>
                                    {isStructureLocked ? (
                                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200">
                                        {selectedPackingSuffix === 'any'
                                          ? (isAr ? 'التعبئة: أي تعبئة (Any)' : 'Packing: Any')
                                          : (isAr ? `التعبئة: ${line.packagingOptionNameAr || selectedPackingSuffix}` : `Packing: ${line.packagingOptionNameEn || selectedPackingSuffix}`)}
                                      </span>
                                    ) : (
                                      <select
                                        value={selectedPackingSuffix}
                                        onChange={(e) => handleLineChange(idx, 'packagingOptionSuffix', e.target.value)}
                                        className="px-2 py-1 text-[11px] font-bold border border-cyan-300 rounded-lg bg-cyan-50/70 text-slate-800 focus:outline-none focus:border-cyan-600 cursor-pointer"
                                      >
                                        <option value="any">{isAr ? 'أي تعبئة (Any Packing)' : 'Any Packing'}</option>
                                        {packingOpts.map((opt) => (
                                          <option key={opt.suffix} value={opt.suffix}>
                                            {isAr ? (opt.nameAr || `تعبئة ${opt.suffix}`) : (opt.nameEn || opt.nameAr || `Option ${opt.suffix}`)} ({opt.optionCode || `${catalogProd.code}-${opt.suffix}`}) — 1×{opt.packagingRatio || catalogProd.packagingRatio}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'مندوب المبيعات / المسؤول' : 'Sales Rep / Officer'}
                </label>
                <select
                  value={formData.salesRep}
                  onChange={(e) => {
                    const selectedName = e.target.value;
                    const matchedOpt = salesRepOptions.find((o) => o.value === selectedName);
                    setFormData((prev) => ({
                      ...prev,
                      salesRep: selectedName,
                      salesRepId: matchedOpt?.id || '',
                    }));
                  }}
                  className="w-full py-2 px-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="">
                    {isAr ? '— اختر مندوب المبيعات —' : '— Select Sales Rep —'}
                  </option>
                  {salesRepOptions.map((opt) => (
                    <option key={opt.id || opt.value} value={opt.value}>
                      {opt.label}{opt.isLegacy ? (isAr ? ' (قيمة سابقة)' : ' (Legacy)') : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
                {isSaving ? <PeacockLoader size="xxs" inline variant="white" /> : <Check className="w-4 h-4" />}
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

      {/* Standardized Client & Branch Profile + Past Order Duplication Popup */}
      <ClientProfileModal
        isOpen={Boolean(clientProfileModalTab && formData.clientId)}
        onClose={() => setClientProfileModalTab(null)}
        client={selectedClient}
        clientId={formData.clientId}
        focusBranchId={formData.branchId}
        focusBranchName={formData.branchName}
        clients={clients}
        segments={segments}
        pricingStrategies={strategies}
        salesOrders={allOrders}
        initialTab={clientProfileModalTab || 'profile'}
        onDuplicateOrder={
          !isStructureLocked && (!isAdminModal || formData.orderType.startsWith('invoice_only'))
            ? handleRequestDuplicatePastOrder
            : null
        }
        zIndexClass="z-[90]"
        isAr={isAr}
      />
    </div>
  );
}

export default SalesOrderEditorModal;
