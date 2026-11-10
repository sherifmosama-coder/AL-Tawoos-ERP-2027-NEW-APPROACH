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
  Edit2
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

// Segment Icon Mapping
const SEGMENT_ICON_MAP = {
  Building2,
  Boxes,
  Truck,
  Users,
  Tag
};

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
  { id: 'not_yet', labelAr: 'معلق (لم يُنفذ)', labelEn: 'Pending' },
  { id: 'prepare', labelAr: 'جاري التجهيز', labelEn: 'Preparing' },
  { id: 'shipped', labelAr: 'جاري التوصيل', labelEn: 'Out for Delivery' },
  { id: 'delivered', labelAr: 'تم التسليم', labelEn: 'Delivered' },
  { id: 'paid', labelAr: 'مدفوع ومحصل', labelEn: 'Paid' }
];

const WEEKDAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

// Resolve accurate GPS location link vs search location link
function resolveLocationInfo(targetBranch, clientObj) {
  const hasAccurateGps = Boolean(
    (targetBranch?.gpsCoordinates && targetBranch.gpsCoordinates.trim() !== '') ||
    (clientObj?.branches?.[0]?.gpsCoordinates && clientObj.branches[0].gpsCoordinates.trim() !== '')
  );

  if (hasAccurateGps) {
    const coords = targetBranch?.gpsCoordinates?.trim() || clientObj?.branches?.[0]?.gpsCoordinates?.trim();
    return {
      type: 'accurate',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`
    };
  }

  const searchAddress = (
    targetBranch?.address?.trim() ||
    clientObj?.branches?.[0]?.address?.trim() ||
    targetBranch?.name?.trim() ||
    clientObj?.tradeNameAr?.trim() ||
    clientObj?.name?.trim() ||
    ''
  );

  if (searchAddress) {
    return {
      type: 'search',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchAddress)}`
    };
  }

  return null;
}

// Resolve Order Serial format
function resolveOrderSerial(order, allOrders = []) {
  if (order.serial) return String(order.serial).padStart(4, '0');
  const idx = allOrders.findIndex((o) => o.id === order.id);
  if (idx !== -1) return String(allOrders.length - idx).padStart(4, '0');
  return String(order.id || '').slice(-4).toUpperCase();
}

