import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  X,
  Phone,
  Briefcase
} from 'lucide-react';

const WORKER_ROLES = [
  { value: 'operator', labelAr: 'فني تشغيل ماكينات', labelEn: 'Machine Operator' },
  { value: 'technician', labelAr: 'فني ميكانيكا وصيانة', labelEn: 'Maintenance Technician' },
  { value: 'qc', labelAr: 'فني جودة ومعمل', labelEn: 'QC Lab Inspector' },
  { value: 'line_leader', labelAr: 'قائد خط إنتاج', labelEn: 'Production Line Leader' },
  { value: 'assistant', labelAr: 'عامل مناولة وتعبئة', labelEn: 'Packaging Assistant' },
  { value: 'forklift', labelAr: 'سائق كلارك ورافعات', labelEn: 'Forklift Driver' },
];

const DEPARTMENTS = [
  { value: 'bottling_line', labelAr: 'خط التعبئة والتغليف', labelEn: 'Bottling & Packaging Line' },
  { value: 'bulk_liquids', labelAr: 'قسم الخامات والسوائل (M)', labelEn: 'Bulk Liquid Preparation' },
  { value: 'quality_control', labelAr: 'إدارة توكيد ورقابة الجودة', labelEn: 'Quality Assurance & QC' },
  { value: 'maintenance', labelAr: 'الصيانة الميكانيكية والكهربائية', labelEn: 'Maintenance & Engineering' },
  { value: 'warehouse_logistics', labelAr: 'المخازن والمناولة اللوجستية', labelEn: 'Warehouse & Logistics' },
];

