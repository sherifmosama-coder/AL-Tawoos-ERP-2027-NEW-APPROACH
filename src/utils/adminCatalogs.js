import { Timestamp } from 'firebase/firestore';
import { APP_ARCHITECTURE, getMasterCollectionsRegistry } from '../config/appArchitecture';
import { OPERATIONAL_COLLECTIONS_COMPLETE } from './systemRestoreScopeCatalog';

export function serializeForBackup(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp || (typeof value === 'object' && typeof value.toDate === 'function' && typeof value.seconds === 'number')) {
    return {
      _type: 'firestore_timestamp',
      _seconds: value.seconds,
      _nanoseconds: value.nanoseconds || 0,
    };
  }
  if (value instanceof Date) {
    return {
      _type: 'date_iso',
      _iso: value.toISOString(),
    };
  }
  if (Array.isArray(value)) {
    return value.map(serializeForBackup);
  }
  if (typeof value === 'object') {
    const serializedObj = {};
    Object.entries(value).forEach(([k, v]) => {
      serializedObj[k] = serializeForBackup(v);
    });
    return serializedObj;
  }
  return value;
}

export function hydrateFromBackup(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && value._type === 'firestore_timestamp') {
    return new Timestamp(value._seconds, value._nanoseconds || 0);
  }
  if (typeof value === 'object' && value._type === 'date_iso') {
    return new Date(value._iso);
  }
  if (Array.isArray(value)) {
    return value.map(hydrateFromBackup);
  }
  if (typeof value === 'object') {
    const hydratedObj = {};
    Object.entries(value).forEach(([k, v]) => {
      hydratedObj[k] = hydrateFromBackup(v);
    });
    return hydratedObj;
  }
  return value;
}

// Base Registry for Standard Entity Descriptions & Categories
export const STATIC_GRAPH_METADATA = {
  items: { labelAr: 'سجل الخامات ومستلزمات الإنتاج', labelEn: 'Item Master (Raw Materials)', category: 'Master Data', color: '#059669' },
  suppliers: { labelAr: 'سجل الموردين المعتمدين', labelEn: 'Suppliers Master', category: 'Master Data', color: '#0d6cba' },
  warehouses: { labelAr: 'سجل المستودعات والصالات', labelEn: 'Warehouses Master', category: 'Master Data', color: '#4f46e5' },
  users: { labelAr: 'سجل المستخدمين والمشرفين', labelEn: 'User Accounts', category: 'Master Data', color: '#0284c7' },
  departments: { labelAr: 'الأقسام والإدارات وصلاحياتها', labelEn: 'Departments & Permissions', category: 'Master Data', color: '#4f46e5' },
  employees: { labelAr: 'سجل الموظفين والعمالة والمستخدمين الموحد', labelEn: 'Unified Staff, Workers & Users', category: 'Master Data', color: '#0d9488' },
  categories: { labelAr: 'مجموعات وتصنيفات التكويد', labelEn: 'Category Groups', category: 'Master Data', color: '#6366f1' },
  finished_products: { labelAr: 'سجل المنتجات التامة', labelEn: 'Finished Goods Master', category: 'Master Data', color: '#e11d48' },
  finished_product_categories: { labelAr: 'تصنيفات ومجموعات المنتج التام', labelEn: 'FG Categories', category: 'Master Data', color: '#6366f1' },
  bom_recipes: { labelAr: 'شجرة وقوائم المكونات (BOM)', labelEn: 'Finished Goods BOM', category: 'Master Data', color: '#b45309' },
  intermediate_recipes: { labelAr: 'تركيبات الخامات الوسيطة (IBOM)', labelEn: 'Intermediate Recipes', category: 'Master Data', color: '#d97706' },
  production_processes: { labelAr: 'مسارات وعمليات التشغيل (SOPs)', labelEn: 'Production Processes & SOPs', category: 'Master Data', color: '#6366f1' },
  production_workers: { labelAr: 'سجل عمالة الإنتاج والورديات', labelEn: 'Production Workers Master', category: 'Master Data', color: '#8b5cf6' },
  system_config: { labelAr: 'إعدادات وتهيئة النظام', labelEn: 'System Configuration', category: 'Master Data', color: '#64748b' },
  cash_safes: { labelAr: 'سجل الخزائن والخزن النقدية', labelEn: 'Safes & Cash Vaults Master', category: 'Master Data', color: '#059669' },
  corporate_banks: { labelAr: 'سجل الحسابات والودائع البنكية', labelEn: 'Corporate Bank Accounts Master', category: 'Master Data', color: '#0d6cba' },
  vehicles: { labelAr: 'سجل أسطول الشاحنات والمركبات', labelEn: 'Vehicles & Fleet Master', category: 'Master Data', color: '#d97706' },
  chart_of_accounts: { labelAr: 'دليل شجرة الحسابات المحاسبية', labelEn: 'Chart of Accounts', category: 'Master Data', color: '#0284c7' },
  liquid_tanks: { labelAr: 'تشغيل وتانكات الخامات (M)', labelEn: 'Bulk Liquid Tanks', category: 'Production', color: '#0891b2' },
  floor_liquid_vessels: { labelAr: 'خزانات وتدفق السوائل بالصالة', labelEn: 'Floor Liquid Storage & Vessels', category: 'Production', color: '#0284c7' },
  production_transformations: { labelAr: 'حركات التحويل والتصنيع الداخلي', labelEn: 'Production Transformations', category: 'Inventory & Production', color: '#7c3aed' },
  work_orders: { labelAr: 'أوامر التشغيل والإنتاج (MO)', labelEn: 'Work Orders', category: 'Manufacturing', color: '#047857' },
  production_breaks: { labelAr: 'سجل فترات الراحة والتوقف', labelEn: 'Production Breaks & Downtime', category: 'Production', color: '#f43f5e' },
  staged_floor_materials: { labelAr: 'خامات ومستلزمات الصالة قيد التشغيل', labelEn: 'Staged Floor Materials', category: 'Production & Inventory', color: '#f59e0b' },
  staged_floor_pallets: { labelAr: 'بالتات الصالة المشدودة والمرحلة', labelEn: 'Staged Floor Pallets', category: 'Production & Inventory', color: '#10b981' },
  shift_handovers: { labelAr: 'تسليم واستلام الورديات وتتبع السيريال', labelEn: 'Shift Handovers & Serials', category: 'Production', color: '#06b6d4' },
  faulty_fg_returns: { labelAr: 'مرتجعات ومعيب المنتج التام (RTN)', labelEn: 'Faulty FG Returns', category: 'Quality & Production', color: '#ef4444' },
  fg_receipts: { labelAr: 'استلام وحفظ المنتج التام (FGR)', labelEn: 'FG Receipts', category: 'Finished Goods', color: '#10b981' },
  purchase_orders: { labelAr: 'أوامر الشراء (PO)', labelEn: 'Purchase Orders', category: 'Procurement', color: '#1d4ed8' },
  goods_receipts: { labelAr: 'أذون استلام المخزن (GRN/RTN)', labelEn: 'Goods Receipts & Returns', category: 'Inventory', color: '#0f766e' },
  stock_transfers: { labelAr: 'أذون التحويل المخزني (TRN)', labelEn: 'Stock Transfers', category: 'Inventory', color: '#6366f1' },
  stock_counts: { labelAr: 'الجرد الفعلي والتسويات', labelEn: 'Physical Stock Counts', category: 'Auditing', color: '#9333ea' },
  stock_ledger: { labelAr: 'سجل الحركات الدفتري العام', labelEn: 'Central Stock Ledger', category: 'Audit & Accounting', color: '#334155' },
  spare_parts_issues: { labelAr: 'صرف واستهلاك قطع الغيار (XISS)', labelEn: 'Spare Parts Consumption', category: 'Maintenance & Spares', color: '#f59e0b' },
};

