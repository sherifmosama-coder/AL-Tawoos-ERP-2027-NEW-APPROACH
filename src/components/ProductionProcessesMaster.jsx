import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import {
  Workflow,
  Search,
  Plus,
  Edit3,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Package,
  Users,
  ChevronUp,
  ChevronDown,
  Layers,
  X,
  Sparkles,
  ShieldCheck,
  Filter,
  ArrowRight,
  ListOrdered,
  PlusCircle,
  HelpCircle,
  Tag,
  Factory,
  UserPlus
} from 'lucide-react';
import { getTabConfig, hexToRgb } from '../utils/tabAppearanceConfig';

// 14 Initial Processes from proposal spreadsheet
export const INITIAL_SEEDED_PROCESSES = [
  {
    processCode: 'Proc.101',
    nameAr: 'خل اوتو',
    nameEn: 'Automatic Vinegar Line',
    category: 'vinegar',
    description: 'خط تعبئة وتغليف الخل الأوتوماتيكي بالكامل مع ماكينات التعبئة والغلق الآلي وتجفيف وتأريخ العبوات.',
    steps: [
      { stepNum: 1, name: 'تلقيم', desc: 'تلقيم المكنة', mandatory: true },
      { stepNum: 2, name: 'مراقب مكنة', desc: 'مراقبة حركة المكنة', mandatory: true },
      { stepNum: 3, name: 'تغطية', desc: 'تلقيم غطاء', mandatory: true },
      { stepNum: 4, name: 'تنشيف', desc: 'تنشيف العبوات قبل التاريخ', mandatory: true },
      { stepNum: 5, name: 'ظبط منسوب', desc: 'ظبط منسوب المنتج في العبوات و اختبار الغطاء', mandatory: false },
      { stepNum: 6, name: 'مراقب تاريخ', desc: 'مراقبة طباعة التاريخ و جودة الطباعة', mandatory: false },
      { stepNum: 7, name: 'مراقب استيكر', desc: 'مراقبة لصق الاستيكر', mandatory: false },
      { stepNum: 8, name: 'تفريغ السير', desc: 'تفريغ السير', mandatory: false },
      { stepNum: 9, name: 'مراجع جودة', desc: 'مراجعة عامة علي الجودة', mandatory: true },
      { stepNum: 10, name: 'رص بالتات', desc: 'رص المنتج علي البالتة', mandatory: true },
      { stepNum: 11, name: 'تجهيز تراي', desc: 'تجهيز تراي', mandatory: false },
      { stepNum: 12, name: 'اشراف', desc: 'اشراف عام', mandatory: false }
    ],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.102',
    nameAr: 'خل يدوي',
    nameEn: 'Manual Vinegar Line',
    category: 'vinegar',
    description: 'خط تشغيل يدوي ونصف آلي لتعبئة وتغطية وتأريخ عبوات الخل.',
    steps: [
      { stepNum: 1, name: 'تعبئة', desc: 'تعبئة العبوات', mandatory: true },
      { stepNum: 2, name: 'تقفيل عبوات', desc: 'تقفيل و مراجعة منسوب', mandatory: true },
      { stepNum: 3, name: 'تنشيف', desc: 'تنشيف العبوات قبل التاريخ', mandatory: true },
      { stepNum: 4, name: 'مراقب تاريخ', desc: 'مراقبة طباعة التاريخ و جودة الطباعة', mandatory: false },
      { stepNum: 5, name: 'ظبط منسوب', desc: 'ظبط منسوب المنتج في العبوات و اختبار الغطاء', mandatory: false },
      { stepNum: 6, name: 'مراقب استيكر', desc: 'مراقبة لصق الاستيكر', mandatory: false },
      { stepNum: 7, name: 'تفريغ السير', desc: 'تفريغ السير', mandatory: false },
      { stepNum: 8, name: 'تجهيز تراي', desc: 'تجهيز تراي', mandatory: false },
      { stepNum: 9, name: 'رص بالتات', desc: 'رص المنتج علي البالتة', mandatory: true },
      { stepNum: 10, name: 'اشراف', desc: 'اشراف عام', mandatory: false }
    ],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.103',
    nameAr: 'خل جوالين كبيرة',
    nameEn: 'Large Gallons Line',
    category: 'gallons',
    description: 'مسار تشغيل وتعبئة جوالين الخل الكبيرة مع تركيب الحامل ورص البالتات.',
    steps: [
      { stepNum: 1, name: 'استيكر', desc: 'لصق استيكر', mandatory: true },
      { stepNum: 2, name: 'تاريخ', desc: 'تأريخ العبوات', mandatory: true },
      { stepNum: 3, name: 'تركيب يد', desc: 'تركيب الحامل', mandatory: true },
      { stepNum: 4, name: 'تعبئة', desc: 'تعبئة العبوات', mandatory: true },
      { stepNum: 5, name: 'ظبط منسوب', desc: 'ظبط منسوب المنتج في العبوات و اختبار الغطاء', mandatory: false },
      { stepNum: 6, name: 'مراجع جودة', desc: 'مراجعة جودة', mandatory: true },
      { stepNum: 7, name: 'تقفيل غطاء', desc: 'تقفيل غطاء', mandatory: true },
      { stepNum: 8, name: 'رص بالتة', desc: 'رص البالتات', mandatory: true },
      { stepNum: 9, name: 'اشراف', desc: 'اشراف عام', mandatory: false }
    ],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.104',
    nameAr: 'خل جوالين صغيرة',
    nameEn: 'Small Gallons Line',
    category: 'gallons',
    description: 'مسار تشغيل وتعبئة وتغليف الجوالين الصغيرة بالشرنك.',
    steps: [
      { stepNum: 1, name: 'استيكر', desc: 'لصق استيكر', mandatory: true },
      { stepNum: 2, name: 'تاريخ', desc: 'تأريخ العبوات', mandatory: true },
      { stepNum: 3, name: 'تركيب يد', desc: 'تركيب الحامل', mandatory: true },
      { stepNum: 4, name: 'تعبئة', desc: 'تعبئة العبوات', mandatory: true },
      { stepNum: 5, name: 'ظبط منسوب', desc: 'ظبط منسوب المنتج في العبوات و اختبار الغطاء', mandatory: false },
      { stepNum: 6, name: 'مراجع جودة', desc: 'مراجعة جودة', mandatory: true },
      { stepNum: 7, name: 'تقفيل غطاء', desc: 'تقفيل غطاء', mandatory: true },
      { stepNum: 8, name: 'تغليف', desc: 'تغليف بالشرنك', mandatory: true },
      { stepNum: 9, name: 'رص بالتة', desc: 'رص البالتات', mandatory: true },
      { stepNum: 10, name: 'اشراف', desc: 'اشراف عام', mandatory: false }
    ],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.105',
    nameAr: 'خل جراكن',
    nameEn: 'Jerrycans Line',
    category: 'jerrycans',
    description: 'مسار تشغيل وتعبئة جراكن الخل والمطهرات الصناعية.',
    steps: [
      { stepNum: 1, name: 'استيكر', desc: 'لصق استيكر', mandatory: true },
      { stepNum: 2, name: 'تاريخ', desc: 'تأريخ العبوات', mandatory: true },
      { stepNum: 3, name: 'تعبئة', desc: 'تعبئة العبوات', mandatory: true },
      { stepNum: 4, name: 'مراجع جودة', desc: 'مراجعة جودة', mandatory: true },
      { stepNum: 5, name: 'ظبط منسوب', desc: 'ظبط منسوب المنتج في العبوات و اختبار الغطاء', mandatory: false },
      { stepNum: 6, name: 'تقفيل غطاء', desc: 'تقفيل غطاء', mandatory: true },
      { stepNum: 7, name: 'رص بالتة', desc: 'رص البالتات', mandatory: true },
      { stepNum: 8, name: 'اشراف', desc: 'اشراف عام', mandatory: false }
    ],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.106',
    nameAr: 'عرض باندل لتر',
    nameEn: '1L Bundle Offer Line',
    category: 'bundles',
    description: 'خط تجهيز عروض الخل الباندل والبكجات التسويقية الخاصة.',
    steps: [
      { stepNum: 1, name: 'تلقيم', desc: 'تلقيم المكنة', mandatory: true },
      { stepNum: 2, name: 'مراقب مكنة', desc: 'مراقبة حركة المكنة', mandatory: true },
      { stepNum: 3, name: 'تغطية', desc: 'تلقيم غطاء', mandatory: true },
      { stepNum: 4, name: 'تنشيف', desc: 'تنشيف العبوات قبل التاريخ', mandatory: true },
      { stepNum: 5, name: 'ظبط منسوب', desc: 'ظبط منسوب المنتج في العبوات و اختبار الغطاء', mandatory: false },
      { stepNum: 6, name: 'مراقب تاريخ', desc: 'مراقبة طباعة التاريخ و جودة الطباعة', mandatory: false },
      { stepNum: 7, name: 'مراقب استيكر', desc: 'مراقبة لصق الاستيكر', mandatory: false },
      { stepNum: 8, name: 'لصق استيكر عرض', desc: 'لصق استيكر عرض', mandatory: false },
      { stepNum: 9, name: 'تفريغ السير', desc: 'تفريغ السير', mandatory: false },
      { stepNum: 10, name: 'مراجع جودة', desc: 'مراجعة عامة علي الجودة', mandatory: true },
      { stepNum: 11, name: 'رص بالتات', desc: 'رص المنتج علي البالتة', mandatory: true },
      { stepNum: 12, name: 'اشراف', desc: 'اشراف عام', mandatory: false }
    ],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.107',
    nameAr: 'سوائل خفيفة',
    nameEn: 'Light Liquids Line',
    category: 'liquids',
    description: 'خط تعبئة وتغليف السوائل الخفيفة والبرشمة والشرنك الحراري.',
    steps: [
      { stepNum: 1, name: 'استيكر', desc: 'لصق استيكر', mandatory: true },
      { stepNum: 2, name: 'تاريخ', desc: 'تأريخ العبوات', mandatory: true },
      { stepNum: 3, name: 'مراجعة تاريخ', desc: 'مراجعة طباعة التاريخ و جودة الطباعة', mandatory: true },
      { stepNum: 4, name: 'تعبئة', desc: 'تعبئة العبوات', mandatory: true },
      { stepNum: 5, name: 'مراجع جودة', desc: 'مراجعة جودة', mandatory: true },
      { stepNum: 6, name: 'تقفيل غطاء', desc: 'برشمة', mandatory: true },
      { stepNum: 7, name: 'مراجعة برشمة', desc: 'مراجعة احكام غلق العبوات', mandatory: true },
      { stepNum: 8, name: 'تنشيف', desc: 'تنشيف العبوات', mandatory: true },
      { stepNum: 9, name: 'رص العبوات', desc: 'رص العبوات و وضع الفواصل بالشرنك', mandatory: true },
      { stepNum: 10, name: 'تغليف', desc: 'تغليف بالشرنك', mandatory: true },
      { stepNum: 11, name: 'رص بالتات', desc: 'استلام المنتج من ماكينة الشرنك و ضم البلاستيك ثم الرص علي بالتة', mandatory: true },
      { stepNum: 12, name: 'اشراف', desc: 'اشراف عام', mandatory: false }
    ],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.108',
    nameAr: 'طحينة برطمانات',
    nameEn: 'Tahini Jars Line',
    category: 'tahina',
    description: 'مسار تشغيل وتعبئة برطمانات الطحينة الفاخرة.',
    steps: [],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.109',
    nameAr: 'طحينة ظرف',
    nameEn: 'Tahini Sachets Line',
    category: 'tahina',
    description: 'مسار تعبئة أظرف الطحينة الصغيرة وساشيهات المطاعم.',
    steps: [],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.110',
    nameAr: 'طحينة 400 جرام',
    nameEn: 'Tahini 400g Line',
    category: 'tahina',
    description: 'خط تعبئة عبوات الطحينة فئة 400 جرام.',
    steps: [],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.111',
    nameAr: 'طحينة باستلة عادي',
    nameEn: 'Standard Tahini Pails',
    category: 'tahina',
    description: 'مسار تعبئة باستلات وسداسيات الطحينة التجارية.',
    steps: [],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.112',
    nameAr: 'طحينة باستلة أمازون',
    nameEn: 'Amazon Tahini Pails',
    category: 'tahina',
    description: 'مسار تعبئة باستلات الطحينة المخصصة للمنصات والمستودعات المركزية.',
    steps: [],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.113',
    nameAr: 'طحينة سايب',
    nameEn: 'Bulk Bulk Tahini',
    category: 'tahina',
    description: 'مسار صب وتعبئة الطحينة السائبة للبراميل والتانكات.',
    steps: [],
    compatibleProductIds: []
  },
  {
    processCode: 'Proc.114',
    nameAr: 'ارز',
    nameEn: 'Rice Packaging Line',
    category: 'rice',
    description: 'مسار تنقية وفرز وتعبئة أكياس الأرز.',
    steps: [],
    compatibleProductIds: []
  }
];

