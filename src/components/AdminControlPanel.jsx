import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { APP_ARCHITECTURE } from '../config/appArchitecture';
import TabAppearanceManager from './TabAppearanceManager';
import {
  Plus,
  Shield,
  ShieldCheck,
  User,
  Users,
  UserPlus,
  Sliders,
  CheckCircle2,
  Lock,
  Save,
  Building2,
  Package,
  ShoppingCart,
  ArrowDownLeft,
  Boxes,
  LayoutDashboard,
  FileText,
  DollarSign,
  AlertTriangle,
  Sparkles,
  UploadCloud,
  Download,
  Trash2,
  AlertOctagon,
  FileSpreadsheet,
  CheckSquare,
  Table,
  FileUp,
  X,
  Search,
  ChevronRight,
  Database,
  Info,
  Edit3,
  Warehouse,
  Factory,
  ToggleLeft,
  ToggleRight,
  Palette,
  Layers,
  RotateCcw,
  Tag,
  Paperclip,
  Eye,
  ExternalLink,
  Zap,
  TrendingDown,
  FileCheck,
  Archive,
  HardDriveDownload,
  HardDriveUpload,
  FileJson,
  CheckCheck,
  Code,
  RefreshCw,
  PlusCircle,
  FolderOpen,
  Network,
  GitBranch,
  ArrowRightLeft,
  Workflow
} from 'lucide-react';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

