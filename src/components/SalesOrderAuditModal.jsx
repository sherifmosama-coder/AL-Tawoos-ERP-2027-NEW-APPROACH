import React, { useState, useMemo } from 'react';
import {
  History,
  X,
  User,
  Clock,
  ArrowRight,
  CheckCircle2,
  Edit3,
  PlusCircle,
  Search,
  Building2,
  MapPin,
  FileText,
  Boxes,
  Trash2,
  Receipt,
  FileCheck,
  XCircle,
  RotateCcw,
  Truck,
  GitFork,
  PackageMinus,
  ClipboardCheck,
  Store
} from 'lucide-react';

export default function SalesOrderAuditModal({
  isOpen,
  onClose,
  order,
  isAr = true
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const auditTrail = useMemo(() => {
    return Array.isArray(order?.auditTrail) ? order.auditTrail : [];
  }, [order]);

  const filteredEntries = useMemo(() => {
    const list = [...auditTrail].reverse();

    return list.filter((entry) => {
      if (actionFilter !== 'all') {
        if (actionFilter === 'create' && entry.action !== 'create') return false;
        if (actionFilter === 'dispatch' && entry.action !== 'dispatch_plan_update' && entry.action !== 'dispatch_assignment') return false;
        if (
          actionFilter === 'edit' &&
          entry.action !== 'edit' &&
          entry.action !== 'status_change' &&
          entry.action !== 'toggle_revised' &&
          entry.action !== 'cancel_order' &&
          entry.action !== 'restore_order' &&
          entry.action !== 'dispatch_plan_update' &&
          entry.action !== 'dispatch_assignment' &&
          entry.action !== 'split_parent' &&
          entry.action !== 'split_child_created' &&
          entry.action !== 'split_child_updated' &&
          entry.action !== 'split_reverted' &&
          entry.action !== 'partial_rejection_sync' &&
          entry.action !== 'retail_settlement_confirmed' &&
          entry.action !== 'retail_settlement_force_synced' &&
          entry.action !== 'retail_delivery_deferred' &&
          entry.action !== 'retail_warehouse_acknowledged' &&
          entry.action !== 'retail_accounting_acknowledged'
        ) {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const user = (entry.performedBy || '').toLowerCase();
        const summaryAr = (entry.summaryAr || '').toLowerCase();
        const summaryEn = (entry.summaryEn || '').toLowerCase();

        const hasMetaMatch = (entry.changes?.metadata || []).some((m) => {
          return (
            (m.labelAr || '').toLowerCase().includes(q) ||
            (m.labelEn || '').toLowerCase().includes(q) ||
            String(m.oldValue || '').toLowerCase().includes(q) ||
            String(m.newValue || '').toLowerCase().includes(q)
          );
        });

        const hasLineMatch = (entry.changes?.lineChanges || []).some((lc) => {
          return (
            (lc.productCode || '').toLowerCase().includes(q) ||
            (lc.productNameAr || '').toLowerCase().includes(q) ||
            (lc.productNameEn || '').toLowerCase().includes(q) ||
            (lc.detailAr || '').toLowerCase().includes(q) ||
            (lc.detailEn || '').toLowerCase().includes(q)
          );
        });

        if (!user.includes(q) && !summaryAr.includes(q) && !summaryEn.includes(q) && !hasMetaMatch && !hasLineMatch) {
          return false;
        }
      }

      return true;
    });
  }, [auditTrail, actionFilter, searchTerm]);

  if (!isOpen || !order) return null;

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
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: PlusCircle,
          label: isAr ? 'إنشاء أمر البيع' : 'Order Created'
        };
      case 'status_change':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: CheckCircle2,
          label: isAr ? 'تحديث الحالة' : 'Status Updated'
        };
      case 'toggle_revised':
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: FileCheck,
          label: isAr ? 'مراجعة ومطابقة أمر الشراء' : 'PO Review & Verification'
        };
      case 'cancel_order':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: XCircle,
          label: isAr ? 'إلغاء أمر البيع' : 'Order Canceled'
        };
      case 'restore_order':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: RotateCcw,
          label: isAr ? 'استعادة وتفعيل الأمر' : 'Order Restored'
        };
      case 'dispatch_plan_update':
      case 'dispatch_assignment':
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          icon: Truck,
          label: isAr ? 'خطة التحميل والتوزيع' : 'Loading Plan & Dispatch'
        };
      case 'split_parent':
        return {
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          icon: GitFork,
          label: isAr ? 'تقسيم أمر البيع إلى شحنات' : 'Order Split into Portions'
        };
      case 'split_child_created':
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          icon: GitFork,
          label: isAr ? 'جزء ناتج عن تقسيم أمر' : 'Split Child Portion Created'
        };
      case 'split_child_updated':
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          icon: GitFork,
          label: isAr ? 'تعديل كميات/شاحنة الجزء المقسم' : 'Split Portion Updated'
        };
      case 'split_reverted':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: RotateCcw,
          label: isAr ? 'إلغاء التقسيم ودمج الأمر' : 'Split Reverted (Merged Back)'
        };
      case 'partial_rejection_sync':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: PackageMinus,
          label: isAr ? 'مزامنة الاستلام الفعلي والمرتجع' : 'Actual Qty Sync & Return'
        };
      case 'retail_settlement_confirmed':
        return {
          bg: 'bg-cyan-50 text-cyan-800 border-cyan-200',
          icon: Store,
          label: isAr ? 'تأكيد وتسوية مبيعات التجزئة' : 'Retail Trip Settled'
        };
      case 'retail_settlement_force_synced':
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          icon: Store,
          label: isAr ? 'تحديث ومزامنة تسوية التجزئة' : 'Retail Settlement Force-Synced'
        };
      case 'retail_delivery_deferred':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: Truck,
          label: isAr ? 'تسجيل الوصول (بانتظار تسوية التجزئة)' : 'Arrived (Awaiting Retail Settlement)'
        };
      case 'retail_warehouse_acknowledged':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: ClipboardCheck,
          label: isAr ? 'اعتماد المخزن لمرتجع التجزئة' : 'Warehouse Ack (Return Stock)'
        };
      case 'retail_accounting_acknowledged':
        return {
          bg: 'bg-teal-50 text-teal-800 border-teal-200',
          icon: ClipboardCheck,
          label: isAr ? 'اعتماد الحسابات لفاتورة التجزئة' : 'Accounting Ack (Adjusted Invoice)'
        };
      case 'edit':
      default:
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: Edit3,
          label: isAr ? 'تعديل أمر البيع' : 'Order Edited'
        };
    }
  };

  const orderSerial = order.serial || String(order.id || '0001').padStart(4, '0');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
              <History className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                  #{orderSerial}
                </span>
                {order.clientName && (
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-slate-200 font-bold flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    <span>{order.clientName}</span>
                  </span>
                )}
                {order.branchName && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{order.branchName}</span>
                  </span>
                )}
              </div>
              <h3 className="text-base font-black mt-0.5">
                {isAr ? 'سجل التدقيق وتاريخ تعديلات أمر البيع' : 'Sales Order Audit Trail & Revision History'}
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

        {/* Summary Strip */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'أنشئ بواسطة:' : 'Created By:'}</span>
            <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
              <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{order.createdBy || (isAr ? 'مستخدم النظام' : 'System')}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              {formatDateTime(order.createdAt)}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'آخر تعديل بواسطة:' : 'Last Modified By:'}</span>
            <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
              <Edit3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">{order.updatedBy || order.createdBy || '—'}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              {formatDateTime(order.updatedAt || order.createdAt)}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'إجمالي التعديلات:' : 'Total Revisions:'}</span>
            <span className="font-black text-indigo-700 text-sm mt-0.5 block font-mono">
              {auditTrail.length} {isAr ? 'إجراء مدوّن' : 'events'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {isAr ? 'سجل غير قابل للتعديل' : 'Immutable audit log'}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-400 font-semibold block">{isAr ? 'إجمالي أمر البيع:' : 'Order Grand Total:'}</span>
            <span className="font-black text-emerald-700 text-sm mt-0.5 block font-mono">
              {(Number(order.grandTotal) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {(order.lines || []).length} {isAr ? 'أصناف' : 'items'}
            </span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'ابحث باسم المستخدم، الحقل، الصنف...' : 'Search by user, field, product...'}
              className="w-full ps-8 pe-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', labelAr: 'الكل', labelEn: 'All' },
              { id: 'create', labelAr: 'الإنشاء', labelEn: 'Creation' },
              { id: 'edit', labelAr: 'التعديلات', labelEn: 'Edits' },
              { id: 'dispatch', labelAr: 'التحميل والتوزيع', labelEn: 'Dispatch' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActionFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  actionFilter === tab.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {isAr ? tab.labelAr : tab.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/40">
          {filteredEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
              {isAr ? 'لا توجد سجلات مطابقة لمعايير البحث.' : 'No audit entries match your search.'}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEntries.map((entry, idx) => {
                const badge = getActionBadge(entry.action);
                const BadgeIcon = badge.icon;
                const metaChanges = entry.changes?.metadata || [];
                const lineChanges = entry.changes?.lineChanges || [];

                return (
                  <div
                    key={entry.id || idx}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${badge.bg}`}>
                          <BadgeIcon className="w-3.5 h-3.5" />
                          <span>{badge.label}</span>
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {isAr ? entry.summaryAr : (entry.summaryEn || entry.summaryAr)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{entry.performedBy || 'System'}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatDateTime(entry.timestamp)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Metadata Changes */}
                    {metaChanges.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-indigo-500" />
                          <span>{isAr ? 'تغييرات بيانات أمر البيع:' : 'Order Header Changes:'}</span>
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {metaChanges.map((m, mIdx) => (
                            <div
                              key={mIdx}
                              className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex items-center justify-between gap-2"
                            >
                              <span className="font-bold text-slate-700">
                                {isAr ? m.labelAr : (m.labelEn || m.labelAr)}:
                              </span>
                              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                {m.oldValue !== undefined && m.oldValue !== '' && (
                                  <>
                                    <span className="text-rose-600 line-through bg-rose-50 px-1.5 py-0.5 rounded">
                                      {String(m.oldValue)}
                                    </span>
                                    <ArrowRight className="w-3 h-3 text-slate-400 rtl:rotate-180" />
                                  </>
                                )}
                                <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {String(m.newValue || '—')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Line Item Changes */}
                    {lineChanges.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                          <Boxes className="w-3 h-3 text-indigo-500" />
                          <span>{isAr ? `بنود الأصناف (${lineChanges.length}):` : `Product Line Items (${lineChanges.length}):`}</span>
                        </span>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-start border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                                <th className="py-1.5 px-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                                <th className="py-1.5 px-3 text-start">{isAr ? 'الإجراء' : 'Change'}</th>
                                <th className="py-1.5 px-3 text-start">{isAr ? 'التفاصيل' : 'Details'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {lineChanges.map((lc, lIdx) => (
                                <tr key={lIdx} className="hover:bg-slate-50/70">
                                  <td className="py-1.5 px-3 font-bold text-slate-800">
                                    <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded me-1.5">
                                      {lc.productCode}
                                    </span>
                                    <span>{isAr ? lc.productNameAr : (lc.productNameEn || lc.productNameAr)}</span>
                                  </td>
                                  <td className="py-1.5 px-3">
                                    {lc.type === 'added' && (
                                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        {isAr ? 'إضافة صنف' : 'Added'}
                                      </span>
                                    )}
                                    {lc.type === 'removed' && (
                                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                        {isAr ? 'حذف صنف' : 'Removed'}
                                      </span>
                                    )}
                                    {lc.type === 'modified' && (
                                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                        {isAr ? 'تعديل كمية/خصم' : 'Modified'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-3 font-mono text-[11px] text-slate-700">
                                    {isAr ? lc.detailAr : (lc.detailEn || lc.detailAr)}
                                  </td>
                                </tr>
                              ))}
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

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            {isAr ? 'إغلاق السجل' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
