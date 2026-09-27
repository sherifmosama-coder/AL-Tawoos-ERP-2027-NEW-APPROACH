import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  AlertOctagon,
  RotateCcw,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Eye,
  Tag,
  Image as ImageIcon,
  FileText,
  Warehouse,
  Truck,
  User,
  Calendar,
  X,
  Printer,
  AlertCircle,
  Filter,
  Check,
  Package,
  Layers,
  Sparkles,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Settings,
  Sliders,
  Maximize2,
  PrinterCheck,
  CheckSquare,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { translateBatchToPallets, parseInkjetBatch } from '../utils/inkjetBatchTranslator';
import {
  getStoredThermalConfig,
  saveStoredThermalConfig,
  DEFAULT_THERMAL_CONFIG,
} from '../utils/thermalLabelGenerator';

// Client-side image compression helper
const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.75) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function FaultyFGReturnMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const currentUserId = currentUser?.id || currentUser?.uid || '';
  const isGeneralAdmin = !!(currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin');
  const canCreate = isGeneralAdmin || (permissions?.actions?.['faulty_fg.canCreate'] ?? permissions?.actions?.canCreate ?? true);
  const canEdit = isGeneralAdmin || (permissions?.actions?.['faulty_fg.canEdit'] ?? permissions?.actions?.canEdit ?? true);
  const canCancel = isGeneralAdmin || (permissions?.actions?.['faulty_fg.canCancel'] ?? permissions?.actions?.canCancel ?? true);
  const canConfirm = isGeneralAdmin || (permissions?.actions?.['faulty_fg.canConfirm'] ?? permissions?.actions?.canConfirm ?? true);
  const canResolve = isGeneralAdmin || (permissions?.actions?.['faulty_fg.canResolve'] ?? permissions?.actions?.canResolve ?? true);
  const canPrint = isGeneralAdmin || (permissions?.actions?.['faulty_fg.canPrint'] ?? permissions?.actions?.canPrint ?? true);

  // Permission Check for Voucher Modification
  const canEditVoucher = (voucher) => {
    if (!voucher) return false;
    // 1. Strict lock if already reworked or scrapped
    if (voucher.status === 'reworked' || voucher.status === 'scrapped') {
      return false;
    }
    // 2. Permission check
    if (!canEdit) return false;
    // 3. Allowed for General Admin
    if (isGeneralAdmin) return true;
    // 4. Allowed for the creator/submitter
    const submitterId = voucher.submittedBy?.userId;
    return Boolean(currentUserId && submitterId && currentUserId === submitterId);
  };

  // Firestore Subscriptions
  const [returnsList, setReturnsList] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending_acceptance' | 'received_on_floor' | 'reworked' | 'scrapped'
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'fg_warehouse' | 'sales_return'
  const [tagFilter, setTagFilter] = useState('all');
  const [printFilter, setPrintFilter] = useState('all'); // 'all' | 'unprinted' | 'printed'

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [activeVoucher, setActiveVoucher] = useState(null);

  // Voucher-level Form State
  const [sourceType, setSourceType] = useState('sales_return'); // 'fg_warehouse' | 'sales_return'
  const [returnNoteNo, setReturnNoteNo] = useState('');
  const [clientName, setClientName] = useState('');
  const [vehicleOrDriver, setVehicleOrDriver] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);

  // Staged Product Items (Multi-Product support)
  const [stagedItems, setStagedItems] = useState([]);

  // Active Line Entry Form State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedPackagingOptionSuffix, setSelectedPackagingOptionSuffix] = useState('A');
  const [qtyLarge, setQtyLarge] = useState('');
  const [qtySmall, setQtySmall] = useState('');
  const [printedBatchNo, setPrintedBatchNo] = useState('');
  const [batchTranslationResult, setBatchTranslationResult] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Thermal Printing State
  const [printQueue, setPrintQueue] = useState([]); // Array of { voucherId, returnDate, item, itemIndex }
  const [printMode, setPrintMode] = useState('per_large_unit'); // 'per_large_unit' | 'single_consolidated' | 'per_small_unit'
  const [thermalConfig, setThermalConfig] = useState(getStoredThermalConfig());
  const [showPageSetup, setShowPageSetup] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Confirm Receipt State
  const [confirmNotes, setConfirmNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Resolve State
  const [resolutionType, setResolutionType] = useState('reworked'); // 'reworked' | 'scrapped'
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // 1. Subscribe to Firestore Collections
  useEffect(() => {
    const unsubReturns = onSnapshot(
      collection(db, 'faulty_fg_returns'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setReturnsList(list);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error fetching faulty returns:', err);
        setIsLoading(false);
      }
    );

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setFinishedProducts(list);
    });

    const unsubOrders = onSnapshot(collection(db, 'work_orders'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setWorkOrders(list);
    });

    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setWarehouses(list);
    });

    return () => {
      unsubReturns();
      unsubProducts();
      unsubOrders();
      unsubWh();
    };
  }, []);

  // Compute Selected Finished Product Details for active line
  const activeProduct = useMemo(() => {
    return finishedProducts.find((p) => p.id === selectedProductId || p.code === selectedProductId) || null;
  }, [finishedProducts, selectedProductId]);

  // Derived Available Packaging Options for active finished good
  const availablePackagingOptions = useMemo(() => {
    if (!activeProduct) return [];
    if (Array.isArray(activeProduct.packagingOptions) && activeProduct.packagingOptions.length > 0) {
      return activeProduct.packagingOptions;
    }
    return [
      {
        id: 'OPT-01',
        suffix: 'A',
        optionCode: `${activeProduct.code || activeProduct.id}-A`,
        nameAr: 'التصميم القياسي المعتمد',
        nameEn: 'Standard Certified Design',
        packagingRatio: Number(activeProduct.packagingRatio || activeProduct.unitsPerCase || 12),
        isActive: true,
      },
    ];
  }, [activeProduct]);

  // Active Packaging Option based on selected suffix
  const activePackagingOption = useMemo(() => {
    if (!availablePackagingOptions.length) return null;
    return (
      availablePackagingOptions.find((opt) => opt.suffix === selectedPackagingOptionSuffix) ||
      availablePackagingOptions[0]
    );
  }, [availablePackagingOptions, selectedPackagingOptionSuffix]);

  const packagingRatio = Number(
    activePackagingOption?.packagingRatio ||
    activeProduct?.packagingRatio ||
    activeProduct?.unitsPerCase ||
    12
  );

  // Handle Finished Good Product Selection
  const handleProductSelect = (prodId) => {
    setSelectedProductId(prodId);
    const prod = finishedProducts.find((p) => p.id === prodId || p.code === prodId);
    const options = Array.isArray(prod?.packagingOptions) && prod.packagingOptions.length > 0
      ? prod.packagingOptions
      : [];
    const initialSuffix = options[0]?.suffix || 'A';
    setSelectedPackagingOptionSuffix(initialSuffix);
    setQtyLarge('');
    setQtySmall('');
    setBatchTranslationResult(null);
  };

  // Handle Packaging Option Change (Recalculates quantities using the option's ratio)
  const handlePackagingOptionChange = (suffix) => {
    setSelectedPackagingOptionSuffix(suffix);
    const opt = availablePackagingOptions.find((o) => o.suffix === suffix);
    const newRatio = Number(opt?.packagingRatio || activeProduct?.packagingRatio || activeProduct?.unitsPerCase || 12);
    if (qtyLarge !== '' && !isNaN(parseFloat(qtyLarge))) {
      setQtySmall(Math.round(parseFloat(qtyLarge) * newRatio));
    } else if (qtySmall !== '' && !isNaN(parseFloat(qtySmall))) {
      setQtyLarge(Number((parseFloat(qtySmall) / newRatio).toFixed(2)));
    }
  };

  // Bi-directional Unit Conversion Handlers for active line
  const handleQtyLargeChange = (val) => {
    setQtyLarge(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setQtySmall(Math.round(num * packagingRatio));
    } else {
      setQtySmall('');
    }
  };

  const handleQtySmallChange = (val) => {
    setQtySmall(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setQtyLarge(Number((num / packagingRatio).toFixed(2)));
    } else {
      setQtyLarge('');
    }
  };

  // Compile Suggestive Fault Tags from History & Defaults
  const knownTags = useMemo(() => {
    const tagSet = new Set([
      'تلف تغليف / شرينك ممزق',
      'تسريب بالعبوة',
      'عيب طباعة تاريخ / باركود',
      'انبعاج أو تشوه بالعبوة',
      'عيب غطاء / تسريب القلاووظ',
      'شوائب أو رواسب',
      'نقص بالوزن أو السعة',
      'فصل أو تغير باللون',
    ]);
    returnsList.forEach((r) => {
      // Check legacy format
      if (Array.isArray(r.faultTags)) {
        r.faultTags.forEach((t) => t && tagSet.add(t.trim()));
      }
      // Check multi-items format
      if (Array.isArray(r.items)) {
        r.items.forEach((item) => {
          if (Array.isArray(item.faultTags)) {
            item.faultTags.forEach((t) => t && tagSet.add(t.trim()));
          }
        });
      }
    });
    return Array.from(tagSet);
  }, [returnsList]);

  // Handle Suggestive Tag Toggling
  const handleToggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
      setCustomTagInput('');
    }
  };

  // Handle Image Selection and In-Browser Compression
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const compressedBase64 = await compressImage(file);
        setImages((prev) => [...prev, compressedBase64]);
      } catch (err) {
        console.error('Image compression failed:', err);
      }
    }
    e.target.value = '';
  };

  const handleRemoveImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Trigger Inkjet Batch Code Translation for active line
  const handleTranslateBatch = () => {
    if (!printedBatchNo.trim()) {
      alert(isAr ? 'يرجى إدخال كود التشغيلة المطبوع (8 أرقام: DDMMHHMM).' : 'Please enter 8-digit batch code (DDMMHHMM).');
      return;
    }
    const res = translateBatchToPallets(printedBatchNo.trim(), workOrders, selectedProductId || null);
    setBatchTranslationResult(res);
  };

  // Staged Item Action: Add Current Product to Staged Items & Reset Line Form
  const handleStageCurrentProduct = () => {
    if (!selectedProductId) {
      alert(isAr ? 'يرجى اختيار المنتج التام أولاً.' : 'Please select finished good first.');
      return false;
    }
    if (!qtySmall || Number(qtySmall) <= 0) {
      alert(isAr ? 'يرجى إدخال كمية مرتجعة صالحة.' : 'Please enter a valid return quantity.');
      return false;
    }
    if (selectedTags.length === 0) {
      alert(isAr ? 'يرجى تحديد تصنيف عيب واحد على الأقل.' : 'Please select at least one fault type tag.');
      return false;
    }

    const productDoc = finishedProducts.find((p) => p.id === selectedProductId || p.code === selectedProductId);

    // Resolve matched pallets from batch if available
    let matchedPallets = [];
    if (printedBatchNo.trim()) {
      const transRes = translateBatchToPallets(printedBatchNo.trim(), workOrders, selectedProductId);
      if (transRes.success) {
        matchedPallets = transRes.matchedPallets.map((p) => ({
          orderNumber: p.orderNumber,
          palletId: p.palletId,
          palletNumber: p.palletNumber,
          batchRangeDisplay: p.batchRangeDisplay,
          qcWorkers: p.qcWorkers,
        }));
      }
    }

    const newItem = {
      lineId: String(stagedItems.length + 1),
      finishedProductId: productDoc?.id || selectedProductId,
      productCode: productDoc?.code || selectedProductId,
      productNameAr: productDoc?.nameAr || productDoc?.name || '',
      productNameEn: productDoc?.nameEn || '',
      packagingOptionSuffix: activePackagingOption?.suffix || selectedPackagingOptionSuffix || 'A',
      packagingOptionNameAr: activePackagingOption?.nameAr || (selectedPackagingOptionSuffix === 'A' ? 'التصميم القياسي' : `خيار ${selectedPackagingOptionSuffix}`),
      packagingOptionNameEn: activePackagingOption?.nameEn || `Option ${selectedPackagingOptionSuffix}`,
      packagingOptionCode: activePackagingOption?.optionCode || `${productDoc?.code || selectedProductId}-${activePackagingOption?.suffix || 'A'}`,
      packagingRatio,
      smallUnit: productDoc?.smallUnit || 'عبوة',
      largeUnit: productDoc?.largeUnitName || 'كرتونة',
      qtySmall: Number(qtySmall),
      qtyLarge: Number(qtyLarge || (Number(qtySmall) / packagingRatio).toFixed(2)),
      printedBatchNo: printedBatchNo.trim(),
      matchedPallets,
      faultTags: [...selectedTags],
      notes: notes.trim(),
      images: [...images],
      isPrinted: false,
      printCount: 0,
      printedAt: null,
      printedBy: null,
    };

    setStagedItems((prev) => [...prev, newItem]);

    // Reset line form inputs cleanly
    setSelectedProductId('');
    setSelectedPackagingOptionSuffix('A');
    setQtyLarge('');
    setQtySmall('');
    setPrintedBatchNo('');
    setBatchTranslationResult(null);
    setSelectedTags([]);
    setCustomTagInput('');
    setNotes('');
    setImages([]);

    return true;
  };

  const handleRemoveStagedItem = (index) => {
    setStagedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Load a staged product back into form for editing
  const handleEditStagedItem = (index) => {
    const item = stagedItems[index];
    if (!item) return;

    setSelectedProductId(item.finishedProductId || item.productCode || '');
    setSelectedPackagingOptionSuffix(item.packagingOptionSuffix || 'A');
    setQtyLarge(String(item.qtyLarge ?? ''));
    setQtySmall(String(item.qtySmall ?? ''));
    setPrintedBatchNo(item.printedBatchNo || '');
    setSelectedTags(Array.isArray(item.faultTags) ? [...item.faultTags] : []);
    setNotes(item.notes || '');
    setImages(Array.isArray(item.images) ? [...item.images] : []);

    if (item.printedBatchNo) {
      const transRes = translateBatchToPallets(item.printedBatchNo, workOrders, item.finishedProductId);
      setBatchTranslationResult(transRes);
    } else {
      setBatchTranslationResult(null);
    }

    setStagedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Reset Entire Create / Edit Form
  const resetCreateForm = () => {
    setEditingVoucher(null);
    setSourceType('sales_return');
    setReturnNoteNo('');
    setClientName('');
    setVehicleOrDriver('');
    setReturnDate(new Date().toISOString().split('T')[0]);
    setStagedItems([]);
    setSelectedProductId('');
    setSelectedPackagingOptionSuffix('A');
    setQtyLarge('');
    setQtySmall('');
    setPrintedBatchNo('');
    setBatchTranslationResult(null);
    setSelectedTags([]);
    setCustomTagInput('');
    setNotes('');
    setImages([]);
  };

  // Open Voucher in Edit Mode
  const handleOpenEditVoucher = (voucher) => {
    if (!canEditVoucher(voucher)) {
      alert(isAr ? 'لا يمكن تعديل هذا الإشعار (مغلق بعد المعالجة أو لا تملك الصلاحية).' : 'Cannot edit this voucher (completed or unauthorized).');
      return;
    }

    setEditingVoucher(voucher);
    setSourceType(voucher.sourceType || 'sales_return');
    setReturnDate(voucher.returnDate || new Date().toISOString().split('T')[0]);
    if (voucher.sourceType === 'sales_return' && voucher.salesReturnDetails) {
      setReturnNoteNo(voucher.salesReturnDetails.returnNoteNo || '');
      setClientName(voucher.salesReturnDetails.clientName || '');
      setVehicleOrDriver(voucher.salesReturnDetails.vehicleOrDriver || '');
    } else {
      setReturnNoteNo('');
      setClientName('');
      setVehicleOrDriver('');
    }

    const items = Array.isArray(voucher.items) && voucher.items.length > 0
      ? voucher.items.map((it, idx) => ({
          ...it,
          lineId: it.lineId || String(idx + 1),
          packagingOptionSuffix: it.packagingOptionSuffix || 'A',
          packagingOptionNameAr: it.packagingOptionNameAr || '',
          packagingOptionNameEn: it.packagingOptionNameEn || '',
          packagingOptionCode: it.packagingOptionCode || '',
        }))
      : [{
          lineId: '1',
          finishedProductId: voucher.finishedProductId,
          productCode: voucher.productCode,
          productNameAr: voucher.productNameAr,
          productNameEn: voucher.productNameEn,
          packagingOptionSuffix: voucher.packagingOptionSuffix || 'A',
          packagingOptionNameAr: voucher.packagingOptionNameAr || '',
          packagingOptionNameEn: voucher.packagingOptionNameEn || '',
          packagingOptionCode: voucher.packagingOptionCode || '',
          packagingRatio: Number(voucher.packagingRatio) || 12,
          smallUnit: voucher.smallUnit || 'عبوة',
          largeUnit: voucher.largeUnit || 'كرتونة',
          qtySmall: Number(voucher.qtySmall) || 0,
          qtyLarge: Number(voucher.qtyLarge) || 0,
          printedBatchNo: voucher.printedBatchNo || '',
          matchedPallets: voucher.matchedPallets || [],
          faultTags: Array.isArray(voucher.faultTags) ? voucher.faultTags : [],
          notes: voucher.notes || '',
          images: Array.isArray(voucher.images) ? voucher.images : [],
          isPrinted: voucher.isPrinted || false,
          printCount: voucher.printCount || 0,
          printedAt: voucher.printedAt || null,
          printedBy: voucher.printedBy || null,
        }];

    setStagedItems(items);

    // Clear active line entry inputs
    setSelectedProductId('');
    setSelectedPackagingOptionSuffix('A');
    setQtyLarge('');
    setQtySmall('');
    setPrintedBatchNo('');
    setBatchTranslationResult(null);
    setSelectedTags([]);
    setCustomTagInput('');
    setNotes('');
    setImages([]);

    setShowCreateModal(true);
  };

  // Human-readable change differences calculator for production reconfirmation
  const computeVoucherDiff = (oldVoucher, newPayload) => {
    const diffs = [];
    if (oldVoucher.sourceType !== newPayload.sourceType) {
      diffs.push(`تعديل نوع المصدر إلى: ${newPayload.sourceType === 'sales_return' ? 'مرتجع مبيعات' : 'مستودع المنتج التام'}`);
    }
    if (oldVoucher.returnDate !== newPayload.returnDate) {
      diffs.push(`تعديل تاريخ المرتجع من (${oldVoucher.returnDate}) إلى (${newPayload.returnDate})`);
    }
    if (newPayload.sourceType === 'sales_return') {
      const oDet = oldVoucher.salesReturnDetails || {};
      const nDet = newPayload.salesReturnDetails || {};
      if (oDet.returnNoteNo !== nDet.returnNoteNo) {
        diffs.push(`تعديل رقم إذن الارتجاع إلى #${nDet.returnNoteNo || 'بدون'}`);
      }
      if (oDet.clientName !== nDet.clientName) {
        diffs.push(`تعديل اسم العميل إلى: ${nDet.clientName || 'بدون'}`);
      }
      if (oDet.vehicleOrDriver !== nDet.vehicleOrDriver) {
        diffs.push(`تعديل السيارة/المندوب إلى: ${nDet.vehicleOrDriver || 'بدون'}`);
      }
    }
    const oItems = Array.isArray(oldVoucher.items) && oldVoucher.items.length > 0
      ? oldVoucher.items
      : [{
          productNameAr: oldVoucher.productNameAr,
          productCode: oldVoucher.productCode,
          packagingOptionSuffix: oldVoucher.packagingOptionSuffix || 'A',
          qtyLarge: oldVoucher.qtyLarge,
          qtySmall: oldVoucher.qtySmall,
          faultTags: oldVoucher.faultTags,
        }];
    const nItems = newPayload.items || [];

    if (oItems.length !== nItems.length) {
      diffs.push(`تعديل عدد الأصناف المدرجة من (${oItems.length}) إلى (${nItems.length}) أصناف`);
    }

    nItems.forEach((nItem, idx) => {
      const oItem = oItems[idx];
      if (!oItem) {
        diffs.push(`إضافة صنف جديد: ${nItem.productNameAr} (${nItem.qtyLarge} كرتونة / ${nItem.qtySmall} عبوة)`);
      } else {
        const itemChanges = [];
        if (oItem.productCode !== nItem.productCode) {
          itemChanges.push(`تغيير الصنف من [${oItem.productNameAr}] إلى [${nItem.productNameAr}]`);
        }
        if ((oItem.packagingOptionSuffix || 'A') !== (nItem.packagingOptionSuffix || 'A')) {
          itemChanges.push(`تعديل خيار التعبئة من [${oItem.packagingOptionSuffix || 'A'}] إلى [${nItem.packagingOptionSuffix || 'A'}]`);
        }
        if (Number(oItem.qtyLarge) !== Number(nItem.qtyLarge) || Number(oItem.qtySmall) !== Number(nItem.qtySmall)) {
          itemChanges.push(`تعديل الكمية من (${oItem.qtyLarge} كرتونة / ${oItem.qtySmall} عبوة) إلى (${nItem.qtyLarge} كرتونة / ${nItem.qtySmall} عبوة)`);
        }
        const oTags = (oItem.faultTags || []).join('، ');
        const nTags = (nItem.faultTags || []).join('، ');
        if (oTags !== nTags) {
          itemChanges.push(`تعديل تصنيفات العيوب من [${oTags || 'بدون'}] إلى [${nTags || 'بدون'}]`);
        }
        if (itemChanges.length > 0) {
          diffs.push(`${nItem.productNameAr}: ${itemChanges.join(' | ')}`);
        }
      }
    });

    if (diffs.length === 0) {
      diffs.push('تعديل في الملاحظات أو الصور المرفقة');
    }
    return diffs;
  };

  // Generate Sequential Voucher ID (RTN-YYYYMMDD-01)
  const generateVoucherId = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const prefix = `RTN-${yyyy}${mm}${dd}`;

    const matching = returnsList.filter((r) => r.id && r.id.startsWith(prefix));
    const nextSeq = matching.length + 1;
    return `${prefix}-${String(nextSeq).padStart(2, '0')}`;
  };

  // Submit New or Update Existing Faulty FG Return Voucher
  const handleSaveReturnVoucher = async (e) => {
    e.preventDefault();

    let finalItems = [...stagedItems];

    // If user currently filled the line form and didn't click "Add Another", auto-stage it now
    if (selectedProductId && Number(qtySmall) > 0 && selectedTags.length > 0) {
      const productDoc = finishedProducts.find((p) => p.id === selectedProductId || p.code === selectedProductId);
      let matchedPallets = [];
      if (printedBatchNo.trim()) {
        const transRes = translateBatchToPallets(printedBatchNo.trim(), workOrders, selectedProductId);
        if (transRes.success) {
          matchedPallets = transRes.matchedPallets.map((p) => ({
            orderNumber: p.orderNumber,
            palletId: p.palletId,
            palletNumber: p.palletNumber,
            batchRangeDisplay: p.batchRangeDisplay,
            qcWorkers: p.qcWorkers,
          }));
        }
      }
      finalItems.push({
        lineId: String(finalItems.length + 1),
        finishedProductId: productDoc?.id || selectedProductId,
        productCode: productDoc?.code || selectedProductId,
        productNameAr: productDoc?.nameAr || productDoc?.name || '',
        productNameEn: productDoc?.nameEn || '',
        packagingOptionSuffix: activePackagingOption?.suffix || selectedPackagingOptionSuffix || 'A',
        packagingOptionNameAr: activePackagingOption?.nameAr || (selectedPackagingOptionSuffix === 'A' ? 'التصميم القياسي' : `خيار ${selectedPackagingOptionSuffix}`),
        packagingOptionNameEn: activePackagingOption?.nameEn || `Option ${selectedPackagingOptionSuffix}`,
        packagingOptionCode: activePackagingOption?.optionCode || `${productDoc?.code || selectedProductId}-${activePackagingOption?.suffix || 'A'}`,
        packagingRatio,
        smallUnit: productDoc?.smallUnit || 'عبوة',
        largeUnit: productDoc?.largeUnitName || 'كرتونة',
        qtySmall: Number(qtySmall),
        qtyLarge: Number(qtyLarge || (Number(qtySmall) / packagingRatio).toFixed(2)),
        printedBatchNo: printedBatchNo.trim(),
        matchedPallets,
        faultTags: [...selectedTags],
        notes: notes.trim(),
        images: [...images],
        isPrinted: false,
        printCount: 0,
        printedAt: null,
        printedBy: null,
      });
    }

    if (finalItems.length === 0) {
      alert(isAr ? 'يرجى إضافة صنف واحد على الأقل إلى إشعار المرتجع.' : 'Please add at least one product to the return voucher.');
      return;
    }

    if (sourceType === 'sales_return' && !returnNoteNo.trim()) {
      alert(isAr ? 'رقم إذن الارتجاع إلزامي لمرتجعات المبيعات.' : 'Return Note # is mandatory for sales returns.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Compute aggregated totals for backward compatibility and fast summary
      const totalLarge = Number(finalItems.reduce((sum, item) => sum + (Number(item.qtyLarge) || 0), 0).toFixed(2));
      const totalSmall = finalItems.reduce((sum, item) => sum + (Number(item.qtySmall) || 0), 0);
      const summaryAr = finalItems.map((item) => `${item.productNameAr}${item.packagingOptionSuffix ? ` [${item.packagingOptionSuffix}]` : ''} (${item.qtyLarge} ${item.largeUnit})`).join('، ');
      const aggregatedFaultTags = Array.from(new Set(finalItems.flatMap((i) => i.faultTags || [])));

      if (editingVoucher) {
        const voucherId = editingVoucher.id;
        const wasReceivedOnFloor = editingVoucher.status === 'received_on_floor';

        const updatePayload = {
          returnDate,
          sourceType,
          salesReturnDetails: sourceType === 'sales_return' ? {
            returnNoteNo: returnNoteNo.trim(),
            clientName: clientName.trim(),
            vehicleOrDriver: vehicleOrDriver.trim(),
          } : null,
          items: finalItems,
          finishedProductId: finalItems[0].finishedProductId,
          productCode: finalItems[0].productCode,
          productNameAr: finalItems[0].productNameAr,
          productNameEn: finalItems[0].productNameEn,
          packagingOptionSuffix: finalItems[0].packagingOptionSuffix || 'A',
          packagingOptionNameAr: finalItems[0].packagingOptionNameAr || '',
          packagingRatio: finalItems[0].packagingRatio,
          smallUnit: finalItems[0].smallUnit,
          largeUnit: finalItems[0].largeUnit,
          qtySmall: totalSmall,
          qtyLarge: totalLarge,
          printedBatchNo: finalItems[0].printedBatchNo || '',
          matchedPallets: finalItems[0].matchedPallets || [],
          faultTags: aggregatedFaultTags,
          notes: finalItems[0].notes || '',
          images: finalItems.flatMap((i) => i.images || []),
          productSummaryAr: summaryAr,
          updatedAt: serverTimestamp(),
          updatedBy: {
            userId: currentUserId || 'unknown',
            userName: currentUser?.nameAr || currentUser?.name || 'مستخدم النظام',
            updatedAt: new Date().toISOString(),
          },
        };

        if (wasReceivedOnFloor) {
          const diffs = computeVoucherDiff(editingVoucher, updatePayload);
          updatePayload.status = 'pending_acceptance';
          updatePayload.reconfirmationRequired = true;
          updatePayload.reconfirmationNotice = diffs;
          if (editingVoucher.confirmedByProduction) {
            updatePayload.previousConfirmation = editingVoucher.confirmedByProduction;
          }
          updatePayload.confirmedByProduction = null;
        }

        await updateDoc(doc(db, 'faulty_fg_returns', voucherId), updatePayload);

        setShowCreateModal(false);
        resetCreateForm();

        if (wasReceivedOnFloor) {
          alert(
            isAr
              ? `تم حفظ تعديلات الإشعار (${voucherId}) بنجاح.\n\n⚠️ نظراً لتأكيد استلامه بالصالة سابقاً، تمت إعادة حالته إلى "بانتظار الاستلام" وإدراج الفروقات ليتسنى لمسؤول الصالة مراجعتها وإعادة تأكيد الاستلام.`
              : `Voucher (${voucherId}) updated. Re-confirmation required by production floor.`
          );
        } else {
          alert(isAr ? `تم تعديل إشعار المرتجع بنجاح برقم: ${voucherId}` : `Return voucher updated successfully: ${voucherId}`);
        }
      } else {
        const voucherId = generateVoucherId();
        const payload = {
          id: voucherId,
          returnDate,
          sourceType, // 'fg_warehouse' | 'sales_return'
          salesReturnDetails: sourceType === 'sales_return' ? {
            returnNoteNo: returnNoteNo.trim(),
            clientName: clientName.trim(),
            vehicleOrDriver: vehicleOrDriver.trim(),
          } : null,

          // Multi-Product Lines Array
          items: finalItems,

          // Legacy & Aggregated Fields for Direct Compatibility
          finishedProductId: finalItems[0].finishedProductId,
          productCode: finalItems[0].productCode,
          productNameAr: finalItems[0].productNameAr,
          productNameEn: finalItems[0].productNameEn,
          packagingOptionSuffix: finalItems[0].packagingOptionSuffix || 'A',
          packagingOptionNameAr: finalItems[0].packagingOptionNameAr || '',
          packagingRatio: finalItems[0].packagingRatio,
          smallUnit: finalItems[0].smallUnit,
          largeUnit: finalItems[0].largeUnit,
          qtySmall: totalSmall,
          qtyLarge: totalLarge,
          printedBatchNo: finalItems[0].printedBatchNo || '',
          matchedPallets: finalItems[0].matchedPallets || [],
          faultTags: aggregatedFaultTags,
          notes: finalItems[0].notes || '',
          images: finalItems.flatMap((i) => i.images || []),
          productSummaryAr: summaryAr,
          isPrintedAll: false,

          // Custody Handshake Status
          status: 'pending_acceptance', // 'pending_acceptance' | 'received_on_floor' | 'reworked' | 'scrapped'
          submittedBy: {
            userId: currentUserId || 'unknown',
            userName: currentUser?.nameAr || currentUser?.name || 'مستودع المنتج التام',
            submittedAt: new Date().toISOString(),
          },
          confirmedByProduction: null,
          resolution: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'faulty_fg_returns', voucherId), payload);

        setShowCreateModal(false);
        resetCreateForm();
        alert(isAr ? `تم تسجيل إشعار المرتجع بنجاح برقم: ${voucherId} متضمناً (${finalItems.length}) أصناف.` : `Return voucher registered successfully: ${voucherId} with (${finalItems.length}) products.`);
      }
    } catch (err) {
      console.error('Error saving return voucher:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ إشعار المرتجع.' : 'Error saving return voucher.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Production Floor Receipt Confirmation Handshake
  const handleConfirmFloorReceipt = async () => {
    if (!activeVoucher) return;
    setIsConfirming(true);
    try {
      const voucherRef = doc(db, 'faulty_fg_returns', activeVoucher.id);
      await updateDoc(voucherRef, {
        status: 'received_on_floor',
        reconfirmationRequired: false,
        confirmedByProduction: {
          userId: currentUserId || 'unknown',
          userName: currentUser?.nameAr || currentUser?.name || 'مسؤول صالة الإنتاج',
          confirmedAt: new Date().toISOString(),
          notes: confirmNotes.trim(),
        },
        updatedAt: serverTimestamp(),
      });

      setShowConfirmModal(false);
      setConfirmNotes('');
      setActiveVoucher(null);
      alert(isAr ? 'تم تأكيد استلام المنتجات المعيبة بصالة الإنتاج وانتقال العهدة بنجاح.' : 'Receipt confirmed on production floor. Custody officially transferred.');
    } catch (err) {
      console.error('Error confirming receipt:', err);
      alert(isAr ? 'حدث خطأ أثناء تأكيد الاستلام.' : 'Error confirming receipt.');
    } finally {
      setIsConfirming(false);
    }
  };

  // Resolve Return Voucher (Rework vs Scrap)
  const handleResolveVoucher = async () => {
    if (!activeVoucher) return;
    setIsResolving(true);
    try {
      const voucherRef = doc(db, 'faulty_fg_returns', activeVoucher.id);
      await updateDoc(voucherRef, {
        status: resolutionType, // 'reworked' | 'scrapped'
        resolution: {
          type: resolutionType,
          resolvedBy: {
            userId: currentUser?.id || 'unknown',
            userName: currentUser?.nameAr || currentUser?.name || 'إدارة التشغيل',
          },
          resolvedAt: new Date().toISOString(),
          notes: resolutionNotes.trim(),
        },
        updatedAt: serverTimestamp(),
      });

      setShowResolveModal(false);
      setResolutionNotes('');
      setActiveVoucher(null);
      alert(
        resolutionType === 'reworked'
          ? (isAr ? 'تم توثيق إعادة تشغيل وتعبئة المرتجع بنجاح.' : 'Voucher closed as Reworked successfully.')
          : (isAr ? 'تم توثيق تخريد وإعدام المرتجع بنجاح.' : 'Voucher closed as Scrapped successfully.')
      );
    } catch (err) {
      console.error('Error resolving voucher:', err);
      alert(isAr ? 'حدث خطأ أثناء توثيق المعالجة.' : 'Error resolving voucher.');
    } finally {
      setIsResolving(false);
    }
  };

  // =========================================================================
  // THERMAL LABEL PRINTING ENGINE & LOGGING
  // =========================================================================

  // Open Single Item Print Modal
  const handleOpenSingleItemPrint = (voucher, item, itemIndex) => {
    setPrintQueue([{
      voucherId: voucher.id,
      returnDate: voucher.returnDate,
      sourceType: voucher.sourceType,
      returnNoteNo: voucher.salesReturnDetails?.returnNoteNo || '',
      item,
      itemIndex,
    }]);
    setPrintMode('per_large_unit');
    setShowPrintModal(true);
  };

  // Open Whole Voucher Print Modal
  const handleOpenVoucherPrint = (voucher) => {
    const items = Array.isArray(voucher.items) && voucher.items.length > 0 ? voucher.items : [voucher];
    const queue = items.map((item, idx) => ({
      voucherId: voucher.id,
      returnDate: voucher.returnDate,
      sourceType: voucher.sourceType,
      returnNoteNo: voucher.salesReturnDetails?.returnNoteNo || '',
      item,
      itemIndex: idx,
    }));
    setPrintQueue(queue);
    setPrintMode('per_large_unit');
    setShowPrintModal(true);
  };

  // Open Bulk Unprinted Labels Print Modal
  const handleOpenBulkUnprintedPrint = () => {
    const unprintedQueue = [];
    filteredReturns.forEach((voucher) => {
      const items = Array.isArray(voucher.items) && voucher.items.length > 0 ? voucher.items : [voucher];
      items.forEach((item, idx) => {
        if (!item.isPrinted) {
          unprintedQueue.push({
            voucherId: voucher.id,
            returnDate: voucher.returnDate,
            sourceType: voucher.sourceType,
            returnNoteNo: voucher.salesReturnDetails?.returnNoteNo || '',
            item,
            itemIndex: idx,
          });
        }
      });
    });

    if (unprintedQueue.length === 0) {
      alert(isAr ? 'جميع الأصناف المصفاة حالياً تمت طباعة استيكراتها بالفعل!' : 'All currently filtered items have already been printed!');
      return;
    }

    setPrintQueue(unprintedQueue);
    setPrintMode('per_large_unit');
    setShowPrintModal(true);
  };

  // Compute all individual stickers to be printed based on queue and mode
  const generatedStickers = useMemo(() => {
    const stickers = [];

    printQueue.forEach((entry) => {
      const { voucherId, returnDate, returnNoteNo, item, itemIndex } = entry;
      const qtyLarge = Math.max(1, Math.ceil(Number(item.qtyLarge) || 1));
      const qtySmall = Math.max(1, Number(item.qtySmall) || 1);
      const prodName = isAr ? item.productNameAr : item.productNameEn || item.productNameAr;
      const tagsStr = Array.isArray(item.faultTags) ? item.faultTags.join(' • ') : '';

      if (printMode === 'per_large_unit') {
        for (let i = 1; i <= qtyLarge; i++) {
          stickers.push({
            voucherId,
            returnDate,
            returnNoteNo,
            itemIndex,
            productName: prodName,
            productCode: item.productCode || item.finishedProductId,
            packagingOptionSuffix: item.packagingOptionSuffix || 'A',
            packagingOptionNameAr: item.packagingOptionNameAr || '',
            sequenceBadge: isAr ? `كرتونة ${i} من ${qtyLarge}` : `Case ${i} of ${qtyLarge}`,
            faultTags: tagsStr,
            batchNo: item.printedBatchNo || '',
            barcodeText: `${voucherId}-L${(itemIndex ?? 0) + 1}-C${i}`,
          });
        }
      } else if (printMode === 'single_consolidated') {
        stickers.push({
          voucherId,
          returnDate,
          returnNoteNo,
          itemIndex,
          productName: prodName,
          productCode: item.productCode || item.finishedProductId,
          packagingOptionSuffix: item.packagingOptionSuffix || 'A',
          packagingOptionNameAr: item.packagingOptionNameAr || '',
          sequenceBadge: isAr ? `إجمالي: ${item.qtyLarge} ${item.largeUnit} (${item.qtySmall} ${item.smallUnit})` : `Total: ${item.qtyLarge} ${item.largeUnit}`,
          faultTags: tagsStr,
          batchNo: item.printedBatchNo || '',
          barcodeText: `${voucherId}-L${(itemIndex ?? 0) + 1}`,
        });
      } else if (printMode === 'per_small_unit') {
        for (let i = 1; i <= qtySmall; i++) {
          stickers.push({
            voucherId,
            returnDate,
            returnNoteNo,
            itemIndex,
            productName: prodName,
            productCode: item.productCode || item.finishedProductId,
            packagingOptionSuffix: item.packagingOptionSuffix || 'A',
            packagingOptionNameAr: item.packagingOptionNameAr || '',
            sequenceBadge: isAr ? `عبوة ${i} من ${qtySmall}` : `Unit ${i} of ${qtySmall}`,
            faultTags: tagsStr,
            batchNo: item.printedBatchNo || '',
            barcodeText: `${voucherId}-L${(itemIndex ?? 0) + 1}-U${i}`,
          });
        }
      }
    });

    return stickers;
  }, [printQueue, printMode, isAr]);

  // Execute Browser Print & Log Print in Firestore
  const handleExecutePrint = async () => {
    if (generatedStickers.length === 0) return;

    setIsPrinting(true);
    try {
      window.print();

      // Collect all printed items across vouchers
      const updatesByVoucher = new Map();
      printQueue.forEach(({ voucherId, itemIndex }) => {
        if (!updatesByVoucher.has(voucherId)) {
          updatesByVoucher.set(voucherId, new Set());
        }
        updatesByVoucher.get(voucherId).add(itemIndex);
      });

      const batch = writeBatch(db);
      updatesByVoucher.forEach((itemIndexes, voucherId) => {
        const vDoc = returnsList.find((r) => r.id === voucherId);
        if (!vDoc) return;

        const currentItems = Array.isArray(vDoc.items) && vDoc.items.length > 0 ? [...vDoc.items] : [{ ...vDoc }];
        itemIndexes.forEach((idx) => {
          if (currentItems[idx]) {
            currentItems[idx] = {
              ...currentItems[idx],
              isPrinted: true,
              printCount: (currentItems[idx].printCount || 0) + 1,
              printedAt: new Date().toISOString(),
              printedBy: {
                userId: currentUserId || 'unknown',
                userName: currentUser?.nameAr || currentUser?.name || 'مستخدم النظام',
              },
            };
          }
        });

        const allPrinted = currentItems.every((i) => i.isPrinted === true);
        const ref = doc(db, 'faulty_fg_returns', voucherId);
        batch.update(ref, {
          items: currentItems,
          isPrintedAll: allPrinted,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setShowPrintModal(false);
    } catch (err) {
      console.error('Error during printing or print log update:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  // Filtered Returns List
  const filteredReturns = useMemo(() => {
    return returnsList.filter((voucher) => {
      // Status filter
      if (statusFilter !== 'all' && voucher.status !== statusFilter) return false;
      // Source filter
      if (sourceFilter !== 'all' && voucher.sourceType !== sourceFilter) return false;

      // Print status filter
      const items = Array.isArray(voucher.items) && voucher.items.length > 0 ? voucher.items : [voucher];
      if (printFilter === 'unprinted' && items.every((i) => i.isPrinted)) return false;
      if (printFilter === 'printed' && items.every((i) => !i.isPrinted)) return false;

      // Tag filter
      if (tagFilter !== 'all') {
        const hasTag = items.some((item) => item.faultTags?.includes(tagFilter)) || voucher.faultTags?.includes(tagFilter);
        if (!hasTag) return false;
      }

      // Text search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesId = voucher.id?.toLowerCase().includes(term);
        const matchesNoteNo = voucher.salesReturnDetails?.returnNoteNo?.toLowerCase().includes(term);
        const matchesClient = voucher.salesReturnDetails?.clientName?.toLowerCase().includes(term);
        const matchesVehicle = voucher.salesReturnDetails?.vehicleOrDriver?.toLowerCase().includes(term);

        const matchesProduct = items.some((i) =>
          (i.productNameAr || i.productNameEn || i.productCode)?.toLowerCase().includes(term) ||
          i.packagingOptionSuffix?.toLowerCase().includes(term) ||
          i.packagingOptionNameAr?.toLowerCase().includes(term) ||
          i.printedBatchNo?.toLowerCase().includes(term) ||
          i.faultTags?.some((t) => t.toLowerCase().includes(term))
        );

        if (!matchesId && !matchesNoteNo && !matchesClient && !matchesVehicle && !matchesProduct) {
          return false;
        }
      }

      return true;
    });
  }, [returnsList, statusFilter, sourceFilter, printFilter, tagFilter, searchTerm]);

  // Aggregate Metrics & Unprinted Items Count
  const { metrics, unprintedItemsCount } = useMemo(() => {
    let unprinted = 0;
    const total = returnsList.length;
    const pending = returnsList.filter((r) => r.status === 'pending_acceptance').length;
    const onFloor = returnsList.filter((r) => r.status === 'received_on_floor').length;
    const reworked = returnsList.filter((r) => r.status === 'reworked').length;
    const scrapped = returnsList.filter((r) => r.status === 'scrapped').length;

    filteredReturns.forEach((v) => {
      const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [v];
      unprinted += items.filter((i) => !i.isPrinted).length;
    });

    return { metrics: { total, pending, onFloor, reworked, scrapped }, unprintedItemsCount: unprinted };
  }, [returnsList, filteredReturns]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. TOP STATS KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {isAr ? 'إجمالي الإشعارات' : 'Total Returns'}
            </p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{metrics.total}</h3>
          </div>
          <div className="p-3 bg-rose-50 border border-rose-200/60 rounded-xl text-rose-600">
            <AlertOctagon className="h-6 w-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-xs flex items-center justify-between relative overflow-hidden">
          {metrics.pending > 0 && (
            <div className="absolute top-0 end-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-es-lg animate-pulse">
              {isAr ? 'مطلوب استلام' : 'Action Required'}
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
              {isAr ? 'بانتظار استلام الصالة' : 'Pending Floor Receipt'}
            </p>
            <h3 className="text-2xl font-black text-amber-900 mt-1">{metrics.pending}</h3>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-600">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-blue-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              {isAr ? 'في عهدة صالة الإنتاج' : 'In Floor Custody'}
            </p>
            <h3 className="text-2xl font-black text-blue-900 mt-1">{metrics.onFloor}</h3>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
            <RotateCcw className="h-6 w-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              {isAr ? 'تمت المعالجة (تشغيل/إعدام)' : 'Resolved / Closed'}
            </p>
            <h3 className="text-2xl font-black text-emerald-900 mt-1">{metrics.reworked + metrics.scrapped}</h3>
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 2. SEARCH, FILTERS & ACTION BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث برقم الإشعار، الصنف، إذن الارتجاع، العميل، السيارة أو كود التشغيلة...' : 'Search by voucher ID, product, return note, client...'}
              className="w-full ps-9 pe-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none transition"
            />
          </div>

          {/* Action Buttons: Bulk Print Unprinted + New Voucher */}
          <div className="flex items-center gap-2">
            {unprintedItemsCount > 0 && (
              <button
                type="button"
                onClick={handleOpenBulkUnprintedPrint}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl shadow-xs transition cursor-pointer shrink-0"
                title={isAr ? 'طباعة استيكرات لكافة الأصناف التي لم تطبع بعد ضمن النتائج' : 'Print all unprinted labels in current results'}
              >
                <Printer className="h-4 w-4 text-amber-600" />
                <span>{isAr ? `طباعة الكل غير المطبوع (${unprintedItemsCount})` : `Print Unprinted (${unprintedItemsCount})`}</span>
              </button>
            )}

            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  resetCreateForm();
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition cursor-pointer shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>{isAr ? 'تسجيل إشعار مرتجع معيب جديد' : 'New Faulty Return Voucher'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Chips Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-bold flex items-center gap-1 shrink-0">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span>{isAr ? 'الحالة:' : 'Status:'}</span>
          </span>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${statusFilter === 'all' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {isAr ? 'الكل' : 'All'}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending_acceptance')}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${statusFilter === 'pending_acceptance' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            {isAr ? `قيد الاستلام (${metrics.pending})` : `Pending (${metrics.pending})`}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('received_on_floor')}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${statusFilter === 'received_on_floor' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
          >
            {isAr ? `في عهدة الصالة (${metrics.onFloor})` : `On Floor (${metrics.onFloor})`}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('reworked')}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${statusFilter === 'reworked' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            {isAr ? `تمت إعادة التشغيل (${metrics.reworked})` : `Reworked (${metrics.reworked})`}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('scrapped')}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${statusFilter === 'scrapped' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
          >
            {isAr ? `تم التخريد (${metrics.scrapped})` : `Scrapped (${metrics.scrapped})`}
          </button>

          <span className="text-slate-300 mx-1">|</span>

          <span className="text-slate-500 font-bold shrink-0">{isAr ? 'المصدر:' : 'Source:'}</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 text-xs focus:outline-none"
          >
            <option value="all">{isAr ? 'كافة المصادر' : 'All Sources'}</option>
            <option value="fg_warehouse">{isAr ? 'مستودع المنتج التام' : 'FG Warehouse'}</option>
            <option value="sales_return">{isAr ? 'مرتجع مبيعات (سيارات/عملاء)' : 'Sales Returns (Vans/Clients)'}</option>
          </select>

          <span className="text-slate-300 mx-1">|</span>

          <span className="text-slate-500 font-bold shrink-0">{isAr ? 'الطباعة:' : 'Print:'}</span>
          <select
            value={printFilter}
            onChange={(e) => setPrintFilter(e.target.value)}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 text-xs focus:outline-none"
          >
            <option value="all">{isAr ? 'الكل' : 'All'}</option>
            <option value="unprinted">{isAr ? 'لم تتم طباعتها' : 'Unprinted'}</option>
            <option value="printed">{isAr ? 'تمت طباعتها' : 'Printed'}</option>
          </select>
        </div>
      </div>

      {/* 3. RETURNS TABLE (MULTI-PRODUCT & PRINT STATUS AWARE) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200/80">
              <tr>
                <th className="p-3.5 text-start">{isAr ? 'رقم الإشعار والتاريخ' : 'Voucher & Date'}</th>
                <th className="p-3.5 text-start">{isAr ? 'مصدر الارتجاع' : 'Source'}</th>
                <th className="p-3.5 text-start">{isAr ? 'الأصناف المرتجعة والكميات' : 'Products & Quantities'}</th>
                <th className="p-3.5 text-start">{isAr ? 'تصنيفات العيوب (Tags)' : 'Fault Tags'}</th>
                <th className="p-3.5 text-start">{isAr ? 'حالة العهدة' : 'Custody Status'}</th>
                <th className="p-3.5 text-start">{isAr ? 'حالة طباعة الاستيكرات' : 'Stickers Printed'}</th>
                <th className="p-3.5 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-rose-500 border-t-transparent mb-2"></div>
                    <p>{isAr ? 'جاري تحميل سجلات المرتجعات...' : 'Loading return vouchers...'}</p>
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-400">
                    <AlertOctagon className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-sm text-slate-600">
                      {isAr ? 'لا توجد إشعارات مرتجعات مطابقة' : 'No matching return vouchers found'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isAr ? 'قم بتسجيل إشعار جديد أو تغيير معايير البحث والفلترة.' : 'Create a new voucher or adjust filters.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredReturns.map((voucher) => {
                  const isPending = voucher.status === 'pending_acceptance';
                  const isOnFloor = voucher.status === 'received_on_floor';
                  const isReworked = voucher.status === 'reworked';
                  const isScrapped = voucher.status === 'scrapped';

                  // Normalizing items array
                  const items = Array.isArray(voucher.items) && voucher.items.length > 0 ? voucher.items : [voucher];
                  const allPrinted = items.every((i) => i.isPrinted === true);
                  const anyPrinted = items.some((i) => i.isPrinted === true);

                  return (
                    <tr key={voucher.id} className="hover:bg-slate-50/60 transition">
                      {/* ID & Date */}
                      <td className="p-3.5 whitespace-nowrap align-top">
                        <div className="font-mono font-black text-rose-700">{voucher.id}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>{voucher.returnDate}</span>
                        </div>
                        {items.length > 1 && (
                          <span className="inline-block px-1.5 py-0.5 mt-1 bg-slate-100 text-slate-700 font-bold rounded text-[10px]">
                            {isAr ? `(${items.length}) أصناف مختلفة` : `(${items.length}) Products`}
                          </span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="p-3.5 align-top">
                        {voucher.sourceType === 'sales_return' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              <Truck className="h-3 w-3" />
                              <span>{isAr ? 'إذن ارتجاع مبيعات' : 'Sales Return Note'}</span>
                            </span>
                            {voucher.salesReturnDetails?.returnNoteNo && (
                              <div className="font-mono text-[11px] font-bold text-slate-800">
                                #{voucher.salesReturnDetails.returnNoteNo}
                              </div>
                            )}
                            {voucher.salesReturnDetails?.clientName && (
                              <div className="text-[11px] text-slate-600 truncate max-w-[150px]">
                                {voucher.salesReturnDetails.clientName}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Warehouse className="h-3 w-3" />
                            <span>{isAr ? 'مستودع المنتج التام' : 'FG Warehouse'}</span>
                          </span>
                        )}
                      </td>

                      {/* Products List & Quantities */}
                      <td className="p-3.5 align-top">
                        <div className="space-y-2">
                          {items.map((item, idx) => (
                            <div key={idx} className="flex items-start justify-between gap-3 text-xs pb-1.5 border-b border-slate-100 last:border-b-0 last:pb-0">
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                  <span>{isAr ? item.productNameAr : item.productNameEn || item.productNameAr}</span>
                                  {item.packagingOptionSuffix && (
                                    <span className="px-1.5 py-0.2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[10px] font-bold font-mono">
                                      {isAr ? `خيار (${item.packagingOptionSuffix})` : `Opt (${item.packagingOptionSuffix})`}
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[10px] text-slate-500 font-semibold">
                                  {item.packagingOptionCode || item.productCode}
                                  {item.packagingOptionNameAr && item.packagingOptionSuffix !== 'A' && (
                                    <span className="ms-1.5 text-slate-600 font-sans">
                                      • {item.packagingOptionNameAr}
                                    </span>
                                  )}
                                  {item.printedBatchNo && (
                                    <span className="ms-2 font-mono text-[10px] bg-slate-100 text-slate-700 px-1 py-0.2 rounded border">
                                      تشغيلة: {item.printedBatchNo}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-end whitespace-nowrap">
                                <div className="font-black text-slate-900">
                                  {Number(item.qtyLarge).toLocaleString()} <span className="text-[11px] font-normal text-slate-500">{item.largeUnit || 'كرتونة'}</span>
                                </div>
                                <div className="text-[10px] font-bold text-rose-600">
                                  ({Number(item.qtySmall).toLocaleString()} {item.smallUnit || 'عبوة'})
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Fault Tags */}
                      <td className="p-3.5 align-top">
                        <div className="space-y-1.5 max-w-[200px]">
                          {items.map((item, idx) => (
                            <div key={idx} className="flex flex-wrap gap-1">
                              {(item.faultTags || []).map((t, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Custody Status */}
                      <td className="p-3.5 whitespace-nowrap align-top">
                        {isPending && (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{voucher.reconfirmationRequired ? (isAr ? 'بانتظار إعادة تأكيد الاستلام' : 'Re-confirm Needed') : (isAr ? 'قيد تأكيد الاستلام' : 'Pending Receipt')}</span>
                            </span>
                            {voucher.reconfirmationRequired && (
                              <div className="text-[10px] text-amber-800 font-bold flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                <span>{isAr ? 'عُدّل بعد الاستلام السابق' : 'Edited post-receipt'}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {isOnFloor && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>{isAr ? 'في عهدة الصالة (ستاند باي)' : 'In Floor Custody'}</span>
                          </span>
                        )}
                        {isReworked && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{isAr ? 'تمت إعادة التشغيل' : 'Reworked'}</span>
                          </span>
                        )}
                        {isScrapped && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertOctagon className="h-3.5 w-3.5" />
                            <span>{isAr ? 'تم التخريد والإعدام' : 'Scrapped'}</span>
                          </span>
                        )}
                      </td>

                      {/* Print Status Badges */}
                      <td className="p-3.5 whitespace-nowrap align-top">
                        {allPrinted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="h-3 w-3" />
                            <span>{isAr ? 'تمت الطباعة بالكامل' : 'Printed'}</span>
                          </span>
                        ) : anyPrinted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3" />
                            <span>{isAr ? 'طباعة جزئية' : 'Partially Printed'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            <Printer className="h-3 w-3" />
                            <span>{isAr ? 'لم تتم الطباعة' : 'Unprinted'}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center whitespace-nowrap align-top">
                        <div className="inline-flex items-center gap-1">
                          {/* Edit Action Button */}
                          {isReworked || isScrapped ? (
                            (isGeneralAdmin || voucher.submittedBy?.userId === currentUserId) && (
                              <span
                                className="p-1.5 text-slate-300 rounded-lg cursor-not-allowed"
                                title={isAr ? 'لا يمكن التعديل: تم إنجاز إعادة التشغيل أو التخريد لهذا الإشعار' : 'Cannot edit: Voucher is already completed'}
                              >
                                <Edit3 className="h-4 w-4" />
                              </span>
                            )
                          ) : (
                            canEditVoucher(voucher) && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditVoucher(voucher)}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg border border-blue-200 hover:border-blue-300 transition cursor-pointer"
                                title={isAr ? 'تعديل بيانات وأصناف الإشعار' : 'Edit Return Voucher'}
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                            )
                          )}

                          {/* Print Thermal Sticker Action */}
                          <button
                            type="button"
                            onClick={() => handleOpenVoucherPrint(voucher)}
                            className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg border border-amber-200 hover:border-amber-300 transition cursor-pointer"
                            title={isAr ? 'طباعة استيكرات حرارية للرول' : 'Print Thermal Labels'}
                          >
                            <Printer className="h-4 w-4" />
                          </button>

                          {/* View Details Modal */}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveVoucher(voucher);
                              setShowDetailsModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title={isAr ? 'عرض التفاصيل والصور' : 'View details'}
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {isPending && canConfirm && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveVoucher(voucher);
                                setConfirmNotes('');
                                setShowConfirmModal(true);
                              }}
                              className={`px-2 py-1 text-white rounded-lg text-[11px] font-bold shadow-xs transition cursor-pointer ${voucher.reconfirmationRequired ? 'bg-amber-600 hover:bg-amber-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                              title={voucher.reconfirmationRequired ? (isAr ? 'إعادة تأكيد استلام الصالة بعد التعديل' : 'Re-confirm floor receipt') : (isAr ? 'تأكيد استلام الصالة' : 'Confirm Floor Receipt')}
                            >
                              {voucher.reconfirmationRequired ? (isAr ? 'إعادة تأكيد الاستلام' : 'Re-confirm') : (isAr ? 'تأكيد الاستلام' : 'Confirm Receipt')}
                            </button>
                          )}

                          {isOnFloor && canResolve && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveVoucher(voucher);
                                setResolutionType('reworked');
                                setResolutionNotes('');
                                setShowResolveModal(true);
                              }}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition cursor-pointer"
                              title={isAr ? 'توثيق المعالجة (تشغيل أو تخريد)' : 'Resolve: Rework or Scrap'}
                            >
                              {isAr ? 'تسجيل المعالجة' : 'Resolve'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL: CREATE NEW RETURN VOUCHER (MULTI-PRODUCT STAGING)               */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className={`p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between ${editingVoucher ? 'bg-blue-50/80' : 'bg-slate-50/80'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl border ${editingVoucher ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>
                  {editingVoucher ? <Edit3 className="h-5 w-5" /> : <AlertOctagon className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingVoucher
                      ? (isAr ? `تعديل إشعار المرتجع (${editingVoucher.id})` : `Edit Return Voucher (${editingVoucher.id})`)
                      : (isAr ? 'تسجيل إشعار مرتجع منتجات معيبة للصالة' : 'New Faulty FG Return Voucher')}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {editingVoucher
                      ? (isAr ? 'تعديل بيانات المصدر والأصناف والكميات وتصنيفات العيوب' : 'Modify return source, products, quantities, and fault tags')
                      : (isAr ? 'تحويل المنتجات التامة المعيبة إلى عهدة صالة الإنتاج بانتظار إعادة التشغيل' : 'Submit defective finished goods to production floor custody')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSaveReturnVoucher} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* SECTION 1: VOUCHER-LEVEL SOURCE & RETURN DATE */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    {isAr ? 'مصدر الارتجاع *' : 'Return Source *'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSourceType('sales_return')}
                      className={`p-3 rounded-xl border text-start flex items-center gap-2.5 transition ${sourceType === 'sales_return' ? 'border-rose-500 bg-rose-50 text-rose-950 font-bold ring-1 ring-rose-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      <Truck className={`h-5 w-5 ${sourceType === 'sales_return' ? 'text-rose-600' : 'text-slate-400'}`} />
                      <div>
                        <div>{isAr ? 'مرتجع مبيعات (إذن ارتجاع)' : 'Sales Return Note'}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{isAr ? 'سيارات التوزيع / مرتجعات العملاء' : 'Distribution vans & clients'}</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSourceType('fg_warehouse')}
                      className={`p-3 rounded-xl border text-start flex items-center gap-2.5 transition ${sourceType === 'fg_warehouse' ? 'border-rose-500 bg-rose-50 text-rose-950 font-bold ring-1 ring-rose-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      <Warehouse className={`h-5 w-5 ${sourceType === 'fg_warehouse' ? 'text-rose-600' : 'text-slate-400'}`} />
                      <div>
                        <div>{isAr ? 'مستودع المنتج التام' : 'FG Warehouse'}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{isAr ? 'توالف أو معيب رصيد المستودع' : 'Defects found in warehouse'}</div>
                      </div>
                    </button>
                  </div>
                </div>

                {sourceType === 'sales_return' && (
                  <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block font-bold text-purple-950 mb-1">
                        {isAr ? 'رقم إذن الارتجاع *' : 'Return Note # *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={returnNoteNo}
                        onChange={(e) => setReturnNoteNo(e.target.value)}
                        placeholder="e.g. RN-202609-001"
                        className="w-full p-2 bg-white border border-purple-200 rounded-xl font-mono text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-purple-950 mb-1">
                        {isAr ? 'اسم العميل' : 'Client Name'}
                      </label>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder={isAr ? 'اسم العميل / الشركة' : 'Customer or company name'}
                        className="w-full p-2 bg-white border border-purple-200 rounded-xl text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-purple-950 mb-1">
                        {isAr ? 'السيارة / المندوب' : 'Van / Driver'}
                      </label>
                      <input
                        type="text"
                        value={vehicleOrDriver}
                        onChange={(e) => setVehicleOrDriver(e.target.value)}
                        placeholder={isAr ? 'رقم اللوحة أو اسم السائق' : 'Van plate or driver name'}
                        className="w-full p-2 bg-white border border-purple-200 rounded-xl text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'تاريخ الارتجاع *' : 'Return Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full sm:w-1/2 p-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* SECTION 2: STAGED PRODUCTS LIST (SHOWS ALREADY ADDED ITEMS) */}
              {stagedItems.length > 0 && (
                <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between font-bold text-emerald-950">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>{isAr ? `الأصناف المدرجة بالإشعار (${stagedItems.length}):` : `Staged Products (${stagedItems.length}):`}</span>
                    </span>
                    <span className="text-[11px] font-mono text-emerald-800">
                      {isAr
                        ? `إجمالي: ${stagedItems.reduce((s, i) => s + i.qtyLarge, 0)} كرتونة`
                        : `Total: ${stagedItems.reduce((s, i) => s + i.qtyLarge, 0)} Cases`}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {stagedItems.map((item, idx) => (
                      <div key={idx} className="p-2.5 bg-white rounded-xl border border-emerald-200/80 shadow-2xs flex items-center justify-between gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span>{item.productNameAr}</span>
                            <span className="font-mono text-[10px] text-slate-500">[{item.packagingOptionCode || item.productCode}]</span>
                            {item.packagingOptionSuffix && (
                              <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[10px] font-bold">
                                {isAr ? `خيار (${item.packagingOptionSuffix})` : `Option (${item.packagingOptionSuffix})`}
                                {item.packagingOptionNameAr && item.packagingOptionSuffix !== 'A' ? ` - ${item.packagingOptionNameAr}` : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600 flex flex-wrap gap-2 mt-0.5">
                            <span className="font-bold text-rose-600">
                              {item.qtyLarge} {item.largeUnit} ({item.qtySmall} {item.smallUnit})
                            </span>
                            {item.packagingRatio && (
                              <span className="font-mono text-slate-500">
                                (شدة: {item.packagingRatio})
                              </span>
                            )}
                            {item.printedBatchNo && <span>• تشغيلة: {item.printedBatchNo}</span>}
                            <span>• {item.faultTags.join('، ')}</span>
                          </div>
                        </div>

                        <div className="inline-flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditStagedItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'تعديل هذا الصنف' : 'Edit item'}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStagedItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'حذف هذا الصنف من الإشعار' : 'Remove item'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 3: PRODUCT ENTRY FORM (FOR CURRENT / NEXT PRODUCT) */}
              <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-rose-200 space-y-3.5 relative">
                <div className="flex items-center justify-between pb-2 border-b border-rose-100">
                  <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-rose-600" />
                    <span>{isAr ? 'بيانات الصنف المعيب المراد إدراجه:' : 'Product Information to Add:'}</span>
                  </h4>
                  {stagedItems.length > 0 && (
                    <span className="text-[10px] text-slate-500 font-bold">
                      {isAr ? `الصنف رقم (${stagedItems.length + 1})` : `Item #${stagedItems.length + 1}`}
                    </span>
                  )}
                </div>

                {/* Finished Good Selection */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'المنتج التام المستهدف *' : 'Target Finished Good *'}
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none"
                  >
                    <option value="">{isAr ? '-- اختر المنتج التام --' : '-- Select Finished Good --'}</option>
                    {finishedProducts.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.code ? `[${prod.code}] ` : ''}{isAr ? prod.nameAr : prod.nameEn || prod.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Packaging Option Selector (shown when product has > 1 packaging option) */}
                {availablePackagingOptions.length > 1 && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-indigo-600" />
                        <span>{isAr ? 'تحديد خيار وتصميم العبوة / الشدة المرتجعة *' : 'Specify Packaging / Design Option *'}</span>
                      </label>
                      <span className="text-[10px] text-indigo-700 font-bold">
                        {isAr ? `(${availablePackagingOptions.length}) خيارات متاحة` : `(${availablePackagingOptions.length}) options available`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availablePackagingOptions.map((opt) => {
                        const isSelected = (selectedPackagingOptionSuffix || 'A') === opt.suffix;
                        const optRatio = Number(opt.packagingRatio || activeProduct?.packagingRatio || 12);
                        return (
                          <button
                            type="button"
                            key={opt.suffix}
                            onClick={() => handlePackagingOptionChange(opt.suffix)}
                            className={`p-2.5 rounded-xl border text-start transition cursor-pointer flex items-start gap-2.5 ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-400/40'
                                : 'bg-white text-slate-800 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/50'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-lg font-mono font-black text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {opt.suffix}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-extrabold text-xs truncate">
                                {isAr ? opt.nameAr || `خيار ${opt.suffix}` : opt.nameEn || opt.nameAr || `Option ${opt.suffix}`}
                              </div>
                              <div className={`text-[10px] font-medium mt-0.5 flex items-center gap-2 ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                                <span>{isAr ? `معيار الشدة: ${optRatio} عبوة` : `Ratio: ${optRatio} units`}</span>
                                {opt.optionCode && <span className="font-mono">[{opt.optionCode}]</span>}
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 text-white shrink-0 mt-0.5" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quantities with Bi-directional Auto-sync */}
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>{isAr ? 'الكمية المرتجعة' : 'Return Quantity'}</span>
                    {activeProduct && (
                      <span className="text-rose-600 font-mono font-bold">
                        {isAr
                          ? `معيار التعبئة: ${packagingRatio} ${activeProduct?.smallUnit || 'عبوة'} / ${activeProduct?.largeUnitName || 'كرتونة'}`
                          : `Ratio: ${packagingRatio} units/case`}
                        {activePackagingOption?.suffix ? ` [خيار ${activePackagingOption.suffix}]` : ''}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {isAr ? `بالوحدة الكبرى (${activeProduct?.largeUnitName || 'كرتونة'})` : 'Large Units (Cases)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={qtyLarge}
                        onChange={(e) => handleQtyLargeChange(e.target.value)}
                        placeholder="0"
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {isAr ? `بالوحدة الصغرى (${activeProduct?.smallUnit || 'عبوة'}) *` : 'Small Units (Bottles) *'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={qtySmall}
                        onChange={(e) => handleQtySmallChange(e.target.value)}
                        placeholder="0"
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Inkjet Printed Batch Code & Instant Translation Engine */}
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Printer className="h-4 w-4 text-slate-500" />
                      <span>{isAr ? 'كود التشغيلة المطبوع على المنتج (DDMMHHMM)' : 'Printed Inkjet Batch (DDMMHHMM)'}</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">DD=اليوم MM=الشهر HH=الساعة MM=الدقيقة</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={8}
                      value={printedBatchNo}
                      onChange={(e) => {
                        setPrintedBatchNo(e.target.value);
                        setBatchTranslationResult(null);
                      }}
                      placeholder="e.g. 21091045"
                      className="flex-1 p-2 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:ring-1 focus:ring-rose-500 focus:outline-none uppercase"
                    />
                    <button
                      type="button"
                      onClick={handleTranslateBatch}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center gap-1.5 shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      <span>{isAr ? 'ترجمة الكود للباليتات' : 'Translate Batch'}</span>
                    </button>
                  </div>

                  {batchTranslationResult && (
                    <div className={`p-2.5 rounded-xl border text-xs ${batchTranslationResult.success ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-amber-50/70 border-amber-200 text-amber-950'}`}>
                      <div className="font-bold flex items-center gap-1.5">
                        {batchTranslationResult.success ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                        <span>{isAr ? batchTranslationResult.messageAr : batchTranslationResult.messageEn}</span>
                      </div>
                      {batchTranslationResult.matchedPallets.length > 0 && (
                        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {batchTranslationResult.matchedPallets.map((mp, idx) => (
                            <div key={idx} className="p-1.5 bg-white rounded-lg border border-emerald-200 text-[10px] font-mono">
                              <span className="font-bold text-emerald-800">{mp.palletId}</span> • {mp.startTime}-{mp.endTime}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Suggestive Fault Tags Recognition Cloud */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5 text-rose-500" />
                      <span>{isAr ? 'تصنيف ونوع العيب (Fault Tags) *' : 'Fault Type Tags *'}</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50/80 rounded-xl border border-slate-200 mb-2">
                    {knownTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          className={`px-2 py-0.5 rounded-lg font-bold text-[10px] transition flex items-center gap-1 ${isSelected ? 'bg-rose-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'}`}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5" />}
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      placeholder={isAr ? 'اكتب تصنيف عيب جديد واضغط إضافة...' : 'Type custom tag and click add...'}
                      className="flex-1 p-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition"
                    >
                      {isAr ? '+ إضافة وسم' : '+ Add Tag'}
                    </button>
                  </div>
                </div>

                {/* Defect Description Notes & Photos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'ملاحظات وتفاصيل العيب' : 'Defect Notes'}
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={isAr ? 'توضيح سبب الارتجاع...' : 'Describe defect reasons...'}
                      className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none"
                    ></textarea>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 flex items-center gap-1.5">
                        <ImageIcon className="h-4 w-4 text-slate-500" />
                        <span>{isAr ? 'صور العيب' : 'Photos'}</span>
                      </label>
                      <label className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold text-[10px] hover:bg-rose-100 transition cursor-pointer flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        <span>{isAr ? 'إرفاق صور' : 'Attach'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageUpload}
                          className="sr-only"
                        />
                      </label>
                    </div>

                    {images.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
                        {images.map((imgSrc, idx) => (
                          <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square">
                            <img src={imgSrc} alt="Defect" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="absolute top-0.5 end-0.5 p-0.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* THE "ADD ANOTHER PRODUCT" BUTTON */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleStageCurrentProduct}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl font-bold text-xs shadow-2xs hover:shadow-xs transition cursor-pointer"
                  >
                    <Plus className="h-4 w-4 text-indigo-600" />
                    <span>{isAr ? '+ حفظ هذا الصنف وإضافة صنف آخر للإشعار' : '+ Save Item & Add Another Product'}</span>
                  </button>
                </div>
              </div>

              {/* MODAL BOTTOM ACTIONS */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[11px] text-slate-500 font-bold">
                  {stagedItems.length > 0
                    ? (isAr ? `إجمالي الأصناف الجاهزة للاعتماد: (${stagedItems.length + (selectedProductId ? 1 : 0)})` : `Ready to submit: (${stagedItems.length + (selectedProductId ? 1 : 0)}) products`)
                    : (isAr ? 'سيتم اعتماد الصنف الحالي' : 'Current item will be submitted')}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCreateForm();
                    }}
                    className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`px-5 py-2 text-white rounded-xl font-bold shadow-xs hover:shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50 ${editingVoucher ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                  >
                    {isSubmitting ? (
                      <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>{editingVoucher ? (isAr ? 'حفظ تعديلات الإشعار' : 'Save Changes') : (isAr ? 'اعتماد وإرسال إشعار المرتجع للصالة' : 'Submit Return to Floor')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: THERMAL ROLLED LABEL PRINTING & PAGE SETUP                      */}
      {/* ========================================================================= */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl border border-amber-200">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {isAr ? 'طباعة استيكرات الرول الحراري (Thermal Labels)' : 'Thermal Roll Label Printing'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {isAr
                      ? `إجمالي الملصقات المجهزة للطباعة: (${generatedStickers.length}) ملصق حراري`
                      : `Total labels ready to print: (${generatedStickers.length}) stickers`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPageSetup((prev) => !prev)}
                  className={`p-2 rounded-xl border transition flex items-center gap-1.5 font-bold ${showPageSetup ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                  title={isAr ? 'إعدادات مقاس رول الطباعة الحرارية' : 'Thermal Roll Page Setup'}
                >
                  <Settings className="h-4 w-4 text-amber-700" />
                  <span className="hidden sm:inline">{isAr ? 'إعدادات المقاس' : 'Page Setup'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* COLLAPSIBLE THERMAL ROLL PAGE SETUP */}
              {showPageSetup && (
                <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
                    <span className="font-bold text-amber-950 flex items-center gap-1.5">
                      <Sliders className="h-4 w-4 text-amber-700" />
                      <span>{isAr ? 'إعدادات رول الاستيكر الحراري (Thermal Roll Page Setup):' : 'Thermal Roll Setup:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        saveStoredThermalConfig(thermalConfig);
                        alert(isAr ? 'تم حفظ إعدادات المقاس كافتراضي لهذه المحطة بنجاح!' : 'Thermal settings saved as default!');
                      }}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] shadow-2xs transition"
                    >
                      {isAr ? 'حفظ كافتراضي للمحطة' : 'Save as Default'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">{isAr ? 'العرض (mm)' : 'Width (mm)'}</label>
                      <input
                        type="number"
                        min="20"
                        max="120"
                        value={thermalConfig.widthMm}
                        onChange={(e) => setThermalConfig({ ...thermalConfig, widthMm: Number(e.target.value) })}
                        className="w-full p-1.5 bg-white border border-amber-300 rounded-lg font-mono font-bold text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">{isAr ? 'الارتفاع (mm)' : 'Height (mm)'}</label>
                      <input
                        type="number"
                        min="20"
                        max="150"
                        value={thermalConfig.heightMm}
                        onChange={(e) => setThermalConfig({ ...thermalConfig, heightMm: Number(e.target.value) })}
                        className="w-full p-1.5 bg-white border border-amber-300 rounded-lg font-mono font-bold text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">{isAr ? 'الاتجاه' : 'Orientation'}</label>
                      <select
                        value={thermalConfig.orientation}
                        onChange={(e) => setThermalConfig({ ...thermalConfig, orientation: e.target.value })}
                        className="w-full p-1.5 bg-white border border-amber-300 rounded-lg font-bold"
                      >
                        <option value="landscape">{isAr ? 'أفقي (Landscape)' : 'Landscape'}</option>
                        <option value="portrait">{isAr ? 'رأسي (Portrait)' : 'Portrait'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">{isAr ? 'فاصل الملصقات (Gap mm)' : 'Label Gap (mm)'}</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={thermalConfig.gapMm ?? 2}
                        onChange={(e) => setThermalConfig({ ...thermalConfig, gapMm: Math.max(0, Number(e.target.value)) })}
                        className="w-full p-1.5 bg-white border border-amber-300 rounded-lg font-mono font-bold text-center"
                        title={isAr ? 'المسافة الفاصلة بين كل استيكر وآخر على الرول الحراري (افتراضي 2 مم)' : 'Physical die-cut gap between stickers (Default 2mm)'}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PRINT MODE SELECTION */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  {isAr ? 'طريقة توزيع طباعة الاستيكرات *' : 'Label Quantity Print Mode *'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintMode('per_large_unit')}
                    className={`p-2.5 rounded-xl border text-start transition ${printMode === 'per_large_unit' ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold ring-1 ring-amber-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{isAr ? 'ملصق لكل كرتونة (افتراضي)' : 'Per Large Unit (Default)'}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded font-bold">1/N</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                      {isAr ? 'طباعة استيكر مرقم لكل كرتونة (كرتونة 1 من 5...)' : 'One sticker per carton with sequence index'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrintMode('single_consolidated')}
                    className={`p-2.5 rounded-xl border text-start transition ${printMode === 'single_consolidated' ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold ring-1 ring-amber-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{isAr ? 'ملصق واحد مجمع للكمية' : 'Single Consolidated Label'}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-bold">1</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                      {isAr ? 'استيكر واحد لكامل الكمية (كراتين + عبوات)' : 'One label summarizing total line quantity'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrintMode('per_small_unit')}
                    className={`p-2.5 rounded-xl border text-start transition ${printMode === 'per_small_unit' ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold ring-1 ring-amber-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{isAr ? 'ملصق لكل عبوة صغيرة' : 'Per Small Unit'}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-bold">All</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                      {isAr ? 'استيكر فردي لكل عبوة في حال فرط المحتويات' : 'One label per individual bottle/unit'}
                    </p>
                  </button>
                </div>
              </div>

              {/* REAL-TIME THERMAL STICKER PREVIEW (WYSIWYG) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-700">{isAr ? 'معاينة شكل الملصق الحراري:' : 'Thermal Label Preview:'}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {thermalConfig.widthMm}mm × {thermalConfig.heightMm}mm ({thermalConfig.orientation})
                  </span>
                </div>

                {generatedStickers.length > 0 && (
                  <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center">
                    {/* Thermal Label Physical Card Preview */}
                    <div
                      style={{
                        width: `${thermalConfig.widthMm * 5}px`,
                        minHeight: `${thermalConfig.heightMm * 5}px`,
                        maxWidth: '100%',
                      }}
                      className="bg-white border-2 border-black rounded-lg p-3 shadow-md font-sans text-black flex flex-col justify-between select-none"
                    >
                      {/* Line 1: Header + Sequence Badge */}
                      <div className="flex items-center justify-between border-b-2 border-black pb-1 mb-1">
                        <span className="text-xs font-black tracking-tight">{isAr ? 'مرتجع للانتاج' : 'RETURN TO PRODUCTION'}</span>
                        <span className="text-[11px] font-black border border-black px-1.5 py-0.2 rounded font-mono">
                          {generatedStickers[0].sequenceBadge}
                        </span>
                      </div>

                      {/* Line 2: Product Name (Bold & Prominent) */}
                      <div className="my-1">
                        <div className="text-sm font-black leading-tight truncate">
                          {generatedStickers[0].productName}
                        </div>
                        <div className="font-mono text-[10px] font-bold flex items-center gap-1.5">
                          <span>SKU: {generatedStickers[0].productCode}</span>
                          {generatedStickers[0].packagingOptionSuffix && (
                            <span className="font-sans font-black bg-black text-white px-1 py-0.2 rounded text-[9px]">
                              خيار {generatedStickers[0].packagingOptionSuffix}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Line 3: Voucher ID & Date */}
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold my-0.5">
                        <span>إشعار: {generatedStickers[0].voucherId}</span>
                        <span>{generatedStickers[0].returnDate}</span>
                      </div>

                      {/* Line 4: Fault Tags */}
                      {generatedStickers[0].faultTags && (
                        <div className="text-[10px] font-black text-black border-t border-dashed border-black pt-1 my-0.5">
                          العيب: {generatedStickers[0].faultTags}
                        </div>
                      )}

                      {/* Line 5: Printed Batch Code if available */}
                      {generatedStickers[0].batchNo && (
                        <div className="text-[10px] font-mono font-bold mt-1 pt-1 border-t border-slate-300">
                          تشغيلة الطباعة: {generatedStickers[0].batchNo}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-bold">
                {isAr
                  ? `جاهز لطباعة (${generatedStickers.length}) ملصق حراري متتابع`
                  : `Ready to print (${generatedStickers.length}) continuous labels`}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleExecutePrint}
                  disabled={isPrinting || generatedStickers.length === 0}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isPrinting ? (isAr ? 'جاري إرسال الأمر...' : 'Printing...') : (isAr ? `طباعة الملصقات (${generatedStickers.length})` : `Print Labels (${generatedStickers.length})`)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ISOLATED PORTAL FOR CLEAN THERMAL BROWSER PRINT (A4 / ROLL DRIVER SAFE) */}
      {showPrintModal && createPortal(
        <div id="thermal-print-container">
          <style>{`
            @media screen {
              #thermal-print-container {
                display: none !important;
              }
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }
              body * {
                visibility: hidden !important;
              }
              #thermal-print-container,
              #thermal-print-container * {
                visibility: visible !important;
              }
              #thermal-print-container {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }
              @page {
                size: ${thermalConfig.widthMm}mm ${thermalConfig.heightMm}mm !important;
                margin: 0mm !important;
              }
              .thermal-page-sticker {
                width: ${thermalConfig.widthMm}mm !important;
                height: ${thermalConfig.heightMm}mm !important;
                margin-bottom: ${thermalConfig.gapMm || 0}mm !important;
                page-break-after: always !important;
                break-after: page !important;
                box-sizing: border-box !important;
                padding: 2.5mm 3mm !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                color: #000 !important;
                background: #fff !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                overflow: hidden !important;
              }
            }
          `}</style>

          {generatedStickers.map((sticker, idx) => (
            <div key={idx} className="thermal-page-sticker">
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '1.5px', marginBottom: '1.5px' }}>
                <span style={{ fontSize: '9pt', fontWeight: '900' }}>مرتجع للانتاج</span>
                <span style={{ fontSize: '8pt', fontWeight: '900', border: '1px solid #000', padding: '0.5px 3px', borderRadius: '2px', fontFamily: 'monospace' }}>
                  {sticker.sequenceBadge}
                </span>
              </div>

              {/* Product Name (Bold & Prominent) */}
              <div style={{ margin: '1px 0' }}>
                <div style={{ fontSize: '9.5pt', fontWeight: '900', lineHeight: 1.15, wordBreak: 'break-word' }}>
                  {sticker.productName}
                </div>
                <div style={{ fontSize: '8pt', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  SKU: {sticker.productCode}
                  {sticker.packagingOptionSuffix && (
                    <span style={{ marginInlineStart: '6px', padding: '0 3px', border: '1px solid #000', borderRadius: '2px', fontSize: '7.5pt' }}>
                      خيار {sticker.packagingOptionSuffix}
                    </span>
                  )}
                </div>
              </div>

              {/* Voucher ID & Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt', fontFamily: 'monospace', fontWeight: 'bold', margin: '1px 0' }}>
                <span>إشعار: {sticker.voucherId}</span>
                <span>{sticker.returnDate}</span>
              </div>

              {/* Fault Tags */}
              {sticker.faultTags && (
                <div style={{ fontSize: '8pt', fontWeight: '900', borderTop: '1px dashed #000', paddingTop: '1px', margin: '1px 0' }}>
                  العيب: {sticker.faultTags}
                </div>
              )}

              {/* Printed Batch Code */}
              {sticker.batchNo && (
                <div style={{ fontSize: '8pt', fontFamily: 'monospace', fontWeight: 'bold', borderTop: '1px solid #000', paddingTop: '1px' }}>
                  تشغيلة: {sticker.batchNo}
                </div>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL: CONFIRM FLOOR RECEIPT (HANDSHAKE)                               */}
      {/* ========================================================================= */}
      {showConfirmModal && activeVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden text-xs">
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-amber-50/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl border border-amber-200">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {isAr ? 'تأكيد استلام المرتجع بصالة الإنتاج' : 'Confirm Floor Receipt'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium font-mono">
                    {activeVoucher.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Reconfirmation Alert Banner */}
              {activeVoucher.reconfirmationRequired && (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 text-amber-950 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{isAr ? 'تنبيه: تم تعديل هذا الإشعار بعد تأكيد استلامه سابقاً - يتطلب إعادة تأكيد الاستلام بناءً على التعديلات التالية:' : 'Notice: This voucher was edited after previous receipt. Re-confirmation required:'}</span>
                  </div>
                  {Array.isArray(activeVoucher.reconfirmationNotice) && activeVoucher.reconfirmationNotice.length > 0 && (
                    <ul className="list-disc list-inside ps-2 space-y-0.5 text-[11px] text-amber-800">
                      {activeVoucher.reconfirmationNotice.map((note, nIdx) => (
                        <li key={nIdx}>{note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{isAr ? 'إجمالي الكمية:' : 'Total Qty:'}</span>
                  <span className="font-bold text-rose-600 font-mono">
                    {activeVoucher.qtyLarge} {activeVoucher.largeUnit} ({activeVoucher.qtySmall} {activeVoucher.smallUnit})
                  </span>
                </div>
                {activeVoucher.salesReturnDetails?.returnNoteNo && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">{isAr ? 'إذن الارتجاع:' : 'Return Note:'}</span>
                    <span className="font-bold text-purple-700 font-mono">#{activeVoucher.salesReturnDetails.returnNoteNo}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات الاستلام والفحص بالصالة' : 'Receipt & Inspection Notes'}
                </label>
                <textarea
                  rows={2}
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  placeholder={isAr ? 'مثال: تم الاستلام وفحص الكمية، جاهزة لإعادة التشغيل...' : 'Receipt remarks...'}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                {isAr
                  ? '💡 بالضغط على تأكيد، تنتقل عهدة المنتجات رسمياً من مستودع المنتج التام إلى عهدة صالة الإنتاج وتبقى في وضع الاستعداد (Standby) بانتظار إعادة التشغيل أو التخريد.'
                  : 'By confirming, physical custody transfers to the production floor under Standby status for rework or scrap.'}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFloorReceipt}
                  disabled={isConfirming}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>{isConfirming ? (isAr ? 'جاري التأكيد...' : 'Confirming...') : (activeVoucher.reconfirmationRequired ? (isAr ? 'إعادة تأكيد استلام الصالة بعد التعديل' : 'Re-confirm Receipt') : (isAr ? 'تأكيد استلام الصالة ونقل العهدة' : 'Confirm Custody Transfer'))}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: RESOLVE RETURN (REWORK / SCRAP)                                 */}
      {/* ========================================================================= */}
      {showResolveModal && activeVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden text-xs">
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-blue-50/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-800 rounded-2xl border border-blue-200">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {isAr ? 'توثيق معالجة المنتجات المعيبة' : 'Resolve Faulty Goods'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium font-mono">
                    {activeVoucher.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-2">
                  {isAr ? 'طريقة المعالجة والتصرف *' : 'Resolution Action *'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolutionType('reworked')}
                    className={`p-3 rounded-xl border text-start flex items-center gap-2.5 transition ${resolutionType === 'reworked' ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    <CheckCircle2 className={`h-5 w-5 ${resolutionType === 'reworked' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div>
                      <div>{isAr ? 'إعادة تشغيل وتعبئة' : 'Rework & Refill'}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{isAr ? 'تصحيح العيب بالصالة' : 'Rework on floor'}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolutionType('scrapped')}
                    className={`p-3 rounded-xl border text-start flex items-center gap-2.5 transition ${resolutionType === 'scrapped' ? 'border-rose-500 bg-rose-50 text-rose-950 font-bold ring-1 ring-rose-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    <AlertOctagon className={`h-5 w-5 ${resolutionType === 'scrapped' ? 'text-rose-600' : 'text-slate-400'}`} />
                    <div>
                      <div>{isAr ? 'تخريد وإعدام معتمد' : 'Authorized Scrap'}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{isAr ? 'غير قابل للإصلاح' : 'Beyond rework'}</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'تفاصيل وملاحظات الإجراء' : 'Resolution Details & Notes'}
                </label>
                <textarea
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder={isAr ? 'رقم أمر التشغيل الذي تمت إعادة التعبئة عليه أو محضر الإعدام...' : 'Enter rework details or scrap protocol...'}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleResolveVoucher}
                  disabled={isResolving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>{isResolving ? (isAr ? 'جاري الإغلاق...' : 'Closing...') : (isAr ? 'إغلاق وتوثيق الإجراء' : 'Close Voucher')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. MODAL: FULL VOUCHER DETAILS VIEW                                       */}
      {/* ========================================================================= */}
      {showDetailsModal && activeVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900">
                    {isAr ? 'تفاصيل إشعار المرتجع' : 'Return Voucher Details'}
                  </h3>
                  <span className="font-mono text-xs font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {activeVoucher.id}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr ? `تاريخ الارتجاع: ${activeVoucher.returnDate}` : `Date: ${activeVoucher.returnDate}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Details Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Reconfirmation Alert Banner */}
              {activeVoucher.reconfirmationRequired && (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 text-amber-950 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{isAr ? 'تنبيه: تم تعديل هذا الإشعار بعد تأكيد الاستلام السابق - بانتظار إعادة تأكيد استلام الصالة بناءً على الفروقات التالية:' : 'Notice: Edited after previous receipt. Production re-confirmation pending for:'}</span>
                  </div>
                  {Array.isArray(activeVoucher.reconfirmationNotice) && activeVoucher.reconfirmationNotice.length > 0 && (
                    <ul className="list-disc list-inside ps-2 space-y-0.5 text-[11px] text-amber-800">
                      {activeVoucher.reconfirmationNotice.map((note, nIdx) => (
                        <li key={nIdx}>{note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Source & Sales Return Info */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <p className="text-slate-500 font-bold">{isAr ? 'بيانات المصدر:' : 'Source Information:'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <span className="text-slate-400 block text-[10px]">{isAr ? 'نوع المصدر' : 'Source Type'}</span>
                    <span className="font-bold text-slate-800">
                      {activeVoucher.sourceType === 'sales_return'
                        ? (isAr ? 'مرتجع مبيعات' : 'Sales Return')
                        : (isAr ? 'مستودع المنتج التام' : 'FG Warehouse')}
                    </span>
                  </div>
                  {activeVoucher.salesReturnDetails?.returnNoteNo && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">{isAr ? 'رقم إذن الارتجاع' : 'Return Note #'}</span>
                      <span className="font-bold text-purple-700 font-mono">#{activeVoucher.salesReturnDetails.returnNoteNo}</span>
                    </div>
                  )}
                  {activeVoucher.salesReturnDetails?.clientName && (
                    <div>
                      <span className="text-slate-400 block text-[10px]">{isAr ? 'العميل' : 'Client'}</span>
                      <span className="font-bold text-slate-800">{activeVoucher.salesReturnDetails.clientName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <p className="text-slate-500 font-bold">{isAr ? 'قائمة الأصناف المعيبة المدرجة:' : 'Returned Products List:'}</p>
                {(Array.isArray(activeVoucher.items) && activeVoucher.items.length > 0 ? activeVoucher.items : [activeVoucher]).map((item, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-slate-900 text-sm">{item.productNameAr}</span>
                          <span className="font-mono text-xs text-slate-500">[{item.packagingOptionCode || item.productCode}]</span>
                          {item.packagingOptionSuffix && (
                            <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[10px] font-bold font-mono">
                              {isAr ? `خيار (${item.packagingOptionSuffix})` : `Option (${item.packagingOptionSuffix})`}
                              {item.packagingOptionNameAr && item.packagingOptionSuffix !== 'A' ? ` - ${item.packagingOptionNameAr}` : ''}
                            </span>
                          )}
                        </div>
                        {item.packagingRatio && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {isAr ? `معيار التعبئة: 1 ${item.largeUnit || 'كرتونة'} = ${item.packagingRatio} ${item.smallUnit || 'عبوة'}` : `Ratio: 1 case = ${item.packagingRatio} units`}
                          </div>
                        )}
                      </div>
                      <div className="text-end">
                        <span className="font-black text-rose-700 font-mono text-sm">
                          {item.qtyLarge} {item.largeUnit} ({item.qtySmall} {item.smallUnit})
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60">
                      <span className="font-bold text-slate-600 text-[10px]">{isAr ? 'تصنيفات العيب:' : 'Fault Tags:'}</span>
                      {(item.faultTags || []).map((t, tIdx) => (
                        <span key={tIdx} className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded-lg text-[10px]">
                          {t}
                        </span>
                      ))}
                      {item.printedBatchNo && (
                        <span className="ms-auto font-mono text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-bold">
                          تشغيلة: {item.printedBatchNo}
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-slate-700 text-[11px] bg-white p-2 rounded-xl border border-slate-200">
                        {item.notes}
                      </p>
                    )}

                    {Array.isArray(item.images) && item.images.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 pt-1">
                        {item.images.map((imgSrc, imgIdx) => (
                          <div key={imgIdx} className="rounded-xl overflow-hidden border border-slate-200 aspect-square">
                            <img src={imgSrc} alt="Defect" className="w-full h-full object-cover cursor-pointer hover:scale-105 transition" onClick={() => window.open(imgSrc, '_blank')} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Custody & Handshake Audit Trail */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <p className="text-slate-500 font-bold">{isAr ? 'سجل تتبع العهدة (Handshake Audit):' : 'Custody Handshake Audit:'}</p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span>
                      {isAr ? `تم التحرير بواسطة: ${activeVoucher.submittedBy?.userName || 'مستودع التام'}` : `Submitted by: ${activeVoucher.submittedBy?.userName}`}
                    </span>
                  </div>

                  {activeVoucher.confirmedByProduction && (
                    <div className="flex items-center gap-2 text-amber-800 font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>
                        {isAr
                          ? `تم تأكيد استلام الصالة بواسطة: ${activeVoucher.confirmedByProduction.userName} (${activeVoucher.confirmedByProduction.confirmedAt?.slice(0, 10)})`
                          : `Confirmed on floor by: ${activeVoucher.confirmedByProduction.userName}`}
                      </span>
                    </div>
                  )}

                  {activeVoucher.resolution && (
                    <div className="flex items-center gap-2 text-emerald-800 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>
                        {isAr
                          ? `تم إغلاق الإجراء (${activeVoucher.resolution.type === 'reworked' ? 'إعادة تشغيل' : 'تخريد'}) بواسطة: ${activeVoucher.resolution.resolvedBy?.userName}`
                          : `Resolved as (${activeVoucher.resolution.type}) by: ${activeVoucher.resolution.resolvedBy?.userName}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenVoucherPrint(activeVoucher)}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer text-xs"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isAr ? 'طباعة استيكرات هذا الإشعار' : 'Print Labels'}</span>
                </button>

                {canEditVoucher(activeVoucher) && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDetailsModal(false);
                      handleOpenEditVoucher(activeVoucher);
                    }}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>{isAr ? 'تعديل الإشعار' : 'Edit Voucher'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition cursor-pointer text-xs"
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
