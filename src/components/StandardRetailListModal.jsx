import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  X,
  Store,
  Trash2,
  Save,
  Boxes,
  Scale,
  AlertTriangle,
  CheckCircle2,
  ClipboardList
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { isProductPrivateLabel } from '../utils/pricingEngine';

/**
 * Modal for configuring the global Standard Retail Load List (`system_config/retail_standard_load_list`).
 * Users with `canManageStdRetailList` set products and default cartons (+ optional bonus) once,
 * then sales reps can populate Retail orders with one click and tweak quantities per branch/trip.
 */
export default function StandardRetailListModal({
  isOpen,
  onClose,
  products = [],
  productCategories = [],
  standardRetailList = [],
  metadata = {},
  canManageStdRetailList = false,
  isAr = true,
  currentUserName = 'مستخدم معتمد',
  currentUserId = 'usr_unknown'
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [draftItems, setDraftItems] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  // Sync draft state whenever the modal opens or remote list changes
  useEffect(() => {
    if (!isOpen) return;
    const prodLookup = {};
    (products || []).forEach((p) => {
      prodLookup[p.id] = p;
    });
    const normalized = (Array.isArray(standardRetailList) ? standardRetailList : [])
      .map((item) => {
        const prod = prodLookup[item.productId];
        const opts = prod?.packagingOptions || [];
        const defaultSuffix = opts.length > 1 ? 'any' : (opts[0]?.suffix || 'A');
        return {
          productId: item.productId,
          packagingOptionSuffix: item.packagingOptionSuffix || defaultSuffix,
          qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
          bonus: Math.max(0, Math.floor(Number(item.bonus) || 0))
        };
      })
      .filter((item) => Boolean(item.productId));
    setDraftItems(normalized);
    setSelectedCategory('all');
    setSelectedProductId('');
    setErrorMsg('');
    setSavedNotice(false);
  }, [isOpen, standardRetailList, products]);

  const productMap = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [products]);

  const addedProductIds = useMemo(
    () => new Set(draftItems.map((i) => i.productId)),
    [draftItems]
  );

  // Exclude already-added products and private-label SKUs unless unrestricted
  const availableProductOptions = useMemo(() => {
    return (products || [])
      .filter((p) => {
        if (addedProductIds.has(p.id)) return false;
        if (selectedCategory !== 'all') {
          const prodCat = p.productionLine || p.categoryId || p.category;
          if (prodCat !== selectedCategory) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aName = isAr ? (a.nameAr || a.nameEn || '') : (a.nameEn || a.nameAr || '');
        const bName = isAr ? (b.nameAr || b.nameEn || '') : (b.nameEn || b.nameAr || '');
        return aName.localeCompare(bName, isAr ? 'ar' : 'en');
      })
      .map((p) => ({
        value: p.id,
        label: isAr ? (p.nameAr || p.nameEn || p.id) : (p.nameEn || p.nameAr || p.id),
        sublabel: p.code || p.id,
        specs: `${p.code || ''} ${p.id} ${p.nameAr || ''} ${p.nameEn || ''}`.toLowerCase(),
        badgeText: isProductPrivateLabel(p) ? (isAr ? 'علامة خاصة' : 'PL') : ''
      }));
  }, [products, addedProductIds, selectedCategory, isAr]);

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalBonus = 0;
    let totalWeightKg = 0;

    draftItems.forEach((item) => {
      const prod = productMap[item.productId];
      const qty = Math.max(0, Number(item.qty) || 0);
      const bonus = Math.max(0, Number(item.bonus) || 0);
      const opts = prod?.packagingOptions || [];
      const primaryOpt = opts[0] || {};
      const matchedOpt =
        item.packagingOptionSuffix && item.packagingOptionSuffix !== 'any'
          ? opts.find((o) => o.suffix === item.packagingOptionSuffix) || primaryOpt
          : primaryOpt;
      const unitWeightKg = Number(matchedOpt.largeUnitWeightKg || primaryOpt.largeUnitWeightKg || prod?.weight || 0);

      totalQty += qty;
      totalBonus += bonus;
      totalWeightKg += (qty + bonus) * unitWeightKg;
    });

    return {
      skuCount: draftItems.length,
      totalQty,
      totalBonus,
      totalTons: totalWeightKg / 1000
    };
  }, [draftItems, productMap]);

  if (!isOpen) return null;

  const handleAddItem = (productId) => {
    if (!productId || !canManageStdRetailList) return;
    if (addedProductIds.has(productId)) {
      setSelectedProductId('');
      return;
    }
    const prod = productMap[productId];
    const opts = prod?.packagingOptions || [];
    const defaultSuffix = opts.length > 1 ? 'any' : (opts[0]?.suffix || 'A');
    setDraftItems((prev) => [...prev, { productId, packagingOptionSuffix: defaultSuffix, qty: 1, bonus: 0 }]);
    setSelectedProductId('');
    setSavedNotice(false);
    setErrorMsg('');
  };

  const handleItemPackingChange = (productId, suffix) => {
    if (!canManageStdRetailList) return;
    setDraftItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, packagingOptionSuffix: suffix || 'any' } : item
      )
    );
    setSavedNotice(false);
  };

  const handleItemQtyChange = (productId, field, rawVal) => {
    if (!canManageStdRetailList) return;
    const minVal = field === 'qty' ? 1 : 0;
    const parsed = Math.max(minVal, Math.floor(Number(rawVal) || 0));
    setDraftItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, [field]: parsed } : item
      )
    );
    setSavedNotice(false);
  };

  const handleRemoveItem = (productId) => {
    if (!canManageStdRetailList) return;
    setDraftItems((prev) => prev.filter((item) => item.productId !== productId));
    setSavedNotice(false);
  };

  const handleSave = async () => {
    if (!canManageStdRetailList || isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    setSavedNotice(false);

    try {
      const sanitized = draftItems
        .filter((i) => Boolean(i.productId) && Number(i.qty) > 0)
        .map((i) => ({
          productId: i.productId,
          packagingOptionSuffix: i.packagingOptionSuffix || 'any',
          qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
          bonus: Math.max(0, Math.floor(Number(i.bonus) || 0))
        }));

      await setDoc(
        doc(db, 'system_config', 'retail_standard_load_list'),
        {
          items: sanitized,
          updatedAt: serverTimestamp(),
          updatedBy: currentUserName,
          updatedById: currentUserId
        },
        { merge: true }
      );

      setSavedNotice(true);
      setTimeout(() => {
        onClose();
      }, 450);
    } catch (err) {
      console.error('Failed to save Standard Retail Load List:', err);
      setErrorMsg(
        isAr
          ? 'تعذر حفظ القائمة القياسية في قاعدة البيانات.'
          : 'Failed to save standard retail load list.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black truncate">
                {isAr ? 'القائمة القياسية لتحميل التجزئة' : 'Standard Retail Load List'}
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                {isAr
                  ? 'اضبط الأصناف والكميات القياسية مرة واحدة لتعبئة طلبات التجزئة بضغطة زر (مع إمكانية التعديل لاحقاً).'
                  : 'Define default products and carton quantities once to auto-fill Retail route orders (editable per order).'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Last Updated Info + Add Bar */}
          {metadata?.updatedBy && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="font-bold">
                {isAr ? `آخر تحديث بواسطة: ${metadata.updatedBy}` : `Last updated by: ${metadata.updatedBy}`}
              </span>
              {metadata.updatedAt && (
                <span className="font-mono text-[10px]">
                  {typeof metadata.updatedAt?.toDate === 'function'
                    ? metadata.updatedAt.toDate().toLocaleString(isAr ? 'ar-EG' : 'en-US')
                    : ''}
                </span>
              )}
            </div>
          )}

          {canManageStdRetailList && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-cyan-600" />
                <span>{isAr ? 'إضافة صنف إلى القائمة القياسية' : 'Add Product to Standard List'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="py-2 px-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="all">{isAr ? 'كافة التصنيفات' : 'All Categories'}</option>
                  {productCategories.map((cat) => (
                    <option key={cat.id} value={cat.key || cat.id}>
                      {isAr ? cat.nameAr : (cat.nameEn || cat.nameAr)}
                    </option>
                  ))}
                </select>

                <div className="flex-1 min-w-[240px]">
                  <SearchableSelect
                    options={availableProductOptions}
                    value={selectedProductId}
                    onChange={handleAddItem}
                    placeholder={isAr ? '— اختر الصنف لإضافته للقائمة —' : '— Select Product to Add —'}
                    searchPlaceholder={isAr ? 'ابحث باسم أو كود الصنف...' : 'Search product name or code...'}
                    isAr={isAr}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Items Table */}
          {draftItems.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-2 bg-slate-50/50">
              <Boxes className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-extrabold text-slate-600">
                {isAr
                  ? 'القائمة القياسية فارغة حالياً'
                  : 'Standard Retail Load List is currently empty'}
              </p>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? 'اختر الأصناف من شريط الإضافة أعلاه وحدد الكمية الافتراضية لكل صنف.'
                  : 'Use the selector above to add products and define default carton quantities.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-600 font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                    <th className="py-2.5 px-3 text-center w-28">{isAr ? 'الكمية (كرتونة)' : 'Qty (Cartons)'}</th>
                    <th className="py-2.5 px-3 text-center w-28">{isAr ? 'البونص (كرتونة)' : 'Bonus (Cartons)'}</th>
                    <th className="py-2.5 px-3 text-center w-24">{isAr ? 'الوزن' : 'Weight'}</th>
                    {canManageStdRetailList && <th className="py-2.5 px-2 w-10"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {draftItems.map((item) => {
                    const prod = productMap[item.productId];
                    const opts = prod?.packagingOptions || [];
                    const primaryOpt = opts[0] || {};
                    const matchedOpt =
                      item.packagingOptionSuffix && item.packagingOptionSuffix !== 'any'
                        ? opts.find((o) => o.suffix === item.packagingOptionSuffix) || primaryOpt
                        : primaryOpt;
                    const unitWeightKg = Number(matchedOpt.largeUnitWeightKg || primaryOpt.largeUnitWeightKg || prod?.weight || 0);
                    const rowTons = ((Number(item.qty) + Number(item.bonus || 0)) * unitWeightKg) / 1000;
                    const displayName = prod
                      ? isAr
                        ? prod.nameAr || prod.nameEn
                        : prod.nameEn || prod.nameAr
                      : item.productId;
                    const hasMultiOptions = opts.length > 1;

                    return (
                      <tr key={item.productId} className="hover:bg-slate-50/80 transition">
                        <td className="py-2 px-3">
                          <div className="flex items-start gap-2">
                            {prod?.imageFile && (
                              <img
                                src={prod.imageFile}
                                alt={displayName}
                                className="w-8 h-8 rounded-lg border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                <span>{displayName}</span>
                                {!prod && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                    {isAr ? 'غير موجود بالكتالوج' : 'Missing SKU'}
                                  </span>
                                )}
                              </div>
                              {prod?.code && (
                                <span className="text-[10px] font-mono text-slate-400">{prod.code}</span>
                              )}
                              {hasMultiOptions && (
                                <div className="mt-1">
                                  <select
                                    disabled={!canManageStdRetailList}
                                    value={item.packagingOptionSuffix || 'any'}
                                    onChange={(e) => handleItemPackingChange(item.productId, e.target.value)}
                                    className="px-2 py-1 text-[11px] font-bold border border-cyan-300 rounded-lg bg-cyan-50/60 text-slate-800 focus:outline-none focus:border-cyan-600 disabled:bg-slate-100"
                                  >
                                    <option value="any">{isAr ? 'أي تعبئة (Any)' : 'Any Packing'}</option>
                                    {opts.map((opt) => (
                                      <option key={opt.suffix} value={opt.suffix}>
                                        {isAr ? (opt.nameAr || `تعبئة ${opt.suffix}`) : (opt.nameEn || opt.nameAr || `Option ${opt.suffix}`)} ({opt.optionCode || `${prod.code}-${opt.suffix}`})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            disabled={!canManageStdRetailList}
                            value={item.qty}
                            onChange={(e) => handleItemQtyChange(item.productId, 'qty', e.target.value)}
                            className="w-20 text-center py-1 px-2 border border-slate-300 rounded-lg font-extrabold text-slate-800 bg-white focus:outline-none focus:border-cyan-500 disabled:bg-slate-100"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={!canManageStdRetailList}
                            value={item.bonus}
                            onChange={(e) => handleItemQtyChange(item.productId, 'bonus', e.target.value)}
                            className="w-20 text-center py-1 px-2 border border-slate-200 rounded-lg font-bold text-slate-700 bg-white focus:outline-none focus:border-cyan-500 disabled:bg-slate-100"
                          />
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-slate-600 whitespace-nowrap">
                          {rowTons.toFixed(2)} {isAr ? 'طن' : 'Tons'}
                        </td>
                        {canManageStdRetailList && (
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.productId)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title={isAr ? 'إزالة الصنف' : 'Remove item'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {savedNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{isAr ? 'تم حفظ القائمة القياسية بنجاح.' : 'Standard retail load list saved.'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold text-slate-700">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200">
              <Boxes className="w-3.5 h-3.5 text-cyan-600" />
              <span>
                {totals.skuCount} {isAr ? 'أصناف' : 'SKUs'} · {totals.totalQty} {isAr ? 'كرتونة' : 'ctn'}
                {totals.totalBonus > 0 ? ` (+${totals.totalBonus} ${isAr ? 'بونص' : 'bonus'})` : ''}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200">
              <Scale className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {totals.totalTons.toFixed(2)} {isAr ? 'طن' : 'Tons'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            {canManageStdRetailList && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'حفظ القائمة القياسية' : 'Save Standard List'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
