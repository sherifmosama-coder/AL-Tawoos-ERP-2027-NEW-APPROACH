import React from 'react';

// Standard 12-Color Industrial Palette with Light Grey as Smart Default
export const VARIANT_PALETTE = [
  { id: 'default_grey', labelAr: 'رمادي فاتح (افتراضي)', labelEn: 'Light Grey (Default)', color: '#64748b' },
  { id: 'emerald', labelAr: 'زمردي', labelEn: 'Emerald', color: '#059669' },
  { id: 'blue', labelAr: 'أزرق سماوي', labelEn: 'Sky Blue', color: '#0284c7' },
  { id: 'indigo', labelAr: 'نيلي', labelEn: 'Indigo', color: '#4f46e5' },
  { id: 'purple', labelAr: 'بنفسجي', labelEn: 'Purple', color: '#7c3aed' },
  { id: 'teal', labelAr: 'بترولي', labelEn: 'Teal', color: '#0d9488' },
  { id: 'cyan', labelAr: 'سماوي داكن', labelEn: 'Cyan', color: '#0891b2' },
  { id: 'amber', labelAr: 'كهرماني', labelEn: 'Amber', color: '#d97706' },
  { id: 'orange', labelAr: 'برتقالي', labelEn: 'Orange', color: '#ea580c' },
  { id: 'rose', labelAr: 'وردي', labelEn: 'Rose', color: '#e11d48' },
  { id: 'coral', labelAr: 'مرجاني', labelEn: 'Coral', color: '#f43f5e' },
  { id: 'fuchsia', labelAr: 'فوشيا', labelEn: 'Fuchsia', color: '#c026d3' },
  { id: 'slate', labelAr: 'رصاصي داكن', labelEn: 'Slate Dark', color: '#1e293b' },
];

export const DEFAULT_VARIANT_COLOR = '#64748b'; // Light Grey Smart Default

/**
 * Extracts the display text of the identifier spec(s) for a given variation.
 * Returns null if no identifier specs exist.
 */
export function getVariantIdentifierText(variant, showLabel = false) {
  if (!variant) return null;

  // 1. Direct precomputed text
  if (!showLabel && variant.identifierBadgeText && typeof variant.identifierBadgeText === 'string') {
    return variant.identifierBadgeText.trim();
  }

  // 2. Extract from variant.specs
  const specs = Array.isArray(variant.specs) ? variant.specs : [];
  const idSpecs = specs.filter((s) => s && s.isIdentifier && s.value && String(s.value).trim());

  if (idSpecs.length > 0) {
    return idSpecs
      .map((s) => (showLabel && s.label ? `${s.label.trim()}: ${s.value.trim()}` : s.value.trim()))
      .join(' • ');
  }

  // Fallback to legacy identifierBadgeText if present
  if (variant.identifierBadgeText) {
    return String(variant.identifierBadgeText).trim();
  }

  return null;
}

/**
 * Pure Text Color-Coded Chip Component (Zero Emojis, Zero Icons).
 * Renders the unique identifier spec(s) using the variant's user-selected color code.
 */
export default function VariantIdentifierChip({
  variant,
  specs = null,
  colorCode = null,
  showLabel = false,
  fallbackText = null,
  className = '',
  size = 'md', // 'sm' | 'md'
}) {
  if (!variant && !specs && !fallbackText) return null;

  const resolvedColor = colorCode || variant?.colorCode || DEFAULT_VARIANT_COLOR;
  
  let text = fallbackText;
  if (!text) {
    if (variant) {
      text = getVariantIdentifierText(variant, showLabel);
    } else if (Array.isArray(specs)) {
      const idSpecs = specs.filter((s) => s && s.isIdentifier && s.value && String(s.value).trim());
      if (idSpecs.length > 0) {
        text = idSpecs
          .map((s) => (showLabel && s.label ? `${s.label.trim()}: ${s.value.trim()}` : s.value.trim()))
          .join(' • ');
      }
    }
  }

  if (!text) return null;

  const isDefaultGrey = resolvedColor.toLowerCase() === DEFAULT_VARIANT_COLOR.toLowerCase();

  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px] rounded'
      : 'px-2 py-0.5 text-[11px] rounded-md';

  return (
    <span
      style={
        isDefaultGrey
          ? undefined
          : {
              backgroundColor: `${resolvedColor}18`,
              borderColor: `${resolvedColor}55`,
              color: resolvedColor,
            }
      }
      className={`inline-flex items-center font-bold tracking-tight border transition-colors select-none ${
        isDefaultGrey
          ? 'bg-slate-100 border-slate-300 text-slate-700'
          : ''
      } ${sizeClasses} ${className}`}
      title={text}
    >
      {text}
    </span>
  );
}
