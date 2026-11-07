import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Building2,
  Users,
  Search,
  Filter,
  Calendar,
  RotateCcw,
  Printer,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Scale,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  ChevronDown,
  Check,
  X,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  FileSpreadsheet
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase.js';
import SearchableSelect from './SearchableSelect.jsx';
import PartnerStatementPrintSlip from './PartnerStatementPrintSlip.jsx';
import { tafqeetArabic } from '../utils/tafqeet.js';
import { triggerDatabaseRefresh } from '../utils/universalRefresh.js';

// Predefined Period Filter Helpers
const getPeriodDates = (periodKey) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const todayStr = now.toISOString().slice(0, 10);

  if (periodKey === 'today') {
    return { from: todayStr, to: todayStr };
  }
  if (periodKey === 'this_week') {
    const day = now.getDay(); // 0 is Sunday
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const monday = new Date(now.setDate(diff));
    return { from: monday.toISOString().slice(0, 10), to: todayStr };
  }
  if (periodKey === 'this_month') {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { from: firstDay.toISOString().slice(0, 10), to: lastDay.toISOString().slice(0, 10) };
  }
  if (periodKey === 'last_month') {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    return { from: firstDay.toISOString().slice(0, 10), to: lastDay.toISOString().slice(0, 10) };
  }
  if (periodKey === 'this_quarter') {
    const quarter = Math.floor(month / 3);
    const firstDay = new Date(year, quarter * 3, 1);
    const lastDay = new Date(year, (quarter + 1) * 3, 0);
    return { from: firstDay.toISOString().slice(0, 10), to: lastDay.toISOString().slice(0, 10) };
  }
  if (periodKey === 'this_year') {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return { from: '', to: '' };
};

