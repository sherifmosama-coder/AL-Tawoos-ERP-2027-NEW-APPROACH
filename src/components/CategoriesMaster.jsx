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
  FolderKanban,
  Search,
  Plus,
  Edit2,
  Trash2,
  Layers,
  Package,
  AlertTriangle,
  CheckCircle2,
  X,
  FileSpreadsheet
} from 'lucide-react';

const DEFAULT_CATEGORIES = [
  { id: 1, base: 100, nameAr: 'كرتون وفوارغ ومواد تعبئة', nameEn: 'Packaging & Empty Boxes' },
  { id: 2, base: 200, nameAr: 'أغطية وكبسولات وشريط لاصق', nameEn: 'Closures, Caps & Tapes' },
  { id: 3, base: 300, nameAr: 'سوائل وكيماويات خام', nameEn: 'Raw Chemical Liquids' },
  { id: 4, base: 400, nameAr: 'بودرة ومواد صلبة', nameEn: 'Raw Chemical Powders' },
  { id: 5, base: 500, nameAr: 'استيكر وبطاقات بيانات', nameEn: 'Stickers & Labels' },
  { id: 6, base: 600, nameAr: 'طبات وسلوفان حماية', nameEn: 'Foils, Liners & Seals' },
  { id: 7, base: 700, nameAr: 'مقابض وإكسسوارات', nameEn: 'Handles & Accessories' },
  { id: 8, base: 800, nameAr: 'طبالي وألواح خشبية', nameEn: 'Pallets & Wooden Decks' },
  { id: 9, base: 900, nameAr: 'قطع غيار ومستهلكات', nameEn: 'Spare Parts & Consumables' },
];

