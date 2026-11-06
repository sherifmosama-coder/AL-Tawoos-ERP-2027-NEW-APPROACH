import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordComments } from '../../context/CommentContext';
import { isUserAuthorizedForTab } from '../../utils/commentEngine';
import {
  X,
  Search,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  UserCheck,
  ShieldAlert,
  Paperclip
} from 'lucide-react';

export default function GlobalCommentsDrawer() {
  const {
    threads,
    isDrawerOpen,
    setIsDrawerOpen,
    jumpToTarget,
    currentUser,
    cloudPermissions = {},
    stats
  } = useRecordComments();

  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'open' | 'action_required' | 'assigned_to_me' | 'resolved'
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and search threads with strict RBAC record access
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      // 0. Strict RBAC: User must have access to the target record's tab/module
      const isAuthorized = isUserAuthorizedForTab({
        user: currentUser,
        targetModule: t.targetModule,
        targetTab: t.targetTab,
        cloudPermissions
      });
      if (!isAuthorized) return false;

      // 1. Status Filter
      if (activeFilter === 'open' && t.status !== 'open') return false;
      if (activeFilter === 'resolved' && t.status !== 'resolved') return false;
      if (activeFilter === 'action_required' && (!t.isActionRequired || t.status === 'resolved')) return false;
      if (activeFilter === 'assigned_to_me') {
        const msgs = Array.isArray(t.messages) ? t.messages : [];
        const actionMsgsForMe = msgs.filter(
          (m) => m && m.isActionRequired && Array.isArray(m.assignedUserIds) && m.assignedUserIds.includes(currentUser?.id)
        );
        const hasUnresolvedTask = actionMsgsForMe.length > 0
          ? actionMsgsForMe.some((m) => !m.isResolved)
          : (t.isActionRequired && Array.isArray(t.assignedUserIds) && currentUser?.id && t.assignedUserIds.includes(currentUser.id));
        if (!hasUnresolvedTask || t.status === 'resolved') return false;
      }

      // 2. Sensitive Field Filter (hide from unauthorized users)
      if (t.isSensitive) {
        const hasSensitiveAccess =
          currentUser?.isGeneralAdmin ||
          currentUser?.role === 'general_admin' ||
          currentUser?.canViewSensitiveCosts ||
          cloudPermissions[currentUser?.id]?.sensitive?.[t.targetFieldKey] === true ||
          cloudPermissions[currentUser?.id]?.sensitive?.all === true ||
          currentUser?.permissions?.sensitive?.[t.targetFieldKey] === true ||
          currentUser?.permissions?.sensitive?.all === true;
        if (!hasSensitiveAccess) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const docMatch = (t.targetDocNumber || t.targetDocId || '').toLowerCase().includes(q);
        const fieldMatch = (t.targetFieldLabel || t.targetFieldKey || '').toLowerCase().includes(q);
        const authorMatch = (t.createdByName || '').toLowerCase().includes(q);
        const messageMatch = (Array.isArray(t.messages) ? t.messages : []).some((m) => ((m?.text || '')).toLowerCase().includes(q));
        if (!docMatch && !fieldMatch && !authorMatch && !messageMatch) return false;
      }

      return true;
    });
  }, [threads, activeFilter, searchQuery, currentUser]);

  if (!isDrawerOpen) return null;

  return (
    <div className={`fixed inset-0 z-9999 flex ${isAr ? 'justify-start' : 'justify-end'} animate-in fade-in duration-200`}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={() => setIsDrawerOpen(false)}
      />

      {/* Slide-Over Drawer */}
      <div
        className={`relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in ${
          isAr ? 'slide-in-from-left text-right' : 'slide-in-from-right text-left'
        } duration-200 select-none text-xs`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                {isAr ? 'مركز المحادثات والمهام' : 'Comments & Collaborative Tasks'}
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                {isAr
                  ? `${stats.openCount} محادثة مفتوحة${stats.actionRequiredForMe > 0 ? ` • ${stats.actionRequiredForMe} إجراء مطلوب منك` : ''}`
                  : `${stats.openCount} open threads${stats.actionRequiredForMe > 0 ? ` • ${stats.actionRequiredForMe} tasks assigned to you` : ''}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            title={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. Search Box */}
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'البحث في التعليقات، السجلات، الحقول، أو الأشخاص...' : 'Search comments, records, fields, or teammates...'}
              className="w-full ps-9 pe-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: isAr ? 'الكل' : 'All' },
              { id: 'open', label: isAr ? 'مفتوحة' : 'Open' },
              { id: 'action_required', label: isAr ? 'إجراءات مطلوبة' : 'Action Required' },
              { id: 'assigned_to_me', label: isAr ? 'معينة لي' : 'Assigned to Me' },
              { id: 'resolved', label: isAr ? 'مكتملة ومغلقة' : 'Resolved' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`
                  px-2.5 py-1 rounded-xl font-bold text-[11px] whitespace-nowrap transition cursor-pointer
                  ${
                    activeFilter === f.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }
                `}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Thread List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50">
          {filteredThreads.length > 0 ? (
            filteredThreads.map((t) => {
              const msgs = Array.isArray(t.messages) ? t.messages : [];
              const lastMessage = msgs.length > 0 ? msgs[msgs.length - 1] : null;
              const actionMsgsForMe = msgs.filter(
                (m) => m && m.isActionRequired && Array.isArray(m.assignedUserIds) && m.assignedUserIds.includes(currentUser?.id)
              );
              const isAssignedToMe = t.status === 'open' && (
                actionMsgsForMe.length > 0
                  ? actionMsgsForMe.some((m) => !m.isResolved)
                  : (t.isActionRequired && Array.isArray(t.assignedUserIds) && currentUser?.id && t.assignedUserIds.includes(currentUser.id))
              );

              return (
                <div
                  key={t.id}
                  onClick={() =>
                    jumpToTarget({
                      module: t.targetModule,
                      tab: t.targetTab,
                      docId: t.targetDocId,
                      fieldKey: t.targetFieldKey
                    })
                  }
                  className={`
                    p-3.5 bg-white border rounded-2xl shadow-xs hover:shadow-md transition cursor-pointer group
                    ${
                      isAssignedToMe
                        ? 'border-amber-300 ring-1 ring-amber-200'
                        : t.status === 'resolved'
                        ? 'border-slate-200 opacity-75'
                        : 'border-slate-200 hover:border-emerald-300'
                    }
                  `}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-extrabold text-slate-900 truncate">
                        {t.targetDocNumber || t.targetDocId}
                      </span>
                      {t.targetFieldLabel && (
                        <>
                          <span className="text-slate-300">/</span>
                          <span className="font-semibold text-slate-500 truncate max-w-[130px]">
                            {t.targetFieldLabel}
                          </span>
                        </>
                      )}
                      {t.isSensitive && (
                        <ShieldAlert className="h-3 w-3 text-amber-600 shrink-0" title={isAr ? 'حقل حساس' : 'Sensitive Field'} />
                      )}
                    </div>

                    <div className="shrink-0">
                      {t.status === 'resolved' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          <CheckCircle className="h-2.5 w-2.5 text-slate-400" />
                          {isAr ? 'مكتمل' : 'Resolved'}
                        </span>
                      ) : t.isActionRequired ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                          <AlertCircle className="h-2.5 w-2.5 text-amber-600" />
                          {isAr ? 'مهمة' : 'Task'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {isAr ? 'نشط' : 'Active'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Message Snippet */}
                  {lastMessage && (
                    <div dir="auto" className="text-slate-700 text-xs mb-2 leading-relaxed line-clamp-2">
                      <span className="font-bold text-slate-900 me-1">{lastMessage.authorName}:</span>
                      {Array.isArray(lastMessage.attachments) && lastMessage.attachments.length > 0 && (
                        <Paperclip className="h-3 w-3 text-emerald-600 inline me-1" />
                      )}
                      {lastMessage.text}
                    </div>
                  )}

                  {/* Assigned to badge */}
                  {t.isActionRequired && t.assignedUserNames?.length > 0 && (
                    <div className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md font-semibold mb-2">
                      <UserCheck className="h-3 w-3 text-amber-600" />
                      <span>{isAr ? `معين إلى: ${t.assignedUserNames.join(', ')}` : `Assigned to: ${t.assignedUserNames.join(', ')}`}</span>
                    </div>
                  )}

                  {/* Footer & Jump Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="h-2.5 w-2.5" />
                      {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : ''}
                    </span>

                    <span className="flex items-center gap-1 text-emerald-600 group-hover:text-emerald-700 font-bold group-hover:translate-x-[-2px] rtl:group-hover:translate-x-[2px] transition-transform">
                      <span>{isAr ? 'انتقال للسجل' : 'Jump to Record'}</span>
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <MessageSquare className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-600">
                {isAr ? 'لا توجد محادثات تطابق الفلتر الحالي' : 'No conversations matching current filter'}
              </p>
              <p className="text-[11px]">
                {isAr
                  ? 'يمكنك إضافة تعليق عبر النقر بالزر الأيمن على أي حقل أو خلية.'
                  : 'You can add a comment by right-clicking on any field or cell.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
