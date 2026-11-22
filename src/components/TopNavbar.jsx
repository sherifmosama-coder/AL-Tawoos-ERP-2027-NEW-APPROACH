import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Home,
  ShoppingCart,
  Factory,
  TrendingUp,
  BadgeDollarSign,
  Users,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Package,
  Building2,
  ArrowDownLeft,
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  Wrench,
  FlaskConical,
  Cog,
  Layers,
  CheckCircle2,
  Scale,
  FileText,
  PanelLeft,
  Workflow,
  AlertOctagon,
  Activity,
  BarChart3,
  Database,
  FolderKanban,
  PackageCheck,
  Warehouse,
  Settings,
  Bell,
  CheckCheck,
  Clock,
  Sparkles,
  Check,
  X,
  BellRing,
  Share2,
  PlusSquare,
  Smartphone,
  AlertTriangle,
  Coins,
  Vault,
  UserCheck,
  Landmark,
  Truck,
  MessageSquare,
  Receipt,
  LogOut,
  Handshake
} from 'lucide-react';
import { HeaderPresencePill } from './UIUXComponents';
import { useRecordComments } from '../context/CommentContext';
import {
  getStoredTabConfigs,
  getIconComponent,
  hexToRgb
} from '../utils/tabAppearanceConfig';
import {
  highlightTargetRow,
  resolveModuleAndTab,
  formatStaticTriggerTime,
  reconcilePendingActions,
  playNotificationSound
} from '../utils/notificationEngine';
import { optInOneSignalPush, syncOneSignalDevicesWithFirestore } from '../utils/oneSignalEngine';

