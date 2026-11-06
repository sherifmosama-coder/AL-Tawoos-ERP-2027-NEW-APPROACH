import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Vault,
  Plus,
  Search,
  Edit2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Coins,
  Save,
  Trash2,
  X,
  Palette,
  Users,
  Building,
  Key,
  Clock,
  Layers,
  Check
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_COLORS = [
  { id: 'blue', nameAr: 'أزرق كلاسيكي', nameEn: 'Royal Blue', bgClass: 'bg-blue-600', borderClass: 'border-blue-500' },
  { id: 'emerald', nameAr: 'أخضر زمردي', nameEn: 'Emerald Green', bgClass: 'bg-emerald-600', borderClass: 'border-emerald-500' },
  { id: 'amber', nameAr: 'كهرماني ذهبي', nameEn: 'Golden Amber', bgClass: 'bg-amber-600', borderClass: 'border-amber-500' },
  { id: 'purple', nameAr: 'بنفسجي ملكي', nameEn: 'Imperial Purple', bgClass: 'bg-purple-600', borderClass: 'border-purple-500' },
  { id: 'rose', nameAr: 'وردي ياقوتي', nameEn: 'Ruby Rose', bgClass: 'bg-rose-600', borderClass: 'border-rose-500' },
  { id: 'cyan', nameAr: 'سماوي بحري', nameEn: 'Ocean Cyan', bgClass: 'bg-cyan-600', borderClass: 'border-cyan-500' },
  { id: 'indigo', nameAr: 'نيلي داكن', nameEn: 'Deep Indigo', bgClass: 'bg-indigo-600', borderClass: 'border-indigo-500' }
];

