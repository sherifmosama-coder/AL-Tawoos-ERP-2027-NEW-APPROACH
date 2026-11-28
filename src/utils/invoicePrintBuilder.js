/**
 * Printable A4 AR/EN Invoice & Delivery Note HTML Builder
 *
 * Strictly enforces ERP Print Design Standards:
 *  - Crisp Light-Fill / Dark-Ink print palette (#ffffff canvas, #0f172a ink, #f8fafc/#f1f5f9 tinted fills)
 *  - Zero hardcoded company names or tax numbers — consumes dynamic `companyProfile` (`useCompanyProfile`)
 *  - Bilingual AR (RTL) / EN (LTR) layout with Tajawal font & numeric tabular alignment
 *  - A4 portrait with print-time auto-fit scale safeguard floored at `0.78`
 *  - Distinct presentation for Tax Invoice (Tawoos / PL: 14% vs 0% VAT grouping, 3-layer discounts, diluted unit price)
 *    vs Delivery Note (operational dispatch/signatures, disclaimer, optional Hide Bonus)
 */

import { DOC_TYPES } from './salesInvoicingEngine.js';

const escapeHtml = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const fmtNum = (n, decimals = 2) => {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return decimals === 0 ? '0' : '0.00';
  return decimals === 0 ? String(Math.round(num)) : num.toFixed(decimals);
};

const fmtMoney = (n) => {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return '0.00';
  return num < 0 ? `(${Math.abs(num).toFixed(2)})` : num.toFixed(2);
};

/**
 * Generates self-contained printable A4 HTML for an invoice or delivery note snapshot.
 */
