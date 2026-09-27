import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Palette,
  Search,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Sliders,
  Eye,
  ChevronUp,
  ChevronDown,
  X,
  Layers,
  ArrowRight,
  Filter,
  Cloud,
  ArrowUpDown
} from 'lucide-react';
import {
  DEFAULT_TABS_CONFIG,
  getStoredTabConfigs,
  saveTabConfig,
  saveAllTabConfigs,
  reorderTabInModule,
  resetTabConfig,
  resetAllTabConfigs,
  ICON_REGISTRY,
  POPULAR_ICON_GROUPS,
  PRESET_COLOR_PALETTES,
  getIconComponent,
  getAtmosphericWatercolorBannerStyle,
  hexToRgb
} from '../utils/tabAppearanceConfig';

export default function TabAppearanceManager({
  currentUser = {},
  initialTabFocus = null,
  onClose = null
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [tabConfigs, setTabConfigs] = useState(() => getStoredTabConfigs());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState('all');
  const [iconPickerTargetTab, setIconPickerTargetTab] = useState(null);
  const [iconPickerSearch, setIconPickerSearch] = useState('');
  const [saveToast, setSaveToast] = useState(null);
  const [focusedTabId, setFocusedTabId] = useState(initialTabFocus);

  // Sync state if storage changes externally
  useEffect(() => {
    const handleUpdate = () => {
      setTabConfigs(getStoredTabConfigs());
    };
    window.addEventListener('app_tab_config_updated', handleUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleUpdate);
  }, []);

  // Compute ordered siblings map per module to accurately determine first/last positions
  const moduleTabsMap = useMemo(() => {
    const map = {};
    Object.values(tabConfigs).forEach((t) => {
      const mod = t.moduleKey || 'purchases';
      if (!map[mod]) map[mod] = [];
      map[mod].push(t);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
    });
    return map;
  }, [tabConfigs]);

  // Filter tabs and sort strictly by module and order sequence
  const tabList = useMemo(() => {
    const list = Object.values(tabConfigs).filter((tab) => {
      if (selectedModuleFilter !== 'all' && tab.moduleKey !== selectedModuleFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        tab.id.toLowerCase().includes(q) ||
        (tab.labelAr && tab.labelAr.toLowerCase().includes(q)) ||
        (tab.labelEn && tab.labelEn.toLowerCase().includes(q)) ||
        (tab.categoryAr && tab.categoryAr.toLowerCase().includes(q)) ||
        (tab.categoryEn && tab.categoryEn.toLowerCase().includes(q))
      );
    });

    const moduleOrder = { master_data: 1, purchases: 2, production: 3, settings: 4 };
    return list.sort((a, b) => {
      if (a.moduleKey !== b.moduleKey) {
        return (moduleOrder[a.moduleKey] || 99) - (moduleOrder[b.moduleKey] || 99);
      }
      return (Number(a.order) || 99) - (Number(b.order) || 99);
    });
  }, [tabConfigs, searchQuery, selectedModuleFilter]);

  const handleUpdateTab = (tabId, field, value) => {
    const updated = {
      ...tabConfigs[tabId],
      [field]: value
    };
    const newMap = {
      ...tabConfigs,
      [tabId]: updated
    };
    setTabConfigs(newMap);
    const isImmediate = field === 'iconName' || field === 'color';
    saveTabConfig(tabId, { [field]: value }, isImmediate);
    showSaveToast(isAr ? 'تم حفظ التعديل سحابياً لكافة المستخدمين' : 'Changes saved globally to Cloud Firestore');
  };

  const handleReorderTab = (moduleKey, tabId, direction) => {
    const updated = reorderTabInModule(moduleKey, tabId, direction);
    if (updated) {
      setTabConfigs(updated);
      showSaveToast(isAr ? 'تم تحديث ترتيب التبويبات وحفظه سحابياً' : 'Tab order updated & saved globally to cloud');
    }
  };

  const handleResetSingleTab = (tabId) => {
    const res = resetTabConfig(tabId);
    if (res) {
      setTabConfigs(res);
      showSaveToast(isAr ? 'تمت استعادة الإعدادات الأصلية وحفظها سحابياً' : 'Tab restored to defaults & synced to cloud');
    }
  };

  const handleResetAll = () => {
    const confirmMsg = isAr
      ? 'هل أنت متأكد من رغبتك في استعادة الإعدادات الأصلية لجميع التبويبات والمسميات والألوان والترتيب سحابياً؟'
      : 'Are you sure you want to reset all tab names, icons, order, and colors to factory defaults in Cloud Firestore?';
    if (window.confirm(confirmMsg)) {
      const res = resetAllTabConfigs();
      setTabConfigs(res);
      showSaveToast(isAr ? 'تمت استعادة إعدادات المصنع لجميع التبويبات سحابياً' : 'All tabs reset to factory defaults globally');
    }
  };

  const showSaveToast = (msg) => {
    setSaveToast(msg);
    setTimeout(() => {
      setSaveToast(null);
    }, 3000);
  };

  // Icon Picker Filter
  const filteredIconGroups = useMemo(() => {
    if (!iconPickerSearch.trim()) return POPULAR_ICON_GROUPS;
    const q = iconPickerSearch.toLowerCase().trim();
    return POPULAR_ICON_GROUPS.map((group) => ({
      ...group,
      icons: group.icons.filter((iconName) => iconName.toLowerCase().includes(q))
    })).filter((group) => group.icons.length > 0);
  }, [iconPickerSearch]);

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {saveToast && (
        <div className="fixed bottom-6 start-1/2 -translate-x-1/2 z-90 bg-emerald-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-3 border border-emerald-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Top Banner / Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-200 text-indigo-700 rounded-2xl">
              <Palette className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'تخصيص مظهر ومسميات وترتيب التبويبات' : 'Tab Styling, Icons, Sorting & Color Manager'}</span>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                  <Cloud className="h-3 w-3" />
                  <span>{isAr ? 'مزامنة سحابية عامة' : 'Global Cloud Sync'}</span>
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                {isAr
                  ? 'تحكم مركزي سحابي ينعكس فورياً على كافة مستخدمي النظام: مسميات التبويبات (عربي/إنجليزي)، اختيار الأيقونات، ترتيب تسلسل التبويبات داخل كل وحدة، وتعيين الألوان والتوهج المائي عبر التطبيق بالكامل.'
                  : 'Central global configuration synced via Cloud Firestore across all users: tab display names (AR/EN), modern icons, tab ordering sequence within modules, and dynamic watercolor glow colors throughout the ERP.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAll}
              className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition cursor-pointer flex items-center gap-1.5"
              title={isAr ? 'استعادة إعدادات المصنع لجميع التبويبات' : 'Reset all to factory defaults'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isAr ? 'استعادة ضبط المصنع' : 'Reset All Defaults'}</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" />
              <span>{isAr ? 'الوحدة:' : 'Module:'}</span>
            </span>
            {[
              { id: 'all', labelAr: 'الكل', labelEn: 'All' },
              { id: 'master_data', labelAr: 'قاعدة البيانات الأساسية', labelEn: 'Master Database' },
              { id: 'purchases', labelAr: 'الخامات والمخازن', labelEn: 'Materials & Stock' },
              { id: 'production', labelAr: 'الإنتاج والتشغيل', labelEn: 'Production' },
              { id: 'settings', labelAr: 'الإدارة', labelEn: 'Admin' }
            ].map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => setSelectedModuleFilter(mod.id)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  selectedModuleFilter === mod.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isAr ? mod.labelAr : mod.labelEn}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث في التبويبات والمسميات...' : 'Search tabs & labels...'}
              className="w-full ps-9 pe-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>
        </div>
      </div>

      {/* Tabs Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {tabList.map((tab) => {
          const Icon = getIconComponent(tab.iconName);
          const color = tab.color || '#059669';
          const { r, g, b } = hexToRgb(color);
          const isFocused = focusedTabId === tab.id;

          const siblings = moduleTabsMap[tab.moduleKey] || [];
          const tabIndexInModule = siblings.findIndex((t) => t.id === tab.id);
          const isFirstInModule = tabIndexInModule <= 0;
          const isLastInModule = tabIndexInModule === -1 || tabIndexInModule >= siblings.length - 1;
          const currentOrderDisplay = tab.order || (tabIndexInModule >= 0 ? tabIndexInModule + 1 : 1);

          return (
            <div
              key={tab.id}
              id={`tab-config-${tab.id}`}
              className={`bg-white rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between ${
                isFocused
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="space-y-4">
                {/* Tab Header Row: Icon Button + Identifier + Order controls + Reset Button */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIconPickerTargetTab(tab.id)}
                      className="p-2.5 rounded-xl border shadow-xs transition-transform hover:scale-105 cursor-pointer flex items-center justify-center relative group"
                      style={{
                        background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.16) 0%, rgba(${r}, ${g}, ${b}, 0.08) 100%)`,
                        borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
                        color: color
                      }}
                      title={isAr ? 'انقر لتغيير أيقونة التبويب' : 'Click to change tab icon'}
                    >
                      <Icon className="h-5 w-5 drop-shadow-xs" />
                      <div className="absolute inset-0 rounded-xl bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[9px] font-bold">
                        {isAr ? 'تغيير' : 'Edit'}
                      </div>
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-800">
                          #{tab.id}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
                            color: color
                          }}
                        >
                          {isAr ? tab.categoryAr : tab.categoryEn}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Icon: {tab.iconName} • Color: {color}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* In-module sorting controls */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span
                        className="text-[11px] font-mono font-black text-slate-700 px-2 min-w-[32px] text-center"
                        title={
                          isAr
                            ? `الترتيب بالوحدة (${tab.moduleKey}): رقم ${currentOrderDisplay}`
                            : `Order in ${tab.moduleKey}: #${currentOrderDisplay}`
                        }
                      >
                        #{currentOrderDisplay}
                      </span>
                      <button
                        type="button"
                        disabled={isFirstInModule}
                        onClick={() => handleReorderTab(tab.moduleKey, tab.id, 'up')}
                        className={`p-1 rounded-lg transition ${
                          isFirstInModule
                            ? 'text-slate-300 cursor-not-allowed'
                            : 'text-slate-600 hover:text-indigo-600 hover:bg-white cursor-pointer shadow-2xs'
                        }`}
                        title={isAr ? 'تقديم التبويب لأعلى في الترتيب' : 'Move tab up in sequence'}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isLastInModule}
                        onClick={() => handleReorderTab(tab.moduleKey, tab.id, 'down')}
                        className={`p-1 rounded-lg transition ${
                          isLastInModule
                            ? 'text-slate-300 cursor-not-allowed'
                            : 'text-slate-600 hover:text-indigo-600 hover:bg-white cursor-pointer shadow-2xs'
                        }`}
                        title={isAr ? 'تأخير التبويب لأسفل في الترتيب' : 'Move tab down in sequence'}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleResetSingleTab(tab.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                      title={isAr ? 'استعادة إعدادات هذا التبويب الأصلية' : 'Reset this tab to default'}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Editable Display Names (Arabic and English) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      {isAr ? 'الاسم بالعربية' : 'Arabic Display Name'}
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={tab.labelAr || ''}
                      onChange={(e) => handleUpdateTab(tab.id, 'labelAr', e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      {isAr ? 'الاسم بالإنجليزية' : 'English Display Name'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={tab.labelEn || ''}
                      onChange={(e) => handleUpdateTab(tab.id, 'labelEn', e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition font-sans"
                    />
                  </div>
                </div>

                {/* Color Palette Selector + Custom Hex Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-700">
                      {isAr ? 'اللون المميز والخلفية المائية' : 'Tab Color & Watercolor Theme'}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => handleUpdateTab(tab.id, 'color', e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                        title={isAr ? 'اختيار لون مخصص' : 'Custom color picker'}
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => {
                          if (e.target.value.startsWith('#') || e.target.value.length <= 7) {
                            handleUpdateTab(tab.id, 'color', e.target.value);
                          }
                        }}
                        className="w-20 font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-center focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Preset Swatches */}
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLOR_PALETTES.map((palette) => {
                      const isSelected = color.toLowerCase() === palette.hex.toLowerCase();
                      return (
                        <button
                          key={palette.name}
                          type="button"
                          onClick={() => handleUpdateTab(tab.id, 'color', palette.hex)}
                          className={`w-6 h-6 rounded-lg transition-transform cursor-pointer relative ${
                            isSelected ? 'scale-115 ring-2 ring-slate-900 ring-offset-1 z-10' : 'hover:scale-110 opacity-90'
                          }`}
                          style={{ backgroundColor: palette.hex }}
                          title={`${isAr ? palette.labelAr : palette.labelEn} (${palette.hex})`}
                        >
                          {isSelected && (
                            <CheckCircle2 className="h-3 w-3 text-white absolute inset-0 m-auto drop-shadow-xs" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Preview Bar */}
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-2">
                    {isAr ? 'معاينة المظهر الحية عبر الشاشات:' : 'Live Component Previews:'}
                  </span>

                  <div className="space-y-2">
                    {/* 1. Header Banner Preview */}
                    <div
                      className="p-2.5 rounded-xl border transition-all"
                      style={getAtmosphericWatercolorBannerStyle(color)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="p-1.5 rounded-lg border shadow-2xs"
                          style={{
                            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)`,
                            borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
                            color: color
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-black text-slate-900 truncate">
                          {isAr ? tab.labelAr : tab.labelEn}
                        </span>
                        <span
                          className="ms-auto text-[9px] font-bold px-1.5 py-0.5 rounded border"
                          style={{
                            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
                            borderColor: `rgba(${r}, ${g}, ${b}, 0.2)`,
                            color: color
                          }}
                        >
                          {isAr ? 'بنر مائي' : 'Atmospheric Glow'}
                        </span>
                      </div>
                    </div>

                    {/* 2. Sidebar Tab Preview (Active & Inactive) */}
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold border-s-3 shadow-2xs"
                        style={{
                          background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.14) 0%, rgba(${r}, ${g}, ${b}, 0.05) 100%)`,
                          borderInlineStartColor: color,
                          color: color
                        }}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                        <span className="truncate">{isAr ? tab.labelAr : tab.labelEn}</span>
                        <span className="text-[9px] ms-auto opacity-75 font-mono">{isAr ? 'نشط' : 'Active'}</span>
                      </div>

                      <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-slate-600 bg-slate-50 border border-slate-200">
                        <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{isAr ? tab.labelAr : tab.labelEn}</span>
                        <span className="text-[9px] ms-auto text-slate-400 font-mono">{isAr ? 'عادي' : 'Idle'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modern Icon Picker Modal */}
      {iconPickerTargetTab && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {isAr ? 'اختيار أيقونة للتبويب' : 'Select Tab Icon'}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono">
                    #{iconPickerTargetTab}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIconPickerTargetTab(null);
                  setIconPickerSearch('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Search */}
            <div className="p-3 border-b border-slate-100 bg-white">
              <div className="relative">
                <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={iconPickerSearch}
                  onChange={(e) => setIconPickerSearch(e.target.value)}
                  placeholder={isAr ? 'بحث في أسماء الأيقونات (Factory, Package, Layers...)' : 'Search icon names...'}
                  className="w-full ps-9 pe-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white"
                  autoFocus
                />
              </div>
            </div>

            {/* Icon Grid Groups */}
            <div className="p-4 overflow-y-auto space-y-5 flex-1 max-h-[55vh]">
              {filteredIconGroups.map((group, gIdx) => (
                <div key={gIdx}>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                    {isAr ? group.categoryAr : group.categoryEn}
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
                    {group.icons.map((iconName) => {
                      const IconComp = ICON_REGISTRY[iconName];
                      if (!IconComp) return null;
                      const currentSelected = tabConfigs[iconPickerTargetTab]?.iconName === iconName;

                      return (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() => {
                            handleUpdateTab(iconPickerTargetTab, 'iconName', iconName);
                            setIconPickerTargetTab(null);
                            setIconPickerSearch('');
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border transition cursor-pointer gap-1 group ${
                            currentSelected
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700'
                          }`}
                          title={iconName}
                        >
                          <IconComp className="h-5 w-5 group-hover:scale-110 transition-transform" />
                          <span className="text-[9px] font-mono text-slate-500 truncate w-full text-center group-hover:text-indigo-600">
                            {iconName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIconPickerTargetTab(null);
                  setIconPickerSearch('');
                }}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
