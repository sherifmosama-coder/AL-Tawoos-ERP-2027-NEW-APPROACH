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
  ShieldCheck,
  Search,
  Plus,
  Edit2,
  Trash2,
  User,
  Users,
  CheckCircle2,
  X,
  Mail,
  Building
} from 'lucide-react';

const MODULES_LIST = [
  { id: 'master_data', labelAr: 'قاعدة البيانات الأساسية', labelEn: 'Master Database' },
  { id: 'purchases', labelAr: 'الخامات والمشتريات', labelEn: 'Materials & Procurement' },
  { id: 'production', labelAr: 'الإنتاج والتشغيل', labelEn: 'Production & Manufacturing' },
  { id: 'sales', labelAr: 'المبيعات والتوزيع', labelEn: 'Sales & Distribution' },
  { id: 'finance', labelAr: 'المالية والحسابات', labelEn: 'Finance & Accounts' },
  { id: 'hr', labelAr: 'الموارد البشرية', labelEn: 'Human Resources' },
];

const DEPARTMENTS = [
  'الإدارة العليا',
  'إدارة سلاسل الإمداد والمشتريات',
  'إدارة الإنتاج والتصنيع',
  'إدارة توكيد ورقابة الجودة',
  'إدارة المخازن واللوجستيات',
  'إدارة الصيانة الهندسية',
  'إدارة المبيعات والتسويق',
  'الإدارة المالية والحسابات',
];

