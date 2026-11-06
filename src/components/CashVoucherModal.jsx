import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  PlusCircle,
  Coins,
  Receipt,
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  Trash2,
  Building2,
  Users,
  ShieldCheck,
  Wand2,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  CheckSquare,
  Square,
  Calendar,
  Layers
} from 'lucide-react';
import { collection, doc, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  EGP_DENOMINATIONS,
  CASH_TRANSACTION_TYPES,
  MAIN_GL_ACCOUNTS,
  SAFE_THEMES,
  calculateBanknoteTotal,
  validateBanknoteMatch,
  checkSufficientBanknotes,
  postCashVoucher,
  saveChartAccount,
  resolveAccountMasterRole,
  normalizeAccountAttributes
} from '../utils/cashLedgerEngine.js';
import SearchableSelect from './SearchableSelect.jsx';
import { tafqeetArabic } from '../utils/tafqeet.js';
import { fileToDataUrl } from '../firebase.js';

export default function CashVoucherModal({
  safe,
  allSafes = [],
  suppliersList = [],
  workersList = [],
  clientsList = [],
  accountingLinks: propAccountingLinks = null,
  accountsMaster: propAccountsMaster = [],
  currentUser,
  isOpen,
  initialType = 'disbursement',
  onClose,
  onSuccess
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // 1. Strict Directional Lock
  const lockedDirection = initialType === 'collection' ? 'in' : 'out';
  const isOutflow = lockedDirection === 'out';
  const isInflow = lockedDirection === 'in';

  // Available types strictly filtered by direction (excluding custodies, advances & inter-safe transfers which are handled in dedicated workflows)
  const availableTypes = useMemo(() => {
    return CASH_TRANSACTION_TYPES.filter(
      (t) =>
        t.direction === lockedDirection &&
        !['custody_issue', 'custody_settle', 'salary_advance', 'advance_settle', 'change_exchange', 'balance_adjustment', 'safe_transfer'].includes(t.id)
    );
  }, [lockedDirection]);

  const [voucherType, setVoucherType] = useState(() => {
    if (initialType === 'collection') return 'collection';
    return 'disbursement';
  });

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [showCurrencyDetails, setShowCurrencyDetails] = useState(false);

  // Banknotes breakdown state
  const [denominations, setDenominations] = useState(() => {
    const init = {};
    EGP_DENOMINATIONS.forEach((d) => (init[d] = 0));
    return init;
  });

  // Subscribe to accounting links if not passed via props
  const [internalAccountingLinks, setInternalAccountingLinks] = useState(null);
  useEffect(() => {
    if (propAccountingLinks) return;
    const unsub = onSnapshot(doc(db, 'system_config', 'accounting_links'), (snap) => {
      if (snap.exists()) setInternalAccountingLinks(snap.data());
    });
    return () => unsub();
  }, [propAccountingLinks]);

  const accountingLinks = propAccountingLinks || internalAccountingLinks || null;

  // Real-time synchronization of chart_of_accounts collection if not provided as prop
  const [customAccounts, setCustomAccounts] = useState(propAccountsMaster || []);
  useEffect(() => {
    if (propAccountsMaster && propAccountsMaster.length > 0) {
      setCustomAccounts(propAccountsMaster);
      return;
    }
    const unsub = onSnapshot(collection(db, 'chart_of_accounts'), (snap) => {
      const list = snap.docs.map((d) => normalizeAccountAttributes({ id: d.id, ...d.data() }));
      setCustomAccounts(list);
    });
    return () => unsub();
  }, [propAccountsMaster]);

  const accountsMaster = (propAccountsMaster && propAccountsMaster.length > 0) ? propAccountsMaster : customAccounts;

  const defaultSupplierAccount = useMemo(() => {
    return accountingLinks?.suppliersAccount?.primaryCode || accountingLinks?.suppliersAccount?.code || '2020101';
  }, [accountingLinks]);

  const defaultClientAccount = useMemo(() => {
    return accountingLinks?.clientsAccount?.primaryCode || accountingLinks?.clientsAccount?.code || '1020301';
  }, [accountingLinks]);

  // Two-Tier Accounting state
  const [mainAccount, setMainAccount] = useState(() => (isOutflow ? '2020101' : '1020301'));
  const [subAccountId, setSubAccountId] = useState('');
  const [subAccountName, setSubAccountName] = useState('');
  const [targetSafeId, setTargetSafeId] = useState('');

  // Salaries specific state
  const [payrollPeriod, setPayrollPeriod] = useState(() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });

  // Clients specific state
  const [clientReference, setClientReference] = useState('');

  // Supplier invoices allocation state
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState({});
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Tax classification state
  const [taxDocumentType, setTaxDocumentType] = useState('no_document');
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('');
  const [vendorTaxId, setVendorTaxId] = useState('');
  const [vatRate, setVatRate] = useState(14);
  const [withholdingRate, setWithholdingRate] = useState(1);

  // Notes & Attachments state
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // Approval option
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Form handling state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sync when initialType changes or default accounts resolve
  useEffect(() => {
    if (initialType === 'collection') {
      setVoucherType('collection');
      setMainAccount(defaultClientAccount);
    } else {
      setVoucherType('disbursement');
      setMainAccount(defaultSupplierAccount);
    }
  }, [initialType, defaultClientAccount, defaultSupplierAccount]);

  // Handle target safe default for safe transfers and default GL to internal_transfer
  useEffect(() => {
    if (voucherType === 'safe_transfer') {
      setMainAccount('internal_transfer');
      const otherSafe = allSafes.find((s) => s.id !== safe?.id);
      if (otherSafe) setTargetSafeId(otherSafe.id);
    }
  }, [voucherType, allSafes, safe]);

  // Derive account role dynamically
  const accountRole = useMemo(() => {
    if (voucherType === 'safe_transfer') return 'safe';
    return resolveAccountMasterRole(mainAccount, accountsMaster, accountingLinks);
  }, [voucherType, mainAccount, accountsMaster, accountingLinks]);

  // Dynamic Chart of Accounts & Quick Add Account State
  const [quickAccountModal, setQuickAccountModal] = useState({
    isOpen: false,
    isSub: false,
    parentAccountId: '',
    parentAccountName: '',
    code: '',
    nameAr: '',
    nameEn: '',
    subType: 'cost_center'
  });

  // Parent account codes detection (to separate summary headers from posting accounts)
  const parentCodeSet = useMemo(() => {
    const set = new Set();
    accountsMaster.forEach((acc) => {
      if (acc.parentCode) set.add(String(acc.parentCode).trim());
      if (acc.parentAccountId) set.add(String(acc.parentAccountId).trim());
    });
    return set;
  }, [accountsMaster]);

  // Main GL Account Options (Dynamically built from Chart of Accounts)
  const mainAccountOptions = useMemo(() => {
    if (!accountsMaster || accountsMaster.length === 0) {
      return MAIN_GL_ACCOUNTS.map((acc) => ({
        value: acc.id,
        label: isAr ? acc.nameAr : (acc.nameEn || acc.nameAr),
        sublabel: acc.id,
        group: isAr ? 'الحسابات القياسية' : 'Standard Accounts'
      }));
    }

    const selectable = accountsMaster.filter((acc) => {
      if (acc.isActive === false) return false;
      const code = String(acc.code || acc.id).trim();
      const isParent = parentCodeSet.has(code);
      const role = resolveAccountMasterRole(code, accountsMaster, accountingLinks);
      return !isParent || Boolean(role);
    });

    const sorted = [...selectable].sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));

    return sorted.map((acc) => {
      const code = String(acc.code || acc.id).trim();
      const role = resolveAccountMasterRole(code, accountsMaster, accountingLinks);
      let group = isAr ? 'دليل الحسابات' : 'Chart of Accounts';

      if (role === 'supplier') {
        group = isAr ? 'حسابات الموردين (مشتريات)' : 'Suppliers & Purchases';
      } else if (role === 'client') {
        group = isAr ? 'حسابات العملاء (مبيعات)' : 'Clients & Sales';
      } else if (role === 'worker') {
        group = isAr ? 'حسابات الأجور والعاملين' : 'Payroll & Staff';
      } else if (acc.statement === 'income_statement' || ['3', '4', '5'].includes(code.charAt(0))) {
        group = isAr ? 'المصروفات والتكاليف' : 'Expenses & Operations';
      } else if (['1'].includes(code.charAt(0))) {
        group = isAr ? 'الأصول النقدية والمتداولة' : 'Assets & Current Accounts';
      } else if (['2'].includes(code.charAt(0))) {
        group = isAr ? 'الالتزامات والخصوم' : 'Liabilities & Payables';
      }

      return {
        value: code,
        label: `[${code}] ${isAr ? acc.nameAr : (acc.nameEn || acc.nameAr)}`,
        sublabel: code,
        group
      };
    });
  }, [accountsMaster, parentCodeSet, accountingLinks, isAr]);

  // Sub-Ledger / Beneficiary Options dynamically resolved by accountRole
  const subAccountOptions = useMemo(() => {
    if (accountRole === 'supplier') {
      const fromSuppliers = suppliersList.map((s) => ({
        value: s.id,
        label: s.name || s.taxpayerLegalName || s.id,
        sublabel: s.id,
        badgeText: isAr ? 'مورد معتمد' : 'Vendor',
        isLinked: true
      }));
      const fromCOA = accountsMaster
        .filter((a) => a.subType === 'supplier' && !suppliersList.some((s) => s.id === a.id || s.id === a.code) && String(a.code || a.id) !== String(mainAccount))
        .map((a) => ({
          value: a.code || a.id,
          label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
          sublabel: a.code || a.id,
          badgeText: isAr ? 'دليل الحسابات' : 'COA'
        }));
      return [...fromSuppliers, ...fromCOA];
    }

    if (accountRole === 'worker') {
      const fromWorkers = workersList.map((w) => ({
        value: w.id,
        label: isAr ? (w.nameAr || w.name) : (w.name || w.nameAr),
        sublabel: w.role || (isAr ? 'موظف' : 'Staff'),
        badgeText: isAr ? 'موظف' : 'Staff'
      }));
      const fromCOA = accountsMaster
        .filter((a) => a.subType === 'worker' && !workersList.some((w) => w.id === a.id || w.id === a.code) && String(a.code || a.id) !== String(mainAccount))
        .map((a) => ({
          value: a.code || a.id,
          label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
          sublabel: a.code || a.id,
          badgeText: isAr ? 'دليل الحسابات' : 'COA'
        }));
      return [...fromWorkers, ...fromCOA];
    }

    if (accountRole === 'client') {
      const fromClients = clientsList.map((c) => ({
        value: c.id,
        label: isAr ? (c.tradeName || c.clientName || c.name || c.id) : (c.clientName || c.tradeName || c.name || c.id),
        sublabel: c.id,
        badgeText: isAr ? 'عميل معتمد' : 'Client',
        isLinked: true
      }));
      const fromCOA = accountsMaster
        .filter((a) => (a.subType === 'client' || a.parentAccountId === 'clients') && !clientsList.some((c) => c.id === a.id || c.id === a.code) && String(a.code || a.id) !== String(mainAccount))
        .map((a) => ({
          value: a.code || a.id,
          label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
          sublabel: a.code || a.id,
          badgeText: isAr ? 'عميل' : 'Client'
        }));
      return [...fromClients, ...fromCOA];
    }

    if (voucherType === 'safe_transfer' || accountRole === 'safe') {
      return allSafes
        .filter((s) => s.id !== safe?.id)
        .map((s) => ({
          value: s.id,
          label: isAr ? s.nameAr : (s.nameEn || s.nameAr),
          sublabel: s.id,
          badgeText: isAr ? 'خزينة' : 'Vault'
        }));
    }

    return accountsMaster
      .filter((a) => (a.parentAccountId === mainAccount || a.parentCode === mainAccount) && String(a.code || a.id) !== String(mainAccount))
      .map((a) => ({
        value: a.code || a.id,
        label: isAr ? a.nameAr : (a.nameEn || a.nameAr),
        sublabel: a.code || a.id,
        badgeText: isAr ? 'مركز تكلفة' : 'Cost Center'
      }));
  }, [accountRole, mainAccount, voucherType, suppliersList, workersList, clientsList, accountsMaster, allSafes, safe, isAr]);

  const handleOpenCreateMainAccount = (searchQuery = '') => {
    const nextSeq = accountsMaster.filter((a) => a.type === 'main').length + 5200;
    setQuickAccountModal({
      isOpen: true,
      isSub: false,
      parentAccountId: '',
      parentAccountName: '',
      code: String(nextSeq),
      nameAr: searchQuery || '',
      nameEn: '',
      subType: 'cost_center'
    });
  };

  const handleOpenCreateSubAccount = (searchQuery = '') => {
    let resolvedSubType = 'cost_center';
    if (accountRole === 'supplier') resolvedSubType = 'supplier';
    else if (accountRole === 'client') resolvedSubType = 'client';
    else if (accountRole === 'worker') resolvedSubType = 'worker';

    const parent = mainAccountOptions.find((o) => o.value === mainAccount);
    const parentCode = parent?.sublabel || mainAccount;
    const parentName = parent?.label || mainAccount;
    const subCount = accountsMaster.filter((a) => a.parentAccountId === mainAccount || a.parentCode === parentCode).length + 1;
    const code = `${parentCode}-${String(subCount).padStart(2, '0')}`;

    setQuickAccountModal({
      isOpen: true,
      isSub: true,
      parentAccountId: mainAccount,
      parentAccountName: parentName,
      code,
      nameAr: searchQuery || '',
      nameEn: '',
      subType: resolvedSubType
    });
  };

  const handleSaveQuickAccount = async (e) => {
    e.preventDefault();
    if (!quickAccountModal.nameAr.trim() || !quickAccountModal.code.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال كود واسم الحساب' : 'Please provide account code and name');
      return;
    }

    try {
      await saveChartAccount({
        id: quickAccountModal.code.trim(),
        code: quickAccountModal.code.trim(),
        nameAr: quickAccountModal.nameAr.trim(),
        nameEn: quickAccountModal.nameEn.trim() || quickAccountModal.nameAr.trim(),
        type: quickAccountModal.isSub ? 'sub' : 'main',
        subType: quickAccountModal.subType || 'cost_center',
        parentAccountId: quickAccountModal.isSub ? quickAccountModal.parentAccountId : '',
        parentCode: quickAccountModal.isSub ? quickAccountModal.parentAccountId : '',
        isActive: true
      });

      if (quickAccountModal.isSub) {
        setSubAccountId(quickAccountModal.code.trim());
        setSubAccountName(quickAccountModal.nameAr.trim());
      } else {
        setMainAccount(quickAccountModal.code.trim());
        setSubAccountId('');
        setSubAccountName('');
      }

      setQuickAccountModal({
        isOpen: false,
        isSub: false,
        parentAccountId: '',
        parentAccountName: '',
        code: '',
        nameAr: '',
        nameEn: '',
        subType: 'cost_center'
      });
    } catch (err) {
      setErrorMsg(err.message || 'Error saving account');
    }
  };

  // Load Open POs & GRNs when a supplier is selected
  useEffect(() => {
    if (accountRole !== 'supplier' || !subAccountId) {
      setSupplierInvoices([]);
      setSelectedInvoices({});
      return;
    }

    let isMounted = true;
    setLoadingInvoices(true);

    const fetchSupplierDocs = async () => {
      try {
        const poQuery = query(
          collection(db, 'purchase_orders'),
          where('supplierId', '==', subAccountId)
        );
        const grnQuery = query(
          collection(db, 'goods_receipts'),
          where('supplierId', '==', subAccountId)
        );

        const [poSnap, grnSnap] = await Promise.all([getDocs(poQuery), getDocs(grnQuery)]);
        const docsList = [];

        poSnap.forEach((doc) => {
          const d = doc.data();
          if (d.status !== 'cancelled' && (Number(d.totalAmount) || Number(d.finalTotal) || 0) > 0) {
            docsList.push({
              id: doc.id,
              type: 'PO',
              docNumber: d.poNumber || doc.id,
              date: d.createdAt?.slice(0, 10) || d.date || '',
              total: Number(d.totalAmount) || Number(d.finalTotal) || 0,
              notes: d.notes || d.description || ''
            });
          }
        });

        grnSnap.forEach((doc) => {
          const d = doc.data();
          if (d.status !== 'cancelled') {
            docsList.push({
              id: doc.id,
              type: 'GRN',
              docNumber: d.grnNumber || doc.id,
              date: d.createdAt?.slice(0, 10) || d.receivedDate || '',
              total: Number(d.totalAmount) || Number(d.finalAmount) || 0,
              invoiceNumber: d.supplierInvoiceNumber || d.invoiceNumber || '',
              notes: d.notes || ''
            });
          }
        });

        if (isMounted) {
          setSupplierInvoices(docsList);
        }
      } catch (err) {
        console.warn('Error fetching supplier documents:', err);
      } finally {
        if (isMounted) setLoadingInvoices(false);
      }
    };

    fetchSupplierDocs();

    return () => {
      isMounted = false;
    };
  }, [accountRole, subAccountId]);

  // Toggle invoice allocation
  const handleToggleInvoice = (inv) => {
    setSelectedInvoices((prev) => {
      const updated = { ...prev };
      if (updated[inv.id]) {
        delete updated[inv.id];
      } else {
        updated[inv.id] = inv.total || 0;
      }

      // Auto-sum amount from allocated invoices
      const sum = Object.values(updated).reduce((acc, v) => acc + (Number(v) || 0), 0);
      if (sum > 0) {
        setAmount(String(sum));
      }

      return updated;
    });
  };

  // Safe theme inheritance
  const safeTheme = SAFE_THEMES[safe?.color] || SAFE_THEMES.blue;
  const safeDisplayName = isAr ? safe?.nameAr : (safe?.nameEn || safe?.nameAr);

  // Compute live banknote total
  const countedBanknotesTotal = useMemo(() => {
    return calculateBanknoteTotal(denominations);
  }, [denominations]);

  const numAmount = Number(amount) || 0;
  const isBanknoteBalanced = currency !== 'EGP' || Math.abs(countedBanknotesTotal - numAmount) < 0.005;
  const banknoteDifference = numAmount - countedBanknotesTotal;

  // Sufficiency check for safe banknotes (both outflows and change-returns on inflows)
  const currentSafeWallet = safe?.balances?.[currency] || { currentBalance: 0, denominations: {} };
  const currentSafeBal = Number(currentSafeWallet.currentBalance) || 0;
  const currentSafeDenoms = currentSafeWallet.denominations || {};

  const sufficiency = useMemo(() => {
    if (currency !== 'EGP') return { isSufficient: true, shortages: [] };
    return checkSufficientBanknotes(currentSafeDenoms, denominations, isOutflow);
  }, [isOutflow, currency, currentSafeDenoms, denominations]);

  // Auto-fill optimal bills helper
  const handleAutoFillOptimalBanknotes = () => {
    if (numAmount <= 0) return;
    let remaining = numAmount;
    const optimal = {};
    EGP_DENOMINATIONS.forEach((d) => (optimal[d] = 0));

    // If outflow, respect available notes in safe
    for (const denom of EGP_DENOMINATIONS) {
      if (remaining < denom) continue;
      const neededNotes = Math.floor(remaining / denom);
      const availableNotes = isOutflow ? (Number(currentSafeDenoms[denom]) || 0) : Infinity;
      const countToTake = Math.min(neededNotes, availableNotes);

      if (countToTake > 0) {
        optimal[denom] = countToTake;
        remaining = Math.round((remaining - countToTake * denom) * 100) / 100;
      }
    }

    setDenominations(optimal);
    setErrorMsg('');
  };

  const handleDenomChange = (denom, val) => {
    if (val === '' || val === undefined) {
      setDenominations((prev) => ({ ...prev, [denom]: 0 }));
      setErrorMsg('');
      return;
    }
    if (val === '-' || val === '-0') {
      setDenominations((prev) => ({ ...prev, [denom]: '-' }));
      return;
    }
    const clean = String(val).replace(/[^0-9-]/g, '');
    const count = parseInt(clean, 10);
    setDenominations((prev) => ({ ...prev, [denom]: isNaN(count) ? 0 : count }));
    setErrorMsg('');
  };

  const handleToggleSign = (denom) => {
    setDenominations((prev) => {
      const current = Number(prev[denom]) || 0;
      if (current === 0) return { ...prev, [denom]: -1 };
      return { ...prev, [denom]: -current };
    });
    setErrorMsg('');
  };

  // Tax calculations
  const calculatedVat = useMemo(() => {
    if (taxDocumentType !== 'taxable' || !numAmount) return 0;
    return Math.round(((numAmount * vatRate) / (100 + vatRate)) * 100) / 100;
  }, [taxDocumentType, numAmount, vatRate]);

  const calculatedWht = useMemo(() => {
    if (taxDocumentType !== 'taxable' || !numAmount) return 0;
    const netBase = numAmount - calculatedVat;
    return Math.round(((netBase * withholdingRate) / 100) * 100) / 100;
  }, [taxDocumentType, numAmount, calculatedVat, withholdingRate]);

  // Attachment upload handler
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const fileData = await fileToDataUrl(file);
        if (fileData) uploaded.push(fileData);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'فشل تحميل الملف' : 'File upload failed'));
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setErrorMsg(isAr ? 'يرجى إدخال مبلغ مالي صحيح أكبر من الصفر' : 'Please enter a valid amount greater than zero');
      return;
    }

    if (currency === 'EGP' && !isBanknoteBalanced) {
      setErrorMsg(
        isAr
          ? `تفقيط الفئات الورقية غير متطابق مع إجمالي السند بفارق ${Math.abs(banknoteDifference).toLocaleString()} ج.م`
          : `Banknote count does not match total amount by ${Math.abs(banknoteDifference).toLocaleString()} EGP`
      );
      return;
    }

    if (isOutflow && currentSafeBal < numAmount) {
      setErrorMsg(
        isAr
          ? `رصيد الخزينة الحالي (${currentSafeBal.toLocaleString()} ج.م) لا يكفي لصرف مبلغ (${numAmount.toLocaleString()} ج.م)`
          : `Current safe balance (${currentSafeBal.toLocaleString()} EGP) is insufficient to disburse (${numAmount.toLocaleString()} EGP)`
      );
      return;
    }

    if (!sufficiency.isSufficient) {
      const detailStr = sufficiency.shortages
        .map((s) => `فئة ${s.denom} ج (${isOutflow ? 'المطلوب صرفها' : 'المطلوب ردها كفكة'}: ${s.requested}، المتوفر بالخزينة: ${s.available})`)
        .join('، ');
      setErrorMsg(
        isAr
          ? `الفئات الورقية المتوفرة بالخزينة لا تكفي: ${detailStr}`
          : `The banknotes available in safe are insufficient: ${detailStr}`
      );
      return;
    }

    // Verify child account selection if mainAccount has child accounts registered in COA
    const isParentAccount = parentCodeSet.has(String(mainAccount).trim());
    if (isParentAccount && !subAccountId && !['supplier', 'client', 'worker', 'safe'].includes(accountRole)) {
      setErrorMsg(
        isAr
          ? 'يرجى اختيار الحساب التحليلي الفرعي (Child Account) المندرج تحت هذا الحساب الرئيسي لضمان دقة التوجيه المحاسبي'
          : 'Please select a specific child account under this parent category to ensure posting precision'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const selectedAccountObj = accountsMaster.find((a) => String(a.code || a.id).trim() === String(mainAccount).trim()) || null;

      const cleanDenominations = Object.fromEntries(
        Object.entries(denominations).map(([k, v]) => [k, Number(v) || 0])
      );

      await postCashVoucher({
        safeId: safe.id,
        type: voucherType,
        amount: numAmount,
        currency,
        exchangeRate: Number(exchangeRate) || 1,
        denominations: cleanDenominations,
        mainAccount,
        mainAccountName: selectedAccountObj?.nameEn || selectedAccountObj?.nameAr || mainAccount,
        mainAccountNameAr: selectedAccountObj?.nameAr || mainAccount,
        accountsMaster,
        subAccountId,
        subAccountName: accountRole === 'worker' ? `${subAccountName} [${payrollPeriod}]` : subAccountName,
        supplierAllocation: accountRole === 'supplier' && subAccountId ? {
          supplierId: subAccountId,
          invoiceIds: Object.keys(selectedInvoices),
          allocatedAmounts: selectedInvoices
        } : null,
        taxDocumentType,
        taxDetails: taxDocumentType === 'taxable' ? {
          invoiceNumber: taxInvoiceNumber,
          vendorTaxId,
          vatRate: Number(vatRate) || 14,
          vatAmount: calculatedVat,
          withholdingRate: Number(withholdingRate) || 1,
          withholdingAmount: calculatedWht
        } : null,
        description: accountRole === 'client' && clientReference
          ? `${description ? description + ' | ' : ''}Ref: ${clientReference}`
          : description,
        attachments,
        currentUser,
        targetSafeId: voucherType === 'safe_transfer' ? targetSafeId : null,
        requiresApproval
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'حدث خطأ أثناء حفظ السند' : 'Error saving voucher'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !safe) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-auto max-h-[92vh] flex flex-col ${isAr ? 'text-right' : 'text-left'}`}>
        
        {/* Modal Header: Inheriting Safe Color Code with Distinct Direction Indicator */}
        <div className={`${safeTheme.heroGradient} px-6 py-4 text-white flex items-center justify-between shrink-0 shadow-md border-b border-white/10`}>
          <div className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-sm shadow-md ${safeTheme.safeBadge}`}>
              {safe.id.slice(-2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight">
                  {isOutflow ? (isAr ? 'إصدار سند صرف نقدية' : 'Cash Disbursement Voucher') : (isAr ? 'إصدار سند تحصيل نقدية' : 'Cash Receipt Voucher')}
                </h3>
                {/* Direction Badge */}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black flex items-center gap-1 shadow-xs ${
                  isOutflow ? 'bg-rose-500/30 text-rose-200 border border-rose-400/40' : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                }`}>
                  {isOutflow ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                  <span>{isOutflow ? (isAr ? 'صرف (خصم)' : 'Outflow') : (isAr ? 'تحصيل (إضافة)' : 'Inflow')}</span>
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {safeDisplayName} ({safe.id}) — {isAr ? 'الرصيد المتاح:' : 'Available Balance:'}{' '}
                <strong className="font-mono text-white">{currentSafeBal.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

          {/* 1. Transaction Type Selector (Strictly Direction-Filtered) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              {isAr ? 'نوع الحركة النقدية:' : 'Transaction Type:'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setVoucherType(type.id)}
                  className={`py-2 px-3 rounded-xl border text-center transition cursor-pointer font-extrabold text-xs flex flex-col items-center gap-1 ${
                    voucherType === type.id
                      ? (isOutflow
                          ? 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-400/40 shadow-xs'
                          : 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-400/40 shadow-xs')
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {type.direction === 'out' ? <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" /> : <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />}
                    <span>{isAr ? type.labelAr : type.labelEn}</span>
                  </div>
                  <span className="text-[10px] font-normal opacity-70">
                    {type.direction === 'out' ? (isAr ? 'خصم من الخزينة' : 'Deducted from Safe') : (isAr ? 'إضافة إلى الخزينة' : 'Added to Safe')}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Amount & Currency with Visual Direction Alignment */}
          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border transition-all ${
            isOutflow ? 'bg-rose-50/30 border-rose-200' : 'bg-emerald-50/30 border-emerald-200'
          }`}>
            <div className="sm:col-span-2">
              <label className={`block text-xs font-extrabold mb-1 ${isOutflow ? 'text-rose-900' : 'text-emerald-900'}`}>
                {isOutflow
                  ? (isAr ? 'مبلغ الصرف (خصم من رصيد الخزينة):' : 'Disbursement Amount (Deducted from Vault):')
                  : (isAr ? 'مبلغ التحصيل (إضافة إلى رصيد الخزينة):' : 'Collection Amount (Added to Vault):')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 text-xl font-black font-mono border rounded-xl focus:outline-none focus:ring-2 bg-white transition ${
                    isOutflow
                      ? 'text-rose-700 border-rose-300 focus:ring-rose-500'
                      : 'text-emerald-700 border-emerald-300 focus:ring-emerald-500'
                  } ${isAr ? 'pl-16' : 'pr-16'}`}
                />
                <span className={`absolute ${isAr ? 'left-3' : 'right-3'} top-3 text-xs font-black font-mono ${
                  isOutflow ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {isOutflow ? `- ${currency}` : `+ ${currency}`}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  {isAr ? 'العملة:' : 'Currency:'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowCurrencyDetails(!showCurrencyDetails)}
                  className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                >
                  {showCurrencyDetails ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'عملات أجنبية' : 'Foreign Currencies')}
                </button>
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-bold bg-white text-xs focus:ring-2 focus:ring-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="EGP">EGP - {isAr ? 'جنيه مصري' : 'Egyptian Pound'}</option>
                <option value="USD">USD - {isAr ? 'دولار أمريكي' : 'US Dollar'}</option>
                <option value="EUR">EUR - {isAr ? 'يورو أوروبي' : 'Euro'}</option>
                <option value="SAR">SAR - {isAr ? 'ريال سعودي' : 'Saudi Riyal'}</option>
              </select>
            </div>

            {/* Foreign Currency Exchange Rate (Collapsible) */}
            {currency !== 'EGP' && (
              <div className="sm:col-span-3 pt-2 border-t border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'سعر الصرف مقابل الجنيه (EGP):' : 'Exchange Rate vs EGP:'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div className="flex items-center pt-5 text-xs font-bold text-slate-600">
                  {isAr ? 'القيمة التقديرية بالجنيه:' : 'Estimated EGP Equivalent:'}{' '}
                  <strong className="text-emerald-700 font-mono mx-1">
                    {(numAmount * (Number(exchangeRate) || 1)).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* Arabic Legal Tafqeet Banner */}
          {numAmount > 0 && (
            <div className={`p-3 rounded-xl border ${
              isOutflow ? 'bg-rose-50/60 border-rose-200 text-rose-950' : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
            }`}>
              <span className={`text-[10px] font-bold block mb-0.5 ${isOutflow ? 'text-rose-700' : 'text-emerald-700'}`}>
                {isAr ? 'التفقيط المالي (المبلغ بالحروف):' : 'Legal Amount in Words (Tafqeet):'}
              </span>
              <p className="font-extrabold font-serif text-xs">{tafqeetArabic(numAmount, currency)}</p>
            </div>
          )}

          {/* 3. Banknote Breakdown Grid (Enforced for EGP) */}
          {currency === 'EGP' && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Coins className={`h-4 w-4 ${isOutflow ? 'text-rose-600' : 'text-emerald-600'}`} />
                  <span className="font-extrabold text-slate-800 text-xs">
                    {isAr ? 'تفقيط وعد الفئات النقدية (Banknote Counts) *' : 'Banknote Count Breakdown *'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoFillOptimalBanknotes}
                  disabled={numAmount <= 0}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50 ${
                    isOutflow ? 'bg-rose-100 hover:bg-rose-200 text-rose-800' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                  }`}
                  title={isAr ? 'توزيع المبلغ تلقائياً على أعلى فئات ورقية متوفرة' : 'Auto-allocate to largest available banknotes'}
                >
                  <Wand2 className="h-3 w-3" />
                  <span>{isAr ? 'توزيع تلقائي للفئات' : 'Auto-Fill Banknotes'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {EGP_DENOMINATIONS.map((denom) => {
                  const rawCount = denominations[denom];
                  const numCount = Number(rawCount) || 0;
                  const isNegative = typeof rawCount === 'string' && rawCount.startsWith('-') ? true : numCount < 0;
                  const availableInSafe = Number(currentSafeDenoms[denom]) || 0;
                  const neededFromSafe = isOutflow ? Math.max(0, numCount) : Math.max(0, -numCount);
                  const isExceeded = neededFromSafe > availableInSafe;

                  return (
                    <div
                      key={denom}
                      className={`p-2.5 rounded-xl border flex flex-col justify-between transition relative ${
                        isExceeded
                          ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-400'
                          : isNegative
                          ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/50'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-extrabold text-slate-800">{denom} {isAr ? 'ج.م' : 'EGP'}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleSign(denom)}
                            title={isAr ? 'تبديل الإشارة (+ أو - فكة مرتدة)' : 'Toggle sign (+ or - change return)'}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black transition cursor-pointer ${
                              isNegative ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {isNegative ? '-' : '+'}
                          </button>
                        </div>
                      </div>

                      <div className="relative my-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={rawCount === 0 ? '' : rawCount}
                          onChange={(e) => handleDenomChange(denom, e.target.value)}
                          placeholder="0"
                          className={`w-full px-2 py-1 text-center font-mono font-black text-xs border rounded-lg focus:outline-none transition ${
                            isNegative
                              ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-1 focus:ring-amber-500'
                              : 'border-slate-200 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900'
                          }`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] mt-0.5">
                        {isNegative ? (
                          <span className="px-1.5 py-0.2 rounded font-black text-[9px] bg-amber-200 text-amber-900">
                            {isAr ? 'فكة مرتدة' : 'Change'}
                          </span>
                        ) : (
                          <span className={isExceeded ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                            {isAr ? 'متاح:' : 'Avail:'} {availableInSafe}
                          </span>
                        )}
                        <span className={`font-mono font-bold ${isNegative ? 'text-amber-700' : 'text-slate-500'}`}>
                          {(numCount * denom).toLocaleString()} {isAr ? 'ج' : 'E'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Banknote Match Status Bar */}
              <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                isBanknoteBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex items-center gap-1.5">
                  {isBanknoteBalanced ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />}
                  <span>
                    {isBanknoteBalanced
                      ? (isAr
                          ? `الفئات مطابقة لإجمالي السند بالكامل (${countedBanknotesTotal.toLocaleString()} ج.م) ✓`
                          : `Banknotes match total voucher amount exactly (${countedBanknotesTotal.toLocaleString()} EGP) ✓`)
                      : (isAr
                          ? `متبقي تفقيط: ${Math.abs(banknoteDifference).toLocaleString()} ج.م (المعدود: ${countedBanknotesTotal.toLocaleString()} ج.م)`
                          : `Discrepancy: ${Math.abs(banknoteDifference).toLocaleString()} EGP remaining (Counted: ${countedBanknotesTotal.toLocaleString()} EGP)`)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Accounting Hierarchy & Entity Linking (Suppliers / Salaries / Clients / GL) */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Main GL Account (SearchableSelect with Add New) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'الحساب الرئيسي (الأستاذ العام):' : 'Main GL Account:'}
                </label>
                <SearchableSelect
                  options={mainAccountOptions}
                  value={mainAccount}
                  onChange={(val) => {
                    setMainAccount(val);
                    setSubAccountId('');
                    setSubAccountName('');
                    setSelectedInvoices({});
                  }}
                  isAr={isAr}
                  disabled={voucherType === 'safe_transfer'}
                  placeholder={isAr ? '-- اختر حساب الأستاذ العام --' : '-- Select GL Account --'}
                  onCreateNew={(typedQuery) => handleOpenCreateMainAccount(typedQuery)}
                  createLabel={isAr ? '+ إضافة حساب أستاذ عام جديد' : '+ Add New GL Account'}
                />
              </div>

              {/* Sub-Ledger / Beneficiary (SearchableSelect with Add New) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'الحساب المساعد / المستفيد:' : 'Sub-Ledger / Beneficiary:'}
                </label>
                
                {voucherType === 'safe_transfer' ? (
                  <SearchableSelect
                    options={allSafes
                      .filter((s) => s.id !== safe?.id)
                      .map((s) => ({
                        value: s.id,
                        label: isAr ? s.nameAr : (s.nameEn || s.nameAr),
                        sublabel: s.id,
                        badgeText: isAr ? 'خزينة' : 'Vault'
                      }))}
                    value={targetSafeId}
                    onChange={(val) => setTargetSafeId(val)}
                    isAr={isAr}
                    placeholder={isAr ? '-- اختر الخزينة المستلمة --' : '-- Select Receiving Vault --'}
                  />
                ) : (
                  <SearchableSelect
                    options={subAccountOptions}
                    value={subAccountId || subAccountName}
                    onChange={(val) => {
                      const opt = subAccountOptions.find((o) => String(o.value) === String(val));
                      setSubAccountId(val);
                      setSubAccountName(opt?.label || val);
                      setSelectedInvoices({});
                    }}
                    isAr={isAr}
                    placeholder={
                      accountRole === 'supplier'
                        ? (isAr ? '-- اختر المورد المعتمد --' : '-- Select Approved Supplier --')
                        : accountRole === 'worker'
                        ? (isAr ? '-- اختر العامل / الموظف --' : '-- Select Staff Member --')
                        : accountRole === 'client'
                        ? (isAr ? '-- اختر العميل / شركة التوزيع --' : '-- Select Client / Distributor --')
                        : (isAr ? '-- اختر الحساب المساعد / مركز التكلفة --' : '-- Select Sub-Ledger / Cost Center --')
                    }
                    onCreateNew={(typedQuery) => handleOpenCreateSubAccount(typedQuery)}
                    createLabel={
                      accountRole === 'supplier'
                        ? (isAr ? '+ إضافة مورد جديد' : '+ Add New Supplier')
                        : accountRole === 'worker'
                        ? (isAr ? '+ إضافة موظف جديد' : '+ Add New Employee')
                        : accountRole === 'client'
                        ? (isAr ? '+ إضافة عميل جديد' : '+ Add New Client')
                        : (isAr ? '+ إضافة مركز تكلفة / بند مصروف فرعي' : '+ Add Sub-Account')
                    }
                  />
                )}
              </div>
            </div>

            {/* Extra Field for Salaries: Payroll Month */}
            {accountRole === 'worker' && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-700 text-xs">
                  {isAr ? 'الشهر المالي / دورة الراتب:' : 'Payroll Month / Period:'}
                </span>
                <input
                  type="text"
                  value={payrollPeriod}
                  onChange={(e) => setPayrollPeriod(e.target.value)}
                  placeholder="MM/YYYY"
                  className="px-3 py-1 text-xs border border-slate-300 rounded-lg font-mono font-bold bg-white text-center w-28"
                />
              </div>
            )}

            {/* Extra Field for Clients: Sales Order / Delivery Reference */}
            {accountRole === 'client' && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-700 text-xs">
                  {isAr ? 'رقم أمر البيع / فاتورة المبيعات:' : 'Sales Order / Invoice Ref:'}
                </span>
                <input
                  type="text"
                  value={clientReference}
                  onChange={(e) => setClientReference(e.target.value)}
                  placeholder={isAr ? 'مثال: SO-2026-042' : 'e.g. SO-2026-042'}
                  className="px-3 py-1 text-xs border border-slate-300 rounded-lg font-mono font-bold bg-white w-48"
                />
              </div>
            )}

            {/* Supplier Invoices / POs Linking & Allocation */}
            {accountRole === 'supplier' && subAccountId && (
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-slate-500" />
                    <span>{isAr ? 'سداد فواتير وأوامر الشراء (Purchase Invoices Allocation):' : 'Allocate Against Purchase Documents:'}</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {loadingInvoices ? (isAr ? 'جاري التحميل...' : 'Loading...') : `${supplierInvoices.length} ${isAr ? 'مستند متاح' : 'Docs Available'}`}
                  </span>
                </div>

                {supplierInvoices.length === 0 && !loadingInvoices ? (
                  <p className="text-slate-400 text-xs py-2">
                    {isAr ? 'لا توجد أوامر شراء أو أذون استلام مفتوحة لهذا المورد حالياً (يمكن المتابعة بدفعة حرة).' : 'No open POs/GRNs found for this supplier (you may proceed with an open payment).'}
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {supplierInvoices.map((inv) => {
                      const isSelected = Boolean(selectedInvoices[inv.id]);
                      return (
                        <div
                          key={inv.id}
                          onClick={() => handleToggleInvoice(inv)}
                          className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition text-xs ${
                            isSelected ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected ? <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" /> : <Square className="h-4 w-4 text-slate-300 shrink-0" />}
                            <div>
                              <span className="font-mono font-extrabold text-slate-900">{inv.docNumber}</span>
                              <span className="text-[10px] text-slate-400 mx-1.5 font-normal">({inv.type} • {inv.date})</span>
                              {inv.invoiceNumber && (
                                <span className="text-[10px] text-purple-700 font-mono">فاتورة: {inv.invoiceNumber}</span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono font-black text-slate-900">
                            {inv.total.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Tax Document Classification */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <span className="font-extrabold text-slate-800 text-xs block">
              {isAr ? 'التصنيف الضريبي للمستند:' : 'Tax Document Classification:'}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'taxable', labelAr: 'مستند ضريبي رسمي', labelEn: 'Official Tax Invoice' },
                { id: 'non_taxable', labelAr: 'مستند غير ضريبي / إيصال', labelEn: 'Informal / Internal Receipt' },
                { id: 'no_document', labelAr: 'بدون مستند مؤيد', labelEn: 'No Supporting Document' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTaxDocumentType(opt.id)}
                  className={`p-2.5 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                    taxDocumentType === opt.id
                      ? 'bg-purple-50 border-purple-400 text-purple-900 ring-1 ring-purple-400'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {isAr ? opt.labelAr : opt.labelEn}
                </button>
              ))}
            </div>

            {/* Official Tax Invoice Details Inputs */}
            {taxDocumentType === 'taxable' && (
              <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">
                    {isAr ? 'رقم الفاتورة الضريبية:' : 'Tax Invoice Number:'}
                  </label>
                  <input
                    type="text"
                    value={taxInvoiceNumber}
                    onChange={(e) => setTaxInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-10928"
                    className="w-full px-2.5 py-1.5 border border-purple-200 rounded-lg text-xs font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">
                    {isAr ? 'السجل/الملف الضريبي:' : 'Tax Registration ID:'}
                  </label>
                  <input
                    type="text"
                    value={vendorTaxId}
                    onChange={(e) => setVendorTaxId(e.target.value)}
                    placeholder="e.g. 524-118-902"
                    className="w-full px-2.5 py-1.5 border border-purple-200 rounded-lg text-xs font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">
                    {isAr ? 'ضريبة ق.م (VAT %):' : 'VAT Rate %:'}
                  </label>
                  <input
                    type="number"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-purple-200 rounded-lg text-xs font-mono bg-white"
                  />
                  <span className="text-[10px] text-purple-700 font-bold block mt-0.5">
                    {calculatedVat.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">
                    {isAr ? 'خصم أ.ت (WHT %):' : 'WHT Rate %:'}
                  </label>
                  <input
                    type="number"
                    value={withholdingRate}
                    onChange={(e) => setWithholdingRate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-purple-200 rounded-lg text-xs font-mono bg-white"
                  />
                  <span className="text-[10px] text-purple-700 font-bold block mt-0.5">
                    {calculatedWht.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 6. Description & File Attachments */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'البيان والشرح التفصيلي للعملية:' : 'Description & Transaction Statement:'}
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isAr ? 'اكتب تفاصيل وبيان السند المالي...' : 'Write detailed statement and notes...'}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none text-xs"
              />
            </div>

            {/* Attachments Dropzone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'المرفقات والمستندات المؤيدة (صور / PDF):' : 'Supporting Attachments (Images / PDF):'}
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer text-slate-600 font-bold text-xs">
                  <Upload className="h-4 w-4 text-slate-400" />
                  <span>{isUploading ? (isAr ? 'جاري التحميل...' : 'Uploading...') : (isAr ? 'إرفاق ملفات' : 'Attach Files')}</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
                <span className="text-[11px] text-slate-400">
                  {attachments.length} {isAr ? 'ملف مرفق' : 'files attached'}
                </span>
              </div>

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {attachments.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-xs">
                      <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                      <span className="truncate max-w-[150px]">{file.name || `Attachment-${idx + 1}`}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="text-slate-400 hover:text-rose-600 p-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 7. Pre-Approval Routing Checkbox */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="text-xs font-bold text-slate-700">
                {isAr ? 'إرسال للاعتماد المالي المسبق قبل الخصم الفعلي' : 'Route for prior financial approval before balance deduction'}
              </span>
            </label>
          </div>

          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (currency === 'EGP' && !isBanknoteBalanced)}
              className={`px-6 py-2.5 rounded-xl text-xs font-extrabold text-white transition cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50 ${
                isOutflow ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {isSubmitting ? (
                <span>{isAr ? 'جاري التسجيل...' : 'Processing...'}</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {isOutflow
                      ? (isAr ? 'تأكيد وترحيل سند الصرف' : 'Confirm & Post Disbursement')
                      : (isAr ? 'تأكيد وترحيل سند التحصيل' : 'Confirm & Post Receipt')}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Add Account Modal */}
        {quickAccountModal.isOpen && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden my-auto max-h-[90vh] flex flex-col ${isAr ? 'text-right' : 'text-left'}`}>
              <div className="bg-slate-900 px-5 py-3.5 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-5 w-5 text-emerald-400" />
                  <h4 className="text-sm font-extrabold">
                    {quickAccountModal.isSub
                      ? (isAr ? 'إضافة حساب أستاذ مساعد / مركز تكلفة' : 'Add New Sub-Ledger / Cost Center')
                      : (isAr ? 'إضافة حساب أستاذ عام جديد' : 'Add New General Ledger Account')}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickAccountModal((prev) => ({ ...prev, isOpen: false }))}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveQuickAccount} className="p-5 space-y-3.5 text-xs overflow-y-auto flex-1">
                {quickAccountModal.isSub && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                    <span className="text-[10px] text-slate-400 block">{isAr ? 'الحساب الرئيسي التابع له:' : 'Parent GL Account:'}</span>
                    <strong className="text-xs text-slate-900">{quickAccountModal.parentAccountName} ({quickAccountModal.parentAccountId})</strong>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'كود الحساب (رقم فريد) *:' : 'Account Code *:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={quickAccountModal.code}
                    onChange={(e) => setQuickAccountModal((prev) => ({ ...prev, code: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم الحساب بالعربية *:' : 'Account Name (Arabic) *:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={quickAccountModal.nameAr}
                    onChange={(e) => setQuickAccountModal((prev) => ({ ...prev, nameAr: e.target.value }))}
                    placeholder={isAr ? 'مثال: شركة النور للتوريدات' : 'e.g. Al-Noor Supplies Co'}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم الحساب بالإنجليزية (اختياري):' : 'Account Name (English - Optional):'}
                  </label>
                  <input
                    type="text"
                    value={quickAccountModal.nameEn}
                    onChange={(e) => setQuickAccountModal((prev) => ({ ...prev, nameEn: e.target.value }))}
                    placeholder="e.g. Al-Noor Supplies Co"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setQuickAccountModal((prev) => ({ ...prev, isOpen: false }))}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                  >
                    {isAr ? 'حفظ وإدراج في السند' : 'Save & Select'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
