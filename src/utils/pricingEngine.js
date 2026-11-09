/**
 * Pricing Engine & 8-Tier Hierarchy Resolver for TAWOOS ERP
 * Implements legacy price resolution sequence, date validity checking,
 * and promotional discount detection.
 */

export const DEFAULT_PRICING_STRATEGIES = [
  {
    id: 'wholesalers',
    nameAr: 'أسعار جملة',
    nameEn: 'Wholesale Standard',
    color: '#2563eb', // Blue
    icon: 'Boxes',
    isSpecialPricing: false,
    isSystem: true,
    description: 'أسعار التوريد القياسية للتجار والموزعين ومحلات الجملة'
  },
  {
    id: 'retail',
    nameAr: 'أسعار تجزئة',
    nameEn: 'Retail Standard',
    color: '#059669', // Emerald
    icon: 'Store',
    isSpecialPricing: false,
    isSystem: true,
    description: 'أسعار البيع لمحلات التجزئة والسوبرماركت والمستهلك'
  },
  {
    id: 'horeca',
    nameAr: 'فنادق ومطاعم وكافيهات (HORECA)',
    nameEn: 'HORECA Sector',
    color: '#d97706', // Amber
    icon: 'ChefHat',
    isSpecialPricing: false,
    isSystem: false,
    description: 'أسعار التوريد لقطاع الضيافة والمطاعم والكافيهات والمطابخ'
  },
  {
    id: 'special_pricing',
    nameAr: 'أسعار خاصة وتعاقدات',
    nameEn: 'Special Client Pricing',
    color: '#7c3aed', // Purple
    icon: 'Award',
    isSpecialPricing: true,
    isSystem: true,
    description: 'أسعار وتفاوض مخصص لعميل بعينه أو فرع محدد (تسمح بالمنتجات الخاصة Private Label)'
  }
];

/**
 * Checks if a finished product is a Private Label item
 */
export const isProductPrivateLabel = (product) => {
  if (!product) return false;
  return product.brandOwnership === 'private_label' || Boolean(product.isPrivateLabel);
};

/**
 * Checks whether a Private Label product is allowed for a given client.
 * - Own-brand products are allowed for all clients.
 * - Private Label products with assigned `privateLabelClientIds` (up to 2 main clients)
 *   are restricted to those specific clients (with fallback to `clientName` matching for legacy records).
 * - If no client restriction is set on the product yet, it remains accessible.
 */
export const isProductAllowedForClient = (product, clientId = '', clientName = '') => {
  if (!product) return false;
  if (!isProductPrivateLabel(product)) return true;
  if (!clientId && !clientName) return true;

  const assignedIds = Array.isArray(product.privateLabelClientIds)
    ? product.privateLabelClientIds.filter(Boolean)
    : [];

  if (assignedIds.length > 0) {
    return assignedIds.some((id) => String(id).trim() === String(clientId).trim());
  }

  // Fallback for legacy single string clientName
  if (product.clientName && clientName) {
    const normProdClient = String(product.clientName).trim().toLowerCase();
    const normTarget = String(clientName).trim().toLowerCase();
    if (normProdClient && normTarget) {
      return normProdClient.includes(normTarget) || normTarget.includes(normProdClient);
    }
  }

  return true;
};

/**
 * Format a Date object or ISO string to 'YYYY-MM-DD'
 */
export const formatDateKey = (dateInput) => {
  if (!dateInput) return '';
  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof dateInput === 'string') {
    return dateInput.slice(0, 10);
  }
  if (dateInput.toDate && typeof dateInput.toDate === 'function') {
    return formatDateKey(dateInput.toDate());
  }
  return '';
};

/**
 * Determines whether a price list period is active for a given date.
 * If endDate is null/empty, the period is considered open-ended (valid indefinitely).
 */
export const isPeriodActiveForDate = (period, targetDate = new Date()) => {
  if (!period) return false;
  if (period.status === 'draft') return false; // Drafts must NEVER resolve into operational pricing
  if (period.status === 'expired') return false;

  const targetStr = formatDateKey(targetDate);
  const startStr = formatDateKey(period.startDate);
  const endStr = period.endDate ? formatDateKey(period.endDate) : null;

  if (startStr && targetStr < startStr) return false;
  if (endStr && targetStr > endStr) return false;
  return true;
};

/**
 * Computes status of a price list period: 'draft', 'active', 'upcoming', or 'expired'
 */
