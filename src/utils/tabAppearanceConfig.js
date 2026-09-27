import React from 'react';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, deleteField, onSnapshot, serverTimestamp } from 'firebase/firestore';
import {
  Package,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  PackagePlus,
  PackageMinus,
  PackageX,
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
  TrendingDown,
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
  Palette,
  Forklift,
  ScanBarcode,
  ScanLine,
  ScanQrCode,
  Scan,
  Weight,
  Ship,
  Plane,
  Milestone,
  Route,
  MapPin,
  Compass,
  Navigation,
  Hammer,
  Drill,
  HardHat,
  Microscope,
  Beaker,
  GlassWater,
  Droplet,
  Droplets,
  Cylinder,
  Nut,
  Disc,
  CircuitBoard,
  Radiation,
  Biohazard,
  Thermometer,
  Flame,
  Timer,
  Clock,
  Hourglass,
  Watch,
  Power,
  Plug,
  CreditCard,
  DollarSign,
  Percent,
  Banknote,
  Briefcase,
  Landmark,
  Wallet,
  PiggyBank,
  Calculator,
  HandCoins,
  CircleDollarSign,
  Handshake,
  Files,
  Folder,
  FolderPlus,
  FolderOpen,
  FilePlus,
  FileDiff,
  FileClock,
  FileStack,
  ListChecks,
  ListOrdered,
  ListTodo,
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  History,
  Bookmark,
  BookOpen,
  GraduationCap,
  Check,
  CheckCheck,
  AlertOctagon,
  HelpCircle,
  Info,
  AlertCircle,
  Target,
  Crosshair,
  Flag,
  Bell,
  BellRing,
  Star,
  Trophy,
  Crown,
  Medal,
  Kanban,
  Workflow,
  Network,
  GitBranch,
  GitCommit,
  Share2,
  Filter,
  ChevronUp,
  ChevronDown,
  Database
} from 'lucide-react';

export const ICON_REGISTRY = {
  Database,
  Package,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  PackagePlus,
  PackageMinus,
  PackageX,
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
  TrendingDown,
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
  Palette,
  Forklift,
  ScanBarcode,
  ScanLine,
  ScanQrCode,
  Scan,
  Weight,
  Ship,
  Plane,
  Milestone,
  Route,
  MapPin,
  Compass,
  Navigation,
  Hammer,
  Drill,
  HardHat,
  Microscope,
  Beaker,
  GlassWater,
  Droplet,
  Droplets,
  Cylinder,
  Nut,
  Disc,
  CircuitBoard,
  Radiation,
  Biohazard,
  Thermometer,
  Flame,
  Timer,
  Clock,
  Hourglass,
  Watch,
  Power,
  Plug,
  CreditCard,
  DollarSign,
  Percent,
  Banknote,
  Briefcase,
  Landmark,
  Wallet,
  PiggyBank,
  Calculator,
  HandCoins,
  CircleDollarSign,
  Handshake,
  Files,
  Folder,
  FolderPlus,
  FolderOpen,
  FilePlus,
  FileDiff,
  FileClock,
  FileStack,
  ListChecks,
  ListOrdered,
  ListTodo,
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  History,
  Bookmark,
  BookOpen,
  GraduationCap,
  Check,
  CheckCheck,
  AlertOctagon,
  HelpCircle,
  Info,
  AlertCircle,
  Target,
  Crosshair,
  Flag,
  Bell,
  BellRing,
  Star,
  Trophy,
  Crown,
  Medal,
  Kanban,
  Workflow,
  Network,
  GitBranch,
  GitCommit,
  Share2,
  Filter,
  ChevronUp,
  ChevronDown
};

