import React, { useMemo } from 'react';

/**
 * formatVatNumber
 * Formats 9 numeric digits into the standard Egyptian Tax Card format: XXX-XXX-XXX
 */
export function formatVatNumber(val) {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return String(val);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
}

/**
 * VatNumberDisplay
 * W3C <bdi dir="ltr"> BiDi-isolated component for displaying Egyptian Tax/VAT registration numbers.
 * Strictly prevents browser bidirectional algorithm from flipping 3-digit groups in Arabic contexts.
 */
export default function VatNumberDisplay({ value, className = '' }) {
  const formatted = useMemo(() => formatVatNumber(value), [value]);

  if (!formatted) return <span>—</span>;

  return (
    <bdi
      dir="ltr"
      style={{ unicodeBidi: 'isolate', direction: 'ltr' }}
      className={`inline-block font-mono tracking-wider select-all ${className}`}
    >
      {formatted}
    </bdi>
  );
}
