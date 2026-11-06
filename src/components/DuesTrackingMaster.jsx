import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, fileToDataUrl } from '../firebase';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileText,
  Printer,
  Search,
  Filter,
  PlusCircle,
  Wallet,
  Landmark,
  Coins,
  Building2,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  CheckSquare,
  Square,
  X,
  Paperclip,
  Trash2,
  ShieldCheck,
  Sparkles,
  History,
  Info,
  ChevronDown,
  Lock
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import WhtNotePrintSlip from './WhtNotePrintSlip';
import CashVoucherModal from './CashVoucherModal';
import PeacockLoader from './PeacockLoader';
import { RowCommentButton, useRecordComments } from './comments';
import { useNotification } from '../context/NotificationContext';

// Helper: Calculate Due Date from Source Date, Base Date Rule, and Grace Days
const computeDueDate = (sourceDateStr, baseDateType, graceDays) => {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const rawStr = sourceDateStr ? String(sourceDateStr).slice(0, 10) : fallbackDate;
  const parts = rawStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return fallbackDate;

  let baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
  if (baseDateType === 'end_of_month') {
    // Move to last calendar day of that month
    baseDate = new Date(parts[0], parts[1], 0);
  }
  const daysToAdd = Number(graceDays) || 0;
  baseDate.setDate(baseDate.getDate() + daysToAdd);

  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = String(baseDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const round2 = (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100;

export default function DuesTrackingMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { toast, showAlert } = useNotification();
  const { registerRowActions } = useRecordComments();

  const isGeneralAdmin = Boolean(currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin');
  const canSettleDues = isGeneralAdmin || (permissions?.actions?.canSettleDues !== false);
  const canGenerateWhtNote = isGeneralAdmin || (permissions?.actions?.canGenerateWhtNote !== false);
  const canViewPrices = isGeneralAdmin || (permissions?.sensitive?.canViewPrices !== false);
  const canViewTotals = isGeneralAdmin || (permissions?.sensitive?.canViewTotals !== false);

  const currentUserName = isAr
    ? (currentUser?.nameAr || currentUser?.name || 'المسؤول المالي')
    : (currentUser?.name || currentUser?.nameAr || 'Finance Officer');

  // Active Subtab: 'suppliers' | 'clients'
  const [activeSubTab, setActiveSubTab] = useState('suppliers');

  // Live Firestore Data
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [cashSafes, setCashSafes] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [settlementsMap, setSettlementsMap] = useState({});
  const [paymentBatches, setPaymentBatches] = useState([]);
  const [whtNotesMap, setWhtNotesMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters State
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all'); // 'all' | 'receipt' | 'return' | 'po_advance'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'open' | 'overdue' | 'partially_closed' | 'closed'
  const [taxFilter, setTaxFilter] = useState('all'); // 'all' | 'taxable_wht' | 'non_taxable'
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Table Row Multi-Select Checkboxes
  const [checkedRowIds, setCheckedRowIds] = useState([]);

  // Batch Payment Execution Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [modalSupplierId, setModalSupplierId] = useState('');
  const [modalSelectedIds, setModalSelectedIds] = useState([]);
  const [modalReleaseAmounts, setModalReleaseAmounts] = useState({});
  const [isRecordDropdownOpen, setIsRecordDropdownOpen] = useState(false);
  const [recordDropdownSearch, setRecordDropdownSearch] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('transfer'); // 'cash' | 'transfer' | 'cheque'
  const [sourceSafeId, setSourceSafeId] = useState('');
  const [sourceBankId, setSourceBankId] = useState('');
  const [transferRefNumber, setTransferRefNumber] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDueDate, setChequeDueDate] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentAttachment, setPaymentAttachment] = useState(null);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [inlineClampWarning, setInlineClampWarning] = useState('');

  // Optional Cash Voucher Modal Link
  const [cashVoucherModalSafe, setCashVoucherModalSafe] = useState(null);

  // WHT Certificate Print Modal State
  const [activeWhtSlip, setActiveWhtSlip] = useState(null);

  // Payment History Drawer/Modal for a specific Tranche
  const [historyModalTranche, setHistoryModalTranche] = useState(null);

  // Subscribe to Firestore Collections
  useEffect(() => {
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliers(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubPos = onSnapshot(collection(db, 'purchase_orders'), (snap) => {
      setPurchaseOrders(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    const unsubGrns = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceipts(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });

    const unsubSafes = onSnapshot(collection(db, 'cash_safes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((s) => !s.isDeleted && s.isActive !== false);
      setCashSafes(list);
    });

    const unsubBanks = onSnapshot(collection(db, 'bank_accounts'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((b) => b.status !== 'inactive');
      setBankAccounts(list);
    });

    const unsubSettlements = onSnapshot(collection(db, 'dues_settlements'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = { ...d.data(), id: d.id };
      });
      setSettlementsMap(map);
    });

    const unsubBatches = onSnapshot(collection(db, 'dues_batches'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      list.sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')));
      setPaymentBatches(list);
    });

    const unsubWht = onSnapshot(collection(db, 'wht_notes'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = { ...d.data(), id: d.id };
      });
      setWhtNotesMap(map);
    });

    return () => {
      unsubSuppliers();
      unsubPos();
      unsubGrns();
      unsubSafes();
      unsubBanks();
      unsubSettlements();
      unsubBatches();
      unsubWht();
    };
  }, []);

  const suppliersById = useMemo(() => {
    const map = {};
    suppliers.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [suppliers]);

  // Core Tranche Allocation & Anti-Repayment Engine
  const allDuesRecords = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const records = [];

    // 1. Group active approved GRNs by poId to know how much has been delivered per PO
    const activeGrns = goodsReceipts.filter(
      (g) =>
        g.status !== 'cancelled' &&
        g.status !== 'reversed' &&
        g.status !== 'draft' &&
        !g.isReversed
    );

    const grnsByPoId = {};
    activeGrns.forEach((g) => {
      if (g.docType !== 'return' && g.poId) {
        if (!grnsByPoId[g.poId]) grnsByPoId[g.poId] = [];
        grnsByPoId[g.poId].push(g);
      }
    });

    // Helper to compute financials for a GRN/RTN or PO
    const computeDocFinancials = (docObj, supplier) => {
      if (docObj.financials && typeof docObj.financials.netPayable === 'number') {
        return {
          subtotal: round2(docObj.financials.subtotal || 0),
          totalVat: round2(docObj.financials.totalVat || 0),
          totalWht: round2(docObj.financials.totalWht || 0),
          netPayable: round2(docObj.financials.netPayable || 0)
        };
      }
      const isTax = Boolean(docObj.isTaxOfficial);
      const whtComp = docObj.whtComplianceSnapshot || supplier?.whtCompliance || 'credit_notes';
      let subtotal = 0;
      let totalVat = 0;
      let totalWht = 0;

      (docObj.lines || []).forEach((line) => {
        const qty = Number(line.receivedSmallUnits ?? line.qty) || 0;
        const price = Number(line.unitPrice) || 0;
        if (qty > 0 && price > 0) {
          const lineSub = qty * price;
          const vatRate = isTax ? (Number(line.vatPercent ?? 14) / 100) : 0;
          const whtRate = isTax && whtComp !== 'advance_payment' ? (Number(line.whtPercent ?? 1) / 100) : 0;
          subtotal += lineSub;
          totalVat += lineSub * vatRate;
          totalWht += lineSub * whtRate;
        }
      });

      const netPayable = subtotal + totalVat - totalWht;
      return {
        subtotal: round2(subtotal),
        totalVat: round2(totalVat),
        totalWht: round2(totalWht),
        netPayable: round2(netPayable)
      };
    };

    // Track paid PO Advance pool per poId so incoming GRNs immediately deduct paid PO advances
    const paidPoAdvancePoolByPoId = {};

    // 2. Process Approved / Partially Delivered POs for Advance Payment records
    purchaseOrders.forEach((po) => {
      if (po.status !== 'approved' && po.status !== 'partially_delivered' && po.status !== 'delivered') return;
      const supplier = suppliersById[po.supplierId] || null;
      const terms = po.paymentTermsSnapshot || supplier?.paymentTerms || {
        tranchesCount: 1,
        tranches: [{ percent: 100, days: 0, baseDate: 'delivery_date' }]
      };
      const fin = computeDocFinancials(po, supplier);
      if (fin.netPayable <= 0) return;

      const advTrancheId = `${po.id}-ADV`;
      const existingAdvSettlement = settlementsMap[advTrancheId];
      const paidOnPoAdv = round2(existingAdvSettlement?.paidAmount || 0);

      if (paidOnPoAdv > 0) {
        paidPoAdvancePoolByPoId[po.id] = paidOnPoAdv;
      }

      // Check scheduled advance % in payment terms
      const advanceTranches = (terms.tranches || []).filter((t) => t.baseDate === 'advance_payment');
      const scheduledAdvPercent = advanceTranches.reduce((s, t) => s + (Number(t.percent) || 0), 0);
      const advGraceDays = advanceTranches[0]?.days || 0;

      // Calculate how much of this PO has already been received via GRNs
      const linkedGrns = grnsByPoId[po.id] || [];
      const totalReceivedNet = round2(
        linkedGrns.reduce((sum, g) => sum + computeDocFinancials(g, supplier).netPayable, 0)
      );
      const unreceivedPoNet = Math.max(0, round2(fin.netPayable - totalReceivedNet));
      const isFullyReceived = po.status === 'delivered' || unreceivedPoNet <= 0.01;

      // Anti-Repayment Absorption Rule:
      // Any unpaid portion of PO Advance is only open against the unreceived portion of the PO.
      // Once GRNs arrive, unpaid PO advance is absorbed into the GRN tranches so it is never open twice.
      const baseScheduledAdvAmount =
        scheduledAdvPercent > 0
          ? round2(fin.netPayable * (scheduledAdvPercent / 100))
          : round2(fin.netPayable);

      // Cap unpaid PO advance by unreceived PO value so delivered value is never open on both PO and GRN
      const effectiveOriginalDue = isFullyReceived
        ? paidOnPoAdv
        : scheduledAdvPercent > 0
        ? Math.max(paidOnPoAdv, round2(unreceivedPoNet * (scheduledAdvPercent / 100)))
        : Math.max(paidOnPoAdv, unreceivedPoNet);

      // Show PO Advance record if:
      // (a) Supplier/PO has a scheduled advance_payment tranche, OR
      // (b) An advance payment was already recorded on this PO, OR
      // (c) PO is approved & unreceived/partially-received (available for ad-hoc advance payment)
      if (effectiveOriginalDue <= 0.01 && paidOnPoAdv <= 0.01) return;

      const poDateStr =
        po.approvedAt?.slice(0, 10) ||
        (po.createdAt?.seconds
          ? new Date(po.createdAt.seconds * 1000).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10));

      const dueDate = computeDueDate(poDateStr, 'advance_payment', advGraceDays);
      const remainingAmount = Math.max(0, round2(effectiveOriginalDue - paidOnPoAdv));

      // Only display in main table by default if scheduledAdvPercent > 0 or paidOnPoAdv > 0,
      // while keeping ad-hoc POs available in the modal & when filtering by 'po_advance'
      const isAdHocUnpaidPo = scheduledAdvPercent === 0 && paidOnPoAdv === 0;

      let status = 'open';
      if (remainingAmount <= 0.01 && paidOnPoAdv > 0) {
        status = 'closed';
      } else if (paidOnPoAdv > 0 && remainingAmount > 0.01) {
        status = 'partially_closed';
      }

      records.push({
        id: advTrancheId,
        docId: po.id,
        docType: 'po_advance',
        isAdHocUnpaidPo,
        poId: po.id,
        supplierId: po.supplierId,
        supplierName: supplier?.name || po.supplierName || '—',
        trancheIndex: 1,
        tranchesCount: terms.tranchesCount || 1,
        percent: scheduledAdvPercent > 0 ? scheduledAdvPercent : 100,
        baseDateType: 'advance_payment',
        graceDays: advGraceDays,
        sourceDate: poDateStr,
        dueDate,
        isOverdue: status !== 'closed' && !isAdHocUnpaidPo && dueDate < todayStr,
        isTaxOfficial: Boolean(po.isTaxOfficial),
        invoiceNumber: '—',
        invoiceDate: poDateStr,
        docSubtotal: fin.subtotal,
        docTotalVat: fin.totalVat,
        docTotalWht: fin.totalWht,
        docNetPayable: fin.netPayable,
        originalDueAmount: effectiveOriginalDue,
        prePaidViaPoAdvanceAmount: 0,
        paidAmount: paidOnPoAdv,
        remainingAmount,
        status,
        paymentsHistory: existingAdvSettlement?.paymentsHistory || [],
        lastPaymentMethod: existingAdvSettlement?.lastPaymentMethod || '',
        lastPaymentSource: existingAdvSettlement?.lastPaymentSource || '',
        lastPaymentDate: existingAdvSettlement?.lastPaymentDate || '',
        absorbedIntoGrns: isFullyReceived && baseScheduledAdvAmount > paidOnPoAdv
      });
    });

    // 3. Process Approved GRNs (+) and Independent RTNs (-)
    // Sort chronologically by receiptDate so earlier GRNs on the same PO consume the PO Advance pool first
    const sortedGrns = [...activeGrns].sort((a, b) =>
      String(a.receiptDate || '').localeCompare(String(b.receiptDate || ''))
    );

    sortedGrns.forEach((grn) => {
      const isReturn = grn.docType === 'return';
      const sign = isReturn ? -1 : 1;
      const supplier = suppliersById[grn.supplierId] || null;
      const terms = grn.paymentTermsSnapshot || supplier?.paymentTerms || {
        tranchesCount: 1,
        tranches: [{ percent: 100, days: 0, baseDate: 'delivery_date' }]
      };
      const tranchesList =
        Array.isArray(terms.tranches) && terms.tranches.length > 0
          ? terms.tranches
          : [{ percent: 100, days: 0, baseDate: 'delivery_date' }];

      const fin = computeDocFinancials(grn, supplier);
      const signedNetPayable = round2(sign * fin.netPayable);
      if (Math.abs(signedNetPayable) <= 0.009) return;

      const sourceDate =
        grn.receiptDate ||
        (grn.createdAt?.seconds
          ? new Date(grn.createdAt.seconds * 1000).toISOString().slice(0, 10)
          : todayStr);

      let allocatedSoFar = 0;

      tranchesList.forEach((tranche, idx) => {
        const isLast = idx === tranchesList.length - 1;
        const pct = Number(tranche.percent) || 0;
        const rawTrancheAmount = isLast
          ? round2(signedNetPayable - allocatedSoFar)
          : round2(signedNetPayable * (pct / 100));
        allocatedSoFar = round2(allocatedSoFar + rawTrancheAmount);

        const trancheId = `${grn.id}-T${idx + 1}`;
        const dueDate = computeDueDate(sourceDate, tranche.baseDate, tranche.days);
        const settlement = settlementsMap[trancheId];
        const directPaidAmount = round2(settlement?.paidAmount || 0);

        // Immediate Anti-Repayment Deduction from Paid PO Advance Pool (for positive GRNs linked to a PO)
        let prePaidViaPoAdv = 0;
        if (!isReturn && grn.poId && (paidPoAdvancePoolByPoId[grn.poId] || 0) > 0) {
          const availableAdv = paidPoAdvancePoolByPoId[grn.poId];
          const maxCoverable = Math.max(0, round2(rawTrancheAmount - directPaidAmount));
          prePaidViaPoAdv = round2(Math.min(availableAdv, maxCoverable));
          paidPoAdvancePoolByPoId[grn.poId] = round2(availableAdv - prePaidViaPoAdv);
        }

        const totalSettledAmount = round2(directPaidAmount + prePaidViaPoAdv);
        const remainingAmount = isReturn
          ? Math.min(0, round2(rawTrancheAmount - directPaidAmount)) // negative remaining for RTN
          : Math.max(0, round2(rawTrancheAmount - totalSettledAmount));

        let status = 'open';
        if (Math.abs(remainingAmount) <= 0.009) {
          status = 'closed';
        } else if (Math.abs(totalSettledAmount) > 0.009) {
          status = 'partially_closed';
        }

        const invoiceOrCreditNo = isReturn
          ? grn.creditNoteNumber || ''
          : grn.taxInvoiceNumber || '';
        const invoiceOrCreditDate = isReturn
          ? grn.creditNoteDate || sourceDate
          : grn.taxInvoiceDate || sourceDate;

        const whtComp = grn.whtComplianceSnapshot || supplier?.whtCompliance || 'credit_notes';
        const isWhtApplicable =
          Boolean(grn.isTaxOfficial) && whtComp === 'credit_notes' && fin.totalWht > 0;

        records.push({
          id: trancheId,
          docId: grn.id,
          docType: isReturn ? 'return' : 'receipt',
          isAdHocUnpaidPo: false,
          poId: grn.poId || '',
          supplierId: grn.supplierId,
          supplierName: supplier?.name || grn.supplierName || '—',
          trancheIndex: idx + 1,
          tranchesCount: tranchesList.length,
          percent: pct,
          baseDateType: tranche.baseDate || 'delivery_date',
          graceDays: Number(tranche.days) || 0,
          sourceDate,
          dueDate,
          isOverdue: status !== 'closed' && !isReturn && dueDate < todayStr,
          isTaxOfficial: Boolean(grn.isTaxOfficial),
          isWhtApplicable,
          invoiceNumber: invoiceOrCreditNo,
          invoiceDate: invoiceOrCreditDate,
          supplierDeliveryNote: grn.supplierDeliveryNote || '',
          docSubtotal: round2(sign * fin.subtotal),
          docTotalVat: round2(sign * fin.totalVat),
          docTotalWht: round2(sign * fin.totalWht),
          docNetPayable: signedNetPayable,
          trancheWhtShare: round2(sign * fin.totalWht * (pct / 100)),
          originalDueAmount: rawTrancheAmount,
          prePaidViaPoAdvanceAmount: prePaidViaPoAdv,
          paidAmount: totalSettledAmount,
          directPaidAmount,
          remainingAmount,
          status,
          paymentsHistory: settlement?.paymentsHistory || [],
          lastPaymentMethod:
            settlement?.lastPaymentMethod ||
            (prePaidViaPoAdv > 0 ? 'po_advance_auto' : ''),
          lastPaymentSource:
            settlement?.lastPaymentSource ||
            (prePaidViaPoAdv > 0 ? `${isAr ? 'خصم تلقائي من دفعة مقدمة لأمر الشراء' : 'Auto-deducted from PO Advance'} (${grn.poId})` : ''),
          lastPaymentDate: settlement?.lastPaymentDate || ''
        });
      });
    });

    // Sort chronologically by dueDate ascending
    records.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    return records;
  }, [goodsReceipts, purchaseOrders, suppliersById, settlementsMap, isAr]);

  // Visible Table Records (Applying Filters)
  const filteredRecords = useMemo(() => {
    return allDuesRecords.filter((r) => {
      // Hide unscheduled ad-hoc unpaid POs from main list unless user filters by 'po_advance'
      if (r.isAdHocUnpaidPo && docTypeFilter !== 'po_advance') return false;

      if (selectedSupplierFilter && r.supplierId !== selectedSupplierFilter) return false;
      if (docTypeFilter !== 'all' && r.docType !== docTypeFilter) return false;

      if (statusFilter === 'overdue') {
        if (!r.isOverdue) return false;
      } else if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }

      if (taxFilter === 'taxable_wht' && !r.isWhtApplicable) return false;
      if (taxFilter === 'non_taxable' && r.isTaxOfficial) return false;

      if (dueDateFrom && r.dueDate < dueDateFrom) return false;
      if (dueDateTo && r.dueDate > dueDateTo) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchDoc = r.docId?.toLowerCase().includes(q);
        const matchPo = r.poId?.toLowerCase().includes(q);
        const matchSup = r.supplierName?.toLowerCase().includes(q);
        const matchInv = r.invoiceNumber?.toLowerCase().includes(q);
        const matchWht = whtNotesMap[r.docId]?.serialNumber?.toLowerCase().includes(q);
        if (!matchDoc && !matchPo && !matchSup && !matchInv && !matchWht) return false;
      }

      return true;
    });
  }, [
    allDuesRecords,
    selectedSupplierFilter,
    docTypeFilter,
    statusFilter,
    taxFilter,
    dueDateFrom,
    dueDateTo,
    searchTerm,
    whtNotesMap
  ]);

  // KPI Metrics for Suppliers Subtab
  const kpiStats = useMemo(() => {
    let totalOpenPayables = 0;
    let totalOverdue = 0;
    let totalOpenReturns = 0;
    let partiallyClosedCount = 0;
    let totalPrePaidAdvances = 0;

    allDuesRecords.forEach((r) => {
      if (r.isAdHocUnpaidPo) return;
      if (r.docType === 'return') {
        if (r.status !== 'closed') {
          totalOpenReturns += Math.abs(r.remainingAmount);
        }
      } else {
        if (r.status !== 'closed') {
          totalOpenPayables += r.remainingAmount;
          if (r.isOverdue) totalOverdue += r.remainingAmount;
        }
        if (r.prePaidViaPoAdvanceAmount > 0) {
          totalPrePaidAdvances += r.prePaidViaPoAdvanceAmount;
        }
      }
      if (r.status === 'partially_closed') {
        partiallyClosedCount += 1;
      }
    });

    return {
      totalOpenPayables: round2(totalOpenPayables),
      totalOverdue: round2(totalOverdue),
      totalOpenReturns: round2(totalOpenReturns),
      netPayableAfterReturns: round2(totalOpenPayables - totalOpenReturns),
      partiallyClosedCount,
      totalPrePaidAdvances: round2(totalPrePaidAdvances),
      issuedWhtCount: Object.keys(whtNotesMap).length
    };
  }, [allDuesRecords, whtNotesMap]);

  // Open Payment Execution Modal (Single Row, Multi-Checked Rows, or Top Header Button)
  const handleOpenPaymentModal = (preselectedRows = []) => {
    if (!canSettleDues) {
      showAlert(
        isAr ? 'صلاحية غير متوفرة' : 'Permission Denied',
        isAr ? 'ليس لديك صلاحية تسجيل أو تسوية دفعات الموردين.' : 'You do not have permission to settle supplier dues.'
      );
      return;
    }

    const openPreselected = preselectedRows.filter((r) => r.status !== 'closed');
    const initialSupId =
      openPreselected[0]?.supplierId ||
      selectedSupplierFilter ||
      suppliers[0]?.id ||
      '';

    const sameSupplierRows = openPreselected.filter((r) => r.supplierId === initialSupId);
    const initIds = sameSupplierRows.map((r) => r.id);
    const initAmounts = {};
    sameSupplierRows.forEach((r) => {
      initAmounts[r.id] = r.remainingAmount;
    });

    setModalSupplierId(initialSupId);
    setModalSelectedIds(initIds);
    setModalReleaseAmounts(initAmounts);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('transfer');
    setSourceSafeId(cashSafes[0]?.id || '');
    setSourceBankId(bankAccounts[0]?.id || '');
    setTransferRefNumber('');
    setChequeNumber('');
    setChequeDueDate('');
    setPaymentNotes('');
    setPaymentAttachment(null);
    setInlineClampWarning('');
    setIsRecordDropdownOpen(false);
    setRecordDropdownSearch('');
    setIsPaymentModalOpen(true);
  };

  // Eligible Unpaid / Incomplete Records for Modal Supplier
  const supplierOpenRecords = useMemo(() => {
    if (!modalSupplierId) return [];
    return allDuesRecords
      .filter((r) => r.supplierId === modalSupplierId && r.status !== 'closed' && Math.abs(r.remainingAmount) > 0.009)
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  }, [allDuesRecords, modalSupplierId]);

  // Selected Records inside Modal (Strictly Sorted Chronologically by Due Date)
  const modalChronologicalRows = useMemo(() => {
    const selectedSet = new Set(modalSelectedIds);
    return supplierOpenRecords
      .filter((r) => selectedSet.has(r.id))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  }, [supplierOpenRecords, modalSelectedIds]);

  // Toggle Record Selection inside Modal Multi-Select Dropdown
  const handleToggleModalRecord = (record) => {
    setInlineClampWarning('');
    setModalSelectedIds((prev) => {
      const exists = prev.includes(record.id);
      if (exists) {
        const next = prev.filter((id) => id !== record.id);
        setModalReleaseAmounts((prevAmts) => {
          const copy = { ...prevAmts };
          delete copy[record.id];
          return copy;
        });
        return next;
      } else {
        setModalReleaseAmounts((prevAmts) => ({
          ...prevAmts,
          [record.id]: record.remainingAmount
        }));
        return [...prev, record.id];
      }
    });
  };

  // Handle per-row "Amount to be Released" input with Strict Overpayment Prevention
  const handleReleaseAmountChange = (record, rawValue) => {
    setInlineClampWarning('');
    if (rawValue === '' || rawValue === '-') {
      setModalReleaseAmounts((prev) => ({ ...prev, [record.id]: rawValue }));
      return;
    }

    const numVal = Number(rawValue);
    if (isNaN(numVal)) return;

    if (record.docType === 'return') {
      // Negative RTN deduction record: must be between remainingAmount (e.g. -5000) and 0
      const absMax = Math.abs(record.remainingAmount);
      const absEntered = Math.abs(numVal);
      if (absEntered > absMax) {
        setInlineClampWarning(
          isAr
            ? `تم تقييد مبلغ خصم المرتجع (${record.id}) عند الحد الأقصى المتبقي (${absMax.toLocaleString()} ج.م).`
            : `Return deduction for ${record.id} clamped to maximum remaining (${absMax.toLocaleString()} EGP).`
        );
        setModalReleaseAmounts((prev) => ({ ...prev, [record.id]: record.remainingAmount }));
        return;
      }
      setModalReleaseAmounts((prev) => ({ ...prev, [record.id]: -absEntered }));
    } else {
      // Positive GRN or PO Advance record: Strictly prevent overpayment (> remainingAmount)
      const maxDue = record.remainingAmount;
      if (numVal > maxDue) {
        setInlineClampWarning(
          isAr
            ? `يُمنع تجاوز القيمة المستحقة! تم ضبط المبلغ للسجل (${record.id}) عند الحد الأقصى المتبقي (${maxDue.toLocaleString()} ج.م).`
            : `Overpayment is strictly prevented! Amount for (${record.id}) capped at remaining balance (${maxDue.toLocaleString()} EGP).`
        );
        setModalReleaseAmounts((prev) => ({ ...prev, [record.id]: maxDue }));
        return;
      }
      if (numVal < 0) {
        setModalReleaseAmounts((prev) => ({ ...prev, [record.id]: 0 }));
        return;
      }
      setModalReleaseAmounts((prev) => ({ ...prev, [record.id]: numVal }));
    }
  };

  // Computed Batch Summary inside Modal
  const modalBatchSummary = useMemo(() => {
    let totalPositiveRelease = 0;
    let totalReturnDeduction = 0;

    modalChronologicalRows.forEach((r) => {
      const val = Number(modalReleaseAmounts[r.id]) || 0;
      if (r.docType === 'return') {
        totalReturnDeduction += Math.abs(val);
      } else {
        totalPositiveRelease += Math.max(0, val);
      }
    });

    const netReleaseAmount = round2(totalPositiveRelease - totalReturnDeduction);
    return {
      totalPositiveRelease: round2(totalPositiveRelease),
      totalReturnDeduction: round2(totalReturnDeduction),
      netReleaseAmount
    };
  }, [modalChronologicalRows, modalReleaseAmounts]);

  // Save Batch Payment & Update Selected Tranche Records
  const handleConfirmBatchPayment = async (e) => {
    e.preventDefault();
    if (modalChronologicalRows.length === 0) {
      showAlert(
        isAr ? 'لم يتم اختيار سجلات' : 'No Records Selected',
        isAr ? 'يرجى اختيار سجل استحقاق واحد على الأقل للتسوية.' : 'Please select at least one due record to settle.'
      );
      return;
    }

    // Validate each row's release amount
    for (const row of modalChronologicalRows) {
      const releaseVal = Number(modalReleaseAmounts[row.id]);
      if (isNaN(releaseVal) || Math.abs(releaseVal) <= 0) {
        showAlert(
          isAr ? 'قيمة غير صالحة' : 'Invalid Amount',
          isAr
            ? `يرجى إدخال مبلغ صحيح أكبر من الصفر للسجل (${row.id}).`
            : `Please enter a valid non-zero amount for record (${row.id}).`
        );
        return;
      }
      if (row.docType !== 'return' && releaseVal > row.remainingAmount + 0.009) {
        showAlert(
          isAr ? 'تجاوز القيمة المستحقة غير مسموح' : 'Overpayment Prevented',
          isAr
            ? `المبلغ المدخل للسجل (${row.id}) يتجاوز الرصيد المتبقي (${row.remainingAmount.toLocaleString()} ج.م).`
            : `Amount for (${row.id}) exceeds remaining due (${row.remainingAmount.toLocaleString()} EGP).`
        );
        return;
      }
    }

    if (modalBatchSummary.netReleaseAmount < 0) {
      showAlert(
        isAr ? 'صافي الدفعة بالسالب' : 'Negative Net Payment',
        isAr
          ? 'إجمالي المرتجعات المخصومة أكبر من إجمالي الدفعات المختارة. يرجى اختيار استحقاقات إضافية أو تقليل المبلغ المخصوم من المرتجع.'
          : 'Total selected return deductions exceed selected positive dues. Please select additional positive dues or adjust the deducted return amount.'
      );
      return;
    }

    // Validate Payment Source
    let resolvedSourceLabel = '';
    if (paymentMethod === 'cash') {
      const safeObj = cashSafes.find((s) => s.id === sourceSafeId);
      if (!safeObj) {
        showAlert(isAr ? 'اختر الخزينة' : 'Select Safe', isAr ? 'يرجى اختيار الخزينة النقدية.' : 'Please select a cash safe.');
        return;
      }
      resolvedSourceLabel = `${isAr ? safeObj.nameAr : (safeObj.nameEn || safeObj.nameAr)} (${safeObj.id})`;
    } else if (paymentMethod === 'transfer') {
      const bankObj = bankAccounts.find((b) => b.id === sourceBankId);
      resolvedSourceLabel = bankObj
        ? `${bankObj.bankName} - ${bankObj.accountNumber}${transferRefNumber ? ` [مستند: ${transferRefNumber}]` : ''}`
        : transferRefNumber || (isAr ? 'تحويل بنكي' : 'Bank Transfer');
    } else if (paymentMethod === 'cheque') {
      if (!chequeNumber.trim()) {
        showAlert(isAr ? 'رقم الشيك مطلوب' : 'Cheque Number Required', isAr ? 'يرجى إدخال رقم الشيك البنكي.' : 'Please enter the cheque number.');
        return;
      }
      const bankObj = bankAccounts.find((b) => b.id === sourceBankId);
      resolvedSourceLabel = `${bankObj ? bankObj.bankName : (isAr ? 'بنك' : 'Bank')} - شيك رقم ${chequeNumber.trim()}${
        chequeDueDate ? ` (استحقاق: ${chequeDueDate})` : ''
      }`;
    }

    setIsSavingPayment(true);
    try {
      const nowIso = new Date().toISOString();
      const dateCompact = paymentDate.replace(/-/g, '');
      const batchId = `PAY-${dateCompact}-${String(paymentBatches.length + 1).padStart(3, '0')}`;
      const supplierObj = suppliersById[modalSupplierId];

      const allocatedItems = [];

      for (const row of modalChronologicalRows) {
        const releaseAmt = round2(Number(modalReleaseAmounts[row.id]) || 0);
        const existingDoc = settlementsMap[row.id] || {};
        const prevDirectPaid = round2(Number(existingDoc.paidAmount) || 0);
        const newDirectPaid = round2(prevDirectPaid + releaseAmt);
        const totalEffectivePaid = round2(newDirectPaid + (row.prePaidViaPoAdvanceAmount || 0));
        const newRemaining =
          row.docType === 'return'
            ? Math.min(0, round2(row.originalDueAmount - newDirectPaid))
            : Math.max(0, round2(row.originalDueAmount - totalEffectivePaid));

        const newStatus = Math.abs(newRemaining) <= 0.009 ? 'closed' : 'partially_closed';

        const paymentEntry = {
          batchId,
          amount: releaseAmt,
          paymentDate,
          paymentMethod,
          sourceLabel: resolvedSourceLabel,
          sourceSafeId: paymentMethod === 'cash' ? sourceSafeId : null,
          sourceBankId: paymentMethod !== 'cash' ? sourceBankId : null,
          transferRefNumber: paymentMethod === 'transfer' ? transferRefNumber : null,
          chequeNumber: paymentMethod === 'cheque' ? chequeNumber : null,
          chequeDueDate: paymentMethod === 'cheque' ? chequeDueDate : null,
          notes: paymentNotes || '',
          attachment: paymentAttachment || null,
          recordedBy: currentUserName,
          recordedAt: nowIso
        };

        const updatedHistory = [...(existingDoc.paymentsHistory || []), paymentEntry];

        await setDoc(
          doc(db, 'dues_settlements', row.id),
          {
            id: row.id,
            docId: row.docId,
            docType: row.docType,
            poId: row.poId || null,
            supplierId: row.supplierId,
            supplierName: row.supplierName,
            trancheIndex: row.trancheIndex,
            originalDueAmount: row.originalDueAmount,
            paidAmount: newDirectPaid,
            remainingAmount: newRemaining,
            status: newStatus,
            lastPaymentMethod: paymentMethod,
            lastPaymentSource: resolvedSourceLabel,
            lastPaymentDate: paymentDate,
            paymentsHistory: updatedHistory,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        allocatedItems.push({
          trancheId: row.id,
          docId: row.docId,
          docType: row.docType,
          dueDate: row.dueDate,
          remainingBefore: row.remainingAmount,
          releasedAmount: releaseAmt,
          remainingAfter: newRemaining,
          resultingStatus: newStatus
        });
      }

      // Save Batch Payment Record
      await setDoc(doc(db, 'dues_batches', batchId), {
        id: batchId,
        supplierId: modalSupplierId,
        supplierName: supplierObj?.name || modalChronologicalRows[0]?.supplierName || '',
        paymentDate,
        paymentMethod,
        sourceLabel: resolvedSourceLabel,
        sourceSafeId: paymentMethod === 'cash' ? sourceSafeId : null,
        sourceBankId: paymentMethod !== 'cash' ? sourceBankId : null,
        transferRefNumber: paymentMethod === 'transfer' ? transferRefNumber : null,
        chequeNumber: paymentMethod === 'cheque' ? chequeNumber : null,
        chequeDueDate: paymentMethod === 'cheque' ? chequeDueDate : null,
        totalPositiveRelease: modalBatchSummary.totalPositiveRelease,
        totalReturnDeduction: modalBatchSummary.totalReturnDeduction,
        netReleaseAmount: modalBatchSummary.netReleaseAmount,
        allocatedItems,
        notes: paymentNotes || '',
        attachment: paymentAttachment || null,
        createdBy: currentUserName,
        createdAtIso: nowIso,
        createdAt: serverTimestamp()
      });

      setCheckedRowIds([]);
      setIsPaymentModalOpen(false);
      toast.success(
        isAr
          ? `تم تسجيل الدفعة (${batchId}) بصافي ${modalBatchSummary.netReleaseAmount.toLocaleString()} ج.م بنجاح!`
          : `Batch payment (${batchId}) of ${modalBatchSummary.netReleaseAmount.toLocaleString()} EGP saved!`
      );
    } catch (err) {
      console.error('Error saving batch payment:', err);
      showAlert(
        isAr ? 'خطأ في الحفظ' : 'Save Error',
        err.message || (isAr ? 'تعذر حفظ بيانات الدفعة.' : 'Failed to save payment.')
      );
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Issue or Open 1% WHT Certificate (A4 Dual-Half Slip) per Invoice/Credit Note
  const handleOpenOrIssueWhtNote = async (record) => {
    if (!canGenerateWhtNote) {
      showAlert(
        isAr ? 'صلاحية غير متوفرة' : 'Permission Denied',
        isAr ? 'ليس لديك صلاحية إصدار إشعارات الخصم والإضافة.' : 'You do not have permission to generate WHT notes.'
      );
      return;
    }

    const docId = record.docId;
    const existingWht = whtNotesMap[docId];
    const supplier = suppliersById[record.supplierId] || null;

    if (existingWht) {
      setActiveWhtSlip({
        whtData: existingWht,
        supplier
      });
      return;
    }

    // Generate new sequential Internal WHT Serial No. (WHT-YYYY-XXXX)
    const yearStr = (record.invoiceDate || record.sourceDate || new Date().toISOString()).slice(0, 4);
    const currentYearCount = Object.values(whtNotesMap).filter((w) =>
      String(w.serialNumber || '').startsWith(`WHT-${yearStr}-`)
    ).length;
    const serialNumber = `WHT-${yearStr}-${String(currentYearCount + 1).padStart(4, '0')}`;
    const issueDate = new Date().toISOString().slice(0, 10);

    const newWhtPayload = {
      id: docId,
      grnId: docId,
      docType: record.docType,
      serialNumber,
      issueDate,
      supplierId: record.supplierId,
      supplierName: supplier?.name || record.supplierName || '',
      taxpayerLegalName: supplier?.taxpayerLegalName || supplier?.name || '',
      taxCardNumber: supplier?.taxCardNumber || '',
      taxFileNumber: supplier?.taxFileNumber || '',
      taxDistrict: supplier?.taxDistrict || '',
      invoiceNumber: record.invoiceNumber || '',
      invoiceDate: record.invoiceDate || record.sourceDate || issueDate,
      receiptDate: record.sourceDate || issueDate,
      subtotal: Math.abs(record.docSubtotal || 0),
      totalVat: Math.abs(record.docTotalVat || 0),
      totalWht: Math.abs(record.docTotalWht || 0),
      netPayable: Math.abs(record.docNetPayable || 0),
      whtPercent: 1,
      isDeliveredToSupplier: false,
      issuedBy: currentUserName,
      createdAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'wht_notes', docId), newWhtPayload, { merge: true });
      setActiveWhtSlip({
        whtData: newWhtPayload,
        supplier
      });
      toast.success(
        isAr
          ? `تم إصدار إشعار الخصم والإضافة رقم ${serialNumber}`
          : `Issued WHT Certificate ${serialNumber}`
      );
    } catch (err) {
      console.error('Error issuing WHT note:', err);
      showAlert(isAr ? 'خطأ' : 'Error', err.message || 'Failed to issue WHT Note');
    }
  };

  const handleToggleWhtDelivered = async (whtData) => {
    try {
      const nextState = !whtData.isDeliveredToSupplier;
      await setDoc(
        doc(db, 'wht_notes', whtData.id),
        {
          isDeliveredToSupplier: nextState,
          deliveredAt: nextState ? new Date().toISOString() : null,
          deliveredBy: nextState ? currentUserName : null
        },
        { merge: true }
      );
      setActiveWhtSlip((prev) =>
        prev ? { ...prev, whtData: { ...prev.whtData, isDeliveredToSupplier: nextState } } : null
      );
      toast.success(
        nextState
          ? isAr
            ? 'تم تأكيد تسليم أصل الإشعار للمورد وتوقيع الصورة'
            : 'Marked as handed to supplier & signed'
          : isAr
          ? 'تم إلغاء تأكيد التسليم'
          : 'Delivery status reverted'
      );
    } catch (err) {
      console.error('Error toggling WHT delivery status:', err);
    }
  };

  // Checkbox selection in main table (restricted to same supplier for batch payment)
  const handleToggleTableCheckbox = (record) => {
    if (record.status === 'closed') return;
    setCheckedRowIds((prev) => {
      if (prev.includes(record.id)) {
        return prev.filter((id) => id !== record.id);
      }
      if (prev.length > 0) {
        const firstChecked = allDuesRecords.find((r) => r.id === prev[0]);
        if (firstChecked && firstChecked.supplierId !== record.supplierId) {
          toast.warning(
            isAr
              ? 'يمكنك تجميع استحقاقات نفس المورد فقط في دفعة سداد واحدة.'
              : 'Batch payment selection is restricted to records of the same supplier.'
          );
          return prev;
        }
      }
      return [...prev, record.id];
    });
  };

  const supplierOptions = useMemo(() => {
    return [
      { value: '', label: isAr ? 'كل الموردين' : 'All Suppliers', sublabel: isAr ? 'عرض شامل' : 'All' },
      ...suppliers.map((s) => ({
        value: s.id,
        label: s.name || s.taxpayerLegalName || s.id,
        sublabel: s.id
      }))
    ];
  }, [suppliers, isAr]);

  const modalSupplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name || s.taxpayerLegalName || s.id,
      sublabel: s.id
    }));
  }, [suppliers]);

  if (loading) {
    return <PeacockLoader />;
  }

  return (
    <div className="space-y-5">
      {/* Subtab Switcher: Suppliers Dues vs Clients Dues */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('suppliers')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeSubTab === 'suppliers'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>{isAr ? 'استحقاقات ودفعات الموردين' : 'Suppliers Dues & Installments'}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeSubTab === 'suppliers'
                  ? 'bg-emerald-700 text-emerald-100'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {allDuesRecords.filter((r) => !r.isAdHocUnpaidPo && r.status !== 'closed').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('clients')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              activeSubTab === 'clients'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>{isAr ? 'استحقاقات وتحصيلات العملاء' : 'Clients Receivables & Dues'}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
              {isAr ? 'قريباً' : 'Soon'}
            </span>
          </button>
        </div>

        {activeSubTab === 'suppliers' && (
          <div className="flex items-center gap-2">
            {checkedRowIds.length > 0 && canSettleDues && (
              <button
                type="button"
                onClick={() => {
                  const selectedObjs = allDuesRecords.filter((r) => checkedRowIds.includes(r.id));
                  handleOpenPaymentModal(selectedObjs);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs animate-in fade-in"
              >
                <CheckSquare className="h-4 w-4" />
                <span>
                  {isAr
                    ? `تسوية السجلات المحددة (${checkedRowIds.length})`
                    : `Settle Selected (${checkedRowIds.length})`}
                </span>
              </button>
            )}

            {canSettleDues ? (
              <button
                type="button"
                onClick={() => handleOpenPaymentModal([])}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-xs"
              >
                <PlusCircle className="h-4 w-4" />
                <span>{isAr ? 'تسجيل دفعة / تسوية مجمعة' : 'Record Batch Payment'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 font-semibold">
                <Lock className="h-3.5 w-3.5" />
                <span>{isAr ? 'وضع العرض فقط' : 'Read-Only Mode'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CLIENTS SUBTAB: STRUCTURED COMING SOON VIEW */}
      {activeSubTab === 'clients' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-3xl mx-auto my-6 shadow-xs space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
            <Users className="h-8 w-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              {isAr
                ? 'مرتبط بمنظومة المبيعات وفواتير العملاء (قيد التفعيل)'
                : 'Linked to Customers Master & Sales Invoicing Module (Coming Soon)'}
            </span>
          </div>
          <h3 className="text-lg font-black text-slate-900">
            {isAr
              ? 'جدولة ومتابعة استحقاقات وتحصيلات العملاء'
              : 'Client Receivables & Installments Tracking'}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed max-w-xl mx-auto">
            {isAr
              ? 'سيتم تفعيل هذا التبويب الفرعي تلقائياً فور إطلاق سجل العملاء (Customers Master) وفواتير المبيعات (Sales Invoices)، ليقوم بجدولة دفعات التحصيل وفترات الائتمان وإشعارات الخصم الضريبي للعملاء بنفس آلية استحقاقات الموردين.'
              : 'This subtab will automatically activate once the Customers Master and Sales Invoicing modules are launched, scheduling client receivable tranches, credit periods, and collections.'}
          </p>
        </div>
      ) : (
        <>
          {/* SUPPLIERS SUBTAB: KPI SUMMARY CARDS */}
          {canViewTotals && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                  <span>{isAr ? 'إجمالي الاستحقاقات المفتوحة' : 'Open GRN Payables'}</span>
                  <Wallet className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-lg font-black font-mono text-slate-900">
                  {kpiStats.totalOpenPayables.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                  <span className="text-xs font-normal text-slate-500">{isAr ? 'ج.م' : 'EGP'}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {isAr ? 'صافي بعد المرتجعات:' : 'Net after returns:'}{' '}
                  <span className="font-mono font-bold text-emerald-700">
                    {kpiStats.netPayableAfterReturns.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs">
                <div className="flex items-center justify-between text-xs text-rose-700 font-semibold mb-1">
                  <span>{isAr ? 'دفعات مستحقة متأخرة' : 'Overdue Installments'}</span>
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-lg font-black font-mono text-rose-700">
                  {kpiStats.totalOverdue.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                  <span className="text-xs font-normal text-rose-500">{isAr ? 'ج.م' : 'EGP'}</span>
                </div>
                <div className="text-[11px] text-rose-600 mt-1">
                  {isAr ? 'تجاوزت تاريخ الاستحقاق' : 'Past scheduled due date'}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs">
                <div className="flex items-center justify-between text-xs text-amber-800 font-semibold mb-1">
                  <span>{isAr ? 'مرتجعات واجبة الخصم (RTN)' : 'Open Returns to Deduct'}</span>
                  <ArrowUpRight className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-lg font-black font-mono text-amber-700">
                  -{kpiStats.totalOpenReturns.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                  <span className="text-xs font-normal text-amber-600">{isAr ? 'ج.م' : 'EGP'}</span>
                </div>
                <div className="text-[11px] text-amber-700 mt-1">
                  {isAr ? 'تُخصم مستقلة حسب شروط السداد' : 'Independent return tranches'}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-xs">
                <div className="flex items-center justify-between text-xs text-indigo-800 font-semibold mb-1">
                  <span>{isAr ? 'دفعات مقدمة مخصومة تلقائياً' : 'Auto-Applied PO Advances'}</span>
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="text-lg font-black font-mono text-indigo-700">
                  {kpiStats.totalPrePaidAdvances.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                  <span className="text-xs font-normal text-indigo-500">{isAr ? 'ج.م' : 'EGP'}</span>
                </div>
                <div className="text-[11px] text-indigo-600 mt-1">
                  {isAr ? `سجلات مغلقة جزئياً: ${kpiStats.partiallyClosedCount}` : `Partially closed: ${kpiStats.partiallyClosedCount}`}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs">
                <div className="flex items-center justify-between text-xs text-blue-800 font-semibold mb-1">
                  <span>{isAr ? 'إشعارات الخصم الضريبي (1%)' : '1% WHT Certificates'}</span>
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-lg font-black font-mono text-blue-800">
                  {kpiStats.issuedWhtCount}
                </div>
                <div className="text-[11px] text-blue-600 mt-1">
                  {isAr ? 'شهادات نموذج 41 جاهزة للطباعة A4' : 'Printable dual-half A4 slips'}
                </div>
              </div>
            </div>
          )}

          {/* FILTER BAR */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Supplier SearchableSelect */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'تصفية حسب المورد' : 'Filter by Supplier'}
                </label>
                <SearchableSelect
                  options={supplierOptions}
                  value={selectedSupplierFilter}
                  onChange={(val) => setSelectedSupplierFilter(val)}
                  placeholder={isAr ? 'كل الموردين...' : 'All Suppliers...'}
                />
              </div>

              {/* Document Type Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'نوع السجل' : 'Record Type'}
                </label>
                <select
                  value={docTypeFilter}
                  onChange={(e) => setDocTypeFilter(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-white font-semibold"
                >
                  <option value="all">{isAr ? 'الكل (توريد + مرتجع + مقدم)' : 'All Records'}</option>
                  <option value="receipt">{isAr ? 'إذن استلام (GRN +)' : 'Goods Receipts (GRN +)'}</option>
                  <option value="return">{isAr ? 'إذن مرتجع (RTN -)' : 'Returns (RTN -)'}</option>
                  <option value="po_advance">{isAr ? 'دفعات مقدمة لأوامر الشراء (PO)' : 'PO Advance Payments'}</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'حالة السداد' : 'Settlement Status'}
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-white font-semibold"
                >
                  <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
                  <option value="open">{isAr ? 'مفتوح (لم يُسدد)' : 'Open (Unpaid)'}</option>
                  <option value="overdue">{isAr ? 'متأخر السداد (Overdue)' : 'Overdue'}</option>
                  <option value="partially_closed">{isAr ? 'مغلق جزئياً (Partially Closed)' : 'Partially Closed'}</option>
                  <option value="closed">{isAr ? 'مغلق بالكامل (Closed)' : 'Fully Closed'}</option>
                </select>
              </div>

              {/* Due Date From / To */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'من تاريخ استحقاق' : 'Due Date From'}
                </label>
                <input
                  type="date"
                  value={dueDateFrom}
                  onChange={(e) => setDueDateFrom(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {isAr ? 'إلى تاريخ استحقاق' : 'Due Date To'}
                </label>
                <input
                  type="date"
                  value={dueDateTo}
                  onChange={(e) => setDueDateTo(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono bg-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={
                    isAr
                      ? 'بحث برقم إذن الاستلام، المرتجع، أمر الشراء، الفاتورة الضريبية، إشعار الخصم...'
                      : 'Search by GRN, RTN, PO, Tax Invoice, WHT Serial...'
                  }
                  className="w-full ps-9 pe-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={taxFilter}
                  onChange={(e) => setTaxFilter(e.target.value)}
                  className="p-1.5 border border-slate-300 rounded-xl text-xs bg-white font-semibold"
                >
                  <option value="all">{isAr ? 'كل المعاملات الضريبية' : 'All Tax Types'}</option>
                  <option value="taxable_wht">{isAr ? 'خاضع لإشعار خصم 1% (WHT)' : 'Subject to 1% WHT Note'}</option>
                  <option value="non_taxable">{isAr ? 'غير ضريبي' : 'Non-Taxable'}</option>
                </select>

                {(selectedSupplierFilter || docTypeFilter !== 'all' || statusFilter !== 'all' || taxFilter !== 'all' || dueDateFrom || dueDateTo || searchTerm) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSupplierFilter('');
                      setDocTypeFilter('all');
                      setStatusFilter('all');
                      setTaxFilter('all');
                      setDueDateFrom('');
                      setDueDateTo('');
                      setSearchTerm('');
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  >
                    {isAr ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SUPPLIERS DUES & INSTALLMENTS TABLE */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 text-center w-10">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="p-3 text-start">{isAr ? 'السجل / المستند' : 'Record / Doc'}</th>
                    <th className="p-3 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
                    <th className="p-3 text-start">{isAr ? 'الدفعة وشروط السداد' : 'Tranche & Terms'}</th>
                    <th className="p-3 text-start">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                    <th className="p-3 text-start">{isAr ? 'الفاتورة / الإشعار الضريبي' : 'Tax Invoice / Credit Note'}</th>
                    {canViewPrices && canViewTotals && (
                      <>
                        <th className="p-3 text-start">{isAr ? 'قيمة الدفعة' : 'Original Due'}</th>
                        <th className="p-3 text-start">{isAr ? 'المسدد / المخصوم' : 'Paid / Applied'}</th>
                        <th className="p-3 text-start">{isAr ? 'المتبقي' : 'Remaining'}</th>
                      </>
                    )}
                    <th className="p-3 text-center">{isAr ? 'الحالة وطريقة السداد' : 'Status & Method'}</th>
                    <th className="p-3 text-center">{isAr ? 'إشعار خصم 1%' : '1% WHT Note'}</th>
                    <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-10 text-center text-slate-400 font-semibold">
                        {isAr
                          ? 'لا توجد سجلات استحقاقات مطابقة لمعايير البحث الحالية.'
                          : 'No due records match the current filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((rec) => {
                      const isReturn = rec.docType === 'return';
                      const isPoAdv = rec.docType === 'po_advance';
                      const isChecked = checkedRowIds.includes(rec.id);
                      const whtNote = whtNotesMap[rec.docId];
                      const recordTitle = `${rec.id} — ${rec.supplierName}`;

                      const rowContextActions = [
                        ...(rec.status !== 'closed' && canSettleDues
                          ? [
                              {
                                label: isAr ? 'تسجيل دفعة / تسوية' : 'Settle Record',
                                icon: Wallet,
                                onClick: () => handleOpenPaymentModal([rec])
                              }
                            ]
                          : []),
                        ...(rec.isWhtApplicable && canGenerateWhtNote
                          ? [
                              {
                                label: whtNote
                                  ? isAr
                                    ? `طباعة إشعار الخصم (${whtNote.serialNumber})`
                                    : `Print WHT (${whtNote.serialNumber})`
                                  : isAr
                                  ? 'إصدار إشعار خصم وإضافة 1%'
                                  : 'Issue 1% WHT Certificate',
                                icon: Printer,
                                onClick: () => handleOpenOrIssueWhtNote(rec)
                              }
                            ]
                          : [])
                      ];

                      registerRowActions(rec.id, rowContextActions);

                      return (
                        <tr
                          key={rec.id}
                          id={`row-${rec.id}`}
                          data-comment-doc={rec.id}
                          data-comment-number={rec.id}
                          data-comment-tab="dues_tracking"
                          data-comment-module="finance"
                          data-comment-type="table_row"
                          className={`transition ${
                            isChecked
                              ? 'bg-indigo-50/70'
                              : isReturn
                              ? 'bg-amber-50/30 hover:bg-amber-50/60'
                              : rec.isOverdue
                              ? 'bg-rose-50/30 hover:bg-rose-50/60'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Multi-Select Checkbox */}
                          <td className="p-3 text-center align-middle">
                            {rec.status !== 'closed' && canSettleDues ? (
                              <button
                                type="button"
                                onClick={() => handleToggleTableCheckbox(rec)}
                                className="text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                              >
                                {isChecked ? (
                                  <CheckSquare className="h-4 w-4 text-indigo-600" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </button>
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            )}
                          </td>

                          {/* Record / Document */}
                          <td className="p-3 align-top">
                            <div className="font-mono font-black text-slate-900">{rec.id}</div>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {isReturn ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  {isAr ? 'مرتجع (RTN -)' : 'Return (RTN -)'}
                                </span>
                              ) : isPoAdv ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                  {isAr ? 'دفعة مقدمة (PO)' : 'PO Advance'}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  {isAr ? 'إذن استلام (GRN +)' : 'Receipt (GRN +)'}
                                </span>
                              )}
                              {rec.poId && !isPoAdv && (
                                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {rec.poId}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Supplier */}
                          <td className="p-3 align-top">
                            <div className="font-bold text-slate-900">{rec.supplierName}</div>
                            <div className="text-[10px] font-mono text-slate-400">{rec.supplierId}</div>
                          </td>

                          {/* Tranche & Payment Terms */}
                          <td className="p-3 align-top">
                            <div className="font-bold text-slate-800">
                              {isPoAdv
                                ? isAr
                                  ? `دفعة مقدمة (${rec.percent}%)`
                                  : `Advance (${rec.percent}%)`
                                : isAr
                                ? `الدفعة ${rec.trancheIndex} من ${rec.tranchesCount} (${rec.percent}%)`
                                : `Tranche ${rec.trancheIndex}/${rec.tranchesCount} (${rec.percent}%)`}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {rec.baseDateType === 'advance_payment'
                                ? isAr
                                  ? 'عند أمر الشراء / قبل التوريد'
                                  : 'Upon PO / Before Delivery'
                                : rec.baseDateType === 'end_of_month'
                                ? isAr
                                  ? `${rec.graceDays} يوم من نهاية شهر التوريد`
                                  : `${rec.graceDays}d from end of month`
                                : isAr
                                ? `${rec.graceDays} يوم من تاريخ التوريد (${rec.sourceDate})`
                                : `${rec.graceDays}d from supply (${rec.sourceDate})`}
                            </div>
                          </td>

                          {/* Due Date */}
                          <td className="p-3 align-top">
                            <div className="font-mono font-bold text-slate-900 flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>{rec.dueDate}</span>
                            </div>
                            {rec.isOverdue && (
                              <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {isAr ? 'متأخر السداد' : 'Overdue'}
                              </span>
                            )}
                          </td>

                          {/* Tax Invoice / Credit Note */}
                          <td className="p-3 align-top">
                            {rec.isTaxOfficial ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  {isReturn
                                    ? isAr
                                      ? 'إشعار دائن ضريبي'
                                      : 'Tax Credit Note'
                                    : isAr
                                    ? 'فاتورة ضريبية (14%)'
                                    : 'Tax Invoice (14%)'}
                                </span>
                                <div className="font-mono font-bold text-slate-800 mt-1">
                                  {rec.invoiceNumber || (isAr ? 'بدون رقم' : 'No Number')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                {isAr ? 'غير ضريبي' : 'Non-Taxable'}
                              </span>
                            )}
                          </td>

                          {/* Financial Amounts */}
                          {canViewPrices && canViewTotals && (
                            <>
                              <td className="p-3 align-top font-mono">
                                <div
                                  className={`font-bold ${
                                    isReturn ? 'text-amber-700' : 'text-slate-900'
                                  }`}
                                >
                                  {rec.originalDueAmount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  })}{' '}
                                  <span className="text-[10px] font-sans font-normal text-slate-500">
                                    {isAr ? 'ج.م' : 'EGP'}
                                  </span>
                                </div>
                              </td>

                              <td className="p-3 align-top font-mono">
                                <div className="font-bold text-emerald-700">
                                  {rec.paidAmount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  })}
                                </div>
                                {rec.prePaidViaPoAdvanceAmount > 0 && (
                                  <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-sans font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                    <ShieldCheck className="h-2.5 w-2.5" />
                                    <span>
                                      {isAr
                                        ? `مخصوم مقدم PO: ${rec.prePaidViaPoAdvanceAmount.toLocaleString()}`
                                        : `PO Adv: ${rec.prePaidViaPoAdvanceAmount.toLocaleString()}`}
                                    </span>
                                  </div>
                                )}
                              </td>

                              <td className="p-3 align-top font-mono">
                                <div
                                  className={`font-black text-sm ${
                                    rec.status === 'closed'
                                      ? 'text-slate-400 line-through'
                                      : isReturn
                                      ? 'text-amber-700'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {rec.remainingAmount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  })}
                                </div>
                              </td>
                            </>
                          )}

                          {/* Status & Payment Method */}
                          <td className="p-3 align-top text-center">
                            {rec.status === 'closed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                {isAr ? 'مغلق بالكامل' : 'Closed'}
                              </span>
                            ) : rec.status === 'partially_closed' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                <Clock className="h-3 w-3" />
                                {isAr ? 'مغلق جزئياً' : 'Partially Closed'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                {isAr ? 'مفتوح' : 'Open'}
                              </span>
                            )}

                            {rec.lastPaymentSource && (
                              <div
                                className="text-[10px] text-slate-500 mt-1 max-w-[160px] mx-auto truncate"
                                title={rec.lastPaymentSource}
                              >
                                {rec.lastPaymentSource}
                              </div>
                            )}
                          </td>

                          {/* 1% WHT Certificate Column */}
                          <td className="p-3 align-top text-center">
                            {rec.isWhtApplicable ? (
                              <div className="space-y-1">
                                <div className="font-mono text-[11px] font-bold text-slate-700">
                                  {Math.abs(rec.docTotalWht).toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  })}{' '}
                                  {isAr ? 'ج.م' : 'EGP'}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenOrIssueWhtNote(rec)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                                    whtNote
                                      ? 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-300'
                                      : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                                  }`}
                                >
                                  <Printer className="h-3 w-3" />
                                  <span>
                                    {whtNote
                                      ? whtNote.serialNumber
                                      : isAr
                                      ? 'إصدار إشعار 1%'
                                      : 'Issue WHT'}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 align-top text-center">
                            <div className="flex items-center justify-center gap-1">
                              {rec.status !== 'closed' && canSettleDues && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPaymentModal([rec])}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shadow-2xs"
                                >
                                  {isAr ? 'سداد / تسوية' : 'Settle'}
                                </button>
                              )}

                              {(rec.paymentsHistory?.length > 0 || rec.prePaidViaPoAdvanceAmount > 0) && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryModalTranche(rec)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                  title={isAr ? 'سجل الدفعات والتسويات' : 'Payment History'}
                                >
                                  <History className="h-4 w-4" />
                                </button>
                              )}

                              <RowCommentButton
                                docId={rec.id}
                                docNumber={rec.id}
                                tab="dues_tracking"
                                module="finance"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MULTI-RECORD BATCH PAYMENT & CHRONOLOGICAL ALLOCATION MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Wallet className="h-5 w-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    {isAr
                      ? 'تسجيل دفعة وتسوية مستحقات المورد (سجل واحد أو دفعة مجمعة)'
                      : 'Supplier Payment & Multi-Record Settlement'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isAr
                      ? 'اختر السجلات المفتوحة ليتم ترتيبها زمنياً حسب تاريخ الاستحقاق مع إمكانية الإغلاق الجزئي ومنع الصرف الزائد'
                      : 'Select open records sorted chronologically by due date with partial closure support and strict overpayment prevention'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmBatchPayment} className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Step 1: Select Supplier & Multi-Select Unpaid/Incomplete Records */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="md:col-span-5">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {isAr ? '١- المورد المستفيد *' : '1. Beneficiary Supplier *'}
                  </label>
                  <SearchableSelect
                    options={modalSupplierOptions}
                    value={modalSupplierId}
                    onChange={(newSupId) => {
                      setModalSupplierId(newSupId);
                      setModalSelectedIds([]);
                      setModalReleaseAmounts({});
                      setInlineClampWarning('');
                    }}
                    placeholder={isAr ? 'اختر المورد...' : 'Select supplier...'}
                  />
                </div>

                {/* Multi-Select Dropdown for Unpaid / Incomplete Records */}
                <div className="md:col-span-7 relative">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {isAr
                      ? '٢- اختيار السجلات والدفعات غير المكتملة للمورد (متعدد) *'
                      : '2. Multi-Select Unpaid / Incomplete Records for Supplier *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsRecordDropdownOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3.5 py-2 bg-white border border-slate-300 hover:border-emerald-500 rounded-xl text-xs font-bold text-slate-800 transition cursor-pointer"
                  >
                    <span className="truncate">
                      {modalSelectedIds.length === 0
                        ? isAr
                          ? `اختر من السجلات المفتوحة (${supplierOpenRecords.length} سجل متاح)...`
                          : `Select from open records (${supplierOpenRecords.length} available)...`
                        : isAr
                        ? `تم اختيار (${modalSelectedIds.length}) سجل استحقاق / مرتجع / دفعة مقدمة`
                        : `Selected (${modalSelectedIds.length}) record(s)`}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>

                  {isRecordDropdownOpen && (
                    <div className="absolute z-30 mt-1 w-full bg-white border border-slate-300 rounded-xl shadow-xl max-h-64 flex flex-col overflow-hidden">
                      <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                        <Search className="h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={recordDropdownSearch}
                          onChange={(e) => setRecordDropdownSearch(e.target.value)}
                          placeholder={isAr ? 'بحث برقم الإذن أو الفاتورة أو التاريخ...' : 'Filter records...'}
                          className="w-full text-xs bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = supplierOpenRecords.map((r) => r.id);
                            const allAmts = {};
                            supplierOpenRecords.forEach((r) => {
                              allAmts[r.id] = r.remainingAmount;
                            });
                            setModalSelectedIds(allIds);
                            setModalReleaseAmounts(allAmts);
                          }}
                          className="text-[10px] font-bold text-emerald-700 hover:underline whitespace-nowrap cursor-pointer"
                        >
                          {isAr ? 'تحديد الكل' : 'Select All'}
                        </button>
                      </div>

                      <div className="overflow-y-auto divide-y divide-slate-100 p-1">
                        {supplierOpenRecords
                          .filter((r) => {
                            if (!recordDropdownSearch.trim()) return true;
                            const q = recordDropdownSearch.toLowerCase();
                            return (
                              r.id.toLowerCase().includes(q) ||
                              r.invoiceNumber?.toLowerCase().includes(q) ||
                              r.dueDate?.includes(q)
                            );
                          })
                          .map((rec) => {
                            const selected = modalSelectedIds.includes(rec.id);
                            const isRet = rec.docType === 'return';
                            const isPo = rec.docType === 'po_advance';
                            return (
                              <div
                                key={rec.id}
                                onClick={() => handleToggleModalRecord(rec)}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                                  selected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {selected ? (
                                    <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" />
                                  ) : (
                                    <Square className="h-4 w-4 text-slate-400 shrink-0" />
                                  )}
                                  <div>
                                    <div className="font-mono font-bold flex items-center gap-1.5">
                                      <span>{rec.id}</span>
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[9px] ${
                                          isRet
                                            ? 'bg-amber-100 text-amber-800'
                                            : isPo
                                            ? 'bg-indigo-100 text-indigo-800'
                                            : 'bg-emerald-100 text-emerald-800'
                                        }`}
                                      >
                                        {isRet
                                          ? isAr
                                            ? 'مرتجع RTN'
                                            : 'RTN'
                                          : isPo
                                          ? isAr
                                            ? 'دفعة مقدمة PO'
                                            : 'PO Advance'
                                          : `GRN (${rec.trancheIndex}/${rec.tranchesCount})`}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {isAr ? 'استحقاق:' : 'Due:'} {rec.dueDate}
                                      {rec.invoiceNumber ? ` | ${isAr ? 'فاتورة:' : 'Inv:'} ${rec.invoiceNumber}` : ''}
                                    </div>
                                  </div>
                                </div>
                                <div
                                  className={`font-mono font-bold ${
                                    isRet ? 'text-amber-700' : 'text-slate-900'
                                  }`}
                                >
                                  {rec.remainingAmount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  })}{' '}
                                  {isAr ? 'ج.م' : 'EGP'}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Inline Strict Overpayment Prevention Alert */}
              {inlineClampWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2 text-xs font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>{inlineClampWarning}</span>
                </div>
              )}

              {/* Step 2: Chronological Selected Records Breakdown Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800">
                    {isAr
                      ? '٣- جدول توزيع الدفعات المختارة (مرتبة زمنياً من الأقدم للأبعد استحقاقاً)'
                      : '3. Selected Records Allocation (Sorted Chronologically by Due Date)'}
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {isAr
                      ? 'يمكنك تعديل "المبلغ المراد صرفه" لأي سجل لترك رصيد متبقي وإغلاقه جزئياً'
                      : 'Adjust "Amount to Release" on any row to leave a partial balance'}
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-2.5 text-start">{isAr ? 'السجل والمرجع' : 'Record & Ref'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'تاريخ الاستحقاق (للقراءة)' : 'Due Date (Read-Only)'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'صافي المستحق / المرتجع المتبقي (للقراءة)' : 'Net Remaining (Read-Only)'}</th>
                        <th className="p-2.5 text-start w-48">{isAr ? 'المبلغ المراد صرفه / خصمه *' : 'Amount to Release *'}</th>
                        <th className="p-2.5 text-center">{isAr ? 'النتيجة بعد الصرف' : 'Resulting State'}</th>
                        <th className="p-2.5 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modalChronologicalRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400 font-semibold">
                            {isAr
                              ? 'يرجى اختيار سجل استحقاق واحد أو أكثر من القائمة المنسدلة أعلاه.'
                              : 'Please select one or more records from the dropdown above.'}
                          </td>
                        </tr>
                      ) : (
                        modalChronologicalRows.map((row, idx) => {
                          const isRet = row.docType === 'return';
                          const currentRelease = Number(modalReleaseAmounts[row.id]) || 0;
                          const remAfter = round2(row.remainingAmount - currentRelease);
                          const willBeClosed = Math.abs(remAfter) <= 0.009;

                          return (
                            <tr
                              key={row.id}
                              className={isRet ? 'bg-amber-50/40' : idx === modalChronologicalRows.length - 1 ? 'bg-slate-50/60' : ''}
                            >
                              <td className="p-2.5">
                                <div className="font-mono font-bold text-slate-900">{row.id}</div>
                                <div className="text-[10px] text-slate-500">
                                  {isRet
                                    ? isAr
                                      ? `مرتجع ${row.invoiceNumber ? `- إشعار ${row.invoiceNumber}` : ''}`
                                      : `Return ${row.invoiceNumber || ''}`
                                    : row.docType === 'po_advance'
                                    ? isAr
                                      ? `دفعة مقدمة على أمر شراء (${row.poId})`
                                      : `PO Advance (${row.poId})`
                                    : isAr
                                    ? `الدفعة ${row.trancheIndex}/${row.tranchesCount} ${
                                        row.invoiceNumber ? `- فاتورة ${row.invoiceNumber}` : ''
                                      }`
                                    : `Tranche ${row.trancheIndex}/${row.tranchesCount}`}
                                </div>
                              </td>

                              <td className="p-2.5 font-mono font-bold text-slate-700">
                                {row.dueDate}
                                {idx === modalChronologicalRows.length - 1 && modalChronologicalRows.length > 1 && (
                                  <span className="ms-1.5 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[9px] font-sans">
                                    {isAr ? 'الأبعد استحقاقاً' : 'Furthest Due'}
                                  </span>
                                )}
                              </td>

                              <td className="p-2.5 font-mono font-bold">
                                <span className={isRet ? 'text-amber-700' : 'text-slate-900'}>
                                  {row.remainingAmount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  })}{' '}
                                  {isAr ? 'ج.م' : 'EGP'}
                                </span>
                              </td>

                              <td className="p-2.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={modalReleaseAmounts[row.id] ?? ''}
                                  onChange={(e) => handleReleaseAmountChange(row, e.target.value)}
                                  className={`w-full p-1.5 border rounded-lg font-mono font-bold text-xs text-center focus:outline-none focus:ring-2 ${
                                    isRet
                                      ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-amber-500'
                                      : 'border-emerald-300 bg-white text-slate-900 focus:ring-emerald-500'
                                  }`}
                                />
                              </td>

                              <td className="p-2.5 text-center">
                                {willBeClosed ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {isAr ? 'إغلاق كلي' : 'Full Close'}
                                  </span>
                                ) : (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                                      {isAr ? 'إغلاق جزئي' : 'Partial Close'}
                                    </span>
                                    <div className="text-[10px] font-mono text-slate-500">
                                      {isAr ? 'يتبقى:' : 'Rem:'} {remAfter.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                )}
                              </td>

                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleModalRecord(row)}
                                  className="text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                  title={isAr ? 'إزالة من الدفعة' : 'Remove row'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Summary Totals Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900 text-white p-3.5 rounded-xl text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">
                      {isAr ? 'إجمالي الاستحقاقات المختارة (+)' : 'Positive Dues Selected (+)'}
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {modalBatchSummary.totalPositiveRelease.toLocaleString('en-US', {
                        minimumFractionDigits: 2
                      })}{' '}
                      {isAr ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">
                      {isAr ? 'إجمالي المرتجعات المخصومة (-)' : 'Returns Deducted (-)'}
                    </span>
                    <span className="font-mono font-bold text-sm text-amber-400">
                      -{modalBatchSummary.totalReturnDeduction.toLocaleString('en-US', {
                        minimumFractionDigits: 2
                      })}{' '}
                      {isAr ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                  <div className="sm:text-end">
                    <span className="text-slate-300 block text-[10px] font-bold">
                      {isAr ? 'صافي المبلغ المراد صرفه للمورد' : 'Net Total Payment to Release'}
                    </span>
                    <span className="font-mono font-black text-base text-white">
                      {modalBatchSummary.netReleaseAmount.toLocaleString('en-US', {
                        minimumFractionDigits: 2
                      })}{' '}
                      {isAr ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 3: Payment Method, Source & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'تاريخ السداد / التنفيذ *' : 'Payment Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'طريقة السداد *' : 'Payment Method *'}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                  >
                    <option value="transfer">{isAr ? 'تحويل بنكي (Bank Transfer)' : 'Bank Transfer'}</option>
                    <option value="cheque">{isAr ? 'شيك بنكي (Cheque)' : 'Cheque'}</option>
                    <option value="cash">{isAr ? 'نقدي من الخزينة (Cash Safe)' : 'Cash Safe'}</option>
                  </select>
                </div>

                {/* Dynamic Source Selector */}
                {paymentMethod === 'cash' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isAr ? 'الخزينة النقدية (المصدر) *' : 'Source Cash Safe *'}
                    </label>
                    <select
                      value={sourceSafeId}
                      onChange={(e) => setSourceSafeId(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                    >
                      {cashSafes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {isAr ? s.nameAr : s.nameEn || s.nameAr} ({s.id})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isAr ? 'الحساب البنكي (المصدر) *' : 'Source Bank Account *'}
                    </label>
                    <select
                      value={sourceBankId}
                      onChange={(e) => setSourceBankId(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                    >
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} - {b.accountNumber} ({b.currency || 'EGP'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Extra Method Details: Transfer Reference or Cheque Number & Maturity Date */}
              {paymentMethod === 'transfer' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isAr ? 'رقم مرجع التحويل البنكي / السويفت' : 'Bank Transfer Reference No.'}
                    </label>
                    <input
                      type="text"
                      value={transferRefNumber}
                      onChange={(e) => setTransferRefNumber(e.target.value)}
                      placeholder={isAr ? 'مثال: TRF-9928374...' : 'e.g. TRF-9928374...'}
                      className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {isAr ? 'ملاحظات السداد' : 'Payment Notes'}
                    </label>
                    <input
                      type="text"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder={isAr ? 'بيان إضافي للدفعة...' : 'Optional remarks...'}
                      className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'cheque' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      {isAr ? 'رقم الشيك البنكي *' : 'Cheque Number *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      placeholder={isAr ? 'أدخل رقم الشيك...' : 'Enter cheque no...'}
                      className="w-full p-2 border border-amber-300 rounded-xl text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      {isAr ? 'تاريخ استحقاق الشيك' : 'Cheque Maturity Date'}
                    </label>
                    <input
                      type="date"
                      value={chequeDueDate}
                      onChange={(e) => setChequeDueDate(e.target.value)}
                      className="w-full p-2 border border-amber-300 rounded-xl text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      {isAr ? 'ملاحظات' : 'Notes'}
                    </label>
                    <input
                      type="text"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="w-full p-2 border border-amber-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'cash' && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 text-xs">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-emerald-900 mb-1">
                      {isAr ? 'بيان / ملاحظات الصرف النقدي' : 'Cash Disbursement Notes'}
                    </label>
                    <input
                      type="text"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder={isAr ? 'ملاحظات إذن الصرف...' : 'Notes...'}
                      className="w-full p-2 border border-emerald-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                  {sourceSafeId && (
                    <button
                      type="button"
                      onClick={() => {
                        const safeObj = cashSafes.find((s) => s.id === sourceSafeId);
                        if (safeObj) setCashVoucherModalSafe(safeObj);
                      }}
                      className="px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      {isAr ? 'فتح سند صرف خزينة بفئات النقدية' : 'Open Cash Safe Denomination Voucher'}
                    </button>
                  )}
                </div>
              )}

              {/* Optional Receipt Attachment */}
              <div className="flex items-center justify-between bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-700">
                    {paymentAttachment
                      ? paymentAttachment.fileName || (isAr ? 'تم إرفاق إيصال السداد' : 'Receipt attached')
                      : isAr
                      ? 'إرفاق صورة التحويل / الشيك / الإيصال (اختياري)'
                      : 'Attach Transfer Slip / Cheque / Receipt (Optional)'}
                  </span>
                </div>
                <label className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-700 cursor-pointer transition">
                  <span>{isAr ? 'اختيار ملف' : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const data = await fileToDataUrl(file);
                      if (data) setPaymentAttachment(data);
                    }}
                  />
                </label>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSavingPayment || modalChronologicalRows.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-xs"
                >
                  {isSavingPayment
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? `اعتماد وتسجيل الدفعة (${modalBatchSummary.netReleaseAmount.toLocaleString('en-US', {
                        minimumFractionDigits: 2
                      })} ج.م)`
                    : `Confirm Payment (${modalBatchSummary.netReleaseAmount.toLocaleString('en-US', {
                        minimumFractionDigits: 2
                      })} EGP)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYMENT HISTORY MODAL FOR A SPECIFIC TRANCHE */}
      {historyModalTranche && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-emerald-400" />
                <h3 className="font-bold text-sm">
                  {isAr
                    ? `سجل الدفعات والتسويات — ${historyModalTranche.id}`
                    : `Settlement History — ${historyModalTranche.id}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalTranche(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto text-xs">
              {historyModalTranche.prePaidViaPoAdvanceAmount > 0 && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="font-bold text-indigo-900">
                      {isAr
                        ? `خصم تلقائي من الدفعة المقدمة لأمر الشراء (${historyModalTranche.poId})`
                        : `Auto-Deducted from PO Advance (${historyModalTranche.poId})`}
                    </div>
                    <div className="text-[11px] text-indigo-700 mt-0.5">
                      {isAr
                        ? 'تم تطبيقها تلقائياً عند الاستلام لمنع تكرار السداد'
                        : 'Applied automatically upon receipt to prevent double-payment'}
                    </div>
                  </div>
                  <span className="font-mono font-black text-indigo-900 text-sm">
                    {historyModalTranche.prePaidViaPoAdvanceAmount.toLocaleString('en-US', {
                      minimumFractionDigits: 2
                    })}{' '}
                    {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              )}

              {(historyModalTranche.paymentsHistory || []).map((p, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">
                      {p.batchId} — {p.sourceLabel}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isAr ? 'التاريخ:' : 'Date:'} {p.paymentDate} | {isAr ? 'بواسطة:' : 'By:'} {p.recordedBy}
                    </div>
                    {p.notes && <div className="text-[11px] text-slate-600">{p.notes}</div>}
                  </div>
                  <div className="font-mono font-black text-emerald-700 text-sm">
                    {Number(p.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    {isAr ? 'ج.م' : 'EGP'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* OPTIONAL LINKED CASH SAFE VOUCHER MODAL */}
      {cashVoucherModalSafe && (
        <CashVoucherModal
          safe={cashVoucherModalSafe}
          allSafes={cashSafes}
          suppliersList={suppliers}
          currentUser={currentUser}
          isOpen={Boolean(cashVoucherModalSafe)}
          initialType="disbursement"
          onClose={() => setCashVoucherModalSafe(null)}
          onSuccess={() => setCashVoucherModalSafe(null)}
        />
      )}

      {/* A4 DUAL-HALF 1% WHT CERTIFICATE PRINT SLIP */}
      {activeWhtSlip && (
        <WhtNotePrintSlip
          isOpen={Boolean(activeWhtSlip)}
          onClose={() => setActiveWhtSlip(null)}
          whtData={activeWhtSlip.whtData}
          supplier={activeWhtSlip.supplier}
          isAr={isAr}
          onToggleDelivered={handleToggleWhtDelivered}
        />
      )}
    </div>
  );
}