export default function PartnerStatementsMaster({ currentUser }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // 1. Data Collections State
  const [suppliersList, setSuppliersList] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [cashTransactions, setCashTransactions] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // 2. Selection & Filter State (Synchronized with URL hash subTab)
  const [partyType, setPartyType] = useState(() => {
    if (typeof window !== 'undefined') {
      const raw = window.location.hash || '';
      if (raw.includes('?')) {
        const p = new URLSearchParams(raw.split('?')[1]);
        const s = p.get('subTab');
        if (s === 'supplier' || s === 'client') return s;
      }
    }
    return 'supplier';
  });

  // Sync partyType into URL hash subTab so refresh returns to same view
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash || '#party_statements';
    const [base, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    if (params.get('subTab') !== partyType || !params.has('module')) {
      params.set('subTab', partyType);
      if (!params.has('module')) params.set('module', 'finance');
      const newHash = `${base || '#party_statements'}?${params.toString()}`;
      window.history.replaceState(null, '', newHash);
    }
  }, [partyType]);

  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [periodPreset, setPeriodPreset] = useState('this_month');
  const [fromDate, setFromDate] = useState(() => getPeriodDates('this_month').from);
  const [toDate, setToDate] = useState(() => getPeriodDates('this_month').to);
  const [showReversed, setShowReversed] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState('all'); // 'all' | 'grn' | 'disbursement' | 'collection' | 'journal'
  const [taxFilter, setTaxFilter] = useState('all'); // 'all' | 'tax' | 'non_tax'
  const [searchQuery, setSearchQuery] = useState('');

  // 3. Print Slip Modal State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real-time Firestore Subscriptions
  useEffect(() => {
    setLoading(true);
    const unsubSup = onSnapshot(collection(db, 'suppliers'), (snap) => {
      setSuppliersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClientsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubGrn = onSnapshot(collection(db, 'goods_receipts'), (snap) => {
      setGoodsReceipts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubCash = onSnapshot(collection(db, 'cash_transactions'), (snap) => {
      setCashTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubJe = onSnapshot(collection(db, 'journal_entries'), (snap) => {
      setJournalEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubPo = onSnapshot(collection(db, 'purchase_orders'), (snap) => {
      setPurchaseOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubSup();
      unsubClients();
      unsubGrn();
      unsubCash();
      unsubJe();
      unsubPo();
    };
  }, []);

  // Update Period Dates when Preset changes
  const handlePeriodPresetChange = (presetKey) => {
    setPeriodPreset(presetKey);
    if (presetKey === 'all') {
      setFromDate('');
      setToDate('');
    } else if (presetKey !== 'custom') {
      const dates = getPeriodDates(presetKey);
      setFromDate(dates.from);
      setToDate(dates.to);
    }
  };

  // Reset selected party when partyType toggles
  useEffect(() => {
    setSelectedPartyId('');
  }, [partyType]);

  // Options for SearchableSelect
  const partySelectOptions = useMemo(() => {
    const list = partyType === 'supplier' ? suppliersList : clientsList;
    return list.map((p) => {
      const name = p.name || p.tradeName || p.taxpayerLegalName || p.id;
      const code = p.code || p.id;
      const taxId = p.taxNumber || p.vatNumber || p.taxCardNumber || '';
      return {
        value: p.id,
        label: name,
        sublabel: code,
        badgeText: taxId ? `ب.ض: ${taxId}` : '',
        specs: `${taxId} ${p.phone || ''} ${p.address || ''}`,
        group: partyType === 'supplier' ? (isAr ? 'قائمة الموردين' : 'Suppliers List') : (isAr ? 'قائمة العملاء' : 'Clients List')
      };
    });
  }, [partyType, suppliersList, clientsList, isAr]);

  // Active Selected Party Object
  const selectedParty = useMemo(() => {
    if (!selectedPartyId) return null;
    const list = partyType === 'supplier' ? suppliersList : clientsList;
    return list.find((p) => p.id === selectedPartyId) || null;
  }, [selectedPartyId, partyType, suppliersList, clientsList]);

  // Raw Unified Transaction Stream for the Selected Partner
  const rawPartnerTransactions = useMemo(() => {
    if (!selectedPartyId) return [];
    const partyName = selectedParty?.name || selectedParty?.tradeName || '';
    const partyId = selectedPartyId;
    const items = [];

    if (partyType === 'supplier') {
      // 1. Goods Receipts (GRNs) -> Credits (Liability to Supplier increases)
      goodsReceipts.forEach((grn) => {
        const matchesSupplier =
          grn.supplierId === partyId ||
          (partyName && (grn.supplierName === partyName || grn.supplierNameAr === partyName));

        if (!matchesSupplier) return;

        const isReturn = grn.docType === 'return' || grn.id?.startsWith('RTN');
        const isCancelled = grn.status === 'cancelled' || grn.status === 'rejected';
        const isReversed = Boolean(grn.isReversed) || grn.status === 'reversed';
        const amount = Number(grn.financials?.totalNetWithTax ?? grn.financials?.netPayable ?? grn.financials?.grandTotal ?? 0);

        // For Supplier: Standard GRN = Credit (Payable), Return = Debit (reduces Payable)
        const debit = isReturn ? amount : 0;
        const credit = isReturn ? 0 : amount;

        const date = grn.receiptDate || (grn.createdAt ? (typeof grn.createdAt === 'string' ? grn.createdAt.slice(0, 10) : new Date(grn.createdAt.seconds * 1000).toISOString().slice(0, 10)) : '');

        // Resolve Taxable Document Details (Invoice / Credit Note / Debit Note)
        let taxDocType = null;
        let taxDocNumber = '';
        let taxDocDate = '';

        if (isReturn) {
          if (grn.creditNoteNumber) {
            taxDocType = 'credit_note';
            taxDocNumber = grn.creditNoteNumber;
            taxDocDate = grn.creditNoteDate || date;
          } else if (grn.debitNoteNumber) {
            taxDocType = 'debit_note';
            taxDocNumber = grn.debitNoteNumber;
            taxDocDate = grn.debitNoteDate || date;
          } else if (grn.taxInvoiceNumber) {
            taxDocType = 'credit_note';
            taxDocNumber = grn.taxInvoiceNumber;
            taxDocDate = grn.taxInvoiceDate || date;
          }
        } else {
          if (grn.taxInvoiceNumber) {
            taxDocType = 'invoice';
            taxDocNumber = grn.taxInvoiceNumber;
            taxDocDate = grn.taxInvoiceDate || date;
          } else if (grn.creditNoteNumber) {
            taxDocType = 'credit_note';
            taxDocNumber = grn.creditNoteNumber;
            taxDocDate = grn.creditNoteDate || date;
          } else if (grn.debitNoteNumber) {
            taxDocType = 'debit_note';
            taxDocNumber = grn.debitNoteNumber;
            taxDocDate = grn.debitNoteDate || date;
          }
        }

        const isTaxOfficial = Boolean(grn.isTaxOfficial || taxDocNumber);
        const etaPortalRegistered = Boolean(grn.etaPortalRegistered);

        items.push({
          id: grn.id,
          sourceDocType: 'grn',
          typeLabel: isReturn ? (isAr ? 'مرتجع بضاعة' : 'Goods Return') : (isAr ? 'إذن استلام بضاعة' : 'Goods Receipt'),
          docNo: grn.id,
          reference: grn.poId || grn.supplierDeliveryNote || '—',
          date,
          createdAt: date,
          description: grn.notes || (isReturn ? `مرتجع بضاعة إلى المورد ${partyName}` : `توريد بضاعة بموجب إذن الاستلام ${grn.id}`),
          taxDocType,
          taxDocNumber,
          taxDocDate,
          etaPortalRegistered,
          taxInvoiceNo: taxDocNumber,
          isTaxOfficial,
          debit,
          credit,
          status: isReversed ? 'reversed' : isCancelled ? 'cancelled' : grn.status || 'approved',
          isReversed: isReversed || isCancelled,
          reversalReason: grn.reversalReason || '',
          raw: grn
        });
      });

      // 2. Cash Transactions -> Debits (Disbursements to Supplier reduce liability)
      cashTransactions.forEach((tx) => {
        const matchesSupplier =
          tx.subAccountId === partyId ||
          (partyName && tx.subAccountName === partyName) ||
          tx.supplierAllocation?.supplierId === partyId ||
          tx.supplierId === partyId;

        if (!matchesSupplier) return;

        const amt = Number(tx.amountInEGP || tx.amount || 0);
        const isOutflow = tx.direction === 'out' || tx.type === 'disbursement';
        const isRev = tx.status === 'reversed' || tx.isReversed === true || tx.id.startsWith('REV-');

        // Cash paid to supplier = Debit; Cash refund from supplier = Credit
        const debit = isOutflow ? amt : 0;
        const credit = isOutflow ? 0 : amt;

        const date = tx.date || (tx.createdAt ? tx.createdAt.slice(0, 10) : '');

        let taxDocType = null;
        let taxDocNumber = '';
        let taxDocDate = '';

        if (tx.creditNoteNumber || tx.taxDetails?.creditNoteNumber) {
          taxDocType = 'credit_note';
          taxDocNumber = tx.creditNoteNumber || tx.taxDetails?.creditNoteNumber;
          taxDocDate = tx.creditNoteDate || tx.taxDetails?.creditNoteDate || date;
        } else if (tx.debitNoteNumber || tx.taxDetails?.debitNoteNumber) {
          taxDocType = 'debit_note';
          taxDocNumber = tx.debitNoteNumber || tx.taxDetails?.debitNoteNumber;
          taxDocDate = tx.debitNoteDate || tx.taxDetails?.debitNoteDate || date;
        } else if (tx.taxInvoiceNumber || tx.taxDetails?.invoiceNumber || tx.taxDetails?.taxInvoiceNumber) {
          taxDocType = 'invoice';
          taxDocNumber = tx.taxInvoiceNumber || tx.taxDetails?.invoiceNumber || tx.taxDetails?.taxInvoiceNumber;
          taxDocDate = tx.taxInvoiceDate || tx.taxDetails?.invoiceDate || date;
        }

        const isTaxOfficial = tx.taxDocumentType === 'taxable' || tx.isTaxOfficial === true || Boolean(taxDocNumber);
        const etaPortalRegistered = Boolean(tx.etaPortalRegistered || tx.taxDetails?.etaPortalRegistered);

        items.push({
          id: tx.id,
          sourceDocType: 'disbursement',
          typeLabel: tx.typeAr || (isOutflow ? (isAr ? 'سند صرف نقدية' : 'Cash Disbursement') : (isAr ? 'سند تحصيل نقدية' : 'Cash Receipt')),
          docNo: tx.voucherNumber || tx.id,
          reference: tx.referenceNumber || tx.id,
          date,
          createdAt: tx.createdAt || date,
          description: tx.description || `${tx.typeAr || ''} - ${partyName}`,
          taxDocType,
          taxDocNumber,
          taxDocDate,
          etaPortalRegistered,
          taxInvoiceNo: taxDocNumber,
          isTaxOfficial,
          debit,
          credit,
          status: isRev ? 'reversed' : tx.status || 'posted',
          isReversed: isRev,
          reversalReason: tx.reversalReason || '',
          raw: tx
        });
      });

      // 3. Journal Entries & Manual Adjustments linked to this Supplier
      journalEntries.forEach((je) => {
        const matchesSupplier =
          je.subLedgerId === partyId ||
          je.supplierId === partyId ||
          (partyName && (je.subLedgerName === partyName || je.supplierName === partyName)) ||
          (je.lines || []).some((l) => l.subledgerId === partyId || (partyName && l.subledgerName === partyName));

        if (!matchesSupplier) return;

        // Sum lines specifically allocated to this supplier
        let debit = 0;
        let credit = 0;
        (je.lines || []).forEach((l) => {
          if (l.subledgerId === partyId || (partyName && l.subledgerName === partyName) || l.accountCode === '2020101') {
            debit += Number(l.debit) || 0;
            credit += Number(l.credit) || 0;
          }
        });

        if (debit === 0 && credit === 0) {
          debit = Number(je.totalDebit) || 0;
          credit = Number(je.totalCredit) || 0;
        }

        const isRev = je.status === 'reversed' || je.id?.startsWith('JE-REV-');
        const date = je.entryDate || (je.createdAt ? je.createdAt.slice(0, 10) : '');

        let taxDocType = null;
        let taxDocNumber = '';
        let taxDocDate = '';

        const refLower = (je.referenceNumber || '').toLowerCase();
        if (je.creditNoteNumber || refLower.includes('cn-') || refLower.includes('دائن') || refLower.includes('خصم')) {
          taxDocType = 'credit_note';
          taxDocNumber = je.creditNoteNumber || je.referenceNumber;
          taxDocDate = je.creditNoteDate || date;
        } else if (je.debitNoteNumber || refLower.includes('dn-') || refLower.includes('مدين') || refLower.includes('إضافة')) {
          taxDocType = 'debit_note';
          taxDocNumber = je.debitNoteNumber || je.referenceNumber;
          taxDocDate = je.debitNoteDate || date;
        } else if (je.taxInvoiceNumber || je.invoiceNumber || refLower.includes('inv-') || refLower.includes('فاتورة')) {
          taxDocType = 'invoice';
          taxDocNumber = je.taxInvoiceNumber || je.invoiceNumber || je.referenceNumber;
          taxDocDate = je.taxInvoiceDate || date;
        }

        const isTaxOfficial = Boolean(je.isTaxOfficial || taxDocNumber);
        const etaPortalRegistered = Boolean(je.etaPortalRegistered);

        items.push({
          id: je.id,
          sourceDocType: 'journal',
          typeLabel: isRev ? (isAr ? 'قيد عكسي وتسوية' : 'Reversal Journal') : (isAr ? 'قيد تسوية ومشتريات' : 'Journal Entry'),
          docNo: je.entryNumber || je.id,
          reference: je.referenceNumber || je.id,
          date,
          createdAt: je.createdAt || date,
          description: je.descriptionAr || je.description || `قيد يومية - ${partyName}`,
          taxDocType,
          taxDocNumber,
          taxDocDate,
          etaPortalRegistered,
          taxInvoiceNo: taxDocNumber,
          isTaxOfficial,
          debit,
          credit,
          status: isRev ? 'reversed' : je.status || 'posted',
          isReversed: isRev,
          reversalReason: je.reversalReason || '',
          raw: je
        });
      });
    } else {
      // CLIENTS STREAM
      // 1. Cash Collections from Client -> Credits (Reduces Client Receivable)
      cashTransactions.forEach((tx) => {
        const matchesClient =
          tx.subAccountId === partyId ||
          (partyName && tx.subAccountName === partyName) ||
          tx.clientId === partyId;

        if (!matchesClient) return;

        const amt = Number(tx.amountInEGP || tx.amount || 0);
        const isInflow = tx.direction === 'in' || tx.type === 'collection';
        const isRev = tx.status === 'reversed' || tx.isReversed === true || tx.id.startsWith('REV-');

        // Cash collection from client = Credit (receivable reduced); Refund to client = Debit
        const debit = isInflow ? 0 : amt;
        const credit = isInflow ? amt : 0;

        const date = tx.date || (tx.createdAt ? tx.createdAt.slice(0, 10) : '');

        let taxDocType = null;
        let taxDocNumber = '';
        let taxDocDate = '';

        if (tx.creditNoteNumber || tx.taxDetails?.creditNoteNumber) {
          taxDocType = 'credit_note';
          taxDocNumber = tx.creditNoteNumber || tx.taxDetails?.creditNoteNumber;
          taxDocDate = tx.creditNoteDate || tx.taxDetails?.creditNoteDate || date;
        } else if (tx.debitNoteNumber || tx.taxDetails?.debitNoteNumber) {
          taxDocType = 'debit_note';
          taxDocNumber = tx.debitNoteNumber || tx.taxDetails?.debitNoteNumber;
          taxDocDate = tx.debitNoteDate || tx.taxDetails?.debitNoteDate || date;
        } else if (tx.taxInvoiceNumber || tx.taxDetails?.invoiceNumber || tx.taxDetails?.taxInvoiceNumber) {
          taxDocType = 'invoice';
          taxDocNumber = tx.taxInvoiceNumber || tx.taxDetails?.invoiceNumber || tx.taxDetails?.taxInvoiceNumber;
          taxDocDate = tx.taxInvoiceDate || tx.taxDetails?.invoiceDate || date;
        }

        const isTaxOfficial = tx.taxDocumentType === 'taxable' || tx.isTaxOfficial === true || Boolean(taxDocNumber);
        const etaPortalRegistered = Boolean(tx.etaPortalRegistered || tx.taxDetails?.etaPortalRegistered);

        items.push({
          id: tx.id,
          sourceDocType: 'collection',
          typeLabel: tx.typeAr || (isInflow ? (isAr ? 'سند تحصيل نقدية' : 'Cash Receipt') : (isAr ? 'سند صرف نقدية' : 'Cash Disbursement')),
          docNo: tx.voucherNumber || tx.id,
          reference: tx.referenceNumber || tx.id,
          date,
          createdAt: tx.createdAt || date,
          description: tx.description || `${tx.typeAr || ''} - ${partyName}`,
          taxDocType,
          taxDocNumber,
          taxDocDate,
          etaPortalRegistered,
          taxInvoiceNo: taxDocNumber,
          isTaxOfficial,
          debit,
          credit,
          status: isRev ? 'reversed' : tx.status || 'posted',
          isReversed: isRev,
          reversalReason: tx.reversalReason || '',
          raw: tx
        });
      });

      // 2. Journal Entries & Invoices for Client
      journalEntries.forEach((je) => {
        const matchesClient =
          je.subLedgerId === partyId ||
          je.clientId === partyId ||
          (partyName && (je.subLedgerName === partyName || je.clientName === partyName)) ||
          (je.lines || []).some((l) => l.subledgerId === partyId || (partyName && l.subledgerName === partyName));

        if (!matchesClient) return;

        let debit = 0;
        let credit = 0;
        (je.lines || []).forEach((l) => {
          if (l.subledgerId === partyId || (partyName && l.subledgerName === partyName)) {
            debit += Number(l.debit) || 0;
            credit += Number(l.credit) || 0;
          }
        });

        if (debit === 0 && credit === 0) {
          debit = Number(je.totalDebit) || 0;
          credit = Number(je.totalCredit) || 0;
        }

        const isRev = je.status === 'reversed' || je.id?.startsWith('JE-REV-');
        const date = je.entryDate || (je.createdAt ? je.createdAt.slice(0, 10) : '');

        let taxDocType = null;
        let taxDocNumber = '';
        let taxDocDate = '';

        const refLower = (je.referenceNumber || '').toLowerCase();
        if (je.creditNoteNumber || refLower.includes('cn-') || refLower.includes('دائن') || refLower.includes('خصم')) {
          taxDocType = 'credit_note';
          taxDocNumber = je.creditNoteNumber || je.referenceNumber;
          taxDocDate = je.creditNoteDate || date;
        } else if (je.debitNoteNumber || refLower.includes('dn-') || refLower.includes('مدين') || refLower.includes('إضافة')) {
          taxDocType = 'debit_note';
          taxDocNumber = je.debitNoteNumber || je.referenceNumber;
          taxDocDate = je.debitNoteDate || date;
        } else if (je.taxInvoiceNumber || je.invoiceNumber || refLower.includes('inv-') || refLower.includes('فاتورة')) {
          taxDocType = 'invoice';
          taxDocNumber = je.taxInvoiceNumber || je.invoiceNumber || je.referenceNumber;
          taxDocDate = je.taxInvoiceDate || date;
        }

        const isTaxOfficial = Boolean(je.isTaxOfficial || taxDocNumber);
        const etaPortalRegistered = Boolean(je.etaPortalRegistered);

        items.push({
          id: je.id,
          sourceDocType: 'journal',
          typeLabel: isRev ? (isAr ? 'قيد عكسي' : 'Reversal Journal') : (isAr ? 'قيد يومية ومبيعات' : 'Sales Journal'),
          docNo: je.entryNumber || je.id,
          reference: je.referenceNumber || je.id,
          date,
          createdAt: je.createdAt || date,
          description: je.descriptionAr || je.description || `قيد عميل - ${partyName}`,
          taxDocType,
          taxDocNumber,
          taxDocDate,
          etaPortalRegistered,
          taxInvoiceNo: taxDocNumber,
          isTaxOfficial,
          debit,
          credit,
          status: isRev ? 'reversed' : je.status || 'posted',
          isReversed: isRev,
          reversalReason: je.reversalReason || '',
          raw: je
        });
      });
    }

    // Sort chronologically ascending for standard statement ledger flow
    items.sort((a, b) => {
      const dateA = a.date || a.createdAt || '';
      const dateB = b.date || b.createdAt || '';
      return dateA.localeCompare(dateB);
    });

    return items;
  }, [selectedPartyId, partyType, selectedParty, goodsReceipts, cashTransactions, journalEntries, isAr]);

  // Count reversed transactions for indicator badge
  const reversedCount = useMemo(() => {
    return rawPartnerTransactions.filter((tx) => tx.isReversed).length;
  }, [rawPartnerTransactions]);

  // Filter Stream based on Period, showReversed, docType, tax, and text search
  const { periodTransactions, openingBalance, closingBalance, totalDebit, totalCredit } = useMemo(() => {
    if (!selectedPartyId) {
      return { periodTransactions: [], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };
    }

    let prePeriodBal = 0;
    const inPeriodList = [];

    rawPartnerTransactions.forEach((tx) => {
      // 1. Strict Reversal Exclusion if toggle is OFF
      if (!showReversed && tx.isReversed) {
        return;
      }

      const txDate = tx.date || '';

      // Check whether this transaction falls strictly prior to fromDate
      const isBeforePeriod = fromDate && txDate && txDate < fromDate;

      if (isBeforePeriod) {
        if (partyType === 'supplier') {
          // For Supplier: Credit increases payable, Debit decreases
          prePeriodBal += Number(tx.credit) - Number(tx.debit);
        } else {
          // For Client: Debit increases receivable, Credit decreases
          prePeriodBal += Number(tx.debit) - Number(tx.credit);
        }
        return;
      }

      // Check toDate bound
      const isAfterPeriod = toDate && txDate && txDate > toDate;
      if (isAfterPeriod) {
        return;
      }

      // Check docType filter
      if (docTypeFilter !== 'all' && tx.sourceDocType !== docTypeFilter) {
        return;
      }

      // Check tax filter
      if (taxFilter === 'tax' || taxFilter === 'tax_all') {
        if (!tx.isTaxOfficial || !tx.taxDocNumber) return;
      } else if (taxFilter === 'invoices') {
        if (tx.taxDocType !== 'invoice' || !tx.taxDocNumber) return;
      } else if (taxFilter === 'credit_notes') {
        if (tx.taxDocType !== 'credit_note' || !tx.taxDocNumber) return;
      } else if (taxFilter === 'debit_notes') {
        if (tx.taxDocType !== 'debit_note' || !tx.taxDocNumber) return;
      } else if (taxFilter === 'non_tax') {
        if (tx.isTaxOfficial || Boolean(tx.taxDocNumber)) return;
      }

      // Check search query (searches text, internal doc #, ref, tax invoice/credit/debit note #)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const d = (tx.description || '').toLowerCase();
        const docNo = (tx.docNo || '').toLowerCase();
        const ref = (tx.reference || '').toLowerCase();
        const taxNo = (tx.taxDocNumber || tx.taxInvoiceNo || '').toLowerCase();
        const taxType = (tx.taxDocType || '').toLowerCase();
        if (!d.includes(q) && !docNo.includes(q) && !ref.includes(q) && !taxNo.includes(q) && !taxType.includes(q)) {
          return;
        }
      }

      inPeriodList.push(tx);
    });

    // Compute Running Balances
    let running = prePeriodBal;
    let periodDebits = 0;
    let periodCredits = 0;

    const withRunning = inPeriodList.map((tx) => {
      const d = Number(tx.debit) || 0;
      const c = Number(tx.credit) || 0;
      periodDebits += d;
      periodCredits += c;

      if (partyType === 'supplier') {
        running = running + c - d;
      } else {
        running = running + d - c;
      }

      return {
        ...tx,
        runningBalance: running
      };
    });

    return {
      periodTransactions: withRunning,
      openingBalance: prePeriodBal,
      closingBalance: running,
      totalDebit: periodDebits,
      totalCredit: periodCredits
    };
  }, [
    rawPartnerTransactions,
    selectedPartyId,
    partyType,
    fromDate,
    toDate,
    showReversed,
    docTypeFilter,
    taxFilter,
    searchQuery
  ]);

  // Taxable Documents Summary Stats for Active Period
  const taxStats = useMemo(() => {
    let invoicesCount = 0;
    let invoicesTotal = 0;
    let creditNotesCount = 0;
    let creditNotesTotal = 0;
    let debitNotesCount = 0;
    let debitNotesTotal = 0;

    periodTransactions.forEach((tx) => {
      if (tx.isReversed) return;
      const amt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0);
      if (tx.taxDocType === 'invoice') {
        invoicesCount++;
        invoicesTotal += amt;
      } else if (tx.taxDocType === 'credit_note') {
        creditNotesCount++;
        creditNotesTotal += amt;
      } else if (tx.taxDocType === 'debit_note') {
        debitNotesCount++;
        debitNotesTotal += amt;
      }
    });

    return {
      invoicesCount,
      invoicesTotal,
      creditNotesCount,
      creditNotesTotal,
      debitNotesCount,
      debitNotesTotal,
      totalTaxDocsCount: invoicesCount + creditNotesCount + debitNotesCount
    };
  }, [periodTransactions]);

  // Export to UTF-8 CSV with BOM for Excel
  const handleExportCSV = () => {
    if (!selectedParty || periodTransactions.length === 0) return;

    const headers = [
      '#',
      isAr ? 'التاريخ' : 'Date',
      isAr ? 'نوع المستند الضريبي' : 'Tax Doc Type',
      isAr ? 'رقم المستند الضريبي (فاتورة / إشعار دائن أو مدين)' : 'Tax Doc Number (Inv / CN / DN)',
      isAr ? 'منظومة الفاتورة الإلكترونية ETA' : 'ETA Registered',
      isAr ? 'نوع الحركة الداخلي' : 'Internal Doc Type',
      isAr ? 'رقم الإذن الداخلي' : 'Internal Doc No',
      isAr ? 'المرجع' : 'Reference',
      isAr ? 'البيان والشرح' : 'Description',
      isAr ? 'مدين (ج.م)' : 'Debit (EGP)',
      isAr ? 'دائن (ج.م)' : 'Credit (EGP)',
      isAr ? 'الرصيد التراكمي' : 'Running Balance',
      isAr ? 'الحالة' : 'Status'
    ];

    const getTaxDocTypeExportLabel = (tx) => {
      if (!tx.taxDocNumber) return isAr ? 'مستند داخلي' : 'Internal';
      if (tx.taxDocType === 'credit_note') return isAr ? 'إشعار دائن (خصم)' : 'Credit Note';
      if (tx.taxDocType === 'debit_note') return isAr ? 'إشعار مدين (إضافة)' : 'Debit Note';
      return isAr ? 'فاتورة ضريبية رسمية' : 'Tax Invoice';
    };

    const rows = [
      [
        '0',
        fromDate || '—',
        '—',
        '—',
        '—',
        isAr ? 'الرصيد الافتتاحي' : 'Opening Balance',
        '—',
        '—',
        isAr ? 'الرصيد السابق للفترة' : 'Balance prior to period',
        '0.00',
        '0.00',
        openingBalance.toFixed(2),
        '—'
      ],
      ...periodTransactions.map((tx, idx) => [
        idx + 1,
        tx.date,
        getTaxDocTypeExportLabel(tx),
        tx.taxDocNumber || '—',
        tx.etaPortalRegistered ? (isAr ? 'نعم - مسجلة' : 'Yes') : (isAr ? 'لا' : 'No'),
        tx.typeLabel,
        tx.docNo,
        tx.reference,
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        Number(tx.debit || 0).toFixed(2),
        Number(tx.credit || 0).toFixed(2),
        Number(tx.runningBalance || 0).toFixed(2),
        tx.isReversed ? (isAr ? 'معكوس / ملغي' : 'Reversed') : (isAr ? 'معتمد' : 'Posted')
      ]),
      [
        '—',
        toDate || '—',
        '—',
        '—',
        '—',
        isAr ? 'الإجمالي والختامي' : 'Totals & Closing',
        '—',
        '—',
        '—',
        totalDebit.toFixed(2),
        totalCredit.toFixed(2),
        closingBalance.toFixed(2),
        '—'
      ]
    ];

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `statement_${partyType}_${selectedParty.code || selectedParty.id}_${fromDate || 'all'}_${toDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTriggerRefresh = async () => {
    setIsRefreshing(true);
    triggerDatabaseRefresh('party_statements', 'finance');
  };

  return (
    <div className={`space-y-5 font-sans ${isAr ? 'text-right' : 'text-left'}`}>
      {/* Top Partner Selector & Controls Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-4">
        {/* Partner Type Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setPartyType('supplier')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                partyType === 'supplier'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>{isAr ? 'الموردين' : 'Suppliers'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${partyType === 'supplier' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {suppliersList.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPartyType('client')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                partyType === 'client'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>{isAr ? 'العملاء' : 'Clients'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${partyType === 'client' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {clientsList.length}
              </span>
            </button>
          </div>

          <div className="text-xs font-bold text-slate-500">
            {partyType === 'supplier' ? (isAr ? 'كشوف حسابات الموردين' : 'Suppliers Sub-Ledger') : (isAr ? 'كشوف حسابات العملاء' : 'Clients Sub-Ledger')}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <div className="md:col-span-2">
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              {partyType === 'supplier'
                ? (isAr ? 'اختر المورد لإنشاء كشف الحساب:' : 'Select Supplier for Statement:')
                : (isAr ? 'اختر العميل لإنشاء كشف الحساب:' : 'Select Client for Statement:')}
            </label>
            <SearchableSelect
              options={partySelectOptions}
              value={selectedPartyId}
              onChange={(val) => setSelectedPartyId(val)}
              placeholder={
                partyType === 'supplier'
                  ? (isAr ? '-- ابحث بالاسم أو الكود أو الرقم الضريبي --' : '-- Search by name, code or tax ID --')
                  : (isAr ? '-- ابحث بالاسم أو الكود --' : '-- Search client name or code --')
              }
              isAr={isAr}
              className="w-full"
            />
          </div>

          {/* Quick Stats or Status */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'إجمالي الحركات المسجلة:' : 'Total Recorded Txs:'}
            </span>
            <span className="font-mono font-black text-slate-900 text-sm">
              {selectedPartyId ? rawPartnerTransactions.length : 0}
            </span>
          </div>
        </div>

        {/* Selected Party Profile Details Card */}
        {selectedParty && (
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-4 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/20 text-white font-mono">
                  {selectedParty.code || selectedParty.id}
                </span>
                <h3 className="text-base font-black">
                  {selectedParty.name || selectedParty.tradeName || selectedParty.id}
                </h3>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 font-medium">
                {(selectedParty.taxNumber || selectedParty.vatNumber || selectedParty.taxCardNumber) && (
                  <span>
                    {isAr ? 'ب.ض:' : 'Tax ID:'} <strong className="font-mono text-white">{selectedParty.taxNumber || selectedParty.vatNumber || selectedParty.taxCardNumber}</strong>
                  </span>
                )}
                {selectedParty.phone && (
                  <span>{isAr ? 'هاتف:' : 'Phone:'} <strong className="font-mono text-white">{selectedParty.phone}</strong></span>
                )}
                {selectedParty.address && (
                  <span className="truncate max-w-xs">{selectedParty.address}</span>
                )}
              </div>
            </div>

            {/* Current Position Summary Pill */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 text-end">
              <span className="text-[10px] text-slate-300 block font-medium">
                {partyType === 'supplier'
                  ? (isAr ? 'الرصيد المستحق الحالي للمورد' : 'Current Net Payable')
                  : (isAr ? 'الرصيد المستحق الحالي على العميل' : 'Current Net Receivable')}
              </span>
              <div className="text-lg font-black font-mono text-amber-300">
                {closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Comprehensive Filter Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
            <h4 className="font-black text-xs sm:text-sm text-slate-900">
              {isAr ? 'شريط الفلاتر الشامل وتحديد الفترات' : 'Comprehensive Filter & Period Assignment Bar'}
            </h4>
          </div>

          {/* Reversed / Void Transactions Toggle Switch */}
          <button
            type="button"
            onClick={() => setShowReversed(!showReversed)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
              showReversed
                ? 'bg-rose-50 border-rose-300 text-rose-800 ring-2 ring-rose-400/30'
                : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${
              showReversed ? 'bg-rose-600 text-white' : 'bg-slate-300 text-slate-600'
            }`}>
              {showReversed ? '✓' : ''}
            </div>
            <span>
              {isAr ? 'إظهار العمليات المعكوسة والملغاة' : 'Show Reversed / Cancelled Txs'}
            </span>
            {reversedCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                showReversed ? 'bg-rose-200 text-rose-900' : 'bg-slate-200 text-slate-700'
              }`}>
                {reversedCount}
              </span>
            )}
          </button>
        </div>

        {/* Period Presets Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-bold shrink-0 text-[11px]">{isAr ? 'الفترة:' : 'Period:'}</span>
          {[
            { id: 'today', labelAr: 'اليوم', labelEn: 'Today' },
            { id: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
            { id: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
            { id: 'last_month', labelAr: 'الشهر الماضي', labelEn: 'Last Month' },
            { id: 'this_quarter', labelAr: 'الربع الحالي', labelEn: 'This Quarter' },
            { id: 'this_year', labelAr: 'السنة المالية', labelEn: 'Fiscal Year' },
            { id: 'all', labelAr: 'كامل المدة', labelEn: 'All Time' },
            { id: 'custom', labelAr: 'مخصص', labelEn: 'Custom' }
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePeriodPresetChange(preset.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer shrink-0 border ${
                periodPreset === preset.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {isAr ? preset.labelAr : preset.labelEn}
            </button>
          ))}
        </div>

        {/* Filter Inputs Grid: Dates, Doc Types, Tax, Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* From Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'من تاريخ:' : 'From Date:'}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'إلى تاريخ:' : 'To Date:'}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
            />
          </div>

          {/* Document Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'نوع المستند:' : 'Doc Type:'}
            </label>
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
            >
              <option value="all">{isAr ? 'جميع المستندات (الكل)' : 'All Documents'}</option>
              {partyType === 'supplier' && (
                <option value="grn">{isAr ? 'أذون استلام وفواتير بضاعة (GRN)' : 'Goods Receipts (GRN)'}</option>
              )}
              <option value="disbursement">{isAr ? 'سندات صرف وسداد نقدي' : 'Cash Disbursements'}</option>
              <option value="collection">{isAr ? 'سندات تحصيل وقبض' : 'Cash Receipts / Collections'}</option>
              <option value="journal">{isAr ? 'قيود يومية وتسويات' : 'Journal Entries'}</option>
            </select>
          </div>

          {/* Tax Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'التصنيف الضريبي للمستند:' : 'Tax Classification:'}
            </label>
            <select
              value={taxFilter}
              onChange={(e) => setTaxFilter(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
            >
              <option value="all">{isAr ? 'الكل (جميع الحركات والمستندات)' : 'All (All Transactions)'}</option>
              <option value="tax_all">{isAr ? 'كافة المستندات الضريبية (فواتير وإشعارات)' : 'All Taxable (Invoices, CN, DN)'}</option>
              <option value="invoices">{isAr ? 'فواتير ضريبية رسمية فقط' : 'Tax Invoices Only'}</option>
              <option value="credit_notes">{isAr ? 'إشعارات دائنة / خصم فقط (Credit Notes)' : 'Credit Notes Only (CN)'}</option>
              <option value="debit_notes">{isAr ? 'إشعارات مدينة / إضافة فقط (Debit Notes)' : 'Debit Notes Only (DN)'}</option>
              <option value="non_tax">{isAr ? 'مستندات وإيصالات داخلية غير ضريبية' : 'Internal / Non-Tax Only'}</option>
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              {isAr ? 'بحث في البيان أو الرقم:' : 'Search Text / No:'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'رقم المستند، البيان...' : 'Doc no, notes...'}
                className="w-full p-2 ps-7 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute start-2 top-2.5" />
            </div>
          </div>
        </div>

        {/* Action Buttons Bar: Print & Export */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? 'عرض' : 'Showing'}{' '}
            <strong className="font-mono text-slate-900">{periodTransactions.length}</strong>{' '}
            {isAr ? 'حركة خلال الفترة المحددة' : 'transactions in current period'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!selectedParty || periodTransactions.length === 0}
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>{isAr ? 'تصدير إكسل (CSV)' : 'Export CSV'}</span>
            </button>

            <button
              type="button"
              disabled={!selectedParty}
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md hover:shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer className="h-4 w-4" />
              <span>{isAr ? 'طباعة كشف الحساب A4' : 'Print Statement (A4)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Financial KPI Cards */}
      {selectedParty && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Opening Balance */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? 'الرصيد الافتتاحي (قبل الفترة)' : 'Opening Balance'}
            </span>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900">
              {openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span className="text-xs text-slate-400 ms-1 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono block">
              {fromDate ? `حتى ${fromDate}` : 'بداية التعامل'}
            </span>
          </div>

          {/* Card 2: Period Debits */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>{isAr ? 'إجمالي المدين (حركة الفترة)' : 'Period Debits'}</span>
            </span>
            <div className="text-base sm:text-lg font-black font-mono text-rose-700">
              {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span className="text-xs text-rose-400 ms-1 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-sans block">
              {partyType === 'supplier' ? (isAr ? 'سدادات ومردودات' : 'Payments & Returns') : (isAr ? 'فواتير ومبيعات' : 'Invoices & Sales')}
            </span>
          </div>

          {/* Card 3: Period Credits */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
              <ArrowDownLeft className="h-3.5 w-3.5" />
              <span>{isAr ? 'إجمالي الدائن (حركة الفترة)' : 'Period Credits'}</span>
            </span>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-700">
              {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span className="text-xs text-emerald-400 ms-1 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-sans block">
              {partyType === 'supplier' ? (isAr ? 'استلامات ومشتريات' : 'Receipts & Purchases') : (isAr ? 'تحصيلات ودفعات' : 'Receipts & Deposits')}
            </span>
          </div>

          {/* Card 4: Net Movement */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
              <Scale className="h-3.5 w-3.5" />
              <span>{isAr ? 'صافي حركة الفترة' : 'Net Period Movement'}</span>
            </span>
            <div className="text-base sm:text-lg font-black font-mono text-indigo-900">
              {partyType === 'supplier'
                ? (totalCredit - totalDebit).toLocaleString(undefined, { minimumFractionDigits: 2 })
                : (totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span className="text-xs text-indigo-400 ms-1 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-sans block">
              {isAr ? 'التغير في الرصيد' : 'Delta in balance'}
            </span>
          </div>

          {/* Card 5: Closing Balance */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-4 shadow-md space-y-1 col-span-2 lg:col-span-1">
            <span className="text-[11px] font-extrabold text-indigo-200 block">
              {isAr ? 'الرصيد الختامي المستحق' : 'Closing Balance'}
            </span>
            <div className="text-base sm:text-xl font-black font-mono text-amber-300">
              {closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span className="text-xs text-amber-200/70 ms-1 font-sans">{isAr ? 'ج.م' : 'EGP'}</span>
            </div>
            <span className="text-[10px] text-indigo-200 truncate block">
              {tafqeetArabic(Math.abs(closingBalance), 'EGP')}
            </span>
          </div>
        </div>
      )}

      {/* Taxable Documents Audit & Fiscal Summary Ribbon */}
      {selectedParty && taxStats.totalTaxDocsCount > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-3.5 border border-indigo-900/50 shadow-md flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-black text-white block">
                {isAr ? 'ملخص المستندات الضريبية المعتمدة خلال الفترة' : 'Official Tax Documents Period Audit'}
              </span>
              <span className="text-[10px] text-indigo-200/80 font-medium">
                {isAr
                  ? `إجمالي المستندات الضريبية: ${taxStats.totalTaxDocsCount} مستند ضريبي قانوني مسجل ومطابق`
                  : `Total Taxable Documents: ${taxStats.totalTaxDocsCount} fiscal records matched`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Invoices Badge */}
            <div className="bg-slate-800/80 border border-indigo-500/30 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              <span className="text-slate-300 text-[11px]">{isAr ? 'فواتير ضريبية:' : 'Invoices:'}</span>
              <span className="font-mono font-bold text-white text-xs">{taxStats.invoicesCount}</span>
              <span className="text-indigo-300 font-mono text-[11px] font-bold">
                ({taxStats.invoicesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'})
              </span>
            </div>

            {/* Credit Notes Badge */}
            <div className="bg-slate-800/80 border border-emerald-500/30 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-slate-300 text-[11px]">{isAr ? 'إشعارات دائنة (خصم):' : 'Credit Notes:'}</span>
              <span className="font-mono font-bold text-emerald-300 text-xs">{taxStats.creditNotesCount}</span>
              <span className="text-emerald-400 font-mono text-[11px] font-bold">
                ({taxStats.creditNotesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'})
              </span>
            </div>

            {/* Debit Notes Badge */}
            <div className="bg-slate-800/80 border border-amber-500/30 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-slate-300 text-[11px]">{isAr ? 'إشعارات مدينة (إضافة):' : 'Debit Notes:'}</span>
              <span className="font-mono font-bold text-amber-300 text-xs">{taxStats.debitNotesCount}</span>
              <span className="text-amber-400 font-mono text-[11px] font-bold">
                ({taxStats.debitNotesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {isAr ? 'ج.م' : 'EGP'})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Main Statement Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {!selectedParty ? (
          <div className="py-16 px-4 text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
              <FileText className="h-8 w-8" />
            </div>
            <h4 className="text-base font-black text-slate-800">
              {isAr ? 'يرجى اختيار المورد أو العميل لعرض كشف الحساب' : 'Please select a partner above to generate statement'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {isAr
                ? 'استخدم قائمة البحث السريع في الأعلى لاختيار المورد أو العميل واستخراج جدول الحركات التفصيلية والرصيد التراكمي.'
                : 'Use the searchable dropdown above to select a partner and view chronological double-entry records.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-bold text-[11px]">
                  <th className="py-3 px-2.5 text-center w-10">#</th>
                  <th className="py-3 px-2.5 text-start w-24">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="py-3 px-2.5 text-start min-w-[200px]">{isAr ? 'المستند الضريبي (فاتورة / إشعار دائن أو مدين)' : 'Taxable Doc (Inv / CN / DN)'}</th>
                  <th className="py-3 px-2.5 text-start w-28">{isAr ? 'نوع الحركة الداخلي' : 'Internal Type'}</th>
                  <th className="py-3 px-2.5 text-start w-28">{isAr ? 'رقم الإذن / المرجع' : 'Internal Ref'}</th>
                  <th className="py-3 px-2.5 text-start min-w-[200px]">{isAr ? 'البيان والشرح' : 'Description'}</th>
                  <th className="py-3 px-2.5 text-end w-24">{isAr ? 'مدين (ج.م)' : 'Debit'}</th>
                  <th className="py-3 px-2.5 text-end w-24">{isAr ? 'دائن (ج.م)' : 'Credit'}</th>
                  <th className="py-3 px-2.5 text-end w-28">{isAr ? 'الرصيد التراكمي' : 'Running Bal'}</th>
                  <th className="py-3 px-2.5 text-center w-24">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Opening Balance Row */}
                <tr className="bg-indigo-50/70 font-extrabold text-slate-900">
                  <td className="py-2.5 px-2.5 text-center font-mono">0</td>
                  <td className="py-2.5 px-2.5 font-mono">{fromDate || '—'}</td>
                  <td className="py-2.5 px-2.5 text-indigo-950 font-bold" colSpan={4}>
                    {isAr ? 'الرصيد الافتتاحي السابق للفترة' : 'Opening Balance Prior to Selected Period'}
                  </td>
                  <td className="py-2.5 px-2.5 text-end font-mono">—</td>
                  <td className="py-2.5 px-2.5 text-end font-mono">—</td>
                  <td className="py-2.5 px-2.5 text-end font-mono font-black text-indigo-950 text-xs">
                    {openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-2.5 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                      {isAr ? 'افتتاحي' : 'Opening'}
                    </span>
                  </td>
                </tr>

                {/* Period Transactions */}
                {periodTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد حركات مسجلة تطابق الفلاتر المحددة' : 'No transactions matching the active filters'}
                    </td>
                  </tr>
                ) : (
                  periodTransactions.map((tx, idx) => {
                    const isRev = tx.isReversed;
                    return (
                      <tr
                        key={tx.id || idx}
                        className={`transition ${
                          isRev
                            ? 'bg-rose-50/40 text-slate-400 hover:bg-rose-50/60'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-slate-50/80'
                            : 'bg-slate-50/40 hover:bg-slate-50/90'
                        }`}
                      >
                        <td className="py-2.5 px-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap">{tx.date}</td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          {tx.taxDocNumber ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  tx.taxDocType === 'credit_note'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : tx.taxDocType === 'debit_note'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-300'
                                }`}>
                                  {tx.taxDocType === 'credit_note' ? (
                                    <>
                                      <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                                      <span>{isAr ? 'إشعار دائن (خصم)' : 'Credit Note'}</span>
                                    </>
                                  ) : tx.taxDocType === 'debit_note' ? (
                                    <>
                                      <ArrowUpRight className="h-3 w-3 text-amber-600" />
                                      <span>{isAr ? 'إشعار مدين (إضافة)' : 'Debit Note'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <FileText className="h-3 w-3 text-indigo-600" />
                                      <span>{isAr ? 'فاتورة ضريبية' : 'Tax Invoice'}</span>
                                    </>
                                  )}
                                </span>

                                {tx.etaPortalRegistered && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold" title={isAr ? 'موثقة ومسجلة بمنظومة الفاتورة الإلكترونية ETA' : 'Verified on ETA'}>
                                    ✓ ETA
                                  </span>
                                )}
                              </div>
                              <div className="font-mono font-black text-xs text-slate-900 tracking-tight">
                                #{tx.taxDocNumber}
                              </div>
                              {tx.taxDocDate && tx.taxDocDate !== tx.date && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {isAr ? 'تاريخ المستند:' : 'Doc Date:'} {tx.taxDocDate}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                              {isAr ? 'مستند داخلي غير ضريبي' : 'Internal Movement'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 font-bold whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.sourceDocType === 'grn'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : tx.sourceDocType === 'disbursement'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : tx.sourceDocType === 'collection'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          }`}>
                            {tx.typeLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                          <div className="font-bold text-slate-900 text-[11px]">{tx.docNo}</div>
                          {tx.reference && tx.reference !== '—' && tx.reference !== tx.docNo && (
                            <div className="text-[10px] text-slate-400">{tx.reference}</div>
                          )}
                        </td>
                        <td className={`py-2.5 px-2.5 text-slate-800 break-words ${isRev ? 'line-through text-slate-400' : ''}`}>
                          <div className="leading-relaxed whitespace-pre-wrap">{tx.description}</div>
                        </td>
                        <td className={`py-2.5 px-2.5 text-end font-mono ${isRev ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {Number(tx.debit) > 0 ? Number(tx.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className={`py-2.5 px-2.5 text-end font-mono ${isRev ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {Number(tx.credit) > 0 ? Number(tx.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className={`py-2.5 px-2.5 text-end font-mono font-bold text-xs ${
                          isRev
                            ? 'text-slate-400'
                            : tx.runningBalance >= 0
                            ? 'text-slate-900'
                            : 'text-rose-700'
                        }`}>
                          {Number(tx.runningBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          {isRev ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={tx.reversalReason || ''}>
                              <X className="h-3 w-3" />
                              <span>{isAr ? 'معكوس / ملغي' : 'Reversed'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{isAr ? 'معتمد' : 'Posted'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Closing Summary Row */}
                <tr className="bg-slate-900 text-white font-extrabold text-xs">
                  <td colSpan={6} className="py-3 px-2.5 text-start">
                    <span>{isAr ? 'إجمالي حركة الفترة والرصيد الختامي:' : 'Total Period Movement & Closing Balance:'}</span>
                  </td>
                  <td className="py-3 px-2.5 text-end font-mono">
                    {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2.5 text-end font-mono">
                    {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2.5 text-end font-mono font-black text-amber-300 text-sm">
                    {closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2.5 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300">
                      {isAr ? 'ختامي' : 'Closing'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Printable Slip Portal Modal */}
      {isPrintModalOpen && selectedParty && (
        <PartnerStatementPrintSlip
          partyType={partyType}
          party={selectedParty}
          fromDate={fromDate}
          toDate={toDate}
          openingBalance={openingBalance}
          transactions={periodTransactions}
          closingBalance={closingBalance}
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          showReversed={showReversed}
          currentUser={currentUser}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </div>
  );
}
