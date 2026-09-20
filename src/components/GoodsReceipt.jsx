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
  ArrowDownLeft,
  ArrowUpRight,
  Undo2,
  Building2,
  Calendar,
  Boxes,
  Receipt,
  CheckCircle2,
  Clock,
  Printer,
  Eye,
  Edit3,
  History,
  Lock,
  Ban,
  DollarSign,
  PlusCircle,
  XCircle,
  Warehouse,
  Tag,
  Info,
  RotateCcw,
  Sparkles,
  X,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Layers,
  Sparkle,
  Paperclip,
  Download,
  Trash2,
  UploadCloud,
  ExternalLink,
  File,
  Zap,
  RefreshCw
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import SearchableSelect from './SearchableSelect';
import { buildLiveStockMatrix, StockOriginBadge, matchWarehouse } from '../utils/stockResolver';

export default function GoodsReceipt({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const isPurchasingAdmin = currentUser?.isPurchasingAdmin || isGeneralAdmin;
  const currentUserName = isAr ? (currentUser?.nameAr || 'أمين المخزن') : (currentUser?.name || 'Storekeeper');

  // Permission Checks for Sensitive Price Data
  const canViewPrices = permissions ? permissions.sensitive?.canViewPrices !== false : true;
  const canViewTotals = permissions ? permissions.sensitive?.canViewTotals !== false : true;

  // Real-time Cloud Collections
  const [receipts, setReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [suppliersMaster, setSuppliersMaster] = useState([]);
  const [warehousesList, setWarehousesList] = useState([]);
  const [stockLedger, setStockLedger] = useState([]);
  const [transfersList, setTransfersList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all'); // 'all' | 'receipt' | 'return'
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'direct' | 'po_linked'
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [materialFilter, setMaterialFilter] = useState('all');
  const [printFilter, setPrintFilter] = useState('all'); // 'all' | 'printed' | 'not_printed'
  const [taxFilter, setTaxFilter] = useState('all'); // 'all' | 'tax_verified' | 'tax_incomplete' | 'non_taxable'

  // Modal & Print States
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit' | 'view_readonly'
  const [docType, setDocType] = useState('receipt'); // 'receipt' | 'return'
  const [editingGrn, setEditingGrn] = useState(null);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [auditGrnData, setAuditGrnData] = useState(null);
  const [printGrnData, setPrintGrnData] = useState(null);
  const [printLang, setPrintLang] = useState('ar');

  // Attachment Management States
  const [attachmentModalGrn, setAttachmentModalGrn] = useState(null);
  const [stagedAttachments, setStagedAttachments] = useState([]);
  const [savingAttachments, setSavingAttachments] = useState(false);
  const [activeAttachmentPopover, setActiveAttachmentPopover] = useState(null);
  const [isSavingGrn, setIsSavingGrn] = useState(false);

  // Form State (Default: Direct Receiving)
  const [receivingType, setReceivingType] = useState('direct'); // 'direct' | 'po_linked'
  const [selectedPoId, setSelectedPoId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierDeliveryNote, setSupplierDeliveryNote] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Tax & ETA E-Invoicing
  const [isTaxOfficial, setIsTaxOfficial] = useState(true);
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState('');
  const [etaPortalRegistered, setEtaPortalRegistered] = useState(false);

  // Credit Note for Returns (إشعار دائن/خصم ضريبي للمرتجع)
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteDate, setCreditNoteDate] = useState('');

  // Line Items State
  const [grnLines, setGrnLines] = useState([
    {
      itemId: '',
      code: '',
      variantCode: '',
      variantSuffix: '',
      isNewVariant: false,
      nameAr: '',
      nameEn: '',
      specs: '',
      specsList: [],
      poOrderedQty: 0,
      poPreviouslyReceivedQty: 0,
      poRemainingQty: 0,
      targetWarehouse: '',
      largeUnitName: 'كرتونة',
      receivedLargeUnits: '',
      packagingRatio: '',
      smallUnit: 'عبوة',
      receivedSmallUnits: 0,
      unitPrice: '',
      currency: 'EGP',
      vatPercent: 14,
      whtPercent: 1,
      hasBatchTracking: false,
      supplierBatchNo: '',
      productionDate: '',
      expiryDate: '',
      qcStatus: 'accepted',
      rejectionReason: '',
    }
  ]);

  // Version helpers
  const formatVersionTag = (ver) => {
    if (!ver) return 'v1.0';
    const num = parseFloat(ver);
    return isNaN(num) ? `v${ver}` : `v${num.toFixed(1)}`;
  };

  const getNextVersion = (currentVer) => {
    const num = parseFloat(currentVer) || 1.0;
    return (num + 0.1).toFixed(1);
  };

  // Helper to format full Date & Time for tooltips and records
  const formatGrnDateTime = (grn) => {
    const rawTime =
      grn.createdAt?.seconds
        ? new Date(grn.createdAt.seconds * 1000)
        : grn.createdAt?.toDate
        ? grn.createdAt.toDate()
        : grn.auditTrail?.[grn.auditTrail.length - 1]?.timestamp
        ? new Date(grn.auditTrail[grn.auditTrail.length - 1].timestamp)
        : grn.updatedAt?.seconds
        ? new Date(grn.updatedAt.seconds * 1000)
        : null;

    if (rawTime && !isNaN(rawTime.getTime())) {
      return rawTime.toLocaleString(isAr ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    return grn.receiptDate || '';
  };

  // Subscribe to Firestore collections
  useEffect(() => {
    const unsubReceipts = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReceipts(list);
      setLoading(false);
    });

    const unsubOrders = onSnapshot(collection(db, 'purchase_orders'), (snap) => {
      setPurchaseOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItemsMaster(snap.docs.map((d) => ({ ...d.data(), code: d.id })));
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliersMaster(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehousesList(list);
    });

    const unsubLedger = onSnapshot(collection(db, 'stock_ledger'), (snap) => {
      setStockLedger(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubReceipts();
      unsubOrders();
      unsubItems();
      unsubSuppliers();
      unsubWarehouses();
      unsubLedger();
      unsubTransfers();
    };
  }, []);

  const receivablePurchaseOrders = useMemo(() => {
    return purchaseOrders.filter(
      (po) => po.status === 'approved' || po.status === 'partially_delivered'
    );
  }, [purchaseOrders]);

  const selectedSupplier = useMemo(() => {
    return suppliersMaster.find((s) => s.id === selectedSupplierId) || null;
  }, [suppliersMaster, selectedSupplierId]);

  // Live Records-Dependent Supplier Filter Options (Quarantined to Vendor GRN & RTN Only)
  const availableFilterSuppliers = useMemo(() => {
    const matchingReceipts = receipts.filter((r) => {
      // Exclude internal stock counts and opening balances
      if (r.docType === 'inventory_reconciliation' || r.isDirectAdjustment || r.docType === 'opening_balance') return false;

      const isReturn = r.docType === 'return' || r.id?.startsWith('RTN');
      const matchDocType =
        docTypeFilter === 'all' ||
        (docTypeFilter === 'return' && isReturn) ||
        (docTypeFilter === 'receipt' && !isReturn);

      const matchMaterial =
        materialFilter === 'all' ||
        (r.lines || []).some(
          (l) => l.itemId === materialFilter || l.code === materialFilter || l.code?.startsWith(`${materialFilter}-`)
        );

      return matchDocType && matchMaterial;
    });

    const map = new Map();
    matchingReceipts.forEach((r) => {
      if (r.supplierId && !map.has(r.supplierId)) {
        const supObj = suppliersMaster.find((s) => s.id === r.supplierId);
        map.set(r.supplierId, {
          value: r.supplierId,
          label: supObj?.name || r.supplierName || r.supplierId,
          sublabel: r.supplierId,
        });
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    return list;
  }, [receipts, suppliersMaster, materialFilter, docTypeFilter]);

  // Live Records-Dependent Material Filter Options (Narrowed by Selected Supplier & Doc Type)
  const availableFilterMaterials = useMemo(() => {
    const matchingReceipts = receipts.filter((r) => {
      const isReturn = r.docType === 'return' || r.id?.startsWith('RTN');
      const matchDocType =
        docTypeFilter === 'all' ||
        (docTypeFilter === 'return' && isReturn) ||
        (docTypeFilter === 'receipt' && !isReturn);

      const matchSupplier = supplierFilter === 'all' || r.supplierId === supplierFilter;

      return matchDocType && matchSupplier;
    });

    const map = new Map();
    matchingReceipts.forEach((r) => {
      (r.lines || []).forEach((l) => {
        const code = l.itemId || (l.code ? l.code.split('-')[0] : '');
        if (code && !map.has(code)) {
          const itemObj = itemsMaster.find((i) => i.code === code);
          map.set(code, {
            value: code,
            label: itemObj?.nameAr || l.nameAr || code,
            sublabel: code,
          });
        }
      });
    });

    const list = Array.from(map.values());
    list.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    return list;
  }, [receipts, itemsMaster, supplierFilter, docTypeFilter]);

  // Filter items linked to selected supplier in Return (RTV) mode (typically 3-5 relevant items)
  const availableItemsForDirectGrn = useMemo(() => {
    if (docType === 'return' && selectedSupplierId) {
      return itemsMaster.filter((item) =>
        (item.variations || []).some((v) => v.supplierId === selectedSupplierId)
      );
    }
    return itemsMaster;
  }, [itemsMaster, docType, selectedSupplierId]);

  // Active warehouses for selection dropdown
  const activeWarehouses = useMemo(() => {
    return warehousesList.filter((w) => w.isActive !== false);
  }, [warehousesList]);

  // Helper: Get real-time stock in a SPECIFIC warehouse for a variant
  const getWarehouseAvailableStock = (variantCode, warehouseName) => {
    if (!variantCode || !warehouseName) return 0;
    const targetWh = warehouseName.trim().toLowerCase();
    const whMovements = stockLedger.filter(
      (entry) =>
        (entry.variantCode === variantCode || entry.code === variantCode) &&
        (entry.warehouse?.trim().toLowerCase() === targetWh)
    );
    const balance = whMovements.reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0);
    return Math.max(0, balance);
  };

  // Helper: Get total stock across ALL warehouses for a variant
  const getTotalVariantStock = (itemId, variantCode) => {
    if (!variantCode) return 0;
    if (itemId) {
      const parentItem = itemsMaster.find((i) => i.code === itemId);
      if (parentItem) {
        const variantObj = (parentItem.variations || []).find((v) => v.variantCode === variantCode);
        if (variantObj && variantObj.stock !== undefined) return Number(variantObj.stock) || 0;
      }
    }
    const movements = stockLedger.filter(
      (entry) => entry.variantCode === variantCode || entry.code === variantCode
    );
    return Math.max(0, movements.reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0));
  };

  // Compiled Live Stock Matrix (Single Source of Truth)
  const stockMatrix = useMemo(() => {
    return buildLiveStockMatrix({
      itemsMaster,
      warehouses: warehousesList,
      goodsReceipts: receipts,
      transfers: transfersList,
    });
  }, [itemsMaster, warehousesList, receipts, transfersList]);

  // Helper: Compute 3-Level Stock Breakdown (Primary Matrix with Dynamic Fallback)
  const get3LevelStock = (parentItemId, variantCode, lotNumber, selectedWarehouse) => {
    const targetWhObj = warehousesList.find((w) => matchWarehouse(selectedWarehouse, w)) || { id: selectedWarehouse, code: selectedWarehouse };
    const whId = targetWhObj.id || targetWhObj.code || selectedWarehouse;

    // 1. PRIMARY: Query Compiled Live Matrix
    if (stockMatrix && stockMatrix.isReady) {
      const varKey = `${parentItemId}_${variantCode}`;
      const varData = stockMatrix.varMap[varKey];
      const parentData = stockMatrix.parentMap[parentItemId];

      let lotInSelected = 0;
      let lotInAll = 0;
      if (lotNumber) {
        const lotKey = `${lotNumber}_${whId}`;
        const selectedLotEntry = stockMatrix.lotMap[lotKey];
        if (selectedLotEntry) lotInSelected = selectedLotEntry.availableQty;

        // Sum across all warehouses for this lot
        Object.values(stockMatrix.lotMap).forEach((l) => {
          if (l.lotNumber === lotNumber) lotInAll += l.availableQty;
        });
      }

      return {
        parent: {
          selected: Math.max(0, parentData?.byWarehouse[whId] || 0),
          all: Math.max(0, parentData?.totalQty || 0),
        },
        variant: {
          selected: Math.max(0, varData?.byWarehouse[whId] || 0),
          all: Math.max(0, varData?.totalQty || 0),
        },
        lot: {
          selected: Math.max(0, lotInSelected),
          all: Math.max(0, lotInAll),
        },
        source: 'matrix',
      };
    }

    // 2. FALLBACK: Dynamic Calculation across receipts
    let parentInSelectedWh = 0;
    let parentInAllWh = 0;
    let variantInSelectedWh = 0;
    let variantInAllWh = 0;
    let lotInSelectedWh = 0;
    let lotInAllWh = 0;

    receipts.forEach((r) => {
      if (r.status === 'cancelled' || r.status === 'rejected') return;
      const isRet = r.docType === 'return' || r.id?.startsWith('RTN');

      (r.lines || []).forEach((l, lIdx) => {
        const lParent = l.itemId || l.code;
        const lVar = l.variantCode || l.code || l.itemId;
        const lLot = l.lotNumber || (l.linkedGrnId ? `${l.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}` : `${r.id}-${String(lIdx + 1).padStart(2, '0')}`);
        const qty = Number(l.receivedSmallUnits || 0) * (isRet ? -1 : 1);
        const wh = l.targetWarehouse;

        if (parentItemId && (lParent === parentItemId || l.code === parentItemId || l.itemId === parentItemId)) {
          parentInAllWh += qty;
          if (wh === selectedWarehouse) parentInSelectedWh += qty;
        }

        if (variantCode && (lVar === variantCode || l.code === variantCode)) {
          variantInAllWh += qty;
          if (wh === selectedWarehouse) variantInSelectedWh += qty;
        }

        if (lotNumber && (lLot === lotNumber || l.lotNumber === lotNumber || l.linkedGrnId === lotNumber)) {
          lotInAllWh += qty;
          if (wh === selectedWarehouse) lotInSelectedWh += qty;
        }
      });
    });

    return {
      parent: { selected: Math.max(0, parentInSelectedWh), all: Math.max(0, parentInAllWh) },
      variant: { selected: Math.max(0, variantInSelectedWh), all: Math.max(0, variantInAllWh) },
      lot: { selected: Math.max(0, lotInSelectedWh), all: Math.max(0, lotInAllWh) },
      source: 'fallback',
    };
  };

  // Helper: Get past approved GRNs & Lots for a specific supplier and variant
  const getVariantPastGrns = (supplierId, variantCode) => {
    if (!supplierId || !variantCode) return [];
    const matching = [];
    receipts
      .filter(
        (r) =>
          r.supplierId === supplierId &&
          (r.docType === 'receipt' || !r.docType || r.id?.startsWith('GRN')) &&
          r.status === 'approved'
      )
      .forEach((r) => {
        (r.lines || []).forEach((l, idx) => {
          const isMatch =
            (l.variantCode && l.variantCode === variantCode) ||
            (l.code && l.code === variantCode) ||
            (l.itemId && l.itemId === variantCode);

          if (isMatch) {
            const resolvedLot = l.lotNumber || `${r.id}-${String(idx + 1).padStart(2, '0')}`;
            matching.push({
              grnId: r.id,
              lotNumber: resolvedLot,
              receiptDate: r.receiptDate,
              unitPrice: l.unitPrice,
              currency: l.currency || 'EGP',
              vatPercent: l.vatPercent !== undefined ? l.vatPercent : 14,
              whtPercent: l.whtPercent !== undefined ? l.whtPercent : 1,
              isTaxOfficial: Boolean(r.isTaxOfficial),
              taxInvoiceNumber: r.taxInvoiceNumber || '',
              packagingRatio: l.packagingRatio || 1,
              largeUnitName: l.largeUnitName || 'كرتونة',
              smallUnit: l.smallUnit || 'عبوة',
              supplierBatchNo: l.supplierBatchNo || '',
              productionDate: l.productionDate || '',
              expiryDate: l.expiryDate || '',
            });
          }
        });
      });
    return matching;
  };

  const recordedWarehouses = useMemo(() => {
    const set = new Set();
    receipts.forEach((r) => {
      (r.lines || []).forEach((l) => {
        if (l.targetWarehouse) set.add(l.targetWarehouse.trim());
      });
    });
    return Array.from(set);
  }, [receipts]);

  // Edit rule
  const canEditGrn = (grn) => {
    if (grn.status === 'cancelled') return false;
    if (isGeneralAdmin || isPurchasingAdmin) return true;
    const todayStr = new Date().toISOString().split('T')[0];
    return (grn.receiptDate || '') === todayStr;
  };

  const generateDocId = (targetType = docType) => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const typePrefix = targetType === 'return' ? 'RTN' : 'GRN';
    const prefix = `${typePrefix}-${yyyy}${mm}${dd}`;
    const todayMatches = receipts.filter((r) => r.id?.startsWith(prefix));
    const seq = String(todayMatches.length + 1).padStart(2, '0');
    return `${prefix}${seq}`;
  };

  // Switch receiving type
  const handleReceivingTypeChange = (type) => {
    setReceivingType(type);
    setSelectedPoId('');
    setSelectedSupplierId('');
    setSupplierDeliveryNote('');
    setGrnLines([
      {
        itemId: '',
        code: '',
        variantCode: '',
        variantSuffix: '',
        isNewVariant: false,
        nameAr: '',
        nameEn: '',
        specs: '',
        poOrderedQty: 0,
        poPreviouslyReceivedQty: 0,
        poRemainingQty: 0,
        targetWarehouse: '',
        largeUnitName: 'كرتونة',
        receivedLargeUnits: '',
        packagingRatio: 1,
        smallUnit: 'عبوة',
        receivedSmallUnits: 0,
        unitPrice: '',
        currency: 'EGP',
        vatPercent: 14,
        whtPercent: 1,
        hasBatchTracking: false,
        supplierBatchNo: '',
        productionDate: '',
        expiryDate: '',
        qcStatus: 'accepted',
        rejectionReason: '',
      }
    ]);
  };

  // PO Select Handler
  const handlePoSelect = (poId) => {
    setSelectedPoId(poId);
    const targetPo = purchaseOrders.find((p) => p.id === poId);
    if (!targetPo) return;

    setSelectedSupplierId(targetPo.supplierId || '');
    setIsTaxOfficial(targetPo.isTaxOfficial !== false);

    const prevReceivedByCode = {};
    receipts
      .filter((r) => r.poId === poId && r.status === 'approved' && r.id !== editingGrn?.id)
      .forEach((r) => {
        (r.lines || []).forEach((l) => {
          const key = l.variantCode || l.code || l.itemId;
          prevReceivedByCode[key] = (prevReceivedByCode[key] || 0) + (Number(l.receivedSmallUnits) || 0);
        });
      });

    const initialLines = (targetPo.lines || []).map((poLine) => {
      const parentItem = itemsMaster.find((i) => i.code === poLine.itemId);
      const variantObj = (parentItem?.variations || []).find(
        (v) => v.variantCode === poLine.code || v.variantCode === poLine.variantCode
      );
      const ratio = Number(variantObj?.packagingRatio) || 1;
      const largeUnit = variantObj?.largeUnitName || parentItem?.largeUnitName || 'كرتونة';
      const smallUnit = variantObj?.smallUnit || parentItem?.smallUnit || poLine.smallUnit || 'عبوة';
      const specs = variantObj?.mergedSpecs || poLine.specs || parentItem?.mergedSpecs || '';

      const key = poLine.variantCode || poLine.code || poLine.itemId;
      const previouslyReceived = prevReceivedByCode[key] || 0;
      const ordered = Number(poLine.qty) || 0;
      const remaining = Math.max(0, ordered - previouslyReceived);

      return {
        itemId: poLine.itemId || '',
        code: poLine.code || poLine.itemId || '',
        variantCode: poLine.variantCode || poLine.code || '',
        variantSuffix: variantObj?.suffix || '',
        isNewVariant: false,
        nameAr: poLine.nameAr || parentItem?.nameAr || '',
        nameEn: poLine.nameEn || parentItem?.nameEn || '',
        specs: specs,
        poOrderedQty: ordered,
        poPreviouslyReceivedQty: previouslyReceived,
        poRemainingQty: remaining,
        targetWarehouse: '',
        largeUnitName: largeUnit,
        receivedLargeUnits: '',
        packagingRatio: ratio,
        smallUnit: smallUnit,
        receivedSmallUnits: 0,
        unitPrice: poLine.unitPrice !== '' && poLine.unitPrice !== undefined ? poLine.unitPrice : '',
        currency: poLine.currency || targetPo.financials?.currency || 'EGP',
        vatPercent: Number(poLine.vatPercent) || 14,
        whtPercent: Number(poLine.whtPercent) || 1,
        hasBatchTracking: false,
        supplierBatchNo: '',
        productionDate: '',
        expiryDate: '',
        qcStatus: 'accepted',
        rejectionReason: '',
      };
    });

    setGrnLines(initialLines);
  };

  // Helper: Next variation suffix generator
  const getNextVariantSuffix = (item) => {
    const existingVariants = item?.variations || [];
    if (existingVariants.length === 0) return 'A';
    const lastSuffix = existingVariants[existingVariants.length - 1]?.suffix || 'A';
    const nextCharCode = lastSuffix.charCodeAt(0) + 1;
    return String.fromCharCode(nextCharCode);
  };

  // Direct Mode Item Select
  const handleDirectItemSelect = (index, itemCode) => {
    const selectedItem = itemsMaster.find((i) => i.code === itemCode);
    const updated = [...grnLines];

    if (selectedItem) {
      const supplierVariants = (selectedItem.variations || []).filter(
        (v) => v.supplierId === selectedSupplierId
      );

      let whtRate = selectedItem.whtRate === '3%' ? 3 : 1;
      if (selectedSupplier && selectedSupplier.whtCompliance === 'advance_payment') {
        whtRate = 0;
      }

      // If supplier has existing variation, select the first one by default
      if (supplierVariants.length > 0) {
        const defVar = supplierVariants[0];
        const ratio = defVar.packagingRatio !== undefined && defVar.packagingRatio !== null ? defVar.packagingRatio : '';
        const ratioNum = parseFloat(ratio) || 0;
        updated[index] = {
          ...updated[index],
          itemId: selectedItem.code,
          code: defVar.variantCode,
          variantCode: defVar.variantCode,
          variantSuffix: defVar.suffix || '',
          isNewVariant: false,
          nameAr: selectedItem.nameAr,
          nameEn: selectedItem.nameEn,
          specs: defVar.mergedSpecs || selectedItem.mergedSpecs || '',
          specsList: Array.isArray(defVar.specs) ? defVar.specs.map((s) => ({ ...s })) : [],
          largeUnitName: defVar.largeUnitName || selectedItem.largeUnitName || 'كرتونة',
          smallUnit: defVar.smallUnit || selectedItem.smallUnit || 'عبوة',
          packagingRatio: ratio,
          receivedSmallUnits: (parseFloat(updated[index].receivedLargeUnits) || 0) * ratioNum,
          vatPercent: selectedItem.vatRate === '0%' ? 0 : 14,
          whtPercent: whtRate,
        };
      } else if (docType === 'return') {
        // Returns strictly prohibit new variations
        alert(isAr ? 'عفواً، لا توجد تنوعات مسجلة لهذا المورد في هذه الخامة.' : 'No certified variations exist for this supplier.');
        updated[index] = {
          ...updated[index],
          itemId: selectedItem.code,
          code: '',
          variantCode: '',
          variantSuffix: '',
          isNewVariant: false,
          nameAr: selectedItem.nameAr,
          nameEn: selectedItem.nameEn,
          specs: selectedItem.mergedSpecs || '',
          specsList: [],
          packagingRatio: '',
          receivedSmallUnits: 0,
        };
      } else {
        // GRN Direct Receipt: Auto-initialize New Variation setup
        const nextSuffix = getNextVariantSuffix(selectedItem);
        const baseMasterSpecs = Array.isArray(selectedItem.masterSpecs) && selectedItem.masterSpecs.length > 0
          ? selectedItem.masterSpecs.map((s) => ({ label: s.label || '', value: s.value || '' }))
          : (Array.isArray(selectedItem.specs) && selectedItem.specs.length > 0
              ? selectedItem.specs.map((s) => ({ label: s.label || '', value: s.value || '' }))
              : [{ label: '', value: '' }]);

        const mergedSpecsStr = baseMasterSpecs.filter((s) => s.label.trim() && s.value.trim()).map((s) => `${s.label.trim()}: ${s.value.trim()}`).join(' | ');

        updated[index] = {
          ...updated[index],
          itemId: selectedItem.code,
          code: `${selectedItem.code}-${nextSuffix}`,
          variantCode: `${selectedItem.code}-${nextSuffix}`,
          variantSuffix: nextSuffix,
          isNewVariant: true,
          nameAr: selectedItem.nameAr,
          nameEn: selectedItem.nameEn,
          specs: mergedSpecsStr || selectedItem.mergedSpecs || '',
          specsList: baseMasterSpecs,
          largeUnitName: selectedItem.largeUnitName || 'كرتونة',
          smallUnit: selectedItem.smallUnit || 'عبوة',
          packagingRatio: '',
          receivedSmallUnits: 0,
          vatPercent: selectedItem.vatRate === '0%' ? 0 : 14,
          whtPercent: whtRate,
        };
      }
    } else {
      updated[index] = {
        ...updated[index],
        itemId: '',
        code: '',
        variantCode: '',
        variantSuffix: '',
        isNewVariant: false,
        nameAr: '',
        nameEn: '',
        specs: '',
        specsList: [],
        packagingRatio: '',
      };
    }

    setGrnLines(updated);
  };

  // Direct Mode Variation Selector (Mandatory Pick or Create New)
  const handleDirectVariantSelect = (index, value) => {
    const updated = [...grnLines];
    const line = updated[index];
    const selectedItem = itemsMaster.find((i) => i.code === line.itemId);
    if (!selectedItem) return;

    if (value === '__NEW_VARIANT__') {
      // Create New Variation Mode: Deep-clone Master Specs as Key-Value Pairs
      const nextSuffix = getNextVariantSuffix(selectedItem);
      const baseMasterSpecs = Array.isArray(selectedItem.masterSpecs) && selectedItem.masterSpecs.length > 0
        ? selectedItem.masterSpecs.map((s) => ({ label: s.label || '', value: s.value || '' }))
        : (Array.isArray(selectedItem.specs) && selectedItem.specs.length > 0
            ? selectedItem.specs.map((s) => ({ label: s.label || '', value: s.value || '' }))
            : [{ label: '', value: '' }]);

      const mergedSpecsStr = baseMasterSpecs.filter((s) => s.label.trim() && s.value.trim()).map((s) => `${s.label.trim()}: ${s.value.trim()}`).join(' | ');
      
      // Preserve existing packagingRatio if already typed by user, otherwise keep blank
      const currentRatio = line.packagingRatio !== undefined && line.packagingRatio !== null ? line.packagingRatio : '';
      const largeUnits = parseFloat(line.receivedLargeUnits) || 0;
      const ratioNum = parseFloat(currentRatio) || 0;

      updated[index] = {
        ...line,
        code: `${selectedItem.code}-${nextSuffix}`,
        variantCode: `${selectedItem.code}-${nextSuffix}`,
        variantSuffix: nextSuffix,
        isNewVariant: true,
        specs: mergedSpecsStr || selectedItem.mergedSpecs || '',
        specsList: baseMasterSpecs,
        largeUnitName: selectedItem.largeUnitName || 'كرتونة',
        smallUnit: selectedItem.smallUnit || 'عبوة',
        packagingRatio: currentRatio,
        receivedSmallUnits: largeUnits * ratioNum,
      };
    } else {
      // Pick Existing Variation
      const variant = (selectedItem.variations || []).find((v) => v.variantCode === value);
      if (variant) {
        const ratio = variant.packagingRatio !== undefined && variant.packagingRatio !== null ? variant.packagingRatio : '';
        const largeUnits = parseFloat(line.receivedLargeUnits) || 0;
        const ratioNum = parseFloat(ratio) || 0;

        updated[index] = {
          ...line,
          code: variant.variantCode,
          variantCode: variant.variantCode,
          variantSuffix: variant.suffix || '',
          isNewVariant: false,
          specs: variant.mergedSpecs || selectedItem.mergedSpecs || '',
          specsList: Array.isArray(variant.specs) ? variant.specs.map((s) => ({ ...s })) : [],
          largeUnitName: variant.largeUnitName || selectedItem.largeUnitName || 'كرتونة',
          smallUnit: variant.smallUnit || selectedItem.smallUnit || 'عبوة',
          packagingRatio: ratio,
          receivedSmallUnits: largeUnits * ratioNum,
        };
      }
    }

    setGrnLines(updated);
  };

  // Spec Key-Value Row Handlers for New Variations
  const handleAddLineSpec = (lineIndex) => {
    const updated = [...grnLines];
    const currentList = updated[lineIndex].specsList || [];
    updated[lineIndex].specsList = [...currentList, { label: '', value: '' }];
    setGrnLines(updated);
  };

  const handleRemoveLineSpec = (lineIndex, specIndex) => {
    const updated = [...grnLines];
    const currentList = updated[lineIndex].specsList || [];
    const filtered = currentList.filter((_, idx) => idx !== specIndex);
    updated[lineIndex].specsList = filtered.length > 0 ? filtered : [{ label: '', value: '' }];
    updated[lineIndex].specs = updated[lineIndex].specsList
      .filter((s) => s.label.trim() && s.value.trim())
      .map((s) => `${s.label.trim()}: ${s.value.trim()}`)
      .join(' | ');
    setGrnLines(updated);
  };

  const handleLineSpecChange = (lineIndex, specIndex, field, value) => {
    const updated = [...grnLines];
    const currentList = [...(updated[lineIndex].specsList || [])];
    if (!currentList[specIndex]) currentList[specIndex] = { label: '', value: '' };
    currentList[specIndex][field] = value;
    updated[lineIndex].specsList = currentList;
    updated[lineIndex].specs = currentList
      .filter((s) => s.label.trim() && s.value.trim())
      .map((s) => `${s.label.trim()}: ${s.value.trim()}`)
      .join(' | ');
    setGrnLines(updated);
  };

  // Handle optional selection of past GRN / Lot to inherit price, Lot ID, & tax state in Return mode
  const handleSelectLinkedGrn = (index, lotOrGrnId) => {
    const updated = [...grnLines];
    const line = updated[index];

    if (lotOrGrnId) {
      const pastGrns = getVariantPastGrns(selectedSupplierId, line.variantCode);
      const targetGrn = pastGrns.find((g) => g.lotNumber === lotOrGrnId || g.grnId === lotOrGrnId);
      if (targetGrn) {
        line.linkedGrnId = targetGrn.grnId;
        line.lotNumber = targetGrn.lotNumber;
        if (targetGrn.unitPrice !== '' && targetGrn.unitPrice !== undefined) {
          line.unitPrice = targetGrn.unitPrice;
        }
        line.currency = targetGrn.currency || line.currency;
        line.vatPercent = targetGrn.vatPercent !== undefined ? targetGrn.vatPercent : line.vatPercent;
        line.whtPercent = targetGrn.whtPercent !== undefined ? targetGrn.whtPercent : line.whtPercent;
        if (targetGrn.packagingRatio) line.packagingRatio = targetGrn.packagingRatio;
        if (targetGrn.supplierBatchNo) line.supplierBatchNo = targetGrn.supplierBatchNo;
        if (targetGrn.productionDate) line.productionDate = targetGrn.productionDate;
        if (targetGrn.expiryDate) line.expiryDate = targetGrn.expiryDate;

        // Auto-select Taxable return if the source GRN was tax official
        if (targetGrn.isTaxOfficial) {
          setIsTaxOfficial(true);
        }
      }
    } else {
      line.linkedGrnId = '';
      line.lotNumber = '';
    }
    setGrnLines(updated);
  };

  // Line changes with live ratio calculation
  const handleLineChange = (index, field, value) => {
    const updated = [...grnLines];
    updated[index][field] = value;

    if (field === 'receivedLargeUnits') {
      const largeUnits = parseFloat(value) || 0;
      const ratio = parseFloat(updated[index].packagingRatio) || 0;
      updated[index].receivedSmallUnits = largeUnits * ratio;
    } else if (field === 'packagingRatio') {
      const ratio = parseFloat(value) || 0;
      const largeUnits = parseFloat(updated[index].receivedLargeUnits) || 0;
      updated[index].receivedSmallUnits = largeUnits * ratio;
    }

    setGrnLines(updated);
  };

  const handleSplitLine = (index) => {
    const sourceLine = grnLines[index];
    const newLine = {
      ...sourceLine,
      targetWarehouse: '',
      receivedLargeUnits: '',
      receivedSmallUnits: 0,
      supplierBatchNo: sourceLine.supplierBatchNo || '',
      productionDate: sourceLine.productionDate || '',
      expiryDate: sourceLine.expiryDate || '',
    };
    setGrnLines([...grnLines, newLine]);
  };

  const handleAddDirectLine = () => {
    const defaultWh = docType === 'return'
      ? (warehousesList.find((w) => w.isActive !== false && w.classification === 'returns')?.nameAr || '')
      : '';

    setGrnLines([
      ...grnLines,
      {
        itemId: '',
        code: '',
        variantCode: '',
        variantSuffix: '',
        isNewVariant: false,
        nameAr: '',
        nameEn: '',
        specs: '',
        linkedGrnId: '',
        poOrderedQty: 0,
        poPreviouslyReceivedQty: 0,
        poRemainingQty: 0,
        targetWarehouse: defaultWh,
        largeUnitName: 'كرتونة',
        receivedLargeUnits: '',
        packagingRatio: 1,
        smallUnit: 'عبوة',
        receivedSmallUnits: 0,
        unitPrice: '',
        currency: 'EGP',
        vatPercent: 14,
        whtPercent: 1,
        hasBatchTracking: false,
        supplierBatchNo: '',
        productionDate: '',
        expiryDate: '',
        qcStatus: docType === 'return' ? 'rejected' : 'accepted',
        rejectionReason: '',
      }
    ]);
  };

  const handleRemoveLine = (index) => {
    if (grnLines.length === 1) return;
    setGrnLines(grnLines.filter((_, idx) => idx !== index));
  };

  // Financials Calculation
  const computedTotals = useMemo(() => {
    let subtotal = 0;
    let totalVat = 0;
    let totalWht = 0;
    let hasPricing = false;
    const detectedCurrency = grnLines.find((l) => l.unitPrice && l.currency)?.currency || grnLines[0]?.currency || 'EGP';

    grnLines.forEach((line) => {
      const price = parseFloat(line.unitPrice);
      const qty = parseFloat(line.receivedSmallUnits) || 0;

      if (!isNaN(price) && price > 0 && qty > 0) {
        hasPricing = true;
        const lineSubtotal = qty * price;
        const lineVat = isTaxOfficial ? lineSubtotal * ((line.vatPercent || 0) / 100) : 0;

        let effectiveWhtRate = (line.whtPercent || 0) / 100;
        if (selectedSupplier?.whtCompliance === 'advance_payment') {
          effectiveWhtRate = 0;
        }
        const lineWht = lineSubtotal * effectiveWhtRate;

        subtotal += lineSubtotal;
        totalVat += lineVat;
        totalWht += lineWht;
      }
    });

    const netPayable = subtotal + totalVat - totalWht;
    return { hasPricing, currency: detectedCurrency, subtotal, totalVat, totalWht, netPayable };
  }, [grnLines, isTaxOfficial, selectedSupplier]);

  const handleOpenCreate = (targetDocType = 'receipt') => {
    setModalMode('create');
    setDocType(targetDocType);
    setEditingGrn(null);
    setViewingReceipt(null);
    setReceivingType('direct');
    setSelectedPoId('');
    setSelectedSupplierId('');
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setSupplierDeliveryNote('');
    setVehiclePlateNumber('');
    setNotes('');
    setIsTaxOfficial(true);
    setTaxInvoiceNumber('');
    setTaxInvoiceDate('');
    setCreditNoteNumber('');
    setCreditNoteDate('');
    setEtaPortalRegistered(false);

    const defaultWh = targetDocType === 'return'
      ? (warehousesList.find((w) => w.isActive !== false && w.classification === 'returns')?.nameAr || '')
      : '';

    setGrnLines([
      {
        itemId: '',
        code: '',
        variantCode: '',
        variantSuffix: '',
        isNewVariant: false,
        nameAr: '',
        nameEn: '',
        specs: '',
        linkedGrnId: '',
        poOrderedQty: 0,
        poPreviouslyReceivedQty: 0,
        poRemainingQty: 0,
        targetWarehouse: defaultWh,
        largeUnitName: 'كرتونة',
        receivedLargeUnits: '',
        packagingRatio: '',
        smallUnit: 'عبوة',
        receivedSmallUnits: 0,
        unitPrice: '',
        currency: 'EGP',
        vatPercent: 14,
        whtPercent: 1,
        hasBatchTracking: false,
        supplierBatchNo: '',
        productionDate: '',
        expiryDate: '',
        qcStatus: targetDocType === 'return' ? 'rejected' : 'accepted',
        rejectionReason: '',
      }
    ]);
    setShowModal(true);
  };

  const handleOpenEdit = (grn) => {
    if (!canEditGrn(grn)) {
      alert(isAr ? 'عفواً، لا يمكن تعديل الإذن بعد انتهاء يوم إنشائه إلا من خلال المسؤول العام.' : 'Cannot edit document after creation day.');
      return;
    }

    const isRet = grn.docType === 'return' || grn.id?.startsWith('RTN');
    setModalMode('edit');
    setDocType(isRet ? 'return' : 'receipt');
    setEditingGrn(grn);
    setViewingReceipt(null);
    setReceivingType(isRet ? 'direct' : (grn.receivingType || 'direct'));
    setSelectedPoId(isRet ? '' : (grn.poId || ''));
    setSelectedSupplierId(grn.supplierId || '');
    setReceiptDate(grn.receiptDate || '');
    setSupplierDeliveryNote(grn.supplierDeliveryNote || '');
    setVehiclePlateNumber(grn.vehiclePlateNumber || '');
    setNotes(grn.notes || '');
    setIsTaxOfficial(grn.isTaxOfficial !== false);
    setTaxInvoiceNumber(grn.taxInvoiceNumber || '');
    setTaxInvoiceDate(grn.taxInvoiceDate || '');
    setCreditNoteNumber(grn.creditNoteNumber || '');
    setCreditNoteDate(grn.creditNoteDate || '');
    setEtaPortalRegistered(grn.etaPortalRegistered !== false);
    setGrnLines(grn.lines || []);
    setShowModal(true);
  };

  const handleOpenView = (grn) => {
    const isRet = grn.docType === 'return' || grn.id?.startsWith('RTN');
    setModalMode('view_readonly');
    setDocType(isRet ? 'return' : 'receipt');
    setEditingGrn(null);
    setViewingReceipt(grn);
    setReceivingType(isRet ? 'direct' : (grn.receivingType || 'direct'));
    setSelectedPoId(isRet ? '' : (grn.poId || ''));
    setSelectedSupplierId(grn.supplierId || '');
    setReceiptDate(grn.receiptDate || '');
    setSupplierDeliveryNote(grn.supplierDeliveryNote || '');
    setVehiclePlateNumber(grn.vehiclePlateNumber || '');
    setNotes(grn.notes || '');
    setIsTaxOfficial(grn.isTaxOfficial !== false);
    setTaxInvoiceNumber(grn.taxInvoiceNumber || '');
    setTaxInvoiceDate(grn.taxInvoiceDate || '');
    setCreditNoteNumber(grn.creditNoteNumber || '');
    setCreditNoteDate(grn.creditNoteDate || '');
    setEtaPortalRegistered(grn.etaPortalRegistered !== false);
    setGrnLines(grn.lines || []);
    setShowModal(true);
  };

  // Attachment Handlers
  const handleOpenAttachmentModal = (grn) => {
    setAttachmentModalGrn(grn);
    setStagedAttachments(grn.attachments || []);
    setActiveAttachmentPopover(null);
  };

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          fileName: file.name,
          fileSize: (file.size / 1024).toFixed(1) + ' KB',
          fileType: file.type || 'application/octet-stream',
          dataUrl: reader.result,
          label: file.name.replace(/\.[^/.]+$/, ''), // Default label to filename without extension
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUserName,
        };
        setStagedAttachments((prev) => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleUpdateAttachmentLabel = (index, newLabel) => {
    setStagedAttachments((prev) => {
      const updated = [...prev];
      updated[index].label = newLabel;
      return updated;
    });
  };

  const handleRemoveStagedAttachment = (index) => {
    setStagedAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveAttachments = async () => {
    if (!attachmentModalGrn) return;
    setSavingAttachments(true);

    try {
      const grnRef = doc(db, 'goods_receipts', attachmentModalGrn.id);
      const nextVer = getNextVersion(attachmentModalGrn.version || '1.0');
      const isReturn = attachmentModalGrn.docType === 'return' || attachmentModalGrn.id?.startsWith('RTN');
      const docLabel = isReturn ? (isAr ? 'إذن المرتجع' : 'Return') : (isAr ? 'إذن الاستلام' : 'GRN');

      const newAudit = {
        version: nextVer,
        action: 'attachments_updated',
        status: attachmentModalGrn.status,
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: `تحديث مرفقات ${docLabel} (${stagedAttachments.length} ملفات)`,
        noteEn: `Attachments updated for ${docLabel} (${stagedAttachments.length} files)`,
      };

      await setDoc(
        grnRef,
        {
          attachments: stagedAttachments,
          version: nextVer,
          auditTrail: [...(attachmentModalGrn.auditTrail || []), newAudit],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setAttachmentModalGrn(null);
      setStagedAttachments([]);
    } catch (err) {
      console.error('Error saving attachments:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المرفقات.' : 'Error saving attachments.');
    } finally {
      setSavingAttachments(false);
    }
  };

  const handleDownloadFile = (att) => {
    if (!att.dataUrl) return;
    const link = document.createElement('a');
    link.href = att.dataUrl;
    link.download = att.fileName || 'attachment';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTriggerPrint = async (grn) => {
    setPrintGrnData(grn);
    setPrintLang('ar');

    try {
      await setDoc(
        doc(db, 'goods_receipts', grn.id),
        {
          lastPrintedAt: new Date().toISOString(),
          lastPrintedBy: currentUserName,
          lastPrintedVersion: grn.version || '1.0',
          printCount: (grn.printCount || 0) + 1,
        },
        { merge: true }
      );
    } catch (e) {
      console.error('Error logging print status:', e);
    }

    // Set document title to format the PDF export file name: "[Supplier Name] - [Doc ID]"
    const prevTitle = document.title;
    const safeSupplier = (grn.supplierName || 'Supplier').trim();
    document.title = `${safeSupplier} - ${grn.id}`;

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = prevTitle;
      }, 1000);
    }, 200);
  };

// Cancel Document (Receipt or Return): Reverses inventory stock movements & updates PO
  const handleCancelGrn = async (grnToCancel) => {
    if (!grnToCancel || grnToCancel.status === 'cancelled') return;
    if (!isGeneralAdmin && !isPurchasingAdmin) {
      alert(isAr ? 'عفواً، إلغاء الأذون متاح للمسؤولين فقط.' : 'Admin permission required to cancel document.');
      return;
    }

    const isDocReturn = grnToCancel.docType === 'return' || grnToCancel.id?.startsWith('RTN');
    const docLabel = isDocReturn ? (isAr ? 'إذن المرتجع' : 'Return') : (isAr ? 'إذن الاستلام' : 'GRN');

    const confirmMsg = isAr
      ? `هل أنت متأكد من إلغاء ${docLabel} (${grnToCancel.id})؟\nسيتم عكس جميع الحركات وتحديث أرصدة المخازن وحالة أمر الشراء المرتبط.`
      : `Are you sure you want to cancel ${docLabel} (${grnToCancel.id})?\nAll inventory movements will be reversed.`;

    if (!window.confirm(confirmMsg)) return;

    setIsSavingGrn(true);
    try {
      const batch = writeBatch(db);
      const grnRef = doc(db, 'goods_receipts', grnToCancel.id);
      const nextVer = getNextVersion(grnToCancel.version || '1.0');

      const newAudit = {
        version: nextVer,
        action: 'cancelled',
        status: 'cancelled',
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: `إلغاء ${docLabel} (${grnToCancel.id}) وعكس حركات المخزن بالكامل`,
        noteEn: `${docLabel} cancelled & all inventory movements reversed`,
      };

      batch.set(
        grnRef,
        {
          status: 'cancelled',
          version: nextVer,
          auditTrail: [...(grnToCancel.auditTrail || []), newAudit],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // If previously approved, reverse physical stock from Item Master
      if (grnToCancel.status === 'approved') {
        const itemDeltas = {};
        const signMultiplier = isDocReturn ? 1 : -1; // Reversing a return adds back (+), reversing a receipt deducts (-)

        (grnToCancel.lines || []).forEach((l) => {
          const qty = Number(l.receivedSmallUnits) || 0;
          const parentId = l.itemId || l.code?.split('-')[0];
          const vCode = l.variantCode || l.code;
          if (parentId && qty > 0) {
            if (!itemDeltas[parentId]) itemDeltas[parentId] = { total: 0, variants: {} };
            itemDeltas[parentId].total += qty * signMultiplier;
            if (vCode) itemDeltas[parentId].variants[vCode] = (itemDeltas[parentId].variants[vCode] || 0) + (qty * signMultiplier);

            // Ledger log for cancellation
            const ledgerRef = doc(collection(db, 'stock_ledger'));
            batch.set(ledgerRef, {
              grnId: grnToCancel.id,
              action: isDocReturn ? 'return_cancelled_restored' : 'receipt_cancelled_reversal',
              docType: grnToCancel.docType || (isDocReturn ? 'return' : 'receipt'),
              receivingType: grnToCancel.receivingType || 'direct',
              poId: grnToCancel.poId || null,
              itemId: parentId,
              variantCode: vCode,
              materialNameAr: l.nameAr,
              qty: qty * signMultiplier,
              unit: l.smallUnit,
              warehouse: l.targetWarehouse,
              supplierId: grnToCancel.supplierId,
              supplierName: grnToCancel.supplierName || '',
              receivedBy: currentUserName,
              timestamp: serverTimestamp(),
            });
          }
        });

        Object.entries(itemDeltas).forEach(([itemId, data]) => {
          const itemDoc = itemsMaster.find((i) => i.code === itemId);
          if (itemDoc) {
            const updatedVariations = (itemDoc.variations || []).map((v) => {
              const deltaQty = data.variants[v.variantCode] || 0;
              return {
                ...v,
                stock: Math.max(0, (Number(v.stock) || 0) + deltaQty),
              };
            });

            const updatedTotalStock = updatedVariations.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

            batch.set(
              doc(db, 'items', itemId),
              {
                stock: updatedTotalStock,
                variations: updatedVariations,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        });

        // Step down/recalculate linked PO status
        if (grnToCancel.poId) {
          const targetPo = purchaseOrders.find((p) => p.id === grnToCancel.poId);
          if (targetPo) {
            let totalRemainingReceived = 0;
            let totalOrdered = 0;
            let isAllCompleted = true;

            (targetPo.lines || []).forEach((poLine) => {
              const poLineKey = poLine.variantCode || poLine.code || poLine.itemId;
              let lineSum = 0;
              receipts
                .filter((r) => r.poId === grnToCancel.poId && r.status === 'approved' && r.id !== grnToCancel.id)
                .forEach((r) => {
                  (r.lines || []).forEach((l) => {
                    if ((l.variantCode || l.code || l.itemId) === poLineKey && (l.qcStatus === 'accepted' || r.docType === 'receipt')) {
                      const effQty = Number(l.receivedSmallUnits) || 0;
                      lineSum += r.docType === 'return' ? -effQty : effQty;
                    }
                  });
                });

              totalRemainingReceived += lineSum;
              const ord = Number(poLine.qty) || 0;
              totalOrdered += ord;
              if (lineSum < ord) isAllCompleted = false;
            });

            let newPoStatus = 'approved';
            if (totalRemainingReceived > 0) {
              newPoStatus = isAllCompleted ? 'delivered' : 'partially_delivered';
            }

            const newPoAudit = {
              version: targetPo.version || '1.0',
              action: 'document_cancelled_reversal',
              status: newPoStatus,
              performedBy: currentUserName,
              timestamp: new Date().toISOString(),
              noteAr: `إلغاء ${docLabel} (${grnToCancel.id}) - تحديث حالة أمر الشراء إلى (${newPoStatus})`,
              noteEn: `${docLabel} (${grnToCancel.id}) cancelled - PO status updated to (${newPoStatus})`,
            };

            batch.set(
              doc(db, 'purchase_orders', grnToCancel.poId),
              {
                status: newPoStatus,
                auditTrail: [...(targetPo.auditTrail || []), newPoAudit],
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      }

      await batch.commit();
      setShowModal(false);
      setEditingGrn(null);
    } catch (err) {
      console.error('Error cancelling document:', err);
      alert(isAr ? 'حدث خطأ أثناء إلغاء الإذن.' : 'Error cancelling document.');
    } finally {
      setIsSavingGrn(false);
    }
  };

  // Commit Document (Receipt / Return, Draft or Approved) + Unified Stock & PO Sync
  const handleSaveGrn = async (statusToSet = 'approved') => {
    if (!selectedSupplierId) {
      alert(isAr ? 'يرجى تحديد المورد المعتمد.' : 'Please select certified supplier.');
      return;
    }
    if (!receiptDate) {
      alert(isAr ? 'يرجى تحديد التاريخ.' : 'Please select date.');
      return;
    }

    const isReturn = docType === 'return';

    // Check mandatory variation assignment, warehouse & stock ceiling
    for (let idx = 0; idx < grnLines.length; idx++) {
      const line = grnLines[idx];
      if (!line.itemId) {
        alert(isAr ? `السطر ${idx + 1}: يرجى اختيار الخامة.` : `Row ${idx + 1}: Select item.`);
        return;
      }
      if (!line.variantCode) {
        alert(isAr ? `السطر ${idx + 1}: تنوع الخامة إلزامي.` : `Row ${idx + 1}: Variation is mandatory.`);
        return;
      }
      if (statusToSet === 'approved' && Number(line.receivedSmallUnits) <= 0) {
        alert(isAr ? `السطر ${idx + 1}: يرجى إدخال الكمية الفعلية للاعتماد.` : `Row ${idx + 1}: Enter actual quantity.`);
        return;
      }
      if (!line.targetWarehouse?.trim()) {
        alert(isAr ? `السطر ${idx + 1}: يرجى تحديد المخزن المستهدف.` : `Row ${idx + 1}: Specify warehouse.`);
        return;
      }

      // Strict Validation: Cannot return more than available stock in the SELECTED warehouse
      if (isReturn && statusToSet === 'approved') {
        const whStock = getWarehouseAvailableStock(line.variantCode, line.targetWarehouse);
        let effectiveMaxStock = whStock;
        if (editingGrn && editingGrn.status === 'approved') {
          const oldLine = (editingGrn.lines || []).find(
            (l) => (l.variantCode || l.code) === line.variantCode && l.targetWarehouse?.trim() === line.targetWarehouse?.trim()
          );
          if (oldLine) effectiveMaxStock += Number(oldLine.receivedSmallUnits) || 0;
        }

        const requestedQty = Number(line.receivedSmallUnits) || 0;
        if (requestedQty > effectiveMaxStock) {
          alert(
            isAr
              ? `السطر ${idx + 1}: الكمية المرتجعة (${requestedQty.toLocaleString()} ${line.smallUnit}) تتجاوز الرصيد المتاح في ${line.targetWarehouse} (${effectiveMaxStock.toLocaleString()} ${line.smallUnit}).`
              : `Row ${idx + 1}: Return quantity (${requestedQty}) exceeds available stock in ${line.targetWarehouse} (${effectiveMaxStock}).`
          );
          return;
        }
      }
    }

    setIsSavingGrn(true);
    try {
      const isNew = !editingGrn;
      const grnId = editingGrn ? editingGrn.id : generateDocId(docType);
      const currentVersion = editingGrn?.version || '1.0';
      const nextVersion = isNew ? '1.0' : getNextVersion(currentVersion);

      const docActionLabelAr = isReturn
        ? (isNew ? (statusToSet === 'draft' ? 'إنشاء مسودة إذن مرتجع' : 'إنشاء واعتماد إذن مرتجع خامات للمورد') : `تعديل إذن المرتجع (${formatVersionTag(nextVersion)})`)
        : (isNew ? (statusToSet === 'draft' ? 'إنشاء مسودة إذن استلام' : 'إنشاء وتوريد إذن الاستلام') : `تعديل واعتماد إذن الاستلام (${formatVersionTag(nextVersion)})`);

      const docActionLabelEn = isReturn
        ? (isNew ? (statusToSet === 'draft' ? 'Draft Return created' : 'Supplier Return Note created & stock deducted') : `Return modified (${formatVersionTag(nextVersion)})`)
        : (isNew ? (statusToSet === 'draft' ? 'Draft GRN created' : 'GRN created & stock received') : `GRN modified (${formatVersionTag(nextVersion)})`);

      const existingAudit = editingGrn?.auditTrail || [];
      const newAuditEntry = {
        version: nextVersion,
        action: isNew ? (statusToSet === 'draft' ? 'draft_created' : 'created') : (statusToSet === 'draft' ? 'draft_saved' : 'modified_approved'),
        status: statusToSet,
        docType: docType,
        performedBy: currentUserName,
        timestamp: new Date().toISOString(),
        noteAr: docActionLabelAr,
        noteEn: docActionLabelEn,
      };

      const batch = writeBatch(db);

      const getParentItemId = (line) => {
        if (line.itemId && line.itemId.trim()) return line.itemId.trim();
        if (line.code) {
          const parts = line.code.split('-');
          if (parts.length >= 3) return `${parts[0]}-${parts[1]}`;
          if (parts.length === 2 && !isNaN(parts[1])) return `${parts[0]}-${parts[1]}`;
          return parts[0];
        }
        return '';
      };

      const getVariantCode = (line) => {
        if (line.variantCode && line.variantCode.trim()) return line.variantCode.trim();
        if (line.code && line.code.trim()) return line.code.trim();
        return '';
      };

      // 1. Build & Save Document Payload
      const grnPayload = {
        id: grnId,
        docType: docType,
        receivingType,
        poId: receivingType === 'po_linked' ? selectedPoId : null,
        supplierId: selectedSupplierId,
        supplierName: selectedSupplier?.name || '',
        receiptDate,
        supplierDeliveryNote,
        vehiclePlateNumber,
        isTaxOfficial: Boolean(isTaxOfficial),
        taxInvoiceNumber: isTaxOfficial && !isReturn ? taxInvoiceNumber : '',
        taxInvoiceDate: isTaxOfficial && !isReturn ? taxInvoiceDate : '',
        creditNoteNumber: isTaxOfficial && isReturn ? creditNoteNumber : '',
        creditNoteDate: isTaxOfficial && isReturn ? creditNoteDate : '',
        etaPortalRegistered: isTaxOfficial ? Boolean(etaPortalRegistered) : false,
        notes,
        status: statusToSet,
        version: nextVersion,
        auditTrail: [...existingAudit, newAuditEntry],
        lines: grnLines.map((l, lIdx) => {
          const autoLotNo = isReturn
            ? (l.lotNumber || (l.linkedGrnId ? `${l.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}` : ''))
            : (l.lotNumber || `${grnId}-${String(lIdx + 1).padStart(2, '0')}`);

          return {
            lotNumber: autoLotNo,
            linkedGrnId: l.linkedGrnId || '',
            itemId: getParentItemId(l),
            code: getVariantCode(l) || getParentItemId(l),
            variantCode: getVariantCode(l),
            variantSuffix: l.variantSuffix || '',
            nameAr: l.nameAr,
            nameEn: l.nameEn || '',
            specs: l.specs || '',
            targetWarehouse: l.targetWarehouse.trim(),
            largeUnitName: l.largeUnitName || 'كرتونة',
            receivedLargeUnits: Number(l.receivedLargeUnits) || 0,
            packagingRatio: Number(l.packagingRatio) || 0,
            smallUnit: l.smallUnit || 'عبوة',
            receivedSmallUnits: Number(l.receivedSmallUnits) || 0,
            unitPrice: l.unitPrice !== '' ? Number(l.unitPrice) : '',
            currency: l.currency || 'EGP',
            vatPercent: Number(l.vatPercent) || 0,
            whtPercent: Number(l.whtPercent) || 0,
            hasBatchTracking: Boolean(l.hasBatchTracking),
            supplierBatchNo: l.supplierBatchNo || '',
            productionDate: l.productionDate || '',
            expiryDate: l.expiryDate || '',
            qcStatus: isReturn ? 'rejected' : (l.qcStatus || 'accepted'),
            rejectionReason: l.rejectionReason || '',
          };
        }),
        financials: computedTotals,
        receivedBy: editingGrn?.receivedBy || currentUserName,
        updatedAt: serverTimestamp(),
      };

      if (isNew) grnPayload.createdAt = serverTimestamp();

      batch.set(doc(db, 'goods_receipts', grnId), grnPayload, { merge: true });

      // 2. Process Physical Stock & Variations ONLY IF status is 'approved' or transitioning from approved
      const wasPreviouslyApproved = editingGrn && editingGrn.status === 'approved';
      const isNowApproved = statusToSet === 'approved';

      if (isNowApproved || wasPreviouslyApproved) {
        const oldIncrements = {};
        if (wasPreviouslyApproved) {
          const oldIsReturn = editingGrn.docType === 'return' || editingGrn.id?.startsWith('RTN');
          const oldSign = oldIsReturn ? -1 : 1;

          (editingGrn.lines || []).forEach((l) => {
            const qty = (Number(l.receivedSmallUnits) || 0) * oldSign;
            const parentId = getParentItemId(l);
            const vCode = getVariantCode(l);

            if (parentId) {
              if (!oldIncrements[parentId]) oldIncrements[parentId] = { total: 0, variants: {} };
              oldIncrements[parentId].total += qty;
              if (vCode) {
                oldIncrements[parentId].variants[vCode] = (oldIncrements[parentId].variants[vCode] || 0) + qty;
              }
            }
          });
        }

        const newIncrements = {};
        if (isNowApproved) {
          const newSign = isReturn ? -1 : 1; // Returns deduct stock from warehouse

          grnLines.forEach((l) => {
            const rawQty = Number(l.receivedSmallUnits) || 0;
            const qty = rawQty * newSign;
            const parentId = getParentItemId(l);
            const vCode = getVariantCode(l);

            if (parentId) {
              if (!newIncrements[parentId]) newIncrements[parentId] = { total: 0, variants: {} };
              newIncrements[parentId].total += qty;
              if (vCode) {
                newIncrements[parentId].variants[vCode] = (newIncrements[parentId].variants[vCode] || 0) + qty;
              }
            }

            const assignedLotNo = isReturn
              ? (l.lotNumber || (l.linkedGrnId ? `${l.linkedGrnId}-${String(newIncrements[parentId]?.count || 1).padStart(2, '0')}` : ''))
              : (l.lotNumber || `${grnId}-${String(Object.keys(newIncrements).indexOf(parentId) + 1).padStart(2, '0')}`);

            // Write stock movement ledger with full Lot Passport
            const ledgerRef = doc(collection(db, 'stock_ledger'));
            batch.set(ledgerRef, {
              grnId,
              lotNumber: assignedLotNo,
              linkedGrnId: l.linkedGrnId || null,
              action: isReturn ? 'supplier_return' : (isNew ? 'initial_receipt' : 'receipt_modified'),
              docType: docType,
              receivingType,
              poId: receivingType === 'po_linked' ? selectedPoId : null,
              itemId: parentId,
              variantCode: vCode,
              materialNameAr: l.nameAr,
              qty: qty, // Negative for return, positive for receipt
              unit: l.smallUnit,
              warehouse: l.targetWarehouse,
              supplierId: selectedSupplierId,
              supplierName: selectedSupplier?.name || '',
              receiptDate: receiptDate,
              batchNo: l.supplierBatchNo || 'N/A',
              productionDate: l.productionDate || null,
              expiryDate: l.expiryDate || null,
              unitPrice: Number(l.unitPrice) || 0,
              currency: l.currency || 'EGP',
              packagingRatio: Number(l.packagingRatio) || 1,
              specs: l.specs || '',
              totalValue: (Number(l.unitPrice) || 0) * Math.abs(qty),
              receivedBy: currentUserName,
              timestamp: serverTimestamp(),
            });
          });
        }

        // Collect all affected Item Master records
        const allAffectedItemIds = new Set([
          ...Object.keys(oldIncrements),
          ...Object.keys(newIncrements),
          ...grnLines.map((l) => getParentItemId(l)).filter(Boolean)
        ]);

        allAffectedItemIds.forEach((itemId) => {
          const itemMasterDoc = itemsMaster.find((i) => i.code === itemId);
          if (itemMasterDoc) {
            let workingVariations = [...(itemMasterDoc.variations || [])];

            // Append newly defined variations (if direct receipt)
            grnLines
              .filter((l) => l.isNewVariant && getParentItemId(l) === itemId)
              .forEach((l) => {
                const vCode = getVariantCode(l);
                const exists = workingVariations.some((v) => v.variantCode === vCode);
                if (!exists) {
                  const validSpecsArray = (l.specsList || []).filter((s) => s.label?.trim() && s.value?.trim());
                  const mergedSpecsStr = validSpecsArray.map((s) => `${s.label.trim()}: ${s.value.trim()}`).join(' | ');

                  workingVariations.push({
                    suffix: l.variantSuffix,
                    variantCode: vCode,
                    supplierId: selectedSupplierId,
                    supplierName: selectedSupplier?.name || '',
                    packagingRatio: Number(l.packagingRatio) || 0,
                    smallUnit: l.smallUnit || itemMasterDoc.smallUnit || 'عبوة',
                    largeUnitName: l.largeUnitName || itemMasterDoc.largeUnitName || 'كرتونة',
                    specs: validSpecsArray.length > 0 ? validSpecsArray : [{ label: 'المواصفات', value: l.specs || '' }],
                    mergedSpecs: mergedSpecsStr || l.specs || '',
                    stock: 0,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                  });
                }
              });

            // Adjust variant-level stocks: netDelta = (newEffect - oldEffect)
            const updatedVariations = workingVariations.map((v) => {
              const oldVarQty = oldIncrements[itemId]?.variants[v.variantCode] || 0;
              const newVarQty = newIncrements[itemId]?.variants[v.variantCode] || 0;
              const netDelta = newVarQty - oldVarQty;
              const currentVarStock = Number(v.stock) || 0;
              return {
                ...v,
                stock: Math.max(0, currentVarStock + netDelta),
              };
            });

            // Calculate parent total stock
            const calculatedTotalStock = updatedVariations.reduce(
              (sum, v) => sum + (Number(v.stock) || 0),
              0
            );

            batch.set(
              doc(db, 'items', itemId),
              {
                stock: calculatedTotalStock,
                variations: updatedVariations,
                variationsCount: updatedVariations.length,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        });

        // Dynamic PO Status Synchronization & Over-Delivery Fulfillment Logic
        if (receivingType === 'po_linked' && selectedPoId) {
          const targetPo = purchaseOrders.find((p) => p.id === selectedPoId);
          if (targetPo) {
            let isAllCompleted = true;
            let totalReceivedAcrossAllLines = 0;
            let totalOrderedAcrossAllLines = 0;

            (targetPo.lines || []).forEach((poLine) => {
              const poLineKey = poLine.variantCode || poLine.code || poLine.itemId;
              
              let prevSum = 0;
              receipts
                .filter((r) => r.poId === selectedPoId && r.status === 'approved' && r.id !== grnId)
                .forEach((r) => {
                  (r.lines || []).forEach((l) => {
                    const grnKey = l.variantCode || l.code || l.itemId;
                    if (grnKey === poLineKey && (l.qcStatus === 'accepted' || r.docType === 'receipt')) {
                      const eff = Number(l.receivedSmallUnits) || 0;
                      prevSum += r.docType === 'return' ? -eff : eff;
                    }
                  });
                });

              const currentGrnLine = isNowApproved
                ? grnLines.find((l) => (l.variantCode || l.code || l.itemId) === poLineKey)
                : null;
              const currentRaw = currentGrnLine && (currentGrnLine.qcStatus === 'accepted' || !isReturn)
                ? Number(currentGrnLine.receivedSmallUnits) || 0
                : 0;
              const currentEffective = isReturn ? -currentRaw : currentRaw;

              const totalCumulativeLineReceived = prevSum + currentEffective;
              const orderedLineQty = Number(poLine.qty) || 0;

              totalReceivedAcrossAllLines += totalCumulativeLineReceived;
              totalOrderedAcrossAllLines += orderedLineQty;

              if (totalCumulativeLineReceived < orderedLineQty) {
                isAllCompleted = false;
              }
            });

            let nextPoStatus = 'approved';
            if (totalReceivedAcrossAllLines > 0) {
              nextPoStatus = isAllCompleted ? 'delivered' : 'partially_delivered';
            }

            const existingAuditPo = targetPo.auditTrail || [];
            const newAuditEntryPo = {
              version: targetPo.version || '1.0',
              action: isReturn ? 'goods_returned_deduction' : (nextPoStatus === 'delivered' ? 'order_fully_delivered' : 'partial_delivery_received'),
              status: nextPoStatus,
              performedBy: currentUserName,
              timestamp: new Date().toISOString(),
              noteAr: isReturn
                ? `تسجيل إذن مرتجع (${grnId}) - خصم الكميات المرتجعة وتحديث حالة أمر الشراء إلى (${nextPoStatus})`
                : (nextPoStatus === 'delivered'
                    ? (totalReceivedAcrossAllLines > totalOrderedAcrossAllLines
                        ? `استلام إذن توريد (${grnId}) - اكتمل التوريد بالكامل مع استلام كمية إضافية (+${(totalReceivedAcrossAllLines - totalOrderedAcrossAllLines).toLocaleString()})`
                        : `استلام إذن توريد (${grnId}) - اكتمل التوريد بالكامل بمطابقة الكميات المطلوبة`)
                    : `استلام إذن توريد (${grnId}) - توريد جزئي (${totalReceivedAcrossAllLines.toLocaleString()} من أصل ${totalOrderedAcrossAllLines.toLocaleString()})`),
              noteEn: isReturn
                ? `Return Note (${grnId}) - Quantities deducted, PO status set to (${nextPoStatus})`
                : `Goods receipt (${grnId}) - PO status updated to (${nextPoStatus})`,
            };

            batch.set(
              doc(db, 'purchase_orders', selectedPoId),
              {
                status: nextPoStatus,
                auditTrail: [...existingAuditPo, newAuditEntryPo],
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      }

      await batch.commit();
      setShowModal(false);
      setEditingGrn(null);
    } catch (err) {
      console.error('Error saving document:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ الإذن في السحابة.' : 'Error saving document.');
    } finally {
      setIsSavingGrn(false);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSupplierFilter('all');
    setWarehouseFilter('all');
    setMaterialFilter('all');
    setPrintFilter('all');
    setTaxFilter('all');
  };

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      // Strictly quarantine Goods Receipts tab to actual vendor receipts and returns
      if (r.docType === 'inventory_reconciliation' || r.isDirectAdjustment || r.docType === 'opening_balance') {
        return false;
      }

      const isReturn = r.docType === 'return' || r.id?.startsWith('RTN');
      const matchDocType =
        docTypeFilter === 'all' ||
        (docTypeFilter === 'return' && isReturn) ||
        (docTypeFilter === 'receipt' && !isReturn);
      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        !term ||
        r.id?.toLowerCase().includes(term) ||
        r.supplierName?.toLowerCase().includes(term) ||
        r.poId?.toLowerCase().includes(term) ||
        r.supplierDeliveryNote?.toLowerCase().includes(term) ||
        r.lines?.some(
          (l) =>
            l.nameAr?.toLowerCase().includes(term) ||
            l.nameEn?.toLowerCase().includes(term) ||
            l.code?.toLowerCase().includes(term) ||
            l.variantCode?.toLowerCase().includes(term) ||
            l.specs?.toLowerCase().includes(term) ||
            l.targetWarehouse?.toLowerCase().includes(term)
        );

      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchType = typeFilter === 'all' || r.receivingType === typeFilter;
      const matchSupplier = supplierFilter === 'all' || r.supplierId === supplierFilter;
      const matchWarehouse =
        warehouseFilter === 'all' ||
        r.lines?.some((l) => l.targetWarehouse?.trim() === warehouseFilter.trim());
      const matchMaterial =
        materialFilter === 'all' ||
        r.lines?.some((l) => l.itemId === materialFilter || l.code === materialFilter);

      const matchPrint =
        printFilter === 'all' ||
        (printFilter === 'printed' && Boolean(r.lastPrintedAt)) ||
        (printFilter === 'not_printed' && !r.lastPrintedAt);

      const matchTax =
        taxFilter === 'all' ||
        (taxFilter === 'tax_verified' && r.isTaxOfficial && Boolean(r.taxInvoiceNumber) && Boolean(r.etaPortalRegistered)) ||
        (taxFilter === 'tax_incomplete' && r.isTaxOfficial && (!r.taxInvoiceNumber || !r.etaPortalRegistered)) ||
        (taxFilter === 'non_taxable' && !r.isTaxOfficial);

      return (
        matchDocType &&
        matchSearch &&
        matchStatus &&
        matchType &&
        matchSupplier &&
        matchWarehouse &&
        matchMaterial &&
        matchPrint &&
        matchTax
      );
    });
  }, [
    receipts,
    searchTerm,
    docTypeFilter,
    statusFilter,
    typeFilter,
    supplierFilter,
    warehouseFilter,
    materialFilter,
    printFilter,
    taxFilter,
  ]);

  const isReadOnly = modalMode === 'view_readonly';

  return (
    <div className="space-y-5">
      {/* Modern Print CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-grn-slip, #printable-grn-slip * {
            visibility: visible !important;
          }
          #printable-grn-slip {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 9999999 !important;
          }
          .no-print-area {
            display: none !important;
          }
        }
      `}} />

      {/* Top Filter & Control Panel */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              placeholder={isAr ? 'بحث برقم الإذن، أمر الشراء، المورد، اسم الخامة، التنوع، أو المواصفات...' : 'Search GRN, PO, supplier, material, variation, or specs...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Action Buttons: GRN + RTV Return */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleOpenCreate('return')}
              className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>{isAr ? 'إذن مرتجع خامات للمورد (RTV)' : 'Supplier Return (RTV)'}</span>
            </button>

            <button
              onClick={() => handleOpenCreate('receipt')}
              className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>{isAr ? 'إذن استلام خامات جديد (GRN)' : 'New Goods Receipt (GRN)'}</span>
            </button>
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'نوع الحركة:' : 'Operation Type:'}</label>
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="w-full p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-700 text-xs"
            >
              <option value="all">{isAr ? 'جميع الحركات' : 'All Operations'}</option>
              <option value="receipt">{isAr ? 'أذون استلام (GRN)' : 'Receipts (GRN)'}</option>
              <option value="return">{isAr ? 'أذون مرتجع (RTV)' : 'Returns (RTV)'}</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              {isAr ? 'المورد (سجلات حية):' : 'Supplier (Live):'}
            </label>
            <SearchableSelect
              value={supplierFilter === 'all' ? '' : supplierFilter}
              onChange={(val) => setSupplierFilter(val || 'all')}
              options={availableFilterSuppliers}
              placeholder={isAr ? 'جميع الموردين' : 'All Suppliers'}
              emptyText={isAr ? 'لا توجد سجلات' : 'No records'}
              isAr={isAr}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              {isAr ? 'الخامة (سجلات حية):' : 'Material (Live):'}
            </label>
            <SearchableSelect
              value={materialFilter === 'all' ? '' : materialFilter}
              onChange={(val) => setMaterialFilter(val || 'all')}
              options={availableFilterMaterials}
              placeholder={isAr ? 'جميع الخامات' : 'All Materials'}
              emptyText={isAr ? 'لا توجد سجلات' : 'No records'}
              isAr={isAr}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'المخزن المستلم:' : 'Warehouse:'}</label>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="w-full p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-700 text-xs"
            >
              <option value="all">{isAr ? 'جميع المخازن' : 'All Warehouses'}</option>
              {warehousesList.map((wh) => (
                <option key={wh.code || wh.id} value={wh.nameAr}>
                  [{wh.code}] {isAr ? wh.nameAr : (wh.nameEn || wh.nameAr)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'طريقة الاستلام:' : 'Type:'}</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-700 text-xs"
            >
              <option value="all">{isAr ? 'جميع الطرق' : 'All Types'}</option>
              <option value="direct">{isAr ? 'توريد مباشر' : 'Direct'}</option>
              <option value="po_linked">{isAr ? 'بأمر شراء (PO)' : 'PO-Linked'}</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'حالة الإذن:' : 'Status:'}</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-700 text-xs"
            >
              <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="approved">{isAr ? 'معتمد ومضاف' : 'Approved'}</option>
              <option value="draft">{isAr ? 'مسودة مؤقتة' : 'Draft'}</option>
              <option value="cancelled">{isAr ? 'ملغي' : 'Cancelled'}</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'حالة الطباعة:' : 'Print Status:'}</label>
            <select
              value={printFilter}
              onChange={(e) => setPrintFilter(e.target.value)}
              className="w-full p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-700 text-xs"
            >
              <option value="all">{isAr ? 'الكل' : 'All'}</option>
              <option value="printed">{isAr ? 'تمت الطباعة' : 'Printed'}</option>
              <option value="not_printed">{isAr ? 'غير مطبوع' : 'Not Printed'}</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">{isAr ? 'البيانات الضريبية:' : 'Tax & ETA:'}</label>
            <select
              value={taxFilter}
              onChange={(e) => setTaxFilter(e.target.value)}
              className="w-full p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-700 text-xs"
            >
              <option value="all">{isAr ? 'الكل' : 'All'}</option>
              <option value="tax_verified">{isAr ? 'ضريبية مكتملة وموثقة' : 'Tax Official & Registered'}</option>
              <option value="tax_incomplete">{isAr ? 'ضريبية بيانات ناقصة' : 'Taxable (Incomplete)'}</option>
              <option value="non_taxable">{isAr ? 'توريد غير ضريبي' : 'Non-Taxable'}</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleResetFilters}
              className="w-full py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Receipts Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[320px]">
        <table className="w-full text-start border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
              <th className="p-3.5 text-start">{isAr ? 'تاريخ الاستلام والرقم' : 'Receipt Date & ID'}</th>
              <th className="p-3.5 text-start">{isAr ? 'المورد والمرجع' : 'Supplier & Reference'}</th>
              <th className="p-3.5 text-start">{isAr ? 'الخامات والكميات المستلمة' : 'Materials & Total Qty'}</th>
              <th className="p-3.5 text-start">{isAr ? 'المخزن المستلم' : 'Target Warehouse'}</th>
              <th className="p-3.5 text-start">{isAr ? 'القيمة الإجمالية' : 'Total Net Value'}</th>
              <th className="p-3.5 text-start">{isAr ? 'الحالة والتوثيق' : 'Status & Docs'}</th>
              <th className="p-3.5 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <PeacockLoader size="lg" text={isAr ? 'جاري تحميل أذون الاستلام والمرتجعات...' : 'Loading Goods Receipts & Returns...'} />
                </td>
              </tr>
            ) : filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد أذون استلام مطابقة للفلاتر المحددة.' : 'No goods receipts match the selected filters.'}
                </td>
              </tr>
            ) : (
              filteredReceipts.map((grn) => {
                const isPriced = grn.financials?.hasPricing;
                const canEdit = canEditGrn(grn);
                const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');

                return (
                  <tr key={grn.id} className={`transition ${isReturn ? 'bg-rose-50/40 hover:bg-rose-50/70 border-s-4 border-s-rose-500' : 'hover:bg-slate-50/60'}`}>
                    <td className="p-3.5 align-top">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        {isReturn ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                            <ArrowUpRight className="h-3 w-3 text-rose-600" />
                            <span>{isAr ? 'مرتجع مورد' : 'Return'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                            <span>{isAr ? 'إذن استلام' : 'Receipt'}</span>
                          </span>
                        )}
                        <span className="text-slate-700">{grn.receiptDate}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <span className="font-bold">{grn.id}</span>
                        <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1 rounded font-bold">
                          {formatVersionTag(grn.version)}
                        </span>
                      </div>
                    </td>

                    <td className="p-3.5 align-top">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{grn.supplierName}</span>
                      </div>
                      <div className="mt-1 ps-5">
                        {grn.receivingType === 'po_linked' ? (
                          <span className="font-mono text-[11px] text-slate-500 font-medium">
                            PO: {grn.poId}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            {isReturn ? (isAr ? 'مرتجع مباشر' : 'Direct Return') : (isAr ? 'توريد مباشر' : 'Direct')}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5 align-top space-y-1.5">
                      {grn.lines?.map((line, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 text-slate-800">
                          <span className="font-semibold truncate max-w-[200px]" title={line.nameAr}>
                            {line.nameAr}
                          </span>
                          <span className={`font-mono font-extrabold text-end whitespace-nowrap ${isReturn ? 'text-rose-700' : 'text-slate-900'}`}>
                            {isReturn ? '-' : ''}{Number(line.receivedSmallUnits).toLocaleString()} <span className="text-[11px] text-slate-500 font-normal">{line.smallUnit}</span>
                          </span>
                        </div>
                      ))}
                    </td>

                    <td className="p-3.5 align-top">
                      {Array.from(new Set(grn.lines?.map((l) => l.targetWarehouse))).map((wh, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-slate-700 font-medium mb-0.5">
                          <Warehouse className={`h-3.5 w-3.5 shrink-0 ${isReturn ? 'text-rose-600' : 'text-emerald-600'}`} />
                          <span>{wh}</span>
                        </div>
                      ))}
                    </td>

                    <td className="p-3.5 align-top">
                      {!canViewTotals || !canViewPrices ? (
                        <span className="text-slate-400 font-mono italic">
                          {isAr ? 'محجوب (صلاحية مقيدة)' : 'Hidden (Restricted)'}
                        </span>
                      ) : isPriced ? (
                        <div>
                          <span className={`font-mono font-bold text-xs block ${isReturn ? 'text-rose-700' : 'text-slate-900'}`}>
                            {isReturn ? '-' : ''}{grn.financials.netPayable?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-[11px] font-semibold text-slate-500">{grn.financials.currency || 'EGP'}</span>
                          </span>
                          {grn.isTaxOfficial && (
                            <span className={`text-[10px] font-medium block mt-0.5 ${isReturn ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {isAr ? (isReturn ? 'إشعار خصم/إضافة ضريبي' : 'شامل ض.ق.م') : 'Tax Adjusted'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono italic">
                          {isAr ? 'غير مسعر' : 'Unpriced'}
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 align-top">
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {/* 1. Workflow Status Icon */}
                        {grn.status === 'approved' ? (
                          <div
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-help transition hover:scale-105"
                            title={`${isAr ? 'الحالة: معتمد ومضاف للمخزن' : 'Status: Approved & In-Stock'}\n${isAr ? 'المستلم' : 'Received By'}: ${grn.receivedBy || (isAr ? 'أمين المخزن' : 'Storekeeper')}\n${isAr ? 'التاريخ والوقت' : 'Date & Time'}: ${formatGrnDateTime(grn)}`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                        ) : grn.status === 'draft' ? (
                          <div
                            className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 cursor-help transition hover:scale-105"
                            title={`${isAr ? 'الحالة: مسودة مؤقتة' : 'Status: Draft'}\n${isAr ? 'المخزن: لم يتم التوريد للأرصدة بعد' : 'Stock: Not posted to inventory'}\n${isAr ? 'التاريخ والوقت' : 'Date & Time'}: ${formatGrnDateTime(grn)}`}
                          >
                            <Clock className="h-4 w-4" />
                          </div>
                        ) : (
                          <div
                            className="p-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 cursor-help transition hover:scale-105"
                            title={`${isAr ? 'الحالة: ملغي ومستبعد من الأرصدة' : 'Status: Cancelled'}\n${isAr ? 'الإجراء: تم عكس حركة المخزن بالكامل' : 'Stock: Movements reversed'}\n${isAr ? 'التاريخ والوقت' : 'Date & Time'}: ${formatGrnDateTime(grn)}`}
                          >
                            <Ban className="h-4 w-4" />
                          </div>
                        )}

                        {/* 2. Print Status Icon */}
                        {grn.lastPrintedAt ? (
                          <div
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 cursor-help transition hover:scale-105"
                            title={`${isAr ? 'الطباعة: طُبع' : 'Print: Printed'} (${formatVersionTag(grn.lastPrintedVersion || grn.version)})\n${isAr ? 'مرات الطباعة' : 'Print Count'}: ${grn.printCount || 1}\n${isAr ? 'آخر طباعة' : 'Last Printed By'}: ${grn.lastPrintedBy || 'أمين المخزن'}`}
                          >
                            <Printer className="h-4 w-4" />
                          </div>
                        ) : (
                          <div
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 cursor-help transition hover:scale-105"
                            title={isAr ? 'الطباعة: غير مطبوع' : 'Print: Not Printed'}
                          >
                            <Printer className="h-4 w-4" />
                          </div>
                        )}

                        {/* 3. Tax / Credit Note / ETA Compliance Icon */}
                        {grn.isTaxOfficial ? (
                          isReturn ? (
                            grn.creditNoteNumber && grn.etaPortalRegistered ? (
                              <div
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-help transition hover:scale-105"
                                title={`${isAr ? 'النوع: إشعار دائن ضريبي معتمد' : 'Type: Tax Credit Note'}\n${isAr ? 'رقم إشعار الدائن' : 'Credit Note #'}: ${grn.creditNoteNumber}\n${isAr ? 'منظومة الضرائب (ETA): موثق ومسجل' : 'ETA Portal: Verified & Registered'}`}
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </div>
                            ) : (
                              <div
                                className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-300 cursor-help transition hover:scale-105"
                                title={`${isAr ? 'النوع: إشعار دائن (بيانات ناقصة)' : 'Type: Credit Note (Incomplete)'}\n${isAr ? 'رقم إشعار الدائن' : 'Credit Note #'}: ${grn.creditNoteNumber || (isAr ? 'مفقود / غير مسجل' : 'Missing')}\n${isAr ? 'منظومة الضرائب (ETA)' : 'ETA Portal'}: ${grn.etaPortalRegistered ? (isAr ? 'مسجل' : 'Registered') : (isAr ? 'غير مسجل' : 'Not Registered')}`}
                              >
                                <AlertTriangle className="h-4 w-4" />
                              </div>
                            )
                          ) : (
                            grn.taxInvoiceNumber && grn.etaPortalRegistered ? (
                              <div
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-help transition hover:scale-105"
                                title={`${isAr ? 'النوع: فاتورة ضريبية رسمية' : 'Type: Official Tax Invoice'}\n${isAr ? 'رقم الفاتورة' : 'Invoice #'}: ${grn.taxInvoiceNumber}\n${isAr ? 'منظومة الضرائب (ETA): موثقة ومسجلة' : 'ETA Portal: Verified & Registered'}`}
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </div>
                            ) : (
                              <div
                                className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-300 cursor-help transition hover:scale-105"
                                title={`${isAr ? 'النوع: معاملة ضريبية (بيانات ناقصة)' : 'Type: Taxable (Incomplete)'}\n${isAr ? 'رقم الفاتورة' : 'Invoice #'}: ${grn.taxInvoiceNumber || (isAr ? 'مفقود / غير مسجل' : 'Missing')}\n${isAr ? 'منظومة الضرائب (ETA)' : 'ETA Portal'}: ${grn.etaPortalRegistered ? (isAr ? 'مسجلة' : 'Registered') : (isAr ? 'غير مسجلة' : 'Not Registered')}`}
                              >
                                <AlertTriangle className="h-4 w-4" />
                              </div>
                            )
                          )
                        ) : (
                          <div
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 cursor-help transition hover:scale-105"
                            title={isAr ? (isReturn ? 'النوع: مرتجع داخلي / غير ضريبي' : 'النوع: توريد داخلي / غير ضريبي') : (isReturn ? 'Type: Internal Return' : 'Type: Internal Receipt')}
                          >
                            <Receipt className="h-4 w-4" />
                          </div>
                        )}

                        {/* 4. Attachment Status Icon & Popover Trigger */}
                        {grn.attachments && grn.attachments.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeAttachmentPopover?.id === grn.id) {
                                setActiveAttachmentPopover(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveAttachmentPopover({
                                  id: grn.id,
                                  grn,
                                  top: rect.bottom + 6,
                                  left: rect.left,
                                  right: window.innerWidth - rect.right,
                                });
                              }
                            }}
                            className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition cursor-pointer flex items-center gap-0.5 shadow-2xs"
                            title={isAr ? `يوجد ${grn.attachments.length} مرفقات ووثائق مسجلة` : `${grn.attachments.length} attachments available`}
                          >
                            <Paperclip className="h-4 w-4" />
                            <span className="text-[10px] font-extrabold">{grn.attachments.length}</span>
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5 align-top text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenView(grn)}
                          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'معاينة إذن الاستلام والمواصفات' : 'View Full Details & Specs'}
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleOpenAttachmentModal(grn)}
                          className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'إدارة المرفقات والوثائق' : 'Manage Attachments'}
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>

                        {canEdit ? (
                          <button
                            onClick={() => handleOpenEdit(grn)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'تعديل إذن الاستلام وتحديث الأرصدة' : 'Edit GRN'}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            disabled
                            className="p-1.5 text-slate-300 cursor-not-allowed"
                            title={isAr ? 'التعديل متاح في نفس يوم الاستلام فقط أو بواسطة المسؤول العام' : 'Edit locked'}
                          >
                            <Lock className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          onClick={() => setAuditGrnData(grn)}
                          className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'سجل المراجعة والاعتمادات (Audit Trail)' : 'View Audit Trail'}
                        >
                          <History className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleTriggerPrint(grn)}
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'طباعة إذن الاستلام' : 'Print GRN'}
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

      {/* Fully Redesigned & Polished High-Contrast Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl max-w-5xl w-full p-6 shadow-2xl border-2 border-slate-300 max-h-[92vh] overflow-y-auto space-y-5">
            {/* Sticky Modal Header */}
            <div className="sticky -top-6 -mt-6 pt-6 bg-slate-100 z-30 flex justify-between items-start pb-4 border-b-2 border-slate-200 gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 text-white rounded-2xl shadow-sm ${docType === 'return' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                  {docType === 'return' ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownLeft className="h-6 w-6" />}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {docType === 'return'
                      ? modalMode === 'view_readonly'
                        ? (isAr ? `معاينة إذن مرتجع خامات للمورد (${viewingReceipt?.id})` : `Inspect Supplier Return (${viewingReceipt?.id})`)
                        : modalMode === 'edit'
                        ? (isAr ? `تعديل إذن مرتجع خامات للمورد (${editingGrn?.id})` : `Edit Supplier Return (${editingGrn?.id})`)
                        : (isAr ? 'إذن مرتجع خامات ومستلزمات إنتاج للمورد (RTV)' : 'New Supplier Return Note (RTV)')
                      : modalMode === 'view_readonly'
                      ? (isAr ? `معاينة إذن استلام خامات (${viewingReceipt?.id})` : `Inspect Goods Receipt (${viewingReceipt?.id})`)
                      : modalMode === 'edit'
                      ? (isAr ? `تعديل إذن استلام خامات (${editingGrn?.id})` : `Edit Goods Receipt (${editingGrn?.id})`)
                      : (isAr ? 'إذن استلام وتوريد خامات ومستلزمات إنتاج (GRN)' : 'New Goods Receipt Note (GRN)')
                    }
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    {isAr
                      ? 'الاستلام الفعلي، تعيين تنوعات الخامات الإلزامية، الشدة، والضرائب'
                      : 'Actual counted receiving, mandatory variant mapping, packaging ratios, and taxation'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isReadOnly && modalMode === 'create' && docType === 'receipt' && (
                  <div className="flex items-center bg-white p-1 rounded-2xl border border-slate-300 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleReceivingTypeChange('direct')}
                      className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                        receivingType === 'direct' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isAr ? '١- توريد مباشر (افتراضي)' : '1. Direct (Default)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReceivingTypeChange('po_linked')}
                      className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                        receivingType === 'po_linked' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isAr ? '٢- بموجب أمر شراء (PO)' : '2. PO-Linked'}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingGrn(null);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-800 hover:bg-white rounded-2xl transition cursor-pointer border border-slate-200 shadow-2xs"
                  title={isAr ? 'إغلاق' : 'Close'}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* SECTION 1: Supplier & Basic Metadata Card */}
            <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="p-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg">
                  <Building2 className="h-4 w-4" />
                </div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  {isAr ? '١- بيانات المورد وإذن التسليم' : '1. Supplier & Delivery Metadata'}
                </h4>
              </div>

              <div className={`grid grid-cols-1 ${docType === 'return' ? 'sm:grid-cols-2' : receivingType === 'po_linked' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3 text-xs`}>
                {receivingType === 'po_linked' && docType !== 'return' && (
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      {isAr ? 'أمر الشراء المعتمد *' : 'Approved Purchase Order *'}
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={selectedPoId}
                      onChange={(e) => handlePoSelect(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-100"
                    >
                      <option value="">{isAr ? '-- اختر أمر الشراء --' : '-- Select PO --'}</option>
                      {receivablePurchaseOrders.map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.id} • {po.supplierName} ({po.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {isAr ? 'المورد المعتمد *' : 'Certified Supplier *'}
                  </label>
                  <SearchableSelect
                    disabled={isReadOnly || receivingType === 'po_linked'}
                    value={selectedSupplierId}
                    onChange={(val) => setSelectedSupplierId(val)}
                    options={suppliersMaster.map((s) => ({ value: s.id, label: s.name, sublabel: s.id }))}
                    placeholder={isAr ? '-- اختر المورد المعتمد --' : '-- Select Supplier --'}
                    isAr={isAr}
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {docType === 'return'
                      ? (isAr ? 'تاريخ الارتجاع / الخروج *' : 'Return Date *')
                      : (isAr ? 'تاريخ الاستلام الفعلي *' : 'Receipt Date *')}
                  </label>
                  <input
                    type="date"
                    required
                    disabled={isReadOnly}
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-100"
                  />
                </div>

                {docType !== 'return' && (
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      {isAr ? 'رقم إذن تسليم المورد (D/N)' : 'Supplier D/N Number'}
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      placeholder="مثال: DN-84920"
                      value={supplierDeliveryNote}
                      onChange={(e) => setSupplierDeliveryNote(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-medium focus:bg-white disabled:bg-slate-100"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: Material Lines with Mandatory Variation & Creation Flow */}
            <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg border ${docType === 'return' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    <Boxes className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      {docType === 'return'
                        ? (isAr ? '٢- بنود الخامات المرتجعة والرصيد المتاح' : '2. Return Materials & Stock Balances')
                        : (isAr ? '٢- بنود الخامات والتنوعات ومعدل الشدة' : '2. Materials, Variations & Packaging')}
                    </h4>
                  </div>
                </div>

                {!isReadOnly && receivingType === 'direct' && (
                  <button
                    type="button"
                    onClick={handleAddDirectLine}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      docType === 'return'
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>{docType === 'return' ? (isAr ? 'إضافة خامة مرتجعة أخرى' : 'Add Return Line') : (isAr ? 'إضافة خامة أخرى' : 'Add Material Line')}</span>
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {grnLines.map((line, index) => {
                  const selectedItem = itemsMaster.find((i) => i.code === line.itemId);
                  // In return mode, strictly filter variants belonging to the selected supplier
                  const supplierVariants = selectedItem
                    ? (selectedItem.variations || []).filter((v) => !selectedSupplierId || v.supplierId === selectedSupplierId)
                    : [];

                  const pastGrnsList = docType === 'return' ? getVariantPastGrns(selectedSupplierId, line.variantCode) : [];

                  return (
                    <div key={index} className={`p-4 rounded-2xl space-y-3 text-xs shadow-2xs border-2 ${docType === 'return' ? 'bg-rose-50/30 border-rose-200' : 'bg-slate-50/80 border-slate-200'}`}>
                      {/* Line Title & PO Reference Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-slate-800 bg-white border border-slate-300 px-2.5 py-0.5 rounded-lg text-xs">
                            #{index + 1}
                          </span>
                          <span className="font-extrabold text-slate-900 text-sm">
                            {line.nameAr || (isAr ? (docType === 'return' ? 'اختر خامة للارتجاع' : 'اختر خامة للاستلام') : (docType === 'return' ? 'Select Item to Return' : 'Select Item to Receive'))}
                          </span>
                        </div>

                        {receivingType === 'po_linked' && line.poOrderedQty > 0 && (
                          <div className="flex items-center gap-2 text-[11px] font-semibold bg-white p-1 px-2.5 rounded-lg border border-slate-200">
                            <span className="text-slate-500">
                              {isAr ? 'المطلوب بأمر الشراء:' : 'PO Ordered:'} <b className="text-slate-800 font-mono">{line.poOrderedQty.toLocaleString()}</b>
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500">
                              {isAr ? 'المستلم سابقاً:' : 'Prev Received:'} <b className="text-blue-700 font-mono">{line.poPreviouslyReceivedQty.toLocaleString()}</b>
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-emerald-800">
                              {isAr ? 'المتبقي للتوريد:' : 'Remaining:'} <b className="font-mono text-emerald-900 font-bold">{line.poRemainingQty.toLocaleString()}</b>
                            </span>
                          </div>
                        )}

                        {!isReadOnly && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSplitLine(index)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-bold transition cursor-pointer"
                              title={isAr ? 'تقسيم الكمية على مخزن آخر' : 'Split'}
                            >
                              {isAr ? '+ تقسيم لمخزن آخر' : '+ Split'}
                            </button>
                            {grnLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(index)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded-lg"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Item & Variation Selector */}
                      {receivingType === 'direct' && !isReadOnly && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                              {docType === 'return' ? (isAr ? 'الخامة المرتجعة *' : 'Return Material *') : (isAr ? 'الخامة المستلمة *' : 'Material Item *')}
                            </label>
                            <SearchableSelect
                              disabled={isReadOnly}
                              value={line.itemId}
                              onChange={(val) => handleDirectItemSelect(index, val)}
                              options={availableItemsForDirectGrn.map((item) => ({
                                value: item.code,
                                label: item.nameAr,
                                sublabel: item.code,
                              }))}
                              placeholder={isAr ? '-- اختر الخامة الأساسية --' : '-- Select Material --'}
                              isAr={isAr}
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                              {isAr ? 'تنوع الخامة المعتمد للمورد *' : 'Certified Supplier Variation *'}
                            </label>
                            <select
                              value={line.isNewVariant ? '__NEW_VARIANT__' : (line.variantCode || '')}
                              onChange={(e) => handleDirectVariantSelect(index, e.target.value)}
                              disabled={!line.itemId}
                              className="w-full p-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                            >
                              <option value="">{isAr ? '-- اختر التنوع --' : '-- Select Variation --'}</option>
                              {supplierVariants.map((v) => (
                                <option key={v.variantCode} value={v.variantCode}>
                                  [{v.variantCode}] {isAr ? `تنوع (${v.suffix})` : `Var (${v.suffix})`} • {isAr ? 'شدة:' : 'Pack:'} {v.packagingRatio} • {v.mergedSpecs || ''}
                                </option>
                              ))}
                              {docType !== 'return' && (
                                <option value="__NEW_VARIANT__" className="text-emerald-700 font-bold bg-emerald-50">
                                  ➕ {isAr ? 'إضافة تنوع جديد وتحديد الشدة والمواصفات...' : '+ Add New Variation...'}
                                </option>
                              )}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Return Mode: Stock Resolution & Past GRN Linkage Cards */}
                      {docType === 'return' && line.variantCode && (
                        <div className="space-y-2">
                          {/* 1. Dedicated Past GRN & Lot Selector Box */}
                          <div className="p-3 bg-white border border-rose-200 rounded-xl space-y-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                                <Receipt className="h-4 w-4 text-rose-600 shrink-0" />
                                <span>{isAr ? 'ربط برقم التشغيلة / إذن الاستلام الوارد (لاستيراد السعر وتحديد اللوط):' : 'Link Inward Lot / GRN (Import Cost & Lot Metadata):'}</span>
                              </label>
                              <select
                                value={line.lotNumber || line.linkedGrnId || ''}
                                disabled={isReadOnly}
                                onChange={(e) => handleSelectLinkedGrn(index, e.target.value)}
                                className="p-1.5 border border-rose-300 rounded-lg bg-rose-50/50 font-mono font-bold text-xs focus:ring-2 focus:ring-rose-500 min-w-[280px]"
                              >
                                <option value="">{isAr ? '-- بدون ربط (تسوية سعرية يدوية) --' : '-- No Link (Manual Cost) --'}</option>
                                {pastGrnsList.map((g, gIdx) => (
                                  <option key={gIdx} value={g.lotNumber}>
                                    [لوط: {g.lotNumber}] • {g.receiptDate} • {g.unitPrice ? `${g.unitPrice} ${g.currency}` : (isAr ? 'غير مسعر' : 'Unpriced')} {g.isTaxOfficial ? '(ضريبي)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {line.lotNumber && (
                              <div className="text-[11px] text-emerald-800 font-mono font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 w-max">
                                ✓ {isAr ? `تم تعيين رقم التشغيلة (Lot): ${line.lotNumber}` : `Assigned Lot: ${line.lotNumber}`}
                              </div>
                            )}
                          </div>

                          {/* 2. 3-Level Stock Matrix Card (Main Item, Variant, and Specific Lot) */}
                          <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2 text-xs">
                            {!line.targetWarehouse ? (
                              <div className="flex items-center gap-2 text-amber-800 font-bold">
                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                <span>{isAr ? 'يرجى تحديد المخزن في الحقل أدناه لعرض تفاصيل الأرصدة المتاحة للارتجاع.' : 'Please select warehouse below to reveal 3-level stock breakdown.'}</span>
                              </div>
                            ) : (() => {
                              const parentId = line.itemId || (line.code ? line.code.split('-')[0] : '');
                              const stock3 = get3LevelStock(parentId, line.variantCode, line.lotNumber, line.targetWarehouse);

                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between border-b border-rose-200 pb-1">
                                    <span className="font-extrabold text-rose-950 flex items-center gap-1.5">
                                      <Boxes className="h-3.5 w-3.5 text-rose-600" />
                                      <span>{isAr ? 'أرصدة المخزون المتاحة للصرف والارتجاع (3 مستويات):' : 'Available Stock Breakdown (3 Levels):'}</span>
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <StockOriginBadge source={stock3.source} isAr={isAr} />
                                      <span className="text-[10px] font-bold text-rose-800 bg-white px-2 py-0.5 rounded border border-rose-200">
                                        {line.targetWarehouse}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                    {/* Levels in Selected Warehouse */}
                                    <div className="p-2 bg-white rounded-lg border border-rose-200 space-y-1">
                                      <span className="text-[10px] font-bold text-slate-400 block border-b border-slate-100 pb-0.5">
                                        📍 {isAr ? `في مخزن الصرف (${line.targetWarehouse}):` : `In Selected WH (${line.targetWarehouse}):`}
                                      </span>
                                      <div className="flex justify-between font-semibold text-slate-700">
                                        <span>1. {isAr ? 'الصنف الرئيسي:' : 'Parent Item:'}</span>
                                        <span className="font-mono font-bold text-slate-900">{stock3.parent.selected.toLocaleString()} {line.smallUnit}</span>
                                      </div>
                                      <div className="flex justify-between font-semibold text-indigo-900">
                                        <span>2. {isAr ? 'تنوع الخامة:' : 'Variant:'}</span>
                                        <span className="font-mono font-bold text-indigo-700">{stock3.variant.selected.toLocaleString()} {line.smallUnit}</span>
                                      </div>
                                      {line.lotNumber && (
                                        <div className="flex justify-between font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded">
                                          <span>3. {isAr ? 'اللوط المحدد:' : 'Selected Lot:'}</span>
                                          <span className="font-mono font-extrabold text-emerald-700">{stock3.lot.selected.toLocaleString()} {line.smallUnit}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Levels Across All Company Warehouses */}
                                    <div className="p-2 bg-white rounded-lg border border-rose-200 space-y-1">
                                      <span className="text-[10px] font-bold text-slate-400 block border-b border-slate-100 pb-0.5">
                                        🌐 {isAr ? 'إجمالي كافة مخازن الشركة:' : 'All Company Warehouses:'}
                                      </span>
                                      <div className="flex justify-between font-semibold text-slate-700">
                                        <span>1. {isAr ? 'الصنف الرئيسي:' : 'Parent Item:'}</span>
                                        <span className="font-mono font-bold text-slate-900">{stock3.parent.all.toLocaleString()} {line.smallUnit}</span>
                                      </div>
                                      <div className="flex justify-between font-semibold text-indigo-900">
                                        <span>2. {isAr ? 'تنوع الخامة:' : 'Variant:'}</span>
                                        <span className="font-mono font-bold text-indigo-700">{stock3.variant.all.toLocaleString()} {line.smallUnit}</span>
                                      </div>
                                      {line.lotNumber && (
                                        <div className="flex justify-between font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded">
                                          <span>3. {isAr ? 'اللوط المحدد:' : 'Selected Lot:'}</span>
                                          <span className="font-mono font-extrabold text-emerald-700">{stock3.lot.all.toLocaleString()} {line.smallUnit}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* INLINE NEW VARIATION DEFINITION BOX (Active when Creating New Variant) */}
                      {line.isNewVariant && !isReadOnly && (
                        <div className="p-3.5 bg-emerald-50/80 border-2 border-emerald-300 rounded-2xl space-y-3 text-xs shadow-2xs">
                          <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                            <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                              <Sparkles className="h-4 w-4 text-emerald-700" />
                              <span>{isAr ? `تعريف تنوع جديد [${line.variantCode}] وحفظه في سجل الخامات:` : `Define New Variant [${line.variantCode}]:`}</span>
                            </span>
                            <span className="font-mono font-bold text-[10px] bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-md">
                              {isAr ? 'سيتم الحفظ في Item Master تلقائياً' : 'Auto-saved to Item Master'}
                            </span>
                          </div>

                          {/* Packaging Units & Ratio Row */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-1">
                                {isAr ? 'الوحدة الكبرى (التعبئة)' : 'Large Unit'}
                              </label>
                              <input
                                type="text"
                                value={line.largeUnitName}
                                onChange={(e) => handleLineChange(index, 'largeUnitName', e.target.value)}
                                className="w-full p-1.5 border border-emerald-300 rounded-lg bg-white font-medium"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-1">
                                {isAr ? 'الوحدة الصغرى (المعاملات)' : 'Small Unit'}
                              </label>
                              <input
                                type="text"
                                value={line.smallUnit}
                                onChange={(e) => handleLineChange(index, 'smallUnit', e.target.value)}
                                className="w-full p-1.5 border border-emerald-300 rounded-lg bg-white font-medium"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-extrabold text-emerald-950 mb-1">
                                {isAr ? `معدل الشدة (${line.smallUnit} داخل ${line.largeUnitName}) *` : 'Pack Ratio *'}
                              </label>
                              <input
                                type="number"
                                min="1"
                                placeholder="0"
                                value={line.packagingRatio}
                                onChange={(e) => handleLineChange(index, 'packagingRatio', e.target.value)}
                                className="w-full p-1.5 border-2 border-emerald-400 rounded-lg bg-white font-mono font-bold text-center"
                              />
                            </div>
                          </div>

                          {/* Key-Value Structured Specs Pairs */}
                          <div className="space-y-2 pt-2 border-t border-emerald-200">
                            <div className="flex items-center justify-between">
                              <label className="block text-[11px] font-extrabold text-emerald-950">
                                {isAr ? 'المواصفات الفنية للتنوع (تم تحميل المواصفات القياسية كأزواج حقول للتعديل):' : 'Technical Specifications (Key-Value Pairs):'}
                              </label>
                              <button
                                type="button"
                                onClick={() => handleAddLineSpec(index)}
                                className="flex items-center gap-1 text-[11px] text-emerald-800 hover:text-emerald-950 font-bold cursor-pointer"
                              >
                                <PlusCircle className="h-3 w-3" />
                                <span>{isAr ? 'إضافة مواصفة' : 'Add Spec'}</span>
                              </button>
                            </div>

                            <div className="space-y-2">
                              {(line.specsList || []).map((spec, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder={isAr ? 'اسم المواصفة (مثال: الوزن)' : 'Spec Label (e.g. Weight)'}
                                    value={spec.label}
                                    onChange={(e) => handleLineSpecChange(index, sIdx, 'label', e.target.value)}
                                    className="flex-1 p-1.5 border border-emerald-300 rounded-lg bg-white text-xs font-semibold text-slate-800"
                                  />
                                  <input
                                    type="text"
                                    placeholder={isAr ? 'القيمة / المعيار (مثال: 24 جرام)' : 'Spec Value (e.g. 24g)'}
                                    value={spec.value}
                                    onChange={(e) => handleLineSpecChange(index, sIdx, 'value', e.target.value)}
                                    className="flex-1 p-1.5 border border-emerald-300 rounded-lg bg-white text-xs font-medium text-slate-800"
                                  />
                                  {(line.specsList || []).length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveLineSpec(index, sIdx)}
                                      className="p-1 text-slate-400 hover:text-red-600 transition"
                                      title={isAr ? 'حذف المواصفة' : 'Remove Spec'}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Display Info Banner when using existing variation */}
                      {!line.isNewVariant && line.variantCode && (
                        <div className="p-2 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Info className="h-3.5 w-3.5 text-blue-600" />
                            <span className="font-bold text-slate-900">{isAr ? 'المواصفات:' : 'Specs:'}</span>
                            <span className="text-slate-600 font-medium">{line.specs || '—'}</span>
                          </div>
                          <div className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                            📦 {isAr ? `الشدة: 1 ${line.largeUnitName} = ${line.packagingRatio} ${line.smallUnit}` : `Pack: 1 ${line.largeUnitName} = ${line.packagingRatio} ${line.smallUnit}`}
                          </div>
                        </div>
                      )}

                      {/* Quantities, Warehouse Location & Unit Price Inputs */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                            {isAr ? 'المخزن / العنبر *' : 'Warehouse *'}
                          </label>
                          <div className="relative">
                            <Warehouse className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                            <select
                              required
                              disabled={isReadOnly}
                              value={line.targetWarehouse}
                              onChange={(e) => handleLineChange(index, 'targetWarehouse', e.target.value)}
                              className="w-full ps-8 pe-2.5 py-1.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 disabled:bg-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            >
                              <option value="">{isAr ? '-- اختر المخزن --' : '-- Select Warehouse --'}</option>
                              {activeWarehouses.map((wh) => {
                                const classLabel =
                                  wh.classification === 'factory_floor' || wh.isFactoryLinked
                                    ? (isAr ? '(مخزن التشغيل)' : '(Factory Floor)')
                                    : wh.classification === 'returns'
                                    ? (isAr ? '(تحت حساب المرتجعات)' : '(Returns)')
                                    : wh.classification === 'scrap'
                                    ? (isAr ? '(الهوالك والمخلفات)' : '(Scrap)')
                                    : (isAr ? '(تخزين خامات)' : '(Storage)');

                                return (
                                  <option key={wh.code || wh.id} value={wh.nameAr}>
                                    [{wh.code}] {isAr ? wh.nameAr : (wh.nameEn || wh.nameAr)} {classLabel}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                            {isAr ? `الكمية (${line.largeUnitName}) *` : `Large Qty (${line.largeUnitName}) *`}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isReadOnly}
                            placeholder="0"
                            value={line.receivedLargeUnits}
                            onChange={(e) => handleLineChange(index, 'receivedLargeUnits', e.target.value)}
                            className="w-full p-1.5 border-2 border-slate-300 rounded-xl bg-white font-mono font-extrabold text-center text-sm disabled:bg-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            {isAr ? 'معدل الشدة' : 'Pack Ratio'}
                          </label>
                          <input
                            type="number"
                            min="1"
                            disabled={isReadOnly}
                            value={line.packagingRatio}
                            onChange={(e) => handleLineChange(index, 'packagingRatio', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded-xl bg-white font-mono text-center disabled:bg-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-extrabold text-emerald-950 mb-1">
                            {isAr ? `الإجمالي (${line.smallUnit}) *` : `Total (${line.smallUnit}) *`}
                          </label>
                          <div className="p-1.5 bg-emerald-100/90 border border-emerald-300 rounded-xl text-center font-mono font-extrabold text-emerald-950 text-xs">
                            {Number(line.receivedSmallUnits).toLocaleString()} {line.smallUnit}
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                            {isAr ? `سعر الوحدة (${line.smallUnit})` : `Unit Price (${line.smallUnit})`}
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              disabled={isReadOnly}
                              placeholder="0.00"
                              value={line.unitPrice}
                              onChange={(e) => handleLineChange(index, 'unitPrice', e.target.value)}
                              className="w-full p-1.5 border border-slate-300 rounded-xl bg-white font-mono text-center font-bold disabled:bg-slate-100"
                            />
                            <select
                              disabled={isReadOnly}
                              value={line.currency || 'EGP'}
                              onChange={(e) => handleLineChange(index, 'currency', e.target.value)}
                              className="p-1.5 border border-slate-300 rounded-xl bg-white font-bold text-xs disabled:bg-slate-100"
                            >
                              <option value="EGP">EGP</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Optional Batch Tracking (Receipt Mode Only) */}
                      {docType !== 'return' && (
                        <div className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={isReadOnly}
                              checked={line.hasBatchTracking}
                              onChange={(e) => handleLineChange(index, 'hasBatchTracking', e.target.checked)}
                              className="h-3.5 w-3.5 rounded accent-emerald-600"
                            />
                            <span>{isAr ? 'تتبع رقم التشغيلة وتواريخ الصلاحية (اختياري)' : 'Track Batch # & Expiry Dates (Optional)'}</span>
                          </label>
                          <Tag className="h-3.5 w-3.5 text-emerald-600" />
                        </div>

                        {line.hasBatchTracking && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                {isAr ? 'رقم تشغيلة / لوط المورد' : 'Supplier Batch / Lot #'}
                              </label>
                              <input
                                type="text"
                                disabled={isReadOnly}
                                placeholder="LOT-2026-XXXX"
                                value={line.supplierBatchNo}
                                onChange={(e) => handleLineChange(index, 'supplierBatchNo', e.target.value)}
                                className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                {isAr ? 'تاريخ الإنتاج' : 'Production Date'}
                              </label>
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={line.productionDate}
                                onChange={(e) => handleLineChange(index, 'productionDate', e.target.value)}
                                className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                {isAr ? 'تاريخ انتهاء الصلاحية' : 'Expiry Date'}
                              </label>
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={line.expiryDate}
                                onChange={(e) => handleLineChange(index, 'expiryDate', e.target.value)}
                                className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 3: TAX & INVOICING / CREDIT NOTE CARD */}
            <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    {docType === 'return'
                      ? (isAr ? '٣- إشعار الخصم / الدائن الضريبي (Credit Note)' : '3. Tax Credit Note & ETA')
                      : (isAr ? '٣- الفاتورة والبيانات الضريبية' : '3. Taxation & Official Invoicing')}
                  </h4>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-indigo-950 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={isTaxOfficial}
                    onChange={(e) => setIsTaxOfficial(e.target.checked)}
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span>
                    {docType === 'return'
                      ? (isAr ? 'معاملة ضريبية (إصدار إشعار دائن/خصم)' : 'Official Tax Credit Note')
                      : (isAr ? 'معاملة ضريبية رسمية (فاتورة إلكترونية معتمدة)' : 'Official Tax Invoice')}
                  </span>
                </label>
              </div>

              {isTaxOfficial && (
                docType === 'return' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {isAr ? 'رقم إشعار الخصم / الدائن (Credit Note #)' : 'Credit Note Number'}
                      </label>
                      <input
                        type="text"
                        disabled={isReadOnly}
                        placeholder="CN-2026-XXXX"
                        value={creditNoteNumber}
                        onChange={(e) => setCreditNoteNumber(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-mono text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {isAr ? 'تاريخ إشعار الخصم / الدائن' : 'Credit Note Date'}
                      </label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={creditNoteDate}
                        onChange={(e) => setCreditNoteDate(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-medium"
                      />
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={etaPortalRegistered}
                          onChange={(e) => setEtaPortalRegistered(e.target.checked)}
                          className="h-4 w-4 rounded accent-emerald-600"
                        />
                        <span>{isAr ? 'مسجل وموثق بالمنظومة (ETA Portal)' : 'Verified on ETA Portal'}</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {isAr ? 'رقم الفاتورة الضريبية للمورد' : 'Tax Invoice Number'}
                      </label>
                      <input
                        type="text"
                        disabled={isReadOnly}
                        placeholder="INV-2026-XXXX"
                        value={taxInvoiceNumber}
                        onChange={(e) => setTaxInvoiceNumber(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-mono text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {isAr ? 'تاريخ الفاتورة الضريبية' : 'Invoice Date'}
                      </label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={taxInvoiceDate}
                        onChange={(e) => setTaxInvoiceDate(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-medium"
                      />
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={etaPortalRegistered}
                          onChange={(e) => setEtaPortalRegistered(e.target.checked)}
                          className="h-4 w-4 rounded accent-emerald-600"
                        />
                        <span>{isAr ? 'مسجلة على منظومة الضرائب (ETA Portal)' : 'Verified on ETA Portal'}</span>
                      </label>
                    </div>
                  </div>
                )
              )}

              {/* Financial Breakdown Summary Box */}
              {computedTotals.hasPricing && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-slate-500 block">{isAr ? 'المجموع قبل الضريبة:' : 'Subtotal:'}</span>
                      <span className="font-mono font-extrabold text-slate-800 text-sm">
                        {computedTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">{isAr ? 'ضريبة القيمة المضافة (14%):' : 'VAT (14%):'}</span>
                      <span className="font-mono font-extrabold text-slate-800 text-sm">
                        {computedTotals.totalVat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">{isAr ? 'خصم أ.ت.ص (WHT):' : 'WHT Deduction:'}</span>
                      <span className="font-mono font-extrabold text-slate-800 text-sm">
                        - {computedTotals.totalWht.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>

                    <div>
                      <span className="text-emerald-950 font-extrabold block">{isAr ? 'صافي القيمة المستحقة:' : 'Net Payable:'}</span>
                      <span className="font-mono font-extrabold text-emerald-800 text-base">
                        {computedTotals.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })} {computedTotals.currency}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 4: NOTES & REMARKS */}
            <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-xs space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <div className="p-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg">
                  <FileText className="h-4 w-4" />
                </div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  {isAr ? '٤- ملاحظات الاستلام والفحص الظاهري' : '4. Receiving & Inspection Remarks'}
                </h4>
              </div>

              <textarea
                rows={2}
                disabled={isReadOnly}
                placeholder={isAr ? 'اكتب أي ملاحظات تخص الشحنة، الطبالي، حالة التغليف...' : 'Enter inspection remarks...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white disabled:bg-slate-100"
              />
            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t-2 border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingGrn(null);
                  }}
                  className="px-4 py-2 bg-white border-2 border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition shadow-2xs"
                >
                  {isAr ? 'إغلاق النافذة' : 'Close'}
                </button>

                {/* Cancel GRN Button in Edit Mode */}
                {!isReadOnly && editingGrn && editingGrn.status !== 'cancelled' && (isGeneralAdmin || isPurchasingAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleCancelGrn(editingGrn)}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border-2 border-red-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                    title={isAr ? 'إلغاء إذن الاستلام وعكس جميع حركات المخزن المرتبطة' : 'Cancel GRN & reverse movements'}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إلغاء الإذن وعكس الأرصدة' : 'Cancel GRN & Reverse Stock'}</span>
                  </button>
                )}
              </div>

              {!isReadOnly && (
                <div className="flex items-center gap-2">
                  {/* Save as Draft Button */}
                  <button
                    type="button"
                    onClick={() => handleSaveGrn('draft')}
                    className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-300 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 transition shadow-2xs"
                  >
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span>{isAr ? 'حفظ كمسودة (بدون توريد للأرصدة)' : 'Save as Draft'}</span>
                  </button>

                  {/* Approve and Commit (Post to or Deduct from Inventory) */}
                  <button
                    type="button"
                    onClick={() => handleSaveGrn('approved')}
                    className={`px-5 py-2 text-white rounded-xl text-xs font-extrabold shadow-sm cursor-pointer flex items-center gap-1.5 transition ${
                      docType === 'return' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {docType === 'return'
                        ? modalMode === 'edit'
                          ? (isAr ? `حفظ واعتماد المرتجع وخصم الأرصدة (${formatVersionTag(getNextVersion(editingGrn?.version))})` : `Approve Return & Deduct Stock (${formatVersionTag(getNextVersion(editingGrn?.version))})`)
                          : (isAr ? 'اعتماد إذن المرتجع وخصم الأرصدة من المخزن' : 'Approve Return & Deduct Stock')
                        : modalMode === 'edit'
                        ? (isAr ? `حفظ واعتماد التوريد (${formatVersionTag(getNextVersion(editingGrn?.version))})` : `Approve & Update (${formatVersionTag(getNextVersion(editingGrn?.version))})`)
                        : (isAr ? 'اعتماد إذن الاستلام وتوريد المخزن' : 'Approve Receipt & Post to Stock')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attachments Quick-Access Fixed Floating Popover (Free-flows outside table overflow container) */}
      {activeAttachmentPopover && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setActiveAttachmentPopover(null)}
          />
          <div
            style={{
              position: 'fixed',
              top: `${activeAttachmentPopover.top}px`,
              ...(isAr
                ? { right: `${Math.max(16, activeAttachmentPopover.right)}px` }
                : { left: `${Math.max(16, activeAttachmentPopover.left)}px` }),
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-[95] animate-in fade-in zoom-in-95 duration-150 space-y-2.5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-purple-600" />
                <span>{isAr ? 'المرفقات والوثائق المسجلة' : 'Attachments'}</span>
              </span>
              <button
                onClick={() => setActiveAttachmentPopover(null)}
                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pe-1">
              {(activeAttachmentPopover.grn.attachments || []).map((att, attIdx) => (
                <div
                  key={attIdx}
                  className="p-2 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <File className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 text-[11px] block truncate" title={att.label || att.fileName}>
                        {att.label || att.fileName}
                      </span>
                      <span className="text-[9px] text-slate-400 block truncate font-mono">
                        {att.fileName} • {att.fileSize}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadFile(att)}
                    className="p-1 text-purple-700 hover:bg-purple-100 rounded-lg shrink-0 transition cursor-pointer"
                    title={isAr ? 'تحميل / فتح المرفق' : 'Download / Open'}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const targetGrn = activeAttachmentPopover.grn;
                setActiveAttachmentPopover(null);
                handleOpenAttachmentModal(targetGrn);
              }}
              className="w-full py-1 text-center text-[10px] font-extrabold text-purple-700 hover:bg-purple-50 rounded-lg transition cursor-pointer"
            >
              {isAr ? 'إدارة وتحميل المزيد من الملفات...' : 'Manage / Upload More...'}
            </button>
          </div>
        </>
      )}

      {/* Full-screen Loader when saving or syncing GRN/RTN */}
      {isSavingGrn && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري معالجة وتحديث حركات المخزن السحابية...' : 'Syncing Inventory & Processing Document...'}
        />
      )}

      {/* Full-screen Loader when saving attachments */}
      {savingAttachments && (
        <PeacockLoader
          fullScreen
          size="lg"
          text={isAr ? 'جاري حفظ وتحديث المرفقات السحابية...' : 'Saving Attachments to Cloud...'}
        />
      )}

      {/* Attachment Upload & Management Modal */}
      {attachmentModalGrn && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl">
                  <Paperclip className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {isAr
                      ? `إدارة مرفقات ووثائق (${attachmentModalGrn.id})`
                      : `Manage Attachments (${attachmentModalGrn.id})`}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {attachmentModalGrn.supplierName} • {attachmentModalGrn.receiptDate}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setAttachmentModalGrn(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Batch Upload Drop Area */}
            <div className="p-4 border-2 border-dashed border-purple-300 rounded-2xl bg-purple-50/40 text-center space-y-2">
              <div className="w-10 h-10 mx-auto rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shadow-2xs">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <span className="font-bold text-slate-800 text-xs block">
                  {isAr ? 'اسحب الملفات هنا أو اضغط لاختيارها دفعة واحدة' : 'Upload files in batch or individually'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {isAr ? 'يدعم الصور، ملفات PDF، الفواتير الممسوحة، وأذون التسليم' : 'Supports PDF, images, scanned delivery notes, COA...'}
                </span>
              </div>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs">
                <Plus className="h-3.5 w-3.5" />
                <span>{isAr ? 'تحديد ملفات من الجهاز' : 'Browse Files'}</span>
                <input
                  type="file"
                  multiple
                  onChange={handleFilesSelected}
                  className="hidden"
                />
              </label>
            </div>

            {/* Staged Attachments List */}
            <div className="space-y-2.5">
              <span className="text-xs font-extrabold text-slate-800 block">
                {isAr ? `الملفات المرفقة (${stagedAttachments.length}):` : `Attached Files (${stagedAttachments.length}):`}
              </span>

              {stagedAttachments.length === 0 ? (
                <div className="p-6 text-center text-slate-400 border border-slate-200 rounded-2xl text-xs">
                  {isAr ? 'لا توجد مرفقات مسجلة بعد لهذا الإذن.' : 'No attachments uploaded yet.'}
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pe-1">
                  {stagedAttachments.map((att, idx) => (
                    <div
                      key={att.id || idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <File className="h-4 w-4 text-purple-600 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate" title={att.fileName}>
                              {att.fileName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {att.fileSize} • {new Date(att.uploadedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(att)}
                            className="p-1.5 text-purple-700 hover:bg-purple-100 rounded-lg transition"
                            title={isAr ? 'تحميل' : 'Download'}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStagedAttachment(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title={isAr ? 'حذف المرفق' : 'Delete'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Editable Label Input */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          {isAr ? 'تسمية الوثيقة / البيان:' : 'Document Label / Purpose:'}
                        </label>
                        <input
                          type="text"
                          placeholder={isAr ? 'مثال: شهادة التحليل COA، بوليصة الشحن، الفاتورة الأصلية...' : 'e.g. Analysis Certificate, Delivery Note, Invoice...'}
                          value={att.label}
                          onChange={(e) => handleUpdateAttachmentLabel(idx, e.target.value)}
                          className="w-full p-1.5 border border-slate-300 rounded-xl bg-white font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAttachmentModalGrn(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                disabled={savingAttachments}
                onClick={handleSaveAttachments}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingAttachments ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>{isAr ? 'حفظ وتحديث المرفقات' : 'Save Attachments'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Localized Audit Trail Modal */}
      {auditGrnData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {isAr ? `سجل التعديلات والاعتمادات (${auditGrnData.id})` : `Audit Trail History (${auditGrnData.id})`}
                </h3>
              </div>
              <button onClick={() => setAuditGrnData(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pe-1 text-xs">
              {auditGrnData.auditTrail?.map((entry, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 font-mono">
                      {formatVersionTag(entry.version)}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(entry.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-700">{entry.performedBy}</span>:{' '}
                    <span>{isAr ? (entry.noteAr || entry.note) : (entry.noteEn || entry.note)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 text-end">
              <button
                onClick={() => setAuditGrnData(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Executive Printout (Dynamic for GRN & RTN) */}
      {printGrnData && (() => {
        const isPrintReturn = printGrnData.docType === 'return' || printGrnData.id?.startsWith('RTN');

        return (
          <div id="printable-grn-slip" className="fixed inset-0 bg-white p-8 z-[99999] hidden print:block text-slate-800">
            {/* Print Header */}
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
                    {isPrintReturn
                      ? (printLang === 'ar' ? 'إذن مرتجع خامات ومستلزمات إنتاج للمورد (RTV / RTN)' : 'Supplier Goods Return Note (RTV / RTN)')
                      : (printLang === 'ar' ? 'إذن استلام وتوريد خامات ومستلزمات إنتاج (GRN)' : 'Goods Receipt & Inspection Note (GRN)')
                    }
                  </h2>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {printLang === 'ar' ? 'المنطقة الصناعية، السادس من أكتوبر، الجيزة، مصر' : '6th of October Industrial Zone, Giza, Egypt'}
                  </p>
                </div>
              </div>
              <div className="text-end">
                <span className="text-base font-mono font-extrabold text-slate-900 block">{printGrnData.id}</span>
                <span className="text-xs font-bold text-slate-600 block">
                  {printLang === 'ar' ? `(الإصدار ${formatVersionTag(printGrnData.version)})` : `(Revision ${formatVersionTag(printGrnData.version)})`}
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  {isPrintReturn
                    ? (printLang === 'ar' ? 'تاريخ الارتجاع / الخروج:' : 'Return Date:')
                    : (printLang === 'ar' ? 'تاريخ الاستلام:' : 'Receipt Date:')
                  } {printGrnData.receiptDate}
                </span>
                {printGrnData.poId && (
                  <span className="text-xs font-mono font-semibold text-blue-700 block">
                    PO: {printGrnData.poId}
                  </span>
                )}
              </div>
            </div>

            {/* Supplier & Delivery / Tax Invoicing Card */}
            <div className="grid grid-cols-2 gap-4 p-3.5 mb-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">{printLang === 'ar' ? 'المورد المعتمد:' : 'Supplier:'}</span>
                <span className="font-bold text-slate-900 text-sm block">{printGrnData.supplierName}</span>
                {printGrnData.supplierDeliveryNote && (
                  <span className="text-slate-600 block mt-0.5">
                    {printLang === 'ar' ? 'رقم إذن تسليم المورد (D/N):' : 'Supplier D/N:'} {printGrnData.supplierDeliveryNote}
                  </span>
                )}
              </div>
              <div className="text-end space-y-0.5">
                {isPrintReturn ? (
                  printGrnData.isTaxOfficial ? (
                    printGrnData.creditNoteNumber ? (
                      <>
                        <span className="text-slate-800 block font-mono font-bold">
                          {printLang === 'ar' ? 'إشعار الخصم / الدائن (Credit Note):' : 'Credit Note #:'} {printGrnData.creditNoteNumber}
                        </span>
                        {printGrnData.creditNoteDate && (
                          <span className="text-slate-500 block font-mono text-[11px]">
                            {printLang === 'ar' ? 'تاريخ إشعار الخصم:' : 'CN Date:'} {printGrnData.creditNoteDate}
                          </span>
                        )}
                        {printGrnData.etaPortalRegistered && (
                          <span className="text-emerald-700 block font-semibold text-[10px]">
                            {printLang === 'ar' ? '✓ موثق ومسجل بمنظومة الفاتورة الإلكترونية (ETA)' : '✓ Verified on ETA Portal'}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-indigo-900 font-semibold block text-[11px]">
                        {printLang === 'ar' ? 'مرتجع ضريبي رسمي (بانتظار تسجيل إشعار الخصم/الدائن)' : 'Official Tax Return (Credit Note Pending)'}
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500 italic block text-[11px]">
                      {printLang === 'ar' ? 'مرتجع داخلي غير ضريبي' : 'Internal Non-Taxable Return'}
                    </span>
                  )
                ) : (
                  printGrnData.isTaxOfficial ? (
                    printGrnData.taxInvoiceNumber ? (
                      <span className="text-slate-700 block font-mono">
                        {printLang === 'ar' ? 'الفاتورة الضريبية:' : 'Tax Invoice:'} {printGrnData.taxInvoiceNumber}
                      </span>
                    ) : (
                      <span className="text-indigo-900 font-semibold block text-[11px]">
                        {printLang === 'ar' ? 'توريد ضريبي رسمي (بانتظار الفاتورة الضريبية)' : 'Official Tax Receipt (Invoice Pending)'}
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500 italic block text-[11px]">
                      {printLang === 'ar' ? 'توريد داخلي غير ضريبي' : 'Internal Non-Taxable Receipt'}
                    </span>
                  )
                )}
                <span className="text-slate-600 block pt-0.5">
                  {isPrintReturn
                    ? (printLang === 'ar' ? 'المسؤول / محرر الإذن:' : 'Issued By:')
                    : (printLang === 'ar' ? 'المستلم:' : 'Received By:')
                  } {printGrnData.receivedBy}
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-2.5 text-start border-e border-slate-200">{printLang === 'ar' ? 'م' : 'No.'}</th>
                    <th className="p-2.5 text-start border-e border-slate-200">{printLang === 'ar' ? 'الكود والتنوع' : 'Code & Var'}</th>
                    <th className="p-2.5 text-start border-e border-slate-200">{printLang === 'ar' ? 'اسم الخامة والمواصفات والشدة' : 'Material Description & Specs'}</th>
                    <th className="p-2.5 text-start border-e border-slate-200">
                      {isPrintReturn
                        ? (printLang === 'ar' ? 'المخزن المنصرف منه' : 'Source Warehouse')
                        : (printLang === 'ar' ? 'المخزن المستلم' : 'Target Warehouse')
                      }
                    </th>
                    <th className="p-2.5 text-center border-e border-slate-200">
                      {isPrintReturn
                        ? (printLang === 'ar' ? 'الكمية المرتجعة' : 'Returned Qty')
                        : (printLang === 'ar' ? 'الكمية المستلمة' : 'Received Qty')
                      }
                    </th>
                    <th className="p-2.5 text-end border-e border-slate-200">{printLang === 'ar' ? 'سعر الوحدة' : 'Unit Price'}</th>
                    <th className="p-2.5 text-end">{printLang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {printGrnData.lines?.map((line, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-mono border-e border-slate-100 text-slate-500">{idx + 1}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-800 border-e border-slate-100">
                      <div>{line.code || line.itemId}</div>
                      {line.lotNumber && (
                        <div className="text-[10px] text-indigo-700 font-mono font-extrabold mt-0.5">
                          Lot: {line.lotNumber}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 border-e border-slate-100">
                      <div className="font-bold text-slate-900">{line.nameAr}</div>
                      {line.specs && <div className="text-[10px] text-slate-500 mt-0.5">{line.specs}</div>}
                        {line.packagingRatio > 1 && (
                          <div className="text-[10px] text-emerald-800 font-medium mt-0.5">
                            {printLang === 'ar' ? `شدة التعبئة: ${line.packagingRatio} ${line.smallUnit} / ${line.largeUnitName}` : `Pack: ${line.packagingRatio} ${line.smallUnit} / ${line.largeUnitName}`}
                          </div>
                        )}
                        {line.linkedGrnId && (
                          <div className="text-[10px] text-blue-700 font-mono mt-0.5">
                            {printLang === 'ar' ? `مرجع إذن الاستلام الأصلي: ${line.linkedGrnId}` : `Ref GRN: ${line.linkedGrnId}`}
                          </div>
                        )}
                        {line.rejectionReason && (
                          <div className="text-[10px] text-rose-700 font-medium mt-0.5">
                            {printLang === 'ar' ? `سبب الارتجاع: ${line.rejectionReason}` : `Reason: ${line.rejectionReason}`}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 border-e border-slate-100 text-slate-700">{line.targetWarehouse}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-900 border-e border-slate-100">
                        {isPrintReturn ? '-' : ''}{Number(line.receivedSmallUnits).toLocaleString()} {line.smallUnit}
                        {line.receivedLargeUnits > 0 && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            ({line.receivedLargeUnits} {line.largeUnitName})
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-end font-mono border-e border-slate-100 text-slate-800">
                        {Number(line.unitPrice || 0).toFixed(2)} {line.currency || 'EGP'}
                      </td>
                      <td className="p-2.5 text-end font-mono font-bold text-slate-900">
                        {isPrintReturn ? '-' : ''}{(Number(line.unitPrice || 0) * Number(line.receivedSmallUnits || 0)).toFixed(2)} {line.currency || 'EGP'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary Box */}
            {printGrnData.financials?.hasPricing && (
              <div className="flex justify-end mb-4">
                <div className="w-80 space-y-1 p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>{printLang === 'ar' ? 'المجموع قبل الضريبة:' : 'Subtotal:'}</span>
                    <span className="font-mono font-bold text-slate-800">
                      {isPrintReturn ? '-' : ''}{printGrnData.financials.subtotal.toFixed(2)} {printGrnData.financials.currency}
                    </span>
                  </div>
                  {printGrnData.isTaxOfficial && (
                    <div className="flex justify-between text-slate-600">
                      <span>{printLang === 'ar' ? 'ض.ق.م (14%):' : 'VAT (14%):'}</span>
                      <span className="font-mono font-bold text-slate-800">
                        {isPrintReturn ? '-' : ''}{printGrnData.financials.totalVat.toFixed(2)} {printGrnData.financials.currency}
                      </span>
                    </div>
                  )}
                  {printGrnData.financials.totalWht > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>{printLang === 'ar' ? 'خصم أ.ت.ص (WHT):' : 'WHT Deduction:'}</span>
                      <span className="font-mono font-bold text-slate-800">
                        {isPrintReturn ? '+' : '-'}{printGrnData.financials.totalWht.toFixed(2)} {printGrnData.financials.currency}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-extrabold text-sm text-slate-900">
                    <span>
                      {isPrintReturn
                        ? (printLang === 'ar' ? 'صافي القيمة المخصومة من حساب المورد:' : 'Net Debit / Deduction Amount:')
                        : (printLang === 'ar' ? 'صافي القيمة المستحقة:' : 'Net Total:')
                      }
                    </span>
                    <span className={`font-mono ${isPrintReturn ? 'text-rose-700' : 'text-slate-900'}`}>
                      {isPrintReturn ? '-' : ''}{printGrnData.financials.netPayable.toFixed(2)} {printGrnData.financials.currency}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Notes Section if Present */}
            {printGrnData.notes && (
              <div className="p-3 mb-4 rounded-xl border border-slate-200 bg-slate-50/30 text-xs">
                <span className="font-bold text-slate-700 block mb-0.5">{printLang === 'ar' ? 'ملاحظات:' : 'Notes:'}</span>
                <span className="text-slate-600 whitespace-pre-wrap">{printGrnData.notes}</span>
              </div>
            )}

            {/* Signatures & Approvals Footer */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200 text-xs text-center">
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/40">
                <span className="text-slate-400 block mb-1">
                  {isPrintReturn
                    ? (printLang === 'ar' ? 'أمين المخزن المنصرف / المسؤول' : 'Issuing Storekeeper')
                    : (printLang === 'ar' ? 'أمين المخزن المستلم' : 'Receiving Storekeeper')
                  }
                </span>
                <span className="font-bold text-slate-900 block">{printGrnData.receivedBy || (printLang === 'ar' ? 'أمين المخزن' : 'Storekeeper')}</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/40">
                <span className="text-slate-400 block mb-1">
                  {isPrintReturn
                    ? (printLang === 'ar' ? 'مدير المشتريات / مسؤول الاعتماد' : 'Purchasing Manager')
                    : (printLang === 'ar' ? 'مسؤول الفحص والجودة' : 'QC Inspector')
                  }
                </span>
                <span className="font-bold text-slate-900 block">........................</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/40">
                <span className="text-slate-400 block mb-1">
                  {isPrintReturn
                    ? (printLang === 'ar' ? 'مندوب / سائق استلام المرتجع (المورد)' : 'Supplier Representative')
                    : (printLang === 'ar' ? 'سائق / مندوب التوريد' : 'Delivery Driver')
                  }
                </span>
                <span className="font-bold text-slate-900 block">........................</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}