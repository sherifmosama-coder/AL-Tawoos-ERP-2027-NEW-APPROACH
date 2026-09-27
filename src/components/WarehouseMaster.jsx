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
  Warehouse,
  Search,
  Plus,
  Edit2,
  Trash2,
  Factory,
  Package,
  AlertOctagon,
  Wrench,
  CheckCircle2,
  X,
  UserCheck
} from 'lucide-react';

const CLASSIFICATION_OPTIONS = [
  { value: 'raw_materials', labelAr: 'مستودع خامات ومستلزمات إنتاج', labelEn: 'Raw Materials Storage', defaultColor: '#059669' },
  { value: 'factory_floor', labelAr: 'صالة الإنتاج والتشغيل (WIP)', labelEn: 'Factory Floor (WIP)', defaultColor: '#d97706' },
  { value: 'finished_goods', labelAr: 'مستودع المنتج التام والتوزيع', labelEn: 'Finished Goods Storage', defaultColor: '#2563eb' },
  { value: 'quarantine_scrap', labelAr: 'مستودع حجر ومعيب وهالك', labelEn: 'Quarantine & Scrap', defaultColor: '#dc2626' },
  { value: 'spare_parts', labelAr: 'مستودع قطع الغيار والمهمات', labelEn: 'Spare Parts & Maintenance', defaultColor: '#ea580c' },
];

const PRESET_COLORS = [
  '#059669', // Emerald
  '#0d9488', // Teal
  '#0284c7', // Sky Blue
  '#2563eb', // Royal Blue
  '#4f46e5', // Indigo
  '#7c3aed', // Purple
  '#d97706', // Amber
  '#ea580c', // Orange
  '#dc2626', // Red
  '#475569', // Slate
];

