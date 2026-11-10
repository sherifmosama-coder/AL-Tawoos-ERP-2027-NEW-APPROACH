/**
 * Central Metadata Blueprint (app_architecture)
 * Single Source of Truth for:
 * 1. UI Navigation & Role-Based Permissions (RBAC) with Cascade Deselection
 * 2. Dynamic Universal CSV Import / Template Generation
 * 3. Dynamic Database Purge & Factory Reset Cascades
 * 4. Sensitive Field Privacy Masking
 * 5. Single Source of Truth (SSOT) Inventory Ledger Taxonomy
 * 6. Reusable Row-Level Collaborative Comments & Per-Message Task Engine
 */

export const APP_ARCHITECTURE = {
  version: "3.8.0",
  lastUpdated: "2026-10-15",
  
  modules: {
    master_data: {
      id: "master_data",
      labelAr: "قاعدة البيانات الأساسية",
      labelEn: "Master Database",
      icon: "Database",
      tabs: {
        items: {
          id: "items",
          collection: "items",
          labelAr: "كارت الأصناف والخامات",
          labelEn: "Item Master & Variations",
          icon: "Package",
          actions: [
            { key: "canCreate", labelAr: "إضافة خامة جديدة", labelEn: "Create Item" },
            { key: "canEdit", labelAr: "تعديل بيانات الخامة", labelEn: "Edit Item" },
            { key: "canDelete", labelAr: "حذف خامة", labelEn: "Delete Item" },
          ],
          fields: {
            code: { labelAr: "كود الخامة الأساسي", labelEn: "Item Code", type: "string", required: true, sample: "F-101" },
            nameAr: { labelAr: "اسم الخامة (عربي)", labelEn: "Item Name (Ar)", type: "string", required: true, sample: "زجاجة بولي إيثيلين 1 لتر" },
            nameEn: { labelAr: "اسم الخامة (إنجليزي)", labelEn: "Item Name (En)", type: "string", sample: "1L HDPE Bottle" },
            shortName: { labelAr: "الاسم المختصر", labelEn: "Short Name", type: "string", sample: "زجاجة 1 لتر" },
            categoryId: { labelAr: "رقم الفئة (1-9)", labelEn: "Category ID (1-9)", type: "number", sample: 1 },
            flags: { labelAr: "طبيعة الاستخدام (F, M, R, X)", labelEn: "Usage Flags", type: "string", sample: "F, M" },
            smallUnit: { labelAr: "الوحدة الصغرى (المعاملات)", labelEn: "Small Unit", type: "string", required: true, sample: "عبوة" },
            largeUnitName: { labelAr: "الوحدة الكبرى (التعبئة)", labelEn: "Large Unit", type: "string", sample: "كرتونة" },
            vatRate: { labelAr: "نسبة ضريبة القيمة المضافة", labelEn: "VAT Rate", type: "string", sample: "14%" },
            whtRate: { labelAr: "نسبة ضريبة الخصم", labelEn: "WHT Rate", type: "string", sample: "1%" },
            reorderLevel: { labelAr: "حد إعادة الطلب", labelEn: "Reorder Threshold", type: "number", sample: 5000 },
            masterSpecs: { labelAr: "المواصفات الفنية الرئيسية للصنف", labelEn: "Master Technical Specs", type: "string", sample: "الخامة: HDPE | اللون: أبيض" },
            isStocklessUtility: { labelAr: "خامة خدمية متجددة بدون رصيد (مياه الشرب)", labelEn: "Stockless Utility", type: "boolean", sample: false },
            skipOrdinaryStockTransfer: { labelAr: "استبعاد من النقل العادي (ضخ عبر الأنابيب)", labelEn: "Skip Ordinary Transfer", type: "boolean", sample: false },
            rawMaterialSourceWh: { labelAr: "مستودع سحب الخامات (للتانكات والمواسير)", labelEn: "Source Raw WH", type: "string", sample: "WH-01" },
            needsQA: { labelAr: "يتطلب فحص معملي (QA) قبل الضخ", labelEn: "Requires Lab QA", type: "boolean", sample: false },
            var_suffix: { labelAr: "لاحقة التنوع (-A/-B)", labelEn: "Variant Suffix", type: "string", sample: "A" },
            var_supplierId: { labelAr: "كود مورد التنوع", labelEn: "Variant Supplier ID", type: "string", sample: "SUP-101" },
            var_packagingRatio: { labelAr: "معدل الشدة (العبوات/الكرتونة)", labelEn: "Packaging Ratio (الشدة)", type: "number", sample: 100 },
            var_smallUnit: { labelAr: "الوحدة الصغرى للتنوع", labelEn: "Variant Small Unit", type: "string", sample: "عبوة" },
            var_largeUnitName: { labelAr: "الوحدة الكبرى للتنوع", labelEn: "Variant Large Unit", type: "string", sample: "كرتونة" },
            var_specs: { labelAr: "المواصفات الفنية للتنوع", labelEn: "Variant Technical Specs", type: "string", sample: "الوزن: 24 جرام | مقاس العنق: 28 مم" },
            var_openingWarehouse: { labelAr: "مستودع الرصيد الافتتاحي", labelEn: "Opening Warehouse", type: "string", sample: "WH-01" },
            var_openingQtySmall: { labelAr: "كمية الرصيد الافتتاحي (الوحدة الصغرى)", labelEn: "Opening Qty (Small Units)", type: "number", sample: 5000 },
            var_openingUnitCost: { labelAr: "تكلفة الوحدة الافتتاحية (EGP)", labelEn: "Opening Unit Cost (EGP)", type: "number", isSensitive: true, sample: 4.50 },
            var_openingBatchNo: { labelAr: "رقم تشغيلة الرصيد الافتتاحي", labelEn: "Opening Batch/Lot #", type: "string", sample: "OB-LOT-01" },
          }
        },
        suppliers: {
          id: "suppliers",
          collection: "suppliers",
          labelAr: "سجل الموردين المعتمدين",
          labelEn: "Supplier Master",
          icon: "Building2",
          actions: [
            { key: "canCreate", labelAr: "إضافة مورد جديد", labelEn: "Create Supplier" },
            { key: "canEdit", labelAr: "تعديل بيانات المورد", labelEn: "Edit Supplier" },
            { key: "canDelete", labelAr: "حذف مورد", labelEn: "Delete Supplier" },
          ],
          fields: {
            id: { labelAr: "كود المورد", labelEn: "Supplier ID", type: "string", required: true, sample: "SUP-101" },
            name: { labelAr: "اسم الشهرة التجاري", labelEn: "Trade Name", type: "string", required: true, sample: "شركة الأهرام للبلاستيك والعبوات" },
            taxpayerLegalName: { labelAr: "اسم الممول القانوني", labelEn: "Legal Taxpayer Name", type: "string", sample: "شركة الأهرام لصناعة البلاستيك ش.م.م" },
            taxCardNumber: { labelAr: "البطاقة الضريبية", labelEn: "Tax Card ID", type: "string", isSensitive: true, sample: "123-456-789" },
            commercialRegister: { labelAr: "السجل التجاري", labelEn: "Commercial Register", type: "string", isSensitive: true, sample: "104822" },
            taxFileNumber: { labelAr: "رقم الملف الضريبي", labelEn: "Tax File No.", type: "string", sample: "54321" },
            taxDistrict: { labelAr: "المأمورية التابع لها", labelEn: "Tax District", type: "string", sample: "مأمورية ضرائب أبطال صطح 6 أكتوبر" },
            taxpayerAddress: { labelAr: "العنوان المسجل", labelEn: "Tax Address", type: "string", sample: "المنطقة الصناعية الثالثة 6 أكتوبر" },
            openingBalance: { labelAr: "الرصيد الافتتاحي (EGP)", labelEn: "Opening Balance", type: "number", isSensitive: true, sample: 0 },
            whtCompliance: { labelAr: "موقف ضريبة الخصم (credit_notes/advance_payment)", labelEn: "WHT Compliance", type: "enum", options: ["credit_notes", "advance_payment"], sample: "credit_notes" },
            whtAdvanceExpiryDate: { labelAr: "تاريخ انتهاء شهادة الدفعات المقدمة", labelEn: "WHT Advance Expiry Date", type: "date", sample: "2027-12-31" },
            paymentTermsCount: { labelAr: "عدد دفعات السداد (1-4)", labelEn: "Tranches Count", type: "number", sample: 2 },
            tranche1_percent: { labelAr: "نسبة الدفعة 1 (%)", labelEn: "Tranche 1 %", type: "number", sample: 50 },
            tranche1_days: { labelAr: "مهلة الدفعة 1 (يوم)", labelEn: "Tranche 1 Days", type: "number", sample: 0 },
            tranche1_base: { labelAr: "أساس الدفعة 1 (delivery_date/end_of_month)", labelEn: "Tranche 1 Base", type: "enum", options: ["delivery_date", "end_of_month"], sample: "delivery_date" },
            tranche2_percent: { labelAr: "نسبة الدفعة 2 (%)", labelEn: "Tranche 2 %", type: "number", sample: 50 },
            tranche2_days: { labelAr: "مهلة الدفعة 2 (يوم)", labelEn: "Tranche 2 Days", type: "number", sample: 30 },
            tranche2_base: { labelAr: "أساس الدفعة 2", labelEn: "Tranche 2 Base", type: "enum", options: ["delivery_date", "end_of_month"], sample: "delivery_date" },
            tranche3_percent: { labelAr: "نسبة الدفعة 3 (%)", labelEn: "Tranche 3 %", type: "number", sample: 0 },
            tranche3_days: { labelAr: "مهلة الدفعة 3 (يوم)", labelEn: "Tranche 3 Days", type: "number", sample: 0 },
            tranche3_base: { labelAr: "أساس الدفعة 3", labelEn: "Tranche 3 Base", type: "enum", options: ["delivery_date", "end_of_month"], sample: "delivery_date" },
            tranche4_percent: { labelAr: "نسبة الدفعة 4 (%)", labelEn: "Tranche 4 %", type: "number", sample: 0 },
            tranche4_days: { labelAr: "مهلة الدفعة 4 (يوم)", labelEn: "Tranche 4 Days", type: "number", sample: 0 },
            tranche4_base: { labelAr: "أساس الدفعة 4", labelEn: "Tranche 4 Base", type: "enum", options: ["delivery_date", "end_of_month"], sample: "delivery_date" },
          }
        },
        clients: {
          id: "clients",
          collection: "clients",
          labelAr: "سجل العملاء المعتمدين",
          labelEn: "Client Master",
          icon: "UserCheck",
          actions: [
            { key: "canCreate", labelAr: "إضافة عميل جديد", labelEn: "Create Client" },
            { key: "canEdit", labelAr: "تعديل بيانات العميل", labelEn: "Edit Client" },
            { key: "canDelete", labelAr: "حذف عميل", labelEn: "Delete Client" },
            { key: "canBulkImport", labelAr: "استيراد عملاء (Excel/CSV)", labelEn: "Bulk Import Clients" },
          ],
          fields: {
            id: { labelAr: "كود العميل", labelEn: "Client ID", type: "string", required: true, sample: "CLI-101" },
            tradeNameAr: { labelAr: "اسم الشهرة التجاري (عربي)", labelEn: "Trade Name (Ar)", type: "string", required: true, sample: "شركة التوفيق للتجارة" },
            tradeNameEn: { labelAr: "اسم الشهرة التجاري (إنجليزي)", labelEn: "Trade Name (En)", type: "string", sample: "Al-Tawfeeq Trading Co." },
            legalName: { labelAr: "اسم الممول القانوني", labelEn: "Taxpayer Legal Name", type: "string", sample: "شركة التوفيق للتجارة والتوزيع ش.ذ.م.م" },
            segmentId: { labelAr: "قطاع / تصنيف العميل", labelEn: "Client Segment", type: "string", required: true, sample: "seg_wholesalers" },
            pricingStrategy: { labelAr: "استراتيجية التسعير", labelEn: "Pricing Strategy", type: "enum", options: ["wholesalers", "retail", "special_pricing"], sample: "wholesalers" },
            taxCardNumber: { labelAr: "البطاقة الضريبية (9 أرقام)", labelEn: "Tax Card ID", type: "string", isSensitive: true, sample: "123-456-789" },
            commercialRegister: { labelAr: "السجل التجاري", labelEn: "Commercial Register", type: "string", isSensitive: true, sample: "109844" },
            taxDistrict: { labelAr: "مأمورية الضرائب التابع لها", labelEn: "Tax District", type: "string", sample: "مأمورية ضرائب الشركات المساهمة" },
            settlementMode: { labelAr: "طريقة السداد المعتمدة", labelEn: "Settlement Mode", type: "enum", options: ["cod", "credit", "rolling_credit"], sample: "cod" },
            creditLimit: { labelAr: "حد الائتمان (0 = غير مقيد / مفتوح)", labelEn: "Credit Limit (0 = Unlimited)", type: "number", isSensitive: true, sample: 0 },
            latestActivityOn: { labelAr: "تاريخ آخر تسليم فعلي", labelEn: "Latest Delivery Date", type: "date", sample: "2026-11-05" },
            branchesCount: { labelAr: "عدد الفروع المسجلة", labelEn: "Branches Count", type: "number", sample: 2 },
          }
        },
        client_segments: {
          id: "client_segments",
          collection: "client_segments",
          labelAr: "تصنيفات وقطاعات العملاء",
          labelEn: "Client Segments",
          icon: "Layers",
          actions: [
            { key: "canCreate", labelAr: "إضافة تصنيف جديد", labelEn: "Create Segment" },
            { key: "canEdit", labelAr: "تعديل بيانات التصنيف", labelEn: "Edit Segment" },
            { key: "canDelete", labelAr: "حذف تصنيف", labelEn: "Delete Segment" },
          ],
          fields: {
            id: { labelAr: "كود التصنيف", labelEn: "Segment Slug/ID", type: "string", required: true, sample: "seg_chains" },
            nameAr: { labelAr: "اسم التصنيف (عربي)", labelEn: "Segment Name (Ar)", type: "string", required: true, sample: "سلاسل تجارية / كبرى" },
            nameEn: { labelAr: "اسم التصنيف (إنجليزي)", labelEn: "Segment Name (En)", type: "string", sample: "Chains & Modern Trade" },
            color: { labelAr: "رمز اللون (Hex Code)", labelEn: "Color Code", type: "string", sample: "#2563eb" },
            icon: { labelAr: "أيقونة التصنيف", labelEn: "Segment Icon", type: "string", sample: "Building2" },
            displayOrder: { labelAr: "ترتيب العرض", labelEn: "Display Order", type: "number", sample: 1 },
          }
        },
        categories: {
          id: "categories",
          collection: "categories",
          labelAr: "مجموعات وتصنيفات التكويد",
          labelEn: "Raw Material Categories",
          icon: "FolderKanban",
          actions: [
            { key: "canCreate", labelAr: "إضافة تصنيف خامات جديد", labelEn: "Create Category" },
            { key: "canEdit", labelAr: "تعديل بيانات التصنيف", labelEn: "Edit Category" },
            { key: "canDelete", labelAr: "حذف تصنيف", labelEn: "Delete Category" },
          ],
          fields: {
            id: { labelAr: "كود التصنيف الأساسي (100-900)", labelEn: "Category Code", type: "number", required: true, sample: 100 },
            nameAr: { labelAr: "اسم التصنيف (عربي)", labelEn: "Category Name (Ar)", type: "string", required: true, sample: "كيماويات وخامات سائلة" },
            nameEn: { labelAr: "اسم التصنيف (إنجليزي)", labelEn: "Category Name (En)", type: "string", sample: "Chemicals & Bulk Liquids" },
            codePrefix: { labelAr: "بادئة الكود (Prefix)", labelEn: "Code Prefix", type: "string", sample: "CHEM" },
            description: { labelAr: "وصف وملاحظات التصنيف", labelEn: "Description", type: "string", sample: "الخامات الكيميائية ومستلزمات خلط السوائل" },
          }
        },
        finished_products: {
          id: "finished_products",
          collection: "finished_products",
          labelAr: "سجل المنتجات التامة",
          labelEn: "Finished Goods Master",
          icon: "PackageCheck",
          actions: [
            { key: "canCreate", labelAr: "إضافة منتج تام جديد", labelEn: "Create Product" },
            { key: "canEdit", labelAr: "تعديل بيانات ومواصفات المنتج", labelEn: "Edit Product" },
            { key: "canDelete", labelAr: "حذف منتج تام", labelEn: "Delete Product" },
          ],
          fields: {
            code: { labelAr: "كود المنتج التام", labelEn: "Product Code", type: "string", required: true, sample: "FG-101" },
            nameAr: { labelAr: "اسم المنتج (عربي)", labelEn: "Product Name (Ar)", type: "string", required: true, sample: "خل أبيض 1 لتر - اقتصادي" },
            nameEn: { labelAr: "اسم المنتج (إنجليزي)", labelEn: "Product Name (En)", type: "string", sample: "White Vinegar 1L - Economy" },
            productionLine: { labelAr: "خط الإنتاج", labelEn: "Production Line", type: "string", sample: "white_o" },
            packagingRatio: { labelAr: "معدل الشدة (العبوات/الكرتونة)", labelEn: "Packaging Ratio", type: "number", required: true, sample: 12 },
            shelfLifeMonths: { labelAr: "مدة الصلاحية القياسية (1-36 شهر)", labelEn: "Shelf Life (Months)", type: "number", required: true, sample: 24 },
          }
        },
        finished_product_categories: {
          id: "finished_product_categories",
          collection: "finished_product_categories",
          labelAr: "تصنيفات ومجموعات المنتج التام",
          labelEn: "FG Categories",
          icon: "Boxes",
          actions: [
            { key: "canCreate", labelAr: "إضافة تصنيف منتج تام جديد", labelEn: "Create FG Category" },
            { key: "canEdit", labelAr: "تعديل بيانات التصنيف", labelEn: "Edit FG Category" },
            { key: "canDelete", labelAr: "حذف تصنيف منتج تام", labelEn: "Delete FG Category" },
          ],
          fields: {
            id: { labelAr: "معرف المجموعة / السلاج", labelEn: "Category Slug / ID", type: "string", required: true, sample: "fmcg-detergents" },
            nameAr: { labelAr: "اسم المجموعة (عربي)", labelEn: "Category Name (Ar)", type: "string", required: true, sample: "المنظفات المنزلية" },
            nameEn: { labelAr: "اسم المجموعة (إنجليزي)", labelEn: "Category Name (En)", type: "string", sample: "Household Detergents" },
            lineCode: { labelAr: "خط الإنتاج المرتبط", labelEn: "Production Line", type: "string", sample: "LINE-01" },
            sortOrder: { labelAr: "ترتيب العرض", labelEn: "Sort Order", type: "number", sample: 1 },
          }
        },
        bom: {
          id: "bom",
          collection: "bom_recipes",
          labelAr: "تعبئة وتغليف المنتج التام (BOM)",
          labelEn: "Packing & Filling BOM",
          icon: "Layers",
          actions: [
            { key: "canCreate", labelAr: "إنشاء تركيبة تعبئة وتغليف جديدة", labelEn: "Create Recipe" },
            { key: "canEdit", labelAr: "تعديل مواصفات ونسب المكونات", labelEn: "Edit Recipe" },
            { key: "canDelete", labelAr: "حذف أو أرشفة تركيبة", labelEn: "Delete Recipe" },
          ],
          fields: {
            code: { labelAr: "كود التركيبة", labelEn: "Recipe Code", type: "string", sample: "BOM-FG101-01" },
            finishedProductId: { labelAr: "كود المنتج التام المستهدف", labelEn: "Target SKU", type: "string", required: true, sample: "FG-101" },
            standardQty: { labelAr: "الكمية القياسية لإنتاج كرتونة واحدة (1 Large Unit)", labelEn: "Std Qty per Carton", type: "number", required: true, sample: 12 },
          }
        },
        intermediate_bom: {
          id: "intermediate_bom",
          collection: "intermediate_recipes",
          labelAr: "تصنيع الخامات الوسيطة (M)",
          labelEn: "Intermediate Manufacturing BOM",
          icon: "FlaskConical",
          actions: [
            { key: "canCreate", labelAr: "إنشاء تركيبة خامة وسيطة جديدة", labelEn: "Create Intermediate Recipe" },
            { key: "canEdit", labelAr: "تعديل نسب وتركيبات الخامات الوسيطة", labelEn: "Edit Intermediate Recipe" },
            { key: "canDelete", labelAr: "حذف أو أرشفة تركيبة خامة وسيطة", labelEn: "Delete Intermediate Recipe" },
          ],
          fields: {
            code: { labelAr: "كود التركيبة الوسيطة", labelEn: "Recipe Code", type: "string", required: true, sample: "IBOM-R301-V1" },
            prepCode: { labelAr: "كود/طريقة التحضير المختصرة (فريد)", labelEn: "Prep Method Code", type: "string", required: true, sample: "100" },
            targetItemId: { labelAr: "الخامة الوسيطة المصنعة (Flag M)", labelEn: "Target Material", type: "string", required: true, sample: "R-301" },
            batchYieldQty: { labelAr: "حجم التشغيلة الإنتاجية", labelEn: "Batch Yield Qty", type: "number", required: true, sample: 1000 },
          }
        },
        production_processes: {
          id: "production_processes",
          collection: "production_processes",
          labelAr: "مسارات وعمليات التشغيل (SOPs)",
          labelEn: "Production Processes & SOPs",
          icon: "Workflow",
          actions: [
            { key: "canCreate", labelAr: "إضافة مسار تشغيل جديد", labelEn: "Create Process" },
            { key: "canEdit", labelAr: "تعديل خطوات ومسار التشغيل", labelEn: "Edit Process" },
            { key: "canDelete", labelAr: "حذف مسار التشغيل", labelEn: "Delete Process" },
            { key: "canAutosaveRework", labelAr: "حفظ مسارات إعادة التشغيل بمكتبة الخط", labelEn: "Autosave Rework SOPs to Line Library" },
          ],
          fields: {
            processCode: { labelAr: "كود المسار", labelEn: "Process Code", type: "string", required: true, sample: "Proc.101" },
            nameAr: { labelAr: "اسم المسار (عربي)", labelEn: "Process Name (Ar)", type: "string", required: true, sample: "خل اوتو" },
            nameEn: { labelAr: "اسم المسار (إنجليزي)", labelEn: "Process Name (En)", type: "string", sample: "Vinegar Auto Line" },
            productionLine: { labelAr: "خط الإنتاج المرتبط", labelEn: "Production Line", type: "string", sample: "white_o" },
            categoryKey: { labelAr: "مفتاح فئة خط الإنتاج", labelEn: "Line Category Key", type: "string", sample: "white_o" },
            isReworkProcess: { labelAr: "مسار إعادة تشغيل مخصص", labelEn: "Is Rework Process", type: "boolean", sample: true },
            reworkFaultTags: { labelAr: "وسوم عيوب المرتجع المرتبطة", labelEn: "Rework Fault Tags", type: "array", sample: ["غطاء تالف", "تسريب"] },
            repeatCount: { labelAr: "تكرار مسار إعادة التشغيل (#)", labelEn: "Rework Repeat Count", type: "number", sample: 1 },
            steps: { labelAr: "خطوات ومراحل التشغيل", labelEn: "Process Steps Roster", type: "array" },
            stepWorkerMemory: { labelAr: "ذاكرة أحدث 5 عمالة لكل خطوة (MRU)", labelEn: "Step MRU Worker Memory", type: "object" },
          }
        },
        warehouses: {
          id: "warehouses",
          collection: "warehouses",
          labelAr: "سجل المستودعات والصالات",
          labelEn: "Warehouses Master",
          icon: "Warehouse",
          actions: [
            { key: "canCreate", labelAr: "إضافة مستودع جديد", labelEn: "Create Warehouse" },
            { key: "canEdit", labelAr: "تعديل بيانات المستودع", labelEn: "Edit Warehouse" },
            { key: "canDelete", labelAr: "حذف مستودع", labelEn: "Delete Warehouse" },
          ],
          fields: {
            code: { labelAr: "كود المستودع", labelEn: "Warehouse Code", type: "string", required: true, sample: "WH-01" },
            nameAr: { labelAr: "اسم المستودع (عربي)", labelEn: "Warehouse Name (Ar)", type: "string", required: true, sample: "مستودع الخامات الرئيسي" },
            nameEn: { labelAr: "اسم المستودع (إنجليزي)", labelEn: "Warehouse Name (En)", type: "string", sample: "Main Raw Materials Warehouse" },
            classification: { labelAr: "التصنيف التشغيلي", labelEn: "Classification", type: "enum", options: ["raw_materials", "factory_floor", "finished_goods", "scrap", "spare_parts"], sample: "raw_materials" },
            color: { labelAr: "لون التمييز", labelEn: "Color", type: "string", sample: "#0d6cba" },
            icon: { labelAr: "الأيقونة", labelEn: "Icon Name", type: "string", sample: "Warehouse" },
            responsibleUserId: { labelAr: "المسؤول / أمين العهدة", labelEn: "Custodian User ID", type: "string", sample: "USR-001" },
            isActive: { labelAr: "حالة النشاط", labelEn: "Active Status", type: "boolean", sample: true },
          }
        },
        safes: {
          id: "safes",
          collection: "cash_safes",
          labelAr: "سجل الخزائن والخزن النقدية",
          labelEn: "Safes & Cash Vaults Master",
          icon: "Vault",
          actions: [
            { key: "canCreate", labelAr: "إضافة خزينة جديدة", labelEn: "Create Safe" },
            { key: "canEdit", labelAr: "تعديل بيانات الخزينة والحدود", labelEn: "Edit Safe" },
            { key: "canDelete", labelAr: "تعطيل أو حذف الخزينة", labelEn: "Delete Safe" },
            { key: "canConfigureAuthorizers", labelAr: "تهيئة المعتمدين العموميين للصرف", labelEn: "Configure General Authorizers" },
          ],
          fields: {
            code: { labelAr: "كود الخزينة", labelEn: "Safe Code", type: "string", required: true, sample: "SAFE-01" },
            nameAr: { labelAr: "اسم الخزينة (عربي)", labelEn: "Safe Name (Ar)", type: "string", required: true, sample: "الخزينة الرئيسية للإدارة" },
            nameEn: { labelAr: "اسم الخزينة (إنجليزي)", labelEn: "Safe Name (En)", type: "string", sample: "Main Admin Vault" },
            custodianUserId: { labelAr: "أمين الخزينة / العهدة", labelEn: "Custodian User", type: "string", sample: "USR-001" },
            authorizerUserId: { labelAr: "معتمد الصرف المالي", labelEn: "Authorizer User", type: "string", sample: "USR-002" },
            currency: { labelAr: "العملة", labelEn: "Currency", type: "string", sample: "EGP" },
            currentBalance: { labelAr: "الرصيد الفعلي الحالي", labelEn: "Current Balance", type: "number", sample: 50000 },
          }
        },
        bank_accounts: {
          id: "bank_accounts",
          collection: "corporate_banks",
          labelAr: "سجل الحسابات والودائع البنكية",
          labelEn: "Bank Accounts Master",
          icon: "Landmark",
          actions: [
            { key: "canCreate", labelAr: "إضافة حساب بنكي جديد", labelEn: "Create Bank Account" },
            { key: "canEdit", labelAr: "تعديل بيانات الحساب والآيبان", labelEn: "Edit Bank Account" },
            { key: "canDelete", labelAr: "تعطيل أو حذف الحساب", labelEn: "Delete Bank Account" },
          ],
          fields: {
            code: { labelAr: "كود الحساب الداخلي", labelEn: "Internal Code", type: "string", required: true, sample: "BANK-NBE-01" },
            bankNameAr: { labelAr: "اسم البنك (عربي)", labelEn: "Bank Name (Ar)", type: "string", required: true, sample: "البنك الأهلي المصري" },
            bankNameEn: { labelAr: "اسم البنك (إنجليزي)", labelEn: "Bank Name (En)", type: "string", sample: "National Bank of Egypt" },
            accountNumber: { labelAr: "رقم الحساب الجاري", labelEn: "Account Number", type: "string", required: true, sample: "1234567890123" },
            iban: { labelAr: "رقم الآيبان الدولي (IBAN)", labelEn: "IBAN", type: "string", sample: "EG123456789012345678901234567" },
            swiftCode: { labelAr: "سويفت كود البنك (SWIFT)", labelEn: "SWIFT / BIC", type: "string", sample: "NBEGEGCX" },
            currency: { labelAr: "العملة", labelEn: "Currency", type: "string", sample: "EGP" },
          }
        },
        vehicles: {
          id: "vehicles",
          collection: "vehicles",
          labelAr: "سجل أسطول الشاحنات والسيارات",
          labelEn: "Vehicles & Logistics Fleet",
          icon: "Truck",
          actions: [
            { key: "canCreate", labelAr: "إضافة مركبة جديدة للأسطول", labelEn: "Create Vehicle" },
            { key: "canEdit", labelAr: "تعديل بيانات ورخص المركبة", labelEn: "Edit Vehicle" },
            { key: "canDelete", labelAr: "تعطيل أو استبعاد مركبة", labelEn: "Delete Vehicle" },
          ],
          fields: {
            plateNumber: { labelAr: "رقم اللوحة المرورية", labelEn: "Plate Number", type: "string", required: true, sample: "س ف ب 1234" },
            makeModel: { labelAr: "الماركة والموديل", labelEn: "Make & Model", type: "string", required: true, sample: "سوزوكي فان 7 راكب" },
            category: { labelAr: "نوع واستخدام المركبة", labelEn: "Category", type: "enum", options: ["van", "pickup", "truck", "forklift", "car", "other"], sample: "van" },
            assignedDriverId: { labelAr: "السائق المسؤول", labelEn: "Assigned Driver", type: "string", sample: "EMP-1042" },
            minCapacityKg: { labelAr: "سعة الحمولة الدنيا (كجم)", labelEn: "Min Load Capacity (kg)", type: "number", sample: 500 },
            optimumCapacityKg: { labelAr: "سعة الحمولة المثالية (كجم)", labelEn: "Optimum Load Capacity (kg)", type: "number", sample: 1500 },
            maxCapacityKg: { labelAr: "سعة الحمولة القصوى (كجم)", labelEn: "Max Load Capacity (kg)", type: "number", sample: 2500 },
            currentOdometer: { labelAr: "قراءة العداد الحالية (كم)", labelEn: "Odometer (km)", type: "number", sample: 45000 },
            licenseExpiry: { labelAr: "تاريخ انتهاء رخصة التسيير", labelEn: "License Expiry Date", type: "date", sample: "2027-06-30" },
          }
        },
        production_workers: {
          id: "production_workers",
          collection: "production_workers",
          labelAr: "سجل عمالة وفنيي الإنتاج",
          labelEn: "Production Workers Directory",
          icon: "Users",
          actions: [
            { key: "canCreate", labelAr: "إضافة فني / عامل جديد", labelEn: "Create Worker" },
            { key: "canEdit", labelAr: "تعديل بيانات العامل", labelEn: "Edit Worker" },
            { key: "canDelete", labelAr: "حذف سجل العامل", labelEn: "Delete Worker" },
          ],
          fields: {
            workerNumber: { labelAr: "رقم العامل / الكود", labelEn: "Worker Number", type: "string", required: true, sample: "EMP-1042" },
            nameAr: { labelAr: "اسم العامل (عربي)", labelEn: "Worker Name (Ar)", type: "string", required: true, sample: "محمود حسن علي" },
            nameEn: { labelAr: "اسم العامل (إنجليزي)", labelEn: "Worker Name (En)", type: "string", sample: "Mahmoud Hassan" },
            role: { labelAr: "المسمى الوظيفي / الدور", labelEn: "Role", type: "enum", options: ["operator", "maintenance_tech", "qc_inspector", "line_leader", "assistant", "forklift_driver"], sample: "operator" },
            department: { labelAr: "القسم / الصالة", labelEn: "Department", type: "string", sample: "صالة التعبئة والتغليف" },
            shift: { labelAr: "الوردية المعتادة", labelEn: "Assigned Shift", type: "string", sample: "shift_1" },
            isActive: { labelAr: "نشط بالخدمة", labelEn: "Active Status", type: "boolean", sample: true },
          }
        },
        users: {
          id: "users",
          collection: "users",
          labelAr: "المستخدمين والصلاحيات",
          labelEn: "Users & Roles",
          icon: "ShieldCheck",
          actions: [
            { key: "canCreate", labelAr: "إضافة مستخدم جديد", labelEn: "Create User" },
            { key: "canEdit", labelAr: "تعديل بيانات وصلاحيات المستخدم", labelEn: "Edit User" },
            { key: "canDelete", labelAr: "حذف حساب المستخدم", labelEn: "Delete User" },
          ],
          fields: {
            name: { labelAr: "اسم المستخدم (إنجليزي)", labelEn: "User Name (En)", type: "string", required: true, sample: "Ahmed Ali" },
            nameAr: { labelAr: "اسم المستخدم (عربي)", labelEn: "User Name (Ar)", type: "string", required: true, sample: "أحمد علي" },
            email: { labelAr: "البريد الإلكتروني", labelEn: "Email Address", type: "string", required: true, sample: "ahmed.ali@tawoos.com" },
            role: { labelAr: "نوع الصلاحية", labelEn: "Role", type: "enum", options: ["general_admin", "standard"], sample: "standard" },
            department: { labelAr: "الإدارة / القسم", labelEn: "Department", type: "string", sample: "إدارة الإنتاج والتصنيع" },
            status: { labelAr: "حالة الحساب", labelEn: "Account Status", type: "enum", options: ["active", "inactive"], sample: "active" },
          }
        },
        system_config: {
          id: "system_config",
          collection: "system_config",
          labelAr: "إعدادات وتهيئة النظام",
          labelEn: "System Configuration",
          icon: "Settings",
          actions: [
            { key: "canEdit", labelAr: "تعديل وتحديث إعدادات النظام", labelEn: "Edit System Config" },
          ],
          fields: {
            companyNameAr: { labelAr: "اسم المنشأة (عربي)", labelEn: "Company Name (Ar)", type: "string", required: true, sample: "شركة طاووس للصناعات الكيماوية" },
            companyNameEn: { labelAr: "اسم المنشأة (إنجليزي)", labelEn: "Company Name (En)", type: "string", sample: "Tawoos Chemical Industries" },
            taxCardNumber: { labelAr: "رقم البطاقة الضريبية", labelEn: "Tax Card ID", type: "string", isSensitive: true, sample: "987-654-321" },
            commercialRegister: { labelAr: "السجل التجاري", labelEn: "Commercial Register", type: "string", isSensitive: true, sample: "765432" },
            vatRegistration: { labelAr: "رقم التسجيل الضريبي (VAT)", labelEn: "VAT Registration", type: "string", sample: "EG-123456789" },
            defaultCurrency: { labelAr: "العملة الأساسية للنظام", labelEn: "Base Currency", type: "string", sample: "EGP" },
          }
        }
      }
    },
    materials: {
      id: "materials",
      labelAr: "الخامات وإدارة المشتريات والمخازن",
      labelEn: "Materials, Procurement & Inventory",
      icon: "ShoppingCart",
      tabs: {
        purchase_orders: {
          id: "purchase_orders",
          collection: "purchase_orders",
          labelAr: "أوامر الشراء (PO)",
          labelEn: "Purchase Orders",
          icon: "FileText",
          actions: [
            { key: "canCreate", labelAr: "إنشاء أمر شراء جديد", labelEn: "Create PO" },
            { key: "canEdit", labelAr: "تعديل أمر الشراء", labelEn: "Edit PO" },
            { key: "canApprove", labelAr: "اعتماد أمر الشراء للتوريد", labelEn: "Approve PO" },
            { key: "canRequestAdjustments", labelAr: "طلب تعديلات وملاحظات", labelEn: "Request PO Adjustments" },
            { key: "canCancel", labelAr: "إلغاء أمر الشراء", labelEn: "Cancel PO" },
            { key: "canOverrideSpecs", labelAr: "تعديل المواصفات الفنية المعتمدة", labelEn: "Override Specs" },
            { key: "canHardDelete", labelAr: "الحذف النهائي من السحابة", labelEn: "Hard Delete PO" },
          ],
          fields: {
            id: { labelAr: "رقم أمر الشراء", labelEn: "PO ID", type: "string", required: true, sample: "PO-2026081601" },
            supplierId: { labelAr: "كود المورد", labelEn: "Supplier ID", type: "string", required: true, sample: "SUP-101" },
            deliveryDate: { labelAr: "تاريخ التوريد المستهدف", labelEn: "Target Delivery Date", type: "date", required: true, sample: "2026-08-25" },
            isTaxOfficial: { labelAr: "معاملة ضريبية رسمية", labelEn: "Tax Invoice (VAT)", type: "boolean", sample: true },
            unitPrice: { labelAr: "سعر وتكلفة الوحدة", labelEn: "Unit Price", type: "number", isSensitive: true, descAr: "حجب أسعار وتكاليف شراء البنود والعملات", sample: 4.50 },
            totalAmount: { labelAr: "إجمالي قيمة أمر الشراء والضرائب", labelEn: "Total PO Value & Taxes", type: "number", isSensitive: true, descAr: "حجب صافي المبلغ الإجمالي وضريبة القيمة المضافة", sample: 36000.00 },
            notes: { labelAr: "شروط وملاحظات التوريد", labelEn: "Delivery Remarks", type: "string", sample: "التسليم على طبالي خشبية مطابقة للمواصفات" },
          }
        },
        goods_receipts: {
          id: "goods_receipts",
          collection: "goods_receipts",
          labelAr: "أذون استلام الخامات (GRN) والمرتجعات (RTN)",
          labelEn: "Goods Receipt & Return Notes",
          icon: "ArrowDownLeft",
          descAr: "مقصور حصرياً على التوريدات الخارجية الحقيقية للموردين (GRN) ومرتجعات الموردين (RTN). مفصول كلياً عن الأرصدة الافتتاحية والتسويات.",
          resetCascades: ["stock_ledger", "items.stock"],
          actions: [
            { key: "canCreate", labelAr: "تسجيل إذن استلام / مرتجع جديد", labelEn: "Create GRN / RTN" },
            { key: "canEdit", labelAr: "تعديل الإذن وتحديث الأرصدة", labelEn: "Edit Document" },
            { key: "canApprove", labelAr: "اعتماد التوريد / الارتجاع المخزني", labelEn: "Approve Document" },
            { key: "canCancel", labelAr: "إلغاء الإذن وعكس الحركات", labelEn: "Cancel Document" },
            { key: "canReverse", labelAr: "إلغاء وعكس إذن الاستلام المعتمد (LIFO)", labelEn: "Reverse Approved Receipt (LIFO)" },
          ],
          fields: {
            id: { labelAr: "رقم إذن الاستلام / المرتجع", labelEn: "Document ID", type: "string", required: true, sample: "GRN-2026081601" },
            docType: { labelAr: "نوع الإذن (receipt / return)", labelEn: "Doc Type", type: "enum", options: ["receipt", "return"], sample: "receipt" },
            poId: { labelAr: "رقم أمر الشراء المرتبط", labelEn: "PO Reference ID", type: "string", sample: "PO-2026081601" },
            supplierId: { labelAr: "كود المورد", labelEn: "Supplier ID", type: "string", required: true, sample: "SUP-101" },
            receiptDate: { labelAr: "تاريخ الاستلام / الارتجاع الفعلي", labelEn: "Transaction Date", type: "date", required: true, sample: "2026-08-16" },
            targetWarehouse: { labelAr: "المخزن المعني بالحركة", labelEn: "Warehouse", type: "string", required: true, sample: "مستودع الخامات الرئيسي" },
            supplierDeliveryNote: { labelAr: "رقم إذن تسليم المورد (D/N)", labelEn: "Supplier D/N", type: "string", sample: "DN-84920" },
            taxInvoiceNumber: { labelAr: "رقم الفاتورة الضريبية", labelEn: "Tax Invoice #", type: "string", sample: "INV-2026-8812" },
            creditNoteNumber: { labelAr: "رقم إشعار الخصم / الدائن للمرتجع", labelEn: "Credit Note #", type: "string", sample: "CN-2026-001" },
            unitPrice: { labelAr: "سعر وتكلفة الوحدة", labelEn: "Unit Price", type: "number", isSensitive: true, sample: 4.50 },
            totalValue: { labelAr: "إجمالي القيمة المالية للإذن", labelEn: "Total Net Value", type: "number", isSensitive: true, sample: 22500.00 },
          }
        },
        transfers: {
          id: "transfers",
          collection: "stock_transfers",
          labelAr: "التحويلات وحركات المخازن (TRN)",
          labelEn: "Stock Transfers",
          icon: "ArrowLeftRight",
          descAr: "نقل الخامات بين المستودعات وصالة الإنتاج، يشمل التحويلات العادية والضخ عبر الأنابيب (PIPE).",
          resetCascades: ["stock_ledger", "items.stock"],
          actions: [
            { key: "canCreate", labelAr: "إصدار طلب تحويل جديد", labelEn: "Create Transfer" },
            { key: "canVerify", labelAr: "اعتماد وفحص التحويل (أمين العهدة)", labelEn: "Verify Transfer" },
            { key: "canCancel", labelAr: "إلغاء إذن التحويل", labelEn: "Cancel Transfer" },
            { key: "canReverse", labelAr: "إلغاء وعكس التحويل المكتمل (LIFO)", labelEn: "Reverse Completed Transfer (LIFO)" },
          ],
          fields: {
            id: { labelAr: "رقم إذن التحويل", labelEn: "Transfer ID", type: "string", required: true, sample: "TRN-20260820-01" },
            sourceWarehouse: { labelAr: "المستودع المحول منه", labelEn: "Source Warehouse", type: "string", required: true, sample: "WH-01" },
            targetWarehouse: { labelAr: "المستودع المحول إليه", labelEn: "Target Warehouse", type: "string", required: true, sample: "WH-FLOOR" },
            transferDate: { labelAr: "تاريخ الصرف", labelEn: "Transfer Date", type: "date", required: true, sample: "2026-08-20" },
            isPipelineTransfer: { labelAr: "تحويل ضخ عبر خط الأنابيب (PIPE)", labelEn: "Pipeline Transfer", type: "boolean", sample: false },
            status: { labelAr: "الحالة", labelEn: "Status", type: "enum", options: ["completed", "pending_custodian_verification", "pending_admin_verification"], sample: "completed" },
          }
        },
        stock: {
          id: "stock",
          collection: "stock_ledger",
          labelAr: "أرصدة ومصفوفة المخازن (SSOT)",
          labelEn: "Stock Balances & Unified Matrix",
          icon: "Boxes",
          descAr: "المصدر الوحيد للحقيقة (SSOT) لجميع حركات الأرصدة عبر المعادلة الشاملة وسجل الحركة الزمني الموحد (Kardex) بدقة HH:MM:SS.",
          actions: [
            { key: "canViewKardex", labelAr: "عرض كارت حركة الصنف الموحد (9-Stream Kardex)", labelEn: "View Unified Kardex" },
          ],
          fields: {
            unitPrice: { labelAr: "تكلفة وسعر الوحدة", labelEn: "Unit Price", type: "number", isSensitive: true },
            totalValue: { labelAr: "إجمالي تقييم المخزون", labelEn: "Total Valuation", type: "number", isSensitive: true },
          }
        },
        stock_count: {
          id: "stock_count",
          collection: "stock_counts",
          labelAr: "الجرد المخزني الفعلي والتسوية",
          labelEn: "Physical Stock Count",
          icon: "ClipboardCheck",
          actions: [
            { key: "canCreate", labelAr: "بدء دورة جرد جديدة وتحديد النطاق", labelEn: "Start Stock Count" },
            { key: "canEdit", labelAr: "إدخال وتعديل الكميات المحصورة", labelEn: "Edit Found Quantities" },
            { key: "canApprove", labelAr: "اعتماد التسويات المخزنية (المسؤول العام)", labelEn: "Approve Reconciliations" },
            { key: "canExport", labelAr: "تصدير شيت الجرد (XLSX)", labelEn: "Export Count Sheet" },
          ],
          fields: {
            id: { labelAr: "رقم دورة الجرد", labelEn: "Session ID", type: "string", required: true, sample: "STK-20260820-01" },
            sessionDate: { labelAr: "تاريخ الجرد", labelEn: "Count Date", type: "date", required: true, sample: "2026-08-20" },
            targetWarehouses: { labelAr: "المستودعات المستهدفة", labelEn: "Target Warehouses", type: "array", sample: ["WH-01", "WH-FLOOR"] },
            status: { labelAr: "حالة الجرد", labelEn: "Status", type: "enum", options: ["pending", "in-process", "submitted", "under-review", "done"], sample: "done" },
          }
        },
        spare_parts_issue: {
          id: "spare_parts_issue",
          collection: "spare_parts_issues",
          labelAr: "صرف واستهلاك قطع الغيار (XISS)",
          labelEn: "Spare Parts Consumption",
          icon: "Wrench",
          resetCascades: ["stock_ledger", "items.stock"],
          actions: [
            { key: "canCreate", labelAr: "تسجيل إذن صرف واستهلاك جديد", labelEn: "Create Consumption Voucher" },
            { key: "canCancel", labelAr: "إلغاء إذن الصرف ورد الرصيد", labelEn: "Cancel & Revert Stock" },
            { key: "canExport", labelAr: "تصدير سجل الاستهلاك (XLSX)", labelEn: "Export Log" },
          ],
          fields: {
            id: { labelAr: "رقم إذن الصرف", labelEn: "Voucher ID", type: "string", required: true, sample: "XISS-20260823-01" },
            issueDate: { labelAr: "تاريخ الصرف والتركيب", labelEn: "Issue Date", type: "date", required: true, sample: "2026-08-23" },
            targetMachine: { labelAr: "الماكينة / الخط المستفيد", labelEn: "Target Equipment", type: "string", required: true, sample: "ماكينة الليبل خط 1" },
            technicianName: { labelAr: "المسؤول عن التركيب", labelEn: "Technician", type: "string", sample: "م. محمد فني صيانة" },
            totalIssuedValue: { labelAr: "إجمالي تكلفة قطع الغيار المنصرفة", labelEn: "Total Value", type: "number", isSensitive: true, sample: 1250.00 },
          }
        }
      }
    },

    production: {
      id: "production",
      labelAr: "الإنتاج والتشغيل والتصنيع",
      labelEn: "Production & Manufacturing",
      icon: "Factory",
      tabs: {
        work_orders: {
          id: "work_orders",
          collection: "work_orders",
          labelAr: "أوامر التشغيل وتتبع الإنتاج",
          labelEn: "Work Orders & Floor Execution",
          icon: "Factory",
          resetCascades: ["staged_floor_pallets", "staged_floor_materials", "production_breaks", "production_workers", "production_shifts"],
          actions: [
            { key: "canCreate", labelAr: "إدراج صنف جديد بالخطة", labelEn: "Assign to Plan" },
            { key: "canEdit", labelAr: "تعديل جدول وكميات التشغيل", labelEn: "Edit Plan Order" },
            { key: "canCancel", labelAr: "إلغاء أمر التشغيل وحذف الخطة", labelEn: "Cancel Work Order" },
            { key: "canRegisterPallet", labelAr: "تسجيل واعتماد باليتات الصالة وإصدار الجواز", labelEn: "Register Floor Pallet & Passport" },
            { key: "canTransferFg", labelAr: "ترحيل ونقل الباليتات لمستودع التام (TRN)", labelEn: "Transfer Pallets to FG Warehouse" },
            { key: "canLogScrap", labelAr: "إثبات الهالك وتسوية التشغيل وإعادة التدوير", labelEn: "Log Floor Scrap & Rework" },
            { key: "canPrintPalletThermal", labelAr: "طباعة ملصقات الباليتات الحرارية", labelEn: "Print Thermal Pallet Labels" },
            { key: "canCloseShift", labelAr: "إنهاء الوردية وتوثيق الإغلاق اليومي", labelEn: "End Shift & Close Day" },
            { key: "canAdminModifyPallet", labelAr: "تعديل استثنائي لبيانات وعمالة الباليتة", labelEn: "Admin Modify Pallet & Crew" },
            { key: "canReverse", labelAr: "إلغاء وعكس الباليتة وفك حجز الخامات", labelEn: "Reverse Pallet & Roll Back Materials" },
            { key: "canBuildReworkProcess", labelAr: "بناء وتعديل مسارات إعادة التشغيل المخصصة", labelEn: "Build Custom Rework SOPs" },
            { key: "canInheritStaff", labelAr: "استيراد وتوزيع طاقم العمل من أوامر مماثلة", labelEn: "Inherit Staff Roster" },
          ],
          fields: {
            id: { labelAr: "معرف أمر التشغيل", labelEn: "Order ID", type: "string", required: true, sample: "MO-20260917-01" },
            orderNumber: { labelAr: "رقم أمر التشغيل التسلسلي", labelEn: "Order Number", type: "string", required: true, sample: "MO-20260917-01" },
            planDate: { labelAr: "تاريخ التشغيل المخطط", labelEn: "Target Plan Date", type: "date", required: true, sample: "2026-09-17" },
            finishedProductId: { labelAr: "كود المنتج التام", labelEn: "Target SKU", type: "string", required: true, sample: "FG-101" },
            packagingOptionSuffix: { labelAr: "لاحقة عبوة التعبئة المحددة", labelEn: "Packaging Option Suffix", type: "string", sample: "V1" },
            plannedQtyLarge: { labelAr: "الكمية المخططة بالكرتونة", labelEn: "Planned Cartons", type: "number", required: true, sample: 100 },
            plannedQtySmall: { labelAr: "الكمية المخططة بالعبوة", labelEn: "Planned Small Units", type: "number", sample: 1200 },
            totalProducedQtyLarge: { labelAr: "الإنتاج الفعلي بالكرتونة", labelEn: "Produced Cartons", type: "number", sample: 100 },
            totalProducedQtySmall: { labelAr: "الإنتاج الفعلي بالعبوة", labelEn: "Produced Small Units", type: "number", sample: 1200 },
            completionPercentage: { labelAr: "نسبة إنجاز أمر التشغيل (%)", labelEn: "Completion %", type: "number", sample: 100 },
            isRework: { labelAr: "أمر إعادة تشغيل ومرتجع", labelEn: "Is Rework Order", type: "boolean", sample: true },
            reworkSourceVouchers: { labelAr: "إشعارات المرتجع المصدرية (RTN-*)", labelEn: "Source Return Vouchers", type: "array", sample: ["RTN-20260921-01"] },
            reworkFaultTags: { labelAr: "وسوم العيوب المحددة للمرتجع", labelEn: "Rework Fault Tags", type: "array", sample: ["غطاء تالف", "تسريب"] },
            processId: { labelAr: "معرف مسار التشغيل (SOP)", labelEn: "Process ID", type: "string", sample: "RWK-WHITE_O-001" },
            processCode: { labelAr: "كود مسار التشغيل", labelEn: "Process Code", type: "string", sample: "RWK-WHITE_O-001" },
            stepStaffing: { labelAr: "توزيع وتسكين العمالة على خطوات المسار", labelEn: "Step Staffing Roster", type: "array" },
            importanceRank: { labelAr: "أولوية وترتيب تنفيذ أمر التشغيل", labelEn: "Execution Sequence Rank", type: "number", sample: 1 },
            qtyExactness: { labelAr: "دقة الكمية المطلوبة (exact/approximate)", labelEn: "Quantity Exactness", type: "enum", options: ["exact", "approximate"], sample: "exact" },
            status: { labelAr: "حالة أمر التشغيل", labelEn: "Status", type: "enum", options: ["scheduled", "in_progress", "completed", "cancelled"], sample: "scheduled" },
          }
        },
        liquid_tanks: {
          id: "liquid_tanks",
          collection: "liquid_tanks",
          labelAr: "تشغيل وتانكات الخامات (M)",
          labelEn: "Bulk Liquid Tanks (M)",
          icon: "Cog",
          resetCascades: ["production_transformations", "shift_handovers"],
          actions: [
            { key: "canCreate", labelAr: "تسجيل تانك جديد", labelEn: "Register New Tank" },
            { key: "canEdit", labelAr: "تعديل بيانات التانك واستبدال الصورة", labelEn: "Edit Tank" },
            { key: "canAnalyzeQA", labelAr: "تسجيل نتائج الفحص المعملي (QA)", labelEn: "Record QA Analysis" },
            { key: "canApproveQA", labelAr: "اعتماد نتيجة الجودة", labelEn: "Approve QA Verdict" },
            { key: "canStartPump", labelAr: "بدء تشغيل طلمبة الرفع", labelEn: "Start Lifting Pump" },
            { key: "canPauseResumePump", labelAr: "إيقاف مؤقت واستئناف الرفع", labelEn: "Pause/Resume Lifting" },
            { key: "canFinishPump", labelAr: "تأكيد إنهاء الرفع والتفريغ بالكامل", labelEn: "Finish Lifting" },
            { key: "canViewRStock", labelAr: "عرض أرصدة خامات التحضير (R-Items)", labelEn: "View R-Stock" },
            { key: "canSubmitHandover", labelAr: "تسليم الوردية ومطابقة ملصق السيريال", labelEn: "Submit Shift Handover" },
            { key: "canConfigureSerial", labelAr: "ضبط وتعديل السيريال وترتيب الخامات", labelEn: "Configure Starting Serial" },
            { key: "canViewAudit", labelAr: "عرض سجل الحركات والتتبع الزمني", labelEn: "View Audit Timeline" },
            { key: "canDelete", labelAr: "حذف السجل وعكس الحركات المخزنية", labelEn: "Delete & Roll Back Tank" },
          ],
          fields: {
            tankNumber: { labelAr: "رقم التانك / السيريال", labelEn: "Tank Serial Number", type: "number", required: true, sample: 1400 },
            itemCode: { labelAr: "كود الخامة المصنعة (Flag M)", labelEn: "Material Code", type: "string", required: true, sample: "R-301" },
            prepCode: { labelAr: "طريقة التحضير المعتمدة", labelEn: "Prep Method Code", type: "string", sample: "100" },
            concentration: { labelAr: "نسبة التركيز (%)", labelEn: "Concentration %", type: "number", required: true, sample: 5.25 },
            pipeTransferDocId: { labelAr: "معرف إذن النقل عبر الأنابيب لصالة الإنتاج", labelEn: "Pipeline TRN Ref", type: "string", sample: "TRN-PIPE-TANK-1400" },
          }
        },
        liquid_storage: {
          id: "liquid_storage",
          collection: "floor_liquid_vessels",
          labelAr: "خزانات وتدفق السوائل بالصالة",
          labelEn: "Floor Liquid Storage & Bulk Flow",
          icon: "Activity",
          actions: [
            { key: "canView", labelAr: "معاينة الخزانات ومناسيب السوائل وتدفق التانكات", labelEn: "View Vessels & Liquid Flow" },
            { key: "canConfigureStorage", labelAr: "تعديل سعة وخزانات الصالة وتعيين الحد الأدنى", labelEn: "Configure Storage Capacity" },
            { key: "canAdminOverrideTanks", labelAr: "تعديل استثنائي وتخصيص يدوي للتانكات المرتبطة", labelEn: "Admin Override Tank Links" },
            { key: "canResetCleanout", labelAr: "تسجيل تفريغ وغسيل الخزان (CIP Cleanout)", labelEn: "Perform CIP Cleanout Reset" },
          ],
          fields: {
            materialCode: { labelAr: "كود الخامة المصنعة (Flag M)", labelEn: "Material Code", type: "string", required: true, sample: "R-301" },
            totalCapacity: { labelAr: "السعة الإجمالية للخزانات بالصالة (لتر)", labelEn: "Total Floor Capacity (L)", type: "number", required: true, sample: 6000 },
            currentVolume: { labelAr: "الحجم الحالي المتاح بالخزان (لتر)", labelEn: "Current Available Volume (L)", type: "number", required: true, sample: 4200 },
            activeTanksCount: { labelAr: "عدد التانكات النشطة داخل الحوض", labelEn: "Active Tanks Count", type: "number", sample: 4 },
          }
        },
        faulty_fg: {
          id: "faulty_fg",
          collection: "faulty_fg_returns",
          labelAr: "مرتجعات ومعيب المنتج التام (RTN)",
          labelEn: "Faulty FG & Returns",
          icon: "AlertOctagon",
          descAr: "تسجيل وحصر مرتجعات المنتجات التامة المعيبة ونقل عهدتها لصالة الإنتاج بانتظار إعادة التشغيل أو التخريد.",
          actions: [
            { key: "canCreate", labelAr: "تسجيل إشعار مرتجع معيب", labelEn: "Create Return Voucher" },
            { key: "canEdit", labelAr: "تعديل بيانات إشعار المرتجع", labelEn: "Edit Return Voucher" },
            { key: "canCancel", labelAr: "إلغاء وحذف إشعار المرتجع", labelEn: "Cancel Return Voucher" },
            { key: "canConfirm", labelAr: "تأكيد استلام الصالة ونقل العهدة", labelEn: "Confirm Floor Receipt" },
            { key: "canResolve", labelAr: "توثيق المعالجة (تشغيل أو تخريد)", labelEn: "Resolve Return" },
            { key: "canPrint", labelAr: "طباعة الملصقات ونماذج المرتجع", labelEn: "Print Return Vouchers & Labels" },
          ],
          fields: {
            id: { labelAr: "رقم إشعار المرتجع (RTN-*)", labelEn: "Return ID", type: "string", required: true, sample: "RTN-20260921-01" },
            finishedProductId: { labelAr: "كود المنتج التام", labelEn: "Target SKU", type: "string", required: true, sample: "FG-101" },
            qtySmall: { labelAr: "الكمية بالعبوة", labelEn: "Small Units Qty", type: "number", required: true, sample: 120 },
            qtyLarge: { labelAr: "الكمية بالكرتونة", labelEn: "Large Units Qty", type: "number", required: true, sample: 10 },
          }
        },
        fg_inward: {
          id: "fg_inward",
          collection: "fg_receipts",
          labelAr: "استلام وحفظ المنتج التام (FGR)",
          labelEn: "Finished Goods Inward",
          icon: "CheckCircle2",
          actions: [
            { key: "canInspect", labelAr: "فحص ومطابقة باليتات المنتج التام الواردة", labelEn: "Inspect Inward Pallets" },
            { key: "canAccept", labelAr: "اعتماد واستلام الباليتة بالعهدة المخزنية", labelEn: "Accept & Inward Pallet into Custody" },
            { key: "canReject", labelAr: "رفض وإرجاع الباليتة لصالة الإنتاج", labelEn: "Reject & Return Pallet to Floor" },
            { key: "canExport", labelAr: "تصدير وطباعة السجل الدائم وجواز البالتة", labelEn: "Export & Print Pallet Ledger / Passports" },
          ],
          fields: {
            id: { labelAr: "رقم إذن استلام التام", labelEn: "FG Receipt ID", type: "string", required: true, sample: "FGR-20260917-01" },
            fgLotNumber: { labelAr: "رقم تشغيلة المنتج التام", labelEn: "FG Lot Number", type: "string", required: true, sample: "LOT-FG-20260917-01" },
          }
        },
        production_reports: {
          id: "production_reports",
          collection: "work_orders",
          labelAr: "تقارير الإنتاجية والأداء التنفيذي",
          labelEn: "Production & Performance Reports",
          icon: "BarChart3",
          actions: [
            { key: "canView", labelAr: "عرض تقارير الأداء التنفيذي", labelEn: "View Performance Reports" },
            { key: "canExport", labelAr: "تصدير شيت Excel للإنتاجية", labelEn: "Export XLSX Report" },
          ],
          fields: {
            id: { labelAr: "رقم تقرير الأداء", labelEn: "Report ID", type: "string", required: true, sample: "REP-20260923-01" },
            timeEfficiencyPct: { labelAr: "كفاءة استغلال الوقت (%)", labelEn: "Time Efficiency %", type: "number", sample: 95.0 },
          }
        }
      }
    },

    finance: {
      id: "finance",
      labelAr: "المالية والحسابات والسيولة",
      labelEn: "Finance, Accounts & Treasury",
      icon: "BadgeDollarSign",
      tabs: {
        cash_safes: {
          id: "cash_safes",
          collection: "cash_safes",
          labelAr: "الخزائن النقدية والعهد",
          labelEn: "Cash Safes & Vaults",
          icon: "Coins",
          actions: [
            { key: "canCreateVoucher", labelAr: "إصدار سند صرف / تحصيل", labelEn: "Issue Voucher" },
            { key: "canExchangeChange", labelAr: "عملية فكة وتظبيط فئات", labelEn: "Change Exchange" },
            { key: "canAuditCount", labelAr: "جرد الخزينة وتظبيط الرصيد", labelEn: "Physical Count & Adjust" },
            { key: "canApproveVoucher", labelAr: "اعتماد السندات المعلقة", labelEn: "Approve Vouchers" },
            { key: "canReverseVoucher", labelAr: "إلغاء وعكس السندات", labelEn: "Reverse Vouchers" },
            { key: "canLiquidateCustody", labelAr: "تسوية العهد بمصروفات", labelEn: "Liquidate Custody" },
            { key: "canManageSafes", labelAr: "إنشاء وتكوين الخزائن", labelEn: "Manage Safes" }
          ],
          fields: {
            id: { labelAr: "كود الخزينة", labelEn: "Safe ID", type: "string", required: true, sample: "SAFE-01" },
            nameAr: { labelAr: "اسم الخزينة (عربي)", labelEn: "Safe Name (Ar)", type: "string", required: true, sample: "الخزينة الرئيسية" },
            currentBalance: { labelAr: "الرصيد الدفتري الحالي", labelEn: "Current Book Balance", type: "number", isSensitive: true, sample: 45000 },
          }
        },
        banks: {
          id: "banks",
          collection: "bank_accounts",
          labelAr: "الحسابات البنكية والشيكات",
          labelEn: "Bank Accounts & Cheques",
          icon: "Landmark",
          actions: [
            { key: "canView", labelAr: "معاينة الحسابات البنكية", labelEn: "View Banks" },
          ],
          fields: {
            id: { labelAr: "كود الحساب البنكي", labelEn: "Bank ID", type: "string", sample: "BNK-01" },
          }
        },
        dues_tracking: {
          id: "dues_tracking",
          collection: "dues_settlements,dues_batches,wht_notes",
          labelAr: "متابعة الاستحقاقات والدفعات",
          labelEn: "Dues & Installments Tracking",
          icon: "Receipt",
          subtabs: [
            { id: "suppliers", labelAr: "استحقاقات ودفعات الموردين", labelEn: "Suppliers Dues & Installments", isDefault: true },
            { id: "clients", labelAr: "استحقاقات وتحصيلات العملاء", labelEn: "Clients Receivables & Dues" }
          ],
          actions: [
            { key: "canSettleDues", labelAr: "تسجيل دفعات وتسوية استحقاقات الموردين (فردي / مجمع)", labelEn: "Record & Settle Supplier Dues" },
            { key: "canGenerateWhtNote", labelAr: "إصدار وطباعة شهادة الخصم والإضافة (1%) A4 نصفين", labelEn: "Issue & Print 1% WHT Certificate A4" }
          ],
          fields: {
            id: { labelAr: "معرف دفعة الاستحقاق", labelEn: "Tranche ID", type: "string", required: true, sample: "GRN-2026101101-T1" },
            dueDate: { labelAr: "تاريخ الاستحقاق", labelEn: "Due Date", type: "date", required: true, sample: "2026-11-10" },
            originalDueAmount: { labelAr: "قيمة الدفعة المستحقة", labelEn: "Original Due Amount", type: "number", isSensitive: true, sample: 25000.00 },
            remainingAmount: { labelAr: "الرصيد المتبقي للسداد", labelEn: "Remaining Balance", type: "number", isSensitive: true, sample: 10000.00 }
          }
        },
        party_statements: {
          id: "party_statements",
          collection: "cash_transactions,goods_receipts,journal_entries",
          labelAr: "كشوف حسابات الموردين والعملاء",
          labelEn: "Partner Statements (Suppliers & Clients)",
          icon: "FileText",
          actions: [
            { key: "canView", labelAr: "عرض كشوف الحسابات", labelEn: "View Statements" },
            { key: "canFilterPeriods", labelAr: "تحديد الفترات وتخصيص التواريخ", labelEn: "Filter Periods" },
            { key: "canToggleReversals", labelAr: "إظهار/إخفاء الحركات المعكوسة والملغاة", labelEn: "Toggle Reversals" },
            { key: "canPrintA4Statement", labelAr: "طباعة كشف الحساب A4 معتمد", labelEn: "Print A4 Statement" },
            { key: "canExportCSV", labelAr: "تصدير كشف الحساب إلى Excel / CSV", labelEn: "Export CSV" }
          ],
          fields: {
            partyType: { labelAr: "نوع الطرف (مورد/عميل)", labelEn: "Partner Type", type: "enum", options: ["supplier", "client"], sample: "supplier" },
            partyId: { labelAr: "معرف الطرف", labelEn: "Partner ID", type: "string", sample: "SUP-001" },
            openingBalance: { labelAr: "الرصيد الافتتاحي السابق للفترة", labelEn: "Opening Balance", type: "number", sample: 0.00 },
            totalDebit: { labelAr: "إجمالي المدين في الفترة", labelEn: "Period Debit", type: "number", sample: 15000.00 },
            totalCredit: { labelAr: "إجمالي الدائن في الفترة", labelEn: "Period Credit", type: "number", sample: 25000.00 },
            closingBalance: { labelAr: "الرصيد الختامي المستحق", labelEn: "Closing Balance", type: "number", sample: 10000.00 }
          }
        },
        accounts: {
          id: "accounts",
          collection: "chart_of_accounts",
          labelAr: "دليل الحسابات ودفتر اليومية",
          labelEn: "Chart of Accounts & Journal Ledger",
          icon: "BadgeDollarSign",
          subtabs: [
            { id: "journal", labelAr: "دفتر اليومية العامة", labelEn: "Journal Ledger", isDefault: true },
            { id: "trial_balance", labelAr: "ميزان المراجعة بالمجاميع والأرصدة", labelEn: "Trial Balance" },
            { id: "directory", labelAr: "دليل شجرة الحسابات", labelEn: "COA Directory" },
            { id: "master_links", labelAr: "الربط المحاسبي التشغيلي", labelEn: "Master Operational Links" }
          ],
          actions: [
            { key: "canView", labelAr: "معاينة دفتر اليومية وميزان المراجعة", labelEn: "View Ledger & Trial Balance" },
            { key: "canCreateJournalEntry", labelAr: "إنشاء قيد تسوية يدوي", labelEn: "Create Manual Adjustment Entry" },
            { key: "canReverseJournalEntry", labelAr: "عكس قيود اليومية المعكوسة", labelEn: "Reverse Journal Entry" },
            { key: "canViewAttachments", labelAr: "معاينة المرفقات والمستندات الأصلية", labelEn: "View Source Attachments" },
            { key: "canViewTrialBalanceDiagnostic", labelAr: "فحص وتشخيص اتزان ميزان المراجعة", labelEn: "Run Trial Balance Diagnostic" },
            { key: "canPrintA4Slips", labelAr: "طباعة أذون القيود وميزان المراجعة A4", labelEn: "Print A4 Vouchers & Reports" },
            { key: "canManageAccountingLinks", labelAr: "تعديل روابط الحسابات التلقائية", labelEn: "Configure Accounting Links" },
            { key: "canCreateAccount", labelAr: "إضافة حساب جديد لدليل الحسابات", labelEn: "Create Chart Account" },
            { key: "canEditAccount", labelAr: "تعديل حساب في دليل الحسابات", labelEn: "Edit Chart Account" },
            { key: "canDeleteAccount", labelAr: "حذف حساب من دليل الحسابات", labelEn: "Delete Chart Account" },
            { key: "canExportCOA", labelAr: "تصدير دليل الحسابات Excel/CSV", labelEn: "Export COA" },
            { key: "canImportCOA", labelAr: "استيراد دليل الحسابات CSV", labelEn: "Import COA" }
          ],
          fields: {
            code: { labelAr: "رقم الحساب المحاسبي (GL Code)", labelEn: "GL Account Code", type: "string", required: true, sample: "1020101" },
            nameAr: { labelAr: "اسم الحساب (عربي)", labelEn: "Account Name (Ar)", type: "string", required: true, sample: "النقدية بالصندوق" },
            nameEn: { labelAr: "اسم الحساب (إنجليزي)", labelEn: "Account Name (En)", type: "string", sample: "Cash on Hand / Petty Cash" },
            level: { labelAr: "المستوى المحاسبي في الشجرة (1-5)", labelEn: "Hierarchy Level", type: "number", sample: 4 },
            type: { labelAr: "نوع الحساب (رئيسي/فرعي)", labelEn: "Account Type", type: "enum", options: ["main", "sub"], sample: "main" },
            parentCode: { labelAr: "الحساب الأب الأعلى", labelEn: "Parent Account Code", type: "string", sample: "10201" },
            statement: { labelAr: "القائمة المالية المرتبطة", labelEn: "Financial Statement", type: "enum", options: ["balance_sheet", "income_statement"], sample: "balance_sheet" },
            reportCategory: { labelAr: "التبويب في القوائم المالية", labelEn: "Report Category", type: "enum", options: ["section_header", "current_asset", "fixed_asset", "current_liability", "long_term_liability", "equity", "operating_revenue", "cogs_direct", "selling_expense", "admin_expense", "financing_expense", "other_revenue_expense"], sample: "current_asset" },
            statementEffect: { labelAr: "التأثير الرياضي في القسم (add/deduct)", labelEn: "Statement Mathematical Effect", type: "enum", options: ["add", "deduct"], sample: "add" },
            nature: { labelAr: "طبيعة الحساب (debit/credit)", labelEn: "Account Nature", type: "enum", options: ["debit", "credit"], sample: "debit" },
            cashFlowCategory: { labelAr: "تصنيف التدفقات النقدية", labelEn: "Cash Flow Category", type: "enum", options: ["operating", "investing", "financing", "cash_equivalent", "none"], sample: "cash_equivalent" },
            subType: { labelAr: "نوع دفتر الأستاذ المساعد", labelEn: "Sub-Ledger Type", type: "enum", options: ["supplier", "client", "worker", "safe", "bank", "inventory", "asset", "liability", "equity", "revenue", "expense"], sample: "safe" },
            requiresCostCenter: { labelAr: "إلزامية مركز التكلفة", labelEn: "Requires Cost Center", type: "boolean", sample: false },
            displayOrder: { labelAr: "ترتيب العرض في القائمة", labelEn: "Display Order", type: "number", sample: 28 },
            openingBalance: { labelAr: "الرصيد الافتتاحي", labelEn: "Opening Balance", type: "number", sample: 0.00 },
            isSystemProtected: { labelAr: "حساب نظام محمي من الحذف", labelEn: "System Protected", type: "boolean", sample: false }
          }
        },
        financial_statements: {
          id: "financial_statements",
          collection: "financial_reports",
          labelAr: "القوائم المالية والختامية",
          labelEn: "Financial Statements & Reports",
          icon: "BarChart3",
          subtabs: [
            { id: "income_statement", labelAr: "قائمة الدخل والأرباح والخسائر (P&L)", labelEn: "Income Statement", isDefault: true },
            { id: "balance_sheet", labelAr: "الميزانية العمومية والمركز المالي (عرض رأسي)", labelEn: "Vertical Balance Sheet" },
            { id: "cash_flow", labelAr: "قائمة التدفقات النقدية", labelEn: "Cash Flow Statement" },
            { id: "cost_centers", labelAr: "تحليل ربحية مراكز التكلفة", labelEn: "Cost Centers Performance" }
          ],
          actions: [
            { key: "canView", labelAr: "عرض القوائم المالية والتحليلات", labelEn: "View Statements" },
            { key: "canPrintA4Slip", labelAr: "طباعة القوائم المالية بتنسيق A4 رسمي", labelEn: "Print A4 Statements" },
            { key: "canExportStatements", labelAr: "تصدير القوائم المالية Excel", labelEn: "Export Statements" },
            { key: "canFilterPeriods", labelAr: "تغيير الفترات المحاسبية ومستوى العرض", labelEn: "Filter Periods & Display Level" }
          ],
          fields: {
            fiscalYear: { labelAr: "السنة المالية", labelEn: "Fiscal Year", type: "number", sample: 2026 },
            displayLevel: { labelAr: "مستوى عرض شجرة الحسابات (summary/2/3/4/all)", labelEn: "COA Display Level", type: "enum", options: ["summary", "2", "3", "4", "all"], sample: "all" },
            showZeroBalances: { labelAr: "إظهار الحسابات الصفرية", labelEn: "Show Zero Balance Accounts", type: "boolean", sample: false },
            currency: { labelAr: "عملة العرض", labelEn: "Reporting Currency", type: "string", sample: "EGP" }
          }
        }
      }
    },
    sales: {
      id: "sales",
      labelAr: "المبيعات والتوزيع",
      labelEn: "Sales & Distribution",
      icon: "TrendingUp",
      tabs: {
        sales_orders: {
          id: "sales_orders",
          collection: "sales_orders",
          labelAr: "أوامر البيع والتوريد",
          labelEn: "Sales Orders Master",
          icon: "ShoppingCart",
          actions: [
            { key: "canCreate", labelAr: "إنشاء أمر بيع جديد", labelEn: "Create Sales Order" },
            { key: "canEdit", labelAr: "تعديل أمر بيع", labelEn: "Edit Sales Order" },
            { key: "canDelete", labelAr: "حذف أو إلغاء أمر بيع", labelEn: "Delete Sales Order" },
            { key: "canExport", labelAr: "تصدير أوامر البيع (CSV)", labelEn: "Export Sales Orders" },
          ],
          fields: {
            serial: { labelAr: "مسلسل أمر البيع (#0001)", labelEn: "Order Serial", type: "string", required: true, sample: "0001" },
            clientId: { labelAr: "كود العميل", labelEn: "Client ID", type: "string", required: true, sample: "CLI-101" },
            branchId: { labelAr: "كود الفرع", labelEn: "Branch ID", type: "string", sample: "br_main" },
            invoiceDate: { labelAr: "تاريخ الفاتورة / التسليم", labelEn: "Invoice / Delivery Date", type: "date", required: true, sample: "2026-11-09" },
            loadingDate: { labelAr: "تاريخ التحميل", labelEn: "Loading Date", type: "date", required: true, sample: "2026-11-09" },
            orderType: { labelAr: "نوع الطلب", labelEn: "Order Type", type: "enum", options: ["supply", "return_deduct", "return_no_deduct", "replacement_old", "exchange", "collection", "admin", "invoice_only_with_tax", "invoice_only_no_tax"], sample: "supply" },
            confirmationStatus: { labelAr: "حالة التأكيد", labelEn: "Confirmation Status", type: "enum", options: ["confirmed", "not_confirmed", "revised", "canceled"], sample: "confirmed" },
            fulfillmentStatus: { labelAr: "حالة التنفيذ والتحميل", labelEn: "Fulfillment Status", type: "enum", options: ["not_yet", "prepare", "shipped", "delivered", "paid"], sample: "not_yet" },
            vatMode: { labelAr: "المعاملة الضريبية", labelEn: "Tax / VAT Mode", type: "enum", options: ["none", "exclusive", "exclusive_wht", "inclusive", "inclusive_wht"], sample: "none" },
            poTawoos: { labelAr: "أمر شراء طاووس", labelEn: "PO # Tawoos", type: "string", sample: "PO-TW-2026-01" },
            poPrivateLabel: { labelAr: "أمر شراء العلامة الخاصة", labelEn: "PO # Private Label", type: "string", sample: "PO-PL-4401" },
            grandTotal: { labelAr: "إجمالي أمر البيع (EGP)", labelEn: "Order Grand Total (EGP)", type: "number", sample: 45000.00 }
          }
        },
        loading_plan: {
          id: "loading_plan",
          collection: "sales_orders",
          labelAr: "خطة التحميل",
          labelEn: "Loading Plan",
          icon: "Truck",
          actions: [
            { key: "canManageLoadingPlan", labelAr: "إدارة واعتماد خطة التحميل وتوزيع الشاحنات", labelEn: "Manage Loading Plan" }
          ],
          fields: {
            loadingOrderNumber: { labelAr: "رقم أمر التحميل", labelEn: "Loading Order #", type: "number", sample: 1 },
            assignedVehicleId: { labelAr: "معرف الشاحنة / السيارة", labelEn: "Assigned Vehicle ID", type: "string", sample: "VEH-01" },
            assignedDriverId: { labelAr: "معرف السائق", labelEn: "Assigned Driver ID", type: "string", sample: "EMP-101" },
            loadingDate: { labelAr: "تاريخ التحميل المعتمد", labelEn: "Scheduled Loading Date", type: "date", sample: "2026-11-10" }
          }
        },
        price_lists: {
          id: "price_lists",
          collection: "price_lists",
          labelAr: "قوائم الأسعار وسياسات التسعير",
          labelEn: "Price Lists & Strategies",
          icon: "BadgeDollarSign",
          actions: [
            { key: "canCreate", labelAr: "إنشاء قائمة أسعار جديدة", labelEn: "Create Price List" },
            { key: "canEdit", labelAr: "تعديل قائمة أسعار", labelEn: "Edit Price List" },
            { key: "canDelete", labelAr: "حذف قائمة أسعار", labelEn: "Delete Price List" },
          ],
          fields: {
            strategyId: { labelAr: "استراتيجية التسعير", labelEn: "Pricing Strategy", type: "string", required: true, sample: "wholesale" },
            type: { labelAr: "نوع الفترة (رسمي / عرض)", labelEn: "Period Type", type: "enum", options: ["official", "promotional"], sample: "official" },
            startDate: { labelAr: "تاريخ السريان", labelEn: "Effective Start Date", type: "date", required: true, sample: "2026-11-01" },
            endDate: { labelAr: "تاريخ الانتهاء", labelEn: "Effective End Date", type: "date", sample: "2026-12-31" },
            clientId: { labelAr: "العميل المرتبط (للتسعير الخاص)", labelEn: "Client ID (Special Pricing)", type: "string", sample: "CLI-001" },
            branchId: { labelAr: "الفرع المرتبط", labelEn: "Branch ID", type: "string", sample: "BR-01" },
            status: { labelAr: "حالة القائمة", labelEn: "Status", type: "enum", options: ["active", "closed", "draft"], sample: "active" },
            items: { labelAr: "مصفوفة أسعار المنتجات", labelEn: "Product Price Matrix", type: "array", sample: [] }
          }
        },
        client_contracts: {
          id: "client_contracts",
          collection: "client_contracts",
          labelAr: "عقود وخصومات العملاء",
          labelEn: "Client Contracts & Discounts",
          icon: "Handshake",
          actions: [
            { key: "canCreate", labelAr: "تحرير عقد عميل جديد", labelEn: "Create Client Contract" },
            { key: "canEdit", labelAr: "تعديل بنود العقد", labelEn: "Edit Contract" },
            { key: "canDelete", labelAr: "إنهاء أو إلغاء العقد", labelEn: "Terminate/Delete Contract" },
          ],
          fields: {
            contractNumber: { labelAr: "رقم العقد", labelEn: "Contract Number", type: "string", required: true, sample: "CNT-2026-001" },
            clientId: { labelAr: "معرف العميل", labelEn: "Client ID", type: "string", required: true, sample: "CLI-001" },
            startDate: { labelAr: "تاريخ بدء العقد", labelEn: "Contract Start Date", type: "date", required: true, sample: "2026-01-01" },
            endDate: { labelAr: "تاريخ انتهاء العقد", labelEn: "Contract End Date", type: "date", sample: "2026-12-31" },
            rebateRate: { labelAr: "نسبة الخصم / العمولة السنوية", labelEn: "Rebate Rate (%)", type: "number", sample: 3.5 },
            paymentTerms: { labelAr: "شروط وتسهيلات السداد", labelEn: "Payment Terms", type: "string", sample: "30 days rolling" },
            status: { labelAr: "حالة العقد", labelEn: "Contract Status", type: "enum", options: ["active", "expired", "terminated"], sample: "active" }
          }
        }
      }
    }
  },

  // Sensitive Field Registry (Privacy Masking)
  sensitiveNodes: [
    { key: "canViewPrices", labelAr: "عرض أسعار الوحدات والعملات", labelEn: "View Unit Prices & Currencies", descAr: "إخفاء أسعار الشراء وتكلفة البنود في الجداول والطباعة" },
    { key: "canViewTotals", labelAr: "عرض إجماليات الفواتير والضرائب", labelEn: "View Grand Totals & Tax Amounts", descAr: "إخفاء إجمالي مبالغ أوامر الشراء وأذون الاستلام" },
    { key: "canViewConfidentialDocs", labelAr: "الاطلاع على وثائق الموردين (ب.ض / س.ت)", labelEn: "View Vendor Legal Documents", descAr: "حجب ملفات البطاقات الضريبية والسجلات التجارية" },
    { key: "canViewOpeningBalances", labelAr: "عرض الأرصدة الافتتاحية وشروط الائتمان", labelEn: "View Opening Balances & Terms", descAr: "حجب كشوف حسابات الموردين وشروط الائتمان الخاصة" },
  ]
};

