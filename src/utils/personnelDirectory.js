/**
 * Unified HR-Ready Personnel Directory & Departments Utilities
 *
 * Single source of truth helpers for:
 *  - `departments` (Master Departments)
 *  - `employees` (Unified HR-Ready Staff, Workers & System Users)
 *  - `users` (System login accounts synced automatically when isSystemUser === true)
 */

export const DEFAULT_SEED_DEPARTMENTS = [
  {
    id: 'DEPT-EXEC',
    code: 'EXEC',
    nameAr: 'الإدارة العليا',
    nameEn: 'Executive Management',
    description: 'الإدارة العامة واتخاذ القرار والرقابة العليا',
    color: 'slate',
    isActive: true,
  },
  {
    id: 'DEPT-SALES',
    code: 'SALES',
    nameAr: 'إدارة المبيعات والتسويق',
    nameEn: 'Sales & Marketing',
    description: 'أوامر البيع، خطة التحميل، التوزيع ومتابعة العملاء',
    color: 'indigo',
    isActive: true,
  },
  {
    id: 'DEPT-WH',
    code: 'WH',
    nameAr: 'إدارة المخازن واللوجستيات',
    nameEn: 'Warehouses & Logistics',
    description: 'مخازن الخامات والمنتج التام، صرف الشاحنات، السائقين والعمالة',
    color: 'teal',
    isActive: true,
  },
  {
    id: 'DEPT-PROD',
    code: 'PROD',
    nameAr: 'إدارة الإنتاج والتصنيع',
    nameEn: 'Production & Manufacturing',
    description: 'أوامر التشغيل، خطوط الإنتاج، التعبئة والتغليف',
    color: 'amber',
    isActive: true,
  },
  {
    id: 'DEPT-PURCH',
    code: 'PURCH',
    nameAr: 'إدارة سلاسل الإمداد والمشتريات',
    nameEn: 'Supply Chain & Procurement',
    description: 'الموردين، أوامر الشراء، استلامات الخامات',
    color: 'sky',
    isActive: true,
  },
  {
    id: 'DEPT-FIN',
    code: 'FIN',
    nameAr: 'الإدارة المالية والحسابات',
    nameEn: 'Finance & Accounting',
    description: 'الخزائن، البنوك، قيود اليومية، العهد ومطابقات المرتجعات',
    color: 'emerald',
    isActive: true,
  },
  {
    id: 'DEPT-QC',
    code: 'QC',
    nameAr: 'إدارة توكيد ورقابة الجودة',
    nameEn: 'Quality Assurance & Control',
    description: 'فحص الخامات والمنتج التام ومطابقة المواصفات',
    color: 'purple',
    isActive: true,
  },
  {
    id: 'DEPT-MAINT',
    code: 'MAINT',
    nameAr: 'إدارة الصيانة الهندسية',
    nameEn: 'Engineering & Maintenance',
    description: 'صيانة المعدات وخطوط الإنتاج والأسطول',
    color: 'rose',
    isActive: true,
  },
];

