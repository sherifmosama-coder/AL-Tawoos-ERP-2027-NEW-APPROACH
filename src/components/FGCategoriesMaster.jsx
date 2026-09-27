import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import {
  Boxes,
  Search,
  Plus,
  Edit2,
  Trash2,
  Package,
  Layers,
  CheckCircle2,
  X,
  ArrowUpDown
} from 'lucide-react';

const DEFAULT_FG_CATEGORIES = [
  { id: 'white_o', key: 'white_o', sortOrder: 1, nameAr: 'خل أبيض اقتصادي وتجاري', nameEn: 'White Vinegar' },
  { id: 'apple_cider', key: 'apple_cider', sortOrder: 2, nameAr: 'خل تفاح طبيعي ومنكّه', nameEn: 'Apple Cider Vinegar' },
  { id: 'cleaner', key: 'cleaner', sortOrder: 3, nameAr: 'منظفات ومعقمات منزلية', nameEn: 'Cleaners & Disinfectants' },
  { id: 'sauce', key: 'sauce', sortOrder: 4, nameAr: 'صلصات ومتبلات غذائية', nameEn: 'Sauces & Condiments' },
];

export default function FGCategoriesMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [categories, setCategories] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    id: '',
    key: '',
    sortOrder: 1,
    nameAr: '',
    nameEn: '',
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Live subscribe to finished_product_categories
  useEffect(() => {
    const unsubCats = onSnapshot(collection(db, 'finished_product_categories'), async (snap) => {
      if (snap.empty) {
        const batch = writeBatch(db);
        DEFAULT_FG_CATEGORIES.forEach((cat) => {
          batch.set(doc(db, 'finished_product_categories', cat.id), {
            ...cat,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } else {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        list.sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
        setCategories(list);
      }
    });

    // 2. Live subscribe to finished_products to calculate linked products count
    const unsubProducts = onSnapshot(collection(db, 'finished_products'), (snap) => {
      setProductsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubCats();
      unsubProducts();
    };
  }, []);

  // Compute product count per category / production line
  const productCountByCat = useMemo(() => {
    const map = {};
    productsList.forEach((p) => {
      const line = p.productionLine || p.categoryId;
      if (line) {
        map[line] = (map[line] || 0) + 1;
      }
    });
    return map;
  }, [productsList]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const term = searchTerm.toLowerCase();
      const matchNameAr = (c.nameAr || '').toLowerCase().includes(term);
      const matchNameEn = (c.nameEn || '').toLowerCase().includes(term);
      const matchKey = (c.key || c.id || '').toLowerCase().includes(term);
      return matchNameAr || matchNameEn || matchKey;
    });
  }, [categories, searchTerm]);

  // Open modal for add
  const handleOpenAdd = () => {
    const maxSort = categories.length > 0 ? Math.max(...categories.map((c) => Number(c.sortOrder) || 0)) : 0;
    setEditingCatId(null);
    setFormData({
      id: '',
      key: '',
      sortOrder: maxSort + 1,
      nameAr: '',
      nameEn: '',
    });
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (cat) => {
    setEditingCatId(cat.id);
    setFormData({
      id: cat.id,
      key: cat.key || cat.id,
      sortOrder: cat.sortOrder || 1,
      nameAr: cat.nameAr || '',
      nameEn: cat.nameEn || '',
    });
    setIsModalOpen(true);
  };

  // Save handler
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم تصنيف المنتج التام بالعربية.' : 'Please enter FG category name in Arabic.');
      return;
    }

    const catKey = (formData.key || formData.nameAr)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_') || `line_${Date.now()}`;
    const docId = editingCatId || catKey;

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'finished_product_categories', docId),
        {
          id: docId,
          key: docId,
          sortOrder: Number(formData.sortOrder) || 1,
          nameAr: formData.nameAr.trim(),
          nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setIsModalOpen(false);
      showToast(isAr ? 'تم حفظ تصنيف المنتج التام بنجاح' : 'FG category saved successfully');
    } catch (err) {
      console.error('Error saving FG category:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التصنيف.' : 'Failed to save category.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handler with safety check
  const handleDelete = async (catId) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'حذف تصنيفات المنتج التام مقتصر على المسؤول العام فقط.' : 'Only General Admin can delete FG categories.');
      return;
    }

    const count = productCountByCat[catId] || 0;
    if (count > 0) {
      alert(
        isAr
          ? `لا يمكن حذف هذا التصنيف لأنه مرتبط بـ (${count}) منتج تام مسجل في خطوط الإنتاج.`
          : `Cannot delete FG category. Linked to (${count}) registered finished products.`
      );
      return;
    }

    if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا التصنيف نهائياً؟' : 'Permanently delete this FG category?')) {
      try {
        await deleteDoc(doc(db, 'finished_product_categories', catId));
        showToast(isAr ? 'تم حذف التصنيف بنجاح' : 'FG category deleted successfully');
      } catch (err) {
        console.error('Error deleting FG category:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف التصنيف.' : 'Failed to delete category.');
      }
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

      {/* KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-xs text-slate-500 font-bold mb-1">
            {isAr ? 'إجمالي خطوط وتصنيفات التام' : 'Total FG Categories'}
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {categories.length}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-xs text-slate-500 font-bold mb-1">
            {isAr ? 'إجمالي المنتجات التامة المسجلة' : 'Total Finished Products'}
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {productsList.length}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-xs text-slate-500 font-bold mb-1">
            {isAr ? 'حالة الترتيب والفرز' : 'Sort Sequence'}
          </div>
          <div className="text-2xl font-black text-indigo-700 font-mono">
            {isAr ? 'تصاعدي تلقائي' : 'Ascending'}
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <input
            type="text"
            placeholder={isAr ? 'بحث بكود الخط أو اسم التصنيف...' : 'Search by code or category name...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {isGeneralAdmin && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إضافة تصنيف منتج تام' : 'Add FG Category'}</span>
          </button>
        )}
      </div>

      {/* Categories Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="p-3 text-start">{isAr ? 'الترتيب' : 'Sort'}</th>
              <th className="p-3 text-start">{isAr ? 'كود التصنيف / الخط' : 'Line Key'}</th>
              <th className="p-3 text-start">{isAr ? 'اسم التصنيف (عربي)' : 'Category Name (Ar)'}</th>
              <th className="p-3 text-start">{isAr ? 'اسم التصنيف (إنجليزي)' : 'Category Name (En)'}</th>
              <th className="p-3 text-center">{isAr ? 'المنتجات المرتبطة' : 'Linked Products'}</th>
              {isGeneralAdmin && <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCategories.length === 0 ? (
              <tr>
                <td colSpan={isGeneralAdmin ? 6 : 5} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد تصنيفات مطابقة للبحث.' : 'No FG categories found.'}
                </td>
              </tr>
            ) : (
              filteredCategories.map((cat) => {
                const linkedCount = productCountByCat[cat.id] || productCountByCat[cat.key] || 0;
                return (
                  <tr key={cat.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono font-bold text-slate-600">
                      #{cat.sortOrder || 1}
                    </td>
                    <td className="p-3 font-mono font-bold text-indigo-700">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800">
                        {cat.key || cat.id}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      {cat.nameAr}
                    </td>
                    <td className="p-3 text-slate-600 font-medium">
                      {cat.nameEn || cat.nameAr}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                        linkedCount > 0
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {linkedCount}
                      </span>
                    </td>
                    {isGeneralAdmin && (
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(cat)}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title={isAr ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900">
                {editingCatId ? (isAr ? 'تعديل تصنيف منتج تام' : 'Edit FG Category') : (isAr ? 'إضافة تصنيف منتج تام جديد' : 'Add New FG Category')}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'كود الفئة / الخط (Key)' : 'Line Key'}
                  </label>
                  <input
                    type="text"
                    value={formData.key}
                    disabled={Boolean(editingCatId)}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                    placeholder="e.g. white_o"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'ترتيب الظهور' : 'Sort Order'}
                  </label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم التصنيف (عربي)' : 'Category Name (Ar)'} *
                </label>
                <input
                  type="text"
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  placeholder={isAr ? 'مثال: خل أبيض اقتصادي وتجاري' : 'e.g. White Vinegar'}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم التصنيف (إنجليزي)' : 'Category Name (En)'}
                </label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="e.g. White Vinegar"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ البيانات' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
