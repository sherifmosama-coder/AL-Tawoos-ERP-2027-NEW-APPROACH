/**
 * Al-Tawoos ERP - Thermal Rolled Label Generator Utility
 * 
 * Provides vector barcode generation (Code 128-B) and print layout helpers
 * specifically calibrated for thermal roll printers (e.g. 38mm x 50mm, 50mm x 38mm).
 */

const STORAGE_KEY = 'ALTAWOOS_THERMAL_LABEL_CONFIG_V1';

export const DEFAULT_THERMAL_CONFIG = {
  widthMm: 50,
  heightMm: 38,
  orientation: 'landscape', // 'landscape' | 'portrait'
  gapMm: 2, // Physical die-cut gap between continuous rolled labels (e.g. 2mm or 3mm)
  showBarcode: false, // Barcodes removed from thermal stickers per requirement
  showBatchCode: true,
  fontSize: 'medium', // 'compact' | 'medium' | 'large'
};

export const getStoredThermalConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_THERMAL_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Failed to load thermal label config:', e);
  }
  return { ...DEFAULT_THERMAL_CONFIG };
};

export const saveStoredThermalConfig = (config) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save thermal label config:', e);
  }
};

/**
 * Lightweight Code 128-B Pattern Generator
 * Generates an array of bar widths [B, S, B, S, B, S] for any ASCII string.
 */
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

/**
 * Encodes text into an SVG Barcode element string
 * @param {string} text - Alphanumeric string e.g. "RTN-20260921-01"
 * @param {number} height - Barcode height in px
 * @returns {string} SVG markup
 */
export const generateBarcodeSVG = (text, height = 30) => {
  if (!text) return '';
  const clean = text.replace(/[^ -~]/g, ''); // ASCII printable
  if (!clean) return '';

  let checksum = 104; // Start code B
  const codes = [104];

  for (let i = 0; i < clean.length; i++) {
    const val = clean.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop code

  let patternStr = '';
  codes.forEach((c) => {
    patternStr += CODE128_PATTERNS[c] || '111111';
  });

  // Calculate SVG widths
  let totalModules = 0;
  for (let i = 0; i < patternStr.length; i++) {
    totalModules += parseInt(patternStr[i], 10);
  }

  let x = 0;
  const rects = [];
  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i], 10);
    if (i % 2 === 0) {
      // Bar
      rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000" />`);
    }
    x += width;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${height}" preserveAspectRatio="none" class="w-full h-full">
      ${rects.join('')}
    </svg>
  `;
};
