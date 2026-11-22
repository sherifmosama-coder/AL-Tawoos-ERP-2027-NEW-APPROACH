/**
 * Cash Safes & Vaults SSOT Ledger Engine
 * Governs physical monetary balances, banknote inventory breakdown,
 * zero-sum change exchanges, approval schemes, and audit verifications.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { createActionRequired, completeActionRequired } from './notificationEngine.js';
import { buildAccountsCSVString, UPLOADED_CHART_OF_ACCOUNTS_ROWS } from './preconfiguredChartOfAccounts.js';

export const EGP_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1, 0.5];

export const INITIAL_PRECONFIGURED_SAFES = [
  {
    id: 'SAFE-01',
    nameAr: 'الخزينة الرئيسية',
    nameEn: 'Main Corporate Vault',
    color: 'blue',
    isActive: true,
    responsibleUserId: 'usr_general_admin',
    authorizerUserId: 'usr_general_admin',
    maxSafetyLimit: 250000,
    defaultCurrency: 'EGP',
    balances: {
      EGP: {
        currentBalance: 0,
        denominations: {
          '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, '0.5': 0
        }
      }
    }
  },
  {
    id: 'SAFE-02',
    nameAr: 'خزينة الصالة والمبيعات',
    nameEn: 'Floor & Sales Vault',
    color: 'emerald',
    isActive: true,
    responsibleUserId: 'usr_662444',
    authorizerUserId: 'usr_general_admin',
    maxSafetyLimit: 100000,
    defaultCurrency: 'EGP',
    balances: {
      EGP: {
        currentBalance: 0,
        denominations: {
          '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, '0.5': 0
        }
      }
    }
  }
];

export const CASH_TRANSACTION_TYPES = [
  { id: 'disbursement', labelAr: 'صرف نقدية', labelEn: 'Disbursement', direction: 'out', defaultAccount: '3010207' },
  { id: 'collection', labelAr: 'تحصيل نقدية', labelEn: 'Collection', direction: 'in', defaultAccount: '1020301' },
  { id: 'custody_issue', labelAr: 'صرف عهدة', labelEn: 'Issue Custody', direction: 'out', defaultAccount: '1020401' },
  { id: 'custody_settle', labelAr: 'رد / تسوية عهدة', labelEn: 'Settle Custody', direction: 'in', defaultAccount: '1020401' },
  { id: 'salary_advance', labelAr: 'صرف سلفة', labelEn: 'Issue Advance', direction: 'out', defaultAccount: '1020401' },
  { id: 'advance_settle', labelAr: 'رد سلفة', labelEn: 'Settle Advance', direction: 'in', defaultAccount: '1020401' },
  { id: 'change_exchange', labelAr: 'فكة وتظبيط فئات', labelEn: 'Change Exchange', direction: 'zero_sum', defaultAccount: '1020101' },
  { id: 'balance_adjustment', labelAr: 'تظبيط رصيد (عجز/زيادة)', labelEn: 'Balance Adjustment', direction: 'variable', defaultAccount: '4010204' },
  { id: 'safe_transfer', labelAr: 'تحويل بين الخزن', labelEn: 'Inter-Safe Transfer', direction: 'out', defaultAccount: '1020101' }
];

export const CORPORATE_BANK_ACCOUNTS = [
  { id: 'BANK-CIB-01', bankNameAr: 'البنك التجاري الدولي (CIB)', bankNameEn: 'Commercial International Bank (CIB)', accountNumber: '100045889211', currency: 'EGP', isBank: true },
  { id: 'BANK-QNB-01', bankNameAr: 'بنك قطر الوطني (QNB الأهلي)', bankNameEn: 'Qatar National Bank (QNB)', accountNumber: '203388741002', currency: 'EGP', isBank: true },
  { id: 'BANK-NBE-01', bankNameAr: 'البنك الأهلي المصري (NBE)', bankNameEn: 'National Bank of Egypt (NBE)', accountNumber: '010584729100', currency: 'EGP', isBank: true }
];

export const SAFE_THEMES = {
  blue: {
    colorKey: 'blue',
    tabActive: 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-950 text-white shadow-lg shadow-blue-900/40 border-blue-400 ring-2 ring-blue-400/50',
    tabInactive: 'bg-blue-50/70 text-blue-900 hover:bg-blue-100/80 border-blue-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-blue-200/60 text-blue-950',
    dot: 'bg-blue-400 ring-2 ring-blue-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 border-blue-700/60 shadow-2xl shadow-blue-950/60',
    heroOrb: 'from-blue-500/20 to-indigo-600/10',
    watermarkColor: 'text-blue-500/10',
    accentText: 'text-blue-400',
    tagBadge: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
    progressBar: 'bg-blue-500',
    breakdownIcon: 'text-blue-600',
    breakdownHeader: 'bg-blue-50/60 border-blue-200/80 text-blue-950',
    breakdownCardActive: 'bg-blue-50/50 border-blue-200/80',
    breakdownActiveValue: 'text-blue-700',
    accentRing: 'focus:ring-blue-500',
    safeBadge: 'bg-blue-600 text-white'
  },
  emerald: {
    colorKey: 'emerald',
    tabActive: 'bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-950 text-white shadow-lg shadow-emerald-900/40 border-emerald-400 ring-2 ring-emerald-400/50',
    tabInactive: 'bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/80 border-emerald-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-emerald-200/60 text-emerald-950',
    dot: 'bg-emerald-400 ring-2 ring-emerald-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-950 border-emerald-700/60 shadow-2xl shadow-emerald-950/60',
    heroOrb: 'from-emerald-500/20 to-teal-600/10',
    watermarkColor: 'text-emerald-500/10',
    accentText: 'text-emerald-400',
    tagBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
    progressBar: 'bg-emerald-500',
    breakdownIcon: 'text-emerald-600',
    breakdownHeader: 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950',
    breakdownCardActive: 'bg-emerald-50/50 border-emerald-200/80',
    breakdownActiveValue: 'text-emerald-700',
    accentRing: 'focus:ring-emerald-500',
    safeBadge: 'bg-emerald-600 text-white'
  },
  amber: {
    colorKey: 'amber',
    tabActive: 'bg-gradient-to-r from-amber-600 via-amber-700 to-orange-950 text-white shadow-lg shadow-amber-900/40 border-amber-400 ring-2 ring-amber-400/50',
    tabInactive: 'bg-amber-50/70 text-amber-900 hover:bg-amber-100/80 border-amber-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-amber-200/60 text-amber-950',
    dot: 'bg-amber-400 ring-2 ring-amber-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-amber-950 to-stone-900 border-amber-700/60 shadow-2xl shadow-amber-950/60',
    heroOrb: 'from-amber-500/20 to-orange-600/10',
    watermarkColor: 'text-amber-500/10',
    accentText: 'text-amber-400',
    tagBadge: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
    progressBar: 'bg-amber-500',
    breakdownIcon: 'text-amber-600',
    breakdownHeader: 'bg-amber-50/60 border-amber-200/80 text-amber-950',
    breakdownCardActive: 'bg-amber-50/50 border-amber-200/80',
    breakdownActiveValue: 'text-amber-700',
    accentRing: 'focus:ring-amber-500',
    safeBadge: 'bg-amber-600 text-white'
  },
  purple: {
    colorKey: 'purple',
    tabActive: 'bg-gradient-to-r from-purple-700 via-purple-800 to-indigo-950 text-white shadow-lg shadow-purple-900/40 border-purple-400 ring-2 ring-purple-400/50',
    tabInactive: 'bg-purple-50/70 text-purple-900 hover:bg-purple-100/80 border-purple-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-purple-200/60 text-purple-950',
    dot: 'bg-purple-400 ring-2 ring-purple-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 border-purple-700/60 shadow-2xl shadow-purple-950/60',
    heroOrb: 'from-purple-500/20 to-indigo-600/10',
    watermarkColor: 'text-purple-500/10',
    accentText: 'text-purple-400',
    tagBadge: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
    progressBar: 'bg-purple-500',
    breakdownIcon: 'text-purple-600',
    breakdownHeader: 'bg-purple-50/60 border-purple-200/80 text-purple-950',
    breakdownCardActive: 'bg-purple-50/50 border-purple-200/80',
    breakdownActiveValue: 'text-purple-700',
    accentRing: 'focus:ring-purple-500',
    safeBadge: 'bg-purple-600 text-white'
  },
  rose: {
    colorKey: 'rose',
    tabActive: 'bg-gradient-to-r from-rose-700 via-rose-800 to-slate-950 text-white shadow-lg shadow-rose-900/40 border-rose-400 ring-2 ring-rose-400/50',
    tabInactive: 'bg-rose-50/70 text-rose-900 hover:bg-rose-100/80 border-rose-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-rose-200/60 text-rose-900',
    dot: 'bg-rose-400 ring-2 ring-rose-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-rose-950 to-slate-900 border-rose-700/60 shadow-2xl shadow-rose-950/60',
    heroOrb: 'from-rose-500/20 to-pink-600/10',
    watermarkColor: 'text-rose-500/10',
    accentText: 'text-rose-400',
    tagBadge: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
    progressBar: 'bg-rose-500',
    breakdownIcon: 'text-rose-600',
    breakdownHeader: 'bg-rose-50/60 border-rose-200/80 text-rose-950',
    breakdownCardActive: 'bg-rose-50/50 border-rose-200/80',
    breakdownActiveValue: 'text-rose-700',
    accentRing: 'focus:ring-rose-500',
    safeBadge: 'bg-rose-600 text-white'
  },
  cyan: {
    colorKey: 'cyan',
    tabActive: 'bg-gradient-to-r from-cyan-700 via-teal-800 to-slate-950 text-white shadow-lg shadow-cyan-900/40 border-cyan-400 ring-2 ring-cyan-400/50',
    tabInactive: 'bg-cyan-50/70 text-cyan-900 hover:bg-cyan-100/80 border-cyan-200/90',
    tabBadgeActive: 'bg-white/20 text-white',
    tabBadgeInactive: 'bg-cyan-200/60 text-cyan-950',
    dot: 'bg-cyan-400 ring-2 ring-cyan-300',
    heroGradient: 'bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-900 border-cyan-700/60 shadow-2xl shadow-cyan-950/60',
    heroOrb: 'from-cyan-500/20 to-teal-600/10',
    watermarkColor: 'text-cyan-500/10',
    accentText: 'text-cyan-400',
    tagBadge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30',
    progressBar: 'bg-cyan-500',
    breakdownIcon: 'text-cyan-600',
    breakdownHeader: 'bg-cyan-50/60 border-cyan-200/80 text-cyan-950',
    breakdownCardActive: 'bg-cyan-50/50 border-cyan-200/80',
    breakdownActiveValue: 'text-cyan-700',
    accentRing: 'focus:ring-cyan-500',
    safeBadge: 'bg-cyan-600 text-white'
  }
};

export const MAIN_GL_ACCOUNTS = [
  { id: 'suppliers', nameAr: 'الموردين (سداد فواتير واستحقاقات)', nameEn: 'Accounts Payable / Suppliers', subType: 'supplier', statement: 'balance_sheet', reportCategory: 'current_liability', cashFlowCategory: 'operating', nature: 'credit' },
  { id: 'clients', nameAr: 'العملاء (متحصلات مبيعات وتوريد)', nameEn: 'Accounts Receivable / Clients', subType: 'client', statement: 'balance_sheet', reportCategory: 'current_asset', cashFlowCategory: 'operating', nature: 'debit' },
  { id: 'salaries', nameAr: 'الرواتب والأجور الشهرية (صرف مرتبات)', nameEn: 'Salaries & Monthly Wages', subType: 'worker', statement: 'income_statement', reportCategory: 'cogs_direct', cashFlowCategory: 'operating', nature: 'debit', requiresCostCenter: true },
  { id: 'opex', nameAr: 'مصروفات تشغيلية وصيانة مصنع', nameEn: 'Factory OPEX & Maintenance', subType: 'cost_center', statement: 'income_statement', reportCategory: 'cogs_direct', cashFlowCategory: 'operating', nature: 'debit', requiresCostCenter: true },
  { id: 'logistics', nameAr: 'مصروفات نقل ومشال وشحن', nameEn: 'Logistics & Handling', subType: 'cost_center', statement: 'income_statement', reportCategory: 'selling_expense', cashFlowCategory: 'operating', nature: 'debit', requiresCostCenter: true },
  { id: 'general_admin_exp', nameAr: 'مصروفات عمومية وإدارية', nameEn: 'General & Admin Expenses', subType: 'cost_center', statement: 'income_statement', reportCategory: 'admin_expense', cashFlowCategory: 'operating', nature: 'debit', requiresCostCenter: true },
  { id: 'custody', nameAr: 'عهد العاملين (مصروفات وعهد مؤقتة)', nameEn: 'Employee Custodies', subType: 'worker', statement: 'balance_sheet', reportCategory: 'current_asset', cashFlowCategory: 'operating', nature: 'debit' },
  { id: 'advances', nameAr: 'سلف العاملين (خصم من الراتب)', nameEn: 'Salary Advances', subType: 'worker', statement: 'balance_sheet', reportCategory: 'current_asset', cashFlowCategory: 'operating', nature: 'debit' },
  { id: 'discrepancy', nameAr: 'أرباح وخسائر تسوية عجز وزيادة الخزينة', nameEn: 'Cash Discrepancy Adjustment', subType: 'safe', statement: 'income_statement', reportCategory: 'other_revenue_expense', cashFlowCategory: 'operating', nature: 'credit' },
  { id: 'internal_transfer', nameAr: 'تحويلات خزن ونقدية داخلية', nameEn: 'Internal Safe Transfers', subType: 'safe', statement: 'balance_sheet', reportCategory: 'current_asset', cashFlowCategory: 'cash_equivalent', nature: 'debit' }
];

/**
 * Comprehensive bilingual configuration definitions for Chart of Accounts (COA)
 */
export const ACCOUNT_STATEMENTS = [
  {
    id: 'balance_sheet',
    labelAr: 'قائمة المركز المالي (الميزانية العمومية)',
    labelEn: 'Balance Sheet (Statement of Financial Position)',
    descAr: 'حسابات دائمة ومستمرة تتراكم أرصدتها عبر السنوات المالية وتشمل: الأصول، الالتزامات، وحقوق الملكية. لا تقفل بنهاية العام.',
    descEn: 'Permanent cumulative accounts reflecting company financial position (Assets, Liabilities, Equity). Never closed at year-end.',
    impactAr: 'تحدد الموقف التمويلي للشركة، أصولها وحجم التزاماتها المستحقة تجاه الموردين والجهات الخارجية والشركاء.',
    impactEn: 'Determines the company solvency, owned assets, and obligations to suppliers, creditors, and owners.',
    color: 'blue'
  },
  {
    id: 'income_statement',
    labelAr: 'قائمة الدخل (الأرباح والخسائر)',
    labelEn: 'Income Statement (Profit & Loss / P&L)',
    descAr: 'حسابات مؤقتة تقيس أداء الشركة خلال فترة مالية محددة وتشمل: الإيرادات، تكلفة البضاعة المباعة، والمصروفات. يقفل صافي ربحها في حقوق الملكية.',
    descEn: 'Temporary accounts measuring operating performance over a specific period (Revenues, COGS, Expenses). Net result rolls into Equity.',
    impactAr: 'تحدد مجمل الربح الصناعي والربح التشغيلي وصافي الأرباح/الخسائر الموزعة بنهاية الفترة المالية.',
    impactEn: 'Calculates Gross Industrial Margin, Operating EBIT, and Net Profit/Loss transferred to owners equity.',
    color: 'emerald'
  }
];

export const ACCOUNT_REPORT_CATEGORIES = [
  // Shared Umbrella / Root Section Header Category
  {
    id: 'section_header',
    statement: 'both',
    labelAr: 'عنوان تجميعي رئيسي بالهيكل الشجري (Umbrella Header)',
    labelEn: 'Umbrella Group Header (Multi-Section Root)',
    descAr: 'حساب تجميعي رئيسي في قمة الشجرة يضم تحته عدة أبواب فرعية (مثل: ١ الأصول، ٢ الالتزامات والملكية، ٣ المصروفات، ٤ الإيرادات). لا يظهر كبند منفرد داخل قسم فرعي.',
    descEn: 'Top-level umbrella header grouping multiple statement sections (e.g. 1 Assets, 2 Liabilities & Equity, 3 Expenses, 4 Revenues).',
    normalNature: 'debit',
    color: 'slate'
  },
  // Balance Sheet Categories
  {
    id: 'current_asset',
    statement: 'balance_sheet',
    labelAr: 'أصول متداولة (Current Assets)',
    labelEn: 'Current Assets',
    descAr: 'النقدية بالخزائن، أرصدة البنوك، مديونيات العملاء، مخزون الخامات والتام، وعهد وسلف العاملين المتوقع تحويلها لسيولة خلال سنة.',
    descEn: 'Cash in vaults, corporate bank accounts, accounts receivable, inventories, and staff custodies/advances.',
    normalNature: 'debit',
    color: 'emerald'
  },
  {
    id: 'fixed_asset',
    statement: 'balance_sheet',
    labelAr: 'أصول ثابتة وغير متداولة (Fixed & Non-Current Assets)',
    labelEn: 'Fixed & Non-Current Assets',
    descAr: 'خطوط الإنتاج، الماكينات الصناعية، خزانات التخزين الكيميائي، الشاحنات والسيارات، ومجمعات الإهلاك المرتبطة بها.',
    descEn: 'Liquid filling lines, compounding machinery, storage tanks, delivery fleet, and accumulated depreciation.',
    normalNature: 'debit',
    color: 'teal'
  },
  {
    id: 'current_liability',
    statement: 'balance_sheet',
    labelAr: 'التزامات متداولة (Current Liabilities)',
    labelEn: 'Current Liabilities',
    descAr: 'مستحقات الموردين قصيرة الأجل، أوراق الدفع والشيكات المصدرة، المصروفات المستحقة، والتزامات الضرائب (القيمة المضافة والخصم والإضافة).',
    descEn: 'Short-term accounts payable (suppliers), cheques payable, accrued wages/expenses, and tax authority liabilities.',
    normalNature: 'credit',
    color: 'rose'
  },
  {
    id: 'long_term_liability',
    statement: 'balance_sheet',
    labelAr: 'التزامات طويلة الأجل (Long-Term Liabilities)',
    labelEn: 'Long-Term Liabilities',
    descAr: 'القروض البنكية التمويلية والتسهيلات الائتمانية طويلة الأجل التي تستحق بعد أكثر من سنة مالية.',
    descEn: 'Bank term loans, capital leases, and long-term financing obligations due after one year.',
    normalNature: 'credit',
    color: 'amber'
  },
  {
    id: 'equity',
    statement: 'balance_sheet',
    labelAr: 'حقوق الملكية ورأس المال (Owners Equity)',
    labelEn: 'Equity & Capital',
    descAr: 'رأس المال المدفوع، الأرباح المحتجزة / المرحلة من سنوات سابقة، وصافي أرباح/خسائر العام الحالي المنقولة آلياً من قائمة الدخل.',
    descEn: 'Paid-in capital, retained earnings from previous years, and current period net income rolled over from P&L.',
    normalNature: 'credit',
    color: 'purple'
  },

  // Income Statement Categories
  {
    id: 'operating_revenue',
    statement: 'income_statement',
    labelAr: 'إيرادات النشاط التشغيلي والمبيعات (Operating Revenues)',
    labelEn: 'Operating Revenues & Sales',
    descAr: 'مبيعات المنتجات التامة للعملاء والموزعين، مخصوماً منها مردودات المبيعات والخصم التجاري المسموح به.',
    descEn: 'Gross sales of manufactured finished goods to clients and distributors, minus sales returns and commercial discounts.',
    normalNature: 'credit',
    color: 'emerald'
  },
  {
    id: 'cogs_direct',
    statement: 'income_statement',
    labelAr: 'تكلفة البضاعة المباعة والتشغيل المباشر (COGS & Direct Cost)',
    labelEn: 'Cost of Goods Sold (Direct Costs)',
    descAr: 'تكاليف الخامات ومواد التعبئة المستهلكة في أوامر التشغيل، أجور عمالة الإنتاج المباشرة، ومصاريف تشغيل المصنع المباشرة.',
    descEn: 'Direct raw materials & packaging consumed, production worker wages, and direct manufacturing utilities.',
    normalNature: 'debit',
    color: 'amber'
  },
  {
    id: 'selling_expense',
    statement: 'income_statement',
    labelAr: 'مصروفات بيع وتوزيع ونقل (Selling & Distribution)',
    labelEn: 'Selling & Distribution Expenses',
    descAr: 'نولون وشحن البضاعة التامة للعملاء، وقود وصيانة شاحنات التوزيع، عمولات البيع، وتكاليف التسويق والتغليف النهائي.',
    descEn: 'Finished goods freight-out, delivery fleet diesel & maintenance, sales commissions, and marketing.',
    normalNature: 'debit',
    color: 'blue'
  },
  {
    id: 'admin_expense',
    statement: 'income_statement',
    labelAr: 'مصروفات عمومية وإدارية (General & Administrative)',
    labelEn: 'General & Administrative Expenses',
    descAr: 'رواتب الإدارة، أدوات مكتبية، بوفيه واستضافة، اشتراكات واتصالات، أتعاب مهنية وقانونية، ومصروفات الصيانة الإدارية.',
    descEn: 'Administrative salaries, office stationery, pantry & hospitality, utilities, telecoms, and administrative repairs.',
    normalNature: 'debit',
    color: 'indigo'
  },
  {
    id: 'financing_expense',
    statement: 'income_statement',
    labelAr: 'أعباء تمويلية وعمولات بنكية (Financing & Bank Expenses)',
    labelEn: 'Financing Charges & Bank Fees',
    descAr: 'رسوم فتح الاعتمادات المستندية، عمولات التحويلات البنكية، ومصاريف الفوائد والخدمات المصرفية.',
    descEn: 'Bank transfer charges, letter of credit fees, loan interest, and commercial bank fees.',
    normalNature: 'debit',
    color: 'rose'
  },
  {
    id: 'other_revenue_expense',
    statement: 'income_statement',
    labelAr: 'إيرادات ومصروفات أخرى وفروق جرد (Other Income / Variances)',
    labelEn: 'Other Income, Variances & Discrepancies',
    descAr: 'إيرادات بيع مخلفات وبراميل التعبئة الخردة، أرباح/خسائر فروق العملة، وتسويات عجز وزيادة الخزينة بعد الجرد.',
    descEn: 'Proceeds from empty drum/scrap sales, foreign exchange differences, and physical cash audit discrepancies.',
    normalNature: 'credit',
    color: 'slate'
  }
];