export default function ProductionProcessesMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // State
  const [processes, setProcesses] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [manualWorkers, setManualWorkers] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [editingProcess, setEditingProcess] = useState(null); // Process builder modal
  const [mappingProcess, setMappingProcess] = useState(null); // Product compatibility modal
  const [showWorkerDrawer, setShowWorkerDrawer] = useState(false); // Workers roster drawer
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerRole, setNewWorkerRole] = useState('تشغيل وتعبئة');
  const [toastMessage, setToastMessage] = useState(null);

  const tabConfig = useMemo(() => getTabConfig('production_processes'), []);

  // 1. Subscribe to Firestore Processes + Auto-Seed Check
  useEffect(() => {
    const unsubProcesses = onSnapshot(collection(db, 'production_processes'), async (snap) => {
      if (snap.empty) {
        // Auto-seed all 14 processes if empty as added by general admin
        try {
          const batch = writeBatch(db);
          INITIAL_SEEDED_PROCESSES.forEach((p) => {
            const docRef = doc(db, 'production_processes', p.processCode);
            batch.set(docRef, {
              ...p,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: currentUser?.id || 'general_admin',
              createdByName: isAr ? (currentUser?.nameAr || 'المسؤول العام') : (currentUser?.name || 'General Admin'),
              isSystemSeeded: true
            });
          });
          await batch.commit();
          console.log('Seeded 14 production processes from spreadsheet into Firestore');
        } catch (err) {
          console.error('Failed to auto-seed production processes:', err);
        }
      } else {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.processCode || '').localeCompare(b.processCode || '', undefined, { numeric: true }));
        setProcesses(list);
        setIsLoading(false);
      }
    });

    // 2. Subscribe to Finished Products (for compatibility)
    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      setFinishedProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 3. Subscribe to Manual Workers Pool
    const unsubWorkers = onSnapshot(collection(db, 'production_workers'), (snap) => {
      setManualWorkers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 4. Subscribe to System Users (for worker assignment)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setSystemUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubProcesses();
      unsubProducts();
      unsubWorkers();
      unsubUsers();
    };
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Filtered Processes
  const filteredProcesses = useMemo(() => {
    return processes.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (p.processCode && p.processCode.toLowerCase().includes(q)) ||
        (p.nameAr && p.nameAr.toLowerCase().includes(q)) ||
        (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.steps && p.steps.some((s) => s.name?.toLowerCase().includes(q) || s.desc?.toLowerCase().includes(q)))
      );
    });
  }, [processes, selectedCategory, searchQuery]);

  // Combined Worker Pool
  const combinedWorkerPool = useMemo(() => {
    const fromUsers = systemUsers.map((u) => ({
      id: u.id,
      name: isAr ? (u.nameAr || u.name) : (u.name || u.nameAr),
      role: u.role || 'موظف نظام',
      isManual: false
    }));
    const fromManual = manualWorkers.map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role || 'عامل تشغيل',
      isManual: true
    }));
    return [...fromUsers, ...fromManual];
  }, [systemUsers, manualWorkers, isAr]);

  // Helper to generate next sequential process code (e.g. Proc.115)
  const getNextProcessCode = () => {
    let maxNum = 100;
    processes.forEach((p) => {
      const code = p.processCode || p.id || '';
      const match = code.match(/Proc\.(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    return `Proc.${maxNum + 1}`;
  };

  // Open Create Process Modal with pre-configured step
  const handleOpenCreateProcess = () => {
    const nextCode = getNextProcessCode();
    const defaultCat = selectedCategory !== 'all' ? selectedCategory : 'vinegar';
    setEditingProcess({
      id: null,
      processCode: nextCode,
      nameAr: '',
      nameEn: '',
      category: defaultCat,
      description: '',
      steps: [
        { stepNum: 1, name: '', desc: '', mandatory: true }
      ],
      compatibleProductIds: []
    });
  };

  // Duplicate an existing process
  const handleDuplicateProcess = (source) => {
    if (!source) return;
    const nextCode = getNextProcessCode();
    const duplicated = {
      id: null, // Signals a new document
      processCode: nextCode,
      nameAr: source.nameAr
        ? (source.nameAr.includes('نسخة') ? source.nameAr : `${source.nameAr} (نسخة)`)
        : '',
      nameEn: source.nameEn
        ? (source.nameEn.includes('Copy') ? source.nameEn : `${source.nameEn} (Copy)`)
        : '',
      category: source.category || 'general',
      description: source.description || '',
      steps: (source.steps || []).map((s, idx) => ({
        stepNum: idx + 1,
        name: s.name || '',
        desc: s.desc || '',
        mandatory: s.mandatory !== false
      })),
      compatibleProductIds: [...(source.compatibleProductIds || [])]
    };
    setEditingProcess(duplicated);
    showToast(
      isAr
        ? `تم تجهيز نسخة جديدة بالكود (${nextCode}). راجع التفاصيل ثم احفظ المسار.`
        : `Cloned as (${nextCode}). Review and save as a new process.`
    );
  };

  // Duplicate current process from within the modal
  const handleDuplicateFromCurrentModal = () => {
    if (!editingProcess) return;
    const nextCode = getNextProcessCode();
    setEditingProcess((prev) => ({
      ...prev,
      id: null,
      processCode: nextCode,
      nameAr: prev.nameAr
        ? (prev.nameAr.includes('نسخة') ? prev.nameAr : `${prev.nameAr} (نسخة)`)
        : '',
      nameEn: prev.nameEn
        ? (prev.nameEn.includes('Copy') ? prev.nameEn : `${prev.nameEn} (Copy)`)
        : '',
      steps: (prev.steps || []).map((s, idx) => ({
        ...s,
        stepNum: idx + 1
      }))
    }));
    showToast(
      isAr
        ? `تم تحويل المسار إلى نسخة جديدة بالكود (${nextCode})`
        : `Transformed into new process with code (${nextCode})`
    );
  };

  // Handle Save Process from Editor
  const handleSaveProcess = async (formData) => {
    try {
      const code = (formData.processCode || '').trim();
      if (!code) {
        alert(isAr ? 'يرجى إدخال كود مسار التشغيل (مثال: Proc.115)' : 'Process Code is required (e.g. Proc.115)');
        return;
      }

      if (!formData.nameAr?.trim() && !formData.nameEn?.trim()) {
        alert(isAr ? 'يرجى إدخال اسم مسار التشغيل بالعربية أو الإنجليزية' : 'Process Name is required');
        return;
      }

      // Check code uniqueness across existing processes
      const codeCollision = processes.find(
        (p) => (p.processCode?.toLowerCase() === code.toLowerCase() || p.id?.toLowerCase() === code.toLowerCase()) && p.id !== formData.id
      );
      if (codeCollision) {
        alert(
          isAr
            ? `كود المسار (${code}) مستخدم بالفعل في مسار "${codeCollision.nameAr || codeCollision.nameEn}". يرجى اختيار كود فريد.`
            : `Process code (${code}) is already in use by "${codeCollision.nameEn || codeCollision.nameAr}". Please choose a unique code.`
        );
        return;
      }

      // Clean empty steps and re-index
      const cleanedSteps = (formData.steps || [])
        .filter((s) => s && s.name && s.name.trim() !== '')
        .map((s, idx) => ({
          stepNum: idx + 1,
          name: s.name.trim(),
          desc: (s.desc || '').trim(),
          mandatory: s.mandatory !== false
        }));

      const isNew = !formData.id;
      const docId = formData.id || code;
      const docRef = doc(db, 'production_processes', docId);

      const payload = {
        id: docId,
        processCode: code,
        nameAr: (formData.nameAr || formData.nameEn || '').trim(),
        nameEn: (formData.nameEn || '').trim(),
        category: formData.category || 'general',
        description: (formData.description || '').trim(),
        steps: cleanedSteps,
        compatibleProductIds: formData.compatibleProductIds || [],
        updatedAt: serverTimestamp(),
        lastModifiedBy: currentUser?.id || 'admin',
        lastModifiedByName: isAr ? (currentUser?.nameAr || currentUser?.name) : currentUser?.name
      };

      if (isNew) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = currentUser?.id || 'admin';
        payload.createdByName = isAr ? (currentUser?.nameAr || currentUser?.name) : currentUser?.name;
      }

      await setDoc(docRef, payload, { merge: true });
      setEditingProcess(null);
      showToast(
        isNew
          ? (isAr ? `تم إضافة مسار التشغيل الجديد (${code}) بنجاح` : `New process (${code}) added successfully`)
          : (isAr ? `تم حفظ تعديلات مسار التشغيل (${code})` : `Process (${code}) updated successfully`)
      );
    } catch (err) {
      console.error('Error saving process:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المسار' : 'Failed to save process');
    }
  };

  // Handle Delete Process
  const handleDeleteProcess = async (p) => {
    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف مسار التشغيل (${p.processCode} - ${p.nameAr})؟`
      : `Are you sure you want to delete process (${p.processCode} - ${p.nameEn || p.nameAr})?`;
    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, 'production_processes', p.id));
        showToast(isAr ? 'تم حذف مسار التشغيل' : 'Process deleted');
      } catch (err) {
        console.error('Error deleting process:', err);
      }
    }
  };

  // Handle Save Product Compatibility Mapping
  const handleSaveCompatibility = async (processId, selectedProductIds) => {
    try {
      await setDoc(
        doc(db, 'production_processes', processId),
        {
          compatibleProductIds: selectedProductIds,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setMappingProcess(null);
      showToast(isAr ? 'تم تحديث مصفوفة توافق الأصناف بنجاح' : 'Product compatibility saved');
    } catch (err) {
      console.error('Failed to save compatibility:', err);
    }
  };

  // Handle Add Manual Worker
  const handleAddManualWorker = async (e) => {
    e.preventDefault();
    if (!newWorkerName.trim()) return;
    try {
      const workerId = `WRK-${Date.now()}`;
      await setDoc(doc(db, 'production_workers', workerId), {
        id: workerId,
        name: newWorkerName.trim(),
        role: newWorkerRole.trim(),
        createdAt: serverTimestamp(),
        createdBy: currentUser?.id || 'admin'
      });
      setNewWorkerName('');
      showToast(isAr ? 'تمت إضافة العامل إلى طاقم الإنتاج' : 'Worker added to production roster');
    } catch (err) {
      console.error('Failed to add worker:', err);
    }
  };

  // Handle Delete Manual Worker
  const handleDeleteWorker = async (wId) => {
    try {
      await deleteDoc(doc(db, 'production_workers', wId));
      showToast(isAr ? 'تم حذف العامل من القائمة' : 'Worker removed from roster');
    } catch (err) {
      console.error('Failed to remove worker:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 start-1/2 -translate-x-1/2 z-100 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold border border-slate-700 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Filter, Search & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث بالكود أو الاسم أو الخطوة...' : 'Search code, name, step...'}
              className="w-full ps-9 pe-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowWorkerDrawer(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl shadow-2xs hover:shadow-xs transition cursor-pointer"
            >
              <Users className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>{isAr ? 'طاقم العمالة والمشغلين' : 'Workers Roster'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 font-mono font-bold">
                {combinedWorkerPool.length}
              </span>
            </button>

            <button
              type="button"
              onClick={handleOpenCreateProcess}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>{isAr ? 'إضافة مسار تشغيل جديد' : 'New Process'}</span>
            </button>
          </div>
        </div>

        {/* Category Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 me-1 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" />
            <span>{isAr ? 'القسم:' : 'Category:'}</span>
          </span>
          {[
            { id: 'all', labelAr: 'كافة المسارات', labelEn: 'All Processes' },
            { id: 'vinegar', labelAr: 'الخل والعبوات العادية', labelEn: 'Vinegar & Bottles' },
            { id: 'gallons', labelAr: 'الجوالين', labelEn: 'Gallons' },
            { id: 'jerrycans', labelAr: 'الجراكن', labelEn: 'Jerrycans' },
            { id: 'bundles', labelAr: 'عروض وباندل', labelEn: 'Bundles & Offers' },
            { id: 'liquids', labelAr: 'سوائل خفيفة', labelEn: 'Light Liquids' },
            { id: 'tahina', labelAr: 'طحينة', labelEn: 'Tahini' },
            { id: 'rice', labelAr: 'أرز', labelEn: 'Rice' }
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isAr ? cat.labelAr : cat.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Processes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredProcesses.map((process) => {
          const steps = process.steps || [];
          const mandatoryCount = steps.filter((s) => s.mandatory).length;
          const optionalCount = steps.length - mandatoryCount;
          const compatibleCount = (process.compatibleProductIds || []).length;

          return (
            <div
              key={process.id || process.processCode}
              className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all duration-200 p-5 shadow-2xs hover:shadow-md flex flex-col justify-between group"
            >
              <div className="space-y-3.5">
                {/* Header row: Code badge + Name + Actions */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {process.processCode}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {process.category || 'general'}
                      </span>
                    </div>
                    <h4 className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition">
                      {isAr ? process.nameAr : (process.nameEn || process.nameAr)}
                    </h4>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDuplicateProcess(process)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                      title={isAr ? 'نسخ / استنساخ المسار كقالب جديد' : 'Duplicate Process as New'}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProcess(process)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                      title={isAr ? 'تعديل المسار والخطوات' : 'Edit process & steps'}
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProcess(process)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title={isAr ? 'حذف المسار' : 'Delete process'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[36px]">
                  {process.description || (isAr ? 'لا يوجد وصف مدخل لهذا المسار.' : 'No description available.')}
                </p>

                {/* Stats Summary Pills */}
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2">
                    <span className="text-[10px] font-bold text-slate-400 block">{isAr ? 'إجمالي الخطوات' : 'Total Steps'}</span>
                    <span className="text-sm font-mono font-black text-slate-800">{steps.length}</span>
                  </div>
                  <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-2">
                    <span className="text-[10px] font-bold text-emerald-600 block">{isAr ? 'إلزامية' : 'Mandatory'}</span>
                    <span className="text-sm font-mono font-black text-emerald-700">{mandatoryCount}</span>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-2">
                    <span className="text-[10px] font-bold text-amber-600 block">{isAr ? 'اختيارية' : 'Optional'}</span>
                    <span className="text-sm font-mono font-black text-amber-700">{optionalCount}</span>
                  </div>
                </div>

                {/* Steps Snippet Preview */}
                {steps.length > 0 ? (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {isAr ? 'تسلسل الخطوات التنفيذية:' : 'Step Workflow Sequence:'}
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                      {steps.map((step, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border font-medium ${
                            step.mandatory
                              ? 'bg-slate-50 text-slate-800 border-slate-300 font-bold'
                              : 'bg-slate-50/50 text-slate-500 border-slate-200'
                          }`}
                          title={`${step.name}: ${step.desc} (${step.mandatory ? (isAr ? 'إلزامي' : 'Mandatory') : (isAr ? 'اختياري' : 'Optional')})`}
                        >
                          <span className="text-[9px] font-mono text-slate-400">#{step.stepNum || idx + 1}</span>
                          <span>{step.name}</span>
                          {step.mandatory && <span className="text-[8px] text-emerald-600 font-black">★</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-center">
                    <span className="text-xs text-amber-700 font-medium">
                      {isAr ? 'مسار مسودة - لم تتم إضافة خطوات تنفيذية بعد.' : 'Draft template - no steps configured yet.'}
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Card Actions: Product compatibility, Duplicate & Edit */}
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setMappingProcess(process)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>{isAr ? 'الأصناف المتوافقة' : 'Compatible SKUs'}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-200/80 font-mono">
                    {compatibleCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDuplicateProcess(process)}
                  className="py-1.5 px-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-indigo-600 text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title={isAr ? 'استنساخ هذا المسار كمسار جديد' : 'Duplicate this process'}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{isAr ? 'نسخ' : 'Clone'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingProcess(process)}
                  className="py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  {isAr ? 'تعديل الخطوات' : 'Edit Steps'}
                </button>
              </div>
            </div>
          );
        })}

        {/* Empty State when no processes match filters */}
        {filteredProcesses.length === 0 && (
          <div className="col-span-full bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-2xs">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Workflow className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-slate-800">
                {isAr ? 'لم يتم العثور على مسارات تشغيل مطابقة' : 'No Production Processes Found'}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchQuery
                  ? (isAr ? `لا توجد مسارات تشغيل تطابق بحثك عن "${searchQuery}". جرب البحث بكلمات أخرى أو أعد ضبط الفلتر.` : `No processes match "${searchQuery}". Try different keywords or clear filters.`)
                  : (isAr ? 'لا توجد مسارات مسجلة في هذا القسم حالياً. يمكنك إنشاء مسار جديد أو استنساخ مسار سابق.' : 'No processes registered under this category yet. You can create a new process or clone an existing one.')}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  {isAr ? 'مسح البحث' : 'Clear Search'}
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreateProcess}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{isAr ? 'إضافة مسار تشغيل جديد' : 'Add New Process'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. PROCESS & STEP BUILDER MODAL */}
      {/* ========================================================================= */}
      {editingProcess && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <Workflow className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingProcess.id
                      ? (isAr ? `تعديل مسار التشغيل: ${editingProcess.processCode}` : `Edit Process: ${editingProcess.processCode}`)
                      : (editingProcess.nameAr?.includes('نسخة') || editingProcess.nameEn?.includes('Copy')
                          ? (isAr ? `استنساخ مسار تشغيل جديد: ${editingProcess.processCode}` : `Clone Process: ${editingProcess.processCode}`)
                          : (isAr ? `إنشاء مسار تشغيل جديد: ${editingProcess.processCode}` : `Create New Process: ${editingProcess.processCode}`))}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'تحديد كود المسار، الاسم، والخطوات التشغيلية ومعايير الإلزام' : 'Define process code, title, and SOP steps sequence'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingProcess(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveProcess(editingProcess);
              }}
              className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5"
            >
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'كود المسار (Process Code) *' : 'Process Code *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProcess.processCode || ''}
                    onChange={(e) => setEditingProcess({ ...editingProcess, processCode: e.target.value })}
                    placeholder="Proc.101"
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم المسار بالعربية *' : 'Name (Arabic) *'}
                  </label>
                  <input
                    type="text"
                    required
                    dir="rtl"
                    value={editingProcess.nameAr || ''}
                    onChange={(e) => setEditingProcess({ ...editingProcess, nameAr: e.target.value })}
                    placeholder="خل اوتو"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم المسار بالإنجليزية' : 'Name (English)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editingProcess.nameEn || ''}
                    onChange={(e) => setEditingProcess({ ...editingProcess, nameEn: e.target.value })}
                    placeholder="Automatic Vinegar Line"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'القسم / الفئة' : 'Category'}
                  </label>
                  <select
                    value={editingProcess.category || 'vinegar'}
                    onChange={(e) => setEditingProcess({ ...editingProcess, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white font-bold"
                  >
                    <option value="vinegar">{isAr ? 'الخل والعبوات' : 'Vinegar'}</option>
                    <option value="gallons">{isAr ? 'جوالين' : 'Gallons'}</option>
                    <option value="jerrycans">{isAr ? 'جراكن' : 'Jerrycans'}</option>
                    <option value="bundles">{isAr ? 'عروض وباندل' : 'Bundles'}</option>
                    <option value="liquids">{isAr ? 'سوائل خفيفة' : 'Liquids'}</option>
                    <option value="tahina">{isAr ? 'طحينة' : 'Tahini'}</option>
                    <option value="rice">{isAr ? 'أرز' : 'Rice'}</option>
                    <option value="general">{isAr ? 'عام' : 'General'}</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'الوصف وملاحظات خط التشغيل (SOP Overview)' : 'Process SOP Description'}
                  </label>
                  <input
                    type="text"
                    value={editingProcess.description || ''}
                    onChange={(e) => setEditingProcess({ ...editingProcess, description: e.target.value })}
                    placeholder={isAr ? 'وصف تسلسل الخطوات ونوع خط التعبئة...' : 'Detailed overview of this packing process...'}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Steps Management */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                      <ListOrdered className="h-4 w-4 text-indigo-600" />
                      <span>{isAr ? 'قائمة الخطوات التشغيلية' : 'Process Steps Roster'}</span>
                      <span className="text-xs font-mono font-normal text-slate-400">
                        ({(editingProcess.steps || []).length} خطوات)
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {isAr
                        ? 'رتب الخطوات، حدد المسمى والمهمة، وعيّن حالة الخطوة (إلزامية تشترط وجود عامل، أو اختيارية).'
                        : 'Organize steps, instructions, and mark whether each step is mandatory or optional.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const currentSteps = editingProcess.steps || [];
                      const nextNum = currentSteps.length + 1;
                      setEditingProcess({
                        ...editingProcess,
                        steps: [
                          ...currentSteps,
                          {
                            stepNum: nextNum,
                            name: '',
                            desc: '',
                            mandatory: true
                          }
                        ]
                      });
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إضافة خطوة' : 'Add Step'}</span>
                  </button>
                </div>

                {/* Steps List */}
                <div className="space-y-2.5">
                  {(editingProcess.steps || []).map((step, sIdx) => {
                    const isFirst = sIdx === 0;
                    const isLast = sIdx === (editingProcess.steps || []).length - 1;

                    return (
                      <div
                        key={sIdx}
                        className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center gap-2.5 ${
                          step.mandatory ? 'bg-slate-50/70 border-slate-200' : 'bg-white border-slate-200'
                        }`}
                      >
                        {/* Step Number Badge & Reorder */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono text-xs font-black text-slate-700 bg-white px-2 py-1 rounded-lg border border-slate-200 min-w-[32px] text-center">
                            #{sIdx + 1}
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={isFirst}
                              onClick={() => {
                                const newSteps = [...editingProcess.steps];
                                const tmp = newSteps[sIdx];
                                newSteps[sIdx] = newSteps[sIdx - 1];
                                newSteps[sIdx - 1] = tmp;
                                newSteps.forEach((s, idx) => (s.stepNum = idx + 1));
                                setEditingProcess({ ...editingProcess, steps: newSteps });
                              }}
                              className={`p-0.5 rounded ${isFirst ? 'text-slate-300' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-200 cursor-pointer'}`}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={isLast}
                              onClick={() => {
                                const newSteps = [...editingProcess.steps];
                                const tmp = newSteps[sIdx];
                                newSteps[sIdx] = newSteps[sIdx + 1];
                                newSteps[sIdx + 1] = tmp;
                                newSteps.forEach((s, idx) => (s.stepNum = idx + 1));
                                setEditingProcess({ ...editingProcess, steps: newSteps });
                              }}
                              className={`p-0.5 rounded ${isLast ? 'text-slate-300' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-200 cursor-pointer'}`}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Step Name */}
                        <div className="w-full sm:w-44">
                          <input
                            type="text"
                            required
                            value={step.name || ''}
                            onChange={(e) => {
                              const newSteps = [...editingProcess.steps];
                              newSteps[sIdx].name = e.target.value;
                              setEditingProcess({ ...editingProcess, steps: newSteps });
                            }}
                            placeholder={isAr ? 'اسم الخطوة (تلقيم)' : 'Step Name'}
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        {/* Step Description */}
                        <div className="flex-1">
                          <input
                            type="text"
                            value={step.desc || ''}
                            onChange={(e) => {
                              const newSteps = [...editingProcess.steps];
                              newSteps[sIdx].desc = e.target.value;
                              setEditingProcess({ ...editingProcess, steps: newSteps });
                            }}
                            placeholder={isAr ? 'وصف المهمة / التعليمات (تلقيم العبوات الفارغة)...' : 'Task details & instructions...'}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        {/* Mandatory Toggle Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const newSteps = [...editingProcess.steps];
                            newSteps[sIdx].mandatory = !newSteps[sIdx].mandatory;
                            setEditingProcess({ ...editingProcess, steps: newSteps });
                          }}
                          className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer shrink-0 ${
                            step.mandatory
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {step.mandatory ? (isAr ? 'إلزامي ★' : 'Mandatory ★') : (isAr ? 'اختياري' : 'Optional')}
                        </button>

                        {/* Delete Step */}
                        <button
                          type="button"
                          onClick={() => {
                            const newSteps = editingProcess.steps.filter((_, idx) => idx !== sIdx);
                            newSteps.forEach((s, idx) => (s.stepNum = idx + 1));
                            setEditingProcess({ ...editingProcess, steps: newSteps });
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer shrink-0"
                          title={isAr ? 'حذف هذه الخطوة' : 'Delete step'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}

                  {(editingProcess.steps || []).length === 0 && (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-2">
                      <Workflow className="h-8 w-8 text-slate-300 mx-auto" />
                      <p className="text-xs text-slate-500">
                        {isAr ? 'لم تتم إضافة خطوات تشغيلية بعد. انقر على "إضافة خطوة" للبدء.' : 'No steps added yet. Click "Add Step" to begin.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                {editingProcess.id ? (
                  <button
                    type="button"
                    onClick={handleDuplicateFromCurrentModal}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition cursor-pointer shadow-2xs"
                    title={isAr ? 'نسخ هذا المسار كمسار تشغيل جديد منفصل' : 'Clone this process as a new separate process'}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{isAr ? 'نسخ كمسار جديد' : 'Duplicate as New'}</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingProcess(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    <span>{isAr ? 'حفظ مسار التشغيل' : 'Save Process'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PRODUCT COMPATIBILITY MAPPING MODAL */}
      {/* ========================================================================= */}
      {mappingProcess && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <Package className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {isAr ? 'ربط المنتجات المتوافقة مع المسار' : 'Map Compatible Products'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {mappingProcess.processCode} • {isAr ? mappingProcess.nameAr : mappingProcess.nameEn}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMappingProcess(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content: Checklist of finished products */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {isAr ? 'حدد المنتجات التامة القابلة للتشغيل عبر هذا المسار:' : 'Select finished goods that can be produced using this process:'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = finishedProducts.map((p) => p.id);
                      setMappingProcess({ ...mappingProcess, compatibleProductIds: allIds });
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {isAr ? 'تحديد الكل' : 'Select All'}
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMappingProcess({ ...mappingProcess, compatibleProductIds: [] });
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                  >
                    {isAr ? 'إلغاء التحديد' : 'Deselect All'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
                {finishedProducts.map((prod) => {
                  const isChecked = (mappingProcess.compatibleProductIds || []).includes(prod.id);

                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center gap-2.5 p-3 rounded-2xl border transition cursor-pointer ${
                        isChecked
                          ? 'bg-indigo-50/70 border-indigo-400 text-indigo-950 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const current = mappingProcess.compatibleProductIds || [];
                          const updated = isChecked
                            ? current.filter((id) => id !== prod.id)
                            : [...current, prod.id];
                          setMappingProcess({ ...mappingProcess, compatibleProductIds: updated });
                        }}
                        className="accent-indigo-600 rounded h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">
                          {isAr ? (prod.nameAr || prod.name) : (prod.nameEn || prod.nameAr || prod.name)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          #{prod.itemCode || prod.id} • {prod.productLine || prod.category || 'Standard'}
                        </div>
                      </div>
                    </label>
                  );
                })}

                {finishedProducts.length === 0 && (
                  <div className="col-span-2 p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-500">
                    {isAr ? 'لم يتم العثور على منتجات تامة مسجلة.' : 'No finished goods found in Item Master.'}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMappingProcess(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleSaveCompatibility(mappingProcess.id, mappingProcess.compatibleProductIds || [])}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition cursor-pointer"
              >
                {isAr ? 'حفظ التوافق' : 'Save Compatibility'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. WORKERS ROSTER DRAWER (HR FORWARD-COMPATIBLE) */}
      {/* ========================================================================= */}
      {showWorkerDrawer && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="bg-white max-w-md w-full h-full shadow-2xl flex flex-col border-s border-slate-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    {isAr ? 'سجل طاقم وعمالة خطوط الإنتاج' : 'Production Floor Workers Roster'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {isAr ? 'مهيأ للربط مستقبلاً مع وحدة الموارد البشرية (HR)' : 'Ready for upcoming HR module linking'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWorkerDrawer(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Add New Worker Form */}
            <form onSubmit={handleAddManualWorker} className="p-4 border-b border-slate-100 bg-indigo-50/40 space-y-3">
              <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-indigo-600" />
                <span>{isAr ? 'إضافة عامل ميداني جديد:' : 'Add New Floor Worker:'}</span>
              </span>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  placeholder={isAr ? 'اسم العامل الكامل...' : 'Worker Full Name...'}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={newWorkerRole}
                  onChange={(e) => setNewWorkerRole(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 font-bold"
                >
                  <option value="تشغيل وتعبئة">{isAr ? 'تشغيل وتعبئة' : 'Packaging & Filling'}</option>
                  <option value="تلقيم وتغذية">{isAr ? 'تلقيم وتغذية' : 'Line Feeding'}</option>
                  <option value="مراقبة ومتابعة">{isAr ? 'مراقبة ومتابعة' : 'Monitoring'}</option>
                  <option value="رص بالتات">{isAr ? 'رص بالتات' : 'Pallet Stacking'}</option>
                  <option value="فحص جودة">{isAr ? 'فحص جودة' : 'QC Inspection'}</option>
                  <option value="إشراف خط">{isAr ? 'إشراف خط' : 'Line Supervision'}</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isAr ? 'إدراج العامل في الطاقم' : 'Add to Roster'}</span>
              </button>
            </form>

            {/* Workers List */}
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                {isAr ? 'العمال والمشغلون المتاحون:' : 'Available Workers Pool:'}
              </span>

              {combinedWorkerPool.map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      worker.isManual ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      {worker.name?.charAt(0) || 'W'}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{worker.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span>{worker.role}</span>
                        <span>•</span>
                        <span className="font-mono">{worker.isManual ? (isAr ? 'عامل إنتاج' : 'Floor Worker') : (isAr ? 'مستخدم مسجل' : 'System User')}</span>
                      </div>
                    </div>
                  </div>

                  {worker.isManual && (
                    <button
                      type="button"
                      onClick={() => handleDeleteWorker(worker.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                      title={isAr ? 'حذف العامل' : 'Remove worker'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWorkerDrawer(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
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