// Dynamic Foreign Key & Relationship Inference Engine (100% Zero-Hardcoding)
export function resolveDynamicEntityRelations(targetCollection, sampleDocs = [], allDiscovered = []) {
  const meta = STATIC_GRAPH_METADATA[targetCollection] || {
    labelAr: targetCollection,
    labelEn: targetCollection,
    category: 'Dynamic Collection',
    color: '#0891b2',
  };

  const detectedUpstream = new Map();
  const detectedDownstream = new Map();

  // Known target collection mapping heuristic
  const knownForeignKeyPatterns = [
    { pattern: /(supplierId|vendorId|supplier)/i, target: 'suppliers', labelAr: 'المورد المعتمد', labelEn: 'Supplier' },
    { pattern: /(targetWarehouse|sourceWarehouse|warehouseId|warehouse)/i, target: 'warehouses', labelAr: 'المستودع', labelEn: 'Warehouse' },
    { pattern: /(itemId|itemCode|targetItemId|componentId)/i, target: 'items', labelAr: 'الخامة / الصنف', labelEn: 'Item Master' },
    { pattern: /(finishedProductId|productId|fgId)/i, target: 'finished_products', labelAr: 'المنتج التام', labelEn: 'Finished Product' },
    { pattern: /(poId|purchaseOrderId)/i, target: 'purchase_orders', labelAr: 'أمر الشراء', labelEn: 'Purchase Order' },
    { pattern: /(grnId|goodsReceiptId)/i, target: 'goods_receipts', labelAr: 'إذن الاستلام', labelEn: 'Goods Receipt' },
    { pattern: /(transferId|pipeTransferDocId)/i, target: 'stock_transfers', labelAr: 'إذن التحويل', labelEn: 'Stock Transfer' },
    { pattern: /(workOrderId|moId)/i, target: 'work_orders', labelAr: 'أمر الإنتاج', labelEn: 'Work Order' },
    { pattern: /(bomId|recipeId)/i, target: 'bom_recipes', labelAr: 'شجرة المكونات', labelEn: 'BOM Recipe' },
    { pattern: /(tankId)/i, target: 'liquid_tanks', labelAr: 'سجل التانك', labelEn: 'Liquid Tank' },
    { pattern: /(vesselId|liquidVesselId)/i, target: 'floor_liquid_vessels', labelAr: 'خزان تدفق السوائل', labelEn: 'Floor Liquid Vessel' },
    { pattern: /(processCode|processId)/i, target: 'production_processes', labelAr: 'مسار التشغيل', labelEn: 'Production Process' },
    { pattern: /(palletId|palletCode|floorPalletId)/i, target: 'staged_floor_pallets', labelAr: 'بالتة الصالة', labelEn: 'Floor Pallet' },
    { pattern: /(breakId)/i, target: 'production_breaks', labelAr: 'استراحة تشغيل', labelEn: 'Production Break' },
    { pattern: /(departmentId)/i, target: 'departments', labelAr: 'القسم / الإدارة', labelEn: 'Department' },
    { pattern: /(employeeId|workerId|technicianId|driverId)/i, target: 'employees', labelAr: 'الموظف / العامل', labelEn: 'Staff / Worker' },
    { pattern: /(returnId|faultyReturnId)/i, target: 'faulty_fg_returns', labelAr: 'إشعار المرتجع المعيب', labelEn: 'Faulty FG Return' },
    { pattern: /(fgReceiptId|fgrId)/i, target: 'fg_receipts', labelAr: 'إذن استلام التام', labelEn: 'FG Receipt' },
    { pattern: /(transformationId|transformationDocId)/i, target: 'production_transformations', labelAr: 'حركة التحويل', labelEn: 'Transformation' },
    { pattern: /(categoryId)/i, target: 'categories', labelAr: 'مجموعة التكويد', labelEn: 'Category' },
    { pattern: /(safeId|cashSafeId)/i, target: 'cash_safes', labelAr: 'الخزينة النقدية', labelEn: 'Cash Safe' },
    { pattern: /(bankAccountId|bankId)/i, target: 'corporate_banks', labelAr: 'الحساب البنكي', labelEn: 'Bank Account' },
    { pattern: /(vehicleId|truckId)/i, target: 'vehicles', labelAr: 'المركبة / الشاحنة', labelEn: 'Vehicle' },
    { pattern: /(accountId|glAccountId|chartAccountId)/i, target: 'chart_of_accounts', labelAr: 'الحساب المحاسبي', labelEn: 'GL Account' },
    { pattern: /(userId|issuedById|verifiedById|responsibleUserId|createdById)/i, target: 'users', labelAr: 'المستخدم المسؤول', labelEn: 'User Account' },
  ];

  // 1. Infer Upstream Relationships from the target collection's document fields
  sampleDocs.slice(0, 20).forEach((docData) => {
    // Scan root fields
    Object.keys(docData).forEach((fieldKey) => {
      knownForeignKeyPatterns.forEach(({ pattern, target, labelAr, labelEn }) => {
        if (target !== targetCollection && pattern.test(fieldKey) && docData[fieldKey]) {
          if (!detectedUpstream.has(`${target}_${fieldKey}`)) {
            detectedUpstream.set(`${target}_${fieldKey}`, {
              collection: target,
              key: fieldKey,
              labelAr,
              labelEn,
              type: 'many-to-one',
            });
          }
        }
      });

      // Scan nested line item arrays
      if (Array.isArray(docData[fieldKey])) {
        docData[fieldKey].slice(0, 3).forEach((lineItem) => {
          if (typeof lineItem === 'object' && lineItem !== null) {
            Object.keys(lineItem).forEach((lineKey) => {
              knownForeignKeyPatterns.forEach(({ pattern, target, labelAr, labelEn }) => {
                if (target !== targetCollection && pattern.test(lineKey) && lineItem[lineKey]) {
                  const mapKey = `${target}_${fieldKey}.${lineKey}`;
                  if (!detectedUpstream.has(mapKey)) {
                    detectedUpstream.set(mapKey, {
                      collection: target,
                      key: `${fieldKey}.${lineKey}`,
                      labelAr,
                      labelEn,
                      type: 'many-to-many',
                    });
                  }
                }
              });
            });
          }
        });
      }
    });
  });

  // 2. Infer Downstream Relationships by checking other discovered collections referencing this one
  allDiscovered.forEach((otherCol) => {
    if (otherCol.name === targetCollection || !otherCol.sampleDoc) return;
    const docData = otherCol.sampleDoc;

    Object.keys(docData).forEach((fieldKey) => {
      knownForeignKeyPatterns.forEach(({ pattern, target }) => {
        if (target === targetCollection && pattern.test(fieldKey)) {
          const mapKey = `${otherCol.name}_${fieldKey}`;
          if (!detectedDownstream.has(mapKey)) {
            const targetMeta = STATIC_GRAPH_METADATA[otherCol.name] || { labelAr: otherCol.name, labelEn: otherCol.name };
            detectedDownstream.set(mapKey, {
              collection: otherCol.name,
              key: fieldKey,
              labelAr: targetMeta.labelAr,
              labelEn: targetMeta.labelEn,
              type: 'one-to-many',
            });
          }
        }
      });
    });
  });

  return {
    ...meta,
    upstream: Array.from(detectedUpstream.values()),
    downstream: Array.from(detectedDownstream.values()),
  };
}

// Dynamically derived from APP_ARCHITECTURE.modules.master_data.tabs + core master tables
export const MASTER_COLLECTIONS_REGISTRY = getMasterCollectionsRegistry(APP_ARCHITECTURE);

export const OPERATIONAL_COLLECTIONS_REGISTRY = OPERATIONAL_COLLECTIONS_COMPLETE;

export const BACKUP_COLLECTIONS_REGISTRY = Array.from(
  new Set([
    ...MASTER_COLLECTIONS_REGISTRY,
    ...OPERATIONAL_COLLECTIONS_REGISTRY,
  ])
);

