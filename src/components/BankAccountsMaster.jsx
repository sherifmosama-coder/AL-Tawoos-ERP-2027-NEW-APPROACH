import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Landmark,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  CreditCard,
  FileSpreadsheet,
  Globe,
  Save,
  X,
  Users,
  Copy,
  Check
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase.js';

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'GBP'];

export default function BankAccountsMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = Boolean(currentUser.isGeneralAdmin || currentUser.role === 'general_admin');

  const [banksList, setBanksList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCurrencyFilter, setSelectedCurrencyFilter] = useState('all');
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Bank Account Modal State
  const [bankModal, setBankModal] = useState({
    isOpen: false,
    isEdit: false,
    id: '',
    code: '',
    bankNameAr: '',
    bankNameEn: '',
    accountNumber: '',
    iban: '',
    swiftCode: '',
    branchName: '',
    currency: 'EGP',
    accountType: 'current',
    signatories: [],
    isActive: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Live Subscriptions
  useEffect(() => {
    const unsubBanks = onSnapshot(collection(db, 'corporate_banks'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => !d.isDeleted);
      list.sort((a, b) => (a.code || a.id).localeCompare(b.code || b.id));
      setBanksList(list);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubBanks();
      unsubUsers();
    };
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const handleCopyText = (text, id) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Open Modal for Create
  const handleOpenCreate = () => {
    const nextNum = banksList.length + 1;
    const nextCode = `BANK-${String(nextNum).padStart(2, '0')}`;
    setBankModal({
      isOpen: true,
      isEdit: false,
      id: nextCode,
      code: nextCode,
      bankNameAr: '',
      bankNameEn: '',
      accountNumber: '',
      iban: '',
      swiftCode: '',
      branchName: '',
      currency: 'EGP',
      accountType: 'current',
      signatories: [],
      isActive: true
    });
  };

  // Open Modal for Edit
  const handleOpenEdit = (bank) => {
    setBankModal({
      isOpen: true,
      isEdit: true,
      id: bank.id,
      code: bank.code || bank.id,
      bankNameAr: bank.bankNameAr || '',
      bankNameEn: bank.bankNameEn || '',
      accountNumber: bank.accountNumber || '',
      iban: bank.iban || '',
      swiftCode: bank.swiftCode || '',
      branchName: bank.branchName || '',
      currency: bank.currency || 'EGP',
      accountType: bank.accountType || 'current',
      signatories: Array.isArray(bank.signatories) ? bank.signatories : [],
      isActive: bank.isActive !== false
    });
  };

  // Save Bank Account
  const handleSaveBank = async (e) => {
    e.preventDefault();
    if (!bankModal.bankNameAr.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال اسم البنك بالعربية' : 'Please provide bank name in Arabic');
      return;
    }
    if (!bankModal.accountNumber.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال رقم الحساب البنكي' : 'Please provide account number');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const nowIso = new Date().toISOString();
      const bankRef = doc(db, 'corporate_banks', bankModal.id);

      const payload = {
        id: bankModal.id,
        code: bankModal.code || bankModal.id,
        bankNameAr: bankModal.bankNameAr.trim(),
        bankNameEn: bankModal.bankNameEn.trim() || bankModal.bankNameAr.trim(),
        accountNumber: bankModal.accountNumber.trim(),
        iban: bankModal.iban.trim().toUpperCase(),
        swiftCode: bankModal.swiftCode.trim().toUpperCase(),
        branchName: bankModal.branchName.trim(),
        currency: bankModal.currency,
        accountType: bankModal.accountType,
        signatories: bankModal.signatories,
        isActive: bankModal.isActive,
        updatedAt: nowIso
      };

      if (!bankModal.isEdit) {
        payload.createdAt = nowIso;
        payload.isBank = true;
      }

      await setDoc(bankRef, payload, { merge: true });
      showToast(
        bankModal.isEdit
          ? (isAr ? 'تم تحديث بيانات الحساب البنكي بنجاح ✓' : 'Bank account updated successfully ✓')
          : (isAr ? 'تم إضافة الحساب البنكي الجديد بنجاح ✓' : 'New bank account added successfully ✓')
      );
      setBankModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error('Error saving bank account:', err);
      setErrorMsg(err.message || 'Error saving bank account');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Bank Account
  const handleDeleteBank = async (bankId) => {
    if (!isGeneralAdmin) return;
    if (!window.confirm(isAr ? `هل تريد بالتأكيد حذف الحساب البنكي (${bankId})؟` : `Delete bank account (${bankId})?`)) {
      return;
    }
    try {
      const softDeleteFn = httpsCallable(functions, 'systemSoftDeleteDocument');
      await softDeleteFn({
        collectionName: 'corporate_banks',
        docId: bankId,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.name, nameAr: currentUser.nameAr } : null,
      });
      showToast(isAr ? 'تم أرشفة وحذف الحساب البنكي' : 'Bank account soft-deleted');
    } catch (err) {
      console.error('Error deleting bank:', err);
      setErrorMsg(err.message || 'Error deleting bank account');
    }
  };

  // Filtered Banks
  const filteredBanks = useMemo(() => {
    return banksList.filter((b) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        b.id.toLowerCase().includes(q) ||
        (b.bankNameAr || '').toLowerCase().includes(q) ||
        (b.bankNameEn || '').toLowerCase().includes(q) ||
        (b.accountNumber || '').includes(q) ||
        (b.iban || '').toLowerCase().includes(q);

      const matchesCurrency = selectedCurrencyFilter === 'all' || b.currency === selectedCurrencyFilter;
      return matchesSearch && matchesCurrency;
    });
  }, [banksList, searchTerm, selectedCurrencyFilter]);

  return (
    <div className={`space-y-6 ${isAr ? 'text-right' : 'text-left'}`}>
      {/* Toast Feedback */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs font-bold flex items-center gap-2 shadow-xs animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 text-xs font-bold flex items-center gap-2 shadow-xs animate-fadeIn">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'إجمالي الحسابات البنكية' : 'Total Bank Accounts'}</span>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">{banksList.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'الحسابات النشطة' : 'Active Accounts'}</span>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
            {banksList.filter((b) => b.isActive !== false).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'العملات المسجلة' : 'Currencies'}</span>
          <div className="text-2xl font-black text-indigo-600 font-mono mt-1">
            {new Set(banksList.map((b) => b.currency)).size}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'المفوضون بالتوقيع' : 'Signatories Configured'}</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            {new Set(banksList.flatMap((b) => b.signatories || [])).size}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث باسم البنك، رقم الحساب، أو الآيبان...' : 'Search bank, account #, or IBAN...'}
              className="w-full ps-9 pe-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={selectedCurrencyFilter}
            onChange={(e) => setSelectedCurrencyFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
          >
            <option value="all">{isAr ? 'كافة العملات' : 'All Currencies'}</option>
            {CURRENCIES.map((curr) => (
              <option key={curr} value={curr}>{curr}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500">
            {filteredBanks.length} {isAr ? 'حساب بنكي' : 'accounts'}
          </span>

          {isGeneralAdmin && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'إضافة حساب بنكي جديد +' : 'Add Bank Account +'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bank Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBanks.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-3xl border border-slate-200 text-slate-400 space-y-2">
            <Landmark className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-xs font-bold">
              {isAr ? 'لا توجد حسابات بنكية مطابقة لمعايير البحث' : 'No bank accounts match the current filters'}
            </p>
          </div>
        ) : (
          filteredBanks.map((bank) => {
            return (
              <div
                key={bank.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md transition p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Card Header: Icon, Bank Name, Currency */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-2xl text-blue-700">
                        <Landmark className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 leading-tight">
                          {isAr ? bank.bankNameAr : (bank.bankNameEn || bank.bankNameAr)}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-xs text-slate-400 font-bold">{bank.id}</span>
                          {bank.branchName && (
                            <span className="text-[11px] text-slate-500">• {bank.branchName}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-black px-2 py-0.5 rounded-full font-mono">
                        {bank.currency || 'EGP'}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          bank.isActive !== false
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {bank.isActive !== false ? (isAr ? 'نشط' : 'Active') : (isAr ? 'موقوف' : 'Inactive')}
                      </span>
                    </div>
                  </div>

                  {/* Account Numbers Box */}
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px] font-bold">{isAr ? 'رقم الحساب:' : 'Account No:'}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-black text-slate-900">{bank.accountNumber}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(bank.accountNumber, `acc_${bank.id}`)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                          title={isAr ? 'نسخ رقم الحساب' : 'Copy Account Number'}
                        >
                          {copiedId === `acc_${bank.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>

                    {bank.iban && (
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                        <span className="text-slate-500 text-[10px] font-bold">{isAr ? 'الآيبان (IBAN):' : 'IBAN:'}</span>
                        <div className="flex items-center gap-1 max-w-[70%]">
                          <span className="font-mono text-[10px] font-bold text-slate-700 truncate" title={bank.iban}>
                            {bank.iban}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(bank.iban, `iban_${bank.id}`)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer shrink-0"
                            title={isAr ? 'نسخ الآيبان' : 'Copy IBAN'}
                          >
                            {copiedId === `iban_${bank.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {bank.swiftCode && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="text-slate-500 text-[10px] font-bold">{isAr ? 'السويفت (SWIFT):' : 'SWIFT:'}</span>
                        <span className="font-mono text-[11px] font-bold text-slate-700">{bank.swiftCode}</span>
                      </div>
                    )}
                  </div>

                  {/* Signatories Details */}
                  {Array.isArray(bank.signatories) && bank.signatories.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[10px] text-slate-500 font-bold block mb-1">
                        {isAr ? 'المفوضون بالتوقيع وإصدار الشيكات:' : 'Authorized Signatories:'}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {bank.signatories.map((sigId) => {
                          const sigUser = usersList.find((u) => u.id === sigId);
                          return (
                            <span
                              key={sigId}
                              className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/60 rounded-lg text-[10px] font-bold"
                            >
                              {sigUser ? (sigUser.nameAr || sigUser.name) : sigId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                {isGeneralAdmin && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleDeleteBank(bank.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                      title={isAr ? 'حذف الحساب' : 'Delete Account'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(bank)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>{isAr ? 'تعديل البيانات' : 'Edit Details'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CREATE / EDIT BANK MODAL */}
      {bankModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-auto max-h-[92vh] flex flex-col text-start">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {bankModal.isEdit ? (isAr ? 'تعديل بيانات الحساب البنكي' : 'Edit Bank Account') : (isAr ? 'إضافة حساب بنكي جديد' : 'Add Corporate Bank Account')}
                  </h3>
                  <span className="font-mono text-xs text-slate-400 font-bold">{bankModal.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBankModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBank} className="flex-1 flex flex-col overflow-hidden text-xs">
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم البنك (عربي):' : 'Bank Name (Arabic):'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={bankModal.bankNameAr}
                    onChange={(e) => setBankModal((prev) => ({ ...prev, bankNameAr: e.target.value }))}
                    placeholder={isAr ? 'مثال: البنك الأهلي المصري' : 'e.g., National Bank of Egypt'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم البنك (إنجليزي):' : 'Bank Name (English):'}
                  </label>
                  <input
                    type="text"
                    value={bankModal.bankNameEn}
                    onChange={(e) => setBankModal((prev) => ({ ...prev, bankNameEn: e.target.value }))}
                    placeholder="e.g., National Bank of Egypt (NBE)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم الحساب الجاري:' : 'Account Number:'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={bankModal.accountNumber}
                    onChange={(e) => setBankModal((prev) => ({ ...prev, accountNumber: e.target.value }))}
                    placeholder="1234567890123"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'عملة الحساب:' : 'Account Currency:'}
                  </label>
                  <select
                    value={bankModal.currency}
                    onChange={(e) => setBankModal((prev) => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    {CURRENCIES.map((curr) => (
                      <option key={curr} value={curr}>{curr}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'رقم الآيبان الدولي (IBAN):' : 'International Bank Account Number (IBAN):'}
                </label>
                <input
                  type="text"
                  value={bankModal.iban}
                  onChange={(e) => setBankModal((prev) => ({ ...prev, iban: e.target.value }))}
                  placeholder="EG380002000100000012345678901"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 uppercase"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'كود السويفت (SWIFT Code):' : 'SWIFT / BIC Code:'}
                  </label>
                  <input
                    type="text"
                    value={bankModal.swiftCode}
                    onChange={(e) => setBankModal((prev) => ({ ...prev, swiftCode: e.target.value }))}
                    placeholder="NBEGEGCX"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم الفرع:' : 'Branch Name:'}
                  </label>
                  <input
                    type="text"
                    value={bankModal.branchName}
                    onChange={(e) => setBankModal((prev) => ({ ...prev, branchName: e.target.value }))}
                    placeholder={isAr ? 'فرع المنطقة الصناعية 6 أكتوبر' : '6th of October Industrial Branch'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Signatories Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  {isAr ? 'المفوضون بالتوقيع والشيكات:' : 'Authorized Signatories:'}
                </label>
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-slate-50">
                  {usersList.map((u) => {
                    const isChecked = bankModal.signatories.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg transition cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setBankModal((prev) => ({
                              ...prev,
                              signatories: checked
                                ? [...prev.signatories, u.id]
                                : prev.signatories.filter((id) => id !== u.id)
                            }));
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-slate-800">{u.nameAr || u.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({u.email || u.id})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bankModal.isActive}
                    onChange={(e) => setBankModal((prev) => ({ ...prev, isActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    {isAr ? 'الحساب نشط ومعتمد للعمليات' : 'Account is active'}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setBankModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs shadow-md transition cursor-pointer disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isSubmitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الحساب البنكي' : 'Save Account')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
      )}
    </div>
  );
}
