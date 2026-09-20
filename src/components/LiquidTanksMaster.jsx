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
  FlaskConical,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Clock,
  Camera,
  UploadCloud,
  Check,
  X,
  Sparkles,
  Zap,
  Activity,
  Layers,
  Boxes,
  Factory,
  Warehouse,
  ShieldCheck,
  RotateCw,
  Search,
  Flag,
  FileText,
  Sliders,
  Settings2,
  Hash,
  Copy,
  Trash2,
  Edit3,
  History,
  Tag,
  Scale,
  Eye,
  ChevronUp,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Cog,
  Image as ImageIcon,
  Timer,
  Calendar,
  TrendingDown,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import { buildLiveStockMatrix, matchWarehouse, getFactoryFloorWarehouse } from '../utils/stockResolver';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

// Helper: Normalize Arabic-Indic digits to standard digits
const normalizeArabicNumerals = (str) => {
  if (str === null || str === undefined) return '';
  const arabicMap = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '٫': '.', '،': '.', ',': '.'
  };
  return String(str).replace(/[٠-٩٫،,]/g, (d) => arabicMap[d] || d);
};

// Client-Side Image Compression Helper (<80KB Web-Ready Payloads)
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
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function LiquidTanksMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const currentUserName = isAr ? (currentUser?.nameAr || 'المسؤول') : (currentUser?.name || 'Authorized User');

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('liquid_tanks'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('liquid_tanks'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#0d6cba';
  const { r, g, b } = hexToRgb(tabColor);

  // Dynamic Authority Resolvers
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canCreate'] !== undefined
      ? permissions.actions['liquid_tanks.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canEdit = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canEdit'] !== undefined
      ? permissions.actions['liquid_tanks.canEdit'] === true
      : permissions?.actions?.canEdit === true
  );

  const canAnalyzeQA = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canAnalyzeQA'] !== undefined
      ? permissions.actions['liquid_tanks.canAnalyzeQA'] === true
      : permissions?.actions?.canAnalyzeQA === true
  );

  const canApproveQA = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canApproveQA'] !== undefined
      ? permissions.actions['liquid_tanks.canApproveQA'] === true
      : permissions?.actions?.canApproveQA === true
  );

  const canStartPump = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canStartPump'] !== undefined
      ? permissions.actions['liquid_tanks.canStartPump'] === true
      : (permissions?.actions?.['liquid_tanks.canPump'] !== undefined ? permissions.actions['liquid_tanks.canPump'] === true : permissions?.actions?.canStartPump === true)
  );

  const canPauseResumePump = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canPauseResumePump'] !== undefined
      ? permissions.actions['liquid_tanks.canPauseResumePump'] === true
      : (permissions?.actions?.['liquid_tanks.canPump'] !== undefined ? permissions.actions['liquid_tanks.canPump'] === true : permissions?.actions?.canPauseResumePump === true)
  );

  const canFinishPump = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canFinishPump'] !== undefined
      ? permissions.actions['liquid_tanks.canFinishPump'] === true
      : (permissions?.actions?.['liquid_tanks.canPump'] !== undefined ? permissions.actions['liquid_tanks.canPump'] === true : permissions?.actions?.canFinishPump === true)
  );

  const canViewRStock = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canViewRStock'] !== undefined
      ? permissions.actions['liquid_tanks.canViewRStock'] === true
      : permissions?.actions?.canViewRStock !== false
  );

  const canSubmitHandover = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canSubmitHandover'] !== undefined
      ? permissions.actions['liquid_tanks.canSubmitHandover'] === true
      : permissions?.actions?.canSubmitHandover === true
  );

  const canConfigureSerial = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canConfigureSerial'] !== undefined
      ? permissions.actions['liquid_tanks.canConfigureSerial'] === true
      : permissions?.actions?.canConfigureSerial === true
  );

  const canViewAudit = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canViewAudit'] !== undefined
      ? permissions.actions['liquid_tanks.canViewAudit'] === true
      : permissions?.actions?.canViewAudit !== false
  );

  const canDelete = isGeneralAdmin || (
    permissions?.actions?.['liquid_tanks.canDelete'] !== undefined
      ? permissions.actions['liquid_tanks.canDelete'] === true
      : permissions?.actions?.canDelete === true
  );

  // Cloud Collections State
  const [tanks, setTanks] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [intermediateRecipes, setIntermediateRecipes] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [systemSerialConfig, setSystemSerialConfig] = useState({
    startingSerialNumber: 1,
    mItemsOrder: [],
    recipeOrders: {},
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modals State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingTank, setEditingTank] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configSerialInput, setConfigSerialInput] = useState('1');
  const [configMItemsList, setConfigMItemsList] = useState([]);
  const [configRecipeOrders, setConfigRecipeOrders] = useState({});
  const [configSelectedMItemCode, setConfigSelectedMItemCode] = useState('');
  const [showQAModal, setShowQAModal] = useState(null);
  const [qaFormData, setQaFormData] = useState({ concentration: '', oxidation: '', notes: '', labImage: '' });
  const [showAuditModal, setShowAuditModal] = useState(null);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverData, setHandoverData] = useState({ labelImage: '', enteredSerial: '', notes: '' });
  const [showRStockModal, setShowRStockModal] = useState(false);
  const [imagePreviewModal, setImagePreviewModal] = useState(null);

  // Filter State (Date Range Defaults to Today)
  const getTodayIso = () => new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(getTodayIso());
  const [toDate, setToDate] = useState(getTodayIso());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Quick Date Preset Handler
  const handleSetDatePreset = (preset) => {
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];

    if (preset === 'today') {
      setFromDate(todayIso);
      setToDate(todayIso);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yIso = y.toISOString().split('T')[0];
      setFromDate(yIso);
      setToDate(yIso);
    } else if (preset === 'last7') {
      const d7 = new Date(today);
      d7.setDate(d7.getDate() - 6);
      setFromDate(d7.toISOString().split('T')[0]);
      setToDate(todayIso);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(firstDay.toISOString().split('T')[0]);
      setToDate(todayIso);
    }
  };

  // Helper to extract date string from a tank record
  const getTankDateStr = (t) => {
    if (t.createdAt?.seconds) {
      return new Date(t.createdAt.seconds * 1000).toISOString().split('T')[0];
    }
    if (t.pumpStartedAt) {
      return t.pumpStartedAt.split('T')[0];
    }
    if (t.createdAt && typeof t.createdAt === 'string') {
      return t.createdAt.split('T')[0];
    }
    return '';
  };

  // Registration & Edit Form State
  const [selectedItemCode, setSelectedItemCode] = useState('');
  const [selectedPrepCode, setSelectedPrepCode] = useState('');
  const [quantityCount, setQuantityCount] = useState('1');
  const [tankNumber, setTankNumber] = useState('');
  const [tankImage, setTankImage] = useState('');

  // Live Second-by-Second Timer Ticker for Active Pumping Tanks
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const hasPumping = tanks.some((t) => t.pumpStatus === 'pumping');
    if (!hasPumping) return;
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [tanks]);

  // Helper to calculate exact elapsed net lifting seconds (excluding pause gaps)
  const getTankLiftingSeconds = (tank) => {
    if (tank.netDurationSec && tank.pumpStatus === 'completed') {
      return tank.netDurationSec;
    }

    const segments = tank.pumpSegments || [];
    let totalMs = 0;

    if (segments.length > 0) {
      segments.forEach((seg) => {
        if (seg.start && seg.end) {
          totalMs += Math.max(0, new Date(seg.end).getTime() - new Date(seg.start).getTime());
        } else if (seg.start && !seg.end && tank.pumpStatus === 'pumping') {
          totalMs += Math.max(0, currentTime - new Date(seg.start).getTime());
        }
      });
    } else if (tank.pumpStartedAt) {
      if (tank.pumpFinishedAt) {
        totalMs = Math.max(0, new Date(tank.pumpFinishedAt).getTime() - new Date(tank.pumpStartedAt).getTime());
      } else if (tank.pumpStatus === 'pumping') {
        totalMs += Math.max(0, currentTime - new Date(tank.pumpStartedAt).getTime());
      }
    }

    return Math.floor(totalMs / 1000);
  };

  // Format seconds to mm:ss or hh:mm:ss
  const formatDurationDisplay = (totalSec) => {
    if (!totalSec || totalSec <= 0) return '00:00';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Subscribe to Cloud Firestore Collections
  useEffect(() => {
    const unsubTanks = onSnapshot(collection(db, 'liquid_tanks'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (Number(b.tankNumber) || 0) - (Number(a.tankNumber) || 0));
      setTanks(list);
      setLoading(false);
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      setItemsMaster(list);
    });

    const unsubRecipes = onSnapshot(collection(db, 'intermediate_recipes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
      setIntermediateRecipes(list);
    });

    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setWarehouses(list);
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceipts(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransformations = onSnapshot(collection(db, 'production_transformations'), (snap) => {
      setTransformations(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubConfig = onSnapshot(doc(db, 'system_config', 'tanks_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSystemSerialConfig({
          startingSerialNumber: Number(data.startingSerialNumber) || 1,
          mItemsOrder: Array.isArray(data.mItemsOrder) ? data.mItemsOrder : [],
          recipeOrders: data.recipeOrders && typeof data.recipeOrders === 'object' ? data.recipeOrders : {},
        });
      }
    });

    return () => {
      unsubTanks();
      unsubItems();
      unsubRecipes();
      unsubWh();
      unsubGrns();
      unsubTransfers();
      unsubTransformations();
      unsubConfig();
    };
  }, []);

  // Filter M-Items strictly ordered by custom configured sequence
  const mItems = useMemo(() => {
    const list = itemsMaster.filter((item) => {
      const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
      return flagsArr.some((f) => String(f).toUpperCase().includes('M'));
    });

    const orderMap = {};
    (systemSerialConfig.mItemsOrder || []).forEach((code, idx) => {
      orderMap[code] = idx;
    });

    list.sort((a, b) => {
      const orderA = orderMap[a.code] !== undefined ? orderMap[a.code] : 9999;
      const orderB = orderMap[b.code] !== undefined ? orderMap[b.code] : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
    });

    return list;
  }, [itemsMaster, systemSerialConfig.mItemsOrder]);

  // Unified Helper: Retrieve sorted recipes for any M-item respecting configured order
  const getSortedRecipesForItem = (itemCode) => {
    if (!itemCode) return [];
    const list = intermediateRecipes.filter((r) => r.targetItemId === itemCode);
    const customOrder = systemSerialConfig.recipeOrders?.[itemCode] || [];

    const orderMap = {};
    customOrder.forEach((code, idx) => {
      orderMap[code] = idx;
    });

    list.sort((a, b) => {
      const orderA = orderMap[a.code] !== undefined ? orderMap[a.code] : (orderMap[a.prepCode] !== undefined ? orderMap[a.prepCode] : 9999);
      const orderB = orderMap[b.code] !== undefined ? orderMap[b.code] : (orderMap[b.prepCode] !== undefined ? orderMap[b.prepCode] : 9999);
      if (orderA !== orderB) return orderA - orderB;
      return (a.prepCode || a.code || '').localeCompare(b.prepCode || b.code || '', undefined, { numeric: true });
    });

    return list;
  };

  // Selected item's registered recipes derived directly from the unified ordering engine
  const selectedItemRecipes = useMemo(() => {
    return getSortedRecipesForItem(selectedItemCode);
  }, [selectedItemCode, intermediateRecipes, systemSerialConfig.recipeOrders]);

  // Helper: Match warehouse by ID, code, or name
  const matchWh = (val, target) => {
    if (!val || !target) return false;
    return val === target.id || val === target.code || val === target.nameAr || val === target.nameEn;
  };

  // Compiled Live Multi-Warehouse Stock Matrix (Central App-Wide Engine)
  const liveStockMatrix = useMemo(() => {
    return buildLiveStockMatrix({
      itemsMaster,
      warehouses,
      goodsReceipts,
      transfers,
      transformations,
    });
  }, [itemsMaster, warehouses, goodsReceipts, transfers, transformations]);

  // Non-utility R-Materials Stock Engine (Source WH vs Entire Company in Small & Large Units)
  const rItemsStockData = useMemo(() => {
    const nonUtilityRItems = itemsMaster.filter((item) => {
      if (item.isStocklessUtility) return false;
      const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
      return flagsArr.some((f) => String(f).toUpperCase().includes('R'));
    });

    const defaultSourceWhId = mItems[0]?.rawMaterialSourceWh || warehouses.find((w) => w.classification === 'raw_materials')?.id || warehouses[0]?.id || '';
    const sourceWhObj = warehouses.find((w) => matchWarehouse(defaultSourceWhId, w)) || {
      id: defaultSourceWhId,
      code: defaultSourceWhId,
      nameAr: isAr ? 'مخزن الخامات' : 'Raw Materials WH',
    };

    return nonUtilityRItems.map((item) => {
      const parentEntry = liveStockMatrix.parentMap[item.code];
      let sourceWhSmall = 0;
      const totalCompanySmall = Math.max(0, parentEntry?.totalQty || 0);

      if (parentEntry?.byWarehouse) {
        Object.entries(parentEntry.byWarehouse).forEach(([whId, qty]) => {
          if (matchWarehouse(whId, sourceWhObj)) {
            sourceWhSmall += Math.max(0, qty);
          }
        });
      }

      const ratio = Number(item.packagingRatio || item.variations?.[0]?.packagingRatio || 1);
      const sourceWhLarge = Number((sourceWhSmall / ratio).toFixed(2));
      const totalCompanyLarge = Number((totalCompanySmall / ratio).toFixed(2));

      return {
        code: item.code,
        nameAr: item.nameAr,
        shortName: item.shortName || item.nameAr,
        smallUnit: item.smallUnit || 'كجم',
        largeUnitName: item.largeUnitName || 'برميل/شيكارة',
        packagingRatio: ratio,
        sourceWhSmall,
        sourceWhLarge,
        totalCompanySmall,
        totalCompanyLarge,
        sourceWhName: sourceWhObj.nameAr || sourceWhObj.code,
      };
    });
  }, [itemsMaster, liveStockMatrix, mItems, warehouses, isAr]);

  // Verify Raw Materials Availability in Source WH strictly scaled to BOM multiplier
  const evaluateRecipeStockDeficit = (recipe, sourceWhId, multiplier = 1) => {
    if (!recipe || !Array.isArray(recipe.components)) return [];
    const deficits = [];
    const sourceWhObj = warehouses.find((w) => matchWarehouse(sourceWhId, w)) || { id: sourceWhId, code: sourceWhId };

    recipe.components.forEach((comp) => {
      const itemMasterDoc = itemsMaster.find((i) => i.code === comp.itemId);
      if (itemMasterDoc?.isStocklessUtility) return; // Skip utilities (e.g. municipal water)

      const requiredQty = Number(comp.standardQty || 0) * multiplier;
      let availableInSource = 0;

      if (comp.variantCode) {
        const varKey = `${comp.itemId}_${comp.variantCode}`;
        const varEntry = liveStockMatrix.varMap[varKey];
        if (varEntry?.byWarehouse) {
          Object.entries(varEntry.byWarehouse).forEach(([whId, qty]) => {
            if (matchWarehouse(whId, sourceWhObj)) {
              availableInSource += Math.max(0, qty);
            }
          });
        }
      } else {
        const parentEntry = liveStockMatrix.parentMap[comp.itemId];
        if (parentEntry?.byWarehouse) {
          Object.entries(parentEntry.byWarehouse).forEach(([whId, qty]) => {
            if (matchWarehouse(whId, sourceWhObj)) {
              availableInSource += Math.max(0, qty);
            }
          });
        }
      }

      if (availableInSource < requiredQty) {
        deficits.push({
          itemId: comp.itemId,
          nameAr: comp.materialNameAr || itemMasterDoc?.nameAr || comp.itemId,
          requiredQty,
          availableInSource,
          deficit: requiredQty - availableInSource,
          unit: comp.unit || itemMasterDoc?.smallUnit || 'كجم',
        });
      }
    });

    return deficits;
  };

  // Serial Tracking Engine: Calculate the next sequential serial number
  const nextRecommendedSerial = useMemo(() => {
    const existingNumbers = tanks
      .map((t) => Number(t.tankNumber))
      .filter((n) => !isNaN(n) && n > 0);

    const baseSeed = Number(systemSerialConfig.startingSerialNumber) || 1;
    if (existingNumbers.length === 0) return baseSeed;

    const maxExisting = Math.max(...existingNumbers);
    return Math.max(baseSeed, maxExisting + 1);
  }, [tanks, systemSerialConfig]);

  // Duplicate Check against all recorded tanks (excludes self if editing)
  const isDuplicateTank = useMemo(() => {
    if (!tankNumber.toString().trim()) return false;
    const targetNum = Number(normalizeArabicNumerals(tankNumber));
    return tanks.some((t) => Number(t.tankNumber) === targetNum && (!editingTank || t.id !== editingTank.id));
  }, [tanks, tankNumber, editingTank]);

  // Gap / Skipping Check
  const isSkippingSerial = useMemo(() => {
    if (editingTank || !tankNumber.toString().trim()) return false;
    const currentNum = Number(normalizeArabicNumerals(tankNumber));
    return currentNum > nextRecommendedSerial;
  }, [tankNumber, nextRecommendedSerial, editingTank]);

  // Active selected recipe resolution
  const activeRecipe = useMemo(() => {
    if (!selectedItemRecipes || selectedItemRecipes.length === 0) return null;
    return selectedItemRecipes.find((r) => r.prepCode === selectedPrepCode) || selectedItemRecipes[0] || null;
  }, [selectedItemRecipes, selectedPrepCode]);

  // Dynamic feature toggles derived directly from the selected recipe
  const requiresTankSerial = activeRecipe ? activeRecipe.needsTankSerial !== false : true;
  const requiresQA = activeRecipe ? activeRecipe.needsQA !== false : true;

  // Open Registration Modal with First Configured M-Item, First Configured Recipe & Next Serial Seed
  const handleOpenRegister = () => {
    setEditingTank(null);
    const defaultItem = mItems[0];
    const defaultItemCode = defaultItem?.code || '';
    setSelectedItemCode(defaultItemCode);

    const sortedRecipes = getSortedRecipesForItem(defaultItemCode);
    const firstValidPrep = sortedRecipes.find((r) => r.prepCode && r.prepCode.trim())?.prepCode || '';
    setSelectedPrepCode(firstValidPrep);

    setQuantityCount('1');
    setTankNumber(String(nextRecommendedSerial));
    setTankImage('');
    setShowRegisterModal(true);
  };

  // Open Edit Modal for Existing Tank
  const handleOpenEdit = (tank) => {
    setEditingTank(tank);
    setSelectedItemCode(tank.itemCode);
    setSelectedPrepCode(tank.prepCode || '');
    setQuantityCount(String(tank.quantityCount || 1));
    setTankNumber(tank.tankNumber ? String(tank.tankNumber) : '');
    setTankImage(tank.imageFile || '');
    setShowRegisterModal(true);
  };

  // Open Full Configurator Modal (Serial, M-Items Order & Preparation Methods Order)
  const handleOpenConfigModal = () => {
    setConfigSerialInput(String(systemSerialConfig.startingSerialNumber || 1));
    const currentMList = [...mItems];
    setConfigMItemsList(currentMList);

    // Build fully populated recipe orders map for every M-item
    const initialRecipeOrders = {};
    currentMList.forEach((item) => {
      const sortedRecs = getSortedRecipesForItem(item.code);
      initialRecipeOrders[item.code] = sortedRecs.map((r) => r.code);
    });

    setConfigRecipeOrders(initialRecipeOrders);
    setConfigSelectedMItemCode(currentMList[0]?.code || '');
    setShowConfigModal(true);
  };

  // Reordering helper for M-items
  const handleMoveMItem = (index, delta) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= configMItemsList.length) return;
    const updated = [...configMItemsList];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setConfigMItemsList(updated);
  };

  // Reordering helper for Recipes per M-item (guarantees non-empty active list)
  const handleMoveRecipe = (itemCode, recipeIndex, delta) => {
    const allItemRecipes = intermediateRecipes.filter((r) => r.targetItemId === itemCode);
    const existingOrder = configRecipeOrders[itemCode] || [];
    
    // Resolve full list of recipe codes in current order
    const orderedCodes = [];
    existingOrder.forEach((c) => {
      if (allItemRecipes.some((r) => r.code === c)) orderedCodes.push(c);
    });
    allItemRecipes.forEach((r) => {
      if (!orderedCodes.includes(r.code)) orderedCodes.push(r.code);
    });

    const targetIndex = recipeIndex + delta;
    if (targetIndex < 0 || targetIndex >= orderedCodes.length) return;

    const updated = [...orderedCodes];
    const [moved] = updated.splice(recipeIndex, 1);
    updated.splice(targetIndex, 0, moved);

    setConfigRecipeOrders((prev) => ({
      ...prev,
      [itemCode]: updated,
    }));
  };

  // Save Comprehensive Configuration
  const handleSaveSerialConfig = async (e) => {
    e.preventDefault();
    if (!canConfigureSerial) {
      alert(isAr ? 'ليس لديك صلاحية ضبط السيريال وترتيب الخامات.' : 'Permission denied.');
      return;
    }

    const cleanNum = Math.max(1, Number(normalizeArabicNumerals(configSerialInput)) || 1);
    const mItemsOrderCodes = configMItemsList.map((item) => item.code);

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'system_config', 'tanks_config'),
        {
          startingSerialNumber: cleanNum,
          mItemsOrder: mItemsOrderCodes,
          recipeOrders: configRecipeOrders,
          configuredBy: currentUserName,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setShowConfigModal(false);
    } catch (err) {
      console.error('Error saving tanks configuration:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ الإعدادات.' : 'Error saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Tank Registration / Edit with Strict Intermediate BOM Scaling & Structured LOTs
  const handleSaveTank = async (e) => {
    e?.preventDefault();
    const targetItem = mItems.find((i) => i.code === selectedItemCode);
    const selectedRecipe = activeRecipe || selectedItemRecipes[0] || intermediateRecipes.find((r) => r.targetItemId === selectedItemCode) || null;
    const isTankSerialized = selectedRecipe ? selectedRecipe.needsTankSerial !== false : true;
    const isQARequired = selectedRecipe ? selectedRecipe.needsQA !== false : true;
    const cleanTankNum = isTankSerialized ? Number(normalizeArabicNumerals(tankNumber)) : null;

    if (!selectedItemCode) {
      alert(isAr ? 'يرجى اختيار نوع الخامة.' : 'Please select material.');
      return;
    }

    if (isTankSerialized) {
      if (!cleanTankNum || isNaN(cleanTankNum)) {
        alert(isAr ? 'يرجى إدخال رقم تانك صحيح.' : 'Please enter valid tank number.');
        return;
      }
      if (isDuplicateTank) {
        alert(isAr ? 'هذا التانك مسجل مسبقاً (سيريال مكرر).' : 'This tank serial is already recorded.');
        return;
      }
      if (!editingTank && isSkippingSerial) {
        const proceed = window.confirm(
          isAr
            ? `تنبيه تخطي السيريال:\nالسيريال المتوقع التالي هو (#${nextRecommendedSerial}) بينما أدخلت (#${cleanTankNum}).\n\nهل ترغب في المتابعة بهذا الرقم وتخطي التسلسل؟`
            : `Serial gap: Expected #${nextRecommendedSerial}, but entered #${cleanTankNum}. Proceed?`
        );
        if (!proceed) return;
      }
      if (!tankImage) {
        alert(isAr ? 'يرجى التقاط أو رفع صورة التانك (حقل إلزامي).' : 'Tank image is required.');
        return;
      }
    }

    const sourceWhId = targetItem?.rawMaterialSourceWh || warehouses.find((w) => w.classification === 'raw_materials')?.id || warehouses[0]?.id || '';
    const cleanQty = isTankSerialized ? 1 : (Number(normalizeArabicNumerals(quantityCount)) || 1);

    // Gate: Check Raw Materials availability in Source Warehouse scaled by cleanQty
    if (!editingTank && selectedRecipe) {
      const deficits = evaluateRecipeStockDeficit(selectedRecipe, sourceWhId, cleanQty);
      if (deficits.length > 0) {
        const deficitSummary = deficits
          .map((d) => `• ${d.nameAr} [${d.itemId}]: المطلوب (${d.requiredQty.toLocaleString()} ${d.unit}) | المتاح بمخزن الصرف (${d.availableInSource.toLocaleString()} ${d.unit}) [عجز: -${d.deficit.toLocaleString()} ${d.unit}]`)
          .join('\n');
        alert(
          isAr
            ? `🚫 لا يمكن تسجيل التانك لنقص خامات التحضير في مخزن الصرف:\n\n${deficitSummary}\n\nيرجى تحويل الخامات الناقصة لمخزن التحضير أولاً.`
            : `Insufficient raw materials in source warehouse:\n\n${deficitSummary}`
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      const todayCompact = todayStr.replace(/-/g, '');
      const timeSeed = Date.now();

      // Robust LOT ID & Short Display Tag Generation
      const tankDocId = editingTank?.id || (isTankSerialized ? `TANK-${timeSeed}-${cleanTankNum}` : `BATCH-${timeSeed}`);
      const tankLotNumber = isTankSerialized
        ? `TANK-${cleanTankNum}`
        : `LOT-${todayCompact}-${selectedItemCode}-${String(timeSeed).slice(-4)}`;
      const shortDisplayId = isTankSerialized ? `#${cleanTankNum}` : `تشغيلة #${String(timeSeed).slice(-4)}`;

      // Strict BOM Calculation
      const standardBatchYield = Number(selectedRecipe?.batchYieldQty) || 200;
      const totalTransformedYield = standardBatchYield * cleanQty;
      const yieldUnit = selectedRecipe?.yieldUnit || targetItem?.smallUnit || 'لتر';
      const selectedVariantSuffix = selectedRecipe?.targetVariantSuffix || (targetItem?.variations?.[0]?.suffix || 'A');
      const selectedVariantCode = `${selectedItemCode}-${selectedVariantSuffix}`;
      const transformationDocId = editingTank?.transformationDocId || `TRANS-${tankDocId}`;

      const auditEntry = editingTank
        ? {
            action: 'edited',
            actionLabelAr: 'تعديل بيانات التشغيلة',
            actionLabelEn: 'Batch Details Edited',
            user: currentUserName,
            timestamp: nowIso,
            summary: isAr ? 'تم تعديل بيانات ومواصفات أو صورة التشغيلة' : 'Batch details updated',
          }
        : {
            action: 'registered',
            actionLabelAr: isTankSerialized ? 'تسجيل التانك واستهلاك خامات التحضير' : 'تسجيل تشغيلة خامة وسيطة',
            actionLabelEn: isTankSerialized ? 'Tank Registered & R-Materials Consumed' : 'Batch Registered',
            user: currentUserName,
            timestamp: nowIso,
            summary: isTankSerialized
              ? (isAr ? `تم تسجيل التانك (#${cleanTankNum}) وتوليد اللوط (${tankLotNumber}) بحجم (${totalTransformedYield.toLocaleString()} ${yieldUnit})` : `Tank #${cleanTankNum} registered (${totalTransformedYield} ${yieldUnit})`)
              : (isAr ? `تم تسجيل عدد (${cleanQty}) تشغيلة بإجمالي (${totalTransformedYield.toLocaleString()} ${yieldUnit}) باللوط (${tankLotNumber})` : `Batch of (${cleanQty}) registered (${totalTransformedYield} ${yieldUnit})`),
          };

      const existingAudit = Array.isArray(editingTank?.auditTrail) ? editingTank.auditTrail : [];

      const payload = {
        id: tankDocId,
        tankNumber: cleanTankNum,
        lotNumber: tankLotNumber,
        shortLotNumber: shortDisplayId,
        itemCode: selectedItemCode,
        variantCode: selectedVariantCode,
        variantSuffix: selectedVariantSuffix,
        itemNameAr: targetItem?.nameAr || selectedItemCode,
        shortName: targetItem?.shortName || targetItem?.nameAr || selectedItemCode,
        prepCode: selectedRecipe?.prepCode || null,
        needsQA: isQARequired,
        needsTankSerial: isTankSerialized,
        quantityCount: cleanQty,
        batchYieldQty: totalTransformedYield,
        singleBatchYieldQty: standardBatchYield,
        yieldUnit: yieldUnit,
        recipeId: selectedRecipe?.code || null,
        recipeName: selectedRecipe?.nameAr || null,
        sourceWarehouse: sourceWhId,
        transformationDocId: transformationDocId,
        imageFile: tankImage || '',
        qaStatus: editingTank ? editingTank.qaStatus : (!isQARequired ? 'bypassed' : 'pending'),
        qaData: editingTank?.qaData || null,
        pumpStatus: editingTank?.pumpStatus || 'idle',
        registeredBy: editingTank?.registeredBy || currentUserName,
        auditTrail: [auditEntry, ...existingAudit],
        updatedAt: serverTimestamp(),
      };

      if (!editingTank) {
        payload.createdAt = serverTimestamp();
      }

      // 1. Save Tank Record
      batch.set(doc(db, 'liquid_tanks', tankDocId), payload, { merge: true });

      // 2. Dedicated Production Transformation Record (Decoupled from goods_receipts)
      if (!editingTank && selectedRecipe) {
        const consumedLines = (selectedRecipe.components || [])
          .filter((c) => !itemsMaster.find((itm) => itm.code === c.itemId)?.isStocklessUtility)
          .map((c) => {
            const itmDoc = itemsMaster.find((itm) => itm.code === c.itemId);
            const ratio = Number(itmDoc?.packagingRatio || 1);
            const scaledStdQty = Number(c.standardQty || 0) * cleanQty;
            const resolvedVarCode = c.variantCode || itmDoc?.variations?.[0]?.variantCode || `${c.itemId}-A`;

            return {
              itemId: c.itemId,
              variantCode: resolvedVarCode,
              code: resolvedVarCode,
              nameAr: c.materialNameAr || itmDoc?.nameAr || c.itemId,
              nameEn: itmDoc?.nameEn || '',
              smallUnit: c.unit || itmDoc?.smallUnit || 'كجم',
              largeUnitName: itmDoc?.largeUnitName || 'شيكارة',
              packagingRatio: ratio,
              qtySmallUnits: scaledStdQty,
              qtyLargeUnits: Number((scaledStdQty / ratio).toFixed(2)),
              warehouseId: sourceWhId,
              lotNumber: tankLotNumber,
            };
          });

        batch.set(doc(db, 'production_transformations', transformationDocId), {
          id: transformationDocId,
          tankId: tankDocId,
          tankNumber: cleanTankNum,
          lotNumber: tankLotNumber,
          date: todayStr,
          warehouseId: sourceWhId,
          itemCode: selectedItemCode,
          variantCode: selectedVariantCode,
          itemNameAr: targetItem?.nameAr || selectedItemCode,
          itemNameEn: targetItem?.nameEn || targetItem?.nameAr || '',
          specs: selectedRecipe.nameAr || '',
          producedQty: totalTransformedYield,
          yieldUnit: yieldUnit,
          consumedComponents: consumedLines,
          status: 'completed',
          registeredBy: currentUserName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setShowRegisterModal(false);
    } catch (err) {
      console.error('Error saving tank:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التانك.' : 'Error saving tank.');
    } finally {
      setIsSaving(false);
    }
  };

  // QA Analysis Submission (Auto-Approved on Save)
  const handleSaveQA = async (e) => {
    e.preventDefault();
    if (!showQAModal) return;

    const cleanConc = normalizeArabicNumerals(qaFormData.concentration);
    if (!cleanConc || isNaN(Number(cleanConc)) || Number(cleanConc) <= 0) {
      alert(isAr ? 'يرجى إدخال نسبة تركيز صحيحة (حقل إلزامي).' : 'Please enter valid concentration % (Required).');
      return;
    }

    if (!qaFormData.labImage) {
      alert(isAr ? 'يرجى التقاط أو إرفاق صورة فحص المعمل (حقل إلزامي).' : 'Lab test photo is required.');
      return;
    }

    let cleanOxidation = null;
    if (qaFormData.oxidation !== '' && qaFormData.oxidation !== null && qaFormData.oxidation !== undefined) {
      const oxNum = Number(normalizeArabicNumerals(qaFormData.oxidation));
      if (isNaN(oxNum) || oxNum < 500 || oxNum > 1500) {
        alert(isAr ? 'درجة الأكسدة يجب أن تكون رقماً بين 500 و 1500.' : 'Oxidation value must be between 500 and 1500.');
        return;
      }
      cleanOxidation = oxNum;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();

      const auditEntry = {
        action: 'qa_submitted',
        actionLabelAr: 'اعتماد فحص الجودة (مطابق)',
        actionLabelEn: 'QA Approved',
        user: currentUserName,
        timestamp: nowIso,
        summary: isAr 
          ? `نسبة التركيز: ${cleanConc}%${cleanOxidation ? ` • الأكسدة: ${cleanOxidation}` : ''} • تم الاعتماد بنجاح`
          : `Concentration: ${cleanConc}%${cleanOxidation ? ` • Oxidation: ${cleanOxidation}` : ''} • Verified and approved`,
      };

      const existingAudit = Array.isArray(showQAModal.auditTrail) ? showQAModal.auditTrail : [];

      await setDoc(
        doc(db, 'liquid_tanks', showQAModal.id),
        {
          qaStatus: 'passed',
          qaData: {
            concentration: Number(cleanConc),
            oxidation: cleanOxidation,
            labImage: qaFormData.labImage,
            notes: (qaFormData.notes || '').trim(),
            analyzedBy: currentUserName,
            analyzedAt: nowIso,
          },
          auditTrail: [auditEntry, ...existingAudit],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setShowQAModal(null);
    } catch (err) {
      console.error('Error saving QA analysis:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Lifting / Pumping Lifecycle with Net Duration Tracking (Excluding Pauses)
  const handlePumpAction = async (tank, actionType) => {
    if (tank.needsQA && tank.qaStatus !== 'passed' && tank.qaStatus !== 'bypassed') {
      alert(isAr ? 'لا يمكن تشغيل طلمبة الرفع قبل اعتماد فحص الجودة (QA) بنجاح.' : 'Cannot pump before QA verification.');
      return;
    }

    const nowIso = new Date().toISOString();
    let newPumpStatus = tank.pumpStatus;
    let newStatus = tank.status || 'active';
    let auditAction = '';
    let auditLabelAr = '';
    let auditSummary = '';

    const segments = Array.isArray(tank.pumpSegments) ? [...tank.pumpSegments] : [];
    let calculatedNetSec = tank.netDurationSec || 0;

    if (actionType === 'start') {
      newPumpStatus = 'pumping';
      segments.push({ start: nowIso, end: null });
      auditAction = 'pump_started';
      auditLabelAr = 'بدء تشغيل طلمبة الرفع';
      auditSummary = isAr ? 'بدء تشغيل الطلمبة ورفع الخامة لصالة الإنتاج' : 'Lifting pump started';
    } else if (actionType === 'pause') {
      newPumpStatus = 'paused';
      if (segments.length > 0 && !segments[segments.length - 1].end) {
        segments[segments.length - 1].end = nowIso;
      }
      auditAction = 'pump_paused';
      auditLabelAr = 'إيقاف مؤقت للرفع';
      auditSummary = isAr ? 'تم إيقاف طلمبة الرفع مؤقتاً' : 'Lifting pump paused';
    } else if (actionType === 'resume') {
      newPumpStatus = 'pumping';
      segments.push({ start: nowIso, end: null });
      auditAction = 'pump_resumed';
      auditLabelAr = 'استئناف الرفع';
      auditSummary = isAr ? 'تم استئناف تشغيل طلمبة الرفع' : 'Lifting pump resumed';
    } else if (actionType === 'finish') {
      newPumpStatus = 'completed';
      newStatus = 'completed';

      if (segments.length > 0 && !segments[segments.length - 1].end) {
        segments[segments.length - 1].end = nowIso;
      }

      // Compute final accurate net duration across all active segments
      let totalMs = 0;
      segments.forEach((seg) => {
        if (seg.start && seg.end) {
          totalMs += Math.max(0, new Date(seg.end).getTime() - new Date(seg.start).getTime());
        }
      });
      calculatedNetSec = Math.floor(totalMs / 1000);

      auditAction = 'pump_finished';
      auditLabelAr = 'إنهاء الرفع واكتمال التفريغ';
      auditSummary = isAr 
        ? `تم اكتمال الرفع في مدة صافية قدرها (${formatDurationDisplay(calculatedNetSec)})`
        : `Lifting completed in net duration of (${formatDurationDisplay(calculatedNetSec)})`;
    }

    const auditEntry = {
      action: auditAction,
      actionLabelAr: auditLabelAr,
      actionLabelEn: auditAction,
      user: currentUserName,
      timestamp: nowIso,
      summary: auditSummary,
    };

    const existingAudit = Array.isArray(tank.auditTrail) ? tank.auditTrail : [];

    setIsSaving(true);
    try {
      const batch = writeBatch(db);

      // 1. Update Tank State
      batch.set(
        doc(db, 'liquid_tanks', tank.id),
        {
          pumpStatus: newPumpStatus,
          status: newStatus,
          pumpSegments: segments,
          netDurationSec: calculatedNetSec,
          pumpStartedAt: tank.pumpStartedAt || (actionType === 'start' ? nowIso : null),
          pumpFinishedAt: actionType === 'finish' ? nowIso : null,
          auditTrail: [auditEntry, ...existingAudit],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2. On Finished Lifting: Auto-commit pipeline transfer to dynamic factory floor warehouse
      if (actionType === 'finish') {
        const factoryWhObj = getFactoryFloorWarehouse(warehouses);
        const factoryWhId = factoryWhObj?.id || factoryWhObj?.code || '';
        const trnId = `TRN-PIPE-${tank.id}`;
        const tankLot = tank.lotNumber || (tank.tankNumber ? `TANK-${tank.tankNumber}` : `LOT-${tank.id}`);
        const transferQty = Number(tank.batchYieldQty) || 200;
        const transferLargeQty = Number(tank.quantityCount) || 1;

        batch.set(doc(db, 'liquid_tanks', tank.id), { pipeTransferDocId: trnId }, { merge: true });

        batch.set(doc(db, 'stock_transfers', trnId), {
          id: trnId,
          sourceWarehouse: tank.sourceWarehouse,
          targetWarehouse: factoryWhId,
          transferDate: nowIso.split('T')[0],
          isCustomDate: false,
          isPipelineTransfer: true,
          productionOrderRef: tank.tankNumber ? `TANK-#${tank.tankNumber}` : (tank.shortLotNumber || `BATCH-${tankLot}`),
          notes: isAr 
            ? `إذن ضخ ورفع خامة وسيطة عبر خط الأنابيب للتانك (${tank.tankNumber ? `#${tank.tankNumber}` : tank.shortLotNumber || tankLot}) لصالة الإنتاج (${factoryWhObj?.nameAr || 'صالة الإنتاج'})`
            : `Pipeline liquid transfer for Tank (${tank.tankNumber ? `#${tank.tankNumber}` : tank.shortLotNumber || tankLot}) to Factory Floor`,
          lines: [
            {
              itemId: tank.itemCode,
              variantCode: tank.variantCode || (tank.prepCode ? `${tank.itemCode}-${tank.prepCode}` : tank.itemCode),
              code: tank.variantCode || (tank.prepCode ? `${tank.itemCode}-${tank.prepCode}` : tank.itemCode),
              nameAr: tank.itemNameAr,
              nameEn: tank.shortName || tank.itemNameAr,
              specs: tank.recipeName || '',
              smallUnit: tank.yieldUnit || 'لتر',
              largeUnitName: 'تانك',
              packagingRatio: transferLargeQty > 0 ? (transferQty / transferLargeQty) : transferQty,
              qtySmallUnits: transferQty,
              qtyLargeUnits: transferLargeQty,
              lotNumber: tankLot,
              unitPrice: 0,
              currency: 'EGP',
              receivedDate: nowIso.split('T')[0],
            }
          ],
          status: 'completed',
          issuedBy: currentUserName,
          issuedById: currentUser?.id || currentUser?.uid || '',
          verifiedBy: currentUserName,
          verifiedAt: nowIso,
          auditTrail: [
            {
              version: '1.0',
              action: 'pipe_transfer_completed',
              status: 'completed',
              performedBy: currentUserName,
              timestamp: nowIso,
              noteAr: `تم إكمال الرفع ونقل رصيد (${transferQty.toLocaleString()} ${tank.yieldUnit || 'لتر'}) لصالة الإنتاج آلياً`,
              noteEn: `Auto-transferred ${transferQty} ${tank.yieldUnit} to floor`,
            }
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    } catch (err) {
      console.error('Error updating pump state:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Shift Handover (تسليم الوردية ومطابقة ملصق السيريال)
  const handleSaveShiftHandover = async (e) => {
    e.preventDefault();
    const cleanSerial = Number(normalizeArabicNumerals(handoverData.enteredSerial));

    if (!cleanSerial || isNaN(cleanSerial)) {
      alert(isAr ? 'يرجى إدخال رقم السيريال الموجود على الملصق.' : 'Please enter sticker serial number.');
      return;
    }
    if (!handoverData.labelImage) {
      alert(isAr ? 'يرجى التقاط صورة ملصق السيريال التالي.' : 'Please capture label image.');
      return;
    }

    const isAligned = cleanSerial === nextRecommendedSerial;
    const nowIso = new Date().toISOString();
    const handoverId = `SH-${Date.now()}-${cleanSerial}`;

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'shift_handovers', handoverId), {
        id: handoverId,
        enteredSerial: cleanSerial,
        expectedSerial: nextRecommendedSerial,
        isAligned,
        labelImage: handoverData.labelImage,
        notes: (handoverData.notes || '').trim(),
        handedOverBy: currentUserName,
        timestamp: nowIso,
        createdAt: serverTimestamp(),
      });

      setShowHandoverModal(false);
      setHandoverData({ labelImage: '', enteredSerial: '', notes: '' });

      alert(
        isAligned
          ? (isAr ? 'تم تسليم الوردية وتأكيد مطابقة ملصق السيريال بنجاح.' : 'Shift handed over with verified serial sticker.')
          : (isAr ? `تم توثيق تسليم الوردية مع وجود عدم تطابق (المدخل: #${cleanSerial} | المتوقع: #${nextRecommendedSerial}).` : 'Shift handed over with recorded discrepancy.')
      );
    } catch (err) {
      console.error('Error logging shift handover:', err);
      alert(isAr ? 'حدث خطأ أثناء توثيق تسليم الوردية.' : 'Error documenting handover.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Tank Record & Roll Back All Internal Transformations and Pipeline Transfers
  const handleDeleteTank = async (tank) => {
    if (!canDelete) {
      alert(isAr ? 'ليس لديك صلاحية حذف سجلات التانكات.' : 'Permission denied.');
      return;
    }

    const tankIdentifier = tank.tankNumber ? `#${tank.tankNumber}` : (tank.shortLotNumber || tank.lotNumber || tank.id);
    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف وإلغاء التانك (${tankIdentifier})؟\n\n⚠️ سيتم عكس وإلغاء كافة الحركات المخزنية المترتبة عليه تلقائياً:\n• إلغاء خصم خامات التحضير (R) وإرجاع رصيدها لمخزن الصرف.\n• إلغاء حركة إنتاج وتصنيع الخامة (M).\n• إلغاء إذن النقل لخط الأنابيب لصالة الإنتاج.`
      : `Delete tank (${tankIdentifier}) and roll back all inventory transactions?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSaving(true);
    try {
      const batch = writeBatch(db);

      // 1. Delete Primary Tank Document
      batch.delete(doc(db, 'liquid_tanks', tank.id));

      // 2. Delete Internal Production Transformation Record
      const transDocId = tank.transformationDocId || `TRANS-${tank.id}`;
      batch.delete(doc(db, 'production_transformations', transDocId));

      // 3. Delete Pipeline Transfer if exists
      const trnId = tank.pipeTransferDocId || `TRN-PIPE-${tank.id}`;
      batch.delete(doc(db, 'stock_transfers', trnId));

      // 4. Clean legacy references if any exist
      if (tank.consumeDocId) batch.delete(doc(db, 'goods_receipts', tank.consumeDocId));
      if (tank.producedDocId) batch.delete(doc(db, 'goods_receipts', tank.producedDocId));

      await batch.commit();
    } catch (err) {
      console.error('Error deleting and rolling back tank:', err);
      alert(isAr ? 'حدث خطأ أثناء إلغاء التانك وعكس الحركات المخزنية.' : 'Error rolling back tank inventory.');
    } finally {
      setIsSaving(false);
    }
  };

  // Period Dashboard Analytics (Ignores M-items not submitted during the period)
  const periodAnalytics = useMemo(() => {
    const periodList = tanks.filter((t) => {
      const tDate = getTankDateStr(t);
      return (!fromDate || !tDate || tDate >= fromDate) && (!toDate || !tDate || tDate <= toDate);
    });

    // M-items submitted during this specific period
    const itemCountsMap = {};
    periodList.forEach((t) => {
      const key = t.shortName || t.itemNameAr || t.itemCode;
      itemCountsMap[key] = (itemCountsMap[key] || 0) + 1;
    });

    // Concentration Analytics across period tanks
    const concTanks = periodList.filter(
      (t) => t.qaData?.concentration !== undefined && t.qaData?.concentration !== null && !isNaN(Number(t.qaData.concentration))
    );

    let avgConc = '—';
    let minConc = null; // { tankNumber, value }
    let maxConc = null; // { tankNumber, value }

    if (concTanks.length > 0) {
      const totalConc = concTanks.reduce((sum, t) => sum + Number(t.qaData.concentration), 0);
      avgConc = (totalConc / concTanks.length).toFixed(2);

      concTanks.forEach((t) => {
        const val = Number(t.qaData.concentration);
        if (!minConc || val < minConc.value) {
          minConc = { tankNumber: t.tankNumber, value: val };
        }
        if (!maxConc || val > maxConc.value) {
          maxConc = { tankNumber: t.tankNumber, value: val };
        }
      });
    }

    return {
      totalTanks: periodList.length,
      itemCountsMap,
      avgConc,
      minConc,
      maxConc,
      analyzedCount: concTanks.length,
    };
  }, [tanks, fromDate, toDate]);

  // Filtered Tanks List: Active pumping/paused tanks stay permanently visible regardless of date
  const filteredTanks = useMemo(() => {
    return tanks.filter((t) => {
      const isUnfinished = t.pumpStatus === 'pumping' || t.pumpStatus === 'paused';
      const tDate = getTankDateStr(t);
      const matchDate = isUnfinished || ((!fromDate || !tDate || tDate >= fromDate) && (!toDate || !tDate || tDate <= toDate));

      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        t.tankNumber?.toString().includes(q) ||
        t.itemNameAr?.includes(q) ||
        t.shortName?.includes(q) ||
        t.prepCode?.includes(q);

      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'pumping' && t.pumpStatus === 'pumping') ||
        (statusFilter === 'paused' && t.pumpStatus === 'paused') ||
        (statusFilter === 'completed' && t.pumpStatus === 'completed') ||
        (statusFilter === 'pending_qa' && t.qaStatus === 'pending') ||
        (statusFilter === 'qa_passed' && t.qaStatus === 'passed');

      return matchDate && matchSearch && matchStatus;
    });
  }, [tanks, fromDate, toDate, searchTerm, statusFilter]);

  return (
    <div className="space-y-4 select-none pb-12 text-slate-800">
      {isSaving && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري معالجة وتحديث بيانات التانكات...' : 'Syncing Liquid Tanks & QA...'}
        />
      )}

      {/* Top Header & Prominent Shift Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-[#131722] p-4 rounded-3xl border border-slate-800 shadow-lg">
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 border rounded-2xl shrink-0 flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.2)`,
              borderColor: `rgba(${r}, ${g}, ${b}, 0.4)`,
              color: tabColor,
            }}
          >
            <TabConfigIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white leading-tight">
              {isAr ? (tabConfig?.labelAr || 'تشغيل وتانكات الخامات المصنعة (Liquid Tanks)') : (tabConfig?.labelEn || 'Bulk Liquid Tanks & QA')}
            </h3>
            <span className="text-xs text-slate-400 font-medium block mt-0.5">
              {isAr ? 'تسجيل التانكات، الفحص المعملي، والرفع المباشر لصالة الإنتاج' : 'Tank logging, QA laboratory gate, and direct pipe lifting'}
            </span>
          </div>
        </div>

        {/* Action Buttons: R-Stock Balances, Shift Handover, Serial Configurator, Register Tank */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* R-Ingredients Stock Tracker Modal Trigger */}
          {canViewRStock && (
            <button
              type="button"
              onClick={() => setShowRStockModal(true)}
              className="px-3.5 py-2 bg-[#1c2233] hover:bg-[#252c3d] text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              title={isAr ? 'عرض وتتبع أرصدة خامات التحضير (R-Items)' : 'View R-Items Stock'}
            >
              <Scale className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>{isAr ? 'أرصدة خامات التحضير (R)' : 'R-Items Stock'}</span>
            </button>
          )}

          {/* Shift Handover Action Button with Active-Lifting Validation Guard */}
          {canSubmitHandover && (
            <button
              type="button"
              onClick={() => {
                // Shift Handover Guard: Active pumping tanks must be paused or completed
                const activePumpingTanks = tanks.filter((t) => t.pumpStatus === 'pumping');
                if (activePumpingTanks.length > 0) {
                  const runningTanksStr = activePumpingTanks.map((t) => `#${t.tankNumber} (${t.shortName})`).join('، ');
                  alert(
                    isAr
                      ? `🚫 لا يمكن تسليم الوردية أثناء تشغيل الطلمبة!\n\nالتانكات التالية قيد الرفع الفعلي الآن:\n${runningTanksStr}\n\nيرجى إيقاف الرفع مؤقتاً (إيقاف مؤقت) أو إنهاء الرفع بالكامل قبل تسليم الوردية.`
                      : `Cannot handover shift while lifting is active on tanks: ${runningTanksStr}. Please pause or complete lifting first.`
                  );
                  return;
                }

                setHandoverData({ labelImage: '', enteredSerial: String(nextRecommendedSerial), notes: '' });
                setShowHandoverModal(true);
              }}
              className="flex-1 sm:flex-initial px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Flag className="h-4 w-4 text-amber-400 shrink-0" />
              <span>{isAr ? 'تسليم الوردية (الملصقات)' : 'Shift Handover'}</span>
            </button>
          )}

          {/* Serial Number Configurator Trigger */}
          {canConfigureSerial && (
            <button
              type="button"
              onClick={handleOpenConfigModal}
              className="p-2 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
              title={isAr ? 'ضبط السيريال الافتتاحي وتتبع التسلسل' : 'Configure Starting Serial'}
            >
              <Settings2 className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="hidden sm:inline font-mono text-blue-400">#{systemSerialConfig.startingSerialNumber}</span>
            </button>
          )}

          {/* Register New Tank Primary Button */}
          {canCreate && (
            <button
              type="button"
              onClick={handleOpenRegister}
              className="flex-1 sm:flex-initial px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold transition shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>{isAr ? 'تسجيل تانك جديد' : 'Register Tank'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar with Date Range, Quick Presets & Status */}
      <div className="bg-[#131722] p-3.5 rounded-3xl border border-slate-800 space-y-2.5 text-xs">
        {/* Row 1: Search, Status & Next Serial */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder={isAr ? 'بحث برقم التانك، الصنف، طريقة التحضير...' : 'Search tank #, item, prep code...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-8 pe-3 py-2 bg-[#1c2233] border border-slate-700 rounded-xl text-xs font-medium text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 bg-[#1c2233] border border-slate-700 rounded-xl font-bold text-slate-200 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="pumping">{isAr ? 'جاري الرفع الآن' : 'Lifting Now'}</option>
              <option value="paused">{isAr ? 'الرفع متوقف مؤقتاً' : 'Lifting Paused'}</option>
              <option value="completed">{isAr ? 'مكتمل الرفع' : 'Lifting Completed'}</option>
              <option value="pending_qa">{isAr ? 'بانتظار فحص QA' : 'Pending QA'}</option>
              <option value="qa_passed">{isAr ? 'فحص QA مطابق' : 'QA Passed'}</option>
            </select>
          </div>

          {/* Next Expected Serial */}
          <div className="sm:col-span-3 flex items-center justify-end">
            <div className="w-full px-3 py-1.5 bg-[#1c2233] border border-slate-700 rounded-xl flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400 font-bold flex items-center gap-1">
                <Hash className="h-3.5 w-3.5 text-blue-400" />
                <span>{isAr ? 'السيريال المتوقع:' : 'Next Serial:'}</span>
              </span>
              <span className="font-mono font-extrabold text-blue-400 bg-[#131722] px-2 py-0.5 rounded border border-slate-700">
                #{nextRecommendedSerial}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Date Range Pickers & Quick Assignment Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80">
          {/* From / To Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#1c2233] px-2.5 py-1 rounded-xl border border-slate-700">
              <Calendar className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[10px] text-slate-400 font-bold">{isAr ? 'من:' : 'From:'}</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs font-bold focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-[#1c2233] px-2.5 py-1 rounded-xl border border-slate-700">
              <span className="text-[10px] text-slate-400 font-bold">{isAr ? 'إلى:' : 'To:'}</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs font-bold focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Quick Assignment Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSetDatePreset('today')}
              className="px-2.5 py-1 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 hover:text-white rounded-lg border border-slate-700 text-[11px] font-bold transition cursor-pointer"
            >
              {isAr ? 'اليوم' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => handleSetDatePreset('yesterday')}
              className="px-2.5 py-1 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 hover:text-white rounded-lg border border-slate-700 text-[11px] font-bold transition cursor-pointer"
            >
              {isAr ? 'أمس' : 'Yesterday'}
            </button>
            <button
              type="button"
              onClick={() => handleSetDatePreset('last7')}
              className="px-2.5 py-1 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 hover:text-white rounded-lg border border-slate-700 text-[11px] font-bold transition cursor-pointer"
            >
              {isAr ? 'آخر ٧ أيام' : 'Last 7 Days'}
            </button>
            <button
              type="button"
              onClick={() => handleSetDatePreset('thisMonth')}
              className="px-2.5 py-1 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 hover:text-white rounded-lg border border-slate-700 text-[11px] font-bold transition cursor-pointer"
            >
              {isAr ? 'هذا الشهر' : 'This Month'}
            </button>
          </div>
        </div>
      </div>

      {/* Period Analytics Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* KPI 1: Total Tanks in Period */}
        <div className="p-3 bg-[#131722] border border-slate-800 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
            <span className="flex items-center gap-1">
              <FlaskConical className="h-3.5 w-3.5 text-blue-400" />
              <span>{isAr ? 'إجمالي التانكات بالفترة:' : 'Period Tanks:'}</span>
            </span>
          </div>
          <div className="font-mono text-xl font-black text-white">
            {periodAnalytics.totalTanks} <span className="text-xs font-sans text-slate-400 font-medium">{isAr ? 'تانك' : 'Tanks'}</span>
          </div>
          {/* Active M-Items Breakdown in Period */}
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {Object.keys(periodAnalytics.itemCountsMap).length === 0 ? (
              <span className="text-[10px] text-slate-500 italic">{isAr ? 'لا توجد خامات' : 'None'}</span>
            ) : (
              Object.entries(periodAnalytics.itemCountsMap).map(([name, count]) => (
                <span key={name} className="px-1.5 py-0.2 rounded bg-[#1c2233] text-blue-300 border border-blue-500/30 text-[9px] font-bold font-mono">
                  {name}: {count}
                </span>
              ))
            )}
          </div>
        </div>

        {/* KPI 2: Average Concentration */}
        <div className="p-3 bg-[#131722] border border-slate-800 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
              <span>{isAr ? 'متوسط التركيز:' : 'Avg Concentration:'}</span>
            </span>
            <span className="font-mono text-[9px] text-slate-500">
              {periodAnalytics.analyzedCount} {isAr ? 'مفحوص' : 'tested'}
            </span>
          </div>
          <div className="font-mono text-xl font-black text-emerald-400">
            {periodAnalytics.avgConc}{periodAnalytics.avgConc !== '—' ? '%' : ''}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">
            {isAr ? 'لكافة التانكات المحللة بالفترة' : 'Across tested tanks'}
          </span>
        </div>

        {/* KPI 3: Lowest Concentration */}
        <div className="p-3 bg-[#131722] border border-slate-800 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
            <span className="flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
              <span>{isAr ? 'أدنى تركيز مسجل:' : 'Lowest Conc:'}</span>
            </span>
          </div>
          {periodAnalytics.minConc ? (
            <div>
              <div className="font-mono text-lg font-black text-rose-400">
                {periodAnalytics.minConc.value}%
              </div>
              <span className="font-mono text-[10px] text-slate-400 block font-bold">
                {isAr ? `تانك: #${periodAnalytics.minConc.tankNumber}` : `Tank #${periodAnalytics.minConc.tankNumber}`}
              </span>
            </div>
          ) : (
            <div className="font-mono text-sm text-slate-500 pt-2">—</div>
          )}
        </div>

        {/* KPI 4: Highest Concentration */}
        <div className="p-3 bg-[#131722] border border-slate-800 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
              <span>{isAr ? 'أعلى تركيز مسجل:' : 'Highest Conc:'}</span>
            </span>
          </div>
          {periodAnalytics.maxConc ? (
            <div>
              <div className="font-mono text-lg font-black text-cyan-400">
                {periodAnalytics.maxConc.value}%
              </div>
              <span className="font-mono text-[10px] text-slate-400 block font-bold">
                {isAr ? `تانك: #${periodAnalytics.maxConc.tankNumber}` : `Tank #${periodAnalytics.maxConc.tankNumber}`}
              </span>
            </div>
          ) : (
            <div className="font-mono text-sm text-slate-500 pt-2">—</div>
          )}
        </div>
      </div>

      {/* Main Workspace: Compact, High-Density Touch Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-h-[340px]">
        {loading ? (
          <div className="col-span-full p-16 text-center">
            <PeacockLoader size="lg" text={isAr ? 'جاري تحميل التانكات النشطة...' : 'Loading Active Tanks...'} />
          </div>
        ) : filteredTanks.length === 0 ? (
          <div className="col-span-full p-12 bg-[#131722] rounded-3xl border-2 border-dashed border-slate-800 text-center text-slate-500 space-y-2">
            <FlaskConical className="h-10 w-10 mx-auto opacity-30 text-blue-500" />
            <span className="font-bold text-xs block text-slate-400">
              {isAr ? 'لا توجد تانكات مسجلة مطابقة للفلاتر المحددة.' : 'No tanks found matching criteria.'}
            </span>
          </div>
        ) : (
          filteredTanks.map((tank) => {
            const isPumping = tank.pumpStatus === 'pumping';
            const isPaused = tank.pumpStatus === 'paused';
            const isCompleted = tank.pumpStatus === 'completed';
            const hasQAData = Boolean(tank.qaData);
            const isQAPassed = tank.qaStatus === 'passed' || tank.qaStatus === 'bypassed';
            const liftingSec = getTankLiftingSeconds(tank);

            return (
              <div
                key={tank.id}
                className={`p-3.5 sm:p-4 rounded-3xl border transition-all shadow-md flex flex-col justify-between space-y-3 ${
                  isPumping
                    ? 'bg-[#151c2e] border-blue-500 ring-2 ring-blue-500/30'
                    : isPaused
                    ? 'bg-[#231e15] border-amber-500/80 ring-2 ring-amber-500/20'
                    : isCompleted
                    ? 'bg-[#10141d] border-slate-800/80 opacity-80'
                    : 'bg-[#131722] border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* 1. Header: Tank Number, Short Name, Prep Code & Audit Button */}
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      {/* Photo Thumbnail if attached */}
                      {tank.imageFile ? (
                        <div className="w-11 h-11 rounded-2xl bg-black border border-slate-700 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                          <img
                            src={tank.imageFile}
                            alt="Tank"
                            onClick={() => setImagePreviewModal({
                              url: tank.imageFile,
                              title: `${tank.shortName} - #${tank.tankNumber}`,
                              subtitle: tank.prepCode ? `طريقة: ${tank.prepCode}` : ''
                            })}
                            className="w-full h-full object-cover rounded-xl cursor-pointer hover:scale-110 transition"
                            title={isAr ? 'انقر للمعاينة' : 'Preview Photo'}
                          />
                        </div>
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                          <FlaskConical className="h-6 w-6" />
                        </div>
                      )}

                      <div>
                        <div className="font-mono text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                          <span>{tank.tankNumber ? `#${tank.tankNumber}` : (tank.shortLotNumber || `تشغيلة #${String(tank.id).slice(-4)}`)}</span>
                          {/* Spinning Yellow Running Gear when Lifting is Active */}
                          {isPumping && (
                            <Cog className="h-6 w-6 text-amber-400 animate-spin shrink-0" title={isAr ? 'الطلمبة قيد الرفع والتشغيل' : 'Lifting Active'} />
                          )}
                          {isPaused && (
                            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" title={isAr ? 'الرفع متوقف مؤقتاً' : 'Paused'} />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-end space-y-1">
                      <span className="px-3.5 py-1 bg-blue-600 text-white rounded-xl font-black text-sm shadow-md shadow-blue-600/20 inline-block">
                        {tank.shortName}
                      </span>
                      {tank.prepCode && (
                        <span className="font-mono text-[10px] font-extrabold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-500/30 block w-max ms-auto">
                          {isAr ? `طريقة: ${tank.prepCode}` : `Prep: ${tank.prepCode}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2. Compact QA Metrics & Lab Image Icon on Card */}
                  {tank.needsQA && (
                    <div className="p-2.5 bg-[#1c2233] border border-slate-700/80 rounded-2xl flex items-center justify-between gap-2 text-xs">
                      {hasQAData ? (
                        <div className="flex items-center gap-2 font-mono">
                          <div className="flex items-center gap-1 bg-[#131722] px-2 py-1 rounded-xl border border-slate-700">
                            <span className="text-slate-400 text-[10px] font-sans font-bold">{isAr ? 'التركيز:' : 'Conc:'}</span>
                            <b className="text-emerald-400 font-extrabold text-xs">{tank.qaData.concentration}%</b>
                          </div>

                          {tank.qaData.oxidation && (
                            <div className="flex items-center gap-1 bg-[#131722] px-2 py-1 rounded-xl border border-slate-700">
                              <span className="text-slate-400 text-[10px] font-sans font-bold">{isAr ? 'الأكسدة:' : 'Ox:'}</span>
                              <b className="text-cyan-400 font-extrabold text-xs">{tank.qaData.oxidation}</b>
                            </div>
                          )}

                          {/* Lab Test Photo Preview Icon Button */}
                          {tank.qaData.labImage && (
                            <button
                              type="button"
                              onClick={() => setImagePreviewModal({
                                url: tank.qaData.labImage,
                                title: `${isAr ? 'تقرير فحص المعمل للتانك' : 'Lab Test Report'} #${tank.tankNumber}`,
                                subtitle: `${isAr ? 'تركيز' : 'Conc'}: ${tank.qaData.concentration}%`
                              })}
                              className="p-1.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/40 rounded-xl transition cursor-pointer shrink-0 shadow-2xs"
                              title={isAr ? 'عرض صورة شريط / تقرير فحص المعمل' : 'View Lab Test Photo'}
                            >
                              <ImageIcon className="h-4 w-4 text-indigo-400" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1 animate-pulse">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{isAr ? 'بانتظار تسجيل فحص الجودة (QA)' : 'Pending QA Analysis'}</span>
                        </span>
                      )}

                      {/* Small / Subtle QA Edit or Action Button */}
                      {!isCompleted && canAnalyzeQA && (
                        hasQAData ? (
                          <button
                            type="button"
                            onClick={() => {
                              setQaFormData({
                                concentration: tank.qaData?.concentration !== undefined ? String(tank.qaData.concentration) : '',
                                oxidation: tank.qaData?.oxidation !== undefined && tank.qaData?.oxidation !== null ? String(tank.qaData.oxidation) : '',
                                notes: tank.qaData?.notes || '',
                                labImage: tank.qaData?.labImage || '',
                              });
                              setShowQAModal(tank);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-[#131722] rounded-lg transition cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                            title={isAr ? 'تعديل نتائج الفحص' : 'Edit QA'}
                          >
                            <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                            <span>{isAr ? 'تعديل' : 'Edit'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setQaFormData({ concentration: '', oxidation: '', notes: '', labImage: '' });
                              setShowQAModal(tank);
                            }}
                            className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Activity className="h-3.5 w-3.5 text-indigo-400" />
                            <span>{isAr ? 'فحص QA' : 'QA Test'}</span>
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* 3. Live Lifting Running Timer & Actions Bar */}
                  <div className="flex items-center justify-between text-[11px] font-bold pt-1">
                    {/* Running Timer Display */}
                    {(isPumping || isPaused || isCompleted) ? (
                      <div className="flex items-center gap-1.5 font-mono">
                        <Timer className={`h-4 w-4 shrink-0 ${isPumping ? 'text-amber-400 animate-pulse' : isPaused ? 'text-amber-500' : 'text-emerald-400'}`} />
                        <span className={`text-sm font-extrabold ${isPumping ? 'text-amber-300' : isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {formatDurationDisplay(liftingSec)}
                        </span>
                        <span className="text-[10px] font-sans text-slate-400 font-medium">
                          {isCompleted ? (isAr ? '(المدة الصافية)' : '(Net)') : (isAr ? '(تشغيل)' : '(Live)')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-medium">
                        {isAr ? 'جاهز لبدء الرفع' : 'Ready to lift'}
                      </span>
                    )}

                    {/* Secondary Actions (Audit, Edit, Delete) */}
                    <div className="flex items-center gap-1">
                      {canViewAudit && (
                        <button
                          type="button"
                          onClick={() => setShowAuditModal(tank)}
                          className="p-1 text-slate-400 hover:text-blue-400 rounded transition cursor-pointer"
                          title={isAr ? 'سجل التدقيق والتتبع الزمني' : 'Audit Timeline'}
                        >
                          <History className="h-4 w-4" />
                        </button>
                      )}
                      {canEdit && !isCompleted && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(tank)}
                          className="p-1 text-slate-400 hover:text-amber-400 rounded transition cursor-pointer"
                          title={isAr ? 'تعديل التانك واستبدال الصورة' : 'Edit Tank'}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTank(tank)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
                          title={isAr ? 'حذف السجل وعكس الحركات المخزنية' : 'Delete & Roll Back Stock'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. High-Contrast Lifting Controls (Start / Pause / Resume / Finish) */}
                <div className="pt-2 border-t border-slate-800">
                  {!isCompleted ? (
                    isPumping ? (
                      <div className="grid grid-cols-2 gap-2">
                        {/* Pause Lifting */}
                        <button
                          type="button"
                          disabled={!canPauseResumePump}
                          onClick={() => handlePumpAction(tank, 'pause')}
                          className="py-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/50 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                        >
                          <Pause className="h-4 w-4 text-amber-400 shrink-0" />
                          <span>{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                        </button>

                        {/* Finish Lifting */}
                        <button
                          type="button"
                          disabled={!canFinishPump}
                          onClick={() => handlePumpAction(tank, 'finish')}
                          className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-4 w-4 text-white shrink-0" />
                          <span>{isAr ? 'إنهاء الرفع' : 'Finish'}</span>
                        </button>
                      </div>
                    ) : isPaused ? (
                      <div className="grid grid-cols-2 gap-2">
                        {/* Resume Lifting */}
                        <button
                          type="button"
                          disabled={!canPauseResumePump}
                          onClick={() => handlePumpAction(tank, 'resume')}
                          className="py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black transition shadow-md shadow-blue-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                        >
                          <Play className="h-4 w-4 text-white shrink-0" />
                          <span>{isAr ? 'استئناف الرفع' : 'Resume'}</span>
                        </button>

                        {/* Finish Lifting */}
                        <button
                          type="button"
                          disabled={!canFinishPump}
                          onClick={() => handlePumpAction(tank, 'finish')}
                          className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-4 w-4 text-white shrink-0" />
                          <span>{isAr ? 'إنهاء الرفع' : 'Finish'}</span>
                        </button>
                      </div>
                    ) : (
                      /* Start Lifting */
                      <button
                        type="button"
                        disabled={!isQAPassed || !canStartPump}
                        onClick={() => handlePumpAction(tank, 'start')}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                      >
                        <Play className="h-5 w-5 shrink-0" />
                        <span>{isAr ? 'بدء الرفع (تشغيل الطلمبة)' : 'Start Lifting Pump'}</span>
                      </button>
                    )
                  ) : (
                    /* Completed State */
                    <div className="w-full py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-black text-emerald-400 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>{isAr ? `مكتمل الرفع في (${formatDurationDisplay(liftingSec)})` : `Completed in (${formatDurationDisplay(liftingSec)})`}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. DARK THEME TANK REGISTRATION & EDIT MODAL                              */}
      {/* ========================================================================= */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#131722] text-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-800 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl">
                  {editingTank ? <Edit3 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {editingTank 
                      ? (isAr ? `تعديل بيانات التانك (#${editingTank.tankNumber})` : `Edit Tank (#${editingTank.tankNumber})`)
                      : (isAr ? 'تسجيل تانك جديد' : 'Register New Tank')}
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {isAr ? 'تحديد الخامة، طريقة التحضير، ورقم السيريال والصورة' : 'Set material, preparation method, serial, and photo'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTank} className="space-y-4 text-xs">
              {/* Field 1: نوع الخامة (Material Type Selector) */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Boxes className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span>{isAr ? 'نوع الخامة *' : 'Material Type *'}</span>
                </label>

                <div className="grid grid-cols-4 gap-2">
                  {mItems.map((item) => {
                    const isSelected = selectedItemCode === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          setSelectedItemCode(item.code);
                          const itemRecs = getSortedRecipesForItem(item.code);
                          const firstValidPrep = itemRecs.find((r) => r.prepCode && r.prepCode.trim())?.prepCode || '';
                          setSelectedPrepCode(firstValidPrep);
                        }}
                        className={`py-3 px-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer text-center truncate ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 border border-blue-400 scale-102'
                            : 'bg-[#1c2233] text-slate-300 hover:bg-[#252c3d] border border-slate-700/60'
                        }`}
                      >
                        {item.shortName || item.nameAr}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 2: Preparation Method Selector */}
              {selectedItemRecipes.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span>{isAr ? 'طريقة التحضير *' : 'Preparation Method *'}</span>
                  </label>

                  <div className="grid grid-cols-4 gap-2">
                    {selectedItemRecipes.map((rec) => {
                      const isSelected = (selectedPrepCode || selectedItemRecipes[0]?.prepCode) === rec.prepCode;
                      return (
                        <button
                          key={rec.code}
                          type="button"
                          onClick={() => setSelectedPrepCode(rec.prepCode)}
                          className={`py-2.5 px-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer text-center ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 border border-blue-400 scale-102'
                              : 'bg-[#1c2233] text-slate-300 hover:bg-[#252c3d] border border-slate-700/60'
                          }`}
                        >
                          {rec.prepCode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Field 3: Quantity Count (Only displayed if tank serial numbering is NOT required) */}
              {!requiresTankSerial && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <span>#</span>
                    <span>{isAr ? `عدد التشغيلات المطلوبة (حجم التشغيلة: ${activeRecipe?.batchYieldQty || 200} ${activeRecipe?.yieldUnit || 'لتر'}) *` : 'Batches Count *'}</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={quantityCount}
                    onChange={(e) => setQuantityCount(normalizeArabicNumerals(e.target.value))}
                    className="w-full p-2.5 bg-[#1c2233] border border-slate-700 rounded-xl text-white font-mono font-bold text-center text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Field 4: رقم التانك (Displayed & Validated ONLY if Tank Serial is Required) */}
              {requiresTankSerial && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <span>|||||</span>
                      <span>{isAr ? 'رقم التانك / السيريال *' : 'Tank / Serial Number *'}</span>
                    </label>
                    {!editingTank && (
                      <span className="font-mono text-[10px] text-blue-400 font-bold">
                        {isAr ? `المتوقع: #${nextRecommendedSerial}` : `Expected: #${nextRecommendedSerial}`}
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder={isAr ? 'رقم التانك (مثال: 1)' : 'e.g. 1400'}
                    value={tankNumber}
                    onChange={(e) => setTankNumber(normalizeArabicNumerals(e.target.value))}
                    className={`w-full p-2.5 bg-[#1c2233] border rounded-xl text-white font-mono font-bold text-sm focus:ring-2 focus:outline-none ${
                      isDuplicateTank
                        ? 'border-rose-500 ring-1 ring-rose-500 text-rose-300'
                        : isSkippingSerial
                        ? 'border-amber-400 ring-1 ring-amber-400 text-amber-200'
                        : 'border-slate-700 focus:ring-blue-500'
                    }`}
                  />

                  {/* Duplicate Alert Banner */}
                  {isDuplicateTank && (
                    <div className="p-2.5 bg-rose-950/80 border border-rose-500/60 text-rose-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                      <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                      <span>{isAr ? 'هذا التانك مسجل مسبقاً (سيريال مكرر).' : 'Duplicate completed tank serial.'}</span>
                    </div>
                  )}

                  {/* Skipping Alert Banner */}
                  {!isDuplicateTank && isSkippingSerial && (
                    <div className="p-2.5 bg-amber-950/80 border border-amber-500/60 text-amber-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>{isAr ? `تنبيه: تم تخطي التسلسل المتوقع (#${nextRecommendedSerial}).` : `Notice: Expected sequence is #${nextRecommendedSerial}.`}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Field 5: صورة التانك (Displayed & Mandatory ONLY if Tank Serial is Required) */}
              {requiresTankSerial && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span>{isAr ? 'صورة التانك (إلزامي) *:' : 'Tank Photo (Required) *:'}</span>
                  </label>

                  <div className="p-3 bg-[#1c2233] border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center text-center">
                    {tankImage ? (
                      <div className="relative w-full h-24 rounded-xl overflow-hidden group">
                        <img src={tankImage} alt="Tank" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setTankImage('')}
                          className="absolute top-1 end-1 p-1 bg-rose-600 text-white rounded-full text-xs cursor-pointer shadow"
                          title={isAr ? 'إزالة الصورة' : 'Remove Photo'}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="w-full py-2 flex items-center justify-center gap-2 text-slate-400 hover:text-white cursor-pointer transition">
                        <Camera className="h-4 w-4 text-blue-400" />
                        <span className="text-xs font-bold">{isAr ? 'التقاط / رفع صورة التانك' : 'Capture / Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const compressed = await compressImage(file);
                              setTankImage(compressed);
                            } catch (err) {
                              console.error('Error compressing photo:', err);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="py-2.5 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 rounded-xl text-xs font-bold border border-slate-700 transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving || (requiresTankSerial && isDuplicateTank)}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-lg shadow-emerald-600/30 disabled:opacity-40"
                >
                  {isAr ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SHIFT HANDOVER MODAL (تسليم الوردية ومطابقة ملصق السيريال)              */}
      {/* ========================================================================= */}
      {showHandoverModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#131722] text-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-800 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl">
                  <Flag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {isAr ? 'تسليم الوردية ومطابقة ملصق السيريال' : 'Shift Handover & Label Audit'}
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {isAr ? 'تصوير ملصق السيريال التالي وتأكيد عدم وجود فجوات في التسلسل' : 'Capture next serial sticker to verify sequence continuity'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHandoverModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShiftHandover} className="space-y-4 text-xs">
              {/* Photo of next label */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>{isAr ? 'صورة ملصق السيريال التالي (إلزامي): *' : 'Next Sticker Photo (Mandatory): *'}</span>
                </label>

                <div className="p-3 bg-[#1c2233] border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center text-center">
                  {handoverData.labelImage ? (
                    <div className="relative w-full h-28 rounded-xl overflow-hidden group">
                      <img src={handoverData.labelImage} alt="Next Sticker" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setHandoverData({ ...handoverData, labelImage: '' })}
                        className="absolute top-1 end-1 p-1 bg-rose-600 text-white rounded-full text-xs cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full py-3 flex items-center justify-center gap-2 text-slate-400 hover:text-white cursor-pointer transition">
                      <Camera className="h-5 w-5 text-amber-400" />
                      <span className="text-xs font-bold">{isAr ? 'التقاط صورة الملصق التالي' : 'Capture Next Sticker'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const compressed = await compressImage(file);
                            setHandoverData((prev) => ({ ...prev, labelImage: compressed }));
                          } catch (err) {
                            console.error('Error compressing sticker photo:', err);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Number verification */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-300">
                    {isAr ? 'رقم السيريال المقروء من الملصق: *' : 'Serial Number on Sticker: *'}
                  </label>
                  <span className="font-mono text-[10px] text-blue-400 font-bold">
                    {isAr ? `المتوقع بالسيستم: #${nextRecommendedSerial}` : `Expected: #${nextRecommendedSerial}`}
                  </span>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  placeholder={isAr ? `مثال: ${nextRecommendedSerial}` : `e.g. ${nextRecommendedSerial}`}
                  value={handoverData.enteredSerial}
                  onChange={(e) => setHandoverData({ ...handoverData, enteredSerial: normalizeArabicNumerals(e.target.value) })}
                  className="w-full p-2.5 bg-[#1c2233] border border-slate-700 rounded-xl text-white font-mono font-extrabold text-base text-center focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />

                {/* Alignment Feedback */}
                {handoverData.enteredSerial && (
                  Number(handoverData.enteredSerial) === nextRecommendedSerial ? (
                    <div className="p-2 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>{isAr ? 'مطابق تماماً لتسلسل النظام التالي.' : 'Sticker matches expected sequence.'}</span>
                    </div>
                  ) : (
                    <div className="p-2 bg-amber-950/80 border border-amber-500/50 text-amber-200 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>{isAr ? `تنبيه: عدم تطابق (المدخل: #${handoverData.enteredSerial} | المتوقع: #${nextRecommendedSerial}).` : `Mismatch: entered #${handoverData.enteredSerial} vs expected #${nextRecommendedSerial}.`}</span>
                    </div>
                  )
                )}
              </div>

              {/* Handover notes */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-300">
                  {isAr ? 'ملاحظات تسليم الوردية (اختياري):' : 'Handover Remarks (Optional):'}
                </label>
                <input
                  type="text"
                  placeholder={isAr ? 'أي ملاحظات للوردية التالية...' : 'Remarks...'}
                  value={handoverData.notes}
                  onChange={(e) => setHandoverData({ ...handoverData, notes: e.target.value })}
                  className="w-full p-2 bg-[#1c2233] border border-slate-700 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
                  className="py-2.5 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 rounded-xl text-xs font-bold border border-slate-700 transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving || !handoverData.labelImage}
                  className="py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-extrabold transition shadow-md disabled:opacity-40"
                >
                  {isAr ? 'توثيق وإغلاق الوردية' : 'Submit Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TANK AUDIT TRAIL TIMELINE MODAL                                        */}
      {/* ========================================================================= */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#131722] text-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-800 space-y-4 my-auto max-h-[85vh] flex flex-col justify-between overflow-hidden">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {isAr ? `سجل التدقيق والتتبع الزمني للتانك (#${showAuditModal.tankNumber})` : `Audit Timeline (#${showAuditModal.tankNumber})`}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {showAuditModal.shortName} • {showAuditModal.id}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Timeline Event List */}
            <div className="flex-1 space-y-2.5 overflow-y-auto pe-1 text-xs">
              {(!showAuditModal.auditTrail || showAuditModal.auditTrail.length === 0) ? (
                <div className="p-6 text-center text-slate-500 text-xs italic">
                  {isAr ? 'لا توجد حركات مسجلة لهذا التانك بعد.' : 'No audit entries logged.'}
                </div>
              ) : (
                showAuditModal.auditTrail.map((entry, idx) => (
                  <div key={idx} className="p-3 bg-[#1c2233] rounded-2xl border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-500/30 text-[10px]">
                        {isAr ? entry.actionLabelAr || entry.action : entry.actionLabelEn || entry.action}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(entry.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US', { hour12: true })}
                      </span>
                    </div>

                    <p className="text-slate-200 text-xs font-semibold">{entry.summary}</p>
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      {isAr ? 'المسؤول:' : 'By:'} <b className="text-slate-300">{entry.user}</b>
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAuditModal(null)}
                className="px-5 py-2 bg-[#1c2233] hover:bg-[#252c3d] text-slate-200 rounded-xl text-xs font-bold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. COMPREHENSIVE CONFIGURATOR MODAL (SERIAL, M-ITEMS & RECIPES ORDER)     */}
      {/* ========================================================================= */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in duration-150">
          <div className="bg-[#131722] text-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-800 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl shrink-0">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {isAr ? 'إعدادات السيريال وترتيب الخامات وطرق التحضير' : 'Configure Serial & Order Sequences'}
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {isAr ? 'تحديد السيريال الافتتاحي، ترتيب ظهور الخامات (M)، وترتيب أزرار طرق التحضير' : 'Set starting serial, M-items display order, and recipe preparation sequence'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSerialConfig} className="space-y-4 text-xs">
              {/* SECTION 1: Starting Serial Number */}
              <div className="p-3.5 bg-[#1c2233] border border-slate-800 rounded-2xl space-y-2">
                <label className="block text-[11px] font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-blue-400" />
                    <span>{isAr ? '١- رقم السيريال الافتتاحي للتانكات *' : '1. Starting Serial Number *'}</span>
                  </span>
                  <span className="text-[10px] text-blue-400 font-mono">#{configSerialInput}</span>
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={configSerialInput}
                  onChange={(e) => setConfigSerialInput(normalizeArabicNumerals(e.target.value))}
                  className="w-full p-2.5 bg-[#131722] border border-slate-700 rounded-xl font-mono font-extrabold text-center text-base text-blue-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* SECTION 2: Reorder M-Items (Drag-Free Steppers) */}
              <div className="p-3.5 bg-[#1c2233] border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-extrabold text-slate-200 flex items-center gap-1.5">
                    <Boxes className="h-3.5 w-3.5 text-blue-400" />
                    <span>{isAr ? '٢- ترتيب ظهور الخامات المصنعة (M) في نافذة التسجيل:' : '2. M-Items Display Order in Registration:'}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {configMItemsList.length} {isAr ? 'خامات' : 'Items'}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pe-1">
                  {configMItemsList.map((item, idx) => (
                    <div
                      key={item.code}
                      className="p-2 bg-[#131722] border border-slate-700/80 rounded-xl flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-lg bg-slate-800 text-slate-300 font-mono font-bold text-[10px] flex items-center justify-center border border-slate-700">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-white block text-xs">{item.shortName || item.nameAr}</span>
                          <span className="text-[10px] text-slate-400 font-mono">[{item.code}]</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveMItem(idx, -1)}
                          className="p-1 bg-[#1c2233] hover:bg-[#2a3246] text-slate-300 rounded-lg disabled:opacity-20 cursor-pointer border border-slate-700 transition"
                          title={isAr ? 'تقديم الترتيب للأمام' : 'Move Up'}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === configMItemsList.length - 1}
                          onClick={() => handleMoveMItem(idx, 1)}
                          className="p-1 bg-[#1c2233] hover:bg-[#2a3246] text-slate-300 rounded-lg disabled:opacity-20 cursor-pointer border border-slate-700 transition"
                          title={isAr ? 'تأخير الترتيب للخلف' : 'Move Down'}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION 3: Reorder Preparation Recipes per M-Item */}
              <div className="p-3.5 bg-[#1c2233] border border-slate-800 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-extrabold text-slate-200 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    <span>{isAr ? '٣- ترتيب أزرار طرق التحضير لكل خامة (Preparations):' : '3. Preparation Methods Sequence:'}</span>
                  </span>
                </div>

                {/* Select target M-Item to arrange its recipes */}
                <div className="grid grid-cols-4 gap-1.5">
                  {configMItemsList.map((item) => {
                    const isSelected = configSelectedMItemCode === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setConfigSelectedMItemCode(item.code)}
                        className={`py-1.5 px-1 rounded-xl text-[11px] font-bold transition text-center truncate ${
                          isSelected
                            ? 'bg-blue-600 text-white border border-blue-400 shadow-sm'
                            : 'bg-[#131722] text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        {item.shortName || item.nameAr}
                      </button>
                    );
                  })}
                </div>

                {/* Recipe list for active selected M-item */}
                {(() => {
                  const allItemRecipes = intermediateRecipes.filter((r) => r.targetItemId === configSelectedMItemCode);
                  const recipeCodesOrdered = configRecipeOrders[configSelectedMItemCode] || [];

                  // Map ordered codes to full recipe objects
                  const orderedRecipeObjects = [];
                  recipeCodesOrdered.forEach((code) => {
                    const found = allItemRecipes.find((r) => r.code === code);
                    if (found) orderedRecipeObjects.push(found);
                  });
                  allItemRecipes.forEach((r) => {
                    if (!orderedRecipeObjects.some((obj) => obj.code === r.code)) {
                      orderedRecipeObjects.push(r);
                    }
                  });

                  return orderedRecipeObjects.length === 0 ? (
                    <div className="p-4 bg-[#131722] rounded-xl border border-slate-800 text-center text-slate-500 text-[11px] italic">
                      {isAr ? 'لا توجد طرق تحضير/تركيبات وسيطة مسجلة لهذه الخامة.' : 'No intermediate recipes found for this material.'}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pe-1">
                      {orderedRecipeObjects.map((rec, rIdx) => (
                        <div
                          key={rec.code}
                          className="p-2 bg-[#131722] border border-slate-700/80 rounded-xl flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-lg bg-blue-950/60 text-blue-400 font-mono font-bold text-[10px] flex items-center justify-center border border-blue-500/30">
                              {rIdx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-white text-xs">
                                  {isAr ? `طريقة: ${rec.prepCode || rec.nameAr}` : `Prep: ${rec.prepCode || rec.nameAr}`}
                                </span>
                                {rec.prepCode && (
                                  <span className="font-mono text-[9px] text-blue-400 bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-500/30 font-bold">
                                    {rec.prepCode}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block truncate max-w-xs">{rec.nameAr}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={rIdx === 0}
                              onClick={() => handleMoveRecipe(configSelectedMItemCode, rIdx, -1)}
                              className="p-1 bg-[#1c2233] hover:bg-[#2a3246] text-slate-300 rounded-lg disabled:opacity-20 cursor-pointer border border-slate-700 transition"
                              title={isAr ? 'تقديم الترتيب' : 'Move Up'}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={rIdx === orderedRecipeObjects.length - 1}
                              onClick={() => handleMoveRecipe(configSelectedMItemCode, rIdx, 1)}
                              className="p-1 bg-[#1c2233] hover:bg-[#2a3246] text-slate-300 rounded-lg disabled:opacity-20 cursor-pointer border border-slate-700 transition"
                              title={isAr ? 'تأخير الترتيب' : 'Move Down'}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-[#1c2233] border border-slate-700 rounded-xl text-slate-300 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-md shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>{isAr ? 'حفظ وضبط الترتيب والسيريال' : 'Save Configuration'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. QA ANALYSIS MODAL                                                      */}
      {/* ========================================================================= */}
      {showQAModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#131722] text-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-800 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {isAr ? `فحص وتحليل جودة التانك (#${showQAModal.tankNumber})` : `QA Analysis (#${showQAModal.tankNumber})`}
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {showQAModal.shortName} • {isAr ? 'تسجيل نتائج الفحص المعملي وتوثيق الصورة' : 'Lab inspection & photo audit'}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowQAModal(null)} className="p-1.5 text-slate-400 hover:text-white rounded-xl">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQA} className="space-y-3.5 text-xs">
              {/* Concentration (Required) & Oxidation (Optional: 500-1500) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    {isAr ? 'نسبة التركيز (%) *:' : 'Concentration (%) *:'}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="5.25"
                    value={qaFormData.concentration}
                    onChange={(e) => setQaFormData({ ...qaFormData, concentration: normalizeArabicNumerals(e.target.value) })}
                    className="w-full p-2.5 bg-[#1c2233] border border-slate-700 rounded-xl font-mono font-bold text-center text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1 flex items-center justify-between">
                    <span>{isAr ? 'الأكسدة (اختياري):' : 'Oxidation (Opt):'}</span>
                    <span className="text-[9px] text-slate-400 font-mono">500-1500</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 750"
                    value={qaFormData.oxidation}
                    onChange={(e) => setQaFormData({ ...qaFormData, oxidation: normalizeArabicNumerals(e.target.value) })}
                    className="w-full p-2.5 bg-[#1c2233] border border-slate-700 rounded-xl font-mono font-bold text-center text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Lab Photo Capture Canvas (MANDATORY) */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>{isAr ? 'صورة فحص / شريط المعمل (إلزامي) *:' : 'Lab Test Photo (Required) *:'}</span>
                  </span>
                  {qaFormData.labImage && (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      <span>{isAr ? 'تم الإرفاق' : 'Attached'}</span>
                    </span>
                  )}
                </label>

                <div className={`p-3 bg-[#1c2233] border-2 border-dashed rounded-2xl flex items-center justify-center text-center transition ${
                  !qaFormData.labImage ? 'border-indigo-500/40 hover:border-indigo-500' : 'border-slate-700'
                }`}>
                  {qaFormData.labImage ? (
                    <div className="relative w-full h-28 rounded-xl overflow-hidden group">
                      <img src={qaFormData.labImage} alt="Lab Test" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setQaFormData({ ...qaFormData, labImage: '' })}
                        className="absolute top-1 end-1 p-1 bg-rose-600 text-white rounded-full text-xs cursor-pointer shadow"
                        title={isAr ? 'إزالة الصورة' : 'Remove'}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full py-3 flex items-center justify-center gap-2 text-slate-400 hover:text-white cursor-pointer transition">
                      <Camera className="h-5 w-5 text-indigo-400" />
                      <span className="text-xs font-bold">{isAr ? 'التقاط صورة شريط / تقرير الفحص' : 'Capture Lab Test Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const compressed = await compressImage(file);
                            setQaFormData((prev) => ({ ...prev, labImage: compressed }));
                          } catch (err) {
                            console.error('Error compressing lab photo:', err);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Lab Remarks */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-300">{isAr ? 'ملاحظات المعمل والتحليل (اختياري):' : 'Lab Notes (Optional):'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'أي ملاحظات فنية أو كيميائية...' : 'Technical notes...'}
                  value={qaFormData.notes}
                  onChange={(e) => setQaFormData({ ...qaFormData, notes: e.target.value })}
                  className="w-full p-2.5 bg-[#1c2233] border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQAModal(null)}
                  className="px-4 py-2 bg-[#1c2233] hover:bg-[#252c3d] text-slate-300 rounded-xl font-bold transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !qaFormData.concentration || !qaFormData.labImage}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'اعتماد وحفظ نتائج التحليل' : 'Save & Approve QA'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. R-ITEMS STOCK BALANCES MODAL (SOURCE WH VS COMPANY TOTAL)              */}
      {/* ========================================================================= */}
      {showRStockModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#131722] text-white rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-800 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-xl">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {isAr ? 'أرصدة خامات التحضير والخلط (R-Items Inventory)' : 'Preparation R-Items Stock Balances'}
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {isAr ? 'مقارنة الرصيد المتاح بمخزن الصرف وإجمالي مستودعات الشركة (مستبعد منها الخامات الخدمية)' : 'Source Warehouse vs. Total Company inventory balances'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRStockModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Balances Listing Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-[#1c2233]">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-[#181d2c] text-slate-300 font-bold border-b border-slate-800">
                    <th className="p-3 text-start">{isAr ? 'الخامة (Flag R)' : 'R-Material'}</th>
                    <th className="p-3 text-center">{isAr ? 'معدل الشدة' : 'Pack Ratio'}</th>
                    <th className="p-3 text-center bg-cyan-950/40 border-x border-slate-800 text-cyan-300">
                      {isAr
                        ? `المتاح بمخزن الصرف (${rItemsStockData[0]?.sourceWhName || 'الخامات'})`
                        : `Source WH (${rItemsStockData[0]?.sourceWhName || 'Raw Materials'})`}
                    </th>
                    <th className="p-3 text-center bg-blue-950/40 text-blue-300">
                      {isAr ? 'إجمالي مستودعات الشركة' : 'Company-Wide Balance'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {rItemsStockData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                        {isAr ? 'لا توجد خامات مدخلات (R) مسجلة.' : 'No R-materials registered.'}
                      </td>
                    </tr>
                  ) : (
                    rItemsStockData.map((item) => (
                      <tr key={item.code} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 align-top">
                          <span className="font-bold text-white block">{item.nameAr}</span>
                          <span className="font-mono text-[10px] text-slate-400">[{item.code}]</span>
                        </td>

                        <td className="p-3 align-top text-center font-mono text-[11px] text-slate-400">
                          1 {item.largeUnitName} = {item.packagingRatio} {item.smallUnit}
                        </td>

                        {/* Source WH Column (Large Unit Hero, Small Unit Secondary) */}
                        <td className="p-3 align-top text-center bg-cyan-950/20 border-x border-slate-800 font-mono">
                          <div className="font-black text-cyan-300 text-base">
                            {item.sourceWhLarge.toLocaleString()} <span className="text-[11px] font-sans font-extrabold text-cyan-400">{item.largeUnitName}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                            = {item.sourceWhSmall.toLocaleString()} {item.smallUnit}
                          </span>
                        </td>

                        {/* Total Company Column (Large Unit Hero, Small Unit Secondary) */}
                        <td className="p-3 align-top text-center bg-blue-950/20 font-mono">
                          <div className="font-black text-blue-300 text-base">
                            {item.totalCompanyLarge.toLocaleString()} <span className="text-[11px] font-sans font-extrabold text-blue-400">{item.largeUnitName}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                            = {item.totalCompanySmall.toLocaleString()} {item.smallUnit}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRStockModal(false)}
                className="px-5 py-2 bg-[#1c2233] hover:bg-[#252c3d] text-white rounded-xl text-xs font-bold transition"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. HIGH-RESOLUTION IMAGE LIGHTBOX POPOVER                                 */}
      {/* ========================================================================= */}
      {imagePreviewModal && (
        <div
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-150"
          onClick={() => setImagePreviewModal(null)}
        >
          <div
            className="bg-[#131722] text-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-800 space-y-3 relative flex flex-col items-center max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center w-full border-b border-slate-800 pb-2.5">
              <div>
                <h4 className="text-sm font-extrabold text-white">{imagePreviewModal.title}</h4>
                {imagePreviewModal.subtitle && (
                  <span className="text-[11px] font-mono text-blue-400 font-bold block mt-0.5">
                    {imagePreviewModal.subtitle}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImagePreviewModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="w-full flex-1 flex items-center justify-center bg-black rounded-2xl border border-slate-800 p-2 overflow-hidden min-h-[280px]">
              <img
                src={imagePreviewModal.url}
                alt="Preview"
                className="max-h-[55vh] max-w-full object-contain rounded-xl"
              />
            </div>

            <div className="flex justify-end w-full pt-1">
              <button
                type="button"
                onClick={() => setImagePreviewModal(null)}
                className="px-5 py-2 bg-[#1c2233] hover:bg-[#252c3d] text-white rounded-xl text-xs font-bold cursor-pointer"
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