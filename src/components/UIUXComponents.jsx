import React, { useState, useEffect, useRef, useId } from 'react';
import {
  MoreVertical,
  Check,
  X,
  Trash2,
  Edit3,
  Copy,
  Clock,
  Boxes,
  ChevronDown,
  Sparkles,
  Activity,
  Timer,
  MapPin,
  Circle,
  Printer
} from 'lucide-react';

// ==========================================
// 1. 16-TONE EXECUTIVE PREMIUM PALETTES
// ==========================================
export const PREMIUM_PALETTES = [
  { name: 'Imperial Sapphire', top: '#1e40af', bottom: '#0f172a', text: '#ffffff' },
  { name: 'Royal Emerald', top: '#065f46', bottom: '#022c22', text: '#ffffff' },
  { name: 'Bordeaux Burgundy', top: '#831843', bottom: '#4c0519', text: '#ffffff' },
  { name: 'Deep Amethyst', top: '#6b21a8', bottom: '#3b0764', text: '#ffffff' },
  { name: 'Champagne Bronze', top: '#9a3412', bottom: '#451a03', text: '#ffffff' },
  { name: 'Graphite Obsidian', top: '#334155', bottom: '#0f172a', text: '#ffffff' },
  { name: 'Midnight Navy', top: '#1e3a8a', bottom: '#0a0f1d', text: '#ffffff' },
  { name: 'Persian Teal', top: '#115e59', bottom: '#042f2e', text: '#ffffff' },
  { name: 'Rich Crimson', top: '#9f1239', bottom: '#4c0519', text: '#ffffff' },
  { name: 'Forest Jade', top: '#14532d', bottom: '#052e16', text: '#ffffff' },
  { name: 'Bespoke Violet', top: '#581c87', bottom: '#2e1065', text: '#ffffff' },
  { name: 'Smoked Cognac', top: '#854d0e', bottom: '#422006', text: '#ffffff' },
  { name: 'Deep Cobalt', top: '#1d4ed8', bottom: '#172554', text: '#ffffff' },
  { name: 'Nordic Pine', top: '#166534', bottom: '#052e16', text: '#ffffff' },
  { name: 'Warm Espresso', top: '#713f12', bottom: '#291404', text: '#ffffff' },
  { name: 'Titanium Iron', top: '#27272a', bottom: '#09090b', text: '#ffffff' },
];

export const getPremiumStyle = (name = '') => {
  if (!name) return PREMIUM_PALETTES[0];
  let hash = 5381;
  const clean = name.trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) + hash + clean.charCodeAt(i);
  }
  const index = Math.abs(hash) % PREMIUM_PALETTES.length;
  return PREMIUM_PALETTES[index];
};

export const getInitials = (name = '') => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ==========================================
// 2. CAPSULE AVATAR
// ==========================================
export const UserAvatar = ({
  name = 'User',
  src = null,
  size = 'md',
  status = null,
  className = '',
}) => {
  const uniqueId = useId().replace(/:/g, '');
  const sizeMap = { xs: 24, sm: 30, md: 42, lg: 50, xl: 58 };
  const dim = sizeMap[size] || sizeMap.md;
  const palette = getPremiumStyle(name);
  const initials = getInitials(name);

  const statusColor =
    status === 'active'
      ? '#10b981'
      : status === 'idle'
      ? '#f59e0b'
      : 'transparent';

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 transition-all duration-200 ${
        status === 'idle' ? 'opacity-40 hover:opacity-100' : 'opacity-100'
      } ${className}`}
      style={{ width: dim, height: dim }}
    >
      <svg
        viewBox="-40 -40 560 560"
        width={dim}
        height={dim}
        className="w-full h-full overflow-visible select-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`premium-grad-${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.top} />
            <stop offset="100%" stopColor={palette.bottom} />
          </linearGradient>
          {src && (
            <pattern id={`pat-${uniqueId}`} width="1" height="1" patternUnits="objectBoundingBox" viewBox="0 0 480 480">
              <image href={src} width="480" height="480" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          )}
        </defs>

        {status && (
          <path
            d="M480 120C480 53.7 372.6 0 240 0S0 53.7 0 120v240c0 66.3 107.5 120 240 120s240-53.7 240-120V120Z"
            fill="none"
            stroke={statusColor}
            strokeWidth="56"
            strokeLinejoin="round"
          />
        )}

        <path
          d="M480 120C480 53.7 372.6 0 240 0S0 53.7 0 120v240c0 66.3 107.5 120 240 120s240-53.7 240-120V120Z"
          fill={src ? `url(#pat-${uniqueId})` : `url(#premium-grad-${uniqueId})`}
          stroke="#ffffff"
          strokeWidth="32"
          strokeLinejoin="round"
        />

        {!src && (
          <text
            x="240"
            y="285"
            textAnchor="middle"
            fill={palette.text}
            fontSize="180"
            fontWeight="900"
            fontFamily="'Cairo', -apple-system, sans-serif"
            className="select-none pointer-events-none"
          >
            {initials}
          </text>
        )}
      </svg>
    </div>
  );
};