export function renderInvoiceDocumentHtml(model, companyProfile = {}, options = {}) {
  const m = model || {};
  const lang = (options.lang || m.lang) === 'en' ? 'en' : 'ar';
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const docType = m.docType || DOC_TYPES.TAWOOS;
  const isDN = docType === DOC_TYPES.DELIVERY_NOTE;
  const isPL = docType === DOC_TYPES.PL;
  const isVoided =
    Boolean(options.isVoided) || String(m.status || '').toLowerCase() === 'voided';
  const hideBonus =
    options.hideBonus !== undefined ? Boolean(options.hideBonus) : Boolean(m.hideBonus);

  // Dynamic Company Profile (fallback to frozen seller snapshot when historical)
  const profile = companyProfile && Object.keys(companyProfile).length > 0 ? companyProfile : {};
  const sellerName = isAr
    ? profile.tradeNameAr || m.seller?.nameAr || profile.legalName || m.seller?.legalName || ''
    : profile.tradeNameEn || m.seller?.nameEn || profile.legalName || m.seller?.legalName || '';
  const sellerTaxCard = profile.taxCardNumber || m.seller?.taxCardNumber || '';
  const sellerCr = profile.commercialRegister || m.seller?.commercialRegister || '';
  const sellerAddress = profile.registeredAddress || m.seller?.address || '';
  const sellerPhone = profile.contactPhone || m.seller?.phone || '';
  const sellerLogo = profile.logoUrl || profile.logoDataUrl || m.seller?.logoUrl || '';

  const buyer = m.buyer || {};
  const buyerName = isAr ? buyer.nameAr || buyer.nameEn || '—' : buyer.nameEn || buyer.nameAr || '—';

  const labels = {
    docTitle: isDN
      ? isAr
        ? 'إذن تسليم بضاعة'
        : 'DELIVERY NOTE'
      : isPL
        ? isAr
          ? 'فاتورة ضريبية (علامة خاصة)'
          : 'TAX INVOICE (PRIVATE LABEL)'
        : isAr
          ? 'فاتورة ضريبية'
          : 'TAX INVOICE',
    serialPrefix: isDN ? 'DN-' : isPL ? 'PL-' : 'INV-',
    date: isAr ? 'التاريخ' : 'Invoice Date',
    orderRef: isAr ? 'أمر بيع #' : 'Sales Order #',
    tripRef: isAr ? 'تحميل #' : 'Trip #',
    poRef: isAr ? 'أمر توريد العميل (PO)' : 'Customer PO #',
    sellerBox: isAr ? 'بيانات البائع (المُصدِر)' : 'Seller Details',
    buyerBox: isAr ? 'بيانات المشتري (العميل)' : 'Buyer Details',
    taxReg: isAr ? 'التسجيل الضريبي' : 'VAT Reg #',
    crNum: isAr ? 'السجل التجاري' : 'Commercial Reg #',
    branch: isAr ? 'الفرع' : 'Branch',
    address: isAr ? 'العنوان' : 'Address',
    item: isAr ? 'الصنف / الوصف' : 'Product / Description',
    barcode: isAr ? 'الباركود' : 'Barcode',
    unit: isAr ? 'الوحدة' : 'Unit',
    qty: isAr ? 'الكمية' : 'Qty',
    bonus: isAr ? 'البونص' : 'Bonus',
    unitPrice: isAr ? 'سعر الوحدة' : 'Unit Price',
    total: isAr ? 'الإجمالي' : 'Total',
    promoDiscount: isAr ? 'خصم ترويجي' : 'Promotional Discount',
    contractDiscount: isAr ? 'خصم التعاقد / الفاتورة' : 'Contract / Invoice Discount',
    manualDiscount: isAr ? 'خصم إضافي' : 'Additional Discount',
    sub14: isAr ? 'المجموع الفرعي (أصناف خاضعة لضريبة 14%)' : 'Subtotal (14% VAT Items)',
    sub0: isAr ? 'المجموع الفرعي (أصناف معفاة / 0%)' : 'Subtotal (0% VAT Exempt Items)',
    grossTotal: isAr ? 'الإجمالي قبل الخصومات' : 'Gross Before Discounts',
    netPreTax: isAr ? 'الصافي قبل الضريبة' : 'Net Before Tax',
    vat14: isAr ? 'ضريبة القيمة المضافة (14%)' : 'VAT (14%)',
    wht1: isAr ? 'خصم ضريبة أ.ت.ص (1%)' : 'Withholding Tax (1%)',
    grandTotal: isAr ? 'الإجمالي المستحق (ج.م)' : 'Grand Total (EGP)',
    notes: isAr ? 'ملاحظات المستند' : 'Document Notes',
    truck: isAr ? 'السيارة' : 'Truck',
    driver: isAr ? 'السائق' : 'Driver',
    salesRep: isAr ? 'المندوب' : 'Sales Rep',
    receiver: isAr ? 'توقيع المستلم' : 'Receiver Signature',
    storekeeper: isAr ? 'أمين المخزن / المحاسب' : 'Warehouse / Accountant',
    dnDisclaimer: isAr
      ? 'تم إصدار هذا الإذن بناءً على طلب العميل لإثبات التسليم ولا يُعتد به كفاتورة ضريبية.'
      : 'This delivery note was issued to confirm delivery and does not serve as a tax invoice.',
    voidWatermark: isAr ? 'مستند ملغي — VOID' : 'VOIDED DOCUMENT',
    deepLinkHint: isAr ? 'مرجع النظام' : 'System Ref',
    versionLabel: `v${Number(m.version || 1)}`,
    cashSalesTag: isAr ? 'بيع نقدي' : 'Cash Sales',
    splitLoadTag: isAr ? 'تحميل مجزأ مشترك' : 'Split-Load Shared',
  };

  const lines = Array.isArray(m.lines) ? m.lines : [];
  const totals = m.totals || {};
  const hasAnyBonusInLines = lines.some((l) => Number(l.bonus || 0) > 0);
  const showDnBonusCol = isDN && hasAnyBonusInLines && !hideBonus;

  let tableBodyHtml = '';

  if (isDN) {
    if (lines.length === 0) {
      tableBodyHtml = `<tr><td colspan="${showDnBonusCol ? 7 : 6}" class="empty-cell">${isAr ? 'لا توجد بنود' : 'No line items'}</td></tr>`;
    } else {
      tableBodyHtml = lines
        .map((line, i) => {
          const itemName = isAr ? line.nameAr || line.nameEn : line.nameEn || line.nameAr;
          const unitLabel = isAr ? line.unitAr || 'كرتونة' : line.unitEn || 'Carton';
          const paidNetAfterDiscounts = Number(line.netAmount ?? line.grossLineTotal ?? 0);
          return `
            <tr>
              <td class="num-cell muted">${i + 1}</td>
              <td class="item-cell">
                <div class="item-name">${escapeHtml(itemName)}</div>
                ${line.productCode ? `<div class="item-code">${escapeHtml(line.productCode)}</div>` : ''}
              </td>
              <td>${escapeHtml(unitLabel)}</td>
              <td class="num-cell strong">${fmtNum(line.qty, 0)}</td>
              ${showDnBonusCol ? `<td class="num-cell bonus-cell">${Number(line.bonus || 0) > 0 ? `+${fmtNum(line.bonus, 0)}` : '—'}</td>` : ''}
              <td class="num-cell">${fmtNum(line.baseUnitPrice, 2)}</td>
              <td class="num-cell strong">${fmtNum(line.grossLineTotal, 2)}</td>
            </tr>
            ${
              line.hasManualDiscount
                ? `<tr class="discount-row">
                    <td></td>
                    <td colspan="${showDnBonusCol ? 5 : 4}" class="discount-label">↳ ${labels.manualDiscount} (${escapeHtml(itemName)})</td>
                    <td class="num-cell discount-val">${fmtMoney(-line.manualDiscountAmount)}</td>
                  </tr>`
                : ''
            }
            ${
              paidNetAfterDiscounts !== Number(line.grossLineTotal || 0) &&
              (line.hasPromotionalDiscount || line.hasContractDiscount)
                ? `<tr class="discount-row">
                    <td></td>
                    <td colspan="${showDnBonusCol ? 5 : 4}" class="discount-label">↳ ${labels.promoDiscount} / ${labels.contractDiscount}</td>
                    <td class="num-cell discount-val">${fmtMoney(-(line.promotionalDiscountAmount + line.contractDiscountAmount))}</td>
                  </tr>`
                : ''
            }
          `;
        })
        .join('');
    }
  } else {
    // TAX INVOICE: grouped by 14% VAT vs 0% Exempt/Zero-rated
    const lines14 = lines.filter((l) => Number(l.vatRate || 0) > 0);
    const lines0 = lines.filter((l) => Number(l.vatRate || 0) === 0);

    const renderGroupRows = (groupLines, groupLabel, groupSubtotal) => {
      let runningIdx = 0;
      const rows = groupLines
        .map((line) => {
          runningIdx += 1;
          const itemName = isAr ? line.nameAr || line.nameEn : line.nameEn || line.nameAr;
          const unitLabel = isAr ? line.unitAr || 'كرتونة' : line.unitEn || 'Carton';
          const adjUnitPrice =
            line.adjustedUnitPrice !== undefined
              ? Number(line.adjustedUnitPrice)
              : Number(line.baseUnitPrice || 0);
          const displayQty = Number(line.totalQty ?? line.qty ?? 0);
          const grossLine = Number(line.grossLineTotal ?? 0);

          let out = `
            <tr>
              <td class="num-cell muted">${runningIdx}</td>
              <td class="item-cell">
                <div class="item-name">${escapeHtml(itemName)}</div>
                <div class="item-sub">
                  ${line.productCode ? `<span class="item-code">${escapeHtml(line.productCode)}</span>` : ''}
                  ${line.bonus > 0 ? `<span class="bonus-hint">${isAr ? `(شامل بونص ${line.bonus})` : `(incl. ${line.bonus} bonus)`}</span>` : ''}
                </div>
              </td>
              <td class="barcode-text">${escapeHtml(line.barcode || '—')}</td>
              <td>${escapeHtml(unitLabel)}</td>
              <td class="num-cell strong">${fmtNum(displayQty, 0)}</td>
              <td class="num-cell">${fmtNum(adjUnitPrice, 2)}</td>
              <td class="num-cell strong">${fmtNum(grossLine, 2)}</td>
            </tr>
          `;

          if (line.hasPromotionalDiscount) {
            const perUnit = displayQty > 0 ? -line.promotionalDiscountAmount / displayQty : 0;
            out += `
              <tr class="discount-row">
                <td></td>
                <td colspan="4" class="discount-label">↳ ${labels.promoDiscount} (${fmtNum(line.promotionalDiscountPct, 1)}%)</td>
                <td class="num-cell discount-val">${fmtMoney(perUnit)}</td>
                <td class="num-cell discount-val">${fmtMoney(-line.promotionalDiscountAmount)}</td>
              </tr>
            `;
          }
          if (line.hasContractDiscount) {
            const perUnit = displayQty > 0 ? -line.contractDiscountAmount / displayQty : 0;
            out += `
              <tr class="discount-row">
                <td></td>
                <td colspan="4" class="discount-label">↳ ${labels.contractDiscount} (${fmtNum(line.contractDiscountPct, 1)}%)</td>
                <td class="num-cell discount-val">${fmtMoney(perUnit)}</td>
                <td class="num-cell discount-val">${fmtMoney(-line.contractDiscountAmount)}</td>
              </tr>
            `;
          }
          if (line.hasManualDiscount) {
            const perUnit = displayQty > 0 ? -line.manualDiscountAmount / displayQty : 0;
            out += `
              <tr class="discount-row">
                <td></td>
                <td colspan="4" class="discount-label">↳ ${labels.manualDiscount}</td>
                <td class="num-cell discount-val">${fmtMoney(perUnit)}</td>
                <td class="num-cell discount-val">${fmtMoney(-line.manualDiscountAmount)}</td>
              </tr>
            `;
          }
          return out;
        })
        .join('');

      return `${rows}
        <tr class="subtotal-row">
          <td colspan="6" class="subtotal-label">${escapeHtml(groupLabel)}</td>
          <td class="num-cell subtotal-val">${fmtNum(groupSubtotal, 2)}</td>
        </tr>
      `;
    };

    if (lines.length === 0) {
      tableBodyHtml = `<tr><td colspan="7" class="empty-cell">${isAr ? 'لا توجد بنود ضريبية' : 'No tax invoice items'}</td></tr>`;
    } else {
      if (lines14.length > 0) {
        const sub14 = lines14.reduce((s, l) => s + Number(l.netAmount || 0), 0);
        tableBodyHtml += renderGroupRows(lines14, labels.sub14, sub14);
      }
      if (lines0.length > 0) {
        const sub0 = lines0.reduce((s, l) => s + Number(l.netAmount || 0), 0);
        tableBodyHtml += renderGroupRows(lines0, labels.sub0, sub0);
      }
    }
  }

  const accentBg = isDN ? '#fffbeb' : isPL ? '#f5f3ff' : '#eff6ff';
  const accentBorder = isDN ? '#fde68a' : isPL ? '#ddd6fe' : '#bfdbfe';
  const accentInk = isDN ? '#92400e' : isPL ? '#5b21b6' : '#1e3a8a';

  return `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.docTitle)} #${escapeHtml(m.serialNo || '')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      color: #0f172a;
      font-family: 'Tajawal', system-ui, -apple-system, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    .sheet {
      width: 190mm;
      min-height: 277mm;
      margin: 12px auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12mm 11mm;
      position: relative;
      box-shadow: 0 4px 18px rgba(15, 23, 42, 0.08);
    }
    ${
      isVoided
        ? `.void-stamp {
            position: fixed;
            top: 44%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-24deg);
            font-size: 46px;
            font-weight: 900;
            color: rgba(190, 18, 60, 0.16);
            border: 5px solid rgba(190, 18, 60, 0.22);
            padding: 10px 28px;
            border-radius: 14px;
            pointer-events: none;
            z-index: 50;
            letter-spacing: 2px;
          }`
        : ''
    }
    /* Light-Fill / Dark-Ink Letterhead */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      gap: 14px;
      padding: 12px 14px;
      background: ${accentBg};
      border: 1px solid ${accentBorder};
      border-radius: 10px;
      margin-bottom: 14px;
    }
    .brand-col {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1.3;
    }
    .brand-logo {
      width: 52px;
      height: 52px;
      object-fit: contain;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 4px;
    }
    .seller-title {
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
      margin: 0 0 2px 0;
    }
    .seller-meta {
      font-size: 10.5px;
      color: #475569;
    }
    .doc-badge-col {
      text-align: end;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-end;
      gap: 4px;
    }
    .doc-type-title {
      font-size: 18px;
      font-weight: 900;
      color: ${accentInk};
      margin: 0;
    }
    .serial-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1.5px solid ${accentBorder};
      color: #0f172a;
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }
    .version-chip {
      font-size: 10px;
      font-weight: 800;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      padding: 1px 6px;
      border-radius: 999px;
    }
    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: flex-end;
    }
    .mini-chip {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 5px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #1e293b;
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .info-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
    }
    .info-card-hdr {
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
      padding: 5px 10px;
      font-size: 10.5px;
      font-weight: 800;
      color: #334155;
      text-transform: uppercase;
    }
    .info-card-body {
      padding: 8px 10px;
      font-size: 11.5px;
      color: #1e293b;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
    }
    .lbl { color: #64748b; font-weight: 600; font-size: 10.5px; }
    .val { color: #0f172a; font-weight: 800; }
    .ltr-num { direction: ltr; unicode-bidi: embed; font-variant-numeric: tabular-nums; display: inline-block; }

    .table-wrap {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
    }
    table.items-table thead th {
      background: #f1f5f9;
      color: #0f172a;
      border-bottom: 1.5px solid #cbd5e1;
      padding: 7px 6px;
      font-size: 11px;
      font-weight: 800;
      text-align: center;
    }
    table.items-table tbody td {
      border-bottom: 1px solid #e2e8f0;
      padding: 6px;
      font-size: 11.5px;
      text-align: center;
      vertical-align: middle;
    }
    .item-cell { text-align: start !important; min-width: 145px; }
    .item-name { font-weight: 800; color: #0f172a; }
    .item-sub { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 1px; }
    .item-code { font-size: 9.5px; font-family: ui-monospace, monospace; color: #64748b; }
    .bonus-hint { font-size: 9.5px; color: #047857; font-weight: 700; }
    .bonus-cell { color: #047857; font-weight: 800; }
    .barcode-text { font-family: ui-monospace, monospace; font-size: 10px; color: #475569; }
    .num-cell { font-variant-numeric: tabular-nums; direction: ltr; }
    .strong { font-weight: 800; color: #0f172a; }
    .muted { color: #64748b; }
    .empty-cell { padding: 24px !important; color: #64748b; font-weight: 700; }

    .discount-row td {
      background: #fff1f2;
      border-bottom: 1px solid #fecdd3 !important;
      padding: 4px 6px !important;
      font-size: 10.5px !important;
    }
    .discount-label { text-align: start !important; color: #9f1239; font-weight: 700; padding-inline-start: 18px !important; }
    .discount-val { color: #be123c; font-weight: 800; }

    .subtotal-row td {
      background: #f8fafc;
      border-top: 1.5px solid #cbd5e1 !important;
      border-bottom: 1.5px solid #94a3b8 !important;
      padding: 6px 8px !important;
    }
    .subtotal-label { text-align: end !important; font-weight: 800; color: #334155; font-size: 11px !important; }
    .subtotal-val { font-weight: 900; color: #0f172a; }

    .bottom-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 14px;
    }
    .notes-box {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
    }
    .tafqeet-box {
      margin-top: 8px;
      padding: 6px 10px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 6px;
      color: #065f46;
      font-weight: 800;
      font-size: 11px;
    }
    .totals-card {
      width: 280px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
    }
    table.totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    table.totals-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11.5px;
    }
    table.totals-table td:last-child {
      text-align: end;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
    }
    table.totals-table tr.grand-row td {
      background: ${accentBg};
      color: ${accentInk};
      border-top: 2px solid #94a3b8;
      border-bottom: none;
      font-size: 13.5px;
      font-weight: 900;
      padding: 8px 10px;
    }

    .dn-disclaimer {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      border-radius: 8px;
      padding: 8px 12px;
      text-align: center;
      font-weight: 800;
      font-size: 11px;
      margin-bottom: 18px;
    }
    .signatures-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 20px;
    }
    .sig-line {
      border-top: 1px dashed #94a3b8;
      padding-top: 6px;
      text-align: center;
      font-size: 11.5px;
      font-weight: 700;
      color: #334155;
    }
    .doc-footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #64748b;
    }

    @media print {
      html, body { background: #ffffff !important; }
      .sheet {
        margin: 0;
        width: 100%;
        min-height: auto;
        border: none;
        box-shadow: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  ${isVoided ? `<div class="void-stamp">${labels.voidWatermark}</div>` : ''}
  <div id="print-sheet" class="sheet">
    <!-- Dynamic Letterhead Header -->
    <div class="doc-header">
      <div class="brand-col">
        ${sellerLogo ? `<img src="${escapeHtml(sellerLogo)}" alt="logo" class="brand-logo" />` : ''}
        <div>
          <h2 class="seller-title">${escapeHtml(sellerName || (isAr ? 'بيانات الشركة' : 'Company Profile'))}</h2>
          <div class="seller-meta">
            ${sellerTaxCard ? `<span>${labels.taxReg}: <strong class="ltr-num">${escapeHtml(sellerTaxCard)}</strong></span>` : ''}
            ${sellerCr ? `<span> • ${labels.crNum}: <strong class="ltr-num">${escapeHtml(sellerCr)}</strong></span>` : ''}
          </div>
          ${sellerAddress ? `<div class="seller-meta">${escapeHtml(sellerAddress)}</div>` : ''}
          ${sellerPhone ? `<div class="seller-meta ltr-num">${escapeHtml(sellerPhone)}</div>` : ''}
        </div>
      </div>

      <div class="doc-badge-col">
        <h1 class="doc-type-title">${escapeHtml(labels.docTitle)}</h1>
        <div class="serial-pill">
          <span class="ltr-num">${escapeHtml(labels.serialPrefix)}${escapeHtml(m.serialNo || '—')}</span>
          <span class="version-chip">${escapeHtml(labels.versionLabel)}</span>
        </div>
        <div class="tag-row">
          <span class="mini-chip">${labels.date}: <span class="ltr-num">${escapeHtml(m.invoiceDate || '')}</span></span>
          ${m.cashSales ? `<span class="mini-chip">${escapeHtml(labels.cashSalesTag)}</span>` : ''}
          ${m.isSplitLoad ? `<span class="mini-chip">${escapeHtml(labels.splitLoadTag)}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Parties & Reference Metadata -->
    <div class="parties-grid">
      <div class="info-card">
        <div class="info-card-hdr">${escapeHtml(labels.buyerBox)}</div>
        <div class="info-card-body">
          <div class="val" style="font-size:13px; margin-bottom:4px;">${escapeHtml(buyerName)}</div>
          ${buyer.branchName ? `<div><span class="lbl">${labels.branch}:</span> ${escapeHtml(buyer.branchName)}</div>` : ''}
          ${buyer.address ? `<div><span class="lbl">${labels.address}:</span> ${escapeHtml(buyer.address)}</div>` : ''}
          ${!isDN && buyer.taxCard ? `<div><span class="lbl">${labels.taxReg}:</span> <span class="val ltr-num">${escapeHtml(buyer.taxCard)}</span></div>` : ''}
          ${!isDN && buyer.commercialRegister ? `<div><span class="lbl">${labels.crNum}:</span> <span class="val ltr-num">${escapeHtml(buyer.commercialRegister)}</span></div>` : ''}
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-hdr">${escapeHtml(isAr ? 'البيانات المرجعية والتشغيلية' : 'Order & Logistics Reference')}</div>
        <div class="info-card-body meta-grid">
          <div><span class="lbl">${labels.orderRef}:</span> <span class="val ltr-num">#${escapeHtml(m.orderNo || m.orderId || '—')}</span></div>
          <div><span class="lbl">${labels.poRef}:</span> <span class="val ltr-num">${escapeHtml(m.poNumber || '—')}</span></div>
          ${m.tripNumber ? `<div><span class="lbl">${labels.tripRef}:</span> <span class="val ltr-num">${escapeHtml(m.tripNumber)}</span></div>` : ''}
          ${m.truckName ? `<div><span class="lbl">${labels.truck}:</span> <span class="val">${escapeHtml(m.truckName)}</span></div>` : ''}
          ${m.driverName ? `<div><span class="lbl">${labels.driver}:</span> <span class="val">${escapeHtml(m.driverName)}</span></div>` : ''}
          ${m.salesRep ? `<div><span class="lbl">${labels.salesRep}:</span> <span class="val">${escapeHtml(m.salesRep)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <!-- Line Items Table -->
    <div class="table-wrap">
      <table class="items-table">
        <thead>
          ${
            isDN
              ? `<tr>
                  <th style="width:34px;">#</th>
                  <th>${labels.item}</th>
                  <th>${labels.unit}</th>
                  <th>${labels.qty}</th>
                  ${showDnBonusCol ? `<th>${labels.bonus}</th>` : ''}
                  <th>${labels.unitPrice}</th>
                  <th>${labels.total}</th>
                </tr>`
              : `<tr>
                  <th style="width:34px;">#</th>
                  <th>${labels.item}</th>
                  <th>${labels.barcode}</th>
                  <th>${labels.unit}</th>
                  <th>${labels.qty}</th>
                  <th>${labels.unitPrice}</th>
                  <th>${labels.total}</th>
                </tr>`
          }
        </thead>
        <tbody>
          ${tableBodyHtml}
        </tbody>
      </table>
    </div>

    <!-- Totals & Notes -->
    <div class="bottom-grid">
      <div style="flex:1;">
        ${
          m.notes
            ? `<div class="notes-box">
                <div class="lbl" style="margin-bottom:3px;">${labels.notes}:</div>
                <div style="white-space:pre-wrap;">${escapeHtml(m.notes)}</div>
              </div>`
            : ''
        }
        ${
          isAr && totals.tafqeetAr
            ? `<div class="tafqeet-box">${escapeHtml(totals.tafqeetAr)}</div>`
            : ''
        }
      </div>

      <div class="totals-card">
        <table class="totals-table">
          ${
            totals.totalPromotionalDiscount > 0 ||
            totals.totalContractDiscount > 0 ||
            totals.totalManualDiscount > 0
              ? `<tr><td>${labels.grossTotal}</td><td class="ltr-num">${fmtNum(totals.grossSubtotal, 2)}</td></tr>`
              : ''
          }
          ${totals.totalPromotionalDiscount > 0 ? `<tr><td>${labels.promoDiscount}</td><td class="discount-val ltr-num">${fmtMoney(-totals.totalPromotionalDiscount)}</td></tr>` : ''}
          ${totals.totalContractDiscount > 0 ? `<tr><td>${labels.contractDiscount}</td><td class="discount-val ltr-num">${fmtMoney(-totals.totalContractDiscount)}</td></tr>` : ''}
          ${totals.totalManualDiscount > 0 ? `<tr><td>${labels.manualDiscount}</td><td class="discount-val ltr-num">${fmtMoney(-totals.totalManualDiscount)}</td></tr>` : ''}
          ${!isDN ? `<tr><td>${labels.netPreTax}</td><td class="ltr-num">${fmtNum(totals.netPreTaxTotal, 2)}</td></tr>` : ''}
          ${!isDN ? `<tr><td>${labels.vat14}</td><td class="ltr-num">${fmtNum(totals.vatTotal, 2)}</td></tr>` : ''}
          ${!isDN && Number(totals.whtTotal || 0) > 0 ? `<tr><td>${labels.wht1}</td><td class="discount-val ltr-num">${fmtMoney(-totals.whtTotal)}</td></tr>` : ''}
          <tr class="grand-row">
            <td>${labels.grandTotal}</td>
            <td class="ltr-num">${fmtNum(totals.grandTotal, 2)}</td>
          </tr>
        </table>
      </div>
    </div>

    ${isDN ? `<div class="dn-disclaimer">${escapeHtml(labels.dnDisclaimer)}</div>` : ''}

    <div class="signatures-row">
      <div class="sig-line">${escapeHtml(labels.storekeeper)}</div>
      <div class="sig-line">${escapeHtml(labels.receiver)}</div>
    </div>

    <div class="doc-footer">
      <span>${escapeHtml(labels.deepLinkHint)}: <strong class="ltr-num">${escapeHtml(m.qrDeepLink || `#sales_invoicing?highlight=${m.orderId || ''}`)}</strong></span>
      <span>${escapeHtml(labels.versionLabel)} • ${escapeHtml(m.sourceOrderFingerprint || '')}</span>
    </div>
  </div>

  <!-- Auto-Fit A4 Scale Safeguard (floored at 0.78 per ERP standard) -->
  <script>
    (function fitA4() {
      try {
        var el = document.getElementById('print-sheet');
        if (!el) return;
        var maxH = 1040; // ~275mm at 96dpi inside 10mm A4 margins
        var h = el.scrollHeight;
        if (h > maxH) {
          var scale = Math.max(0.78, Math.min(1, maxH / h));
          el.style.zoom = scale.toFixed(3);
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

/**
 * Opens a clean browser print window for committed invoice/DN HTML.
 */
export function openInvoicePrintWindow(html) {
  if (typeof window === 'undefined' || !html) return null;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=980,height=840');
  if (!win) return null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      // Ignore focus/print cancellation
    }
  }, 350);
  return win;
}
