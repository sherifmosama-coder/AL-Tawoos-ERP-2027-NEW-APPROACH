import React from 'react';

/**
 * Clean Intact Bidirectional Range Arrow Icon
 * Replaces manually combined Unicode arrows (◄──► / ►──◄) with a single intact,
 * BiDi-immune SVG vector icon.
 */
export function BidirectionalArrowIcon({ className = 'w-3.5 h-3.5 text-rose-500 shrink-0' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m9 8-4 4 4 4" />
      <path d="m15 8 4 4-4 4" />
    </svg>
  );
}

/**
 * BatchRangeDisplay
 * Renders an inkjet batch code range (startBatch ↔ endBatch) with an intact bidirectional arrow.
 * Automatically parses any existing legacy format (including ◄──► or ►──◄) safely.
 */
export default function BatchRangeDisplay({
  range,
  start,
  end,
  className = '',
  iconClassName = 'w-3.5 h-3.5 text-rose-500 shrink-0',
}) {
  let startCode = start ? String(start).trim() : '';
  let endCode = end ? String(end).trim() : '';

  if ((!startCode || !endCode) && typeof range === 'string' && range.trim() && range.trim() !== '—' && range.trim() !== '---') {
    // Strip any legacy arrow symbols: ◄──►, ►──◄, ↔, ⟷, <->, ->
    const parts = range
      .replace(/[◄►─]+/g, '|')
      .replace(/[↔⟷]/g, '|')
      .replace(/<->/g, '|')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      startCode = parts[0];
      endCode = parts[1];
    } else if (parts.length === 1) {
      startCode = parts[0];
    }
  }

  if (!startCode && !endCode) {
    return <span className={className}>—</span>;
  }

  if (startCode && !endCode) {
    return <span className={`font-mono ${className}`}>{startCode}</span>;
  }

  if (startCode && endCode && startCode === endCode) {
    return <span className={`font-mono ${className}`}>{startCode}</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono select-all ${className}`}
      dir="ltr"
      style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
    >
      <span>{startCode}</span>
      <BidirectionalArrowIcon className={iconClassName} />
      <span>{endCode}</span>
    </span>
  );
}
