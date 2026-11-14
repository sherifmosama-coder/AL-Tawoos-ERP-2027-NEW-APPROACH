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

/**
 * Checks whether a segment record or raw key represents the Retail segment.
 */
export function isRetailSegmentRecord(segmentObj = null, rawSegKey = '') {
  const candidates = [
    rawSegKey,
    segmentObj?.id,
    segmentObj?.code,
    segmentObj?.nameEn,
    segmentObj?.nameAr
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());

  return candidates.some(
    (c) =>
      c === 'seg_retail' ||
      c === 'retail' ||
      c === 'تجزئة' ||
      c.includes('retail') ||
      c.includes('تجزئة')
  );
}

/**
 * Resolves whether a sales order follows the Retail Van-Sales Route Settlement flow.
 * Checks explicit manual override first (`isRetailRouteOverride`), then order flags and client segment.
 */
export function isOrderRetailRoute(order, clients = [], segments = []) {
  if (!order) return false;
  if (PHYSICAL_DELIVERY_EXCLUDED_TYPES.includes(order.orderType)) return false;
  if (typeof order.isRetailRouteOverride === 'boolean') {
    return order.isRetailRouteOverride;
  }
  if (order.isRetailRouteOrder === true) return true;

  const clientObj = (clients || []).find((c) => c.id === order.clientId);
  const rawSegKey =
    clientObj?.segmentId ||
    clientObj?.segment ||
    order.clientSegmentId ||
    order.segmentId ||
    order.segment ||
    '';

  if (!rawSegKey) return false;
  const segObj = (segments || []).find(
    (s) =>
      s.id === rawSegKey ||
      s.code === rawSegKey ||
      s.nameAr === rawSegKey ||
      s.nameEn === rawSegKey
  );

  return isRetailSegmentRecord(segObj, rawSegKey);
}

/**
 * Compresses images to lightweight JPEG Data URLs (<80KB typical) or reads PDFs as Data URLs
 * for storing reference documents in Firestore documents.
 */
