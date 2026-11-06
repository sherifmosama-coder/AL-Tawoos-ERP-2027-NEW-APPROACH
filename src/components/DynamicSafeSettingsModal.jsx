import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Settings,
  PlusCircle,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Palette,
  Vault,
  Edit2,
  Check
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

const SAFE_COLORS = [
  { id: 'blue', nameAr: 'أزرق كلاسيكي', nameEn: 'Royal Blue', bgClass: 'bg-blue-600', ringClass: 'ring-blue-500' },
  { id: 'emerald', nameAr: 'أخضر زمردي', nameEn: 'Emerald Green', bgClass: 'bg-emerald-600', ringClass: 'ring-emerald-500' },
  { id: 'amber', nameAr: 'كهرماني ذهبي', nameEn: 'Golden Amber', bgClass: 'bg-amber-600', ringClass: 'ring-amber-500' },
  { id: 'purple', nameAr: 'بنفسجي ملكي', nameEn: 'Imperial Purple', bgClass: 'bg-purple-600', ringClass: 'ring-purple-500' },
  { id: 'rose', nameAr: 'وردي ياقوتي', nameEn: 'Ruby Rose', bgClass: 'bg-rose-600', ringClass: 'ring-rose-500' },
  { id: 'cyan', nameAr: 'سماوي بحري', nameEn: 'Ocean Cyan', bgClass: 'bg-cyan-600', ringClass: 'ring-cyan-500' },
  { id: 'indigo', nameAr: 'نيلي داكن', nameEn: 'Deep Indigo', bgClass: 'bg-indigo-600', ringClass: 'ring-indigo-500' }
];

