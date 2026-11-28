import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db, functions, openBase64Document } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import {
  normalizeUserEmails,
  findEmailConflictUser,
  isGoogleEmailAddress,
  detectNonGoogleEmails,
  getDefaultPasswordProvisionEmail,
} from '../schemas/personnelSchema';
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
import { APP_ARCHITECTURE, getMasterCollectionsRegistry, isMasterCollection } from '../config/appArchitecture';
import TabAppearanceManager from './TabAppearanceManager';
import OpeningStockSeederModal from './OpeningStockSeederModal';
import NotificationControlCenter from './NotificationControlCenter';
import SystemRestoreHub from './SystemRestoreHub';
import AuditLogsHub from './AuditLogsHub';
import DatabaseInspectorHub from './admin/DatabaseInspectorHub';
import BackupRestoreHub from './admin/BackupRestoreHub';
import FactoryResetHub from './admin/FactoryResetHub';
import PeacockLoader from './PeacockLoader';
import {
  STATIC_GRAPH_METADATA,
  resolveDynamicEntityRelations,
  MASTER_COLLECTIONS_REGISTRY,
  OPERATIONAL_COLLECTIONS_REGISTRY,
  BACKUP_COLLECTIONS_REGISTRY,
  COLLECTION_DISPLAY_NAMES,
  getCollectionDisplayName,
  PURGE_TARGETS_CATALOG,
} from '../utils/adminCatalogs';

export {
  STATIC_GRAPH_METADATA,
  resolveDynamicEntityRelations,
  MASTER_COLLECTIONS_REGISTRY,
  OPERATIONAL_COLLECTIONS_REGISTRY,
  BACKUP_COLLECTIONS_REGISTRY,
  COLLECTION_DISPLAY_NAMES,
  getCollectionDisplayName,
  PURGE_TARGETS_CATALOG,
};
import { createRestorePoint } from '../utils/systemRestoreEngine';
import { OPERATIONAL_COLLECTIONS_COMPLETE } from '../utils/systemRestoreScopeCatalog';
import {
  History,
  Plus,
  Shield,
  ShieldCheck,
  BellRing,
  Smartphone,
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
  Workflow,
  KeyRound,
  EyeOff,
  Mail,
  Send
} from 'lucide-react';
import { getMasterPin, saveMasterPinToFirestore } from '../utils/dualLedgerEngine.js';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';


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