export const OPERATIONAL_TAGS = [
  { id: 'driver', labelAr: 'سائق', labelEn: 'Driver', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  { id: 'loader', labelAr: 'عامل تحميل / تفريغ', labelEn: 'Loader / Offloader', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
  { id: 'delivery_rep', labelAr: 'مندوب تسليم', labelEn: 'Delivery Rep', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { id: 'operator', labelAr: 'فني تشغيل / إنتاج', labelEn: 'Production Operator', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'supervisor', labelAr: 'مشرف', labelEn: 'Supervisor', cls: 'bg-purple-50 text-purple-800 border-purple-200' },
  { id: 'warehouse', labelAr: 'أمين مخزن', labelEn: 'Warehouse Keeper', cls: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  { id: 'sales', labelAr: 'مبيعات', labelEn: 'Sales', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  { id: 'accounting', labelAr: 'محاسب / مالية', labelEn: 'Accounting / Finance', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { id: 'quality', labelAr: 'جودة', labelEn: 'Quality', cls: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200' },
  { id: 'maintenance', labelAr: 'صيانة', labelEn: 'Maintenance', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  { id: 'admin', labelAr: 'إداري', labelEn: 'Admin / Office', cls: 'bg-slate-100 text-slate-800 border-slate-300' },
];

export const DEPARTMENT_COLOR_MAP = {
  slate: { badge: 'bg-slate-100 text-slate-800 border-slate-300', bar: 'bg-slate-700' },
  indigo: { badge: 'bg-indigo-50 text-indigo-800 border-indigo-200', bar: 'bg-indigo-600' },
  teal: { badge: 'bg-teal-50 text-teal-800 border-teal-200', bar: 'bg-teal-600' },
  amber: { badge: 'bg-amber-50 text-amber-900 border-amber-200', bar: 'bg-amber-500' },
  sky: { badge: 'bg-sky-50 text-sky-800 border-sky-200', bar: 'bg-sky-600' },
  emerald: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', bar: 'bg-emerald-600' },
  purple: { badge: 'bg-purple-50 text-purple-800 border-purple-200', bar: 'bg-purple-600' },
  rose: { badge: 'bg-rose-50 text-rose-800 border-rose-200', bar: 'bg-rose-600' },
};

/**
 * Matches a legacy free-text department name to a department record.
 */
export function matchDepartmentByName(rawDepartment = '', departments = []) {
  const norm = String(rawDepartment || '').trim().toLowerCase();
  if (!norm || !Array.isArray(departments) || departments.length === 0) return null;

  // 1. Exact match on nameAr, nameEn, code, or id
  const exact = departments.find(
    (d) =>
      String(d.id || '').toLowerCase() === norm ||
      String(d.code || '').toLowerCase() === norm ||
      String(d.nameAr || '').trim().toLowerCase() === norm ||
      String(d.nameEn || '').trim().toLowerCase() === norm
  );
  if (exact) return exact;

  // 2. Keyword substring heuristic for Arabic/English legacy strings
  const rules = [
    { keys: ['عليا', 'executive', 'admin', 'عام'], targetCode: 'EXEC' },
    { keys: ['مبيعات', 'تسويق', 'sales', 'marketing'], targetCode: 'SALES' },
    { keys: ['مخازن', 'لوجست', 'نقل', 'توزيع', 'warehouse', 'logistics'], targetCode: 'WH' },
    { keys: ['إنتاج', 'تصنيع', 'تعبئة', 'تغليف', 'صالة', 'production', 'packing'], targetCode: 'PROD' },
    { keys: ['مشتريات', 'إمداد', 'procurement', 'supply'], targetCode: 'PURCH' },
    { keys: ['مالية', 'حسابات', 'finance', 'account'], targetCode: 'FIN' },
    { keys: ['جودة', 'quality', 'qc', 'qa'], targetCode: 'QC' },
    { keys: ['صيانة', 'هندسية', 'maintenance'], targetCode: 'MAINT' },
  ];

  for (const r of rules) {
    if (r.keys.some((k) => norm.includes(k))) {
      const found = departments.find((d) => String(d.code || '').toUpperCase() === r.targetCode);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Resolves all assigned department IDs for an employee or user record (supports multi-department membership).
 * Falls back cleanly to legacy single `departmentId` or free-text `department` name.
 */
export function getRecordDepartmentIds(record = null, departments = []) {
  if (!record) return [];
  const ids = [];
  if (Array.isArray(record.departmentIds) && record.departmentIds.length > 0) {
    record.departmentIds.forEach((id) => {
      const clean = String(id || '').trim();
      if (clean && !ids.includes(clean)) ids.push(clean);
    });
  }
  if (ids.length === 0 && record.departmentId) {
    const clean = String(record.departmentId).trim();
    if (clean) ids.push(clean);
  }
  if (ids.length === 0 && record.department && Array.isArray(departments) && departments.length > 0) {
    const matched = matchDepartmentByName(record.department, departments);
    if (matched?.id) ids.push(matched.id);
  }
  return ids;
}

/**
 * Unified personnel selector pool for operational tabs (Drivers, Loaders, Operators, Custodians, etc.).
 * Uses `employees` as the single source of truth, merging any active `users` not yet linked to an employee record.
 */
export function buildUnifiedPersonnelPool({
  employees = [],
  users = [],
  isAr = true,
  filterTag = null,
  activeOnly = true,
} = {}) {
  const result = [];
  const seenIds = new Set();
  const seenLinkedUsers = new Set();

  (employees || []).forEach((emp) => {
    if (!emp?.id) return;
    if (activeOnly && (emp.status === 'inactive' || emp.isActive === false)) return;
    if (filterTag && !(Array.isArray(emp.operationalTags) && emp.operationalTags.includes(filterTag))) return;
    seenIds.add(emp.id);
    if (emp.linkedUserId) seenLinkedUsers.add(emp.linkedUserId);
    result.push({
      id: emp.id,
      linkedUserId: emp.linkedUserId || null,
      name: isAr ? (emp.nameAr || emp.nameEn) : (emp.nameEn || emp.nameAr),
      nameAr: emp.nameAr || emp.nameEn || '',
      nameEn: emp.nameEn || emp.nameAr || '',
      departmentId: emp.departmentId || '',
      departmentIds: getRecordDepartmentIds(emp),
      departmentNameAr: emp.departmentNameAr || '',
      jobTitle: emp.jobTitle || '',
      role: emp.jobTitle || (emp.isSystemUser ? (isAr ? 'مستخدم نظام' : 'System User') : ''),
      operationalTags: Array.isArray(emp.operationalTags) ? emp.operationalTags : [],
      isSystemUser: Boolean(emp.isSystemUser),
      source: 'employees',
    });
  });

  (users || []).forEach((u) => {
    if (!u?.id || seenIds.has(u.id) || seenLinkedUsers.has(u.id)) return;
    if (activeOnly && (u.status === 'inactive' || u.isActive === false)) return;
    if (filterTag) return;
    seenIds.add(u.id);
    result.push({
      id: u.id,
      linkedUserId: u.id,
      name: isAr ? (u.nameAr || u.name) : (u.name || u.nameAr),
      nameAr: u.nameAr || u.name || '',
      nameEn: u.name || u.nameAr || '',
      departmentId: u.departmentId || '',
      departmentIds: getRecordDepartmentIds(u),
      departmentNameAr: u.department || '',
      jobTitle: u.jobTitle || u.role || '',
      role: u.jobTitle || u.role || '',
      operationalTags: [],
      isSystemUser: true,
      source: 'users',
    });
  });

  result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), isAr ? 'ar' : 'en'));
  return result;
}