export default function ProductionWorkersMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [workers, setWorkers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    role: 'operator',
    department: 'bottling_line',
    shift: 'Shift A',
    phone: '',
    notes: '',
    status: 'active',
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Live subscribe to production_workers
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'production_workers'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setWorkers(list);
    });
    return () => unsub();
  }, []);

  // Filtered workers
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const term = searchTerm.toLowerCase();
      const matchName = (w.name || '').toLowerCase().includes(term);
      const matchId = (w.id || '').toLowerCase().includes(term);
      const matchPhone = (w.phone || '').includes(term);
      const matchRole = roleFilter === 'all' || w.role === roleFilter;
      return (matchName || matchId || matchPhone) && matchRole;
    });
  }, [workers, searchTerm, roleFilter]);

  // Counts
  const counts = useMemo(() => {
    return {
      total: workers.length,
      active: workers.filter((w) => w.status !== 'inactive').length,
      operators: workers.filter((w) => w.role === 'operator' || w.role === 'line_leader').length,
      technicians: workers.filter((w) => w.role === 'technician' || w.role === 'qc').length,
    };
  }, [workers]);

  // Open modal for add
  const handleOpenAdd = () => {
    const nextId = `WRK-${Date.now().toString().slice(-6)}`;
    setEditingWorkerId(null);
    setFormData({
      id: nextId,
      name: '',
      role: 'operator',
      department: 'bottling_line',
      shift: 'Shift A',
      phone: '',
      notes: '',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (w) => {
    setEditingWorkerId(w.id);
    setFormData({
      id: w.id,
      name: w.name || '',
      role: w.role || 'operator',
      department: w.department || 'bottling_line',
      shift: w.shift || 'Shift A',
      phone: w.phone || '',
      notes: w.notes || '',
      status: w.status || 'active',
    });
    setIsModalOpen(true);
  };

  // Save handler
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert(isAr ? 'يرجى إدخال اسم العامل / الفني.' : 'Please enter worker name.');
      return;
    }

    const workerId = formData.id || `WRK-${Date.now()}`;

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'production_workers', workerId),
        {
          id: workerId,
          name: formData.name.trim(),
          role: formData.role,
          department: formData.department,
          shift: formData.shift,
          phone: formData.phone.trim(),
          notes: formData.notes.trim(),
          status: formData.status,
          updatedAt: serverTimestamp(),
          createdBy: currentUser?.id || 'admin',
        },
        { merge: true }
      );
      setIsModalOpen(false);
      showToast(isAr ? 'تم حفظ بيانات العامل بنجاح' : 'Worker profile saved successfully');
    } catch (err) {
      console.error('Error saving worker:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ بيانات العامل.' : 'Failed to save worker.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete worker
  const handleDelete = async (workerId) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'حذف العمالة مقتصر على المسؤول العام فقط.' : 'Only General Admin can remove workers.');
      return;
    }

    if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا السجل نهائياً؟' : 'Permanently remove this worker?')) {
      try {
        await deleteDoc(doc(db, 'production_workers', workerId));
        showToast(isAr ? 'تم حذف السجل بنجاح' : 'Worker removed successfully');
      } catch (err) {
        console.error('Error deleting worker:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف السجل.' : 'Failed to delete worker.');
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'إجمالي طاقم الإنتاج' : 'Total Production Roster'}
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {counts.total}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'العمالة النشطة بالصالة' : 'Active on Floor'}
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {counts.active}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'مشغلو وقادة الخطوط' : 'Operators & Leaders'}
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono">
            {counts.operators}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'فنيو الصيانة والجودة' : 'Maintenance & QC'}
          </div>
          <div className="text-2xl font-black text-indigo-700 font-mono">
            {counts.technicians}
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              placeholder={isAr ? 'بحث بالاسم، الكود، أو رقم الهاتف...' : 'Search by name, ID or phone...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50/60 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all">{isAr ? 'كافة الأدوار والوظائف' : 'All Roles'}</option>
            {WORKER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {isAr ? r.labelAr : r.labelEn}
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
            <span>{isAr ? 'إضافة فني / عامل جديد' : 'Add Worker'}</span>
          </button>
        )}
      </div>

      {/* Workers Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="p-3 text-start">{isAr ? 'كود العامل' : 'Worker ID'}</th>
              <th className="p-3 text-start">{isAr ? 'الاسم' : 'Full Name'}</th>
              <th className="p-3 text-start">{isAr ? 'المسمى والوظيفة' : 'Role'}</th>
              <th className="p-3 text-start">{isAr ? 'القسم / الوردية' : 'Department & Shift'}</th>
              <th className="p-3 text-start">{isAr ? 'رقم الهاتف' : 'Contact'}</th>
              <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
              {isGeneralAdmin && <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredWorkers.length === 0 ? (
              <tr>
                <td colSpan={isGeneralAdmin ? 7 : 6} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا يوجد عمال مسجلون يطابقون البحث.' : 'No workers found.'}
                </td>
              </tr>
            ) : (
              filteredWorkers.map((w) => {
                const roleMeta = WORKER_ROLES.find((r) => r.value === w.role) || { labelAr: w.role, labelEn: w.role };
                const deptMeta = DEPARTMENTS.find((d) => d.value === w.department) || { labelAr: w.department, labelEn: w.department };
                return (
                  <tr key={w.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800">
                        {w.id}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{w.name}</div>
                      {w.notes && <div className="text-[11px] text-slate-400 font-medium truncate max-w-xs">{w.notes}</div>}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[11px]">
                        {isAr ? roleMeta.labelAr : roleMeta.labelEn}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">
                        {isAr ? deptMeta.labelAr : deptMeta.labelEn}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {w.shift || 'Shift A'}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-slate-600">
                      {w.phone || '-'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        w.status !== 'inactive'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {w.status !== 'inactive' ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير متاح' : 'Inactive')}
                      </span>
                    </td>
                    {isGeneralAdmin && (
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(w)}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(w.id)}
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
                {editingWorkerId ? (isAr ? 'تعديل بيانات العامل' : 'Edit Worker') : (isAr ? 'إضافة عامل / فني إنتاج' : 'Add Production Worker')}
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
                    {isAr ? 'كود العامل' : 'Worker ID'} *
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    disabled={Boolean(editingWorkerId)}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'المسمى الوظيفي' : 'Role'} *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    {WORKER_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {isAr ? r.labelAr : r.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم العامل الكامل' : 'Full Name'} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={isAr ? 'الاسم الثلاثي' : 'Full name'}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'القسم / المسار' : 'Department'}
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {isAr ? d.labelAr : d.labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'الوردية القياسية' : 'Standard Shift'}
                  </label>
                  <select
                    value={formData.shift}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    <option value="Shift A">{isAr ? 'وردية (أ) صباحية' : 'Shift A (Morning)'}</option>
                    <option value="Shift B">{isAr ? 'وردية (ب) مسائية' : 'Shift B (Evening)'}</option>
                    <option value="Shift C">{isAr ? 'وردية (ج) ليلية' : 'Shift C (Night)'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم الهاتف' : 'Phone Number'}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'حالة العامل' : 'Status'}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    <option value="active">{isAr ? 'نشط ومتاح للتشغيل' : 'Active'}</option>
                    <option value="inactive">{isAr ? 'غير متاح / معطل' : 'Inactive'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات وتفاصيل إضافية' : 'Notes / Remarks'}
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={isAr ? 'أي ملاحظات خاصة بالمهارات أو التدريب' : 'Skills, certifications, notes'}
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
