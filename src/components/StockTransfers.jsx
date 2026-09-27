import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import {
  Plus,
  Search,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Printer,
  Eye,
  History,
  XCircle,
  Warehouse,
  Factory,
  Boxes,
  RotateCcw,
  Trash2,
  Paperclip,
  Download,
  UploadCloud,
  File,
  X,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  FileText,
  ShieldAlert,
  Package,
  User,
  UserCheck,
  Tag,
  Zap,
  RefreshCw,
  GitBranch,
  CornerDownRight,
  ExternalLink
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import SearchableSelect from './SearchableSelect';
import VariantComboBox from './VariantComboBox';
import VariantIdentifierChip from './VariantIdentifierChip';
import { useNotification } from '../context/NotificationContext';
import { 
  buildLiveStockMatrix, 
  StockOriginBadge, 
  matchWarehouse, 
  getFactoryFloorWarehouse, 
  getRawStorageWarehouses,
  formatLotLabel,
  formatVariantLabel,
  resolveItemAllowFractions
} from '../utils/stockResolver';

export default function StockTransfers({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { toast, showAlert, showConfirm } = useNotification();

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const currentUserId = currentUser?.id || currentUser?.uid || '';
  const currentUserName = isAr ? (currentUser?.nameAr || 'المسؤول') : (currentUser?.name || 'Authorized User');

  // Cloud Collections State
  const [transfers, setTransfers] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [transformations, setTransformations] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [liquidTanks, setLiquidTanks] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceWhFilter, setSourceWhFilter] = useState('all');
  const [targetWhFilter, setTargetWhFilter] = useState('all');

  // Modal & Print States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [printLang, setPrintLang] = useState('ar');

  // General Admin Interlinked Transfer Reversal Modals (Phase 3)
  const [adminDependencyModal, setAdminDependencyModal] = useState({
    open: false,
    transfer: null,
    blockers: [],
    details: '',
  });

  const [adminReversalModal, setAdminReversalModal] = useState({
    open: false,
    transfer: null,
    reason: '',
    isSubmitting: false,
    linesToRollback: [],
  });

  // Verification & Rejection Modal States
  const [verifyModalTransfer, setVerifyModalTransfer] = useState(null);
  const [rejectModalTransfer, setRejectModalTransfer] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Transfer Form State
  const [sourceWarehouse, setSourceWarehouse] = useState('');
  const [targetWarehouse, setTargetWarehouse] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [productionOrderRef, setProductionOrderRef] = useState('');
  const [notes, setNotes] = useState('');
  const [transferLines, setTransferLines] = useState([
    {
      itemId: '',
      variantCode: '',
      code: '',
      nameAr: '',
      nameEn: '',
      specs: '',
      smallUnit: 'قطعة',
      largeUnitName: 'رابطة / كرتونة',
      packagingRatio: 1,
      qtySmallUnits: '',
      qtyLargeUnits: '',
      lotNumber: '',
      unitPrice: 0,
      currency: 'EGP',
      receivedDate: '',
      supplierId: '',
      supplierName: '',
      supplierBatchNo: '',
      productionDate: '',
      expiryDate: '',
    },
  ]);
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  // Subscribe to Cloud Firestore Collections
  useEffect(() => {
    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setTransfers(list);
      setLoading(false);
    });

    const unsubTransformations = onSnapshot(collection(db, 'production_transformations'), (snap) => {
      setTransformations(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setItemsMaster(list);
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setGoodsReceipts(list);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setUsersList(list);
    });

    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .filter((w) => w.isActive !== false);
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehouses(list);

      if (list.length > 0) {
        const defaultSrc = getRawStorageWarehouses(list)[0] || list[0];
        const defaultTarget = getFactoryFloorWarehouse(list) || list[1] || list[0];
        setSourceWarehouse((prev) => prev || defaultSrc.id || defaultSrc.code);
        setTargetWarehouse((prev) => prev || defaultTarget.id || defaultTarget.code);
      }
    });

    const unsubTanks = onSnapshot(collection(db, 'liquid_tanks'), (snap) => {
      setLiquidTanks(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubWo = onSnapshot(collection(db, 'work_orders'), (snap) => {
      setWorkOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubTransfers();
      unsubTransformations();
      unsubItems();
      unsubGrns();
      unsubUsers();
      unsubWh();
      unsubTanks();
      unsubWo();
    };
  }, []);

  // Helper to match warehouse by ID, Code, or Name
  const matchWh = (val, target) => {
    if (!val || !target) return false;
    return val === target.id || val === target.code || val === target.nameAr || val === target.nameEn;
  };

  const getWarehouseObj = (identifier) => {
    return warehouses.find((w) => matchWh(identifier, w)) || { nameAr: identifier, code: identifier, color: '#0d6cba' };
  };

  const getWarehouseName = (identifier) => {
    if (!identifier) return '';
    const wh = warehouses.find((w) => matchWh(identifier, w));
    if (wh) {
      return isAr ? (wh.nameAr || wh.code || wh.id) : (wh.nameEn || wh.nameAr || wh.code || wh.id);
    }
    return identifier;
  };

  const getUserName = (userId) => {
    if (!userId) return '';
    const user = usersList.find((u) => u.id === userId);
    return isAr ? (user?.nameAr || userId) : (user?.name || user?.nameAr || userId);
  };

  // Material Transfers Only - Exclude Finished Goods transfers (managed exclusively in #fg_inward)
  const isFinishedGoodsTransfer = (trn) => {
    if (!trn) return false;
    if (trn.transferType === 'finished_goods' || trn.transferCategory === 'finished_goods' || trn.isFinishedGoods) return true;
    if (trn.id?.startsWith('TRN-FG-') || trn.id?.startsWith('FG-INW-') || trn.id?.startsWith('FG-TRN-')) return true;
    if (Array.isArray(trn.lines) && trn.lines.some((l) => l.palletId || (Array.isArray(l.intermediateLiquidTanks) && l.intermediateLiquidTanks.length > 0))) return true;
    const targetWh = warehouses.find((w) => matchWh(trn.targetWarehouse, w));
    const isTargetFg = targetWh?.classification === 'finished_goods' || targetWh?.operationalClassification === 'finished_goods';
    const srcWh = warehouses.find((w) => matchWh(trn.sourceWarehouse, w));
    const isSrcFloor = srcWh?.classification === 'factory_floor' || srcWh?.isFactoryLinked;
    if (isTargetFg && isSrcFloor) return true;
    if (trn.notes && (trn.notes.includes('ترحيل بالتات منتج تام') || trn.notes.toLowerCase().includes('pallets to fg'))) return true;
    return false;
  };

  // Helper to render dynamic warehouse icon
  const renderWarehouseIcon = (wh, className = 'h-4 w-4') => {
    const iconType = wh?.icon || (wh?.classification === 'factory_floor' || wh?.isFactoryLinked ? 'Factory' : 'Warehouse');
    switch (iconType) {
      case 'Factory':
        return <Factory className={className} />;
      case 'Boxes':
        return <Boxes className={className} />;
      case 'RotateCcw':
        return <RotateCcw className={className} />;
      case 'Trash2':
        return <Trash2 className={className} />;
      case 'Package':
        return <Package className={className} />;
      default:
        return <Warehouse className={className} />;
    }
  };

  // Helper to get formatted variations for an item
  const getItemVariations = (itemId) => {
    const item = itemsMaster.find((i) => i.code === itemId || i.id === itemId);
    if (!item || !Array.isArray(item.variations) || item.variations.length === 0) return [];

    return item.variations.map((v) => {
      const vCode = v.variantCode || v.code || (v.suffix ? `${item.code}-${v.suffix}` : item.code);
      let vSpecs = v.mergedSpecs || '';
      if (!vSpecs && Array.isArray(v.specs)) {
        vSpecs = v.specs.map((s) => (typeof s === 'object' ? `${s.label}: ${s.value}` : s)).join(' | ');
      }
      if (!vSpecs && (v.color || v.dimensions)) {
        vSpecs = [v.color, v.dimensions].filter(Boolean).join(' ');
      }

      return {
        ...v,
        resolvedCode: vCode,
        resolvedSpecs: vSpecs,
      };
    });
  };

  // Compute Live Available Stock in a Specific Warehouse for an Item Variant
  const getWarehouseStock = (whIdentifier, itemId, variantCode) => {
    if (!whIdentifier || !variantCode) return 0;

    const targetWh = warehouses.find((w) => matchWh(whIdentifier, w)) || { id: whIdentifier, code: whIdentifier };

    // Inflow from Completed Goods Receipts (GRN)
    let inflow = 0;
    goodsReceipts.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');

      (grn.lines || []).forEach((line) => {
        const matchesItem = line.itemId === itemId || line.code === variantCode || line.variantCode === variantCode;
        if (matchesItem) {
          const smallQty = Number(line.receivedSmallUnits || 0);
          const isTargetWh = matchWh(line.targetWarehouse, targetWh);
          if (isReturn && isTargetWh) {
            inflow -= smallQty;
          } else if (!isReturn && isTargetWh) {
            inflow += smallQty;
          }
        }
      });
    });

    // Plus/Minus from Completed Transfers
    let transferNet = 0;
    transfers.forEach((trn) => {
      if (trn.status !== 'completed') return;
      (trn.lines || []).forEach((line) => {
        const matchesItem = line.itemId === itemId || line.code === variantCode || line.variantCode === variantCode;
        if (matchesItem) {
          const qty = Number(line.qtySmallUnits || 0);
          if (matchWh(trn.targetWarehouse, targetWh)) transferNet += qty;
          if (matchWh(trn.sourceWarehouse, targetWh)) transferNet -= qty;
        }
      });
    });

    return Math.max(0, inflow + transferNet);
  };

  // Compiled Live Stock Matrix (Single Source of Truth)
  const stockMatrix = useMemo(() => {
    return buildLiveStockMatrix({
      itemsMaster,
      warehouses,
      goodsReceipts,
      transfers,
      transformations,
    });
  }, [itemsMaster, warehouses, goodsReceipts, transfers, transformations]);

  // Primary Matrix Lookup with Dynamic Ledger Fallback for Active Lots
  const getAvailableLotsForVariant = (whIdentifier, itemId, variantCode) => {
    if (!whIdentifier || !variantCode) return { lots: [], source: 'matrix' };

    const targetWh = warehouses.find((w) => matchWh(whIdentifier, w)) || { id: whIdentifier, code: whIdentifier };
    const whId = targetWh.id || targetWh.code;

    // 1. PRIMARY: Query the compiled Live Matrix
    if (stockMatrix && stockMatrix.isReady) {
      const varKey = `${itemId}_${variantCode}`;
      const varEntry = stockMatrix.varMap[varKey];
      if (varEntry) {
        const matrixLots = (varEntry.lots || []).filter(
          (l) => (l.warehouseId === whId || matchWarehouse(whId, l.warehouseObj)) && l.availableQty > 0
        );
        return { lots: matrixLots, source: 'matrix' };
      }
    }

    // 2. FALLBACK: Dynamic Calculation across raw transaction documents
    const lotMap = {};
    goodsReceipts.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');

      (grn.lines || []).forEach((line, lIdx) => {
        const matches =
          (line.itemId && (line.itemId === itemId || line.itemId === variantCode)) ||
          (line.code && (line.code === variantCode || line.code === itemId)) ||
          (line.variantCode && line.variantCode === variantCode);

        if (matches) {
          const lotNo = line.lotNumber || (line.linkedGrnId ? `${line.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}` : `${grn.id}-${String(lIdx + 1).padStart(2, '0')}`);
          const isTargetWh = matchWh(line.targetWarehouse, targetWh);
          const qty = Number(line.receivedSmallUnits || 0);

          if (!lotMap[lotNo]) {
            lotMap[lotNo] = {
              lotNumber: lotNo,
              unitPrice: line.unitPrice !== '' && line.unitPrice !== undefined ? Number(line.unitPrice) : 0,
              currency: line.currency || 'EGP',
              receivedDate: grn.receiptDate || '',
              supplierId: grn.supplierId || '',
              supplierName: grn.supplierName || '',
              supplierBatchNo: line.supplierBatchNo || '',
              productionDate: line.productionDate || '',
              expiryDate: line.expiryDate || '',
              specs: line.specs || '',
              packagingRatio: Number(line.packagingRatio || 1),
              smallUnit: line.smallUnit || 'قطعة',
              largeUnitName: line.largeUnitName || 'كرتونة',
              availableQty: 0,
            };
          }

          if (isTargetWh) lotMap[lotNo].availableQty += isReturn ? -qty : qty;
        }
      });
    });

    transfers.forEach((trn) => {
      if (trn.status !== 'completed') return;
      (trn.lines || []).forEach((line) => {
        const matches =
          (line.itemId && (line.itemId === itemId || line.itemId === variantCode)) ||
          (line.code && (line.code === variantCode || line.code === itemId)) ||
          (line.variantCode && line.variantCode === variantCode);

        if (matches && line.lotNumber) {
          const lotNo = line.lotNumber;
          const qty = Number(line.qtySmallUnits || 0);

          if (!lotMap[lotNo]) {
            lotMap[lotNo] = {
              lotNumber: lotNo,
              unitPrice: Number(line.unitPrice || 0),
              currency: line.currency || 'EGP',
              receivedDate: line.receivedDate || trn.transferDate || '',
              supplierId: line.supplierId || '',
              supplierName: line.supplierName || '',
              supplierBatchNo: line.supplierBatchNo || '',
              productionDate: line.productionDate || '',
              expiryDate: line.expiryDate || '',
              specs: line.specs || '',
              packagingRatio: Number(line.packagingRatio || 1),
              smallUnit: line.smallUnit || 'قطعة',
              largeUnitName: line.largeUnitName || 'كرتونة',
              availableQty: 0,
            };
          }

          if (matchWh(trn.targetWarehouse, targetWh)) lotMap[lotNo].availableQty += qty;
          if (matchWh(trn.sourceWarehouse, targetWh)) lotMap[lotNo].availableQty -= qty;
        }
      });
    });

    const activeLots = Object.values(lotMap).filter((l) => l.availableQty > 0);
    activeLots.sort((a, b) => (a.receivedDate || '').localeCompare(b.receivedDate || ''));

    return { lots: activeLots, source: 'fallback' };
  };

  // Generate Next Transfer ID (TRN-YYYYMMDD01)
  const generateTransferId = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `TRN-${yyyy}${mm}${dd}`;

    const todaysTransfers = transfers.filter((t) => t.id && t.id.startsWith(datePrefix) && !isFinishedGoodsTransfer(t));
    let maxSeq = 0;
    todaysTransfers.forEach((t) => {
      const seqPart = parseInt(t.id.slice(datePrefix.length), 10);
      if (!isNaN(seqPart) && seqPart > maxSeq) maxSeq = seqPart;
    });

    return `${datePrefix}${String(maxSeq + 1).padStart(2, '0')}`;
  };

  // Form Handlers
  const handleOpenCreateModal = () => {
    const defaultSrc = getRawStorageWarehouses(warehouses)[0] || warehouses[0];
    const defaultTarget = getFactoryFloorWarehouse(warehouses) || warehouses[1] || warehouses[0];

    setSourceWarehouse(defaultSrc ? (defaultSrc.id || defaultSrc.code) : '');
    setTargetWarehouse(defaultTarget ? (defaultTarget.id || defaultTarget.code) : '');
    setTransferDate(new Date().toISOString().split('T')[0]);
    setProductionOrderRef('');
    setNotes('');
    setTransferLines([
      {
        itemId: '',
        variantCode: '',
        code: '',
        nameAr: '',
        nameEn: '',
        specs: '',
        smallUnit: 'قطعة',
        largeUnitName: 'رابطة / كرتونة',
        packagingRatio: 1,
        qtySmallUnits: '',
        qtyLargeUnits: '',
        lotNumber: '',
        unitPrice: 0,
        currency: 'EGP',
        receivedDate: '',
        supplierId: '',
        supplierName: '',
        supplierBatchNo: '',
        productionDate: '',
        expiryDate: '',
      },
    ]);
    setShowCreateModal(true);
  };

  const handleAddLine = () => {
    setTransferLines((prev) => [
      ...prev,
      {
        itemId: '',
        variantCode: '',
        code: '',
        nameAr: '',
        nameEn: '',
        specs: '',
        smallUnit: 'قطعة',
        largeUnitName: 'رابطة / كرتونة',
        packagingRatio: 1,
        qtySmallUnits: '',
        qtyLargeUnits: '',
        lotNumber: '',
        unitPrice: 0,
        currency: 'EGP',
        receivedDate: '',
        supplierId: '',
        supplierName: '',
        supplierBatchNo: '',
        productionDate: '',
        expiryDate: '',
      },
    ]);
  };

  const handleRemoveLine = (idx) => {
    if (transferLines.length === 1) return;
    setTransferLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleItemSelect = (idx, selectedItemId) => {
    const item = itemsMaster.find((i) => i.code === selectedItemId || i.id === selectedItemId);

    setTransferLines((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        itemId: selectedItemId,
        variantCode: '', // Explicit selection
        code: '',
        nameAr: item?.nameAr || '',
        nameEn: item?.nameEn || '',
        specs: '',
        smallUnit: item?.smallUnit || 'قطعة',
        largeUnitName: item?.largeUnitName || 'رابطة / كرتونة',
        packagingRatio: Number(item?.packagingRatio || 1),
        allowFractions: resolveItemAllowFractions(item),
        qtySmallUnits: '',
        qtyLargeUnits: '',
        lotNumber: '',
        unitPrice: 0,
        supplierId: '',
        supplierName: '',
        receivedDate: '',
        supplierBatchNo: '',
        productionDate: '',
        expiryDate: '',
      };
      return updated;
    });
  };

  const handleVariantSelect = (idx, selectedVariantCode) => {
    const currentLine = transferLines[idx];
    const item = itemsMaster.find((i) => i.code === currentLine.itemId || i.id === currentLine.itemId);
    const variations = getItemVariations(currentLine.itemId);
    const variant = variations.find((v) => v.resolvedCode === selectedVariantCode);

    // Query active lots in source warehouse (Matrix with Dynamic Fallback)
    const { lots: activeLots } = getAvailableLotsForVariant(sourceWarehouse, currentLine.itemId, selectedVariantCode);
    const fifoSuggestedLot = activeLots.length > 0 ? activeLots[0] : null;

    setTransferLines((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        variantCode: selectedVariantCode,
        code: selectedVariantCode,
        specs: variant?.resolvedSpecs || '',
        packagingRatio: Number(variant?.packagingRatio || item?.packagingRatio || 1),
        allowFractions: resolveItemAllowFractions(variant || item),
        qtySmallUnits: '',
        qtyLargeUnits: '',
        // FIFO Auto-suggestion populated as default recommendation
        lotNumber: fifoSuggestedLot?.lotNumber || '',
        unitPrice: fifoSuggestedLot?.unitPrice || 0,
        currency: fifoSuggestedLot?.currency || 'EGP',
        receivedDate: fifoSuggestedLot?.receivedDate || '',
        supplierId: fifoSuggestedLot?.supplierId || '',
        supplierName: fifoSuggestedLot?.supplierName || '',
        supplierBatchNo: fifoSuggestedLot?.supplierBatchNo || '',
        productionDate: fifoSuggestedLot?.productionDate || '',
        expiryDate: fifoSuggestedLot?.expiryDate || '',
      };
      return updated;
    });
  };

  const handleLotSelect = (idx, selectedLotNumber) => {
    const currentLine = transferLines[idx];
    const { lots: activeLots } = getAvailableLotsForVariant(sourceWarehouse, currentLine.itemId, currentLine.variantCode);
    const targetLot = activeLots.find((l) => l.lotNumber === selectedLotNumber);

    setTransferLines((prev) => {
      const updated = [...prev];
      if (targetLot) {
        updated[idx] = {
          ...updated[idx],
          lotNumber: targetLot.lotNumber,
          unitPrice: targetLot.unitPrice || 0,
          currency: targetLot.currency || 'EGP',
          receivedDate: targetLot.receivedDate || '',
          supplierId: targetLot.supplierId || '',
          supplierName: targetLot.supplierName || '',
          supplierBatchNo: targetLot.supplierBatchNo || '',
          productionDate: targetLot.productionDate || '',
          expiryDate: targetLot.expiryDate || '',
        };
      } else {
        updated[idx] = {
          ...updated[idx],
          lotNumber: selectedLotNumber,
        };
      }
      return updated;
    });
  };

  const handleQtyChange = (idx, field, value) => {
    const val = value === '' ? '' : Math.max(0, Number(value));
    setTransferLines((prev) => {
      const updated = [...prev];
      const line = updated[idx];
      const ratio = Number(line.packagingRatio || 1);

      if (field === 'qtyLargeUnits') {
        line.qtyLargeUnits = val;
        line.qtySmallUnits = val === '' 
          ? '' 
          : (line.allowFractions ? Math.round(val * ratio * 1000) / 1000 : Math.round(val * ratio));
      } else {
        const cleanVal = (val !== '' && !line.allowFractions) ? Math.round(val) : val;
        line.qtySmallUnits = cleanVal;
        line.qtyLargeUnits = cleanVal === '' ? '' : Number((cleanVal / ratio).toFixed(2));
      }
      return updated;
    });
  };

  // Determine Custodian & Verification Rules
  const sourceWhObj = getWarehouseObj(sourceWarehouse);
  const targetWhObj = getWarehouseObj(targetWarehouse);
  const todayIso = new Date().toISOString().split('T')[0];
  const isDateDifferentFromToday = transferDate !== todayIso;

  // Determine who needs to verify
  const sourceCustodianId = sourceWhObj?.responsibleUserId || '';
  const targetCustodianId = targetWhObj?.responsibleUserId || '';

  // Determine required verifier based on custody:
  const getRequiredVerifierInfo = (creatorId) => {
    let verifierId = '';
    let verifierRoleDesc = '';

    // Rule: If both warehouses belong to the SAME custodian, no extra verification step is required
    if (sourceCustodianId && targetCustodianId && sourceCustodianId === targetCustodianId) {
      return { verifierId: '', verifierRoleDesc: '' };
    }

    // Inter-custody transfers between different custodians:
    if (creatorId === targetCustodianId && sourceCustodianId && sourceCustodianId !== creatorId) {
      verifierId = sourceCustodianId;
      verifierRoleDesc = isAr ? `مسؤول مخزن الصرف (${sourceWhObj.nameAr})` : `Source WH Custodian (${sourceWhObj.nameAr})`;
    } else if (targetCustodianId && targetCustodianId !== creatorId) {
      verifierId = targetCustodianId;
      verifierRoleDesc = isAr ? `مسؤول المخزن المستلم (${targetWhObj.nameAr})` : `Target WH Custodian (${targetWhObj.nameAr})`;
    } else if (sourceCustodianId && sourceCustodianId !== creatorId) {
      verifierId = sourceCustodianId;
      verifierRoleDesc = isAr ? `مسؤول مخزن الصرف (${sourceWhObj.nameAr})` : `Source WH Custodian (${sourceWhObj.nameAr})`;
    }

    return { verifierId, verifierRoleDesc };
  };

  // Submit Transfer
  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    if (sourceWarehouse === targetWarehouse) {
      alert(isAr ? 'لا يمكن اختيار نفس المخزن كمصدر ووجهة للتحويل.' : 'Source and destination warehouses cannot be the same.');
      return;
    }

    // Validate Lines & Mandatory Variations
    for (let i = 0; i < transferLines.length; i++) {
      const line = transferLines[i];
      if (!line.itemId) {
        alert(isAr ? `يرجى اختيار الخامة للسطر رقم ${i + 1}` : `Please select item for line ${i + 1}`);
        return;
      }
      if (!line.variantCode) {
        alert(isAr ? `يرجى تحديد التنوع والمواصفة للسطر رقم ${i + 1} (حقل إلزامي)` : `Please select variation for line ${i + 1} (Mandatory)`);
        return;
      }
      if (!line.qtySmallUnits || Number(line.qtySmallUnits) <= 0) {
        alert(isAr ? `يرجى إدخال كمية صحيحة للسطر رقم ${i + 1}` : `Please enter valid quantity for line ${i + 1}`);
        return;
      }

      const { lots: availableLots } = getAvailableLotsForVariant(sourceWarehouse, line.itemId, line.variantCode);
      const selectedLotObj = availableLots.find((l) => l.lotNumber === line.lotNumber);
      const availableStock = selectedLotObj ? selectedLotObj.availableQty : getWarehouseStock(sourceWarehouse, line.itemId, line.variantCode);

      if (Number(line.qtySmallUnits) > availableStock) {
        alert(
          isAr
            ? `الكمية المطلوبة للسطر ${i + 1} (${line.qtySmallUnits}) تتجاوز الرصيد المتاح في اللوط المحدد (${availableStock} ${line.smallUnit}).`
            : `Quantity for line ${i + 1} exceeds available stock in selected Lot (${availableStock}).`
        );
        return;
      }
    }

    setIsSavingTransfer(true);

    try {
      const newTrnId = generateTransferId();
      const { verifierId, verifierRoleDesc } = getRequiredVerifierInfo(currentUserId);

      // Status Hierarchy Rules:
      // 1. If Date is NOT Today and user is not General Admin: 'pending_admin_verification'
      // 2. Else If requiredVerifierId exists and user is not General Admin: 'pending_custodian_verification'
      // 3. Otherwise: 'completed'
      const lotsSummary = transferLines.map((l) => l.lotNumber ? `[لوط: ${l.lotNumber}]` : '').filter(Boolean).join(', ');
      const lotsSummaryEn = transferLines.map((l) => l.lotNumber ? `[Lot: ${l.lotNumber}]` : '').filter(Boolean).join(', ');

      let initialStatus = 'completed';
      let auditAction = 'transfer_completed_direct';
      let noteAr = `تم تنفيذ التحويل المخزني واعتماده فورياً ${lotsSummary ? `(${lotsSummary})` : ''}`;
      let noteEn = `Transfer executed and completed directly ${lotsSummaryEn ? `(${lotsSummaryEn})` : ''}`;

      if (isDateDifferentFromToday && !isGeneralAdmin) {
        initialStatus = 'pending_admin_verification';
        auditAction = 'transfer_held_backdate';
        noteAr = `تم تعليق التحويل لاختلاف تاريخ الصرف (${transferDate}) عن تاريخ اليوم وبانتظار اعتماد المسؤول العام حصراً ${lotsSummary ? `(${lotsSummary})` : ''}`;
        noteEn = `Transfer held due to custom date (${transferDate}); awaiting General Admin verification exclusively ${lotsSummaryEn ? `(${lotsSummaryEn})` : ''}`;
      } else if (verifierId && !isGeneralAdmin) {
        initialStatus = 'pending_custodian_verification';
        auditAction = 'transfer_requested_custodian';
        const verifierName = getUserName(verifierId);
        noteAr = `تم إنشاء طلب التحويل وبانتظار فحص واعتماد ${verifierRoleDesc}: ${verifierName} ${lotsSummary ? `(${lotsSummary})` : ''}`;
        noteEn = `Transfer requested; awaiting inspection & verification by ${verifierName} ${lotsSummaryEn ? `(${lotsSummaryEn})` : ''}`;
      }

      const auditEntry = {
        version: '1.0',
        action: auditAction,
        status: initialStatus,
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr,
        noteEn,
      };

      const transferDoc = {
        id: newTrnId,
        sourceWarehouse,
        targetWarehouse,
        transferDate,
        isCustomDate: isDateDifferentFromToday,
        productionOrderRef: productionOrderRef.trim(),
        notes: notes.trim(),
        lines: transferLines.map((l) => ({
          ...l,
          qtySmallUnits: Number(l.qtySmallUnits),
          qtyLargeUnits: Number(l.qtyLargeUnits || 0),
        })),
        status: initialStatus,
        issuedBy: currentUserName,
        issuedById: currentUserId,
        requiredVerifierId: verifierId || null,
        requiredVerifierRoleDesc: verifierRoleDesc || null,
        verifiedBy: initialStatus === 'completed' ? currentUserName : null,
        verifiedAt: initialStatus === 'completed' ? new Date().toISOString() : null,
        auditTrail: [auditEntry],
        attachments: [],
        version: '1.0',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'stock_transfers', newTrnId), transferDoc);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error saving transfer:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ أمر التحويل.' : 'Error saving transfer order.');
    } finally {
      setIsSavingTransfer(false);
    }
  };

  // Verify and Approve Transfer (Custodian or General Admin Override)
  const handleVerifyTransfer = async () => {
    if (!verifyModalTransfer) return;

    // Security Check: If custom date, only General Admin can verify
    if (verifyModalTransfer.status === 'pending_admin_verification' && !isGeneralAdmin) {
      alert(isAr ? 'هذا التحويل معلق بتاريخ مخصص ولا يمكن اعتماده إلا من قبل المسؤول العام حصراً.' : 'Only the General Admin can approve transfers with custom dates.');
      return;
    }

    setIsSavingTransfer(true);
    try {
      const isOverride = isGeneralAdmin && verifyModalTransfer.requiredVerifierId && currentUserId !== verifyModalTransfer.requiredVerifierId;

      const auditEntry = {
        version: '1.1',
        action: 'transfer_verified_accepted',
        status: 'completed',
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: isOverride
          ? `تم اعتماد واستلام التحويل بصلاحية المسؤول العام (اعتماد استثنائي نيابة عن ${getUserName(verifyModalTransfer.requiredVerifierId)})`
          : 'تم فحص الشحنة واستلامها واعتماد التحويل المخزني بنجاح',
        noteEn: isOverride
          ? `Verified by General Admin Override on behalf of ${getUserName(verifyModalTransfer.requiredVerifierId)}`
          : 'Transfer inspected, verified, and completed successfully',
      };

      await setDoc(
        doc(db, 'stock_transfers', verifyModalTransfer.id),
        {
          status: 'completed',
          verifiedBy: currentUserName,
          verifiedById: currentUserId,
          verifiedAt: new Date().toISOString(),
          auditTrail: [...(verifyModalTransfer.auditTrail || []), auditEntry],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setVerifyModalTransfer(null);
    } catch (err) {
      console.error('Error verifying transfer:', err);
      alert(isAr ? 'حدث خطأ أثناء اعتماد التحويل.' : 'Error verifying transfer.');
    } finally {
      setIsSavingTransfer(false);
    }
  };

  // Reject Transfer with Mandatory Reason
  const handleRejectTransfer = async () => {
    if (!rejectModalTransfer) return;
    if (!rejectionReason.trim()) {
      alert(isAr ? 'يرجى كتابة سبب رفض التحويل.' : 'Please provide a reason for rejection.');
      return;
    }

    setIsSavingTransfer(true);
    try {
      const isOverride = isGeneralAdmin && rejectModalTransfer.requiredVerifierId && currentUserId !== rejectModalTransfer.requiredVerifierId;

      const auditEntry = {
        version: '1.1',
        action: 'transfer_rejected',
        status: 'rejected',
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: isOverride
          ? `تم رفض التحويل من قبل المسؤول العام: ${rejectionReason.trim()}`
          : `تم رفض استلام التحويل: ${rejectionReason.trim()}`,
        noteEn: `Transfer rejected: ${rejectionReason.trim()}`,
      };

      await setDoc(
        doc(db, 'stock_transfers', rejectModalTransfer.id),
        {
          status: 'rejected',
          rejectionReason: rejectionReason.trim(),
          rejectedBy: currentUserName,
          rejectedById: currentUserId,
          rejectedAt: new Date().toISOString(),
          auditTrail: [...(rejectModalTransfer.auditTrail || []), auditEntry],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setRejectModalTransfer(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Error rejecting transfer:', err);
      alert(isAr ? 'حدث خطأ أثناء تسجيل رفض التحويل.' : 'Error rejecting transfer.');
    } finally {
      setIsSavingTransfer(false);
    }
  };

  // Print Handler
  const handleTriggerPrint = (trn) => {
    setPrintData(trn);
    setPrintLang('ar');

    const prevTitle = document.title;
    document.title = `${trn.id} - إذن تحويل مخزني`;

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = prevTitle;
      }, 1000);
    }, 200);
  };

  // --- GENERAL ADMIN DOWNSTREAM DEPENDENCY CHECKER (TRN LEVEL) ---
  const checkTransferDownstreamDependencies = (trn) => {
    if (!trn || !Array.isArray(trn.lines)) return [];
    const blockers = [];
    const targetWhObj = warehouses.find((w) => matchWh(trn.targetWarehouse, w)) || { id: trn.targetWarehouse, code: trn.targetWarehouse };
    const targetWhId = targetWhObj.id || targetWhObj.code || trn.targetWarehouse;
    const targetWhName = getWarehouseName(trn.targetWarehouse);

    trn.lines.forEach((line) => {
      const lineQty = Number(line.qtySmallUnits || 0);
      const lotNo = line.lotNumber;
      if (!lotNo || lineQty <= 0) return;

      // 1. Live Available Stock in Target Warehouse Check
      const lotKey = `${lotNo}_${targetWhId}`;
      const liveLot = stockMatrix?.lotMap?.[lotKey];
      const availableInTarget = liveLot ? Number(liveLot.availableQty || 0) : 0;

      // 2. Scan active transformations (liquid tanks or work order pallets) consuming this lot in targetWarehouse
      (transformations || []).forEach((tr) => {
        if (tr.status === 'cancelled' || tr.status === 'rejected' || tr.status === 'reversed' || tr.isReversed) return;
        const comps = Array.isArray(tr.consumedComponents) ? tr.consumedComponents : [];
        comps.forEach((c) => {
          const matchLot = c.lotNumber && (c.lotNumber === lotNo);
          const matchWh = matchWarehouse(trn.targetWarehouse, c.warehouseId || c.warehouse);
          if (matchLot && matchWh) {
            const consumedQty = Number(c.qtySmallUnits || c.quantity || 0);
            const isTank = tr.id?.startsWith('TRANS-TANK-') || tr.tankId || tr.type === 'tank_batch_production';
            const isPallet = tr.id?.includes('PALLET') || tr.palletNumber !== undefined;
            const oNum = tr.workOrderNumber || tr.orderNumber || '';
            const tNum = tr.tankNumber || tr.tankId || '';

            blockers.push({
              id: `${tr.id}-${c.lotNumber}`,
              type: isTank ? 'tank' : isPallet ? 'pallet' : 'transformation',
              orderNumber: oNum,
              tankId: tNum,
              titleAr: isTank ? `تانك خلط رقم #${tNum || tr.id}` : isPallet ? `باليت منتج تام بأمر تشغيل #${oNum}` : `عملية تحويل إنتاجي (${tr.id})`,
              titleEn: isTank ? `Liquid Tank #${tNum || tr.id}` : isPallet ? `Pallet in Work Order #${oNum}` : `Transformation (${tr.id})`,
              consumedQty,
              unit: c.smallUnit || c.unit || line.smallUnit || '',
              messageAr: `تم استهلاك (${consumedQty.toLocaleString()} ${c.smallUnit || line.smallUnit || ''}) من هذا اللوط في هذه العملية بعد استلامه بمخزن (${targetWhName}). يجب إلغاء العملية أولاً.`,
              messageEn: `Consumed (${consumedQty.toLocaleString()} ${c.smallUnit || line.smallUnit || ''}) from this lot in this operation after being received at (${targetWhName}). You must reverse this operation first.`,
              navTab: isTank ? 'liquid_tanks' : 'work_orders',
            });
          }
        });
      });

      // 3. Scan subsequent stock transfers moving this lot out of targetWarehouse
      (transfers || []).forEach((subTrn) => {
        if (subTrn.id === trn.id || subTrn.status !== 'completed' || subTrn.status === 'reversed' || subTrn.isReversed) return;
        if (!matchWarehouse(subTrn.sourceWarehouse, trn.targetWarehouse)) return;
        (subTrn.lines || []).forEach((subLine) => {
          if (subLine.lotNumber === lotNo) {
            const subQty = Number(subLine.qtySmallUnits || 0);
            const subTgtName = getWarehouseName(subTrn.targetWarehouse);
            blockers.push({
              id: `${subTrn.id}-${lotNo}`,
              type: 'transfer',
              refId: subTrn.id,
              titleAr: `تحويل مخزني لاحق (${subTrn.id})`,
              titleEn: `Subsequent Stock Transfer (${subTrn.id})`,
              consumedQty: subQty,
              unit: subLine.smallUnit || line.smallUnit || '',
              messageAr: `تم ترحيل (${subQty.toLocaleString()} ${subLine.smallUnit || ''}) من هذا اللوط لاحقاً من (${targetWhName}) إلى (${subTgtName}). يجب إلغاء التحويل اللاحق أولاً.`,
              messageEn: `Transferred (${subQty.toLocaleString()} ${subLine.smallUnit || ''}) of this lot further to (${subTgtName}). You must reverse that transfer first.`,
              navTab: 'transfers',
            });
          }
        });
      });

      // 4. Net Stock Shortage Check
      if (availableInTarget < lineQty && blockers.length === 0) {
        const deficit = lineQty - availableInTarget;
        blockers.push({
          id: `deficit-${lotNo}`,
          type: 'shortage',
          titleAr: `عجز برصيد اللوط [${lotNo}] بالمخزن المستلم`,
          titleEn: `Lot [${lotNo}] Stock Deficit in Target Warehouse`,
          consumedQty: deficit,
          unit: line.smallUnit || '',
          messageAr: `الرصيد المتاح حالياً من هذا اللوط في (${targetWhName}) هو (${availableInTarget.toLocaleString()}) فقط، بينما المطلوب استرجاعه (${lineQty.toLocaleString()}). استرجاع الإذن سيسبب عجزاً بمقدار (-${deficit.toLocaleString()}).`,
          messageEn: `Current available balance of this lot in (${targetWhName}) is only (${availableInTarget.toLocaleString()}), but (${lineQty.toLocaleString()}) is required. Reversing this transfer will cause a negative balance of (-${deficit.toLocaleString()}).`,
          navTab: null,
        });
      }
    });

    return blockers;
  };

  // Open Admin Reversal Modal (or Blocker Modal)
  const handleOpenAdminTransferReversal = (trn) => {
    if (!isGeneralAdmin) {
      showAlert({
        title: isAr ? 'صلاحية غير كافية' : 'Permission Denied',
        message: isAr ? 'إلغاء وعكس التحويلات المخزنية محصور بالمسؤول العام.' : 'Only General Admin can reverse stock transfers.',
        variant: 'error',
      });
      return;
    }

    if (trn.status !== 'completed') {
      showAlert({
        title: isAr ? 'الإذن غير مكتمل' : 'Transfer Not Completed',
        message: isAr ? 'هذا التحويل غير مكتمل ولم تؤثر حركاته على أرصدة المخازن بعد.' : 'This transfer is not completed and has not affected live stock.',
        variant: 'warning',
      });
      return;
    }

    const blockers = checkTransferDownstreamDependencies(trn);
    if (blockers.length > 0) {
      setAdminDependencyModal({
        open: true,
        transfer: trn,
        blockers,
        details: isAr
          ? `لا يمكن إلغاء التحويل (${trn.id}) لوجود (${blockers.length}) حركة مرتبطة لاحقة استهلكت أو رحلت خامات هذا الإذن من مخزن الاستلام. وفق مبدأ الأسبقية الصارمة (LIFO)، يجب إلغاء الحركات اللاحقة أولاً.`
          : `Cannot reverse Transfer (${trn.id}) because (${blockers.length}) downstream transaction(s) have consumed or moved its materials from the target warehouse. Following strict LIFO policy, downstream transactions must be reversed first.`,
      });
      return;
    }

    const linesToRollback = (trn.lines || []).map((l) => ({
      itemId: l.itemId,
      variantCode: l.variantCode,
      nameAr: l.nameAr || l.code || l.itemId,
      nameEn: l.nameEn || '',
      lotNumber: l.lotNumber || '—',
      qtySmallUnits: Number(l.qtySmallUnits || 0),
      smallUnit: l.smallUnit || 'وحدة',
    }));

    setAdminReversalModal({
      open: true,
      transfer: trn,
      reason: '',
      isSubmitting: false,
      linesToRollback,
    });
  };

  // Execute Atomic Admin Transfer Reversal
  const handleExecuteAdminTransferReversal = async () => {
    const { transfer, reason } = adminReversalModal;
    if (!reason || reason.trim().length < 5) {
      showAlert({
        title: isAr ? 'سبب الإلغاء مطلوب' : 'Reason Required',
        message: isAr ? 'يرجى كتابة سبب واضح للإلغاء للتوثيق المالي والمخزني (5 أحرف على الأقل).' : 'Please enter a clear justification reason (at least 5 characters).',
        variant: 'warning',
      });
      return;
    }

    setAdminReversalModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const nowIso = new Date().toISOString();
      const trnRef = doc(db, 'stock_transfers', transfer.id);
      const existingAudit = Array.isArray(transfer.auditTrail) ? transfer.auditTrail : [];

      const newAudit = {
        version: '1.2',
        action: 'admin_transfer_reversed',
        status: 'reversed',
        performedBy: currentUserName,
        timestamp: nowIso,
        noteAr: `تم الإلغاء الإداري للتحويل واسترجاع الرصيد للمخزن الصارف: ${reason.trim()}`,
        noteEn: `Admin reversal: ${reason.trim()}`,
      };

      await setDoc(
        trnRef,
        {
          status: 'reversed',
          isReversed: true,
          reversedBy: currentUserName,
          reversedById: currentUserId,
          reversedAt: nowIso,
          reversalReason: reason.trim(),
          auditTrail: [newAudit, ...existingAudit].slice(0, 40),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setAdminReversalModal({ open: false, transfer: null, reason: '', isSubmitting: false, linesToRollback: [] });
      toast.success(
        isAr ? `تم إلغاء التحويل (${transfer.id}) واسترجاع الأرصدة بنجاح.` : `Transfer (${transfer.id}) reversed successfully.`,
        isAr ? 'إلغاء إداري معتمد' : 'Reversal Completed'
      );
    } catch (err) {
      console.error('Error reversing transfer:', err);
      toast.error(isAr ? 'حدث خطأ أثناء إلغاء التحويل.' : 'Failed to reverse transfer.');
      setAdminReversalModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Filtered List (Strictly Material Transfers - Finished Goods are isolated in #fg_inwards)
  const filteredTransfers = useMemo(() => {
    return transfers.filter((trn) => {
      // Exclude Finished Goods transfers from #transfers tab
      if (isFinishedGoodsTransfer(trn)) return false;

      const matchesSearch =
        trn.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trn.productionOrderRef?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trn.issuedBy?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trn.lines?.some((l) => l.nameAr?.includes(searchQuery) || l.code?.includes(searchQuery));

      const matchesStatus =
        statusFilter === 'all'
          ? (trn.status !== 'reversed' && !trn.isReversed)
          : statusFilter === 'reversed'
          ? (trn.status === 'reversed' || trn.isReversed)
          : (trn.status === statusFilter && !trn.isReversed);

      const matchesSource = sourceWhFilter === 'all' || trn.sourceWarehouse === sourceWhFilter;
      const matchesTarget = targetWhFilter === 'all' || trn.targetWarehouse === targetWhFilter;

      return matchesSearch && matchesStatus && matchesSource && matchesTarget;
    });
  }, [transfers, searchQuery, statusFilter, sourceWhFilter, targetWhFilter, warehouses]);

  const { verifierId: previewVerifierId, verifierRoleDesc: previewVerifierRoleDesc } = getRequiredVerifierInfo(currentUserId);

  return (
    <div className="space-y-4">
      {/* Dynamic Scoped Print CSS Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-trn-slip, #printable-trn-slip * {
            visibility: visible !important;
          }
          #printable-trn-slip {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 18px 24px !important;
            background: white !important;
            color: black !important;
            font-size: 11px !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>

      {/* Full-Screen Loading Feedback */}
      {isSavingTransfer && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري معالجة وتحديث حركات التحويل المخزني...' : 'Processing and Syncing Stock Transfer...'}
        />
      )}

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>{isAr ? 'إذن تحويل مخزني جديد (TRN)' : 'New Transfer Order (TRN)'}</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={isAr ? 'بحث برقم الإذن، أمر التشغيل، أو الصنف...' : 'Search TRN #, PO Ref, Item...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="pending_admin_verification">{isAr ? '🟣 معلق (بانتظار اعتماد المسؤول العام)' : 'Pending Admin (Custom Date)'}</option>
            <option value="pending_custodian_verification">{isAr ? '🟡 بانتظار اعتماد مسؤول المستودع' : 'Pending Custodian'}</option>
            <option value="completed">{isAr ? '🟢 مكتمل ومستلم' : 'Completed'}</option>
            <option value="reversed">{isAr ? '🟣 ملغي ومسترجع إدارياً (Reversed)' : 'Reversed (Admin)'}</option>
            <option value="rejected">{isAr ? '🔴 مرفوض' : 'Rejected'}</option>
          </select>
        </div>

        <div>
          <select
            value={sourceWhFilter}
            onChange={(e) => setSourceWhFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? 'من: جميع المخازن' : 'From: All Warehouses'}</option>
            {warehouses.map((w) => (
              <option key={w.id || w.code} value={w.id || w.code}>
                {w.code ? `${w.code} - ` : ''}{isAr ? w.nameAr : w.nameEn || w.nameAr}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={targetWhFilter}
            onChange={(e) => setTargetWhFilter(e.target.value)}
            className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? 'إلى: جميع المخازن' : 'To: All Warehouses'}</option>
            {warehouses.map((w) => (
              <option key={w.id || w.code} value={w.id || w.code}>
                {w.code ? `${w.code} - ` : ''}{isAr ? w.nameAr : w.nameEn || w.nameAr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Transfers Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[340px]">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <th className="p-3 text-start">{isAr ? 'رقم الإذن والتاريخ' : 'TRN # & Date'}</th>
              <th className="p-3 text-start">{isAr ? 'مسار التحويل (من ← إلى)' : 'Route (From ➔ To)'}</th>
              <th className="p-3 text-start">{isAr ? 'البنود المحولة' : 'Transferred Items'}</th>
              <th className="p-3 text-start">{isAr ? 'المسؤول والمحرر' : 'Handler'}</th>
              <th className="p-3 text-start">{isAr ? 'حالة الاعتماد والعهدة' : 'Custody & Status'}</th>
              <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-12 text-center">
                  <PeacockLoader size="lg" text={isAr ? 'جاري تحميل سجل التحويلات المخزنية...' : 'Loading Stock Transfers...'} />
                </td>
              </tr>
            ) : filteredTransfers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد أذون تحويل مطابقة للبحث المحدد.' : 'No stock transfers found.'}
                </td>
              </tr>
            ) : (
              filteredTransfers.map((trn) => {
                const isPendingAdmin = trn.status === 'pending_admin_verification';
                const isPendingCustodian = trn.status === 'pending_custodian_verification';
                const isCompleted = trn.status === 'completed';
                const isRejected = trn.status === 'rejected';
                const isReversed = trn.status === 'reversed' || trn.isReversed;

                const srcObj = getWarehouseObj(trn.sourceWarehouse);
                const tgtObj = getWarehouseObj(trn.targetWarehouse);

                // Verification Authority Rule:
                // 1. General Admin can verify ANY transfer (Override capability)
                // 2. The specifically assigned requiredVerifierId can verify
                const canVerifyThisTrn =
                  isGeneralAdmin ||
                  (isPendingCustodian && trn.requiredVerifierId && currentUserId === trn.requiredVerifierId);

                return (
                  <tr key={trn.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 align-top">
                      <span className="font-mono font-extrabold text-indigo-700 block text-xs">{trn.id}</span>
                      <span className="text-[11px] text-slate-500 font-medium">{trn.transferDate}</span>
                      {trn.isCustomDate && (
                        <span className="text-[9px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded block mt-0.5 w-max">
                          {isAr ? 'تاريخ مخصص' : 'Custom Date'}
                        </span>
                      )}
                      {trn.productionOrderRef && (
                        <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-mono block mt-1 w-max">
                          {isAr ? 'تشغيل:' : 'Order:'} {trn.productionOrderRef}
                        </span>
                      )}
                    </td>

                    <td className="p-3 align-top">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: srcObj.color || '#0d6cba' }}
                          />
                          <span className="text-slate-400 text-[10px]">{isAr ? 'من:' : 'From:'}</span>
                          <span>{getWarehouseName(trn.sourceWarehouse)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-indigo-800 font-bold">
                          <ArrowRight className="h-3 w-3 text-indigo-500 rtl:rotate-180" />
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: tgtObj.color || '#0d6cba' }}
                          />
                          <span className="text-slate-400 text-[10px]">{isAr ? 'إلى:' : 'To:'}</span>
                          <span>{getWarehouseName(trn.targetWarehouse)}</span>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 align-top">
                      <div className="space-y-1.5 max-w-xs">
                        {(trn.lines || []).map((l, idx) => (
                          <div key={idx} className="text-[11px] text-slate-800 border-b border-slate-100 last:border-0 pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold truncate" title={l.nameAr}>
                                {l.nameAr}
                              </span>
                              <span className="font-mono font-bold text-slate-900 shrink-0">
                                {Number(l.qtySmallUnits).toLocaleString()} {l.smallUnit}
                              </span>
                            </div>
                            {l.lotNumber && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Tag className="h-3 w-3 text-indigo-600 shrink-0" />
                                <span className="font-mono font-bold text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                  Lot: {l.lotNumber}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="p-3 align-top">
                      <span className="font-bold text-slate-800 block text-[11px]">{trn.issuedBy}</span>
                      {trn.verifiedBy && (
                        <span className="text-[10px] text-emerald-700 block mt-0.5 font-medium">
                          {isAr ? 'اعتماد:' : 'Verified:'} {trn.verifiedBy}
                        </span>
                      )}
                    </td>

                    <td className="p-3 align-top">
                      {isPendingAdmin && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-900 border border-purple-300 animate-pulse">
                          <ShieldAlert className="h-3 w-3 text-purple-700" />
                          <span>{isAr ? 'معلق: بانتظار اعتماد المسؤول العام' : 'Pending Admin Verification'}</span>
                        </span>
                      )}
                      {isPendingCustodian && (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-900 border border-amber-300 animate-pulse">
                            <Clock className="h-3 w-3 text-amber-600" />
                            <span>{isAr ? 'بانتظار اعتماد أمين العهدة' : 'Awaiting Custodian'}</span>
                          </span>
                          {trn.requiredVerifierId && (
                            <span className="text-[10px] text-slate-500 block mt-1 font-semibold">
                              {isAr ? 'المسؤول:' : 'Assigned:'} {getUserName(trn.requiredVerifierId)}
                            </span>
                          )}
                        </div>
                      )}
                      {isCompleted && !isReversed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{isAr ? 'مكتمل ومستلم' : 'Completed'}</span>
                        </span>
                      )}
                      {isReversed && (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-800 border border-purple-300">
                            <RotateCcw className="h-3 w-3 text-purple-600" />
                            <span>{isAr ? 'ملغي ومسترجع إدارياً' : 'Reversed (Admin)'}</span>
                          </span>
                          {trn.reversalReason && (
                            <span className="text-[9px] text-purple-700 block mt-1 font-medium truncate max-w-xs" title={trn.reversalReason}>
                              {trn.reversalReason}
                            </span>
                          )}
                        </div>
                      )}
                      {isRejected && (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-800 border border-rose-300">
                            <XCircle className="h-3 w-3" />
                            <span>{isAr ? 'مرفوض' : 'Rejected'}</span>
                          </span>
                          {trn.rejectionReason && (
                            <span className="text-[9px] text-rose-600 block mt-1 font-medium truncate max-w-xs" title={trn.rejectionReason}>
                              {trn.rejectionReason}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="p-3 align-top text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canVerifyThisTrn && (isPendingAdmin || isPendingCustodian) && (
                          <>
                            <button
                              onClick={() => setVerifyModalTransfer(trn)}
                              className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition cursor-pointer border border-emerald-200 shadow-2xs"
                              title={
                                isGeneralAdmin && trn.requiredVerifierId && currentUserId !== trn.requiredVerifierId
                                  ? (isAr ? 'اعتماد كمسؤول عام (تجاوز)' : 'Admin Override Verification')
                                  : (isAr ? 'اعتماد واستلام التحويل' : 'Verify Transfer')
                              }
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setRejectModalTransfer(trn);
                                setRejectionReason('');
                              }}
                              className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 rounded-lg transition cursor-pointer border border-rose-200"
                              title={isAr ? 'رفض التحويل' : 'Reject Transfer'}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}

                        {/* General Admin Interlinked Transfer Reversal Action */}
                        {isGeneralAdmin && isCompleted && !isReversed && (
                          <button
                            type="button"
                            onClick={() => handleOpenAdminTransferReversal(trn)}
                            className="p-1.5 text-purple-700 hover:text-white hover:bg-purple-700 rounded-lg transition cursor-pointer border border-purple-300 bg-purple-50 shadow-2xs"
                            title={isAr ? 'إلغاء وعكس التحويل إدارياً (General Admin)' : 'Admin Reversal (General Admin)'}
                          >
                            <ShieldAlert className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          onClick={() => setViewingTransfer(trn)}
                          className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'معاينة الإذن' : 'View Slip'}
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => setAuditData(trn)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title={isAr ? 'سجل التدقيق والاعتمادات' : 'Audit Trail'}
                        >
                          <History className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleTriggerPrint(trn)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title={isAr ? 'طباعة إذن التحويل' : 'Print Voucher'}
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE TRANSFER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {isAr ? 'تحرير إذن تحويل مخزني جديد (TRN)' : 'Create Stock Transfer (TRN)'}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isAr ? 'نقل الخامات ومستلزمات الإنتاج مع التحقق من عهدة المستودعات' : 'Inter-warehouse movement with designated custodian verification'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-4">
              {/* Dynamic Warehouse Route Selector with Visual Color Cards & Assigned Custodians */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                {/* Source WH Card */}
                <div className="md:col-span-5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-[11px] font-bold text-slate-700">
                      {isAr ? 'المخزن المنصرف منه (المصدر): *' : 'Source Warehouse: *'}
                    </label>
                    {sourceCustodianId && (
                      <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                        <User className="h-3 w-3 text-indigo-600" />
                        <span>{getUserName(sourceCustodianId)}</span>
                      </span>
                    )}
                  </div>
                  <div
                    className="p-3 rounded-xl border-2 transition-all shadow-2xs space-y-2 bg-white"
                    style={{ borderColor: sourceWhObj.color || '#0d6cba' }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1.5 rounded-lg text-white"
                        style={{ backgroundColor: sourceWhObj.color || '#0d6cba' }}
                      >
                        {renderWarehouseIcon(sourceWhObj, 'h-4 w-4')}
                      </div>
                      <select
                        value={sourceWarehouse}
                        onChange={(e) => setSourceWarehouse(e.target.value)}
                        className="w-full p-1 border-0 font-extrabold text-slate-900 text-xs focus:ring-0 focus:outline-none cursor-pointer"
                        required
                      >
                        {warehouses.map((w) => (
                          <option key={w.id || w.code} value={w.id || w.code}>
                            {w.code ? `${w.code} - ` : ''}{isAr ? w.nameAr : w.nameEn || w.nameAr}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Arrow indicator */}
                <div className="md:col-span-2 flex items-center justify-center pt-5">
                  <div className="p-2.5 rounded-full bg-slate-200 text-slate-700 shadow-inner">
                    <ArrowRight className="h-5 w-5 rtl:rotate-180 text-indigo-600" />
                  </div>
                </div>

                {/* Target WH Card */}
                <div className="md:col-span-5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-[11px] font-bold text-slate-700">
                      {isAr ? 'المخزن المحول إليه (الوجهة): *' : 'Destination Warehouse: *'}
                    </label>
                    {targetCustodianId && (
                      <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                        <User className="h-3 w-3 text-indigo-600" />
                        <span>{getUserName(targetCustodianId)}</span>
                      </span>
                    )}
                  </div>
                  <div
                    className="p-3 rounded-xl border-2 transition-all shadow-2xs space-y-2 bg-white"
                    style={{ borderColor: targetWhObj.color || '#0d6cba' }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1.5 rounded-lg text-white"
                        style={{ backgroundColor: targetWhObj.color || '#0d6cba' }}
                      >
                        {renderWarehouseIcon(targetWhObj, 'h-4 w-4')}
                      </div>
                      <select
                        value={targetWarehouse}
                        onChange={(e) => setTargetWarehouse(e.target.value)}
                        className="w-full p-1 border-0 font-extrabold text-slate-900 text-xs focus:ring-0 focus:outline-none cursor-pointer"
                        required
                      >
                        {warehouses.map((w) => (
                          <option key={w.id || w.code} value={w.id || w.code}>
                            {w.code ? `${w.code} - ` : ''}{isAr ? w.nameAr : w.nameEn || w.nameAr}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transfer Date Input */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'تاريخ التحويل / الصرف:' : 'Transfer Date:'}
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* Non-Today Date Verification Notice */}
              {isDateDifferentFromToday && (
                <div className="p-3.5 bg-purple-50 rounded-2xl border-2 border-purple-300 flex items-start gap-3 text-xs text-purple-950 animate-in fade-in">
                  <ShieldAlert className="h-5 w-5 text-purple-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-purple-900 text-xs mb-0.5">
                      {isAr ? 'تنبيه: تاريخ التحويل يختلف عن تاريخ اليوم' : 'Notice: Custom Transfer Date Detected'}
                    </span>
                    <span className="leading-relaxed">
                      {isAr
                        ? `نظراً لأن تاريخ التحويل المحدد (${transferDate}) يختلف عن تاريخ اليوم (${todayIso})، سيتم تعليق الإذن ووضعه في حالة "بانتظار اعتماد المسؤول العام" (General Admin Approval) حصراً.`
                        : `Because the transfer date (${transferDate}) differs from today (${todayIso}), this document will be placed on hold under "Pending General Admin Verification" exclusively.`}
                    </span>
                  </div>
                </div>
              )}

              {/* Custodian Verification Notice (if date is today and verifier is required) */}
              {!isDateDifferentFromToday && previewVerifierId && !isGeneralAdmin && (
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
                  <UserCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      {isAr ? `يتطلب اعتماد أمين العهدة (${previewVerifierRoleDesc}):` : 'Custodian Verification Required:'}
                    </span>
                    <span>
                      {isAr
                        ? `سينتقل هذا الإذن إلى حالة "بانتظار اعتماد: ${getUserName(previewVerifierId)}" لفحص وعد الكميات قبل تفعيل نقل الرصيد المخزني.`
                        : `This transfer will require verification by ${getUserName(previewVerifierId)} before updating live balances.`}
                    </span>
                  </div>
                </div>
              )}

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold text-slate-900">
                    {isAr ? 'الأصناف والخامات المحولة:' : 'Transfer Items & Quantities:'}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إضافة خامة / صنف' : 'Add Item'}</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto pe-1">
                  {transferLines.map((line, idx) => {
                    const variations = getItemVariations(line.itemId);
                    const { lots: activeLots, source: stockOriginSource } = getAvailableLotsForVariant(sourceWarehouse, line.itemId, line.variantCode);
                    const selectedLotObj = activeLots.find((l) => l.lotNumber === line.lotNumber);
                    const availableStock = selectedLotObj ? selectedLotObj.availableQty : getWarehouseStock(sourceWarehouse, line.itemId, line.variantCode);

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {/* Item Master Select */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              {isAr ? 'الخامة / الصنف: *' : 'Item: *'}
                            </label>
                            <SearchableSelect
                              value={line.itemId}
                              onChange={(val) => handleItemSelect(idx, val)}
                              options={itemsMaster
                                .filter((item) => item.skipOrdinaryStockTransfer !== true)
                                .map((item) => ({
                                  value: item.code || item.id,
                                  label: item.nameAr,
                                  sublabel: item.code || item.id,
                                }))}
                              placeholder={isAr ? '-- اختر الخامة --' : '-- Select Item --'}
                              isAr={isAr}
                              required
                            />
                          </div>

                          {/* Variation Select (Explicit selection mandatory) */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              {isAr ? 'التنوع والمواصفة: *' : 'Variant / Specs: *'}
                            </label>
                            <VariantComboBox
                              variations={variations}
                              value={line.variantCode}
                              disabled={!line.itemId}
                              onChange={(val) => handleVariantSelect(idx, val)}
                              placeholder={isAr ? '-- اختر التنوع والمواصفة --' : '-- Select Variant --'}
                              returnKey="variantCode"
                              isAr={isAr}
                              size="sm"
                              className={line.itemId && !line.variantCode ? 'border-amber-400 bg-amber-50/40 rounded-xl' : ''}
                            />
                          </div>

                          {/* Source Available Stock Badge with Origin Indicator */}
                          <div className="flex flex-col justify-center">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-bold text-slate-500">
                                {isAr ? 'الرصيد المتاح في مخزن الصرف:' : 'Available in Source WH:'}
                              </span>
                              {line.variantCode && (
                                <StockOriginBadge source={stockOriginSource} isAr={isAr} />
                              )}
                            </div>
                            <span className="text-xs font-mono font-extrabold text-indigo-700">
                              {line.variantCode ? `${availableStock.toLocaleString()} ${line.smallUnit}` : '—'}
                            </span>
                          </div>
                        </div>

                        {/* Quantities & Lot Grid (12-Col Responsive: Qty Small, Qty Large, Lot FIFO, Trash) */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-slate-200/60 items-end">
                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              {isAr ? `الكمية بالوحدة الصغرى (${line.smallUnit}): *` : `Qty (${line.smallUnit}): *`}
                            </label>
                            <input
                              type="number"
                              min={line.allowFractions ? "0.001" : "1"}
                              step={line.allowFractions ? "0.001" : "1"}
                              placeholder="0"
                              value={line.qtySmallUnits}
                              onChange={(e) => handleQtyChange(idx, 'qtySmallUnits', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              required
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              {isAr ? `الكمية بالوحدة الكبرى (${line.largeUnitName}):` : `Large Unit Qty:`}
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0"
                              value={line.qtyLargeUnits}
                              onChange={(e) => handleQtyChange(idx, 'qtyLargeUnits', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>

                          {/* Lot Number Dropdown with FIFO Auto-Suggestion */}
                          <div className="sm:col-span-5">
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5 flex items-center justify-between">
                              <span>{isAr ? 'رقم اللوط / التشغيلة (FIFO):' : 'Lot Number (FIFO):'}</span>
                              {activeLots.length > 0 && line.lotNumber === activeLots[0].lotNumber && (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">
                                  {isAr ? '✓ اقتراح FIFO' : '✓ FIFO Pick'}
                                </span>
                              )}
                            </label>
                            <select
                              value={line.lotNumber}
                              disabled={!line.variantCode}
                              onChange={(e) => handleLotSelect(idx, e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
                            >
                              <option value="">{isAr ? '-- اختر رقم اللوط --' : '-- Select Lot --'}</option>
                              {activeLots.map((l, lIdx) => (
                                <option key={l.lotNumber} value={l.lotNumber}>
                                  {lIdx === 0 ? '⭐ FIFO: ' : ''}{formatLotLabel(l, isAr)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-1 flex justify-end pb-0.5">
                            <button
                              type="button"
                              disabled={transferLines.length === 1}
                              onClick={() => handleRemoveLine(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-30 cursor-pointer"
                              title={isAr ? 'حذف السطر' : 'Remove Line'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Interactive Lot Metadata Visual Badge */}
                        {line.lotNumber && (
                          <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded-xl text-[11px] space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-indigo-700 shrink-0" />
                                <span className="font-bold text-indigo-950">
                                  {isAr ? 'بيانات اللوط (Metadata):' : 'Lot Metadata:'}
                                </span>
                                <span className="font-mono font-extrabold text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                                  {line.lotNumber}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-slate-700">
                                {isAr ? 'تكلفة الوحدة الواردة:' : 'Inward Cost:'} <strong className="text-emerald-700">{line.unitPrice || 0} {line.currency || 'EGP'}</strong>
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] text-slate-600 pt-1 border-t border-indigo-100">
                              {line.supplierName && (
                                <div>
                                  <span className="text-slate-400 block">{isAr ? 'المورد:' : 'Supplier:'}</span>
                                  <span className="font-semibold text-slate-800 truncate block">{line.supplierName}</span>
                                </div>
                              )}
                              {line.receivedDate && (
                                <div>
                                  <span className="text-slate-400 block">{isAr ? 'تاريخ الورود:' : 'Inward Date:'}</span>
                                  <span className="font-mono font-semibold text-slate-800">{line.receivedDate}</span>
                                </div>
                              )}
                              {line.supplierBatchNo && (
                                <div>
                                  <span className="text-slate-400 block">{isAr ? 'تشغيلة المورد:' : 'Supplier Batch:'}</span>
                                  <span className="font-mono font-semibold text-slate-800">{line.supplierBatchNo}</span>
                                </div>
                              )}
                              {line.expiryDate && (
                                <div>
                                  <span className="text-slate-400 block">{isAr ? 'الصلاحية:' : 'Expiry:'}</span>
                                  <span className="font-mono font-semibold text-slate-800">{line.expiryDate}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Production Order Ref & Remarks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم أمر التشغيل / أمر الإنتاج (إن وجد):' : 'Production Order Reference:'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MO-202608-01"
                    value={productionOrderRef}
                    onChange={(e) => setProductionOrderRef(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'ملاحظات وتوجيهات النقل:' : 'Transfer Remarks & Notes:'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'ملاحظات تسليم الوردية أو أمر الصرف...' : 'Handover remarks...'}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSavingTransfer}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isAr ? 'حفظ وتأكيد إذن التحويل' : 'Submit Transfer Order'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VERIFY / APPROVE TRANSFER MODAL */}
      {verifyModalTransfer && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {verifyModalTransfer.status === 'pending_admin_verification'
                    ? (isAr ? 'اعتماد المسؤول العام للتحويل (تاريخ مخصص)' : 'General Admin Transfer Approval')
                    : (isAr ? 'اعتماد واستلام التحويل المخزني' : 'Verify & Complete Transfer')}
                </h3>
                <span className="text-xs text-slate-500 font-mono">{verifyModalTransfer.id}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isAr
                ? `هل قمت بفحص ومطابقة بيانات التحويل من "${getWarehouseName(verifyModalTransfer.sourceWarehouse)}" إلى "${getWarehouseName(verifyModalTransfer.targetWarehouse)}"، وتأكيد تفعيل حركة المخزن؟`
                : `Have you verified the transfer details from ${getWarehouseName(verifyModalTransfer.sourceWarehouse)} to ${getWarehouseName(verifyModalTransfer.targetWarehouse)}?`}
            </p>

            {isGeneralAdmin && verifyModalTransfer.requiredVerifierId && currentUserId !== verifyModalTransfer.requiredVerifierId && (
              <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-200 text-xs text-indigo-900 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>
                  {isAr
                    ? `إجراء اعتماد استثنائي بصلاحية المسؤول العام نيابة عن (${getUserName(verifyModalTransfer.requiredVerifierId)})`
                    : `General Admin Override: Approving on behalf of ${getUserName(verifyModalTransfer.requiredVerifierId)}`}
                </span>
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              {(verifyModalTransfer.lines || []).map((l, idx) => (
                <div key={idx} className="border-b border-slate-200/60 last:border-0 pb-1">
                  <div className="flex justify-between font-medium text-slate-800">
                    <span className="font-bold">{l.nameAr} ({l.code || l.variantCode})</span>
                    <span className="font-mono font-bold text-slate-900">{Number(l.qtySmallUnits).toLocaleString()} {l.smallUnit}</span>
                  </div>
                  {l.lotNumber && (
                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-indigo-700 mt-0.5">
                      <Tag className="h-3 w-3 text-indigo-600" />
                      <span>Lot: {l.lotNumber} {l.unitPrice ? `• ${l.unitPrice} ${l.currency || 'EGP'}` : ''}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setVerifyModalTransfer(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleVerifyTransfer}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{isAr ? 'تأكيد الاعتماد ونقل الرصيد' : 'Confirm & Complete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT TRANSFER MODAL */}
      {rejectModalTransfer && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl">
                <XCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {isAr ? 'رفض طلب التحويل المخزني' : 'Reject Stock Transfer'}
                </h3>
                <span className="text-xs text-slate-500 font-mono">{rejectModalTransfer.id}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'سبب الرفض (إلزامي): *' : 'Reason for Rejection: *'}
              </label>
              <textarea
                rows={3}
                placeholder={isAr ? 'مثال: وجود عجز في الكمية، تلف أثناء النقل، مواصفة غير مطابقة...' : 'e.g. Quantity discrepancy, damaged in transit...'}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full p-2 bg-white border border-rose-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectModalTransfer(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={handleRejectTransfer}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
              >
                {isAr ? 'تأكيد الرفض' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW TRANSFER DETAILS MODAL */}
      {viewingTransfer && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{isAr ? 'تفاصيل إذن التحويل' : 'Transfer Details'}</span>
                  <span className="font-mono text-indigo-700 font-extrabold">{viewingTransfer.id}</span>
                </h3>
                <span className="text-xs text-slate-500">{viewingTransfer.transferDate}</span>
              </div>
              <button
                onClick={() => setViewingTransfer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block">{isAr ? 'المخزن المصدر:' : 'Source WH:'}</span>
                <span className="font-bold text-slate-900">{getWarehouseName(viewingTransfer.sourceWarehouse)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isAr ? 'المخزن المستلم:' : 'Target WH:'}</span>
                <span className="font-bold text-slate-900">{getWarehouseName(viewingTransfer.targetWarehouse)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isAr ? 'المسؤول / محرر الإذن:' : 'Issued By:'}</span>
                <span className="font-bold text-slate-900">{viewingTransfer.issuedBy}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isAr ? 'أمر التشغيل / الإنتاج:' : 'Production Order:'}</span>
                <span className="font-mono font-bold text-slate-900">{viewingTransfer.productionOrderRef || '-'}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-2 text-start">#</th>
                    <th className="p-2 text-start">{isAr ? 'الصنف والتنوع' : 'Item & Variant'}</th>
                    <th className="p-2 text-center">{isAr ? 'الكمية المحولة' : 'Transferred Qty'}</th>
                    <th className="p-2 text-start">{isAr ? 'رقم اللوط / التشغيلة' : 'Lot / Batch #'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(viewingTransfer.lines || []).map((l, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-2">
                        <span className="font-bold text-slate-900 block">{l.nameAr}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{l.code}</span>
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-slate-900">
                        {Number(l.qtySmallUnits).toLocaleString()} {l.smallUnit}
                        {l.qtyLargeUnits > 0 && (
                          <span className="text-[10px] text-slate-400 block font-normal">
                            ({l.qtyLargeUnits} {l.largeUnitName})
                          </span>
                        )}
                      </td>
                      <td className="p-2 font-mono font-bold text-indigo-700">{l.lotNumber || l.batchNumber || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingTransfer(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL MODAL */}
      {auditData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'سجل التدقيق والحركات' : 'Audit Trail'}</span>
                <span className="font-mono text-indigo-700 font-extrabold">{auditData.id}</span>
              </h3>
              <button onClick={() => setAuditData(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto pe-1">
              {(auditData.auditTrail || []).map((entry, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-indigo-800">{isAr ? entry.noteAr : entry.noteEn || entry.noteAr}</span>
                    <span className="text-[10px] text-slate-400 font-mono">v{entry.version}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{isAr ? 'بواسطة:' : 'By:'} {entry.performedBy}</span>
                    <span>{new Date(entry.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setAuditData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE EXECUTIVE TRANSFER SLIP (TRN) */}
      {printData && (
        <div id="printable-trn-slip" className="fixed inset-0 bg-white p-8 z-[99999] hidden print:block text-slate-800">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex items-center gap-4">
              <img
                src="/logo.svg"
                alt="Al Tawoos Logo"
                className="h-14 w-auto max-w-[180px] object-contain"
              />
              <div>
                <h1 className="text-base font-extrabold text-slate-900 leading-tight">
                  {printLang === 'ar' ? 'شركة الطاووس لتعبئة و تجارة المواد الغذائية' : 'Al Tawoos for packing and trading food goods'}
                </h1>
                <h2 className="text-xs text-slate-700 font-bold mt-1">
                  {printLang === 'ar' ? 'إذن تحويل وصرف مخزني داخلي (TRN)' : 'Internal Stock Transfer Voucher (TRN)'}
                </h2>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {printLang === 'ar' ? 'المنطقة الصناعية، السادس من أكتوبر، الجيزة، مصر' : '6th of October Industrial Zone, Giza, Egypt'}
                </p>
              </div>
            </div>
            <div className="text-end">
              <span className="text-base font-mono font-extrabold text-slate-900 block">{printData.id}</span>
              <span className="text-xs font-bold text-slate-600 block">
                {printLang === 'ar' ? `(الإصدار ${printData.version || '1.0'})` : `(Rev ${printData.version || '1.0'})`}
              </span>
              <span className="text-xs text-slate-500 mt-0.5 block">
                {printLang === 'ar' ? 'تاريخ التحويل:' : 'Date:'} {printData.transferDate}
              </span>
              {printData.productionOrderRef && (
                <span className="text-xs font-mono font-semibold text-indigo-700 block">
                  MO Ref: {printData.productionOrderRef}
                </span>
              )}
            </div>
          </div>

          {/* Route Card */}
          <div className="grid grid-cols-2 gap-4 p-3.5 mb-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">{printLang === 'ar' ? 'المخزن المنصرف منه (المصدر):' : 'Source WH:'}</span>
              <span className="font-bold text-slate-900 text-sm block">{getWarehouseName(printData.sourceWarehouse)}</span>
              <span className="text-slate-600 block mt-0.5">
                {printLang === 'ar' ? 'المسؤول / محرر الإذن:' : 'Issued By:'} {printData.issuedBy}
              </span>
            </div>
            <div className="text-end">
              <span className="text-slate-400 block mb-0.5">{printLang === 'ar' ? 'المخزن المحول إليه (الوجهة):' : 'Destination WH:'}</span>
              <span className="font-bold text-slate-900 text-sm block">{getWarehouseName(printData.targetWarehouse)}</span>
              {printData.verifiedBy && (
                <span className="text-emerald-800 font-bold block mt-0.5">
                  {printLang === 'ar' ? 'اعتماد واستلام أمين العهدة:' : 'Verified By:'} {printData.verifiedBy}
                </span>
              )}
            </div>
          </div>

          {/* Lines Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2.5 text-start border-e border-slate-200">{printLang === 'ar' ? 'م' : 'No.'}</th>
                  <th className="p-2.5 text-start border-e border-slate-200">{printLang === 'ar' ? 'الكود والتنوع' : 'Code & Var'}</th>
                  <th className="p-2.5 text-start border-e border-slate-200">{printLang === 'ar' ? 'اسم الخامة والمواصفات والشدة' : 'Description & Specs'}</th>
                  <th className="p-2.5 text-center border-e border-slate-200">{printLang === 'ar' ? 'الكمية المحولة' : 'Transferred Qty'}</th>
                  <th className="p-2.5 text-start">{printLang === 'ar' ? 'رقم التشغيلة' : 'Batch #'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(printData.lines || []).map((line, idx) => (
                  <tr key={idx}>
                    <td className="p-2.5 font-mono border-e border-slate-100 text-slate-500">{idx + 1}</td>
                    <td className="p-2.5 font-mono font-bold text-slate-800 border-e border-slate-100">{line.code || line.variantCode || line.itemId}</td>
                    <td className="p-2.5 border-e border-slate-100">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900">{line.nameAr}</span>
                        {(() => {
                          const itemDoc = itemsMaster.find(i => i.code === line.itemId || i.id === line.itemId);
                          const vDoc = itemDoc?.variations?.find(v => v.variantCode === line.variantCode || v.suffix === line.variantCode || (v.suffix && line.variantCode?.endsWith(`-${v.suffix}`)));
                          return vDoc ? <VariantIdentifierChip variant={vDoc} size="sm" /> : null;
                        })()}
                      </div>
                      {line.specs && <div className="text-[10px] text-slate-500 mt-0.5">{line.specs}</div>}
                      {line.packagingRatio > 1 && (
                        <div className="text-[10px] text-indigo-800 font-medium mt-0.5">
                          {printLang === 'ar' ? `شدة التعبئة: ${line.packagingRatio} ${line.smallUnit} / ${line.largeUnitName}` : `Pack: ${line.packagingRatio} ${line.smallUnit} / ${line.largeUnitName}`}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-slate-900 border-e border-slate-100">
                      {Number(line.qtySmallUnits).toLocaleString()} {line.smallUnit}
                      {line.qtyLargeUnits > 0 && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          ({line.qtyLargeUnits} {line.largeUnitName})
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 font-mono font-bold text-indigo-900">{line.lotNumber || line.batchNumber || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Remarks Box */}
          {printData.notes && (
            <div className="p-3 mb-4 rounded-xl border border-slate-200 bg-slate-50/30 text-xs">
              <span className="font-bold text-slate-700 block mb-0.5">{printLang === 'ar' ? 'ملاحظات وتوجيهات النقل:' : 'Remarks:'}</span>
              <span className="text-slate-600 whitespace-pre-wrap">{printData.notes}</span>
            </div>
          )}

          {/* 3 Signatures Footer */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200 text-xs text-center">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1">
                {printLang === 'ar' ? 'المسؤول المنصرف منه' : 'Issuing Supervisor'}
              </span>
              <span className="font-bold text-slate-900 block">{printData.issuedBy}</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1">
                {printLang === 'ar' ? 'أمين المخزن المستلم / المعتمد' : 'Verifying Custodian'}
              </span>
              <span className="font-bold text-slate-900 block">{printData.verifiedBy || '........................'}</span>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/40">
              <span className="text-slate-400 block mb-1">
                {printLang === 'ar' ? 'مسؤول النقل الداخلي' : 'Internal Handler'}
              </span>
              <span className="font-bold text-slate-900 block">........................</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GENERAL ADMIN INTERLINKED TRANSFER REVERSAL MODALS (Phase 3)              */}
      {/* ========================================================================= */}

      {/* 1. DEPENDENCY BLOCKER MODAL */}
      {adminDependencyModal.open && adminDependencyModal.transfer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border-2 border-rose-400 space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-2xl">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                    {isAr ? 'إجراء محظور - وجود حركات لاحقة مرتبطة بالتحويل' : 'Action Blocked - Downstream Dependencies'}
                  </h3>
                  <span className="text-[11px] text-rose-600 font-bold">
                    {isAr ? 'قاعدة الأسبقية الصارمة (Strict Dependency Blocker - LIFO)' : 'Strict LIFO Cascade Policy Active'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminDependencyModal({ open: false, transfer: null, blockers: [], details: '' })}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {adminDependencyModal.details}
            </p>

            {/* Visual Cascade Tree */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-indigo-600" />
                <span>{isAr ? 'مسار الارتباط المخزني التابع:' : 'Downstream Dependency Chain:'}</span>
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                {/* Transfer Level */}
                <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold">
                    {isAr ? 'إذن تحويل' : 'Transfer'}
                  </span>
                  <span className="font-bold text-slate-900">{adminDependencyModal.transfer.id}</span>
                  <span className="text-slate-500 font-sans">
                    ({getWarehouseName(adminDependencyModal.transfer.sourceWarehouse)} ➔ {getWarehouseName(adminDependencyModal.transfer.targetWarehouse)})
                  </span>
                </div>

                {/* Target Warehouse Node */}
                <div className="flex items-center gap-2 pl-3 rtl:pr-3 text-slate-400">
                  <CornerDownRight className="h-3.5 w-3.5" />
                  <div className="flex-1 flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 text-slate-600 shadow-2xs">
                    <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-800 border border-cyan-200 rounded text-[10px] font-bold font-sans">
                      {isAr ? 'مخزن الاستلام' : 'Target Warehouse'}
                    </span>
                    <span className="font-sans text-xs font-bold text-slate-800">{getWarehouseName(adminDependencyModal.transfer.targetWarehouse)}</span>
                  </div>
                </div>

                {/* Downstream Blocker Rows */}
                {(adminDependencyModal.blockers || []).map((b, bIdx) => (
                  <div key={bIdx} className="flex items-center gap-2 pl-6 rtl:pr-6 text-rose-500">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    <div className="flex-1 p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-rose-950 font-sans text-xs shadow-2xs">
                      <div className="font-bold flex items-center justify-between">
                        <span>{isAr ? b.titleAr : b.titleEn}</span>
                        {b.consumedQty > 0 && (
                          <span className="font-mono text-[10px] bg-rose-200/80 px-1.5 py-0.5 rounded border border-rose-300 font-bold text-rose-900">
                            {b.consumedQty.toLocaleString()} {b.unit}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                        {isAr ? b.messageAr : b.messageEn}
                      </div>
                      {b.navTab && (
                        <div className="mt-2 pt-1.5 border-t border-rose-200 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('app_navigate_tab', {
                                detail: b.orderNumber ? { tab: b.navTab, orderNumber: b.orderNumber } : b.navTab
                              }));
                              setAdminDependencyModal({ open: false, transfer: null, blockers: [], details: '' });
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-900 border border-rose-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>
                              {b.navTab === 'liquid_tanks'
                                ? (isAr ? 'الانتقال لتانكات الخلط' : 'Go to Liquid Tanks')
                                : b.navTab === 'work_orders'
                                ? (isAr ? `الانتقال لأمر تشغيل #${b.orderNumber || ''}` : `Go to Work Order #${b.orderNumber || ''}`)
                                : (isAr ? 'الانتقال للتحويلات' : 'Go to Transfers')}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setAdminDependencyModal({ open: false, transfer: null, blockers: [], details: '' })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'فهمت، إغلاق النافذة' : 'Understood, Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ADMIN REVERSAL CONFIRMATION MODAL */}
      {adminReversalModal.open && adminReversalModal.transfer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border-2 border-purple-400 space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-2xl">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                    {isAr ? 'تأكيد إلغاء التحويل واسترجاع الرصيد المخزني' : 'Confirm Admin Transfer Reversal'}
                  </h3>
                  <span className="text-[11px] text-purple-700 font-bold">
                    {isAr ? 'إعادة الخامات لمخزن الصرف وخصمها من المستلم' : 'Rollback Stock to Source Warehouse'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={adminReversalModal.isSubmitting}
                onClick={() => setAdminReversalModal({ open: false, transfer: null, reason: '', isSubmitting: false, linesToRollback: [] })}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Transfer Summary */}
            <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-2xl text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-mono font-extrabold text-purple-900 text-sm">{adminReversalModal.transfer.id}</span>
                <span className="text-slate-500 font-medium">{adminReversalModal.transfer.transferDate}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <span className="text-slate-500">{isAr ? 'من:' : 'From:'} {getWarehouseName(adminReversalModal.transfer.sourceWarehouse)}</span>
                <span>➔</span>
                <span className="text-indigo-800">{isAr ? 'إلى:' : 'To:'} {getWarehouseName(adminReversalModal.transfer.targetWarehouse)}</span>
              </div>
            </div>

            {/* Lines To Rollback */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>{isAr ? 'البنود المسترجعة إلى مخزن الصرف:' : 'Items Returned to Source Warehouse:'}</span>
                <span className="font-mono text-purple-700 text-[10px]">
                  ({adminReversalModal.linesToRollback.length} {isAr ? 'بنود' : 'items'})
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                {adminReversalModal.linesToRollback.map((l, lIdx) => (
                  <div key={lIdx} className="p-2 bg-slate-50/50 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{l.nameAr}</span>
                      <span className="text-[10px] text-slate-500 font-mono ms-1.5">[{l.lotNumber}]</span>
                    </div>
                    <div className="font-mono font-bold text-emerald-700">
                      +{l.qtySmallUnits.toLocaleString()} {l.smallUnit}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mandatory Reason */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700 text-xs">
                {isAr ? 'سبب الإلغاء الإداري (إلزامي للتوثيق المالي - 5 أحرف على الأقل) *' : 'Reversal Justification Reason (Mandatory - min 5 chars) *'}
              </label>
              <textarea
                required
                rows={2}
                value={adminReversalModal.reason}
                onChange={(e) => setAdminReversalModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={isAr ? 'اكتب سبب إلغاء التحويل بدقة، مثال: إذن مكرر، خطأ في اختيار المخزن، إلخ...' : 'Enter clear justification reason...'}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 font-medium placeholder-slate-400"
              />
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                disabled={adminReversalModal.isSubmitting}
                onClick={() => setAdminReversalModal({ open: false, transfer: null, reason: '', isSubmitting: false, linesToRollback: [] })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={adminReversalModal.isSubmitting || !adminReversalModal.reason || adminReversalModal.reason.trim().length < 5}
                onClick={handleExecuteAdminTransferReversal}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{adminReversalModal.isSubmitting ? (isAr ? 'جاري التنفيذ...' : 'Processing...') : (isAr ? 'تأكيد الإلغاء واسترجاع الرصيد' : 'Confirm Reversal')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}