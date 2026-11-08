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
  BadgeDollarSign,
  Plus,
  Search,
  Filter,
  SlidersHorizontal,
  Calendar,
  Layers,
  Sparkles,
  Zap,
  Tag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  MoreVertical,
  Edit3,
  Copy,
  Trash2,
  X,
  Building2,
  MapPin,
  FileSpreadsheet,
  FileText,
  Download,
  Upload,
  ArrowRight,
  TrendingUp,
  Percent,
  Check,
  RotateCcw,
  Boxes,
  HelpCircle,
  History,
  User,
  ArrowUpRight,
  ArrowDownRight,
  Eye
} from 'lucide-react';
import PricingStrategiesModal, { PricingStrategyBadge } from './PricingStrategiesModal';
import { SEGMENT_ICON_MAP } from './ClientSegmentsMaster';
import SearchableSelect from './SearchableSelect';
import PricePeriodAuditModal from './PricePeriodAuditModal';
import {
  DEFAULT_PRICING_STRATEGIES,
  isProductPrivateLabel,
  formatDateKey,
  isPeriodActiveForDate,
  computePeriodStatus
} from '../utils/pricingEngine';

export default function PriceListsMaster({ currentUser = {}, permissions = null }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const currentUserName =
    currentUser?.name ||
    currentUser?.nameAr ||
    currentUser?.displayName ||
    currentUser?.username ||
    currentUser?.email ||
    (isAr ? 'مستخدم معتمد' : 'Authorized User');
  const currentUserId = currentUser?.id || currentUser?.uid || 'usr_unknown';

  // Subscriptions & Data State
  const [priceLists, setPriceLists] = useState([]);
  const [strategies, setStrategies] = useState(DEFAULT_PRICING_STRATEGIES);
  const [products, setProducts] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals State
  const [isStratModalOpen, setIsStratModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [activeActionsMenuId, setActiveActionsMenuId] = useState(null);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
  const [deleteConfirmPeriod, setDeleteConfirmPeriod] = useState(null);
  const [auditModalPeriod, setAuditModalPeriod] = useState(null);

  const activePeriodForMenu = useMemo(() => {
    if (!activeActionsMenuId) return null;
    return priceLists.find((p) => p.id === activeActionsMenuId) || null;
  }, [activeActionsMenuId, priceLists]);

  // 1. Subscribe to Price Lists
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'price_lists'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort newest start date first
      loaded.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
      setPriceLists(loaded);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to Pricing Strategies
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pricing_strategies'), (snapshot) => {
      if (!snapshot.empty) {
        const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStrategies(loaded);
      }
    });
    return () => unsub();
  }, []);

  // 3. Subscribe to Finished Goods
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'finished_products'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.nameAr || '').localeCompare(b.nameAr || '', 'ar'));
      setProducts(loaded);
    });
    return () => unsub();
  }, []);

  // 4. Subscribe to Clients
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.tradeNameAr || '').localeCompare(b.tradeNameAr || '', 'ar'));
      setClients(loaded);
    });
    return () => unsub();
  }, []);

  // 5. Subscribe to Finished Goods Categories
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

  // Close 3-dots actions menu on outside click or scroll/resize
  useEffect(() => {
    if (!activeActionsMenuId) return;

    const handleClick = (e) => {
      if (!e.target.closest('[data-period-menu]')) {
        setActiveActionsMenuId(null);
        setActionsMenuAnchor(null);
      }
    };
    const handleScrollOrResize = () => {
      setActiveActionsMenuId(null);
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
  }, [activeActionsMenuId]);

  // Set of client IDs who currently have an active Special Pricing period
  const activeSpecialClientIds = useMemo(() => {
    const todayStr = formatDateKey(new Date());
    const ids = new Set();
    (priceLists || []).forEach((pl) => {
      if (
        (pl.isSpecialPricing || pl.strategyId === 'special_pricing') &&
        pl.clientId &&
        isPeriodActiveForDate(pl, todayStr)
      ) {
        ids.add(pl.clientId);
      }
    });
    return ids;
  }, [priceLists]);

  // Options for Client Filter (SearchableSelect in the filter bar)
  // Prioritized: (1) Profile strategy = special_pricing -> (2) Active special pricing -> (3) Other strategies
  const filterClientOptions = useMemo(() => {
    const tier1 = [];
    const tier2 = [];
    const tier3 = [];

    (clients || []).forEach((c) => {
      const codeStr = c.code ? `[${c.code}] ` : '';
      const name = isAr
        ? (c.tradeNameAr || c.legalNameAr || c.tradeNameEn || c.name || '')
        : (c.tradeNameEn || c.tradeNameAr || c.legalNameEn || c.name || '');
      const fullLabel = `${codeStr}${name}`.trim();

      // Resolve strategy icon and color configured in PricingStrategiesModal
      const clientStratId = c.pricingStrategy || 'wholesalers';
      const strat =
        strategies.find((s) => s.id === clientStratId) ||
        DEFAULT_PRICING_STRATEGIES.find((s) => s.id === clientStratId) || {
          id: clientStratId,
          nameAr: clientStratId,
          nameEn: clientStratId,
          color: '#64748b',
          icon: 'Tag'
        };
      const StratIcon = SEGMENT_ICON_MAP[strat.icon] || Tag;
      const stratTitle = isAr ? strat.nameAr : strat.nameEn;

      const opt = {
        value: c.id,
        label: fullLabel,
        sublabel: '',
        icon: StratIcon,
        iconColor: strat.color || '#2563eb',
        iconTitle: `${isAr ? 'الاستراتيجية:' : 'Strategy:'} ${stratTitle}`
      };

      if (c.pricingStrategy === 'special_pricing') {
        tier1.push(opt);
      } else if (activeSpecialClientIds.has(c.id)) {
        tier2.push(opt);
      } else {
        tier3.push(opt);
      }
    });

    tier1.sort((a, b) => a.label.localeCompare(b.label, isAr ? 'ar' : 'en'));
    tier2.sort((a, b) => a.label.localeCompare(b.label, isAr ? 'ar' : 'en'));
    tier3.sort((a, b) => a.label.localeCompare(b.label, isAr ? 'ar' : 'en'));

    const options = [
      {
        value: 'all',
        label: isAr ? 'جميع العملاء (كافة النطاقات)' : 'All Clients / Scopes',
        sublabel: '',
        icon: Building2,
        iconColor: '#3b82f6',
        iconTitle: isAr ? 'كافة النطاقات والعملاء' : 'All Scopes & Clients'
      }
    ];

    if (tier1.length > 0) {
      options.push({
        value: '__tier1_header__',
        label: isAr ? '⭐ عملاء ملفهم الأساسي أسعار خاصة' : '⭐ Profile: Special Pricing',
        disabled: true
      });
      options.push(...tier1);
    }
    if (tier2.length > 0) {
      options.push({
        value: '__tier2_header__',
        label: isAr ? '⚡ عملاء لديهم أسعار خاصة سارية حالياً' : '⚡ Active Special Pricing Contracts',
        disabled: true
      });
      options.push(...tier2);
    }
    if (tier3.length > 0) {
      options.push({
        value: '__tier3_header__',
        label: isAr ? 'عملاء باستراتيجيات تسعير أخرى' : 'Other Client Strategies',
        disabled: true
      });
      options.push(...tier3);
    }

    return options;
  }, [clients, activeSpecialClientIds, isAr]);

  // Derived Filtered Periods
  const filteredPeriods = useMemo(() => {
    const todayStr = formatDateKey(new Date());
    const selectedClientObj = clientFilter !== 'all' ? clients.find((c) => c.id === clientFilter) : null;

    return priceLists.filter((pl) => {
      // Client filter (SearchableSelect)
      if (clientFilter !== 'all') {
        const matchesTargetClient = pl.clientId === clientFilter || pl.clientIds?.includes?.(clientFilter);
        const matchesClientStrategy = !pl.clientId && selectedClientObj?.pricingStrategy && (pl.strategyId === selectedClientObj.pricingStrategy);
        if (!matchesTargetClient && !matchesClientStrategy) {
          return false;
        }
      }
      // Strategy filter
      if (strategyFilter !== 'all' && pl.strategyId !== strategyFilter) {
        return false;
      }
      // Type filter (official vs promotional)
      if (typeFilter !== 'all' && pl.type !== typeFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        const computed = computePeriodStatus(pl, todayStr);
        if (computed !== statusFilter) return false;
      }
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = (pl.id || '').toLowerCase();
        const clientName = (pl.clientName || '').toLowerCase();
        const stratName = (pl.strategyNameAr || '').toLowerCase();
        const notes = (pl.notes || '').toLowerCase();
        if (
          !code.includes(q) &&
          !clientName.includes(q) &&
          !stratName.includes(q) &&
          !notes.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [priceLists, clientFilter, clients, strategyFilter, typeFilter, statusFilter, searchQuery]);

  // KPIs
  const kpis = useMemo(() => {
    const todayStr = formatDateKey(new Date());
    let activeCount = 0;
    let promoCount = 0;
    let indefiniteCount = 0;
    let draftCount = 0;

    priceLists.forEach((pl) => {
      const status = computePeriodStatus(pl, todayStr);
      if (status === 'draft') {
        draftCount++;
      } else if (status === 'active') {
        activeCount++;
        if (pl.type === 'promotional') promoCount++;
      }
      if (status !== 'draft' && !pl.endDate) indefiniteCount++;
    });

    return {
      total: priceLists.length,
      active: activeCount,
      promo: promoCount,
      indefinite: indefiniteCount,
      drafts: draftCount
    };
  }, [priceLists]);

  const handleOpenNewPeriod = () => {
    setEditingPeriod(null);
    setIsEditorModalOpen(true);
  };

  const handleOpenEditPeriod = (period) => {
    setEditingPeriod(period);
    setIsEditorModalOpen(true);
    setActiveActionsMenuId(null);
  };

  const handleDuplicatePeriod = (period) => {
    // Clone items and metadata with new ID, fresh dates, and initial duplicate audit record
    const cloned = {
      ...period,
      id: '', // Will generate new code
      startDate: formatDateKey(new Date()),
      endDate: null,
      notes: `${period.notes ? period.notes + ' - ' : ''}${isAr ? 'نسخة مكررة' : 'Duplicate copy'}`,
      duplicatedFromId: period.id,
      auditTrail: [
        {
          id: `audit_${Date.now()}_duplicate`,
          timestamp: new Date().toISOString(),
          action: 'duplicate',
          actionLabelAr: 'إنشاء نسخة مكررة',
          actionLabelEn: 'Duplicate Copy Created',
          performedBy: currentUserName,
          performedById: currentUserId,
          summaryAr: `تم إنشاء هذه المسودة كنسخة مكررة من الفترة الأصلية (${period.id}) مع استنساخ كافة الأسعار`,
          summaryEn: `Draft created by duplicating period (${period.id}) cloning all finished good prices`,
          status: 'draft',
          changes: { metadata: [], priceChanges: [] }
        }
      ]
    };
    setEditingPeriod(cloned);
    setIsEditorModalOpen(true);
    setActiveActionsMenuId(null);
  };

  const handleClosePeriodNow = async (period) => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const closeDateStr = formatDateKey(yesterday);

      const closeAudit = {
        id: `audit_${Date.now()}_close`,
        timestamp: new Date().toISOString(),
        action: 'close_now',
        actionLabelAr: 'إغلاق فوري للفترة',
        actionLabelEn: 'Close Period Now',
        performedBy: currentUserName,
        performedById: currentUserId,
        summaryAr: `تم إنهاء وإغلاق صلاحية الفترة فوراً بتاريخ (${closeDateStr})`,
        summaryEn: `Closed period immediately with validity ending on (${closeDateStr})`,
        status: 'expired',
        changes: {
          metadata: [
            { field: 'status', labelAr: 'الحالة', labelEn: 'Status', oldValue: period.status || 'active', newValue: 'expired' },
            { field: 'endDate', labelAr: 'تاريخ الانتهاء', labelEn: 'End Date', oldValue: period.endDate || null, newValue: closeDateStr }
          ],
          priceChanges: []
        }
      };

      await setDoc(
        doc(db, 'price_lists', period.id),
        {
          endDate: closeDateStr,
          status: 'expired',
          auditTrail: [...(period.auditTrail || []), closeAudit],
          updatedBy: currentUserName,
          updatedById: currentUserId,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setActiveActionsMenuId(null);
    } catch (e) {
      console.error('Error closing period:', e);
      alert(isAr ? 'تعذر إغلاق الفترة' : 'Failed to close period');
    }
  };

  const handleActivateDraft = async (period) => {
    const todayStr = formatDateKey(new Date());
    const isPassed = period.startDate && period.startDate < todayStr;
    const effectiveStartDate = isPassed ? todayStr : period.startDate;

    const confirmMsg = isPassed
      ? (isAr
          ? `تنبيه: تاريخ بداية المسودة (${period.startDate}) قد مضى.\nسيتم تحديث تاريخ البداية تلقائياً إلى تاريخ اليوم (${todayStr}) واعتماد الفترة وإغلاق أي فترة سابقة نشطة.\n\nهل تريد المتابعة؟`
          : `Notice: The draft's start date (${period.startDate}) has passed. It will be automatically updated to today (${todayStr}) upon activation.\n\nProceed?`)
      : (isAr
          ? `هل أنت متأكد من اعتماد وتفعيل هذه الفترة الآن؟ سيتم إغلاق أي فترة نشطة سابقة متداخلة.`
          : `Are you sure you want to activate this period now? Any overlapping active period will be closed.`);

    if (!window.confirm(confirmMsg)) return;

    try {
      const batch = writeBatch(db);

      // Find active overlapping period of the same strategy, type, client/branch
      const activeOverlapping = priceLists.find((pl) => {
        if (pl.id === period.id || pl.status === 'draft' || pl.status === 'expired') return false;
        if (pl.strategyId !== period.strategyId || pl.type !== period.type) return false;
        if (period.isSpecialPricing) {
          if (pl.clientId !== period.clientId) return false;
          if (period.allBranches && !pl.allBranches) return false;
          if (!period.allBranches && pl.branchId !== period.branchId) return false;
        }
        return isPeriodActiveForDate(pl, effectiveStartDate);
      });

      if (activeOverlapping) {
        const prevDateObj = new Date(effectiveStartDate);
        prevDateObj.setDate(prevDateObj.getDate() - 1);
        const autoCloseDate = formatDateKey(prevDateObj);

        const autoCloseAudit = {
          id: `audit_${Date.now()}_autoclose`,
          timestamp: new Date().toISOString(),
          action: 'auto_closed',
          actionLabelAr: 'إغلاق تلقائي للتداخل',
          actionLabelEn: 'Auto Closed by Overlap',
          performedBy: currentUserName,
          performedById: currentUserId,
          summaryAr: `تم إغلاق الفترة تلقائياً بتاريخ (${autoCloseDate}) نظراً لاعتماد فترة أحدث (${period.id})`,
          summaryEn: `Auto-closed on (${autoCloseDate}) due to activation of overlapping period (${period.id})`,
          status: 'expired',
          changes: {
            metadata: [
              { field: 'endDate', labelAr: 'تاريخ الانتهاء', labelEn: 'End Date', oldValue: activeOverlapping.endDate || null, newValue: autoCloseDate }
            ],
            priceChanges: []
          }
        };

        batch.update(doc(db, 'price_lists', activeOverlapping.id), {
          endDate: autoCloseDate,
          auditTrail: [...(activeOverlapping.auditTrail || []), autoCloseAudit],
          updatedBy: currentUserName,
          updatedById: currentUserId,
          updatedAt: serverTimestamp()
        });
      }

      const activateAudit = {
        id: `audit_${Date.now()}_activate`,
        timestamp: new Date().toISOString(),
        action: 'activate_draft',
        actionLabelAr: 'اعتماد وتفعيل المسودة',
        actionLabelEn: 'Activate Draft',
        performedBy: currentUserName,
        performedById: currentUserId,
        summaryAr: `تم اعتماد وتفعيل المسودة كفترة سارية${isPassed ? ` مع تحديث تاريخ البداية تلقائياً من (${period.startDate}) إلى (${effectiveStartDate})` : ''}`,
        summaryEn: `Activated draft to active status${isPassed ? ` with start date auto-updated from (${period.startDate}) to (${effectiveStartDate})` : ''}`,
        status: 'active',
        changes: {
          metadata: [
            { field: 'status', labelAr: 'الحالة', labelEn: 'Status', oldValue: 'draft', newValue: 'active' },
            ...(isPassed ? [{ field: 'startDate', labelAr: 'تاريخ البداية', labelEn: 'Start Date', oldValue: period.startDate, newValue: effectiveStartDate }] : [])
          ],
          priceChanges: []
        }
      };

      batch.update(doc(db, 'price_lists', period.id), {
        status: 'active',
        startDate: effectiveStartDate,
        autoClosedPeriodId: activeOverlapping ? activeOverlapping.id : null,
        auditTrail: [...(period.auditTrail || []), activateAudit],
        updatedBy: currentUserName,
        updatedById: currentUserId,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      setActiveActionsMenuId(null);
    } catch (err) {
      console.error('Error activating draft period:', err);
      alert(isAr ? 'حدث خطأ أثناء تفعيل الفترة' : 'Error activating period');
    }
  };

  const handleDeletePeriod = async (periodId) => {
    try {
      await deleteDoc(doc(db, 'price_lists', periodId));
      setDeleteConfirmPeriod(null);
    } catch (e) {
      console.error('Error deleting price list period:', e);
      alert(isAr ? 'تعذر حذف فترة الأسعار' : 'Failed to delete period');
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-slate-400 text-xs font-semibold">
              {isAr ? 'فترات أسعار نشطة حالياً' : 'Active Price Periods'}
            </span>
            <span className="text-xl font-black text-slate-800">{kpis.active}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-slate-400 text-xs font-semibold">
              {isAr ? 'حملات عروض ترويجية' : 'Promotional Campaigns'}
            </span>
            <span className="text-xl font-black text-slate-800">{kpis.promo}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-slate-400 text-xs font-semibold">
              {isAr ? 'مسودات قيد الإعداد' : 'Draft Lists'}
            </span>
            <span className="text-xl font-black text-slate-800">{kpis.drafts}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-slate-400 text-xs font-semibold">
              {isAr ? 'فترات سارية حتى إشعار آخر' : 'Open-Ended Lists'}
            </span>
            <span className="text-xl font-black text-slate-800">{kpis.indefinite}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-slate-400 text-xs font-semibold">
              {isAr ? 'أصناف تامة في الكتالوج' : 'Finished Goods Catalog'}
            </span>
            <span className="text-xl font-black text-slate-800">{products.length}</span>
          </div>
        </div>
      </div>

      {/* Main Control Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث بالكود، العميل، الاستراتيجية، أو الملاحظات...' : 'Search code, client, strategy...'}
              className="w-full ps-9 pe-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Non-prominent Strategies Configuration Button */}
            <button
              type="button"
              onClick={() => setIsStratModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title={isAr ? 'تخصيص استراتيجيات وبطاقات التسعير' : 'Configure Pricing Strategies'}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>{isAr ? 'إعداد الاستراتيجيات' : 'Strategies'}</span>
            </button>

            {/* Primary New Period Button */}
            <button
              type="button"
              onClick={handleOpenNewPeriod}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة فترة أسعار جديدة' : 'New Price Period'}</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Client Filter (SearchableSelect) */}
          <div className="flex items-center gap-1.5 w-56 sm:w-64 min-w-0 shrink-0">
            <span className="text-slate-400 font-bold shrink-0">{isAr ? 'العميل:' : 'Client:'}</span>
            <div className="flex-1 min-w-0">
              <SearchableSelect
                value={clientFilter}
                onChange={(val) => setClientFilter(val || 'all')}
                options={filterClientOptions}
                placeholder={isAr ? 'جميع العملاء (كافة النطاقات)' : 'All Clients / Scopes'}
                isAr={isAr}
                className="w-full text-xs font-bold"
                emptyText={isAr ? 'لا يوجد عميل مطابق' : 'No matching client'}
              />
            </div>
          </div>

          {/* Strategy Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold">{isAr ? 'الاستراتيجية:' : 'Strategy:'}</span>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع الاستراتيجيات' : 'All Strategies'}</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {isAr ? s.nameAr : s.nameEn}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold">{isAr ? 'النوع:' : 'Type:'}</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">{isAr ? 'رسمي وعروض' : 'All Types'}</option>
              <option value="official">{isAr ? 'رسمي (Official)' : 'Official'}</option>
              <option value="promotional">{isAr ? 'عرض ترويجي (Promotional)' : 'Promotional'}</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold">{isAr ? 'الحالة:' : 'Status:'}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="active">{isAr ? 'ساري حالياً' : 'Active Now'}</option>
              <option value="draft">{isAr ? 'مسودات قيد الإعداد' : 'Drafts'}</option>
              <option value="upcoming">{isAr ? 'مستقبلي' : 'Upcoming'}</option>
              <option value="expired">{isAr ? 'منتهي ومغلق' : 'Expired / Closed'}</option>
            </select>
          </div>

          {(clientFilter !== 'all' || strategyFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setClientFilter('all');
                setStrategyFilter('all');
                setTypeFilter('all');
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="ms-auto text-rose-600 hover:text-rose-800 text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Master Periods Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-bold text-xs">
            {isAr ? 'جاري تحميل قوائم وفترات الأسعار...' : 'Loading price lists...'}
          </div>
        ) : filteredPeriods.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <BadgeDollarSign className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-slate-500 font-bold text-xs">
              {isAr ? 'لا توجد فترات أسعار تطابق معايير البحث' : 'No matching price periods found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-4 text-start">{isAr ? 'كود الفترة والاستراتيجية' : 'Code & Strategy'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'نطاق التطبيق (العميل / الفروع)' : 'Scope & Target'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'نوع الفترة' : 'Type'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'صلاحية الفترة' : 'Validity'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'الأصناف المسعرة' : 'Priced Items'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPeriods.map((period) => {
                  const todayStr = formatDateKey(new Date());
                  const status = computePeriodStatus(period, todayStr);
                  const isSpecial = period.isSpecialPricing || period.strategyId === 'special_pricing';
                  const pricedCount = Object.keys(period.items || {}).length;

                  return (
                    <tr key={period.id} className="hover:bg-slate-50/70 transition">
                      {/* Code & Strategy */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-blue-700">
                              {period.id}
                            </span>
                            {period.auditTrail?.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setAuditModalPeriod(period)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded cursor-pointer transition"
                                title={isAr ? `عرض سجل التدقيق (${period.auditTrail.length} تعديلات)` : `View Audit Trail (${period.auditTrail.length} revisions)`}
                              >
                                <History className="w-3 h-3 text-indigo-600" />
                                <span>{period.auditTrail.length}</span>
                              </button>
                            )}
                          </div>
                          <PricingStrategyBadge
                            strategyId={period.strategyId}
                            strategies={strategies}
                            isAr={isAr}
                          />
                        </div>
                      </td>

                      {/* Scope (Client / Branches) */}
                      <td className="py-3.5 px-4 text-xs">
                        {isSpecial ? (
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>{period.clientName || period.clientId || 'عميل محدد'}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span>
                                {period.allBranches
                                  ? (isAr ? 'جميع فروع العميل' : 'All Branches')
                                  : (period.branchName || isAr ? 'فرع محدد' : 'Specific Branch')}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-600">
                              {isAr ? 'كتالوج عام (جميع عملاء الاستراتيجية)' : 'General Strategy Catalog'}
                            </span>
                            {clientFilter !== 'all' && (
                              <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 w-fit">
                                {isAr ? 'ينطبق على العميل عبر استراتيجيته الأساسية' : 'Applies to client via profile strategy'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {period.type === 'promotional' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <Zap className="w-3.5 h-3.5" />
                            <span>{isAr ? 'عرض ترويجي' : 'Promotional'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isAr ? 'أسعار رسمية' : 'Official Base'}</span>
                          </span>
                        )}
                      </td>

                      {/* Validity Dates */}
                      <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-slate-700 font-bold">
                            {isAr ? 'من:' : 'From:'} {period.startDate}
                          </span>
                          <span className={period.endDate ? 'text-slate-600' : 'text-emerald-700 font-bold'}>
                            {period.endDate
                              ? `${isAr ? 'إلى:' : 'To:'} ${period.endDate}`
                              : (isAr ? 'ساري حتى إشعار آخر' : 'Valid Indefinitely')}
                          </span>
                        </div>
                      </td>

                      {/* Priced Items Count */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                          <Boxes className="w-3.5 h-3.5 text-slate-400" />
                          <span>{pricedCount} {isAr ? 'صنف' : 'items'}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {status === 'draft' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <FileText className="w-3.5 h-3.5 text-amber-600" />
                            <span>{isAr ? 'مسودة' : 'Draft'}</span>
                          </span>
                        ) : status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>{isAr ? 'نشط حالياً' : 'Active'}</span>
                          </span>
                        ) : status === 'upcoming' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{isAr ? 'مستقبلي' : 'Upcoming'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{isAr ? 'منتهي ومغلق' : 'Closed'}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => handleActivateDraft(period)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                              title={isAr ? 'اعتماد وتفعيل المسودة الآن' : 'Activate draft now'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isAr ? 'تفعيل' : 'Activate'}</span>
                            </button>
                          )}

                          <div className="relative inline-block" data-period-menu>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeActionsMenuId === period.id) {
                                  setActiveActionsMenuId(null);
                                  setActionsMenuAnchor(null);
                                } else {
                                  setActiveActionsMenuId(period.id);
                                  setActionsMenuAnchor(e.currentTarget.getBoundingClientRect());
                                }
                              }}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                activeActionsMenuId === period.id
                                  ? 'bg-slate-900 text-white shadow-md'
                                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                              }`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Portal Actions Menu for Price Periods */}
      {activePeriodForMenu && actionsMenuAnchor && typeof document !== 'undefined' && createPortal(
        (() => {
          const menuWidth = 192; // w-48
          const menuHeight = 180;
          const spaceBelow = window.innerHeight - actionsMenuAnchor.bottom;
          const openUpward = spaceBelow < menuHeight && actionsMenuAnchor.top > spaceBelow;
          const top = openUpward
            ? Math.max(10, actionsMenuAnchor.top - menuHeight - 4)
            : actionsMenuAnchor.bottom + 4;
          let left = actionsMenuAnchor.right - menuWidth;
          if (left < 10) left = 10;
          if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;

          const period = activePeriodForMenu;
          const todayStr = formatDateKey(new Date());
          const status = computePeriodStatus(period, todayStr);

          return (
            <div
              data-period-menu
              style={{
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                width: `${menuWidth}px`,
                zIndex: 99999
              }}
              className="bg-white rounded-xl shadow-2xl border border-slate-200 py-1 text-xs font-bold text-slate-700 divide-y divide-slate-100 animate__animated animate__fadeIn animate__faster"
            >
              {status === 'draft' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveActionsMenuId(null);
                    setActionsMenuAnchor(null);
                    handleActivateDraft(period);
                  }}
                  className="w-full px-3 py-2 text-start hover:bg-emerald-50 text-emerald-800 flex items-center gap-2 cursor-pointer font-bold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isAr ? 'اعتماد وتفعيل المسودة' : 'Activate Draft'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveActionsMenuId(null);
                  setActionsMenuAnchor(null);
                  handleOpenEditPeriod(period);
                }}
                className="w-full px-3 py-2 text-start hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                <span>{isAr ? 'تعديل الأسعار والفترة' : 'Edit Prices'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveActionsMenuId(null);
                  setActionsMenuAnchor(null);
                  handleDuplicatePeriod(period);
                }}
                className="w-full px-3 py-2 text-start hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>{isAr ? 'تكرار كفترة جديدة' : 'Duplicate Period'}</span>
              </button>

              {/* Audit Trail History */}
              <button
                type="button"
                onClick={() => {
                  setAuditModalPeriod(period);
                  setActiveActionsMenuId(null);
                  setActionsMenuAnchor(null);
                }}
                className="w-full px-3 py-2 text-start hover:bg-indigo-50 text-indigo-800 flex items-center gap-2 cursor-pointer font-bold"
              >
                <History className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isAr ? 'سجل التدقيق والتعديلات' : 'Audit Trail History'}</span>
                {period.auditTrail?.length > 0 && (
                  <span className="ms-auto text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700">
                    {period.auditTrail.length}
                  </span>
                )}
              </button>

              {status === 'active' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveActionsMenuId(null);
                    setActionsMenuAnchor(null);
                    handleClosePeriodNow(period);
                  }}
                  className="w-full px-3 py-2 text-start hover:bg-amber-50 text-amber-800 flex items-center gap-2 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isAr ? 'إغلاق الفترة فوراً' : 'Close Period Now'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmPeriod(period);
                  setActiveActionsMenuId(null);
                  setActionsMenuAnchor(null);
                }}
                className="w-full px-3 py-2 text-start hover:bg-rose-50 text-rose-600 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'حذف الفترة' : 'Delete'}</span>
              </button>
            </div>
          );
        })(),
        document.body
      )}

      {/* Strategies Manager Modal */}
      <PricingStrategiesModal
        isOpen={isStratModalOpen}
        onClose={() => setIsStratModalOpen(false)}
        isAr={isAr}
        canManage={permissions?.canManagePricingStrategies !== false}
      />

      {/* Price List Editor Modal */}
      {isEditorModalOpen && (
        <PriceListEditorModal
          isOpen={isEditorModalOpen}
          onClose={() => {
            setIsEditorModalOpen(false);
            setEditingPeriod(null);
          }}
          editingPeriod={editingPeriod}
          strategies={strategies}
          products={products}
          productCategories={productCategories}
          clients={clients}
          allPriceLists={priceLists}
          isAr={isAr}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          onOpenAuditTrail={(p) => setAuditModalPeriod(p)}
        />
      )}

      {/* Price Period Audit Modal */}
      {auditModalPeriod && (
        <PricePeriodAuditModal
          isOpen={Boolean(auditModalPeriod)}
          onClose={() => setAuditModalPeriod(null)}
          period={auditModalPeriod}
          strategies={strategies}
          products={products}
          clients={clients}
          isAr={isAr}
        />
      )}

      {/* Delete Confirmation Alert */}
      {deleteConfirmPeriod && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="font-black text-slate-800 text-sm">
              {isAr ? 'تأكيد حذف فترة الأسعار؟' : 'Delete Price Period?'}
            </h4>
            <p className="text-xs text-slate-500">
              {isAr
                ? `هل أنت متأكد من حذف قائمة الأسعار (${deleteConfirmPeriod.id})؟`
                : `Are you sure you want to delete price period (${deleteConfirmPeriod.id})?`}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmPeriod(null)}
                className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleDeletePeriod(deleteConfirmPeriod.id)}
                className="px-4 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 cursor-pointer"
              >
                {isAr ? 'حذف نهائي' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * =========================================================================
 * PRICE LIST EDITOR MODAL (Product Grid + Reference Columns + Private Label Control)
 * =========================================================================
 */
function PriceListEditorModal({
  isOpen,
  onClose,
  editingPeriod,
  strategies,
  products,
  productCategories = [],
  clients,
  allPriceLists,
  isAr,
  currentUserName = 'مستخدم معتمد',
  currentUserId = 'usr_unknown',
  onOpenAuditTrail = null
}) {
  const [formData, setFormData] = useState({
    id: editingPeriod?.id || `PL-${Date.now().toString().slice(-6)}`,
    strategyId: editingPeriod?.strategyId || (strategies[0]?.id || 'wholesalers'),
    type: editingPeriod?.type || 'official', // 'official' | 'promotional'
    status: editingPeriod?.status || 'active', // 'active' | 'draft'
    clientId: editingPeriod?.clientId || '',
    branchId: editingPeriod?.branchId || '',
    allBranches: editingPeriod?.allBranches ?? true,
    startDate: editingPeriod?.startDate || formatDateKey(new Date()),
    endDate: editingPeriod?.endDate || '',
    notes: editingPeriod?.notes || '',
    items: editingPeriod?.items ? { ...editingPeriod.items } : {}
  });

  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [bulkPercentInput, setBulkPercentInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const selectedStrategy = strategies.find((s) => s.id === formData.strategyId);
  const isSpecialPricing = selectedStrategy?.isSpecialPricing || formData.strategyId === 'special_pricing';
  const selectedClient = clients.find((c) => c.id === formData.clientId);

  // Set of client IDs who currently have an active Special Pricing period
  const activeSpecialClientIds = useMemo(() => {
    const todayStr = formatDateKey(new Date());
    const ids = new Set();
    (allPriceLists || []).forEach((pl) => {
      if (
        (pl.isSpecialPricing || pl.strategyId === 'special_pricing') &&
        pl.clientId &&
        isPeriodActiveForDate(pl, todayStr)
      ) {
        ids.add(pl.clientId);
      }
    });
    return ids;
  }, [allPriceLists]);

  // Options for Special Pricing Client SearchableSelect
  // Prioritized: (1) Profile strategy = special_pricing -> (2) Active special pricing -> (3) Other strategies
  const clientOptions = useMemo(() => {
    const list = (clients || []).map((c) => {
      const isProfileSpecial = c.pricingStrategy === 'special_pricing';
      const hasActiveSpecial = activeSpecialClientIds.has(c.id);

      let rank = 3;
      let group = isAr ? 'عملاء باستراتيجيات تسعير أخرى' : 'Other Client Strategies';
      let badgeText = '';

      if (isProfileSpecial) {
        rank = 1;
        group = isAr ? '⭐ عملاء ملفهم الأساسي أسعار خاصة' : '⭐ Special Pricing Profile';
        badgeText = isAr ? 'ملف خاص' : 'Special Profile';
      } else if (hasActiveSpecial) {
        rank = 2;
        group = isAr ? '⚡ عملاء لديهم أسعار خاصة سارية حالياً' : '⚡ Active Special Pricing';
        badgeText = isAr ? 'عقد ساري' : 'Active Contract';
      }

      const clientName = c.tradeNameAr || c.name || c.tradeNameEn || c.id;

      // Strategy icon & color
      const clientStratId = c.pricingStrategy || 'wholesalers';
      const strat =
        strategies.find((s) => s.id === clientStratId) ||
        DEFAULT_PRICING_STRATEGIES.find((s) => s.id === clientStratId) || {
          id: clientStratId,
          nameAr: clientStratId,
          nameEn: clientStratId,
          color: '#64748b',
          icon: 'Tag'
        };
      const StratIcon = SEGMENT_ICON_MAP[strat.icon] || Tag;

      return {
        value: c.id,
        label: clientName,
        sublabel: c.code && c.code !== clientName ? c.code : '',
        icon: StratIcon,
        iconColor: strat.color || '#2563eb',
        iconTitle: `${isAr ? 'الاستراتيجية:' : 'Strategy:'} ${isAr ? strat.nameAr : strat.nameEn}`,
        group,
        badgeText,
        rank,
        nameForSort: clientName
      };
    });

    list.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.nameForSort.localeCompare(b.nameForSort, isAr ? 'ar' : 'en');
    });

    return list;
  }, [clients, activeSpecialClientIds, isAr]);

  // Combine categories from finished_product_categories collection and any inline on products
  const { availableCategories, categoryMap } = useMemo(() => {
    const map = {};
    const list = [];
    const seenKeys = new Set();

    // 1. From Firestore finished_product_categories
    (productCategories || []).forEach((cat) => {
      const key = cat.key || cat.id;
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      const label = isAr ? (cat.nameAr || cat.nameEn || key) : (cat.nameEn || cat.nameAr || key);
      map[key] = label;
      if (cat.id && !map[cat.id]) map[cat.id] = label;
      list.push({ key, label, sortOrder: Number(cat.sortOrder) || 99 });
    });

    // 2. Discover any uncategorized lines from products
    (products || []).forEach((p) => {
      const line = p.productionLine || p.categoryId || p.category;
      if (line && !seenKeys.has(line)) {
        seenKeys.add(line);
        map[line] = line;
        list.push({ key: line, label: line, sortOrder: 999 });
      }
    });

    list.sort((a, b) => a.sortOrder - b.sortOrder);
    return { availableCategories: list, categoryMap: map };
  }, [productCategories, products, isAr]);

  // Options for Finished Goods Product SearchableSelect
  const productOptions = useMemo(() => {
    const opts = [
      {
        value: '',
        label: isAr ? '📦 كافة الأصناف والمنتجات التامة' : 'All Finished Products',
        sublabel: ''
      }
    ];

    // Filter available products according to private label rules and category
    const available = (products || []).filter((p) => {
      const isPl = isProductPrivateLabel(p);
      if (!isSpecialPricing && isPl) return false;
      if (selectedCategory !== 'all') {
        const prodCat = p.productionLine || p.categoryId || p.category;
        if (prodCat !== selectedCategory) return false;
      }
      return true;
    });

    available.forEach((p) => {
      const catKey = p.productionLine || p.categoryId || p.category;
      const catLabel = categoryMap[catKey] || catKey || '';
      opts.push({
        value: p.id,
        label: p.nameAr || p.name || p.id,
        sublabel: p.id,
        group: catLabel
      });
    });

    return opts;
  }, [products, isSpecialPricing, selectedCategory, categoryMap, isAr]);

  const handleCategoryChange = (newCat) => {
    setSelectedCategory(newCat);
    if (newCat !== 'all' && selectedProductId) {
      const prod = products.find((p) => p.id === selectedProductId);
      const prodCat = prod?.productionLine || prod?.categoryId || prod?.category;
      if (prodCat !== newCat) {
        setSelectedProductId('');
      }
    }
  };

  // Detect overlapping period of the SAME type that will be auto-closed
  const overlappingPeriod = useMemo(() => {
    if (!formData.strategyId || !formData.startDate || !formData.type) return null;

    return allPriceLists.find((pl) => {
      // Exclude self if editing
      if (editingPeriod && pl.id === editingPeriod.id) return false;
      // Exclude drafts or expired
      if (pl.status === 'draft' || pl.status === 'expired') return false;
      // Must match strategy
      if (pl.strategyId !== formData.strategyId) return false;
      // Must match type (official vs promo)
      if (pl.type !== formData.type) return false;
      // If special pricing, must match client & branch
      if (isSpecialPricing) {
        if (pl.clientId !== formData.clientId) return false;
        if (formData.allBranches && !pl.allBranches) return false;
        if (!formData.allBranches && pl.branchId !== formData.branchId) return false;
      }
      // Check active on new startDate
      return isPeriodActiveForDate(pl, formData.startDate);
    });
  }, [formData, allPriceLists, editingPeriod, isSpecialPricing]);

  // Compute reference prices: active Official and Promotional prices
  const referencePrices = useMemo(() => {
    const todayStr = formatDateKey(new Date());
    const refOfficial = {};
    const refPromo = {};

    allPriceLists.forEach((pl) => {
      // Must match strategy (and client if special)
      if (pl.strategyId !== formData.strategyId) return false;
      if (isSpecialPricing && pl.clientId !== formData.clientId) return false;
      if (!isPeriodActiveForDate(pl, todayStr)) return;

      Object.entries(pl.items || {}).forEach(([pId, price]) => {
        if (pl.type === 'official' && !refOfficial[pId]) {
          refOfficial[pId] = price;
        } else if (pl.type === 'promotional' && !refPromo[pId]) {
          refPromo[pId] = price;
        }
      });
    });

    return { official: refOfficial, promotional: refPromo };
  }, [allPriceLists, formData.strategyId, formData.clientId, isSpecialPricing]);

  // Filter finished goods according to Private Label rule and search
  const visibleProducts = useMemo(() => {
    return products.filter((p) => {
      const isPl = isProductPrivateLabel(p);

      // STRICT RULE: Private label products cannot be priced on non-special-pricing lists
      if (!isSpecialPricing && isPl) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all') {
        const prodCat = p.productionLine || p.categoryId || p.category;
        if (prodCat !== selectedCategory) {
          return false;
        }
      }

      // Product Filter via SearchableSelect
      if (selectedProductId && p.id !== selectedProductId) {
        return false;
      }

      return true;
    });
  }, [products, isSpecialPricing, selectedCategory, selectedProductId]);

  const handlePriceChange = (productId, valStr) => {
    const next = { ...formData.items };
    if (valStr === '' || isNaN(valStr)) {
      delete next[productId];
    } else {
      next[productId] = Math.max(0, parseFloat(valStr));
    }
    setFormData({ ...formData, items: next });
  };

  const handleCopyCurrentOfficial = () => {
    const next = { ...formData.items };
    visibleProducts.forEach((p) => {
      if (referencePrices.official[p.id]) {
        next[p.id] = referencePrices.official[p.id];
      }
    });
    setFormData({ ...formData, items: next });
  };

  const handleApplyBulkPercent = () => {
    const pct = parseFloat(bulkPercentInput);
    if (isNaN(pct) || pct === 0) return;

    const multiplier = 1 + pct / 100;
    const next = { ...formData.items };

    visibleProducts.forEach((p) => {
      const currentVal = next[p.id] || referencePrices.official[p.id];
      if (currentVal && currentVal > 0) {
        next[p.id] = Math.round(currentVal * multiplier * 100) / 100;
      }
    });

    setFormData({ ...formData, items: next });
    setBulkPercentInput('');
  };

  // CSV Template Export
  const handleExportCsv = () => {
    const headers = ['Product_Code', 'Product_Name', 'Is_Private_Label', 'Current_Price'];
    const rows = visibleProducts.map((p) => [
      `"${p.id}"`,
      `"${p.nameAr || ''}"`,
      `"${isProductPrivateLabel(p) ? 'YES' : 'NO'}"`,
      formData.items[p.id] ?? ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price_list_template_${formData.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV Import
  const handleImportCsv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) return;

      const next = { ...formData.items };
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 4) {
          const code = parts[0].replace(/"/g, '').trim();
          const price = parseFloat(parts[3].replace(/"/g, '').trim());
          if (code && !isNaN(price) && price > 0) {
            next[code] = price;
          }
        }
      }
      setFormData((prev) => ({ ...prev, items: next }));
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveWithStatus = async (targetStatus = 'active') => {
    if (!formData.startDate) {
      setErrorMsg(isAr ? 'يرجى تحديد تاريخ بداية الفترة' : 'Start date is required');
      return;
    }

    // Promotional periods MUST have an end date
    if (formData.type === 'promotional' && !formData.endDate) {
      setErrorMsg(
        isAr
          ? 'يرجى تحديد تاريخ انتهاء الحملة الترويجية (تاريخ الانتهاء إلزامي لفترات العروض)'
          : 'End date is required for promotional periods'
      );
      return;
    }

    if (formData.endDate && formData.endDate < formData.startDate) {
      setErrorMsg(
        isAr
          ? 'تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ بداية الفترة'
          : 'End date cannot be earlier than start date'
      );
      return;
    }

    // Promotional price per item cannot be higher than official active price
    if (formData.type === 'promotional') {
      const invalidPromoItems = [];
      Object.entries(formData.items || {}).forEach(([pId, price]) => {
        const refOff = referencePrices.official[pId];
        if (refOff && refOff > 0 && typeof price === 'number' && price > refOff) {
          const prod = products.find((p) => p.id === pId);
          const prodName = prod?.nameAr || prod?.name || pId;
          invalidPromoItems.push(`(${prodName}: ${price} ج.م > الرسمي ${refOff} ج.م)`);
        }
      });

      if (invalidPromoItems.length > 0) {
        setErrorMsg(
          isAr
            ? `لا يمكن أن يكون سعر العرض الترويجي أعلى من السعر الرسمي النشط:\n${invalidPromoItems.slice(0, 3).join(', ')}${invalidPromoItems.length > 3 ? ` و ${invalidPromoItems.length - 3} أصناف أخرى` : ''}`
            : `Promotional price cannot exceed active official price: ${invalidPromoItems.slice(0, 3).join(', ')}`
        );
        return;
      }
    }

    if (isSpecialPricing && !formData.clientId) {
      setErrorMsg(isAr ? 'يرجى اختيار العميل لتسعير العقود الخاصة' : 'Please select client for special pricing');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const todayStr = formatDateKey(new Date());
      let effectiveStartDate = formData.startDate;

      // When moving to active state, if startDate has passed, auto-update to today
      if (targetStatus === 'active' && effectiveStartDate < todayStr) {
        effectiveStartDate = todayStr;
      }

      const batch = writeBatch(db);
      const periodRef = doc(db, 'price_lists', formData.id);

      // Check if updating an existing record in Firestore
      const isExistingDoc = Boolean(editingPeriod?.id && allPriceLists.some((pl) => pl.id === editingPeriod.id));

      // Auto-close overlapping active period ONLY when activating (targetStatus === 'active')
      let autoClosedId = null;
      if (targetStatus === 'active' && overlappingPeriod) {
        const startDateObj = new Date(effectiveStartDate);
        startDateObj.setDate(startDateObj.getDate() - 1);
        const dayBeforeStart = formatDateKey(startDateObj);

        const oldRef = doc(db, 'price_lists', overlappingPeriod.id);
        const autoCloseAudit = {
          id: `audit_${Date.now()}_autoclose`,
          timestamp: new Date().toISOString(),
          action: 'auto_closed',
          actionLabelAr: 'إغلاق تلقائي للتداخل',
          actionLabelEn: 'Auto Closed by Overlap',
          performedBy: currentUserName,
          performedById: currentUserId,
          summaryAr: `تم إغلاق الفترة تلقائياً بتاريخ (${dayBeforeStart}) نظراً لاعتماد فترة أحدث (${formData.id})`,
          summaryEn: `Auto-closed on (${dayBeforeStart}) due to activation of overlapping period (${formData.id})`,
          status: 'expired',
          changes: {
            metadata: [
              { field: 'endDate', labelAr: 'تاريخ الانتهاء', labelEn: 'End Date', oldValue: overlappingPeriod.endDate || null, newValue: dayBeforeStart }
            ],
            priceChanges: []
          }
        };

        batch.update(oldRef, {
          endDate: dayBeforeStart,
          auditTrail: [...(overlappingPeriod.auditTrail || []), autoCloseAudit],
          updatedBy: currentUserName,
          updatedById: currentUserId,
          updatedAt: serverTimestamp()
        });
        autoClosedId = overlappingPeriod.id;
      }

      const payload = {
        id: formData.id,
        strategyId: formData.strategyId,
        strategyNameAr: selectedStrategy?.nameAr || formData.strategyId,
        type: formData.type,
        status: targetStatus,
        isSpecialPricing,
        clientId: isSpecialPricing ? formData.clientId : null,
        clientName: isSpecialPricing ? (selectedClient?.tradeNameAr || selectedClient?.name || '') : null,
        branchId: isSpecialPricing && !formData.allBranches ? formData.branchId : null,
        branchName: isSpecialPricing && !formData.allBranches
          ? selectedClient?.branches?.find((b) => b.id === formData.branchId)?.nameAr || null
          : null,
        allBranches: Boolean(formData.allBranches),
        startDate: effectiveStartDate,
        endDate: formData.endDate || null,
        notes: (formData.notes || '').trim(),
        items: formData.items,
        autoClosedPeriodId: autoClosedId,
        updatedAt: serverTimestamp()
      };

      if (!isExistingDoc) {
        // Creation or saving a duplicate copy as new
        payload.createdBy = editingPeriod?.createdBy || currentUserName;
        payload.createdById = editingPeriod?.createdById || currentUserId;
        payload.createdAt = serverTimestamp();
        payload.updatedBy = currentUserName;
        payload.updatedById = currentUserId;

        const initialPricedItems = Object.entries(formData.items || {})
          .filter(([_, price]) => price !== '' && price !== undefined && price !== null && Number(price) > 0)
          .map(([pId, price]) => {
            const prod = products.find((p) => p.id === pId);
            return {
              productId: pId,
              productCode: prod?.code || pId,
              productNameAr: prod?.nameAr || prod?.name || pId,
              productNameEn: prod?.nameEn || prod?.name || pId,
              oldPrice: null,
              newPrice: Number(price),
              diff: Number(price),
              percentDiff: null
            };
          });

        const isDuplicate = Boolean(editingPeriod?.duplicatedFromId);
        const createAuditEntry = {
          id: `audit_${Date.now()}_create`,
          timestamp: new Date().toISOString(),
          action: isDuplicate ? 'duplicate_created' : 'create',
          actionLabelAr: isDuplicate ? 'حفظ نسخة مكررة' : 'إنشاء فترة جديدة',
          actionLabelEn: isDuplicate ? 'Saved Duplicate Period' : 'Created New Period',
          performedBy: currentUserName,
          performedById: currentUserId,
          summaryAr: isDuplicate
            ? `تم حفظ الفترة كنسخة مكررة من (${editingPeriod.duplicatedFromId}) بحالة [${targetStatus === 'draft' ? 'مسودة' : 'سارية'}] مع تسعير (${initialPricedItems.length}) صنف`
            : `تم إنشاء قائمة أسعار جديدة بحالة [${targetStatus === 'draft' ? 'مسودة' : 'سارية'}] مع تسعير (${initialPricedItems.length}) صنف`,
          summaryEn: isDuplicate
            ? `Saved duplicate period from (${editingPeriod.duplicatedFromId}) with status [${targetStatus}] and (${initialPricedItems.length}) priced finished goods`
            : `Created new price list with status [${targetStatus}] and (${initialPricedItems.length}) priced finished goods`,
          status: targetStatus,
          changes: {
            metadata: [
              { field: 'strategy', labelAr: 'الاستراتيجية', labelEn: 'Strategy', oldValue: null, newValue: selectedStrategy?.nameAr || formData.strategyId },
              { field: 'type', labelAr: 'نوع الفترة', labelEn: 'Type', oldValue: null, newValue: formData.type === 'official' ? (isAr ? 'رسمي' : 'Official') : (isAr ? 'عرض ترويجي' : 'Promotional') },
              { field: 'status', labelAr: 'الحالة', labelEn: 'Status', oldValue: null, newValue: targetStatus === 'draft' ? (isAr ? 'مسودة' : 'Draft') : (isAr ? 'سارية' : 'Active') },
              { field: 'startDate', labelAr: 'تاريخ البداية', labelEn: 'Start Date', oldValue: null, newValue: effectiveStartDate },
              { field: 'endDate', labelAr: 'تاريخ الانتهاء', labelEn: 'End Date', oldValue: null, newValue: formData.endDate || (isAr ? 'مستمر / غير محدد' : 'Indefinite') },
              ...(isSpecialPricing ? [{ field: 'client', labelAr: 'العميل المستهدف', labelEn: 'Target Client', oldValue: null, newValue: selectedClient?.tradeNameAr || selectedClient?.name || formData.clientId }] : []),
              ...(formData.notes ? [{ field: 'notes', labelAr: 'الملاحظات', labelEn: 'Notes', oldValue: null, newValue: formData.notes }] : [])
            ],
            priceChanges: initialPricedItems
          }
        };

        payload.auditTrail = editingPeriod?.auditTrail?.length
          ? [...editingPeriod.auditTrail, createAuditEntry]
          : [createAuditEntry];
      } else {
        // Editing existing period in Firestore
        payload.createdBy = editingPeriod.createdBy || currentUserName;
        payload.createdById = editingPeriod.createdById || currentUserId;
        payload.updatedBy = currentUserName;
        payload.updatedById = currentUserId;

        const metadataChanges = [];
        if (editingPeriod.strategyId !== formData.strategyId) {
          const oldStratName = strategies.find((s) => s.id === editingPeriod.strategyId)?.nameAr || editingPeriod.strategyId;
          const newStratName = selectedStrategy?.nameAr || formData.strategyId;
          metadataChanges.push({ field: 'strategy', labelAr: 'الاستراتيجية', labelEn: 'Strategy', oldValue: oldStratName, newValue: newStratName });
        }
        if (editingPeriod.type !== formData.type) {
          metadataChanges.push({
            field: 'type',
            labelAr: 'نوع الفترة',
            labelEn: 'Type',
            oldValue: editingPeriod.type === 'official' ? (isAr ? 'رسمي' : 'Official') : (isAr ? 'عرض ترويجي' : 'Promotional'),
            newValue: formData.type === 'official' ? (isAr ? 'رسمي' : 'Official') : (isAr ? 'عرض ترويجي' : 'Promotional')
          });
        }
        if (editingPeriod.status !== targetStatus) {
          metadataChanges.push({
            field: 'status',
            labelAr: 'الحالة',
            labelEn: 'Status',
            oldValue: editingPeriod.status === 'draft' ? (isAr ? 'مسودة' : 'Draft') : (isAr ? 'سارية' : 'Active'),
            newValue: targetStatus === 'draft' ? (isAr ? 'مسودة' : 'Draft') : (isAr ? 'سارية' : 'Active')
          });
        }
        if (editingPeriod.startDate !== effectiveStartDate) {
          metadataChanges.push({
            field: 'startDate',
            labelAr: 'تاريخ البداية',
            labelEn: 'Start Date',
            oldValue: editingPeriod.startDate,
            newValue: effectiveStartDate
          });
        }
        if ((editingPeriod.endDate || '') !== (formData.endDate || '')) {
          metadataChanges.push({
            field: 'endDate',
            labelAr: 'تاريخ الانتهاء',
            labelEn: 'End Date',
            oldValue: editingPeriod.endDate || (isAr ? 'مستمر / غير محدد' : 'Indefinite'),
            newValue: formData.endDate || (isAr ? 'مستمر / غير محدد' : 'Indefinite')
          });
        }
        if ((editingPeriod.clientId || '') !== (formData.clientId || '')) {
          const oldClient = clients.find((c) => c.id === editingPeriod.clientId)?.tradeNameAr || editingPeriod.clientId || (isAr ? 'عام' : 'None');
          const newClient = selectedClient?.tradeNameAr || formData.clientId || (isAr ? 'عام' : 'None');
          metadataChanges.push({
            field: 'client',
            labelAr: 'العميل المستهدف',
            labelEn: 'Target Client',
            oldValue: oldClient,
            newValue: newClient
          });
        }
        if (Boolean(editingPeriod.allBranches) !== Boolean(formData.allBranches) || (editingPeriod.branchId || '') !== (formData.branchId || '')) {
          const oldBranch = editingPeriod.allBranches ? (isAr ? 'كافة الفروع' : 'All Branches') : (editingPeriod.branchName || editingPeriod.branchId);
          const newBranch = formData.allBranches ? (isAr ? 'كافة الفروع' : 'All Branches') : (selectedClient?.branches?.find((b) => b.id === formData.branchId)?.nameAr || formData.branchId);
          metadataChanges.push({
            field: 'branch',
            labelAr: 'الفروع المستهدفة',
            labelEn: 'Target Branches',
            oldValue: oldBranch,
            newValue: newBranch
          });
        }
        if ((editingPeriod.notes || '').trim() !== (formData.notes || '').trim()) {
          metadataChanges.push({
            field: 'notes',
            labelAr: 'الملاحظات',
            labelEn: 'Notes',
            oldValue: editingPeriod.notes || '',
            newValue: formData.notes || ''
          });
        }

        // Price changes
        const priceChanges = [];
        const allItemKeys = new Set([
          ...Object.keys(editingPeriod.items || {}),
          ...Object.keys(formData.items || {})
        ]);

        allItemKeys.forEach((pId) => {
          const oldVal = editingPeriod.items?.[pId];
          const newVal = formData.items?.[pId];
          const numOld = (oldVal !== undefined && oldVal !== null && oldVal !== '') ? Number(oldVal) : null;
          const numNew = (newVal !== undefined && newVal !== null && newVal !== '') ? Number(newVal) : null;

          if (numOld !== numNew) {
            const prod = products.find((p) => p.id === pId);
            const diffVal = (numNew ?? 0) - (numOld ?? 0);
            let pctStr = null;
            if (numOld && numNew !== null) {
              const pct = ((numNew - numOld) / numOld) * 100;
              pctStr = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
            }
            priceChanges.push({
              productId: pId,
              productCode: prod?.code || pId,
              productNameAr: prod?.nameAr || prod?.name || pId,
              productNameEn: prod?.nameEn || prod?.name || pId,
              oldPrice: numOld,
              newPrice: numNew,
              diff: Number(diffVal.toFixed(2)),
              percentDiff: pctStr
            });
          }
        });

        if (metadataChanges.length > 0 || priceChanges.length > 0) {
          const editAudit = {
            id: `audit_${Date.now()}_edit`,
            timestamp: new Date().toISOString(),
            action: 'edit',
            actionLabelAr: 'تعديل الأسعار والبيانات',
            actionLabelEn: 'Edited Prices & Details',
            performedBy: currentUserName,
            performedById: currentUserId,
            summaryAr: `تم تحديث الفترة: تعديل أسعار (${priceChanges.length}) صنف وتحديث (${metadataChanges.length}) حقول بيانات`,
            summaryEn: `Updated period: modified prices for (${priceChanges.length}) products and (${metadataChanges.length}) metadata fields`,
            status: targetStatus,
            changes: {
              metadata: metadataChanges,
              priceChanges
            }
          };
          payload.auditTrail = [...(editingPeriod.auditTrail || []), editAudit];
        } else {
          payload.auditTrail = editingPeriod.auditTrail || [];
        }
      }

      batch.set(periodRef, payload, { merge: true });
      await batch.commit();

      onClose();
    } catch (err) {
      console.error('Error saving price list period:', err);
      setErrorMsg(isAr ? 'حدث خطأ أثناء حفظ قائمة الأسعار' : 'Error saving price period');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] animate__animated animate__fadeInUp animate__faster">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <BadgeDollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                  {formData.id}
                </span>
                <h3 className="text-base font-black">
                  {editingPeriod
                    ? (isAr ? 'تعديل فترة وأسعار المنتجات' : 'Edit Price List Period')
                    : (isAr ? 'إنشاء فترة أسعار جديدة' : 'New Price List Period')}
                </h3>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {isAr ? 'تحديد نطاق التطبيق، الفترات الزمنية، وجدول أسعار المنتجات التامة' : 'Configure strategy, dates, and finished goods prices'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {editingPeriod?.id && onOpenAuditTrail && (
              <button
                type="button"
                onClick={() => onOpenAuditTrail(editingPeriod)}
                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/20"
                title={isAr ? 'عرض سجل تدقيق وتعديلات هذه الفترة' : 'View period audit trail'}
              >
                <History className="w-3.5 h-3.5 text-indigo-300" />
                <span>{isAr ? 'سجل التدقيق' : 'Audit Trail'}</span>
                {editingPeriod.auditTrail?.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/40 text-[10px]">
                    {editingPeriod.auditTrail.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Form & Matrix Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveWithStatus(formData.status || 'active');
          }}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          {errorMsg && (
            <div className="mx-6 mt-4 p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 shrink-0">
              {errorMsg}
            </div>
          )}

          {/* Overlapping Period Auto-Close Alert */}
          {overlappingPeriod && (
            <div className="mx-6 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2.5 shrink-0 animate__animated animate__fadeIn">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isAr
                  ? `تنبيه: توجد فترة نشطة حالياً لنفس الاستراتيجية والنوع (${overlappingPeriod.id} - من ${overlappingPeriod.startDate}). عند الاعتماد والتفعيل، سيتم إغلاقها تلقائياً بيوم يسبق بداية الفترة الجديدة (لن تتأثر في حالة الحفظ كمسودة).`
                  : `Notice: Existing active period (${overlappingPeriod.id}) will be automatically closed prior to this period's start date when activated (drafts will not close active periods).`}
              </span>
            </div>
          )}

          {/* Configuration Parameters Ribbon */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs shrink-0">
            {/* 1. Strategy Selector */}
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                {isAr ? 'استراتيجية التسعير *' : 'Strategy *'}
              </label>
              <select
                value={formData.strategyId}
                onChange={(e) => setFormData({ ...formData, strategyId: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isAr ? s.nameAr : s.nameEn} {s.isSpecialPricing ? (isAr ? '⭐ (أسعار خاصة)' : '⭐ (Special)') : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Period Type (Official vs Promo) */}
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                {isAr ? 'نوع الفترة *' : 'Period Type *'}
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-white border border-slate-200 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'official' })}
                  className={`py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    formData.type === 'official'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'رسمي' : 'Official'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'promotional' })}
                  className={`py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    formData.type === 'promotional'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عرض' : 'Promo'}</span>
                </button>
              </div>
            </div>

            {/* 3. Start Date */}
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                {isAr ? 'تاريخ البداية (ساري من) *' : 'Start Date *'}
              </label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 4. End Date (Optional for official, Strictly Required for promotional) */}
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                {formData.type === 'promotional'
                  ? (isAr ? 'تاريخ الانتهاء (إلزامي للعروض) *' : 'End Date (Required for Promo) *')
                  : (isAr ? 'تاريخ الانتهاء (اختياري)' : 'End Date (Optional)')}
              </label>
              <input
                type="date"
                required={formData.type === 'promotional'}
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                placeholder={isAr ? 'ساري حتى إشعار آخر' : 'Valid indefinitely'}
                className={`w-full px-3 py-1.5 bg-white border rounded-xl font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 ${
                  formData.type === 'promotional' && !formData.endDate
                    ? 'border-rose-300 focus:ring-rose-500 bg-rose-50/20'
                    : 'border-slate-200 focus:ring-blue-500'
                }`}
              />
              <span
                className={`block text-[10px] mt-0.5 ${
                  formData.type === 'promotional' ? 'text-rose-600 font-semibold' : 'text-slate-400'
                }`}
              >
                {formData.type === 'promotional'
                  ? (isAr ? 'حملات العروض الترويجية تتطلب تحديد تاريخ انتهاء' : 'Promotional campaigns require an end date')
                  : (isAr ? 'اتركه فارغاً للسريان حتى إشعار آخر' : 'Leave empty for indefinite validity')}
              </span>
            </div>
          </div>

          {/* Special Pricing Target Client & Branch Selector */}
          {isSpecialPricing && (
            <div className="p-3 bg-purple-50/50 border-b border-purple-100 flex flex-wrap items-center gap-3 text-xs shrink-0">
              <div className="flex items-center gap-1 text-purple-900 font-bold shrink-0">
                <Building2 className="w-4 h-4 text-purple-600" />
                <span>{isAr ? 'العميل المستهدف بالأسعار الخاصة:' : 'Target Special Client:'}</span>
              </div>

              {/* Client SearchableSelect with Tier Prioritization */}
              <div className="w-72 sm:w-80">
                <SearchableSelect
                  value={formData.clientId}
                  onChange={(val) => setFormData({ ...formData, clientId: val, branchId: '' })}
                  options={clientOptions}
                  placeholder={isAr ? '🔍 ابحث عن العميل بالاسم أو الكود...' : 'Search client by name or code...'}
                  isAr={isAr}
                  required={isSpecialPricing}
                  emptyText={isAr ? 'لا يوجد عميل مطابق' : 'No matching client'}
                />
              </div>

              {/* Branch Scope Radio */}
              {selectedClient && (
                <div className="flex items-center gap-3 ms-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                    <input
                      type="radio"
                      name="branchScope"
                      checked={formData.allBranches}
                      onChange={() => setFormData({ ...formData, allBranches: true, branchId: '' })}
                      className="text-purple-600 focus:ring-0"
                    />
                    <span>{isAr ? 'جميع الفروع' : 'All Branches'}</span>
                  </label>

                  <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-slate-700">
                    <input
                      type="radio"
                      name="branchScope"
                      checked={!formData.allBranches}
                      onChange={() => setFormData({ ...formData, allBranches: false })}
                      className="text-purple-600 focus:ring-0"
                    />
                    <span>{isAr ? 'فرع محدد' : 'Specific Branch'}</span>
                  </label>

                  {!formData.allBranches && (
                    <select
                      value={formData.branchId}
                      onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                      className="px-2.5 py-1 bg-white border border-purple-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                    >
                      <option value="">{isAr ? '-- اختر الفرع --' : '-- Select Branch --'}</option>
                      {(selectedClient.branches || []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nameAr || b.nameEn} {b.region ? `(${b.region})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Matrix Toolbar (Search, Filter, Batch Tools) */}
          <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              {/* Product SearchableSelect */}
              <div className="w-72 sm:w-80">
                <SearchableSelect
                  value={selectedProductId}
                  onChange={(val) => setSelectedProductId(val)}
                  options={productOptions}
                  placeholder={isAr ? '🔍 كافة الأصناف والمنتجات التامة...' : 'All Finished Products...'}
                  isAr={isAr}
                  emptyText={isAr ? 'لا يوجد منتج مطابق' : 'No matching product'}
                />
              </div>

              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 text-xs focus:outline-none cursor-pointer"
              >
                <option value="all">{isAr ? 'جميع التصنيفات' : 'All Categories'}</option>
                {availableCategories.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Acceleration Tools */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Copy Current Official Button */}
              <button
                type="button"
                onClick={handleCopyCurrentOfficial}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer text-xs"
                title={isAr ? 'نسخ الأسعار الرسمية الحالية لجميع المنتجات' : 'Copy current official prices'}
              >
                <Copy className="w-3.5 h-3.5 text-blue-600" />
                <span>{isAr ? 'نسخ الرسمي' : 'Copy Official'}</span>
              </button>

              {/* Bulk % Adjustment */}
              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl">
                <Percent className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="number"
                  step="0.5"
                  value={bulkPercentInput}
                  onChange={(e) => setBulkPercentInput(e.target.value)}
                  placeholder="+5 / -10"
                  className="w-16 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-center font-mono font-bold text-xs"
                />
                <button
                  type="button"
                  onClick={handleApplyBulkPercent}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs cursor-pointer"
                >
                  {isAr ? 'تطبيق %' : 'Apply %'}
                </button>
              </div>

              {/* Export CSV Template */}
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer text-xs"
                title={isAr ? 'تصدير جدول الأسعار كقالب Excel/CSV' : 'Export CSV'}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isAr ? 'تصدير' : 'Export'}</span>
              </button>

              {/* Import CSV */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer text-xs"
                title={isAr ? 'استيراد الأسعار من ملف CSV' : 'Import CSV'}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isAr ? 'استيراد' : 'Import'}</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportCsv}
                accept=".csv"
                className="hidden"
              />
            </div>
          </div>

          {/* Product Price Matrix Table (Scrollable Body) */}
          <div className="flex-1 overflow-y-auto min-h-[300px]">
            <table className="w-full text-start border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-2xs font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'كود الصنف' : 'Code'}</th>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'المنتج التام' : 'Finished Good'}</th>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'الملكية' : 'Brand'}</th>
                  <th className="py-2.5 px-3 text-end">{isAr ? 'الرسمي الحالي (مرجعي)' : 'Ref Official'}</th>
                  <th className="py-2.5 px-3 text-end">{isAr ? 'العرض الحالي (مرجعي)' : 'Ref Promo'}</th>
                  <th className="py-2.5 px-4 text-center w-36 bg-blue-50/60 text-blue-900 border-x border-blue-200">
                    {isAr ? 'السعر الجديد (ج.م) *' : 'New Price (EGP) *'}
                  </th>
                  <th className="py-2.5 px-3 text-center">{isAr ? 'فرق السعر' : 'Variance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {visibleProducts.map((p) => {
                  const isPl = isProductPrivateLabel(p);
                  const newPrice = formData.items[p.id];
                  const refOff = referencePrices.official[p.id];
                  const refPro = referencePrices.promotional[p.id];

                  // Calculate variance vs official
                  let variancePct = null;
                  if (typeof newPrice === 'number' && refOff && refOff > 0) {
                    variancePct = Math.round(((newPrice - refOff) / refOff) * 100);
                  }

                  // Promotion price cannot be higher than official active price
                  const isPromoExceeding =
                    formData.type === 'promotional' &&
                    typeof newPrice === 'number' &&
                    refOff &&
                    refOff > 0 &&
                    newPrice > refOff;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      {/* Code */}
                      <td className="py-2 px-3 font-mono font-bold text-blue-700">
                        {p.id}
                      </td>

                      {/* Product Name */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{p.nameAr || p.name}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {p.nameEn && (
                              <span className="text-[10px] text-slate-400 font-semibold" dir="ltr">
                                {p.nameEn}
                              </span>
                            )}
                            {(p.productionLine || p.categoryId || p.category) && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                                {categoryMap[p.productionLine || p.categoryId || p.category] || (p.productionLine || p.categoryId || p.category)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Ownership / Private Label Badge */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {isPl ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                            <span>{isAr ? 'خاص / Private Label' : 'Private Label'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                            <span>{isAr ? 'علامة الطاووس' : 'Own Brand'}</span>
                          </span>
                        )}
                      </td>

                      {/* Ref Official Price */}
                      <td className="py-2 px-3 text-end font-mono text-slate-500">
                        {refOff ? `${refOff.toFixed(2)}` : '—'}
                      </td>

                      {/* Ref Promo Price */}
                      <td className="py-2 px-3 text-end font-mono text-rose-600">
                        {refPro ? `${refPro.toFixed(2)}` : '—'}
                      </td>

                      {/* New Price Input */}
                      <td className={`py-2 px-3 text-center border-x ${isPromoExceeding ? 'bg-rose-50/50 border-rose-300' : 'bg-blue-50/30 border-blue-200'}`}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newPrice ?? ''}
                          onChange={(e) => handlePriceChange(p.id, e.target.value)}
                          placeholder="0.00"
                          className={`w-28 px-2 py-1 bg-white border rounded-lg text-center font-mono font-black text-xs focus:outline-none focus:ring-2 shadow-2xs ${
                            isPromoExceeding
                              ? 'border-rose-500 text-rose-700 ring-1 ring-rose-400 focus:ring-rose-500'
                              : 'border-slate-300 text-blue-900 focus:ring-blue-500'
                          }`}
                        />
                        {isPromoExceeding && (
                          <span className="block text-[9px] text-rose-600 font-black mt-0.5 whitespace-nowrap animate-pulse">
                            {isAr ? '⚠️ أعلى من الرسمي!' : '⚠️ Exceeds official!'}
                          </span>
                        )}
                      </td>

                      {/* Variance */}
                      <td className="py-2 px-3 text-center font-mono font-bold whitespace-nowrap">
                        {variancePct !== null ? (
                          variancePct === 0 ? (
                            <span className="text-slate-400">0%</span>
                          ) : variancePct > 0 ? (
                            <span className={isPromoExceeding ? 'text-rose-600 font-black' : 'text-emerald-600'}>
                              {isPromoExceeding ? `⚠️ +${variancePct}%` : `+${variancePct}%`}
                            </span>
                          ) : (
                            <span className="text-rose-600">{variancePct}%</span>
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
              <span>{isAr ? 'الأصناف المسعرة:' : 'Priced Products:'}</span>
              <span className="font-mono font-bold text-slate-800">
                {Object.keys(formData.items).length} / {visibleProducts.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveWithStatus('draft')}
                className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-amber-600" />
                <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'حفظ كمسودة' : 'Save as Draft'}</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveWithStatus('active')}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSaving ? (isAr ? 'جاري الاعتماد...' : 'Activating...') : isAr ? 'اعتماد وتفعيل الفترة' : 'Activate Period'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
