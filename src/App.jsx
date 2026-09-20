import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Package, 
  Building2,
  ArrowDownLeft, 
  ArrowLeftRight, 
  Boxes, 
  Globe,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
  ShieldAlert,
  ClipboardCheck,
  Factory,
  FlaskConical,
  Layers,
  Scale,
  CheckCircle2,
  TrendingUp,
  BadgeDollarSign,
  Users,
  Wrench,
  Cog,
  Sparkles,
  Home,
  Menu,
  Palette
} from 'lucide-react';
import LandingPage from './components/LandingPage';
import TopNavbar from './components/TopNavbar';
import TabPageHeaderBanner from './components/TabPageHeaderBanner';
import {
  getStoredTabConfigs,
  getIconComponent,
  hexToRgb
} from './utils/tabAppearanceConfig';
import ItemMaster from './components/ItemMaster';
import SupplierMaster from './components/SupplierMaster';
import FinishedProductsMaster from './components/FinishedProductsMaster';
import IntermediateBOMMaster from './components/IntermediateBOMMaster';
import LiquidTanksMaster from './components/LiquidTanksMaster';
import BOMRecipesMaster from './components/BOMRecipesMaster';
import WorkOrdersMaster from './components/WorkOrdersMaster';
import POCreation from './components/POCreation';
import GoodsReceipt from './components/GoodsReceipt';
import StockTransfers from './components/StockTransfers';
import StockBalances from './components/StockBalances';
import StockCount from './components/StockCount';
import SparePartsConsumption from './components/SparePartsConsumption';
import AdminControlPanel from './components/AdminControlPanel';
import ScopedPermissionMatrixModal from './components/ScopedPermissionMatrixModal';
import PeacockLoader from './components/PeacockLoader';
import { DEFAULT_ROLE_PERMISSIONS } from './config/appArchitecture';
import { collection, doc, onSnapshot, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Initial Seeds (with Login Email Addresses & 2-Tier Roles)
const INITIAL_SEED_USERS = [
  {
    id: 'usr_general_admin',
    email: 'admin@altawoos.com',
    name: 'Sherif (General Admin)',
    nameAr: 'شريف (المسؤول العام)',
    role: 'general_admin',
    department: 'الإدارة العليا',
    isGeneralAdmin: true,
    allowedModules: ['purchases', 'production', 'sales', 'finance', 'hr'],
    status: 'active',
  },
  {
    id: 'usr_tarek_purchasing',
    email: 'tarek@altawoos.com',
    name: 'Eng. Tarek (Purchasing Manager)',
    nameAr: 'م. طارق (مدير المشتريات)',
    role: 'standard',
    department: 'المشتريات',
    isGeneralAdmin: false,
    allowedModules: ['purchases'],
    status: 'active',
  },
  {
    id: 'usr_mostafa_purchasing',
    email: 'mostafa@altawoos.com',
    name: 'Eng. Mostafa (Production & Materials)',
    nameAr: 'م. مصطفى (مدير الإنتاج والخامات)',
    role: 'standard',
    department: 'الإنتاج والتشغيل',
    isGeneralAdmin: false,
    allowedModules: ['purchases', 'production'],
    status: 'active',
  },
  {
    id: 'usr_ahmed_procurement',
    email: 'ahmed@altawoos.com',
    name: 'Ahmed Samir (Procurement Specialist)',
    nameAr: 'أحمد سمير (أخصائي مشتريات)',
    role: 'standard',
    department: 'المشتريات',
    isGeneralAdmin: false,
    allowedModules: ['purchases'],
    status: 'active',
  },
  {
    id: 'usr_mahmoud_storekeeper',
    email: 'mahmoud@altawoos.com',
    name: 'Mahmoud Ali (Storekeeper)',
    nameAr: 'محمود علي (أمين مخزن)',
    role: 'standard',
    department: 'المخازن والتشغيل',
    isGeneralAdmin: false,
    allowedModules: ['purchases', 'production'],
    status: 'active',
  },
];

export default function App() {
  const { t, i18n } = useTranslation();
  const [activeModule, setActiveModule] = useState('landing');
  const [activeTab, setActiveTab] = useState('landing');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );

  // Auto-hide sidebar on initial mobile load and window resizing
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarVisible(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [showCollapsedUserMenu, setShowCollapsedUserMenu] = useState(false);
  const [usersList, setUsersList] = useState(INITIAL_SEED_USERS);
  const collapsedUserMenuRef = useRef(null);

  // Close collapsed persona popover on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (collapsedUserMenuRef.current && !collapsedUserMenuRef.current.contains(e.target)) {
        setShowCollapsedUserMenu(false);
      }
    };
    if (showCollapsedUserMenu) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showCollapsedUserMenu]);
  const [currentUserId, setCurrentUserId] = useState(INITIAL_SEED_USERS[0].id);
  const [cloudPermissions, setCloudPermissions] = useState({});
  const [isBooting, setIsBooting] = useState(true);

  // Tab Customization (Icons, Labels Ar/En, Watercolor Glows) State & Sync
  const [tabAppearanceMap, setTabAppearanceMap] = useState(() => getStoredTabConfigs());
  const [adminPanelSubTab, setAdminPanelSubTab] = useState(null);
  const [adminPanelTabFocus, setAdminPanelTabFocus] = useState(null);

  useEffect(() => {
    const handleTabConfigUpdated = () => {
      setTabAppearanceMap(getStoredTabConfigs());
    };
    window.addEventListener('app_tab_config_updated', handleTabConfigUpdated);
    return () => window.removeEventListener('app_tab_config_updated', handleTabConfigUpdated);
  }, []);

  // 1. Subscribe to Live Cloud Users & Auto-Seed on initial startup
  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      async (snap) => {
        if (snap.empty) {
          // Auto-seed initial users into Firestore
          for (const u of INITIAL_SEED_USERS) {
            await setDoc(doc(db, 'users', u.id), { ...u, createdAt: serverTimestamp() });
          }
        } else {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          setUsersList(list);
        }
      },
      (error) => {
        console.warn('Firestore users snapshot listener failed (check rules):', error.message);
        setUsersList(INITIAL_SEED_USERS);
      }
    );

    // 2. Subscribe to Permissions
    const unsubPerms = onSnapshot(
      doc(db, 'system_config', 'permissions'),
      (snap) => {
        if (snap.exists()) {
          setCloudPermissions(snap.data().userOverrides || {});
        }
        setIsBooting(false);
      },
      (error) => {
        console.warn('Firestore permissions snapshot listener failed (check rules):', error.message);
        setIsBooting(false);
      }
    );

    return () => {
      unsubUsers();
      unsubPerms();
    };
  }, []);

  // Compute Active User Persona
  const currentUser = useMemo(() => {
    return usersList.find((u) => u.id === currentUserId) || usersList[0] || INITIAL_SEED_USERS[0];
  }, [usersList, currentUserId]);

  // Compute Effective Permissions Dynamically
  const effectivePermissions = useMemo(() => {
    if (currentUser.isGeneralAdmin || currentUser.role === 'general_admin') {
      return DEFAULT_ROLE_PERMISSIONS.general_admin;
    }

    const baseDefault = DEFAULT_ROLE_PERMISSIONS.standard || DEFAULT_ROLE_PERMISSIONS.general_admin;
    const userOverride = cloudPermissions[currentUser.id] || {};

    return {
      modules: { ...baseDefault.modules, ...(userOverride.modules || {}) },
      actions: { ...baseDefault.actions, ...(userOverride.actions || {}) },
      sensitive: { ...baseDefault.sensitive, ...(userOverride.sensitive || {}) },
      fields: { ...(userOverride.fields || {}) },
    };
  }, [currentUser, cloudPermissions]);

  // Auto-redirect if active tab is restricted for the current user
  useEffect(() => {
    if (activeTab === 'landing') return;

    if (activeTab === 'admin_panel') {
      if (!currentUser.isGeneralAdmin && currentUser.role !== 'general_admin') {
        handleSelectModule(activeModule === 'landing' ? 'purchases' : activeModule);
      }
      return;
    }

    // Verify if activeTab is in current user's permitted tabs
    const currentModuleNav = MODULE_NAV_DEFINITIONS[activeModule] || MODULE_NAV_DEFINITIONS.purchases;
    const isTabPermitted =
      currentUser.isGeneralAdmin ||
      currentUser.role === 'general_admin' ||
      currentModuleNav.some((item) => item.id === activeTab && effectivePermissions.modules[item.moduleKey] !== false);

    if (!isTabPermitted) {
      handleSelectModule(activeModule);
    }
  }, [currentUser, effectivePermissions, activeTab, activeModule]);

  const isAr = i18n.language === 'ar';

  const toggleLanguage = () => {
    const nextLang = isAr ? 'en' : 'ar';
    i18n.changeLanguage(nextLang);
  };

  // Module-Bound Sidebar Navigation Schema
  const MODULE_NAV_DEFINITIONS = {
    purchases: [
      { id: 'dashboard', labelAr: 'الرئيسية', labelEn: 'Dashboard', icon: LayoutDashboard, moduleKey: 'dashboard' },
      { id: 'items', labelAr: 'كارت الأصناف والخامات', labelEn: 'Item Master', icon: Package, moduleKey: 'items' },
      { id: 'suppliers', labelAr: 'سجل الموردين', labelEn: 'Supplier Master', icon: Building2, moduleKey: 'suppliers' },
      { id: 'orders', labelAr: 'أوامر الشراء (PO)', labelEn: 'Purchase Orders', icon: ShoppingCart, moduleKey: 'purchase_orders' },
      { id: 'receipts', labelAr: 'إذن استلام خامات (GRN)', labelEn: 'Goods Receipt', icon: ArrowDownLeft, moduleKey: 'goods_receipts' },
      { id: 'transfers', labelAr: 'تحويلات المخازن (TRN)', labelEn: 'Stock Transfers', icon: ArrowLeftRight, moduleKey: 'transfers' },
      { id: 'stock', labelAr: 'أرصدة المخازن', labelEn: 'Stock Balances', icon: Boxes, moduleKey: 'stock' },
      { id: 'stock_count', labelAr: 'الجرد والتسوية', labelEn: 'Stock Count', icon: ClipboardCheck, moduleKey: 'stock_count' },
      { id: 'spare_parts', labelAr: 'صرف قطع الغيار والمستهلكات (X)', labelEn: 'Spare Parts Issue', icon: Wrench, moduleKey: 'spare_parts_issue' },
    ],
    production: [
      { id: 'finished_products', labelAr: 'سجل المنتجات التامة', labelEn: 'Finished Products Master', icon: Package, moduleKey: 'finished_products' },
      { id: 'intermediate_bom', labelAr: 'تصنيع الخامات الوسيطة', labelEn: 'Intermediate Recipes (M)', icon: FlaskConical, moduleKey: 'intermediate_bom' },
      { id: 'liquid_tanks', labelAr: 'تشغيل وتانكات الخامات (M)', labelEn: 'Bulk Liquid Tanks (M)', icon: Cog, moduleKey: 'liquid_tanks' },
      { id: 'bom', labelAr: 'تعبئة وتغليف المنتج التام (BOM)', labelEn: 'Packing & Filling BOM', icon: Layers, moduleKey: 'bom' },
      { id: 'work_orders', labelAr: 'أوامر التشغيل والإنتاج', labelEn: 'Work Orders', icon: Factory, moduleKey: 'work_orders' },
      { id: 'material_issue', labelAr: 'صرف خامات للتشغيل', labelEn: 'Material Issue', icon: ArrowDownLeft, moduleKey: 'material_issue' },
      { id: 'fg_inward', labelAr: 'استلام المنتج التام', labelEn: 'Finished Goods Inward', icon: CheckCircle2, moduleKey: 'fg_inward' },
      { id: 'yield_recon', labelAr: 'تدقيق الهالك والإنتاجية', labelEn: 'Yield & Scrap Audit', icon: Scale, moduleKey: 'yield_recon' },
    ],
    sales: [
      { id: 'customers', labelAr: 'سجل العملاء', labelEn: 'Customers Master', icon: Users, moduleKey: 'customers' },
      { id: 'sales_orders', labelAr: 'أوامر البيع والتوريد', labelEn: 'Sales Orders', icon: TrendingUp, moduleKey: 'sales_orders' },
    ],
    finance: [
      { id: 'accounts', labelAr: 'دليل الحسابات', labelEn: 'Chart of Accounts', icon: BadgeDollarSign, moduleKey: 'accounts' },
    ],
    hr: [
      { id: 'employees', labelAr: 'سجل العاملين', labelEn: 'Employees Directory', icon: Users, moduleKey: 'employees' },
    ]
  };

  // Derive nav items dynamically for the active module with dynamic tab appearance
  const rawCurrentModuleNavItems = MODULE_NAV_DEFINITIONS[activeModule] || MODULE_NAV_DEFINITIONS.purchases;
  const currentModuleNavItems = rawCurrentModuleNavItems.map((item) => {
    const customConfig = tabAppearanceMap[item.id];
    if (customConfig) {
      return {
        ...item,
        labelAr: customConfig.labelAr || item.labelAr,
        labelEn: customConfig.labelEn || item.labelEn,
        icon: customConfig.iconName ? getIconComponent(customConfig.iconName) : item.icon,
        color: customConfig.color || '#059669',
      };
    }
    return { ...item, color: '#059669' };
  });

  const navItems = currentModuleNavItems
    .filter((item) => {
      if (currentUser.isGeneralAdmin || currentUser.role === 'general_admin') return true;
      return effectivePermissions.modules[item.moduleKey] !== false;
    })
    .map((item) => ({
      ...item,
      label: isAr ? item.labelAr : item.labelEn,
    }));

  const handleSelectModule = (moduleId, targetTab) => {
    setActiveModule(moduleId);
    if (moduleId === 'landing') {
      setActiveTab('landing');
      return;
    }

    const moduleNav = MODULE_NAV_DEFINITIONS[moduleId] || [];
    const permittedNav = moduleNav.filter((item) => {
      if (currentUser.isGeneralAdmin || currentUser.role === 'general_admin') return true;
      return effectivePermissions.modules[item.moduleKey] !== false;
    });

    const userDefault = currentUser?.defaultModuleTabs?.[moduleId];
    const isTargetPermitted = targetTab && permittedNav.some((t) => t.id === targetTab);
    const isUserDefaultPermitted = userDefault && permittedNav.some((t) => t.id === userDefault);
    const defaultFallback =
      moduleId === 'production'
        ? 'finished_products'
        : moduleId === 'purchases'
        ? 'orders'
        : 'dashboard';
    const isFallbackPermitted = permittedNav.some((t) => t.id === defaultFallback);

    // Pick strictly from visible tabs
    const resolvedTab =
      (isTargetPermitted ? targetTab : null) ||
      (isUserDefaultPermitted ? userDefault : null) ||
      (isFallbackPermitted ? defaultFallback : null) ||
      permittedNav[0]?.id ||
      defaultFallback;

    setActiveTab(resolvedTab);
  };

  // Persist user preferred default tab per module to Firestore
  const handleUpdateUserDefaultTab = async (moduleId, tabId) => {
    try {
      const currentDefaults = currentUser.defaultModuleTabs || {};
      const updated = { ...currentDefaults, [moduleId]: tabId };
      await setDoc(
        doc(db, 'users', currentUser.id),
        {
          defaultModuleTabs: updated,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Error saving user default tab preference:', err);
    }
  };

  // Scoped Permissions Matrix Modal State
  const [scopedMatrixModal, setScopedMatrixModal] = useState({
    isOpen: false,
    scopeType: 'module',
    targetKey: ''
  });

  const handleOpenScopedMatrix = (scopeType, targetKey) => {
    setScopedMatrixModal({
      isOpen: true,
      scopeType,
      targetKey
    });
  };

  return (
    <div 
      style={{ fontFamily: "'Cairo', sans-serif" }} 
      className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans"
    >
      {/* 1. Global Navigation Bar */}
      <TopNavbar
        activeModule={activeModule}
        activeTab={activeTab}
        onSelectModule={handleSelectModule}
        currentUser={currentUser}
        testUsers={usersList}
        effectivePermissions={effectivePermissions}
        isSidebarVisible={isSidebarVisible}
        onToggleSidebarVisibility={() => setIsSidebarVisible(!isSidebarVisible)}
      />

      {/* Main Body */}
      <div className="flex flex-1 relative overflow-visible">
        {/* Mobile Backdrop for Off-Canvas Sidebar */}
        {isSidebarVisible && activeTab !== 'landing' && activeTab !== 'admin_panel' && (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setIsSidebarVisible(false)}
          />
        )}

        {/* Adaptive Sticky (Desktop) / Off-Canvas (Mobile) Sidebar */}
        {activeTab !== 'landing' && activeTab !== 'admin_panel' && (
          <aside 
            className={`
              fixed inset-y-0 start-0 z-50 md:sticky md:top-[53px] md:z-30
              h-full md:h-[calc(100vh-53px)] md:h-[calc(100dvh-53px)] md:max-h-[calc(100dvh-53px)]
              bg-white border-e border-slate-200 transition-all duration-300 ease-in-out flex flex-col py-2.5 shadow-xl md:shadow-xs shrink-0
              ${isSidebarExpanded ? 'w-68 md:w-60 px-3' : 'w-68 md:w-18 px-3 md:px-2'}
              ${isSidebarVisible ? 'translate-x-0' : '-translate-x-full md:translate-x-0 rtl:translate-x-full rtl:md:translate-x-0 hidden md:flex'}
            `}
          >
            {/* Top Internal Collapse/Expand Button & Mobile Close */}
            <div className="flex items-center justify-between md:justify-end mb-1.5 px-1 shrink-0">
              <div className="md:hidden font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                <span>{isAr ? 'قائمة التنقل' : 'Navigation Menu'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarExpanded(!isSidebarExpanded);
                    setShowCollapsedUserMenu(false);
                  }}
                  className="hidden md:flex p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  title={isSidebarExpanded ? (isAr ? 'تصغير القائمة' : 'Collapse Sidebar') : (isAr ? 'توسيع القائمة' : 'Expand Sidebar')}
                >
                  {isSidebarExpanded ? <PanelLeftClose className="h-4 w-4 rtl:rotate-180" /> : <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSidebarVisible(false)}
                  className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  title={isAr ? 'إغلاق القائمة' : 'Close Menu'}
                >
                  <PanelLeftClose className="h-4 w-4 rtl:rotate-180" />
                </button>
              </div>
            </div>

            {/* Navigation Links List */}
            <nav className="space-y-1 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pe-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const tabColor = item.color || '#059669';
                const { r, g, b } = hexToRgb(tabColor);
                const isGeneralAdmin = Boolean(currentUser.isGeneralAdmin || currentUser.role === 'general_admin');

                return (
                  <div key={item.id} className="relative group flex items-center w-full">
                    <button
                      onClick={() => {
                        setActiveTab(item.id);
                        setShowCollapsedUserMenu(false);
                        if (window.innerWidth < 768) {
                          setIsSidebarVisible(false);
                        }
                      }}
                      style={isActive ? {
                        background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.15) 0%, rgba(${r}, ${g}, ${b}, 0.05) 100%)`,
                        borderInlineStart: `3.5px solid ${tabColor}`,
                        color: tabColor,
                        boxShadow: `0 2px 8px -2px rgba(${r}, ${g}, ${b}, 0.25)`
                      } : undefined}
                      className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                        isSidebarExpanded 
                          ? (isGeneralAdmin ? 'gap-2.5 ps-3 pe-16 py-2.5 justify-start' : 'gap-3 px-3.5 py-2.5 justify-start')
                          : 'justify-start md:justify-center px-3.5 py-2.5 md:p-3 gap-3 md:gap-0'
                      } ${
                        isActive
                          ? 'font-bold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 shrink-0 transition-colors ${!isActive ? 'text-slate-400 group-hover:text-slate-600' : ''}`}
                        style={isActive ? { color: tabColor } : undefined}
                      />
                      <span className={`truncate min-w-0 flex-1 text-start ${!isSidebarExpanded ? 'md:hidden' : ''}`}>{item.label}</span>
                    </button>

                    {/* General Admin Quick Tab Actions: Customize Tab Appearance + Permission Shield */}
                    {isSidebarExpanded && isGeneralAdmin && (
                      <div className="absolute end-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-white/95 backdrop-blur-xs px-1 py-0.5 rounded-lg border border-slate-200/80 shadow-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdminPanelSubTab('tab_appearance');
                            setAdminPanelTabFocus(item.id);
                            setActiveTab('admin_panel');
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                          title={isAr ? `تخصيص مظهر ولون وأيقونة: ${item.label}` : `Customize icon & color for ${item.label}`}
                        >
                          <Palette className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenScopedMatrix('tab', item.moduleKey || item.id);
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition cursor-pointer"
                          title={isAr ? `ضبط صلاحيات تبويب: ${item.label}` : `Configure permissions for ${item.label}`}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {!isSidebarExpanded && (
                      <div className="absolute start-full top-1/2 -translate-y-1/2 ms-2.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 z-50">
                        {item.label}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Pinned Bottom Footer Section: Admin Panel, Persona Switcher & Language Toggle */}
            {/* Footer Controls Container */}
            <div className="mt-auto pt-2 border-t border-slate-200 space-y-1.5 shrink-0 bg-white pb-1">
              {/* --- MOBILE DRAWER ADAPTIVE CONTROLS (md:hidden) --- */}
              <div className="md:hidden space-y-2 p-1">
                {/* 1. Admin Panel Link */}
                {(currentUser.isGeneralAdmin || currentUser.role === 'general_admin') && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(activeTab === 'admin_panel' ? 'landing' : 'admin_panel');
                      setIsSidebarVisible(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer border min-h-[42px] ${
                      activeTab === 'admin_panel'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                    }`}
                  >
                    <ShieldAlert className={`h-4 w-4 shrink-0 ${activeTab === 'admin_panel' ? 'text-white' : 'text-emerald-600'}`} />
                    <span>{isAr ? 'لوحة التحكم العامة' : 'Admin Panel'}</span>
                  </button>
                )}

                {/* 2. User Persona Selector */}
                <div className="flex items-center gap-2.5 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 min-h-[44px]">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-400 block font-medium leading-none mb-1">
                      {isAr ? 'المستخدم النشط:' : 'Active Persona:'}
                    </span>
                    <select
                      value={currentUser.id}
                      onChange={(e) => setCurrentUserId(e.target.value)}
                      className="w-full bg-transparent text-xs text-slate-900 font-extrabold focus:outline-none cursor-pointer truncate"
                      title={isAr ? 'تبديل المستخدم' : 'Switch live user persona'}
                    >
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id} className="bg-white text-slate-900">
                          {isAr ? u.nameAr : (u.name || u.nameAr)} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Language Toggle */}
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 min-h-[44px]"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{isAr ? 'لغة الواجهة:' : 'Language:'}</span>
                  </div>
                  <span className="text-emerald-700 font-extrabold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                    {isAr ? 'English' : 'العربية'}
                  </span>
                </button>
              </div>

              {/* --- DESKTOP SIDEBAR CONTROLS (hidden on mobile drawer) --- */}
              <div className="hidden md:block space-y-1.5">
                {/* 1. General Admin Control Panel Button */}
                {(currentUser.isGeneralAdmin || currentUser.role === 'general_admin') && (
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab(activeTab === 'admin_panel' ? 'landing' : 'admin_panel');
                        setShowCollapsedUserMenu(false);
                      }}
                      className={`w-full flex items-center rounded-xl text-xs font-bold transition cursor-pointer border ${
                        isSidebarExpanded ? 'gap-2.5 px-3 py-2 justify-start' : 'justify-center p-2.5'
                      } ${
                        activeTab === 'admin_panel'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                      }`}
                      title={isSidebarExpanded ? undefined : (isAr ? 'لوحة التحكم العامة' : 'Admin Control Panel')}
                    >
                      <ShieldAlert className={`h-4 w-4 shrink-0 ${activeTab === 'admin_panel' ? 'text-white' : 'text-emerald-600'}`} />
                      {isSidebarExpanded && (
                        <span className="truncate">{isAr ? 'لوحة التحكم العامة' : 'Admin Panel'}</span>
                      )}
                    </button>
                    {!isSidebarExpanded && (
                      <div className="absolute start-full top-1/2 -translate-y-1/2 ms-2.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 z-50">
                        {isAr ? 'لوحة التحكم العامة' : 'Admin Control Panel'}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. User Persona Switcher */}
                <div className="relative" ref={collapsedUserMenuRef}>
                  {isSidebarExpanded ? (
                    <div className="flex items-center gap-2 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <select
                        value={currentUser.id}
                        onChange={(e) => setCurrentUserId(e.target.value)}
                        className="w-full bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer truncate"
                        title={isAr ? 'تبديل المستخدم' : 'Switch live user persona'}
                      >
                        {usersList.map((u) => (
                          <option key={u.id} value={u.id} className="bg-white text-slate-900">
                            {isAr ? u.nameAr : (u.name || u.nameAr)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowCollapsedUserMenu(!showCollapsedUserMenu)}
                        className={`w-full flex items-center justify-center p-2.5 rounded-xl border cursor-pointer transition ${
                          showCollapsedUserMenu
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                        }`}
                        title={isAr ? `المستخدم الحالي: ${currentUser.nameAr || currentUser.name}` : `Current User: ${currentUser.name}`}
                      >
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      </button>

                      {/* Collapsed Persona Flyout Popover Menu */}
                      {showCollapsedUserMenu && (
                        <div className="absolute start-full bottom-0 ms-2.5 z-60 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-150 text-start space-y-1">
                          <div className="px-2.5 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center justify-between">
                            <span>{isAr ? 'تبديل المستخدم' : 'Switch User Persona'}</span>
                            <span className="text-[9px] font-mono text-emerald-600 font-bold">{usersList.length}</span>
                          </div>
                          <div className="space-y-0.5 max-h-56 overflow-y-auto">
                            {usersList.map((u) => {
                              const isSelected = u.id === currentUser.id;
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    setCurrentUserId(u.id);
                                    setShowCollapsedUserMenu(false);
                                  }}
                                  className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold transition cursor-pointer text-start ${
                                    isSelected
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs'
                                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                  }`}
                                >
                                  <div className="truncate">
                                    <div className="truncate text-slate-900 font-bold">{isAr ? u.nameAr : (u.name || u.nameAr)}</div>
                                    <div className="text-[10px] text-slate-400 font-normal truncate">{u.role}</div>
                                  </div>
                                  {isSelected && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 3. Language Toggle Button */}
                <div className="relative group">
                  <button
                    type="button"
                    onClick={toggleLanguage}
                    className={`w-full flex items-center rounded-xl text-xs font-bold transition cursor-pointer border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 ${
                      isSidebarExpanded ? 'gap-2.5 px-3 py-2 justify-start' : 'justify-center p-2.5'
                    }`}
                    title={isSidebarExpanded ? undefined : (isAr ? 'تبديل اللغة' : 'Toggle Language')}
                  >
                    <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
                    {isSidebarExpanded && (
                      <span className="truncate">{isAr ? 'English' : 'العربية'}</span>
                    )}
                  </button>
                  {!isSidebarExpanded && (
                    <div className="absolute start-full top-1/2 -translate-y-1/2 ms-2.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 z-50">
                      {isAr ? 'English' : 'العربية'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Viewport */}
        <main className="flex-1 p-2.5 sm:p-4 md:p-8 pb-22 md:pb-8 overflow-x-hidden min-w-0">
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-3 sm:p-5 md:p-6 min-h-[500px] flex flex-col justify-start">
            {isBooting ? (
              <div className="flex-1 min-h-[400px] flex items-center justify-center">
                <PeacockLoader size="xl" text={isAr ? 'جاري تحميل بيئة العمل السحابية...' : 'Connecting to Cloud ERP...'} />
              </div>
            ) : (
              <>
                {activeTab !== 'landing' && activeTab !== 'admin_panel' && (
                  <TabPageHeaderBanner
                    activeTab={activeTab}
                    currentUser={currentUser}
                    onOpenTabCustomizer={(tabId) => {
                      setAdminPanelSubTab('tab_appearance');
                      setAdminPanelTabFocus(tabId);
                      setActiveTab('admin_panel');
                    }}
                    onOpenTabPermissions={(tabId) => {
                      const allNavItems = [
                        ...(MODULE_NAV_DEFINITIONS.purchases || []),
                        ...(MODULE_NAV_DEFINITIONS.production || [])
                      ];
                      const item = allNavItems.find((n) => n.id === tabId);
                      handleOpenScopedMatrix('tab', item?.moduleKey || tabId);
                    }}
                  />
                )}

                {/* 1. Landing Hub View */}
                {activeTab === 'landing' && (
                  <LandingPage
                    currentUser={currentUser}
                    effectivePermissions={effectivePermissions}
                    onSelectModule={handleSelectModule}
                    onOpenAdminPermissions={handleOpenScopedMatrix}
                    usersList={usersList}
                    onSelectUser={(userId) => setCurrentUserId(userId)}
                    onToggleLanguage={toggleLanguage}
                    onOpenAdminPanel={() => {
                      setAdminPanelSubTab('users');
                      setActiveTab('admin_panel');
                    }}
                    onUpdateDefaultTab={handleUpdateUserDefaultTab}
                  />
                )}

                {activeTab === 'dashboard' && <p className="text-slate-500 text-sm">Dashboard metrics view coming next...</p>}
            {activeTab === 'items' && (
              <ItemMaster 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeTab === 'suppliers' && (
              <SupplierMaster 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeTab === 'orders' && (
              <POCreation 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeTab === 'admin_panel' && (currentUser.isGeneralAdmin || currentUser.role === 'general_admin') && (
              <AdminControlPanel 
                currentUser={currentUser}
                initialSubTab={adminPanelSubTab || 'users'}
                initialTabFocus={adminPanelTabFocus}
              />
            )}
            {activeTab === 'receipts' && (
              <GoodsReceipt 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeTab === 'transfers' && (
              <StockTransfers 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeTab === 'stock' && (
              <StockBalances 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeTab === 'stock_count' && (
              <StockCount 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeTab === 'spare_parts' && (
              <SparePartsConsumption 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}

            {/* Production Module Views */}
            {activeModule === 'production' && activeTab === 'finished_products' && (
              <FinishedProductsMaster 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeModule === 'production' && activeTab === 'intermediate_bom' && (
              <IntermediateBOMMaster 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeModule === 'production' && activeTab === 'liquid_tanks' && (
              <LiquidTanksMaster 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeModule === 'production' && activeTab === 'bom' && (
              <BOMRecipesMaster 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeModule === 'production' && activeTab === 'work_orders' && (
              <WorkOrdersMaster 
                currentUser={currentUser} 
                permissions={effectivePermissions} 
              />
            )}
            {activeModule === 'production' && activeTab === 'material_issue' && (
              <div className="p-8 text-center space-y-3">
                <ArrowDownLeft className="h-10 w-10 text-blue-600 mx-auto" />
                <h3 className="text-lg font-bold text-slate-800">
                  {isAr ? 'صرف واستهلاك الخامات للتشغيل' : 'Production Floor Material Issues'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {isAr ? 'صرف الخامات من مستودع التشغيل وفق معادلات الـ BOM وقواعد FIFO.' : 'Issue raw inventory to the production line under FIFO rules.'}
                </p>
              </div>
            )}
            {activeModule === 'production' && activeTab === 'fg_inward' && (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-blue-600 mx-auto" />
                <h3 className="text-lg font-bold text-slate-800">
                  {isAr ? 'استلام المنتج التام (Finished Goods Inward)' : 'Finished Goods Inward'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {isAr ? 'توريد المنتجات التامة وتوليد لوطات المنتج التام.' : 'Receive finished production batches into Finished Goods stock.'}
                </p>
              </div>
            )}
            {activeModule === 'production' && activeTab === 'yield_recon' && (
              <div className="p-8 text-center space-y-3">
                <Scale className="h-10 w-10 text-blue-600 mx-auto" />
                <h3 className="text-lg font-bold text-slate-800">
                  {isAr ? 'تدقيق الهالك والإنتاجية (Yield Reconciliation)' : 'Yield & Scrap Reconciliation'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {isAr ? 'مقارنة الاستهلاك الفعلي بالمعياري وحساب نسب الهالك.' : 'Calculate production yield percentages and reconcile line scrap.'}
                </p>
              </div>
            )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Adaptive Mobile Bottom Navigation Dock (md:hidden) */}
      <nav 
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 px-2 py-1.5 flex items-center justify-around shadow-lg"
      >
        {/* 1. Home Gateway */}
        <button
          type="button"
          onClick={() => {
            handleSelectModule('landing', 'landing');
            setIsSidebarVisible(false);
          }}
          className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer ${
            activeTab === 'landing'
              ? 'text-emerald-700 font-bold bg-emerald-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Home className={`h-4.5 w-4.5 ${activeTab === 'landing' ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className="text-[10px] leading-none">{isAr ? 'الرئيسية' : 'Home'}</span>
        </button>

        {/* 2. Materials & Purchases Hub */}
        <button
          type="button"
          onClick={() => {
            handleSelectModule('purchases', 'orders');
            setIsSidebarVisible(false);
          }}
          className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer ${
            activeModule === 'purchases' && activeTab !== 'stock'
              ? 'text-emerald-700 font-bold bg-emerald-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShoppingCart className={`h-4.5 w-4.5 ${activeModule === 'purchases' && activeTab !== 'stock' ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className="text-[10px] leading-none">{isAr ? 'الخامات' : 'Materials'}</span>
        </button>

        {/* 3. Production & Floor Hub */}
        <button
          type="button"
          onClick={() => {
            handleSelectModule('production', 'work_orders');
            setIsSidebarVisible(false);
          }}
          className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer ${
            activeModule === 'production'
              ? 'text-emerald-700 font-bold bg-emerald-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Factory className={`h-4.5 w-4.5 ${activeModule === 'production' ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className="text-[10px] leading-none">{isAr ? 'الإنتاج' : 'Production'}</span>
        </button>

        {/* 4. Stock Balances SSOT */}
        <button
          type="button"
          onClick={() => {
            handleSelectModule('purchases', 'stock');
            setIsSidebarVisible(false);
          }}
          className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer ${
            activeTab === 'stock'
              ? 'text-emerald-700 font-bold bg-emerald-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Boxes className={`h-4.5 w-4.5 ${activeTab === 'stock' ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className="text-[10px] leading-none">{isAr ? 'المخازن' : 'Stock'}</span>
        </button>

        {/* 5. Menu Drawer Trigger */}
        <button
          type="button"
          onClick={() => setIsSidebarVisible(!isSidebarVisible)}
          className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition cursor-pointer ${
            isSidebarVisible
              ? 'text-emerald-700 font-bold bg-emerald-100/70'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Menu className={`h-4.5 w-4.5 ${isSidebarVisible ? 'text-emerald-600' : 'text-slate-500'}`} />
          <span className="text-[10px] leading-none">{isAr ? 'القائمة' : 'Menu'}</span>
        </button>
      </nav>

      {/* Global Scoped Permissions Matrix Modal */}
      <ScopedPermissionMatrixModal
        isOpen={scopedMatrixModal.isOpen}
        onClose={() => setScopedMatrixModal({ isOpen: false, scopeType: 'module', targetKey: '' })}
        scopeType={scopedMatrixModal.scopeType}
        targetKey={scopedMatrixModal.targetKey}
        currentUser={currentUser}
        usersList={usersList}
      />
    </div>
  );
}