// Streamlined 2-Tier Base Permissions Matrix
export const DEFAULT_ROLE_PERMISSIONS = {
  general_admin: {
    modules: {
      dashboard: true,
      master_data: true,
      items: true,
      suppliers: true,
      clients: true,
      client_segments: true,
      categories: true,
      finished_products: true,
      finished_product_categories: true,
      bom: true,
      intermediate_bom: true,
      production_processes: true,
      warehouses: true,
      safes: true,
      bank_accounts: true,
      vehicles: true,
      production_workers: true,
      users: true,
      system_config: true,
      purchase_orders: true,
      goods_receipts: true,
      transfers: true,
      stock: true,
      stock_count: true,
      spare_parts_issue: true,
      liquid_tanks: true,
      liquid_storage: true,
      work_orders: true,
      faulty_fg: true,
      fg_inward: true,
      production_reports: true,
      finance: true,
      cash_safes: true,
      cash_safes_hub: true,
      custodies_advances: true,
      dues_tracking: true,
      banks: true,
      accounts: true,
      party_statements: true,
      financial_statements: true,
      sales: true,
      sales_orders: true,
      loading_plan: true,
      price_lists: true,
      client_contracts: true,
      admin_panel: true
    },
    actions: {
      canManageLoadingPlan: true,
      canCreate: true,
      canEdit: true,
      canApprove: true,
      canCreateVoucher: true,
      canExchangeChange: true,
      canAuditCount: true,
      canApproveVoucher: true,
      canReverseVoucher: true,
      canLiquidateCustody: true,
      canManageSafes: true,
      canSettleDues: true,
      canGenerateWhtNote: true,
      canConfigureAuthorizers: true,
      canRequestAdjustments: true,
      canCancel: true,
      canHardDelete: true,
      canOverrideSpecs: true,
      canClose: true,
      canVerify: true,
      canExport: true,
      canViewKardex: true,
      canAnalyzeQA: true,
      canApproveQA: true,
      canStartPump: true,
      canPauseResumePump: true,
      canFinishPump: true,
      canViewRStock: true,
      canSubmitHandover: true,
      canConfigureSerial: true,
      canViewAudit: true,
      canDelete: true,
      canInspect: true,
      canAccept: true,
      canReject: true,
      canRegisterPallet: true,
      canTransferFg: true,
      canLogScrap: true,
      canPrint: true,
      canConfirm: true,
      canResolve: true,
      canConfigureStorage: true,
      canAdminOverrideTanks: true,
      canResetCleanout: true,
      canPrintPalletThermal: true,
      canCloseShift: true,
      canAdminModifyPallet: true,
      canReverse: true,
      canBuildReworkProcess: true,
      canInheritStaff: true,
      canAutosaveRework: true
    },
    sensitive: {
      canViewPrices: true,
      canViewTotals: true,
      canViewConfidentialDocs: true,
      canViewOpeningBalances: true
    },
  },
  standard: {
    modules: {
      dashboard: true,
      master_data: true,
      items: true,
      suppliers: true,
      clients: true,
      client_segments: true,
      categories: true,
      finished_products: true,
      finished_product_categories: true,
      bom: true,
      intermediate_bom: true,
      production_processes: true,
      warehouses: true,
      safes: true,
      bank_accounts: true,
      vehicles: true,
      production_workers: true,
      users: false,
      system_config: false,
      purchase_orders: true,
      goods_receipts: true,
      transfers: true,
      stock: true,
      stock_count: true,
      spare_parts_issue: true,
      liquid_tanks: true,
      liquid_storage: true,
      work_orders: true,
      faulty_fg: true,
      fg_inward: true,
      production_reports: true,
      finance: true,
      cash_safes: true,
      cash_safes_hub: true,
      custodies_advances: true,
      dues_tracking: true,
      banks: true,
      accounts: true,
      party_statements: true,
      financial_statements: true,
      sales: true,
      sales_orders: true,
      loading_plan: true,
      price_lists: true,
      client_contracts: true,
      admin_panel: false
    },
    actions: {
      canManageLoadingPlan: true,
      canCreate: true,
      canEdit: true,
      canApprove: true,
      canCreateVoucher: true,
      canExchangeChange: true,
      canAuditCount: true,
      canApproveVoucher: false,
      canReverseVoucher: false,
      canLiquidateCustody: true,
      canManageSafes: false,
      canSettleDues: true,
      canGenerateWhtNote: true,
      canConfigureAuthorizers: false,
      canRequestAdjustments: true,
      canCancel: true,
      canHardDelete: true,
      canOverrideSpecs: true,
      canClose: true,
      canVerify: true,
      canExport: true,
      canViewKardex: true,
      canAnalyzeQA: true,
      canApproveQA: true,
      canStartPump: true,
      canPauseResumePump: true,
      canFinishPump: true,
      canSubmitHandover: true,
      canConfigureSerial: false,
      canViewAudit: true,
      canDelete: false,
      canInspect: true,
      canAccept: true,
      canReject: true,
      canRegisterPallet: true,
      canTransferFg: true,
      canLogScrap: true,
      canPrint: true,
      canConfirm: true,
      canResolve: true,
      canConfigureStorage: false,
      canAdminOverrideTanks: false,
      canResetCleanout: false,
      canPrintPalletThermal: true,
      canCloseShift: true,
      canAdminModifyPallet: false,
      canReverse: false,
      canBuildReworkProcess: true,
      canInheritStaff: true,
      canAutosaveRework: true
    },
    sensitive: {
      canViewPrices: true,
      canViewTotals: true,
      canViewConfidentialDocs: true,
      canViewOpeningBalances: true
    },
  },
};

