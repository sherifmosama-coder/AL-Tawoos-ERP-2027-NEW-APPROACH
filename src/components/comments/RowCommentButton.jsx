import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordComments } from '../../context/CommentContext';
import { getCommentVisualState } from './commentIcons';

export default function RowCommentButton({
  docId,
  docNumber,
  tab = '',
  module = '',
  hideIfEmpty = false,
  className = ''
}) {
  const { getCommentStatus, openCommentPopover } = useRecordComments();
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  if (!docId) return null;

  const commentStatus = getCommentStatus(docId);
  const visualState = getCommentVisualState(commentStatus, isAr);

  // When hideIfEmpty is enabled, hide the prominent row button if there are no comments on this record
  // (In that case, the comment trigger is grouped inside the 3-dots action dropdown)
  if (hideIfEmpty && !visualState.hasComments) {
    return null;
  }

  const { Icon, buttonClasses, badgeNumber, badgeClass, title } = visualState;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
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
      }}
      className={`p-1.5 rounded-xl border transition cursor-pointer relative inline-flex items-center justify-center ${buttonClasses} ${className}`}
      title={title}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {badgeNumber !== null && badgeNumber > 0 && (
        <span className={`absolute -top-1 -end-1 px-1 min-w-[14px] h-[14px] rounded-full font-mono text-[8px] font-bold flex items-center justify-center ring-1 ring-white ${badgeClass}`}>
          {badgeNumber}
        </span>
      )}
    </button>
  );
}