export const computePeriodStatus = (period, targetDate = new Date()) => {
  if (!period) return 'expired';
  if (period.status === 'draft') return 'draft';
  if (period.status === 'expired') return 'expired';

  const targetStr = formatDateKey(targetDate);
  const startStr = formatDateKey(period.startDate);
  const endStr = period.endDate ? formatDateKey(period.endDate) : null;

  if (startStr && targetStr < startStr) return 'upcoming';
  if (endStr && targetStr > endStr) return 'expired';
  return 'active';
};

/**
 * 8-Tier Pricing Priority Hierarchy Resolver
 * Matches the legacy TAWOOS ERP engine (CODE 2.GS:951-1066).
 *
 * Sequence:
 * 1. Special Pricing + Client Match + Specific Branch + Promotional (عرض)
 * 2. Special Pricing + Client Match + Specific Branch + Official (رسمي)
 * 3. Special Pricing + Client Match + All Branches + Promotional (عرض)
 * 4. Special Pricing + Client Match + All Branches + Official (رسمي)
 * --- Default Strategy Fallback (Wholesale, Retail, HORECA, etc.) ---
 * 5. Default Strategy + Specific Branch + Promotional (عرض)
 * 6. Default Strategy + Specific Branch + Official (رسمي)
 * 7. Default Strategy + All Branches + Promotional (عرض)
 * 8. Default Strategy + All Branches + Official (رسمي)
 *
 * @param {Object} params
 * @param {string} params.clientId
 * @param {string} params.clientName
 * @param {string} params.branchId
 * @param {string} params.branchName
 * @param {string} params.strategy - Client default strategy (e.g. 'wholesalers', 'retail')
 * @param {string|Date} params.invoiceDate
 * @param {string} params.productId
 * @param {Array} params.priceLists - Array of all active price list periods from Firestore
 * @returns {Object} { price: number|null, tier: number, tierLabel: string, isPromotional: boolean, period: Object|null }
 */