export const ACCOUNT_STATEMENT_EFFECTS = [
  {
    id: 'add',
    labelAr: 'إضافة إلى إجمالي البند (+ Normal Addition)',
    labelEn: 'Add to Section Total (+)',
    descAr: 'يُضاف صافي رصيد الحساب إلى إجمالي القسم المالي التابع له.',
    descEn: 'Net balance is added to the parent financial statement section total.'
  },
  {
    id: 'deduct',
    labelAr: 'حساب عكسي / يُخصم من إجمالي البند (- Contra Deduction)',
    labelEn: 'Contra Account / Deduct from Section (-)',
    descAr: 'يُطرح صافي رصيد الحساب من إجمالي القسم المالي (مثل: مجمع إهلاك الأصول الثابتة، أو مردودات وخصومات المبيعات).',
    descEn: 'Net balance is subtracted from the section total (e.g., Accumulated Depreciation under Fixed Assets, or Sales Returns under Revenue).'
  }
];

export const ACCOUNT_CASH_FLOW_CATEGORIES = [
  {
    id: 'operating',
    labelAr: 'نشاط تشغيلي (Operating Activity)',
    labelEn: 'Operating Activity',
    descAr: 'تحصيلات نقدية من العملاء، مدفوعات نقدية للموردين، سداد أجور ومصروفات صيانة وتشغيل وبوفيه، وإصدار/تسوية العهد.',
    descEn: 'Cash receipts from customers, cash disbursements to suppliers, operating expenses, wages, and staff custodies.',
    color: 'blue'
  },
  {
    id: 'investing',
    labelAr: 'نشاط استثماري (Investing Activity)',
    labelEn: 'Investing Activity',
    descAr: 'شراء أو بيع ماكينات وخطوط إنتاج، تصنيع وتركيب خزانات سوائل، وتوسعات رأسمالية طويلة الأجل.',
    descEn: 'Purchases or sales of machinery, production equipment, tank installations, and capital asset expansions.',
    color: 'amber'
  },
  {
    id: 'financing',
    labelAr: 'نشاط تمويلي (Financing Activity)',
    labelEn: 'Financing Activity',
    descAr: 'ضخ رأس مال نقدي جديد من الشركاء، سحب أرباح أو مسحوبات شخصية، وقروض أو تسهيلات بنكية.',
    descEn: 'Capital injections, partner drawings / dividend distributions, and bank loan proceeds or repayments.',
    color: 'purple'
  },
  {
    id: 'cash_equivalent',
    labelAr: 'نقدية وشبه نقدية (Cash & Cash Equivalent)',
    labelEn: 'Cash & Cash Equivalent',
    descAr: 'أوعية السيولة نفسها (الخزائن الفعلية والحسابات البنكية) التي تمثل رصيد أول وآخر المدة في قائمة التدفقات.',
    descEn: 'Liquidity vaults and corporate bank accounts that form the opening and closing cash balances.',
    color: 'emerald'
  }
];

export const ACCOUNT_NATURES = [
  {
    id: 'debit',
    labelAr: 'مدين بطبيعته (Debit Nature)',
    labelEn: 'Debit Nature',
    descAr: 'يزيد بالجانب المدين وينقص بالدائن. القاعدة المحاسبية القياسية للأصول وتكاليف الإنتاج والمصروفات.',
    descEn: 'Increases with debits, decreases with credits. Standard accounting rule for Assets, COGS, and Expenses.'
  },
  {
    id: 'credit',
    labelAr: 'دائن بطبيعته (Credit Nature)',
    labelEn: 'Credit Nature',
    descAr: 'يزيد بالجانب الدائن وينقص بالمدين. القاعدة المحاسبية القياسية للالتزامات وحقوق الملكية والإيرادات.',
    descEn: 'Increases with credits, decreases with debits. Standard accounting rule for Liabilities, Equity, and Revenues.'
  }
];

export const ACCOUNT_SUBTYPES = [
  {
    id: 'cost_center',
    labelAr: 'مركز تكلفة / مصروفات عامة',
    labelEn: 'Cost Center / OPEX Account',
    descAr: 'حساب تحليلي لمتابعة المصروفات حسب خط الإنتاج، الورشة، أسطول النقل، أو إدارة المصنع.',
    descEn: 'Cost tracking account attributed to production lines, maintenance workshops, fleet, or management.'
  },
  {
    id: 'supplier',
    labelAr: 'موردين وخامات (سجل الموردين)',
    labelEn: 'Suppliers & Raw Materials',
    descAr: 'يرتبط بسجل الموردين المعتمد بالسيستم ويسمح بتسوية فواتير المشتريات ومحاضر الفحص (GRN).',
    descEn: 'Linked to the ERP Suppliers Registry; enables direct reconciliation against POs and GRNs.'
  },
  {
    id: 'client',
    labelAr: 'عملاء وموزعين (سجل العملاء)',
    labelEn: 'Clients & Distributors',
    descAr: 'يرتبط بسجل العملاء وموزعي الجملة لمتابعة مديونيات البيع ومتحصلات التوزيع.',
    descEn: 'Linked to the Clients Registry; tracks customer receivables and sales collections.'
  },
  {
    id: 'worker',
    labelAr: 'عاملين وموظفين (عهد وسلف وأجور)',
    labelEn: 'Staff & Workers (Custodies & Wages)',
    descAr: 'يرتبط بسجل الموظفين والعمال لصرف وتسوية العهد المؤقتة، السلف الشخصية، والمرتبات.',
    descEn: 'Linked to the Workers directory for petty cash custodies, salary advances, and monthly wages.'
  },
  {
    id: 'safe',
    labelAr: 'خزينة نقدية فعلية',
    labelEn: 'Physical Cash Vault',
    descAr: 'يمثل خزانة نقدية حقيقية بالشركة برصيد دفتري وفئات ورقية.',
    descEn: 'Represents a physical cash vault on-site with book balance and banknote breakdown.'
  },
  {
    id: 'bank',
    labelAr: 'حساب بنكي معتمد',
    labelEn: 'Corporate Bank Account',
    descAr: 'حساب بنكي جاري باسم المصنع للتحويلات الإلكترونية ومطابقة كشوف الحساب.',
    descEn: 'Corporate bank account used for wire transfers and bank statement reconciliation.'
  },
  {
    id: 'inventory',
    labelAr: 'مخزون وبضاعة',
    labelEn: 'Inventory & Stock',
    descAr: 'حسابات خامات ومواد تعبئة، إنتاج تحت التشغيل، ومخزون بضاعة تامة الصنع.',
    descEn: 'Raw materials, packaging, WIP, and finished goods inventory accounts.'
  },
  {
    id: 'asset',
    labelAr: 'أصول عامة',
    labelEn: 'General Asset',
    descAr: 'أصول ثابتة ومتداولة وأرصدة مدينة أخرى للشركة.',
    descEn: 'Fixed, current, and other debit asset accounts of the company.'
  },
  {
    id: 'liability',
    labelAr: 'التزامات ومستحقات',
    labelEn: 'Liabilities & Payables',
    descAr: 'التزامات قصيرة وطويلة الأجل، دائنون، وقروض وتسهيلات بنكية.',
    descEn: 'Short/long term liabilities, other payables, and bank financing.'
  },
  {
    id: 'equity',
    labelAr: 'حقوق ملكية ورأس مال',
    labelEn: 'Equity & Capital',
    descAr: 'رأس مال الشركة، الأرباح المرحلة، وجاري الشركاء.',
    descEn: 'Share capital, retained earnings, and partners current accounts.'
  },
  {
    id: 'revenue',
    labelAr: 'إيرادات ومبيعات',
    labelEn: 'Revenues & Sales',
    descAr: 'إيرادات النشاط التشغيلي، مبيعات المنتجات، والإيرادات المتنوعة.',
    descEn: 'Operating revenues, sales of finished goods, and miscellaneous income.'
  }
];

const VALID_REPORT_CATEGORY_IDS = new Set(ACCOUNT_REPORT_CATEGORIES.map((c) => c.id));
const UMBRELLA_ROOT_CODES = new Set(['1', '2', '3', '302', '4', '401']);

/**
 * Intelligently infers and standardizes account configurations while strictly preserving explicit user setup
 */
export function normalizeAccountAttributes(rawAcc = {}) {
  const code = String(rawAcc.code || rawAcc.id || '').trim();
  const c1 = code.charAt(0);
  const c2 = code.slice(0, 2);

  // Sanitize parentCode (prevent self-parenting loops such as 20203 -> 20203)
  let parentCode = String(rawAcc.parentCode ?? rawAcc.parentAccountId ?? '').trim();
  if (parentCode === code) {
    parentCode = code.length > 3 ? code.slice(0, 3) : (code.length > 1 ? code.slice(0, 1) : '');
  }

  // 1. Resolve Statement (Strictly preserve explicit 'balance_sheet' | 'income_statement')
  let statement = String(rawAcc.statement || '').trim();
  if (statement !== 'balance_sheet' && statement !== 'income_statement') {
    if (['1', '2'].includes(c1)) statement = 'balance_sheet';
    else statement = 'income_statement';
  }

  // 2. Resolve Report Category (Strictly preserve explicit valid category; normalize legacy aliases)
  let rawCat = String(rawAcc.reportCategory || '').trim().toLowerCase();
  if (rawCat === 'other revenue' || rawCat === 'other_revenue') rawCat = 'other_revenue_expense';

  let reportCategory = rawCat;
  // If umbrella root account was imported from legacy CSV without explicit v2 schema/statementEffect, default to section_header
  if (UMBRELLA_ROOT_CODES.has(code) && !rawAcc.statementEffect && rawCat !== 'section_header') {
    reportCategory = 'section_header';
  } else if (!VALID_REPORT_CATEGORY_IDS.has(reportCategory)) {
    if (UMBRELLA_ROOT_CODES.has(code)) reportCategory = 'section_header';
    else if (c2 === '11' || code.startsWith('102')) reportCategory = 'current_asset';
    else if (c2 === '12' || c2 === '15' || code.startsWith('101')) reportCategory = 'fixed_asset';
    else if (c1 === '1') reportCategory = 'current_asset';
    else if (code.startsWith('201') || c2 === '23') reportCategory = 'equity';
    else if (code.startsWith('202') || c2 === '21') reportCategory = 'current_liability';
    else if (code.startsWith('203') || c2 === '22') reportCategory = 'long_term_liability';
    else if (c1 === '2') reportCategory = 'current_liability';
    else if (code.startsWith('301') || c1 === '5') reportCategory = 'cogs_direct';
    else if (code.startsWith('30201') || c2 === '61') reportCategory = 'selling_expense';
    else if (code.startsWith('30202') || c1 === '6') reportCategory = 'admin_expense';
    else if (code.startsWith('30203') || c2 === '71') reportCategory = 'financing_expense';
    else if (c1 === '3') reportCategory = 'cogs_direct';
    else if (code.startsWith('40102') || c1 === '7') reportCategory = 'other_revenue_expense';
    else if (c1 === '4') reportCategory = 'operating_revenue';
    else reportCategory = statement === 'balance_sheet' ? 'current_asset' : 'admin_expense';
  }

  // Ensure statement aligns with reportCategory if reportCategory belongs to a specific statement
  const matchedCatObj = ACCOUNT_REPORT_CATEGORIES.find((c) => c.id === reportCategory);
  if (matchedCatObj && matchedCatObj.statement !== 'both' && !rawAcc.statement) {
    statement = matchedCatObj.statement;
  }

  // 3. Resolve Nature (Strictly preserve 'debit' | 'credit')
  let nature = String(rawAcc.nature || '').trim().toLowerCase();
  if (nature !== 'debit' && nature !== 'credit') {
    if (code.startsWith('10102') || code === '1590') nature = 'credit';
    else if (['1', '3', '5', '6'].includes(c1) || c2 === '71') nature = 'debit';
    else nature = 'credit';
  }

  // 4. Resolve Statement Effect ('add' | 'deduct')
  let statementEffect = String(rawAcc.statementEffect || '').trim().toLowerCase();
  if (statementEffect !== 'add' && statementEffect !== 'deduct') {
    if (reportCategory === 'section_header') {
      statementEffect = 'add';
    } else {
      const sectionNormalNature = matchedCatObj?.normalNature || (['current_asset', 'fixed_asset', 'cogs_direct', 'selling_expense', 'admin_expense', 'financing_expense'].includes(reportCategory) ? 'debit' : 'credit');
      statementEffect = nature === sectionNormalNature ? 'add' : 'deduct';
    }
  }

  // 5. Resolve Cash Flow Category
  let cashFlowCategory = String(rawAcc.cashFlowCategory || '').trim().toLowerCase();
  if (!['operating', 'investing', 'financing', 'cash_equivalent'].includes(cashFlowCategory)) {
    if (rawAcc.subType === 'safe' || rawAcc.subType === 'bank' || c2 === '11' || code.startsWith('10201')) cashFlowCategory = 'cash_equivalent';
    else if (reportCategory === 'fixed_asset' || c2 === '15' || code.startsWith('101')) cashFlowCategory = 'investing';
    else if (reportCategory === 'equity' || reportCategory === 'long_term_liability' || code.startsWith('201') || code.startsWith('20204')) cashFlowCategory = 'financing';
    else cashFlowCategory = 'operating';
  }

  // 6. Resolve Requires Cost Center
  const requiresCostCenter = rawAcc.requiresCostCenter !== undefined
    ? Boolean(rawAcc.requiresCostCenter === true || rawAcc.requiresCostCenter === 'true')
    : (['3', '5', '6'].includes(c1) && rawAcc.subType === 'cost_center');

  // 7. Resolve Type ('main' | 'sub')
  let resolvedType = 'main';
  if (rawAcc.type) {
    resolvedType = String(rawAcc.type).toLowerCase() === 'sub' ? 'sub' : 'main';
  } else {
    resolvedType = Boolean(parentCode) ? 'sub' : 'main';
  }

  // 8. Resolve Hierarchy Level (1..5+)
  let level = Number(rawAcc.level);
  if (!Number.isFinite(level) || level < 1) {
    if (!parentCode) level = 1;
    else if (code.length <= 3) level = 2;
    else if (code.length <= 5 && !code.includes('-')) level = 3;
    else level = 4;
  }

  // 9. Resolve Display Order
  const parsedOrder = Number(rawAcc.displayOrder);
  const displayOrder = Number.isFinite(parsedOrder) && parsedOrder > 0 ? parsedOrder : 0;

  return {
    ...rawAcc,
    id: code,
    code,
    level,
    type: resolvedType,
    parentCode,
    parentAccountId: parentCode,
    statement,
    reportCategory,
    statementEffect,
    cashFlowCategory,
    nature,
    subType: String(rawAcc.subType || 'cost_center').trim().toLowerCase(),
    requiresCostCenter,
    displayOrder,
    descriptionAr: rawAcc.descriptionAr ?? rawAcc.notes ?? '',
    descriptionEn: rawAcc.descriptionEn ?? '',
    isActive: rawAcc.isActive !== false
  };
}

/**
 * Builds a complete parent-child hierarchy map for all COA accounts.
 * Computes exact tree depth (level), ancestor chain, and direct children codes.
 */
export function buildAccountHierarchyMap(accountsList = []) {
  const byCode = new Map();
  accountsList.forEach((raw) => {
    const acc = normalizeAccountAttributes(raw);
    if (acc.code) {
      byCode.set(acc.code, {
        ...acc,
        childrenCodes: [],
        ancestorCodes: []
      });
    }
  });

  // Link parents & children and compute exact tree depth
  byCode.forEach((acc) => {
    const ancestors = [];
    const visited = new Set([acc.code]);
    let currParent = acc.parentCode;
    while (currParent && byCode.has(currParent) && !visited.has(currParent)) {
      visited.add(currParent);
      ancestors.push(currParent);
      const parentObj = byCode.get(currParent);
      currParent = parentObj?.parentCode || '';
    }
    acc.ancestorCodes = ancestors;
    // Tree depth is 1 + number of existing ancestors (or explicit acc.level if parent is missing)
    acc.treeLevel = ancestors.length > 0 ? ancestors.length + 1 : (acc.level || 1);
    acc.level = acc.level || acc.treeLevel;

    if (acc.parentCode && byCode.has(acc.parentCode) && acc.parentCode !== acc.code) {
      byCode.get(acc.parentCode).childrenCodes.push(acc.code);
    }
  });

  // Sort children by displayOrder then code
  byCode.forEach((acc) => {
    acc.childrenCodes.sort((a, b) => {
      const accA = byCode.get(a);
      const accB = byCode.get(b);
      const orderDiff = (accA?.displayOrder || 999999) - (accB?.displayOrder || 999999);
      if (orderDiff !== 0) return orderDiff;
      return String(a).localeCompare(String(b));
    });
  });

  return byCode;
}

/**
 * Resolves the double-entry GL account codes (primary account + safe/bank counter-leg)
 * for any cash voucher transaction strictly using COA & Accounting Links.
 */
export function resolveCashTransactionPostingLegs(tx = {}, accountingLinks = {}, accountsMap = new Map()) {
  const isBank = Boolean(tx.isBank || String(tx.safeId || '').startsWith('BANK-'));

  const hasAcc = (code) => {
    if (!code) return false;
    const clean = String(code).trim();
    if (accountsMap instanceof Map) return accountsMap.has(clean);
    if (Array.isArray(accountsMap)) return accountsMap.some((a) => String(a.code || a.id).trim() === clean);
    if (typeof accountsMap === 'object' && accountsMap !== null) return Boolean(accountsMap[clean]);
    return false;
  };

  const getAcc = (code) => {
    if (!code) return null;
    const clean = String(code).trim();
    if (accountsMap instanceof Map) return accountsMap.get(clean);
    if (Array.isArray(accountsMap)) return accountsMap.find((a) => String(a.code || a.id).trim() === clean);
    if (typeof accountsMap === 'object' && accountsMap !== null) return accountsMap[clean];
    return null;
  };

  const defaultSafeCode = hasAcc('1020101') ? '1020101' : (hasAcc('10201') ? '10201' : '1110');
  const defaultBankCode = hasAcc('1020102') ? '1020102' : (hasAcc('10201') ? '10201' : '1130');

  const configuredSafeCode = accountingLinks?.cashSafesAccount?.primaryCode || accountingLinks?.cashSafesAccount?.code || defaultSafeCode;
  const configuredBankCode = accountingLinks?.corporateBanksAccount?.primaryCode || accountingLinks?.corporateBanksAccount?.code || defaultBankCode;

  const counterAccountCode = isBank
    ? (hasAcc(configuredBankCode) ? configuredBankCode : defaultBankCode)
    : (hasAcc(configuredSafeCode) ? configuredSafeCode : defaultSafeCode);

  const counterAccountObj = getAcc(counterAccountCode);
  const counterAccountNameAr = counterAccountObj?.nameAr || (isBank ? 'البنوك' : 'الخزينة الرئيسية');

  const isSurplus = tx.type === 'balance_adjustment' && tx.direction === 'in';
  let resolvedCode = String(tx.mainAccount || '').trim();
  const subCode = String(tx.subAccountId || tx.subAccountCode || tx.childAccountCode || '').trim();

  // If subAccountId is itself a registered COA account code, strictly adhere to it for analytical precision
  if (subCode && hasAcc(subCode)) {
    resolvedCode = subCode;
  } else if (!resolvedCode || resolvedCode === 'discrepancy') {
    resolvedCode = accountingLinks?.cashDiscrepancyAccount?.primaryCode || (isSurplus ? '4010204' : '3020209');
  } else if (resolvedCode === 'custody' || resolvedCode === 'advances') {
    resolvedCode = accountingLinks?.workersCustodyAccount?.primaryCode || '1020401';
  } else if (resolvedCode === 'internal_transfer' || tx.type === 'safe_transfer') {
    resolvedCode = accountingLinks?.internalTransfersAccount?.primaryCode || counterAccountCode;
  } else if (resolvedCode === 'suppliers') {
    resolvedCode = accountingLinks?.suppliersAccount?.primaryCode || '2020101';
  } else if (resolvedCode === 'clients') {
    resolvedCode = accountingLinks?.clientsAccount?.primaryCode || '1020301';
  } else if (resolvedCode === 'salaries') {
    resolvedCode = hasAcc('3010201') ? '3010201' : '3020201';
  } else if (resolvedCode === 'opex' || resolvedCode === 'general_admin_exp') {
    resolvedCode = hasAcc('3010207') ? '3010207' : '3020213';
  }

  const matchedAccountObj = getAcc(resolvedCode);
  const resolvedNameAr = matchedAccountObj?.nameAr || tx.subAccountName || tx.mainAccountAr || tx.mainAccount || resolvedCode;

  return {
    mainAccountCode: resolvedCode,
    mainAccountNameAr: resolvedNameAr,
    counterAccountCode,
    counterAccountNameAr,
    isTransfer: tx.type === 'safe_transfer'
  };
}

