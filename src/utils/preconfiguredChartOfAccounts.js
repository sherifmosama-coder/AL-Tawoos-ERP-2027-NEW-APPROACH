/**
 * Pre-configured 127-Account Egyptian Unified Chart of Accounts (COA)
 * Structured in the 16-column Setup-Driven Financial Statements Schema:
 * [code, nameAr, nameEn, level, type, parentCode, statement, reportCategory, statementEffect, nature, cashFlowCategory, subType, requiresCostCenter, displayOrder, descriptionAr, descriptionEn]
 */

export const COA_CSV_HEADERS = [
  'code',
  'nameAr',
  'nameEn',
  'level',
  'type',
  'parentCode',
  'statement',
  'reportCategory',
  'statementEffect',
  'nature',
  'cashFlowCategory',
  'subType',
  'requiresCostCenter',
  'displayOrder',
  'descriptionAr',
  'descriptionEn'
];

export const UPLOADED_CHART_OF_ACCOUNTS_ROWS = [
  // =========================================================================
  // 1 - ASSETS (الأصول)
  // =========================================================================
  ['1', 'الاصول', 'Assets', '1', 'main', '', 'balance_sheet', 'section_header', 'add', 'debit', 'investing', 'asset', 'FALSE', '1', 'إجمالي أصول وموجودات الشركة (طويلة الأجل ومتداولة)', 'Total company assets (non-current and current)'],
  ['101', 'الأصول طويلة الأجل', 'Non-Current Assets', '2', 'main', '1', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '2', 'الأصول الثابتة طويلة الأجل ومجمعات إهلاكها', 'Long-term fixed assets and accumulated depreciation'],
  ['10101', 'الأصول الثابتة', 'Property, Plant and Equipment (PPE)', '3', 'main', '101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '3', 'التكلفة التاريخية للأصول الثابتة والمعدات والآلات', 'Gross historical cost of property, plant, and equipment'],
  ['1010101', 'الأراضي', 'Land', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '4', '', ''],
  ['1010102', 'المباني وإنشاءات', 'Buildings and Construction', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '5', '', ''],
  ['1010103', 'الآلات والمعدات', 'Machinery and Equipment', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '6', '', ''],
  ['1010104', 'عدد وأدوات', 'Tools and Equipment', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '7', '', ''],
  ['1010105', 'سيارات', 'Vehicles', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '8', '', ''],
  ['1010106', 'أثاث ومفروشات', 'Furniture and Fixtures', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '9', '', ''],
  ['1010107', 'تجهيزات وديكورات', 'Leasehold Fittings and Decorations', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '10', '', ''],
  ['1010108', 'تحسينات مباني مستأجرة', 'Leasehold Improvements', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '11', '', ''],
  ['1010109', 'حاسبات وأجهزة كمبيوتر وطابعات', 'Computers, Hardware and Printers', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '12', '', ''],
  ['1010110', 'أجهزة كهربائية', 'Electrical Appliances', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '13', '', ''],
  ['1010111', 'أجهزة مراقبة وبرامج', 'Surveillance Systems and Software', '4', 'sub', '10101', 'balance_sheet', 'fixed_asset', 'add', 'debit', 'investing', 'asset', 'FALSE', '14', '', ''],

  // Contra-Asset: Accumulated Depreciation (statementEffect = 'deduct')
  ['10102', 'مجمع إهلاك الأصول الثابتة', 'Accumulated Depreciation of PPE', '3', 'main', '101', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '15', 'حساب عكسي يُخصم من إجمالي الأصول الثابتة للوصول لصافي القيمة الدفترية', 'Contra-asset deducted from gross PPE to arrive at Net Book Value'],
  ['1010202', 'مجمع إهلاك المباني وإنشاءات', 'Accumulated Depreciation of Buildings', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '16', '', ''],
  ['1010203', 'مجمع إهلاك الآلات والمعدات', 'Accumulated Depreciation of Machinery and Equipment', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '17', '', ''],
  ['1010204', 'مجمع إهلاك عدد وأدوات', 'Accumulated Depreciation of Tools and Equipment', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '18', '', ''],
  ['1010205', 'مجمع إهلاك سيارات', 'Accumulated Depreciation of Vehicles', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '19', '', ''],
  ['1010206', 'مجمع إهلاك أثاث ومفروشات', 'Accumulated Depreciation of Furniture and Fixtures', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '20', '', ''],
  ['1010207', 'مجمع إهلاك تجهيزات وديكورات', 'Accumulated Depreciation of Leasehold Fittings', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '21', '', ''],
  ['1010208', 'مجمع إهلاك تحسينات مباني مستأجرة', 'Accumulated Depreciation of Leasehold Improvements', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '22', '', ''],
  ['1010209', 'مجمع إهلاك حاسبات وأجهزة كمبيوتر وطابعات', 'Accumulated Depreciation of Computers and Hardware', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '23', '', ''],
  ['1010210', 'مجمع إهلاك أجهزة كهربائية', 'Accumulated Depreciation of Electrical Appliances', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '24', '', ''],
  ['1010211', 'مجمع إهلاك أجهزة مراقبة وبرامج', 'Accumulated Depreciation of Surveillance Systems & Software', '4', 'sub', '10102', 'balance_sheet', 'fixed_asset', 'deduct', 'credit', 'investing', 'asset', 'FALSE', '25', '', ''],

  // 102 - Current Assets (الأصول المتداولة)
  ['102', 'الأصول المتداولة', 'Current Assets', '2', 'main', '1', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'asset', 'FALSE', '26', 'الأصول المتداولة السائلة وقصيرة الأجل', 'Liquid and short-term current assets'],
  ['10201', 'النقدية وما في حكمها', 'Cash and Cash Equivalents', '3', 'main', '102', 'balance_sheet', 'current_asset', 'add', 'debit', 'cash_equivalent', 'safe', 'FALSE', '27', 'إجمالي النقدية بالصناديق والحسابات البنكية', 'Total cash on hand and corporate bank balances'],
  ['1020101', 'النقدية بالصندوق', 'Cash on Hand / Petty Cash', '4', 'main', '10201', 'balance_sheet', 'current_asset', 'add', 'debit', 'cash_equivalent', 'safe', 'FALSE', '28', '', ''],
  ['1020102', 'النقدية بالبنوك', 'Cash at Banks', '4', 'main', '10201', 'balance_sheet', 'current_asset', 'add', 'debit', 'cash_equivalent', 'bank', 'TRUE', '29', '', ''],
  ['10202', 'المخزون', 'Inventory', '3', 'main', '102', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'inventory', 'TRUE', '30', 'إجمالي مخزون الخامات والإنتاج تحت التشغيل والإنتاج التام', 'Total raw materials, WIP, and finished goods inventory'],
  ['1020201', 'مخزون المواد الخام', 'Raw Materials Inventory', '4', 'main', '10202', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'inventory', 'TRUE', '31', '', ''],
  ['1020202', 'مخزون المواد تحت التشغيل', 'Work in Progress (WIP) Inventory', '4', 'main', '10202', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'inventory', 'TRUE', '32', '', ''],
  ['1020203', 'مخزون الإنتاج التام', 'Finished Goods Inventory', '4', 'main', '10202', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'inventory', 'TRUE', '33', '', ''],
  ['10203', 'العملاء وأوراق القبض', 'Accounts and Notes Receivable', '3', 'main', '102', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'client', 'TRUE', '34', 'مديونيات العملاء وأوراق القبض التجارية', 'Customer trade receivables and notes receivable'],
  ['1020301', 'العملاء', 'Trade Debtors / Customers', '4', 'main', '10203', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'client', 'TRUE', '35', '', ''],
  ['1020302', 'أوراق القبض', 'Notes Receivable', '4', 'main', '10203', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'client', 'TRUE', '36', '', ''],
  ['10204', 'أرصدة مدينة أخرى', 'Other Debit Balances', '3', 'main', '102', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'asset', 'TRUE', '37', 'العهد والسلف والتأمينات والضرائب المستردة والمصروفات المقدمة', 'Custodies, advances, deposits, refundable taxes, and prepaids'],
  ['1020401', 'العهد', 'Employee Custodies and Advances', '4', 'main', '10204', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'worker', 'FALSE', '38', '', ''],
  ['1020402', 'السلف', 'Staff Loans', '4', 'main', '10204', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'worker', 'FALSE', '39', '', ''],
  ['1020403', 'تأمين لدى الغير', 'Security Deposits with Others', '4', 'main', '10204', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'asset', 'FALSE', '40', '', ''],
  ['1020404', 'ضريبة قيمة مضافة مدخلات', 'Input Value Added Tax (VAT)', '4', 'sub', '10204', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'asset', 'FALSE', '41', '', ''],
  ['1020405', 'ضريبة أرباح تجارية وصناعية', 'Withholding Tax (WHT) Receivable', '4', 'sub', '10204', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'asset', 'FALSE', '42', '', ''],
  ['1020406', 'مصروفات مقدمة', 'Prepaid Expenses', '4', 'sub', '10204', 'balance_sheet', 'current_asset', 'add', 'debit', 'operating', 'asset', 'FALSE', '43', '', ''],

  // =========================================================================
  // 2 - LIABILITIES & EQUITY (الالتزامات وحقوق الملكية)
  // =========================================================================
  ['2', 'الالتزامات وحقوق الملكية', 'Liabilities and Equity', '1', 'main', '', 'balance_sheet', 'section_header', 'add', 'credit', 'financing', 'liability', 'FALSE', '45', 'إجمالي مصادر التمويل من حقوق الملكية والالتزامات', 'Total liabilities and shareholders equity'],
  ['201', 'حقوق الملكية', 'Equity', '2', 'main', '2', 'balance_sheet', 'equity', 'add', 'credit', 'financing', 'equity', 'FALSE', '46', 'رأس المال والأرباح المرحلة وجاري الشركاء', 'Share capital, retained earnings, and partners current accounts'],
  ['20101', 'رأس المال', 'Share Capital', '3', 'main', '201', 'balance_sheet', 'equity', 'add', 'credit', 'financing', 'equity', 'FALSE', '47', '', ''],
  ['20102', 'أرباح ( خسائر ) مرحلة', 'Retained Earnings / Accumulated Losses', '3', 'main', '201', 'balance_sheet', 'equity', 'add', 'credit', 'financing', 'equity', 'FALSE', '48', '', ''],
  ['20103', 'صافي أرباح / خسائر العام الحالي', 'Net Income / Loss for the Current Year', '3', 'main', '201', 'balance_sheet', 'equity', 'add', 'credit', 'financing', 'equity', 'FALSE', '49', '', ''],
  ['20104', 'جاري الشركاء', "Partners' Current Accounts", '3', 'main', '201', 'balance_sheet', 'equity', 'add', 'credit', 'financing', 'equity', 'FALSE', '50', '', ''],
  ['2010401', 'جاري الشريك 1', 'Partner 1 Current Account', '4', 'main', '20104', 'balance_sheet', 'equity', 'add', 'credit', 'financing', 'equity', 'FALSE', '51', '', ''],
  ['2010402', 'جاري الشريك 2', 'Partner 2 Current Account', '4', 'main', '20104', 'balance_sheet', 'equity', 'add', 'credit', 'financing', 'equity', 'FALSE', '52', '', ''],

  // 202 - Current Liabilities (الالتزامات المتداولة)
  ['202', 'الالتزامات المتداولة', 'Current Liabilities', '2', 'main', '2', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '53', 'الالتزامات والمستحقات قصيرة الأجل', 'Short-term obligations and payables'],
  ['20201', 'الموردين وأوراق الدفع', 'Accounts and Notes Payable', '3', 'main', '202', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '54', 'إجمالي مستحقات موردي الخامات والخدمات وأوراق الدفع', 'Total trade payables to suppliers and notes payable'],
  ['2020101', 'موردين خامات', 'Raw Material Suppliers', '4', 'main', '20201', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'supplier', 'FALSE', '55', '', ''],
  ['2020102', 'موردين خدمات', 'Service Suppliers', '4', 'main', '20201', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'supplier', 'FALSE', '56', '', ''],
  ['2020103', 'أوراق الدفع', 'Notes Payable', '4', 'main', '20201', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '57', '', ''],
  ['20202', 'دائنون وأرصدة دائنة أخرى', 'Other Credit Balances', '3', 'main', '202', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '58', 'مستحقات الضرائب والتأمينات الاجتماعية والأرصدة الدائنة', 'Tax authority payables, social insurance, and other credit balances'],
  ['2020201', 'ضريبة قيمة مضافة مخرجات', 'Output Value Added Tax (VAT)', '4', 'sub', '20202', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '59', '', ''],
  ['2020202', 'تسوية حساب ضريبة القيمة المضافة', 'VAT Settlement Account', '4', 'sub', '20202', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '60', '', ''],
  ['2020203', 'ضريبة الخصم والإضافة', 'Withholding Tax (WHT) Payable', '4', 'sub', '20202', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '61', '', ''],
  ['2020204', 'هيئة التأمينات الاجتماعية', 'Social Insurance Authority', '4', 'sub', '20202', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '62', '', ''],
  ['20203', 'حسابات مستحقة', 'Accrued Expenses', '3', 'main', '202', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '63', 'الأجور والإيجارات والمصروفات المستحقة غير المسددة', 'Accrued wages, rent, consultancy, and other unpaid expenses'],
  ['2020301', 'أجور مستحقة', 'Accrued Wages and Salaries', '4', 'sub', '20203', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '64', '', ''],
  ['2020302', 'استشارات مستحقة', 'Accrued Consultancy Fees', '4', 'sub', '20203', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '65', '', ''],
  ['2020303', 'إيجارات مستحقة', 'Accrued Rent', '4', 'sub', '20203', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '66', '', ''],
  ['2020304', 'مصروفات عقود بيع مستحقة', 'Accrued Sales Contract Expenses', '4', 'sub', '20203', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '67', '', ''],
  ['2020309', 'مصروفات أخرى مستحقة', 'Other Accrued Expenses', '4', 'sub', '20203', 'balance_sheet', 'current_liability', 'add', 'credit', 'operating', 'liability', 'FALSE', '68', '', ''],
  ['20204', 'القروض قصيرة الأجل', 'Short-Term Loans and Bank Overdrafts', '3', 'main', '202', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '69', 'التسهيلات الائتمانية والقروض البنكية قصيرة الأجل', 'Short-term bank loans and credit overdraft facilities'],
  ['2020401', 'UNB LOAN 2', 'UNB Loan 2', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '70', '', ''],
  ['2020402', 'QNB Equipments ( Tahini machine )', 'QNB Equipment Loan (Tahini Machine)', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '71', '', ''],
  ['2020403', 'QNB CAR LOAN DABABA', 'QNB Car Loan (Dababa)', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '72', '', ''],
  ['2020404', 'QNB CAR LOAN NEW JUMBO', 'QNB Car Loan (New Jumbo)', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '73', '', ''],
  ['2020405', 'QNB Equipments ( Vinegar machine )', 'QNB Equipment Loan (Vinegar Machine)', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '74', '', ''],
  ['2020406', 'CIB Real Loan', 'CIB Real Estate Loan', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '75', '', ''],
  ['2020407', 'AAIB Real LOAN', 'AAIB Real Estate Loan', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '76', '', ''],
  ['2020408', 'NBE Purchasing OD', 'NBE Purchasing Overdraft', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '77', '', ''],
  ['2020409', 'NBE Cash OD', 'NBE Cash Overdraft', '4', 'sub', '20204', 'balance_sheet', 'current_liability', 'add', 'credit', 'financing', 'liability', 'FALSE', '78', '', ''],

  // =========================================================================
  // 3 - EXPENSES (المصروفات والتكاليف)
  // =========================================================================
  ['3', 'المصروفات', 'Expenses', '1', 'main', '', 'income_statement', 'section_header', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '79', 'إجمالي التكاليف والمصروفات التشغيلية والبيعية والإدارية', 'Total direct costs and operating expenses'],
  ['301', 'تكلفة البضاعة المباعة', 'Cost of Goods Sold (COGS)', '2', 'main', '3', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '80', 'إجمالي تكلفة المبيعات والتشغيل الصناعي المباشر', 'Total direct cost of goods manufactured and sold'],
  ['30101', 'تكلفة المواد الخام', 'Raw Material Costs', '3', 'main', '301', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '81', 'تكلفة الخامات ومستلزمات الإنتاج المنصرفة للتشغيل', 'Direct raw materials consumed in production'],
  ['3010101', 'تكلفة صرف مواد خام مستخدمة', 'Cost of Issued Raw Materials', '4', 'sub', '30101', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '82', '', ''],
  ['30102', 'مصروفات التشغيل', 'Factory / Operating Expenses', '3', 'main', '301', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '83', 'أجور ومصروفات تشغيل وصيانة وإهلاك المصنع المباشرة', 'Direct factory labor, utilities, maintenance, and plant depreciation'],
  ['3010201', 'مصروف أجور ورواتب', 'Wages and Salaries Expense (Factory)', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'worker', 'TRUE', '84', '', ''],
  ['3010202', 'مصروف إيجارات', 'Rent Expense (Factory)', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '85', '', ''],
  ['3010203', 'مصروف استهلاك كهرباء', 'Electricity Expense (Factory)', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '86', '', ''],
  ['3010204', 'مصروف صيانة', 'Maintenance Expense (Factory)', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '87', '', ''],
  ['3010205', 'مصروف نظافة ومكافحة آفات', 'Cleaning and Pest Control Expense', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '88', '', ''],
  ['3010206', 'مصروف انتقالات ونقل عمال', 'Staff Transportation Expense (Factory)', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '89', '', ''],
  ['3010207', 'مصروف مستلزمات تشغيل', 'Factory Consumables Expense', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '90', '', ''],
  ['3010208', 'مصروف أدوات مكتبية', 'Stationery Expense (Factory)', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '91', '', ''],
  ['3010209', 'مصروف نولون وتحميل بضائع', 'Freight and Freight-In Expense', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '92', '', ''],
  ['3010210', 'مصروف إكراميات تشغيل', 'Operating Tips and Gratuities', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '93', '', ''],
  ['3010211', 'مصروف إهلاك آلات ومعدات تشغيلي', 'Depreciation Expense (Machinery & Equipment)', '4', 'sub', '30102', 'income_statement', 'cogs_direct', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '94', '', ''],

  // 302 - SG&A & Financing Umbrella
  ['302', 'المصروفات البيعية والإدارية', 'Selling, General and Administrative Expenses (SG&A)', '2', 'main', '3', 'income_statement', 'section_header', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '95', 'المصروفات البيعية والتسويقية والعمومية والإدارية والتمويلية', 'Selling, marketing, administrative, and financing expenses'],
  ['30201', 'مصروفات البيع والتسويق', 'Selling and Marketing Expenses', '3', 'main', '302', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '96', 'إجمالي مصروفات البيع والتوزيع والتسويق وأسطول النقل', 'Total selling, marketing, and distribution fleet expenses'],
  ['3020101', 'مصروف أجور ورواتب بيع وتسويق', 'Salaries Expense (Sales & Marketing)', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'worker', 'TRUE', '97', '', ''],
  ['3020102', 'مصروف عمولات بيع وتسويق', 'Sales Commissions Expense', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '98', '', ''],
  ['3020103', 'مصروف محروقات وبنزين سيارات', 'Fuel and Gasoline Expense (Sales)', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '99', '', ''],
  ['3020104', 'مصروف توكيل وصيانة سيارات', 'Vehicle Maintenance Expense (Sales)', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '100', '', ''],
  ['3020105', 'مصروف تراخيص وتجديد رخص سيارات', 'Vehicle Licensing and Renewal Expense', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '101', '', ''],
  ['3020106', 'مصروف غرامات وكارتات طريق', 'Traffic Fines and Toll Fees Expense', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '102', '', ''],
  ['3020107', 'مصروف جراج للسيارات', 'Vehicle Garage Rent Expense', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '103', '', ''],
  ['3020108', 'مصروف عقود عملاء', 'Customer Contracts Expense', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '104', '', ''],
  ['3020109', 'إكراميات بيع وتسويق', 'Tips and Gratuities (Sales)', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '105', '', ''],
  ['3020110', 'مصروف إهلاك أصول ثابتة بيع وتسويق', 'Depreciation Expense (Sales Assets)', '4', 'sub', '30201', 'income_statement', 'selling_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '106', '', ''],

  ['30202', 'مصروفات إدارية وعمومية', 'General and Administrative Expenses (G&A)', '3', 'main', '302', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '107', 'إجمالي المصروفات العمومية والإدارية للمقر والإدارة', 'Total general and administrative expenses'],
  ['3020201', 'مصروف أجور ورواتب عمومية', 'Salaries Expense (Administrative)', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'worker', 'TRUE', '108', '', ''],
  ['3020202', 'مصروف رسوم حكومية', 'Government Fees Expense', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '109', '', ''],
  ['3020203', 'مصروف استشارات وأتعاب', 'Legal and Professional Fees Expense', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '110', '', ''],
  ['3020204', 'مصروف إيجارات عمومية', 'Rent Expense (Administrative)', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '111', '', ''],
  ['3020205', 'مصروف استهلاك كهرباء عمومية', 'Electricity Expense (Administrative)', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '112', '', ''],
  ['3020206', 'مصروف صيانة عمومية', 'Maintenance Expense (Administrative)', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '113', '', ''],
  ['3020207', 'إكراميات عمومية', 'Tips and Gratuities (Administrative)', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '114', '', ''],
  ['3020208', 'مصروف إهلاك أصول ثابتة عمومية وإدارية', 'Depreciation Expense (G&A Assets)', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'TRUE', '115', '', ''],
  ['3020209', 'عجز وفروق تسوية جرد الخزينة', 'Cash Shortage & Discrepancy Expense', '4', 'sub', '30202', 'income_statement', 'admin_expense', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '116', '', ''],

  ['30203', 'مصروفات تمويل', 'Financing Expenses / Costs', '3', 'main', '302', 'income_statement', 'financing_expense', 'add', 'debit', 'operating', 'cost_center', 'FALSE', '117', 'العمولات البنكية ومصروفات وفوائد القروض والتسهيلات', 'Bank charges, loan interest, and financing costs'],
  ['3020301', 'مصروف ورسوم بنكية', 'Bank Charges and Fees', '4', 'sub', '30203', 'income_statement', 'financing_expense', 'add', 'debit', 'financing', 'bank', 'TRUE', '118', '', ''],
  ['3020302', 'مصروف فوائد قروض', 'Loan Interest Expense', '4', 'sub', '30203', 'income_statement', 'financing_expense', 'add', 'debit', 'financing', 'cost_center', 'TRUE', '119', '', ''],

  // =========================================================================
  // 4 - REVENUES (الإيرادات)
  // =========================================================================
  ['4', 'الإيرادات', 'Revenues', '1', 'main', '', 'income_statement', 'section_header', 'add', 'credit', 'operating', 'revenue', 'FALSE', '120', 'إجمالي إيرادات النشاط التشغيلي والإيرادات الأخرى', 'Total operating and non-operating revenues'],
  ['401', 'إيرادات النشاط', 'Operating Revenues', '2', 'main', '4', 'income_statement', 'section_header', 'add', 'credit', 'operating', 'revenue', 'FALSE', '121', 'إيرادات المبيعات والإيرادات المتنوعة', 'Sales revenues and miscellaneous income'],
  ['40101', 'إيرادات مبيعات', 'Sales Revenues', '3', 'main', '401', 'income_statement', 'operating_revenue', 'add', 'credit', 'operating', 'revenue', 'FALSE', '122', 'صافي إيرادات مبيعات الإنتاج التام', 'Net sales revenue from finished goods'],
  ['4010101', 'إيراد مبيعات إنتاج تام', 'Sales of Finished Goods', '4', 'sub', '40101', 'income_statement', 'operating_revenue', 'add', 'credit', 'operating', 'revenue', 'FALSE', '123', '', ''],
  ['40102', 'إيرادات أخرى', 'Other Revenues / Income', '3', 'main', '401', 'income_statement', 'other_revenue_expense', 'add', 'credit', 'operating', 'revenue', 'FALSE', '124', 'إيرادات بيع الهوالك والفوائد الدائنة وفروق الجرد', 'Scrap sales, credit interest, and surplus adjustments'],
  ['4010201', 'إيراد بيع توالف وهوالك', 'Scrap and Waste Sales Revenue', '4', 'sub', '40102', 'income_statement', 'other_revenue_expense', 'add', 'credit', 'operating', 'revenue', 'FALSE', '125', '', ''],
  ['4010202', 'فوائد دائنة', 'Interest Income', '4', 'sub', '40102', 'income_statement', 'other_revenue_expense', 'add', 'credit', 'operating', 'bank', 'FALSE', '126', '', ''],
  ['4010203', 'إيرادات استثمارات بنكية', 'Banking Investments Income', '4', 'sub', '40102', 'income_statement', 'other_revenue_expense', 'add', 'credit', 'operating', 'bank', 'FALSE', '127', '', ''],
  ['4010204', 'أرباح وفروق تسوية جرد الخزينة', 'Cash Surplus & Discrepancy Revenue', '4', 'sub', '40102', 'income_statement', 'other_revenue_expense', 'add', 'credit', 'operating', 'revenue', 'FALSE', '128', '', '']
];

/**
 * Generates UTF-8 BOM CSV string for the 16-column COA sheet (either from live accounts or the pre-filled 127-account sheet)
 */
export function buildAccountsCSVString(accountsArray = null) {
  let rowsToExport = UPLOADED_CHART_OF_ACCOUNTS_ROWS;

  if (Array.isArray(accountsArray) && accountsArray.length > 0) {
    const sorted = [...accountsArray].sort((a, b) => {
      const ordA = Number(a.displayOrder) || 9999;
      const ordB = Number(b.displayOrder) || 9999;
      if (ordA !== ordB) return ordA - ordB;
      return String(a.code || a.id || '').localeCompare(String(b.code || b.id || ''));
    });

    rowsToExport = sorted.map((acc, idx) => [
      acc.code || acc.id || '',
      acc.nameAr || '',
      acc.nameEn || '',
      String(acc.level || ''),
      acc.type || 'main',
      acc.parentCode || acc.parentAccountId || '',
      acc.statement || 'balance_sheet',
      acc.reportCategory || 'current_asset',
      acc.statementEffect || 'add',
      acc.nature || 'debit',
      acc.cashFlowCategory || 'operating',
      acc.subType || 'cost_center',
      acc.requiresCostCenter ? 'TRUE' : 'FALSE',
      String(acc.displayOrder || idx + 1),
      acc.descriptionAr || acc.notes || '',
      acc.descriptionEn || ''
    ]);
  }

  const csvRows = [
    COA_CSV_HEADERS.join(','),
    ...rowsToExport.map((r) =>
      r
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
  ];

  return '\uFEFF' + csvRows.join('\r\n');
}
