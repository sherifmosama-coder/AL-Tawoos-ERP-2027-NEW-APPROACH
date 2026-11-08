import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X, Link2, Boxes, PlusCircle, Tag } from 'lucide-react';
import { SEGMENT_ICON_MAP } from './ClientSegmentsMaster';

/**
 * Robust renderer for option icons supporting:
 * - Lucide forwardRef icon components (typeof === 'object')
 * - Functional components (typeof === 'function')
 * - Instantiated React elements (React.isValidElement)
 * - String icon keys resolved against SEGMENT_ICON_MAP (e.g. 'Award', 'Boxes', 'Store')
 */
function renderOptionIcon(icon, className = 'w-3.5 h-3.5 shrink-0') {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  let Comp = icon;
  if (typeof icon === 'string') {
    Comp = SEGMENT_ICON_MAP[icon] || Tag;
  }
  if (typeof Comp === 'function' || (typeof Comp === 'object' && Comp !== null)) {
    return React.createElement(Comp, { className });
  }
  return null;
}

export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Select --',
  disabled = false,
  isAr = true,
  className = '',
  emptyText,
  required = false,
  onCreateNew = null,
  createLabel = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownCoords, setDropdownCoords] = useState(null);
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options to { value, label, sublabel, searchStr, group, isLinked, badgeText }
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt, sublabel: '', searchStr: opt.toLowerCase() };
      }
      const val = opt.value ?? opt.id ?? opt.code ?? '';
      const lbl = opt.label ?? opt.nameAr ?? opt.name ?? opt.nameEn ?? val;
      const sub = opt.sublabel ?? (opt.code && opt.code !== lbl ? opt.code : opt.id && opt.id !== lbl ? opt.id : '');
      const group = opt.group || '';
      const icon = opt.icon || null;
      const iconColor = opt.iconColor || null;
      const iconBg = opt.iconBg || null;
      const iconTitle = opt.iconTitle || '';
      const searchStr = `${val} ${lbl} ${sub} ${iconTitle} ${opt.specs || ''} ${group}`.toLowerCase();
      return {
        value: val,
        label: lbl,
        sublabel: sub,
        icon,
        iconColor,
        iconBg,
        iconTitle,
        searchStr,
        group,
        isLinked: Boolean(opt.isLinked),
        badgeText: opt.badgeText || '',
        disabled: Boolean(opt.disabled),
      };
    });
  }, [options]);

  // Currently selected option object
  const selectedOption = useMemo(() => {
    return normalizedOptions.find((opt) => String(opt.value) === String(value)) || null;
  }, [normalizedOptions, value]);

  // Filter options based on user typing
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter((opt) => opt.searchStr.includes(q));
  }, [normalizedOptions, searchQuery]);

  // Dynamically compute viewport-relative position for Portal rendering
  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popoverEstimatedHeight = 240;

    const openUpward = spaceBelow < popoverEstimatedHeight && spaceAbove > spaceBelow;

    const minWidth = 220;
    const desiredWidth = Math.max(rect.width, minWidth);
    const maxWidth = Math.min(desiredWidth, Math.max(window.innerWidth - 20, 240));

    let left = isAr ? rect.right - maxWidth : rect.left;
    if (left + maxWidth > window.innerWidth - 10) {
      left = window.innerWidth - maxWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    setDropdownCoords({
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
      left,
      width: maxWidth,
      maxHeight: openUpward ? Math.max(spaceAbove - 20, 160) : Math.max(spaceBelow - 20, 160),
      openUpward,
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownCoords(null);
      return;
    }
    updateCoords();

    const handleScrollOrResize = (e) => {
      if (popoverRef.current && popoverRef.current.contains(e.target)) {
        return;
      }
      updateCoords();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        (!popoverRef.current || !popoverRef.current.contains(e.target))
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen, dropdownCoords]);

  const handleSelect = (optValue) => {
    const targetOpt = normalizedOptions.find((o) => String(o.value) === String(optValue));
    if (targetOpt?.disabled) return;
    onChange(optValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Hidden input for HTML5 form validation if required */}
      {required && (
        <input
          type="text"
          value={value || ''}
          required
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
        />
      )}

      {/* Main Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[34px] px-2.5 py-1.5 border rounded-xl flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
            : 'bg-white border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex-1 min-w-0 truncate font-medium text-start">
          {selectedOption ? (
            <div className="flex items-center gap-1.5 min-w-0">
              {(() => {
                const iconEl = renderOptionIcon(selectedOption.icon, 'w-3.5 h-3.5 shrink-0');
                if (!iconEl) return null;
                return (
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 shadow-2xs"
                    style={{
                      backgroundColor: selectedOption.iconBg || (selectedOption.iconColor ? `${selectedOption.iconColor}18` : '#f1f5f9'),
                      color: selectedOption.iconColor || '#475569',
                      border: `1px solid ${selectedOption.iconColor ? `${selectedOption.iconColor}35` : '#e2e8f0'}`
                    }}
                    title={selectedOption.iconTitle || ''}
                  >
                    {iconEl}
                  </span>
                );
              })()}
              {selectedOption.sublabel && (
                <span className="font-mono text-slate-500 font-semibold me-1 shrink-0 text-[11px]">
                  [{selectedOption.sublabel}]
                </span>
              )}
              <span className="font-bold text-slate-900 truncate">
                {selectedOption.label}
              </span>
              {selectedOption.isLinked && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                  <Link2 className="h-3 w-3 text-indigo-600 shrink-0" />
                  <span>{selectedOption.badgeText || (isAr ? 'مورد مسجل' : 'Linked Supplier')}</span>
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 truncate block">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {value && value !== 'all' && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Floating Search Popover via React Portal */}
      {isOpen && !disabled && dropdownCoords && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          dir={isAr ? 'rtl' : 'ltr'}
          style={{
            position: 'fixed',
            top: dropdownCoords.top !== undefined ? `${dropdownCoords.top}px` : 'auto',
            bottom: dropdownCoords.bottom !== undefined ? `${dropdownCoords.bottom}px` : 'auto',
            left: `${dropdownCoords.left}px`,
            width: `${dropdownCoords.width}px`,
            zIndex: 99999,
            fontFamily: "'Cairo', sans-serif",
          }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Input Bar */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'اكتب للبحث السريع...' : 'Type to search...'}
                className="w-full ps-8 pe-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Options List */}
          <div
            className="overflow-y-auto p-1.5 text-xs space-y-1"
            style={{ maxHeight: `${Math.min(dropdownCoords.maxHeight - 50, 260)}px` }}
          >
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 space-y-2">
                <div>{emptyText || (isAr ? 'لا توجد نتائج مطابقة' : 'No matching results')}</div>
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onCreateNew(searchQuery);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow-xs"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>{createLabel || (isAr ? `+ إضافة "${searchQuery || 'جديد'}"` : `+ Add "${searchQuery || 'New'}"`)}</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredOptions.map((opt, optIndex) => {
                  const isSelected = String(opt.value) === String(value);
                  const prevOpt = optIndex > 0 ? filteredOptions[optIndex - 1] : null;
                  const isFirstOfGroup = opt.group && (!prevOpt || prevOpt.group !== opt.group);

                  return (
                    <React.Fragment key={opt.value}>
                      {isFirstOfGroup && (
                        <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 bg-slate-100 rounded-lg my-1 flex items-center gap-1.5 select-none border border-slate-200/80">
                          {opt.isLinked ? (
                            <Link2 className="h-3 w-3 text-indigo-600 shrink-0" />
                          ) : (
                            <Boxes className="h-3 w-3 text-slate-400 shrink-0" />
                          )}
                          <span>{opt.group}</span>
                        </div>
                      )}
                      <div
                        onClick={() => !opt.disabled && handleSelect(opt.value)}
                        className={`p-2 rounded-xl flex items-center justify-between gap-2 transition ${
                          opt.disabled
                            ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400 select-none'
                            : isSelected
                            ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200 shadow-2xs cursor-pointer'
                            : opt.isLinked
                            ? 'bg-indigo-50/25 hover:bg-indigo-50/70 text-slate-900 border-s-2 border-indigo-500 cursor-pointer'
                            : 'hover:bg-slate-100 text-slate-800 cursor-pointer'
                        }`}
                      >
                        <div className="truncate flex-1 text-start flex items-center gap-2 min-w-0">
                          {(() => {
                            const iconEl = renderOptionIcon(opt.icon, 'w-3.5 h-3.5 shrink-0');
                            if (!iconEl) return null;
                            return (
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 shadow-2xs"
                                style={{
                                  backgroundColor: opt.iconBg || (opt.iconColor ? `${opt.iconColor}18` : '#f1f5f9'),
                                  color: opt.iconColor || '#475569',
                                  border: `1px solid ${opt.iconColor ? `${opt.iconColor}35` : '#e2e8f0'}`
                                }}
                                title={opt.iconTitle || ''}
                              >
                                {iconEl}
                              </span>
                            );
                          })()}
                          {opt.sublabel && (
                            <span className="font-mono text-[11px] text-slate-500 font-semibold shrink-0">
                              [{opt.sublabel}]
                            </span>
                          )}
                          <span className="truncate">{opt.label}</span>
                          {(opt.badgeText || opt.isLinked) && (
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ms-auto ${
                                opt.disabled
                                  ? 'bg-slate-200 text-slate-600 border border-slate-300'
                                  : opt.isLinked
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {opt.isLinked && <Link2 className="h-3 w-3 text-indigo-600 shrink-0" />}
                              <span>{opt.badgeText || (isAr ? 'مورد مسجل' : 'Linked Supplier')}</span>
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0 ms-1" />}
                      </div>
                    </React.Fragment>
                  );
                })}

                {onCreateNew && (
                  <div className="pt-1.5 mt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onCreateNew(searchQuery);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-slate-50 hover:bg-emerald-50 text-emerald-800 font-bold text-xs border border-dashed border-emerald-300 transition cursor-pointer"
                    >
                      <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{createLabel || (isAr ? '+ إضافة حساب / مستفيد جديد' : '+ Add New Account / Beneficiary')}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}