export default function UsersMaster({ currentUser = {}, permissions = {} }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';

  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    nameAr: '',
    email: '',
    role: 'standard',
    department: 'إدارة الإنتاج والتصنيع',
    allowedModules: ['master_data', 'purchases', 'production'],
    status: 'active',
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Live subscribe to users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.nameAr || a.name || '').localeCompare(b.nameAr || b.name || ''));
      setUsers(list);
    });
    return () => unsub();
  }, []);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const term = searchTerm.toLowerCase();
      const matchNameAr = (u.nameAr || '').toLowerCase().includes(term);
      const matchNameEn = (u.name || '').toLowerCase().includes(term);
      const matchEmail = (u.email || '').toLowerCase().includes(term);
      const matchId = (u.id || '').toLowerCase().includes(term);
      const matchDept = (u.department || '').toLowerCase().includes(term);
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      return (matchNameAr || matchNameEn || matchEmail || matchId || matchDept) && matchRole;
    });
  }, [users, searchTerm, roleFilter]);

  // Counts
  const counts = useMemo(() => {
    return {
      total: users.length,
      admins: users.filter((u) => u.role === 'general_admin' || u.isGeneralAdmin).length,
      standards: users.filter((u) => u.role !== 'general_admin' && !u.isGeneralAdmin).length,
      active: users.filter((u) => u.status !== 'inactive').length,
    };
  }, [users]);

  // Open modal for add
  const handleOpenAdd = () => {
    const nextId = `USR-${Date.now().toString().slice(-4)}`;
    setEditingUserId(null);
    setFormData({
      id: nextId,
      name: '',
      nameAr: '',
      email: '',
      role: 'standard',
      department: 'إدارة الإنتاج والتصنيع',
      allowedModules: ['master_data', 'purchases', 'production'],
      status: 'active',
    });
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (u) => {
    setEditingUserId(u.id);
    setFormData({
      id: u.id,
      name: u.name || '',
      nameAr: u.nameAr || '',
      email: u.email || '',
      role: u.role || 'standard',
      department: u.department || 'إدارة الإنتاج والتصنيع',
      allowedModules: u.allowedModules || ['master_data', 'purchases', 'production'],
      status: u.status || 'active',
    });
    setIsModalOpen(true);
  };

  // Toggle module selection
  const handleToggleModule = (modId) => {
    const current = formData.allowedModules || [];
    if (current.includes(modId)) {
      setFormData({ ...formData, allowedModules: current.filter((m) => m !== modId) });
    } else {
      setFormData({ ...formData, allowedModules: [...current, modId] });
    }
  };

  // Save user
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nameAr.trim() && !formData.name.trim()) {
      alert(isAr ? 'يرجى إدخال اسم المستخدم.' : 'Please enter user name.');
      return;
    }

    const userId = formData.id || `USR-${Date.now()}`;
    const isGenAdmin = formData.role === 'general_admin';

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'users', userId),
        {
          id: userId,
          name: formData.name.trim() || formData.nameAr.trim(),
          nameAr: formData.nameAr.trim() || formData.name.trim(),
          email: formData.email.trim(),
          role: isGenAdmin ? 'general_admin' : 'standard',
          isGeneralAdmin: isGenAdmin,
          isPurchasingAdmin: isGenAdmin || formData.allowedModules.includes('purchases'),
          department: formData.department,
          allowedModules: isGenAdmin ? MODULES_LIST.map((m) => m.id) : formData.allowedModules,
          status: formData.status,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setIsModalOpen(false);
      showToast(isAr ? 'تم حفظ بيانات المستخدم بنجاح' : 'User account saved successfully');
    } catch (err) {
      console.error('Error saving user:', err);
      alert(isAr ? 'حدث خطأ أثناء حفظ المستخدم.' : 'Failed to save user.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete user
  const handleDelete = async (uId) => {
    if (!isGeneralAdmin) {
      alert(isAr ? 'حذف المستخدمين مقتصر على المسؤول العام فقط.' : 'Only General Admin can delete users.');
      return;
    }

    if (uId === currentUser.id) {
      alert(isAr ? 'لا يمكنك حذف حسابك النشط الحالي.' : 'Cannot delete your active user account.');
      return;
    }

    if (window.confirm(isAr ? `هل أنت متأكد من حذف الحساب (${uId})؟` : `Delete user account (${uId})?`)) {
      try {
        await deleteDoc(doc(db, 'users', uId));
        showToast(isAr ? 'تم حذف المستخدم بنجاح' : 'User account deleted successfully');
      } catch (err) {
        console.error('Error deleting user:', err);
        alert(isAr ? 'حدث خطأ أثناء حذف المستخدم.' : 'Failed to delete user.');
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
            {isAr ? 'إجمالي الحسابات' : 'Total Accounts'}
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {counts.total}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'المسؤولون العامون (Admin)' : 'General Admins'}
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {counts.admins}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'المستخدمون التشغيليون' : 'Standard Users'}
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono">
            {counts.standards}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="text-[11px] text-slate-500 font-bold mb-1">
            {isAr ? 'الحسابات النشطة' : 'Active Accounts'}
          </div>
          <div className="text-2xl font-black text-indigo-700 font-mono">
            {counts.active}
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
              placeholder={isAr ? 'بحث بالاسم، البريد، الكود، أو الإدارة...' : 'Search by name, email, ID or dept...'}
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
            <option value="all">{isAr ? 'كافة الأدوار' : 'All Roles'}</option>
            <option value="general_admin">{isAr ? 'مسؤول عام (Admin)' : 'General Admin'}</option>
            <option value="standard">{isAr ? 'مستخدم تشغيلي' : 'Standard User'}</option>
          </select>
        </div>

        {isGeneralAdmin && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? 'تعريف مستخدم جديد' : 'Add User'}</span>
          </button>
        )}
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="p-3 text-start">{isAr ? 'المستخدم والحساب' : 'User & ID'}</th>
              <th className="p-3 text-start">{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
              <th className="p-3 text-start">{isAr ? 'الدور والنظام' : 'System Role'}</th>
              <th className="p-3 text-start">{isAr ? 'الوحدات المصرح بها' : 'Permitted Modules'}</th>
              <th className="p-3 text-start">{isAr ? 'الإدارة' : 'Department'}</th>
              <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
              {isGeneralAdmin && <th className="p-3 text-center">{isAr ? 'إجراءات' : 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={isGeneralAdmin ? 7 : 6} className="p-8 text-center text-slate-400">
                  {isAr ? 'لا يوجد مستخدمون يطابقون البحث.' : 'No users found.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isAdmin = u.role === 'general_admin' || u.isGeneralAdmin;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{isAr ? u.nameAr || u.name : u.name || u.nameAr}</div>
                      <div className="font-mono text-[10px] text-slate-400">{u.id}</div>
                    </td>
                    <td className="p-3 font-mono text-slate-600">
                      {u.email || '-'}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        isAdmin
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {isAdmin ? (isAr ? 'مسؤول عام (Admin)' : 'General Admin') : (isAr ? 'مستخدم قياسي' : 'Standard User')}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {isAdmin ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                            {isAr ? 'كافة الوحدات (All Modules)' : 'All Modules'}
                          </span>
                        ) : (
                          (u.allowedModules || ['master_data']).map((mKey) => {
                            const modMeta = MODULES_LIST.find((m) => m.id === mKey);
                            return (
                              <span
                                key={mKey}
                                className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold"
                              >
                                {modMeta ? (isAr ? modMeta.labelAr : modMeta.labelEn) : mKey}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-600 font-medium">
                      {u.department || '-'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        u.status !== 'inactive'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {u.status !== 'inactive' ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                      </span>
                    </td>
                    {isGeneralAdmin && (
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {u.id !== currentUser.id && (
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title={isAr ? 'حذف' : 'Delete'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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
                {editingUserId ? (isAr ? 'تعديل بيانات الحساب' : 'Edit User Profile') : (isAr ? 'تعريف مستخدم جديد' : 'Add New User')}
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
                    {isAr ? 'كود المستخدم (ID)' : 'User ID'} *
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    disabled={Boolean(editingUserId)}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'دور النظام' : 'System Role'} *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    <option value="standard">{isAr ? 'مستخدم تشغيلي قياسي' : 'Standard User'}</option>
                    <option value="general_admin">{isAr ? 'مسؤول عام (General Admin)' : 'General Admin'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'الاسم (عربي)' : 'Name (Arabic)'} *
                  </label>
                  <input
                    type="text"
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    placeholder={isAr ? 'الاسم بالعربية' : 'Arabic Name'}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="English Name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@tawoos.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'الإدارة / القسم' : 'Department'}
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isAr ? 'حالة الحساب' : 'Account Status'}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold cursor-pointer"
                  >
                    <option value="active">{isAr ? 'نشط ومصرح له بالدخول' : 'Active'}</option>
                    <option value="inactive">{isAr ? 'معطل / موقوف' : 'Inactive'}</option>
                  </select>
                </div>
              </div>

              {formData.role !== 'general_admin' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-2">
                    {isAr ? 'الوحدات المصرح بالوصول إليها' : 'Permitted Modules'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {MODULES_LIST.map((mod) => {
                      const isChecked = (formData.allowedModules || []).includes(mod.id);
                      return (
                        <label
                          key={mod.id}
                          className={`p-2 rounded-lg border flex items-center gap-2 cursor-pointer transition select-none ${
                            isChecked
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleModule(mod.id)}
                            className="accent-emerald-600 rounded h-3.5 w-3.5 shrink-0"
                          />
                          <span className="truncate">
                            {isAr ? mod.labelAr : mod.labelEn}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الحساب' : 'Save User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
