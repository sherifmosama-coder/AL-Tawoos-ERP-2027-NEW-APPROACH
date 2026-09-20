import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

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
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options to { value, label, sublabel, searchStr }
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt, sublabel: '', searchStr: opt.toLowerCase() };
      }
      const val = opt.value ?? opt.id ?? opt.code ?? '';
      const lbl = opt.label ?? opt.nameAr ?? opt.name ?? opt.nameEn ?? val;
      const sub = opt.sublabel ?? (opt.code && opt.code !== lbl ? opt.code : opt.id && opt.id !== lbl ? opt.id : '');
      const searchStr = `${val} ${lbl} ${sub} ${opt.specs || ''}`.toLowerCase();
      return { value: val, label: lbl, sublabel: sub, searchStr };
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

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

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
            <span className="font-bold text-slate-900">
              {selectedOption.sublabel && (
                <span className="font-mono text-slate-500 font-semibold me-1.5">
                  [{selectedOption.sublabel}]
                </span>
              )}
              {selectedOption.label}
            </span>
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

      {/* Floating Search Popover */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
                className="w-full ps-8 pe-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto p-1 text-xs divide-y divide-slate-50">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400">
                {emptyText || (isAr ? 'لا توجد نتائج مطابقة' : 'No matching results')}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    className={`p-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-bold'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="truncate flex-1 text-start">
                      {opt.sublabel && (
                        <span className="font-mono text-[11px] text-slate-500 font-semibold me-1.5">
                          {opt.sublabel} •
                        </span>
                      )}
                      <span>{opt.label}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}