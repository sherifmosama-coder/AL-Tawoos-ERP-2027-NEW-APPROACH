/**
 * Al-Tawoos ERP - Inkjet Batch Code Translator Utility
 * 
 * Translates continuous inkjet printer timestamp codes (DDMMHHMM)
 * into the minimum possible number of pallet lot numbers, and derives
 * batch ranges from pallet packaging time windows.
 */

/**
 * Converts HH:MM string to total minutes from midnight
 * @param {string} timeStr - e.g. "10:45"
 * @returns {number}
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
};

/**
 * Converts total minutes from midnight to HH:MM
 * @param {number} totalMins
 * @returns {string} e.g. "10:45"
 */
export const minutesToTime = (totalMins) => {
  const h = Math.floor(totalMins / 60) % 24;
  const m = Math.floor(totalMins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Validates and parses an 8-digit inkjet batch code: DDMMHHMM
 * @param {string} batchCode - e.g. "21091045"
 * @returns {object|null} { day: 21, month: 9, hour: 10, minute: 45, timeStr: "10:45", dayStr: "21", monthStr: "09" }
 */
export const parseInkjetBatch = (batchCode) => {
  if (!batchCode) return null;
  const cleaned = String(batchCode).trim().replace(/\D/g, '');
  if (cleaned.length !== 8) return null;

  const day = parseInt(cleaned.slice(0, 2), 10);
  const month = parseInt(cleaned.slice(2, 4), 10);
  const hour = parseInt(cleaned.slice(4, 6), 10);
  const minute = parseInt(cleaned.slice(6, 8), 10);

  if (day < 1 || day > 31) return null;
  if (month < 1 || month > 12) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  const dayStr = String(day).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const totalMins = hour * 60 + minute;

  return {
    raw: cleaned,
    day,
    month,
    hour,
    minute,
    dayStr,
    monthStr,
    timeStr,
    totalMins,
  };
};

/**
 * Generates an 8-digit batch code from a date string (YYYY-MM-DD) and a time string (HH:MM)
 * @param {string} dateStr - e.g. "2026-09-21"
 * @param {string} timeStr - e.g. "10:45"
 * @returns {string} e.g. "21091045"
 */
export const buildBatchCode = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return '';
  const dateParts = dateStr.split('-');
  if (dateParts.length < 3) return '';
  const day = String(parseInt(dateParts[2], 10) || 1).padStart(2, '0');
  const month = String(parseInt(dateParts[1], 10) || 1).padStart(2, '0');

  const timeParts = timeStr.split(':');
  const hour = String(parseInt(timeParts[0], 10) || 0).padStart(2, '0');
  const minute = String(parseInt(timeParts[1], 10) || 0).padStart(2, '0');

  return `${day}${month}${hour}${minute}`;
};

/**
 * Calculates the continuous batch code range for a pallet's packaging window
 * @param {string} dateStr - Work order / pallet date (YYYY-MM-DD)
 * @param {string} startTime - e.g. "10:00"
 * @param {string} endTime - e.g. "10:45"
 * @returns {object} { startBatch, endBatch, displayRange }
 */
export const calculatePalletBatchRange = (dateStr, startTime, endTime) => {
  if (!dateStr || !startTime || !endTime) {
    return { startBatch: '', endBatch: '', displayRange: '—' };
  }
  const startBatch = buildBatchCode(dateStr, startTime);
  const endBatch = buildBatchCode(dateStr, endTime);
  return {
    startBatch,
    endBatch,
    displayRange: startBatch && endBatch ? `${startBatch} ◄──► ${endBatch}` : '—',
  };
};

/**
 * Translates an 8-digit inkjet batch code (DDMMHHMM) into the minimum possible number
 * of matching pallets by analyzing overlapping work order dates and pallet time windows.
 * 
 * Because the physical line uses 1 single printer feeding 2 parallel inspection lines,
 * this function will return at most 2 active pallets (and often exactly 1).
 * 
 * @param {string} batchCode - e.g. "21091045"
 * @param {Array} workOrders - List of all work orders from Firestore
 * @param {string|null} targetProductId - Optional filter for specific finished product SKU
 * @returns {object} { success: boolean, parsedBatch, matchedPallets: [], messageAr: string, messageEn: string }
 */
export const translateBatchToPallets = (batchCode, workOrders = [], targetProductId = null) => {
  const parsed = parseInkjetBatch(batchCode);
  if (!parsed) {
    return {
      success: false,
      parsedBatch: null,
      matchedPallets: [],
      messageAr: 'كود التشغيلة غير صالح. الصيغة المطلوبة هي 8 أرقام (DDMMHHMM) مثل: 21091045',
      messageEn: 'Invalid batch code. Expected 8 digits (DDMMHHMM) e.g. 21091045',
    };
  }

  const { dayStr, monthStr, totalMins, timeStr } = parsed;

  // Filter work orders that ran on matching Day and Month
  const candidateOrders = (workOrders || []).filter((order) => {
    // Check product match if specified
    if (targetProductId && order.finishedGoodId !== targetProductId && order.targetSku !== targetProductId) {
      return false;
    }

    // Check date match: orderDate, productionDate, or planDate
    const datesToCheck = [order.orderDate, order.productionDate, order.planDate].filter(Boolean);
    const hasDateMatch = datesToCheck.some((d) => {
      const parts = String(d).split('-');
      if (parts.length < 3) return false;
      const oMonth = parts[1].padStart(2, '0');
      const oDay = parts[2].padStart(2, '0');
      return oDay === dayStr && oMonth === monthStr;
    });

    return hasDateMatch;
  });

  if (candidateOrders.length === 0) {
    return {
      success: false,
      parsedBatch: parsed,
      matchedPallets: [],
      messageAr: `لم يتم العثور على أوامر تشغيل مسجلة بتاريخ (${dayStr}/${monthStr}) مطابقة للصنف المحدد.`,
      messageEn: `No work orders found for date (${dayStr}/${monthStr}) matching target product.`,
    };
  }

  // Inspect each pallet within candidate orders to find overlapping time windows
  const matchedPallets = [];

  candidateOrders.forEach((order) => {
    const orderDate = order.productionDate || order.orderDate || order.planDate || '';
    const pallets = Array.isArray(order.pallets) ? order.pallets : [];

    pallets.forEach((pallet, idx) => {
      const pStartMins = timeToMinutes(pallet.startTime);
      const pEndMins = timeToMinutes(pallet.endTime);

      // Verify time window overlap: startTime <= batchMins <= endTime
      // If end time is earlier than start time (overnight shift), handle wrap-around
      let isWithinWindow = false;
      if (pEndMins >= pStartMins) {
        isWithinWindow = totalMins >= pStartMins && totalMins <= pEndMins;
      } else {
        // Shift wraps past midnight
        isWithinWindow = totalMins >= pStartMins || totalMins <= pEndMins;
      }

      if (isWithinWindow) {
        const batchRange = calculatePalletBatchRange(orderDate, pallet.startTime, pallet.endTime);
        
        // Resolve QC inspector / staff on this pallet
        const staff = Array.isArray(pallet.stepStaffing) ? pallet.stepStaffing : [];
        const qcStep = staff.find((s) => s.stepName?.includes('جودة') || s.stepName?.includes('QC') || s.name?.includes('جودة'));
        const qcWorkers = qcStep?.workers?.map((w) => w.workerName || w.name).join(', ') || '';

        matchedPallets.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate,
          finishedGoodId: order.finishedGoodId || order.targetSku,
          finishedGoodNameAr: order.finishedGoodNameAr || order.productNameAr || '',
          finishedGoodNameEn: order.finishedGoodNameEn || order.productNameEn || '',
          palletIndex: idx,
          palletNumber: pallet.palletNumber || idx + 1,
          palletId: pallet.palletId || `PAL-${order.orderNumber}-P${String(pallet.palletNumber || idx + 1).padStart(2, '0')}`,
          qtyLarge: pallet.qtyLarge || 0,
          qtySmall: pallet.qtySmall || 0,
          startTime: pallet.startTime,
          endTime: pallet.endTime,
          batchRangeDisplay: batchRange.displayRange,
          qcWorkers,
          status: pallet.status,
          qcStatus: pallet.qcStatus,
        });
      }
    });
  });

  return {
    success: matchedPallets.length > 0,
    parsedBatch: parsed,
    matchedPallets,
    messageAr: matchedPallets.length > 0
      ? `تمت ترجمة الكود بنجاح: تم حصر التشغيلة في (${matchedPallets.length}) بالتة فقط.`
      : `تم فحص أوامر تشغيل يوم (${dayStr}/${monthStr})، ولكن لا توجد باليتات تم تغليفها في التوقيت (${timeStr}).`,
    messageEn: matchedPallets.length > 0
      ? `Batch code translated successfully: resolved to (${matchedPallets.length}) pallet(s).`
      : `Orders found for (${dayStr}/${monthStr}), but no pallets were active at (${timeStr}).`,
  };
};