export default function DynamicSafeSettingsModal({
  allSafes = [],
  usersList = [],
  currentUser,
  isOpen,
  onClose,
  onSuccess
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'create'
  const [selectedSafe, setSelectedSafe] = useState(null);

  // New Safe Form State
  const [newSafeNameAr, setNewSafeNameAr] = useState('');
  const [newSafeNameEn, setNewSafeNameEn] = useState('');
  const [newSafeColor, setNewSafeColor] = useState('blue');
  const [newResponsibleUserId, setNewResponsibleUserId] = useState('');
  const [newAuthorizerUserId, setNewAuthorizerUserId] = useState('');
  const [newMaxLimit, setNewMaxLimit] = useState(100000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  if (!isOpen || !isGeneralAdmin) return null;

  // Handle Create New Safe
  const handleCreateSafe = async (e) => {
    e.preventDefault();
    if (!newSafeNameAr.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال اسم الخزينة بالعربية' : 'Please enter the vault name in Arabic');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const nextSeq = allSafes.length + 1;
      const safeId = `SAFE-${String(nextSeq).padStart(2, '0')}`;

      const newSafe = {
        id: safeId,
        code: safeId,
        nameAr: newSafeNameAr.trim(),
        nameEn: newSafeNameEn.trim() || newSafeNameAr.trim(),
        color: newSafeColor || 'blue',
        responsibleUserId: newResponsibleUserId || currentUser.id,
        authorizerUserId: newAuthorizerUserId || currentUser.id,
        maxSafetyLimit: Number(newMaxLimit) || 100000,
        currentBalance: 0,
        isBank: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'cash_safes', safeId), newSafe);

      if (onSuccess) onSuccess(newSafe);
      setActiveTab('list');
      setNewSafeNameAr('');
      setNewSafeNameEn('');
      setNewSafeColor('blue');
      setNewMaxLimit(100000);
    } catch (err) {
      console.error('Error creating safe:', err);
      setErrorMsg(err.message || 'Failed to create new safe');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Update Existing Safe Limit
  const handleUpdateLimit = async (safeId, newLimit) => {
    try {
      await updateDoc(doc(db, 'cash_safes', safeId), {
        maxSafetyLimit: Number(newLimit) || 0,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error updating safe limit:', err);
    }
  };

  // Handle Update Safe Custodians
  const handleUpdateCustodians = async (safeId, field, val) => {
    try {
      await updateDoc(doc(db, 'cash_safes', safeId), {
        [field]: val,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error updating safe custodian:', err);
    }
  };

  // Handle Update Safe Color
  const handleUpdateColor = async (safeId, colorId) => {
    try {
      await updateDoc(doc(db, 'cash_safes', safeId), {
        color: colorId,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error updating safe color:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden transition-all my-auto max-h-[92vh] flex flex-col text-start">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
              <Vault className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                {isAr ? 'إدارة وتكوين الخزائن النقدية' : 'Manage Cash Vaults Configuration'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isAr ? 'ضبط حدود الأمان، أمناء العهدة، والألوان المميزة للخزائن' : 'Configure safety limits, custodians, and vault themes'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Subtabs Bar (Strictly 2 tabs for Physical Vaults) */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-2 text-xs font-bold overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => { setActiveTab('list'); setSelectedSafe(null); }}
            className={`py-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'list'
                ? 'border-emerald-600 text-emerald-700 bg-white font-black'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Vault className="h-4 w-4" />
            <span>{isAr ? `سجل الخزائن الحالية (${allSafes.length})` : `Current Safes Registry (${allSafes.length})`}</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('create'); setSelectedSafe(null); }}
            className={`py-3 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'create'
                ? 'border-emerald-600 text-emerald-700 bg-white font-black'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            <span>{isAr ? 'إنشاء خزينة جديدة +' : 'Create New Vault +'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mode 1: Safes List & Configuration */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              <div className="grid gap-3">
                {allSafes.map((safe) => {
                  const safeColorObj = SAFE_COLORS.find((c) => c.id === safe.color) || SAFE_COLORS[0];
                  return (
                    <div
                      key={safe.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-2xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className={`w-3.5 h-3.5 rounded-full ${safeColorObj.bgClass} ring-2 ring-white shadow-xs`} />
                          <div>
                            <div className="font-extrabold text-sm text-slate-900">
                              {isAr ? safe.nameAr : (safe.nameEn || safe.nameAr)}
                              <span className="ms-2 font-mono text-xs text-slate-400 font-normal">({safe.id})</span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              {isAr ? 'الرصيد الدفتري:' : 'Book Balance:'}{' '}
                              <strong className="text-slate-800 font-bold">
                                {Number(safe.balance || safe.currentBalance || 0).toLocaleString()} EGP
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* Color Selector */}
                        <div className="flex items-center gap-1">
                          {SAFE_COLORS.map((col) => (
                            <button
                              key={col.id}
                              type="button"
                              onClick={() => handleUpdateColor(safe.id, col.id)}
                              className={`w-5 h-5 rounded-full ${col.bgClass} transition-transform ${
                                (safe.color || 'blue') === col.id
                                  ? 'scale-125 ring-2 ring-slate-900 ring-offset-1'
                                  : 'opacity-70 hover:opacity-100 hover:scale-110'
                              }`}
                              title={isAr ? col.nameAr : col.nameEn}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Config Inputs: Ceiling & Custodian */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 text-xs">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            {isAr ? 'حد الأمان الأقصى (ج.م):' : 'Max Safety Limit (EGP):'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            defaultValue={safe.maxSafetyLimit || 100000}
                            onBlur={(e) => handleUpdateLimit(safe.id, e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-800 focus:bg-white focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            {isAr ? 'أمين الخزينة المسؤول:' : 'Vault Custodian:'}
                          </label>
                          <select
                            defaultValue={safe.responsibleUserId || ''}
                            onChange={(e) => handleUpdateCustodians(safe.id, 'responsibleUserId', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:bg-white focus:ring-1 focus:ring-emerald-500"
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
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            {isAr ? 'المعتمد المالي للصرف:' : 'Payment Authorizer:'}
                          </label>
                          <select
                            defaultValue={safe.authorizerUserId || ''}
                            onChange={(e) => handleUpdateCustodians(safe.id, 'authorizerUserId', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold focus:bg-white focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">{isAr ? 'غير محدد' : 'Unassigned'}</option>
                            {usersList.map((u) => (
                              <option key={u.id} value={u.id}>
                                {isAr ? (u.nameAr || u.name) : (u.name || u.nameAr)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mode 2: Create New Safe Form */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSafe} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم الخزينة (بالعربية) *:' : 'Safe Name (Arabic) *:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newSafeNameAr}
                    onChange={(e) => setNewSafeNameAr(e.target.value)}
                    placeholder={isAr ? 'مثال: خزينة المبيعات والتوزيع' : 'e.g. Sales Vault'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم الخزينة (بالإنجليزية):' : 'Safe Name (English):'}
                  </label>
                  <input
                    type="text"
                    value={newSafeNameEn}
                    onChange={(e) => setNewSafeNameEn(e.target.value)}
                    placeholder="e.g. Sales & Distribution Vault"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'السمة اللونية المميزة للخزينة:' : 'Vault Theme Color:'}
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {SAFE_COLORS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setNewSafeColor(col.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        newSafeColor === col.id
                          ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${col.bgClass}`} />
                      <span>{isAr ? col.nameAr : col.nameEn}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'أمين الخزينة المسؤول:' : 'Vault Custodian:'}
                  </label>
                  <select
                    value={newResponsibleUserId}
                    onChange={(e) => setNewResponsibleUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  >
                    <option value="">{isAr ? 'اختر أمين الخزينة...' : 'Select Custodian...'}</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {isAr ? (u.nameAr || u.name) : (u.name || u.nameAr)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'المعتمد المالي للصرف:' : 'Payment Authorizer:'}
                  </label>
                  <select
                    value={newAuthorizerUserId}
                    onChange={(e) => setNewAuthorizerUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  >
                    <option value="">{isAr ? 'اختر المعتمد المالي...' : 'Select Authorizer...'}</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {isAr ? (u.nameAr || u.name) : (u.name || u.nameAr)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الحد الأقصى للنقدية (حد أمان الخزينة ج.م):' : 'Max Cash Ceiling (Safety Limit EGP):'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newMaxLimit}
                  onChange={(e) => setNewMaxLimit(e.target.value)}
                  placeholder="250000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  {isSubmitting ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء وتفعيل الخزينة' : 'Create & Activate Vault')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
