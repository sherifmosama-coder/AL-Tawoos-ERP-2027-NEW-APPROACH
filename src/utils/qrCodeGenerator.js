/**
 * Al-Tawoos ERP - QR Code Generator Utility
 * Wraps qrcode library for pallet passport deep-links and label stickers.
 */
import QRCode from 'qrcode';

export const generateQRCodeDataURL = async (text, options = {}) => {
  if (!text) return '';
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: options.errorCorrectionLevel || 'L',
      margin: options.margin !== undefined ? options.margin : 1,
      width: options.width || 400,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      ...options,
    });
  } catch (err) {
    console.error('Failed to generate QR Code data URL:', err);
    return '';
  }
};

export const generateQRCodeSVGString = async (text, options = {}) => {
  if (!text) return '';
  try {
    return await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: options.width || 180,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      ...options,
    });
  } catch (err) {
    console.error('Failed to generate QR Code SVG:', err);
    return '';
  }
};
