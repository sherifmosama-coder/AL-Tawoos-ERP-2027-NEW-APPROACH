export const ORDER_TYPE_META = {
  supply: { ar: 'أمر توريد', en: 'Supply', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  replacement_old: { ar: 'إحلال وتبديل', en: 'Replacement', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  exchange: { ar: 'تبديل أصناف', en: 'Exchange', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  return_deduct: { ar: 'مرتجع خصم', en: 'Return (Deduct)', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  return_no_deduct: { ar: 'مرتجع بدون خصم', en: 'Return (No Deduct)', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export const WORKER_ROLE_LABELS = {
  operator: { ar: 'عامل تشغيل', en: 'Operator' },
  maintenance_tech: { ar: 'فني صيانة', en: 'Maintenance Tech' },
  qc_inspector: { ar: 'مراقب جودة', en: 'QC Inspector' },
  line_leader: { ar: 'مشرف خط', en: 'Line Leader' },
  assistant: { ar: 'مساعد تحميل / توزيع', en: 'Loader / Assistant' },
  forklift_driver: { ar: 'سائق كلارك', en: 'Forklift Driver' },
};

export function fmtCtn(val) {
  const n = Number(val || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