// ==========================================
// 3. COPYABLE CODE CHIP
// ==========================================
export const CopyableCodeChip = ({ code = '', isAr = true, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!code) return null;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? `نسخ الكود (${code})` : `Copy code (${code})`)}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono text-[10px] font-semibold transition-all cursor-pointer select-text bg-slate-100 hover:bg-slate-200/80 text-slate-600 border border-slate-200/90 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 ${className}`}
    >
      <span>{code}</span>
      {copied ? (
        <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <Copy className="w-2.5 h-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0" />
      )}
    </button>
  );
};

// ==========================================
// 4. ROW AUTHOR AVATAR WITH TIMESTAMP TOOLTIP
// ==========================================
export const RowAuthorAvatar = ({
  author = 'System',
  timestamp = '',
  actionLabel = '',
  src = null,
  isAr = true,
  className = '',
}) => {
  return (
    <div className={`relative inline-flex items-center justify-center group ${className}`}>
      <UserAvatar name={author} src={src} size="xs" />
      <div className="absolute bottom-full mb-1.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white text-[11px] px-3 py-1.5 rounded-xl shadow-xl border border-slate-700 whitespace-nowrap text-start space-y-0.5">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-slate-100">{author}</span>
            {actionLabel && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                {actionLabel}
              </span>
            )}
          </div>
          {timestamp && (
            <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{timestamp}</span>
            </div>
          )}
        </div>
        <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 border-r border-b border-slate-700" />
      </div>
    </div>
  );
};

// ==========================================
// 5. INWARD-EXPANDING PRESENCE PILL
// ==========================================
export const HeaderPresencePill = ({
  onlineUsers = [],
  isAr = true,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTooltipUser, setActiveTooltipUser] = useState(null);
  const pillRef = useRef(null);

  const activeUsers = onlineUsers.filter((u) => u.status !== 'offline');

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (pillRef.current && !pillRef.current.contains(e.target)) {
        setIsExpanded(false);
        setActiveTooltipUser(null);
      }
    };
    if (isExpanded) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isExpanded]);

  if (activeUsers.length === 0) return null;

  return (
    <div ref={pillRef} className={`relative flex items-center ${className}`}>
      {/* Icon + Count Only (No Text Label) */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/90 dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700 rounded-full transition-all duration-200 cursor-pointer shadow-xs ${
          isExpanded ? 'ring-2 ring-emerald-500/50 bg-slate-200 dark:bg-slate-800' : ''
        }`}
        title={isAr ? `المتواجدون الآن: ${activeUsers.length}` : `${activeUsers.length} Online Users`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-xs font-black font-mono tracking-tight">{activeUsers.length}</span>
        <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded Grid Popover (Strictly Anchored Inward to Prevent Cutoff) */}
      {isExpanded && (
        <div
          className={`absolute top-full mt-2.5 ${
            isAr ? 'left-0' : 'right-0'
          } z-50 w-72 max-w-[calc(100vw-24px)] bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-3xl shadow-2xl p-3.5 text-start space-y-3 animate-in fade-in zoom-in-95 duration-150`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                {isAr ? 'فريق العمل المتواجد' : 'Active Teammates'}
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
              {activeUsers.length} {isAr ? 'نشط' : 'Online'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3 py-1 place-items-center">
            {activeUsers.map((u, idx) => {
              const isHovered = (activeTooltipUser?.id || activeTooltipUser?.name) === (u.id || u.name);
              const colIndex = idx % 4;

              let tooltipAlignClass = 'start-1/2 -translate-x-1/2';
              let arrowAlignClass = 'start-1/2 -translate-x-1/2';
              if (colIndex === 0) {
                tooltipAlignClass = isAr ? 'end-0 translate-x-2' : 'start-0 -translate-x-2';
                arrowAlignClass = isAr ? 'end-4' : 'start-4';
              } else if (colIndex === 3) {
                tooltipAlignClass = isAr ? 'start-0 -translate-x-2' : 'end-0 translate-x-2';
                arrowAlignClass = isAr ? 'start-4' : 'end-4';
              }

              return (
                <div
                  key={u.id || u.name}
                  className="relative flex flex-col items-center gap-1 group"
                  onMouseEnter={() => setActiveTooltipUser(u)}
                  onMouseLeave={() => setActiveTooltipUser(null)}
                  onClick={() => setActiveTooltipUser(isHovered ? null : u)}
                >
                  <UserAvatar
                    name={u.name}
                    src={u.avatar || u.photoURL || null}
                    size="md"
                    status={u.status || 'active'}
                    className="cursor-pointer transition-transform hover:scale-110"
                  />
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[60px] text-center block">
                    {u.name.split(' ')[0]}
                  </span>

                  {isHovered && (
                    <div className={`absolute bottom-full mb-2 z-60 w-56 p-3 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 text-start space-y-2 pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${tooltipAlignClass}`}>
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <h5 className="text-xs font-black text-white truncate">{u.name}</h5>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-1 ${
                              u.status === 'active'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                                : 'bg-amber-950 text-amber-400 border border-amber-700'
                            }`}
                          >
                            <Circle className="w-1.5 h-1.5 fill-current" />
                            <span>{u.status === 'active' ? (isAr ? 'نشط' : 'Active') : (isAr ? 'خامل' : 'Idle')}</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block truncate font-medium">
                          {u.role || u.department || 'Staff Member'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-800 text-[10px]">
                        <div className="flex items-center gap-1 text-slate-300">
                          <Timer className="w-3 h-3 text-blue-400 shrink-0" />
                          <div className="truncate">
                            <span className="block text-[8px] text-slate-500">{isAr ? 'الجلسة' : 'Session'}</span>
                            <span className="font-mono font-bold">{u.sessionDuration || '45m'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-slate-300">
                          <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                          <div className="truncate">
                            <span className="block text-[8px] text-slate-500">{isAr ? 'الموقع' : 'Location'}</span>
                            <span className="font-bold truncate block">{u.currentActivity || (isAr ? 'الرئيسية' : 'Main')}</span>
                          </div>
                        </div>
                      </div>

                      <div className={`w-2 h-2 bg-slate-900 rotate-45 absolute -bottom-1 border-r border-b border-slate-700 ${arrowAlignClass}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 6. 3-DOT POPOVER ROW ACTIONS MENU
// ==========================================
export const RowActionsMenu = ({
  actions = [],
  onDelete = null,
  deletePrompt = '',
  isAr = true,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
        setConfirmDelete(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  return (
    <div className="relative inline-flex items-center justify-center" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
          setConfirmDelete(false);
        }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
        title={isAr ? 'خيارات إضافية' : 'More Options'}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute end-0 top-full mt-1 z-50 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 py-1.5 overflow-hidden text-start animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {isAr ? 'إجراءات السجل' : 'Row Actions'}
          </div>

          <div className="py-1 space-y-0.5">
            {actions.map((act, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  act.onClick?.();
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  act.variant === 'danger'
                    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {act.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center">{act.icon}</span>}
                <span className="truncate">{act.label}</span>
              </button>
            ))}

            {onDelete && (
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{isAr ? 'حذف السجل' : 'Delete Record'}</span>
                  </button>
                ) : (
                  <div className="p-2 bg-rose-50 dark:bg-rose-950/40 space-y-1.5">
                    <span className="block text-[10px] font-bold text-rose-700 dark:text-rose-300 leading-tight">
                      {deletePrompt || (isAr ? 'تأكيد الحذف النهائي؟' : 'Confirm deletion?')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          onDelete();
                        }}
                        className="flex-1 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[11px] font-bold transition"
                      >
                        {isAr ? 'نعم، احذف' : 'Yes, Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(false);
                        }}
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md text-[11px] font-bold hover:bg-slate-300"
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 7. HIGH-CONTRAST MODERN DATA TABLE
// ==========================================
export const ModernTable = ({
  columns = [],
  data = [],
  keyField = 'id',
  renderRowActions = null,
  emptyMessage = 'No records found',
  isAr = true,
  className = '',
}) => {
  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm ${className}`}>
      <div className="hidden md:block overflow-x-auto select-text cursor-text">
        <table className="w-full text-start border-collapse text-xs">
          <thead>
            <tr className="bg-slate-200/80 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-300 dark:border-slate-700">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`p-3.5 border-x border-slate-300/60 dark:border-slate-700/50 text-start ${col.headerClassName || ''}`}
                  style={{ width: col.width || 'auto' }}
                >
                  {col.header}
                </th>
              ))}
              {renderRowActions && (
                <th className="p-3.5 border-x border-slate-300/60 dark:border-slate-700/50 text-center w-12">
                  {isAr ? 'الإجراء' : 'Action'}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (renderRowActions ? 1 : 0)} className="p-8 text-center text-slate-400 font-medium">
                  <Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => (
                <tr
                  key={row[keyField] || rIdx}
                  className="odd:bg-white even:bg-slate-100/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/90 hover:bg-emerald-50/70 dark:hover:bg-slate-700/50 transition-colors"
                >
                  {columns.map((col, cIdx) => (
                    <td
                      key={cIdx}
                      className={`p-3.5 border-x border-slate-200/70 dark:border-slate-800 text-start select-text ${col.className || ''}`}
                    >
                      {col.render ? col.render(row, rIdx) : row[col.accessor]}
                    </td>
                  ))}
                  {renderRowActions && (
                    <td className="p-3.5 border-x border-slate-200/70 dark:border-slate-800 text-center">
                      {renderRowActions(row, rIdx)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="block md:hidden divide-y divide-slate-200 dark:divide-slate-800 select-text">
        {data.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {emptyMessage}
          </div>
        ) : (
          data.map((row, rIdx) => (
            <div key={row[keyField] || rIdx} className="p-4 space-y-2.5 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="font-mono font-bold text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">
                  #{rIdx + 1}
                </span>
                {renderRowActions && renderRowActions(row, rIdx)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {columns.map((col, cIdx) => (
                  <div key={cIdx} className={col.fullWidthMobile ? 'col-span-2' : ''}>
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                      {col.header}
                    </span>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {col.render ? col.render(row, rIdx) : row[col.accessor]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};