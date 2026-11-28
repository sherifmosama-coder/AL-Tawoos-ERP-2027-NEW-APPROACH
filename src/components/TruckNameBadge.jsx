import React from 'react';
import { Truck } from 'lucide-react';
import { resolveVehicleDisplayName, CopyButton } from './salesOrders/salesOrderConstants';

/**
 * Standardized app-wide truck display component:
 * - Always renders the truck's human-recognizable name (`vehicleModel || name || code`).
 * - Limits the plate number strictly to hover metadata (`title`) and an adjacent copy icon (`CopyButton`).
 */
export default function TruckNameBadge({
  vehicle = null,
  name = '',
  plate = '',
  isAr = true,
  showIcon = true,
  prefix = null,
  suffix = null,
  extraTitle = '',
  onClick = null,
  className = '',
  nameClassName = 'font-black text-slate-900 truncate',
  iconClassName = 'w-3.5 h-3.5 text-indigo-600 shrink-0 rtl:-scale-x-100',
  copyClassName = '',
  emptyText = '—',
}) {
  const displayName = resolveVehicleDisplayName(vehicle, name);
  const plateStr = String(plate || vehicle?.plateNumber || '').trim();
  const hoverTitle = [
    displayName || (isAr ? 'شاحنة' : 'Truck'),
    plateStr ? `${isAr ? 'رقم اللوحة:' : 'Plate #:'} ${plateStr}` : '',
    extraTitle || '',
  ]
    .filter(Boolean)
    .join(' • ');

  if (!displayName && !plateStr) {
    return <span className={`text-slate-400 font-semibold ${className}`}>{emptyText}</span>;
  }

  const labelContent = (
    <>
      {showIcon && <Truck className={iconClassName} />}
      {prefix}
      <span className={nameClassName}>{displayName || (isAr ? 'شاحنة' : 'Truck')}</span>
      {suffix}
    </>
  );

  return (
    <span className={`inline-flex items-center gap-1 min-w-0 max-w-full ${className}`} title={hoverTitle}>
      {typeof onClick === 'function' ? (
        <button
          type="button"
          onClick={onClick}
          title={hoverTitle}
          className="inline-flex items-center gap-1 min-w-0 cursor-pointer text-start hover:underline"
        >
          {labelContent}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 min-w-0" title={hoverTitle}>
          {labelContent}
        </span>
      )}
      {plateStr && (
        <CopyButton
          text={plateStr}
          title={isAr ? `نسخ رقم اللوحة (${plateStr})` : `Copy Plate # (${plateStr})`}
          isAr={isAr}
          className={copyClassName}
        />
      )}
    </span>
  );
}
