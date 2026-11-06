import React from 'react';
import {
  MessageSquareWarning,
  MessageSquareDot,
  MessageSquareText,
  MessageSquarePlus
} from 'lucide-react';

export function MessageSquareCheck({ className = 'h-4 w-4', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="m9 10 2 2 4-4" />
    </svg>
  );
}

export {
  MessageSquareWarning,
  MessageSquareDot,
  MessageSquareText,
  MessageSquarePlus
};

/**
 * Single source of truth for comment visual representation across ERP.
 * Rule: The counter badge is strictly limited to UNREAD messages.
 * Once all messages are read (or thread is resolved), the badge is completely removed.
 */
export function getCommentVisualState(commentStatus, isAr = true) {
  const hasComments = Boolean(commentStatus);
  const isResolved = commentStatus?.status === 'resolved';
  const isAssignedToMe = Boolean(commentStatus?.isAssignedToMe);
  const unreadCount = Number(commentStatus?.unreadCount || 0);
  const hasUnread = unreadCount > 0;
  const messageCount = Number(commentStatus?.messageCount || 0);

  // 1. Resolved thread: icon indicates completion, zero counter badges
  if (isResolved) {
    return {
      hasComments: true,
      status: 'resolved',
      isResolved: true,
      isAssignedToMe: false,
      hasUnread: false,
      unreadCount: 0,
      messageCount,
      Icon: MessageSquareCheck,
      iconColor: 'text-slate-500',
      badgeNumber: null, // Removed: counter only for unread
      badgeClass: '',
      buttonClasses: 'text-slate-500 bg-slate-100 border-slate-200 hover:bg-slate-200',
      title: isAr
        ? 'محادثة مكتملة ومغلقة (انقر للعرض)'
        : 'Resolved thread (Click to view)',
      label: isAr
        ? 'عرض المحادثة والتعليقات (مكتملة)'
        : 'View Resolved Conversation'
    };
  }

  // 2. Task assigned to current user: amber pulse icon, badge strictly limited to unread count
  if (isAssignedToMe) {
    return {
      hasComments: true,
      status: 'assigned_to_me',
      isResolved: false,
      isAssignedToMe: true,
      hasUnread,
      unreadCount,
      messageCount,
      Icon: MessageSquareWarning,
      iconColor: 'text-amber-600',
      badgeNumber: unreadCount > 0 ? unreadCount : null, // Removed when read
      badgeClass: 'bg-amber-600 text-white',
      buttonClasses: 'text-amber-900 bg-amber-100 border-amber-300 hover:bg-amber-200 animate-pulse shadow-sm',
      title: isAr
        ? (unreadCount > 0 ? `مهمة معينة لك (${unreadCount} غير مقروء) - انقر للعرض` : 'مهمة معينة لك - انقر للعرض')
        : (unreadCount > 0 ? `Task assigned to you (${unreadCount} unread) - Click to view` : 'Task assigned to you - Click to view'),
      label: isAr
        ? (unreadCount > 0 ? `مهمة معينة لك (${unreadCount} غير مقروء)` : 'مهمة معينة لك - عرض المحادثة')
        : (unreadCount > 0 ? `Task Assigned to You (${unreadCount} unread)` : 'Task Assigned to You')
    };
  }

  // 3. Unread messages for current user: emerald dot icon, red badge with unread count
  if (hasUnread) {
    return {
      hasComments: true,
      status: 'unread',
      isResolved: false,
      isAssignedToMe: false,
      hasUnread: true,
      unreadCount,
      messageCount,
      Icon: MessageSquareDot,
      iconColor: 'text-emerald-600',
      badgeNumber: unreadCount, // Strictly unread count
      badgeClass: 'bg-red-600 text-white',
      buttonClasses: 'text-emerald-900 bg-emerald-100 border-emerald-300 hover:bg-emerald-200 shadow-sm',
      title: isAr
        ? `تعليقات جديدة (${unreadCount} غير مقروء) - انقر للعرض`
        : `New comments (${unreadCount} unread) - Click to view`,
      label: isAr
        ? `تعليقات جديدة (${unreadCount} غير مقروء)`
        : `New Unread Comments (${unreadCount})`
    };
  }

  // 4. Active thread where all messages are read: emerald icon, zero badges
  if (hasComments && messageCount > 0) {
    return {
      hasComments: true,
      status: 'active',
      isResolved: false,
      isAssignedToMe: false,
      hasUnread: false,
      unreadCount: 0,
      messageCount,
      Icon: MessageSquareText,
      iconColor: 'text-emerald-600',
      badgeNumber: null, // Removed: counter only for unread
      badgeClass: '',
      buttonClasses: 'text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 shadow-2xs',
      title: isAr
        ? 'المحادثة والتعليقات - انقر للعرض'
        : 'Comments & Notes - Click to view',
      label: isAr
        ? 'عرض المحادثة والتعليقات'
        : 'View Conversation & Comments'
    };
  }

  // 5. No comments
  return {
    hasComments: false,
    status: 'none',
    isResolved: false,
    isAssignedToMe: false,
    hasUnread: false,
    unreadCount: 0,
    messageCount: 0,
    Icon: MessageSquarePlus,
    iconColor: 'text-slate-400',
    badgeNumber: null,
    badgeClass: '',
    buttonClasses: 'border-transparent hover:border-slate-200 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50',
    title: isAr
      ? 'إضافة تعليق / مهمة على السجل'
      : 'Add comment or task on record',
    label: isAr
      ? 'إضافة تعليق / مهمة على السجل'
      : 'Add Comment / Task on Record'
  };
}