export const COLLECTION_DISPLAY_NAMES = {
  users: { ar: 'حسابات دخول النظام (متزامن مع الموظفين)', en: 'System Login Accounts (Synced with Employees)' },
  departments: { ar: 'الأقسام والإدارات وصلاحياتها', en: 'Departments & Permissions' },
  employees: { ar: 'سجل الموظفين والعمالة والمستخدمين الموحد', en: 'Unified Staff, Workers & Users' },
  system_config: { ar: 'إعدادات النظام والروابط المحاسبية ومراكز التكلفة', en: 'System Config, Accounting Links & Cost Centers' },
  suppliers: { ar: 'سجل الموردين المعتمدين', en: 'Suppliers Master' },
  clients: { ar: 'سجل العملاء', en: 'Clients Master' },
  client_segments: { ar: 'تصنيفات وقطاعات العملاء', en: 'Client Segments Master' },
  items: { ar: 'سجل الخامات ومستلزمات الإنتاج', en: 'Item Master (Raw Materials)' },
  categories: { ar: 'مجموعات وتصنيفات التكويد', en: 'Category Groups' },
  finished_products: { ar: 'سجل المنتجات التامة', en: 'Finished Goods Master' },
  finished_product_categories: { ar: 'تصنيفات المنتج التام', en: 'FG Categories' },
  warehouses: { ar: 'سجل المستودعات والصالات', en: 'Warehouses Master' },
  bom_recipes: { ar: 'شجرة وقوائم المكونات (BOM)', en: 'BOM Recipes' },
  intermediate_recipes: { ar: 'خلطات الخامات الوسيطة (IBOM)', en: 'Intermediate Recipes' },
  production_processes: { ar: 'مسارات ومراحل التشغيل (SOP)', en: 'Production Processes' },
  production_workers: { ar: 'سجل عمالة الإنتاج والورديات', en: 'Production Workers' },
  cash_safes: { ar: 'سجل الخزائن والخزن النقدية', en: 'Safes & Cash Vaults Master' },
  corporate_banks: { ar: 'سجل الحسابات والودائع البنكية', en: 'Corporate Bank Accounts Master' },
  bank_accounts: { ar: 'سجل الحسابات البنكية', en: 'Bank Accounts Master' },
  vehicles: { ar: 'سجل أسطول الشاحنات والمركبات', en: 'Vehicles & Logistics Fleet' },
  chart_of_accounts: { ar: 'دليل شجرة الحسابات وإعدادات التوجيه المالي', en: 'Chart of Accounts & Statement Routing Setup' },
  floor_liquid_vessels: { ar: 'إعدادات خزانات السوائل بالصالة', en: 'Floor Liquid Vessels Master Config' },

  purchase_orders: { ar: 'أوامر الشراء (PO)', en: 'Purchase Orders' },
  goods_receipts: { ar: 'أذون استلام المخزن والمرتجعات (GRN/RTN)', en: 'Goods Receipts & Returns' },
  stock_transfers: { ar: 'أذون التحويل المخزني (TRN)', en: 'Stock Transfers' },
  transfers: { ar: 'حركات النقل الفرعية (Transfers)', en: 'Warehouse Transfers' },
  stock_ledger: { ar: 'سجل الحركات الدفتري (Ledger)', en: 'Stock Ledger' },
  stock_counts: { ar: 'الجرد الفعلي والتسويات', en: 'Physical Stock Counts' },
  spare_parts_issues: { ar: 'صرف قطع الغيار (XISS)', en: 'Spare Parts Issues' },
  work_orders: { ar: 'أوامر التشغيل والإنتاج (MO)', en: 'Work Orders' },
  production_work_orders: { ar: 'أوامر إعادة التشغيل والتصنيع', en: 'Rework & Production Work Orders' },
  staged_floor_pallets: { ar: 'بالتات الصالة المشدودة', en: 'Staged Floor Pallets' },
  staged_floor_materials: { ar: 'خامات ومستلزمات الصالة', en: 'Staged Floor Materials' },
  production_breaks: { ar: 'سجل فترات الراحة والتوقف', en: 'Production Breaks' },
  production_shifts: { ar: 'سجل الورديات الإنتاجية', en: 'Production Shifts' },
  liquid_tanks: { ar: 'تشغيل وتانكات الخامات (M)', en: 'Bulk Liquid Tanks' },
  production_transformations: { ar: 'حركات التحويل والتصنيع الداخلي', en: 'Production Transformations' },
  shift_handovers: { ar: 'تسليم واستلام الورديات', en: 'Shift Handovers' },
  faulty_fg_returns: { ar: 'مرتجعات ومعيب المنتج التام', en: 'Faulty FG Returns' },
  fg_receipts: { ar: 'استلام وحفظ المنتج التام', en: 'FG Receipts' },
  cash_transactions: { ar: 'سجل حركات وسندات الخزينة والبنوك', en: 'Cash & Bank Vouchers' },
  cash_count_sessions: { ar: 'محاضر جرد ومطابقة الخزينة', en: 'Cash Count Audit Sessions' },
  journal_entries: { ar: 'دفتر قيود اليومية العامة', en: 'Journal Entries Ledger' },
  custody_ledger: { ar: 'سجل العهد النقدية والسلف', en: 'Custodies & Advances Ledger' },
  custody_advance_drafts: { ar: 'مسودات وطلبات العهد والسلف', en: 'Custody & Advance Drafts' },
  custodies_and_advances: { ar: 'حركات العهد والسلف المؤقتة', en: 'Custodies & Advances Records' },
  dues_settlements: { ar: 'سجل تسويات ودفعات الموردين والعملاء', en: 'Dues & Installments Settlements' },
  dues_batches: { ar: 'حافظات السداد المجمعة للموردين', en: 'Batch Payment Ledgers' },
  wht_notes: { ar: 'إشعارات وشهادات الخصم والإضافة (1%)', en: '1% WHT Certificates' },
  sales_orders: { ar: 'أوامر البيع والتوريد وخطط التحميل والتوزيع', en: 'Sales Orders & Dispatch Loading Plans' },
  truck_dispatches: { ar: 'رحلات التوزيع واستلام المرتجعات', en: 'Truck Dispatches & Receiving' },
  dispatch_documents: { ar: 'سجل أذون صرف الشاحنات المرقمة', en: 'Dispatch Documents Registry' },
  price_lists: { ar: 'قوائم الأسعار وفترات التسعير', en: 'Price Lists & Periods' },
  pricing_strategies: { ar: 'استراتيجيات التسعير المخصصة', en: 'Pricing Strategies' },
  client_contracts: { ar: 'عقود وخصومات العملاء', en: 'Client Contracts & Discounts' },
  record_comments: { ar: 'التعليقات والمهام التشغيلية على السجلات', en: 'Record Comments & Tasks' },
  user_actions_queue: { ar: 'طابور المهام والاعتمادات المعلقة', en: 'Pending User Actions Queue' },
  system_notifications: { ar: 'سجل التنبيهات والإشعارات', en: 'System Notifications' },
};

/**
 * Universal Display Name Resolver for Firestore Collections.
 * If not in static dictionary, dynamically resolves label from APP_ARCHITECTURE modules & tabs.
 */
export function getCollectionDisplayName(collKey, isAr = false) {
  if (COLLECTION_DISPLAY_NAMES[collKey]) {
    return isAr ? COLLECTION_DISPLAY_NAMES[collKey].ar : COLLECTION_DISPLAY_NAMES[collKey].en;
  }
  // Dynamic lookup across all modules & tabs in APP_ARCHITECTURE
  for (const mod of Object.values(APP_ARCHITECTURE.modules || {})) {
    for (const tab of Object.values(mod.tabs || {})) {
      if (tab.collection === collKey) {
        return isAr ? tab.labelAr : tab.labelEn;
      }
    }
  }
  return collKey;
}

/**
 * Helper to match collaborative comments, pending user actions, and notifications
 * generated for a given set of collections, tabs, or document ID prefixes.
 */
const makeCollabCascadeEntries = (targetCollections = [], targetTabs = [], docPrefixes = []) => {
  const matchDocPrefix = (val) => {
    const s = String(val || '').toUpperCase();
    return docPrefixes.some((p) => s.startsWith(p.toUpperCase()));
  };
  const matchCollOrTab = (d) =>
    targetCollections.includes(d.collectionName) ||
    targetCollections.includes(d.sourceCollection) ||
    targetCollections.includes(d.targetCollection) ||
    targetTabs.includes(d.targetTab) ||
    targetTabs.includes(d.tabId) ||
    targetTabs.includes(d.moduleKey) ||
    matchDocPrefix(d.recordId) ||
    matchDocPrefix(d.docId) ||
    matchDocPrefix(d.highlightId);

  return [
    {
      collection: 'record_comments',
      labelAr: 'التعليقات والمهام المرتبطة بهذه السجلات (record_comments)',
      labelEn: 'Collaborative comments linked to these records (record_comments)',
      predicate: (d) => matchCollOrTab(d),
    },
    {
      collection: 'user_actions_queue',
      labelAr: 'طلبات الاعتماد والمهام المعلقة المرتبطة (user_actions_queue)',
      labelEn: 'Pending approval actions linked to these records (user_actions_queue)',
      predicate: (d) => matchCollOrTab(d),
    },
    {
      collection: 'system_notifications',
      labelAr: 'إشعارات وتنبيهات النظام المرتبطة (system_notifications)',
      labelEn: 'System notifications linked to these records (system_notifications)',
      predicate: (d) => matchCollOrTab(d),
    },
  ];
};

/**
 * Comprehensive Relational Cascade Purge Catalog.
 * Aligns every operational module and master table in the ERP with its exact
 * Firestore collection(s) and auto-generated cross-collection records.
 */