/**
 * Computes setup-driven Financial Statement section items and total with multi-level COA roll-up.
 * - Routes accounts strictly by `acc.statement === statementId && acc.reportCategory === categoryId`.
 * - Respects `acc.statementEffect` ('add' vs 'deduct') and `acc.nature` ('debit' vs 'credit').
 * - Aggregates deeper child accounts bottom-up into their visible parent at `maxDisplayLevel` ('summary' | '2' | '3' | '4' | 'all').
 * - Never double-counts parent and child balances in `total`.
 */
export function computeRollupSectionItems({
  statementId,
  categoryId,
  hierarchyMap,
  rawBalancesMap = {},
  maxDisplayLevel = '3',
  showZeroBalances = false
}) {
  // 1. Collect all active accounts assigned to this statement & reportCategory
  const sectionAccounts = [];
  const sectionCodesSet = new Set();

  hierarchyMap.forEach((acc) => {
    if (acc.isActive === false) return;
    if (acc.statement === statementId && acc.reportCategory === categoryId) {
      sectionAccounts.push(acc);
      sectionCodesSet.add(acc.code);
    }
  });

  // Sort section accounts by displayOrder then code
  sectionAccounts.sort((a, b) => {
    const orderDiff = (a.displayOrder || 999999) - (b.displayOrder || 999999);
    if (orderDiff !== 0) return orderDiff;
    return String(a.code).localeCompare(String(b.code));
  });

  // 2. Compute each account's own natural balance & its signed contribution to the section
  const ownDataByCode = new Map();
  let sectionTotal = 0;

  sectionAccounts.forEach((acc) => {
    const raw = rawBalancesMap[acc.code] || { debit: 0, credit: 0, transactions: [] };
    const debit = Number(raw.debit) || 0;
    const credit = Number(raw.credit) || 0;
    const ownNaturalBalance = acc.nature === 'debit' ? (debit - credit) : (credit - debit);
    const isContra = acc.statementEffect === 'deduct';
    const ownSectionContribution = isContra ? -ownNaturalBalance : ownNaturalBalance;

    sectionTotal += ownSectionContribution;

    ownDataByCode.set(acc.code, {
      debit,
      credit,
      ownNaturalBalance,
      ownSectionContribution,
      transactions: Array.isArray(raw.transactions) ? raw.transactions : []
    });
  });

  if (maxDisplayLevel === 'summary') {
    return {
      items: [],
      total: sectionTotal
    };
  }

  const numericMaxLevel = maxDisplayLevel === 'all' ? 99 : (Number(maxDisplayLevel) || 3);

  // 3. Determine in-section parent for each account in this section
  // (Nearest ancestor that is ALSO in sectionCodesSet)
  const inSectionParentMap = new Map();
  const inSectionChildrenMap = new Map();
  sectionAccounts.forEach((acc) => {
    inSectionChildrenMap.set(acc.code, []);
  });

  sectionAccounts.forEach((acc) => {
    const nearestInSectionAncestor = (acc.ancestorCodes || []).find((ancCode) => sectionCodesSet.has(ancCode)) || null;
    inSectionParentMap.set(acc.code, nearestInSectionAncestor);
    if (nearestInSectionAncestor && inSectionChildrenMap.has(nearestInSectionAncestor)) {
      inSectionChildrenMap.get(nearestInSectionAncestor).push(acc.code);
    }
  });

  // 4. Compute full subtree rollup (within this section) for every account in the section
  const computeSubtreeRollup = (code) => {
    const acc = hierarchyMap.get(code);
    const own = ownDataByCode.get(code) || {
      debit: 0,
      credit: 0,
      ownNaturalBalance: 0,
      ownSectionContribution: 0,
      transactions: []
    };
    let rollupDebit = own.debit;
    let rollupCredit = own.credit;
    let rollupSectionContribution = own.ownSectionContribution;
    let rollupTransactions = [...own.transactions];
    let aggregatedChildrenCount = 0;

    const childCodes = inSectionChildrenMap.get(code) || [];
    childCodes.forEach((childCode) => {
      const childRollup = computeSubtreeRollup(childCode);
      rollupDebit += childRollup.debit;
      rollupCredit += childRollup.credit;
      rollupSectionContribution += childRollup.sectionContribution;
      rollupTransactions = rollupTransactions.concat(childRollup.transactions);
      aggregatedChildrenCount += 1 + childRollup.aggregatedChildrenCount;
    });

    const isContra = acc?.statementEffect === 'deduct';
    // Natural display balance for the account row (positive when moving in its own natural direction)
    const displayNaturalBalance = isContra ? -rollupSectionContribution : rollupSectionContribution;

    return {
      debit: rollupDebit,
      credit: rollupCredit,
      naturalBalance: displayNaturalBalance,
      sectionContribution: rollupSectionContribution,
      transactions: rollupTransactions,
      aggregatedChildrenCount
    };
  };

  const subtreeRollupByCode = new Map();
  sectionAccounts.forEach((acc) => {
    subtreeRollupByCode.set(acc.code, computeSubtreeRollup(acc.code));
  });

  // 5. Select visible rows based on numericMaxLevel:
  // - Accounts with level > numericMaxLevel are hidden (folded into their ancestor at level <= numericMaxLevel).
  // - If an account has no in-section ancestor with level <= numericMaxLevel (e.g. a section whose root is at level 3 when maxLevel=2),
  //   it acts as a section root and remains visible so its balance is never orphaned!
  const isVisibleAtLevel = (acc) => {
    const lvl = acc.level || acc.treeLevel || 1;
    if (lvl <= numericMaxLevel) return true;
    const inSecParent = inSectionParentMap.get(acc.code);
    return !inSecParent;
  };

  const visibleCodesSet = new Set(
    sectionAccounts.filter((acc) => isVisibleAtLevel(acc)).map((acc) => acc.code)
  );

  // Build visible rows in hierarchical DFS order
  const items = [];
  const visitNode = (code, visualIndent = 0) => {
    const acc = hierarchyMap.get(code);
    if (!acc || !visibleCodesSet.has(code)) return;

    const visibleChildren = (inSectionChildrenMap.get(code) || []).filter((c) => visibleCodesSet.has(c));
    const hasVisibleChildren = visibleChildren.length > 0;
    const own = ownDataByCode.get(code);
    const rollup = subtreeRollupByCode.get(code);

    if (!hasVisibleChildren) {
      // Effective leaf at this display level: displays its full subtree rollup!
      const hasActivity = Math.abs(rollup.sectionContribution) >= 0.005 || rollup.debit > 0 || rollup.credit > 0;
      if (hasActivity || showZeroBalances) {
        items.push({
          ...acc,
          debit: rollup.debit,
          credit: rollup.credit,
          naturalBalance: rollup.naturalBalance,
          balance: rollup.sectionContribution, // Signed contribution to the section total
          transactions: rollup.transactions,
          aggregatedChildrenCount: rollup.aggregatedChildrenCount,
          isContra: acc.statementEffect === 'deduct',
          isGroupParent: false,
          visualIndent
        });
      }
    } else {
      // This node has visible children at the selected display level.
      // Case 1: We are at a consolidated level (e.g. Level 3) and this node is an empty Level 2 wrapper (like 101 or 102)
      // whose children (10101, 10102) are the actual target level rows.
      const accLevel = acc.level || acc.treeLevel || 1;
      const isWrapperAboveTargetLevel = numericMaxLevel <= 3 && accLevel < numericMaxLevel && Math.abs(own.ownSectionContribution) < 0.005;

      if (isWrapperAboveTargetLevel) {
        // Traverse directly into its visible children without rendering a redundant wrapper header
        visibleChildren.forEach((childCode) => visitNode(childCode, visualIndent));
      } else {
        // Case 2: Detailed view (Level 4 / All) or parent has direct postings of its own
        const subtreeHasActivity = Math.abs(rollup.sectionContribution) >= 0.005 || rollup.debit > 0 || rollup.credit > 0;
        if (subtreeHasActivity || showZeroBalances) {
          items.push({
            ...acc,
            debit: rollup.debit,
            credit: rollup.credit,
            naturalBalance: rollup.naturalBalance,
            balance: rollup.sectionContribution,
            ownBalance: own.ownSectionContribution,
            transactions: rollup.transactions,
            aggregatedChildrenCount: rollup.aggregatedChildrenCount,
            isContra: acc.statementEffect === 'deduct',
            isGroupParent: true, // Group header showing subtree subtotal (not double-counted)
            visualIndent
          });
        }
        visibleChildren.forEach((childCode) => visitNode(childCode, visualIndent + 1));
      }
    }
  };

  // Start DFS from visible section roots (accounts whose in-section parent is null or not visible)
  sectionAccounts.forEach((acc) => {
    if (!visibleCodesSet.has(acc.code)) return;
    const parentInSec = inSectionParentMap.get(acc.code);
    if (!parentInSec || !visibleCodesSet.has(parentInSec)) {
      visitNode(acc.code, 0);
    }
  });

  return {
    items,
    total: sectionTotal
  };
}

/**
 * Calculates total monetary sum of a banknote count map
 */
export function calculateBanknoteTotal(denominations = {}) {
  return EGP_DENOMINATIONS.reduce((sum, denom) => {
    const count = Number(denominations[denom]) || 0;
    return sum + (denom * count);
  }, 0);
}

/**
 * Validates that banknote breakdown matches total amount exactly (within 0.001 EGP)
 */
export function validateBanknoteMatch(amount, denominations = {}) {
  const bankTotal = calculateBanknoteTotal(denominations);
  return Math.abs(bankTotal - Number(amount)) < 0.005;
}

/**
 * Checks if the safe currently possesses enough notes of each denomination:
 * - In outflow: positive counts are dispensed by the safe (available >= requested)
 * - In inflow: negative counts are dispensed by the safe as change to the payer (available >= |requested|)
 */
export function checkSufficientBanknotes(safeDenominations = {}, requestedDenominations = {}, isOutflow = true) {
  const shortages = [];
  for (const denom of EGP_DENOMINATIONS) {
    const available = Number(safeDenominations[denom]) || 0;
    const requested = Number(requestedDenominations[denom]) || 0;
    const neededFromSafe = isOutflow ? Math.max(0, requested) : Math.max(0, -requested);
    if (neededFromSafe > available) {
      shortages.push({
        denom,
        requested: neededFromSafe,
        available,
        shortage: neededFromSafe - available
      });
    }
  }
  return {
    isSufficient: shortages.length === 0,
    shortages
  };
}

/**
 * Generates UTF-8 encoded 16-column CSV template string with BOM for Excel compatibility.
 * Pre-populated with the 127-account Egyptian Unified Chart of Accounts (or custom accounts if provided).
 */
export function generateAccountsCSVTemplate(customAccounts = null) {
  if (Array.isArray(customAccounts) && customAccounts.length > 0) {
    return buildAccountsCSVString(customAccounts.map((a) => normalizeAccountAttributes(a)));
  }
  return buildAccountsCSVString(UPLOADED_CHART_OF_ACCOUNTS_ROWS);
}

/**
 * Robustly parses CSV text (supports both the new 16-column format and legacy 13-column CSVs)
 */
export function parseAccountsCSV(csvText = '') {
  if (!csvText || typeof csvText !== 'string') {
    return { success: false, accounts: [], errors: ['الملف فارغ أو غير صالح'] };
  }

  // Remove BOM if present
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  const rawLines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (rawLines.length < 2) {
    return { success: false, accounts: [], errors: ['الملف لا يحتوي على صفوف بيانات'] };
  }

  const headerLine = rawLines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';

  const parseCSVLine = (text, delim) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delim && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseCSVLine(headerLine, delimiter).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const isNew16ColFormat = headers.includes('statementeffect') || headers.includes('level') || headers.includes('displayorder');
  const accounts = [];
  const errors = [];

  for (let idx = 1; idx < rawLines.length; idx++) {
    const row = parseCSVLine(rawLines[idx], delimiter);
    if (row.length === 0 || row.every((c) => !c)) continue;

    const rowObj = {};
    headers.forEach((h, colIdx) => {
      rowObj[h] = row[colIdx] || '';
    });

    const code = (rowObj.code || row[0] || '').trim();
    const nameAr = (rowObj.namear || rowObj.name || row[1] || '').trim();
    const nameEn = (rowObj.nameen || row[2] || '').trim();
    const levelRaw = (rowObj.level || (isNew16ColFormat ? row[3] : '') || '').trim();
    const typeRaw = (rowObj.type || (isNew16ColFormat ? row[4] : row[3]) || '').trim().toLowerCase();
    const parentCodeRaw = (rowObj.parentcode || rowObj.parent || (isNew16ColFormat ? row[5] : row[9]) || '').trim();
    const statementRaw = (rowObj.statement || (isNew16ColFormat ? row[6] : row[4]) || '').trim().toLowerCase();
    const reportCatRaw = (rowObj.reportcategory || rowObj.category || (isNew16ColFormat ? row[7] : row[5]) || '').trim().toLowerCase();
    const effectRaw = (rowObj.statementeffect || rowObj.effect || (isNew16ColFormat ? row[8] : '') || '').trim().toLowerCase();
    const natureRaw = (rowObj.nature || (isNew16ColFormat ? row[9] : row[7]) || '').trim().toLowerCase();
    const cashFlowRaw = (rowObj.cashflowcategory || rowObj.cashflow || (isNew16ColFormat ? row[10] : row[6]) || '').trim().toLowerCase();
    const subTypeRaw = (rowObj.subtype || (isNew16ColFormat ? row[11] : row[8]) || '').trim().toLowerCase();
    const costCenterRaw = (rowObj.requirescostcenter || (isNew16ColFormat ? row[12] : row[10]) || '').trim().toLowerCase();
    const displayOrderRaw = (rowObj.displayorder || rowObj.order || (isNew16ColFormat ? row[13] : '') || '').trim();
    const descAr = (rowObj.descriptionar || rowObj.notes || (isNew16ColFormat ? row[14] : row[11]) || '').trim();
    const descEn = (rowObj.descriptionen || (isNew16ColFormat ? row[15] : row[12]) || '').trim();

    if (!code) {
      errors.push(`السطر ${idx + 1}: كود الحساب مفقود`);
      continue;
    }
    if (!nameAr) {
      errors.push(`السطر ${idx + 1} (${code}): اسم الحساب بالعربية مفقود`);
      continue;
    }

    // 1. Resolve Statement
    let statement = '';
    if (statementRaw.includes('income') || statementRaw.includes('دخل') || statementRaw.includes('ربح') || statementRaw.includes('خسارة')) {
      statement = 'income_statement';
    } else if (statementRaw.includes('balance') || statementRaw.includes('sheet') || statementRaw.includes('مركز') || statementRaw.includes('ميزان')) {
      statement = 'balance_sheet';
    } else if (['1', '2'].includes(code[0])) {
      statement = 'balance_sheet';
    } else {
      statement = 'income_statement';
    }

    // 2. Resolve Report Category
    let reportCategory = '';
    if (reportCatRaw === 'section_header' || reportCatRaw.includes('header') || reportCatRaw.includes('عنوان') || reportCatRaw.includes('تجميع')) {
      reportCategory = 'section_header';
    } else if (reportCatRaw.includes('fixed') || reportCatRaw.includes('ثابت')) {
      reportCategory = 'fixed_asset';
    } else if (reportCatRaw.includes('current_asset') || reportCatRaw.includes('متداول')) {
      reportCategory = 'current_asset';
    } else if (reportCatRaw.includes('long_term') || reportCatRaw.includes('طويل')) {
      reportCategory = 'long_term_liability';
    } else if (reportCatRaw.includes('current_liability')) {
      reportCategory = 'current_liability';
    } else if (reportCatRaw.includes('liability') || reportCatRaw.includes('التزام') || reportCatRaw.includes('خصوم')) {
      reportCategory = UMBRELLA_ROOT_CODES.has(code) ? 'section_header' : 'current_liability';
    } else if (reportCatRaw.includes('equity') || reportCatRaw.includes('ملكية') || reportCatRaw.includes('رأس')) {
      reportCategory = 'equity';
    } else if (reportCatRaw.includes('operating_revenue') || reportCatRaw.includes('sales') || reportCatRaw.includes('مبيعات')) {
      reportCategory = 'operating_revenue';
    } else if (reportCatRaw.includes('cogs') || reportCatRaw.includes('direct') || reportCatRaw.includes('إنتاج') || reportCatRaw.includes('تشغيل')) {
      reportCategory = 'cogs_direct';
    } else if (reportCatRaw.includes('selling') || reportCatRaw.includes('بيع') || reportCatRaw.includes('توزيع') || reportCatRaw.includes('نقل')) {
      reportCategory = 'selling_expense';
    } else if (reportCatRaw.includes('admin') || reportCatRaw.includes('إداري') || reportCatRaw.includes('عموم')) {
      reportCategory = 'admin_expense';
    } else if (reportCatRaw.includes('financing') || reportCatRaw.includes('تمويل') || reportCatRaw.includes('بنك')) {
      reportCategory = 'financing_expense';
    } else if (reportCatRaw.includes('other') || reportCatRaw.includes('أخرى') || reportCatRaw.includes('فروق')) {
      reportCategory = 'other_revenue_expense';
    } else if (reportCatRaw.includes('revenue') || reportCatRaw.includes('إيراد')) {
      reportCategory = 'operating_revenue';
    } else if (reportCatRaw === 'expense' || reportCatRaw.includes('مصروف')) {
      reportCategory = UMBRELLA_ROOT_CODES.has(code) ? 'section_header' : (code.startsWith('301') ? 'cogs_direct' : 'admin_expense');
    } else if (reportCatRaw === 'asset' || reportCatRaw.includes('أصل')) {
      reportCategory = UMBRELLA_ROOT_CODES.has(code) ? 'section_header' : (code.startsWith('101') ? 'fixed_asset' : 'current_asset');
    }

    // 3. Resolve Cash Flow Category
    let cashFlowCategory = 'operating';
    if (cashFlowRaw.includes('invest') || cashFlowRaw.includes('استثمار')) cashFlowCategory = 'investing';
    else if (cashFlowRaw.includes('financ') || cashFlowRaw.includes('تمويل')) cashFlowCategory = 'financing';
    else if (cashFlowRaw.includes('cash') || cashFlowRaw.includes('نقد') || subTypeRaw === 'safe' || subTypeRaw === 'bank') cashFlowCategory = 'cash_equivalent';
    else cashFlowCategory = 'operating';

    // 4. Resolve Nature
    let nature = '';
    if (natureRaw.includes('credit') || natureRaw.includes('دائن')) nature = 'credit';
    else if (natureRaw.includes('debit') || natureRaw.includes('مدين')) nature = 'debit';

    // 5. Resolve Statement Effect ('add' | 'deduct')
    let statementEffect = '';
    if (effectRaw === 'deduct' || effectRaw === '-' || effectRaw.includes('خصم') || effectRaw.includes('طرح') || effectRaw.includes('عكس') || effectRaw.includes('contra')) {
      statementEffect = 'deduct';
    } else if (effectRaw === 'add' || effectRaw === '+' || effectRaw.includes('إضاف') || effectRaw.includes('جمع')) {
      statementEffect = 'add';
    }

    // 6. Resolve Requires Cost Center
    const requiresCostCenter = ['true', '1', 'yes', 'نعم'].includes(costCenterRaw);

    // 7. Resolve Type
    let type = 'main';
    if (typeRaw.includes('sub') || typeRaw.includes('فرع') || typeRaw.includes('مساعد')) {
      type = 'sub';
    } else if (typeRaw.includes('main') || typeRaw.includes('عام') || typeRaw.includes('رئيس')) {
      type = 'main';
    } else {
      type = Boolean(parentCodeRaw) ? 'sub' : 'main';
    }

    const parsedLevel = parseInt(levelRaw, 10);
    const parsedDisplayOrder = parseInt(displayOrderRaw, 10);

    const normalized = normalizeAccountAttributes({
      code,
      nameAr,
      nameEn: nameEn || nameAr,
      level: !Number.isNaN(parsedLevel) && parsedLevel > 0 ? parsedLevel : undefined,
      type,
      parentCode: parentCodeRaw,
      statement,
      reportCategory,
      statementEffect: statementEffect || undefined,
      cashFlowCategory,
      nature,
      subType: (subTypeRaw || 'cost_center').toLowerCase(),
      requiresCostCenter,
      displayOrder: !Number.isNaN(parsedDisplayOrder) && parsedDisplayOrder > 0 ? parsedDisplayOrder : idx * 10,
      descriptionAr: descAr,
      descriptionEn: descEn
    });

    accounts.push(normalized);
  }

  return {
    success: errors.length === 0,
    accounts,
    errors
  };
}

