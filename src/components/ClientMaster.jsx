import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db, fileToDataUrl, openBase64Document } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  UserCheck,
  Plus,
  Search,
  Building2,
  Edit3,
  Trash2,
  Phone,
  Mail,
  User,
  FileText,
  Paperclip,
  UploadCloud,
  FileCheck,
  FileUp,
  XCircle,
  ExternalLink,
  Eye,
  EyeOff,
  PlusCircle,
  CreditCard,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Zap,
  TrendingDown,
  X,
  MapPin,
  Compass,
  Check,
  Download,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Smartphone,
  Navigation,
  CheckCircle2,
  Clock,
  Boxes,
  CalendarDays,
  FileSpreadsheet,
  Image as ImageIcon
} from 'lucide-react';
import VatNumberInput from './VatNumberInput';
import VatNumberDisplay from './VatNumberDisplay';
import { SEGMENT_ICON_MAP } from './ClientSegmentsMaster';
import { RowCommentButton } from './comments';

// Helper to normalize phone numbers (removes non-digits)
const normalizePhone = (p) => String(p || '').replace(/\D/g, '').trim();

// Helper to normalize tax card (removes dashes/spaces)
const normalizeTaxCard = (t) => String(t || '').replace(/[\s-]/g, '').trim();

// Days of the week dictionary
export const WEEK_DAYS = [
  { id: 'friday', labelAr: 'الجمعة', labelEn: 'Friday' },
  { id: 'saturday', labelAr: 'السبت', labelEn: 'Saturday' },
  { id: 'sunday', labelAr: 'الأحد', labelEn: 'Sunday' },
  { id: 'monday', labelAr: 'الإثنين', labelEn: 'Monday' },
  { id: 'tuesday', labelAr: 'الثلاثاء', labelEn: 'Tuesday' },
  { id: 'wednesday', labelAr: 'الأربعاء', labelEn: 'Wednesday' },
  { id: 'thursday', labelAr: 'الخميس', labelEn: 'Thursday' }
];

