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
  Users,
  UserCheck,
  HardHat,
  Plus,
  Edit2,
  Trash2,
  Search,
  ShieldCheck,
  CheckCircle2,
  X,
  Building2,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  Briefcase,
} from 'lucide-react';
import { db } from '../firebase.js';
import { canAccessAction } from '../config/appArchitecture.js';
import {
  OPERATIONAL_TAGS,
  DEPARTMENT_COLOR_MAP,
  getRecordDepartmentIds,
} from '../utils/personnelDirectory.js';
import ScopedPermissionMatrixModal from './ScopedPermissionMatrixModal.jsx';

const TAG_META_BY_ID = Object.fromEntries(OPERATIONAL_TAGS.map((t) => [t.id, t]));

export default function EmployeesDirectoryMaster({
  currentUser = {},
  permissions = null,
  initialAccessFilter = 'all',
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin =
    currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin' || currentUser?.role === 'admin';

  const canCreate = canAccessAction(permissions, 'employees', 'canCreate', currentUser) || isGeneralAdmin;
  const canEdit = canAccessAction(permissions, 'employees', 'canEdit', currentUser) || isGeneralAdmin;
  const canDelete = canAccessAction(permissions, 'employees', 'canDelete', currentUser) || isGeneralAdmin;
  const canManageSystemAccess =
    canAccessAction(permissions, 'employees', 'canManageSystemAccess', currentUser) || isGeneralAdmin;

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState(initialAccessFilter || 'all'); // 'all' | 'system' | 'worker'
  const [tagFilter, setTagFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'

  useEffect(() => {
    setAccessFilter(initialAccessFilter || 'all');
  }, [initialAccessFilter]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [showHrSection, setShowHrSection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [permModalUserId, setPermModalUserId] = useState(null);
  const [isFullMatrixOpen, setIsFullMatrixOpen] = useState(false);

  const [formData, setFormData] = useState({
    employeeCode: '',
    nameAr: '',
    nameEn: '',
    phone: '',
    email: '',
    departmentIds: [],
    jobTitle: '',
    operationalTags: [],
    isSystemUser: false,
    linkedUserId: '',
    role: 'standard',
    status: 'active',
    hrProfile: {
      nationalId: '',
      hireDate: '',
      contractType: 'full_time',
      shiftType: '',
      notes: '',
    },
  });

  const showToast = (message, type = 'success') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 3800);
  };

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'employees'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(a.employeeCode || a.id).localeCompare(String(b.employeeCode || b.id)));
      setEmployees(list);
    });
    const u2 = onSnapshot(collection(db, 'departments'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id)));
      setDepartments(list);
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

  const deptById = useMemo(() => {
    const m = {};
    departments.forEach((d) => {
      m[d.id] = d;
    });
    return m;
  }, [departments]);

  const filteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees.filter((emp) => {
      if (statusFilter === 'active' && (emp.status === 'inactive' || emp.isActive === false)) return false;
      if (statusFilter === 'inactive' && emp.status !== 'inactive' && emp.isActive !== false) return false;
      if (deptFilter !== 'all') {
        const empDeptIds = getRecordDepartmentIds(emp, departments);
        if (deptFilter === 'unassigned' && empDeptIds.length > 0) return false;
        if (deptFilter !== 'unassigned' && !empDeptIds.includes(deptFilter)) return false;
      }
      if (accessFilter === 'system' && !emp.isSystemUser) return false;
      if (accessFilter === 'worker' && emp.isSystemUser) return false;
      if (tagFilter !== 'all' && !(Array.isArray(emp.operationalTags) && emp.operationalTags.includes(tagFilter))) {
        return false;
      }
      if (q) {
        const hay = [
          emp.employeeCode,
          emp.nameAr,
          emp.nameEn,
          emp.phone,
          emp.email,
          emp.jobTitle,
          emp.departmentNameAr,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, searchTerm, deptFilter, accessFilter, tagFilter, statusFilter]);

  const kpis = useMemo(() => {
    const active = employees.filter((e) => e.status !== 'inactive' && e.isActive !== false);
    return {
      total: active.length,
      systemUsers: active.filter((e) => e.isSystemUser).length,
      nonSystemWorkers: active.filter((e) => !e.isSystemUser).length,
      unassignedDept: active.filter((e) => getRecordDepartmentIds(e, departments).length === 0).length,
    };
  }, [employees, departments]);

  const openCreateModal = () => {
    const nextCode = `EMP-${String(employees.length + 1).padStart(3, '0')}`;
    setEditingEmpId(null);
    setShowHrSection(false);
    setFormData({
      employeeCode: nextCode,
      nameAr: '',
      nameEn: '',
      phone: '',
      email: '',
      departmentIds: departments[0]?.id ? [departments[0].id] : [],
      jobTitle: '',
      operationalTags: [],
      isSystemUser: false,
      linkedUserId: '',
      role: 'standard',
      status: 'active',
      hrProfile: {
        nationalId: '',
        hireDate: '',
        contractType: 'full_time',
        shiftType: '',
        notes: '',
      },
    });
    setIsModalOpen(true);
  };

  const openEditModal = (emp) => {
    setEditingEmpId(emp.id);
    setShowHrSection(Boolean(emp.hrProfile?.nationalId || emp.hrProfile?.hireDate || emp.hrProfile?.notes));
    setFormData({
      employeeCode: emp.employeeCode || '',
      nameAr: emp.nameAr || '',
      nameEn: emp.nameEn || '',
      phone: emp.phone || '',
      email: emp.email || '',
      departmentIds: getRecordDepartmentIds(emp, departments),
      jobTitle: emp.jobTitle || '',
      operationalTags: Array.isArray(emp.operationalTags) ? emp.operationalTags : [],
      isSystemUser: Boolean(emp.isSystemUser),
      linkedUserId: emp.linkedUserId || '',
      role: emp.isGeneralAdmin || emp.role === 'general_admin' ? 'general_admin' : 'standard',
      status: emp.status === 'inactive' ? 'inactive' : 'active',
      hrProfile: {
        nationalId: emp.hrProfile?.nationalId || '',
        hireDate: emp.hrProfile?.hireDate || '',
        contractType: emp.hrProfile?.contractType || 'full_time',
        shiftType: emp.hrProfile?.shiftType || '',
        notes: emp.hrProfile?.notes || '',
      },
    });
    setIsModalOpen(true);
  };

  const toggleTag = (tagId) => {
    setFormData((prev) => {
      const exists = prev.operationalTags.includes(tagId);
      return {
        ...prev,
        operationalTags: exists
          ? prev.operationalTags.filter((t) => t !== tagId)
          : [...prev.operationalTags, tagId],
      };
    });
  };

  const toggleDepartment = (deptId) => {
    setFormData((prev) => {
      const curr = Array.isArray(prev.departmentIds) ? prev.departmentIds : [];
      const exists = curr.includes(deptId);
      return {
        ...prev,
        departmentIds: exists ? curr.filter((id) => id !== deptId) : [...curr, deptId],
      };
    });
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!formData.nameAr.trim()) return;
    setIsSaving(true);
    try {
      const selectedDeptIds = Array.isArray(formData.departmentIds) ? formData.departmentIds.filter(Boolean) : [];
      const selectedDepts = selectedDeptIds.map((id) => deptById[id]).filter(Boolean);
      const primaryDept = selectedDepts[0] || null;
      const joinedDeptNamesAr = selectedDepts.map((d) => d.nameAr).filter(Boolean).join(' + ');
      const empId = editingEmpId || `EMP-${Date.now()}`;
      const isSys = Boolean(formData.isSystemUser);
      const isAdminRole = formData.role === 'general_admin';
      const linkedUid = isSys ? (formData.linkedUserId || `USR-${Date.now()}`) : (formData.linkedUserId || null);

      const batch = writeBatch(db);

      const empPayload = {
        id: empId,
        employeeCode: formData.employeeCode.trim() || empId,
        nameAr: formData.nameAr.trim(),
        nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        departmentId: primaryDept?.id || '',
        departmentIds: selectedDeptIds,
        departmentNameAr: joinedDeptNamesAr,
        jobTitle: formData.jobTitle.trim(),
        operationalTags: formData.operationalTags,
        isSystemUser: isSys,
        linkedUserId: linkedUid,
        role: isAdminRole ? 'general_admin' : 'standard',
        isGeneralAdmin: isSys && isAdminRole,
        status: formData.status,
        hrProfile: {
          nationalId: formData.hrProfile.nationalId.trim(),
          hireDate: formData.hrProfile.hireDate || '',
          contractType: formData.hrProfile.contractType || 'full_time',
          shiftType: formData.hrProfile.shiftType.trim(),
          notes: formData.hrProfile.notes.trim(),
        },
        updatedAt: serverTimestamp(),
        ...(editingEmpId ? {} : { createdAt: serverTimestamp() }),
      };

      batch.set(doc(db, 'employees', empId), empPayload, { merge: true });

      // Sync with `users` collection automatically for active/revoked system accounts
      if (isSys && linkedUid) {
        batch.set(
          doc(db, 'users', linkedUid),
          {
            id: linkedUid,
            employeeId: empId,
            nameAr: empPayload.nameAr,
            name: empPayload.nameEn,
            email: empPayload.email,
            phone: empPayload.phone,
            departmentId: empPayload.departmentId,
            departmentIds: selectedDeptIds,
            department: empPayload.departmentNameAr,
            jobTitle: empPayload.jobTitle,
            role: isAdminRole ? 'general_admin' : 'standard',
            isGeneralAdmin: isAdminRole,
            status: formData.status,
            isActive: formData.status === 'active',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else if (!isSys && linkedUid) {
        // Deactivate linked login account without deleting historical references
        batch.set(
          doc(db, 'users', linkedUid),
          {
            status: 'inactive',
            isActive: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
      setIsModalOpen(false);
      showToast(
        editingEmpId
          ? (isAr ? 'تم تحديث بيانات الموظف بنجاح ✓' : 'Staff member updated ✓')
          : (isAr ? 'تم إضافة الموظف للسجل الموحد بنجاح ✓' : 'Staff member added ✓')
      );
    } catch (err) {
      console.error('Error saving employee:', err);
      showToast(isAr ? 'حدث خطأ أثناء الحفظ' : 'Failed saving employee', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEmployee = async (emp) => {
    if (!canDelete) return;
    if (emp.isGeneralAdmin) {
      alert(isAr ? 'لا يمكن حذف حساب المدير العام.' : 'Cannot delete a General Admin record.');
      return;
    }
    if (!window.confirm(isAr ? `تأكيد حذف "${emp.nameAr}" من السجل الموحد؟` : `Delete "${emp.nameEn || emp.nameAr}"?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'employees', emp.id));
      showToast(isAr ? 'تم حذف السجل' : 'Record deleted');
    } catch (err) {
      console.error('Failed deleting employee:', err);
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

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">{isAr ? 'إجمالي النشطين' : 'Total Active Staff'}</div>
          <div className="font-mono text-2xl font-black text-slate-900 mt-0.5">{kpis.total}</div>
        </div>
        <div className="bg-emerald-50/60 rounded-2xl border border-emerald-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5" />
            <span>{isAr ? 'مستخدمو النظام' : 'System Users'}</span>
          </div>
          <div className="font-mono text-2xl font-black text-emerald-900 mt-0.5">{kpis.systemUsers}</div>
        </div>
        <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
            <HardHat className="w-3.5 h-3.5" />
            <span>{isAr ? 'عمالة غير مستخدمة للنظام' : 'Non-System Workers'}</span>
          </div>
          <div className="font-mono text-2xl font-black text-amber-900 mt-0.5">{kpis.nonSystemWorkers}</div>
        </div>
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-600">{isAr ? 'بدون قسم محدد' : 'Unassigned Dept'}</div>
          <div className="font-mono text-2xl font-black text-slate-800 mt-0.5">{kpis.unassignedDept}</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2.5 shadow-2xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم، الكود، الهاتف، المسمى...' : 'Search name, code, phone, title...'}
            className="w-full ps-9 pe-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-teal-500"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-white"
        >
          <option value="all">{isAr ? 'كل الأقسام' : 'All Departments'}</option>
          <option value="unassigned">{isAr ? 'بدون قسم' : 'Unassigned'}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {isAr ? d.nameAr : d.nameEn || d.nameAr}
            </option>
          ))}
        </select>

        <select
          value={accessFilter}
          onChange={(e) => setAccessFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-white"
        >
          <option value="all">{isAr ? 'الكل (مستخدمين + عمالة)' : 'All Personnel'}</option>
          <option value="system">{isAr ? 'مستخدمو النظام فقط' : 'System Users Only'}</option>
          <option value="worker">{isAr ? 'العمالة فقط (بدون حساب)' : 'Non-System Workers Only'}</option>
        </select>

        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-white"
        >
          <option value="all">{isAr ? 'كل التصنيفات التشغيلية' : 'All Operational Tags'}</option>
          {OPERATIONAL_TAGS.map((t) => (
            <option key={t.id} value={t.id}>
              {isAr ? t.labelAr : t.labelEn}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-white"
        >
          <option value="active">{isAr ? 'النشطين فقط' : 'Active Only'}</option>
          <option value="inactive">{isAr ? 'الموقوفين' : 'Inactive'}</option>
          <option value="all">{isAr ? 'الكل' : 'All Statuses'}</option>
        </select>

        {isGeneralAdmin && (
          <button
            type="button"
            onClick={() => setIsFullMatrixOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isAr ? 'مصفوفة الصلاحيات' : 'Permissions Matrix'}</span>
          </button>
        )}

        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة موظف / عامل' : 'Add Staff / Worker'}</span>
          </button>
        )}
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-xs text-start border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black">
              <th className="py-3 px-4 text-start">{isAr ? 'الموظف / الكود' : 'Staff / Code'}</th>
              <th className="py-3 px-3 text-start">{isAr ? 'القسم والمسمى' : 'Department & Title'}</th>
              <th className="py-3 px-3 text-start">{isAr ? 'التصنيف التشغيلي' : 'Operational Tags'}</th>
              <th className="py-3 px-3 text-center">{isAr ? 'حساب النظام' : 'System Access'}</th>
              <th className="py-3 px-3 text-start">{isAr ? 'التواصل' : 'Contact'}</th>
              <th className="py-3 px-4 text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400 font-bold">
                  {isAr ? 'لا توجد سجلات مطابقة لمعايير البحث.' : 'No matching personnel records.'}
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const empDeptIds = getRecordDepartmentIds(emp, departments);
                const empDepts = empDeptIds.map((id) => deptById[id]).filter(Boolean);
                const isInactive = emp.status === 'inactive' || emp.isActive === false;

                return (
                  <tr key={emp.id} className={`hover:bg-slate-50/70 transition ${isInactive ? 'opacity-60' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="font-black text-slate-900">{isAr ? emp.nameAr || emp.nameEn : emp.nameEn || emp.nameAr}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] font-bold text-slate-500">{emp.employeeCode || emp.id}</span>
                        {isInactive && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 text-[9px] font-bold">
                            {isAr ? 'موقوف' : 'Inactive'}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {empDepts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {empDepts.map((dept) => {
                            const dTheme = DEPARTMENT_COLOR_MAP[dept.color] || DEPARTMENT_COLOR_MAP.slate;
                            return (
                              <span
                                key={dept.id}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-black ${dTheme.badge}`}
                              >
                                <Building2 className="w-3 h-3" />
                                <span>{isAr ? dept.nameAr : dept.nameEn || dept.nameAr}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">
                          {emp.departmentNameAr || (isAr ? '— بدون قسم —' : '— Unassigned —')}
                        </span>
                      )}
                      {emp.jobTitle && <div className="text-[11px] text-slate-600 font-medium mt-0.5">{emp.jobTitle}</div>}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(emp.operationalTags || []).length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          (emp.operationalTags || []).map((tid) => {
                            const meta = TAG_META_BY_ID[tid];
                            return (
                              <span
                                key={tid}
                                className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${meta?.cls || 'bg-slate-100 text-slate-700 border-slate-200'}`}
                              >
                                {meta ? (isAr ? meta.labelAr : meta.labelEn) : tid}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      {emp.isSystemUser ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                            emp.isGeneralAdmin || emp.role === 'general_admin'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>
                            {emp.isGeneralAdmin || emp.role === 'general_admin'
                              ? (isAr ? 'مدير عام' : 'General Admin')
                              : (isAr ? 'مستخدم نظام' : 'System User')}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold">
                          <HardHat className="w-3 h-3" />
                          <span>{isAr ? 'غير مستخدم' : 'Worker Only'}</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-[11px] text-slate-600 space-y-0.5">
                      {emp.phone && (
                        <div className="flex items-center gap-1 font-mono" dir="ltr">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{emp.phone}</span>
                        </div>
                      )}
                      {emp.email && (
                        <div className="flex items-center gap-1 font-mono text-[10px]" dir="ltr">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[160px]">{emp.email}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {emp.isSystemUser && emp.linkedUserId && !emp.isGeneralAdmin && isGeneralAdmin && (
                          <button
                            type="button"
                            onClick={() => setPermModalUserId(emp.linkedUserId)}
                            className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-[10px] font-black inline-flex items-center gap-1 transition cursor-pointer"
                            title={isAr ? 'تخصيص صلاحيات هذا المستخدم' : 'Customize User Permissions'}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{isAr ? 'صلاحيات' : 'Perms'}</span>
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && !emp.isGeneralAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 cursor-pointer"
                            title={isAr ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isSaving && setIsModalOpen(false)}
        >
          <form
            onSubmit={handleSaveEmployee}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-black">
                  {editingEmpId
                    ? (isAr ? 'تعديل ملف موظف / عامل' : 'Edit Staff / Worker Profile')
                    : (isAr ? 'إضافة موظف / عامل جديد' : 'Add New Staff / Worker')}
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

            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الكود الوظيفي' : 'Employee Code'}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.employeeCode}
                    onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الاسم (عربي) *' : 'Name (Ar) *'}</label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'الاسم (إنجليزي)' : 'Name (En)'}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
              </div>

              {/* Multi-Department Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700">
                    {isAr ? 'الأقسام / الإدارات (يمكن اختيار أكثر من قسم):' : 'Departments (multi-select supported):'}
                  </label>
                  <span className="text-[10px] font-bold text-indigo-700">
                    {(formData.departmentIds || []).length} {isAr ? 'مختار' : 'selected'}
                  </span>
                </div>
                {departments.length === 0 ? (
                  <div className="text-[11px] text-slate-400 font-bold">
                    {isAr ? 'لا توجد أقسام مسجلة بعد — أنشئ الأقسام من تبويب الأقسام.' : 'No departments configured yet.'}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {departments.map((d) => {
                      const active = (formData.departmentIds || []).includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleDepartment(d.id)}
                          className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1.5 transition cursor-pointer ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span>{isAr ? d.nameAr : d.nameEn || d.nameAr}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Title & Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'المسمى الوظيفي' : 'Job Title'}</label>
                  <input
                    type="text"
                    value={formData.jobTitle}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    placeholder={isAr ? 'مثال: سائق / أمين مخزن تام' : 'e.g., Driver / FG Keeper'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'رقم الهاتف' : 'Phone'}</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Operational Tags */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  {isAr ? 'التصنيفات التشغيلية (تستخدم في الشاحنات، التحميل، الإنتاج):' : 'Operational Tags (used across Fleet, Dispatch & Production):'}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {OPERATIONAL_TAGS.map((tag) => {
                    const active = formData.operationalTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isAr ? tag.labelAr : tag.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* System Access Toggle */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManageSystemAccess}
                      checked={formData.isSystemUser}
                      onChange={(e) => setFormData({ ...formData, isSystemUser: e.target.checked })}
                      className="w-4 h-4 rounded border-emerald-400 text-emerald-600"
                    />
                    <span className="font-black text-emerald-950">
                      {isAr ? 'مستخدم للنظام (يمتلك حساب دخول وصلاحيات)' : 'System User (Has ERP Login & Permissions)'}
                    </span>
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-bold"
                  >
                    <option value="active">{isAr ? 'نشط' : 'Active'}</option>
                    <option value="inactive">{isAr ? 'موقوف' : 'Inactive'}</option>
                  </select>
                </div>

                {formData.isSystemUser && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-bold text-emerald-900 mb-1">
                        {isAr ? 'مستوى الحساب' : 'Account Role'}
                      </label>
                      <select
                        disabled={!isGeneralAdmin}
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full px-3 py-1.5 border border-emerald-300 rounded-xl bg-white font-bold"
                      >
                        <option value="standard">{isAr ? 'مستخدم قياسي (يرث صلاحيات القسم)' : 'Standard (Inherits Dept Permissions)'}</option>
                        <option value="general_admin">{isAr ? 'مدير عام للنظام (كامل الصلاحيات)' : 'General Admin (Full Access)'}</option>
                      </select>
                    </div>
                    <div className="flex items-end text-[11px] text-emerald-800 font-medium">
                      {isAr
                        ? 'يرث المستخدم صلاحيات قسمه تلقائياً، ويمكن تخصيص أي صلاحية فردية له من مصفوفة الصلاحيات.'
                        : 'Automatically inherits Department permissions; individual overrides can be customized anytime.'}
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Future HR Profile */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHrSection((s) => !s)}
                  className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-black text-slate-700 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                    <span>{isAr ? 'بيانات الموارد البشرية (لربط وحدة HR مستقبلاً)' : 'HR Profile Fields (Future HR Module Ready)'}</span>
                  </span>
                  {showHrSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showHrSection && (
                  <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">{isAr ? 'الرقم القومي' : 'National ID'}</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={formData.hrProfile.nationalId}
                        onChange={(e) =>
                          setFormData({ ...formData, hrProfile: { ...formData.hrProfile, nationalId: e.target.value } })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">{isAr ? 'تاريخ التعيين' : 'Hire Date'}</label>
                      <input
                        type="date"
                        value={formData.hrProfile.hireDate}
                        onChange={(e) =>
                          setFormData({ ...formData, hrProfile: { ...formData.hrProfile, hireDate: e.target.value } })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">{isAr ? 'نوع التعاقد' : 'Contract Type'}</label>
                      <select
                        value={formData.hrProfile.contractType}
                        onChange={(e) =>
                          setFormData({ ...formData, hrProfile: { ...formData.hrProfile, contractType: e.target.value } })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-xl bg-white font-bold"
                      >
                        <option value="full_time">{isAr ? 'دوام كامل' : 'Full-Time'}</option>
                        <option value="part_time">{isAr ? 'دوام جزئي' : 'Part-Time'}</option>
                        <option value="daily">{isAr ? 'يومية / عمالة مؤقتة' : 'Daily / Casual'}</option>
                        <option value="contractor">{isAr ? 'متعاقد خارجي' : 'Contractor'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">{isAr ? 'الوردية' : 'Shift'}</label>
                      <input
                        type="text"
                        value={formData.hrProfile.shiftType}
                        onChange={(e) =>
                          setFormData({ ...formData, hrProfile: { ...formData.hrProfile, shiftType: e.target.value } })
                        }
                        placeholder={isAr ? 'الوردية الصباحية / المسائية' : 'Morning / Night Shift'}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-600 mb-1">{isAr ? 'ملاحظات HR' : 'HR Notes'}</label>
                      <textarea
                        rows={2}
                        value={formData.hrProfile.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, hrProfile: { ...formData.hrProfile, notes: e.target.value } })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-xl resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
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
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-black shadow-sm cursor-pointer"
              >
                {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ البيانات' : 'Save Staff Profile')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Individual User Permission Overrides Modal */}
      {permModalUserId && (
        <ScopedPermissionMatrixModal
          isOpen={Boolean(permModalUserId)}
          onClose={() => setPermModalUserId(null)}
          scopeType="all"
          targetKey="all"
          initialMode="users"
          initialUserId={permModalUserId}
          currentUser={currentUser}
          usersList={users}
          departmentsList={departments}
        />
      )}

      {/* Full 3-Layer Permissions Matrix (Departments + User Overrides) */}
      {isFullMatrixOpen && (
        <ScopedPermissionMatrixModal
          isOpen={isFullMatrixOpen}
          onClose={() => setIsFullMatrixOpen(false)}
          scopeType="all"
          targetKey="all"
          initialMode="departments"
          currentUser={currentUser}
          usersList={users}
          departmentsList={departments}
        />
      )}
    </div>
  );
}