export default function SalesLoadingPlanMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const canManageLoadingPlan = canAccessAction(
    permissions,
    'loading_plan',
    'canManageLoadingPlan',
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

  // 1. Target Planning Date (Top Anchor Date)
  const [targetPlanningDate, setTargetPlanningDate] = useState(() => formatDateKey(new Date()));

  // 2. Date Scope: 'today' | 'tomorrow' | 'week' | 'custom'
  const [dateScope, setDateScope] = useState('today');
  const [customDate, setCustomDate] = useState(() => formatDateKey(new Date()));

  // 3. Single Active Editing Card
  const [activeEditingOrderId, setActiveEditingOrderId] = useState(null);

  // Filters & Controls
  const [searchTerm, setSearchTerm] = useState('');
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(true);
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'region' | 'client' | 'loadingOrder' | 'fulfillmentStatus'
  const [sortBy, setSortBy] = useState('weight_desc'); // 'weight_desc' | 'weight_asc' | 'cartons_desc' | 'serial_asc' | 'client_asc'

  // Staged Assignments: Record<orderId, { loadingOrderNumber, assignedVehicleId, assignedVehiclePlate, assignedDriverId, assignedDriverName, assignedDeliveryRepId, assignedDeliveryRepName, loadingDate }>
  const [stagedAssignments, setStagedAssignments] = useState({});

  // Floating Dock Expanded State
  const [isManifestExpanded, setIsManifestExpanded] = useState(false);

  // Save Modal Confirmation
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [advancePendingToPreparing, setAdvancePendingToPreparing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  // 3. Subscribe to Employees (Drivers & Delivery Reps)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.nameAr || a.name || '').localeCompare(b.nameAr || b.name || '', 'ar'));
      setEmployees(loaded);
    });
    return () => unsub();
  }, []);

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
      map[s.id] = s;
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
    if (dateScope === 'today') return isAr ? `اليوم (${todayStr})` : `Today (${todayStr})`;
    if (dateScope === 'tomorrow') return isAr ? `غداً (${tomorrowStr})` : `Tomorrow (${tomorrowStr})`;
    if (dateScope === 'week') return isAr ? `خلال 7 أيام (${todayStr} إلى ${weekEndStr})` : `Next 7 Days (${todayStr} to ${weekEndStr})`;
    return isAr ? `تاريخ مخصص (${customDate})` : `Custom Date (${customDate})`;
  }, [dateScope, todayStr, tomorrowStr, weekEndStr, customDate, isAr]);

  // Helper to resolve effective assignment (staged overrides saved order)
  const getEffectiveAssignment = (order) => {
    if (stagedAssignments[order.id]) {
      return stagedAssignments[order.id];
    }
    return {
      loadingOrderNumber: order.loadingOrderNumber || '',
      assignedVehicleId: order.assignedVehicleId || '',
      assignedVehiclePlate: order.assignedVehiclePlate || '',
      assignedDriverId: order.assignedDriverId || '',
      assignedDriverName: order.assignedDriverName || '',
      assignedDeliveryRepId: order.assignedDeliveryRepId || '',
      assignedDeliveryRepName: order.assignedDeliveryRepName || '',
      loadingDate: order.loadingDate || targetPlanningDate || todayStr
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

      // Auto-populate driver when vehicle changes
      if (field === 'assignedVehicleId') {
        const matchedVeh = vehicles.find((v) => v.id === value);
        if (matchedVeh) {
          updated.assignedVehiclePlate = matchedVeh.plateNumber || '';
          if (matchedVeh.driverUserId) {
            updated.assignedDriverId = matchedVeh.driverUserId;
            const matchedEmp = employees.find((e) => e.id === matchedVeh.driverUserId);
            updated.assignedDriverName = matchedEmp ? (matchedEmp.nameAr || matchedEmp.name) : matchedVeh.driverName || '';
          }
        } else {
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

  // Helper to clear assignment for an order
  const handleClearAssignment = (orderId) => {
    setStagedAssignments((prev) => ({
      ...prev,
      [orderId]: {
        loadingOrderNumber: '',
        assignedVehicleId: '',
        assignedVehiclePlate: '',
        assignedDriverId: '',
        assignedDriverName: '',
        assignedDeliveryRepId: '',
        assignedDeliveryRepName: '',
        loadingDate: ''
      }
    }));
    setActiveEditingOrderId(null);
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
      if (dateScope === 'today') {
        if (effectiveDate !== todayStr) return false;
      } else if (dateScope === 'tomorrow') {
        if (effectiveDate !== tomorrowStr) return false;
      } else if (dateScope === 'week') {
        if (!effectiveDate || effectiveDate < todayStr || effectiveDate > weekEndStr) return false;
      } else if (dateScope === 'custom') {
        if (effectiveDate !== customDate) return false;
      }

      // Unscheduled only filter
      if (unscheduledOnly) {
        if (eff.loadingOrderNumber && eff.assignedVehicleId) return false;
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
  }, [orders, stagedAssignments, dateScope, todayStr, tomorrowStr, weekEndStr, customDate, unscheduledOnly, confirmedOnly, fulfillmentFilter, searchTerm]);

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

      if (groupBy === 'region') {
        key = order.region || 'unspecified';
        label = order.region || (isAr ? 'منطقة غير محددة' : 'Unspecified Region');
      } else if (groupBy === 'client') {
        key = order.clientId || order.clientName || 'unspecified';
        label = order.clientName || (isAr ? 'عميل غير محدد' : 'Unspecified Client');
      } else if (groupBy === 'loadingOrder') {
        const eff = getEffectiveAssignment(order);
        key = eff.loadingOrderNumber ? `lo_${eff.loadingOrderNumber}` : 'unassigned';
        label = eff.loadingOrderNumber
          ? `${isAr ? 'أمر تحميل #' : 'Loading Order #'}${eff.loadingOrderNumber}${eff.assignedVehiclePlate ? ` — ${eff.assignedVehiclePlate}` : ''}`
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

    return Object.values(groups);
  }, [sortedOrders, groupBy, isAr, stagedAssignments]);

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
          primaryVehiclePlate: eff.assignedVehiclePlate,
          primaryDriverId: eff.assignedDriverId,
          primaryDriverName: eff.assignedDriverName,
          primaryRepId: eff.assignedDeliveryRepId,
          primaryRepName: eff.assignedDeliveryRepName
        };
      }

      const g = loGroups[compoundKey];
      if (eff.assignedVehicleId) g.vehiclesAssigned.add(eff.assignedVehicleId);
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

  // 1-Click Alignment Handler: Unifies all orders in an LO # on a specific date to the chosen vehicle and driver
  const handleAlignTruckOrders = (compoundKey, loNumber, targetLoadingDate, targetVehicleId, targetDriverId) => {
    const veh = vehicles.find((v) => v.id === targetVehicleId);
    const emp = employees.find((e) => e.id === targetDriverId);

    setStagedAssignments((prev) => {
      const updated = { ...prev };
      orders.forEach((order) => {
        const eff = getEffectiveAssignment(order);
        const orderDate = eff.loadingDate || targetPlanningDate || todayStr;
        if (Number(eff.loadingOrderNumber) === loNumber && orderDate === targetLoadingDate) {
          updated[order.id] = {
            ...eff,
            loadingDate: targetLoadingDate,
            assignedVehicleId: targetVehicleId,
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
        ? `تمت مطابقة وتوحيد بيانات الشاحنة والسائق لأمر تحميل #${loNumber} بتاريخ (${targetLoadingDate}) بنجاح ✓`
        : `Truck and driver aligned for LO #${loNumber} on ${targetLoadingDate} ✓`
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
    if (totalMisalignments > 0) {
      alert(isAr ? 'لا يمكن حفظ الخطة! يوجد تعارض في تعيين الشاحنات أو السائقين لنفس أمر التحميل على نفس التاريخ. يرجى الضغط على "مطابقة" لحل التعارض.' : 'Cannot save plan! There are conflicting trucks or drivers for the same Loading Order and date. Please align them first.');
      return;
    }

    // Check if any scheduled order is missing a vehicle or driver
    const stagedList = Object.entries(stagedAssignments);
    for (const [orderId, eff] of stagedList) {
      if (eff.loadingOrderNumber) {
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

    setIsSaveModalOpen(true);
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
          assignedVehiclePlate: staged.assignedVehiclePlate || '',
          assignedDriverId: staged.assignedDriverId || '',
          assignedDriverName: staged.assignedDriverName || '',
          assignedDeliveryRepId: staged.assignedDeliveryRepId || '',
          assignedDeliveryRepName: staged.assignedDeliveryRepName || '',
          loadingDate: staged.loadingDate || targetPlanningDate || '',
          updatedAt: nowIso,
          updatedBy: currentUserName
        };

        // Advance to preparing if checked and order is pending
        if (
          advancePendingToPreparing &&
          staged.loadingOrderNumber &&
          originalOrder?.fulfillmentStatus === 'not_yet'
        ) {
          updatePayload.fulfillmentStatus = 'prepare';
        }

        // Add audit trail entry
        const existingAudit = Array.isArray(originalOrder?.auditTrail) ? originalOrder.auditTrail : [];
        const auditEntry = {
          timestamp: nowIso,
          userId: currentUserId,
          userName: currentUserName,
          action: 'dispatch_plan_update',
          summaryAr: staged.loadingOrderNumber
            ? `تسكين في أمر تحميل #${staged.loadingOrderNumber} (${staged.loadingDate || targetPlanningDate}) — سيارة: ${staged.assignedVehiclePlate || '—'} — سائق: ${staged.assignedDriverName || '—'}`
            : 'إلغاء تسكين الشاحنة وأمر التحميل',
          summaryEn: staged.loadingOrderNumber
            ? `Assigned to LO #${staged.loadingOrderNumber} (${staged.loadingDate || targetPlanningDate}) — Truck: ${staged.assignedVehiclePlate || '—'} — Driver: ${staged.assignedDriverName || '—'}`
            : 'Unassigned from truck'
        };

        updatePayload.auditTrail = [auditEntry, ...existingAudit];

        batch.update(orderRef, updatePayload);
        updatedCount++;
      }

      await batch.commit();

      setStagedAssignments({});
      setIsSaveModalOpen(false);
      setIsManifestExpanded(false);
      setActiveEditingOrderId(null);
      showToast(isAr ? `تم حفظ واعتماد خطة التحميل بنجاح (${updatedCount} أمر بيع) ✓` : `Loading Plan saved successfully (${updatedCount} orders) ✓`);
    } catch (err) {
      console.error('Error saving loading plan:', err);
      alert(isAr ? `حدث خطأ أثناء حفظ الخطة: ${err.message}` : `Error saving plan: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const stagedOrdersCount = Object.keys(stagedAssignments).length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-32">
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
        {/* Row 1: Target Planning Date + Date Scope Buttons & Overall Scope Stats */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Target Planning Date Input (Top Anchor Date) */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50/80 border border-amber-200 rounded-2xl shadow-2xs">
              <span className="text-amber-900 font-extrabold text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>{isAr ? 'تاريخ التحميل المستهدف:' : 'Target Loading Date:'}</span>
              </span>
              <input
                type="date"
                value={targetPlanningDate}
                onChange={(e) => setTargetPlanningDate(e.target.value)}
                className="py-0.5 px-2 bg-white border border-amber-300 rounded-xl font-mono text-xs font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            {/* Scope Shortcuts */}
            <div className="flex items-center gap-1">
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
          <div className="relative lg:col-span-4">
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
          <div className="flex items-center gap-1.5 lg:col-span-4 flex-wrap">
            <button
              type="button"
              onClick={() => setUnscheduledOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                unscheduledOnly
                  ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>{isAr ? 'غير مُجدول فقط' : 'Unscheduled Only'}</span>
              {unscheduledOnly && <Check className="w-3 h-3 ms-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => setConfirmedOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
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
                <div className="flex items-center gap-2 px-2 pt-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <h3 className="font-black text-slate-800 text-sm">{group.groupLabel}</h3>
                  <span className="text-[11px] font-mono font-bold text-slate-400">
                    ({group.items.length} {isAr ? 'أوامر' : 'orders'})
                  </span>
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
                  const targetBranch = (clientObj?.branches || []).find((b) => b.id === order.branchId) || clientObj?.branches?.[0] || null;

                  // Location detection: accurate GPS vs fallback address/name search
                  const locInfo = resolveLocationInfo(targetBranch, clientObj);

                  // Operational Profile
                  const workingHoursDisplay = targetBranch?.workingHours || clientObj?.workingHours || '';
                  const holidaysList = targetBranch?.weeklyHolidays || clientObj?.weeklyHolidays || [];
                  const clientNotes = clientObj?.notes || '';

                  // Segment
                  const segObj = clientObj?.segmentId ? segmentMap[clientObj.segmentId] : null;
                  const SegIcon = (segObj?.icon && SEGMENT_ICON_MAP[segObj.icon]) ? SEGMENT_ICON_MAP[segObj.icon] : Building2;
                  const segColor = segObj?.color || '#64748b';

                  // Driver match indicator
                  const selectedVehicle = vehicles.find((v) => v.id === eff.assignedVehicleId);
                  const isDefaultDriver = selectedVehicle?.driverUserId && selectedVehicle.driverUserId === eff.assignedDriverId;

                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-3xl border transition-all duration-300 shadow-xs overflow-hidden ${
                        isEditing
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
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-xs font-black text-slate-800">
                                    #{orderSerial}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 font-mono">
                                    {order.invoiceDate || '—'}
                                  </span>
                                </div>

                                <div className="font-extrabold text-xs text-slate-900 leading-tight truncate" title={order.clientName}>
                                  {order.clientName || '—'}
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
                              </div>

                              <div className="pt-2 border-t border-slate-200/70 space-y-1">
                                <div className="text-xs font-mono font-black text-slate-900">
                                  {(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                </div>
                                <div className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  <Weight className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>{((order.totalWeightKg || 0) / 1000).toFixed(1)} {isAr ? 'طن' : 't'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Ultra-Compact Assignment Form Panel (80% width) - Header and Footer removed */}
                            <div className="w-full md:w-[80%] p-3 sm:p-4 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-start transition-all duration-700 ease-out origin-right rtl:origin-left animate-in fade-in slide-in-from-right-16 rtl:slide-in-from-left-16 duration-700">
                              {/* Fields Grid */}
                              <div className="w-full flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
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

                                {/* 3. Truck Selector */}
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
                                    {vehicles.map((v) => (
                                      <option key={v.id} value={v.id}>
                                        {v.plateNumber} — {v.vehicleModel}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* 4. Driver Selector */}
                                <div>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <label className="text-[10px] font-bold text-slate-500">
                                      {isAr ? 'السائق:' : 'Driver:'} *
                                    </label>
                                    {eff.assignedVehicleId && (
                                      <span className={`text-[9px] font-bold px-1 rounded ${
                                        isDefaultDriver
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : eff.assignedDriverId
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-rose-100 text-rose-800'
                                      }`}>
                                        {isDefaultDriver
                                          ? (isAr ? '✓ أساسي' : '✓ Default')
                                          : eff.assignedDriverId
                                          ? (isAr ? '✓ بديل' : '✓ Override')
                                          : (isAr ? '! مطلوب' : '! Needed')}
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
                                        {emp.nameAr || emp.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* 5. Delivery Rep Selector */}
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
                                        {emp.nameAr || emp.name}
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

                                {/* Save / Check Button */}
                                <button
                                  type="button"
                                  onClick={() => setActiveEditingOrderId(null)}
                                  className="group/btn inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-300 shadow-xs cursor-pointer overflow-hidden"
                                  title={isAr ? 'حفظ' : 'Save'}
                                >
                                  <Check className="w-4 h-4 shrink-0" />
                                  <span className="max-w-0 opacity-0 group-hover/btn:max-w-xs group-hover/btn:opacity-100 transition-all duration-300 text-xs font-bold whitespace-nowrap overflow-hidden">
                                    {isAr ? 'حفظ' : 'Save'}
                                  </span>
                                </button>

                                {/* Cancel / X Button */}
                                <button
                                  type="button"
                                  onClick={() => setActiveEditingOrderId(null)}
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

                                  <span className="font-mono text-xs font-black text-slate-800">
                                    #{orderSerial}
                                  </span>

                                  <span className="text-[11px] font-mono text-slate-400">
                                    {order.invoiceDate || '—'}
                                  </span>
                                </div>

                                {/* Cartons & Weight Summary Badge */}
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-xs font-mono">
                                    {(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                    {order.totalBonus > 0 ? (
                                      <span className="text-emerald-600 text-[10px] font-bold ms-1">+{order.totalBonus}</span>
                                    ) : null}
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    <Weight className="w-3 h-3 text-slate-500" />
                                    <span>{((order.totalWeightKg || 0) / 1000).toFixed(1)} {isAr ? 'طن' : 't'}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Client & Branch & Region & Maps */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 shadow-2xs"
                                    style={{
                                      backgroundColor: `${segColor}18`,
                                      color: segColor,
                                      border: `1px solid ${segColor}35`
                                    }}
                                  >
                                    <SegIcon className="w-3.5 h-3.5 shrink-0" />
                                  </span>
                                  <span className="font-extrabold text-slate-900 text-sm">
                                    {order.clientName || order.clientId || '—'}
                                  </span>
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
                                      title={isAr ? 'فتح الموقع المسجل الدقيق على الخريطة' : 'Open Saved Accurate Location on Map'}
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
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      <span>{workingHoursDisplay}</span>
                                    </span>
                                  )}

                                  {holidaysList.length > 0 && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200"
                                      title={isAr ? 'عطلة أسبوعية' : 'Weekly holiday'}
                                    >
                                      <Calendar className="w-3 h-3 text-rose-500" />
                                      <span>
                                        {isAr ? 'عطلة:' : 'Holiday:'}{' '}
                                        {holidaysList.map((d) => (isAr ? WEEKDAY_NAMES_AR[d] : WEEKDAY_NAMES_EN[d])).join('، ')}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Client Notes & Order Notes */}
                              {(clientNotes || order.externalComments || order.internalComments) && (
                                <div className="space-y-1.5 pt-1 text-xs">
                                  {clientNotes && (
                                    <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-1.5">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-bold me-1">{isAr ? 'ملاحظة العميل الدائمة:' : 'Client Note:'}</span>
                                        <span>{clientNotes}</span>
                                      </div>
                                    </div>
                                  )}

                                  {order.internalComments && (
                                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px] flex items-start gap-1">
                                      <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                      <span className="break-words">{order.internalComments}</span>
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

                            {/* COMPACT 2X2 SUMMARY GRID STRIP (20% width) */}
                            <div
                              onClick={() => setActiveEditingOrderId(order.id)}
                              className="w-full md:w-[20%] p-3 bg-emerald-50/40 hover:bg-emerald-50/70 border-t md:border-t-0 md:border-s border-emerald-100 flex flex-col justify-between transition-all duration-300 shrink-0 cursor-pointer text-start select-none group"
                              title={isAr ? 'انقر لتعديل بيانات التسكين' : 'Click to edit dispatch assignment'}
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase text-emerald-800 flex items-center gap-1">
                                    <Truck className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>{isAr ? 'بيانات الشاحنة' : 'Assigned Truck'}</span>
                                  </span>
                                  <span className="text-[10px] font-bold text-emerald-700 group-hover:underline flex items-center gap-0.5">
                                    <Edit2 className="w-2.5 h-2.5" />
                                    <span>{isAr ? 'تعديل' : 'Edit'}</span>
                                  </span>
                                </div>

                                {/* 2x2 Cell Badge Box */}
                                <div className="grid grid-cols-2 gap-1.5 text-start">
                                  {/* Cell 1: LO Number */}
                                  <div className="bg-white p-1.5 rounded-xl border border-emerald-200 shadow-2xs font-mono font-black text-xs text-emerald-800 flex items-center gap-1 truncate">
                                    <Truck className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>#{eff.loadingOrderNumber}</span>
                                  </div>

                                  {/* Cell 2: Vehicle Plate */}
                                  <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs text-[10px] font-bold text-slate-800 truncate" title={eff.assignedVehiclePlate}>
                                    {eff.assignedVehiclePlate || '—'}
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

                              <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[10px] font-mono text-emerald-800">
                                <span>📅 {eff.loadingDate}</span>
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

                                  <span className="font-mono text-xs font-black text-slate-800">
                                    #{orderSerial}
                                  </span>

                                  <span className="text-[11px] font-mono text-slate-400">
                                    {order.invoiceDate || '—'}
                                  </span>
                                </div>

                                {/* Cartons & Weight Summary Badge */}
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-xs font-mono">
                                    {(order.totalCartons || order.totalQty || 0).toLocaleString()} {isAr ? 'كرتونة' : 'ctn'}
                                    {order.totalBonus > 0 ? (
                                      <span className="text-emerald-600 text-[10px] font-bold ms-1">+{order.totalBonus}</span>
                                    ) : null}
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    <Weight className="w-3 h-3 text-slate-500" />
                                    <span>{((order.totalWeightKg || 0) / 1000).toFixed(1)} {isAr ? 'طن' : 't'}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Client & Branch & Region & Maps */}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 shadow-2xs"
                                    style={{
                                      backgroundColor: `${segColor}18`,
                                      color: segColor,
                                      border: `1px solid ${segColor}35`
                                    }}
                                  >
                                    <SegIcon className="w-3.5 h-3.5 shrink-0" />
                                  </span>
                                  <span className="font-extrabold text-slate-900 text-sm">
                                    {order.clientName || order.clientId || '—'}
                                  </span>
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
                                      title={isAr ? 'فتح الموقع المسجل الدقيق على الخريطة' : 'Open Saved Accurate Location on Map'}
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
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-mono">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      <span>{workingHoursDisplay}</span>
                                    </span>
                                  )}

                                  {holidaysList.length > 0 && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200"
                                      title={isAr ? 'عطلة أسبوعية' : 'Weekly holiday'}
                                    >
                                      <Calendar className="w-3 h-3 text-rose-500" />
                                      <span>
                                        {isAr ? 'عطلة:' : 'Holiday:'}{' '}
                                        {holidaysList.map((d) => (isAr ? WEEKDAY_NAMES_AR[d] : WEEKDAY_NAMES_EN[d])).join('، ')}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Client Notes & Order Notes */}
                              {(clientNotes || order.externalComments || order.internalComments) && (
                                <div className="space-y-1.5 pt-1 text-xs">
                                  {clientNotes && (
                                    <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-1.5">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-bold me-1">{isAr ? 'ملاحظة العميل الدائمة:' : 'Client Note:'}</span>
                                        <span>{clientNotes}</span>
                                      </div>
                                    </div>
                                  )}

                                  {order.internalComments && (
                                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[11px] flex items-start gap-1">
                                      <Lock className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                      <span className="break-words">{order.internalComments}</span>
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

                            {/* COMPACT STRIP WITH TRUCK ICON (+ تسكين) */}
                            <div
                              onClick={() => setActiveEditingOrderId(order.id)}
                              className="w-14 sm:w-16 bg-slate-50 hover:bg-emerald-50/70 border-t md:border-t-0 md:border-s border-slate-100 flex flex-col items-center justify-center p-2 cursor-pointer transition select-none group shrink-0"
                              title={isAr ? 'انقر لتسكين الطلب في شاحنة وأمر تحميل' : 'Click to assign order to truck'}
                            >
                              <div className="w-9 h-9 rounded-2xl bg-white group-hover:bg-emerald-600 text-slate-400 group-hover:text-white border border-slate-200 group-hover:border-emerald-600 flex items-center justify-center transition shadow-2xs">
                                <Truck className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-black text-slate-400 group-hover:text-emerald-700 mt-1.5">
                                {isAr ? '+ تسكين' : '+ Assign'}
                              </span>
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
                              <span className="font-bold text-white text-xs truncate max-w-[140px]">
                                {tm.primaryVehiclePlate || (isAr ? 'بدون لوحة' : 'No Plate')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>📅 {tm.loadingDate}</span>
                              <span>•</span>
                              <span>{isAr ? 'إذن صرف:' : 'Dismiss #:'} {tm.dismissNumber}</span>
                            </div>
                          </div>

                          <span className="text-[10px] font-mono font-bold bg-slate-900 text-slate-300 px-2 py-0.5 rounded-lg border border-slate-700">
                            {tm.assignedOrders.length} {isAr ? 'أمر' : 'orders'}
                          </span>
                        </div>

                        {/* Driver & Rep */}
                        <div className="text-[11px] text-slate-300 space-y-0.5 mb-2.5">
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

                {/* Save Plan Button */}
                <button
                  type="button"
                  onClick={handleOpenSaveModal}
                  disabled={totalMisalignments > 0}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm ${
                    totalMisalignments > 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>{isAr ? 'حفظ الخطة' : 'Save Plan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SAVE CONFIRMATION MODAL */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-start">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                  <Save className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {isAr ? 'تأكيد واعتماد خطة التحميل' : 'Confirm & Save Loading Plan'}
                  </h3>
                  <span className="text-xs text-slate-400 font-bold">
                    {stagedOrdersCount} {isAr ? 'أمر بيع مستهدف' : 'orders to update'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1.5">
                <span className="font-bold text-emerald-900 block">
                  {isAr ? 'ملخص بيانات الخطة المستهدفة:' : 'Plan Summary:'}
                </span>
                <ul className="text-[11px] text-emerald-800 space-y-1 list-disc list-inside">
                  <li>{stagedOrdersCount} {isAr ? 'أوامر بيع يتم تحديث تسكينها' : 'orders will have dispatch updated'}</li>
                  <li>{truckManifest.length} {isAr ? 'شاحنات مشمولة بأوامر تحميل' : 'trucks configured in manifest'}</li>
                </ul>
              </div>

              {/* Advance Pending to Preparing Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition select-none">
                <input
                  type="checkbox"
                  checked={advancePendingToPreparing}
                  onChange={(e) => setAdvancePendingToPreparing(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    {isAr ? 'ترقية الأوامر المعلقة تلقائياً إلى "جاري التجهيز"' : 'Advance Pending orders to "Preparing"'}
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    {isAr
                      ? 'تغيير حالة التنفيذ للأوامر المجدولة من (معلق) إلى (جاري التجهيز) وإشعار مستودع المنتج التام.'
                      : 'Automatically updates fulfillment status of newly scheduled orders from Pending to Preparing.'}
                  </span>
                </div>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleCommitSavePlan}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                >
                  {isSaving ? (
                    <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAr ? 'اعتماد وحفظ الخطة' : 'Confirm & Commit'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
