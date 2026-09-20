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
  Plus,
  Search,
  Package,
  Layers,
  Edit3,
  Trash2,
  Boxes,
  Tag,
  Barcode,
  Sparkles,
  Gift,
  Building2,
  ChevronDown,
  ChevronRight,
  X,
  PlusCircle,
  Receipt,
  Scale,
  Lock,
  UploadCloud,
  CheckCircle2,
  Ban,
  Image as ImageIcon,
  Calendar,
  Warehouse,
  Clock,
  FolderCog,
  ArrowUpDown
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

// Lightweight Client-Side Image Compression Helper (<80KB Web-Ready Payloads)
const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const elem = document.createElement('canvas');
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

        elem.width = width;
        elem.height = height;
        const ctx = elem.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(elem.toDataURL('image/jpeg', quality));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Initial Seed Categories / Product Lines
const DEFAULT_PRODUCT_LINES = [
  { id: 'white_o', key: 'white_o', sortOrder: 1, nameAr: 'WHITE O (خل اقتصادي)', nameEn: 'WHITE O (Economic)', color: '#d97706' },
  { id: 'white_t', key: 'white_t', sortOrder: 2, nameAr: 'WHITE T (خل عادي / ممتاز)', nameEn: 'WHITE T (Standard)', color: '#0d6cba' },
  { id: 'tahini', key: 'tahini', sortOrder: 3, nameAr: 'طحينة (Tahini)', nameEn: 'Tahini', color: '#ea580c' },
  { id: 'rice', key: 'rice', sortOrder: 4, nameAr: 'أرز (Rice)', nameEn: 'Rice', color: '#059669' },
  { id: 'others', key: 'others', sortOrder: 5, nameAr: 'أخرى (Others)', nameEn: 'Others', color: '#475569' },
];

