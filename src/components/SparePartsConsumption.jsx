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
import PeacockLoader from './PeacockLoader';
import {
  Plus,
  Search,
  Wrench,
  Boxes,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  PlusCircle,
  Lock,
  User,
  History,
  Building2,
  Eye,
  FileText,
  AlertCircle,
  Cog,
  Check,
  Package
} from 'lucide-react';
import { getTabConfig, getIconComponent, hexToRgb } from '../utils/tabAppearanceConfig';

export default function SparePartsConsumption({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  // In-app configured tab appearance (respecting user-configured icon and color)
  const [tabConfig, setTabConfig] = useState(() => getTabConfig('spare_parts'));
  useEffect(() => {
    const handleConfigUpdate = () => {
      setTabConfig(getTabConfig('spare_parts'));
    };
    window.addEventListener('app_tab_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('app_tab_config_updated', handleConfigUpdate);
  }, []);

  const TabConfigIcon = getIconComponent(tabConfig?.iconName);
  const tabColor = tabConfig?.color || '#ea580c';
  const { r, g, b } = hexToRgb(tabColor);

  // Dynamic Permissions Resolver
  const canCreate = isGeneralAdmin || (
    permissions?.actions?.['spare_parts_issue.canCreate'] !== undefined
      ? permissions.actions['spare_parts_issue.canCreate'] === true
      : permissions?.actions?.canCreate === true
  );

  const canCancel = isGeneralAdmin || (
    permissions?.actions?.['spare_parts_issue.canCancel'] !== undefined
      ? permissions.actions['spare_parts_issue.canCancel'] === true
      : permissions?.actions?.canCancel === true
  );

  // Cloud State
  const [issuesList, setIssuesList] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [warehousesList, setWarehousesList] = useState([]);
  const [goodsReceiptsList, setGoodsReceiptsList] = useState([]);
  const [transfersList, setTransfersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIssues, setExpandedIssues] = useState({});

  // Modal State
  const [showModal, setShowModal] = useState(false);

  // Initial Container Line Generator
  const createEmptyLine = () => ({
    id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    issueDate: new Date().toISOString().split('T')[0], // Row 1: Pre-filled with today
    itemId: '',                                        // Row 2: No pre-fill
    variantCode: '',                                   // Row 2: Auto-filled if 1 variant
    targetWarehouse: warehousesList[0]?.id || warehousesList[0]?.code || 'WH-01', // Row 3
    qty: '',                                           // Row 4: No pre-fill, 25%
    notes: '',                                         // Row 4: 75%
  });

  const [formLines, setFormLines] = useState([createEmptyLine()]);

  // Real-time Firestore Listeners
  useEffect(() => {
    // 1. Issues Collection
    const unsubIssues = onSnapshot(collection(db, 'spare_parts_issues'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setIssuesList(list);
      setLoading(false);
    });

    // 2. Items Master
    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItemsList(snap.docs.map((d) => ({ ...d.data(), code: d.id })));
    });

    // 3. Warehouses
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((w) => w.isActive !== false);
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehousesList(list);
    });

    // 4. Goods Receipts
    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceiptsList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    // 5. Stock Transfers
    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setTransfersList(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubIssues();
      unsubItems();
      unsubWarehouses();
      unsubGrns();
      unsubTransfers();
    };
  }, []);

  // Filter Strictly X-Flagged Items
  const xFlaggedItems = useMemo(() => {
    return itemsList
      .filter((item) => {
        const flagsArr = Array.isArray(item.flags) ? item.flags : (item.flags ? [item.flags] : []);
        return flagsArr.some((f) => String(f).toUpperCase().includes('X'));
      })
      .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
  }, [itemsList]);

  // Warehouse Match Helper
  const matchWh = (val, target) => {
    if (!val || !target) return false;
    return val === target.id || val === target.code || val === target.nameAr || val === target.nameEn;
  };

  // Usable Stock Matrix Engine
  const stockMetricsMap = useMemo(() => {
    const map = {}; // key: `${itemId}_${variantCode}_${warehouseId}` -> usableStock

    // 1. Inward Receipts (GRN)
    goodsReceiptsList.forEach((grn) => {
      if (grn.status === 'cancelled' || grn.status === 'rejected') return;
      const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');

      (grn.lines || []).forEach((line) => {
        const pId = line.itemId || (line.code ? line.code.split('-')[0] : '');
        const vCode = line.variantCode || line.code || pId;
        const targetWhObj = warehousesList.find((w) => matchWh(line.targetWarehouse, w)) || { id: line.targetWarehouse, code: line.targetWarehouse };
        const whId = targetWhObj.id || targetWhObj.code;
        const qty = Number(line.receivedSmallUnits || 0) * (isReturn ? -1 : 1);

        const key = `${pId}_${vCode}_${whId}`;
        map[key] = (map[key] || 0) + qty;
      });
    });

    // 2. Transfers
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

        const srcKey = `${pId}_${vCode}_${srcWhId}`;
        const tgtKey = `${pId}_${vCode}_${tgtWhId}`;
        map[srcKey] = (map[srcKey] || 0) - qty;
        map[tgtKey] = (map[tgtKey] || 0) + qty;
      });
    });

    // 3. Spare Parts Issues (Deductions)
    issuesList.forEach((issue) => {
      if (issue.status === 'cancelled') return;
      (issue.lines || []).forEach((line) => {
        const pId = line.itemId;
        const vCode = line.variantCode || pId;
        const whId = line.targetWarehouse;
        const qty = Number(line.qty || 0);

        const key = `${pId}_${vCode}_${whId}`;
        map[key] = (map[key] || 0) - qty;
      });
    });

    return map;
  }, [goodsReceiptsList, transfersList, issuesList, warehousesList]);

  // Read-only Stock Display Resolver: Selected WH vs All WHs Total
  const getStockSummary = (itemId, variantCode, selectedWhId) => {
    if (!itemId) return { selectedStock: 0, totalStock: 0, unit: 'قطعة', isStockless: false };
    const targetItem = itemsList.find((i) => i.code === itemId);
    const unit = targetItem?.smallUnit || 'قطعة';

    if (targetItem?.isStocklessUtility) {
      return { selectedStock: '∞', totalStock: '∞', unit, isStockless: true };
    }

    const vCode = variantCode || itemId;

    // Selected warehouse stock
    const selectedKey = `${itemId}_${vCode}_${selectedWhId}`;
    const selectedStock = Math.max(0, stockMetricsMap[selectedKey] || 0);

    // Sum across all warehouses
    let totalStock = 0;
    warehousesList.forEach((wh) => {
      const whId = wh.id || wh.code;
      const k = `${itemId}_${vCode}_${whId}`;
      totalStock += Math.max(0, stockMetricsMap[k] || 0);
    });

    return { selectedStock, totalStock, unit, isStockless: false };
  };

  // Open Modal Handler
  const handleOpenCreateModal = () => {
    setFormLines([
      {
        id: `line_${Date.now()}_1`,
        issueDate: new Date().toISOString().split('T')[0],
        itemId: '',
        variantCode: '',
        targetWarehouse: warehousesList[0]?.id || warehousesList[0]?.code || 'WH-01',
        qty: '',
        notes: '',
      }
    ]);
    setShowModal(true);
  };

  // Line Item Add / Remove Handlers
  const handleAddContainer = () => {
    setFormLines((prev) => [
      ...prev,
      {
        id: `line_${Date.now()}_${prev.length + 1}`,
        issueDate: new Date().toISOString().split('T')[0],
        itemId: '',
        variantCode: '',
        targetWarehouse: warehousesList[0]?.id || warehousesList[0]?.code || 'WH-01',
        qty: '',
        notes: '',
      }
    ]);
  };

  const handleRemoveContainer = (idx) => {
    if (formLines.length === 1) return;
    setFormLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Line Field Change Handler with Auto-Variance Logic
  const handleLineFieldChange = (idx, field, value) => {
    setFormLines((prev) => {
      const updated = [...prev];
      const current = { ...updated[idx], [field]: value };

      if (field === 'itemId') {
        const itemObj = itemsList.find((i) => i.code === value);
        const vars = itemObj?.variations || [];

        // Auto-fill variance if exactly 1 variant exists or if item is generic
        if (vars.length === 1) {
          current.variantCode = vars[0].variantCode || `${value}-${vars[0].suffix}`;
        } else if (vars.length === 0) {
          current.variantCode = value;
        } else {
          current.variantCode = ''; // Prompt user to select
        }
      }

      updated[idx] = current;
      return updated;
    });
  };

  // Submit Handler
  const handleSubmitIssueForm = async (e) => {
    e.preventDefault();

    if (!canCreate) {
      alert(isAr ? 'ليس لديك صلاحية تسجيل إذن صرف.' : 'Permission denied.');
      return;
    }

    // Deep Validation for Every Item Container
    for (let i = 0; i < formLines.length; i++) {
      const line = formLines[i];
      if (!line.itemId) {
        alert(isAr ? `يرجى اختيار اسم قطعة الغيار للوعاء رقم (${i + 1}).` : `Select item for container (${i + 1}).`);
        return;
      }

      if (!line.variantCode) {
        alert(isAr ? `يرجى اختيار تنوع الصنف للوعاء رقم (${i + 1}).` : `Select variance for container (${i + 1}).`);
        return;
      }

      const qtyNum = Number(line.qty);
      if (line.qty === '' || isNaN(qtyNum) || qtyNum <= 0) {
        alert(isAr ? `يرجى إدخال الكمية المطلوبة بشكل صحيح للوعاء رقم (${i + 1}).` : `Enter valid quantity for container (${i + 1}).`);
        return;
      }

      if (!line.notes.trim()) {
        alert(isAr ? `يرجى إدخال البيان والملاحظات (من المستلم، الماكينة، ولأي غرض) للوعاء رقم (${i + 1}).` : `Enter notes / purpose for container (${i + 1}).`);
        return;
      }

      const itemObj = itemsList.find((item) => item.code === line.itemId);
      const stockInfo = getStockSummary(line.itemId, line.variantCode, line.targetWarehouse);

      if (!itemObj?.isStocklessUtility && qtyNum > stockInfo.selectedStock) {
        alert(
          isAr
            ? `الكمية المطلوبة للوعاء (${i + 1}) هي (${qtyNum}) بينما الرصيد المتاح في المستودع المختار هو (${stockInfo.selectedStock}). لا يمكن الصرف بالسالب.`
            : `Requested quantity (${qtyNum}) exceeds selected warehouse stock (${stockInfo.selectedStock}).`
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const todayCompact = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const todayIssuesCount = issuesList.filter((iss) => (iss.id || '').startsWith(`XISS-${todayCompact}`)).length;
      const voucherId = `XISS-${todayCompact}-${String(todayIssuesCount + 1).padStart(2, '0')}`;

      const userName = isAr
        ? currentUser?.nameAr || currentUser?.name || currentUser?.email || 'مسؤول الصيانة'
        : currentUser?.name || currentUser?.nameAr || currentUser?.email || 'Maintenance User';

      const processedLines = formLines.map((line, lIdx) => {
        const itemObj = itemsList.find((i) => i.code === line.itemId);
        const whObj = warehousesList.find((w) => matchWh(line.targetWarehouse, w));
        const whCode = whObj?.code || line.targetWarehouse;
        const lineLotNo = `XISS-LOT-${voucherId}-${String(lIdx + 1).padStart(2, '0')}`;

        // Outward Stock Ledger Entry
        const ledgerRef = doc(collection(db, 'stock_ledger'));
        batch.set(ledgerRef, {
          grnId: voucherId,
          lotNumber: lineLotNo,
          action: 'spare_parts_consumption',
          docType: 'spare_parts_issue',
          itemId: line.itemId,
          variantCode: line.variantCode || line.itemId,
          materialNameAr: itemObj?.nameAr || line.itemId,
          materialNameEn: itemObj?.nameEn || '',
          qty: -Math.abs(Number(line.qty)),
          unit: itemObj?.smallUnit || 'قطعة',
          warehouse: whCode,
          purpose: line.notes.trim(),
          receiptDate: line.issueDate,
          receivedBy: userName,
          timestamp: serverTimestamp(),
        });

        return {
          itemId: line.itemId,
          variantCode: line.variantCode || line.itemId,
          materialNameAr: itemObj?.nameAr || line.itemId,
          materialNameEn: itemObj?.nameEn || '',
          targetWarehouse: whCode,
          qty: Number(line.qty),
          unit: itemObj?.smallUnit || 'قطعة',
          notes: line.notes.trim(),
          issueDate: line.issueDate,
        };
      });

      // Write Voucher Document
      const voucherRef = doc(db, 'spare_parts_issues', voucherId);
      batch.set(voucherRef, {
        id: voucherId,
        voucherNumber: voucherId,
        status: 'completed',
        linesCount: processedLines.length,
        lines: processedLines,
        issuedBy: {
          uid: currentUser?.id || '',
          name: userName,
          email: currentUser?.email || '',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setShowModal(false);
    } catch (err) {
      console.error('Error recording consumption:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ إذن الصرف وتحديث الأرصدة.' : 'Error saving consumption voucher.');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel Voucher Handler
  const handleCancelVoucher = async (voucher) => {
    if (!canCancel) {
      alert(isAr ? 'ليس لديك صلاحية إلغاء أذون الصرف.' : 'Permission denied to cancel voucher.');
      return;
    }

    if (window.confirm(isAr ? `هل أنت متأكد من إلغاء إذن الصرف (${voucher.id}) ورد الكميات للمخزن؟` : `Cancel voucher (${voucher.id}) and revert stock?`)) {
      setIsSaving(true);
      try {
        const batch = writeBatch(db);
        const userName = isAr
          ? currentUser?.nameAr || currentUser?.name || 'مسؤول'
          : currentUser?.name || 'User';

        (voucher.lines || []).forEach((line) => {
          const ledgerRef = doc(collection(db, 'stock_ledger'));
          batch.set(ledgerRef, {
            grnId: `REV-${voucher.id}`,
            action: 'spare_parts_reversal',
            docType: 'spare_parts_reversal',
            itemId: line.itemId,
            variantCode: line.variantCode || line.itemId,
            materialNameAr: line.materialNameAr || line.itemId,
            qty: Math.abs(Number(line.qty)),
            unit: line.unit,
            warehouse: line.targetWarehouse,
            purpose: `إلغاء ورد إذن الصرف ${voucher.id}`,
            receiptDate: new Date().toISOString().split('T')[0],
            receivedBy: userName,
            timestamp: serverTimestamp(),
          });
        });

        batch.set(
          doc(db, 'spare_parts_issues', voucher.id),
          {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
            cancelledBy: userName,
          },
          { merge: true }
        );

        await batch.commit();
      } catch (err) {
        console.error('Error cancelling voucher:', err);
        alert(isAr ? 'حدث خطأ أثناء إلغاء الإذن.' : 'Error cancelling voucher.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Search Filtered Vouchers
  const filteredIssues = useMemo(() => {
    return issuesList.filter((issue) => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        issue.id?.toLowerCase().includes(q) ||
        issue.issuedBy?.name?.toLowerCase().includes(q) ||
        issue.lines?.some((l) => l.materialNameAr?.includes(q) || l.itemId?.toLowerCase().includes(q) || l.notes?.toLowerCase().includes(q))
      );
    });
  }, [issuesList, searchTerm]);

  return (
    <div className="space-y-5 select-none">
      {isSaving && (
        <PeacockLoader
          fullScreen
          size="xl"
          text={isAr ? 'جاري تسجيل إذن الصرف وتحديث كارت الصنف وسجل الحركات...' : 'Recording consumption and updating stock ledger...'}
        />
      )}

      {/* Top Action Header */}
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
              {isAr ? (tabConfig?.labelAr || 'صرف واستهلاك قطع الغيار والمستهلكات (X-Items)') : (tabConfig?.labelEn || 'Spare Parts & Maintenance Consumption')}
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'تسجيل استهلاك قطع الغيار للمعدات وخصمها فورياً من أرصدة المخازن وسجل الحركات (Kardex)' : 'Log non-production consumption against machines and auto-deduct from inventory'}
            </span>
          </div>
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'تسجيل إذن صرف واستهلاك جديد' : 'New Consumption Voucher'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
            <Lock className="h-3.5 w-3.5" />
            <span>{isAr ? 'وضع القراءة فقط' : 'Read-Only Mode'}</span>
          </div>
        )}
      </div>

      {/* Search Filter */}
      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
        <div className="relative max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={isAr ? 'بحث برقم الإذن، اسم قطعة الغيار، البيان...' : 'Search voucher #, part name, notes...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Vouchers Main Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white min-h-[360px]">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
              <th className="p-3 text-center w-10"></th>
              <th className="p-3 text-start">{isAr ? 'رقم الإذن' : 'Voucher #'}</th>
              <th className="p-3 text-start">{isAr ? 'المسؤول عن التسجيل' : 'Issued By'}</th>
              <th className="p-3 text-center">{isAr ? 'عدد البنود المنصرفة' : 'Items Count'}</th>
              <th className="p-3 text-start">{isAr ? 'بيان الصرف والملاحظات' : 'Summary Notes'}</th>
              <th className="p-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
              <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <PeacockLoader size="lg" text={isAr ? 'جاري تحميل سجلات الاستهلاك...' : 'Loading Consumption Vouchers...'} />
                </td>
              </tr>
            ) : filteredIssues.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد أذون صرف مسجلة مطابقة للبحث.' : 'No consumption records found.'}
                </td>
              </tr>
            ) : (
              filteredIssues.map((issue) => {
                const isExpanded = Boolean(expandedIssues[issue.id]);
                const isCancelled = issue.status === 'cancelled';
                const firstLine = issue.lines?.[0] || {};

                return (
                  <React.Fragment key={issue.id}>
                    <tr className={`transition ${isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'} ${isCancelled ? 'opacity-60 bg-slate-50' : ''}`}>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedIssues((prev) => ({ ...prev, [issue.id]: !prev[issue.id] }))}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded-md transition cursor-pointer"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-blue-600" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                        </button>
                      </td>

                      <td className="p-3 align-top font-mono">
                        <span className="text-xs font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded block w-max">
                          {issue.id}
                        </span>
                      </td>

                      <td className="p-3 align-top">
                        <span className="font-bold text-slate-900 block">{issue.issuedBy?.name || '—'}</span>
                      </td>

                      <td className="p-3 align-top text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold">
                          <Boxes className="h-3.5 w-3.5 text-blue-600" />
                          <span>{issue.lines?.length || 0} {isAr ? 'قطع' : 'Parts'}</span>
                        </span>
                      </td>

                      <td className="p-3 align-top text-slate-600 max-w-sm truncate">
                        {firstLine.notes || '—'}
                      </td>

                      <td className="p-3 align-top">
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            <span>{isAr ? 'ملغي ومردود' : 'Cancelled'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>{isAr ? 'منصرف ومعتمد' : 'Issued'}</span>
                          </span>
                        )}
                      </td>

                      <td className="p-3 align-top text-center">
                        {!isCancelled && canCancel && (
                          <button
                            type="button"
                            onClick={() => handleCancelVoucher(issue)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'إلغاء الإذن ورد الرصيد للمخزن' : 'Cancel & Revert Stock'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expandable Consumed Parts Sub-Grid */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-b border-blue-100">
                        <td colSpan={7} className="p-4 ps-12 pe-6">
                          <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-2xs space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                                <Wrench className="h-4 w-4 text-blue-600" />
                                <span>{isAr ? `تفاصيل البنود المنصرفة بالإذن (${issue.id}):` : `Issued Items Breakdown (${issue.id}):`}</span>
                              </span>
                            </div>

                            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                              <table className="w-full text-start text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                                    <th className="p-2.5 text-start">{isAr ? 'تاريخ الصرف' : 'Date'}</th>
                                    <th className="p-2.5 text-start">{isAr ? 'كود واسم قطعة الغيار (X)' : 'Part Name'}</th>
                                    <th className="p-2.5 text-start">{isAr ? 'المستودع المصدر' : 'Source Warehouse'}</th>
                                    <th className="p-2.5 text-end">{isAr ? 'الكمية المنصرفة' : 'Issued Qty'}</th>
                                    <th className="p-2.5 text-start">{isAr ? 'البيان وملاحظات الصرف' : 'Notes'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(issue.lines || []).map((line, lIdx) => (
                                    <tr key={lIdx} className="hover:bg-slate-50/70">
                                      <td className="p-2.5 font-mono text-slate-600">{line.issueDate || '—'}</td>
                                      <td className="p-2.5 font-medium text-slate-900">
                                        <div>{line.materialNameAr}</div>
                                        <span className="font-mono text-[10px] text-slate-400">[{line.variantCode || line.itemId}]</span>
                                      </td>
                                      <td className="p-2.5 font-bold text-slate-700">{line.targetWarehouse}</td>
                                      <td className="p-2.5 text-end font-mono font-extrabold text-blue-900">
                                        {line.qty} {line.unit}
                                      </td>
                                      <td className="p-2.5 text-slate-700 text-xs">{line.notes}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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

      {/* ========================================================================= */}
      {/* 🛠️ REBUILT FORM MODAL (ROW 1 TO ROW 4 PER ITEM CONTAINER)                 */}
      {/* ========================================================================= */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-4 my-6">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl">
                  <Wrench className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'تسجيل إذن صرف واستهلاك قطع غيار ومستهلكات' : 'New Spare Parts Consumption Voucher'}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {isAr ? 'يتم خصم الكميات المنصرفة فورياً من أرصدة المخازن وسجل الحركات (Kardex)' : 'Quantities will be deducted from warehouse usable stock and logged in Kardex'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitIssueForm} className="space-y-4 text-xs">
              {/* Containers List */}
              <div className="space-y-4 max-h-[65vh] overflow-y-auto pe-1">
                {formLines.map((line, idx) => {
                  const itemObj = itemsList.find((i) => i.code === line.itemId);
                  const variationsList = itemObj?.variations || [];
                  const stockSummary = getStockSummary(line.itemId, line.variantCode, line.targetWarehouse);

                  return (
                    <div
                      key={line.id || idx}
                      className="p-4 bg-slate-50/90 border border-slate-200 rounded-2xl space-y-3.5 shadow-2xs transition hover:border-blue-300 w-full"
                    >
                      {/* Container Header Badge & Remove Button */}
                      <div className="flex justify-between items-center border-b border-slate-200/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-mono font-extrabold">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">
                            {itemObj?.nameAr || (isAr ? `وعاء الصرف (${idx + 1})` : `Consumption Container (${idx + 1})`)}
                          </span>
                        </div>

                        {formLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveContainer(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title={isAr ? 'حذف هذا الوعاء' : 'Remove Container'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* ROW 1: * Issuance Date field (pre-fill with today) */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          {isAr ? '١- تاريخ الصرف *' : '1. Issuance Date *'}
                        </label>
                        <input
                          type="date"
                          required
                          value={line.issueDate}
                          onChange={(e) => handleLineFieldChange(idx, 'issueDate', e.target.value)}
                          className="w-full sm:w-1/3 p-2 border border-slate-300 rounded-xl bg-white font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                        />
                      </div>

                      {/* ROW 2: * Item Name (no pre-fill) & Item Variance Name (auto-fill if 1 variance) */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 w-full">
                        {/* Item Name (50%) */}
                        <div className="min-w-0">
                          <label className="block font-bold text-slate-700 mb-1 truncate">
                            {isAr ? '٢- اسم قطعة الغيار / المستهلك (Flag X) *' : '2. Item Name (Flag X) *'}
                          </label>
                          <select
                            required
                            value={line.itemId}
                            onChange={(e) => handleLineFieldChange(idx, 'itemId', e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs truncate"
                          >
                            <option value="">{isAr ? '-- اختر قطعة الغيار / المستهلك --' : '-- Select X-Item --'}</option>
                            {xFlaggedItems.map((xItem) => (
                              <option key={xItem.code} value={xItem.code}>
                                {xItem.nameAr} [{xItem.code}]
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Item Variance Name (50%) */}
                        <div className="min-w-0">
                          <label className="block font-bold text-slate-700 mb-1 truncate">
                            {isAr ? 'تنوع الصنف / المورد (Item Variance) *' : 'Item Variance / Vendor *'}
                          </label>
                          <select
                            required
                            disabled={!line.itemId || variationsList.length <= 1}
                            value={line.variantCode}
                            onChange={(e) => handleLineFieldChange(idx, 'variantCode', e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-xl font-semibold text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs truncate"
                          >
                            {!line.itemId ? (
                              <option value="">{isAr ? '-- حدد الصنف أولاً --' : '-- Select Item First --'}</option>
                            ) : variationsList.length === 0 ? (
                              <option value={line.itemId}>{isAr ? 'صنف عام بدون تنوعات' : 'Generic Item'}</option>
                            ) : variationsList.length === 1 ? (
                              <option value={variationsList[0].variantCode || `${line.itemId}-${variationsList[0].suffix}`}>
                                [{variationsList[0].suffix}] {variationsList[0].supplierName || 'التنوع الوحيد المعتمد'}
                              </option>
                            ) : (
                              <>
                                <option value="">{isAr ? '-- اختر التنوع المعتمد --' : '-- Select Variance --'}</option>
                                {variationsList.map((v) => (
                                  <option key={v.variantCode || v.suffix} value={v.variantCode || `${line.itemId}-${v.suffix}`}>
                                    [{v.suffix}] {v.supplierName || 'تنوع'} {v.packagingRatio ? `[شدة: ${v.packagingRatio}]` : ''}
                                  </option>
                                ))}
                              </>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* ROW 3: * Warehouse Name & Read-only Stock Qty (Selected WH / Total All WHs) */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 items-end w-full">
                        {/* Warehouse Name (50%) */}
                        <div className="min-w-0">
                          <label className="block font-bold text-slate-700 mb-1 truncate">
                            {isAr ? '٣- اسم المستودع المنصرف منه *' : '3. Source Warehouse *'}
                          </label>
                          <select
                            required
                            value={line.targetWarehouse}
                            onChange={(e) => handleLineFieldChange(idx, 'targetWarehouse', e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-xl font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                          >
                            {warehousesList.map((wh) => (
                              <option key={wh.id || wh.code} value={wh.id || wh.code}>
                                {wh.code ? `${wh.code} - ` : ''}{isAr ? wh.nameAr : wh.nameEn || wh.nameAr}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Read-only Stock Quantity in Selected WH / Stock in All Warehouses (50%) */}
                        <div className="min-w-0">
                          <label className="block font-bold text-slate-500 mb-1 truncate">
                            {isAr ? 'الرصيد المتاح (المخزن المختار / الإجمالي):' : 'Stock (Selected WH / Total):'}
                          </label>
                          <div className="p-2 bg-slate-100 border border-slate-300 rounded-xl flex items-center justify-between font-mono font-bold text-xs text-slate-900 min-h-[38px]">
                            <span className="text-blue-900 truncate">
                              {isAr ? 'المختار:' : 'Selected:'} <b>{stockSummary.isStockless ? '∞' : stockSummary.selectedStock.toLocaleString()} {stockSummary.unit}</b>
                            </span>
                            <span className="text-slate-500 text-[11px] truncate ps-1">
                              / {isAr ? 'الإجمالي:' : 'Total:'} <b>{stockSummary.isStockless ? '∞' : stockSummary.totalStock.toLocaleString()} {stockSummary.unit}</b>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* ROW 4: * Quantity Needed (25% Width) & * Notes (75% Width) */}
                      <div className="grid grid-cols-4 gap-3 pt-2 border-t border-slate-200/60 items-end w-full">
                        {/* 25% Prominent Quantity Needed Field (col-span-1 of 4) */}
                        <div className="col-span-1 min-w-0">
                          <label className="block font-extrabold text-blue-900 mb-1 truncate">
                            {isAr ? `٤- الكمية (${stockSummary.unit}) *` : `4. Qty (${stockSummary.unit}) *`}
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            required
                            placeholder="0"
                            value={line.qty}
                            onChange={(e) => handleLineFieldChange(idx, 'qty', e.target.value)}
                            className="w-full p-2.5 border-2 border-blue-500 rounded-xl font-mono font-extrabold text-center text-sm text-blue-950 bg-white ring-2 ring-blue-500/20 focus:ring-4 focus:ring-blue-500/30 focus:outline-none"
                          />
                        </div>

                        {/* 75% Notes Field (col-span-3 of 4) */}
                        <div className="col-span-3 min-w-0">
                          <label className="block font-bold text-slate-700 mb-1 truncate">
                            {isAr ? 'البيان والملاحظات (المستلم، الماكينة، ولأي غرض) *' : 'Notes (Recipient, Machine & Purpose) *'}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder={isAr ? 'اكتب هنا: اسم المستلم، الماكينة المستفيدة، ولأي غرض تم الصرف...' : 'Recipient name, target machine, and maintenance purpose...'}
                            value={line.notes}
                            onChange={(e) => handleLineFieldChange(idx, 'notes', e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400 placeholder:italic"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Another Item Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleAddContainer}
                  className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border-2 border-dashed border-blue-300 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>{isAr ? 'إضافة وعاء صنف آخر (Add Item)' : 'Add Another Item Container'}</span>
                </button>
              </div>

              {/* Modal Footer Actions */}
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
                  <span>{isAr ? 'تأكيد الصرف وخصم الرصيد' : 'Confirm Consumption & Deduct Stock'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}