export function compressAttachmentFile(file, maxWidth = 900, maxHeight = 900, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Computes Firestore update payload for confirming or Force-Sync re-editing
 * a Retail Van-Sales Route Settlement (loaded vs sold vs unsold returned + buyer docs).
 */
export function computeRetailSettlementPayload({
  order,
  soldLinesInput = [],
  settlementNotes = '',
  buyerAttachments = [],
  markDelivered = false,
  currentUserName = 'مستخدم معتمد',
  currentUserId = 'usr_unknown'
}) {
  const nowIso = new Date().toISOString();
  const vatMode = order?.vatMode || 'none';
  const existingSnap = order?.preAdjustmentSnapshot;
  const origLines = Array.isArray(existingSnap?.originalLines) && existingSnap.originalLines.length > 0
    ? existingSnap.originalLines
    : (order?.lines || []);

  const preAdjustmentSnapshot = existingSnap || {
    capturedAt: nowIso,
    originalTotalQty: Number(order?.totalQty || 0),
    originalTotalBonus: Number(order?.totalBonus || 0),
    originalTotalCartons: Number(order?.totalCartons || order?.totalQty || 0),
    originalTotalWeightKg: Number(order?.totalWeightKg || 0),
    originalGrandTotal: Number(order?.grandTotal || 0),
    originalNetPreTax: Number(order?.netPreTaxSubtotal || 0),
    originalVat: Number(order?.totalVat || 0),
    originalWht: Number(order?.whtAmount || 0),
    originalLines: (order?.lines || []).map((l) => ({ ...l }))
  };

  const soldByProductMap = {};
  (soldLinesInput || []).forEach((item) => {
    soldByProductMap[item.productId] = item;
  });

  const isWhtMode = vatMode === 'exclusive_wht' || vatMode === 'inclusive_wht';
  let returnedQtySum = 0;
  let returnedBonusSum = 0;
  let returnedCartonsSum = 0;
  let qtyChangedVsPrevious = false;

  const prevLinesMap = {};
  (order?.lines || []).forEach((l) => {
    prevLinesMap[l.productId] = l;
  });

  const lineChanges = [];
  const stampedLines = origLines.map((origLine) => {
    const dispatchedQty = Math.max(0, Number(origLine.dispatchedQty ?? origLine.qty ?? 0));
    const dispatchedBonus = Math.max(0, Number(origLine.dispatchedBonus ?? origLine.bonus ?? 0));
    const input = soldByProductMap[origLine.productId] || {};
    const actualQty = Math.min(dispatchedQty, Math.max(0, Math.round(Number(input.soldQty ?? origLine.qty ?? 0))));
    const actualBonus = Math.min(dispatchedBonus, Math.max(0, Math.round(Number(input.soldBonus ?? origLine.bonus ?? 0))));

    const returnedQty = Math.max(0, dispatchedQty - actualQty);
    const returnedBonus = Math.max(0, dispatchedBonus - actualBonus);
    const returnedCartons = returnedQty + returnedBonus;

    const recalcLine = calculateSalesOrderLineTotals(
      { ...origLine, qty: actualQty, bonus: actualBonus },
      Number(origLine.detectedUnitPrice) || 0,
      Boolean(origLine.isPromotional),
      Number(origLine.promoDiscountPct) || 0,
      vatMode
    );

    const origLineEffTotal = isWhtMode
      ? Number(origLine.lineFinalTotal ?? Math.max(0, Number(origLine.lineNet || 0) + Number(origLine.lineVat || 0) - Number(origLine.lineWht || 0)))
      : Number(origLine.lineTotal || 0);
    const currLineEffTotal = Number(recalcLine.lineTotal || 0);
    const returnedLineTotal = Math.max(0, Math.round((origLineEffTotal - currLineEffTotal) * 100) / 100);

    const prevLine = prevLinesMap[origLine.productId];
    const prevQty = Number(prevLine?.qty ?? dispatchedQty);
    const prevBonus = Number(prevLine?.bonus ?? dispatchedBonus);
    if (prevQty !== actualQty || prevBonus !== actualBonus || order?.retailSettlementStatus !== 'settled') {
      qtyChangedVsPrevious = true;
    }

    if (prevQty !== actualQty || prevBonus !== actualBonus || returnedCartons > 0) {
      lineChanges.push({
        productCode: origLine.productCode || '',
        productNameAr: origLine.productNameAr || '',
        productNameEn: origLine.productNameEn || '',
        type: 'modified',
        detailAr: `محمل: ${dispatchedQty}${dispatchedBonus > 0 ? `+${dispatchedBonus}` : ''} | مباع: ${actualQty}${actualBonus > 0 ? `+${actualBonus}` : ''} | مرتجع: ${returnedCartons}`,
        detailEn: `Loaded: ${dispatchedQty}${dispatchedBonus > 0 ? `+${dispatchedBonus}` : ''} | Sold: ${actualQty}${actualBonus > 0 ? `+${actualBonus}` : ''} | Returned: ${returnedCartons}`
      });
    }

    returnedQtySum += returnedQty;
    returnedBonusSum += returnedBonus;
    returnedCartonsSum += returnedCartons;

    return {
      ...recalcLine,
      qty: actualQty,
      bonus: actualBonus,
      dispatchedQty,
      dispatchedBonus,
      returnedQty,
      returnedBonus,
      returnedCartons,
      returnedLineTotal
    };
  });

  const totals = aggregateSalesOrderTotals(stampedLines, vatMode);
  const returnedWeightKg = Math.max(
    0,
    Math.round((Number(preAdjustmentSnapshot.originalTotalWeightKg || 0) - Number(totals.totalWeightKg || 0)) * 100) / 100
  );
  const returnedAmount = Math.max(
    0,
    Math.round((Number(preAdjustmentSnapshot.originalGrandTotal || 0) - Number(totals.grandTotal || 0)) * 100) / 100
  );

  const isForceSyncEdit = order?.retailSettlementStatus === 'settled';
  const prevRevision = Number(order?.retailSettlementRevision || 0);
  const nextRevision = isForceSyncEdit ? prevRevision + 1 : 1;

  const existingAudit = Array.isArray(order?.auditTrail) ? order.auditTrail : [];
  const nextFulfillmentStatus = markDelivered
    ? (order?.fulfillmentStatus === 'paid' ? 'paid' : 'delivered')
    : (order?.fulfillmentStatus || 'delivered');

  const cleanAttachments = (buyerAttachments || []).map((att) => ({
    id: att.id,
    name: att.name || 'document',
    type: att.type || '',
    size: Number(att.size || 0),
    url: att.url || '',
    buyerNote: (att.buyerNote || '').trim(),
    uploadedAt: att.uploadedAt || nowIso,
    uploadedBy: att.uploadedBy || currentUserName
  }));

  const auditAction = isForceSyncEdit ? 'retail_settlement_force_synced' : 'retail_settlement_confirmed';
  const auditEntry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    action: auditAction,
    performedBy: currentUserName,
    performedById: currentUserId,
    timestamp: nowIso,
    summaryAr: isForceSyncEdit
      ? `تحديث ومزامنة تسوية التجزئة (مراجعة #${nextRevision}) #${order?.serial || order?.id}: المباع ${totals.totalCartons} كرتونة | المرتجع للمخزن ${returnedCartonsSum} كرتونة | الفاتورة المعدلة ${totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م | مرفقات المشترين: ${cleanAttachments.length}`
      : `تأكيد تسوية مبيعات التجزئة بعد العودة #${order?.serial || order?.id}: المباع ${totals.totalCartons} كرتونة | المرتجع للمخزن ${returnedCartonsSum} كرتونة | الصافي ${totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م | مرفقات المشترين: ${cleanAttachments.length}`,
    summaryEn: isForceSyncEdit
      ? `Force-synced Retail Settlement (Rev #${nextRevision}) #${order?.serial || order?.id}: Sold ${totals.totalCartons} ctn | Warehouse Return ${returnedCartonsSum} ctn | Adjusted Invoice ${totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP | Buyer Docs: ${cleanAttachments.length}`
      : `Confirmed Retail Van-Sales Settlement #${order?.serial || order?.id}: Sold ${totals.totalCartons} ctn | Unsold Return ${returnedCartonsSum} ctn | Invoice Total ${totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP | Buyer Docs: ${cleanAttachments.length}`,
    changes: {
      metadata: [
        { labelAr: 'المباع الفعلي (كرتونة)', labelEn: 'Confirmed Sold (ctn)', oldValue: `${order?.totalCartons ?? preAdjustmentSnapshot.originalTotalCartons}`, newValue: `${totals.totalCartons}` },
        { labelAr: 'المرتجع غير المباع للمخزن', labelEn: 'Unsold Return to Warehouse', oldValue: `${order?.returnedCartons ?? 0}`, newValue: `${returnedCartonsSum}` },
        { labelAr: 'قيمة الفاتورة بعد التسوية', labelEn: 'Settled Invoice Total', oldValue: `${Number(order?.grandTotal || 0).toFixed(2)}`, newValue: `${Number(totals.grandTotal || 0).toFixed(2)}` },
        { labelAr: 'مستندات/إثباتات المشترين', labelEn: 'Buyer Reference Docs', oldValue: `${(order?.retailSettlementAttachments || []).length}`, newValue: `${cleanAttachments.length}` }
      ],
      lineChanges
    }
  };

  // Reset Warehouse & Accounting Acknowledgments if quantities changed or if Force-Synced after an initial settlement
  const shouldResetAcks = !isForceSyncEdit || qtyChangedVsPrevious;

  return {
    isRetailRouteOrder: true,
    retailSettlementStatus: 'settled',
    retailSettlementRevision: nextRevision,
    retailSettlementNotes: (settlementNotes || '').trim(),
    retailSettlementAttachments: cleanAttachments,
    retailSettledBy: currentUserName,
    retailSettledById: currentUserId,
    retailSettledAt: nowIso,
    fulfillmentStatus: nextFulfillmentStatus,
    lines: stampedLines,
    ...totals,
    preAdjustmentSnapshot,
    returnedQty: returnedQtySum,
    returnedBonus: returnedBonusSum,
    returnedCartons: returnedCartonsSum,
    returnedWeightKg,
    returnedAmount,
    lastAdjustedBy: currentUserName,
    lastAdjustedById: currentUserId,
    lastAdjustedAt: nowIso,
    warehouseAck: shouldResetAcks ? { status: 'pending', revision: nextRevision } : (order?.warehouseAck || { status: 'pending', revision: nextRevision }),
    accountingAck: shouldResetAcks ? { status: 'pending', revision: nextRevision } : (order?.accountingAck || { status: 'pending', revision: nextRevision }),
    auditTrail: [auditEntry, ...existingAudit]
  };
}