export default function FinishedProductsMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('finished_products'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('finished_products'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#0d6cba';
  const { r, g, b } = hexToRgb(tabColor);

  // Dynamic Authority Resolvers
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['finished_products.canCreate'] !== undefined
      ? permissions.actions['finished_products.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['finished_products.canEdit'] !== undefined
      ? permissions.actions['finished_products.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['finished_products.canDelete'] !== undefined
      ? permissions.actions['finished_products.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

  // Cloud State
  const [categories, setCategories] = useState(DEFAULT_PRODUCT_LINES);
  const [products, setProducts] = useState([]);
  const [warehousesList, setWarehousesList] = useState([]);
  const [goodsReceiptsList, setGoodsReceiptsList] = useState([]);
  const [transfersList, setTransfersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Category Management Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [catFormData, setCatFormData] = useState({ id: '', key: '', sortOrder: 1, nameAr: '', nameEn: '' });
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [lineFilter, setLineFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [bonusFilter, setBonusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Expandable Rows State
  const [expandedProducts, setExpandedProducts] = useState({});

  // Product Modal & Image Lightbox Popover State
  const [showModal, setShowModal] = useState(false);
  const [editingProductCode, setEditingProductCode] = useState(null);
  const [imagePreviewModal, setImagePreviewModal] = useState(null); // { url, title, subtitle }

  // Helper: Auto-calculate Expiry Date from Production Date + Shelf Life Months
  const calculateExpiryDate = (prodDateStr, months) => {
    if (!prodDateStr) return '';
    const d = new Date(prodDateStr);
    if (isNaN(d.getTime())) return '';
    const m = Number(months) || 24;
    d.setMonth(d.getMonth() + m);
    return d.toISOString().split('T')[0];
  };

  // Initial Product Form State
  const initialFormState = {
    code: '',
    nameAr: '',
    nameEn: '',
    shortName: '',
    productType: 'main',
    productionLine: 'white_o',
    brandOwnership: 'own_brand',
    clientName: '',
    smallUnit: 'زجاجة',
    largeUnitName: 'كرتونة',
    packagingRatio: 12,
    shelfLifeMonths: 24,
    vatRate: '14%',
    isBonusEligible: true,
    reorderLevel: 500,
    status: 'active',
    imageFile: '',
    packagingOptions: [
      {
        id: 'OPT-01',
        suffix: 'A',
        optionCode: '',
        nameAr: 'التصميم القياسي المعتمد',
        nameEn: 'Standard Certified Design',
        barcodeUnit: '',
        barcodeCase: '',
        etaBarcode: '',
        largeUnitWeightKg: '',
        packagingRatio: 12,
        imageFile: '',
        isActive: true,
        openingWarehouse: '',
        openingQtySmall: '',
        openingQtyLarge: '',
        openingBatchNo: '',
        openingProdDate: '',
        openingExpDate: '',
      }
    ]
  };

  const [formData, setFormData] = useState(initialFormState);

  // Subscribe to Firestore Collections (Products, Categories, Warehouses, GRNs, Transfers)
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      setProducts(list);
      setLoading(false);
    });

    const unsubCategories = onSnapshot(collection(db, 'finished_product_categories'), async (snap) => {
      if (snap.empty) {
        try {
          const batch = writeBatch(db);
          DEFAULT_PRODUCT_LINES.forEach((cat) => {
            batch.set(doc(db, 'finished_product_categories', cat.id), {
              ...cat,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        } catch (err) {
          console.error('Error auto-seeding finished product categories:', err);
        }
      } else {
        const list = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          key: d.data().key || d.id,
          sortOrder: Number(d.data().sortOrder) || 1,
        }));
        list.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
        setCategories(list);
      }
    });

    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((w) => w.isActive !== false);
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehousesList(list);
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceiptsList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubWh();
      unsubGrns();
      unsubTransfers();
    };
  }, []);

  // Compute Live Physical Stock Balance per Product
  const liveStockMap = useMemo(() => {
    const map = {};

    goodsReceiptsList.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      const isRet = grn.docType === 'return' || grn.id?.startsWith('RTN');

      (grn.lines || []).forEach((l) => {
        const pCode = l.itemId || (l.code ? l.code.split('-')[0] + '-' + l.code.split('-')[1] : '');
        const qty = (Number(l.receivedSmallUnits) || 0) * (isRet ? -1 : 1);
        if (pCode) {
          map[pCode] = (map[pCode] || 0) + qty;
        }
      });
    });

    return map;
  }, [goodsReceiptsList]);

  // Sequential Next SKU Code Generator
  const generateNextProductCode = () => {
    const existingNums = products
      .map((p) => {
        const m = (p.code || '').match(/FG-(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));

    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 101;
    return `FG-${nextNum}`;
  };

  // Helper for Category Line Badge
  const getLineBadge = (lineKey) => {
    const cat = categories.find((c) => c.key === lineKey || c.id === lineKey);
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
        <span>{cat ? (isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)) : lineKey}</span>
      </span>
    );
  };

  // ==========================================
  // CATEGORY MANAGEMENT HANDLERS (ADMIN ONLY)
  // ==========================================
  const handleStartAddCategory = () => {
    const maxSort = categories.length > 0 ? Math.max(...categories.map((c) => Number(c.sortOrder) || 0)) : 0;
    setEditingCatId(null);
    setCatFormData({
      id: '',
      key: '',
      sortOrder: maxSort + 1,
      nameAr: '',
      nameEn: '',
    });
  };

  const handleStartEditCategory = (cat) => {
    setEditingCatId(cat.id);
    setCatFormData({
      id: cat.id,
      key: cat.key || cat.id,
      sortOrder: cat.sortOrder || 1,
      nameAr: cat.nameAr || '',
      nameEn: cat.nameEn || '',
    });
  };

  const handleSaveCategory = async (e) => {
    e?.preventDefault();
    if (!catFormData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم التصنيف بالعربية.' : 'Please enter Arabic category name.');
      return;
    }

    const catKey = (catFormData.key || catFormData.nameAr).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') || `cat_${Date.now()}`;
    const catDocId = editingCatId || catKey;

    setIsSavingCategory(true);
    try {
      await setDoc(
        doc(db, 'finished_product_categories', catDocId),
        {
          id: catDocId,
          key: catDocId,
          sortOrder: Number(catFormData.sortOrder) || 1,
          nameAr: catFormData.nameAr.trim(),
          nameEn: catFormData.nameEn.trim() || catFormData.nameAr.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setEditingCatId(null);
      setCatFormData({ id: '', key: '', sortOrder: 1, nameAr: '', nameEn: '' });
    } catch (err) {
      console.error('Error saving finished product category:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التصنيف.' : 'Error saving category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!isGeneralAdmin) return;

    // Safety check: Prevent deletion if any product is assigned to this production line
    const linkedProducts = products.filter((p) => p.productionLine === catId);
    if (linkedProducts.length > 0) {
      alert(
        isAr
          ? `لا يمكن حذف هذا التصنيف لأنه مرتبط بـ (${linkedProducts.length}) منتج تام مسجل.`
          : `Cannot delete category. It is currently assigned to (${linkedProducts.length}) finished products.`
      );
      return;
    }

    if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا التصنيف نهائياً؟' : 'Delete this category permanently?')) {
      try {
        await deleteDoc(doc(db, 'finished_product_categories', catId));
        if (editingCatId === catId) {
          setEditingCatId(null);
          setCatFormData({ id: '', key: '', sortOrder: 1, nameAr: '', nameEn: '' });
        }
      } catch (err) {
        console.error('Error deleting category:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف التصنيف.' : 'Error deleting category.');
      }
    }
  };

  // ==========================================
  // FINISHED PRODUCTS CRUD HANDLERS
  // ==========================================
  const handleOpenCreate = () => {
    const nextCode = generateNextProductCode();
    const defaultWh = warehousesList[0]?.id || warehousesList[0]?.code || '';
    const defaultCatKey = categories[0]?.key || categories[0]?.id || 'white_o';

    setEditingProductCode(null);
    setFormData({
      ...initialFormState,
      code: nextCode,
      productionLine: defaultCatKey,
      packagingOptions: [
        {
          id: 'OPT-01',
          suffix: 'A',
          optionCode: `${nextCode}-A`,
          nameAr: 'التصميم القياسي المعتمد',
          nameEn: 'Standard Certified Design',
          barcodeUnit: '',
          barcodeCase: '',
          etaBarcode: '',
          largeUnitWeightKg: '',
          packagingRatio: 12,
          imageFile: '',
          isActive: true,
          openingWarehouse: defaultWh,
          openingQtySmall: '',
          openingQtyLarge: '',
          openingBatchNo: '',
          openingProdDate: '',
          openingExpDate: '',
        }
      ]
    });
    setShowModal(true);
  };

  const handleOpenEdit = (product) => {
    const defaultWh = warehousesList[0]?.id || warehousesList[0]?.code || '';
    setEditingProductCode(product.code);
    setFormData({
      code: product.code || '',
      nameAr: product.nameAr || '',
      nameEn: product.nameEn || '',
      shortName: product.shortName || '',
      productType: product.productType || 'main',
      productionLine: product.productionLine || categories[0]?.key || 'white_o',
      brandOwnership: product.brandOwnership || 'own_brand',
      clientName: product.clientName || '',
      smallUnit: product.smallUnit || 'زجاجة',
      largeUnitName: product.largeUnitName || 'كرتونة',
      packagingRatio: Number(product.packagingRatio) || 12,
      shelfLifeMonths: Number(product.shelfLifeMonths) || 24,
      vatRate: product.vatRate || '14%',
      isBonusEligible: product.isBonusEligible !== false,
      reorderLevel: product.reorderLevel || 500,
      status: product.status || 'active',
      imageFile: product.imageFile || '',
      packagingOptions: product.packagingOptions?.length
        ? product.packagingOptions.map((opt) => ({
            ...opt,
            openingWarehouse: opt.openingWarehouse || defaultWh,
            openingQtySmall: '',
            openingQtyLarge: '',
            openingBatchNo: '',
            openingProdDate: '',
            openingExpDate: '',
          }))
        : [
            {
              id: 'OPT-01',
              suffix: 'A',
              optionCode: `${product.code}-A`,
              nameAr: 'التصميم القياسي المعتمد',
              nameEn: 'Standard Certified Design',
              barcodeUnit: '',
              barcodeCase: '',
              etaBarcode: '',
              largeUnitWeightKg: '',
              packagingRatio: Number(product.packagingRatio) || 12,
              imageFile: '',
              isActive: true,
              openingWarehouse: defaultWh,
              openingQtySmall: '',
              openingQtyLarge: '',
              openingBatchNo: '',
              openingProdDate: '',
              openingExpDate: '',
            }
          ]
    });
    setShowModal(true);
  };

  const handleDeleteProduct = async (code, name) => {
    if (!canDelete) {
      alert(isAr ? 'ليس لديك صلاحية حذف المنتجات التامة.' : 'You do not have permission to delete products.');
      return;
    }

    const currentStock = liveStockMap[code] || 0;
    if (currentStock > 0) {
      alert(
        isAr
          ? `لا يمكن حذف المنتج التام (${name}) لأن رصيده المخزني الحالي = ${currentStock.toLocaleString()} عبوة. يجب تصفير رصيد المخزن أولاً.`
          : `Cannot delete product (${name}) because current stock balance is ${currentStock}. Zero out stock first.`
      );
      return;
    }

    if (window.confirm(isAr ? `هل أنت متأكد من حذف المنتج التام (${name}) نهائياً؟` : `Delete product (${name}) permanently?`)) {
      try {
        await deleteDoc(doc(db, 'finished_products', code));
      } catch (err) {
        console.error('Error deleting product:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف المنتج.' : 'Error deleting product.');
      }
    }
  };

  const handleAddPackagingOption = () => {
    const nextIdx = formData.packagingOptions.length;
    const nextSuffix = String.fromCharCode(65 + nextIdx);
    const parentCode = formData.code || 'FG-101';
    const primaryOption = formData.packagingOptions[0] || {};

    setFormData({
      ...formData,
      packagingOptions: [
        ...formData.packagingOptions,
        {
          id: `OPT-${String(nextIdx + 1).padStart(2, '0')}`,
          suffix: nextSuffix,
          optionCode: `${parentCode}-${nextSuffix}`,
          nameAr: `تصميم / خيار تعبئة (${nextSuffix})`,
          nameEn: `Packaging Option (${nextSuffix})`,
          barcodeUnit: primaryOption.barcodeUnit || '',
          barcodeCase: primaryOption.barcodeCase || '',
          etaBarcode: primaryOption.etaBarcode || '',
          largeUnitWeightKg: primaryOption.largeUnitWeightKg !== undefined ? primaryOption.largeUnitWeightKg : '',
          packagingRatio: formData.packagingRatio || 12,
          imageFile: '',
          isActive: true,
          openingWarehouse: primaryOption.openingWarehouse || warehousesList[0]?.id || '',
          openingQtySmall: '',
          openingQtyLarge: '',
          openingBatchNo: '',
          openingProdDate: '',
          openingExpDate: '',
        }
      ]
    });
  };

  const handleRemovePackagingOption = (optIdx) => {
    if (formData.packagingOptions.length === 1) return;
    setFormData({
      ...formData,
      packagingOptions: formData.packagingOptions.filter((_, idx) => idx !== optIdx)
    });
  };

  const handlePackagingOptionChange = (optIdx, field, value) => {
    const updated = [...formData.packagingOptions];
    updated[optIdx][field] = value;

    if (field === 'openingProdDate') {
      updated[optIdx].openingExpDate = calculateExpiryDate(value, formData.shelfLifeMonths);
    }

    setFormData({ ...formData, packagingOptions: updated });
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();

    if (!canCreate && !editingProductCode) {
      alert(isAr ? 'ليس لديك صلاحية إضافة منتجات تامة.' : 'Permission denied to create products.');
      return;
    }
    if (!canEdit && editingProductCode) {
      alert(isAr ? 'ليس لديك صلاحية تعديل المنتجات التامة.' : 'Permission denied to edit products.');
      return;
    }

    if (!formData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم المنتج باللغة العربية.' : 'Please enter Arabic product name.');
      return;
    }

    if (formData.brandOwnership === 'private_label' && !formData.clientName.trim()) {
      alert(isAr ? 'يرجى إدخال اسم العميل صاحب العلامة الخاصة.' : 'Please enter client name for private label.');
      return;
    }

    const targetCode = formData.code.trim().toUpperCase();
    const currentStock = liveStockMap[targetCode] || 0;

    if (formData.status === 'inactive' && currentStock > 0) {
      alert(
        isAr
          ? `لا يمكن تعطيل المنتج (${formData.nameAr}) لأن رصيده المخزني الفعلي = ${currentStock.toLocaleString()} عبوة.\nيجب تصفير أو صرف الرصيد من المستودعات قبل إيقاف الصنف.`
          : `Cannot deactivate product (${formData.nameAr}) because available stock balance is ${currentStock}. Zero out stock first.`
      );
      return;
    }

    const primaryOption = formData.packagingOptions[0];
    if (!primaryOption || !primaryOption.barcodeUnit || !primaryOption.barcodeUnit.trim()) {
      alert(
        isAr
          ? 'باركود العبوة الصغرى (EAN-13) إلزامي للعبوة والتصميم القياسي الأساسي (Option A).'
          : 'Small unit barcode (EAN-13) is mandatory for standard packaging option (Option A).'
      );
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const todayStr = new Date().toISOString().split('T')[0];
      const todayCompact = todayStr.replace(/-/g, '');

      const payload = {
        id: targetCode,
        code: targetCode,
        nameAr: formData.nameAr.trim(),
        nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
        shortName: formData.shortName.trim(),
        productType: formData.productType,
        productionLine: formData.productionLine,
        brandOwnership: formData.brandOwnership,
        clientName: formData.brandOwnership === 'private_label' ? formData.clientName.trim() : '',
        smallUnit: formData.smallUnit.trim(),
        largeUnitName: formData.largeUnitName.trim(),
        packagingRatio: Number(formData.packagingRatio) || 1,
        shelfLifeMonths: Number(formData.shelfLifeMonths) || 24,
        vatRate: formData.vatRate,
        isBonusEligible: Boolean(formData.isBonusEligible),
        reorderLevel: Number(formData.reorderLevel) || 0,
        imageFile: formData.imageFile || '',
        status: formData.status,
        packagingOptionsCount: formData.packagingOptions.length,
        // Explicitly sanitize each map object to prevent invalid nested array entities in Firestore
        packagingOptions: formData.packagingOptions.map((opt, idx) => {
          const optSuffix = (opt.suffix || String.fromCharCode(65 + idx)).trim().toUpperCase();
          return {
            id: opt.id || `OPT-${String(idx + 1).padStart(2, '0')}`,
            suffix: optSuffix,
            optionCode: opt.optionCode || `${targetCode}-${optSuffix}`,
            nameAr: (opt.nameAr || `تصميم (${optSuffix})`).trim(),
            nameEn: (opt.nameEn || `Option (${optSuffix})`).trim(),
            barcodeUnit: (opt.barcodeUnit || '').trim(),
            barcodeCase: (opt.barcodeCase || '').trim(),
            etaBarcode: (opt.etaBarcode || '').trim(),
            largeUnitWeightKg: opt.largeUnitWeightKg !== '' && opt.largeUnitWeightKg !== undefined ? Number(opt.largeUnitWeightKg) : 0,
            packagingRatio: Number(opt.packagingRatio) || Number(formData.packagingRatio) || 1,
            imageFile: opt.imageFile || '',
            isActive: opt.isActive !== false,
            openingWarehouse: opt.openingWarehouse || '',
            openingQtySmall: Number(opt.openingQtySmall || 0),
            openingQtyLarge: Number(opt.openingQtyLarge || 0),
            openingBatchNo: opt.openingBatchNo || '',
            openingProdDate: opt.openingProdDate || '',
            openingExpDate: opt.openingExpDate || '',
          };
        }),
        updatedAt: serverTimestamp(),
      };

      if (!editingProductCode) {
        payload.createdAt = serverTimestamp();
      }

      batch.set(doc(db, 'finished_products', targetCode), payload, { merge: true });

      formData.packagingOptions.forEach((opt) => {
        const openQty = Number(opt.openingQtySmall || 0);
        if (openQty > 0 && opt.openingWarehouse) {
          const obId = `OB-FG-${todayCompact}-${targetCode}-${opt.suffix}`;
          const obLotNo = `FG-LOT-${todayCompact}-${targetCode}-${opt.suffix}`;
          const ratio = Number(opt.packagingRatio) || Number(formData.packagingRatio) || 1;
          const expDate = opt.openingExpDate || calculateExpiryDate(opt.openingProdDate || todayStr, formData.shelfLifeMonths);

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
                itemId: targetCode,
                code: `${targetCode}-${opt.suffix}`,
                variantCode: `${targetCode}-${opt.suffix}`,
                variantSuffix: opt.suffix,
                nameAr: formData.nameAr.trim(),
                nameEn: formData.nameEn.trim(),
                specs: opt.nameAr || '',
                targetWarehouse: opt.openingWarehouse,
                largeUnitName: formData.largeUnitName,
                receivedLargeUnits: Number((openQty / ratio).toFixed(2)),
                packagingRatio: ratio,
                smallUnit: formData.smallUnit,
                receivedSmallUnits: openQty,
                unitPrice: 0,
                currency: 'EGP',
                hasBatchTracking: Boolean(opt.openingBatchNo),
                supplierBatchNo: opt.openingBatchNo || 'OB-LOT',
                productionDate: opt.openingProdDate || todayStr,
                expiryDate: expDate,
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
            itemId: targetCode,
            variantCode: `${targetCode}-${opt.suffix}`,
            materialNameAr: formData.nameAr.trim(),
            qty: openQty,
            unit: formData.smallUnit,
            warehouse: opt.openingWarehouse,
            receiptDate: todayStr,
            batchNo: opt.openingBatchNo || 'OB-LOT',
            productionDate: opt.openingProdDate || null,
            expiryDate: expDate || null,
            receivedBy: currentUser?.nameAr || currentUser?.name || 'General Admin',
            timestamp: serverTimestamp(),
          });
        }
      });

      await batch.commit();
      setShowModal(false);
    } catch (err) {
      console.error('Error saving finished product:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المنتج التام.' : 'Error saving finished product.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter products based on search and top filters
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.code?.toLowerCase().includes(q) ||
        p.nameAr?.toLowerCase().includes(q) ||
        p.nameEn?.toLowerCase().includes(q) ||
        p.shortName?.toLowerCase().includes(q) ||
        p.clientName?.toLowerCase().includes(q) ||
        p.packagingOptions?.some(
          (opt) =>
            opt.optionCode?.toLowerCase().includes(q) ||
            opt.nameAr?.includes(q) ||
            opt.barcodeUnit?.includes(q) ||
            opt.barcodeCase?.includes(q) ||
            opt.etaBarcode?.toLowerCase().includes(q)
        );

      const matchLine = lineFilter === 'all' || p.productionLine === lineFilter;
      const matchType = typeFilter === 'all' || p.productType === typeFilter;
      const matchBrand = brandFilter === 'all' || p.brandOwnership === brandFilter;
      const matchBonus =
        bonusFilter === 'all' ||
        (bonusFilter === 'bonus_eligible' && p.isBonusEligible) ||
        (bonusFilter === 'no_bonus' && !p.isBonusEligible);
      const matchStatus = statusFilter === 'all' || (p.status || 'active') === statusFilter;

      return matchSearch && matchLine && matchType && matchBrand && matchBonus && matchStatus;
    });
  }, [products, searchTerm, lineFilter, typeFilter, brandFilter, bonusFilter, statusFilter]);

  // Group Filtered Products by Categories (Ordered by Category sortOrder)
  const groupedProductsByCategory = useMemo(() => {
    const groups = [];

    categories.forEach((cat) => {
      const catProducts = filteredProducts.filter((p) => (p.productionLine || 'white_o') === cat.key || (p.productionLine || 'white_o') === cat.id);
      if (catProducts.length > 0 || lineFilter === cat.key || lineFilter === cat.id) {
        groups.push({
          category: cat,
          products: catProducts,
        });
      }
    });

    // Capture products with unmapped categories if any
    const mappedCategoryKeys = new Set(categories.map((c) => c.key || c.id));
    const unmappedProducts = filteredProducts.filter((p) => !mappedCategoryKeys.has(p.productionLine));
    if (unmappedProducts.length > 0) {
      groups.push({
        category: { id: 'unmapped', key: 'unmapped', sortOrder: 999, nameAr: 'أصناف غير مصنفة', nameEn: 'Unclassified Products' },
        products: unmappedProducts,
      });
    }

    return groups;
  }, [categories, filteredProducts, lineFilter]);

  const toggleProductExpand = (code) => {
    setExpandedProducts((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  return (
    <div className="space-y-5 select-none">
      {/* Full-Screen Loading Feedback */}
      {isSaving && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري حفظ وتحديث سجل المنتج التام وتوليد أذون الرصيد الافتتاحي...' : 'Saving Product & Posting Opening Balance...'}
        />
      )}

      {/* Top Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="p-2.5 border rounded-2xl shadow-2xs flex items-center justify-center shrink-0 transition-all duration-200"
            style={{
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
              borderColor: `rgba(${r}, ${g}, ${b}, 0.25)`,
              color: tabColor,
            }}
          >
            <TabConfigIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {isAr ? (tabConfig?.labelAr || 'سجل المنتجات التامة (Finished Products Master)') : (tabConfig?.labelEn || 'Finished Products Master List')}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'عرض مجمع ومبوب حسب خطوط الإنتاج والتصنيفات، مع الرصيد الافتتاحي والباركود' : 'Grouped by production lines, dual packaging, barcodes, and gross weights'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Discrete Category Manager Trigger Button (General Admin Only) */}
          {isGeneralAdmin && (
            <button
              type="button"
              onClick={() => {
                handleStartAddCategory();
                setShowCategoryModal(true);
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title={isAr ? 'إدارة تصنيفات وخطوط إنتاج المنتجات التامة وترتيبها' : 'Manage Product Categories & Ordering'}
            >
              <FolderCog className="h-4 w-4 text-slate-600" />
              <span className="hidden md:inline">{isAr ? 'إدارة التصنيفات' : 'Categories'}</span>
            </button>
          )}

          {canCreate ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'تعريف منتج تام جديد' : 'Add New Product'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
              <Lock className="h-3.5 w-3.5" />
              <span>{isAr ? 'وضع القراءة فقط' : 'Read-Only Mode'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Criteria Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
        <div className="relative lg:col-span-2">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={isAr ? 'بحث بالكود، الاسم، الباركود، العميل...' : 'Search code, name, barcode, client...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* 1. Dynamic Production Line Filter */}
        <div>
          <select
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">{isAr ? `🏭 كافة خطوط الإنتاج (${categories.length})` : `All Production Lines (${categories.length})`}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.key || cat.id}>
                {isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Product Type Filter */}
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 cursor-pointer"
          >
            <option value="all">{isAr ? '📦 جميع الأنواع' : 'All Types'}</option>
            <option value="main">{isAr ? 'منتج رئيسي دائم' : 'Main Standard'}</option>
            <option value="promotional_bundle">{isAr ? 'عروض ترويجية / مؤقت' : 'Promotional Bundle'}</option>
          </select>
        </div>

        {/* 3. Brand Ownership Filter */}
        <div>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 cursor-pointer"
          >
            <option value="all">{isAr ? '🏷️ ملكية العلامة' : 'Brand Ownership'}</option>
            <option value="own_brand">{isAr ? 'علامة الشركة (الطاووس)' : 'Own Brand'}</option>
            <option value="private_label">{isAr ? 'تشغيل للغير (Private Label)' : 'Private Label'}</option>
          </select>
        </div>

        {/* 4. Bonus Eligibility Filter */}
        <div>
          <select
            value={bonusFilter}
            onChange={(e) => setBonusFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 cursor-pointer"
          >
            <option value="all">{isAr ? '🎁 موقف البونص' : 'Bonus Eligibility'}</option>
            <option value="bonus_eligible">{isAr ? 'متاح لعروض البونص' : 'Bonus Eligible'}</option>
            <option value="no_bonus">{isAr ? 'بدون بونص' : 'No Bonus'}</option>
          </select>
        </div>
      </div>

      {/* Main Table: Grouped by Categories (Sorted by Category sortOrder) */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[360px]">
        {loading ? (
          <div className="p-16 text-center">
            <PeacockLoader size="lg" text={isAr ? 'جاري تحميل المنتجات التامة وتبويبها...' : 'Loading Finished Products...'} />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            {isAr ? 'لا توجد منتجات تامة مطابقة للفلاتر المحددة.' : 'No finished products match the selected criteria.'}
          </div>
        ) : (
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 text-center w-10"></th>
                <th className="p-3 text-start">{isAr ? 'كود المنتج واسم الصنف' : 'Product Code & Name'}</th>
                <th className="p-3 text-start">{isAr ? 'التصنيف الصناعي وخط الإنتاج' : 'Line & Ownership'}</th>
                <th className="p-3 text-start">{isAr ? 'وحدات التعبئة والشدة' : 'Packaging & Ratio'}</th>
                <th className="p-3 text-center">{isAr ? 'مدة الصلاحية' : 'Shelf Life'}</th>
                <th className="p-3 text-start">{isAr ? 'خيارات وتصميمات العبوة' : 'Packaging Options'}</th>
                <th className="p-3 text-center">{isAr ? 'الرصيد الفعلي' : 'Live Stock'}</th>
                <th className="p-3 text-center">{isAr ? 'البونص' : 'Bonus'}</th>
                <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                {(canEdit || canDelete) && <th className="p-3 text-center">{isAr ? 'إجراء' : 'Actions'}</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {groupedProductsByCategory.map((group) => {
                const cat = group.category;
                const catProducts = group.products;

                return (
                  <React.Fragment key={cat.id}>
                    {/* CATEGORY SECTION HEADER ROW */}
                    <tr className="bg-slate-100/90 border-t-2 border-b border-slate-200">
                      <td colSpan={10} className="p-2.5 ps-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded-md">
                              #{cat.sortOrder || 1}
                            </span>
                            <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                              <Layers className="h-3.5 w-3.5 text-blue-600" />
                              <span>{isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)}</span>
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 font-semibold">
                              ({catProducts.length} {isAr ? 'أصناف مسجلة' : 'Products'})
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Products belonging to this category */}
                    {catProducts.map((product) => {
                      const isExpanded = Boolean(expandedProducts[product.code]);
                      const hasOptions = Array.isArray(product.packagingOptions) && product.packagingOptions.length > 0;
                      const currentStock = liveStockMap[product.code] || 0;

                      return (
                        <React.Fragment key={product.code}>
                          <tr className={`transition ${isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'}`}>
                            <td className="p-3 text-center">
                              {hasOptions && (
                                <button
                                  type="button"
                                  onClick={() => toggleProductExpand(product.code)}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded-md transition cursor-pointer"
                                  title={isAr ? 'عرض خيارات التعبئة والباركود' : 'Expand packaging options'}
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4 text-blue-600" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                                </button>
                              )}
                            </td>

                            {/* Code, Thumbnail & Names */}
                            <td className="p-3 align-top">
                              <div className="flex items-center gap-2.5">
                                {product.imageFile ? (
                                  <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/90 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden group/img">
                                    <img
                                      src={product.imageFile}
                                      alt={product.code}
                                      onClick={() => setImagePreviewModal({
                                        url: product.imageFile,
                                        title: isAr ? product.nameAr : (product.nameEn || product.nameAr),
                                        subtitle: `${product.code} ${product.shortName ? `(${product.shortName})` : ''}`
                                      })}
                                      className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                      title={isAr ? 'انقر لعرض الصورة بالحجم الكامل' : 'Click to preview full image'}
                                    />
                                  </div>
                                ) : (
                                  <div className="w-11 h-11 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
                                    <Package className="h-5 w-5" />
                                  </div>
                                )}

                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs font-extrabold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                                      {product.code}
                                    </span>
                                    {product.shortName && (
                                      <span className="text-[10px] text-slate-400 font-medium">({product.shortName})</span>
                                    )}
                                  </div>
                                  <span className="font-bold text-slate-900 block mt-1">{product.nameAr}</span>
                                  {product.nameEn && <span className="text-[10px] text-slate-400 block">{product.nameEn}</span>}
                                </div>
                              </div>
                            </td>

                            {/* 3-Way Categorization */}
                            <td className="p-3 align-top space-y-1">
                              <div>{getLineBadge(product.productionLine)}</div>
                              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                                {product.productType === 'promotional_bundle' ? (
                                  <span className="px-1.5 py-0.2 bg-purple-50 text-purple-800 border border-purple-200 rounded font-bold">
                                    {isAr ? 'عروض ترويجية' : 'Promo Bundle'}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded font-medium">
                                    {isAr ? 'منتج رئيسي' : 'Standard'}
                                  </span>
                                )}

                                {product.brandOwnership === 'private_label' ? (
                                  <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded font-bold" title={product.clientName}>
                                    {isAr ? `تشغيل للغير: ${product.clientName || 'عميل'}` : `Private Label: ${product.clientName}`}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-semibold">
                                    {isAr ? 'علامة الطاووس' : 'Own Brand'}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Units & Ratio */}
                            <td className="p-3 align-top text-xs text-slate-700">
                              <div className="font-semibold">{product.smallUnit} / {product.largeUnitName}</div>
                              <div className="text-[10px] text-emerald-800 font-bold mt-0.5">
                                1 {product.largeUnitName} = {product.packagingRatio} {product.smallUnit}
                              </div>
                            </td>

                            {/* Shelf Life Months */}
                            <td className="p-3 align-top text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold text-xs">
                                <Clock className="h-3 w-3 text-indigo-600" />
                                <span>{product.shelfLifeMonths || 24} {isAr ? 'شهر' : 'mos'}</span>
                              </span>
                            </td>

                            {/* Packaging Options Badge */}
                            <td className="p-3 align-top">
                              {hasOptions ? (
                                <button
                                  type="button"
                                  onClick={() => toggleProductExpand(product.code)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[11px] font-bold transition cursor-pointer"
                                >
                                  <Barcode className="h-3 w-3 text-indigo-600" />
                                  <span>{product.packagingOptions.length} {isAr ? 'خيارات وتصميمات' : 'Options'}</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">{isAr ? 'خيار واحد افتراضي' : 'Single Option'}</span>
                              )}
                            </td>

                            {/* Live Stock Balance */}
                            <td className="p-3 align-top text-center font-mono font-bold text-slate-900">
                              <div>{currentStock.toLocaleString()} {product.smallUnit}</div>
                              {product.packagingRatio > 1 && (
                                <span className="text-[10px] text-slate-400 block font-normal">
                                  ({(currentStock / product.packagingRatio).toFixed(1)} {product.largeUnitName})
                                </span>
                              )}
                            </td>

                            {/* Bonus Eligibility Flag */}
                            <td className="p-3 align-top text-center">
                              {product.isBonusEligible ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                  <Gift className="h-3 w-3 text-emerald-600" />
                                  <span>{isAr ? 'يقبل بونص' : 'Bonus OK'}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">
                                  {isAr ? 'بدون بونص' : 'No Bonus'}
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="p-3 align-top">
                              {product.status === 'inactive' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                                  <Ban className="h-3 w-3 text-slate-400" />
                                  <span>{isAr ? 'معطل' : 'Inactive'}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  <span>{isAr ? 'نشط' : 'Active'}</span>
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            {(canEdit || canDelete) && (
                              <td className="p-3 align-top text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEdit(product)}
                                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                      title={isAr ? 'تعديل بيانات المنتج' : 'Edit Product'}
                                    >
                                      <Edit3 className="h-4 w-4" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProduct(product.code, product.nameAr)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                      title={isAr ? 'حذف المنتج' : 'Delete Product'}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>

                          {/* Nested Packaging Options Sub-Grid */}
                          {isExpanded && hasOptions && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={10} className="p-3 ps-12 pe-6">
                                <div className="bg-white border border-blue-200 rounded-xl p-3 shadow-2xs space-y-2">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                    <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                                      <Barcode className="h-4 w-4 text-blue-600" />
                                      <span>{isAr ? `خيارات وتصميمات العبوة والباركود لـ (${product.nameAr}):` : `Packaging Options & Barcodes for (${product.nameEn || product.nameAr}):`}</span>
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400">Master SKU: {product.code}</span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                                    {product.packagingOptions.map((opt, optIdx) => (
                                      <div key={optIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                                        <div className="flex justify-between items-start">
                                          <div className="flex items-center gap-2">
                                      {opt.imageFile ? (
                                        <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                                          <img
                                            src={opt.imageFile}
                                            alt={opt.optionCode}
                                            onClick={() => setImagePreviewModal({
                                              url: opt.imageFile,
                                              title: `${isAr ? product.nameAr : (product.nameEn || product.nameAr)} - ${opt.nameAr}`,
                                              subtitle: opt.optionCode
                                            })}
                                            className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                            title={isAr ? 'انقر لمعاينة صورة العبوة' : 'Click to preview variant image'}
                                          />
                                        </div>
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg bg-slate-200/60 border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                                          <Package className="h-5 w-5" />
                                        </div>
                                      )}
                                            <div>
                                              <span className="font-mono font-bold text-slate-900 bg-white border border-slate-300 px-2 py-0.5 rounded text-xs">
                                                {opt.optionCode}
                                              </span>
                                              <div className="font-semibold text-slate-800 text-[11px] mt-0.5">{opt.nameAr}</div>
                                            </div>
                                          </div>

                                          <div className="text-end">
                                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 block">
                                              {isAr ? 'الشدة:' : 'Pack:'} {opt.packagingRatio || product.packagingRatio} {product.smallUnit}
                                            </span>
                                            {opt.largeUnitWeightKg > 0 && (
                                              <span className="text-[10px] font-mono font-bold text-slate-600 block mt-0.5">
                                                {opt.largeUnitWeightKg} kg / {product.largeUnitName}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-200 text-[11px]">
                                          <div>
                                            <span className="text-slate-400 block text-[10px]">{isAr ? 'باركود العبوة الصغرى:' : 'Unit Barcode:'}</span>
                                            <span className="font-mono font-bold text-indigo-700">{opt.barcodeUnit || '—'}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 block text-[10px]">{isAr ? 'باركود الكرتونة الكبرى:' : 'Case Barcode:'}</span>
                                            <span className="font-mono font-bold text-slate-800">{opt.barcodeCase || '—'}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 block text-[10px]">{isAr ? 'كود الفاتورة الإلكترونية (ETA):' : 'ETA Code:'}</span>
                                            <span className="font-mono font-bold text-emerald-700">{opt.etaBarcode || '—'}</span>
                                          </div>
                                        </div>
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
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* DYNAMIC CATEGORY MANAGEMENT MODAL (GENERAL ADMIN ONLY) */}
      {showCategoryModal && isGeneralAdmin && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-100 text-slate-800 rounded-xl">
                  <FolderCog className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {isAr ? 'إدارة تصنيفات وخطوط إنتاج المنتجات التامة' : 'Finished Product Categories Management'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'تعديل أسماء خطوط الإنتاج والترتيب الرقمي لتنظيم جدول الأصناف التامة' : 'Manage category names and sequence sorting in products grid'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Categories Table with Sorting Order */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs max-h-64 overflow-y-auto text-xs">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-2.5 text-center w-16">{isAr ? 'الترتيب' : 'Order'}</th>
                    <th className="p-2.5 text-start">{isAr ? 'اسم التصنيف (عربي)' : 'Name (Ar)'}</th>
                    <th className="p-2.5 text-start">{isAr ? 'اسم التصنيف (إنجليزي)' : 'Name (En)'}</th>
                    <th className="p-2.5 text-start font-mono">{isAr ? 'المعرف' : 'Key'}</th>
                    <th className="p-2.5 text-center w-20">{isAr ? 'إجراء' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-2.5 text-center font-mono font-extrabold text-blue-700 bg-blue-50/40">
                        #{cat.sortOrder || 1}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900">{cat.nameAr}</td>
                      <td className="p-2.5 text-slate-500">{cat.nameEn || '—'}</td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-600">{cat.key || cat.id}</td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditCategory(cat)}
                            className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition cursor-pointer"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                            title={isAr ? 'حذف' : 'Delete'}
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

            {/* Category Add/Edit Form */}
            <form onSubmit={handleSaveCategory} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-bold text-slate-800">
                  {editingCatId 
                    ? (isAr ? `تعديل التصنيف (${catFormData.nameAr || editingCatId})` : `Edit Category (${editingCatId})`) 
                    : (isAr ? 'إضافة تصنيف جديد' : 'Add New Category')}
                </span>
                {editingCatId && (
                  <button
                    type="button"
                    onClick={handleStartAddCategory}
                    className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    {isAr ? '+ إنشاء تصنيف جديد بدلاً من ذلك' : '+ Create new instead'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    {isAr ? 'الترتيب الرقمي (Sort) *' : 'Sort Order *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={catFormData.sortOrder}
                    onChange={(e) => setCatFormData({ ...catFormData, sortOrder: Number(e.target.value) })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-blue-700 text-center"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    {isAr ? 'معرف الكود (Key / ID) *' : 'Category Key *'}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingCatId)}
                    placeholder="e.g. vinegar_apple"
                    value={catFormData.key}
                    onChange={(e) => setCatFormData({ ...catFormData, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 disabled:bg-slate-100"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    {isAr ? 'اسم التصنيف بالعربية *' : 'Arabic Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={catFormData.nameAr}
                    onChange={(e) => setCatFormData({ ...catFormData, nameAr: e.target.value })}
                    placeholder={isAr ? 'مثال: خل تفاح طبيعي' : 'e.g. Apple Vinegar'}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  {isAr ? 'اسم التصنيف بالإنجليزية (اختياري)' : 'English Name (Optional)'}
                </label>
                <input
                  type="text"
                  value={catFormData.nameEn}
                  onChange={(e) => setCatFormData({ ...catFormData, nameEn: e.target.value })}
                  placeholder="e.g. Natural Apple Vinegar"
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingCategory ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>{editingCatId ? (isAr ? 'حفظ تعديل التصنيف' : 'Update Category') : (isAr ? 'إضافة وحفظ التصنيف' : 'Save Category')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE & EDIT PRODUCT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-4 my-6">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {editingProductCode
                      ? (isAr ? `تعديل بيانات المنتج التام (${editingProductCode})` : `Edit Finished Product (${editingProductCode})`)
                      : (isAr ? 'تعريف وتكويد منتج تام جديد' : 'Define New Finished Product')}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {isAr ? 'التصنيفات الثلاثية، وحدات التعبئة، والرصيد الافتتاحي وتواريخ الصلاحية' : '3-way categorization, dual packaging, opening stock & shelf life'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-md">
                  {formData.code}
                </span>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              {/* SECTION 1: 3-WAY CATEGORIZATION */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>{isAr ? '١- التصنيف الثلاثي للصنف (3-Way Categorization):' : '1. Product Classification:'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Dynamic Category Selector */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'خط الإنتاج والتصنيف الصناعي *' : 'Production Line *'}
                    </label>
                    <select
                      value={formData.productionLine}
                      onChange={(e) => setFormData({ ...formData, productionLine: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.key || cat.id}>
                          {isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)} (#{cat.sortOrder || 1})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Product Type */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'طبيعة المنتج *' : 'Product Type *'}
                    </label>
                    <select
                      value={formData.productType}
                      onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="main">{isAr ? 'منتج رئيسي دائم (Main / Standard)' : 'Main Standard'}</option>
                      <option value="promotional_bundle">{isAr ? 'منتج مؤقت / عروض ترويجية (Promo Bundle)' : 'Promotional Bundle'}</option>
                    </select>
                  </div>

                  {/* 3. Brand Ownership */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'ملكية العلامة التجارية *' : 'Brand Ownership *'}
                    </label>
                    <select
                      value={formData.brandOwnership}
                      onChange={(e) => setFormData({ ...formData, brandOwnership: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="own_brand">{isAr ? 'علامة الشركة (الطاووس)' : 'Own Brand (Al-Tawoos)'}</option>
                      <option value="private_label">{isAr ? 'تشغيل للغير / علامة خاصة (Private Label)' : 'Private Label'}</option>
                    </select>
                  </div>
                </div>

                {formData.brandOwnership === 'private_label' && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block font-bold text-indigo-950 mb-1">
                      {isAr ? 'اسم العميل صاحب العلامة الخاصة (Client Name) *' : 'Client Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'مثال: شركة كارفور مصر للتجارة' : 'e.g. Carrefour Egypt'}
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                      className="w-full p-2 border border-indigo-300 rounded-xl bg-white font-semibold text-slate-900"
                    />
                  </div>
                )}
              </div>

              {/* SECTION 2: PRODUCT IDENTITY, SHELF LIFE & PACKAGING UNITS */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-blue-600" />
                  <span>{isAr ? '٢- بيانات التسمية، الصلاحية، ووحدات القياس:' : '2. Nomenclature, Shelf Life & Packaging:'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم المنتج التام (عربي) *' : 'Arabic Name *'}</label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'مثال: خل أبيض 1 لتر اقتصادي' : 'e.g. White Vinegar 1L'}
                      value={formData.nameAr}
                      onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم المنتج (إنجليزي)' : 'English Name'}</label>
                    <input
                      type="text"
                      placeholder="e.g. White Vinegar 1L - Eco"
                      value={formData.nameEn}
                      onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الاسم المختصر (Short Name)' : 'Short Convention'}</label>
                    <input
                      type="text"
                      placeholder={isAr ? 'مثال: خل 1ل O' : 'e.g. Vinegar 1L O'}
                      value={formData.shortName}
                      onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-bold text-indigo-950 mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-indigo-600" />
                      <span>{isAr ? 'مدة الصلاحية القياسية *' : 'Standard Shelf Life *'}</span>
                    </label>
                    <select
                      value={formData.shelfLifeMonths}
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setFormData({
                          ...formData,
                          shelfLifeMonths: m,
                          packagingOptions: formData.packagingOptions.map((opt) => ({
                            ...opt,
                            openingExpDate: opt.openingProdDate ? calculateExpiryDate(opt.openingProdDate, m) : opt.openingExpDate,
                          }))
                        });
                      }}
                      className="w-full p-2 border border-indigo-300 rounded-xl bg-white font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                    >
                      {Array.from({ length: 36 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {m} {isAr ? (m === 1 ? 'شهر واحد' : m === 2 ? 'شهران' : m <= 10 ? 'أشهر' : 'شهراً') : 'Month(s)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الوحدة الصغرى (المعاملات والتعبئة) *' : 'Small Unit *'}</label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'زجاجة / عبوة / برطمان' : 'Bottle / Jar'}
                      value={formData.smallUnit}
                      onChange={(e) => setFormData({ ...formData, smallUnit: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الوحدة الكبرى (الشحن والتوزيع) *' : 'Large Unit *'}</label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'كرتونة / شيرنك' : 'Carton / Shrink'}
                      value={formData.largeUnitName}
                      onChange={(e) => setFormData({ ...formData, largeUnitName: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-extrabold text-blue-950 mb-1">{isAr ? 'معدل الشدة الافتراضي *' : 'Pack Ratio *'}</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={formData.packagingRatio}
                      onChange={(e) => setFormData({ ...formData, packagingRatio: Number(e.target.value) })}
                      className="w-full p-2 border-2 border-blue-400 rounded-xl bg-white font-mono font-extrabold text-center text-sm"
                    />
                  </div>
                </div>

                {/* Master Product Image Upload */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-2">
                    {formData.imageFile ? (
                      <img
                        src={formData.imageFile}
                        alt="Product Preview"
                        onClick={() => window.open(formData.imageFile, '_blank')}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs cursor-pointer hover:opacity-80 transition"
                        title={isAr ? 'انقر للمعاينة' : 'Preview Image'}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div>
                      <span className="font-bold text-slate-800 block text-xs">
                        {isAr ? 'الصورة الرئيسية للمنتج التام (اختياري):' : 'Master Product Image (Optional):'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formData.imageFile ? (isAr ? 'تم إرفاق الصورة' : 'Image Attached') : (isAr ? 'JPG / PNG' : 'JPG / PNG')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {formData.imageFile ? (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, imageFile: '' })}
                        className="px-3 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        {isAr ? 'إزالة الصورة' : 'Remove'}
                      </button>
                    ) : (
                      <label className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>{isAr ? 'رفع صورة المنتج' : 'Upload Image'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const compressed = await compressImage(file);
                              setFormData((prev) => ({ ...prev, imageFile: compressed }));
                            } catch (err) {
                              console.error('Error compressing product image:', err);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 3: TAXATION & BONUS PARAMETERS */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '٣- الضريبة وموقف البونص وحالة الصنف:' : '3. Tax, Bonus & Active Status:'}</span>
                  </h4>

                  <label className="flex items-center gap-2 text-xs font-bold text-emerald-950 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 cursor-pointer">
                    <Gift className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? 'يقبل بونص وكميات مجانية' : 'Bonus Eligible'}</span>
                    <input
                      type="checkbox"
                      checked={formData.isBonusEligible}
                      onChange={(e) => setFormData({ ...formData, isBonusEligible: e.target.checked })}
                      className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'فئة ضريبة القيمة المضافة *' : 'VAT Rate *'}</label>
                    <select
                      value={formData.vatRate}
                      onChange={(e) => setFormData({ ...formData, vatRate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold"
                    >
                      <option value="14%">14% (خاضع للضريبة)</option>
                      <option value="0%">0% (معفى من الضريبة)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'حد الأمان وإعادة التصنيع (عبوات)' : 'Safety Stock Level'}</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="500"
                      value={formData.reorderLevel}
                      onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'حالة تفعيل الصنف *' : 'Product Status *'}</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className={`w-full p-2 border rounded-xl font-bold ${
                        formData.status === 'active'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      <option value="active">{isAr ? '🟢 نشط ومتاح للإنتاج والمبيعات' : 'Active'}</option>
                      <option value="inactive">{isAr ? '🔴 معطل وموقوف (يشترط رصيد صفر)' : 'Inactive (Requires Stock = 0)'}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 4: PACKAGING OPTIONS, ARTWORK, BARCODES, WEIGHTS & OPENING STOCK */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Barcode className="h-4 w-4 text-indigo-600" />
                      <span>{isAr ? '٤- خيارات التعبئة، الباركود، والأرصدة الافتتاحية:' : '4. Packaging Options, Barcodes & Opening Stock:'}</span>
                    </h4>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {isAr ? 'الباركود إلزامي للعبوة الأساسية (A)، وتتوارث الخيارات الإضافية الباركود والأوزان تلقائياً' : 'Unit barcode required on Option A; sub-options inherit barcodes and gross weight'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddPackagingOption}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إضافة تصميم / خيار تعبئة' : 'Add Option'}</span>
                  </button>
                </div>

                <div className="space-y-3.5 max-h-80 overflow-y-auto pe-1">
                  {formData.packagingOptions.map((opt, optIdx) => {
                    const isOptionA = optIdx === 0;

                    return (
                      <div key={optIdx} className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 shadow-2xs">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                              {formData.code || 'FG'}-{opt.suffix || String.fromCharCode(65 + optIdx)}
                            </span>
                            {isOptionA && (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                {isAr ? 'العبوة القياسية الأساسية (Option A)' : 'Standard Primary Option (A)'}
                              </span>
                            )}
                          </div>

                          {!isOptionA && (
                            <button
                              type="button"
                              onClick={() => handleRemovePackagingOption(optIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title={isAr ? 'إزالة هذا الخيار' : 'Remove Option'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        {/* Top row: Name, Unit Barcode, Case Barcode */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{isAr ? 'اسم التصميم / الخيار: *' : 'Artwork Name: *'}</label>
                            <input
                              type="text"
                              required
                              placeholder={isAr ? 'مثال: تصميم استيكر 2026' : 'e.g. New Label 2026'}
                              value={opt.nameAr}
                              onChange={(e) => handlePackagingOptionChange(optIdx, 'nameAr', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-semibold"
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                              {isOptionA
                                ? (isAr ? 'باركود العبوة الصغرى EAN-13 (إلزامي) *:' : 'Small Unit Barcode (Mandatory) *:')
                                : (isAr ? 'باركود العبوة الصغرى (متوارث):' : 'Small Unit Barcode (Inherited):')}
                            </label>
                            <input
                              type="text"
                              required={isOptionA}
                              placeholder="6224001234567"
                              value={opt.barcodeUnit}
                              onChange={(e) => handlePackagingOptionChange(optIdx, 'barcodeUnit', e.target.value)}
                              className={`w-full p-1.5 border rounded-lg font-mono font-bold text-xs ${
                                isOptionA && !opt.barcodeUnit
                                  ? 'border-amber-400 bg-amber-50/50 text-amber-900'
                                  : 'border-slate-300 bg-white text-indigo-700'
                              }`}
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{isAr ? 'باركود الكرتونة الكبرى ITF-14:' : 'Case Barcode (ITF-14):'}</label>
                            <input
                              type="text"
                              placeholder="16224001234564"
                              value={opt.barcodeCase}
                              onChange={(e) => handlePackagingOptionChange(optIdx, 'barcodeCase', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-xs bg-white text-slate-800"
                            />
                          </div>
                        </div>

                        {/* Middle row: ETA Code, Weight (KG), Packaging Ratio */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1 border-t border-slate-100">
                          <div className="sm:col-span-5">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              {isAr ? 'كود الفاتورة الإلكترونية (ETA Barcode Override):' : 'ETA Barcode Override:'}
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. EG-10002345-FG101"
                              value={opt.etaBarcode || ''}
                              onChange={(e) => handlePackagingOptionChange(optIdx, 'etaBarcode', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-emerald-800 font-bold text-xs bg-white"
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              {isAr ? 'وزن الوحدة الكبرى الإجمالي (كجم / كرتونة):' : 'Large Unit Gross Weight (KG):'}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="12.80"
                              value={opt.largeUnitWeightKg !== undefined ? opt.largeUnitWeightKg : ''}
                              onChange={(e) => handlePackagingOptionChange(optIdx, 'largeUnitWeightKg', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-xs bg-white text-center"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{isAr ? 'الشدة المخصصة:' : 'Option Pack Ratio:'}</label>
                            <input
                              type="number"
                              min="1"
                              value={opt.packagingRatio}
                              onChange={(e) => handlePackagingOptionChange(optIdx, 'packagingRatio', Number(e.target.value))}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-center text-xs bg-white"
                            />
                          </div>
                        </div>

                        {/* OPENING STOCK (OB) CAPTURE CARD PER OPTION */}
                        <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2 text-xs">
                          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1">
                            <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                              <Boxes className="h-3.5 w-3.5 text-emerald-700" />
                              <span>{isAr ? 'تسجيل رصيد افتتاحي أولي (Opening Stock - اختياري):' : 'Initial Opening Stock (Optional):'}</span>
                            </span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-white px-2 py-0.2 rounded border border-emerald-200 font-mono">
                              OB FG Auto-Ingest
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                {isAr ? 'مستودع الاستلام:' : 'Target Warehouse:'}
                              </label>
                              <select
                                value={opt.openingWarehouse || ''}
                                onChange={(e) => handlePackagingOptionChange(optIdx, 'openingWarehouse', e.target.value)}
                                className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-bold text-slate-900 text-xs"
                              >
                                {warehousesList.map((wh) => (
                                  <option key={wh.id || wh.code} value={wh.id || wh.code}>
                                    {wh.code ? `${wh.code} - ` : ''}{isAr ? wh.nameAr : wh.nameEn || wh.nameAr}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                {isAr ? `الكمية بالوحدة الصغرى (${formData.smallUnit}):` : `Qty (${formData.smallUnit}):`}
                              </label>
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={opt.openingQtySmall || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                  const ratio = Number(opt.packagingRatio || formData.packagingRatio || 1);
                                  const updated = [...formData.packagingOptions];
                                  updated[optIdx].openingQtySmall = val;
                                  updated[optIdx].openingQtyLarge = val === '' ? '' : Number((val / ratio).toFixed(2));
                                  setFormData({ ...formData, packagingOptions: updated });
                                }}
                                className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900 text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                {isAr ? `الكمية بالوحدة الكبرى (${formData.largeUnitName}):` : `Large Qty:`}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0"
                                value={opt.openingQtyLarge || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                  const ratio = Number(opt.packagingRatio || formData.packagingRatio || 1);
                                  const updated = [...formData.packagingOptions];
                                  updated[optIdx].openingQtyLarge = val;
                                  updated[optIdx].openingQtySmall = val === '' ? '' : Math.round(val * ratio);
                                  setFormData({ ...formData, packagingOptions: updated });
                                }}
                                className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900 text-xs"
                              />
                            </div>
                          </div>

                          {/* Batch & Auto-Populated Expiry Date */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-emerald-100">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                                {isAr ? 'رقم التشغيلة / اللوط (اختياري):' : 'Batch / Lot # (Optional):'}
                              </label>
                              <input
                                type="text"
                                placeholder="LOT-INIT-01"
                                value={opt.openingBatchNo || ''}
                                onChange={(e) => handlePackagingOptionChange(optIdx, 'openingBatchNo', e.target.value)}
                                className="w-full p-1 border border-slate-200 rounded bg-white text-xs font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                                {isAr ? 'تاريخ الإنتاج:' : 'Production Date:'}
                              </label>
                              <input
                                type="date"
                                value={opt.openingProdDate || ''}
                                onChange={(e) => handlePackagingOptionChange(optIdx, 'openingProdDate', e.target.value)}
                                className="w-full p-1 border border-slate-200 rounded bg-white text-xs font-mono font-bold"
                              />
                            </div>

                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 mb-0.5 flex items-center justify-between">
                                <span>{isAr ? 'تاريخ الصلاحية (تلقائي):' : 'Expiry Date (Auto):'}</span>
                                {opt.openingExpDate && (
                                  <span className="text-[8px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">
                                    +{formData.shelfLifeMonths}m
                                  </span>
                                )}
                              </label>
                              <input
                                type="date"
                                value={opt.openingExpDate || ''}
                                onChange={(e) => handlePackagingOptionChange(optIdx, 'openingExpDate', e.target.value)}
                                className="w-full p-1 border border-emerald-300 rounded bg-emerald-50 text-xs font-mono font-bold text-emerald-950"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Variant Image Upload */}
                        <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200 mt-2">
                          <div className="flex items-center gap-2">
                            {opt.imageFile ? (
                              <div className="w-10 h-10 rounded-xl bg-white border border-slate-300 shadow-2xs flex items-center justify-center p-0.5 overflow-hidden shrink-0">
                                <img
                                  src={opt.imageFile}
                                  alt="Variant Preview"
                                  onClick={() => setImagePreviewModal({
                                    url: opt.imageFile,
                                    title: `${formData.nameAr || ''} - ${opt.nameAr || ''}`,
                                    subtitle: `${formData.code || 'FG'}-${opt.suffix || ''}`
                                  })}
                                  className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                  title={isAr ? 'معاينة' : 'Preview'}
                                />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                            <span className="text-[11px] font-semibold text-slate-700">
                              {isAr ? 'صورة التصميم / الاستيكر لهذا الخيار (اختياري):' : 'Variant Image / Artwork (Optional):'}
                            </span>
                          </div>

                          {opt.imageFile ? (
                            <button
                              type="button"
                              onClick={() => handlePackagingOptionChange(optIdx, 'imageFile', '')}
                              className="text-xs text-rose-600 hover:underline font-bold"
                            >
                              {isAr ? 'إزالة' : 'Remove'}
                            </button>
                          ) : (
                            <label className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs">
                              <span>{isAr ? 'رفع صورة' : 'Upload'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  try {
                                    const compressed = await compressImage(file);
                                    handlePackagingOptionChange(optIdx, 'imageFile', compressed);
                                  } catch (err) {
                                    console.error('Error compressing variant image:', err);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{editingProductCode ? (isAr ? 'حفظ التعديلات' : 'Update Product') : (isAr ? 'حفظ وتكويد المنتج' : 'Save Product')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Resolution In-App Image Preview Lightbox / Popover */}
      {imagePreviewModal && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-150"
          onClick={() => setImagePreviewModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-5 shadow-2xl border border-slate-200 space-y-3 relative flex flex-col items-center max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center w-full border-b border-slate-100 pb-2.5">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">{imagePreviewModal.title}</h4>
                {imagePreviewModal.subtitle && (
                  <span className="text-[11px] font-mono text-blue-700 font-bold block mt-0.5">
                    {imagePreviewModal.subtitle}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImagePreviewModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Large Image Canvas */}
            <div className="w-full flex-1 flex items-center justify-center bg-slate-50/80 rounded-2xl border border-slate-200/80 p-3 overflow-hidden min-h-[320px] max-h-[65vh]">
              <img
                src={imagePreviewModal.url}
                alt={imagePreviewModal.title || 'Preview'}
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-sm"
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end w-full pt-1">
              <button
                type="button"
                onClick={() => setImagePreviewModal(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
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