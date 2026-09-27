import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import {
  Package,
  Layers,
  Sparkles,
  Sliders,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Warehouse,
  Boxes,
  DollarSign,
  TrendingUp,
  Tag,
  Zap
} from 'lucide-react';
import PeacockLoader from './PeacockLoader';
import VariantIdentifierChip from './VariantIdentifierChip';

export default function OpeningStockSeederModal({
  isOpen,
  onClose,
  currentUser = {},
  warehousesList = []
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [activeMode, setActiveMode] = useState('fast_auto'); // 'fast_auto' | 'manual_matrix'
  const [itemsList, setItemsList] = useState([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // --- Fast-Auto State ---
  const [targetWhAuto, setTargetWhAuto] = useState('');
  const [autoQtyMode, setAutoQtyMode] = useState('fixed'); // 'fixed' | 'random'
  const [fixedQty, setFixedQty] = useState(5000);
  const [randomMinQty, setRandomMinQty] = useState(2000);
  const [randomMaxQty, setRandomMaxQty] = useState(8000);
  const [autoPriceMode, setAutoPriceMode] = useState('fixed'); // 'fixed' | 'keep_existing'
  const [fixedPrice, setFixedPrice] = useState(5.0);
  const [flagFilterAuto, setFlagFilterAuto] = useState('all'); // 'all' | 'R' | 'F' | 'M'

  // --- Manual Matrix State ---
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixRows, setMatrixRows] = useState([]);
  const [globalFillQty, setGlobalFillQty] = useState('');
  const [globalFillReorder, setGlobalFillReorder] = useState('');
  const [globalFillPrice, setGlobalFillPrice] = useState('');
  const [globalFillWh, setGlobalFillWh] = useState('');

  // Default target warehouse
  const defaultWarehouseId = useMemo(() => {
    if (warehousesList.length === 0) return 'WH-01';
    const rawWh = warehousesList.find((w) => (w.code || '').toLowerCase().includes('raw') || (w.code || '') === 'WH-01');
    return rawWh?.code || warehousesList[0].code || warehousesList[0].id || 'WH-01';
  }, [warehousesList]);

  // Load active materials on open
  useEffect(() => {
    if (!isOpen) return;

    setTargetWhAuto(defaultWarehouseId);
    setGlobalFillWh(defaultWarehouseId);

    const loadItems = async () => {
      setIsLoadingItems(true);
      setErrorMsg('');
      try {
        const snap = await getDocs(collection(db, 'items'));
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.id }));
        list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
        setItemsList(list);

        // Flatten variations for manual matrix
        const flattened = [];
        list.forEach((item) => {
          if (item.isStocklessUtility) return;

          const variations = Array.isArray(item.variations) && item.variations.length > 0
            ? item.variations
            : [{
                suffix: 'A',
                variantCode: `${item.code}-A`,
                smallUnit: item.smallUnit || 'قطعة',
                largeUnitName: item.largeUnitName || 'كرتونة',
                packagingRatio: item.packagingRatio || 1,
                openingWarehouse: defaultWarehouseId,
                openingQtySmall: 0,
                openingUnitCost: 5.0,
              }];

          const itemReorder = Number(item.reorderLevel !== undefined ? item.reorderLevel : (item.minStockLevel || 0));

          variations.forEach((v) => {
            const vSuffix = v.suffix || 'A';
            const vCode = v.variantCode || `${item.code}-${vSuffix}`;
            flattened.push({
              itemCode: item.code,
              nameAr: item.nameAr || item.code,
              nameEn: item.nameEn || '',
              flags: item.flags || '',
              suffix: vSuffix,
              variantCode: vCode,
              smallUnit: v.smallUnit || item.smallUnit || 'قطعة',
              largeUnitName: v.largeUnitName || item.largeUnitName || 'كرتونة',
              packagingRatio: Number(v.packagingRatio || item.packagingRatio || 1),
              warehouse: v.openingWarehouse || defaultWarehouseId,
              qty: Number(v.openingQtySmall || 0),
              unitCost: Number(v.openingUnitCost || 5.0),
              reorderLevel: Number(v.reorderLevel !== undefined ? v.reorderLevel : itemReorder),
              lotNumber: `OB-${item.code}-${vSuffix}-01`,
              variantObj: v,
            });
          });
        });

        setMatrixRows(flattened);
      } catch (err) {
        console.error('Error loading items for stock seeder:', err);
        setErrorMsg(isAr ? 'حدث خطأ أثناء تحميل سجل الخامات.' : 'Error loading materials master.');
      } finally {
        setIsLoadingItems(false);
      }
    };

    loadItems();
  }, [isOpen, defaultWarehouseId, isAr]);

  // Compute Fast-Auto impacted variants count
  const fastAutoCandidateCount = useMemo(() => {
    let count = 0;
    itemsList.forEach((item) => {
      if (item.isStocklessUtility) return;
      const flagsStr = String(item.flags || '').toUpperCase();
      if (flagFilterAuto !== 'all' && !flagsStr.includes(flagFilterAuto)) return;
      const varCount = Array.isArray(item.variations) && item.variations.length > 0 ? item.variations.length : 1;
      count += varCount;
    });
    return count;
  }, [itemsList, flagFilterAuto]);

  // Handle Fast-Auto Execution
  const handleExecuteFastAuto = async () => {
    if (!targetWhAuto) {
      alert(isAr ? 'يرجى اختيار المستودع المستهدف أولاً.' : 'Please select target warehouse first.');
      return;
    }

    setIsCommitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let updatedItemsCount = 0;
      let totalSeededUnits = 0;
      let totalValuation = 0;

      // Group variants to commit in batches
      const batchList = [];
      let currentBatch = writeBatch(db);
      let opCount = 0;

      const pushOp = (operation) => {
        operation(currentBatch);
        opCount++;
        if (opCount >= 450) {
          batchList.push(currentBatch);
          currentBatch = writeBatch(db);
          opCount = 0;
        }
      };

      itemsList.forEach((item) => {
        if (item.isStocklessUtility) return;
        const flagsStr = String(item.flags || '').toUpperCase();
        if (flagFilterAuto !== 'all' && !flagsStr.includes(flagFilterAuto)) return;

        const variations = Array.isArray(item.variations) && item.variations.length > 0
          ? [...item.variations]
          : [{
              suffix: 'A',
              variantCode: `${item.code}-A`,
              smallUnit: item.smallUnit || 'قطعة',
              largeUnitName: item.largeUnitName || 'كرتونة',
              packagingRatio: item.packagingRatio || 1,
              openingWarehouse: targetWhAuto,
              openingQtySmall: 0,
              openingUnitCost: fixedPrice,
            }];

        let itemTotalStock = 0;
        const updatedVariations = variations.map((v) => {
          let assignedQty = fixedQty;
          if (autoQtyMode === 'random') {
            const min = Math.min(randomMinQty, randomMaxQty);
            const max = Math.max(randomMinQty, randomMaxQty);
            assignedQty = Math.floor(Math.random() * (max - min + 1)) + min;
          }

          let assignedPrice = fixedPrice;
          if (autoPriceMode === 'keep_existing' && Number(v.openingUnitCost) > 0) {
            assignedPrice = Number(v.openingUnitCost);
          }

          const vSuffix = v.suffix || 'A';
          const vCode = v.variantCode || `${item.code}-${vSuffix}`;
          const lotNo = `OB-${item.code}-${vSuffix}-01`;

          itemTotalStock += assignedQty;
          totalSeededUnits += assignedQty;
          totalValuation += assignedQty * assignedPrice;

          // Record in Central Stock Ledger (SSOT for balance & Kardex)
          const ledgerRef = doc(collection(db, 'stock_ledger'));
          pushOp((b) => {
            b.set(ledgerRef, {
              action: 'opening_balance',
              docType: 'opening_balance',
              lotNumber: lotNo,
              itemId: item.code,
              variantCode: vCode,
              materialNameAr: item.nameAr,
              materialNameEn: item.nameEn || '',
              qty: assignedQty,
              unit: v.smallUnit || item.smallUnit || 'قطعة',
              warehouse: targetWhAuto,
              unitPrice: assignedPrice,
              totalValue: assignedQty * assignedPrice,
              currency: 'EGP',
              batchNo: 'OB-AUTO-LOT',
              supplierId: v.supplierId || 'INITIAL_BALANCE',
              supplierName: isAr ? 'رصيد افتتاحي أولي' : 'Initial Balance',
              receiptDate: todayStr,
              receivedBy: isAr ? currentUser.nameAr : currentUser.name || 'System Admin',
              timestamp: serverTimestamp(),
            });
          });

          return {
            ...v,
            stock: assignedQty,
            openingQtySmall: assignedQty,
            openingWarehouse: targetWhAuto,
            openingUnitCost: assignedPrice,
            openingBatchNo: 'OB-AUTO-LOT',
          };
        });

        // Update Item Document
        const itemRef = doc(db, 'items', item.code);
        pushOp((b) => {
          b.update(itemRef, {
            stock: itemTotalStock,
            variations: updatedVariations,
            updatedAt: serverTimestamp(),
          });
        });

        updatedItemsCount++;
      });

      if (opCount > 0) {
        batchList.push(currentBatch);
      }

      // Commit all batches sequentially
      for (const b of batchList) {
        await b.commit();
      }

      setSuccessMsg(
        isAr
          ? `✅ تم بنجاح ضخ وتوليد الأرصدة الافتتاحية لعدد (${updatedItemsCount}) صنف بمستودع (${targetWhAuto}) بإجمالي (${totalSeededUnits.toLocaleString()} وحدة) وتقييم مخزني (${totalValuation.toLocaleString()} ج.م).`
          : `✅ Successfully seeded opening stock for ${updatedItemsCount} materials in (${targetWhAuto}). Total: ${totalSeededUnits.toLocaleString()} units (${totalValuation.toLocaleString()} EGP).`
      );
    } catch (err) {
      console.error('Error seeding opening stock in fast-auto:', err);
      setErrorMsg(isAr ? 'حدث خطأ أثناء حفظ الأرصدة.' : 'Error writing opening balances.');
    } finally {
      setIsCommitting(false);
    }
  };

  // Handle Manual Matrix Row Edit (Key-based to prevent edit bugs when filtered)
  const handleMatrixCellChange = (itemCode, suffix, field, value) => {
    setMatrixRows((prev) =>
      prev.map((row) => {
        if (field === 'reorderLevel' && row.itemCode === itemCode) {
          return { ...row, reorderLevel: value };
        }
        if (row.itemCode === itemCode && row.suffix === suffix) {
          return { ...row, [field]: value };
        }
        return row;
      })
    );
  };

  // Batch Fill Helpers (Applies to all or visible/filtered rows)
  const handleApplyGlobalQty = () => {
    const q = Number(globalFillQty);
    if (isNaN(q) || q < 0) return;
    const targetKeys = new Set(filteredMatrixRows.map((r) => `${r.itemCode}_${r.suffix}`));
    setMatrixRows((prev) =>
      prev.map((r) => (targetKeys.has(`${r.itemCode}_${r.suffix}`) ? { ...r, qty: q } : r))
    );
  };

  const handleApplyGlobalReorder = () => {
    const r = Number(globalFillReorder);
    if (isNaN(r) || r < 0) return;
    const targetItemCodes = new Set(filteredMatrixRows.map((row) => row.itemCode));
    setMatrixRows((prev) =>
      prev.map((row) => (targetItemCodes.has(row.itemCode) ? { ...row, reorderLevel: r } : row))
    );
  };

  const handleApplyGlobalPrice = () => {
    const p = Number(globalFillPrice);
    if (isNaN(p) || p < 0) return;
    const targetKeys = new Set(filteredMatrixRows.map((r) => `${r.itemCode}_${r.suffix}`));
    setMatrixRows((prev) =>
      prev.map((r) => (targetKeys.has(`${r.itemCode}_${r.suffix}`) ? { ...r, unitCost: p } : r))
    );
  };

  const handleApplyGlobalWh = () => {
    if (!globalFillWh) return;
    const targetKeys = new Set(filteredMatrixRows.map((r) => `${r.itemCode}_${r.suffix}`));
    setMatrixRows((prev) =>
      prev.map((r) => (targetKeys.has(`${r.itemCode}_${r.suffix}`) ? { ...r, warehouse: globalFillWh } : r))
    );
  };

  // Handle Manual Matrix Commit
  const handleCommitManualMatrix = async () => {
    setIsCommitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const batchList = [];
      let currentBatch = writeBatch(db);
      let opCount = 0;

      const pushOp = (operation) => {
        operation(currentBatch);
        opCount++;
        if (opCount >= 450) {
          batchList.push(currentBatch);
          currentBatch = writeBatch(db);
          opCount = 0;
        }
      };

      // Group matrix rows by itemCode
      const groupedByItem = {};
      matrixRows.forEach((r) => {
        if (!groupedByItem[r.itemCode]) groupedByItem[r.itemCode] = [];
        groupedByItem[r.itemCode].push(r);
      });

      let updatedCount = 0;
      let totalUnits = 0;
      let totalValuation = 0;

      Object.entries(groupedByItem).forEach(([itemCode, rows]) => {
        const originalItem = itemsList.find((it) => it.code === itemCode);
        if (!originalItem) return;

        let itemTotalStock = 0;
        const itemReorderLevel = Number(rows[0]?.reorderLevel) || 0;

        const updatedVariations = rows.map((r) => {
          const qty = Number(r.qty) || 0;
          const price = Number(r.unitCost) || 0;
          const wh = r.warehouse || defaultWarehouseId;
          const lotNo = r.lotNumber || `OB-${itemCode}-${r.suffix}-01`;
          const vReorder = Number(r.reorderLevel) || 0;

          itemTotalStock += qty;
          totalUnits += qty;
          totalValuation += qty * price;

          // Record in Central Stock Ledger if stock > 0
          if (qty > 0) {
            const ledgerRef = doc(collection(db, 'stock_ledger'));
            pushOp((b) => {
              b.set(ledgerRef, {
                action: 'opening_balance',
                docType: 'opening_balance',
                lotNumber: lotNo,
                itemId: itemCode,
                variantCode: r.variantCode,
                materialNameAr: r.nameAr,
                materialNameEn: r.nameEn || '',
                qty: qty,
                unit: r.smallUnit,
                warehouse: wh,
                unitPrice: price,
                totalValue: qty * price,
                currency: 'EGP',
                batchNo: 'OB-MATRIX-LOT',
                supplierId: 'INITIAL_BALANCE',
                supplierName: isAr ? 'رصيد افتتاحي أولي' : 'Initial Balance',
                receiptDate: todayStr,
                receivedBy: isAr ? currentUser.nameAr : currentUser.name || 'System Admin',
                timestamp: serverTimestamp(),
              });
            });
          }

          // Match back to existing variation structure
          const existingVar = (originalItem.variations || []).find((v) => (v.suffix || 'A') === r.suffix) || {};
          return {
            ...existingVar,
            suffix: r.suffix,
            variantCode: r.variantCode,
            stock: qty,
            reorderLevel: vReorder,
            openingQtySmall: qty,
            openingWarehouse: wh,
            openingUnitCost: price,
            openingBatchNo: 'OB-MATRIX-LOT',
          };
        });

        // Update Item Master
        const itemRef = doc(db, 'items', itemCode);
        pushOp((b) => {
          b.update(itemRef, {
            stock: itemTotalStock,
            reorderLevel: itemReorderLevel,
            minStockLevel: itemReorderLevel,
            variations: updatedVariations,
            updatedAt: serverTimestamp(),
          });
        });

        updatedCount++;
      });

      if (opCount > 0) {
        batchList.push(currentBatch);
      }

      for (const b of batchList) {
        await b.commit();
      }

      setSuccessMsg(
        isAr
          ? `✅ تم بنجاح حفظ وتطبيق مصفوفة الأرصدة الافتتاحية لعدد (${updatedCount}) صنف بإجمالي (${totalUnits.toLocaleString()} وحدة) وتقييم (${totalValuation.toLocaleString()} ج.م).`
          : `✅ Successfully saved stock matrix for ${updatedCount} materials. Total: ${totalUnits.toLocaleString()} units (${totalValuation.toLocaleString()} EGP).`
      );
    } catch (err) {
      console.error('Error committing manual stock matrix:', err);
      setErrorMsg(isAr ? 'حدث خطأ أثناء حفظ مصفوفة الأرصدة.' : 'Error saving stock matrix.');
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  // Filtered rows for manual matrix
  const filteredMatrixRows = matrixRows.filter((r) => {
    if (!matrixSearch.trim()) return true;
    const q = matrixSearch.toLowerCase();
    return (
      (r.itemCode || '').toLowerCase().includes(q) ||
      (r.variantCode || '').toLowerCase().includes(q) ||
      (r.nameAr || '').toLowerCase().includes(q) ||
      (r.nameEn || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100/70 text-emerald-800 border border-emerald-300 rounded-2xl shadow-2xs">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>{isAr ? 'أداة ضخ وتوليد الأرصدة الافتتاحية للمخزون' : 'Opening Balances & Stock Seeder Tool'}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  {isAr ? 'تسوية المخزون (SSOT)' : 'FIFO Stock Seeder'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? 'ضخ وتوليد أرصدة أول المدة وتعيين الأسعار واللوطات مباشرة في كارت الصنف وسجل الحركات (Stock Ledger)'
                  : 'Inject opening stock, lot numbers, and costs directly into Item Master & Central Stock Ledger'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher Pills */}
            <div className="flex items-center p-1 bg-slate-200/80 rounded-xl text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => { setActiveMode('fast_auto'); setSuccessMsg(''); setErrorMsg(''); }}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  activeMode === 'fast_auto' ? 'bg-white text-emerald-800 shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span>{isAr ? 'التوليد التلقائي (Fast-Auto)' : 'Fast-Auto Seeder'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveMode('manual_matrix'); setSuccessMsg(''); setErrorMsg(''); }}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  activeMode === 'manual_matrix' ? 'bg-white text-indigo-800 shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                <Sliders className="h-3.5 w-3.5 text-indigo-600" />
                <span>{isAr ? 'مصفوفة الإدخال اليدوي (Manual Matrix)' : 'Manual Matrix'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-300 text-rose-950 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoadingItems ? (
            <div className="py-16">
              <PeacockLoader size="lg" text={isAr ? 'جاري تحميل سجل الخامات والمستودعات...' : 'Loading materials master...'} />
            </div>
          ) : activeMode === 'fast_auto' ? (
            /* ========================================================= */
            /* 🚀 MODE 1: FAST-AUTO SEEDER                               */
            /* ========================================================= */
            <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in duration-200">
              {/* Guidance Info Banner */}
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1.5 text-xs text-amber-950">
                <div className="font-extrabold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span>{isAr ? 'كيف يعمل التوليد التلقائي للأرصدة الافتتاحية؟' : 'How does Fast-Auto Stock Seeder work?'}</span>
                </div>
                <p className="leading-relaxed text-amber-900">
                  {isAr
                    ? 'يقوم المحرك بفحص أصناف الخامات المعتمدة، ثم يضخ أرصدة افتتاحية موثقة في المستودع المختار ويصدر أرقام تشغيلات (OB-LOT) مع تدوين القيد المالي الدفتري في سجل الحركات (Stock Ledger) بدون أي مساس بأذون استلام الموردين.'
                    : 'The engine scans item master records, seeds opening balances in the chosen warehouse, assigns lot numbers (OB-LOT), and posts Kardex entries to the Central Stock Ledger without touching vendor receipts.'}
                </p>
              </div>

              {/* Configuration Grid */}
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4">
                {/* 1. Target Warehouse Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    {isAr ? '١- المستودع المستلم للرصيد الافتتاحي:' : '1. Target Receiving Warehouse:'}
                  </label>
                  <select
                    value={targetWhAuto}
                    onChange={(e) => setTargetWhAuto(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {warehousesList.map((w) => (
                      <option key={w.id} value={w.code || w.id}>
                        {w.code} — {isAr ? w.nameAr : (w.nameEn || w.nameAr)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Material Scope Filter */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    {isAr ? '٢- نطاق الخامات ومستلزمات الإنتاج المستهدفة:' : '2. Target Material Scope:'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'all', labelAr: 'كافة الخامات', labelEn: 'All Materials' },
                      { id: 'R', labelAr: 'خامات التحضير (R)', labelEn: 'Raw Liquids (R)' },
                      { id: 'F', labelAr: 'مواد التعبئة (F)', labelEn: 'Packaging (F)' },
                      { id: 'M', labelAr: 'الخامات المصنعة (M)', labelEn: 'Intermediate (M)' },
                    ].map((scope) => (
                      <button
                        key={scope.id}
                        type="button"
                        onClick={() => setFlagFilterAuto(scope.id)}
                        className={`p-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                          flagFilterAuto === scope.id
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {isAr ? scope.labelAr : scope.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Quantity Strategy */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    {isAr ? '٣- استراتيجية تحديد الكميات الافتتاحية:' : '3. Opening Quantity Strategy:'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={() => setAutoQtyMode('fixed')}
                      className={`p-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                        autoQtyMode === 'fixed'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {isAr ? 'كمية موحدة لكافة الأصناف' : 'Uniform Fixed Qty'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoQtyMode('random')}
                      className={`p-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                        autoQtyMode === 'random'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {isAr ? 'كميات عشوائية واقعية (Min / Max)' : 'Realistic Random Range'}
                    </button>
                  </div>

                  {autoQtyMode === 'fixed' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={fixedQty}
                        onChange={(e) => setFixedQty(Math.max(1, Number(e.target.value)))}
                        className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500 font-semibold shrink-0">
                        {isAr ? 'وحدة صغرى لكل صنف' : 'units per item'}
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block mb-1">{isAr ? 'الحد الأدنى (Min):' : 'Min:'}</span>
                        <input
                          type="number"
                          min="1"
                          value={randomMinQty}
                          onChange={(e) => setRandomMinQty(Number(e.target.value))}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block mb-1">{isAr ? 'الحد الأقصى (Max):' : 'Max:'}</span>
                        <input
                          type="number"
                          min="1"
                          value={randomMaxQty}
                          onChange={(e) => setRandomMaxQty(Number(e.target.value))}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Pricing Strategy */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    {isAr ? '٤- تسعير وتكلفة الوحدة (EGP) لحساب تقييم المخزون:' : '4. Unit Cost (EGP) for Inventory Valuation:'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={() => setAutoPriceMode('fixed')}
                      className={`p-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                        autoPriceMode === 'fixed'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {isAr ? 'تكلفة شراء موحدة' : 'Fixed Unit Cost'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoPriceMode('keep_existing')}
                      className={`p-2 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                        autoPriceMode === 'keep_existing'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {isAr ? 'الاحتفاظ بالسعر المسجل بالصنف' : 'Use Existing Cost'}
                    </button>
                  </div>

                  {autoPriceMode === 'fixed' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={fixedPrice}
                        onChange={(e) => setFixedPrice(Math.max(0.01, Number(e.target.value)))}
                        className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500 font-semibold shrink-0">
                        {isAr ? 'جنيه مصري / وحدة' : 'EGP / unit'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Execution Summary Pill */}
                <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Tag className="h-4 w-4 text-emerald-600" />
                    <span>{isAr ? 'عدد الأصناف/التنوعات المستهدفة بالضخ:' : 'Impacted Candidates:'}</span>
                  </span>
                  <span className="font-extrabold font-mono text-emerald-900 px-2 py-0.5 bg-white border border-emerald-300 rounded-lg">
                    {fastAutoCandidateCount} {isAr ? 'صنف/تنوع' : 'items'}
                  </span>
                </div>

                {/* Execute Button */}
                <button
                  type="button"
                  onClick={handleExecuteFastAuto}
                  disabled={isCommitting || fastAutoCandidateCount === 0}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold shadow-sm transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isCommitting ? <Sparkles className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-300" />}
                  <span>{isAr ? 'ضخ وتوليد الأرصدة الافتتاحية فوراً' : 'Seed Opening Stock Now'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* 📝 MODE 2: MANUAL SPREADSHEET MATRIX                      */
            /* ========================================================= */
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Top Search & Filter Bar */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[260px]">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                  <input
                    type="text"
                    placeholder={isAr ? 'بحث سريع بالكود، اسم الخامة، التنوع...' : 'Search by code, material name, variant...'}
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    className="w-full ps-9 pe-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-white border border-slate-200 rounded-xl shadow-2xs text-xs font-mono font-bold text-indigo-700">
                    {filteredMatrixRows.length} {isAr ? 'صنف / تنوع معروض' : 'items shown'}
                  </span>
                </div>
              </div>

              {/* Matrix Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs max-h-[52vh]">
                <table className="w-full text-start border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 shadow-2xs">
                    {/* Row 1: Column Headers */}
                    <tr className="border-b border-slate-200 text-slate-800">
                      <th className="p-2.5 text-start w-36">{isAr ? 'كود الخامة والتنوع' : 'Material Code'}</th>
                      <th className="p-2.5 text-start min-w-[170px]">{isAr ? 'اسم الخامة' : 'Material Name'}</th>
                      <th className="p-2.5 text-start w-16">{isAr ? 'الوحدة' : 'Unit'}</th>
                      <th className="p-2.5 text-start w-44">{isAr ? 'المستودع المستهدف' : 'Target WH'}</th>
                      <th className="p-2.5 text-start w-36">{isAr ? 'الكمية الافتتاحية' : 'Opening Qty'}</th>
                      <th className="p-2.5 text-start w-36">{isAr ? 'حد إعادة الطلب' : 'Reorder Level'}</th>
                      <th className="p-2.5 text-start w-36">{isAr ? 'تكلفة الوحدة (EGP)' : 'Unit Cost'}</th>
                      <th className="p-2.5 text-end w-32">{isAr ? 'إجمالي القيمة' : 'Total Value'}</th>
                    </tr>

                    {/* Row 2: In-Column Quick Batch Fillers (Direct 1:1 Column Alignment) */}
                    <tr className="bg-indigo-50/70 border-b-2 border-indigo-200 text-xs">
                      {/* Unified Batch Fill Banner across Code, Name, and Unit */}
                      <th colSpan={3} className="p-2 text-start font-bold text-indigo-950">
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-900">
                            {matrixSearch.trim()
                              ? (isAr ? `تطبيق جماعي على المعروض (${filteredMatrixRows.length}):` : `Batch Fill Visible (${filteredMatrixRows.length}):`)
                              : (isAr ? 'تطبيق جماعي لكافة الصفوف:' : 'Batch Fill All Rows:')}
                          </span>
                        </div>
                      </th>

                      {/* 1. Target WH Batch Filler */}
                      <th className="p-2 font-normal">
                        <div className="flex items-center gap-1">
                          <select
                            value={globalFillWh}
                            onChange={(e) => setGlobalFillWh(e.target.value)}
                            className="w-full min-w-0 p-1 bg-white border border-indigo-200 rounded-lg text-xs font-semibold focus:outline-none cursor-pointer"
                          >
                            {warehousesList.map((w) => (
                              <option key={w.id} value={w.code || w.id}>
                                {w.code}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleApplyGlobalWh}
                            title={isAr ? 'تطبيق المستودع على الصفوف' : 'Apply warehouse to rows'}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] cursor-pointer shrink-0 transition shadow-2xs"
                          >
                            {isAr ? 'تطبيق' : 'Apply'}
                          </button>
                        </div>
                      </th>

                      {/* 2. Opening Qty Batch Filler */}
                      <th className="p-2 font-normal">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            placeholder={isAr ? 'الكمية' : 'Qty'}
                            value={globalFillQty}
                            onChange={(e) => setGlobalFillQty(e.target.value)}
                            className="w-full min-w-0 p-1 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleApplyGlobalQty}
                            title={isAr ? 'تطبيق الكمية على الصفوف' : 'Apply quantity to rows'}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] cursor-pointer shrink-0 transition shadow-2xs"
                          >
                            {isAr ? 'تطبيق' : 'Apply'}
                          </button>
                        </div>
                      </th>

                      {/* 3. Reorder Level Batch Filler */}
                      <th className="p-2 font-normal">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            placeholder={isAr ? 'حد الطلب' : 'Reorder'}
                            value={globalFillReorder}
                            onChange={(e) => setGlobalFillReorder(e.target.value)}
                            className="w-full min-w-0 p-1 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleApplyGlobalReorder}
                            title={isAr ? 'تطبيق حد الطلب على الصفوف' : 'Apply reorder level to rows'}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] cursor-pointer shrink-0 transition shadow-2xs"
                          >
                            {isAr ? 'تطبيق' : 'Apply'}
                          </button>
                        </div>
                      </th>

                      {/* 4. Unit Cost Batch Filler */}
                      <th className="p-2 font-normal">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={isAr ? 'السعر' : 'Price'}
                            value={globalFillPrice}
                            onChange={(e) => setGlobalFillPrice(e.target.value)}
                            className="w-full min-w-0 p-1 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleApplyGlobalPrice}
                            title={isAr ? 'تطبيق السعر على الصفوف' : 'Apply price to rows'}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] cursor-pointer shrink-0 transition shadow-2xs"
                          >
                            {isAr ? 'تطبيق' : 'Apply'}
                          </button>
                        </div>
                      </th>

                      {/* Total Value Column Filler */}
                      <th className="p-2 text-center text-slate-400 font-normal">
                        —
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredMatrixRows.map((r) => {
                      const totalVal = (Number(r.qty) || 0) * (Number(r.unitCost) || 0);
                      return (
                        <tr key={`${r.itemCode}_${r.suffix}`} className="hover:bg-slate-50/80 transition">
                          <td className="p-2 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 border border-slate-200">
                                {r.variantCode}
                              </span>
                              {r.variantObj && (
                                <VariantIdentifierChip variant={r.variantObj} size="sm" />
                              )}
                            </div>
                          </td>
                          <td className="p-2 font-semibold text-slate-800">
                            {isAr ? r.nameAr : (r.nameEn || r.nameAr)}
                          </td>
                          <td className="p-2 text-slate-500 font-medium">{r.smallUnit}</td>
                          <td className="p-2">
                            <select
                              value={r.warehouse}
                              onChange={(e) => handleMatrixCellChange(r.itemCode, r.suffix, 'warehouse', e.target.value)}
                              className="p-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:bg-white focus:outline-none"
                            >
                              {warehousesList.map((w) => (
                                <option key={w.id} value={w.code || w.id}>
                                  {w.code}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={r.qty}
                              onChange={(e) => handleMatrixCellChange(r.itemCode, r.suffix, 'qty', Math.max(0, Number(e.target.value)))}
                              className="w-full p-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={r.reorderLevel === '' ? '' : (r.reorderLevel ?? 0)}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                                handleMatrixCellChange(r.itemCode, r.suffix, 'reorderLevel', val);
                              }}
                              className="w-full p-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none font-mono"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={r.unitCost}
                              onChange={(e) => handleMatrixCellChange(r.itemCode, r.suffix, 'unitCost', Math.max(0, Number(e.target.value)))}
                              className="w-full p-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                            />
                          </td>
                          <td className="p-2 text-end font-mono font-bold text-slate-800">
                            {totalVal > 0 ? `${totalVal.toLocaleString()} EGP` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Commit Button Bar */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500 font-medium">
                  {isAr ? `إجمالي الصفوف: ${filteredMatrixRows.length} صنف/تنوع` : `Total Rows: ${filteredMatrixRows.length}`}
                </span>

                <button
                  type="button"
                  onClick={handleCommitManualMatrix}
                  disabled={isCommitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isCommitting ? <Sparkles className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>{isAr ? 'حفظ وتطبيق مصفوفة الأرصدة' : 'Save & Commit Matrix'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