// Helper to auto-resize client logo to a lightweight square avatar (max 160px)
export const resizeClientLogo = (file, maxDimension = 160) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(e.target.result);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const webpData = canvas.toDataURL('image/webp', 0.85);
          if (webpData && webpData.startsWith('data:image/webp')) {
            return resolve(webpData);
          }
        } catch {
          // fallback
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// Settlement Modes Dictionary
const SETTLEMENT_MODES = [
  { id: 'cod', labelAr: 'دفع عند الاستلام (COD)', labelEn: 'Cash on Delivery (COD)' },
  { id: 'credit', labelAr: 'دفع آجل (تواريخ استحقاق محددة)', labelEn: 'Contractual Credit (Due Dates)' },
  { id: 'rolling_credit', labelAr: 'سداد السابق مع استلام الحالي', labelEn: 'Rolling Credit (Order-for-Order)' }
];

// Pricing Strategies Dictionary
const PRICING_STRATEGIES = [
  { id: 'wholesalers', labelAr: 'أسعار جملة (رسمي)', labelEn: 'Wholesale Standard' },
  { id: 'retail', labelAr: 'أسعار تجزئة', labelEn: 'Retail Standard' },
  { id: 'special_pricing', labelAr: 'أسعار خاصة (عقود وتفاوض)', labelEn: 'Special Client Pricing' }
];

export default function ClientMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // Tab-Scoped Permissions
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['clients.canCreate'] !== undefined
      ? permissions.actions['clients.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['clients.canEdit'] !== undefined
      ? permissions.actions['clients.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['clients.canDelete'] !== undefined
      ? permissions.actions['clients.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

  const canBulkImport = isGeneralAdmin || (
    permissions?.actions?.['clients.canBulkImport'] !== undefined
      ? permissions.actions['clients.canBulkImport'] === true
      : permissions?.actions?.canBulkImport === true || true
  );

  // Sensitive Field Access Helper
  const checkFieldAccess = (fieldKey) => {
    if (isGeneralAdmin) return true;
    if (permissions?.fields && permissions.fields[`clients.${fieldKey}`] !== undefined) {
      return permissions.fields[`clients.${fieldKey}`] === true;
    }
    return true;
  };

  const canViewTaxCard = checkFieldAccess('taxCardNumber');
  const canViewCreditLimit = checkFieldAccess('creditLimit');

  // Firestore Subscriptions
  const [clients, setClients] = useState([]);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSegmentFilter, setSelectedSegmentFilter] = useState('all');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState('all');
  const [expandedClientId, setExpandedClientId] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteConfirmClient, setDeleteConfirmClient] = useState(null);
  const [formError, setFormError] = useState('');
  const [activeFormTab, setActiveFormTab] = useState('profile'); // 'profile' | 'branches' | 'documents'

  // Bulk Import Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importStats, setImportStats] = useState({ total: 0, valid: 0, invalid: 0 });
  const [isCommittingImport, setIsCommittingImport] = useState(false);

  // Form State
  const initialClientForm = {
    id: '',
    logo: '',
    tradeNameAr: '',
    tradeNameEn: '',
    legalName: '',
    segmentId: '',
    pricingStrategy: 'wholesalers',
    taxCardNumber: '',
    commercialRegister: '',
    taxDistrict: '',
    settlementMode: 'cod',
    creditLimit: 0, // 0 = Unlimited / No limit
    openingBalance: 0,
    latestActivityOn: null,
    notes: '',
    phones: [],
    emails: [],
    weeklyHolidays: ['friday', 'saturday'],
    workingHoursFrom: '09:00',
    workingHoursTo: '17:00',
    attachments: [],
    branches: [
      {
        id: 'br_main',
        nameAr: 'الفرع الرئيسي',
        nameEn: 'Main Branch',
        isMain: true,
        region: '',
        address: '',
        contactPerson: '',
        phone: '',
        mobile: '',
        phones: [],
        useCustomSchedule: false,
        weeklyHolidays: [],
        workingHoursFrom: '',
        workingHoursTo: '',
        gpsCoordinates: '',
        notes: ''
      }
    ]
  };

  const [formData, setFormData] = useState(initialClientForm);
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');

  // Real-time Sync
  useEffect(() => {
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      list.sort((a, b) => (a.tradeNameAr || '').localeCompare(b.tradeNameAr || '', 'ar'));
      setClients(list);
      setLoading(false);
    });

    const unsubSegments = onSnapshot(collection(db, 'client_segments'), (snapshot) => {
      const segList = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      segList.sort((a, b) => (Number(a.displayOrder) || 99) - (Number(b.displayOrder) || 99));
      setSegments(segList);
    });

    return () => {
      unsubClients();
      unsubSegments();
    };
  }, []);

  // Map segments dictionary for fast lookup
  const segmentMap = useMemo(() => {
    const map = {};
    segments.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [segments]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setFormError('');
    setActiveFormTab('profile');
    setPhoneInput('');
    setEmailInput('');

    // Auto-generate code CLI-XXX
    let nextNum = 101;
    if (clients.length > 0) {
      const nums = clients.map((c) => {
        const match = String(c.id).match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      });
      nextNum = Math.max(...nums) + 1;
    }

    setFormData({
      ...initialClientForm,
      id: `CLI-${nextNum}`,
      segmentId: segments.length > 0 ? segments[0].id : ''
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (client) => {
    setEditingClient(client);
    setFormError('');
    setActiveFormTab('profile');
    setPhoneInput('');
    setEmailInput('');

    // Reconcile phones
    let clientPhones = Array.isArray(client.phones) ? [...client.phones] : [];
    if (clientPhones.length === 0) {
      if (client.phone) clientPhones.push(client.phone);
      if (client.mobile && client.mobile !== client.phone) clientPhones.push(client.mobile);
    }

    // Reconcile emails
    let clientEmails = Array.isArray(client.emails) ? [...client.emails] : [];
    if (clientEmails.length === 0 && client.email) {
      clientEmails.push(client.email);
    }

    const reconciledBranches = (client.branches && client.branches.length > 0)
      ? client.branches.map((b) => ({
          ...b,
          phones: Array.isArray(b.phones) ? b.phones : (b.phone ? [b.phone] : []),
          useCustomSchedule: b.useCustomSchedule === true,
          weeklyHolidays: Array.isArray(b.weeklyHolidays) ? b.weeklyHolidays : [],
          workingHoursFrom: b.workingHoursFrom || '',
          workingHoursTo: b.workingHoursTo || ''
        }))
      : [
          {
            id: 'br_main',
            nameAr: 'الفرع الرئيسي',
            nameEn: 'Main Branch',
            isMain: true,
            region: client.region || '',
            address: client.address || '',
            contactPerson: client.contactPerson || '',
            phone: client.phone || '',
            mobile: client.mobile || '',
            phones: client.phone ? [client.phone] : [],
            useCustomSchedule: false,
            weeklyHolidays: [],
            workingHoursFrom: '',
            workingHoursTo: '',
            gpsCoordinates: client.gpsCoordinates || '',
            notes: ''
          }
        ];

    setFormData({
      id: client.id,
      logo: client.logo || '',
      tradeNameAr: client.tradeNameAr || client.name || '',
      tradeNameEn: client.tradeNameEn || '',
      legalName: client.legalName || client.taxpayerLegalName || '',
      segmentId: client.segmentId || (segments.length > 0 ? segments[0].id : ''),
      pricingStrategy: client.pricingStrategy || 'wholesalers',
      taxCardNumber: client.taxCardNumber || '',
      commercialRegister: client.commercialRegister || '',
      taxDistrict: client.taxDistrict || '',
      settlementMode: client.settlementMode || 'cod',
      creditLimit: Number(client.creditLimit) || 0,
      openingBalance: Number(client.openingBalance) || 0,
      latestActivityOn: client.latestActivityOn || null,
      notes: client.notes || '',
      phones: clientPhones,
      emails: clientEmails,
      weeklyHolidays: Array.isArray(client.weeklyHolidays) ? client.weeklyHolidays : ['friday', 'saturday'],
      workingHoursFrom: client.workingHoursFrom || '09:00',
      workingHoursTo: client.workingHoursTo || '17:00',
      attachments: client.attachments || [],
      branches: reconciledBranches
    });
    setIsModalOpen(true);
  };

  // =========================================================================
  // DE-DUPLICATION ENGINE (Strictly Excludes Empty Fields)
  // =========================================================================
  const checkDuplicates = (targetFormData, excludeClientId = null) => {
    const cleanTaxCard = normalizeTaxCard(targetFormData.taxCardNumber);
    const cleanNameAr = (targetFormData.tradeNameAr || '').trim().toLowerCase();
    const cleanNameEn = (targetFormData.tradeNameEn || '').trim().toLowerCase();

    // Collect all non-empty phone and mobile numbers from target
    const targetPhones = new Set();
    (targetFormData.phones || []).forEach((p) => {
      const np = normalizePhone(p);
      if (np) targetPhones.add(np);
    });
    if (targetFormData.phone) {
      const np = normalizePhone(targetFormData.phone);
      if (np) targetPhones.add(np);
    }
    (targetFormData.branches || []).forEach((b) => {
      const p = normalizePhone(b.phone);
      const m = normalizePhone(b.mobile);
      if (p) targetPhones.add(p);
      if (m) targetPhones.add(m);
      (b.phones || []).forEach((bp) => {
        const nbp = normalizePhone(bp);
        if (nbp) targetPhones.add(nbp);
      });
    });

    for (const existing of clients) {
      if (excludeClientId && existing.id === excludeClientId) continue;

      // 1. Check Tax Card ID (ONLY if non-empty)
      if (cleanTaxCard) {
        const existTax = normalizeTaxCard(existing.taxCardNumber);
        if (existTax && existTax === cleanTaxCard) {
          return isAr
            ? `رقم البطاقة الضريبية (${targetFormData.taxCardNumber}) مسجل مسبقاً للعميل: ${existing.tradeNameAr || existing.id}`
            : `Tax Card ID (${targetFormData.taxCardNumber}) is already registered to: ${existing.tradeNameAr || existing.id}`;
        }
      }

      // 2. Check Name Similarity (ONLY if non-empty)
      if (cleanNameAr) {
        const existNameAr = (existing.tradeNameAr || existing.name || '').trim().toLowerCase();
        if (existNameAr && existNameAr === cleanNameAr) {
          return isAr
            ? `اسم الشهرة العربي (${targetFormData.tradeNameAr}) مسجل مسبقاً للعميل: ${existing.id}`
            : `Trade Name (Ar) (${targetFormData.tradeNameAr}) is already registered to: ${existing.id}`;
        }
      }

      if (cleanNameEn) {
        const existNameEn = (existing.tradeNameEn || '').trim().toLowerCase();
        if (existNameEn && existNameEn === cleanNameEn) {
          return isAr
            ? `اسم الشهرة الإنجليزي (${targetFormData.tradeNameEn}) مسجل مسبقاً للعميل: ${existing.id}`
            : `Trade Name (En) (${targetFormData.tradeNameEn}) is already registered to: ${existing.id}`;
        }
      }

      // 3. Check Phone Numbers (ONLY if non-empty)
      if (targetPhones.size > 0) {
        const existPhones = new Set();
        (existing.phones || []).forEach((p) => {
          const np = normalizePhone(p);
          if (np) existPhones.add(np);
        });
        if (existing.phone) existPhones.add(normalizePhone(existing.phone));
        if (existing.mobile) existPhones.add(normalizePhone(existing.mobile));
        (existing.branches || []).forEach((b) => {
          const p = normalizePhone(b.phone);
          const m = normalizePhone(b.mobile);
          if (p) existPhones.add(p);
          if (m) existPhones.add(m);
          (b.phones || []).forEach((bp) => {
            const nbp = normalizePhone(bp);
            if (nbp) existPhones.add(nbp);
          });
        });

        for (const phone of targetPhones) {
          if (phone && existPhones.has(phone)) {
            return isAr
              ? `رقم الهاتف (${phone}) مسجل مسبقاً للعميل: ${existing.tradeNameAr || existing.id}`
              : `Phone number (${phone}) is already registered to: ${existing.tradeNameAr || existing.id}`;
          }
        }
      }
    }

    return null; // No duplicate detected
  };

  // Save Client
  const handleSaveClient = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanTradeNameAr = formData.tradeNameAr.trim();
    if (!cleanTradeNameAr) {
      setFormError(isAr ? 'يرجى إدخال اسم الشهرة التجاري للعميل' : 'Client trade name is required');
      setActiveFormTab('profile');
      return;
    }

    if (!formData.segmentId) {
      setFormError(isAr ? 'يرجى اختيار تصنيف / قطاع العميل' : 'Client segment is required');
      setActiveFormTab('profile');
      return;
    }

    // Run De-Duplication Verification
    const duplicateError = checkDuplicates(formData, editingClient ? editingClient.id : null);
    if (duplicateError) {
      setFormError(duplicateError);
      return;
    }

    try {
      const payload = {
        tradeNameAr: cleanTradeNameAr,
        tradeNameEn: formData.tradeNameEn.trim(),
        legalName: formData.legalName.trim() || cleanTradeNameAr,
        segmentId: formData.segmentId,
        pricingStrategy: formData.pricingStrategy,
        taxCardNumber: formData.taxCardNumber.trim(),
        commercialRegister: formData.commercialRegister.trim(),
        taxDistrict: formData.taxDistrict.trim(),
        settlementMode: formData.settlementMode,
        creditLimit: Math.max(0, Number(formData.creditLimit) || 0),
        openingBalance: Number(formData.openingBalance) || 0,
        notes: formData.notes.trim(),
        logo: formData.logo || '',
        phones: formData.phones || [],
        phone: (formData.phones && formData.phones[0]) || '',
        emails: formData.emails || [],
        email: (formData.emails && formData.emails[0]) || '',
        weeklyHolidays: formData.weeklyHolidays || [],
        workingHoursFrom: formData.workingHoursFrom || '',
        workingHoursTo: formData.workingHoursTo || '',
        branches: (formData.branches || []).map((b) => ({
          ...b,
          phone: (b.phones && b.phones[0]) || b.phone || ''
        })),
        branchesCount: (formData.branches || []).length,
        attachments: formData.attachments || [],
        // Preserve latestActivityOn (strictly managed upon delivery)
        latestActivityOn: editingClient ? (editingClient.latestActivityOn || null) : null,
        updatedAt: serverTimestamp()
      };

      if (!editingClient) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'clients', formData.id.trim()), payload, { merge: true });
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving client:', err);
      setFormError(err.message || 'Failed to save client');
    }
  };

  // Logo upload with Canvas-based resize
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const resizedDataUrl = await resizeClientLogo(file, 160);
      setFormData((prev) => ({ ...prev, logo: resizedDataUrl }));
    } catch (err) {
      console.error('Error processing client logo:', err);
      alert(isAr ? 'فشل معالجة صورة الشعار' : 'Failed to process logo image');
    }
  };

  // Multiple Phones & Emails Handlers
  const handleAddPhone = () => {
    const p = phoneInput.trim();
    if (!p) return;
    const current = formData.phones || [];
    if (!current.includes(p)) {
      setFormData({ ...formData, phones: [...current, p] });
    }
    setPhoneInput('');
  };

  const handleRemovePhone = (index) => {
    const current = [...(formData.phones || [])];
    current.splice(index, 1);
    setFormData({ ...formData, phones: current });
  };

  const handleAddEmail = () => {
    const em = emailInput.trim();
    if (!em) return;
    const current = formData.emails || [];
    if (!current.includes(em)) {
      setFormData({ ...formData, emails: [...current, em] });
    }
    setEmailInput('');
  };

  const handleRemoveEmail = (index) => {
    const current = [...(formData.emails || [])];
    current.splice(index, 1);
    setFormData({ ...formData, emails: current });
  };

  // Weekly Holidays Handlers
  const handleToggleWeeklyHoliday = (dayId) => {
    const current = formData.weeklyHolidays || [];
    if (current.includes(dayId)) {
      setFormData({ ...formData, weeklyHolidays: current.filter((d) => d !== dayId) });
    } else {
      setFormData({ ...formData, weeklyHolidays: [...current, dayId] });
    }
  };

  const handleToggleBranchHoliday = (bIdx, dayId) => {
    const updated = [...(formData.branches || [])];
    const bHolidays = updated[bIdx].weeklyHolidays || [];
    if (bHolidays.includes(dayId)) {
      updated[bIdx].weeklyHolidays = bHolidays.filter((d) => d !== dayId);
    } else {
      updated[bIdx].weeklyHolidays = [...bHolidays, dayId];
    }
    setFormData({ ...formData, branches: updated });
  };

  // Delete Client
  const handleDeleteClient = async (client) => {
    try {
      await deleteDoc(doc(db, 'clients', client.id));
      setDeleteConfirmClient(null);
    } catch (err) {
      console.error('Error deleting client:', err);
      alert(isAr ? 'حدث خطأ أثناء حذف العميل' : 'Error deleting client');
    }
  };

  // Branch Sub-Management
  const handleAddBranch = () => {
    const newBranch = {
      id: `br_${Date.now()}`,
      nameAr: `${isAr ? 'فرع' : 'Branch'} ${(formData.branches || []).length + 1}`,
      nameEn: `Branch ${(formData.branches || []).length + 1}`,
      isMain: (formData.branches || []).length === 0,
      region: '',
      address: '',
      contactPerson: '',
      phone: '',
      mobile: '',
      phones: [],
      useCustomSchedule: false,
      weeklyHolidays: [],
      workingHoursFrom: '',
      workingHoursTo: '',
      gpsCoordinates: '',
      notes: ''
    };
    setFormData({
      ...formData,
      branches: [...(formData.branches || []), newBranch]
    });
  };

  const handleUpdateBranch = (index, field, value) => {
    const updated = [...(formData.branches || [])];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'isMain' && value === true) {
      updated.forEach((b, i) => {
        if (i !== index) b.isMain = false;
      });
    }
    setFormData({ ...formData, branches: updated });
  };

  const handleRemoveBranch = (index) => {
    const updated = (formData.branches || []).filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some((b) => b.isMain)) {
      updated[0].isMain = true;
    }
    setFormData({ ...formData, branches: updated });
  };

  // Attachment Upload
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newAttachments = [...(formData.attachments || [])];
    for (const f of files) {
      try {
        const dataUrl = await fileToDataUrl(f);
        newAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: f.name,
          type: f.type,
          size: f.size,
          dataUrl: dataUrl,
          uploadedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error processing attachment:', err);
      }
    }
    setFormData({ ...formData, attachments: newAttachments });
  };

  const handleRemoveAttachment = (attId) => {
    setFormData({
      ...formData,
      attachments: (formData.attachments || []).filter((a) => a.id !== attId)
    });
  };

  // =========================================================================
  // BULK CSV IMPORT / EXPORT ENGINE
  // =========================================================================
  const handleDownloadTemplate = () => {
    const headers = [
      'code',
      'tradeNameAr',
      'tradeNameEn',
      'legalName',
      'segment',
      'pricingStrategy',
      'taxCardNumber',
      'commercialRegister',
      'taxDistrict',
      'settlementMode',
      'creditLimit',
      'phones',
      'emails',
      'weeklyHolidays',
      'workingHoursFrom',
      'workingHoursTo',
      'branchName',
      'address',
      'region',
      'contactPerson',
      'branchPhone',
      'gpsCoordinates'
    ];

    const allowedSegmentsList = segments.map((s) => s.nameAr).join(' | ');

    const sampleRow1 = [
      'CLI-101',
      'شركة التوفيق للتجارة',
      'Al-Tawfeeq Trading Co.',
      'شركة التوفيق للتجارة والتوزيع ش.م.م',
      segments[0]?.nameAr || 'جملة',
      'wholesalers',
      '123-456-789',
      '109844',
      'مأمورية شركات المساهمة',
      'cod',
      '0',
      '01012345678; 01212345678',
      'orders@tawfeeq.com; info@tawfeeq.com',
      'الجمعة; السبت',
      '09:00',
      '17:00',
      'الفرع الرئيسي',
      'شارع المعز - باب الشعرية - القاهرة',
      'القاهرة',
      'أ. محمد توفيق',
      '01012345678',
      'https://maps.google.com/?q=30.05,31.25'
    ];

    const sampleRow2 = [
      'CLI-102',
      'سلسلة سوبر ماركت البركة',
      'Al-Baraka Supermarkets',
      'البركة لتجارة التجزئة والتوزيع',
      segments[1]?.nameAr || 'سلاسل تجارية / كبرى',
      'special_pricing',
      '987-654-321',
      '205411',
      'مأمورية 6 أكتوبر',
      'rolling_credit',
      '150000',
      '01122334455; 01522334455',
      'baraka@supermarket.com',
      'الجمعة',
      '08:30',
      '22:00',
      'فرع التجمع الخامس',
      'شارع التسعين الشمالي - مول النرجس',
      'القاهرة الجديدة',
      'أ. عمرو عبد الله',
      '01122334455',
      ''
    ];

    const csvContent =
      '\uFEFF' +
      [
        `# Tawoos ERP Clients Bulk Import Template - Valid Segments: [${allowedSegmentsList}]`,
        headers.join(','),
        sampleRow1.map((v) => `"${v}"`).join(','),
        sampleRow2.map((v) => `"${v}"`).join(',')
      ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'tawoos_clients_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleUpdateImportRowSegment = (rowIndex, newSegmentId) => {
    const updated = [...importRows];
    const row = { ...updated[rowIndex] };
    row.segmentId = newSegmentId;
    if (newSegmentId) {
      const segObj = segments.find((s) => s.id === newSegmentId);
      row.segmentRaw = segObj ? segObj.nameAr : newSegmentId;
      // Re-evaluate duplicates and errors
      const dupCheck = checkDuplicates({
        taxCardNumber: row.taxCardNumber,
        tradeNameAr: row.tradeNameAr,
        tradeNameEn: row.tradeNameEn,
        phones: row.phones,
        branches: [{ phone: row.branchPhone, mobile: row.branchPhone, phones: row.phones }]
      });
      if (dupCheck) {
        row.isValid = false;
        row.errorReason = dupCheck;
      } else {
        row.isValid = true;
        row.errorReason = '';
      }
    } else {
      row.isValid = false;
      row.errorReason = isAr ? 'يرجى تحديد قطاع العميل' : 'Segment selection is required';
    }
    updated[rowIndex] = row;
    setImportRows(updated);

    const validCount = updated.filter((r) => r.isValid).length;
    setImportStats({
      total: updated.length,
      valid: validCount,
      invalid: updated.length - validCount
    });
  };

  const handleParseCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const parseDelimited = (str) =>
      String(str || '')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);

    const normalizeArText = (t) =>
      String(t || '')
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ');

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
      if (lines.length < 2) {
        alert(isAr ? 'الملف لا يحتوي على بيانات كافية' : 'CSV file is empty');
        return;
      }

      const rows = [];
      const seenInCsvTax = new Set();
      const seenInCsvPhones = new Set();
      const seenInCsvNames = new Set();

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]
          .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
          .map((v) => v.replace(/^"|"$/g, '').trim());

        if (cols.length < 2 || !cols[1]) continue;

        let phones = [];
        let emails = [];
        let weeklyHolidays = ['friday', 'saturday'];
        let workingHoursFrom = '09:00';
        let workingHoursTo = '17:00';
        let branchName = 'الفرع الرئيسي';
        let address = '';
        let region = '';
        let contactPerson = '';
        let branchPhone = '';
        let gpsCoordinates = '';

        if (cols.length >= 22) {
          phones = parseDelimited(cols[11]);
          emails = parseDelimited(cols[12]);
          const rawHolidays = parseDelimited(cols[13]);
          if (rawHolidays.length > 0) {
            weeklyHolidays = rawHolidays.map((h) => {
              const day = WEEK_DAYS.find(
                (d) =>
                  d.id === h.toLowerCase() ||
                  d.labelAr === h ||
                  d.labelEn.toLowerCase() === h.toLowerCase()
              );
              return day ? day.id : h;
            });
          }
          workingHoursFrom = cols[14] || '09:00';
          workingHoursTo = cols[15] || '17:00';
          branchName = cols[16] || 'الفرع الرئيسي';
          address = cols[17] || '';
          region = cols[18] || '';
          contactPerson = cols[19] || '';
          branchPhone = cols[20] || '';
          gpsCoordinates = cols[21] || '';
        } else {
          // Backward-compatible mapping for older 18-col template
          branchName = cols[11] || 'الفرع الرئيسي';
          address = cols[12] || '';
          region = cols[13] || '';
          contactPerson = cols[14] || '';
          const p1 = cols[15] || '';
          const p2 = cols[16] || '';
          if (p1) phones.push(p1);
          if (p2 && p2 !== p1) phones.push(p2);
          branchPhone = p1;
          gpsCoordinates = cols[17] || '';
        }

        const rowData = {
          code: cols[0] || `CLI-${Date.now() + i}`,
          tradeNameAr: cols[1] || '',
          tradeNameEn: cols[2] || '',
          legalName: cols[3] || cols[1] || '',
          segmentRaw: cols[4] || '',
          pricingStrategy: ['wholesalers', 'retail', 'special_pricing'].includes(cols[5]) ? cols[5] : 'wholesalers',
          taxCardNumber: cols[6] || '',
          commercialRegister: cols[7] || '',
          taxDistrict: cols[8] || '',
          settlementMode: ['cod', 'credit', 'rolling_credit'].includes(cols[9]) ? cols[9] : 'cod',
          creditLimit: Math.max(0, parseFloat(cols[10]) || 0),
          phones,
          emails,
          weeklyHolidays,
          workingHoursFrom,
          workingHoursTo,
          branchName,
          address,
          region,
          contactPerson,
          branchPhone,
          gpsCoordinates,
          isValid: true,
          errorReason: ''
        };

        // Strict segment matching with Arabic normalization and no silent fallback
        const cleanSegRaw = (rowData.segmentRaw || '').trim();
        const normRaw = normalizeArText(cleanSegRaw);
        const matchedSeg = segments.find(
          (s) =>
            s.nameAr === cleanSegRaw ||
            s.nameEn?.toLowerCase() === cleanSegRaw.toLowerCase() ||
            s.id === cleanSegRaw ||
            normalizeArText(s.nameAr) === normRaw ||
            normalizeArText(s.nameEn) === normRaw
        );

        if (matchedSeg) {
          rowData.segmentId = matchedSeg.id;
          rowData.segmentRaw = matchedSeg.nameAr;
        } else {
          rowData.segmentId = '';
          rowData.isValid = false;
          const availableSegs = segments.map((s) => s.nameAr).join('، ');
          rowData.errorReason = isAr
            ? `قطاع غير معرّف أو به خطأ: "${cleanSegRaw || 'فارغ'}". القطاعات المتاحة: (${availableSegs})`
            : `Unrecognized segment: "${cleanSegRaw || 'empty'}". Allowed segments: (${availableSegs})`;
        }

        // Validation against live database
        if (rowData.isValid) {
          const dupCheck = checkDuplicates({
            taxCardNumber: rowData.taxCardNumber,
            tradeNameAr: rowData.tradeNameAr,
            tradeNameEn: rowData.tradeNameEn,
            phones: rowData.phones,
            branches: [{ phone: rowData.branchPhone, mobile: rowData.branchPhone, phones: rowData.phones }]
          });

          if (dupCheck) {
            rowData.isValid = false;
            rowData.errorReason = dupCheck;
          }
        }

        // Check internal duplicates within CSV
        if (rowData.isValid) {
          const cleanTax = normalizeTaxCard(rowData.taxCardNumber);
          const cleanName = rowData.tradeNameAr.toLowerCase();
          const cleanPhones = rowData.phones.map(normalizePhone).filter(Boolean);

          if (cleanTax && seenInCsvTax.has(cleanTax)) {
            rowData.isValid = false;
            rowData.errorReason = isAr ? 'رقم البطاقة الضريبية مكرر داخل نفس الملف' : 'Tax Card duplicated inside CSV';
          } else if (cleanName && seenInCsvNames.has(cleanName)) {
            rowData.isValid = false;
            rowData.errorReason = isAr ? 'اسم العميل مكرر داخل نفس الملف' : 'Client name duplicated inside CSV';
          } else {
            for (const cp of cleanPhones) {
              if (seenInCsvPhones.has(cp)) {
                rowData.isValid = false;
                rowData.errorReason = isAr ? `رقم الهاتف (${cp}) مكرر داخل نفس الملف` : `Phone (${cp}) duplicated inside CSV`;
                break;
              }
            }
          }

          if (cleanTax) seenInCsvTax.add(cleanTax);
          if (cleanName) seenInCsvNames.add(cleanName);
          cleanPhones.forEach((cp) => seenInCsvPhones.add(cp));
        }

        rows.push(rowData);
      }

      const validCount = rows.filter((r) => r.isValid).length;
      setImportRows(rows);
      setImportStats({
        total: rows.length,
        valid: validCount,
        invalid: rows.length - validCount
      });
      setIsBulkModalOpen(true);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleCommitBulkImport = async () => {
    const validRows = importRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsCommittingImport(true);
    try {
      for (const r of validRows) {
        const payload = {
          tradeNameAr: r.tradeNameAr,
          tradeNameEn: r.tradeNameEn,
          legalName: r.legalName,
          segmentId: r.segmentId,
          pricingStrategy: r.pricingStrategy,
          taxCardNumber: r.taxCardNumber,
          commercialRegister: r.commercialRegister,
          taxDistrict: r.taxDistrict,
          settlementMode: r.settlementMode,
          creditLimit: r.creditLimit,
          openingBalance: 0,
          latestActivityOn: null,
          phones: r.phones || [],
          phone: (r.phones && r.phones[0]) || r.branchPhone || '',
          emails: r.emails || [],
          email: (r.emails && r.emails[0]) || '',
          weeklyHolidays: r.weeklyHolidays || ['friday', 'saturday'],
          workingHoursFrom: r.workingHoursFrom || '09:00',
          workingHoursTo: r.workingHoursTo || '17:00',
          branches: [
            {
              id: 'br_main',
              nameAr: r.branchName || 'الفرع الرئيسي',
              nameEn: 'Main Branch',
              isMain: true,
              region: r.region,
              address: r.address,
              contactPerson: r.contactPerson,
              phone: r.branchPhone || (r.phones && r.phones[0]) || '',
              mobile: (r.phones && r.phones[1]) || '',
              phones: r.phones || [],
              useCustomSchedule: false,
              weeklyHolidays: [],
              workingHoursFrom: '',
              workingHoursTo: '',
              gpsCoordinates: r.gpsCoordinates,
              notes: ''
            }
          ],
          branchesCount: 1,
          attachments: [],
          notes: 'Imported via Bulk CSV',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'clients', r.code), payload, { merge: true });
      }

      setIsBulkModalOpen(false);
      setImportRows([]);
      alert(isAr ? `تم بنجاح استيراد (${validRows.length}) عميل جديد.` : `Successfully imported ${validRows.length} clients.`);
    } catch (err) {
      console.error('Error committing bulk import:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ السجلات' : 'Error importing records');
    } finally {
      setIsCommittingImport(false);
    }
  };

  // Export to CSV
  const handleExportClients = () => {
    if (clients.length === 0) return;

    const headers = [
      'Code',
      'Trade Name (Ar)',
      'Trade Name (En)',
      'Legal Name',
      'Segment',
      'Pricing Strategy',
      'Tax Card Number',
      'Settlement Mode',
      'Credit Limit (EGP)',
      'Latest Activity',
      'Branches Count'
    ];

    const rows = clients.map((c) => {
      const seg = segmentMap[c.segmentId];
      return [
        c.id,
        c.tradeNameAr || c.name || '',
        c.tradeNameEn || '',
        c.legalName || '',
        seg ? seg.nameAr : c.segmentId || '',
        c.pricingStrategy || '',
        c.taxCardNumber || '',
        c.settlementMode || '',
        c.creditLimit || 0,
        c.latestActivityOn ? new Date(c.latestActivityOn).toLocaleDateString() : 'None',
        (c.branches || []).length
      ]
        .map((v) => `"${v}"`)
        .join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clients_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Clients List
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      // Segment filter
      if (selectedSegmentFilter !== 'all' && c.segmentId !== selectedSegmentFilter) {
        return false;
      }
      // Strategy filter
      if (selectedStrategyFilter !== 'all' && c.pricingStrategy !== selectedStrategyFilter) {
        return false;
      }
      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inCode = (c.id || '').toLowerCase().includes(q);
        const inNameAr = (c.tradeNameAr || c.name || '').toLowerCase().includes(q);
        const inNameEn = (c.tradeNameEn || '').toLowerCase().includes(q);
        const inLegal = (c.legalName || '').toLowerCase().includes(q);
        const inTax = (c.taxCardNumber || '').toLowerCase().includes(q);
        const inBranch = (c.branches || []).some(
          (b) =>
            (b.nameAr || '').toLowerCase().includes(q) ||
            (b.phone || '').includes(q) ||
            (b.address || '').toLowerCase().includes(q) ||
            (b.region || '').toLowerCase().includes(q)
        );
        return inCode || inNameAr || inNameEn || inLegal || inTax || inBranch;
      }
      return true;
    });
  }, [clients, selectedSegmentFilter, selectedStrategyFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Search, Filter and Actions Control Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
        {/* Search & Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث بالاسم، الكود، البطاقة الضريبية، الهاتف...' : 'Search by name, code, tax ID, phone...'}
              className="w-full ps-9 pe-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Segment Filter Pills */}
          <select
            value={selectedSegmentFilter}
            onChange={(e) => setSelectedSegmentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">{isAr ? 'جميع القطاعات والتصنيفات' : 'All Segments'}</option>
            {segments.map((seg) => (
              <option key={seg.id} value={seg.id}>
                {seg.nameAr}
              </option>
            ))}
          </select>

          {/* Pricing Strategy Filter */}
          <select
            value={selectedStrategyFilter}
            onChange={(e) => setSelectedStrategyFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">{isAr ? 'جميع استراتيجيات التسعير' : 'All Pricing Strategies'}</option>
            {PRICING_STRATEGIES.map((st) => (
              <option key={st.id} value={st.id}>
                {isAr ? st.labelAr : st.labelEn}
              </option>
            ))}
          </select>

          <span className="text-xs font-bold text-slate-500 hidden sm:inline">
            {isAr ? 'عرض' : 'Showing'} <strong className="text-blue-600">{filteredClients.length}</strong>{' '}
            {isAr ? 'من أصل' : 'of'} <strong className="text-slate-800">{clients.length}</strong>
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {canBulkImport && (
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition cursor-pointer border border-slate-200">
                <UploadCloud className="w-4 h-4 text-slate-500" />
                <span>{isAr ? 'استيراد عملاء (CSV)' : 'Import CSV'}</span>
                <input type="file" accept=".csv" onChange={handleParseCsvFile} className="hidden" />
              </label>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition border border-transparent hover:border-slate-200 cursor-pointer"
                title={isAr ? 'تحميل نموذج قالب CSV فارغ للاستيراد' : 'Download blank CSV template'}
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={handleExportClients}
            disabled={clients.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition disabled:opacity-50 border border-slate-200 cursor-pointer"
            title={isAr ? 'تصدير البيانات إلى ملف CSV' : 'Export to CSV'}
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>{isAr ? 'تصدير' : 'Export'}</span>
          </button>

          {canCreate && (
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة عميل جديد' : 'New Client'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table / Directory */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-bold">
            {isAr ? 'جاري تحميل سجل العملاء...' : 'Loading clients...'}
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <UserCheck className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-slate-500 font-bold">
              {clients.length === 0
                ? (isAr ? 'لا يوجد عملاء مسجلين بعد. ابدأ بإضافة عميل جديد أو استيراد العملاء عبر CSV.' : 'No clients found.')
                : (isAr ? 'لا توجد نتائج تطابق شروط البحث' : 'No matching clients found')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 text-start">{isAr ? 'كود العميل' : 'Code'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'العميل والشهرة' : 'Client Name'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'القطاع' : 'Segment'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'التسعير والسداد' : 'Pricing & Terms'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'حد الائتمان' : 'Credit Limit'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'آخر تسليم فعلي' : 'Latest Delivery'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'الفروع' : 'Branches'}</th>
                  <th className="py-3.5 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredClients.map((client) => {
                  const seg = segmentMap[client.segmentId];
                  const IconCmp = seg ? SEGMENT_ICON_MAP[seg.icon] || Layers : UserCheck;
                  const isExpanded = expandedClientId === client.id;
                  const mainBranch = (client.branches || []).find((b) => b.isMain) || (client.branches || [])[0] || {};

                  return (
                    <React.Fragment key={client.id}>
                      <tr className="hover:bg-slate-50/70 transition group">
                        {/* Client Code */}
                        <td className="py-3.5 px-4 font-mono font-bold text-xs text-blue-700 whitespace-nowrap">
                          {client.id}
                        </td>

                        {/* Name & Legal */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                              {client.logo ? (
                                <img
                                  src={client.logo}
                                  alt={client.tradeNameAr}
                                  className="w-full h-full object-contain p-0.5"
                                />
                              ) : (
                                <IconCmp className="w-4 h-4 text-slate-500" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-black text-slate-800 text-sm truncate">
                                {client.tradeNameAr || client.name}
                              </span>
                              {client.tradeNameEn && (
                                <span className="text-xs text-slate-400 font-semibold truncate" dir="ltr">
                                  {client.tradeNameEn}
                                </span>
                              )}
                              {canViewTaxCard && client.taxCardNumber && (
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                                  <span className="text-[10px] font-bold text-slate-400">{isAr ? 'ضريبي:' : 'VAT:'}</span>
                                  <VatNumberDisplay value={client.taxCardNumber} className="text-xs font-mono font-bold" />
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Segment Badge (Logo replaces icon if present) */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {seg ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold shadow-sm"
                              style={{
                                backgroundColor: `${seg.color}15`,
                                color: seg.color,
                                border: `1px solid ${seg.color}30`
                              }}
                            >
                              {client.logo ? (
                                <img
                                  src={client.logo}
                                  alt=""
                                  className="w-4 h-4 object-contain rounded-xs shrink-0"
                                />
                              ) : (
                                <IconCmp className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{seg.nameAr}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">
                              {client.segmentId || '—'}
                            </span>
                          )}
                        </td>

                        {/* Pricing & Settlement */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-700">
                              {PRICING_STRATEGIES.find((s) => s.id === client.pricingStrategy)?.labelAr || client.pricingStrategy}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              {SETTLEMENT_MODES.find((m) => m.id === client.settlementMode)?.labelAr || client.settlementMode}
                            </span>
                          </div>
                        </td>

                        {/* Credit Limit */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {canViewCreditLimit ? (
                            Number(client.creditLimit) === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                {isAr ? 'مفتوح (غير مقيد)' : 'Unlimited'}
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-slate-800 text-xs">
                                {Number(client.creditLimit).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">••••••</span>
                          )}
                        </td>

                        {/* Latest Activity (Only Updated on Delivery) */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {client.latestActivityOn ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold">
                              <Clock className="w-3.5 h-3.5 text-blue-500" />
                              <span>{new Date(client.latestActivityOn).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              {isAr ? 'لا يوجد نشاط تسليم مسجل بعد' : 'No delivery recorded yet'}
                            </span>
                          )}
                        </td>

                        {/* Branches Quick Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <button
                            onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-600" />
                            <span>{(client.branches || []).length} {isAr ? 'فرع' : 'branch(es)'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {/* Row Comments Action */}
                            <RowCommentButton
                              docId={client.id}
                              docNumber={client.id}
                              tab="clients"
                              module="master_data"
                            />

                            {canEdit && (
                              <button
                                onClick={() => handleOpenEditModal(client)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title={isAr ? 'تعديل العميل' : 'Edit Client'}
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}

                            {canDelete && (
                              <button
                                onClick={() => setDeleteConfirmClient(client)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title={isAr ? 'حذف العميل' : 'Delete Client'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Branches Detail Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-b border-slate-200 animate__animated animate__fadeIn">
                          <td colSpan={8} className="p-4">
                            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-inner space-y-3">
                              {/* Client Operational & Communication Banner */}
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-4 flex-wrap">
                                  {/* Phones */}
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                                    <span className="font-bold text-slate-700">{isAr ? 'الهواتف:' : 'Phones:'}</span>
                                    <span className="font-mono text-slate-600">
                                      {(client.phones && client.phones.length > 0)
                                        ? client.phones.join(' • ')
                                        : (client.phone || '—')}
                                    </span>
                                  </div>

                                  {/* Emails */}
                                  {((client.emails && client.emails.length > 0) || client.email) && (
                                    <div className="flex items-center gap-1.5">
                                      <Mail className="w-3.5 h-3.5 text-purple-600" />
                                      <span className="font-bold text-slate-700">{isAr ? 'البريد:' : 'Emails:'}</span>
                                      <span className="font-mono text-slate-600">
                                        {(client.emails && client.emails.length > 0)
                                          ? client.emails.join(' • ')
                                          : client.email}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-4 flex-wrap">
                                  {/* Working Hours */}
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="font-bold text-slate-700">{isAr ? 'مواعيد العمل:' : 'Hours:'}</span>
                                    <span className="font-mono font-bold text-slate-600">
                                      {client.workingHoursFrom || '09:00'} - {client.workingHoursTo || '17:00'}
                                    </span>
                                  </div>

                                  {/* Weekly Holidays */}
                                  <div className="flex items-center gap-1.5">
                                    <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
                                    <span className="font-bold text-slate-700">{isAr ? 'العطلات:' : 'Holidays:'}</span>
                                    <span className="font-bold text-slate-600">
                                      {(client.weeklyHolidays && client.weeklyHolidays.length > 0)
                                        ? client.weeklyHolidays
                                            .map((h) => WEEK_DAYS.find((d) => d.id === h)?.labelAr || h)
                                            .join('، ')
                                        : (isAr ? 'لا توجد عطلات' : 'None')}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <h4 className="text-xs font-black text-slate-800 flex items-center gap-2">
                                  <MapPin className="w-4 h-4 text-blue-600" />
                                  <span>{isAr ? 'قائمة الفروع ومواقع التسليم المسجلة' : 'Registered Branches & Delivery Points'}</span>
                                </h4>
                                <span className="text-[11px] font-bold text-slate-400">
                                  {isAr ? 'الفرع الرئيسي محدد باللون الأزرق' : 'Main branch highlighted in blue'}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {(client.branches || []).map((b, idx) => (
                                  <div
                                    key={b.id || idx}
                                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                                      b.isMain
                                        ? 'bg-blue-50/50 border-blue-200 text-blue-950'
                                        : 'bg-slate-50 border-slate-200 text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-bold">
                                      <span className="flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                        <span>{b.nameAr}</span>
                                      </span>
                                      {b.isMain && (
                                        <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                          {isAr ? 'رئيسي' : 'Main'}
                                        </span>
                                      )}
                                    </div>

                                    {b.region && (
                                      <p className="text-slate-500 font-semibold">
                                        <strong className="text-slate-600">{isAr ? 'المنطقة:' : 'Region:'}</strong> {b.region}
                                      </p>
                                    )}

                                    {b.address && (
                                      <p className="text-slate-500">
                                        <strong className="text-slate-600">{isAr ? 'العنوان:' : 'Address:'}</strong> {b.address}
                                      </p>
                                    )}

                                    {b.contactPerson && (
                                      <p className="text-slate-500">
                                        <strong className="text-slate-600">{isAr ? 'المسؤول:' : 'Contact:'}</strong> {b.contactPerson}
                                      </p>
                                    )}

                                    <div className="flex items-center gap-3 pt-1 border-t border-slate-200/60 font-mono">
                                      {b.phone && (
                                        <span className="flex items-center gap-1 text-slate-600">
                                          <Phone className="w-3 h-3 text-slate-400" />
                                          <span>{b.phone}</span>
                                        </span>
                                      )}
                                      {b.mobile && (
                                        <span className="flex items-center gap-1 text-slate-600">
                                          <Smartphone className="w-3 h-3 text-slate-400" />
                                          <span>{b.mobile}</span>
                                        </span>
                                      )}
                                      {b.gpsCoordinates && (
                                        <a
                                          href={b.gpsCoordinates}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-blue-600 hover:underline flex items-center gap-1 ms-auto"
                                        >
                                          <Navigation className="w-3 h-3" />
                                          <span>{isAr ? 'موقع GPS' : 'Map'}</span>
                                        </a>
                                      )}
                                    </div>

                                    {b.useCustomSchedule ? (
                                      <div className="pt-1 border-t border-slate-200/60 text-[10px] text-amber-800 font-bold">
                                        <span>{isAr ? 'مواعيد خاصة:' : 'Custom hours:'} {b.workingHoursFrom || '09:00'} - {b.workingHoursTo || '17:00'}</span>
                                        {b.weeklyHolidays && b.weeklyHolidays.length > 0 && (
                                          <span className="ms-1">({b.weeklyHolidays.map((h) => WEEK_DAYS.find((d) => d.id === h)?.labelAr || h).join('، ')})</span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="pt-1 border-t border-slate-200/60 text-[10px] text-slate-400 font-semibold">
                                        <span>{isAr ? 'مواعيد العمل والعطلات: موحدة مع العميل' : 'Standard client operational schedule'}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CREATE / EDIT CLIENT MODAL                                                */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate__animated animate__fadeInUp animate__faster">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
                  <UserCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base">
                    {editingClient ? (isAr ? 'تعديل بيانات العميل' : 'Edit Client Profile') : (isAr ? 'إضافة عميل جديد' : 'New Client Registration')}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {formData.id} — {isAr ? 'تسجيل متكامل للبيانات الضريبية والفروع واستراتيجية التسعير' : 'Comprehensive customer record and shipping hubs'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="bg-slate-100 px-6 py-2 border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveFormTab('profile')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeFormTab === 'profile' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>{isAr ? 'البيانات الأساسية والتسعير' : 'Profile & Pricing'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFormTab('branches')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeFormTab === 'branches' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>
                  {isAr ? 'الفروع ومواقع التسليم' : 'Branches & Locations'} ({(formData.branches || []).length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFormTab('documents')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeFormTab === 'documents' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>
                  {isAr ? 'المستندات والعقود' : 'Documents & Contracts'} ({(formData.attachments || []).length})
                </span>
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSaveClient} className="p-6 overflow-y-auto space-y-4 flex-grow">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* TAB 1: Profile & Pricing */}
              {activeFormTab === 'profile' && (
                <div className="space-y-4">
                  {/* Client Logo Upload Section */}
                  <div className="flex items-center gap-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="relative w-16 h-16 rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white flex items-center justify-center overflow-hidden shrink-0 group shadow-2xs">
                      {formData.logo ? (
                        <img
                          src={formData.logo}
                          alt={formData.tradeNameAr || 'Logo'}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : formData.segmentId && segmentMap[formData.segmentId] ? (
                        (() => {
                          const ActiveIcon = SEGMENT_ICON_MAP[segmentMap[formData.segmentId].icon] || Layers;
                          return <ActiveIcon className="w-8 h-8 text-slate-400 group-hover:text-blue-500 transition" />;
                        })()
                      ) : (
                        <Building2 className="w-8 h-8 text-slate-300" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="text-xs font-bold text-slate-800">
                          {isAr ? 'شعار العميل (Logo)' : 'Client Brand Logo'}
                        </label>
                        {formData.logo && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                            {isAr ? 'محسن ومضغوط' : 'Optimized'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2">
                        {isAr
                          ? 'يتم ضغط الشعار تلقائياً ليحل محل أيقونة القطاع في التباديل والتقارير'
                          : 'Auto-resized to replace the segment icon across the ERP'}
                      </p>

                      <div className="flex items-center gap-2">
                        <label className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-1.5 shadow-2xs">
                          <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                          <span>{formData.logo ? (isAr ? 'تغيير الشعار' : 'Change Logo') : (isAr ? 'رفع شعار العميل' : 'Upload Logo')}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                        </label>

                        {formData.logo && (
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, logo: '' })}
                            className="px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-bold transition cursor-pointer"
                          >
                            {isAr ? 'إزالة الشعار' : 'Remove Logo'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 1: Names */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'اسم الشهرة التجاري (عربي) *' : 'Trade Name (Ar) *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.tradeNameAr}
                        onChange={(e) => setFormData({ ...formData, tradeNameAr: e.target.value })}
                        placeholder={isAr ? 'مثال: شركة التوفيق للتجارة' : 'e.g. Al-Tawfeeq Trading'}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'اسم الشهرة التجاري (إنجليزي)' : 'Trade Name (En)'}
                      </label>
                      <input
                        type="text"
                        value={formData.tradeNameEn}
                        onChange={(e) => setFormData({ ...formData, tradeNameEn: e.target.value })}
                        placeholder="e.g. Al-Tawfeeq Trading Co."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-left font-sans"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Row 2: Legal Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isAr ? 'اسم الممول القانوني (كما في البطاقة الضريبية)' : 'Taxpayer Legal Name'}
                    </label>
                    <input
                      type="text"
                      value={formData.legalName}
                      onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                      placeholder={isAr ? 'الاسم القانوني الكامل المسجل بالضرائب' : 'Official registered corporate entity'}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Row 3: Segment & Pricing Strategy */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'قطاع / تصنيف العميل *' : 'Client Market Segment *'}
                      </label>
                      <select
                        required
                        value={formData.segmentId}
                        onChange={(e) => setFormData({ ...formData, segmentId: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{isAr ? '-- اختر القطاع --' : '-- Select Segment --'}</option>
                        {segments.map((seg) => (
                          <option key={seg.id} value={seg.id}>
                            {seg.nameAr} ({seg.nameEn || seg.id})
                          </option>
                        ))}
                      </select>

                      {formData.segmentId && segmentMap[formData.segmentId] && (() => {
                        const activeSeg = segmentMap[formData.segmentId];
                        const ActiveIcon = SEGMENT_ICON_MAP[activeSeg.icon] || Layers;
                        return (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold shadow-2xs"
                              style={{
                                backgroundColor: `${activeSeg.color}15`,
                                color: activeSeg.color,
                                border: `1px solid ${activeSeg.color}35`
                              }}
                            >
                              {formData.logo ? (
                                <img src={formData.logo} alt="" className="w-3.5 h-3.5 object-contain rounded-xs" />
                              ) : (
                                <ActiveIcon className="w-3.5 h-3.5" />
                              )}
                              <span>{activeSeg.nameAr}</span>
                            </span>
                            {activeSeg.description && (
                              <span className="text-[11px] text-slate-400 truncate max-w-xs">
                                {activeSeg.description}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'استراتيجية التسعير المعتمدة *' : 'Pricing Strategy *'}
                      </label>
                      <select
                        required
                        value={formData.pricingStrategy}
                        onChange={(e) => setFormData({ ...formData, pricingStrategy: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {PRICING_STRATEGIES.map((st) => (
                          <option key={st.id} value={st.id}>
                            {isAr ? st.labelAr : st.labelEn}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 4: Tax & Legal */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'البطاقة الضريبية (9 أرقام)' : 'Tax Card ID'}
                      </label>
                      <VatNumberInput
                        value={formData.taxCardNumber}
                        onChange={(val) => setFormData({ ...formData, taxCardNumber: val })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'السجل التجاري' : 'Commercial Register'}
                      </label>
                      <input
                        type="text"
                        value={formData.commercialRegister}
                        onChange={(e) => setFormData({ ...formData, commercialRegister: e.target.value })}
                        placeholder="e.g. 109844"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'مأمورية الضرائب' : 'Tax District'}
                      </label>
                      <input
                        type="text"
                        value={formData.taxDistrict}
                        onChange={(e) => setFormData({ ...formData, taxDistrict: e.target.value })}
                        placeholder={isAr ? 'مثال: مأمورية 6 أكتوبر' : 'e.g. 6th October District'}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Row 5: Financial Terms & Credit Limit */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'طريقة السداد المعتمدة' : 'Settlement Mode'}
                      </label>
                      <select
                        value={formData.settlementMode}
                        onChange={(e) => setFormData({ ...formData, settlementMode: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                      >
                        {SETTLEMENT_MODES.map((sm) => (
                          <option key={sm.id} value={sm.id}>
                            {isAr ? sm.labelAr : sm.labelEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'حد الائتمان (بالجنيه EGP)' : 'Credit Limit (EGP)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.creditLimit}
                        onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-blue-700 font-bold mt-1 block">
                        {Number(formData.creditLimit) === 0
                          ? (isAr ? '💡 0 تعني: حد ائتماني مفتوح وغير مقيد' : '💡 0 means Unlimited / No Credit Limit')
                          : (isAr ? `الحد الأقصى للمديونية: ${Number(formData.creditLimit).toLocaleString()} ج.م` : `Cap: ${Number(formData.creditLimit).toLocaleString()} EGP`)}
                      </span>
                    </div>
                  </div>

                  {/* Row 6: Multiple Phones & Emails */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    {/* Multiple Phones */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'أرقام هواتف التواصل (متعدد)' : 'Contact Phone Numbers (Multiple)'}
                      </label>
                      <div className="flex items-center gap-1.5 mb-2">
                        <input
                          type="text"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPhone();
                            }
                          }}
                          placeholder={isAr ? 'أدخل رقم الهاتف واضغط إضافة...' : 'Add phone and press Enter...'}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddPhone}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                        {(formData.phones || []).map((p, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 shadow-2xs"
                          >
                            <Phone className="w-3 h-3 text-blue-500" />
                            <span>{p}</span>
                            {idx === 0 && (
                              <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.2 rounded font-bold">
                                {isAr ? 'رئيسي' : 'Primary'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemovePhone(idx)}
                              className="text-slate-400 hover:text-rose-600 transition ms-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {(formData.phones || []).length === 0 && (
                          <span className="text-[11px] text-slate-400 italic">
                            {isAr ? 'لم يتم إضافة أرقام هواتف بعد' : 'No phone numbers added yet'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Multiple Emails */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {isAr ? 'عناوين البريد الإلكتروني (متعدد)' : 'Email Addresses (Multiple)'}
                      </label>
                      <div className="flex items-center gap-1.5 mb-2">
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddEmail();
                            }
                          }}
                          placeholder={isAr ? 'أدخل البريد واضغط إضافة...' : 'Add email and press Enter...'}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddEmail}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                        {(formData.emails || []).map((em, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700 shadow-2xs"
                          >
                            <Mail className="w-3 h-3 text-blue-500" />
                            <span>{em}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(idx)}
                              className="text-slate-400 hover:text-rose-600 transition ms-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {(formData.emails || []).length === 0 && (
                          <span className="text-[11px] text-slate-400 italic">
                            {isAr ? 'لم يتم إضافة بريد إلكتروني بعد' : 'No email addresses added yet'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 7: Operational Schedule (Weekly Holidays & Working Hours) */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-800">
                          {isAr ? 'مواعيد العمل والعطلات الأسبوعية للعميل' : 'Client Operational Schedule & Holidays'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {isAr ? 'المواعيد القياسية لفروع العميل' : 'Standard defaults for client branches'}
                      </span>
                    </div>

                    {/* Holidays Days Checkbox Group */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                        {isAr ? 'أيام العطلة الأسبوعية (لا يتم جدولة تسليم فيها):' : 'Weekly Holidays (No deliveries scheduled):'}
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {WEEK_DAYS.map((day) => {
                          const isSelected = (formData.weeklyHolidays || []).includes(day.id);
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() => handleToggleWeeklyHoliday(day.id)}
                              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              <span>{isAr ? day.labelAr : day.labelEn}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Working Hours From / To */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {isAr ? 'ساعات العمل من:' : 'Working Hours From:'}
                        </label>
                        <input
                          type="time"
                          value={formData.workingHoursFrom || '09:00'}
                          onChange={(e) => setFormData({ ...formData, workingHoursFrom: e.target.value })}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {isAr ? 'ساعات العمل حتى:' : 'Working Hours To:'}
                        </label>
                        <input
                          type="time"
                          value={formData.workingHoursTo || '17:00'}
                          onChange={(e) => setFormData({ ...formData, workingHoursTo: e.target.value })}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isAr ? 'ملاحظات وتوجيهات خاصة بالعميل' : 'Customer Notes'}
                    </label>
                    <textarea
                      rows={2}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder={isAr ? 'تعليمات الاستلام، مواعيد التفريغ، مندوب المبيعات المختص...' : 'Delivery instructions, work hours...'}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: Branches & Shipping Points */}
              {activeFormTab === 'branches' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        {isAr ? 'الفروع ومواقع الاستلام والتفريغ' : 'Delivery Branches & Locations'}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {isAr
                          ? 'يمكن للعميل امتلاك فرع واحد أو عدة فروع تسليم مستقلة'
                          : 'Configure individual branch receiving points, contacts, and GPS links'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddBranch}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAr ? 'إضافة فرع جديد' : 'Add Branch'}</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(formData.branches || []).map((branch, bIdx) => (
                      <div
                        key={branch.id || bIdx}
                        className={`p-4 rounded-2xl border space-y-3 transition ${
                          branch.isMain
                            ? 'bg-blue-50/40 border-blue-200 shadow-sm'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-mono font-bold text-xs">
                              {bIdx + 1}
                            </span>
                            <span className="font-bold text-slate-800 text-xs">
                              {branch.nameAr || `Branch #${bIdx + 1}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={branch.isMain || false}
                                onChange={(e) => handleUpdateBranch(bIdx, 'isMain', e.target.checked)}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span>{isAr ? 'الفرع الرئيسي' : 'Main Branch'}</span>
                            </label>

                            {(formData.branches || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBranch(bIdx)}
                                className="text-rose-500 hover:text-rose-700 p-1 rounded-lg transition"
                                title={isAr ? 'حذف الفرع' : 'Remove Branch'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Branch Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              {isAr ? 'اسم الفرع *' : 'Branch Name *'}
                            </label>
                            <input
                              type="text"
                              required
                              value={branch.nameAr}
                              onChange={(e) => handleUpdateBranch(bIdx, 'nameAr', e.target.value)}
                              placeholder={isAr ? 'مثال: فرع المعادي' : 'e.g. Maadi Branch'}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              {isAr ? 'المنطقة / المحافظة' : 'Region / City'}
                            </label>
                            <input
                              type="text"
                              value={branch.region}
                              onChange={(e) => handleUpdateBranch(bIdx, 'region', e.target.value)}
                              placeholder={isAr ? 'مثال: القاهرة' : 'e.g. Cairo'}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            {isAr ? 'العنوان التفصيلي' : 'Street Address'}
                          </label>
                          <input
                            type="text"
                            value={branch.address}
                            onChange={(e) => handleUpdateBranch(bIdx, 'address', e.target.value)}
                            placeholder={isAr ? 'الشارع، رقم العقار، المعلم المميز...' : 'Full delivery address...'}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              {isAr ? 'مسؤول الاستلام' : 'Contact Person'}
                            </label>
                            <input
                              type="text"
                              value={branch.contactPerson}
                              onChange={(e) => handleUpdateBranch(bIdx, 'contactPerson', e.target.value)}
                              placeholder={isAr ? 'اسم المستلم' : 'Receiver name'}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              {isAr ? 'الهاتف' : 'Phone'}
                            </label>
                            <input
                              type="text"
                              value={branch.phone}
                              onChange={(e) => handleUpdateBranch(bIdx, 'phone', e.target.value)}
                              placeholder="010XXXXXXXX"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              {isAr ? 'موقع الخريطة (GPS Link)' : 'Google Maps Link'}
                            </label>
                            <input
                              type="text"
                              value={branch.gpsCoordinates}
                              onChange={(e) => handleUpdateBranch(bIdx, 'gpsCoordinates', e.target.value)}
                              placeholder="https://maps.google.com/?q=..."
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                              dir="ltr"
                            />
                          </div>
                        </div>

                        {/* Branch Schedule & Holidays Standardization Toggle */}
                        <div className="pt-2 border-t border-slate-200/60 space-y-2">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!branch.useCustomSchedule}
                              onChange={(e) => handleUpdateBranch(bIdx, 'useCustomSchedule', !e.target.checked)}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>
                              {isAr
                                ? 'استخدام عطلات ومواعيد عمل العميل القياسية الموحدة'
                                : 'Inherit standard client operational schedule & holidays'}
                            </span>
                          </label>

                          {branch.useCustomSchedule && (
                            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5">
                              <div>
                                <span className="block text-[11px] font-bold text-slate-600 mb-1">
                                  {isAr ? 'عطلات هذا الفرع الخاصة:' : 'Branch-Specific Holidays:'}
                                </span>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {WEEK_DAYS.map((day) => {
                                    const isSelected = (branch.weeklyHolidays || []).includes(day.id);
                                    return (
                                      <button
                                        key={day.id}
                                        type="button"
                                        onClick={() => handleToggleBranchHoliday(bIdx, day.id)}
                                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                                          isSelected
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                      >
                                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                        <span>{isAr ? day.labelAr : day.labelEn}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                    {isAr ? 'ساعات العمل من:' : 'Working Hours From:'}
                                  </span>
                                  <input
                                    type="time"
                                    value={branch.workingHoursFrom || '09:00'}
                                    onChange={(e) => handleUpdateBranch(bIdx, 'workingHoursFrom', e.target.value)}
                                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                                  />
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                    {isAr ? 'حتى:' : 'Working Hours To:'}
                                  </span>
                                  <input
                                    type="time"
                                    value={branch.workingHoursTo || '17:00'}
                                    onChange={(e) => handleUpdateBranch(bIdx, 'workingHoursTo', e.target.value)}
                                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: Documents & Contracts */}
              {activeFormTab === 'documents' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm mb-1">
                      {isAr ? 'مستندات وعقود العميل' : 'Client Documents & Contracts Vault'}
                    </h4>
                    <p className="text-xs text-slate-500 mb-3">
                      {isAr
                        ? 'إرفاق صور البطاقة الضريبية، السجل التجاري، وعقود التوريد الموقعة'
                        : 'Upload tax ID scans, commercial registry, and formal agreements'}
                    </p>

                    <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-blue-50/50 transition">
                      <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-xs font-bold text-slate-700">
                        {isAr ? 'انقر أو اسحب ملفات المستندات للرفع' : 'Click or drag documents to upload'}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-1">
                        PDF, PNG, JPG {isAr ? 'بحد أقصى' : 'up to'} 5MB
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Uploaded Attachments List */}
                  {(formData.attachments || []).length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-black text-slate-700">
                        {isAr ? 'الملفات المرفقة حالياً:' : 'Attached Files:'}
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(formData.attachments || []).map((att) => (
                          <div
                            key={att.id}
                            className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <span className="truncate font-semibold text-slate-700">{att.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {att.dataUrl && (
                                <button
                                  type="button"
                                  onClick={() => openBase64Document(att.dataUrl, att.type)}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition"
                                  title={isAr ? 'معاينة' : 'Preview'}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(att.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                title={isAr ? 'حذف' : 'Remove'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition"
                >
                  {isAr ? 'حفظ العميل' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BULK CSV IMPORT PREVIEW MODAL                                             */}
      {/* ========================================================================= */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate__animated animate__fadeInUp animate__faster">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UploadCloud className="w-6 h-6 text-blue-400" />
                <div>
                  <h3 className="font-black text-base">
                    {isAr ? 'معاينة استيراد العملاء الجماعي' : 'Bulk Clients Import Preview'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {isAr ? 'مراجعة السجلات والتحقق من التكرارات وصحة البيانات قبل الحفظ' : 'Audit rows and duplicate locks before commit'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-3">
                <span className="text-slate-700">
                  {isAr ? 'إجمالي السجلات:' : 'Total Records:'} <strong>{importStats.total}</strong>
                </span>
                <span className="text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  {isAr ? 'صالحة للاستيراد:' : 'Valid:'} {importStats.valid}
                </span>
                {importStats.invalid > 0 && (
                  <span className="text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
                    {isAr ? 'مرفوضة / تكرار:' : 'Conflicts:'} {importStats.invalid}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isAr ? 'تحميل قالب CSV الاستيراد' : 'Download Template'}</span>
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-grow max-h-[60vh]">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-2 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-2 px-3 text-start">{isAr ? 'الكود' : 'Code'}</th>
                    <th className="py-2 px-3 text-start">{isAr ? 'اسم العميل' : 'Client Name'}</th>
                    <th className="py-2 px-3 text-start">{isAr ? 'القطاع' : 'Segment'}</th>
                    <th className="py-2 px-3 text-start">{isAr ? 'البطاقة الضريبية' : 'Tax Card'}</th>
                    <th className="py-2 px-3 text-start">{isAr ? 'الهاتف' : 'Phone'}</th>
                    <th className="py-2 px-3 text-start">{isAr ? 'سبب التعارض' : 'Conflict Reason'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {importRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={row.isValid ? 'bg-emerald-50/30 text-slate-800' : 'bg-rose-50/60 text-rose-900'}
                    >
                      <td className="py-2 px-3 whitespace-nowrap">
                        {row.isValid ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            {isAr ? 'صالح' : 'Valid'}
                          </span>
                        ) : (
                          <span className="text-rose-600 font-bold flex items-center gap-1">
                            <X className="w-3.5 h-3.5 stroke-[3]" />
                            {isAr ? 'مرفوض' : 'Invalid'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono">{row.code}</td>
                      <td className="py-2 px-3 font-bold">{row.tradeNameAr}</td>
                      <td className="py-2 px-3">
                        <select
                          value={row.segmentId || ''}
                          onChange={(e) => handleUpdateImportRowSegment(idx, e.target.value)}
                          className={`px-2 py-1 text-xs rounded-lg border font-bold cursor-pointer ${
                            !row.segmentId
                              ? 'border-rose-400 bg-rose-50 text-rose-700 ring-1 ring-rose-300'
                              : 'border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          <option value="">{isAr ? '-- حدد القطاع --' : '-- Select Segment --'}</option>
                          {segments.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nameAr}
                            </option>
                          ))}
                        </select>
                        {row.segmentRaw && !row.segmentId && (
                          <span className="block text-[10px] text-rose-600 font-mono mt-0.5" title="Unmatched raw text in CSV">
                            ⚠️ {row.segmentRaw}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono">{row.taxCardNumber || '—'}</td>
                      <td className="py-2 px-3 font-mono">
                        {(row.phones && row.phones.length > 0)
                          ? row.phones.join(', ')
                          : (row.branchPhone || row.phone || '—')}
                      </td>
                      <td className="py-2 px-3 text-rose-700 text-[11px] font-bold">
                        {row.errorReason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 transition"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={importStats.valid === 0 || isCommittingImport}
                onClick={handleCommitBulkImport}
                className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isCommittingImport
                    ? (isAr ? 'جاري الاستيراد...' : 'Importing...')
                    : (isAr ? `اعتماد (${importStats.valid}) سجل صالح` : `Commit (${importStats.valid}) Valid`)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-800 text-base">
              {isAr ? 'تأكيد حذف العميل' : 'Confirm Client Deletion'}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isAr
                ? `هل أنت متأكد من رغبتك في حذف العميل "${deleteConfirmClient.tradeNameAr || deleteConfirmClient.id}" وجميع الفروع التابعة له نهائياً؟`
                : `Are you sure you want to permanently delete client "${deleteConfirmClient.tradeNameAr || deleteConfirmClient.id}"?`}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmClient(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                onClick={() => handleDeleteClient(deleteConfirmClient)}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-rose-700 transition"
              >
                {isAr ? 'تأكيد الحذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
