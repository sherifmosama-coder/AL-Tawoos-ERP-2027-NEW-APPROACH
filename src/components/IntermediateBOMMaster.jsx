import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  Plus,
  Search,
  Factory,
  Layers,
  Boxes,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  X,
  PlusCircle,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Building2,
  Sparkles,
  Lock,
  History,
  User,
  CheckCheck,
  SlidersHorizontal,
  Save,
  Package,
  Info
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import PeacockLoader from './PeacockLoader';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

export default function IntermediateBOMMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('intermediate_bom'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('intermediate_bom'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#d97706';
  const { r, g, b } = hexToRgb(tabColor);

  // Dynamic Authority Resolvers
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['intermediate_bom.canCreate'] !== undefined
      ? permissions.actions['intermediate_bom.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['intermediate_bom.canEdit'] !== undefined
      ? permissions.actions['intermediate_bom.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['intermediate_bom.canDelete'] !== undefined
      ? permissions.actions['intermediate_bom.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

  // Cloud State
  const [recipes, setRecipes] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [targetItemFilter, setTargetItemFilter] = useState('all');
  const [validityFilter, setValidityFilter] = useState('all');

  // Expandable Rows & Breakdown Editor State
  const [expandedRecipes, setExpandedRecipes] = useState({});
  const [expandedSubTabs, setExpandedSubTabs] = useState({}); // { [code]: 'breakdown' | 'audit' }
  const [breakdownEdits, setBreakdownEdits] = useState({});

  // Modal State (Create / Clone)
  const [showModal, setShowModal] = useState(false);
  const [editingRecipeCode, setEditingRecipeCode] = useState(null);

  // Form State for Modal
  const initialFormState = {
    code: '',
    prepCode: '100', // Mandatory & Unique per M-item
    needsQA: true, // Toggle: Requires laboratory QA analysis
    needsTankSerial: true, // Toggle: Requires tank serial numbering
    nameAr: '',
    nameEn: '',
    targetItemId: '',
    targetVariantSuffix: '',
    targetVariantCode: '',
    batchYieldQty: 200,
    yieldUnit: 'لتر',
    validityType: 'open',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: '',
    status: 'active',
    components: [
      {
        id: 'comp_1',
        itemId: '',
        itemSelectionMode: 'parent_generic',
        variantCode: null,
        variantPolicy: null,
        materialNameAr: '',
        standardQty: 100,
        unit: 'كجم',
        instructionsAr: '',
      }
    ]
  };

  const [formData, setFormData] = useState(initialFormState);

  // Edit Existing Recipe via Full Modal
  const handleOpenEdit = (recipe) => {
    setEditingRecipeCode(recipe.code);
    setFormData({
      id: recipe.code,
      code: recipe.code,
      prepCode: recipe.prepCode || '100',
      needsQA: recipe.needsQA !== false,
      needsTankSerial: recipe.needsTankSerial !== false,
      nameAr: recipe.nameAr || '',
      nameEn: recipe.nameEn || '',
      targetItemId: recipe.targetItemId || '',
      targetVariantSuffix: recipe.targetVariantSuffix || '',
      targetVariantCode: recipe.targetVariantCode || '',
      batchYieldQty: Number(recipe.batchYieldQty) || 200,
      yieldUnit: recipe.yieldUnit || 'لتر',
      validityType: recipe.validityType || 'open',
      startDate: recipe.startDate || new Date().toISOString().split('T')[0],
      endDate: recipe.endDate || '',
      notes: recipe.notes || '',
      status: recipe.status || 'active',
      components: Array.isArray(recipe.components) && recipe.components.length > 0
        ? recipe.components.map((c, i) => ({
            id: c.id || `comp_${Date.now()}_${i + 1}`,
            itemId: c.itemId || '',
            itemSelectionMode: c.itemSelectionMode || 'parent_generic',
            variantCode: c.variantCode || null,
            variantPolicy: c.variantPolicy || null,
            materialNameAr: c.materialNameAr || '',
            standardQty: Number(c.standardQty) || 0,
            unit: c.unit || 'كجم',
            instructionsAr: c.instructionsAr || '',
            specs: c.specs || '',
          }))
        : [
            {
              id: `comp_${Date.now()}_1`,
              itemId: rIngredientItems[0]?.code || '',
              itemSelectionMode: 'parent_generic',
              variantCode: null,
              variantPolicy: null,
              materialNameAr: rIngredientItems[0]?.nameAr || '',
              standardQty: 100,
              unit: rIngredientItems[0]?.smallUnit || 'كجم',
              instructionsAr: '',
            }
          ]
    });
    setShowModal(true);
  };

  // 1. Subscribe to Firestore Collections
  useEffect(() => {
    // Intermediate recipes collection
    const unsubRecipes = onSnapshot(collection(db, 'intermediate_recipes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      setRecipes(list);
      setLoading(false);
    });

    // Items list from Item Master
    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      setItemsList(list);
    });

    return () => {
      unsubRecipes();
      unsubItems();
    };
  }, []);

  // Filter Target "M" Items (Items made/processed in-house)
  const mTargetItems = useMemo(() => {
    return itemsList
      .filter((item) => {
        const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
        return flagsArr.some((f) => String(f).toUpperCase().includes('M'));
      })
      .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  }, [itemsList]);

  // Filter Eligible "R" Raw Ingredients (Items used as raw inputs to manufacture M items)
  const rIngredientItems = useMemo(() => {
    return itemsList
      .filter((item) => {
        const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
        return flagsArr.some((f) => String(f).toUpperCase().includes('R'));
      })
      .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  }, [itemsList]);

  // KPI Metrics: Recipe coverage of M-items
  const coverageMetrics = useMemo(() => {
    const totalM = mTargetItems.length;
    const configuredCodes = new Set(recipes.map((r) => r.targetItemId));
    const configuredCount = mTargetItems.filter((i) => configuredCodes.has(i.code)).length;
    const percent = totalM > 0 ? Math.round((configuredCount / totalM) * 100) : 0;
    return { totalM, configuredCount, percent, totalRecipes: recipes.length };
  }, [mTargetItems, recipes]);

  // Helper: Validity Evaluator
  const getValidityStatus = (recipe) => {
    if (recipe.status === 'archived' || recipe.status === 'inactive') {
      return { status: 'inactive', labelAr: 'معطلة / مؤرشفة', labelEn: 'Inactive', color: 'slate' };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const start = recipe.startDate || '1970-01-01';
    const end = recipe.endDate || null;

    if (start > todayStr) {
      return { status: 'upcoming', labelAr: 'تبدأ مستقبلاً', labelEn: 'Upcoming', color: 'indigo' };
    }

    if (recipe.validityType === 'custom_range' && end && end < todayStr) {
      return { status: 'expired', labelAr: 'منتهية الصلاحية', labelEn: 'Expired', color: 'rose' };
    }

    return { status: 'active', labelAr: 'سارية ومتاحة للتشغيل', labelEn: 'Active & Valid', color: 'emerald' };
  };

  // Generate Next Recipe Code with Collision-Proof Version Scanner
  const generateNextRecipeCode = (mCode) => {
    if (!mCode) return { code: 'IBOM-M101-V1', versionNum: 1 };
    const cleanCode = mCode.replace(/[^A-Za-z0-9]/g, '');
    const allExistingCodes = recipes.map((r) => (r.code || r.id || '').toUpperCase());

    let versionNum = 1;
    let candidateCode = `IBOM-${cleanCode}-V${versionNum}`;

    // Scan until an unused recipe code is found
    while (allExistingCodes.includes(candidateCode.toUpperCase())) {
      versionNum++;
      candidateCode = `IBOM-${cleanCode}-V${versionNum}`;
    }

    return { code: candidateCode, versionNum };
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    const defaultM = mTargetItems[0];
    const defaultMCode = defaultM?.code || '';
    const inHouseVariants = (defaultM?.variations || []).filter(
      (v) => v.supplierId === 'IN_HOUSE' || v.supplierName === 'إنتاج داخلي' || v.supplierName === 'In-House Production'
    );
    const defaultVariant = inHouseVariants[0] || defaultM?.variations?.[0] || null;
    const defaultSuffix = defaultVariant?.suffix || '';
    const defaultVarCode = defaultSuffix ? `${defaultMCode}-${defaultSuffix}` : '';
    const { code: nextCode, versionNum } = generateNextRecipeCode(defaultMCode);

    setEditingRecipeCode(null);
    setFormData({
      ...initialFormState,
      code: nextCode,
      targetItemId: defaultMCode,
      targetVariantSuffix: defaultSuffix,
      targetVariantCode: defaultVarCode,
      batchYieldQty: 1000,
      yieldUnit: defaultM?.smallUnit || 'لتر',
      nameAr: defaultM ? `تركيبة تصنيع ${defaultM.nameAr}${defaultSuffix ? ` [${defaultSuffix}]` : ''} - إصدار V${versionNum}` : '',
      nameEn: defaultM ? `${defaultM.nameEn || defaultM.nameAr}${defaultSuffix ? ` [${defaultSuffix}]` : ''} Manufacturing Formula V${versionNum}` : '',
      components: [
        {
          id: `comp_${Date.now()}_1`,
          itemId: rIngredientItems[0]?.code || '',
          itemSelectionMode: 'parent_generic',
          variantCode: null,
          variantPolicy: null,
          materialNameAr: rIngredientItems[0]?.nameAr || '',
          standardQty: 500,
          unit: rIngredientItems[0]?.smallUnit || 'كجم',
          instructionsAr: '',
        }
      ]
    });
    setShowModal(true);
  };

  // Open Clone Modal (Appends unique V2, V3, V4... without overwriting)
  const handleCloneRecipe = (recipe) => {
    const { code: nextCode, versionNum } = generateNextRecipeCode(recipe.targetItemId);
    setEditingRecipeCode(null);

    // Clean previous version strings to prevent stacked "(إصدار V2) (إصدار V3)" names
    const cleanNameAr = (recipe.nameAr || '')
      .replace(/\s*\(إصدار.*?\)\s*/g, '')
      .replace(/\s*\(نسخة.*?\)\s*/g, '')
      .replace(/\s*\(بديل.*?\)\s*/g, '')
      .trim();

    const cleanNameEn = (recipe.nameEn || recipe.nameAr || '')
      .replace(/\s*\(Clone.*?\)\s*/gi, '')
      .replace(/\s*\(V\d+.*?\)\s*/gi, '')
      .replace(/\s*\(Alternative.*?\)\s*/gi, '')
      .trim();

    setFormData({
      ...recipe,
      id: nextCode,
      code: nextCode,
      prepCode: `${recipe.prepCode || '100'}-V${versionNum}`,
      needsQA: recipe.needsQA !== false,
      needsTankSerial: recipe.needsTankSerial !== false,
      nameAr: `${cleanNameAr} (إصدار V${versionNum})`,
      nameEn: `${cleanNameEn} (V${versionNum})`,
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      components: (recipe.components || []).map((c, i) => ({
        ...c,
        id: `comp_${Date.now()}_${i + 1}`,
      })),
    });
    setShowModal(true);
  };

  // Delete Recipe
  const handleDeleteRecipe = async (code, name) => {
    if (!canDelete) {
      alert(isAr ? 'ليس لديك صلاحية حذف التركيبات الوسيطة.' : 'Permission denied to delete intermediate recipes.');
      return;
    }

    if (window.confirm(isAr ? `هل أنت متأكد من حذف تركيبة التصنيع (${name}) نهائياً؟` : `Delete intermediate formula (${name})?`)) {
      try {
        await deleteDoc(doc(db, 'intermediate_recipes', code));
      } catch (err) {
        console.error('Error deleting intermediate recipe:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف التركيبة.' : 'Error deleting formula.');
      }
    }
  };

  // Target M-Item and In-House Variant Change Handlers
  const handleTargetItemChange = (mCode) => {
    const item = mTargetItems.find((i) => i.code === mCode);
    const inHouseVariants = (item?.variations || []).filter(
      (v) => v.supplierId === 'IN_HOUSE' || v.supplierName === 'إنتاج داخلي' || v.supplierName === 'In-House Production'
    );
    const targetVar = inHouseVariants[0] || item?.variations?.[0] || null;
    const vSuffix = targetVar?.suffix || '';
    const vCode = vSuffix ? `${mCode}-${vSuffix}` : '';
    const { code: nextCode, versionNum } = generateNextRecipeCode(mCode);

    setFormData({
      ...formData,
      targetItemId: mCode,
      targetVariantSuffix: vSuffix,
      targetVariantCode: vCode,
      code: editingRecipeCode ? formData.code : nextCode,
      yieldUnit: item?.smallUnit || 'لتر',
      nameAr: item ? `تركيبة تصنيع ${item.nameAr}${vSuffix ? ` [${vSuffix}]` : ''} - إصدار V${versionNum}` : '',
      nameEn: item ? `${item.nameEn || item.nameAr}${vSuffix ? ` [${vSuffix}]` : ''} Formula V${versionNum}` : '',
    });
  };

  const handleTargetVariantChange = (suffix) => {
    const item = mTargetItems.find((i) => i.code === formData.targetItemId);
    const vCode = suffix ? `${formData.targetItemId}-${suffix}` : '';

    setFormData({
      ...formData,
      targetVariantSuffix: suffix,
      targetVariantCode: vCode,
      nameAr: item ? `تركيبة تصنيع ${item.nameAr}${suffix ? ` [${suffix}]` : ''}` : formData.nameAr,
    });
  };

  // Component Builder in Modal
  const handleModalAddComponent = () => {
    const defaultR = rIngredientItems[0] || {};
    setFormData({
      ...formData,
      components: [
        ...formData.components,
        {
          id: `comp_${Date.now()}_${formData.components.length + 1}`,
          itemId: defaultR.code || '',
          itemSelectionMode: 'parent_generic',
          variantCode: null,
          variantPolicy: null,
          materialNameAr: defaultR.nameAr || '',
          standardQty: 100,
          unit: defaultR.smallUnit || 'كجم',
          instructionsAr: '',
        }
      ]
    });
  };

  const handleModalRemoveComponent = (idx) => {
    if (formData.components.length === 1) return;
    setFormData({
      ...formData,
      components: formData.components.filter((_, i) => i !== idx)
    });
  };

  const handleModalComponentChange = (idx, field, value) => {
    const updated = [...formData.components];
    updated[idx][field] = value;

    if (field === 'itemId') {
      const rawItem = rIngredientItems.find((r) => r.code === value);
      updated[idx].materialNameAr = rawItem?.nameAr || value;
      updated[idx].unit = rawItem?.smallUnit || 'كجم';
      updated[idx].itemSelectionMode = 'parent_generic';
      updated[idx].variantCode = null;
      updated[idx].variantPolicy = null;
    }

    if (field === 'variantCode') {
      if (!value) {
        updated[idx].itemSelectionMode = 'parent_generic';
        updated[idx].variantCode = null;
        updated[idx].variantPolicy = null;
      } else {
        updated[idx].itemSelectionMode = 'variant_specific';
        updated[idx].variantCode = value;
        if (!updated[idx].variantPolicy) updated[idx].variantPolicy = 'preferred';
      }
    }

    setFormData({ ...formData, components: updated });
  };

  // Save Modal Form (Create / Update)
  const handleSaveModalRecipe = async (e) => {
    e.preventDefault();

    if (!canCreate && !editingRecipeCode) {
      alert(isAr ? 'ليس لديك صلاحية إنشاء تركيبات.' : 'Permission denied to create recipes.');
      return;
    }

    if (!formData.targetItemId) {
      alert(isAr ? 'يرجى اختيار الخامة الوسيطة المصنعة (Flag M).' : 'Please select target M item.');
      return;
    }

    const cleanPrepCode = (formData.prepCode || '').trim();
    if (!cleanPrepCode) {
      alert(isAr ? 'يرجى إدخال كود طريقة التحضير (حقل إلزامي).' : 'Preparation code is mandatory.');
      return;
    }

    // Verify Prep Code Uniqueness per Target M-Item
    const isDuplicatePrep = recipes.some((r) => 
      r.targetItemId === formData.targetItemId &&
      (r.prepCode || '').trim().toLowerCase() === cleanPrepCode.toLowerCase() &&
      r.code !== (editingRecipeCode || formData.code)
    );

    if (isDuplicatePrep) {
      alert(
        isAr 
          ? `كود التحضير (${cleanPrepCode}) مسجل مسبقاً لنفس الخامة الوسيطة. يرجى استخدام كود تحضير فريد.` 
          : `Preparation code (${cleanPrepCode}) already exists for this material.`
      );
      return;
    }

    if (!formData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم التركيبة بالعربية.' : 'Please enter recipe name.');
      return;
    }

    if (Number(formData.batchYieldQty) <= 0) {
      alert(isAr ? 'حجم التشغيلة يجب أن يكون أكبر من الصفر.' : 'Batch yield must be greater than zero.');
      return;
    }

    if (formData.validityType === 'custom_range' && !formData.endDate) {
      alert(isAr ? 'تاريخ انتهاء السريان إلزامي للفترات المحددة.' : 'End date is required for custom range.');
      return;
    }

    for (let i = 0; i < formData.components.length; i++) {
      const c = formData.components[i];
      if (!c.itemId) {
        alert(isAr ? `يرجى اختيار الخامة للسطر رقم (${i + 1}).` : `Select material for line (${i + 1}).`);
        return;
      }
      if (Number(c.standardQty) <= 0 || isNaN(Number(c.standardQty))) {
        alert(isAr ? `الكمية للسطر (${i + 1}) يجب أن تكون أكبر من الصفر.` : `Quantity in line (${i + 1}) must be > 0.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const targetMItem = mTargetItems.find((i) => i.code === formData.targetItemId);
      const recipeCode = formData.code.trim().toUpperCase();

      const userName = isAr
        ? currentUser?.nameAr || currentUser?.name || currentUser?.email || 'مستخدم'
        : currentUser?.name || currentUser?.nameAr || currentUser?.email || 'User';

      const now = new Date();
      const timestampFormatted = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      const sanitizedComponents = formData.components.map((comp) => {
        const rawItem = rIngredientItems.find((r) => r.code === comp.itemId);
        const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
        const rawVariant = (rawItem?.variations || []).find(
          (v) => v.variantCode === `${comp.itemId}-${cleanSuffix}` || v.suffix === cleanSuffix
        );

        let specsText = '';
        if (cleanSuffix && rawVariant) {
          specsText = (rawVariant.specs || []).map((s) => `${s.label}: ${s.value}`).join(' | ') || rawVariant.mergedSpecs || '';
        } else if (rawItem) {
          specsText = (rawItem.masterSpecs || []).map((s) => `${s.label}: ${s.value}`).join(' | ') || rawItem.mergedSpecs || '';
        }

        return {
          itemId: comp.itemId,
          itemSelectionMode: cleanSuffix ? 'variant_specific' : 'parent_generic',
          variantCode: cleanSuffix ? `${comp.itemId}-${cleanSuffix}` : null,
          variantPolicy: cleanSuffix ? (comp.variantPolicy === 'mandatory' ? 'mandatory' : 'preferred') : null,
          materialNameAr: rawItem?.nameAr || comp.itemId,
          standardQty: Number(comp.standardQty) || 0,
          unit: comp.unit || rawItem?.smallUnit || 'كجم',
          instructionsAr: comp.instructionsAr || '',
          specs: specsText,
        };
      });

      const auditEntry = {
        id: `AUD-${Date.now()}`,
        action: editingRecipeCode ? 'updated' : 'created',
        actionLabelAr: editingRecipeCode ? 'تعديل التركيبة' : 'إنشاء تركيبة وسيطة',
        actionLabelEn: editingRecipeCode ? 'Recipe Updated' : 'Recipe Created',
        timestamp: timestampFormatted,
        user: userName,
        userEmail: currentUser?.email || '',
        summary: `تم حفظ تركيبة إنتاج بحجم (${formData.batchYieldQty} ${formData.yieldUnit}) وعدد (${sanitizedComponents.length}) خامات.`,
      };

      const targetVariantObj = (targetMItem?.variations || []).find(
        (v) => v.suffix === formData.targetVariantSuffix || v.variantCode === formData.targetVariantCode
      );

      const payload = {
        id: recipeCode,
        code: recipeCode,
        prepCode: cleanPrepCode,
        needsQA: Boolean(formData.needsQA),
        needsTankSerial: Boolean(formData.needsTankSerial),
        nameAr: formData.nameAr.trim(),
        nameEn: (formData.nameEn || formData.nameAr).trim(),
        targetItemId: formData.targetItemId,
        targetItemNameAr: targetMItem?.nameAr || formData.targetItemId,
        targetItemNameEn: targetMItem?.nameEn || targetMItem?.nameAr || '',
        targetVariantSuffix: formData.targetVariantSuffix || null,
        targetVariantCode: formData.targetVariantCode || (formData.targetVariantSuffix ? `${formData.targetItemId}-${formData.targetVariantSuffix}` : null),
        targetVariantSpecs: targetVariantObj?.mergedSpecs || '',
        batchYieldQty: Number(formData.batchYieldQty) || 1000,
        yieldUnit: formData.yieldUnit || targetMItem?.smallUnit || 'لتر',
        validityType: formData.validityType,
        startDate: formData.startDate,
        endDate: formData.validityType === 'custom_range' ? formData.endDate || null : null,
        notes: (formData.notes || '').trim(),
        status: 'active',
        componentsCount: sanitizedComponents.length,
        components: sanitizedComponents,
        auditTrail: [auditEntry],
        updatedBy: {
          uid: currentUser?.id || '',
          name: userName,
          email: currentUser?.email || '',
        },
        updatedAt: serverTimestamp(),
      };

      if (!editingRecipeCode) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = {
          uid: currentUser?.id || '',
          name: userName,
          email: currentUser?.email || '',
        };
      }

      await setDoc(doc(db, 'intermediate_recipes', recipeCode), payload, { merge: true });
      setShowModal(false);
    } catch (err) {
      console.error('Error saving intermediate recipe:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التركيبة الوسيطة.' : 'Error saving intermediate formula.');
    } finally {
      setIsSaving(false);
    }
  };

  // ----------------------------------------------------
  // IN-PLACE COMPONENT BREAKDOWN EDITING & AUDIT TRAIL
  // ----------------------------------------------------
  const toggleRecipeExpand = (recipe) => {
    const isNowExpanded = !expandedRecipes[recipe.code];
    setExpandedRecipes((prev) => ({ ...prev, [recipe.code]: isNowExpanded }));

    if (isNowExpanded) {
      if (!expandedSubTabs[recipe.code]) {
        setExpandedSubTabs((prev) => ({ ...prev, [recipe.code]: 'breakdown' }));
      }
      setBreakdownEdits((prev) => ({
        ...prev,
        [recipe.code]: {
          components: JSON.parse(JSON.stringify(recipe.components || [])),
          isModified: false,
          isSaving: false,
        },
      }));
    }
  };

  const handleBreakdownAddComponent = (recipeCode) => {
    const defaultR = rIngredientItems[0] || {};
    setBreakdownEdits((prev) => {
      const current = prev[recipeCode] || { components: [] };
      return {
        ...prev,
        [recipeCode]: {
          ...current,
          isModified: true,
          components: [
            ...current.components,
            {
              itemId: defaultR.code || '',
              itemSelectionMode: 'parent_generic',
              variantCode: null,
              variantPolicy: null,
              materialNameAr: defaultR.nameAr || '',
              standardQty: 100,
              unit: defaultR.smallUnit || 'كجم',
              instructionsAr: '',
              specs: '',
            }
          ]
        }
      };
    });
  };

  const handleBreakdownRemoveComponent = (recipeCode, compIdx) => {
    setBreakdownEdits((prev) => {
      const current = prev[recipeCode] || { components: [] };
      return {
        ...prev,
        [recipeCode]: {
          ...current,
          isModified: true,
          components: current.components.filter((_, idx) => idx !== compIdx)
        }
      };
    });
  };

  const handleBreakdownChangeComponent = (recipeCode, compIdx, field, value) => {
    setBreakdownEdits((prev) => {
      const current = prev[recipeCode] || { components: [] };
      const updatedComps = [...current.components];
      const target = { ...updatedComps[compIdx] };

      target[field] = value;

      if (field === 'itemId') {
        const rawItem = rIngredientItems.find((r) => r.code === value);
        target.materialNameAr = rawItem?.nameAr || value;
        target.unit = rawItem?.smallUnit || 'كجم';
        target.itemSelectionMode = 'parent_generic';
        target.variantCode = null;
        target.variantPolicy = null;
      }

      if (field === 'variantCode') {
        if (!value) {
          target.itemSelectionMode = 'parent_generic';
          target.variantCode = null;
          target.variantPolicy = null;
        } else {
          target.itemSelectionMode = 'variant_specific';
          target.variantCode = value;
          if (!target.variantPolicy) target.variantPolicy = 'preferred';
        }
      }

      updatedComps[compIdx] = target;

      return {
        ...prev,
        [recipeCode]: {
          ...current,
          isModified: true,
          components: updatedComps
        }
      };
    });
  };

  const handleSaveBreakdownChanges = async (recipe) => {
    const editData = breakdownEdits[recipe.code];
    if (!editData) return;

    if (!canEdit) {
      alert(isAr ? 'ليس لديك صلاحية تعديل التركيبات.' : 'Permission denied to edit recipes.');
      return;
    }

    for (let i = 0; i < editData.components.length; i++) {
      const c = editData.components[i];
      if (!c.itemId) {
        alert(isAr ? `يرجى تحديد الخامة للسطر رقم (${i + 1}).` : `Select material for line (${i + 1}).`);
        return;
      }
      if (Number(c.standardQty) <= 0 || isNaN(Number(c.standardQty))) {
        alert(isAr ? `الكمية في السطر (${i + 1}) يجب أن تكون أكبر من صفر.` : `Quantity in line (${i + 1}) must be > 0.`);
        return;
      }
    }

    setBreakdownEdits((prev) => ({
      ...prev,
      [recipe.code]: { ...prev[recipe.code], isSaving: true }
    }));

    try {
      const userName = isAr
        ? currentUser?.nameAr || currentUser?.name || currentUser?.email || 'مستخدم'
        : currentUser?.name || currentUser?.nameAr || currentUser?.email || 'User';

      const now = new Date();
      const timestampFormatted = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      const sanitizedComponents = editData.components.map((comp) => {
        const rawItem = rIngredientItems.find((r) => r.code === comp.itemId);
        const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
        const rawVariant = (rawItem?.variations || []).find(
          (v) => v.variantCode === `${comp.itemId}-${cleanSuffix}` || v.suffix === cleanSuffix
        );

        let specsText = '';
        if (cleanSuffix && rawVariant) {
          specsText = (rawVariant.specs || []).map((s) => `${s.label}: ${s.value}`).join(' | ') || rawVariant.mergedSpecs || '';
        } else if (rawItem) {
          specsText = (rawItem.masterSpecs || []).map((s) => `${s.label}: ${s.value}`).join(' | ') || rawItem.mergedSpecs || '';
        }

        return {
          itemId: comp.itemId,
          itemSelectionMode: cleanSuffix ? 'variant_specific' : 'parent_generic',
          variantCode: cleanSuffix ? `${comp.itemId}-${cleanSuffix}` : null,
          variantPolicy: cleanSuffix ? (comp.variantPolicy === 'mandatory' ? 'mandatory' : 'preferred') : null,
          materialNameAr: rawItem?.nameAr || comp.itemId,
          standardQty: Number(comp.standardQty) || 0,
          unit: comp.unit || rawItem?.smallUnit || 'كجم',
          instructionsAr: comp.instructionsAr || '',
          specs: specsText,
        };
      });

      const auditEntry = {
        id: `AUD-${Date.now()}`,
        action: 'breakdown_edit',
        actionLabelAr: 'تعديل تفصيلي لمكونات التشغيلة',
        actionLabelEn: 'Component Breakdown Edit',
        timestamp: timestampFormatted,
        user: userName,
        userEmail: currentUser?.email || '',
        summary: `تم تعديل مكونات التشغيلة إلى (${sanitizedComponents.length}) خامات بنجاح.`,
      };

      const existingAudit = Array.isArray(recipe.auditTrail) ? recipe.auditTrail : [];
      const updatedAuditTrail = [auditEntry, ...existingAudit].slice(0, 50);

      await setDoc(
        doc(db, 'intermediate_recipes', recipe.code),
        {
          components: sanitizedComponents,
          componentsCount: sanitizedComponents.length,
          auditTrail: updatedAuditTrail,
          updatedBy: {
            uid: currentUser?.id || '',
            name: userName,
            email: currentUser?.email || '',
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setBreakdownEdits((prev) => ({
        ...prev,
        [recipe.code]: {
          components: sanitizedComponents,
          isModified: false,
          isSaving: false,
        },
      }));
    } catch (err) {
      console.error('Error updating intermediate breakdown:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التعديلات.' : 'Error saving changes.');
      setBreakdownEdits((prev) => ({
        ...prev,
        [recipe.code]: { ...prev[recipe.code], isSaving: false }
      }));
    }
  };

  // Multi-Criteria Filtering
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.nameAr?.includes(q) ||
        r.nameEn?.toLowerCase().includes(q) ||
        r.targetItemNameAr?.includes(q) ||
        r.targetItemId?.toLowerCase().includes(q) ||
        r.code?.toLowerCase().includes(q) ||
        r.components?.some((c) => c.materialNameAr?.includes(q) || c.itemId?.toLowerCase().includes(q));

      const matchTarget = targetItemFilter === 'all' || r.targetItemId === targetItemFilter;

      const validity = getValidityStatus(r);
      const matchValidity =
        validityFilter === 'all' ||
        (validityFilter === 'active' && validity.status === 'active') ||
        (validityFilter === 'expired' && validity.status === 'expired') ||
        (validityFilter === 'upcoming' && validity.status === 'upcoming');

      return matchSearch && matchTarget && matchValidity;
    });
  }, [recipes, searchTerm, targetItemFilter, validityFilter]);

  // Options for Target M-Item SearchableSelect
  const targetItemFilterOptions = useMemo(() => {
    const opts = [
      {
        value: 'all',
        label: isAr ? '⚗️ كافة الخامات الوسيطة (Flag M)' : 'All Manufactured Items (M)',
        sublabel: '',
      }
    ];

    mTargetItems.forEach((item) => {
      opts.push({
        value: item.code,
        label: item.nameAr,
        sublabel: item.code,
      });
    });

    return opts;
  }, [mTargetItems, isAr]);

  return (
    <div className="space-y-5 select-none">
      {isSaving && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري حفظ وتوثيق تركيبة الخامة الوسيطة في السحابة...' : 'Saving Intermediate Formula to Cloud...'}
        />
      )}

      {/* Top Header & Launch Action Bar */}
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
              {isAr ? (tabConfig?.labelAr || 'تركيبات وتصنيع الخامات الوسيطة (Intermediate BOM)') : (tabConfig?.labelEn || 'Intermediate Manufacturing BOM')}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'خلط وتصنيع الخامات المصنعة داخلياً (Flag M) من مدخلات الإنتاج (Flag R)' : 'Process formulations for M-items built from R-ingredients'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* M-Items Recipe Coverage KPI */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-50/80 border border-amber-200 rounded-2xl shadow-2xs">
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                <CheckCheck className="h-3.5 w-3.5 text-amber-700" />
                <span>{isAr ? 'تغطية الخامات الوسيطة:' : 'M-Items Coverage:'}</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-amber-950">
                {coverageMetrics.configuredCount} / {coverageMetrics.totalM} {isAr ? 'خامة (M)' : 'M-Items'} ({coverageMetrics.percent}%)
              </span>
            </div>
            <div className="w-12 bg-amber-200 h-2 rounded-full overflow-hidden shrink-0">
              <div
                className="bg-amber-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${coverageMetrics.percent}%` }}
              />
            </div>
          </div>

          {canCreate ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'تعريف تركيبة خامة وسيطة جديدة' : 'New Intermediate Recipe'}</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs items-center">
        <div className="relative lg:col-span-4">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={isAr ? 'بحث بالاسم، الكود، خامات المدخلات...' : 'Search formula name, code, ingredients...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>

        {/* Target M-Item Filter using SearchableSelect */}
        <div className="lg:col-span-5">
          <SearchableSelect
            value={targetItemFilter === 'all' ? '' : targetItemFilter}
            onChange={(val) => setTargetItemFilter(val || 'all')}
            options={targetItemFilterOptions}
            placeholder={isAr ? '⚗️ كافة الخامات الوسيطة (Flag M)' : 'All Manufactured Items (M)'}
            isAr={isAr}
          />
        </div>

        {/* Validity Filter */}
        <div className="lg:col-span-3">
          <select
            value={validityFilter}
            onChange={(e) => setValidityFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 cursor-pointer"
          >
            <option value="all">{isAr ? '⏳ جميع حالات السريان' : 'All Validity States'}</option>
            <option value="active">{isAr ? '🟢 سارية ومتاحة للتشغيل' : 'Active & Valid'}</option>
            <option value="expired">{isAr ? '🔴 منتهية الصلاحية' : 'Expired'}</option>
            <option value="upcoming">{isAr ? '⏳ تبدأ مستقبلاً' : 'Upcoming'}</option>
          </select>
        </div>
      </div>

      {/* Main Intermediate Recipes Listing Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[360px]">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
              <th className="p-3 text-center w-10"></th>
              <th className="p-3 text-start">{isAr ? 'اسم التركيبة ووصفها' : 'Formula Name'}</th>
              <th className="p-3 text-start">{isAr ? 'الخامة الوسيطة المصنعة (Flag M)' : 'Target M Material'}</th>
              <th className="p-3 text-start">{isAr ? 'فترة السريان والصلاحية' : 'Validity Period'}</th>
              <th className="p-3 text-start">{isAr ? 'حجم التشغيلة الأساسية' : 'Batch Scaling'}</th>
              <th className="p-3 text-center">{isAr ? 'المدخلات (R)' : 'R-Inputs'}</th>
              <th className="p-3 text-start">{isAr ? 'حالة السريان' : 'Status'}</th>
              <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-12 text-center">
                  <PeacockLoader size="lg" text={isAr ? 'جاري تحميل تركيبات الخامات الوسيطة...' : 'Loading Intermediate Formulas...'} />
                </td>
              </tr>
            ) : filteredRecipes.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد تركيبات وسيطة مسجلة مطابقة للبحث.' : 'No intermediate recipes found.'}
                </td>
              </tr>
            ) : (
              filteredRecipes.map((recipe) => {
                const isExpanded = Boolean(expandedRecipes[recipe.code]);
                const validity = getValidityStatus(recipe);
                const compCount = Array.isArray(recipe.components) ? recipe.components.length : 0;
                const currentSubTab = expandedSubTabs[recipe.code] || 'breakdown';
                const editState = breakdownEdits[recipe.code] || { components: recipe.components || [], isModified: false, isSaving: false };

                return (
                  <React.Fragment key={recipe.code}>
                    <tr className={`transition ${isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'}`}>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleRecipeExpand(recipe)}
                          className="p-1 text-slate-400 hover:text-amber-700 rounded-md transition cursor-pointer"
                          title={isAr ? 'عرض وتعديل المكونات وسجل التدقيق' : 'Expand details'}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-amber-700" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                        </button>
                      </td>

                      {/* Formula Name & Optional Prep Code Chip */}
                      <td className="p-3 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs">{recipe.nameAr}</span>
                          {recipe.prepCode && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-extrabold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.2 rounded-md shadow-2xs">
                              <span>{isAr ? `طريقة: ${recipe.prepCode}` : `Prep: ${recipe.prepCode}`}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                            {recipe.code}
                          </span>
                          {recipe.nameEn && <span className="text-[10px] text-slate-400">({recipe.nameEn})</span>}
                        </div>
                      </td>

                      {/* Target M Item & In-House Variant */}
                      <td className="p-3 align-top space-y-1">
                        <div className="font-bold text-slate-900 text-xs">
                          {recipe.targetItemNameAr || recipe.targetItemId}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-semibold">
                            [{recipe.targetItemId}]
                          </span>
                          {recipe.targetVariantSuffix && (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              <Factory className="h-3 w-3 text-amber-600" />
                              <span>تنوع ({recipe.targetVariantSuffix}) إنتاج داخلي</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Validity Period */}
                      <td className="p-3 align-top text-xs text-slate-700">
                        {recipe.validityType === 'open' ? (
                          <div>
                            <span className="font-bold text-emerald-800">{isAr ? 'سريان مفتوح' : 'Open-Ended'}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {isAr ? 'من:' : 'From:'} {recipe.startDate || '—'}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-mono font-bold text-slate-800">
                              {recipe.startDate} <span className="text-slate-400 font-sans">{isAr ? 'إلى' : 'to'}</span> {recipe.endDate}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Batch Scaling */}
                      <td className="p-3 align-top text-xs font-mono font-bold text-slate-900">
                        {Number(recipe.batchYieldQty || 1000).toLocaleString()} {recipe.yieldUnit || 'لتر'}
                      </td>

                      {/* R-Components Count */}
                      <td className="p-3 align-top text-center">
                        <button
                          type="button"
                          onClick={() => toggleRecipeExpand(recipe)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition cursor-pointer"
                        >
                          <Boxes className="h-3.5 w-3.5 text-amber-700" />
                          <span>{compCount} {isAr ? 'مدخلات' : 'Inputs'}</span>
                        </button>
                      </td>

                      {/* Status */}
                      <td className="p-3 align-top">
                        {validity.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>{isAr ? validity.labelAr : validity.labelEn}</span>
                          </span>
                        ) : validity.status === 'expired' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            <AlertTriangle className="h-3 w-3 text-rose-600" />
                            <span>{isAr ? validity.labelAr : validity.labelEn}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            <Clock className="h-3 w-3 text-indigo-600" />
                            <span>{isAr ? validity.labelAr : validity.labelEn}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 align-top text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(recipe)}
                              className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title={isAr ? 'تعديل التركيبة' : 'Edit Recipe'}
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                          )}
                          {canCreate && (
                            <button
                              type="button"
                              onClick={() => handleCloneRecipe(recipe)}
                              className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title={isAr ? 'استنساخ وإنشاء إصدار جديد للتركيبة' : 'Clone Recipe'}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRecipe(recipe.code, recipe.nameAr)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title={isAr ? 'حذف التركيبة' : 'Delete Recipe'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED IN-PLACE COMPONENT BREAKDOWN & AUDIT TRAIL */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-b border-amber-100">
                        <td colSpan={8} className="p-4 ps-12 pe-6">
                          <div className="bg-white border border-amber-200 rounded-3xl p-4 shadow-sm space-y-4">
                            {/* Navigation Tabs */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900">
                                  {recipe.nameAr}
                                </span>
                                <span className="font-mono text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-bold">
                                  {recipe.code}
                                </span>
                              </div>

                              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                                <button
                                  type="button"
                                  onClick={() => setExpandedSubTabs((prev) => ({ ...prev, [recipe.code]: 'breakdown' }))}
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                                    currentSubTab === 'breakdown'
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <SlidersHorizontal className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'تعديل مدخلات التشغيل (R)' : 'R-Ingredients'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setExpandedSubTabs((prev) => ({ ...prev, [recipe.code]: 'audit' }))}
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                                    currentSubTab === 'audit'
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <History className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'سجل المراجعة والتدقيق' : 'Audit Trail'}</span>
                                  {Array.isArray(recipe.auditTrail) && recipe.auditTrail.length > 0 && (
                                    <span className="font-mono text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded-full">
                                      {recipe.auditTrail.length}
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* TAB 1: EDITABLE R-INGREDIENTS BREAKDOWN */}
                            {currentSubTab === 'breakdown' && (
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-500">
                                    {isAr
                                      ? `المقادير محسوبة لإنتاج تشغيلة أساسية بحجم (${recipe.batchYieldQty} ${recipe.yieldUnit}). المدخلات تقتصر على الخامات الحاملة للحرف (R).`
                                      : `Quantities scaled for yield batch of ${recipe.batchYieldQty} ${recipe.yieldUnit}. Restricted to R-flag materials.`}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => handleBreakdownAddComponent(recipe.code)}
                                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        <span>{isAr ? 'إضافة خامة مدخلات (R)' : 'Add Ingredient'}</span>
                                      </button>
                                    )}

                                    {editState.isModified && (
                                      <button
                                        type="button"
                                        disabled={editState.isSaving}
                                        onClick={() => handleSaveBreakdownChanges(recipe)}
                                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs disabled:opacity-50"
                                      >
                                        {editState.isSaving ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                        <span>{isAr ? 'حفظ تعديلات التركيبة' : 'Save Changes'}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                                  <table className="w-full text-start text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                                        <th className="p-2.5 text-center w-8">#</th>
                                        <th className="p-2.5 text-start min-w-[220px]">{isAr ? 'خامة المدخلات (Flag R) *' : 'R-Material *'}</th>
                                        <th className="p-2.5 text-start min-w-[200px]">{isAr ? 'تنوع المورد المعتمد' : 'Variant'}</th>
                                        <th className="p-2.5 text-start min-w-[140px]">{isAr ? 'سياسة التوريد' : 'Policy'}</th>
                                        <th className="p-2.5 text-center min-w-[130px]">{isAr ? 'الكمية للتشغيلة *' : 'Quantity *'}</th>
                                        <th className="p-2.5 text-start min-w-[180px]">{isAr ? 'تعليمات الخلط والتحضير' : 'Process Notes'}</th>
                                        <th className="p-2.5 text-center w-12">{isAr ? 'إجراء' : 'Actions'}</th>
                                      </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-100">
                                      {editState.components.length === 0 ? (
                                        <tr>
                                          <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                                            {isAr ? 'لا توجد خامات مدخلات مضافة في هذه التركيبة.' : 'No components assigned.'}
                                          </td>
                                        </tr>
                                      ) : (
                                        editState.components.map((comp, compIdx) => {
                                          const rawItem = rIngredientItems.find((r) => r.code === comp.itemId);
                                          const variationsList = rawItem?.variations || [];
                                          const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
                                          const isVariantSelected = Boolean(cleanSuffix);

                                          return (
                                            <tr key={compIdx} className="hover:bg-slate-50/70 transition">
                                              <td className="p-2 text-center font-mono font-bold text-slate-400">
                                                {compIdx + 1}
                                              </td>

                                              {/* R Material Selector */}
                                              <td className="p-2">
                                                <select
                                                  disabled={!canEdit}
                                                  value={comp.itemId}
                                                  onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'itemId', e.target.value)}
                                                  className="w-full p-1.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                                >
                                                  {rIngredientItems.map((r) => (
                                                    <option key={r.code} value={r.code}>
                                                      {r.nameAr} [{r.code}]
                                                    </option>
                                                  ))}
                                                </select>
                                              </td>

                                              {/* Variant Selector */}
                                              <td className="p-2">
                                                <select
                                                  disabled={!canEdit}
                                                  value={cleanSuffix}
                                                  onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'variantCode', e.target.value)}
                                                  className="w-full p-1.5 border border-slate-300 rounded-xl bg-white text-slate-800 text-[11px] font-semibold"
                                                >
                                                  <option value="">{isAr ? '🏷️ عام للخامة (أي مورد متاح)' : '🏷️ Generic (Any)'}</option>
                                                  {variationsList.map((v) => (
                                                    <option key={v.suffix} value={v.suffix}>
                                                      [{v.suffix}] {v.supplierName || 'تنوع'} {v.packagingRatio ? `[شدة: ${v.packagingRatio}]` : ''}
                                                    </option>
                                                  ))}
                                                </select>
                                              </td>

                                              {/* Policy Selector */}
                                              <td className="p-2">
                                                {isVariantSelected ? (
                                                  <select
                                                    disabled={!canEdit}
                                                    value={comp.variantPolicy || 'preferred'}
                                                    onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'variantPolicy', e.target.value)}
                                                    className={`w-full p-1.5 border rounded-xl text-[11px] font-bold ${
                                                      comp.variantPolicy === 'mandatory'
                                                        ? 'border-rose-400 bg-rose-50 text-rose-950'
                                                        : 'border-amber-400 bg-amber-50 text-amber-950'
                                                    }`}
                                                  >
                                                    <option value="preferred">{isAr ? '🔘 مفضل (يقبل البديل)' : 'Preferred'}</option>
                                                    <option value="mandatory">{isAr ? '🔒 إلزامي (A Must)' : 'Mandatory'}</option>
                                                  </select>
                                                ) : (
                                                  <span className="text-slate-400 italic text-[11px] block px-2">—</span>
                                                )}
                                              </td>

                                              {/* Quantity per Batch */}
                                              <td className="p-2 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                  <input
                                                    type="number"
                                                    step="0.001"
                                                    min="0.001"
                                                    disabled={!canEdit}
                                                    value={comp.standardQty}
                                                    onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'standardQty', e.target.value)}
                                                    className="w-24 p-1 border border-slate-300 rounded-lg text-center font-mono font-bold text-xs bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                                                  />
                                                  <span className="font-medium text-slate-500 text-[10px]">{comp.unit || 'كجم'}</span>
                                                </div>
                                              </td>

                                              {/* Process Instructions */}
                                              <td className="p-2">
                                                <input
                                                  type="text"
                                                  disabled={!canEdit}
                                                  placeholder={isAr ? 'مثال: خلط هيدروليكي 15 دقيقة' : 'e.g. Blend 15 mins'}
                                                  value={comp.instructionsAr || ''}
                                                  onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'instructionsAr', e.target.value)}
                                                  className="w-full p-1 border border-slate-300 rounded-lg text-[11px] bg-white text-slate-800"
                                                />
                                              </td>

                                              {/* Delete Button */}
                                              <td className="p-2 text-center">
                                                {canEdit && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleBreakdownRemoveComponent(recipe.code, compIdx)}
                                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                                    title={isAr ? 'حذف هذا المكون' : 'Delete line'}
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* TAB 2: AUDIT TRAIL */}
                            {currentSubTab === 'audit' && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                    <History className="h-4 w-4 text-amber-700" />
                                    <span>{isAr ? 'سجل التدقيق والمراجعة للتركيبة الوسيطة:' : 'Audit Trail:'}</span>
                                  </span>

                                  {recipe.createdBy && (
                                    <span className="text-[11px] text-slate-500">
                                      {isAr ? 'أنشئت بواسطة:' : 'Created By:'} <b className="text-slate-800">{recipe.createdBy.name}</b>
                                    </span>
                                  )}
                                </div>

                                {(!recipe.auditTrail || recipe.auditTrail.length === 0) ? (
                                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-400 text-xs italic">
                                    {isAr ? 'لا توجد سجلات تدقيق سابقة مسجلة لهذه التركيبة.' : 'No audit records logged yet.'}
                                  </div>
                                ) : (
                                  <div className="space-y-2 max-h-60 overflow-y-auto pe-1">
                                    {recipe.auditTrail.map((entry, aIdx) => (
                                      <div
                                        key={entry.id || aIdx}
                                        className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1 hover:border-amber-200 transition"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-50 text-amber-900 border border-amber-200">
                                              {isAr ? entry.actionLabelAr || entry.action : entry.actionLabelEn || entry.action}
                                            </span>
                                            <span className="font-bold text-slate-900 flex items-center gap-1">
                                              <User className="h-3 w-3 text-slate-400" />
                                              <span>{entry.user}</span>
                                            </span>
                                          </div>

                                          <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            <span>{entry.timestamp}</span>
                                          </span>
                                        </div>

                                        <p className="text-[11px] text-slate-600 font-medium ps-1">
                                          {entry.summary}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
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

      {/* CREATE & EDIT INTERMEDIATE FORMULA MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-4 my-6">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl">
                  <Factory className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {editingRecipeCode
                      ? (isAr ? `تعديل تركيبة الخامة الوسيطة (${editingRecipeCode})` : `Edit Intermediate Recipe (${editingRecipeCode})`)
                      : (isAr ? 'تعريف تركيبة خامة وسيطة جديدة (Intermediate BOM)' : 'New Intermediate Manufacturing Recipe')}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {isAr ? 'تحديد مقادير مدخلات الإنتاج (Flag R) لتصنيع الخامات الوسيطة (Flag M)' : 'Specify R-materials required to formulate M-items in bulk batches'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-md">
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

            <form onSubmit={handleSaveModalRecipe} className="space-y-4 text-xs">
              {/* SECTION 1: TARGET M-ITEM & FORMULA NAME */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-amber-700" />
                  <span>{isAr ? '١- الخامة الوسيطة المصنعة (Flag M) وتسمية التركيبة:' : '1. Target Manufactured Material (M):'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-4">
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الخامة الوسيطة المصنعة (Flag M) *' : 'Target M Material *'}</label>
                    <SearchableSelect
                      value={formData.targetItemId}
                      onChange={handleTargetItemChange}
                      options={mTargetItems.map((item) => ({
                        value: item.code,
                        label: item.nameAr,
                        sublabel: item.code,
                      }))}
                      placeholder={isAr ? '-- اختر الخامة المصنعة (Flag M) --' : '-- Select M Material --'}
                      isAr={isAr}
                      required
                    />
                  </div>

                  {/* In-House Variation Selector for M-Items */}
                  <div className="sm:col-span-4">
                    <label className="block font-bold text-amber-950 mb-1 flex items-center justify-between">
                      <span>{isAr ? 'تنوع الإنتاج الداخلي المعتمد:' : 'In-House Variant:'}</span>
                      <span className="text-[10px] text-amber-700 font-normal">IN-HOUSE</span>
                    </label>
                    {(() => {
                      const currentM = mTargetItems.find((i) => i.code === formData.targetItemId);
                      const inHouseVariants = (currentM?.variations || []).filter(
                        (v) => v.supplierId === 'IN_HOUSE' || v.supplierName === 'إنتاج داخلي' || v.supplierName === 'In-House Production' || !v.supplierId
                      );

                      return (
                        <select
                          value={formData.targetVariantSuffix || ''}
                          onChange={(e) => handleTargetVariantChange(e.target.value)}
                          className="w-full p-2 border border-amber-300 rounded-xl bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">{isAr ? '-- عام لكافة تنوعات الخامة --' : '-- Generic (All Variants) --'}</option>
                          {inHouseVariants.map((v) => (
                            <option key={v.suffix} value={v.suffix}>
                              [{v.suffix}] {v.supplierName || 'إنتاج داخلي'} {v.specs?.length ? `(${v.specs.map(s => s.value).join(' - ')})` : ''}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'كود التحضير *' : 'Prep Code *'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'مثال: 100، 50، 1' : 'e.g. 100, 50, 1'}
                      value={formData.prepCode || ''}
                      onChange={(e) => setFormData({ ...formData, prepCode: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center text-indigo-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'حجم التشغيلة *' : 'Batch Yield *'}</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={formData.batchYieldQty}
                      onChange={(e) => setFormData({ ...formData, batchYieldQty: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-center"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'وحدة التشغيلة:' : 'Yield Unit:'}</label>
                    <input
                      type="text"
                      value={formData.yieldUnit}
                      onChange={(e) => setFormData({ ...formData, yieldUnit: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-xl bg-slate-100 font-bold text-center"
                    />
                  </div>
                </div>

                {/* Workflow Toggles: QA Analysis & Tank Numbering */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2.5 border-t border-slate-200">
                  <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                    formData.needsQA ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold' : 'bg-white border-slate-200 text-slate-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.needsQA)}
                        onChange={(e) => setFormData({ ...formData, needsQA: e.target.checked })}
                        className="accent-indigo-600 h-4 w-4 rounded"
                      />
                      <div>
                        <span className="text-xs block">{isAr ? 'فحص وتحليل معملي (QA)' : 'Requires QA Analysis'}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{isAr ? 'يلزم اعتماد المعمل قبل تشغيل طلمبة الرفع' : 'Gate lifting until QA passed'}</span>
                      </div>
                    </div>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700 font-bold">
                      {formData.needsQA ? 'QA Active' : 'QA Bypassed'}
                    </span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                    formData.needsTankSerial ? 'bg-blue-50 border-blue-300 text-blue-950 font-bold' : 'bg-white border-slate-200 text-slate-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.needsTankSerial)}
                        onChange={(e) => setFormData({ ...formData, needsTankSerial: e.target.checked })}
                        className="accent-blue-600 h-4 w-4 rounded"
                      />
                      <div>
                        <span className="text-xs block">{isAr ? 'ترقيم وسيريال تانك (Tank Serial)' : 'Tank Serial Numbering'}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{isAr ? 'تتبع برقم تانك تسلسلي وصورة للتانك' : 'Serial & photo tracking'}</span>
                      </div>
                    </div>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white border border-blue-200 text-blue-700 font-bold">
                      {formData.needsTankSerial ? 'Serialized' : 'Batch / Count'}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم التركيبة (عربي) *' : 'Formula Name (Ar) *'}</label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'مثال: تركيبة تخفيف خل 5% من مركز 10%' : 'e.g. 5% Vinegar from 10% Concentrate'}
                      value={formData.nameAr}
                      onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'اسم التركيبة (إنجليزي)' : 'Formula Name (En)'}</label>
                    <input
                      type="text"
                      placeholder="e.g. 5% Vinegar Dilution Recipe"
                      value={formData.nameEn}
                      onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: VALIDITY ENGINE */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-amber-700" />
                  <span>{isAr ? '٢- فترة سريان وصلاحية التركيبة:' : '2. Validity Period:'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'نوع فترة السريان *' : 'Validity Type *'}</label>
                    <select
                      value={formData.validityType}
                      onChange={(e) => setFormData({ ...formData, validityType: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-900"
                    >
                      <option value="open">{isAr ? 'سريان مفتوح (بدون تاريخ نهاية)' : 'Open-Ended'}</option>
                      <option value="custom_range">{isAr ? 'فترة محددة البداية والنهاية' : 'Custom Date Range'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">{isAr ? 'تاريخ بدء السريان *' : 'Start Date *'}</label>
                    <input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold"
                    />
                  </div>

                  {formData.validityType === 'custom_range' ? (
                    <div>
                      <label className="block font-bold text-rose-900 mb-1">{isAr ? 'تاريخ انتهاء السريان *' : 'End Date *'}</label>
                      <input
                        type="date"
                        required
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="w-full p-2 border-2 border-rose-400 rounded-xl bg-white font-mono font-bold text-rose-950"
                      />
                    </div>
                  ) : (
                    <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>{isAr ? 'التركيبة سارية ومتاحة دائماً' : 'Permanently Active'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: R-INGREDIENTS BUILDER */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Boxes className="h-4 w-4 text-amber-700" />
                      <span>{isAr ? '٣- مقادير مدخلات الإنتاج (Flag R):' : '3. Raw Ingredients (Flag R):'}</span>
                    </h4>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {isAr ? `حدد المقادير المطلوبة لإنتاج تشغيلة بحجم (${formData.batchYieldQty} ${formData.yieldUnit})` : `Scale ingredients per ${formData.batchYieldQty} ${formData.yieldUnit} batch`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleModalAddComponent}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إضافة خامة مدخلات (R)' : 'Add Ingredient'}</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pe-1">
                  {formData.components.map((comp, idx) => {
                    const rawItem = rIngredientItems.find((r) => r.code === comp.itemId) || {};
                    const variationsList = rawItem.variations || [];
                    const isVariantSelected = Boolean(comp.variantCode);

                    return (
                      <div key={comp.id || idx} className="p-3 bg-white rounded-2xl border border-slate-200 space-y-2 shadow-2xs">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-mono font-extrabold">
                              {idx + 1}
                            </span>
                            <span>{comp.materialNameAr || (isAr ? 'خامة جديدة' : 'New Ingredient')}</span>
                          </span>

                          {formData.components.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleModalRemoveComponent(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title={isAr ? 'حذف هذا السطر' : 'Remove Line'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-5">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{isAr ? 'خامة المدخلات (Flag R) *:' : 'R-Material *:'}</label>
                            <select
                              value={comp.itemId}
                              onChange={(e) => handleModalComponentChange(idx, 'itemId', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-bold text-slate-900 bg-white"
                            >
                              {rIngredientItems.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {r.nameAr} [{r.code}]
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{isAr ? 'تنوع المورد المعتمد:' : 'Variant Specification:'}</label>
                            <select
                              value={comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : ''}
                              onChange={(e) => handleModalComponentChange(idx, 'variantCode', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-semibold text-slate-900 bg-white"
                            >
                              <option value="">{isAr ? '-- أي تنوع متاح للخامة (عام) --' : '-- Any Available Variant --'}</option>
                              {variationsList.map((v) => (
                                <option key={v.suffix} value={v.suffix}>
                                  [{v.suffix}] {v.supplierName || 'تنوع'}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            {isVariantSelected ? (
                              <div>
                                <label className="block text-[10px] font-bold text-amber-950 mb-0.5">{isAr ? 'سياسة التوريد *:' : 'Variant Policy *:'}</label>
                                <select
                                  value={comp.variantPolicy || 'preferred'}
                                  onChange={(e) => handleModalComponentChange(idx, 'variantPolicy', e.target.value)}
                                  className={`w-full p-1.5 border-2 rounded-lg font-bold text-xs ${
                                    comp.variantPolicy === 'mandatory'
                                      ? 'border-rose-400 bg-rose-50 text-rose-950'
                                      : 'border-amber-400 bg-amber-50 text-amber-950'
                                  }`}
                                >
                                  <option value="preferred">{isAr ? '🔘 مفضل (يقبل البديل)' : 'Preferred'}</option>
                                  <option value="mandatory">{isAr ? '🔒 إلزامي (A Must)' : 'Mandatory'}</option>
                                </select>
                              </div>
                            ) : (
                              <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-[10px] text-center">
                                {isAr ? 'خامة عامة بدون تقييد مورد' : 'Generic Parent Material'}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1 border-t border-slate-100">
                          <div className="sm:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                              {isAr ? `الكمية للتشغيلة (${comp.unit}): *` : `Quantity (${comp.unit}): *`}
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              required
                              value={comp.standardQty}
                              onChange={(e) => handleModalComponentChange(idx, 'standardQty', Number(e.target.value))}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{isAr ? 'وحدة القياس:' : 'Unit:'}</label>
                            <input
                              type="text"
                              value={comp.unit}
                              onChange={(e) => handleModalComponentChange(idx, 'unit', e.target.value)}
                              className="w-full p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-bold text-center text-xs"
                            />
                          </div>

                          <div className="sm:col-span-5">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{isAr ? 'تعليمات الخلط والتشغيل:' : 'Process Notes:'}</label>
                            <input
                              type="text"
                              placeholder={isAr ? 'مثال: خلط هيدروليكي 15 دقيقة' : 'e.g. Blend 15 mins'}
                              value={comp.instructionsAr || ''}
                              onChange={(e) => handleModalComponentChange(idx, 'instructionsAr', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-lg font-medium text-xs"
                            />
                          </div>
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
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{editingRecipeCode ? (isAr ? 'حفظ تعديلات التركيبة' : 'Update Formula') : (isAr ? 'حفظ وتوثيق التركيبة' : 'Save Formula')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}