export default function AdminControlPanel({ currentUser = {}, initialSubTab = null, initialTabFocus = null, onClose = null }) {
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

  const [activeSubTab, setActiveSubTab] = useState(() => {
    if (initialSubTab) return initialSubTab;
    if (typeof window !== 'undefined') {
      const raw = window.location.hash || '';
      if (raw.includes('?')) {
        const p = new URLSearchParams(raw.split('?')[1]);
        const s = p.get('subTab');
        if (s && ['users', 'warehouses', 'permissions', 'tab_appearance', 'import', 'backup_restore', 'system_restore', 'audit_logs', 'factory_reset', 'db_inspector'].includes(s)) {
          return s;
        }
      }
    }
    return 'users';
  });

  // Sync active subtab when opened externally with specific intent (e.g., tab customizer)
  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Sync activeSubTab into URL hash subTab so refresh returns to same view
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash || '';
    if (raw.startsWith('#admin_panel')) {
      const [base, query] = raw.split('?');
      const params = new URLSearchParams(query || '');
      if (params.get('subTab') !== activeSubTab) {
        params.set('subTab', activeSubTab);
        const newHash = `${base || '#admin_panel'}?${params.toString()}`;
        window.history.replaceState(null, '', newHash);
      }
    }
  }, [activeSubTab]);

  // --- SUB-TAB: CONSOLIDATED VIEW SECURITY PASSCODE STATE ---
  const [ledgerPasscode, setLedgerPasscode] = useState(() => getMasterPin());
  const [showLedgerPasscode, setShowLedgerPasscode] = useState(false);
  const [isSavingPasscode, setIsSavingPasscode] = useState(false);
  const [passcodeSaveSuccess, setPasscodeSaveSuccess] = useState(false);

  useEffect(() => {
    setLedgerPasscode(getMasterPin());
  }, []);

  const handleSaveLedgerPasscode = async (e) => {
    e.preventDefault();
    if (!ledgerPasscode || ledgerPasscode.trim().length < 4) {
      alert(isAr ? 'رمز الأمان يجب أن يتكون من ٤ أرقام على الأقل' : 'Passcode must be at least 4 digits');
      return;
    }
    setIsSavingPasscode(true);
    try {
      await saveMasterPinToFirestore(ledgerPasscode.trim(), currentUser?.name || currentUser?.nameAr || 'Admin');
      setPasscodeSaveSuccess(true);
      setTimeout(() => setPasscodeSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving ledger passcode:', err);
      alert(err.message || 'Error saving passcode');
    } finally {
      setIsSavingPasscode(false);
    }
  };

  // --- SUB-TAB: UNIVERSAL DATABASE INSPECTOR & DOCUMENT EDITOR STATE ---

  // --- SUB-TAB: FULL & SELECTIVE BACKUP & RESTORE ENGINE STATE ---

  // --- LIVE USERS STATE ---
  const [usersList, setUsersList] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    id: '',
    email: '',
    secondaryEmail: '',
    name: '',
    nameAr: '',
    department: 'المشتريات',
    role: 'standard', // 'general_admin' | 'standard'
    allowedModules: ['purchases'],
    status: 'active',
    initialPassword: '',
    passwordTargetEmail: '',
  });
  const [showUserInitPassword, setShowUserInitPassword] = useState(false);

  // --- CORPORATE BRANDED SMTP EMAIL CONFIG (Server-Side Secrets) ---
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    fromName: 'Al-Tawoos ERP',
    fromEmail: '',
    hasPassword: false,
    configured: false,
  });
  const [isLoadingSmtp, setIsLoadingSmtp] = useState(false);
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState(null);

  useEffect(() => {
    if (activeSubTab !== 'users' || !(currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin')) {
      return;
    }
    let active = true;
    (async () => {
      setIsLoadingSmtp(true);
      try {
        const fn = httpsCallable(functions, 'getSmtpConfigStatus');
        const res = await fn({});
        if (!active || !res?.data) return;
        setSmtpForm((prev) => ({
          ...prev,
          host: res.data.host || '',
          port: Number(res.data.port || 465),
          secure: Boolean(res.data.secure ?? true),
          user: res.data.user || '',
          pass: '',
          fromName: res.data.fromName || 'Al-Tawoos ERP',
          fromEmail: res.data.fromEmail || res.data.user || '',
          hasPassword: Boolean(res.data.hasPassword),
          configured: Boolean(res.data.configured),
        }));
      } catch (err) {
        console.warn('SMTP status load notice:', err?.message);
      } finally {
        if (active) setIsLoadingSmtp(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeSubTab, currentUser?.isGeneralAdmin, currentUser?.role]);

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    setSmtpMsg(null);
    setIsSavingSmtp(true);
    try {
      const fn = httpsCallable(functions, 'saveSmtpConfig');
      const res = await fn({
        host: smtpForm.host.trim(),
        port: Number(smtpForm.port || 465),
        secure: Boolean(smtpForm.secure),
        user: smtpForm.user.trim(),
        pass: smtpForm.pass,
        fromName: smtpForm.fromName.trim() || 'Al-Tawoos ERP',
        fromEmail: (smtpForm.fromEmail || smtpForm.user).trim(),
        verifyConnection: true,
      });
      setSmtpForm((p) => ({
        ...p,
        pass: '',
        hasPassword: true,
        configured: Boolean(res?.data?.configured),
      }));
      setSmtpMsg({
        type: 'success',
        text: isAr
          ? 'تم التحقق من الاتصال وحفظ إعدادات البريد المؤسسي بأمان على الخادم ✓'
          : 'SMTP connection verified and saved securely on server ✓',
      });
    } catch (err) {
      setSmtpMsg({
        type: 'error',
        text: err?.message || (isAr ? 'تعذر التحقق من خادم البريد' : 'SMTP verification failed'),
      });
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setSmtpMsg(null);
    setIsTestingSmtp(true);
    try {
      const fn = httpsCallable(functions, 'sendTestSmtpEmail');
      const res = await fn({ to: currentUser?.email || smtpForm.user, isAr });
      setSmtpMsg({
        type: 'success',
        text: isAr
          ? `تم إرسال رسالة اختبار منسقة إلى ${res?.data?.to || currentUser?.email} ✓`
          : `Test email dispatched cleanly to ${res?.data?.to || currentUser?.email} ✓`,
      });
    } catch (err) {
      setSmtpMsg({
        type: 'error',
        text: err?.message || (isAr ? 'تعذر إرسال رسالة الاختبار' : 'Failed sending test email'),
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

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
    classification: 'raw_materials', // 'raw_materials' | 'finished_goods' | 'factory_floor' | 'returns' | 'scrap'
    isActive: true,
    color: '#0d6cba',
    icon: 'Warehouse',
    responsibleUserId: '',
  });

  // --- SUB-TAB 2: HIERARCHICAL PERMISSIONS STATE ---
  const [selectedPermUserId, setSelectedPermUserId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('master_data');
  const [selectedTabId, setSelectedTabId] = useState('items');
  const [permissionsState, setPermissionsState] = useState({});
  const [isSavingPerms, setIsSavingPerms] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isSavingWarehouse, setIsSavingWarehouse] = useState(false);

  // --- SUB-TAB 3: BULK IMPORTER, ATTACHMENTS & VALIDATION STATE ---
  const [selectedImportTabKey, setSelectedImportTabKey] = useState('suppliers');
  const [importedRows, setImportedRows] = useState([]);
  const [rowValidationResults, setRowValidationResults] = useState([]);
  const [importFilterStatus, setImportFilterStatus] = useState('all'); // 'all' | 'valid' | 'warning' | 'error'
  const [showRowAttachModal, setShowRowAttachModal] = useState(null); // { rowIndex, row }
  const [rowCompressingSlot, setRowCompressingSlot] = useState(null); // tracking slot currently compressing
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');



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

    const effectiveModules = { ...defaultModules, ...(override.modules || {}) };
    const effectiveActions = { ...defaultActions, ...(override.actions || {}) };
    const effectiveSensitive = { ...defaultSensitive, ...(override.sensitive || {}) };
    const effectiveFields = { ...defaultFields, ...(override.fields || {}) };

    // CASCADE RULE: If "show tab in navigation" (modules[tab.id]) is deselected,
    // all below related selections (actions and fields) for this tab must be automatically deselected (false)
    allTabsList.forEach((tab) => {
      if (effectiveModules[tab.id] === false) {
        (tab.actions || []).forEach((act) => {
          effectiveActions[`${tab.id}.${act.key}`] = false;
        });
        Object.keys(tab.fields || {}).forEach((fKey) => {
          effectiveFields[`${tab.id}.${fKey}`] = false;
        });
      }
    });

    return {
      modules: effectiveModules,
      actions: effectiveActions,
      sensitive: effectiveSensitive,
      fields: effectiveFields,
    };
  }, [permissionsState, activePermTargetUser, allTabsList]);

  // ==========================================
  // SUB-TAB 1: USER MANAGEMENT FUNCTIONS
  // ==========================================
  const detectedUserNonGoogleEmails = useMemo(
    () => detectNonGoogleEmails({ email: userForm.email, secondaryEmail: userForm.secondaryEmail }),
    [userForm.email, userForm.secondaryEmail]
  );

  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setShowUserInitPassword(false);
    setUserForm({
      id: `usr_${Date.now().toString().slice(-6)}`,
      email: '',
      secondaryEmail: '',
      name: '',
      nameAr: '',
      department: 'المشتريات',
      role: 'standard',
      allowedModules: ['purchases'],
      status: 'active',
      initialPassword: '',
      passwordTargetEmail: '',
    });
    setUserModalOpen(true);
  };

  const handleOpenEditUser = (user) => {
    setEditingUser(user);
    setShowUserInitPassword(false);
    const email1 = user.email || (Array.isArray(user.loginEmails) ? user.loginEmails[0] : '') || '';
    const email2 = user.secondaryEmail || (Array.isArray(user.loginEmails) ? user.loginEmails[1] : '') || '';
    setUserForm({
      ...user,
      email: email1,
      secondaryEmail: email2,
      role: user.role === 'general_admin' || user.isGeneralAdmin ? 'general_admin' : 'standard',
      allowedModules: user.allowedModules || ['purchases'],
      initialPassword: '',
      passwordTargetEmail: getDefaultPasswordProvisionEmail({ email: email1, secondaryEmail: email2 }),
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    let normalizedEmails;
    try {
      normalizedEmails = normalizeUserEmails({
        email: userForm.email,
        secondaryEmail: userForm.secondaryEmail,
      });
    } catch {
      alert(isAr ? 'يرجى إدخال صيغة بريد إلكتروني صحيحة.' : 'Please enter a valid email address format.');
      return;
    }

    if (normalizedEmails.loginEmails.length === 0) {
      alert(
        isAr
          ? 'يلزم إدخال بريد إلكتروني واحد على الأقل لتسجيل الدخول.'
          : 'At least 1 valid login email address is required to create a user.'
      );
      return;
    }

    const trimmedInitPwd = String(userForm.initialPassword || '').trim();
    if (trimmedInitPwd.length > 0 && trimmedInitPwd.length < 6) {
      alert(
        isAr
          ? 'كلمة المرور الأولية يجب أن لا تقل عن 6 أحرف.'
          : 'Initial password must be at least 6 characters.'
      );
      return;
    }

    if (!userForm.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم المستخدم باللغة العربية.' : 'Please enter Arabic user name.');
      return;
    }

    const isGeneralAdminUser = userForm.role === 'general_admin';
    const userDocId =
      userForm.id || `usr_${normalizedEmails.primaryEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Unique Email Check across primary + secondary + loginEmails[]
    const existingDuplicate = findEmailConflictUser(
      usersList,
      normalizedEmails.loginEmails,
      userDocId
    );
    if (existingDuplicate) {
      alert(
        isAr
          ? `أحد عناوين البريد الإلكتروني مسجل بالفعل لمستخدم آخر (${existingDuplicate.nameAr || existingDuplicate.name}).`
          : `One of the email addresses is already assigned to another user (${existingDuplicate.name || existingDuplicate.nameAr}).`
      );
      return;
    }

    setIsSavingUser(true);
    try {
      const { initialPassword: _dropPwd, passwordTargetEmail: _dropTarget, ...restForm } = userForm;
      await setDoc(
        doc(db, 'users', userDocId),
        {
          ...restForm,
          id: userDocId,
          email: normalizedEmails.primaryEmail,
          secondaryEmail: normalizedEmails.secondaryEmail,
          loginEmails: normalizedEmails.loginEmails,
          role: isGeneralAdminUser ? 'general_admin' : 'standard',
          isGeneralAdmin: isGeneralAdminUser,
          isPurchasingAdmin: isGeneralAdminUser || (userForm.allowedModules || []).includes('purchases'),
          allowedModules: isGeneralAdminUser
            ? ['master_data', 'purchases', 'production', 'sales', 'finance', 'hr']
            : (userForm.allowedModules || ['purchases']),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (trimmedInitPwd.length >= 6) {
        const pwdEmail =
          (userForm.passwordTargetEmail && detectedUserNonGoogleEmails.includes(userForm.passwordTargetEmail.trim().toLowerCase()))
            ? userForm.passwordTargetEmail.trim().toLowerCase()
            : (detectedUserNonGoogleEmails[0] || normalizedEmails.primaryEmail);
        if (pwdEmail) {
          try {
            const provisionFn = httpsCallable(functions, 'createEmployeeAuthAccount');
            await provisionFn({ email: pwdEmail, password: trimmedInitPwd, userId: userDocId });
          } catch (pwdErr) {
            console.warn('User password provisioning failed:', pwdErr?.message);
            alert(pwdErr?.message || (isAr ? 'تم حفظ الحساب ولكن تعذر ربط كلمة المرور' : 'Saved user, but password link failed'));
          }
        }
      }

      try {
        const syncClaimsFn = httpsCallable(functions, 'syncErpUserClaims');
        await syncClaimsFn({ userId: userDocId, extraEmails: normalizedEmails.loginEmails });
      } catch (syncErr) {
        console.warn('Non-blocking Auth claims sync notice:', syncErr?.message);
      }

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
      u.secondaryEmail?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
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
      case 'finished_goods':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-300">
            <Boxes className="h-3.5 w-3.5 text-indigo-700" />
            <span>{isAr ? 'مستودع المنتجات التامة' : 'Finished Goods Warehouse'}</span>
          </span>
        );
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

    // If trying to toggle an action or field, but the tab is disabled, prevent it
    if (tier === 'actions' || tier === 'fields') {
      const tabId = key.split('.')[0];
      if (!userEffectivePerms.modules[tabId]) {
        return;
      }
    }

    setPermissionsState((prev) => {
      const currentOverrides = prev[selectedPermUserId] || {};
      const currentTier = currentOverrides[tier] || {};
      const nextVal = !userEffectivePerms[tier][key];

      const updatedUserOverrides = {
        ...currentOverrides,
        [tier]: {
          ...currentTier,
          [key]: nextVal,
        },
      };

      // CASCADE RULE: If "show tab in navigation" (tier === 'modules') is deselected (nextVal === false),
      // all below related selections (actions and fields) for this tab must be automatically deselected
      if (tier === 'modules' && nextVal === false) {
        const tabSchema = allTabsList.find((t) => t.id === key) || activeTabSchema;
        if (tabSchema) {
          const updatedActions = { ...(updatedUserOverrides.actions || currentOverrides.actions || {}) };
          (tabSchema.actions || []).forEach((act) => {
            updatedActions[`${tabSchema.id}.${act.key}`] = false;
          });
          const updatedFields = { ...(updatedUserOverrides.fields || currentOverrides.fields || {}) };
          Object.keys(tabSchema.fields || {}).forEach((fKey) => {
            updatedFields[`${tabSchema.id}.${fKey}`] = false;
          });
          updatedUserOverrides.actions = updatedActions;
          updatedUserOverrides.fields = updatedFields;
        }
      }

      return {
        ...prev,
        [selectedPermUserId]: updatedUserOverrides,
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

          // Automatically record Opening Balance vouchers strictly in stock_ledger (SSOT)
          item.variations.forEach((v) => {
            if (v.openingQtySmall > 0 && v.openingWarehouse) {
              const obId = `OB-${todayCompact}-${item.code}-${v.suffix}`;
              const obLotNo = `${obId}-01`;

              const ledgerRef = doc(collection(db, 'stock_ledger'));
              batch.set(ledgerRef, {
                lotNumber: obLotNo,
                action: 'opening_balance',
                docType: 'opening_balance',
                voucherId: obId,
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



  return (
    <div className="space-y-6">
      {/* Full-Screen Loading Feedback for Admin Actions */}
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

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition shadow-xs cursor-pointer ms-auto"
            title={isAr ? 'العودة إلى بيئة العمل' : 'Back to Workspace'}
          >
            <ArrowRightLeft className="h-4 w-4 text-emerald-400" />
            <span>{isAr ? 'العودة لبيئة العمل' : 'Back to Workspace'}</span>
          </button>
        )}

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
            onClick={() => setActiveSubTab('notifications')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'notifications' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
            }`}
          >
            <BellRing className="h-3.5 w-3.5 text-amber-300" />
            <span>{isAr ? 'الإشعارات وتوكنات الأجهزة' : 'Notifications & Devices'}</span>
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
            onClick={() => setActiveSubTab('system_restore')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'system_restore' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-indigo-300'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>{isAr ? 'الاستعادة الزمنية' : 'System Restore'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('audit_logs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'audit_logs' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-300 hover:text-emerald-300'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{isAr ? 'سجل التدقيق والملخصات' : 'Audit Logs & Rollups'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('db_inspector')}
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
                      {u.secondaryEmail && (
                        <div className="font-mono text-[10px] text-amber-800 font-semibold">{u.secondaryEmail}</div>
                      )}
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
                            {isAr ? 'كافة الوحدات (All Access)' : 'All Modules'}
                          </span>
                        ) : (
                          (u.allowedModules || ['purchases']).map((modKey) => (
                            <span
                              key={modKey}
                              className="px-1.5 py-0.2 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-semibold"
                            >
                              {modKey === 'master_data' ? (isAr ? 'البيانات الأساسية' : 'Master Data') :
                               modKey === 'purchases' ? (isAr ? 'المشتريات' : 'Purchases') :
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

          {/* Corporate Branded Email Server (SMTP) for Custom Password Reset Links */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => setSmtpOpen((o) => !o)}
              className="w-full p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 transition cursor-pointer text-start"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#014EA8]/10 text-[#014EA8] border border-[#014EA8]/20 flex items-center justify-center shrink-0">
                  <Mail className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900">
                    {isAr ? 'خادم البريد المؤسسي المخصص (SMTP) لاستعادة كلمات المرور' : 'Branded Corporate Email Server (SMTP) for Password Resets'}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {isAr
                      ? 'يرسل رسائل تعيين كلمة المرور باسم ونطاق الشركة مباشرةً إلى شاشة الاستعادة المخصصة للمنظومة'
                      : 'Dispatches branded reset emails directly from your company domain to our custom /auth/action UI'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLoadingSmtp ? (
                  <PeacockLoader size="xxs" inline />
                ) : (
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                      smtpForm.configured
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {smtpForm.configured
                      ? (isAr ? `مفعل (${smtpForm.host})` : `Active (${smtpForm.host})`)
                      : (isAr ? 'غير مضبوط (يعمل بالافتراضي)' : 'Not Configured (Default Active)')}
                  </span>
                )}
              </div>
            </button>

            {smtpOpen && (
              <form onSubmit={handleSaveSmtp} className="p-4 pt-3 border-t border-slate-200 bg-slate-50/50 space-y-3 text-xs">
                {smtpMsg && (
                  <div
                    className={`p-3 rounded-xl font-bold flex items-center gap-2 ${
                      smtpMsg.type === 'error'
                        ? 'bg-rose-50 border border-rose-200 text-rose-900'
                        : 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <span>{smtpMsg.text}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'عنوان خادم SMTP Host *' : 'SMTP Host *'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      placeholder="mail.al-tawoos.com"
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, host: e.target.value }))}
                      className="w-full p-2 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'المنفذ Port' : 'Port'}
                    </label>
                    <input
                      type="number"
                      dir="ltr"
                      required
                      value={smtpForm.port}
                      onChange={(e) => {
                        const portVal = Number(e.target.value || 465);
                        setSmtpForm((p) => ({ ...p, port: portVal, secure: portVal === 465 }));
                      }}
                      className="w-full p-2 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smtpForm.secure}
                        onChange={(e) => setSmtpForm((p) => ({ ...p, secure: e.target.checked }))}
                        className="w-4 h-4 rounded accent-[#014EA8]"
                      />
                      <span>{isAr ? 'اتصال SSL/TLS مباشر (منفذ 465)' : 'Implicit SSL/TLS (Port 465)'}</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'بريد / اسم مستخدم SMTP *' : 'SMTP Username / Email *'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      placeholder="noreply@al-tawoos.com"
                      value={smtpForm.user}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, user: e.target.value }))}
                      className="w-full p-2 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'كلمة مرور البريد SMTP Password *' : 'SMTP Password *'}
                    </label>
                    <input
                      type="password"
                      dir="ltr"
                      required={!smtpForm.hasPassword}
                      placeholder={smtpForm.hasPassword ? '•••••••• (saved securely — leave blank to keep)' : 'App password or mailbox password'}
                      value={smtpForm.pass}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, pass: e.target.value }))}
                      className="w-full p-2 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'اسم المرسل الظاهر' : 'Sender Display Name'}
                    </label>
                    <input
                      type="text"
                      placeholder="Al-Tawoos ERP"
                      value={smtpForm.fromName}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, fromName: e.target.value }))}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'بريد المرسل (From Email)' : 'From Email'}
                    </label>
                    <input
                      type="email"
                      dir="ltr"
                      placeholder={smtpForm.user || 'noreply@al-tawoos.com'}
                      value={smtpForm.fromEmail}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, fromEmail: e.target.value }))}
                      className="w-full p-2 border border-slate-300 rounded-xl font-mono bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!smtpForm.configured || isTestingSmtp}
                    onClick={handleTestSmtp}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {isTestingSmtp ? <PeacockLoader size="xxs" inline /> : <Send className="w-3.5 h-3.5 text-[#014EA8]" />}
                    <span>{isAr ? 'إرسال بريد اختباري' : 'Send Test Email'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingSmtp}
                    className="px-5 py-2 rounded-xl bg-[#014EA8] hover:bg-[#013F8B] disabled:opacity-50 text-white font-black inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {isSavingSmtp ? <PeacockLoader size="xxs" inline variant="white" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{isAr ? 'فحص الاتصال وحفظ SMTP' : 'Verify & Save SMTP'}</span>
                  </button>
                </div>
              </form>
            )}
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
              {/* Primary & Secondary Login Emails (at least 1 required) */}
              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-800">
                      {isAr ? 'البريد الإلكتروني الأساسي (دخول 1)' : 'Primary Login Email (1)'}
                      {!userForm.secondaryEmail?.trim() && <span className="text-rose-600 ms-1">*</span>}
                    </label>
                    {userForm.email?.trim().includes('@') && (
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          isGoogleEmailAddress(userForm.email)
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {isGoogleEmailAddress(userForm.email) ? 'Google' : (isAr ? 'نطاق غير Google' : 'Non-Google')}
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    dir="ltr"
                    required={!userForm.secondaryEmail?.trim()}
                    placeholder="user@gmail.com"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-800">
                      {isAr ? 'البريد البديل للشركة (دخول 2 — اختياري)' : 'Secondary Company Email (2 — Optional)'}
                    </label>
                    {userForm.secondaryEmail?.trim().includes('@') && (
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          isGoogleEmailAddress(userForm.secondaryEmail)
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {isGoogleEmailAddress(userForm.secondaryEmail) ? 'Google' : (isAr ? 'نطاق غير Google' : 'Non-Google')}
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    dir="ltr"
                    required={!userForm.email?.trim()}
                    placeholder="user@altawoos.com"
                    value={userForm.secondaryEmail || ''}
                    onChange={(e) => setUserForm({ ...userForm, secondaryEmail: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {!userForm.email?.trim() && !userForm.secondaryEmail?.trim() && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
                    {isAr
                      ? 'مطلوب بريد إلكتروني واحد على الأقل لإنشاء المستخدم.'
                      : 'At least 1 valid email address is required to create a user.'}
                  </div>
                )}

                {detectedUserNonGoogleEmails.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-950">
                      <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                      <span>
                        {isAr
                          ? 'تم اكتشاف بريد غير Google — تعيين كلمة مرور أولية'
                          : 'Non-Google Email Detected — Initial Password'}
                      </span>
                    </div>
                    {detectedUserNonGoogleEmails.length > 1 && (
                      <select
                        value={
                          detectedUserNonGoogleEmails.includes(userForm.passwordTargetEmail)
                            ? userForm.passwordTargetEmail
                            : detectedUserNonGoogleEmails[0]
                        }
                        onChange={(e) => setUserForm({ ...userForm, passwordTargetEmail: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-amber-300 bg-white font-mono text-[11px] font-bold"
                      >
                        {detectedUserNonGoogleEmails.map((em) => (
                          <option key={em} value={em}>
                            {em}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="relative">
                      <input
                        type={showUserInitPassword ? 'text' : 'password'}
                        dir="ltr"
                        minLength={6}
                        value={userForm.initialPassword || ''}
                        onChange={(e) => setUserForm({ ...userForm, initialPassword: e.target.value })}
                        placeholder={isAr ? 'كلمة المرور الأولية (6 أحرف فأكثر — اختياري عند التعديل)' : 'Initial password (min 6 chars)'}
                        className="w-full pe-8 ps-2.5 py-1.5 rounded-lg border border-amber-300 bg-white font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowUserInitPassword((v) => !v)}
                        className="p-1 text-slate-400 hover:text-slate-700 absolute end-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {showUserInitPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
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
                      { key: 'master_data', labelAr: 'قاعدة البيانات الأساسية', labelEn: 'Master Database' },
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
                disabled={isSavingUser}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingUser && <PeacockLoader size="xxs" inline variant="white" />}
                <span>{isSavingUser ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الحساب' : 'Save User')}</span>
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
                  <option value="finished_goods">{isAr ? 'مستودع المنتجات التامة' : 'Finished Goods Warehouse'}</option>
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
                {isSavingPerms ? <PeacockLoader size="xxs" inline variant="white" /> : <Save className="h-3.5 w-3.5" />}
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

          {/* Consolidated View Security Passcode Management Card */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-900 text-amber-400 border border-slate-800 shrink-0">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  {isAr ? 'رمز أمان العرض الشامل للقوائم والسجلات' : 'Consolidated View Security Passcode'}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  {isAr
                    ? 'الرمز السري المكون من ٤ أرقام لفك حجب العرض الشامل عبر حركة الضغط المطول على أيقونة القفل.'
                    : '4-digit administrative passcode to unlock consolidated records via the long-press gesture on the lock icon.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveLedgerPasscode} className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  type={showLedgerPasscode ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={ledgerPasscode}
                  onChange={(e) => setLedgerPasscode(e.target.value.replace(/\D/g, ''))}
                  placeholder="7799"
                  className="w-28 px-3 py-1.5 border border-slate-300 rounded-xl text-center font-mono font-black text-sm bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowLedgerPasscode(!showLedgerPasscode)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  tabIndex={-1}
                >
                  {showLedgerPasscode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isSavingPasscode || !ledgerPasscode || ledgerPasscode.length < 4}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                {isSavingPasscode ? (
                  <>
                    <PeacockLoader size="xxs" inline variant="white" />
                    <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    <span>{isAr ? 'حفظ رمز الأمان' : 'Save Passcode'}</span>
                  </>
                )}
              </button>

              {passcodeSaveSuccess && (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'تم الحفظ والمزامنة ✓' : 'Saved ✓'}</span>
                </span>
              )}
            </form>
          </div>

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
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 block">
                      {isAr ? 'الصلاحيات التشغيلية المعتمدة لهذا التبويب:' : 'Operational Actions Authority:'}
                    </span>
                    {!userEffectivePerms.modules[activeTabSchema.id] && (
                      <span className="text-[11px] font-semibold text-rose-500 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                        {isAr ? 'معطلة تلقائياً (التبويب مخفي)' : 'Auto-disabled (Tab hidden)'}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(activeTabSchema.actions || []).map((act) => {
                      const permKey = `${activeTabSchema.id}.${act.key}`;
                      const isTabEnabled = Boolean(userEffectivePerms.modules[activeTabSchema.id]);
                      return (
                        <label
                          key={act.key}
                          className={`flex items-center justify-between p-2.5 border rounded-xl select-none transition ${
                            !isTabEnabled
                              ? 'bg-slate-100/60 border-slate-200 opacity-50 cursor-not-allowed'
                              : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 cursor-pointer'
                          }`}
                        >
                          <span className="font-medium text-slate-800">{isAr ? act.labelAr : act.labelEn}</span>
                          <input
                            type="checkbox"
                            disabled={!isTabEnabled}
                            checked={Boolean(userEffectivePerms.actions[permKey])}
                            onChange={() => handleTogglePermission('actions', permKey)}
                            className="h-4 w-4 rounded accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
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
                    <div className="flex items-center gap-2">
                      {!userEffectivePerms.modules[activeTabSchema.id] && (
                        <span className="text-[11px] font-semibold text-rose-500 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                          {isAr ? 'معطلة تلقائياً' : 'Auto-disabled'}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono">
                        {Object.values(activeTabSchema.fields || {}).filter((f) => f.isSensitive).length} {isAr ? 'حقول حساسة' : 'sensitive fields'}
                      </span>
                    </div>
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
                          const isTabEnabled = Boolean(userEffectivePerms.modules[activeTabSchema.id]);
                          const isFieldVisible = userEffectivePerms.fields?.[permKey] !== false;

                          return (
                            <div
                              key={fieldKey}
                              className={`p-2.5 rounded-xl border transition ${
                                !isTabEnabled
                                  ? 'bg-slate-100/60 border-slate-200 opacity-50 cursor-not-allowed'
                                  : isFieldVisible
                                  ? 'bg-slate-50 border-slate-200'
                                  : 'bg-amber-50/60 border-amber-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {isAr ? fieldMeta.labelAr : fieldMeta.labelEn}
                                </span>
                                <input
                                  type="checkbox"
                                  disabled={!isTabEnabled}
                                  checked={isFieldVisible}
                                  onChange={() => handleTogglePermission('fields', permKey)}
                                  className="h-4 w-4 rounded accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
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
      {/* SUB-TAB: LIVE NOTIFICATIONS & DEVICE TOKENS HUB                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'notifications' && (
        <NotificationControlCenter currentUser={currentUser} />
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
                      {isImporting ? <PeacockLoader size="xxs" inline variant="white" /> : <CheckSquare className="h-3.5 w-3.5" />}
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
        <BackupRestoreHub isAr={isAr} currentUser={currentUser} />
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB: AUTOMATED SYSTEM RESTORE (TIME MACHINE)                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'system_restore' && (
        <SystemRestoreHub currentUser={currentUser} isAr={isAr} />
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB: IMMUTABLE AUDIT LOGS & CLOUD ROLLUPS                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'audit_logs' && (
        <AuditLogsHub isAr={isAr} />
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: TARGETED FACTORY RESET (Scalable Selector & Cascade)           */}
      {/* ========================================================================= */}
      {activeSubTab === 'factory_reset' && (
        <FactoryResetHub isAr={isAr} currentUser={currentUser} warehousesList={warehousesList} allTabsList={allTabsList} />
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
        <DatabaseInspectorHub isAr={isAr} />
      )}

    </div>
  );
}