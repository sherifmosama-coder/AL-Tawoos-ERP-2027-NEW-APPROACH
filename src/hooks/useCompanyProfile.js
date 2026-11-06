import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export const DEFAULT_COMPANY_PROFILE = {
  tradeNameAr: 'شركة الطاووس للصناعات الغذائية والتعبئة',
  tradeNameEn: 'Tawoos Food Industries & Packaging S.A.E',
  legalName: 'شركة الطاووس للصناعات الغذائية والتعبئة ش.م.م',
  taxCardNumber: '104-822-910',
  commercialRegister: '104822',
  taxDistrict: 'مأمورية ضرائب الشركات المساهمة - 6 أكتوبر',
  registeredAddress: 'المنطقة الصناعية الثالثة - قطعة 14/ب - مدينة 6 أكتوبر - الجيزة',
  baseCurrency: 'EGP',
  decimalPrecision: 2,
  fiscalYearStart: '01-01',
  standardShiftHours: 8,
  contactEmail: 'operations@tawoos.com',
  contactPhone: '+20 2 3833 0000',
};

/**
 * useCompanyProfile
 * SSOT Hook to read company details (legal name, trade names, tax number,
 * commercial register, address, etc.) live from Firestore doc: system_config/company_profile
 */
export function useCompanyProfile() {
  const [companyProfile, setCompanyProfile] = useState(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        doc(db, 'system_config', 'company_profile'),
        (snap) => {
          if (snap.exists()) {
            setCompanyProfile((prev) => ({ ...prev, ...snap.data() }));
          }
          setLoading(false);
        },
        (err) => {
          console.warn('Could not read company_profile from system_config:', err);
          setLoading(false);
        }
      );
      return () => unsub();
    } catch (err) {
      console.warn('Error setting up company_profile snapshot:', err);
      setLoading(false);
    }
  }, []);

  return { companyProfile, loading };
}

export default useCompanyProfile;
