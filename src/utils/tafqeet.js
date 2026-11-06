/**
 * Arabic Financial Tafqeet (Number-to-Words) Converter for FMCG ERP Vouchers
 * Converts numbers into formal Arabic financial words (Egyptian Pounds & Piastres by default)
 */

const ONES_MASCULINE = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
  'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'
];

const TENS = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'
];

const HUNDREDS = [
  '', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'
];

/**
 * Converts a 3-digit number chunk into Arabic words
 */
function convertThreeDigits(num) {
  if (num === 0) return '';
  let words = [];

  const h = Math.floor(num / 100);
  const remainder = num % 100;

  if (h > 0) {
    words.push(HUNDREDS[h]);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      words.push(ONES_MASCULINE[remainder]);
    } else {
      const one = remainder % 10;
      const ten = Math.floor(remainder / 10);
      if (one > 0) {
        words.push(`${ONES_MASCULINE[one]} و${TENS[ten]}`);
      } else {
        words.push(TENS[ten]);
      }
    }
  }

  return words.join(' و');
}

/**
 * Converts an integer number into Arabic words
 */
function convertIntegerToArabicWords(integerPart) {
  if (integerPart === 0) return 'صفر';

  const chunks = [];
  let temp = integerPart;

  while (temp > 0) {
    chunks.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const scales = [
    { singular: '', dual: '', plural: '', rule: 'base' },
    { singular: 'ألف', dual: 'ألفان', plural: 'آلاف', rule: 'thousands' },
    { singular: 'مليون', dual: 'مليونان', plural: 'ملايين', rule: 'millions' },
    { singular: 'مليار', dual: 'ملياران', plural: 'مليارات', rule: 'billions' }
  ];

  let parts = [];

  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk === 0) continue;

    const scale = scales[i];
    if (i === 0) {
      parts.push(convertThreeDigits(chunk));
    } else if (chunk === 1) {
      parts.push(scale.singular);
    } else if (chunk === 2) {
      parts.push(scale.dual);
    } else if (chunk >= 3 && chunk <= 10) {
      parts.push(`${convertThreeDigits(chunk)} ${scale.plural}`);
    } else {
      parts.push(`${convertThreeDigits(chunk)} ${scale.singular}`);
    }
  }

  return parts.join(' و');
}

/**
 * Main export: Converts any currency amount into formal Arabic financial wording
 * @param {number|string} amount - Monetary figure
 * @param {string} currency - 'EGP' | 'USD' | 'EUR' | 'SAR'
 * @returns {string} - Full Arabic Tafqeet string
 */
export function tafqeetArabic(amount, currency = 'EGP') {
  const num = Number(amount);
  if (isNaN(num) || num < 0) return '';

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  const currencyConfig = {
    EGP: {
      singular: 'جنيه مصري',
      plural: 'جنيهات مصرية',
      dual: 'جنيهان مصريان',
      subSingular: 'قرش',
      subPlural: 'قروش'
    },
    USD: {
      singular: 'دولار أمريكي',
      plural: 'دولارات أمريكية',
      dual: 'دولاران أمريكيان',
      subSingular: 'سنت',
      subPlural: 'سنتات'
    },
    EUR: {
      singular: 'يورو',
      plural: 'يورو',
      dual: 'اثنان يورو',
      subSingular: 'سنت',
      subPlural: 'سنتات'
    },
    SAR: {
      singular: 'ريال سعودي',
      plural: 'ريالات سعودية',
      dual: 'ريالان سعوديان',
      subSingular: 'هللة',
      subPlural: 'هللات'
    }
  };

  const curr = currencyConfig[currency] || currencyConfig.EGP;

  let result = 'فقط وقدره ';

  // Currency unit form
  if (integerPart > 0) {
    const intWords = convertIntegerToArabicWords(integerPart);
    if (integerPart === 1) {
      result += curr.singular;
    } else if (integerPart === 2) {
      result += curr.dual;
    } else if (integerPart >= 3 && integerPart <= 10) {
      result += `${intWords} ${curr.plural}`;
    } else {
      result += `${intWords} ${curr.singular}`;
    }
  }

  // Fractional part (piastres / cents)
  if (decimalPart > 0) {
    const decWords = convertIntegerToArabicWords(decimalPart);
    const subLabel = (decimalPart >= 3 && decimalPart <= 10) ? curr.subPlural : curr.subSingular;
    if (integerPart > 0) {
      result += ` و${decWords} ${subLabel}`;
    } else {
      result += `${decWords} ${subLabel}`;
    }
  }

  if (integerPart === 0 && decimalPart === 0) {
    result += `صفر ${curr.singular}`;
  }

  result += ' لا غير';
  return result;
}
