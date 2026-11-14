/**
 * Shared pure utilities for Sales Orders & Loading Plan
 * Handles serial parsing/sorting, line-item VAT/WHT/weight math,
 * exact integer proportional allocation (largest-remainder), and printable adjustment slips.
 */

export const PHYSICAL_DELIVERY_EXCLUDED_TYPES = [
  'admin',
  'collection',
  'invoice_only_with_tax',
  'invoice_only_no_tax'
];

export const POST_DISPATCH_STATUSES = ['shipped', 'delivered', 'paid'];

/**
 * Extracts sortable numeric base serial + split portion index.
 * Handles both standard ("0001") and split ("0001 (2/3)") serial strings safely.
 */
export function parseOrderSerialParts(order) {
  if (!order) return { baseNum: 0, splitIndex: 0 };
  if (order.baseSerial && /^\d+$/.test(String(order.baseSerial).trim())) {
    return {
      baseNum: parseInt(String(order.baseSerial).trim(), 10) || 0,
      splitIndex: Number(order.splitIndex) || 0
    };
  }
  const raw = String(order.serial || order.id || '').replace(/^SO-/i, '').trim();
  const splitMatch = raw.match(/^(\d+)\s*\((\d+)\/(\d+)\)/);
  if (splitMatch) {
    return {
      baseNum: parseInt(splitMatch[1], 10) || 0,
      splitIndex: parseInt(splitMatch[2], 10) || 0
    };
  }
  const numMatch = raw.match(/^(\d+)/);
  return {
    baseNum: numMatch ? (parseInt(numMatch[1], 10) || 0) : 0,
    splitIndex: Number(order.splitIndex) || 0
  };
}

/**
 * Compares two orders by base serial ascending, then split portion index ascending.
 */
export function compareOrdersBySerialAsc(a, b) {
  const pa = parseOrderSerialParts(a);
  const pb = parseOrderSerialParts(b);
  if (pa.baseNum !== pb.baseNum) return pa.baseNum - pb.baseNum;
  return pa.splitIndex - pb.splitIndex;
}

/**
 * Calculates line item net, VAT (14%), WHT (1%), weight (kg), and total.
 */
export function calculateSalesOrderLineTotals(
  line,
  detectedUnitPrice,
  isPromotional = false,
  promoDiscountPct = 0,
  vatMode = 'none'
) {
  const qty = Math.max(0, Number(line.qty) || 0);
  const bonus = Math.max(0, Number(line.bonus) || 0);
  const manualDiscount = Math.max(0, Number(line.manualDiscountPerUnit) || 0);

  const isTaxable = vatMode && vatMode !== 'none';
  const isInclusive = vatMode === 'inclusive' || vatMode === 'inclusive_wht';
  const isWhtApplicable = vatMode === 'exclusive_wht' || vatMode === 'inclusive_wht';
  const hasVat = line.vatRate !== '0%' && line.vatRate !== 0;

  let effectiveBaseUnitPrice = Number(detectedUnitPrice) || 0;
  if (isInclusive && hasVat) {
    effectiveBaseUnitPrice = effectiveBaseUnitPrice / 1.14;
  }

  const netBasePriceAfterDiscount = Math.max(0, effectiveBaseUnitPrice - manualDiscount);
  const lineNet = qty * netBasePriceAfterDiscount;
  const lineVat = (isTaxable && hasVat) ? lineNet * 0.14 : 0;
  const lineWht = isWhtApplicable ? lineNet * 0.01 : 0;
  const lineTotal = lineNet + lineVat - lineWht;
  const lineWeightKg = (qty + bonus) * (Number(line.largeUnitWeightKg) || 0);

  return {
    ...line,
    qty,
    bonus,
    detectedUnitPrice: Number(detectedUnitPrice) || 0,
    effectiveBaseUnitPrice,
    isPromotional,
    promoDiscountPct,
    lineNet,
    lineVat,
    lineWht,
    lineTotal,
    lineWeightKg
  };
}

/**
 * Aggregates full order financial and physical totals from lines + VAT mode.
 */
export function aggregateSalesOrderTotals(lines = [], vatMode = 'none') {
  let totalQty = 0;
  let totalBonus = 0;
  let totalWeightKg = 0;
  let grossSubtotal = 0;
  let manualDiscountTotal = 0;
  let netPreTaxSubtotal = 0;
  let totalVat = 0;

  (lines || []).forEach((l) => {
    const q = Math.max(0, Number(l.qty) || 0);
    const b = Math.max(0, Number(l.bonus) || 0);
    totalQty += q;
    totalBonus += b;
    totalWeightKg += Number(l.lineWeightKg || 0);
    grossSubtotal += q * (Number(l.detectedUnitPrice) || 0);
    manualDiscountTotal += q * (Number(l.manualDiscountPerUnit) || 0);
    netPreTaxSubtotal += Number(l.lineNet || 0);
    totalVat += Number(l.lineVat || 0);
  });

  const isWhtApplicable = vatMode === 'exclusive_wht' || vatMode === 'inclusive_wht';
  const whtAmount = isWhtApplicable ? netPreTaxSubtotal * 0.01 : 0;
  const grandTotal = netPreTaxSubtotal + totalVat - whtAmount;
  const totalCartons = totalQty + totalBonus;

  return {
    totalQty,
    totalBonus,
    totalCartons,
    totalWeightKg,
    grossSubtotal,
    manualDiscountTotal,
    netPreTaxSubtotal,
    totalVat,
    whtAmount,
    grandTotal
  };
}

