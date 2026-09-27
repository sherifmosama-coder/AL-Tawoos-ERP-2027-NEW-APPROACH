import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X, Factory, Building2, Plus } from 'lucide-react';
import VariantIdentifierChip, { getVariantIdentifierText } from './VariantIdentifierChip';

/**
 * Custom-Made Searchable ComboBox for Picking and Confirming Material Variations.
 * Replaces native <select> elements across the entire ERP with rich HTML option rendering
 * and quick-typing search.
 */
export default function VariantComboBox({
  variations = [],
  variants = null,
  value = '',
  onChange,
  item = null,
  placeholder = '',
  allowGeneric = false,
  genericLabel = '',
  disabled = false,
  isAr = true,
  className = '',
  required = false,
  size = 'md', // 'sm' | 'md'
  returnKey = 'auto', // 'auto' | 'suffix' | 'variantCode'
  extraOptions = [],
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownCoords, setDropdownCoords] = useState(null);
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  const rawList = (variations && variations.length > 0) ? variations : (Array.isArray(variants) ? variants : []);

  const defaultPlaceholder = isAr ? '-- اختر التنوع المطلوب --' : '-- Select Variation --';
  const defaultGenericLabel = isAr ? 'عام للخامة (أي مورد متاح)' : 'Generic (Any Available Vendor)';

  // Resolve currently selected variant
  const selectedVariant = useMemo(() => {
    if (!value || value === '__NEW_VARIANT__') return null;
    return (
      rawList.find(
        (v) =>
          String(v.suffix) === String(value) ||
          String(v.variantCode) === String(value) ||
          (v.suffix && String(value).endsWith(`-${v.suffix}`)) ||
          String(v.id) === String(value)
      ) || null
    );
  }, [rawList, value]);

  // Is generic currently selected?
  const isGenericSelected = allowGeneric && (value === '' || value === 'GENERIC' || value === null);

  // Filter variations based on typing search query
  const filteredVariations = useMemo(() => {
    if (!searchQuery.trim()) return rawList;
    const q = searchQuery.toLowerCase().trim();

    return rawList.filter((v) => {
      const suffix = (v.suffix || '').toLowerCase();
      const code = (v.variantCode || '').toLowerCase();
      const sup = (v.supplierName || '').toLowerCase();
      const idText = (getVariantIdentifierText(v) || '').toLowerCase();
      const merged = (v.mergedSpecs || '').toLowerCase();
      const specsList = (v.specs || []).map((s) => `${s.label} ${s.value}`).join(' ').toLowerCase();

      return (
        suffix.includes(q) ||
        code.includes(q) ||
        sup.includes(q) ||
        idText.includes(q) ||
        merged.includes(q) ||
        specsList.includes(q)
      );
    });
  }, [rawList, searchQuery]);

  // Dynamically compute viewport-relative position for Portal rendering
  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // If trigger scrolled entirely out of viewport, close popover
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popoverEstimatedHeight = 280;

    // Flip upwards if not enough room below and more room above
    const openUpward = spaceBelow < popoverEstimatedHeight && spaceAbove > spaceBelow;

    const minWidth = 280;
    const desiredWidth = Math.max(rect.width, minWidth);
    const maxWidth = Math.min(desiredWidth, Math.max(window.innerWidth - 20, 260));

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
      maxHeight: openUpward ? Math.max(spaceAbove - 20, 180) : Math.max(spaceBelow - 20, 180),
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
      // Don't reposition if user is scrolling inside the options popover list
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

  // Close when clicking outside both container and portal popover
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

  // Auto-focus search input on open
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

  const handleSelect = (v) => {
    if (v === 'GENERIC') {
      onChange('', null);
    } else if (typeof v === 'string') {
      onChange(v, null);
    } else {
      let codeToReturn = v.suffix || v.variantCode;
      if (returnKey === 'variantCode') {
        codeToReturn = v.variantCode || v.suffix;
      } else if (returnKey === 'suffix') {
        codeToReturn = v.suffix || (v.variantCode ? v.variantCode.split('-').pop() : '');
      } else if (returnKey === 'auto') {
        if (value && v.variantCode && String(value) === String(v.variantCode)) {
          codeToReturn = v.variantCode;
        } else if (v.variantCode && !v.suffix) {
          codeToReturn = v.variantCode;
        } else {
          codeToReturn = v.suffix || v.variantCode;
        }
      }
      onChange(codeToReturn, v);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', null);
    setSearchQuery('');
  };

  const sizeStyles =
    size === 'sm'
      ? 'min-h-[30px] px-2 py-1 text-xs'
      : 'min-h-[36px] px-2.5 py-1.5 text-xs';

  return (
    <div ref={containerRef} className={`relative select-none ${className}`}>
      {/* Hidden input for HTML form validation */}
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

      {/* Main ComboBox Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full ${sizeStyles} border rounded-xl flex items-center justify-between gap-2 transition cursor-pointer ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
            : 'bg-white border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex-1 truncate font-medium text-start flex items-center gap-1.5 flex-wrap">
          {selectedVariant ? (
            <>
              {/* Variant Suffix Code */}
              <span className="font-mono font-bold text-slate-800 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                [{selectedVariant.suffix || selectedVariant.variantCode}]
              </span>

              {/* Color-Coded Pure Text Identifier Chip */}
              <VariantIdentifierChip variant={selectedVariant} size="sm" />

              {/* Supplier / In-House Name */}
              <span className="text-slate-700 font-semibold text-[11px] truncate flex items-center gap-1">
                {selectedVariant.supplierId === 'IN_HOUSE' ||
                selectedVariant.supplierName === 'إنتاج داخلي' ||
                selectedVariant.supplierName === 'In-House Production' ? (
                  <span className="inline-flex items-center gap-0.5 text-amber-800 font-bold">
                    <Factory className="h-3 w-3 text-amber-600 shrink-0" />
                    <span>{isAr ? 'إنتاج داخلي' : 'In-House'}</span>
                  </span>
                ) : (
                  <span>{selectedVariant.supplierName || '—'}</span>
                )}
              </span>

              {/* Packaging Ratio Badge if > 1 */}
              {selectedVariant.packagingRatio && Number(selectedVariant.packagingRatio) > 1 && (
                <span className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1 rounded shrink-0">
                  {isAr ? `شدة: ${selectedVariant.packagingRatio}` : `Pack: ${selectedVariant.packagingRatio}`}
                </span>
              )}
            </>
          ) : value === '__NEW_VARIANT__' ? (
            <span className="inline-flex items-center gap-1 font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
              <Plus className="h-3 w-3 text-indigo-600 shrink-0" />
              <span>{isAr ? 'تنوع جديد للمورد المختار' : 'New Variation for Supplier'}</span>
            </span>
          ) : isGenericSelected ? (
            <span className="font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
              {genericLabel || defaultGenericLabel}
            </span>
          ) : (
            <span className="text-slate-400">{placeholder || defaultPlaceholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              title={isAr ? 'إلغاء التحديد' : 'Clear'}
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </div>

      {/* Floating Search & Options Popover via React Portal */}
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
          className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Live Search Input */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/90">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'ابحث بالرمز، الخاصية، أو المورد...' : 'Search code, spec, or vendor...'}
                className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Options List */}
          <div
            className="overflow-y-auto p-1.5 text-xs space-y-1"
            style={{ maxHeight: `${Math.min(dropdownCoords.maxHeight - 55, 260)}px` }}
          >
            {/* Generic Option if allowed */}
            {allowGeneric && (
              <div
                onClick={() => handleSelect('GENERIC')}
                className={`p-2 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition ${
                  isGenericSelected
                    ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200'
                    : 'hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                    GENERIC
                  </span>
                  <span className="font-bold text-xs">{genericLabel || defaultGenericLabel}</span>
                </div>
                {isGenericSelected && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
              </div>
            )}

            {rawList.length === 0 ? (
              <div className="p-3 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="font-bold text-slate-700 mb-0.5">
                  {isAr ? 'خامة جديدة لهذا المورد' : 'First-time Material for this Supplier'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isAr ? 'لا توجد تنوعات مسجلة لهذا المورد — يرجى إضافة تنوع جديد أدناه' : 'No variations registered for this supplier — please add a new variation below'}
                </div>
              </div>
            ) : filteredVariations.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                {isAr ? 'لا توجد تنوعات مطابقة للبحث' : 'No matching variations found'}
              </div>
            ) : (
              filteredVariations.map((v) => {
                const isSelected =
                  selectedVariant &&
                  (selectedVariant.suffix === v.suffix || selectedVariant.variantCode === v.variantCode);
                const isSelfMade =
                  v.supplierId === 'IN_HOUSE' ||
                  v.supplierName === 'إنتاج داخلي' ||
                  v.supplierName === 'In-House Production';

                return (
                  <div
                    key={v.suffix || v.variantCode}
                    onClick={() => handleSelect(v)}
                    className={`p-2 rounded-xl border transition cursor-pointer space-y-1 ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold shadow-2xs'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        {/* Suffix Code */}
                        <span className="font-mono font-bold text-xs text-slate-900 bg-white border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs shrink-0">
                          [{v.suffix || v.variantCode}]
                        </span>

                        {/* Color-Coded Identifier Chip */}
                        <VariantIdentifierChip variant={v} size="sm" />

                        {/* Vendor Name */}
                        <span className="font-semibold text-xs text-slate-800 truncate flex items-center gap-1">
                          {isSelfMade ? (
                            <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-[11px]">
                              <Factory className="h-3 w-3 text-amber-600 shrink-0" />
                              <span>{isAr ? 'إنتاج داخلي' : 'In-House'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-700 text-[11px]">
                              <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{v.supplierName || (isAr ? 'مورد معتمد' : 'Vendor')}</span>
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {v.packagingRatio && Number(v.packagingRatio) > 0 && (
                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            1 {v.largeUnitName || item?.largeUnitName || (isAr ? 'كرتونة' : 'Carton')} = {v.packagingRatio} {v.smallUnit || item?.smallUnit || ''}
                          </span>
                        )}
                        {isSelected && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
                      </div>
                    </div>

                    {/* Secondary Technical Specs preview */}
                    {v.mergedSpecs && (
                      <div className="text-[10px] text-slate-500 truncate ps-1">
                        {v.mergedSpecs}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Extra Custom Options (e.g. Add New Variation) */}
            {extraOptions && extraOptions.length > 0 && (
              <div className="pt-1 mt-1 border-t border-slate-100">
                {extraOptions.map((opt, optIdx) => (
                  <div
                    key={optIdx}
                    onClick={() => handleSelect(opt.value)}
                    className={`p-2 rounded-xl text-center font-bold cursor-pointer transition text-xs ${
                      opt.className || 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    }`}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
