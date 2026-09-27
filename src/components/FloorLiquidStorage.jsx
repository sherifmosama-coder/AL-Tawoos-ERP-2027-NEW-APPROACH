import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  Activity,
  Layers,
  FlaskConical,
  Settings2,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  Factory,
  Sliders,
  TrendingDown,
  TrendingUp,
  Droplet,
  Waves,
  Eye,
  Edit3,
  X,
  Plus,
  RefreshCw,
  Search,
  Filter,
  FileText,
  Package,
  Calendar,
  Zap,
  Info,
  Copy,
  Check,
  Lock
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import PeacockLoader from './PeacockLoader';
import {
  getQuarantineWarehouses,
  getFactoryFloorWarehouse,
  getWarehouseDisplayName,
  matchWarehouse
} from '../utils/warehouseClassifier';

export default function FloorLiquidStorage({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { toast, showAlert, showConfirm } = useNotification();

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // Dynamic Authority Resolvers
  const canConfigureStorage = isGeneralAdmin || (
    permissions?.actions?.['liquid_storage.canConfigureStorage'] !== undefined
      ? permissions.actions['liquid_storage.canConfigureStorage'] === true
      : permissions?.actions?.canConfigureStorage === true
  );

  const canAdminOverrideTanks = isGeneralAdmin || (
    permissions?.actions?.['liquid_storage.canAdminOverrideTanks'] !== undefined
      ? permissions.actions['liquid_storage.canAdminOverrideTanks'] === true
      : permissions?.actions?.canAdminOverrideTanks === true
  );

  const canResetCleanout = isGeneralAdmin || (
    permissions?.actions?.['liquid_storage.canResetCleanout'] !== undefined
      ? permissions.actions['liquid_storage.canResetCleanout'] === true
      : permissions?.actions?.canResetCleanout === true
  );

  // Subscriptions & Cloud State
  const [vesselDocs, setVesselDocs] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [liquidTanks, setLiquidTanks] = useState([]);
  const [intermediateRecipes, setIntermediateRecipes] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [stagedPallets, setStagedPallets] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [systemSerialConfig, setSystemSerialConfig] = useState({
    startingSerialNumber: 1,
    mItemsOrder: [],
    recipeOrders: {},
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Selected Material Tab (Ordered strictly by system_config/tanks_config)
  const [selectedMaterialCode, setSelectedMaterialCode] = useState('');
  const [userSelectedManually, setUserSelectedManually] = useState(false);

  // Modals State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showCleanoutModal, setShowCleanoutModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedTankForDetails, setSelectedTankForDetails] = useState(null);
  const [copiedLot, setCopiedLot] = useState(null);
  const [outflowFilter, setOutflowFilter] = useState('all'); // 'all' | 'active' | 'history'

  // Form States
  const [configFormData, setConfigFormData] = useState({
    vesselType: 'interconnected',
    vesselCount: 2,
    capacityPerVessel: 3000,
    totalCapacity: 6000,
    singleBatchVolume: 1000,
    activeRecipeCode: '',
    lowLevelThreshold: 500,
    heelTolerancePct: 5,
  });

  const [cleanoutReason, setCleanoutReason] = useState('');
  const [cleanoutScrapVolume, setCleanoutScrapVolume] = useState('0');
  const [cleanoutTargetWarehouseId, setCleanoutTargetWarehouseId] = useState('');

  // 1. Subscribe to Collections & Config
  useEffect(() => {
    const unsubVessels = onSnapshot(collection(db, 'floor_liquid_vessels'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setVesselDocs(list);
      setLoading(false);
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setWarehouses(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItemsMaster(snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id })));
    });

    const unsubTanks = onSnapshot(collection(db, 'liquid_tanks'), (snap) => {
      setLiquidTanks(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubRecipes = onSnapshot(collection(db, 'intermediate_recipes'), (snap) => {
      setIntermediateRecipes(snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id })));
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

    const unsubOrders = onSnapshot(collection(db, 'work_orders'), (snap) => {
      setWorkOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubPallets = onSnapshot(collection(db, 'staged_floor_pallets'), (snap) => {
      setStagedPallets(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubVessels();
      unsubWarehouses();
      unsubItems();
      unsubTanks();
      unsubRecipes();
      unsubConfig();
      unsubOrders();
      unsubPallets();
    };
  }, []);

  // Filter "M" AND "F" Flagged Materials (Ordered strictly by system_config/tanks_config sequence)
  const mfLiquidMaterials = useMemo(() => {
    // 1. Primary Priority: Items having BOTH 'M' AND 'F' flags
    const strictlyBothMandF = itemsMaster.filter((item) => {
      const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
      const upper = flagsArr.map((f) => String(f).toUpperCase().trim());
      const hasM = upper.includes('M') || (item.code && item.code.toUpperCase().includes('M'));
      const hasF = upper.includes('F') || (item.code && item.code.toUpperCase().includes('F'));
      return hasM && hasF;
    });

    let list = strictlyBothMandF.length > 0 ? strictlyBothMandF : itemsMaster.filter((item) => {
      const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
      const upper = flagsArr.map((f) => String(f).toUpperCase().trim());
      const hasM = upper.includes('M');
      const hasF = upper.includes('F');
      const isLiquid = (item.smallUnit || '').includes('لتر') ||
                       (item.smallUnit || '').toLowerCase().includes('liter') ||
                       (item.nameAr || '').includes('خل') ||
                       (item.nameEn || '').toLowerCase().includes('vinegar');
      return (hasM || hasF) && isLiquid;
    });

    // 2. Sort strictly by custom configured sequence from system_config/tanks_config (mItemsOrder)
    const orderMap = {};
    (systemSerialConfig?.mItemsOrder || []).forEach((code, idx) => {
      orderMap[code] = idx;
    });

    list.sort((a, b) => {
      const orderA = orderMap[a.code] !== undefined ? orderMap[a.code] : 9999;
      const orderB = orderMap[b.code] !== undefined ? orderMap[b.code] : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
    });

    return list;
  }, [itemsMaster, systemSerialConfig?.mItemsOrder]);

  // Set default selected material: The first material in configured sequence is strictly the default
  useEffect(() => {
    if (mfLiquidMaterials.length > 0) {
      if (!selectedMaterialCode || !userSelectedManually) {
        setSelectedMaterialCode(mfLiquidMaterials[0].code);
      }
    }
  }, [mfLiquidMaterials, userSelectedManually, selectedMaterialCode]);

  // Current Target Material Object
  const currentMaterial = useMemo(() => {
    return mfLiquidMaterials.find((m) => m.code === selectedMaterialCode) || mfLiquidMaterials[0] || null;
  }, [mfLiquidMaterials, selectedMaterialCode]);

  // Dynamic Warehouse Classifications (Single Source of Truth)
  const quarantineWarehouses = useMemo(() => {
    return getQuarantineWarehouses(warehouses);
  }, [warehouses]);

  const factoryFloorWarehouse = useMemo(() => {
    return getFactoryFloorWarehouse(warehouses);
  }, [warehouses]);

  // Available Recipes for current material from intermediate_bom (intermediate_recipes)
  const materialRecipes = useMemo(() => {
    if (!currentMaterial) return [];
    const list = intermediateRecipes.filter((r) => r.targetItemId === currentMaterial.code);
    const customOrder = systemSerialConfig.recipeOrders?.[currentMaterial.code] || [];
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
  }, [intermediateRecipes, currentMaterial, systemSerialConfig.recipeOrders]);

  // Current Material's Floor Storage Vessel Document (from Firestore or default blueprint)
  const currentVessel = useMemo(() => {
    if (!currentMaterial) return null;
    const existing = vesselDocs.find((v) => v.materialCode === currentMaterial.code || v.id === currentMaterial.code);
    if (existing) return existing;

    // Default configuration blueprint if not yet saved in cloud
    const isWhite = (currentMaterial.nameAr || '').includes('أبيض') || (currentMaterial.nameEn || '').toLowerCase().includes('white');
    const isApple = (currentMaterial.nameAr || '').includes('تفاح') || (currentMaterial.nameEn || '').toLowerCase().includes('apple');

    return {
      id: currentMaterial.code,
      materialCode: currentMaterial.code,
      materialNameAr: currentMaterial.nameAr,
      materialNameEn: currentMaterial.nameEn || '',
      vesselType: isWhite ? 'interconnected' : 'single',
      vesselCount: isWhite ? 2 : 1,
      capacityPerVessel: isWhite ? 3000 : (isApple ? 2000 : 3000),
      totalCapacity: isWhite ? 6000 : (isApple ? 2000 : 3000),
      singleBatchVolume: 1000,
      activeRecipeCode: '',
      lowLevelThreshold: 500,
      heelTolerancePct: 5,
      currentVolume: 0,
      activeTanks: [],
      historyTanks: [],
    };
  }, [currentMaterial, vesselDocs]);

  // Calculate live volume & blend metrics across active tanks
  const activeTanksList = useMemo(() => {
    return Array.isArray(currentVessel?.activeTanks) ? currentVessel.activeTanks : [];
  }, [currentVessel]);

  const totalActiveVolume = useMemo(() => {
    return activeTanksList.reduce((sum, t) => sum + (Number(t.remainingVolume) || 0), 0);
  }, [activeTanksList]);

  // Real-Time Pumping Synchronization with #liquid_tanks
  const activePumpingTank = useMemo(() => {
    if (!currentMaterial) return null;
    return liquidTanks.find((t) => {
      const matchesMat = t.itemCode === currentMaterial.code ||
        (t.itemNameAr && currentMaterial.nameAr && t.itemNameAr.includes(currentMaterial.nameAr));
      return matchesMat && (t.pumpStatus === 'pumping' || t.pumpStatus === 'paused');
    }) || null;
  }, [liquidTanks, currentMaterial]);

  const isPumpingActive = activePumpingTank?.pumpStatus === 'pumping';
  const isPumpingPaused = activePumpingTank?.pumpStatus === 'paused';

  // Active / Selected Formula for producing this material from intermediate_bom
  const activeRecipe = useMemo(() => {
    if (!currentMaterial) return null;
    // 1. If active tanks in vessel or active pumping tank specify a recipe:
    const tankRecipeRef = activePumpingTank?.recipeId || 
      activeTanksList[activeTanksList.length - 1]?.recipeId || 
      activeTanksList[0]?.recipeId;
    const tankPrepRef = activePumpingTank?.prepCode || 
      activeTanksList[activeTanksList.length - 1]?.prepCode || 
      activeTanksList[0]?.prepCode;

    if (tankRecipeRef || tankPrepRef) {
      const matched = materialRecipes.find((r) => 
        (tankRecipeRef && (r.code === tankRecipeRef || r.id === tankRecipeRef)) ||
        (tankPrepRef && r.prepCode === tankPrepRef)
      );
      if (matched) return matched;
    }

    // 2. If vessel has a configured activeRecipeCode:
    if (currentVessel?.activeRecipeCode) {
      const matched = materialRecipes.find((r) => r.code === currentVessel.activeRecipeCode || r.id === currentVessel.activeRecipeCode);
      if (matched) return matched;
    }

    // 3. Fallback to primary / first recipe from intermediate_bom
    return materialRecipes[0] || null;
  }, [currentMaterial, materialRecipes, activePumpingTank, activeTanksList, currentVessel?.activeRecipeCode]);

  // SINGLE BATCH VOLUME: Read dynamically from intermediate_bom according to formula used producing this material
  const bomBatchYield = activeRecipe?.batchYieldQty ? Number(activeRecipe.batchYieldQty) : null;
  const singleBatchVolume = bomBatchYield || Number(currentVessel?.singleBatchVolume) || 1000;
  const maxCapacity = Number(currentVessel?.totalCapacity) || 6000;
  
  // DYNAMIC MAX TANKS: Determined strictly by capacity of storage divided by single batch volume
  const calculatedMaxTanks = Math.max(1, Math.ceil(maxCapacity / singleBatchVolume));
  const fillPercentage = maxCapacity > 0 ? Math.min(100, Math.round((totalActiveVolume / maxCapacity) * 100)) : 0;

  // Auto-Reconciliation of newly completed tanks from #liquid_tanks into active floor vessel
  const reconcileCompletedTanks = async (tanksToReconcile) => {
    if (!currentMaterial || !currentVessel || isSaving) return;
    try {
      setIsSaving(true);
      const vRef = doc(db, 'floor_liquid_vessels', currentMaterial.code);
      const newActiveTanks = [...(currentVessel.activeTanks || [])];
      const newHistoryTanks = [...(currentVessel.historyTanks || [])];
      const nowIso = new Date().toISOString();

      tanksToReconcile.forEach((tank) => {
        const tankNum = tank.tankNumber || (tank.shortLotNumber ? tank.shortLotNumber.replace('#', '') : (tank.lotNumber || tank.id));
        const vol = Number(tank.transferQuantity || tank.batchYieldQty || singleBatchVolume || 1000);
        newActiveTanks.push({
          tankId: tank.id,
          tankNumber: tankNum,
          lotNumber: tank.lotNumber || tankNum,
          initialVolume: vol,
          remainingVolume: vol,
          qaAcidity: Number(tank.qaData?.acidity || tank.qaData?.concentration) || (tank.recipeName?.includes('5%') ? 5.0 : 5.0),
          pumpFinishedAt: tank.pumpFinishedAt || nowIso,
          pumpedBy: tank.pumpedBy || 'Auto-Sync (#liquid_tanks)',
          recipeId: tank.recipeId || null,
          prepCode: tank.prepCode || null,
          recipeName: tank.recipeName || null,
          rMaterialLots: Array.isArray(tank.rMaterialLots) ? tank.rMaterialLots : [],
          status: 'active',
        });
      });

      // Prune according to dynamic calculatedMaxTanks
      while (newActiveTanks.length > calculatedMaxTanks) {
        const overflow = newActiveTanks.shift();
        newHistoryTanks.unshift({
          ...overflow,
          depletedAt: nowIso,
          status: 'archived_overflow',
        });
      }

      const updatedPoolVol = newActiveTanks.reduce((s, t) => s + (Number(t.remainingVolume) || 0), 0);

      await setDoc(vRef, {
        ...currentVessel,
        currentVolume: updatedPoolVol,
        activeTanks: newActiveTanks,
        historyTanks: newHistoryTanks,
        lastInflowAt: nowIso,
        singleBatchVolume,
        activeRecipeCode: activeRecipe?.code || currentVessel.activeRecipeCode || null,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast.success(
        isAr
          ? `تم مزامنة واستقبال تانكات منتهية الضخ (${tanksToReconcile.length} تانك) بالخزان بنجاح.`
          : `Synced ${tanksToReconcile.length} completed tanks from #liquid_tanks into active floor vessel.`,
        isAr ? 'مزامنة الضخ' : 'Pumping Synced'
      );
    } catch (err) {
      console.error('Auto reconcile error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Continuous background detection for pumping completion
  useEffect(() => {
    if (!currentMaterial || !currentVessel || isSaving) return;

    const activeIds = new Set((currentVessel.activeTanks || []).map((t) => String(t.tankId || t.tankNumber)));
    const historyIds = new Set((currentVessel.historyTanks || []).map((t) => String(t.tankId || t.tankNumber)));

    const pendingCompleted = liquidTanks.filter((lt) => {
      const matchesMat = lt.itemCode === currentMaterial.code ||
        (lt.itemNameAr && currentMaterial.nameAr && lt.itemNameAr.includes(currentMaterial.nameAr));
      const isDone = lt.pumpStatus === 'completed' || Boolean(lt.pumpFinishedAt);
      const tId = String(lt.id || lt.tankNumber);
      const tNum = String(lt.tankNumber || lt.shortLotNumber?.replace('#', '') || lt.id);
      return matchesMat && isDone && !activeIds.has(tId) && !activeIds.has(tNum) && !historyIds.has(tId) && !historyIds.has(tNum);
    });

    if (pendingCompleted.length > 0) {
      reconcileCompletedTanks(pendingCompleted);
    }
  }, [liquidTanks, currentMaterial, currentVessel]);

  // Reconcile and reverse any ghost pallet consumptions where the pallet was deleted in Work Orders
  const reconcilePalletConsumptions = async () => {
    if (!currentMaterial || !currentVessel || isSaving) return 0;
    if (workOrders.length === 0 && stagedPallets.length === 0) return 0;

    try {
      const validPalletIds = new Set();
      (stagedPallets || []).forEach((p) => {
        if (p.id) validPalletIds.add(String(p.id));
        if (p.palletId) validPalletIds.add(String(p.palletId));
      });
      (workOrders || []).forEach((wo) => {
        if (Array.isArray(wo.pallets)) {
          wo.pallets.forEach((p) => {
            if (p.id) validPalletIds.add(String(p.id));
            if (p.palletId) validPalletIds.add(String(p.palletId));
          });
        }
      });

      let totalLitersRestored = 0;
      const activeTanks = (currentVessel.activeTanks || []).map((t) => ({ ...t }));
      let historyTanks = (currentVessel.historyTanks || []).map((t) => ({ ...t }));

      const checkTankForGhostPallets = (t) => {
        if (!Array.isArray(t.consumedByPallets) || t.consumedByPallets.length === 0) return false;
        const ghostEntries = t.consumedByPallets.filter((cp) => {
          const pId = cp.palletId;
          if (pId && !validPalletIds.has(String(pId))) return true;
          if (!pId && cp.workOrderId) {
            const wo = workOrders.find((w) => w.id === cp.workOrderId || String(w.orderNumber) === String(cp.orderNumber));
            const hasPallet = wo && Array.isArray(wo.pallets) && wo.pallets.some((pl) => Number(pl.palletNumber) === Number(cp.palletNumber));
            return !hasPallet;
          }
          return false;
        });

        if (ghostEntries.length > 0) {
          const litersToReturn = ghostEntries.reduce((s, ge) => s + (Number(ge.consumedLiters) || 0), 0);
          if (litersToReturn > 0) {
            const curRem = Number(t.remainingVolume) || 0;
            const initVol = Number(t.initialVolume || t.volume || t.transferQuantity || 1000);
            let newRem = Number((curRem + litersToReturn).toFixed(2));
            if (initVol > 0 && newRem > initVol) newRem = initVol;
            t.remainingVolume = newRem;
            totalLitersRestored += litersToReturn;
          }
          t.consumedByPallets = t.consumedByPallets.filter((cp) => !ghostEntries.includes(cp));

          if (Array.isArray(t.finishedWorkOrderIds)) {
            t.finishedWorkOrderIds = t.finishedWorkOrderIds.filter((woId) => {
              return (t.consumedByPallets || []).some(
                (cp) => String(cp.orderNumber) === String(woId) || String(cp.workOrderId) === String(woId)
              );
            });
          }
          return true;
        }
        return false;
      };

      activeTanks.forEach(checkTankForGhostPallets);

      const tanksToRevive = [];
      historyTanks = historyTanks.filter((ht) => {
        const hadGhost = checkTankForGhostPallets(ht);
        if (hadGhost && (Number(ht.remainingVolume) || 0) > 0) {
          ht.status = 'active';
          delete ht.depletedAt;
          tanksToRevive.push(ht);
          return false;
        }
        return true;
      });

      if (tanksToRevive.length > 0) {
        tanksToRevive.forEach((rt) => {
          if (!activeTanks.some((at) => (rt.tankId && at.tankId === rt.tankId) || (rt.tankNumber && String(at.tankNumber) === String(rt.tankNumber)))) {
            activeTanks.push(rt);
          }
        });
        activeTanks.sort((a, b) => {
          if (a.pumpFinishedAt && b.pumpFinishedAt) return a.pumpFinishedAt.localeCompare(b.pumpFinishedAt);
          return Number(a.tankNumber || 0) - Number(b.tankNumber || 0);
        });
      }

      if (totalLitersRestored > 0 || tanksToRevive.length > 0) {
        setIsSaving(true);
        const vRef = doc(db, 'floor_liquid_vessels', currentMaterial.code);
        const newVol = activeTanks.reduce((s, t) => s + (Number(t.remainingVolume) || 0), 0);
        await setDoc(
          vRef,
          {
            ...currentVessel,
            activeTanks,
            historyTanks,
            currentVolume: newVol,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        toast.success(
          isAr
            ? `تم استرجاع (${totalLitersRestored.toFixed(1)} لتر) تلقائياً لخزانات الصالة من باليتات محذوفة.`
            : `Auto-restored ${totalLitersRestored.toFixed(1)} L back to floor vessels from deleted pallets.`,
          isAr ? 'مزامنة الصالة' : 'Floor Synced'
        );
      }
      return totalLitersRestored;
    } catch (err) {
      console.error('Error reconciling pallet consumptions:', err);
      return 0;
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-detect and reconcile ghost pallet consumptions when collections are ready
  const hasReconciledRef = useRef(false);
  useEffect(() => {
    if (hasReconciledRef.current || !currentMaterial || !currentVessel || isSaving) return;
    if (workOrders.length > 0 || stagedPallets.length > 0) {
      hasReconciledRef.current = true;
      reconcilePalletConsumptions();
    }
  }, [workOrders, stagedPallets, currentMaterial, currentVessel]);

  // Manual Trigger to re-check and sync
  const handleManualSync = async () => {
    if (!currentMaterial || !currentVessel) return;
    const activeIds = new Set((currentVessel.activeTanks || []).map((t) => String(t.tankId || t.tankNumber)));
    const historyIds = new Set((currentVessel.historyTanks || []).map((t) => String(t.tankId || t.tankNumber)));

    const pendingCompleted = liquidTanks.filter((lt) => {
      const matchesMat = lt.itemCode === currentMaterial.code ||
        (lt.itemNameAr && currentMaterial.nameAr && lt.itemNameAr.includes(currentMaterial.nameAr));
      const isDone = lt.pumpStatus === 'completed' || Boolean(lt.pumpFinishedAt);
      const tId = String(lt.id || lt.tankNumber);
      const tNum = String(lt.tankNumber || lt.shortLotNumber?.replace('#', '') || lt.id);
      return matchesMat && isDone && !activeIds.has(tId) && !activeIds.has(tNum) && !historyIds.has(tId) && !historyIds.has(tNum);
    });

    let performedAction = false;
    if (pendingCompleted.length > 0) {
      await reconcileCompletedTanks(pendingCompleted);
      performedAction = true;
    }

    const restoredLiters = await reconcilePalletConsumptions();
    if (restoredLiters > 0) {
      performedAction = true;
    }

    if (!performedAction) {
      toast.info(
        isAr
          ? 'خزانات الصالة متزامنة بالكامل مع تانكات الخلط وأوامر التشغيل.'
          : 'Floor storage is fully synced with Liquid Tanks and Work Orders.'
      );
    }
  };

  // Copy LOT code to clipboard with visual feedback
  const handleCopyLot = (lotCode) => {
    if (!lotCode) return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(lotCode);
      }
    } catch (e) {
      console.warn('Clipboard writeText failed:', e);
    }
    setCopiedLot(lotCode);
    toast.success(
      isAr ? `تم نسخ رقم التشغيلة: ${lotCode}` : `Copied LOT: ${lotCode}`,
      isAr ? 'تم النسخ' : 'Copied'
    );
    setTimeout(() => {
      setCopiedLot((prev) => (prev === lotCode ? null : prev));
    }, 2000);
  };

  // Weighted Average Acidity % of the blended active pool
  const blendedAcidity = useMemo(() => {
    if (totalActiveVolume <= 0) return 0;
    let weightedSum = 0;
    activeTanksList.forEach((t) => {
      const vol = Number(t.remainingVolume) || 0;
      const acid = Number(t.qaAcidity || t.concentration) || 5.0;
      weightedSum += vol * acid;
    });
    return Number((weightedSum / totalActiveVolume).toFixed(2));
  }, [activeTanksList, totalActiveVolume]);

  // Combined Active & History Tanks for Outflow Lifecycle Tracking
  const lifecycleTanks = useMemo(() => {
    if (!currentVessel) return [];
    const active = (currentVessel.activeTanks || []).map((t) => ({ ...t, isCurrentActive: true }));
    const history = (currentVessel.historyTanks || []).map((t) => ({ ...t, isCurrentActive: false }));
    let list = [];
    if (outflowFilter === 'active') {
      list = active;
    } else if (outflowFilter === 'history') {
      list = history;
    } else {
      list = [...active, ...history];
    }
    return list;
  }, [currentVessel, outflowFilter]);

  // Comprehensive Resolution of Linked Work Orders and Pallets for a Tank
  const getTankLifecycleOutflow = (tank) => {
    if (!tank) return [];
    const tNum = String(tank.tankNumber || tank.lotNumber || tank.tankId || '').replace('#', '').trim();
    const tId = String(tank.tankId || tank.id || '').trim();
    const orderMap = new Map();

    // 1. From tank.consumedByPallets
    if (Array.isArray(tank.consumedByPallets)) {
      tank.consumedByPallets.forEach((entry) => {
        const oNum = String(entry.orderNumber || entry.workOrderId || '').trim();
        if (!oNum) return;
        if (!orderMap.has(oNum)) {
          orderMap.set(oNum, {
            orderNumber: oNum,
            workOrderId: entry.workOrderId || oNum,
            productName: '',
            pallets: new Set(),
            totalLiters: 0,
            palletDetails: [],
          });
        }
        const grp = orderMap.get(oNum);
        if (entry.palletNumber !== undefined && entry.palletNumber !== null) {
          grp.pallets.add(Number(entry.palletNumber));
        }
        grp.totalLiters += Number(entry.consumedLiters || 0);
        grp.palletDetails.push({
          palletNumber: entry.palletNumber,
          palletId: entry.palletId,
          consumedLiters: entry.consumedLiters,
          timestamp: entry.timestamp,
          startTime: entry.startTime,
          endTime: entry.endTime,
          productionDate: entry.productionDate,
        });
      });
    }

    // 2. From stagedPallets
    (stagedPallets || []).forEach((sp) => {
      const oNum = String(sp.orderNumber || sp.workOrderId || '').trim();
      if (!oNum) return;

      const hasTankInIntermediate = Array.isArray(sp.intermediateLiquidTanks) && sp.intermediateLiquidTanks.some((ilt) => {
        const numMatch = String(ilt.tankNumber || '').replace('#', '').trim() === tNum;
        const idMatch = tId && String(ilt.tankId || '').trim() === tId;
        return numMatch || idMatch;
      });

      const hasTankInConsumed = Array.isArray(sp.consumedComponents) && sp.consumedComponents.some((comp) => {
        return Array.isArray(comp.intermediateLiquidTanks) && comp.intermediateLiquidTanks.some((ilt) => {
          const numMatch = String(ilt.tankNumber || '').replace('#', '').trim() === tNum;
          const idMatch = tId && String(ilt.tankId || '').trim() === tId;
          return numMatch || idMatch;
        });
      });

      const hasTankInDisplay = sp.intermediateLiquidTanksDisplay && String(sp.intermediateLiquidTanksDisplay).includes(tNum);

      if (hasTankInIntermediate || hasTankInConsumed || hasTankInDisplay) {
        if (!orderMap.has(oNum)) {
          orderMap.set(oNum, {
            orderNumber: oNum,
            workOrderId: sp.workOrderId || oNum,
            productName: sp.productNameAr || sp.productNameEn || '',
            pallets: new Set(),
            totalLiters: 0,
            palletDetails: [],
          });
        }
        const grp = orderMap.get(oNum);
        if (!grp.productName) grp.productName = sp.productNameAr || sp.productNameEn || '';
        if (sp.palletNumber !== undefined && sp.palletNumber !== null) {
          grp.pallets.add(Number(sp.palletNumber));
        }
        const entry = (sp.intermediateLiquidTanks || []).find((ilt) => String(ilt.tankNumber || '').replace('#', '').trim() === tNum);
        if (entry?.consumedLiters && !grp.palletDetails.some((d) => d.palletNumber === sp.palletNumber)) {
          grp.totalLiters += Number(entry.consumedLiters || 0);
          grp.palletDetails.push({
            palletNumber: sp.palletNumber,
            palletId: sp.id || sp.palletId,
            consumedLiters: entry.consumedLiters,
            startTime: sp.startTime,
            endTime: sp.endTime,
            productionDate: sp.productionDate,
          });
        }
      }
    });

    // 3. From workOrders
    (workOrders || []).forEach((wo) => {
      const oNum = String(wo.orderNumber || wo.id || '').trim();
      if (!oNum) return;

      if (Array.isArray(wo.pallets)) {
        wo.pallets.forEach((p) => {
          const hasTank = (Array.isArray(p.intermediateLiquidTanks) && p.intermediateLiquidTanks.some((ilt) => {
            const numMatch = String(ilt.tankNumber || '').replace('#', '').trim() === tNum;
            const idMatch = tId && String(ilt.tankId || '').trim() === tId;
            return numMatch || idMatch;
          })) || (p.intermediateLiquidTanksDisplay && String(p.intermediateLiquidTanksDisplay).includes(tNum));

          if (hasTank) {
            if (!orderMap.has(oNum)) {
              orderMap.set(oNum, {
                orderNumber: oNum,
                workOrderId: wo.id,
                productName: wo.productNameAr || wo.productNameEn || '',
                pallets: new Set(),
                totalLiters: 0,
                palletDetails: [],
              });
            }
            const grp = orderMap.get(oNum);
            if (!grp.productName) grp.productName = wo.productNameAr || wo.productNameEn || '';
            if (p.palletNumber !== undefined && p.palletNumber !== null) {
              grp.pallets.add(Number(p.palletNumber));
            }
          }
        });
      }

      if (orderMap.has(oNum)) {
        const grp = orderMap.get(oNum);
        if (!grp.productName) grp.productName = wo.productNameAr || wo.productNameEn || '';
      }
    });

    // 4. From tank.finishedWorkOrderIds
    if (Array.isArray(tank.finishedWorkOrderIds)) {
      tank.finishedWorkOrderIds.forEach((woId) => {
        const oNum = String(woId).trim();
        if (!orderMap.has(oNum)) {
          const matchingWo = (workOrders || []).find((w) => String(w.orderNumber) === oNum || String(w.id) === oNum);
          orderMap.set(oNum, {
            orderNumber: oNum,
            workOrderId: matchingWo?.id || oNum,
            productName: matchingWo?.productNameAr || matchingWo?.productNameEn || '',
            pallets: new Set(),
            totalLiters: 0,
            palletDetails: [],
          });
        }
      });
    }

    const result = [];
    for (const [oNum, grp] of orderMap.entries()) {
      result.push({
        orderNumber: oNum,
        workOrderId: grp.workOrderId,
        productName: grp.productName,
        pallets: Array.from(grp.pallets).sort((a, b) => a - b),
        totalLiters: Number(grp.totalLiters.toFixed(2)),
        palletDetails: grp.palletDetails,
      });
    }
    return result;
  };

  // Expanded Distinct Color Palette Supporting Dynamic Active Tanks (12+ Colors)
  const TANK_COLORS = [
    { bg: 'bg-emerald-500', hex: '#10b981', border: 'border-emerald-600', text: 'text-emerald-950', light: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { bg: 'bg-blue-500', hex: '#3b82f6', border: 'border-blue-600', text: 'text-blue-950', light: 'bg-blue-50 text-blue-800 border-blue-200' },
    { bg: 'bg-indigo-500', hex: '#6366f1', border: 'border-indigo-600', text: 'text-indigo-950', light: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    { bg: 'bg-amber-500', hex: '#f59e0b', border: 'border-amber-600', text: 'text-amber-950', light: 'bg-amber-50 text-amber-800 border-amber-200' },
    { bg: 'bg-purple-500', hex: '#a855f7', border: 'border-purple-600', text: 'text-purple-950', light: 'bg-purple-50 text-purple-800 border-purple-200' },
    { bg: 'bg-cyan-500', hex: '#06b6d4', border: 'border-cyan-600', text: 'text-cyan-950', light: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
    { bg: 'bg-rose-500', hex: '#f43f5e', border: 'border-rose-600', text: 'text-rose-950', light: 'bg-rose-50 text-rose-800 border-rose-200' },
    { bg: 'bg-teal-500', hex: '#14b8a6', border: 'border-teal-600', text: 'text-teal-950', light: 'bg-teal-50 text-teal-800 border-teal-200' },
    { bg: 'bg-orange-500', hex: '#f97316', border: 'border-orange-600', text: 'text-orange-950', light: 'bg-orange-50 text-orange-800 border-orange-200' },
    { bg: 'bg-violet-500', hex: '#8b5cf6', border: 'border-violet-600', text: 'text-violet-950', light: 'bg-violet-50 text-violet-800 border-violet-200' },
    { bg: 'bg-sky-500', hex: '#0ea5e9', border: 'border-sky-600', text: 'text-sky-950', light: 'bg-sky-50 text-sky-800 border-sky-200' },
    { bg: 'bg-lime-500', hex: '#84cc16', border: 'border-lime-600', text: 'text-lime-950', light: 'bg-lime-50 text-lime-800 border-lime-200' },
  ];

  // Open Storage Configuration Modal
  const handleOpenConfigModal = () => {
    if (!currentVessel) return;
    setConfigFormData({
      vesselType: currentVessel.vesselType || 'interconnected',
      vesselCount: Number(currentVessel.vesselCount) || 2,
      capacityPerVessel: Number(currentVessel.capacityPerVessel) || 3000,
      totalCapacity: Number(currentVessel.totalCapacity) || 6000,
      singleBatchVolume: singleBatchVolume || Number(currentVessel.singleBatchVolume) || 1000,
      activeRecipeCode: currentVessel.activeRecipeCode || activeRecipe?.code || '',
      lowLevelThreshold: Number(currentVessel.lowLevelThreshold) || 500,
      heelTolerancePct: Number(currentVessel.heelTolerancePct) || 5,
    });
    setShowConfigModal(true);
  };

  // Save Storage Configuration
  const handleSaveStorageConfig = async (e) => {
    e.preventDefault();
    if (!canConfigureStorage) {
      showAlert({ title: isAr ? 'صلاحية غير كافية' : 'Permission Denied', message: isAr ? 'تعديل سعة وخزانات الصالة محصور بالمسؤول العام.' : 'Only General Admin can modify floor storage config.', variant: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      const vRef = doc(db, 'floor_liquid_vessels', currentMaterial.code);
      const updatedTotal = Number(configFormData.capacityPerVessel) * Number(configFormData.vesselCount);
      const selectedBOMRecipe = materialRecipes.find((r) => r.code === configFormData.activeRecipeCode) || activeRecipe;
      const batchVol = selectedBOMRecipe?.batchYieldQty ? Number(selectedBOMRecipe.batchYieldQty) : (Number(configFormData.singleBatchVolume) || 1000);

      await setDoc(vRef, {
        ...currentVessel,
        materialCode: currentMaterial.code,
        materialNameAr: currentMaterial.nameAr,
        materialNameEn: currentMaterial.nameEn || '',
        vesselType: configFormData.vesselType,
        vesselCount: Number(configFormData.vesselCount),
        capacityPerVessel: Number(configFormData.capacityPerVessel),
        totalCapacity: updatedTotal,
        singleBatchVolume: batchVol,
        activeRecipeCode: configFormData.activeRecipeCode || null,
        lowLevelThreshold: Number(configFormData.lowLevelThreshold),
        heelTolerancePct: Number(configFormData.heelTolerancePct),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.nameAr || currentUser?.name || 'Admin',
      }, { merge: true });

      toast.success(isAr ? 'تم تحديث إعدادات سعة الخزانات بنجاح.' : 'Floor storage configuration saved.', isAr ? 'تم الحفظ' : 'Saved');
      setShowConfigModal(false);
    } catch (err) {
      console.error('Error saving storage config:', err);
      toast.error(isAr ? 'حدث خطأ أثناء حفظ الإعدادات.' : 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Cleanout Modal (Initialize Scrapped Volume & Target Scrap Warehouse)
  const handleOpenCleanoutModal = () => {
    if (!canResetCleanout) {
      showAlert({
        title: isAr ? 'صلاحية غير كافية' : 'Permission Denied',
        message: isAr ? 'إجراء تفريغ وغسيل الخزان (CIP) محصور بالمسؤول العام.' : 'Only General Admin can perform CIP cleanout.',
        variant: 'error',
      });
      return;
    }
    // Default to total active volume
    setCleanoutScrapVolume(totalActiveVolume > 0 ? String(totalActiveVolume) : '0');
    // Pre-select primary quarantine/scrap warehouse
    const primaryScrapWh = quarantineWarehouses[0]?.id || quarantineWarehouses[0]?.code || '';
    setCleanoutTargetWarehouseId(primaryScrapWh);
    setCleanoutReason('');
    setShowCleanoutModal(true);
  };

  // CIP Tank Cleanout (Full Flush / Reset of Active Pool & Scrap Stock Transfer)
  const handleExecuteCleanout = async () => {
    if (!canResetCleanout) {
      showAlert({
        title: isAr ? 'صلاحية غير كافية' : 'Permission Denied',
        message: isAr ? 'إجراء تفريغ وغسيل الخزان (CIP) محصور بالمسؤول العام.' : 'Only General Admin can perform CIP cleanout.',
        variant: 'error',
      });
      return;
    }

    const scrappedVol = Number(cleanoutScrapVolume);
    if (isNaN(scrappedVol) || scrappedVol < 0) {
      showAlert({
        title: isAr ? 'قيمة غير صالحة' : 'Invalid Value',
        message: isAr ? 'يرجى إدخال كمية هالك صحيحة أكبر من أو تساوي 0.' : 'Please enter a valid scrapped volume >= 0.',
        variant: 'warning',
      });
      return;
    }

    if (scrappedVol > totalActiveVolume) {
      showAlert({
        title: isAr ? 'تجاوز رصيد الخزان' : 'Exceeds Pool Volume',
        message: isAr
          ? `كمية الهالك (${scrappedVol.toLocaleString()} لتر) لا يمكن أن تتجاوز إجمالي الرصيد الحالي (${totalActiveVolume.toLocaleString()} لتر).`
          : `Scrapped volume (${scrappedVol}L) cannot exceed total active pool volume (${totalActiveVolume}L).`,
        variant: 'warning',
      });
      return;
    }

    // If scrapping liquid, ensure target scrap/quarantine warehouse is selected
    if (scrappedVol > 0 && !cleanoutTargetWarehouseId && (quarantineWarehouses.length > 0 || warehouses.length > 0)) {
      showAlert({
        title: isAr ? 'حدد مستودع الهالك' : 'Select Scrap Warehouse',
        message: isAr
          ? 'يرجى اختيار مستودع مصنف كهالك/حجر لنقل الكمية المسكوبة إليه.'
          : 'Please select a scrap/quarantine warehouse to receive the scrapped liquid volume.',
        variant: 'warning',
      });
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const vRef = doc(db, 'floor_liquid_vessels', currentMaterial.code);

      // Resolve Factory Floor Source Warehouse
      const sourceWh = factoryFloorWarehouse || warehouses.find((w) => w.operationalClassification === 'factory_floor' || w.isFactoryLinked) || warehouses[0];
      const sourceWhId = sourceWh?.id || sourceWh?.code || 'FACTORY_FLOOR';

      // Resolve Target Scrap/Quarantine Warehouse
      const targetWh = warehouses.find((w) => matchWarehouse(cleanoutTargetWarehouseId, w)) || {
        id: cleanoutTargetWarehouseId,
        code: cleanoutTargetWarehouseId,
        nameAr: cleanoutTargetWarehouseId,
      };
      const targetWhId = targetWh?.id || targetWh?.code || cleanoutTargetWarehouseId;

      // Distribute scrapped volume across active tanks in FIFO order (oldest bottom tank first)
      let remainingToScrap = scrappedVol;
      const transferLines = [];
      const existingHistory = Array.isArray(currentVessel?.historyTanks) ? currentVessel.historyTanks : [];

      const retiredActiveTanks = activeTanksList.map((t) => {
        const tankRemaining = Number(t.remainingVolume) || 0;
        const tankScrapped = Math.min(remainingToScrap, tankRemaining);
        const tankFlushed = Math.max(0, tankRemaining - tankScrapped);
        remainingToScrap -= tankScrapped;

        if (tankScrapped > 0) {
          transferLines.push({
            itemId: currentMaterial.code,
            variantCode: currentMaterial.code,
            code: currentMaterial.code,
            nameAr: currentMaterial.nameAr,
            nameEn: currentMaterial.nameEn || currentMaterial.nameAr,
            specs: isAr
              ? `عادم غسيل وتطهير خزان CIP (تفريغ تانك #${t.tankNumber || t.lotNumber})`
              : `CIP Cleanout Scrapped Volume (Tank #${t.tankNumber || t.lotNumber})`,
            smallUnit: currentMaterial.smallUnit || 'لتر',
            largeUnitName: 'لتر',
            packagingRatio: 1,
            qtySmallUnits: tankScrapped,
            qtyLargeUnits: tankScrapped,
            lotNumber: t.lotNumber || (t.tankNumber ? `TANK-#${t.tankNumber}` : `CIP-${nowIso.split('T')[0]}`),
            unitPrice: 0,
            currency: 'EGP',
            receivedDate: nowIso.split('T')[0],
          });
        }

        return {
          ...t,
          depletedAt: nowIso,
          status: 'cip_drained',
          drainReason: cleanoutReason || (isAr ? 'غسيل وتطهير دوري للخزان (CIP Washout)' : 'Periodic CIP Washout'),
          drainedLiters: tankRemaining,
          scrappedLiters: tankScrapped,
          flushedLiters: tankFlushed,
          targetWarehouseId: tankScrapped > 0 ? targetWhId : null,
        };
      });

      // Handle edge case where scrappedVol > sum of active tanks remaining volume
      if (remainingToScrap > 0) {
        transferLines.push({
          itemId: currentMaterial.code,
          variantCode: currentMaterial.code,
          code: currentMaterial.code,
          nameAr: currentMaterial.nameAr,
          nameEn: currentMaterial.nameEn || currentMaterial.nameAr,
          specs: isAr ? 'عادم غسيل وتطهير خزان CIP' : 'CIP Cleanout Scrapped Volume',
          smallUnit: currentMaterial.smallUnit || 'لتر',
          largeUnitName: 'لتر',
          packagingRatio: 1,
          qtySmallUnits: remainingToScrap,
          qtyLargeUnits: remainingToScrap,
          lotNumber: `CIP-${currentMaterial.code}-${nowIso.split('T')[0]}`,
          unitPrice: 0,
          currency: 'EGP',
          receivedDate: nowIso.split('T')[0],
        });
      }

      // If scrapped volume > 0, generate and commit formal Stock Transfer (TRN)
      let trnId = null;
      if (scrappedVol > 0) {
        trnId = `TRN-CIP-${currentMaterial.code}-${Date.now()}`;
        const targetWhName = getWarehouseDisplayName(targetWh, warehouses, isAr);
        const transferDoc = {
          id: trnId,
          sourceWarehouse: sourceWhId,
          targetWarehouse: targetWhId,
          transferDate: nowIso.split('T')[0],
          isCustomDate: false,
          isCIPCleanoutScrap: true,
          productionOrderRef: `CIP-CLEANOUT-${currentMaterial.code}`,
          notes: isAr
            ? `إذن تحويل هالك غسيل خزان وتصفية رصيد (CIP) للصنف (${currentMaterial.nameAr || currentMaterial.code}) إلى (${targetWhName}) [${cleanoutReason || 'غسيل دوري'}]`
            : `CIP cleanout scrap transfer for ${currentMaterial.code} to ${targetWhName} [${cleanoutReason || 'Periodic Cleanout'}]`,
          lines: transferLines,
          status: 'completed',
          issuedBy: currentUser?.nameAr || currentUser?.name || 'Admin',
          issuedById: currentUser?.id || currentUser?.uid || '',
          verifiedBy: currentUser?.nameAr || currentUser?.name || 'Admin',
          verifiedAt: nowIso,
          auditTrail: [
            {
              version: '1.0',
              action: 'cip_cleanout_scrap',
              status: 'completed',
              performedBy: currentUser?.nameAr || currentUser?.name || 'Admin',
              timestamp: nowIso,
              noteAr: `تم تخريد ونقل (${scrappedVol.toLocaleString()} لتر) لمستودع الهالك/الحجر بموجب غسيل وتطهير الخزان`,
              noteEn: `Transferred ${scrappedVol} L to scrap/quarantine warehouse upon CIP cleanout`,
            }
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'stock_transfers', trnId), transferDoc);
      }

      // Update Floor Liquid Vessel document
      const flushedVol = Math.max(0, totalActiveVolume - scrappedVol);
      await setDoc(vRef, {
        ...currentVessel,
        currentVolume: 0,
        activeTanks: [],
        historyTanks: [...retiredActiveTanks, ...existingHistory],
        lastCleanoutAt: nowIso,
        lastCleanoutBy: currentUser?.nameAr || currentUser?.name || 'Admin',
        lastCleanoutReason: cleanoutReason || (isAr ? 'غسيل وتطهير دوري للخزان (CIP)' : 'Periodic CIP'),
        lastCleanoutScrappedVolume: scrappedVol,
        lastCleanoutFlushedVolume: flushedVol,
        lastCleanoutScrapWarehouseId: scrappedVol > 0 ? targetWhId : null,
        lastCleanoutTransferDocId: trnId,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const successMsg = scrappedVol > 0
        ? (isAr
            ? `تم تسجيل غسيل الخزان بنجاح، وترحيل (${scrappedVol.toLocaleString()} لتر) لمستودع الهالك بإذن تحويل #${trnId}، وتصفير الحوض.`
            : `CIP cleanout recorded: ${scrappedVol}L moved to scrap warehouse (TRN #${trnId}), and pool reset to 0L.`)
        : (isAr
            ? 'تم تسجيل غسيل وتفريغ الخزان (CIP) بالكامل وتصفير الحوض بنجاح.'
            : 'CIP cleanout recorded (100% drained) and vessel pool reset to 0L.');

      toast.success(successMsg, isAr ? 'اكتمل الغسيل' : 'Cleanout Done');
      setShowCleanoutModal(false);
      setCleanoutReason('');
      setCleanoutScrapVolume('0');
    } catch (err) {
      console.error('Error executing cleanout:', err);
      toast.error(isAr ? 'فشل تنفيذ عملية تفريغ الخزان وقيد الهالك.' : 'Failed to execute cleanout and scrap transfer.');
    } finally {
      setIsSaving(false);
    }
  };

  // Force-Retire a Specific Active Tank (Admin Override)
  const handleRetireTank = async (tankItem) => {
    if (!canAdminOverrideTanks) {
      showAlert({ title: isAr ? 'صلاحية غير كافية' : 'Permission Denied', message: isAr ? 'تعديل أو استبعاد التانكات النشطة محصور بالمسؤول العام.' : 'Only General Admin can retire active tanks.', variant: 'error' });
      return;
    }

    const confirmed = await showConfirm({
      title: isAr ? `استبعاد التانك #${tankItem.tankNumber}؟` : `Retire Tank #${tankItem.tankNumber}?`,
      message: isAr
        ? `هل تريد نقل التانك #${tankItem.tankNumber} (المتبقي: ${tankItem.remainingVolume} لتر) من الخزان للأرشيف يدوياً؟`
        : `Are you sure you want to retire Tank #${tankItem.tankNumber} (${tankItem.remainingVolume} L) from active floor storage?`,
      confirmLabel: isAr ? 'نعم، استبعاد' : 'Yes, Retire',
      cancelLabel: isAr ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      const nowIso = new Date().toISOString();
      const vRef = doc(db, 'floor_liquid_vessels', currentMaterial.code);

      const remainingActive = activeTanksList.filter((t) => t.tankId !== tankItem.tankId && t.tankNumber !== tankItem.tankNumber);
      const existingHistory = Array.isArray(currentVessel?.historyTanks) ? currentVessel.historyTanks : [];

      const archivedItem = {
        ...tankItem,
        status: 'admin_retired',
        depletedAt: nowIso,
        retiredBy: currentUser?.nameAr || currentUser?.name || 'Admin',
      };

      const newTotal = remainingActive.reduce((sum, t) => sum + (Number(t.remainingVolume) || 0), 0);

      await setDoc(vRef, {
        ...currentVessel,
        currentVolume: newTotal,
        activeTanks: remainingActive,
        historyTanks: [archivedItem, ...existingHistory],
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast.success(isAr ? `تم استبعاد التانك #${tankItem.tankNumber} بنجاح.` : `Tank #${tankItem.tankNumber} retired.`, isAr ? 'تم الاستبعاد' : 'Tank Retired');
    } catch (err) {
      console.error('Error retiring tank:', err);
      toast.error(isAr ? 'حدث خطأ أثناء استبعاد التانك.' : 'Failed to retire tank.');
    }
  };

  if (loading) {
    return <PeacockLoader text={isAr ? 'جاري تحميل خزانات وتدفق السوائل بالصالة...' : 'Loading Floor Liquid Storage...'} />;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. M-MATERIALS SELECTOR & QUICK CONTROL HEADER                            */}
      {/* ========================================================================= */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-50 text-cyan-700 rounded-2xl shadow-xs">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'خزانات وتدفق السوائل بصالة الإنتاج (Bulk Liquid Storage)' : 'Production Floor Liquid Storage Hub'}</span>
                <span className="text-[11px] font-mono font-bold bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full">
                  {isAr ? 'تغذية مستمرة (Continuous Top-up)' : 'Continuous Top-up'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'المحاكاة الرقمية المباشرة لمناسيب خزانات الصالة، وتتبع التانكات النشطة وخاماتها الأولية، ومسار استهلاكها بالمنتج التام.'
                  : 'Real-time visual monitoring of floor vessels, active tank composition, R-material genealogy, and consumption flow.'}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Real-time Sync Status with #liquid_tanks */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition bg-slate-50 border-slate-200 text-slate-700 shadow-2xs">
              <span className="relative flex h-2.5 w-2.5">
                {isPumpingActive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPumpingActive ? 'bg-emerald-500' : isPumpingPaused ? 'bg-amber-500' : 'bg-slate-400'}`} />
              </span>
              <span className="font-mono text-[11px]">
                {isPumpingActive 
                  ? (isAr ? `جاري ضخ تانك #${activePumpingTank?.tankNumber}` : `Pumping #${activePumpingTank?.tankNumber}`)
                  : isPumpingPaused
                    ? (isAr ? `الضخ متوقف مؤقتاً: #${activePumpingTank?.tankNumber}` : `Paused #${activePumpingTank?.tankNumber}`)
                    : (isAr ? 'متزامن مع #liquid_tanks' : 'Synced with #liquid_tanks')
                }
              </span>
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSaving}
                title={isAr ? 'مزامنة فورية مع تبويب التانكات' : 'Force Sync with #liquid_tanks'}
                className="p-1 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isSaving ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {canConfigureStorage && (
              <button
                type="button"
                onClick={handleOpenConfigModal}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Settings2 className="h-3.5 w-3.5 text-slate-600" />
                <span>{isAr ? 'ضبط سعة الخزانات' : 'Configure Storage'}</span>
              </button>
            )}

            {canResetCleanout && (
              <button
                type="button"
                onClick={handleOpenCleanoutModal}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title={isAr ? 'تفريغ وتصفير الخزان وتحديد كمية الهالك (CIP)' : 'CIP Tank Flush, Scrap Quarantine & Pool Reset'}
              >
                <Waves className="h-3.5 w-3.5 text-amber-700" />
                <span>{isAr ? 'غسيل وتفريغ (CIP)' : 'CIP Cleanout'}</span>
              </button>
            )}
          </div>
        </div>

        {/* M-Materials Horizontal Tab Pills with M & F badges */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {mfLiquidMaterials.map((mat) => {
            const isSelected = mat.code === selectedMaterialCode;
            return (
              <button
                key={mat.code}
                type="button"
                onClick={() => {
                  setUserSelectedManually(true);
                  setSelectedMaterialCode(mat.code);
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-2.5 whitespace-nowrap cursor-pointer shadow-2xs ${
                  isSelected
                    ? 'bg-cyan-700 text-white shadow-md shadow-cyan-700/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Droplet className={`h-3.5 w-3.5 ${isSelected ? 'text-cyan-200' : 'text-slate-500'}`} />
                <span>{isAr ? mat.nameAr : (mat.nameEn || mat.nameAr)}</span>
                
                {/* Visual M & F Usage Flags Badges */}
                <div className="flex items-center gap-0.5 text-[9px] font-black font-mono">
                  <span className={`px-1 py-0.2 rounded ${isSelected ? 'bg-cyan-800 text-cyan-200' : 'bg-blue-100 text-blue-800'}`}>M</span>
                  <span className={`px-1 py-0.2 rounded ${isSelected ? 'bg-cyan-900 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>F</span>
                </div>

                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-cyan-900/60 text-cyan-100' : 'bg-slate-200 text-slate-600'}`}>
                  {mat.code}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LIVE METRICS CARDS & ALERTS                                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Total Volume in Vessel */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>{isAr ? 'الرصيد المتاح بالخزان' : 'Current Vessel Volume'}</span>
            <Droplet className="h-4 w-4 text-cyan-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-cyan-900">
            {totalActiveVolume.toLocaleString()} <span className="text-xs font-bold text-slate-500">{isAr ? 'لتر' : 'L'}</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {isAr ? `من إجمالي سعة ${maxCapacity.toLocaleString()} لتر` : `of ${maxCapacity.toLocaleString()} L capacity`} ({fillPercentage}%)
          </div>
        </div>

        {/* Metric 2: Active Blended Tanks Count (Dynamic max determined by capacity / single batch volume from intermediate_bom) */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>{isAr ? 'التانكات النشطة بالخليط' : 'Active Blended Tanks'}</span>
            <Layers className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-indigo-900">
            {activeTanksList.length} <span className="text-xs font-bold text-slate-500">{isAr ? `/ ${calculatedMaxTanks} كحد أقصى` : `/ max ${calculatedMaxTanks} tanks`}</span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium space-y-0.5">
            <div>
              {isAr 
                ? `سعة ${maxCapacity.toLocaleString()}L ÷ تشغيلة ${singleBatchVolume.toLocaleString()}L`
                : `Cap ${maxCapacity.toLocaleString()}L ÷ Batch ${singleBatchVolume.toLocaleString()}L`}
            </div>
            {activeRecipe && (
              <div className="text-[10px] text-indigo-700 font-mono font-bold flex items-center gap-1 truncate" title={activeRecipe.recipeName || activeRecipe.nameAr}>
                <FlaskConical className="h-3 w-3 text-indigo-500 shrink-0" />
                <span className="truncate">BOM: {activeRecipe.prepCode ? `[${activeRecipe.prepCode}] ` : ''}{activeRecipe.code}</span>
              </div>
            )}
          </div>
        </div>

        {/* Metric 3: Blended Concentration / Acidity */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>{isAr ? 'متوسط نسبة التركيز (الخل)' : 'Blended Acidity %'}</span>
            <FlaskConical className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-900">
            {blendedAcidity > 0 ? `${blendedAcidity}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {isAr ? 'متوسط مرجح بحجم التانكات المكونة' : 'Volume-weighted average'}
          </div>
        </div>

        {/* Metric 4: Vessel Architecture Topology */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>{isAr ? 'طوبولوجيا وتكوين الخزانات' : 'Vessel Configuration'}</span>
            <Factory className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-base sm:text-lg font-bold text-slate-800 truncate">
            {currentVessel?.vesselType === 'interconnected'
              ? (isAr ? `خزانان متصلان (${currentVessel.capacityPerVessel}L × 2)` : `2 Interconnected (${currentVessel.capacityPerVessel}L ea)`)
              : (isAr ? `خزان فردي (${maxCapacity} لتر)` : `Single Tank (${maxCapacity}L)`)}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {isAr ? `الحد الأدنى للإنذار: ${currentVessel?.lowLevelThreshold || 500} لتر` : `Safety buffer: ${currentVessel?.lowLevelThreshold || 500}L`}
          </div>
        </div>
      </div>

      {/* Live Pumping Banner (When a tank is actively being pumped into storage from #liquid_tanks) */}
      {activePumpingTank && (
        <div className={`p-4 rounded-3xl border text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in ${
          isPumpingActive
            ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-200 shadow-lg shadow-emerald-950/50'
            : 'bg-amber-950/80 border-amber-500/80 text-amber-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl shrink-0 ${isPumpingActive ? 'bg-emerald-500 text-white animate-pulse' : 'bg-amber-500 text-white'}`}>
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-black flex items-center gap-2">
                <span>
                  {isPumpingActive
                    ? (isAr ? `جاري ضخ تانك #${activePumpingTank.tankNumber} إلى خزانات الصالة الآن` : `LIVE PUMPING: Tank #${activePumpingTank.tankNumber} entering floor vessel`)
                    : (isAr ? `طلمبة الرفع متوقفة مؤقتاً لتانك #${activePumpingTank.tankNumber}` : `PUMP PAUSED: Tank #${activePumpingTank.tankNumber}`)}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-800 text-emerald-100">
                  {activePumpingTank.transferQuantity || activePumpingTank.batchYieldQty || 1000} L
                </span>
              </div>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isAr
                  ? 'التدفق المباشر نشط عبر خط الأنابيب العلوي. فور اكتمال الضخ في تبويب #liquid_tanks سينضم التانك تلقائياً لطبقات الخليط النشط.'
                  : 'Active fluid cascade flowing via overhead pipe. Once completed in #liquid_tanks, this tank will automatically enter the floor blend.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
              {isAr ? 'الحالة بقسم التحضير:' : 'Prep Floor Status:'}{' '}
              <strong className="text-white uppercase">{activePumpingTank.pumpStatus}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Low-Level Alert Banner */}
      {totalActiveVolume > 0 && totalActiveVolume <= (Number(currentVessel?.lowLevelThreshold) || 500) && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <span>
              {isAr
                ? `تحذير منسوب منخفض: الرصيد المتبقي بالخزان (${totalActiveVolume} لتر) يقترب من حد الأمان (${currentVessel?.lowLevelThreshold} لتر). يرجى ضخ تانك جديد من قسم التحضير.`
                : `Low Vessel Level Warning: Volume (${totalActiveVolume}L) is near safety threshold. Prepare and pump fresh tanks.`}
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. REAL-LIFE VERTICAL CYLINDER SCHEMATIC & FLUID FLOW ANIMATIONS          */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-xl space-y-6 overflow-hidden relative">
        {/* Scoped CSS Keyframes for High-Fidelity Industrial Fluid Dynamics */}
        <style>{`
          @keyframes pipePulseInflow {
            0% { background-position: 0 0; }
            100% { background-position: 40px 0; }
          }
          @keyframes pipePulseOutflow {
            0% { background-position: 0 0; }
            100% { background-position: -40px 0; }
          }
          @keyframes liquidSurfaceSine {
            0% { transform: translateX(0); }
            50% { transform: translateX(-25%); }
            100% { transform: translateX(0); }
          }
          @keyframes microBubbleRise {
            0% { transform: translateY(0) scale(0.6); opacity: 0; }
            30% { opacity: 0.8; }
            80% { opacity: 0.6; }
            100% { transform: translateY(-70px) scale(1.1); opacity: 0; }
          }
          @keyframes sprayCascadeDown {
            0% { transform: scaleY(0.92); opacity: 0.7; }
            50% { transform: scaleY(1.05); opacity: 1; }
            100% { transform: scaleY(0.92); opacity: 0.7; }
          }
          @keyframes rippleExpandOut {
            0% { transform: scale(0.2); opacity: 0.9; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          @keyframes pumpImpellerSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes equalizeBreathingPulse {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
          }
        `}</style>

        {/* Schematic Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-500/30">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                <span>{isAr ? `المخطط الهيدروليكي للخزانات الرأسية: ${currentMaterial?.nameAr}` : `Industrial Vertical Cylinder Schematic: ${currentMaterial?.nameEn || currentMaterial?.nameAr}`}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-900 text-cyan-200">
                  {fillPercentage}% {isAr ? 'ممتلئ' : 'Full'}
                </span>
                {isPumpingActive && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-200 animate-pulse flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {isAr ? 'تدفق وارد نشط' : 'Active Inflow Stream'}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isAr
                  ? `محاكاة واقعية للخزانات الأسطوانية الرأسية ذات القبة العلوية، مع تدفق السائل الوارد من قسم التحضير والمنصرف لخطوط التعبئة (حتى ${calculatedMaxTanks} تانكات).`
                  : `Real-life physical vertical cylinder vessels with dished heads, sight gauges, and live fluid inflow/outflow animations (up to ${calculatedMaxTanks} tanks).`}
              </p>
            </div>
          </div>
        </div>

        {/* Industrial P&ID 3-Column Layout: Inflow Pipeline | Vertical Cylinders | Outflow Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* ========================================================================= */}
          {/* COLUMN 1: INFLOW FEED STATION & OVERHEAD PIPELINE                         */}
          {/* ========================================================================= */}
          <div className="lg:col-span-3 space-y-3 p-4 bg-slate-800/70 rounded-2xl border border-slate-700 text-xs">
            <div className="font-bold text-slate-300 flex items-center justify-between border-b border-slate-700 pb-2">
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-emerald-400" />
                <span>{isAr ? 'خط الضخ والرفع (Inflow)' : 'Inflow Station'}</span>
              </div>
              {/* Pump Turbine Visual */}
              <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                <RotateCcw
                  className={`h-3.5 w-3.5 text-emerald-400 ${isPumpingActive ? 'animate-spin' : ''}`}
                  style={isPumpingActive ? { animation: 'pumpImpellerSpin 1s linear infinite' } : {}}
                />
                <span>P-101</span>
              </div>
            </div>

            {/* Inflow Pipe Graphic with Marching Fluid Stream */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>{isAr ? 'أنبوب السحب العلوي (Header Pipe)' : 'Overhead Transfer Header'}</span>
                <span>{isPumpingActive ? '~150 L/min' : '0 L/min'}</span>
              </div>
              <div className="h-4 w-full bg-slate-950 rounded-full border border-slate-700 overflow-hidden relative shadow-inner p-0.5">
                <div
                  className={`h-full w-full rounded-full transition-all duration-300 ${
                    isPumpingActive
                      ? 'bg-emerald-500'
                      : isPumpingPaused
                        ? 'bg-amber-600/50'
                        : 'bg-slate-700/40'
                  }`}
                  style={
                    isPumpingActive
                      ? {
                          backgroundImage: 'repeating-linear-gradient(90deg, #10b981 0px, #10b981 12px, #059669 12px, #059669 24px)',
                          animation: 'pipePulseInflow 1s linear infinite',
                        }
                      : {}
                  }
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              {isAr ? 'يتم ضخ التانكات المحضرة (~1000L) عبر خط الأنابيب فور اعتماد الجودة:' : 'Formulated tanks (~1000L) are pumped via pipeline after QA clearance:'}
            </p>

            {/* Active or Latest Pumped Tank Card */}
            {activePumpingTank ? (
              <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-500/60 text-emerald-300 font-bold space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>{isAr ? 'جاري ضخ تانك:' : 'Currently Pumping:'} #{activePumpingTank.tankNumber}</span>
                  </span>
                  <span className="font-mono text-emerald-200">{activePumpingTank.transferQuantity || activePumpingTank.batchYieldQty || 1000} L</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {isAr ? 'تركيز الحموضة:' : 'Concentration:'} {activePumpingTank.qaData?.acidity || 5.0}%
                </div>
              </div>
            ) : activeTanksList.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-400 font-bold">{isAr ? 'آخر تانك تم ضخه بالخزان:' : 'Latest Pumped Tank:'}</div>
                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-emerald-500/40 text-emerald-300 font-bold flex items-center justify-between">
                  <span>#{activeTanksList[activeTanksList.length - 1].tankNumber}</span>
                  <span className="font-mono text-[10px]">{activeTanksList[activeTanksList.length - 1].initialVolume || 1000} L</span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic py-2">
                {isAr ? 'لا توجد تانكات مضخوخة حالياً' : 'No tanks pumped'}
              </div>
            )}

            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>{isAr ? 'حالة الطلمبة:' : 'Pump Status:'}</span>
              <span className={`font-bold flex items-center gap-1.5 ${isPumpingActive ? 'text-emerald-400' : isPumpingPaused ? 'text-amber-400' : 'text-slate-400'}`}>
                <span className={`h-2 w-2 rounded-full ${isPumpingActive ? 'bg-emerald-400 animate-pulse' : isPumpingPaused ? 'bg-amber-400' : 'bg-slate-500'}`} />
                {isPumpingActive 
                  ? (isAr ? 'ضخ نشط بالصالة' : 'Active Inflow')
                  : isPumpingPaused 
                    ? (isAr ? 'متوقف مؤقتاً' : 'Pump Paused')
                    : (isAr ? 'جاهزة للاستقبال' : 'Ready for Inflow')}
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* COLUMN 2: VERTICAL CYLINDRICAL TANKS SCHEMATIC (DUAL OR SINGLE)           */}
          {/* ========================================================================= */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center p-2 sm:p-4">
            {currentVessel?.vesselType === 'interconnected' ? (
              /* DUAL INTERCONNECTED VERTICAL CYLINDER VESSELS (e.g. White Vinegar: 3000L + 3000L = 6000L) */
              <div className="w-full max-w-lg flex flex-col items-center">
                
                {/* Top Overhead Inflow Pipe Manifold splitting to Vessel A and Vessel B */}
                <div className="w-full flex items-center justify-between px-8 mb-1 relative">
                  {/* Left Feed Branch */}
                  <div className="w-1/2 flex flex-col items-center relative">
                    <div className={`h-4 w-2 border-r-2 ${isPumpingActive ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-700 border-slate-600'}`} />
                    <ArrowDown className={`h-3 w-3 ${isPumpingActive ? 'text-emerald-400 animate-bounce' : 'text-slate-500'}`} />
                  </div>
                  {/* Horizontal Header Connection */}
                  <div className={`absolute top-0 left-12 right-12 h-2 rounded-full border ${isPumpingActive ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-700 border-slate-600'}`} />
                  {/* Right Feed Branch */}
                  <div className="w-1/2 flex flex-col items-center relative">
                    <div className={`h-4 w-2 border-r-2 ${isPumpingActive ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-700 border-slate-600'}`} />
                    <ArrowDown className={`h-3 w-3 ${isPumpingActive ? 'text-emerald-400 animate-bounce' : 'text-slate-500'}`} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:gap-6 w-full relative">
                  
                  {/* ========================================== */}
                  {/* VESSEL A (Left Vertical Cylinder)          */}
                  {/* ========================================== */}
                  <div className="flex flex-col items-center">
                    <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mb-1">
                      <span>{isAr ? 'خزان الصالة (A)' : 'Floor Vessel A'}</span>
                      <span className="text-[10px] text-cyan-400 font-mono">({currentVessel.capacityPerVessel || 3000}L)</span>
                    </div>

                    {/* 1. Curved Torispherical Top Dome Head */}
                    <div
                      className="w-full h-11 rounded-t-[45px] sm:rounded-t-[55px] border-t-2 border-x-2 border-slate-500 relative flex flex-col items-center justify-start overflow-hidden shadow-md"
                      style={{
                        background: 'radial-gradient(ellipse at 50% 25%, #64748b 0%, #334155 45%, #1e293b 80%, #0f172a 100%)',
                      }}
                    >
                      {/* Top Inlet Nozzle Flange */}
                      <div className="w-8 h-3 bg-slate-400 border border-slate-600 rounded-t-sm shadow-xs z-20" />
                      {/* Breather / Vent Valve on Shoulder */}
                      <div className="absolute top-1.5 right-3 w-3 h-3.5 bg-slate-500 rounded-t-full border border-slate-600 z-10" title="Breather Vent Valve" />

                      {/* Cascading Inflow Liquid Stream (when pumping is active) */}
                      {isPumpingActive && (
                        <div
                          className="w-2.5 h-12 bg-gradient-to-b from-emerald-300 via-cyan-300 to-transparent rounded-full shadow-lg shadow-emerald-400/50 z-10"
                          style={{ animation: 'sprayCascadeDown 0.8s ease-in-out infinite' }}
                        />
                      )}
                    </div>

                    {/* 2. Vertical Cylindrical Body with Sight Glass & Stratified Liquid Stack */}
                    <div className="w-full h-72 border-x-2 border-slate-600 bg-slate-950 relative flex flex-col justify-end overflow-hidden shadow-2xl">
                      
                      {/* Cylindrical 3D Specular Highlight Overlay */}
                      <div
                        className="absolute inset-0 pointer-events-none z-20"
                        style={{
                          background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 22%, transparent 60%, rgba(0,0,0,0.5) 100%)',
                        }}
                      />

                      {/* Borosilicate Vertical Sight Glass Column with Physical Graduation Ticks */}
                      <div className="absolute top-0 bottom-0 start-1.5 w-3 z-30 pointer-events-none flex flex-col justify-between py-2 text-[8px] font-mono text-slate-400 select-none">
                        <div className="flex items-center gap-0.5"><span className="w-1.5 h-px bg-slate-400" /><span>3k</span></div>
                        <div className="flex items-center gap-0.5"><span className="w-1.5 h-px bg-slate-500" /><span>2k</span></div>
                        <div className="flex items-center gap-0.5"><span className="w-1.5 h-px bg-slate-500" /><span>1k</span></div>
                        <div className="flex items-center gap-0.5"><span className="w-1.5 h-px bg-slate-400" /><span>0</span></div>
                      </div>

                      {/* Fluid Height Column Container */}
                      <div
                        style={{ height: `${fillPercentage}%` }}
                        className="w-full transition-all duration-700 relative flex flex-col justify-end"
                      >
                        {/* Realistic Fluid Surface Undulating Sine-Wave & Spray Ripples */}
                        {fillPercentage > 0 && (
                          <div className="absolute -top-2 left-0 right-0 h-4 overflow-hidden pointer-events-none z-10">
                            <div
                              className="w-[200%] h-full flex opacity-80"
                              style={{ animation: 'liquidSurfaceSine 3s ease-in-out infinite' }}
                            >
                              <svg className="w-full h-full text-cyan-300 fill-current" viewBox="0 0 1200 120" preserveAspectRatio="none">
                                <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,40 L1200,120 L0,120 Z"></path>
                              </svg>
                            </div>
                            {/* Spray Impact Ripple Ring */}
                            {isPumpingActive && (
                              <div
                                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-2 rounded-full border-2 border-emerald-300 pointer-events-none"
                                style={{ animation: 'rippleExpandOut 1.2s ease-out infinite' }}
                              />
                            )}
                          </div>
                        )}

                        {/* Stacked Fluid Slices: Newest on top, Oldest on bottom */}
                        {[...activeTanksList].reverse().map((t) => {
                          const origIdx = activeTanksList.findIndex((x) => (x.tankId || x.tankNumber) === (t.tankId || t.tankNumber));
                          const tankVol = Number(t.remainingVolume) || 0;
                          const sliceHeightPct = totalActiveVolume > 0 ? (tankVol / totalActiveVolume) * 100 : 0;
                          const color = TANK_COLORS[origIdx >= 0 ? origIdx % TANK_COLORS.length : 0];
                          const isOldest = origIdx === 0;
                          const isNewest = origIdx === activeTanksList.length - 1;
                          return (
                            <div
                              key={`v1-${t.tankId || t.tankNumber || origIdx}`}
                              style={{ height: `${sliceHeightPct}%` }}
                              title={`Tank #${t.tankNumber}: ${tankVol}L (${sliceHeightPct.toFixed(1)}%) - ${isOldest ? (isAr ? 'الأقدم (قاع الخزان - تغذية الصرف)' : 'Oldest (Bottom Sump - Feeding)') : (isNewest ? (isAr ? 'الأحدث (أعلى الخزان)' : 'Newest (Top Layer)') : '')}`}
                              className={`w-full ${color.bg} opacity-90 border-t border-white/20 transition-all relative flex items-center justify-center overflow-hidden`}
                            >
                              {/* Rising Micro-Bubbles inside liquid */}
                              <span
                                className="absolute bottom-1 left-1/4 h-1 w-1 rounded-full bg-white/40 pointer-events-none"
                                style={{ animation: 'microBubbleRise 2.5s ease-in infinite' }}
                              />
                              <span
                                className="absolute bottom-2 right-1/4 h-1 w-1 rounded-full bg-white/30 pointer-events-none"
                                style={{ animation: 'microBubbleRise 3s ease-in infinite 0.7s' }}
                              />

                              {sliceHeightPct >= 8 && (
                                <span className="font-mono text-[9px] font-black text-white drop-shadow z-10 flex items-center gap-1">
                                  <span>#{t.tankNumber}</span>
                                  {isOldest && (
                                    <span className="text-[7px] text-amber-200 bg-amber-950/70 border border-amber-400/40 px-1 py-0.2 rounded font-sans">
                                      ↓ {isAr ? 'صرف' : 'Feed'}
                                    </span>
                                  )}
                                  {isNewest && activeTanksList.length > 1 && (
                                    <span className="text-[7px] text-emerald-200 bg-emerald-950/70 border border-emerald-400/40 px-1 py-0.2 rounded font-sans">
                                      ↑ {isAr ? 'جديد' : 'New'}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3. Curved Dished Conical Sump Head & Base Legs */}
                    <div
                      className="w-full h-10 rounded-b-[45px] sm:rounded-b-[55px] border-b-2 border-x-2 border-slate-600 relative flex flex-col items-center justify-end overflow-visible shadow-lg"
                      style={{
                        background: 'radial-gradient(ellipse at 50% 80%, #0f172a 0%, #1e293b 50%, #334155 85%, #475569 100%)',
                      }}
                    >
                      {/* Center Drainage Valve Nozzle */}
                      <div className="w-6 h-2.5 bg-slate-400 border border-slate-600 rounded-b-xs shadow-xs z-10" />

                      {/* Heavy-Duty Structural Support Legs */}
                      <div className="absolute -bottom-5 left-4 w-3 h-6 bg-gradient-to-b from-slate-500 to-slate-800 border-x border-slate-600 rounded-b-xs shadow-md" />
                      <div className="absolute -bottom-5 right-4 w-3 h-6 bg-gradient-to-b from-slate-500 to-slate-800 border-x border-slate-600 rounded-b-xs shadow-md" />
                    </div>
                  </div>

                  {/* ========================================== */}
                  {/* VESSEL B (Right Vertical Cylinder)         */}
                  {/* ========================================== */}
                  <div className="flex flex-col items-center">
                    <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mb-1">
                      <span>{isAr ? 'خزان الصالة (B)' : 'Floor Vessel B'}</span>
                      <span className="text-[10px] text-cyan-400 font-mono">({currentVessel.capacityPerVessel || 3000}L)</span>
                    </div>

                    {/* 1. Curved Torispherical Top Dome Head */}
                    <div
                      className="w-full h-11 rounded-t-[45px] sm:rounded-t-[55px] border-t-2 border-x-2 border-slate-500 relative flex flex-col items-center justify-start overflow-hidden shadow-md"
                      style={{
                        background: 'radial-gradient(ellipse at 50% 25%, #64748b 0%, #334155 45%, #1e293b 80%, #0f172a 100%)',
                      }}
                    >
                      {/* Top Inlet Nozzle Flange */}
                      <div className="w-8 h-3 bg-slate-400 border border-slate-600 rounded-t-sm shadow-xs z-20" />
                      {/* Breather / Vent Valve on Shoulder */}
                      <div className="absolute top-1.5 left-3 w-3 h-3.5 bg-slate-500 rounded-t-full border border-slate-600 z-10" title="Breather Vent Valve" />

                      {/* Cascading Inflow Liquid Stream (when pumping is active) */}
                      {isPumpingActive && (
                        <div
                          className="w-2.5 h-12 bg-gradient-to-b from-emerald-300 via-cyan-300 to-transparent rounded-full shadow-lg shadow-emerald-400/50 z-10"
                          style={{ animation: 'sprayCascadeDown 0.8s ease-in-out infinite' }}
                        />
                      )}
                    </div>

                    {/* 2. Vertical Cylindrical Body with Sight Glass & Stratified Liquid Stack */}
                    <div className="w-full h-72 border-x-2 border-slate-600 bg-slate-950 relative flex flex-col justify-end overflow-hidden shadow-2xl">
                      
                      {/* Cylindrical 3D Specular Highlight Overlay */}
                      <div
                        className="absolute inset-0 pointer-events-none z-20"
                        style={{
                          background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 22%, transparent 60%, rgba(0,0,0,0.5) 100%)',
                        }}
                      />

                      {/* Borosilicate Vertical Sight Glass Column with Physical Graduation Ticks */}
                      <div className="absolute top-0 bottom-0 end-1.5 w-3 z-30 pointer-events-none flex flex-col justify-between py-2 text-[8px] font-mono text-slate-400 select-none text-end">
                        <div className="flex items-center justify-end gap-0.5"><span>3k</span><span className="w-1.5 h-px bg-slate-400" /></div>
                        <div className="flex items-center justify-end gap-0.5"><span>2k</span><span className="w-1.5 h-px bg-slate-500" /></div>
                        <div className="flex items-center justify-end gap-0.5"><span>1k</span><span className="w-1.5 h-px bg-slate-500" /></div>
                        <div className="flex items-center justify-end gap-0.5"><span>0</span><span className="w-1.5 h-px bg-slate-400" /></div>
                      </div>

                      {/* Fluid Height Column Container */}
                      <div
                        style={{ height: `${fillPercentage}%` }}
                        className="w-full transition-all duration-700 relative flex flex-col justify-end"
                      >
                        {/* Realistic Fluid Surface Undulating Sine-Wave & Spray Ripples */}
                        {fillPercentage > 0 && (
                          <div className="absolute -top-2 left-0 right-0 h-4 overflow-hidden pointer-events-none z-10">
                            <div
                              className="w-[200%] h-full flex opacity-80"
                              style={{ animation: 'liquidSurfaceSine 3s ease-in-out infinite' }}
                            >
                              <svg className="w-full h-full text-cyan-300 fill-current" viewBox="0 0 1200 120" preserveAspectRatio="none">
                                <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,40 L1200,120 L0,120 Z"></path>
                              </svg>
                            </div>
                            {/* Spray Impact Ripple Ring */}
                            {isPumpingActive && (
                              <div
                                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-2 rounded-full border-2 border-emerald-300 pointer-events-none"
                                style={{ animation: 'rippleExpandOut 1.2s ease-out infinite' }}
                              />
                            )}
                          </div>
                        )}

                        {/* Stacked Fluid Slices mirrored: Newest on top, Oldest on bottom */}
                        {[...activeTanksList].reverse().map((t) => {
                          const origIdx = activeTanksList.findIndex((x) => (x.tankId || x.tankNumber) === (t.tankId || t.tankNumber));
                          const tankVol = Number(t.remainingVolume) || 0;
                          const sliceHeightPct = totalActiveVolume > 0 ? (tankVol / totalActiveVolume) * 100 : 0;
                          const color = TANK_COLORS[origIdx >= 0 ? origIdx % TANK_COLORS.length : 0];
                          const isOldest = origIdx === 0;
                          const isNewest = origIdx === activeTanksList.length - 1;
                          return (
                            <div
                              key={`v2-${t.tankId || t.tankNumber || origIdx}`}
                              style={{ height: `${sliceHeightPct}%` }}
                              title={`Tank #${t.tankNumber}: ${tankVol}L (${sliceHeightPct.toFixed(1)}%) - ${isOldest ? (isAr ? 'الأقدم (قاع الخزان - تغذية الصرف)' : 'Oldest (Bottom Sump - Feeding)') : (isNewest ? (isAr ? 'الأحدث (أعلى الخزان)' : 'Newest (Top Layer)') : '')}`}
                              className={`w-full ${color.bg} opacity-90 border-t border-white/20 transition-all relative flex items-center justify-center overflow-hidden`}
                            >
                              {/* Rising Micro-Bubbles inside liquid */}
                              <span
                                className="absolute bottom-1 left-1/4 h-1 w-1 rounded-full bg-white/40 pointer-events-none"
                                style={{ animation: 'microBubbleRise 2.5s ease-in infinite 0.5s' }}
                              />
                              <span
                                className="absolute bottom-2 right-1/4 h-1 w-1 rounded-full bg-white/30 pointer-events-none"
                                style={{ animation: 'microBubbleRise 3s ease-in infinite 1.2s' }}
                              />

                              {sliceHeightPct >= 8 && (
                                <span className="font-mono text-[9px] font-black text-white drop-shadow z-10 flex items-center gap-1">
                                  <span>#{t.tankNumber}</span>
                                  {isOldest && (
                                    <span className="text-[7px] text-amber-200 bg-amber-950/70 border border-amber-400/40 px-1 py-0.2 rounded font-sans">
                                      ↓ {isAr ? 'صرف' : 'Feed'}
                                    </span>
                                  )}
                                  {isNewest && activeTanksList.length > 1 && (
                                    <span className="text-[7px] text-emerald-200 bg-emerald-950/70 border border-emerald-400/40 px-1 py-0.2 rounded font-sans">
                                      ↑ {isAr ? 'جديد' : 'New'}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3. Curved Dished Conical Sump Head & Base Legs */}
                    <div
                      className="w-full h-10 rounded-b-[45px] sm:rounded-b-[55px] border-b-2 border-x-2 border-slate-600 relative flex flex-col items-center justify-end overflow-visible shadow-lg"
                      style={{
                        background: 'radial-gradient(ellipse at 50% 80%, #0f172a 0%, #1e293b 50%, #334155 85%, #475569 100%)',
                      }}
                    >
                      {/* Center Drainage Valve Nozzle */}
                      <div className="w-6 h-2.5 bg-slate-400 border border-slate-600 rounded-b-xs shadow-xs z-10" />

                      {/* Heavy-Duty Structural Support Legs */}
                      <div className="absolute -bottom-5 left-4 w-3 h-6 bg-gradient-to-b from-slate-500 to-slate-800 border-x border-slate-600 rounded-b-xs shadow-md" />
                      <div className="absolute -bottom-5 right-4 w-3 h-6 bg-gradient-to-b from-slate-500 to-slate-800 border-x border-slate-600 rounded-b-xs shadow-md" />
                    </div>
                  </div>

                  {/* BOTTOM HYDROSTATIC EQUALIZATION PIPE MANIFOLD CONNECTING SUMPS */}
                  <div
                    className="absolute bottom-3 left-1/4 right-1/4 h-3.5 bg-gradient-to-r from-cyan-600 via-cyan-500 to-cyan-600 border border-cyan-400 rounded-full z-20 flex items-center justify-between px-2 shadow-lg"
                    style={{ animation: 'equalizeBreathingPulse 2.5s ease-in-out infinite' }}
                    title={isAr ? 'خط اتزان هيدروليكي بين قاع الخزانين' : 'Bottom Hydrostatic Equalization Manifold'}
                  >
                    <ArrowLeft className="h-2 w-2 text-white" />
                    <span className="text-[7px] font-black text-white uppercase tracking-wider font-mono">
                      {isAr ? 'خط اتزان' : 'Equalizer'}
                    </span>
                    <ArrowRight className="h-2 w-2 text-white" />
                  </div>
                </div>

                {/* Overall Vessel Bottom System Metrics */}
                <div className="mt-8 text-center bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700">
                  <div className="text-xs font-bold text-cyan-300">
                    {isAr ? 'نظام خزانين رأسيين متصلين هيدروليكياً (٦٠٠٠ لتر)' : 'Dual Interconnected Vertical Cylinder System (6,000L)'}
                  </div>
                  <div className="font-mono text-sm font-black text-white mt-0.5">
                    {totalActiveVolume.toLocaleString()} / {maxCapacity.toLocaleString()} L
                  </div>
                </div>
              </div>
            ) : (
              /* SINGLE VERTICAL CYLINDRICAL VESSEL (e.g. Apple Vinegar) */
              <div className="w-full max-w-xs flex flex-col items-center">
                <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mb-1">
                  <span>{isAr ? 'خزان الصالة الموحد' : 'Unified Vertical Floor Vessel'}</span>
                  <span className="text-[10px] text-cyan-400 font-mono">({maxCapacity}L)</span>
                </div>

                {/* 1. Curved Torispherical Top Dome Head */}
                <div
                  className="w-full h-12 rounded-t-[55px] border-t-2 border-x-2 border-slate-500 relative flex flex-col items-center justify-start overflow-hidden shadow-md"
                  style={{
                    background: 'radial-gradient(ellipse at 50% 25%, #64748b 0%, #334155 45%, #1e293b 80%, #0f172a 100%)',
                  }}
                >
                  {/* Top Inlet Nozzle Flange */}
                  <div className="w-9 h-3.5 bg-slate-400 border border-slate-600 rounded-t-sm shadow-xs z-20" />
                  {/* Breather / Vent Valve */}
                  <div className="absolute top-2 right-4 w-3.5 h-4 bg-slate-500 rounded-t-full border border-slate-600 z-10" />

                  {/* Cascading Inflow Liquid Stream */}
                  {isPumpingActive && (
                    <div
                      className="w-2.5 h-14 bg-gradient-to-b from-emerald-300 via-cyan-300 to-transparent rounded-full shadow-lg shadow-emerald-400/50 z-10"
                      style={{ animation: 'sprayCascadeDown 0.8s ease-in-out infinite' }}
                    />
                  )}
                </div>

                {/* 2. Vertical Cylindrical Body */}
                <div className="w-full h-72 border-x-2 border-slate-600 bg-slate-950 relative flex flex-col justify-end overflow-hidden shadow-2xl">
                  {/* 3D Highlight */}
                  <div
                    className="absolute inset-0 pointer-events-none z-20"
                    style={{
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 22%, transparent 60%, rgba(0,0,0,0.5) 100%)',
                    }}
                  />

                  {/* Sight Glass */}
                  <div className="absolute top-0 bottom-0 start-2 w-3 z-30 pointer-events-none flex flex-col justify-between py-2 text-[8px] font-mono text-slate-400 select-none">
                    <div className="flex items-center gap-0.5"><span className="w-2 h-px bg-slate-400" /><span>{maxCapacity}L</span></div>
                    <div className="flex items-center gap-0.5"><span className="w-2 h-px bg-slate-500" /><span>{Math.round(maxCapacity * 0.66)}L</span></div>
                    <div className="flex items-center gap-0.5"><span className="w-2 h-px bg-slate-500" /><span>{Math.round(maxCapacity * 0.33)}L</span></div>
                    <div className="flex items-center gap-0.5"><span className="w-2 h-px bg-slate-400" /><span>0</span></div>
                  </div>

                  {/* Fluid Stack Container */}
                  <div
                    style={{ height: `${fillPercentage}%` }}
                    className="w-full transition-all duration-700 relative flex flex-col justify-end"
                  >
                    {fillPercentage > 0 && (
                      <div className="absolute -top-2 left-0 right-0 h-4 overflow-hidden pointer-events-none z-10">
                        <div
                          className="w-[200%] h-full flex opacity-80"
                          style={{ animation: 'liquidSurfaceSine 3s ease-in-out infinite' }}
                        >
                          <svg className="w-full h-full text-cyan-300 fill-current" viewBox="0 0 1200 120" preserveAspectRatio="none">
                            <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,40 L1200,120 L0,120 Z"></path>
                          </svg>
                        </div>
                        {isPumpingActive && (
                          <div
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-2 rounded-full border-2 border-emerald-300 pointer-events-none"
                            style={{ animation: 'rippleExpandOut 1.2s ease-out infinite' }}
                          />
                        )}
                      </div>
                    )}

                    {/* Stacked Fluid Slices: Newest on top, Oldest on bottom */}
                    {[...activeTanksList].reverse().map((t) => {
                      const origIdx = activeTanksList.findIndex((x) => (x.tankId || x.tankNumber) === (t.tankId || t.tankNumber));
                      const tankVol = Number(t.remainingVolume) || 0;
                      const sliceHeightPct = totalActiveVolume > 0 ? (tankVol / totalActiveVolume) * 100 : 0;
                      const color = TANK_COLORS[origIdx >= 0 ? origIdx % TANK_COLORS.length : 0];
                      const isOldest = origIdx === 0;
                      const isNewest = origIdx === activeTanksList.length - 1;
                      return (
                        <div
                          key={`single-${t.tankId || t.tankNumber || origIdx}`}
                          style={{ height: `${sliceHeightPct}%` }}
                          title={`Tank #${t.tankNumber}: ${tankVol}L (${sliceHeightPct.toFixed(1)}%) - ${isOldest ? (isAr ? 'الأقدم (قاع الخزان - تغذية الصرف)' : 'Oldest (Bottom Sump - Feeding)') : (isNewest ? (isAr ? 'الأحدث (أعلى الخزان)' : 'Newest (Top Layer)') : '')}`}
                          className={`w-full ${color.bg} opacity-90 border-t border-white/20 transition-all relative flex items-center justify-center overflow-hidden`}
                        >
                          <span
                            className="absolute bottom-1 left-1/4 h-1 w-1 rounded-full bg-white/40 pointer-events-none"
                            style={{ animation: 'microBubbleRise 2.5s ease-in infinite' }}
                          />
                          {sliceHeightPct >= 8 && (
                            <span className="font-mono text-[10px] font-black text-white drop-shadow z-10 flex items-center gap-1">
                              <span>#{t.tankNumber} ({tankVol}L)</span>
                              {isOldest && (
                                <span className="text-[7px] text-amber-200 bg-amber-950/70 border border-amber-400/40 px-1 py-0.2 rounded font-sans">
                                  ↓ {isAr ? 'صرف' : 'Feed'}
                                </span>
                              )}
                              {isNewest && activeTanksList.length > 1 && (
                                <span className="text-[7px] text-emerald-200 bg-emerald-950/70 border border-emerald-400/40 px-1 py-0.2 rounded font-sans">
                                  ↑ {isAr ? 'جديد' : 'New'}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Curved Dished Conical Sump Head & Base Legs */}
                <div
                  className="w-full h-11 rounded-b-[55px] border-b-2 border-x-2 border-slate-600 relative flex flex-col items-center justify-end overflow-visible shadow-lg"
                  style={{
                    background: 'radial-gradient(ellipse at 50% 80%, #0f172a 0%, #1e293b 50%, #334155 85%, #475569 100%)',
                  }}
                >
                  <div className="w-7 h-3 bg-slate-400 border border-slate-600 rounded-b-xs shadow-xs z-10" />
                  <div className="absolute -bottom-5 left-5 w-3.5 h-6 bg-gradient-to-b from-slate-500 to-slate-800 border-x border-slate-600 rounded-b-xs shadow-md" />
                  <div className="absolute -bottom-5 right-5 w-3.5 h-6 bg-gradient-to-b from-slate-500 to-slate-800 border-x border-slate-600 rounded-b-xs shadow-md" />
                </div>

                <div className="mt-8 text-center bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700">
                  <div className="font-mono text-sm font-black text-white">
                    {totalActiveVolume.toLocaleString()} / {maxCapacity.toLocaleString()} L
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* COLUMN 3: OUTFLOW PACKAGING FEED STATION & PIPELINE                       */}
          {/* ========================================================================= */}
          <div className="lg:col-span-3 space-y-3 p-4 bg-slate-800/70 rounded-2xl border border-slate-700 text-xs">
            <div className="font-bold text-slate-300 flex items-center justify-between border-b border-slate-700 pb-2">
              <div className="flex items-center gap-1.5">
                <Package className="h-4 w-4 text-cyan-400" />
                <span>{isAr ? 'خط السحب والتعبئة (Outflow)' : 'Outflow Station'}</span>
              </div>
              <div className="text-[10px] font-mono text-cyan-300 font-bold bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800">
                LINE-1
              </div>
            </div>

            {/* Outflow Pipe Graphic with Marching Fluid Stream to Bottling */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>{isAr ? 'أنبوب التغذية لصالة التعبئة' : 'Feed to Packaging'}</span>
                <span>{activeTanksList.length > 0 ? 'Active Feed' : 'Closed'}</span>
              </div>
              <div className="h-4 w-full bg-slate-950 rounded-full border border-slate-700 overflow-hidden relative shadow-inner p-0.5">
                <div
                  className={`h-full w-full rounded-full transition-all duration-300 ${
                    activeTanksList.length > 0 ? 'bg-cyan-500' : 'bg-slate-700/40'
                  }`}
                  style={
                    activeTanksList.length > 0
                      ? {
                          backgroundImage: 'repeating-linear-gradient(90deg, #06b6d4 0px, #06b6d4 12px, #0891b2 12px, #0891b2 24px)',
                          animation: 'pipePulseOutflow 1.5s linear infinite',
                        }
                      : {}
                  }
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              {isAr ? 'تسحب خطوط التعبئة السائل من أقدم التانكات تباعاً، وترث الباليتات أرقامها:' : 'Packaging lines draw from oldest active tanks first; pallets inherit tank numbers:'}
            </p>

            {activeTanksList.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-400 font-bold">{isAr ? 'التانك قيد الاستهلاك الحالي (الأقدم):' : 'Current Feeding Tank (Oldest):'}</div>
                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-cyan-500/40 text-cyan-300 font-bold flex items-center justify-between">
                  <span>#{activeTanksList[0].tankNumber}</span>
                  <span className="font-mono text-[10px] text-amber-300">{activeTanksList[0].remainingVolume} L {isAr ? 'متبقي' : 'left'}</span>
                </div>
              </div>
            ) : null}

            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>{isAr ? 'سلسلة الربط:' : 'Lineage Mode:'}</span>
              <span className="text-cyan-400 font-bold">
                {isAr ? 'أقل عدد تانكات ممكن' : 'Least-Tank Pairing'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. ACTIVE TANKS COMPOSITION & R-MATERIALS GENEALOGY                        */}
      {/* ========================================================================= */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'التانكات النشطة حالياً داخل الخزان (Active Tanks in Vessel)' : 'Active Tanks Co-existing in Vessel'}</span>
                <span className="text-xs font-mono font-bold bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-full">
                  {activeTanksList.length} / {calculatedMaxTanks} {isAr ? 'تانكات كحد أقصى' : 'tanks max'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'تفاصيل كل تانك مساهم في الخليط، حجمه المتبقي، نتائج الفحص المعملي، وأرقام تشغيلات الخامات الأولية (R-Materials LOTs).'
                  : 'Breakdown of each contributing tank, remaining volume, lab test results, and raw material (R-material) LOT numbers.'}
              </p>
            </div>
          </div>
        </div>

        {activeTanksList.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
            <Waves className="h-8 w-8 text-slate-400 mx-auto" />
            <h4 className="font-bold text-sm text-slate-700">
              {isAr ? 'لا توجد تانكات نشطة داخل الخزان حالياً' : 'No Active Tanks in Vessel'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {isAr
                ? 'عند إكمال ضخ تانك جديد من تبويب #liquid_tanks، سيظهر آلياً في هذا الحوض.'
                : 'Pumping a tank in #liquid_tanks will automatically enter it into this active pool.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeTanksList.map((tank, idx) => {
              const color = TANK_COLORS[idx % TANK_COLORS.length];
              const remainingLiters = Number(tank.remainingVolume) || 0;
              const initialLiters = Number(tank.initialVolume) || 1000;
              const tankSharePct = totalActiveVolume > 0 ? Math.round((remainingLiters / totalActiveVolume) * 100) : 0;
              const rLots = Array.isArray(tank.rMaterialLots) ? tank.rMaterialLots : [];

              return (
                <div
                  key={tank.tankId || idx}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition space-y-3 relative group"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${color.bg}`} />
                      <span className="font-black text-sm text-slate-900 font-mono">
                        {isAr ? `تانك #${tank.tankNumber}` : `Tank #${tank.tankNumber}`}
                      </span>
                      {idx === 0 && (
                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-bold text-[9px] flex items-center gap-1">
                          <span>↓</span>
                          <span>{isAr ? 'أسبقية السحب (قاع الخزان)' : 'First Feeding (Bottom Sump)'}</span>
                        </span>
                      )}
                      {idx === activeTanksList.length - 1 && activeTanksList.length > 1 && (
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-900 rounded font-bold text-[9px] flex items-center gap-1">
                          <span>↑</span>
                          <span>{isAr ? 'الأحدث (أعلى الخزان)' : 'Latest Inflow (Top Layer)'}</span>
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs font-extrabold text-indigo-700">
                      {remainingLiters.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">/ {initialLiters.toLocaleString()} L</span>
                    </span>
                  </div>

                  {/* Formula / Recipe Badge if Available */}
                  {(tank.prepCode || tank.recipeId) && (
                    <div className="flex items-center gap-1 text-[10px] text-indigo-700 font-mono font-bold bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 rounded-lg w-fit">
                      <FlaskConical className="h-3 w-3 text-indigo-500 shrink-0" />
                      <span>{tank.prepCode ? `[${tank.prepCode}] ` : ''}{tank.recipeId || tank.recipeName}</span>
                    </div>
                  )}

                  {/* Volume Share Progress */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                      <span>{isAr ? 'حصة التانك من الخليط الحالي:' : 'Share of Blend:'}</span>
                      <span className="font-mono text-slate-700">{tankSharePct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div style={{ width: `${tankSharePct}%` }} className={`h-full ${color.bg}`} />
                    </div>
                  </div>

                  {/* Lab QC Specs */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 text-[10px] block">{isAr ? 'نسبة التركيز (حموضة):' : 'Concentration:'}</span>
                      <span className="font-bold text-slate-800 font-mono">
                        {tank.qaAcidity ? `${tank.qaAcidity}%` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">{isAr ? 'توقيت الضخ بالصالة:' : 'Pumped At:'}</span>
                      <span className="font-bold text-slate-800 text-[10px]">
                        {tank.pumpFinishedAt ? new Date(tank.pumpFinishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Constituent LOT Codes (Names hidden for confidentiality) */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                        <Boxes className="h-3 w-3 text-indigo-600" />
                        <span>{isAr ? 'أرقام تشغيلات الخامات المكونة (LOT Codes):' : 'Constituent LOT Codes:'}</span>
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {rLots.length} {isAr ? 'تشغيلة' : 'LOTs'}
                      </span>
                    </div>

                    {rLots.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {rLots.map((r, rIdx) => {
                          const lotStr = String(r.lotNumber || r.lot || r || '').trim();
                          if (!lotStr) return null;
                          const isCopied = copiedLot === lotStr;
                          return (
                            <span
                              key={rIdx}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-800 rounded-lg text-[10px] font-mono font-bold transition select-all"
                              title={isAr ? `رقم التشغيلة: ${lotStr}` : `LOT Code: ${lotStr}`}
                            >
                              <span className="text-indigo-950">#{lotStr.replace(/^#/, '')}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyLot(lotStr);
                                }}
                                className="p-0.5 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
                                title={isAr ? 'نسخ رقم التشغيلة' : 'Copy LOT Code'}
                              >
                                {isCopied ? (
                                  <Check className="h-3 w-3 text-emerald-600 animate-in zoom-in" />
                                ) : (
                                  <Copy className="h-3 w-3 hover:scale-110 transition-transform" />
                                )}
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">
                        {isAr ? 'لا توجد أرقام تشغيلات مسجلة' : 'No constituent LOT codes recorded'}
                      </span>
                    )}
                  </div>

                  {/* Admin Force-Retire Action */}
                  {canAdminOverrideTanks && (
                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRetireTank(tank)}
                        className="text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>{isAr ? 'استبعاد التانك يدوياً (Admin)' : 'Retire Tank (Admin)'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. LIFECYCLE OUTFLOW DESTINATION ("Where Did Previous Tanks End Up?")      */}
      {/* ========================================================================= */}
      <div className="bg-white border-2 border-slate-300 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'سجل مصير وتصريف التانكات (Lifecycle Outflow & Destination)' : 'Tank Outflow & Consumption Tracking'}</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'بيان شامل بمصير كل تانك: الكمية المعبأة بالمنتج التام مع أرقام أوامر التشغيل والباليتات، ونسب الهالك/التفريغ.'
                  : 'Detailed audit trail of where each tank ended up: Finished Goods Work Orders, Pallet Passports, or Scrap/Drain.'}
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start sm:self-center text-xs font-bold">
            <button
              type="button"
              onClick={() => setOutflowFilter('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                outflowFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'الكل' : 'All'} ({((currentVessel?.activeTanks || []).length + (currentVessel?.historyTanks || []).length)})
            </button>
            <button
              type="button"
              onClick={() => setOutflowFilter('active')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                outflowFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isAr ? 'نشطة قيد التغذية' : 'Active'} ({(currentVessel?.activeTanks || []).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setOutflowFilter('history')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                outflowFilter === 'history'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'مستهلكة سابقة' : 'Depleted'} ({(currentVessel?.historyTanks || []).length})
            </button>
          </div>
        </div>

        {/* Tanks Outflow Table */}
        {lifecycleTanks.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-2xl">
            {isAr ? 'لا توجد تانكات مسجلة وفق معيار التصفية المختار.' : 'No tanks recorded matching selected filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'رقم التانك' : 'Tank #'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'الحجم الإجمالي / المتبقي' : 'Initial / Remaining'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'تاريخ واكتمال الضخ' : 'Pump Date'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'المصير والوجهة (Destination)' : 'Outflow Destination'}</th>
                  <th className="py-2.5 px-3 text-start font-bold min-w-[220px]">{isAr ? 'أوامر التشغيل والبالتات المرتبطة' : 'Linked WOs & Pallets'}</th>
                  <th className="py-2.5 px-3 text-start font-bold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-2.5 px-3 text-center font-bold">{isAr ? 'التفاصيل' : 'Audit'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lifecycleTanks.map((t, idx) => {
                  const linkedOutflow = getTankLifecycleOutflow(t);
                  const isCurrentActive = !!t.isCurrentActive;
                  const initialVol = Number(t.initialVolume || t.totalVolume || 1000);
                  const remVol = Number(t.remainingVolume || 0);

                  return (
                    <tr key={`${t.isCurrentActive ? 'act' : 'hist'}-${t.tankId || t.tankNumber || idx}`} className="hover:bg-slate-50 transition">
                      {/* 1. Tank Number */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-indigo-700">#{t.tankNumber}</span>
                          {t.lotNumber && t.lotNumber !== t.tankNumber && (
                            <span className="text-[10px] text-slate-400 font-mono">[{t.lotNumber}]</span>
                          )}
                        </div>
                      </td>

                      {/* 2. Initial / Remaining Volume */}
                      <td className="py-2.5 px-3 font-mono">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-800">
                            {initialVol.toLocaleString()} L
                          </div>
                          {isCurrentActive && (
                            <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                              <span>{isAr ? 'متبقي:' : 'Rem:'} {remVol.toLocaleString()} L</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. Pump Date */}
                      <td className="py-2.5 px-3 text-slate-600 text-[11px] font-mono">
                        {t.pumpFinishedAt ? (
                          <div>
                            <div>{new Date(t.pumpFinishedAt).toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-400">{new Date(t.pumpFinishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        ) : '—'}
                      </td>

                      {/* 4. Outflow Destination */}
                      <td className="py-2.5 px-3">
                        {isCurrentActive ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px] w-fit flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>{isAr ? 'قيد التغذية بالصالة' : 'Feeding Lines'}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {isAr ? `تم تعبئة ${Math.max(0, initialVol - remVol).toLocaleString()} لتر حتى الآن` : `${Math.max(0, initialVol - remVol).toLocaleString()}L consumed so far`}
                            </span>
                          </div>
                        ) : t.status === 'cip_drained' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px] w-fit">
                              {isAr ? `تفريغ غسيل (CIP): ${t.drainedLiters || 0} لتر` : `CIP Drain: ${t.drainedLiters || 0}L`}
                            </span>
                            {Number(t.scrappedLiters) > 0 && (
                              <span className="text-[10px] font-mono text-rose-700 font-bold">
                                {isAr ? `منها هالك: ${t.scrappedLiters} لتر` : `Scrapped: ${t.scrappedLiters}L`}
                                {t.targetWarehouseId && (
                                  <span className="text-slate-500 font-normal">
                                    {' → '}{getWarehouseDisplayName(t.targetWarehouseId, warehouses, isAr)}
                                  </span>
                                )}
                              </span>
                            )}
                            {Number(t.flushedLiters) > 0 && Number(t.scrappedLiters) > 0 && (
                              <span className="text-[10px] font-mono text-slate-500">
                                {isAr ? `منصرف صرف: ${t.flushedLiters} لتر` : `Flushed/Rinse: ${t.flushedLiters}L`}
                              </span>
                            )}
                          </div>
                        ) : t.status === 'admin_retired' ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[10px]">
                            {isAr ? 'استبعاد يدوي من المسؤول' : 'Admin Manual Retired'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold text-[10px]">
                            {isAr ? 'تعبئة كاملة بمنتج تام (FG)' : '100% Bottled into FG'}
                          </span>
                        )}
                      </td>

                      {/* 5. Linked WOs & Pallets */}
                      <td className="py-2.5 px-3">
                        {linkedOutflow.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            {linkedOutflow.map((grp) => (
                              <div
                                key={grp.orderNumber}
                                className="p-2 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1 shadow-2xs"
                              >
                                <div className="flex items-center justify-between gap-1 text-[11px]">
                                  <span className="font-bold text-indigo-700 font-mono flex items-center gap-1">
                                    <Package className="h-3 w-3 text-indigo-500" />
                                    <span>{isAr ? `أمر #${grp.orderNumber}` : `WO #${grp.orderNumber}`}</span>
                                  </span>
                                  {grp.totalLiters > 0 && (
                                    <span className="font-mono font-bold text-slate-700 text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                      {grp.totalLiters.toLocaleString()} {isAr ? 'لتر' : 'L'}
                                    </span>
                                  )}
                                </div>
                                {grp.productName && (
                                  <div className="text-[10px] text-slate-600 truncate font-sans" title={grp.productName}>
                                    {grp.productName}
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  <span className="text-[10px] text-slate-400 font-medium font-sans">
                                    {isAr ? 'البالتات:' : 'Pallets:'}
                                  </span>
                                  {grp.pallets.map((pNum) => (
                                    <span
                                      key={pNum}
                                      className="px-1.5 py-0.2 bg-indigo-100 text-indigo-900 border border-indigo-200/80 rounded font-mono font-bold text-[10px]"
                                    >
                                      #{pNum}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            {isCurrentActive
                              ? (isAr ? 'جاهز للتعبئة بأوامر الصالة' : 'Ready for filling lines')
                              : (isAr ? 'أوامر تعبئة الصالة' : 'Filling orders')}
                          </span>
                        )}
                      </td>

                      {/* 6. Status */}
                      <td className="py-2.5 px-3">
                        {isCurrentActive ? (
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {isAr ? 'نشط قيد الاستهلاك' : 'Active Feeding'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                            {isAr ? 'مستهلك بالكامل' : 'Depleted'}
                          </span>
                        )}
                      </td>

                      {/* 7. Audit Details Action */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedTankForDetails(t)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition cursor-pointer"
                          title={isAr ? 'عرض سجل التدقيق وتفاصيل البالتات المستهلكة' : 'View full consumption audit'}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: STORAGE CAPACITY & VESSEL TOPOLOGY CONFIGURATION (ADMIN ONLY)       */}
      {/* ========================================================================= */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden my-auto">
            {/* Modal Header (Pinned at Top) */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? `ضبط سعة خزانات الصالة: ${currentMaterial?.nameAr}` : `Configure Storage: ${currentMaterial?.nameEn || currentMaterial?.nameAr}`}
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    {isAr ? 'تحديد عدد الخزانات، اتصالها الهيدروليكي، وسعتها الإجمالية' : 'Configure vessel count, interconnection, and total capacity'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form: Body scrolls freely, Footer is pinned */}
            <form onSubmit={handleSaveStorageConfig} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 p-5 space-y-4 text-xs">
                {/* Field 1: Vessel Topology Type */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    {isAr ? 'طبيعة وتكوين الخزانات *' : 'Vessel Topology *'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfigFormData({ ...configFormData, vesselType: 'interconnected', vesselCount: 2 })}
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        configFormData.vesselType === 'interconnected'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <div className="font-bold">{isAr ? 'خزانان متصلان' : 'Interconnected (Dual)'}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{isAr ? 'مثل الخل الأبيض (2 × 3000L)' : 'e.g. White Vinegar'}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfigFormData({ ...configFormData, vesselType: 'single', vesselCount: 1 })}
                      className={`p-3 rounded-2xl border text-center transition cursor-pointer ${
                        configFormData.vesselType === 'single'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <div className="font-bold">{isAr ? 'خزان فردي موحد' : 'Single Vessel'}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{isAr ? 'مثل خل التفاح (1 × سعة مخصصة)' : 'e.g. Apple Vinegar'}</div>
                    </button>
                  </div>
                </div>

                {/* Field 2 & 3: Vessel Count & Capacity per Vessel */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 block">
                      {isAr ? 'عدد الخزانات *' : 'Vessel Count *'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      required
                      value={configFormData.vesselCount}
                      onChange={(e) => setConfigFormData({ ...configFormData, vesselCount: Number(e.target.value) })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 block">
                      {isAr ? 'سعة الخزان الواحد (لتر) *' : 'Capacity per Vessel (L) *'}
                    </label>
                    <input
                      type="number"
                      min="500"
                      step="100"
                      required
                      value={configFormData.capacityPerVessel}
                      onChange={(e) => setConfigFormData({ ...configFormData, capacityPerVessel: Number(e.target.value) })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Formula Selection from intermediate_bom */}
                {materialRecipes.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 flex items-center justify-between">
                      <span>{isAr ? 'تركيبة الإنتاج المعتمدة (من تبويب #intermediate_bom):' : 'Production Formula (from #intermediate_bom):'}</span>
                      <span className="text-[10px] text-indigo-600 font-mono font-bold">
                        {materialRecipes.length} {isAr ? 'تركيبات مسجلة' : 'Formulas Available'}
                      </span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-xl">
                      {materialRecipes.map((r) => {
                        const isSelected = (configFormData.activeRecipeCode === r.code) || (!configFormData.activeRecipeCode && activeRecipe?.code === r.code);
                        return (
                          <button
                            key={r.code}
                            type="button"
                            onClick={() => {
                              setConfigFormData({
                                ...configFormData,
                                activeRecipeCode: r.code,
                                singleBatchVolume: Number(r.batchYieldQty) || configFormData.singleBatchVolume,
                              });
                            }}
                            className={`p-2 rounded-lg border text-start transition flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-bold shadow-2xs'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <div className="truncate me-2">
                              <span className="font-mono text-xs font-bold block truncate">
                                {r.prepCode ? `[${r.prepCode}] ` : ''}{r.code}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate block">
                                {r.recipeName || r.nameAr || r.code}
                              </span>
                            </div>
                            <span className="text-xs font-mono font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded shrink-0">
                              {r.batchYieldQty || 1000} {r.yieldUnit || 'L'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Field 4: Single Batch Volume (Read-Only SSOT from Intermediate BOM) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                      <span>{isAr ? 'حجم تشغيلة التانك الواحد (لتر) - قراءة فقط (SSOT) *' : 'Single Batch Yield Volume (L) - Read Only (SSOT) *'}</span>
                    </label>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                      <ShieldCheck className="h-3 w-3 text-amber-600" />
                      <span>{isAr ? 'مصدر الحقيقة: تركيبة الإنتاج (#intermediate_bom)' : 'SSOT: #intermediate_bom'}</span>
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      readOnly
                      tabIndex={-1}
                      value={configFormData.singleBatchVolume || 1000}
                      className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-mono font-black text-slate-800 cursor-not-allowed select-all focus:outline-none"
                    />
                    <div className="absolute inset-y-0 end-3 flex items-center gap-1.5 pointer-events-none text-slate-400 text-xs font-mono font-bold">
                      <Lock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{isAr ? 'لتر / تشغيلة' : 'L / batch'}</span>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-500 block">
                    {isAr
                      ? 'هذا الحقل للقراءة فقط ومستمد حصراً من حجم تشغيلة تركيبة الإنتاج المعتمدة كـ Single Source of Truth (SSOT) لحساب السعة القصوى للتانكات بدقة تامة.'
                      : 'This field is read-only and strictly derived from the approved Intermediate BOM batch yield as the Single Source of Truth (SSOT).'}
                  </span>
                </div>

                {/* Calculated Total Capacity & Dynamic Max Tanks Display */}
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs space-y-2 text-indigo-950">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{isAr ? 'السعة الإجمالية المحسوبة للصالة:' : 'Calculated Total Capacity:'}</span>
                    <span className="font-mono font-black text-sm text-indigo-900">
                      {(Number(configFormData.capacityPerVessel) * Number(configFormData.vesselCount)).toLocaleString()} {isAr ? 'لتر' : 'L'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-indigo-200/60">
                    <span className="font-bold">{isAr ? 'الحد الأقصى للتانكات المتزامنة:' : 'Calculated Max Active Tanks:'}</span>
                    <span className="font-mono font-black text-sm text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                      {Math.max(1, Math.ceil((Number(configFormData.capacityPerVessel) * Number(configFormData.vesselCount)) / (Number(configFormData.singleBatchVolume) || 1000)))} {isAr ? 'تانكات' : 'tanks'}
                    </span>
                  </div>
                </div>

                {/* Field 5: Low-level Safety Threshold */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    {isAr ? 'حد إنذار انخفاض المنسوب (لتر) *' : 'Low-Level Warning Threshold (L) *'}
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="50"
                    required
                    value={configFormData.lowLevelThreshold}
                    onChange={(e) => setConfigFormData({ ...configFormData, lowLevelThreshold: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Modal Actions (Fixed & Pinned at Bottom - Never Clipped) */}
              <div className="shrink-0 flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50/80 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الإعدادات' : 'Save Config')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CIP CLEANOUT, SCRAP QUARANTINE & TANK FLUSH (ADMIN ONLY)            */}
      {/* ========================================================================= */}
      {showCleanoutModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl">
                  <Waves className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'تفريغ وتطهير الخزان (CIP Cleanout) وتحديد الهالك' : 'CIP Tank Flush & Scrap Quarantine'}
                  </h3>
                  <span className="text-[10px] text-slate-500">
                    {isAr ? 'تصفير الحوض، توثيق كمية الهالك ونقلها لمستودع الهالك/الحجر' : 'Reset pool, log scrapped volume to quarantine, & archive active tanks'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCleanoutModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Vessel & Volume Current State Banner */}
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-1.5">
              <div className="font-bold flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>{isAr ? 'تنبيه: سيتم تصفير رصيد الخزان بالكامل' : 'Warning: Complete Pool Reset'}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 font-mono text-[11px] font-bold">
                  {currentMaterial?.code}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                {isAr
                  ? `الرصيد المتبقي حالياً في الحوض هو (${totalActiveVolume.toLocaleString()} لتر) عبر (${activeTanksList.length} تانك). حدد أدناه كمية الهالك المسكوبة المراد نقلها لمستودع الهالك.`
                  : `Active remaining volume is ${totalActiveVolume.toLocaleString()} L across ${activeTanksList.length} tanks. Specify below the scrapped volume to move to scrap warehouse.`}
              </p>
            </div>

            {/* Input: Scrapped Liquid Volume */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 flex items-center gap-1">
                  <span>{isAr ? 'كمية الهالك المسكوب (لتر) لنقلها للمستودع:' : 'Scrapped Volume (Liters) to Transfer:'}</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCleanoutScrapVolume(String(totalActiveVolume))}
                    className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold cursor-pointer transition"
                  >
                    {isAr ? '١٠٠٪ هالك' : '100% Scrap'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCleanoutScrapVolume(String(Math.round(totalActiveVolume / 2)))}
                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[10px] font-bold cursor-pointer transition"
                  >
                    {isAr ? '٥٠٪ نصف' : '50% Half'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCleanoutScrapVolume('0')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded text-[10px] font-bold cursor-pointer transition"
                  >
                    {isAr ? '٠٪ غسيل فقط' : '0% Rinse'}
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max={totalActiveVolume}
                  step="any"
                  value={cleanoutScrapVolume}
                  onChange={(e) => setCleanoutScrapVolume(e.target.value)}
                  className={`w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-mono font-bold ${
                    Number(cleanoutScrapVolume) > totalActiveVolume || Number(cleanoutScrapVolume) < 0
                      ? 'border-rose-500 text-rose-900 bg-rose-50'
                      : 'border-slate-300 text-slate-900'
                  }`}
                  placeholder="0"
                />
                <span className="absolute inset-y-0 end-3 flex items-center text-xs text-slate-400 font-bold pointer-events-none">
                  {currentMaterial?.smallUnit || (isAr ? 'لتر' : 'L')}
                </span>
              </div>

              {Number(cleanoutScrapVolume) > totalActiveVolume && (
                <p className="text-[11px] text-rose-600 font-bold">
                  {isAr
                    ? `تنبيه: لا يمكن لكمية الهالك أن تتجاوز رصيد الخزان (${totalActiveVolume.toLocaleString()} لتر)`
                    : `Cannot exceed current active volume (${totalActiveVolume} L)`}
                </p>
              )}
            </div>

            {/* Split Breakdown Summary: Scrapped vs Flushed Effluent */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-2xl space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-rose-800">
                  <span>{isAr ? 'الهالك المنقول للمستودع' : 'Scrapped (Quarantine)'}</span>
                  <Package className="h-3.5 w-3.5 text-rose-600" />
                </div>
                <div className="text-lg font-black font-mono text-rose-900">
                  {Math.max(0, Math.min(totalActiveVolume, Number(cleanoutScrapVolume) || 0)).toLocaleString()} L
                </div>
                <div className="text-[10px] text-rose-700 leading-tight">
                  {Number(cleanoutScrapVolume) > 0
                    ? (isAr ? 'يتم إصدار إذن تحويل مخزني (TRN) رسمي' : 'Generates official TRN stock voucher')
                    : (isAr ? 'لا يوجد هالك مسكوب' : 'No scrap generated')}
                </div>
              </div>

              <div className="p-3 bg-sky-50/80 border border-sky-200 rounded-2xl space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-sky-800">
                  <span>{isAr ? 'منصرف غسيل (صرف)' : 'Drained Rinse / Wastewater'}</span>
                  <Droplet className="h-3.5 w-3.5 text-sky-600" />
                </div>
                <div className="text-lg font-black font-mono text-sky-900">
                  {Math.max(0, totalActiveVolume - (Number(cleanoutScrapVolume) || 0)).toLocaleString()} L
                </div>
                <div className="text-[10px] text-sky-700 leading-tight">
                  {isAr ? 'يفرغ في شبكة الصرف دون أثر مخزني' : 'Flushed to drain without stock trace'}
                </div>
              </div>
            </div>

            {/* Target Scrap / Quarantine Warehouse Selection */}
            {Number(cleanoutScrapVolume) > 0 ? (
              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-slate-800 block">
                  {isAr ? 'مستودع الهالك / الحجر المستهدف لاستقبال الكمية:' : 'Target Scrap / Quarantine Warehouse:'}
                </label>
                {quarantineWarehouses.length > 0 ? (
                  <select
                    value={cleanoutTargetWarehouseId}
                    onChange={(e) => setCleanoutTargetWarehouseId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    {quarantineWarehouses.map((w) => (
                      <option key={w.id || w.code} value={w.id || w.code}>
                        {isAr ? (w.nameAr || w.code) : (w.nameEn || w.nameAr || w.code)} ({w.code || w.id}) — [{w.classification === 'scrap' ? (isAr ? 'هالك' : 'Scrap') : w.classification === 'quarantine' ? (isAr ? 'حجر' : 'Quarantine') : (isAr ? 'مرتجعات' : 'Returns')}]
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                      {isAr
                        ? 'تنبيه: لم يتم العثور على مستودع مصنف صراحة كـ "هالك" أو "حجر". يمكنك الاختيار من المستودعات المتاحة:'
                        : 'Notice: No warehouse is currently tagged as "scrap" or "quarantine". Please select from available warehouses:'}
                    </div>
                    <select
                      value={cleanoutTargetWarehouseId}
                      onChange={(e) => setCleanoutTargetWarehouseId(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <option value="">{isAr ? '-- اختر المستودع --' : '-- Select Warehouse --'}</option>
                      {warehouses.map((w) => (
                        <option key={w.id || w.code} value={w.id || w.code}>
                          {isAr ? (w.nameAr || w.code) : (w.nameEn || w.nameAr || w.code)} ({w.code || w.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-slate-400 shrink-0" />
                <span>
                  {isAr
                    ? 'الكمية بالكامل منصرف غسيل، ولن يتم إنشاء إذن تحويل مخزني.'
                    : 'Entire volume is marked as rinse effluent; no inventory transfer is required.'}
                </span>
              </div>
            )}

            {/* CIP Notes / Reason */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-slate-700 block">
                {isAr ? 'سبب أو ملاحظات الغسيل والتطهير (CIP):' : 'Cleanout Notes / Reason:'}
              </label>
              <input
                type="text"
                value={cleanoutReason}
                onChange={(e) => setCleanoutReason(e.target.value)}
                placeholder={isAr ? 'مثال: غسيل وتطهير دوري أسبوعي، تغيير الصنف...' : 'e.g. Weekly sanitation, product change...'}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setShowCleanoutModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanout}
                disabled={
                  isSaving ||
                  Number(cleanoutScrapVolume) < 0 ||
                  Number(cleanoutScrapVolume) > totalActiveVolume ||
                  (Number(cleanoutScrapVolume) > 0 && !cleanoutTargetWarehouseId && (quarantineWarehouses.length > 0 || warehouses.length > 0))
                }
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSaving
                  ? (isAr ? 'جاري التنفيذ...' : 'Processing...')
                  : Number(cleanoutScrapVolume) > 0
                    ? (isAr ? 'تأكيد تخريد وغسيل الخزان' : 'Confirm CIP Cleanout & Transfer')
                    : (isAr ? 'تأكيد غسيل وتصفير الخزان' : 'Confirm CIP Reset')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL: TANK DETAILED CONSUMPTION AUDIT & PALLET BREAKDOWN                 */}
      {/* ========================================================================= */}
      {selectedTankForDetails && (() => {
        const t = selectedTankForDetails;
        const linkedOutflow = getTankLifecycleOutflow(t);
        const initialVol = Number(t.initialVolume || t.totalVolume || 1000);
        const remVol = Number(t.remainingVolume || 0);
        const consumedVol = Math.max(0, initialVol - remVol);
        const isCurrentActive = !!t.isCurrentActive;

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden my-auto">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl">
                    <FlaskConical className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-slate-900">
                        {isAr ? `سجل تدقيق واستهلاك التانك #${t.tankNumber}` : `Consumption Audit: Tank #${t.tankNumber}`}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isCurrentActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {isCurrentActive ? (isAr ? 'نشط بالصالة' : 'Active Feeding') : (isAr ? 'مستهلك' : 'Depleted')}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      {currentMaterial?.nameAr || currentMaterial?.code} • {isAr ? 'تشغيلة:' : 'LOT:'} {t.lotNumber || `#${t.tankNumber}`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTankForDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 p-5 space-y-4 text-xs">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'الحجم الإجمالي' : 'Initial Vol'}</span>
                    <span className="font-mono font-black text-sm text-slate-900">{initialVol.toLocaleString()} L</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'المستهلك الفعلي' : 'Consumed'}</span>
                    <span className="font-mono font-black text-sm text-indigo-700">{consumedVol.toLocaleString()} L</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'المتبقي بالخزان' : 'Remaining'}</span>
                    <span className="font-mono font-black text-sm text-emerald-700">{remVol.toLocaleString()} L</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <span className="text-[10px] text-slate-500 font-bold block">{isAr ? 'الحموضة / التركيز' : 'Acidity %'}</span>
                    <span className="font-mono font-black text-sm text-purple-700">{(Number(t.qaAcidity) || 5.0).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Timeline Info */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="font-sans font-medium text-slate-500">{isAr ? 'تاريخ واكتمال الضخ للصالة:' : 'Pumped to Floor:'}</span>
                    <span className="font-bold text-slate-900">{t.pumpFinishedAt ? new Date(t.pumpFinishedAt).toLocaleString() : '—'}</span>
                  </div>
                  {t.depletedAt && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-sans font-medium text-slate-500">{isAr ? 'تاريخ استهلاك/تفريغ التانك:' : 'Depleted At:'}</span>
                      <span className="font-bold text-slate-900">{new Date(t.depletedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {t.recipeName && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-sans font-medium text-slate-500">{isAr ? 'تركيبة التحضير (#intermediate_bom):' : 'Formula:'}</span>
                      <span className="font-bold text-indigo-700">{t.recipeName}</span>
                    </div>
                  )}
                </div>

                {/* Linked Orders and Pallets Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                      <Package className="h-4 w-4 text-indigo-600" />
                      <span>{isAr ? 'أوامر التشغيل والبالتات المستهلكة من هذا التانك:' : 'Consumed Work Orders & Pallets:'}</span>
                    </h4>
                    <span className="text-[10px] font-bold text-indigo-600 font-mono">
                      {linkedOutflow.length} {isAr ? 'أوامر تشغيل' : 'Orders'}
                    </span>
                  </div>

                  {linkedOutflow.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-slate-200/60">
                      {isAr ? 'لم تسجل عمليات سحب أو تعبئة بالتات من هذا التانك حتى الآن.' : 'No consumption or pallets logged for this tank yet.'}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {linkedOutflow.map((grp) => (
                        <div key={grp.orderNumber} className="p-3 bg-white border border-slate-200 rounded-2xl space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                                {isAr ? `أمر تشغيل #${grp.orderNumber}` : `Work Order #${grp.orderNumber}`}
                              </span>
                              {grp.productName && (
                                <span className="font-bold text-xs text-slate-800">{grp.productName}</span>
                              )}
                            </div>
                            <span className="font-mono font-bold text-xs text-slate-700">
                              {grp.totalLiters > 0 ? `${grp.totalLiters.toLocaleString()} L` : ''}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                            <span className="text-[10px] text-slate-500 font-medium">
                              {isAr ? 'البالتات المنتجة:' : 'Pallets Produced:'}
                            </span>
                            {grp.pallets.map((pNum) => (
                              <span
                                key={pNum}
                                className="px-2 py-0.5 bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-md font-mono font-black text-xs"
                              >
                                #{pNum}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/80 rounded-b-3xl flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedTankForDetails(null)}
                  className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
