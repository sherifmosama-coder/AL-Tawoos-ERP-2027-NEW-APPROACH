import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import the full Odoo compiled dictionary
import arOdoo from './locales/ar_odoo.json';

const resources = {
  ar: {
    translation: {
      ...arOdoo,
      // Custom System Navigation & Titles
      "app_name": "نظام الطاووس لإدارة الخامات",
      "nav_dashboard": "الرئيسية",
      "nav_items": "كارت الأصناف",
      "nav_receipts": "إذن استلام خامات",
      "nav_transfers": "تحويلات المخازن",
      "nav_stock": "رصيد المخازن"
    }
  },
  en: {
    translation: {
      "app_name": "Al-Tawoos Raw Material ERP",
      "nav_dashboard": "Dashboard",
      "nav_items": "Item Master",
      "nav_receipts": "Goods Receipt",
      "nav_transfers": "Stock Transfers",
      "nav_stock": "Stock Balances"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ar', // Default to Arabic for your factory team
    interpolation: {
      escapeValue: false
    }
  });

// Automatically update HTML text direction when language changes
i18n.on('languageChanged', (lng) => {
  document.dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

// Set initial page direction on load
document.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';

export default i18n;