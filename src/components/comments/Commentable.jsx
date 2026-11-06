import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordComments } from '../../context/CommentContext';
import { MessageSquare, CheckCircle, AlertCircle } from 'lucide-react';

export default function Commentable({
  docId,
  docNumber,
  fieldKey = null,
  fieldLabel = null,
  tab = '',
  module = '',
  contextType = 'table_cell',
  isSensitive = false,
  rowActions = [],
  className = '',
  children,
  showIndicator = true,
  indicatorPosition = 'top-end', // 'top-end' | 'inline' | 'top-start'
  as: Component = 'div',
  ...rest
}) {
  const { getCommentStatus, openContextMenu, openCommentPopover, registerRowActions } = useRecordComments();
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const containerRef = useRef(null);

  // Register row actions if this is a row-level wrapper
  useEffect(() => {
    if (docId && Array.isArray(rowActions) && rowActions.length > 0) {
      registerRowActions(docId, rowActions);
      return () => {
        registerRowActions(docId, null);
      };
    }
  }, [docId, rowActions, registerRowActions]);

  if (!docId) {
    return <Component className={className} {...rest}>{children}</Component>;
  }

  const commentStatus = getCommentStatus(docId, fieldKey);
  const hasThread = Boolean(commentStatus);
  const isFieldSpecific = Boolean(fieldKey);

  const targetInfo = {
    docId,
    docNumber: docNumber || docId,
    fieldKey,
    fieldLabel,
    tab,
    module,
    contextType: isFieldSpecific ? 'table_cell' : contextType,
    isSensitive: Boolean(isSensitive),
    rowActions: !isFieldSpecific && Array.isArray(rowActions) ? rowActions : [],
    threadId: commentStatus?.threadId || null
  };

  const handleContextMenu = (e) => {
    // Prevent if right-clicked inside an active modal
    if (e.target.closest('[role="dialog"], .modal-overlay, [data-modal]')) {
      return;
    }
    openContextMenu(e, {
      ...targetInfo,
      anchorRect: containerRef.current?.getBoundingClientRect()
    });
  };

  const handleBadgeClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    openCommentPopover(
      targetInfo,
      containerRef.current?.getBoundingClientRect()
    );
  };

  // Badge appearance styling prioritized by status and current user perspective
  let badgeClasses = 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-xs ring-1 ring-white';
  let BadgeIcon = MessageSquare;
  let displayCount = null;
  let badgeTitle = '';

  if (hasThread && commentStatus) {
    if (commentStatus.status === 'resolved') {
      badgeClasses = 'bg-slate-400 text-white hover:bg-slate-500 ring-1 ring-white shadow-2xs';
      BadgeIcon = CheckCircle;
      badgeTitle = isAr ? 'محادثة مكتملة ومغلقة (انقر للعرض)' : 'Resolved Thread (Click to view)';
    } else if (commentStatus.isAssignedToMe) {
      // Priority 1: Open Task assigned specifically to CURRENT USER
      badgeClasses = 'bg-amber-500 text-white hover:bg-amber-600 shadow-md animate-pulse ring-2 ring-amber-300 ring-offset-1';
      BadgeIcon = AlertCircle;
      displayCount = (commentStatus.unreadCount || 0) > 0 ? commentStatus.unreadCount : null;
      badgeTitle = isAr
        ? `مهمة معينة لك (${commentStatus.unreadCount || 1} غير مقروء) - انقر للعرض`
        : `Task assigned to you (${commentStatus.unreadCount || 1} unread) - Click to view`;
    } else if (commentStatus.hasUnread) {
      // Priority 2: Unread messages for current user
      badgeClasses = 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md ring-1 ring-white';
      BadgeIcon = MessageSquare;
      displayCount = commentStatus.unreadCount || null;
      badgeTitle = isAr
        ? `تعليق نشط (${commentStatus.unreadCount} رسائل جديدة غير مقروءة)`
        : `Active comment (${commentStatus.unreadCount} new unread messages)`;
    } else if (commentStatus.isActionRequired) {
      // Open task assigned to other colleagues
      badgeClasses = 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 ring-1 ring-white shadow-2xs';
      BadgeIcon = AlertCircle;
      displayCount = (commentStatus.messageCount || 0) > 1 ? commentStatus.messageCount : null;
      badgeTitle = isAr ? 'مهمة وإجراء مطلوب (انقر للعرض)' : 'Action Required Task (Click to view)';
    } else {
      // Regular active thread (already read by current user)
      badgeClasses = 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300/80 shadow-2xs';
      BadgeIcon = MessageSquare;
      displayCount = (commentStatus.messageCount || 0) > 1 ? commentStatus.messageCount : null;
      badgeTitle = isAr ? `تعليق نشط (${commentStatus.messageCount || 1} رسائل)` : `Active Comment (${commentStatus.messageCount || 1} messages)`;
    }
  }

  const positionClass =
    indicatorPosition === 'top-start'
      ? 'start-0.5 -top-1.5'
      : indicatorPosition === 'inline'
      ? 'relative inline-flex ms-1 align-middle'
      : 'end-0.5 -top-1.5';

  // Field hover visual feedback: border outline + soft tint
  const fieldHoverClasses = isFieldSpecific
    ? 'cursor-pointer transition-all duration-150 hover:ring-1 hover:ring-inset hover:ring-emerald-400/50 hover:bg-emerald-50/20'
    : '';

  return (
    <Component
      ref={containerRef}
      onContextMenu={handleContextMenu}
      data-comment-doc={docId}
      data-comment-number={docNumber || docId}
      data-comment-field={fieldKey || ''}
      data-comment-label={fieldLabel || ''}
      data-comment-tab={tab}
      data-comment-module={module}
      data-comment-type={targetInfo.contextType}
      data-comment-sensitive={isSensitive ? 'true' : 'false'}
      className={`relative group/commentable ${fieldHoverClasses} ${className}`}
      {...rest}
    >
      {children}

      {/* 1. Permanent Indicator Badge when active thread exists */}
      {showIndicator && hasThread && (
        <button
          type="button"
          onClick={handleBadgeClick}
          title={badgeTitle}
          className={`
            ${positionClass}
            absolute z-20 inline-flex items-center justify-center
            min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold
            transition-transform duration-150 hover:scale-125 cursor-pointer
            ${badgeClasses}
          `}
        >
          <BadgeIcon className="h-2.5 w-2.5 shrink-0" />
          {displayCount !== null && (
            <span className="ms-0.5 font-mono text-[8px] leading-none font-bold">
              {displayCount}
            </span>
          )}
        </button>
      )}

      {/* 2. Floating Corner Trigger Button on Hover (when no thread exists yet) */}
      {showIndicator && !hasThread && isFieldSpecific && (
        <button
          type="button"
          onClick={handleBadgeClick}
          title={isAr ? 'إضافة تعليق / مهمة على هذا الحقل' : 'Comment or task on this field'}
          className={`
            ${positionClass}
            absolute z-20 inline-flex items-center justify-center
            w-4 h-4 rounded-full text-[9px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white
            shadow-xs opacity-0 group-hover/commentable:opacity-100 transition-all duration-150 hover:scale-110
            cursor-pointer ring-1 ring-white
          `}
        >
          <MessageSquare className="h-2.5 w-2.5" />
        </button>
      )}
    </Component>
  );
}
