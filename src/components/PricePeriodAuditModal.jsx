import React, { useState, useMemo } from 'react';
import {
  History,
  X,
  User,
  Calendar,
  Clock,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Edit3,
  PlusCircle,
  FileText,
  Layers,
  Search,
  Copy,
  Tag,
  Building2,
  Sparkles,
  Check,
  Percent
} from 'lucide-react';
import { formatDateKey } from '../utils/pricingEngine';

export default function PricePeriodAuditModal({
  isOpen,
  onClose,
  period,
  strategies = [],
  products = [],
  clients = [],
  isAr = true
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  if (!isOpen || !period) return null;

  const auditTrail = Array.isArray(period.auditTrail) ? period.auditTrail : [];

  // Filtered timeline entries (newest first)
  const filteredEntries = useMemo(() => {
    // Reverse array to show newest first
    const list = [...auditTrail].reverse();

    return list.filter((entry) => {
      // Action filter
      if (actionFilter !== 'all') {
        if (actionFilter === 'create' && entry.action !== 'create' && entry.action !== 'duplicate_created') {
          return false;
        }
        if (actionFilter === 'edit' && entry.action !== 'edit') {
          return false;
        }
        if (actionFilter === 'activate' && entry.action !== 'activate_draft') {
          return false;
        }
        if (actionFilter === 'close' && entry.action !== 'close_now' && entry.action !== 'auto_closed') {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const user = (entry.performedBy || '').toLowerCase();
        const summaryAr = (entry.summaryAr || '').toLowerCase();
        const summaryEn = (entry.summaryEn || '').toLowerCase();
        const action = (entry.action || '').toLowerCase();

        // Also check if any product in priceChanges matches
        const hasProdMatch = (entry.changes?.priceChanges || []).some((pc) => {
          return (
            (pc.productCode || '').toLowerCase().includes(q) ||
            (pc.productNameAr || '').toLowerCase().includes(q) ||
            (pc.productNameEn || '').toLowerCase().includes(q)
          );
        });

        // Also check if any metadata field matches
        const hasMetaMatch = (entry.changes?.metadata || []).some((m) => {
          return (
            (m.labelAr || '').toLowerCase().includes(q) ||
            (m.labelEn || '').toLowerCase().includes(q) ||
            String(m.newValue || '').toLowerCase().includes(q)
          );
        });

        if (
          !user.includes(q) &&
          !summaryAr.includes(q) &&
          !summaryEn.includes(q) &&
          !action.includes(q) &&
          !hasProdMatch &&
          !hasMetaMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [auditTrail, actionFilter, searchTerm]);

  // Strategy lookup
  const strategyObj = strategies.find((s) => s.id === period.strategyId);
  const strategyName = isAr
    ? strategyObj?.nameAr || period.strategyNameAr || period.strategyId
    : strategyObj?.nameEn || period.strategyId;

  // Format date helper
  const formatDateTime = (timestamp) => {
    if (!timestamp) return '—';
    try {
      const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return d.toLocaleString(isAr ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return String(timestamp);
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'create':
      case 'duplicate_created':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: PlusCircle,
          label: isAr ? 'إنشاء الفترة' : 'Creation'
        };
      case 'edit':
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: Edit3,
          label: isAr ? 'تعديل أسعار وبيانات' : 'Edit'
        };
      case 'activate_draft':
        return {
          bg: 'bg-teal-50 text-teal-800 border-teal-200',
          icon: CheckCircle2,
          label: isAr ? 'اعتماد المسودة' : 'Activated'
        };
      case 'close_now':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: Clock,
          label: isAr ? 'إغلاق فوري' : 'Closed'
        };
      case 'auto_closed':
        return {
          bg: 'bg-slate-100 text-slate-700 border-slate-300',
          icon: Clock,
          label: isAr ? 'إغلاق تلقائي للتداخل' : 'Auto Closed'
        };
      case 'duplicate':
        return {
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          icon: Copy,
          label: isAr ? 'استنساخ' : 'Duplicated'
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          icon: History,
          label: isAr ? 'إجراء نظام' : 'System Action'
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate__animated animate__fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate__animated animate__fadeInUp animate__faster">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <History className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                  {period.id}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-slate-200 font-bold">
                  {strategyName}
                </span>
                {period.clientName && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 font-bold flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    <span>{period.clientName}</span>
                  </span>
                )}
              </div>
              <h3 className="text-base font-black mt-0.5">
                {isAr ? 'سجل التدقيق وتاريخ التعديلات التفصيلي' : 'Comprehensive Audit Trail & Revision History'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Audit Metadata Summary Strip */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'أنشئت بواسطة:' : 'Created By:'}</span>
            <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
              <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{period.createdBy || (isAr ? 'مستخدم النظام' : 'System')}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              {formatDateTime(period.createdAt)}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'آخر تعديل بواسطة:' : 'Last Modified By:'}</span>
            <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
              <Edit3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">{period.updatedBy || period.createdBy || '—'}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              {formatDateTime(period.updatedAt || period.createdAt)}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'إجمالي التعديلات:' : 'Total Revisions:'}</span>
            <span className="font-black text-indigo-700 text-sm mt-0.5 block font-mono">
              {auditTrail.length} {isAr ? 'إجراء مدوّن' : 'recorded events'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {isAr ? 'سجل غير قابل للتعديل' : 'Immutable audit log'}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'الحالة والصلاحية:' : 'Status & Scope:'}</span>
            <span className="font-bold text-slate-800 mt-0.5 block">
              {period.status === 'draft' ? (
                <span className="text-amber-700 font-bold">📝 {isAr ? 'مسودة' : 'Draft'}</span>
              ) : period.status === 'expired' ? (
                <span className="text-rose-700 font-bold">⏹️ {isAr ? 'منتهية ومغلقة' : 'Expired'}</span>
              ) : (
                <span className="text-emerald-700 font-bold">✅ {isAr ? 'سارية حالياً' : 'Active'}</span>
              )}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
              {period.startDate} ➔ {period.endDate || (isAr ? 'مستمرة' : 'Indefinite')}
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'ابحث في السجل بالمسؤول، الإجراء، أو الصنف المعدل...' : 'Search audit by user, action, or product...'}
              className="w-full ps-9 pe-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActionFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                actionFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {isAr ? 'الكل' : 'All'} ({auditTrail.length})
            </button>
            <button
              type="button"
              onClick={() => setActionFilter('create')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                actionFilter === 'create'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
              }`}
            >
              {isAr ? 'الإنشاء' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setActionFilter('edit')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                actionFilter === 'edit'
                  ? 'bg-blue-700 text-white'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
              }`}
            >
              {isAr ? 'التعديلات' : 'Edits'}
            </button>
            <button
              type="button"
              onClick={() => setActionFilter('activate')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                actionFilter === 'activate'
                  ? 'bg-teal-700 text-white'
                  : 'bg-teal-50 hover:bg-teal-100 text-teal-700'
              }`}
            >
              {isAr ? 'التفعيل' : 'Activations'}
            </button>
            <button
              type="button"
              onClick={() => setActionFilter('close')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                actionFilter === 'close'
                  ? 'bg-rose-700 text-white'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700'
              }`}
            >
              {isAr ? 'الإغلاق' : 'Closings'}
            </button>
          </div>
        </div>

        {/* Timeline Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {auditTrail.length === 0 ? (
            <div className="p-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
              <History className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-slate-700 font-bold text-sm">
                  {isAr ? 'لا يوجد سجل تعديلات تفصيلي مسجل لهذه الفترة بعد' : 'No detailed audit events recorded yet'}
                </p>
                <p className="text-slate-400 text-xs max-w-md mx-auto">
                  {isAr
                    ? 'تم إنشاء هذه الفترة مسبقاً قبل تفعيل نظام تدقيق أسعار الأصناف التلقائي، أو تم حفظها بدون تعديلات لاحقة.'
                    : 'This period was created before automated price diff tracking, or has not been modified since creation.'}
                </p>
              </div>
              <div className="pt-2 text-xs text-slate-500 font-mono">
                {period.createdBy && (
                  <span>
                    {isAr ? 'المنشئ الأولي:' : 'Initial Creator:'} <strong>{period.createdBy}</strong> ({formatDateTime(period.createdAt)})
                  </span>
                )}
              </div>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-8 text-center space-y-2 bg-slate-50 rounded-2xl border border-slate-200">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-slate-500 font-bold text-xs">
                {isAr ? 'لا توجد سجلات تطابق معايير البحث الحالية' : 'No audit entries match search filter'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEntries.map((entry, idx) => {
                const badge = getActionBadge(entry.action);
                const ActionIcon = badge.icon;
                const metadataDiffs = entry.changes?.metadata || [];
                const priceDiffs = entry.changes?.priceChanges || [];

                return (
                  <div
                    key={entry.id || idx}
                    className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3 transition hover:border-slate-300"
                  >
                    {/* Entry Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold text-xs ${badge.bg}`}
                        >
                          <ActionIcon className="w-3.5 h-3.5" />
                          <span>{isAr ? entry.actionLabelAr || badge.label : entry.actionLabelEn || badge.label}</span>
                        </span>

                        <div className="flex items-center gap-1 font-bold text-slate-800">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{entry.performedBy || (isAr ? 'مستخدم معتمد' : 'User')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatDateTime(entry.timestamp)}</span>
                      </div>
                    </div>

                    {/* Summary Message */}
                    <div className="text-xs font-semibold text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {isAr ? entry.summaryAr || 'تم إجراء تعديل على الفترة' : entry.summaryEn || 'Period modified'}
                    </div>

                    {/* Metadata Changes */}
                    {metadataDiffs.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          {isAr ? 'تعديلات البيانات الأساسية للفترة:' : 'Metadata Changes:'}
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {metadataDiffs.map((m, mIdx) => (
                            <div key={mIdx} className="bg-slate-50/70 p-2 rounded-xl border border-slate-200">
                              <span className="text-slate-400 font-semibold block text-[11px]">
                                {isAr ? m.labelAr : m.labelEn}:
                              </span>
                              <div className="flex items-center gap-1.5 font-bold mt-1 text-xs">
                                <span className="text-slate-400 line-through bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                  {m.oldValue || (isAr ? 'غير محدد' : 'None')}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] border border-blue-100">
                                  {m.newValue}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Price Changes Table */}
                    {priceDiffs.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5 text-indigo-500" />
                            <span>
                              {isAr
                                ? `تعديل أسعار (${priceDiffs.length}) صنف تام:`
                                : `Modified prices for (${priceDiffs.length}) finished goods:`}
                            </span>
                          </span>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-60 overflow-y-auto">
                          <table className="w-full text-start text-xs border-collapse">
                            <thead className="bg-slate-50 sticky top-0 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                              <tr>
                                <th className="py-2 px-3 text-start">{isAr ? 'كود واسم الصنف التام' : 'Product'}</th>
                                <th className="py-2 px-3 text-start">{isAr ? 'السعر السابق' : 'Old Price'}</th>
                                <th className="py-2 px-3 text-start">{isAr ? 'السعر الجديد' : 'New Price'}</th>
                                <th className="py-2 px-3 text-start">{isAr ? 'الفارق والنسبة' : 'Diff & %'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                              {priceDiffs.map((pc, pcIdx) => {
                                const isIncrease = pc.diff > 0;
                                const isDecrease = pc.diff < 0;
                                const isNew = pc.oldPrice === null || pc.oldPrice === undefined;

                                return (
                                  <tr key={pcIdx} className="hover:bg-slate-50/70 transition">
                                    <td className="py-2 px-3">
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[11px] text-blue-600 font-bold">
                                          {pc.productCode}
                                        </span>
                                        <span className="font-bold text-slate-800">
                                          {isAr ? pc.productNameAr : pc.productNameEn}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 font-mono text-slate-400">
                                      {isNew ? (
                                        <span className="text-slate-300 italic text-[11px]">
                                          {isAr ? 'تسعير أولي' : 'Initial'}
                                        </span>
                                      ) : (
                                        <span className="line-through">{Number(pc.oldPrice).toFixed(2)} ج.م</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 font-mono font-black text-slate-900">
                                      {pc.newPrice !== null && pc.newPrice !== undefined
                                        ? `${Number(pc.newPrice).toFixed(2)} ج.م`
                                        : (isAr ? 'تم الحذف' : 'Cleared')}
                                    </td>
                                    <td className="py-2 px-3">
                                      {isNew ? (
                                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold text-[10px] border border-purple-200">
                                          <Sparkles className="w-2.5 h-2.5" />
                                          <span>{isAr ? 'جديد' : 'New'}</span>
                                        </span>
                                      ) : isIncrease ? (
                                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-mono font-bold text-[10px] border border-amber-200">
                                          <ArrowUpRight className="w-3 h-3 text-amber-600" />
                                          <span>+{pc.diff.toFixed(2)}</span>
                                          {pc.percentDiff && <span className="text-[9px]">({pc.percentDiff})</span>}
                                        </span>
                                      ) : isDecrease ? (
                                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-mono font-bold text-[10px] border border-emerald-200">
                                          <ArrowDownRight className="w-3 h-3 text-emerald-600" />
                                          <span>{pc.diff.toFixed(2)}</span>
                                          {pc.percentDiff && <span className="text-[9px]">({pc.percentDiff})</span>}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-mono text-[11px]">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400 font-medium">
            {isAr
              ? `عرض ${filteredEntries.length} من أصل ${auditTrail.length} سجل تعديل`
              : `Showing ${filteredEntries.length} of ${auditTrail.length} audit entries`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition cursor-pointer"
          >
            {isAr ? 'إغلاق السجل' : 'Close Audit'}
          </button>
        </div>
      </div>
    </div>
  );
}
