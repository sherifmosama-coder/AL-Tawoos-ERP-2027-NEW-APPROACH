import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
  History,
  Search,
  Filter,
  Calendar,
  Warehouse,
  Boxes,
  Layers,
  Tag,
  User,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Download,
  Printer,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Factory,
  PackageCheck,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  RotateCcw,
  Info,
  Building2,
  Check,
  FlaskConical
} from 'lucide-react';
import VariantIdentifierChip from './VariantIdentifierChip';
import { isUsableWarehouse, matchWarehouse, getWarehouseDisplayName } from '../utils/warehouseClassifier';
import { resolveItemOrLotCost } from '../utils/stockResolver';

export default function StockLifecycleSubTab({
  itemsMaster = [],
  warehouses = [],
  goodsReceipts = [],
  transfers = [],
  transformations = [],
  sparePartsIssues = [],
  workOrders = [],
  usersList = [],
  currentUser = {},
  canViewPrices = true,
  canViewTotals = true,
  isAr = true,
  intermediateRecipes = [],
}) {
  // =========================================================================
  // 1. FILTER STATES
  // =========================================================================
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedItemCode, setSelectedItemCode] = useState('all');
  const [selectedVariantCode, setSelectedVariantCode] = useState('all');
  const [selectedLotNumber, setSelectedLotNumber] = useState('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedMovementType, setSelectedMovementType] = useState('all'); // 'all' | 'GRN' | 'RTN' | 'TRN' | 'WO' | 'ADJ' | 'OB' | 'X'
  const [tableSearchQuery, setTableSearchQuery] = useState('');

  // Selected Movement Detail Modal State
  const [selectedMovementDetail, setSelectedMovementDetail] = useState(null);

  // Quick Date Range Helpers
  const handleSetDatePreset = (preset) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      const pY = past.getFullYear();
      const pM = String(past.getMonth() + 1).padStart(2, '0');
      const pD = String(past.getDate()).padStart(2, '0');
      setStartDate(`${pY}-${pM}-${pD}`);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const firstDay = `${yyyy}-${mm}-01`;
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (preset === '30days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      const pY = past.getFullYear();
      const pM = String(past.getMonth() + 1).padStart(2, '0');
      const pD = String(past.getDate()).padStart(2, '0');
      setStartDate(`${pY}-${pM}-${pD}`);
      setEndDate(todayStr);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Reset All Filters
  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedItemCode('all');
    setSelectedVariantCode('all');
    setSelectedLotNumber('all');
    setSelectedWarehouse('all');
    setSelectedUser('all');
    setSelectedMovementType('all');
    setTableSearchQuery('');
  };

  // Helper to match warehouse object
  const getWhObj = (identifier) => {
    if (!identifier) return null;
    return warehouses.find((w) => matchWarehouse(identifier, w)) || null;
  };

  const getWhName = (identifier) => {
    if (!identifier) return '';
    const obj = getWhObj(identifier);
    if (obj) {
      return isAr ? (obj.nameAr || obj.code || obj.id) : (obj.nameEn || obj.nameAr || obj.code || obj.id);
    }
    return String(identifier);
  };

  const isScrapWh = (identifier) => {
    if (!identifier) return false;
    const obj = getWhObj(identifier);
    if (!obj) {
      const s = String(identifier).toLowerCase();
      return s.includes('scrap') || s.includes('هالك') || s.includes('خردة') || s.includes('عوادم');
    }
    return (
      obj.classification === 'scrap' ||
      obj.operationalClassification === 'scrap' ||
      String(obj.code || '').toLowerCase().includes('scrap') ||
      String(obj.nameAr || '').includes('هالك') ||
      String(obj.nameAr || '').includes('خردة')
    );
  };

  const getUserName = (userId) => {
    if (!userId) return '';
    const user = usersList.find((u) => u.id === userId || u.email === userId);
    return isAr ? (user?.nameAr || userId) : (user?.name || user?.nameAr || userId);
  };

  // Available Variants for Selected Item
  const availableVariants = useMemo(() => {
    if (selectedItemCode === 'all') return [];
    const item = itemsMaster.find((i) => i.code === selectedItemCode || i.id === selectedItemCode);
    if (!item) return [];
    return (item.variations || []).map((v) => {
      const code = v.variantCode || (v.suffix ? `${item.code}-${v.suffix}` : item.code);
      let specs = v.mergedSpecs || '';
      if (!specs && Array.isArray(v.specs)) {
        specs = v.specs.map((s) => (typeof s === 'object' ? `${s.label}: ${s.value}` : s)).join(' | ');
      }
      return { code, specs, supplierName: v.supplierName, suffix: v.suffix };
    });
  }, [selectedItemCode, itemsMaster]);

  // When item changes, reset variant filter if variant doesn't belong to it
  const handleItemChange = (code) => {
    setSelectedItemCode(code);
    setSelectedVariantCode('all');
    setSelectedLotNumber('all');
  };

  // =========================================================================
  // 2. UNIFIED TRANSACTION COMPILATION ENGINE
  // =========================================================================
  const resolveTimeInfo = (docObj, fallbackDate) => {
    let date = fallbackDate || '';
    let time = '00:00:00';
    let timestamp = 0;

    if (docObj?.createdAt?.toDate) {
      const d = docObj.createdAt.toDate();
      timestamp = d.getTime();
      date = date || d.toISOString().split('T')[0];
      time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } else if (docObj?.createdAt && typeof docObj.createdAt === 'string') {
      const d = new Date(docObj.createdAt);
      if (!isNaN(d.getTime())) {
        timestamp = d.getTime();
        date = date || d.toISOString().split('T')[0];
        time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      }
    } else if (docObj?.timestamp) {
      const d = new Date(docObj.timestamp);
      if (!isNaN(d.getTime())) {
        timestamp = d.getTime();
        date = date || d.toISOString().split('T')[0];
        time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      }
    }

    if (!timestamp && date) {
      const parsed = new Date(date).getTime();
      if (!isNaN(parsed)) timestamp = parsed;
    }

    return { date: date || '2026-01-01', time, timestamp: timestamp || 1 };
  };

  // Compile EVERY stock-affecting transaction into a uniform normalized ledger entry
  const allRawTransactions = useMemo(() => {
    const list = [];

    // Helper: Normalize warehouse identifier to warehouse code / ID
    const normalizeWhId = (whIdent) => {
      const obj = getWhObj(whIdent);
      return obj ? (obj.code || obj.id) : (whIdent || 'UNKNOWN_WH');
    };

    // -----------------------------------------------------------------------
    // A. OPENING BALANCES (OB)
    // -----------------------------------------------------------------------
    itemsMaster.forEach((item) => {
      if (item.isStocklessUtility) return;
      (item.variations || []).forEach((v) => {
        const vCode = v.variantCode || `${item.code}-${v.suffix}`;
        const openQty = Number(v.openingQtySmall || 0);
        if (openQty <= 0 || !v.openingWarehouse) return;

        const whKey = normalizeWhId(v.openingWarehouse);
        const whObj = getWhObj(v.openingWarehouse);
        const isUsable = isUsableWarehouse(whObj);
        const obLot = `OB-${item.code}-${v.suffix}-01`;
        const unitCost = Number(v.openingUnitCost || item.costPrice || 0);

        list.push({
          id: `OB-${item.code}-${v.suffix}`,
          refCode: `OB-${item.code}-${v.suffix}`,
          type: 'OB',
          typeLabel: isAr ? 'رصيد افتتاحي (OB)' : 'Opening Balance (OB)',
          badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
          date: v.openingProdDate || item.createdAt?.split?.('T')?.[0] || '2026-01-01',
          time: '00:00:00',
          timestamp: 1,
          itemId: item.code,
          itemNameAr: item.nameAr,
          itemNameEn: item.nameEn,
          smallUnit: item.smallUnit || (isAr ? 'وحدة' : 'Unit'),
          variantCode: vCode,
          variantSpecs: v.mergedSpecs || '',
          lotNumber: obLot,
          unitPrice: unitCost,
          currency: 'EGP',
          actor: v.supplierName || (isAr ? 'الإدارة العامة' : 'General Admin'),
          verifier: isAr ? 'تهيئة النظام' : 'System Initializer',
          sourceName: isAr ? 'رصيد تأسيسي أولي' : 'Initial Setup',
          targetName: getWhName(whKey),
          notes: isAr ? 'رصيد افتتاحي أولي للخامة' : 'Initial opening stock balance',
          rawQty: openQty,
          perWarehouseDelta: { [whKey]: openQty },
          netUsableDelta: isUsable ? openQty : 0,
          isScrapMovement: isScrapWh(whKey),
          scrapValue: isScrapWh(whKey) ? openQty * unitCost : 0,
          rawDoc: { type: 'OB', item, variant: v },
        });
      });
    });

    // -----------------------------------------------------------------------
    // B. VENDOR RECEIPTS (GRN), RETURNS (RTN), & AUDIT RECONCILIATIONS (ADJ)
    // -----------------------------------------------------------------------
    goodsReceipts.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      if (grn.docType === 'opening_balance' || grn.id?.startsWith('OB-')) return;

      const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');
      const isReconciliation = grn.docType === 'inventory_reconciliation' || grn.id?.startsWith('ADJ');
      const timeInfo = resolveTimeInfo(grn, grn.receiptDate);

      (grn.lines || []).forEach((line, lIdx) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const itemObj = itemsMaster.find((i) => i.code === pId || i.id === pId);
        const itemLot =
          line.lotNumber ||
          (line.linkedGrnId
            ? `${line.linkedGrnId}-${String(lIdx + 1).padStart(2, '0')}`
            : `${grn.id}-${String(lIdx + 1).padStart(2, '0')}`);

        const rawQty = Number(line.receivedSmallUnits || 0);
        const isSurplus = rawQty >= 0;
        const qtyAbs = Math.abs(rawQty);
        const whKey = normalizeWhId(line.targetWarehouse);
        const whObj = getWhObj(line.targetWarehouse);
        const isUsable = isUsableWarehouse(whObj);
        const unitPrice = Number(line.unitPrice || 0) || resolveItemOrLotCost({
          itemId: pId,
          variantCode: vCode,
          lotNumber: itemLot,
          warehouseId: whKey,
          goodsReceipts,
          itemsMaster,
          intermediateRecipes,
        });

        let tag = 'GRN';
        let label = isAr ? 'توريد واستلام (GRN)' : 'Vendor Receipt (GRN)';
        let badge = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        let sourceName = grn.supplierName || (isAr ? 'مورد معتمد' : 'Vendor');
        let targetName = getWhName(whKey);
        let deltaQty = qtyAbs;
        let usableDelta = isUsable ? qtyAbs : 0;

        if (isReconciliation) {
          tag = 'ADJ';
          label = isAr ? 'تسوية جرد فعلي (ADJ)' : 'Stock Count Adj (ADJ)';
          badge = 'bg-purple-50 text-purple-800 border-purple-200';
          deltaQty = rawQty; // can be positive or negative
          usableDelta = isUsable ? rawQty : 0;
          sourceName = rawQty >= 0 ? (isAr ? 'فائض تسوية جرد' : 'Count Surplus') : getWhName(whKey);
          targetName = rawQty >= 0 ? getWhName(whKey) : (isAr ? 'عجز تسوية جرد' : 'Count Deficit');
        } else if (isReturn) {
          tag = 'RTN';
          label = isAr ? 'مرتجع مورد (RTN)' : 'Supplier Return (RTN)';
          badge = 'bg-rose-50 text-rose-800 border-rose-200';
          deltaQty = -qtyAbs;
          usableDelta = isUsable ? -qtyAbs : 0;
          sourceName = getWhName(whKey);
          targetName = grn.supplierName || (isAr ? 'مرتجع للمورد' : 'Returned to Vendor');
        }

        const isScrap = isScrapWh(whKey);

        list.push({
          id: `${grn.id}-${lIdx}`,
          refCode: grn.id,
          type: tag,
          typeLabel: label,
          badgeClass: badge,
          date: timeInfo.date,
          time: timeInfo.time,
          timestamp: timeInfo.timestamp,
          itemId: pId,
          itemNameAr: line.nameAr || itemObj?.nameAr || pId,
          itemNameEn: line.nameEn || itemObj?.nameEn || pId,
          smallUnit: line.smallUnit || itemObj?.smallUnit || (isAr ? 'وحدة' : 'Unit'),
          variantCode: vCode,
          variantSpecs: line.specs || '',
          lotNumber: itemLot,
          unitPrice,
          currency: line.currency || 'EGP',
          actor: isReconciliation
            ? (line.placedBy || grn.placedBy || grn.countedBy || grn.receivedBy || 'Auditor')
            : (grn.receivedBy || grn.placedBy || 'Storekeeper'),
          verifier: grn.verifiedBy || grn.approvedBy || '',
          sourceName,
          targetName,
          notes: grn.notes || line.notes || (isReconciliation ? (line.varianceReason || 'Inventory Adjustment') : ''),
          rawQty: qtyAbs,
          perWarehouseDelta: { [whKey]: deltaQty },
          netUsableDelta: usableDelta,
          isScrapMovement: isScrap && deltaQty > 0,
          scrapValue: isScrap && deltaQty > 0 ? deltaQty * unitPrice : 0,
          rawDoc: { type: tag, grn, line },
        });
      });
    });

    // -----------------------------------------------------------------------
    // C. INTERNAL TRANSFERS (TRN) & PIPELINE LIQUID MOVEMENT (PIPE)
    // -----------------------------------------------------------------------
    transfers.forEach((trn) => {
      if (trn.status !== 'completed') return;
      const timeInfo = resolveTimeInfo(trn, trn.transferDate);
      const isPipe = trn.isPipelineTransfer || trn.id?.startsWith('TRN-PIPE-');
      const srcWhKey = normalizeWhId(trn.sourceWarehouse);
      const tgtWhKey = normalizeWhId(trn.targetWarehouse);
      const srcObj = getWhObj(trn.sourceWarehouse);
      const tgtObj = getWhObj(trn.targetWarehouse);
      const srcUsable = isUsableWarehouse(srcObj);
      const tgtUsable = isUsableWarehouse(tgtObj);
      const isScrapTarget = isScrapWh(tgtWhKey);

      (trn.lines || []).forEach((line, lIdx) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const itemObj = itemsMaster.find((i) => i.code === pId || i.id === pId);
        const qty = Number(line.qtySmallUnits || line.quantity || 0);
        const unitPrice = (Number(line.unitPrice) > 0 && Number(line.unitPrice) !== 5)
          ? Number(line.unitPrice)
          : resolveItemOrLotCost({
              itemId: pId,
              variantCode: vCode,
              lotNumber: line.lotNumber,
              warehouseId: tgtWhKey,
              goodsReceipts,
              itemsMaster,
              transformations,
              intermediateRecipes,
            });

        // Calculate net usable delta:
        // If moving out of usable into unusable (e.g. into scrap): -qty
        // If moving out of unusable into usable: +qty
        // If moving between usable warehouses: 0
        let netUsable = 0;
        if (srcUsable && !tgtUsable) netUsable = -qty;
        else if (!srcUsable && tgtUsable) netUsable = qty;

        list.push({
          id: `${trn.id}-${lIdx}`,
          refCode: trn.id,
          type: isPipe ? 'PIPE' : 'TRN',
          typeLabel: isPipe
            ? (isAr ? 'ضخ ورفع عبر الأنابيب (PIPE)' : 'Pipeline Liquid (PIPE)')
            : (isAr ? 'تحويل مخزني داخلي (TRN)' : 'Internal Transfer (TRN)'),
          badgeClass: isPipe
            ? 'bg-sky-50 text-sky-800 border-sky-200'
            : 'bg-indigo-50 text-indigo-800 border-indigo-200',
          date: timeInfo.date,
          time: timeInfo.time,
          timestamp: timeInfo.timestamp,
          itemId: pId,
          itemNameAr: line.nameAr || itemObj?.nameAr || pId,
          itemNameEn: line.nameEn || itemObj?.nameEn || pId,
          smallUnit: line.smallUnit || itemObj?.smallUnit || (isAr ? 'وحدة' : 'Unit'),
          variantCode: vCode,
          variantSpecs: line.specs || '',
          lotNumber: line.lotNumber || '—',
          unitPrice,
          currency: line.currency || 'EGP',
          actor: trn.issuedBy || trn.placedBy || 'Storekeeper',
          verifier: trn.receivedBy || trn.verifiedBy || '',
          sourceName: getWhName(srcWhKey),
          targetName: getWhName(tgtWhKey),
          notes: trn.notes || (isPipe ? 'نقل وضخ سائل بالتانكات' : 'تحويل مخزني داخلي'),
          rawQty: qty,
          perWarehouseDelta: {
            [srcWhKey]: -qty,
            [tgtWhKey]: qty,
          },
          netUsableDelta: netUsable,
          isScrapMovement: isScrapTarget,
          scrapValue: isScrapTarget ? qty * unitPrice : 0,
          rawDoc: { type: 'TRN', trn, line },
        });
      });
    });

    // -----------------------------------------------------------------------
    // D. WORK ORDER / PRODUCTION CONSUMPTIONS (WO / PRD-INT / ISS)
    // -----------------------------------------------------------------------
    transformations.forEach((trans) => {
      if (trans.status === 'cancelled' || trans.status === 'rejected') return;
      const timeInfo = resolveTimeInfo(trans, trans.date);
      const isWorkOrder = Boolean(trans.workOrderId || trans.id?.startsWith('TRANS-WO-'));
      const woRefCode = trans.workOrderId || trans.productionOrderRef || trans.id;
      const srcWhKey = normalizeWhId(trans.warehouseId || trans.sourceWarehouse || trans.fromWarehouse || 'wh_floor');
      const srcObj = getWhObj(srcWhKey);
      const isUsable = isUsableWarehouse(srcObj);

      // 1. Inflow (+): Produced Intermediate M-material in Tank Prep WH (PRD-INT)
      if (trans.itemCode && Number(trans.producedQty) > 0 && !isWorkOrder) {
        const pId = trans.itemCode;
        const vCode = trans.variantCode || pId;
        const qty = Number(trans.producedQty);
        const tankLotNo = trans.lotNumber || (trans.tankNumber ? `TANK-${trans.tankNumber}` : `LOT-${trans.id}`);
        const tankRef = trans.tankNumber ? `TANK-#${trans.tankNumber}` : trans.id;
        const unitPrice = (Number(trans.unitCost || trans.unitPrice) > 0 && Number(trans.unitCost || trans.unitPrice) !== 5)
          ? Number(trans.unitCost || trans.unitPrice)
          : resolveItemOrLotCost({
              itemId: pId,
              variantCode: vCode,
              lotNumber: tankLotNo,
              warehouseId: srcWhKey,
              goodsReceipts,
              itemsMaster,
              transformations,
              intermediateRecipes,
            });

        list.push({
          id: `${trans.id}-PROD`,
          refCode: tankRef,
          type: 'PRD-INT',
          typeLabel: isAr ? 'إنتاج خامة وسيطة بالتانك (PRD-INT)' : 'Intermediate Tank Prep (PRD-INT)',
          badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
          date: timeInfo.date,
          time: timeInfo.time,
          timestamp: timeInfo.timestamp,
          itemId: pId,
          itemNameAr: trans.itemNameAr || itemObj?.nameAr || pId,
          itemNameEn: trans.itemNameEn || itemObj?.nameEn || pId,
          smallUnit: trans.yieldUnit || itemObj?.smallUnit || 'لتر',
          variantCode: vCode,
          variantSpecs: trans.specs || trans.recipeName || '',
          lotNumber: tankLotNo,
          unitPrice,
          currency: 'EGP',
          actor: trans.registeredBy || trans.operatorName || trans.createdBy || 'Tank Operator',
          verifier: trans.supervisedBy || '',
          sourceName: isAr ? 'تحضير خلطات وسيطة' : 'Tank Mixing & Preparation',
          targetName: getWhName(srcWhKey),
          notes: trans.notes || (isAr ? `إنتاج خامة وسيطة بالتانك (${tankRef}) بحجم (${qty.toLocaleString()} ${trans.yieldUnit || 'لتر'})` : `Tank prep ${tankRef} (${qty} ${trans.yieldUnit || 'L'})`),
          rawQty: qty,
          perWarehouseDelta: { [srcWhKey]: qty },
          netUsableDelta: isUsable ? qty : 0,
          isScrapMovement: false,
          scrapValue: 0,
          rawDoc: { type: 'PRD-INT', transformation: trans },
        });
      }

      // 2. Outflow (-): Consumed Components (R-materials for Tank Prep or Packaging/Intermediate for WO)
      const consumedList = Array.isArray(trans.consumedComponents) && trans.consumedComponents.length > 0
        ? trans.consumedComponents
        : (Array.isArray(trans.consumedLines) && trans.consumedLines.length > 0
            ? trans.consumedLines
            : (Array.isArray(trans.consumedMaterials) ? trans.consumedMaterials : (Array.isArray(trans.inputs) ? trans.inputs : [])));

      consumedList.forEach((c, cIdx) => {
        const pId = c.itemId || (c.code ? c.code.split('-')[0] : '');
        const vCode = c.variantCode || c.code || pId;
        const itemObj = itemsMaster.find((i) => i.code === pId || i.id === pId);
        const qty = Number(c.qtySmallUnits || c.qty || c.consumedSmallUnits || 0);
        const lineLot = c.lotNumber || trans.lotNumber || '—';
        const unitPrice = (Number(c.unitCost || c.unitPrice) > 0 && Number(c.unitCost || c.unitPrice) !== 5)
          ? Number(c.unitCost || c.unitPrice)
          : resolveItemOrLotCost({
              itemId: pId,
              variantCode: vCode,
              lotNumber: lineLot,
              warehouseId: srcWhKey,
              goodsReceipts,
              itemsMaster,
              transformations,
              intermediateRecipes,
            });

        list.push({
          id: `${trans.id}-C${cIdx}`,
          refCode: isWorkOrder ? woRefCode : (trans.tankNumber ? `TANK-#${trans.tankNumber}` : trans.id),
          type: isWorkOrder ? 'WO' : 'PRD-INT',
          typeLabel: isWorkOrder
            ? (isAr ? 'صرف استهلاك تشغيل (WO)' : 'Work Order Issue (WO)')
            : (isAr ? 'استهلاك خامات تحضير تانك (BOM)' : 'Tank Component Consumption (BOM)'),
          badgeClass: isWorkOrder
            ? 'bg-amber-50 text-amber-900 border-amber-200'
            : 'bg-blue-50 text-blue-900 border-blue-200',
          date: timeInfo.date,
          time: timeInfo.time,
          timestamp: timeInfo.timestamp,
          itemId: pId,
          itemNameAr: c.nameAr || itemObj?.nameAr || pId,
          itemNameEn: c.nameEn || itemObj?.nameEn || pId,
          smallUnit: c.smallUnit || c.unit || itemObj?.smallUnit || (isAr ? 'وحدة' : 'Unit'),
          variantCode: vCode,
          variantSpecs: c.specs || '',
          lotNumber: lineLot,
          unitPrice,
          currency: 'EGP',
          actor: trans.operatorName || trans.registeredBy || trans.issuedBy || trans.createdBy || 'Production Lead',
          verifier: trans.supervisedBy || trans.lineManager || '',
          sourceName: getWhName(srcWhKey),
          targetName: isWorkOrder
            ? (isAr ? `أمر إنتاج (${woRefCode})` : `Work Order (${woRefCode})`)
            : (isAr ? `تحضير تانك #${trans.tankNumber || ''}` : `Tank Prep #${trans.tankNumber || ''}`),
          notes: trans.notes || (isWorkOrder
            ? (isAr ? `صرف خامات تشغيل لأمر الإنتاج (${woRefCode})` : `Raw materials consumed for WO #${woRefCode}`)
            : (isAr ? `استهلاك خامات تحضير لتانك #${trans.tankNumber || ''}` : `Formulation raw materials consumed for tank #${trans.tankNumber || ''}`)),
          rawQty: qty,
          perWarehouseDelta: { [srcWhKey]: -qty },
          netUsableDelta: isUsable ? -qty : 0,
          isScrapMovement: false,
          scrapValue: 0,
          rawDoc: { type: isWorkOrder ? 'WO' : 'PRD-INT', transformation: trans, consumedLine: c, workOrderId: woRefCode },
        });
      });
    });

    // -----------------------------------------------------------------------
    // E. SPARE PARTS & MAINTENANCE CONSUMPTIONS (X)
    // -----------------------------------------------------------------------
    sparePartsIssues.forEach((issue) => {
      const timeInfo = resolveTimeInfo(issue, issue.date);
      const whKey = normalizeWhId(issue.warehouseId || 'wh_spares');
      const whObj = getWhObj(whKey);
      const isUsable = isUsableWarehouse(whObj);
      const pId = issue.itemId || issue.code;
      const vCode = issue.variantCode || pId;
      const itemObj = itemsMaster.find((i) => i.code === pId || i.id === pId);
      const qty = Number(issue.quantity || 0);
      const unitPrice = Number(issue.unitCost || 0) || resolveItemOrLotCost({
        itemId: pId,
        variantCode: vCode,
        lotNumber: issue.lotNumber,
        warehouseId: whKey,
        goodsReceipts,
        itemsMaster,
        intermediateRecipes,
      });

      list.push({
        id: `X-${issue.id}`,
        refCode: issue.id,
        type: 'X',
        typeLabel: isAr ? 'صرف صيانة وإهلاك (X)' : 'Spare Parts Issue (X)',
        badgeClass: 'bg-orange-50 text-orange-900 border-orange-200',
        date: timeInfo.date,
        time: timeInfo.time,
        timestamp: timeInfo.timestamp,
        itemId: pId,
        itemNameAr: issue.nameAr || itemObj?.nameAr || pId,
        itemNameEn: issue.nameEn || itemObj?.nameEn || pId,
        smallUnit: issue.unit || itemObj?.smallUnit || (isAr ? 'قطعة' : 'Piece'),
        variantCode: vCode,
        variantSpecs: issue.specs || '',
        lotNumber: issue.lotNumber || '—',
        unitPrice,
        currency: 'EGP',
        actor: issue.issuedBy || 'Storekeeper',
        verifier: issue.receivedBy || issue.technicianName || '',
        sourceName: getWhName(whKey),
        targetName: issue.machineName ? (isAr ? `صيانة ماكينة: ${issue.machineName}` : `Machine: ${issue.machineName}`) : (isAr ? 'ورشة الصيانة' : 'Maintenance'),
        notes: issue.reason || issue.notes || (isAr ? 'صرف قطع غيار ومستهلكات تشغيل' : 'Spare parts issue'),
        rawQty: qty,
        perWarehouseDelta: { [whKey]: -qty },
        netUsableDelta: isUsable ? -qty : 0,
        isScrapMovement: false,
        scrapValue: 0,
        rawDoc: { type: 'X', issue },
      });
    });

    // Sort chronologically ascending
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [itemsMaster, goodsReceipts, transfers, transformations, sparePartsIssues, warehouses, isAr]);

  // Unique LOT list derived from all recorded transactions
  const uniqueLotsList = useMemo(() => {
    const set = new Set();
    allRawTransactions.forEach((t) => {
      if (t.lotNumber && t.lotNumber !== '—') {
        if (selectedItemCode === 'all' || t.itemId === selectedItemCode) {
          set.add(t.lotNumber);
        }
      }
    });
    return Array.from(set).sort();
  }, [allRawTransactions, selectedItemCode]);

  // Unique Users list derived from all transactions
  const activeActorsList = useMemo(() => {
    const map = new Map();
    allRawTransactions.forEach((t) => {
      if (t.actor) map.set(t.actor, t.actor);
      if (t.verifier) map.set(t.verifier, t.verifier);
    });
    usersList.forEach((u) => {
      if (u.nameAr) map.set(u.id, u.nameAr);
      else if (u.name) map.set(u.id, u.name);
    });
    return Array.from(map.entries()).map(([val, label]) => ({ val, label }));
  }, [allRawTransactions, usersList]);

  // =========================================================================
  // 3. FILTERING & RUNNING PROGRESSION ENGINE
  // =========================================================================
  const {
    filteredTransactions,
    activeWarehousesForColumns,
    prePeriodCarryForward,
    kpiStats,
  } = useMemo(() => {
    // 1. Identify which warehouses have ever appeared or exist in filtered scope
    const whAppearedSet = new Set();

    // 2. Pre-filter by Material, Variant, Lot, Movement Type, and User
    const itemScopedMovements = allRawTransactions.filter((t) => {
      if (selectedItemCode !== 'all' && t.itemId !== selectedItemCode) return false;
      if (selectedVariantCode !== 'all' && t.variantCode !== selectedVariantCode) return false;
      if (selectedLotNumber !== 'all' && t.lotNumber !== selectedLotNumber) return false;
      if (selectedMovementType !== 'all' && t.type !== selectedMovementType) return false;
      if (selectedUser !== 'all') {
        const matchesActor = t.actor === selectedUser || t.actor === getUserName(selectedUser);
        const matchesVerifier = t.verifier === selectedUser || t.verifier === getUserName(selectedUser);
        if (!matchesActor && !matchesVerifier) return false;
      }
      return true;
    });

    // Track all warehouses touched by these matching movements
    itemScopedMovements.forEach((t) => {
      Object.keys(t.perWarehouseDelta).forEach((k) => whAppearedSet.add(k));
    });

    // In case no movement yet, include active warehouses from master
    if (whAppearedSet.size === 0) {
      warehouses.forEach((w) => whAppearedSet.add(w.code || w.id));
    }

    // Convert whAppearedSet to ordered array of warehouse objects
    const activeWhCols = Array.from(whAppearedSet).map((k) => {
      const obj = getWhObj(k);
      return {
        key: k,
        nameAr: obj?.nameAr || k,
        nameEn: obj?.nameEn || obj?.nameAr || k,
        code: obj?.code || k,
        color: obj?.color || '#0d6cba',
        isScrap: isScrapWh(k),
        isUsable: isUsableWarehouse(obj),
      };
    });

    // Sort warehouses: Raw Materials first, Floor second, Finished Goods third, Scrap last
    activeWhCols.sort((a, b) => {
      if (a.isScrap && !b.isScrap) return 1;
      if (!a.isScrap && b.isScrap) return -1;
      return a.nameAr.localeCompare(b.nameAr, 'ar');
    });

    // Helper to determine the balance tracking key based on filter criteria:
    // 1. If a specific LOT is selected, balance is LOT-specific.
    // 2. If a specific variant is selected (and all lots), balance is variant-specific.
    // 3. If all variants and all LOTs are selected (or default), balance is material-specific (itemId).
    const getBalanceTrackingKey = (t) => {
      const itemKey = (t.itemId || '').trim();
      const vKey = (t.variantCode || '').trim();
      const lotKey = (t.lotNumber || '').trim();

      if (selectedLotNumber !== 'all') {
        return `${itemKey}___${vKey}___${lotKey}`;
      }
      if (selectedVariantCode !== 'all') {
        return `${itemKey}___${vKey}`;
      }
      return itemKey;
    };

    // 3. Progressive Balances tracked per entity key
    const runningWhBalancesByKey = {}; // { [key]: { [whKey]: number } }
    const runningUsableByKey = {}; // { [key]: number }

    // Pre-period balances tracked per key
    const prePeriodByKey = {};
    const hasDateFilter = Boolean(startDate);

    const inRangeRows = [];

    // Accumulate running balances chronologically
    itemScopedMovements.forEach((t) => {
      const isBeforeStart = startDate && t.date < startDate;
      const isAfterEnd = endDate && t.date > endDate;

      const key = getBalanceTrackingKey(t);

      // Initialize key structures if not seen yet
      if (!runningWhBalancesByKey[key]) {
        runningWhBalancesByKey[key] = {};
        activeWhCols.forEach((w) => {
          runningWhBalancesByKey[key][w.key] = 0;
        });
        runningUsableByKey[key] = 0;
      }

      // Apply deltas to running balance of this specific material/variant/lot
      Object.entries(t.perWarehouseDelta).forEach(([whKey, delta]) => {
        runningWhBalancesByKey[key][whKey] = (runningWhBalancesByKey[key][whKey] || 0) + delta;
      });
      runningUsableByKey[key] = (runningUsableByKey[key] || 0) + (t.netUsableDelta || 0);

      if (isBeforeStart) {
        if (!prePeriodByKey[key]) {
          prePeriodByKey[key] = {
            balances: {},
            usable: 0,
            itemId: t.itemId,
            itemLabel: t.itemNameAr || t.itemId,
            variantLabel: t.variantCode || '',
            lotLabel: t.lotNumber || '—',
          };
          activeWhCols.forEach((w) => {
            prePeriodByKey[key].balances[w.key] = 0;
          });
        }
        Object.entries(t.perWarehouseDelta).forEach(([whKey, delta]) => {
          prePeriodByKey[key].balances[whKey] = (prePeriodByKey[key].balances[whKey] || 0) + delta;
        });
        prePeriodByKey[key].usable += (t.netUsableDelta || 0);
        return;
      }

      if (isAfterEnd) return;

      // Single Warehouse Filter check
      if (selectedWarehouse !== 'all') {
        const involvedInSelectedWh = t.perWarehouseDelta[selectedWarehouse] !== undefined;
        if (!involvedInSelectedWh) return;
      }

      // Free-text search inside table
      if (tableSearchQuery.trim()) {
        const q = tableSearchQuery.toLowerCase().trim();
        const matches =
          t.refCode.toLowerCase().includes(q) ||
          t.itemId.toLowerCase().includes(q) ||
          t.itemNameAr.toLowerCase().includes(q) ||
          (t.lotNumber && t.lotNumber.toLowerCase().includes(q)) ||
          t.sourceName.toLowerCase().includes(q) ||
          t.targetName.toLowerCase().includes(q) ||
          (t.actor && t.actor.toLowerCase().includes(q)) ||
          (t.notes && t.notes.toLowerCase().includes(q));
        if (!matches) return;
      }

      // Snapshot of progressive balances for THIS SPECIFIC MATERIAL/VARIANT/LOT after this row
      const progressiveWhSnapshot = { ...runningWhBalancesByKey[key] };
      const progressiveUsableSnapshot = runningUsableByKey[key];

      // Mode 1: Single Warehouse Specifics
      const singleWhDelta = selectedWarehouse !== 'all' ? (t.perWarehouseDelta[selectedWarehouse] || 0) : 0;
      const singleWhIn = singleWhDelta > 0 ? singleWhDelta : 0;
      const singleWhOut = singleWhDelta < 0 ? Math.abs(singleWhDelta) : 0;
      const singleWhProgressive = runningWhBalancesByKey[key][selectedWarehouse] || 0;

      // Counterpart determination in Mode 1:
      let counterpartText = '';
      if (selectedWarehouse !== 'all') {
        if (singleWhDelta > 0) {
          counterpartText = isAr ? `وارد من: ${t.sourceName}` : `From: ${t.sourceName}`;
        } else if (singleWhDelta < 0) {
          counterpartText = isAr ? `منصرف إلى: ${t.targetName}` : `To: ${t.targetName}`;
        } else {
          counterpartText = `${t.sourceName} ➔ ${t.targetName}`;
        }
      }

      inRangeRows.push({
        ...t,
        balanceTrackingKey: key,
        progressiveWhBalances: progressiveWhSnapshot,
        progressiveGlobalUsable: progressiveUsableSnapshot,
        progressiveUsableValuation: progressiveUsableSnapshot * (t.unitPrice || 0),
        singleWhIn,
        singleWhOut,
        singleWhDelta,
        singleWhProgressive,
        counterpartText,
      });
    });

    // KPI calculation for in-range rows
    let totalInward = 0;
    let totalOutward = 0;
    let totalFinancialVolume = 0;
    let totalScrapInwardValue = 0;

    inRangeRows.forEach((r) => {
      if (selectedWarehouse !== 'all') {
        totalInward += r.singleWhIn;
        totalOutward += r.singleWhOut;
        totalFinancialVolume += Math.abs(r.singleWhDelta) * (r.unitPrice || 0);
      } else {
        if (r.netUsableDelta > 0) totalInward += r.netUsableDelta;
        if (r.netUsableDelta < 0) totalOutward += Math.abs(r.netUsableDelta);
        totalFinancialVolume += (r.rawQty || 0) * (r.unitPrice || 0);
      }
      if (r.isScrapMovement) {
        totalScrapInwardValue += (r.scrapValue || 0);
      }
    });

    // Determine pre-period target key if a single entity is selected
    const shouldShowPinnedOpeningRow = Boolean(hasDateFilter && (selectedItemCode !== 'all' || selectedLotNumber !== 'all'));
    let activePrePeriodBalances = {};
    let activePrePeriodUsable = 0;
    let activePrePeriodItemLabel = '';
    let activePrePeriodVariantLabel = '';
    let activePrePeriodLotLabel = '';

    if (shouldShowPinnedOpeningRow) {
      const targetItemCode = selectedItemCode !== 'all' ? selectedItemCode : '';
      const targetKey = selectedLotNumber !== 'all'
        ? `${targetItemCode}___${selectedVariantCode !== 'all' ? selectedVariantCode : ''}___${selectedLotNumber}`
        : selectedVariantCode !== 'all'
        ? `${targetItemCode}___${selectedVariantCode}`
        : targetItemCode;

      const matchedPrePeriod = prePeriodByKey[targetKey] || Object.values(prePeriodByKey).find(p => p.itemId === targetItemCode);
      activePrePeriodBalances = matchedPrePeriod?.balances || {};
      activePrePeriodUsable = matchedPrePeriod?.usable || 0;

      const selObj = itemsMaster.find(i => i.code === targetItemCode || i.id === targetItemCode);
      activePrePeriodItemLabel = selObj?.nameAr || matchedPrePeriod?.itemLabel || targetItemCode;
      activePrePeriodVariantLabel = selectedVariantCode !== 'all' ? selectedVariantCode : (isAr ? 'كافة التنوعات' : 'All Variants');
      activePrePeriodLotLabel = selectedLotNumber !== 'all' ? selectedLotNumber : '—';
    }

    return {
      filteredTransactions: inRangeRows,
      activeWarehousesForColumns: activeWhCols,
      prePeriodCarryForward: {
        hasDateFilter,
        shouldShowPinnedRow: shouldShowPinnedOpeningRow,
        balances: activePrePeriodBalances,
        globalUsable: activePrePeriodUsable,
        itemLabel: activePrePeriodItemLabel,
        variantLabel: activePrePeriodVariantLabel,
        lotLabel: activePrePeriodLotLabel,
      },
      kpiStats: {
        totalInward,
        totalOutward,
        netPeriodChange: totalInward - totalOutward,
        totalFinancialVolume,
        totalScrapInwardValue,
        rowCount: inRangeRows.length,
      },
    };
  }, [
    allRawTransactions,
    selectedItemCode,
    selectedVariantCode,
    selectedLotNumber,
    selectedWarehouse,
    selectedUser,
    selectedMovementType,
    tableSearchQuery,
    startDate,
    endDate,
    warehouses,
    isAr,
  ]);

  // =========================================================================
  // 4. EXPORT TO EXCEL & PRINT REPORT
  // =========================================================================
  const handleExportToExcel = () => {
    if (filteredTransactions.length === 0) {
      alert(isAr ? 'لا توجد حركات مطابقة لتصديرها.' : 'No movements to export.');
      return;
    }

    const rowsForExport = [];

    // Header Meta
    filteredTransactions.forEach((row, idx) => {
      const exportItem = {
        '#': idx + 1,
        [isAr ? 'التاريخ' : 'Date']: row.date,
        [isAr ? 'الوقت' : 'Time']: row.time,
        [isAr ? 'نوع الحركة' : 'Type']: row.typeLabel,
        [isAr ? 'رقم المستند / الحركة' : 'Ref Code']: row.refCode,
        [isAr ? 'كود الصنف' : 'Item Code']: row.itemId,
        [isAr ? 'اسم الصنف' : 'Item Name']: row.itemNameAr,
        [isAr ? 'كود التنوع' : 'Variant Code']: row.variantCode,
        [isAr ? 'رقم اللوط / التشغيلة' : 'LOT']: row.lotNumber,
      };

      if (selectedWarehouse !== 'all') {
        exportItem[isAr ? 'المستودع المعني' : 'Warehouse'] = getWhName(selectedWarehouse);
        exportItem[isAr ? 'الطرف المقابل / الاتجاه' : 'Counterpart'] = row.counterpartText;
        exportItem[isAr ? 'وارد (+)' : 'Inward (+)'] = row.singleWhIn;
        exportItem[isAr ? 'منصرف (-)' : 'Outward (-)'] = row.singleWhOut;
        exportItem[isAr ? 'رصيد المستودع المتحرك' : 'Running WH Balance'] = row.singleWhProgressive;
      } else {
        // Mode 2: Per-warehouse columns
        activeWarehousesForColumns.forEach((w) => {
          const delta = row.perWarehouseDelta[w.key];
          const deltaStr = delta === undefined ? '—' : (delta > 0 ? `+${delta}` : String(delta));
          const bal = row.progressiveWhBalances[w.key] || 0;
          exportItem[`${w.nameAr} [${isAr ? 'حركة' : 'Δ'}]`] = deltaStr;
          exportItem[`${w.nameAr} [${isAr ? 'رصيد' : 'Bal'}]`] = bal;
        });

        exportItem[isAr ? 'صافي التغير الصالح للاستخدام' : 'Net Usable Δ'] = row.netUsableDelta;
        exportItem[isAr ? 'إجمالي الرصيد الصالح' : 'Global Usable Balance'] = row.progressiveGlobalUsable;
        if (canViewTotals) {
          exportItem[isAr ? 'قيمة الرصيد الصالح (ج.م)' : 'Usable Valuation (EGP)'] = row.progressiveUsableValuation;
        }
        exportItem[isAr ? 'قيمة المحول للهالك (ج.م)' : 'Scrap Value (EGP)'] = row.isScrapMovement ? row.scrapValue : 0;
      }

      if (canViewPrices) {
        exportItem[isAr ? 'سعر الوحدة' : 'Unit Cost'] = row.unitPrice;
      }
      exportItem[isAr ? 'المسؤول' : 'Actor'] = row.actor;
      exportItem[isAr ? 'معتمد الاستلام' : 'Verifier'] = row.verifier;
      exportItem[isAr ? 'البيان والملاحظات' : 'Notes'] = row.notes;

      rowsForExport.push(exportItem);
    });

    const worksheet = XLSX.utils.json_to_sheet(rowsForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock_Lifecycle_Ledger');
    const fileName = `Material_Lifecycle_Ledger_${selectedItemCode}_${startDate || 'ALL'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handlePrintLandscape = () => {
    window.print();
  };

  // Helper to resolve linked Work Order details
  const linkedWorkOrderObj = useMemo(() => {
    if (!selectedMovementDetail) return null;
    const ref = selectedMovementDetail.refCode;
    return workOrders.find((w) => w.orderNumber === ref || w.id === ref) || null;
  }, [selectedMovementDetail, workOrders]);

  return (
    <div className="space-y-4">
      {/* ===================================================================== */}
      {/* A. EXECUTIVE STATS KPI BANNER                                         */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        {/* KPI 1: Inflow */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
              {isAr ? 'إجمالي الوارد بالفترة (+):' : 'Total Period Inflow (+):'}
            </span>
            <span className="text-base sm:text-lg font-mono font-black text-emerald-700 block">
              +{kpiStats.totalInward.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400">
              {isAr ? 'توريدات وتحويلات داخلة' : 'Receipts & in-transfers'}
            </span>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 2: Outflow */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
              {isAr ? 'إجمالي المنصرف بالفترة (-):' : 'Total Period Outflow (-):'}
            </span>
            <span className="text-base sm:text-lg font-mono font-black text-rose-700 block">
              -{kpiStats.totalOutward.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400">
              {isAr ? 'صرف إنتاج، مرتجع، وتحويلات' : 'Production, returns & out'}
            </span>
          </div>
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
            <ArrowUpRight className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 3: Net Period Change */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
              {isAr ? 'صافي التغير المخزني:' : 'Net Inventory Delta:'}
            </span>
            <span
              className={`text-base sm:text-lg font-mono font-black block ${
                kpiStats.netPeriodChange >= 0 ? 'text-indigo-700' : 'text-amber-700'
              }`}
            >
              {kpiStats.netPeriodChange >= 0 ? `+${kpiStats.netPeriodChange.toLocaleString()}` : kpiStats.netPeriodChange.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400">
              {kpiStats.rowCount} {isAr ? 'حركة مسجلة' : 'movements'}
            </span>
          </div>
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 4: Financial Valuation or Scrap */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
              {canViewTotals
                ? (isAr ? 'قيمة الحركات / الهالك المحول:' : 'Volume Valuation / Scrap:')
                : (isAr ? 'إجمالي الحركات المؤثرة:' : 'Total Impacted Movements:')}
            </span>
            {canViewTotals ? (
              <>
                <span className="text-sm sm:text-base font-mono font-extrabold text-slate-900 block truncate">
                  {kpiStats.totalFinancialVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} EGP
                </span>
                {kpiStats.totalScrapInwardValue > 0 && (
                  <span className="text-[10px] font-mono font-bold text-rose-600 block">
                    {isAr ? 'منها هالك:' : 'Scrap:'} {kpiStats.totalScrapInwardValue.toLocaleString()} EGP
                  </span>
                )}
              </>
            ) : (
              <span className="text-base font-mono font-bold text-slate-800">
                {kpiStats.rowCount} {isAr ? 'سجل' : 'records'}
              </span>
            )}
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* B. MULTI-DIMENSIONAL CRITERIA FILTER BAR                              */}
      {/* ===================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3.5 print:hidden">
        {/* Row 1: Material, Variant, Lot, and Warehouse */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Raw Material Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>{isAr ? 'الخامة / الصنف:' : 'Raw Material:'}</span>
            </label>
            <select
              value={selectedItemCode}
              onChange={(e) => handleItemChange(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-xl text-xs font-bold bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition"
            >
              <option value="all">{isAr ? '-- كافة الخامات والمواد (الكل) --' : '-- All Materials --'}</option>
              {itemsMaster.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.nameAr} [{item.code}]
                </option>
              ))}
            </select>
          </div>

          {/* 2. Variant Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-indigo-600" />
              <span>{isAr ? 'التنوع المعتمد (Variant):' : 'Variant / Spec:'}</span>
            </label>
            <select
              value={selectedVariantCode}
              onChange={(e) => setSelectedVariantCode(e.target.value)}
              disabled={selectedItemCode === 'all'}
              className="w-full p-2 border border-slate-300 rounded-xl text-xs font-medium bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition disabled:opacity-50"
            >
              <option value="all">{isAr ? '-- كافة التنوعات --' : '-- All Variants --'}</option>
              {availableVariants.map((v) => (
                <option key={v.code} value={v.code}>
                  [{v.suffix || v.code}] {v.supplierName || ''} {v.specs ? `(${v.specs})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 3. LOT / Batch Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Boxes className="h-3.5 w-3.5 text-purple-600" />
              <span>{isAr ? 'رقم التشغيلة / اللوط (LOT):' : 'LOT / Batch Number:'}</span>
            </label>
            <select
              value={selectedLotNumber}
              onChange={(e) => setSelectedLotNumber(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono font-medium bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition"
            >
              <option value="all">{isAr ? '-- كافة اللوطات والتشغيلات --' : '-- All Batches / Lots --'}</option>
              {uniqueLotsList.map((lot) => (
                <option key={lot} value={lot}>
                  {lot}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Warehouse Perspective Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Warehouse className="h-3.5 w-3.5 text-cyan-600" />
              <span>{isAr ? 'المستودع (منظور العرض):' : 'Warehouse Perspective:'}</span>
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-xl text-xs font-bold bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition"
            >
              <option value="all">{isAr ? '🌐 كافة المستودعات (عرض مجمع شامل)' : '🌐 All Warehouses (Consolidated)'}</option>
              {warehouses.map((w) => (
                <option key={w.code || w.id} value={w.code || w.id}>
                  {w.nameAr} [{w.code || w.id}] {w.classification === 'scrap' ? (isAr ? '⚠️ (هالك)' : '(Scrap)') : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Date Period, Preset shortcuts, User filter, and Actions */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100 items-end">
          {/* Date Range Inputs */}
          <div className="md:col-span-4 flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                {isAr ? 'من تاريخ:' : 'From Date:'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <span className="text-slate-400 pt-4">➔</span>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                {isAr ? 'إلى تاريخ:' : 'To Date:'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="md:col-span-3 flex flex-wrap items-center gap-1 pb-0.5">
            {[
              { id: 'today', labelAr: 'اليوم', labelEn: 'Today' },
              { id: '7days', labelAr: '٧ أيام', labelEn: '7 Days' },
              { id: 'month', labelAr: 'الشهر الحالي', labelEn: 'This Month' },
              { id: '30days', labelAr: '٣٠ يوم', labelEn: '30 Days' },
              { id: 'all', labelAr: 'الكل', labelEn: 'All' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSetDatePreset(p.id)}
                className="px-2 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                {isAr ? p.labelAr : p.labelEn}
              </button>
            ))}
          </div>

          {/* User / Actor Filter */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
              {isAr ? 'المسؤول / من قام بالحركة:' : 'User (Actor / Verifier):'}
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full p-1.5 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">{isAr ? '-- كافة المستخدمين --' : '-- All Users --'}</option>
              {activeActorsList.map((u) => (
                <option key={u.val} value={u.val}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters Button */}
          <div className="md:col-span-2 flex justify-end">
            <button
              type="button"
              onClick={handleResetFilters}
              className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
            </button>
          </div>
        </div>

        {/* Row 3: Movement Type Quick Chips & Search Bar & Export Buttons */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Quick Movement Type Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 me-1">
              <Filter className="h-3.5 w-3.5" />
              <span>{isAr ? 'نوع الحركة:' : 'Type:'}</span>
            </span>
            {[
              { id: 'all', labelAr: 'الكل', labelEn: 'All' },
              { id: 'GRN', labelAr: 'توريد (GRN)', labelEn: 'Receipt (GRN)' },
              { id: 'TRN', labelAr: 'تحويل (TRN)', labelEn: 'Transfer (TRN)' },
              { id: 'PIPE', labelAr: 'ضخ أنابيب (PIPE)', labelEn: 'Pipeline (PIPE)' },
              { id: 'PRD-INT', labelAr: 'تحضير تانك (PRD-INT)', labelEn: 'Tank Prep (PRD-INT)' },
              { id: 'WO', labelAr: 'تشغيل وإنتاج (WO)', labelEn: 'Work Order (WO)' },
              { id: 'ADJ', labelAr: 'تسوية جرد (ADJ)', labelEn: 'Count Adj (ADJ)' },
              { id: 'RTN', labelAr: 'مرتجع مورد (RTN)', labelEn: 'Return (RTN)' },
              { id: 'OB', labelAr: 'رصيد افتتاحي (OB)', labelEn: 'Opening (OB)' },
              { id: 'X', labelAr: 'قطع غيار (X)', labelEn: 'Spares (X)' },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedMovementType(chip.id)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                  selectedMovementType === chip.id
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isAr ? chip.labelAr : chip.labelEn}
              </button>
            ))}
          </div>

          {/* Search Box & Export Buttons */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="h-3.5 w-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث برقم المستند، الصنف، اللوط...' : 'Search doc#, item, lot...'}
                className="w-full ps-8 pe-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title={isAr ? 'تصدير إلى ملف إكسيل' : 'Export to Excel'}
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isAr ? 'إكسيل' : 'Excel'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintLandscape}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title={isAr ? 'طباعة تقرير بالعرض' : 'Print Landscape Report'}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mode Perspective Indicator Banner */}
      <div className="p-3 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs bg-indigo-50/70 border-indigo-200 text-indigo-950">
        <div className="flex items-center gap-2 font-bold">
          <Info className="h-4 w-4 text-indigo-600 shrink-0" />
          {selectedWarehouse === 'all' ? (
            <span>
              {isAr
                ? '🌐 وضع العرض الشامل (All Warehouses Mode): يتم استعراض عمودين لكل مستودع نشط (حركة الرصيد + الرصيد التراكمي)، بالإضافة إلى تقدم الرصيد الصالح الموحد وقيمته المالية ومتابعة عوادم الهالك.'
                : '🌐 Global Consolidated Mode: Displaying 2 columns per warehouse (Δ Movement + Progressive Balance), combined usable stock progression with financial valuation, and scrap material tracking.'}
            </span>
          ) : (
            <span>
              {isAr
                ? `🏢 منظور المستودع المحدد (${getWhName(selectedWarehouse)}): يتم احتساب الوارد والمنصرف والرصيد التراكمي خصيصاً من وجهة نظر هذا المستودع، مع توضيح الطرف المقابل لكل حركة.`
                : `🏢 Single Warehouse View (${getWhName(selectedWarehouse)}): Showing Inwards, Outwards, Counterpart entity, and running balance specifically from this warehouse perspective.`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <span className="font-sans font-bold bg-indigo-100 text-indigo-900 text-[11px] px-2.5 py-0.5 rounded-full border border-indigo-200">
            {selectedLotNumber !== 'all'
              ? (isAr ? `🎯 رصيد تشغيلة (LOT): ${selectedLotNumber}` : `🎯 LOT Balance: ${selectedLotNumber}`)
              : selectedVariantCode !== 'all'
              ? (isAr ? `🏷️ رصيد تنوع: ${selectedVariantCode}` : `🏷️ Variant Balance: ${selectedVariantCode}`)
              : selectedItemCode !== 'all'
              ? (isAr ? `📦 رصيد صنف: ${selectedItemCode}` : `📦 Material Balance: ${selectedItemCode}`)
              : (isAr ? '📦 أرصدة مستقلة لكل خامة' : '📦 Separate balance per material')}
          </span>
          <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-indigo-200">
            {filteredTransactions.length} {isAr ? 'حركة مطابقة' : 'records'}
          </span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* C. LANDSCAPE WIDE INTERACTIVE TABLE                                   */}
      {/* ===================================================================== */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-2xs">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            {/* Top Header Row */}
            <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 select-none">
              <th className="p-2.5 text-center w-8" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>#</th>
              <th className="p-2.5 text-start min-w-[95px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'التاريخ والوقت' : 'Date & Time'}</th>
              <th className="p-2.5 text-center min-w-[100px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'نوع الحركة' : 'Type'}</th>
              <th className="p-2.5 text-center min-w-[125px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'رقم المستند' : 'Ref Code'}</th>
              <th className="p-2.5 text-start min-w-[160px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'الخامة والتنوع' : 'Material & Variant'}</th>
              <th className="p-2.5 text-center min-w-[110px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'رقم التشغيلة (LOT)' : 'LOT / Batch'}</th>

              {/* MODE 1: SINGLE WAREHOUSE COLUMNS */}
              {selectedWarehouse !== 'all' ? (
                <>
                  <th className="p-2.5 text-start min-w-[150px]">{isAr ? 'المصدر / الوجهة (الطرف الآخر)' : 'Counterpart Entity'}</th>
                  <th className="p-2.5 text-center min-w-[95px] text-emerald-700 bg-emerald-50/50">{isAr ? 'وارد (+)' : 'Inward (+)'}</th>
                  <th className="p-2.5 text-center min-w-[95px] text-rose-700 bg-rose-50/50">{isAr ? 'منصرف (-)' : 'Outward (-)'}</th>
                  <th className="p-2.5 text-center min-w-[110px] text-indigo-900 bg-indigo-50/60">{isAr ? 'رصيد المستودع' : 'WH Balance'}</th>
                </>
              ) : (
                /* MODE 2: MULTI-WAREHOUSE 2-COLUMN HEADER GROUPS */
                activeWarehousesForColumns.map((w) => (
                  <th
                    key={w.key}
                    colSpan={2}
                    className={`p-2 text-center border-s border-slate-300 font-extrabold ${
                      w.isScrap ? 'bg-rose-50/70 text-rose-950' : 'bg-slate-200/80 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 truncate px-1">
                      <span className="truncate">{w.nameAr}</span>
                      {w.isScrap && <span className="text-[10px] text-rose-600 font-bold">⚠️ (هالك)</span>}
                    </div>
                  </th>
                ))
              )}

              {/* MODE 2: GLOBAL USABLE TOTAL COLUMNS */}
              {selectedWarehouse === 'all' && (
                <>
                  <th colSpan={canViewTotals ? 3 : 2} className="p-2 text-center border-s-2 border-indigo-300 bg-indigo-100/70 text-indigo-950 font-black">
                    {isAr ? 'إجمالي الرصيد الصالح الموحد' : 'Global Combined Usable Stock'}
                  </th>
                  <th className="p-2.5 text-center min-w-[105px] border-s border-rose-200 bg-rose-100/60 text-rose-950 font-bold" rowSpan={2}>
                    {isAr ? 'قيمة الهالك المحول' : 'Scrap Inflow Value'}
                  </th>
                </>
              )}

              {canViewPrices && (
                <th className="p-2.5 text-center min-w-[85px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'سعر الوحدة' : 'Unit Cost'}</th>
              )}
              <th className="p-2.5 text-start min-w-[110px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'المسؤول' : 'Actor'}</th>
              <th className="p-2.5 text-start min-w-[140px]" rowSpan={selectedWarehouse === 'all' ? 2 : 1}>{isAr ? 'البيان' : 'Notes'}</th>
            </tr>

            {/* Sub-Header Row for Mode 2: Δ and Balance under each warehouse */}
            {selectedWarehouse === 'all' && (
              <tr className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200 font-bold">
                {activeWarehousesForColumns.map((w) => (
                  <React.Fragment key={w.key}>
                    <th className="p-1.5 text-center min-w-[65px] border-s border-slate-200 bg-slate-50 text-slate-700">
                      {isAr ? 'حركة' : 'Δ Move'}
                    </th>
                    <th className="p-1.5 text-center min-w-[75px] bg-slate-100/60 font-mono text-slate-900">
                      {isAr ? 'رصيد' : 'Balance'}
                    </th>
                  </React.Fragment>
                ))}

                {/* Sub-Header for Global Usable */}
                <th className="p-1.5 text-center min-w-[70px] border-s-2 border-indigo-200 bg-indigo-50 text-indigo-800">
                  {isAr ? 'صافي Δ' : 'Net Δ'}
                </th>
                <th className="p-1.5 text-center min-w-[85px] bg-indigo-50/80 font-mono text-indigo-950 font-black">
                  {isAr ? 'الرصيد' : 'Balance'}
                </th>
                {canViewTotals && (
                  <th className="p-1.5 text-center min-w-[95px] bg-indigo-100/60 font-mono text-indigo-900 font-black">
                    {isAr ? 'القيمة (ج.م)' : 'Valuation'}
                  </th>
                )}
              </tr>
            )}
          </thead>

          <tbody className="divide-y divide-slate-100 font-medium">
            {/* PINNED PRE-PERIOD OPENING BALANCE ROW (CARRY-FORWARD) */}
            {prePeriodCarryForward.shouldShowPinnedRow && (
              <tr className="bg-amber-50/60 border-b-2 border-amber-200 text-slate-800 font-bold">
                <td className="p-2 text-center text-amber-700 font-mono">0</td>
                <td className="p-2 text-start font-mono text-amber-900 font-bold">
                  {isAr ? 'ما قبل الفترة' : 'Pre-Period'}
                </td>
                <td className="p-2 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                    {isAr ? 'رصيد مرحل أول الفترة' : 'Carried Opening'}
                  </span>
                </td>
                <td className="p-2 text-center font-mono text-slate-400">—</td>
                <td className="p-2 text-start">
                  <div className="font-bold text-xs text-slate-900">{prePeriodCarryForward.itemLabel}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{prePeriodCarryForward.variantLabel}</div>
                </td>
                <td className="p-2 text-center font-mono text-xs text-purple-900">
                  {prePeriodCarryForward.lotLabel}
                </td>

                {/* Single Warehouse Mode Carry-Forward */}
                {selectedWarehouse !== 'all' ? (
                  <>
                    <td className="p-2 text-slate-400 italic text-[11px]">—</td>
                    <td className="p-2 text-center font-mono text-slate-400">—</td>
                    <td className="p-2 text-center font-mono text-slate-400">—</td>
                    <td className="p-2 text-center font-mono font-black text-indigo-900 bg-indigo-50/70 text-xs">
                      {(prePeriodCarryForward.balances[selectedWarehouse] || 0).toLocaleString()}
                    </td>
                  </>
                ) : (
                  /* All Warehouses Mode Carry-Forward */
                  <>
                    {activeWarehousesForColumns.map((w) => (
                      <React.Fragment key={w.key}>
                        <td className="p-2 text-center font-mono text-slate-400 border-s border-slate-200">—</td>
                        <td className="p-2 text-center font-mono font-bold text-slate-900 bg-slate-100/40">
                          {(prePeriodCarryForward.balances[w.key] || 0).toLocaleString()}
                        </td>
                      </React.Fragment>
                    ))}
                    <td className="p-2 text-center font-mono text-slate-400 border-s-2 border-indigo-200">—</td>
                    <td className="p-2 text-center font-mono font-black text-indigo-900 bg-indigo-50">
                      {prePeriodCarryForward.globalUsable.toLocaleString()}
                    </td>
                    {canViewTotals && (
                      <td className="p-2 text-center font-mono text-slate-400">—</td>
                    )}
                    <td className="p-2 text-center font-mono text-slate-400 border-s border-rose-200">—</td>
                  </>
                )}

                {canViewPrices && <td className="p-2 text-center font-mono text-slate-400">—</td>}
                <td className="p-2 text-slate-500 text-[10px]">{isAr ? 'ترحيل نظام' : 'System'}</td>
                <td className="p-2 text-slate-500 text-[10px] italic">
                  {isAr ? `الأرصدة المحسوبة حتى تاريخ ${startDate}` : `Calculated up to ${startDate}`}
                </td>
              </tr>
            )}

            {/* EMPTY STATE */}
            {filteredTransactions.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    selectedWarehouse === 'all'
                      ? 7 + activeWarehousesForColumns.length * 2 + (canViewTotals ? 3 : 2) + 1 + (canViewPrices ? 1 : 0) + 2
                      : 12 + (canViewPrices ? 1 : 0)
                  }
                  className="p-8 text-center text-slate-400 italic"
                >
                  <Boxes className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <span>{isAr ? 'لا توجد حركات مطابقة لمعايير البحث والتصفية المحددة.' : 'No transactions matching active filter criteria.'}</span>
                </td>
              </tr>
            ) : (
              /* TRANSACTION ROWS */
              filteredTransactions.map((tx, idx) => {
                return (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                    {/* Index */}
                    <td className="p-2 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>

                    {/* Date & Time */}
                    <td className="p-2 text-start whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-900 text-xs">{tx.date}</div>
                      <div className="font-mono text-[10px] text-slate-400">{tx.time}</div>
                    </td>

                    {/* Movement Type Badge */}
                    <td className="p-2 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tx.badgeClass}`}>
                        {tx.typeLabel}
                      </span>
                    </td>

                    {/* Reference Code (CLICKABLE DEEP DRILL-DOWN MODAL TRIGGER) */}
                    <td className="p-2 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedMovementDetail(tx)}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center gap-1 mx-auto cursor-pointer group shadow-2xs"
                        title={isAr ? 'انقر لعرض تفاصيل الحركة وأمر التشغيل/البالتات' : 'Click to view full details, work order pallets & docs'}
                      >
                        <span>{tx.refCode}</span>
                        <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                      </button>
                    </td>

                    {/* Material & Variant */}
                    <td className="p-2 text-start">
                      <div className="font-bold text-slate-900 text-xs truncate max-w-[180px]">
                        {tx.itemNameAr}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="font-mono text-[10px] font-bold bg-slate-100 px-1 rounded text-slate-700">
                          {tx.variantCode}
                        </span>
                        {tx.variantSpecs && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                            {tx.variantSpecs}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* LOT / Batch */}
                    <td className="p-2 text-center whitespace-nowrap">
                      {tx.lotNumber && tx.lotNumber !== '—' ? (
                        <span className="font-mono font-bold text-[11px] text-purple-900 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                          {tx.lotNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>

                    {/* =================================================== */}
                    {/* MODE 1: SINGLE WAREHOUSE DATA CELLS                 */}
                    {/* =================================================== */}
                    {selectedWarehouse !== 'all' ? (
                      <>
                        {/* Counterpart / Destination */}
                        <td className="p-2 text-start text-xs font-medium text-slate-700">
                          {tx.counterpartText}
                        </td>

                        {/* Inward (+) */}
                        <td className="p-2 text-center whitespace-nowrap bg-emerald-50/20">
                          {tx.singleWhIn > 0 ? (
                            <span className="font-mono font-black text-emerald-700 text-xs">
                              +{tx.singleWhIn.toLocaleString()} {tx.smallUnit}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">—</span>
                          )}
                        </td>

                        {/* Outward (-) */}
                        <td className="p-2 text-center whitespace-nowrap bg-rose-50/20">
                          {tx.singleWhOut > 0 ? (
                            <span className="font-mono font-black text-rose-700 text-xs">
                              -{tx.singleWhOut.toLocaleString()} {tx.smallUnit}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono">—</span>
                          )}
                        </td>

                        {/* Progressive Warehouse Balance */}
                        <td className="p-2 text-center whitespace-nowrap bg-indigo-50/40">
                          <span className="font-mono font-black text-indigo-950 text-xs">
                            {tx.singleWhProgressive.toLocaleString()} {tx.smallUnit}
                          </span>
                        </td>
                      </>
                    ) : (
                      /* =================================================== */
                      /* MODE 2: MULTI-WAREHOUSE 2-COLUMN CELLS              */
                      /* =================================================== */
                      <>
                        {activeWarehousesForColumns.map((w) => {
                          const delta = tx.perWarehouseDelta[w.key];
                          const runningBal = tx.progressiveWhBalances[w.key] || 0;

                          return (
                            <React.Fragment key={w.key}>
                              {/* Col 1: Δ Movement for this WH */}
                              <td className="p-2 text-center border-s border-slate-200 whitespace-nowrap font-mono text-xs">
                                {delta !== undefined ? (
                                  delta > 0 ? (
                                    <span className="font-black text-emerald-600">+{delta.toLocaleString()}</span>
                                  ) : delta < 0 ? (
                                    <span className="font-black text-rose-600">-{Math.abs(delta).toLocaleString()}</span>
                                  ) : (
                                    <span className="text-slate-300">0</span>
                                  )
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>

                              {/* Col 2: Progressive Balance for this WH */}
                              <td
                                className={`p-2 text-center whitespace-nowrap font-mono font-bold text-xs ${
                                  runningBal < 0 ? 'text-rose-700 bg-rose-50/40' : 'text-slate-800 bg-slate-50/50'
                                }`}
                              >
                                {runningBal.toLocaleString()}
                              </td>
                            </React.Fragment>
                          );
                        })}

                        {/* Net Usable Δ */}
                        <td className="p-2 text-center border-s-2 border-indigo-200 whitespace-nowrap font-mono text-xs bg-indigo-50/30">
                          {tx.netUsableDelta > 0 ? (
                            <span className="font-black text-emerald-700">+{tx.netUsableDelta.toLocaleString()}</span>
                          ) : tx.netUsableDelta < 0 ? (
                            <span className="font-black text-rose-700">-{Math.abs(tx.netUsableDelta).toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-400 font-bold">0</span>
                          )}
                        </td>

                        {/* Combined Usable Balance */}
                        <td className="p-2 text-center whitespace-nowrap font-mono font-black text-indigo-950 text-xs bg-indigo-50/60">
                          {tx.progressiveGlobalUsable.toLocaleString()} {tx.smallUnit}
                        </td>

                        {/* Usable Valuation */}
                        {canViewTotals && (
                          <td className="p-2 text-center whitespace-nowrap font-mono text-xs font-bold text-slate-800 bg-indigo-100/30">
                            {tx.progressiveUsableValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                        )}

                        {/* Scrap Inflow Value Highlight */}
                        <td className="p-2 text-center border-s border-rose-200 whitespace-nowrap font-mono text-xs">
                          {tx.isScrapMovement ? (
                            <span className="px-2 py-0.5 rounded font-black text-rose-700 bg-rose-100/80 border border-rose-300 animate-pulse">
                              +{tx.rawQty} ({tx.scrapValue.toLocaleString()} EGP)
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </>
                    )}

                    {/* Unit Cost */}
                    {canViewPrices && (
                      <td className="p-2 text-center whitespace-nowrap font-mono text-xs text-slate-700">
                        {tx.unitPrice ? `${tx.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </td>
                    )}

                    {/* Actor */}
                    <td className="p-2 text-start whitespace-nowrap text-xs text-slate-700">
                      <div className="font-bold">{tx.actor}</div>
                      {tx.verifier && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span>{tx.verifier}</span>
                        </div>
                      )}
                    </td>

                    {/* Notes */}
                    <td className="p-2 text-start text-xs text-slate-500 max-w-[200px] truncate" title={tx.notes}>
                      {tx.notes || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===================================================================== */}
      {/* D. INTERACTIVE DEEP DRILL-DOWN POPUP MODAL (VIA CREATEPORTAL)         */}
      {/* ===================================================================== */}
      {selectedMovementDetail && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div
            dir={isAr ? 'rtl' : 'ltr'}
            style={{ fontFamily: "'Cairo', sans-serif" }}
            className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] shadow-2xl flex flex-col border border-slate-200 overflow-hidden text-slate-800"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl border border-indigo-200 shadow-2xs">
                  <History className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-slate-900">
                      {isAr ? 'تفاصيل وحيثيات حركة المخزون:' : 'Stock Movement Traceability Dossier:'}
                    </span>
                    <span className="font-mono font-black text-sm bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg shadow-2xs">
                      #{selectedMovementDetail.refCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 font-medium">
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${selectedMovementDetail.badgeClass}`}>
                      {selectedMovementDetail.typeLabel}
                    </span>
                    <span>•</span>
                    <span className="font-mono">{selectedMovementDetail.date} {selectedMovementDetail.time}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMovementDetail(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* 1. VISUAL FLOW / GENEALOGY BREADCRUMB */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-2">
                  {isAr ? 'مسار وتدفق حركة المادة (Movement Genealogy Path):' : 'Material Flow Path:'}
                </span>

                <div className="flex items-center justify-between gap-2 overflow-x-auto text-xs font-bold">
                  {/* Step 1: Origin */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs text-center min-w-[120px]">
                    <span className="text-[10px] text-slate-400 block font-normal">{isAr ? 'المصدر / الطرف المنشئ' : 'Origin'}</span>
                    <span className="text-slate-900 block truncate font-bold">{selectedMovementDetail.sourceName}</span>
                  </div>

                  <ArrowLeftRight className="h-4 w-4 text-indigo-400 shrink-0" />

                  {/* Step 2: Document / Ref */}
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl shadow-2xs text-center min-w-[140px]">
                    <span className="text-[10px] text-indigo-500 block font-normal">{selectedMovementDetail.typeLabel}</span>
                    <span className="text-indigo-950 font-mono font-black block truncate">{selectedMovementDetail.refCode}</span>
                  </div>

                  <ArrowLeftRight className="h-4 w-4 text-indigo-400 shrink-0" />

                  {/* Step 3: Destination */}
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs text-center min-w-[120px]">
                    <span className="text-[10px] text-slate-400 block font-normal">{isAr ? 'المستقر / المستودع المستهدف' : 'Destination'}</span>
                    <span className="text-slate-900 block truncate font-bold">{selectedMovementDetail.targetName}</span>
                  </div>
                </div>
              </div>

              {/* 2. ITEM & BATCH ATTRIBUTES */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">{isAr ? 'كود واسم الخامة:' : 'Item Master:'}</span>
                  <span className="text-xs font-bold text-slate-900 block">{selectedMovementDetail.itemNameAr}</span>
                  <span className="font-mono text-[10px] text-slate-500">[{selectedMovementDetail.itemId}]</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">{isAr ? 'التنوع المعتمد:' : 'Variant Code:'}</span>
                  <span className="font-mono text-xs font-bold text-indigo-700 block">{selectedMovementDetail.variantCode}</span>
                  <span className="text-[10px] text-slate-500">{selectedMovementDetail.variantSpecs || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">{isAr ? 'رقم اللوط (LOT):' : 'Batch / Lot #:'}</span>
                  <span className="font-mono text-xs font-black text-purple-900 block">{selectedMovementDetail.lotNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">{isAr ? 'الكمية المنقولة:' : 'Quantity Moved:'}</span>
                  <span className="font-mono text-xs font-black text-slate-900 block">
                    {selectedMovementDetail.rawQty.toLocaleString()} {selectedMovementDetail.smallUnit}
                  </span>
                  {canViewPrices && (
                    <span className="text-[10px] font-mono text-emerald-700 block">
                      @{selectedMovementDetail.unitPrice} EGP
                    </span>
                  )}
                </div>
              </div>

              {/* 3. DYNAMIC WORK ORDER DEEP DETAILS & PRODUCED PALLETS (IF WO) */}
              {selectedMovementDetail.type === 'WO' && (
                <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Factory className="h-5 w-5 text-amber-700" />
                      <h4 className="text-xs font-black text-amber-950">
                        {isAr ? 'بيانات أمر التشغيل والإنتاج المرتبط (Work Order Dossier):' : 'Linked Work Order Dossier:'}
                      </h4>
                    </div>
                    {linkedWorkOrderObj?.status && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900">
                        {linkedWorkOrderObj.status}
                      </span>
                    )}
                  </div>

                  {linkedWorkOrderObj ? (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-amber-200">
                        <div>
                          <span className="text-[10px] text-slate-400 block">{isAr ? 'المنتج التام المستهدف:' : 'Target Product:'}</span>
                          <span className="font-bold text-slate-900 text-xs block">{linkedWorkOrderObj.productNameAr || linkedWorkOrderObj.productName || '—'}</span>
                          <span className="font-mono text-[10px] text-slate-500">[{linkedWorkOrderObj.targetProductCode || linkedWorkOrderObj.productCode}]</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">{isAr ? 'خط وصالة الإنتاج:' : 'Line / Hall:'}</span>
                          <span className="font-bold text-slate-800 text-xs block">{linkedWorkOrderObj.lineName || linkedWorkOrderObj.productionLine || 'الخط الرئيسي'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">{isAr ? 'مسؤول / مهندس الوردية:' : 'Supervisor:'}</span>
                          <span className="font-bold text-slate-800 text-xs block">{linkedWorkOrderObj.createdBy || linkedWorkOrderObj.manager || selectedMovementDetail.actor}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">{isAr ? 'تاريخ الإنتاج:' : 'Production Date:'}</span>
                          <span className="font-mono font-bold text-slate-800 text-xs block">{linkedWorkOrderObj.orderDate || linkedWorkOrderObj.date || selectedMovementDetail.date}</span>
                        </div>
                      </div>

                      {/* Pallets Produced Section */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-extrabold text-amber-950 flex items-center gap-1">
                            <Boxes className="h-3.5 w-3.5 text-amber-700" />
                            <span>{isAr ? 'البالتات المنتجة في هذا الأمر (Pallets Produced):' : 'Pallets Produced:'}</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-amber-800">
                            {(linkedWorkOrderObj.pallets || []).length} {isAr ? 'بالتة' : 'pallets'}
                          </span>
                        </div>

                        {(linkedWorkOrderObj.pallets || []).length === 0 ? (
                          <div className="p-3 bg-white rounded-xl border border-amber-200 text-center text-slate-400 italic text-[11px]">
                            {isAr ? 'لم يتم تسجيل أي بالتات إنتاج لهذا الأمر بعد.' : 'No pallets recorded yet for this order.'}
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto border border-amber-200 rounded-xl bg-white divide-y divide-amber-100">
                            {(linkedWorkOrderObj.pallets || []).map((pallet, pIdx) => (
                              <div key={pallet.palletId || pallet.id || pIdx} className="p-2 flex items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="p-1 bg-amber-50 text-amber-800 rounded font-mono font-black text-[10px] border border-amber-200">
                                    #{pallet.palletNumber || pallet.palletId || `PLT-${pIdx + 1}`}
                                  </span>
                                  <div>
                                    <span className="font-bold text-slate-800 text-xs block">
                                      {pallet.batchCode ? `تشغيلة: ${pallet.batchCode}` : `بالتة #${pallet.palletNumber || pIdx + 1}`}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {pallet.timestamp ? new Date(pallet.timestamp).toLocaleString('en-GB') : pallet.createdAt || ''}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-end">
                                  <span className="font-mono font-black text-amber-900 text-xs block">
                                    {pallet.qtyLarge || pallet.qtyCartons || 0} {isAr ? 'كرتونة' : 'Cartons'}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    ({pallet.qtySmall || 0} {isAr ? 'عبوة' : 'Units'})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-amber-200 text-center text-slate-500 text-xs">
                      {isAr
                        ? `حركة استهلاك مسجلة عبر تحويلات الصالة لأمر التشغيل (${selectedMovementDetail.refCode}).`
                        : `Consumption logged for Work Order #${selectedMovementDetail.refCode}.`}
                    </div>
                  )}
                </div>
              )}

              {/* 3B. TANK PREPARATION DOSSIER (IF PRD-INT) */}
              {selectedMovementDetail.type === 'PRD-INT' && (
                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-5 w-5 text-blue-700" />
                      <h4 className="text-xs font-black text-blue-950">
                        {isAr ? 'بيانات تشغيلة تحضير التانك الوسيط (Tank Prep Dossier):' : 'Intermediate Tank Prep Dossier:'}
                      </h4>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-900 border border-blue-200">
                      {selectedMovementDetail.refCode}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-blue-100 space-y-2 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'الخامة / الصنف:' : 'Item:'}</span>
                        <span className="font-bold text-slate-900 block">{selectedMovementDetail.itemNameAr}</span>
                        <span className="font-mono text-[10px] text-slate-500">[{selectedMovementDetail.itemId}]</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'رقم التشغيلة / التانك:' : 'Tank Lot #:'}</span>
                        <span className="font-mono font-bold text-blue-900 block">{selectedMovementDetail.lotNumber}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">{isAr ? 'المسؤول / المشرف:' : 'Operator:'}</span>
                        <span className="font-bold text-slate-800 block">{selectedMovementDetail.actor}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. GOODS RECEIPT DEEP DETAILS (IF GRN) */}
              {selectedMovementDetail.type === 'GRN' && (
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-950 font-black text-xs">
                    <Building2 className="h-4 w-4 text-emerald-700" />
                    <span>{isAr ? 'بيانات إذن الاستلام والفحص والتوريد (GRN Dossier):' : 'Goods Receipt Dossier:'}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-emerald-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'المورد المعتمد:' : 'Supplier:'}</span>
                      <span className="font-bold text-slate-900 block">{selectedMovementDetail.sourceName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'أمين المخزن المستلم:' : 'Receiver:'}</span>
                      <span className="font-bold text-slate-800 block">{selectedMovementDetail.actor}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'مستودع الاستلام المستهدف:' : 'Target WH:'}</span>
                      <span className="font-bold text-emerald-800 block">{selectedMovementDetail.targetName}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. INTERNAL TRANSFER DEEP DETAILS (IF TRN) */}
              {(selectedMovementDetail.type === 'TRN' || selectedMovementDetail.type === 'PIPE') && (
                <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-indigo-950 font-black text-xs">
                    <ArrowLeftRight className="h-4 w-4 text-indigo-700" />
                    <span>{isAr ? 'حيثيات التحويل المخزني الداخلي:' : 'Internal Transfer Dossier:'}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-indigo-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'من مستودع:' : 'From WH:'}</span>
                      <span className="font-bold text-slate-900 block">{selectedMovementDetail.sourceName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'إلى مستودع:' : 'To WH:'}</span>
                      <span className="font-bold text-indigo-800 block">{selectedMovementDetail.targetName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'مسؤول الصرف:' : 'Dispatcher:'}</span>
                      <span className="font-bold text-slate-800 block">{selectedMovementDetail.actor}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'معتمد الاستلام:' : 'Receiver:'}</span>
                      <span className="font-bold text-slate-800 block">{selectedMovementDetail.verifier || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. AUDIT NOTES */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">{isAr ? 'الملاحظات والبيان الإداري:' : 'Notes & Remarks:'}</span>
                <p className="text-slate-700 font-medium">{selectedMovementDetail.notes || (isAr ? 'لا توجد ملاحظات إضافية مسجلة.' : 'No additional notes.')}</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400">
                DocID: {selectedMovementDetail.id}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMovementDetail(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
