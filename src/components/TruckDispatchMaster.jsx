import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Truck,
  PackageCheck,
  Boxes,
  Lock,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Users,
  Search,
  Calendar,
  RotateCcw,
  ClipboardCheck,
  Scale,
  X,
  UserPlus,
  Trash2,
  ArrowDownLeft,
  ShieldCheck,
  Clock,
  FileCheck2,
  FileText,
  Eye,
  History,
  MoreVertical,
  Printer,
  Copy,
  Check,
  Edit3,
  Send,
  UserCheck,
  Unlock,
  ExternalLink,
  ListChecks,
} from 'lucide-react';
import { db, functions } from '../firebase.js';
import { httpsCallable } from 'firebase/functions';
import PeacockLoader from './PeacockLoader.jsx';
import SalesOrderAuditModal from './SalesOrderAuditModal.jsx';
import { RowCommentButton } from './comments';
import { canAccessAction } from '../config/appArchitecture.js';
import { buildFgStockMatrix, formatDateStr, roundQty } from '../utils/fgStockEngine.js';
import {
  buildTripsCatalog,
  buildTripDispatchMatrix,
  autoEqualizeWorkerEfforts,
  sumWorkerEffortPct,
  buildReturnInspectionMatrix,
  evaluateReturnHandshake,
  resolveProductAndOption,
  getDocPrintStatus,
  detectPostDispatchPlanChanges,
} from '../utils/truckDispatchUtils.js';
import {
  createActionRequired,
  completeActionRequired,
  createNotification,
  dispatchWorkflowEvent,
  highlightTargetRow,
} from '../utils/notificationEngine.js';
import {
  resolveUserReturnAuthority,
  evaluateReturnFieldLocks,
  resolveEligibleSalesOrderSettlers,
} from '../utils/returnRoleEngine.js';
import { generateQRCodeDataURL } from '../utils/qrCodeGenerator.js';
import {
  buildDispatchDocumentModel,
  renderDispatchDocumentHtml,
} from '../utils/dispatchDocumentBuilder.js';
import {
  buildReturnDocumentModel,
  renderReturnDocumentHtml,
} from '../utils/returnDocumentBuilder.js';
import {
  buildDispatchDocumentsRegistry,
  buildRegistryEntryPayload,
} from '../utils/dispatchDocumentRegistry.js';
import {
  DISPATCH_DOCUMENTS_COLLECTION,
  mintDispatchDocNumber,
  mintReturnDocNumber,
  saveDispatchDocumentToRegistry,
  markTripRegistryDocsSuperseded,
} from '../utils/dispatchDocumentFirestore.js';
import DispatchDocumentsHistoryModal from './DispatchDocumentsHistoryModal.jsx';
import { SalesOrderEditorModal } from './SalesOrdersMaster.jsx';
import RetailSettlementModal from './RetailSettlementModal.jsx';
import { DEFAULT_PRICING_STRATEGIES } from '../utils/pricingEngine.js';
import { buildUnifiedPersonnelPool } from '../utils/personnelDirectory.js';

