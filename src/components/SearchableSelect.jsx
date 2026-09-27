import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X, Link2, Boxes } from 'lucide-react';

export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Select --',
  disabled = false,
  isAr = true,
  className = '',
  emptyText,
  required = false
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
      const searchStr = `${val} ${lbl} ${sub} ${opt.specs || ''} ${group}`.toLowerCase();
      return {
        value: val,
        label: lbl,
        sublabel: sub,
        searchStr,
        group,
        isLinked: Boolean(opt.isLinked),
        badgeText: opt.badgeText || '',
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
        <div className="flex-1 truncate font-medium text-start">
          {selectedOption ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-900">
                {selectedOption.sublabel && (
                  <span className="font-mono text-slate-500 font-semibold me-1.5">
                    [{selectedOption.sublabel}]
                  </span>
                )}
                {selectedOption.label}
              </span>
              {selectedOption.isLinked && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Link2 className="h-3 w-3 text-indigo-600 shrink-0" />
                  <span>{selectedOption.badgeText || (isAr ? 'مورد مسجل' : 'Linked Supplier')}</span>
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
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
              <div className="p-3 text-center text-slate-400">
                {emptyText || (isAr ? 'لا توجد نتائج مطابقة' : 'No matching results')}
              </div>
            ) : (
              filteredOptions.map((opt, optIndex) => {
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
                      onClick={() => handleSelect(opt.value)}
                      className={`p-2 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200 shadow-2xs'
                          : opt.isLinked
                          ? 'bg-indigo-50/25 hover:bg-indigo-50/70 text-slate-900 border-s-2 border-indigo-500'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="truncate flex-1 text-start flex items-center gap-1.5 min-w-0">
                        {opt.sublabel && (
                          <span className="font-mono text-[11px] text-slate-500 font-semibold shrink-0">
                            [{opt.sublabel}]
                          </span>
                        )}
                        <span className="truncate">{opt.label}</span>
                        {opt.isLinked && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0 ms-auto">
                            <Link2 className="h-3 w-3 text-indigo-600 shrink-0" />
                            <span>{opt.badgeText || (isAr ? 'مورد مسجل' : 'Linked Supplier')}</span>
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0 ms-1" />}
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}