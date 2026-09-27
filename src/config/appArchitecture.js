/**
 * Central Metadata Blueprint (app_architecture)
 * Single Source of Truth for:
 * 1. UI Navigation & Role-Based Permissions (RBAC)
 * 2. Dynamic Universal CSV Import / Template Generation
 * 3. Dynamic Database Purge & Factory Reset Cascades
 * 4. Sensitive Field Privacy Masking
 * 5. Single Source of Truth (SSOT) Inventory Ledger Taxonomy
 */

export const APP_ARCHITECTURE = {
  version: "2.7.0",
  lastUpdated: "2026-09-19",
  
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
          ],
          fields: {
            processCode: { labelAr: "كود المسار", labelEn: "Process Code", type: "string", required: true, sample: "Proc.101" },
            nameAr: { labelAr: "اسم المسار", labelEn: "Process Name", type: "string", required: true, sample: "خل اوتو" },
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
          resetCascades: ["staged_floor_pallets", "staged_floor_materials", "production_breaks", "production_workers"],
          actions: [
            { key: "canCreate", labelAr: "إدراج صنف جديد بالخطة", labelEn: "Assign to Plan" },
            { key: "canEdit", labelAr: "تعديل جدول وكميات التشغيل", labelEn: "Edit Plan Order" },
            { key: "canCancel", labelAr: "إلغاء أمر التشغيل وحذف الخطة", labelEn: "Cancel Work Order" },
            { key: "canRegisterPallet", labelAr: "تسجيل واعتماد باليتات الصالة وإصدار الجواز", labelEn: "Register Floor Pallet & Passport" },
            { key: "canTransferFg", labelAr: "ترحيل ونقل الباليتات لمستودع التام (TRN)", labelEn: "Transfer Pallets to FG Warehouse" },
            { key: "canLogScrap", labelAr: "إثبات الهالك وتسوية التشغيل وإعادة التدوير", labelEn: "Log Floor Scrap & Rework" },
          ],
          fields: {
            id: { labelAr: "رقم أمر التشغيل", labelEn: "Order ID", type: "string", required: true, sample: "MO-20260917-01" },
            planDate: { labelAr: "تاريخ التشغيل المخطط", labelEn: "Target Plan Date", type: "date", required: true, sample: "2026-09-17" },
            finishedProductId: { labelAr: "كود المنتج التام", labelEn: "Target SKU", type: "string", required: true, sample: "FG-101" },
            plannedQtyLarge: { labelAr: "الكمية المخططة بالكرتونة", labelEn: "Planned Cartons", type: "number", required: true, sample: 100 },
            totalProducedQtyLarge: { labelAr: "الإنتاج الفعلي بالكرتونة", labelEn: "Produced Cartons", type: "number", sample: 100 },
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
      categories: true,
      finished_products: true,
      finished_product_categories: true,
      bom: true,
      intermediate_bom: true,
      production_processes: true,
      warehouses: true,
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
      admin_panel: true
    },
    actions: {
      canCreate: true,
      canEdit: true,
      canApprove: true,
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
      canResetCleanout: true
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
      categories: true,
      finished_products: true,
      finished_product_categories: true,
      bom: true,
      intermediate_bom: true,
      production_processes: true,
      warehouses: true,
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
      admin_panel: false
    },
    actions: {
      canCreate: true,
      canEdit: true,
      canApprove: true,
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
      canResetCleanout: false
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
 * Universal Access Control Helper: Checks if a specific field is visible for the current user
 */
export function canAccessField(permissions, tabId, fieldKey, currentUser = null) {
  if (currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin') return true;
  if (!permissions) return true;

  const specificKey = `${tabId}.${fieldKey}`;
  if (permissions.fields && permissions.fields[specificKey] !== undefined) {
    return permissions.fields[specificKey] === true;
  }

  if (fieldKey.toLowerCase().includes('price') && permissions.sensitive?.canViewPrices === false) return false;
  if ((fieldKey.toLowerCase().includes('total') || fieldKey.toLowerCase().includes('amount') || fieldKey.toLowerCase().includes('value')) && permissions.sensitive?.canViewTotals === false) return false;

  return true;
}