/**
 * Pure Printable Return & Inspection Document Builder (`RET-XXXXX`)
 * -----------------------------------------------------------------------------
 * Follows the Global Concise Generated Documents Standard & Light-Fill / Dark-Ink
 * Print Palette:
 *  - Zero dark-filled printable cells, rows, headers, or pills.
 *  - Crisp 1-word Arabic labels (`تاريخ:`, `شاحنة:`, `سائق:`, `مندوب:`, `إضافة:`)
 *    and 1-word QR caption (`للنظام`).
 *  - Prominent visual discrepancy alert banner, watermark, and highlighted rows
 *    whenever received return quantities diverge from expected return quantities.
 *  - `0.78` readability floor with clean `allow-multipage` fallback.
 */

import { buildReturnInspectionMatrix } from './truckDispatchUtils.js';
import { roundQty } from './fgStockEngine.js';

const ORDER_TYPE_SHORT_AR = {
  supply: { label: 'توريد', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  return_deduct: { label: 'مرتجع خصم', bg: '#ffe4e6', color: '#be123c', border: '#fecdd3' },
  return_no_deduct: { label: 'مرتجع بدون خصم', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  replacement_old: { label: 'استبدال', bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' },
  exchange: { label: 'تبديل', bg: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' },
  collection: { label: 'تحصيل', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  admin: { label: 'إداري', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
};

const escapeHtml = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const fmtNum = (val) => {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num)
    ? num.toLocaleString('en-US')
    : num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/**
 * Builds the pure data model for the printable Arabic Return Document (`RET-XXXXX`).
 */
export function buildReturnDocumentModel({
  trip,
  finishedProducts = [],
  companyProfile = {},
  appOriginUrl = '',
  returnDocNumber = '',
} = {}) {
  const dDoc = trip?.dispatchDoc || null;
  const tripOrders = Array.isArray(trip?.orders) ? trip.orders : [];

  const { columns, clientReturnRows, initialReturnByCol } = buildReturnInspectionMatrix({
    tripOrders,
    finishedProducts,
    dispatchDoc: dDoc,
  });

  const rows = columns.map((col) => {
    const rec = initialReturnByCol[col.colKey] || {};
    const expectedExtras = roundQty(Number(rec.expectedExtras || 0));
    const expectedClientReturns = roundQty(Number(rec.expectedClientReturns || 0));
    const expectedTotal = roundQty(expectedExtras + expectedClientReturns);
    const whReceivedExtras = roundQty(Number(rec.whReceivedExtras || 0));
    const whReceivedClientReturns = roundQty(Number(rec.whReceivedClientReturns || 0));
    const whReceivedTotal = roundQty(whReceivedExtras + whReceivedClientReturns);
    const variance = roundQty(whReceivedTotal - expectedTotal);
    const isDiscrepant = Math.abs(variance) > 0.001;

    return {
      colKey: col.colKey,
      productName: col.shortNameAr || col.nameAr || col.productCode,
      optionName: col.optionNameAr || col.optionCode,
      expectedExtras,
      expectedClientReturns,
      expectedTotal,
      whReceivedExtras,
      whReceivedClientReturns,
      whReceivedTotal,
      variance,
      isDiscrepant,
    };
  });

  const totalExpected = roundQty(rows.reduce((s, r) => s + r.expectedTotal, 0));
  const totalExpectedExtras = roundQty(rows.reduce((s, r) => s + r.expectedExtras, 0));
  const totalExpectedClient = roundQty(rows.reduce((s, r) => s + r.expectedClientReturns, 0));
  const totalReceived = roundQty(rows.reduce((s, r) => s + r.whReceivedTotal, 0));
  const netVariance = roundQty(totalReceived - totalExpected);
  const discrepantCount = rows.filter((r) => r.isDiscrepant).length;
  const returnHandshakeStatus = dDoc?.returnHandshakeStatus || 'none';
  const hasDiscrepancy =
    discrepantCount > 0 || returnHandshakeStatus === 'discrepancy_pending_accounting';

  const cleanOrigin = String(appOriginUrl || '').replace(/#.*$/, '');
  const systemTripUrl = `${cleanOrigin}#truck_dispatch?module=sales&tripId=${encodeURIComponent(trip?.id || '')}&openReturn=1`;

  const whConfirmedDate = dDoc?.whReturnConfirmedAt
    ? String(dDoc.whReturnConfirmedAt).slice(0, 10)
    : '';
  const stockRetDate = (dDoc?.stockReturnDate || '').trim();
  const isDeferredStockReturn = Boolean(
    (dDoc?.whReturnConfirmedAt || returnHandshakeStatus === 'reconciled') &&
      stockRetDate &&
      whConfirmedDate &&
      stockRetDate > whConfirmedDate
  );

  return {
    companyNameAr: companyProfile?.tradeNameAr || 'شركة الطاووس للصناعات الغذائية والتعبئة',
    returnDocNumber: String(returnDocNumber || dDoc?.latestReturnDocNumber || '').trim(),
    dispatchDocNumber: String(dDoc?.latestDispatchDocNumber || '').trim(),
    tripId: trip?.id || '',
    loadingOrderNumber: trip?.loadingOrderNumber || '—',
    loadingDate: trip?.loadingDate || '—',
    stockReturnDate: stockRetDate,
    isDeferredStockReturn,
    whReturnConfirmedByName: (dDoc?.whReturnConfirmedByName || '').trim(),
    whReturnConfirmedAt: dDoc?.whReturnConfirmedAt || '',
    accountantReturnSubmittedByName: (dDoc?.accountantReturnSubmittedByName || '').trim(),
    accountantReturnSubmittedAt: dDoc?.accountantReturnSubmittedAt || '',
    vehicleDisplayName: trip?.vehicleDisplayName || dDoc?.vehicleName || '—',
    plateNumber: trip?.plateNumber || dDoc?.plateNumber || '',
    driverName: (trip?.primaryDriverName || dDoc?.driverName || '').trim() || '—',
    deliveryRepName: (trip?.primaryRepName || dDoc?.deliveryRepName || '').trim(),
    returnHandshakeStatus,
    hasDiscrepancy,
    discrepantCount,
    totalExpectedExtras,
    totalExpectedClient,
    totalExpected,
    totalReceived,
    netVariance,
    rows,
    clientReturnRows: (clientReturnRows || []).map((cr) => {
      const items = columns
        .map((c) => ({
          productName: c.shortNameAr || c.nameAr || c.productCode,
          optionName: c.optionNameAr || c.optionCode,
          qty: Number(cr.quantitiesByCol?.[c.colKey] || 0),
        }))
        .filter((it) => it.qty > 0);
      return {
        orderId: cr.orderId,
        serial: cr.serial,
        clientName: cr.clientName,
        orderType: cr.orderType || 'supply',
        isUndeliveredReturn: Boolean(cr.isUndeliveredReturn),
        isPartialRejection: Boolean(cr.isPartialRejection),
        rowTotal: Number(cr.rowTotal || 0),
        items,
      };
    }),
    whNotes: (dDoc?.whReturnNotes || '').trim(),
    accountantNotes: (dDoc?.accountantReturnNotes || '').trim(),
    systemTripUrl,
    printedAtDisplay: new Date().toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

/**
 * Renders the concise, light-fill Arabic Return Document (`RET-XXXXX`).
 */
export function renderReturnDocumentHtml(model, qrAssets = {}) {
  const {
    companyNameAr,
    returnDocNumber = '',
    dispatchDocNumber = '',
    loadingOrderNumber,
    loadingDate,
    stockReturnDate = '',
    isDeferredStockReturn = false,
    whReturnConfirmedByName = '',
    whReturnConfirmedAt = '',
    accountantReturnSubmittedByName = '',
    accountantReturnSubmittedAt = '',
    returnHandshakeStatus = 'none',
    vehicleDisplayName,
    plateNumber = '',
    driverName = '—',
    deliveryRepName = '',
    hasDiscrepancy = false,
    totalExpectedExtras = 0,
    totalExpectedClient = 0,
    totalExpected = 0,
    totalReceived = 0,
    netVariance = 0,
    rows = [],
    clientReturnRows = [],
    whNotes = '',
    accountantNotes = '',
    printedAtDisplay = '',
  } = model;

  const systemTripQr = qrAssets.systemTripQr || '';

  const fmtVar = (v) => {
    const num = roundQty(Number(v || 0));
    if (Math.abs(num) <= 0.001) return '0';
    return `${num > 0 ? '+' : ''}${fmtNum(num)}`;
  };

  const renderOrderBadge = (cr) => {
    if (cr.isUndeliveredReturn) {
      return '<span class="badge" style="background:#fef3c7;color:#92400e;border-color:#fde68a;">غير مسلم</span>';
    }
    if (cr.isPartialRejection) {
      return '<span class="badge" style="background:#ffe4e6;color:#be123c;border-color:#fecdd3;">مرتجع جزئي</span>';
    }
    const meta = ORDER_TYPE_SHORT_AR[cr.orderType] || ORDER_TYPE_SHORT_AR.supply;
    return `<span class="badge" style="background:${meta.bg};color:${meta.color};border-color:${meta.border};">${escapeHtml(meta.label)}</span>`;
  };

  const rowsHtml = rows.length > 0
    ? rows
        .map(
          (r) => `
          <tr class="${r.isDiscrepant ? 'row-discrepancy' : ''}">
            <td class="item-col">
              <strong>${escapeHtml(r.productName)}</strong>
              <span class="col-opt">(${escapeHtml(r.optionName)})</span>
            </td>
            <td class="num">${fmtNum(r.expectedExtras)}</td>
            <td class="num">${fmtNum(r.expectedClientReturns)}</td>
            <td class="num">${fmtNum(r.expectedTotal)}</td>
            <td class="num">${fmtNum(r.whReceivedTotal)}</td>
            <td class="num ${r.isDiscrepant ? 'cell-variance-alert' : 'cell-match'}">
              ${r.isDiscrepant ? `⚠️ ${fmtVar(r.variance)}` : '0 ✓'}
            </td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="6" class="empty-cell">—</td></tr>';

  const clientBreakHtml = clientReturnRows
    .map(
      (cr) => `
      <div class="client-ret-row">
        <span>${renderOrderBadge(cr)} <strong>${escapeHtml(cr.clientName)}</strong> <span class="order-serial">#${escapeHtml(cr.serial)}</span></span>
        <span class="client-ret-items">
          ${cr.items.map((it) => `${escapeHtml(it.productName)} (${fmtNum(it.qty)})`).join(' · ') || `${fmtNum(cr.rowTotal)}`}
        </span>
      </div>`
    )
    .join('');

  const showNotes = Boolean(whNotes || accountantNotes);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>إذن استلام مرتجع — رحلة #${escapeHtml(loadingOrderNumber)}</title>
  <style>
    @page { size: A4 landscape; margin: 7mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.38;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #return-sheet-root {
      width: 283mm;
      margin: 0 auto;
      padding: 2mm;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .print-bar {
      text-align: center;
      padding: 8px;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
    }
    .print-bar button {
      background: #0f172a;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px 18px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .discrepancy-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 12px;
      background: #fff1f2;
      border: 2.5px solid #be123c;
      border-radius: 7px;
      color: #9f1239;
      font-size: 11px;
      font-weight: 900;
    }
    .discrepancy-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-22deg);
      font-size: 52px;
      font-weight: 900;
      color: rgba(190, 18, 60, 0.08);
      pointer-events: none;
      white-space: nowrap;
      z-index: 9999;
    }
    .doc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1.5px solid #0f172a;
      border-radius: 8px;
      padding: 8px 12px;
      background: #f8fafc;
    }
    .header-main { flex: 1; min-width: 0; }
    .company-name { font-size: 10px; font-weight: 700; color: #475569; }
    .doc-title-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; flex-wrap: wrap; }
    .doc-title { font-size: 15.5px; font-weight: 900; color: #0f172a; }
    .doc-num-pill {
      background: #f8fafc;
      color: #0f172a;
      border: 1.5px solid #0f172a;
      padding: 2px 8px;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      font-weight: 900;
    }
    .trip-pill {
      background: #f1f5f9;
      color: #0f172a;
      border: 1.5px solid #0f172a;
      padding: 2px 9px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 900;
    }
    .ref-pill {
      background: #ffffff;
      color: #334155;
      border: 1px solid #cbd5e1;
      padding: 2px 7px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 10px;
      font-weight: 800;
    }
    .status-pill-ok {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #86efac;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 900;
    }
    .status-pill-alert {
      background: #fff1f2;
      color: #be123c;
      border: 1.5px solid #e11d48;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 900;
    }
    .meta-grid { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 6px; font-size: 10.5px; color: #1e293b; }
    .meta-grid span strong { color: #475569; font-weight: 800; margin-left: 2px; }
    .sys-qr-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 6px;
      background: #ffffff;
      flex-shrink: 0;
    }
    .sys-qr-box img { width: 50px; height: 50px; display: block; }
    .sys-qr-label { font-size: 8.5px; font-weight: 900; color: #0f172a; }
    .sec-title {
      font-size: 11px;
      font-weight: 900;
      color: #0f172a;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 4px 10px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    table.ret-matrix {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    table.ret-matrix th, table.ret-matrix td {
      border: 1px solid #cbd5e1;
      padding: 5px 7px;
    }
    table.ret-matrix thead th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 900;
      text-align: center;
    }
    table.ret-matrix thead th.item-col { text-align: right; }
    .item-col { text-align: right; }
    .col-opt { font-size: 9px; color: #4338ca; font-weight: 700; margin-right: 4px; }
    .num { text-align: center; font-family: monospace; font-weight: 700; }
    .cell-match { color: #065f46; font-weight: 800; }
    .row-discrepancy td { background: #fff1f2; }
    .cell-variance-alert {
      background: #ffe4e6 !important;
      color: #be123c !important;
      font-weight: 900 !important;
      border: 1.5px solid #e11d48 !important;
    }
    table.ret-matrix tfoot tr.row-total td {
      background: #e2e8f0;
      color: #0f172a;
      font-weight: 900;
      border-top: 2px solid #0f172a;
    }
    .panel {
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 6px 10px;
      background: #ffffff;
    }
    .panel-title {
      font-size: 10px;
      font-weight: 900;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
      margin-bottom: 5px;
    }
    .client-ret-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 3px 0;
      border-bottom: 1px dashed #e2e8f0;
      font-size: 9.5px;
    }
    .client-ret-row:last-child { border-bottom: none; }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid transparent;
      font-size: 8.5px;
      font-weight: 800;
    }
    .order-serial { font-family: monospace; font-size: 9px; color: #475569; }
    .notes-line { font-size: 9.5px; color: #1e293b; margin-bottom: 3px; }
    .sig-panel-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      padding-top: 4px;
    }
    .sig-box {
      text-align: center;
      border-top: 1px dashed #64748b;
      padding-top: 4px;
      font-size: 9.5px;
      font-weight: 800;
      color: #334155;
      margin-top: 26px;
    }
    .muted { color: #64748b; }
    .empty-cell { text-align: center; color: #64748b; padding: 8px; }
    @media print {
      .no-print { display: none !important; }
      html.fit-single-page, body.fit-single-page { width: 283mm; height: 196mm; overflow: hidden; }
      html.allow-multipage, body.allow-multipage { width: 283mm; height: auto; overflow: visible; }
      body.allow-multipage thead { display: table-header-group; }
      body.allow-multipage .doc-header,
      body.allow-multipage .panel,
      body.allow-multipage .discrepancy-banner,
      body.allow-multipage tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${hasDiscrepancy ? '<div class="discrepancy-watermark">فرق مرتجع — DISCREPANCY</div>' : ''}
  <div class="print-bar no-print">
    <button onclick="window.print()">طباعة (${escapeHtml(returnDocNumber || `رحلة #${loadingOrderNumber}`)})</button>
  </div>
  <div id="return-sheet-root">
    ${hasDiscrepancy ? `
      <div class="discrepancy-banner">
        <span>⚠️ فرق مرتجع — غير مطابق للمتوقع</span>
        <span dir="ltr">متوقع: ${fmtNum(totalExpected)} | مستلم: ${fmtNum(totalReceived)} | الفرق: ${fmtVar(netVariance)}</span>
      </div>
    ` : ''}

    <!-- 1. Header -->
    <div class="doc-header">
      <div class="header-main">
        <div class="company-name">${escapeHtml(companyNameAr)}</div>
        <div class="doc-title-row">
          <span class="doc-title">إذن استلام مرتجع</span>
          ${returnDocNumber ? `<span class="doc-num-pill" dir="ltr">${escapeHtml(returnDocNumber)}</span>` : ''}
          <span class="trip-pill">رحلة #${escapeHtml(loadingOrderNumber)}</span>
          ${dispatchDocNumber ? `<span class="ref-pill" dir="ltr">${escapeHtml(dispatchDocNumber)}</span>` : ''}
          <span class="${hasDiscrepancy ? 'status-pill-alert' : 'status-pill-ok'}">
            ${hasDiscrepancy
              ? '⚠️ فرق مرتجع'
              : returnHandshakeStatus === 'pending_accounting_confirm'
              ? 'بانتظار الحسابات'
              : returnHandshakeStatus === 'pending_wh_confirm'
              ? 'بانتظار المخزن'
              : 'مطابق ✓'}
          </span>
          <span class="muted" style="font-size:9px;">${escapeHtml(printedAtDisplay)}</span>
        </div>
        <div class="meta-grid">
          <span><strong>تاريخ:</strong> ${escapeHtml(loadingDate)}</span>
          <span><strong>شاحنة:</strong> ${escapeHtml(vehicleDisplayName)}${plateNumber ? ` (${escapeHtml(plateNumber)})` : ''}</span>
          <span><strong>سائق:</strong> ${escapeHtml(driverName)}</span>
          ${deliveryRepName ? `<span><strong>مندوب:</strong> ${escapeHtml(deliveryRepName)}</span>` : ''}
          ${stockReturnDate ? `<span><strong>إضافة:</strong> ${escapeHtml(stockReturnDate)}${isDeferredStockReturn ? ' (جرد)' : ''}</span>` : ''}
        </div>
        ${(whReturnConfirmedAt || accountantReturnSubmittedAt) ? `
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;font-size:9.5px;color:#0f172a;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:5px;padding:3px 8px;">
            <span><strong>المخزن:</strong> ${whReturnConfirmedAt ? `${escapeHtml(whReturnConfirmedByName || 'مؤكد')} ✓` : 'قيد الانتظار'}</span>
            <span><strong>الحسابات:</strong> ${accountantReturnSubmittedAt && returnHandshakeStatus === 'reconciled' ? `${escapeHtml(accountantReturnSubmittedByName || 'مطابق')} ✓` : accountantReturnSubmittedAt ? `${escapeHtml(accountantReturnSubmittedByName || 'مسجل')}` : 'قيد الانتظار'}</span>
          </div>
        ` : ''}
      </div>
      ${systemTripQr ? `
        <div class="sys-qr-box">
          <img src="${systemTripQr}" alt="للنظام" />
          <span class="sys-qr-label">للنظام</span>
        </div>
      ` : ''}
    </div>

    <!-- 2. Return Comparison Table -->
    <div>
      <div class="sec-title">
        <span>المرتجع</span>
        <span>${rows.length} صنف</span>
      </div>
      <table class="ret-matrix">
        <thead>
          <tr>
            <th class="item-col">الصنف</th>
            <th>متوقع زيادات</th>
            <th>متوقع عملاء</th>
            <th>متوقع</th>
            <th>مستلم</th>
            <th>الفرق</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr class="row-total">
            <td class="item-col">الإجمالي</td>
            <td class="num">${fmtNum(totalExpectedExtras)}</td>
            <td class="num">${fmtNum(totalExpectedClient)}</td>
            <td class="num">${fmtNum(totalExpected)}</td>
            <td class="num">${fmtNum(totalReceived)}</td>
            <td class="num ${Math.abs(netVariance) > 0.001 || hasDiscrepancy ? 'cell-variance-alert' : 'cell-match'}">
              ${Math.abs(netVariance) > 0.001 ? `⚠️ ${fmtVar(netVariance)}` : (hasDiscrepancy ? '⚠️ فرق' : '0 ✓')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 3. Conditional Client Return Breakdown -->
    ${clientReturnRows.length > 0 ? `
      <div class="panel">
        <div class="panel-title">تفاصيل العملاء</div>
        ${clientBreakHtml}
      </div>
    ` : ''}

    <!-- 4. Conditional Notes -->
    ${showNotes ? `
      <div class="panel">
        <div class="panel-title">ملاحظات</div>
        ${whNotes ? `<div class="notes-line"><strong>المخزن:</strong> ${escapeHtml(whNotes)}</div>` : ''}
        ${accountantNotes ? `<div class="notes-line"><strong>الحسابات:</strong> ${escapeHtml(accountantNotes)}</div>` : ''}
      </div>
    ` : ''}

    <!-- 5. Signatures -->
    <div class="panel">
      <div class="panel-title">التوقيعات</div>
      <div class="sig-panel-grid">
        <div class="sig-box">المخزن</div>
        <div class="sig-box">السائق</div>
        <div class="sig-box">الحسابات</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function () {
      try {
        var root = document.getElementById('return-sheet-root');
        if (root) {
          var maxPrintableHeight = 720;
          var minReadableScale = 0.78;
          var actualHeight = root.scrollHeight;
          if (actualHeight <= maxPrintableHeight) {
            document.documentElement.classList.add('fit-single-page');
            document.body.classList.add('fit-single-page');
          } else {
            var scale = (maxPrintableHeight / actualHeight) * 0.98;
            if (scale >= minReadableScale) {
              root.style.zoom = String(scale);
              document.documentElement.classList.add('fit-single-page');
              document.body.classList.add('fit-single-page');
            } else {
              document.documentElement.classList.add('allow-multipage');
              document.body.classList.add('allow-multipage');
            }
          }
        }
      } catch (e) {}
      setTimeout(function () { window.print(); }, 120);
    };
  </script>
</body>
</html>`;
}
