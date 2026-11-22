/**
 * Single-Page Arabic (RTL) Printable Truck Dispatch Document Builder
 *
 * Pure operational document (no prices / no financial amounts):
 *  - Header: Company, Trip #, Date, Truck + Plate, Driver, Rep, Weight/Cartons, System-Only Trip QR
 *  - Ordered Quantities Matrix (Clients × Product/Packing Option + Order Type + Extras + Total Loaded)
 *  - Expected Returned Products (Dispatched Extras + Client Return/Exchange Orders)
 *  - Proposed Trip Directions / Route (Nearest-Neighbor from Factory GPS + Multi-Stop Google Maps QR)
 *  - Client Delivery Cards (Stop #, Phones, Contact, Region, Address, Working Hours/Holidays,
 *    Sales Order Internal Comments, Client Location QR)
 *  - Labour Roster (Loading & Offloading with effort %), Warehouse Dispatch Comments, and Sign-offs
 *  - Strict single-page A4 Landscape print layout with automatic print-time scale-to-fit safeguard.
 */

import {
  buildTripDispatchMatrix,
  buildReturnInspectionMatrix,
} from './truckDispatchUtils.js';
import {
  resolveLocationInfo,
  buildProposedTripRoute,
} from './locationUtils.js';

export const ORDER_TYPE_AR = {
  supply: { label: 'توريد', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  return_deduct: { label: 'مرتجع خصم', bg: '#ffe4e6', color: '#be123c', border: '#fecdd3' },
  return_no_deduct: { label: 'مرتجع بدون خصم', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  replacement_old: { label: 'استبدال', bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' },
  exchange: { label: 'تبديل', bg: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' },
  collection: { label: 'تحصيل', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  admin: { label: 'إداري', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
};

const DAY_MAP_AR = {
  friday: 'الجمعة',
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الإثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
};

const escapeHtml = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const fmtNum = (n) => {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
};

/**
 * Extracts rich operational contact, schedule, region, address, comments, and location info
 * for a single sales order + client record (strictly non-financial).
 */
export function extractClientOperationalData(order = {}, clientObj = null) {
  const branches = Array.isArray(clientObj?.branches) ? clientObj.branches : [];
  const branch =
    branches.find((b) => (b.id || 'br_main') === order.branchId) ||
    branches[0] ||
    null;

  // Working hours
  const useCustom = Boolean(branch?.useCustomSchedule);
  const bFrom = (branch?.workingHoursFrom || '').trim();
  const bTo = (branch?.workingHoursTo || '').trim();
  const cFrom = (clientObj?.workingHoursFrom || '').trim();
  const cTo = (clientObj?.workingHoursTo || '').trim();

  const hoursFrom = useCustom && (bFrom || bTo) ? bFrom : (cFrom || bFrom);
  const hoursTo = useCustom && (bFrom || bTo) ? bTo : (cTo || bTo);
  const workingHours =
    hoursFrom && hoursTo
      ? `${hoursFrom} – ${hoursTo}`
      : hoursFrom || hoursTo || '';

  // Non-Friday weekly holidays
  const bHolidays = Array.isArray(branch?.weeklyHolidays) ? branch.weeklyHolidays.filter(Boolean) : [];
  const cHolidays = Array.isArray(clientObj?.weeklyHolidays) ? clientObj.weeklyHolidays.filter(Boolean) : [];
  const rawHolidays = useCustom && bHolidays.length > 0
    ? bHolidays
    : (cHolidays.length > 0 ? cHolidays : bHolidays);
  const nonFridayHolidays = rawHolidays
    .filter((d) => String(d).toLowerCase().trim() !== 'friday' && d !== 5)
    .map((d) => DAY_MAP_AR[String(d).toLowerCase().trim()] || String(d));

  // Phones & contact person
  const contactPerson = branch?.contactPerson || clientObj?.contactPerson || order.contactPerson || '';
  const phoneList = [];
  if (branch?.phone) phoneList.push(branch.phone);
  if (branch?.mobile) phoneList.push(branch.mobile);
  if (Array.isArray(branch?.phones)) phoneList.push(...branch.phones.filter(Boolean));
  if (phoneList.length === 0) {
    if (Array.isArray(clientObj?.phones)) phoneList.push(...clientObj.phones.filter(Boolean));
    if (clientObj?.phone) phoneList.push(clientObj.phone);
    if (clientObj?.mobile) phoneList.push(clientObj.mobile);
  }
  if (order.clientPhone) phoneList.push(order.clientPhone);
  const phones = Array.from(new Set(phoneList.map((p) => String(p).trim()).filter(Boolean)));

  // Region & Address
  const region = (
    branch?.region ||
    branch?.regionAr ||
    order.region ||
    order.clientRegion ||
    clientObj?.region ||
    clientObj?.governorate ||
    ''
  ).trim();

  const address = (
    order.shippingAddress ||
    order.deliveryAddress ||
    branch?.address ||
    clientObj?.address ||
    ''
  ).trim();

  const branchName = (branch?.nameAr || branch?.name || order.branchName || '').trim();
  const clientName = (
    order.clientName ||
    order.clientNameAr ||
    clientObj?.tradeNameAr ||
    clientObj?.name ||
    '—'
  ).trim();

  const internalComments = (order.internalComments || '').trim();
  const clientNotes = (branch?.notes || clientObj?.notes || '').trim();
  const locationInfo = resolveLocationInfo(branch, clientObj, order);

  return {
    orderId: order.id || '',
    serial: order.serial || String(order.id || '').replace(/^SO-/, ''),
    orderType: order.orderType || 'supply',
    clientId: order.clientId || clientObj?.id || '',
    clientName,
    branchName,
    region,
    address,
    phones,
    phonesDisplay: phones.join(' / '),
    contactPerson,
    workingHours,
    holidaysDisplay: nonFridayHolidays.join('، '),
    internalComments,
    clientNotes,
    locationInfo,
  };
}

/**
 * Builds the complete pure data model for the printable Arabic Dispatch Document.
 * Strictly excludes all prices, totals, taxes, and financial amounts.
 */
export function buildDispatchDocumentModel({
  trip,
  finishedProducts = [],
  clients = [],
  companyProfile = {},
  appOriginUrl = '',
  versionNumber = 1,
  docNumber = '',
} = {}) {
  const dispatchDoc = trip?.dispatchDoc || null;
  const tripOrders = Array.isArray(trip?.orders) ? trip.orders : [];

  const clientsById = {};
  (clients || []).forEach((c) => {
    if (c?.id) clientsById[c.id] = c;
  });

  // 1. Ordered Quantities Matrix (outbound orders + extras)
  const { columns, clientRows } = buildTripDispatchMatrix({
    tripOrders,
    finishedProducts,
    existingDispatch: dispatchDoc,
  });

  const totalLocked = columns.reduce((s, c) => s + Number(c.lockedQty || 0), 0);
  const totalExtras = columns.reduce((s, c) => s + Number(c.extraQty || 0), 0);
  const totalLoaded = totalLocked + totalExtras;
  const extrasWeightKg = columns.reduce(
    (s, c) => s + Number(c.extraQty || 0) * Number(c.largeUnitWeightKg || 0),
    0
  );
  const ordersWeightKg = Number(trip?.totalWeightKg || 0);
  const computedTotalWeightTon =
    ordersWeightKg > 0 || extrasWeightKg > 0
      ? Math.round(((ordersWeightKg + extrasWeightKg) / 1000) * 100) / 100
      : Number(trip?.totalWeightTon || 0);
  const maxCapKg = Number(trip?.vehicleObj?.maxCapacityKg || 0);
  const computedMaxWeightTon =
    maxCapKg > 0
      ? Math.round((maxCapKg / 1000) * 100) / 100
      : Number(trip?.vehicleMaxWeightTon || 0);

  // 2. Expected Returned Products (Dispatched Extras + Client Return / Exchange orders)
  const { columns: retCols, clientReturnRows } = buildReturnInspectionMatrix({
    tripOrders,
    finishedProducts,
    dispatchDoc,
  });

  const expectedExtrasReturn = retCols
    .filter((c) => Number(c.dispatchedExtrasQty || 0) > 0)
    .map((c) => ({
      colKey: c.colKey,
      productName: c.shortNameAr || c.nameAr || c.productCode,
      optionName: c.optionNameAr || c.optionCode,
      qty: Number(c.dispatchedExtrasQty || 0),
    }));

  const expectedClientReturns = clientReturnRows.map((cr) => {
    const items = retCols
      .map((c) => ({
        colKey: c.colKey,
        productName: c.shortNameAr || c.nameAr || c.productCode,
        optionName: c.optionNameAr || c.optionCode,
        qty: Number(cr.quantitiesByCol?.[c.colKey] || 0),
      }))
      .filter((it) => it.qty > 0);
    return {
      orderId: cr.orderId,
      serial: cr.serial,
      clientName: cr.clientName,
      orderType: cr.orderType || 'return_deduct',
      rowTotal: Number(cr.rowTotal || 0),
      items,
    };
  });

  // 3. Client Operational Cards (deduplicated per client+branch, aggregating multiple orders at same stop)
  const stopMap = new Map();
  tripOrders.forEach((order) => {
    const clientObj = clientsById[order.clientId] || null;
    const info = extractClientOperationalData(order, clientObj);
    const stopKey = `${info.clientId || info.clientName}::${order.branchId || info.branchName || 'main'}`;
    const orderSeq = Number(order.deliverySequence);
    const validSeq = Number.isFinite(orderSeq) && orderSeq > 0 ? Math.floor(orderSeq) : null;

    if (!stopMap.has(stopKey)) {
      stopMap.set(stopKey, {
        key: stopKey,
        label: info.branchName ? `${info.clientName} (${info.branchName})` : info.clientName,
        clientName: info.clientName,
        branchName: info.branchName,
        region: info.region,
        address: info.address,
        phonesDisplay: info.phonesDisplay,
        contactPerson: info.contactPerson,
        workingHours: info.workingHours,
        holidaysDisplay: info.holidaysDisplay,
        clientNotes: info.clientNotes,
        locationInfo: info.locationInfo,
        rawLocation: info.locationInfo?.raw || '',
        url: info.locationInfo?.url || '',
        manualSequence: validSeq,
        orders: [],
      });
    }

    const stop = stopMap.get(stopKey);
    if (validSeq !== null && (stop.manualSequence === null || validSeq < stop.manualSequence)) {
      stop.manualSequence = validSeq;
    }
    stop.orders.push({
      orderId: info.orderId,
      serial: info.serial,
      orderType: info.orderType,
      internalComments: info.internalComments,
    });
    if (!stop.locationInfo && info.locationInfo) {
      stop.locationInfo = info.locationInfo;
      stop.rawLocation = info.locationInfo.raw || '';
      stop.url = info.locationInfo.url || '';
    }
  });

  // 4. Proposed Trip Route (Nearest-Neighbor from Factory GPS)
  const proposedRoute = buildProposedTripRoute({
    originRaw: companyProfile?.factoryGpsLocation || '',
    stops: Array.from(stopMap.values()),
  });

  const clientStops = (proposedRoute.orderedStops || []).map((st) => ({
    ...st,
    hasAccurateLocation: st.locationInfo?.type === 'accurate' && Boolean(st.locationInfo?.url),
  }));

  // Route QR is ONLY shared if there is more than 1 client AND all clients have accurate locations
  const canShowRouteQr =
    clientStops.length > 1 &&
    clientStops.every((st) => st.hasAccurateLocation) &&
    Boolean(proposedRoute.googleMapsRouteUrl);

  // 5. System-only Trip Deep-Link URL (includes docNumber & docVersion so scanning an old/orphaned paper resolves accurately)
  const cleanOrigin = String(appOriginUrl || '').replace(/#.*$/, '');
  const safeVersion = Math.max(1, Number(versionNumber) || 1);
  const cleanDocNumber = String(docNumber || '').trim();
  const docNumQuery = cleanDocNumber ? `&docNumber=${encodeURIComponent(cleanDocNumber)}` : '';
  const systemTripUrl = `${cleanOrigin}#truck_dispatch?module=sales&tripId=${encodeURIComponent(trip?.id || '')}&docVersion=${safeVersion}${docNumQuery}`;

  // 6. Labour & Dispatch Comments
  const loadingWorkers = Array.isArray(dispatchDoc?.loadingWorkers) ? dispatchDoc.loadingWorkers : [];
  const offloadingWorkers = Array.isArray(dispatchDoc?.offloadingWorkers) ? dispatchDoc.offloadingWorkers : [];
  const dispatchNotes = (dispatchDoc?.dispatchNotes || '').trim();

  const resolvedDriverName =
    (trip?.primaryDriverName || trip?.driverName || dispatchDoc?.driverName || '').trim() || '—';
  const resolvedRepName =
    (trip?.primaryRepName || trip?.deliveryRepName || dispatchDoc?.deliveryRepName || '').trim();

  return {
    companyNameAr: companyProfile?.tradeNameAr || 'شركة الطاووس للصناعات الغذائية والتعبئة',
    docNumber: cleanDocNumber,
    tripId: trip?.id || '',
    loadingOrderNumber: trip?.loadingOrderNumber || '—',
    loadingDate: trip?.loadingDate || '—',
    vehicleDisplayName: trip?.vehicleDisplayName || '—',
    plateNumber: trip?.plateNumber || '',
    driverName: resolvedDriverName,
    deliveryRepName: resolvedRepName,
    totalWeightTon: computedTotalWeightTon,
    vehicleMaxWeightTon: computedMaxWeightTon,
    versionNumber: safeVersion,
    systemTripUrl,
    columns,
    clientRows,
    totalLocked,
    totalExtras,
    totalLoaded,
    expectedExtrasReturn,
    expectedClientReturns,
    proposedRoute,
    canShowRouteQr,
    clientStops,
    loadingWorkers,
    offloadingWorkers,
    dispatchNotes,
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
 * Renders the strict single-page Arabic (RTL) A4 Landscape Dispatch Document HTML.
 *
 * @param {object} model - Output of buildDispatchDocumentModel
 * @param {object} qrAssets - Pre-generated QR Data URLs:
 *   { systemTripQr?: string, routeQr?: string, clientQrs?: Record<string, string> }
 */
export function renderDispatchDocumentHtml(model, qrAssets = {}, versionMeta = null) {
  const {
    companyNameAr,
    docNumber: modelDocNumber = '',
    loadingOrderNumber,
    loadingDate,
    vehicleDisplayName,
    plateNumber,
    driverName,
    deliveryRepName,
    totalWeightTon,
    vehicleMaxWeightTon,
    versionNumber: modelVersionNumber = 1,
    columns = [],
    clientRows = [],
    totalLocked = 0,
    totalExtras = 0,
    totalLoaded = 0,
    expectedExtrasReturn = [],
    expectedClientReturns = [],
    proposedRoute = {},
    canShowRouteQr = false,
    clientStops = [],
    loadingWorkers = [],
    offloadingWorkers = [],
    dispatchNotes = '',
    printedAtDisplay = '',
  } = model;

  const clientQrs = qrAssets.clientQrs || {};
  const systemTripQr = qrAssets.systemTripQr || '';
  const routeQr = canShowRouteQr ? (qrAssets.routeQr || '') : '';
  const latestVersionQr = qrAssets.latestVersionQr || '';

  const docNumber = String(versionMeta?.docNumber || modelDocNumber || '').trim();
  const docVer = Math.max(1, Number(versionMeta?.versionNumber || modelVersionNumber || 1));
  const isLegacy = Boolean(versionMeta?.isLegacy);
  const newVersionReleased = Boolean(versionMeta?.newVersionReleased);
  const latestVersionNumber = versionMeta?.latestVersionNumber || null;
  const latestDocNumber = String(versionMeta?.latestDocNumber || '').trim();
  const latestVersionUrl = versionMeta?.latestVersionUrl || '';
  const supersededReasonAr = (versionMeta?.supersededReasonAr || '').trim();
  const legacyHeadlineAr = (versionMeta?.legacyHeadlineAr || '').trim();
  const legacyReason = supersededReasonAr || legacyHeadlineAr || 'نسخة معدلة';
  const docRefLabel = docNumber ? `${docNumber} · v${docVer}` : `v${docVer}`;
  const latestRefLabel = latestDocNumber
    ? `${latestDocNumber}${latestVersionNumber ? ` · v${latestVersionNumber}` : ''}`
    : (latestVersionNumber ? `v${latestVersionNumber}` : '');

  const renderOrderTypeBadge = (orderType) => {
    const meta = ORDER_TYPE_AR[orderType] || ORDER_TYPE_AR.supply;
    return `<span class="badge" style="background:${meta.bg};color:${meta.color};border-color:${meta.border};">${escapeHtml(meta.label)}</span>`;
  };

  // Matrix rows HTML
  const matrixHeaderCols = columns
    .map(
      (col) => `
      <th>
        <div class="col-prod">${escapeHtml(col.shortNameAr || col.nameAr || col.productCode)}</div>
        <div class="col-opt">${escapeHtml(col.optionNameAr || col.optionCode)}</div>
      </th>`
    )
    .join('');

  const matrixBodyRows = clientRows.length > 0
    ? clientRows
        .map((row) => {
          const cells = columns
            .map((col) => {
              const q = Number(row.quantitiesByCol?.[col.colKey] || 0);
              return `<td class="num ${q > 0 ? 'has-qty' : 'zero'}">${q > 0 ? fmtNum(q) : '—'}</td>`;
            })
            .join('');
          return `
            <tr>
              <td class="client-col">
                <span class="client-name">${escapeHtml(row.clientName)}</span>
                <span class="order-serial">#${escapeHtml(row.serial)}</span>
                ${renderOrderTypeBadge(row.orderType)}
              </td>
              ${cells}
              <td class="num total-col">${fmtNum(row.rowTotal)}</td>
            </tr>`;
        })
        .join('')
    : `<tr><td colspan="${columns.length + 2}" class="empty-cell">—</td></tr>`;

  const lockedFooterCells = columns
    .map((col) => `<td class="num">${fmtNum(col.lockedQty)}</td>`)
    .join('');
  const extrasFooterCells = columns
    .map((col) => {
      const ex = Number(col.extraQty || 0);
      return `<td class="num ${ex > 0 ? 'extra-val' : 'zero'}">${ex > 0 ? `+${fmtNum(ex)}` : '0'}</td>`;
    })
    .join('');
  const loadedFooterCells = columns
    .map((col) => `<td class="num">${fmtNum(Number(col.lockedQty || 0) + Number(col.extraQty || 0))}</td>`)
    .join('');

  // Expected Returns HTML (with handwritten empty boxes per product/packing option + signature box)
  const expectedReturnRowsHtml = [
    ...expectedExtrasReturn.map(
      (ex) => `
      <tr>
        <td><span class="badge" style="background:#f0fdfa;color:#0f766e;border-color:#99f6e4;">زيادات</span></td>
        <td><strong>${escapeHtml(ex.productName)}</strong> <span class="col-opt">(${escapeHtml(ex.optionName)})</span></td>
        <td class="num">${fmtNum(ex.qty)}</td>
        <td class="num"><span class="write-box"></span></td>
      </tr>`
    ),
    ...expectedClientReturns.flatMap((cr) => {
      if (cr.items && cr.items.length > 0) {
        return cr.items.map(
          (it) => `
          <tr>
            <td>${renderOrderTypeBadge(cr.orderType)} <span class="ret-client">${escapeHtml(cr.clientName)}</span> <span class="order-serial">#${escapeHtml(cr.serial)}</span></td>
            <td><strong>${escapeHtml(it.productName)}</strong> <span class="col-opt">(${escapeHtml(it.optionName)})</span></td>
            <td class="num">${fmtNum(it.qty)}</td>
            <td class="num"><span class="write-box"></span></td>
          </tr>`
        );
      }
      return [
        `<tr>
          <td>${renderOrderTypeBadge(cr.orderType)} <span class="ret-client">${escapeHtml(cr.clientName)}</span> <span class="order-serial">#${escapeHtml(cr.serial)}</span></td>
          <td>—</td>
          <td class="num">${fmtNum(cr.rowTotal)}</td>
          <td class="num"><span class="write-box"></span></td>
        </tr>`,
      ];
    }),
  ].join('');

  const showReturnsPanel = expectedExtrasReturn.length > 0 || expectedClientReturns.length > 0;
  const showRouteChainPanel = Boolean(proposedRoute.isManualSequence);
  const showMidGrid = showReturnsPanel || showRouteChainPanel;
  const midGridClass = showReturnsPanel && showRouteChainPanel ? 'mid-grid two-col' : 'mid-grid one-col';

  // Route Sequence Chain HTML (only rendered when explicit manual sequence was set)
  const routeStepsHtml = (proposedRoute.orderedStops || [])
    .map((st) => {
      const distBadge = st.legKm !== null && st.legKm !== undefined ? `<span class="km-tag">${fmtNum(st.legKm)} كم</span>` : '';
      return `<span class="route-step"><span class="stop-num">${st.stopNumber}</span>${escapeHtml(st.clientName)}${distBadge}</span>`;
    })
    .join('<span class="route-arrow">←</span>');

  // Client Delivery Cards Grid HTML (1, 2, or 3 columns depending on count)
  const stopColsClass = clientStops.length >= 5 ? 'cols-3' : clientStops.length >= 2 ? 'cols-2' : 'cols-1';
  const clientCardsHtml = clientStops
    .map((st) => {
      const qrSrc = st.hasAccurateLocation ? (clientQrs[st.key] || '') : '';
      const orderBadges = (st.orders || [])
        .map((o) => `<span class="order-serial">#${escapeHtml(o.serial)}</span> ${renderOrderTypeBadge(o.orderType)}`)
        .join(' ');
      const orderComments = (st.orders || []).filter((o) => o.internalComments);
      const orderCommentHtml = orderComments.length === 1
        ? `<div><strong>ملاحظة:</strong> ${escapeHtml(orderComments[0].internalComments)}</div>`
        : orderComments.length > 1
        ? `<div><strong>ملاحظة:</strong> ${orderComments
            .map((o) => `<span class="order-serial">#${escapeHtml(o.serial)}:</span> ${escapeHtml(o.internalComments)}`)
            .join(' · ')}</div>`
        : '';
      const clientNoteHtml = st.clientNotes
        ? `<div><strong>ملاحظة:</strong> ${escapeHtml(st.clientNotes)}</div>`
        : '';

      return `
        <div class="client-card">
          <div class="client-card-body">
            <div class="cc-header">
              <span class="stop-num">${st.stopNumber}</span>
              <strong class="cc-name">${escapeHtml(st.clientName)}${st.branchName ? ` — ${escapeHtml(st.branchName)}` : ''}</strong>
              <span class="cc-orders">${orderBadges}</span>
            </div>
            ${(st.region || st.phonesDisplay || st.contactPerson || st.workingHours || st.holidaysDisplay) ? `
              <div class="cc-meta">
                ${st.region ? `<span><strong>منطقة:</strong> ${escapeHtml(st.region)}</span>` : ''}
                ${st.phonesDisplay ? `<span><strong>هاتف:</strong> <span dir="ltr">${escapeHtml(st.phonesDisplay)}</span></span>` : ''}
                ${st.contactPerson ? `<span><strong>مسؤول:</strong> ${escapeHtml(st.contactPerson)}</span>` : ''}
                ${st.workingHours ? `<span><strong>عمل:</strong> <span dir="ltr">${escapeHtml(st.workingHours)}</span></span>` : ''}
                ${st.holidaysDisplay ? `<span class="holiday-tag"><strong>إجازة:</strong> ${escapeHtml(st.holidaysDisplay)}</span>` : ''}
              </div>
            ` : ''}
            ${st.address ? `<div class="cc-address"><strong>عنوان:</strong> ${escapeHtml(st.address)}</div>` : ''}
            ${(orderCommentHtml || clientNoteHtml) ? `<div class="cc-comments">${orderCommentHtml}${clientNoteHtml}</div>` : ''}
          </div>
          ${qrSrc ? `
            <div class="cc-qr">
              <img src="${qrSrc}" alt="الموقع" />
              <span>الموقع</span>
            </div>
          ` : ''}
        </div>`;
    })
    .join('');

  // Conditional Crew & Comments
  const hasLoadingCrew = loadingWorkers.length > 0;
  const hasOffloadingCrew = offloadingWorkers.length > 0;
  const showCrewPanel = hasLoadingCrew || hasOffloadingCrew;
  const showNotesPanel = Boolean(dispatchNotes);
  const bottomColsCount = (showCrewPanel ? 1 : 0) + (showNotesPanel ? 1 : 0) + 1;

  const formatCrew = (crew) =>
    crew
      .map((w) => `<span class="crew-chip">${escapeHtml(w.nameAr || w.name || w.id)}</span>`)
      .join(' ');

  const weightLabel = vehicleMaxWeightTon > 0
    ? `${fmtNum(totalWeightTon)} / ${fmtNum(vehicleMaxWeightTon)} طن`
    : `${fmtNum(totalWeightTon)} طن`;

  const loadedDetail = totalExtras > 0
    ? `${fmtNum(totalLoaded)} (${fmtNum(totalLocked)}+${fmtNum(totalExtras)})`
    : `${fmtNum(totalLoaded)}`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>إذن صرف — رحلة #${escapeHtml(loadingOrderNumber)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 7mm;
    }
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
    #dispatch-sheet-root {
      width: 283mm;
      margin: 0 auto;
      padding: 2mm;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    /* Header */
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
    .trip-pill { background: #f1f5f9; color: #0f172a; border: 1.5px solid #0f172a; padding: 2px 9px; border-radius: 6px; font-size: 11.5px; font-weight: 900; }
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

    /* Section Headers */
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
    .clients-header-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .clients-header-row .sec-title {
      flex: 1;
      margin-bottom: 0;
    }
    .route-qr-inline {
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      border-radius: 6px;
      padding: 3px 7px;
      flex-shrink: 0;
    }
    .route-qr-inline img { width: 44px; height: 44px; display: block; }
    .route-qr-inline-meta { display: flex; flex-direction: column; align-items: center; line-height: 1.2; }
    .route-qr-inline-meta strong { font-size: 9px; font-weight: 900; color: #1d4ed8; }
    .route-qr-inline-meta span { font-size: 8px; font-weight: 800; color: #475569; }

    /* Ordered Quantities Matrix */
    table.matrix {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    table.matrix th, table.matrix td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
    }
    table.matrix thead th {
      background: #f1f5f9;
      text-align: center;
      font-weight: 800;
    }
    .col-prod { font-size: 10px; font-weight: 900; color: #0f172a; }
    .col-opt { font-size: 8.5px; font-weight: 700; color: #4338ca; }
    .client-col { text-align: right; white-space: nowrap; }
    .client-name { font-weight: 800; margin-left: 5px; }
    .order-serial { font-family: monospace; font-size: 9.5px; color: #475569; margin-left: 4px; }
    .num { text-align: center; font-family: monospace; font-weight: 700; }
    .num.has-qty { color: #0f172a; font-weight: 900; }
    .num.zero { color: #94a3b8; font-weight: 400; }
    .total-col { background: #f8fafc; font-weight: 900; }
    table.matrix tfoot tr.row-locked td { background: #f8fafc; font-weight: 800; }
    table.matrix tfoot tr.row-extras td { background: #f0fdfa; color: #0f766e; font-weight: 800; }
    table.matrix tfoot tr.row-extras td.extra-val { font-weight: 900; color: #0d9488; }
    table.matrix tfoot tr.row-loaded td { background: #e2e8f0; color: #0f172a; font-weight: 900; border-top: 2px solid #0f172a; }
    .empty-cell { text-align: center; color: #64748b; padding: 8px; }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid transparent;
      font-size: 8.5px;
      font-weight: 800;
      vertical-align: middle;
    }

    /* Conditional Middle Area */
    .mid-grid { display: grid; gap: 8px; }
    .mid-grid.two-col { grid-template-columns: 1.15fr 1fr; }
    .mid-grid.one-col { grid-template-columns: 1fr; }
    .panel {
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 6px 9px;
      background: #ffffff;
    }
    .panel-title {
      font-size: 10px;
      font-weight: 900;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 3px;
      margin-bottom: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ret-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    .ret-table th, .ret-table td {
      border: 1px solid #cbd5e1;
      padding: 3px 6px;
    }
    .ret-table thead th {
      background: #f1f5f9;
      font-weight: 800;
      text-align: right;
    }
    .ret-table thead th.num { text-align: center; }
    .ret-client { font-weight: 800; color: #0f172a; }
    .write-box {
      display: inline-block;
      width: 48px;
      height: 16px;
      border: 1.4px solid #334155;
      border-radius: 3px;
      background: #ffffff;
      vertical-align: middle;
    }
    .ret-sig-row {
      margin-top: 7px;
      padding-top: 5px;
      border-top: 1px dashed #94a3b8;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9px;
      font-weight: 800;
      color: #334155;
    }
    .ret-sig-line {
      display: inline-block;
      width: 130px;
      border-bottom: 1px solid #475569;
      height: 12px;
    }
    .route-flex { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .route-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 9.5px; }
    .route-step {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 2px 6px;
      font-weight: 700;
    }
    .route-origin { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
    .stop-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #0f172a;
      border: 1.5px solid #0f172a;
      font-size: 9px;
      font-weight: 900;
      flex-shrink: 0;
    }
    .km-tag { font-size: 8.5px; color: #0369a1; font-weight: 800; }
    .route-arrow { color: #64748b; font-weight: 900; }
    .route-qr { text-align: center; flex-shrink: 0; border-right: 1px dashed #cbd5e1; padding-right: 8px; }
    .route-qr img { width: 48px; height: 48px; display: block; margin: 0 auto; }
    .route-qr span { display: block; font-size: 8.5px; font-weight: 900; color: #1d4ed8; margin-top: 2px; }

    /* Client Delivery Cards */
    .clients-grid {
      display: grid;
      gap: 7px;
    }
    .clients-grid.cols-1 { grid-template-columns: 1fr; }
    .clients-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
    .clients-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .client-card {
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 6px 8px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      background: #ffffff;
    }
    .client-card-body { flex: 1; min-width: 0; }
    .cc-header { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 3px; }
    .cc-name { font-size: 10.5px; font-weight: 900; color: #0f172a; }
    .cc-meta { display: flex; flex-wrap: wrap; gap: 3px 10px; font-size: 9.2px; color: #334155; }
    .holiday-tag { color: #b45309; }
    .cc-address { font-size: 9.2px; color: #1e293b; margin-top: 3px; }
    .cc-comments {
      margin-top: 4px;
      padding: 3px 6px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 4px;
      font-size: 9px;
      color: #78350f;
    }
    .cc-qr { text-align: center; flex-shrink: 0; }
    .cc-qr img { width: 46px; height: 46px; display: block; }
    .cc-qr span { display: block; font-size: 8px; font-weight: 800; color: #334155; margin-top: 1px; }

    /* Bottom Strip: Conditional Crew, Conditional Notes & Signatures */
    .bottom-grid { display: grid; gap: 8px; }
    .bottom-grid.cols-3 { grid-template-columns: 1.2fr 1fr 0.9fr; }
    .bottom-grid.cols-2 { grid-template-columns: 1.35fr 1fr; }
    .bottom-grid.cols-1 { grid-template-columns: 1fr; }
    .crew-row { font-size: 9.5px; margin-bottom: 4px; }
    .crew-row:last-child { margin-bottom: 0; }
    .crew-chip {
      display: inline-block;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 1px 5px;
      margin: 1px 2px;
      font-size: 9px;
      font-weight: 700;
    }
    .comments-box {
      font-size: 9.5px;
      white-space: pre-wrap;
      color: #1e293b;
    }
    .muted { color: #64748b; }
    .sig-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      align-items: end;
    }
    .sig-box {
      text-align: center;
      border-top: 1px dashed #64748b;
      padding-top: 4px;
      font-size: 9.5px;
      font-weight: 800;
      color: #334155;
      margin-top: 24px;
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
    .doc-num-pill {
      background: #f8fafc;
      color: #0f172a;
      border: 1.5px solid #0f172a;
      padding: 2px 8px;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      font-weight: 900;
      letter-spacing: 0.4px;
    }
    .ver-pill {
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #a5b4fc;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 900;
    }
    .ver-pill.legacy {
      background: #ffe4e6;
      color: #be123c;
      border-color: #fda4af;
    }
    .legacy-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 5px 10px;
      border: 1.5px solid #be123c;
      border-radius: 7px;
      background: #fff1f2;
      color: #881337;
    }
    .legacy-line {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 10.5px;
      font-weight: 800;
    }
    .legacy-title { font-weight: 900; color: #9f1239; }
    .legacy-status-pill {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 5px;
      font-size: 9.5px;
      font-weight: 900;
    }
    .legacy-status-pill.released { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .legacy-status-pill.pending { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .legacy-link-btn {
      display: inline-block;
      margin-right: 6px;
      padding: 2px 8px;
      border-radius: 5px;
      background: #0f172a;
      color: #ffffff;
      text-decoration: none;
      font-size: 9.5px;
      font-weight: 900;
    }
    .legacy-qr { text-align: center; flex-shrink: 0; background: #fff; border: 1px solid #fda4af; border-radius: 5px; padding: 2px 4px; }
    .legacy-qr img { width: 40px; height: 40px; display: block; margin: 0 auto; }
    .legacy-qr span { display: block; font-size: 7.5px; font-weight: 900; color: #0f172a; }
    .legacy-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-24deg);
      font-size: 56px;
      font-weight: 900;
      color: rgba(190, 18, 60, 0.08);
      pointer-events: none;
      white-space: nowrap;
      z-index: 9999;
    }
    @media print {
      .no-print { display: none !important; }
      html.fit-single-page, body.fit-single-page { width: 283mm; height: 196mm; overflow: hidden; }
      html.allow-multipage, body.allow-multipage { width: 283mm; height: auto; overflow: visible; }
      body.allow-multipage thead { display: table-header-group; }
      body.allow-multipage .doc-header,
      body.allow-multipage .panel,
      body.allow-multipage .client-card,
      body.allow-multipage .legacy-banner,
      body.allow-multipage tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${isLegacy ? '<div class="legacy-watermark">مستند قديم — LEGACY</div>' : ''}
  <div class="print-bar no-print">
    <button onclick="window.print()">طباعة (${escapeHtml(docRefLabel)})</button>
    ${isLegacy && newVersionReleased && latestVersionUrl ? `<a class="legacy-link-btn" style="padding:6px 14px;font-size:12px;" href="${escapeHtml(latestVersionUrl)}">فتح البديل (${escapeHtml(latestRefLabel)})</a>` : ''}
  </div>
  <div id="dispatch-sheet-root">
    ${isLegacy ? `
      <div class="legacy-banner">
        <div class="legacy-line">
          <span class="legacy-title">⚠️ مستند قديم (${escapeHtml(docRefLabel)}) — ${escapeHtml(legacyReason)}</span>
          ${newVersionReleased
            ? `<span class="legacy-status-pill released">✓ البديل: ${escapeHtml(latestRefLabel)}</span>${latestVersionUrl ? `<a class="legacy-link-btn no-print" href="${escapeHtml(latestVersionUrl)}">فتح البديل</a>` : ''}`
            : `<span class="legacy-status-pill pending">غير ساري</span>`
          }
        </div>
        ${newVersionReleased && latestVersionQr ? `
          <div class="legacy-qr">
            <img src="${latestVersionQr}" alt="الأحدث" />
            <span>الأحدث</span>
          </div>
        ` : ''}
      </div>
    ` : ''}
    <!-- 1. Header -->
    <div class="doc-header">
      <div class="header-main">
        <div class="company-name">${escapeHtml(companyNameAr)}</div>
        <div class="doc-title-row">
          <span class="doc-title">إذن صرف</span>
          ${docNumber ? `<span class="doc-num-pill" dir="ltr">${escapeHtml(docNumber)}</span>` : ''}
          <span class="trip-pill">رحلة #${escapeHtml(loadingOrderNumber)}</span>
          <span class="ver-pill ${isLegacy ? 'legacy' : ''}">${isLegacy ? `قديم v${docVer}` : `v${docVer}`}</span>
          <span class="muted" style="font-size:9px;">${escapeHtml(printedAtDisplay)}</span>
        </div>
        <div class="meta-grid">
          <span><strong>تاريخ:</strong> ${escapeHtml(loadingDate)}</span>
          <span><strong>شاحنة:</strong> ${escapeHtml(vehicleDisplayName)}${plateNumber ? ` (${escapeHtml(plateNumber)})` : ''}</span>
          <span><strong>سائق:</strong> ${escapeHtml(driverName)}</span>
          ${deliveryRepName ? `<span><strong>مندوب:</strong> ${escapeHtml(deliveryRepName)}</span>` : ''}
          <span><strong>وزن:</strong> ${escapeHtml(weightLabel)}</span>
          <span><strong>محمل:</strong> ${loadedDetail}</span>
        </div>
      </div>
      ${systemTripQr ? `
        <div class="sys-qr-box">
          <img src="${systemTripQr}" alt="للنظام" />
          <span class="sys-qr-label">للنظام</span>
        </div>
      ` : ''}
    </div>

    <!-- 2. Ordered Quantities Matrix -->
    <div>
      <div class="sec-title">
        <span>الكميات</span>
        <span>${clientRows.length} طلب</span>
      </div>
      <table class="matrix">
        <thead>
          <tr>
            <th style="text-align:right;min-width:165px;">العميل</th>
            ${matrixHeaderCols}
            <th style="min-width:52px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${matrixBodyRows}
        </tbody>
        <tfoot>
          <tr class="row-locked">
            <td class="client-col">المطلوب</td>
            ${lockedFooterCells}
            <td class="num">${fmtNum(totalLocked)}</td>
          </tr>
          <tr class="row-extras">
            <td class="client-col">زيادات</td>
            ${extrasFooterCells}
            <td class="num">${totalExtras > 0 ? `+${fmtNum(totalExtras)}` : '0'}</td>
          </tr>
          <tr class="row-loaded">
            <td class="client-col">الإجمالي</td>
            ${loadedFooterCells}
            <td class="num">${fmtNum(totalLoaded)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 3. Conditional Middle Area (Expected Returns &/or Manual Sequence Route) -->
    ${showMidGrid ? `
      <div class="${midGridClass}">
        ${showReturnsPanel ? `
          <div class="panel">
            <div class="panel-title">
              <span>المرتجع</span>
            </div>
            <table class="ret-table">
              <thead>
                <tr>
                  <th>المصدر</th>
                  <th>الصنف</th>
                  <th class="num" style="width:44px;">متوقع</th>
                  <th class="num" style="width:58px;">فعلي</th>
                </tr>
              </thead>
              <tbody>
                ${expectedReturnRowsHtml}
              </tbody>
            </table>
            <div class="ret-sig-row">
              <span>توقيع المرتجع:</span>
              <span class="ret-sig-line"></span>
            </div>
          </div>
        ` : ''}

        ${showRouteChainPanel ? `
          <div class="panel">
            <div class="panel-title">
              <span>المسار</span>
              ${proposedRoute.totalKm !== null && proposedRoute.totalKm !== undefined ? `<span>~${fmtNum(proposedRoute.totalKm)} كم</span>` : ''}
            </div>
            <div class="route-flex">
              <div class="route-chain">
                <span class="route-step route-origin">المصنع</span>
                ${routeStepsHtml ? `<span class="route-arrow">←</span>${routeStepsHtml}` : ''}
              </div>
              ${routeQr ? `
                <div class="route-qr">
                  <img src="${routeQr}" alt="المسار" />
                  <span>المسار</span>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- 4. Client Delivery Directory Cards -->
    <div>
      <div class="clients-header-row">
        <div class="sec-title">
          <span>العملاء</span>
          <span>${clientStops.length} عميل</span>
        </div>
        ${(routeQr && !showRouteChainPanel) ? `
          <div class="route-qr-inline">
            <img src="${routeQr}" alt="المسار" />
            <div class="route-qr-inline-meta">
              <strong>المسار</strong>
              ${proposedRoute.totalKm !== null && proposedRoute.totalKm !== undefined ? `<span>~${fmtNum(proposedRoute.totalKm)} كم</span>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="clients-grid ${stopColsClass}">
        ${clientCardsHtml}
      </div>
    </div>

    <!-- 5. Bottom Strip: Conditional Labour, Conditional Comments & Signatures -->
    <div class="bottom-grid cols-${bottomColsCount}">
      ${showCrewPanel ? `
        <div class="panel">
          <div class="panel-title"><span>العمالة</span></div>
          ${hasLoadingCrew ? `<div class="crew-row"><strong>تحميل:</strong> ${formatCrew(loadingWorkers)}</div>` : ''}
          ${hasOffloadingCrew ? `<div class="crew-row"><strong>تفريغ:</strong> ${formatCrew(offloadingWorkers)}</div>` : ''}
        </div>
      ` : ''}

      ${showNotesPanel ? `
        <div class="panel">
          <div class="panel-title"><span>ملاحظات</span></div>
          <div class="comments-box">${escapeHtml(dispatchNotes)}</div>
        </div>
      ` : ''}

      <div class="panel">
        <div class="panel-title"><span>التوقيعات</span></div>
        <div class="sig-grid">
          <div class="sig-box">المخزن</div>
          <div class="sig-box">السائق</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function () {
      try {
        var root = document.getElementById('dispatch-sheet-root');
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
