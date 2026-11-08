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
  Image as ImageIcon,
  RefreshCw,
  GitMerge,
  SkipForward,
  HelpCircle,
  SlidersHorizontal,
  ListFilter,
  CheckSquare,
  Filter,
  RotateCcw
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

// Helper to normalize Arabic text (collapses hamzas, taa marbuta, yaa, and whitespace)
export const normalizeArText = (t) =>
  String(t || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

// Helper to resolve raw pricing strategy input from CSV
export const resolvePricingStrategy = (rawText) => {
  if (!rawText) return null;
  const t = normalizeArText(rawText);
  if (!t) return null;

  if (
    t === 'wholesalers' ||
    t === 'wholesale' ||
    t.includes('جمله') ||
    t.includes('اسعار جمله') ||
    t === 'رسمي'
  ) {
    return 'wholesalers';
  }

  if (
    t === 'retail' ||
    t.includes('تجزئه') ||
    t.includes('اسعار تجزئه')
  ) {
    return 'retail';
  }

  if (
    t === 'special_pricing' ||
    t === 'special' ||
    t.includes('خاصه') ||
    t.includes('خاص') ||
    t.includes('اسعار خاصه') ||
    t.includes('عقود') ||
    t.includes('تفاوض')
  ) {
    return 'special_pricing';
  }

  return null;
};

// Helper to determine default pricing strategy from client segment
// Rule:
// Wholesale (جملة) or Serga / Attara (سرجة \ عطارة) -> wholesalers
// Retail (تجزئة) -> retail
// Any other valid segment (سلاسل, مطبخ, اون لاين, تصدير, اخرين, etc.) -> special_pricing
export const resolveDefaultPricingStrategy = (segmentTextOrId, segmentsList = []) => {
  if (!segmentTextOrId) return '';
  const cleanRaw = String(segmentTextOrId).trim();
  if (!cleanRaw) return '';

  const normRaw = normalizeArText(cleanRaw);
  const matchedSeg = (segmentsList || []).find(
    (s) =>
      s.id === cleanRaw ||
      s.nameAr === cleanRaw ||
      s.nameEn?.toLowerCase() === cleanRaw.toLowerCase() ||
      normalizeArText(s.nameAr) === normRaw ||
      normalizeArText(s.nameEn) === normRaw
  );

  const testNameAr = matchedSeg?.nameAr ? normalizeArText(matchedSeg.nameAr) : normRaw;
  const testId = (matchedSeg?.id || cleanRaw).toLowerCase();

  // Rule 1: Wholesale (جملة) or Serga / Attara (سرجة \ عطارة) -> wholesalers
  if (
    testNameAr.includes('جمله') ||
    testId.includes('wholesale') ||
    testNameAr.includes('سرجه') ||
    testNameAr.includes('عطاره') ||
    testId.includes('attara') ||
    testId.includes('serga')
  ) {
    return 'wholesalers';
  }

  // Rule 2: Retail (تجزئة) -> retail
  if (
    testNameAr.includes('تجزئه') ||
    testId.includes('retail')
  ) {
    return 'retail';
  }

  // Rule 3: Any other valid segment -> special_pricing
  return 'special_pricing';
};

// RFC 4180 Streaming Lexer with Inline Quote Tolerance
export const parseRfcCsv = (rawText) => {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];

    if (char === '"') {
      if (!inQuotes) {
        if (currentField.trim() === '') {
          inQuotes = true;
          currentField = '';
        } else {
          currentField += '"';
        }
      } else {
        const nextChar = i + 1 < len ? text[i + 1] : null;
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else if (
          nextChar === ',' ||
          nextChar === '\r' ||
          nextChar === '\n' ||
          nextChar === null
        ) {
          inQuotes = false;
        } else {
          currentField += '"';
        }
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && i + 1 < len && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      currentField = '';

      const hasContent = currentRow.some((c) => c.trim().length > 0);
      if (hasContent && !currentRow[0]?.trim()?.startsWith('#')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    const hasContent = currentRow.some((c) => c.trim().length > 0);
    if (hasContent && !currentRow[0]?.trim()?.startsWith('#')) {
      rows.push(currentRow);
    }
  }

  return rows;
};

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
  const [rawImportRows, setRawImportRows] = useState([]);
  const [importStats, setImportStats] = useState({
    totalClients: 0,
    totalBranchRows: 0,
    newClients: 0,
    existingClients: 0,
    requiresReview: 0,
    readyToCommit: 0,
    invalid: 0
  });
  const [isCommittingImport, setIsCommittingImport] = useState(false);
  const [expandedImportClientIds, setExpandedImportClientIds] = useState(new Set());
  const [importViewMode, setImportViewMode] = useState('clients'); // 'clients' | 'raw_rows'
  const [isBatchToolOpen, setIsBatchToolOpen] = useState(false);
  const [batchToolField, setBatchToolField] = useState('segmentId');
  const [batchToolValue, setBatchToolValue] = useState('');
  const [batchToolTarget, setBatchToolTarget] = useState('filtered'); // 'filtered' | 'unassigned' | 'all'

  // Validator Filtering & Drilldown States
  const [validatorStatusFilter, setValidatorStatusFilter] = useState('all'); // 'all' | 'faulty' | 'review_required' | 'invalid' | 'ready'
  const [validatorIssueFilter, setValidatorIssueFilter] = useState('all'); // 'all' | 'missing_segment' | 'existing' | 'tax_conflict' | 'name_conflict'
  const [validatorSegmentFilter, setValidatorSegmentFilter] = useState('all'); // 'all' | 'unassigned' | segmentId
  const [validatorRawSegmentFilter, setValidatorRawSegmentFilter] = useState('all'); // 'all' | rawText
  const [validatorStrategyFilter, setValidatorStrategyFilter] = useState('all');
  const [validatorSettlementFilter, setValidatorSettlementFilter] = useState('all');
  const [validatorSearchQuery, setValidatorSearchQuery] = useState('');

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
    weeklyHolidays: ['friday'],
    workingHoursFrom: '',
    workingHoursTo: '',
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
      weeklyHolidays: Array.isArray(client.weeklyHolidays) ? client.weeklyHolidays : ['friday'],
      workingHoursFrom: client.workingHoursFrom || '',
      workingHoursTo: client.workingHoursTo || '',
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
      'notes',
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
      'الجمعة',
      '09:00',
      '17:00',
      'توريد صباحي فقط - تسليم بالمخزن الرئيسي',
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
      '',
      '',
      'مراجعة الفواتير مع الإدارة المالية أول كل شهر',
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

  const calculateImportStats = (rows) => {
    let totalBranchRows = 0;
    let newClients = 0;
    let existingClients = 0;
    let requiresReview = 0;
    let readyToCommit = 0;
    let invalid = 0;

    rows.forEach((r) => {
      totalBranchRows += (r.branches?.length || 1);
      if (r.isExisting) {
        existingClients++;
        if (r.action === 'review_required') {
          requiresReview++;
        } else if (r.action === 'replace' || r.action === 'merge') {
          if (r.isValid) readyToCommit++;
          else invalid++;
        }
      } else {
        newClients++;
        if (r.isValid && r.action !== 'skip') {
          readyToCommit++;
        } else if (!r.isValid) {
          invalid++;
        }
      }
    });

    return {
      totalClients: rows.length,
      totalBranchRows,
      newClients,
      existingClients,
      requiresReview,
      readyToCommit,
      invalid
    };
  };

  const handleUpdateImportRowSegment = (targetId, newSegmentId) => {
    const updated = importRows.map((row) => {
      if (row.id !== targetId) return row;
      const mod = { ...row };
      mod.segmentId = newSegmentId;
      if (newSegmentId) {
        const segObj = segments.find((s) => s.id === newSegmentId);
        mod.segmentRaw = segObj ? segObj.nameAr : newSegmentId;

        // Auto-update pricing strategy if it was auto-filled or empty (and no manual invalid raw text waiting)
        if (!mod.pricingStrategy || mod.isPricingAutoFilled) {
          const autoPricing = resolveDefaultPricingStrategy(newSegmentId, segments);
          if (autoPricing) {
            mod.pricingStrategy = autoPricing;
            mod.isPricingAutoFilled = true;
            mod.pricingStrategyRaw = '';
          }
        }

        if (mod.isExisting && mod.action === 'review_required') {
          mod.isValid = false;
          mod.errorReason = isAr
            ? 'مسجل مسبقاً — يرجى تحديد الإجراء (استبدال / دمج / تخطي)'
            : 'Existing record — select action (Replace / Merge / Skip)';
        } else if (!mod.pricingStrategy) {
          mod.isValid = false;
          mod.errorReason = isAr ? 'يرجى تحديد استراتيجية التسعير' : 'Pricing strategy is required';
        } else {
          mod.isValid = true;
          mod.errorReason = '';
        }
      } else {
        mod.isValid = false;
        mod.errorReason = isAr ? 'يرجى تحديد قطاع العميل' : 'Segment selection is required';
      }
      return mod;
    });
    setImportRows(updated);
    setImportStats(calculateImportStats(updated));
  };

  const handleUpdateImportRowPricingStrategy = (targetId, newStrategy) => {
    const updated = importRows.map((row) => {
      if (row.id !== targetId) return row;
      const mod = { ...row };
      mod.pricingStrategy = newStrategy;
      mod.pricingStrategyRaw = '';
      mod.isPricingAutoFilled = false;

      if (!newStrategy) {
        mod.isValid = false;
        mod.errorReason = isAr ? 'يرجى تحديد استراتيجية التسعير' : 'Pricing strategy is required';
      } else if (!mod.segmentId) {
        mod.isValid = false;
        mod.errorReason = isAr ? 'يرجى تحديد قطاع العميل' : 'Segment selection is required';
      } else if (mod.isExisting && mod.action === 'review_required') {
        mod.isValid = false;
        mod.errorReason = isAr
          ? 'مسجل مسبقاً — يرجى تحديد الإجراء (استبدال / دمج / تخطي)'
          : 'Existing record — select action (Replace / Merge / Skip)';
      } else {
        mod.isValid = true;
        mod.errorReason = '';
      }
      return mod;
    });
    setImportRows(updated);
    setImportStats(calculateImportStats(updated));
  };

  const handleUpdateRecordAction = (targetId, newAction) => {
    const updated = importRows.map((row) => {
      if (row.id !== targetId) return row;
      const mod = { ...row };
      mod.action = newAction;
      if (newAction === 'skip') {
        mod.isValid = true;
        mod.errorReason = '';
      } else if (!mod.segmentId) {
        mod.isValid = false;
        mod.errorReason = isAr ? 'يرجى تحديد قطاع العميل' : 'Segment selection is required';
      } else {
        mod.isValid = true;
        mod.errorReason = '';
      }
      return mod;
    });
    setImportRows(updated);
    setImportStats(calculateImportStats(updated));
  };

  const handleBatchSetExistingAction = (targetAction) => {
    const updated = importRows.map((row) => {
      if (!row.isExisting) return row;
      const hasUnmappedSegment = !row.segmentId;
      return {
        ...row,
        action: targetAction,
        isValid: targetAction === 'skip' ? true : !hasUnmappedSegment,
        errorReason:
          targetAction === 'skip'
            ? ''
            : hasUnmappedSegment
            ? (isAr ? 'يرجى تحديد قطاع العميل' : 'Segment selection is required')
            : ''
      };
    });
    setImportRows(updated);
    setImportStats(calculateImportStats(updated));
  };

  const handleDeleteImportRow = (targetId) => {
    const updated = importRows.filter((r) => r.id !== targetId);
    setImportRows(updated);
    setImportStats(calculateImportStats(updated));
  };

  const handleToggleExpandBranches = (clientKey) => {
    const next = new Set(expandedImportClientIds);
    if (next.has(clientKey)) {
      next.delete(clientKey);
    } else {
      next.add(clientKey);
    }
    setExpandedImportClientIds(next);
  };

  // Dynamic Unique Raw Segments in Uploaded CSV
  const uniqueRawSegmentsInCsv = useMemo(() => {
    const rawSet = new Set();
    importRows.forEach((r) => {
      const seg = (r.segmentRaw || '').trim();
      if (seg) rawSet.add(seg);
    });
    return Array.from(rawSet).sort();
  }, [importRows]);

  // Derived Faulty / Issue Counts
  const validatorCounters = useMemo(() => {
    let faulty = 0;
    let review = 0;
    let invalid = 0;
    let ready = 0;

    importRows.forEach((r) => {
      const isFaulty = !r.isValid || r.action === 'review_required' || !r.segmentId || !r.pricingStrategy || Boolean(r.pricingStrategyRaw) || Boolean(r.errorReason);
      if (isFaulty) faulty++;
      if (r.action === 'review_required') review++;
      if (!r.isValid && r.action !== 'review_required') invalid++;
      if (r.isValid && r.action !== 'review_required' && r.action !== 'skip') ready++;
    });

    return {
      all: importRows.length,
      faulty,
      review,
      invalid,
      ready
    };
  }, [importRows]);

  // Filtered Import Rows for the Validator Table
  const filteredImportRows = useMemo(() => {
    return importRows.filter((row) => {
      // 1. Status Filter
      if (validatorStatusFilter === 'faulty') {
        const isFaulty = !row.isValid || row.action === 'review_required' || !row.segmentId || !row.pricingStrategy || Boolean(row.pricingStrategyRaw) || Boolean(row.errorReason);
        if (!isFaulty) return false;
      } else if (validatorStatusFilter === 'review_required') {
        if (row.action !== 'review_required') return false;
      } else if (validatorStatusFilter === 'invalid') {
        if (row.isValid || row.action === 'review_required') return false;
      } else if (validatorStatusFilter === 'ready') {
        if (!row.isValid || row.action === 'review_required' || row.action === 'skip') return false;
      }

      // 2. Issue Type Filter
      if (validatorIssueFilter !== 'all') {
        if (validatorIssueFilter === 'missing_segment' && row.segmentId) return false;
        if (validatorIssueFilter === 'missing_pricing' && (row.pricingStrategy && !row.pricingStrategyRaw)) return false;
        if (validatorIssueFilter === 'existing' && !row.isExisting) return false;
        if (
          validatorIssueFilter === 'tax_conflict' &&
          (!row.errorReason || (!row.errorReason.includes('الضريبية') && !row.errorReason.toLowerCase().includes('tax')))
        ) {
          return false;
        }
        if (
          validatorIssueFilter === 'name_conflict' &&
          (!row.errorReason || (!row.errorReason.includes('الاسم') && !row.errorReason.toLowerCase().includes('name')))
        ) {
          return false;
        }
      }

      // 3. Segment Filter
      if (validatorSegmentFilter !== 'all') {
        if (validatorSegmentFilter === 'unassigned') {
          if (row.segmentId) return false;
        } else if (row.segmentId !== validatorSegmentFilter) {
          return false;
        }
      }

      // 4. Raw Segment Text Filter
      if (validatorRawSegmentFilter !== 'all') {
        if ((row.segmentRaw || '').trim() !== validatorRawSegmentFilter) {
          return false;
        }
      }

      // 5. Pricing Strategy Filter
      if (validatorStrategyFilter !== 'all') {
        if (validatorStrategyFilter === '__unassigned__') {
          if (row.pricingStrategy && !row.pricingStrategyRaw) return false;
        } else if (row.pricingStrategy !== validatorStrategyFilter) {
          return false;
        }
      }

      // 6. Settlement Mode Filter
      if (validatorSettlementFilter !== 'all' && row.settlementMode !== validatorSettlementFilter) {
        return false;
      }

      // 7. Free Text Search Query
      if (validatorSearchQuery.trim()) {
        const q = validatorSearchQuery.trim().toLowerCase();
        const codeMatch = (row.code || '').toLowerCase().includes(q);
        const nameArMatch = (row.tradeNameAr || '').toLowerCase().includes(q);
        const nameEnMatch = (row.tradeNameEn || '').toLowerCase().includes(q);
        const taxMatch = (row.taxCardNumber || '').includes(q);
        const phoneMatch = (row.phones || []).some((p) => p.includes(q));
        const errorMatch = (row.errorReason || '').toLowerCase().includes(q);
        const branchMatch = (row.branches || []).some(
          (b) =>
            (b.nameAr || '').toLowerCase().includes(q) ||
            (b.region || '').toLowerCase().includes(q) ||
            (b.address || '').toLowerCase().includes(q) ||
            (b.phone || '').includes(q)
        );
        if (!codeMatch && !nameArMatch && !nameEnMatch && !taxMatch && !phoneMatch && !errorMatch && !branchMatch) {
          return false;
        }
      }

      return true;
    });
  }, [
    importRows,
    validatorStatusFilter,
    validatorIssueFilter,
    validatorSegmentFilter,
    validatorRawSegmentFilter,
    validatorStrategyFilter,
    validatorSettlementFilter,
    validatorSearchQuery
  ]);

  const hasActiveValidatorFilters =
    validatorStatusFilter !== 'all' ||
    validatorIssueFilter !== 'all' ||
    validatorSegmentFilter !== 'all' ||
    validatorRawSegmentFilter !== 'all' ||
    validatorStrategyFilter !== 'all' ||
    validatorSettlementFilter !== 'all' ||
    Boolean(validatorSearchQuery.trim());

  const handleResetValidatorFilters = () => {
    setValidatorStatusFilter('all');
    setValidatorIssueFilter('all');
    setValidatorSegmentFilter('all');
    setValidatorRawSegmentFilter('all');
    setValidatorStrategyFilter('all');
    setValidatorSettlementFilter('all');
    setValidatorSearchQuery('');
  };

  const handleApplyBatchFieldReplace = () => {
    if (!batchToolValue) return;
    const filteredRowIds = new Set(filteredImportRows.map((r) => r.id));

    const updated = importRows.map((row) => {
      let shouldApply = false;
      if (batchToolTarget === 'filtered') {
        shouldApply = filteredRowIds.has(row.id);
      } else if (batchToolTarget === 'all') {
        shouldApply = true;
      } else {
        if (batchToolField === 'segmentId' && !row.segmentId) shouldApply = true;
        if (batchToolField === 'pricingStrategy' && (!row.pricingStrategy || Boolean(row.pricingStrategyRaw))) shouldApply = true;
        if (batchToolField === 'settlementMode' && !row.settlementMode) shouldApply = true;
      }

      if (!shouldApply) return row;

      const mod = { ...row };
      if (batchToolField === 'segmentId') {
        mod.segmentId = batchToolValue;
        const segObj = segments.find((s) => s.id === batchToolValue);
        mod.segmentRaw = segObj ? segObj.nameAr : batchToolValue;

        if (!mod.pricingStrategy || mod.isPricingAutoFilled) {
          const autoStrat = resolveDefaultPricingStrategy(batchToolValue, segments);
          if (autoStrat) {
            mod.pricingStrategy = autoStrat;
            mod.isPricingAutoFilled = true;
            mod.pricingStrategyRaw = '';
          }
        }

        if (mod.isExisting && mod.action === 'review_required') {
          mod.isValid = false;
          mod.errorReason = isAr
            ? 'مسجل مسبقاً — يرجى تحديد الإجراء (استبدال / دمج / تخطي)'
            : 'Existing record — select action';
        } else if (!mod.pricingStrategy) {
          mod.isValid = false;
          mod.errorReason = isAr ? 'يرجى تحديد استراتيجية التسعير' : 'Pricing strategy is required';
        } else {
          mod.isValid = true;
          mod.errorReason = '';
        }
      } else if (batchToolField === 'pricingStrategy') {
        mod.pricingStrategy = batchToolValue;
        mod.pricingStrategyRaw = '';
        mod.isPricingAutoFilled = false;
        if (!mod.segmentId) {
          mod.isValid = false;
          mod.errorReason = isAr ? 'يرجى تحديد قطاع العميل' : 'Segment selection is required';
        } else if (mod.isExisting && mod.action === 'review_required') {
          mod.isValid = false;
          mod.errorReason = isAr
            ? 'مسجل مسبقاً — يرجى تحديد الإجراء (استبدال / دمج / تخطي)'
            : 'Existing record — select action';
        } else {
          mod.isValid = true;
          mod.errorReason = '';
        }
      } else if (batchToolField === 'settlementMode') {
        mod.settlementMode = batchToolValue;
      }
      return mod;
    });

    setImportRows(updated);
    setImportStats(calculateImportStats(updated));
    setIsBatchToolOpen(false);
  };

  const handleParseCsvFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const parseDelimited = (str) =>
      String(str || '')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const parsedRows = parseRfcCsv(text);
      if (parsedRows.length < 2) {
        alert(isAr ? 'الملف لا يحتوي على بيانات كافية' : 'CSV file is empty');
        return;
      }

      const headerRow = parsedRows[0].map((v) => v.trim());

      const getColIdx = (aliases, fallbackIdx) => {
        const idx = headerRow.findIndex((h) =>
          aliases.some((a) => a.toLowerCase() === h.toLowerCase())
        );
        return idx !== -1 ? idx : fallbackIdx;
      };

      const hasNotesCol = headerRow.some((h) =>
        ['notes', 'ملاحظات', 'الملاحظات', 'note'].includes(h.toLowerCase())
      );

      const colMap = {
        code: getColIdx(['code', 'كود', 'كود العميل'], 0),
        tradeNameAr: getColIdx(['tradeNameAr', 'الاسم التجاري', 'اسم العميل', 'الاسم التجاري (عربي)'], 1),
        tradeNameEn: getColIdx(['tradeNameEn', 'الاسم بالإنجليزية', 'Trade Name (En)'], 2),
        legalName: getColIdx(['legalName', 'الاسم القانوني'], 3),
        segment: getColIdx(['segment', 'القطاع', 'التصنيف'], 4),
        pricingStrategy: getColIdx(['pricingStrategy', 'استراتيجية التسعير'], 5),
        taxCardNumber: getColIdx(['taxCardNumber', 'البطاقة الضريبية', 'رقم البطاقة الضريبية'], 6),
        commercialRegister: getColIdx(['commercialRegister', 'السجل التجاري'], 7),
        taxDistrict: getColIdx(['taxDistrict', 'المأمورية', 'مأمورية الضرائب'], 8),
        settlementMode: getColIdx(['settlementMode', 'طريقة الدفع', 'طريقة السداد'], 9),
        creditLimit: getColIdx(['creditLimit', 'الحد الائتماني'], 10),
        phones: getColIdx(['phones', 'الهواتف', 'أرقام الهاتف'], 11),
        emails: getColIdx(['emails', 'البريد الإلكتروني'], 12),
        weeklyHolidays: getColIdx(['weeklyHolidays', 'العطلات الأسبوعية'], 13),
        workingHoursFrom: getColIdx(['workingHoursFrom', 'مواعيد العمل من', 'ساعات العمل من'], 14),
        workingHoursTo: getColIdx(['workingHoursTo', 'مواعيد العمل إلى', 'ساعات العمل إلى'], 15),
        notes: hasNotesCol ? getColIdx(['notes', 'ملاحظات', 'الملاحظات', 'note'], 16) : -1,
        branchName: hasNotesCol ? getColIdx(['branchName', 'اسم الفرع'], 17) : (headerRow.length >= 22 ? 16 : 11),
        address: hasNotesCol ? getColIdx(['address', 'العنوان'], 18) : (headerRow.length >= 22 ? 17 : 12),
        region: hasNotesCol ? getColIdx(['region', 'المنطقة', 'المحافظة'], 19) : (headerRow.length >= 22 ? 18 : 13),
        contactPerson: hasNotesCol ? getColIdx(['contactPerson', 'المسؤول', 'شخص الاتصال'], 20) : (headerRow.length >= 22 ? 19 : 14),
        branchPhone: hasNotesCol ? getColIdx(['branchPhone', 'هاتف الفرع'], 21) : (headerRow.length >= 22 ? 20 : 15),
        gpsCoordinates: hasNotesCol ? getColIdx(['gpsCoordinates', 'الإحداثيات', 'الموقع'], 22) : (headerRow.length >= 22 ? 21 : 17),
      };

      const clientGroups = new Map();
      const rawRowsList = [];

      for (let i = 1; i < parsedRows.length; i++) {
        const cols = parsedRows[i];

        if (cols.length < 2 || (!cols[colMap.tradeNameAr] && !cols[colMap.code])) continue;

        const rawCode = (cols[colMap.code] || '').trim();
        const rawNameAr = (cols[colMap.tradeNameAr] || '').trim();
        const rawNameEn = (cols[colMap.tradeNameEn] || '').trim();
        const rawTaxCard = (cols[colMap.taxCardNumber] || '').trim();
        const cleanTax = normalizeTaxCard(rawTaxCard);
        const normName = normalizeArText(rawNameAr);

        // Group key: prefer non-empty code, then clean tax card, then normalized name
        const clientKey = rawCode.toLowerCase() || (cleanTax ? `tax_${cleanTax}` : (normName ? `name_${normName}` : `row_${i}`));

        const branchName = (cols[colMap.branchName] || '').trim();
        const branchRegion = (cols[colMap.region] || '').trim();
        const branchAddress = (cols[colMap.address] || '').trim();
        const branchContact = (cols[colMap.contactPerson] || '').trim();
        const branchPhone = (cols[colMap.branchPhone] || '').trim();
        const branchGps = (cols[colMap.gpsCoordinates] || '').trim();
        const rowNotes = colMap.notes !== -1 ? (cols[colMap.notes] || '').trim() : '';

        const rowPhones = colMap.phones !== -1 ? parseDelimited(cols[colMap.phones]) : [];
        if (branchPhone && !rowPhones.includes(branchPhone)) rowPhones.push(branchPhone);
        const rowEmails = colMap.emails !== -1 ? parseDelimited(cols[colMap.emails]) : [];

        const rawStrat = (cols[colMap.pricingStrategy] || '').trim();
        const resolvedStrat = resolvePricingStrategy(rawStrat);
        const isInvalidStrat = Boolean(rawStrat) && !resolvedStrat;

        // Track raw CSV row for full 23-column raw inspect view
        rawRowsList.push({
          lineIndex: i + 1,
          clientKey,
          code: rawCode,
          tradeNameAr: rawNameAr,
          tradeNameEn: rawNameEn,
          legalName: cols[colMap.legalName] || '',
          segment: cols[colMap.segment] || '',
          pricingStrategy: rawStrat || resolvedStrat || '',
          taxCardNumber: rawTaxCard,
          commercialRegister: cols[colMap.commercialRegister] || '',
          taxDistrict: cols[colMap.taxDistrict] || '',
          settlementMode: cols[colMap.settlementMode] || 'cod',
          creditLimit: cols[colMap.creditLimit] || '0',
          phones: rowPhones.join('; '),
          emails: rowEmails.join('; '),
          weeklyHolidays: cols[colMap.weeklyHolidays] || '',
          workingHoursFrom: cols[colMap.workingHoursFrom] || '',
          workingHoursTo: cols[colMap.workingHoursTo] || '',
          notes: rowNotes,
          branchName: branchName || (clientGroups.has(clientKey) ? `فرع ${clientGroups.get(clientKey).branches.length + 1}` : 'الفرع الرئيسي'),
          address: branchAddress,
          region: branchRegion,
          contactPerson: branchContact,
          branchPhone,
          gpsCoordinates: branchGps
        });

        if (!clientGroups.has(clientKey)) {
          let weeklyHolidays = ['friday'];
          const rawHolidays = colMap.weeklyHolidays !== -1 ? parseDelimited(cols[colMap.weeklyHolidays]) : [];
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

          clientGroups.set(clientKey, {
            id: clientKey,
            code: rawCode || `CLI-${Date.now() + i}`,
            tradeNameAr: rawNameAr,
            tradeNameEn: rawNameEn,
            legalName: (cols[colMap.legalName] || rawNameAr).trim(),
            segmentRaw: (cols[colMap.segment] || '').trim(),
            pricingStrategy: resolvedStrat || '',
            pricingStrategyRaw: isInvalidStrat ? rawStrat : '',
            isPricingAutoFilled: false,
            taxCardNumber: rawTaxCard,
            commercialRegister: (cols[colMap.commercialRegister] || '').trim(),
            taxDistrict: (cols[colMap.taxDistrict] || '').trim(),
            settlementMode: ['cod', 'credit', 'rolling_credit'].includes(cols[colMap.settlementMode])
              ? cols[colMap.settlementMode]
              : 'cod',
            creditLimit: Math.max(0, parseFloat(cols[colMap.creditLimit]) || 0),
            phonesSet: new Set(rowPhones),
            emailsSet: new Set(rowEmails),
            weeklyHolidays,
            workingHoursFrom: (cols[colMap.workingHoursFrom] || '').trim(),
            workingHoursTo: (cols[colMap.workingHoursTo] || '').trim(),
            notes: rowNotes,
            branches: [
              {
                id: 'br_1',
                nameAr: branchName || 'الفرع الرئيسي',
                nameEn: 'Main Branch',
                isMain: true,
                region: branchRegion,
                address: branchAddress,
                contactPerson: branchContact,
                phone: branchPhone || rowPhones[0] || '',
                phones: rowPhones,
                gpsCoordinates: branchGps,
                notes: rowNotes,
                useCustomSchedule: false,
                weeklyHolidays: [],
                workingHoursFrom: '',
                workingHoursTo: ''
              }
            ],
            rawRowsCount: 1
          });
        } else {
          // Additional branch belonging to this same client entity
          const client = clientGroups.get(clientKey);
          client.rawRowsCount += 1;
          rowPhones.forEach((p) => client.phonesSet.add(p));
          rowEmails.forEach((e) => client.emailsSet.add(e));
          if (!client.notes && rowNotes) client.notes = rowNotes;

          const branchIndex = client.branches.length + 1;
          const fallbackBranchName = branchRegion ? `فرع ${branchRegion}` : `فرع ${branchIndex}`;
          client.branches.push({
            id: `br_${branchIndex}`,
            nameAr: branchName || fallbackBranchName,
            nameEn: `Branch ${branchIndex}`,
            isMain: false,
            region: branchRegion,
            address: branchAddress,
            contactPerson: branchContact,
            phone: branchPhone || '',
            phones: rowPhones,
            gpsCoordinates: branchGps,
            notes: rowNotes,
            useCustomSchedule: false,
            weeklyHolidays: [],
            workingHoursFrom: '',
            workingHoursTo: ''
          });
        }
      }

      // Validate staged clients against segments and live Firestore database
      const stagedClients = [];

      for (const [key, group] of clientGroups.entries()) {
        const phones = Array.from(group.phonesSet).filter(Boolean);
        const emails = Array.from(group.emailsSet).filter(Boolean);

        const clientData = {
          ...group,
          phones,
          emails,
          isValid: true,
          errorReason: '',
          isExisting: false,
          existingClientId: null,
          existingClient: null,
          action: 'create' // 'create' | 'review_required' | 'replace' | 'merge' | 'skip'
        };

        // 1. Strict Segment Resolution with Arabic Normalization
        const cleanSegRaw = (clientData.segmentRaw || '').trim();
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
          clientData.segmentId = matchedSeg.id;
          clientData.segmentRaw = matchedSeg.nameAr;
        } else {
          clientData.segmentId = '';
          clientData.isValid = false;
          const availableSegs = segments.map((s) => s.nameAr).join('، ');
          clientData.errorReason = isAr
            ? `قطاع غير معرّف أو به خطأ: "${cleanSegRaw || 'فارغ'}". القطاعات المتاحة: (${availableSegs})`
            : `Unrecognized segment: "${cleanSegRaw || 'empty'}". Allowed segments: (${availableSegs})`;
        }

        // 1.b Pricing Strategy Auto-filling and Validation
        if (!clientData.pricingStrategy) {
          if (!clientData.pricingStrategyRaw) {
            // Left empty in CSV -> Auto-fill based on segment rule!
            const autoPricing = resolveDefaultPricingStrategy(clientData.segmentId || clientData.segmentRaw, segments);
            if (autoPricing) {
              clientData.pricingStrategy = autoPricing;
              clientData.isPricingAutoFilled = true;
            } else {
              clientData.isValid = false;
              if (!clientData.errorReason) {
                clientData.errorReason = isAr
                  ? 'يرجى تحديد استراتيجية تسعير للعميل'
                  : 'Pricing strategy selection is required';
              }
            }
          } else {
            // Non-empty but unrecognized in CSV -> Keep for user review and replacement
            clientData.isValid = false;
            clientData.errorReason = isAr
              ? `استراتيجية تسعير غير معرّفة: "${clientData.pricingStrategyRaw}" — يرجى تحديد الاستراتيجية`
              : `Unrecognized pricing strategy: "${clientData.pricingStrategyRaw}" — please select valid strategy`;
          }
        }

        // 2. Check Database Existence (Client ID / Code, Tax Card, or Trade Name)
        const cleanTax = normalizeTaxCard(clientData.taxCardNumber);
        const cleanNameAr = (clientData.tradeNameAr || '').trim().toLowerCase();

        const existingInDb = clients.find((c) => {
          if (clientData.code && c.id?.toLowerCase() === clientData.code.toLowerCase()) return true;
          if (cleanTax && normalizeTaxCard(c.taxCardNumber) === cleanTax) return true;
          if (cleanNameAr && (c.tradeNameAr || c.name || '').trim().toLowerCase() === cleanNameAr) return true;
          return false;
        });

        if (existingInDb) {
          clientData.isExisting = true;
          clientData.existingClientId = existingInDb.id;
          clientData.existingClient = existingInDb;
          // Prompt for user review as requested!
          clientData.action = 'review_required';
          clientData.isValid = false;
          clientData.errorReason = isAr
            ? `مسجل مسبقاً (${existingInDb.tradeNameAr || existingInDb.id}) — يرجى تحديد الإجراء (استبدال / دمج / تخطي)`
            : `Already registered (${existingInDb.tradeNameAr || existingInDb.id}) — select action (Replace / Merge / Skip)`;
        } else {
          // If not existing, verify tax card uniqueness against other clients
          if (cleanTax) {
            const taxConflict = clients.find((c) => normalizeTaxCard(c.taxCardNumber) === cleanTax);
            if (taxConflict) {
              clientData.isValid = false;
              clientData.errorReason = isAr
                ? `رقم البطاقة الضريبية (${clientData.taxCardNumber}) مسجل مسبقاً للعميل: ${taxConflict.tradeNameAr || taxConflict.id}`
                : `Tax Card ID (${clientData.taxCardNumber}) is already registered to: ${taxConflict.tradeNameAr || taxConflict.id}`;
            }
          }
        }

        stagedClients.push(clientData);
      }

      setImportRows(stagedClients);
      setRawImportRows(rawRowsList);
      setExpandedImportClientIds(new Set());
      setImportStats(calculateImportStats(stagedClients));
      setIsBulkModalOpen(true);
    };

    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleCommitBulkImport = async () => {
    const rowsToCommit = importRows.filter(
      (r) => r.isValid && r.action !== 'skip' && r.action !== 'review_required'
    );
    if (rowsToCommit.length === 0) {
      alert(isAr ? 'لا توجد سجلات صالحة ومعتمدة للاستيراد' : 'No valid records ready to commit');
      return;
    }

    setIsCommittingImport(true);
    let createdCount = 0;
    let replacedCount = 0;
    let mergedCount = 0;
    let totalBranchesCount = 0;

    try {
      for (const client of rowsToCommit) {
        totalBranchesCount += (client.branches?.length || 1);

        if (client.action === 'replace' || client.action === 'create') {
          const payload = {
            tradeNameAr: client.tradeNameAr,
            tradeNameEn: client.tradeNameEn,
            legalName: client.legalName,
            segmentId: client.segmentId,
            pricingStrategy: client.pricingStrategy,
            taxCardNumber: client.taxCardNumber,
            commercialRegister: client.commercialRegister,
            taxDistrict: client.taxDistrict,
            settlementMode: client.settlementMode,
            creditLimit: client.creditLimit,
            openingBalance: 0,
            latestActivityOn: client.isExisting ? (client.existingClient?.latestActivityOn || null) : null,
            phones: client.phones || [],
            phone: client.phones?.[0] || '',
            emails: client.emails || [],
            email: client.emails?.[0] || '',
            weeklyHolidays: client.weeklyHolidays?.length > 0 ? client.weeklyHolidays : ['friday'],
            workingHoursFrom: client.workingHoursFrom || '',
            workingHoursTo: client.workingHoursTo || '',
            branches: client.branches || [],
            branchesCount: (client.branches || []).length,
            attachments: client.isExisting ? (client.existingClient?.attachments || []) : [],
            logo: client.isExisting ? (client.existingClient?.logo || '') : '',
            notes: (client.notes && client.notes.trim()) || 'Imported via Bulk CSV',
            createdAt: client.isExisting ? (client.existingClient?.createdAt || serverTimestamp()) : serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          await setDoc(doc(db, 'clients', client.code), payload, { merge: true });
          if (client.action === 'replace') replacedCount++;
          else createdCount++;
        } else if (client.action === 'merge') {
          const existing = client.existingClient || clients.find((c) => c.id === client.code);
          const existingBranches = existing?.branches || [];
          const mergedBranches = [...existingBranches];

          for (const nb of client.branches || []) {
            const alreadyExists = mergedBranches.some(
              (eb) => eb.nameAr && nb.nameAr && eb.nameAr.trim().toLowerCase() === nb.nameAr.trim().toLowerCase()
            );
            if (!alreadyExists) {
              mergedBranches.push({
                ...nb,
                id: `br_${mergedBranches.length + 1}`,
                isMain: mergedBranches.length === 0
              });
            }
          }

          const combinedPhones = Array.from(new Set([...(existing?.phones || []), ...(client.phones || [])])).filter(Boolean);
          const combinedEmails = Array.from(new Set([...(existing?.emails || []), ...(client.emails || [])])).filter(Boolean);

          await setDoc(
            doc(db, 'clients', client.code),
            {
              branches: mergedBranches,
              branchesCount: mergedBranches.length,
              phones: combinedPhones,
              phone: combinedPhones[0] || '',
              emails: combinedEmails,
              email: combinedEmails[0] || '',
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
          mergedCount++;
        }
      }

      setIsBulkModalOpen(false);
      setImportRows([]);
      setRawImportRows([]);
      setExpandedImportClientIds(new Set());
      alert(
        isAr
          ? `تم بنجاح معالجة (${rowsToCommit.length}) عميل (${createdCount} عميل جديد، ${replacedCount} استبدال، ${mergedCount} دمج فروع) بإجمالي (${totalBranchesCount}) فرع.`
          : `Successfully processed ${rowsToCommit.length} clients (${createdCount} new, ${replacedCount} replaced, ${mergedCount} merged) with ${totalBranchesCount} total branches.`
      );
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
      'Branches Count',
      'Notes'
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
        (c.branches || []).length,
        c.notes || ''
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
                        onChange={(e) => {
                          const newSegId = e.target.value;
                          const defaultPricing = resolveDefaultPricingStrategy(newSegId, segments);
                          setFormData((prev) => ({
                            ...prev,
                            segmentId: newSegId,
                            pricingStrategy: defaultPricing || prev.pricingStrategy
                          }));
                        }}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
          <div className="bg-white rounded-3xl max-w-[96vw] xl:max-w-7xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] animate__animated animate__fadeInUp animate__faster">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-400/30">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base">
                    {isAr ? 'معاينة وتدقيق استيراد العملاء والفروع (CSV)' : 'Bulk Clients & Multi-Branch Import Validator'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {isAr
                      ? 'تجميع فروع كل عميل آلياً، مراجعة وتدقيق السجلات القائمة، واستبدال البيانات بدقة'
                      : 'Auto-consolidate branches per client, audit existing database records, and fast replacement'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics Summary Ribbon */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 bg-slate-200 text-slate-800 rounded-lg">
                  {isAr ? 'العملاء المكتشفين:' : 'Clients:'} <strong>{importStats.totalClients}</strong>
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg flex items-center gap-1">
                  <Boxes className="w-3.5 h-3.5" />
                  {isAr ? 'إجمالي أسطر الفروع:' : 'Branches:'} <strong>{importStats.totalBranchRows}</strong>
                </span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg flex items-center gap-1">
                  <PlusCircle className="w-3.5 h-3.5" />
                  {isAr ? 'عملاء جدد:' : 'New:'} <strong>{importStats.newClients}</strong>
                </span>
                {importStats.existingClients > 0 && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {isAr ? 'مسجلين مسبقاً (مطلوب مراجعة):' : 'Existing (Review Required):'} <strong>{importStats.requiresReview}</strong>
                  </span>
                )}
                <span className="px-3 py-1 bg-teal-100 text-teal-800 rounded-lg flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isAr ? 'جاهز للاستيراد:' : 'Ready:'} <strong>{importStats.readyToCommit}</strong>
                </span>
                {importStats.invalid > 0 && (
                  <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded-lg flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    {isAr ? 'أخطاء تحتاج لتصحيح:' : 'Conflicts/Errors:'} <strong>{importStats.invalid}</strong>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isAr ? 'تحميل قالب CSV الاستيراد المعتمد' : 'Download Template'}</span>
              </button>
            </div>

            {/* Prompt For Review & Quick Action Banner (When Existing Records are detected) */}
            {importStats.existingClients > 0 && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shrink-0">
                <div className="flex items-center gap-2.5 text-amber-900 font-bold">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>
                    {isAr
                      ? `تم اكتشاف (${importStats.existingClients}) عميل مسجل مسبقاً. يرجى تحديد الإجراء المطلوب لكل عميل بالجدول، أو استخدام أدوات الاستبدال السريع:`
                      : `Detected (${importStats.existingClients}) existing clients in database. Review actions in table or use quick batch tools:`}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0 font-bold">
                  <button
                    type="button"
                    onClick={() => handleBatchSetExistingAction('replace')}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    title={isAr ? 'استبدال بيانات وفروع جميع السجلات القائمة بالكامل' : 'Replace all existing records'}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isAr ? 'استبدال جميع القائمة بالكامل' : 'Replace All Existing'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchSetExistingAction('merge')}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    title={isAr ? 'الحفاظ على فروع العميل الحالية وإضافة فروع CSV الجديدة فقط' : 'Merge branches for all existing'}
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>{isAr ? 'دمج فروع القائمة' : 'Merge Branches for All'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchSetExistingAction('skip')}
                    className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                    title={isAr ? 'تخطي وعدم تعديل أي عميل مسجل مسبقاً' : 'Skip all existing records'}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تخطي جميع القائمة' : 'Skip All Existing'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* View Mode & Batch Find-and-Replace Ribbon */}
            <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* View Switcher */}
                <div className="bg-white p-0.5 rounded-xl border border-slate-200 flex items-center shadow-xs">
                  <button
                    type="button"
                    onClick={() => setImportViewMode('clients')}
                    className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      importViewMode === 'clients' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>{isAr ? 'عرض العملاء المجمعة (Consolidated)' : 'Consolidated Clients View'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportViewMode('raw_rows')}
                    className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      importViewMode === 'raw_rows' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{isAr ? `عرض أسطر الملف التفصيلية (${rawImportRows.length})` : `All Raw CSV Rows (${rawImportRows.length})`}</span>
                  </button>
                </div>

                {/* Batch Replace Tool Trigger */}
                <button
                  type="button"
                  onClick={() => setIsBatchToolOpen(!isBatchToolOpen)}
                  className={`px-3 py-1.5 rounded-xl border font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    isBatchToolOpen
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{isAr ? 'أداة الاستبدال السريع للحقول' : 'Batch Quick Replace'}</span>
                </button>
              </div>

              <span className="text-[11px] text-slate-500 font-semibold hidden md:inline">
                {isAr
                  ? 'عرض شامل لجميع أعمدة ملف CSV الـ 23 بالكامل مع التمرير الأفقي'
                  : 'Displaying all 23 CSV columns with horizontal scrolling'}
              </span>
            </div>

            {/* Collapsible Batch Replace Drawer */}
            {isBatchToolOpen && (
              <div className="px-6 py-3 bg-blue-50/80 border-b border-blue-200 flex flex-wrap items-center gap-2.5 text-xs font-bold animate__animated animate__fadeInDown animate__faster shrink-0">
                <span className="text-blue-900">{isAr ? 'استبدال الحقل:' : 'Field:'}</span>
                <select
                  value={batchToolField}
                  onChange={(e) => {
                    setBatchToolField(e.target.value);
                    setBatchToolValue('');
                  }}
                  className="px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="segmentId">{isAr ? 'القطاع والتصنيف' : 'Segment'}</option>
                  <option value="pricingStrategy">{isAr ? 'استراتيجية التسعير' : 'Pricing Strategy'}</option>
                  <option value="settlementMode">{isAr ? 'طريقة السداد' : 'Settlement Mode'}</option>
                </select>

                <span className="text-blue-900">{isAr ? 'القيمة الجديدة:' : 'New Value:'}</span>
                {batchToolField === 'segmentId' && (
                  <select
                    value={batchToolValue}
                    onChange={(e) => setBatchToolValue(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">{isAr ? '-- اختر القطاع المطلوب --' : '-- Select Segment --'}</option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameAr}
                      </option>
                    ))}
                  </select>
                )}
                {batchToolField === 'pricingStrategy' && (
                  <select
                    value={batchToolValue}
                    onChange={(e) => setBatchToolValue(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">{isAr ? '-- اختر الاستراتيجية --' : '-- Select Strategy --'}</option>
                    {PRICING_STRATEGIES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {isAr ? st.labelAr : st.labelEn}
                      </option>
                    ))}
                  </select>
                )}
                {batchToolField === 'settlementMode' && (
                  <select
                    value={batchToolValue}
                    onChange={(e) => setBatchToolValue(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">{isAr ? '-- اختر طريقة السداد --' : '-- Select Settlement --'}</option>
                    {SETTLEMENT_MODES.map((sm) => (
                      <option key={sm.id} value={sm.id}>
                        {isAr ? sm.labelAr : sm.labelEn}
                      </option>
                    ))}
                  </select>
                )}

                <span className="text-blue-900 ms-2">{isAr ? 'نطاق التطبيق:' : 'Apply to:'}</span>
                <select
                  value={batchToolTarget}
                  onChange={(e) => setBatchToolTarget(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="filtered">
                    {isAr
                      ? `السجلات الظاهرة والمفلترة حالياً فقط (${filteredImportRows.length})`
                      : `Filtered records only (${filteredImportRows.length})`}
                  </option>
                  <option value="unassigned">{isAr ? 'السجلات غير المحددة / بها خطأ فقط' : 'Unassigned / Invalid only'}</option>
                  <option value="all">{isAr ? 'جميع السجلات المستوردة' : 'All imported records'}</option>
                </select>

                <button
                  type="button"
                  disabled={!batchToolValue}
                  onClick={handleApplyBatchFieldReplace}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition shadow-sm cursor-pointer"
                >
                  {isAr ? 'تطبيق الاستبدال' : 'Apply Replace'}
                </button>
              </div>
            )}

            {/* Primary Status Filters Ribbon */}
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setValidatorStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    validatorStatusFilter === 'all'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{isAr ? 'جميع السجلات' : 'All Records'}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      validatorStatusFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {validatorCounters.all}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setValidatorStatusFilter('faulty')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    validatorStatusFilter === 'faulty'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{isAr ? 'سجلات تحتاج مراجعة أو بها أخطاء' : 'Needs Attention / Faulty'}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      validatorStatusFilter === 'faulty' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
                    }`}
                  >
                    {validatorCounters.faulty}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setValidatorStatusFilter('review_required')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    validatorStatusFilter === 'review_required'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{isAr ? 'مطلوب مراجعة' : 'Review Required'}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      validatorStatusFilter === 'review_required' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {validatorCounters.review}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setValidatorStatusFilter('invalid')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    validatorStatusFilter === 'invalid'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{isAr ? 'سجلات مرفوضة أو بها تعارض' : 'Invalid / Conflicts'}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      validatorStatusFilter === 'invalid' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {validatorCounters.invalid}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setValidatorStatusFilter('ready')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    validatorStatusFilter === 'ready'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'جاهز للاستيراد' : 'Ready to Commit'}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      validatorStatusFilter === 'ready' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {validatorCounters.ready}
                  </span>
                </button>
              </div>

              {hasActiveValidatorFilters && (
                <button
                  type="button"
                  onClick={handleResetValidatorFilters}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{isAr ? 'إعادة ضبط كل الفلاتر' : 'Reset All Filters'}</span>
                </button>
              )}
            </div>

            {/* Field Drilldown & Free Search Bar */}
            <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2.5 text-xs shrink-0">
              {/* Free Text Search */}
              <div className="relative min-w-[200px] flex-1 max-w-[280px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-2.5" />
                <input
                  type="text"
                  value={validatorSearchQuery}
                  onChange={(e) => setValidatorSearchQuery(e.target.value)}
                  placeholder={isAr ? 'بحث بالكود، الاسم، الضريبية، الهاتف...' : 'Search code, name, tax, phone...'}
                  className="w-full ps-8 pe-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
                {validatorSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setValidatorSearchQuery('')}
                    className="absolute end-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter by Issue Category */}
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-semibold">{isAr ? 'المشكلة:' : 'Issue:'}</span>
                <select
                  value={validatorIssueFilter}
                  onChange={(e) => setValidatorIssueFilter(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    validatorIssueFilter !== 'all'
                      ? 'bg-amber-50 border-amber-300 text-amber-900 ring-1 ring-amber-300'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <option value="all">{isAr ? 'جميع المشاكل' : 'All Issues'}</option>
                  <option value="missing_segment">{isAr ? '⚠️ قطاع مفقود / غير معرّف' : 'Missing Segment'}</option>
                  <option value="missing_pricing">{isAr ? '⚠️ استراتيجية تسعير غير معرّفة / خطأ' : 'Missing / Invalid Pricing'}</option>
                  <option value="existing">{isAr ? '🔄 مسجل مسبقاً (مطلوب مراجعة)' : 'Existing in DB'}</option>
                  <option value="tax_conflict">{isAr ? '⛔ تعارض بطاقة ضريبية' : 'Tax Card Conflict'}</option>
                  <option value="name_conflict">{isAr ? '⛔ تعارض اسم تجاري' : 'Name Conflict'}</option>
                </select>
              </div>

              {/* Filter by App Segment */}
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-semibold">{isAr ? 'القطاع:' : 'Segment:'}</span>
                <select
                  value={validatorSegmentFilter}
                  onChange={(e) => setValidatorSegmentFilter(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    validatorSegmentFilter !== 'all'
                      ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <option value="all">{isAr ? 'جميع القطاعات' : 'All Segments'}</option>
                  <option value="unassigned">{isAr ? '⚠️ غير محدد / خطأ قطاع' : 'Unassigned / Invalid'}</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Raw Segment in CSV */}
              {uniqueRawSegmentsInCsv.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 font-semibold">{isAr ? 'نص القطاع في CSV:' : 'Raw CSV Segment:'}</span>
                  <select
                    value={validatorRawSegmentFilter}
                    onChange={(e) => setValidatorRawSegmentFilter(e.target.value)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold cursor-pointer ${
                      validatorRawSegmentFilter !== 'all'
                        ? 'bg-purple-50 border-purple-300 text-purple-900 ring-1 ring-purple-300'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="all">{isAr ? 'جميع النصوص الخام' : 'All Raw Texts'}</option>
                    {uniqueRawSegmentsInCsv.map((raw) => (
                      <option key={raw} value={raw}>
                        "{raw}"
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filter by Pricing Strategy */}
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-semibold">{isAr ? 'التسعير:' : 'Pricing:'}</span>
                <select
                  value={validatorStrategyFilter}
                  onChange={(e) => setValidatorStrategyFilter(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    validatorStrategyFilter !== 'all'
                      ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <option value="all">{isAr ? 'الكل' : 'All'}</option>
                  <option value="__unassigned__">{isAr ? '⚠️ غير محدد / خطأ تسعير' : 'Unassigned / Invalid'}</option>
                  {PRICING_STRATEGIES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {isAr ? st.labelAr : st.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Settlement Mode */}
              <div className="flex items-center gap-1">
                <span className="text-slate-500 font-semibold">{isAr ? 'السداد:' : 'Settlement:'}</span>
                <select
                  value={validatorSettlementFilter}
                  onChange={(e) => setValidatorSettlementFilter(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    validatorSettlementFilter !== 'all'
                      ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <option value="all">{isAr ? 'الكل' : 'All'}</option>
                  {SETTLEMENT_MODES.map((sm) => (
                    <option key={sm.id} value={sm.id}>
                      {isAr ? sm.labelAr : sm.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Matching Count Badge */}
              <div className="ms-auto text-[11px] font-bold text-slate-500 flex items-center gap-1">
                <span>{isAr ? 'المطابق للفلترة:' : 'Matching:'}</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md font-mono font-bold">
                  {filteredImportRows.length} / {importRows.length}
                </span>
              </div>
            </div>

            {/* Scrollable Data Table Container with Full 23 Columns */}
            <div className="p-4 overflow-auto flex-grow max-h-[62vh]">
              {importViewMode === 'clients' ? (
                /* ========================================================= */
                /* CONSOLIDATED CLIENTS VIEW                                 */
                /* ========================================================= */
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-20 shadow-xs whitespace-nowrap">
                      <th className="py-2.5 px-3 text-start sticky start-0 bg-slate-100 z-30 shadow-xs">
                        {isAr ? 'الحالة / الإجراء' : 'Status / Action'}
                      </th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الكود' : 'Code'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الاسم التجاري (عربي)' : 'Trade Name (Ar)'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الاسم بالإنجليزي' : 'Trade Name (En)'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الاسم القانوني' : 'Legal Name'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'القطاع' : 'Segment'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'استراتيجية التسعير' : 'Pricing Strategy'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'البطاقة الضريبية' : 'Tax Card'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'السجل التجاري' : 'Comm. Reg'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المأمورية' : 'Tax District'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'طريقة السداد' : 'Settlement'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الحد الائتماني' : 'Credit Limit'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الهواتف' : 'Phones'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'البريد الإلكتروني' : 'Emails'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العطلات' : 'Holidays'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'مواعيد العمل' : 'Working Hours'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الملاحظات' : 'Notes'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الفروع المكتشفة' : 'Branches'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المنطقة' : 'Region'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العنوان' : 'Address'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المسؤول' : 'Contact Person'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'هاتف الفرع' : 'Branch Phone'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الموقع / GPS' : 'GPS'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'تنبيهات / تعارض' : 'Alerts / Conflict'}</th>
                      <th className="py-2.5 px-3 text-center">{isAr ? 'إجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium whitespace-nowrap">
                    {filteredImportRows.length === 0 ? (
                      <tr>
                        <td colSpan={26} className="py-12 text-center text-slate-500 bg-slate-50/50">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Filter className="w-8 h-8 text-slate-300" />
                            <p className="font-bold text-slate-700 text-sm">
                              {isAr ? 'لا توجد سجلات مطابقة لمعايير الفلترة المحددة' : 'No records match the selected filter criteria'}
                            </p>
                            <p className="text-xs text-slate-400">
                              {isAr ? 'جرب تغيير أو إزالة بعض خيارات الفلترة لعرض السجلات' : 'Try modifying or resetting the filters to view records'}
                            </p>
                            {hasActiveValidatorFilters && (
                              <button
                                type="button"
                                onClick={handleResetValidatorFilters}
                                className="mt-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{isAr ? 'إعادة ضبط كل الفلاتر' : 'Reset All Filters'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredImportRows.map((row) => {
                        const isExpanded = expandedImportClientIds.has(row.id);
                        return (
                          <React.Fragment key={row.id}>
                            <tr
                              className={`transition hover:bg-slate-50/80 ${
                                !row.isValid
                                  ? 'bg-rose-50/50 text-rose-900'
                                  : row.action === 'skip'
                                  ? 'bg-slate-50 text-slate-400 opacity-60'
                                  : row.action === 'replace'
                                  ? 'bg-amber-50/40 text-slate-800'
                                  : row.action === 'merge'
                                  ? 'bg-blue-50/40 text-slate-800'
                                  : 'bg-emerald-50/30 text-slate-800'
                              }`}
                            >
                              {/* Status & Action */}
                              <td className="py-2.5 px-3 sticky start-0 bg-white z-10 shadow-xs">
                                {row.isExisting ? (
                                  row.action === 'review_required' ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-bold text-[11px] flex items-center gap-1">
                                        <HelpCircle className="w-3 h-3" />
                                        {isAr ? 'مطلوب مراجعة' : 'Review Required'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRecordAction(row.id, 'replace')}
                                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                        title={isAr ? 'استبدال السجل بالكامل' : 'Replace Entire Record'}
                                      >
                                        {isAr ? 'استبدال' : 'Replace'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRecordAction(row.id, 'merge')}
                                        className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                        title={isAr ? 'دمج الفروع الجديدة' : 'Merge Branches'}
                                      >
                                        {isAr ? 'دمج' : 'Merge'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRecordAction(row.id, 'skip')}
                                        className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
                                        title={isAr ? 'تخطي السجل' : 'Skip Record'}
                                      >
                                        {isAr ? 'تخطي' : 'Skip'}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <select
                                        value={row.action}
                                        onChange={(e) => handleUpdateRecordAction(row.id, e.target.value)}
                                        className={`px-2 py-1 text-[11px] font-bold rounded-lg border cursor-pointer ${
                                          row.action === 'replace'
                                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                                            : row.action === 'merge'
                                            ? 'border-blue-300 bg-blue-50 text-blue-800'
                                            : 'border-slate-300 bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        <option value="replace">{isAr ? '🔄 استبدال السجل بالكامل' : 'Replace Entire Record'}</option>
                                        <option value="merge">{isAr ? '🔀 دمج الفروع الجديدة' : 'Merge Branches'}</option>
                                        <option value="skip">{isAr ? '⏭️ تخطي (عدم الاستيراد)' : 'Skip'}</option>
                                      </select>
                                    </div>
                                  )
                                ) : row.isValid ? (
                                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    {isAr ? 'عميل جديد (إضافة)' : 'New Client'}
                                  </span>
                                ) : (
                                  <span className="text-rose-600 font-bold flex items-center gap-1">
                                    <X className="w-3.5 h-3.5 stroke-[3]" />
                                    {isAr ? 'مرفوض' : 'Invalid'}
                                  </span>
                                )}
                              </td>

                              {/* Client Code */}
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{row.code}</td>

                              {/* Trade Name Ar */}
                              <td className="py-2.5 px-3 font-black text-slate-900 max-w-[200px] truncate" title={row.tradeNameAr}>
                                {row.tradeNameAr}
                              </td>

                              {/* Trade Name En */}
                              <td className="py-2.5 px-3 text-slate-600 max-w-[150px] truncate" title={row.tradeNameEn}>
                                {row.tradeNameEn || '—'}
                              </td>

                              {/* Legal Name */}
                              <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate" title={row.legalName}>
                                {row.legalName || '—'}
                              </td>

                              {/* Segment (Interactive Dropdown) */}
                              <td className="py-2.5 px-3">
                                <select
                                  value={row.segmentId || ''}
                                  onChange={(e) => handleUpdateImportRowSegment(row.id, e.target.value)}
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

                              {/* Pricing Strategy (Interactive Dropdown) */}
                              <td className="py-2.5 px-3">
                                <select
                                  value={row.pricingStrategy || ''}
                                  onChange={(e) => handleUpdateImportRowPricingStrategy(row.id, e.target.value)}
                                  className={`px-2 py-1 text-xs rounded-lg border font-bold cursor-pointer ${
                                    !row.pricingStrategy
                                      ? 'border-rose-400 bg-rose-50 text-rose-700 ring-1 ring-rose-300'
                                      : 'border-slate-200 bg-white text-slate-800'
                                  }`}
                                >
                                  <option value="">{isAr ? '-- حدد استراتيجية التسعير --' : '-- Select Pricing Strategy --'}</option>
                                  {PRICING_STRATEGIES.map((st) => (
                                    <option key={st.id} value={st.id}>
                                      {isAr ? st.labelAr : st.labelEn}
                                    </option>
                                  ))}
                                </select>
                                {row.pricingStrategyRaw && !row.pricingStrategy && (
                                  <span className="block text-[10px] text-rose-600 font-mono mt-0.5" title="Unmatched raw pricing in CSV">
                                    ⚠️ {row.pricingStrategyRaw}
                                  </span>
                                )}
                                {row.isPricingAutoFilled && row.pricingStrategy && (
                                  <span className="block text-[10px] text-emerald-600 font-medium mt-0.5">
                                    {isAr ? '✓ افتراضي حسب القطاع' : '✓ Auto by segment'}
                                  </span>
                                )}
                              </td>

                              {/* Tax Card */}
                              <td className="py-2.5 px-3 font-mono">{row.taxCardNumber || '—'}</td>

                              {/* Commercial Register */}
                              <td className="py-2.5 px-3 font-mono">{row.commercialRegister || '—'}</td>

                              {/* Tax District */}
                              <td className="py-2.5 px-3 text-slate-600">{row.taxDistrict || '—'}</td>

                              {/* Settlement Mode */}
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px]">
                                  {SETTLEMENT_MODES.find((sm) => sm.id === row.settlementMode)?.labelAr || row.settlementMode}
                                </span>
                              </td>

                              {/* Credit Limit */}
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                                {Number(row.creditLimit).toLocaleString()} ج.م
                              </td>

                              {/* Phones */}
                              <td className="py-2.5 px-3 font-mono max-w-[150px] truncate" title={(row.phones || []).join(', ')}>
                                {(row.phones && row.phones.length > 0) ? row.phones.join(', ') : '—'}
                              </td>

                              {/* Emails */}
                              <td className="py-2.5 px-3 text-slate-600 max-w-[140px] truncate" title={(row.emails || []).join(', ')}>
                                {(row.emails && row.emails.length > 0) ? row.emails.join(', ') : '—'}
                              </td>

                              {/* Weekly Holidays */}
                              <td className="py-2.5 px-3 text-slate-600">
                                {(row.weeklyHolidays || [])
                                  .map((h) => WEEK_DAYS.find((d) => d.id === h)?.labelAr || h)
                                  .join('، ') || '—'}
                              </td>

                              {/* Working Hours */}
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                {row.workingHoursFrom && row.workingHoursTo
                                  ? `${row.workingHoursFrom} - ${row.workingHoursTo}`
                                  : (row.workingHoursFrom
                                      ? `${isAr ? 'من' : 'From'} ${row.workingHoursFrom}`
                                      : (row.workingHoursTo
                                          ? `${isAr ? 'إلى' : 'To'} ${row.workingHoursTo}`
                                          : '—'))}
                              </td>

                              {/* Notes */}
                              <td className="py-2.5 px-3 text-slate-500 max-w-[140px] truncate" title={row.notes}>
                                {row.notes || '—'}
                              </td>

                              {/* Branches Count & Toggle Drawer */}
                              <td className="py-2.5 px-3">
                                <button
                                  type="button"
                                  onClick={() => handleToggleExpandBranches(row.id)}
                                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer ${
                                    row.branches?.length > 1
                                      ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 shadow-xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                  title={isAr ? 'عرض فروع العميل التفصيلية' : 'View all branches'}
                                >
                                  <Boxes className="w-3.5 h-3.5" />
                                  <span>{row.branches?.length || 1} {isAr ? (row.branches?.length === 1 ? 'فرع' : 'فروع') : 'Branches'}</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              </td>

                              {/* Main Branch Columns */}
                              <td className="py-2.5 px-3 font-semibold text-slate-800">
                                {row.branches?.[0]?.nameAr || 'الفرع الرئيسي'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{row.branches?.[0]?.region || '—'}</td>
                              <td className="py-2.5 px-3 text-slate-600 max-w-[160px] truncate" title={row.branches?.[0]?.address}>
                                {row.branches?.[0]?.address || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">{row.branches?.[0]?.contactPerson || '—'}</td>
                              <td className="py-2.5 px-3 font-mono">{row.branches?.[0]?.phone || '—'}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] max-w-[100px] truncate" title={row.branches?.[0]?.gpsCoordinates}>
                                {row.branches?.[0]?.gpsCoordinates || '—'}
                              </td>

                              {/* Conflict Reason / Alerts */}
                              <td className="py-2.5 px-3 text-rose-700 text-[11px] font-bold max-w-[200px] truncate" title={row.errorReason}>
                                {row.errorReason || (row.action === 'skip' ? (isAr ? 'سيتم تخطي هذا السجل' : 'Skipped') : '—')}
                              </td>

                              {/* Delete Row Action */}
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteImportRow(row.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                  title={isAr ? 'استبعاد السجل من الاستيراد' : 'Remove from import'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Multi-Branch Sub-Table */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={26} className="p-0 bg-slate-50 border-y-2 border-blue-200">
                                  <div className="p-3.5 space-y-2">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                      <span className="flex items-center gap-1.5 text-blue-900">
                                        <Boxes className="w-4 h-4 text-blue-600" />
                                        {isAr
                                          ? `تفاصيل فروع العميل (${row.tradeNameAr}) — تم تجميع (${row.branches?.length || 1}) فرع من ملف الـ CSV:`
                                          : `Branches of (${row.tradeNameAr}) — ${row.branches?.length || 1} aggregated from CSV:`}
                                      </span>
                                    </div>

                                    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-xs">
                                      <table className="w-full text-start text-xs border-collapse">
                                        <thead>
                                          <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 whitespace-nowrap">
                                            <th className="py-2 px-3 text-start">#</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'المنطقة' : 'Region'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'العنوان' : 'Address'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'المسؤول' : 'Contact Person'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'هاتف الفرع' : 'Branch Phone'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'الموقع / GPS' : 'GPS Coordinates'}</th>
                                            <th className="py-2 px-3 text-start">{isAr ? 'ملاحظات الفرع' : 'Branch Notes'}</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-medium whitespace-nowrap">
                                          {(row.branches || []).map((br, bIdx) => (
                                            <tr key={bIdx} className="hover:bg-slate-50">
                                              <td className="py-2 px-3 font-mono font-bold text-slate-500">{bIdx + 1}</td>
                                              <td className="py-2 px-3 font-bold text-slate-900">{br.nameAr}</td>
                                              <td className="py-2 px-3">
                                                {br.isMain ? (
                                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-bold text-[10px]">
                                                    {isAr ? 'الفرع الرئيسي' : 'Main Branch'}
                                                  </span>
                                                ) : (
                                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px]">
                                                    {isAr ? 'فرع إضافي' : 'Additional Branch'}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-2 px-3 text-slate-700">{br.region || '—'}</td>
                                              <td className="py-2 px-3 text-slate-600">{br.address || '—'}</td>
                                              <td className="py-2 px-3 text-slate-800">{br.contactPerson || '—'}</td>
                                              <td className="py-2 px-3 font-mono">{br.phone || '—'}</td>
                                              <td className="py-2 px-3 font-mono text-[11px]">{br.gpsCoordinates || '—'}</td>
                                              <td className="py-2 px-3 text-slate-500">{br.notes || '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
                /* ========================================================= */
                /* ALL RAW CSV ROWS VIEW (LINE BY LINE INSPECT)             */
                /* ========================================================= */
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-20 shadow-xs whitespace-nowrap">
                      <th className="py-2.5 px-3 text-start sticky start-0 bg-slate-100 z-30"># سطر</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الكود' : 'Code'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الاسم التجاري (عربي)' : 'Trade Name (Ar)'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الاسم التجاري (إنجليزي)' : 'Trade Name (En)'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الاسم القانوني' : 'Legal Name'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'القطاع' : 'Segment'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'استراتيجية التسعير' : 'Pricing Strategy'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'البطاقة الضريبية' : 'Tax Card'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'السجل التجاري' : 'Comm. Reg'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المأمورية' : 'Tax District'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'طريقة السداد' : 'Settlement'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الحد الائتماني' : 'Credit Limit'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الهواتف' : 'Phones'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'البريد الإلكتروني' : 'Emails'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العطلات' : 'Holidays'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'مواعيد العمل (من)' : 'Hours From'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'مواعيد العمل (إلى)' : 'Hours To'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الملاحظات' : 'Notes'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المنطقة' : 'Region'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العنوان' : 'Address'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المسؤول' : 'Contact Person'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'هاتف الفرع' : 'Branch Phone'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الموقع / GPS' : 'GPS'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium whitespace-nowrap">
                    {rawImportRows.map((raw, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-500 sticky start-0 bg-white z-10 shadow-xs">
                          {raw.lineIndex}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{raw.code}</td>
                        <td className="py-2.5 px-3 font-black text-slate-900">{raw.tradeNameAr}</td>
                        <td className="py-2.5 px-3 text-slate-600">{raw.tradeNameEn || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{raw.legalName || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-700">{raw.segment || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-700">{raw.pricingStrategy || '—'}</td>
                        <td className="py-2.5 px-3 font-mono">{raw.taxCardNumber || '—'}</td>
                        <td className="py-2.5 px-3 font-mono">{raw.commercialRegister || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{raw.taxDistrict || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-700">{raw.settlementMode || '—'}</td>
                        <td className="py-2.5 px-3 font-mono">{raw.creditLimit || '0'}</td>
                        <td className="py-2.5 px-3 font-mono">{raw.phones || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{raw.emails || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{raw.weeklyHolidays || '—'}</td>
                        <td className="py-2.5 px-3 font-mono">{raw.workingHoursFrom || '—'}</td>
                        <td className="py-2.5 px-3 font-mono">{raw.workingHoursTo || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-500">{raw.notes || '—'}</td>
                        <td className="py-2.5 px-3 font-bold text-blue-700">{raw.branchName || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-700">{raw.region || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{raw.address || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-800">{raw.contactPerson || '—'}</td>
                        <td className="py-2.5 px-3 font-mono">{raw.branchPhone || '—'}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">{raw.gpsCoordinates || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs font-bold text-slate-600">
                {isAr ? 'السجلات الجاهزة للاستيراد:' : 'Ready to commit:'}{' '}
                <strong className="text-emerald-700 text-sm">{importStats.readyToCommit}</strong> {isAr ? 'من إجمالي' : 'of'}{' '}
                <strong className="text-slate-800 text-sm">{importStats.totalClients}</strong> {isAr ? 'عميل' : 'clients'}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={importStats.readyToCommit === 0 || isCommittingImport}
                  onClick={handleCommitBulkImport}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isCommittingImport
                      ? (isAr ? 'جاري الاستيراد والتحديث...' : 'Importing & Updating...')
                      : (isAr
                          ? `اعتماد (${importStats.readyToCommit}) عميل (${importStats.totalBranchRows} فرع)`
                          : `Commit (${importStats.readyToCommit}) Clients (${importStats.totalBranchRows} Branches)`)}
                  </span>
                </button>
              </div>
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