// =========================================================================
// MAIN TOP NAVBAR COMPONENT
// =========================================================================
export default function TopNavbar({
  activeModule,
  activeTab,
  onSelectModule,
  currentUser,
  testUsers,
  onSelectUser,
  onSignOut = null,
  effectivePermissions = null,
  isSidebarVisible = true,
  onToggleSidebarVisibility = () => {},
  headerAlerts = null
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [expandedTabId, setExpandedTabId] = useState(null);
  const [submenuFlip, setSubmenuFlip] = useState({ module: false, tab: false });
  const [tabConfigs, setTabConfigs] = useState(() => getStoredTabConfigs());
  const [showIosGuideModal, setShowIosGuideModal] = useState(false);
  const [permissionNoticeModal, setPermissionNoticeModal] = useState(null);
  const [isLinkingDevice, setIsLinkingDevice] = useState(false);
  const [deviceLinkFeedback, setDeviceLinkFeedback] = useState(null);
  const headerRef = useRef(null);
  const navContainerRef = useRef(null);

  // Collaborative Comments & Task Drawer Context
  let commentCtx = null;
  try {
    commentCtx = useRecordComments();
  } catch (_) {}
  const commentStats = commentCtx?.stats;
  const setIsCommentsDrawerOpen = commentCtx?.setIsDrawerOpen;

  useEffect(() => {
    const handleTabConfigUpdated = () => {
      setTabConfigs(getStoredTabConfigs());
    };
    window.addEventListener('app_tab_config_updated', handleTabConfigUpdated);
    return () => window.removeEventListener('app_tab_config_updated', handleTabConfigUpdated);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        closeAllMenus();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeAllMenus();
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const closeAllMenus = () => {
    setOpenDropdown(null);
    setExpandedModuleId(null);
    setExpandedTabId(null);
    setSubmenuFlip({ module: false, tab: false });
  };

  const handleNavigateToAction = (act) => {
    closeAllMenus();
    let targetMod = act.targetModule;
    let targetTab = act.targetTab;

    // Protective resolution: FG transfers always route to fg_inward in production
    if (
      act.actionType === 'fg_inward_verification' ||
      act.title?.includes('منتج تام') ||
      act.titleEn?.toLowerCase().includes('finished goods') ||
      act.titleEn?.toLowerCase().includes('fg inward')
    ) {
      targetMod = 'production';
      targetTab = 'fg_inward';
    }

    const { module, tab } = resolveModuleAndTab(targetMod, targetTab);
    if (onSelectModule) {
      onSelectModule(module, tab);
    }
    if (act.highlightId || act.docId) {
      highlightTargetRow(act.highlightId || act.docId);
    }
  };

  const handleNavigateToNotification = (notif) => {
    if (!notif.readBy || !notif.readBy.includes(currentUser?.id)) {
      headerAlerts?.markAsRead?.(notif.id);
    }
    closeAllMenus();
    if (notif.targetTab) {
      const { module, tab } = resolveModuleAndTab(notif.targetModule, notif.targetTab);
      if (onSelectModule) {
        onSelectModule(module, tab);
      }
      if (notif.highlightId) {
        highlightTargetRow(notif.highlightId);
      }
    }
  };

  const RAW_ERP_STRUCTURE = [
    {
      id: 'master_data',
      labelAr: 'قاعدة البيانات الأساسية',
      labelEn: 'Master Database',
      icon: Database,
      defaultTab: 'items',
      status: 'active',
      tabs: [
        { id: 'items', moduleKey: 'items', labelAr: 'كارت الأصناف والخامات', labelEn: 'Item Master', icon: Package },
        { id: 'suppliers', moduleKey: 'suppliers', labelAr: 'سجل الموردين المعتمدين', labelEn: 'Supplier Master', icon: Building2 },
        { id: 'clients', moduleKey: 'clients', labelAr: 'سجل العملاء المعتمدين', labelEn: 'Client Master', icon: UserCheck },
        { id: 'client_segments', moduleKey: 'client_segments', labelAr: 'تصنيفات وقطاعات العملاء', labelEn: 'Client Segments', icon: Layers },
        { id: 'categories', moduleKey: 'categories', labelAr: 'مجموعات وتصنيفات التكويد', labelEn: 'Raw Material Categories', icon: FolderKanban },
        { id: 'finished_products', moduleKey: 'finished_products', labelAr: 'سجل المنتجات التامة', labelEn: 'Finished Goods Master', icon: PackageCheck },
        { id: 'finished_product_categories', moduleKey: 'finished_product_categories', labelAr: 'تصنيفات ومجموعات المنتج التام', labelEn: 'FG Categories', icon: Boxes },
        { id: 'bom', moduleKey: 'bom', labelAr: 'تعبئة وتغليف المنتج التام (BOM)', labelEn: 'Packing & Filling BOM', icon: Layers },
        { id: 'intermediate_bom', moduleKey: 'intermediate_bom', labelAr: 'تصنيع الخامات الوسيطة (M)', labelEn: 'Intermediate BOM (M)', icon: FlaskConical },
        { id: 'production_processes', moduleKey: 'production_processes', labelAr: 'مسارات ومراحل التشغيل (SOP)', labelEn: 'Production Processes & SOPs', icon: Workflow },
        { id: 'warehouses', moduleKey: 'warehouses', labelAr: 'سجل المستودعات والصالات', labelEn: 'Warehouses Master', icon: Warehouse },
        { id: 'safes', moduleKey: 'safes', labelAr: 'سجل الخزائن والخزن النقدية', labelEn: 'Safes & Cash Vaults', icon: Vault },
        { id: 'bank_accounts', moduleKey: 'bank_accounts', labelAr: 'سجل الحسابات والودائع البنكية', labelEn: 'Bank Accounts Master', icon: Landmark },
        { id: 'vehicles', moduleKey: 'vehicles', labelAr: 'سجل أسطول الشاحنات والسيارات', labelEn: 'Vehicles & Fleet Master', icon: Truck },
        { id: 'departments', moduleKey: 'departments', labelAr: 'الأقسام وصلاحياتها', labelEn: 'Departments & Permissions', icon: Building2 },
        { id: 'employees', moduleKey: 'employees', labelAr: 'الموظفون والعمالة والمستخدمون', labelEn: 'Staff, Workers & Users', icon: Users },
        { id: 'system_config', moduleKey: 'system_config', labelAr: 'إعدادات وتهيئة النظام', labelEn: 'System Configuration', icon: Settings },
      ]
    },
    {
      id: 'purchases',
      labelAr: 'الخامات والمشتريات',
      labelEn: 'Materials & Procurement',
      icon: ShoppingCart,
      defaultTab: 'orders',
      status: 'active',
      tabs: [
        { id: 'orders', moduleKey: 'purchase_orders', labelAr: 'أوامر الشراء (PO)', labelEn: 'Purchase Orders', icon: ShoppingCart },
        { id: 'receipts', moduleKey: 'goods_receipts', labelAr: 'إذن استلام خامات (GRN)', labelEn: 'Goods Receipt', icon: ArrowDownLeft },
        { id: 'transfers', moduleKey: 'transfers', labelAr: 'تحويلات المخازن (TRN)', labelEn: 'Stock Transfers', icon: ArrowLeftRight },
        {
          id: 'stock',
          moduleKey: 'stock',
          labelAr: 'أرصدة المخازن وكارت الصنف',
          labelEn: 'Stock Balances',
          icon: Boxes,
          subtabs: [
            { id: 'matrix', labelAr: 'مصفوفة المخازن واللوتات', labelEn: 'Stock Matrix' },
            { id: 'kardex', labelAr: 'كارت حركة الصنف (Kardex)', labelEn: 'Kardex Ledger' },
          ]
        },
        {
          id: 'stock_count',
          moduleKey: 'stock_count',
          labelAr: 'الجرد والتسوية المخزنية',
          labelEn: 'Stock Count',
          icon: ClipboardCheck,
          subtabs: [
            { id: 'count_sheets', labelAr: 'شيتات الجرد الفعلي', labelEn: 'Physical Count' },
            { id: 'variances', labelAr: 'تسوية الفروقات والعجز', labelEn: 'Variance Audits' },
          ]
        },
        { id: 'spare_parts', moduleKey: 'spare_parts_issue', labelAr: 'صرف قطع الغيار والمستهلكات (X)', labelEn: 'Spare Parts Issue', icon: Wrench },
      ]
    },
    {
      id: 'production',
      labelAr: 'الإنتاج والتشغيل',
      labelEn: 'Production & Manufacturing',
      icon: Factory,
      defaultTab: 'work_orders',
      status: 'active',
      tabs: [
        {
          id: 'work_orders',
          moduleKey: 'work_orders',
          labelAr: 'أوامر التشغيل والإنتاج',
          labelEn: 'Work Orders',
          icon: Factory,
          subtabs: [
            { id: 'plan', labelAr: '١- إدارة وتوزيع خطة الإنتاج (Plan)', labelEn: '1. Production Plan Manager' },
            { id: 'today_prod', labelAr: '٢- تشغيل اليوم والبالتات (Today\'s Prod)', labelEn: '2. Today\'s Pallet Production' },
            { id: 'live_tracking', labelAr: '٣- المتابعة الحية للورديات (Live Tracking)', labelEn: '3. Live Shift Timeline' },
          ]
        },
        { id: 'liquid_tanks', moduleKey: 'liquid_tanks', labelAr: 'تشغيل وتانكات الخامات (M)', labelEn: 'Bulk Liquid Tanks (M)', icon: Cog },
        { id: 'liquid_storage', moduleKey: 'liquid_storage', labelAr: 'خزانات وتدفق السوائل (M)', labelEn: 'Floor Liquid Storage (M)', icon: Activity },
        { id: 'faulty_fg', moduleKey: 'faulty_fg', labelAr: 'مرتجعات ومعيب المنتج التام', labelEn: 'Faulty FG & Returns', icon: AlertOctagon },
        { id: 'fg_inward', moduleKey: 'fg_inward', labelAr: 'استلام المنتج التام', labelEn: 'Finished Goods Inward', icon: CheckCircle2 },
        { id: 'fg_balances', moduleKey: 'fg_balances', labelAr: 'أرصدة مخزون المنتج التام', labelEn: 'FG Stock Balances', icon: Boxes },
        { id: 'production_reports', moduleKey: 'production_reports', labelAr: 'تقارير الإنتاجية والأداء التنفيذي', labelEn: 'Production & Performance Reports', icon: BarChart3 },
      ]
    },
    {
      id: 'finance',
      labelAr: 'المالية والحسابات والسيولة',
      labelEn: 'Finance, Accounts & Treasury',
      icon: BadgeDollarSign,
      defaultTab: 'cash_safes',
      status: 'active',
      tabs: [
        {
          id: 'cash_safes',
          moduleKey: 'cash_safes',
          labelAr: 'الخزائن النقدية والعهد',
          labelEn: 'Cash Safes & Vaults',
          icon: Coins,
          subtabs: [
            { id: 'safes_hub', labelAr: 'الخزائن والنقدية', labelEn: 'Cash Safes & Vaults' },
            { id: 'custodies_advances', labelAr: 'سجل العهد والسلف', labelEn: 'Custodies & Advances' },
          ]
        },
        {
          id: 'banks',
          moduleKey: 'banks',
          labelAr: 'الحسابات البنكية والشيكات',
          labelEn: 'Bank Accounts & Cheques',
          icon: Landmark,
          subtabs: [
            { id: 'bank_list', labelAr: 'حسابات البنوك المعتمدة', labelEn: 'Bank Accounts' },
            { id: 'cheques_ledger', labelAr: 'حافظة الشيكات', labelEn: 'Cheques Ledger' },
            { id: 'bank_reconciliation', labelAr: 'مطابقة كشف الحساب', labelEn: 'Bank Reconciliation' },
          ]
        },
        {
          id: 'dues_tracking',
          moduleKey: 'dues_tracking',
          labelAr: 'متابعة الاستحقاقات والدفعات',
          labelEn: 'Dues & Installments Tracking',
          icon: Receipt,
          subtabs: [
            { id: 'suppliers', labelAr: 'استحقاقات ودفعات الموردين', labelEn: 'Suppliers Dues & Installments' },
            { id: 'clients', labelAr: 'استحقاقات وتحصيلات العملاء', labelEn: 'Clients Receivables & Dues' },
          ]
        },
        {
          id: 'party_statements',
          moduleKey: 'party_statements',
          labelAr: 'كشوف حسابات الموردين والعملاء',
          labelEn: 'Partner Statements',
          icon: FileText,
          subtabs: [
            { id: 'supplier', labelAr: 'كشوف حسابات الموردين', labelEn: 'Supplier Statements' },
            { id: 'client', labelAr: 'كشوف حسابات العملاء', labelEn: 'Client Statements' },
          ]
        },
        {
          id: 'accounts',
          moduleKey: 'accounts',
          labelAr: 'دليل الحسابات والأستاذ العام',
          labelEn: 'Chart of Accounts & GL',
          icon: BadgeDollarSign,
          subtabs: [
            { id: 'chart_tree', labelAr: 'شجرة الحسابات', labelEn: 'Accounts Tree' },
            { id: 'journal_vouchers', labelAr: 'قيود اليومية', labelEn: 'Journal Entries' },
            { id: 'trial_balance', labelAr: 'ميزان المراجعة', labelEn: 'Trial Balance' },
          ]
        },
        {
          id: 'financial_statements',
          moduleKey: 'financial_statements',
          labelAr: 'القوائم المالية والتقارير',
          labelEn: 'Financial Statements',
          icon: BarChart3,
          subtabs: [
            { id: 'income_statement', labelAr: 'قائمة الدخل (P&L)', labelEn: 'Income Statement' },
            { id: 'balance_sheet', labelAr: 'المركز المالي', labelEn: 'Balance Sheet' },
            { id: 'cash_flow', labelAr: 'التدفقات النقدية', labelEn: 'Cash Flow' },
          ]
        },
      ]
    },
    {
      id: 'sales',
      labelAr: 'المبيعات والتوزيع',
      labelEn: 'Sales & Distribution',
      icon: TrendingUp,
      defaultTab: 'sales_orders',
      tabs: [
        {
          id: 'sales_orders',
          moduleKey: 'sales_orders',
          labelAr: 'أوامر البيع والتوريد',
          labelEn: 'Sales Orders',
          icon: ShoppingCart,
        },
        {
          id: 'loading_plan',
          moduleKey: 'loading_plan',
          labelAr: 'خطة التحميل',
          labelEn: 'Loading Plan',
          icon: Truck,
        },
        {
          id: 'truck_dispatch',
          moduleKey: 'truck_dispatch',
          labelAr: 'تسليم واستلام الشاحنات',
          labelEn: 'Truck Dispatch & Receiving',
          icon: PackageCheck,
        },
        {
          id: 'price_lists',
          moduleKey: 'price_lists',
          labelAr: 'قوائم الأسعار',
          labelEn: 'Price Lists',
          icon: BadgeDollarSign,
        },
        {
          id: 'client_contracts',
          moduleKey: 'client_contracts',
          labelAr: 'عقود وخصومات العملاء',
          labelEn: 'Client Contracts',
          icon: Handshake,
        },
      ]
    },
    {
      id: 'hr',
      labelAr: 'الموارد البشرية',
      labelEn: 'Human Resources',
      icon: Users,
      defaultTab: 'employees',
      status: 'upcoming',
      tabs: []
    },
  ];

  const isTabPermitted = (tab) => {
    if (isGeneralAdmin) return true;
    if (!effectivePermissions?.modules) return true;
    const key = tab.moduleKey || tab.id;
    return effectivePermissions.modules[key] !== false;
  };

  const isModulePermitted = (mod) => {
    if (isGeneralAdmin) return true;
    if (currentUser?.allowedModules && currentUser.allowedModules.length > 0) {
      if (!currentUser.allowedModules.includes(mod.id)) return false;
    }
    return true;
  };

  const ERP_NAV_STRUCTURE = RAW_ERP_STRUCTURE
    .filter(isModulePermitted)
    .map((mod) => ({
      ...mod,
      tabs: (mod.tabs || [])
        .map((tab) => {
          const customConfig = tabConfigs[tab.id];
          if (customConfig) {
            return {
              ...tab,
              labelAr: customConfig.labelAr || tab.labelAr,
              labelEn: customConfig.labelEn || tab.labelEn,
              icon: customConfig.iconName ? getIconComponent(customConfig.iconName) : tab.icon,
              color: customConfig.color || '#059669',
              order: typeof customConfig.order === 'number' ? customConfig.order : 99,
            };
          }
          return { ...tab, color: '#059669', order: 99 };
        })
        .filter(isTabPermitted)
        .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99)),
    }))
    .filter((mod) => isGeneralAdmin || mod.status === 'upcoming' || mod.tabs.length > 0);

  const currentModuleObj = ERP_NAV_STRUCTURE.find((m) => m.id === activeModule) || ERP_NAV_STRUCTURE[0];
  const foundTab = currentModuleObj?.tabs?.find((t) => t.id === activeTab);
  const currentTabObj = foundTab || currentModuleObj?.tabs?.[0] || {
    id: activeTab,
    labelAr: tabConfigs[activeTab]?.labelAr || (isAr ? 'الشاشة الحالية' : 'Current View'),
    labelEn: tabConfigs[activeTab]?.labelEn || 'Current View',
    icon: tabConfigs[activeTab]?.iconName ? getIconComponent(tabConfigs[activeTab].iconName) : FileText,
    color: tabConfigs[activeTab]?.color || '#059669'
  };

  const ChevronSep = isAr ? ChevronLeft : ChevronRight;
  const SubmenuArrow = isAr ? ChevronLeft : ChevronRight;

  const checkBoundaryAndToggle = (e, id, type) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const requiredWidth = 270;

    let shouldFlip = false;
    if (isAr) {
      if (rect.left < requiredWidth) shouldFlip = true;
    } else {
      if (screenWidth - rect.right < requiredWidth) shouldFlip = true;
    }

    if (type === 'module') {
      setSubmenuFlip((prev) => ({ ...prev, module: shouldFlip }));
      setExpandedModuleId(expandedModuleId === id ? null : id);
    } else {
      setSubmenuFlip((prev) => ({ ...prev, tab: shouldFlip }));
      setExpandedTabId(expandedTabId === id ? null : id);
    }
  };

  return (
    <header ref={headerRef} className="bg-white text-slate-800 border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className="px-3 md:px-5 py-2.5 flex items-center justify-between gap-2 md:gap-4">
        {/* Left: Brand Logo & Interactive Hierarchical Breadcrumbs */}
        <div className="flex items-center gap-2.5 md:gap-4 min-w-0" ref={navContainerRef}>
          <button
            type="button"
            onClick={() => {
              closeAllMenus();
              onSelectModule('landing', 'landing');
            }}
            className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition shrink-0"
            title={isAr ? 'العودة للبوابة الرئيسية' : 'Return to ERP Hub'}
          >
            <img
              src="/logo.svg"
              alt="Al Tawoos Logo"
              onError={(e) => { e.currentTarget.src = '/logo-inverted.svg'; }}
              className="h-7 sm:h-8 md:h-9 w-auto max-w-[125px] sm:max-w-[160px] md:max-w-[185px] object-contain"
            />
          </button>

          {/* Sidebar Show/Hide Icon-Only Toggle (Desktop only, mobile has bottom dock) */}
          {activeTab !== 'landing' && activeTab !== 'admin_panel' && (
            <button
              type="button"
              onClick={onToggleSidebarVisibility}
              className={`hidden md:flex p-2 rounded-xl border transition cursor-pointer shrink-0 ${
                isSidebarVisible
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 shadow-xs'
              }`}
              title={isSidebarVisible ? (isAr ? 'إخفاء القائمة الجانبية' : 'Hide Sidebar') : (isAr ? 'إظهار القائمة الجانبية' : 'Show Sidebar')}
            >
              <PanelLeft className="h-4 w-4 text-emerald-600 shrink-0 rtl:rotate-180" />
            </button>
          )}

          {/* Breadcrumb Hierarchy */}
          <nav className="flex items-center gap-1 text-xs select-none">
            <button
              type="button"
              onClick={() => {
                closeAllMenus();
                onSelectModule('landing', 'landing');
              }}
              className={`items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold transition cursor-pointer border ${
                activeTab === 'landing'
                  ? 'flex bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                  : 'hidden sm:inline-flex bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-200'
              }`}
              title={isAr ? 'الصفحة الرئيسية' : 'Home Gateway'}
            >
              <Home className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">{isAr ? 'الرئيسية' : 'Home'}</span>
            </button>

            {activeTab !== 'landing' && currentModuleObj && (
              <>
                <ChevronSep className="h-3.5 w-3.5 text-slate-400 shrink-0 hidden sm:block" />

                {/* Level 2: Module Droplist */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(openDropdown === 'module' ? null : 'module');
                      setExpandedTabId(null);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold transition cursor-pointer border ${
                      openDropdown === 'module'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-800 border-slate-200'
                    }`}
                  >
                    <currentModuleObj.icon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate max-w-[110px] md:max-w-[160px]">
                      {isAr ? currentModuleObj.labelAr : currentModuleObj.labelEn}
                    </span>
                    <ChevronDown className={`h-3 w-3 text-slate-500 transition-transform duration-200 ${openDropdown === 'module' ? 'rotate-180' : ''}`} />
                  </button>

                  {openDropdown === 'module' && (
                    <div className="absolute top-full mt-2 start-0 z-60 w-64 max-w-[calc(100vw-24px)] bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 text-start space-y-0.5 animate-in fade-in zoom-in-95 duration-150 overflow-visible">
                      <div className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center justify-between">
                        <span>{isAr ? 'الوحدات التشغيلية' : 'Operational Modules'}</span>
                        <span className="text-[9px] font-mono text-emerald-600 font-bold">{ERP_NAV_STRUCTURE.length}</span>
                      </div>

                      <div className="space-y-0.5 overflow-visible">
                        {ERP_NAV_STRUCTURE.map((mod) => {
                          const ModIcon = mod.icon;
                          const isCurrent = mod.id === activeModule;
                          const isExpanded = expandedModuleId === mod.id;
                          const hasBranch = mod.tabs && mod.tabs.length > 0 && mod.status !== 'upcoming';
                          const isUpcoming = mod.status === 'upcoming';

                          return (
                            <div key={mod.id} className="relative">
                              <div
                                className={`flex items-center justify-between rounded-xl transition ${
                                  isCurrent
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : isUpcoming
                                    ? 'opacity-40 text-slate-400'
                                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                              >
                                <button
                                  type="button"
                                  disabled={isUpcoming}
                                  onClick={() => {
                                    if (!isUpcoming) {
                                      closeAllMenus();
                                      const userDefault = currentUser?.defaultModuleTabs?.[mod.id];
                                      const isUserDefaultPermitted = userDefault && mod.tabs?.some((t) => t.id === userDefault);
                                      const isModDefaultPermitted = mod.tabs?.some((t) => t.id === mod.defaultTab);

                                      // Resolved tab must be one of the permitted/visible tabs
                                      const resolvedTab = isUserDefaultPermitted
                                        ? userDefault
                                        : isModDefaultPermitted
                                        ? mod.defaultTab
                                        : mod.tabs?.[0]?.id || mod.defaultTab;

                                      onSelectModule(mod.id, resolvedTab);
                                    }
                                  }}
                                  className="flex-1 flex items-center gap-2 px-3 py-2 text-xs font-bold text-start truncate cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <ModIcon className={`h-4 w-4 ${isCurrent ? 'text-emerald-600' : 'text-slate-400'} shrink-0`} />
                                  <span className="truncate">{isAr ? mod.labelAr : mod.labelEn}</span>
                                </button>

                                {hasBranch && (
                                  <button
                                    type="button"
                                    onClick={(e) => checkBoundaryAndToggle(e, mod.id, 'module')}
                                    className="p-2 hover:bg-slate-200/80 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0"
                                    title={isAr ? 'عرض التبويبات' : 'Expand tabs'}
                                  >
                                    <SubmenuArrow className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'scale-125 text-emerald-600' : ''}`} />
                                  </button>
                                )}
                              </div>

                              {isExpanded && hasBranch && (
                                <>
                                  <div
                                    className={`hidden sm:block absolute top-0 ${
                                      submenuFlip.module
                                        ? (isAr ? 'start-full ms-2' : 'end-full me-2')
                                        : (isAr ? 'end-full me-2' : 'start-full ms-2')
                                    } z-70 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150`}
                                  >
                                    <div className="px-3 py-1.5 text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider border-b border-slate-100 mb-1">
                                      {isAr ? `تبويبات (${mod.labelAr})` : `${mod.labelEn} Tabs`}
                                    </div>
                                    <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
                                      {mod.tabs.map((tab) => {
                                        const TabIcon = tab.icon || FileText;
                                        const isTabActive = activeTab === tab.id;
                                        return (
                                          <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => {
                                              closeAllMenus();
                                              onSelectModule(mod.id, tab.id);
                                            }}
                                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer text-start ${
                                              isTabActive
                                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                            }`}
                                          >
                                            <TabIcon className={`h-3.5 w-3.5 ${isTabActive ? 'text-emerald-600' : 'text-slate-400'} shrink-0`} />
                                            <span className="truncate">{isAr ? tab.labelAr : tab.labelEn}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="sm:hidden mt-1 ps-3 border-s-2 border-emerald-500/40 space-y-0.5 bg-slate-50/80 p-1.5 rounded-xl animate-in fade-in duration-150">
                                    {mod.tabs.map((tab) => {
                                      const TabIcon = tab.icon || FileText;
                                      const isTabActive = activeTab === tab.id;
                                      return (
                                        <button
                                          key={tab.id}
                                          type="button"
                                          onClick={() => {
                                            closeAllMenus();
                                            onSelectModule(mod.id, tab.id);
                                          }}
                                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold transition text-start ${
                                            isTabActive ? 'bg-emerald-100 text-emerald-900 font-bold' : 'text-slate-700 hover:bg-slate-200/70'
                                          }`}
                                        >
                                          <TabIcon className={`h-3.5 w-3.5 ${isTabActive ? 'text-emerald-700' : 'text-slate-400'} shrink-0`} />
                                          <span className="truncate">{isAr ? tab.labelAr : tab.labelEn}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <ChevronSep className="h-3.5 w-3.5 text-slate-400 shrink-0 hidden sm:block" />

                {/* Level 3: Active Tab Droplist */}
                <div className="relative hidden sm:block">
                  {(() => {
                    const tabColor = currentTabObj.color || '#059669';
                    const { r, g, b } = hexToRgb(tabColor);
                    const isOpen = openDropdown === 'tab';

                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDropdown(isOpen ? null : 'tab');
                          setExpandedModuleId(null);
                        }}
                        style={{
                          background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, ${isOpen ? '0.18' : '0.12'}) 0%, rgba(${r}, ${g}, ${b}, 0.04) 100%)`,
                          borderColor: `rgba(${r}, ${g}, ${b}, ${isOpen ? '0.45' : '0.28'})`,
                          color: tabColor,
                          boxShadow: `0 2px 8px -2px rgba(${r}, ${g}, ${b}, 0.2)`
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold transition cursor-pointer border"
                      >
                        <currentTabObj.icon className="h-3.5 w-3.5 shrink-0" style={{ color: tabColor }} />
                        <span className="truncate max-w-[120px] md:max-w-[180px]">
                          {isAr ? currentTabObj.labelAr : currentTabObj.labelEn}
                        </span>
                        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: tabColor }} />
                      </button>
                    );
                  })()}

                  {openDropdown === 'tab' && (
                    <div className="absolute top-full mt-2 start-0 z-60 w-68 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 text-start space-y-0.5 animate-in fade-in zoom-in-95 duration-150 overflow-visible">
                      <div className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                        {isAr ? `تبويبات: ${currentModuleObj.labelAr}` : `${currentModuleObj.labelEn} Tabs`}
                      </div>

                      <div className="space-y-0.5 overflow-visible">
                        {(currentModuleObj.tabs || []).map((tab) => {
                          const TabIcon = tab.icon || FileText;
                          const isCurrent = tab.id === activeTab;
                          const tabColor = tab.color || '#059669';
                          const { r, g, b } = hexToRgb(tabColor);
                          const isExpanded = expandedTabId === tab.id;
                          const hasBranch = Boolean(tab.subtabs && tab.subtabs.length > 0);

                          return (
                            <div key={tab.id} className="relative">
                              <div
                                style={isCurrent ? {
                                  background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.14) 0%, rgba(${r}, ${g}, ${b}, 0.05) 100%)`,
                                  borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
                                  color: tabColor
                                } : undefined}
                                className={`flex items-center justify-between rounded-xl transition border ${
                                  isCurrent
                                    ? 'shadow-2xs font-bold'
                                    : 'border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    closeAllMenus();
                                    onSelectModule(activeModule, tab.id);
                                  }}
                                  className="flex-1 flex items-center gap-2 px-3 py-2 text-xs font-bold text-start truncate cursor-pointer"
                                >
                                  <TabIcon
                                    className="h-4 w-4 shrink-0 transition-colors"
                                    style={isCurrent ? { color: tabColor } : undefined}
                                  />
                                  <span className="truncate">{isAr ? tab.labelAr : tab.labelEn}</span>
                                </button>

                                {hasBranch && (
                                  <button
                                    type="button"
                                    onClick={(e) => checkBoundaryAndToggle(e, tab.id, 'tab')}
                                    className="p-2 hover:bg-slate-200/80 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0"
                                    title={isAr ? 'عرض الأقسام' : 'Expand sections'}
                                  >
                                    <SubmenuArrow className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'scale-125 text-emerald-600' : ''}`} />
                                  </button>
                                )}
                              </div>

                              {isExpanded && hasBranch && (
                                <>
                                  <div
                                    className={`hidden sm:block absolute top-0 ${
                                      submenuFlip.tab
                                        ? (isAr ? 'start-full ms-2' : 'end-full me-2')
                                        : (isAr ? 'end-full me-2' : 'start-full ms-2')
                                    } z-70 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150`}
                                  >
                                    <div className="px-3 py-1.5 text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider border-b border-slate-100 mb-1">
                                      {isAr ? 'الأقسام والوظائف' : 'Workspaces'}
                                    </div>
                                    <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
                                      {tab.subtabs.map((sub, sIdx) => (
                                        <button
                                          key={sub.id || sIdx}
                                          type="button"
                                          onClick={() => {
                                            closeAllMenus();
                                            if (tab.id === 'cash_safes') {
                                              if (sub.id === 'custodies_advances') {
                                                window.location.hash = 'cash_safes?module=finance&subTab=custodies';
                                              } else {
                                                window.location.hash = 'cash_safes?module=finance&subTab=SAFE-01&safeId=SAFE-01';
                                              }
                                            } else if (tab.id === 'dues_tracking') {
                                              window.location.hash = `dues_tracking?module=finance&subTab=${sub.id}`;
                                            } else if (tab.id === 'party_statements') {
                                              window.location.hash = `party_statements?module=finance&subTab=${sub.id}`;
                                            } else {
                                              onSelectModule(activeModule, tab.id);
                                            }
                                          }}
                                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-emerald-700 transition cursor-pointer text-start"
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                          <span className="truncate">{isAr ? sub.labelAr : sub.labelEn}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="sm:hidden mt-1 ps-3 border-s-2 border-emerald-500/40 space-y-0.5 bg-slate-50/80 p-1.5 rounded-xl animate-in fade-in duration-150">
                                    {tab.subtabs.map((sub, sIdx) => (
                                      <button
                                        key={sub.id || sIdx}
                                        type="button"
                                        onClick={() => {
                                          closeAllMenus();
                                          if (tab.id === 'cash_safes') {
                                            if (sub.id === 'custodies_advances') {
                                              window.location.hash = 'cash_safes?module=finance&subTab=custodies';
                                            } else {
                                              window.location.hash = 'cash_safes?module=finance&subTab=SAFE-01&safeId=SAFE-01';
                                            }
                                          } else if (tab.id === 'dues_tracking') {
                                            window.location.hash = `dues_tracking?module=finance&subTab=${sub.id}`;
                                          } else if (tab.id === 'party_statements') {
                                            window.location.hash = `party_statements?module=finance&subTab=${sub.id}`;
                                          } else {
                                            onSelectModule(activeModule, tab.id);
                                          }
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-200/70 hover:text-emerald-700 transition text-start"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                        <span className="truncate">{isAr ? sub.labelAr : sub.labelEn}</span>
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>

        {/* Right Side: Universal Database Refresh, Actions Required, Notifications, & Online Teammates Header Presence Pill */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1. Actions Required Button & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const next = openDropdown === 'actions' ? null : 'actions';
                setOpenDropdown(next);
                if (next === 'actions') {
                  reconcilePendingActions().catch(() => {});
                }
              }}
              className={`relative p-2 rounded-xl transition cursor-pointer border flex items-center justify-center min-w-[38px] min-h-[38px] ${
                openDropdown === 'actions'
                  ? 'bg-amber-500/10 border-amber-400 text-amber-700 shadow-xs'
                  : ((headerAlerts?.actionsBadgeCount || 0) > 0
                    ? 'bg-amber-50/80 hover:bg-amber-100 border-amber-200 text-amber-700'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-amber-600')
              }`}
              title={isAr ? 'الإجراءات والاعتمادات المطلوبة' : 'Actions Required'}
            >
              <ClipboardCheck className={`h-4.5 w-4.5 ${(headerAlerts?.actionsBadgeCount || 0) > 0 ? 'text-amber-600' : 'text-slate-500'}`} />
              {(headerAlerts?.actionsBadgeCount || 0) > 0 && (
                <span className="absolute -top-1.5 -end-1.5 min-w-[19px] h-[19px] px-1 bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-in zoom-in-75">
                  {(headerAlerts?.actionsBadgeCount || 0) > 99 ? '99+' : headerAlerts?.actionsBadgeCount}
                </span>
              )}
            </button>

            {/* Actions Popover Dropdown */}
            {openDropdown === 'actions' && (
              <>
                {/* Mobile Backdrop */}
                <div
                  className="fixed inset-0 bg-slate-900/25 backdrop-blur-2xs z-60 sm:hidden animate-in fade-in duration-150"
                  onClick={() => setOpenDropdown(null)}
                />
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="fixed inset-x-2.5 top-[58px] sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-96 sm:end-0 z-70 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                  {/* Header */}
                  <div className="px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="h-4.5 w-4.5" />
                      <span className="font-extrabold text-xs">
                        {isAr ? 'إجراءات واعتمادات مطلوبة منك' : 'Actions & Approvals Required'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-white/25 text-white font-black text-[10px] px-2 py-0.5 rounded-full">
                        {headerAlerts?.actionsBadgeCount || 0} {isAr ? 'معلق' : 'pending'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(null)}
                        className="sm:hidden p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition cursor-pointer"
                        title={isAr ? 'إغلاق' : 'Close'}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* List */}
                  <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-1">
                    {(!headerAlerts?.actionsQueue || headerAlerts.actionsQueue.length === 0) ? (
                      <div className="py-8 px-4 text-center">
                        <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                          <Check className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">
                          {isAr ? 'لا توجد إجراءات معلقة تتطلب اعتمادك' : 'No pending actions require your action'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isAr ? 'كافة المعاملات والتحويلات مستوفاة' : 'All transactions and handshakes are up to date'}
                        </p>
                      </div>
                    ) : (
                      headerAlerts.actionsQueue.map((act) => {
                        const title = isAr ? (act.title || act.titleEn) : (act.titleEn || act.title);
                        const message = isAr ? (act.message || act.messageEn) : (act.messageEn || act.message);
                        return (
                          <div
                            key={act.id}
                            className="w-full p-2.5 rounded-xl hover:bg-amber-50/70 border border-transparent hover:border-amber-200/80 transition group text-start block relative"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md truncate max-w-[160px]">
                                {act.docNumber || act.docId}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {formatStaticTriggerTime(act.createdAt, isAr)}
                                </span>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await headerAlerts?.completeAction?.(
                                      act.actionType,
                                      act.docId,
                                      isAr ? 'تم الإتمام يدوياً بواسطة المستخدم' : 'Manually resolved by user'
                                    );
                                  }}
                                  className="p-1 rounded-md bg-amber-100 hover:bg-emerald-600 hover:text-white text-amber-800 transition cursor-pointer flex items-center gap-0.5 text-[10px] font-bold shadow-2xs"
                                  title={isAr ? 'تحديد كمكتمل / إزالة من المعلق' : 'Mark as done / Unpin'}
                                >
                                  <Check className="h-3 w-3" />
                                  <span>{isAr ? 'تم' : 'Done'}</span>
                                </button>
                              </div>
                            </div>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNavigateToAction(act);
                              }}
                              className="cursor-pointer"
                            >
                              <div className="text-xs font-black text-slate-900 group-hover:text-amber-900 leading-snug">
                                {title}
                              </div>
                              {message && (
                                <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed font-medium">
                                  {message}
                                </p>
                              )}
                              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                                <span>
                                  {isAr ? `بطلب من: ${act.createdByName || 'النظام'}` : `By: ${act.createdByName || 'System'}`}
                                </span>
                                <span className="text-amber-600 font-bold group-hover:underline">
                                  {isAr ? 'انتقال للإجراء ←' : 'Go to action →'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2. Notifications Button & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'notifications' ? null : 'notifications')}
              className={`relative p-2 rounded-xl transition cursor-pointer border flex items-center justify-center min-w-[38px] min-h-[38px] ${
                openDropdown === 'notifications'
                  ? 'bg-emerald-500/10 border-emerald-400 text-emerald-700 shadow-xs'
                  : ((headerAlerts?.notificationsBadgeCount || 0) > 0
                    ? 'bg-emerald-50/80 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-emerald-600')
              }`}
              title={isAr ? 'الإشعارات' : 'Notifications'}
            >
              <Bell className={`h-4.5 w-4.5 ${(headerAlerts?.notificationsBadgeCount || 0) > 0 ? 'text-emerald-600' : 'text-slate-500'}`} />
              {(headerAlerts?.notificationsBadgeCount || 0) > 0 && (
                <span className="absolute -top-1.5 -end-1.5 min-w-[19px] h-[19px] px-1 bg-emerald-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-in zoom-in-75">
                  {(headerAlerts?.notificationsBadgeCount || 0) > 99 ? '99+' : headerAlerts?.notificationsBadgeCount}
                </span>
              )}
            </button>

            {/* Notifications Popover Dropdown */}
            {openDropdown === 'notifications' && (
              <>
                {/* Mobile Backdrop */}
                <div
                  className="fixed inset-0 bg-slate-900/25 backdrop-blur-2xs z-60 sm:hidden animate-in fade-in duration-150"
                  onClick={() => setOpenDropdown(null)}
                />
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="fixed inset-x-2.5 top-[58px] sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-96 sm:end-0 z-70 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                  {/* Header */}
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4.5 w-4.5" />
                      <span className="font-extrabold text-xs">
                        {isAr ? 'سجل الإشعارات والتنبيهات' : 'Notifications & Alerts'}
                      </span>
                      {(headerAlerts?.notificationsBadgeCount || 0) > 0 && (
                        <span className="bg-white/25 text-white font-black text-[10px] px-2 py-0.5 rounded-full">
                          {headerAlerts?.notificationsBadgeCount} {isAr ? 'جديد' : 'new'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(headerAlerts?.notificationsBadgeCount || 0) > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            headerAlerts?.markAllAsRead?.();
                          }}
                          className="text-[11px] font-bold text-white hover:text-emerald-100 underline decoration-white/60 cursor-pointer flex items-center gap-1"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          <span className="hidden xs:inline">{isAr ? 'تحديد الكل كمقروء' : 'Mark all read'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(null)}
                        className="sm:hidden p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition cursor-pointer"
                        title={isAr ? 'إغلاق' : 'Close'}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Enable Mobile Alerts Banner if not granted */}
                  {headerAlerts?.permissionStatus !== 'granted' && (
                    <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                          <BellRing className="h-4 w-4 animate-bounce" />
                        </div>
                        <div className="text-[11px] leading-tight">
                          <p className="font-extrabold text-emerald-950">
                            {isAr ? 'تفعيل تنبيهات الهاتف' : 'Enable Mobile Alerts'}
                          </p>
                          <p className="text-emerald-700 text-[10px]">
                            {isAr ? 'لتصلك الإشعارات والاعتمادات فوراً' : 'Receive instant alerts on your phone'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const res = await headerAlerts?.requestPermission?.();
                          if (!res?.success) {
                            if (res?.reason === 'ios_not_homescreen') {
                              setShowIosGuideModal(true);
                            } else if (res?.reason === 'insecure_origin') {
                              setPermissionNoticeModal({
                                type: 'insecure_origin',
                                title: isAr ? 'رابط مشفر مطلوب (HTTPS)' : 'HTTPS Connection Required',
                                body: isAr
                                  ? 'متصفحات الهواتف المحمولة ونظام iOS تمنع تفعيل الإشعارات عبر روابط http:// غير المشفرة. لتفعيل الإشعارات على هاتفك، يرجى فتح رابط الاستضافة الآمن (https://al-tawoos-erp.web.app).'
                                  : 'Mobile browsers and iOS require an encrypted HTTPS connection (such as https://al-tawoos-erp.web.app). Notifications cannot be enabled over plain http:// for browser security reasons.'
                              });
                            } else if (res?.reason === 'denied') {
                              setPermissionNoticeModal({
                                type: 'denied',
                                title: isAr ? 'تم حظر الإشعارات في المتصفح' : 'Notifications Blocked',
                                body: isAr
                                  ? 'تم حظر إشعارات الموقع في إعدادات متصفحك. لإعادة تفعيلها، توجه إلى إعدادات المتصفح في هاتفك واسمح بالإشعارات لهذا الموقع.'
                                  : 'Notifications are blocked in your browser settings. Please go to browser site settings and allow notifications.'
                              });
                            } else {
                              setShowIosGuideModal(true);
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shrink-0 transition cursor-pointer shadow-xs"
                      >
                        {isAr ? 'تفعيل الآن' : 'Enable'}
                      </button>
                    </div>
                  )}

                  {/* Link Device Banner if permission is granted but this persona token is not registered yet */}
                  {headerAlerts?.permissionStatus === 'granted' && !currentUser?.onesignalSubscriptionId && (
                    <div className="p-2.5 bg-blue-50 border-b border-blue-100 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                            <Smartphone className="h-4 w-4" />
                          </div>
                          <div className="text-[11px] leading-tight">
                            <p className="font-extrabold text-blue-950">
                              {isAr ? 'ربط هذا الجهاز بحسابك' : 'Link Device to Account'}
                            </p>
                            <p className="text-blue-700 text-[10px]">
                              {isAr ? 'لتصلك الإشعارات وشاشة الهاتف مقفلة' : 'To receive alerts when screen is locked'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isLinkingDevice}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setIsLinkingDevice(true);
                            setDeviceLinkFeedback(null);
                            try {
                              await optInOneSignalPush(currentUser);
                              await syncOneSignalDevicesWithFirestore();
                              setDeviceLinkFeedback(isAr ? '✓ تم ربط وتفعيل هذا الهاتف بنجاح!' : '✓ Device linked successfully!');
                              playNotificationSound();
                            } catch (err) {
                              setDeviceLinkFeedback(err.message);
                            } finally {
                              setIsLinkingDevice(false);
                              setTimeout(() => setDeviceLinkFeedback(null), 4000);
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold shrink-0 transition cursor-pointer shadow-xs flex items-center gap-1 disabled:opacity-50"
                        >
                          {isLinkingDevice ? <Sparkles className="h-3 w-3 animate-spin" /> : null}
                          <span>{isLinkingDevice ? (isAr ? 'جاري الربط...' : 'Linking...') : (isAr ? 'ربط الآن' : 'Link Now')}</span>
                        </button>
                      </div>
                      {deviceLinkFeedback && (
                        <p className="text-[10px] font-bold text-emerald-700 animate-in fade-in">
                          {deviceLinkFeedback}
                        </p>
                      )}
                    </div>
                  )}

                  {/* List */}
                  <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-1">
                    {(!headerAlerts?.notifications || headerAlerts.notifications.length === 0) ? (
                      <div className="py-8 px-4 text-center">
                        <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                          <Bell className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">
                          {isAr ? 'لا توجد إشعارات حالياً' : 'No notifications right now'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isAr ? 'ستظهر هنا كافة المستجدات والتحديثات' : 'System updates and alerts will appear here'}
                        </p>
                      </div>
                    ) : (
                      headerAlerts.notifications.map((notif) => {
                        const isUnread = !notif.readBy || !notif.readBy.includes(currentUser?.id);
                        const title = isAr ? (notif.title || notif.titleEn) : (notif.titleEn || notif.title);
                        const message = isAr ? (notif.message || notif.messageEn) : (notif.messageEn || notif.message);
                        return (
                          <button
                            key={notif.id}
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigateToNotification(notif);
                            }}
                            className={`w-full p-2.5 rounded-xl transition cursor-pointer text-start block ${
                              isUnread
                                ? 'bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100 font-semibold'
                                : 'hover:bg-slate-50 border border-transparent text-slate-600'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                  isUnread ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-transparent'
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="text-xs font-black text-slate-900 truncate">
                                    {title}
                                  </span>
                                  <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                                    {formatStaticTriggerTime(notif.createdAt, isAr)}
                                  </span>
                                </div>
                                {message && (
                                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                                    {message}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2.5 Global Collaborative Comments & Tasks Drawer Button */}
          {setIsCommentsDrawerOpen && (
            <button
              type="button"
              onClick={() => setIsCommentsDrawerOpen(true)}
              className="relative p-2 rounded-xl transition cursor-pointer border flex items-center justify-center min-w-[38px] min-h-[38px] bg-white hover:bg-emerald-50/80 border-slate-200 hover:border-emerald-200 text-slate-600 hover:text-emerald-700 shadow-2xs"
              title={isAr ? 'مركز المحادثات والمهام التعاونية (التعليقات)' : 'Collaborative Comments & Tasks'}
            >
              <MessageSquare className="h-4.5 w-4.5 text-slate-500 hover:text-emerald-600" />
              {((commentStats?.openCount || 0) > 0 || (commentStats?.actionRequiredForMe || 0) > 0) && (
                <span
                  className={`absolute -top-1.5 -end-1.5 min-w-[19px] h-[19px] px-1 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-in zoom-in-75 ${
                    (commentStats?.actionRequiredForMe || 0) > 0
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 ring-1 ring-amber-300'
                      : 'bg-emerald-600'
                  }`}
                >
                  {(commentStats?.actionRequiredForMe || 0) > 0
                    ? commentStats.actionRequiredForMe
                    : commentStats?.openCount > 99
                    ? '99+'
                    : commentStats?.openCount}
                </span>
              )}
            </button>
          )}

          {/* 3. Header User Persona Switcher (Admin Only) or Active User Badge */}
          {onSelectUser && testUsers && testUsers.length > 0 ? (
            <div className="flex items-center gap-1.5 bg-slate-100/90 hover:bg-slate-200/80 px-2 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs transition">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <select
                value={currentUser.id}
                onChange={(e) => onSelectUser(e.target.value)}
                className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer max-w-[130px] md:max-w-[160px] truncate"
                title={isAr ? 'تبديل المستخدم النشط' : 'Switch active user persona'}
              >
                {testUsers.map((u) => {
                  const displayName = isAr
                    ? (u.nameAr || u.name || u.id)
                    : (u.name || u.nameAr || u.id);
                  const roleBadge = u.isGeneralAdmin || u.role === 'general_admin'
                    ? (isAr ? 'مسؤول عام' : 'Admin')
                    : (isAr ? 'مستخدم' : 'User');
                  return (
                    <option key={u.id} value={u.id}>
                      {displayName} ({roleBadge})
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-100/90 px-2.5 py-1.5 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-800 max-w-[160px]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{isAr ? (currentUser.nameAr || currentUser.name) : (currentUser.name || currentUser.nameAr)}</span>
            </div>
          )}

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              title={isAr ? 'تسجيل الخروج' : 'Sign Out'}
              className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 border border-slate-200/80 transition cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}

          {/* 4. Online Teammates Header Presence Pill */}
          <HeaderPresencePill 
            onlineUsers={testUsers.filter((u) => u.id !== currentUser.id)} 
            currentUser={currentUser} 
            isAr={isAr} 
          />
        </div>
      </div>

      {/* iOS Safari Home Screen PWA Guide Modal */}
      {showIosGuideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-100 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-start animate-in zoom-in-95 duration-150 relative">
            <button
              type="button"
              onClick={() => setShowIosGuideModal(false)}
              className="absolute top-4 end-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <Smartphone className="h-6 w-6" />
            </div>

            <h3 className="text-base font-black text-slate-900 leading-snug">
              {isAr ? 'تفعيل الإشعارات على الآيفون (iOS)' : 'Enable iPhone Push (iOS)'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              {isAr
                ? 'تشترط شركة Apple لإرسال الإشعارات لهواتف الآيفون تثبيت التطبيق على الشاشة الرئيسية بخطوتين بسيطتين:'
                : 'Apple requires web apps to be added to the Home Screen to receive push notifications. Follow these 2 simple steps:'}
            </p>

            <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 mb-5 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0 text-xs">
                  ١
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-800 flex items-center gap-1.5">
                    <span>{isAr ? 'اضغط على زر المشاركة' : 'Tap the Share button'}</span>
                    <Share2 className="h-3.5 w-3.5 text-blue-600 inline" />
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr ? 'الموجود في الشريط السفلي لمتصفح Safari' : 'Located in Safari’s bottom toolbar'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0 text-xs">
                  ٢
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-800 flex items-center gap-1.5">
                    <span>{isAr ? 'إضافة إلى الشاشة الرئيسية' : 'Add to Home Screen'}</span>
                    <PlusSquare className="h-3.5 w-3.5 text-emerald-600 inline" />
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr ? 'ستظهر أيقونة الطاووس ERP بين تطبيقات هاتفك' : 'Tawoos ERP icon will appear on your iPhone screen'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0 text-xs">
                  ٣
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-800">
                    {isAr ? 'افتح التطبيق واضغط تفعيل' : 'Open the app and tap Enable'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr ? 'ستظهر لك رسالة السماح فوراً وسيعمل الرنين حتى لو الشاشة مقفلة' : 'Permission prompt will appear and alerts will ring even when locked'}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuideModal(false)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-md shadow-emerald-600/20"
            >
              {isAr ? 'فهمت، سأضيفه للشاشة الرئيسية' : 'Got it, I will add it to Home Screen'}
            </button>
          </div>
        </div>
      )}

      {/* General Permission Notice Modal (HTTPS / Denied) */}
      {permissionNoticeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-100 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-start animate-in zoom-in-95 duration-150 relative">
            <button
              type="button"
              onClick={() => setPermissionNoticeModal(null)}
              className="absolute top-4 end-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <h3 className="text-base font-black text-slate-900 leading-snug">
              {permissionNoticeModal.title}
            </h3>
            <p className="text-xs text-slate-600 mt-2 mb-5 leading-relaxed">
              {permissionNoticeModal.body}
            </p>

            <button
              type="button"
              onClick={() => setPermissionNoticeModal(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}