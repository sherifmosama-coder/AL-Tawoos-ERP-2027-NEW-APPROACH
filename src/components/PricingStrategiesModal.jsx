import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  SlidersHorizontal,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Palette,
  Sparkles,
  Award,
  Layers,
  Tag,
  Boxes,
  Store,
  ChefHat,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { SEGMENT_ICON_MAP, SEGMENT_ICONS_METADATA } from './ClientSegmentsMaster';
import { DEFAULT_PRICING_STRATEGIES } from '../utils/pricingEngine';

// Preset Color Swatches for Quick Strategy Theming
const PRESET_COLORS = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#d97706', // Amber
  '#7c3aed', // Purple
  '#e11d48', // Rose
  '#0891b2', // Cyan
  '#4f46e5', // Indigo
  '#ea580c', // Orange
  '#0d9488', // Teal
  '#475569'  // Slate
];

/**
 * Standardized Pricing Strategy Badge Component
 * Used across Client Master, Price Lists, and Order views.
 */
export function PricingStrategyBadge({
  strategyId = '',
  strategies = [],
  customStrategy = null,
  className = '',
  isAr = true
}) {
  const strat =
    customStrategy ||
    strategies.find((s) => s.id === strategyId) ||
    DEFAULT_PRICING_STRATEGIES.find((s) => s.id === strategyId) || {
      id: strategyId,
      nameAr: strategyId || 'غير محدد',
      nameEn: strategyId || 'Unassigned',
      color: '#64748b',
      icon: 'Tag'
    };

  const IconComponent = SEGMENT_ICON_MAP[strat.icon] || Tag;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition shadow-2xs ${className}`}
      style={{
        backgroundColor: `${strat.color}15`,
        color: strat.color,
        border: `1px solid ${strat.color}35`
      }}
      title={isAr ? strat.nameAr : strat.nameEn}
    >
      <IconComponent className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate max-w-[130px]">{isAr ? strat.nameAr : strat.nameEn}</span>
    </span>
  );
}

/**
 * Modal to configure and manage Pricing Strategies.
 */
export default function PricingStrategiesModal({
  isOpen = false,
  onClose = () => {},
  isAr = true,
  canManage = true
}) {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingStrategy, setEditingStrategy] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    nameAr: '',
    nameEn: '',
    color: '#2563eb',
    icon: 'Boxes',
    isSpecialPricing: false,
    description: ''
  });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Real-time Firestore sync and initial seeding
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pricing_strategies'), async (snap) => {
      if (snap.empty) {
        // Auto-seed default strategies
        try {
          for (const s of DEFAULT_PRICING_STRATEGIES) {
            await setDoc(doc(db, 'pricing_strategies', s.id), {
              ...s,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error('Error auto-seeding default pricing strategies:', e);
        }
      } else {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort: system first, then by Arabic name
        loaded.sort((a, b) => {
          if (a.isSystem && !b.isSystem) return -1;
          if (!a.isSystem && b.isSystem) return 1;
          return (a.nameAr || '').localeCompare(b.nameAr || '', 'ar');
        });
        setStrategies(loaded);
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const handleOpenAddForm = () => {
    setEditingStrategy(null);
    setFormData({
      id: '',
      nameAr: '',
      nameEn: '',
      color: '#2563eb',
      icon: 'Boxes',
      isSpecialPricing: false,
      description: ''
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (strat) => {
    setEditingStrategy(strat);
    setFormData({
      id: strat.id,
      nameAr: strat.nameAr || '',
      nameEn: strat.nameEn || '',
      color: strat.color || '#2563eb',
      icon: strat.icon || 'Boxes',
      isSpecialPricing: Boolean(strat.isSpecialPricing),
      description: strat.description || ''
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSaveStrategy = async (e) => {
    e.preventDefault();
    if (!formData.nameAr.trim()) {
      setFormError(isAr ? 'يرجى إدخال اسم الاستراتيجية بالعربية' : 'Please enter Arabic strategy name');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const stratId =
        editingStrategy?.id ||
        formData.id.trim().toLowerCase().replace(/\s+/g, '_') ||
        `strat_${Date.now()}`;

      const payload = {
        nameAr: formData.nameAr.trim(),
        nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
        color: formData.color || '#2563eb',
        icon: formData.icon || 'Boxes',
        isSpecialPricing: Boolean(formData.isSpecialPricing),
        description: formData.description.trim(),
        isSystem: editingStrategy ? Boolean(editingStrategy.isSystem) : false,
        updatedAt: serverTimestamp()
      };

      if (!editingStrategy) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'pricing_strategies', stratId), payload, { merge: true });
      setIsFormOpen(false);
      setEditingStrategy(null);
    } catch (err) {
      console.error('Error saving pricing strategy:', err);
      setFormError(isAr ? 'حدث خطأ أثناء حفظ الاستراتيجية' : 'Error saving pricing strategy');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStrategy = async (stratId) => {
    try {
      await deleteDoc(doc(db, 'pricing_strategies', stratId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting pricing strategy:', err);
      alert(isAr ? 'تعذر حذف الاستراتيجية' : 'Failed to delete strategy');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate__animated animate__fadeInUp animate__faster">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <SlidersHorizontal className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-black">
                {isAr ? 'إعداد استراتيجيات التسعير' : 'Configure Pricing Strategies'}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {isAr ? 'تخصيص تصنيفات وهوية بطاقات الأسعار في النظام' : 'Manage strategy labels, themes, and badges'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Action Header */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? `الاستراتيجيات المسجلة (${strategies.length})` : `Registered Strategies (${strategies.length})`}
            </span>
            {canManage && !isFormOpen && (
              <button
                type="button"
                onClick={handleOpenAddForm}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة استراتيجية جديدة' : 'Add Strategy'}</span>
              </button>
            )}
          </div>

          {/* Create / Edit Form Drawer */}
          {isFormOpen && (
            <form onSubmit={handleSaveStrategy} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black text-slate-800">
                  {editingStrategy
                    ? (isAr ? 'تعديل الاستراتيجية' : 'Edit Strategy')
                    : (isAr ? 'إضافة استراتيجية تسعير جديدة' : 'New Pricing Strategy')}
                </span>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-200">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Arabic Name */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">
                    {isAr ? 'اسم الاستراتيجية (عربي) *' : 'Strategy Name (Ar) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    placeholder={isAr ? 'مثال: أسعار جملة' : 'e.g. Wholesale'}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* English Name */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">
                    {isAr ? 'الاسم بالإنجليزية' : 'Strategy Name (En)'}
                  </label>
                  <input
                    type="text"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    placeholder="e.g. Wholesale Standard"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Special Pricing Designation Toggle */}
              <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="specialPricingToggle"
                  checked={formData.isSpecialPricing}
                  onChange={(e) => setFormData({ ...formData, isSpecialPricing: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded text-purple-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="specialPricingToggle" className="cursor-pointer select-none">
                  <span className="block text-xs font-black text-purple-900">
                    {isAr ? 'استراتيجية أسعار خاصة للعملاء (Special Client Pricing)' : 'Special Client Pricing Strategy'}
                  </span>
                  <span className="block text-[11px] text-purple-700 leading-relaxed mt-0.5">
                    {isAr
                      ? 'الاستراتيجيات الخاصة تُدار على مستوى العميل أو الفرع، وتسمح بتسعير المنتجات الخاصة (Private Label).'
                      : 'Special pricing applies per client/branch and permits Private Label finished products.'}
                  </span>
                </label>
              </div>

              {/* Color Swatch Picker */}
              <div>
                <label className="block text-slate-600 font-bold text-xs mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-blue-600" />
                  <span>{isAr ? 'اللون والسمة البصرية:' : 'Theme Color:'}</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: col })}
                      className={`w-7 h-7 rounded-xl transition cursor-pointer border-2 flex items-center justify-center ${
                        formData.color === col ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: col }}
                    >
                      {formData.color === col && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5 ms-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0"
                    />
                    <span className="font-mono text-xs font-bold text-slate-500 uppercase">{formData.color}</span>
                  </div>
                </div>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="block text-slate-600 font-bold text-xs mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isAr ? 'الأيقونة الرمزية:' : 'Badge Icon:'}</span>
                </label>
                <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 max-h-36 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                  {SEGMENT_ICONS_METADATA.slice(0, 36).map((item) => {
                    const IconCmp = SEGMENT_ICON_MAP[item.key] || Tag;
                    const isSelected = formData.icon === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: item.key })}
                        className={`p-2 rounded-xl border transition flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-2xs'
                            : 'border-slate-100 text-slate-600 hover:bg-slate-50'
                        }`}
                        title={isAr ? item.labelAr : item.labelEn}
                      >
                        <IconCmp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Badge Preview */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400">{isAr ? 'معاينة البطاقة:' : 'Badge Preview:'}</span>
                  <PricingStrategyBadge
                    customStrategy={{
                      nameAr: formData.nameAr || (isAr ? 'اسم الاستراتيجية' : 'Strategy'),
                      nameEn: formData.nameEn || 'Strategy',
                      color: formData.color,
                      icon: formData.icon
                    }}
                    isAr={isAr}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'حفظ' : 'Save'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Strategies List */}
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs font-bold">
              {isAr ? 'جاري تحميل الاستراتيجيات...' : 'Loading strategies...'}
            </div>
          ) : strategies.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-bold">
              {isAr ? 'لا توجد استراتيجيات مسجلة' : 'No strategies found'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {strategies.map((strat) => (
                <div
                  key={strat.id}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PricingStrategyBadge customStrategy={strat} isAr={isAr} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">{strat.id}</span>
                        {strat.isSystem && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {isAr ? 'افتراضي' : 'System'}
                          </span>
                        )}
                        {strat.isSpecialPricing && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                            {isAr ? 'أسعار خاصة' : 'Special Pricing'}
                          </span>
                        )}
                      </div>
                      {strat.description && (
                        <p className="text-[11px] text-slate-500 truncate max-w-sm mt-0.5">{strat.description}</p>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(strat)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        title={isAr ? 'تعديل الاستراتيجية' : 'Edit'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {!strat.isSystem && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(strat.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title={isAr ? 'حذف الاستراتيجية' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Alert */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="font-black text-slate-800 text-sm">
              {isAr ? 'تأكيد حذف الاستراتيجية؟' : 'Confirm Strategy Deletion?'}
            </h4>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'سيتم حذف هذه الاستراتيجية من قوائم الاختيار. العملاء المرتبطين بها لن يتأثروا فورياً.'
                : 'This strategy will be removed. Clients linked to it will not be modified immediately.'}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStrategy(deleteConfirmId)}
                className="px-4 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 cursor-pointer"
              >
                {isAr ? 'حذف نهائي' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
