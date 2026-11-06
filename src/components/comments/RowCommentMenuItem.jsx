import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordComments } from '../../context/CommentContext';
import { getCommentVisualState } from './commentIcons';

/**
 * Drop-in comment action item for 3-dots (MoreVertical) dropdown menus.
 * When a row has NO comments, the comment action is grouped cleanly inside the 3-dots menu.
 * When a row HAS comments, it can automatically hide itself from the dropdown menu (onlyIfEmpty=true)
 * since the prominent RowCommentButton is already displayed directly on the table row.
 */
export default function RowCommentMenuItem({
  docId,
  docNumber,
  tab = '',
  module = '',
  onAction,
  onlyIfEmpty = true,
  className = ''
}) {
  const { getCommentStatus, openCommentPopover } = useRecordComments();
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  if (!docId) return null;

  const commentStatus = getCommentStatus(docId);
  const visualState = getCommentVisualState(commentStatus, isAr);

  // If onlyIfEmpty is true and the record already has active/resolved comments,
  // hide from the 3-dots dropdown menu to avoid clutter (it is already visible on the row)
  if (onlyIfEmpty && visualState.hasComments) {
    return null;
  }

  const handleClick = (e) => {
    e.stopPropagation();
    onAction?.();
    const rect = e.currentTarget.getBoundingClientRect();
    openCommentPopover(
      {
        docId: String(docId),
        docNumber: docNumber || String(docId),
        tab,
        module,
        contextType: 'table_row',
        fieldKey: null,
        fieldLabel: null,
      },
      rect
    );
  };

  const { Icon, iconColor, label, badgeNumber, badgeClass } = visualState;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-start px-3 py-2 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 flex items-center gap-2.5 font-semibold text-xs transition cursor-pointer ${className}`}
      title={visualState.title}
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      <span className="truncate">{label}</span>
      {badgeNumber !== null && badgeNumber > 0 && (
        <span className={`ms-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeClass}`}>
          {badgeNumber}
        </span>
      )}
    </button>
  );
}