export const POPULAR_ICON_GROUPS = [
  {
    categoryAr: 'المخازن والخامات والتغليف والتوزيع',
    categoryEn: 'Warehouse, Materials & Logistics',
    icons: [
      'Package',
      'PackageCheck',
      'PackageOpen',
      'PackageSearch',
      'PackagePlus',
      'PackageMinus',
      'PackageX',
      'Boxes',
      'Layers',
      'Layers3',
      'Box',
      'Archive',
      'FolderKanban',
      'Warehouse',
      'Forklift',
      'Truck',
      'Container',
      'Ship',
      'Plane',
      'Barcode',
      'QrCode',
      'ScanBarcode',
      'ScanLine',
      'ScanQrCode',
      'Scan',
      'Tag',
      'Weight',
      'Scale',
      'Route',
      'Milestone',
      'MapPin',
      'Navigation',
      'Compass'
    ]
  },
  {
    categoryAr: 'التصنيع والتشغيل والتركيبات والمعمل',
    categoryEn: 'Production, Recipes & Lab',
    icons: [
      'Factory',
      'FlaskConical',
      'FlaskRound',
      'TestTube',
      'Beaker',
      'GlassWater',
      'Droplet',
      'Droplets',
      'Atom',
      'Pipette',
      'Microscope',
      'Thermometer',
      'Flame',
      'Cog',
      'Wrench',
      'Hammer',
      'Drill',
      'HardHat',
      'Nut',
      'Disc',
      'Cylinder',
      'Cpu',
      'CircuitBoard',
      'Radiation',
      'Biohazard',
      'Gauge',
      'Timer',
      'Clock',
      'Hourglass',
      'Watch',
      'Activity',
      'Zap',
      'Sparkles',
      'Power',
      'Plug'
    ]
  },
  {
    categoryAr: 'المشتريات والتوريد والمبيعات والمالية',
    categoryEn: 'Procurement, Sales & Finance',
    icons: [
      'ShoppingCart',
      'ShoppingBag',
      'Store',
      'Building2',
      'ArrowDownLeft',
      'ArrowLeftRight',
      'ArrowRightLeft',
      'ArrowUpRight',
      'Repeat',
      'Shuffle',
      'Receipt',
      'CreditCard',
      'DollarSign',
      'CircleDollarSign',
      'BadgeDollarSign',
      'Banknote',
      'Coins',
      'HandCoins',
      'Wallet',
      'Landmark',
      'Briefcase',
      'Calculator',
      'PiggyBank',
      'Percent',
      'Handshake',
      'TrendingUp',
      'TrendingDown'
    ]
  },
  {
    categoryAr: 'المستندات والجودة والإدارة والجداول',
    categoryEn: 'Documents, Quality & Administration',
    icons: [
      'ClipboardCheck',
      'ClipboardList',
      'ListChecks',
      'ListOrdered',
      'ListTodo',
      'FileText',
      'Files',
      'FileSpreadsheet',
      'FileCheck',
      'FilePlus',
      'FileDiff',
      'FileClock',
      'FileStack',
      'Folder',
      'FolderPlus',
      'FolderOpen',
      'Calendar',
      'CalendarDays',
      'CalendarCheck',
      'CalendarRange',
      'CheckCircle2',
      'Check',
      'CheckCheck',
      'ShieldCheck',
      'ShieldAlert',
      'AlertOctagon',
      'AlertCircle',
      'BadgeCheck',
      'Award',
      'Medal',
      'Trophy',
      'Crown',
      'Star',
      'Target',
      'Crosshair',
      'Flag',
      'Bell',
      'BellRing',
      'LayoutDashboard',
      'Home',
      'Settings',
      'Sliders',
      'SlidersHorizontal',
      'Palette',
      'Users',
      'UserCheck',
      'Kanban',
      'Workflow',
      'Network',
      'GitBranch',
      'GitCommit',
      'Share2',
      'BarChart3',
      'PieChart',
      'LineChart',
      'Printer',
      'Search',
      'History',
      'Bookmark',
      'BookOpen',
      'GraduationCap',
      'Filter'
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
  // ==========================================
  // MASTER DATABASE MODULE (12 TABS)
  // ==========================================
  items: {
    id: 'items',
    moduleKey: 'master_data',
    order: 1,
    labelAr: 'كارت الأصناف والخامات',
    labelEn: 'Item Master',
    iconName: 'Package',
    color: '#059669',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  suppliers: {
    id: 'suppliers',
    moduleKey: 'master_data',
    order: 2,
    labelAr: 'سجل الموردين المعتمدين',
    labelEn: 'Supplier Master',
    iconName: 'Building2',
    color: '#0d9488',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  categories: {
    id: 'categories',
    moduleKey: 'master_data',
    order: 3,
    labelAr: 'مجموعات وتصنيفات التكويد',
    labelEn: 'Raw Material Categories',
    iconName: 'FolderKanban',
    color: '#0284c7',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  finished_products: {
    id: 'finished_products',
    moduleKey: 'master_data',
    order: 4,
    labelAr: 'سجل المنتجات التامة',
    labelEn: 'Finished Goods Master',
    iconName: 'PackageCheck',
    color: '#2563eb',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  finished_product_categories: {
    id: 'finished_product_categories',
    moduleKey: 'master_data',
    order: 5,
    labelAr: 'تصنيفات ومجموعات المنتج التام',
    labelEn: 'FG Categories & Lines',
    iconName: 'Boxes',
    color: '#6366f1',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  bom: {
    id: 'bom',
    moduleKey: 'master_data',
    order: 6,
    labelAr: 'تعبئة وتغليف المنتج التام (BOM)',
    labelEn: 'Packing & Filling BOM',
    iconName: 'Layers',
    color: '#4f46e5',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  intermediate_bom: {
    id: 'intermediate_bom',
    moduleKey: 'master_data',
    order: 7,
    labelAr: 'تصنيع الخامات الوسيطة (M)',
    labelEn: 'Intermediate Recipes (M)',
    iconName: 'FlaskConical',
    color: '#d97706',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  production_processes: {
    id: 'production_processes',
    moduleKey: 'master_data',
    order: 8,
    labelAr: 'مسارات ومراحل التشغيل (SOP)',
    labelEn: 'Production Processes & SOPs',
    iconName: 'Workflow',
    color: '#0891b2',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  warehouses: {
    id: 'warehouses',
    moduleKey: 'master_data',
    order: 9,
    labelAr: 'سجل المستودعات والصالات',
    labelEn: 'Warehouses Master',
    iconName: 'Warehouse',
    color: '#059669',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  production_workers: {
    id: 'production_workers',
    moduleKey: 'master_data',
    order: 10,
    labelAr: 'سجل عمالة وفنيي الإنتاج',
    labelEn: 'Production Workers',
    iconName: 'Users',
    color: '#8b5cf6',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  users: {
    id: 'users',
    moduleKey: 'master_data',
    order: 11,
    labelAr: 'المستخدمين والصلاحيات',
    labelEn: 'Users & Roles',
    iconName: 'ShieldCheck',
    color: '#10b981',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },
  system_config: {
    id: 'system_config',
    moduleKey: 'master_data',
    order: 12,
    labelAr: 'إعدادات وتهيئة النظام',
    labelEn: 'System Configuration',
    iconName: 'Settings',
    color: '#475569',
    categoryAr: 'البيانات الأساسية',
    categoryEn: 'Master Data'
  },

  // ==========================================
  // OPERATIONAL: PURCHASES & INVENTORY MODULE
  // ==========================================
  orders: {
    id: 'orders',
    moduleKey: 'purchases',
    order: 1,
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
    order: 2,
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
    order: 3,
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
    order: 4,
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
    order: 5,
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
    order: 6,
    labelAr: 'صرف قطع الغيار والمستهلكات (X)',
    labelEn: 'Spare Parts Issue',
    iconName: 'Wrench',
    color: '#ea580c',
    categoryAr: 'الصيانة والتشغيل',
    categoryEn: 'Maintenance & Spares'
  },

  // ==========================================
  // OPERATIONAL: PRODUCTION & SHOP FLOOR MODULE
  // ==========================================
  work_orders: {
    id: 'work_orders',
    moduleKey: 'production',
    order: 1,
    labelAr: 'أوامر التشغيل والإنتاج',
    labelEn: 'Work Orders',
    iconName: 'Factory',
    color: '#b45309',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  liquid_tanks: {
    id: 'liquid_tanks',
    moduleKey: 'production',
    order: 2,
    labelAr: 'تشغيل وتانكات الخامات (M)',
    labelEn: 'Bulk Liquid Tanks (M)',
    iconName: 'Cog',
    color: '#0891b2',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  liquid_storage: {
    id: 'liquid_storage',
    moduleKey: 'production',
    order: 3,
    labelAr: 'خزانات وتدفق السوائل بالصالة',
    labelEn: 'Floor Liquid Storage & Bulk Flow',
    iconName: 'Activity',
    color: '#0284c7',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  faulty_fg: {
    id: 'faulty_fg',
    moduleKey: 'production',
    order: 4,
    labelAr: 'مرتجعات ومعيب المنتج التام',
    labelEn: 'Faulty FG & Returns',
    iconName: 'AlertOctagon',
    color: '#e11d48',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  fg_inward: {
    id: 'fg_inward',
    moduleKey: 'production',
    order: 5,
    labelAr: 'استلام المنتج التام',
    labelEn: 'Finished Goods Inward',
    iconName: 'CheckCircle2',
    color: '#16a34a',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  production_reports: {
    id: 'production_reports',
    moduleKey: 'production',
    order: 6,
    labelAr: 'تقارير الإنتاجية والأداء التنفيذي',
    labelEn: 'Production & Performance Reports',
    iconName: 'BarChart3',
    color: '#4f46e5',
    categoryAr: 'الإنتاج والتشغيل',
    categoryEn: 'Production & Manufacturing'
  },
  admin_panel: {
    id: 'admin_panel',
    moduleKey: 'settings',
    order: 1,
    labelAr: 'لوحة التحكم المركزية للمسؤول العام',
    labelEn: 'Central Admin Control Panel',
    iconName: 'ShieldAlert',
    color: '#059669',
    categoryAr: 'الإدارة المركزية',
    categoryEn: 'System Administration'
  }
};

const STORAGE_KEY = 'APP_TAB_APPEARANCE_CONFIG_V1';
const TAB_APPEARANCE_DOC_REF = doc(db, 'system_config', 'tab_appearance');

let inMemoryTabConfigs = null;
let isLiveSyncInitialized = false;
let syncTimeoutId = null;

const DEPRECATED_TAB_IDS = ['material_issue', 'yield_recon'];

/**
 * Deeply merges stored or incoming configs with DEFAULT_TABS_CONFIG
 * so every tab retains its default properties (order, moduleKey, icon, labels)
 * even if Firestore stores partial overrides.
 */
export function mergeWithDefaults(incomingConfigs) {
  const merged = {};
  Object.keys(DEFAULT_TABS_CONFIG).forEach((id) => {
    if (DEPRECATED_TAB_IDS.includes(id)) return;
    const fallback = DEFAULT_TABS_CONFIG[id];
    const override = incomingConfigs ? incomingConfigs[id] : null;
    merged[id] = {
      ...fallback,
      ...(override || {}),
      // Structural fields must always come from DEFAULT — never from stored overrides.
      // This prevents stale Firestore/localStorage data from misclassifying tabs.
      id: fallback.id,
      moduleKey: fallback.moduleKey,
    };
    if (typeof merged[id].order !== 'number') {
      merged[id].order = fallback.order || 99;
    }
  });

  if (incomingConfigs) {
    Object.keys(incomingConfigs).forEach((id) => {
      if (DEPRECATED_TAB_IDS.includes(id)) return;
      if (!merged[id]) {
        merged[id] = incomingConfigs[id];
      }
    });
  }

  DEPRECATED_TAB_IDS.forEach((id) => {
    delete merged[id];
  });
  return merged;
}

/**
 * Initializes real-time bi-directional sync with Cloud Firestore
 * Listeners receive updates whenever an admin modifies tab appearance from any device.
 */
export function initTabAppearanceLiveSync(onSyncCallback = null) {
  if (typeof window === 'undefined') return () => {};
  if (isLiveSyncInitialized) return () => {};
  isLiveSyncInitialized = true;

  try {
    const unsubscribe = onSnapshot(
      TAB_APPEARANCE_DOC_REF,
      (snap) => {
        if (snap.exists()) {
          const cloudData = snap.data();
          const cloudConfigs = cloudData?.configs || {};

          // Purge deprecated tab keys from Firestore if they still exist
          if (cloudConfigs?.yield_recon || cloudConfigs?.material_issue) {
            updateDoc(TAB_APPEARANCE_DOC_REF, {
              'configs.yield_recon': deleteField(),
              'configs.material_issue': deleteField()
            }).catch((err) => console.warn('Purged deprecated tab config from Firestore:', err));
          }

          const merged = mergeWithDefaults(cloudConfigs);
          inMemoryTabConfigs = merged;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          } catch (e) {
            console.warn('LocalStorage tab config write error:', e);
          }
          dispatchTabConfigUpdatedEvent();
          if (typeof onSyncCallback === 'function') onSyncCallback(merged);
        } else {
          // Document does not exist yet in Firestore: seed with current local or default configs
          const currentLocal = getStoredTabConfigs();
          setDoc(
            TAB_APPEARANCE_DOC_REF,
            {
              configs: currentLocal,
              updatedAt: serverTimestamp(),
              initializedBy: 'system_auto_seed'
            },
            { merge: true }
          ).catch((err) => {
            console.warn('Initial seeding of tab appearance to Firestore failed:', err.message);
          });
        }
      },
      (error) => {
        console.warn('Firestore tab appearance live sync listener error:', error.message);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to initialize Firestore tab appearance sync:', err);
    return () => {};
  }
}

// Auto-boot live sync in browser environments and clean cached localStorage
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Remove deprecated tab keys
      delete parsed.yield_recon;
      delete parsed.material_issue;
      // Re-merge with current defaults to fix any stale moduleKey / structural fields.
      // This ensures newly added tabs (e.g. master_data module) always appear correctly
      // even when the browser has a cached version from before they were added.
      const remerged = mergeWithDefaults(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remerged));
    }
  } catch (e) {}
  initTabAppearanceLiveSync();
}

export function getStoredTabConfigs() {
  if (inMemoryTabConfigs) {
    return mergeWithDefaults(inMemoryTabConfigs);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TABS_CONFIG };
    const parsed = JSON.parse(raw);
    inMemoryTabConfigs = mergeWithDefaults(parsed);
    return inMemoryTabConfigs;
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
      categoryEn: 'General',
      order: 99
    }
  );
}

function flushToFirestore(configsMap) {
  if (syncTimeoutId) {
    clearTimeout(syncTimeoutId);
    syncTimeoutId = null;
  }
  const cleanConfigs = { ...configsMap };
  delete cleanConfigs.yield_recon;
  delete cleanConfigs.material_issue;
  return setDoc(
    TAB_APPEARANCE_DOC_REF,
    {
      configs: cleanConfigs,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  ).catch((err) => {
    console.error('Error syncing tab appearance to Firestore:', err);
  });
}

function queueFirestoreSync(configsMap, isImmediate = false) {
  if (syncTimeoutId) {
    clearTimeout(syncTimeoutId);
    syncTimeoutId = null;
  }

  if (isImmediate) {
    return flushToFirestore(configsMap);
  }

  syncTimeoutId = setTimeout(() => {
    flushToFirestore(configsMap);
  }, 600);
}

export function saveTabConfig(tabId, partialConfig, isImmediate = false) {
  try {
    const current = getStoredTabConfigs();
    const updated = {
      ...current,
      [tabId]: {
        ...(current[tabId] || DEFAULT_TABS_CONFIG[tabId] || {}),
        ...partialConfig
      }
    };
    inMemoryTabConfigs = updated;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    dispatchTabConfigUpdatedEvent();
    queueFirestoreSync(updated, isImmediate);
    return updated;
  } catch (err) {
    console.error('Failed to save tab config:', err);
    return null;
  }
}

export function saveAllTabConfigs(configsMap) {
  try {
    inMemoryTabConfigs = configsMap;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configsMap));
    dispatchTabConfigUpdatedEvent();
    flushToFirestore(configsMap);
    return true;
  } catch (err) {
    console.error('Failed to save all tab configs:', err);
    return false;
  }
}

/**
 * Reorders a tab within its module by moving it 'up' (earlier) or 'down' (later).
 * Normalizes order numbers (1, 2, 3...) and immediately persists to Firestore.
 */
export function reorderTabInModule(moduleKey, tabId, direction) {
  try {
    const current = getStoredTabConfigs();
    const moduleTabs = Object.values(current)
      .filter((t) => t.moduleKey === moduleKey)
      .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

    const currentIndex = moduleTabs.findIndex((t) => t.id === tabId);
    if (currentIndex === -1) return current;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= moduleTabs.length) {
      return current; // already at extreme edge
    }

    // Swap adjacent tabs
    const temp = moduleTabs[currentIndex];
    moduleTabs[currentIndex] = moduleTabs[targetIndex];
    moduleTabs[targetIndex] = temp;

    // Normalize order 1, 2, 3...
    const updated = { ...current };
    moduleTabs.forEach((tab, index) => {
      updated[tab.id] = {
        ...tab,
        order: index + 1
      };
    });

    saveAllTabConfigs(updated);
    return updated;
  } catch (err) {
    console.error('Failed to reorder tab in module:', err);
    return null;
  }
}

export function resetTabConfig(tabId) {
  try {
    const current = getStoredTabConfigs();
    if (DEFAULT_TABS_CONFIG[tabId]) {
      current[tabId] = { ...DEFAULT_TABS_CONFIG[tabId] };
      inMemoryTabConfigs = current;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      dispatchTabConfigUpdatedEvent();
      flushToFirestore(current);
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
    inMemoryTabConfigs = { ...DEFAULT_TABS_CONFIG };
    dispatchTabConfigUpdatedEvent();
    flushToFirestore(DEFAULT_TABS_CONFIG);
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