/**
 * Universal Access Control Helper: Checks if a specific field is visible for the current user.
 * Enforces the Hierarchical Cascade Rule: if the parent tab is disabled in navigation (modules[tabId] === false),
 * all fields under that tab evaluate to false.
 */
export function canAccessField(permissions, tabId, fieldKey, currentUser = null) {
  if (currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin') return true;
  if (!permissions) return true;

  // CASCADE RULE: If parent tab is hidden in navigation, all its fields are inaccessible
  if (tabId && permissions.modules && permissions.modules[tabId] === false) {
    return false;
  }

  const specificKey = `${tabId}.${fieldKey}`;
  if (permissions.fields && permissions.fields[specificKey] !== undefined) {
    return permissions.fields[specificKey] === true;
  }

  if (fieldKey.toLowerCase().includes('price') && permissions.sensitive?.canViewPrices === false) return false;
  if ((fieldKey.toLowerCase().includes('total') || fieldKey.toLowerCase().includes('amount') || fieldKey.toLowerCase().includes('value')) && permissions.sensitive?.canViewTotals === false) return false;

  return true;
}

/**
 * Universal Action Authority Helper: Checks if a specific operational action is allowed for the current user.
 * Enforces the Hierarchical Cascade Rule: if the parent tab is disabled in navigation (modules[tabId] === false),
 * all operational actions under that tab evaluate to false.
 */
export function canAccessAction(permissions, tabId, actionKey, currentUser = null) {
  if (currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin') return true;
  if (!permissions) return true;

  // CASCADE RULE: If parent tab is hidden in navigation, all its actions are disallowed
  if (tabId && permissions.modules && permissions.modules[tabId] === false) {
    return false;
  }

  const specificKey = `${tabId}.${actionKey}`;
  if (permissions.actions && permissions.actions[specificKey] !== undefined) {
    return permissions.actions[specificKey] === true;
  }

  if (permissions.actions && permissions.actions[actionKey] !== undefined) {
    return permissions.actions[actionKey] === true;
  }

  return true;
}

/**
 * Hierarchical Permission Matrix Cascade Specification
 * Enforces strict parent-to-child deselection across AdminControlPanel, ScopedPermissionMatrixModal, and App.jsx.
 */
export const PERMISSION_MATRIX_CASCADE_SPECIFICATION = {
  ruleName: 'Tab Navigation Visibility Cascade Deselection',
  hierarchy: [
    'Level 1: Show Tab in Navigation (modules[tabId])',
    'Level 2: Operational Actions Authority (actions[tabId.actionKey])',
    'Level 3: Sensitive Field Privacy Masking (fields[tabId.fieldKey])'
  ],
  cascadeBehavior: {
    onTabDeselect: 'Automatically sets all actions[tabId.*] = false and fields[tabId.*] = false in userOverrides.',
    uiEnforcement: 'Subordinate action and field checkboxes are unchecked, visually dimmed (opacity-30/50), and disabled (cursor-not-allowed) while modules[tabId] === false.',
    runtimeEnforcement: 'effectivePermissions in App.jsx, AdminControlPanel.jsx, and ScopedPermissionMatrixModal.jsx forces all child actions and fields to false whenever modules[tabId] === false.'
  },
  enforcedComponents: [
    'src/components/AdminControlPanel.jsx',
    'src/components/ScopedPermissionMatrixModal.jsx',
    'src/App.jsx'
  ]
};

/**
 * Cross-App Reusable Row-Level Collaborative Comments & Per-Message Task Engine Specification
 */
export const COLLABORATIVE_COMMENTS_ARCHITECTURE = {
  version: '3.0-reusable-row-level',
  collection: 'record_comments',
  reusableComponents: {
    actionTrigger: 'src/components/comments/RecordCommentAction.jsx (<RecordCommentAction /> & useRecordComments)',
    popover: 'src/components/comments/CommentThreadPopover.jsx',
    contextMenu: 'src/components/comments/CommentContextMenu.jsx',
    globalSidebar: 'src/components/comments/GlobalCommentsDrawer.jsx (مركز المحادثات والمهام)',
    contextProvider: 'src/context/CommentContext.jsx',
    engine: 'src/utils/commentEngine.js'
  },
  designRules: {
    granularity: 'Strictly row/record-level (fieldKey: null, targetType: "row"). Modals are excluded.',
    dynamicGrouping: 'Grouped inside the 3-vertical-dots (⋮) menu when totalCount === 0; rendered inline on the row when totalCount > 0.',
    unreadCounter: 'Badge displays strictly the count of unread messages (unreadCount) for the current user and disappears once all messages are read.',
    contextMenuIconInheritance: 'Context menu message icon dynamically inherits the active status icon and color of the target record/row.',
    autoScrollOnOpen: 'Opening a thread marks unread messages as read and smoothly scrolls to the first unread message, or to the last message if all are read.',
    inlineMentionChips: 'Assigning a task via User+ or typing @ inserts a full-name @FullName chip into the message text to identify per-message assignees.',
    perMessageTaskResolution: 'Assigned users resolve tasks at the individual message level via "تم إنجاز المهمة", bidirectionally synced with user_actions_queue.',
    targetAudienceIsolation: 'Default target audience includes all users authorized for the target tab (isUserAuthorizedForTab). Unselected or unauthorized users receive zero alerts/notifications and cannot view restricted threads in the GlobalCommentsDrawer sidebar.'
  }
};

/**
 * Dual-Ledger Architecture Specification
 * Defines the dual-mode accounting paradigm and the discreet administrative unlock protocol.
 */
export const DUAL_LEDGER_ARCHITECTURE = {
  modes: {
    management: {
      key: 'management',
      labelAr: 'دفتر الأستاذ الإداري والشامل',
      labelEn: 'Comprehensive Managerial Ledger',
      descriptionAr: 'يشمل كافة الحركات التشغيلية والتجارية والنقدية للمنشأة، وهو الدفتر الافتراضي للتسجيل واتخاذ القرار.',
      descriptionEn: 'Default active ledger recording 100% of operational, cash, inventory, and management transactions.'
    },
    tax_official: {
      key: 'tax_official',
      labelAr: 'دفتر الأستاذ القانوني والضريبي',
      labelEn: 'Statutory Tax Ledger',
      descriptionAr: 'يقتصر حصراً على الفواتير والسندات ذات الصفة الضريبية الرسمية المستوفاة لضريبة القيمة المضافة.',
      descriptionEn: 'Statutory audit-ready ledger filtering strictly for official VAT invoices, tax receipts, and registered vouchers.'
    }
  },
  accessControl: {
    uiPattern: 'SecretLockButton',
    triggerMechanism: 'continuous_long_press_2000ms',
    promptComponent: 'SecretDoorModal',
    passcodeConfigPath: 'system_config/ledger_security.securityPin',
    defaultPasscode: '778899',
    securityGuidelines: [
      'Zero suspicious wording in UI (avoid public labels like official, tax, ضريبي, رسمي).',
      'Discreet lock icon button only.',
      'Single click performs nothing; 2000ms long press opens PIN modal.',
      'Passcode managed and updated via Admin Control Panel -> Security tab.'
    ]
  }
};

/**
 * Operational-Financial Integration Rules
 * Single Source of Truth for automatic balanced double-entry generation from all operational events.
 */
export const FINANCIAL_INTEGRATION_RULES = {
  purchases: {
    goods_receipt: {
      event: 'GRN Confirmation (إذن استلام خامات ومشتريات)',
      isOfficialWhen: 'grn.isTaxOfficial === true',
      entries: [
        { type: 'debit', accountKey: 'inventoryRawMaterials', amount: 'subtotal', desc: 'مخزون خامات ومستلزمات إنتاج' },
        { type: 'debit', accountKey: 'vatInput', amount: 'totalVat', condition: 'isTaxOfficial && totalVat > 0', desc: 'ضريبة القيمة المضافة (مدخلات 14%)' },
        { type: 'credit', accountKey: 'accountsPayable', amount: 'netPayable', subLedger: 'supplier', desc: 'الموردين - التزامات تجارية' },
        { type: 'credit', accountKey: 'whtPayable', amount: 'totalWht', condition: 'isTaxOfficial && totalWht > 0', desc: 'ضريبة الخصم والإضافة (أ.ت.ص 1% مستحقة)' }
      ],
      nonTaxableRule: 'When isTaxOfficial is false, totalVat = 0 and totalWht = 0 strictly.'
    },
    goods_receipt_return: {
      event: 'GRN Reversal / Return (إذن مرتجع مشتريات)',
      entries: [
        { type: 'debit', accountKey: 'accountsPayable', amount: 'netPayable', subLedger: 'supplier', desc: 'تخفيض التزام المورد بالمرتجع' },
        { type: 'debit', accountKey: 'whtPayable', amount: 'totalWht', condition: 'isTaxOfficial && totalWht > 0', desc: 'عكس ضريبة الخصم والإضافة' },
        { type: 'credit', accountKey: 'inventoryRawMaterials', amount: 'subtotal', desc: 'تخفيض مخزون الخامات المرتجعة' },
        { type: 'credit', accountKey: 'vatInput', amount: 'totalVat', condition: 'isTaxOfficial && totalVat > 0', desc: 'عكس ضريبة القيمة المضافة' }
      ]
    }
  },
  treasury: {
    cash_receipt: {
      event: 'Cash Receipt Voucher (CRV - سند قبض وتحصيل نقدي)',
      entries: [
        { type: 'debit', accountKey: 'safeMain', amount: 'amount', subLedger: 'safe', desc: 'النقدية بالخزينة المستلمة' },
        { type: 'credit', accountKey: 'accountsReceivable', amount: 'amount', subLedger: 'party', desc: 'العميل أو الطرف المسدد' }
      ]
    },
    cash_disbursement: {
      event: 'Cash Disbursement Voucher (CDV - سند صرف نقدي)',
      entries: [
        { type: 'debit', accountKey: 'accountsPayable_or_expense', amount: 'amount', subLedger: 'party', desc: 'المورد أو المصروف المدفوع' },
        { type: 'credit', accountKey: 'safeMain', amount: 'amount', subLedger: 'safe', desc: 'النقدية بالخزينة المنصرفة' }
      ]
    },
    custody_advance: {
      event: 'Custody Advance Issue (ADV - صرف سلفة أو عهدة مؤقتة)',
      entries: [
        { type: 'debit', accountKey: 'custodyReceivable', amount: 'amount', subLedger: 'worker', desc: 'العهد والسلف المؤقتة للموظف' },
        { type: 'credit', accountKey: 'safeMain', amount: 'amount', subLedger: 'safe', desc: 'النقدية بالخزينة المنصرفة' }
      ]
    },
    custody_liquidation: {
      event: 'Custody Liquidation (LIQ - تسوية واعتماد مصروفات العهدة)',
      entries: [
        { type: 'debit', accountKey: 'generalExpenses', amount: 'amount', subLedger: 'cost_center', desc: 'مصروفات تشغيلية وعمومية' },
        { type: 'credit', accountKey: 'custodyReceivable', amount: 'amount', subLedger: 'worker', desc: 'تسوية وإخلاء طرف عهدة الموظف' }
      ]
    }
  },
  production: {
    work_order_completion: {
      event: 'Finished Goods Inward (توريد منتج تام للمخزن)',
      entries: [
        { type: 'debit', accountKey: 'inventoryFinishedGoods', amount: 'totalCost', desc: 'مخزون الإنتاج التام' },
        { type: 'credit', accountKey: 'inventoryWIP', amount: 'totalCost', desc: 'حساب تشغيل الإنتاج تحت التشغيل (WIP)' }
      ]
    }
  },
  adjustments: {
    manual_journal_entry: {
      event: 'Manual Journal Entry (MJE - قيد تسوية محاسبي يدوي)',
      validationRule: 'Total Debits strictly equal Total Credits (Zero-Variance Enforcement)',
      components: ['SearchableSelect for GL Accounts', 'SearchableSelect for Sub-Ledgers', 'Dynamic Cost Centers with inline addition']
    }
  }
};

/**
 * Native Routing & Live State Synchronization Specification
 * Guarantees synchronous state restoration across all module screens and sub-tabs.
 */
export const UNIVERSAL_REFRESH_SPECIFICATION = {
  pattern: 'Dynamic Scoped URL Hash Routing & Native Reload Support',
  hashRoutingRule: 'window.location.hash dynamically maintains #tabId?subTab=subTabId&module=moduleId with clean parameter scoping across tab switches',
  sessionStorageFallback: 'tawoos_last_active_tab / tawoos_last_active_module',
  reloadBehavior: 'Synchronous getInitialRoute() evaluation on startup natively restores exact active screen and sub-tab on browser reload (F5 / Cmd+R) and mobile pull-to-refresh.'
};

/**
 * Automatically extracts all Master Collections registered under `master_data.tabs`
 * in APP_ARCHITECTURE, plus core system collections (`users`, `system_config`, `chart_of_accounts`).
 * Guarantees zero hardcoding: any new tab added to the Master Database module is automatically
 * recognized as a Master Collection everywhere in the ERP (telemetry, backup, and purge immunity).
 * 
 * @param {object} architecture - APP_ARCHITECTURE object
 * @returns {string[]} Array of unique master collection names
 */
export function getMasterCollectionsRegistry(architecture = APP_ARCHITECTURE) {
  const masterTabs = architecture?.modules?.master_data?.tabs || {};
  const collections = new Set([
    'users',
    'system_config',
    'chart_of_accounts',
    'clients',
    'client_segments',
    'cash_safes',
    'corporate_banks',
    'bank_accounts',
    'floor_liquid_vessels'
  ]);
  Object.values(masterTabs).forEach((tab) => {
    if (tab && tab.collection) {
      collections.add(tab.collection);
    }
  });
  return Array.from(collections);
}

/**
 * Checks whether a given collection name belongs to the Master Collections registry.
 * 
 * @param {string} collectionName 
 * @param {object} architecture 
 * @returns {boolean}
 */
export function isMasterCollection(collectionName, architecture = APP_ARCHITECTURE) {
  if (!collectionName) return false;
  const masterSet = new Set(getMasterCollectionsRegistry(architecture));
  return masterSet.has(collectionName);
}

/**
 * Finance Dues & Installments Tracking Architecture Specification
 * Defines payment terms inheritance, PO Advance anti-repayment protection,
 * chronological multi-record batch settlement, and A4 Dual-Half 1% WHT Certificates.
 */
export const DUES_TRACKING_ARCHITECTURE = {
  tabId: 'dues_tracking',
  module: 'finance',
  subtabs: ['suppliers', 'clients'],
  collections: ['dues_settlements', 'dues_batches', 'wht_notes'],
  rules: {
    paymentTermsInheritance: 'Each PO, GRN (+), and RTN (-) inherits and snapshots paymentTermsSnapshot (1..4 tranches with percent %, days grace period, and baseDate: advance_payment | delivery_date | end_of_month) and whtComplianceSnapshot from Supplier Master.',
    independentReturns: 'Each RTN (Return Note) is treated independently in terms of due dates and negative netPayable tranches according to its VAT/WHT assignment, regardless of LOT/price linkedGrnId.',
    poAdvanceAntiRepayment: 'Approved POs support scheduled or ad-hoc Advance Payments before delivery. Upon GRN receipt for a PO, any paid PO Advance automatically offsets/marks incoming GRN tranches as Pre-Paid via PO Advance (immediately reducing remaining payable balance), and any unpaid PO Advance is absorbed into the GRN tranches so open dues never duplicate.',
    strictOverpaymentPrevention: 'Payment release amounts are strictly capped at each record’s remaining balance (0 < release <= remainingAmount). Overpayment is blocked and clamped in real time.',
    chronologicalBatchSettlement: 'Batch Payment Modal allows multi-selecting unpaid/incomplete records for a supplier, displaying them sorted chronologically by Due Date ascending with read-only Due Date, read-only Net Remaining, and editable Amount to Release per row (supporting Partial Closure on any specific row or the furthest row).',
    dualHalfWhtCertificate: 'WhtNotePrintSlip.jsx generates a sequential internal WHT Serial No. (WHT-YYYY-XXXX) per taxable Invoice/Credit Note and prints an A4 portrait page split into 2 identical halves separated by a dashed cut line (Top Half: Original stamped & handed to supplier; Bottom Half: Archive copy signed/stamped by supplier confirming receipt of original).'
  }
};

/**
 * 100% Setup-Driven Financial Statements & Multi-Level COA Hierarchy Architecture
 */
export const SETUP_DRIVEN_FINANCIAL_STATEMENTS_ARCHITECTURE = {
  version: '2.0-setup-driven-vertical-rollup',
  csvHeaders16: [
    'code', 'nameAr', 'nameEn', 'level', 'type', 'parentCode',
    'statement', 'reportCategory', 'statementEffect', 'nature',
    'cashFlowCategory', 'subType', 'requiresCostCenter', 'displayOrder',
    'descriptionAr', 'descriptionEn'
  ],
  rules: {
    zeroHardcodedRouting: 'All account placement in Income Statement, Vertical Balance Sheet, Cash Flow, and Cost Centers is driven 100% by account setup (statement, reportCategory, statementEffect, nature, cashFlowCategory, parentCode, level, displayOrder) with zero hardcoded account code prefixes.',
    contraAccountMathematicalEffect: 'Each account defines statementEffect ("add" | "deduct") synced with its nature relative to the target section’s normalNature. Contra-accounts (e.g. Accumulated Depreciation 10102/1010202..1010211, Sales Returns/Discounts) deduct from their section total and render in parentheses (amount).',
    verticalBalanceSheet: 'Balance Sheet is structured vertically in a unified full-width table (I. Assets: Fixed/Non-Current + Current -> Total Assets; II. Liabilities & Equity: Current Liabilities + Long-Term Liabilities + Shareholders Equity including Prior Retained Net Income & Current Period Net Income -> Total Liabilities & Equity).',
    incomeStatementOperatingProfitOrder: 'Financing & Bank Expenses (Section 5) is placed directly above Operating Profit alongside Selling & Distribution Expenses (Section 3) and General & Administrative Expenses (Section 4). Operating Profit = Gross Profit - (Selling + Admin + Financing). Section 6 (Other Non-Operating Revenue / Expense Net) sits below Operating Profit and flows into Net Income / (Loss) Before Tax.',
    strictChildAccountAdherence: 'Whenever a transaction from any source targets a specific analytical child account, the posting engine, Trial Balance, and sub-ledgers adhere strictly to this child account code everywhere without collapsing to the parent control account.',
    universalParentRollup: 'Parent accounts automatically calculate and display the bottom-up sum of their children across debit, credit, opening, period, and net balances, while grand totals aggregate leaf accounts only to guarantee 100% mathematical equality (Debit = Credit) with zero double counting.',
    hierarchicalVisualDistinction: 'Trial Balance visual hierarchy uses level-based indentation, tree branch glyphs (├──, └──), outline level badges (L1, L2, L3, L4+), and typographic weight scaling without solid row background colors.',
    doubleEntryLegResolution: 'Safe posting legs resolve and display the source vault name and safe ID, while the counter-leg explicitly reflects both the GL Control Account and Sub-Account with code and name.',
    multiLevelRollup: 'Supports 5+ hierarchy levels (level 1..5+) with an interactive Display Level selector (summary, 2, 3, 4, all) and Show/Hide Zero Balances toggle. Deeper child balances and drilldown transactions roll up bottom-up into their visible parent at the selected level without double-counting.',
    strictScopeAndHorizons: 'Scope (Official/Standard vs Master/Consolidated) is enforced strictly at the posted transaction/journal entry level. Balance Sheet computes cumulative balances up to endDate; Income Statement and Cost Centers compute periodic balances within [startDate, endDate].'
  }
};

/**
 * Relational Cascade Purge & Master Immunity Architecture Specification
 */
export const RELATIONAL_CASCADE_PURGE_ARCHITECTURE = {
  version: '3.0-relational-cascade',
  rules: {
    operationalOnlyImmunity: 'Wipes all operational/transactional collections while 100% preserving Master Data collections and Chart of Accounts setups, resetting transient balances on items, cash_safes, corporate_banks, and floor_liquid_vessels to 0.',
    targetedCascadePurge: 'Clearing any specific operational module selectively deletes its auto-generated records in shared collections (stock_ledger, stock_transfers, production_transformations, journal_entries, cash_transactions, dues_settlements, wht_notes, record_comments, user_actions_queue, system_notifications) without wiping unrelated records.',
    liveBalanceRecalculation: 'After a targeted cascade purge, items.stock is dynamically recalculated from remaining stock_ledger records, and cash_safes / corporate_banks balances are dynamically recalculated from remaining posted cash_transactions.'
  }
};