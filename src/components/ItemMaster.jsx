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
import SearchableSelect from './SearchableSelect';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  AlertCircle,
  Edit3, 
  Trash2, 
  PlusCircle, 
  SlidersHorizontal,
  Lock,
  Layers,
  FileText,
  Scale,
  Receipt,
  XCircle,
  Building2,
  Factory,
  Package,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Ban,
  Boxes,
  Copy,
  X,
  FolderCog,
  Settings2,
  Sparkles,
  UploadCloud,
  Eye
} from 'lucide-react';

export default function ItemMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // Dynamic Authority Resolvers from Admin Permissions (Tab-Scoped)
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['items.canCreate'] !== undefined
      ? permissions.actions['items.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );
  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['items.canEdit'] !== undefined
      ? permissions.actions['items.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );
  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['items.canDelete'] !== undefined
      ? permissions.actions['items.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

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

  // Initial fallback seeds (loaded once to Firestore if categories collection is empty)
  const DEFAULT_CATEGORIES = [
    { id: 1, base: 100, nameAr: '١- عبوات بلاستيكية', nameEn: '1- Primary Containers (Plastic)' },
    { id: 2, base: 200, nameAr: '٢- أغطية للعبوات البلاستيكية', nameEn: '2- Container Closures & Caps' },
    { id: 3, base: 300, nameAr: '٣- خامات أساسية (خل، طحينة...)', nameEn: '3- Raw Food Ingredients' },
    { id: 4, base: 400, nameAr: '٤- استيكر ومستلزمات تغليف', nameEn: '4- Labels & Branding' },
    { id: 5, base: 500, nameAr: '٥- كرتون', nameEn: '5- Outer Cartons & Boxes' },
    { id: 6, base: 600, nameAr: '٦- مواد تغليف خارجية', nameEn: '6- Secondary Bundling & Films' },
    { id: 7, base: 700, nameAr: '٧- مستهلكات النقل والتخزين', nameEn: '7- Logistics & Palletizing' },
    { id: 8, base: 800, nameAr: '٨- مستلزمات تشغيل (حبر، فلاتر)', nameEn: '8- Line Consumables' },
    { id: 9, base: 900, nameAr: '٩- قطع غيار واسطمبات', nameEn: '9- Spare Parts & Fixed Assets' },
  ];

  // Real-time Cloud State
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [items, setItems] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [warehousesList, setWarehousesList] = useState([]);
  const [goodsReceiptsList, setGoodsReceiptsList] = useState([]);
  const [transfersList, setTransfersList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Category Management Modal State (General Admin Only)
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [catFormData, setCatFormData] = useState({ id: '', base: '', nameAr: '', nameEn: '' });
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [expandedItems, setExpandedItems] = useState({}); // { 'F-101': true }
  
  const [showModal, setShowModal] = useState(false);
  const [editingItemCode, setEditingItemCode] = useState(null);
  const [imagePreviewModal, setImagePreviewModal] = useState(null); // { url, title, subtitle }

  // Wizard Modal Step (Step 1: Master & Specs | Step 2: Variations & Vendors)
  const [modalStep, setModalStep] = useState(1);
  const [activeItemCode, setActiveItemCode] = useState(null);

  // Form State - Parent Level (Clean Placeholders, No Hardcoded Text)
  const [selectedCatId, setSelectedCatId] = useState(1);
  const [flags, setFlags] = useState({ R: false, M: false, F: true, X: false });
  const [formData, setFormData] = useState({
    nameAr: '',
    nameEn: '',
    shortName: '',
    smallUnit: '',
    largeUnitName: '',
    vatRate: '14%',
    whtRate: '1%',
    reorderLevel: '',
    status: 'active',
    isStocklessUtility: false,
    skipOrdinaryStockTransfer: false,
    rawMaterialSourceWh: '',
    needsQA: false,
  });

  // Master Technical Specs (Defined in Step 1)
  const [masterSpecs, setMasterSpecs] = useState([{ label: '', value: '' }]);

  // Form State - Child Variations List (Configured in Step 2)
  const [variations, setVariations] = useState([]);

  // Subscribe to live Firestore updates (Items, Suppliers, Warehouses, GRNs, Transfers, Categories)
  useEffect(() => {
    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snapshot) => {
        const cloudItems = snapshot.docs.map((docSnap) => ({
          ...docSnap.data(),
          code: docSnap.id
        }));
        setItems(cloudItems);
        setLoading(false);
      },
      (error) => {
        console.error('Firestore items subscription error:', error);
        setLoading(false);
      }
    );

    const unsubSuppliers = onSnapshot(
      collection(db, 'suppliers'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, name: d.data().name }));
        setSuppliersList(list);
      }
    );

    const unsubWarehouses = onSnapshot(
      collection(db, 'warehouses'),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .filter((w) => w.isActive !== false);
        list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
        setWarehousesList(list);
      }
    );

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceiptsList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    // Subscribe to dynamic categories and auto-seed on initial launch
    const unsubCategories = onSnapshot(collection(db, 'categories'), async (snapshot) => {
      if (snapshot.empty) {
        try {
          const batch = writeBatch(db);
          DEFAULT_CATEGORIES.forEach((cat) => {
            batch.set(doc(db, 'categories', String(cat.id)), {
              ...cat,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        } catch (err) {
          console.error('Error auto-seeding categories:', err);
        }
      } else {
        const list = snapshot.docs.map((d) => ({
          ...d.data(),
          id: Number(d.id) || d.data().id,
          base: Number(d.data().base) || (Number(d.id) * 100),
        }));
        list.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
        setCategories(list);
      }
    });

    return () => {
      unsubItems();
      unsubSuppliers();
      unsubWarehouses();
      unsubCategories();
      unsubGrns();
      unsubTransfers();
    };
  }, []);

  // Category Memory: Auto-suggest spec labels
  const rememberedSpecLabels = useMemo(() => {
    const labels = new Set();
    if (selectedCatId === 1) ['الجراماج (الوزن)', 'السعة الإجمالية', 'مقاس العنق', 'نوع الخامة', 'اللون'].forEach((l) => labels.add(l));
    if (selectedCatId === 2) ['مقاس القلاووظ', 'نوع البطانة', 'اللون', 'مانع تسريب'].forEach((l) => labels.add(l));
    if (selectedCatId === 3) ['نسبة التركيز', 'الرقم الهيدروجيني pH', 'اللزوجة', 'الكثافة', 'درجة النقاوة'].forEach((l) => labels.add(l));
    if (selectedCatId === 4) ['الأبعاد (ارتفاع×عرض)', 'كود التصميم Artwork', 'قطر الكور'].forEach((l) => labels.add(l));
    if (selectedCatId === 5) ['الأبعاد (طول×عرض×ارتفاع)', 'نوع الفلوت Flute', 'الجراماج GSM'].forEach((l) => labels.add(l));
    if (selectedCatId === 8) ['موديل الطابعة', 'نوع المذيب', 'حجم العبوة'].forEach((l) => labels.add(l));
    if (selectedCatId === 9) ['رقم القطعة Part No', 'الماكينة التابعة', 'عدد العيون'].forEach((l) => labels.add(l));

    items
      .filter((i) => i.categoryId === Number(selectedCatId))
      .forEach((item) => {
        if (Array.isArray(item.variations)) {
          item.variations.forEach((v) => {
            if (Array.isArray(v.specs)) {
              v.specs.forEach((s) => {
                if (s.label?.trim()) labels.add(s.label.trim());
              });
            }
          });
        }
      });

    return Array.from(labels);
  }, [items, selectedCatId]);

  // Sequential Number Generator for new parent items (Fully Dynamic)
  const getNextNumber = (catId) => {
    const targetCat = categories.find((c) => Number(c.id) === Number(catId));
    const base = targetCat ? Number(targetCat.base) : (Number(catId) * 100);
    const catItems = items.filter((item) => Number(item.categoryId) === Number(catId));
    if (catItems.length === 0) return base + 1;
    const maxNum = Math.max(...catItems.map((i) => Number(i.serialNum) || base));
    return maxNum + 1;
  };

  // Category Manager Handlers (General Admin Only)
  const handleStartAddCategory = () => {
    const nextId = categories.length > 0 ? Math.max(...categories.map((c) => Number(c.id) || 0)) + 1 : 1;
    setEditingCatId(null);
    setCatFormData({
      id: nextId,
      base: nextId * 100,
      nameAr: '',
      nameEn: '',
    });
  };

  const handleStartEditCategory = (cat) => {
    setEditingCatId(cat.id);
    setCatFormData({
      id: cat.id,
      base: cat.base,
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

    const catIdNum = Number(catFormData.id);
    const catBaseNum = Number(catFormData.base) || (catIdNum * 100);

    setIsSavingCategory(true);
    try {
      await setDoc(
        doc(db, 'categories', String(catIdNum)),
        {
          id: catIdNum,
          base: catBaseNum,
          nameAr: catFormData.nameAr.trim(),
          nameEn: catFormData.nameEn.trim() || catFormData.nameAr.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setEditingCatId(null);
      setCatFormData({ id: '', base: '', nameAr: '', nameEn: '' });
    } catch (err) {
      console.error('Error saving category:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التصنيف.' : 'Error saving category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!isGeneralAdmin) return;

    // Safety check: Prevent deletion if any items are linked to this category
    const linkedItems = items.filter((i) => Number(i.categoryId) === Number(catId));
    if (linkedItems.length > 0) {
      alert(
        isAr
          ? `لا يمكن حذف هذا التصنيف لأنه مرتبط بـ (${linkedItems.length}) خامة في قاعدة البيانات.`
          : `Cannot delete category. It is currently linked to (${linkedItems.length}) materials.`
      );
      return;
    }

    if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا التصنيف نهائياً؟' : 'Delete this category permanently?')) {
      try {
        await deleteDoc(doc(db, 'categories', String(catId)));
        if (editingCatId === catId) {
          setEditingCatId(null);
          setCatFormData({ id: '', base: '', nameAr: '', nameEn: '' });
        }
      } catch (err) {
        console.error('Error deleting category:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف التصنيف.' : 'Error deleting category.');
      }
    }
  };

  // SKU Prefix Generator
  const getPrefix = () => {
    if (flags.X) return 'X';
    const active = [];
    if (flags.F) active.push('F');
    if (flags.M) active.push('M');
    if (flags.R) active.push('R');
    return active.length > 0 ? active.join('') : 'F';
  };

  // Usage Flags Mutually Exclusive Logic
  const handleFlagToggle = (flagKey) => {
    setFlags((prev) => {
      if (flagKey === 'X') {
        const nextX = !prev.X;
        return { R: false, M: false, F: false, X: nextX };
      } else {
        const nextVal = !prev[flagKey];
        return { ...prev, [flagKey]: nextVal, X: false };
      }
    });
  };

  // Toggle Parent Item Expansion in Table
  const toggleItemExpand = (code) => {
    setExpandedItems((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  // Dynamic Parent Unit Handlers that sync down to child variations
  const handleParentSmallUnitChange = (newUnit) => {
    const oldUnit = formData.smallUnit;
    setFormData((prev) => ({ ...prev, smallUnit: newUnit }));
    setVariations((prevVars) =>
      prevVars.map((v) => {
        // If variation unit is empty or matches previous parent unit, sync with new parent unit
        if (!v.smallUnit || v.smallUnit === oldUnit || v.smallUnit === 'عبوة') {
          return { ...v, smallUnit: newUnit };
        }
        return v;
      })
    );
  };

  const handleParentLargeUnitChange = (newUnit) => {
    const oldUnit = formData.largeUnitName;
    setFormData((prev) => ({ ...prev, largeUnitName: newUnit }));
    setVariations((prevVars) =>
      prevVars.map((v) => {
        // If variation unit is empty or matches previous parent unit, sync with new parent unit
        if (!v.largeUnitName || v.largeUnitName === oldUnit || v.largeUnitName === 'كرتونة') {
          return { ...v, largeUnitName: newUnit };
        }
        return v;
      })
    );
  };

  // Variation Handlers with Auto-Preset / Cloning Logic
  const handleAddVariation = () => {
    const nextIndex = variations.length;
    const nextSuffix = String.fromCharCode(65 + nextIndex); // A, B, C...
    const parentCode = editingItemCode || `${getPrefix()}-${getNextNumber(selectedCatId)}`;
    const lastVar = variations[variations.length - 1];

    // Default supplier from previous variant, in-house production (if M-flag), or first available supplier
    const isM = Boolean(flags.M);
    const targetSupplierId = lastVar?.supplierId || (isM ? 'IN_HOUSE' : (suppliersList[0]?.id || ''));
    const targetSupplierName = targetSupplierId === 'IN_HOUSE'
      ? (isAr ? 'إنتاج داخلي' : 'In-House Production')
      : (suppliersList.find((s) => s.id === targetSupplierId)?.name || lastVar?.supplierName || '');

    // Inherit specs from masterSpecs defined in Step 1
    const inheritedSpecs = masterSpecs.filter((s) => s.label.trim() && s.value.trim()).length > 0
      ? masterSpecs.map((s) => ({ ...s }))
      : (lastVar?.specs ? lastVar.specs.map((s) => ({ ...s })) : [{ label: '', value: '' }]);

    const newVariant = {
      suffix: nextSuffix,
      variantCode: `${parentCode}-${nextSuffix}`,
      supplierId: targetSupplierId,
      supplierName: targetSupplierName,
      packagingRatio: lastVar?.packagingRatio !== undefined ? lastVar.packagingRatio : '',
      smallUnit: formData.smallUnit || lastVar?.smallUnit || '',
      largeUnitName: formData.largeUnitName || lastVar?.largeUnitName || '',
      specs: inheritedSpecs,
      stock: 0,
      isActive: true,
      // Opening Balance (OB) Attributes
      openingWarehouse: warehousesList[0]?.id || warehousesList[0]?.code || '',
      openingQtySmall: '',
      openingQtyLarge: '',
      openingUnitCost: '',
      openingBatchNo: '',
      openingProdDate: '',
      openingExpDate: '',
    };

    setVariations([...variations, newVariant]);
  };

  const handleRemoveVariation = (index) => {
    if (variations.length === 1) {
      if (window.confirm(isAr ? 'حذف هذا التنوع سيجعل الخامة غير نشطة (Inactive). هل تريد المتابعة؟' : 'Removing the only variation will make the material inactive. Proceed?')) {
        setVariations([]);
      }
      return;
    }
    setVariations(variations.filter((_, i) => i !== index));
  };

  const handleVariationChange = (index, field, value) => {
    const updated = [...variations];
    updated[index][field] = value;

    if (field === 'supplierId') {
      if (value === 'IN_HOUSE') {
        updated[index].supplierName = isAr ? 'إنتاج داخلي' : 'In-House Production';
      } else {
        const sup = suppliersList.find((s) => s.id === value);
        updated[index].supplierName = sup?.name || '';
      }
    }

    setVariations(updated);
  };

  // Variation Spec Handlers
  const handleAddVariantSpec = (varIndex) => {
    const updated = [...variations];
    updated[varIndex].specs.push({ label: '', value: '' });
    setVariations(updated);
  };

  const handleRemoveVariantSpec = (varIndex, specIndex) => {
    const updated = [...variations];
    updated[varIndex].specs = updated[varIndex].specs.filter((_, sIdx) => sIdx !== specIndex);
    setVariations(updated);
  };

  const handleVariantSpecChange = (varIndex, specIndex, field, value) => {
    const updated = [...variations];
    updated[varIndex].specs[specIndex][field] = value;
    setVariations(updated);
  };

  // Master Specs Row Handlers (Step 1)
  const handleAddMasterSpec = () => {
    setMasterSpecs([...masterSpecs, { label: '', value: '' }]);
  };

  const handleRemoveMasterSpec = (idx) => {
    if (masterSpecs.length === 1) return;
    setMasterSpecs(masterSpecs.filter((_, i) => i !== idx));
  };

  const handleMasterSpecChange = (idx, field, value) => {
    const updated = [...masterSpecs];
    updated[idx][field] = value;
    setMasterSpecs(updated);
  };

  // Modal Open Handlers
  const handleOpenCreate = () => {
    setEditingItemCode(null);
    setActiveItemCode(null);
    setModalStep(1);
    setSelectedCatId(1);
    setFlags({ R: false, M: false, F: true, X: false });
    setFormData({
      nameAr: '',
      nameEn: '',
      shortName: '',
      smallUnit: '',
      largeUnitName: '',
      vatRate: '14%',
      whtRate: '1%',
      reorderLevel: '',
      status: 'active',
      isStocklessUtility: false,
    });
    setMasterSpecs([{ label: '', value: '' }]);
    setVariations([]);
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItemCode(item.code);
    setActiveItemCode(item.code);
    setModalStep(1);
    setSelectedCatId(item.categoryId || 1);
    setFlags({
      R: item.flags?.includes('R') || false,
      M: item.flags?.includes('M') || false,
      F: item.flags?.includes('F') || false,
      X: item.flags?.includes('X') || false,
    });
    setFormData({
      nameAr: item.nameAr || '',
      nameEn: item.nameEn || '',
      shortName: item.shortName || '',
      smallUnit: item.smallUnit || '',
      largeUnitName: item.largeUnitName || '',
      vatRate: item.vatRate || '14%',
      whtRate: item.whtRate || '1%',
      reorderLevel: item.reorderLevel || '',
      status: item.status || 'active',
      isStocklessUtility: item.isStocklessUtility || false,
      skipOrdinaryStockTransfer: item.skipOrdinaryStockTransfer || false,
      rawMaterialSourceWh: item.rawMaterialSourceWh || '',
      needsQA: item.needsQA || false,
    });

    // Populate master specs from item
    if (Array.isArray(item.masterSpecs) && item.masterSpecs.length > 0) {
      setMasterSpecs(item.masterSpecs.map((s) => ({ ...s })));
    } else if (Array.isArray(item.specs) && item.specs.length > 0) {
      setMasterSpecs(item.specs.map((s) => ({ ...s })));
    } else {
      setMasterSpecs([{ label: '', value: '' }]);
    }

    // Populate variations with full supplier and live Opening Balance resolution
    if (Array.isArray(item.variations) && item.variations.length > 0) {
      setVariations(
        item.variations.map((v) => {
          const vCode = v.variantCode || `${item.code}-${v.suffix}`;
          
          // Prioritize self-contained variation attributes with fallback to legacy OB receipts
          let existingObLine = null;
          let existingObReceipt = null;
          goodsReceiptsList.forEach((grn) => {
            if (grn.docType === 'opening_balance' || grn.id?.startsWith('OB-')) {
              const matchLine = (grn.lines || []).find(
                (l) => l.code === vCode || l.variantCode === vCode || (l.itemId === item.code && l.variantSuffix === v.suffix)
              );
              if (matchLine) {
                existingObLine = matchLine;
                existingObReceipt = grn;
              }
            }
          });

          const ratio = Number(v.packagingRatio) || 1;
          const openQty = Number(v.openingQtySmall !== undefined && v.openingQtySmall !== '' ? v.openingQtySmall : (existingObLine?.receivedSmallUnits || v.stock || 0));
          const openWarehouse = v.openingWarehouse || existingObLine?.targetWarehouse || existingObReceipt?.targetWarehouse || warehousesList[0]?.id || warehousesList[0]?.code || '';
          const openUnitCost = v.openingUnitCost !== undefined && v.openingUnitCost !== '' ? v.openingUnitCost : (existingObLine?.unitPrice !== undefined ? existingObLine.unitPrice : '');
          const openBatchNo = v.openingBatchNo || existingObLine?.supplierBatchNo || '';
          const openProdDate = v.openingProdDate || existingObLine?.productionDate || '';
          const openExpDate = v.openingExpDate || existingObLine?.expiryDate || '';

          return {
            ...v,
            supplierName: v.supplierName || suppliersList.find((s) => s.id === v.supplierId)?.name || '',
            specs: v.specs ? v.specs.map((s) => ({ ...s })) : [{ label: '', value: '' }],
            imageFile: v.imageFile || '',
            openingWarehouse: openWarehouse,
            openingQtySmall: openQty > 0 ? openQty : '',
            openingQtyLarge: openQty > 0 ? Number((openQty / ratio).toFixed(2)) : '',
            openingUnitCost: openUnitCost,
            openingBatchNo: openBatchNo,
            openingProdDate: openProdDate,
            openingExpDate: openExpDate,
          };
        })
      );
    } else {
      setVariations([]);
    }

    setShowModal(true);
  };

  // Delete Handler
  const handleDeleteItem = async (codeToDelete) => {
    if (!canDelete) {
      alert(isAr ? 'عذراً، ليس لديك صلاحية حذف الخامات من النظام.' : 'You do not have permission to delete items.');
      return;
    }

    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف الخامة (${codeToDelete}) وجميع تنوعاتها نهائياً من قاعدة البيانات؟`
      : `Are you sure you want to permanently delete (${codeToDelete}) and its variations?`;

    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, 'items', codeToDelete));
      } catch (error) {
        console.error('Error deleting item:', error);
        alert(isAr ? 'حدث خطأ أثناء حذف الخامة.' : 'Error deleting item.');
      }
    }
  };

  // Step 1: Validate & Transition to Step 2 (Dynamically computes parent code from flags + category)
  const handleProceedToStep2 = (e) => {
    e?.preventDefault();

    if (!formData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم الخامة بالعربية.' : 'Please enter Arabic name.');
      return;
    }
    if (!formData.smallUnit.trim() || !formData.largeUnitName.trim()) {
      alert(isAr ? 'يرجى تحديد الوحدة الصغرى واسم الوحدة الكبرى.' : 'Please enter small and large unit names.');
      return;
    }

    const activeFlagsList = Object.keys(flags).filter((k) => flags[k]);
    if (activeFlagsList.length === 0) {
      alert(isAr ? 'يجب اختيار طريقة استخدام واحدة على الأقل (F / M / R / X)' : 'Select at least one usage flag');
      return;
    }

    const originalItem = items.find((i) => i.code === editingItemCode);
    const isCatChanged = originalItem && Number(originalItem.categoryId) !== Number(selectedCatId);
    const parentCode = (!editingItemCode || isCatChanged)
      ? `${getPrefix()}-${getNextNumber(selectedCatId)}`
      : editingItemCode;
    setActiveItemCode(parentCode);

    // If variations are empty, initialize Variation (A) pre-filled with Step 1 master specs & supplier / In-House
    if (variations.length === 0) {
      const validMasterSpecs = masterSpecs.filter((s) => s.label.trim() && s.value.trim());
      const isM = Boolean(flags.M);
      const defaultSupplierId = isM ? 'IN_HOUSE' : (suppliersList[0]?.id || '');
      const defaultSupplierName = isM 
        ? (isAr ? 'إنتاج داخلي' : 'In-House Production') 
        : (suppliersList[0]?.name || '');

      setVariations([
        {
          suffix: 'A',
          variantCode: `${parentCode}-A`,
          supplierId: defaultSupplierId,
          supplierName: defaultSupplierName,
          packagingRatio: '',
          smallUnit: formData.smallUnit.trim(),
          largeUnitName: formData.largeUnitName.trim(),
          specs: validMasterSpecs.length > 0 ? validMasterSpecs.map((s) => ({ ...s })) : [{ label: '', value: '' }],
          stock: 0,
          isActive: true,
          // Opening Balance (OB) Attributes
          openingWarehouse: warehousesList[0]?.id || warehousesList[0]?.code || '',
          openingQtySmall: '',
          openingQtyLarge: '',
          openingUnitCost: '',
          openingBatchNo: '',
          openingProdDate: '',
          openingExpDate: '',
        }
      ]);
    } else {
      // If user went back to Step 1 and changed category/flags, sync the variant codes
      setVariations((prevVars) =>
        prevVars.map((v) => ({
          ...v,
          variantCode: `${parentCode}-${v.suffix}`,
        }))
      );
    }

    setModalStep(2);
  };

  // Direct Save as Inactive (Skip Step 2)
  const handleSaveAsInactive = async () => {
    if (!formData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم الخامة بالعربية.' : 'Please enter Arabic name.');
      return;
    }
    if (!formData.smallUnit.trim() || !formData.largeUnitName.trim()) {
      alert(isAr ? 'يرجى تحديد الوحدة الصغرى واسم الوحدة الكبرى.' : 'Please enter small and large unit names.');
      return;
    }

    const confirmInactive = window.confirm(
      isAr
        ? 'هل ترغب في حفظ هذه الخامة كـ "غير نشطة" (Inactive) بدون تنوعات أو موردين؟\n(يمكنك تفعيلها لاحقاً في أي وقت بإضافة تنوع ومورد)'
        : 'Save this material as "Inactive" without variations or suppliers?'
    );

    if (confirmInactive) {
      await finalizeSaveItem([], 'inactive');
    }
  };

  // Final Atomic Save (Single Firestore Document Execution)
  const finalizeSaveItem = async (variationsListToSave, enforcedStatus = null) => {
    if (editingItemCode && !canEdit) {
      alert(isAr ? 'عذراً، ليس لديك صلاحية تعديل بيانات الخامات.' : 'You do not have permission to edit items.');
      return;
    }
    if (!editingItemCode && !canCreate) {
      alert(isAr ? 'عذراً، ليس لديك صلاحية إضافة خامات جديدة.' : 'You do not have permission to create items.');
      return;
    }

    const activeFlagsList = Object.keys(flags).filter((k) => flags[k]);
    const validMasterSpecs = masterSpecs.filter((s) => s.label.trim() && s.value.trim());
    const mergedMasterSpecs = validMasterSpecs.map((s) => `${s.label.trim()}: ${s.value.trim()}`).join(' | ');

    // Validate suppliers for all variations if variations exist
    if (variationsListToSave.length > 0) {
      for (const v of variationsListToSave) {
        if (!v.supplierId) {
          alert(
            isAr
              ? `يرجى اختيار المورد المعتمد للتنوع (${v.suffix}) أو حذف هذا التنوع.`
              : `Please select a supplier for variation (${v.suffix}) or remove it.`
          );
          return;
        }
      }
    }

    // Check duplicate variations for same vendor
    if (variationsListToSave.length > 1) {
      for (let i = 0; i < variationsListToSave.length; i++) {
        for (let j = i + 1; j < variationsListToSave.length; j++) {
          const v1 = variationsListToSave[i];
          const v2 = variationsListToSave[j];
          if (v1.supplierId === v2.supplierId) {
            const v1SpecsStr = v1.specs.map((s) => `${s.label}:${s.value}`).join('|');
            const v2SpecsStr = v2.specs.map((s) => `${s.label}:${s.value}`).join('|');
            if (v1SpecsStr === v2SpecsStr && v1.packagingRatio === v2.packagingRatio) {
              alert(
                isAr
                  ? `تنبيه: التنوعان (${v1.suffix}) و (${v2.suffix}) متطابقان تماماً لنفس المورد. يرجى تعديل المواصفات أو معدل الشدة للتمييز بينهما.`
                  : `Notice: Variations (${v1.suffix}) and (${v2.suffix}) are identical for the same supplier.`
              );
              return;
            }
          }
        }
      }
    }

    const originalItem = items.find((i) => i.code === editingItemCode);
    const oldCatId = originalItem ? Number(originalItem.categoryId) : null;
    const newCatId = Number(selectedCatId);
    const isCatChanged = editingItemCode && oldCatId !== null && oldCatId !== newCatId;

    const targetCode = (!editingItemCode || isCatChanged)
      ? `${getPrefix()}-${getNextNumber(selectedCatId)}`
      : editingItemCode;
    const finalStatus = enforcedStatus || (variationsListToSave.length > 0 ? 'active' : 'inactive');

    // Validate Mandatory Unit Cost for any variant with Opening Quantity > 0 (Skipped for Stockless Utilities)
    if (!formData.isStocklessUtility) {
      for (const v of variationsListToSave) {
        const openQty = Number(v.openingQtySmall || 0);
        if (openQty > 0) {
          if (!v.openingWarehouse) {
            alert(isAr ? `يرجى تحديد مستودع الرصيد الافتتاحي للتنوع (${v.suffix}).` : `Please select target warehouse for variation (${v.suffix}) opening stock.`);
            return;
          }
          if (v.openingUnitCost === '' || v.openingUnitCost === undefined || Number(v.openingUnitCost) < 0) {
            alert(isAr ? `يرجى إدخال تكلفة الوحدة للرصيد الافتتاحي للتنوع (${v.suffix}) لحساب تقييم المخزون بدقة (حقل إلزامي).` : `Please enter unit cost for opening stock of variation (${v.suffix}) to ensure accurate FIFO valuation.`);
            return;
          }
        }
      }
    }

    // Process variations, preserve imageFile & Opening Balance metadata, and compute initial stock
    const processedVariations = variationsListToSave.map((v, idx) => {
      const validSpecs = (v.specs || []).filter((s) => s.label?.trim() && s.value?.trim());
      const merged = validSpecs.map((s) => `${s.label.trim()}: ${s.value.trim()}`).join(' | ');
      const suffix = v.suffix || String.fromCharCode(65 + idx);
      const isSelfMade = v.supplierId === 'IN_HOUSE';
      const sup = isSelfMade ? { name: isAr ? 'إنتاج داخلي' : 'In-House Production' } : suppliersList.find((s) => s.id === v.supplierId);
      const supplierNameResolved = isSelfMade ? (isAr ? 'إنتاج داخلي' : 'In-House Production') : (sup?.name || v.supplierName || '');
      const openQty = Number(v.openingQtySmall || 0);

      return {
        suffix,
        variantCode: `${targetCode}-${suffix}`,
        supplierId: v.supplierId || '',
        supplierName: supplierNameResolved,
        packagingRatio: Number(v.packagingRatio) || 1,
        smallUnit: (v.smallUnit || formData.smallUnit).trim(),
        largeUnitName: (v.largeUnitName || formData.largeUnitName).trim(),
        specs: validSpecs,
        mergedSpecs: merged,
        imageFile: v.imageFile || '',
        stock: openQty > 0 ? openQty : (Number(v.stock) || 0),
        isActive: v.isActive !== false,
        openingWarehouse: v.openingWarehouse || '',
        openingQtySmall: openQty,
        openingUnitCost: Number(v.openingUnitCost) || 0,
        openingBatchNo: v.openingBatchNo || '',
        openingProdDate: v.openingProdDate || '',
        openingExpDate: v.openingExpDate || '',
      };
    });

    const totalStock = processedVariations.reduce((sum, v) => sum + (v.stock || 0), 0);
    const nextNum = (!editingItemCode || isCatChanged)
      ? getNextNumber(selectedCatId)
      : (originalItem?.serialNum || 101);

    const itemPayload = {
      code: targetCode,
      serialNum: nextNum,
      flags: activeFlagsList,
      categoryId: Number(selectedCatId),
      nameAr: formData.nameAr.trim(),
      nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
      shortName: formData.shortName.trim(),
      smallUnit: formData.smallUnit.trim(),
      largeUnitName: formData.largeUnitName.trim(),
      vatRate: formData.vatRate,
      whtRate: formData.whtRate,
      reorderLevel: Number(formData.reorderLevel) || 0,
      masterSpecs: validMasterSpecs,
      mergedSpecs: mergedMasterSpecs,
      status: finalStatus,
      isStocklessUtility: Boolean(formData.isStocklessUtility),
      skipOrdinaryStockTransfer: Boolean(formData.skipOrdinaryStockTransfer),
      rawMaterialSourceWh: formData.skipOrdinaryStockTransfer ? formData.rawMaterialSourceWh : '',
      needsQA: Boolean(formData.needsQA),
      variationsCount: processedVariations.length,
      variations: processedVariations,
      stock: formData.isStocklessUtility ? 0 : totalStock,
      updatedAt: serverTimestamp(),
    };

    if (!editingItemCode) {
      itemPayload.createdAt = serverTimestamp();
    }

    try {
      const batch = writeBatch(db);

      // Development Mode: Full Resequencing of Source and Destination Categories
      if (isCatChanged) {
        // 1. Delete original document key
        batch.delete(doc(db, 'items', editingItemCode));

        // 2. Resequence remaining items in OLD category to close sequence gaps
        const oldCatObj = categories.find((c) => Number(c.id) === oldCatId);
        const oldBase = oldCatObj ? Number(oldCatObj.base) : (oldCatId * 100);
        const remainingOldItems = items
          .filter((i) => Number(i.categoryId) === oldCatId && i.code !== editingItemCode)
          .sort((a, b) => (Number(a.serialNum) || 0) - (Number(b.serialNum) || 0));

        remainingOldItems.forEach((itm, idx) => {
          const newSerial = oldBase + 1 + idx;
          const pfx = (itm.flags && itm.flags.length > 0) ? itm.flags.join('') : (itm.code.split('-')[0] || 'F');
          const newItmCode = `${pfx}-${newSerial}`;

          if (newItmCode !== itm.code) {
            batch.delete(doc(db, 'items', itm.code));
          }

          const updatedVars = (itm.variations || []).map((v) => ({
            ...v,
            variantCode: `${newItmCode}-${v.suffix}`,
          }));

          batch.set(doc(db, 'items', newItmCode), {
            ...itm,
            code: newItmCode,
            serialNum: newSerial,
            variations: updatedVars,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        });

        // 3. Resequence NEW category items including the newly moved item
        const newCatObj = categories.find((c) => Number(c.id) === newCatId);
        const newBase = newCatObj ? Number(newCatObj.base) : (newCatId * 100);
        const existingNewItems = items
          .filter((i) => Number(i.categoryId) === newCatId && i.code !== editingItemCode)
          .sort((a, b) => (Number(a.serialNum) || 0) - (Number(b.serialNum) || 0));

        const allNewList = [...existingNewItems, itemPayload];
        allNewList.forEach((itm, idx) => {
          const newSerial = newBase + 1 + idx;
          const pfx = (itm.flags && itm.flags.length > 0) ? itm.flags.join('') : (itm.code.split('-')[0] || 'F');
          const newItmCode = `${pfx}-${newSerial}`;

          if (itm.code && itm.code !== newItmCode && itm.code !== editingItemCode) {
            batch.delete(doc(db, 'items', itm.code));
          }

          const updatedVars = (itm.variations || []).map((v) => ({
            ...v,
            variantCode: `${newItmCode}-${v.suffix}`,
          }));

          batch.set(doc(db, 'items', newItmCode), {
            ...itm,
            code: newItmCode,
            serialNum: newSerial,
            variations: updatedVars,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        });
      } else {
        if (editingItemCode && editingItemCode !== targetCode) {
          batch.delete(doc(db, 'items', editingItemCode));
        }
        batch.set(doc(db, 'items', targetCode), itemPayload, { merge: true });
      }

      // Phase 2: Decouple Opening Balances from goods_receipts into stock_ledger directly
      const todayStr = new Date().toISOString().split('T')[0];

      variationsListToSave.forEach((v) => {
        const vCode = `${targetCode}-${v.suffix}`;
        const openQty = Number(v.openingQtySmall || 0);
        const ledgerDocId = `OB-${targetCode}-${v.suffix}`;
        const obLotNo = `OB-${targetCode}-${v.suffix}-01`;

        // Check and purge legacy OB voucher from goods_receipts if present
        let legacyObDocId = null;
        goodsReceiptsList.forEach((grn) => {
          if (grn.docType === 'opening_balance' || grn.id?.startsWith('OB-')) {
            const match = (grn.lines || []).some(
              (l) => l.code === vCode || l.variantCode === vCode || (l.itemId === targetCode && l.variantSuffix === v.suffix)
            );
            if (match) {
              legacyObDocId = grn.id;
            }
          }
        });

        // Always purge from goods_receipts so procurement tab stays 100% vendor-only
        if (legacyObDocId) {
          batch.delete(doc(db, 'goods_receipts', legacyObDocId));
        }

        if (openQty > 0) {
          const sup = suppliersList.find((s) => s.id === v.supplierId);
          const ledgerRef = doc(db, 'stock_ledger', ledgerDocId);

          // Write directly to stock_ledger with idempotent key
          batch.set(
            ledgerRef,
            {
              id: ledgerDocId,
              lotNumber: obLotNo,
              action: 'opening_balance_initial',
              docType: 'opening_balance',
              itemId: targetCode,
              variantCode: vCode,
              variantSuffix: v.suffix,
              materialNameAr: formData.nameAr.trim(),
              qty: openQty,
              unit: v.smallUnit || formData.smallUnit,
              warehouse: v.openingWarehouse,
              supplierId: v.supplierId || '',
              supplierName: sup?.name || (isAr ? 'رصيد افتتاحي أولي' : 'Opening Balance'),
              receiptDate: v.openingProdDate || todayStr,
              batchNo: v.openingBatchNo || 'OB-LOT',
              productionDate: v.openingProdDate || null,
              expiryDate: v.openingExpDate || null,
              unitPrice: Number(v.openingUnitCost) || 0,
              currency: 'EGP',
              totalValue: openQty * (Number(v.openingUnitCost) || 0),
              receivedBy: currentUser?.nameAr || currentUser?.name || 'General Admin',
              timestamp: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          // If opening balance was zeroed out, remove from stock_ledger
          batch.delete(doc(db, 'stock_ledger', ledgerDocId));
        }
      });

      await batch.commit();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving item to Firestore:', error);
      alert(isAr ? 'حدث خطأ أثناء حفظ الخامة في السحابة.' : 'Error saving item.');
    }
  };

  // Step 2 Form Submission
  const handleSaveItem = async (e) => {
    e?.preventDefault();
    await finalizeSaveItem(variations);
  };

  // Filter Items

// Helper: Match warehouse by ID, code, or name
  const matchWh = (val, target) => {
    if (!val || !target) return false;
    return val === target.id || val === target.code || val === target.nameAr || val === target.nameEn;
  };

  // Master Stock Calculation Engine (Strictly excludes Quarantine and Scrap Warehouses from Usable Stock)
  const stockMetricsMap = useMemo(() => {
    const map = {}; // key: `${itemCode}_${variantCode}` -> { usableStock, quarantineStock, scrapStock, totalStock, byWarehouse: {} }

    // Identify non-usable warehouse IDs
    const nonUsableWhMap = {};
    warehousesList.forEach((w) => {
      const whId = w.id || w.code;
      const isNonUsable = w.classification === 'returns' || w.classification === 'scrap' || w.isFactoryLinked === false && (w.classification === 'quarantine');
      nonUsableWhMap[whId] = {
        classification: w.classification,
        isNonUsable,
      };
    });

    // 1. Process Opening Balances directly from Item Variations
    items.forEach((item) => {
      if (item.isStocklessUtility) return;
      (item.variations || []).forEach((v) => {
        const openQty = Number(v.openingQtySmall || 0);
        if (openQty <= 0 || !v.openingWarehouse) return;

        const pId = item.code;
        const vCode = v.variantCode || `${pId}-${v.suffix}`;
        const targetWhObj = warehousesList.find((w) => matchWh(v.openingWarehouse, w)) || { id: v.openingWarehouse, code: v.openingWarehouse };
        const whId = targetWhObj.id || targetWhObj.code;

        const key = `${pId}_${vCode}`;
        if (!map[key]) {
          map[key] = { usableStock: 0, quarantineStock: 0, scrapStock: 0, totalStock: 0, byWarehouse: {} };
        }

        map[key].totalStock += openQty;
        map[key].byWarehouse[whId] = (map[key].byWarehouse[whId] || 0) + openQty;

        const whType = nonUsableWhMap[whId]?.classification;
        if (whType === 'returns') {
          map[key].quarantineStock += openQty;
        } else if (whType === 'scrap') {
          map[key].scrapStock += openQty;
        } else {
          map[key].usableStock += openQty;
        }
      });
    });

    // 2. Process inward GRNs & outward RTNs (strictly excluding opening balances)
    goodsReceiptsList.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      if (grn.docType === 'opening_balance' || grn.id?.startsWith('OB-')) return;
      const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');

      (grn.lines || []).forEach((line) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const targetWhObj = warehousesList.find((w) => matchWh(line.targetWarehouse, w)) || { id: line.targetWarehouse, code: line.targetWarehouse };
        const whId = targetWhObj.id || targetWhObj.code;
        const qty = Number(line.receivedSmallUnits || 0) * (isReturn ? -1 : 1);

        const key = `${pId}_${vCode}`;
        if (!map[key]) {
          map[key] = { usableStock: 0, quarantineStock: 0, scrapStock: 0, totalStock: 0, byWarehouse: {} };
        }

        map[key].totalStock += qty;
        map[key].byWarehouse[whId] = (map[key].byWarehouse[whId] || 0) + qty;

        const whType = nonUsableWhMap[whId]?.classification;
        if (whType === 'returns') {
          map[key].quarantineStock += qty;
        } else if (whType === 'scrap') {
          map[key].scrapStock += qty;
        } else {
          map[key].usableStock += qty;
        }
      });
    });

    // 2. Process stock transfers
    transfersList.forEach((trn) => {
      if (trn.status !== 'completed') return;

      const srcWhObj = warehousesList.find((w) => matchWh(trn.sourceWarehouse, w)) || { id: trn.sourceWarehouse, code: trn.sourceWarehouse };
      const tgtWhObj = warehousesList.find((w) => matchWh(trn.targetWarehouse, w)) || { id: trn.targetWarehouse, code: trn.targetWarehouse };
      const srcWhId = srcWhObj.id || srcWhObj.code;
      const tgtWhId = tgtWhObj.id || tgtWhObj.code;

      (trn.lines || []).forEach((line) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const qty = Number(line.qtySmallUnits || 0);

        const key = `${pId}_${vCode}`;
        if (!map[key]) {
          map[key] = { usableStock: 0, quarantineStock: 0, scrapStock: 0, totalStock: 0, byWarehouse: {} };
        }

        map[key].byWarehouse[srcWhId] = (map[key].byWarehouse[srcWhId] || 0) - qty;
        map[key].byWarehouse[tgtWhId] = (map[key].byWarehouse[tgtWhId] || 0) + qty;

        // Re-compute totals for source
        const srcType = nonUsableWhMap[srcWhId]?.classification;
        if (srcType === 'returns') map[key].quarantineStock -= qty;
        else if (srcType === 'scrap') map[key].scrapStock -= qty;
        else map[key].usableStock -= qty;

        // Re-compute totals for target
        const tgtType = nonUsableWhMap[tgtWhId]?.classification;
        if (tgtType === 'returns') map[key].quarantineStock += qty;
        else if (tgtType === 'scrap') map[key].scrapStock += qty;
        else map[key].usableStock += qty;
      });
    });

    return map;
  }, [items, warehousesList, goodsReceiptsList, transfersList]);

  const filteredItems = items.filter((item) => {
    const matchSearch =
      item.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nameAr?.includes(searchTerm) ||
      item.nameEn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.variations?.some(
        (v) =>
          v.variantCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.mergedSpecs?.includes(searchTerm)
      );

    if (statusFilter === 'all') return matchSearch;
    return matchSearch && (item.status || 'active') === statusFilter;
  });

  return (
    <div>
      {/* Category Spec Memory Suggestion Datalist */}
      <datalist id="category-spec-suggestions">
        {rememberedSpecLabels.map((lbl, idx) => (
          <option key={idx} value={lbl} />
        ))}
      </datalist>

      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              placeholder={isAr ? 'بحث بالكود، اسم الخامة، المورد، أو المواصفات...' : 'Search code, name, supplier, or specs...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 font-medium"
          >
            <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="active">{isAr ? 'خامات نشطة' : 'Active Materials'}</option>
            <option value="inactive">{isAr ? 'خامات موقوفة / بدون تنوعات' : 'Inactive Materials'}</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Master Category Management (General Admin Only) */}
          {isGeneralAdmin && (
            <button
              type="button"
              onClick={() => {
                handleStartAddCategory();
                setShowCategoryModal(true);
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title={isAr ? 'إدارة تصنيفات ومجموعات التكويد (للمسؤول العام فقط)' : 'Manage ERP Categories (Admin)'}
            >
              <FolderCog className="h-4 w-4 text-slate-600" />
              <span className="hidden md:inline">{isAr ? 'إدارة التصنيفات' : 'Categories'}</span>
            </button>
          )}

          {/* Dynamic Add Material Trigger */}
          {canCreate ? (
            <button
              onClick={handleOpenCreate}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'تعريف وتكويد خامة جديدة' : 'Add New Material'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
              <Lock className="h-3.5 w-3.5" />
              <span>{isAr ? 'وضع القراءة فقط' : 'Read-Only Mode'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Master Items Hierarchical Grid */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 text-xs">
              <th className="p-3 text-start w-10"></th>
              <th className="p-3 text-start">{isAr ? 'الكود والتصنيف' : 'Code & Category'}</th>
              <th className="p-3 text-start">{isAr ? 'اسم الخامة والاستخدام' : 'Material Name & Usage'}</th>
              <th className="p-3 text-start">{isAr ? 'الوحدات الأساسية' : 'Master Units'}</th>
              <th className="p-3 text-start">{isAr ? 'التنوعات والموردين' : 'Variations & Vendors'}</th>
              <th className="p-3 text-center">{isAr ? 'الرصيد المتاح للتشغيل' : 'Usable Stock'}</th>
              <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
              {(canEdit || canDelete) && <th className="p-3 text-center">{isAr ? 'إجراء' : 'Action'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 text-sm">
                  {isAr ? 'لا توجد خامات مطابقة للبحث.' : 'No materials found.'}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isExpanded = Boolean(expandedItems[item.code]);
                const catObj = categories.find((c) => Number(c.id) === Number(item.categoryId));
                const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;

                return (
                  <React.Fragment key={item.code}>
                    {/* Master Parent Row */}
                    <tr className={`transition ${isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'}`}>
                      {/* Accordion Expand Chevron */}
                      <td className="p-3 text-center">
                        {hasVariations && (
                          <button
                            onClick={() => toggleItemExpand(item.code)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200/60 transition cursor-pointer"
                            title={isAr ? 'عرض تنوعات الخامة والموردين' : 'Expand variations'}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-emerald-600" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                          </button>
                        )}
                      </td>

                      {/* Master Code & Category */}
                      <td className="p-3">
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded block w-max">
                          {item.code}
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {isAr ? catObj?.nameAr : catObj?.nameEn}
                        </span>
                      </td>

                      {/* Name & Flags */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{isAr ? item.nameAr : item.nameEn}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.flags?.map((f) => (
                            <span
                              key={f}
                              className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                f === 'R' ? 'bg-red-50 text-red-700 border border-red-200' :
                                f === 'M' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                f === 'F' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}
                            >
                              {f}
                            </span>
                          ))}
                          {item.shortName && (
                            <span className="text-xs text-slate-400">({item.shortName})</span>
                          )}
                        </div>
                      </td>

                      {/* Units */}
                      <td className="p-3 text-xs text-slate-600">
                        <div><span className="text-slate-400">{isAr ? 'صغرى:' : 'Small:'}</span> <span className="font-semibold text-slate-800">{item.smallUnit}</span></div>
                        <div><span className="text-slate-400">{isAr ? 'كبرى:' : 'Large:'}</span> <span className="font-semibold text-slate-800">{item.largeUnitName}</span></div>
                      </td>

                      {/* Variations Count Badge */}
                      <td className="p-3">
                        {hasVariations ? (
                          <button
                            onClick={() => toggleItemExpand(item.code)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            <Layers className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{item.variations.length} {isAr ? 'تنوعات معتمدة' : 'Variations'}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs font-medium">
                            <AlertCircle className="h-3 w-3" />
                            <span>{isAr ? 'بدون تنوعات' : 'No Variations'}</span>
                          </span>
                        )}
                      </td>

                      {/* Usable Stock Level (Calculated across all usable warehouses) */}
                      <td className="p-3 text-center">
                        {item.isStocklessUtility ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-900 border border-cyan-300">
                            <span>∞</span>
                            <span>{isAr ? 'خامة خدمية (بدون رصيد)' : 'Stockless Utility'}</span>
                          </span>
                        ) : (() => {
                          const totalUsable = (item.variations || []).reduce((sum, v) => {
                            const key = `${item.code}_${v.variantCode || `${item.code}-${v.suffix}`}`;
                            return sum + (stockMetricsMap[key]?.usableStock || v.stock || 0);
                          }, 0);

                          const totalQuarantine = (item.variations || []).reduce((sum, v) => {
                            const key = `${item.code}_${v.variantCode || `${item.code}-${v.suffix}`}`;
                            return sum + (stockMetricsMap[key]?.quarantineStock || 0);
                          }, 0);

                          const totalScrap = (item.variations || []).reduce((sum, v) => {
                            const key = `${item.code}_${v.variantCode || `${item.code}-${v.suffix}`}`;
                            return sum + (stockMetricsMap[key]?.scrapStock || 0);
                          }, 0);

                          return (
                            <div>
                              <span className="font-mono font-extrabold text-slate-900 block text-xs">
                                {totalUsable.toLocaleString()} {item.smallUnit}
                              </span>
                              {(totalQuarantine > 0 || totalScrap > 0) && (
                                <div className="flex flex-wrap items-center justify-center gap-1 mt-1 text-[10px]">
                                  {totalQuarantine > 0 && (
                                    <span className="px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold" title={isAr ? 'في الحجر / المرتجعات (غير متاح)' : 'Quarantine'}>
                                      {totalQuarantine.toLocaleString()} {isAr ? 'حجر' : 'Quarantine'}
                                    </span>
                                  )}
                                  {totalScrap > 0 && (
                                    <span className="px-1.5 py-0.2 bg-rose-50 text-rose-800 border border-rose-200 rounded font-semibold" title={isAr ? 'هوالك ومخلفات (غير متاح)' : 'Scrap'}>
                                      {totalScrap.toLocaleString()} {isAr ? 'هوالك' : 'Scrap'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Active / Inactive Status */}
                      <td className="p-3">
                        {item.status === 'inactive' || !hasVariations ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                            <Ban className="h-3 w-3 text-slate-400" />
                            {isAr ? 'موقوف / غير نشط' : 'Inactive'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            {isAr ? 'نشط' : 'Active'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      {(canEdit || canDelete) && (
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && (
                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                title={isAr ? 'تعديل بيانات وتنوعات الخامة' : 'Edit Material & Variations'}
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteItem(item.code)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title={isAr ? 'حذف الخامة نهائياً' : 'Delete Material'}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* Expandable Nested Variations Sub-Grid */}
                    {isExpanded && hasVariations && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={8} className="p-3 ps-12 pe-6">
                          <div className="bg-white border border-emerald-200 rounded-xl p-3 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                <Boxes className="h-4 w-4 text-emerald-600" />
                                <span>{isAr ? `تنوعات وموردي الخامة (${item.nameAr})` : `Approved Variations for (${item.nameEn})`}</span>
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                Base SKU: {item.code}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                              {item.variations.map((v, idx) => {
                                const vCode = v.variantCode || `${item.code}-${v.suffix}`;
                                const vKey = `${item.code}_${vCode}`;
                                const vStockData = stockMetricsMap[vKey] || { usableStock: v.stock || 0, quarantineStock: 0, scrapStock: 0, byWarehouse: {} };

                                return (
                                  <div key={idx} className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl text-xs space-y-2">
                                    <div className="flex justify-between items-start">
                                      <div className="flex items-center gap-2">
                                        {/* Optional Variant Image Thumbnail */}
                                        {v.imageFile ? (
                                          <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center p-0.5 overflow-hidden shrink-0">
                                            <img
                                              src={v.imageFile}
                                              alt={vCode}
                                              onClick={() => setImagePreviewModal({
                                                url: v.imageFile,
                                                title: `${isAr ? item.nameAr : item.nameEn} - (${v.suffix})`,
                                                subtitle: vCode
                                              })}
                                              className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                              title={isAr ? 'انقر لمعاينة صورة الخامة' : 'Click to preview material image'}
                                            />
                                          </div>
                                        ) : (
                                          <div className="w-11 h-11 rounded-xl bg-slate-200/70 border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                                            <Package className="h-5 w-5" />
                                          </div>
                                        )}
                                        <div>
                                          <span className="font-mono font-bold text-slate-900 bg-white border border-slate-300 px-2 py-0.5 rounded text-xs">
                                            {vCode}
                                          </span>
                                          <div className="mt-1">
                                            {v.supplierId === 'IN_HOUSE' || v.supplierName === 'إنتاج داخلي' || v.supplierName === 'In-House Production' ? (
                                              <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[10px]">
                                                <Factory className="h-3 w-3 text-amber-600" />
                                                <span>{isAr ? 'إنتاج / تشغيل داخلي' : 'In-House Production'}</span>
                                              </span>
                                            ) : (
                                              <div className="text-[11px] text-slate-600 font-semibold flex items-center gap-1">
                                                <Building2 className="h-3 w-3 text-slate-400" />
                                                <span>{v.supplierName || suppliersList.find((s) => s.id === v.supplierId)?.name || '—'}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="text-end">
                                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 block">
                                          1 {v.largeUnitName || item.largeUnitName} = {v.packagingRatio} {v.smallUnit || item.smallUnit}
                                        </span>
                                        <span className="text-[11px] font-mono font-extrabold text-slate-900 block mt-1">
                                          {isAr ? 'الرصيد المتاح:' : 'Usable:'} {vStockData.usableStock.toLocaleString()} {v.smallUnit || item.smallUnit}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Warehouse Breakdown for this Variant */}
                                    <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/60">
                                      {warehousesList.map((wh) => {
                                        const whId = wh.id || wh.code;
                                        const qty = vStockData.byWarehouse[whId] || 0;
                                        if (qty === 0) return null;

                                        const isNonUsable = wh.classification === 'returns' || wh.classification === 'scrap';

                                        return (
                                          <span
                                            key={whId}
                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                                              isNonUsable
                                                ? (wh.classification === 'returns' ? 'bg-amber-50 text-amber-900 border-amber-300' : 'bg-rose-50 text-rose-900 border-rose-300')
                                                : 'bg-white text-slate-800 border-slate-200 shadow-2xs'
                                            }`}
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: wh.color || '#0d6cba' }} />
                                            <span>{wh.code || wh.nameAr}:</span>
                                            <b>{qty.toLocaleString()}</b>
                                          </span>
                                        );
                                      })}
                                    </div>

                                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                                      <span className="text-slate-400 font-medium block mb-0.5">{isAr ? 'المواصفات الفنية المعتمدة:' : 'Technical Specs:'}</span>
                                      <span>{v.mergedSpecs || <span className="text-slate-400 italic">—</span>}</span>
                                    </div>
                                  </div>
                                );
                              })}
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
      </div>

      {/* 2-Step Wizard Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Sticky Modal Header & Step Indicator */}
            <div className="sticky -top-6 -mt-6 pt-6 bg-white z-30 flex flex-wrap items-center justify-between gap-3 pb-3 mb-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingItemCode 
                    ? (isAr ? `تعديل الخامة (${editingItemCode})` : `Edit Material (${editingItemCode})`)
                    : (isAr ? 'تعريف وتكويد خامة جديدة' : 'Define Master Material & Variations')
                  }
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modalStep === 1 
                    ? (isAr ? 'الخطوة ١: البيانات الأساسية، وحدات القياس، والمواصفات الفنية المعتمدة' : 'Step 1: Master Catalog, Units & Technical Specs')
                    : (isAr ? 'الخطوة ٢: تخصيص تنوعات الخامة، الموردين، ومعدل التعبئة (الشدة)' : 'Step 2: Assign Variations, Vendors & Packaging Ratios')}
                </p>
              </div>

              {/* Step Navigation Pill & Quick-Close X Button */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setModalStep(1)}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      modalStep === 1 ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isAr ? '١- البيانات والمواصفات' : '1- Master Specs'}
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToStep2}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      modalStep === 2 ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isAr ? '٢- التنوعات والشدة' : '2- Variations'}
                  </button>
                </div>

                <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 px-3 py-1 rounded-md">
                  {editingItemCode || `${getPrefix()}-${getNextNumber(selectedCatId)}`}
                </span>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  title={isAr ? 'إغلاق' : 'Close'}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* STEP 1: Master Definition, Units & Master Specs */}
            {modalStep === 1 && (
              <form onSubmit={handleProceedToStep2} className="space-y-5">
                {/* 1. Category & Usage Scope */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '١- التصنيف وطريقة الاستخدام' : '1. Category & Usage Scope'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'التصنيف الرئيسي (مجموعات التكويد) *' : 'Master Category *'}
                      </label>
                      <select
                        value={selectedCatId}
                        onChange={(e) => setSelectedCatId(Number(e.target.value))}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {isAr ? c.nameAr : c.nameEn} ({c.base} Series)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'طريقة الاستخدام في المصنع *' : 'Usage Scope in Operations *'}
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <label className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition select-none ${flags.F ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-900 shadow-2xs' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={flags.F} onChange={() => handleFlagToggle('F')} className="accent-emerald-600" />
                          <span>F: مباشر (Final)</span>
                        </label>

                        <label className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition select-none ${flags.M ? 'bg-blue-50 border-blue-400 font-bold text-blue-900 shadow-2xs' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={flags.M} onChange={() => handleFlagToggle('M')} className="accent-blue-600" />
                          <span>M: تصنيع (Made)</span>
                        </label>

                        <label className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition select-none ${flags.R ? 'bg-red-50 border-red-400 font-bold text-red-900 shadow-2xs' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={flags.R} onChange={() => handleFlagToggle('R')} className="accent-red-600" />
                          <span>R: خامة (Raw)</span>
                        </label>

                        <label className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition select-none ${flags.X ? 'bg-purple-50 border-purple-400 font-bold text-purple-900 shadow-2xs' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={flags.X} onChange={() => handleFlagToggle('X')} className="accent-purple-600" />
                          <span>X: غير تصنيعي</span>
                        </label>
                      </div>

                      {/* Stockless Utility / Continuous Supply Checkbox */}
                      <label className={`mt-2 flex items-center justify-between p-2 rounded-xl border transition cursor-pointer select-none ${formData.isStocklessUtility ? 'bg-cyan-50 border-cyan-400 text-cyan-950 font-bold shadow-2xs' : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(formData.isStocklessUtility)}
                            onChange={(e) => setFormData({ ...formData, isStocklessUtility: e.target.checked })}
                            className="accent-cyan-600 h-4 w-4 rounded"
                          />
                          <div className="text-start">
                            <span className="text-xs block">
                              {isAr ? 'خامة خدمية متجددة (مياه بلدية / غاز - بدون رصيد أو تكلفة مخزنية)' : 'Stockless Utility (Continuous supply, untracked inventory)'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {isAr ? 'تُستخدم في معادلات الـ BOM كمدخل (R) بدون فحص أرصدة المستودعات أو تقييم FIFO' : 'Used as component (R) without warehouse stock validation or FIFO cost'}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-extrabold text-cyan-700 bg-white px-2 py-0.5 rounded border border-cyan-200">
                          ∞ Stockless
                        </span>
                      </label>

                      {/* 1. Skip Ordinary Stock Transfer Checkbox & Source Warehouse */}
                      <div className={`mt-2 p-2.5 rounded-xl border transition ${formData.skipOrdinaryStockTransfer ? 'bg-amber-50 border-amber-300' : 'bg-slate-50/70 border-slate-200'}`}>
                        <label className="flex items-center justify-between cursor-pointer select-none">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(formData.skipOrdinaryStockTransfer)}
                              onChange={(e) => setFormData({ ...formData, skipOrdinaryStockTransfer: e.target.checked })}
                              className="accent-amber-600 h-4 w-4 rounded"
                            />
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">
                                {isAr ? 'استبعاد من التحويل المخزني العادي (تحويل عبر المواسير / تانكات)' : 'Skip Ordinary Stock Transfer (Piped / Bulk Tank)'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-normal">
                                {isAr ? 'يتم استبعاد الصنف من أذون التحويل العادية، وتصنيعه وضخه مباشرة عبر خطوط الأنابيب' : 'Excludes item from casual transfers and handles via liquid tanks'}
                              </span>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] font-bold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                            Piped M-Item
                          </span>
                        </label>

                        {formData.skipOrdinaryStockTransfer && (
                          <div className="mt-2 pt-2 border-t border-amber-200 flex items-center gap-2">
                            <span className="text-[11px] font-bold text-amber-950 shrink-0">
                              {isAr ? 'مخزن سحب الخامات (المصدر): *' : 'Raw Materials Source WH: *'}
                            </span>
                            <select
                              value={formData.rawMaterialSourceWh}
                              onChange={(e) => setFormData({ ...formData, rawMaterialSourceWh: e.target.value })}
                              className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                              required={formData.skipOrdinaryStockTransfer}
                            >
                              <option value="">{isAr ? '-- اختر مخزن سحب الخامات --' : '-- Select Source WH --'}</option>
                              {warehousesList.map((w) => (
                                <option key={w.id || w.code} value={w.id || w.code}>
                                  {w.code ? `${w.code} - ` : ''}{isAr ? w.nameAr : w.nameEn || w.nameAr}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* 2. Needs QA Checkbox */}
                      <label className={`mt-2 flex items-center justify-between p-2 rounded-xl border transition cursor-pointer select-none ${formData.needsQA ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold shadow-2xs' : 'bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(formData.needsQA)}
                            onChange={(e) => setFormData({ ...formData, needsQA: e.target.checked })}
                            className="accent-indigo-600 h-4 w-4 rounded"
                          />
                          <div className="text-start">
                            <span className="text-xs block">
                              {isAr ? 'يتطلب فحص وتحليل معملي (QA) وتتبع بسيريال التانك' : 'Requires QA Lab Analysis & Serial Tracking'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {isAr ? 'يلزم تسجيل واعتماد نتائج التحليل الكيميائي/الفيزيائي قبل السماح بضخ التانك لصالة الإنتاج' : 'Mandatory lab verification before pump release'}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] font-extrabold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                          QA Gated
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* 2. Nomenclature & Master Names */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '٢- بيانات التوصيف والتسمية الأساسية' : '2. Nomenclature & Item Names'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'اسم الخامة (بالعربية) *' : 'Arabic Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={isAr ? 'مثال: زجاجة بولي إيثيلين 1 لتر' : 'e.g. 1L HDPE Bottle'}
                        value={formData.nameAr}
                        onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'اسم الخامة (بالإنجليزية)' : 'English Name'}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1L HDPE Bottle"
                        value={formData.nameEn}
                        onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'الاسم المختصر (Short Name)' : 'Short Convention Name'}
                      </label>
                      <input
                        type="text"
                        placeholder={isAr ? 'مثال: زجاجة 1 لتر' : 'e.g. 1L Bottle'}
                        value={formData.shortName}
                        onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Units of Measure */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '٣- وحدات القياس الافتراضية للخامة' : '3. Master Units of Measure'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <label className="block text-xs font-bold text-slate-800">
                        {isAr ? 'الوحدة الصغرى (وحدة الخصم والمعادلات) *' : 'Default Small Unit *'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={isAr ? 'مثال: عبوة / كجم / لتر / قطعة' : 'e.g. Piece / Kg / Liter'}
                        value={formData.smallUnit}
                        onChange={(e) => handleParentSmallUnitChange(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                      />
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <label className="block text-xs font-bold text-slate-800">
                        {isAr ? 'اسم الوحدة الكبرى الافتراضية (وحدة التوريد والتعبئة) *' : 'Default Large Unit Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={isAr ? 'مثال: كرتونة / شيكارة / برميل / تانك' : 'e.g. Carton / Bag / Drum'}
                        value={formData.largeUnitName}
                        onChange={(e) => handleParentLargeUnitChange(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Taxes & Reorder */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? '٤- الضرائب وحد إعادة الطلب' : '4. Taxes & Inventory Threshold'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'ضريبة القيمة المضافة (VAT)' : 'VAT Rate'}
                      </label>
                      <select
                        value={formData.vatRate}
                        onChange={(e) => setFormData({ ...formData, vatRate: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                      >
                        <option value="14%">14% (خاضع للضريبة)</option>
                        <option value="0%">0% (معفى)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'ضريبة الخصم والإضافة (WHT)' : 'WHT Rate'}
                      </label>
                      <select
                        value={formData.whtRate}
                        onChange={(e) => setFormData({ ...formData, whtRate: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                      >
                        <option value="1%">1% (توريد سلع وخامات)</option>
                        <option value="3%">3% (خدمات ومقاولات وتشغيل)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {isAr ? 'حد إعادة الطلب (Reorder Level)' : 'Reorder Alert Level'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder={isAr ? 'مثال: 5000' : 'e.g. 5000'}
                        value={formData.reorderLevel}
                        onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Master Technical Specs Defined in Step 1 */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
                      <span>{isAr ? '٥- المواصفات الفنية الرئيسية المعتمدة للخامة' : '5. Master Technical Specifications'}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddMasterSpec}
                      className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>{isAr ? 'إضافة مواصفة' : 'Add Spec'}</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {masterSpecs.map((spec, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex-1">
                          <input
                            type="text"
                            list="category-spec-suggestions"
                            placeholder={isAr ? 'اسم المواصفة (مثال: الجراماج / العنق)' : 'Spec Label (e.g. Weight / Neck)'}
                            value={spec.label}
                            onChange={(e) => handleMasterSpecChange(index, 'label', e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                          />
                        </div>

                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder={isAr ? 'القيمة (مثال: 24 جرام / 28 مم)' : 'Value (e.g. 24g / 28mm)'}
                            value={spec.value}
                            onChange={(e) => handleMasterSpecChange(index, 'value', e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                          />
                        </div>

                        {masterSpecs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMasterSpec(index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'حذف المواصفة' : 'Delete Spec'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step 1 Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>

                  <div className="flex items-center gap-2">
                    {/* Direct Save as Inactive (Skip Step 2) */}
                    <button
                      type="button"
                      onClick={handleSaveAsInactive}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold cursor-pointer border border-slate-300"
                      title={isAr ? 'حفظ البيانات الأساسية بدون تنوعات كخامة غير نشطة' : 'Save as Inactive without variations'}
                    >
                      {isAr ? 'حفظ كخامة موقوفة (تخطي التنوعات)' : 'Save as Inactive (Skip Step 2)'}
                    </button>

                    {/* Proceed to Step 2 */}
                    <button
                      type="submit"
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <span>{isAr ? 'متابعة لتخصيص التنوعات والموردين (الخطوة ٢)' : 'Proceed to Variations (Step 2)'}</span>
                      <ChevronLeft className={`h-4 w-4 ${isAr ? '' : 'rotate-180'}`} />
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* STEP 2: Variations, Packaging Ratio (الشدة) & Suppliers */}
            {modalStep === 2 && (
              <form onSubmit={handleSaveItem} className="space-y-5">
                {/* Summary Banner of Parent Material */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-emerald-950 block text-sm">{formData.nameAr}</span>
                    <span className="text-slate-500">{formData.nameEn || formData.nameAr} • SKU: <b className="font-mono text-slate-800">{activeItemCode || editingItemCode}</b></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-900 bg-white px-2.5 py-1 rounded-md border border-emerald-200 font-semibold">
                      {isAr ? `الوحدات: ${formData.smallUnit} / ${formData.largeUnitName}` : `Units: ${formData.smallUnit} / ${formData.largeUnitName}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalStep(1)}
                      className="px-2.5 py-1 text-emerald-700 hover:bg-emerald-100 rounded-md font-bold transition cursor-pointer"
                    >
                      {isAr ? 'تعديل البيانات الأساسية' : 'Edit Master'}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Boxes className="h-4 w-4 text-emerald-600" />
                        <span>{isAr ? 'تنوعات الخامة والموردين ومعدل التعبئة (الشدة)' : 'Variations, Vendors & Packaging Ratios'}</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isAr ? 'تم استيراد المواصفات الفنية تلقائياً من الخطوة ١. يمكنك تخصيص مورد ومعدل شدة لكل تنوع.' : 'Specs inherited from Step 1. Assign suppliers and packaging ratios.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddVariation}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold cursor-pointer transition shadow-2xs"
                    >
                      <PlusCircle className="h-4 w-4 text-emerald-600" />
                      <span>{isAr ? 'إضافة تنوع جديد' : 'Add Variation'}</span>
                    </button>
                  </div>

                  {variations.length === 0 ? (
                    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>{isAr ? 'لم تتم إضافة أي تنوعات. سيتم حفظ الخامة كـ "غير نشطة".' : 'No variations added. Item will be saved as Inactive.'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddVariation}
                        className="px-3 py-1 bg-amber-600 text-white rounded-md font-bold text-[11px]"
                      >
                        {isAr ? 'إضافة تنوع الآن' : 'Add Variation Now'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {variations.map((variant, vIdx) => {
                        const parentCode = activeItemCode || editingItemCode || `${getPrefix()}-${getNextNumber(selectedCatId)}`;
                        const variantCode = `${parentCode}-${variant.suffix}`;

                        return (
                          <div key={vIdx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative shadow-2xs">
                            {/* Variation Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-slate-800 bg-white border border-slate-300 px-2.5 py-0.5 rounded">
                                  {variantCode}
                                </span>
                                <span className="text-xs font-bold text-emerald-900">
                                  {isAr ? `تنوع (${variant.suffix})` : `Variation (${variant.suffix})`}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {variations.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveVariation(vIdx)}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                                    title={isAr ? 'حذف هذا التنوع' : 'Remove Variation'}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Variation Fields: Supplier, Packaging Ratio, Units */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs">
                              {/* Designated Supplier / In-House Searchable Select */}
                              <div className="sm:col-span-5">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  {isAr ? (flags.M ? 'جهة التوريد / التشغيل *' : 'المورد المعتمد للتنوع *') : (flags.M ? 'Source / Supplier *' : 'Designated Supplier *')}
                                </label>
                                <SearchableSelect
                                  value={variant.supplierId}
                                  onChange={(val) => handleVariationChange(vIdx, 'supplierId', val)}
                                  options={[
                                    ...(flags.M
                                      ? [
                                          {
                                            value: 'IN_HOUSE',
                                            label: isAr ? '🏭 تشغيل / إنتاج داخلي' : '🏭 In-House Production',
                                            sublabel: 'IN-HOUSE',
                                          },
                                        ]
                                      : []),
                                    ...suppliersList.map((sup) => ({
                                      value: sup.id,
                                      label: sup.name,
                                      sublabel: sup.id,
                                    })),
                                  ]}
                                  placeholder={isAr ? (flags.M ? '-- اختر جهة التشغيل / المورد --' : '-- اختر المورد المعتمد --') : '-- Select Supplier --'}
                                  isAr={isAr}
                                  required
                                />
                              </div>

                              {/* Packaging Conversion Factor (الشدة) */}
                              <div className="sm:col-span-3">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  {isAr ? 'معدل التعبئة (الشدة) *' : 'Packaging Ratio (الشدة) *'}
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  required
                                  placeholder="0"
                                  value={variant.packagingRatio}
                                  onChange={(e) => handleVariationChange(vIdx, 'packagingRatio', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-center"
                                />
                              </div>

                              {/* Editable Small Unit */}
                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  {isAr ? 'الوحدة الصغرى' : 'Small Unit'}
                                </label>
                                <input
                                  type="text"
                                  placeholder={formData.smallUnit || (isAr ? 'عبوة' : 'Piece')}
                                  value={variant.smallUnit}
                                  onChange={(e) => handleVariationChange(vIdx, 'smallUnit', e.target.value)}
                                  className="w-full p-2 border border-slate-300 rounded-lg bg-white text-center font-medium"
                                />
                              </div>

                              {/* Editable Large Unit Name */}
                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  {isAr ? 'الوحدة الكبرى' : 'Large Unit'}
                                </label>
                                <input
                                  type="text"
                                  placeholder={formData.largeUnitName || (isAr ? 'كرتونة' : 'Carton')}
                                  value={variant.largeUnitName}
                                  onChange={(e) => handleVariationChange(vIdx, 'largeUnitName', e.target.value)}
                                  className="w-full p-2 border border-slate-300 rounded-lg bg-white text-center font-medium"
                                />
                              </div>
                            </div>

{/* Optional Variant Image Upload (With Optional Smart Compression) */}
                            <div className="p-2.5 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {variant.imageFile ? (
                                  <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-300 shadow-2xs flex items-center justify-center p-0.5 overflow-hidden shrink-0">
                                    <img
                                      src={variant.imageFile}
                                      alt="Variant"
                                      onClick={() => setImagePreviewModal({
                                        url: variant.imageFile,
                                        title: `${formData.nameAr || ''} - (${variant.suffix})`,
                                        subtitle: variant.variantCode || `${activeItemCode || editingItemCode}-${variant.suffix}`
                                      })}
                                      className="w-full h-full object-contain cursor-pointer hover:scale-110 transition duration-150"
                                      title={isAr ? 'انقر لمعاينة الصورة' : 'Click to preview image'}
                                    />
                                  </div>
                                ) : (
                                  <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                    <Package className="h-5 w-5" />
                                  </div>
                                )}
                                <div>
                                  <span className="text-[11px] font-bold text-slate-700 block">
                                    {isAr ? 'صورة توضيحية للتنوع (اختياري):' : 'Variant Image (Optional):'}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {variant.imageFile ? (isAr ? 'تم إرفاق الصورة' : 'Image Attached') : (isAr ? 'JPG / PNG' : 'JPG / PNG')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                {variant.imageFile ? (
                                  <button
                                    type="button"
                                    onClick={() => handleVariationChange(vIdx, 'imageFile', '')}
                                    className="px-2.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition cursor-pointer"
                                  >
                                    {isAr ? 'إزالة الصورة' : 'Remove'}
                                  </button>
                                ) : (
                                  <label className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs">
                                    <UploadCloud className="h-3.5 w-3.5" />
                                    <span>{isAr ? 'رفع صورة التنوع' : 'Upload Image'}</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try {
                                          const compressed = await compressImage(file);
                                          handleVariationChange(vIdx, 'imageFile', compressed);
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

                            {/* Live Packaging Ratio Indicator */}
                            <div className="text-[11px] text-slate-500 bg-white/80 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                              <span>
                                {isAr
                                  ? `📦 معادلة التعبئة: 1 ${variant.largeUnitName || formData.largeUnitName} = ${variant.packagingRatio || 1} ${variant.smallUnit || formData.smallUnit}`
                                  : `📦 Ratio: 1 ${variant.largeUnitName || formData.largeUnitName} = ${variant.packagingRatio || 1} ${variant.smallUnit || formData.smallUnit}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddVariantSpec(vIdx)}
                                className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <PlusCircle className="h-3 w-3" />
                                <span>{isAr ? 'إضافة خاصية فنية للتنوع' : 'Add Variant Spec'}</span>
                              </button>
                            </div>

                            {/* In-Flow Opening Stock / Initial Balance Card (Phase 4) */}
                            <div className="p-3 bg-emerald-50/50 border border-emerald-300/80 rounded-xl space-y-2 text-xs">
                              <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5">
                                <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                                  <Boxes className="h-3.5 w-3.5 text-emerald-700" />
                                  <span>{isAr ? 'تسجيل رصيد افتتاحي أولي للتنوع (Opening Balance - اختياري):' : 'Initial Opening Balance (Optional):'}</span>
                                </span>
                                <span className="text-[10px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                                  OB FIFO Ingest
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                    {isAr ? 'المستودع المستلم:' : 'Target Warehouse:'}
                                  </label>
                                  <select
                                    value={variant.openingWarehouse || ''}
                                    onChange={(e) => handleVariationChange(vIdx, 'openingWarehouse', e.target.value)}
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
                                    {isAr ? `الكمية بالوحدة الصغرى (${variant.smallUnit || formData.smallUnit}):` : `Qty (${variant.smallUnit || formData.smallUnit}):`}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={variant.openingQtySmall || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                      const ratio = Number(variant.packagingRatio || 1);
                                      const updated = [...variations];
                                      updated[vIdx].openingQtySmall = val;
                                      updated[vIdx].openingQtyLarge = val === '' ? '' : Number((val / ratio).toFixed(2));
                                      setVariations(updated);
                                    }}
                                    className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900 text-xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                    {isAr ? `الكمية بالوحدة الكبرى (${variant.largeUnitName || formData.largeUnitName}):` : `Large Qty:`}
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0"
                                    value={variant.openingQtyLarge || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                      const ratio = Number(variant.packagingRatio || 1);
                                      const updated = [...variations];
                                      updated[vIdx].openingQtyLarge = val;
                                      updated[vIdx].openingQtySmall = val === '' ? '' : Math.round(val * ratio);
                                      setVariations(updated);
                                    }}
                                    className="w-full p-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900 text-xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                                    {isAr ? 'تكلفة الوحدة بالجنيه (EGP) *:' : 'Unit Cost (EGP) *: '}
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={variant.openingUnitCost || ''}
                                    onChange={(e) => handleVariationChange(vIdx, 'openingUnitCost', e.target.value)}
                                    className={`w-full p-1.5 border rounded-lg bg-white font-mono font-bold text-xs ${
                                      Number(variant.openingQtySmall) > 0 && (!variant.openingUnitCost || Number(variant.openingUnitCost) < 0)
                                        ? 'border-amber-500 bg-amber-50/50 text-amber-900'
                                        : 'border-slate-300 text-emerald-800'
                                    }`}
                                  />
                                </div>
                              </div>

                              {/* Optional Batch & Expiry */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-emerald-100">
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                                    {isAr ? 'رقم تشغيلة / لوط المورد (اختياري):' : 'Batch / Lot # (Optional):'}
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="e.g. LOT-INIT-01"
                                    value={variant.openingBatchNo || ''}
                                    onChange={(e) => handleVariationChange(vIdx, 'openingBatchNo', e.target.value)}
                                    className="w-full p-1 border border-slate-200 rounded bg-white text-xs font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                                    {isAr ? 'تاريخ الإنتاج (اختياري):' : 'Production Date:'}
                                  </label>
                                  <input
                                    type="date"
                                    value={variant.openingProdDate || ''}
                                    onChange={(e) => handleVariationChange(vIdx, 'openingProdDate', e.target.value)}
                                    className="w-full p-1 border border-slate-200 rounded bg-white text-xs font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                                    {isAr ? 'تاريخ الصلاحية (اختياري):' : 'Expiry Date:'}
                                  </label>
                                  <input
                                    type="date"
                                    value={variant.openingExpDate || ''}
                                    onChange={(e) => handleVariationChange(vIdx, 'openingExpDate', e.target.value)}
                                    className="w-full p-1 border border-slate-200 rounded bg-white text-xs font-mono"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Variation Specs Table */}
                            <div className="space-y-1.5 pt-1">
                              {variant.specs?.map((spec, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200">
                                  <input
                                    type="text"
                                    list="category-spec-suggestions"
                                    placeholder={isAr ? 'اسم الخاصية (مثال: اللون / الجراماج)' : 'Spec Label (e.g. Color / Weight)'}
                                    value={spec.label}
                                    onChange={(e) => handleVariantSpecChange(vIdx, sIdx, 'label', e.target.value)}
                                    className="w-1/2 p-1.5 border border-slate-300 rounded text-xs bg-white font-medium"
                                  />
                                  <input
                                    type="text"
                                    placeholder={isAr ? 'القيمة (مثال: شفاف / 24 جرام)' : 'Value (e.g. Clear / 24g)'}
                                    value={spec.value}
                                    onChange={(e) => handleVariantSpecChange(vIdx, sIdx, 'value', e.target.value)}
                                    className="w-1/2 p-1.5 border border-slate-300 rounded text-xs bg-white font-medium"
                                  />
                                  {variant.specs.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveVariantSpec(vIdx, sIdx)}
                                      className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Step 2 Actions */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalStep(1)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {isAr ? 'رجوع للخطوة ١' : 'Back to Step 1'}
                  </button>

                  <button
                    type="submit"
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-xs"
                  >
                    {isAr ? 'حفظ التنوعات وإنهاء' : 'Save Variations & Finish'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DYNAMIC CATEGORY MANAGEMENT MODAL (GENERAL ADMIN ONLY) */}
      {showCategoryModal && isGeneralAdmin && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-slate-100 text-slate-800 rounded-xl">
                  <FolderCog className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {isAr ? 'إدارة تصنيفات الخامات ومجموعات التكويد' : 'Master Categories Management'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'تعديل أسماء المجموعات وسلسلة الأرقام أو إضافة تصنيفات جديدة سحابياً' : 'Edit category names, series numbers, or add new groups'}
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

            {/* Categories Live Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-60 overflow-y-auto text-xs">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-2.5 text-center w-12">#</th>
                    <th className="p-2.5 text-start">{isAr ? 'اسم التصنيف (عربي)' : 'Name (Arabic)'}</th>
                    <th className="p-2.5 text-start">{isAr ? 'اسم التصنيف (إنجليزي)' : 'Name (English)'}</th>
                    <th className="p-2.5 text-center">{isAr ? 'سلسلة التكويد' : 'Base Series'}</th>
                    <th className="p-2.5 text-center w-20">{isAr ? 'إجراء' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-2.5 text-center font-mono font-bold text-slate-500">{cat.id}</td>
                      <td className="p-2.5 font-bold text-slate-900">{cat.nameAr}</td>
                      <td className="p-2.5 text-slate-500">{cat.nameEn || '—'}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-indigo-700 bg-indigo-50/40">
                        {cat.base} Series
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditCategory(cat)}
                            className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer"
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
            <form onSubmit={handleSaveCategory} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-bold text-slate-800">
                  {editingCatId 
                    ? (isAr ? `تعديل التصنيف رقم (${editingCatId})` : `Edit Category #${editingCatId}`) 
                    : (isAr ? 'إضافة تصنيف جديد' : 'Add New Category')}
                </span>
                {editingCatId && (
                  <button
                    type="button"
                    onClick={handleStartAddCategory}
                    className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    {isAr ? '+ إنشاء تصنيف جديد بدلاً من ذلك' : '+ Create new instead'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    {isAr ? 'رقم المعرف (ID) *' : 'Category ID *'}
                  </label>
                  <input
                    type="number"
                    required
                    disabled={Boolean(editingCatId)}
                    value={catFormData.id}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCatFormData({ ...catFormData, id: val, base: Number(val) * 100 });
                    }}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    {isAr ? 'سلسلة التكويد (Base) *' : 'Base Series *'}
                  </label>
                  <input
                    type="number"
                    required
                    step="100"
                    value={catFormData.base}
                    onChange={(e) => setCatFormData({ ...catFormData, base: e.target.value })}
                    placeholder="e.g. 1000"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-indigo-700"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    {isAr ? 'اسم التصنيف بالعربية *' : 'Arabic Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={catFormData.nameAr}
                    onChange={(e) => setCatFormData({ ...catFormData, nameAr: e.target.value })}
                    placeholder={isAr ? 'مثال: ١٠- استيكر حراري' : 'e.g. 10- Thermal Stickers'}
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
                  placeholder="e.g. 10- Thermal Stickers"
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingCategory ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>{editingCatId ? (isAr ? 'حفظ التعديل السحابي' : 'Update Category') : (isAr ? 'إضافة وحفظ التصنيف' : 'Save New Category')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Resolution Image Lightbox Popover */}
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
                  <span className="text-[11px] font-mono text-emerald-700 font-bold block mt-0.5">
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