export default function WarehouseMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [warehouses, setWarehouses] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWhId, setEditingWhId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    id: '',
    code: '',
    nameAr: '',
    nameEn: '',
    classification: 'raw_materials',
    responsibleUserId: '',
    color: '#059669',
    isActive: true,
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Live subscribe to warehouses & users
  useEffect(() => {
    const unsubWh = onSnapshot(collection(db, 'warehouses'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setWarehouses(list);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubWh();
      unsubUsers();
    };
  }, []);

  // Helper to generate next warehouse code
  const generateWarehouseCode = () => {
    const existingNums = warehouses
      .map((w) => {
        const m = (w.code || '').match(/WH-(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : warehouses.length + 1;
    return `WH-${String(nextNum).padStart(2, '0')}`;
  };

  // Filtered warehouses
  const filteredWarehouses = useMemo(() => {
    return warehouses.filter((wh) => {
      const term = searchTerm.toLowerCase();
      const matchCode = (wh.code || '').toLowerCase().includes(term);
      const matchNameAr = (wh.nameAr || '').toLowerCase().includes(term);
      const matchNameEn = (wh.nameEn || '').toLowerCase().includes(term);
      const matchClass = classificationFilter === 'all' || wh.classification === classificationFilter;
      return (matchCode || matchNameAr || matchNameEn) && matchClass;
    });
  }, [warehouses, searchTerm, classificationFilter]);

  // Counts by classification
  const counts = useMemo(() => {
    return {
      total: warehouses.length,
      raw: warehouses.filter((w) => w.classification === 'raw_materials').length,
      floor: warehouses.filter((w) => w.classification === 'factory_floor' || w.isFactoryLinked).length,
      fg: warehouses.filter((w) => w.classification === 'finished_goods').length,
      quarantine: warehouses.filter((w) => w.classification === 'quarantine_scrap').length,
    };
  }, [warehouses]);

  // Open modal for add
  const handleOpenAdd = () => {
    const nextCode = generateWarehouseCode();
    setEditingWhId(null);
    setFormData({
      id: nextCode,
      code: nextCode,
      nameAr: '',
      nameEn: '',
      classification: 'raw_materials',
      responsibleUserId: usersList[0]?.id || '',
      color: '#059669',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (wh) => {
    setEditingWhId(wh.id);
    setFormData({
      id: wh.id || wh.code,
      code: wh.code || wh.id,
      nameAr: wh.nameAr || '',
      nameEn: wh.nameEn || '',
      classification: wh.classification || (wh.isFactoryLinked ? 'factory_floor' : 'raw_materials'),
      responsibleUserId: wh.responsibleUserId || '',
      color: wh.color || '#059669',
      isActive: wh.isActive !== false,
    });
    setIsModalOpen(true);
  };

  // Save warehouse
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nameAr.trim()) {
      alert(isAr ? 'يرجى إدخال اسم المستودع بالعربية.' : 'Please enter warehouse name in Arabic.');
      return;
    }

    const whId = formData.id || formData.code;
    const isFloor = formData.classification === 'factory_floor';

    setIsSaving(true);
    try {
      const batch = writeBatch(db);

      // Exclusive Single Factory Floor rule: If setting this as factory_floor, remove it from all others
      if (isFloor) {
        warehouses.forEach((w) => {
          if (w.id !== whId && (w.classification === 'factory_floor' || w.isFactoryLinked)) {
            batch.set(
              doc(db, 'warehouses', w.id),
              {
                classification: 'raw_materials',
                isFactoryLinked: false,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        });
      }

      batch.set(
        doc(db, 'warehouses', whId),
        {
          code: formData.code.trim().toUpperCase(),
          nameAr: formData.nameAr.trim(),
          nameEn: formData.nameEn.trim(),
          classification: formData.classification,
          isFactoryLinked: isFloor,
          responsibleUserId: formData.responsibleUserId || '',
          color: formData.color || '#059669',
          isActive: Boolean(formData.isActive),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      setIsModalOpen(false);
      showToast(isAr ? 'تم حفظ بيانات المستودع بنجاح' : 'Warehouse saved successfully');
    } catch (err) {
      console.error('Error saving warehouse:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المستودع.' : 'Failed to save warehouse.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete warehouse
  const handleDelete = async (wh) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'حذف المستودعات مقتصر على المسؤول العام فقط.' : 'Only General Admin can delete warehouses.');
      return;
    }

    if (wh.classification === 'factory_floor' || wh.isFactoryLinked) {
      alert(
        isAr
          ? 'لا يمكن حذف صالة الإنتاج الرئيسية (Factory Floor). يرجى تعيين مستودع آخر كصالة أولاً.'
          : 'Cannot delete active Factory Floor. Designate another warehouse as floor first.'
      );
      return;
    }

    if (window.confirm(isAr ? `هل أنت متأكد من حذف المستودع (${wh.nameAr || wh.code})؟` : `Delete warehouse (${wh.code})?`)) {
      try {
        await deleteDoc(doc(db, 'warehouses', wh.id));
        showToast(isAr ? 'تم حذف المستودع بنجاح' : 'Warehouse deleted successfully');
      } catch (err) {
        console.error('Error deleting warehouse:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف المستودع.' : 'Failed to delete warehouse.');
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'إجمالي المستودعات' : 'Total Warehouses'}
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {counts.total}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'مستودعات الخامات' : 'Raw Storage'}
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {counts.raw}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'صالة الإنتاج (Floor)' : 'Factory Floor'}
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono">
            {counts.floor}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'مستودعات التام' : 'Finished Goods'}
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono">
            {counts.fg}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'الحجر والهالك' : 'Quarantine / Scrap'}
          </div>
          <div className="text-2xl font-black text-rose-700 font-mono">
            {counts.quarantine}
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              placeholder={isAr ? 'بحث بالكود، اسم المستودع، أو أمين العهدة...' : 'Search code, name or custodian...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? 'كافة التصنيفات' : 'All Classifications'}</option>
            {CLASSIFICATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {isAr ? opt.labelAr : opt.labelEn}
              </option>
            ))}
          </select>
        </div>

        {isGeneralAdmin && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'إضافة مستودع جديد' : 'Add Warehouse'}</span>
          </button>
        )}
      </div>

      {/* Warehouses Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="p-3 text-start">{isAr ? 'كود المستودع' : 'Code'}</th>
              <th className="p-3 text-start">{isAr ? 'اسم المستودع' : 'Warehouse Name'}</th>
              <th className="p-3 text-start">{isAr ? 'التصنيف التشغيلي' : 'Operational Classification'}</th>
              <th className="p-3 text-start">{isAr ? 'المسؤول / أمين العهدة' : 'Assigned Custodian'}</th>
              <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
              {isGeneralAdmin && <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredWarehouses.length === 0 ? (
              <tr>
                <td colSpan={isGeneralAdmin ? 6 : 5} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا توجد مستودعات مسجلة مطابقة للبحث.' : 'No warehouses found.'}
                </td>
              </tr>
            ) : (
              filteredWarehouses.map((wh) => {
                const assignedUser = usersList.find((u) => u.id === wh.responsibleUserId);
                const classMeta = CLASSIFICATION_OPTIONS.find((c) => c.value === wh.classification) || CLASSIFICATION_OPTIONS[0];
                return (
                  <tr key={wh.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-white shadow-2xs"
                          style={{ backgroundColor: wh.color || classMeta.defaultColor }}
                        />
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800">
                          {wh.code || wh.id}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{wh.nameAr}</div>
                      {wh.nameEn && <div className="text-[11px] text-slate-500 font-medium">{wh.nameEn}</div>}
                    </td>
                    <td className="p-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px]" style={{
                        backgroundColor: `${wh.color || classMeta.defaultColor}15`,
                        color: wh.color || classMeta.defaultColor,
                        border: `1px solid ${wh.color || classMeta.defaultColor}30`
                      }}>
                        {isAr ? classMeta.labelAr : classMeta.labelEn}
                      </span>
                    </td>
                    <td className="p-3">
                      {assignedUser ? (
                        <div className="font-semibold text-slate-800">
                          {isAr ? assignedUser.nameAr || assignedUser.name : assignedUser.name || assignedUser.nameAr}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium">{isAr ? 'غير محدد' : 'Unassigned'}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        wh.isActive !== false
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {wh.isActive !== false ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                      </span>
                    </td>
                    {isGeneralAdmin && (
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(wh)}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(wh)}
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
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900">
                {editingWhId ? (isAr ? 'تعديل بيانات المستودع' : 'Edit Warehouse') : (isAr ? 'تعريف مستودع جديد' : 'Add New Warehouse')}
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
                    {isAr ? 'كود المستودع' : 'Warehouse Code'} *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    disabled={Boolean(editingWhId)}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. WH-01"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'التصنيف التشغيلي' : 'Classification'} *
                  </label>
                  <select
                    value={formData.classification}
                    onChange={(e) => {
                      const val = e.target.value;
                      const matched = CLASSIFICATION_OPTIONS.find((c) => c.value === val);
                      setFormData({
                        ...formData,
                        classification: val,
                        color: matched?.defaultColor || formData.color
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    {CLASSIFICATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {isAr ? opt.labelAr : opt.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم المستودع (عربي)' : 'Warehouse Name (Arabic)'} *
                </label>
                <input
                  type="text"
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  placeholder={isAr ? 'مثال: مستودع الخامات الرئيسي' : 'e.g. Main Raw Warehouse'}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم المستودع (إنجليزي)' : 'Warehouse Name (English)'}
                </label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="e.g. Main Raw Warehouse"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'أمين العهدة المسؤول' : 'Assigned Custodian'}
                </label>
                <select
                  value={formData.responsibleUserId}
                  onChange={(e) => setFormData({ ...formData, responsibleUserId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium cursor-pointer"
                >
                  <option value="">{isAr ? '-- غير محدد --' : '-- Unassigned --'}</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {isAr ? u.nameAr || u.name : u.name || u.nameAr} ({u.email || u.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Color Presets */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  {isAr ? 'لون المستودع والتمييز البصري' : 'Warehouse Color Identifier'}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: hex })}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        formData.color === hex ? 'border-slate-900 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="whIsActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="accent-emerald-600 rounded h-4 w-4"
                />
                <label htmlFor="whIsActive" className="font-bold text-slate-700 cursor-pointer">
                  {isAr ? 'المستودع متاح ونشط للتشغيل والحركات المخزنية' : 'Warehouse is active for stock movements'}
                </label>
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