export default function SafesMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = Boolean(currentUser.isGeneralAdmin || currentUser.role === 'general_admin');

  const [safesList, setSafesList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [treasuryConfig, setTreasuryConfig] = useState({ generalAuthorizerUserIds: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // General Authorizers Edit State
  const [selectedGeneralAuthorizers, setSelectedGeneralAuthorizers] = useState([]);
  const [isSavingAuthorizers, setIsSavingAuthorizers] = useState(false);

  // Safe Create / Edit Modal State
  const [safeModal, setSafeModal] = useState({
    isOpen: false,
    isEdit: false,
    id: '',
    code: '',
    nameAr: '',
    nameEn: '',
    color: 'blue',
    responsibleUserId: '',
    authorizerUserId: '',
    maxSafetyLimit: 100000,
    isActive: true
  });
  const [isSubmittingSafe, setIsSubmittingSafe] = useState(false);

  // 1. Live Subscriptions
  useEffect(() => {
    const unsubSafes = onSnapshot(collection(db, 'cash_safes'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.code || a.id).localeCompare(b.code || b.id));
      setSafesList(list);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubTreasury = onSnapshot(doc(db, 'system_config', 'treasury_settings'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTreasuryConfig(data);
        setSelectedGeneralAuthorizers(data.generalAuthorizerUserIds || []);
      }
    });

    return () => {
      unsubSafes();
      unsubUsers();
      unsubTreasury();
    };
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  // Save General Payment Authorizers
  const handleSaveGeneralAuthorizers = async () => {
    if (!isGeneralAdmin) return;
    setIsSavingAuthorizers(true);
    setErrorMsg('');
    try {
      await setDoc(
        doc(db, 'system_config', 'treasury_settings'),
        {
          generalAuthorizerUserIds: selectedGeneralAuthorizers,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.id
        },
        { merge: true }
      );
      showToast(isAr ? 'تم حفظ وتحديث المعتمدين العموميين للصرف بنجاح ✓' : 'General authorizers saved successfully ✓');
    } catch (err) {
      console.error('Error saving authorizers:', err);
      setErrorMsg(err.message || 'Error saving general authorizers');
    } finally {
      setIsSavingAuthorizers(false);
    }
  };

  // Toggle user in General Authorizers
  const handleToggleGeneralAuthorizer = (userId) => {
    if (!isGeneralAdmin) return;
    setSelectedGeneralAuthorizers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Open Safe Modal for Create
  const handleOpenCreateSafe = () => {
    const nextNum = safesList.length + 1;
    const nextCode = `SAFE-${String(nextNum).padStart(2, '0')}`;
    setSafeModal({
      isOpen: true,
      isEdit: false,
      id: nextCode,
      code: nextCode,
      nameAr: '',
      nameEn: '',
      color: 'blue',
      responsibleUserId: currentUser.id || '',
      authorizerUserId: currentUser.id || '',
      maxSafetyLimit: 100000,
      isActive: true
    });
  };

  // Open Safe Modal for Edit
  const handleOpenEditSafe = (safe) => {
    setSafeModal({
      isOpen: true,
      isEdit: true,
      id: safe.id,
      code: safe.code || safe.id,
      nameAr: safe.nameAr || '',
      nameEn: safe.nameEn || '',
      color: safe.color || 'blue',
      responsibleUserId: safe.responsibleUserId || '',
      authorizerUserId: safe.authorizerUserId || '',
      maxSafetyLimit: safe.maxSafetyLimit || 100000,
      isActive: safe.isActive !== false
    });
  };

  // Save Safe (Create / Edit)
  const handleSaveSafe = async (e) => {
    e.preventDefault();
    if (!safeModal.nameAr.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال اسم الخزينة بالعربية' : 'Please provide vault name in Arabic');
      return;
    }

    setIsSubmittingSafe(true);
    setErrorMsg('');
    try {
      const nowIso = new Date().toISOString();
      const safeRef = doc(db, 'cash_safes', safeModal.id);

      if (safeModal.isEdit) {
        await updateDoc(safeRef, {
          nameAr: safeModal.nameAr.trim(),
          nameEn: safeModal.nameEn.trim() || safeModal.nameAr.trim(),
          color: safeModal.color,
          responsibleUserId: safeModal.responsibleUserId,
          authorizerUserId: safeModal.authorizerUserId,
          maxSafetyLimit: Number(safeModal.maxSafetyLimit) || 100000,
          isActive: safeModal.isActive,
          updatedAt: nowIso
        });
        showToast(isAr ? 'تم تحديث بيانات الخزينة بنجاح ✓' : 'Vault updated successfully ✓');
      } else {
        await setDoc(safeRef, {
          id: safeModal.id,
          code: safeModal.code || safeModal.id,
          nameAr: safeModal.nameAr.trim(),
          nameEn: safeModal.nameEn.trim() || safeModal.nameAr.trim(),
          color: safeModal.color,
          responsibleUserId: safeModal.responsibleUserId,
          authorizerUserId: safeModal.authorizerUserId,
          maxSafetyLimit: Number(safeModal.maxSafetyLimit) || 100000,
          isActive: true,
          isBank: false,
          currentBalance: 0,
          balances: {
            EGP: { currentBalance: 0, denominations: {} }
          },
          createdAt: nowIso,
          updatedAt: nowIso
        });
        showToast(isAr ? 'تم إنشاء الخزينة الجديدة بنجاح ✓' : 'New vault created successfully ✓');
      }
      setSafeModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err) {
      console.error('Error saving safe:', err);
      setErrorMsg(err.message || 'Error saving vault');
    } finally {
      setIsSubmittingSafe(false);
    }
  };

  // Filtered Safes
  const filteredSafes = useMemo(() => {
    return safesList.filter((s) => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        s.id.toLowerCase().includes(q) ||
        (s.nameAr || '').toLowerCase().includes(q) ||
        (s.nameEn || '').toLowerCase().includes(q)
      );
    });
  }, [safesList, searchTerm]);

  // Aggregate KPI stats
  const totalBalanceEGP = useMemo(() => {
    return safesList.reduce((sum, s) => {
      const bal = Number(s.balances?.EGP?.currentBalance ?? s.balance ?? s.currentBalance ?? 0);
      return sum + bal;
    }, 0);
  }, [safesList]);

  return (
    <div className={`space-y-6 ${isAr ? 'text-right' : 'text-left'}`}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/20 border border-amber-400/30 rounded-2xl text-amber-300">
            <Vault className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black">
                {isAr ? 'سجل الخزائن والخزن النقدية' : 'Cash Safes & Vaults Master'}
              </h2>
              <span className="text-[10px] bg-white/10 px-2.5 py-0.5 rounded-full font-mono text-slate-300">
                {safesList.length} {isAr ? 'خزينة' : 'Vaults'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              {isAr
                ? 'إدارة الخزائن النقدية الفعلية بالمصنع، حدود الأمان، أمناء العهد، وضبط هرمية اعتماد المدفوعات'
                : 'Manage physical factory cash vaults, safety limits, custodians, and payment approval hierarchy'}
            </p>
          </div>
        </div>

        {isGeneralAdmin && (
          <button
            type="button"
            onClick={handleOpenCreateSafe}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إنشاء خزينة جديدة +' : 'Create Vault +'}</span>
          </button>
        )}
      </div>

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
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'إجمالي عدد الخزائن' : 'Total Vaults'}</span>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">{safesList.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'إجمالي النقدية بالخزائن' : 'Total Cash Balance'}</span>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
            {totalBalanceEGP.toLocaleString()} <span className="text-xs font-sans text-slate-500">{isAr ? 'ج.م' : 'EGP'}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'الخزائن النشطة' : 'Active Vaults'}</span>
          <div className="text-2xl font-black text-indigo-600 font-mono mt-1">
            {safesList.filter((s) => s.isActive !== false).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 block">{isAr ? 'المعتمدون العموميون' : 'General Authorizers'}</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            {selectedGeneralAuthorizers.length}
          </div>
        </div>
      </div>

      {/* SECTION 1: General Payment Authorizers Configuration */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {isAr ? 'المعتمدون العموميون للصرف (General Payment Authorizers)' : 'General Payment Authorizers'}
              </h3>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'المستخدمون المفوضون باعتماد وصرف السندات المعلقة عبر كافة خزائن الشركة (المستوى الثاني في هرمية الصرف)'
                  : 'Users authorized to approve pending payment vouchers across all company safes (Tier 2 Authority)'}
              </p>
            </div>
          </div>

          {isGeneralAdmin && (
            <button
              type="button"
              disabled={isSavingAuthorizers}
              onClick={handleSaveGeneralAuthorizers}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{isSavingAuthorizers ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ المعتمدين العموميين' : 'Save Authorizers')}</span>
            </button>
          )}
        </div>

        {/* 3-Tier Hierarchy Explanatory Banner */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-bold">
            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-black">1</span>
            <span>{isAr ? 'معتمد الخزينة المحدد' : 'Safe-Specific Authorizer'}</span>
          </div>
          <span className="text-slate-400">←</span>
          <div className="flex items-center gap-1.5 text-amber-900 font-bold bg-amber-100/70 px-2 py-0.5 rounded-lg">
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">2</span>
            <span>{isAr ? 'المعتمدون العموميون (أدناه)' : 'General Authorizers (Below)'}</span>
          </div>
          <span className="text-slate-400">←</span>
          <div className="flex items-center gap-1.5 text-emerald-900 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-lg">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">3</span>
            <span>{isAr ? 'المسؤول العام للنظام' : 'General Admin'}</span>
          </div>
        </div>

        {/* User Badges Grid for General Authorizers Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
          {usersList.map((u) => {
            const isSelected = selectedGeneralAuthorizers.includes(u.id);
            const isSelfAdmin = Boolean(u.isGeneralAdmin || u.role === 'general_admin');
            return (
              <div
                key={u.id}
                onClick={() => isGeneralAdmin && handleToggleGeneralAuthorizer(u.id)}
                className={`p-3 rounded-2xl border transition flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                } ${isGeneralAdmin ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                      isSelected ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {(u.nameAr || u.name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-xs truncate">{u.nameAr || u.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{u.department || u.email}</div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  {isSelfAdmin && (
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                      {isAr ? 'أدمن' : 'Admin'}
                    </span>
                  )}
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Physical Safes Registry Grid */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'بحث بكود أو اسم الخزينة...' : 'Search by code or vault name...'}
              className="w-full ps-9 pe-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <span className="text-xs font-bold text-slate-500">
            {filteredSafes.length} {isAr ? 'خزينة مسجلة' : 'vaults found'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSafes.map((safe) => {
            const safeColorObj = SAFE_COLORS.find((c) => c.id === safe.color) || SAFE_COLORS[0];
            const custodianUser = usersList.find((u) => u.id === safe.responsibleUserId);
            const authorizerUser = usersList.find((u) => u.id === safe.authorizerUserId);
            const safeBalance = Number(safe.balances?.EGP?.currentBalance ?? safe.balance ?? safe.currentBalance ?? 0);

            return (
              <div
                key={safe.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-2xs hover:shadow-md transition p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Card Header: Color Dot, Code & Name */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-4 h-4 rounded-full ${safeColorObj.bgClass} ring-2 ring-white shadow-xs shrink-0`} />
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 leading-tight">
                          {isAr ? safe.nameAr : (safe.nameEn || safe.nameAr)}
                        </h4>
                        <span className="font-mono text-xs text-slate-400">{safe.id}</span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        safe.isActive !== false
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {safe.isActive !== false ? (isAr ? 'نشطة' : 'Active') : (isAr ? 'متوقفة' : 'Inactive')}
                    </span>
                  </div>

                  {/* Balance Display */}
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">{isAr ? 'الرصيد الدفتري الحالي:' : 'Current Book Balance:'}</span>
                    <span className="text-base font-black font-mono text-slate-900">
                      {safeBalance.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                    </span>
                  </div>

                  {/* Custodians Details */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>{isAr ? 'أمين الخزينة:' : 'Custodian:'}</span>
                      </span>
                      <span className="font-bold text-slate-800">
                        {custodianUser ? (custodianUser.nameAr || custodianUser.name) : (isAr ? 'غير محدد' : 'Unassigned')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                        <span>{isAr ? 'المعتمد المالي للصرف:' : 'Payment Authorizer:'}</span>
                      </span>
                      <span className="font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded">
                        {authorizerUser ? (authorizerUser.nameAr || authorizerUser.name) : (isAr ? 'المعتمدون العموميون' : 'General Authorizers')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span className="text-slate-500">{isAr ? 'حد الأمان الأقصى:' : 'Safety Limit:'}</span>
                      <span className="font-mono font-bold text-slate-700">
                        {Number(safe.maxSafetyLimit || 100000).toLocaleString()} {isAr ? 'ج.م' : 'EGP'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                {isGeneralAdmin && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenEditSafe(safe)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>{isAr ? 'تعديل الإعدادات' : 'Edit Settings'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CREATE / EDIT SAFE MODAL */}
      {safeModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-auto max-h-[92vh] flex flex-col text-start">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
                  <Vault className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {safeModal.isEdit ? (isAr ? 'تعديل إعدادات الخزينة' : 'Edit Vault Settings') : (isAr ? 'إنشاء خزينة نقدية جديدة' : 'Create New Cash Vault')}
                  </h3>
                  <span className="font-mono text-xs text-slate-400 font-bold">{safeModal.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSafeModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSafe} className="flex-1 flex flex-col overflow-hidden text-xs">
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم الخزينة (عربي):' : 'Vault Name (Arabic):'} *
                </label>
                <input
                  type="text"
                  required
                  value={safeModal.nameAr}
                  onChange={(e) => setSafeModal((prev) => ({ ...prev, nameAr: e.target.value }))}
                  placeholder={isAr ? 'مثال: خزينة المبيعات الرئيسية' : 'e.g., Main Sales Vault'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم الخزينة (إنجليزي):' : 'Vault Name (English):'}
                </label>
                <input
                  type="text"
                  value={safeModal.nameEn}
                  onChange={(e) => setSafeModal((prev) => ({ ...prev, nameEn: e.target.value }))}
                  placeholder="e.g., Main Sales Vault"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Color Theme Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  {isAr ? 'اللون المميز للخزينة:' : 'Vault Theme Color:'}
                </label>
                <div className="flex items-center gap-2">
                  {SAFE_COLORS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setSafeModal((prev) => ({ ...prev, color: col.id }))}
                      className={`w-7 h-7 rounded-xl ${col.bgClass} transition-transform ${
                        safeModal.color === col.id ? 'scale-125 ring-2 ring-slate-900 ring-offset-2' : 'opacity-70 hover:opacity-100'
                      }`}
                      title={isAr ? col.nameAr : col.nameEn}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'أمين الخزينة المسؤول:' : 'Vault Custodian:'}
                  </label>
                  <select
                    value={safeModal.responsibleUserId}
                    onChange={(e) => setSafeModal((prev) => ({ ...prev, responsibleUserId: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{isAr ? 'غير محدد' : 'Unassigned'}</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {isAr ? (u.nameAr || u.name) : (u.name || u.nameAr)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {isAr ? 'المعتمد المالي للصرف:' : 'Payment Authorizer:'}
                  </label>
                  <select
                    value={safeModal.authorizerUserId}
                    onChange={(e) => setSafeModal((prev) => ({ ...prev, authorizerUserId: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{isAr ? 'غير محدد (يعتمد بالمعتمدين العموميين)' : 'Unassigned (General Authorizers)'}</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {isAr ? (u.nameAr || u.name) : (u.name || u.nameAr)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {isAr ? 'حد الأمان الأقصى للرصيد (ج.م):' : 'Max Safety Limit (EGP):'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={safeModal.maxSafetyLimit}
                  onChange={(e) => setSafeModal((prev) => ({ ...prev, maxSafetyLimit: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {safeModal.isEdit && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={safeModal.isActive}
                      onChange={(e) => setSafeModal((prev) => ({ ...prev, isActive: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      {isAr ? 'الخزينة نشطة ومتاحة للتعاملات' : 'Vault is active'}
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setSafeModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmittingSafe}
                className="flex items-center gap-1.5 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs shadow-md transition cursor-pointer disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isSubmittingSafe ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الخزينة' : 'Save Vault')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
);
}