export default function CategoriesMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [categories, setCategories] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    id: '',
    base: '',
    nameAr: '',
    nameEn: '',
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Live subscribe to categories
  useEffect(() => {
    const unsubCats = onSnapshot(collection(db, 'categories'), async (snap) => {
      if (snap.empty) {
        // Auto-seed default categories if empty
        const batch = writeBatch(db);
        DEFAULT_CATEGORIES.forEach((cat) => {
          batch.set(doc(db, 'categories', String(cat.id)), {
            ...cat,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      } else {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
        setCategories(list);
      }
    });

    // 2. Live subscribe to items to calculate linked raw materials count
    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      setItemsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubCats();
      unsubItems();
    };
  }, []);

  // Compute item count per category
  const itemCountByCatId = useMemo(() => {
    const map = {};
    itemsList.forEach((item) => {
      const catId = Number(item.categoryId);
      if (catId) {
        map[catId] = (map[catId] || 0) + 1;
      }
    });
    return map;
  }, [itemsList]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const term = searchTerm.toLowerCase();
      const matchNameAr = (c.nameAr || '').toLowerCase().includes(term);
      const matchNameEn = (c.nameEn || '').toLowerCase().includes(term);
      const matchId = String(c.id).includes(term);
      const matchBase = String(c.base || '').includes(term);
      return matchNameAr || matchNameEn || matchId || matchBase;
    });
  }, [categories, searchTerm]);

  // Open modal for add
  const handleOpenAdd = () => {
    const nextId = categories.length > 0 ? Math.max(...categories.map((c) => Number(c.id) || 0)) + 1 : 1;
    setEditingCatId(null);
    setFormData({
      id: nextId,
      base: nextId * 100,
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
      base: cat.base || Number(cat.id) * 100,
      nameAr: cat.nameAr || '',
      nameEn: cat.nameEn || '',
    });
    setIsModalOpen(true);
  };

  // Save handler
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم المجموعة بالعربية.' : 'Please enter category name in Arabic.');
      return;
    }

    const catIdNum = Number(formData.id);
    const catBaseNum = Number(formData.base) || (catIdNum * 100);

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'categories', String(catIdNum)),
        {
          id: catIdNum,
          base: catBaseNum,
          nameAr: formData.nameAr.trim(),
          nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setIsModalOpen(false);
      showToast(isAr ? 'تم حفظ بيانات المجموعة بنجاح' : 'Category saved successfully');
    } catch (err) {
      console.error('Error saving category:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المجموعة.' : 'Failed to save category.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handler with safety check
  const handleDelete = async (catId) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'حذف المجموعات مقتصر على المسؤول العام فقط.' : 'Only General Admin can delete categories.');
      return;
    }

    const count = itemCountByCatId[Number(catId)] || 0;
    if (count > 0) {
      alert(
        isAr
          ? `لا يمكن حذف هذا التصنيف لأنه مرتبط بـ (${count}) خامة ومستلزم مسجل في كارت الأصناف.`
          : `Cannot delete category. Linked to (${count}) registered raw materials.`
      );
      return;
    }

    if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا التصنيف نهائياً؟' : 'Permanently delete this category?')) {
      try {
        await deleteDoc(doc(db, 'categories', String(catId)));
        showToast(isAr ? 'تم حذف التصنيف بنجاح' : 'Category deleted successfully');
      } catch (err) {
        console.error('Error deleting category:', err);
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
            {isAr ? 'إجمالي مجموعات التكويد' : 'Total Categories'}
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {categories.length}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-xs text-slate-500 font-bold mb-1">
            {isAr ? 'إجمالي الخامات المسجلة' : 'Total Linked Materials'}
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {itemsList.length}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-xs text-slate-500 font-bold mb-1">
            {isAr ? 'قواعد الترقيم المتسلسل' : 'Sequential Base Ranges'}
          </div>
          <div className="text-2xl font-black text-indigo-700 font-mono">
            {categories.length > 0 ? `${categories[0].base || 100} - ${categories[categories.length - 1].base || 900}` : '100 - 900'}
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <input
            type="text"
            placeholder={isAr ? 'بحث برقم الفئة، كود الأساس، أو اسم المجموعة...' : 'Search category by ID, base or name...'}
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
            <span>{isAr ? 'إضافة مجموعة جديدة' : 'Add Category'}</span>
          </button>
        )}
      </div>

      {/* Categories Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="p-3 text-start">{isAr ? 'رقم الفئة (ID)' : 'Cat ID'}</th>
              <th className="p-3 text-start">{isAr ? 'أساس التكويد (Base)' : 'Code Base'}</th>
              <th className="p-3 text-start">{isAr ? 'اسم المجموعة (عربي)' : 'Name (Arabic)'}</th>
              <th className="p-3 text-start">{isAr ? 'اسم المجموعة (إنجليزي)' : 'Name (English)'}</th>
              <th className="p-3 text-center">{isAr ? 'الخامات المرتبطة' : 'Linked Items'}</th>
              {isGeneralAdmin && <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCategories.length === 0 ? (
              <tr>
                <td colSpan={isGeneralAdmin ? 6 : 5} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد مجموعات مطابقة لبحثك.' : 'No categories found.'}
                </td>
              </tr>
            ) : (
              filteredCategories.map((cat) => {
                const linkedCount = itemCountByCatId[Number(cat.id)] || 0;
                return (
                  <tr key={cat.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800">
                        {cat.id}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-indigo-700">
                      {cat.base || Number(cat.id) * 100}
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
                {editingCatId ? (isAr ? 'تعديل مجموعة تكويد' : 'Edit Category') : (isAr ? 'إضافة مجموعة تكويد جديدة' : 'Add New Category')}
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
                    {isAr ? 'رقم الفئة (ID)' : 'Category ID'}
                  </label>
                  <input
                    type="number"
                    value={formData.id}
                    disabled={Boolean(editingCatId)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({
                        ...formData,
                        id: val,
                        base: val ? Number(val) * 100 : ''
                      });
                    }}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'أساس التكويد (Base)' : 'Code Base'}
                  </label>
                  <input
                    type="number"
                    value={formData.base}
                    onChange={(e) => setFormData({ ...formData, base: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم المجموعة (عربي)' : 'Name (Arabic)'} *
                </label>
                <input
                  type="text"
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  placeholder={isAr ? 'مثال: سوائل ومحاليل خام' : 'e.g. Raw Chemical Liquids'}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم المجموعة (إنجليزي)' : 'Name (English)'}
                </label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="e.g. Raw Chemical Liquids"
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