/**
 * Opens a printable Van-Sales Trip Settlement & Adjusted Invoice Sheet for Retail route orders.
 */
export function openPrintableRetailSettlementSlip(order, isAr = true) {
  if (!order) return;
  const snap = order.preAdjustmentSnapshot || {};
  const loadedCartons = Number(snap.originalTotalCartons ?? ((Number(order.totalCartons || order.totalQty || 0)) + Number(order.returnedCartons || 0)));
  const soldCartons = Number(order.totalCartons ?? order.totalQty ?? 0);
  const returnedCartons = Number(order.returnedCartons ?? Math.max(0, loadedCartons - soldCartons));
  const origTotal = Number(snap.originalGrandTotal ?? (Number(order.grandTotal || 0) + Number(order.returnedAmount || 0)));
  const soldTotal = Number(order.grandTotal ?? 0);
  const returnedAmount = Number(order.returnedAmount ?? Math.max(0, origTotal - soldTotal));

  const lines = Array.isArray(order.lines) ? order.lines : [];
  const origLines = Array.isArray(snap.originalLines) ? snap.originalLines : [];

  const rowsHtml = lines
    .map((l) => {
      const base = origLines.find((ol) => ol.productId === l.productId) || {};
      const lQty = Number(l.dispatchedQty ?? base.qty ?? l.qty ?? 0);
      const lBonus = Number(l.dispatchedBonus ?? base.bonus ?? l.bonus ?? 0);
      const sQty = Number(l.qty ?? 0);
      const sBonus = Number(l.bonus ?? 0);
      const rQty = Math.max(0, lQty - sQty);
      const rBonus = Math.max(0, lBonus - sBonus);
      const sLineTotal = Number(l.lineTotal ?? 0);
      const prodName = isAr ? (l.productNameAr || l.productNameEn) : (l.productNameEn || l.productNameAr);
      return `
        <tr>
          <td><strong>${escHtml(prodName)}</strong><br/><small style="color:#64748b">${escHtml(l.productCode || '')}</small></td>
          <td class="num">${lQty}${lBonus > 0 ? ` (+${lBonus})` : ''}</td>
          <td class="num" style="color:#047857;font-weight:700">${sQty}${sBonus > 0 ? ` (+${sBonus})` : ''}</td>
          <td class="num" style="color:${rQty + rBonus > 0 ? '#0369a1' : '#94a3b8'};font-weight:700">${rQty + rBonus > 0 ? `${rQty}${rBonus > 0 ? ` (+${rBonus})` : ''}` : '0'}</td>
          <td class="num" style="font-weight:700">${sLineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  const buyerDocs = Array.isArray(order.retailSettlementAttachments) ? order.retailSettlementAttachments : [];
  const buyerDocsHtml = buyerDocs.length > 0
    ? `<div style="margin-top:14px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;">
        <strong style="font-size:12px;">${isAr ? `مستندات ومراجع المشترين المرفقة (${buyerDocs.length}):` : `Buyer Reference Documents (${buyerDocs.length}):`}</strong>
        <ul style="margin:6px 0 0 0;padding-inline-start:18px;font-size:12px;">
          ${buyerDocs.map((d) => `<li><strong>${escHtml(d.buyerNote || d.name)}</strong> <span style="color:#64748b">(${escHtml(d.name)})</span></li>`).join('')}
        </ul>
      </div>`
    : '';

  const whAck = order.warehouseAck?.status === 'acknowledged'
    ? (isAr ? `معتمد: ${order.warehouseAck.by} (${new Date(order.warehouseAck.at).toLocaleDateString('ar-EG')})` : `Ack: ${order.warehouseAck.by} (${new Date(order.warehouseAck.at).toLocaleDateString('en-US')})`)
    : (isAr ? 'بانتظار توقيع/اعتماد أمين المخزن' : 'Pending Warehouse Ack');
  const accAck = order.accountingAck?.status === 'acknowledged'
    ? (isAr ? `معتمد: ${order.accountingAck.by} (${new Date(order.accountingAck.at).toLocaleDateString('ar-EG')})` : `Ack: ${order.accountingAck.by} (${new Date(order.accountingAck.at).toLocaleDateString('en-US')})`)
    : (isAr ? 'بانتظار مراجعة واعتماد الحسابات' : 'Pending Accounting Ack');

  const html = `<!doctype html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
<head>
  <meta charset="utf-8" />
  <title>${isAr ? `تسوية رحلة مبيعات تجزئة #${order.serial || order.id}` : `Retail Van-Sales Trip Settlement #${order.serial || order.id}`}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 28px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; background: #ecfeff; color: #0e7490; border: 1px solid #a5f3fc; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
    .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; background: #f8fafc; }
    .card .lbl { font-size: 11px; color: #64748b; display: block; margin-bottom: 4px; }
    .card .val { font-size: 15px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: start; }
    th { background: #f1f5f9; font-size: 11px; font-weight: 800; }
    td.num, th.num { text-align: center; font-variant-numeric: tabular-nums; }
    .footer { margin-top: 32px; display: flex; justify-content: space-between; font-size: 12px; color: #475569; gap: 16px; }
    .sig { border-top: 1px dashed #94a3b8; flex: 1; text-align: center; padding-top: 8px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin:0 0 4px 0;">${isAr ? 'بيان جرد وتسوية رحلة مبيعات التجزئة والفاتورة النهائية' : 'Retail Van-Sales Trip Settlement & Final Invoice'}</h2>
      <div><strong>${isAr ? 'أمر بيع رقم:' : 'Order #:'}</strong> #${escHtml(order.serial || order.id)} &nbsp;|&nbsp; <strong>${isAr ? 'العميل / المنطقة:' : 'Client / Route:'}</strong> ${escHtml(order.clientName || '—')} ${order.region ? `(${escHtml(order.region)})` : ''}</div>
      <div style="color:#475569;margin-top:3px;"><strong>${isAr ? 'تاريخ التحميل:' : 'Loading Date:'}</strong> ${escHtml(order.loadingDate || '—')} ${order.assignedVehicleName ? `&nbsp;|&nbsp; <strong>${isAr ? 'الشاحنة:' : 'Truck:'}</strong> ${escHtml(order.assignedVehicleName)} ${order.assignedDriverName ? `— ${escHtml(order.assignedDriverName)}` : ''}` : ''}</div>
    </div>
    <div style="text-align:end">
      <span class="badge">${isAr ? `تسوية رحلة تجزئة (مراجعة #${order.retailSettlementRevision || 1})` : `RETAIL TRIP SETTLEMENT (Rev #${order.retailSettlementRevision || 1})`}</span>
      <div style="font-size:11px;color:#64748b;margin-top:6px;">${isAr ? 'تمت التسوية بواسطة:' : 'Settled By:'} ${escHtml(order.retailSettledBy || '—')}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card"><span class="lbl">${isAr ? 'إجمالي الحمولة المنصرفة' : 'Loaded on Truck'}</span><span class="val">${loadedCartons} ${isAr ? 'كرتونة' : 'ctn'}</span></div>
    <div class="card" style="background:#ecfdf5;border-color:#a7f3d0"><span class="lbl">${isAr ? 'المباع الفعلي المعتمد' : 'Confirmed Sold Qty'}</span><span class="val" style="color:#065f46">${soldCartons} ${isAr ? 'كرتونة' : 'ctn'}</span></div>
    <div class="card" style="background:#f0f9ff;border-color:#bae6fd"><span class="lbl">${isAr ? 'المرتجع غير المباع للمخزن' : 'Unsold Return to Warehouse'}</span><span class="val" style="color:#0369a1">${returnedCartons} ${isAr ? 'كرتونة' : 'ctn'}</span></div>
    <div class="card" style="background:#eef2ff;border-color:#c7d2fe"><span class="lbl">${isAr ? 'صافي الفاتورة النهائية' : 'Final Settled Invoice'}</span><span class="val" style="color:#3730a3">${soldTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</span>${returnedAmount > 0 ? `<div style="font-size:11px;color:#0369a1;font-weight:700;">${isAr ? 'قيمة غير المباع:' : 'Unsold Credit:'} -${returnedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</div>` : ''}</div>
  </div>

  ${order.retailSettlementNotes ? `<div style="margin:12px 0;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;"><strong>${isAr ? 'ملاحظات الرحلة والتسوية:' : 'Route & Settlement Notes:'}</strong> ${escHtml(order.retailSettlementNotes)}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th>${isAr ? 'الصنف' : 'Product SKU'}</th>
        <th class="num">${isAr ? 'المحمل على الشاحنة' : 'Loaded'}</th>
        <th class="num">${isAr ? 'المباع الفعلي' : 'Sold Qty'}</th>
        <th class="num">${isAr ? 'المرتجع غير المباع' : 'Unsold Returned'}</th>
        <th class="num">${isAr ? 'قيمة المباع (ج.م)' : 'Sold Value (EGP)'}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  ${buyerDocsHtml}

  <div class="footer">
    <div class="sig"><strong>${isAr ? 'المبيعات / تسوية الرحلة' : 'Sales / Trip Settlement'}</strong><br/><small>${escHtml(order.retailSettledBy || '—')}</small></div>
    <div class="sig"><strong>${isAr ? 'استلام أمين المخزن للمرتجع' : 'Warehouse Return Ack'}</strong><br/><small>${escHtml(whAck)}</small></div>
    <div class="sig"><strong>${isAr ? 'اعتماد الحسابات والفاتورة النهائية' : 'Accounting Invoice Ack'}</strong><br/><small>${escHtml(accAck)}</small></div>
  </div>

  <div class="no-print" style="margin-top:24px;text-align:center;">
    <button onclick="window.print()" style="padding:10px 24px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">${isAr ? 'طباعة بيان التسوية' : 'Print Settlement Sheet'}</button>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