export const PURGE_TARGETS_CATALOG = [
  // =========================================================================
  // GROUP A: OPERATIONAL MODULES WITH AUTO-MADE CROSS-COLLECTION CASCADES
  // =========================================================================
  {
    key: 'goods_receipts',
    category: 'operational',
    labelAr: 'أذون استلام الخامات ومرتجعات المشتريات (GRNs & Supplier Returns)',
    labelEn: 'Goods Receipts & Supplier Returns (GRNs & RTNs)',
    collectionsLabel: 'goods_receipts + Auto-Made Ledger, JEs, Vouchers & Dues',
    primaryCollections: [], // Uses selective predicate on goods_receipts so stock count ADJ-* records are not wiped unless stock_count is selected
    relatedCascades: [
      {
        collection: 'goods_receipts',
        labelAr: 'أذون الاستلام الفعلي ومرتجعات الموردين (goods_receipts: GRN-* & RTN-*)',
        labelEn: 'Supplier Goods Receipts & Return Notes (goods_receipts: GRN-* & RTN-*)',
        predicate: (d, docId) =>
          d.docType !== 'inventory_reconciliation' &&
          !d.isDirectAdjustment &&
          !String(docId || d.id || '').startsWith('ADJ-'),
      },
      {
        collection: 'stock_ledger',
        labelAr: 'حركات كارت الصنف التلقائية للاستلامات والمرتجعات (stock_ledger)',
        labelEn: 'Auto-generated stock ledger movements for GRNs/RTNs (stock_ledger)',
        predicate: (d) =>
          ['receipt', 'return', 'GRN', 'RTN'].includes(d.docType) ||
          [
            'initial_receipt',
            'receipt_modified',
            'supplier_return',
            'receipt_cancelled_reversal',
            'return_cancelled_restored',
            'receipt_reversed_admin',
            'return_reversed_admin',
          ].includes(d.action) ||
          String(d.grnId || '').startsWith('GRN-') ||
          String(d.grnId || '').startsWith('RTN-'),
      },
      {
        collection: 'journal_entries',
        labelAr: 'قيود اليومية التلقائية للاستلامات والمرتجعات وعكوساتها (journal_entries)',
        labelEn: 'Auto-generated journal entries for GRNs/RTNs & reversals (journal_entries)',
        predicate: (d, docId) => {
          const idStr = String(docId || d.id || '');
          const refStr = String(d.sourceDocId || d.referenceNumber || '');
          return (
            d.sourceCollection === 'goods_receipts' ||
            ['goods_receipt', 'goods_receipt_return'].includes(d.originType) ||
            idStr.startsWith('JE-GRN-') ||
            idStr.startsWith('JE-RTN-') ||
            idStr.startsWith('JE-REV-GRN-') ||
            idStr.startsWith('JE-REV-RTN-') ||
            refStr.startsWith('GRN-') ||
            refStr.startsWith('RTN-')
          );
        },
      },
      {
        collection: 'cash_transactions',
        labelAr: 'سندات الصرف والتحصيل المرتبطة بأذون الاستلام والمرتجعات (cash_transactions)',
        labelEn: 'Auto-generated cash/bank vouchers linked to GRNs/RTNs (cash_transactions)',
        predicate: (d) =>
          Boolean(d.grnId) ||
          String(d.referenceNumber || '').startsWith('GRN-') ||
          String(d.referenceNumber || '').startsWith('RTN-') ||
          (Array.isArray(d.linkedDocs) && d.linkedDocs.some((ld) => ld.docType === 'GRN' || ld.docType === 'RTN' || String(ld.docId || '').startsWith('GRN-') || String(ld.docId || '').startsWith('RTN-'))),
      },
      {
        collection: 'dues_settlements',
        labelAr: 'تسويات الاستحقاقات المرتبطة بأذون الاستلام والمرتجعات (dues_settlements)',
        labelEn: 'Dues settlements linked to GRNs/RTNs (dues_settlements)',
        predicate: (d) =>
          Boolean(d.grnId) ||
          String(d.docId || '').startsWith('GRN-') ||
          String(d.docId || '').startsWith('RTN-') ||
          (Array.isArray(d.linkedDocs) && d.linkedDocs.some((ld) => ld.docType === 'GRN' || ld.docType === 'RTN' || String(ld.docId || '').startsWith('GRN-') || String(ld.docId || '').startsWith('RTN-'))),
      },
      {
        collection: 'wht_notes',
        labelAr: 'شهادات الخصم الضريبي 1% الصادرة لأذون الاستلام (wht_notes)',
        labelEn: '1% WHT certificates issued for GRNs/RTNs (wht_notes)',
        predicate: (d) =>
          Boolean(d.grnId) ||
          String(d.sourceDocId || d.docId || '').startsWith('GRN-') ||
          String(d.sourceDocId || d.docId || '').startsWith('RTN-'),
      },
      ...makeCollabCascadeEntries(['goods_receipts'], ['goods_receipts'], ['GRN-', 'RTN-']),
    ],
    recalculate: {
      recalcItemsStock: true,
      recalcSafesAndBanks: true,
      resetPoReceivedQuantities: true,
    },
    descAr: 'يمسح أذون استلام المشتريات (GRN) ومرتجعات الموردين (RTN)، ويحذف تلقائياً كافة السجلات المرتبطة بها في كارت الصنف (stock_ledger)، وقيود اليومية التلقائية (journal_entries)، وسندات الخزينة، وتسويات الاستحقاقات، وشهادات الخصم 1%، مع إعادة احتساب أرصدة الخامات والخزائن والبنوك تلقائياً.',
    descEn: 'Wipes all Supplier Goods Receipts (GRN) and Return Notes (RTN), automatically purging their auto-made records in stock_ledger, journal_entries, cash_transactions, dues_settlements, and wht_notes, and dynamically recalculating item stock and safe/bank balances.',
  },
  {
    key: 'purchase_orders',
    category: 'operational',
    labelAr: 'أوامر الشراء والدفعات المقدمة المرتبطة بها (Purchase Orders & PO Advances)',
    labelEn: 'Purchase Orders & Linked PO Advances (purchase_orders)',
    collectionsLabel: 'purchase_orders + Auto-Made PO Advances, JEs & Dues',
    primaryCollections: ['purchase_orders'],
    relatedCascades: [
      {
        collection: 'cash_transactions',
        labelAr: 'سندات الدفعات المقدمة المرتبطة بأوامر الشراء (cash_transactions)',
        labelEn: 'Auto-generated PO Advance payment vouchers (cash_transactions)',
        predicate: (d) =>
          Boolean(d.poId) ||
          String(d.referenceNumber || '').startsWith('PO-') ||
          (Array.isArray(d.linkedDocs) && d.linkedDocs.some((ld) => ld.docType === 'PO' || String(ld.docId || '').startsWith('PO-'))),
      },
      {
        collection: 'journal_entries',
        labelAr: 'قيود اليومية التلقائية للدفعات المقدمة لأوامر الشراء (journal_entries)',
        labelEn: 'Auto-generated journal entries for PO Advances (journal_entries)',
        predicate: (d, docId) =>
          d.sourceCollection === 'purchase_orders' ||
          String(docId || d.id || '').startsWith('JE-PO-') ||
          String(d.sourceDocId || d.referenceNumber || '').startsWith('PO-'),
      },
      {
        collection: 'dues_settlements',
        labelAr: 'تسويات الدفعات المقدمة لأوامر الشراء (dues_settlements)',
        labelEn: 'PO Advance settlements in dues_settlements',
        predicate: (d) =>
          Boolean(d.poId) ||
          String(d.docId || '').startsWith('PO-') ||
          (Array.isArray(d.linkedDocs) && d.linkedDocs.some((ld) => ld.docType === 'PO' || String(ld.docId || '').startsWith('PO-'))),
      },
      {
        collection: 'wht_notes',
        labelAr: 'إشعارات الخصم المرتبطة بأوامر الشراء (wht_notes)',
        labelEn: 'WHT notes linked to Purchase Orders (wht_notes)',
        predicate: (d) =>
          Boolean(d.poId) ||
          String(d.sourceDocId || d.docId || '').startsWith('PO-'),
      },
      ...makeCollabCascadeEntries(['purchase_orders'], ['purchase_orders'], ['PO-']),
    ],
    recalculate: {
      recalcSafesAndBanks: true,
      unlinkGrnPoRefs: true,
    },
    descAr: 'يمسح كافة أوامر الشراء (PO)، ويحذف تلقائياً سندات الدفعات المقدمة المرتبطة بها في الخزينة والبنوك، وقيودها المحاسبية، وتسوياتها في شاشة الاستحقاقات، ويفك ارتباط أذون الاستلام بأوامر الشراء المحذوفة مع إعادة احتساب أرصدة الخزائن والبنوك.',
    descEn: 'Wipes all Purchase Orders (PO) and automatically purges their linked PO Advance cash vouchers, journal entries, and dues settlements, unlinking PO references on existing GRNs and recalculating safe/bank balances.',
  },
  {
    key: 'transfers',
    category: 'operational',
    labelAr: 'التحويلات المخزنية وحركات النقل بين المستودعات (Stock Transfers)',
    labelEn: 'Warehouse Stock Transfers (stock_transfers & transfers)',
    collectionsLabel: 'stock_transfers + transfers + Auto-Made Stock Ledger & Floor Materials',
    primaryCollections: ['transfers'],
    relatedCascades: [
      {
        collection: 'stock_transfers',
        labelAr: 'أذون التحويل المخزني بين المستودعات (stock_transfers)',
        labelEn: 'Warehouse stock transfer vouchers (stock_transfers)',
        predicate: (d) => !d.isFinishedGoods && d.transferType !== 'finished_goods' && !d.isPipelineTransfer,
      },
      {
        collection: 'stock_ledger',
        labelAr: 'حركات النقل المخزني المسجلة في كارت الصنف (stock_ledger)',
        labelEn: 'Transfer movements recorded in stock_ledger',
        predicate: (d) =>
          d.docType === 'transfer' ||
          ['transfer_in', 'transfer_out', 'transfer_reversal'].includes(d.action) ||
          String(d.grnId || '').startsWith('TRN-') ||
          String(d.transferId || '').startsWith('TRN-'),
      },
      {
        collection: 'staged_floor_materials',
        labelAr: 'خامات الصالة المحولة عبر أذون التحويل (staged_floor_materials)',
        labelEn: 'Staged floor materials originating from stock transfers',
        predicate: (d) => Boolean(d.transferId) || String(d.id || '').startsWith('TRN-'),
      },
      ...makeCollabCascadeEntries(['stock_transfers', 'transfers'], ['transfers'], ['TRN-']),
    ],
    recalculate: {
      recalcItemsStock: true,
    },
    descAr: 'يمسح أذون التحويل المخزني بين المستودعات، ويحذف تلقائياً حركاتها المقابلة في كارت الصنف (stock_ledger) وخامات الصالة المحولة، مع إعادة احتساب أرصدة الخامات.',
    descEn: 'Wipes warehouse stock transfers and automatically removes their corresponding movements in stock_ledger and staged_floor_materials, recalculating item stock.',
  },
  {
    key: 'stock_count',
    category: 'operational',
    labelAr: 'جلسات الجرد الفعلي وتسويات الفروقات المخزنية (Stock Counts & Reconciliations)',
    labelEn: 'Physical Stock Count Sessions & Reconciliations (stock_counts)',
    collectionsLabel: 'stock_counts + Auto-Made ADJ-* Receipts & Stock Ledger Variances',
    primaryCollections: ['stock_counts'],
    relatedCascades: [
      {
        collection: 'goods_receipts',
        labelAr: 'سندات التسوية الجردية التلقائية (goods_receipts: ADJ-* / inventory_reconciliation)',
        labelEn: 'Auto-generated adjustment vouchers in goods_receipts (ADJ-* / inventory_reconciliation)',
        predicate: (d, docId) =>
          d.docType === 'inventory_reconciliation' ||
          Boolean(d.isDirectAdjustment) ||
          String(docId || d.id || '').startsWith('ADJ-') ||
          ['STOCK_COUNT_RECONCILIATION', 'STOCK_COUNT_ADJUSTMENT'].includes(d.supplierId),
      },
      {
        collection: 'stock_ledger',
        labelAr: 'حركات فروقات الجرد (الزيادة والعجز) في كارت الصنف (stock_ledger)',
        labelEn: 'Auto-generated inventory surplus/deficit entries in stock_ledger',
        predicate: (d) =>
          d.docType === 'inventory_reconciliation' ||
          Boolean(d.sessionId) ||
          Boolean(d.isDirectAdjustment) ||
          [
            'reconciliation_surplus',
            'reconciliation_deficit',
            'direct_adjustment_surplus',
            'direct_adjustment_deficit',
          ].includes(d.action) ||
          String(d.grnId || '').startsWith('ADJ-'),
      },
      {
        collection: 'journal_entries',
        labelAr: 'قيود تسويات فروقات الجرد في دفتر اليومية (journal_entries)',
        labelEn: 'Auto-generated inventory variance journal entries (journal_entries)',
        predicate: (d, docId) =>
          d.sourceCollection === 'stock_counts' ||
          String(docId || d.id || '').startsWith('JE-ADJ-') ||
          String(d.sourceDocId || '').startsWith('ADJ-') ||
          String(d.sourceDocId || '').startsWith('STK-'),
      },
      ...makeCollabCascadeEntries(['stock_counts'], ['stock_count'], ['STK-', 'ADJ-']),
    ],
    recalculate: {
      recalcItemsStock: true,
    },
    descAr: 'يمسح جلسات الجرد الفعلي (stock_counts)، ويحذف تلقائياً كافة سندات التسوية الجردية (ADJ-*) التي أُنشئت تلقائياً داخل (goods_receipts) وحركات الزيادة والعجز في (stock_ledger)، مع إعادة احتساب أرصدة الخامات بدقة.',
    descEn: 'Wipes all physical stock count sessions (stock_counts) and automatically deletes their auto-made adjustment documents (ADJ-*) in goods_receipts and variance entries in stock_ledger, recalculating item stock.',
  },
  {
    key: 'spare_parts_issue',
    category: 'operational',
    labelAr: 'أذون صرف واستهلاك قطع الغيار والمهمات (Spare Parts Consumption)',
    labelEn: 'Spare Parts Consumption & Issue Vouchers (spare_parts_issues)',
    collectionsLabel: 'spare_parts_issues + Auto-Made Stock Ledger & JEs',
    primaryCollections: ['spare_parts_issues'],
    relatedCascades: [
      {
        collection: 'stock_ledger',
        labelAr: 'حركات خصم وعكس قطع الغيار في كارت الصنف (stock_ledger: XISS-*)',
        labelEn: 'Auto-generated spare parts deduction & reversal entries in stock_ledger',
        predicate: (d) =>
          ['spare_parts_issue', 'spare_parts_reversal'].includes(d.docType) ||
          ['spare_parts_consumption', 'spare_parts_reversal'].includes(d.action) ||
          String(d.grnId || '').startsWith('XISS-') ||
          String(d.grnId || '').startsWith('REV-XISS-'),
      },
      {
        collection: 'journal_entries',
        labelAr: 'قيود مصروفات قطع الغيار التلقائية (journal_entries)',
        labelEn: 'Auto-generated spare parts expense journal entries',
        predicate: (d) =>
          d.sourceCollection === 'spare_parts_issues' ||
          String(d.sourceDocId || d.referenceNumber || '').startsWith('XISS-'),
      },
      ...makeCollabCascadeEntries(['spare_parts_issues'], ['spare_parts_issue'], ['XISS-', 'REV-XISS-']),
    ],
    recalculate: {
      recalcItemsStock: true,
    },
    descAr: 'يمسح أذون صرف واستهلاك قطع الغيار (XISS-*)، ويحذف تلقائياً حركات الخصم والعكس المرتبطة بها في كارت الصنف (stock_ledger)، ويعيد احتساب أرصدة قطع الغيار والمهمات تلقائياً.',
    descEn: 'Wipes spare parts consumption vouchers (spare_parts_issues) and their auto-made deduction/reversal entries in stock_ledger, dynamically restoring spare parts stock balances.',
  },
  {
    key: 'liquid_tanks',
    category: 'operational',
    labelAr: 'تشغيل وتانكات السوائل، التحويلات الوسيطة، والضخ بالأنابيب (Bulk Liquid Tanks)',
    labelEn: 'Bulk Liquid Tanks, Transformations & Pipeline Transfers (liquid_tanks)',
    collectionsLabel: 'liquid_tanks + shift_handovers + Auto-Made TRANS-*, TRN-PIPE-* & Vessel Reset',
    primaryCollections: ['liquid_tanks', 'shift_handovers'],
    relatedCascades: [
      {
        collection: 'production_transformations',
        labelAr: 'سجلات التحويل والتصنيع الداخلي للتانكات (production_transformations: TRANS-TANK-*)',
        labelEn: 'Auto-generated tank transformation records (production_transformations)',
        predicate: (d, docId) =>
          Boolean(d.tankId) ||
          String(docId || d.id || '').startsWith('TRANS-TANK-') ||
          String(docId || d.id || '').startsWith('TRANS-BATCH-') ||
          String(d.lotNumber || '').startsWith('TANK-'),
      },
      {
        collection: 'stock_transfers',
        labelAr: 'أذون الضخ التلقائية عبر خطوط الأنابيب لصالة الإنتاج (stock_transfers: TRN-PIPE-*)',
        labelEn: 'Auto-generated pipeline transfer records (stock_transfers: TRN-PIPE-*)',
        predicate: (d, docId) =>
          Boolean(d.isPipelineTransfer) ||
          Boolean(d.tankId) ||
          String(docId || d.id || '').startsWith('TRN-PIPE-'),
      },
      ...makeCollabCascadeEntries(['liquid_tanks', 'shift_handovers'], ['liquid_tanks', 'liquid_storage'], ['TANK-', 'BATCH-', 'TRN-PIPE-']),
    ],
    recalculate: {
      resetFloorVessels: true,
      recalcItemsStock: true,
    },
    descAr: 'يمسح سجلات تانكات السوائل (liquid_tanks) وتسليم الورديات، ويحذف تلقائياً حركات التحويل الداخلي (TRANS-TANK-*) وأذون الضخ عبر الأنابيب (TRN-PIPE-*)، ويصفر الكميات الحالية العابرة داخل خزانات الصالة (floor_liquid_vessels) مع الحفاظ الكامل على إعدادات سعة الخزانات.',
    descEn: 'Wipes bulk liquid tanks and shift handovers, automatically deleting their auto-made transformation records (TRANS-TANK-*) and pipeline transfers (TRN-PIPE-*), and resets transient volumes in floor_liquid_vessels while preserving vessel capacity configurations.',
  },
  {
    key: 'work_orders',
    category: 'operational',
    labelAr: 'أوامر التشغيل، الباليتات المرحلية، خامات الصالة، والورديات (Work Orders & Floor Ops)',
    labelEn: 'Work Orders, Staged Pallets, Floor Materials & Shifts (work_orders)',
    collectionsLabel: 'work_orders + staged_floor_pallets + staged_floor_materials + breaks/shifts + Auto-Made TRANS-PAL-* & TRN-*',
    primaryCollections: [
      'work_orders',
      'production_work_orders',
      'staged_floor_pallets',
      'staged_floor_materials',
      'production_breaks',
      'production_shifts',
    ],
    relatedCascades: [
      {
        collection: 'production_transformations',
        labelAr: 'حركات استهلاك الخامات وتصنيع الباليتات وأوامر التشغيل (production_transformations: TRANS-PAL-* / TRANS-WO-*)',
        labelEn: 'Auto-generated pallet & work order transformations (production_transformations)',
        predicate: (d, docId) => {
          const idStr = String(docId || d.id || '');
          return (
            idStr.startsWith('TRANS-PAL-') ||
            idStr.startsWith('TRANS-WO-') ||
            Boolean(d.workOrderId) ||
            Boolean(d.palletId) ||
            !d.tankId
          );
        },
      },
      {
        collection: 'stock_transfers',
        labelAr: 'أذون ترحيل الباليتات التامة ومرتجعات الهالك وأوامر التشغيل (stock_transfers)',
        labelEn: 'Auto-generated FG pallet transfers & floor scrap returns (stock_transfers)',
        predicate: (d, docId) => {
          const idStr = String(docId || d.id || '');
          return (
            Boolean(d.isFinishedGoods) ||
            ['finished_goods', 'floor_feeding', 'scrap_return'].includes(d.transferType) ||
            String(d.productionOrderRef || '').startsWith('MO-') ||
            idStr.startsWith('TRN-SCRAP') ||
            idStr.startsWith('TRN-PALLET') ||
            idStr.startsWith('TRN-FG') ||
            (Array.isArray(d.lines) && d.lines.some((l) => Boolean(l.palletId) || Boolean(l.workOrderId)))
          );
        },
      },
      {
        collection: 'stock_ledger',
        labelAr: 'حركات استهلاك الإنتاج والهالك المسجلة في كارت الصنف (stock_ledger)',
        labelEn: 'Production consumption & scrap entries in stock_ledger',
        predicate: (d) =>
          Boolean(d.workOrderId) ||
          String(d.productionOrderRef || '').startsWith('MO-') ||
          ['production_consumption', 'scrap_return', 'floor_feeding'].includes(d.docType || d.action),
      },
      {
        collection: 'journal_entries',
        labelAr: 'قيود التكاليف والإنتاج التلقائية لأوامر التشغيل (journal_entries)',
        labelEn: 'Auto-generated production journal entries (journal_entries)',
        predicate: (d) =>
          d.sourceCollection === 'work_orders' ||
          String(d.sourceDocId || d.referenceNumber || '').startsWith('MO-'),
      },
      ...makeCollabCascadeEntries(
        ['work_orders', 'production_work_orders', 'staged_floor_pallets', 'staged_floor_materials'],
        ['work_orders', 'production_reports'],
        ['MO-', 'PAL-']
      ),
    ],
    recalculate: {
      recalcItemsStock: true,
    },
    descAr: 'يمسح أوامر التشغيل والإنتاج، وباليتات الصالة، وخامات الصالة، وسجلات التوقف والورديات، ويحذف تلقائياً كافة حركات التصنيع والاستهلاك (TRANS-PAL-*) وأذون ترحيل الباليتات والهالك (stock_transfers) المرتبطة بها.',
    descEn: 'Wipes all production work orders, staged floor pallets, staged materials, breaks, and shifts, automatically purging their auto-made pallet transformation records (TRANS-PAL-*) and FG/scrap transfer vouchers.',
  },
  {
    key: 'fg_inward',
    category: 'operational',
    labelAr: 'استلامات وإيداعات باليتات المنتج التام بالمستودعات (Finished Goods Inward)',
    labelEn: 'Finished Goods Inward Transfers & Receipts (fg_inward)',
    collectionsLabel: 'fg_receipts + Auto-Made FG Transfers in stock_transfers & Pallet Status Reset',
    primaryCollections: ['fg_receipts'],
    relatedCascades: [
      {
        collection: 'stock_transfers',
        labelAr: 'أذون استلام وترحيل باليتات المنتج التام (stock_transfers: isFinishedGoods)',
        labelEn: 'Finished Goods pallet inward transfer vouchers in stock_transfers',
        predicate: (d, docId) => {
          const idStr = String(docId || d.id || '');
          return (
            Boolean(d.isFinishedGoods) ||
            d.transferType === 'finished_goods' ||
            idStr.startsWith('TRN-FG') ||
            idStr.startsWith('TRN-PALLET') ||
            (Array.isArray(d.lines) && d.lines.some((l) => Boolean(l.palletId)))
          );
        },
      },
      ...makeCollabCascadeEntries(['fg_receipts', 'stock_transfers'], ['fg_inward'], ['FGR-', 'TRN-FG', 'TRN-PALLET']),
    ],
    recalculate: {
      resetStagedPalletsToFloor: true,
      recalcItemsStock: true,
    },
    descAr: 'يمسح أذون استلام وترحيل باليتات المنتج التام (stock_transfers الخاصة بالمنتج التام + fg_receipts)، ويعيد حالة الباليتات في صالة الإنتاج إلى (مشدودة بالصالة - staged_on_floor) لتجنب أي ارتباطات معلقة.',
    descEn: 'Wipes all Finished Goods inward transfer vouchers in stock_transfers and fg_receipts, resetting staged floor pallets back to staged_on_floor status so no dangling transfer links remain.',
  },
  {
    key: 'faulty_fg',
    category: 'operational',
    labelAr: 'إشعارات مرتجعات ومعيب المنتج التام وأوامر إعادة التشغيل (Faulty FG & Rework)',
    labelEn: 'Faulty FG Returns & Linked Rework Orders (faulty_fg_returns)',
    collectionsLabel: 'faulty_fg_returns + Auto-Made Rework Orders',
    primaryCollections: ['faulty_fg_returns'],
    relatedCascades: [
      {
        collection: 'work_orders',
        labelAr: 'أوامر إعادة التشغيل المنشأة تلقائياً من مرتجعات المعيب (work_orders: isRework)',
        labelEn: 'Auto-created Rework work orders in work_orders',
        predicate: (d) =>
          Boolean(d.isRework) ||
          (Array.isArray(d.reworkSourceVouchers) && d.reworkSourceVouchers.length > 0),
      },
      {
        collection: 'production_work_orders',
        labelAr: 'سجلات إعادة التشغيل المرتبطة (production_work_orders)',
        labelEn: 'Linked rework records in production_work_orders',
        predicate: (d) =>
          Boolean(d.isRework) ||
          (Array.isArray(d.reworkSourceVouchers) && d.reworkSourceVouchers.length > 0),
      },
      ...makeCollabCascadeEntries(['faulty_fg_returns'], ['faulty_fg'], ['RTN-FG-']),
    ],
    recalculate: {},
    descAr: 'يمسح كافة إشعارات مرتجعات ومعيب المنتج التام (faulty_fg_returns)، ويحذف تلقائياً أوامر إعادة التشغيل (Rework Work Orders) المرتبطة بها.',
    descEn: 'Wipes all Faulty FG return vouchers (faulty_fg_returns) and automatically deletes any Rework Work Orders generated from them.',
  },
  {
    key: 'cash_transactions_hub',
    category: 'operational',
    labelAr: 'حركات وسندات الخزائن والبنوك، العهد والسلف، ومحاضر الجرد (مع بقاء الخزائن والبنوك)',
    labelEn: 'Cash & Bank Vouchers, Custodies & Cash Audits (Preserves Safe/Bank Master Definitions)',
    collectionsLabel: 'cash_transactions + custody_ledger + cash_count_sessions + Auto-Made JEs & Dues',
    primaryCollections: [
      'cash_transactions',
      'custody_ledger',
      'custody_advance_drafts',
      'custodies_and_advances',
      'cash_count_sessions',
    ],
    relatedCascades: [
      {
        collection: 'journal_entries',
        labelAr: 'قيود اليومية التلقائية لسندات الخزينة والبنوك والعهد وجرد النقدية (journal_entries)',
        labelEn: 'Auto-generated journal entries for cash/bank vouchers, custodies & cash audits',
        predicate: (d, docId) => {
          const idStr = String(docId || d.id || '');
          const refStr = String(d.sourceDocId || d.referenceNumber || '');
          return (
            ['cash_transactions', 'custody_ledger', 'cash_count_sessions', 'custodies_and_advances'].includes(d.sourceCollection) ||
            ['cash_receipt', 'cash_disbursement', 'custody_advance', 'custody_liquidation', 'cash_audit', 'safe_transfer'].includes(d.originType) ||
            idStr.startsWith('JE-VCH-') ||
            idStr.startsWith('JE-LIQ-') ||
            idStr.startsWith('JE-CSH-') ||
            refStr.startsWith('VCH-') ||
            refStr.startsWith('ADV-') ||
            refStr.startsWith('LIQ-')
          );
        },
      },
      {
        collection: 'dues_settlements',
        labelAr: 'تسويات الاستحقاقات المسددة عبر سندات الخزينة والبنوك (dues_settlements)',
        labelEn: 'Dues settlements paid via cash/bank vouchers (dues_settlements)',
        predicate: (d) => Boolean(d.voucherId) || Boolean(d.cashTransactionId) || Boolean(d.safeId) || Boolean(d.bankId),
      },
      {
        collection: 'dues_batches',
        labelAr: 'حافظات السداد المجمعة المرتبطة بسندات الصرف (dues_batches)',
        labelEn: 'Batch payment ledgers linked to cash/bank vouchers (dues_batches)',
        predicate: () => true,
      },
      ...makeCollabCascadeEntries(
        ['cash_transactions', 'custody_ledger', 'custody_advance_drafts', 'cash_count_sessions'],
        ['cash_safes', 'cash_safes_hub', 'custodies_advances'],
        ['VCH-', 'ADV-', 'LIQ-', 'CSH-']
      ),
    ],
    recalculate: {
      recalcSafesAndBanks: true,
    },
    descAr: 'يمسح كافة سندات الصرف والتحصيل والتحويلات النقدية، وسجل العهد والسلف، ومحاضر جرد الخزينة، ويحذف قيود اليومية التلقائية الناتجة عنها، ويصفر الأرصدة والفئات النقدية الحالية في (cash_safes) و(corporate_banks) مع الحفاظ التام (100%) على تعريفات الخزائن والحسابات البنكية.',
    descEn: 'Wipes all cash & bank vouchers, custodies/advances, and cash count audit sessions along with their auto-generated journal entries and dues settlements, resetting safe & bank balances to 0 while 100% preserving Safe & Bank Master records.',
  },
  {
    key: 'dues_tracking',
    category: 'operational',
    labelAr: 'تسويات الاستحقاقات، حافظات السداد المجمعة، وشهادات الخصم 1% (Dues & WHT)',
    labelEn: 'Dues Settlements, Payment Batches & 1% WHT Certificates (dues_tracking)',
    collectionsLabel: 'dues_settlements + dues_batches + wht_notes + Auto-Made Vouchers & JEs',
    primaryCollections: ['dues_settlements', 'dues_batches', 'wht_notes'],
    relatedCascades: [
      {
        collection: 'cash_transactions',
        labelAr: 'سندات الصرف والتحصيل المنشأة تلقائياً من شاشة الاستحقاقات (cash_transactions)',
        labelEn: 'Auto-generated cash/bank vouchers created by Dues Tracking (cash_transactions)',
        predicate: (d) =>
          d.originModule === 'dues_tracking' ||
          Boolean(d.duesBatchId) ||
          Boolean(d.duesSettlementId) ||
          (Array.isArray(d.linkedDocs) && d.linkedDocs.length > 0),
      },
      {
        collection: 'journal_entries',
        labelAr: 'قيود اليومية التلقائية لتسويات الموردين والعملاء وشهادات الخصم (journal_entries)',
        labelEn: 'Auto-generated journal entries for Dues Settlements & WHT certificates',
        predicate: (d, docId) => {
          const idStr = String(docId || d.id || '');
          const refStr = String(d.sourceDocId || d.referenceNumber || '');
          return (
            ['dues_settlements', 'dues_batches', 'wht_notes'].includes(d.sourceCollection) ||
            d.originType === 'dues_settlement' ||
            Boolean(d.duesBatchId) ||
            idStr.startsWith('JE-WHT-') ||
            idStr.startsWith('JE-DUE-') ||
            refStr.startsWith('WHT-') ||
            refStr.startsWith('BAT-')
          );
        },
      },
      ...makeCollabCascadeEntries(['dues_settlements', 'dues_batches', 'wht_notes'], ['dues_tracking'], ['WHT-', 'BAT-']),
    ],
    recalculate: {
      recalcSafesAndBanks: true,
    },
    descAr: 'يمسح كافة تسويات دفعات الموردين والعملاء (dues_settlements)، وحافظات السداد المجمعة (dues_batches)، وشهادات الخصم الضريبي 1% (wht_notes)، ويحذف تلقائياً سندات الصرف والتحصيل وقيود اليومية الناتجة عنها، مع إعادة احتساب أرصدة الخزائن والبنوك.',
    descEn: 'Wipes all supplier/client dues settlements, batch payment ledgers, and 1% WHT certificates, automatically deleting their auto-generated cash/bank vouchers and journal entries and recalculating safe/bank balances.',
  },
  {
    key: 'journal_entries_only',
    category: 'operational',
    labelAr: 'قيود دفتر اليومية العامة فقط — مع الحفاظ التام على دليل الحسابات (Journal Entries Only)',
    labelEn: 'General Journal Entries Only — Preserves Chart of Accounts (journal_entries)',
    collectionsLabel: 'journal_entries (100% Preserves chart_of_accounts)',
    primaryCollections: ['journal_entries'],
    relatedCascades: [
      ...makeCollabCascadeEntries(['journal_entries'], ['accounts'], ['JE-']),
    ],
    recalculate: {},
    descAr: 'يمسح قيود دفتر اليومية العامة (journal_entries) فقط مع الحفاظ التام والكامل (100%) على شجرة دليل الحسابات وإعدادات التوجيه المالي (chart_of_accounts).',
    descEn: 'Wipes all General Journal Entries (journal_entries) while 100% preserving your Chart of Accounts and Financial Statement routing setup (chart_of_accounts).',
  },
  {
    key: 'opening_balances_only',
    category: 'operational',
    labelAr: 'الأرصدة الافتتاحية المخزنية والمالية فقط (Opening Stock & Financial Balances)',
    labelEn: 'Opening Stock & Financial Opening Balances Only',
    collectionsLabel: 'stock_ledger (OB-*) + journal_entries (JE-OB-*) + items.openingQtySmall',
    primaryCollections: [],
    relatedCascades: [
      {
        collection: 'stock_ledger',
        labelAr: 'حركات الأرصدة الافتتاحية في كارت الصنف (stock_ledger: opening_balance / OB-*)',
        labelEn: 'Opening stock balance movements in stock_ledger (opening_balance / OB-*)',
        predicate: (d) =>
          d.docType === 'opening_balance' ||
          ['opening_balance', 'opening_balance_initial', 'fg_opening_balance'].includes(d.action) ||
          String(d.lotNumber || '').startsWith('OB-') ||
          d.supplierId === 'INITIAL_BALANCE',
      },
      {
        collection: 'journal_entries',
        labelAr: 'قيود الأرصدة الافتتاحية في دفتر اليومية (journal_entries: JE-OB-*)',
        labelEn: 'Opening balance journal entries in journal_entries (JE-OB-*)',
        predicate: (d, docId) =>
          d.originType === 'opening_balance' ||
          String(docId || d.id || '').startsWith('JE-OB-') ||
          String(d.referenceNumber || '').startsWith('OB-'),
      },
    ],
    recalculate: {
      clearOpeningFieldsOnItems: true,
      recalcItemsStock: true,
    },
    descAr: 'يمسح حركات الأرصدة الافتتاحية فقط من كارت الصنف (stock_ledger) وقيود اليومية الافتتاحية، ويصفر حقول الرصيد الافتتاحي في كارت الأصناف مع إعادة احتساب المخزون الفعلي من باقي الحركات.',
    descEn: 'Selectively removes only Opening Stock movements from stock_ledger and Opening Balance journal entries, clearing opening balance fields on Item Master variations and recalculating stock from remaining movements.',
  },
  {
    key: 'all_inventory_movements',
    category: 'operational',
    labelAr: 'سجل الحركات الدفتري للمخزون والتحويلات الشامل (Full Stock Ledger & Transfers)',
    labelEn: 'Full Central Stock Ledger & All Transfers (stock_ledger & stock_transfers)',
    collectionsLabel: 'stock_ledger + stock_transfers + transfers + items.stock = 0',
    primaryCollections: ['stock_ledger', 'stock_transfers', 'transfers'],
    relatedCascades: [
      ...makeCollabCascadeEntries(['stock_ledger', 'stock_transfers', 'transfers'], ['stock', 'transfers'], ['TRN-', 'OB-']),
    ],
    recalculate: {
      clearOpeningFieldsOnItems: true,
      recalcItemsStock: true,
    },
    descAr: 'يمسح سجل الحركات الدفتري للمخزون (stock_ledger) وكافة أذون التحويل (stock_transfers) بالكامل، ويصفر أرصدة الخامات الدفترية في كارت الأصناف إلى (0) مع بقاء تعريفات الأصناف.',
    descEn: 'Wipes the entire Central Stock Ledger (stock_ledger) and all Stock Transfers (stock_transfers), resetting item stock balances to 0 while preserving Item Master definitions.',
  },
  {
    key: 'comments_and_notifications',
    category: 'operational',
    labelAr: 'التعليقات التعاونية، طابور الاعتمادات، وسجل التنبيهات فقط (Comments, Queue & Alerts)',
    labelEn: 'Collaborative Comments, Pending Actions Queue & System Notifications Only',
    collectionsLabel: 'record_comments + user_actions_queue + system_notifications',
    primaryCollections: ['record_comments', 'user_actions_queue', 'system_notifications'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'يمسح كافة التعليقات التعاونية على السجلات (record_comments)، وطابور المهام والاعتمادات (user_actions_queue)، وسجل الإشعارات (system_notifications) دون المساس بأي مستندات أو حركات.',
    descEn: 'Wipes all row-level collaborative comments, pending user action tasks, and system notifications without touching any operational or master records.',
  },

  // =========================================================================
  // GROUP B: MASTER DATA TABLES (ADMIN RESET FOR SPECIFIC MASTER COLLECTIONS)
  // =========================================================================
  {
    key: 'master_items',
    category: 'master',
    labelAr: 'قاعدة بيانات كارت الأصناف والخامات (Item Master — يحذف تعريفات الخامات)',
    labelEn: 'Item Master Database (items — Deletes Raw Material Definitions)',
    collectionsLabel: 'items',
    primaryCollections: ['items'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف سجل تعريفات الخامات والأصناف وتنوعاتها (items) بالكامل من قاعدة البيانات الأساسية.',
    descEn: 'WARNING: Permanently deletes all Raw Material & Item Master definitions (items).',
  },
  {
    key: 'master_suppliers',
    category: 'master',
    labelAr: 'قاعدة بيانات سجل الموردين المعتمدين (Suppliers Master)',
    labelEn: 'Suppliers Master Database (suppliers)',
    collectionsLabel: 'suppliers',
    primaryCollections: ['suppliers'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف سجل تعريفات الموردين وشروط الدفع والملفات الضريبية (suppliers) بالكامل.',
    descEn: 'WARNING: Permanently deletes all Supplier Master records (suppliers).',
  },
  {
    key: 'master_clients',
    category: 'master',
    labelAr: 'قاعدة بيانات سجل العملاء وتصنيفاتهم (Clients & Segments Master)',
    labelEn: 'Clients & Segments Master Database (clients & client_segments)',
    collectionsLabel: 'clients + client_segments',
    primaryCollections: ['clients', 'client_segments'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف سجل تعريفات العملاء وتصنيفاتهم (clients, client_segments) بالكامل.',
    descEn: 'WARNING: Permanently deletes all Client Master records and client segments.',
  },
  {
    key: 'master_finished_products',
    category: 'master',
    labelAr: 'قاعدة بيانات المنتجات التامة وتصنيفاتها (Finished Products & Categories)',
    labelEn: 'Finished Products & Categories Master (finished_products & finished_product_categories)',
    collectionsLabel: 'finished_products + finished_product_categories',
    primaryCollections: ['finished_products', 'finished_product_categories'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف سجل تعريفات المنتجات التامة وتصنيفاتها بالكامل.',
    descEn: 'WARNING: Permanently deletes all Finished Products and FG Categories master definitions.',
  },
  {
    key: 'master_boms_and_processes',
    category: 'master',
    labelAr: 'قوائم المكونات (BOM)، الخلطات الوسيطة (IBOM)، ومسارات التشغيل (SOPs)',
    labelEn: 'BOM Recipes, Intermediate Recipes & Production Processes (bom_recipes, intermediate_recipes, production_processes)',
    collectionsLabel: 'bom_recipes + intermediate_recipes + production_processes',
    primaryCollections: ['bom_recipes', 'intermediate_recipes', 'production_processes'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف شجرة المكونات (bom_recipes) والخلطات الوسيطة (intermediate_recipes) ومسارات التشغيل القياسية (production_processes).',
    descEn: 'WARNING: Permanently deletes all BOM recipes, intermediate recipes, and production processes.',
  },
  {
    key: 'master_warehouses_and_vessels',
    category: 'master',
    labelAr: 'سجل المستودعات وإعدادات خزانات السوائل بالصالة (Warehouses & Floor Vessels Master)',
    labelEn: 'Warehouses & Floor Liquid Vessels Master (warehouses & floor_liquid_vessels)',
    collectionsLabel: 'warehouses + floor_liquid_vessels',
    primaryCollections: ['warehouses', 'floor_liquid_vessels'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف تعريفات المستودعات والصالات (warehouses) وإعدادات سعة خزانات السوائل (floor_liquid_vessels).',
    descEn: 'WARNING: Permanently deletes all Warehouse definitions and Floor Liquid Vessel capacity configurations.',
  },
  {
    key: 'master_safes_and_banks',
    category: 'master',
    labelAr: 'تعريفات الخزائن النقدية والحسابات البنكية (Safes & Corporate Banks Master)',
    labelEn: 'Cash Safes & Corporate Banks Master Definitions (cash_safes & corporate_banks)',
    collectionsLabel: 'cash_safes + corporate_banks + bank_accounts',
    primaryCollections: ['cash_safes', 'corporate_banks', 'bank_accounts'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف بطاقات تعريف الخزائن النقدية والحسابات البنكية نفسها. (إذا كنت تريد تصفير الحركات والأرصدة فقط مع بقاء الخزائن والبنوك، اختر "حركات وسندات الخزائن والبنوك" من القائمة التشغيلية أعلاه).',
    descEn: 'WARNING: Deletes the Master Safe & Bank definitions themselves. (To wipe vouchers and zero balances while keeping safes/banks, choose "Cash & Bank Vouchers" from the Operational group above).',
  },
  {
    key: 'master_chart_of_accounts',
    category: 'master',
    labelAr: 'دليل شجرة الحسابات المحاسبية (Chart of Accounts Master — chart_of_accounts)',
    labelEn: 'Chart of Accounts Master Directory (chart_of_accounts)',
    collectionsLabel: 'chart_of_accounts',
    primaryCollections: ['chart_of_accounts'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف شجرة دليل الحسابات وإعدادات التوجيه المالي بالكامل. (إذا كنت تريد مسح قيود اليومية فقط مع بقاء دليل الحسابات، اختر "قيود دفتر اليومية العامة فقط" من القائمة التشغيلية أعلاه).',
    descEn: 'WARNING: Deletes the entire Chart of Accounts directory. (To wipe journal entries only while keeping COA intact, choose "General Journal Entries Only" from the Operational group above).',
  },
  {
    key: 'master_workers_and_vehicles',
    category: 'master',
    labelAr: 'سجل الموظفين والأقسام وأسطول المركبات (Employees, Departments & Vehicles)',
    labelEn: 'Staff, Departments & Vehicles Fleet Master (employees, departments & vehicles)',
    collectionsLabel: 'employees + departments + vehicles',
    primaryCollections: ['employees', 'departments', 'vehicles'],
    relatedCascades: [],
    recalculate: {},
    descAr: 'تحذير: يحذف سجل الموظفين والعمالة الموحد والأقسام وأسطول السيارات والشاحنات.',
    descEn: 'WARNING: Permanently deletes all Staff/Workers, Departments, and Vehicles Fleet master records.',
  },
];