export const detectProductPrice = ({
  clientId = '',
  clientName = '',
  branchId = '',
  branchName = '',
  strategy = 'wholesalers',
  invoiceDate = new Date(),
  productId = '',
  priceLists = []
}) => {
  if (!productId || !priceLists || priceLists.length === 0) {
    return { price: null, tier: 0, tierLabel: 'None', isPromotional: false, period: null };
  }

  const invoiceDateStr = formatDateKey(invoiceDate);
  const normClientName = (clientName || '').trim().toLowerCase();
  const normBranchName = (branchName || '').trim().toLowerCase();

  // Filter periods that are valid on the invoice date and contain the product
  const validPeriods = priceLists.filter((pl) => {
    if (!isPeriodActiveForDate(pl, invoiceDateStr)) return false;
    const priceVal = pl.items && pl.items[productId];
    return typeof priceVal === 'number' && priceVal > 0;
  });

  if (validPeriods.length === 0) {
    return { price: null, tier: 0, tierLabel: 'No Active Period for Product', isPromotional: false, period: null };
  }

  // Helper matchers
  const matchesClient = (pl) => {
    if (!pl.isSpecialPricing && pl.strategyId !== 'special_pricing') return false;
    if (clientId && pl.clientId && String(pl.clientId).trim() === String(clientId).trim()) return true;
    if (normClientName && pl.clientName && pl.clientName.trim().toLowerCase() === normClientName) return true;
    return false;
  };

  const matchesBranch = (pl) => {
    if (pl.allBranches) return false;
    if (branchId && pl.branchId && String(pl.branchId).trim() === String(branchId).trim()) return true;
    if (normBranchName && pl.branchName && pl.branchName.trim().toLowerCase() === normBranchName) return true;
    return false;
  };

  const matchesStrategy = (pl) => {
    if (pl.isSpecialPricing || pl.strategyId === 'special_pricing') return false;
    return pl.strategyId === strategy;
  };

  // -------------------------------------------------------------
  // Priority 1: Special Pricing + Client + Specific Branch + Promotional
  // -------------------------------------------------------------
  const p1 = validPeriods.find((pl) => matchesClient(pl) && matchesBranch(pl) && pl.type === 'promotional');
  if (p1) {
    return {
      price: p1.items[productId],
      tier: 1,
      tierLabel: 'Tier 1: Special Pricing (Specific Branch - Promotional)',
      isPromotional: true,
      period: p1
    };
  }

  // -------------------------------------------------------------
  // Priority 2: Special Pricing + Client + Specific Branch + Official
  // -------------------------------------------------------------
  const p2 = validPeriods.find((pl) => matchesClient(pl) && matchesBranch(pl) && pl.type === 'official');
  if (p2) {
    return {
      price: p2.items[productId],
      tier: 2,
      tierLabel: 'Tier 2: Special Pricing (Specific Branch - Official)',
      isPromotional: false,
      period: p2
    };
  }

  // -------------------------------------------------------------
  // Priority 3: Special Pricing + Client + All Branches + Promotional
  // -------------------------------------------------------------
  const p3 = validPeriods.find((pl) => matchesClient(pl) && pl.allBranches && pl.type === 'promotional');
  if (p3) {
    return {
      price: p3.items[productId],
      tier: 3,
      tierLabel: 'Tier 3: Special Pricing (All Branches - Promotional)',
      isPromotional: true,
      period: p3
    };
  }

  // -------------------------------------------------------------
  // Priority 4: Special Pricing + Client + All Branches + Official
  // -------------------------------------------------------------
  const p4 = validPeriods.find((pl) => matchesClient(pl) && pl.allBranches && pl.type === 'official');
  if (p4) {
    return {
      price: p4.items[productId],
      tier: 4,
      tierLabel: 'Tier 4: Special Pricing (All Branches - Official)',
      isPromotional: false,
      period: p4
    };
  }

  // -------------------------------------------------------------
  // Priority 5: Client Default Strategy + Specific Branch + Promotional
  // -------------------------------------------------------------
  const p5 = validPeriods.find((pl) => matchesStrategy(pl) && matchesBranch(pl) && pl.type === 'promotional');
  if (p5) {
    return {
      price: p5.items[productId],
      tier: 5,
      tierLabel: 'Tier 5: Strategy Price (Specific Branch - Promotional)',
      isPromotional: true,
      period: p5
    };
  }

  // -------------------------------------------------------------
  // Priority 6: Client Default Strategy + Specific Branch + Official
  // -------------------------------------------------------------
  const p6 = validPeriods.find((pl) => matchesStrategy(pl) && matchesBranch(pl) && pl.type === 'official');
  if (p6) {
    return {
      price: p6.items[productId],
      tier: 6,
      tierLabel: 'Tier 6: Strategy Price (Specific Branch - Official)',
      isPromotional: false,
      period: p6
    };
  }

  // -------------------------------------------------------------
  // Priority 7: Client Default Strategy + All Branches + Promotional
  // -------------------------------------------------------------
  const p7 = validPeriods.find((pl) => matchesStrategy(pl) && (pl.allBranches || !pl.branchId) && pl.type === 'promotional');
  if (p7) {
    return {
      price: p7.items[productId],
      tier: 7,
      tierLabel: 'Tier 7: Strategy Price (All Branches - Promotional)',
      isPromotional: true,
      period: p7
    };
  }

  // -------------------------------------------------------------
  // Priority 8: Client Default Strategy + All Branches + Official
  // -------------------------------------------------------------
  const p8 = validPeriods.find((pl) => matchesStrategy(pl) && (pl.allBranches || !pl.branchId) && pl.type === 'official');
  if (p8) {
    return {
      price: p8.items[productId],
      tier: 8,
      tierLabel: 'Tier 8: Strategy Price (All Branches - Official)',
      isPromotional: false,
      period: p8
    };
  }

  return { price: null, tier: 0, tierLabel: 'No Matching Price Tier', isPromotional: false, period: null };
};

/**
 * Detects whether a product has an active promotional discount compared to its official price.
 * Calculates discount % as: ((officialPrice - promotionalPrice) / officialPrice) * 100
 */
export const detectPromotionalDiscount = (params) => {
  const result = {
    hasPromotion: false,
    officialPrice: 0,
    promotionalPrice: 0,
    discountPct: 0,
    matchedTier: 0
  };

  const detected = detectProductPrice(params);
  if (!detected.price) return result;

  // If detected price is promotional, find corresponding official baseline
  if (detected.isPromotional) {
    // Find official price at or below this tier
    const officialCandidate = detectProductPrice({
      ...params,
      priceLists: (params.priceLists || []).filter((pl) => pl.type === 'official')
    });

    if (officialCandidate.price && detected.price < officialCandidate.price) {
      result.hasPromotion = true;
      result.officialPrice = officialCandidate.price;
      result.promotionalPrice = detected.price;
      result.discountPct = ((officialCandidate.price - detected.price) / officialCandidate.price) * 100;
      result.matchedTier = detected.tier;
    }
  }

  return result;
};
