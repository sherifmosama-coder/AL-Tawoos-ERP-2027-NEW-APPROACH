import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Layers,
  Package,
  Boxes,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit3,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  X,
  PlusCircle,
  Tag,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Building2,
  Sparkles,
  Lock,
  ArrowRight,
  Eye,
  SlidersHorizontal,
  Info,
  Table,
  Save,
  RotateCcw,
  Check,
  Grid,
  ClipboardCopy,
  ClipboardPaste,
  Percent,
  History,
  User,
  ListFilter,
  CheckCheck,
  Ban,
  CircleDot
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import PeacockLoader from './PeacockLoader';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

export default function BOMRecipesMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('bom'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('bom'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#6366f1';
  const { r, g, b } = hexToRgb(tabColor);

  // Dynamic Permissions Resolver
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['bom.canCreate'] !== undefined
      ? permissions.actions['bom.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['bom.canEdit'] !== undefined
      ? permissions.actions['bom.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['bom.canDelete'] !== undefined
      ? permissions.actions['bom.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

  // Cloud State
  const [recipes, setRecipes] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpeningMatrix, setIsOpeningMatrix] = useState(false);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [validityFilter, setValidityFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  // Expandable Rows & Breakdown In-Place Editor State
  const [expandedRecipes, setExpandedRecipes] = useState({});
  const [expandedSubTabs, setExpandedSubTabs] = useState({}); // { [recipeCode]: 'breakdown' | 'audit' }
  const [breakdownEdits, setBreakdownEdits] = useState({});   // { [recipeCode]: { components: [...], isModified: bool, isSaving: bool } }

  // Matrix Workspace Modal State
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [matrixSearchTerm, setMatrixSearchTerm] = useState('');
  const [matrixMaterialFilter, setMatrixMaterialFilter] = useState('');
  const [matrixGridState, setMatrixGridState] = useState({});
  const [matrixInitialSnapshot, setMatrixInitialSnapshot] = useState({}); // Reference snapshot for unsaved changes detection

  // Sub-Row Clipboard State
  const [copiedRowBuffer, setCopiedRowBuffer] = useState(null);

  // Subscribe to Cloud Firestore Collections (Ascending Code Sorting)
  useEffect(() => {
    const unsubRecipes = onSnapshot(collection(db, 'bom_recipes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      setRecipes(list);
      setLoading(false);
    });

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      setFinishedProducts(list);
    });

    const unsubCategories = onSnapshot(collection(db, 'finished_product_categories'), (snap) => {
      const list = snap.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        key: d.data().key || d.id,
        sortOrder: Number(d.data().sortOrder) || 1,
      }));
      list.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      setCategories(list);
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list = snap.docs
        .map((d) => ({ ...d.data(), id: d.id, code: d.id }))
        .filter((item) => {
          const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
          return flagsArr.some((f) => String(f).toUpperCase().includes('F'));
        });
      list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      setRawMaterials(list);
    });

    return () => {
      unsubRecipes();
      unsubProducts();
      unsubCategories();
      unsubItems();
    };
  }, []);

  // ----------------------------------------------------
  // COVERAGE & SUMMARY METRICS (Main Page)
  // ----------------------------------------------------
  const coverageMetrics = useMemo(() => {
    const totalProducts = finishedProducts.length;
    const configuredProductCodes = new Set(recipes.map((r) => r.finishedProductId));
    const configuredProductsCount = finishedProducts.filter((p) => configuredProductCodes.has(p.code)).length;
    const percent = totalProducts > 0 ? Math.round((configuredProductsCount / totalProducts) * 100) : 0;

    return {
      totalProducts,
      configuredProductsCount,
      percent,
      totalRecipesCount: recipes.length,
    };
  }, [finishedProducts, recipes]);

  // Helper: Live Validity Evaluator
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

  // Helper: Auto-Generate Concise Recipe Name based on Product & Scope
  const generateAutoRecipeName = (prod, scopeType, suffix) => {
    if (!prod) return { nameAr: '', nameEn: '' };
    const baseAr = prod.nameAr || prod.code;
    const baseEn = prod.nameEn || prod.code;

    if (scopeType === 'option_specific' && suffix) {
      const opt = (prod.packagingOptions || []).find((o) => o.suffix === suffix);
      const optNameAr = opt?.nameAr ? ` - ${opt.nameAr}` : '';
      const optNameEn = opt?.nameEn ? ` - ${opt.nameEn}` : '';
      return {
        nameAr: `${baseAr} [${suffix}]${optNameAr}`,
        nameEn: `${baseEn} [${suffix}]${optNameEn}`,
      };
    }

    return {
      nameAr: `${baseAr} - عام`,
      nameEn: `${baseEn} - General`,
    };
  };

  // ----------------------------------------------------
  // BREAKDOWN IN-PLACE EDITING & AUDIT TRAIL LOGIC
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
    const defaultRaw = rawMaterials[0] || {};
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
              itemId: defaultRaw.code || '',
              itemSelectionMode: 'parent_generic',
              variantCode: null,
              variantPolicy: null,
              materialNameAr: defaultRaw.nameAr || '',
              componentType: 'raw_ingredient',
              standardQty: 1,
              unit: defaultRaw.smallUnit || 'عبوة',
              scrapBufferPercent: 0,
              specs: '',
              instructionsAr: '',
            },
          ],
        },
      };
    });
  };

  const handleBreakdownRemoveComponent = (recipeCode, compIdx) => {
    setBreakdownEdits((prev) => {
      const current = prev[recipeCode] || { components: [] };
      const updatedComps = current.components.filter((_, idx) => idx !== compIdx);
      return {
        ...prev,
        [recipeCode]: {
          ...current,
          isModified: true,
          components: updatedComps,
        },
      };
    });
  };

  const handleBreakdownChangeComponent = (recipeCode, compIdx, field, value) => {
    setBreakdownEdits((prev) => {
      const current = prev[recipeCode] || { components: [] };
      const updatedComps = [...current.components];
      const targetComp = { ...updatedComps[compIdx] };

      targetComp[field] = value;

      if (field === 'itemId') {
        const rawItem = rawMaterials.find((m) => m.code === value);
        targetComp.materialNameAr = rawItem?.nameAr || value;
        targetComp.unit = rawItem?.smallUnit || 'عبوة';
        targetComp.itemSelectionMode = 'parent_generic';
        targetComp.variantCode = null;
        targetComp.variantPolicy = null;
      }

      if (field === 'variantCode') {
        if (!value) {
          targetComp.itemSelectionMode = 'parent_generic';
          targetComp.variantCode = null;
          targetComp.variantPolicy = null;
        } else {
          targetComp.itemSelectionMode = 'variant_specific';
          targetComp.variantCode = value;
          if (!targetComp.variantPolicy) targetComp.variantPolicy = 'preferred';
        }
      }

      updatedComps[compIdx] = targetComp;

      return {
        ...prev,
        [recipeCode]: {
          ...current,
          isModified: true,
          components: updatedComps,
        },
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
      [recipe.code]: { ...prev[recipe.code], isSaving: true },
    }));

    try {
      const userName = isAr
        ? currentUser?.nameAr || currentUser?.name || currentUser?.email || 'مستخدم'
        : currentUser?.name || currentUser?.nameAr || currentUser?.email || 'User';

      const now = new Date();
      const timestampFormatted = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      const sanitizedComponents = editData.components.map((comp) => {
        const rawItem = rawMaterials.find((m) => m.code === comp.itemId);
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
          componentType: comp.componentType || 'raw_ingredient',
          standardQty: Number(comp.standardQty) || 0,
          unit: comp.unit || rawItem?.smallUnit || 'عبوة',
          scrapBufferPercent: Number(comp.scrapBufferPercent) || 0,
          instructionsAr: comp.instructionsAr || '',
          specs: specsText,
        };
      });

      const auditEntry = {
        id: `AUD-${Date.now()}`,
        action: 'breakdown_edit',
        actionLabelAr: 'تعديل تفصيلي للمكونات',
        actionLabelEn: 'Component Breakdown Edit',
        timestamp: timestampFormatted,
        user: userName,
        userEmail: currentUser?.email || '',
        summary: `تم تحديث المكونات من (${recipe.components?.length || 0}) إلى (${sanitizedComponents.length}) خامة بنجاح.`,
      };

      const existingAudit = Array.isArray(recipe.auditTrail) ? recipe.auditTrail : [];
      const updatedAuditTrail = [auditEntry, ...existingAudit].slice(0, 50);

      await setDoc(
        doc(db, 'bom_recipes', recipe.code),
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
      console.error('Error saving component breakdown:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التعديلات.' : 'Error saving changes.');
      setBreakdownEdits((prev) => ({
        ...prev,
        [recipe.code]: { ...prev[recipe.code], isSaving: false },
      }));
    }
  };

  // ----------------------------------------------------
  // MATRIX WORKSPACE MODAL INITIALIZATION
  // ----------------------------------------------------
  const handleOpenMatrixModal = () => {
    setIsOpeningMatrix(true);

    setTimeout(() => {
      const todayStr = new Date().toISOString().split('T')[0];
      const newGrid = {};

      finishedProducts.forEach((prod) => {
        const cleanProdCode = (prod.code || '').replace(/[^A-Za-z0-9]/g, '');
        const prodRecipes = recipes.filter((r) => r.finishedProductId === prod.code);

        // 1. General Product Recipes
        const genRecipes = prodRecipes.filter((r) => r.scopeType !== 'option_specific');

        if (genRecipes.length === 0) {
          const genKey = `REC_BOM-${cleanProdCode}-GEN`;
          const genNames = generateAutoRecipeName(prod, 'product_general', '');
          newGrid[genKey] = {
            key: genKey,
            recipeCode: `BOM-${cleanProdCode}-GEN`,
            isExisting: false,
            finishedProductId: prod.code,
            finishedProductNameAr: prod.nameAr,
            finishedProductNameEn: prod.nameEn || prod.nameAr,
            scopeType: 'product_general',
            packagingOptionSuffix: '',
            packagingOptionNameAr: '',
            nameAr: genNames.nameAr,
            nameEn: genNames.nameEn,
            validityType: 'open',
            startDate: todayStr,
            endDate: '',
            outputLargeUnit: prod.largeUnitName || 'كرتونة',
            packagingRatio: Number(prod.packagingRatio) || 12,
            outputSmallUnit: prod.smallUnit || 'عبوة',
            productStatus: prod.status || 'active',
            componentsByItem: {},
          };
        } else {
          genRecipes.forEach((r) => {
            const rKey = `REC_${r.code}`;
            const compsMap = {};
            (r.components || []).forEach((c) => {
              compsMap[c.itemId] = {
                variantCode: c.variantCode ? c.variantCode.replace(`${c.itemId}-`, '') : '',
                variantPolicy: c.variantPolicy || 'preferred',
                standardQty: c.standardQty !== undefined ? c.standardQty : '',
                unit: c.unit || '',
                scrapBufferPercent: c.scrapBufferPercent || 0,
              };
            });

            newGrid[rKey] = {
              key: rKey,
              recipeCode: r.code,
              isExisting: true,
              finishedProductId: prod.code,
              finishedProductNameAr: prod.nameAr,
              finishedProductNameEn: prod.nameEn || prod.nameAr,
              scopeType: 'product_general',
              packagingOptionSuffix: '',
              packagingOptionNameAr: '',
              nameAr: r.nameAr || generateAutoRecipeName(prod, 'product_general', '').nameAr,
              nameEn: r.nameEn || generateAutoRecipeName(prod, 'product_general', '').nameEn,
              validityType: r.validityType || 'open',
              startDate: r.startDate || todayStr,
              endDate: r.endDate || '',
              outputLargeUnit: r.outputLargeUnit || prod.largeUnitName || 'كرتونة',
              packagingRatio: Number(r.packagingRatio || prod.packagingRatio) || 12,
              outputSmallUnit: r.outputSmallUnit || prod.smallUnit || 'عبوة',
              productStatus: prod.status || 'active',
              componentsByItem: compsMap,
            };
          });
        }

        // 2. Specific Packaging Options (If secondary options like B, C exist, include Option A, B, C... as standalone rows)
        const optionsList = Array.isArray(prod.packagingOptions) ? prod.packagingOptions : [];
        const hasSecondaryOptions = optionsList.some((opt) => opt.suffix && opt.suffix.toUpperCase() !== 'A');

        if (hasSecondaryOptions) {
          optionsList.forEach((opt) => {
            const optSuffix = (opt.suffix || 'A').toUpperCase();
            const optRecipes = prodRecipes.filter(
              (r) => r.scopeType === 'option_specific' && (r.packagingOptionSuffix || '').toUpperCase() === optSuffix
            );

            if (optRecipes.length === 0) {
              const optKey = `REC_BOM-${cleanProdCode}-${optSuffix}`;
              const optNames = generateAutoRecipeName(prod, 'option_specific', optSuffix);
              newGrid[optKey] = {
                key: optKey,
                recipeCode: `BOM-${cleanProdCode}-${optSuffix}`,
                isExisting: false,
                finishedProductId: prod.code,
                finishedProductNameAr: prod.nameAr,
                finishedProductNameEn: prod.nameEn || prod.nameAr,
                scopeType: 'option_specific',
                packagingOptionSuffix: optSuffix,
                packagingOptionNameAr: opt.nameAr || `خيار ${optSuffix}`,
                nameAr: optNames.nameAr,
                nameEn: optNames.nameEn,
                validityType: 'open',
                startDate: todayStr,
                endDate: '',
                outputLargeUnit: prod.largeUnitName || 'كرتونة',
                packagingRatio: Number(opt.packagingRatio || prod.packagingRatio) || 12,
                outputSmallUnit: prod.smallUnit || 'عبوة',
                productStatus: prod.status || 'active',
                componentsByItem: {},
              };
            } else {
              optRecipes.forEach((r) => {
                const rKey = `REC_${r.code}`;
                const compsMap = {};
                (r.components || []).forEach((c) => {
                  compsMap[c.itemId] = {
                    variantCode: c.variantCode ? c.variantCode.replace(`${c.itemId}-`, '') : '',
                    variantPolicy: c.variantPolicy || 'preferred',
                    standardQty: c.standardQty !== undefined ? c.standardQty : '',
                    unit: c.unit || '',
                    scrapBufferPercent: c.scrapBufferPercent || 0,
                  };
                });

                newGrid[rKey] = {
                  key: rKey,
                  recipeCode: r.code,
                  isExisting: true,
                  finishedProductId: prod.code,
                  finishedProductNameAr: prod.nameAr,
                  finishedProductNameEn: prod.nameEn || prod.nameAr,
                  scopeType: 'option_specific',
                  packagingOptionSuffix: optSuffix,
                  packagingOptionNameAr: opt.nameAr || `خيار ${optSuffix}`,
                  nameAr: r.nameAr || generateAutoRecipeName(prod, 'option_specific', optSuffix).nameAr,
                  nameEn: r.nameEn || generateAutoRecipeName(prod, 'option_specific', optSuffix).nameEn,
                  validityType: r.validityType || 'open',
                  startDate: r.startDate || todayStr,
                  endDate: r.endDate || '',
                  outputLargeUnit: r.outputLargeUnit || prod.largeUnitName || 'كرتونة',
                  packagingRatio: Number(r.packagingRatio || opt.packagingRatio || prod.packagingRatio) || 12,
                  outputSmallUnit: r.outputSmallUnit || prod.smallUnit || 'عبوة',
                  productStatus: prod.status || 'active',
                  componentsByItem: compsMap,
                };
              });
            }
          });
        }
      });

      setMatrixGridState(newGrid);
      setMatrixInitialSnapshot(JSON.parse(JSON.stringify(newGrid)));
      setIsOpeningMatrix(false);
      setShowMatrixModal(true);
    }, 80);
  };

  // Matrix Cell Edit Handlers
  const handleMatrixCellChange = (rowKey, itemId, field, value) => {
    setMatrixGridState((prev) => {
      const row = prev[rowKey];
      if (!row) return prev;

      const currentComps = { ...(row.componentsByItem || {}) };
      const currentItemComp = currentComps[itemId] || {
        variantCode: '',
        variantPolicy: 'preferred',
        standardQty: '',
        unit: rawMaterials.find((m) => m.code === itemId)?.smallUnit || 'عبوة',
        scrapBufferPercent: 0,
      };

      currentComps[itemId] = {
        ...currentItemComp,
        [field]: value,
      };

      return {
        ...prev,
        [rowKey]: {
          ...row,
          componentsByItem: currentComps,
        },
      };
    });
  };

  const handleMatrixMetaChange = (rowKey, field, value) => {
    setMatrixGridState((prev) => {
      const row = prev[rowKey];
      if (!row) return prev;

      return {
        ...prev,
        [rowKey]: {
          ...row,
          [field]: value,
        },
      };
    });
  };

  const handleDuplicateMatrixRow = (sourceRowKey) => {
    setMatrixGridState((prev) => {
      const sourceRow = prev[sourceRowKey];
      if (!sourceRow) return prev;

      const prodCode = sourceRow.finishedProductId;
      const cleanProdCode = prodCode.replace(/[^A-Za-z0-9]/g, '');

      // Scan all active codes across both memory and database
      const allActiveCodes = [
        ...Object.values(prev).map((r) => (r.recipeCode || '').toUpperCase()),
        ...recipes.map((r) => (r.code || '').toUpperCase())
      ];

      let nextNum = 2;
      let candidateCode = `BOM-${cleanProdCode}-V${nextNum}`;
      while (allActiveCodes.includes(candidateCode.toUpperCase())) {
        nextNum++;
        candidateCode = `BOM-${cleanProdCode}-V${nextNum}`;
      }

      const cleanNameAr = (sourceRow.nameAr || '')
        .replace(/\s*\(إصدار.*?\)\s*/g, '')
        .replace(/\s*\(نسخة.*?\)\s*/g, '')
        .replace(/\s*\(بديل.*?\)\s*/g, '')
        .trim();

      const cleanNameEn = (sourceRow.nameEn || sourceRow.nameAr || '')
        .replace(/\s*\(Clone.*?\)\s*/gi, '')
        .replace(/\s*\(V\d+.*?\)\s*/gi, '')
        .trim();

      const newKey = `REC_${candidateCode}_${Date.now()}`;
      const clonedComponentsMap = {};
      Object.entries(sourceRow.componentsByItem || {}).forEach(([itemId, cData]) => {
        clonedComponentsMap[itemId] = { ...cData };
      });

      const nextRow = {
        ...sourceRow,
        key: newKey,
        recipeCode: candidateCode,
        isExisting: false,
        nameAr: `${cleanNameAr} (إصدار V${nextNum})`,
        nameEn: `${cleanNameEn} (V${nextNum})`,
        componentsByItem: clonedComponentsMap,
      };

      return {
        ...prev,
        [newKey]: nextRow,
      };
    });
  };

  const handleDeleteMatrixRow = async (rowKey) => {
    const row = matrixGridState[rowKey];
    if (!row) return;

    if (window.confirm(isAr ? `هل أنت متأكد من حذف التركيبة (${row.nameAr})؟` : `Delete recipe (${row.nameAr})?`)) {
      if (row.isExisting) {
        try {
          await deleteDoc(doc(db, 'bom_recipes', row.recipeCode));
        } catch (err) {
          console.error('Error deleting recipe from matrix:', err);
        }
      }
      setMatrixGridState((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
    }
  };

  const handleCopySubRow = (rowKey, subRowType) => {
    const row = matrixGridState[rowKey];
    if (!row) return;

    const data = {};
    Object.entries(row.componentsByItem || {}).forEach(([itemId, cVal]) => {
      if (subRowType === 'variant') data[itemId] = cVal.variantCode || '';
      else if (subRowType === 'policy') data[itemId] = cVal.variantPolicy || 'preferred';
      else if (subRowType === 'quantity') data[itemId] = cVal.standardQty !== undefined ? cVal.standardQty : '';
    });

    setCopiedRowBuffer({
      type: subRowType,
      sourceRecipeName: row.nameAr,
      data,
    });
  };

  const handlePasteSubRow = (targetRowKey, targetSubRowType) => {
    if (!copiedRowBuffer || copiedRowBuffer.type !== targetSubRowType) {
      alert(isAr ? 'نوع السطر المنسوخ لا يتطابق مع هذا السطر.' : 'Copied row type does not match.');
      return;
    }

    setMatrixGridState((prev) => {
      const row = prev[targetRowKey];
      if (!row) return prev;

      const currentComps = { ...(row.componentsByItem || {}) };
      rawMaterials.forEach((mat) => {
        const val = copiedRowBuffer.data[mat.code];
        if (val !== undefined) {
          const itemComp = currentComps[mat.code] || {
            variantCode: '',
            variantPolicy: 'preferred',
            standardQty: '',
            unit: mat.smallUnit || 'عبوة',
            scrapBufferPercent: 0,
          };

          if (targetSubRowType === 'variant') itemComp.variantCode = val;
          else if (targetSubRowType === 'policy') itemComp.variantPolicy = val;
          else if (targetSubRowType === 'quantity') itemComp.standardQty = val;

          currentComps[mat.code] = itemComp;
        }
      });

      return {
        ...prev,
        [targetRowKey]: {
          ...row,
          componentsByItem: currentComps,
        },
      };
    });
  };

  const handleMatrixKeyDown = (e, rIdx, subRowIdx, cIdx, totalRows, totalCols) => {
    let targetR = rIdx;
    let targetSub = subRowIdx;
    let targetC = cIdx;

    if (e.key === 'ArrowDown') {
      if (e.target.tagName === 'SELECT' && !e.altKey) return;
      e.preventDefault();
      if (subRowIdx < 2) {
        targetSub = subRowIdx + 1;
      } else if (rIdx < totalRows - 1) {
        targetR = rIdx + 1;
        targetSub = 0;
      }
    } else if (e.key === 'ArrowUp') {
      if (e.target.tagName === 'SELECT' && !e.altKey) return;
      e.preventDefault();
      if (subRowIdx > 0) {
        targetSub = subRowIdx - 1;
      } else if (rIdx > 0) {
        targetR = rIdx - 1;
        targetSub = 2;
      }
    } else if (e.key === 'ArrowRight') {
      const delta = isAr ? -1 : 1;
      const nextC = cIdx + delta;
      if (nextC >= 0 && nextC < totalCols) {
        targetC = nextC;
      }
    } else if (e.key === 'ArrowLeft') {
      const delta = isAr ? 1 : -1;
      const nextC = cIdx + delta;
      if (nextC >= 0 && nextC < totalCols) {
        targetC = nextC;
      }
    } else {
      return;
    }

    const nextId = `matrix-cell-${targetR}-${targetSub}-${targetC}`;
    const nextElem = document.getElementById(nextId);
    if (nextElem) {
      nextElem.focus();
      if (nextElem.select) nextElem.select();
    }
  };

  const handleSaveMatrixToCloud = async () => {
    if (!canCreate && !canEdit) {
      alert(isAr ? 'ليس لديك صلاحية حفظ أو تعديل التركيبات.' : 'Permission denied to save recipes.');
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const userName = isAr
        ? currentUser?.nameAr || currentUser?.name || currentUser?.email || 'مستخدم'
        : currentUser?.name || currentUser?.nameAr || currentUser?.email || 'User';

      const now = new Date();
      const timestampFormatted = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      Object.values(matrixGridState).forEach((row) => {
        const activeComponents = [];

        Object.entries(row.componentsByItem || {}).forEach(([itemId, cData]) => {
          const qty = Number(cData.standardQty);
          if (qty > 0) {
            const rawItem = rawMaterials.find((m) => m.code === itemId);
            const cleanSuffix = cData.variantCode ? cData.variantCode.replace(`${itemId}-`, '') : '';
            const rawVariant = (rawItem?.variations || []).find(
              (v) => v.variantCode === `${itemId}-${cleanSuffix}` || v.suffix === cleanSuffix
            );

            let specsText = '';
            if (cleanSuffix && rawVariant) {
              specsText = (rawVariant.specs || []).map((s) => `${s.label}: ${s.value}`).join(' | ') || rawVariant.mergedSpecs || '';
            } else if (rawItem) {
              specsText = (rawItem.masterSpecs || []).map((s) => `${s.label}: ${s.value}`).join(' | ') || rawItem.mergedSpecs || '';
            }

            activeComponents.push({
              itemId,
              itemSelectionMode: cleanSuffix ? 'variant_specific' : 'parent_generic',
              variantCode: cleanSuffix ? `${itemId}-${cleanSuffix}` : null,
              variantPolicy: cleanSuffix ? (cData.variantPolicy === 'mandatory' ? 'mandatory' : 'preferred') : null,
              materialNameAr: rawItem?.nameAr || itemId,
              componentType: 'raw_ingredient',
              standardQty: qty,
              unit: cData.unit || rawItem?.smallUnit || 'عبوة',
              scrapBufferPercent: Number(cData.scrapBufferPercent) || 0,
              instructionsAr: '',
              specs: specsText,
            });
          }
        });

        const recipeDocRef = doc(db, 'bom_recipes', row.recipeCode);

        if (activeComponents.length > 0) {
          const existingRecipe = recipes.find((r) => r.code === row.recipeCode);
          const auditEntry = {
            id: `AUD-${Date.now()}`,
            action: row.isExisting ? 'matrix_update' : 'created',
            actionLabelAr: row.isExisting ? 'تعديل عبر مصفوفة التركيبات' : 'إنشاء تركيبة جديدة',
            actionLabelEn: row.isExisting ? 'Matrix Bulk Update' : 'New Recipe Created',
            timestamp: timestampFormatted,
            user: userName,
            userEmail: currentUser?.email || '',
            summary: `تم حفظ (${activeComponents.length}) خامة في تركيبة الإنتاج.`,
          };

          const existingAudit = Array.isArray(existingRecipe?.auditTrail) ? existingRecipe.auditTrail : [];
          const updatedAuditTrail = [auditEntry, ...existingAudit].slice(0, 50);

          const payload = {
            id: row.recipeCode,
            code: row.recipeCode,
            nameAr: row.nameAr.trim(),
            nameEn: (row.nameEn || row.nameAr).trim(),
            finishedProductId: row.finishedProductId,
            finishedProductNameAr: row.finishedProductNameAr,
            scopeType: row.scopeType,
            packagingOptionSuffix: row.scopeType === 'option_specific' ? row.packagingOptionSuffix : null,
            packagingOptionCode: row.scopeType === 'option_specific' ? `${row.finishedProductId}-${row.packagingOptionSuffix}` : null,
            validityType: row.validityType,
            startDate: row.startDate,
            endDate: row.validityType === 'custom_range' ? row.endDate || null : null,
            standardYieldQty: 1,
            outputLargeUnit: row.outputLargeUnit || 'كرتونة',
            packagingRatio: row.packagingRatio || 12,
            outputSmallUnit: row.outputSmallUnit || 'عبوة',
            notes: '',
            status: 'active',
            componentsCount: activeComponents.length,
            components: activeComponents,
            auditTrail: updatedAuditTrail,
            updatedBy: {
              uid: currentUser?.id || '',
              name: userName,
              email: currentUser?.email || '',
            },
            updatedAt: serverTimestamp(),
          };

          if (!row.isExisting) {
            payload.createdAt = serverTimestamp();
            payload.createdBy = {
              uid: currentUser?.id || '',
              name: userName,
              email: currentUser?.email || '',
            };
          }

          batch.set(recipeDocRef, payload, { merge: true });
        } else if (row.isExisting && row.scopeType === 'option_specific') {
          batch.delete(recipeDocRef);
        }
      });

      await batch.commit();
      setShowMatrixModal(false);
    } catch (err) {
      console.error('Error saving matrix BOM recipes:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ مصفوفة التركيبات.' : 'Error saving BOM matrix.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecipe = async (code, name) => {
    if (!canDelete) {
      alert(isAr ? 'ليس لديك صلاحية حذف التركيبات.' : 'Permission denied to delete recipes.');
      return;
    }

    if (window.confirm(isAr ? `هل أنت متأكد من حذف التركيبة (${name}) نهائياً؟` : `Delete recipe (${name}) permanently?`)) {
      try {
        await deleteDoc(doc(db, 'bom_recipes', code));
      } catch (err) {
        console.error('Error deleting BOM recipe:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف التركيبة.' : 'Error deleting BOM recipe.');
      }
    }
  };

  // Multi-Criteria Filtering for Main Listing Table
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.nameAr?.includes(q) ||
        r.nameEn?.toLowerCase().includes(q) ||
        r.finishedProductNameAr?.includes(q) ||
        r.code?.toLowerCase().includes(q) ||
        r.components?.some((c) => c.materialNameAr?.includes(q) || c.itemId?.toLowerCase().includes(q));

      const targetProd = finishedProducts.find((p) => p.code === r.finishedProductId);

      const matchCategory =
        categoryFilter === 'all' ||
        (targetProd && (targetProd.productionLine === categoryFilter || targetProd.categoryId === categoryFilter));

      const matchProduct = productFilter === 'all' || r.finishedProductId === productFilter;
      const matchScope = scopeFilter === 'all' || r.scopeType === scopeFilter;

      const validity = getValidityStatus(r);
      const matchValidity =
        validityFilter === 'all' ||
        (validityFilter === 'active' && validity.status === 'active') ||
        (validityFilter === 'expired' && validity.status === 'expired') ||
        (validityFilter === 'upcoming' && validity.status === 'upcoming');

      return matchSearch && matchCategory && matchProduct && matchScope && matchValidity;
    });
  }, [recipes, searchTerm, categoryFilter, productFilter, scopeFilter, validityFilter, finishedProducts]);

  // Options for Finished Product SearchableSelect
  const productFilterOptions = useMemo(() => {
    const opts = [
      {
        value: 'all',
        label: isAr ? '📦 كافة المنتجات التامة' : 'All Finished Products',
        sublabel: '',
      },
    ];

    const availableProds = categoryFilter === 'all'
      ? finishedProducts
      : finishedProducts.filter((p) => p.productionLine === categoryFilter || p.categoryId === categoryFilter);

    availableProds.forEach((p) => {
      opts.push({
        value: p.code,
        label: p.nameAr,
        sublabel: p.code,
      });
    });

    return opts;
  }, [finishedProducts, categoryFilter, isAr]);

  // Filtered Product Rows in Matrix Workspace
  const filteredMatrixProductRows = useMemo(() => {
    const list = Object.values(matrixGridState).filter((row) => {
      const q = matrixSearchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        row.finishedProductNameAr?.includes(q) ||
        row.nameAr?.includes(q) ||
        row.packagingOptionNameAr?.includes(q) ||
        row.finishedProductId?.toLowerCase().includes(q) ||
        row.recipeCode?.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const codeCmp = (a.finishedProductId || '').localeCompare(b.finishedProductId || '', undefined, { numeric: true });
      if (codeCmp !== 0) return codeCmp;
      const scopeCmp = (a.scopeType || '').localeCompare(b.scopeType || '');
      if (scopeCmp !== 0) return scopeCmp;
      return (a.recipeCode || '').localeCompare(b.recipeCode || '', undefined, { numeric: true });
    });

    return list;
  }, [matrixGridState, matrixSearchTerm]);

  // Filtered F-Material Columns in Matrix Workspace
  const filteredMatrixMaterialColumns = useMemo(() => {
    const list = rawMaterials.filter((m) => {
      const q = matrixMaterialFilter.toLowerCase().trim();
      if (!q) return true;
      return m.nameAr?.includes(q) || m.nameEn?.toLowerCase().includes(q) || m.code?.toLowerCase().includes(q);
    });

    list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
    return list;
  }, [rawMaterials, matrixMaterialFilter]);

  return (
    <div className="space-y-5 select-none">
      {/* Full-Screen Peacock Loader for Initializing / Saving */}
      {(isSaving || isOpeningMatrix) && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={
            isOpeningMatrix
              ? (isAr ? 'جاري تهيئة وبناء مصفوفة تركيبات الإنتاج...' : 'Initializing 2D BOM Formulation Matrix...')
              : (isAr ? 'جاري حفظ وتوثيق مصفوفة التركيبات في السحابة...' : 'Saving BOM Matrix to Cloud...')
          }
        />
      )}

      {/* Top Header & Matrix Workspace Launch Button */}
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
              {isAr ? (tabConfig?.labelAr || 'شجرة وقوائم المكونات والتركيبات (BOM Recipes)') : (tabConfig?.labelEn || 'Bill of Materials (BOM) & Recipes')}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'تعديل تفصيلي للمكونات، سجل التدقيق والمراجعة، وتحرير المصفوفة لإنتاج كرتونة واحدة' : 'Inline component editor, audit trail history, and 2D matrix editor'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Unique Product Recipe Coverage KPI Chip */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50/80 border border-indigo-200 rounded-2xl shadow-2xs">
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-bold text-indigo-900 flex items-center gap-1">
                <CheckCheck className="h-3.5 w-3.5 text-indigo-600" />
                <span>{isAr ? 'نسبة تغطية التركيبات:' : 'Recipe Coverage:'}</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-indigo-950">
                {coverageMetrics.configuredProductsCount} / {coverageMetrics.totalProducts} {isAr ? 'منتج تام' : 'Products'} ({coverageMetrics.percent}%)
              </span>
            </div>
            <div className="w-12 bg-indigo-200 h-2 rounded-full overflow-hidden shrink-0">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${coverageMetrics.percent}%` }}
              />
            </div>
          </div>

          {canCreate || canEdit ? (
            <button
              type="button"
              onClick={handleOpenMatrixModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Grid className="h-4 w-4" />
              <span>{isAr ? 'مصفوفة تركيبات الإنتاج (Matrix Editor)' : 'BOM Formulation Matrix'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
              <Lock className="h-3.5 w-3.5" />
              <span>{isAr ? 'وضع القراءة فقط' : 'Read-Only Mode'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Criteria Filter Bar (Enhanced with Category & SearchableSelect) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs items-center">
        {/* 1. Global Search Box */}
        <div className="relative lg:col-span-3">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={isAr ? 'بحث بالاسم، الكود، الخامات...' : 'Search name, code, materials...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* 2. Product Category / Production Line Filter */}
        <div className="lg:col-span-3">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setProductFilter('all');
            }}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">{isAr ? `🏭 كافة خطوط الإنتاج (${categories.length})` : `All Production Lines (${categories.length})`}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.key || cat.id}>
                {isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Finished Product Filter via SearchableSelect */}
        <div className="lg:col-span-3">
          <SearchableSelect
            value={productFilter === 'all' ? '' : productFilter}
            onChange={(val) => setProductFilter(val || 'all')}
            options={productFilterOptions}
            placeholder={isAr ? '📦 كافة المنتجات التامة' : 'All Finished Products'}
            isAr={isAr}
          />
        </div>

        {/* 4. Validity Status Filter */}
        <div className="lg:col-span-2">
          <select
            value={validityFilter}
            onChange={(e) => setValidityFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 cursor-pointer"
          >
            <option value="all">{isAr ? '⏳ جميع حالات السريان' : 'All Validity States'}</option>
            <option value="active">{isAr ? '🟢 سارية ومتاحة' : 'Active & Valid'}</option>
            <option value="expired">{isAr ? '🔴 منتهية الصلاحية' : 'Expired'}</option>
            <option value="upcoming">{isAr ? '⏳ تبدأ مستقبلاً' : 'Upcoming'}</option>
          </select>
        </div>

        {/* 5. Scope Filter */}
        <div className="lg:col-span-1">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 cursor-pointer"
          >
            <option value="all">{isAr ? '🎯 النطاق' : 'Scope'}</option>
            <option value="product_general">{isAr ? 'عام' : 'General'}</option>
            <option value="option_specific">{isAr ? 'خاص' : 'Option'}</option>
          </select>
        </div>
      </div>

      {/* Main BOM Recipes Listing Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[360px]">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
              <th className="p-3 text-center w-10"></th>
              <th className="p-3 text-start">{isAr ? 'اسم التركيبة ووصفها' : 'Recipe Name'}</th>
              <th className="p-3 text-start">{isAr ? 'المنتج التام المستهدف والنطاق' : 'Target Product & Scope'}</th>
              <th className="p-3 text-start">{isAr ? 'فترة السريان والصلاحية' : 'Validity Period'}</th>
              <th className="p-3 text-start">{isAr ? 'المعيار القياسي للإنتاج' : 'Standard Yield'}</th>
              <th className="p-3 text-center">{isAr ? 'عدد المكونات' : 'Components'}</th>
              <th className="p-3 text-start">{isAr ? 'حالة السريان' : 'Status'}</th>
              <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-12 text-center">
                  <PeacockLoader size="lg" text={isAr ? 'جاري تحميل قوائم وتركيبات المكونات (BOM)...' : 'Loading BOM Recipes...'} />
                </td>
              </tr>
            ) : filteredRecipes.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد تركيبات مسجلة مطابقة للفلاتر المحددة.' : 'No BOM recipes match the selected criteria.'}
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
                    {/* Master Recipe Row */}
                    <tr className={`transition ${isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'}`}>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleRecipeExpand(recipe)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition cursor-pointer"
                          title={isAr ? 'عرض شجرة المكونات وسجل التدقيق' : 'Expand details'}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-indigo-600" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                        </button>
                      </td>

                      {/* Descriptive Name as Primary */}
                      <td className="p-3 align-top">
                        <span className="font-bold text-slate-900 block text-xs">{recipe.nameAr}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                            {recipe.code}
                          </span>
                          {recipe.nameEn && <span className="text-[10px] text-slate-400">({recipe.nameEn})</span>}
                        </div>
                      </td>

                      {/* Target Finished Product Name as Primary */}
                      <td className="p-3 align-top space-y-1">
                        <div className="font-bold text-slate-900 text-xs">
                          {recipe.finishedProductNameAr || recipe.finishedProductId}
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          {recipe.scopeType === 'option_specific' ? (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-md font-bold">
                              {isAr ? `خاص بالخيار (${recipe.packagingOptionSuffix})` : `Option (${recipe.packagingOptionSuffix}) Specific`}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">
                              {isAr ? 'عام للصنف الرئيسي' : 'General Product'}
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
                              {isAr ? 'من تاريخ:' : 'From:'} {recipe.startDate || '—'}
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

                      {/* Standard Yield: Strictly 1 Large Unit */}
                      <td className="p-3 align-top text-xs font-mono">
                        <div className="font-bold text-slate-900">
                          1 {recipe.outputLargeUnit || 'كرتونة'}
                        </div>
                        <span className="text-[10px] font-sans text-emerald-800 font-bold block mt-0.5">
                          = {recipe.packagingRatio || 12} {recipe.outputSmallUnit || 'عبوة'}
                        </span>
                      </td>

                      {/* Component Count Badge */}
                      <td className="p-3 align-top text-center">
                        <button
                          type="button"
                          onClick={() => toggleRecipeExpand(recipe)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold transition cursor-pointer"
                        >
                          <Boxes className="h-3.5 w-3.5 text-indigo-600" />
                          <span>{compCount} {isAr ? 'خامات' : 'Items'}</span>
                        </button>
                      </td>

                      {/* Status Pill */}
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

                      {/* Action Buttons */}
                      <td className="p-3 align-top text-center">
                        <div className="flex items-center justify-center gap-1">
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

                    {/* EXPANDED SECTION: IN-PLACE BREAKDOWN EDITOR + AUDIT TRAIL */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-b border-indigo-100">
                        <td colSpan={8} className="p-4 ps-12 pe-6">
                          <div className="bg-white border border-indigo-200 rounded-3xl p-4 shadow-sm space-y-4">
                            {/* Sub-Header & Navigation Tabs */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900">
                                  {recipe.nameAr}
                                </span>
                                <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-bold">
                                  {recipe.code}
                                </span>
                              </div>

                              {/* Tabs: Breakdown Editor vs Audit Trail */}
                              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                                <button
                                  type="button"
                                  onClick={() => setExpandedSubTabs((prev) => ({ ...prev, [recipe.code]: 'breakdown' }))}
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                                    currentSubTab === 'breakdown'
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <SlidersHorizontal className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'تعديل وإدارة المكونات' : 'Component Editor'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setExpandedSubTabs((prev) => ({ ...prev, [recipe.code]: 'audit' }))}
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                                    currentSubTab === 'audit'
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <History className="h-3.5 w-3.5" />
                                  <span>{isAr ? 'سجل التدقيق والمراجعة' : 'Audit Trail'}</span>
                                  {Array.isArray(recipe.auditTrail) && recipe.auditTrail.length > 0 && (
                                    <span className="font-mono text-[10px] bg-indigo-100 text-indigo-900 px-1.5 py-0.2 rounded-full">
                                      {recipe.auditTrail.length}
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* TAB 1: IN-PLACE COMPONENT BREAKDOWN EDITOR */}
                            {currentSubTab === 'breakdown' && (
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-500">
                                    {isAr
                                      ? `الكميات محسوبة لإنتاج: 1 ${recipe.outputLargeUnit || 'كرتونة'} (${recipe.packagingRatio || 12} ${recipe.outputSmallUnit || 'عبوة'}). يمكنك إضافة وحذف وتعديل الخامات مباشرة.`
                                      : `Quantities configured for 1 ${recipe.outputLargeUnit || 'Carton'} (${recipe.packagingRatio || 12} Units). Edit components inline.`}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => handleBreakdownAddComponent(recipe.code)}
                                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        <span>{isAr ? 'إضافة خامة / مكون' : 'Add Component'}</span>
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
                                        <span>{isAr ? 'حفظ تعديلات المكونات' : 'Save Changes'}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                                  <table className="w-full text-start text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                                        <th className="p-2.5 text-center w-8">#</th>
                                        <th className="p-2.5 text-start min-w-[200px]">{isAr ? 'الخامة (Flag F) *' : 'Raw Material (Flag F) *'}</th>
                                        <th className="p-2.5 text-start min-w-[190px]">{isAr ? 'التنوع المعتمد' : 'Variant'}</th>
                                        <th className="p-2.5 text-start min-w-[140px]">{isAr ? 'سياسة التوريد' : 'Policy'}</th>
                                        <th className="p-2.5 text-center min-w-[110px]">{isAr ? 'الكمية للكرتونة *' : 'Qty per Carton *'}</th>
                                        <th className="p-2.5 text-center min-w-[90px]">{isAr ? 'الهالك (%)' : 'Scrap %'}</th>
                                        <th className="p-2.5 text-center w-12">{isAr ? 'إجراء' : 'Actions'}</th>
                                      </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-100">
                                      {editState.components.length === 0 ? (
                                        <tr>
                                          <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                                            {isAr ? 'لا توجد خامات مضافة في هذه التركيبة بعد.' : 'No components assigned yet.'}
                                          </td>
                                        </tr>
                                      ) : (
                                        editState.components.map((comp, compIdx) => {
                                          const rawItem = rawMaterials.find((m) => m.code === comp.itemId);
                                          const variationsList = rawItem?.variations || [];
                                          const cleanSuffix = comp.variantCode ? comp.variantCode.replace(`${comp.itemId}-`, '') : '';
                                          const isVariantSelected = Boolean(cleanSuffix);

                                          return (
                                            <tr key={compIdx} className="hover:bg-slate-50/70 transition">
                                              <td className="p-2 text-center font-mono font-bold text-slate-400">
                                                {compIdx + 1}
                                              </td>

                                              {/* Raw Material Selector */}
                                              <td className="p-2">
                                                <select
                                                  disabled={!canEdit}
                                                  value={comp.itemId}
                                                  onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'itemId', e.target.value)}
                                                  className="w-full p-1.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                >
                                                  {rawMaterials.map((m) => (
                                                    <option key={m.code} value={m.code}>
                                                      {m.nameAr} [{m.code}]
                                                    </option>
                                                  ))}
                                                </select>
                                              </td>

                                              {/* Specific Variant Selector */}
                                              <td className="p-2">
                                                <select
                                                  disabled={!canEdit}
                                                  value={cleanSuffix}
                                                  onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'variantCode', e.target.value)}
                                                  className="w-full p-1.5 border border-slate-300 rounded-xl bg-white text-slate-800 text-[11px] font-semibold"
                                                >
                                                  <option value="">{isAr ? '🏷️ عام للخامة (أي مورد)' : '🏷️ Generic'}</option>
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

                                              {/* Standard Quantity */}
                                              <td className="p-2 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                  <input
                                                    type="number"
                                                    step="0.001"
                                                    min="0.001"
                                                    disabled={!canEdit}
                                                    value={comp.standardQty}
                                                    onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'standardQty', e.target.value)}
                                                    className="w-20 p-1 border border-slate-300 rounded-lg text-center font-mono font-bold text-xs bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                                  />
                                                  <span className="font-medium text-slate-500 text-[10px]">{comp.unit || 'عبوة'}</span>
                                                </div>
                                              </td>

                                              {/* Scrap Buffer % */}
                                              <td className="p-2 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                  <input
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    disabled={!canEdit}
                                                    value={comp.scrapBufferPercent !== undefined ? comp.scrapBufferPercent : 0}
                                                    onChange={(e) => handleBreakdownChangeComponent(recipe.code, compIdx, 'scrapBufferPercent', e.target.value)}
                                                    className="w-16 p-1 border border-slate-300 rounded-lg text-center font-mono font-bold text-xs bg-white text-slate-900"
                                                  />
                                                  <span className="text-slate-500 font-bold">%</span>
                                                </div>
                                              </td>

                                              {/* Delete Action */}
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

                            {/* TAB 2: AUDIT TRAIL & REVISION TIMELINE */}
                            {currentSubTab === 'audit' && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                    <History className="h-4 w-4 text-indigo-600" />
                                    <span>{isAr ? 'سجل العمليات والتدقيق للتركيبة (Audit Trail):' : 'Audit Trail & Revision History:'}</span>
                                  </span>

                                  {recipe.createdBy && (
                                    <span className="text-[11px] text-slate-500">
                                      {isAr ? 'أنشئت بواسطة:' : 'Created By:'} <b className="text-slate-800">{recipe.createdBy.name}</b>
                                    </span>
                                  )}
                                </div>

                                {(!recipe.auditTrail || recipe.auditTrail.length === 0) ? (
                                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-400 text-xs italic">
                                    {isAr ? 'لا توجد سجلات تدقيق سابقة مسجلة لهذه التركيبة.' : 'No audit entries logged yet.'}
                                  </div>
                                ) : (
                                  <div className="space-y-2 max-h-60 overflow-y-auto pe-1">
                                    {recipe.auditTrail.map((entry, aIdx) => (
                                      <div
                                        key={entry.id || aIdx}
                                        className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1 hover:border-indigo-200 transition"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-indigo-50 text-indigo-900 border border-indigo-200">
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

      {/* 2D MATRIX FORMULATION WORKSPACE MODAL (ENHANCED WITH PROGRESS & STATUS BADGES) */}
      {showMatrixModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 z-50 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full h-[96vh] p-5 shadow-2xl border border-slate-200 flex flex-col justify-between overflow-hidden space-y-3">
            {/* Modal Header & Horizontal Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl">
                  <Grid className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'مصفوفة تركيبات الإنتاج الشاملة (2D BOM Matrix Workspace)' : '2D BOM Formulation Matrix Workspace'}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {isAr ? 'تنقل بالأسهم ⬆️⬇️⬅️➡️ • انسخ والصق أي سطر كامل • متابعة حالة الخامات والتعديل فورياً' : 'Navigate via Arrow Keys • Copy/Paste Entire Rows • Live Formulation Progress'}
                  </span>
                </div>
              </div>

              {/* Filters & Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {copiedRowBuffer && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-[11px] font-bold animate-in fade-in">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>
                      {isAr
                        ? `تم نسخ سطر (${copiedRowBuffer.type === 'variant' ? 'التنوع' : copiedRowBuffer.type === 'policy' ? 'السياسة' : 'الكمية'}) من (${copiedRowBuffer.sourceRecipeName})`
                        : `Copied ${copiedRowBuffer.type} row`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCopiedRowBuffer(null)}
                      className="p-0.5 hover:bg-emerald-200 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <div className="relative w-44">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={isAr ? 'بحث بالمنتجات...' : 'Filter products...'}
                    value={matrixSearchTerm}
                    onChange={(e) => setMatrixSearchTerm(e.target.value)}
                    className="w-full ps-8 pe-2.5 py-1 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div className="relative w-44">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={isAr ? 'تصفية أعمدة الخامات...' : 'Filter material columns...'}
                    value={matrixMaterialFilter}
                    onChange={(e) => setMatrixMaterialFilter(e.target.value)}
                    className="w-full ps-8 pe-2.5 py-1 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowMatrixModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Matrix Scrollable Viewport with Keyboard Arrow Navigation */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl shadow-inner bg-slate-100/50">
              <table className="w-full text-start text-xs border-collapse bg-white">
                <thead className="sticky top-0 z-30 bg-slate-900 text-white shadow-md">
                  <tr>
                    {/* Frozen Left Anchor: Target Product, Scope & Status */}
                    <th className="p-3 text-start border-e border-slate-700 min-w-[250px] sticky start-0 bg-slate-900 z-40">
                      <div className="font-bold text-xs">{isAr ? 'اسم المنتج التام ونطاق التركيبة' : 'Finished Product & Scope'}</div>
                      <div className="text-[10px] text-indigo-300 font-normal">
                        {isAr ? 'المعيار: 1 وحدة كبرى (كرتونة)' : 'Yield: 1 Large Unit (Carton)'}
                      </div>
                    </th>

                    {/* Frozen Left Anchor: Validity Engine */}
                    <th className="p-3 text-start border-e border-slate-700 min-w-[170px] sticky start-[250px] bg-slate-900 z-40">
                      <div className="font-bold text-xs">{isAr ? 'فترة السريان' : 'Validity Period'}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{isAr ? 'تاريخ البداية والنهاية' : 'Start & End Dates'}</div>
                    </th>

                    {/* Frozen Left Anchor: Row Metric Identifier & Copy/Paste Controls */}
                    <th className="p-3 text-center border-e border-slate-700 min-w-[145px] sticky start-[420px] bg-slate-900 z-40">
                      <div className="font-bold text-xs">{isAr ? 'نوع السطر والنسخ' : 'Row Type & Copy'}</div>
                    </th>

                    {/* Dynamic F-Materials Horizontal Column Headers */}
                    {filteredMatrixMaterialColumns.map((mat) => (
                      <th
                        key={mat.code}
                        className="p-3 text-center border-e border-slate-800 min-w-[210px] max-w-[250px] bg-slate-900"
                      >
                        <div className="font-bold text-xs text-white truncate" title={mat.nameAr}>
                          {mat.nameAr}
                        </div>
                        <div className="flex items-center justify-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-indigo-300 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                            {mat.code}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({mat.smallUnit})
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Vertical Rows: Products sorted by Code Ascending, grouped in 3-Sub-Row Blocks */}
                <tbody className="divide-y-2 divide-slate-300">
                  {filteredMatrixProductRows.map((row, rIdx) => {
                    const rowKey = row.key;
                    const comps = row.componentsByItem || {};
                    const totalRows = filteredMatrixProductRows.length;
                    const totalCols = filteredMatrixMaterialColumns.length;

                    // Compute Progress & Status Properties
                    const activeItemsCount = Object.values(comps).filter((c) => Number(c.standardQty) > 0).length;
                    const isInactiveInMaster = row.productStatus === 'inactive';
                    
                    // Check if current row has unsaved modifications compared to initial snapshot
                    const initialRow = matrixInitialSnapshot[rowKey];
                    const isRowUnsaved = !initialRow || JSON.stringify(row) !== JSON.stringify(initialRow);

                    return (
                      <React.Fragment key={rowKey}>
                        {/* SUB-ROW 1: VARIANT SELECTION */}
                        <tr className={`transition ${isInactiveInMaster ? 'bg-slate-100/70 opacity-80' : 'bg-white hover:bg-slate-50/80'}`}>
                          {/* Merged Cell 1: Product Name, Scope, Status Badges & Item Count Chip */}
                          <td rowSpan={3} className={`p-3 border-e-2 border-slate-300 sticky start-0 z-20 align-top shadow-2xs space-y-2 ${isInactiveInMaster ? 'bg-slate-100' : 'bg-white'}`}>
                            <div className="flex items-start justify-between gap-1">
                              <div>
                                <div className="font-extrabold text-slate-900 text-xs leading-snug">
                                  {row.finishedProductNameAr}
                                </div>
                                <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                  [{row.finishedProductId}] • <b className="text-indigo-700">{row.recipeCode}</b>
                                </div>
                              </div>

                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMatrixRow(rowKey)}
                                  className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                  title={isAr ? 'حذف هذه التركيبة نهائياً' : 'Delete Recipe'}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Status & Progress Badges Stack */}
                            <div className="flex flex-wrap items-center gap-1">
                              {/* 1. Item Count Chip */}
                              {activeItemsCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-md text-[10px] font-bold">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  <span>{activeItemsCount} {isAr ? 'خامات محددة' : 'Items'}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-300 rounded-md text-[10px] font-medium">
                                  <CircleDot className="h-3 w-3 text-slate-400" />
                                  <span>{isAr ? 'بدون خامات (0)' : 'Empty (0)'}</span>
                                </span>
                              )}

                              {/* 2. Unsaved Changes Badge */}
                              {isRowUnsaved && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-md text-[10px] font-bold animate-pulse">
                                  <Sparkles className="h-3 w-3 text-amber-600" />
                                  <span>{isAr ? 'تعديل غير محفوظ' : 'Unsaved'}</span>
                                </span>
                              )}

                              {/* 3. Inactive in Master Badge */}
                              {isInactiveInMaster && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-md text-[10px] font-bold">
                                  <Ban className="h-3 w-3 text-rose-600" />
                                  <span>{isAr ? 'صنف موقوف (يمكن تخطيه)' : 'Inactive in Master'}</span>
                                </span>
                              )}
                            </div>

                            <div className="space-y-1">
                              {row.scopeType === 'option_specific' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-md text-[10px] font-bold">
                                  {isAr ? `خاص بالخيار: ${row.packagingOptionNameAr}` : `Option (${row.packagingOptionSuffix})`}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-medium">
                                  {isAr ? 'عام للصنف الرئيسي' : 'General Product'}
                                </span>
                              )}

                              <div className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                1 {row.outputLargeUnit} = {row.packagingRatio} {row.outputSmallUnit}
                              </div>
                            </div>

                            {/* Duplicate Row Button */}
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateMatrixRow(rowKey)}
                                className="w-full py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                                title={isAr ? 'استنساخ وإنشاء تركيبة بديلة لهذا المنتج' : 'Duplicate recipe row'}
                              >
                                <Plus className="h-3 w-3" />
                                <span>{isAr ? 'استنساخ تركيبة بديلة' : 'Duplicate Recipe'}</span>
                              </button>
                            </div>
                          </td>

                          {/* Merged Cell 2: Validity Settings */}
                          <td rowSpan={3} className={`p-3 border-e-2 border-slate-300 sticky start-[250px] z-20 align-top shadow-2xs space-y-1.5 ${isInactiveInMaster ? 'bg-slate-100' : 'bg-white'}`}>
                            <div>
                              <select
                                value={row.validityType}
                                onChange={(e) => handleMatrixMetaChange(rowKey, 'validityType', e.target.value)}
                                className="w-full p-1 bg-slate-50 border border-slate-300 rounded-lg text-[10px] font-bold"
                              >
                                <option value="open">{isAr ? 'سريان مفتوح' : 'Open-Ended'}</option>
                                <option value="custom_range">{isAr ? 'فترة محددة' : 'Custom Range'}</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] text-slate-400">{isAr ? 'البداية:' : 'Start:'}</label>
                              <input
                                type="date"
                                value={row.startDate}
                                onChange={(e) => handleMatrixMetaChange(rowKey, 'startDate', e.target.value)}
                                className="w-full p-1 border border-slate-300 rounded bg-white text-[10px] font-mono font-bold"
                              />
                            </div>

                            {row.validityType === 'custom_range' && (
                              <div>
                                <label className="block text-[9px] text-rose-600 font-bold">{isAr ? 'النهاية:' : 'End:'}</label>
                                <input
                                  type="date"
                                  value={row.endDate}
                                  onChange={(e) => handleMatrixMetaChange(rowKey, 'endDate', e.target.value)}
                                  className="w-full p-1 border border-rose-300 rounded bg-rose-50 text-[10px] font-mono font-bold text-rose-950"
                                />
                              </div>
                            )}
                          </td>

                          {/* Parameter 1 Label & Copy/Paste */}
                          <td className="p-2 border-e-2 border-slate-300 sticky start-[420px] bg-slate-50 z-20 font-bold text-slate-700 text-[11px]">
                            <div className="flex items-center justify-between gap-1">
                              <span>{isAr ? '١- تنوع المورد' : '1. Variant'}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleCopySubRow(rowKey, 'variant')}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                  title={isAr ? 'نسخ سطر التنوعات بالكامل' : 'Copy row'}
                                >
                                  <ClipboardCopy className="h-3 w-3" />
                                </button>
                                {copiedRowBuffer?.type === 'variant' && (
                                  <button
                                    type="button"
                                    onClick={() => handlePasteSubRow(rowKey, 'variant')}
                                    className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition font-bold"
                                    title={isAr ? 'لصق التنوعات المنسوخة هنا' : 'Paste row'}
                                  >
                                    <ClipboardPaste className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Row 1 Cells: Variant Select with Keyboard Navigation */}
                          {filteredMatrixMaterialColumns.map((mat, cIdx) => {
                            const cVal = comps[mat.code] || {};
                            const vars = mat.variations || [];

                            return (
                              <td key={mat.code} className="p-1.5 border-e border-slate-200">
                                <select
                                  id={`matrix-cell-${rIdx}-0-${cIdx}`}
                                  value={cVal.variantCode || ''}
                                  onKeyDown={(e) => handleMatrixKeyDown(e, rIdx, 0, cIdx, totalRows, totalCols)}
                                  onChange={(e) => handleMatrixCellChange(rowKey, mat.code, 'variantCode', e.target.value)}
                                  className="w-full p-1 border border-slate-300 rounded-lg text-[10px] font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none truncate"
                                  title={(() => {
                                    const selectedV = vars.find((v) => v.suffix === cVal.variantCode);
                                    if (!selectedV) return isAr ? 'عام للخامة (أي مورد متاح)' : 'Generic';
                                    const specs = (selectedV.specs || []).map((s) => `${s.label}: ${s.value}`).join(' | ') || selectedV.mergedSpecs || '';
                                    return `[${selectedV.suffix}] • ${selectedV.supplierName || '—'} • الشدة: ${selectedV.packagingRatio || 1} ${mat.smallUnit} ${specs ? `• ${specs}` : ''}`;
                                  })()}
                                >
                                  <option value="">{isAr ? '🏷️ عام للخامة (أي مورد)' : '🏷️ Generic'}</option>
                                  {vars.map((v) => {
                                    const specsStr = (v.specs || []).map((s) => `${s.label}: ${s.value}`).join(', ') || v.mergedSpecs || '';
                                    const supName = v.supplierName || (isAr ? 'مورد غير مسمى' : 'Vendor');
                                    const packRatioStr = v.packagingRatio ? `[الشدة: ${v.packagingRatio}]` : '';

                                    return (
                                      <option key={v.suffix} value={v.suffix}>
                                        [{v.suffix}] {supName} {packRatioStr} {specsStr ? `• (${specsStr})` : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </td>
                            );
                          })}
                        </tr>

                        {/* SUB-ROW 2: ENFORCEMENT POLICY */}
                        <tr className={`transition ${isInactiveInMaster ? 'bg-slate-100/70 opacity-80' : 'bg-white hover:bg-slate-50/80'}`}>
                          <td className="p-2 border-e-2 border-slate-300 sticky start-[420px] bg-slate-50 z-20 font-bold text-slate-700 text-[11px]">
                            <div className="flex items-center justify-between gap-1">
                              <span>{isAr ? '٢- سياسة التوريد' : '2. Policy'}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleCopySubRow(rowKey, 'policy')}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                  title={isAr ? 'نسخ سطر السياسات بالكامل' : 'Copy row'}
                                >
                                  <ClipboardCopy className="h-3 w-3" />
                                </button>
                                {copiedRowBuffer?.type === 'policy' && (
                                  <button
                                    type="button"
                                    onClick={() => handlePasteSubRow(rowKey, 'policy')}
                                    className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition font-bold"
                                    title={isAr ? 'لصق السياسات المنسوخة هنا' : 'Paste row'}
                                  >
                                    <ClipboardPaste className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Row 2 Cells: Policy Select */}
                          {filteredMatrixMaterialColumns.map((mat, cIdx) => {
                            const cVal = comps[mat.code] || {};
                            const hasVariant = Boolean(cVal.variantCode);

                            return (
                              <td key={mat.code} className="p-1.5 border-e border-slate-200">
                                {hasVariant ? (
                                  <select
                                    id={`matrix-cell-${rIdx}-1-${cIdx}`}
                                    value={cVal.variantPolicy || 'preferred'}
                                    onKeyDown={(e) => handleMatrixKeyDown(e, rIdx, 1, cIdx, totalRows, totalCols)}
                                    onChange={(e) => handleMatrixCellChange(rowKey, mat.code, 'variantPolicy', e.target.value)}
                                    className={`w-full p-1 border rounded-lg text-[10px] font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                      cVal.variantPolicy === 'mandatory'
                                        ? 'border-rose-400 bg-rose-50 text-rose-950'
                                        : 'border-amber-400 bg-amber-50 text-amber-950'
                                    }`}
                                  >
                                    <option value="preferred">{isAr ? '🔘 مفضل (يقبل البديل)' : 'Preferred'}</option>
                                    <option value="mandatory">{isAr ? '🔒 إلزامي (A Must)' : 'Mandatory'}</option>
                                  </select>
                                ) : (
                                  <span className="text-[10px] text-slate-300 italic block text-center">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {/* SUB-ROW 3: QUANTITY PER 1 CARTON */}
                        <tr className={`transition ${isInactiveInMaster ? 'bg-slate-200/50 opacity-80' : 'bg-indigo-50/20 hover:bg-indigo-50/40'}`}>
                          <td className="p-2 border-e-2 border-slate-300 sticky start-[420px] bg-indigo-50 z-20 font-extrabold text-indigo-900 text-[11px]">
                            <div className="flex items-center justify-between gap-1">
                              <span>{isAr ? '٣- الكمية للكرتونة' : '3. Qty / Carton'}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleCopySubRow(rowKey, 'quantity')}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                  title={isAr ? 'نسخ سطر الكميات بالكامل' : 'Copy row'}
                                >
                                  <ClipboardCopy className="h-3 w-3" />
                                </button>
                                {copiedRowBuffer?.type === 'quantity' && (
                                  <button
                                    type="button"
                                    onClick={() => handlePasteSubRow(rowKey, 'quantity')}
                                    className="p-1 text-emerald-600 hover:bg-emerald-100 rounded transition font-bold"
                                    title={isAr ? 'لصق الكميات المنسوخة هنا' : 'Paste row'}
                                  >
                                    <ClipboardPaste className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Row 3 Cells: Quantity Input */}
                          {filteredMatrixMaterialColumns.map((mat, cIdx) => {
                            const cVal = comps[mat.code] || {};
                            const qty = cVal.standardQty;

                            return (
                              <td key={mat.code} className="p-1.5 border-e border-slate-200">
                                <div className="relative">
                                  <input
                                    id={`matrix-cell-${rIdx}-2-${cIdx}`}
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="0"
                                    value={qty !== undefined ? qty : ''}
                                    onKeyDown={(e) => handleMatrixKeyDown(e, rIdx, 2, cIdx, totalRows, totalCols)}
                                    onChange={(e) => handleMatrixCellChange(rowKey, mat.code, 'standardQty', e.target.value)}
                                    className={`w-full p-1 border rounded-lg text-center font-mono font-bold text-xs transition focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                      Number(qty) > 0
                                        ? 'border-indigo-500 bg-white text-indigo-950 shadow-2xs ring-1 ring-indigo-300'
                                        : 'border-slate-200 bg-transparent text-slate-400'
                                    }`}
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Summary & Save Matrix Button */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">
                {isAr
                  ? `تم تجهيز (${filteredMatrixProductRows.length}) صفوف أصناف و (${filteredMatrixMaterialColumns.length}) أعمدة خامات (Flag F)`
                  : `Configuring (${filteredMatrixProductRows.length}) product rows across (${filteredMatrixMaterialColumns.length}) F-material columns`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMatrixModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>

                <button
                  type="button"
                  onClick={handleSaveMatrixToCloud}
                  disabled={isSaving}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{isAr ? 'حفظ وتطبيق المصفوفة' : 'Save Matrix'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}