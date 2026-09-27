import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  serverTimestamp
} from 'firebase/firestore';
import {
  Settings,
  Building2,
  Database,
  SlidersHorizontal,
  CheckCircle2,
  Save,
  ShieldCheck,
  Server,
  Layers
} from 'lucide-react';
import { MASTER_COLLECTIONS_REGISTRY, COLLECTION_DISPLAY_NAMES } from './AdminControlPanel';

export default function SystemConfigMaster({
  currentUser = {},
  permissions = {},
  onOpenTabAppearance = () => {},
  onOpenPermissionsMatrix = () => {}
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [companyProfile, setCompanyProfile] = useState({
    tradeNameAr: 'شركة الطاووس للصناعات الغذائية والتعبئة',
    tradeNameEn: 'Tawoos Food Industries & Packaging S.A.E',
    legalName: 'شركة الطاووس للصناعات الغذائية والتعبئة ش.م.م',
    taxCardNumber: '104-822-910',
    commercialRegister: '104822',
    taxDistrict: 'مأمورية ضرائب الشركات المساهمة - 6 أكتوبر',
    registeredAddress: 'المنطقة الصناعية الثالثة - قطعة 14/ب - مدينة 6 أكتوبر - الجيزة',
    baseCurrency: 'EGP',
    decimalPrecision: 2,
    fiscalYearStart: '01-01',
    standardShiftHours: 8,
    contactEmail: 'operations@tawoos.com',
    contactPhone: '+20 2 3833 0000',
  });

  const [collectionCounts, setCollectionCounts] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Live subscribe to company_profile doc in system_config
  useEffect(() => {
    const unsubProfile = onSnapshot(doc(db, 'system_config', 'company_profile'), (snap) => {
      if (snap.exists()) {
        setCompanyProfile((prev) => ({ ...prev, ...snap.data() }));
      }
    });

    // 2. Live subscribe to the 12 master collections for real-time counts
    const unsubs = MASTER_COLLECTIONS_REGISTRY.map((collName) => {
      return onSnapshot(collection(db, collName), (snap) => {
        setCollectionCounts((prev) => ({ ...prev, [collName]: snap.size }));
      }, (err) => {
        console.warn(`Could not count collection ${collName}:`, err.message);
      });
    });

    return () => {
      unsubProfile();
      unsubs.forEach((u) => u && u());
    };
  }, []);

  // Save company profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!isGeneralAdmin) {
      alert(isAr ? 'تعديل بيانات الشركة مقتصر على المسؤول العام فقط.' : 'Only General Admin can update organization settings.');
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'system_config', 'company_profile'),
        {
          ...companyProfile,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.id || 'admin',
        },
        { merge: true }
      );
      showToast(isAr ? 'تم حفظ إعدادات وتهيئة النظام بنجاح' : 'System configuration saved successfully');
    } catch (err) {
      console.error('Error saving system config:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ الإعدادات.' : 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 start-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold border border-slate-700 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl shadow-sm border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white/10 rounded-xl border border-white/10">
            <Database className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-extrabold">
              {isAr ? 'تهيئة النظام والبيانات الأساسية (MDM)' : 'System Configuration & Master Data (MDM)'}
            </h2>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              {isAr
                ? 'إدارة الهوية القانونية للمنشأة، وضبط المؤشرات التشغيلية، ومراقبة صحة مجموعات البيانات الأساسية الـ ١٢.'
                : 'Manage legal organizational profile, operational defaults, and monitor live telemetry for the 12 master collections.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-mono text-xs font-bold">
            v2.8.0 Enterprise SSOT
          </span>
        </div>
      </div>

      {/* Grid: Company Profile Form & Live Master Collections Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Organization Profile & Financial Identity (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-600" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'البيانات الرسمية والملف القانوني للمنشأة' : 'Legal Entity & Commercial Credentials'}
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">
                {isAr ? 'مستندات التوريد والفواتير' : 'Invoicing & Tax Compliance'}
              </span>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم الشهرة التجاري (عربي)' : 'Trade Name (Arabic)'} *
                  </label>
                  <input
                    type="text"
                    value={companyProfile.tradeNameAr}
                    disabled={!isGeneralAdmin}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, tradeNameAr: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم الشهرة التجاري (إنجليزي)' : 'Trade Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={companyProfile.tradeNameEn}
                    disabled={!isGeneralAdmin}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, tradeNameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم الممول القانوني المسجل' : 'Legal Taxpayer Registered Name'} *
                </label>
                <input
                  type="text"
                  value={companyProfile.legalName}
                  disabled={!isGeneralAdmin}
                  onChange={(e) => setCompanyProfile({ ...companyProfile, legalName: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم البطاقة الضريبية' : 'Tax Card Number'}
                  </label>
                  <input
                    type="text"
                    value={companyProfile.taxCardNumber}
                    disabled={!isGeneralAdmin}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, taxCardNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم السجل التجاري' : 'Commercial Register'}
                  </label>
                  <input
                    type="text"
                    value={companyProfile.commercialRegister}
                    disabled={!isGeneralAdmin}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, commercialRegister: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'المأمورية التابع لها' : 'Tax District'}
                  </label>
                  <input
                    type="text"
                    value={companyProfile.taxDistrict}
                    disabled={!isGeneralAdmin}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, taxDistrict: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'العنوان والمقر الرئيسي للمصنع' : 'Factory Registered Address'}
                </label>
                <input
                  type="text"
                  value={companyProfile.registeredAddress}
                  disabled={!isGeneralAdmin}
                  onChange={(e) => setCompanyProfile({ ...companyProfile, registeredAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'البريد الإلكتروني للعمليات' : 'Operations Contact Email'}
                  </label>
                  <input
                    type="email"
                    value={companyProfile.contactEmail}
                    disabled={!isGeneralAdmin}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'الهاتف الرئيسي' : 'Main Phone'}
                  </label>
                  <input
                    type="tel"
                    value={companyProfile.contactPhone}
                    disabled={!isGeneralAdmin}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Operational Defaults */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="font-extrabold text-xs text-slate-800 mb-3">
                  {isAr ? 'المحددات التشغيلية والحسابية' : 'Operational & Accounting Defaults'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'العملة الأساسية' : 'Base Currency'}
                    </label>
                    <input
                      type="text"
                      value={companyProfile.baseCurrency}
                      disabled
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'عدد الخانات العشرية' : 'Decimal Precision'}
                    </label>
                    <input
                      type="number"
                      value={companyProfile.decimalPrecision}
                      disabled={!isGeneralAdmin}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, decimalPrecision: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isAr ? 'ساعات الوردية القياسية' : 'Standard Shift Hours'}
                    </label>
                    <input
                      type="number"
                      value={companyProfile.standardShiftHours}
                      disabled={!isGeneralAdmin}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, standardShiftHours: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {isGeneralAdmin && (
                <div className="pt-3 border-t border-slate-200 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-xs disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ إعدادات المنشأة' : 'Save Organization Profile')}</span>
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column: Live Master Collections Telemetry (12 Master Collections) */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-600" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'مصفوفة البيانات الأساسية (١٢)' : 'Master Collections (12)'}
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono font-bold text-[10px]">
                Live Cloud Sync
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {isAr
                ? 'الحالة الفورية لعدد السجلات المعتمدة في المجموعات الـ ١٢ الأساسية للنظام.'
                : 'Real-time telemetry showing verified records in the 12 master collections.'}
            </p>

            <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto pe-1 text-xs">
              {MASTER_COLLECTIONS_REGISTRY.map((collKey, idx) => {
                const meta = COLLECTION_DISPLAY_NAMES[collKey] || {};
                const count = collectionCounts[collKey] || 0;
                return (
                  <div key={collKey} className="py-2 flex items-center justify-between gap-2 hover:bg-slate-50/60 px-1 rounded-lg transition">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">
                          {isAr ? meta.ar || collKey : meta.en || collKey}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          {collKey}
                        </div>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold text-xs shrink-0">
                      {count} {isAr ? 'سجل' : 'docs'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
