import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCart,
  Factory,
  TrendingUp,
  BadgeDollarSign,
  Users,
  ShieldAlert,
  ShieldCheck,
  Globe,
  Lock,
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
  Sparkles,
  SlidersHorizontal,
  Bookmark
} from 'lucide-react';
import {
  getStoredTabConfigs,
  getIconComponent,
  hexToRgb
} from '../utils/tabAppearanceConfig';

export default function LandingPage({
  currentUser = {},
  effectivePermissions = {},
  onSelectModule,
  onOpenAdminPermissions,
  usersList = [],
  onSelectUser = () => {},
  onToggleLanguage = () => {},
  onOpenAdminPanel = () => {},
  onUpdateDefaultTab = () => {}
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser.isGeneralAdmin || currentUser.role === 'general_admin';

  // Dynamic tab appearance sync
  const [tabConfigs, setTabConfigs] = useState(() => getStoredTabConfigs());
  useEffect(() => {
    const handleTabConfigUpdated = () => {
      setTabConfigs(getStoredTabConfigs());
    };
    window.addEventListener('app_tab_config_updated', handleTabConfigUpdated);
    return () => window.removeEventListener('app_tab_config_updated', handleTabConfigUpdated);
  }, []);

  // Mobile tap-to-expand chip tracking
  const [tappedChipKey, setTappedChipKey] = useState(null);

  const MODULE_CARDS = [
    {
      id: 'purchases',
      defaultTab: 'orders',
      titleAr: 'الخامات',
      titleEn: 'Materials',
      icon: ShoppingCart,
      color: 'emerald',
      status: 'active',
      permissionModuleKey: 'purchases',
      tabs: [
        { id: 'items', moduleKey: 'items', labelAr: 'كارت الأصناف', labelEn: 'Item Master', icon: Package },
        { id: 'suppliers', moduleKey: 'suppliers', labelAr: 'الموردين المعتمدين', labelEn: 'Suppliers', icon: Building2 },
        { id: 'orders', moduleKey: 'purchase_orders', labelAr: 'أوامر الشراء (PO)', labelEn: 'Purchase Orders', icon: ShoppingCart },
        { id: 'receipts', moduleKey: 'goods_receipts', labelAr: 'أذون الاستلام (GRN)', labelEn: 'Goods Receipt', icon: ArrowDownLeft },
        { id: 'transfers', moduleKey: 'transfers', labelAr: 'التحويلات المخزنية', labelEn: 'Stock Transfers', icon: ArrowLeftRight },
        { id: 'stock', moduleKey: 'stock', labelAr: 'أرصدة المخازن', labelEn: 'Stock Balances', icon: Boxes },
        { id: 'stock_count', moduleKey: 'stock_count', labelAr: 'الجرد والتسوية', labelEn: 'Stock Count', icon: ClipboardCheck },
        { id: 'spare_parts', moduleKey: 'spare_parts_issue', labelAr: 'صرف قطع الغيار (X)', labelEn: 'Spare Parts', icon: Wrench },
      ]
    },
    {
      id: 'production',
      defaultTab: 'finished_products',
      titleAr: 'الإنتاج والتشغيل',
      titleEn: 'Production & Manufacturing',
      icon: Factory,
      color: 'blue',
      status: 'active',
      permissionModuleKey: 'production',
      tabs: [
        { id: 'finished_products', moduleKey: 'finished_products', labelAr: 'سجل المنتجات التامة', labelEn: 'Finished Products', icon: Package },
        { id: 'intermediate_bom', moduleKey: 'intermediate_bom', labelAr: 'تصنيع الخامات الوسيطة (M)', labelEn: 'Intermediate BOM', icon: FlaskConical },
        { id: 'liquid_tanks', moduleKey: 'liquid_tanks', labelAr: 'تانكات وتشغيل الخامات (M)', labelEn: 'Bulk Liquid Tanks', icon: Cog },
        { id: 'bom', moduleKey: 'bom', labelAr: 'تعبئة وتغليف المنتج التام (BOM)', labelEn: 'Packing BOM', icon: Layers },
        { id: 'work_orders', moduleKey: 'work_orders', labelAr: 'أوامر التشغيل والإنتاج', labelEn: 'Work Orders', icon: Factory },
        { id: 'material_issue', moduleKey: 'material_issue', labelAr: 'صرف خامات للتشغيل', labelEn: 'Material Issue', icon: ArrowDownLeft },
        { id: 'fg_inward', moduleKey: 'fg_inward', labelAr: 'استلام المنتج التام', labelEn: 'FG Inward', icon: CheckCircle2 },
        { id: 'yield_recon', moduleKey: 'yield_recon', labelAr: 'تدقيق الهالك والإنتاجية', labelEn: 'Yield Audit', icon: Scale },
      ]
    },
    {
      id: 'sales',
      defaultTab: 'sales_orders',
      titleAr: 'المبيعات والتوزيع',
      titleEn: 'Sales & Distribution',
      icon: TrendingUp,
      color: 'amber',
      status: 'upcoming',
      permissionModuleKey: 'sales',
      tabs: []
    },
    {
      id: 'finance',
      defaultTab: 'accounts',
      titleAr: 'المالية والحسابات',
      titleEn: 'Finance & Accounts',
      icon: BadgeDollarSign,
      color: 'violet',
      status: 'upcoming',
      permissionModuleKey: 'finance',
      tabs: []
    },
    {
      id: 'hr',
      defaultTab: 'employees',
      titleAr: 'الموارد البشرية',
      titleEn: 'Human Resources (HR)',
      icon: Users,
      color: 'rose',
      status: 'upcoming',
      permissionModuleKey: 'hr',
      tabs: []
    }
  ];

  const getColorClasses = (color) => {
    switch (color) {
      case 'emerald':
        return {
          cardBorder: 'hover:border-emerald-400 hover:shadow-emerald-500/10',
          iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
          chipActive: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
        };
      case 'blue':
        return {
          cardBorder: 'hover:border-blue-400 hover:shadow-blue-500/10',
          iconBg: 'bg-blue-50 text-blue-600 border-blue-200',
          chipActive: 'bg-blue-50 text-blue-800 border-blue-300 font-bold',
        };
      case 'amber':
        return {
          cardBorder: 'hover:border-amber-400 hover:shadow-amber-500/10',
          iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
          chipActive: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'violet':
        return {
          cardBorder: 'hover:border-violet-400 hover:shadow-violet-500/10',
          iconBg: 'bg-violet-50 text-violet-600 border-violet-200',
          chipActive: 'bg-violet-50 text-violet-800 border-violet-200',
        };
      default:
        return {
          cardBorder: 'hover:border-rose-400 hover:shadow-rose-500/10',
          iconBg: 'bg-rose-50 text-rose-600 border-rose-200',
          chipActive: 'bg-rose-50 text-rose-800 border-rose-200',
        };
    }
  };

  const getPermittedTabs = (card) => {
    if (!card.tabs) return [];
    return card.tabs.filter((tab) => {
      if (isGeneralAdmin) return true;
      const key = tab.moduleKey || tab.id;
      return effectivePermissions?.modules?.[key] !== false;
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Floating Utility Header Limited to Landing Page */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Hub Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold">
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 leading-tight">
              {isAr ? 'بوابة النظام المركزية' : 'ERP Central Hub'}
            </h2>
            <p className="text-[10px] text-slate-500 font-medium">
              {isAr ? `مرحباً، ${currentUser.nameAr || currentUser.name}` : `Welcome, ${currentUser.name}`}
            </p>
          </div>
        </div>

        {/* Right: Global Floating Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Admin Control Panel Button (Only for General Admin) */}
          {isGeneralAdmin && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
              title={isAr ? 'فتح لوحة التحكم المركزية' : 'Open General Admin Control Panel'}
            >
              <ShieldAlert className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>{isAr ? 'لوحة التحكم' : 'Admin Panel'}</span>
            </button>
          )}

          {/* User Persona Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <select
              value={currentUser.id}
              onChange={(e) => onSelectUser(e.target.value)}
              className="bg-transparent text-xs text-slate-800 font-bold focus:outline-none cursor-pointer max-w-[150px] truncate"
              title={isAr ? 'تبديل المستخدم' : 'Switch live user persona'}
            >
              {usersList.map((u) => (
                <option key={u.id} value={u.id} className="bg-white text-slate-900">
                  {isAr ? u.nameAr : (u.name || u.nameAr)}
                </option>
              ))}
            </select>
          </div>

          {/* Language Toggle */}
          <button
            type="button"
            onClick={onToggleLanguage}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold transition cursor-pointer text-slate-700 shadow-2xs"
            title={isAr ? 'تبديل اللغة' : 'Toggle Language'}
          >
            <Globe className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>{isAr ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </div>

      {/* 2. Module Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {MODULE_CARDS.map((card) => {
          const Icon = card.icon;
          const styling = getColorClasses(card.color);
          const isPermittedForUser =
            isGeneralAdmin ||
            (currentUser.allowedModules && currentUser.allowedModules.length > 0
              ? currentUser.allowedModules.includes(card.id)
              : true);
          const isAccessible = card.status === 'active' && isPermittedForUser;

          const permittedTabs = getPermittedTabs(card);
          const userSavedDefault = currentUser.defaultModuleTabs?.[card.id];
          const isUserDefaultPermitted = userSavedDefault && permittedTabs.some((t) => t.id === userSavedDefault);
          const isCardDefaultPermitted = permittedTabs.some((t) => t.id === card.defaultTab);

          // Strictly pick from visible/permitted tabs
          const effectiveDefaultTab =
            (isUserDefaultPermitted ? userSavedDefault : null) ||
            (isCardDefaultPermitted ? card.defaultTab : null) ||
            permittedTabs[0]?.id ||
            card.defaultTab;

          return (
            <div
              key={card.id}
              onClick={() => {
                if (isAccessible) {
                  onSelectModule(card.id, effectiveDefaultTab);
                }
              }}
              className={`bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between transition-all duration-200 shadow-2xs hover:shadow-md ${
                isAccessible ? `${styling.cardBorder} cursor-pointer` : 'opacity-80'
              } group`}
            >
              <div className="space-y-4">
                {/* Top Row: Module Icon + Admin Permissions Shortcut */}
                <div className="flex items-center justify-between gap-2">
                  <div className={`p-3 rounded-xl border ${styling.iconBg}`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  {isGeneralAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAdminPermissions('module', card.id || card.permissionModuleKey);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition border border-transparent hover:border-emerald-200 cursor-pointer"
                      title={isAr ? `صلاحيات ومصفوفة وحدة: ${card.titleAr}` : `Configure Permissions: ${card.titleEn}`}
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Module Title */}
                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition">
                  {isAr ? card.titleAr : card.titleEn}
                </h3>

                {/* Expandable Tab Chips */}
                {isAccessible && permittedTabs.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap gap-1.5">
                      {permittedTabs.map((tab) => {
                        const customConf = tabConfigs[tab.id];
                        const tabLabel = isAr ? (customConf?.labelAr || tab.labelAr) : (customConf?.labelEn || tab.labelEn);
                        const TabIcon = customConf?.iconName ? getIconComponent(customConf.iconName) : (tab.icon || Package);
                        const tabColor = customConf?.color || '#059669';
                        const { r, g, b } = hexToRgb(tabColor);

                        const chipKey = `${card.id}_${tab.id}`;
                        const isTapped = tappedChipKey === chipKey;
                        const isDefault = effectiveDefaultTab === tab.id;

                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectModule(card.id, tab.id);
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              setTappedChipKey(isTapped ? null : chipKey);
                            }}
                            style={isDefault ? {
                              background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.16) 0%, rgba(${r}, ${g}, ${b}, 0.05) 100%)`,
                              borderColor: `rgba(${r}, ${g}, ${b}, 0.4)`,
                              color: tabColor
                            } : undefined}
                            className={`group/chip relative inline-flex items-center p-1.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                              isDefault
                                ? 'shadow-2xs font-bold'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                            title={tabLabel}
                          >
                            <TabIcon
                              className="h-3.5 w-3.5 shrink-0 transition-colors"
                              style={isDefault ? { color: tabColor } : undefined}
                            />
                            <span
                              className={`text-[11px] truncate whitespace-nowrap transition-all duration-200 overflow-hidden ${
                                isTapped
                                  ? 'max-w-44 opacity-100 ms-1.5'
                                  : 'max-w-0 opacity-0 group-hover/chip:max-w-44 group-hover/chip:opacity-100 group-hover/chip:ms-1.5'
                              }`}
                            >
                              {tabLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Row: Wide & Discreet Default Tab Picker */}
              <div className="pt-3 mt-4 border-t border-slate-100">
                {isAccessible && permittedTabs.length > 0 ? (
                  <div
                    className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5 transition"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SlidersHorizontal className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                      {isAr ? 'الافتراضي:' : 'Default:'}
                    </span>
                    <select
                      value={effectiveDefaultTab}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdateDefaultTab(card.id, e.target.value);
                      }}
                      className="w-full bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer truncate"
                      title={isAr ? 'تحديد الشاشة الافتراضية عند فتح الوحدة' : 'Default entry tab'}
                    >
                      {permittedTabs.map((tab) => {
                        const customConf = tabConfigs[tab.id];
                        const tabLabel = isAr ? (customConf?.labelAr || tab.labelAr) : (customConf?.labelEn || tab.labelEn);
                        return (
                          <option key={tab.id} value={tab.id}>
                            {tabLabel}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs font-medium py-1">
                    <Lock className="h-3.5 w-3.5" />
                    <span>{isAr ? 'قيد التطوير' : 'Coming Soon'}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}