// Base Registry for Standard Entity Descriptions & Categories
export const STATIC_GRAPH_METADATA = {
  items: { labelAr: 'سجل الخامات ومستلزمات الإنتاج', labelEn: 'Item Master (Raw Materials)', category: 'Master Data', color: '#059669' },
  suppliers: { labelAr: 'سجل الموردين المعتمدين', labelEn: 'Suppliers Master', category: 'Procurement', color: '#0d6cba' },
  warehouses: { labelAr: 'سجل المستودعات والصالات', labelEn: 'Warehouses Master', category: 'Inventory', color: '#4f46e5' },
  users: { labelAr: 'سجل المستخدمين والمشرفين', labelEn: 'User Accounts', category: 'Administration', color: '#0284c7' },
  categories: { labelAr: 'مجموعات وتصنيفات التكويد', labelEn: 'Category Groups', category: 'Master Data', color: '#6366f1' },
  finished_products: { labelAr: 'سجل المنتجات التامة', labelEn: 'Finished Goods Master', category: 'Master Data', color: '#e11d48' },
  intermediate_recipes: { labelAr: 'تركيبات الخامات الوسيطة (IBOM)', labelEn: 'Intermediate Recipes', category: 'Production', color: '#d97706' },
  liquid_tanks: { labelAr: 'تشغيل وتانكات الخامات (M)', labelEn: 'Bulk Liquid Tanks', category: 'Production', color: '#0891b2' },
  production_transformations: { labelAr: 'حركات التحويل والتصنيع الداخلي', labelEn: 'Production Transformations', category: 'Inventory & Production', color: '#7c3aed' },
  bom_recipes: { labelAr: 'شجرة وقوائم المكونات (BOM)', labelEn: 'Finished Goods BOM', category: 'Production', color: '#b45309' },
  work_orders: { labelAr: 'أوامر التشغيل والإنتاج (MO)', labelEn: 'Work Orders', category: 'Manufacturing', color: '#047857' },
  purchase_orders: { labelAr: 'أوامر الشراء (PO)', labelEn: 'Purchase Orders', category: 'Procurement', color: '#1d4ed8' },
  goods_receipts: { labelAr: 'أذون استلام المخزن (GRN/RTN)', labelEn: 'Goods Receipts & Returns', category: 'Inventory', color: '#0f766e' },
  stock_transfers: { labelAr: 'أذون التحويل المخزني (TRN)', labelEn: 'Stock Transfers', category: 'Inventory', color: '#6366f1' },
  stock_counts: { labelAr: 'الجرد الفعلي والتسويات', labelEn: 'Physical Stock Counts', category: 'Auditing', color: '#9333ea' },
  stock_ledger: { labelAr: 'سجل الحركات الدفتري العام', labelEn: 'Central Stock Ledger', category: 'Audit & Accounting', color: '#334155' },
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
    { pattern: /(transformationId|transformationDocId)/i, target: 'production_transformations', labelAr: 'حركة التحويل', labelEn: 'Transformation' },
    { pattern: /(categoryId)/i, target: 'categories', labelAr: 'مجموعة التكويد', labelEn: 'Category' },
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
import { openBase64Document } from '../firebase';
import PeacockLoader from './PeacockLoader';

const WAREHOUSE_COLOR_PALETTE = [
  { label: 'Sapphire Blue', hex: '#0d6cba' },
  { label: 'Emerald Green', hex: '#059669' },
  { label: 'Amber Gold', hex: '#d97706' },
  { label: 'Indigo Violet', hex: '#4f46e5' },
  { label: 'Rose Crimson', hex: '#e11d48' },
  { label: 'Purple Amethyst', hex: '#7c3aed' },
  { label: 'Teal Cyan', hex: '#0891b2' },
  { label: 'Slate Gray', hex: '#475569' },
];

const WAREHOUSE_ICON_CHOICES = [
  { id: 'Warehouse', labelAr: 'مستودع رئيسي', labelEn: 'Warehouse', Icon: Warehouse },
  { id: 'Factory', labelAr: 'صالة إنتاج', labelEn: 'Factory Floor', Icon: Factory },
  { id: 'Boxes', labelAr: 'مواد تعبئة', labelEn: 'Packaging', Icon: Boxes },
  { id: 'RotateCcw', labelAr: 'مرتجعات وحجر', labelEn: 'Returns', Icon: RotateCcw },
  { id: 'Trash2', labelAr: 'هوالك ومخلفات', labelEn: 'Scrap', Icon: Trash2 },
];

const ICON_MAP = {
  ShoppingCart,
  Building2,
  FileText,
  Boxes,
  Package,
  ArrowDownLeft,
  LayoutDashboard
};

export const BACKUP_COLLECTIONS_REGISTRY = [
  'users',
  'system_config',
  'suppliers',
  'items',
  'categories',
  'finished_products',
  'finished_product_categories',
  'warehouses',
  'intermediate_recipes',
  'production_transformations',
  'liquid_tanks',
  'shift_handovers',
  'bom_recipes',
  'work_orders',
  'material_issues',
  'fg_receipts',
  'yield_audits',
  'spare_parts_issues',
  'purchase_orders',
  'goods_receipts',
  'stock_transfers',
  'stock_counts',
  'stock_ledger',
];

export default function AdminControlPanel({ currentUser = {}, initialSubTab = null, initialTabFocus = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('admin_panel'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('admin_panel'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#059669';
  const { r, g, b } = hexToRgb(tabColor);

  const [activeSubTab, setActiveSubTab] = useState(initialSubTab || 'users'); // 'users' | 'warehouses' | 'permissions' | 'tab_appearance' | 'import' | 'backup_restore' | 'factory_reset' | 'db_inspector'

  // --- SUB-TAB: UNIVERSAL DATABASE INSPECTOR & DOCUMENT EDITOR STATE ---
  const [discoveredCollections, setDiscoveredCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [customCollectionInput, setCustomCollectionInput] = useState('');
  const [collectionDocs, setCollectionDocs] = useState([]);
  const [isScanningCollections, setIsScanningCollections] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [inspectorViewMode, setInspectorViewMode] = useState('diagram'); // 'diagram' | 'table'
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [selectedDocForEdit, setSelectedDocForEdit] = useState(null); // { id, data, isNew }
  const [docEditMode, setDocEditMode] = useState('fields'); // 'fields' | 'json'
  const [docJsonString, setDocJsonString] = useState('');
  const [docFieldsList, setDocFieldsList] = useState([]); // [{ key, value, type }]
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [dbInspectorMsg, setDbInspectorMsg] = useState('');

  // --- SUB-TAB: FULL & SELECTIVE BACKUP & RESTORE ENGINE STATE ---
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFilePayload, setRestoreFilePayload] = useState(null);
  const [restoreStrategy, setRestoreStrategy] = useState('clean_slate'); // 'clean_slate' | 'merge_upsert'
  const [backupRestoreMsg, setBackupRestoreMsg] = useState('');
  const [restoreProgressText, setRestoreProgressText] = useState('');
  const [selectedBackupCollections, setSelectedBackupCollections] = useState([...BACKUP_COLLECTIONS_REGISTRY]);
  const [selectedRestoreCollections, setSelectedRestoreCollections] = useState([]);

  // --- LIVE USERS STATE ---
  const [usersList, setUsersList] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    id: '',
    email: '',
    name: '',
    nameAr: '',
    department: 'المشتريات',
    role: 'standard', // 'general_admin' | 'standard'
    allowedModules: ['purchases'],
    status: 'active',
  });

  // --- LIVE WAREHOUSES MASTER STATE ---
  const [warehousesList, setWarehousesList] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [warehouseSearchTerm, setWarehouseSearchTerm] = useState('');
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [warehouseForm, setWarehouseForm] = useState({
    id: '',
    code: '',
    nameAr: '',
    nameEn: '',
    classification: 'raw_materials', // 'raw_materials' | 'factory_floor' | 'returns' | 'scrap'
    isActive: true,
    color: '#0d6cba',
    icon: 'Warehouse',
    responsibleUserId: '',
  });

  // --- SUB-TAB 2: HIERARCHICAL PERMISSIONS STATE ---
  const [selectedPermUserId, setSelectedPermUserId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('procurement');
  const [selectedTabId, setSelectedTabId] = useState('suppliers');
  const [permissionsState, setPermissionsState] = useState({});
  const [isSavingPerms, setIsSavingPerms] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isSavingWarehouse, setIsSavingWarehouse] = useState(false);
  const [isPatchingLots, setIsPatchingLots] = useState(false);
  const [patchSummaryMsg, setPatchSummaryMsg] = useState('');

  // --- SUB-TAB 3: BULK IMPORTER, ATTACHMENTS & VALIDATION STATE ---
  const [selectedImportTabKey, setSelectedImportTabKey] = useState('suppliers');
  const [importedRows, setImportedRows] = useState([]);
  const [rowValidationResults, setRowValidationResults] = useState([]);
  const [importFilterStatus, setImportFilterStatus] = useState('all'); // 'all' | 'valid' | 'warning' | 'error'
  const [showRowAttachModal, setShowRowAttachModal] = useState(null); // { rowIndex, row }
  const [rowCompressingSlot, setRowCompressingSlot] = useState(null); // tracking slot currently compressing
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');

  // --- SUB-TAB 4: TARGETED FACTORY RESET STATE ---
  const [selectedPurgeTargetKey, setSelectedPurgeTargetKey] = useState('all');
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSuccessMsg, setPurgeSuccessMsg] = useState('');

// =========================================================================
  // 🔍 ZERO-HARDCODING DYNAMIC DATABASE SCANNER & LIVE CRUD ENGINE
  // =========================================================================
  const handleScanDatabaseCollections = async () => {
    setIsScanningCollections(true);
    setDbInspectorMsg('');
    try {
      // 1. Extract every known and custom collection dynamically
      const candidateSet = new Set(BACKUP_COLLECTIONS_REGISTRY);

      Object.values(APP_ARCHITECTURE.modules || {}).forEach((mod) => {
        Object.values(mod.tabs || {}).forEach((tab) => {
          if (tab.collection) candidateSet.add(tab.collection);
        });
      });

      // Include previously discovered custom user collections
      discoveredCollections.forEach((c) => candidateSet.add(c.name));
      if (selectedCollection) candidateSet.add(selectedCollection);

      // 2. Live Dynamic Probing: Query real document counts & sample payloads
      const scannedResults = [];
      for (const collName of Array.from(candidateSet)) {
        try {
          const snap = await getDocs(collection(db, collName));
          scannedResults.push({
            name: collName,
            count: snap.size,
            sampleDoc: snap.docs[0]?.data() || null,
            allDocsSample: snap.docs.slice(0, 10).map((d) => d.data()),
          });
        } catch (err) {
          // Skip inaccessible collections silently
        }
      }

      // Automatically sort with non-empty collections first, then alphabetically
      scannedResults.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      setDiscoveredCollections(scannedResults);

      // Keep active selection valid, or switch to first active collection
      const targetStillExists = scannedResults.some((c) => c.name === selectedCollection);
      if ((!selectedCollection || !targetStillExists) && scannedResults.length > 0) {
        handleSelectCollection(scannedResults[0].name);
      }

      setDbInspectorMsg(
        isAr
          ? `اكتمل الفحص: تم اكتشاف (${scannedResults.length}) جدول وقاعدة بيانات نشطة بنجاح!`
          : `Scan complete: Discovered (${scannedResults.length}) active Firestore collections!`
      );
      setTimeout(() => setDbInspectorMsg(''), 4000);
    } catch (err) {
      console.error('Error scanning collections:', err);
      alert(isAr ? 'حدث خطأ أثناء فحص الجداول.' : 'Error scanning database.');
    } finally {
      setIsScanningCollections(false);
    }
  };

  const handleSelectCollection = async (collName) => {
    if (!collName) return;
    setSelectedCollection(collName);
    setIsLoadingDocs(true);
    try {
      const snap = await getDocs(collection(db, collName));
      const list = snap.docs.map((d) => ({
        _id: d.id,
        ...serializeForBackup(d.data()),
      }));
      setCollectionDocs(list);
    } catch (err) {
      console.error('Error fetching collection documents:', err);
      alert(isAr ? `فشل تحميل مستندات الجدول (${collName})` : `Failed to load docs for ${collName}`);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleOpenEditDocument = (docItem) => {
    const rawData = { ...docItem };
    delete rawData._id;

    // Convert object to field entries with inferred types
    const fields = Object.entries(rawData).map(([key, val]) => {
      let inferredType = typeof val;
      if (val === null) inferredType = 'null';
      else if (Array.isArray(val)) inferredType = 'array';
      else if (typeof val === 'object' && val?._type === 'firestore_timestamp') inferredType = 'timestamp';
      else if (typeof val === 'object') inferredType = 'object';

      return {
        key,
        value: typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val),
        type: inferredType,
      };
    });

    setSelectedDocForEdit({
      id: docItem._id,
      isNew: false,
    });
    setDocFieldsList(fields);
    setDocJsonString(JSON.stringify(rawData, null, 2));
    setDocEditMode('fields');
  };

  const handleOpenCreateDocument = () => {
    if (!selectedCollection) {
      alert(isAr ? 'يرجى اختيار الجدول أولاً.' : 'Please select a collection first.');
      return;
    }

    const newId = `doc_${Date.now().toString().slice(-6)}`;
    setSelectedDocForEdit({
      id: newId,
      isNew: true,
    });
    setDocFieldsList([{ key: 'name', value: '', type: 'string' }]);
    setDocJsonString('{\n  "name": ""\n}');
    setDocEditMode('fields');
  };

  const handleSaveDocument = async (e) => {
    e.preventDefault();
    if (!selectedDocForEdit || !selectedCollection) return;

    setIsSavingDoc(true);
    try {
      let payload = {};

      if (docEditMode === 'json') {
        try {
          payload = JSON.parse(docJsonString);
        } catch (jsonErr) {
          alert(isAr ? 'صيغة JSON غير صحيحة.' : 'Invalid JSON format.');
          setIsSavingDoc(false);
          return;
        }
      } else {
        docFieldsList.forEach((f) => {
          if (!f.key.trim()) return;
          const k = f.key.trim();
          let v = f.value;

          if (f.type === 'number') v = Number(f.value) || 0;
          else if (f.type === 'boolean') v = String(f.value).toLowerCase() === 'true';
          else if (f.type === 'null') v = null;
          else if (f.type === 'array' || f.type === 'object') {
            try {
              v = JSON.parse(f.value);
            } catch {
              v = f.value;
            }
          }
          payload[k] = v;
        });
      }

      const hydrated = hydrateFromBackup(payload);
      await setDoc(doc(db, selectedCollection, selectedDocForEdit.id), hydrated, { merge: true });

      setSelectedDocForEdit(null);
      handleSelectCollection(selectedCollection);
      alert(isAr ? 'تم حفظ وتحديث المستند في السحابة بنجاح!' : 'Document saved successfully!');
    } catch (err) {
      console.error('Error saving document:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المستند.' : 'Error saving document.');
    } finally {
      setIsSavingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm(isAr ? `هل أنت متأكد من حذف المستند (${docId}) نهائياً؟` : `Delete document (${docId}) permanently?`)) return;

    try {
      await deleteDoc(doc(db, selectedCollection, docId));
      handleSelectCollection(selectedCollection);
    } catch (err) {
      console.error('Error deleting document:', err);
      alert(isAr ? 'حدث خطأ أثناء حذف المستند.' : 'Error deleting document.');
    }
  };

  // Flattened Tabs List from Architecture
  const allTabsList = useMemo(() => {
    const tabs = [];
    Object.values(APP_ARCHITECTURE.modules).forEach((mod) => {
      Object.values(mod.tabs).forEach((tab) => {
        tabs.push({ ...tab, moduleId: mod.id, moduleLabelAr: mod.labelAr, moduleLabelEn: mod.labelEn });
      });
    });
    return tabs;
  }, []);

  // Real-time Firestore Listeners (Users & Permissions)
  useEffect(() => {
    // 1. Subscribe to Live Users Collection
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setUsersList(list);
      if (list.length > 0 && !selectedPermUserId) {
        setSelectedPermUserId(list[0].id);
      }
    });

    // 2. Subscribe to Live Warehouses Collection
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehousesList(list);
    });

    // 2.1 Subscribe to Live Suppliers Collection for Name Resolution
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name || '' }));
      setSuppliersList(list);
    });

    // 3. Subscribe to Permissions Config
    const unsubPerms = onSnapshot(doc(db, 'system_config', 'permissions'), (snap) => {
      if (snap.exists()) {
        setPermissionsState(snap.data().userOverrides || {});
      }
    });

    // 3. Sync Architecture Schema on boot
    setDoc(
      doc(db, 'system_config', 'app_architecture'),
      {
        ...APP_ARCHITECTURE,
        lastSyncedAt: serverTimestamp(),
        syncedBy: isAr ? currentUser.nameAr : currentUser.name,
      },
      { merge: true }
    );

    return () => {
      unsubUsers();
      unsubWarehouses();
      unsubPerms();
      unsubSuppliers();
    };
  }, []);

  // Active Target User for Permissions
  const activePermTargetUser = useMemo(() => {
    return usersList.find((u) => u.id === selectedPermUserId) || usersList[0] || null;
  }, [usersList, selectedPermUserId]);

  // Compute Active Granular Permissions
  const userEffectivePerms = useMemo(() => {
    if (!activePermTargetUser) return { modules: {}, actions: {}, sensitive: {}, fields: {} };

    const override = permissionsState[activePermTargetUser.id] || {};
    const defaultModules = {};
    const defaultActions = {};
    const defaultSensitive = {};
    const defaultFields = {};

    allTabsList.forEach((tab) => {
      defaultModules[tab.id] = true;
      (tab.actions || []).forEach((act) => {
        defaultActions[`${tab.id}.${act.key}`] = true;
      });
      Object.entries(tab.fields || {}).forEach(([fKey]) => {
        defaultFields[`${tab.id}.${fKey}`] = true;
      });
    });

    (APP_ARCHITECTURE.sensitiveNodes || []).forEach((node) => {
      defaultSensitive[node.key] = true;
    });

    return {
      modules: { ...defaultModules, ...(override.modules || {}) },
      actions: { ...defaultActions, ...(override.actions || {}) },
      sensitive: { ...defaultSensitive, ...(override.sensitive || {}) },
      fields: { ...defaultFields, ...(override.fields || {}) },
    };
  }, [permissionsState, activePermTargetUser, allTabsList]);

  // ==========================================
  // SUB-TAB 1: USER MANAGEMENT FUNCTIONS
  // ==========================================
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setUserForm({
      id: `usr_${Date.now().toString().slice(-6)}`,
      email: '',
      name: '',
      nameAr: '',
      department: 'المشتريات',
      role: 'standard',
      allowedModules: ['purchases'],
      status: 'active',
    });
    setUserModalOpen(true);
  };

  const handleOpenEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      ...user,
      email: user.email || '',
      role: user.role === 'general_admin' || user.isGeneralAdmin ? 'general_admin' : 'standard',
      allowedModules: user.allowedModules || ['purchases'],
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    const cleanEmail = String(userForm.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      alert(isAr ? 'يرجى إدخال بريد إلكتروني صحيح ومعتمد لتسجيل الدخول.' : 'Please enter a valid login email address.');
      return;
    }

    if (!userForm.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم المستخدم باللغة العربية.' : 'Please enter Arabic user name.');
      return;
    }

    // Unique Email Check across live user list
    const existingDuplicate = usersList.find(
      (u) => u.id !== userForm.id && String(u.email || '').toLowerCase() === cleanEmail
    );
    if (existingDuplicate) {
      alert(
        isAr
          ? `البريد الإلكتروني (${cleanEmail}) مسجل بالفعل لمستخدم آخر (${existingDuplicate.nameAr || existingDuplicate.name}).`
          : `Email (${cleanEmail}) is already assigned to another user.`
      );
      return;
    }

    setIsSavingUser(true);
    try {
      const isGeneralAdminUser = userForm.role === 'general_admin';
      const userDocId = userForm.id || `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

      await setDoc(
        doc(db, 'users', userDocId),
        {
          ...userForm,
          id: userDocId,
          email: cleanEmail,
          role: isGeneralAdminUser ? 'general_admin' : 'standard',
          isGeneralAdmin: isGeneralAdminUser,
          isPurchasingAdmin: isGeneralAdminUser || (userForm.allowedModules || []).includes('purchases'),
          allowedModules: isGeneralAdminUser
            ? ['purchases', 'production', 'sales', 'finance', 'hr']
            : (userForm.allowedModules || ['purchases']),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setUserModalOpen(false);
    } catch (err) {
      console.error('Error saving user profile:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ بيانات المستخدم.' : 'Error saving user.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (userId === currentUser.id) {
      alert(isAr ? 'لا يمكنك حذف حسابك الحالي.' : 'Cannot delete your active account.');
      return;
    }
    if (window.confirm(isAr ? `هل أنت متأكد من حذف المستخدم (${userId})؟` : `Delete user (${userId})?`)) {
      try {
        await deleteDoc(doc(db, 'users', userId));
      } catch (err) {
        console.error('Error deleting user:', err);
      }
    }
  };

  // Filtered users in management list (including email search)
  const filteredUsers = usersList.filter(
    (u) =>
      u.email?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.nameAr?.includes(userSearchTerm) ||
      u.id?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.department?.includes(userSearchTerm)
  );

  // ==========================================
  // WAREHOUSE MASTER HANDLERS
  // ==========================================
  const generateWarehouseCode = () => {
    const existingNums = warehousesList
      .map((w) => {
        const m = (w.code || '').match(/WH-(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : warehousesList.length + 1;
    return `WH-${String(nextNum).padStart(2, '0')}`;
  };

  const handleOpenCreateWarehouse = () => {
    setEditingWarehouse(null);
    const nextCode = generateWarehouseCode();
    setWarehouseForm({
      id: nextCode,
      code: nextCode,
      nameAr: '',
      nameEn: '',
      classification: 'raw_materials',
      isActive: true,
      color: '#0d6cba',
      icon: 'Warehouse',
      responsibleUserId: usersList.find((u) => u.status === 'active')?.id || '',
    });
    setWarehouseModalOpen(true);
  };

  const handleOpenEditWarehouse = (wh) => {
    setEditingWarehouse(wh);
    setWarehouseForm({
      id: wh.id || wh.code,
      code: wh.code || wh.id,
      nameAr: wh.nameAr || '',
      nameEn: wh.nameEn || '',
      classification: wh.classification || (wh.isFactoryLinked ? 'factory_floor' : 'raw_materials'),
      isActive: wh.isActive !== false,
      color: wh.color || '#0d6cba',
      icon: wh.icon || (wh.classification === 'factory_floor' || wh.isFactoryLinked ? 'Factory' : 'Warehouse'),
      responsibleUserId: wh.responsibleUserId || '',
    });
    setWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = async (e) => {
    e.preventDefault();
    if (!warehouseForm.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم المستودع بالعربية.' : 'Please enter Arabic warehouse name.');
      return;
    }

    setIsSavingWarehouse(true);
    try {
      const batch = writeBatch(db);
      const whId = warehouseForm.id || warehouseForm.code;
      const targetRef = doc(db, 'warehouses', whId);

      const isFactory = warehouseForm.classification === 'factory_floor';

      // Exclusive Rule: If designating as Factory Floor, reset any other warehouse holding this status
      if (isFactory) {
        warehousesList.forEach((w) => {
          if (w.id !== whId && (w.classification === 'factory_floor' || w.isFactoryLinked)) {
            batch.set(
              doc(db, 'warehouses', w.id),
              { classification: 'raw_materials', isFactoryLinked: false, updatedAt: serverTimestamp() },
              { merge: true }
            );
          }
        });
      }

      const assignedUser = usersList.find((u) => u.id === warehouseForm.responsibleUserId);

      batch.set(
        targetRef,
        {
          code: warehouseForm.code,
          nameAr: warehouseForm.nameAr.trim(),
          nameEn: warehouseForm.nameEn.trim(),
          classification: warehouseForm.classification,
          isFactoryLinked: isFactory,
          isActive: Boolean(warehouseForm.isActive),
          color: warehouseForm.color || '#0d6cba',
          icon: warehouseForm.icon || (isFactory ? 'Factory' : 'Warehouse'),
          responsibleUserId: warehouseForm.responsibleUserId || '',
          responsibleUserNameAr: assignedUser?.nameAr || '',
          responsibleUserNameEn: assignedUser?.name || '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      setWarehouseModalOpen(false);
    } catch (err) {
      console.error('Error saving warehouse:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ بيانات المستودع.' : 'Error saving warehouse.');
    } finally {
      setIsSavingWarehouse(false);
    }
  };

  const handleDeleteWarehouse = async (whId) => {
    if (window.confirm(isAr ? `هل أنت متأكد من حذف المستودع (${whId})؟` : `Delete warehouse (${whId})?`)) {
      try {
        await deleteDoc(doc(db, 'warehouses', whId));
      } catch (err) {
        console.error('Error deleting warehouse:', err);
      }
    }
  };

  const filteredWarehouses = warehousesList.filter(
    (w) =>
      w.nameAr?.includes(warehouseSearchTerm) ||
      w.nameEn?.toLowerCase().includes(warehouseSearchTerm.toLowerCase()) ||
      w.code?.toLowerCase().includes(warehouseSearchTerm.toLowerCase())
  );

  // Helper for Classification Badges
  const getClassificationBadge = (classification, isFactoryLinked) => {
    const key = classification || (isFactoryLinked ? 'factory_floor' : 'raw_materials');
    switch (key) {
      case 'factory_floor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
            <Factory className="h-3.5 w-3.5 text-amber-700" />
            <span>{isAr ? 'مخزن التشغيل والإنتاج' : 'Production Floor (مخزن التشغيل)'}</span>
          </span>
        );
      case 'returns':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
            <span>{isAr ? 'تحت حساب المرتجعات' : 'Returns & Quarantine'}</span>
          </span>
        );
      case 'scrap':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-50 text-red-800 border border-red-200">
            <Trash2 className="h-3.5 w-3.5 text-red-600" />
            <span>{isAr ? 'الهوالك والمخلفات' : 'Scrap & Damaged'}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Warehouse className="h-3.5 w-3.5 text-slate-500" />
            <span>{isAr ? 'مستودع تخزين خامات' : 'Raw Materials Storage'}</span>
          </span>
        );
    }
  };

  // ==========================================
  // SUB-TAB 2: HIERARCHICAL PERMISSION MATRIX
  // ==========================================
  const handleTogglePermission = (tier, key) => {
    if (activePermTargetUser?.isGeneralAdmin && key === 'admin_panel') {
      alert(isAr ? 'لا يمكن تعطيل لوحة التحكم للمسؤول العام.' : 'Cannot disable control panel for General Admin.');
      return;
    }

    setPermissionsState((prev) => {
      const currentOverrides = prev[selectedPermUserId] || {};
      const currentTier = currentOverrides[tier] || {};
      const nextVal = !userEffectivePerms[tier][key];

      return {
        ...prev,
        [selectedPermUserId]: {
          ...currentOverrides,
          [tier]: {
            ...currentTier,
            [key]: nextVal,
          },
        },
      };
    });
  };

  const handleResetUserPermsToDefault = () => {
    setPermissionsState((prev) => {
      const updated = { ...prev };
      delete updated[selectedPermUserId];
      return updated;
    });
    alert(
      isAr
        ? 'تمت استعادة الصلاحيات الكاملة الافتراضية للمستخدم (مع استثناء لوحة التحكم للمسؤول العام فقط).'
        : 'Full default permissions restored for this user (Admin Control Panel remains restricted to General Admin).'
    );
  };

  const handleSavePermsToCloud = async () => {
    setIsSavingPerms(true);
    try {
      await setDoc(
        doc(db, 'system_config', 'permissions'),
        {
          userOverrides: permissionsState,
          updatedAt: serverTimestamp(),
          updatedBy: isAr ? currentUser.nameAr : currentUser.name,
        },
        { merge: true }
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving permissions:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ الصلاحيات.' : 'Error saving permissions.');
    } finally {
      setIsSavingPerms(false);
    }
  };

  // Active module & tab schemas for granular tree
  const activeModuleSchema = APP_ARCHITECTURE.modules[selectedModuleId] || Object.values(APP_ARCHITECTURE.modules)[0];
  const activeTabSchema = activeModuleSchema?.tabs[selectedTabId] || Object.values(activeModuleSchema.tabs)[0];

  // ==========================================
  // 1-CLICK LOT AUDIT & DIAGNOSTIC PATCHER
  // ==========================================
  const handleAuditAndPatchHistoricalLots = async () => {
    setIsPatchingLots(true);
    try {
      const snap = await getDocs(collection(db, 'goods_receipts'));
      let patchedCount = 0;
      const batch = writeBatch(db);

      snap.docs.forEach((docSnap) => {
        const grn = docSnap.data();
        const lines = grn.lines || [];
        let modified = false;

        const updatedLines = lines.map((l, lIdx) => {
          if (!l.lotNumber) {
            modified = true;
            patchedCount++;
            return {
              ...l,
              lotNumber: l.linkedGrnId ? `${l.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}` : `${grn.id}-${String(lIdx + 1).padStart(2, '0')}`,
            };
          }
          return l;
        });

        if (modified) {
          batch.set(docSnap.ref, { lines: updatedLines, updatedAt: serverTimestamp() }, { merge: true });
        }
      });

      if (patchedCount > 0) {
        await batch.commit();
        setPatchSummaryMsg(
          isAr
            ? `اكتمل الفحص: تم تدقيق ومطابقة (${snap.docs.length}) إذن، ومعالجة وتعيين أرقام اللوطات لـ (${patchedCount}) بند تاريخي بنجاح!`
            : `Audit complete: Scanned ${snap.docs.length} receipts, backfilled ${patchedCount} historical lot numbers successfully!`
        );
      } else {
        setPatchSummaryMsg(
          isAr
            ? `فحص سليم 100%: جميع أذون الاستلام وسجلات المخزن (${snap.docs.length}) تحتوي على أرقام لوطات مطابقة ومعتمدة.`
            : `100% verified: All ${snap.docs.length} inventory documents have valid structured lot numbers.`
        );
      }

      setTimeout(() => setPatchSummaryMsg(''), 5000);
    } catch (err) {
      console.error('Error auditing lots:', err);
      alert(isAr ? 'حدث خطأ أثناء تدقيق اللوطات.' : 'Error auditing historical lots.');
    } finally {
      setIsPatchingLots(false);
    }
  };

  // ==========================================
  // SUB-TAB 3: DYNAMIC BULK IMPORTER
  // ==========================================
  const activeImportTabSchema = useMemo(() => {
    return allTabsList.find((t) => t.id === selectedImportTabKey) || allTabsList[0];
  }, [allTabsList, selectedImportTabKey]);

  const handleDownloadDynamicCsv = async () => {
    const schema = activeImportTabSchema;
    if (!schema || !schema.fields) return;

    // Specialized 2D Matrix CSV Template Generator for BOM Recipes
    if (schema.id === 'bom') {
      try {
        const [prodSnap, itemSnap] = await Promise.all([
          getDocs(collection(db, 'finished_products')),
          getDocs(collection(db, 'items')),
        ]);

        // F-Materials sorted strictly by code in ascending alphanumeric order
        const fMaterials = itemSnap.docs
          .map((d) => ({ ...d.data(), code: d.id }))
          .filter((item) => {
            const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
            return flagsArr.some((f) => String(f).toUpperCase().includes('F'));
          });
        fMaterials.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

        // Finished Products sorted strictly by code in ascending alphanumeric order
        const prods = prodSnap.docs.map((d) => ({ ...d.data(), code: d.id }));
        prods.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

        // Build Fixed Anchor Headers + Dynamic F-Material Columns
        const fixedHeaders = [
          'productNameAr',
          'productCode',
          'scopeType',
          'packagingOptionSuffix',
          'validityType',
          'startDate',
          'endDate',
          'rowType', // 'variant' | 'policy' | 'quantity'
        ];

        const materialColHeaders = fMaterials.map((m) => `${m.code}__${(m.nameAr || m.code).replace(/,/g, ' ')}`);
        const allHeaders = [...fixedHeaders, ...materialColHeaders];

        const csvLines = [allHeaders.join(',')];
        const todayStr = new Date().toISOString().split('T')[0];

        // Instructional Explanatory Guide Row (Row 2) - You can delete this row before uploading
        const guideRow = [
          '"=== اضبط اسم المنتج ==="',
          '"=== كود المنتج ==="',
          '"=== product_general أو option_specific ==="',
          '"=== لاحقة الخيار إن وجد مثل A ==="',
          '"=== open أو custom_range ==="',
          '"=== YYYY-MM-DD ==="',
          '"=== YYYY-MM-DD ==="',
          '"--- variant ثم policy ثم quantity (3 أسطر لكل منتج) ---"',
          ...fMaterials.map(() => '"اكتب الكمية تحت الخامة المطلوبة أو التنوع والسياسة"'),
        ];
        csvLines.push(guideRow.join(','));

        // Output General recipe 3-row block for every product, and option blocks ONLY if options > 1
        prods.forEach((p) => {
          const baseName = (p.nameAr || p.code).replace(/,/g, ' ');

          // General Product 3-Row Block
          csvLines.push([
            `"${baseName}"`,
            `"${p.code}"`,
            '"product_general"',
            '""',
            '"open"',
            `"${todayStr}"`,
            '""',
            '"variant"',
            ...fMaterials.map(() => '""'),
          ].join(','));

          csvLines.push([
            `"${baseName}"`,
            `"${p.code}"`,
            '"product_general"',
            '""',
            '"open"',
            `"${todayStr}"`,
            '""',
            '"policy"',
            ...fMaterials.map(() => '"preferred"'),
          ].join(','));

          csvLines.push([
            `"${baseName}"`,
            `"${p.code}"`,
            '"product_general"',
            '""',
            '"open"',
            `"${todayStr}"`,
            '""',
            '"quantity"',
            ...fMaterials.map((m, idx) => (idx === 0 ? `"${p.packagingRatio || 12}"` : '""')),
          ].join(','));

          // Secondary Option Blocks (Render ONLY Options B, C, D... Option A uses the General Product row)
          const optionsList = Array.isArray(p.packagingOptions) ? p.packagingOptions : [];
          const secondaryOptions = optionsList.filter((opt) => opt.suffix && opt.suffix.toUpperCase() !== 'A');

          secondaryOptions.forEach((opt) => {
            const optName = `${baseName} [${opt.suffix}]`;

            csvLines.push([
              `"${optName}"`,
              `"${p.code}"`,
              '"option_specific"',
              `"${opt.suffix}"`,
              '"open"',
              `"${todayStr}"`,
              '""',
              '"variant"',
              ...fMaterials.map(() => '""'),
            ].join(','));

            csvLines.push([
              `"${optName}"`,
              `"${p.code}"`,
              '"option_specific"',
              `"${opt.suffix}"`,
              '"open"',
              `"${todayStr}"`,
              '""',
              '"policy"',
              ...fMaterials.map(() => '"preferred"'),
            ].join(','));

            csvLines.push([
              `"${optName}"`,
              `"${p.code}"`,
              '"option_specific"',
              `"${opt.suffix}"`,
              '"open"',
              `"${todayStr}"`,
              '""',
              '"quantity"',
              ...fMaterials.map(() => '""'),
            ].join(','));
          });
        });

        const csvContent = csvLines.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `bom_matrix_template_${todayStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } catch (err) {
        console.error('Error generating 2D BOM matrix template:', err);
      }
    }

    // Default Flat Template Generation for all other entities
    const fieldKeys = Object.keys(schema.fields);
    const headerRow = fieldKeys.join(',');
    const sampleRow = fieldKeys.map((k) => `"${schema.fields[k].sample ?? ''}"`).join(',');

    const csvContent = `${headerRow}\n${sampleRow}`;
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${schema.id}_import_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // =========================================================================
  // 🛡️ PRE-IMPORT DATA VALIDATION ENGINE WITH DETAILED FIX GUIDES
  // =========================================================================
  const validateImportRow = (rowObj, lineIndex, schema) => {
    const errors = [];
    const warnings = [];
    const cellFlags = {}; // { [colKey]: 'error' | 'warning' }
    const cellMessages = {}; // { [colKey]: string }

    const fieldsSchema = schema.fields || {};

    // 1. Required Field Checks
    Object.entries(fieldsSchema).forEach(([key, fieldMeta]) => {
      const val = String(rowObj[key] || '').trim();
      if (fieldMeta.required && !val) {
        const msg = isAr
          ? `❌ الحقل الإلزامي (${fieldMeta.labelAr || key}) فارغ.\n💡 الإرشاد: أدخل قيمة فريدة مثل "${fieldMeta.sample || 'SUP-101'}".`
          : `❌ Required field (${fieldMeta.labelEn || key}) is missing.\n💡 Guide: Enter a valid value (e.g. "${fieldMeta.sample || 'SUP-101'}").`;
        errors.push(msg);
        cellFlags[key] = 'error';
        cellMessages[key] = msg;
      }
    });

    // 2. Data Type & Format Checks
    Object.entries(fieldsSchema).forEach(([key, fieldMeta]) => {
      const val = String(rowObj[key] || '').trim();
      if (!val) return;

      // Numeric Type Validation
      if (fieldMeta.type === 'number') {
        const num = Number(val);
        if (isNaN(num)) {
          const msg = isAr
            ? `❌ القيمة "${val}" في (${fieldMeta.labelAr || key}) غير رقمية.\n💡 الإرشاد: أدخل رقماً فقط (مثال: 0، 50، 100).`
            : `❌ Value "${val}" in (${key}) is not a number.\n💡 Guide: Enter numbers only (e.g. 0, 50, 100).`;
          errors.push(msg);
          cellFlags[key] = 'error';
          cellMessages[key] = msg;
        }
      }

      // Enum / Dropdown Option Validation
      if (fieldMeta.type === 'enum' && Array.isArray(fieldMeta.options)) {
        const validOptions = fieldMeta.options;
        const lowerVal = val.toLowerCase();
        if (!validOptions.includes(lowerVal) && !validOptions.includes(val)) {
          const msg = isAr
            ? `⚠️ القيمة "${val}" في (${fieldMeta.labelAr || key}) غير قياسية.\n📋 الخيارات القياسية المتاحة: [${validOptions.join(', ')}]\n💡 الإرشاد: استبدلها بأحد الخيارات القياسية المعتمدة.`
            : `⚠️ Value "${val}" in (${key}) is non-standard.\n📋 Allowed Standard Options: [${validOptions.join(', ')}]\n💡 Guide: Replace with one of the allowed options.`;
          warnings.push(msg);
          if (!cellFlags[key]) {
            cellFlags[key] = 'warning';
            cellMessages[key] = msg;
          }
        }
      }
    });

    // 3. Entity-Specific Business Rules: Suppliers
    if (schema.id === 'suppliers') {
      let sumPercent = 0;
      let hasTrancheValues = false;

      for (let t = 1; t <= 4; t++) {
        const pVal = rowObj[`tranche${t}_percent`];
        const dVal = rowObj[`tranche${t}_days`];
        const bVal = rowObj[`tranche${t}_base`];

        if (pVal !== undefined && pVal !== '' && !isNaN(Number(pVal))) {
          hasTrancheValues = true;
          sumPercent += Number(pVal);
        }

        // Days provided without percentage
        if (dVal !== undefined && dVal !== '' && (pVal === undefined || pVal === '' || Number(pVal) === 0)) {
          const msg = isAr
            ? `⚠️ تم تحديد مهلة للدفعة ${t} (${dVal} يوم) بينما نسبة الدفعة فارغة أو 0%.\n💡 الإرشاد: للدفعات المفردة أدخل 100 في (tranche${t}_percent). للدفعات المتعددة وزع النسب لتساوي 100%.`
            : `⚠️ Tranche ${t} has credit days (${dVal}) but percentage is empty or 0%.\n💡 Guide: For single payment terms, enter 100. For multi-tranches, split percentages so sum equals 100%.`;
          warnings.push(msg);
          if (!cellFlags[`tranche${t}_percent`]) {
            cellFlags[`tranche${t}_percent`] = 'warning';
            cellMessages[`tranche${t}_percent`] = msg;
          }
        }

        // Days provided without base date
        if (dVal !== undefined && dVal !== '' && (!bVal || !String(bVal).trim())) {
          const msg = isAr
            ? `⚠️ تم تحديد مهلة للدفعة ${t} دون تحديد أساس الاستحقاق.\n📋 الخيارات المتاحة: [delivery_date, end_of_month]\n💡 الإرشاد: اكتب "delivery_date" (من تاريخ التوريد) أو "end_of_month" (من نهاية الشهر).`
            : `⚠️ Tranche ${t} has days but missing base date.\n📋 Allowed Options: [delivery_date, end_of_month]\n💡 Guide: Enter "delivery_date" or "end_of_month".`;
          warnings.push(msg);
          if (!cellFlags[`tranche${t}_base`]) {
            cellFlags[`tranche${t}_base`] = 'warning';
            cellMessages[`tranche${t}_base`] = msg;
          }
        }
      }

      // Check sum of payment tranches
      if (hasTrancheValues && sumPercent !== 100 && sumPercent !== 0) {
        const msg = isAr
          ? `⚠️ إجمالي نسب دفعات السداد = ${sumPercent}% (المطلوب 100%).\n💡 الإرشاد: عدل نسب الدفعات في الجدول لتصل إلى 100% بالكامل.`
          : `⚠️ Total payment tranche percentages sum to ${sumPercent}% (Expected 100%).\n💡 Guide: Adjust tranche percentages so the total equals exactly 100%.`;
        warnings.push(msg);
        cellFlags['tranche1_percent'] = 'warning';
        cellMessages['tranche1_percent'] = msg;
      }

      // Check advance WHT compliance expiration date
      if (rowObj.whtCompliance === 'advance_payment' && !rowObj.whtAdvanceExpiryDate) {
        const msg = isAr
          ? `⚠️ تم اختيار موقف ضريبي (دفعات مقدمة) دون إدخال تاريخ انتهاء الشهادة.\n💡 الإرشاد: أدخل تاريخ الانتهاء بصيغة YYYY-MM-DD في عمود (whtAdvanceExpiryDate).`
          : `⚠️ Advance payment WHT selected without expiration date.\n💡 Guide: Enter expiration date (YYYY-MM-DD) in (whtAdvanceExpiryDate).`;
        warnings.push(msg);
        cellFlags['whtAdvanceExpiryDate'] = 'warning';
        cellMessages['whtAdvanceExpiryDate'] = msg;
      }
    }

   // 4. Entity-Specific Business Rules: Items / Raw Materials
    if (schema.id === 'items') {
      const ratio = Number(rowObj.var_packagingRatio);
      if (rowObj.var_packagingRatio && (isNaN(ratio) || ratio <= 0)) {
        const msg = isAr
          ? `⚠️ معامل الشدة للكرتونة يجب أن يكون قيمة رقمية موجبة أكبر من الصفر.\n💡 الإرشاد: أدخل عدد العبوات/القطع داخل الكرتونة (مثال: 100).`
          : `⚠️ Packaging ratio must be a positive number greater than zero.\n💡 Guide: Enter the unit count per bulk package (e.g. 100).`;
        warnings.push(msg);
        cellFlags['var_packagingRatio'] = 'warning';
        cellMessages['var_packagingRatio'] = msg;
      }

      // Opening Stock Validation Rules
      const openQty = Number(rowObj.var_openingQtySmall || 0);
      if (openQty > 0) {
        // Rule 1: Warning if opening warehouse is missing
        if (!rowObj.var_openingWarehouse || !String(rowObj.var_openingWarehouse).trim()) {
          const msg = isAr
            ? `⚠️ تم إدخال رصيد افتتاحي (${openQty}) بدون تحديد كود المستودع المستلم.\n💡 الإرشاد: أدخل كود المستودع مثل "WH-01" في عمود (var_openingWarehouse).`
            : `⚠️ Opening quantity (${openQty}) entered without target warehouse.\n💡 Guide: Enter warehouse code (e.g. "WH-01") in (var_openingWarehouse).`;
          warnings.push(msg);
          cellFlags['var_openingWarehouse'] = 'warning';
          cellMessages['var_openingWarehouse'] = msg;
        }

        // Rule 2: ERROR if unit cost is empty or invalid
        const cost = rowObj.var_openingUnitCost;
        if (cost === '' || cost === undefined || isNaN(Number(cost)) || Number(cost) < 0) {
          const msg = isAr
            ? `❌ تكلفة الوحدة للرصيد الافتتاحي إلزامية لحساب تقييم المخزون (FIFO).\n💡 الإرشاد: أدخل تكلفة شراء الوحدة بالجنيه في عمود (var_openingUnitCost).`
            : `❌ Unit cost is required for opening stock to calculate FIFO inventory valuation.\n💡 Guide: Enter unit cost (EGP) in (var_openingUnitCost).`;
          errors.push(msg);
          cellFlags['var_openingUnitCost'] = 'error';
          cellMessages['var_openingUnitCost'] = msg;
        }
      }
    }

    // 5. Entity-Specific Business Rules: Finished Products Master
    if (schema.id === 'finished_products') {
      const isOptionA = !rowObj.opt_suffix || String(rowObj.opt_suffix).trim().toUpperCase() === 'A';
      if (isOptionA && (!rowObj.opt_barcodeUnit || !String(rowObj.opt_barcodeUnit).trim())) {
        const msg = isAr
          ? `❌ باركود العبوة الصغرى EAN-13 إلزامي للعبوة الأساسية (Option A).\n💡 الإرشاد: أدخل باركود العبوة في عمود (opt_barcodeUnit).`
          : `❌ Small unit barcode (EAN-13) is required on standard Option A.\n💡 Guide: Enter barcode in (opt_barcodeUnit).`;
        errors.push(msg);
        cellFlags['opt_barcodeUnit'] = 'error';
        cellMessages['opt_barcodeUnit'] = msg;
      }

      // Deactivation Guard during import
      const isInactive = String(rowObj.status).toLowerCase() === 'inactive';
      const openQty = Number(rowObj.opt_openingQtySmall || 0);
      if (isInactive && openQty > 0) {
        const msg = isAr
          ? `❌ لا يمكن استيراد الصنف كـ (معطل/Inactive) مع وجود رصيد افتتاحي (${openQty}). يجب تفعيل الصنف أو جعل الرصيد صفراً.`
          : `❌ Product cannot be inactive with positive opening stock (${openQty}). Set status to active or zero out stock.`;
        errors.push(msg);
        cellFlags['status'] = 'error';
        cellMessages['status'] = msg;
      }

      // Shelf life validation (1 to 36 months)
      const shelfLife = Number(rowObj.shelfLifeMonths);
      if (rowObj.shelfLifeMonths && (isNaN(shelfLife) || shelfLife < 1 || shelfLife > 36)) {
        const msg = isAr
          ? `⚠️ مدة الصلاحية يجب أن تكون رقماً بين 1 و 36 شهراً (مثال: 24).`
          : `⚠️ Shelf life must be a number between 1 and 36 months (e.g. 24).`;
        warnings.push(msg);
        cellFlags['shelfLifeMonths'] = 'warning';
        cellMessages['shelfLifeMonths'] = msg;
      }

      const ratio = Number(rowObj.packagingRatio);
      if (rowObj.packagingRatio && (isNaN(ratio) || ratio <= 0)) {
        const msg = isAr
          ? `⚠️ معدل الشدة يجب أن يكون قيمة رقمية موجبة أكبر من الصفر.\n💡 الإرشاد: أدخل عدد العبوات داخل الكرتونة (مثال: 12).`
          : `⚠️ Packaging ratio must be a positive number greater than 0.`;
        warnings.push(msg);
        cellFlags['packagingRatio'] = 'warning';
        cellMessages['packagingRatio'] = msg;
      }

      if (rowObj.opt_largeUnitWeightKg && (isNaN(Number(rowObj.opt_largeUnitWeightKg)) || Number(rowObj.opt_largeUnitWeightKg) < 0)) {
        const msg = isAr
          ? `⚠️ وزن الوحدة الكبرى يجب أن يكون قيمة رقمية بالكيلوجرام (مثال: 12.80).`
          : `⚠️ Large unit weight must be a valid positive number in KG.`;
        warnings.push(msg);
        cellFlags['opt_largeUnitWeightKg'] = 'warning';
        cellMessages['opt_largeUnitWeightKg'] = msg;
      }

      if (rowObj.brandOwnership === 'private_label' && !rowObj.clientName?.trim()) {
        const msg = isAr
          ? `⚠️ تم اختيار ملكية علامة خاصة (تشغيل للغير) دون إدخال اسم العميل.\n💡 الإرشاد: اكتب اسم العميل صاحب العلامة في عمود (clientName).`
          : `⚠️ Private label brand selected without client name.\n💡 Guide: Enter client name in (clientName).`;
        warnings.push(msg);
        cellFlags['clientName'] = 'warning';
        cellMessages['clientName'] = msg;
      }
    }

    // 6. Entity-Specific Business Rules: BOM Recipes Master
    if (schema.id === 'bom') {
      if (!rowObj.finishedProductId || !String(rowObj.finishedProductId).trim()) {
        const msg = isAr
          ? `❌ كود المنتج التام المستهدف إلزامي لكل سطر تركيبة.\n💡 الإرشاد: أدخل كود منتج تام مسجل مثل "FG-101" في عمود (finishedProductId).`
          : `❌ Target finished product SKU is required.\n💡 Guide: Enter valid finished product code (e.g. "FG-101") in (finishedProductId).`;
        errors.push(msg);
        cellFlags['finishedProductId'] = 'error';
        cellMessages['finishedProductId'] = msg;
      }

      if (!rowObj.comp_itemId || !String(rowObj.comp_itemId).trim()) {
        const msg = isAr
          ? `❌ كود الخامة المكونة إلزامي (Flag F).\n💡 الإرشاد: أدخل كود خامة مسجلة مثل "F-101" أو "R-301" في عمود (comp_itemId).`
          : `❌ Raw material component SKU is required.\n💡 Guide: Enter material code in (comp_itemId).`;
        errors.push(msg);
        cellFlags['comp_itemId'] = 'error';
        cellMessages['comp_itemId'] = msg;
      }

      const compQty = Number(rowObj.comp_standardQty);
      if (rowObj.comp_standardQty === '' || isNaN(compQty) || compQty <= 0) {
        const msg = isAr
          ? `❌ الكمية القياسية للمكون لكل (1 كرتونة) يجب أن تكون أكبر من الصفر.\n💡 الإرشاد: أدخل المقدار المطلوب لإنتاج كرتونة واحدة في عمود (comp_standardQty).`
          : `❌ Standard quantity per 1 large unit must be greater than zero.`;
        errors.push(msg);
        cellFlags['comp_standardQty'] = 'error';
        cellMessages['comp_standardQty'] = msg;
      }

      if (rowObj.scopeType === 'option_specific' && (!rowObj.packagingOptionSuffix || !String(rowObj.packagingOptionSuffix).trim())) {
        const msg = isAr
          ? `⚠️ تم تحديد نطاق التركيبة كخاص بخيار تعبئة دون تحديد لاحقة الخيار (A, B).\n💡 الإرشاد: اكتب لاحقة الخيار مثل "A" في عمود (packagingOptionSuffix).`
          : `⚠️ Scope is option-specific but suffix is missing. Enter suffix (e.g. "A").`;
        warnings.push(msg);
        cellFlags['packagingOptionSuffix'] = 'warning';
        cellMessages['packagingOptionSuffix'] = msg;
      }

      if (rowObj.validityType === 'custom_range' && (!rowObj.endDate || !String(rowObj.endDate).trim())) {
        const msg = isAr
          ? `❌ تاريخ انتهاء السريان إلزامي عند اختيار نوع سريان محدد (custom_range).\n💡 الإرشاد: أدخل تاريخ الانتهاء بصيغة YYYY-MM-DD في عمود (endDate).`
          : `❌ End date is required when validityType is custom_range.`;
        errors.push(msg);
        cellFlags['endDate'] = 'error';
        cellMessages['endDate'] = msg;
      }
    }

    const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

    return {
      lineIndex,
      status,
      errors,
      warnings,
      cellFlags,
      cellMessages,
    };
  };

  // -------------------------------------------------------------------------
  // ✍️ IN-GRID CELL EDIT HANDLER (Real-Time Re-Validation on Keystroke)
  // -------------------------------------------------------------------------
  const handleCellEdit = (rowIndex, colKey, newValue) => {
    setImportedRows((prev) => {
      const updatedRows = [...prev];
      updatedRows[rowIndex] = {
        ...updatedRows[rowIndex],
        [colKey]: newValue,
      };

      // Re-validate the specific edited row immediately
      const newValidation = validateImportRow(updatedRows[rowIndex], rowIndex + 1, activeImportTabSchema);
      setRowValidationResults((prevVal) => {
        const updatedVal = [...prevVal];
        updatedVal[rowIndex] = newValidation;
        return updatedVal;
      });

      return updatedRows;
    });
  };

  // -------------------------------------------------------------------------
  // ⚡ 1-CLICK AUTO-FIX HELPER (Smart Multi-Tranche Aware)
  // -------------------------------------------------------------------------
  const handleAutoFixDefaults = () => {
    setImportedRows((prev) => {
      const updatedRows = prev.map((row) => {
        let newRow = { ...row };

        // 1. Auto-detect highest tranche in this row
        let highestTranche = 0;
        for (let t = 4; t >= 1; t--) {
          const p = newRow[`tranche${t}_percent`];
          const d = newRow[`tranche${t}_days`];
          const b = newRow[`tranche${t}_base`];
          if ((p !== undefined && p !== '' && Number(p) > 0) || (d !== undefined && d !== '' && Number(d) > 0) || (b && String(b).trim() !== '')) {
            highestTranche = Math.max(highestTranche, t);
            break;
          }
        }

        const effectiveCount = Math.max(1, Number(newRow.paymentTermsCount) || highestTranche || 1);
        newRow.paymentTermsCount = String(effectiveCount);

        // 2. If single tranche and percent is empty, set to 100%
        if (effectiveCount === 1) {
          const p1 = newRow.tranche1_percent;
          if (p1 === undefined || p1 === '' || Number(p1) === 0) {
            newRow.tranche1_percent = '100';
          }
        }

        // 3. For any tranche with days/percent, ensure baseDate defaults to delivery_date
        for (let t = 1; t <= effectiveCount; t++) {
          const hasTrancheData = newRow[`tranche${t}_days`] !== undefined && newRow[`tranche${t}_days`] !== '';
          if (hasTrancheData && (!newRow[`tranche${t}_base`] || !String(newRow[`tranche${t}_base`]).trim())) {
            newRow[`tranche${t}_base`] = 'delivery_date';
          }
        }

        // 4. Auto-fix Excel FALSE to standard credit_notes
        if (String(newRow.whtCompliance).toUpperCase() === 'FALSE' || !newRow.whtCompliance) {
          newRow.whtCompliance = 'credit_notes';
        }

        // 5. Auto-fix Finished Products Master defaults
        if (activeImportTabSchema.id === 'finished_products') {
          if (!newRow.productionLine) newRow.productionLine = 'white_o';
          if (!newRow.productType) newRow.productType = 'main';
          if (!newRow.brandOwnership) newRow.brandOwnership = 'own_brand';
          if (!newRow.vatRate) newRow.vatRate = '14%';
          if (!newRow.shelfLifeMonths) newRow.shelfLifeMonths = '24';
          if (!newRow.smallUnit) newRow.smallUnit = 'زجاجة';
          if (!newRow.largeUnitName) newRow.largeUnitName = 'كرتونة';
          if (!newRow.packagingRatio) newRow.packagingRatio = '12';
          if (!newRow.opt_suffix) newRow.opt_suffix = 'A';
          if (!newRow.opt_nameAr) newRow.opt_nameAr = 'التصميم القياسي المعتمد';
          if (!newRow.opt_packagingRatio) newRow.opt_packagingRatio = newRow.packagingRatio || '12';

          // Auto-calculate expiry date if production date is present but expiry is missing
          if (newRow.opt_openingProdDate && !newRow.opt_openingExpDate) {
            const d = new Date(newRow.opt_openingProdDate);
            if (!isNaN(d.getTime())) {
              d.setMonth(d.getMonth() + (Number(newRow.shelfLifeMonths) || 24));
              newRow.opt_openingExpDate = d.toISOString().split('T')[0];
            }
          }
        }

        // 6. Auto-fix BOM Recipes defaults
        if (activeImportTabSchema.id === 'bom') {
          if (!newRow.scopeType) newRow.scopeType = 'product_general';
          if (!newRow.validityType) newRow.validityType = 'open';
          if (!newRow.startDate) newRow.startDate = new Date().toISOString().split('T')[0];
          if (!newRow.comp_componentType) newRow.comp_componentType = 'raw_ingredient';
          if (!newRow.comp_variantPolicy) newRow.comp_variantPolicy = 'preferred';
          if (!newRow.comp_scrapBufferPercent) newRow.comp_scrapBufferPercent = '0';
          if (newRow.comp_variantCode && !newRow.comp_itemSelectionMode) {
            newRow.comp_itemSelectionMode = 'variant_specific';
          } else if (!newRow.comp_itemSelectionMode) {
            newRow.comp_itemSelectionMode = 'parent_generic';
          }
        }

        return newRow;
      });

      // Re-run validation for all rows
      const newValidations = updatedRows.map((r, i) => validateImportRow(r, i + 1, activeImportTabSchema));
      setRowValidationResults(newValidations);

      return updatedRows;
    });

    alert(
      isAr
        ? 'تم تطبيق التصحيح التلقائي للقيم الافتراضية ونسب الدفعات بنجاح!'
        : 'Auto-fixed default percentages (100%), base dates, and WHT flags successfully!'
    );
  };

  // -------------------------------------------------------------------------
  // ⚡ MULTI-PAGE PDF RASTERIZER & OPTIONAL AUTO-COMPRESSION ENGINE (MAX 6 PAGES)
  // -------------------------------------------------------------------------
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const readFileAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Rasterize multi-page PDF (up to 6 pages) and stitch into a single vertical image
  const rasterizeAndStitchPdf = async (file, maxPages = 6) => {
    if (!window.pdfjsLib) {
      throw new Error(isAr ? 'مكتبة معالجة الـ PDF غير محملة.' : 'PDF.js library is not loaded.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pagesToRender = Math.min(totalPages, maxPages);

    const pageCanvases = [];
    let totalHeight = 0;
    let maxWidth = 0;

    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1.5 });
      const targetWidth = Math.min(1600, baseViewport.width);
      const scale = targetWidth / page.getViewport({ scale: 1.0 }).width;
      const viewport = page.getViewport({ scale });

      const pCanvas = document.createElement('canvas');
      pCanvas.width = viewport.width;
      pCanvas.height = viewport.height;
      const pCtx = pCanvas.getContext('2d');

      await page.render({ canvasContext: pCtx, viewport }).promise;

      pageCanvases.push(pCanvas);
      totalHeight += pCanvas.height;
      if (pCanvas.width > maxWidth) maxWidth = pCanvas.width;
    }

    const gap = pagesToRender > 1 ? 16 : 0;
    const combinedHeight = totalHeight + gap * (pagesToRender - 1);

    const stitchedCanvas = document.createElement('canvas');
    stitchedCanvas.width = maxWidth;
    stitchedCanvas.height = combinedHeight;
    const ctx = stitchedCanvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, maxWidth, combinedHeight);

    let currentY = 0;
    for (let i = 0; i < pageCanvases.length; i++) {
      const pCanvas = pageCanvases[i];
      const xOffset = Math.round((maxWidth - pCanvas.width) / 2);
      ctx.drawImage(pCanvas, xOffset, currentY);
      currentY += pCanvas.height;

      if (i < pageCanvases.length - 1) {
        ctx.fillStyle = '#CBD5E1';
        ctx.fillRect(24, currentY + 7, maxWidth - 48, 2);
        currentY += gap;
      }
    }

    const compressedDataUrl = stitchedCanvas.toDataURL('image/jpeg', 0.75);
    const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
    const compressedSize = Math.round((base64Length * 3) / 4);

    return {
      dataUrl: compressedDataUrl,
      fileName: file.name,
      fileType: 'image/jpeg',
      originalSize: file.size,
      compressedSize,
      savingsPercent: file.size > compressedSize ? Number((((file.size - compressedSize) / file.size) * 100).toFixed(1)) : 0,
      isCompressed: true,
      mode: 'compressed_pdf',
      totalPages,
      renderedPages: pagesToRender,
      dimensions: `${maxWidth}×${combinedHeight}px`,
    };
  };

  // Compress regular image (JPG/PNG)
  const compressImageFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1600;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
          const compressedSize = Math.round((base64Length * 3) / 4);
          const savingsPercent = file.size > compressedSize
            ? Number((((file.size - compressedSize) / file.size) * 100).toFixed(1))
            : 0;

          resolve({
            dataUrl: compressedDataUrl,
            fileName: file.name,
            fileType: 'image/jpeg',
            originalSize: file.size,
            compressedSize,
            savingsPercent,
            isCompressed: savingsPercent > 0,
            mode: 'compressed_image',
            dimensions: `${width}×${height}px`,
          });
        };
        img.onerror = () => reject(new Error('Failed to load image.'));
        img.src = event.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Master Document Processor (Supports optional mode: 'compress' | 'raw')
  const processDocumentFile = async (file, mode = 'compress') => {
    const originalSize = file.size;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');
    const MAX_SAFE_RAW_BYTES = 700 * 1024;
    const startTime = performance.now();

    if (mode === 'raw') {
      if (originalSize > MAX_SAFE_RAW_BYTES) {
        const proceed = confirm(
          isAr
            ? `⚠️ تنبيه: حجم الملف الأصلي (${(originalSize / (1024 * 1024)).toFixed(2)} ميجابايت) يتجاوز الحد الآمن لقاعدة البيانات (700 كيلوبايت).\n\nهل ترغب في تحويله وضغطه ذكياً بنسبة 98% لتفادي فشل الحفظ؟\n(انقر OK للضغط والتحويل، أو Cancel للمحاولة كملف خام)`
            : `⚠️ Warning: Original file (${(originalSize / (1024 * 1024)).toFixed(2)} MB) exceeds the 700 KB safe database limit.\n\nWould you like to compress and convert it automatically?\n(Click OK to compress, Cancel to force raw upload)`
        );
        if (proceed) {
          return processDocumentFile(file, 'compress');
        }
      }

      const rawDataUrl = await readFileAsDataUrl(file);
      const endTime = performance.now();
      return {
        dataUrl: rawDataUrl,
        fileName: file.name,
        fileType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
        originalSize,
        compressedSize: originalSize,
        savingsPercent: 0,
        isCompressed: false,
        mode: 'raw_original',
        elapsedMs: Math.round(endTime - startTime),
      };
    }

    // MODE: SMART COMPRESS & CONVERT (PDF max 6 pages + Image compression)
    if (isPdf) {
      const result = await rasterizeAndStitchPdf(file, 6);
      const endTime = performance.now();
      return { ...result, elapsedMs: Math.round(endTime - startTime) };
    } else if (isImage) {
      const result = await compressImageFile(file);
      const endTime = performance.now();
      return { ...result, elapsedMs: Math.round(endTime - startTime) };
    } else {
      const rawDataUrl = await readFileAsDataUrl(file);
      const endTime = performance.now();
      return {
        dataUrl: rawDataUrl,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        originalSize,
        compressedSize: originalSize,
        savingsPercent: 0,
        isCompressed: false,
        mode: 'raw_original',
        elapsedMs: Math.round(endTime - startTime),
      };
    }
  };

  const handleUploadRowDoc = async (rowIndex, fieldKey, file, mode = 'compress') => {
    if (!file) return;
    setRowCompressingSlot(fieldKey);

    try {
      const result = await processDocumentFile(file, mode);

      setImportedRows((prev) => {
        const updated = [...prev];
        const currentRow = updated[rowIndex] || {};
        const currentStats = currentRow._compressionStats || {};

        updated[rowIndex] = {
          ...currentRow,
          [fieldKey]: result.dataUrl,
          _compressionStats: {
            ...currentStats,
            [fieldKey]: result,
          },
        };
        return updated;
      });

      setShowRowAttachModal((prev) => {
        if (!prev || prev.rowIndex !== rowIndex) return prev;
        const currentStats = prev.row._compressionStats || {};
        return {
          ...prev,
          row: {
            ...prev.row,
            [fieldKey]: result.dataUrl,
            _compressionStats: {
              ...currentStats,
              [fieldKey]: result,
            },
          },
        };
      });
    } catch (err) {
      console.error('Error processing document:', err);
      alert(err.message || (isAr ? 'حدث خطأ أثناء معالجة الملف.' : 'Error processing file.'));
    } finally {
      setRowCompressingSlot(null);
    }
  };

  const handleRemoveRowDoc = (rowIndex, fieldKey) => {
    setImportedRows((prev) => {
      const updated = [...prev];
      const currentRow = updated[rowIndex] || {};
      const currentStats = { ...(currentRow._compressionStats || {}) };
      delete currentStats[fieldKey];

      updated[rowIndex] = {
        ...currentRow,
        [fieldKey]: '',
        _compressionStats: currentStats,
      };
      return updated;
    });

    setShowRowAttachModal((prev) => {
      if (!prev || prev.rowIndex !== rowIndex) return prev;
      const currentStats = { ...(prev.row._compressionStats || {}) };
      delete currentStats[fieldKey];
      return {
        ...prev,
        row: {
          ...prev.row,
          [fieldKey]: '',
          _compressionStats: currentStats,
        },
      };
    });
  };
  
  // -------------------------------------------------------------------------
  // 💾 DOWNLOAD SANITIZED / CORRECTED CSV TO DEVICE (UTF-8 BOM Encoded)
  // -------------------------------------------------------------------------
  const handleDownloadCorrectedCsv = () => {
    if (importedRows.length === 0) return;

    const headers = Object.keys(importedRows[0]);
    const csvRows = [];

    // Header row
    csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','));

    // Data rows
    importedRows.forEach((row) => {
      const rowValues = headers.map((h) => {
        const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvRows.push(rowValues.join(','));
    });

    // Add UTF-8 BOM (\uFEFF) so Excel opens Arabic without corrupting characters
    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `corrected_${selectedImportTabKey}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          alert(isAr ? 'الملف فارغ أو لا يحتوي على بيانات صالحة.' : 'File is empty or invalid.');
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        const rows = [];
        const validations = [];

        // Robust RFC-4180 compliant CSV line tokenizer
        const parseCSVLine = (textLine) => {
          const result = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < textLine.length; i++) {
            const char = textLine[i];
            const nextChar = textLine[i + 1];
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                cur += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              result.push(cur.trim());
              cur = '';
            } else {
              cur += char;
            }
          }
          result.push(cur.trim());
          return result;
        };

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]).map((v) => v.replace(/^"|"$/g, '').trim());

          const rowObj = {};
          headers.forEach((h, idx) => {
            rowObj[h] = values[idx] !== undefined ? values[idx] : '';
          });

          // Run deep row validation
          const validation = validateImportRow(rowObj, i + 1, activeImportTabSchema);

          rows.push(rowObj);
          validations.push(validation);
        }

        setImportedRows(rows);
        setRowValidationResults(validations);
        setImportFilterStatus('all');
      } catch (err) {
        console.error('Error parsing CSV:', err);
        alert(isAr ? 'فشل قراءة ملف CSV.' : 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const handleCommitDynamicImport = async (onlyValidRows = false) => {
    if (importedRows.length === 0) return;

    // Filter rows if user chose to import only valid records
    const targetRowsWithMeta = importedRows
      .map((row, idx) => ({ row, validation: rowValidationResults[idx] }))
      .filter(({ validation }) => (!onlyValidRows ? true : validation.status !== 'error'));

    if (targetRowsWithMeta.length === 0) {
      alert(isAr ? 'لا توجد سجلات صالحة للاستيراد.' : 'No valid records found to import.');
      return;
    }

    const rowsToCommit = targetRowsWithMeta.map((item) => item.row);

    setIsImporting(true);

    try {
      const batch = writeBatch(db);
      const collectionName = activeImportTabSchema.collection;

      if (collectionName === 'items') {
        const grouped = {};
        rowsToCommit.forEach((row) => {
          if (!grouped[row.code]) {
            // Parse parent masterSpecs
            const masterSpecItems = row.masterSpecs
              ? row.masterSpecs.split('|').map((s) => {
                  const parts = s.split(':');
                  return { label: parts[0]?.trim() || '', value: parts[1]?.trim() || '' };
                }).filter((s) => s.label && s.value)
              : [];

            // Parse flags delimited by comma
            const parsedFlags = row.flags
              ? row.flags.split(',').map((f) => f.trim().toUpperCase()).filter(Boolean)
              : ['F'];

            grouped[row.code] = {
              code: row.code,
              nameAr: row.nameAr,
              nameEn: row.nameEn || row.nameAr,
              shortName: row.shortName || '',
              categoryId: Number(row.categoryId) || 1,
              flags: parsedFlags,
              smallUnit: row.smallUnit || 'عبوة',
              largeUnitName: row.largeUnitName || 'كرتونة',
              vatRate: row.vatRate || '14%',
              whtRate: row.whtRate || '1%',
              reorderLevel: Number(row.reorderLevel) || 0,
              masterSpecs: masterSpecItems,
              mergedSpecs: row.masterSpecs || '',
              variations: [],
              status: 'inactive', // Default to inactive until verified variants exist
              stock: 0,
            };
          }

          if (row.var_suffix && String(row.var_suffix).trim()) {
            const specItems = row.var_specs
              ? row.var_specs.split('|').map((s) => {
                  const parts = s.split(':');
                  return { label: parts[0]?.trim() || '', value: parts[1]?.trim() || '' };
                }).filter((s) => s.label && s.value)
              : [];

            const openQty = Number(row.var_openingQtySmall || 0);
            const supName = suppliersList.find((s) => s.id === row.var_supplierId)?.name || '';

            grouped[row.code].variations.push({
              suffix: row.var_suffix.trim().toUpperCase(),
              variantCode: `${row.code}-${row.var_suffix.trim().toUpperCase()}`,
              supplierId: row.var_supplierId || '',
              supplierName: supName,
              packagingRatio: Number(row.var_packagingRatio) || 100,
              smallUnit: row.var_smallUnit || row.smallUnit || 'عبوة',
              largeUnitName: row.var_largeUnitName || row.largeUnitName || 'كرتونة',
              specs: specItems,
              mergedSpecs: row.var_specs || '',
              stock: openQty,
              isActive: true,
              imageFile: row.var_image || '',
              openingWarehouse: row.var_openingWarehouse || '',
              openingQtySmall: openQty,
              openingUnitCost: Number(row.var_openingUnitCost || 0),
              openingBatchNo: row.var_openingBatchNo || '',
              openingProdDate: row.var_openingProdDate || '',
              openingExpDate: row.var_openingExpDate || '',
            });
          }
        });

        const todayStr = new Date().toISOString().split('T')[0];
        const todayCompact = todayStr.replace(/-/g, '');

        Object.values(grouped).forEach((item) => {
          const hasVars = item.variations.length > 0;
          const totalStock = hasVars ? item.variations.reduce((sum, v) => sum + (v.stock || 0), 0) : 0;
          const itemRef = doc(db, 'items', item.code);

          batch.set(
            itemRef,
            {
              ...item,
              status: hasVars ? 'active' : 'inactive', // Active if variants exist, Inactive if variantless
              stock: totalStock,
              variationsCount: item.variations.length,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          // Automatically generate approved Opening Balance vouchers for imported variants with starting stock
          item.variations.forEach((v) => {
            if (v.openingQtySmall > 0 && v.openingWarehouse) {
              const obId = `OB-${todayCompact}-${item.code}-${v.suffix}`;
              const obLotNo = `${obId}-01`;
              const ratio = Number(v.packagingRatio) || 1;

              const receiptRef = doc(db, 'goods_receipts', obId);
              batch.set(receiptRef, {
                id: obId,
                docType: 'opening_balance',
                status: 'approved',
                supplierId: v.supplierId || 'INITIAL_BALANCE',
                supplierName: isAr ? 'رصيد افتتاحي مستورد' : 'Imported Opening Balance',
                receiptDate: todayStr,
                targetWarehouse: v.openingWarehouse,
                lines: [
                  {
                    lotNumber: obLotNo,
                    itemId: item.code,
                    code: v.variantCode,
                    variantCode: v.variantCode,
                    variantSuffix: v.suffix,
                    nameAr: item.nameAr,
                    nameEn: item.nameEn,
                    specs: v.mergedSpecs || '',
                    targetWarehouse: v.openingWarehouse,
                    largeUnitName: v.largeUnitName,
                    receivedLargeUnits: Number((v.openingQtySmall / ratio).toFixed(2)),
                    packagingRatio: ratio,
                    smallUnit: v.smallUnit,
                    receivedSmallUnits: v.openingQtySmall,
                    unitPrice: Number(v.openingUnitCost) || 0,
                    currency: 'EGP',
                    hasBatchTracking: Boolean(v.openingBatchNo),
                    supplierBatchNo: v.openingBatchNo || 'OB-LOT',
                    productionDate: v.openingProdDate || '',
                    expiryDate: v.openingExpDate || '',
                    qcStatus: 'accepted',
                  },
                ],
                receivedBy: isAr ? currentUser.nameAr : currentUser.name || 'General Admin',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              const ledgerRef = doc(collection(db, 'stock_ledger'));
              batch.set(ledgerRef, {
                grnId: obId,
                lotNumber: obLotNo,
                action: 'opening_balance_imported',
                docType: 'opening_balance',
                itemId: item.code,
                variantCode: v.variantCode,
                materialNameAr: item.nameAr,
                qty: v.openingQtySmall,
                unit: v.smallUnit,
                warehouse: v.openingWarehouse,
                supplierId: v.supplierId || '',
                supplierName: isAr ? 'رصيد افتتاحي مستورد' : 'Imported Opening Balance',
                receiptDate: todayStr,
                batchNo: v.openingBatchNo || 'OB-LOT',
                productionDate: v.openingProdDate || null,
                expiryDate: v.openingExpDate || null,
                unitPrice: Number(v.openingUnitCost) || 0,
                currency: 'EGP',
                totalValue: v.openingQtySmall * (Number(v.openingUnitCost) || 0),
                receivedBy: isAr ? currentUser.nameAr : currentUser.name || 'General Admin',
                timestamp: serverTimestamp(),
              });
            }
          });
        });
      } else if (collectionName === 'finished_products') {
        const grouped = {};
        const todayStr = new Date().toISOString().split('T')[0];
        const todayCompact = todayStr.replace(/-/g, '');

        rowsToCommit.forEach((row) => {
          const prodCode = (row.code || '').trim().toUpperCase();
          const shelfLife = Number(row.shelfLifeMonths) || 24;

          if (!grouped[prodCode]) {
            grouped[prodCode] = {
              code: prodCode,
              nameAr: (row.nameAr || '').trim(),
              nameEn: (row.nameEn || row.nameAr || '').trim(),
              shortName: (row.shortName || '').trim(),
              productionLine: row.productionLine || 'white_o',
              productType: row.productType || 'main',
              brandOwnership: row.brandOwnership || 'own_brand',
              clientName: row.brandOwnership === 'private_label' ? (row.clientName || '').trim() : '',
              smallUnit: row.smallUnit || 'زجاجة',
              largeUnitName: row.largeUnitName || 'كرتونة',
              packagingRatio: Number(row.packagingRatio) || 12,
              shelfLifeMonths: shelfLife,
              vatRate: row.vatRate || '14%',
              isBonusEligible: String(row.isBonusEligible).toLowerCase() !== 'false',
              reorderLevel: Number(row.reorderLevel) || 0,
              imageFile: row.image || row.imageFile || '',
              status: row.status || 'active',
              packagingOptions: [],
            };
          }

          const suffix = (row.opt_suffix || (grouped[prodCode].packagingOptions.length === 0 ? 'A' : String.fromCharCode(65 + grouped[prodCode].packagingOptions.length))).trim().toUpperCase();
          const primaryOption = grouped[prodCode].packagingOptions[0] || {};
          const primaryBarcodeUnit = primaryOption.barcodeUnit || row.opt_barcodeUnit || '';
          const primaryBarcodeCase = primaryOption.barcodeCase || row.opt_barcodeCase || '';
          const primaryEtaBarcode = primaryOption.etaBarcode || row.opt_etaBarcode || '';
          const primaryWeightKg = primaryOption.largeUnitWeightKg !== undefined ? primaryOption.largeUnitWeightKg : (Number(row.opt_largeUnitWeightKg) || 0);

          // Calculate auto-expiry date if production date is provided but expiry is missing
          let expDate = row.opt_openingExpDate || '';
          if (row.opt_openingProdDate && !expDate) {
            const d = new Date(row.opt_openingProdDate);
            if (!isNaN(d.getTime())) {
              d.setMonth(d.getMonth() + shelfLife);
              expDate = d.toISOString().split('T')[0];
            }
          }

          grouped[prodCode].packagingOptions.push({
            id: `OPT-${String(grouped[prodCode].packagingOptions.length + 1).padStart(2, '0')}`,
            suffix,
            optionCode: `${prodCode}-${suffix}`,
            nameAr: row.opt_nameAr || (suffix === 'A' ? 'التصميم القياسي المعتمد' : `خيار تعبئة (${suffix})`),
            nameEn: row.opt_nameEn || (suffix === 'A' ? 'Standard Certified Design' : `Packaging Option (${suffix})`),
            barcodeUnit: row.opt_barcodeUnit || primaryBarcodeUnit,
            barcodeCase: row.opt_barcodeCase || primaryBarcodeCase,
            etaBarcode: row.opt_etaBarcode || primaryEtaBarcode,
            largeUnitWeightKg: row.opt_largeUnitWeightKg !== '' && row.opt_largeUnitWeightKg !== undefined ? Number(row.opt_largeUnitWeightKg) : primaryWeightKg,
            packagingRatio: Number(row.opt_packagingRatio) || Number(row.packagingRatio) || 12,
            imageFile: row.opt_image || row.opt_imageFile || '',
            openingWarehouse: row.opt_openingWarehouse || '',
            openingQtySmall: Number(row.opt_openingQtySmall || 0),
            openingBatchNo: row.opt_openingBatchNo || '',
            openingProdDate: row.opt_openingProdDate || '',
            openingExpDate: expDate,
            isActive: true,
          });
        });

        Object.values(grouped).forEach((prod) => {
          const prodRef = doc(db, 'finished_products', prod.code);
          batch.set(
            prodRef,
            {
              ...prod,
              packagingOptionsCount: prod.packagingOptions.length,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          // Automatically generate approved Opening Balance vouchers for options with starting stock
          prod.packagingOptions.forEach((opt) => {
            const openQty = Number(opt.openingQtySmall || 0);
            if (openQty > 0 && opt.openingWarehouse) {
              const obId = `OB-FG-${todayCompact}-${prod.code}-${opt.suffix}`;
              const obLotNo = `FG-LOT-${todayCompact}-${prod.code}-${opt.suffix}`;
              const ratio = Number(opt.packagingRatio) || Number(prod.packagingRatio) || 1;
              const finalExpDate = opt.openingExpDate || todayStr;

              const receiptRef = doc(db, 'goods_receipts', obId);
              batch.set(receiptRef, {
                id: obId,
                docType: 'opening_balance',
                status: 'approved',
                supplierId: 'FINISHED_GOODS_OPENING',
                supplierName: isAr ? 'رصيد افتتاحي منتج تام' : 'Finished Goods Opening Stock',
                receiptDate: todayStr,
                targetWarehouse: opt.openingWarehouse,
                lines: [
                  {
                    lotNumber: obLotNo,
                    itemId: prod.code,
                    code: `${prod.code}-${opt.suffix}`,
                    variantCode: `${prod.code}-${opt.suffix}`,
                    variantSuffix: opt.suffix,
                    nameAr: prod.nameAr,
                    nameEn: prod.nameEn,
                    specs: opt.nameAr || '',
                    targetWarehouse: opt.openingWarehouse,
                    largeUnitName: prod.largeUnitName,
                    receivedLargeUnits: Number((openQty / ratio).toFixed(2)),
                    packagingRatio: ratio,
                    smallUnit: prod.smallUnit,
                    receivedSmallUnits: openQty,
                    unitPrice: 0,
                    currency: 'EGP',
                    hasBatchTracking: Boolean(opt.openingBatchNo),
                    supplierBatchNo: opt.openingBatchNo || 'OB-LOT',
                    productionDate: opt.openingProdDate || todayStr,
                    expiryDate: finalExpDate,
                    qcStatus: 'accepted',
                  },
                ],
                receivedBy: currentUser?.nameAr || currentUser?.name || 'General Admin',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              const ledgerRef = doc(collection(db, 'stock_ledger'));
              batch.set(ledgerRef, {
                grnId: obId,
                lotNumber: obLotNo,
                action: 'fg_opening_balance',
                docType: 'opening_balance',
                itemId: prod.code,
                variantCode: `${prod.code}-${opt.suffix}`,
                materialNameAr: prod.nameAr,
                qty: openQty,
                unit: prod.smallUnit,
                warehouse: opt.openingWarehouse,
                receiptDate: todayStr,
                batchNo: opt.openingBatchNo || 'OB-LOT',
                productionDate: opt.openingProdDate || null,
                expiryDate: finalExpDate || null,
                receivedBy: currentUser?.nameAr || currentUser?.name || 'General Admin',
                timestamp: serverTimestamp(),
              });
            }
          });
        });
      } else if (collectionName === 'bom_recipes') {
        const grouped = {};
        const todayStr = new Date().toISOString().split('T')[0];

        // Detect if imported CSV is in 2D Matrix Format (has 'rowType' column)
        const isMatrixFormat = rowsToCommit.some((r) => r.rowType && ['variant', 'policy', 'quantity'].includes(String(r.rowType).toLowerCase()));

        if (isMatrixFormat) {
          // ==========================================
          // PIVOT 2D MATRIX CSV 3-ROW BLOCKS INTO RECIPES
          // ==========================================
          const matrixBlocks = {}; // key: `${productCode}_${scopeType}_${packagingOptionSuffix}` -> { meta, variantRow, policyRow, qtyRow }

          rowsToCommit.forEach((row) => {
            const prodCode = (row.productCode || row.finishedProductId || '').trim().toUpperCase();
            if (!prodCode) return;

            const scope = row.scopeType === 'option_specific' ? 'option_specific' : 'product_general';
            const suffix = scope === 'option_specific' ? (row.packagingOptionSuffix || 'A').trim().toUpperCase() : '';
            const blockKey = `${prodCode}_${scope}_${suffix}`;
            const rType = String(row.rowType || '').trim().toLowerCase();

            if (!matrixBlocks[blockKey]) {
              matrixBlocks[blockKey] = {
                productCode: prodCode,
                productNameAr: row.productNameAr || prodCode,
                scopeType: scope,
                packagingOptionSuffix: suffix,
                validityType: row.validityType === 'custom_range' ? 'custom_range' : 'open',
                startDate: row.startDate || todayStr,
                endDate: row.validityType === 'custom_range' ? row.endDate || null : null,
                variantRow: {},
                policyRow: {},
                qtyRow: {},
              };
            }

            if (rType === 'variant') matrixBlocks[blockKey].variantRow = row;
            else if (rType === 'policy') matrixBlocks[blockKey].policyRow = row;
            else if (rType === 'quantity') matrixBlocks[blockKey].qtyRow = row;
          });

          // Process each 3-row matrix block
          Object.values(matrixBlocks).forEach((block) => {
            const cleanProd = block.productCode.replace(/[^A-Za-z0-9]/g, '');
            const recipeCode = block.scopeType === 'option_specific' ? `BOM-${cleanProd}-${block.packagingOptionSuffix}` : `BOM-${cleanProd}-GEN`;
            const autoNameAr = block.scopeType === 'option_specific'
              ? `${block.productNameAr} [${block.packagingOptionSuffix}]`
              : `${block.productNameAr} - عام`;

            const components = [];

            // Iterate through material columns
            Object.keys(block.qtyRow).forEach((colKey) => {
              if (['productNameAr', 'productCode', 'finishedProductId', 'scopeType', 'packagingOptionSuffix', 'validityType', 'startDate', 'endDate', 'rowType'].includes(colKey)) return;

              const qty = Number(block.qtyRow[colKey]);
              if (qty > 0) {
                const rawItemId = colKey.split('__')[0].trim().toUpperCase();
                const variantVal = String(block.variantRow[colKey] || '').trim();
                const policyVal = String(block.policyRow[colKey] || 'preferred').trim().toLowerCase();
                const hasVariant = Boolean(variantVal);

                components.push({
                  itemId: rawItemId,
                  itemSelectionMode: hasVariant ? 'variant_specific' : 'parent_generic',
                  variantCode: hasVariant ? (variantVal.includes('-') ? variantVal : `${rawItemId}-${variantVal}`) : null,
                  variantPolicy: hasVariant ? (policyVal === 'mandatory' ? 'mandatory' : 'preferred') : null,
                  materialNameAr: rawItemId,
                  componentType: 'raw_ingredient',
                  standardQty: qty,
                  unit: 'عبوة',
                  scrapBufferPercent: 0,
                  instructionsAr: '',
                  specs: '',
                });
              }
            });

            if (components.length > 0) {
              grouped[recipeCode] = {
                id: recipeCode,
                code: recipeCode,
                nameAr: autoNameAr,
                nameEn: `${recipeCode} Recipe`,
                finishedProductId: block.productCode,
                finishedProductNameAr: block.productNameAr,
                scopeType: block.scopeType,
                packagingOptionSuffix: block.packagingOptionSuffix || null,
                packagingOptionCode: block.packagingOptionSuffix ? `${block.productCode}-${block.packagingOptionSuffix}` : null,
                validityType: block.validityType,
                startDate: block.startDate,
                endDate: block.endDate,
                standardYieldQty: 1, // Strictly 1 Large Unit (Carton)
                outputLargeUnit: 'كرتونة',
                packagingRatio: 12,
                outputSmallUnit: 'عبوة',
                notes: '',
                status: 'active',
                componentsCount: components.length,
                components,
              };
            }
          });
        } else {
          // Standard Flat CSV Format Ingestion
          rowsToCommit.forEach((row) => {
            const prodId = (row.finishedProductId || '').trim().toUpperCase();
            const scope = row.scopeType === 'option_specific' ? 'option_specific' : 'product_general';
            const suffix = scope === 'option_specific' ? (row.packagingOptionSuffix || 'A').trim().toUpperCase() : '';
            
            let recipeCode = (row.code || '').trim().toUpperCase();
            if (!recipeCode) {
              const cleanProd = prodId.replace(/[^A-Za-z0-9]/g, '');
              recipeCode = scope === 'option_specific' ? `BOM-${cleanProd}-${suffix}` : `BOM-${cleanProd}-GEN`;
            }

            if (!grouped[recipeCode]) {
              let autoNameAr = row.nameAr?.trim();
              if (!autoNameAr) {
                autoNameAr = scope === 'option_specific' ? `${prodId} [${suffix}]` : `${prodId} - عام`;
              }

              grouped[recipeCode] = {
                code: recipeCode,
                nameAr: autoNameAr,
                nameEn: (row.nameEn || autoNameAr).trim(),
                finishedProductId: prodId,
                finishedProductNameAr: '',
                scopeType: scope,
                packagingOptionSuffix: suffix || null,
                packagingOptionCode: suffix ? `${prodId}-${suffix}` : null,
                validityType: row.validityType === 'custom_range' ? 'custom_range' : 'open',
                startDate: row.startDate || todayStr,
                endDate: row.validityType === 'custom_range' ? (row.endDate || null) : null,
                standardYieldQty: 1, // Strictly 1 Large Unit
                outputLargeUnit: 'كرتونة',
                packagingRatio: 12,
                outputSmallUnit: 'عبوة',
                notes: (row.notes || '').trim(),
                status: 'active',
                components: [],
              };
            }

            const rawItemId = (row.comp_itemId || '').trim().toUpperCase();
            const variantCode = (row.comp_variantCode || '').trim();
            const hasVariant = Boolean(variantCode);

            grouped[recipeCode].components.push({
              itemId: rawItemId,
              itemSelectionMode: hasVariant ? 'variant_specific' : (row.comp_itemSelectionMode || 'parent_generic'),
              variantCode: hasVariant ? (variantCode.includes('-') ? variantCode : `${rawItemId}-${variantCode}`) : null,
              variantPolicy: hasVariant ? (row.comp_variantPolicy === 'mandatory' ? 'mandatory' : 'preferred') : null,
              materialNameAr: rawItemId,
              componentType: row.comp_componentType || 'raw_ingredient',
              standardQty: Number(row.comp_standardQty) || 1,
              unit: (row.comp_unit || 'عبوة').trim(),
              scrapBufferPercent: Number(row.comp_scrapBufferPercent) || 0,
              instructionsAr: (row.comp_instructionsAr || '').trim(),
              specs: '',
            });
          });
        }

        Object.values(grouped).forEach((rec) => {
          const recRef = doc(db, 'bom_recipes', rec.code);
          batch.set(
            recRef,
            {
              ...rec,
              componentsCount: rec.components.length,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
      } else if (collectionName === 'suppliers') {
        rowsToCommit.forEach((row) => {
          const docId = row.id || `SUP-${String(Date.now()).slice(-4)}`;
          const docRef = doc(db, collectionName, docId);

          // Smart auto-detection: check the highest tranche with entered data
          let detectedCount = Number(row.paymentTermsCount) || 0;
          for (let t = 4; t >= 1; t--) {
            const p = row[`tranche${t}_percent`];
            const d = row[`tranche${t}_days`];
            const b = row[`tranche${t}_base`];
            const hasData = (p !== undefined && p !== '' && Number(p) > 0) ||
                            (d !== undefined && d !== '' && Number(d) > 0) ||
                            (b && String(b).trim() !== '');
            if (hasData) {
              detectedCount = Math.max(detectedCount, t);
              break;
            }
          }
          const finalCount = Math.max(1, Math.min(4, detectedCount || 1));

          const tranches = [];
          for (let i = 1; i <= finalCount; i++) {
            tranches.push({
              percent: Number(row[`tranche${i}_percent`] !== undefined && row[`tranche${i}_percent`] !== '' ? row[`tranche${i}_percent`] : (i === 1 && finalCount === 1 ? 100 : 0)),
              days: Number(row[`tranche${i}_days`] || 0),
              baseDate: row[`tranche${i}_base`] || 'delivery_date',
            });
          }

          const supplierPayload = {
            id: docId,
            name: row.name || '',
            taxpayerLegalName: row.taxpayerLegalName || row.name || '',
            taxpayerAddress: row.taxpayerAddress || '',
            taxCardNumber: row.taxCardNumber || '',
            taxCardFile: row.taxCardFile || '',
            commercialRegister: row.commercialRegister || '',
            commercialRegisterFile: row.commercialRegisterFile || '',
            taxFileNumber: row.taxFileNumber || '',
            taxDistrict: row.taxDistrict || '',
            openingBalance: Number(row.openingBalance) || 0,
            openingBalanceFile: row.openingBalanceFile || '',
            whtCompliance: row.whtCompliance && String(row.whtCompliance).toUpperCase() !== 'FALSE' ? row.whtCompliance : 'credit_notes',
            whtAdvanceExpiryDate: row.whtAdvanceExpiryDate || '',
            whtAdvanceCertFile: row.whtAdvanceCertFile || '',
            paymentTerms: {
              tranchesCount: finalCount,
              tranches,
            },
            contacts: Array.isArray(row.contacts) && row.contacts.length > 0 ? row.contacts : [
              {
                name: row.contact_name || '',
                role: row.contact_role || '',
                email: row.contact_email || '',
                phones: [row.contact_phone || ''],
              },
            ],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          batch.set(docRef, supplierPayload, { merge: true });
        });
      } else {
        rowsToCommit.forEach((row) => {
          const docId = row.id || row.code;
          const docRef = doc(db, collectionName, docId);
          batch.set(docRef, { ...row, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        });
      }

      await batch.commit();
      setImportSuccessMsg(
        isAr
          ? `تم استيراد وحفظ (${rowsToCommit.length}) سجل بنجاح في جدول (${activeImportTabSchema.labelAr})!`
          : `Successfully imported (${rowsToCommit.length}) records to (${activeImportTabSchema.labelEn})!`
      );
      setImportedRows([]);
      setRowValidationResults([]);
      setTimeout(() => setImportSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Error committing dynamic import:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ البيانات المستوردة.' : 'Error committing import.');
    } finally {
      setIsImporting(false);
    }
  };

  // =========================================================================
  // 🦚 MASTER DATA BACKUP & CHUNKED RESTORE ENGINE (DYNAMIC MULTI-COLLECTION)
  // =========================================================================

  // Deep Serialization Helper (Preserves Firestore Timestamps, Dates & Base64 attachments)
  const serializeForBackup = (value) => {
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
  };

  // Deep Hydration Helper (Reinstantiates exact Firestore Timestamps & Dates)
  const hydrateFromBackup = (value) => {
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
  };

  // 1. Export Targeted Multi-Collection JSON Backup File
  const handleExportBackupJson = async () => {
    if (selectedBackupCollections.length === 0) {
      alert(isAr ? 'يرجى تحديد جدول واحد على الأقل للتصدير.' : 'Please select at least one collection to export.');
      return;
    }

    const targetCollections = selectedBackupCollections;

    setIsBackingUp(true);
    try {
      const collectionsData = {};
      const collectionCounts = {};
      let totalDocuments = 0;

      for (const collName of targetCollections) {
        const snap = await getDocs(collection(db, collName));
        const docsArray = snap.docs.map((docSnap) => ({
          _docId: docSnap.id,
          ...serializeForBackup(docSnap.data()),
        }));
        collectionsData[collName] = docsArray;
        collectionCounts[collName] = docsArray.length;
        totalDocuments += docsArray.length;
      }

      const now = new Date();
      const timestampIso = now.toISOString();
      const dateCompact = timestampIso.split('T')[0];
      const timeCompact = now.toTimeString().split(' ')[0].replace(/:/g, '-');

      const isFull = targetCollections.length === BACKUP_COLLECTIONS_REGISTRY.length;
      const filePrefix = isFull ? 'al_tawoos_erp_full_backup' : `al_tawoos_erp_partial_backup_${targetCollections.length}colls`;

      const backupEnvelope = {
        _backupHeader: {
          app: 'Al-Tawoos FMCG ERP',
          version: APP_ARCHITECTURE.version || '2.5',
          backupDate: timestampIso,
          exportedBy: isAr ? currentUser.nameAr : (currentUser.name || currentUser.email || 'General Admin'),
          isPartialBackup: !isFull,
          selectedCollections: targetCollections,
          totalCollections: targetCollections.length,
          totalDocuments,
          collectionCounts,
        },
        collections: collectionsData,
      };

      const jsonString = JSON.stringify(backupEnvelope, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filePrefix}_${dateCompact}_${timeCompact}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setBackupRestoreMsg(
        isAr
          ? `تم إنشاء وتنزيل النسخة الاحتياطية بنجاح! تم تصدير (${totalDocuments}) مستند عبر (${targetCollections.length}) جدول مختار.`
          : `Backup downloaded successfully! (${totalDocuments}) documents exported across (${targetCollections.length}) selected collections.`
      );
      setTimeout(() => setBackupRestoreMsg(''), 6000);
    } catch (err) {
      console.error('Error generating backup:', err);
      alert(isAr ? 'حدث خطأ أثناء تصدير النسخة الاحتياطية.' : 'Error generating backup.');
    } finally {
      setIsBackingUp(false);
    }
  };

  // 2. Select & Parse Backup File for Pre-Restore Verification
  const handleSelectRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed._backupHeader || !parsed.collections) {
          alert(
            isAr
              ? 'ملف النسخة الاحتياطية غير صالح أو لا يحتوي على بنية البيانات المعتمدة.'
              : 'Invalid backup file structure.'
          );
          return;
        }
        setRestoreFilePayload(parsed);
        // Automatically pre-select all collections present in the loaded backup payload
        setSelectedRestoreCollections(Object.keys(parsed.collections || {}));
      } catch (err) {
        console.error('Error parsing JSON backup file:', err);
        alert(isAr ? 'فشل قراءة وتحليل ملف الـ JSON.' : 'Failed to parse JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  // 3. Execute Selective Chunked Batch Restore (Max 400 writes per batch)
  const handleExecuteChunkedRestore = async () => {
    if (!restoreFilePayload) return;

    const collectionsMap = restoreFilePayload.collections || {};
    const targetCollections = selectedRestoreCollections.filter((c) => Array.isArray(collectionsMap[c]));

    if (targetCollections.length === 0) {
      alert(isAr ? 'يرجى تحديد جدول واحد على الأقل للاستعادة.' : 'Please select at least one collection to restore.');
      return;
    }

    const totalDocsToRestore = targetCollections.reduce((sum, c) => sum + (collectionsMap[c]?.length || 0), 0);

    const confirmMsg = isAr
      ? `تحذير هام: أنت على وشك استعادة (${totalDocsToRestore}) مستند عبر (${targetCollections.length}) جدول مختار باستخدام استراتيجية (${restoreStrategy === 'clean_slate' ? 'مسح الجداول المحددة واستبدالها' : 'دمج وتحديث'}). هل ترغب في المتابعة؟`
      : `Warning: You are about to restore (${totalDocsToRestore}) documents across (${targetCollections.length}) selected collections using (${restoreStrategy}). Proceed?`;

    if (!window.confirm(confirmMsg)) return;

    setIsRestoring(true);
    setRestoreProgressText(isAr ? 'جاري بدء معالجة حزم الاستعادة...' : 'Initializing batch chunks...');

    try {
      // Strategy 1: Clean Slate (Purge ONLY the selected collections prior to writing)
      if (restoreStrategy === 'clean_slate') {
        setRestoreProgressText(isAr ? 'جاري تفريغ الجداول المحددة لضمان مطابقة 100%...' : 'Purging selected collections...');
        for (const collName of targetCollections) {
          const snap = await getDocs(collection(db, collName));
          if (!snap.empty) {
            const docsToPurge = snap.docs;
            const CHUNK_SIZE = 400;
            for (let i = 0; i < docsToPurge.length; i += CHUNK_SIZE) {
              const chunk = docsToPurge.slice(i, i + CHUNK_SIZE);
              const purgeBatch = writeBatch(db);
              chunk.forEach((d) => purgeBatch.delete(d.ref));
              await purgeBatch.commit();
            }
          }
        }
      }

      // Restore Documents with Hydration in Chunks of 400
      let totalCommitted = 0;
      for (const collName of targetCollections) {
        const rawDocsList = collectionsMap[collName] || [];
        if (rawDocsList.length === 0) continue;

        setRestoreProgressText(
          isAr
            ? `جاري استعادة جدول (${collName}) - (${rawDocsList.length} مستند)...`
            : `Restoring (${collName}) - (${rawDocsList.length} docs)...`
        );

        const CHUNK_SIZE = 400;
        for (let i = 0; i < rawDocsList.length; i += CHUNK_SIZE) {
          const chunk = rawDocsList.slice(i, i + CHUNK_SIZE);
          const restoreBatch = writeBatch(db);

          chunk.forEach((item) => {
            const docId = item._docId;
            if (!docId) return;

            const docData = { ...item };
            delete docData._docId;

            const hydratedData = hydrateFromBackup(docData);
            const targetRef = doc(db, collName, docId);

            restoreBatch.set(targetRef, hydratedData, { merge: restoreStrategy === 'merge_upsert' });
          });

          await restoreBatch.commit();
          totalCommitted += chunk.length;
        }
      }

      setBackupRestoreMsg(
        isAr
          ? `اكتملت الاستعادة بنجاح تام! تم كتابة وتوثيق (${totalCommitted}) مستند عبر (${targetCollections.length}) جدول مختار.`
          : `Restore completed successfully! Hydrated (${totalCommitted}) documents across (${targetCollections.length}) collections.`
      );
      setRestoreFilePayload(null);
      setSelectedRestoreCollections([]);
      setTimeout(() => setBackupRestoreMsg(''), 8000);
    } catch (err) {
      console.error('Error during chunked restore execution:', err);
      alert(isAr ? 'حدث خطأ أثناء تنفيذ عملية الاستعادة.' : 'Error executing restore.');
    } finally {
      setIsRestoring(false);
      setRestoreProgressText('');
    }
  };

  // ==========================================
  // SUB-TAB 4: TARGETED FACTORY RESET ENGINE
  // ==========================================
  const handleExecuteDynamicPurge = async () => {
    if (confirmationPhrase !== 'CONFIRM-RESET-ERP') {
      alert(isAr ? 'عبارة التأكيد غير صحيحة.' : 'Incorrect confirmation phrase.');
      return;
    }

    setIsPurging(true);

    try {
      const collectionsToPurge = [];
      let shouldZeroStock = false;

      if (selectedPurgeTargetKey === 'all') {
        allTabsList.forEach((t) => {
          if (t.collection) collectionsToPurge.push(t.collection);
        });
        collectionsToPurge.push('stock_ledger', 'transfers', 'stock_transfers', 'stock_counts');
        shouldZeroStock = true;
      } else {
        const targetTab = allTabsList.find((t) => t.id === selectedPurgeTargetKey);
        if (targetTab?.collection) {
          collectionsToPurge.push(targetTab.collection);
          if (targetTab.collection === 'stock_transfers') {
            collectionsToPurge.push('stock_ledger');
            shouldZeroStock = true;
          }
          if (targetTab.resetCascades) {
            targetTab.resetCascades.forEach((c) => {
              if (c === 'items.stock') shouldZeroStock = true;
              else collectionsToPurge.push(c);
            });
          }
        }
      }

      // Purge collections
      for (const collName of Array.from(new Set(collectionsToPurge))) {
        const snap = await getDocs(collection(db, collName));
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Cascade: Zero out stock in Item Master
      if (shouldZeroStock) {
        const itemsSnap = await getDocs(collection(db, 'items'));
        if (!itemsSnap.empty) {
          const resetBatch = writeBatch(db);
          itemsSnap.docs.forEach((itemDoc) => {
            const data = itemDoc.data();
            const resetVariations = (data.variations || []).map((v) => ({ ...v, stock: 0 }));
            resetBatch.set(
              itemDoc.ref,
              { stock: 0, variations: resetVariations, updatedAt: serverTimestamp() },
              { merge: true }
            );
          });
          await resetBatch.commit();
        }
      }

      setPurgeSuccessMsg(
        isAr ? 'تم تصفير واستعادة ضبط المصنع بنجاح!' : 'Selected tables successfully purged to factory settings!'
      );
      setResetModalOpen(false);
      setConfirmationPhrase('');
      setTimeout(() => setPurgeSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Error during purge:', err);
      alert(isAr ? 'حدث خطأ أثناء مسح البيانات.' : 'Error during purge.');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Full-Screen Loading Feedback for Admin Actions */}
      {isPurging && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري استعادة ضبط المصنع وتصفير الجداول...' : 'Executing Factory Reset & Purging Tables...'}
        />
      )}
      {isImporting && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري معالجة وحفظ البيانات المستوردة...' : 'Processing and Saving Import Batch...'}
        />
      )}
      {isSavingPerms && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري حفظ وتحديث مصفوفة الصلاحيات سحابياً...' : 'Saving Permissions Matrix to Cloud...'}
        />
      )}
      {isSavingUser && (
        <PeacockLoader
          fullScreen
          size="lg"
          text={isAr ? 'جاري حفظ بيانات المستخدم...' : 'Saving User Profile...'}
        />
      )}
      {isSavingWarehouse && (
        <PeacockLoader
          fullScreen
          size="lg"
          text={isAr ? 'جاري حفظ وتحديث بيانات المستودع...' : 'Saving Warehouse Information...'}
        />
      )}

      {/* Global Control Panel Header with 4 Clear Sub-Tabs */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 border rounded-xl flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.2)`,
              borderColor: `rgba(${r}, ${g}, ${b}, 0.4)`,
              color: tabColor,
            }}
          >
            <TabConfigIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <span>{isAr ? (tabConfig?.labelAr || 'لوحة التحكم المركزية للمسؤول العام') : (tabConfig?.labelEn || 'Central Admin Control Panel')}</span>
              <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-emerald-400">
                v{APP_ARCHITECTURE.version}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr
                ? 'إدارة المستخدمين السحابية، مصفوفة الصلاحيات الهيكلية، الاستيراد والتصفير'
                : 'Cloud user accounts, hierarchical permissions, universal CSV imports, and reset engine'}
            </p>
          </div>
        </div>

        {/* 4 Sub-Tabs Bar */}
        <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveSubTab('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'users' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>{isAr ? 'إدارة المستخدمين' : 'User Accounts'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('warehouses')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'warehouses' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Warehouse className="h-3.5 w-3.5" />
            <span>{isAr ? 'إدارة المستودعات' : 'Warehouses'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('permissions')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'permissions' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>{isAr ? 'مصفوفة الصلاحيات' : 'Permissions Matrix'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tab_appearance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'tab_appearance' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            <span>{isAr ? 'مظهر وألوان التبويبات' : 'Tab Styling & Colors'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('import')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'import' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>{isAr ? 'الاستيراد الكتلي' : 'Bulk Data Import'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('backup_restore')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'backup_restore' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-indigo-300'
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>{isAr ? 'النسخ الاحتياطي والاستعادة' : 'Backup & Restore'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('db_inspector');
              if (discoveredCollections.length === 0) {
                handleScanDatabaseCollections();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'db_inspector' ? 'bg-cyan-700 text-white shadow-xs' : 'text-slate-300 hover:text-cyan-300'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>{isAr ? 'مستعرض ومحرر قاعدة البيانات' : 'DB Inspector'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('factory_reset')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'factory_reset' ? 'bg-rose-700 text-white shadow-xs' : 'text-slate-300 hover:text-rose-400'
            }`}
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>{isAr ? 'ضبط المصنع والتصفير' : 'Factory Reset'}</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {purgeSuccessMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-rose-600" />
          <span>{purgeSuccessMsg}</span>
        </div>
      )}
      {importSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{importSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 1: DEDICATED USER MANAGEMENT (Live Firestore Collection)           */}
      {/* ========================================================================= */}
      {activeSubTab === 'users' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                placeholder={isAr ? 'بحث بالاسم، كود المستخدم، الإدارة...' : 'Search users by name, ID, department...'}
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleOpenCreateUser}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <UserPlus className="h-4 w-4" />
              <span>{isAr ? 'تعريف مستخدم جديد' : 'Add New User'}</span>
            </button>
          </div>

          {/* Users Table with Email & Module Badges */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="p-3 text-start">{isAr ? 'المستخدم والبريد الإلكتروني' : 'User & Email'}</th>
                  <th className="p-3 text-start">{isAr ? 'الدور والنظام' : 'System Role'}</th>
                  <th className="p-3 text-start">{isAr ? 'الوحدات المصرح بها' : 'Permitted Modules'}</th>
                  <th className="p-3 text-start">{isAr ? 'الإدارة / القسم' : 'Department'}</th>
                  <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{isAr ? u.nameAr : (u.name || u.nameAr)}</div>
                      <div className="font-mono text-[11px] text-indigo-700 font-semibold">{u.email || u.id}</div>
                    </td>
                    <td className="p-3">
                      {u.role === 'general_admin' || u.isGeneralAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <ShieldCheck className="h-3 w-3 text-emerald-600" />
                          <span>{isAr ? 'مسؤول عام (Admin)' : 'General Admin'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                          <User className="h-3 w-3 text-slate-500" />
                          <span>{isAr ? 'مستخدم تشغيلي' : 'Standard User'}</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {u.role === 'general_admin' || u.isGeneralAdmin ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-bold text-[10px]">
                            {isAr ? 'كافة الوحدات (All Access)' : 'All 5 Modules'}
                          </span>
                        ) : (
                          (u.allowedModules || ['purchases']).map((modKey) => (
                            <span
                              key={modKey}
                              className="px-1.5 py-0.2 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-semibold"
                            >
                              {modKey === 'purchases' ? (isAr ? 'المشتريات' : 'Purchases') :
                               modKey === 'production' ? (isAr ? 'الإنتاج' : 'Production') :
                               modKey === 'sales' ? (isAr ? 'المبيعات' : 'Sales') :
                               modKey === 'finance' ? (isAr ? 'المالية' : 'Finance') :
                               (isAr ? 'HR' : 'HR')}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-700 font-medium">{u.department || '—'}</td>
                    <td className="p-3">
                      {u.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>{isAr ? 'نشط' : 'Active'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                          {isAr ? 'معطل' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                          title={isAr ? 'تعديل البيانات' : 'Edit User'}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title={isAr ? 'حذف الحساب' : 'Delete User'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Definition / Edit Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveUser} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="sticky -top-6 -mt-6 pt-6 bg-white z-30 flex justify-between items-center pb-2 mb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <UserPlus className="h-4 w-4 text-emerald-600" />
                <span>{editingUser ? (isAr ? 'تعديل حساب مستخدم' : 'Edit User Profile') : (isAr ? 'تعريف مستخدم جديد' : 'New User Profile')}</span>
              </h3>
              <button type="button" onClick={() => setUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Primary Unique Identifier: Email Address */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  {isAr ? 'البريد الإلكتروني لتسجيل الدخول (Login Email) *' : 'Login Email Address *'}
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@altawoos.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value.toLowerCase().trim() })}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الاسم بالكامل (عربي) *' : 'Full Name (Ar) *'}</label>
                  <input
                    type="text"
                    required
                    placeholder="أحمد سمير"
                    value={userForm.nameAr}
                    onChange={(e) => setUserForm({ ...userForm, nameAr: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الاسم بالإنجليزية' : 'Full Name (En)'}</label>
                  <input
                    type="text"
                    placeholder="Ahmed Samir"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الإدارة / القسم' : 'Department'}</label>
                  <input
                    type="text"
                    placeholder="المشتريات / الإنتاج"
                    value={userForm.department}
                    onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                {/* 2 Roles Only: General Admin vs Standard User */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الدور الأساسي بالمنظومة *' : 'System Role *'}</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="standard">{isAr ? 'مستخدم تشغيلي (Standard User)' : 'Standard User'}</option>
                    <option value="general_admin">{isAr ? 'مسؤول عام للنظام (General Admin)' : 'General Admin'}</option>
                  </select>
                </div>
              </div>

              {/* Module Visibility Gating (Standard User Only) */}
              {userForm.role !== 'general_admin' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="font-bold text-slate-800 block text-xs">
                    {isAr ? 'الوحدات المتاحة لهذا المستخدم (Module Access):' : 'Permitted Modules Checklist:'}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'purchases', labelAr: 'المشتريات والمخازن', labelEn: 'Purchases & Stock' },
                      { key: 'production', labelAr: 'الإنتاج والتشغيل', labelEn: 'Production' },
                      { key: 'sales', labelAr: 'المبيعات والتوزيع', labelEn: 'Sales' },
                      { key: 'finance', labelAr: 'المالية والحسابات', labelEn: 'Finance' },
                      { key: 'hr', labelAr: 'الموارد البشرية', labelEn: 'HR' },
                    ].map((mod) => {
                      const isChecked = (userForm.allowedModules || []).includes(mod.key);
                      return (
                        <label
                          key={mod.key}
                          className={`flex items-center gap-2 p-2 rounded-lg border transition cursor-pointer select-none ${
                            isChecked ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900' : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const current = userForm.allowedModules || [];
                              const next = isChecked
                                ? current.filter((k) => k !== mod.key)
                                : [...current, mod.key];
                              setUserForm({ ...userForm, allowedModules: next });
                            }}
                            className="accent-emerald-600 rounded"
                          />
                          <span className="text-[11px]">{isAr ? mod.labelAr : mod.labelEn}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'حالة الحساب' : 'Account Status'}</label>
                <select
                  value={userForm.status}
                  onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="active">{isAr ? 'نشط ومصرح له بالدخول' : 'Active'}</option>
                  <option value="inactive">{isAr ? 'معطل ومحظور مؤقتاً' : 'Inactive'}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                {isAr ? 'حفظ الحساب' : 'Save User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB: WAREHOUSE MASTER MANAGEMENT                                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'warehouses' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                placeholder={isAr ? 'بحث باسم المستودع أو الكود...' : 'Search warehouse by name or code...'}
                value={warehouseSearchTerm}
                onChange={(e) => setWarehouseSearchTerm(e.target.value)}
                className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleOpenCreateWarehouse}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <Warehouse className="h-4 w-4" />
              <span>{isAr ? 'إضافة مستودع جديد' : 'Add Warehouse'}</span>
            </button>
          </div>

          {/* Warehouses Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="p-3 text-start">{isAr ? 'كود المستودع' : 'Code'}</th>
                  <th className="p-3 text-start">{isAr ? 'اسم المستودع' : 'Warehouse Name'}</th>
                  <th className="p-3 text-start">{isAr ? 'المسؤول / أمين العهدة' : 'Assigned Custodian'}</th>
                  <th className="p-3 text-start">{isAr ? 'التصنيف التشغيلي' : 'Operational Classification'}</th>
                  <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWarehouses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      {isAr ? 'لا توجد مستودعات مسجلة حتى الآن.' : 'No warehouses defined yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredWarehouses.map((wh) => (
                    <tr key={wh.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-2xs border border-white"
                            style={{ backgroundColor: wh.color || '#0d6cba' }}
                            title={wh.color || '#0d6cba'}
                          />
                          <span>{wh.code}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{wh.nameAr}</div>
                        {wh.nameEn && <div className="text-[10px] text-slate-400 font-medium">{wh.nameEn}</div>}
                      </td>
                      <td className="p-3">
                        {(() => {
                          const assignedUser = usersList.find((u) => u.id === wh.responsibleUserId);
                          return assignedUser ? (
                            <div className="flex items-center gap-1.5 text-slate-800 font-semibold">
                              <User className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                              <span>{isAr ? assignedUser.nameAr : (assignedUser.name || assignedUser.nameAr)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">{isAr ? 'غير محدد' : 'Unassigned'}</span>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        {getClassificationBadge(wh.classification, wh.isFactoryLinked)}
                      </td>
                      <td className="p-3">
                        {wh.isActive !== false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>{isAr ? 'نشط' : 'Active'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                            {isAr ? 'معطل' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditWarehouse(wh)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                            title={isAr ? 'تعديل بيانات المستودع' : 'Edit Warehouse'}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteWarehouse(wh.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title={isAr ? 'حذف المستودع' : 'Delete Warehouse'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warehouse Definition & Edit Modal */}
      {warehouseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveWarehouse} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="sticky -top-6 -mt-6 pt-6 bg-white z-30 flex justify-between items-center pb-2 mb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Warehouse className="h-4 w-4 text-emerald-600" />
                <span>{editingWarehouse ? (isAr ? 'تعديل بيانات المستودع' : 'Edit Warehouse') : (isAr ? 'تعريف مستودع جديد' : 'New Warehouse')}</span>
              </h3>
              <button type="button" onClick={() => setWarehouseModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'كود المستودع (تلقائي)' : 'Warehouse Code'}</label>
                <input
                  type="text"
                  disabled
                  value={warehouseForm.code}
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold bg-slate-100 text-slate-700 text-center"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم المستودع بالعربية *' : 'Warehouse Name (Ar) *'}</label>
                <input
                  type="text"
                  required
                  placeholder="مستودع الخامات الرئيسي"
                  value={warehouseForm.nameAr}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, nameAr: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم المستودع بالإنجليزية' : 'Warehouse Name (En)'}</label>
                <input
                  type="text"
                  placeholder="Main Raw Materials Warehouse"
                  value={warehouseForm.nameEn}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, nameEn: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              {/* Assigned Warehouse Custodian / Manager Dropdown */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{isAr ? 'المسؤول / أمين عهدة المستودع: *' : 'Assigned Custodian / Manager: *'}</span>
                </label>
                <select
                  value={warehouseForm.responsibleUserId}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, responsibleUserId: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                >
                  <option value="">{isAr ? '-- اختر المسؤول المعتمد لهذا المخزن --' : '-- Select Assigned Custodian --'}</option>
                  {usersList
                    .filter((u) => u.status !== 'inactive')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {isAr ? u.nameAr : (u.name || u.nameAr)} • [{u.role.toUpperCase()}] ({u.department || '—'})
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  {isAr
                    ? 'سيُطلب من هذا المستخدم اعتماد وتأكيد أي حركة تحويل واردة أو صادرة من هذا المستودع.'
                    : 'This user will be required to inspect and verify transfers to/from this warehouse.'}
                </p>
              </div>

              {/* Operational Classification Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'التصنيف التشغيلي للمستودع *' : 'Operational Classification *'}</label>
                <select
                  value={warehouseForm.classification}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, classification: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
                >
                  <option value="raw_materials">{isAr ? 'مستودع تخزين خامات' : 'Raw Materials Storage'}</option>
                  <option value="factory_floor">{isAr ? 'مخزن التشغيل والإنتاج (خاص بالصالة)' : 'Production Floor (مخزن التشغيل)'}</option>
                  <option value="returns">{isAr ? 'تحت حساب المرتجعات' : 'Returns & Quarantine'}</option>
                  <option value="scrap">{isAr ? 'الهوالك والمخلفات' : 'Scrap & Damaged'}</option>
                </select>
                {warehouseForm.classification === 'factory_floor' && (
                  <p className="text-[10px] text-amber-800 mt-1">
                    {isAr
                      ? 'مخزن التشغيل هو المخزن الذي تسحب منه خطوط الإنتاج وتوضع فيه المنتجات التامة. (مستودع واحد فقط مسموح به في النظام).'
                      : 'Used for direct production staging. Exactly one warehouse can hold this designation.'}
                  </p>
                )}
              </div>

              {/* Warehouse Color Branding */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{isAr ? 'السمة اللونية المميزة للمستودع (Color Tag):' : 'Warehouse Color Tag:'}</span>
                </label>
                <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {WAREHOUSE_COLOR_PALETTE.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setWarehouseForm({ ...warehouseForm, color: c.hex })}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer shadow-xs flex items-center justify-center ${
                        warehouseForm.color === c.hex ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    >
                      {warehouseForm.color === c.hex && <CheckCircle2 className="h-4 w-4 text-white drop-shadow-xs" />}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={warehouseForm.color || '#0d6cba'}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, color: e.target.value })}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 bg-white p-0.5"
                    title={isAr ? 'لون مخصص' : 'Custom color'}
                  />
                </div>
              </div>

              {/* Warehouse Icon Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الأيقونة الرمزية للمستودع:' : 'Warehouse Icon Symbol:'}
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {WAREHOUSE_ICON_CHOICES.map((ic) => {
                    const IconComp = ic.Icon;
                    const isSelected = warehouseForm.icon === ic.id;
                    return (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => setWarehouseForm({ ...warehouseForm, icon: ic.id })}
                        className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <IconComp className="h-4 w-4" />
                        <span className="text-[9px] truncate w-full">{isAr ? ic.labelAr : ic.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{isAr ? 'حالة التفعيل' : 'Status'}</label>
                <select
                  value={warehouseForm.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, isActive: e.target.value === 'active' })}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="active">{isAr ? 'مستودع نشط ومتاح للاستلام والتحويل' : 'Active'}</option>
                  <option value="inactive">{isAr ? 'مستودع معطل وموقوف' : 'Inactive'}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWarehouseModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                {isAr ? 'حفظ المستودع' : 'Save Warehouse'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: HIERARCHICAL DRILL-DOWN PERMISSION MATRIX                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'permissions' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Header Action Bar with Scalable Combobox Selector */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <label className="text-xs font-bold text-slate-700 shrink-0">{isAr ? 'اختر المستخدم:' : 'Select User:'}</label>
              <select
                value={selectedPermUserId}
                onChange={(e) => setSelectedPermUserId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-slate-50 font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {isAr ? u.nameAr : (u.name || u.nameAr)} • [{u.role.toUpperCase()}] ({u.department})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetUserPermsToDefault}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{isAr ? 'استعادة الافتراضي' : 'Reset Defaults'}</span>
              </button>

              <button
                type="button"
                onClick={handleSavePermsToCloud}
                disabled={isSavingPerms}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                {isSavingPerms ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>{isAr ? 'حفظ وتطبيق الصلاحيات' : 'Save Changes'}</span>
              </button>
            </div>
          </div>

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{isAr ? 'تم حفظ ومزامنة الصلاحيات بنجاح!' : 'Permissions synchronized successfully!'}</span>
            </div>
          )}

          {/* Hierarchical Drill-Down Workspace (Module -> Tab -> Actions/Fields) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Column 1: Module & Tab Navigation Tree */}
            <div className="md:col-span-4 space-y-3">
              <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block px-1">
                  {isAr ? '١- اختر الموديول والتبويب' : '1- Select Module & Tab'}
                </span>

                <div className="space-y-3">
                  {Object.values(APP_ARCHITECTURE.modules).map((mod) => (
                    <div key={mod.id} className="space-y-1">
                      <div className="text-xs font-bold text-slate-900 px-2 py-1 bg-slate-50 rounded-lg flex items-center gap-1.5">
                        <Boxes className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{isAr ? mod.labelAr : mod.labelEn}</span>
                      </div>

                      <div className="ps-2 space-y-1">
                        {Object.values(mod.tabs).map((tab) => {
                          const isSelected = selectedTabId === tab.id;
                          const isTabActiveInNav = Boolean(userEffectivePerms.modules[tab.id]);

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setSelectedModuleId(mod.id);
                                setSelectedTabId(tab.id);
                              }}
                              className={`w-full p-2 rounded-xl text-start text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className={`h-2 w-2 rounded-full ${isTabActiveInNav ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <span className="truncate">{isAr ? tab.labelAr : tab.labelEn}</span>
                              </div>
                              <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition rtl:rotate-180 ${isSelected ? 'translate-x-0.5 rtl:-translate-x-0.5 text-emerald-600' : ''}`} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2: Granular Authority & Sensitive Masking for Selected Tab */}
            <div className="md:col-span-8 space-y-4">
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4">
                {/* Active Tab Header & Sidebar Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-emerald-600" />
                      <span>{isAr ? activeTabSchema.labelAr : activeTabSchema.labelEn}</span>
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Collection: {activeTabSchema.collection}
                    </span>
                  </div>

                  {/* Tab Navigation Visibility Toggle */}
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-slate-50 p-2 rounded-xl border border-slate-200 cursor-pointer">
                    <span>{isAr ? 'إتاحة التبويب بالشريط الجانبي' : 'Show Tab in Navigation'}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(userEffectivePerms.modules[activeTabSchema.id])}
                      onChange={() => handleTogglePermission('modules', activeTabSchema.id)}
                      className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Granular Operational Actions for this specific tab */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">
                    {isAr ? 'الصلاحيات التشغيلية المعتمدة لهذا التبويب:' : 'Operational Actions Authority:'}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(activeTabSchema.actions || []).map((act) => {
                      const permKey = `${activeTabSchema.id}.${act.key}`;
                      return (
                        <label
                          key={act.key}
                          className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl cursor-pointer select-none transition"
                        >
                          <span className="font-medium text-slate-800">{isAr ? act.labelAr : act.labelEn}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(userEffectivePerms.actions[permKey])}
                            onChange={() => handleTogglePermission('actions', permKey)}
                            className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Dynamic Field-Level Sensitive Masking for Active Tab */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                      <span>{isAr ? `حجب الحقول الحساسة لجدول (${activeTabSchema.labelAr}):` : `Field Masking for (${activeTabSchema.labelEn}):`}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {Object.values(activeTabSchema.fields || {}).filter((f) => f.isSensitive).length} {isAr ? 'حقول حساسة' : 'sensitive fields'}
                    </span>
                  </div>

                  {Object.entries(activeTabSchema.fields || {}).filter(([_, f]) => f.isSensitive).length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">
                      {isAr ? 'لا توجد حقول مصنفة كحساسة أو مالية في هذا التبويب.' : 'No sensitive/confidential fields configured in this tab.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {Object.entries(activeTabSchema.fields || {})
                        .filter(([_, f]) => f.isSensitive)
                        .map(([fieldKey, fieldMeta]) => {
                          const permKey = `${activeTabSchema.id}.${fieldKey}`;
                          const isFieldVisible = userEffectivePerms.fields?.[permKey] !== false;

                          return (
                            <div
                              key={fieldKey}
                              className={`p-2.5 rounded-xl border transition ${
                                isFieldVisible ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/60 border-amber-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {isAr ? fieldMeta.labelAr : fieldMeta.labelEn}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={isFieldVisible}
                                  onChange={() => handleTogglePermission('fields', permKey)}
                                  className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                                />
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {isAr ? fieldMeta.descAr : (fieldMeta.descEn || `Field key: ${fieldKey}`)}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB: DEDICATED TAB APPEARANCE & COLOR MANAGEMENT                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'tab_appearance' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <TabAppearanceManager
            currentUser={currentUser}
            initialTabFocus={initialTabFocus}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: DYNAMIC BULK IMPORTER                                          */}
      {/* ========================================================================= */}
      {activeSubTab === 'import' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>{isAr ? 'معالج استيراد البيانات الكتلية الشامل' : 'Universal Bulk Data Importer'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? 'اختر الجدول المطلوب، حمّل القالب النموذجي التلقائي، ثم ارفع الملف ليتم فحصه ومطابقته'
                    : 'Select any schema table, download dynamic template, and upload records with automated validation'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600">{isAr ? 'الجدول المستهدف:' : 'Target Table:'}</label>
                <select
                  value={selectedImportTabKey}
                  onChange={(e) => {
                    setSelectedImportTabKey(e.target.value);
                    setImportedRows([]);
                    setRowValidationResults([]);
                  }}
                  className="p-2 border border-slate-300 rounded-xl text-xs bg-slate-50 font-bold text-slate-800"
                >
                  {allTabsList.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {isAr ? tab.labelAr : tab.labelEn} ({tab.collection})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-slate-800 block">
                  {isAr ? 'الخطوة الأولى: تحميل القالب التلقائي' : 'Step 1: Download Dynamic Template'}
                </span>
                <p className="text-[11px] text-slate-500">
                  {isAr
                    ? `قالب CSV مبني تلقائياً يحتوي على كافة أعمدة (${activeImportTabSchema.labelAr}) وبيانات تجريبية صالحة.`
                    : `CSV template auto-generated from metadata schema with sample validation rows.`}
                </p>
                <button
                  type="button"
                  onClick={handleDownloadDynamicCsv}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{isAr ? `تحميل قالب (${activeImportTabSchema.labelAr})` : `Download Template`}</span>
                </button>
              </div>

              <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-emerald-950 block">
                  {isAr ? 'الخطوة الثانية: رفع ومعاينة ملف البيانات' : 'Step 2: Upload CSV File for Validation'}
                </span>
                <p className="text-[11px] text-emerald-800">
                  {isAr ? 'يقوم المحرك بمطابقة الأعمدة والتحقق من الحقول الإلزامية قبل الحفظ السحابي.' : 'Validates fields and schema compliance prior to batch commit.'}
                </p>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer">
                  <FileUp className="h-3.5 w-3.5" />
                  <span>{isAr ? 'اختيار ورفع ملف CSV' : 'Choose CSV File'}</span>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 📊 INTERACTIVE IN-GRID EDITING & STAGED REMEDIATION DASHBOARD             */}
          {/* ========================================================================= */}
          {importedRows.length > 0 && (() => {
            const validCount = rowValidationResults.filter((r) => r.status === 'valid').length;
            const warningCount = rowValidationResults.filter((r) => r.status === 'warning').length;
            const errorCount = rowValidationResults.filter((r) => r.status === 'error').length;

            const visibleRowsWithMeta = importedRows
              .map((row, idx) => ({ row, validation: rowValidationResults[idx] || { status: 'valid', cellFlags: {}, cellMessages: {}, errors: [], warnings: [] }, originalIndex: idx }))
              .filter(({ validation }) => {
                if (importFilterStatus === 'valid') return validation.status === 'valid';
                if (importFilterStatus === 'warning') return validation.status === 'warning';
                if (importFilterStatus === 'error') return validation.status === 'error';
                return true;
              });

            return (
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4">
                {/* 1. Header Toolbar with Auto-Fix & Download Corrected CSV */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  {/* Left: Validation Filter Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-indigo-600" />
                      <span>{isAr ? 'نتائج الفحص والتحقق:' : 'Validation Summary:'}</span>
                    </span>

                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => setImportFilterStatus('all')}
                        className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 ${
                          importFilterStatus === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <span>{isAr ? 'الكل' : 'All'}:</span>
                        <span>{importedRows.length}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportFilterStatus('valid')}
                        className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 ${
                          importFilterStatus === 'valid' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{isAr ? 'سليم' : 'Valid'}:</span>
                        <span>{validCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportFilterStatus('warning')}
                        className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 ${
                          importFilterStatus === 'warning' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تحذيرات' : 'Warnings'}:</span>
                        <span>{warningCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportFilterStatus('error')}
                        className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer flex items-center gap-1 ${
                          importFilterStatus === 'error' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-900 border border-rose-300 hover:bg-rose-100'
                        }`}
                      >
                        <AlertOctagon className="h-3.5 w-3.5" />
                        <span>{isAr ? 'أخطاء' : 'Errors'}:</span>
                        <span>{errorCount}</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: Quick Fix & Export Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Auto-Fix Defaults Button (1-Click) */}
                    {selectedImportTabKey === 'suppliers' && warningCount > 0 && (
                      <button
                        type="button"
                        onClick={handleAutoFixDefaults}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                        title={isAr ? 'تصحيح تلقائي لنسبة 100% وأساس الاستحقاق للدفعات المفردة' : 'Auto-fill 100% single tranches & delivery date'}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تصحيح تلقائي للنسب والخيارات' : 'Auto-Fix Defaults (100%)'}</span>
                      </button>
                    )}

                    {/* Download Corrected CSV to Device Button */}
                    <button
                      type="button"
                      onClick={handleDownloadCorrectedCsv}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                      title={isAr ? 'تنزيل ملف CSV المصحح على جهازك' : 'Download sanitized CSV to your device'}
                    >
                      <Download className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{isAr ? 'تصدير الشيت المصحح (CSV)' : 'Download Corrected CSV'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setImportedRows([]);
                        setRowValidationResults([]);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                    >
                      {isAr ? 'مسح' : 'Clear'}
                    </button>

                    {/* Selective Import Button: Valid Rows Only */}
                    {errorCount > 0 && validCount + warningCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleCommitDynamicImport(true)}
                        disabled={isImporting}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckSquare className="h-3.5 w-3.5" />
                        <span>
                          {isAr
                            ? `استيراد السليم فقط (${validCount + warningCount})`
                            : `Import Valid Only (${validCount + warningCount})`}
                        </span>
                      </button>
                    )}

                    {/* Commit to Cloud Button */}
                    <button
                      type="button"
                      onClick={() => handleCommitDynamicImport(false)}
                      disabled={isImporting}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50 ${
                        errorCount > 0
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isImporting ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                      <span>
                        {errorCount > 0
                          ? (isAr ? 'تأكيد وحفظ الكل (تجاوز الأخطاء)' : 'Force Commit All')
                          : (isAr ? 'تأكيد وحفظ السجلات في السحابة' : 'Confirm & Commit to Cloud')}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Instructions Bar */}
                <div className="text-[11px] text-slate-500 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span>
                      {isAr
                        ? 'يمكنك النقر والتعديل مباشرة داخل أي خلية في الجدول لتصحيح البيانات. ستتم إعادة التحقق فورياً مع كل تعديل.'
                        : 'Click and type directly into any table cell to fix data inline. Live validation updates instantly on keystroke.'}
                    </span>
                  </span>
                  <span className="font-bold text-indigo-900 hidden sm:inline">
                    {isAr ? 'انقر على أي خلية للتعديل المباشر ✍️' : 'Editable Grid ✍️'}
                  </span>
                </div>

                {/* 2. Interactive In-Grid Editable Table */}
                <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl shadow-inner bg-white">
                  <table className="w-full text-start text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                      <tr>
                        <th className="p-2.5 text-center border-e border-slate-200 w-12">{isAr ? 'الحالة' : 'Status'}</th>
                        <th className="p-2.5 text-center border-e border-slate-200 w-10">#</th>
                        {selectedImportTabKey === 'suppliers' && (
                          <th className="p-2.5 text-center border-e border-slate-200 whitespace-nowrap min-w-[130px]">
                            <div className="font-bold text-slate-900">{isAr ? 'المستندات والمرفقات' : 'Documents'}</div>
                            <div className="font-mono text-[10px] text-indigo-600 font-normal">Auto-Compressed</div>
                          </th>
                        )}
                        {Object.keys(importedRows[0]).filter((k) => !k.startsWith('_')).map((h) => {
                          const fieldMeta = activeImportTabSchema.fields?.[h];
                          return (
                            <th key={h} className="p-2.5 text-start border-e border-slate-200 whitespace-nowrap min-w-[130px]">
                              <div className="font-bold text-slate-900">{isAr ? (fieldMeta?.labelAr || h) : (fieldMeta?.labelEn || h)}</div>
                              <div className="font-mono text-[10px] text-slate-400 font-normal">{h}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleRowsWithMeta.length === 0 ? (
                        <tr>
                          <td colSpan={Object.keys(importedRows[0]).length + 2} className="p-8 text-center text-slate-400">
                            {isAr ? 'لا توجد صفوف تطابق الفلتر المحدد.' : 'No rows match the selected filter.'}
                          </td>
                        </tr>
                      ) : (
                        visibleRowsWithMeta.map(({ row, validation, originalIndex }) => {
                          const isErrorRow = validation.status === 'error';
                          const isWarningRow = validation.status === 'warning';

                          return (
                            <tr
                              key={originalIndex}
                              className={`hover:bg-slate-50/80 transition ${
                                isErrorRow ? 'bg-rose-50/30' : isWarningRow ? 'bg-amber-50/20' : ''
                              }`}
                            >
                              {/* Row Status Badge with Tooltip Guide */}
                              <td className="p-2 border-e border-slate-200 text-center align-middle">
                                {isErrorRow ? (
                                  <span
                                    title={validation.errors.join('\n\n')}
                                    className="inline-flex items-center justify-center p-1 rounded-lg bg-rose-100 text-rose-700 cursor-help"
                                  >
                                    <AlertOctagon className="h-4 w-4" />
                                  </span>
                                ) : isWarningRow ? (
                                  <span
                                    title={validation.warnings.join('\n\n')}
                                    className="inline-flex items-center justify-center p-1 rounded-lg bg-amber-100 text-amber-800 cursor-help"
                                  >
                                    <AlertTriangle className="h-4 w-4" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center p-1 rounded-lg bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 className="h-4 w-4" />
                                  </span>
                                )}
                              </td>

                              {/* Row Number */}
                              <td className="p-2 border-e border-slate-200 text-center font-mono text-[11px] text-slate-400 font-bold">
                                {originalIndex + 1}
                              </td>

                              {/* Supplier Row Attachments Button (Option 2) */}
                              {selectedImportTabKey === 'suppliers' && (() => {
                                const attachedCount = [
                                  row.taxCardFile,
                                  row.commercialRegisterFile,
                                  row.whtAdvanceCertFile,
                                  row.openingBalanceFile,
                                ].filter(Boolean).length;

                                return (
                                  <td className="p-2 border-e border-slate-200 text-center align-middle">
                                    <button
                                      type="button"
                                      onClick={() => setShowRowAttachModal({ rowIndex: originalIndex, row })}
                                      className={`px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold transition flex items-center justify-center gap-1.5 mx-auto cursor-pointer ${
                                        attachedCount > 0
                                          ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 shadow-2xs'
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                                      }`}
                                      title={isAr ? 'إدارة ورفع المستندات المضغوطة لهذا المورد' : 'Manage row attachments'}
                                    >
                                      <Paperclip className="h-3.5 w-3.5" />
                                      <span>{attachedCount}/4</span>
                                    </button>
                                  </td>
                                );
                              })()}

                              {/* Interactive Editable Table Cells */}
                              {Object.entries(row)
                                .filter(([k]) => !k.startsWith('_'))
                                .map(([colKey, cellVal], cIdx) => {
                                const cellFlag = validation.cellFlags?.[colKey];
                                const cellMsg = validation.cellMessages?.[colKey];

                                return (
                                  <td
                                    key={cIdx}
                                    title={cellMsg || ''}
                                    className={`p-1 border-e border-slate-100 transition ${
                                      cellFlag === 'error'
                                        ? 'bg-rose-100/70 ring-1 ring-inset ring-rose-400'
                                        : cellFlag === 'warning'
                                        ? 'bg-amber-100/60 ring-1 ring-inset ring-amber-400'
                                        : ''
                                    }`}
                                  >
                                    <input
                                      type="text"
                                      value={cellVal || ''}
                                      placeholder={cellFlag ? (isAr ? 'مطلوب...' : 'Required...') : '—'}
                                      onChange={(e) => handleCellEdit(originalIndex, colKey, e.target.value)}
                                      className={`w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-lg text-[11px] font-mono transition outline-none ${
                                        cellFlag === 'error'
                                          ? 'text-rose-950 font-bold placeholder-rose-400'
                                          : cellFlag === 'warning'
                                          ? 'text-amber-950 font-semibold placeholder-amber-400'
                                          : 'text-slate-800'
                                      }`}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB: FULL SCHEMA-DRIVEN BACKUP & CHUNKED RESTORE HUB                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'backup_restore' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {(isBackingUp || isRestoring) && (
            <PeacockLoader
              fullScreen
              size="xl"
              text={
                isBackingUp
                  ? (isAr ? 'جاري استخراج وتجميع النسخة الاحتياطية لكافة الجداول السحابية...' : 'Serializing all 16 collections to JSON...')
                  : (restoreProgressText || (isAr ? 'جاري تنفيذ الاستعادة السحابية...' : 'Executing Chunked Restore...'))
              }
            />
          )}

          {backupRestoreMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in shadow-2xs">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>{backupRestoreMsg}</span>
            </div>
          )}

          {/* Dual Column Action Hub */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Selective Multi-Collection Backup Export Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl shadow-2xs">
                    <HardDriveDownload className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {isAr ? '١- تصدير نسخة احتياطية محددة / شاملة' : '1. Export Selective Backup (.json)'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {isAr ? 'تحديد الجداول المطلوبة بدقة وتصدير مستنداتها مع المرفقات والتوقيتات' : 'Select target collections to serialize and download in JSON format'}
                    </p>
                  </div>
                </div>

                {/* Interactive Collection Selector */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{isAr ? 'اختر الجداول المراد تضمينها:' : 'Target Collections:'}</span>
                    </span>

                    <div className="flex items-center gap-2 font-bold text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSelectedBackupCollections([...BACKUP_COLLECTIONS_REGISTRY])}
                        className="text-indigo-600 hover:underline cursor-pointer"
                      >
                        {isAr ? 'تحديد الكل' : 'Select All'}
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedBackupCollections([])}
                        className="text-slate-500 hover:underline cursor-pointer"
                      >
                        {isAr ? 'إلغاء التحديد' : 'Deselect All'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-1 text-xs">
                    {BACKUP_COLLECTIONS_REGISTRY.map((collName) => {
                      const isChecked = selectedBackupCollections.includes(collName);
                      return (
                        <label
                          key={collName}
                          className={`p-1.5 rounded-xl border flex items-center gap-1.5 cursor-pointer transition select-none ${
                            isChecked
                              ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-bold'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = isChecked
                                ? selectedBackupCollections.filter((c) => c !== collName)
                                : [...selectedBackupCollections, collName];
                              setSelectedBackupCollections(next);
                            }}
                            className="accent-indigo-600 rounded h-3.5 w-3.5 shrink-0"
                          />
                          <span className="font-mono text-[10px] truncate" title={collName}>{collName}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex justify-between items-center text-[11px] pt-1 text-slate-500 border-t border-slate-200/60 font-mono">
                    <span>{isAr ? 'عدد الجداول المحددة:' : 'Selected Collections:'}</span>
                    <b className="text-indigo-700 font-extrabold">
                      {selectedBackupCollections.length} / {BACKUP_COLLECTIONS_REGISTRY.length}
                    </b>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportBackupJson}
                disabled={isBackingUp || selectedBackupCollections.length === 0}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <HardDriveDownload className="h-4 w-4" />
                <span>
                  {selectedBackupCollections.length === 0
                    ? (isAr ? 'يرجى تحديد جدول واحد على الأقل' : 'Select at least 1 collection')
                    : (isAr
                        ? `تنزيل النسخة الاحتياطية (${selectedBackupCollections.length} جدول)`
                        : `Download Backup JSON (${selectedBackupCollections.length} collections)`)}
                </span>
              </button>
            </div>

            {/* 2. Selective Multi-Collection Restore Card */}
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl shadow-2xs">
                    <HardDriveUpload className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {isAr ? '٢- استعادة محددة من ملف احتياطي (Selective Restore)' : '2. Selective Restore from File'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {isAr ? 'اختيار جداول ومستندات محددة للاستعادة مع خيار المسح أو الدمج' : 'Select collections from JSON to hydrate safely in 400-doc batches'}
                    </p>
                  </div>
                </div>

                {/* File Upload Zone */}
                <div className="p-3.5 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl text-center space-y-2">
                  <FileJson className="h-7 w-7 text-slate-400 mx-auto" />
                  <div>
                    <label className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer transition shadow-2xs">
                      <span>{isAr ? 'اختر ملف النسخة الاحتياطية (.json)' : 'Select Backup JSON File'}</span>
                      <input type="file" accept=".json,application/json" onChange={handleSelectRestoreFile} className="hidden" />
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    {restoreFilePayload ? (
                      <b className="text-emerald-700 font-mono">
                        {isAr ? 'تم تحميل الملف بنجاح:' : 'Loaded:'} {restoreFilePayload._backupHeader.backupDate?.split('T')[0]} ({restoreFilePayload._backupHeader.totalDocuments} {isAr ? 'مستند عبر' : 'docs in'} {Object.keys(restoreFilePayload.collections || {}).length} {isAr ? 'جدول' : 'colls'})
                      </b>
                    ) : (
                      (isAr ? 'يتم فحص بنية الملف واكتشاف الجداول تلقائياً' : 'Auto-inspects collections & doc counts before restore')
                    )}
                  </span>
                </div>

                {/* Restore Strategy Selection */}
                {restoreFilePayload && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 text-xs">
                    <span className="font-bold text-amber-950 block">
                      {isAr ? 'استراتيجية استعادة الجداول المحددة:' : 'Restore Strategy for Selected Tables:'}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`p-2 border rounded-xl cursor-pointer flex items-center gap-2 transition ${restoreStrategy === 'clean_slate' ? 'bg-amber-100 border-amber-400 font-bold text-amber-950 shadow-2xs' : 'bg-white border-slate-200 text-slate-700'}`}>
                        <input
                          type="radio"
                          name="strategy"
                          checked={restoreStrategy === 'clean_slate'}
                          onChange={() => setRestoreStrategy('clean_slate')}
                          className="accent-amber-600"
                        />
                        <span className="text-[11px]">{isAr ? 'مسح واستبدال الجداول المحددة فقط' : 'Wipe & Replace Selected Only'}</span>
                      </label>

                      <label className={`p-2 border rounded-xl cursor-pointer flex items-center gap-2 transition ${restoreStrategy === 'merge_upsert' ? 'bg-amber-100 border-amber-400 font-bold text-amber-950 shadow-2xs' : 'bg-white border-slate-200 text-slate-700'}`}>
                        <input
                          type="radio"
                          name="strategy"
                          checked={restoreStrategy === 'merge_upsert'}
                          onChange={() => setRestoreStrategy('merge_upsert')}
                          className="accent-amber-600"
                        />
                        <span className="text-[11px]">{isAr ? 'دمج وتحديث (Upsert)' : 'Merge & Upsert'}</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Restore Action Button */}
              <button
                type="button"
                disabled={!restoreFilePayload || isRestoring || selectedRestoreCollections.length === 0}
                onClick={handleExecuteChunkedRestore}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCheck className="h-4 w-4" />
                <span>
                  {isAr
                    ? `استعادة الجداول المحددة (${selectedRestoreCollections.length} جدول)`
                    : `Restore Selected (${selectedRestoreCollections.length} collections)`}
                </span>
              </button>
            </div>
          </div>

          {/* Granular Collection & Document Inspection & Checkbox Selector */}
          {restoreFilePayload && (
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-indigo-600" />
                  <span className="font-extrabold text-xs text-slate-900">
                    {isAr ? 'حدد الجداول والمستندات المراد استعادتها من هذا الملف:' : 'Select Collections to Restore from File:'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedRestoreCollections(Object.keys(restoreFilePayload.collections || {}))}
                    className="text-emerald-700 hover:underline cursor-pointer"
                  >
                    {isAr ? 'تحديد كافة الجداول' : 'Select All'}
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedRestoreCollections([])}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    {isAr ? 'إلغاء التحديد' : 'Deselect All'}
                  </button>
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 ms-2">
                    {selectedRestoreCollections.length} / {Object.keys(restoreFilePayload.collections || {}).length} {isAr ? 'جداول محددة' : 'Selected'}
                  </span>
                </div>
              </div>

              {/* Collections Cards with Live Checkboxes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {Object.entries(restoreFilePayload._backupHeader.collectionCounts || {}).map(([collName, count]) => {
                  const isSelected = selectedRestoreCollections.includes(collName);
                  return (
                    <label
                      key={collName}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer select-none space-y-1 ${
                        isSelected
                          ? 'bg-emerald-50/80 border-emerald-400 shadow-2xs ring-1 ring-emerald-400'
                          : 'bg-slate-50/70 border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedRestoreCollections((prev) =>
                              prev.includes(collName) ? prev.filter((c) => c !== collName) : [...prev, collName]
                            );
                          }}
                          className="accent-emerald-600 rounded h-4 w-4"
                        />
                        <span className="font-mono text-xs font-extrabold text-slate-900">{count} {isAr ? 'مستند' : 'docs'}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-700 block truncate" title={collName}>
                        {collName}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: TARGETED FACTORY RESET (Scalable Selector & Cascade)           */}
      {/* ========================================================================= */}
      {activeSubTab === 'factory_reset' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 1-Click Diagnostic & Historical Lot Number Patcher */}
          <div className="p-5 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-950">
                <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">
                    {isAr ? 'أداة تدقيق ومطابقة أرقام التشغيلات واللوطات (Lot Integrity Audit)' : 'Lot Integrity & Historical Patcher'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {isAr
                      ? 'فحص كافة أذون الاستلام التاريخية وتوليد أرقام اللوطات التلقائية لضمان عمل محرك FIFO بنسبة 100% بدون أي مساس بالكميات أو الأسعار.'
                      : 'Audit all historical receipts and backfill structured lot numbers to guarantee 100% FIFO compatibility.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAuditAndPatchHistoricalLots}
                disabled={isPatchingLots}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPatchingLots ? <Sparkles className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                <span>{isAr ? 'بدء فحص وتدقيق اللوطات' : 'Run Lot Audit Now'}</span>
              </button>
            </div>

            {patchSummaryMsg && (
              <div className="p-3 bg-white border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{patchSummaryMsg}</span>
              </div>
            )}
          </div>

          <div className="p-5 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-rose-950">
              <AlertOctagon className="h-5 w-5 text-rose-600 shrink-0" />
              <h3 className="text-sm font-bold">
                {isAr ? 'منطقة العمليات الحساسة: تصفير الجداول واستعادة ضبط المصنع' : 'Danger Zone: Metadata-Driven Database Purge'}
              </h3>
            </div>
            <p className="text-xs text-rose-900 leading-relaxed">
              {isAr
                ? 'حدد النطاق المراد تصفيره من القائمة أدناه لمعاينة التأثير والمسح السحابي الآمن.'
                : 'Select the purge target from the dropdown to review cascade effects and execute cloud reset.'}
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4 max-w-2xl">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                {isAr ? 'اختر الجدول أو النطاق المراد مسحه وتصفيره:' : 'Select Purge Target Scope:'}
              </label>
              <select
                value={selectedPurgeTargetKey}
                onChange={(e) => setSelectedPurgeTargetKey(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
              >
                <option value="all">⚠️ {isAr ? 'استعادة ضبط المصنع الشامل لكامل النظام (Full Master Reset)' : 'Master Full Factory Reset (All Tables)'}</option>
                {allTabsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {isAr ? `جدول: ${t.labelAr}` : `Table: ${t.labelEn}`} ({t.collection})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Scope Explanation Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-amber-600" />
                <span>{isAr ? 'بيان الأثر والتأثير التلقائي:' : 'Cascade Effect & Scope:'}</span>
              </div>
              <p className="text-slate-600">
                {selectedPurgeTargetKey === 'all'
                  ? (isAr ? 'سيتم مسح وتفريغ كافة الجداول التشغيلية وسجل الحركات وتصفير أرصدة الخامات إلى الصفر (0).' : 'Purges all transactional collections, movement ledgers, and resets stock to 0.')
                  : selectedPurgeTargetKey === 'goods_receipts'
                  ? (isAr ? 'سيتم مسح أذون الاستلام وسجل حركة المخزن، وإعادة تعيين رصيد الخامات في Item Master إلى الصفر (0).' : 'Purges GRNs, stock ledger, and zeroes out physical stock in Item Master.')
                  : (isAr ? `سيتم تفريغ كافة سجلات (${selectedPurgeTargetKey}) السحابية فقط دون المساس بباقي الجداول.` : `Wipes records in (${selectedPurgeTargetKey}) only.`)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              <span>{isAr ? 'بدء إجراءات التصفير والمسح' : 'Proceed to Purge Confirmation'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📎 ROW DOCUMENT MANAGER & COMPRESSION AUDIT MODAL (OPTION 2)              */}
      {/* ========================================================================= */}
      {showRowAttachModal && (() => {
        const { rowIndex, row } = showRowAttachModal;
        const stats = row._compressionStats || {};

        const docSlots = [
          { key: 'taxCardFile', labelAr: 'البطاقة الضريبية', labelEn: 'Tax Card', sample: 'tax_card.jpg' },
          { key: 'commercialRegisterFile', labelAr: 'السجل التجاري', labelEn: 'Commercial Register', sample: 'cr.pdf' },
          { key: 'whtAdvanceCertFile', labelAr: 'شهادة الدفعات المقدمة / الخصم', labelEn: 'WHT Certificate', sample: 'wht_cert.png' },
          { key: 'openingBalanceFile', labelAr: 'كشف حساب المصادقة الافتتاحية', labelEn: 'Opening Statement', sample: 'balance_statement.pdf' },
        ];

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col justify-between overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                    <Paperclip className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {isAr ? 'إدارة المستندات الرسمية وضغط الملفات تلقائياً' : 'Row Statutory Documents & Auto-Compressor'}
                    </h3>
                    <span className="text-[11px] font-mono text-indigo-700 font-bold block">
                      {row.name || 'Supplier'} • ID: {row.id || `#${rowIndex + 1}`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRowAttachModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Document Slots List */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pe-1">
                {docSlots.map((slot) => {
                  const hasFile = Boolean(row[slot.key]);
                  const slotStat = stats[slot.key];
                  const isSlotCompressing = rowCompressingSlot === slot.key;

                  return (
                    <div
                      key={slot.key}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 hover:border-indigo-200 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-slate-500" />
                          <span>{isAr ? slot.labelAr : slot.labelEn}</span>
                        </span>

                        {hasFile ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof openBase64Document === 'function') {
                                  openBase64Document(row[slot.key]);
                                } else {
                                  window.open(row[slot.key], '_blank');
                                }
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Eye className="h-3 w-3 text-indigo-600" />
                              <span>{isAr ? 'معاينة' : 'Preview'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveRowDoc(rowIndex, slot.key)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title={isAr ? 'إزالة الملف' : 'Remove'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {/* Option 1: Smart Convert & Compress */}
                            <label className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs">
                              <Zap className="h-3 w-3" />
                              <span>{isSlotCompressing ? (isAr ? 'جاري المعالجة...' : 'Processing...') : (isAr ? 'ضغط وتحويل ذكي' : 'Smart Compress')}</span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                disabled={isSlotCompressing}
                                onChange={(e) => handleUploadRowDoc(rowIndex, slot.key, e.target.files?.[0], 'compress')}
                                className="hidden"
                              />
                            </label>

                            {/* Option 2: Upload Original As-Is */}
                            <label className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer shadow-2xs">
                              <FileUp className="h-3 w-3 text-slate-500" />
                              <span>{isAr ? 'الأصلي كما هو' : 'Original As-Is'}</span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                disabled={isSlotCompressing}
                                onChange={(e) => handleUploadRowDoc(rowIndex, slot.key, e.target.files?.[0], 'raw')}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      {/* 📊 DYNAMIC METRIC SUMMARY CARD (COMPRESSED OR ORIGINAL) */}
                      {hasFile && slotStat && (
                        slotStat.isCompressed ? (
                          <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-xl space-y-1 text-xs">
                            <div className="flex items-center justify-between text-emerald-950 font-bold">
                              <span className="flex items-center gap-1.5">
                                <Zap className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                <span>
                                  {slotStat.mode === 'compressed_pdf'
                                    ? (isAr ? `تحويل ودمج (${slotStat.renderedPages} من ${slotStat.totalPages} صفحة) + ضغط ذكي:` : `Converted & Stitched (${slotStat.renderedPages}/${slotStat.totalPages} pgs) + Compressed:`)
                                    : (isAr ? 'ضغط ذكي للصورة:' : 'Smart Image Compression:')}
                                </span>
                              </span>
                              <span className="font-mono bg-emerald-600 text-white px-2 py-0.2 rounded-full text-[10px]">
                                -{slotStat.savingsPercent}% {isAr ? 'وفر' : 'Saved'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono pt-1 text-emerald-900 border-t border-emerald-200/60">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 line-through">{formatFileSize(slotStat.originalSize)}</span>
                                <span className="text-emerald-700 font-extrabold">{isAr ? '←' : '➔'}</span>
                                <span className="font-bold text-emerald-800 bg-white px-1.5 py-0.2 rounded border border-emerald-300">
                                  {formatFileSize(slotStat.compressedSize)}
                                </span>
                                {slotStat.dimensions && (
                                  <span className="text-[10px] text-slate-500 font-sans">({slotStat.dimensions})</span>
                                )}
                              </div>

                              <span className="text-[10px] text-emerald-700">
                                {isAr ? 'الوقت:' : 'Time:'} <b>{slotStat.elapsedMs}ms</b>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1 text-xs">
                            <div className="flex items-center justify-between text-indigo-950 font-bold">
                              <span className="flex items-center gap-1.5">
                                <FileCheck className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                <span>{isAr ? 'تم الرفع بالصيغة الأصلية (بدون ضغط):' : 'Uploaded as Original (Uncompressed):'}</span>
                              </span>
                              <span className="font-mono bg-indigo-600 text-white px-2 py-0.2 rounded-full text-[10px]">
                                {formatFileSize(slotStat.originalSize)}
                              </span>
                            </div>
                            <div className="text-[10px] text-indigo-800 pt-0.5 flex justify-between items-center">
                              <span>{isAr ? `النوع: ${slotStat.fileType}` : `Type: ${slotStat.fileType}`}</span>
                              <span>{slotStat.elapsedMs}ms</span>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRowAttachModal(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {isAr ? 'حفظ وإغلاق النافذة' : 'Done & Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

{/* ========================================================================= */}
      {/* SUB-TAB: UNIVERSAL DYNAMIC DATABASE INSPECTOR & LIVE DOCUMENT EDITOR      */}
      {/* ========================================================================= */}
      {activeSubTab === 'db_inspector' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {isScanningCollections && (
            <PeacockLoader
              fullScreen
              size="xl"
              text={isAr ? 'جاري فحص الجداول واكتشاف قواعد البيانات النشطة...' : 'Scanning Database Collections...'}
            />
          )}

          {dbInspectorMsg && (
            <div className="p-3 bg-cyan-50 border border-cyan-200 text-cyan-950 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-cyan-600 shrink-0" />
              <span>{dbInspectorMsg}</span>
            </div>
          )}

          {/* Top Control Bar: Scanner, Collection Selector & Custom Input */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-xl">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {isAr ? 'مستعرض ومحرر قواعد البيانات السحابية (Schema-Free DB Inspector)' : 'Universal Firestore Database Inspector & Editor'}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isAr ? 'فحص واكتشاف الجداول، معاينة المستندات الحية، وتعديل وتصحيح الحقول مباشرة' : 'Auto-discover collections, inspect real-time documents, and edit schema fields'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleScanDatabaseCollections}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{isAr ? 'إعادة فحص الجداول' : 'Rescan Collections'}</span>
                </button>

                {selectedCollection && (
                  <button
                    type="button"
                    onClick={handleOpenCreateDocument}
                    className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{isAr ? 'إنشاء مستند جديد' : 'New Document'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Collection Discovery Chips & Ad-Hoc Input */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100 items-center">
              <div className="md:col-span-8 flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto p-1">
                {discoveredCollections.map((col) => {
                  const isSelected = selectedCollection === col.name;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      onClick={() => handleSelectCollection(col.name)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span>{col.name}</span>
                      <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-cyan-500 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'}`}>
                        {col.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Ad-Hoc Custom Collection Query */}
              <div className="md:col-span-4 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={isAr ? 'اكتب اسم أي جدول آخر...' : 'Custom collection name...'}
                  value={customCollectionInput}
                  onChange={(e) => setCustomCollectionInput(e.target.value.trim())}
                  className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!customCollectionInput}
                  onClick={() => {
                    handleSelectCollection(customCollectionInput);
                    setCustomCollectionInput('');
                  }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  {isAr ? 'فتح' : 'Open'}
                </button>
              </div>
            </div>
          </div>

          {/* Document Inspector & Entity Relationship Diagram Hub */}
          {selectedCollection && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden space-y-3.5 p-4">
              {/* Top View Mode Switcher Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                    <FolderOpen className="h-4 w-4 text-cyan-600" />
                    <span>{isAr ? 'الجدول النشط:' : 'Active Collection:'}</span>
                    <span className="font-mono text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-200 font-extrabold">
                      {selectedCollection}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-slate-400 font-bold">
                    ({collectionDocs.length} {isAr ? 'مستند' : 'documents'})
                  </span>
                </div>

                {/* View Switcher: Diagram / Relations Graph vs. Document Table */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setInspectorViewMode('diagram')}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                        inspectorViewMode === 'diagram'
                          ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Workflow className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{isAr ? 'مخطط العلاقات والربط (ERD Graph)' : 'Relationship Diagram'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectorViewMode('table')}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                        inspectorViewMode === 'table'
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Table className="h-3.5 w-3.5 text-cyan-600" />
                      <span>{isAr ? 'جدول المستندات الحية' : 'Live Documents Table'}</span>
                    </button>
                  </div>

                  {inspectorViewMode === 'table' && (
                    <div className="relative max-w-xs w-full">
                      <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder={isAr ? 'بحث في البيانات...' : 'Search docs...'}
                        value={docSearchQuery}
                        onChange={(e) => setDocSearchQuery(e.target.value)}
                        className="w-full ps-8 pe-3 py-1 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 📊 INTERACTIVE 3-TIER DYNAMIC ENTITY-RELATIONSHIP FLOW GRAPH              */}
              {/* ========================================================================= */}
              {inspectorViewMode === 'diagram' && (() => {
                // Dynamically resolve real-time relationships from live document schemas
                const relationMeta = resolveDynamicEntityRelations(
                  selectedCollection,
                  collectionDocs,
                  discoveredCollections
                );

                const upstreams = relationMeta.upstream || [];
                const downstreams = relationMeta.downstream || [];

                return (
                  <div className="p-5 bg-gradient-to-b from-slate-950 via-[#10141d] to-slate-950 text-white rounded-2xl border border-slate-800 space-y-6 shadow-inner animate-in fade-in">
                    {/* Visual Diagram Legend & Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-cyan-400" />
                        <span className="font-extrabold text-sm text-white">
                          {isAr ? `مخطط الربط والاعتماديات لجدول: (${selectedCollection})` : `ERD Dependency Flow: ${selectedCollection}`}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                          {relationMeta.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                          <span>{isAr ? 'جداول مدخلات / مرجعية (Upstream)' : 'Parent Dependencies'}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                          <span>{isAr ? 'الجدول المحدد (Center Node)' : 'Current Entity'}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          <span>{isAr ? 'جداول مخرجات / تابعة (Downstream)' : 'Dependent Children'}</span>
                        </span>
                      </div>
                    </div>

                    {/* 3-Column Node Flow Canvas (Upstream ➔ Center Node ➔ Downstream) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Column 1: Upstream / Parent Dependencies */}
                      <div className="md:col-span-4 space-y-2.5">
                        <div className="text-[11px] font-extrabold text-indigo-400 uppercase tracking-wider flex items-center justify-between px-1">
                          <span>{isAr ? 'الجداول المرجعية (الأصل):' : 'Upstream Parents:'}</span>
                          <span className="font-mono text-[10px] bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-500/30">
                            {upstreams.length} {isAr ? 'ارتباطات' : 'links'}
                          </span>
                        </div>

                        {upstreams.length === 0 ? (
                          <div className="p-4 rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-center text-slate-500 text-xs italic">
                            {isAr ? 'جدول رئيسي مستقل (لا يعتمد على جداول أصل)' : 'Root entity (No upstream parent references)'}
                          </div>
                        ) : (
                          upstreams.map((rel, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectCollection(rel.collection)}
                              className="p-3 bg-[#151a27] hover:bg-[#1e2538] border border-indigo-500/30 hover:border-indigo-400 rounded-2xl transition cursor-pointer group shadow-2xs space-y-1.5"
                              title={isAr ? `انقر للانتقال واستعراض جدول (${rel.collection})` : `Click to inspect ${rel.collection}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-xs text-indigo-300 group-hover:text-white transition flex items-center gap-1">
                                  <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
                                  <span>{rel.collection}</span>
                                </span>
                                <span className="text-[9px] font-mono font-extrabold text-indigo-300 bg-indigo-950/90 px-1.5 py-0.2 rounded border border-indigo-500/40">
                                  {rel.type}
                                </span>
                              </div>

                              <span className="text-[11px] text-slate-300 font-semibold block">{isAr ? rel.labelAr : rel.labelEn}</span>
                              <div className="text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-0.5 rounded border border-slate-800 flex items-center justify-between">
                                <span>FK: {rel.key}</span>
                                <ExternalLink className="h-3 w-3 text-indigo-400 opacity-60 group-hover:opacity-100" />
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Column 2: Center Node (Selected Collection) */}
                      <div className="md:col-span-4 p-5 bg-[#172033] border-2 border-cyan-400 rounded-3xl text-center space-y-3.5 shadow-xl shadow-cyan-950/40 ring-4 ring-cyan-500/10 relative">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center mx-auto text-cyan-300">
                          <Database className="h-6 w-6" />
                        </div>

                        <div>
                          <span className="font-mono text-lg font-black text-white tracking-tight block">
                            {selectedCollection}
                          </span>
                          <span className="text-xs font-bold text-cyan-300 block mt-0.5">
                            {isAr ? relationMeta.labelAr : relationMeta.labelEn}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block mt-1">
                            Collection Key: `{selectedCollection}`
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/80 text-xs">
                          <div className="p-2 bg-black/40 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">{isAr ? 'عدد المستندات:' : 'Documents:'}</span>
                            <span className="font-mono font-black text-cyan-400 text-sm">{collectionDocs.length}</span>
                          </div>

                          <div className="p-2 bg-black/40 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">{isAr ? 'إجمالي الارتباطات:' : 'Total Relations:'}</span>
                            <span className="font-mono font-black text-emerald-400 text-sm">{upstreams.length + downstreams.length}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setInspectorViewMode('table')}
                          className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-extrabold transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Table className="h-3.5 w-3.5" />
                          <span>{isAr ? 'فتح جدول المستندات وتعديل الحقول' : 'Open Live Table & Edit'}</span>
                        </button>
                      </div>

                      {/* Column 3: Downstream / Child Dependencies */}
                      <div className="md:col-span-4 space-y-2.5">
                        <div className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center justify-between px-1">
                          <span>{isAr ? 'الجداول التابعة والمستهلكة (المصب):' : 'Downstream Children:'}</span>
                          <span className="font-mono text-[10px] bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                            {downstreams.length} {isAr ? 'تأثيرات' : 'links'}
                          </span>
                        </div>

                        {downstreams.length === 0 ? (
                          <div className="p-4 rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 text-center text-slate-500 text-xs italic">
                            {isAr ? 'جدول نهائي للمخرجات (لا توجد جداول أخرى تعتمد عليه)' : 'Terminal leaf table (No downstream child consumers)'}
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto pe-1">
                            {downstreams.map((rel, idx) => (
                              <div
                                key={idx}
                                onClick={() => handleSelectCollection(rel.collection)}
                                className="p-3 bg-[#131e24] hover:bg-[#1a2932] border border-emerald-500/30 hover:border-emerald-400 rounded-2xl transition cursor-pointer group shadow-2xs space-y-1.5"
                                title={isAr ? `انقر للانتقال واستعراض جدول (${rel.collection})` : `Click to inspect ${rel.collection}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-xs text-emerald-300 group-hover:text-white transition flex items-center gap-1">
                                    <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>{rel.collection}</span>
                                  </span>
                                  <span className="text-[9px] font-mono font-extrabold text-emerald-300 bg-emerald-950/90 px-1.5 py-0.2 rounded border border-emerald-500/40">
                                    {rel.type}
                                  </span>
                                </div>

                                <span className="text-[11px] text-slate-300 font-semibold block">{isAr ? rel.labelAr : rel.labelEn}</span>
                                <div className="text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-0.5 rounded border border-slate-800 flex items-center justify-between">
                                  <span>Ref: {rel.key}</span>
                                  <ExternalLink className="h-3 w-3 text-emerald-400 opacity-60 group-hover:opacity-100" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Data Grid Table View */}
              {inspectorViewMode === 'table' && (
              <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-xl">
                {isLoadingDocs ? (
                  <div className="p-12 text-center">
                    <PeacockLoader size="md" text={isAr ? 'جاري قراءة المستندات...' : 'Loading documents...'} />
                  </div>
                ) : collectionDocs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    {isAr ? 'هذا الجدول فارغ حالياً ولا يحتوي على أي مستندات.' : 'This collection has no documents.'}
                  </div>
                ) : (() => {
                  const filtered = collectionDocs.filter((d) => {
                    if (!docSearchQuery) return true;
                    return JSON.stringify(d).toLowerCase().includes(docSearchQuery.toLowerCase());
                  });

                  // Auto-detect all unique keys across documents
                  const detectedKeys = Array.from(
                    new Set(filtered.flatMap((d) => Object.keys(d).filter((k) => k !== '_id')))
                  ).slice(0, 10);

                  return (
                    <table className="w-full text-start border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 text-start border-e border-slate-200 w-44 font-mono">{isAr ? 'معرف المستند (ID)' : 'Document ID'}</th>
                          {detectedKeys.map((k) => (
                            <th key={k} className="p-2.5 text-start border-e border-slate-200 font-mono whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                          <th className="p-2.5 text-center w-24">{isAr ? 'إجراء' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {filtered.map((docItem) => (
                          <tr key={docItem._id} className="hover:bg-slate-50 transition">
                            <td className="p-2.5 border-e border-slate-200 font-bold text-indigo-700 truncate max-w-[180px]" title={docItem._id}>
                              {docItem._id}
                            </td>

                            {detectedKeys.map((k) => {
                              const val = docItem[k];
                              const renderVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '—');

                              return (
                                <td key={k} className="p-2.5 border-e border-slate-100 text-slate-700 truncate max-w-[200px]" title={renderVal}>
                                  {renderVal}
                                </td>
                              );
                            })}

                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1 font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDocument(docItem)}
                                  className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                  title={isAr ? 'تعديل المستند' : 'Edit Document'}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDocument(docItem._id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title={isAr ? 'حذف المستند' : 'Delete'}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📝 LIVE DOCUMENT EDITOR & SCHEMA BUILDER MODAL                             */}
      {/* ========================================================================= */}
      {selectedDocForEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[99999] overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-50 text-cyan-700 rounded-xl">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {selectedDocForEdit.isNew ? (isAr ? 'إنشاء مستند جديد' : 'Create Document') : (isAr ? 'تعديل بيانات المستند' : 'Edit Document')}
                  </h3>
                  <span className="font-mono text-xs text-indigo-700 font-bold">
                    {selectedCollection} / {selectedDocForEdit.id}
                  </span>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    // Sync JSON to fields list
                    try {
                      const parsed = JSON.parse(docJsonString);
                      const fList = Object.entries(parsed).map(([k, v]) => ({
                        key: k,
                        value: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v),
                        type: typeof v === 'object' ? 'object' : typeof v,
                      }));
                      setDocFieldsList(fList);
                    } catch {}
                    setDocEditMode('fields');
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    docEditMode === 'fields' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  {isAr ? 'حقول' : 'Fields'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Sync fields list to JSON
                    const obj = {};
                    docFieldsList.forEach((f) => {
                      if (!f.key.trim()) return;
                      let v = f.value;
                      if (f.type === 'number') v = Number(f.value) || 0;
                      else if (f.type === 'boolean') v = String(f.value).toLowerCase() === 'true';
                      else if (f.type === 'array' || f.type === 'object') {
                        try { v = JSON.parse(f.value); } catch { v = f.value; }
                      }
                      obj[f.key.trim()] = v;
                    });
                    setDocJsonString(JSON.stringify(obj, null, 2));
                    setDocEditMode('json');
                  }}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    docEditMode === 'json' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <Code className="h-3 w-3 inline me-1" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveDocument} className="space-y-4 text-xs">
              {/* Document ID */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 font-mono">
                  {isAr ? 'معرف المستند (Document ID) *' : 'Document ID *'}
                </label>
                <input
                  type="text"
                  required
                  disabled={!selectedDocForEdit.isNew}
                  value={selectedDocForEdit.id}
                  onChange={(e) => setSelectedDocForEdit({ ...selectedDocForEdit, id: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl font-mono font-bold bg-slate-50 disabled:text-slate-500"
                />
              </div>

              {/* Mode 1: Form Fields Builder */}
              {docEditMode === 'fields' ? (
                <div className="space-y-2.5 max-h-96 overflow-y-auto p-1">
                  {docFieldsList.map((field, fIdx) => (
                    <div key={fIdx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="fieldKey"
                          value={field.key}
                          onChange={(e) => {
                            const updated = [...docFieldsList];
                            updated[fIdx].key = e.target.value;
                            setDocFieldsList(updated);
                          }}
                          className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs bg-white font-bold"
                        />
                      </div>

                      <div className="col-span-3">
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const updated = [...docFieldsList];
                            updated[fIdx].type = e.target.value;
                            setDocFieldsList(updated);
                          }}
                          className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="array">array (JSON)</option>
                          <option value="object">object (JSON)</option>
                          <option value="timestamp">timestamp</option>
                        </select>
                      </div>

                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="value"
                          value={field.value}
                          onChange={(e) => {
                            const updated = [...docFieldsList];
                            updated[fIdx].value = e.target.value;
                            setDocFieldsList(updated);
                          }}
                          className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => setDocFieldsList(docFieldsList.filter((_, i) => i !== fIdx))}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setDocFieldsList([...docFieldsList, { key: '', value: '', type: 'string' }])}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إضافة حقل جديد' : 'Add Field'}</span>
                  </button>
                </div>
              ) : (
                /* Mode 2: Raw JSON Editor */
                <div>
                  <textarea
                    rows={12}
                    value={docJsonString}
                    onChange={(e) => setDocJsonString(e.target.value)}
                    className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl border border-slate-700 focus:outline-none"
                  />
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDocForEdit(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSavingDoc}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5"
                >
                  {isSavingDoc ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>{isAr ? 'حفظ وتحديث المستند' : 'Save Document'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Security Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-500 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-900">
                <AlertOctagon className="h-6 w-6 text-rose-600 shrink-0" />
                <h3 className="text-base font-bold">
                  {isAr ? 'تأكيد أمني لمسح البيانات' : 'Security Confirmation Required'}
                </h3>
              </div>
              <button onClick={() => setResetModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {isAr
                ? `أنت على وشك مسح (${selectedPurgeTargetKey === 'all' ? 'كافة جداول النظام بالكامل' : selectedPurgeTargetKey}) نهائياً من قاعدة البيانات السحابية. لا يمكن التراجع عن هذا الإجراء.`
                : `Permanently purging (${selectedPurgeTargetKey}) from Firestore cloud.`}
            </p>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5">
              <label className="block text-xs font-bold text-rose-950">
                {isAr ? 'اكتب عبارة التأكيد التالية للمتابعة:' : 'Type confirmation phrase:'}
              </label>
              <div className="font-mono text-xs font-extrabold text-rose-700 bg-white p-1.5 rounded border border-rose-300 text-center select-all">
                CONFIRM-RESET-ERP
              </div>
              <input
                type="text"
                placeholder="CONFIRM-RESET-ERP"
                value={confirmationPhrase}
                onChange={(e) => setConfirmationPhrase(e.target.value)}
                className="w-full p-2 border border-rose-300 rounded-lg text-xs bg-white text-center font-mono font-bold focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setResetModalOpen(false);
                  setConfirmationPhrase('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={confirmationPhrase !== 'CONFIRM-RESET-ERP' || isPurging}
                onClick={handleExecuteDynamicPurge}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center gap-1.5"
              >
                {isPurging ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>{isAr ? 'تأكيد المسح النهائي' : 'Confirm Permanent Purge'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}