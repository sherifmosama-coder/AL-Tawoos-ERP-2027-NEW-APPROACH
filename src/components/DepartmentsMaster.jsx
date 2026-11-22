import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  Users,
  ShieldCheck,
  Search,
  Sparkles,
  CheckCircle2,
  X,
  UserCheck,
  HardHat,
} from 'lucide-react';
import { db } from '../firebase.js';
import { canAccessAction } from '../config/appArchitecture.js';
import {
  DEFAULT_SEED_DEPARTMENTS,
  DEPARTMENT_COLOR_MAP,
  getRecordDepartmentIds,
} from '../utils/personnelDirectory.js';
import ScopedPermissionMatrixModal from './ScopedPermissionMatrixModal.jsx';

const COLOR_KEYS = Object.keys(DEPARTMENT_COLOR_MAP);

export default function DepartmentsMaster({ currentUser = {}, permissions = null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin =
    currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin' || currentUser?.role === 'admin';

  const canCreate = canAccessAction(permissions, 'departments', 'canCreate', currentUser) || isGeneralAdmin;
  const canEdit = canAccessAction(permissions, 'departments', 'canEdit', currentUser) || isGeneralAdmin;
  const canDelete = canAccessAction(permissions, 'departments', 'canDelete', currentUser) || isGeneralAdmin;
  const canManagePerms =
    canAccessAction(permissions, 'departments', 'canManageDeptPermissions', currentUser) || isGeneralAdmin;

  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [permModalDeptId, setPermModalDeptId] = useState(null);

  const [formData, setFormData] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    description: '',
    headEmployeeId: '',
    color: 'indigo',
    isActive: true,
  });

  const showToast = (message, type = 'success') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'departments'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));
      setDepartments(list);
    });
    const u2 = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const u3 = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const deptStatsMap = useMemo(() => {
    const stats = {};
    departments.forEach((d) => {
      stats[d.id] = { total: 0, systemUsers: 0, nonSystemWorkers: 0 };
    });
    employees.forEach((emp) => {
      if (emp.status === 'inactive' || emp.isActive === false) return;
      const empDeptIds = getRecordDepartmentIds(emp, departments);
      empDeptIds.forEach((dId) => {
        if (!stats[dId]) return;
        stats[dId].total += 1;
        if (emp.isSystemUser) stats[dId].systemUsers += 1;
        else stats[dId].nonSystemWorkers += 1;
      });
    });
    return stats;
  }, [departments, employees]);

  const missingDefaultsCount = useMemo(() => {
    const existingIds = new Set(departments.map((d) => d.id));
    return DEFAULT_SEED_DEPARTMENTS.filter((d) => !existingIds.has(d.id)).length;
  }, [departments]);

  const filteredDepartments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(
      (d) =>
        (d.nameAr || '').toLowerCase().includes(q) ||
        (d.nameEn || '').toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
    );
  }, [departments, searchTerm]);

  const handleSeedDefaults = async () => {
    if (!canCreate) return;
    setIsSeeding(true);
    try {
      const existingIds = new Set(departments.map((d) => d.id));
      const toAdd = DEFAULT_SEED_DEPARTMENTS.filter((d) => !existingIds.has(d.id));
      if (toAdd.length === 0) {
        showToast(isAr ? 'جميع الأقسام الافتراضية موجودة بالفعل' : 'All default departments already exist');
        return;
      }
      const batch = writeBatch(db);
      toAdd.forEach((dept) => {
        batch.set(doc(db, 'departments', dept.id), {
          ...dept,
          headEmployeeId: '',
          headEmployeeName: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast(
        isAr ? `تم إنشاء ${toAdd.length} أقسام افتراضية بنجاح ✓` : `Seeded ${toAdd.length} default departments ✓`
      );
    } catch (err) {
      console.error('Error seeding departments:', err);
      showToast(isAr ? 'حدث خطأ أثناء إنشاء الأقسام' : 'Error seeding departments', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const openCreateModal = () => {
    setEditingDeptId(null);
    setFormData({
      code: '',
      nameAr: '',
      nameEn: '',
      description: '',
      headEmployeeId: '',
      color: 'indigo',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (dept) => {
    setEditingDeptId(dept.id);
    setFormData({
      code: dept.code || '',
      nameAr: dept.nameAr || '',
      nameEn: dept.nameEn || '',
      description: dept.description || '',
      headEmployeeId: dept.headEmployeeId || '',
      color: dept.color || 'indigo',
      isActive: dept.isActive !== false,
    });
    setIsModalOpen(true);
  };

  const handleSaveDepartment = async (e) => {
    e.preventDefault();
    if (!formData.nameAr.trim() || !formData.code.trim()) return;
    setIsSaving(true);
    try {
      const cleanCode = formData.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      const docId = editingDeptId || `DEPT-${cleanCode || Date.now()}`;
      const headEmp = employees.find((emp) => emp.id === formData.headEmployeeId) || null;
      await setDoc(
        doc(db, 'departments', docId),
        {
          id: docId,
          code: cleanCode || docId,
          nameAr: formData.nameAr.trim(),
          nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
          description: formData.description.trim(),
          headEmployeeId: headEmp?.id || '',
          headEmployeeName: headEmp ? (headEmp.nameAr || headEmp.nameEn || '') : '',
          color: formData.color || 'indigo',
          isActive: Boolean(formData.isActive),
          updatedAt: serverTimestamp(),
          ...(editingDeptId ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );
      setIsModalOpen(false);
      showToast(
        editingDeptId
          ? (isAr ? 'تم تحديث بيانات القسم بنجاح' : 'Department updated successfully')
          : (isAr ? 'تم إنشاء القسم بنجاح' : 'Department created successfully')
      );
    } catch (err) {
      console.error('Failed saving department:', err);
      showToast(isAr ? 'تعذر حفظ بيانات القسم' : 'Failed saving department', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDepartment = async (dept) => {
    if (!canDelete) return;
    const count = deptStatsMap[dept.id]?.total || 0;
    if (count > 0) {
      alert(
        isAr
          ? `لا يمكن حذف القسم "${dept.nameAr}" لوجود (${count}) موظف مرتبط به. انقل الموظفين لقسم آخر أولاً.`
          : `Cannot delete "${dept.nameEn}" while ${count} active staff member(s) are assigned to it.`
      );
      return;
    }
    if (!window.confirm(isAr ? `تأكيد حذف القسم "${dept.nameAr}"؟` : `Delete department "${dept.nameEn}"?`)) return;
    try {
      await deleteDoc(doc(db, 'departments', dept.id));
      showToast(isAr ? 'تم حذف القسم' : 'Department deleted');
    } catch (err) {
      console.error('Delete department failed:', err);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      {toastMsg && (
        <div
          className={`fixed bottom-5 end-5 z-50 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-black flex items-center gap-2 border ${
            toastMsg.type === 'error'
              ? 'bg-rose-900 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg.message}</span>
        </div>
      )}

      {/* Action & Search Ribbon (Global TabPageHeaderBanner sits above) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'ابحث باسم القسم أو الكود...' : 'Search by department name or code...'}
            className="w-full ps-9 pe-3 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold text-slate-600">
          <span>
            {isAr ? 'الأقسام:' : 'Depts:'}{' '}
            <strong className="font-mono text-slate-900">{departments.length}</strong>
          </span>
          <span>•</span>
          <span>
            {isAr ? 'الموظفين:' : 'Staff:'}{' '}
            <strong className="font-mono text-indigo-700">{employees.filter((e) => getRecordDepartmentIds(e, departments).length > 0).length}</strong>
          </span>
          {canCreate && missingDefaultsCount > 0 && (
            <button
              type="button"
              disabled={isSeeding}
              onClick={handleSeedDefaults}
              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>
                {isSeeding
                  ? (isAr ? 'جاري الإنشاء...' : 'Seeding...')
                  : isAr
                  ? `الأقسام الافتراضية (${missingDefaultsCount})`
                  : `Seed Defaults (${missingDefaultsCount})`}
              </span>
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة قسم' : 'Add Department'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Departments Grid */}
      {filteredDepartments.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center space-y-3">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="text-sm font-black text-slate-700">
            {isAr ? 'لا توجد أقسام مسجلة بعد' : 'No departments configured yet'}
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isAr
              ? 'اضغط على "تأسيس الأقسام الافتراضية" لإنشاء الأقسام الأساسية فوراً، أو أضف قسماً مخصصاً.'
              : 'Click "Seed Default Depts" to initialize the core organizational departments, or create a custom one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDepartments.map((dept) => {
            const theme = DEPARTMENT_COLOR_MAP[dept.color] || DEPARTMENT_COLOR_MAP.indigo;
            const st = deptStatsMap[dept.id] || { total: 0, systemUsers: 0, nonSystemWorkers: 0 };

            return (
              <div
                key={dept.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className={`h-1.5 w-full ${theme.bar}`} />
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-lg border font-mono text-[10px] font-black ${theme.badge}`}>
                            {dept.code}
                          </span>
                          {dept.isActive === false && (
                            <span className="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-600 text-[10px] font-bold">
                              {isAr ? 'غير نشط' : 'Inactive'}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-black text-slate-900 mt-1 truncate">
                          {isAr ? dept.nameAr : dept.nameEn || dept.nameAr}
                        </h3>
                        <div className="text-[11px] text-slate-400 font-medium truncate">
                          {isAr ? dept.nameEn : dept.nameAr}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditModal(dept)}
                            className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition cursor-pointer"
                            title={isAr ? 'تعديل القسم' : 'Edit Department'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDepartment(dept)}
                            className="p-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 transition cursor-pointer"
                            title={isAr ? 'حذف القسم' : 'Delete Department'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {dept.description && (
                      <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">{dept.description}</p>
                    )}

                    {dept.headEmployeeName && (
                      <div className="text-[11px] text-slate-600 font-bold">
                        {isAr ? 'مدير القسم:' : 'Dept Head:'}{' '}
                        <span className="text-slate-900">{dept.headEmployeeName}</span>
                      </div>
                    )}

                    {/* Staff Counts Strip */}
                    <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100 text-center">
                      <div className="p-1.5 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="font-mono text-sm font-black text-slate-900">{st.total}</div>
                        <div className="text-[9px] font-bold text-slate-500 flex items-center justify-center gap-0.5">
                          <Users className="w-2.5 h-2.5" />
                          <span>{isAr ? 'إجمالي' : 'Total'}</span>
                        </div>
                      </div>
                      <div className="p-1.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                        <div className="font-mono text-sm font-black text-emerald-800">{st.systemUsers}</div>
                        <div className="text-[9px] font-bold text-emerald-700 flex items-center justify-center gap-0.5">
                          <UserCheck className="w-2.5 h-2.5" />
                          <span>{isAr ? 'مستخدم نظام' : 'Sys Users'}</span>
                        </div>
                      </div>
                      <div className="p-1.5 rounded-xl bg-amber-50/70 border border-amber-100">
                        <div className="font-mono text-sm font-black text-amber-800">{st.nonSystemWorkers}</div>
                        <div className="text-[9px] font-bold text-amber-700 flex items-center justify-center gap-0.5">
                          <HardHat className="w-2.5 h-2.5" />
                          <span>{isAr ? 'عمالة' : 'Workers'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {canManagePerms && (
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPermModalDeptId(dept.id)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{isAr ? 'صلاحيات القسم' : 'Dept Permissions'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Department Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isSaving && setIsModalOpen(false)}
        >
          <form
            onSubmit={handleSaveDepartment}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden"
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-black">
                  {editingDeptId
                    ? (isAr ? 'تعديل بيانات القسم' : 'Edit Department')
                    : (isAr ? 'إضافة قسم جديد' : 'Add New Department')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'كود القسم *' : 'Dept Code *'}
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    disabled={Boolean(editingDeptId)}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="SALES"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold uppercase disabled:bg-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم القسم (عربي) *' : 'Department Name (Ar) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    placeholder="إدارة المبيعات والتسويق"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اسم القسم (إنجليزي)' : 'Department Name (En)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="Sales & Marketing"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'الوصف التشغيلي' : 'Operational Description'}
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'مدير / رئيس القسم' : 'Department Head'}
                  </label>
                  <select
                    value={formData.headEmployeeId}
                    onChange={(e) => setFormData({ ...formData, headEmployeeId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-white"
                  >
                    <option value="">{isAr ? '— غير محدد —' : '— Unassigned —'}</option>
                    {employees
                      .filter((e) => e.status !== 'inactive')
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {isAr ? emp.nameAr || emp.nameEn : emp.nameEn || emp.nameAr}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'اللون المميز' : 'Badge Color'}
                  </label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {COLOR_KEYS.map((ck) => (
                      <button
                        key={ck}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: ck })}
                        className={`w-6 h-6 rounded-full ${DEPARTMENT_COLOR_MAP[ck].bar} transition cursor-pointer ${
                          formData.color === ck ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'opacity-65 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="font-bold text-slate-700">{isAr ? 'قسم نشط' : 'Active Department'}</span>
              </label>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black shadow-sm cursor-pointer"
              >
                {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ القسم' : 'Save Department')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Department Permissions Matrix Modal */}
      {permModalDeptId && (
        <ScopedPermissionMatrixModal
          isOpen={Boolean(permModalDeptId)}
          onClose={() => setPermModalDeptId(null)}
          scopeType="all"
          targetKey="all"
          initialMode="departments"
          initialDepartmentId={permModalDeptId}
          currentUser={currentUser}
          usersList={users}
          departmentsList={departments}
        />
      )}
    </div>
  );
}
