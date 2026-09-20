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
  PanelLeft
} from 'lucide-react';
import { HeaderPresencePill } from './UIUXComponents';
import {
  getStoredTabConfigs,
  getIconComponent,
  hexToRgb
} from '../utils/tabAppearanceConfig';

// =========================================================================
// MAIN TOP NAVBAR COMPONENT
// =========================================================================
export default function TopNavbar({
  activeModule,
  activeTab,
  onSelectModule,
  currentUser,
  testUsers,
  effectivePermissions = null,
  isSidebarVisible = true,
  onToggleSidebarVisibility = () => {}
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [expandedTabId, setExpandedTabId] = useState(null);
  const [submenuFlip, setSubmenuFlip] = useState({ module: false, tab: false });
  const [tabConfigs, setTabConfigs] = useState(() => getStoredTabConfigs());
  const navContainerRef = useRef(null);

  useEffect(() => {
    const handleTabConfigUpdated = () => {
      setTabConfigs(getStoredTabConfigs());
    };
    window.addEventListener('app_tab_config_updated', handleTabConfigUpdated);
    return () => window.removeEventListener('app_tab_config_updated', handleTabConfigUpdated);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (navContainerRef.current && !navContainerRef.current.contains(e.target)) {
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

  const RAW_ERP_STRUCTURE = [
    {
      id: 'purchases',
      labelAr: 'الخامات',
      labelEn: 'Materials',
      icon: ShoppingCart,
      defaultTab: 'orders',
      status: 'active',
      tabs: [
        { id: 'items', moduleKey: 'items', labelAr: 'كارت الأصناف والخامات', labelEn: 'Item Master', icon: Package },
        { id: 'suppliers', moduleKey: 'suppliers', labelAr: 'سجل الموردين المعتمدين', labelEn: 'Supplier Master', icon: Building2 },
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
      defaultTab: 'finished_products',
      status: 'active',
      tabs: [
        { id: 'finished_products', moduleKey: 'finished_products', labelAr: 'سجل المنتجات التامة', labelEn: 'Finished Products Master', icon: Package },
        { id: 'intermediate_bom', moduleKey: 'intermediate_bom', labelAr: 'تصنيع الخامات الوسيطة (M)', labelEn: 'Intermediate BOM (M)', icon: FlaskConical },
        { id: 'liquid_tanks', moduleKey: 'liquid_tanks', labelAr: 'تشغيل وتانكات الخامات (M)', labelEn: 'Bulk Liquid Tanks (M)', icon: Cog },
        { id: 'bom', moduleKey: 'bom', labelAr: 'تعبئة وتغليف المنتج التام (BOM)', labelEn: 'Packing & Filling BOM', icon: Layers },
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
        { id: 'material_issue', moduleKey: 'material_issue', labelAr: 'صرف خامات للتشغيل', labelEn: 'Material Issue', icon: ArrowDownLeft },
        { id: 'fg_inward', moduleKey: 'fg_inward', labelAr: 'استلام المنتج التام', labelEn: 'Finished Goods Inward', icon: CheckCircle2 },
        { id: 'yield_recon', moduleKey: 'yield_recon', labelAr: 'تدقيق الهالك والإنتاجية', labelEn: 'Yield & Scrap Audit', icon: Scale },
      ]
    },
    {
      id: 'sales',
      labelAr: 'المبيعات والتوزيع',
      labelEn: 'Sales & Distribution',
      icon: TrendingUp,
      defaultTab: 'sales_orders',
      status: 'upcoming',
      tabs: []
    },
    {
      id: 'finance',
      labelAr: 'المالية والحسابات',
      labelEn: 'Finance & Accounts',
      icon: BadgeDollarSign,
      defaultTab: 'accounts',
      status: 'upcoming',
      tabs: []
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
            };
          }
          return { ...tab, color: '#059669' };
        })
        .filter(isTabPermitted),
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
    <header className="bg-white text-slate-800 border-b border-slate-200 sticky top-0 z-50 shadow-xs">
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
                                            onSelectModule(activeModule, tab.id);
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
                                          onSelectModule(activeModule, tab.id);
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

        {/* Right Side: Online Teammates Header Presence Pill */}
        <div className="flex items-center gap-2.5 shrink-0">
          <HeaderPresencePill onlineUsers={testUsers.filter((u) => u.id !== currentUser.id)} isAr={isAr} />
        </div>
      </div>
    </header>
  );
}