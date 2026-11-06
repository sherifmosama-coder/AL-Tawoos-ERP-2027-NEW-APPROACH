import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordComments } from '../../context/CommentContext';
import { ShieldAlert } from 'lucide-react';
import { getCommentVisualState } from './commentIcons';

export default function CommentContextMenu() {
  const { contextMenuState, closeContextMenu, openCommentPopover, getCommentStatus } = useRecordComments();
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const menuRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    if (contextMenuState.isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenuState.isOpen, closeContextMenu]);

  if (!contextMenuState.isOpen || !contextMenuState.target) return null;

  const { x, y, target } = contextMenuState;
  const statusInfo = getCommentStatus(target.docId, target.fieldKey);
  const isFieldSpecific = Boolean(target.fieldKey);
  const rowActions = Array.isArray(target.rowActions) ? target.rowActions : [];

  // Inherit visual state (Icon, colors, labels, badges) directly from target record
  const visualState = getCommentVisualState(statusInfo, isAr);
  const { Icon: PrimaryCommentIcon, iconColor, label: commentLabel, badgeNumber, badgeClass } = visualState;

  // Keep menu within viewport boundaries
  const menuWidth = 250;
  const menuHeight = isFieldSpecific ? 110 : (120 + rowActions.length * 36);
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const handleOpenPopover = () => {
    closeContextMenu();
    openCommentPopover(
      {
        ...target,
        threadId: statusInfo?.threadId || null
      },
      target.anchorRect || { top: y, bottom: y, left: x, right: x, width: 0, height: 0 }
    );
  };

  return (
    <div
      id="comment-context-menu"
      ref={menuRef}
      style={{ top: `${Math.max(10, adjustedY)}px`, left: `${Math.max(10, adjustedX)}px` }}
      className="fixed z-9999 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 select-none text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Menu Header with Context Target Breadcrumb */}
      <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
        <span className="truncate max-w-[150px]">
          {target.docNumber || target.docId}
        </span>
        {target.isSensitive && (
          <span className="inline-flex items-center gap-1 text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md font-semibold">
            <ShieldAlert className="h-2.5 w-2.5" />
            {isAr ? 'حساس' : 'Sensitive'}
          </span>
        )}
      </div>

      <div className="py-1 space-y-0.5">
        {/* 1. Primary Comment Action (Inherits exact target row icon, state, and badge) */}
        <button
          type="button"
          onClick={handleOpenPopover}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 font-bold transition cursor-pointer text-start"
        >
          <PrimaryCommentIcon className={`h-4 w-4 shrink-0 ${iconColor}`} />
          <span className="truncate">{commentLabel}</span>
          {badgeNumber !== null && badgeNumber > 0 && (
            <span className={`ms-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeClass}`}>
              {badgeNumber}
            </span>
          )}
        </button>

        {/* 2. Row Actions Bridge (Shown strictly on row-level right-clicks, never on field clicks) */}
        {!isFieldSpecific && rowActions.length > 0 && (
          <>
            <div className="my-1 border-t border-slate-100" />
            <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              {isAr ? 'إجراءات السجل' : 'Row Actions'}
            </div>
            {rowActions.map((act, idx) => {
              const ActionIcon = act.icon;
              const isDanger = act.variant === 'danger';
              const label = isAr ? (act.labelAr || act.label) : (act.labelEn || act.label);

              return (
                <button
                  key={act.id || idx}
                  type="button"
                  disabled={act.disabled}
                  onClick={() => {
                    closeContextMenu();
                    act.onClick?.(target.docId, target);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer text-start ${
                    act.disabled
                      ? 'opacity-40 cursor-not-allowed text-slate-400'
                      : isDanger
                      ? 'text-rose-600 hover:bg-rose-50 hover:text-rose-700'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {ActionIcon && <ActionIcon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