const ORDER_TYPE_META = {
  supply: { ar: 'أمر توريد', en: 'Supply', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  replacement_old: { ar: 'إحلال وتبديل', en: 'Replacement', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  exchange: { ar: 'تبديل أصناف', en: 'Exchange', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  return_deduct: { ar: 'مرتجع خصم', en: 'Return (Deduct)', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  return_no_deduct: { ar: 'مرتجع بدون خصم', en: 'Return (No Deduct)', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};

const WORKER_ROLE_LABELS = {
  operator: { ar: 'عامل تشغيل', en: 'Operator' },
  maintenance_tech: { ar: 'فني صيانة', en: 'Maintenance Tech' },
  qc_inspector: { ar: 'مراقب جودة', en: 'QC Inspector' },
  line_leader: { ar: 'مشرف خط', en: 'Line Leader' },
  assistant: { ar: 'مساعد تحميل / توزيع', en: 'Loader / Assistant' },
  forklift_driver: { ar: 'سائق كلارك', en: 'Forklift Driver' },
};

function fmtCtn(val) {
  const n = Number(val || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// =========================================================================
// REUSABLE SUB-COMPONENT: Labour Task Roster & Effort Percentage Splitter
// =========================================================================
function LabourEffortRosterEditor({
  titleAr,
  titleEn,
  accentClass = 'indigo',
  workers = [],
  onChange,
  workerPool = [],
  disabled = false,
  isAr = true,
}) {
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const { total, isBalanced } = sumWorkerEffortPct(workers);

  const selectedIds = new Set(workers.map((w) => w.workerId));
  const availableWorkers = workerPool.filter((w) => !selectedIds.has(w.id));

  const handleAddWorker = () => {
    if (!selectedWorkerId || disabled) return;
    const picked = workerPool.find((w) => w.id === selectedWorkerId);
    if (!picked) return;
    const nextList = autoEqualizeWorkerEfforts([
      ...workers,
      {
        workerId: picked.id,
        name: picked.nameAr || picked.name || picked.id,
        nameEn: picked.nameEn || picked.name || picked.id,
        role: picked.role || '',
        effortPct: 100,
      },
    ]);
    onChange(nextList);
    setSelectedWorkerId('');
  };

  const handleRemoveWorker = (workerId) => {
    if (disabled) return;
    const remaining = workers.filter((w) => w.workerId !== workerId);
    onChange(autoEqualizeWorkerEfforts(remaining));
  };

  const handlePctChange = (workerId, rawVal) => {
    if (disabled) return;
    const num = Math.max(0, Math.min(100, Number(rawVal) || 0));
    onChange(workers.map((w) => (w.workerId === workerId ? { ...w, effortPct: num } : w)));
  };

  const borderCls = accentClass === 'teal' ? 'border-teal-200 bg-teal-50/40' : 'border-indigo-200 bg-indigo-50/40';
  const badgeCls =
    workers.length === 0
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : isBalanced
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : 'bg-rose-100 text-rose-800 border-rose-300';

  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 ${borderCls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className={`w-4 h-4 ${accentClass === 'teal' ? 'text-teal-700' : 'text-indigo-700'}`} />
          <span className="text-xs font-black text-slate-900">{isAr ? titleAr : titleEn}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {workers.length > 1 && !disabled && (
            <button
              type="button"
              onClick={() => onChange(autoEqualizeWorkerEfforts(workers))}
              className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700 transition cursor-pointer"
              title={isAr ? 'توزيع النسبة بالتساوي بين العمال' : 'Split effort equally across workers'}
            >
              {isAr ? 'توزيع متساوي' : 'Equal Split'}
            </button>
          )}
          <span className={`px-2 py-0.5 rounded-lg border font-mono text-[10px] font-black ${badgeCls}`}>
            {workers.length === 0
              ? (isAr ? 'بدون عمالة' : '0 workers')
              : `${total}% ${isBalanced ? '✓' : '≠ 100%'}`}
          </span>
        </div>
      </div>

      {/* Add Worker Picker */}
      {!disabled && (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="flex-1 text-xs font-bold bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 outline-none focus:border-teal-600"
          >
            <option value="">
              {isAr ? '— اختر عامل لإضافته لهذه المهمة —' : '— Select worker to add —'}
            </option>
            {availableWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.role ? `(${w.role})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedWorkerId}
            onClick={handleAddWorker}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isAr ? 'إضافة' : 'Add'}</span>
          </button>
        </div>
      )}

      {/* Workers List + Adjustable Effort % */}
      {workers.length === 0 ? (
        <div className="text-[11px] text-slate-500 font-medium text-center py-2 bg-white/60 rounded-xl border border-dashed border-slate-300">
          {isAr ? 'لم يتم تسجيل عمالة لهذا الدور حتى الآن.' : 'No workers assigned yet for this task.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {workers.map((w) => (
            <div
              key={w.workerId}
              className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-extrabold text-slate-900 truncate">
                  {isAr ? w.name : w.nameEn || w.name}
                </div>
                {w.role && <div className="text-[10px] text-slate-400 font-medium truncate">{w.role}</div>}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-0.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={disabled || workers.length === 1}
                    value={w.effortPct}
                    onChange={(e) => handlePctChange(w.workerId, e.target.value)}
                    className="w-14 text-center font-mono text-xs font-black bg-transparent outline-none disabled:text-slate-600"
                  />
                  <span className="text-[10px] font-mono font-bold text-slate-500">%</span>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveWorker(w.workerId)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title={isAr ? 'إزالة العامل' : 'Remove worker'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// DISPATCH MATRIX MODAL (Clients × Products/Options + Extras + Dual Labour)
// =========================================================================
function TruckDispatchModal({
  isOpen,
  onClose,
  trip,
  finishedProducts = [],
  workerPool = [],
  stockMatrixSkuMap = {},
  currentUser = {},
  canConfirmDispatch = false,
  onSaved,
  isAr = true,
}) {
  const existing = trip?.dispatchDoc || null;

  const { columns: initialColumns, clientRows } = useMemo(() => {
    if (!trip) return { columns: [], clientRows: [] };
    return buildTripDispatchMatrix({
      tripOrders: trip.orders,
      finishedProducts,
      existingDispatch: existing,
    });
  }, [trip, finishedProducts, existing]);

  const [columns, setColumns] = useState([]);
  const [extrasByCol, setExtrasByCol] = useState({});
  const [loadingWorkers, setLoadingWorkers] = useState([]);
  const [offloadingWorkers, setOffloadingWorkers] = useState([]);
  const [extraCatalogPick, setExtraCatalogPick] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !trip) return;
    setColumns(initialColumns);
    const extMap = {};
    initialColumns.forEach((c) => {
      extMap[c.colKey] = Number(c.extraQty || 0);
    });
    setExtrasByCol(extMap);
    setLoadingWorkers(Array.isArray(existing?.loadingWorkers) ? existing.loadingWorkers : []);
    setOffloadingWorkers(Array.isArray(existing?.offloadingWorkers) ? existing.offloadingWorkers : []);
    setDispatchNotes(existing?.dispatchNotes || '');
    setExtraCatalogPick('');
  }, [isOpen, trip?.id]);

  // All catalog SKU::Option variants not already in matrix for "+ Add Extra Variant"
  const extraColumnOptions = useMemo(() => {
    const existingKeys = new Set(columns.map((c) => c.colKey));
    const opts = [];
    finishedProducts.forEach((prod) => {
      if (prod.status === 'inactive') return;
      const code = String(prod.code || prod.id || '').trim();
      const rawOpts =
        Array.isArray(prod.packagingOptions) && prod.packagingOptions.length > 0
          ? prod.packagingOptions.filter((o) => o.isActive !== false)
          : [{ suffix: 'A', packagingRatio: prod.packagingRatio || 1 }];
      rawOpts.forEach((o) => {
        const meta = resolveProductAndOption(finishedProducts, code, o.suffix, o.packagingRatio);
        const key = `${meta.productCode}::${meta.optionSuffix}`;
        if (!existingKeys.has(key)) {
          opts.push({
            colKey: key,
            label: isAr ? `${meta.nameAr} [${meta.optionCode}]` : `${meta.nameEn} [${meta.optionCode}]`,
            meta,
          });
        }
      });
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label, isAr ? 'ar' : 'en'));
  }, [finishedProducts, columns, isAr]);

  if (!isOpen || !trip) return null;

  const handleAddExtraColumn = () => {
    if (!extraCatalogPick) return;
    const found = extraColumnOptions.find((o) => o.colKey === extraCatalogPick);
    if (!found) return;
    const { meta } = found;
    setColumns((prev) => [
      ...prev,
      {
        colKey: found.colKey,
        productId: meta.productId,
        productCode: meta.productCode,
        optionSuffix: meta.optionSuffix,
        optionCode: meta.optionCode,
        packagingRatio: meta.packagingRatio,
        nameAr: meta.nameAr,
        nameEn: meta.nameEn,
        shortNameAr: meta.shortNameAr,
        shortNameEn: meta.shortNameEn,
        optionNameAr: meta.optionNameAr,
        optionNameEn: meta.optionNameEn,
        imageFile: meta.imageFile,
        largeUnitName: meta.largeUnitName,
        lockedQty: 0,
        extraQty: 0,
      },
    ]);
    setExtrasByCol((prev) => ({ ...prev, [found.colKey]: 0 }));
    setExtraCatalogPick('');
  };

  const getAvailableOnShelfForCol = (col) => {
    const sku = stockMatrixSkuMap[col.productCode];
    if (!sku) return 0;
    if (col.optionSuffix === 'ANY') return Number(sku.physicalOnHandLarge || 0);
    const opt = (sku.optionsBreakdown || []).find((o) => o.suffix === col.optionSuffix);
    const base = opt ? Number(opt.physicalOnHandLarge || 0) : Number(sku.physicalOnHandLarge || 0);
    // Add back previously saved extra on THIS doc so editing doesn't falsely warn against itself
    const prevSavedCol = (existing?.columns || []).find((c) => c.colKey === col.colKey);
    return roundQty(base + Number(prevSavedCol?.extraQty || 0));
  };

  const loadingCheck = sumWorkerEffortPct(loadingWorkers);
  const offloadingCheck = sumWorkerEffortPct(offloadingWorkers);
  const crewsValid = loadingCheck.isBalanced && offloadingCheck.isBalanced;

  const totalLockedAll = roundQty(columns.reduce((s, c) => s + Number(c.lockedQty || 0), 0));
  const totalExtrasAll = roundQty(columns.reduce((s, c) => s + Number(extrasByCol[c.colKey] || 0), 0));
  const totalDispatchedAll = roundQty(totalLockedAll + totalExtrasAll);

  const handleConfirmDispatch = async () => {
    if (!canConfirmDispatch || !crewsValid) return;
    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);

      const savedCols = columns.map((c) => {
        const extraQty = roundQty(Math.max(0, Number(extrasByCol[c.colKey] || 0)));
        return {
          colKey: c.colKey,
          productId: c.productId,
          productCode: c.productCode,
          optionSuffix: c.optionSuffix,
          optionCode: c.optionCode,
          packagingRatio: c.packagingRatio,
          nameAr: c.nameAr,
          nameEn: c.nameEn,
          lockedQty: roundQty(c.lockedQty || 0),
          extraQty,
          totalDispatchedQty: roundQty((c.lockedQty || 0) + extraQty),
        };
      });

      const batch = writeBatch(db);
      const dispRef = doc(db, 'truck_dispatches', trip.id);

      const nextDispatchStatus =
        trip.allDispatchedOut && existing?.dispatchStatus === 'returned'
          ? 'returned'
          : trip.allDispatchedOut
          ? 'dispatched'
          : 'loaded';

      // Preserve existing return verification data cleanly while refreshing expectedExtras
      const nextReturnByCol = { ...(existing?.returnByCol || {}) };
      savedCols.forEach((sc) => {
        const prevRet = nextReturnByCol[sc.colKey] || {};
        const expExt = sc.extraQty;
        const expCli = Number(prevRet.expectedClientReturns || 0);
        const whExt = prevRet.whReceivedExtras !== undefined ? Number(prevRet.whReceivedExtras) : expExt;
        const whCli = prevRet.whReceivedClientReturns !== undefined ? Number(prevRet.whReceivedClientReturns) : expCli;
        const acctTot = roundQty(expExt + expCli);
        const whTot = roundQty(whExt + whCli);
        nextReturnByCol[sc.colKey] = {
          expectedExtras: expExt,
          expectedClientReturns: expCli,
          whReceivedExtras: whExt,
          whReceivedClientReturns: whCli,
          faultySwappedExtras: Number(prevRet.faultySwappedExtras || 0),
          shortageExtras: Number(prevRet.shortageExtras || 0),
          accountantExpectedTotal: acctTot,
          whReceivedTotal: whTot,
          variance: roundQty(whTot - acctTot),
        };
      });

      const isEditDispatch = Boolean(existing && existing.dispatchStatus && existing.dispatchStatus !== 'cancelled');
      const prevColsMap = {};
      (existing?.columns || []).forEach((pc) => {
        prevColsMap[pc.colKey] = pc;
      });
      const formatCrewNames = (arr) =>
        (Array.isArray(arr) && arr.length > 0)
          ? [...arr]
              .sort((a, b) => String(a.workerId).localeCompare(String(b.workerId)))
              .map((w) => `${w.name} (${w.effortPct}%)`)
              .join('، ')
          : '—';

      const prevLockedAll = roundQty((existing?.columns || []).reduce((s, c) => s + Number(c.lockedQty || 0), 0));
      const prevExtrasAll = roundQty((existing?.columns || []).reduce((s, c) => s + Number(c.extraQty || 0), 0));
      const prevLoadingStr = formatCrewNames(existing?.loadingWorkers);
      const nextLoadingStr = formatCrewNames(loadingWorkers);
      const prevOffloadingStr = formatCrewNames(existing?.offloadingWorkers);
      const nextOffloadingStr = formatCrewNames(offloadingWorkers);
      const prevNotes = String(existing?.dispatchNotes || '').trim();
      const nextNotes = dispatchNotes.trim();

      const metadataChanges = [];
      if (!isEditDispatch) {
        metadataChanges.push({
          labelAr: 'إجمالي المطلوب (مقفل)',
          labelEn: 'Locked Variant Qty',
          newValue: `${totalLockedAll} ctn`,
        });
        if (totalExtrasAll > 0) {
          metadataChanges.push({
            labelAr: 'إجمالي زيادات الرحلة (Extras)',
            labelEn: 'Trip Extras',
            newValue: `${totalExtrasAll} ctn`,
          });
        }
        if (nextLoadingStr !== '—') {
          metadataChanges.push({ labelAr: 'عمالة التحميل', labelEn: 'Loading Crew', newValue: nextLoadingStr });
        }
        if (nextOffloadingStr !== '—') {
          metadataChanges.push({ labelAr: 'عمالة التفريغ والتوزيع', labelEn: 'Offloading Crew', newValue: nextOffloadingStr });
        }
        if (nextNotes) {
          metadataChanges.push({ labelAr: 'ملاحظات التحميل', labelEn: 'Dispatch Notes', newValue: nextNotes });
        }
      } else {
        if (Math.abs(prevLockedAll - totalLockedAll) > 1e-4) {
          metadataChanges.push({
            labelAr: 'إجمالي المطلوب (مقفل)',
            labelEn: 'Locked Variant Qty',
            oldValue: `${prevLockedAll} ctn`,
            newValue: `${totalLockedAll} ctn`,
          });
        }
        if (Math.abs(prevExtrasAll - totalExtrasAll) > 1e-4) {
          metadataChanges.push({
            labelAr: 'إجمالي زيادات الرحلة (Extras)',
            labelEn: 'Trip Extras',
            oldValue: `${prevExtrasAll} ctn`,
            newValue: `${totalExtrasAll} ctn`,
          });
        }
        if (prevLoadingStr !== nextLoadingStr) {
          metadataChanges.push({
            labelAr: 'عمالة التحميل',
            labelEn: 'Loading Crew',
            oldValue: prevLoadingStr,
            newValue: nextLoadingStr,
          });
        }
        if (prevOffloadingStr !== nextOffloadingStr) {
          metadataChanges.push({
            labelAr: 'عمالة التفريغ والتوزيع',
            labelEn: 'Offloading Crew',
            oldValue: prevOffloadingStr,
            newValue: nextOffloadingStr,
          });
        }
        if (prevNotes !== nextNotes) {
          metadataChanges.push({
            labelAr: 'ملاحظات التحميل',
            labelEn: 'Dispatch Notes',
            oldValue: prevNotes || '—',
            newValue: nextNotes || '—',
          });
        }
      }

      const lineChanges = [];
      savedCols.forEach((sc) => {
        const prevC = prevColsMap[sc.colKey];
        if (!isEditDispatch) {
          if (sc.extraQty > 0 || sc.lockedQty > 0) {
            lineChanges.push({
              productCode: sc.optionCode || sc.productCode,
              productNameAr: sc.nameAr,
              productNameEn: sc.nameEn,
              type: 'added',
              detailAr: `مقفل: ${sc.lockedQty}${sc.extraQty > 0 ? ` + زيادات: ${sc.extraQty}` : ''} = ${sc.totalDispatchedQty} كرتونة`,
              detailEn: `Locked: ${sc.lockedQty}${sc.extraQty > 0 ? ` + Extras: ${sc.extraQty}` : ''} = ${sc.totalDispatchedQty} ctn`,
            });
          }
        } else {
          const prevLocked = Number(prevC?.lockedQty || 0);
          const prevExtra = Number(prevC?.extraQty || 0);
          const changedPartsAr = [];
          const changedPartsEn = [];
          if (!prevC) {
            changedPartsAr.push(`إضافة صنف (زيادات: ${sc.extraQty})`);
            changedPartsEn.push(`Added SKU (Extras: ${sc.extraQty})`);
          } else {
            if (Math.abs(prevLocked - sc.lockedQty) > 1e-4) {
              changedPartsAr.push(`مقفل: ${prevLocked} → ${sc.lockedQty}`);
              changedPartsEn.push(`Locked: ${prevLocked} → ${sc.lockedQty}`);
            }
            if (Math.abs(prevExtra - sc.extraQty) > 1e-4) {
              changedPartsAr.push(`زيادات: ${prevExtra} → ${sc.extraQty}`);
              changedPartsEn.push(`Extras: ${prevExtra} → ${sc.extraQty}`);
            }
          }
          if (changedPartsAr.length > 0) {
            lineChanges.push({
              productCode: sc.optionCode || sc.productCode,
              productNameAr: sc.nameAr,
              productNameEn: sc.nameEn,
              type: prevC ? 'modified' : 'added',
              detailAr: changedPartsAr.join(' | '),
              detailEn: changedPartsEn.join(' | '),
            });
          }
        }
      });

      // Detect Loading Plan / Sales Order drift vs previously confirmed dispatch snapshot
      const planDrift = isEditDispatch
        ? detectPostDispatchPlanChanges({ trip, finishedProducts })
        : { hasPlanDrift: false, changes: [], summaryAr: '', summaryEn: '' };

      if (planDrift.hasPlanDrift) {
        planDrift.changes.forEach((ch) => {
          metadataChanges.push({
            labelAr: ch.labelAr,
            labelEn: ch.labelEn,
            oldValue: ch.oldValue || '—',
            newValue: ch.newValue || '—',
          });
        });
      }

      // Avoid recording redundant audit entry or incrementing count if editing without actual changes
      if (isEditDispatch && metadataChanges.length === 0 && lineChanges.length === 0) {
        onClose();
        return;
      }

      // Preserve previous confirmed dispatch snapshot in dispatchHistory[] before overwriting
      const prevHistory = Array.isArray(existing?.dispatchHistory) ? existing.dispatchHistory : [];
      const nextDispatchHistory = isEditDispatch
        ? [
            ...prevHistory,
            {
              revisionNumber: prevHistory.length + 1,
              archivedAt: nowIso,
              archivedBy: actorName,
              reasonAr: planDrift.hasPlanDrift ? planDrift.summaryAr : 'تحديث يدوي لبيان الصرف',
              reasonEn: planDrift.hasPlanDrift ? planDrift.summaryEn : 'Manual dispatch slip update',
              dispatchedAt: existing?.updatedAt || existing?.dispatchedAt || '',
              dispatchedByName: existing?.updatedByName || existing?.dispatchedByName || '',
              vehicleName: existing?.vehicleName || '',
              driverName: existing?.driverName || '',
              deliveryRepName: existing?.deliveryRepName || '',
              orderIds: Array.isArray(existing?.orderIds) ? existing.orderIds : [],
              columns: Array.isArray(existing?.columns) ? existing.columns : [],
              clientRowsSnapshot: Array.isArray(existing?.clientRowsSnapshot) ? existing.clientRowsSnapshot : [],
              loadingWorkers: Array.isArray(existing?.loadingWorkers) ? existing.loadingWorkers : [],
              offloadingWorkers: Array.isArray(existing?.offloadingWorkers) ? existing.offloadingWorkers : [],
              dispatchNotes: existing?.dispatchNotes || '',
            },
          ]
        : prevHistory;

      // Mark any previously 'current' printed Dispatch Documents as 'superseded' (Legacy)
      const prevDocVersions = Array.isArray(existing?.dispatchDocVersions) ? existing.dispatchDocVersions : [];
      const nextDocVersions = isEditDispatch
        ? prevDocVersions.map((ver) =>
            ver.status === 'current'
              ? {
                  ...ver,
                  status: 'superseded',
                  supersededAt: nowIso,
                  supersededBy: actorName,
                  supersededReasonAr: planDrift.hasPlanDrift
                    ? planDrift.summaryAr
                    : 'تم تعديل بيان الصرف بعد الطباعة',
                }
              : ver
          )
        : prevDocVersions;

      const orderSequencesSnapshot = {};
      trip.orders.forEach((o) => {
        const seq = Number(o.deliverySequence);
        orderSequencesSnapshot[o.id] = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : null;
      });

      const dispatchAuditEntry = {
        id: `AUD-TD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: isEditDispatch ? 'truck_dispatch_updated' : 'truck_dispatch_confirmed',
        summaryAr: isEditDispatch
          ? (planDrift.hasPlanDrift
              ? `تحديث بيان الصرف بعد تعديل خطة رحلة #${trip.loadingOrderNumber}`
              : `تحديث بيان تحميل رحلة #${trip.loadingOrderNumber}`)
          : `اعتماد تحميل وصرف رحلة #${trip.loadingOrderNumber} (${trip.vehicleDisplayName}): مقفل ${totalLockedAll} + زيادات ${totalExtrasAll} = ${totalDispatchedAll} كرتونة`,
        summaryEn: isEditDispatch
          ? (planDrift.hasPlanDrift
              ? `Re-confirmed dispatch after Loading Plan changes on Trip #${trip.loadingOrderNumber}`
              : `Updated dispatch slip for Trip #${trip.loadingOrderNumber}`)
          : `Confirmed dispatch slip for Trip #${trip.loadingOrderNumber} (${trip.vehicleDisplayName}): Locked ${totalLockedAll} + Extras ${totalExtrasAll} = ${totalDispatchedAll} ctn`,
        changes: { metadata: metadataChanges, lineChanges },
      };

      const payload = {
        id: trip.id,
        tripKey: trip.tripKey,
        loadingDate: trip.loadingDate,
        loadingOrderNumber: trip.loadingOrderNumber,
        vehicleId: trip.primaryVehicleId || existing?.vehicleId || '',
        vehicleName: trip.vehicleDisplayName || existing?.vehicleName || '',
        plateNumber: trip.primaryVehiclePlate || existing?.plateNumber || '',
        driverId: trip.primaryDriverId || existing?.driverId || '',
        driverName: trip.primaryDriverName || existing?.driverName || '',
        deliveryRepId: trip.primaryRepId || existing?.deliveryRepId || '',
        deliveryRepName: trip.primaryRepName || existing?.deliveryRepName || '',
        orderIds: trip.orders.map((o) => o.id),
        orderSequencesSnapshot,
        dispatchStatus: nextDispatchStatus,
        columns: savedCols,
        clientRowsSnapshot: clientRows.map((r) => ({
          orderId: r.orderId,
          serial: r.serial,
          clientId: r.clientId,
          clientName: r.clientName,
          orderType: r.orderType,
          quantitiesByCol: r.quantitiesByCol,
        })),
        loadingWorkers,
        offloadingWorkers,
        dispatchNotes: dispatchNotes.trim(),
        returnHandshakeStatus: existing?.returnHandshakeStatus || 'none',
        returnByCol: nextReturnByCol,
        dispatchContentUpdatedAt: nowIso,
        dispatchHistory: nextDispatchHistory,
        dispatchDocVersions: nextDocVersions,
        auditTrail: [...(Array.isArray(existing?.auditTrail) ? existing.auditTrail : []), dispatchAuditEntry],
        dispatchedBy: existing?.dispatchedBy || actorId,
        dispatchedByName: existing?.dispatchedByName || actorName,
        dispatchedAt: existing?.dispatchedAt || nowIso,
        updatedBy: actorId,
        updatedByName: actorName,
        updatedAt: nowIso,
      };

      const confirmDispatchFn = httpsCallable(functions, 'salesConfirmTruckDispatch');
      await confirmDispatchFn({
        tripId: trip.id,
        payload,
        isEditDispatch,
        supersedureMeta: isEditDispatch
          ? {
              reasonAr: planDrift.hasPlanDrift ? planDrift.summaryAr : 'تم تعديل بيان الصرف بعد الطباعة',
              reasonEn: planDrift.hasPlanDrift ? planDrift.summaryEn : 'Dispatch slip modified after printing',
            }
          : {},
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
      if (onSaved) onSaved(payload);
      onClose();
    } catch (err) {
      console.error('Error saving truck dispatch slip:', err);
      alert(isAr ? `حدث خطأ أثناء حفظ بيان الصرف: ${err.message}` : `Error saving truck dispatch: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-start animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-teal-300 rtl:-scale-x-100" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black">
                  {isAr
                    ? `بيان تحميل وصرف شاحنة — رحلة #${trip.loadingOrderNumber}`
                    : `Truck Loading & Dispatch Matrix — Trip #${trip.loadingOrderNumber}`}
                </h3>
                <span className="px-2 py-0.5 rounded-lg bg-white/10 text-teal-200 font-mono text-[11px] font-bold">
                  {trip.loadingDate}
                </span>
                {trip.isWarehouseConfirmed && (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 text-[10px] font-black">
                    {isAr ? 'بوابة مخزن التام ✓' : 'FG Gate Confirmed ✓'}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
                {trip.vehicleDisplayName}
                {trip.primaryDriverName ? ` • ${isAr ? 'السائق:' : 'Driver:'} ${trip.primaryDriverName}` : ''}
                {trip.primaryRepName ? ` • ${isAr ? 'المندوب:' : 'Rep:'} ${trip.primaryRepName}` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5">
          {/* Post-Dispatch Loading Plan Changes Delta Banner */}
          {trip.planDrift?.hasPlanDrift && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-950 space-y-2">
              <div className="flex items-center gap-2 font-black text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {isAr
                    ? 'تنبيه: تم تعديل خطة التحميل لهذه الرحلة بعد اعتماد الصرف — راجع التعديلات أدناه ثم اعتمد التحديث:'
                    : 'Alert: Loading Plan changed after dispatch — review the differences below and re-confirm:'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trip.planDrift.changes.map((ch, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-[11px] font-bold text-rose-900"
                  >
                    <span>{isAr ? ch.labelAr : ch.labelEn}:</span>
                    {ch.oldValue && ch.oldValue !== '—' && (
                      <>
                        <span className="line-through text-slate-400 font-mono">{ch.oldValue}</span>
                        <span>→</span>
                      </>
                    )}
                    <span className="font-mono font-black text-rose-700">{ch.newValue}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Return Orders Info Note if trip also contains scheduled return orders */}
          {trip.returnOrders.length > 0 && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-2 font-bold">
              <ArrowDownLeft className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                {isAr
                  ? `تحتوي هذه الرحلة أيضاً على (${trip.returnOrders.length}) طلب مرتجع عميل — يتم تسجيلها ومطابقتها في نافذة استلام المرتجعات بعد العودة.`
                  : `This trip also includes ${trip.returnOrders.length} commercial client return order(s) handled inside Return / Receiving Inspection.`}
              </span>
            </div>
          )}

          {/* Matrix Toolbar: Quick Add Extra SKU Column */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isAr
                  ? 'مصفوفة التحميل (الكميات الأساسية مقفلة وفق خطة التحميل المعتمدة)'
                  : 'Loading Matrix (Client order quantities are locked from Loading Plan)'}
              </span>
            </div>

            {canConfirmDispatch && extraColumnOptions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={extraCatalogPick}
                  onChange={(e) => setExtraCatalogPick(e.target.value)}
                  className="text-xs font-bold bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 max-w-[260px] outline-none focus:border-teal-600"
                >
                  <option value="">
                    {isAr ? '+ إضافة صنف زيادات غير مدرج...' : '+ Add Extra-Only SKU Column...'}
                  </option>
                  {extraColumnOptions.map((o) => (
                    <option key={o.colKey} value={o.colKey}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!extraCatalogPick}
                  onClick={handleAddExtraColumn}
                  className="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إدراج' : 'Add'}</span>
                </button>
              </div>
            )}
          </div>

          {/* CLIENT (ROWS) × PRODUCT / PACKING-OPTION (COLUMNS) MATRIX */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-2xs">
            <table className="w-full border-collapse text-xs text-start min-w-[680px]">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-start font-black text-slate-800 sticky start-0 bg-slate-100 z-10 min-w-[200px] border-e border-slate-200">
                    {isAr ? 'العميل / رقم الأمر' : 'Client / Order #'}
                  </th>
                  {columns.map((col) => {
                    const availShelf = getAvailableOnShelfForCol(col);
                    return (
                      <th key={col.colKey} className="py-2 px-2.5 text-center min-w-[130px] border-e border-slate-200/70 align-top">
                        <div className="flex flex-col items-center gap-1">
                          {col.imageFile && (
                            <img
                              src={col.imageFile}
                              alt=""
                              className="w-7 h-7 rounded-lg object-cover border border-slate-200 bg-white"
                            />
                          )}
                          <span className="font-extrabold text-slate-900 leading-tight text-[11px] line-clamp-2">
                            {isAr ? col.shortNameAr : col.shortNameEn}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-white border border-slate-200 text-[10px] font-bold text-indigo-800">
                            {isAr ? col.optionNameAr : col.optionNameEn}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">
                            {col.optionCode} • {isAr ? 'متاح:' : 'Shelf:'} {fmtCtn(availShelf)}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="py-2.5 px-3 text-center font-black text-slate-800 min-w-[100px] bg-slate-100">
                    {isAr ? 'الإجمالي' : 'Row Total'}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {clientRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="py-6 text-center text-slate-400 font-bold">
                      {isAr ? 'لا توجد أوامر بيع منصرفة بهذه الرحلة.' : 'No outbound client orders on this trip.'}
                    </td>
                  </tr>
                ) : (
                  clientRows.map((row) => (
                    <tr key={row.orderId} className="hover:bg-slate-50/70 transition">
                      <td className="py-2 px-3 sticky start-0 bg-white border-e border-slate-200 z-10">
                        <div className="font-extrabold text-slate-900 text-xs truncate max-w-[220px]">
                          {row.clientName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] font-bold text-slate-500">#{row.serial}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${ORDER_TYPE_META[row.orderType]?.cls || ''}`}>
                            {isAr ? ORDER_TYPE_META[row.orderType]?.ar : ORDER_TYPE_META[row.orderType]?.en}
                          </span>
                        </div>
                      </td>

                      {columns.map((col) => {
                        const qty = Number(row.quantitiesByCol[col.colKey] || 0);
                        return (
                          <td key={col.colKey} className="py-2 px-2.5 text-center border-e border-slate-100 font-mono">
                            {qty > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-900 font-bold text-xs">
                                <Lock className="w-2.5 h-2.5 text-slate-400" />
                                {fmtCtn(qty)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 text-center font-mono font-black text-slate-900 bg-slate-50/50">
                        {fmtCtn(row.rowTotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* FOOTER ROWS: 1. Locked Totals -> 2. Trip Extras Inputs -> 3. Total Dispatched */}
              <tfoot className="border-t-2 border-slate-300">
                {/* 1. Locked Variant Totals */}
                <tr className="bg-slate-100/90 font-black text-slate-800">
                  <td className="py-2.5 px-3 sticky start-0 bg-slate-100 border-e border-slate-200 z-10">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isAr ? 'إجمالي المطلوب (مقفل)' : 'Total Variant Qty (Locked)'}</span>
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col.colKey} className="py-2.5 px-2.5 text-center font-mono text-xs border-e border-slate-200">
                      {fmtCtn(col.lockedQty)}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-center font-mono text-sm text-slate-900">
                    {fmtCtn(totalLockedAll)}
                  </td>
                </tr>

                {/* 2. Add Trip Extras */}
                <tr className="bg-teal-50/75 border-t border-teal-200">
                  <td className="py-2.5 px-3 sticky start-0 bg-teal-50 border-e border-teal-200 z-10">
                    <div className="flex items-center gap-1.5 text-xs font-black text-teal-900">
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>{isAr ? '+ زيادات الرحلة (Extras)' : '+ Trip Extras (Precaution)'}</span>
                    </div>
                    <span className="text-[10px] text-teal-700 font-medium block">
                      {isAr ? 'تُخصم مؤقتاً وتُتابع عند العودة' : 'Deducted & tracked for return'}
                    </span>
                  </td>
                  {columns.map((col) => {
                    const extVal = extrasByCol[col.colKey] ?? 0;
                    const totalColNeed = roundQty((col.lockedQty || 0) + Number(extVal || 0));
                    const availShelf = getAvailableOnShelfForCol(col);
                    const exceedsShelf = Number(extVal || 0) > 0 && totalColNeed > availShelf;
                    return (
                      <td key={col.colKey} className="py-2 px-2 text-center border-e border-teal-200/70">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={!canConfirmDispatch}
                          value={extVal}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setExtrasByCol((prev) => ({ ...prev, [col.colKey]: val }));
                          }}
                          className={`w-20 text-center font-mono text-xs font-black bg-white border rounded-xl py-1 px-2 outline-none focus:ring-2 ${
                            exceedsShelf
                              ? 'border-amber-400 text-amber-900 focus:ring-amber-200'
                              : 'border-teal-300 text-teal-900 focus:ring-teal-200'
                          }`}
                        />
                        {exceedsShelf && (
                          <div className="text-[9px] text-amber-700 font-bold mt-0.5">
                            {isAr ? 'يتجاوز رصيد المخزن' : 'Exceeds shelf'}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono font-black text-sm text-teal-800">
                    +{fmtCtn(totalExtrasAll)}
                  </td>
                </tr>

                {/* 3. Total Dispatched */}
                <tr className="bg-slate-900 text-white font-black">
                  <td className="py-2.5 px-3 sticky start-0 bg-slate-900 border-e border-slate-700 z-10 text-xs">
                    {isAr ? 'إجمالي المنصرف بالسيارة' : 'Total Dispatched on Truck'}
                  </td>
                  {columns.map((col) => {
                    const colTotal = roundQty((col.lockedQty || 0) + Number(extrasByCol[col.colKey] || 0));
                    return (
                      <td key={col.colKey} className="py-2.5 px-2.5 text-center font-mono text-sm text-emerald-300 border-e border-slate-800">
                        {fmtCtn(colTotal)}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono text-base text-emerald-300">
                    {fmtCtn(totalDispatchedAll)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* DUAL LABOUR ROSTER & EFFORT % REGISTRATION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LabourEffortRosterEditor
              titleAr="١. عمالة تحميل الشاحنة (بالمخزن)"
              titleEn="1. Warehouse Loading Crew"
              accentClass="teal"
              workers={loadingWorkers}
              onChange={setLoadingWorkers}
              workerPool={workerPool}
              disabled={!canConfirmDispatch}
              isAr={isAr}
            />
            <LabourEffortRosterEditor
              titleAr="٢. عمالة التفريغ والتوزيع (المرافقون للرحلة)"
              titleEn="2. Offloading / Accompanying Crew"
              accentClass="indigo"
              workers={offloadingWorkers}
              onChange={setOffloadingWorkers}
              workerPool={workerPool}
              disabled={!canConfirmDispatch}
              isAr={isAr}
            />
          </div>

          {/* Warehouse Loading & Dispatch Comments */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              {isAr
                ? 'ملاحظات أمين المخزن عند التحميل والصرف (تظهر في إذن الصرف):'
                : 'Warehouse Loading & Dispatch Comments (printed on Dispatch Document):'}
            </label>
            <textarea
              rows={3}
              disabled={!canConfirmDispatch}
              value={dispatchNotes}
              onChange={(e) => setDispatchNotes(e.target.value)}
              placeholder={
                isAr
                  ? 'رقم السيل، حالة الشاحنة، تعليمات التحميل أو الزيادات، أي ملاحظات للسائق أو البوابة...'
                  : 'Seal #, truck condition, loading/extras instructions, remarks for driver or gate...'
              }
              className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-teal-600 resize-y min-h-[72px]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] font-bold text-slate-500">
            {!crewsValid && (
              <span className="text-rose-700">
                {isAr
                  ? 'يجب أن يساوي مجموع نسب مجهود العمالة 100% لكل مهمة مسجلة.'
                  : 'Worker effort percentages must total exactly 100% for each assigned crew.'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            {canConfirmDispatch && (
              <button
                type="button"
                disabled={isSaving || !crewsValid}
                onClick={handleConfirmDispatch}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <PackageCheck className="w-4 h-4" />
                <span>
                  {isSaving
                    ? (isAr ? 'جاري الحفظ...' : 'Saving...')
                    : trip.isWarehouseConfirmed
                    ? (isAr ? 'تحديث بيان التحميل والصرف' : 'Update Dispatch Slip')
                    : (isAr ? 'اعتماد التحميل وبوابة المخزن' : 'Confirm Load & FG Gate ✓')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// RETURN / RECEIVING MODAL (Strict Separation of Duties & 2-Party Alignment)
// =========================================================================
function TruckReturnReceivingModal({
  isOpen,
  onClose,
  trip,
  finishedProducts = [],
  allOrders = [],
  clients = [],
  vehicles = [],
  segments = [],
  productCategories = [],
  priceLists = [],
  strategies = DEFAULT_PRICING_STRATEGIES,
  stdRetailList = [],
  currentUser = {},
  returnAuthority = {},
  eligibleOrderSettlers = [],
  todayStr = '',
  onSaved,
  isAr = true,
}) {
  const dispatchDoc = trip?.dispatchDoc || null;

  const {
    columns,
    clientReturnRows,
    initialReturnByCol,
    liveExpectedByCol,
    tripOrdersSummary,
  } = useMemo(() => {
    if (!trip) {
      return {
        columns: [],
        clientReturnRows: [],
        initialReturnByCol: {},
        liveExpectedByCol: {},
        tripOrdersSummary: [],
      };
    }
    return buildReturnInspectionMatrix({
      tripOrders: trip.orders,
      finishedProducts,
      dispatchDoc,
    });
  }, [trip, finishedProducts, dispatchDoc]);

  const defaultActorRole = returnAuthority.defaultActorMode
    ? returnAuthority.defaultActorMode(dispatchDoc)
    : 'warehouse';

  const [actorMode, setActorMode] = useState(defaultActorRole);
  const [returnByCol, setReturnByCol] = useState({});
  const [stockReturnDate, setStockReturnDate] = useState(todayStr || formatDateStr(new Date()));
  const [returnNotes, setReturnNotes] = useState('');
  const [whAmendReason, setWhAmendReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Inline Sales Order Adjustment / Creation Settlement Modals
  const [inlineEditorState, setInlineEditorState] = useState(null);
  const [inlineRetailOrder, setInlineRetailOrder] = useState(null);
  const [inlineSettlementFeedback, setInlineSettlementFeedback] = useState('');

  // Order-Settlement Task Delegation state
  const [showTaskDelegation, setShowTaskDelegation] = useState(
    !returnAuthority.canAdjustOrCreateSalesOrders
  );
  const [taskTargetMode, setTaskTargetMode] = useState('all_eligible'); // 'all_eligible' | 'selected'
  const [selectedSettlerIds, setSelectedSettlerIds] = useState([]);
  const [taskNotes, setTaskNotes] = useState('');
  const [isSendingTask, setIsSendingTask] = useState(false);
  const [taskSentMsg, setTaskSentMsg] = useState('');

  // General Admin Exclusive Controls state
  const [adminWriteOffOpen, setAdminWriteOffOpen] = useState(false);
  const [adminWriteOffReason, setAdminWriteOffReason] = useState('');
  const [adminReopenOpen, setAdminReopenOpen] = useState(false);
  const [adminReopenReason, setAdminReopenReason] = useState('');

  useEffect(() => {
    if (!isOpen || !trip) return;
    setReturnByCol(initialReturnByCol);
    setStockReturnDate(formatDateStr(dispatchDoc?.stockReturnDate) || todayStr || formatDateStr(new Date()));
    setReturnNotes(dispatchDoc?.returnNotes || '');
    setWhAmendReason('');
    setAdminWriteOffOpen(false);
    setAdminWriteOffReason('');
    setAdminReopenOpen(false);
    setAdminReopenReason('');
    setInlineEditorState(null);
    setInlineRetailOrder(null);
    setInlineSettlementFeedback('');
    setTaskNotes('');
    setSelectedSettlerIds([]);
    setTaskTargetMode('all_eligible');
    setTaskSentMsg('');
    setShowTaskDelegation(!returnAuthority.canAdjustOrCreateSalesOrders);
    setActorMode(
      returnAuthority.defaultActorMode
        ? returnAuthority.defaultActorMode(dispatchDoc)
        : 'warehouse'
    );
  }, [isOpen, trip?.id]);

  // Keep Expected quantities synced live with Sales Orders whenever WH locked actuals or settlement is active
  const liveExpectedSignature = useMemo(() => JSON.stringify(liveExpectedByCol || {}), [liveExpectedByCol]);
  useEffect(() => {
    if (!isOpen || !trip) return;
    const shouldSyncFromOrders =
      Boolean(dispatchDoc?.whReturnConfirmedAt) ||
      (!dispatchDoc?.accountantReturnSubmittedAt &&
        (!dispatchDoc?.returnHandshakeStatus || dispatchDoc?.returnHandshakeStatus === 'none'));
    if (!shouldSyncFromOrders) return;

    setReturnByCol((prev) => {
      const nextMap = {};
      const allColKeys = new Set([
        ...Object.keys(initialReturnByCol || {}),
        ...Object.keys(liveExpectedByCol || {}),
      ]);
      allColKeys.forEach((colKey) => {
        const prevRow = prev[colKey] || initialReturnByCol[colKey] || {};
        const liveExp = liveExpectedByCol[colKey];
        const expExt = liveExp ? Number(liveExp.liveExpectedExtras || 0) : Number(prevRow.expectedExtras || 0);
        const expCli = liveExp ? Number(liveExp.liveExpectedClientReturns || 0) : Number(prevRow.expectedClientReturns || 0);
        const recExt = dispatchDoc?.whReturnConfirmedAt
          ? Number(prevRow.whReceivedExtras ?? initialReturnByCol[colKey]?.whReceivedExtras ?? 0)
          : expExt;
        const recCli = dispatchDoc?.whReturnConfirmedAt
          ? Number(prevRow.whReceivedClientReturns ?? initialReturnByCol[colKey]?.whReceivedClientReturns ?? 0)
          : expCli;
        const acctTotal = roundQty(expExt + expCli);
        const whTotal = roundQty(recExt + recCli);
        nextMap[colKey] = {
          ...prevRow,
          expectedExtras: expExt,
          expectedClientReturns: expCli,
          whReceivedExtras: recExt,
          whReceivedClientReturns: recCli,
          accountantExpectedTotal: acctTotal,
          whReceivedTotal: whTotal,
          variance: roundQty(whTotal - acctTotal),
        };
      });
      return nextMap;
    });
  }, [isOpen, trip?.id, dispatchDoc?.whReturnConfirmedAt, dispatchDoc?.returnHandshakeStatus, liveExpectedSignature]);

  if (!isOpen || !trip) return null;

  const fieldLocks = evaluateReturnFieldLocks({
    actorMode,
    authority: returnAuthority,
    dispatchDoc,
    currentUserId: currentUser?.id || '',
  });

  const evalRes = evaluateReturnHandshake({
    returnByCol,
    liveExpectedByCol,
    actorRole: actorMode,
    alreadyWhConfirmed: Boolean(dispatchDoc?.whReturnConfirmedAt),
    alreadyAcctConfirmed: Boolean(dispatchDoc?.accountantReturnSubmittedAt),
    isGeneralAdmin: Boolean(returnAuthority.isGeneralAdmin),
  });

  const handleFieldChange = (colKey, field, rawVal) => {
    const isWhField = field === 'whReceivedExtras' || field === 'whReceivedClientReturns';
    const isAcctField = field === 'expectedExtras' || field === 'expectedClientReturns';
    if (isWhField && !fieldLocks.canEditWhFields) return;
    if (isAcctField && !fieldLocks.canEditAcctExpectedFields) return;

    const val = Math.max(0, Number(rawVal) || 0);
    setReturnByCol((prev) => {
      const curr = prev[colKey] || {};
      const next = { ...curr, [field]: val };
      const acctTotal = roundQty(Number(next.expectedExtras || 0) + Number(next.expectedClientReturns || 0));
      const whTotal = roundQty(Number(next.whReceivedExtras || 0) + Number(next.whReceivedClientReturns || 0));
      return {
        ...prev,
        [colKey]: {
          ...next,
          accountantExpectedTotal: acctTotal,
          whReceivedTotal: whTotal,
          variance: roundQty(whTotal - acctTotal),
        },
      };
    });
  };

  const handleMatchExactFromExpected = () => {
    if (!fieldLocks.canEditWhFields) return;
    setReturnByCol((prev) => {
      const updated = {};
      Object.entries(prev).forEach(([k, v]) => {
        const expExt = Number(v.expectedExtras || 0);
        const expCli = Number(v.expectedClientReturns || 0);
        const tot = roundQty(expExt + expCli);
        updated[k] = {
          ...v,
          whReceivedExtras: expExt,
          whReceivedClientReturns: expCli,
          accountantExpectedTotal: tot,
          whReceivedTotal: tot,
          variance: 0,
        };
      });
      return updated;
    });
  };

  const buildSkuDeltaSummary = () => {
    const items = [];
    columns.forEach((c) => {
      const cell = returnByCol[c.colKey] || {};
      const v = Number(cell.variance || 0);
      const liveExp = liveExpectedByCol[c.colKey];
      const liveDelta = liveExp ? roundQty(Number(cell.accountantExpectedTotal || 0) - Number(liveExp.liveExpectedTotal || 0)) : 0;
      if (Math.abs(v) > 1e-4) {
        items.push(
          isAr
            ? `${c.shortNameAr} (${c.optionNameAr}): متوقع ${fmtCtn(cell.accountantExpectedTotal)} / مستلم ${fmtCtn(cell.whReceivedTotal)} (فرق ${v > 0 ? '+' : ''}${fmtCtn(v)})`
            : `${c.shortNameEn} (${c.optionNameEn}): Exp ${fmtCtn(cell.accountantExpectedTotal)} / Rec ${fmtCtn(cell.whReceivedTotal)} (Δ ${v > 0 ? '+' : ''}${fmtCtn(v)})`
        );
      } else if (Math.abs(liveDelta) > 1e-4) {
        items.push(
          isAr
            ? `${c.shortNameAr} (${c.optionNameAr}): مسجل ${fmtCtn(cell.accountantExpectedTotal)} / أوامر ${fmtCtn(liveExp.liveExpectedTotal)} (فرق ${liveDelta > 0 ? '+' : ''}${fmtCtn(liveDelta)})`
            : `${c.shortNameEn} (${c.optionNameEn}): Entered ${fmtCtn(cell.accountantExpectedTotal)} / Orders ${fmtCtn(liveExp.liveExpectedTotal)} (Δ ${liveDelta > 0 ? '+' : ''}${fmtCtn(liveDelta)})`
        );
      }
    });
    return items.join(' | ');
  };

  const handleAutoFillTaskNotes = () => {
    const deltaText = buildSkuDeltaSummary();
    const prefix = isAr
      ? `يرجى تسوية فروقات مرتجع رحلة #${trip.loadingOrderNumber} (${trip.loadingDate}) بتعديل أوامر البيع أو إضافة أمر توريد/مرتجع:\n`
      : `Please settle return variance for Trip #${trip.loadingOrderNumber} (${trip.loadingDate}) by adjusting orders or adding a Supply/Return order:\n`;
    setTaskNotes(`${prefix}${deltaText || ''}`.trim());
  };

  const handleToggleSettler = (uid) => {
    setSelectedSettlerIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleAssignSettlementTask = async () => {
    if (!taskNotes.trim()) {
      alert(isAr ? 'يرجى كتابة ملاحظات توضح المطلوب تعديله أو إضافته لتسوية الرحلة.' : 'Please enter settlement notes describing the required order adjustments.');
      return;
    }
    if (taskTargetMode === 'selected' && selectedSettlerIds.length === 0) {
      alert(isAr ? 'يرجى اختيار مستخدم واحد على الأقل من المؤهلين لتعديل أوامر البيع.' : 'Please select at least one authorized Sales Order user.');
      return;
    }

    setIsSendingTask(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);

      const resolvedUsers =
        taskTargetMode === 'selected'
          ? eligibleOrderSettlers.filter((u) => selectedSettlerIds.includes(u.id))
          : eligibleOrderSettlers;
      const resolvedTargetIds = resolvedUsers.map((u) => u.id);
      const resolvedTargetNames = resolvedUsers.map((u) => (isAr ? u.nameAr : u.name));
      const skuDeltaSummary = buildSkuDeltaSummary();

      const taskEntry = {
        id: `RST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: nowIso,
        createdBy: actorId,
        createdByName: actorName,
        targetMode: taskTargetMode,
        targetUserIds: resolvedTargetIds,
        targetUserNames: resolvedTargetNames,
        notes: taskNotes.trim(),
        skuDeltaSummary,
        status: 'open',
        completedAt: null,
        completedBy: null,
        completedByName: null,
      };

      const prevTasks = Array.isArray(dispatchDoc?.returnSettlementTasks)
        ? dispatchDoc.returnSettlementTasks
        : [];
      const taskAuditEntry = {
        id: `AUD-TSK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: 'truck_return_settlement_task_assigned',
        summaryAr: `توجيه مهمة تسوية أوامر بيع لرحلة #${trip.loadingOrderNumber} (${resolvedTargetNames.length > 0 ? resolvedTargetNames.join('، ') : 'المؤهلون تلقائياً'}) — ${taskNotes.trim()}`,
        summaryEn: `Assigned Sales Order settlement task for Trip #${trip.loadingOrderNumber} (${resolvedTargetNames.length > 0 ? resolvedTargetNames.join(', ') : 'Eligible Users'}) — ${taskNotes.trim()}`,
        changes: { metadata: [], lineChanges: [] },
      };

      const submitStepFn = httpsCallable(functions, 'salesSubmitReturnStep');
      await submitStepFn({
        mode: 'assign_task',
        tripId: trip.id,
        payload: {
          tripKey: trip.tripKey,
          loadingDate: trip.loadingDate,
          loadingOrderNumber: trip.loadingOrderNumber,
        },
        taskEntry,
        taskAuditEntry,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });

      await dispatchWorkflowEvent({
        eventKey: 'trip_return_order_settlement_task',
        docId: trip.id,
        docNumber: `LO-${trip.loadingOrderNumber}`,
        titleAr: `مطلوب تسوية أوامر بيع لرحلة #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        titleEn: `Sales Order Settlement Task — Trip #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        messageAr: `من المحاسب (${actorName}): ${taskNotes.trim()}${skuDeltaSummary ? ` | الفروقات: ${skuDeltaSummary}` : ''}`,
        messageEn: `From Accounting (${actorName}): ${taskNotes.trim()}${skuDeltaSummary ? ` | Variance: ${skuDeltaSummary}` : ''}`,
        targetModule: 'sales',
        targetTab: 'sales_orders',
        highlightId: trip.id,
        actor: currentUser,
        extraUserIds: resolvedTargetIds,
        onlyExplicitUsers: taskTargetMode === 'selected',
        metadata: {
          tripId: trip.id,
          settlementTripId: trip.id,
          taskId: taskEntry.id,
          notes: taskNotes.trim(),
          skuDeltaSummary,
        },
      });

      setTaskSentMsg(
        isAr
          ? 'تم إرسال مهمة التسوية بنجاح للمستخدمين المخولين لتعديل/إضافة أوامر البيع ✓'
          : 'Settlement task assigned successfully to authorized Sales Order users ✓'
      );
      setTaskNotes('');
    } catch (err) {
      console.error('Error assigning return settlement task:', err);
      alert(isAr ? `تعذر إرسال المهمة: ${err.message}` : `Failed assigning task: ${err.message}`);
    } finally {
      setIsSendingTask(false);
    }
  };

  const resolveVehicleDisplayNameModal = (vehObj, fallbackName = '') => {
    if (!vehObj) return fallbackName || '—';
    return (vehObj.vehicleModel || vehObj.makeModel || vehObj.name || fallbackName || vehObj.code || '—').trim();
  };

  const buildTripPrefillContext = (orderType = 'supply', settledFromTripExtras = false) => ({
    tripId: trip.id,
    loadingDate: trip.loadingDate,
    loadingOrderNumber: trip.loadingOrderNumber,
    assignedVehicleId: trip.primaryVehicleId || dispatchDoc?.vehicleId || '',
    assignedVehicleName: trip.vehicleDisplayName || dispatchDoc?.vehicleName || '',
    assignedVehiclePlate: trip.plateNumber || dispatchDoc?.plateNumber || '',
    assignedDriverId: trip.primaryDriverId || dispatchDoc?.driverId || '',
    assignedDriverName: trip.primaryDriverName || dispatchDoc?.driverName || '',
    assignedDeliveryRepId: trip.primaryRepId || dispatchDoc?.deliveryRepId || '',
    assignedDeliveryRepName: trip.primaryRepName || dispatchDoc?.deliveryRepName || '',
    orderType,
    settledFromTripExtras: Boolean(settledFromTripExtras && orderType === 'supply'),
    fulfillmentStatus: 'delivered',
  });

  const handleOpenInlineEditOrder = (orderId) => {
    const fullOrder = (trip.orders || []).find((x) => x.id === orderId) || allOrders.find((x) => x.id === orderId) || null;
    if (!fullOrder) return;
    setInlineSettlementFeedback('');
    setInlineEditorState({
      editingOrder: fullOrder,
      prefillTripContext: null,
      initialAdjustmentMode: true,
    });
  };

  const handleOpenInlineCreateOrder = (orderType = 'supply', settledFromTripExtras = false) => {
    setInlineSettlementFeedback('');
    setInlineEditorState({
      editingOrder: null,
      prefillTripContext: buildTripPrefillContext(orderType, settledFromTripExtras),
      initialAdjustmentMode: false,
    });
  };

  const handleOpenInlineRetailOrder = (orderId) => {
    const fullOrder = (trip.orders || []).find((x) => x.id === orderId) || allOrders.find((x) => x.id === orderId) || null;
    if (!fullOrder) return;
    setInlineSettlementFeedback('');
    setInlineRetailOrder(fullOrder);
  };

  const handleInlineOrderSaved = async (savedOrder) => {
    if (!savedOrder || !trip) return;
    const savedId = savedOrder.id;
    const prevOrders = Array.isArray(trip.orders) ? trip.orders : [];
    const existsIdx = prevOrders.findIndex((o) => o.id === savedId);
    const nextTripOrders =
      existsIdx >= 0
        ? prevOrders.map((o, idx) => (idx === existsIdx ? { ...o, ...savedOrder } : o))
        : [...prevOrders, savedOrder];

    const { liveExpectedByCol: nextLiveMap } = buildReturnInspectionMatrix({
      tripOrders: nextTripOrders,
      finishedProducts,
      dispatchDoc,
    });

    const isAcctFirstDiscrepancy =
      !dispatchDoc?.whReturnConfirmedAt &&
      dispatchDoc?.returnHandshakeStatus === 'discrepancy_pending_accounting';

    const nextReturnByCol = {};
    const allKeys = new Set([
      ...Object.keys(returnByCol || {}),
      ...Object.keys(nextLiveMap || {}),
    ]);
    allKeys.forEach((ck) => {
      const curr = returnByCol[ck] || {};
      const liveCell = nextLiveMap[ck] || { liveExpectedExtras: 0, liveExpectedClientReturns: 0 };
      const expExt = isAcctFirstDiscrepancy
        ? Number(curr.expectedExtras ?? liveCell.liveExpectedExtras ?? 0)
        : Number(liveCell.liveExpectedExtras || 0);
      const expCli = isAcctFirstDiscrepancy
        ? Number(curr.expectedClientReturns ?? liveCell.liveExpectedClientReturns ?? 0)
        : Number(liveCell.liveExpectedClientReturns || 0);
      const recExt = dispatchDoc?.whReturnConfirmedAt ? Number(curr.whReceivedExtras ?? 0) : expExt;
      const recCli = dispatchDoc?.whReturnConfirmedAt ? Number(curr.whReceivedClientReturns ?? 0) : expCli;
      const acctTotal = roundQty(expExt + expCli);
      const whTotal = roundQty(recExt + recCli);
      nextReturnByCol[ck] = {
        ...curr,
        expectedExtras: expExt,
        expectedClientReturns: expCli,
        whReceivedExtras: recExt,
        whReceivedClientReturns: recCli,
        accountantExpectedTotal: acctTotal,
        whReceivedTotal: whTotal,
        variance: roundQty(whTotal - acctTotal),
      };
    });

    const nextLiveTotal = roundQty(
      Object.values(nextLiveMap || {}).reduce((s, c) => s + Number(c?.liveExpectedTotal || 0), 0)
    );

    setReturnByCol(nextReturnByCol);

    const postEval = evaluateReturnHandshake({
      returnByCol: nextReturnByCol,
      liveExpectedByCol: nextLiveMap,
      actorRole: 'accountant',
      alreadyWhConfirmed: Boolean(dispatchDoc?.whReturnConfirmedAt),
      alreadyAcctConfirmed: Boolean(dispatchDoc?.accountantReturnSubmittedAt),
      isGeneralAdmin: Boolean(returnAuthority.isGeneralAdmin),
    });

    const nowIso = new Date().toISOString();
    const actorId = currentUser?.id || 'system';
    const actorName = isAr
      ? (currentUser?.nameAr || currentUser?.name || actorId)
      : (currentUser?.name || currentUser?.nameAr || actorId);

    // If Accountant had submitted first with a mismatch (discrepancy_pending_accounting) and adding/adjusting
    // this order now brings orders & expected returns back into alignment before WH receives physical goods,
    // automatically clear the discrepancy in Firestore and advance cleanly to `pending_wh_confirm`.
    if (
      !dispatchDoc?.whReturnConfirmedAt &&
      dispatchDoc?.returnHandshakeStatus === 'discrepancy_pending_accounting' &&
      !postEval.hasOrderMismatch &&
      !postEval.hasVariance
    ) {
      const clearAudit = {
        id: `AUD-STL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: 'truck_return_settlement_auto_cleared',
        summaryAr: `تمت تسوية فرق المرتجع بأمر البيع #${savedOrder.serial || savedId} — المرتجع المتوقع الآن ${postEval.totalExpected} كرتونة بانتظار استلام المخزن`,
        summaryEn: `Cleared return variance via Sales Order #${savedOrder.serial || savedId} — Expected return synced at ${postEval.totalExpected} ctn (pending WH)`,
        changes: {
          metadata: [
            { labelAr: 'حالة المطابقة', labelEn: 'Handshake Status', oldValue: 'discrepancy_pending_accounting', newValue: 'pending_wh_confirm' },
          ],
          lineChanges: [],
        },
      };

      const submitStepFn = httpsCallable(functions, 'salesSubmitReturnStep');
      await submitStepFn({
        mode: 'auto_clear',
        tripId: trip.id,
        payload: {
          returnHandshakeStatus: 'pending_wh_confirm',
          returnByCol: postEval.normalizedByCol,
          returnContentUpdatedAt: nowIso,
          accountantReturnSubmittedBy: dispatchDoc?.accountantReturnSubmittedBy || actorId,
          accountantReturnSubmittedByName: dispatchDoc?.accountantReturnSubmittedByName || actorName,
          accountantReturnSubmittedAt: dispatchDoc?.accountantReturnSubmittedAt || nowIso,
        },
        clearAudit,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });

      await Promise.all([
        completeActionRequired({
          actionType: 'trip_return_variance_accounting',
          docId: trip.id,
          completedBy: actorId,
          completedByName: actorName,
          resolutionNote: `Resolved inline via Sales Order #${savedOrder.serial || savedId}`,
        }),
        completeActionRequired({
          actionType: 'truck_return_accountant_review',
          docId: trip.id,
          completedBy: actorId,
          completedByName: actorName,
          resolutionNote: `Resolved inline via Sales Order #${savedOrder.serial || savedId}`,
        }),
      ]);

      await dispatchWorkflowEvent({
        eventKey: 'trip_return_expected_warehouse',
        docId: trip.id,
        docNumber: `LO-${trip.loadingOrderNumber}`,
        titleAr: `مطلوب تأكيد استلام مرتجعات رحلة #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        titleEn: `Confirm Physical Receipt for Trip #${trip.loadingOrderNumber} (${trip.loadingDate})`,
        messageAr: `تمت تسوية أوامر البيع وأصبح المرتجع المتوقع للرحلة ${postEval.totalExpected} كرتونة. يرجى الفحص وتأكيد الاستلام الفعلي بالمخزن.`,
        messageEn: `Sales Orders settled; expected return is now ${postEval.totalExpected} ctn. Please confirm physical receipt in Warehouse.`,
        targetModule: 'sales',
        targetTab: 'truck_dispatch',
        highlightId: trip.id,
        actor: currentUser,
        metadata: { tripId: trip.id, totalExpected: postEval.totalExpected, openReturn: '1' },
      });

      setInlineSettlementFeedback(
        isAr
          ? `✓ تم حفظ الأمر #${savedOrder.serial || savedId} وتسوية الفرق تلقائياً — المرتجع المتوقع الآن (${fmtCtn(postEval.totalExpected)} كرتونة) بانتظار استلام المخزن.`
          : `✓ Order #${savedOrder.serial || savedId} saved & discrepancy cleared automatically — Expected (${fmtCtn(postEval.totalExpected)} ctn) is now awaiting Warehouse receipt.`
      );
      return;
    }

    if (dispatchDoc?.whReturnConfirmedAt && !postEval.hasVariance) {
      setInlineSettlementFeedback(
        isAr
          ? `✓ تم حفظ الأمر #${savedOrder.serial || savedId} وتطابقت الكميات (الفرق = 0) — يمكنك الآن الضغط على "تأكيد مطابقة الحسابات وإقفال الرحلة ✓".`
          : `✓ Order #${savedOrder.serial || savedId} saved and quantities match (Δ = 0) — click "Confirm Accounting Alignment & Close ✓" to finalize.`
      );
    } else if (isAcctFirstDiscrepancy && postEval.hasOrderMismatch) {
      setInlineSettlementFeedback(
        isAr
          ? `تم حفظ الأمر #${savedOrder.serial || savedId} — المرتجع المتوقع الآن من أوامر البيع (${fmtCtn(nextLiveTotal)} كرتونة) مقابل المصرح به (${fmtCtn(postEval.totalExpected)} كرتونة). لا يزال هناك فرق متبقٍ يلزم تسويته قبل إغلاق المهمة.`
          : `Saved Order #${savedOrder.serial || savedId} — Live Sales Orders expected return is now ${fmtCtn(nextLiveTotal)} ctn vs your declared ${fmtCtn(postEval.totalExpected)} ctn. A remaining discrepancy still needs settlement before clearing to Warehouse.`
      );
    } else {
      setInlineSettlementFeedback(
        isAr
          ? `تم حفظ الأمر #${savedOrder.serial || savedId} وتحديث المرتجع المتوقع (${fmtCtn(postEval.totalExpected)} كرتونة).`
          : `Saved Order #${savedOrder.serial || savedId} and refreshed expected return (${fmtCtn(postEval.totalExpected)} ctn).`
      );
    }
  };

  const handleAdminReopenReconciled = async () => {
    if (!returnAuthority.isGeneralAdmin) return;
    if (!adminReopenReason.trim()) {
      alert(isAr ? 'يرجى كتابة سبب إعادة فتح المطابقة للتعديل.' : 'Please provide an audit reason to reopen reconciled return.');
      return;
    }
    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);
      const reopenAudit = {
        id: `AUD-RO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action: 'truck_return_admin_reopened',
        summaryAr: `إعادة فتح مطابقة مرتجع رحلة #${trip.loadingOrderNumber} بواسطة المدير العام — السبب: ${adminReopenReason.trim()}`,
        summaryEn: `General Admin reopened reconciled return for Trip #${trip.loadingOrderNumber} — Reason: ${adminReopenReason.trim()}`,
        changes: {
          metadata: [
            { labelAr: 'حالة المطابقة', labelEn: 'Handshake Status', oldValue: 'reconciled', newValue: 'discrepancy_pending_accounting' },
            { labelAr: 'سبب إعادة الفتح', labelEn: 'Reopen Reason', oldValue: '—', newValue: adminReopenReason.trim() },
          ],
          lineChanges: [],
        },
      };
      const finalizeFn = httpsCallable(functions, 'salesFinalizeReturnHandshake');
      await finalizeFn({
        tripId: trip.id,
        actionType: 'admin_reopen',
        reason: adminReopenReason.trim(),
        auditEntry: reopenAudit,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
      setAdminReopenOpen(false);
      setAdminReopenReason('');
    } catch (err) {
      console.error('Failed reopening return:', err);
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitReturn = async (submitRole) => {
    // Hard Separation-of-Duties & Lock Enforcement
    if (submitRole === 'warehouse' && !fieldLocks.canSubmitWhSide) {
      alert(fieldLocks.selfApprovalReasonAr || (isAr ? 'غير مصرح لك بتسجيل استلام المخزن.' : 'Not authorized for Warehouse receipt.'));
      return;
    }
    if (submitRole === 'accountant' && !fieldLocks.canSubmitAcctSide) {
      alert(fieldLocks.selfApprovalReasonAr || (isAr ? 'غير مصرح لك بتسجيل تأكيد المحاسبة.' : 'Not authorized for Accounting submission.'));
      return;
    }
    if ((submitRole === 'admin_settle_both' || submitRole === 'admin_writeoff') && !returnAuthority.isGeneralAdmin) {
      alert(isAr ? 'هذا الإجراء متاح للمدير العام فقط.' : 'General Admin permission required.');
      return;
    }
    if (submitRole === 'warehouse' && fieldLocks.requiresWhAmendReason && !whAmendReason.trim()) {
      alert(isAr ? 'يرجى إدخال سبب تعديل الكميات المستلمة مسبقاً.' : 'Please enter an amendment reason for modifying confirmed Warehouse quantities.');
      return;
    }
    if (submitRole === 'admin_writeoff' && !adminWriteOffReason.trim()) {
      alert(isAr ? 'يرجى إدخال سبب تسوية الفرق / تحميل عهدة السائق.' : 'Please enter an audit reason for variance write-off.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const actorId = currentUser?.id || 'system';
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || actorId)
        : (currentUser?.name || currentUser?.nameAr || actorId);

      const finalEval = evaluateReturnHandshake({
        returnByCol,
        liveExpectedByCol,
        actorRole: submitRole,
        alreadyWhConfirmed: Boolean(dispatchDoc?.whReturnConfirmedAt),
        alreadyAcctConfirmed: Boolean(dispatchDoc?.accountantReturnSubmittedAt),
        isGeneralAdmin: Boolean(returnAuthority.isGeneralAdmin),
      });

      const dispRef = doc(db, 'truck_dispatches', trip.id);
      const batch = writeBatch(db);

      const effStockRetDate = formatDateStr(stockReturnDate) || todayStr || formatDateStr(new Date());
      const hasPrevReturn = Boolean(
        dispatchDoc?.whReturnConfirmedAt || dispatchDoc?.accountantReturnSubmittedAt || dispatchDoc?.stockReturnDate
      );
      const prevStatus = dispatchDoc?.returnHandshakeStatus || 'none';
      const prevRetDate = formatDateStr(dispatchDoc?.stockReturnDate) || '';
      const prevRetNotes = String(dispatchDoc?.returnNotes || '').trim();
      const nextRetNotes = returnNotes.trim();
      const isSecondPartySignoff =
        (submitRole === 'warehouse' && !dispatchDoc?.whReturnConfirmedAt) ||
        (submitRole === 'accountant' && !dispatchDoc?.accountantReturnSubmittedAt) ||
        submitRole === 'admin_settle_both' ||
        submitRole === 'admin_writeoff';

      const retMetaChanges = [];
      if (!hasPrevReturn || prevRetDate !== effStockRetDate) {
        retMetaChanges.push({
          labelAr: 'تاريخ إضافة المرتجع للمخزن',
          labelEn: 'Stock Return Date',
          oldValue: prevRetDate || '—',
          newValue: effStockRetDate,
        });
      }
      if (!hasPrevReturn || prevStatus !== finalEval.nextStatus) {
        retMetaChanges.push({
          labelAr: 'حالة المطابقة',
          labelEn: 'Handshake Status',
          oldValue: prevStatus,
          newValue: finalEval.nextStatus,
        });
      }
      if (prevRetNotes !== nextRetNotes) {
        retMetaChanges.push({
          labelAr: 'ملاحظات المرتجع',
          labelEn: 'Return Notes',
          oldValue: prevRetNotes || '—',
          newValue: nextRetNotes || '—',
        });
      }
      if (whAmendReason.trim()) {
        retMetaChanges.push({
          labelAr: 'سبب تعديل استلام المخزن',
          labelEn: 'WH Amendment Reason',
          oldValue: '—',
          newValue: whAmendReason.trim(),
        });
      }
      if (submitRole === 'admin_writeoff' && adminWriteOffReason.trim()) {
        retMetaChanges.push({
          labelAr: 'سبب التسوية الإدارية للفروقات',
          labelEn: 'Admin Write-Off Reason',
          oldValue: '—',
          newValue: adminWriteOffReason.trim(),
        });
      }

      const retLineChanges = [];
      columns.forEach((c) => {
        const rec = finalEval.normalizedByCol[c.colKey] || {};
        const prevRec = dispatchDoc?.returnByCol?.[c.colKey] || {};
        if (!hasPrevReturn) {
          if (rec.accountantExpectedTotal > 0 || rec.whReceivedTotal > 0) {
            retLineChanges.push({
              productCode: c.optionCode || c.productCode,
              productNameAr: c.nameAr,
              productNameEn: c.nameEn,
              type: 'added',
              detailAr: `متوقع: ${rec.accountantExpectedTotal || 0} | مستلم: ${rec.whReceivedTotal || 0} | فرق: ${rec.variance || 0}`,
              detailEn: `Expected: ${rec.accountantExpectedTotal || 0} | Received: ${rec.whReceivedTotal || 0} | Δ ${rec.variance || 0}`,
            });
          }
        } else {
          const pExpExt = Number(prevRec.expectedExtras || 0);
          const pExpCli = Number(prevRec.expectedClientReturns || 0);
          const pRecExt = Number(prevRec.whReceivedExtras || 0);
          const pRecCli = Number(prevRec.whReceivedClientReturns || 0);
          const partsAr = [];
          const partsEn = [];
          if (Math.abs(pExpExt - (rec.expectedExtras || 0)) > 1e-4) {
            partsAr.push(`زيادات متوقعة: ${pExpExt} → ${rec.expectedExtras}`);
            partsEn.push(`Exp Extras: ${pExpExt} → ${rec.expectedExtras}`);
          }
          if (Math.abs(pExpCli - (rec.expectedClientReturns || 0)) > 1e-4) {
            partsAr.push(`مرتجع عملاء متوقع: ${pExpCli} → ${rec.expectedClientReturns}`);
            partsEn.push(`Exp Client Ret: ${pExpCli} → ${rec.expectedClientReturns}`);
          }
          if (Math.abs(pRecExt - (rec.whReceivedExtras || 0)) > 1e-4) {
            partsAr.push(`استلام زيادات: ${pRecExt} → ${rec.whReceivedExtras}`);
            partsEn.push(`Rec Extras: ${pRecExt} → ${rec.whReceivedExtras}`);
          }
          if (Math.abs(pRecCli - (rec.whReceivedClientReturns || 0)) > 1e-4) {
            partsAr.push(`استلام عملاء: ${pRecCli} → ${rec.whReceivedClientReturns}`);
            partsEn.push(`Rec Client Ret: ${pRecCli} → ${rec.whReceivedClientReturns}`);
          }
          if (partsAr.length > 0) {
            retLineChanges.push({
              productCode: c.optionCode || c.productCode,
              productNameAr: c.nameAr,
              productNameEn: c.nameEn,
              type: 'modified',
              detailAr: partsAr.join(' | '),
              detailEn: partsEn.join(' | '),
            });
          }
        }
      });

      if (hasPrevReturn && !isSecondPartySignoff && retMetaChanges.length === 0 && retLineChanges.length === 0) {
        onClose();
        return;
      }

      const returnAuditEntry = {
        id: `AUD-TR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowIso,
        userId: actorId,
        userName: actorName,
        performedBy: actorName,
        performedById: actorId,
        action:
          submitRole === 'admin_writeoff'
            ? 'truck_return_admin_writeoff'
            : submitRole === 'admin_settle_both'
            ? 'truck_return_admin_dual_settled'
            : submitRole === 'accountant'
            ? 'truck_return_accountant_submitted'
            : 'truck_return_wh_confirmed',
        summaryAr:
          submitRole === 'accountant'
            ? `اعتماد المحاسب للمرتجع (${finalEval.totalExpected} كرتونة) — حالة: ${finalEval.nextStatus}`
            : submitRole === 'admin_writeoff'
            ? `تسوية إدارية لفروقات مرتجع رحلة #${trip.loadingOrderNumber} (المستلم ${finalEval.totalReceived} / المتوقع ${finalEval.totalExpected}) — السبب: ${adminWriteOffReason.trim()}`
            : submitRole === 'admin_settle_both'
            ? `اعتماد وإقفال القسمين بواسطة المدير العام لرحلة #${trip.loadingOrderNumber} (${finalEval.totalReceived} كرتونة)`
            : `استلام مخزن التام الفعلي (${finalEval.totalReceived} / ${finalEval.totalExpected}) — تاريخ المخزن: ${effStockRetDate}${whAmendReason.trim() ? ` — سبب التعديل: ${whAmendReason.trim()}` : ''}`,
        summaryEn:
          submitRole === 'accountant'
            ? `Accountant submitted/aligned returns (${finalEval.totalExpected} ctn) -> ${finalEval.nextStatus}`
            : submitRole === 'admin_writeoff'
            ? `General Admin variance write-off (${finalEval.totalReceived}/${finalEval.totalExpected} ctn) — ${adminWriteOffReason.trim()}`
            : submitRole === 'admin_settle_both'
            ? `General Admin settled both sides (${finalEval.totalReceived} ctn) -> reconciled`
            : `WH Custodian recorded actual receipt (${finalEval.totalReceived}/${finalEval.totalExpected} ctn) — Stock Date: ${effStockRetDate}${whAmendReason.trim() ? ` — Amend: ${whAmendReason.trim()}` : ''}`,
        changes: {
          metadata: retMetaChanges,
          lineChanges: retLineChanges,
        },
      };

      const payload = {
        id: trip.id,
        tripKey: trip.tripKey,
        loadingDate: trip.loadingDate,
        loadingOrderNumber: trip.loadingOrderNumber,
        vehicleId: trip.primaryVehicleId || dispatchDoc?.vehicleId || '',
        vehicleName: trip.vehicleDisplayName || dispatchDoc?.vehicleName || '',
        orderIds: Array.isArray(dispatchDoc?.orderIds) && dispatchDoc.orderIds.length > 0
          ? dispatchDoc.orderIds
          : trip.orders.map((o) => o.id),
        columns:
          Array.isArray(dispatchDoc?.columns) && dispatchDoc.columns.length > 0
            ? dispatchDoc.columns
            : buildTripDispatchMatrix({ tripOrders: trip.orders, finishedProducts }).columns.map((c) => ({
                colKey: c.colKey,
                productCode: c.productCode,
                optionSuffix: c.optionSuffix,
                optionCode: c.optionCode,
                packagingRatio: c.packagingRatio,
                nameAr: c.nameAr,
                nameEn: c.nameEn,
                lockedQty: c.lockedQty || 0,
                extraQty: c.extraQty || 0,
                totalDispatchedQty: roundQty((c.lockedQty || 0) + (c.extraQty || 0)),
              })),
        dispatchStatus:
          finalEval.nextStatus === 'reconciled'
            ? 'returned'
            : dispatchDoc?.dispatchStatus || 'dispatched',
        returnHandshakeStatus: finalEval.nextStatus,
        returnByCol: finalEval.normalizedByCol,
        stockReturnDate: effStockRetDate,
        returnNotes: returnNotes.trim(),
        returnContentUpdatedAt: nowIso,
        auditTrail: [...(Array.isArray(dispatchDoc?.auditTrail) ? dispatchDoc.auditTrail : []), returnAuditEntry],
        updatedBy: actorId,
        updatedByName: actorName,
        updatedAt: nowIso,
      };

      if (submitRole === 'accountant') {
        payload.accountantReturnSubmittedBy = actorId;
        payload.accountantReturnSubmittedByName = actorName;
        payload.accountantReturnSubmittedAt = nowIso;
        if (returnNotes.trim()) payload.accountantReturnNotes = returnNotes.trim();
      } else if (submitRole === 'warehouse') {
        payload.whReturnConfirmedBy = actorId;
        payload.whReturnConfirmedByName = actorName;
        payload.whReturnConfirmedAt = nowIso;
        if (returnNotes.trim()) payload.whReturnNotes = returnNotes.trim();
      } else if (submitRole === 'admin_settle_both' || submitRole === 'admin_writeoff') {
        if (!dispatchDoc?.whReturnConfirmedAt) {
          payload.whReturnConfirmedBy = actorId;
          payload.whReturnConfirmedByName = actorName;
          payload.whReturnConfirmedAt = nowIso;
        }
        payload.accountantReturnSubmittedBy = actorId;
        payload.accountantReturnSubmittedByName = actorName;
        payload.accountantReturnSubmittedAt = nowIso;
        if (submitRole === 'admin_writeoff') {
          payload.adminWriteOffReason = adminWriteOffReason.trim();
          payload.adminWriteOffBy = actorId;
          payload.adminWriteOffByName = actorName;
          payload.adminWriteOffAt = nowIso;
        }
      }

      // Close open settlement tasks automatically when reconciled with 0 variance or admin settlement
      if (finalEval.nextStatus === 'reconciled' && Array.isArray(dispatchDoc?.returnSettlementTasks)) {
        payload.returnSettlementTasks = dispatchDoc.returnSettlementTasks.map((t) =>
          t.status === 'open'
            ? {
                ...t,
                status: 'completed',
                completedAt: nowIso,
                completedBy: actorId,
                completedByName: actorName,
              }
            : t
        );
      }

      const { auditTrail: _unusedAudit, ...payloadWithoutAudit } = payload;
      if (submitRole === 'admin_settle_both' || submitRole === 'admin_writeoff') {
        const finalizeFn = httpsCallable(functions, 'salesFinalizeReturnHandshake');
        await finalizeFn({
          tripId: trip.id,
          actionType: submitRole,
          reason: adminWriteOffReason.trim(),
          payload: payloadWithoutAudit,
          auditEntry: returnAuditEntry,
          currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
        });
      } else {
        const submitStepFn = httpsCallable(functions, 'salesSubmitReturnStep');
        await submitStepFn({
          mode: 'submit_step',
          submitRole,
          tripId: trip.id,
          payload: payloadWithoutAudit,
          returnAuditEntry,
          currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
        });
      }

      // Automate Phase 2A Permission-Aware Warehouse <-> Accountant Handshake & Tasks
      const tripLabel = `#${trip.loadingOrderNumber} (${trip.loadingDate})`;

      if (finalEval.nextStatus === 'pending_wh_confirm') {
        await dispatchWorkflowEvent({
          eventKey: 'trip_return_expected_warehouse',
          docId: trip.id,
          docNumber: `LO-${trip.loadingOrderNumber}`,
          titleAr: `مطلوب تأكيد استلام مرتجعات رحلة ${tripLabel}`,
          titleEn: `Confirm Physical Receipt for Trip ${tripLabel}`,
          messageAr: `سجل المحاسب (${actorName}) مرتجعات متوقعة بإجمالي ${finalEval.totalExpected} كرتونة. يرجى الفحص وتأكيد الاستلام الفعلي بالمخزن.`,
          messageEn: `Accountant (${actorName}) registered ${finalEval.totalExpected} expected cartons. Please confirm physical receipt in FG warehouse.`,
          targetModule: 'sales',
          targetTab: 'truck_dispatch',
          highlightId: trip.id,
          actor: currentUser,
          metadata: { tripId: trip.id, totalExpected: finalEval.totalExpected, openReturn: '1' },
        });
      } else if (finalEval.nextStatus === 'pending_accounting_confirm') {
        await Promise.all([
          completeActionRequired({
            actionType: 'truck_return_wh_confirm',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH confirmed actual receipt (${finalEval.totalReceived} ctn)`,
          }),
          completeActionRequired({
            actionType: 'trip_return_expected_warehouse',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH confirmed actual receipt (${finalEval.totalReceived} ctn)`,
          }),
        ]);

        await dispatchWorkflowEvent({
          eventKey: 'trip_return_alignment_accounting',
          docId: trip.id,
          docNumber: `LO-${trip.loadingOrderNumber}`,
          titleAr: `مطلوب مطابقة المحاسبة لاستلام مرتجع رحلة ${tripLabel}`,
          titleEn: `Accounting Alignment Needed — Trip ${tripLabel}`,
          messageAr: `أتم أمين المخزن (${actorName}) الاستلام الفعلي لمرتجعات الرحلة (${finalEval.totalReceived} كرتونة مطابقة للمتوقع — تاريخ المخزن: ${effStockRetDate}). يرجى تأكيد المطابقة النهائية.`,
          messageEn: `Warehouse (${actorName}) confirmed ${finalEval.totalReceived} returned cartons (Stock Date: ${effStockRetDate}). Accounting alignment sign-off required to close trip.`,
          targetModule: 'sales',
          targetTab: 'truck_dispatch',
          highlightId: trip.id,
          actor: currentUser,
          metadata: { tripId: trip.id, totalReceived: finalEval.totalReceived, stockReturnDate: effStockRetDate, openReturn: '1' },
        });
      } else if (finalEval.nextStatus === 'discrepancy_pending_accounting') {
        await Promise.all([
          completeActionRequired({
            actionType: 'truck_return_wh_confirm',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH submitted receipt with variance (${finalEval.totalVariance} ctn)`,
          }),
          completeActionRequired({
            actionType: 'trip_return_expected_warehouse',
            docId: trip.id,
            completedBy: actorId,
            completedByName: actorName,
            resolutionNote: `WH submitted receipt with variance (${finalEval.totalVariance} ctn)`,
          }),
        ]);

        const varDetails = finalEval.discrepancies
          .map((d) => `${d.colKey}: (${d.received}/${d.expected}, ${d.variance > 0 ? '+' : ''}${d.variance})`)
          .join(', ');

        await dispatchWorkflowEvent({
          eventKey: 'trip_return_variance_accounting',
          docId: trip.id,
          docNumber: `LO-${trip.loadingOrderNumber}`,
          titleAr: `فروقات مرتجع رحلة ${tripLabel} — يتطلب تسوية أوامر البيع`,
          titleEn: `Return Variance Alert — Trip ${tripLabel}`,
          messageAr:
            submitRole === 'warehouse'
              ? `استلم أمين المخزن (${actorName}) ${finalEval.totalReceived} كرتونة مقابل ${finalEval.totalExpected} متوقع (فرق: ${finalEval.totalVariance}). الكميات المستلمة مثبتة؛ يرجى مراجعة وتسوية أوامر البيع. ${varDetails}`
              : `توجد فروقات أوامر بيع لمرتجع رحلة ${tripLabel}. يرجى تعديل أو إضافة أوامر البيع لتسوية الفرق.`,
          messageEn:
            submitRole === 'warehouse'
              ? `Warehouse (${actorName}) locked ${finalEval.totalReceived} ctn vs ${finalEval.totalExpected} expected (Δ ${finalEval.totalVariance}). Accounting settlement required via Sales Orders.`
              : `Sales Order mismatch detected for Trip ${tripLabel} returns.`,
          targetModule: 'sales',
          targetTab: 'truck_dispatch',
          highlightId: trip.id,
          actor: currentUser,
          metadata: {
            tripId: trip.id,
            totalExpected: finalEval.totalExpected,
            totalReceived: finalEval.totalReceived,
            totalVariance: finalEval.totalVariance,
            discrepancies: finalEval.discrepancies,
            openReturn: '1',
          },
        });
      } else if (finalEval.nextStatus === 'reconciled') {
        await Promise.all([
          completeActionRequired({ actionType: 'truck_return_wh_confirm', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_expected_warehouse', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'truck_return_accountant_review', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_variance_accounting', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_alignment_accounting', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
          completeActionRequired({ actionType: 'trip_return_order_settlement_task', docId: trip.id, completedBy: actorId, completedByName: actorName, resolutionNote: 'Reconciled' }),
        ]);

        const notifyIds = [
          dispatchDoc?.whReturnConfirmedBy,
          dispatchDoc?.accountantReturnSubmittedBy,
        ].filter((id) => id && id !== actorId);

        await createNotification({
          type: 'success',
          title: `تم إقفال ومطابقة مرتجعات رحلة ${tripLabel}`,
          titleEn: `Trip Return Reconciled ${tripLabel}`,
          message: `تم تأكيد القسمين وإقفال المرتجع بإجمالي ${finalEval.totalReceived} كرتونة — بواسطة ${actorName}`,
          messageEn: `Two-party return alignment closed: ${finalEval.totalReceived} cartons — Confirmed by ${actorName}`,
          targetTab: 'truck_dispatch',
          targetModule: 'sales',
          highlightId: trip.id,
          createdBy: actorId,
          createdByName: actorName,
          targetUserIds: notifyIds,
          targetRoles: ['general_admin'],
        });
      }

      if (onSaved) onSaved(payload, finalEval);
      onClose();
    } catch (err) {
      console.error('Error submitting return inspection:', err);
      alert(isAr ? `حدث خطأ أثناء حفظ المرتجع: ${err.message}` : `Error saving return inspection: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sumField = (field) =>
    roundQty(columns.reduce((s, c) => s + Number(returnByCol[c.colKey]?.[field] || 0), 0));

  const whConfDateStr = dispatchDoc?.whReturnConfirmedAt
    ? String(dispatchDoc.whReturnConfirmedAt).slice(0, 10)
    : '';
  const isDeferredStocktakeDate = Boolean(
    stockReturnDate && (whConfDateStr ? stockReturnDate > whConfDateStr : stockReturnDate > (todayStr || formatDateStr(new Date())))
  );

  const detectedRoleBadge = (() => {
    if (returnAuthority.detectedRole === 'general_admin') {
      return {
        ar: 'مدير عام (اعتماد مزدوج)',
        en: 'General Admin (Dual Authority)',
        cls: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
      };
    }
    if (returnAuthority.detectedRole === 'dual_explicit') {
      return {
        ar: 'صلاحية مخزن + محاسبة (طرف واحد/رحلة)',
        en: 'Dual Explicit (1 Side / Trip)',
        cls: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
      };
    }
    if (returnAuthority.detectedRole === 'warehouse') {
      return {
        ar: 'أمين مخزن التام (استلام فعلي فقط)',
        en: 'WH Custodian (Actual Receipt Only)',
        cls: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
      };
    }
    if (returnAuthority.detectedRole === 'accountant') {
      return {
        ar: 'قسم الحسابات (مراجعة ومطابقة)',
        en: 'Accounting Dept (Expected & Alignment)',
        cls: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40',
      };
    }
    return {
      ar: 'عرض فقط (بدون صلاحية اعتماد)',
      en: 'Read-Only Viewer',
      cls: 'bg-slate-600/40 text-slate-200 border-slate-400/40',
    };
  })();

  const statusText =
    dispatchDoc?.returnHandshakeStatus === 'reconciled'
      ? (isAr ? 'مطابق ومقفل بتأكيد القسمين ✓' : 'Reconciled by Both Depts ✓')
      : dispatchDoc?.returnHandshakeStatus === 'discrepancy_pending_accounting'
      ? (isAr ? 'فروقات بانتظار تسوية الحسابات وأوامر البيع ⚠️' : 'Discrepancy — Accounting Order Settlement Required')
      : dispatchDoc?.returnHandshakeStatus === 'pending_accounting_confirm'
      ? (isAr ? 'تم استلام المخزن — بانتظار تأكيد المحاسبة للمطابقة' : 'WH Received — Pending Accounting Alignment')
      : dispatchDoc?.returnHandshakeStatus === 'pending_wh_confirm'
      ? (isAr ? 'تم تسجيل المحاسب — بانتظار الاستلام الفعلي بالمخزن' : 'Acct Submitted — Pending WH Physical Receipt')
      : (isAr ? 'بانتظار تسجيل الطرفين (المخزن + الحسابات)' : 'Pending Both Depts (WH + Accounting)');

  const existingSettlementTasks = Array.isArray(dispatchDoc?.returnSettlementTasks)
    ? [...dispatchDoc.returnSettlementTasks].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    : [];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={onClose}
      >
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-start animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black">
                  {isAr
                    ? `استلام ومطابقة مرتجعات الشاحنة — رحلة #${trip.loadingOrderNumber}`
                    : `Truck Return & Receiving Reconciliation — Trip #${trip.loadingOrderNumber}`}
                </h3>
                <span className="px-2 py-0.5 rounded-lg bg-white/10 font-mono text-[11px] font-bold">
                  {trip.loadingDate}
                </span>
                <span className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-black ${detectedRoleBadge.cls}`}>
                  {isAr ? detectedRoleBadge.ar : detectedRoleBadge.en}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                {trip.vehicleDisplayName} • {statusText}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Two-Party Alignment Sign-off Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              className={`rounded-2xl border p-2.5 flex items-center justify-between gap-2 text-xs ${
                fieldLocks.whAlreadyConfirmed
                  ? 'bg-teal-50/75 border-teal-300 text-teal-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <PackageCheck className={`w-4 h-4 shrink-0 ${fieldLocks.whAlreadyConfirmed ? 'text-teal-600' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className="font-black">{isAr ? '١. تأكيد أمين مخزن التام' : '1. Warehouse Physical Receipt'}</div>
                  <div className="text-[10.5px] font-bold truncate">
                    {fieldLocks.whAlreadyConfirmed
                      ? (isAr
                          ? `✓ تم الاستلام بواسطة ${dispatchDoc.whReturnConfirmedByName || 'المخزن'}`
                          : `✓ Confirmed by ${dispatchDoc.whReturnConfirmedByName || 'Warehouse'}`)
                      : (isAr ? '⏳ بانتظار تأكيد الكميات المستلمة فعلياً' : '⏳ Pending physical receipt confirmation')}
                  </div>
                </div>
              </div>
              {fieldLocks.whAlreadyConfirmed && dispatchDoc?.stockReturnDate && (
                <span
                  className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-black border shrink-0 ${
                    isDeferredStocktakeDate
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-teal-800 border-teal-200'
                  }`}
                >
                  {isDeferredStocktakeDate
                    ? (isAr ? `مؤجل للجرد: ${dispatchDoc.stockReturnDate}` : `Deferred: ${dispatchDoc.stockReturnDate}`)
                    : (isAr ? `رصيد المخزن: ${dispatchDoc.stockReturnDate}` : `Stock: ${dispatchDoc.stockReturnDate}`)}
                </span>
              )}
            </div>

            <div
              className={`rounded-2xl border p-2.5 flex items-center justify-between gap-2 text-xs ${
                fieldLocks.isReconciled
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                  : evalRes.hasVariance
                  ? 'bg-rose-50/75 border-rose-300 text-rose-950'
                  : fieldLocks.acctAlreadyConfirmed
                  ? 'bg-indigo-50/75 border-indigo-300 text-indigo-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardCheck
                  className={`w-4 h-4 shrink-0 ${
                    fieldLocks.isReconciled
                      ? 'text-emerald-600'
                      : evalRes.hasVariance
                      ? 'text-rose-600'
                      : fieldLocks.acctAlreadyConfirmed
                      ? 'text-indigo-600'
                      : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-black">{isAr ? '٢. مطابقة الإدارة المالية والحسابات' : '2. Accounting Alignment'}</div>
                  <div className="text-[10.5px] font-bold truncate">
                    {fieldLocks.isReconciled
                      ? (isAr
                          ? `✓ تمت المطابقة بواسطة ${dispatchDoc.accountantReturnSubmittedByName || 'المحاسبة'}`
                          : `✓ Aligned by ${dispatchDoc.accountantReturnSubmittedByName || 'Accounting'}`)
                      : evalRes.hasVariance
                      ? (isAr ? '⚠️ يوجد فرق — يجب تسوية أوامر البيع' : '⚠️ Discrepancy — settle via Sales Orders')
                      : fieldLocks.acctAlreadyConfirmed
                      ? (isAr
                          ? `✓ سُجل المتوقع بواسطة ${dispatchDoc.accountantReturnSubmittedByName || 'المحاسبة'}`
                          : `✓ Expected by ${dispatchDoc.accountantReturnSubmittedByName || 'Accounting'}`)
                      : (isAr ? '⏳ بانتظار تأكيد المطابقة من المحاسبة' : '⏳ Pending Accounting alignment')}
                  </div>
                </div>
              </div>
              {fieldLocks.isReconciled && (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black shrink-0">
                  {isAr ? 'مقفل ✓' : 'Locked ✓'}
                </span>
              )}
            </div>
          </div>

          {/* Separation of Duties & Lock Notices */}
          {fieldLocks.blockedBySelfApproval && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-900 font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{isAr ? fieldLocks.selfApprovalReasonAr : fieldLocks.selfApprovalReasonEn}</span>
            </div>
          )}

          {actorMode === 'accountant' && fieldLocks.whAlreadyConfirmed && !fieldLocks.blockedBySelfApproval && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-teal-50 border border-teal-300 text-xs text-teal-950 font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                {isAr
                  ? `الكميات المستلمة فعلياً مثبتة ومقفولة بواسطة أمين المخزن (${dispatchDoc?.whReturnConfirmedByName || 'المخزن'}) ولا يمكن تعديلها من المحاسبة. تظهر أرقام المخزن للقراءة فقط للمقارنة مع أوامر البيع.`
                  : fieldLocks.whLockedForAccountantEn}
              </span>
            </div>
          )}

          {/* Mode Switcher (Shown ONLY for General Admin or explicit dual-department grant) + Stock Return Date */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
            <div className="flex items-center gap-1.5">
              {returnAuthority.canAccessBothModes ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActorMode('warehouse')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                      actorMode === 'warehouse'
                        ? 'bg-teal-600 text-white border-teal-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? 'وضع أمين مخزن التام (الاستلام الفعلي)' : 'Warehouse Mode (Actual Receipt)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActorMode('accountant')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                      actorMode === 'accountant'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? 'وضع المحاسب (المتوقع والمطابقة)' : 'Accountant Mode (Expected & Alignment)'}
                  </button>
                </>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-800">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {actorMode === 'warehouse'
                      ? (isAr ? 'وضع مقيد تلقائياً: أمين مخزن التام (الاستلام الفعلي فقط)' : 'Locked Role: Warehouse Custodian (Actual Receipt Only)')
                      : (isAr ? 'وضع مقيد تلقائياً: المحاسبة (مراجعة ومطابقة فقط)' : 'Locked Role: Accounting (Alignment & Order Settlement Only)')}
                  </span>
                </div>
              )}
            </div>

            {actorMode === 'warehouse' && fieldLocks.canEditWhFields && (
              <button
                type="button"
                onClick={handleMatchExactFromExpected}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'تطابق تام مع المتوقع ✓' : 'Match Exact Expected ✓'}</span>
              </button>
            )}

            {/* Stock Return Date (editable ONLY by Warehouse; supports EOD Stocktake / جرد deferral) */}
            <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-300">
              <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <label className="text-[11px] font-black text-slate-700 whitespace-nowrap">
                {isAr ? 'تاريخ إضافة المرتجع للمخزن:' : 'Stock Return Date:'}
              </label>
              <input
                type="date"
                disabled={!fieldLocks.canEditWhFields}
                value={stockReturnDate}
                onChange={(e) => setStockReturnDate(e.target.value)}
                className="text-xs font-mono font-bold text-slate-900 outline-none bg-transparent disabled:text-slate-500 disabled:cursor-not-allowed"
              />
              {isDeferredStocktakeDate && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                  {isAr ? 'مؤجل لما بعد الجرد' : 'Deferred (EOD Count)'}
                </span>
              )}
            </div>
          </div>

          {/* Return Verification Matrix */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-2xs">
            <table className="w-full border-collapse text-xs text-start min-w-[680px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-start font-black text-slate-800 sticky start-0 bg-slate-100 z-10 min-w-[230px] border-e border-slate-200">
                    {isAr ? 'بند المرتجع / نوع أمر البيع' : 'Return Stream / Order Type'}
                  </th>
                  {columns.map((col) => (
                    <th key={col.colKey} className="py-2 px-2.5 text-center min-w-[130px] border-e border-slate-200/70">
                      <div className="font-extrabold text-slate-900 text-[11px]">{isAr ? col.shortNameAr : col.shortNameEn}</div>
                      <div className="text-[10px] font-bold text-indigo-700">{isAr ? col.optionNameAr : col.optionNameEn}</div>
                      <div className="text-[9px] font-mono text-slate-400">{col.optionCode}</div>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-center font-black text-slate-800 min-w-[100px]">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {/* 1. Extras Dispatched Reference + Expected / WH Actual */}
                <tr className="bg-teal-50/50">
                  <td className="py-2.5 px-3 sticky start-0 bg-teal-50 border-e border-teal-200 z-10">
                    <div className="font-black text-teal-900">{isAr ? '١. مرتجع زيادات الرحلة (Extras)' : '1. Trip Extras Return'}</div>
                    <span className="text-[10px] text-teal-700 font-bold">
                      {actorMode === 'accountant'
                        ? fieldLocks.expectedDerivedLiveFromOrders
                          ? (isAr ? 'محسوب آلياً من أوامر البيع مقابل استلام المخزن' : 'Live from Orders vs Locked WH Receipt')
                          : (isAr ? 'متوقع عودته حسب صرف التحميل' : 'Expected from dispatch slip')
                        : (isAr ? 'الكمية السليمة المستلمة فعلياً للمخزن' : 'Good cartons returned to shelf')}
                    </span>
                  </td>
                  {columns.map((col) => {
                    const cell = returnByCol[col.colKey] || {};
                    const settledSold = Number(liveExpectedByCol[col.colKey]?.settledExtrasSold || 0);
                    return (
                      <td key={col.colKey} className="py-2 px-2 text-center border-e border-teal-100 space-y-1">
                        <div className="text-[10px] text-slate-500 font-mono">
                          {isAr ? 'منصرف:' : 'Out:'} <strong>{fmtCtn(col.dispatchedExtrasQty)}</strong>
                          {settledSold > 0 && (
                            <span className="text-emerald-700 font-bold ms-1">
                              (-{fmtCtn(settledSold)})
                            </span>
                          )}
                        </div>
                        {actorMode === 'accountant' ? (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditAcctExpectedFields}
                              value={cell.expectedExtras ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'expectedExtras', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditAcctExpectedFields
                                  ? 'bg-white border-indigo-300'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            {fieldLocks.whAlreadyConfirmed && (
                              <div className="text-[10px] font-mono font-bold text-teal-800">
                                {isAr ? 'مستلم مخزن:' : 'WH Actual:'} <strong>{fmtCtn(cell.whReceivedExtras ?? 0)}</strong>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditWhFields}
                              value={cell.whReceivedExtras ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'whReceivedExtras', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditWhFields
                                  ? 'bg-white border-teal-400'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            <div className="text-[10px] font-mono text-indigo-700 font-bold">
                              {isAr ? 'متوقع:' : 'Exp:'} {fmtCtn(cell.expectedExtras ?? 0)}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono font-black text-teal-900">
                    <div>{fmtCtn(actorMode === 'accountant' ? sumField('expectedExtras') : sumField('whReceivedExtras'))}</div>
                    {actorMode === 'accountant' && fieldLocks.whAlreadyConfirmed && (
                      <div className="text-[10px] text-teal-700">{isAr ? 'مخزن:' : 'WH:'} {fmtCtn(sumField('whReceivedExtras'))}</div>
                    )}
                  </td>
                </tr>

                {/* 2. Client Returns Breakdown by Sales Order Type */}
                {clientReturnRows.map((cr) => (
                  <tr key={cr.orderId} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 sticky start-0 bg-white border-e border-slate-200 z-10">
                      <div className="font-extrabold text-slate-900 truncate max-w-[210px]">{cr.clientName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-500">#{cr.serial}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${ORDER_TYPE_META[cr.orderType]?.cls || ''}`}>
                          {isAr ? ORDER_TYPE_META[cr.orderType]?.ar : ORDER_TYPE_META[cr.orderType]?.en}
                        </span>
                        {cr.isPartialRejection && (
                          <span className="px-1 py-0.2 rounded bg-rose-100 text-rose-800 text-[9px] font-bold">
                            {isAr ? 'مرتجع جزئي' : 'Partial Rej.'}
                          </span>
                        )}
                        {cr.isUndeliveredReturn && (
                          <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                            {isAr ? 'غير مُسلَّم (مرتجع)' : 'Undelivered Return'}
                          </span>
                        )}
                      </div>
                    </td>
                    {columns.map((col) => {
                      const q = Number(cr.quantitiesByCol[col.colKey] || 0);
                      return (
                        <td key={col.colKey} className="py-2 px-2.5 text-center font-mono text-slate-700 border-e border-slate-100">
                          {q > 0 ? <span className="font-bold">{fmtCtn(q)}</span> : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-center font-mono font-black text-slate-900">{fmtCtn(cr.rowTotal)}</td>
                  </tr>
                ))}

                {/* 3. Client Returns Summary Input Row (Expected vs WH Received) */}
                <tr className="bg-indigo-50/40">
                  <td className="py-2.5 px-3 sticky start-0 bg-indigo-50/70 border-e border-indigo-200 z-10">
                    <div className="font-black text-indigo-950">
                      {isAr ? '٢. مرتجعات العملاء (حسب أوامر البيع)' : '2. Client Returns (Per Order Types)'}
                    </div>
                    <span className="text-[10px] text-indigo-700 font-bold">
                      {actorMode === 'accountant'
                        ? fieldLocks.expectedDerivedLiveFromOrders
                          ? (isAr ? 'محسوب آلياً من أوامر البيع مقابل استلام المخزن' : 'Live from Orders vs Locked WH Receipt')
                          : (isAr ? 'المرتجع المتوقع المسجل من المحاسبة' : 'Accountant Registered Expected Return')
                        : (isAr ? 'مرتجع العملاء المستلم فعلياً بالمخزن' : 'WH Received Client Returns')}
                    </span>
                  </td>
                  {columns.map((col) => {
                    const cell = returnByCol[col.colKey] || {};
                    return (
                      <td key={col.colKey} className="py-2 px-2 text-center border-e border-indigo-100 space-y-1">
                        {actorMode === 'accountant' ? (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditAcctExpectedFields}
                              value={cell.expectedClientReturns ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'expectedClientReturns', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditAcctExpectedFields
                                  ? 'bg-white border-indigo-300'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            {fieldLocks.whAlreadyConfirmed && (
                              <div className="text-[10px] font-mono font-bold text-teal-800">
                                {isAr ? 'مستلم مخزن:' : 'WH Actual:'} <strong>{fmtCtn(cell.whReceivedClientReturns ?? 0)}</strong>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!fieldLocks.canEditWhFields}
                              value={cell.whReceivedClientReturns ?? 0}
                              onChange={(e) => handleFieldChange(col.colKey, 'whReceivedClientReturns', e.target.value)}
                              className={`w-20 text-center font-mono text-xs font-black rounded-xl py-1 outline-none border ${
                                fieldLocks.canEditWhFields
                                  ? 'bg-white border-teal-400'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed'
                              }`}
                            />
                            <div className="text-[10px] font-mono text-indigo-700 font-bold">
                              {isAr ? 'متوقع:' : 'Exp:'} {fmtCtn(cell.expectedClientReturns ?? 0)}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono font-black text-indigo-950">
                    <div>{fmtCtn(actorMode === 'accountant' ? sumField('expectedClientReturns') : sumField('whReceivedClientReturns'))}</div>
                    {actorMode === 'accountant' && fieldLocks.whAlreadyConfirmed && (
                      <div className="text-[10px] text-teal-700">{isAr ? 'مخزن:' : 'WH:'} {fmtCtn(sumField('whReceivedClientReturns'))}</div>
                    )}
                  </td>
                </tr>
              </tbody>

              {/* FOOTER TOTALS + LIVE VARIANCE COMPARISON */}
              <tfoot className="border-t-2 border-slate-300">
                <tr className="bg-slate-100 font-bold text-slate-700">
                  <td className="py-2 px-3 sticky start-0 bg-slate-100 border-e border-slate-200 z-10">
                    {isAr ? 'إجمالي المرتجع المتوقع (أوامر البيع / المحاسب)' : 'Total Expected Return (Orders / Accountant)'}
                  </td>
                  {columns.map((col) => (
                    <td key={col.colKey} className="py-2 px-2.5 text-center font-mono border-e border-slate-200">
                      {fmtCtn(returnByCol[col.colKey]?.accountantExpectedTotal || 0)}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-center font-mono font-black text-slate-900">
                    {fmtCtn(evalRes.totalExpected)}
                  </td>
                </tr>

                <tr className="bg-slate-900 text-white font-black">
                  <td className="py-2.5 px-3 sticky start-0 bg-slate-900 border-e border-slate-700 z-10">
                    {isAr ? 'إجمالي المستلم الفعلي (المخزن) والفرق (Δ)' : 'Total WH Received & Variance (Δ)'}
                  </td>
                  {columns.map((col) => {
                    const cell = returnByCol[col.colKey] || {};
                    const v = Number(cell.variance || 0);
                    return (
                      <td key={col.colKey} className="py-2.5 px-2.5 text-center font-mono border-e border-slate-800">
                        <div className="text-emerald-300">{fmtCtn(cell.whReceivedTotal || 0)}</div>
                        <div className={`text-[10px] ${Math.abs(v) > 1e-4 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {Math.abs(v) > 1e-4 ? `${v > 0 ? '+' : ''}${v}` : '0 ✓'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono">
                    <div className="text-sm text-emerald-300">{fmtCtn(evalRes.totalReceived)}</div>
                    <div className={`text-[10px] ${evalRes.hasVariance ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {evalRes.hasVariance ? `Δ ${evalRes.totalVariance > 0 ? '+' : ''}${evalRes.totalVariance}` : (isAr ? 'مطابق 100%' : 'Exact Match ✓')}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Inline Order Settlement Confirmation Strip */}
          {inlineSettlementFeedback && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-xs text-emerald-950 font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{inlineSettlementFeedback}</span>
            </div>
          )}

          {/* Discrepancy Alert Strip */}
          {(evalRes.hasVariance || (actorMode === 'accountant' && evalRes.hasOrderMismatch)) && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                {actorMode === 'warehouse'
                  ? (isAr
                      ? 'توجد فروقات بين المستلم الفعلي والمتوقع — عند الحفظ سيتم تثبيت الكميات المستلمة وإرسال مهمة تسوية للمحاسبة.'
                      : 'Variance detected — saving will lock your actual received counts and assign a discrepancy settlement task to Accounting.')
                  : evalRes.hasOrderMismatch && !fieldLocks.whAlreadyConfirmed
                  ? (isAr
                      ? 'الكميات المتوقعة المسجلة لا تطابق أوامر البيع المرتبطة بالرحلة — يرجى تسوية أوامر البيع أو توجيه مهمة للمخولين قبل المطابقة النهائية.'
                      : 'Entered expected quantities diverge from linked Sales Orders — adjust orders or assign a settlement task.')
                  : (isAr
                      ? 'توجد فروقات عالقة مقابل استلام المخزن — لا يمكن إغلاق الرحلة إلا بعد تعديل أو إضافة أوامر بيع حتى يصبح الفرق = 0.'
                      : 'Pending variance against locked Warehouse receipt — adjust/create Sales Orders until variance = 0 to reconcile.')}
              </span>
            </div>
          )}

          {/* ACCOUNTANT DISCREPANCY SETTLEMENT WORKBENCH (Inline Sales Orders + Task Delegation) */}
          {actorMode === 'accountant' &&
            (evalRes.hasVariance || evalRes.hasOrderMismatch || Boolean(inlineSettlementFeedback)) &&
            !fieldLocks.isReconciled &&
            !fieldLocks.blockedBySelfApproval && (
              <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-indigo-700 shrink-0" />
                    <span className="text-xs font-black text-indigo-950">
                      {isAr
                        ? 'تسوية فروقات مرتجعات الرحلة (تعديل/إضافة أوامر البيع مباشرة أو توجيه مهام)'
                        : 'Trip Return Discrepancy Settlement Workbench (Inline Orders & Tasks)'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {columns.map((c) => {
                      const cell = returnByCol[c.colKey] || {};
                      const v = Number(cell.variance || 0);
                      const liveTot = Number(liveExpectedByCol[c.colKey]?.liveExpectedTotal || 0);
                      const acctTot = Number(cell.accountantExpectedTotal || 0);
                      const dispDelta = fieldLocks.whAlreadyConfirmed ? v : roundQty(acctTot - liveTot);
                      if (Math.abs(dispDelta) <= 1e-4) return null;
                      return (
                        <span
                          key={c.colKey}
                          className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-mono text-[10px] font-black"
                        >
                          {isAr ? c.shortNameAr : c.shortNameEn}: {dispDelta > 0 ? '+' : ''}{fmtCtn(dispDelta)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Section A: Inline Direct Order Adjustments & Launchers (when Accountant HAS Sales Orders perms) */}
                {returnAuthority.canAdjustOrCreateSalesOrders ? (
                  <div className="bg-white rounded-2xl border border-indigo-200 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-900">
                        {isAr
                          ? 'أ. تسوية مباشرة بأوامر البيع المرتبطة بالرحلة (داخل النافذة)'
                          : 'A. Inline Sales Order Adjustments & Creation'}
                      </span>
                      {returnAuthority.canCreateSalesOrder && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenInlineCreateOrder('supply', true)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAr ? 'إضافة أمر توريد (تسوية من الشاحنة)' : 'Add Inline Supply Order (Settlement)'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenInlineCreateOrder('return_deduct', false)}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAr ? 'إضافة أمر مرتجع للرحلة' : 'Add Inline Return Order'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {tripOrdersSummary.length > 0 && (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {tripOrdersSummary.map((o) => (
                          <div key={o.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50/50 hover:bg-slate-50">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="font-mono font-black text-slate-900">#{o.serial}</span>
                              <span className="font-bold text-slate-800 truncate max-w-[180px]">{o.clientName}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border ${ORDER_TYPE_META[o.orderType]?.cls || ''}`}>
                                {isAr ? ORDER_TYPE_META[o.orderType]?.ar : ORDER_TYPE_META[o.orderType]?.en}
                              </span>
                              {(o.settledFromTripExtras || o.isPostDispatchSettlementOrder) && (
                                <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-900 border border-teal-300 text-[9.5px] font-black">
                                  {isAr ? 'تسوية من الشاحنة' : 'Trip Settlement'}
                                </span>
                              )}
                              <span className="font-mono text-slate-600">
                                {isAr ? `مُسلَّم: ${fmtCtn(o.currentCartons)}` : `Delivered: ${fmtCtn(o.currentCartons)}`}
                                {o.returnedCartons > 0 ? ` (${isAr ? 'مرتجع' : 'Ret'}: ${fmtCtn(o.returnedCartons)})` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {o.isRetailRoute && returnAuthority.canSettleRetailOrders ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenInlineRetailOrder(o.id)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{isAr ? 'تسوية التجزئة' : 'Retail Settlement'}</span>
                                </button>
                              ) : (returnAuthority.canAdjustDispatchedQty || returnAuthority.canEditSalesOrder) ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenInlineEditOrder(o.id)}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-300 font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{isAr ? 'تعديل الكمية / مرتجع جزئي' : 'Adjust Order / Partial Return'}</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-950 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isAr
                        ? 'لا تملك صلاحية تعديل أو إنشاء أوامر البيع — يرجى توجيه مهمة تسوية (مع توضيح المطلوب في الملاحظات) للمستخدمين المخولين أدناه.'
                        : 'You do not have Sales Order edit/create permissions — assign a Settlement Task with notes to authorized users below.'}
                    </span>
                  </div>
                )}

                {/* Section B: Permission-Filtered Task Assignment Panel */}
                <div className="bg-white rounded-2xl border border-indigo-200 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTaskDelegation((v) => !v)}
                      className="text-xs font-black text-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        {returnAuthority.canAdjustOrCreateSalesOrders
                          ? (isAr ? 'ب. توجيه مهمة تسوية أوامر بيع لمستخدم آخر (اختياري)' : 'B. Assign Order-Settlement Task to Another User (Optional)')
                          : (isAr ? 'توجيه مهمة تسوية أوامر بيع للمستخدمين المخولين *' : 'Assign Sales Order Settlement Task *')}
                      </span>
                    </button>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono text-[10px] font-black">
                      {isAr ? `${eligibleOrderSettlers.length} مخول` : `${eligibleOrderSettlers.length} eligible`}
                    </span>
                  </div>

                  {(showTaskDelegation || !returnAuthority.canAdjustOrCreateSalesOrders) && (
                    <div className="space-y-2.5 pt-1 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTaskTargetMode('all_eligible')}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition cursor-pointer ${
                            taskTargetMode === 'all_eligible'
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        >
                          {isAr
                            ? `كل المؤهلين لتعديل/إنشاء أوامر البيع (${eligibleOrderSettlers.length})`
                            : `All Eligible Users (${eligibleOrderSettlers.length})`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskTargetMode('selected')}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition cursor-pointer ${
                            taskTargetMode === 'selected'
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        >
                          {isAr ? 'تحديد مستخدمين محددين' : 'Pick Specific Users'}
                        </button>
                      </div>

                      {taskTargetMode === 'selected' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200">
                          {eligibleOrderSettlers.length === 0 ? (
                            <span className="text-[11px] text-slate-500 col-span-2">
                              {isAr ? 'لا يوجد مستخدمون نشطون بصلاحيات تعديل أوامر البيع غيرك.' : 'No other active users hold Sales Order edit/create permissions.'}
                            </span>
                          ) : (
                            eligibleOrderSettlers.map((u) => {
                              const checked = selectedSettlerIds.includes(u.id);
                              return (
                                <label
                                  key={u.id}
                                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
                                    checked ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleToggleSettler(u.id)}
                                      className="accent-indigo-600"
                                    />
                                    <span className="font-bold text-slate-900 truncate">{isAr ? u.nameAr : u.name}</span>
                                  </span>
                                  <span className="flex items-center gap-1 shrink-0 text-[9px] font-extrabold">
                                    {u.capabilities.canCreate && <span className="px-1 rounded bg-emerald-100 text-emerald-800">{isAr ? 'إنشاء' : 'Add'}</span>}
                                    {u.capabilities.canEdit && <span className="px-1 rounded bg-sky-100 text-sky-800">{isAr ? 'تعديل' : 'Edit'}</span>}
                                    {u.capabilities.canAdjust && <span className="px-1 rounded bg-amber-100 text-amber-800">{isAr ? 'مرتجع' : 'Adj'}</span>}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-black text-slate-700">
                            {isAr
                              ? 'ملاحظات وتعليمات تسوية كميات أوامر البيع لهذه الرحلة *'
                              : 'Settlement Notes & Required Order Adjustments *'}
                          </label>
                          <button
                            type="button"
                            onClick={handleAutoFillTaskNotes}
                            className="text-[10.5px] font-black text-indigo-700 hover:underline cursor-pointer"
                          >
                            {isAr ? 'تعبئة تلقائية بالفروقات' : 'Auto-fill SKU Delta'}
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={taskNotes}
                          onChange={(e) => setTaskNotes(e.target.value)}
                          placeholder={
                            isAr
                              ? 'اكتب تفاصيل الطلبات المطلوب تعديلها أو أوامر التوريد/المرتجع المطلوب إضافتها لإغلاق فرق الرحلة...'
                              : 'Describe which orders need adjustment or which supply/return orders must be added to settle this trip...'
                          }
                          className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-indigo-600"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-emerald-700">{taskSentMsg}</span>
                        <button
                          type="button"
                          disabled={isSendingTask}
                          onClick={handleAssignSettlementTask}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{isSendingTask ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال مهمة تسوية أوامر البيع' : 'Assign Settlement Task')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Settlement Tasks Log */}
                  {existingSettlementTasks.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10.5px] font-black text-slate-500">
                        {isAr ? `سجل مهام تسوية هذه الرحلة (${existingSettlementTasks.length})` : `Trip Settlement Tasks Log (${existingSettlementTasks.length})`}
                      </div>
                      {existingSettlementTasks.map((tsk) => (
                        <div
                          key={tsk.id}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                            tsk.status === 'completed'
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-amber-50/75 border-amber-200 text-amber-950'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold">{tsk.notes}</div>
                            <div className="text-[10px] text-slate-600">
                              {isAr ? 'مرسلة من:' : 'By:'} {tsk.createdByName} •{' '}
                              {Array.isArray(tsk.targetUserNames) && tsk.targetUserNames.length > 0
                                ? tsk.targetUserNames.join('، ')
                                : (isAr ? 'كل المؤهلين' : 'All Eligible')}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                              tsk.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {tsk.status === 'completed'
                              ? (isAr ? `مكتملة (${tsk.completedByName || '✓'})` : `Done (${tsk.completedByName || '✓'})`)
                              : (isAr ? 'مفتوحة ⏳' : 'Open ⏳')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Warehouse Pre-Reconciliation Amendment Reason Box */}
          {actorMode === 'warehouse' && fieldLocks.requiresWhAmendReason && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 space-y-1.5">
              <label className="text-[11px] font-black text-amber-950 block">
                {isAr
                  ? 'سبب تعديل الكميات المستلمة فعلياً (مطلوب قبل إعادة التثبيت وإشعار المحاسبة) *'
                  : 'Reason for Amending Warehouse Received Quantities *'}
              </label>
              <input
                type="text"
                value={whAmendReason}
                onChange={(e) => setWhAmendReason(e.target.value)}
                placeholder={isAr ? 'مثال: خطأ عد أولي وتمت مراجعة كراتين العميل بالمخزن...' : 'e.g., Initial carton miscount corrected on recount...'}
                className="w-full text-xs font-bold bg-white border border-amber-300 rounded-xl px-3 py-1.5 outline-none focus:border-amber-600"
              />
            </div>
          )}

          {/* General Admin Reopen Panel when Reconciled */}
          {fieldLocks.canReopenReconciled && (
            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-300 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  <span>{isAr ? 'الرحلة مقفلة ومطابقة — صلاحية المدير العام لإعادة الفتح' : 'Trip Reconciled — General Admin Unlock'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAdminReopenOpen((v) => !v)}
                  className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة فتح للتعديل' : 'Reopen Return'}</span>
                </button>
              </div>
              {adminReopenOpen && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={adminReopenReason}
                    onChange={(e) => setAdminReopenReason(e.target.value)}
                    placeholder={isAr ? 'سبب إعادة الفتح المعتمد في سجل المراجعة *' : 'Audit reason for reopening *'}
                    className="flex-1 min-w-[220px] text-xs font-bold bg-white border border-amber-300 rounded-xl px-3 py-1.5 outline-none"
                  />
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleAdminReopenReconciled}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer"
                  >
                    {isAr ? 'تأكيد إعادة الفتح' : 'Confirm Reopen'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* General Admin Audited Variance Write-Off Panel */}
          {returnAuthority.canForceWriteOffVariance &&
            evalRes.hasVariance &&
            !fieldLocks.isReconciled && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-300 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>{isAr ? 'تسوية إدارية استثنائية للفروقات / عهدة سائق (مدير عام فقط)' : 'General Admin Audited Variance Write-Off'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdminWriteOffOpen((v) => !v)}
                    className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black cursor-pointer"
                  >
                    {adminWriteOffOpen ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'فتح خيار التسوية الإدارية' : 'Open Write-Off')}
                  </button>
                </div>
                {adminWriteOffOpen && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={adminWriteOffReason}
                      onChange={(e) => setAdminWriteOffReason(e.target.value)}
                      placeholder={isAr ? 'سبب اعتماد العجز/الزيادة أو رقم عهدة السائق (إلزامي) *' : 'Mandatory write-off / driver custody audit reason *'}
                      className="flex-1 min-w-[240px] text-xs font-bold bg-white border border-slate-300 rounded-xl px-3 py-1.5 outline-none"
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSubmitReturn('admin_writeoff')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-black cursor-pointer"
                    >
                      {isAr ? 'اعتماد وإقفال إداري نهائي' : 'Confirm Admin Write-Off'}
                    </button>
                  </div>
                )}
              </div>
            )}

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              {isAr
                ? 'ملاحظات استلام المرتجع والمطابقة والتالف:'
                : 'Return Receiving, Reconciliation & Faulty Comments:'}
            </label>
            <textarea
              rows={2}
              disabled={fieldLocks.isReconciled && !returnAuthority.isGeneralAdmin}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder={
                isAr
                  ? 'سبب الفروقات إن وجدت، تفاصيل استبدال التالف لدى العميل، حالة المرتجع المستلم...'
                  : 'Variance explanation, client faulty swap details, condition of returned cartons...'
              }
              className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-teal-600 resize-y min-h-[60px] disabled:bg-slate-100"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>

          {/* General Admin Dual Settlement Button */}
          {returnAuthority.canSettleBothSides && !fieldLocks.isReconciled && !evalRes.hasVariance && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmitReturn('admin_settle_both')}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>{isAr ? 'اعتماد وإقفال القسمين (مدير عام) ✓' : 'Settle Both Sides (Admin) ✓'}</span>
            </button>
          )}

          {/* Accountant Footer Action */}
          {actorMode === 'accountant' && fieldLocks.canSubmitAcctSide && (
            <>
              {fieldLocks.whAlreadyConfirmed ? (
                <button
                  type="button"
                  disabled={isSaving || evalRes.hasVariance}
                  title={
                    evalRes.hasVariance
                      ? (isAr ? 'يجب تسوية أوامر البيع أولاً حتى يصبح الفرق = 0' : 'Settle Sales Orders until variance = 0 first')
                      : (isAr ? 'تأكيد مطابقة الحسابات وإقفال الرحلة' : 'Confirm Accounting Alignment & Close')
                  }
                  onClick={() => handleSubmitReturn('accountant')}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {evalRes.hasVariance
                      ? (isAr ? 'تسوية الأوامر أولاً (الفرق ≠ 0)' : 'Settle Orders First (Δ ≠ 0)')
                      : (isAr ? 'تأكيد مطابقة الحسابات وإقفال الرحلة ✓' : 'Confirm Accounting Alignment & Close ✓')}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSubmitReturn('accountant')}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                    evalRes.hasOrderMismatch
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>
                    {evalRes.hasOrderMismatch
                      ? (isAr ? 'حفظ المتوقع (مع تنبيه فرق أوامر بيع)' : 'Save Expected (Flag Order Variance)')
                      : (isAr ? 'حفظ المتوقع وإخطار أمين المخزن' : 'Save Expected & Notify WH')}
                  </span>
                </button>
              )}
            </>
          )}

          {/* Warehouse Custodian Footer Action */}
          {actorMode === 'warehouse' && fieldLocks.canSubmitWhSide && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmitReturn('warehouse')}
              className={`px-5 py-2 rounded-xl text-white text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                evalRes.hasVariance ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {evalRes.hasVariance
                  ? (isAr ? 'تثبيت المستلم وإرسال مهمة فرق للمحاسبة' : 'Lock Actual Receipt & Alert Accounting')
                  : fieldLocks.acctAlreadyConfirmed
                  ? (isAr ? 'تأكيد الاستلام المطابق وإقفال الرحلة ✓' : 'Confirm Matched Receipt & Close ✓')
                  : (isAr ? 'تثبيت الاستلام وإخطار المحاسبة للمطابقة ✓' : 'Lock Receipt & Request Acct Align ✓')}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>

      {/* Stacked Inline Sales Order Editor Modal (keeps Return Modal open!) */}
      {inlineEditorState && (
        <SalesOrderEditorModal
          isOpen={Boolean(inlineEditorState)}
          onClose={() => setInlineEditorState(null)}
          editingOrder={inlineEditorState.editingOrder}
          isAdminModal={false}
          prefillTripContext={inlineEditorState.prefillTripContext}
          onSaved={handleInlineOrderSaved}
          zIndexClass="z-[60]"
          canAdjustDispatchedQty={Boolean(returnAuthority.canAdjustDispatchedQty)}
          initialAdjustmentMode={Boolean(inlineEditorState.initialAdjustmentMode)}
          clients={clients}
          segments={segments}
          products={finishedProducts}
          productCategories={productCategories}
          priceLists={priceLists}
          strategies={strategies}
          vehicles={vehicles}
          allOrders={allOrders}
          stdRetailList={stdRetailList}
          canManageStdRetailList={false}
          isAr={isAr}
          currentUserName={
            isAr
              ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
              : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system')
          }
          currentUserId={currentUser?.id || 'system'}
        />
      )}

      {/* Stacked Inline Retail Route Settlement Modal */}
      {inlineRetailOrder && (
        <RetailSettlementModal
          isOpen={Boolean(inlineRetailOrder)}
          onClose={() => setInlineRetailOrder(null)}
          order={inlineRetailOrder}
          canSettleRetailOrders={Boolean(returnAuthority.canSettleRetailOrders)}
          allowDeferDelivery={false}
          skipDispatchSync={true}
          zIndexClass="z-[60]"
          vehicles={vehicles}
          resolveVehicleDisplayName={resolveVehicleDisplayNameModal}
          isAr={isAr}
          currentUserName={
            isAr
              ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
              : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system')
          }
          currentUserId={currentUser?.id || 'system'}
          onSuccess={({ payload }) => {
            if (payload) handleInlineOrderSaved(payload);
            setInlineRetailOrder(null);
          }}
        />
      )}
    </>
  );
}

// =========================================================================
// MAIN TAB COMPONENT: TruckDispatchMaster
// =========================================================================
export default function TruckDispatchMaster({
  currentUser = {},
  permissions = null,
  departmentsList = [],
  departmentOverrides = {},
  userOverrides = {},
  usersList = [],
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin =
    currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin' || currentUser?.role === 'admin';

  // RBAC Actions & Strict Return Separation-of-Duties Authority
  const canDispatchTruck = canAccessAction(permissions, 'truck_dispatch', 'canDispatchTruck', currentUser) || isGeneralAdmin;
  const canEditDispatchedTrip = canAccessAction(permissions, 'truck_dispatch', 'canEditDispatchedTrip', currentUser) || isGeneralAdmin;
  const returnAuthority = useMemo(
    () =>
      resolveUserReturnAuthority({
        currentUser,
        permissions,
        departments: departmentsList,
        departmentOverrides,
        userOverrides,
      }),
    [currentUser, permissions, departmentsList, departmentOverrides, userOverrides]
  );

  // Collections State
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState([]);
  const [stagedPallets, setStagedPallets] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [faultyReturns, setFaultyReturns] = useState([]);
  const [truckDispatches, setTruckDispatches] = useState([]);
  const [clients, setClients] = useState([]);
  const [segments, setSegments] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [strategies, setStrategies] = useState(DEFAULT_PRICING_STRATEGIES);
  const [stdRetailList, setStdRetailList] = useState([]);
  const orderLookupUnsubsRef = useRef([]);
  const [companyProfile, setCompanyProfile] = useState({});
  const [workerPool, setWorkerPool] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [subscribedUsers, setSubscribedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const todayStr = useMemo(() => formatDateStr(new Date()), []);

  // Filters: Default focus is on Today's trips; most recent trips always on top
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'all' | 'custom'
  const [customDate, setCustomDate] = useState(todayStr);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'ready_to_load' | 'loaded' | 'return_needed' | 'pending'
  const [searchTerm, setSearchTerm] = useState('');

  // Modals, Menus & Toast
  const [activeDispatchTripId, setActiveDispatchTripId] = useState(null);
  const [activeDispatchMode, setActiveDispatchMode] = useState('edit'); // 'edit' | 'view'
  const [activeReturnTripId, setActiveReturnTripId] = useState(null);
  const [auditTripId, setAuditTripId] = useState(null);
  const [versionsModalTripId, setVersionsModalTripId] = useState(null);
  const [versionsModalTab, setVersionsModalTab] = useState('docs'); // 'docs' | 'history'
  const [registryDocs, setRegistryDocs] = useState([]);
  const [isDocsHistoryOpen, setIsDocsHistoryOpen] = useState(false);
  const [highlightHistoryDocNumber, setHighlightHistoryDocNumber] = useState('');
  const [scannedDocAlert, setScannedDocAlert] = useState(null); // { tripId, docVersion, docNumber, openLatestDoc }
  const [openMenuTripId, setOpenMenuTripId] = useState(null);
  const [openQtyTooltipTripId, setOpenQtyTooltipTripId] = useState(null);
  const [copiedPlateTripId, setCopiedPlateTripId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (!openMenuTripId && !openQtyTooltipTripId) return undefined;
    const handleClosePopups = () => {
      setOpenMenuTripId(null);
      setOpenQtyTooltipTripId(null);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClosePopups();
    };
    window.addEventListener('click', handleClosePopups);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClosePopups);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuTripId, openQtyTooltipTripId]);

  const handleCopyPlateNumber = async (trip) => {
    const plate = trip?.plateNumber;
    if (!plate) return;
    try {
      await navigator.clipboard.writeText(plate);
      setCopiedPlateTripId(trip.id);
      showToast(isAr ? `تم نسخ رقم اللوحة: ${plate}` : `Copied plate #: ${plate}`);
      setTimeout(() => {
        setCopiedPlateTripId((curr) => (curr === trip.id ? null : curr));
      }, 2000);
    } catch (_) {}
  };

  const openRenderedDispatchDoc = async (model, versionMeta = null, existingWin = null) => {
    const win = existingWin || window.open('', '_blank', 'width=1180,height=820');
    if (win && !existingWin) {
      win.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري تجهيز إذن الصرف ورموز QR...</body></html>`
      );
    }

    const qrTasks = [];
    const qrAssets = { systemTripQr: '', routeQr: '', latestVersionQr: '', clientQrs: {} };

    if (model.systemTripUrl) {
      qrTasks.push(
        generateQRCodeDataURL(model.systemTripUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.systemTripQr = url;
        })
      );
    }

    if (model.canShowRouteQr && model.proposedRoute?.googleMapsRouteUrl) {
      qrTasks.push(
        generateQRCodeDataURL(model.proposedRoute.googleMapsRouteUrl, {
          width: 150,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.routeQr = url;
        })
      );
    }

    if (versionMeta?.isLegacy && versionMeta?.newVersionReleased && versionMeta?.latestVersionUrl) {
      qrTasks.push(
        generateQRCodeDataURL(versionMeta.latestVersionUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.latestVersionQr = url;
        })
      );
    }

    (model.clientStops || []).forEach((stop) => {
      if (!stop.hasAccurateLocation) return;
      const targetUrl = stop.locationInfo?.url || stop.url;
      if (!targetUrl) return;
      qrTasks.push(
        generateQRCodeDataURL(targetUrl, {
          width: 130,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).then((url) => {
          qrAssets.clientQrs[stop.key] = url;
        })
      );
    });

    await Promise.all(qrTasks);

    const html = renderDispatchDocumentHtml(model, qrAssets, versionMeta);
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  };

  // Reconstructs a full Dispatch Document model from an archived dispatch snapshot (for pre-versioning printed trips)
  const reconstructSnapshotModelFromDispatch = (trip, sourceSnap, versionNumber = 1) => {
    const snap = sourceSnap || trip?.dispatchDoc || {};
    const snapOrderIds = Array.isArray(snap.orderIds) && snap.orderIds.length > 0 ? snap.orderIds : null;
    const snapRowsById = {};
    (Array.isArray(snap.clientRowsSnapshot) ? snap.clientRowsSnapshot : []).forEach((r) => {
      if (r?.orderId) snapRowsById[r.orderId] = r;
    });

    const sourceOrders = snapOrderIds
      ? snapOrderIds
          .map((oid) => orders.find((o) => o.id === oid) || trip.orders.find((o) => o.id === oid))
          .filter(Boolean)
      : trip.orders || [];

    const reconstructedOrders = sourceOrders.map((ord) => {
      const savedRow = snapRowsById[ord.id];
      if (!savedRow?.quantitiesByCol) return ord;
      const lines = Object.entries(savedRow.quantitiesByCol)
        .filter(([, q]) => Number(q) > 0)
        .map(([colKey, q]) => {
          const [productCode, optionSuffix] = String(colKey).split('::');
          return { productCode, optionSuffix, qty: Number(q), bonus: 0 };
        });
      return lines.length > 0 ? { ...ord, lines } : ord;
    });

    const appOriginUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : '';

    const syntheticTrip = {
      ...trip,
      vehicleDisplayName: snap.vehicleName || trip.vehicleDisplayName,
      plateNumber: snap.plateNumber || trip.plateNumber,
      primaryDriverName: snap.driverName || trip.primaryDriverName,
      primaryRepName: snap.deliveryRepName || trip.primaryRepName,
      orders: reconstructedOrders.length > 0 ? reconstructedOrders : trip.orders,
      dispatchDoc: {
        ...(trip.dispatchDoc || {}),
        columns: Array.isArray(snap.columns) ? snap.columns : trip.dispatchDoc?.columns || [],
        loadingWorkers: Array.isArray(snap.loadingWorkers) ? snap.loadingWorkers : trip.dispatchDoc?.loadingWorkers || [],
        offloadingWorkers: Array.isArray(snap.offloadingWorkers) ? snap.offloadingWorkers : trip.dispatchDoc?.offloadingWorkers || [],
        dispatchNotes: snap.dispatchNotes !== undefined ? snap.dispatchNotes : (trip.dispatchDoc?.dispatchNotes || ''),
      },
    };

    const built = buildDispatchDocumentModel({
      trip: syntheticTrip,
      finishedProducts: products,
      clients,
      companyProfile,
      appOriginUrl,
      versionNumber,
    });

    if (snap.printedAt || trip?.dispatchDoc?.dispatchPrintedAt) {
      const pAt = snap.printedAt || trip.dispatchDoc.dispatchPrintedAt;
      built.printedAtDisplay = new Date(pAt).toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return built;
  };

  // Returns stored dispatchDocVersions, or synthesizes v1 if the trip was printed before versioning existed
  const getEffectiveDocVersions = (trip) => {
    const dDoc = trip?.dispatchDoc || {};
    const stored = Array.isArray(dDoc.dispatchDocVersions) ? dDoc.dispatchDocVersions : [];
    if (stored.length > 0) return stored;
    if (!dDoc.dispatchPrintedAt) return [];

    const hasDrift = Boolean(trip?.planDrift?.hasPlanDrift);
    const hasPriorHistory = Array.isArray(dDoc.dispatchHistory) && dDoc.dispatchHistory.length > 0;
    const rawPrintState = getDocPrintStatus(
      dDoc.dispatchPrintedAt,
      dDoc.dispatchContentUpdatedAt || dDoc.updatedAt || dDoc.dispatchedAt
    );
    const isSuperseded = hasDrift || hasPriorHistory || rawPrintState === 'printed_stale';

    return [
      {
        versionId: `LEGACY-SYNTH-V1-${trip.id}`,
        versionNumber: 1,
        printedAt: dDoc.dispatchPrintedAt,
        printedBy: dDoc.dispatchPrintedBy || dDoc.dispatchedByName || '',
        status: isSuperseded ? 'superseded' : 'current',
        supersededReasonAr:
          (hasPriorHistory ? dDoc.dispatchHistory[0]?.reasonAr : '') ||
          (hasDrift ? trip.planDrift.summaryAr : '') ||
          (rawPrintState === 'printed_stale' ? 'تم تعديل بيان الصرف بعد الطباعة' : ''),
        isSynthesizedFromLegacyPrint: true,
        sourceSnapshot: hasPriorHistory ? dDoc.dispatchHistory[0] : dDoc,
      },
    ];
  };

  const handleOpenSavedDocVersion = async (trip, verEntry) => {
    if (!trip || !verEntry) return;
    const win = window.open('', '_blank', 'width=1180,height=820');
    if (win) {
      win.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري فتح النسخة المحفوظة...</body></html>`
      );
    }

    try {
      const versions = getEffectiveDocVersions(trip);
      const currentVer = versions.find((v) => v.status === 'current') || null;
      const hasDrift = Boolean(trip.planDrift?.hasPlanDrift);

      const snapshotModel =
        verEntry.modelSnapshot ||
        reconstructSnapshotModelFromDispatch(trip, verEntry.sourceSnapshot, verEntry.versionNumber || 1);

      // A version is Legacy if explicitly superseded OR if it is older than current OR if live plan drifted after it was printed
      const isLegacy =
        verEntry.status === 'superseded' ||
        (currentVer && Number(currentVer.versionNumber) > Number(verEntry.versionNumber)) ||
        hasDrift;

      // New version is released ONLY if there is a newer 'current' version AND the trip has no unresolved drift
      const newVersionReleased = Boolean(
        currentVer &&
          Number(currentVer.versionNumber) > Number(verEntry.versionNumber) &&
          !hasDrift
      );

      const appOriginUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';
      const latestVersionUrl = newVersionReleased
        ? `${appOriginUrl}#truck_dispatch?module=sales&tripId=${encodeURIComponent(trip.id)}&openLatestDoc=1`
        : `${appOriginUrl}#truck_dispatch?module=sales&tripId=${encodeURIComponent(trip.id)}`;

      const latestPrintedDisplay = currentVer?.printedAt
        ? new Date(currentVer.printedAt).toLocaleString('ar-EG', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      await openRenderedDispatchDoc(
        snapshotModel,
        {
          docNumber: verEntry.docNumber || snapshotModel?.docNumber || '',
          versionNumber: verEntry.versionNumber,
          isLegacy,
          supersededReasonAr:
            verEntry.supersededReasonAr ||
            (hasDrift ? trip.planDrift.summaryAr : ''),
          newVersionReleased,
          latestVersionNumber: currentVer?.versionNumber || null,
          latestDocNumber: currentVer?.docNumber || '',
          latestVersionPrintedAt: latestPrintedDisplay,
          latestVersionUrl,
        },
        win
      );
    } catch (err) {
      console.error('Failed opening saved dispatch version:', err);
      if (win) win.close();
      showToast(isAr ? 'تعذر فتح النسخة المحفوظة' : 'Failed opening archived version', 'error');
    }
  };

  // Opens Preview/Print for ANY Dispatch Document in the global registry — even if its trip/orders/truck are now unlinked or cancelled!
  const handleOpenRegistryDocument = async (entry) => {
    if (!entry) return;
    const win = window.open('', '_blank', 'width=1180,height=820');
    if (win) {
      win.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري فتح المستند المحفوظ (${entry.docNumber || ''})...</body></html>`
      );
    }

    try {
      const liveTrip = entry.tripId ? allTrips.find((t) => t.id === entry.tripId) || null : null;
      let snapshotModel = entry.modelSnapshot || null;

      if (!snapshotModel) {
        // Fallback reconstruction for pre-numbering legacy records that lacked modelSnapshot
        const fallbackTrip = liveTrip || {
          id: entry.tripId || entry.id,
          loadingDate: entry.loadingDate || '—',
          loadingOrderNumber: entry.loadingOrderNumber || '—',
          vehicleDisplayName: entry.vehicleName || '—',
          plateNumber: entry.plateNumber || '',
          primaryDriverName: entry.driverName || '—',
          primaryRepName: entry.deliveryRepName || '',
          orders: [],
          dispatchDoc: entry.sourceSnapshot || {},
        };
        snapshotModel = reconstructSnapshotModelFromDispatch(
          fallbackTrip,
          entry.sourceSnapshot || liveTrip?.dispatchDoc || {},
          entry.versionNumber || 1
        );
      }

      const isLegacy = entry.status !== 'valid';
      const newVersionReleased = Boolean(isLegacy && entry.latestValidDocNumber);

      const appOriginUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';
      const latestVersionUrl = newVersionReleased && entry.tripId
        ? `${appOriginUrl}#truck_dispatch?module=sales&tripId=${encodeURIComponent(entry.tripId)}&openLatestDoc=1`
        : '';

      const latestPrintedDisplay = entry.latestValidPrintedAt
        ? new Date(entry.latestValidPrintedAt).toLocaleString('ar-EG', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      const headlineByCode = {
        trip_reversed_pending: 'الرحلة أعيدت لمعلق',
        trip_cancelled_or_unlinked: 'إلغاء الطلبات وفك الرحلة',
        trip_unlinked: 'الرحلة غير مرتبطة',
        order_cancelled: 'إلغاء طلب بالرحلة',
        plan_drift: 'تعديل خطة الرحلة',
        dispatch_edited: 'تعديل بيان الصرف',
        superseded: 'استُبدل بإصدار أحدث',
      };

      await openRenderedDispatchDoc(
        snapshotModel,
        {
          docNumber: entry.docNumber || snapshotModel?.docNumber || '',
          versionNumber: entry.versionNumber || snapshotModel?.versionNumber || 1,
          isLegacy,
          legacyHeadlineAr: entry.reasonAr ? '' : (headlineByCode[entry.reasonCode] || ''),
          supersededReasonAr: entry.reasonAr || '',
          newVersionReleased,
          latestVersionNumber: entry.latestValidVersionNumber || null,
          latestDocNumber: entry.latestValidDocNumber || '',
          latestVersionPrintedAt: latestPrintedDisplay,
          latestVersionUrl,
        },
        win
      );
    } catch (err) {
      console.error('Failed opening registry dispatch document:', err);
      if (win) win.close();
      showToast(isAr ? 'تعذر فتح المستند المحفوظ' : 'Failed opening archived document', 'error');
    }
  };

  const handlePrintPlaceholderDoc = async (trip, kind) => {
    if (!trip) return;
    const isDisp = kind === 'dispatch';

    // Open print window synchronously on click to avoid popup blockers
    const win = window.open('', '_blank', isDisp ? 'width=1180,height=820' : 'width=820,height=640');

    if (isDisp) {
      if (win) {
        win.document.write(
          `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري تجهيز إذن الصرف ورموز QR...</body></html>`
        );
      }

      try {
        const dDoc = trip.dispatchDoc || {};
        const storedVersions = Array.isArray(dDoc.dispatchDocVersions) ? dDoc.dispatchDocVersions : [];
        // If this trip was printed before dispatchDocVersions existed, preserve that prior print as Legacy v1 first!
        const prevVersions =
          storedVersions.length > 0
            ? storedVersions
            : dDoc.dispatchPrintedAt
            ? [
                {
                  versionId: `DOC-V1-BACKFILL-${Date.now()}`,
                  versionNumber: 1,
                  printedAt: dDoc.dispatchPrintedAt,
                  printedBy: dDoc.dispatchPrintedBy || dDoc.dispatchedByName || '',
                  status: 'superseded',
                  supersededReasonAr:
                    (Array.isArray(dDoc.dispatchHistory) && dDoc.dispatchHistory[0]?.reasonAr) ||
                    (trip.planDrift?.hasPlanDrift ? trip.planDrift.summaryAr : 'تم تعديل بيان الصرف بعد الطباعة'),
                  modelSnapshot: JSON.parse(
                    JSON.stringify(
                      reconstructSnapshotModelFromDispatch(
                        trip,
                        Array.isArray(dDoc.dispatchHistory) && dDoc.dispatchHistory.length > 0
                          ? dDoc.dispatchHistory[0]
                          : dDoc,
                        1
                      )
                    )
                  ),
                },
              ]
            : [];
        const existingCurrent = prevVersions.find((v) => v.status === 'current') || null;
        const dispPrintState = trip.planDrift?.hasPlanDrift
          ? (dDoc.dispatchPrintedAt ? 'printed_stale' : 'not_printed')
          : getDocPrintStatus(
              dDoc.dispatchPrintedAt,
              dDoc.dispatchContentUpdatedAt || dDoc.updatedAt || dDoc.dispatchedAt
            );

        // Reuse current version & docNumber only if already printed & still 100% up-to-date; otherwise mint next unique docNumber
        const shouldMintNewVersion =
          !existingCurrent ||
          dispPrintState !== 'printed_current' ||
          !existingCurrent.docNumber;
        const maxVerNum = prevVersions.reduce((m, v) => Math.max(m, Number(v.versionNumber || 0)), 0);
        const nextVersionNumber = shouldMintNewVersion ? maxVerNum + 1 : existingCurrent.versionNumber;

        let assignedDocNumber = existingCurrent?.docNumber || '';
        let assignedDocSeq = Number(existingCurrent?.docSeq || 0);
        if (shouldMintNewVersion) {
          const minted = await mintDispatchDocNumber(db);
          assignedDocNumber = minted.docNumber;
          assignedDocSeq = minted.docSeq;
        }

        const appOriginUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : '';

        const model = buildDispatchDocumentModel({
          trip,
          finishedProducts: products,
          clients,
          companyProfile,
          appOriginUrl,
          versionNumber: nextVersionNumber,
          docNumber: assignedDocNumber,
        });

        await openRenderedDispatchDoc(
          model,
          { docNumber: assignedDocNumber, versionNumber: nextVersionNumber, isLegacy: false },
          win
        );

        const nowIso = new Date().toISOString();
        const actorId = currentUser?.id || currentUser?.uid || 'system';
        const actorName = isAr
          ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
          : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system');

        const printPayload = {
          dispatchPrintedAt: nowIso,
          dispatchPrintedBy: actorName,
          latestDispatchDocVersion: nextVersionNumber,
          latestDispatchDocNumber: assignedDocNumber,
        };

        if (shouldMintNewVersion) {
          const sanitizedSnapshot = JSON.parse(JSON.stringify(model));
          const updatedVersions = [
            ...prevVersions.map((v) =>
              v.status === 'current'
                ? {
                    ...v,
                    status: 'superseded',
                    supersededAt: v.supersededAt || nowIso,
                    supersededByVersion: nextVersionNumber,
                    supersededByDocNumber: assignedDocNumber,
                  }
                : v
            ),
            {
              versionId: `DOC-V${nextVersionNumber}-${Date.now()}`,
              docNumber: assignedDocNumber,
              docSeq: assignedDocSeq,
              versionNumber: nextVersionNumber,
              printedAt: nowIso,
              printedBy: actorName,
              status: 'current',
              modelSnapshot: sanitizedSnapshot,
            },
          ];
          printPayload.dispatchDocVersions = updatedVersions;

          // Persist immutable record to top-level `dispatch_documents/{docNumber}` & supersede any prior docs for this trip
          const registryEntry = buildRegistryEntryPayload({
            docNumber: assignedDocNumber,
            docSeq: assignedDocSeq,
            trip,
            model: sanitizedSnapshot,
            versionNumber: nextVersionNumber,
            printedAt: nowIso,
            printedBy: actorName,
            printedById: actorId,
          });
          const commitPrintFn = httpsCallable(functions, 'salesCommitPrintedDocument');
          await commitPrintFn({
            tripId: trip.id,
            kind: 'dispatch',
            printPayload,
            registryEntry,
            currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
          });
        } else {
          const commitPrintFn = httpsCallable(functions, 'salesCommitPrintedDocument');
          await commitPrintFn({
            tripId: trip.id,
            kind: 'dispatch',
            printPayload,
            currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
          });
        }
      } catch (err) {
        console.error('Failed building dispatch document:', err);
        if (win) win.close();
        showToast(isAr ? 'تعذر تجهيز مستند الصرف للطباعة' : 'Failed preparing dispatch document', 'error');
      }
      return;
    }

    const retWin = win || window.open('', '_blank', 'width=1180,height=820');
    if (retWin && win === null) {
      retWin.document.write(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#334155;font-weight:700;">جاري تجهيز إذن استلام المرتجع...</body></html>`
      );
    }

    try {
      const dDoc = trip.dispatchDoc || {};
      const retPrintState = getDocPrintStatus(
        dDoc?.returnPrintedAt,
        dDoc?.returnContentUpdatedAt || dDoc?.whReturnConfirmedAt || dDoc?.accountantReturnSubmittedAt
      );

      let assignedRetNumber = dDoc?.latestReturnDocNumber || '';
      let assignedRetSeq = Number(dDoc?.returnDocSeq || 0);
      if (!assignedRetNumber || retPrintState !== 'printed_current') {
        const mintedRet = await mintReturnDocNumber(db);
        assignedRetNumber = mintedRet.returnDocNumber;
        assignedRetSeq = mintedRet.returnDocSeq;
      }

      const appOriginUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';

      const retModel = buildReturnDocumentModel({
        trip,
        finishedProducts: products,
        companyProfile,
        appOriginUrl,
        returnDocNumber: assignedRetNumber,
      });

      let systemTripQr = '';
      try {
        systemTripQr = await generateQRCodeDataURL(retModel.systemTripUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
      } catch (_) {}

      const html = renderReturnDocumentHtml(retModel, { systemTripQr });
      if (retWin) {
        retWin.document.open();
        retWin.document.write(html);
        retWin.document.close();
      }

      const nowIso = new Date().toISOString();
      const actorName = isAr
        ? (currentUser?.nameAr || currentUser?.name || currentUser?.id || 'system')
        : (currentUser?.name || currentUser?.nameAr || currentUser?.id || 'system');
      const commitPrintFn = httpsCallable(functions, 'salesCommitPrintedDocument');
      await commitPrintFn({
        tripId: trip.id,
        kind: 'return',
        printPayload: {
          returnPrintedAt: nowIso,
          returnPrintedBy: actorName,
          latestReturnDocNumber: assignedRetNumber,
          returnDocSeq: assignedRetSeq,
        },
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
    } catch (err) {
      console.error('Failed building return document:', err);
      if (retWin) retWin.close();
      showToast(isAr ? 'تعذر تجهيز إذن استلام المرتجع للطباعة' : 'Failed preparing return document', 'error');
    }
  };

  const showToast = (message, type = 'success') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 4200);
  };

  // Subscribe to Firestore Streams
  useEffect(() => {
    let loaded = { orders: false, dispatches: false };
    const checkDone = () => {
      if (loaded.orders && loaded.dispatches) setLoading(false);
    };

    const unsubOrders = onSnapshot(collection(db, 'sales_orders'), (snap) => {
      setOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((d) => !d.isDeleted));
      loaded.orders = true;
      checkDone();
    });

    const unsubDispatches = onSnapshot(collection(db, 'truck_dispatches'), (snap) => {
      setTruckDispatches(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      loaded.dispatches = true;
      checkDone();
    });

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap) => {
      setVehicles(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      setProducts(snap.docs.map((d) => ({ ...d.data(), id: d.id, code: d.data().code || d.id })));
    });

    const unsubPallets = onSnapshot(collection(db, 'staged_floor_pallets'), (snap) => {
      setStagedPallets(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubTransfers = onSnapshot(collection(db, 'stock_transfers'), (snap) => {
      setStockTransfers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubFaulty = onSnapshot(collection(db, 'faulty_fg_returns'), (snap) => {
      setFaultyReturns(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubCompany = onSnapshot(doc(db, 'system_config', 'company_profile'), (snap) => {
      if (snap.exists()) setCompanyProfile(snap.data() || {});
    });

    const unsubRegistryDocs = onSnapshot(collection(db, DISPATCH_DOCUMENTS_COLLECTION), (snap) => {
      setRegistryDocs(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubOrders();
      unsubDispatches();
      unsubVehicles();
      unsubProducts();
      unsubPallets();
      unsubTransfers();
      unsubFaulty();
      unsubClients();
      unsubCompany();
      unsubRegistryDocs();
      orderLookupUnsubsRef.current.forEach((u) => {
        try { u(); } catch (_) {}
      });
      orderLookupUnsubsRef.current = [];
    };
  }, []);

  // Lazy-load pricing & segment lookups only when Return Receiving opens inline Sales Order editing
  useEffect(() => {
    if (!activeReturnTripId || orderLookupUnsubsRef.current.length > 0) return;
    const unsubSeg = onSnapshot(collection(db, 'client_segments'), (snap) => {
      setSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubCat = onSnapshot(collection(db, 'finished_product_categories'), (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
        setProductCategories(list);
      }
    });
    const unsubPl = onSnapshot(collection(db, 'price_lists'), (snap) => {
      setPriceLists(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubStrat = onSnapshot(collection(db, 'pricing_strategies'), (snap) => {
      if (!snap.empty) setStrategies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubStdRetail = onSnapshot(doc(db, 'system_config', 'retail_standard_load_list'), (snap) => {
      if (snap.exists()) setStdRetailList(Array.isArray(snap.data()?.items) ? snap.data().items : []);
    });
    orderLookupUnsubsRef.current = [unsubSeg, unsubCat, unsubPl, unsubStrat, unsubStdRetail];
  }, [activeReturnTripId]);

  // System-Only QR & Cross-Tab Deep-Link Listener: expand filters, highlight exact trip card, open Return Modal or warn if Legacy
  useEffect(() => {
    const focusTripCard = (tripId, docVersion = '', openLatestDoc = '', docNumber = '', openReturn = '') => {
      if (!tripId && !docNumber) return;
      setDateFilter('all');
      setStatusFilter('all');
      setSearchTerm('');
      if (docVersion || openLatestDoc || docNumber || openReturn) {
        setScannedDocAlert({
          tripId: tripId || '',
          docVersion: Number(docVersion) || null,
          docNumber: docNumber || '',
          openLatestDoc: openLatestDoc === '1' || openLatestDoc === 'true',
          openReturn: openReturn === '1' || openReturn === 'true',
        });
      }
      if (tripId) {
        setTimeout(() => {
          highlightTargetRow(tripId);
        }, 350);
      }
    };

    const handleFocusEvent = (e) => {
      const tripId = e?.detail?.tripId || e?.detail?.recordId;
      const docNum = e?.detail?.docNumber || '';
      const openRet = e?.detail?.openReturn || '';
      if (tripId || docNum) {
        focusTripCard(tripId, e?.detail?.docVersion, e?.detail?.openLatestDoc, docNum, openRet);
      }
    };

    // Also inspect initial URL hash on mount (e.g. scanned QR opened in fresh browser tab)
    try {
      const rawHash = window.location.hash || '';
      const [, hQuery] = rawHash.replace(/^#/, '').split('?');
      if (hQuery) {
        const params = new URLSearchParams(hQuery);
        const initialTripId = params.get('tripId') || params.get('recordId');
        const initialDocNum = params.get('docNumber') || '';
        const initialOpenRet = params.get('openReturn') || '';
        if (initialTripId || initialDocNum) {
          focusTripCard(
            initialTripId,
            params.get('docVersion') || '',
            params.get('openLatestDoc') || '',
            initialDocNum,
            initialOpenRet
          );
        }
      }
    } catch (_) {}

    window.addEventListener('app_focus_trip_dispatch', handleFocusEvent);
    return () => window.removeEventListener('app_focus_trip_dispatch', handleFocusEvent);
  }, []);

  // Unified Staff & Workers Pool (`employees` SSOT + any unlinked `users`)
  useEffect(() => {
    let users = [];
    let emps = [];

    const rebuildPool = () => {
      setWorkerPool(
        buildUnifiedPersonnelPool({
          employees: emps,
          users,
          isAr,
        })
      );
    };

    const u1 = onSnapshot(collection(db, 'employees'), (s) => {
      emps = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEmployeesList(emps);
      rebuildPool();
    });
    const u2 = onSnapshot(collection(db, 'users'), (s) => {
      users = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSubscribedUsers(users);
      rebuildPool();
    });
    return () => {
      u1();
      u2();
    };
  }, [isAr]);

  const effectiveUsersList = usersList.length > 0 ? usersList : subscribedUsers;
  const eligibleOrderSettlers = useMemo(
    () =>
      resolveEligibleSalesOrderSettlers({
        users: effectiveUsersList,
        employees: employeesList,
        departments: departmentsList,
        departmentOverrides,
        userOverrides,
        excludeActorId: currentUser?.id || null,
      }),
    [effectiveUsersList, employeesList, departmentsList, departmentOverrides, userOverrides, currentUser?.id]
  );

  // Live SSOT FG Stock Matrix (to display live shelf balance hints inside Dispatch Modal)
  const stockMatrixSkuMap = useMemo(() => {
    const { skuMap } = buildFgStockMatrix({
      finishedProducts: products,
      stagedPallets,
      stockTransfers,
      faultyReturns,
      salesOrders: orders,
      truckDispatches,
    });
    return skuMap;
  }, [products, stagedPallets, stockTransfers, faultyReturns, orders, truckDispatches]);

  // All Catalog Trips sorted Most Recent First + Live Post-Dispatch Plan Drift Detection
  const allTrips = useMemo(() => {
    const rawTrips = buildTripsCatalog({
      orders,
      vehicles,
      truckDispatches,
      todayStr,
    });
    return rawTrips.map((trip) => ({
      ...trip,
      planDrift: detectPostDispatchPlanChanges({ trip, finishedProducts: products }),
    }));
  }, [orders, vehicles, truckDispatches, todayStr, products]);

  // Full Dispatch Documents Registry (canonical `dispatch_documents` + pre-numbering legacy archive, with live Valid/Legacy evaluation)
  const dispatchDocumentsRegistry = useMemo(() => {
    return buildDispatchDocumentsRegistry({
      registryDocs,
      truckDispatches,
      allTrips,
      orders,
    });
  }, [registryDocs, truckDispatches, allTrips, orders]);

  // Auto-open latest document / Return Modal if arrived via deep link,
  // or open the History Modal if scanning a QR whose trip is no longer linked to active trips
  useEffect(() => {
    if (!scannedDocAlert) return;
    if (scannedDocAlert.openReturn && scannedDocAlert.tripId && !loading) {
      const targetTrip = allTrips.find((t) => t.id === scannedDocAlert.tripId);
      if (targetTrip) {
        if (targetTrip.needsReturnInspection) {
          setActiveReturnTripId(targetTrip.id);
        } else {
          setTimeout(() => highlightTargetRow(targetTrip.id), 250);
        }
        setScannedDocAlert(null);
        return;
      }
    }
    if (scannedDocAlert.openLatestDoc && scannedDocAlert.tripId) {
      const targetTrip = allTrips.find((t) => t.id === scannedDocAlert.tripId);
      if (targetTrip) {
        const versions = Array.isArray(targetTrip.dispatchDoc?.dispatchDocVersions)
          ? targetTrip.dispatchDoc.dispatchDocVersions
          : [];
        const currentVer = versions.find((v) => v.status === 'current');
        if (currentVer) {
          setScannedDocAlert(null);
          handleOpenSavedDocVersion(targetTrip, currentVer);
          return;
        }
      }
    }
    if (scannedDocAlert.docNumber && !loading) {
      const targetTrip = scannedDocAlert.tripId
        ? allTrips.find((t) => t.id === scannedDocAlert.tripId)
        : null;
      if (!targetTrip) {
        setHighlightHistoryDocNumber(scannedDocAlert.docNumber);
        setIsDocsHistoryOpen(true);
        setScannedDocAlert(null);
      }
    }
  }, [scannedDocAlert, allTrips, loading]);

  // URL Deep-Link Highlight Auto-Focus (switches to 'all' if highlighted trip isn't today)
  useEffect(() => {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const hId = params.get('highlight');
    if (hId) {
      const targetTrip = allTrips.find((t) => t.id === hId);
      if (targetTrip && targetTrip.loadingDate !== todayStr) {
        setDateFilter('all');
      }
    }
  }, [allTrips.length, todayStr]);

  const filteredTrips = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allTrips.filter((t) => {
      if (dateFilter === 'today' && t.loadingDate !== todayStr) return false;
      if (dateFilter === 'custom' && customDate && t.loadingDate !== customDate) return false;

      if (statusFilter === 'ready_to_load' && t.tripStage !== 'ready_to_load') return false;
      if (
        statusFilter === 'loaded' &&
        !['loaded_pending_docs', 'dispatched', 'delivered', 'reconciled'].includes(t.tripStage)
      ) {
        return false;
      }
      if (statusFilter === 'delivered' && !t.allDelivered) return false;
      if (statusFilter === 'return_needed' && !t.hasPendingReturnAction) return false;
      if (statusFilter === 'discrepancy' && !t.returnDiscrepancy?.hasDiscrepancy) return false;
      if (statusFilter === 'pending' && t.tripStage !== 'pending') return false;

      if (q) {
        const vehMatch = (t.vehicleDisplayName || '').toLowerCase().includes(q);
        const drvMatch = (t.primaryDriverName || '').toLowerCase().includes(q);
        const tripNumMatch = `#${t.loadingOrderNumber}`.includes(q) || `lo-${t.loadingOrderNumber}`.includes(q);
        const orderMatch = t.orders.some(
          (o) =>
            (o.clientName || '').toLowerCase().includes(q) ||
            String(o.serial || o.id || '').toLowerCase().includes(q)
        );
        if (!vehMatch && !drvMatch && !tripNumMatch && !orderMatch) return false;
      }
      return true;
    });
  }, [allTrips, dateFilter, customDate, todayStr, statusFilter, searchTerm]);

  const activeDispatchTrip = useMemo(
    () => allTrips.find((t) => t.id === activeDispatchTripId) || null,
    [allTrips, activeDispatchTripId]
  );

  const activeReturnTrip = useMemo(
    () => allTrips.find((t) => t.id === activeReturnTripId) || null,
    [allTrips, activeReturnTripId]
  );

  const auditTrip = useMemo(
    () => allTrips.find((t) => t.id === auditTripId) || null,
    [allTrips, auditTripId]
  );

  const versionsModalTrip = useMemo(
    () => allTrips.find((t) => t.id === versionsModalTripId) || null,
    [allTrips, versionsModalTripId]
  );

  // KPI Counters scoped to visible date window ('today' by default)
  const kpiTripsPool = useMemo(() => {
    if (dateFilter === 'today') return allTrips.filter((t) => t.loadingDate === todayStr);
    if (dateFilter === 'custom' && customDate) return allTrips.filter((t) => t.loadingDate === customDate);
    return allTrips;
  }, [allTrips, dateFilter, customDate, todayStr]);

  const kpis = useMemo(() => {
    const totalTrips = kpiTripsPool.length;
    const readyToLoad = kpiTripsPool.filter((t) => t.tripStage === 'ready_to_load').length;
    const whLoaded = kpiTripsPool.filter((t) => t.isWarehouseConfirmed).length;
    const pendingReturns = allTrips.filter((t) => t.hasPendingReturnAction).length;
    const totalExtrasOut = roundQty(
      kpiTripsPool
        .filter((t) => t.returnHandshakeStatus !== 'reconciled')
        .reduce((s, t) => s + t.totalExtrasCartons, 0)
    );
    return { totalTrips, readyToLoad, whLoaded, pendingReturns, totalExtrasOut };
  }, [kpiTripsPool, allTrips]);

  if (loading) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <PeacockLoader size="lg" text={isAr ? 'جاري تحميل رحلات وأذون الشاحنات...' : 'Loading Truck Dispatches...'} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1600px] w-full mx-auto pb-16">
      {toastMsg && (
        <div
          className={`fixed top-16 end-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg border text-xs font-bold animate-in fade-in ${
            toastMsg.type === 'warning'
              ? 'bg-amber-600 text-white border-amber-700'
              : 'bg-emerald-600 text-white border-emerald-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg.message}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 block">
            {dateFilter === 'today' ? (isAr ? 'رحلات اليوم' : "Today's Trips") : (isAr ? 'إجمالي الرحلات' : 'Total Trips')}
          </span>
          <span className="text-xl font-black font-mono text-slate-900">{kpis.totalTrips}</span>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-800 block">
            {isAr ? 'جاهزة للتحميل (Preparing)' : 'Ready to Load (Preparing)'}
          </span>
          <span className="text-xl font-black font-mono text-amber-900">{kpis.readyToLoad}</span>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-800 block">
            {isAr ? 'معتمدة مخزنياً ✓' : 'WH Dispatched ✓'}
          </span>
          <span className="text-xl font-black font-mono text-emerald-900">{kpis.whLoaded}</span>
        </div>

        <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] font-bold text-teal-800 block">
            {isAr ? 'زيادات رحلات بالخارج' : 'Extras Out on Road'}
          </span>
          <span className="text-xl font-black font-mono text-teal-900">
            {fmtCtn(kpis.totalExtrasOut)} <span className="text-xs font-sans font-bold">{isAr ? 'كرتونة' : 'ctn'}</span>
          </span>
        </div>

        <div
          className={`rounded-2xl p-3 border shadow-2xs ${
            kpis.pendingReturns > 0 ? 'bg-rose-50/80 border-rose-200' : 'bg-white border-slate-200'
          }`}
        >
          <span className={`text-[11px] font-bold block ${kpis.pendingReturns > 0 ? 'text-rose-800' : 'text-slate-400'}`}>
            {isAr ? 'بانتظار تسوية / تأكيد مرتجع' : 'Pending Return Handshake'}
          </span>
          <span className={`text-xl font-black font-mono ${kpis.pendingReturns > 0 ? 'text-rose-800' : 'text-slate-900'}`}>
            {kpis.pendingReturns}
          </span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Focus Date Switcher (Default: Today) */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateFilter === 'today' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? `اليوم (${todayStr})` : `Today (${todayStr})`}
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateFilter === 'all' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'الأحدث أولاً (الكل)' : 'Most Recent (All)'}
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('custom')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                dateFilter === 'custom' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isAr ? 'تاريخ محدد' : 'Pick Date'}
            </button>
          </div>

          {dateFilter === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="text-xs font-mono font-bold border border-slate-300 rounded-xl px-2.5 py-1.5 outline-none focus:border-teal-600"
            />
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-bold border border-slate-300 rounded-xl px-3 py-1.5 bg-white outline-none focus:border-teal-600"
          >
            <option value="all">{isAr ? 'كل حالات الرحلات' : 'All Trip Stages'}</option>
            <option value="ready_to_load">{isAr ? 'جاري التجهيز (جاهز للتحميل)' : 'Preparing (Ready to Load)'}</option>
            <option value="loaded">{isAr ? 'تم التحميل / جاري التوصيل' : 'Loaded / Out for Delivery'}</option>
            <option value="delivered">{isAr ? 'تم التسليم ✓' : 'Delivered ✓'}</option>
            <option value="return_needed">{isAr ? 'يتطلب تأكيد / مطابقة مرتجع' : 'Return Inspection Needed'}</option>
            <option value="discrepancy">{isAr ? 'فرق مرتجعات ⚠️' : 'Return Discrepancy ⚠️'}</option>
            <option value="pending">{isAr ? 'قيد الانتظار (Pending)' : 'Pending (Disabled)'}</option>
          </select>
        </div>

        {/* Search & Full Printed Documents History Trigger */}
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث برقم الرحلة، الشاحنة، السائق أو العميل...' : 'Search Trip #, truck, driver or client...'}
              className="w-full ps-9 pe-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:border-teal-600 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setHighlightHistoryDocNumber('');
              setIsDocsHistoryOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition cursor-pointer shadow-2xs shrink-0"
            title={
              isAr
                ? 'عرض السجل الكامل لمستندات الصرف المطبوعة (السارية والقديمة وغير المرتبطة)'
                : 'View full registry of printed dispatch documents (Valid, Legacy & Unlinked)'
            }
          >
            <FileText className="w-3.5 h-3.5 text-teal-300" />
            <span>{isAr ? 'سجل المستندات' : 'Docs History'}</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/15 font-mono text-[10.5px] font-black">
              {dispatchDocumentsRegistry.length}
            </span>
          </button>
        </div>
      </div>

      {/* Trips List (Sorted Most Recent First) */}
      {filteredTrips.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-2 shadow-2xs">
          <Truck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-700">
            {dateFilter === 'today'
              ? (isAr ? 'لا توجد رحلات مجدولة لهذا اليوم حتى الآن.' : 'No scheduled trips found for Today yet.')
              : (isAr ? 'لا توجد رحلات مطابقة لمعايير البحث.' : 'No trips match the active filters.')}
          </p>
          {dateFilter === 'today' && allTrips.length > 0 && (
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className="mt-2 px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
            >
              {isAr ? `عرض أحدث الرحلات (${allTrips.length})` : `Show Most Recent Trips (${allTrips.length})`}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrips.map((trip) => {
            const isDisabledPending = !trip.isLoadingUnlocked;
            const dDoc = trip.dispatchDoc;
            const hasRetDisc = Boolean(trip.returnDiscrepancy?.hasDiscrepancy);

            return (
              <div
                key={trip.id}
                id={`row-${trip.id}`}
                data-highlight-id={trip.id}
                className={`rounded-3xl border p-4 transition-all shadow-2xs ${
                  hasRetDisc
                    ? 'bg-rose-50/55 border-rose-400 ring-2 ring-rose-300/60'
                    : isDisabledPending
                    ? 'bg-slate-100/80 border-slate-200 opacity-75'
                    : trip.allDelivered || trip.tripStage === 'reconciled'
                    ? 'bg-emerald-50/35 border-emerald-200'
                    : trip.allDispatchedOut
                    ? 'bg-sky-50/35 border-sky-200'
                    : trip.isWarehouseConfirmed
                    ? 'bg-teal-50/35 border-teal-300'
                    : 'bg-amber-50/45 border-amber-300'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left Identity & Dual Gate Badges */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-xl bg-slate-900 text-white shadow-2xs">
                        <span className="text-[10px] font-normal text-slate-300 leading-none">
                          {isAr ? 'رحلة#' : 'Trip#'}
                        </span>
                        <span className="font-mono text-base font-black leading-none">
                          {trip.loadingOrderNumber}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-mono font-bold text-slate-700">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {trip.loadingDate}
                      </span>

                      {/* Synced Fulfillment Status Badge (SSOT across Sales Orders, Loading Plan & Truck Dispatch) */}
                      {isDisabledPending ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-200 text-slate-600 text-[11px] font-extrabold">
                          <Clock className="w-3 h-3" />
                          {isAr ? 'قيد الانتظار (مغلق لحين التجهيز)' : 'Pending — Disabled'}
                        </span>
                      ) : trip.allPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-300 text-[11px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'مدفوع ✓' : 'Paid ✓'}
                        </span>
                      ) : trip.allDelivered ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'تم التسليم ✓' : 'Delivered ✓'}
                        </span>
                      ) : trip.allDispatchedOut ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-black">
                          <Truck className="w-3 h-3" />
                          {isAr ? 'جاري التوصيل' : 'Out for Delivery'}
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black">
                            <Boxes className="w-3 h-3" />
                            {isAr ? 'جاري التجهيز' : 'Preparing'}
                          </span>
                          {trip.isWarehouseConfirmed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-100 text-teal-900 border border-teal-300 text-[10.5px] font-black">
                              <PackageCheck className="w-3 h-3" />
                              {isAr ? 'تم التحميل بالمخزن ✓' : 'WH Loaded ✓'}
                            </span>
                          )}
                        </>
                      )}

                      {/* Companion Return Handshake & Discrepancy Alert Chips */}
                      {trip.returnHandshakeStatus === 'reconciled' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10.5px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'مرتجع مطابق ✓' : 'Return Reconciled ✓'}
                        </span>
                      )}
                      {hasRetDisc && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-400 text-[10.5px] font-black animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          {isAr
                            ? `⚠️ فرق مرتجع (${trip.returnDiscrepancy.netVariance > 0 ? '+' : ''}${trip.returnDiscrepancy.netVariance} كرتونة)`
                            : `⚠️ Return Variance (${trip.returnDiscrepancy.netVariance > 0 ? '+' : ''}${trip.returnDiscrepancy.netVariance} ctn)`}
                        </span>
                      )}
                      {trip.returnHandshakeStatus === 'pending_accounting_confirm' && !hasRetDisc && (
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-black animate-pulse">
                          {isAr ? 'تم استلام المخزن — بانتظار تأكيد المحاسبة' : 'WH Received — Pending Acct Align'}
                        </span>
                      )}
                      {trip.returnHandshakeStatus === 'pending_wh_confirm' && !hasRetDisc && (
                        <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 text-[10px] font-black animate-pulse">
                          {isAr ? 'بانتظار تأكيد استلام المخزن' : 'Pending WH Receipt Confirm'}
                        </span>
                      )}
                      {trip.returnDiscrepancy?.hasOpenSettlementTask && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                          {isAr
                            ? `مهمة تسوية أوامر (${trip.returnDiscrepancy.openSettlementTasks.length})`
                            : `Order Task Open (${trip.returnDiscrepancy.openSettlementTasks.length})`}
                        </span>
                      )}
                      {dDoc?.stockReturnDate && (Boolean(dDoc?.whReturnConfirmedAt) || trip.returnHandshakeStatus === 'reconciled') && dDoc.stockReturnDate > todayStr && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-mono font-bold">
                          {isAr ? `يُضاف للمخزن: ${dDoc.stockReturnDate}` : `Deferred to: ${dDoc.stockReturnDate}`}
                        </span>
                      )}
                    </div>

                    {/* Vehicle (Name/Model only + Copy Plate Icon), Driver & Summary Cartons */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-bold">
                      <span className="inline-flex items-center gap-1.5 text-slate-900 font-extrabold">
                        <Truck className="w-3.5 h-3.5 text-teal-600 rtl:-scale-x-100" />
                        <span>{trip.vehicleDisplayName}</span>
                        {trip.plateNumber && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPlateNumber(trip);
                            }}
                            title={isAr ? `نسخ رقم اللوحة (${trip.plateNumber})` : `Copy Plate # (${trip.plateNumber})`}
                            className={`p-1 rounded-lg border transition cursor-pointer ${
                              copiedPlateTripId === trip.id
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {copiedPlateTripId === trip.id ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </span>
                      {trip.primaryDriverName && (
                        <span>{isAr ? 'السائق:' : 'Driver:'} <strong className="text-slate-800">{trip.primaryDriverName}</strong></span>
                      )}
                      <span>
                        {isAr ? 'الطلبات:' : 'Orders:'} <strong className="font-mono text-slate-900">{trip.orders.length}</strong>
                      </span>

                      {/* Clickable Quantity Chip (+ Extras) with Non-Intrusive Breakdown & Weight Indicator Popover */}
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenQtyTooltipTripId((curr) => (curr === trip.id ? null : trip.id))
                          }
                          title={
                            isAr
                              ? 'انقر لعرض تفاصيل كميات الأصناف والزيادات ومؤشر الحمولة'
                              : 'Click for product quantities, extras & truck weight indicator'
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border font-mono text-xs font-black transition cursor-pointer shadow-2xs ${
                            openQtyTooltipTripId === trip.id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-amber-50 hover:bg-amber-100 text-slate-900 border-amber-200'
                          }`}
                        >
                          <Boxes className={`w-3.5 h-3.5 shrink-0 ${openQtyTooltipTripId === trip.id ? 'text-teal-300' : 'text-amber-600'}`} />
                          <span>{fmtCtn(trip.totalLockedCartons)}</span>
                          {trip.totalExtrasCartons > 0 && (
                            <span
                              className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                                openQtyTooltipTripId === trip.id
                                  ? 'bg-teal-500/25 text-teal-200'
                                  : 'bg-teal-100 text-teal-800 border border-teal-200'
                              }`}
                            >
                              +{fmtCtn(trip.totalExtrasCartons)} {isAr ? 'زيادات' : 'ext'}
                            </span>
                          )}
                          {trip.hasDeliverySettlementDiff && (
                            <span
                              className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                                openQtyTooltipTripId === trip.id
                                  ? 'bg-emerald-500/25 text-emerald-200'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}
                              title={
                                isAr
                                  ? 'إجمالي الكمية المُسلَّمة الفعلية بعد تسوية أوامر البيع (المُصرف من البوابة ثابت كما هو)'
                                  : 'Actual delivered cartons after post-dispatch order settlement (Gate dispatched unchanged)'
                              }
                            >
                              {isAr ? `مُسلَّم: ${fmtCtn(trip.totalDeliveredCartons)}` : `Deliv: ${fmtCtn(trip.totalDeliveredCartons)}`}
                            </span>
                          )}
                        </button>

                        {openQtyTooltipTripId === trip.id && (() => {
                          const { columns: summaryCols } = buildTripDispatchMatrix({
                            tripOrders: trip.orders,
                            finishedProducts: products,
                            existingDispatch: dDoc,
                          });
                          const extrasWeightKg = summaryCols.reduce(
                            (s, c) => s + Number(c.extraQty || 0) * Number(c.largeUnitWeightKg || 0),
                            0
                          );
                          const totalLoadKg = roundQty(Number(trip.totalWeightKg || 0) + extrasWeightKg);
                          const maxCapKg = Number(trip.vehicleObj?.maxCapacityKg || 0);
                          const totalTons = totalLoadKg / 1000;
                          const maxTons = maxCapKg / 1000;
                          const capPct = maxCapKg > 0 ? Math.min(100, Math.round((totalLoadKg / maxCapKg) * 100)) : 0;
                          const isOver = maxCapKg > 0 && totalLoadKg > maxCapKg;
                          const isHigh = !isOver && maxCapKg > 0 && capPct >= 85;

                          return (
                            <div className="absolute top-full mt-2 start-0 z-40 w-[330px] sm:w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 text-start animate-in fade-in zoom-in-95 duration-150">
                              {/* Popover Header + Weight Indicator */}
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                                  <Scale className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                  <span>{isAr ? 'توزيع الكميات والوزن' : 'Product Qty & Weight'}</span>
                                </div>
                                <div
                                  className={`px-2 py-0.5 rounded-lg font-mono text-[11px] font-black border ${
                                    isOver
                                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                                      : isHigh
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  {maxCapKg > 0
                                    ? `${totalTons.toFixed(2)} / ${maxTons.toFixed(2)} ${isAr ? 'طن' : 'Ton'}`
                                    : `${totalTons.toFixed(2)} ${isAr ? 'طن' : 'Ton'}`}
                                </div>
                              </div>

                              {maxCapKg > 0 && (
                                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      isOver ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${capPct}%` }}
                                  />
                                </div>
                              )}

                              {/* Product Breakdown Table (No Client / Order columns) */}
                              <div className="mt-2.5 max-h-60 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full border-collapse text-[11px] text-start">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                                      <th className="py-1.5 px-2 text-start">{isAr ? 'الصنف / التعبئة' : 'Product / Packing'}</th>
                                      <th className="py-1.5 px-1.5 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                                      <th className="py-1.5 px-1.5 text-center text-teal-700">{isAr ? 'زيادات' : 'Extras'}</th>
                                      <th className="py-1.5 px-2 text-center">{isAr ? 'الإجمالي' : 'Total'}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {summaryCols.map((col) => {
                                      const colTot = roundQty(Number(col.lockedQty || 0) + Number(col.extraQty || 0));
                                      return (
                                        <tr key={col.colKey} className="hover:bg-slate-50/70">
                                          <td className="py-1.5 px-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              {col.imageFile && (
                                                <img
                                                  src={col.imageFile}
                                                  alt=""
                                                  className="w-5 h-5 rounded object-cover border border-slate-200 shrink-0"
                                                />
                                              )}
                                              <div className="min-w-0">
                                                <div className="font-extrabold text-slate-900 truncate max-w-[165px]">
                                                  {isAr ? col.shortNameAr : col.shortNameEn}
                                                </div>
                                                <div className="text-[9px] text-indigo-700 font-bold truncate">
                                                  {isAr ? col.optionNameAr : col.optionNameEn}
                                                  <span className="font-mono text-slate-400 ms-1">{col.optionCode}</span>
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-1.5 px-1.5 text-center font-mono font-bold text-slate-800">
                                            {fmtCtn(col.lockedQty)}
                                          </td>
                                          <td className="py-1.5 px-1.5 text-center font-mono font-black text-teal-700">
                                            {Number(col.extraQty || 0) > 0 ? `+${fmtCtn(col.extraQty)}` : <span className="text-slate-300">—</span>}
                                          </td>
                                          <td className="py-1.5 px-2 text-center font-mono font-black text-slate-900">
                                            {fmtCtn(colTot)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-slate-900 text-white font-black">
                                      <td className="py-1.5 px-2 text-[10px]">{isAr ? 'الإجمالي' : 'Total'}</td>
                                      <td className="py-1.5 px-1.5 text-center font-mono">{fmtCtn(trip.totalLockedCartons)}</td>
                                      <td className="py-1.5 px-1.5 text-center font-mono text-teal-300">
                                        {trip.totalExtrasCartons > 0 ? `+${fmtCtn(trip.totalExtrasCartons)}` : '0'}
                                      </td>
                                      <td className="py-1.5 px-2 text-center font-mono text-emerald-300">
                                        {fmtCtn(trip.totalDispatchedCartons)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Clients & Crew Quick Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {(() => {
                        const distinctStops = new Set(
                          trip.orders.map((ord) => `${ord.clientId || ord.clientName}::${ord.branchId || ord.branchName || 'main'}`)
                        );
                        const isMultiClient = distinctStops.size > 1;
                        const sortedOrders = [...trip.orders].sort((a, b) => {
                          const sa = Number(a.deliverySequence) > 0 ? Number(a.deliverySequence) : Infinity;
                          const sb = Number(b.deliverySequence) > 0 ? Number(b.deliverySequence) : Infinity;
                          return sa - sb;
                        });
                        return sortedOrders.map((o) => {
                          const orderSerial = o.serial || String(o.id || '').replace(/^SO-/, '');
                          const seqNum = Number(o.deliverySequence) > 0 ? Math.floor(Number(o.deliverySequence)) : null;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                const hashUrl = `#sales_orders?module=sales&focusOrder=${encodeURIComponent(orderSerial)}&orderId=${encodeURIComponent(o.id)}`;
                                window.location.hash = hashUrl;
                                window.dispatchEvent(
                                  new CustomEvent('app-navigate', {
                                    detail: { tab: 'sales_orders', module: 'sales', orderId: o.id, focusOrder: orderSerial },
                                  })
                                );
                              }}
                              title={isAr ? `عرض الأمر #${orderSerial} في تبويب أوامر البيع` : `Open order #${orderSerial} in Sales Orders`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-[10px] font-bold text-slate-700 hover:text-indigo-800 transition cursor-pointer"
                            >
                              {isMultiClient && seqNum && (
                                <span
                                  className="px-1 py-0.2 rounded bg-indigo-600 text-white font-mono text-[9px] font-black leading-tight"
                                  title={isAr ? `أولوية التسليم #${seqNum}` : `Delivery Priority #${seqNum}`}
                                >
                                  #{seqNum}
                                </span>
                              )}
                              <span className="font-mono text-slate-400">#{orderSerial}</span>
                              <span>{o.clientName || '—'}</span>
                            </button>
                          );
                        });
                      })()}
                      {(dDoc?.loadingWorkers?.length > 0 || dDoc?.offloadingWorkers?.length > 0) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-800">
                          <Users className="w-3 h-3" />
                          {isAr
                            ? `تحميل: ${dDoc.loadingWorkers?.length || 0} | تفريغ: ${dDoc.offloadingWorkers?.length || 0}`
                            : `Loaders: ${dDoc.loadingWorkers?.length || 0} | Offloaders: ${dDoc.offloadingWorkers?.length || 0}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <RowCommentButton
                      tab="truck_dispatch"
                      recordId={trip.id}
                      recordTitle={`${isAr ? 'رحلة' : 'Trip'} #${trip.loadingOrderNumber} (${trip.loadingDate})`}
                      currentUser={currentUser}
                    />

                    {/* Smart Print Dispatch Document Button + Direct Legacy Docs Button */}
                    {trip.isWarehouseConfirmed && (() => {
                      const docVersions = getEffectiveDocVersions(trip);
                      const latestVerNum = Number(dDoc?.latestDispatchDocVersion || docVersions.length || 0);
                      const hasDrift = Boolean(trip.planDrift?.hasPlanDrift);
                      const rawPrintState = getDocPrintStatus(
                        dDoc?.dispatchPrintedAt,
                        dDoc?.dispatchContentUpdatedAt || dDoc?.updatedAt || dDoc?.dispatchedAt
                      );
                      const dispPrintState = hasDrift && dDoc?.dispatchPrintedAt ? 'printed_stale' : rawPrintState;
                      const legacyCount = docVersions.filter(
                        (v) => v.status === 'superseded' || hasDrift || (latestVerNum > 0 && Number(v.versionNumber) < latestVerNum)
                      ).length;
                      const cls =
                        dispPrintState === 'printed_stale'
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300 animate-pulse'
                          : dispPrintState === 'printed_current'
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300';
                      const dispDocNum = dDoc?.latestDispatchDocNumber || '';
                      const verTag = dispDocNum
                        ? ` ${dispDocNum}`
                        : latestVerNum > 0
                        ? ` v${latestVerNum}`
                        : '';
                      const label =
                        dispPrintState === 'printed_stale'
                          ? (isAr ? `صرف: إعادة طباعة (v${latestVerNum + 1})` : `Dispatch: Reprint (v${latestVerNum + 1})`)
                          : dispPrintState === 'printed_current'
                          ? (isAr ? `صرف${verTag} ✓` : `Dispatch${verTag} ✓`)
                          : (isAr ? 'طباعة الصرف' : 'Print Dispatch');
                      const tip =
                        dispPrintState === 'printed_stale'
                          ? (isAr ? 'تم تعديل خطة الرحلة أو بيان الصرف بعد آخر طباعة — يرجى إعادة الطباعة' : 'Plan or dispatch edited after last print — reprint needed')
                          : dispPrintState === 'printed_current'
                          ? (isAr ? 'تمت طباعة أحدث نسخة من إذن الصرف' : 'Latest dispatch document already printed')
                          : (isAr ? 'لم تتم طباعة إذن الصرف بعد' : 'Dispatch document not printed yet');

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePrintPlaceholderDoc(trip, 'dispatch')}
                            title={tip}
                            className={`px-2.5 py-2 rounded-xl border text-[11px] font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${cls}`}
                          >
                            <Printer className="w-3.5 h-3.5 shrink-0" />
                            <span>{label}</span>
                          </button>
                          {legacyCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setVersionsModalTab('docs');
                                setVersionsModalTripId(trip.id);
                              }}
                              title={isAr ? 'عرض وطباعة مستندات الصرف السابقة (القديمة قبل التعديل)' : 'View & print legacy (previously printed) dispatch documents'}
                              className="px-2.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{isAr ? `مستندات سابقة (${legacyCount})` : `Legacy Docs (${legacyCount})`}</span>
                            </button>
                          )}
                        </>
                      );
                    })()}

                    {/* Smart Print Return Document Button (includes RET-XXXXX & highlights Return Discrepancy) */}
                    {(Boolean(dDoc?.returnContentUpdatedAt || dDoc?.whReturnConfirmedAt || dDoc?.accountantReturnSubmittedAt) || trip.returnHandshakeStatus === 'reconciled') && (() => {
                      const retPrintState = getDocPrintStatus(
                        dDoc?.returnPrintedAt,
                        dDoc?.returnContentUpdatedAt || dDoc?.whReturnConfirmedAt || dDoc?.accountantReturnSubmittedAt
                      );
                      const retDocNum = dDoc?.latestReturnDocNumber || '';
                      const retTag = retDocNum ? ` ${retDocNum}` : '';
                      const cls = hasRetDisc
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-400 animate-pulse'
                        : retPrintState === 'printed_stale'
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                        : retPrintState === 'printed_current'
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300';
                      const label = hasRetDisc
                        ? (isAr ? `⚠️ مرتجع${retTag} (فرق)` : `⚠️ Return${retTag} (Var)`)
                        : retPrintState === 'printed_stale'
                        ? (isAr ? 'مرتجع: إعادة طباعة' : 'Return: Reprint')
                        : retPrintState === 'printed_current'
                        ? (isAr ? `مرتجع${retTag} ✓` : `Return${retTag} ✓`)
                        : (isAr ? 'طباعة المرتجع' : 'Print Return');
                      const tip = hasRetDisc
                        ? (isAr ? 'يوجد فرق بين المرتجع المتوقع والمستلم — انقر لطباعة/معاينة إذن المرتجع' : 'Return discrepancy detected — print Return Doc')
                        : retPrintState === 'printed_stale'
                        ? (isAr ? 'تم تعديل المرتجعات بعد آخر طباعة — يرجى إعادة الطباعة' : 'Return edited after last print — reprint needed')
                        : retPrintState === 'printed_current'
                        ? (isAr ? 'تمت طباعة أحدث نسخة من إذن المرتجع' : 'Latest return document already printed')
                        : (isAr ? 'لم تتم طباعة إذن المرتجع بعد' : 'Return document not printed yet');

                      return (
                        <button
                          type="button"
                          onClick={() => handlePrintPlaceholderDoc(trip, 'return')}
                          title={tip}
                          className={`px-2.5 py-2 rounded-xl border text-[11px] font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer ${cls}`}
                        >
                          <Printer className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono">{label}</span>
                        </button>
                      );
                    })()}

                    {/* Single Primary Stage Button: Pending -> Start Truck Dispatch -> Return / Receiving */}
                    {!trip.isWarehouseConfirmed ? (
                      <button
                        type="button"
                        disabled={isDisabledPending}
                        onClick={() => {
                          setActiveDispatchMode('edit');
                          setActiveDispatchTripId(trip.id);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer ${
                          isDisabledPending
                            ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                            : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                        }`}
                        title={
                          isDisabledPending
                            ? (isAr ? 'معطل حتى تتحول حالة الطلبات إلى قيد التجهيز في خطة التحميل' : 'Disabled until orders move to Preparing in Loading Plan')
                            : (isAr ? 'فتح مصفوفة التحميل والعمالة والزيادات' : 'Open Dispatch Matrix, Extras & Labour')
                        }
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>
                          {isDisabledPending
                            ? (isAr ? 'بانتظار التجهيز' : 'Disabled (Pending)')
                            : (isAr ? 'بدء التحميل والصرف' : 'Start Truck Dispatch')}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!trip.needsReturnInspection}
                        onClick={() => setActiveReturnTripId(trip.id)}
                        title={
                          !trip.needsReturnInspection
                            ? (isAr ? 'متاح فور خروج الرحلة إلى قيد التسليم (Shipped)' : 'Unlocks once trip moves to Shipped / Out for Delivery')
                            : (isAr ? 'فتح نافذة استلام ومطابقة المرتجعات' : 'Open Return / Receiving Inspection')
                        }
                        className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                          !trip.needsReturnInspection
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            : hasRetDisc
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer animate-pulse'
                            : trip.returnHandshakeStatus === 'pending_accounting_confirm'
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm cursor-pointer'
                            : trip.returnHandshakeStatus === 'pending_wh_confirm'
                            ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm cursor-pointer'
                            : trip.returnHandshakeStatus === 'reconciled'
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-pointer'
                            : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm cursor-pointer'
                        }`}
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>
                          {hasRetDisc
                            ? (isAr ? '⚠️ فرق مرتجع — تسوية' : '⚠️ Review Discrepancy')
                            : trip.returnHandshakeStatus === 'reconciled'
                            ? (isAr ? 'مرتجعات (مطابق ✓)' : 'Return / Receive ✓')
                            : trip.returnHandshakeStatus === 'pending_accounting_confirm'
                            ? (isAr ? 'مطابقة الحسابات ⏳' : 'Acct Alignment ⏳')
                            : (isAr ? 'استلام / مرتجع' : 'Return / Receive')}
                        </span>
                      </button>
                    )}

                    {/* 3-Vertical-Dots Secondary Actions Menu (View, Edit, Audit Trail) */}
                    {!isDisabledPending && (
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenMenuTripId((curr) => (curr === trip.id ? null : trip.id))}
                          className={`p-2 rounded-xl border transition cursor-pointer ${
                            openMenuTripId === trip.id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                          title={isAr ? 'خيارات إضافية (عرض، تعديل، سجل المراجعة)' : 'More actions (View, Edit, Audit Trail)'}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenuTripId === trip.id && (
                          <div className="absolute end-0 mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 text-start animate-in fade-in zoom-in-95 duration-100">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuTripId(null);
                                setActiveDispatchMode('view');
                                setActiveDispatchTripId(trip.id);
                              }}
                              className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>{isAr ? 'عرض بيان الصرف' : 'View Dispatch'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={trip.isWarehouseConfirmed ? !canEditDispatchedTrip : !canDispatchTruck}
                              onClick={() => {
                                setOpenMenuTripId(null);
                                setActiveDispatchMode('edit');
                                setActiveDispatchTripId(trip.id);
                              }}
                              className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-800 disabled:text-slate-300 disabled:hover:bg-white flex items-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                              <span>{isAr ? 'تعديل بيان الصرف' : 'Edit Dispatch'}</span>
                            </button>

                            <div className="my-1 border-t border-slate-100" />

                            {(() => {
                              const effVers = getEffectiveDocVersions(trip);
                              const histLen = Array.isArray(dDoc?.dispatchHistory) ? dDoc.dispatchHistory.length : 0;
                              return (
                                <button
                                  type="button"
                                  disabled={effVers.length === 0 && histLen === 0}
                                  onClick={() => {
                                    setOpenMenuTripId(null);
                                    setVersionsModalTab('docs');
                                    setVersionsModalTripId(trip.id);
                                  }}
                                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-900 disabled:text-slate-300 disabled:hover:bg-white flex items-center justify-between gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <FileCheck2 className="w-3.5 h-3.5 text-amber-600" />
                                    <span>{isAr ? 'إصدارات المستند والسجل' : 'Doc Versions & History'}</span>
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded-md bg-amber-100 font-mono text-[10px] font-black text-amber-900">
                                    {effVers.length}
                                  </span>
                                </button>
                              );
                            })()}

                            <button
                              type="button"
                              disabled={!Array.isArray(dDoc?.auditTrail) || dDoc.auditTrail.length === 0}
                              onClick={() => {
                                setOpenMenuTripId(null);
                                setAuditTripId(trip.id);
                              }}
                              className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 disabled:text-slate-300 disabled:hover:bg-white flex items-center justify-between gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                            >
                              <span className="inline-flex items-center gap-2">
                                <History className="w-3.5 h-3.5 text-indigo-600" />
                                <span>{isAr ? 'سجل المراجعة' : 'Audit Trail'}</span>
                              </span>
                              <span className="px-1.5 py-0.2 rounded-md bg-slate-100 font-mono text-[10px] font-black text-slate-700">
                                {dDoc?.auditTrail?.length || 0}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scanned Legacy Paper QR Warning Banner (if user scanned an older printed vN QR) */}
                {scannedDocAlert && scannedDocAlert.tripId === trip.id && scannedDocAlert.docVersion && (() => {
                  const latestVer = Number(dDoc?.latestDispatchDocVersion || dDoc?.dispatchDocVersions?.length || 0);
                  const isOlder = (latestVer > 0 && scannedDocAlert.docVersion < latestVer) || Boolean(trip.planDrift?.hasPlanDrift);
                  if (!isOlder) return null;
                  const currentVerObj = (dDoc?.dispatchDocVersions || []).find((v) => v.status === 'current');
                  const isNewReleased = Boolean(currentVerObj && currentVerObj.versionNumber > scannedDocAlert.docVersion && !trip.planDrift?.hasPlanDrift);
                  return (
                    <div className="mt-3 p-3 rounded-2xl bg-amber-50 border-2 border-amber-400 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                      <div className="flex items-center gap-2 font-black">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {isAr
                            ? `تنبيه: المستند الممسوح (إصدار #${scannedDocAlert.docVersion}) هو نسخة قديمة قبل التعديل! ${isNewReleased ? `تم إصدار النسخة الأحدث (#${currentVerObj.versionNumber}).` : 'لم يتم إصدار المستند الجديد بعد.'}`
                            : `Warning: Scanned paper (v${scannedDocAlert.docVersion}) is a legacy superseded document! ${isNewReleased ? `Latest version v${currentVerObj.versionNumber} is available.` : 'New version not yet released.'}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isNewReleased && (
                          <button
                            type="button"
                            onClick={() => handleOpenSavedDocVersion(trip, currentVerObj)}
                            className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black cursor-pointer"
                          >
                            {isAr ? `فتح المستند الجديد (v${currentVerObj.versionNumber})` : `Open Latest (v${currentVerObj.versionNumber})`}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setScannedDocAlert(null)}
                          className="p-1 rounded-lg hover:bg-amber-200/60 text-amber-900 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Prominent Post-Dispatch Loading Plan Change Alert Banner */}
                {trip.planDrift?.hasPlanDrift && (
                  <div className="mt-3 p-3 rounded-2xl bg-rose-50 border-2 border-rose-400 shadow-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-black text-rose-900">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 animate-bounce" />
                        <span>
                          {isAr
                            ? 'تنبيه هام: تم تعديل خطة التحميل لهذه الرحلة بعد اعتماد الصرف!'
                            : 'ALERT: Loading Plan was modified after this trip was dispatched!'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const effVers = getEffectiveDocVersions(trip);
                          if (effVers.length === 0) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setVersionsModalTab('docs');
                                setVersionsModalTripId(trip.id);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-900 text-[11px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>{isAr ? `عرض المستندات السابقة (${effVers.length})` : `View Legacy Docs (${effVers.length})`}</span>
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={!canEditDispatchedTrip}
                          onClick={() => {
                            setActiveDispatchMode('edit');
                            setActiveDispatchTripId(trip.id);
                          }}
                          className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'مراجعة التعديلات وتحديث الصرف' : 'Review Changes & Update Dispatch'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {trip.planDrift.changes.map((ch, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-[10px] font-bold text-rose-950"
                        >
                          <span>{isAr ? ch.labelAr : ch.labelEn}:</span>
                          {ch.oldValue && ch.oldValue !== '—' && (
                            <>
                              <span className="line-through text-slate-400 font-mono">{ch.oldValue}</span>
                              <span>→</span>
                            </>
                          )}
                          <span className="font-mono font-black text-rose-700">{ch.newValue}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dispatch Modal */}
      {activeDispatchTrip && (
        <TruckDispatchModal
          isOpen={Boolean(activeDispatchTrip)}
          onClose={() => setActiveDispatchTripId(null)}
          trip={activeDispatchTrip}
          finishedProducts={products}
          workerPool={workerPool}
          stockMatrixSkuMap={stockMatrixSkuMap}
          currentUser={currentUser}
          canConfirmDispatch={
            activeDispatchMode === 'view'
              ? false
              : activeDispatchTrip.isWarehouseConfirmed
              ? canEditDispatchedTrip
              : canDispatchTruck
          }
          onSaved={() => {
            showToast(
              isAr
                ? `تم اعتماد بيان التحميل والصرف لرحلة #${activeDispatchTrip.loadingOrderNumber} بنجاح`
                : `Confirmed FG Dispatch Gate for Trip #${activeDispatchTrip.loadingOrderNumber}`
            );
          }}
          isAr={isAr}
        />
      )}

      {/* Return / Receiving Inspection Modal */}
      {activeReturnTrip && (
        <TruckReturnReceivingModal
          isOpen={Boolean(activeReturnTrip)}
          onClose={() => setActiveReturnTripId(null)}
          trip={activeReturnTrip}
          finishedProducts={products}
          allOrders={orders}
          clients={clients}
          vehicles={vehicles}
          segments={segments}
          productCategories={productCategories}
          priceLists={priceLists}
          strategies={strategies}
          stdRetailList={stdRetailList}
          currentUser={currentUser}
          returnAuthority={returnAuthority}
          eligibleOrderSettlers={eligibleOrderSettlers}
          todayStr={todayStr}
          onSaved={(_payload, evalRes) => {
            showToast(
              evalRes.nextStatus === 'reconciled'
                ? (isAr ? 'تمت مطابقة وإقفال مرتجعات الرحلة بتأكيد القسمين ✓' : 'Trip returns reconciled & closed by both depts ✓')
                : evalRes.nextStatus === 'discrepancy_pending_accounting'
                ? (isAr ? 'توجد فروقات مرتجع — يرجى التسوية عبر أوامر البيع' : 'Return discrepancy logged — Sales Order settlement required')
                : evalRes.nextStatus === 'pending_accounting_confirm'
                ? (isAr ? 'تم استلام المخزن الفعلي وإخطار المحاسبة للمطابقة ✓' : 'Warehouse receipt locked — Accounting alignment requested ✓')
                : (isAr ? 'تم تسجيل المرتجع المتوقع وإخطار أمين المخزن' : 'Expected returns saved — Warehouse notified'),
              evalRes.nextStatus === 'discrepancy_pending_accounting' ? 'warning' : 'success'
            );
          }}
          isAr={isAr}
        />
      )}

      {/* Dispatch Audit Trail Modal */}
      {auditTrip && (
        <SalesOrderAuditModal
          isOpen={Boolean(auditTrip)}
          onClose={() => setAuditTripId(null)}
          order={{
            id: auditTrip.id,
            serial: `LO-${auditTrip.loadingOrderNumber} (${auditTrip.loadingDate})`,
            clientName: auditTrip.vehicleDisplayName,
            auditTrail: auditTrip.dispatchDoc?.auditTrail || [],
          }}
          isAr={isAr}
        />
      )}

      {/* Document Versions & Previous Dispatch History Modal */}
      {versionsModalTrip && (() => {
        const vDoc = versionsModalTrip.dispatchDoc || {};
        const docVersions = [...getEffectiveDocVersions(versionsModalTrip)].sort(
          (a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0)
        );
        const dispHistory = [...(Array.isArray(vDoc.dispatchHistory) ? vDoc.dispatchHistory : [])].sort(
          (a, b) => Number(b.revisionNumber || 0) - Number(a.revisionNumber || 0)
        );
        const currentVerObj = docVersions.find((v) => v.status === 'current') || null;
        const hasDrift = Boolean(versionsModalTrip.planDrift?.hasPlanDrift);

        return (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setVersionsModalTripId(null)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <FileCheck2 className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-black">
                      {isAr
                        ? `إصدارات مستند الصرف وسجل التعديلات — رحلة #${versionsModalTrip.loadingOrderNumber}`
                        : `Dispatch Document Versions & History — Trip #${versionsModalTrip.loadingOrderNumber}`}
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      {versionsModalTrip.loadingDate} • {versionsModalTrip.vehicleDisplayName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVersionsModalTripId(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setVersionsModalTab('docs')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-black border-b-2 transition cursor-pointer ${
                    versionsModalTab === 'docs'
                      ? 'border-amber-600 text-amber-900 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {isAr ? `مستندات الصرف المطبوعة (${docVersions.length})` : `Printed Dispatch Docs (${docVersions.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setVersionsModalTab('history')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-black border-b-2 transition cursor-pointer ${
                    versionsModalTab === 'history'
                      ? 'border-indigo-600 text-indigo-900 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {isAr ? `سجل بيانات الصرف السابقة (${dispHistory.length})` : `Previous Dispatch Snapshots (${dispHistory.length})`}
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                {versionsModalTab === 'docs' ? (
                  docVersions.length === 0 ? (
                    <div className="text-center py-8 text-xs font-bold text-slate-400">
                      {isAr ? 'لم يتم طباعة أي إصدار من إذن الصرف بعد.' : 'No dispatch document versions have been printed yet.'}
                    </div>
                  ) : (
                    docVersions.map((ver) => {
                      const isLegacyVer =
                        ver.status === 'superseded' ||
                        (currentVerObj && Number(currentVerObj.versionNumber) > Number(ver.versionNumber)) ||
                        hasDrift ||
                        versionsModalTrip.isLoadingUnlocked === false;
                      const isNewReleased = Boolean(
                        currentVerObj &&
                          Number(currentVerObj.versionNumber) > Number(ver.versionNumber) &&
                          !hasDrift &&
                          versionsModalTrip.isLoadingUnlocked !== false
                      );

                      return (
                        <div
                          key={ver.versionId || ver.versionNumber}
                          className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                            isLegacyVer
                              ? 'bg-rose-50/60 border-rose-200'
                              : 'bg-emerald-50/50 border-emerald-200'
                          }`}
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {ver.docNumber && (
                                <span dir="ltr" className="px-2 py-0.5 rounded-lg bg-slate-900 text-teal-300 font-mono text-xs font-black">
                                  {ver.docNumber}
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-white font-mono text-xs font-black">
                                v{ver.versionNumber}
                              </span>
                              {isLegacyVer ? (
                                <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-black">
                                  {isAr ? 'مستند قديم (قبل التعديل) — Legacy' : 'Legacy Document (Superseded)'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black">
                                  {isAr ? 'الإصدار الحالي المعتمد ✓' : 'Current Active Version ✓'}
                                </span>
                              )}
                              {isLegacyVer && (
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                    isNewReleased
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-amber-50 text-amber-900 border-amber-300'
                                  }`}
                                >
                                  {isNewReleased
                                    ? (isAr ? `تم إصدار النسخة الأحدث (v${currentVerObj.versionNumber})` : `Superseded by v${currentVerObj.versionNumber}`)
                                    : (isAr ? 'لم يتم إصدار المستند الجديد بعد' : 'New document not released yet')}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium">
                              {isAr ? 'تاريخ الطباعة:' : 'Printed:'}{' '}
                              <span className="font-mono font-bold">
                                {ver.printedAt ? new Date(ver.printedAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB') : '—'}
                              </span>
                              {ver.printedBy ? ` • ${ver.printedBy}` : ''}
                            </div>
                            {(ver.supersededReasonAr || (hasDrift && isLegacyVer)) && (
                              <div className="text-[11px] text-rose-800 font-bold">
                                {isAr ? 'التعديل:' : 'Change:'} {ver.supersededReasonAr || versionsModalTrip.planDrift?.summaryAr}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenSavedDocVersion(versionsModalTrip, ver)}
                              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-black inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>{isLegacyVer ? (isAr ? 'عرض النسخة القديمة' : 'View Legacy Doc') : (isAr ? 'عرض / طباعة' : 'View / Print')}</span>
                            </button>
                            {isLegacyVer && isNewReleased && currentVerObj && (
                              <button
                                type="button"
                                onClick={() => handleOpenSavedDocVersion(versionsModalTrip, currentVerObj)}
                                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black cursor-pointer"
                              >
                                {isAr ? `فتح الجديد (v${currentVerObj.versionNumber})` : `Open v${currentVerObj.versionNumber}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )
                ) : dispHistory.length === 0 ? (
                  <div className="text-center py-8 text-xs font-bold text-slate-400">
                    {isAr ? 'لا توجد تعديلات سابقة على بيانات الصرف لهذه الرحلة.' : 'No prior dispatch revisions recorded for this trip.'}
                  </div>
                ) : (
                  dispHistory.map((hist) => {
                    const totLocked = (hist.columns || []).reduce((s, c) => s + Number(c.lockedQty || 0), 0);
                    const totExtra = (hist.columns || []).reduce((s, c) => s + Number(c.extraQty || 0), 0);
                    return (
                      <div key={hist.revisionNumber} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-slate-900">
                            {isAr ? `النسخة السابقة #${hist.revisionNumber} (قبل التعديل)` : `Prior Snapshot #${hist.revisionNumber}`}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {hist.archivedAt ? new Date(hist.archivedAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB') : '—'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700 font-bold flex flex-wrap gap-3">
                          <span>{isAr ? 'الشاحنة:' : 'Truck:'} {hist.vehicleName || '—'}</span>
                          <span>{isAr ? 'السائق:' : 'Driver:'} {hist.driverName || '—'}</span>
                          <span>{isAr ? 'الطلبات:' : 'Orders:'} {(hist.orderIds || []).length}</span>
                          <span>{isAr ? 'المقفل:' : 'Locked:'} {fmtCtn(totLocked)}</span>
                          <span>{isAr ? 'زيادات:' : 'Extras:'} +{fmtCtn(totExtra)}</span>
                        </div>
                        {hist.reasonAr && (
                          <div className="text-[11px] text-indigo-800 font-bold">
                            {isAr ? 'سبب التحديث:' : 'Update Reason:'} {isAr ? hist.reasonAr : (hist.reasonEn || hist.reasonAr)}
                          </div>
                        )}
                        {hist.dispatchNotes && (
                          <div className="text-[11px] text-slate-600">
                            {isAr ? 'ملاحظات الصرف السابقة:' : 'Prior Notes:'} {hist.dispatchNotes}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setVersionsModalTripId(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Full Dispatch Documents Registry Modal (Date-only filter, Valid/Legacy, Intact Unique Numbering, Unlinked Trips Supported) */}
      <DispatchDocumentsHistoryModal
        isOpen={isDocsHistoryOpen}
        onClose={() => {
          setIsDocsHistoryOpen(false);
          setHighlightHistoryDocNumber('');
        }}
        documents={dispatchDocumentsRegistry}
        todayStr={todayStr}
        onPreviewOrPrint={handleOpenRegistryDocument}
        highlightDocNumber={highlightHistoryDocNumber}
        isAr={isAr}
      />
    </div>
  );
}