/**
 * Batch saves or imports accounts into Firestore collection `chart_of_accounts`
 */
export async function batchImportChartOfAccounts(accounts = []) {
  if (!accounts || accounts.length === 0) return { success: true, count: 0 };

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  accounts.forEach((acc) => {
    const normalized = normalizeAccountAttributes(acc);
    const accountRef = doc(db, 'chart_of_accounts', normalized.code || normalized.id);
    batch.set(
      accountRef,
      {
        ...normalized,
        updatedAt: now,
        createdAt: normalized.createdAt || now
      },
      { merge: true }
    );
  });

  await batch.commit();
  return { success: true, count: accounts.length };
}

/**
 * Fetches all accounts from `chart_of_accounts` collection
 */
export async function fetchChartOfAccounts() {
  try {
    const snap = await getDocs(collection(db, 'chart_of_accounts'));
    if (snap.empty) return [];
    return snap.docs.map((d) => normalizeAccountAttributes({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Cash Engine] Error fetching chart of accounts:', err);
    return [];
  }
}

/**
 * Saves a single account into `chart_of_accounts`
 */
export async function saveChartAccount(account) {
  const accountId = account.code || account.id;
  if (!accountId || !account.nameAr) {
    throw new Error('يرجى تحديد كود الحساب واسمه بالعربية');
  }
  const now = new Date().toISOString();
  const normalized = normalizeAccountAttributes(account);
  await setDoc(
    doc(db, 'chart_of_accounts', accountId),
    {
      ...normalized,
      id: accountId,
      updatedAt: now,
      createdAt: account.createdAt || now
    },
    { merge: true }
  );
  return { id: accountId, ...normalized };
}

/**
 * Deletes an account from `chart_of_accounts`
 */
export async function deleteChartAccount(accountId) {
  if (!accountId) return;
  await deleteDoc(doc(db, 'chart_of_accounts', accountId));
}

/**
 * Initializes default safes in Firestore if collection is empty
 */
export async function seedInitialSafesIfEmpty() {
  try {
    const snap = await getDocs(collection(db, 'cash_safes'));
    if (snap.empty) {
      console.debug('[Cash Engine] Seeding initial pre-configured safes...');
      for (const s of INITIAL_PRECONFIGURED_SAFES) {
        await setDoc(doc(db, 'cash_safes', s.id), {
          ...s,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[Cash Engine] Seed error:', err);
    return false;
  }
}

/**
 * Normalizes Safe ID or Bank ID into clean, readable uppercase code
 * e.g. SAFE-01 -> SAFE01, SAFE-02 -> SAFE02, BANK-MISR-01 -> MISR, BANK-QNB-01 -> QNB
 */
export function normalizeSafeOrBankCode(safeId = '') {
  if (!safeId) return 'SAFE01';
  if (safeId.includes('MISR')) return 'MISR';
  if (safeId.includes('QNB')) return 'QNB';
  if (safeId.includes('CIB')) return 'CIB';
  if (safeId.includes('AHLY') || safeId.includes('NBE')) return 'NBE';
  return safeId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Generates formatted date string in YYMMDD format
 * e.g. 2026-10-04 -> 261004
 */
export function formatYYMMDD(date = new Date()) {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Generates formatted month string in YYMM format
 * e.g. "2026-10" or Date -> 2610
 */
export function formatYYMM(monthStrOrDate) {
  if (!monthStrOrDate) {
    const d = new Date();
    return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof monthStrOrDate === 'string' && monthStrOrDate.includes('-')) {
    const parts = monthStrOrDate.split('-');
    const yy = parts[0].slice(-2);
    const mm = parts[1].padStart(2, '0');
    return `${yy}${mm}`;
  }
  const d = new Date(monthStrOrDate);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

/**
 * Calculates next sequential counter for a custody or advance
 * Searches existing ledger records and drafts for matching prefix (e.g. CST-SAFE01-261004-)
 * Returns strictly sequential counter (1, 2, 3...) formatted as 3 digits (001, 002, 003...)
 */
export function calculateNextCustodyCounter({
  type = 'custody_issue',
  safeId = 'SAFE-01',
  date = new Date(),
  existingRecords = [],
  drafts = []
}) {
  const prefix = type === 'custody_issue' ? 'CST' : 'ADV';
  const safeCode = normalizeSafeOrBankCode(safeId);
  const dateStr = formatYYMMDD(date);
  const targetPrefix = `${prefix}-${safeCode}-${dateStr}-`;

  const foundCounters = new Set();

  // 1. Scan existing worker custody records
  if (Array.isArray(existingRecords)) {
    existingRecords.forEach((record) => {
      // Check activeCustodies
      if (record?.activeCustodies && typeof record.activeCustodies === 'object') {
        Object.keys(record.activeCustodies).forEach((id) => {
          if (id && id.startsWith(targetPrefix)) {
            const rawNum = id.replace(targetPrefix, '').split('-')[0];
            const num = parseInt(rawNum, 10);
            if (!isNaN(num) && num > 0) foundCounters.add(num);
          }
        });
      }
      // Check activeAdvances
      if (record?.activeAdvances && typeof record.activeAdvances === 'object') {
        Object.keys(record.activeAdvances).forEach((id) => {
          if (id && id.startsWith(targetPrefix)) {
            const rawNum = id.replace(targetPrefix, '').split('-')[0];
            const num = parseInt(rawNum, 10);
            if (!isNaN(num) && num > 0) foundCounters.add(num);
          }
        });
      }
      // Check history array
      if (Array.isArray(record?.history)) {
        record.history.forEach((h) => {
          const id = h.id || h.voucherId || h.targetCustodyId || h.targetAdvanceId || '';
          if (id && id.startsWith(targetPrefix)) {
            const rawNum = id.replace(targetPrefix, '').split('-')[0];
            const num = parseInt(rawNum, 10);
            if (!isNaN(num) && num > 0) foundCounters.add(num);
          }
        });
      }
    });
  }

  // 2. Scan drafts
  if (Array.isArray(drafts)) {
    drafts.forEach((draft) => {
      const id = draft?.id || draft?.targetDraftId || '';
      if (id && id.startsWith(targetPrefix)) {
        const rawNum = id.replace(targetPrefix, '').split('-')[0];
        const num = parseInt(rawNum, 10);
        if (!isNaN(num) && num > 0) foundCounters.add(num);
      }
    });
  }

  // Filter out any legacy random numbers (> totalFound + 10)
  const countLegit = foundCounters.size;
  const legitCounters = Array.from(foundCounters).filter((n) => n <= countLegit + 10);

  let next = legitCounters.length > 0 ? Math.max(...legitCounters) + 1 : 1;
  // Ensure no collision with any existing ID
  while (foundCounters.has(next)) {
    next++;
  }

  return next;
}

/**
 * Generates SSOT Unique Identifier for Custody or Salary Advance Issuance
 * CST-{SAFE/BANK}-{YYMMDD}-{COUNTER}
 * ADV-{SAFE/BANK}-{YYMMDD}-{COUNTER}
 * e.g. CST-SAFE01-261004-001, CST-SAFE01-261004-002
 */
export function generateCustodyOrAdvanceId({
  type = 'custody_issue',
  safeId = 'SAFE-01',
  date = new Date(),
  counter = null,
  existingRecords = [],
  drafts = []
}) {
  const prefix = type === 'custody_issue' ? 'CST' : 'ADV';
  const safeCode = normalizeSafeOrBankCode(safeId);
  const dateStr = formatYYMMDD(date);

  let nextCounter = 1;
  if (counter !== null && counter !== undefined && !isNaN(Number(counter))) {
    nextCounter = Number(counter);
  } else if ((Array.isArray(existingRecords) && existingRecords.length > 0) || (Array.isArray(drafts) && drafts.length > 0)) {
    nextCounter = calculateNextCustodyCounter({ type, safeId, date, existingRecords, drafts });
  }

  const counterStr = String(nextCounter).padStart(3, '0');
  return `${prefix}-${safeCode}-${dateStr}-${counterStr}`;
}

/**
 * Generates Settlement ID for Custody (Cash Return or Expense Liquidation)
 * STL-{ParentCustodyID}-{SEQ}
 * e.g. STL-CST-SAFE01-261004-001-01
 */
export function generateCustodySettlementId(parentCustodyId, seq = 1) {
  if (!parentCustodyId) return `STL-CST-${Date.now().toString().slice(-6)}`;
  const seqStr = String(seq).padStart(2, '0');
  return `STL-${parentCustodyId}-${seqStr}`;
}

/**
 * Generates Salary Deduction ID for Single Month Advance Repayment
 * DED-{ParentAdvanceID}-{YYMM}
 * e.g. DED-ADV-SAFE02-261004-001-2610
 */
export function generateAdvanceDeductionId(parentAdvanceId, payrollMonth) {
  if (!parentAdvanceId) return `DED-ADV-${Date.now().toString().slice(-6)}`;
  const yymm = formatYYMM(payrollMonth);
  return `DED-${parentAdvanceId}-${yymm}`;
}

/**
 * Generates Installment ID for Scheduled Multi-Month Advance Repayment
 * {ParentAdvanceID}-INS{NN}-{YYMM}
 * e.g. ADV-SAFE02-261004-001-INS01-2610
 */
export function generateAdvanceInstallmentId(parentAdvanceId, installmentNumber = 1, payrollMonth) {
  if (!parentAdvanceId) return `ADV-INS${installmentNumber}-${Date.now().toString().slice(-6)}`;
  const instStr = String(installmentNumber).padStart(2, '0');
  const yymm = formatYYMM(payrollMonth);
  return `${parentAdvanceId}-INS${instStr}-${yymm}`;
}

/**
 * Posts a Cash Voucher transaction atomically into Firestore
 */
export async function postCashVoucher({
  safeId,
  type, // e.g. 'disbursement', 'collection', 'custody_issue', etc.
  amount,
  currency = 'EGP',
  exchangeRate = 1,
  denominations = {},
  mainAccount,
  mainAccountName = '',
  mainAccountNameAr = '',
  accountsMaster = [],
  subAccountId = null,
  subAccountName = '',
  costCenterId = null,
  costCenterName = '',
  supplierAllocation = null,
  taxDocumentType = 'no_document',
  taxDetails = {},
  description = '',
  attachments = [],
  currentUser,
  targetSafeId = null, // for inter-safe transfers
  requiresApproval = false,
  customVoucherId = null,
  ssotId = null,
  targetCustodyId = null,
  targetAdvanceId = null
}) {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('يرجى إدخال مبلغ صحيح أكبر من الصفر');
  }

  const isBank = Boolean(safeId?.startsWith('BANK-'));

  // Validate banknote breakdown if currency is EGP and it's a physical safe
  if (currency === 'EGP' && !isBank) {
    if (!validateBanknoteMatch(numAmount, denominations)) {
      const actualCounted = calculateBanknoteTotal(denominations);
      throw new Error(
        `إجمالي تفقيط الفئات الورقية (${actualCounted.toLocaleString()} ج.م) لا يتطابق مع إجمالي السند (${numAmount.toLocaleString()} ج.م)`
      );
    }
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  
  let voucherId = customVoucherId;
  if (!voucherId) {
    if (type === 'custody_issue' || type === 'salary_advance') {
      voucherId = generateCustodyOrAdvanceId({ type, safeId, date: now });
    } else {
      voucherId = `VCH-${safeId}-${dateStr}-${randSuffix}`;
    }
  }
  const finalSsotId = ssotId || voucherId;

  const typeConfig = CASH_TRANSACTION_TYPES.find((t) => t.id === type) || CASH_TRANSACTION_TYPES[0];
  const isOutflow = typeConfig.direction === 'out';
  const isInflow = typeConfig.direction === 'in';

  // Fiscal Dimensions
  const fiscalYear = now.getFullYear();
  const fiscalPeriod = now.toISOString().slice(0, 7);

  // Promote registered COA child account to effective mainAccount for strict child adherence
  const subCodeCandidate = String(subAccountId || '').trim();
  const isSubRegisteredInCoa = Boolean(
    subCodeCandidate &&
    Array.isArray(accountsMaster) &&
    accountsMaster.some((a) => String(a.code || a.id).trim() === subCodeCandidate)
  );

  let effectiveMainAccount = mainAccount;
  let effectiveParentAccountCode = null;
  if (isSubRegisteredInCoa) {
    effectiveParentAccountCode = mainAccount;
    effectiveMainAccount = subCodeCandidate;
  }

  // Auto-stamp financial statement classification from effectiveMainAccount
  const matchedGl = MAIN_GL_ACCOUNTS.find((a) => a.id === effectiveMainAccount);
  const matchedMaster = Array.isArray(accountsMaster)
    ? accountsMaster.find((a) => String(a.code || a.id).trim() === String(effectiveMainAccount).trim())
    : null;
  const resolvedMainAccountAr =
    (isSubRegisteredInCoa ? subAccountName : null) ||
    mainAccountNameAr ||
    mainAccountName ||
    matchedMaster?.nameAr ||
    matchedGl?.nameAr ||
    effectiveMainAccount;

  const normalizedAccountInfo = normalizeAccountAttributes({
    code: effectiveMainAccount,
    statement: matchedMaster?.statement || matchedGl?.statement,
    reportCategory: matchedMaster?.reportCategory || matchedGl?.reportCategory,
    cashFlowCategory: matchedMaster?.cashFlowCategory || matchedGl?.cashFlowCategory,
    nature: matchedMaster?.nature || matchedGl?.nature
  });

  // Bank Account Direct Execution (No physical banknote vault mutation)
  if (isBank) {
    const bankAccount = CORPORATE_BANK_ACCOUNTS.find((b) => b.id === safeId);
    const voucherData = {
      id: voucherId,
      safeId,
      bankAccountId: safeId,
      bankAccountNameAr: bankAccount?.bankNameAr || safeId,
      bankAccountNameEn: bankAccount?.bankNameEn || safeId,
      isBank: true,
      type,
      typeAr: typeConfig.labelAr,
      direction: typeConfig.direction,
      status: 'posted',
      amount: numAmount,
      currency,
      exchangeRate: Number(exchangeRate) || 1,
      amountInEGP: currency === 'EGP' ? numAmount : numAmount * (Number(exchangeRate) || 1),
      denominations: {},
      mainAccount: effectiveMainAccount,
      parentAccountCode: effectiveParentAccountCode,
      mainAccountAr: resolvedMainAccountAr,
      statement: normalizedAccountInfo.statement,
      reportCategory: normalizedAccountInfo.reportCategory,
      cashFlowCategory: normalizedAccountInfo.cashFlowCategory,
      nature: normalizedAccountInfo.nature,
      fiscalYear,
      fiscalPeriod,
      costCenterId,
      costCenterName,
      subAccountId,
      subAccountName,
      supplierAllocation,
      taxDocumentType,
      taxDetails,
      description,
      attachments,
      issuedByUserId: currentUser.id,
      issuedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    await setDoc(doc(db, 'cash_transactions', voucherId), {
      ...voucherData,
      ssotId: finalSsotId,
      targetCustodyId,
      targetAdvanceId
    });

    if (subAccountId && (type === 'custody_issue' || type === 'custody_settle' || type === 'salary_advance' || type === 'advance_settle')) {
      await updateCustodyLedgerAfterVoucher({
        workerId: subAccountId,
        workerName: subAccountName,
        voucherId,
        ssotId: finalSsotId,
        targetCustodyId,
        targetAdvanceId,
        type,
        amount: numAmount,
        description: `${description || ''} (${bankAccount?.bankNameAr || safeId})`,
        safeId,
        attachments
      }).catch((e) => console.warn('[Custody Ledger Sync Error]:', e));
    }

    return { success: true, voucherId, status: 'posted' };
  }

  const safeRef = doc(db, 'cash_safes', safeId);

  // If requires approval, create voucher in pending_approval state without mutating safe balance
  if (requiresApproval) {
    const pendingVoucher = {
      id: voucherId,
      safeId,
      type,
      typeAr: typeConfig.labelAr,
      direction: typeConfig.direction,
      status: 'pending_approval',
      amount: numAmount,
      currency,
      exchangeRate: Number(exchangeRate) || 1,
      amountInEGP: currency === 'EGP' ? numAmount : numAmount * (Number(exchangeRate) || 1),
      denominations,
      mainAccount: effectiveMainAccount,
      parentAccountCode: effectiveParentAccountCode,
      mainAccountAr: resolvedMainAccountAr,
      statement: normalizedAccountInfo.statement,
      reportCategory: normalizedAccountInfo.reportCategory,
      cashFlowCategory: normalizedAccountInfo.cashFlowCategory,
      nature: normalizedAccountInfo.nature,
      fiscalYear,
      fiscalPeriod,
      costCenterId,
      costCenterName,
      subAccountId,
      subAccountName,
      supplierAllocation,
      taxDocumentType,
      taxDetails,
      description,
      attachments,
      targetSafeId,
      issuedByUserId: currentUser.id,
      issuedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    await setDoc(doc(db, 'cash_transactions', voucherId), pendingVoucher);

    // Push action required to authorizer or general admin
    await createActionRequired({
      actionType: 'approve_cash_voucher',
      docId: voucherId,
      title: `مطلوب اعتماد سند ${typeConfig.labelAr}: ${voucherId}`,
      details: `مبلغ ${numAmount.toLocaleString()} ${currency} من ${safeId} لحساب ${subAccountName || mainAccount}`,
      targetModule: 'cash_treasury',
      targetTab: safeId.toLowerCase().replace('-', '_'),
      highlightId: voucherId,
      targetRoles: ['general_admin'],
      createdBy: currentUser.id
    });

    return { success: true, voucherId, status: 'pending_approval' };
  }

  // Atomic Execution: Read safe, verify balance & notes, update balances, and commit voucher
  await runTransaction(db, async (transaction) => {
    const safeSnap = await transaction.get(safeRef);
    if (!safeSnap.exists()) {
      throw new Error(`الخزينة (${safeId}) غير موجودة في قاعدة البيانات`);
    }

    const safeData = safeSnap.data();
    const currWallet = safeData.balances?.[currency] || { currentBalance: 0, denominations: {} };
    const currentBal = Number(currWallet.currentBalance) || 0;
    const currentDenoms = currWallet.denominations || {};

    if (isOutflow) {
      if (currentBal < numAmount) {
        throw new Error(
          `رصيد الخزينة الحالي (${currentBal.toLocaleString()} ${currency}) لا يكفي لصرف مبلغ (${numAmount.toLocaleString()} ${currency})`
        );
      }

      if (currency === 'EGP') {
        const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, true);
        if (!sufficiency.isSufficient) {
          const detailStr = sufficiency.shortages
            .map((s) => `فئة ${s.denom} ج (المطلوب صرفها: ${s.requested}، المتوفر: ${s.available})`)
            .join('، ');
          throw new Error(`الفئات الورقية المتوفرة بالخزينة لا تكفي لإتمام الصرف: ${detailStr}`);
        }
      }
    } else if (isInflow) {
      if (currency === 'EGP') {
        const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, false);
        if (!sufficiency.isSufficient) {
          const detailStr = sufficiency.shortages
            .map((s) => `فئة ${s.denom} ج (المطلوب ردها كفكة: ${s.requested}، المتوفر بالخزينة: ${s.available})`)
            .join('، ');
          throw new Error(`الفئات الورقية المتوفرة بالخزينة لا تكفي لرد الفكة المطلوبة: ${detailStr}`);
        }
      }
    }

    // Compute updated balances
    const newBal = isOutflow ? currentBal - numAmount : (isInflow ? currentBal + numAmount : currentBal);
    const newDenoms = { ...currentDenoms };

    if (currency === 'EGP') {
      for (const denom of EGP_DENOMINATIONS) {
        const count = Number(denominations[denom]) || 0;
        const currentCount = Number(newDenoms[denom]) || 0;
        if (isOutflow) {
          newDenoms[denom] = Math.max(0, currentCount - count);
        } else if (isInflow) {
          newDenoms[denom] = Math.max(0, currentCount + count);
        }
      }
    }

    // Commit safe balance update
    const safeUpdatePayload = {
      [`balances.${currency}.currentBalance`]: newBal,
      [`balances.${currency}.denominations`]: newDenoms,
      updatedAt: now.toISOString()
    };
    if (currency === 'EGP') {
      safeUpdatePayload.currentBalance = newBal;
      safeUpdatePayload.balance = newBal;
      safeUpdatePayload.denominations = newDenoms;
    }
    transaction.update(safeRef, safeUpdatePayload);

    // Commit voucher record
    const voucherDocRef = doc(db, 'cash_transactions', voucherId);
    transaction.set(voucherDocRef, {
      id: voucherId,
      ssotId: finalSsotId,
      targetCustodyId,
      targetAdvanceId,
      safeId,
      type,
      typeAr: typeConfig.labelAr,
      direction: typeConfig.direction,
      status: 'posted',
      amount: numAmount,
      currency,
      exchangeRate: Number(exchangeRate) || 1,
      amountInEGP: currency === 'EGP' ? numAmount : numAmount * (Number(exchangeRate) || 1),
      denominations,
      mainAccount: effectiveMainAccount,
      parentAccountCode: effectiveParentAccountCode,
      mainAccountAr: resolvedMainAccountAr,
      statement: normalizedAccountInfo.statement,
      reportCategory: normalizedAccountInfo.reportCategory,
      cashFlowCategory: normalizedAccountInfo.cashFlowCategory,
      nature: normalizedAccountInfo.nature,
      fiscalYear,
      fiscalPeriod,
      costCenterId,
      costCenterName,
      subAccountId,
      subAccountName,
      supplierAllocation,
      taxDocumentType,
      taxDetails,
      description,
      attachments,
      targetSafeId,
      issuedByUserId: currentUser.id,
      issuedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      approvedByUserId: currentUser.id,
      approvedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      approvedAt: now.toISOString(),
      balanceAfter: newBal,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // If Inter-Safe Transfer, credit recipient safe
    if (type === 'safe_transfer' && targetSafeId) {
      const targetSafeRef = doc(db, 'cash_safes', targetSafeId);
      const targetSnap = await transaction.get(targetSafeRef);
      if (targetSnap.exists()) {
        const targetData = targetSnap.data();
        const targetCurr = targetData.balances?.[currency] || { currentBalance: 0, denominations: {} };
        const targetBal = Number(targetCurr.currentBalance) || 0;
        const targetDenoms = { ...(targetCurr.denominations || {}) };

        if (currency === 'EGP') {
          for (const denom of EGP_DENOMINATIONS) {
            const count = Number(denominations[denom]) || 0;
            targetDenoms[denom] = (Number(targetDenoms[denom]) || 0) + count;
          }
        }

        const nextTargetBal = targetBal + numAmount;
        const targetUpdatePayload = {
          [`balances.${currency}.currentBalance`]: nextTargetBal,
          [`balances.${currency}.denominations`]: targetDenoms,
          updatedAt: now.toISOString()
        };
        if (currency === 'EGP') {
          targetUpdatePayload.currentBalance = nextTargetBal;
          targetUpdatePayload.balance = nextTargetBal;
          targetUpdatePayload.denominations = targetDenoms;
        }
        transaction.update(targetSafeRef, targetUpdatePayload);
      }
    }
  });

  // Post-Transaction Side Effects: Update Custody Ledger if custody/advance
  if (subAccountId && (type === 'custody_issue' || type === 'custody_settle' || type === 'salary_advance' || type === 'advance_settle')) {
    await updateCustodyLedgerAfterVoucher({
      workerId: subAccountId,
      workerName: subAccountName,
      voucherId,
      ssotId: finalSsotId,
      targetCustodyId,
      targetAdvanceId,
      type,
      amount: numAmount,
      description,
      safeId,
      attachments
    }).catch((e) => console.warn('[Custody Ledger Sync Error]:', e));
  }

  return { success: true, voucherId, status: 'posted' };
}

/**
 * Initiates an Inter-Safe Cash Transfer with Two-Party Custody Handshake.
 * Deducts cash from the Source Safe immediately (custody dispatched),
 * stages the transaction with status: 'pending_receiver_approval',
 * and creates an Action Required for the Target Safe's responsible custodian.
 */
export async function initiateInterSafeTransfer({
  sourceSafeId,
  targetSafeId,
  amount,
  currency = 'EGP',
  denominations = {},
  description = '',
  attachments = [],
  currentUser
}) {
  if (!sourceSafeId || !targetSafeId) {
    throw new Error('يرجى تحديد الخزينة المصدر والخزينة المستلمة');
  }
  if (sourceSafeId === targetSafeId) {
    throw new Error('لا يمكن التحويل لنفس الخزينة');
  }

  const numAmount = Number(amount) || 0;
  if (numAmount <= 0) {
    throw new Error('مبلغ التحويل يجب أن يكون أكبر من الصفر');
  }

  if (currency === 'EGP') {
    const isBalanced = validateBanknoteMatch(numAmount, denominations);
    if (!isBalanced) {
      throw new Error('إجمالي الفئات الورقية لا يتطابق مع مبلغ التحويل');
    }
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const voucherId = `TRF-${sourceSafeId.toUpperCase()}-${dateStr}-${Date.now().toString().slice(-4)}`;

  const sourceSafeRef = doc(db, 'cash_safes', sourceSafeId);
  const targetSafeRef = doc(db, 'cash_safes', targetSafeId);
  const voucherRef = doc(db, 'cash_transactions', voucherId);

  let targetSafeData = null;
  let sourceSafeData = null;

  await runTransaction(db, async (transaction) => {
    const sourceSnap = await transaction.get(sourceSafeRef);
    if (!sourceSnap.exists()) {
      throw new Error(`الخزينة المصدر (${sourceSafeId}) غير موجودة`);
    }
    sourceSafeData = sourceSnap.data();

    const targetSnap = await transaction.get(targetSafeRef);
    if (!targetSnap.exists()) {
      throw new Error(`الخزينة المستلمة (${targetSafeId}) غير موجودة`);
    }
    targetSafeData = targetSnap.data();

    // Verify source wallet balance
    const sourceWallet = sourceSafeData.balances?.[currency] || { currentBalance: 0, denominations: {} };
    const currentBal = Number(sourceWallet.currentBalance) || 0;
    const currentDenoms = { ...(sourceWallet.denominations || {}) };

    if (currentBal < numAmount) {
      throw new Error(
        `رصيد الخزينة المصدر (${currentBal.toLocaleString()} ${currency}) لا يكفي لتحويل (${numAmount.toLocaleString()} ${currency})`
      );
    }

    // Verify banknote sufficiency in source safe
    if (currency === 'EGP') {
      const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, true);
      if (!sufficiency.isSufficient) {
        const detailStr = sufficiency.shortages
          .map((s) => `فئة ${s.denom} ج (المطلوب: ${s.requested}، المتوفر: ${s.available})`)
          .join('، ');
        throw new Error(`الفئات الورقية المتوفرة بالخزينة المصدر لا تكفي: ${detailStr}`);
      }

      // Check if any negative denominations require notes from target safe (change return)
      const targetWallet = targetSafeData.balances?.[currency] || { currentBalance: 0, denominations: {} };
      const targetDenoms = targetWallet.denominations || {};
      const targetShortages = [];
      for (const denom of EGP_DENOMINATIONS) {
        const count = Number(denominations[denom]) || 0;
        if (count < 0) {
          const neededFromTarget = -count;
          const availableInTarget = Number(targetDenoms[denom]) || 0;
          if (neededFromTarget > availableInTarget) {
            targetShortages.push(`فئة ${denom} ج (المطلوب كفكة من الخزينة المستلمة: ${neededFromTarget}، المتوفر: ${availableInTarget})`);
          }
        }
      }
      if (targetShortages.length > 0) {
        throw new Error(`الفئات الورقية المطلوب استردادها كفكة غير متوفرة بالخزينة المستلمة: ${targetShortages.join('، ')}`);
      }

      // Decrement notes from source safe (positive counts leave source safe; negative counts enter source safe)
      for (const denom of EGP_DENOMINATIONS) {
        const count = Number(denominations[denom]) || 0;
        currentDenoms[denom] = Math.max(0, (Number(currentDenoms[denom]) || 0) - count);
      }
    }

    const newSourceBal = Math.max(0, currentBal - numAmount);

    // Update Source Safe (money physically leaves source custody)
    const sourceUpdatePayload = {
      [`balances.${currency}.currentBalance`]: newSourceBal,
      [`balances.${currency}.denominations`]: currentDenoms,
      updatedAt: now.toISOString()
    };
    if (currency === 'EGP') {
      sourceUpdatePayload.currentBalance = newSourceBal;
      sourceUpdatePayload.balance = newSourceBal;
      sourceUpdatePayload.denominations = currentDenoms;
    }
    transaction.update(sourceSafeRef, sourceUpdatePayload);

    const sourceNameAr = sourceSafeData.nameAr || sourceSafeId;
    const sourceNameEn = sourceSafeData.nameEn || sourceSafeData.nameAr || sourceSafeId;
    const targetNameAr = targetSafeData.nameAr || targetSafeId;
    const targetNameEn = targetSafeData.nameEn || targetSafeData.nameAr || targetSafeId;

    const defaultDesc = `تحويل سيولة نقدية من ${sourceNameAr} إلى ${targetNameAr}`;

    // Stage transaction doc with pending_receiver_approval status
    transaction.set(voucherRef, {
      id: voucherId,
      voucherNumber: voucherId,
      type: 'safe_transfer',
      typeAr: 'تحويل بين الخزائن',
      typeEn: 'Inter-Safe Transfer',
      status: 'pending_receiver_approval',
      direction: 'out',
      safeId: sourceSafeId,
      sourceSafeId,
      sourceSafeNameAr: sourceNameAr,
      sourceSafeNameEn: sourceNameEn,
      targetSafeId,
      targetSafeNameAr: targetNameAr,
      targetSafeNameEn: targetNameEn,
      amount: numAmount,
      amountInEGP: numAmount,
      currency,
      exchangeRate: 1,
      denominations,
      mainAccount: '1020101',
      mainAccountAr: 'تحويلات داخلية بين الخزائن',
      mainAccountEn: 'Internal Safe Transfers',
      description: description.trim() || defaultDesc,
      attachments: attachments || [],
      // Two-party audit trail
      sourceCustodianId: sourceSafeData.responsibleUserId || currentUser.id,
      targetCustodianId: targetSafeData.responsibleUserId || '',
      targetAuthorizerId: targetSafeData.authorizerUserId || '',
      issuedByUserId: currentUser.id,
      issuedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      initiatedByUserId: currentUser.id,
      initiatedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      initiatedAt: now.toISOString(),
      balanceAfter: newSourceBal,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  });

  // Create Action Required for the Target Safe custodian (and General Admin)
  const targetCustodianId = targetSafeData?.responsibleUserId || null;
  const sourceName = sourceSafeData?.nameAr || sourceSafeId;
  const targetName = targetSafeData?.nameAr || targetSafeId;

  await createActionRequired({
    actionType: 'confirm_inter_safe_transfer',
    docId: voucherId,
    docNumber: voucherId,
    title: `مطلوب استلام وتأكيد تحويل نقدي: ${voucherId}`,
    titleEn: `Cash Transfer Receipt Confirmation Required: ${voucherId}`,
    message: `تحويل مبلغ ${numAmount.toLocaleString()} ${currency} من [${sourceName}] إلى [${targetName}] بانتظار استلامك وتأكيد الفئات بالخزينة.`,
    messageEn: `Transfer of ${numAmount.toLocaleString()} ${currency} from [${sourceName}] to [${targetName}] awaiting receipt.`,
    targetTab: 'cash_safes',
    targetModule: 'finance',
    highlightId: voucherId,
    targetUserId: targetCustodianId,
    targetUserIds: targetCustodianId ? [targetCustodianId] : [],
    targetRoles: ['general_admin'],
    createdBy: currentUser.id,
    createdByName: currentUser.name || currentUser.nameAr || currentUser.id,
    metadata: {
      sourceSafeId,
      targetSafeId,
      amount: numAmount,
      currency
    }
  }).catch((e) => console.warn('[Action Required Error]:', e));

  return {
    success: true,
    voucherId,
    status: 'pending_receiver_approval',
    message: `تم خصم المبلغ من ${sourceName} وإرسال إشعار استلام لمسؤول ${targetName}`
  };
}

/**
 * Confirms receipt of an Inter-Safe Transfer by the target safe custodian.
 * Credits the target safe's balance and denominations, sets voucher status to 'posted',
 * and resolves the pending action required.
 */
export async function confirmInterSafeTransfer({
  voucherId,
  currentUser
}) {
  if (!voucherId) throw new Error('معرف السند غير صالح');

  const now = new Date();
  const voucherRef = doc(db, 'cash_transactions', voucherId);

  await runTransaction(db, async (transaction) => {
    const vSnap = await transaction.get(voucherRef);
    if (!vSnap.exists()) {
      throw new Error(`سند التحويل (${voucherId}) غير موجود`);
    }
    const voucher = vSnap.data();

    if (voucher.status !== 'pending_receiver_approval') {
      throw new Error(`حالة التحويل الحالية (${voucher.status}) لا تسمح بالتأكيد`);
    }

    const targetSafeId = voucher.targetSafeId;
    const targetSafeRef = doc(db, 'cash_safes', targetSafeId);
    const targetSnap = await transaction.get(targetSafeRef);
    if (!targetSnap.exists()) {
      throw new Error(`الخزينة المستلمة (${targetSafeId}) غير موجودة`);
    }
    const targetSafeData = targetSnap.data();

    const currency = voucher.currency || 'EGP';
    const numAmount = Number(voucher.amount) || 0;
    const targetWallet = targetSafeData.balances?.[currency] || { currentBalance: 0, denominations: {} };
    const currentTargetBal = Number(targetWallet.currentBalance) || 0;
    const targetDenoms = { ...(targetWallet.denominations || {}) };

    if (currency === 'EGP') {
      for (const denom of EGP_DENOMINATIONS) {
        const count = Number(voucher.denominations?.[denom]) || 0;
        targetDenoms[denom] = Math.max(0, (Number(targetDenoms[denom]) || 0) + count);
      }
    }

    const newTargetBal = currentTargetBal + numAmount;

    // Credit Target Safe
    const targetUpdatePayload = {
      [`balances.${currency}.currentBalance`]: newTargetBal,
      [`balances.${currency}.denominations`]: targetDenoms,
      updatedAt: now.toISOString()
    };
    if (currency === 'EGP') {
      targetUpdatePayload.currentBalance = newTargetBal;
      targetUpdatePayload.balance = newTargetBal;
      targetUpdatePayload.denominations = targetDenoms;
    }
    transaction.update(targetSafeRef, targetUpdatePayload);

    // Update Voucher to posted
    transaction.update(voucherRef, {
      status: 'posted',
      receivedByUserId: currentUser.id,
      receivedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      receivedAt: now.toISOString(),
      approvedByUserId: currentUser.id,
      approvedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      approvedAt: now.toISOString(),
      targetBalanceAfter: newTargetBal,
      updatedAt: now.toISOString()
    });
  });

  // Complete action required
  await completeActionRequired({
    actionType: 'confirm_inter_safe_transfer',
    docId: voucherId,
    completedBy: currentUser.id
  }).catch((e) => console.warn('[Complete Action Error]:', e));

  return { success: true, voucherId, status: 'posted' };
}

/**
 * Rejects an incoming Inter-Safe Transfer.
 * Refunds the transferred funds and denominations back to the Source Safe,
 * marks the voucher as 'rejected', and resolves the action required.
 */
export async function rejectInterSafeTransfer({
  voucherId,
  reason = '',
  currentUser
}) {
  if (!voucherId) throw new Error('معرف السند غير صالح');

  const now = new Date();
  const voucherRef = doc(db, 'cash_transactions', voucherId);

  await runTransaction(db, async (transaction) => {
    const vSnap = await transaction.get(voucherRef);
    if (!vSnap.exists()) {
      throw new Error(`سند التحويل (${voucherId}) غير موجود`);
    }
    const voucher = vSnap.data();

    if (voucher.status !== 'pending_receiver_approval') {
      throw new Error(`حالة التحويل الحالية (${voucher.status}) لا تسمح بالرفض`);
    }

    const sourceSafeId = voucher.sourceSafeId || voucher.safeId;
    const sourceSafeRef = doc(db, 'cash_safes', sourceSafeId);
    const sourceSnap = await transaction.get(sourceSafeRef);
    if (!sourceSnap.exists()) {
      throw new Error(`الخزينة المصدر (${sourceSafeId}) غير موجودة لإعادة الأموال`);
    }
    const sourceSafeData = sourceSnap.data();

    const currency = voucher.currency || 'EGP';
    const numAmount = Number(voucher.amount) || 0;
    const sourceWallet = sourceSafeData.balances?.[currency] || { currentBalance: 0, denominations: {} };
    const currentSourceBal = Number(sourceWallet.currentBalance) || 0;
    const sourceDenoms = { ...(sourceWallet.denominations || {}) };

    if (currency === 'EGP') {
      for (const denom of EGP_DENOMINATIONS) {
        const count = Number(voucher.denominations?.[denom]) || 0;
        sourceDenoms[denom] = Math.max(0, (Number(sourceDenoms[denom]) || 0) + count);
      }
    }

    const refundedBal = currentSourceBal + numAmount;

    // Refund Source Safe
    const refundPayload = {
      [`balances.${currency}.currentBalance`]: refundedBal,
      [`balances.${currency}.denominations`]: sourceDenoms,
      updatedAt: now.toISOString()
    };
    if (currency === 'EGP') {
      refundPayload.currentBalance = refundedBal;
      refundPayload.balance = refundedBal;
      refundPayload.denominations = sourceDenoms;
    }
    transaction.update(sourceSafeRef, refundPayload);

    // Update Voucher to rejected
    transaction.update(voucherRef, {
      status: 'rejected',
      rejectedByUserId: currentUser.id,
      rejectedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      rejectedReason: reason.trim() || 'تم رفض استلام التحويل من قبل مسؤول الخزينة المستلمة',
      rejectedAt: now.toISOString(),
      refundedBalanceAfter: refundedBal,
      updatedAt: now.toISOString()
    });
  });

  // Complete action required
  await completeActionRequired({
    actionType: 'confirm_inter_safe_transfer',
    docId: voucherId,
    completedBy: currentUser.id
  }).catch((e) => console.warn('[Complete Action Error]:', e));

  return { success: true, voucherId, status: 'rejected' };
}

/**
 * Executes a zero-sum "فكة وتظبيط فئات" change exchange inside a safe
 */
export async function executeChangeExchange({
  safeId,
  notesGivenOut = {}, // e.g. { '200': 1 }
  notesTakenIn = {},   // e.g. { '100': 2 }
  notes = '',
  currentUser
}) {
  const outTotal = calculateBanknoteTotal(notesGivenOut);
  const inTotal = calculateBanknoteTotal(notesTakenIn);

  if (Math.abs(outTotal - inTotal) > 0.005) {
    throw new Error(
      `عملية الفكة يجب أن تكون متوازنة القيمة تماماً: الخارج (${outTotal} ج.م) لا يساوي الداخل (${inTotal} ج.م)`
    );
  }

  if (outTotal <= 0) {
    throw new Error('يرجى تحديد الفئات المراد فكها واستبدالها');
  }

  const safeRef = doc(db, 'cash_safes', safeId);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const voucherId = `VCH-${safeId}-${dateStr}-EXCH-${randSuffix}`;

  await runTransaction(db, async (transaction) => {
    const safeSnap = await transaction.get(safeRef);
    if (!safeSnap.exists()) throw new Error('الخزينة غير موجودة');

    const safeData = safeSnap.data();
    const currWallet = safeData.balances?.EGP || { currentBalance: 0, denominations: {} };
    const currentDenoms = currWallet.denominations || {};

    // Verify sufficient notes for the ones leaving
    const sufficiency = checkSufficientBanknotes(currentDenoms, notesGivenOut);
    if (!sufficiency.isSufficient) {
      const detailStr = sufficiency.shortages
        .map((s) => `فئة ${s.denom} ج (المطلوب: ${s.requested}، المتوفر: ${s.available})`)
        .join('، ');
      throw new Error(`الفئات المراد فكها غير متوفرة بالكامل في الخزينة: ${detailStr}`);
    }

    const updatedDenoms = { ...currentDenoms };
    for (const denom of EGP_DENOMINATIONS) {
      const outC = Number(notesGivenOut[denom]) || 0;
      const inC = Number(notesTakenIn[denom]) || 0;
      const currentC = Number(updatedDenoms[denom]) || 0;
      updatedDenoms[denom] = Math.max(0, currentC - outC + inC);
    }

    // Update Safe Denominations (Balance stays identical)
    transaction.update(safeRef, {
      'balances.EGP.denominations': updatedDenoms,
      denominations: updatedDenoms,
      updatedAt: now.toISOString()
    });

    // Commit Change Exchange Voucher
    const voucherDocRef = doc(db, 'cash_transactions', voucherId);
    transaction.set(voucherDocRef, {
      id: voucherId,
      safeId,
      type: 'change_exchange',
      typeAr: 'فكة وتظبيط فئات',
      direction: 'zero_sum',
      status: 'posted',
      amount: outTotal,
      currency: 'EGP',
      exchangeRate: 1,
      amountInEGP: outTotal,
      denominations: notesTakenIn,
      changeExchangeDetails: {
        notesGivenOut,
        notesTakenIn
      },
      mainAccount: '1020101',
      mainAccountAr: 'فكة وتظبيط فئات نقدية',
      description: notes || 'عملية فكة وتبديل فئات ورقية داخل الخزينة',
      issuedByUserId: currentUser.id,
      issuedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      approvedByUserId: currentUser.id,
      approvedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      balanceAfter: currWallet.currentBalance,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  });

  return { success: true, voucherId };
}

/**
 * Audits a physical safe count and generates an automated discrepancy adjustment voucher if needed
 */
export async function executeSafeCountAuditAndAdjustment({
  safeId,
  countedDenominations = {},
  notes = '',
  currentUser,
  accountingLinks = null
}) {
  const countedTotal = calculateBanknoteTotal(countedDenominations);
  const safeRef = doc(db, 'cash_safes', safeId);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const countSessionId = `COUNT-${safeId}-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  let adjustmentVoucherId = null;

  await runTransaction(db, async (transaction) => {
    const safeSnap = await transaction.get(safeRef);
    if (!safeSnap.exists()) throw new Error('الخزينة غير موجودة');

    const safeData = safeSnap.data();
    const currWallet = safeData.balances?.EGP || { currentBalance: 0, denominations: {} };
    const bookTotal = Number(currWallet.currentBalance) || 0;
    const variance = countedTotal - bookTotal;

    // If variance exists, create automated adjustment voucher
    if (Math.abs(variance) >= 0.01) {
      const isSurplus = variance > 0;
      const absVariance = Math.abs(variance);
      const discrepancyCode = accountingLinks?.cashDiscrepancyAccount?.primaryCode || (isSurplus ? '4010204' : '3020209');
      const discrepancyName = isSurplus
        ? (accountingLinks?.cashDiscrepancyAccount?.nameAr || 'أرباح وفروق تسوية جرد الخزينة (زيادة نقدية)')
        : (accountingLinks?.cashDiscrepancyAccount?.nameAr || 'عجز وفروق تسوية جرد الخزينة (عجز نقدي)');

      adjustmentVoucherId = `VCH-${safeId}-${dateStr}-ADJ-${Math.floor(1000 + Math.random() * 9000)}`;

      const adjRef = doc(db, 'cash_transactions', adjustmentVoucherId);
      transaction.set(adjRef, {
        id: adjustmentVoucherId,
        safeId,
        type: 'balance_adjustment',
        typeAr: isSurplus ? 'تظبيط رصيد (زيادة خزينة)' : 'تظبيط رصيد (عجز خزينة)',
        direction: isSurplus ? 'in' : 'out',
        status: 'posted',
        amount: absVariance,
        currency: 'EGP',
        exchangeRate: 1,
        amountInEGP: absVariance,
        denominations: countedDenominations,
        mainAccount: discrepancyCode,
        mainAccountAr: discrepancyName,
        description: `تسوية جرد فعلي (${isSurplus ? 'زيادة' : 'عجز'} بقيمة ${absVariance.toLocaleString()} ج.م): ${notes}`,
        issuedByUserId: currentUser.id,
        issuedByName: currentUser.name || currentUser.nameAr || currentUser.id,
        approvedByUserId: currentUser.id,
        approvedByName: currentUser.name || currentUser.nameAr || currentUser.id,
        balanceAfter: countedTotal,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    }

    // Set safe balance and denominations directly to the verified physical count
    transaction.update(safeRef, {
      'balances.EGP.currentBalance': countedTotal,
      'balances.EGP.denominations': countedDenominations,
      currentBalance: countedTotal,
      balance: countedTotal,
      denominations: countedDenominations,
      updatedAt: now.toISOString()
    });

    // Record formal audit session
    const sessionRef = doc(db, 'cash_count_sessions', countSessionId);
    transaction.set(sessionRef, {
      id: countSessionId,
      safeId,
      auditDate: now.toISOString(),
      auditorUserId: currentUser.id,
      auditorName: currentUser.name || currentUser.nameAr || currentUser.id,
      countedAmount: countedTotal,
      bookAmount: bookTotal,
      variance,
      denominationsCount: countedDenominations,
      adjustmentTransactionId: adjustmentVoucherId,
      notes: notes || (variance === 0 ? 'جرد فعلي مطابق للدفاتر بالكامل' : `تم تسوية فارق قدره ${variance} ج.م`),
      status: variance === 0 ? 'verified_balanced' : 'adjusted_with_voucher',
      createdAt: now.toISOString()
    });
  });

  return { success: true, countSessionId, adjustmentVoucherId, countedTotal };
}

/**
 * Reverses a posted cash voucher atomically and restores banknote counts
 */
export async function reverseCashVoucher({
  voucherId,
  reason = '',
  currentUser
}) {
  const voucherRef = doc(db, 'cash_transactions', voucherId);
  const now = new Date();

  await runTransaction(db, async (transaction) => {
    const voucherSnap = await transaction.get(voucherRef);
    if (!voucherSnap.exists()) throw new Error('السند غير موجود');

    const v = voucherSnap.data();
    if (v.status !== 'posted') {
      throw new Error(`لا يمكن إلغاء سند بحالة (${v.status})`);
    }

    const safeRef = doc(db, 'cash_safes', v.safeId);
    const safeSnap = await transaction.get(safeRef);
    if (!safeSnap.exists()) throw new Error('الخزينة غير موجودة');

    const safeData = safeSnap.data();
    const currWallet = safeData.balances?.[v.currency] || { currentBalance: 0, denominations: {} };
    const currentBal = Number(currWallet.currentBalance) || 0;
    const currentDenoms = { ...(currWallet.denominations || {}) };

    // Reverse financial direction
    const isOriginalOutflow = v.direction === 'out';
    const isOriginalInflow = v.direction === 'in';
    const restoredBal = isOriginalOutflow ? currentBal + v.amount : (isOriginalInflow ? currentBal - v.amount : currentBal);

    if (v.currency === 'EGP' && v.denominations) {
      for (const denom of EGP_DENOMINATIONS) {
        const count = Number(v.denominations[denom]) || 0;
        const currentCount = Number(currentDenoms[denom]) || 0;
        if (isOriginalOutflow) {
          currentDenoms[denom] = Math.max(0, currentCount + count);
        } else if (isOriginalInflow) {
          currentDenoms[denom] = Math.max(0, currentCount - count);
        }
      }
    }

    // Update safe
    const reverseSafePayload = {
      [`balances.${v.currency}.currentBalance`]: restoredBal,
      [`balances.${v.currency}.denominations`]: currentDenoms,
      updatedAt: now.toISOString()
    };
    if (v.currency === 'EGP') {
      reverseSafePayload.currentBalance = restoredBal;
      reverseSafePayload.balance = restoredBal;
      reverseSafePayload.denominations = currentDenoms;
    }
    transaction.update(safeRef, reverseSafePayload);

    // Mark voucher reversed
    transaction.update(voucherRef, {
      status: 'reversed',
      isReversed: true,
      reversalReason: reason,
      reversedByUserId: currentUser.id,
      reversedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      reversedAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  });

  return { success: true };
}

/**
 * Updates Custodian Ledger when custody or advance vouchers are issued or settled
 * Tracks individual active items and global SSOT collection `custodies_and_advances`
 */
export async function updateCustodyLedgerAfterVoucher({
  workerId,
  workerName,
  voucherId,
  ssotId = null,
  targetCustodyId = null,
  targetAdvanceId = null,
  type,
  amount,
  description = '',
  safeId = '',
  items = [],
  payrollMonth = null,
  installments = [],
  attachments = []
}) {
  const finalId = ssotId || voucherId;
  const custodyRef = doc(db, 'custody_ledger', `CUST-${workerId}`);
  const snap = await getDoc(custodyRef);

  let currentCustody = 0;
  let currentAdvance = 0;
  let activeCustodies = {};
  let activeAdvances = {};
  let history = [];

  if (snap.exists()) {
    const data = snap.data();
    currentCustody = Number(data.currentCustodyBalance) || 0;
    currentAdvance = Number(data.currentAdvanceBalance) || 0;
    activeCustodies = data.activeCustodies || {};
    activeAdvances = data.activeAdvances || {};
    history = data.history || [];
  }

  const now = new Date().toISOString();

  // 1. Custody Issue
  if (type === 'custody_issue') {
    currentCustody += amount;
    const itemData = {
      id: finalId,
      type: 'custody_issue',
      workerId,
      workerName,
      originalAmount: amount,
      settledAmount: 0,
      remainingAmount: amount,
      status: 'active',
      sourceSafeId: safeId || '',
      issuedAt: now,
      notes: description || '',
      attachments: attachments || [],
      settlements: []
    };
    activeCustodies[finalId] = itemData;

    // Index in global SSOT collection
    await setDoc(doc(db, 'custodies_and_advances', finalId), itemData, { merge: true }).catch(() => {});
  }

  // 2. Custody Settle (Cash return or Expense bills)
  if (type === 'custody_settle' || type === 'settlement_expense') {
    currentCustody = Math.max(0, currentCustody - amount);
    
    // If targetCustodyId is specified, update that specific custody
    if (targetCustodyId) {
      if (!activeCustodies[targetCustodyId]) {
        activeCustodies[targetCustodyId] = {
          id: targetCustodyId,
          type: 'custody_issue',
          workerId,
          workerName,
          originalAmount: currentCustody + amount,
          settledAmount: 0,
          remainingAmount: currentCustody + amount,
          status: 'active',
          sourceSafeId: safeId || '',
          issuedAt: now,
          notes: 'Legacy open custody',
          attachments: [],
          settlements: []
        };
      }
      const c = activeCustodies[targetCustodyId];
      c.settledAmount = (Number(c.settledAmount) || 0) + amount;
      c.remainingAmount = Math.max(0, (Number(c.originalAmount) || 0) - c.settledAmount);
      c.status = c.remainingAmount <= 0.01 ? 'settled' : 'partially_settled';
      if (!c.settlements) c.settlements = [];
      c.settlements.push({
        settlementId: finalId,
        date: now,
        amount,
        type,
        notes: description || '',
        items: items || [],
        attachments: attachments || []
      });

      // Update global SSOT doc
      await setDoc(doc(db, 'custodies_and_advances', targetCustodyId), c, { merge: true }).catch(() => {});
    }
  }

  // 3. Salary Advance Issue
  if (type === 'salary_advance') {
    currentAdvance += amount;
    const itemData = {
      id: finalId,
      type: 'salary_advance',
      workerId,
      workerName,
      originalAmount: amount,
      settledAmount: 0,
      remainingAmount: amount,
      status: 'active',
      sourceSafeId: safeId || '',
      issuedAt: now,
      notes: description || '',
      settlementMethod: null,
      payrollMonth: null,
      installments: [],
      attachments: attachments || [],
      settlements: []
    };
    activeAdvances[finalId] = itemData;

    // Index in global SSOT collection
    await setDoc(doc(db, 'custodies_and_advances', finalId), itemData, { merge: true }).catch(() => {});
  }

  // 4. Advance Settle (Cash, Single Month Deduction, or Installments Plan)
  if (type === 'advance_settle' || type === 'salary_deduction_month' || type === 'advance_installments_plan') {
    currentAdvance = Math.max(0, currentAdvance - amount);

    if (targetAdvanceId) {
      if (!activeAdvances[targetAdvanceId]) {
        activeAdvances[targetAdvanceId] = {
          id: targetAdvanceId,
          type: 'salary_advance',
          workerId,
          workerName,
          originalAmount: currentAdvance + amount,
          settledAmount: 0,
          remainingAmount: currentAdvance + amount,
          status: 'active',
          sourceSafeId: safeId || '',
          issuedAt: now,
          notes: 'Legacy open advance',
          settlementMethod: null,
          payrollMonth: null,
          installments: [],
          attachments: [],
          settlements: []
        };
      }
      const a = activeAdvances[targetAdvanceId];
      a.settledAmount = (Number(a.settledAmount) || 0) + amount;
      a.remainingAmount = Math.max(0, (Number(a.originalAmount) || 0) - a.settledAmount);
      a.status = a.remainingAmount <= 0.01 ? 'settled' : 'partially_settled';

      if (type === 'salary_deduction_month') {
        a.settlementMethod = 'payroll_deduction';
        a.payrollMonth = payrollMonth;
        a.deductionId = finalId;
      } else if (type === 'advance_installments_plan') {
        a.settlementMethod = 'installments';
        a.installments = installments;
      }

      if (!a.settlements) a.settlements = [];
      a.settlements.push({
        settlementId: finalId,
        date: now,
        amount,
        type,
        payrollMonth,
        notes: description || '',
        attachments: attachments || []
      });

      // Update global SSOT doc
      await setDoc(doc(db, 'custodies_and_advances', targetAdvanceId), a, { merge: true }).catch(() => {});
    }
  }

  // Record History Item
  history.unshift({
    voucherId: finalId,
    ssotId: finalId,
    targetCustodyId,
    targetAdvanceId,
    date: now,
    type,
    amount,
    payrollMonth,
    installmentCount: installments?.length || 0,
    items,
    attachments: attachments || [],
    custodyBalanceAfter: currentCustody,
    advanceBalanceAfter: currentAdvance,
    notes: description || ''
  });

  if (history.length > 60) history = history.slice(0, 60);

  await setDoc(custodyRef, {
    workerId,
    workerName,
    currentCustodyBalance: currentCustody,
    currentAdvanceBalance: currentAdvance,
    activeCustodies,
    activeAdvances,
    history,
    updatedAt: now
  }, { merge: true });
}

/**
 * Updates an existing cash voucher's metadata (description, GL accounts, cost center, tax details, attachments)
 * and records an immutable audit log entry with before/after diffs.
 */
export async function updateCashVoucher({
  voucherId,
  updates = {},
  reason = '',
  currentUser
}) {
  if (!voucherId) {
    throw new Error('رقم السند غير محدد');
  }

  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const isFinanceManager = currentUser?.role === 'financial_manager' || currentUser?.role === 'treasury_manager';
  const hasEditPermission = currentUser?.permissions?.includes('edit_cash_voucher');

  if (!isGeneralAdmin && !isFinanceManager && !hasEditPermission) {
    throw new Error('غير مصرح لك بتعديل بيانات السندات المالية. يلزم صلاحية مدير عام أو مدير خزانة.');
  }

  const voucherRef = doc(db, 'cash_transactions', voucherId);
  const snap = await getDoc(voucherRef);
  if (!snap.exists()) {
    throw new Error('السند المالي غير موجود في قاعدة البيانات');
  }

  const existing = snap.data();
  const now = new Date().toISOString();

  // Calculate field-level diff
  const diff = {};
  const allowedFields = [
    'description',
    'mainAccount',
    'mainAccountAr',
    'statement',
    'reportCategory',
    'cashFlowCategory',
    'nature',
    'subAccountId',
    'subAccountName',
    'costCenterId',
    'costCenterName',
    'taxDocumentType',
    'taxDetails',
    'attachments'
  ];

  const sanitizedUpdates = {};
  allowedFields.forEach((field) => {
    if (updates[field] !== undefined) {
      sanitizedUpdates[field] = updates[field];
      const oldVal = existing[field] !== undefined ? existing[field] : null;
      const newVal = updates[field] !== undefined ? updates[field] : null;
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff[field] = {
          before: oldVal,
          after: newVal
        };
      }
    }
  });

  const auditEntry = {
    action: 'voucher_edited',
    timestamp: now,
    userId: currentUser.id || 'unknown',
    userName: currentUser.name || currentUser.nameAr || currentUser.id || 'Admin',
    userRole: currentUser.role || 'user',
    reason: reason || 'تعديل بيانات السند المالي',
    diff
  };

  const currentAuditLog = Array.isArray(existing.auditLog) ? existing.auditLog : [];
  const newAuditLog = [...currentAuditLog, auditEntry];

  await updateDoc(voucherRef, {
    ...sanitizedUpdates,
    auditLog: newAuditLog,
    updatedAt: now,
    lastEditedByUserId: currentUser.id || 'unknown',
    lastEditedByName: currentUser.name || currentUser.nameAr || currentUser.id || 'Admin',
    lastEditedAt: now
  });

  return { success: true, voucherId, auditEntry };
}

/**
 * Saves or updates a custody / advance draft in `custody_advance_drafts`
 */
export async function saveCustodyAdvanceDraft({
  draftId,
  type,
  workerId,
  workerName,
  amount,
  currency = 'EGP',
  sourceSafeId,
  denominations = {},
  notes = '',
  attachments = [],
  signedDocument = null,
  hasPrinted = false,
  currentUser
}) {
  const finalDraftId = draftId || generateCustodyOrAdvanceId({ type, safeId: sourceSafeId, date: new Date() });
  const draftRef = doc(db, 'custody_advance_drafts', finalDraftId);
  const now = new Date().toISOString();

  const data = {
    id: finalDraftId,
    type,
    workerId,
    workerName,
    amount: Number(amount) || 0,
    currency,
    sourceSafeId,
    denominations: denominations || {},
    notes: notes || '',
    attachments: attachments || [],
    signedDocument: signedDocument || null,
    hasPrinted: Boolean(hasPrinted),
    status: 'draft',
    updatedAt: now,
    lastEditedByName: currentUser?.name || currentUser?.nameAr || currentUser?.id || 'Admin'
  };

  const snap = await getDoc(draftRef);
  if (!snap.exists()) {
    data.createdAt = now;
    data.createdByUserId = currentUser?.id || 'unknown';
    data.createdByName = currentUser?.name || currentUser?.nameAr || currentUser?.id || 'Admin';
  }

  await setDoc(draftRef, data, { merge: true });
  return { success: true, draftId: finalDraftId };
}

/**
 * Deletes a custody / advance draft from `custody_advance_drafts`
 */
export async function deleteCustodyAdvanceDraft(draftId) {
  if (!draftId) return;
  await deleteDoc(doc(db, 'custody_advance_drafts', draftId));
  return { success: true };
}

/**
 * Updates an active custody or advance record across custody_ledger, custodies_and_advances, and cash_transactions
 */
export async function updateCustodyOrAdvanceRecord({
  recordId,
  workerId,
  newWorkerId = null,
  newWorkerName = null,
  notes,
  attachments = [],
  signedDocument = null,
  reason = '',
  currentUser
}) {
  if (!recordId) throw new Error('كود السند غير محدد');

  const now = new Date().toISOString();

  // 1. Update global SSOT doc
  const ssotRef = doc(db, 'custodies_and_advances', recordId);
  const ssotSnap = await getDoc(ssotRef);
  let targetType = 'custody_issue';
  let targetWorkerId = workerId;

  if (ssotSnap.exists()) {
    const d = ssotSnap.data();
    targetType = d.type || targetType;
    targetWorkerId = d.workerId || targetWorkerId;

    const updatedData = {
      notes: notes !== undefined ? notes : (d.notes || ''),
      attachments: attachments || d.attachments || [],
      updatedAt: now,
      lastEditedByName: currentUser?.name || currentUser?.nameAr || currentUser?.id || 'Admin'
    };

    if (signedDocument) {
      updatedData.signedDocument = signedDocument;
    }

    if (newWorkerId && newWorkerId !== targetWorkerId) {
      updatedData.workerId = newWorkerId;
      updatedData.workerName = newWorkerName || newWorkerId;
    }

    await updateDoc(ssotRef, updatedData);
  }

  // 2. Update custody_ledger for the worker
  const custodyRef = doc(db, 'custody_ledger', `CUST-${targetWorkerId}`);
  const custodySnap = await getDoc(custodyRef);
  if (custodySnap.exists()) {
    const cData = custodySnap.data();
    const mapKey = targetType.includes('advance') ? 'activeAdvances' : 'activeCustodies';
    const activeMap = cData[mapKey] || {};

    if (activeMap[recordId]) {
      const item = { ...activeMap[recordId] };
      item.notes = notes !== undefined ? notes : item.notes;
      item.attachments = attachments || item.attachments || [];
      if (signedDocument) item.signedDocument = signedDocument;

      if (newWorkerId && newWorkerId !== targetWorkerId) {
        delete activeMap[recordId];
        await updateDoc(custodyRef, { [mapKey]: activeMap, updatedAt: now });

        const newCustodyRef = doc(db, 'custody_ledger', `CUST-${newWorkerId}`);
        const newSnap = await getDoc(newCustodyRef);
        const newActiveMap = newSnap.exists() ? (newSnap.data()[mapKey] || {}) : {};
        item.workerId = newWorkerId;
        item.workerName = newWorkerName || newWorkerId;
        newActiveMap[recordId] = item;
        await setDoc(newCustodyRef, { [mapKey]: newActiveMap, updatedAt: now }, { merge: true });
      } else {
        activeMap[recordId] = item;
        await updateDoc(custodyRef, { [mapKey]: activeMap, updatedAt: now });
      }
    }
  }

  // 3. If voucher exists in cash_transactions, update description, attachments, and auditLog
  const voucherRef = doc(db, 'cash_transactions', recordId);
  const voucherSnap = await getDoc(voucherRef);
  if (voucherSnap.exists()) {
    const vData = voucherSnap.data();
    const auditEntry = {
      action: 'custody_edited',
      timestamp: now,
      userId: currentUser?.id || 'unknown',
      userName: currentUser?.name || currentUser?.nameAr || currentUser?.id || 'Admin',
      reason: reason || 'تعديل بيانات العهدة / السلفة',
      diff: {
        notes: { before: vData.description, after: notes },
        attachmentsCount: { before: (vData.attachments || []).length, after: (attachments || []).length }
      }
    };
    const currentAuditLog = Array.isArray(vData.auditLog) ? vData.auditLog : [];
    await updateDoc(voucherRef, {
      description: notes !== undefined ? notes : vData.description,
      attachments: attachments || vData.attachments || [],
      auditLog: [...currentAuditLog, auditEntry],
      updatedAt: now
    });
  }

  return { success: true };
}

/**
 * Checks if candidateCode is an ancestor or descendant of any code in existingCodes.
 * Prevents double assignments between parent and child accounts for the same master list.
 *
 * @param {string} candidateCode - The account code being evaluated for addition
 * @param {string[]} existingCodes - Currently linked account codes for the master registry
 * @param {object[]} accountsMaster - Full chart of accounts list
 * @returns {object} { hasConflict: boolean, candidateCode?: string, conflictingCode?: string, conflictType?: 'ancestor' | 'descendant', messageAr?: string, messageEn?: string }
 */
export function checkParentChildConflict(candidateCode, existingCodes = [], accountsMaster = []) {
  if (!candidateCode || !Array.isArray(existingCodes) || existingCodes.length === 0) {
    return { hasConflict: false };
  }

  const cleanCandidate = String(candidateCode).trim();
  if (!cleanCandidate) return { hasConflict: false };

  // Helper to trace all ancestors up the tree (via parentCode and parentAccountId)
  const getAncestors = (code) => {
    const ancestors = new Set();
    let current = accountsMaster.find((a) => String(a.code || a.id).trim() === String(code).trim());
    let depth = 0;
    while (current && (current.parentCode || current.parentAccountId) && depth < 20) {
      depth++;
      const pCode = String(current.parentCode || current.parentAccountId).trim();
      if (pCode && !ancestors.has(pCode)) {
        ancestors.add(pCode);
        current = accountsMaster.find((a) => String(a.code || a.id).trim() === pCode);
      } else {
        break;
      }
    }
    return ancestors;
  };

  // Helper to trace all descendants down the tree
  const getDescendants = (code) => {
    const descendants = new Set();
    const queue = [String(code).trim()];
    let iterations = 0;
    while (queue.length > 0 && iterations < 500) {
      iterations++;
      const p = queue.shift();
      const children = accountsMaster.filter((a) => {
        const parentVal = String(a.parentCode || a.parentAccountId || '').trim();
        return parentVal === p;
      });
      children.forEach((c) => {
        const cCode = String(c.code || c.id).trim();
        if (cCode && !descendants.has(cCode)) {
          descendants.add(cCode);
          queue.push(cCode);
        }
      });
    }
    return descendants;
  };

  for (const existing of existingCodes) {
    const cleanExisting = String(existing).trim();
    if (!cleanExisting || cleanExisting === cleanCandidate) continue;

    const existingAncestors = getAncestors(cleanExisting);
    const candidateAncestors = getAncestors(cleanCandidate);

    // 1. Candidate is ancestor of existing (Candidate is parent/grandparent of existing)
    const isCandidateAncestor =
      existingAncestors.has(cleanCandidate) ||
      (cleanExisting.startsWith(cleanCandidate) && cleanExisting.length > cleanCandidate.length && cleanCandidate.length >= 3);

    if (isCandidateAncestor) {
      const candidateName = accountsMaster.find((a) => String(a.code || a.id).trim() === cleanCandidate)?.nameAr || cleanCandidate;
      const existingName = accountsMaster.find((a) => String(a.code || a.id).trim() === cleanExisting)?.nameAr || cleanExisting;
      return {
        hasConflict: true,
        candidateCode: cleanCandidate,
        conflictingCode: cleanExisting,
        conflictType: 'ancestor',
        messageAr: `تعارض شجري: الحساب [${cleanCandidate}] (${candidateName}) هو حساب رئيسي/أب للحساب [${cleanExisting}] (${existingName}) المرتبط بالفعل بهذه القائمة. لا يمكن ربط الأب والابن معاً لنفس القائمة لمنع الازدواج المحاسبي. يرجى اختيار إما الحساب الأب فقط، أو الحسابات الفرعية التابعة له.`,
        messageEn: `Hierarchy conflict: Account [${cleanCandidate}] (${candidateName}) is a parent/ancestor of already linked child [${cleanExisting}] (${existingName}). Linking both parent and child to the same master list is prohibited to prevent double-counting balances.`
      };
    }

    // 2. Candidate is descendant of existing (Candidate is child/grandchild of existing)
    const isCandidateDescendant =
      candidateAncestors.has(cleanExisting) ||
      (cleanCandidate.startsWith(cleanExisting) && cleanCandidate.length > cleanExisting.length && cleanExisting.length >= 3);

    if (isCandidateDescendant) {
      const candidateName = accountsMaster.find((a) => String(a.code || a.id).trim() === cleanCandidate)?.nameAr || cleanCandidate;
      const existingName = accountsMaster.find((a) => String(a.code || a.id).trim() === cleanExisting)?.nameAr || cleanExisting;
      return {
        hasConflict: true,
        candidateCode: cleanCandidate,
        conflictingCode: cleanExisting,
        conflictType: 'descendant',
        messageAr: `تعارض شجري: الحساب [${cleanCandidate}] (${candidateName}) هو حساب فرعي تابع للحساب الأب [${cleanExisting}] (${existingName}) المرتبط بالفعل بهذه القائمة. لا يمكن ربط الحساب الأب والحساب الفرعي معاً لنفس القائمة لمنع الازدواج المحاسبي.`,
        messageEn: `Hierarchy conflict: Account [${cleanCandidate}] (${candidateName}) is a child/descendant of already linked parent [${cleanExisting}] (${existingName}). Linking both parent and child to the same master list is prohibited.`
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Dynamically resolves the master registry role of an account based SOLELY on:
 * 1. Active accountingLinks (Tab 4: primaryCode and linkedCodes)
 * 2. Chart of Accounts account definition (Tab 3: subType, linkedMasterCollection)
 * Zero hardcoded account IDs!
 *
 * @param {string} accountCodeOrId - The account code or ID to check
 * @param {object[]} accountsMaster - Full chart of accounts list
 * @param {object} accountingLinks - Active system_config/accounting_links
 * @returns {'supplier' | 'client' | 'worker' | 'safe' | 'bank' | 'inventory' | 'cost_center'}
 */
export function resolveAccountMasterRole(accountCodeOrId, accountsMaster = [], accountingLinks = null) {
  if (!accountCodeOrId) return 'cost_center';
  const cleanId = String(accountCodeOrId).trim();

  // 1. Check against active accountingLinks (Tab 4 configuration)
  if (accountingLinks && typeof accountingLinks === 'object') {
    for (const [key, linkConfig] of Object.entries(accountingLinks)) {
      if (!linkConfig) continue;

      const linkedCodes = Array.isArray(linkConfig.linkedCodes) && linkConfig.linkedCodes.length > 0
        ? linkConfig.linkedCodes.map((c) => String(c).trim())
        : (linkConfig.code ? [String(linkConfig.code).trim()] : []);

      const primary = String(linkConfig.primaryCode || linkConfig.code || '').trim();

      if (linkedCodes.includes(cleanId) || primary === cleanId || cleanId === linkConfig.role) {
        return linkConfig.subType || (
          key === 'suppliersAccount' ? 'supplier' :
          key === 'clientsAccount' ? 'client' :
          key === 'workersCustodyAccount' ? 'worker' :
          key === 'cashSafesAccount' ? 'safe' :
          key === 'corporateBanksAccount' ? 'bank' :
          (key === 'rawMaterialsInventoryAccount' || key === 'finishedGoodsInventoryAccount' || key === 'wipInventoryAccount') ? 'inventory' :
          'cost_center'
        );
      }
    }
  }

  // 2. Check directly against Chart of Accounts account definition (Tab 3)
  const acc = Array.isArray(accountsMaster)
    ? accountsMaster.find((a) => String(a.code || a.id).trim() === cleanId)
    : null;

  if (acc?.subType && ['supplier', 'client', 'worker', 'safe', 'bank', 'inventory'].includes(acc.subType)) {
    return acc.subType;
  }

  // 3. Fallback: Inherit from parent account in COA if child has no explicit subType
  if (acc && (acc.parentCode || acc.parentAccountId)) {
    const parentCodeVal = String(acc.parentCode || acc.parentAccountId).trim();
    const parent = accountsMaster.find((a) => String(a.code || a.id).trim() === parentCodeVal);
    if (parent?.subType && ['supplier', 'client', 'worker', 'safe', 'bank'].includes(parent.subType)) {
      return parent.subType;
    }
  }

  return 'cost_center';
}

/**
 * Resolves the designated Balance Sheet accounts for Current Year Net Income and Retained Earnings
 * using the Hybrid approach:
 * 1. Configured accountingLinks (SSOT from system_config/accounting_links)
 * 2. Chart of Accounts metadata (subType/role === 'current_year_earnings' / 'retained_earnings')
 * 3. Default fallback codes (20103 / 20102)
 */
export function resolveEquityRolloverAccountCodes(accountingLinks, hierarchyMap) {
  let currentYearCode =
    accountingLinks?.currentYearEarningsAccount?.primaryCode ||
    accountingLinks?.currentYearEarningsAccount?.code ||
    '';
  let retainedCode =
    accountingLinks?.retainedEarningsAccount?.primaryCode ||
    accountingLinks?.retainedEarningsAccount?.code ||
    '';

  if (!currentYearCode && hierarchyMap) {
    for (const [code, acc] of hierarchyMap.entries()) {
      if (
        acc.subType === 'current_year_earnings' ||
        acc.role === 'current_year_earnings' ||
        acc.systemRole === 'current_year_earnings'
      ) {
        currentYearCode = code;
        break;
      }
    }
  }

  if (!retainedCode && hierarchyMap) {
    for (const [code, acc] of hierarchyMap.entries()) {
      if (
        acc.subType === 'retained_earnings' ||
        acc.role === 'retained_earnings' ||
        acc.systemRole === 'retained_earnings'
      ) {
        retainedCode = code;
        break;
      }
    }
  }

  return {
    currentYearEarningsCode: currentYearCode || '20103',
    retainedEarningsCode: retainedCode || '20102'
  };
}

/**
 * Master Lists to General Ledger Control Accounts Mapping Configuration
 * Supports linking multiple GL accounts per Master entity, with a designated primaryCode.
 */
export const DEFAULT_ACCOUNTING_LINKS = {
  // 1. Suppliers Master (Accounts Payable)
  suppliersAccount: {
    primaryCode: '2020101',
    linkedCodes: ['2020101', '2020102'],
    code: '2020101', // Backwards compatibility
    nameAr: 'موردين خامات',
    nameEn: 'Raw Material Suppliers',
    masterCollection: 'suppliers',
    role: 'suppliers',
    labelAr: 'سجل الموردين (المشتريات الآجلة ومردوداتها)',
    labelEn: 'Suppliers Master (Purchases & Returns)',
    descAr: 'حسابات المراقبة لالتزامات الموردين؛ يُقيد فيها دائن بقيمة صافي الفواتير، ومدين عند سداد السندات أو المرتجعات.',
    subType: 'supplier'
  },
  // 2. Clients Master (Accounts Receivable)
  clientsAccount: {
    primaryCode: '1020301',
    linkedCodes: ['1020301'],
    code: '1020301',
    nameAr: 'العملاء',
    nameEn: 'Accounts Receivable (Clients)',
    masterCollection: 'clients',
    role: 'clients',
    labelAr: 'سجل العملاء والموزعين (المبيعات والتحصيلات)',
    labelEn: 'Clients & Distributors Master',
    descAr: 'حسابات المراقبة الرئيسية لمستحقات العملاء؛ يُقيد فيه مدين بفواتير المبيعات ودائن بالمتحصلات النقدية والبنكية.',
    subType: 'client'
  },
  // 3. Workers / Staff Custodies & Advances
  workersCustodyAccount: {
    primaryCode: '1020401',
    linkedCodes: ['1020401', '1020402'],
    code: '1020401',
    nameAr: 'عهد العاملين',
    nameEn: 'Staff Custodies',
    masterCollection: 'employees',
    role: 'workers',
    labelAr: 'سجل عمالة الإنتاج والموظفين (العهد والسلف)',
    labelEn: 'Workers & Staff (Custodies & Advances)',
    descAr: 'حسابات المراقبة لعهد وسلف العاملين؛ يُقيد فيها مدين بصرف العهدة ودائن عند تقديم فواتير المصروفات أو رد النقدية.',
    subType: 'worker'
  },
  // 4. Cash Safes Control
  cashSafesAccount: {
    primaryCode: '1020101',
    linkedCodes: ['1020101'],
    code: '1020101',
    nameAr: 'الخزينة',
    nameEn: 'Cash on Hand (Safes)',
    masterCollection: 'cash_safes',
    role: 'cash_safes',
    labelAr: 'خزائن النقدية الفعلية',
    labelEn: 'Physical Cash Vaults & Safes',
    descAr: 'حساب مراقبة النقدية السائلة بالخزائن الفعلية للمصنع.',
    subType: 'safe'
  },
  // 5. Corporate Banks Control
  corporateBanksAccount: {
    primaryCode: '1020102',
    linkedCodes: ['1020102'],
    code: '1020102',
    nameAr: 'البنوك',
    nameEn: 'Corporate Banks',
    masterCollection: 'corporate_banks',
    role: 'corporate_banks',
    labelAr: 'الحسابات والودائع البنكية',
    labelEn: 'Corporate Bank Accounts',
    descAr: 'حساب مراقبة أرصدة الحسابات الجارية والودائع بالبنوك المعتمدة.',
    subType: 'bank'
  },
  // 6. Raw Materials Inventory (GRN Debit)
  rawMaterialsInventoryAccount: {
    primaryCode: '1020201',
    linkedCodes: ['1020201'],
    code: '1020201',
    nameAr: 'مخزون خامات ومواد تعبئة',
    nameEn: 'Raw Materials & Packaging Inventory',
    masterCollection: 'items',
    role: 'raw_materials_inventory',
    labelAr: 'مخزون الخامات ومستلزمات الإنتاج (أذون الاستلام)',
    labelEn: 'Raw Materials & Packaging Stock (GRN Debit)',
    descAr: 'حساب المخزون الفعلي الذي يزيد مدين بقيمة البضاعة المستلمة (قبل الضرائب) عند اعتماد إذن الاستلام GRN.',
    subType: 'inventory'
  },
  // 7. Finished Goods Inventory
  finishedGoodsInventoryAccount: {
    primaryCode: '1020203',
    linkedCodes: ['1020203'],
    code: '1020203',
    nameAr: 'مخزون الإنتاج التام',
    nameEn: 'Finished Goods Inventory',
    masterCollection: 'finished_products',
    role: 'finished_goods_inventory',
    labelAr: 'مخزون المنتج التام (استلامات الصالة والتوزيع)',
    labelEn: 'Finished Goods Inventory',
    descAr: 'حساب بضاعة الإنتاج التام الجاهزة للبيع والتسليم بالمستودعات.',
    subType: 'inventory'
  },
  // 7.5. Work in Progress (WIP) Inventory
  wipInventoryAccount: {
    primaryCode: '1020202',
    linkedCodes: ['1020202'],
    code: '1020202',
    nameAr: 'مخزون المواد تحت التشغيل',
    nameEn: 'Work in Progress (WIP) Inventory',
    role: 'wip_inventory',
    labelAr: 'مخزون المواد تحت التشغيل (أوامر التشغيل والتصنيع)',
    labelEn: 'Work in Progress (WIP) Inventory',
    descAr: 'حساب مراقبة تكلفة الخامات قيد التصنيع والمواد نصف المصنعة بخطوط الإنتاج.',
    subType: 'inventory'
  },
  // 8. Input VAT (14% Tax Asset)
  inputVatAccount: {
    primaryCode: '1020404',
    linkedCodes: ['1020404'],
    code: '1020404',
    nameAr: 'جاري مصلحة الضرائب - ض.ق.م مدخلات',
    nameEn: 'Input VAT (14%) - Tax Authority',
    role: 'input_vat',
    labelAr: 'ضريبة القيمة المضافة - مدخلات (١٤٪)',
    labelEn: 'Input Value Added Tax (14%)',
    descAr: 'حساب ضريبة القيمة المضافة القابلة للخصم والمستردة من مصلحة الضرائب على مشتريات الخامات.',
    subType: 'asset'
  },
  // 9. Withholding Tax (WHT 1% Tax Liability)
  whtPayableAccount: {
    primaryCode: '2020203',
    linkedCodes: ['2020203'],
    code: '2020203',
    nameAr: 'مصلحة الضرائب - ضريبة الخصم والإضافة',
    nameEn: 'Withholding Tax (WHT 1%) Payable',
    role: 'wht_payable',
    labelAr: 'ضريبة الخصم والإضافة (١٪ المستقطعة)',
    labelEn: 'Withholding Tax (1%) Payable',
    descAr: 'حساب الضريبة المستقطعة من مستحقات الموردين لتوريدها ربع سنوياً لمصلحة الضرائب المصرية.',
    subType: 'liability'
  },
  // 10. Output VAT (Tax Liability on Sales)
  outputVatAccount: {
    primaryCode: '2020201',
    linkedCodes: ['2020201'],
    code: '2020201',
    nameAr: 'مصلحة الضرائب - ض.ق.م مخرجات',
    nameEn: 'Output VAT - Tax Authority',
    role: 'output_vat',
    labelAr: 'ضريبة القيمة المضافة - مخرجات مبيعات',
    labelEn: 'Output Value Added Tax (Sales)',
    descAr: 'حساب ضريبة القيمة المضافة المحصلة من العملاء على مبيعات المنتجات التامة.',
    subType: 'liability'
  },
  // 11. Raw Materials Direct Purchases (COGS)
  rawMaterialsPurchasesAccount: {
    primaryCode: '3010101',
    linkedCodes: ['3010101'],
    code: '3010101',
    nameAr: 'مشتريات خامات',
    nameEn: 'Raw Material Purchases (COGS)',
    role: 'raw_materials_purchases',
    labelAr: 'تكلفة مشتريات الخامات (قائمة الدخل)',
    labelEn: 'Direct Raw Material Purchases (P&L)',
    descAr: 'حساب تكلفة المشتريات المباشرة المرتبط بحسابات تكلفة الإنتاج والمبيعات.',
    subType: 'cost_center'
  },
  // 12. Cash Count Discrepancy (Surplus & Shortage Settlement)
  cashDiscrepancyAccount: {
    primaryCode: '4010204',
    linkedCodes: ['4010204', '3020209'],
    code: '4010204',
    nameAr: 'أرباح وفروق تسوية جرد الخزينة',
    nameEn: 'Cash Discrepancy & Safe Audit Settlement',
    role: 'cash_discrepancy',
    labelAr: 'أرباح وخسائر تسوية عجز وزيادة الخزينة (فروق الجرد)',
    labelEn: 'Cash Discrepancy & Safe Audit Settlement',
    descAr: 'حساب تسوية فروق الجرد الفعلي للخزائن؛ يُقيد فيه دائن عند وجود زيادة نقدية (إيرادات أخرى) ومدين عند وجود عجز نقدي (مصروفات أخرى).',
    subType: 'safe'
  },
  // 13. Internal Safe Transfers Clearing
  internalTransfersAccount: {
    primaryCode: '1020101',
    linkedCodes: ['1020101'],
    code: '1020101',
    nameAr: 'تحويلات نقدية داخلية بين الخزائن',
    nameEn: 'Internal Safe Transfers Clearing',
    role: 'internal_transfers',
    labelAr: 'حساب وسيط التحويلات الداخلية بين الخزائن',
    labelEn: 'Internal Transfers Clearing Account',
    descAr: 'حساب وسيط تسوية التحويلات النقدية اللحظية بين الخزائن الفرعية والرئيسية.',
    subType: 'safe'
  },
  // 14. Current Year Net Income / Loss (Balance Sheet Equity Rollover)
  currentYearEarningsAccount: {
    primaryCode: '20103',
    linkedCodes: ['20103'],
    code: '20103',
    nameAr: 'صافي أرباح / خسائر العام الحالي',
    nameEn: 'Net Income / Loss for the Current Year',
    role: 'current_year_earnings',
    labelAr: 'حساب أرباح / خسائر العام الحالي (الميزانية)',
    labelEn: 'Current Year Net Income Account (Balance Sheet)',
    descAr: 'حساب حقوق الملكية بالميزانية العمومية الذي يُربط به آلياً صافي ربح أو خسارة الفترة من قائمة الدخل دون قيود يدوية.',
    subType: 'equity'
  },
  // 15. Retained Earnings / Accumulated Losses (Prior Periods Equity Rollover)
  retainedEarningsAccount: {
    primaryCode: '20102',
    linkedCodes: ['20102'],
    code: '20102',
    nameAr: 'الأرباح المحتجزة / الخسائر المرحلة',
    nameEn: 'Retained Earnings / Accumulated Losses',
    role: 'retained_earnings',
    labelAr: 'حساب الأرباح المحتجزة والخسائر المرحلة (الميزانية)',
    labelEn: 'Retained Earnings Account (Balance Sheet)',
    descAr: 'حساب حقوق الملكية بالميزانية العمومية الذي تتراكم فيه أرباح وخسائر الفترات المالية السابقة.',
    subType: 'equity'
  }
};

/**
 * Fetch configured accounting links from Firestore system_config/accounting_links with fallback to defaults
 */
export async function getAccountingLinks() {
  try {
    const snap = await getDoc(doc(db, 'system_config', 'accounting_links'));
    if (snap.exists()) {
      const data = snap.data();
      const merged = { ...DEFAULT_ACCOUNTING_LINKS };
      Object.keys(DEFAULT_ACCOUNTING_LINKS).forEach((k) => {
        if (data[k]) {
          const item = data[k];
          const primary = item.primaryCode || item.code || DEFAULT_ACCOUNTING_LINKS[k].primaryCode;
          const linked = Array.isArray(item.linkedCodes) && item.linkedCodes.length > 0
            ? item.linkedCodes
            : (item.code ? [item.code] : DEFAULT_ACCOUNTING_LINKS[k].linkedCodes);
          merged[k] = {
            ...DEFAULT_ACCOUNTING_LINKS[k],
            ...item,
            primaryCode: primary,
            linkedCodes: linked,
            code: primary
          };
        }
      });
      return merged;
    }
  } catch (err) {
    console.warn('Could not read accounting_links config, using defaults:', err.message);
  }
  return DEFAULT_ACCOUNTING_LINKS;
}

/**
 * Save updated accounting links to Firestore
 */
export async function saveAccountingLinks(links, userId = 'admin') {
  const ref = doc(db, 'system_config', 'accounting_links');
  await setDoc(ref, {
    ...links,
    updatedAt: serverTimestamp(),
    updatedBy: userId
  }, { merge: true });
  return true;
}

/**
 * Builds the standard 4-leg Accrual Journal Entry for Goods Receipts (or Returns)
 */
export function buildGrnJournalEntry({
  grnId,
  docType = 'receipt',
  receiptDate,
  supplierId,
  supplierName,
  taxInvoiceNumber = '',
  supplierDeliveryNote = '',
  poId = '',
  computedTotals = {},
  accountingLinks = DEFAULT_ACCOUNTING_LINKS,
  accountsMaster = [],
  currentUserName = 'System',
  isTaxOfficial = false,
  etaPortalRegistered = false,
  attachments = []
}) {
  const isReturn = docType === 'return' || String(grnId).startsWith('RTN');
  const subtotal = Number(computedTotals.subtotal) || 0;
  const totalVat = isTaxOfficial ? (Number(computedTotals.totalVat) || 0) : 0;
  const totalWht = isTaxOfficial ? (Number(computedTotals.totalWht) || 0) : 0;
  const netPayable = (subtotal + totalVat - totalWht);

  // Helper to resolve account name
  const findName = (code, fallback) => {
    const found = accountsMaster.find((a) => (a.code || a.id) === code);
    return found?.nameAr || fallback;
  };

  const invCode = accountingLinks.rawMaterialsInventoryAccount?.code || '1020201';
  const invName = findName(invCode, accountingLinks.rawMaterialsInventoryAccount?.nameAr || 'مخزون خامات ومواد تعبئة');

  const vatCode = accountingLinks.inputVatAccount?.code || '1020404';
  const vatName = findName(vatCode, accountingLinks.inputVatAccount?.nameAr || 'جاري مصلحة الضرائب - ض.ق.م مدخلات');

  const whtCode = accountingLinks.whtPayableAccount?.code || '2020203';
  const whtName = findName(whtCode, accountingLinks.whtPayableAccount?.nameAr || 'مصلحة الضرائب - ضريبة الخصم والإضافة');

  const supCode = accountingLinks.suppliersAccount?.code || '2020101';
  const supName = findName(supCode, accountingLinks.suppliersAccount?.nameAr || 'موردين خامات');

  const docLabelAr = isReturn ? 'إذن مرتجع خامات' : 'إذن استلام خامات';
  const docLabelEn = isReturn ? 'Material Return (RTN)' : 'Goods Receipt (GRN)';
  const descAr = isReturn
    ? `قيد إشعار خصم/مرتجع خامات للمورد (${supplierName || supplierId}) - إذن ${grnId}`
    : `قيد استحقاق فاتورة توريد خامات - إذن استلام ${grnId} - المورد: ${supplierName || supplierId}`;
  const descEn = isReturn
    ? `Supplier Return Credit Note JE #${grnId} - Supplier: ${supplierName || supplierId}`
    : `Material Receipt Accrual JE #${grnId} - Supplier: ${supplierName || supplierId}`;

  // Build standard 4 legs (or reversed 4 legs if return)
  const lines = [];

  if (!isReturn) {
    // 1. Debit Inventory (Subtotal before tax)
    if (subtotal > 0) {
      lines.push({
        accountCode: invCode,
        accountNameAr: invName,
        nature: 'debit',
        debit: subtotal,
        credit: 0,
        subledgerType: 'inventory',
        notes: `قيمة بضاعة خامات ومواد تعبئة مستلمة بموجب ${grnId}`
      });
    }

    // 2. Debit Input VAT (14% claimable)
    if (totalVat > 0) {
      lines.push({
        accountCode: vatCode,
        accountNameAr: vatName,
        nature: 'debit',
        debit: totalVat,
        credit: 0,
        subledgerType: 'tax_authority',
        notes: `ض.ق.م مدخلات (١٤٪) مستحقة للخصم عن إذن ${grnId}`
      });
    }

    // 3. Credit Withholding Tax (1% tax liability)
    if (totalWht > 0) {
      lines.push({
        accountCode: whtCode,
        accountNameAr: whtName,
        nature: 'credit',
        debit: 0,
        credit: totalWht,
        subledgerType: 'tax_authority',
        notes: `ضريبة خصم وإضافة (١٪) مستقطعة من المورد لتوريدها للمصلحة`
      });
    }

    // 4. Credit Supplier Subledger (Net Payable)
    lines.push({
      accountCode: supCode,
      accountNameAr: supName,
      nature: 'credit',
      debit: 0,
      credit: netPayable,
      subledgerId: supplierId || '',
      subledgerName: supplierName || supplierId || '',
      subledgerType: 'supplier',
      notes: `صافي المستحق للمورد ${supplierName || supplierId} عن إذن ${grnId}`
    });
  } else {
    // Return: Reverse the legs
    // Debit Supplier for net payable
    lines.push({
      accountCode: supCode,
      accountNameAr: supName,
      nature: 'debit',
      debit: netPayable,
      credit: 0,
      subledgerId: supplierId || '',
      subledgerName: supplierName || supplierId || '',
      subledgerType: 'supplier',
      notes: `إشعار خصم/مردودات على المورد ${supplierName || supplierId} عن إذن ${grnId}`
    });

    // Debit WHT (reversing withholding)
    if (totalWht > 0) {
      lines.push({
        accountCode: whtCode,
        accountNameAr: whtName,
        nature: 'debit',
        debit: totalWht,
        credit: 0,
        subledgerType: 'tax_authority',
        notes: `عكس ضريبة خصم وإضافة عن مردودات ${grnId}`
      });
    }

    // Credit Input VAT (reversing VAT claim)
    if (totalVat > 0) {
      lines.push({
        accountCode: vatCode,
        accountNameAr: vatName,
        nature: 'credit',
        debit: 0,
        credit: totalVat,
        subledgerType: 'tax_authority',
        notes: `عكس ض.ق.م مدخلات عن بضاعة مرتجعة بإذن ${grnId}`
      });
    }

    // Credit Inventory (deducting returned stock value)
    if (subtotal > 0) {
      lines.push({
        accountCode: invCode,
        accountNameAr: invName,
        nature: 'credit',
        debit: 0,
        credit: subtotal,
        subledgerType: 'inventory',
        notes: `خصم قيمة بضاعة مرتجعة للمورد بإذن ${grnId}`
      });
    }
  }

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

  return {
    id: `JE-${grnId}`,
    entryNumber: `JE-${grnId}`,
    sourceDocType: isReturn ? 'supplier_return' : 'goods_receipt',
    sourceDocId: grnId,
    docLabelAr,
    docLabelEn,
    entryDate: receiptDate || new Date().toISOString().split('T')[0],
    descriptionAr: descAr,
    descriptionEn: descEn,
    referenceNumber: taxInvoiceNumber || supplierDeliveryNote || poId || grnId,
    taxInvoiceNumber: taxInvoiceNumber || '',
    supplierDeliveryNote: supplierDeliveryNote || '',
    poId: poId || '',
    supplierId: supplierId || '',
    supplierName: supplierName || '',
    status: 'posted',
    financials: {
      subtotal,
      totalVat,
      totalWht,
      netPayable
    },
    lines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    isTaxOfficial: Boolean(isTaxOfficial),
    etaPortalRegistered: Boolean(etaPortalRegistered),
    attachments: Array.isArray(attachments) ? attachments : [],
    createdAt: new Date().toISOString(),
    createdBy: currentUserName
  };
}

/**
 * Builds a reversal journal entry for an existing journal entry
 */
export function buildGrnReversalJournalEntry(originalEntry, reason = '', currentUserName = 'System') {
  if (!originalEntry || !originalEntry.lines) return null;
  const revId = `JE-REV-${originalEntry.sourceDocId || originalEntry.id.replace('JE-', '')}`;

  const reversedLines = originalEntry.lines.map((l) => ({
    accountCode: l.accountCode,
    accountNameAr: l.accountNameAr,
    nature: l.debit > 0 ? 'credit' : 'debit',
    debit: l.credit || 0,
    credit: l.debit || 0,
    subledgerId: l.subledgerId || null,
    subledgerName: l.subledgerName || null,
    subledgerType: l.subledgerType || null,
    notes: `قيد عكسي إداري لإلغاء القيد ${originalEntry.id}: ${l.notes || ''}`
  }));

  const totalDebit = reversedLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = reversedLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

  return {
    id: revId,
    entryNumber: revId,
    sourceDocType: 'reversal',
    originalEntryId: originalEntry.id,
    sourceDocId: originalEntry.sourceDocId || originalEntry.id,
    docLabelAr: 'قيد عكسي / إلغاء مستند',
    docLabelEn: 'Reversal Journal Entry',
    entryDate: new Date().toISOString().split('T')[0],
    descriptionAr: `قيد عكسي لإلغاء ${originalEntry.docLabelAr || 'المستند'} (${originalEntry.sourceDocId || originalEntry.id}) - السبب: ${reason || 'إلغاء إداري'}`,
    descriptionEn: `Reversal of ${originalEntry.id} - Reason: ${reason || 'Admin cancellation'}`,
    referenceNumber: originalEntry.referenceNumber || originalEntry.id,
    supplierId: originalEntry.supplierId || '',
    supplierName: originalEntry.supplierName || '',
    status: 'posted',
    financials: originalEntry.financials || {},
    lines: reversedLines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    isTaxOfficial: Boolean(originalEntry.isTaxOfficial),
    etaPortalRegistered: Boolean(originalEntry.etaPortalRegistered),
    attachments: Array.isArray(originalEntry.attachments) ? originalEntry.attachments : [],
    createdAt: new Date().toISOString(),
    createdBy: currentUserName
  };
}

/**
 * 3-Tier Hierarchical Authorization Verifier:
 * Evaluates whether the current user is authorized to approve or reject a cash payment voucher:
 * - Tier 3: General Admin (isGeneralAdmin || role === 'general_admin')
 * - Tier 2: General Payment Authorizers (system_config.generalAuthorizerUserIds or isGeneralAuthorizer)
 * - Tier 1: Safe-Specific Authorizer (safe.authorizerUserId === currentUser.id)
 */
export function canAuthorizeCashVoucher({
  voucher,
  safe,
  currentUser,
  treasuryConfig
}) {
  if (!currentUser) return { canAuthorize: false, matchedRole: null };

  // Tier 3: General Admin
  if (currentUser.isGeneralAdmin || currentUser.role === 'general_admin') {
    return { canAuthorize: true, matchedRole: 'general_admin', labelAr: 'المسؤول العام' };
  }

  // Tier 2: General Payment Authorizers (Company-Wide)
  const generalAuthorizerIds = Array.isArray(treasuryConfig?.generalAuthorizerUserIds)
    ? treasuryConfig.generalAuthorizerUserIds
    : [];
  if (
    generalAuthorizerIds.includes(currentUser.id) ||
    currentUser.isGeneralAuthorizer ||
    currentUser.role === 'general_authorizer'
  ) {
    return { canAuthorize: true, matchedRole: 'general_authorizer', labelAr: 'معتمد صرف عام' };
  }

  // Tier 1: Safe-Specific Payment Authorizer
  if (safe?.authorizerUserId && safe.authorizerUserId === currentUser.id) {
    return { canAuthorize: true, matchedRole: 'safe_authorizer', labelAr: 'معتمد الخزينة' };
  }

  return { canAuthorize: false, matchedRole: null };
}

/**
 * Atomically approves a pending cash voucher, deducts safe balance,
 * checks banknote breakdown, transitions status to 'posted', and resolves actions.
 */
export async function approveCashVoucher({
  voucherId,
  currentUser,
  approvalNotes = '',
  allowOverdraft = false
}) {
  if (!voucherId) throw new Error('رقم السند مطلوب');
  if (!currentUser?.id) throw new Error('بيانات المستخدم المعتمِد مطلوبة');

  const now = new Date();
  const voucherRef = doc(db, 'cash_transactions', voucherId);
  let voucherData = null;
  let finalNewBal = 0;

  await runTransaction(db, async (transaction) => {
    const voucherSnap = await transaction.get(voucherRef);
    if (!voucherSnap.exists()) {
      throw new Error(`السند (${voucherId}) غير موجود في قاعدة البيانات`);
    }
    voucherData = voucherSnap.data();
    if (voucherData.status !== 'pending_approval') {
      throw new Error(`حالة السند الحالية (${voucherData.status}) لا تسمح بالاعتماد، قد تم اعتماده أو تعديله مسبقاً`);
    }

    const safeId = voucherData.safeId;
    const safeRef = doc(db, 'cash_safes', safeId);
    const safeSnap = await transaction.get(safeRef);
    if (!safeSnap.exists()) {
      throw new Error(`الخزينة (${safeId}) غير موجودة في قاعدة البيانات`);
    }

    const safeData = safeSnap.data();
    const currency = voucherData.currency || 'EGP';
    const numAmount = Number(voucherData.amount) || 0;
    const isOutflow = voucherData.direction === 'out';
    const isInflow = voucherData.direction === 'in';
    const currWallet = safeData.balances?.[currency] || { currentBalance: 0, denominations: {} };
    const currentBal = Number(currWallet.currentBalance) || 0;
    const currentDenoms = currWallet.denominations || {};
    const denominations = voucherData.denominations || {};

    if (isOutflow) {
      if (currentBal < numAmount && !allowOverdraft) {
        throw new Error(
          `رصيد الخزينة الحالي (${currentBal.toLocaleString()} ${currency}) لا يكفي لصرف مبلغ السند (${numAmount.toLocaleString()} ${currency}). يرجى تغذية الخزينة أو التحويل إليها أولاً.`
        );
      }

      if (currency === 'EGP') {
        const denomSum = Object.entries(denominations).reduce(
          (acc, [d, c]) => acc + (Number(d) * (Number(c) || 0)),
          0
        );
        if (denomSum > 0) {
          const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, true);
          if (!sufficiency.isSufficient && !allowOverdraft) {
            const detailStr = sufficiency.shortages
              .map((s) => `فئة ${s.denom} ج (المطلوب: ${s.requested}، المتوفر: ${s.available})`)
              .join('، ');
            throw new Error(`الفئات الورقية المتوفرة بالخزينة لا تكفي لإتمام الصرف: ${detailStr}`);
          }
        }
      }
    } else if (isInflow) {
      if (currency === 'EGP') {
        const sufficiency = checkSufficientBanknotes(currentDenoms, denominations, false);
        if (!sufficiency.isSufficient) {
          const detailStr = sufficiency.shortages
            .map((s) => `فئة ${s.denom} ج (المطلوب ردها كفكة: ${s.requested}، المتوفر بالخزينة: ${s.available})`)
            .join('، ');
          throw new Error(`الفئات الورقية المتوفرة بالخزينة لا تكفي لرد الفكة المطلوبة: ${detailStr}`);
        }
      }
    }

    // Compute updated balances
    const newBal = isOutflow ? currentBal - numAmount : (isInflow ? currentBal + numAmount : currentBal);
    finalNewBal = newBal;
    const newDenoms = { ...currentDenoms };

    if (currency === 'EGP') {
      for (const denom of EGP_DENOMINATIONS) {
        const count = Number(denominations[denom]) || 0;
        const currentCount = Number(newDenoms[denom]) || 0;
        if (isOutflow) {
          newDenoms[denom] = Math.max(0, currentCount - count);
        } else if (isInflow) {
          newDenoms[denom] = Math.max(0, currentCount + count);
        }
      }
    }

    // Commit safe balance update
    const approveSafePayload = {
      [`balances.${currency}.currentBalance`]: newBal,
      [`balances.${currency}.denominations`]: newDenoms,
      updatedAt: now.toISOString()
    };
    if (currency === 'EGP') {
      approveSafePayload.currentBalance = newBal;
      approveSafePayload.balance = newBal;
      approveSafePayload.denominations = newDenoms;
    }
    transaction.update(safeRef, approveSafePayload);

    // Commit voucher status transition
    const updatePayload = {
      status: 'posted',
      approvedByUserId: currentUser.id,
      approvedByName: currentUser.name || currentUser.nameAr || currentUser.id,
      approvedAt: now.toISOString(),
      balanceAfter: newBal,
      approvalNotes: approvalNotes || '',
      updatedAt: now.toISOString()
    };

    transaction.update(voucherRef, updatePayload);
  });

  // Post-Transaction Side Effects (Custody Ledger)
  if (
    voucherData?.subAccountId &&
    ['custody_issue', 'custody_settle', 'salary_advance', 'advance_settle'].includes(voucherData.type)
  ) {
    await updateCustodyLedgerAfterVoucher({
      workerId: voucherData.subAccountId,
      workerName: voucherData.subAccountName,
      voucherId,
      ssotId: voucherData.ssotId || voucherId,
      targetCustodyId: voucherData.targetCustodyId,
      targetAdvanceId: voucherData.targetAdvanceId,
      type: voucherData.type,
      amount: Number(voucherData.amount) || 0,
      description: voucherData.description,
      safeId: voucherData.safeId,
      attachments: voucherData.attachments
    }).catch((e) => console.warn('[Custody Ledger Sync Error on Approval]:', e));
  }

  // Complete any action required notifications
  await completeActionRequired({
    actionType: 'approve_cash_voucher',
    docId: voucherId,
    completedBy: currentUser.id,
    completedByName: currentUser.name || currentUser.nameAr || currentUser.id,
    resolutionNote: approvalNotes || 'تم الاعتماد المالي والصرف'
  }).catch((e) => console.warn('[Action Complete Error]:', e));

  return { success: true, voucherId, status: 'posted', balanceAfter: finalNewBal };
}

/**
 * Rejects a pending cash voucher with a mandatory reason,
 * leaving safe balances intact and resolving action required notifications.
 */
export async function rejectCashVoucher({
  voucherId,
  currentUser,
  rejectionReason = ''
}) {
  if (!voucherId) throw new Error('رقم السند مطلوب');
  if (!currentUser?.id) throw new Error('بيانات المستخدم المعتمِد مطلوبة');

  const now = new Date();
  const voucherRef = doc(db, 'cash_transactions', voucherId);
  const voucherSnap = await getDoc(voucherRef);
  if (!voucherSnap.exists()) {
    throw new Error(`السند (${voucherId}) غير موجود في قاعدة البيانات`);
  }
  const voucherData = voucherSnap.data();
  if (voucherData.status !== 'pending_approval') {
    throw new Error(`حالة السند الحالية (${voucherData.status}) لا تسمح بالرفض`);
  }

  const cleanReason = rejectionReason.trim() || 'تم الرفض بواسطة المعتمد المالي';

  await updateDoc(voucherRef, {
    status: 'rejected',
    rejectedByUserId: currentUser.id,
    rejectedByName: currentUser.name || currentUser.nameAr || currentUser.id,
    rejectedAt: now.toISOString(),
    rejectionReason: cleanReason,
    updatedAt: now.toISOString()
  });

  // Complete/cancel any action required notifications
  await completeActionRequired({
    actionType: 'approve_cash_voucher',
    docId: voucherId,
    completedBy: currentUser.id,
    completedByName: currentUser.name || currentUser.nameAr || currentUser.id,
    resolutionNote: `مرفوض: ${cleanReason}`
  }).catch((e) => console.warn('[Action Complete Error]:', e));

  return { success: true, voucherId, status: 'rejected' };
}
