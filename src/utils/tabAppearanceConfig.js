import React from 'react';
import {
  Package,
  PackageCheck,
  PackageOpen,
  Boxes,
  Layers,
  Layers3,
  Box,
  Archive,
  FolderKanban,
  Building2,
  Factory,
  Warehouse,
  Store,
  ShoppingBag,
  ShoppingCart,
  FileText,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileCheck,
  Wrench,
  Cog,
  Settings,
  Sliders,
  SlidersHorizontal,
  Cpu,
  Gauge,
  FlaskConical,
  FlaskRound,
  TestTube,
  Atom,
  Pipette,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpRight,
  Shuffle,
  Repeat,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Scale,
  BadgeCheck,
  Award,
  TrendingUp,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Zap,
  Sparkles,
  Truck,
  Container,
  Tag,
  Barcode,
  QrCode,
  Printer,
  Search,
  LayoutDashboard,
  Home,
  Users,
  UserCheck,
  BadgeDollarSign,
  Coins,
  Receipt,
  Palette
} from 'lucide-react';

export const ICON_REGISTRY = {
  Package,
  PackageCheck,
  PackageOpen,
  Boxes,
  Layers,
  Layers3,
  Box,
  Archive,
  FolderKanban,
  Building2,
  Factory,
  Warehouse,
  Store,
  ShoppingBag,
  ShoppingCart,
  FileText,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileCheck,
  Wrench,
  Cog,
  Settings,
  Sliders,
  SlidersHorizontal,
  Cpu,
  Gauge,
  FlaskConical,
  FlaskRound,
  TestTube,
  Atom,
  Pipette,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpRight,
  Shuffle,
  Repeat,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Scale,
  BadgeCheck,
  Award,
  TrendingUp,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Zap,
  Sparkles,
  Truck,
  Container,
  Tag,
  Barcode,
  QrCode,
  Printer,
  Search,
  LayoutDashboard,
  Home,
  Users,
  UserCheck,
  BadgeDollarSign,
  Coins,
  Receipt,
  Palette
};

export const POPULAR_ICON_GROUPS = [
  {
    categoryAr: 'المخازن والخامات والتغليف',
    categoryEn: 'Warehouse, Materials & Packing',
    icons: [
      'Package',
      'PackageCheck',
      'PackageOpen',
      'Boxes',
      'Layers',
      'Layers3',
      'Box',
      'Archive',
      'FolderKanban',
      'Warehouse',
      'Barcode',
      'QrCode',
      'Tag',
      'Truck',
      'Container'
    ]
  },
  {
    categoryAr: 'التصنيع والتركيبات والمعمل',
    categoryEn: 'Production, Recipes & Lab',
    icons: [
      'Factory',
      'FlaskConical',
      'FlaskRound',
      'TestTube',
      'Atom',
      'Pipette',
      'Cog',
      'Wrench',
      'Scale',
      'Cpu',
      'Gauge',
      'Activity',
      'Zap',
      'Sparkles'
    ]
  },
  {
    categoryAr: 'المشتريات والتوريد والحركات',
    categoryEn: 'Procurement, Receipts & Movements',
    icons: [
      'ShoppingCart',
      'ShoppingBag',
      'Building2',
      'ArrowDownLeft',
      'ArrowLeftRight',
      'ArrowRightLeft',
      'ArrowUpRight',
      'Repeat',
      'Shuffle',
      'Receipt',
      'BadgeDollarSign',
      'Coins'
    ]
  },
  {
    categoryAr: 'المستندات والجرد والإدارة',
    categoryEn: 'Documents, Audits & Administration',
    icons: [
      'ClipboardCheck',
      'ClipboardList',
      'FileText',
      'FileSpreadsheet',
      'FileCheck',
      'CheckCircle2',
      'ShieldCheck',
      'ShieldAlert',
      'BadgeCheck',
      'Award',
      'LayoutDashboard',
      'Home',
      'Settings',
      'Sliders',
      'Palette',
      'Users',
      'TrendingUp',
      'BarChart3',
      'Printer'
    ]
  }
];

export const PRESET_COLOR_PALETTES = [
  { name: 'Emerald', hex: '#059669', labelAr: 'زمردي أخضر', labelEn: 'Emerald Green' },
  { name: 'Teal', hex: '#0d9488', labelAr: 'تركواز بحري', labelEn: 'Deep Teal' },
  { name: 'Cyan', hex: '#0891b2', labelAr: 'سماوي تانكات', labelEn: 'Vibrant Cyan' },
  { name: 'Blue', hex: '#2563eb', labelAr: 'أزرق ملكي', labelEn: 'Royal Blue' },
  { name: 'Indigo', hex: '#4f46e5', labelAr: 'نيلي تشغيل', labelEn: 'Deep Indigo' },
  { name: 'Violet', hex: '#7c3aed', labelAr: 'بنفسجي ملكي', labelEn: 'Royal Violet' },
  { name: 'Purple', hex: '#9333ea', labelAr: 'أرجواني تدقيق', labelEn: 'Purple' },
  { name: 'Amber', hex: '#d97706', labelAr: 'كهرماني وسيط', labelEn: 'Amber Gold' },
  { name: 'Orange', hex: '#ea580c', labelAr: 'برتقالي صيانة', labelEn: 'Flame Orange' },
  { name: 'Rose', hex: '#e11d48', labelAr: 'وردي تشغيل', labelEn: 'Ruby Rose' },
  { name: 'Red', hex: '#dc2626', labelAr: 'أحمر هالك وصرف', labelEn: 'Crimson Red' },
  { name: 'Slate', hex: '#475569', labelAr: 'رمادي صناعي', labelEn: 'Industrial Slate' }
];