/**
 * Largest-remainder integer allocation: splits `totalInt` proportionally across `weights`
 * so that the sum of returned integers ALWAYS equals `totalInt` with zero drift.
 */
export function allocateIntegersProportionally(totalInt, weights = []) {
  const safeTotal = Math.max(0, Math.round(Number(totalInt) || 0));
  if (!Array.isArray(weights) || weights.length === 0) return [];
  if (safeTotal === 0) return weights.map(() => 0);

  const totalWeight = weights.reduce((s, w) => s + Math.max(0, Number(w) || 0), 0);
  if (totalWeight <= 0) {
    const res = weights.map(() => 0);
    res[0] = safeTotal;
    return res;
  }

  const exactShares = weights.map((w) => (safeTotal * Math.max(0, Number(w) || 0)) / totalWeight);
  const floors = exactShares.map((s) => Math.floor(s));
  let remainder = safeTotal - floors.reduce((s, f) => s + f, 0);

  const ranked = exactShares
    .map((s, idx) => ({ idx, frac: s - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < remainder; i++) {
    floors[ranked[i % ranked.length].idx]++;
  }
  return floors;
}

/**
 * Escapes HTML special chars for safe printable report interpolation.
 */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Opens a printable Warehouse Return Estimate & Accountant Adjusted Invoice sheet.
 */
export function openPrintableAdjustmentSlip(order, isAr = true) {
  if (!order) return;
  const snap = order.preAdjustmentSnapshot || {};
  const origCartons = Number(snap.originalTotalCartons ?? order.totalCartons ?? 0);
  const actualCartons = Number(order.totalCartons ?? order.totalQty ?? 0);
  const returnedCartons = Number(order.returnedCartons ?? Math.max(0, origCartons - actualCartons));
  const origWeightKg = Number(snap.originalTotalWeightKg ?? order.totalWeightKg ?? 0);
  const actualWeightKg = Number(order.totalWeightKg ?? 0);
  const returnedWeightKg = Number(order.returnedWeightKg ?? Math.max(0, origWeightKg - actualWeightKg));
  const origTotal = Number(snap.originalGrandTotal ?? order.grandTotal ?? 0);
  const actualTotal = Number(order.grandTotal ?? 0);
  const returnedAmount = Number(order.returnedAmount ?? Math.max(0, origTotal - actualTotal));

  const lines = Array.isArray(order.lines) ? order.lines : [];
  const origLines = Array.isArray(snap.originalLines) ? snap.originalLines : [];

  const rowsHtml = lines
    .map((l) => {
      const base = origLines.find((ol) => ol.productId === l.productId) || {};
      const dQty = Number(l.dispatchedQty ?? base.qty ?? l.qty ?? 0);
      const dBonus = Number(l.dispatchedBonus ?? base.bonus ?? l.bonus ?? 0);
      const aQty = Number(l.qty ?? 0);
      const aBonus = Number(l.bonus ?? 0);
      const rQty = Math.max(0, dQty - aQty);
      const rBonus = Math.max(0, dBonus - aBonus);
      const oLineTotal = Number(base.lineTotal ?? l.lineTotal ?? 0);
      const aLineTotal = Number(l.lineTotal ?? 0);
      const prodName = isAr ? (l.productNameAr || l.productNameEn) : (l.productNameEn || l.productNameAr);
      return `
        <tr>
          <td><strong>${escHtml(prodName)}</strong><br/><small style="color:#64748b">${escHtml(l.productCode || '')}</small></td>
          <td class="num">${dQty}${dBonus > 0 ? ` (+${dBonus})` : ''}</td>
          <td class="num" style="color:#047857;font-weight:700">${aQty}${aBonus > 0 ? ` (+${aBonus})` : ''}</td>
          <td class="num" style="color:${rQty + rBonus > 0 ? '#be123c' : '#94a3b8'};font-weight:700">${rQty + rBonus > 0 ? `${rQty}${rBonus > 0 ? ` (+${rBonus})` : ''}` : '—'}</td>
          <td class="num">${oLineTotal.toFixed(2)}</td>
          <td class="num" style="font-weight:700">${aLineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  const html = `<!doctype html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
<head>
  <meta charset="utf-8" />
  <title>${isAr ? `تسوية استلام جزئي ومرتجع #${order.serial || order.id}` : `Partial Return & Adjusted Invoice #${order.serial || order.id}`}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 28px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; background: #fef2f2; color: #9f1239; border: 1px solid #fecdd3; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
    .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; background: #f8fafc; }
    .card .lbl { font-size: 11px; color: #64748b; display: block; margin-bottom: 4px; }
    .card .val { font-size: 15px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: start; }
    th { background: #f1f5f9; font-size: 11px; font-weight: 800; }
    td.num, th.num { text-align: center; font-variant-numeric: tabular-nums; }
    .reason { margin: 14px 0; padding: 10px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; }
    .footer { margin-top: 32px; display: flex; justify-content: space-between; font-size: 12px; color: #475569; }
    .sig { border-top: 1px dashed #94a3b8; width: 190px; text-align: center; padding-top: 6px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin:0 0 4px 0;">${isAr ? 'بيان تسوية استلام جزئي ومرتجع مخزني وفاتورة معدلة' : 'Partial Delivery Return & Adjusted Invoice Reconciliation'}</h2>
      <div><strong>${isAr ? 'أمر بيع رقم:' : 'Order #:'}</strong> #${escHtml(order.serial || order.id)} &nbsp;|&nbsp; <strong>${isAr ? 'العميل:' : 'Client:'}</strong> ${escHtml(order.clientName || '—')} ${order.branchName ? `(${escHtml(order.branchName)})` : ''}</div>
      <div style="color:#475569;margin-top:3px;"><strong>${isAr ? 'تاريخ الفاتورة:' : 'Invoice Date:'}</strong> ${escHtml(order.invoiceDate || '—')} &nbsp;|&nbsp; <strong>${isAr ? 'تاريخ التحميل:' : 'Loading Date:'}</strong> ${escHtml(order.loadingDate || '—')} ${order.assignedVehicleName ? `&nbsp;|&nbsp; <strong>${isAr ? 'الشاحنة:' : 'Truck:'}</strong> ${escHtml(order.assignedVehicleName)} (${escHtml(order.assignedVehiclePlate || '')})` : ''}</div>
    </div>
    <div style="text-align:end">
      <span class="badge">${isAr ? 'تسوية استلام فعلي ومرتجع' : 'PARTIAL RETURN RECONCILIATION'}</span>
      <div style="font-size:11px;color:#64748b;margin-top:6px;">${isAr ? 'بواسطة:' : 'Synced By:'} ${escHtml(order.lastAdjustedBy || '—')}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card"><span class="lbl">${isAr ? 'المنصرف الأصلي (شحن)' : 'Originally Dispatched'}</span><span class="val">${origCartons} ${isAr ? 'كرتونة' : 'ctn'} (${origWeightKg.toFixed(1)} kg)</span></div>
    <div class="card" style="background:#ecfdf5;border-color:#a7f3d0"><span class="lbl">${isAr ? 'المستلم فعلياً لدى العميل' : 'Actual Received Qty'}</span><span class="val" style="color:#065f46">${actualCartons} ${isAr ? 'كرتونة' : 'ctn'} (${actualWeightKg.toFixed(1)} kg)</span></div>
    <div class="card" style="background:#fff1f2;border-color:#fecdd3"><span class="lbl">${isAr ? 'تقدير المرتجع للمخزن' : 'Est. Warehouse Return'}</span><span class="val" style="color:#be123c">${returnedCartons} ${isAr ? 'كرتونة' : 'ctn'} (${returnedWeightKg.toFixed(1)} kg)</span></div>
    <div class="card" style="background:#eef2ff;border-color:#c7d2fe"><span class="lbl">${isAr ? 'الفاتورة المعدلة (فرق المرتجع)' : 'Adjusted Total (Credit Delta)'}</span><span class="val" style="color:#3730a3">${actualTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</span><div style="font-size:11px;color:#be123c;font-weight:700;">${isAr ? 'الخصم/الإشعار الدائن:' : 'Credit:'} -${returnedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</div></div>
  </div>

  ${order.rejectionReason ? `<div class="reason"><strong>${isAr ? 'سبب الرفض الجزئي / التسوية:' : 'Rejection / Adjustment Reason:'}</strong> ${escHtml(order.rejectionReason)}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th>${isAr ? 'الصنف' : 'Product SKU'}</th>
        <th class="num">${isAr ? 'الكمية المنصرفة' : 'Dispatched'}</th>
        <th class="num">${isAr ? 'المستلم فعلياً' : 'Received'}</th>
        <th class="num">${isAr ? 'المرتجع للمخزن' : 'Returned'}</th>
        <th class="num">${isAr ? 'الإجمالي الأصلي (ج.م)' : 'Orig. Total'}</th>
        <th class="num">${isAr ? 'الإجمالي المعدل (ج.م)' : 'Adj. Total'}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">
    <div class="sig">${isAr ? 'اعتماد المبيعات / التشغيل' : 'Sales / Dispatch Approval'}</div>
    <div class="sig">${isAr ? 'استلام أمين المخزن للمرتجع' : 'Warehouse Return Receipt'}</div>
    <div class="sig">${isAr ? 'مراجعة الحسابات والفاتورة المعدلة' : 'Accounting Adjusted Invoice'}</div>
  </div>

  <div class="no-print" style="margin-top:24px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 24px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">${isAr ? 'طباعة المستند' : 'Print Reconciliation Slip'}</button>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