export const DEFAULT_TABS_CONFIG = {
  items: {
    id: 'items',
    moduleKey: 'purchases',
    labelAr: 'كارت الأصناف والخامات',
    labelEn: 'Item Master',
    iconName: 'Package',
    color: '#059669',
    categoryAr: 'الخامات والمشتريات',
    categoryEn: 'Materials & Procurement'
  },
  suppliers: {
    id: 'suppliers',
    moduleKey: 'purchases',
    labelAr: 'سجل الموردين المعتمدين',
    labelEn: 'Supplier Master',
    iconName: 'Building2',
    color: '#0d9488',
    categoryAr: 'الخامات والمشتريات',
    categoryEn: 'Materials & Procurement'
  },
  orders: {
    id: 'orders',
    moduleKey: 'purchases',
    labelAr: 'أوامر الشراء (PO)',
    labelEn: 'Purchase Orders',
    iconName: 'ShoppingCart',
    color: '#2563eb',
    categoryAr: 'الخامات والمشتريات',
    categoryEn: 'Materials & Procurement'
  },
  receipts: {
    id: 'receipts',
    moduleKey: 'purchases',
    labelAr: 'إذن استلام خامات (GRN)',
    labelEn: 'Goods Receipt',
    iconName: 'ArrowDownLeft',
    color: '#0891b2',
    categoryAr: 'الخامات والمشتريات',
    categoryEn: 'Materials & Procurement'
  },
  transfers: {
    id: 'transfers',
    moduleKey: 'purchases',
    labelAr: 'تحويلات المخازن (TRN)',
    labelEn: 'Stock Transfers',
    iconName: 'ArrowLeftRight',
    color: '#4f46e5',
    categoryAr: 'المستودعات والحركات',
    categoryEn: 'Warehouses & Movement'
  },
  stock: {
    id: 'stock',
    moduleKey: 'purchases',
    labelAr: 'أرصدة المخازن وكارت الصنف',
    labelEn: 'Stock Balances',
    iconName: 'Boxes',
    color: '#0284c7',
    categoryAr: 'المستودعات والحركات',
    categoryEn: 'Warehouses & Movement'
  },
  stock_count: {
    id: 'stock_count',
    moduleKey: 'purchases',
    labelAr: 'الجرد والتسوية المخزنية',
    labelEn: 'Stock Count',
    iconName: 'ClipboardCheck',
    color: '#6366f1',
    categoryAr: 'المستودعات والحركات',
    categoryEn: 'Warehouses & Movement'
  },
  spare_parts: {
    id: 'spare_parts',
    moduleKey: 'purchases',
    labelAr: 'صرف قطع الغيار والمستهلكات (X)',
    labelEn: 'Spare Parts Issue',
    iconName: 'Wrench',
    color: '#ea580c',
    categoryAr: 'الصيانة والتشغيل',
    categoryEn: 'Maintenance & Spares'
  },
  finished_products: {
    id: 'finished_products',
    moduleKey: 'production',
    labelAr: 'سجل المنتجات التامة',
    labelEn: 'Finished Products Master',
    iconName: 'PackageCheck',
    color: '#2563eb',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  intermediate_bom: {
    id: 'intermediate_bom',
    moduleKey: 'production',
    labelAr: 'تصنيع الخامات الوسيطة (M)',
    labelEn: 'Intermediate Recipes (M)',
    iconName: 'FlaskConical',
    color: '#d97706',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  liquid_tanks: {
    id: 'liquid_tanks',
    moduleKey: 'production',
    labelAr: 'تشغيل وتانكات الخامات (M)',
    labelEn: 'Bulk Liquid Tanks (M)',
    iconName: 'Cog',
    color: '#0891b2',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  bom: {
    id: 'bom',
    moduleKey: 'production',
    labelAr: 'تعبئة وتغليف المنتج التام (BOM)',
    labelEn: 'Packing & Filling BOM',
    iconName: 'Layers',
    color: '#4f46e5',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  work_orders: {
    id: 'work_orders',
    moduleKey: 'production',
    labelAr: 'أوامر التشغيل والإنتاج',
    labelEn: 'Work Orders',
    iconName: 'Factory',
    color: '#b45309',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  material_issue: {
    id: 'material_issue',
    moduleKey: 'production',
    labelAr: 'صرف خامات للتشغيل',
    labelEn: 'Material Issue',
    iconName: 'ArrowDownLeft',
    color: '#dc2626',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  fg_inward: {
    id: 'fg_inward',
    moduleKey: 'production',
    labelAr: 'استلام المنتج التام',
    labelEn: 'Finished Goods Inward',
    iconName: 'CheckCircle2',
    color: '#16a34a',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  yield_recon: {
    id: 'yield_recon',
    moduleKey: 'production',
    labelAr: 'تدقيق الهالك والإنتاجية',
    labelEn: 'Yield & Scrap Audit',
    iconName: 'Scale',
    color: '#9333ea',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  admin_panel: {
    id: 'admin_panel',
    moduleKey: 'settings',
    labelAr: 'لوحة التحكم المركزية للمسؤول العام',
    labelEn: 'Central Admin Control Panel',
    iconName: 'ShieldAlert',
    color: '#059669',
    categoryAr: 'الإدارة المركزية',
    categoryEn: 'System Administration'
  }
};

const STORAGE_KEY = 'APP_TAB_APPEARANCE_CONFIG_V1';

export function getStoredTabConfigs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TABS_CONFIG };
    const parsed = JSON.parse(raw);
    // Merge defaults so any newly added tabs remain intact
    return {
      ...DEFAULT_TABS_CONFIG,
      ...parsed
    };
  } catch (err) {
    console.error('Failed to load tab appearance config from storage:', err);
    return { ...DEFAULT_TABS_CONFIG };
  }
}

export function getTabConfig(tabId) {
  const all = getStoredTabConfigs();
  if (all[tabId]) return all[tabId];
  return (
    DEFAULT_TABS_CONFIG[tabId] || {
      id: tabId,
      labelAr: tabId,
      labelEn: tabId,
      iconName: 'FileText',
      color: '#059669',
      categoryAr: 'عام',
      categoryEn: 'General'
    }
  );
}

export function saveTabConfig(tabId, partialConfig) {
  try {
    const current = getStoredTabConfigs();
    const updated = {
      ...current,
      [tabId]: {
        ...(current[tabId] || DEFAULT_TABS_CONFIG[tabId] || {}),
        ...partialConfig
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    dispatchTabConfigUpdatedEvent();
    return updated;
  } catch (err) {
    console.error('Failed to save tab config:', err);
    return null;
  }
}

export function saveAllTabConfigs(configsMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configsMap));
    dispatchTabConfigUpdatedEvent();
    return true;
  } catch (err) {
    console.error('Failed to save all tab configs:', err);
    return false;
  }
}

export function resetTabConfig(tabId) {
  try {
    const current = getStoredTabConfigs();
    if (DEFAULT_TABS_CONFIG[tabId]) {
      current[tabId] = { ...DEFAULT_TABS_CONFIG[tabId] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      dispatchTabConfigUpdatedEvent();
    }
    return current;
  } catch (err) {
    console.error('Failed to reset tab config:', err);
    return null;
  }
}

export function resetAllTabConfigs() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    dispatchTabConfigUpdatedEvent();
    return { ...DEFAULT_TABS_CONFIG };
  } catch (err) {
    console.error('Failed to reset all tab configs:', err);
    return { ...DEFAULT_TABS_CONFIG };
  }
}

export function dispatchTabConfigUpdatedEvent() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app_tab_config_updated'));
  }
}

export function getIconComponent(iconName) {
  return ICON_REGISTRY[iconName] || FileText;
}

/**
 * Creative background and watercolor styling helpers
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 5, g: 150, b: 105 };
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 5, g: 150, b: 105 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Generates an organic, subtle watercolor atmospheric glow / gradient style
 * for page header banners, cards, and modal backdrops.
 */
export function getAtmosphericWatercolorBannerStyle(hexColor) {
  const color = hexColor || '#059669';
  const { r, g, b } = hexToRgb(color);

  return {
    background: `
      radial-gradient(ellipse 70% 80% at 10% 20%, rgba(${r}, ${g}, ${b}, 0.14) 0%, transparent 60%),
      radial-gradient(ellipse 60% 70% at 90% 85%, rgba(${r}, ${g}, ${b}, 0.10) 0%, transparent 65%),
      radial-gradient(circle at 50% 50%, rgba(${r}, ${g}, ${b}, 0.04) 0%, transparent 80%),
      linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.05) 0%, #ffffff 50%, rgba(${r}, ${g}, ${b}, 0.06) 100%)
    `,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.22)`,
    boxShadow: `0 4px 20px -3px rgba(${r}, ${g}, ${b}, 0.08), 0 1px 3px 0 rgba(${r}, ${g}, ${b}, 0.04)`
  };
}

/**
 * Creative tab active button styling
 */
export function getTabActiveBackgroundStyle(hexColor, isActive = false) {
  const color = hexColor || '#059669';
  const { r, g, b } = hexToRgb(color);

  if (!isActive) {
    return {
      color: '#475569',
      '--hover-bg': `rgba(${r}, ${g}, ${b}, 0.07)`
    };
  }

  return {
    background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.14) 0%, rgba(${r}, ${g}, ${b}, 0.05) 100%)`,
    color: color,
    borderInlineStart: `3.5px solid ${color}`,
    boxShadow: `0 2px 8px -1px rgba(${r}, ${g}, ${b}, 0.12)`
  };
}
